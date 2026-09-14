// 렌더링, 이벤트 바인딩

let state = initGame();
let selectedHand = null; // 선택된 손패 인덱스 (플레이어)
let selectedAttacker = null; // 선택된 공격자 필드 인덱스 (플레이어)
let busy = false; // 애니메이션/AI 턴 진행 중 입력 잠금
let knownHandUids = { player: new Set(), ai: new Set() }; // 드로우 애니메이션 판별용

const els = {
  aiLp: document.getElementById('ai-lp'),
  aiLpBar: document.getElementById('ai-lp-bar'),
  aiDeckCount: document.getElementById('ai-deck-count'),
  aiField: document.getElementById('ai-field'),
  aiHand: document.getElementById('ai-hand'),
  playerLp: document.getElementById('player-lp'),
  playerLpBar: document.getElementById('player-lp-bar'),
  playerDeckCount: document.getElementById('player-deck-count'),
  playerField: document.getElementById('player-field'),
  playerHand: document.getElementById('player-hand'),
  phaseIndicator: document.getElementById('phase-indicator'),
  turnIndicator: document.getElementById('turn-indicator'),
  nextPhaseBtn: document.getElementById('next-phase-btn'),
  endTurnBtn: document.getElementById('end-turn-btn'),
  log: document.getElementById('log'),
  gameOverOverlay: document.getElementById('game-over-overlay'),
  gameOverMessage: document.getElementById('game-over-message'),
  restartBtn: document.getElementById('restart-btn'),
};

function cardHtml(card) {
  const typeClass = card.type === 'monster' ? 'monster' : 'spell';
  if (card.type === 'monster' && card.image) {
    return `
      <div class="card monster has-art" data-uid="${card.uid}" style="background-image:url('${card.image}')">
        <div class="card-art-scrim"></div>
        <div class="card-name">${card.name}</div>
        <div class="card-stats">${card.currentAtk} / ${card.def}</div>
      </div>`;
  }
  const stats =
    card.type === 'monster'
      ? `<div class="card-stats">${card.currentAtk} / ${card.def}</div>`
      : `<div class="card-desc">${card.description}</div>`;
  return `
    <div class="card ${typeClass}" data-uid="${card.uid}">
      <div class="card-emoji">${card.emoji}</div>
      <div class="card-name">${card.name}</div>
      ${stats}
    </div>`;
}

function faceDownHtml() {
  return `<div class="card face-down"></div>`;
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
    if (card) zone.innerHTML = cardHtml(card);
    zone.addEventListener('click', () => onFieldClick('ai', i));
    els.aiField.appendChild(zone);
  });

  els.playerField.innerHTML = '';
  state.player.field.forEach((card, i) => {
    const zone = document.createElement('div');
    zone.className = 'field-zone';
    if (selectedAttacker === i) zone.classList.add('selected');
    zone.dataset.side = 'player';
    zone.dataset.index = String(i);
    if (card) zone.innerHTML = cardHtml(card);
    zone.addEventListener('click', () => onFieldClick('player', i));
    els.playerField.appendChild(zone);
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
    wrap.innerHTML = cardHtml(card);
    const cardEl = wrap.firstElementChild;
    if (selectedHand === i) cardEl.classList.add('selected');
    if (!knownHandUids.player.has(card.uid)) cardEl.classList.add('drawn-player');
    cardEl.addEventListener('click', () => onHandClick(i));
    els.playerHand.appendChild(cardEl);
  });
  knownHandUids.player = new Set(state.player.hand.map((c) => c.uid));

  els.phaseIndicator.textContent = state.phase === 'main' ? '메인 페이즈' : '배틀 페이즈';
  els.turnIndicator.textContent = state.turn === 'player' ? '내 턴' : '상대 턴';
  els.nextPhaseBtn.disabled = busy || state.turn !== 'player' || state.phase !== 'main';
  els.endTurnBtn.disabled = busy || state.turn !== 'player';

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

async function onHandClick(index) {
  if (busy || state.turn !== 'player' || state.phase !== 'main' || state.gameOver) return;
  const card = state.player.hand[index];
  if (!card) return;

  if (card.type === 'monster') {
    selectedHand = selectedHand === index ? null : index;
    selectedAttacker = null;
    render();
  } else if (card.type === 'spell') {
    if (state.player.hasCastSpellThisTurn) return;
    if (card.effect === 'buff') {
      selectedHand = selectedHand === index ? null : index;
      render();
    } else {
      busy = true;
      await animateSpellCast('player', index);
      castSpell(state, 'player', index);
      busy = false;
      render();
    }
  }
}

async function onFieldClick(side, index) {
  if (busy || state.turn !== 'player' || state.gameOver) return;

  if (side === 'player') {
    if (state.phase === 'main' && selectedHand !== null) {
      const card = state.player.hand[selectedHand];
      if (!card) return;
      if (card.type === 'monster' && state.player.field[index] === null) {
        summonMonster(state, 'player', selectedHand, index);
        selectedHand = null;
        render();
      } else if (card.type === 'spell' && card.effect === 'buff' && state.player.field[index]) {
        busy = true;
        const hIdx = selectedHand;
        selectedHand = null;
        await animateSpellCast('player', hIdx);
        castSpell(state, 'player', hIdx, index);
        busy = false;
        render();
      }
      return;
    }
    if (state.phase === 'battle') {
      const monster = state.player.field[index];
      if (monster && !monster.hasAttackedThisTurn) {
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
  selectedHand = null;
  render();
});

els.endTurnBtn.addEventListener('click', async () => {
  if (busy || state.turn !== 'player' || state.gameOver) return;
  selectedHand = null;
  selectedAttacker = null;
  busy = true;
  endTurn(state);
  render();
  if (state.turn === 'ai' && !state.gameOver) {
    await aiTakeTurn(state, render, animateAttack, animateSpellCast);
  }
  busy = false;
  render();
});

els.restartBtn.addEventListener('click', () => {
  state = initGame();
  selectedHand = null;
  selectedAttacker = null;
  busy = false;
  render();
});

render();
