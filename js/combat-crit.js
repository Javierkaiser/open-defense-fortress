// =============================================================================
// combat-crit.js — crítico, stun y congelación compartidos
// -----------------------------------------------------------------------------
// El crítico de proyectil (enemies.js) y el del haz (towers.js) repetían la
// misma secuencia: clamp de probabilidad, tirada, multiplicador y `_lastCrit`.
// La congelación por crítico también estaba copiada. Este módulo concentra
// esas reglas para que un cambio de balance no quede en una sola ruta.
// =============================================================================

/**
 * Tira un crítico.
 * @param {number} chance 0..1
 * @param {number} [mul=2] multiplicador de daño
 * @param {() => number} [rng=Math.random]
 * @returns {{crit:boolean, mul:number}}
 */
export function rollCrit(chance, mul = 2, rng = Math.random) {
  const c = Math.max(0, Math.min(1, Number(chance) || 0));
  const crit = c > 0 && rng() < c;
  return { crit, mul: crit ? mul : 1 };
}

/** Aplica/renueva un stun sin bajar el que ya estaba. */
export function applyStun(enemy, seconds) {
  if (!enemy || enemy.dead || !(seconds > 0) || typeof enemy.stun !== 'number') {
    return false;
  }
  enemy.stun = Math.max(enemy.stun ?? 0, seconds);
  return true;
}

/** Congela (stun corto) con probabilidad; no pisa un stun mayor. */
export function tryFreeze(enemy, chance, seconds = 0.5, rng = Math.random) {
  const c = Math.max(0, Math.min(1, Number(chance) || 0));
  if (c <= 0 || !(rng() < c)) return false;
  return applyStun(enemy, seconds);
}
