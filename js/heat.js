// ============================================================
// heat.js — EL PROTOCOLO DE ASEDIO (fase 69): reglas PURAS del "Heat".
//
// Un menú de handicaps con rangos, estilo Pacto de Castigo de Hades:
// el jugador elige QUÉ dolor sufrir y cuánto, y el heat total es la suma
// de los costes. Cada condición mapea a UN dial concreto del juego (sin
// efectos ocultos) y el heat 0 es la experiencia base (fase 68).
//
// Este módulo no sabe de DOM, storage ni Math.random. La persistencia de
// los récords vive en progress.js; el cableado de cada dial, en main.js,
// waves.js, player.js y cards.js.
// ============================================================

/** Condiciones del Protocolo. `ranks` = cantidad de rangos; `heat[r]` = coste del rango r+1. */
export const HEAT_CONDS = [
  {
    id: 'asedio', name: 'Asedio', kind: 'amenaza', ranks: 4, heat: [1, 1, 1, 1],
    desc: 'Cada enemigo que llega a la base hace +15 % de daño por rango.',
    counter: 'Más DPS o menos fugas: la base aguanta menos.',
  },
  {
    id: 'leva', name: 'Leva', kind: 'cantidad', ranks: 3, heat: [1, 1, 1],
    desc: '+8 % de presupuesto de enemigos por rango: entran más por descarga.',
    counter: 'Área y cadencias altas; el objetivo sigue siendo el 75 % de bajas.',
  },
  {
    id: 'vigor', name: 'Vigor', kind: 'resistencia', ranks: 3, heat: [1, 1, 1],
    desc: '+6 % de HP de los enemigos por rango.',
    counter: 'Daño sostenido y upgrades; no cambia la composición.',
  },
  {
    id: 'prisa', name: 'Prisa', kind: 'movilidad', ranks: 2, heat: [2, 2],
    desc: '+5 % de velocidad de caída por rango: menos tiempo bajo fuego.',
    counter: 'Cobertura y slows; el Dron de Campo de Fuerza rinde más.',
  },
  {
    id: 'elites', name: 'Élites', kind: 'composicion', ranks: 2, heat: [2, 3],
    desc: '+5 % de probabilidad de élite y +3 % de fracción por rango.',
    counter: 'Foco y burst: las élites ya pagan más score/XP.',
  },
  {
    id: 'jefes', name: 'Jefes', kind: 'composicion', ranks: 2, heat: [3, 6],
    desc: '+10 % de HP de jefe y 2 élites de escolta por rango.',
    counter: 'Guarda el Ultimate y el burst para el jefe.',
  },
  {
    id: 'censura', name: 'Censura', kind: 'restriccion', ranks: 2, heat: [2, 3],
    desc: 'Una carta menos en cada oferta por rango (3 → 2 → 1).',
    counter: 'Elegí mejor: la oferta no perdona el relleno.',
  },
  {
    id: 'apagon', name: 'Apagón', kind: 'restriccion', ranks: 1, heat: [3],
    desc: 'Sin Ultimate ni Black Hole durante la run.',
    counter: 'El daño de las torres y las cartas tienen que bastar.',
  },
  {
    id: 'arsenal', name: 'Arsenal', kind: 'restriccion', ranks: 1, heat: [5],
    desc: 'Un slot de torre menos: la base ofrece 4 en vez de 5.',
    counter: 'Las 4 torres tienen que cubrir todos los roles.',
  },
  {
    id: 'dobles', name: 'Doble élite', kind: 'composicion', ranks: 1, heat: [5],
    desc: 'Las élites llevan DOS afijos a la vez.',
    counter: 'Prioridad de tiro: una élite con escudo + sanador es otro problema.',
  },
  {
    id: 'fragilidad', name: 'Fragilidad', kind: 'resistencia', ranks: 2, heat: [1, 2],
    desc: '−8 % de HP de base por rango.',
    counter: 'Menos fugas: cada leak pesa más.',
  },
];

/** Hitos de heat que pagan un bonus único de fragmentos. */
export const HEAT_MILESTONES = [5, 10, 20, 35];

/** Presets curados: una escalera legible para quien no quiere pensar. */
export const HEAT_PRESETS = [
  { id: 'I', name: 'Protocolo I', mods: { asedio: 2, leva: 1, vigor: 1, fragilidad: 1 } },
  { id: 'II', name: 'Protocolo II', mods: { asedio: 2, leva: 2, vigor: 2, prisa: 1, elites: 1 } },
  {
    id: 'III', name: 'Protocolo III',
    mods: { asedio: 3, leva: 2, vigor: 2, prisa: 2, elites: 1, censura: 1, fragilidad: 1 },
  },
  {
    id: 'IV', name: 'Protocolo IV',
    mods: { asedio: 3, leva: 3, vigor: 3, prisa: 2, elites: 2, jefes: 1, censura: 1, fragilidad: 1 },
  },
  {
    id: 'V', name: 'Protocolo V',
    mods: { asedio: 3, leva: 3, vigor: 3, prisa: 2, elites: 2, jefes: 2, censura: 2, fragilidad: 2 },
  },
];

const HEAT_MAX = HEAT_CONDS.reduce((a, c) => a + c.heat.reduce((x, y) => x + y, 0), 0);

/** Heat máximo personalizable (49). */
export const HEAT_MAX_TOTAL = HEAT_MAX;

/**
 * Normaliza un mapa de rangos: ids conocidos, enteros, 0..ranks. Devuelve
 * SÓLO los rangos > 0 (el resto no se persiste): un protocolo vacío es `{}`.
 *
 * @param {object|null|undefined} raw
 * @returns {Record<string, number>}
 */
export function normalizeHeatMods(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const c of HEAT_CONDS) {
    const n = Math.trunc(Number(raw[c.id]) || 0);
    const rank = Math.max(0, Math.min(c.ranks, n));
    if (rank > 0) out[c.id] = rank;
  }
  return out;
}

/**
 * Heat TOTAL de un protocolo: la suma del coste de cada rango activo.
 * `{}` → 0; el máximo posible es 49.
 *
 * @param {object|null|undefined} mods
 * @returns {number} 0..49
 */
export function heatTotal(mods) {
  const r = normalizeHeatMods(mods);
  let total = 0;
  for (const c of HEAT_CONDS) {
    const rank = r[c.id] ?? 0;
    // El coste es ACUMULATIVO: el rango 2 de asedio cuesta 1 + 1 = 2.
    for (let i = 0; i < rank; i++) total += c.heat[i] ?? 0;
  }
  return total;
}

/**
 * LOS DIALES del protocolo, listos para cablear. `heat 0` devuelve todos
 * los multiplicadores en 1 y las restricciones apagadas: la fase 68 exacta.
 *
 * @param {object|null|undefined} mods
 * @returns {object} runMods
 */
export function heatMods(mods) {
  const r = normalizeHeatMods(mods);
  const m = (id) => r[id] ?? 0;
  return {
    mods: r,
    heat: heatTotal(r),
    hpMul: 1 + 0.06 * m('vigor'),
    velMul: 1 + 0.05 * m('prisa'),
    countMul: 1 + 0.08 * m('leva'),
    leakMul: 1 + 0.15 * m('asedio'),
    baseHpMul: Math.max(0.7, 1 - 0.08 * m('fragilidad')),
    offerCount: Math.max(1, 3 - m('censura')),
    variantChanceAdd: 0.05 * m('elites'),
    variantFracAdd: 0.03 * m('elites'),
    doubleAffix: m('dobles') > 0,
    bossHpMul: 1 + 0.10 * m('jefes'),
    bossEscort: 2 * m('jefes'),
    noUlt: m('apagon') > 0,
    slotDelta: m('arsenal') > 0 ? -1 : 0,
  };
}

/** Mods de un preset por id ('I'..'V'); `{}` si no existe. */
export function presetMods(id) {
  const p = HEAT_PRESETS.find((x) => x.id === id);
  return p ? { ...p.mods } : {};
}

/** Preset cuyo protocolo coincide EXACTO con `mods`, o null (personalizado). */
export function presetFor(mods) {
  const r = normalizeHeatMods(mods);
  const key = (x) => JSON.stringify(normalizeHeatMods(x));
  return HEAT_PRESETS.find((p) => key(p.mods) === key(r)) ?? null;
}

/** Multiplicador de recompensa: 1 + 0,08 × heat (heat 10 → 1,8). */
export function heatRewardMul(heat) {
  const h = Math.max(0, Math.min(HEAT_MAX, Number(heat) || 0));
  return 1 + 0.08 * h;
}

/**
 * Bonus ÚNICO de fragmentos por hito, POR TORRETA: 60 (heat 5), 120 (10),
 * 240 (20) y 420 (35). El llamador lo aplica una sola vez (progress.claimed).
 */
export function heatMilestoneBonus(threshold) {
  const t = Number(threshold);
  if (!HEAT_MILESTONES.includes(t)) return 0;
  return 12 * t; // 5 → 60, 10 → 120, 20 → 240, 35 → 420
}
