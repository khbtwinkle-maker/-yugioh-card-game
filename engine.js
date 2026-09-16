// 게임 상태와 규칙 처리

const LP_START = 4000;
const FIELD_SIZE = 3;
const SPELL_FIELD_SIZE = 3;
const STARTING_HAND = 5;

function shuffle(array) {
  const arr = array.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

let uidCounter = 0;
function makeInstance(cardDef) {
  return {
    ...cardDef,
    uid: 'c' + (uidCounter++),
    currentAtk: cardDef.atk,
    hasAttackedThisTurn: false,
    effectNegated: false,
    position: 'attack',
    faceDown: false,
    setPly: 0,
    positionChangedThisTurn: false,
  };
}

function createDeck() {
  return shuffle(CARD_POOL).map(makeInstance);
}

function createPlayerState() {
  return {
    lp: LP_START,
    deck: createDeck(),
    hand: [],
    field: [null, null, null],
    spellField: [null, null, null],
    graveyard: [],
    hasSummonedThisTurn: false,
    hasCastSpellThisTurn: false,
  };
}

function createGameState() {
  return {
    player: createPlayerState(),
    ai: createPlayerState(),
    turn: 'player',
    phase: 'main',
    turnCount: 1,
    ply: 1,
    log: [],
    gameOver: false,
    winner: null,
  };
}

function addLog(state, msg) {
  state.log.push(msg);
  if (state.log.length > 50) state.log.shift();
}

function otherSide(side) {
  return side === 'player' ? 'ai' : 'player';
}

function sideName(side) {
  return side === 'player' ? '나' : '상대';
}

function requiredTributes(level) {
  const lv = level || 0;
  if (lv >= 7) return 2;
  if (lv >= 5) return 1;
  return 0;
}

function drawCard(state, side) {
  const p = state[side];
  if (p.deck.length === 0) return null;
  const card = p.deck.shift();
  p.hand.push(card);
  addLog(state, `${sideName(side)}가 카드를 뽑았습니다.`);
  return card;
}

function startTurn(state, side) {
  state.turn = side;
  state.ply++;
  const p = state[side];
  p.hasSummonedThisTurn = false;
  p.hasCastSpellThisTurn = false;
  p.field.forEach((m) => {
    if (m) {
      m.hasAttackedThisTurn = false;
      m.positionChangedThisTurn = false;
    }
  });
  drawCard(state, side);
  state.phase = 'main';
  addLog(state, `--- ${sideName(side)}의 턴 ---`);
}

function canSummon(state, side) {
  const p = state[side];
  return !p.hasSummonedThisTurn;
}

// ---- 함정 자동 발동 ----

function trapMatches(trap, eventType) {
  switch (trap.trapEffect) {
    case 'destroyAttacker':
    case 'reflectDamage':
    case 'healOnAttack':
      return eventType === 'declareAttack';
    case 'destroySummoned':
    case 'zeroSummonedAtk':
      return eventType === 'summon';
    case 'negateSpell':
    case 'negateSpellDamage':
      return eventType === 'spellActivate';
    case 'specialSummonFromDeck':
      return eventType === 'declareAttack' || eventType === 'summon';
    default:
      return false;
  }
}

function resolveTrapEffect(state, trap, eventType, payload) {
  switch (trap.trapEffect) {
    case 'destroyAttacker': {
      const atkP = state[payload.attackerSide];
      const attacker = atkP.field[payload.attackerFieldIndex];
      if (attacker) {
        atkP.field[payload.attackerFieldIndex] = null;
        atkP.graveyard.push(attacker);
        addLog(state, `${trap.name}의 효과로 ${attacker.name}이(가) 파괴되었습니다.`);
      }
      return { cancelAttack: true };
    }
    case 'reflectDamage': {
      const atkP = state[payload.attackerSide];
      const dmg = payload.attacker ? payload.attacker.currentAtk : 0;
      atkP.lp = Math.max(0, atkP.lp - dmg);
      addLog(state, `${trap.name}의 효과로 상대에게 ${dmg} 데미지!`);
      checkGameOver(state);
      return { cancelAttack: false };
    }
    case 'destroySummoned': {
      const sp = state[payload.summonSide];
      const summoned = sp.field[payload.fieldIndex];
      if (summoned) {
        sp.field[payload.fieldIndex] = null;
        sp.graveyard.push(summoned);
        addLog(state, `${trap.name}의 효과로 ${summoned.name}이(가) 파괴되었습니다.`);
      }
      return {};
    }
    case 'negateSpell':
      addLog(state, `${trap.name}의 효과로 마법 발동이 무효화되었습니다.`);
      return { cancelSpell: true };
    case 'healOnAttack': {
      const ownerSide = otherSide(payload.attackerSide);
      state[ownerSide].lp += trap.trapValue || 0;
      addLog(state, `${trap.name}의 효과로 라이프 포인트를 ${trap.trapValue || 0} 회복했습니다.`);
      return { cancelAttack: false };
    }
    case 'zeroSummonedAtk': {
      const sp = state[payload.summonSide];
      const summoned = sp.field[payload.fieldIndex];
      if (summoned) {
        summoned.currentAtk = 0;
        addLog(state, `${trap.name}의 효과로 ${summoned.name}의 공격력이 0이 되었습니다.`);
      }
      return {};
    }
    case 'specialSummonFromDeck': {
      const ownerSide = payload.summonSide ? otherSide(payload.summonSide) : otherSide(payload.attackerSide);
      const ok = specialSummonFromDeckMaxLevel(state, ownerSide, 4);
      if (ok) addLog(state, `${trap.name}의 효과로 덱에서 몬스터를 특수 소환했습니다.`);
      return {};
    }
    case 'negateSpellDamage': {
      addLog(state, `${trap.name}의 효과로 마법 발동이 무효화되었습니다.`);
      state[payload.casterSide].lp = Math.max(0, state[payload.casterSide].lp - (trap.trapValue || 0));
      addLog(state, `${trap.name}의 효과로 상대에게 ${trap.trapValue || 0} 데미지!`);
      checkGameOver(state);
      return { cancelSpell: true };
    }
    default:
      return {};
  }
}

function checkTrapResponse(state, actingSide, eventType, payload) {
  const opp = state[otherSide(actingSide)];
  const idx = opp.spellField.findIndex(
    (c) => c && c.type === 'trap' && c.faceDown && c.setPly < state.ply && trapMatches(c, eventType)
  );
  if (idx === -1) return {};
  const trap = opp.spellField[idx];
  opp.spellField[idx] = null;
  addLog(state, `${sideName(otherSide(actingSide))}의 함정 ${trap.name} 발동!`);
  const result = resolveTrapEffect(state, trap, eventType, payload) || {};
  trap.faceDown = false;
  opp.graveyard.push(trap);
  return result;
}

// ---- 소환 ----

function summonMonster(state, side, handIndex, fieldIndex, position, tributeIndices) {
  const p = state[side];
  if (p.hasSummonedThisTurn) return false;
  const card = p.hand[handIndex];
  if (!card || card.type !== 'monster') return false;

  const need = requiredTributes(card.level);
  const tributes = Array.isArray(tributeIndices) ? tributeIndices : [];
  if (tributes.length !== need) return false;
  if (new Set(tributes).size !== tributes.length) return false;
  for (const ti of tributes) {
    if (!p.field[ti]) return false;
  }

  const tributedCards = tributes.map((ti) => p.field[ti]);
  tributes.forEach((ti) => {
    p.graveyard.push(p.field[ti]);
    p.field[ti] = null;
  });
  if (tributedCards.length) {
    addLog(state, `${sideName(side)}가 ${tributedCards.map((c) => c.name).join(', ')}을(를) 릴리스했습니다.`);
  }

  let destIdx = fieldIndex;
  if (destIdx === undefined || destIdx === null || destIdx < 0 || p.field[destIdx] !== null) {
    destIdx = p.field.findIndex((z) => z === null);
  }
  if (destIdx === -1) {
    // 되돌리기 (릴리스가 자리를 비워주므로 정상 흐름에서는 발생하지 않음)
    tributedCards.forEach((c, i) => { p.field[tributes[i]] = c; });
    p.graveyard.splice(p.graveyard.length - tributedCards.length, tributedCards.length);
    return false;
  }

  p.hand.splice(handIndex, 1);
  const pos = position === 'defense' ? 'defense' : 'attack';
  card.position = pos;
  card.faceDown = pos === 'defense';
  card.setPly = state.ply;
  card.positionChangedThisTurn = false;
  card.hasAttackedThisTurn = false;
  p.field[destIdx] = card;
  p.hasSummonedThisTurn = true;

  if (pos === 'defense') {
    addLog(state, `${sideName(side)}가 몬스터를 수비 표시로 세트했습니다.`);
  } else {
    addLog(state, `${sideName(side)}가 ${card.name}을(를) 공격 표시로 소환했습니다.`);
  }

  checkTrapResponse(state, side, 'summon', { summonSide: side, fieldIndex: destIdx });
  if (pos === 'attack' && p.field[destIdx] === card) {
    triggerOnSummon(state, side, destIdx, false);
  }
  checkGameOver(state);
  return true;
}

function changePosition(state, side, fieldIndex) {
  const p = state[side];
  const card = p.field[fieldIndex];
  if (!card) return false;
  if (card.setPly === state.ply) return false;
  if (card.hasAttackedThisTurn) return false;
  if (card.positionChangedThisTurn) return false;
  card.position = card.position === 'attack' ? 'defense' : 'attack';
  card.faceDown = false;
  card.positionChangedThisTurn = true;
  addLog(
    state,
    `${sideName(side)}가 ${card.name}의 표시 형식을 ${card.position === 'attack' ? '공격' : '수비'} 표시로 변경했습니다.`
  );
  return true;
}

// ---- 마법/함정 ----

function resolveSpellEffect(state, side, card, targetFieldIndex) {
  const p = state[side];
  const opp = state[otherSide(side)];
  switch (card.effect) {
    case 'damage':
      opp.lp = Math.max(0, opp.lp - card.value);
      addLog(state, `${sideName(side)}의 ${card.name} 효과! 상대에게 ${card.value} 데미지.`);
      return true;
    case 'heal':
      p.lp += card.value;
      addLog(state, `${sideName(side)}의 ${card.name} 효과! 라이프 ${card.value} 회복.`);
      return true;
    case 'buff': {
      if (targetFieldIndex === undefined || targetFieldIndex === null || !p.field[targetFieldIndex]) return false;
      p.field[targetFieldIndex].currentAtk += card.value;
      addLog(state, `${sideName(side)}의 ${card.name} 효과! ${p.field[targetFieldIndex].name}의 공격력이 ${card.value} 상승.`);
      return true;
    }
    case 'draw':
      for (let i = 0; i < card.value; i++) drawCard(state, side);
      addLog(state, `${sideName(side)}의 ${card.name} 효과! 카드 ${card.value}장 드로우.`);
      return true;
    case 'tutor':
      tutorToHand(state, side);
      return true;
    case 'tutorDraw':
      tutorToHand(state, side);
      drawCard(state, side);
      return true;
    case 'ssDeck':
      specialSummonFromDeckMaxLevel(state, side, 4);
      return true;
    case 'ssHand':
      specialSummonFromHand(state, side);
      return true;
    case 'mill':
      millFromDeck(state, side);
      return true;
    default:
      return false;
  }
}

function castSpell(state, side, handIndex, targetFieldIndex) {
  const p = state[side];
  const card = p.hand[handIndex];
  if (!card || card.type !== 'spell') return false;
  if (p.hasCastSpellThisTurn) return false;

  const trapResult = checkTrapResponse(state, side, 'spellActivate', { casterSide: side, spell: card });
  if (trapResult.cancelSpell) {
    p.hand.splice(handIndex, 1);
    p.graveyard.push(card);
    p.hasCastSpellThisTurn = true;
    checkGameOver(state);
    return true;
  }
  // Remove the spell from hand BEFORE resolving its effect: some effects (e.g. ssHand)
  // mutate p.hand themselves, which would shift handIndex out from under a post-hoc splice.
  p.hand.splice(handIndex, 1);
  if (!resolveSpellEffect(state, side, card, targetFieldIndex)) {
    p.hand.splice(handIndex, 0, card);
    return false;
  }
  p.graveyard.push(card);
  p.hasCastSpellThisTurn = true;
  checkGameOver(state);
  return true;
}

function setSpellOrTrap(state, side, handIndex, spellFieldIndex) {
  const p = state[side];
  const card = p.hand[handIndex];
  if (!card || (card.type !== 'spell' && card.type !== 'trap')) return false;
  let destIdx = spellFieldIndex;
  if (destIdx === undefined || destIdx === null || destIdx < 0 || p.spellField[destIdx] !== null) {
    destIdx = p.spellField.findIndex((z) => z === null);
  }
  if (destIdx === -1) return false;
  p.hand.splice(handIndex, 1);
  card.faceDown = true;
  card.setPly = state.ply;
  p.spellField[destIdx] = card;
  addLog(state, `${sideName(side)}가 카드 1장을 세트했습니다.`);
  return true;
}

function activateSetSpell(state, side, spellFieldIndex, targetFieldIndex) {
  const p = state[side];
  const card = p.spellField[spellFieldIndex];
  if (!card || card.type !== 'spell') return false;
  if (p.hasCastSpellThisTurn) return false;

  const trapResult = checkTrapResponse(state, side, 'spellActivate', { casterSide: side, spell: card });
  if (trapResult.cancelSpell) {
    p.spellField[spellFieldIndex] = null;
    p.graveyard.push(card);
    p.hasCastSpellThisTurn = true;
    checkGameOver(state);
    return true;
  }
  if (!resolveSpellEffect(state, side, card, targetFieldIndex)) return false;
  p.spellField[spellFieldIndex] = null;
  p.graveyard.push(card);
  p.hasCastSpellThisTurn = true;
  checkGameOver(state);
  return true;
}

// ---- 몬스터 효과 ----

function pickStrongestMonster(sideState) {
  let best = null;
  sideState.field.forEach((m) => {
    if (m && (!best || m.currentAtk > best.currentAtk)) best = m;
  });
  return best;
}

function specialSummon(state, side, card) {
  const p = state[side];
  const idx = p.field.findIndex((z) => z === null);
  if (idx === -1) return false;
  card.position = 'attack';
  card.faceDown = false;
  card.setPly = state.ply;
  card.positionChangedThisTurn = false;
  card.hasAttackedThisTurn = false;
  p.field[idx] = card;
  addLog(state, `${sideName(side)}가 ${card.name}을(를) 특수 소환했습니다.`);
  checkTrapResponse(state, side, 'summon', { summonSide: side, fieldIndex: idx });
  if (p.field[idx] === card) {
    triggerOnSummon(state, side, idx, true);
  }
  return true;
}

function specialSummonFromHand(state, side) {
  const p = state[side];
  const idx = p.hand.findIndex((c) => c.type === 'monster');
  if (idx === -1) return;
  const [card] = p.hand.splice(idx, 1);
  if (!specialSummon(state, side, card)) p.hand.push(card);
}

function specialSummonFromGraveyard(state, side, excludeUid) {
  const p = state[side];
  const idx = p.graveyard.findIndex((c) => c.type === 'monster' && c.uid !== excludeUid);
  if (idx === -1) return;
  const [card] = p.graveyard.splice(idx, 1);
  card.currentAtk = card.atk;
  card.hasAttackedThisTurn = false;
  card.effectNegated = false;
  if (!specialSummon(state, side, card)) p.graveyard.push(card);
}

function specialSummonFromDeck(state, side) {
  const p = state[side];
  const idx = p.deck.findIndex((c) => c.type === 'monster');
  if (idx === -1) return;
  const [card] = p.deck.splice(idx, 1);
  if (!specialSummon(state, side, card)) p.deck.push(card);
}

function specialSummonFromDeckMaxLevel(state, side, maxLevel) {
  const p = state[side];
  const idx = p.deck.findIndex((c) => c.type === 'monster' && (c.level || 0) <= maxLevel);
  if (idx === -1) return false;
  const [card] = p.deck.splice(idx, 1);
  if (!specialSummon(state, side, card)) {
    p.deck.push(card);
    return false;
  }
  return true;
}

function tutorToHand(state, side) {
  const p = state[side];
  const idx = p.deck.findIndex((c) => c.type === 'monster');
  if (idx === -1) return false;
  const [card] = p.deck.splice(idx, 1);
  p.hand.push(card);
  addLog(state, `${sideName(side)}가 덱에서 ${card.name}을(를) 패에 넣었습니다.`);
  return true;
}

function millFromDeck(state, side) {
  const p = state[side];
  if (p.deck.length === 0) return false;
  const card = p.deck.shift();
  p.graveyard.push(card);
  addLog(state, `${sideName(side)}가 덱에서 ${card.name}을(를) 묘지로 보냈습니다.`);
  return true;
}

function triggerOnSummon(state, side, fieldIndex, special) {
  const p = state[side];
  const opp = state[otherSide(side)];
  const card = p.field[fieldIndex];
  if (!card || card.effectNegated) return;

  switch (card.id) {
    case 'm01': { // 흑염의 드래곤: 소환 성공 시 상대 필드 몬스터 전멸
      let destroyed = false;
      opp.field.forEach((m, i) => {
        if (m) { opp.graveyard.push(m); opp.field[i] = null; destroyed = true; }
      });
      if (destroyed) addLog(state, `${card.name}의 효과! 상대 필드의 몬스터를 모두 파괴했습니다.`);
      break;
    }
    case 'm03': { // 심연의 마물: 특수 소환 성공 시 상대 몬스터 1장 효과 무효화
      if (!special) break;
      const target = pickStrongestMonster(opp);
      if (target) {
        target.effectNegated = true;
        addLog(state, `${card.name}의 효과! ${target.name}의 효과가 무효화되었습니다.`);
      }
      break;
    }
    case 'm05': { // 대지의 골렘: 일반 소환 성공 시 덱 맨 위 1장을 묘지로
      if (special) break;
      if (p.deck.length > 0) {
        const milled = p.deck.shift();
        p.graveyard.push(milled);
        addLog(state, `${card.name}의 효과! 덱에서 ${milled.name}을(를) 묘지로 보냈습니다.`);
      }
      break;
    }
    case 'm06': { // 바람의 요정: 일반 소환 성공 시 묘지의 마법 카드 1장 재발동
      if (special) break;
      const spells = p.graveyard.filter((c) => c.type === 'spell');
      if (spells.length) {
        const spell = spells[Math.floor(Math.random() * spells.length)];
        let targetIdx;
        if (spell.effect === 'buff') {
          const best = pickStrongestMonster(p);
          if (!best) break;
          targetIdx = p.field.indexOf(best);
        }
        if (resolveSpellEffect(state, side, spell, targetIdx)) {
          addLog(state, `${card.name}의 효과! 묘지의 ${spell.name}을(를) 재발동했습니다.`);
        }
      }
      break;
    }
    case 'm08': { // 전공의 용: 특수 소환 성공 시 자신 필드 몬스터 전체 공격력 +500
      if (!special) break;
      let buffed = false;
      p.field.forEach((m) => { if (m) { m.currentAtk += 500; buffed = true; } });
      if (buffed) addLog(state, `${card.name}의 효과! 자신 필드 몬스터의 공격력이 500 상승했습니다.`);
      break;
    }
    case 'm09': { // 지옥의 군주: 소환 성공 시 상대 몬스터 1장 공격력 0
      const target = pickStrongestMonster(opp);
      if (target) {
        target.currentAtk = 0;
        addLog(state, `${card.name}의 효과! ${target.name}의 공격력이 0이 되었습니다.`);
      }
      break;
    }
    case 'm13': // 시간의 마도사: 소환 성공 시 드로우
      drawCard(state, side);
      addLog(state, `${card.name}의 효과! 카드를 1장 드로우했습니다.`);
      break;
    case 'm15': // 정령의 드루이드: 소환 성공 시 패에서 몬스터 1장 특수 소환
      specialSummonFromHand(state, side);
      break;
    case 'm16': { // 용암의 거인: 소환 성공 시 상대 몬스터 1장 공격력 -1000
      const target = pickStrongestMonster(opp);
      if (target) {
        target.currentAtk = Math.max(0, target.currentAtk - 1000);
        addLog(state, `${card.name}의 효과! ${target.name}의 공격력이 1000 감소했습니다.`);
      }
      break;
    }
    case 'm17': { // 얼음의 여왕: 특수 소환 성공 시 상대 필드 몬스터 전체 공격력 -500
      if (!special) break;
      let weakened = false;
      opp.field.forEach((m) => { if (m) { m.currentAtk = Math.max(0, m.currentAtk - 500); weakened = true; } });
      if (weakened) addLog(state, `${card.name}의 효과! 상대 필드 몬스터의 공격력이 500 감소했습니다.`);
      break;
    }
    case 'm18': { // 광기의 광대: 소환 성공 시 상대는 패 1장 버리고 1장 드로우
      const oppHand = opp.hand;
      if (oppHand.length) {
        const idx = Math.floor(Math.random() * oppHand.length);
        const [discarded] = oppHand.splice(idx, 1);
        opp.graveyard.push(discarded);
        addLog(state, `${card.name}의 효과! 상대가 ${discarded.name}을(를) 묘지로 보냈습니다.`);
      }
      drawCard(state, otherSide(side));
      break;
    }
    case 'm20': { // 하늘을 나는 섬: 소환 성공 시 자신 필드 몬스터 전체 수비력 +500
      let buffed = false;
      p.field.forEach((m) => { if (m) { m.def += 500; buffed = true; } });
      if (buffed) addLog(state, `${card.name}의 효과! 자신 필드 몬스터의 수비력이 500 상승했습니다.`);
      break;
    }
    case 'f01': { // 아자토스: 소환 성공 시 상대 필드 전멸
      let destroyed = false;
      opp.field.forEach((m, i) => {
        if (m) { opp.graveyard.push(m); opp.field[i] = null; destroyed = true; }
      });
      if (destroyed) addLog(state, `${card.name}의 효과! 상대 필드의 몬스터를 모두 파괴했습니다.`);
      break;
    }
    case 'f02': // 세레네
    case 'f05': { // 알케스트로스: 소환 성공 시 상대 필드 몬스터 1장 파괴
      const target = pickStrongestMonster(opp);
      if (target) {
        const idx = opp.field.indexOf(target);
        opp.field[idx] = null;
        opp.graveyard.push(target);
        addLog(state, `${card.name}의 효과! ${target.name}을(를) 파괴했습니다.`);
      }
      break;
    }
    case 'f03': { // 바알가: 소환 성공 시 상대의 세트 카드 1장 파괴
      const idxs = opp.spellField.map((c, i) => (c ? i : -1)).filter((i) => i !== -1);
      if (idxs.length) {
        const idx = idxs[Math.floor(Math.random() * idxs.length)];
        const destroyed = opp.spellField[idx];
        opp.spellField[idx] = null;
        opp.graveyard.push(destroyed);
        addLog(state, `${card.name}의 효과! 상대의 세트 카드 1장을 파괴했습니다.`);
      }
      break;
    }
    case 'f04': { // 엘리시온: 소환 성공 시 상대 필드 몬스터 1장을 패로 되돌림
      const target = pickStrongestMonster(opp);
      if (target) {
        const idx = opp.field.indexOf(target);
        opp.field[idx] = null;
        target.currentAtk = target.atk;
        target.position = 'attack';
        target.faceDown = false;
        target.effectNegated = false;
        opp.hand.push(target);
        addLog(state, `${card.name}의 효과! ${target.name}을(를) 패로 되돌렸습니다.`);
      }
      break;
    }
    case 'sy01': // 루미네로
    case 'l01': // 벨테로스
    case 'l03': // 멜레온
      drawCard(state, side);
      addLog(state, `${card.name}의 효과! 카드를 1장 드로우했습니다.`);
      break;
    case 'sy02': { // 가이마스: 소환 성공 시 상대의 세트 몬스터 1장을 강제로 앞면 공격 표시로
      const target = opp.field.find((m) => m && m.faceDown);
      if (target) {
        target.faceDown = false;
        target.position = 'attack';
        addLog(state, `${card.name}의 효과! ${target.name}이(가) 앞면 공격 표시가 되었습니다.`);
      }
      break;
    }
    case 'sy03': { // 아스트라: 소환 성공 시 상대 필드 전체 공격력 -500
      let weakened = false;
      opp.field.forEach((m) => { if (m) { m.currentAtk = Math.max(0, m.currentAtk - 500); weakened = true; } });
      if (weakened) addLog(state, `${card.name}의 효과! 상대 필드 몬스터의 공격력이 500 감소했습니다.`);
      break;
    }
    case 'sy04': { // 잔타르크: 소환 성공 시 상대 필드 몬스터 1장을 제외
      const target = pickStrongestMonster(opp);
      if (target) {
        const idx = opp.field.indexOf(target);
        opp.field[idx] = null;
        addLog(state, `${card.name}의 효과! ${target.name}을(를) 게임에서 제외했습니다.`);
      }
      break;
    }
    case 'x01': { // 어둠을 먹는 별의 용: 소환 성공 시 상대 묘지 전체 제외
      if (opp.graveyard.length) {
        opp.graveyard.length = 0;
        addLog(state, `${card.name}의 효과! 상대의 묘지를 모두 제외했습니다.`);
      }
      break;
    }
    case 'x02': // 카이로스
    case 'l02': { // 세리온: 소환 성공 시 상대 몬스터 1장 효과 무효화
      const target = pickStrongestMonster(opp);
      if (target) {
        target.effectNegated = true;
        addLog(state, `${card.name}의 효과! ${target.name}의 효과가 무효화되었습니다.`);
      }
      break;
    }
    case 'x03': // 네프티스
    case 'l06': { // 에리시온: 소환 성공 시 라이프 회복
      const heal = card.id === 'x03' ? 1000 : 500;
      p.lp += heal;
      addLog(state, `${card.name}의 효과! 라이프 포인트를 ${heal} 회복했습니다.`);
      break;
    }
    case 'x05': { // 알파리온: 소환 성공 시 상대 몬스터 공격력 500을 빼앗음
      const target = pickStrongestMonster(opp);
      const own = pickStrongestMonster(p);
      if (target && own) {
        target.currentAtk = Math.max(0, target.currentAtk - 500);
        own.currentAtk += 500;
        addLog(state, `${card.name}의 효과! ${target.name}의 공격력 500을 빼앗아 ${own.name}에게 더했습니다.`);
      }
      break;
    }
    case 'l04': { // 노바(공허의 정찰): 소환 성공 시 상대 패 1장 무작위 파괴
      if (opp.hand.length) {
        const idx = Math.floor(Math.random() * opp.hand.length);
        const [discarded] = opp.hand.splice(idx, 1);
        opp.graveyard.push(discarded);
        addLog(state, `${card.name}의 효과! 상대의 ${discarded.name}을(를) 묘지로 보냈습니다.`);
      }
      break;
    }
    case 'n01': // 빛의 인도자: 소환 성공 시 덱에서 몬스터 1장을 패에
      tutorToHand(state, side);
      break;
    case 'n03': { // 바람의 정령사: 특수 소환 성공 시 상대 세트 카드 1장 파괴
      if (!special) break;
      const idxs = opp.spellField.map((c, i) => (c ? i : -1)).filter((i) => i !== -1);
      if (idxs.length) {
        const idx = idxs[Math.floor(Math.random() * idxs.length)];
        const destroyed = opp.spellField[idx];
        opp.spellField[idx] = null;
        opp.graveyard.push(destroyed);
        addLog(state, `${card.name}의 효과! 상대의 세트 카드 1장을 파괴했습니다.`);
      }
      break;
    }
    case 'n04': { // 암흑의 수호자: 소환 성공 시 자신 필드 전체 공격력 +300
      let buffed = false;
      p.field.forEach((m) => { if (m) { m.currentAtk += 300; buffed = true; } });
      if (buffed) addLog(state, `${card.name}의 효과! 자신 필드 몬스터의 공격력이 300 상승했습니다.`);
      break;
    }
    case 'n06': // 얼음의 사제
    case 'n15': { // 장미의 소녀
      const wantSpecial = card.id === 'n15';
      if (wantSpecial !== special) break;
      millFromDeck(state, side);
      break;
    }
    case 'n07': { // 기계의 전사: 특수 소환 성공 시 상대 몬스터 1장 효과 무효화
      if (!special) break;
      const target = pickStrongestMonster(opp);
      if (target) {
        target.effectNegated = true;
        addLog(state, `${card.name}의 효과! ${target.name}의 효과가 무효화되었습니다.`);
      }
      break;
    }
    case 'n09': // 숲의 수호자
    case 'n16': // 유성의 마도사
    case 'n17': // 지하의 탐색자
    case 'n19': // 해황의 부하
      drawCard(state, side);
      addLog(state, `${card.name}의 효과! 카드를 1장 드로우했습니다.`);
      break;
    case 'n11': { // 번개의 정령: 일반 소환 성공 시 상대 세트 카드 1장 파괴
      if (special) break;
      const idxs = opp.spellField.map((c, i) => (c ? i : -1)).filter((i) => i !== -1);
      if (idxs.length) {
        const idx = idxs[Math.floor(Math.random() * idxs.length)];
        const destroyed = opp.spellField[idx];
        opp.spellField[idx] = null;
        opp.graveyard.push(destroyed);
        addLog(state, `${card.name}의 효과! 상대의 세트 카드 1장을 파괴했습니다.`);
      }
      break;
    }
    case 'n12': { // 어둠의 마도사: 특수 소환 성공 시 자신 묘지의 마법 1장을 패에
      if (!special) break;
      const idx = p.graveyard.findIndex((c) => c.type === 'spell');
      if (idx !== -1) {
        const [recovered] = p.graveyard.splice(idx, 1);
        p.hand.push(recovered);
        addLog(state, `${card.name}의 효과! 묘지에서 ${recovered.name}을(를) 패에 넣었습니다.`);
      }
      break;
    }
    case 'n13': { // 고대의 전령: 일반 소환 성공 시 다른 자신 몬스터 중 최강 공격력 +500
      if (special) break;
      let best = null;
      p.field.forEach((m) => {
        if (m && m.uid !== card.uid && (!best || m.currentAtk > best.currentAtk)) best = m;
      });
      if (best) {
        best.currentAtk += 500;
        addLog(state, `${card.name}의 효과! ${best.name}의 공격력이 500 상승했습니다.`);
      }
      break;
    }
    case 'n20': { // 사역의 기사: 특수 소환 성공 시 자신 필드 전체 공격력 +500
      if (!special) break;
      let buffed = false;
      p.field.forEach((m) => { if (m) { m.currentAtk += 500; buffed = true; } });
      if (buffed) addLog(state, `${card.name}의 효과! 자신 필드 몬스터의 공격력이 500 상승했습니다.`);
      break;
    }
    default:
      break;
  }
  checkGameOver(state);
}

function triggerOnBattleDestroy(state, side, attacker) {
  if (!attacker || attacker.effectNegated) return;
  const opp = state[otherSide(side)];
  switch (attacker.id) {
    case 'm02': // 빛의 성기사
    case 'm10': // 달의 늑대
      drawCard(state, side);
      addLog(state, `${attacker.name}의 효과! 카드를 1장 드로우했습니다.`);
      break;
    case 'm07': { // 어둠의 사신: 상대 묘지 몬스터 1장 제외
      const monsters = opp.graveyard.filter((c) => c.type === 'monster');
      if (monsters.length) {
        const pick = monsters[Math.floor(Math.random() * monsters.length)];
        opp.graveyard.splice(opp.graveyard.indexOf(pick), 1);
        addLog(state, `${attacker.name}의 효과! 상대 묘지의 ${pick.name}을(를) 제외했습니다.`);
      }
      break;
    }
    case 'm14': // 죽음의 기사: 상대 라이프 -500
    case 'l07': // 노바(권력의 심판)
      opp.lp = Math.max(0, opp.lp - 500);
      addLog(state, `${attacker.name}의 효과! 상대 라이프가 500 감소했습니다.`);
      break;
    case 'x04': { // 크로노스: 전투로 파괴 시 상대 묘지 1장 제외
      const monsters = opp.graveyard.filter((c) => c.type === 'monster');
      if (monsters.length) {
        const pick = monsters[Math.floor(Math.random() * monsters.length)];
        opp.graveyard.splice(opp.graveyard.indexOf(pick), 1);
        addLog(state, `${attacker.name}의 효과! 상대 묘지의 ${pick.name}을(를) 제외했습니다.`);
      }
      break;
    }
    case 'l05': // 가이아스: 전투로 파괴 시 드로우
    case 'n02': // 달의 사냥꾼
    case 'n10': // 회색의 기사
    case 'n14': // 빛의 종자기사
      drawCard(state, side);
      addLog(state, `${attacker.name}의 효과! 카드를 1장 드로우했습니다.`);
      break;
    default:
      break;
  }
  checkGameOver(state);
}

function triggerOnSentToGraveyard(state, side, card) {
  if (!card || card.effectNegated) return;
  const p = state[side];
  const opp = state[otherSide(side)];
  switch (card.id) {
    case 'm04': // 불꽃의 피닉스: 자신 묘지에서 몬스터 1장 특수 소환
      specialSummonFromGraveyard(state, side, card.uid);
      break;
    case 'm12': { // 저주받은 인어: 상대 몬스터 1장 효과 무효화
      const target = pickStrongestMonster(opp);
      if (target) {
        target.effectNegated = true;
        addLog(state, `${card.name}의 효과! ${target.name}의 효과가 무효화되었습니다.`);
      }
      break;
    }
    case 'm19': { // 유령선: 덱에서 몬스터 1장 특수 소환
      const idx = p.deck.findIndex((c) => c.type === 'monster');
      if (idx !== -1) {
        const [pick] = p.deck.splice(idx, 1);
        if (!specialSummon(state, side, pick)) p.deck.push(pick);
      }
      break;
    }
    case 'n05': { // 화염의 이계인: 묘지로 보내졌을 때 자신 필드 최강 몬스터 공격력 +500
      const best = pickStrongestMonster(p);
      if (best) {
        best.currentAtk += 500;
        addLog(state, `${card.name}의 효과! ${best.name}의 공격력이 500 상승했습니다.`);
      }
      break;
    }
    case 'n08': // 나락의 서린자: 묘지로 보내졌을 때 덱에서 몬스터 1장을 패에
      tutorToHand(state, side);
      break;
    case 'n18': // 저하의 탐색자: 묘지로 보내졌을 때 덱에서 레벨 4 이하 몬스터 특수 소환
      specialSummonFromDeckMaxLevel(state, side, 4);
      break;
    default:
      break;
  }
  checkGameOver(state);
}

function triggerOnDeclareAttack(state, side, attacker) {
  if (!attacker || attacker.effectNegated) return;
  if (attacker.id !== 'm11') return; // 번개 사냥꾼: 공격 선언 시 상대 패의 마법 카드 1장 파괴
  const opp = state[otherSide(side)];
  const idx = opp.hand.findIndex((c) => c.type === 'spell');
  if (idx !== -1) {
    const [destroyed] = opp.hand.splice(idx, 1);
    opp.graveyard.push(destroyed);
    addLog(state, `${attacker.name}의 효과! 상대 패의 ${destroyed.name}을(를) 파괴했습니다.`);
  }
}

// ---- 전투 ----

function attack(state, side, attackerIndex, targetIndex) {
  const p = state[side];
  const opp = state[otherSide(side)];
  const attacker = p.field[attackerIndex];
  if (!attacker || attacker.hasAttackedThisTurn || attacker.position !== 'attack') return false;

  if (targetIndex === null || targetIndex === undefined) {
    if (opp.field.some((z) => z !== null)) return false;
    const trapResult = checkTrapResponse(state, side, 'declareAttack', {
      attackerSide: side,
      attackerFieldIndex: attackerIndex,
      attacker,
    });
    if (trapResult.cancelAttack || p.field[attackerIndex] !== attacker) {
      checkGameOver(state);
      return true;
    }
    triggerOnDeclareAttack(state, side, attacker);
    if (p.field[attackerIndex] !== attacker) {
      checkGameOver(state);
      return true;
    }
    opp.lp = Math.max(0, opp.lp - attacker.currentAtk);
    addLog(state, `${attacker.name}의 직접 공격! ${attacker.currentAtk} 데미지.`);
    attacker.hasAttackedThisTurn = true;
  } else {
    const defender = opp.field[targetIndex];
    if (!defender) return false;
    const trapResult = checkTrapResponse(state, side, 'declareAttack', {
      attackerSide: side,
      attackerFieldIndex: attackerIndex,
      attacker,
    });
    if (trapResult.cancelAttack || p.field[attackerIndex] !== attacker) {
      checkGameOver(state);
      return true;
    }
    triggerOnDeclareAttack(state, side, attacker);
    if (p.field[attackerIndex] !== attacker) {
      checkGameOver(state);
      return true;
    }

    if (defender.faceDown) {
      defender.faceDown = false;
      addLog(state, `${defender.name}이(가) 공개되었습니다.`);
    }

    if (defender.position === 'defense') {
      if (attacker.currentAtk > defender.def) {
        opp.field[targetIndex] = null;
        opp.graveyard.push(defender);
        addLog(state, `${attacker.name}(이)가 수비 표시 ${defender.name}을(를) 파괴했습니다.`);
        attacker.hasAttackedThisTurn = true;
        triggerOnSentToGraveyard(state, otherSide(side), defender);
        triggerOnBattleDestroy(state, side, attacker);
      } else if (attacker.currentAtk < defender.def) {
        const dmg = defender.def - attacker.currentAtk;
        p.lp = Math.max(0, p.lp - dmg);
        addLog(state, `${attacker.name}이(가) 수비 표시 ${defender.name}에게 막혀 ${dmg} 데미지를 입었습니다.`);
        attacker.hasAttackedThisTurn = true;
      } else {
        addLog(state, `${attacker.name}의 공격이 수비 표시 ${defender.name}에게 막혔습니다.`);
        attacker.hasAttackedThisTurn = true;
      }
    } else if (attacker.currentAtk > defender.currentAtk) {
      opp.field[targetIndex] = null;
      opp.graveyard.push(defender);
      addLog(state, `${attacker.name}(이)가 ${defender.name}을(를) 파괴했습니다.`);
      attacker.hasAttackedThisTurn = true;
      triggerOnSentToGraveyard(state, otherSide(side), defender);
      triggerOnBattleDestroy(state, side, attacker);
    } else if (attacker.currentAtk < defender.currentAtk) {
      p.field[attackerIndex] = null;
      p.graveyard.push(attacker);
      addLog(state, `${defender.name}(이)가 ${attacker.name}을(를) 파괴했습니다.`);
      triggerOnSentToGraveyard(state, side, attacker);
    } else {
      opp.field[targetIndex] = null;
      p.field[attackerIndex] = null;
      opp.graveyard.push(defender);
      p.graveyard.push(attacker);
      addLog(state, `${attacker.name}과(와) ${defender.name}이(가) 서로 파괴되었습니다.`);
      triggerOnSentToGraveyard(state, otherSide(side), defender);
      triggerOnSentToGraveyard(state, side, attacker);
      triggerOnBattleDestroy(state, side, attacker);
      triggerOnBattleDestroy(state, otherSide(side), defender);
    }
  }
  checkGameOver(state);
  return true;
}

function checkGameOver(state) {
  if (state.player.lp <= 0) {
    state.gameOver = true;
    state.winner = 'ai';
    addLog(state, '패배했습니다...');
  } else if (state.ai.lp <= 0) {
    state.gameOver = true;
    state.winner = 'player';
    addLog(state, '승리했습니다!');
  }
}

function endTurn(state) {
  if (state.gameOver) return;
  const next = otherSide(state.turn);
  if (next === 'player') state.turnCount++;
  startTurn(state, next);
}

function initGame() {
  const state = createGameState();
  for (let i = 0; i < STARTING_HAND; i++) {
    drawCard(state, 'player');
    drawCard(state, 'ai');
  }
  state.turn = 'player';
  state.phase = 'main';
  addLog(state, '게임 시작! 당신의 턴입니다.');
  return state;
}
