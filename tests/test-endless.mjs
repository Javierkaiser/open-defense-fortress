// tests/test-endless.mjs — fase 67
// Cubre el contrato del modo infinito (js/endless.js): la definición de las
// etapas generadas (con el HP de base de la CURVA, no el fallback de 3000),
// la profundidad "mejor + 1", el multiplicador de recompensa y el desafío
// diario determinista por fecha local.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ENDLESS_START, MILESTONE_EVERY, DAILY_STAGES,
  isEndless, stageDef, endlessOpen, bestDepth, nextEndlessStage,
  isMilestone, endlessRewardMul, dailyKey, dailySeed, dailyStage, dailyRun,
} from '../js/endless.js';
import { STAGES, baseHpForStage } from '../js/stages.js';

// Progreso mínimo con la campaña completa (lo único que abre el modo).
function campaignDone(extra = {}) {
  return { unlocked: 50, bestScore: { 50: 12345 }, endless: { best: 0, daily: { date: '', bestScore: 0 } }, ...extra };
}

test('endless: la campaña termina en 50 y el infinito arranca en 51', () => {
  assert.equal(STAGES.length, 50);
  assert.equal(ENDLESS_START, 51);
  assert.equal(isEndless(50), false);
  assert.equal(isEndless(51), true);
  assert.equal(isEndless(70), true);
  assert.equal(isEndless('51'), true, 'tolera el string que llega del DOM');
  assert.equal(isEndless(50.5), false);
  assert.equal(isEndless(NaN), false);
});

test('endless: stageDef(1..50) devuelve EXACTAMENTE la campaña', () => {
  for (const id of [1, 2, 5, 6, 49, 50]) {
    assert.equal(stageDef(id), STAGES[id - 1], `S${id} no cambia`);
  }
  assert.equal(stageDef(50).baseHp, 25500, 'la base del S50 sigue siendo la de la campaña');
  assert.equal(stageDef(0), null);
  assert.equal(stageDef('x'), null);
});

test('endless: stageDef(51) usa la CURVA de la campaña (26 000), no el fallback de 3000', () => {
  const def = stageDef(51);
  assert.equal(def.id, 51);
  assert.equal(def.name, '∞ Stage 51');
  assert.equal(def.baseHp, 26000);
  assert.equal(def.baseHp, baseHpForStage(51));
  assert.notEqual(def.baseHp, 3000, 'el fallback del S2 sería MÁS fácil que el S50');
  assert.equal(def.endless, true);
  assert.equal(def.boss, false);
  assert.ok(typeof def.theme === 'string' && def.theme.length > 0);
});

test('endless: el ciclo de jefes y de temas sigue después del 50', () => {
  assert.equal(stageDef(60).boss, true, 'cada múltiplo de 10 es jefe');
  assert.equal(stageDef(55).boss, false);
  assert.equal(stageDef(110).boss, true);
  const themes = new Set([51, 52, 53, 54, 55].map((id) => stageDef(id).theme));
  assert.equal(themes.size, 5, 'los 5 temas de la campaña siguen rotando');
});

test('endless: se abre sólo con el S50 LIMPIADO (récord), no desbloqueado', () => {
  assert.equal(endlessOpen({ unlocked: 1, bestScore: {} }), false);
  assert.equal(endlessOpen({ unlocked: 50, bestScore: {} }), false,
    'unlocked 50 = S50 disponible, no limpiado');
  assert.equal(endlessOpen({ unlocked: 50, bestScore: { 49: 999 } }), false);
  assert.equal(endlessOpen(campaignDone()), true);
  assert.equal(endlessOpen(null), false);
});

test('endless: la profundidad a continuar es la mejor limpiada + 1', () => {
  assert.equal(bestDepth({ unlocked: 50, bestScore: {} }), 0);
  assert.equal(nextEndlessStage({ unlocked: 50, bestScore: {} }), 51);
  const p = campaignDone({ endless: { best: 62, daily: { date: '', bestScore: 0 } } });
  assert.equal(bestDepth(p), 62);
  assert.equal(nextEndlessStage(p), 63);
  // Un `best` corrupto no abre nada por sí solo.
  assert.equal(bestDepth(campaignDone({ endless: { best: 999, daily: {} } })), 999,
    'con la campaña completa el récord manda');
  assert.equal(bestDepth(campaignDone({ endless: { best: 'x', daily: {} } })), 0);
});

test('endless: hitos cada 5 etapas del infinito (no en la campaña)', () => {
  assert.equal(MILESTONE_EVERY, 5);
  assert.equal(isMilestone(50), false, 'el S50 es de campaña');
  assert.equal(isMilestone(55), true);
  assert.equal(isMilestone(60), true);
  assert.equal(isMilestone(61), false);
  assert.equal(isMilestone(65), true);
});

test('endless: la recompensa escala cada 10 etapas y el hito paga ×1,5', () => {
  assert.equal(endlessRewardMul(1), 1);
  assert.equal(endlessRewardMul(50), 1, 'la campaña no cambia');
  assert.equal(endlessRewardMul(51), 1);
  assert.equal(endlessRewardMul(59), 1);
  assert.equal(endlessRewardMul(60), 1.5, 'escalón 1 × hito');
  assert.equal(endlessRewardMul(61), 2, 'escalón 2');
  assert.equal(endlessRewardMul(65), 3, 'escalón 2 × hito');
  assert.equal(endlessRewardMul(70), 3, 'escalón 2 × hito');
  assert.equal(endlessRewardMul(71), 3);
  assert.equal(endlessRewardMul(80), 4.5, 'escalón 3 × hito');
  // La ESCALERA (sin hitos) no baja nunca; el hito es un PICO de ×1,5
  // sobre el escalón que le toca (por eso el S56 vale menos que el S55).
  let prev = 0;
  for (let id = 51; id <= 120; id++) {
    if (isMilestone(id)) continue;
    const mul = endlessRewardMul(id);
    assert.ok(mul >= prev, `la escalera no baja en el S${id}`);
    prev = mul;
  }
  for (let id = 55; id <= 120; id += 5) {
    const step = 1 + Math.floor((id - 51) / 10);
    assert.equal(endlessRewardMul(id), step * 1.5, `el hito del S${id} paga ×1,5`);
  }
});

test('daily: la fecha es LOCAL y con formato YYYY-MM-DD', () => {
  assert.equal(dailyKey(new Date(2026, 9, 26)), '2026-10-26');
  assert.equal(dailyKey(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(dailyKey(new Date('2026-12-31T12:00:00')), '2026-12-31');
});

test('daily: la misma fecha da la MISMA etapa y la MISMA semilla (dos jugadores)', () => {
  const a = dailyRun('2026-10-26');
  const b = dailyRun('2026-10-26');
  assert.deepEqual(a, b);
  assert.equal(a.date, '2026-10-26');
  assert.equal(a.stage, dailyStage('2026-10-26'));
  assert.equal(a.seed, dailySeed('2026-10-26'));
  // Fechas distintas: la semilla cambia (y con ella la composición de olas).
  assert.notEqual(dailySeed('2026-10-26'), dailySeed('2026-10-27'));
});

test('daily: la etapa del día siempre cae en 51..60 y rota con los días', () => {
  assert.equal(DAILY_STAGES, 10);
  const stages = new Set();
  for (let i = 0; i < 60; i++) {
    const d = new Date(2026, 0, 1 + i);
    const run = dailyRun(d);
    assert.equal(run.date, dailyKey(d));
    assert.ok(run.stage >= ENDLESS_START && run.stage < ENDLESS_START + DAILY_STAGES,
      `etapa del día fuera de rango: ${run.stage}`);
    assert.ok(Number.isInteger(run.seed) && run.seed >= 0, 'la semilla es un uint32');
    stages.add(run.stage);
  }
  assert.ok(stages.size >= 5, `el diario debería rotar etapas, salieron ${stages.size}`);
});

test('daily: la semilla no depende del reloj ni del azar local', () => {
  const before = dailySeed('2027-03-14');
  for (let i = 0; i < 100; i++) Math.random();
  assert.equal(dailySeed('2027-03-14'), before);
});
