// =============================================================================
// enemies-status.js — veneno, slow y marcas (estado puro del enemigo)
// =============================================================================

/**
 * @param {object} enemy
 * @param {number} dps daño por segundo
 * @param {number} seconds duración
 * @param {'poison'|'burn'} [kind] fuente del DoT: el veneno de las Avispas
 *   se propaga al morir; la ignición de la Rueda de Fuego usa el mismo reloj
 *   pero otro color y no se propaga. Ausente = 'poison' (compatibilidad).
 */
export function applyPoison(enemy, dps, seconds, kind = 'poison') {
  if (!enemy || enemy.dead) return false;
  if (!Number.isFinite(dps) || dps <= 0) return false;
  if (!Number.isFinite(seconds) || seconds <= 0) return false;
  // fase 75: si el veneno anterior ya expiró, su DPS no puede contaminar
  // al nuevo. Antes `poisonDps` quedaba pegado y un veneno débil heredaba
  // el DPS fuerte de una aplicación corta anterior.
  if (!((enemy.poisonT ?? 0) > 0)) enemy.poisonDps = 0;
  const gana = dps >= (enemy.poisonDps ?? 0) || !((enemy.poisonT ?? 0) > 0);
  enemy.poisonT = Math.max(enemy.poisonT ?? 0, seconds);
  enemy.poisonDps = Math.max(enemy.poisonDps ?? 0, dps);
  // El color/identidad lo decide la fuente MÁS FUERTE, no la última en
  // aplicarse: un veneno débil de Avispas no debe pintar de verde una
  // quemadura de la Rueda (ni al revés).
  if (gana) enemy.poisonKind = kind;
  return true;
}

/** Recalcula el slow efectivo a partir de sus fuentes activas. */
function recomputeSlow(enemy) {
  let timer = 0;
  let frac = 1;
  const sources = enemy.slowSources;
  if (sources) {
    for (const key of Object.keys(sources)) {
      const s = sources[key];
      if (!s || !(s.remaining > 0)) { delete sources[key]; continue; }
      timer = Math.max(timer, s.remaining);
      frac = Math.min(frac, s.factor);
    }
  }
  enemy.slowTimer = timer;
  enemy.slowFrac = frac;
  enemy.slowFactor = enemy._slowImmune ? undefined : frac;
}

/** Avanza los timers de slow y recalcula la fracción vigente. */
export function tickSlow(enemy, dt) {
  const sources = enemy.slowSources;
  if (sources) {
    for (const key of Object.keys(sources)) {
      const s = sources[key];
      if (!s) { delete sources[key]; continue; }
      s.remaining -= dt;
      if (s.remaining <= 0) delete sources[key];
    }
  }
  recomputeSlow(enemy);
}

/**
 * fase 74.2 — SLOW con DURACIÓN. Antes el slow era de un solo frame y el
 * guard de los proyectiles fallaba (Enemy.update limpia `slowFactor`):
 * Balas Gélidas no hacía nada. `applySlow` fija `slowTimer` + `slowFrac`
 * y mantiene `slowFactor` por compatibilidad con el lead/render.
 *
 * fase 75 — FUENTES: un slow fuerte y corto (p. ej. 75 % durante 0,01 s)
 * no debe extender su fracción con el timer de un slow débil y largo. El
 * slow efectivo es el mínimo de las fuentes activas; `source` agrupa los
 * refrescos de una misma mecánica (forcefield, projectile, beam…).
 * @param {object} enemy
 * @param {number} frac 0.20 = 20% slower
 * @param {number} seconds duración
 * @param {string} [source] identificador de la fuente
 * @returns {boolean}
 */
export function applySlow(enemy, frac, seconds = 1.5, source = 'default') {
  if (!enemy || enemy.dead || enemy._slowImmune) return false;
  if (!Number.isFinite(frac) || frac <= 0) return false;
  if (!Number.isFinite(seconds) || seconds <= 0) return false;
  const f = Math.min(0.9, frac);
  enemy.slowSources ??= {};
  enemy.slowSources[source] = { factor: 1 - f, remaining: seconds };
  recomputeSlow(enemy);
  return true;
}

/**
 * fase 74.2 — MARCA temporal de un enemigo (Marca de Riel / Enlace de
 * Enjambre). `key` es 'rail' o 'swarm'; el timer se descuenta en update().
 */
export function applyMark(enemy, key, seconds = 2) {
  if (!enemy || enemy.dead || !key) return false;
  if (!Number.isFinite(seconds) || seconds <= 0) return false;
  enemy.marks ??= {};
  enemy.marks[key] = Math.max(enemy.marks[key] ?? 0, seconds);
  return true;
}

/** ¿El enemigo tiene la marca `key` activa? */
export function hasMark(enemy, key) {
  return (enemy?.marks?.[key] ?? 0) > 0;
}


