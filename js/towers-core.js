// =============================================================================
// towers-core.js — helpers de combate compartidos por Tower/Drone/FX
// =============================================================================

import { dist } from './engine.js';
import { perkMods, mergeMods } from './meta.js';
import { applyPerkDamage } from './perks.js';
import { applySlow } from './enemies.js';

/**
 * dev-7 fase 51 — MODS EFECTIVOS de una unidad: la FUSIÓN de los perks
 * de meta (`perkMods(type)`) y los mods que la unidad haya ganado por
 * CARTAS (`unit.cardMods`, el canal de js/perks.js).
 *
 * POR QUÉ vive acá y no en perks.js: la composición usa `mergeMods` de
 * meta.js (la MISMA política por clave que usan los perks entre sí:
 * producto para multiplicadores, "se queda con el mejor" para umbrales,
 * suma con tope para probabilidades) y perks.js NO puede importar
 * meta.js (regla de dependencias de su cabecera).
 *
 * ANTES: las torres leían `perkMods('x')` en ~24 sitios, o sea que el
 * vocabulario de mecánicas venía SIEMPRE del meta-juego y una carta
 * no podía dar MECÁNICAS. Ahora toda esa lectura pasa por aquí: una
 * carta de técnica (rebote, perforación, explosión al morir,
 * ralentizar, crítico, robo de vida, aturdir, remate) se comporta
 * EXACTAMENTE como el perk equivalente — es el mismo código, no una
 * copia.
 *
 * @param {object} unit torre o dron (duck-typed)
 * @returns {object} mods fusionados (nunca null)
 */
export function unitMods(unit) {
  if (!unit) return {};
  const pm = unit.type ? perkMods(unit.type) : {};
  const cm = unit.cardMods;
  if (!cm || typeof cm !== 'object' || Object.keys(cm).length === 0) return pm;
  return mergeMods([{ mods: pm }, { mods: cm }]);
}

/** Daño a un blanco duck-typed (tolera dummies de test sin takeDamage). */
function hurt(enemy, n, kind) {
  if (enemy && !enemy.dead && typeof enemy.takeDamage === 'function') {
    return enemy.takeDamage(n, kind);
  }
  return false;
}

/**
 * dev-7 fase 23: aplicador de las mecánicas de perks para las torres y
 * drones (beam, tesla, cadena, láser, espinas, picaduras). La
 * implementación real vive en perks.js — acá solo se le pasa el contexto
 * de juego para que pueda curar al escudo y emitir las señales.
 */
function hurtP(enemy, n, kind, mods, game, enemies) {
  return applyPerkDamage(enemy, n, kind, mods, game, enemies);
}

/** fase 74.2 — Onda Glacial: las explosiones dejan slow en el área. */
function applyExplosionCombo(game, x, y, R) {
  const cm = game?.fortress?.comboMods;
  if (!(cm?.explosionSlowFrac > 0)) return;
  const list = game?.fortress?.enemies;
  if (!Array.isArray(list)) return;
  for (const e of list) {
    if (!e || e.dead) continue;
    if (dist(e.x, e.y, x, y) <= R + (e.r ?? 10)) {
      applySlow(e, cm.explosionSlowFrac, cm.explosionSlowTime ?? 2, 'explosion');
    }
  }
}


export { hurt, hurtP, applyExplosionCombo };
