// 컴퓨터(AI) 턴 자동 진행 로직

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function aiPickTributes(field, need) {
  const idxs = field.map((c, i) => (c ? i : -1)).filter((i) => i !== -1);
  if (idxs.length < need) return null;
  idxs.sort((a, b) => field[a].currentAtk - field[b].currentAtk); // 약한 몬스터부터 릴리스
  return idxs.slice(0, need);
}

function aiRelevantDefStat(m) {
  return m.position === 'defense' ? m.def : m.currentAtk;
}

async function aiTakeTurn(state, render, animateAttackFn, animateSpellCastFn, animateSetSpellCastFn) {
  const ai = state.ai;
  const player = state.player;

  // 1) 메인 페이즈: 릴리스를 감당할 수 있는 선에서 가장 공격력 높은 몬스터 소환
  if (canSummon(state, 'ai')) {
    const candidates = ai.hand
      .map((c, i) => ({ c, i }))
      .filter((x) => x.c.type === 'monster')
      .sort((a, b) => b.c.atk - a.c.atk);
    for (const { c, i } of candidates) {
      const need = requiredTributes(c.level);
      const tributes = need > 0 ? aiPickTributes(ai.field, need) : [];
      if (tributes !== null) {
        summonMonster(state, 'ai', i, undefined, 'attack', tributes);
        render();
        await sleep(700);
        break;
      }
    }
  }

  // 2) 손패의 함정(항상)과 마법(가끔)을 마법/함정 존에 세트
  {
    let guard = 0;
    while (guard++ < 5 && ai.spellField.some((z) => z === null)) {
      const idx = ai.hand.findIndex((c) => c.type === 'trap' || (c.type === 'spell' && Math.random() < 0.35));
      if (idx === -1) break;
      setSpellOrTrap(state, 'ai', idx);
      render();
      await sleep(400);
    }
  }

  // 3) 마법 사용 판단 (손패 + 세트된 마법 카드 모두 후보)
  if (!ai.hasCastSpellThisTurn) {
    const findInHand = (pred) => {
      const idx = ai.hand.findIndex((c) => c.type === 'spell' && pred(c));
      return idx !== -1 ? { source: 'hand', index: idx, card: ai.hand[idx] } : null;
    };
    const findInSet = (pred) => {
      const idx = ai.spellField.findIndex((c) => c && c.type === 'spell' && c.setPly < state.ply && pred(c));
      return idx !== -1 ? { source: 'set', index: idx, card: ai.spellField[idx] } : null;
    };

    let choice = null;
    if (ai.lp <= 1500) {
      choice = findInHand((c) => c.effect === 'heal') || findInSet((c) => c.effect === 'heal');
    }
    if (!choice) {
      choice =
        findInHand((c) => c.effect === 'damage' && c.value >= player.lp) ||
        findInSet((c) => c.effect === 'damage' && c.value >= player.lp);
    }
    if (!choice && ai.field.some((z) => z !== null) && Math.random() < 0.5) {
      choice = findInHand((c) => c.effect === 'buff') || findInSet((c) => c.effect === 'buff');
    }

    if (choice) {
      let targetIdx;
      if (choice.card.effect === 'buff') {
        let bestFieldIdx = -1;
        let bestFieldAtk = -1;
        ai.field.forEach((m, i) => {
          if (m && m.currentAtk > bestFieldAtk) {
            bestFieldAtk = m.currentAtk;
            bestFieldIdx = i;
          }
        });
        if (bestFieldIdx === -1) choice = null;
        else targetIdx = bestFieldIdx;
      }
      if (choice) {
        if (choice.source === 'hand') {
          if (animateSpellCastFn) await animateSpellCastFn('ai', choice.index);
          castSpell(state, 'ai', choice.index, targetIdx);
        } else {
          if (animateSetSpellCastFn) await animateSetSpellCastFn('ai', choice.index);
          activateSetSpell(state, 'ai', choice.index, targetIdx);
        }
        render();
        await sleep(700);
      }
    }
  }

  // 4) 배틀 페이즈
  state.phase = 'battle';
  render();
  await sleep(400);

  for (let i = 0; i < ai.field.length; i++) {
    const attacker = ai.field[i];
    if (!attacker || attacker.hasAttackedThisTurn || attacker.position !== 'attack') continue;

    const hasTargets = player.field.some((z) => z !== null);

    if (!hasTargets) {
      if (animateAttackFn) await animateAttackFn('ai', i, 'player', null);
      attack(state, 'ai', i, null);
      render();
      await sleep(500);
      continue;
    }

    let targetIdx = -1;
    player.field.forEach((def, j) => {
      if (def && attacker.currentAtk > aiRelevantDefStat(def)) {
        if (targetIdx === -1 || aiRelevantDefStat(def) > aiRelevantDefStat(player.field[targetIdx])) {
          targetIdx = j;
        }
      }
    });

    if (targetIdx !== -1) {
      if (animateAttackFn) await animateAttackFn('ai', i, 'player', targetIdx);
      attack(state, 'ai', i, targetIdx);
      render();
      await sleep(500);
    }

    if (state.gameOver) break;
  }

  if (!state.gameOver) {
    endTurn(state);
    render();
  }
}
