// =============================================================================
// economy.js — LA ECONOMÍA DE UNA BAJA (una sola implementación)
// -----------------------------------------------------------------------------
// Game._onKill y los scripts de medición (scripts/balance-sim.mjs,
// scripts/probe-s6.mjs) tenían cada uno su copia de esta cuenta y las copias
// divergieron: los scripts no llevaban el carry de las crías (`fromSpawn`) y
// pagaban score mínimo 1 a TODAS las bajas, así que medían un juego con score
// de más. Las fórmulas siguen en score.js; acá sólo se combinan.
// =============================================================================

import { baseScoreForEnemy, speedMult, scoreWithCarry, xpForKill } from './score.js';

/**
 * Score de una baja: base × racha × velocidad × Prima de Combate.
 *
 * Las crías de mecánicas (`fromSpawn`) pagan una fracción con carry, para que
 * el score siga siendo entero sin regalar puntos; el resto paga al menos 1.
 *
 * @param {object} enemy Enemy que murió (`scoreReward`; `fromSpawn` si es cría)
 * @param {object} [opts]
 * @param {number} [opts.mult] multiplicador de racha
 * @param {number} [opts.timeScale] velocidad de juego (x1/x1.5/x2)
 * @param {number} [opts.scoreMul] Prima de Combate de las cartas
 * @param {number} [opts.carry] fracción acumulada de crías anteriores
 * @returns {{gained:number, carry:number, base:number, raw:number}}
 */
export function resolveKillScore(enemy, {
  mult = 1, timeScale = 1, scoreMul = 1, carry = 0,
} = {}) {
  const base = baseScoreForEnemy(enemy);
  const raw = base * mult * speedMult(timeScale) * scoreMul;
  if (enemy?.fromSpawn) {
    // Las crías pagan 10 %: con 0,5 de score, el carry paga 0 en la primera
    // y 1 en la segunda (score entero, 10 % en agregado).
    const r = scoreWithCarry(raw, carry);
    return { gained: r.gained, carry: r.carry, base, raw };
  }
  return { gained: Math.max(1, Math.round(raw)), carry, base, raw };
}

/**
 * Energía (XP) de una baja: `xpForKill` (escala con la etapa, el jefe no),
 * más el bonus del cristal (D12) y el Acelerador de Energía.
 *
 * @param {object} enemy Enemy que murió
 * @param {object} [opts]
 * @param {number} [opts.stage] etapa que paga la energía (1 = sin escala)
 * @param {number} [opts.bonusFrac] bonus de energía del tipo (D12)
 * @param {number} [opts.xpMul] multiplicador de energía de las cartas
 * @returns {number} XP de la baja
 */
export function resolveKillXp(enemy, { stage = 1, bonusFrac = 0, xpMul = 1 } = {}) {
  return xpForKill(enemy, stage) * (1 + bonusFrac) * xpMul;
}
