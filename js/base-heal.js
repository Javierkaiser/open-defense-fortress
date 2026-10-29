// =============================================================================
// base-heal.js — curación del escudo de la base
// -----------------------------------------------------------------------------
// Único punto de curación de la Fortress. Antes cada mecánica (lifesteal,
// regeneración del Campo de Fuerza, drenaje del Black Hole y Transfusión)
// escribía `fort.hp` a mano; dos de ellas podían revivir una base en 0 y solo
// una emitía `base:healed`. Este helper centraliza las guardas y el feedback.
//
// Reglas:
//   · No cura si la base ya está destruida (`hp <= 0`): una run terminada no
//     se resucita por un tick de sustain.
//   · Ignora cantidades no finitas o no positivas.
//   · Nunca supera `maxHp`.
//   · Emite `base:healed` una sola vez por cura efectiva (main.js lo usa para
//     el float verde y el feedback).
// =============================================================================

/**
 * @param {object} game
 * @param {number} amount cantidad de HP a curar (ya multiplicada por dt)
 * @param {{emit?: boolean}} [opts]
 * @returns {number} HP curado realmente (0 si no hubo cura)
 */
export function healBase(game, amount, opts = {}) {
  const fort = game?.fortress;
  if (!fort || !Number.isFinite(fort.hp) || fort.hp <= 0) return 0;
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const maxHp = Number.isFinite(fort.maxHp) ? fort.maxHp : fort.hp;
  const heal = Math.min(amount, Math.max(0, maxHp - fort.hp));
  if (!(heal > 0)) return 0;
  fort.hp = Math.min(maxHp, fort.hp + heal);
  if (opts.emit !== false) {
    game?.engine?.emit?.('base:healed', {
      amount: heal,
      hp: fort.hp,
      maxHp,
    });
  }
  return heal;
}
