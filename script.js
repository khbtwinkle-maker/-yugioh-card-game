// 렌더링, 이벤트 바인딩

let state = initGame();
let selectedHand = null; // 선택된 손패 인덱스 (플레이어)
let selectedTributes = []; // 상급 소환을 위해 선택한 릴리스 대상 필드 인덱스
let pendingAction = null; // 'buffHand' | 'buffSet' | null — 버프 마법의 대상(필드 몬스터)을 기다리는 중
let pendingSetSpellIndex = null; // pendingAction === 'buffSet'일 때 세트된 마법 카드의 spellField 인덱스
let selectedAttacker = null; // 선택된 공격자 필드 인덱스 (플레이어)
let busy = false; // 애니메이션/AI 턴 진행 중 입력 잠금
let knownHandUids = { player: new Set(), ai: new Set() }; // 드로우 애니메이션 판별용

const els = {
  aiLp: document.getElementById('ai-lp'),
  aiLpBar: document.getElementById('ai-lp-bar'),
  aiDeckCount: document.getElementById('ai-deck-count'),
  aiField: document.getElementById('ai-field'),
  aiSpellField: document.getElementById('ai-spell-field'),
  aiHand: document.getElementById('ai-hand'),
  playerLp: document.getElementById('player-lp'),
  playerLpBar: document.getElementById('player-lp-bar'),
  playerDeckCount: document.getElementById('player-deck-count'),
  playerField: document.getElementById('player-field'),
  playerSpellField: document.getElementById('player-spell-field'),
  playerHand: document.getElementById('player-hand'),
  phaseIndicator: document.getElementById('phase-indicator'),
  turnIndicator: document.getElementById('turn-indicator'),
  nextPhaseBtn: document.getElementById('next-phase-btn'),
  endTurnBtn: document.getElementById('end-turn-btn'),
  handActions: document.getElementById('hand-actions'),
  log: document.getElementById('log'),
  gameOverOverlay: document.getElementById('game-over-overlay'),
  gameOverMessage: document.getElementById('game-over-message'),
  restartBtn: document.getElementById('restart-btn'),
  cardDetailOverlay: document.getElementById('card-detail-overlay'),
  cardDetailBox: document.getElementById('card-detail-box'),
  cardDetailClose: document.getElementById('card-detail-close'),
  cardDetailArt: document.getElementById('card-detail-art'),
  cardDetailEmoji: document.getElementById('card-detail-emoji'),
  cardDetailName: document.getElementById('card-detail-name'),
  cardDetailMeta: document.getElementById('card-detail-meta'),
  cardDetailDesc: document.getElementById('card-detail-desc'),
};

function cardHtml(card, viewerCanSeeFaceDown) {
  if (card.faceDown && !viewerCanSeeFaceDown) {
    return `<div class="card face-down" data-uid="${card.uid}"></div>`;
  }
  const typeClass = card.type === 'monster' ? 'monster' : card.type === 'trap' ? 'trap' : 'spell';
  const negatedBadge = card.effectNegated ? `<div class="negated-badge" title="효과 무효화됨">효과 무효</div>` : '';
  const setBadge = card.faceDown ? `<div class="set-badge" title="세트 상태">SET</div>` : '';
  const setClass = card.faceDown ? ' is-set' : '';

  if (card.type === 'monster' && card.image) {
    return `
      <div class="card monster has-art${card.effectNegated ? ' negated' : ''}${setClass}" data-uid="${card.uid}">
        ${negatedBadge}${setBadge}
        <div class="card-art" style="background-image:url('${card.image}')"></div>
        <div class="card-frame">
          <div class="card-name">${card.name}</div>
          <div class="card-stats">${card.currentAtk} / ${card.def}</div>
        </div>
      </div>`;
  }
  const stats =
    card.type === 'monster'
      ? `<div class="card-stats">${card.currentAtk} / ${card.def}</div>`
      : `<div class="card-desc">${card.description}</div>`;
  return `
    <div class="card ${typeClass}${card.effectNegated ? ' negated' : ''}${setClass}" data-uid="${card.uid}">
      ${negatedBadge}${setBadge}
      <div class="card-emoji">${card.emoji}</div>
      <div class="card-name">${card.name}</div>
      ${stats}
    </div>`;
}

function faceDownHtml() {
  return `<div class="card face-down"></div>`;
}

const TYPE_LABEL = { monster: '몬스터 카드', spell: '마법 카드', trap: '함정 카드' };

function showCardDetail(card) {
  if (!card) return;
  const isMonster = card.type === 'monster';

  if (isMonster && card.image) {
    els.cardDetailArt.style.display = 'block';
    els.cardDetailArt.style.backgroundImage = `url('${card.image}')`;
    els.cardDetailEmoji.style.display = 'none';
  } else {
    els.cardDetailArt.style.display = 'none';
    els.cardDetailEmoji.style.display = 'block';
    els.cardDetailEmoji.textContent = card.emoji || '';
  }

  els.cardDetailName.textContent = card.name;

  const metaParts = [TYPE_LABEL[card.type] || card.type];
  if (isMonster) {
    metaParts.push(`레벨 ${card.level || '?'}`);
    metaParts.push(`공격력 ${card.currentAtk} / 수비력 ${card.def}`);
    metaParts.push(card.position === 'defense' ? '수비 표시' : '공격 표시');
    if (card.faceDown) metaParts.push('세트 상태');
    if (card.effectNegated) metaParts.push('효과 무효화됨');
  }
  els.cardDetailMeta.textContent = metaParts.join(' · ');
  els.cardDetailDesc.textContent = card.description || '';

  els.cardDetailOverlay.classList.remove('hidden');
}

function hideCardDetail() {
  els.cardDetailOverlay.classList.add('hidden');
}

function attachInspect(el, card, viewerCanSeeFaceDown) {
  if (!card) return;
  if (card.faceDown && !viewerCanSeeFaceDown) return; // 상대의 뒷면 카드는 정보를 보여주지 않음
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showCardDetail(card);
  });
}

els.cardDetailClose.addEventListener('click', hideCardDetail);
els.cardDetailOverlay.addEventListener('click', (e) => {
  if (e.target === els.cardDetailOverlay) hideCardDetail();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideCardDetail();
});

function makeActionBtn(label, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

function renderHandActions() {
  const container = els.handActions;
  container.innerHTML = '';
  if (busy || state.turn !== 'player' || state.phase !== 'main' || state.gameOver) return;
  if (pendingAction) {
    const hint = document.createElement('div');
    hint.className = 'action-hint';
    hint.textContent = '대상으로 삼을 자신의 필드 몬스터를 선택하세요.';
    container.appendChild(hint);
    return;
  }
  if (selectedHand === null) return;
  const card = state.player.hand[selectedHand];
  if (!card) return;

  if (card.type === 'monster') {
    const need = requiredTributes(card.level);
    if (selectedTributes.length !== need) {
      const have = state.player.field.filter(Boolean).length;
      const hint = document.createElement('div');
      hint.className = 'action-hint';
      hint.textContent =
        have < need
          ? `릴리스할 몬스터가 부족합니다 (${need}장 필요)`
          : `릴리스할 몬스터를 선택하세요 (${selectedTributes.length}/${need})`;
      container.appendChild(hint);
      return;
    }
    container.appendChild(makeActionBtn('공격 표시로 소환', () => finalizeSummon('attack')));
    container.appendChild(makeActionBtn('수비 표시로 세트', () => finalizeSummon('defense')));
  } else if (card.type === 'spell') {
    if (!state.player.hasCastSpellThisTurn) {
      container.appendChild(makeActionBtn('발동', () => activateHandSpell()));
    }
    container.appendChild(makeActionBtn('세트', () => setHandCard()));
  } else if (card.type === 'trap') {
    container.appendChild(makeActionBtn('세트', () => setHandCard()));
  }
}

function render() {
  els.aiLp.textContent = state.ai.lp;
  els.aiLpBar.style.width = Math.max(0, (state.ai.lp / LP_START) * 100) + '%';
  els.aiDeckCount.textContent = state.ai.deck.length;

  els.playerLp.textContent = state.player.lp;
  els.playerLpBar.style.width = Math.max(0, (state.player.lp / LP_START) * 100) + '%';
  els.playerDeckCount.textContent = state.player.deck.length;

  els.aiField.innerHTML = '';
  state.ai.field.forEach((card, i) => {
    const zone = document.createElement('div');
    zone.className = 'field-zone';
    zone.dataset.side = 'ai';
    zone.dataset.index = String(i);
    if (card) {
      zone.innerHTML = cardHtml(card, false);
      attachInspect(zone, card, false);
    }
    zone.addEventListener('click', () => onFieldClick('ai', i));
    els.aiField.appendChild(zone);
  });

  els.playerField.innerHTML = '';
  state.player.field.forEach((card, i) => {
    const zone = document.createElement('div');
    zone.className = 'field-zone';
    if (selectedAttacker === i) zone.classList.add('selected');
    if (selectedTributes.includes(i)) zone.classList.add('tribute-selected');
    zone.dataset.side = 'player';
    zone.dataset.index = String(i);
    if (card) {
      zone.innerHTML = cardHtml(card, true);
      attachInspect(zone, card, true);
    }
    zone.addEventListener('click', () => onFieldClick('player', i));
    els.playerField.appendChild(zone);
  });

  els.aiSpellField.innerHTML = '';
  state.ai.spellField.forEach((card, i) => {
    const zone = document.createElement('div');
    zone.className = 'field-zone spell-zone';
    zone.dataset.side = 'ai';
    zone.dataset.index = String(i);
    if (card) {
      zone.innerHTML = cardHtml(card, false);
      attachInspect(zone, card, false);
    }
    els.aiSpellField.appendChild(zone);
  });

  els.playerSpellField.innerHTML = '';
  state.player.spellField.forEach((card, i) => {
    const zone = document.createElement('div');
    zone.className = 'field-zone spell-zone';
    zone.dataset.side = 'player';
    zone.dataset.index = String(i);
    if (card) {
      zone.innerHTML = cardHtml(card, true);
      attachInspect(zone, card, true);
    }
    zone.addEventListener('click', () => onSpellZoneClick('player', i));
    els.playerSpellField.appendChild(zone);
  });

  els.aiHand.innerHTML = '';
  state.ai.hand.forEach((card) => {
    const wrap = document.createElement('div');
    wrap.innerHTML = faceDownHtml();
    const cardEl = wrap.firstElementChild;
    if (!knownHandUids.ai.has(card.uid)) cardEl.classList.add('drawn-ai');
    els.aiHand.appendChild(cardEl);
  });
  knownHandUids.ai = new Set(state.ai.hand.map((c) => c.uid));

  els.playerHand.innerHTML = '';
  state.player.hand.forEach((card, i) => {
    const wrap = document.createElement('div');
    wrap.innerHTML = cardHtml(card, true);
    const cardEl = wrap.firstElementChild;
    if (selectedHand === i) cardEl.classList.add('selected');
    if (!knownHandUids.player.has(card.uid)) cardEl.classList.add('drawn-player');
    cardEl.addEventListener('click', () => onHandClick(i));
    attachInspect(cardEl, card, true);
    els.playerHand.appendChild(cardEl);
  });
  knownHandUids.player = new Set(state.player.hand.map((c) => c.uid));

  els.phaseIndicator.textContent = state.phase === 'main' ? '메인 페이즈' : '배틀 페이즈';
  els.turnIndicator.textContent = state.turn === 'player' ? '내 턴' : '상대 턴';
  els.nextPhaseBtn.disabled = busy || state.turn !== 'player' || state.phase !== 'main';
  els.endTurnBtn.disabled = busy || state.turn !== 'player';

  renderHandActions();

  els.log.innerHTML = state.log.slice(-10).map((l) => `<div>${l}</div>`).join('');
  els.log.scrollTop = els.log.scrollHeight;

  if (state.gameOver) {
    els.gameOverOverlay.classList.remove('hidden');
    els.gameOverMessage.textContent = state.winner === 'player' ? '승리했습니다!' : '패배했습니다...';
  } else {
    els.gameOverOverlay.classList.add('hidden');
  }
}

function getZoneEl(side, index) {
  const container = side === 'player' ? els.playerField : els.aiField;
  return container.children[index];
}

function getSpellZoneEl(side, index) {
  const container = side === 'player' ? els.playerSpellField : els.aiSpellField;
  return container.children[index];
}

async function animateAttack(attackerSide, attackerIdx, targetSide, targetIdx) {
  const attackerZone = getZoneEl(attackerSide, attackerIdx);
  if (attackerZone) attackerZone.classList.add('attacking');
  if (targetIdx !== null && targetIdx !== undefined) {
    const targetZone = getZoneEl(targetSide, targetIdx);
    if (targetZone) targetZone.classList.add('hit-flash');
  }
  await sleep(350);
}

async function animateSpellCast(side, handIndex) {
  const container = side === 'player' ? els.playerHand : els.aiHand;
  const cardEl = container.children[handIndex];
  if (cardEl) cardEl.classList.add('spell-cast');
  await sleep(500);
}

async function animateSetSpellCast(side, spellFieldIndex) {
  const zone = getSpellZoneEl(side, spellFieldIndex);
  const cardEl = zone ? zone.firstElementChild : null;
  if (cardEl) cardEl.classList.add('spell-cast');
  await sleep(500);
}

function resetSelection() {
  selectedHand = null;
  selectedTributes = [];
  pendingAction = null;
  pendingSetSpellIndex = null;
}

async function finalizeSummon(position) {
  if (busy) return;
  const hIdx = selectedHand;
  const tributes = selectedTributes.slice();
  resetSelection();
  summonMonster(state, 'player', hIdx, undefined, position, tributes);
  render();
}

function setHandCard() {
  if (busy) return;
  const hIdx = selectedHand;
  resetSelection();
  setSpellOrTrap(state, 'player', hIdx);
  render();
}

async function activateHandSpell() {
  if (busy) return;
  const card = state.player.hand[selectedHand];
  if (!card) return;
  if (card.effect === 'buff') {
    pendingAction = 'buffHand';
    render();
    return;
  }
  const hIdx = selectedHand;
  resetSelection();
  busy = true;
  await animateSpellCast('player', hIdx);
  castSpell(state, 'player', hIdx);
  busy = false;
  render();
}

async function onHandClick(index) {
  if (busy || state.turn !== 'player' || state.phase !== 'main' || state.gameOver) return;
  if (pendingAction) return;
  const card = state.player.hand[index];
  if (!card) return;
  if (selectedHand === index) {
    resetSelection();
  } else {
    resetSelection();
    selectedHand = index;
  }
  selectedAttacker = null;
  render();
}

async function onSpellZoneClick(side, index) {
  if (busy || state.turn !== 'player' || state.gameOver || side !== 'player') return;
  if (state.phase !== 'main' || pendingAction) return;
  const card = state.player.spellField[index];
  if (!card || card.type !== 'spell' || !card.faceDown) return;
  if (state.player.hasCastSpellThisTurn) return;
  if (card.effect === 'buff') {
    pendingAction = 'buffSet';
    pendingSetSpellIndex = index;
    render();
    return;
  }
  busy = true;
  await animateSetSpellCast('player', index);
  activateSetSpell(state, 'player', index);
  busy = false;
  render();
}

async function onFieldClick(side, index) {
  if (busy || state.turn !== 'player' || state.gameOver) return;

  if (side === 'player') {
    if (pendingAction === 'buffHand') {
      const target = state.player.field[index];
      if (!target) return;
      const hIdx = selectedHand;
      resetSelection();
      busy = true;
      await animateSpellCast('player', hIdx);
      castSpell(state, 'player', hIdx, index);
      busy = false;
      render();
      return;
    }
    if (pendingAction === 'buffSet') {
      const target = state.player.field[index];
      if (!target) return;
      const spIdx = pendingSetSpellIndex;
      resetSelection();
      busy = true;
      await animateSetSpellCast('player', spIdx);
      activateSetSpell(state, 'player', spIdx, index);
      busy = false;
      render();
      return;
    }

    if (state.phase === 'main') {
      if (selectedHand !== null) {
        const handCard = state.player.hand[selectedHand];
        if (handCard && handCard.type === 'monster' && state.player.field[index]) {
          const need = requiredTributes(handCard.level);
          if (need > 0) {
            const pos = selectedTributes.indexOf(index);
            if (pos === -1) {
              if (selectedTributes.length < need) selectedTributes.push(index);
            } else {
              selectedTributes.splice(pos, 1);
            }
            render();
          }
        }
        return;
      }
      // 손패 선택이 없으면: 자신의 필드 몬스터 표시 변경 시도
      const card = state.player.field[index];
      if (card) {
        changePosition(state, 'player', index);
        render();
      }
      return;
    }

    if (state.phase === 'battle') {
      const monster = state.player.field[index];
      if (monster && monster.position === 'attack' && !monster.hasAttackedThisTurn) {
        selectedAttacker = selectedAttacker === index ? null : index;
        render();
      }
    }
    return;
  }

  // side === 'ai'
  if (state.phase === 'battle' && selectedAttacker !== null) {
    const target = state.ai.field[index];
    const hasAnyTarget = state.ai.field.some((z) => z !== null);
    if (target) {
      busy = true;
      const attackerIdx = selectedAttacker;
      selectedAttacker = null;
      await animateAttack('player', attackerIdx, 'ai', index);
      attack(state, 'player', attackerIdx, index);
      busy = false;
      render();
    } else if (!hasAnyTarget) {
      busy = true;
      const attackerIdx = selectedAttacker;
      selectedAttacker = null;
      await animateAttack('player', attackerIdx, 'ai', null);
      attack(state, 'player', attackerIdx, null);
      busy = false;
      render();
    }
  }
}

els.nextPhaseBtn.addEventListener('click', () => {
  if (busy || state.turn !== 'player' || state.phase !== 'main') return;
  state.phase = 'battle';
  resetSelection();
  render();
});

els.endTurnBtn.addEventListener('click', async () => {
  if (busy || state.turn !== 'player' || state.gameOver) return;
  resetSelection();
  selectedAttacker = null;
  busy = true;
  endTurn(state);
  render();
  if (state.turn === 'ai' && !state.gameOver) {
    await aiTakeTurn(state, render, animateAttack, animateSpellCast, animateSetSpellCast);
  }
  busy = false;
  render();
});

els.restartBtn.addEventListener('click', () => {
  state = initGame();
  resetSelection();
  selectedAttacker = null;
  busy = false;
  render();
});

render();
