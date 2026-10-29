// tests/test-economy.mjs — la economía de una BAJA (js/economy.js)
// Cubre las dos funciones que comparten Game._onKill y los scripts de
// medición: score (con el carry de las crías) y energía (XP) de la baja.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveKillScore, resolveKillXp } from '../js/economy.js';
import { baseScoreForEnemy, speedMult, xpForKill, xpScaleForStage } from '../js/score.js';

test('resolveKillScore: baja normal — entero, mínimo 1 y redondeo', () => {
  assert.deepEqual(resolveKillScore({ scoreReward: 5 }),
    { gained: 5, carry: 0, base: 5, raw: 5 });
  // racha ×1.5 → 7,5 → 8
  assert.equal(resolveKillScore({ scoreReward: 5 }, { mult: 1.5 }).gained, 8);
  // velocidad ×2 → ×1.25 → 6,25 → 6
  assert.equal(resolveKillScore({ scoreReward: 5 }, { timeScale: 2 }).gained, 6);
  // Prima de Combate → 6,5 → 7
  assert.equal(resolveKillScore({ scoreReward: 5 }, { scoreMul: 1.3 }).gained, 7);
  // ninguna baja paga 0: ni una fracción ni un enemigo sin recompensa
  for (const enemy of [{ scoreReward: 0.1 }, { scoreReward: 0 }, {}, null]) {
    assert.equal(resolveKillScore(enemy).gained, 1);
  }
});

test('resolveKillScore: las crías (fromSpawn) pagan 10 % exacto con carry', () => {
  const cria = { scoreReward: 0.5, fromSpawn: true };
  const a = resolveKillScore(cria);
  assert.deepEqual(a, { gained: 0, carry: 0.5, base: 0.5, raw: 0.5 });
  // la segunda cría cobra la fracción de la primera: 0,5 + 0,5 = 1
  const b = resolveKillScore(cria, { carry: a.carry });
  assert.deepEqual(b, { gained: 1, carry: 0, base: 0.5, raw: 0.5 });
  assert.equal(a.gained + b.gained, 1);

  // el agregado de 4 crías es exacto: 2 puntos, sin fracción colgando
  let carry = 0;
  let total = 0;
  for (let i = 0; i < 4; i++) {
    const r = resolveKillScore(cria, { carry });
    carry = r.carry;
    total += r.gained;
  }
  assert.equal(total, 2);
  assert.equal(carry, 0);

  // una baja normal NO toca la fracción acumulada
  assert.deepEqual(resolveKillScore({ scoreReward: 5 }, { carry: 0.5 }),
    { gained: 5, carry: 0.5, base: 5, raw: 5 });
});

test('resolveKillXp: la etapa escala la energía y el jefe no', () => {
  const spore = { scoreReward: 5 };
  assert.equal(resolveKillXp(spore), 5); // stage 1 = sin escala
  assert.ok(resolveKillXp(spore, { stage: 10 }) > resolveKillXp(spore, { stage: 1 }));
  assert.ok(Math.abs(resolveKillXp(spore, { stage: 50 }) - 5 * xpScaleForStage(50)) < 1e-9);
  // el jefe muere al final: su energía no escala con la etapa
  const boss = { scoreReward: 700, isBoss: true };
  assert.equal(resolveKillXp(boss, { stage: 50 }), 700);
  assert.equal(resolveKillXp(boss, { stage: 50 }), xpForKill(boss, 50));
});

test('resolveKillXp: bonus de drop y Acelerador multiplican la energía', () => {
  const spore = { scoreReward: 5 };
  const base = xpForKill(spore, 4);
  // cristal rojo: +15 % de energía (D12)
  assert.ok(Math.abs(resolveKillXp(spore, { stage: 4, bonusFrac: 0.15 }) - base * 1.15) < 1e-9);
  // Acelerador de Energía: ×1.25
  assert.ok(Math.abs(resolveKillXp(spore, { stage: 4, xpMul: 1.25 }) - base * 1.25) < 1e-9);
  // se apilan
  const both = resolveKillXp(spore, { stage: 4, bonusFrac: 0.15, xpMul: 1.25 });
  assert.ok(Math.abs(both - base * 1.15 * 1.25) < 1e-9);
  // sin recompensa no hay energía aunque haya multiplicadores
  assert.equal(resolveKillXp({}, { stage: 50, bonusFrac: 0.15, xpMul: 1.25 }), 0);
});

test('resolveKillScore reproduce el cálculo de Game._onKill (baja normal)', () => {
  // Copia LITERAL del bloque que reemplazó economy.js en game.js (_onKill):
  // base × mult × speedMult(timeScale) × scoreMul, redondeado con mínimo 1.
  const legacy = (enemy, mult, timeScale, scoreMul) => Math.max(1, Math.round(
    baseScoreForEnemy(enemy) * mult * speedMult(timeScale) * scoreMul,
  ));
  const enemies = [
    { scoreReward: 5 }, { scoreReward: 60 }, { scoreReward: 700, isBoss: true },
  ];
  for (const enemy of enemies) {
    for (const mult of [1, 1.5, 2, 3]) {
      for (const timeScale of [1, 1.5, 2]) {
        for (const scoreMul of [1, 1.25, 1.3]) {
          const got = resolveKillScore(enemy, { mult, timeScale, scoreMul });
          assert.equal(got.gained, legacy(enemy, mult, timeScale, scoreMul),
            `mult ${mult} · x${timeScale} · scoreMul ${scoreMul}`);
          assert.equal(got.base, baseScoreForEnemy(enemy));
          assert.equal(got.carry, 0);
        }
      }
    }
  }
});
