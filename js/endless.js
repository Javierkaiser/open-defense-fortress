// ============================================================
// endless.js — EL MODO INFINITO (fase 67): reglas PURAS del endgame.
//
// La campaña son 50 etapas fijas (stages.js). A partir del Stage 51 el
// juego sigue con ETAPAS GENERADAS: el mismo director de olas (waves.js),
// el mismo ciclo de jefes cada 10, la misma curva de HP de base
// (baseHpForStage) y los mismos récords. Nada se hardcodea.
//
// Este módulo es la ÚNICA fuente de las reglas de profundidad y del
// desafío diario: main.js/hud.js/meta.js NO las reimplementan.
//
// Reglas de la casa:
//  - sin DOM, sin localStorage, sin Math.random: todo puro y testeable
//    desde Node (el proyecto corriendo los tests sin canvas);
//  - "campaña completa" = hay RÉCORD del S50, no `unlocked >= 50`
//    (unlocked llega a 50 al limpiar el 49: no distingue desbloqueado
//    de limpiado);
//  - la profundidad NO castiga: perder deja el récord donde estaba.
// ============================================================

import { STAGES, baseHpForStage, isBossStage } from './stages.js';

/** Primera etapa del infinito (la 51: justo después de la campaña). */
export const ENDLESS_START = STAGES.length + 1;

/** Cada cuántas etapas hay un HITO (banner + recompensa ×1,5). */
export const MILESTONE_EVERY = 5;

/** Etapas que puede tocar el desafío diario (51..60: la pared temprana). */
export const DAILY_STAGES = 10;

/** ¿Es una etapa del infinito? (entero >= 51). */
export function isEndless(id) {
  const n = Number(id);
  return Number.isInteger(n) && n >= ENDLESS_START;
}

/**
 * Definición de una etapa CUALQUIERA (1..∞).
 *
 * 1..50 devuelve la entrada del array de campaña, tal cual (la campaña
 * no cambia). 51+ se GENERA: nombre `∞ Stage N`, tema en ciclo sobre los
 * 50 de la campaña, HP de base de la MISMA curva (`baseHpForStage`) y
 * jefe cada 10.
 *
 * OJO: el HP de base NO puede salir de `BASE_HP_BY_STAGE[id] ?? 3000`
 * (el fallback del S2, 3000): una etapa 51 con 3000 HP de base sería
 * MÁS FÁCIL que la 50 (25 500). Por eso la definición lo trae calculado.
 *
 * @param {number} id
 * @returns {{id:number,name:string,theme:string,baseHp:number,boss:boolean,endless?:boolean}|null}
 */
export function stageDef(id) {
  const n = Math.trunc(Number(id));
  if (!Number.isFinite(n) || n < 1) return null;
  if (n < ENDLESS_START) return STAGES[n - 1] ?? null;
  const theme = STAGES[(n - ENDLESS_START) % STAGES.length].theme;
  return {
    id: n,
    name: `∞ Stage ${n}`,
    theme,
    baseHp: baseHpForStage(n),
    boss: isBossStage(n),     // cada múltiplo de 10
    endless: true,
  };
}

/**
 * ¿Está abierto el modo infinito? Sólo con la campaña COMPLETA: el
 * récord del S50 existe únicamente si se limpió esa etapa.
 */
export function endlessOpen(progress) {
  const best = progress && typeof progress === 'object' ? progress.bestScore : null;
  return !!best && typeof best === 'object' && best[STAGES.length] != null;
}

/**
 * Etapa más profunda LIMPIADA (0 si el modo todavía no se abrió).
 * El gate por `endlessOpen` evita que un `gdf_progress` corrupto con
 * `endless.best = 70` pero sin S50 limpiado abra el modo.
 */
export function bestDepth(progress) {
  if (!endlessOpen(progress)) return 0;
  const raw = Number(progress?.endless?.best);
  return Number.isFinite(raw) && raw >= ENDLESS_START ? Math.trunc(raw) : 0;
}

/** Etapa a la que se CONTINÚA: mejor limpiada + 1 (mínimo 51). */
export function nextEndlessStage(progress) {
  return Math.max(ENDLESS_START, bestDepth(progress) + 1);
}

/** ¿Es una etapa de HITO? (∞ y múltiplo de 5). */
export function isMilestone(id) {
  return isEndless(id) && id % MILESTONE_EVERY === 0;
}

/**
 * Multiplicador de RECOMPENSA por profundidad.
 *
 * Campaña: 1 (nada cambia). Infinito: sube un escalón cada 10 etapas
 * (51-60 ×1, 61-70 ×2, …) y los hitos pagan además ×1,5. Es lo que hace
 * que cada run del endgame avance el meta (100 niveles) sin inventar una
 * moneda nueva.
 *
 * @param {number} id
 * @returns {number}
 */
export function endlessRewardMul(id) {
  if (!isEndless(id)) return 1;
  const n = Math.trunc(Number(id));
  const steps = 1 + Math.floor((n - ENDLESS_START) / 10);
  return steps * (isMilestone(n) ? 1.5 : 1);
}

// ------------------------------------------------------------
// DESAFÍO DIARIO (sin servidor)
//
// La etapa y la semilla de olas salen de la FECHA LOCAL del jugador:
// dos personas el mismo día juegan la misma etapa con las mismas olas.
// La fecha va en local (no UTC) porque el "día" que vive el jugador es
// el suyo: a las 23:00 de un GMT-3 el día UTC ya cambió.
// ------------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Fecha LOCAL `YYYY-MM-DD` de un Date (por defecto, hoy). */
export function dailyKey(date = new Date()) {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Semilla uint32 estable a partir de la fecha (FNV-1a de 32 bits).
 * Es la MISMA para todos los jugadores: la composición del día no
 * depende del azar local.
 */
export function dailySeed(key) {
  const s = typeof key === 'string' ? key : '';
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Etapa del desafío diario: 51..60, elegida por la fecha. */
export function dailyStage(key) {
  return ENDLESS_START + (dailySeed(key) % DAILY_STAGES);
}

/**
 * Todo lo que necesita una run diaria, en un solo objeto.
 * Acepta una fecha `YYYY-MM-DD` o un Date (default: hoy).
 *
 * @param {string|Date} [when]
 * @returns {{date:string, stage:number, seed:number}}
 */
export function dailyRun(when = new Date()) {
  const date = typeof when === 'string' && DATE_RE.test(when) ? when : dailyKey(when);
  const seed = dailySeed(date);
  return { date, stage: ENDLESS_START + (seed % DAILY_STAGES), seed };
}
