// ============================================================
// progress.js — persistencia de progreso (dev-5, §2.9/§5 dev-5; v6 JK
// 28-08: campaña de 50 stages — los clamps 5 → 50; fase 67: modo ∞;
// fase 69: Protocolo/Heat)
// localStorage['gdf_progress'] = {unlocked: N, bestScore: {1: s, ...},
//                                endless: {best: N, daily: {date, bestScore}},
//                                heat: {best, byStage, endless, claimed, last}}
// Desbloqueo progresivo: completar Stage N desbloquea N+1.
// A partir del Stage 51 (`ENDLESS_START`) no se "desbloquea" nada: se
// juega hasta la mejor profundidad limpiada + 1 (reglas en endless.js).
// Funciones PURAS testeables desde Node (storage inyectable).
// ============================================================

import { ENDLESS_START, endlessOpen, isEndless, nextEndlessStage } from './endless.js';
import { HEAT_MILESTONES, HEAT_MAX_TOTAL, normalizeHeatMods } from './heat.js';
import { safeLocalStorage } from './storage.js';

const KEY = 'gdf_progress';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Estado por defecto: solo Stage 1 desbloqueado, sin récords, endgame, heat ni supervivencia. */
export function defaultProgress() {
  return {
    unlocked: 1,
    bestScore: {},
    endless: { best: 0, daily: { date: '', bestScore: 0, heat: 0 } },
    heat: { best: 0, byStage: {}, endless: {}, claimed: [], last: {} },
    survival: { bestWave: 0, bestScore: 0, runs: 0, byHeat: {} },
  };
}

/** Normaliza un objeto de progreso arbitrario (tolera datos viejos). */
export function normalizeProgress(raw) {
  const p = raw && typeof raw === 'object' ? raw : {};
  // v6: campaña de 50 stages (antes tope 5)
  const unlocked = Math.max(1, Math.min(50, Number(p.unlocked) || 1));
  const bestScore = {};
  if (p.bestScore && typeof p.bestScore === 'object') {
    for (const [k, v] of Object.entries(p.bestScore)) {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0) bestScore[k] = Math.floor(n);
    }
  }
  return {
    unlocked,
    bestScore,
    endless: normalizeEndless(p.endless),
    heat: normalizeHeatState(p.heat),
    survival: normalizeSurvival(p.survival),
  };
}

/**
 * El estado del modo infinito. Tolerante a propósito (patrón §2.9): un
 * `gdf_progress` guardado antes de la fase 67 no tiene el campo, y uno
 * corrupto puede traer cualquier cosa. Nunca lanza: los valores que no
 * pasan el filtro vuelven a 0/''.
 */
function normalizeEndless(raw) {
  const e = raw && typeof raw === 'object' ? raw : {};
  const bestRaw = Number(e.best);
  // `best` es una ETAPA limpiada: 0 = el modo todavía no se abrió.
  const best = Number.isFinite(bestRaw) && bestRaw >= ENDLESS_START
    ? Math.trunc(bestRaw) : 0;
  const d = e.daily && typeof e.daily === 'object' ? e.daily : {};
  const date = typeof d.date === 'string' && DATE_RE.test(d.date) ? d.date : '';
  const scoreRaw = Number(d.bestScore);
  const bestScore = Number.isFinite(scoreRaw) && scoreRaw > 0 ? Math.trunc(scoreRaw) : 0;
  // v1.7.2: el récord diario guarda el Heat con el que se logró. Saves
  // viejos sin el campo migran a heat 0 (récord "sin Protocolo").
  const heatRaw = Number(d.heat);
  const heat = Number.isFinite(heatRaw)
    ? Math.max(0, Math.min(HEAT_MAX_TOTAL, Math.trunc(heatRaw))) : 0;
  return { best, daily: { date, bestScore, heat } };
}

/**
 * El estado del PROTOCOLO (fase 69). Mismo patrón tolerante: un progreso
 * viejo no tiene `heat`, y uno corrupto puede traer claves basura. Los
 * récords fuera de rango o de tipo inválido se descartan; `last` se
 * normaliza con la tabla de `heat.js` (rangos 0..max).
 */
function normalizeHeatState(raw) {
  const h = raw && typeof raw === 'object' ? raw : {};
  const bestRaw = Number(h.best);
  const best = Number.isFinite(bestRaw) ? Math.max(0, Math.min(HEAT_MAX_TOTAL, Math.trunc(bestRaw))) : 0;

  const byStage = {};
  if (h.byStage && typeof h.byStage === 'object') {
    for (const [k, v] of Object.entries(h.byStage)) {
      const id = Number(k);
      const n = Number(v);
      if (!Number.isInteger(id) || id < 1 || id > 200) continue;
      if (!Number.isFinite(n) || n <= 0) continue;
      byStage[id] = Math.min(HEAT_MAX_TOTAL, Math.trunc(n));
    }
  }

  // Mejor profundidad POR nivel de heat: { 10: 58, 5: 61 }.
  const endless = {};
  if (h.endless && typeof h.endless === 'object') {
    for (const [k, v] of Object.entries(h.endless)) {
      const heat = Number(k);
      const depth = Number(v);
      if (!Number.isInteger(heat) || heat < 0 || heat > HEAT_MAX_TOTAL) continue;
      if (!Number.isFinite(depth) || depth < 1) continue;
      endless[heat] = Math.min(9999, Math.trunc(depth));
    }
  }

  // Hitos cobrados: sólo los declarados, únicos y ordenados.
  const claimed = [...new Set((Array.isArray(h.claimed) ? h.claimed : [])
    .map(Number)
    .filter((n) => HEAT_MILESTONES.includes(n)))]
    .sort((a, b) => a - b);

  return { best, byStage, endless, claimed, last: normalizeHeatMods(h.last) };
}

/**
 * El estado de SUPERVIVENCIA (fase 70): mejor oleada/score, cantidad de
 * runs y mejor oleada por nivel de heat. Tolerante como el resto.
 */
function normalizeSurvival(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const positive = (v, max) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.min(max, Math.trunc(n)) : 0;
  };
  const byHeat = {};
  if (s.byHeat && typeof s.byHeat === 'object') {
    for (const [k, v] of Object.entries(s.byHeat)) {
      const heat = Number(k);
      const wave = Number(v);
      if (!Number.isInteger(heat) || heat < 0 || heat > HEAT_MAX_TOTAL) continue;
      if (!Number.isFinite(wave) || wave < 0) continue;
      byHeat[heat] = Math.min(9999, Math.trunc(wave));
    }
  }
  return {
    bestWave: positive(s.bestWave, 9999),
    bestScore: positive(s.bestScore, 9999999),
    runs: positive(s.runs, 999999),
    byHeat,
  };
}

/**
 * Registra un CLEAR con Protocolo (fase 69). Con heat 0 no toca nada.
 *
 * - `best`: mayor heat limpiado en cualquier modo.
 * - `byStage`: heat máximo limpiado por etapa de CAMPAÑA (1..50).
 * - `endless`: mejor profundidad alcanzada POR nivel de heat.
 *
 * @param {object} progress
 * @param {{heat?:number, stageId?:number|null, endlessDepth?:number|null}} run
 * @returns {object} progreso normalizado
 */
export function recordHeatRun(progress, { heat = 0, stageId = null, endlessDepth = null } = {}) {
  const p = normalizeProgress(progress);
  const h = Math.max(0, Math.min(HEAT_MAX_TOTAL, Math.trunc(Number(heat) || 0)));
  if (h <= 0) return p;
  p.heat.best = Math.max(p.heat.best, h);
  const sid = Number(stageId);
  if (Number.isInteger(sid) && sid >= 1 && sid <= 200) {
    p.heat.byStage[sid] = Math.max(p.heat.byStage[sid] ?? 0, h);
  }
  const depth = Number(endlessDepth);
  if (Number.isFinite(depth) && depth >= 1) {
    p.heat.endless[h] = Math.max(p.heat.endless[h] ?? 0, Math.trunc(depth));
  }
  return p;
}

/**
 * Registra el final de una run de SUPERVIVENCIA (fase 70): mejor oleada,
 * mejor score, cantidad de runs y mejor oleada por nivel de heat.
 *
 * @param {object} progress
 * @param {{wave?:number, score?:number, heat?:number}} run
 * @returns {object} progreso normalizado
 */
export function recordSurvival(progress, { wave = 0, score = 0, heat = 0 } = {}) {
  const p = normalizeProgress(progress);
  const w = Math.max(0, Math.trunc(Number(wave) || 0));
  const s = Math.max(0, Math.trunc(Number(score) || 0));
  const h = Math.max(0, Math.min(HEAT_MAX_TOTAL, Math.trunc(Number(heat) || 0)));
  p.survival.bestWave = Math.max(p.survival.bestWave, w);
  p.survival.bestScore = Math.max(p.survival.bestScore, s);
  p.survival.runs += 1;
  p.survival.byHeat[h] = Math.max(p.survival.byHeat[h] ?? 0, w);
  return p;
}

/**
 * Cobra un HITO de heat (5/10/20/35) UNA sola vez. Devuelve el progreso y
 * si el hito se cobró en esta llamada (el llamador paga el bonus).
 *
 * @param {object} progress
 * @param {number} threshold
 * @returns {{progress:object, claimed:boolean}}
 */
export function claimHeatMilestone(progress, threshold) {
  const p = normalizeProgress(progress);
  const t = Number(threshold);
  if (!HEAT_MILESTONES.includes(t) || p.heat.claimed.includes(t)) {
    return { progress: p, claimed: false };
  }
  p.heat.claimed.push(t);
  p.heat.claimed.sort((a, b) => a - b);
  return { progress: p, claimed: true };
}

/** Lee el progreso del storage (o default si no hay/nada válido). */
export function loadProgress(storage = safeLocalStorage()) {
  try {
    return normalizeProgress(JSON.parse(storage.getItem(KEY)));
  } catch (_err) {
    return defaultProgress();
  }
}

/** Guarda el progreso normalizado; devuelve lo guardado. */
export function saveProgress(progress, storage = safeLocalStorage()) {
  const p = normalizeProgress(progress);
  try {
    storage.setItem(KEY, JSON.stringify(p));
  } catch (_err) { /* storage lleno/bloqueado: la partida sigue igual */ }
  return p;
}

/** Borra el progreso (stages desbloqueados + mejores scores + ∞) — vuelve
 *  al default (solo Stage 1 desbloqueado). Usado por el botón "Borrar
 *  progreso" del menú (dev-7 fase 14). No toca el meta-juego ni el tema
 *  — eso son funciones separadas (ver meta.js/theme.js). */
export function resetProgress(storage = safeLocalStorage()) {
  return saveProgress(defaultProgress(), storage);
}

/**
 * ¿Está desbloqueado el stage `id` con este progreso?
 *
 * Campaña: `id <= unlocked` (como siempre). Infinito: hasta la mejor
 * profundidad limpiada + 1, y sólo si el modo está abierto (S50
 * limpiado). Sin esta rama, `startStage(51)` salía por el candado antes
 * de llegar a la generación de la etapa.
 */
export function isUnlocked(progress, id) {
  const p = normalizeProgress(progress);
  const n = Number(id);
  if (!Number.isInteger(n) || n < 1) return false;
  if (n < ENDLESS_START) return n <= (p.unlocked ?? 1);
  return endlessOpen(p) && n <= nextEndlessStage(p);
}

/**
 * Registra una victoria. Completa Stage N → desbloquea N+1 (hasta el 50)
 * y guarda el mejor score del stage jugado.
 *
 * Fase 67: en el infinito NO se desbloquea nada — se sube el récord de
 * PROFUNDIDAD (`endless.best`), que es lo que habilita la etapa
 * siguiente. Perder no lo toca (ver main.js).
 */
export function recordVictory(progress, stageId, score) {
  const p = normalizeProgress(progress);
  const n = Math.trunc(Number(stageId));
  if (!Number.isFinite(n) || n < 1) return p;
  if (isEndless(n)) {
    p.endless.best = Math.max(p.endless.best, n);
  } else {
    // v6: completar el Stage N abre el N+1 hasta el 50 (antes tope 5)
    p.unlocked = Math.min(ENDLESS_START - 1, Math.max(p.unlocked, n + 1));
  }
  const prev = p.bestScore[n] ?? 0;
  p.bestScore[n] = Math.max(prev, Math.max(0, Math.floor(score || 0)));
  return p;
}

/**
 * Registra el SCORE de una run del desafío diario.
 *
 * Se llama gane o pierda: el diario es una caza de score, y una derrota
 * igual deja un número que vale para el récord del día. Al cambiar la
 * fecha el récord anterior se descarta solo.
 *
 * @param {object} progress
 * @param {string} dateKey 'YYYY-MM-DD'
 * @param {number} score
 * @param {number} [heat=0] Heat con el que se jugó la run
 */
export function recordDaily(progress, dateKey, score, heat = 0) {
  const p = normalizeProgress(progress);
  const key = typeof dateKey === 'string' && DATE_RE.test(dateKey) ? dateKey : '';
  if (!key) return p;
  if (p.endless.daily.date !== key) {
    p.endless.daily = { date: key, bestScore: 0, heat: 0 };
  }
  const val = Math.max(0, Math.floor(Number(score) || 0));
  // Récord GLOBAL por fecha: sólo un score ESTRICTAMENTE mejor actualiza
  // también el Heat registrado. Un empate conserva el Heat original.
  if (val > p.endless.daily.bestScore) {
    const h = Math.max(0, Math.min(HEAT_MAX_TOTAL, Math.trunc(Number(heat) || 0)));
    p.endless.daily.bestScore = val;
    p.endless.daily.heat = h;
  }
  return p;
}


