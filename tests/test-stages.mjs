// tests/test-stages.mjs — dev-7 fase 9
// Cubre stages.js: la curva de dificultad scaleFor(), BASE_HP_BY_STAGE y
// el patrón de boss cada década. Incluye un test de REGRESIÓN explícito
// para el bug de fase 7 (docs/BALANCE.md "Plan integral §4.1"): la dificultad
// caía al pasar de stage 5 a 6 en vez de seguir subiendo.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, BASE_HP_BY_STAGE, scaleFor, isBossStage, LEAK_HP_FRAC, leakDamageFor } from '../js/stages.js';
import {
  STAGE_WAVES, generateStageWaves, campaignWaves, OPEN_T, waveGroups, waveTypes, waveCount, openingHpBudget,
  WaveManager, bossNameForStage, bossForStage, SWARM_TYPES, openingSwarmForStage,
  WAVE_ARCHETYPES, ARCHETYPE_NAMES, archetypeOf, pickArchetype, waveSchedule, composeWave,
  poolForStage, campaignPoolForStage, waveBudget, pressure, variantsForStage, assignVariant,
  VARIANT_DECADES, VARIANT_MAX_FRAC, VEL_BANDS,
} from '../js/waves.js';
import { ENEMY_TYPES, ENEMY_VARIANTS, Enemy, effectiveHpOf } from '../js/enemies.js';
import { ENEMY_FAMILY_BY_TYPE, ENEMY_FAMILY_IDS } from '../js/damagetypes.js';
import { xpForLevel } from '../js/score.js';
import { survivalWaveChunk } from '../js/survival.js';

/**
 * dev-7 fase 27: las olas pueden venir en el formato legacy
 * ({type,count,pattern}) o en el de grupos ({groups:[...]}). Todos los
 * tests leen vía estos helpers, así que valen para las dos formas.
 */
const waveType = (w) => waveTypes(w)[0] ?? null;
const wavePattern = (w) => waveGroups(w)[0]?.pattern ?? null;
const hasType = (w, t) => waveTypes(w).includes(t);
const isBossWave = (w) => waveGroups(w).some((g) => g.type === 'boss' || g.pattern === 'boss');

test('STAGES: 50 stages con ids 1..50 secuenciales', () => {
  assert.equal(STAGES.length, 50);
  STAGES.forEach((s, i) => assert.equal(s.id, i + 1));
});

test('BASE_HP_BY_STAGE: una entrada positiva por cada stage', () => {
  for (const s of STAGES) {
    const hp = BASE_HP_BY_STAGE[s.id];
    assert.ok(Number.isFinite(hp) && hp > 0, `stage ${s.id} sin HP válido`);
  }
});

test('fase 59: la vida de la base es una curva por etapa (determinista y monótona)', () => {
  // La curva nueva (fase 59.2): 2000 + 480×(stage−1), redondeada a 100.
  // Antes era 3000 + 500×(stage−1), que valía el 32 % de la ola en el S1 y
  // el 16 % en el S50 — la base era un colchón infinito con la fuga sin
  // tope. Ahora la base es el "presupuesto de fugas": aguanta en torno al
  // 12 % del HP que la etapa tira, y el jugador que mata al 75 % sobrevive
  // (la REGLA del 25 % es el juez de todos los demás).
  const esperado = { 1: 2000, 2: 2500, 3: 2900, 4: 3400, 5: 3800, 10: 6300, 21: 11600, 50: 25500 };
  for (const [stage, hp] of Object.entries(esperado)) {
    assert.equal(BASE_HP_BY_STAGE[Number(stage)], hp, `S${stage}: la vida de la base cambió`);
  }
  // Monótona: la vida de la base nunca baja al avanzar de etapa.
  let prev = 0;
  for (const s of STAGES) {
    assert.ok(BASE_HP_BY_STAGE[s.id] > prev, `S${s.id}: la vida de la base bajó`);
    prev = BASE_HP_BY_STAGE[s.id];
  }
});

test('isBossStage: stage 1 y cada década (10, 20, 30, 40, 50) tienen boss', () => {
  for (const s of [1, 10, 20, 30, 40, 50]) assert.equal(isBossStage(s), true);
  for (const s of [2, 5, 9, 11, 15, 25, 49]) assert.equal(isBossStage(s), false);
});

test('tablas manuales 1..5: ola boss en la tabla ⇔ isBossStage (regresión v6)', () => {
  // Regresión v6: la migración "boss solo en 1/10/20/30/40/50" dejó a S1
  // sin ola boss (el stage cerraba por onWavesDone, sin WARNING ni jefe)
  // y a S3 con una ola 'boss' vestigial de dev-5 (isBossStage(3) era false
  // y spawneaba un jefe genérico fantasma). Falla si vuelve a pasar.
  for (let id = 1; id <= 5; id++) {
    const table = STAGE_WAVES[id];
    assert.ok(Array.isArray(table) && table.length > 0, `S${id}: tabla manual vacía`);
    const bossIdx = table.findIndex((w) => isBossWave(w));
    if (isBossStage(id)) {
      assert.ok(bossIdx !== -1, `S${id} ES boss stage pero su tabla no tiene ola boss`);
      assert.equal(bossIdx, table.length - 1, `S${id}: la ola boss debe ser la ÚLTIMA de la tabla`);
    } else {
      assert.equal(bossIdx, -1, `S${id} NO es boss stage pero su tabla tiene ola boss (vestigio dev-5)`);
    }
  }
});

test('scaleFor: stage 1 es la base (hpMul=1, velMul=1)', () => {
  const sc = scaleFor(1);
  assert.equal(sc.hpMul, 1);
  assert.equal(sc.velMul, 1);
});

test('scaleFor: monótona NO decreciente en toda la campaña (1..50)', () => {
  // Regresión directa del bug de fase 7: scaleFor(6) < scaleFor(5) antes
  // del fix (la curva larga reiniciaba desde la base). Este test falla
  // si alguien vuelve a introducir una discontinuidad en cualquier punto
  // de la campaña, no solo en el 5→6.
  let prevHp = -Infinity;
  let prevVel = -Infinity;
  for (let s = 1; s <= 50; s++) {
    const sc = scaleFor(s);
    assert.ok(sc.hpMul >= prevHp - 1e-9,
      `hpMul cae en stage ${s}: ${sc.hpMul} < ${prevHp}`);
    assert.ok(sc.velMul >= prevVel - 1e-9,
      `velMul cae en stage ${s}: ${sc.velMul} < ${prevVel}`);
    prevHp = sc.hpMul;
    prevVel = sc.velMul;
  }
});

test('scaleFor: pin explícito de la transición 5→6 (bug fase 7)', () => {
  const s5 = scaleFor(5);
  const s6 = scaleFor(6);
  assert.ok(s6.hpMul > s5.hpMul, `stage 6 (${s6.hpMul}) debe ser MÁS difícil que stage 5 (${s5.hpMul})`);
  assert.ok(s6.velMul > s5.velMul);
  // La curva larga debe anclar exactamente en el valor de stage 5, no
  // reiniciar desde la base — si esto falla, alguien volvió a la fórmula
  // vieja (1 + 0.22*(stage-1)) en vez de anclar en hpAtFive.
  // dev-7 fase 59.5: la pendiente es 0,14/stage. Bajó de 0,22 porque con
  // la regla del 25 % de fugas (fase 59.2) el muro de la fase 28 era
  // demasiado: medido, el jugador de la trayectoria mataba solo el 51-73 %
  // de la ola en las etapas tardías y la regla lo hacía perder. La
  // distancia DPS-vs-HP de la campaña estaba ×5,5 abierta (el HP de la
  // ola crece ×17,6 de S1 a S50 y el poder del meta solo ×3,2).
  assert.ok(Math.abs(s6.hpMul - (s5.hpMul + 0.14)) < 1e-9);
});

test('scaleFor: tramo 1-5 (curva corta, ya simulada en docs/BALANCE.md) intacto', () => {
  // Pin de los valores exactos documentados en docs/BALANCE.md — si cambian,
  // TODAS las tablas de docs/BALANCE.md dejan de ser válidas.
  const expected = { 1: 1, 2: 1.35, 3: 1.7, 4: 2.05, 5: 2.4 };
  for (const [stage, hpMul] of Object.entries(expected)) {
    assert.ok(Math.abs(scaleFor(Number(stage)).hpMul - hpMul) < 1e-9,
      `stage ${stage} cambió de hpMul (esperado ${hpMul})`);
  }
});

// ------------------------------------------------------------
// generateStageWaves — apertura farmable (balance v7). Regresión de la
// hambruna de XP de stage 6 ("no maté casi ningún enemigo con la torre
// básica"): mientras t < OPEN_T el generador garantiza olas matables con
// el Guardian Lv1 (tipos ligeros + patrones centrados + cristal XP+) y
// SIN types pesados ni rain/wall; el tramo t >= OPEN_T vuelve al clásico.
// ------------------------------------------------------------
const GEN_IDS = [6, 7, 8, 9, 10, 20, 50];
const GEN_SEEDS = [1234, 987654];

test('generateStageWaves: la apertura (t<OPEN_T) es 100% farmable', () => {
  for (const id of GEN_IDS) {
    for (const seed of GEN_SEEDS) {
      const waves = generateStageWaves(id, seed);
      const open = waves.filter((w) => w.t < OPEN_T);
      assert.ok(open.length >= 2, `S${id} seed ${seed}: apertura vacía`);
      for (const w of open) {
        // Fase 27: la apertura puede tener VARIOS grupos, pero todos tienen
        // que cumplir las reglas del cono del Guardian.
        for (const g of waveGroups(w)) {
          assert.notEqual(ENEMY_TYPES[g.type]?.role, 'tank',
            `S${id} seed ${seed}: tanque '${g.type}' en apertura (t=${w.t})`);
          assert.ok(g.pattern !== 'rain' && g.pattern !== 'wall',
            `S${id} seed ${seed}: patrón '${g.pattern}' en apertura (t=${w.t})`);
          assert.ok(FARMABLE_TYPES.includes(g.type),
            `S${id} seed ${seed}: tipo inesperado '${g.type}' en apertura`);
        }
      }
    }
  }
});

test('generateStageWaves: la ola 0 es un enjambre en vee (primer XP garantizado)', () => {
  for (const id of GEN_IDS) {
    for (const seed of GEN_SEEDS) {
      const first = generateStageWaves(id, seed)[0];
      const g = waveGroups(first)[0];
      assert.ok(SWARM_TYPES.includes(g.type),
        `S${id} seed ${seed}: ola 0 no es un enjambre (${g.type})`);
      assert.equal(g.pattern, 'vee', `S${id} seed ${seed}: ola 0 no es vee`);
      assert.ok(!waveGroups(first).some((x) => x.type === 'crystal'),
        `S${id} seed ${seed}: el crystal reservado no debe caer en la ola 0`);
    }
  }
});

test('generateStageWaves: el crystal de la apertura va en vee y solo donde el Guardian lo alcanza', () => {
  // El crystal es el "bonus de XP" de la apertura, pero su HP escalado
  // lo deja fuera a partir de cierto stage: si el Guardian Lv1 no puede
  // matarlo dentro de su ventana de tiro, el XP se pierde (el jugador no
  // sube de nivel) y encima le roba el DPS al resto de la apertura.
  //
  // Tres zonas:
  //  - no cabe (ttk > ventana, S40+): NO puede aparecer en la apertura;
  //  - cabe pero acapara la ventana (ttk x 2 > ventana): puede salir por
  //    el sorteo del pool, pero SIEMPRE en vee (el cono del Guardian);
  //  - no acapara (ttk x 2 <= ventana): está GARANTIZADO (una vez, en
  //    vee): es el "primer XP garantizado" del doc.
  for (const id of GEN_IDS) {
    for (const seed of GEN_SEEDS) {
      const waves = generateStageWaves(id, seed);
      const { hpMul, velMul } = scaleFor(id);
      const d = ENEMY_TYPES.crystal;
      const hp = d.hp * hpMul;
      const vel = Math.max(1, d.vel * velMul);
      const ttk = hp / GUARDIAN_LV1_DPS;
      const ventana = FALL_PX / vel;
      const crystals = waves.filter((w) => w.t < OPEN_T && hasType(w, 'crystal'));
      if (ttk > ventana) {
        // Ni lo puede matar: fuera (su XP se perdería).
        assert.equal(crystals.length, 0,
          `S${id} seed ${seed}: crystal en la apertura sin que el Guardian Lv1 pueda con él`);
        continue;
      }
      for (const w of crystals) {
        const cg = waveGroups(w).find((g) => g.type === 'crystal');
        assert.equal(cg.pattern, 'vee', `S${id} seed ${seed}: cristal no centrado`);
      }
      if (ttk * 2 <= ventana) {
        // No acapara la ventana del Guardian: está garantizado.
        assert.ok(crystals.length > 0, `S${id} seed ${seed}: sin cristal en apertura`);
      }
    }
  }
});

test('generateStageWaves: el tramo t>=OPEN_T sigue generando heavies (regla clásica intacta)', () => {
  for (const id of GEN_IDS) {
    for (const seed of GEN_SEEDS) {
      const waves = generateStageWaves(id, seed);
      const post = waves.filter((w) => w.t >= OPEN_T);
      const heavy = post.filter((w) => hasType(w, 'miniBlob') || hasType(w, 'blob'));
      // La cadencia clásica (idx%5===3 / idx%7===6 sobre ~25-30 olas) da
      // varios heavies en el tramo medio/final: si no aparece NINGUNO, el
      // generador clásico se rompió (no solo se suavizó la apertura).
      assert.ok(heavy.length > 0, `S${id} seed ${seed}: sin heavies tras t=${OPEN_T}`);
    }
  }
});

test('generateStageWaves: en stages de jefe la última ola es el boss', () => {
  for (const id of [10, 20, 50]) {
    for (const seed of GEN_SEEDS) {
      const waves = generateStageWaves(id, seed);
      const last = waves[waves.length - 1];
      assert.ok(isBossWave(last), `S${id} seed ${seed}: última ola no es boss`);
      const g = waveGroups(last)[0];
      assert.equal(g.type, 'boss');
      assert.equal(g.pattern, 'boss');
    }
  }
});

test('generateStageWaves: en stages SIN jefe nunca aparece ola boss', () => {
  for (const id of [6, 7, 8, 9]) {
    for (const seed of GEN_SEEDS) {
      const waves = generateStageWaves(id, seed);
      assert.equal(waves.findIndex((w) => isBossWave(w)), -1,
        `S${id} seed ${seed}: ola boss en stage sin jefe`);
    }
  }
});

// ------------------------------------------------------------
// dev-7 fase 27 — MIGRACIÓN de las tablas manuales 1..5 al formato
// de GRUPOS (el mismo que el generador procedural de 6..50).
// Ver el bloque de comentario de STAGE_WAVES en js/waves.js.
// ------------------------------------------------------------

const MANUAL_IDS = [1, 2, 3, 4, 5];

/** Tipos que el Guardian Lv1 puede matar dentro de su ventana de tiro. */
const FARMABLE_TYPES = [
  'spore', 'rockSwarm', 'virusSwarm', 'crystalSwarm',
  'fragment', 'meteor', 'crystal',
];
/** Patrones que caen dentro del cono del Guardian (nunca rain/wall). */
const FARMABLE_PATTERNS = ['vee', 'line', 'burst-diag'];
/**
 * DPS del Guardian Lv1 (arranque SOLO-Guardian): 8 dmg / 0.23 s.
 * OJO: es el criterio MÁS ESTRICTO que el del generador procedural
 * (que usa el Guardian Lv3, porque el jugador sube de nivel durante la
 * propia apertura). Las tablas manuales arrancan en Lv1 y su apertura
 * tiene que ser matable DESDE EL PRIMER ENEMIGO.
 */
const GUARDIAN_LV1_DPS = 8 / 0.23;
/** Distancia de caída (px): de SPAWN_Y hasta la base. */
const MANUAL_FALL_PX = 900;

/**
 * Cuántos enemigos de un tipo puede matar el Guardian Lv1 dentro de la
 * ventana de tiro del enemigo (mismo criterio que la apertura del
 * generador procedural, con el HP y la velocidad ESCALADOS del stage).
 */
function maxKillable(type, stage) {
  const d = ENEMY_TYPES[type];
  if (!d) return 0;
  const { hpMul, velMul } = scaleFor(stage);
  const vel = Math.max(1, d.vel * velMul);
  return Math.max(1, Math.floor(((MANUAL_FALL_PX / vel) * GUARDIAN_LV1_DPS) / (d.hp * hpMul)));
}

/**
 * Snapshot de las tablas manuales ANTES de la migración: [t, count] de
 * cada ola. Es la referencia de la MONOTONÍA de dificultad: la cuenta de
 * enemigos de cada ola no puede cambiar (salvo el tope de matabilidad de
 * la apertura) y los tiempos tampoco.
 */
const LEGACY_COUNTS = {
  1: [[1, 2], [4, 3], [7, 4], [10, 4], [13, 1], [15, 5], [18, 5], [21, 2], [23, 6], [27, 2], [29, 7], [32, 5], [35, 2], [37, 8], [42, 6], [46, 9], [50, 3], [54, 10], [59, 7], [63, 11], [69, 8], [74, 12], [79, 3], [85, 13], [91, 9], [97, 13], [103, 4], [109, 10], [115, 15], [123, 4], [131, 16], [141, 11], [151, 1]],
  2: [[1, 6], [5, 7], [9, 7], [13, 1], [16, 6], [20, 2], [24, 6], [28, 5], [32, 2], [36, 8], [40, 2], [43, 6], [47, 8], [51, 2], [56, 6], [60, 7], [64, 10], [68, 3], [72, 2], [78, 8], [83, 9], [88, 16], [93, 3], [99, 5], [105, 10], [111, 18], [117, 4], [124, 5], [131, 11], [138, 20], [146, 5]],
  3: [[1, 5], [5, 2], [9, 5], [13, 6], [17, 1], [21, 6], [25, 3], [29, 1], [33, 8], [37, 2], [41, 8], [45, 3], [49, 8], [53, 2], [57, 2], [63, 9], [69, 4], [75, 10], [81, 3], [87, 2], [94, 4], [101, 12], [108, 3], [115, 3], [122, 5], [129, 10], [137, 14], [145, 4]],
  4: [[1, 6], [6, 5], [11, 5], [16, 8], [21, 2], [26, 1], [30, 9], [34, 7], [38, 2], [42, 12], [46, 2], [50, 4], [54, 12], [58, 8], [62, 3], [69, 14], [76, 2], [83, 4], [90, 9], [97, 16], [104, 3], [111, 3], [118, 5], [125, 18], [132, 3], [139, 10], [147, 4], [156, 20]],
  5: [[1, 6], [7, 6], [13, 8], [19, 4], [25, 5], [31, 8], [37, 4], [43, 2], [49, 6], [55, 2], [61, 10], [66, 1], [71, 1], [75, 12], [79, 3], [86, 4], [93, 12], [100, 10], [107, 18], [114, 4], [121, 3], [128, 6], [135, 14], [142, 12], [149, 4], [152, 2], [156, 20], [164, 5], [172, 13]],
};

test('tablas manuales 1..5: todas las olas usan el formato de grupos', () => {
  for (const id of MANUAL_IDS) {
    const table = STAGE_WAVES[id];
    assert.ok(Array.isArray(table) && table.length > 0, `S${id}: tabla manual vacía`);
    for (const w of table) {
      assert.ok(Array.isArray(w.groups) && w.groups.length > 0,
        `S${id} (t=${w.t}): la ola no tiene groups`);
      assert.equal(w.type, undefined, `S${id} (t=${w.t}): queda el formato legacy {type}`);
      assert.equal(w.count, undefined, `S${id} (t=${w.t}): queda el formato legacy {count}`);
      assert.ok(w.groups.length <= 3, `S${id} (t=${w.t}): ${w.groups.length} grupos (>3)`);
      for (const g of w.groups) {
        assert.ok(g.type && g.count >= 1 && g.pattern, `S${id} (t=${w.t}): grupo incompleto`);
      }
      // La ola de jefe es un caso especial: un grupo único, nunca mezclada.
      if (isBossWave(w)) {
        assert.equal(w.groups.length, 1, `S${id} (t=${w.t}): la ola de jefe no es un grupo único`);
        assert.equal(w.groups[0].type, 'boss');
        assert.equal(w.groups[0].pattern, 'boss');
      }
    }
  }
});

test('tablas manuales 1..5: la apertura (t<OPEN_T) sólo usa tipos y patrones farmables', () => {
  for (const id of MANUAL_IDS) {
    const open = STAGE_WAVES[id].filter((w) => w.t < OPEN_T);
    assert.ok(open.length >= 2, `S${id}: apertura vacía`);
    for (const w of open) {
      for (const g of waveGroups(w)) {
        assert.ok(FARMABLE_TYPES.includes(g.type),
          `S${id} (t=${w.t}): tipo '${g.type}' no farmable en la apertura`);
        assert.ok(FARMABLE_PATTERNS.includes(g.pattern),
          `S${id} (t=${w.t}): patrón '${g.pattern}' no farmable en la apertura`);
      }
    }
  }
});

test('tablas manuales 1..5: la 1ª ola es un enjambre en vee (primer XP garantizado)', () => {
  for (const id of MANUAL_IDS) {
    const g = waveGroups(STAGE_WAVES[id][0])[0];
    assert.ok(SWARM_TYPES.includes(g.type),
      `S${id}: la 1ª ola no es un enjambre (${g.type})`);
    assert.equal(g.pattern, 'vee', `S${id}: la 1ª ola no es vee`);
  }
});

test('tablas manuales 1..5: hay al menos 1 crystal en vee dentro de la apertura', () => {
  for (const id of MANUAL_IDS) {
    const crystals = STAGE_WAVES[id]
      .filter((w) => w.t < OPEN_T)
      .flatMap((w) => waveGroups(w))
      .filter((g) => g.type === 'crystal' && g.pattern === 'vee');
    assert.ok(crystals.length > 0, `S${id}: sin crystal en vee en la apertura`);
  }
});

test('tablas manuales 1..5: ninguna descarga repite tipo', () => {
  for (const id of MANUAL_IDS) {
    for (const w of STAGE_WAVES[id]) {
      const types = waveGroups(w).map((g) => g.type);
      assert.equal(new Set(types).size, types.length,
        `S${id} (t=${w.t}): tipos repetidos en la descarga (${types.join('+')})`);
    }
  }
});

test('tablas manuales 1..5: el tope de matabilidad por enemigo se respeta en la apertura', () => {
  for (const id of MANUAL_IDS) {
    for (const w of STAGE_WAVES[id].filter((x) => x.t < OPEN_T)) {
      for (const g of waveGroups(w)) {
        const cap = maxKillable(g.type, id);
        assert.ok(g.count <= cap,
          `S${id} (t=${w.t}): ${g.count} × '${g.type}' supera el tope de matabilidad (${cap})`);
      }
    }
  }
});

test('tablas manuales 1..5: la cuenta de enemigos por ola se conserva (monotonía de dificultad)', () => {
  for (const id of MANUAL_IDS) {
    const table = STAGE_WAVES[id];
    const legacy = LEGACY_COUNTS[id];
    assert.equal(table.length, legacy.length, `S${id}: nº de olas distinto al legacy`);
    table.forEach((w, i) => {
      const [t, count] = legacy[i];
      assert.equal(w.t, t, `S${id}: el tiempo de la ola ${i} cambió (${w.t} != ${t})`);
      const total = waveCount(w);
      assert.ok(total <= count, `S${id} (t=${w.t}): ${total} enemigos > ${count} del legacy`);
      // Fuera de la apertura la cuenta es INTACTA: la curva de dificultad
      // de los stages 1..5 está validada (docs/BALANCE.md, rebalance v3-2b/7).
      if (w.t >= OPEN_T) {
        assert.equal(total, count,
          `S${id} (t=${w.t}): ${total} enemigos != ${count} del legacy (fuera de la apertura no puede cambiar)`);
      }
    });
  }
});

// ============================================================
// CAMPAÑA POR FAMILIAS — enjambre + tanque y debuts
// ============================================================

test('campaña: cada familia tiene un enjambre y un tanque', () => {
  for (const family of ENEMY_FAMILY_IDS) {
    const types = Object.entries(ENEMY_TYPES)
      .filter(([, d]) => d.family === family && !d.boss);
    assert.ok(types.some(([, d]) => d.role === 'swarm'),
      `la familia ${family} no tiene enjambre`);
    assert.ok(types.some(([, d]) => d.role === 'tank'),
      `la familia ${family} no tiene tanque`);
  }
});

test('campaña S1–S5: roca → virus → espora → mezcla', () => {
  const familyCounts = (id) => {
    const out = {};
    for (const w of STAGE_WAVES[id]) {
      for (const g of waveGroups(w)) {
        if (g.type === 'boss') continue;
        const fam = ENEMY_FAMILY_BY_TYPE[g.type];
        out[fam] = (out[fam] ?? 0) + g.count;
      }
    }
    return out;
  };
  for (const id of [1, 2]) {
    const f = familyCounts(id);
    assert.equal(f.spore ?? 0, 0, `S${id}: no debe tener espora`);
    assert.equal(f.virus ?? 0, 0, `S${id}: no debe tener virus`);
    assert.ok((f.rock ?? 0) > 0, `S${id}: debe tener roca`);
  }
  const s3 = familyCounts(3);
  assert.ok((s3.virus ?? 0) > 0, 'S3 debe introducir virus');
  assert.equal(s3.spore ?? 0, 0, 'S3 todavía no debe tener espora');
  const s4 = familyCounts(4);
  assert.ok((s4.spore ?? 0) > 0, 'S4 debe introducir espora');
  const s5 = familyCounts(5);
  for (const fam of ENEMY_FAMILY_IDS) {
    assert.ok((s5[fam] ?? 0) > 0, `S5 debe tener la familia ${fam}`);
  }
});

test('poolForStage (bioma) y campaignPoolForStage (tabla manual) son distintos', () => {
  const rockWeight = (pool) => pool
    .filter((p) => p.family === 'rock')
    .reduce((a, p) => a + p.weight, 0);
  // S1 manual es casi todo roca; el bioma S1–9 es una mezcla con
  // espora/virus/cristal (aunque los debuts filtran parte en S1).
  assert.ok(rockWeight(campaignPoolForStage(1)) > rockWeight(poolForStage(1)) + 20,
    'S1: la campaña debería declarar mucho más roca que el bioma');
  // S4 manual no tiene boulder; el bioma S1–9 sí. Esto fija que
  // Supervivencia (stage virtual 4) use el bioma y no la tabla manual.
  assert.ok(poolForStage(4).some((p) => p.type === 'boulder'),
    'el bioma de S4 debería incluir boulder');
  assert.ok(!campaignPoolForStage(4).some((p) => p.type === 'boulder'),
    'la tabla manual de S4 no tiene boulder');
  // S6+ no tiene tabla manual: ambos caminos describen el mismo bioma.
  assert.deepEqual(campaignPoolForStage(20), poolForStage(20));
});

test('campaña: los debuts se respetan en tablas manuales y en el pool', () => {
  for (const [type, d] of Object.entries(ENEMY_TYPES)) {
    const debut = d.debut ?? 1;
    for (let id = 1; id < debut; id++) {
      assert.ok(!campaignPoolForStage(id).some((p) => p.type === type),
        `${type} aparece en el pool de S${id} antes de su debut S${debut}`);
    }
    for (const id of [1, 2, 3, 4, 5].filter((x) => x < debut)) {
      for (const w of STAGE_WAVES[id]) {
        assert.ok(!waveGroups(w).some((g) => g.type === type),
          `${type} aparece en la tabla manual de S${id} antes de S${debut}`);
      }
    }
  }
});

test('el arquetipo ENJAMBRE siempre usa enjambres de familia', () => {
  for (const id of [6, 10, 20, 30, 40, 50]) {
    for (const seed of GEN_SEEDS) {
      for (const w of generateStageWaves(id, seed)) {
        if (archetypeOf(w) !== 'enjambre') continue;
        const gs = waveGroups(w).filter((g) => g.type !== 'crystal');
        assert.ok(gs.length > 0, `S${id} seed ${seed}: enjambre vacío`);
        for (const g of gs) {
          assert.ok(SWARM_TYPES.includes(g.type),
            `S${id} seed ${seed}: ENJAMBRE con tipo no-swarm '${g.type}'`);
        }
      }
    }
  }
});

test('el HP efectivo de las mecánicas no se dispara por etapa', () => {
  for (const id of [6, 10, 20, 30, 40, 50]) {
    let base = 0;
    let eff = 0;
    for (const seed of GEN_SEEDS) {
      for (const w of generateStageWaves(id, seed)) {
        for (const g of waveGroups(w)) {
          if (g.type === 'boss') continue;
          base += (ENEMY_TYPES[g.type]?.hp ?? 0) * g.count;
          eff += effectiveHpOf(g.type) * g.count;
        }
      }
    }
    assert.ok(eff >= base, `S${id}: el HP efectivo no puede ser menor que el base`);
    assert.ok(eff <= base * 1.15,
      `S${id}: el HP efectivo (${Math.round(eff)}) supera en más del 15 % al base (${Math.round(base)})`);
  }
});

test('campaignWaves usa la tabla manual en S1–5 y el generador en S6+', () => {
  for (const id of MANUAL_IDS) {
    assert.equal(campaignWaves(id, 1234), STAGE_WAVES[id],
      `S${id}: la campaña no usa su tabla manual`);
  }
  assert.deepEqual(campaignWaves(6, 1234), generateStageWaves(6, 1234),
    'S6: la campaña no usa el generador');
});

test('openingSwarmForStage elige el enjambre de la familia de la década', () => {
  assert.equal(openingSwarmForStage(1), 'rockSwarm');
  assert.equal(openingSwarmForStage(10), 'virusSwarm');
  assert.equal(openingSwarmForStage(20), 'spore');
  assert.equal(openingSwarmForStage(30), 'crystalSwarm');
});

// ============================================================
// FASE 27 — VARIEDAD DE LAS OLAS
//
// El pedido: "caen hileras de varios enemigos del mismo tipo; en vez
// sería más divertido que vayan saliendo enemigos distintos, variados,
// a diferentes velocidades".
//
// Estos tests son la red que lo fija: si alguien vuelve a generar
// hileras de un solo tipo, o mete un tipo inmortal en la apertura, o
// deja de contrastar las velocidades, el test falla.
// ============================================================

/** Velocidad base de un tipo (ENEMY_TYPES, js/enemies.js). */
const VEL = {
  meteor: 60, fragment: 110, rockSwarm: 100, boulder: 34,
  crystal: 45, crystalSwarm: 70, spore: 90, sporePod: 30,
  miniBlob: 42, blob: 35, virusSwarm: 80, geode: 28, boss: 22,
};
/** HP base de un tipo (ENEMY_TYPES, js/enemies.js). */
const HP_BASE = {
  meteor: 30, fragment: 12, rockSwarm: 12, boulder: 190,
  crystal: 60, crystalSwarm: 12, spore: 8, sporePod: 190,
  miniBlob: 160, blob: 220, virusSwarm: 10, geode: 240, boss: 2600,
};
/** XP (= score) base de un tipo (ENEMY_TYPES, js/enemies.js). */
const XP_BASE = {
  meteor: 10, fragment: 15, rockSwarm: 5, boulder: 60,
  crystal: 40, crystalSwarm: 6, spore: 5, sporePod: 55,
  miniBlob: 35, blob: 60, virusSwarm: 5, geode: 65, boss: 500,
};
/**
 * DPS del Guardian para el criterio de matabilidad de la apertura.
 * No es el de Lv1 (34.8): el jugador SUBE de nivel durante la propia
 * apertura (entrega ~270-440 XP → Lv3-5), así que al momento de que le
 * lleguen los enemigos ya tiene más daño. Con Lv3 (≈58.7 DPS) el crystal
 * de S50 sí es matable — que es lo que el jugador real puede hacer.
 */
const GUARDIAN_DPS = (8 + 2 * 2.75) / 0.23;   // Guardian Lv3 ≈ 58.7 DPS
/** Distancia de caída (px). */
const FALL_PX = 900;

// ------------------------------------------------------------
// FASE 28 — EL MODELO DE LA APERTURA USA LA POTENCIA REAL DEL JUGADOR.
//
// Con la pendiente 0,22/stage (el muro de dificultad de la fase 28, que
// la fase 59.5 bajó a 0,14) la apertura se DEGRADABA en los stages finales:
// el pool "matable" se reducía a 'spore' (fragment, meteor y crystal dejaban
// de caber en la ventana de tiro de un Guardian Lv1) y el tope por enemigo
// caía a 1. Consecuencia medida: la apertura entregaba 80-100 XP de los
// 315 que el piso exige — el jugador NO llegaba ni al Lv2 y el stage era
// injugable.
//
// La CAUSA era el modelo: la apertura asumía SIEMPRE un Guardian Lv1
// desnudo, cuando un jugador que llega al stage 45 lo tiene en Nvl.41 de
// meta (×2.5 de daño). Ahora el generador recibe `powerMul` (el
// multiplicador de meta real) y modela la apertura con esa potencia.
//
// Con el modelo correcto la apertura entrega su XP completo en TODOS los
// stages (medido: 320-375 XP) y recupera la VARIEDAD de tipos: en S50
// entran spore, meteor, fragment y crystal.
// ------------------------------------------------------------

/** DPS del Guardian en un nivel dado (js/towers.js Tower.damage). */
const dpsGuardian = (nivel) => (8 * (1 + 0.25 * Math.max(0, nivel - 1))) / 0.23;

/**
 * Nivel del jugador a partir de la XP ACUMULADA. Usa la función real de
 * js/score.js (xpForLevel) en vez de una copia: así el test depende de
 * la fuente de verdad y no de una fórmula replicada.
 */
function nivelPorXp(xp) {
  let lvl = 1;
  let need = xpForLevel(2);
  while (xp >= need && lvl < 60) {
    xp -= need;
    lvl += 1;
    need = xpForLevel(lvl + 1);
  }
  return lvl;
}

/** XP mínimo que la apertura tiene que entregar (js/waves.js openingXpFloor). */
const APERTURA_XP_MIN = 315;

/**
 * TRAYECTORIA REAL del meta-game: el nivel de meta que el jugador tiene
 * de verdad cuando llega a cada stage (medido sobre la campaña de 50
 * stages: ~+4 al principio, luego se aplana porque el primer clear de
 * cada stage da más fragmentos que los 60 de victoria).
 */
const TRAYECTORIA_META = [
  [1, 1], [10, 14], [20, 23], [25, 28], [30, 32], [40, 38], [45, 41], [50, 44],
];

/** Nivel meta real al llegar a un stage (interpolación por tramos). */
function metaReal(stage) {
  for (let i = 0; i < TRAYECTORIA_META.length - 1; i++) {
    const [s0, m0] = TRAYECTORIA_META[i];
    const [s1, m1] = TRAYECTORIA_META[i + 1];
    if (stage <= s1) {
      const k = (stage - s0) / (s1 - s0);
      return Math.round(m0 + k * (m1 - m0));
    }
  }
  return TRAYECTORIA_META[TRAYECTORIA_META.length - 1][1];
}

/**
 * Potencia real del Guardian al llegar a un stage: el multiplicador de
 * meta (js/meta.js metaDmgMul = 1 + 5 % por nivel; los hitos añaden un
 * 2 % extra por hito alcanzado, aquí omitidos por ser un 8 % como mucho).
 */
function powerReal(stage) {
  return 1 + 0.05 * (metaReal(stage) - 1);
}

test('fase 28: la apertura da el XP mínimo con la potencia real del jugador', () => {
  // La apertura se modela con la potencia REAL del jugador (su nivel de
  // meta). Sin meta (arranque de la campaña) el modelo es el Lv1 de la
  // fase 27; al final de la campaña el Guardian hace ×3 de daño y la
  // apertura puede meter tipos que un Lv1 no alcanzaría.
  for (const id of GEN_IDS) {
    const power = powerReal(id);
    for (const seed of GEN_SEEDS) {
      const waves = generateStageWaves(id, seed, { powerMul: power })
        .filter((w) => w.t < OPEN_T);
      let xp = 0;
      for (const w of waves) {
        for (const g of waveGroups(w)) xp += (XP_BASE[g.type] ?? 0) * g.count;
      }
      assert.ok(xp >= APERTURA_XP_MIN,
        `S${id} seed ${seed} (x${power.toFixed(2)}): la apertura da ${xp} XP `
        + `(se necesitan ${APERTURA_XP_MIN})`);
    }
  }
});

test('fase 28: la apertura no se degrada a un solo tipo con la potencia real', () => {
  // La apertura tiene que VARIAR: si el pool "matable" se reduce a un
  // solo tipo, el arranque es una tanda de esporas sin decisiones.
  for (const id of GEN_IDS) {
    for (const seed of GEN_SEEDS) {
      const waves = generateStageWaves(id, seed, { powerMul: powerReal(id) })
        .filter((w) => w.t < OPEN_T);
      const tipos = new Set();
      for (const w of waves) for (const g of waveGroups(w)) tipos.add(g.type);
      assert.ok(tipos.size >= 2,
        `S${id} seed ${seed}: la apertura tiene un solo tipo (${[...tipos].join(',')})`);
    }
  }
});

test('fase 28: sin meta, la apertura conserva el modelo Lv1 (el arranque no cambia)', () => {
  // Con powerMul=1 el modelo tiene que ser EXACTAMENTE el de la fase 27
  // (Guardian Lv1 desnudo): es lo que garantiza el test de integración
  // "stage 6 es más difícil que stage 5" y el arranque de la campaña.
  // OJO: sin meta la apertura de los stages FINALES no llega al piso de
  // 315 XP (el Guardian Lv1 no puede con esos enemigos) — eso es lo
  // correcto: el jugador real llega a S50 con Nvl.44 de meta (×3 de daño).
  for (const id of GEN_IDS) {
    for (const seed of GEN_SEEDS) {
      const waves = generateStageWaves(id, seed).filter((w) => w.t < OPEN_T);
      const { hpMul, velMul } = scaleFor(id);
      let hp = 0;
      let xp = 0;
      let maxGrupoHp = 0;
      let xpAntesDeLaOla = 0;
      let nivelFinal = 1;
      for (const w of waves) {
        // El nivel que el jugador tiene AL LLEGAR a esta ola (las XP de
        // las olas anteriores son las que lo suben).
        const nivel = nivelPorXp(xpAntesDeLaOla);
        nivelFinal = Math.max(nivelFinal, nivel);
        const dps = dpsGuardian(nivel);
        for (const g of waveGroups(w)) {
          const d = ENEMY_TYPES[g.type];
          const ghp = (d?.hp ?? 0) * hpMul * g.count;
          hp += ghp;
          xp += (d?.score ?? 0) * g.count;
          maxGrupoHp = Math.max(maxGrupoHp, ghp);
          // TOPE POR ENEMIGO: un grupo no puede traer más enemigos de
          // los que el Guardian (en el nivel del jugador en ese momento)
          // mata dentro de su ventana de tiro.
          const vel = Math.max(1, (d?.vel ?? 1) * velMul);
          const cap = Math.max(1, Math.floor(
            ((FALL_PX / vel) * dps) / ((d?.hp ?? 1) * hpMul),
          ));
          assert.ok(g.count <= cap,
            `S${id} seed ${seed}: grupo de ${g.count} '${g.type}' — el Guardian `
            + `Lv${nivel} solo mata ${cap} en su ventana de tiro`);
        }
        xpAntesDeLaOla = xp;
      }
      // El presupuesto manda: la apertura no puede entregar más HP del
      // que el Guardian puede matar en la ventana (más el margen de un
      // grupo: la primera ola está garantizada y puede pasarse un poco).
      const budget = openingHpBudget(id, nivelFinal);
      assert.ok(hp <= budget + maxGrupoHp,
        `S${id} seed ${seed}: la apertura entrega ${Math.round(hp)} HP y el presupuesto es `
        + `${Math.round(budget)} (+1 grupo = ${Math.round(maxGrupoHp)})`);
    }
  }
});

test('fase 27: las descargas del tramo clásico MEZCLAN tipos (no son hileras)', () => {
  for (const id of GEN_IDS) {
    for (const seed of GEN_SEEDS) {
      const waves = generateStageWaves(id, seed).filter((w) => w.t >= OPEN_T);
      let mixtas = 0;
      for (const w of waves) {
        const tipos = waveTypes(w);
        assert.equal(new Set(tipos).size, tipos.length,
          `S${id} seed ${seed}: dos grupos del mismo tipo '${tipos.join(',')}' en una descarga`);
        if (tipos.length > 1) mixtas++;
      }
      // La mayoría de las descargas del tramo clásico tienen que ser mixtas.
      assert.ok(mixtas / waves.length >= 0.6,
        `S${id} seed ${seed}: solo ${mixtas}/${waves.length} descargas son mixtas`);
    }
  }
});

test('fase 27: la descarga mezcla velocidades contrastadas (rápidos + lentos)', () => {
  for (const id of GEN_IDS) {
    for (const seed of GEN_SEEDS) {
      const waves = generateStageWaves(id, seed).filter((w) => w.t >= OPEN_T);
      let conContraste = 0;
      for (const w of waves) {
        const tipos = waveTypes(w);
        if (tipos.length < 2) continue;
        const vs = tipos.map((t) => VEL[t]);
        const rango = Math.max(...vs) - Math.min(...vs);
        if (rango >= 30) conContraste++;
      }
      // Al menos la mitad de las descargas mixtas tienen 30+ px/s de rango.
      assert.ok(conContraste / waves.length >= 0.4,
        `S${id} seed ${seed}: solo ${conContraste}/${waves.length} descargas contrastan velocidad`);
    }
  }
});

test('fase 27: nunca 3+ olas seguidas con el mismo tipo dominante', () => {
  for (const id of GEN_IDS) {
    for (const seed of GEN_SEEDS) {
      // dev-7 fase 28: se genera con la potencia REAL del jugador: con el
      // modelo Lv1 desnudo la apertura de los stages finales se degradaba
      // a un solo tipo (spore) y el generador no tenía alternativa para
      // romper la racha. Con la potencia real el pool tiene variedad y
      // la regla se aplica íntegra, también en la apertura.
      const waves = generateStageWaves(id, seed, { powerMul: powerReal(id) });
      let racha = 0;
      let last = null;
      for (const w of waves) {
        const gs = waveGroups(w);
        if (!gs.length) continue;
        const dom = gs.reduce((a, b) => (b.count > a.count ? b : a), gs[0]).type;
        racha = dom === last ? racha + 1 : 1;
        last = dom;
        assert.ok(racha <= 2,
          `S${id} seed ${seed}: ${racha} olas seguidas con '${dom}' dominante`);
      }
    }
  }
});

test('fase 27: en pantalla conviven varios tipos a la vez (con lifetimes reales)', () => {
  // Lo que el jugador VE: los enemigos de una descarga y de la anterior
  // están en pantalla a la vez (caen ~900 px a su velocidad). Antes era
  // 1 tipo simultáneo; ahora deben ser varios.
  for (const id of [20, 30, 50]) {
    const { velMul } = scaleFor(id);
    const waves = generateStageWaves(id, 42);
    let maxTipos = 0;
    let maxRango = 0;
    for (let t = 0; t < 120; t += 0.5) {
      const enPantalla = [];
      for (const w of waves) {
        if (w.t > t) continue;
        const transcurrido = t - w.t;
        for (const g of waveGroups(w)) {
          const vel = VEL[g.type] * velMul;
          if (transcurrido < FALL_PX / vel) enPantalla.push(g.type);
        }
      }
      const tipos = [...new Set(enPantalla)];
      maxTipos = Math.max(maxTipos, tipos.length);
      if (tipos.length > 1) {
        const vs = tipos.map((x) => VEL[x] * velMul);
        maxRango = Math.max(maxRango, Math.max(...vs) - Math.min(...vs));
      }
    }
    assert.ok(maxTipos >= 3, `S${id}: solo ${maxTipos} tipos simultáneos en pantalla`);
    assert.ok(maxRango >= 40, `S${id}: rango de velocidad simultánea ${maxRango.toFixed(0)} px/s`);
  }
});

test('fase 27: la apertura solo mete tipos MATABLES por el Guardian Lv1', () => {
  // El criterio: el tiempo-para-matar tiene que caber en la ventana de
  // tiro del enemigo (900 px a su velocidad). Con esto, lo que se escapa
  // no se lleva la base y el jugador sí sube de nivel.
  for (const id of GEN_IDS) {
    const { hpMul, velMul } = scaleFor(id);
    for (const seed of GEN_SEEDS) {
      const waves = generateStageWaves(id, seed);
      for (const w of waves.filter((x) => x.t < OPEN_T)) {
        for (const g of waveGroups(w)) {
          const hp = (HP_BASE[g.type] ?? 1) * hpMul;
          const vel = (VEL[g.type] ?? 1) * velMul;
          const ttk = hp / GUARDIAN_DPS;
          const ventana = FALL_PX / vel;
          assert.ok(ttk <= ventana,
            `S${id} seed ${seed}: '${g.type}' (${hp.toFixed(0)} HP, ${vel.toFixed(0)} px/s) `
            + `no es matable por el Guardian Lv1 (ttk ${ttk.toFixed(1)}s > ventana ${ventana.toFixed(1)}s)`);
        }
      }
    }
  }
});

test('fase 27: la apertura NO mete una hilera que el Guardian no puede matar', () => {
  // Además del tipo, el TAMAÑO del grupo importa: 13 meteoritos de 155 HP
  // son 2015 HP de daño y el Guardian no puede con esa hilera en su
  // ventana de tiro (se escapan TODOS y el XP se pierde).
  for (const id of GEN_IDS) {
    const { hpMul, velMul } = scaleFor(id);
    for (const seed of GEN_SEEDS) {
      const waves = generateStageWaves(id, seed);
      for (const w of waves.filter((x) => x.t < OPEN_T)) {
        for (const g of waveGroups(w)) {
          const hp = (HP_BASE[g.type] ?? 1) * hpMul;
          const vel = (VEL[g.type] ?? 1) * velMul;
          const ventana = FALL_PX / vel;
          const maxKill = Math.max(1, Math.floor((ventana * GUARDIAN_DPS) / hp));
          assert.ok(g.count <= maxKill,
            `S${id} seed ${seed}: grupo de ${g.count} '${g.type}' — el Guardian Lv1 solo `
            + `mata ${maxKill} en su ventana de tiro`);
        }
      }
    }
  }
});

test('fase 27: la apertura entrega XP suficiente para subir de nivel', () => {
  // xpForLevel(2) = 105, xpForLevel(3) = 150 → 255 XP para el Lv3. La
  // apertura tiene que entregar bastante más: si no, el jugador se queda
  // en Lv1 y los stages altos son injugables (medido antes del fix: 2.2
  // kills por run y nunca subía de nivel).
  //
  // dev-7 fase 28: el piso es 315 XP y se mide con la potencia REAL del
  // jugador al llegar a cada stage (su nivel de meta). Antes la apertura
  // se degradaba en S45/S50 (80-100 XP) porque el modelo asumía un
  // Guardian Lv1 desnudo; con la potencia real el piso se cumple siempre.
  for (const id of GEN_IDS) {
    for (const seed of GEN_SEEDS) {
      const waves = generateStageWaves(id, seed, { powerMul: powerReal(id) })
        .filter((w) => w.t < OPEN_T);
      let xp = 0;
      for (const w of waves) {
        for (const g of waveGroups(w)) xp += (XP_BASE[g.type] ?? 0) * g.count;
      }
      assert.ok(xp >= APERTURA_XP_MIN,
        `S${id} seed ${seed}: la apertura da ${xp} XP (se necesitan ${APERTURA_XP_MIN})`);
    }
  }
});

test('fase 27: la apertura tiene al menos 2 olas (garantía del doc)', () => {
  for (const id of GEN_IDS) {
    for (const seed of GEN_SEEDS) {
      const waves = generateStageWaves(id, seed);
      const open = waves.filter((w) => w.t < OPEN_T);
      assert.ok(open.length >= 2, `S${id} seed ${seed}: la apertura tiene ${open.length} olas`);
    }
  }
});

// ------------------------------------------------------------
// dev-7 fase 27 (calibración) — PRESUPUESTO DE LA APERTURA.
//
// La apertura no es una descarga libre: tiene que CABER en lo que el
// Guardian puede matar durante la ventana de apertura
// (openingHpBudget = DPS × OPEN_T × margen) y tiene que dar el XP
// mínimo para que el jugador llegue al Lv3. Estos tests fijan esas
// REGLAS DE ESTRUCTURA (el margen y el piso se recalibran con el
// simulador: no se fijan números de balance, se fija la relación).
//
// dev-7 fase 28: el modelo usa la potencia REAL del jugador (nivel de
// run + multiplicador de meta). El test de abajo (con powerMul=1)
// conserva el modelo Lv1 exacto de la fase 27; el de arriba lo prueba
// con la potencia real.
// ------------------------------------------------------------
test('fase 27: la apertura cabe en el presupuesto de HP, respeta el tope por enemigo y da el XP mínimo', () => {
  for (const id of GEN_IDS) {
    for (const seed of GEN_SEEDS) {
      const waves = generateStageWaves(id, seed).filter((w) => w.t < OPEN_T);
      const { hpMul, velMul } = scaleFor(id);
      let hp = 0;
      let xp = 0;
      let maxGrupoHp = 0;
      let xpAntesDeLaOla = 0;
      let nivelFinal = 1;
      for (const w of waves) {
        // El nivel que el jugador tiene AL LLEGAR a esta ola (las XP de
        // las olas anteriores son las que lo suben).
        const nivel = nivelPorXp(xpAntesDeLaOla);
        nivelFinal = Math.max(nivelFinal, nivel);
        const dps = dpsGuardian(nivel);
        for (const g of waveGroups(w)) {
          const d = ENEMY_TYPES[g.type];
          const ghp = (d?.hp ?? 0) * hpMul * g.count;
          hp += ghp;
          xp += (d?.score ?? 0) * g.count;
          maxGrupoHp = Math.max(maxGrupoHp, ghp);
          // TOPE POR ENEMIGO: un grupo no puede traer más enemigos de
          // los que el Guardian (en el nivel del jugador en ese momento)
          // mata dentro de su ventana de tiro.
          const vel = Math.max(1, (d?.vel ?? 1) * velMul);
          const cap = Math.max(1, Math.floor(
            ((FALL_PX / vel) * dps) / ((d?.hp ?? 1) * hpMul),
          ));
          assert.ok(g.count <= cap,
            `S${id} seed ${seed}: grupo de ${g.count} '${g.type}' — el Guardian `
            + `Lv${nivel} solo mata ${cap} en su ventana de tiro`);
        }
        xpAntesDeLaOla = xp;
      }
      // El presupuesto manda: la apertura no puede entregar más HP del
      // que el Guardian puede matar en la ventana (más el margen de un
      // grupo: la primera ola está garantizada y puede pasarse un poco).
      const budget = openingHpBudget(id, nivelFinal);
      assert.ok(hp <= budget + maxGrupoHp,
        `S${id} seed ${seed}: la apertura entrega ${Math.round(hp)} HP y el presupuesto es `
        + `${Math.round(budget)} (+1 grupo = ${Math.round(maxGrupoHp)})`);
      // Y tiene que dejar al jugador con XP para el Lv3 (con la potencia
      // real del jugador al llegar a este stage).
      const power = powerReal(id);
      const wavesPower = generateStageWaves(id, seed, { powerMul: power })
        .filter((w) => w.t < OPEN_T);
      let xpPower = 0;
      for (const w of wavesPower) {
        for (const g of waveGroups(w)) xpPower += (XP_BASE[g.type] ?? 0) * g.count;
      }
      assert.ok(xpPower >= APERTURA_XP_MIN,
        `S${id} seed ${seed}: la apertura da ${xpPower} XP con la potencia real `
        + `(se necesitan ${APERTURA_XP_MIN})`);
    }
  }
});

// ============================================================
// dev-7 fase 46 — el jefe que entra lleva el NOMBRE de su stage
// ============================================================

test('fase 46: el jefe que entra en la arena se llama como su stage', () => {
  for (const id of [1, 10, 20, 30, 40, 50]) {
    const wm = new WaveManager(id);
    const enemies = [];
    const game = {
      fortress: { enemies },
      // El engine solo lleva sus entidades: la lista de enemigos la
      // empuja el propio WaveManager.
      engine: { addEntity: () => {} },
    };
    wm._spawnBoss(game);
    assert.equal(enemies.length, 1, `S${id}: entra un jefe`);
    const boss = enemies[0];
    assert.equal(boss.data.name, bossNameForStage(id),
      `S${id}: el jefe se llama "${bossNameForStage(id)}"`);
    assert.notEqual(boss.data.name, 'BOSS', `S${id}: el jefe NO se llama "BOSS"`);
    // El resto de la ficha NO se toca: el nombre se CLONA (ENEMY_TYPES es
    // compartida: mutarla renombraría a todos los enemigos de ese tipo).
    assert.equal(boss.isBoss, true, `S${id}: sigue siendo jefe`);
    assert.equal(boss.data.hp, ENEMY_TYPES[boss.type].hp, `S${id}: el HP base no cambia`);
    assert.equal(ENEMY_TYPES.boss.name, 'BOSS',
      'ENEMY_TYPES no se renombra (la ficha global queda intacta)');
  }
});

// ============================================================
// fase 72 — EL DAÑO DE FUGA ES EL HP MÁXIMO
// ============================================================
// La regla del 25 % ya no existe: la base cae por daño acumulado. El daño
// de una fuga usa `hpMax` (no el HP restante), así que un enemigo
// maltrecho que se escapa sigue costando lo que vale su tipo.

test('fase 72: la fuga duele el HP máximo, no el restante', () => {
  assert.equal(LEAK_HP_FRAC, 1);
  assert.equal(leakDamageFor({ hpMax: 100, hp: 20 }), 100,
    'un enemigo al 20 % de vida sigue doliendo 100');
  assert.equal(leakDamageFor({ hpMax: 100 }), 100);
  assert.equal(leakDamageFor({ hpMax: 100 }, 0.5), 50, 'el dial de balance funciona');
  assert.equal(leakDamageFor({ hpMax: 1 }, 0.1), 1, 'nunca una fuga de 0');
});

test('fase 72: datos degenerados no rompen el daño de fuga', () => {
  assert.equal(leakDamageFor(null), 0);
  assert.equal(leakDamageFor(undefined), 0);
  assert.equal(leakDamageFor({ hpMax: 0 }), 0);
  assert.equal(leakDamageFor({ hpMax: -10 }), 0);
  assert.equal(leakDamageFor({ hpMax: NaN }), 0);
  assert.equal(leakDamageFor({ hpMax: 100 }, NaN), 100, 'frac inválida → la global');
  assert.equal(leakDamageFor({ hpMax: 100 }, -1), 0, 'frac negativa → 0, nunca daño negativo');
});

test('fase 72: Enemy.update entrega a la base el hpMax, no el hp restante', () => {
  const game = stubGame();
  const golpes = [];
  game.fortress.takeDamage = (n) => { golpes.push(n); };
  game.engine.spawnParticles = () => {};
  game.engine.shake = () => {};
  game.engine.addEffect = () => {};
  const e = new Enemy('spore', 270, { game, y: 10000 });
  e.hpMax = 500;
  e.hp = 37; // llega casi muerto: aun así debe pagar 500
  e.update(1 / 30);
  assert.deepEqual(golpes, [500], 'la fuga usa hpMax, no hp');
  assert.equal(e.dead, true);
});

// ============================================================
// dev-7 fase 65 — EL DIRECTOR DE OLAS
//
// Arquetipos, presupuesto de HP, curva de presión, biomas por década,
// crystal garantizado, variantes de élite y escalonado del spawn. Es la
// red que fija la spec (openspec/specs/gameplay/wave-director/spec.md): si alguien
// vuelve al reparto plano, al cast invariable, a la lotería del cristal
// o a la placa que nace en un solo frame, esto falla.
// ============================================================

/** Los 8 arquetipos del design, con su coste táctico (`densityMul`). */
const ARCH_IDS = ['enjambre', 'convoy', 'cuña', 'cortina', 'goteo', 'pinza', 'escolta', 'ola de choque'];
const ARCH_DENSITY = {
  enjambre: 1.00, convoy: 0.55, 'cuña': 0.70, cortina: 0.85,
  goteo: 1.15, pinza: 0.50, escolta: 0.70, 'ola de choque': 0.60,
};
/** Etapas de muestra del generador (6..50) para los tests del director. */
const DIR_IDS = [6, 8, 10, 15, 20, 25, 30, 35, 40, 45, 50];

/** RNG determinista compartido (xorshift32) para las funciones puras. */
import { makeXorShift32 as fixedRnd } from './helpers/rng.mjs';

/** HP base (sin escalar) de una descarga, sin el jefe. */
function waveHpBase(wave) {
  let hp = 0;
  for (const g of waveGroups(wave)) {
    if (g.type === 'boss' || g.pattern === 'boss') continue;
    let gHp = (ENEMY_TYPES[g.type]?.hp ?? 0) * g.count;
    // fase 65: el `escudado` suma su escudo — es HP que hay que tumbar, y
    // es el MISMO criterio que la sonda (scripts/probe-waves.mjs) y el sim
    // (scripts/balance-sim.mjs). La línea base BASE_K se midió ANTES de
    // que existieran las variantes, así que comparar contra ella contando
    // el escudo es comparar peras con peras.
    if (g.variant === 'escudado') gHp *= 1 + (ENEMY_VARIANTS.escudado?.shieldFrac ?? 0.40);
    hp += gHp;
  }
  return hp;
}

/** Descargas del TRAMO CLÁSICO (sin la apertura ni la ola de jefe). */
const classicWaves = (waves) => waves.filter((w) => w.t >= OPEN_T && !isBossWave(w));

test('fase 65: los 8 arquetipos del design están declarados con su molde', () => {
  assert.deepEqual([...ARCHETYPE_NAMES].sort(), [...ARCH_IDS].sort());
  for (const id of ARCH_IDS) {
    const a = WAVE_ARCHETYPES[id];
    assert.equal(a.densityMul, ARCH_DENSITY[id], `${id}: densityMul`);
    assert.ok(a.name && a.name === a.name.toUpperCase(),
      `${id}: el nombre del banner va en mayúsculas ("${a.name}")`);
    assert.ok(a.groups.length >= 1 && a.groups.length <= 3,
      `${id}: ${a.groups.length} grupos de molde (≤3)`)
    assert.ok(a.desde >= 6, `${id}: desde ${a.desde} (el generador corre 6..50)`);
    for (const g of a.groups) {
      assert.ok(g.budget > 0 && g.budget <= 1, `${id}: fracción de presupuesto inválida`);
      assert.ok(g.pattern, `${id}: grupo de molde sin patrón`);
    }
  }
  // Los moldes de FLUJO reparten a sus enemigos en el tiempo (spec).
  for (const id of ['enjambre', 'goteo']) {
    assert.equal(WAVE_ARCHETYPES[id].flow, true, `${id}: no está marcado como arroyo`);
    assert.ok(WAVE_ARCHETYPES[id].groups.every((g) => g.stagger),
      `${id}: sin stagger en algún grupo (no repartiría ≥0,5 s)`);
  }
});

test('fase 65: pickArchetype respeta las reglas con rnd inyectado', () => {
  // Las dos reglas de la spec, sobre la SECUENCIA (no sobre la
  // implementación): nunca dos iguales seguidas y nunca tres iguales en
  // una ventana de cinco.
  const alas = (seq, etiqueta) => {
    for (let i = 1; i < seq.length; i++) {
      assert.notEqual(seq[i], seq[i - 1], `${etiqueta}: '${seq[i]}' repetido en descargas seguidas`);
    }
    for (let i = 4; i < seq.length; i++) {
      const win = seq.slice(i - 4, i + 1);
      assert.ok(win.filter((a) => a === seq[i]).length < 3,
        `${etiqueta}: '${seq[i]}' 3 veces en 5 (${win.join(',')})`);
    }
  };
  for (const stage of [6, 12, 30, 50]) {
    const rnd = fixedRnd(stage * 31 + 7);
    const seq = [];
    for (let i = 0; i < 300; i++) {
      const next = pickArchetype(seq, rnd, { stage });
      assert.ok(WAVE_ARCHETYPES[next].desde <= stage, `S${stage}: '${next}' todavía no existe`);
      seq.push(next);
    }
    alas(seq, `S${stage}`);
  }
  // Misma fuente de azar → misma secuencia (determinismo del sorteo).
  const seq = (seed) => {
    const rnd = fixedRnd(seed);
    const out = [];
    for (let i = 0; i < 30; i++) out.push(pickArchetype(out, rnd, { stage: 50 }));
    return out.join(',');
  };
  assert.equal(seq(4242), seq(4242));
});

test('fase 65: cada etapa usa ≥4 arquetipos distintos y sin repeticiones', () => {
  for (const id of DIR_IDS) {
    for (const seed of GEN_SEEDS) {
      const seq = classicWaves(generateStageWaves(id, seed)).map((w) => archetypeOf(w));
      for (const a of seq) {
        assert.ok(a, `S${id} seed ${seed}: descarga clásica sin arquetipo`);
      }
      const kinds = new Set(seq);
      assert.ok(kinds.size >= 4,
        `S${id} seed ${seed}: sólo ${kinds.size} arquetipos (${[...kinds].join(', ')})`);
      for (let i = 1; i < seq.length; i++) {
        assert.notEqual(seq[i], seq[i - 1],
          `S${id} seed ${seed}: '${seq[i]}' repetido en descargas seguidas`);
      }
      for (let i = 4; i < seq.length; i++) {
        const win = seq.slice(i - 4, i + 1);
        assert.ok(win.filter((a) => a === seq[i]).length < 3,
          `S${id} seed ${seed}: '${seq[i]}' 3 veces en 5 descargas`);
      }
    }
  }
});

test('fase 65: el crystal va garantizado (1× por descarga) en el tramo clásico', () => {
  // El crystal era una LOTERÍA (19-32 % de las descargas, medido en la
  // fase 64) aunque el comentario del generador prometía "toda descarga
  // lleva ≥1 crystal". Con el director es una garantía: la decisión de
  // riesgo/recompensa la toma el jugador, no el dado.
  for (const id of DIR_IDS) {
    for (const seed of GEN_SEEDS) {
      for (const w of classicWaves(generateStageWaves(id, seed))) {
        const crystals = waveGroups(w).filter((g) => g.type === 'crystal');
        assert.equal(crystals.length, 1,
          `S${id} seed ${seed} (t=${w.t}): ${crystals.length} grupos de crystal`);
        assert.ok(crystals[0].count >= 1, `S${id} seed ${seed}: crystal vacío`);
        assert.equal(crystals[0].pattern, 'vee', `S${id} seed ${seed}: crystal no centrado`);
      }
    }
  }
});

test('fase 65: el crystal sale del presupuesto (no es aditivo)', () => {
  // Si el crystal se SUMARA al presupuesto, el S50 se llevaría ~+20 % de
  // HP (30 cristales × 522 HP sobre una ola de ~77 k). La descarga —con
  // el crystal dentro— tiene que caber en presupuesto × densityMul. El
  // techo duro es el piso de 1 enemigo por grupo (un tanque son 160-220
  // HP base); el 98 % de las descargas cabe además en ×1,35.
  let n = 0;
  let ajustadas = 0;
  for (const id of [10, 20, 30, 50]) {
    for (const seed of GEN_SEEDS) {
      for (const w of classicWaves(generateStageWaves(id, seed))) {
        const tope = waveBudget(id, w.t) * WAVE_ARCHETYPES[archetypeOf(w)].densityMul;
        const hp = waveHpBase(w);
        n += 1;
        if (hp <= tope * 1.35) ajustadas += 1;
        assert.ok(hp <= tope * 1.8,
          `S${id} seed ${seed} (t=${w.t}): ${Math.round(hp)} HP base `
          + `> presupuesto ${Math.round(tope)} (+80 %)`);
      }
    }
  }
  assert.ok(ajustadas / n >= 0.98,
    `sólo ${ajustadas}/${n} descargas caben en presupuesto ×1,35`);
});

test('fase 65: el HP generado por etapa se mantiene en ±10 % de la línea base', () => {
  // Línea base de la fase 64, medida con scripts/probe-waves.mjs (20
  // semillas por etapa, las mismas de acá): HP TOTAL de la etapa escalado
  // por el hpMul del stage. Es LA guarda del cambio: la variedad de
  // composición no puede mover la dificultad medida.
  const BASE_K = { 6: 22, 10: 28, 20: 54, 30: 69, 40: 77, 50: 95 };
  const SEEDS = 20;
  for (const [idStr, baseK] of Object.entries(BASE_K)) {
    const id = Number(idStr);
    const { hpMul } = scaleFor(id);
    let sum = 0;
    for (let s = 0; s < SEEDS; s++) {
      for (const w of generateStageWaves(id, 1000 + s * 7919 + id)) {
        sum += waveHpBase(w) * hpMul;
      }
    }
    const hpK = sum / SEEDS / 1000;
    const dev = Math.abs(hpK - baseK) / baseK;
    assert.ok(dev <= 0.10,
      `S${id}: ${hpK.toFixed(1)}k HP vs ${baseK}k de la línea base `
      + `(${(dev * 100).toFixed(1)} % > 10 %)`);
  }
});

test('fase 65: la curva de presión tiene dos picos, un valle y una marea final', () => {
  // Ventanas de 20 s del tramo clásico: al menos 2 con ≥1,15× la media y
  // al menos 1 con ≤0,75× (spec §Presupuesto de HP y curva de presión).
  const win = [];
  for (let t = OPEN_T; t < 152; t += 20) {
    let sum = 0;
    let n = 0;
    for (let x = t; x < Math.min(t + 20, 152); x += 0.25) { sum += pressure(x); n += 1; }
    win.push(sum / n);
  }
  const mean = win.reduce((a, b) => a + b, 0) / win.length;
  const picos = win.filter((v) => v >= mean * 1.15).length;
  const valles = win.filter((v) => v <= mean * 0.75).length;
  assert.ok(picos >= 2, `sólo ${picos} ventanas de pico (${win.map((v) => v.toFixed(2)).join(' ')})`);
  assert.ok(valles >= 1, `ninguna ventana de respiro (${win.map((v) => v.toFixed(2)).join(' ')})`);
  // Normalizada: la media del tramo clásico es 1,00 (redistribuye, no suma).
  let sum = 0;
  let n = 0;
  for (let x = OPEN_T; x <= 152; x += 0.05) { sum += pressure(x); n += 1; }
  assert.ok(Math.abs(sum / n - 1) < 0.02, `media del tramo clásico ${(sum / n).toFixed(3)} ≠ 1,00`);
  // La marea final precede al jefe: más presión que la media de la etapa.
  assert.ok(pressure(140) > 1.05, `la marea final (${pressure(140).toFixed(2)}) no supera la media`);
});

test('fase 65: waveSchedule es puro, determinista y ordenado', () => {
  const wave = {
    t: 60,
    archetype: 'convoy',
    groups: [
      { type: 'blob', count: 3, pattern: 'wall', lane: 'izq', delay: 2 },
      { type: 'spore', count: 4, pattern: 'vee', stagger: 0.5 },
    ],
  };
  const a = waveSchedule(wave);
  assert.deepEqual(a, waveSchedule(wave), 'dos llamadas dan la misma agenda');
  assert.equal(a.length, 7, 'un evento por enemigo');
  for (const ev of a) {
    assert.deepEqual(Object.keys(ev).sort(), ['at', 'group', 'index']);
    assert.ok(ev.at >= wave.t, 'ningún evento antes de la descarga');
  }
  for (let i = 1; i < a.length; i++) assert.ok(a[i].at >= a[i - 1].at, 'agenda desordenada');
  // El `stagger` reparte a los enemigos del grupo; el `delay` retrasa al
  // grupo entero.
  assert.deepEqual(a.slice(0, 4).map((e) => e.group), [1, 1, 1, 1]);
  assert.equal(a[0].at, wave.t);
  assert.equal(a[3].at, wave.t + 1.5);
  assert.equal(a[4].at, wave.t + 2, 'el grupo 0 entra a los 2 s (delay)');
  // La agenda NO muta la tabla (es pura).
  assert.equal(wave.groups[0].delay, 2);
});

test('fase 65: el goteo es un arroyo (≥0,5 s entre el primero y el último)', () => {
  // El arroyo lo marca el GRUPO del molde (el crystal va en el suyo y es
  // 1 enemigo): si el grupo del goteo tiene 2+ enemigos, entran repartidos.
  for (const id of DIR_IDS) {
    for (const seed of GEN_SEEDS) {
      for (const w of classicWaves(generateStageWaves(id, seed))) {
        if (archetypeOf(w) !== 'goteo') continue;
        const gs = waveGroups(w);
        const gi = gs.findIndex((g) => g.type !== 'crystal');
        if (gi < 0 || gs[gi].count < 2) continue;   // 1 enemigo no se reparte
        const ev = waveSchedule(w).filter((e) => e.group === gi);
        const spread = ev[ev.length - 1].at - ev[0].at;
        assert.ok(spread >= 0.5,
          `S${id} seed ${seed} (t=${w.t}): el goteo entra en ${spread.toFixed(2)} s`);
      }
    }
  }
});

test('fase 65: el enjambre reparte su avalancha (no nace en un frame)', () => {
  for (const id of DIR_IDS) {
    for (const seed of GEN_SEEDS) {
      for (const w of classicWaves(generateStageWaves(id, seed))) {
        if (archetypeOf(w) !== 'enjambre') continue;
        const gs = waveGroups(w);
        const gi = gs.findIndex((g) => g.type !== 'crystal');
        if (gi < 0 || gs[gi].count < 2) continue;
        const ev = waveSchedule(w).filter((e) => e.group === gi);
        const spread = ev[ev.length - 1].at - ev[0].at;
        assert.ok(spread >= 0.5,
          `S${id} seed ${seed} (t=${w.t}): el enjambre entra en ${spread.toFixed(2)} s`);
      }
    }
  }
});

test('fase 65: las variantes de élite respetan topes y décadas', () => {
  // Catálogo congelado (fase 68: 7 afijos).
  assert.deepEqual(Object.keys(ENEMY_VARIANTS).sort(), [
    'acorazado', 'divisor', 'escudado', 'rapido', 'regenerador', 'sanador', 'tenaz',
  ]);
  // Décadas de entrada (fase 68: las nuevas entran después de las viejas).
  assert.deepEqual(VARIANT_DECADES, {
    escudado: 10, rapido: 12, divisor: 18, sanador: 22,
    regenerador: 25, acorazado: 30, tenaz: 35,
  });
  assert.deepEqual(variantsForStage(9), []);
  assert.deepEqual(variantsForStage(10), ['escudado']);
  assert.deepEqual(variantsForStage(11), ['escudado']);
  assert.deepEqual(variantsForStage(12), ['escudado', 'rapido']);
  assert.deepEqual(variantsForStage(18), ['escudado', 'rapido', 'divisor']);
  assert.deepEqual(variantsForStage(22), ['escudado', 'rapido', 'divisor', 'sanador']);
  assert.deepEqual(variantsForStage(25), ['escudado', 'rapido', 'divisor', 'sanador', 'regenerador']);
  assert.deepEqual(variantsForStage(30).slice(-1), ['acorazado']);
  assert.deepEqual(variantsForStage(35).slice(-1), ['tenaz']);
  // Ninguna variante antes de su década.
  for (const id of [6, 9, 11, 15, 24, 30, 50]) {
    const permitidas = new Set(variantsForStage(id));
    for (const seed of GEN_SEEDS) {
      for (const w of classicWaves(generateStageWaves(id, seed))) {
        for (const g of waveGroups(w)) {
          if (!g.variant) continue;
          assert.ok(permitidas.has(g.variant),
            `S${id} seed ${seed}: '${g.variant}' antes de su década`);
        }
      }
    }
  }
  // Topes dentro de la descarga (≤35 %) y CERO variantes en la apertura.
  for (const id of DIR_IDS) {
    for (const seed of GEN_SEEDS) {
      const waves = generateStageWaves(id, seed);
      for (const w of classicWaves(waves)) {
        const gs = waveGroups(w);
        const total = gs.reduce((a, g) => a + g.count, 0);
        let conVariante = 0;
        for (const g of gs) if (g.variant) conVariante += g.count;
        assert.ok(conVariante <= Math.floor(total * VARIANT_MAX_FRAC),
          `S${id} seed ${seed} (t=${w.t}): ${conVariante}/${total} enemigos con variante`);
      }
      for (const w of waves.filter((x) => x.t < OPEN_T)) {
        for (const g of waveGroups(w)) {
          assert.equal(g.variant, undefined,
            `S${id} seed ${seed}: variante '${g.variant}' en la apertura`);
        }
      }
    }
  }
  // `assignVariant` es el punto único de asignación: ≤1 variante por grupo
  // y respeto del 35 % (con 1/2 = 50 % no hay élite).
  const groups = [
    { type: 'spore', count: 40, pattern: 'vee' },
    { type: 'meteor', count: 2, pattern: 'line' },
  ];
  const rnd = () => 0; // siempre asigna
  assert.equal(assignVariant(groups, 20, rnd), 'escudado');
  assert.equal(groups[1].variant, 'escudado', 'la variante va al grupo más chico (2/42)');
  assert.equal(groups[0].variant, undefined);
  const chica = [
    { type: 'spore', count: 1, pattern: 'vee' },
    { type: 'meteor', count: 1, pattern: 'line' },
  ];
  assert.equal(assignVariant(chica, 20, rnd), null, 'con 1/2 = 50 % no hay élite (tope 35 %)');
});

test('fase 65: la élite NUNCA cae sobre el crystal (ni en la reserva del tope)', () => {
  // El crystal es el premio de XP: una élite encima lo vuelve MÁS caro de
  // matar (lo contrario de su rol). Antes de este caso, la reserva del
  // tope ("si ningún grupo de combate cabe, buscar cualquiera que entre")
  // lo elegía a él, porque su count es 1.
  const rnd = () => 0; // siempre asigna
  // Ningún grupo de combate cabe en el 35 % (13 × 0,35 = 4): esporas 6 y
  // meteoritos 6 quedan afuera, el crystal (1) es el único que entraría.
  const soloCrystal = [
    { type: 'spore', count: 6, pattern: 'vee' },
    { type: 'meteor', count: 6, pattern: 'line' },
    { type: 'crystal', count: 1, pattern: 'vee' },
  ];
  assert.equal(assignVariant(soloCrystal, 20, rnd), null,
    'sin grupo de combate que quepa, la descarga va sin élite');
  assert.equal(soloCrystal[2].variant, undefined, 'el premio de XP nunca es élite');

  // Con un grupo de combate que SÍ cabe (meteoritos 2 ≤ 3), la élite va
  // ahí y el crystal queda intacto.
  const conHueco = [
    { type: 'spore', count: 8, pattern: 'vee' },
    { type: 'meteor', count: 2, pattern: 'line' },
    { type: 'crystal', count: 1, pattern: 'vee' },
  ];
  assert.equal(assignVariant(conHueco, 20, rnd), 'escudado');
  assert.equal(conHueco[1].variant, 'escudado', 'la élite escolta al premio, no lo reemplaza');
  assert.equal(conHueco[2].variant, undefined);
});

/** rnd() que devuelve `vals` en orden y repite el último (fase 68). */
const seqRnd = (vals) => {
  let i = 0;
  return () => vals[Math.min(i++, vals.length - 1)];
};

test('fase 68: el afijo por defecto es UNO (la campaña no pide doble)', () => {
  // Contrato: con `maxAffixes` sin especificar se comporta EXACTAMENTE como
  // la fase 65 — el grupo sólo trae `variant`, nunca `variants[]`. Así la
  // campaña no cambia y `_spawnGroup` deriva el array de 1.
  const groups = [
    { type: 'spore', count: 40, pattern: 'vee' },
    { type: 'meteor', count: 2, pattern: 'line' },
  ];
  assert.equal(assignVariant(groups, 20, () => 0), 'escudado');
  assert.equal(groups[1].variant, 'escudado');
  assert.equal(groups[1].variants, undefined, 'con 1 afijo no se publica variants[]');
  assert.equal(groups[0].variants, undefined);
  // El tope duro es 2: pedir 5 no rompe, sigue siendo como máximo 2.
  const tope = [
    { type: 'spore', count: 40, pattern: 'vee' },
    { type: 'meteor', count: 2, pattern: 'line' },
  ];
  assignVariant(tope, 50, () => 0, { maxAffixes: 5 });
  assert.equal(tope[1].variants.length, 2, 'el tope de afijos es 2');
  // La generación de la campaña nunca reparte doble afijo.
  for (const id of [20, 50]) {
    for (const seed of GEN_SEEDS) {
      for (const w of generateStageWaves(id, seed)) {
        for (const g of waveGroups(w)) {
          assert.equal(g.variants, undefined,
            `S${id} seed ${seed}: la campaña publicó variants[] en '${g.type}'`);
        }
      }
    }
  }
});

test('fase 68: con maxAffixes 2 el grupo lleva dos afijos DISTINTOS del pool', () => {
  const groups = [
    { type: 'spore', count: 40, pattern: 'vee' },
    { type: 'meteor', count: 2, pattern: 'line' },
  ];
  const rnd = () => 0; // siempre asigna
  const primero = assignVariant(groups, 20, rnd, { maxAffixes: 2 });
  const permitidas = variantsForStage(20);
  const v = groups[1].variants;
  assert.equal(primero, v[0], '`variant` sigue siendo el PRIMERO');
  assert.equal(groups[1].variant, v[0], 'el grupo conserva variant por compatibilidad');
  assert.equal(v.length, 2, `el grupo quedó con ${v.length} afijos`);
  assert.notEqual(v[0], v[1], 'el doble afijo no repite id');
  for (const id of v) {
    assert.ok(permitidas.includes(id), `'${id}' no está permitida en S20`);
  }
  // El COUNT no cambia: el segundo afijo es del mismo grupo, no un enemigo más.
  assert.equal(groups[1].count, 2, 'el segundo afijo no añade enemigos');
  assert.equal(groups[0].variant, undefined);
  // La élite sigue sin caer sobre el crystal.
  const conCrystal = [
    { type: 'spore', count: 8, pattern: 'vee' },
    { type: 'meteor', count: 2, pattern: 'line' },
    { type: 'crystal', count: 1, pattern: 'vee' },
  ];
  assignVariant(conCrystal, 35, rnd, { maxAffixes: 2 });
  assert.equal(conCrystal[2].variant, undefined, 'el crystal nunca es élite');
  assert.equal(conCrystal[2].variants, undefined, 'ni con dos afijos');
});

test('fase 68: con una sola variante permitida (S10) no hay segundo afijo', () => {
  assert.deepEqual(variantsForStage(10), ['escudado']);
  const groups = [
    { type: 'spore', count: 40, pattern: 'vee' },
    { type: 'meteor', count: 2, pattern: 'line' },
  ];
  assert.equal(assignVariant(groups, 10, () => 0, { maxAffixes: 2 }), 'escudado');
  assert.equal(groups[1].variant, 'escudado');
  assert.equal(groups[1].variants, undefined, 'sin un segundo id del pool no se publica el array');
  const afijos = groups[1].variants ?? [groups[1].variant];
  assert.equal(afijos.length, 1, 'el grupo quedó con UN afijo');
});

test('fase 68: el segundo afijo nunca repite el primero', () => {
  // rnd que devuelve 0,5 siempre: sobre el pool COMPLETO de S20 (3 ids) el
  // índice daría 'rapido' las dos veces; el segundo se sortea sobre el pool
  // sin el primero, así que tiene que salir otro id.
  const groups = [
    { type: 'spore', count: 40, pattern: 'vee' },
    { type: 'meteor', count: 2, pattern: 'line' },
  ];
  const rnd = seqRnd([0, 0.5, 0.5]);
  assert.equal(assignVariant(groups, 20, rnd, { maxAffixes: 2 }), 'rapido');
  assert.deepEqual(groups[1].variants, ['rapido', 'divisor']);
  assert.equal(new Set(groups[1].variants).size, 2);
});

test('fase 65: los biomas por década no comparten familia dominante', () => {
  // Medido con 20 semillas (las de la sonda): la familia dominante de cada
  // década cae entre el 45 % y el 60 % de los enemigos y NO se repite en
  // la década siguiente. El VIRUS —cuyos dos tipos son los tanques— no
  // puede serlo en conteos: su sesgo vive en la masa de HP (ver BIOMES).
  const DECADAS = [[6, 9], [10, 19], [20, 29], [30, 39], [40, 50]];
  const dominante = (id) => {
    const fams = { rock: 0, crystal: 0, spore: 0, virus: 0 };
    for (let s = 0; s < 20; s++) {
      for (const w of generateStageWaves(id, 1000 + s * 7919 + id)) {
        for (const g of waveGroups(w)) {
          if (g.type === 'boss' || g.pattern === 'boss') continue;
          fams[ENEMY_FAMILY_BY_TYPE[g.type]] += g.count;
        }
      }
    }
    const total = Object.values(fams).reduce((a, b) => a + b, 0);
    const pct = Object.fromEntries(
      Object.entries(fams).map(([f, n]) => [f, Math.round((n / total) * 100)]),
    );
    const dom = Object.entries(pct).sort((a, b) => b[1] - a[1])[0];
    return { familia: dom[0], pct: dom[1], pool: poolForStage(id) };
  };
  let prev = null;
  for (const [desde] of DECADAS) {
    const d = dominante(desde);
    assert.ok(d.pct >= 45 && d.pct <= 60,
      `S${desde}: '${d.familia}' domina con el ${d.pct} % (fuera de 45-60 %)`);
    if (prev) {
      assert.notEqual(d.familia, prev, `S${desde}: comparte familia dominante con la década anterior`);
    }
    prev = d.familia;
    // El pool declarado (lo que muestra el selector de etapa) apunta a la
    // misma familia y su sesgo es una cuota real (ni plano ni >60 %).
    const porFamilia = {};
    for (const p of d.pool) porFamilia[p.family] = (porFamilia[p.family] ?? 0) + p.weight;
    const declarada = Object.entries(porFamilia).sort((a, b) => b[1] - a[1])[0];
    assert.equal(declarada[0], d.familia, `S${desde}: el pool declara '${declarada[0]}' y cae '${d.familia}'`);
    assert.ok(declarada[1] > 30 && declarada[1] < 60,
      `S${desde}: el pool declara '${declarada[0]}' con el ${declarada[1]} %`);
  }
});

test('fase 65: la descarga es legible (contraste de velocidad y sin tipo repetido)', () => {
  // Lo que el jugador VE: la descarga no repite tipo, sus grupos de
  // combate caben en la pantalla (≤3, además del crystal) y la ETAPA
  // mantiene el contraste de velocidad intra-ola. Detalle honesto: una
  // descarga de UN solo grupo de combate no tiene contraste interno (su
  // contraste es contra la descarga vecina) y la `pinza` es simétrica a
  // propósito (dos brazos rápidos): por eso el contraste se exige en la
  // media de la etapa y en la mayoría de las descargas mixtas, no en el
  // 100 % (el baseline de la fase 64 medía 52 px/s; el director, 48-53).
  let total = 0;
  let contrastadas = 0;
  let suma = 0;
  for (const id of DIR_IDS) {
    let n = 0;
    let sum = 0;
    let conContraste = 0;
    for (const seed of GEN_SEEDS) {
      for (const w of classicWaves(generateStageWaves(id, seed))) {
        const gs = waveGroups(w);
        const tipos = gs.map((g) => g.type);
        assert.equal(new Set(tipos).size, tipos.length,
          `S${id} seed ${seed}: tipo repetido en la descarga (${tipos.join('+')})`);
        const combate = gs.filter((g) => g.type !== 'crystal');
        assert.ok(combate.length <= 3, `S${id} seed ${seed}: ${combate.length} grupos de combate`);
        if (gs.length < 2) continue;
        const vel = gs.map((g) => VEL[g.type] ?? 0);
        const rango = Math.max(...vel) - Math.min(...vel);
        n += 1;
        sum += rango;
        if (rango >= 25) conContraste += 1;
      }
    }
    assert.ok(sum / n >= 25,
      `S${id}: contraste medio de ${(sum / n).toFixed(1)} px/s (< 25)`);
    total += n;
    suma += sum;
    contrastadas += conContraste;
  }
  assert.ok(contrastadas / total >= 0.6,
    `sólo ${contrastadas}/${total} descargas contrastan ≥25 px/s (${(100 * contrastadas / total).toFixed(0)} %)`);
  assert.ok(suma / total >= 25, `contraste medio global ${(suma / total).toFixed(1)} px/s`);
});

test('fase 65: las tablas manuales 1..5 también son del director', () => {
  // Las tablas manuales conservan tiempos y conteos (los fija el test de
  // monotonía de más arriba) pero su tramo clásico va ETIQUETADO con su
  // arquetipo y ESCALONADO como su molde: la entrada deja de ser una placa.
  for (const id of MANUAL_IDS) {
    const table = STAGE_WAVES[id];
    const classic = table.filter((w) => w.t >= OPEN_T && !isBossWave(w));
    const seq = classic.map((w) => archetypeOf(w));
    for (const a of seq) assert.ok(a, `S${id}: descarga clásica sin arquetipo`);
    assert.ok(new Set(seq).size >= 4, `S${id}: sólo ${new Set(seq).size} arquetipos`);
    for (let i = 1; i < seq.length; i++) {
      assert.notEqual(seq[i], seq[i - 1], `S${id}: '${seq[i]}' repetido en descargas seguidas`);
    }
    for (let i = 4; i < seq.length; i++) {
      const win = seq.slice(i - 4, i + 1);
      assert.ok(win.filter((a) => a === seq[i]).length < 3, `S${id}: '${seq[i]}' 3 veces en 5`);
    }
    // Al menos un molde de arroyo reparte a su grupo en el tiempo.
    assert.ok(classic.some((w) => waveGroups(w).some((g) => g.stagger > 0)),
      `S${id}: ninguna descarga con escalonado`);
    // La APERTURA queda intacta: sin etiqueta ni escalonado.
    for (const w of table.filter((x) => x.t < OPEN_T)) {
      assert.equal(w.archetype, undefined, `S${id} (t=${w.t}): la apertura no se etiqueta`);
      for (const g of waveGroups(w)) {
        assert.equal(g.stagger, undefined, `S${id} (t=${w.t}): escalonado en la apertura`);
        assert.equal(g.delay, undefined, `S${id} (t=${w.t}): delay en la apertura`);
      }
    }
  }
});

test('fase 65: composeWave reparte el presupuesto en grupos sin repetir tipo', () => {
  // Presupuesto REAL de una descarga del S20 (el de la curva de presión).
  const pool = poolForStage(20);
  const budget = waveBudget(20, 80) - (ENEMY_TYPES.crystal?.hp ?? 60);
  const a = composeWave('convoy', budget, pool, fixedRnd(11));
  assert.deepEqual(a, composeWave('convoy', budget, pool, fixedRnd(11)), 'composeWave no es determinista');
  assert.ok(a.length >= 1 && a.length <= WAVE_ARCHETYPES.convoy.groups.length);
  const tipos = a.map((g) => g.type);
  assert.equal(new Set(tipos).size, tipos.length, 'tipos repetidos');
  assert.ok(!tipos.includes('crystal'), 'composeWave no sortea el crystal (va aparte)');
  for (const g of a) assert.ok(g.count >= 1 && g.pattern, `grupo inválido: ${JSON.stringify(g)}`);
  // El CONVOY junta un tanque con ligeros (spec §Composición por
  // arquetipos): el MOLDE lo garantiza (el grupo 0 es de la banda de
  // tanques) y en la etapa real lo cumple la gran mayoría de las
  // descargas — en los valles de presión el tanque no cabe en su parte
  // del presupuesto y el molde entra sin él (una descarga más chica).
  assert.equal(WAVE_ARCHETYPES.convoy.groups[0].role, 'tanque');
  assert.ok(a.some((g) => VEL_BANDS.tanque.includes(g.type)), 'el convoy no lleva tanque');
  assert.ok(a.some((g) => !VEL_BANDS.tanque.includes(g.type)), 'el convoy no lleva ligeros');
  let conTanque = 0;
  let convoys = 0;
  for (const id of [8, 10, 20, 30, 50]) {
    for (const seed of GEN_SEEDS) {
      for (const w of classicWaves(generateStageWaves(id, seed))) {
        if (archetypeOf(w) !== 'convoy') continue;
        convoys += 1;
        if (waveGroups(w).some((g) => VEL_BANDS.tanque.includes(g.type))) conTanque += 1;
      }
    }
  }
  assert.ok(conTanque / convoys >= 0.6,
    `sólo ${conTanque}/${convoys} convoys traen tanque (${(100 * conTanque / convoys).toFixed(0)} %)`);
  // Un presupuesto mayor trae más HP (el reparto escala con el presupuesto).
  const hp = (gs) => gs.reduce((s, g) => s + (ENEMY_TYPES[g.type]?.hp ?? 0) * g.count, 0);
  assert.ok(hp(composeWave('convoy', budget * 4, pool, fixedRnd(11))) > hp(a),
    'el presupuesto no escala la cantidad');
});

// ---------- Scheduler: spawns diferidos (fase 65, sección 2) ----------

class EngineStub {
  constructor() {
    this.entities = [];
    this.listeners = new Map();
    this.events = [];
  }

  on(name, cb) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push(cb);
  }

  emit(name, payload) {
    for (const cb of this.listeners.get(name) ?? []) cb(payload);
    this.events.push({ name, payload });
  }

  addEntity(e) { this.entities.push(e); }
}

/** Stub de partida para el WaveManager (sin DOM ni canvas). */
function stubGame() {
  const engine = new EngineStub();
  return { engine, fortress: { enemies: [] } };
}

test('fase 65: el scheduler suelta la descarga en su instante (no en un frame)', () => {
  const game = stubGame();
  const wm = new WaveManager(20);
  wm.queue = [{
    t: 5,
    archetype: 'goteo',
    groups: [{ type: 'spore', count: 3, pattern: 'vee', stagger: 0.5 }],
  }];
  wm.t = 5;
  wm.update(0.01, game);
  assert.equal(game.fortress.enemies.length, 1, 'el primero entra ya');
  assert.equal(wm.pending.length, 2, 'los otros dos quedan agendados');
  assert.equal(wm.dispatched, 1, 'la descarga cuenta como despachada (progreso)');
  wm.update(0.5, game);
  assert.equal(game.fortress.enemies.length, 2, 'a los 0,5 s entra el segundo');
  wm.update(0.5, game);
  assert.equal(game.fortress.enemies.length, 3, 'a los 1,0 s entra el tercero');
  assert.equal(wm.pending.length, 0, 'la agenda queda vacía');
  assert.equal(wm.progress, 1, 'el progreso del stage sigue siendo correcto');
});

test('fase 65: el aviso de jefe cancela los spawns pendientes', () => {
  const game = stubGame();
  const wm = new WaveManager(20);
  wm.queue = [
    { t: 5, archetype: 'goteo', groups: [{ type: 'spore', count: 6, pattern: 'vee', stagger: 1 }] },
    { t: 6, groups: [{ type: 'boss', count: 1, pattern: 'boss' }] },
  ];
  wm.t = 5;
  wm.update(0.01, game);
  const antes = game.fortress.enemies.length;
  assert.ok(wm.pending.length > 0, 'hay spawns diferidos antes del aviso');
  wm.t = 6;
  wm.update(0.01, game);   // llega la ola de jefe → WARNING
  assert.equal(wm.pending.length, 0, 'el aviso vacía la agenda');
  assert.equal(game.fortress.enemies.length, antes,
    'no puede colarse un enemigo normal con el aviso en curso');
  assert.equal(game.engine.events.filter((e) => e.name === 'boss:warning').length, 1);
  // Durante el aviso no se spawnea nada, aunque pasen ticks.
  wm.update(1, game);
  wm.update(0.5, game);
  assert.equal(game.fortress.enemies.length, antes, 'el aviso congela los spawns');
});

test('fase 65: la etapa no cierra mientras queden spawns pendientes', () => {
  const game = stubGame();
  const wm = new WaveManager(20);
  let cerrado = false;
  wm.onWavesDone(() => { cerrado = true; });
  wm.queue = [{
    t: 5,
    archetype: 'goteo',
    groups: [{ type: 'spore', count: 3, pattern: 'vee', stagger: 1 }],
  }];
  wm.t = 5;
  wm.update(0.01, game);
  assert.equal(wm.queue.length, 0, 'la cola de olas está vacía');
  assert.equal(wm.pending.length, 2, 'y quedan spawns agendados');
  // Con spawns pendientes la etapa NO puede cerrar, ni aunque la arena
  // esté limpia y pase el respiro de 1,2 s.
  game.fortress.enemies.length = 0;
  wm.update(1.0, game);   // entra el 2º
  assert.equal(wm.pending.length, 1, 'queda 1 pendiente');
  game.fortress.enemies.length = 0;
  wm.update(2.0, game);   // entra el 3º (último de la agenda)
  assert.equal(wm.pending.length, 0, 'la agenda quedó vacía');
  assert.equal(cerrado, false, 'cerró la etapa antes de tiempo');
  // Arena limpia: ahora sí, tras el respiro de 1,2 s.
  game.fortress.enemies.length = 0;
  wm.update(1.0, game);
  assert.equal(cerrado, false, 'no cerró con la arena limpia');
  wm.update(0.5, game);
  assert.equal(cerrado, true, 'la etapa no cerró con la arena limpia');
});

test('fase 65: el scheduler es determinista (misma secuencia en dos corridas)', () => {
  const run = () => {
    const game = stubGame();
    const wm = new WaveManager(20);
    const real = Math.random;
    Math.random = fixedRnd(2027);   // también siembra el jitter del spawn
    try {
      wm.queue = [...generateStageWaves(20, 555)];
      wm.t = 0;
      const out = [];
      for (let i = 0; i < 1500; i++) {
        const n = game.fortress.enemies.length;
        wm.update(0.1, game);
        for (let k = n; k < game.fortress.enemies.length; k++) {
          const e = game.fortress.enemies[k];
          out.push(`${e.type}@${e.x.toFixed(1)}`);
        }
      }
      return out.join('|');
    } finally {
      Math.random = real;
    }
  };
  const a = run();
  assert.equal(a, run(), 'dos corridas con la misma semilla dan distinta secuencia de spawns');
  assert.ok(a.split('|').length > 100, `la corrida spawneó ${a.split('|').length} enemigos (pocos)`);
});

test('fase 65: wave:incoming anuncia el arquetipo que entra', () => {
  const game = stubGame();
  const wm = new WaveManager(20);
  const vistos = [];
  game.engine.on('wave:incoming', (p) => vistos.push(p));
  wm.queue = [
    { t: 5, archetype: 'convoy', groups: [{ type: 'blob', count: 1, pattern: 'wall', lane: 'centro' }] },
    { t: 9, groups: [{ type: 'spore', count: 2, pattern: 'vee' }] },   // sin arquetipo
    { t: 12, groups: [{ type: 'boss', count: 1, pattern: 'boss' }] },  // el jefe no es arquetipo
  ];
  wm.t = 5;
  wm.update(0.01, game);
  wm.t = 9;
  wm.update(0.01, game);
  wm.t = 12;
  wm.update(0.01, game);
  assert.equal(vistos.length, 1, `se anunciaron ${vistos.length} arquetipos`);
  assert.deepEqual(vistos[0], { archetype: 'convoy', name: 'CONVOY' });
});

test('fase 65: el jitter de velocidad NO toca la apertura', () => {
  // El modelo de matabilidad de la apertura calcula el ttk con la
  // velocidad EXACTA del tipo: un jitter ahí rompería el tope por enemigo
  // (y con él, la promesa "apertura 100 % farmable").
  const run = (t) => {
    const game = stubGame();
    const wm = new WaveManager(20);
    wm.queue = [{ t, groups: [{ type: 'spore', count: 40, pattern: 'rain' }] }];
    wm.t = t;
    const real = Math.random;
    Math.random = fixedRnd(99);
    try {
      wm.update(0.01, game);
    } finally {
      Math.random = real;
    }
    return game.fortress.enemies.map((e) => e.vel);
  };
  const exacta = ENEMY_TYPES.spore.vel * scaleFor(20).velMul;
  const apertura = run(10);
  assert.equal(apertura.length, 40, 'la apertura entra entera en un frame');
  for (const v of apertura) {
    assert.equal(v, exacta, 'la apertura lleva la velocidad EXACTA del tipo (sin jitter)');
  }
  const clasico = run(60);
  assert.equal(clasico.length, 40, 'una descarga sin stagger entra en un frame');
  assert.ok(new Set(clasico.map((v) => v.toFixed(4))).size > 30,
    'el jitter no dispersó las velocidades');
  for (const v of clasico) {
    const dev = Math.abs(v / exacta - 1);
    assert.ok(dev > 0, 'sin jitter fuera de la apertura');
    assert.ok(dev <= 0.10, `jitter de ${(dev * 100).toFixed(1)} % (máximo ±10 %)`);
  }
});

test('fase 68: el spawn traslada los DOS afijos del grupo al Enemy', () => {
  const game = stubGame();
  game.stageId = 30;
  const wm = new WaveManager(30);
  wm.queue = [{
    t: 5,
    groups: [
      { type: 'blob', count: 2, pattern: 'line', variants: ['acorazado', 'sanador'] },
      // Con 1 afijo el grupo sólo trae `variant` (comportamiento de campaña).
      { type: 'spore', count: 1, pattern: 'line', variant: 'escudado' },
    ],
  }];
  wm.t = 5;
  wm.update(0.01, game);
  const dobles = game.fortress.enemies.filter((e) => e.type === 'blob');
  assert.equal(dobles.length, 2);
  for (const e of dobles) {
    assert.deepEqual(e.variants, ['acorazado', 'sanador']);
    assert.equal(e.variant, 'acorazado', 'el getter de compatibilidad da el primero');
    assert.ok(e.armor > 0, 'el acorazado aplicó su armadura');
  }
  // `variant` solo sigue instanciando una élite simple (sin duplicar).
  const simple = game.fortress.enemies.filter((e) => e.type === 'spore');
  assert.equal(simple.length, 1);
  assert.deepEqual(simple[0].variants, ['escudado']);
  assert.equal(simple[0].variant, 'escudado');
  assert.equal(game.engine.entities.length, 3, 'el engine recibe todas las entidades');
});

// ============================================================
// fase 70 — WaveManager EXTENSIBLE (modo Supervivencia)
// ============================================================

test('fase 70: regresión — la campaña sigue generando su cola y cerrando', () => {
  const wm = new WaveManager(50, { seed: 2027 });
  assert.equal(wm.survival, false, 'sin survival el manager es el de siempre');
  assert.ok(wm.queue.length > 0, 'el S50 genera su cola entera');
  assert.deepEqual(wm.queue, generateStageWaves(50, 2027),
    'la cola es exactamente la del director (sin cambios)');
  assert.equal(wm.extend, null);
  assert.equal(wm.extendNow(), false, 'sin hook no hay primer bloque que inyectar');
  assert.equal(wm.survivalWave, 0);

  // El cierre v6 intacto: cola vacía + arena limpia = onWavesDone tras el respiro.
  const game = stubGame();
  let cerrado = 0;
  wm.onWavesDone(() => { cerrado += 1; });
  wm.queue = [{ t: 0, groups: [{ type: 'spore', count: 1, pattern: 'vee' }] }];
  wm.t = 0;
  wm.update(0.01, game);
  assert.equal(game.fortress.enemies.length, 1, 'la ola entró');
  game.fortress.enemies.length = 0;
  wm.update(1.0, game);
  assert.equal(cerrado, 0, 'no cierra antes del respiro de 1,2 s');
  wm.update(0.5, game);
  assert.equal(cerrado, 1, 'la campaña cierra como siempre');
});

test('fase 70: con survival la cola arranca vacía y sin hook no hay bloque', () => {
  const wm = new WaveManager(50, { survival: true });
  assert.equal(wm.survival, true);
  assert.deepEqual(wm.queue, [], 'no se materializa la etapa 50 entera');
  assert.equal(wm.survivalWave, 0);
  assert.equal(wm.extendNow(), false, 'sin extend no hay nada que inyectar');

  // Aunque la cola quede vacía para siempre, la etapa NO cierra.
  const game = stubGame();
  let cerrado = 0;
  wm.onWavesDone(() => { cerrado += 1; });
  for (let i = 0; i < 10; i++) wm.update(1, game);
  assert.equal(cerrado, 0, 'onWavesDone NUNCA se llama en supervivencia');
});

test('fase 70: extendNow inyecta el bloque y la run pide el siguiente', () => {
  const game = stubGame();
  let llamadas = 0;
  const wm = new WaveManager(50, {
    survival: true,
    extend: (m) => {
      llamadas += 1;
      m.queue.push({
        t: m.t + 1, wave: 1, groups: [{ type: 'spore', count: 1, pattern: 'vee' }],
      });
      return true;
    },
  });
  assert.equal(wm.extendNow(), true, 'extendNow llama al hook');
  assert.equal(llamadas, 1);
  assert.equal(wm.queue.length, 1, 'el primer bloque está en la cola');
  assert.equal(wm.queue[0].wave, 1);
  assert.equal(wm.survivalWave, 0, 'todavía no se despachó ninguna oleada');

  let cerrado = 0;
  wm.onWavesDone(() => { cerrado += 1; });
  wm.update(0.5, game);
  assert.equal(wm.survivalWave, 0, 'la ola aún no venció (t = 1)');
  wm.update(0.6, game);   // t = 1,1 → despacha
  assert.equal(wm.survivalWave, 1, 'la oleada normal despachada manda el contador');
  assert.equal(llamadas, 1, 'con la cola llena no se pide otro bloque');

  // Arena limpia → pide el bloque siguiente en vez de cerrar la etapa.
  game.fortress.enemies.length = 0;
  wm.update(0.1, game);
  assert.equal(llamadas, 2, 'al vaciarse, extend vuelve a entrar');
  const antes = llamadas;
  for (let i = 0; i < 6; i++) {
    game.fortress.enemies.length = 0;
    wm.update(1.1, game);
  }
  assert.ok(llamadas > antes, 'la supervivencia sigue pidiendo bloques');
  assert.equal(wm.survivalWave, 1, 'la oleada despachada es la misma (wave: 1)');
  assert.equal(cerrado, 0, 'la run NUNCA cierra la etapa');
});

test('fase 70: el bloque de 5 olas entra con su jefe al final', () => {
  let llamadas = 0;
  const wm = new WaveManager(50, {
    survival: true,
    extend: (m) => {
      llamadas += 1;
      for (const w of survivalWaveChunk(m.survivalWave + 1, 5, 7)) {
        m.queue.push({ ...w, t: m.t + w.t });
      }
      return true;
    },
  });
  assert.equal(wm.extendNow(), true);
  assert.equal(llamadas, 1);
  assert.equal(wm.queue.length, 6, '5 olas normales + la del jefe');
  const jefes = wm.queue.filter((w) => w.pattern === 'boss');
  assert.equal(jefes.length, 1, 'el check de jefe cierra el bloque');
  assert.equal(jefes[0].wave, 5, 'cae en la oleada 5');
  assert.deepEqual(wm.queue.map((w) => w.wave), [1, 2, 3, 4, 5, 5]);
});

test('fase 70: bossKind/bossName fuerzan el jefe de la run', () => {
  const game = stubGame();
  const wm = new WaveManager(50, {
    survival: true, bossKind: 'blobBoss', bossName: 'Blob Rey',
  });
  wm._spawnBoss(game);
  assert.equal(game.fortress.enemies.length, 1);
  const boss = game.fortress.enemies[0];
  assert.equal(boss.type, 'blobBoss');
  assert.equal(boss.data.name, 'Blob Rey');
  assert.equal(boss.isBoss, true);
  assert.equal(wm.bossRef, boss);
  assert.equal(ENEMY_TYPES.blobBoss.name, 'BLOB VIRUS',
    'ENEMY_TYPES no se renombra (la ficha global queda intacta)');

  // El aviso de jefe anuncia el MISMO nombre que va a entrar.
  const wm2 = new WaveManager(50, {
    survival: true, bossKind: 'blobBoss', bossName: 'Blob Rey',
  });
  const game2 = stubGame();
  wm2.queue = [{ t: 0, pattern: 'boss', groups: [{ type: 'boss', count: 1, pattern: 'boss' }] }];
  wm2.update(0.01, game2);
  const avisos = game2.engine.events.filter((e) => e.name === 'boss:warning');
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0].payload.name, 'Blob Rey');

  // Sin overrides, la campaña se comporta como siempre.
  const game3 = stubGame();
  const wm3 = new WaveManager(50);
  wm3._spawnBoss(game3);
  assert.equal(game3.fortress.enemies[0].type, bossForStage(50));
  assert.equal(game3.fortress.enemies[0].data.name, bossNameForStage(50));
});

test('fase 71: el aviso de jefe no bloquea los spawns de la ola siguiente', () => {
  // Regresión del bug de Supervivencia: tras el primer jefe las olas
  // normales se anunciaban pero no spawneaban porque `warningLeft` quedaba
  // negativo (−0,05) y `if (!this.warningLeft)` no dejaba correr el flush.
  const game = stubGame();
  const wm = new WaveManager(50, { survival: true });
  wm.queue = [
    { t: 0, pattern: 'boss', groups: [{ type: 'boss', count: 1, pattern: 'boss' }] },
    { t: 0, wave: 2, groups: [{ type: 'spore', count: 1, pattern: 'vee' }] },
  ];
  wm.update(0.01, game);
  assert.ok(wm.warningLeft > 0, 'el aviso de jefe arrancó');

  // dt que deja el temporizador en negativo (el caso real con dt variable).
  wm.update(2.05, game);
  assert.equal(wm.warningLeft, 0, 'el aviso se normaliza a 0, no queda en −0,05');
  assert.equal(game.fortress.enemies.filter((e) => e.isBoss).length, 1,
    'el jefe entró al terminar el aviso');

  wm.update(0.01, game);
  assert.equal(game.fortress.enemies.filter((e) => !e.isBoss).length, 1,
    'la ola normal pendiente SÍ spawnea después del jefe');
});
