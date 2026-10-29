// tests/test-endless-waves.mjs — fase 67 (modo infinito)
// Cubre la parte del DIRECTOR DE OLAS (js/waves.js): la cola de `budgetFit`
// sobre el S50 (el único dial de "más enemigos", porque `classicDensity` está
// topada desde el S37), los nombres de jefe por vuelta (nunca el fallback), las
// élites por profundidad, la semilla inyectable del WaveManager (desafío
// diario) y la apertura en profundidad (≥2 olas + crystal).
//
// La campaña NO cambia: las anclas ≤50 de `budgetFit` y los nombres de 1..50 se
// comparan contra sus valores exactos.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OPEN_T, ENDLESS_FIT_SLOPE, ENDLESS_FIT_QUAD, budgetFit, waveBudget,
  bossNameForStage, BOSS_NAMES, variantChanceFor, assignVariant,
  generateStageWaves, waveGroups, waveCount,
} from '../js/waves.js';
import { WaveManager } from '../js/waves-manager.js';
import { ENEMY_TYPES } from '../js/enemies.js';

/** Semillas de la sonda del director (las mismas que usa test-stages.mjs). */
const SEEDS = 20;
const seedOf = (id, s) => 1000 + s * 7919 + id;

/** Enemigos de una etapa completa (apertura + tramo clásico + jefe). */
function stageEnemies(waves) {
  return waves.reduce((a, w) => a + waveCount(w), 0);
}

/** HP BASE de una etapa (sin el `hpMul` del stage), como lo mide la sonda. */
function stageHp(waves) {
  return waves.reduce((a, w) => a + waveGroups(w)
    .reduce((x, g) => x + (ENEMY_TYPES[g.type]?.hp ?? 0) * (g.count ?? 1), 0), 0);
}

/** Media de `SEEDS` semillas de una métrica sobre las olas de la etapa. */
function avgOf(id, metric) {
  let sum = 0;
  for (let s = 0; s < SEEDS; s++) sum += metric(generateStageWaves(id, seedOf(id, s)));
  return sum / SEEDS;
}

// ============================================================
// 1. budgetFit — la cola del infinito y la campaña intacta
// ============================================================

test('fase 67: budgetFit deja la campaña EXACTA (mismas anclas, mismo redondeo)', () => {
  assert.equal(budgetFit(50), 1.21, 'el ancla del S50 sigue siendo 1,21');
  assert.equal(budgetFit(10), 0.97);
  assert.equal(budgetFit(20), 1.24);
  // S49 se interpola entre [40, 1.04] y [50, 1.21]: 1,04 + 0,9 × 0,17 ≈ 1,193.
  assert.equal(budgetFit(49), 1.04 + ((49 - 40) / (50 - 40)) * (1.21 - 1.04));
  assert.ok(Math.abs(budgetFit(49) - 1.193) < 1e-9, `budgetFit(49) = ${budgetFit(49)}`);
});

test('fase 67: budgetFit > 50 es una cola lineal desde el S50', () => {
  assert.equal(ENDLESS_FIT_QUAD, 0, 'v1 sin término cuadrático');
  assert.ok(ENDLESS_FIT_SLOPE > 0, 'la cola tiene que subir');
  assert.equal(budgetFit(51), 1.21 + ENDLESS_FIT_SLOPE);
  assert.ok(budgetFit(55) > budgetFit(51), 'S55 > S51');
  assert.ok(budgetFit(60) > budgetFit(55), 'S60 > S55');
  assert.ok(budgetFit(60) > budgetFit(50), 'el infinito arranca por encima del S50');
});

test('fase 67: waveBudget crece con la profundidad (50 < 60 < 70 < 80)', () => {
  // t dentro del tramo clásico (t >= OPEN_T): la apertura tiene su propio
  // modelo de matabilidad y no usa `waveBudget`.
  const t = 60;
  const b = [50, 60, 70, 80].map((id) => waveBudget(id, t));
  for (let i = 1; i < b.length; i++) {
    assert.ok(b[i] > b[i - 1], `waveBudget(${[50, 60, 70, 80][i]}, ${t}) = ${b[i]} `
      + `debería superar a ${b[i - 1]}`);
  }
  // `classicDensity` está topada en 4,6: todo el aumento sale de la cola
  // del fit (1,51 / 1,21 ≈ +24,8 % por descarga en el S60).
  assert.ok(b[1] / b[0] > 1.2, `S60/S50 = ${(b[1] / b[0]).toFixed(3)}`);
});

// ============================================================
// 2. Más enemigos y más HP con la profundidad
// ============================================================

test('fase 67: el infinito trae más enemigos y más HP que el S50', () => {
  // Medido con 20 semillas y SLOPE = 0,04 (probe-waves final): enemigos
  // 472 → 534 → 586 (+13 % en S60, +24 % en S70) y HP por etapa 96k → 141k
  // → 193k (+47 % / +101 %).
  //
  // OJO con el número de enemigos: NO escala 1:1 con el presupuesto. El
  // reparto es por HP base del tipo (redondeo a 1 enemigo por grupo, moldes
  // con `cap`) y, con la parte del grupo más grande, `pickTypeForRole` deja
  // entrar más tanques: +25 % de presupuesto da ≈ +13 % de enemigos y
  // +47 % de HP. La hipótesis de +20 % de ENEMIGOS del design no se cumple
  // (el conteo crece la mitad que el presupuesto), así que la guarda de
  // "más enemigos" queda en +8 %.
  const avg50 = avgOf(50, stageEnemies);
  const avg60 = avgOf(60, stageEnemies);
  const avg70 = avgOf(70, stageEnemies);
  assert.ok(avg70 > avg60, `S70 (${avg70.toFixed(1)}) debería superar al S60 (${avg60.toFixed(1)})`);
  assert.ok(avg60 > avg50, `S60 (${avg60.toFixed(1)}) debería superar al S50 (${avg50.toFixed(1)})`);
  assert.ok(avg60 >= avg50 * 1.08,
    `S60 ${avg60.toFixed(1)} vs S50 ${avg50.toFixed(1)} (${(avg60 / avg50).toFixed(3)})`);

  const hp50 = avgOf(50, stageHp);
  const hp60 = avgOf(60, stageHp);
  const hp70 = avgOf(70, stageHp);
  assert.ok(hp70 > hp60, `HP base S70 (${Math.round(hp70)}) > S60 (${Math.round(hp60)})`);
  assert.ok(hp60 > hp50 * 1.12,
    `HP base S60 ${Math.round(hp60)} vs S50 ${Math.round(hp50)} (${(hp60 / hp50).toFixed(3)})`);
});

// ============================================================
// 3. Nombres de jefe por vuelta (fase 67)
// ============================================================

test('fase 67: los jefes del infinito rotan nombre y vuelta (nunca el fallback)', () => {
  // La campaña conserva sus nombres (fase 46).
  assert.equal(BOSS_NAMES[10], 'Blob Rey');
  assert.equal(BOSS_NAMES[50], 'Híbrido Primordial');
  assert.equal(bossNameForStage(10), 'Blob Rey');
  assert.equal(bossNameForStage(50), 'Híbrido Primordial');

  assert.equal(bossNameForStage(60), 'Meteorito Colosal II');
  assert.equal(bossNameForStage(70), 'Blob Rey II');
  assert.equal(bossNameForStage(110), 'Híbrido Primordial II');
  assert.equal(bossNameForStage(120), 'Meteorito Colosal III');
  assert.equal(bossNameForStage(130), 'Blob Rey III');

  // La primera vuelta del ciclo son 6 nombres distintos: el fallback repetido
  // hacía que todos los jefes del endgame se llamaran "Meteorito Errante".
  const vuelta = [60, 70, 80, 90, 100, 110].map((id) => bossNameForStage(id));
  assert.equal(new Set(vuelta).size, 6, `nombres repetidos: ${vuelta.join(', ')}`);
  for (const name of vuelta) {
    assert.notEqual(name, 'Meteorito Errante', `S∞ sin nombre propio: ${name}`);
  }
  assert.notEqual(bossNameForStage(60), bossNameForStage(70), 'S60 y S70 no se llaman igual');

  // Etapas ∞ sin jefe (sólo los múltiplos de 10 tienen).
  assert.equal(bossNameForStage(55), null);
});

// ============================================================
// 4. Élites por profundidad (fase 67)
// ============================================================

test('fase 67: las élites escalan con la profundidad (0,70 → techo 0,85)', () => {
  // La campaña no cambia.
  for (const id of [10, 20, 50]) assert.equal(variantChanceFor(id), 0.7, `S${id}`);
  assert.ok(variantChanceFor(51) > 0.7, '+1 punto por etapa desde el S50');
  assert.equal(variantChanceFor(51), 0.71);
  assert.equal(variantChanceFor(60), 0.8);
  for (const id of [65, 70, 80, 90]) {
    assert.equal(variantChanceFor(id), 0.85, `S${id} debería estar en el techo`);
  }

  // Y la chance se APLICA en `assignVariant` (punto único de asignación):
  // con rnd() = 0,75 el S50 (0,70) va sin élite y el S60 (0,80) lleva una.
  const groups = () => [
    { type: 'spore', count: 10, pattern: 'vee' },
    { type: 'meteor', count: 2, pattern: 'line' },
  ];
  assert.equal(assignVariant(groups(), 50, () => 0.75), null);
  // fase 68: con 7 afijos el id concreto depende del pool; lo que importa
  // es que ASIGNE una variante válida cuando la chance sube.
  const elite = assignVariant(groups(), 60, () => 0.75);
  assert.ok(typeof elite === 'string' && elite.length > 0, 'S60 sí lleva élite');
});

// ============================================================
// 5. Semilla inyectable (desafío diario) y determinismo
// ============================================================

test('fase 67: la semilla del WaveManager es inyectable y determinista', () => {
  const a = new WaveManager(55, { seed: 1234 });
  const b = new WaveManager(55, { seed: 1234 });
  assert.ok(a.queue.length > 0, 'la etapa ∞ tiene olas');
  assert.deepEqual(a.queue, b.queue, 'la misma semilla da la misma cola');
  assert.notDeepEqual(a.queue, new WaveManager(55, { seed: 1235 }).queue,
    'otra semilla da otra composición');

  // Sin seed se conserva el sorteo por run de siempre (la firma vieja no rompe).
  const sinSeed = new WaveManager(55);
  assert.ok(sinSeed.queue.length > 0, 'sin seed la etapa sigue teniendo olas');
});

test('fase 67: generateStageWaves es determinista por (etapa, semilla)', () => {
  assert.deepEqual(generateStageWaves(60, 777), generateStageWaves(60, 777));
  assert.notDeepEqual(generateStageWaves(60, 777), generateStageWaves(60, 778));
});

// ============================================================
// 6. Apertura en profundidad (el riesgo del design)
// ============================================================

test('fase 67: la apertura del infinito sigue siendo jugable (≥2 olas y crystal)', () => {
  // El crystal de la apertura es CONDICIONAL a que el Guardian lo mate dentro
  // de su ventana de tiro; test-stages.mjs fija esa misma regla para la
  // campaña (con el Lv1 DESNUDO ni el S45/S50 lo tienen, y el doc prohíbe
  // meterlo si no se puede matar: su XP se perdería y robaría DPS). En el
  // infinito el jugador tiene el meta topado (Nvl.100 → 1 + 5 % × 99 ≈ 5,95),
  // así que el modelo de la apertura se mide con esa potencia real.
  const powerMul = 5.95;
  for (const id of [60, 80]) {
    for (let s = 0; s < 10; s++) {
      const open = generateStageWaves(id, seedOf(id, s), { powerMul })
        .filter((w) => w.t < OPEN_T);
      assert.ok(open.length >= 2,
        `S${id} seed ${seedOf(id, s)}: la apertura tiene ${open.length} olas`);
      const crystals = open
        .filter((w) => waveGroups(w).some((g) => g.type === 'crystal'));
      assert.ok(crystals.length >= 1,
        `S${id} seed ${seedOf(id, s)}: sin crystal en los primeros ${OPEN_T} s`);
    }
  }
});
