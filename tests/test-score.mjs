// tests/test-score.mjs — dev-7 fase 9
// Cubre score.js: fórmulas puras de XP/racha/score. Sin estado, ya
// diseñado para ser testeado desde Node (ver el comentario de cabecera
// del propio archivo).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  xpForLevel, multForStreak, baseScoreForEnemy, speedMult,
  stageClearBonus, applyXp, xpForKill, xpScaleForStage, levelScaleForStage,
  overflowScore, LEVEL_PRICE_PER_STAGE, OVERFLOW_SCORE_PER_XP,
  MAX_CARDS_PER_STAGE, MAX_LEVEL_PER_STAGE,
} from '../js/score.js';

test('xpForLevel: creciente y determinista', () => {
  assert.equal(xpForLevel(1), 60);
  assert.equal(xpForLevel(2), 105);
  let prev = -Infinity;
  for (let n = 1; n <= 50; n++) {
    const v = xpForLevel(n);
    assert.ok(v > prev);
    prev = v;
  }
});

// ------------------------------------------------------------
// dev-7 fase 59.3 — LA ECONOMÍA DE LAS BAJAS
// ------------------------------------------------------------

test('xpScaleForStage: 1 en el S1 y crece con el hpMul del stage', () => {
  assert.equal(xpScaleForStage(1), 1);
  assert.equal(xpScaleForStage(5), 2.4);   // 1 + 0,35×4
  // dev-7 fase 59.5: la pendiente del HP enemigo baja de 0,22 a 0,14 por
  // etapa (el jugador de la trayectoria mataba solo el 51-73 % de la ola
  // en las etapas tardías, y con la regla del 25 % de fugas eso lo hacía
  // perder: la distancia DPS-vs-HP se abría ×5,5). Con la pendiente
  // nueva la energía por baja escala con el MISMO hpMul, así que estas
  // cifras se derivan de scaleFor() y no de un número escrito a mano.
  assert.ok(Math.abs(xpScaleForStage(10) - 3.1) < 1e-9);  // 2,40 + 0,14×5
  assert.ok(Math.abs(xpScaleForStage(50) - 8.7) < 1e-9);  // 2,40 + 0,14×45
  // datos corruptos → 1 (nunca 0 ni NaN: el XP no puede desaparecer)
  assert.equal(xpScaleForStage(0), 1);
  assert.equal(xpScaleForStage(-3), 1);
  assert.equal(xpScaleForStage('x'), 1);
  assert.equal(xpScaleForStage(undefined), 1);
});

test('levelScaleForStage: el precio sube LEVEL_PRICE_PER_STAGE por etapa y en el S1 es 1', () => {
  // dev-7 fase 64: el dial pasa de +2 %/etapa a LEVEL_PRICE_PER_STAGE
  // (+8 %/etapa, calibrado con el simulador: ver el comentario del dial).
  // El S1 — y con él toda la campaña temprana — NO se mueve.
  assert.equal(levelScaleForStage(1), 1);
  assert.equal(levelScaleForStage(11), 1 + LEVEL_PRICE_PER_STAGE * 10);
  assert.equal(levelScaleForStage(50), 1 + LEVEL_PRICE_PER_STAGE * 49);
  // La razón de ser del cambio: el S50 tiene que pedir bastante más que
  // antes (con +2 % pedía ×1,98 y el XP por kill escalaba ×8,7 → 35 niveles).
  // El umbral del assert deja aire al dial (±): lo que importa es el orden
  // (×4,9 con 0,08), no el decimal exacto de una recalibración futura.
  assert.ok(levelScaleForStage(50) > 3.5, `S50 = ${levelScaleForStage(50)}`);
  // …pero SIEMPRE por debajo del ritmo del XP por kill: si el precio
  // escalara igual que la energía (hpMul), el nº de niveles por etapa sería
  // el mismo en el S1 y en el S50 (constante), y la campaña dejaría de dar
  // espacio al arsenal en las etapas duras.
  assert.ok(levelScaleForStage(50) < xpScaleForStage(50));
  assert.equal(levelScaleForStage(0), 1);
  assert.equal(levelScaleForStage('x'), 1);
});

test('xpForLevel: con stage, el umbral escala (el S1 NO cambia)', () => {
  assert.equal(xpForLevel(1, 1), 60);
  assert.equal(xpForLevel(2, 1), 105);
  // fase 64: el S50 pide ×4,9 (antes ×1,98); el dial es LEVEL_PRICE_PER_STAGE
  assert.equal(xpForLevel(2, 50), Math.round(105 * levelScaleForStage(50)));
  assert.equal(xpForLevel(1, 50), Math.round(60 * levelScaleForStage(50)));
  // round(915 × L(50)): ancla del Nvl 20 (el número sale del dial, no se
  // escribe a mano — el dial se recalibra con el simulador, la fórmula no).
  assert.equal(xpForLevel(20, 50), Math.round(915 * levelScaleForStage(50)));
});

test('fase 64: el umbral del S50 escala al ritmo de la energía (niveles por etapa ≈planos)', () => {
  // El criterio viejo era que el precio subiera MUCHO más despacio que el XP
  // (×1,98 vs ×8,7 de energía): la etapa del S50 pagaba ×2,7 niveles más que
  // la del S1 (13 → 35, medido con el simulador) y 35 cartas volvían la run
  // abrumadora. Ahora el precio sube al ritmo de la fuente de XP.
  assert.ok(xpForLevel(20, 50) > xpForLevel(20, 1) * 3.5);
  assert.ok(xpForLevel(20, 50) < xpForLevel(20, 1) * xpScaleForStage(50));
  // Y la parte que NO depende del dial (es provisional): el tope duro.
  assert.equal(MAX_LEVEL_PER_STAGE, MAX_CARDS_PER_STAGE + 1);
  assert.equal(MAX_CARDS_PER_STAGE, 20);
});

test('xpForKill: el XP escala con la etapa (la energía sigue al HP)', () => {
  const spore = { scoreReward: 5 };
  assert.equal(xpForKill(spore, 1), 5);
  // dev-7 fase 59.5: el hpMul del S10 es 3,1 y el del S50 es 8,7 (la
  // pendiente bajó de 0,22 a 0,14 por etapa; ver xpScaleForStage).
  assert.ok(Math.abs(xpForKill(spore, 10) - 5 * 3.1) < 1e-9);
  assert.ok(Math.abs(xpForKill(spore, 50) - 5 * 8.7) < 1e-9);
  // el jefe NO escala: muere al final de la etapa, su XP no se gasta
  const boss = { scoreReward: 700, isBoss: true };
  assert.equal(xpForKill(boss, 50), 700);
  // sin enemigo / sin score → 0
  assert.equal(xpForKill(null, 10), 0);
  assert.equal(xpForKill({}, 10), 0);
});

test('xpForKill: el SCORE sigue plano (la leaderboard no escala ×12)', () => {
  const spore = { scoreReward: 5 };
  assert.equal(baseScoreForEnemy(spore), 5);
  assert.equal(baseScoreForEnemy(spore), 5); // el score no depende del stage
  assert.ok(xpForKill(spore, 50) > baseScoreForEnemy(spore) * 5,
    'la energía sí escala: es la moneda interna de la partida');
});

test('multForStreak: 1x / 1.5x (10) / 2x (25) / 3x (50)', () => {
  assert.equal(multForStreak(0), 1);
  assert.equal(multForStreak(9), 1);
  assert.equal(multForStreak(10), 1.5);
  assert.equal(multForStreak(24), 1.5);
  assert.equal(multForStreak(25), 2);
  assert.equal(multForStreak(49), 2);
  assert.equal(multForStreak(50), 3);
  assert.equal(multForStreak(999), 3); // no sigue creciendo más allá del cap
});

test('baseScoreForEnemy: soporta scoreReward número o función, y ausencia', () => {
  assert.equal(baseScoreForEnemy({ scoreReward: 10 }), 10);
  assert.equal(baseScoreForEnemy({ scoreReward: () => 25 }), 25);
  assert.equal(baseScoreForEnemy({}), 0);
  assert.equal(baseScoreForEnemy(null), 0);
});

test('speedMult: solo premia x1.5 y x2, no valores intermedios', () => {
  assert.equal(speedMult(1), 1);
  assert.equal(speedMult(1.5), 1.1);
  assert.equal(speedMult(2), 1.25);
});

test('stageClearBonus: base 1000 + 250/stage (fase 59: sin el termino por HP)', () => {
  // dev-7 fase 59: el bonus ya NO suma 5×HP restante. Con la base como
  // colchón (presupuesto de fugas) el jugador good termina siempre con el
  // 95-100 %: el termino era un número fijo enorme que dominaba el score
  // sin medir nada. Lo que antes "premiaba" dejar pasar ya no se premia:
  // la REGLA del 25 % de fugas decide la victoria.
  assert.equal(stageClearBonus(1), 1250);
  assert.equal(stageClearBonus(5), 2250);
  assert.equal(stageClearBonus(50), 13500);
});

test('applyXp: no muta, devuelve los level-ups producidos (puede ser >1 de una)', () => {
  const before = Object.freeze({ lv: 1, xp: 0 });
  const r = applyXp(before.lv, before.xp, xpForLevel(1) + xpForLevel(2) + 5);
  assert.equal(r.lv, 3);
  assert.deepEqual(r.ups, [2, 3]);
  assert.equal(r.xp, 5);
  assert.equal(r.overflow, 0);
});

test('applyXp: XP negativa o nula no rompe ni hace subir de nivel', () => {
  const r = applyXp(3, 10, -100);
  assert.equal(r.lv, 3);
  assert.equal(r.xp, 10);
  assert.deepEqual(r.ups, []);
  assert.equal(r.overflow, 0);
});

// ------------------------------------------------------------
// dev-7 fase 64 — EL TOPE DE CARTAS POR ETAPA
// ------------------------------------------------------------

test('applyXp: sin llegar al tope se comporta igual que antes (overflow 0)', () => {
  // La firma vieja devolvía {lv, xp, ups}: los tres campos siguen ahí con el
  // mismo valor; lo único nuevo es `overflow`, y sin tope alcanzado es 0.
  assert.deepEqual(applyXp(5, 20, 300, 1), { lv: 6, xp: 80, ups: [6], overflow: 0 });
  assert.deepEqual(applyXp(1, 0, 0, 50), { lv: 1, xp: 0, ups: [], overflow: 0 });
});

test('applyXp: el nivel no pasa del tope (MAX_LEVEL_PER_STAGE) y el sobrante va a overflow', () => {
  // Ya en el tope: no sube más, `xp` queda vacío y TODO lo entrante desborda.
  const atCap = applyXp(MAX_LEVEL_PER_STAGE, 0, 1000, 1);
  assert.equal(atCap.lv, MAX_LEVEL_PER_STAGE);
  assert.deepEqual(atCap.ups, []);
  assert.equal(atCap.xp, 0);
  assert.equal(atCap.overflow, 1000);
  // Ni con la energía de una etapa ENTERA del S50 (el tope es duro).
  const full = applyXp(1, 0, 1e9, 50);
  assert.equal(full.lv, MAX_LEVEL_PER_STAGE);
  assert.equal(full.ups.length, MAX_CARDS_PER_STAGE);
  assert.equal(full.xp, 0);
  assert.ok(full.overflow > 0);
  // El tope es inyectable: el sim y los tests pueden moverlo.
  const low = applyXp(1, 0, 1e9, 1, 3);
  assert.equal(low.lv, 3);
  assert.deepEqual(low.ups, [2, 3]);
  assert.equal(applyXp(1, 0, 1e9, 1, 0).ups.length, MAX_CARDS_PER_STAGE); // basura → tope real
});

test('applyXp: el sobrante EXACTO de un level-up que se pasa del tope', () => {
  const need = xpForLevel(MAX_LEVEL_PER_STAGE - 1, 1); // último umbral de la etapa
  const r = applyXp(MAX_LEVEL_PER_STAGE - 1, 0, need + 400, 1);
  assert.equal(r.lv, MAX_LEVEL_PER_STAGE);
  assert.deepEqual(r.ups, [MAX_LEVEL_PER_STAGE]);
  assert.equal(r.xp, 0);
  assert.equal(r.overflow, 400); // exactos: ni uno de más ni de menos
  // Y el sobrante no se tira: vale SCORE (ver overflowScore).
  assert.equal(overflowScore(r.overflow, 1), 400 * OVERFLOW_SCORE_PER_XP);
  // El remanente que quedaba al llegar al tope también desborda (si no, se
  // perdería: en el tope el XP ya no tiene dónde acumularse).
  assert.equal(applyXp(MAX_LEVEL_PER_STAGE, 123, 0, 1).overflow, 123);
});

test('overflowScore: convierte a valor de stage 1 (el score es plano) y tolera basura', () => {
  assert.equal(overflowScore(1000, 1), 1000 * OVERFLOW_SCORE_PER_XP);
  // 1 000 XP de sobrante del S50 valen ~230 de score: el XP está escalado por
  // la etapa (hpMul 8,7) pero el SCORE de la leaderboard NO escala, así que se
  // convierte a valor de S1 (1000 / 8,7 × 2) en vez de sumar 2 000.
  assert.equal(overflowScore(1000, 50), 230);
  assert.equal(overflowScore(1000, 50),
    Math.round((1000 / xpScaleForStage(50)) * OVERFLOW_SCORE_PER_XP));
  assert.ok(overflowScore(1000, 10) > overflowScore(1000, 50));
  // Basura, cero o negativo → 0 (nunca NaN: el score no puede envenenarse)
  for (const bad of [0, -100, NaN, undefined, null, 'x', Infinity, -Infinity]) {
    assert.equal(overflowScore(bad, 50), 0, `overflowScore(${String(bad)})`);
  }
});
