// 게임 상태와 규칙 처리

const LP_START = 4000;
const FIELD_SIZE = 3;
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
  const p = state[side];
  p.hasSummonedThisTurn = false;
  p.hasCastSpellThisTurn = false;
  p.field.forEach((m) => { if (m) m.hasAttackedThisTurn = false; });
  drawCard(state, side);
  state.phase = 'main';
  addLog(state, `--- ${sideName(side)}의 턴 ---`);
}

function canSummon(state, side) {
  const p = state[side];
  return !p.hasSummonedThisTurn && p.field.some((z) => z === null);
}

function summonMonster(state, side, handIndex, fieldIndex) {
  const p = state[side];
  if (!canSummon(state, side)) return false;
  const card = p.hand[handIndex];
  if (!card || card.type !== 'monster') return false;
  if (p.field[fieldIndex] !== null) return false;
  p.hand.splice(handIndex, 1);
  p.field[fieldIndex] = card;
  p.hasSummonedThisTurn = true;
  addLog(state, `${sideName(side)}가 ${card.name}을(를) 소환했습니다.`);
  return true;
}

function castSpell(state, side, handIndex, targetFieldIndex) {
  const p = state[side];
  const opp = state[otherSide(side)];
  const card = p.hand[handIndex];
  if (!card || card.type !== 'spell') return false;
  if (p.hasCastSpellThisTurn) return false;

  switch (card.effect) {
    case 'damage':
      opp.lp = Math.max(0, opp.lp - card.value);
      addLog(state, `${sideName(side)}가 ${card.name} 발동! 상대에게 ${card.value} 데미지.`);
      break;
    case 'heal':
      p.lp += card.value;
      addLog(state, `${sideName(side)}가 ${card.name} 발동! 라이프 ${card.value} 회복.`);
      break;
    case 'buff': {
      if (targetFieldIndex === undefined || targetFieldIndex === null || !p.field[targetFieldIndex]) return false;
      p.field[targetFieldIndex].currentAtk += card.value;
      addLog(state, `${sideName(side)}가 ${card.name} 발동! ${p.field[targetFieldIndex].name}의 공격력이 ${card.value} 상승.`);
      break;
    }
    case 'draw':
      for (let i = 0; i < card.value; i++) drawCard(state, side);
      addLog(state, `${sideName(side)}가 ${card.name} 발동! 카드 ${card.value}장 드로우.`);
      break;
    default:
      return false;
  }
  p.hand.splice(handIndex, 1);
  p.hasCastSpellThisTurn = true;
  checkGameOver(state);
  return true;
}

function attack(state, side, attackerIndex, targetIndex) {
  const p = state[side];
  const opp = state[otherSide(side)];
  const attacker = p.field[attackerIndex];
  if (!attacker || attacker.hasAttackedThisTurn) return false;

  if (targetIndex === null || targetIndex === undefined) {
    if (opp.field.some((z) => z !== null)) return false;
    opp.lp = Math.max(0, opp.lp - attacker.currentAtk);
    addLog(state, `${attacker.name}의 직접 공격! ${attacker.currentAtk} 데미지.`);
    attacker.hasAttackedThisTurn = true;
  } else {
    const defender = opp.field[targetIndex];
    if (!defender) return false;
    if (attacker.currentAtk > defender.currentAtk) {
      opp.field[targetIndex] = null;
      opp.graveyard.push(defender);
      addLog(state, `${attacker.name}(이)가 ${defender.name}을(를) 파괴했습니다.`);
      attacker.hasAttackedThisTurn = true;
    } else if (attacker.currentAtk < defender.currentAtk) {
      p.field[attackerIndex] = null;
      p.graveyard.push(attacker);
      addLog(state, `${defender.name}(이)가 ${attacker.name}을(를) 파괴했습니다.`);
    } else {
      opp.field[targetIndex] = null;
      p.field[attackerIndex] = null;
      opp.graveyard.push(defender);
      p.graveyard.push(attacker);
      addLog(state, `${attacker.name}과(와) ${defender.name}이(가) 서로 파괴되었습니다.`);
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
