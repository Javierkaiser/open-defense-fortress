// =============================================================================
// enemies-bestiary.js — icono real del enemigo para el bestiario
// =============================================================================

import { ENEMY_TYPES } from './enemies-data.js';
import { Enemy, ENEMY_ICON_SIZE } from './enemies.js';

// ------------------------------------------------------------
// BESTIARIO (dev-7 fase 40) — el icono de un enemigo en un canvas
// chico. Igual que `renderTowerIcon` de js/meta.js para las torres:
// el ícono REUSA el draw real del juego, así que no puede quedar
// desincronizado del enemigo que se ve caer en pantalla.
// ------------------------------------------------------------

/**
 * Caja que ocupa el DRAW de un enemigo, en unidades de mundo, para
 * poder ENCUADRARLO en el canvas del icono.
 *
 * No alcanza con el radio `r`: al enemigo le cuelgan cosas que no son
 * su cuerpo —
 *   · la estela de fuego (teardrop) sube ~1,8 radios por encima;
 *   · los enemigos grandes (r >= 20) dibujan barra de HP encima;
 *   · el polígono irregular (makePoly) llega a 1,14 radios.
 *   · el rasgo de una VARIANTE (aro del escudo, aura del regenerador)
 *     llega a ~1,5 radios: sin ensanchar la caja, el icono lo recortaría.
 * Con sólo `r` el jefe se salía del canvas y la esporita ocupaba un
 * píxel: por eso la caja se calcula por tipo.
 *
 * @param {object} data entrada de ENEMY_TYPES
 * @param {string} [variant] id de ENEMY_VARIANTS (icono de una élite)
 * @returns {{w:number, h:number, cx:number, cy:number}} caja en mundo
 */
function enemyIconBox(data, variant = null) {
  const r = Math.max(1, data.r ?? 8);
  const hasTrail = !!data.trail1 && data.drawTrail !== false;
  // Los enjambres dibujan cuerpos alrededor del centro y la geoda placas
  // orbitantes: la caja del icono tiene que incluir ese arte, no sólo `r`.
  const artPad = data.plates ? 1.65 : data.swarmArt ? 1.65 : 1.2;
  const aura = r * Math.max(variant ? 1.6 : 1.2, artPad); // holgura lateral y de abajo
  const halfW = aura;                          // polígono + tentáculos + aro
  const bottom = aura;
  // Arriba manda la estela de fuego, salvo que el rasgo de la variante
  // suba más (esporas/blobs sin estela).
  let top = -(r * Math.max(hasTrail ? 1.85 : 1.25, variant ? 1.6 : 0));
  if (r >= 20) top = Math.min(top, -(r + 13)); // barra de HP (4 px de alto)
  return { w: halfW * 2, h: bottom - top, cx: 0, cy: (top + bottom) / 2 };
}

/**
 * Dibuja el ENEMIGO DE VERDAD (su `draw` real) dentro de un canvas
 * cuadrado y chico: el ícono del bestiario es el mismo sprite que se
 * ve caer, no un dibujo aparte que puede desincronizarse.
 *
 * Igual que `renderTowerIcon` (js/meta.js): se instancia la entidad con
 * un `game` de mentira (el draw del enemigo no lo necesita, pero así es
 * un Enemy de verdad) y se ajusta translate/scale para que la silueta
 * quede centrada y encuadrada.
 *
 * TOLERANTE: si el tipo no existe, si el canvas no es un canvas o si el
 * draw revienta (contexto raro, navegador sin 2d), devuelve false sin
 * romper nada — el bestiario es informativo, no gameplay.
 *
 * @param {HTMLCanvasElement} canvas canvas destino (se reescanea a 64×64)
 * @param {string} type clave de ENEMY_TYPES
 * @param {string} [variant] id de ENEMY_VARIANTS: el icono muestra el RASGO
 *   de la variante (escudo/estela/aura), que es como se ve en el juego
 * @returns {boolean} true si se dibujó
 */
export function renderEnemyIcon(canvas, type, variant = null) {
  if (!canvas || canvas.tagName !== 'CANVAS') return false;
  const data = ENEMY_TYPES[type];
  if (!data) return false;
  let ctx;
  try { ctx = canvas.getContext('2d'); } catch (_e) { return false; }
  if (!ctx) return false;
  try {
    canvas.width = ENEMY_ICON_SIZE;
    canvas.height = ENEMY_ICON_SIZE;
    ctx.clearRect(0, 0, ENEMY_ICON_SIZE, ENEMY_ICON_SIZE);
    const e = new Enemy(type, 0, { game: { engine: { _t: 0 } }, y: 0, variant, icon: true });
    const box = enemyIconBox(data, variant);
    const pad = 3;
    const avail = ENEMY_ICON_SIZE - pad * 2;
    const s = Math.min(avail / box.w, avail / box.h);
    ctx.save();
    // El centro de la CAJA (no el del enemigo) al centro del canvas: así
    // la estela y la barra de HP también quedan dentro.
    ctx.translate(ENEMY_ICON_SIZE / 2 - box.cx * s, ENEMY_ICON_SIZE / 2 - box.cy * s);
    ctx.scale(s, s);
    e.draw(ctx);
    ctx.restore();
    return true;
  } catch (_err) {
    return false;
  }
}

