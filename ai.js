// 컴퓨터(AI) 턴 자동 진행 로직

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function aiTakeTurn(state, render, animateAttackFn, animateSpellCastFn) {
  const ai = state.ai;
  const player = state.player;

  // 1) 메인 페이즈: 손패에서 가장 공격력 높은 몬스터 소환
  if (canSummon(state, 'ai')) {
    let bestIdx = -1;
    let bestAtk = -1;
    ai.hand.forEach((c, i) => {
      if (c.type === 'monster' && c.atk > bestAtk) {
        bestAtk = c.atk;
        bestIdx = i;
      }
    });
    if (bestIdx !== -1) {
      const fieldIdx = ai.field.findIndex((z) => z === null);
      summonMonster(state, 'ai', bestIdx, fieldIdx);
      render();
      await sleep(700);
    }
  }

  // 2) 마법 사용 판단
  if (!ai.hasCastSpellThisTurn) {
    let spellIdx = -1;

    // 내 라이프가 낮으면 회복 우선
    if (ai.lp <= 1500) {
      spellIdx = ai.hand.findIndex((c) => c.type === 'spell' && c.effect === 'heal');
    }
    // 상대 라이프를 데미지 카드로 끝낼 수 있으면 사용
    if (spellIdx === -1) {
      spellIdx = ai.hand.findIndex(
        (c) => c.type === 'spell' && c.effect === 'damage' && c.value >= player.lp
      );
    }
    // 필드에 몬스터가 있으면 절반 확률로 버프 사용
    if (spellIdx === -1 && ai.field.some((z) => z !== null) && Math.random() < 0.5) {
      spellIdx = ai.hand.findIndex((c) => c.type === 'spell' && c.effect === 'buff');
    }

    if (spellIdx !== -1) {
      const card = ai.hand[spellIdx];
      let targetIdx;
      if (card.effect === 'buff') {
        let bestFieldIdx = -1;
        let bestFieldAtk = -1;
        ai.field.forEach((m, i) => {
          if (m && m.currentAtk > bestFieldAtk) {
            bestFieldAtk = m.currentAtk;
            bestFieldIdx = i;
          }
        });
        if (bestFieldIdx === -1) {
          spellIdx = -1;
        } else {
          targetIdx = bestFieldIdx;
        }
      }
      if (spellIdx !== -1) {
        if (animateSpellCastFn) await animateSpellCastFn('ai', spellIdx);
        castSpell(state, 'ai', spellIdx, targetIdx);
        render();
        await sleep(700);
      }
    }
  }

  // 3) 배틀 페이즈
  state.phase = 'battle';
  render();
  await sleep(400);

  for (let i = 0; i < ai.field.length; i++) {
    const attacker = ai.field[i];
    if (!attacker || attacker.hasAttackedThisTurn) continue;

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
      if (def && attacker.currentAtk > def.currentAtk) {
        if (targetIdx === -1 || def.currentAtk > player.field[targetIdx].currentAtk) {
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
