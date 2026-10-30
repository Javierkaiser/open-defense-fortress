// ============================================================
// survival.js — EL MODO SUPERVIVENCIA (fase 70): reglas PURAS.
//
// Una run de olas infinitas en una sola arena: sin etapas, sin reset y
// sin la regla del 25 % de fugas. La base (25 500 HP) es la que aguanta;
// cada fuga resta el HP restante del enemigo. Cada 5 oleadas entra un jefe
// y el tema de la arena rota.
//
// La COLA se genera por bloques (5 olas) y el WaveManager la pide cuando
// se vacía (`extend`): nunca se materializa una cola infinita.
//
// El arranque es SUAVE a propósito: la oleada 1 es una descarga chica en
// un stage virtual 2,5 (el Guardian Lv1 tiene que poder subir de nivel) y
// el presupuesto crece LINEAL con la oleada. Empezar en el S50 con un
// Lv1 (como la primera calibración) era un acantilado.
//
// Este módulo no sabe de DOM ni de storage. La persistencia de récords
// vive en progress.js; el cableado, en main.js/waves.js.
// ============================================================

import { STAGES, scaleFor } from './stages.js';
import {
  poolForStage, pickArchetype, composeWave, assignVariant,
} from './waves.js';
import { HEAT_MAX_TOTAL, heatRewardMul } from './heat.js';

/** Constantes de la run (diales de calibración). */
export const SURVIVAL = {
  baseHp: 25500,       // la base del S50
  checkEvery: 5,       // jefe cada 5 oleadas
  chunk: 5,            // olas por bloque (extend)
  gap: 8,              // segundos entre oleadas del bloque
  baseStage: 1,        // stage virtual de la oleada 0 (arranque suave)
  stagePerWave: 3.0,   // +3 stage virtual por oleada
  maxLevel: 31,        // 30 cartas (la campaña usa 20)
  budgetBase: 60,      // HP BASE de la primera oleada
  budgetPerWave: 30,   // HP BASE que suma cada oleada
};

/** RNG determinista local (no se exporta: la semilla manda). */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stage virtual de una oleada: en la 20 es 31; en la 40, 61. */
export function survivalStage(wave) {
  const w = Math.max(0, Math.trunc(Number(wave) || 0));
  return SURVIVAL.baseStage + w * SURVIVAL.stagePerWave;
}

/**
 * fase 75 — Stage que paga el XP de la run.
 *
 * En Supervivencia `stageId` se queda en 1 (curva de arranque) mientras
 * `survivalWave` avanza; usar `stageId` para XP hacía que la oleada 40
 * pagara energía de stage 1. En campaña/∞ manda `stageId`.
 *
 * @param {{mode?:string, survivalWave?:number, stageId?:number}} run
 * @returns {number}
 */
export function xpStageForRun(run = {}) {
  if (run.mode === 'survival') return survivalStage(run.survivalWave ?? 0);
  return run.stageId ?? 1;
}

/** Escala EFECTIVA de la oleada (stage virtual × Protocolo). */
export function survivalScale(wave, runMods = null) {
  const base = scaleFor(survivalStage(wave));
  return {
    hpMul: base.hpMul * (runMods?.hpMul ?? 1),
    velMul: base.velMul * (runMods?.velMul ?? 1),
  };
}

/**
 * UN BLOQUE de olas (`count` por defecto), con `t` RELATIVO al inicio del
 * bloque. El último cae en un múltiplo de `checkEvery` y agrega la ola de
 * JEFE (el manager la detecta por `pattern:'boss'` y llama a su `_spawnBoss`).
 *
 * Determinista por (from, seed, runMods): la misma run diaria/reintento
 * juega exactamente las mismas olas.
 *
 * @param {number} from primera oleada del bloque (1-based)
 * @param {number} [count]
 * @param {number} [seed]
 * @param {{runMods?:object|null}} [opts]
 * @returns {Array<object>} olas con `t` relativo
 */
export function survivalWaveChunk(from, count = SURVIVAL.chunk, seed = 1, opts = {}) {
  const start = Math.max(1, Math.trunc(Number(from) || 1));
  const n = Math.max(1, Math.trunc(Number(count) || SURVIVAL.chunk));
  const rm = opts.runMods ?? null;
  const rnd = mulberry32(((seed >>> 0) ^ (start * 7919)) >>> 0);
  const waves = [];
  const hist = [];
  for (let i = 0; i < n; i++) {
    const wave = start + i;
    const stage = survivalStage(wave);
    const archetype = pickArchetype(hist, rnd, { stage });
    hist.push(archetype);
    // Presupuesto LINEAL en HP BASE (no el de una etapa): la oleada 1 es
    // pequeña para que el Guardian Lv1 suba de nivel; después crece sola.
    // El HP REAL lo multiplica `wm.scale.hpMul` al spawnear.
    const budget = (SURVIVAL.budgetBase + wave * SURVIVAL.budgetPerWave)
      * (rm?.countMul ?? 1);
    const groups = composeWave(archetype, budget, poolForStage(stage), rnd);
    if (groups.length) {
      assignVariant(groups, stage, rnd, {
        maxAffixes: rm?.doubleAffix ? 2 : 1,
        chanceAdd: rm?.variantChanceAdd ?? 0,
        fracAdd: rm?.variantFracAdd ?? 0,
      });
    }
    waves.push({ t: i * SURVIVAL.gap, wave, archetype, groups });
    // CHECK de jefe al cerrar el bloque (oleadas 5, 10, 15…). El manager
    // lo convierte en WARNING + `_spawnBoss`; el tipo/nombre del jefe los
    // fija `survivalBossKind/Name` en el `WaveManager`.
    if (wave % SURVIVAL.checkEvery === 0) {
      waves.push({
        t: i * SURVIVAL.gap + 6,
        wave,
        pattern: 'boss',
        groups: [{ type: 'boss', count: 1, pattern: 'boss' }],
      });
    }
  }
  return waves;
}

/** Tema de la arena: rota cada 5 oleadas sobre los 5 de la campaña. */
export function survivalTheme(wave) {
  const w = Math.max(1, Math.trunc(Number(wave) || 1));
  const idx = Math.floor((w - 1) / SURVIVAL.checkEvery) % 5;
  return STAGES[idx]?.theme ?? STAGES[0].theme;
}

const BOSS_CYCLE = [
  { kind: 'blobBoss', name: 'Blob Rey' },
  { kind: 'graveBlob', name: 'Blob Necrótico' },
  { kind: 'armoredBlob', name: 'Coloso Blindado' },
  { kind: 'hybridBoss', name: 'Abominación Híbrida' },
  { kind: 'boss', name: 'Meteorito Colosal' },
];

/** Jefe de una oleada de check (5→Blob Rey, 10→Necrótico, …). */
function bossOf(wave) {
  const w = Math.max(1, Math.trunc(Number(wave) || 1));
  const check = Math.max(1, Math.floor(w / SURVIVAL.checkEvery));
  return BOSS_CYCLE[(check - 1) % BOSS_CYCLE.length];
}

/** Tipo de jefe de la oleada (lo lee `WaveManager._spawnBoss`). */
export function survivalBossKind(wave) {
  return bossOf(wave).kind;
}

/** Nombre propio del jefe de la oleada. */
export function survivalBossName(wave) {
  return bossOf(wave).name;
}

/**
 * Recompensa de una run: SOLO por las oleadas nuevas sobre el mejor previo
 * (repetir una oleada baja no paga), × el heat activo.
 *
 * @param {number} wave oleada alcanzada
 * @param {number} [bestWave] récord previo
 * @param {number} [heat]
 * @returns {{frags:number, gold:number}} frags al POOL compartido y oro total
 */
export function survivalReward(wave, bestWave = 0, heat = 0) {
  const w = Math.max(0, Math.trunc(Number(wave) || 0));
  const best = Math.max(0, Math.trunc(Number(bestWave) || 0));
  const nuevas = Math.max(0, w - best);
  const h = Math.max(0, Math.min(HEAT_MAX_TOTAL, Number(heat) || 0));
  const mul = heatRewardMul(h);
  return {
    frags: Math.round(8 * nuevas * mul),
    gold: Math.round(2 * nuevas * mul),
  };
}
