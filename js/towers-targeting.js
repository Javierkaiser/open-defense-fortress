// =============================================================================
// towers-targeting.js — targeting, aim y geometría de haz
// =============================================================================

import { CONFIG, LAYOUT, clamp, dist, fallYAfter } from './engine.js';
import { withAlpha } from './geometry.js';

/** fase 66: px que la Tesla sube por encima del borde de `bandY`. */
const TESLA_ABOVE_BAND = 70;

/**
 * dev-7 fase 33 — POLÍTICA DE TARGETING por unidad.
 *
 * `nearest`  = el más avanzado a la torre (mayor Y: el que está a punto
 *              de tocar la base). Es el "más cercano" de un TD vertical.
 * `farthest` = el más lejano (menor Y: el que acaba de aparecer arriba).
 * `toughest` = el de más vida (dentro de la ventana de adquisición).
 * `varying`  = los drones: re-eligen sin esperar a que el blanco muera.
 *
 * El blanco NO cambia hasta que se destruye: la torre concentra el
 * fuego en vez de repartirlo (esa es la decisión de diseño).
 */
export const TARGETING = {
  // Las 4 de la "frente": pegan en lo que viene.
  guardian: 'nearest',
  missile: 'nearest',
  tesla: 'nearest',
  laser: 'nearest',
  // Las 3 de "tiro largo": barren la pantalla de lejos.
  gauss: 'farthest',
  mortar: 'farthest',
  thunderstroke: 'farthest',
  // El haz se clava en el más duro (dentro de su ventana).
  beam: 'toughest',
  // Los drones van variando.
  firewheel: 'varying',
  wasps: 'varying',
  forcefield: 'varying',
};

/** El criterio de targeting de una unidad (por tipo de torre o dron). */
export function targetingFor(type) {
  return TARGETING[type] ?? 'nearest';
}

/**
 * dev-7 fase 33 — ¿sigue siendo válido este blanco?
 * Vive y está dentro del alcance de la torre (según su tipo).
 * @param {object} e enemigo
 * @param {object} game
 * @returns {boolean}
 */
export function targetInRange(e, game, tower) {
  if (!e || e.dead) return false;
  const d = tower?.data ?? {};
  if (d.rangeBand) {
    // fase 66 — BANDA de la Tesla: SIN tope de X (cualquier columna,
    // incluida la esquina opuesta a la torre) y con el techo vertical
    // atado al layout. `reachY` (330) es el alto nominal de la banda sobre
    // la fila y `detectMul` (Sensores Ampliados) la sube — la carta sigue
    // sirviendo, como el ancho del Beam. El techo NUNCA baja del borde del
    // "bajo fuego" (LAYOUT.bandY) más los 70 px que la Tesla se permite
    // subir, escalados por `fallScale`: en la referencia 570 − 70 = 500
    // (la banda de 330 px que declara la tabla) y en el marco alto el
    // borde se corre para que el TIEMPO bajo fuego no dependa del marco.
    const mul = game?.fortress?.detectMul ?? 1;
    const top = Math.min(
      tower.y - (d.reachY ?? 0) * mul,
      LAYOUT.bandY - TESLA_ABOVE_BAND * LAYOUT.fallScale,
    );
    if (e.y < top) return false;
  } else if (typeof d.range === 'number') {
    // Mecanismo genérico de alcance circular. Hoy NINGUNA torre lo usa:
    // el Thunderstroke pasó a alcance global (fase 73) y la Tesla usa la
    // banda de `rangeBand`. Queda disponible para futuras torres.
    const range = d.range * (game?.fortress?.detectMul ?? 1);
    if (dist(e.x, e.y, tower.x, tower.y) > range) return false;
  }
  // El ancho de detección (el MISMO que usa el disparo: incluye el
  // detectMul de la fortaleza y los sensores ampliados).
  const w = tower?.detectWidthNow?.(game);
  if (typeof w === 'number' && Number.isFinite(w)
    && Math.abs(e.x - tower.x) > w) return false;
  return true;
}

/**
 * dev-7 fase 33 — Elige un blanco NUEVO según la política de la torre.
 * @param {Array} enemies lista viva
 * @param {object} game
 * @param {object} tower la torre (para su posición y alcance)
 * @param {Array} [exclude] blancos ya tomados (multi-blanco)
 * @returns {object|null}
 */
export function pickByPolicy(enemies, game, tower, exclude = []) {
  const policy = targetingFor(tower?.type);
  const d = tower?.data ?? {};
  const taken = new Set(exclude);
  let best = null;
  for (const e of enemies || []) {
    if (!e || e.dead) continue;
    if (taken.has(e)) continue;
    if (!targetInRange(e, game, tower)) continue;
    if (!best) { best = e; continue; }
    if (policy === 'farthest') {
      // El más lejano = el de menor Y (el más arriba de la pantalla).
      if (e.y < best.y) best = e;
    } else if (policy === 'toughest') {
      // La geoda esconde el cuerpo detrás de las placas: para el targeting
      // "más vida" cuenta el HP visible (cuerpo + placas).
      if ((e.hpDisplay ?? e.hp) > (best.hpDisplay ?? best.hp)) best = e;
    } else {
      // 'nearest' = el más avanzado a la torre (mayor Y).
      if (e.y > best.y) best = e;
    }
  }
  return best;
}

/**
 * dev-7 fase 34 — ÁNGULO con el que la LENTE del haz mira a su blanco.
 * 0 = vertical (sin blanco), positivo = a la derecha. Se calcula con el
 * ángulo REAL hacia el blanco (no con la aproximación `dx/70` de antes,
 * que topaba a ±0,5 rad y dejaba a la lente "mirando a otro lado" cuando
 * el haz apuntaba en diagonal). El tope de ±1 rad es un seguro visual.
 * @param {object} tower la torre del haz
 * @param {object|null} target el blanco actual
 * @returns {number} radianes
 */
export function beamAimAngle(tower, target) {
  if (!target) return 0;
  const mx = tower?.x ?? 0;
  const my = (tower?.y ?? 0) - 40; // boca de la torre
  return clamp(Math.atan2(target.x - mx, Math.max(1, my - target.y)), -1, 1);
}

/**
 * fase 60 — Ángulo de TRAVERSE de una torre hacia su blanco: el giro qu
 * POR QUÉ NO ES EL ÁNGULO CRUDO: los enemigos caen desde arriba, así que
 * `beamAimAngle` da 0.2-0.5 rad en el caso normal y la punta del cañón se
 * mueve 7-12 px. El reporte del usuario fue literalmente "no gira, está
 * quieto". Amplificar es lo que hace legible que la torre está siguiendo
 * a un blanco; el disparo NO usa este ángulo (solo el render), así que no
 * toca el balance.
 *
 * POR QUÉ `tanh` Y NO `raw * mul`: con amplificación lineal + tope, un
 * blanco a más de ~0.3 rad satura y el cañón se queda CLAVADO en el tope
 * (medido: el mortero en el slot de la derecha pasaba el 95 % del tiempo
 * pegado a -0.6, que se ve tan muerto como no girar). `tanh` amplifica el
 * caso común (raw ≈ 0.1-0.3) y comprime el extremo sin llegar nunca a
 * saturar, así que el cañón sigue respondiendo en todo el rango.
 *
 * @param {object} tower
 * @param {object|null} target
 * @param {{limit?: number, gain?: number}} [opts] `limit` = giro máximo
 *   (rad); `gain` = cuánto se amplifica el ángulo en la zona central.
 * @returns {number} rad (0 = vertical)
 */
export function traverseAim(tower, target, opts = {}) {
  if (!target) return 0;
  const limit = opts.limit ?? 0.55;
  const gain = opts.gain ?? 1.5;
  const raw = beamAimAngle(tower, target);
  return limit * Math.tanh((gain * raw) / limit);
}

/**
 * fase 60 — Cuánto gira (`limit`) y cuánto se amplifica (`gain`) el cañón
 * de cada torre que APUNTA. Las que no están acá no giran a propósito: el
 * Tesla y el Thunderstroke son bobinas omnidireccionales (girarlas no
 * significaría nada) y el Guardian y el Gauss usan el adelanto balístico
 * de `guardianLeadAim`, no el traverse.
 */
const TRAVERSE = {
  beam: { limit: 0.60, gain: 1.5 },
  homing: { limit: 0.60, gain: 1.6 },
  mortar: { limit: 0.60, gain: 1.5 },
  laser: { limit: 0.40, gain: 1.5 },
};

/** La tabla de traverse, exportada para los tests (fuente única). */
export const TRAVERSE_AIM = TRAVERSE;

/**
 * dev-7 fase 29 — Gradiente longitudinal de un haz: el color se apaga en
 * los DOS EXTREMOS (los últimos ~2 px) y va pleno en el centro. Da
 * "cuerpo" al rayo en vez de una línea plana de un solo color.
 */
function beamGradient(ctx, x, y, ex, ey, color) {
  // Contexto sin gradientes (mock de test): color plano, nunca rompe.
  if (typeof ctx.createLinearGradient !== 'function') return withAlpha(color, 1);
  const len = Math.hypot(ex - x, ey - y) || 1;
  const fade = Math.min(0.4, 2 / len); // ~2 px de desvanecido en cada punta
  const g = ctx.createLinearGradient(x, y, ex, ey);
  g.addColorStop(0, withAlpha(color, 0));
  g.addColorStop(fade, withAlpha(color, 1));
  g.addColorStop(1 - fade, withAlpha(color, 1));
  g.addColorStop(1, withAlpha(color, 0));
  return g;
}

/** Ancho de detección horizontal según mecánica (§2.2). */
function detectWidth(d) {
  return d.columnHalfWidth ?? d.detectHalfWidth ?? d.range ?? 60;
}


export function guardianLeadAim(tower, tgt, top, spd) {
  if (!tgt) return 0;
  const x0 = tower.x;
  const T = dist(tgt.x, tgt.y, x0, top) / (spd || 1);
  const sf = tgt.slowFactor ?? 1; // mismo factor que consume enemies.js
  // FASE 58: la velocidad VERTICAL del blanco (la nominal × el factor de
  // layout). Con el marco alto el enemigo cae más rápido por encima del
  // alcance de las torres: apuntar a `tgt.vel` (la nominal) haría que
  // la bala llegue SIEMPRE por debajo del blanco.
  const vel = tgt.vel ?? 0;
  const leadX = clamp(tgt.x + (tgt.vx ?? 0) * T, 10, CONFIG.CANVAS_W - 10);
  // FASE 58: la proyección integra el cambio de velocidad en el borde
  // del "bajo fuego" (fallYAfter): con la línea recta el tiro se
  // quedaba corto en el cruce y las torres fallaban.
  const leadY = clamp(fallYAfter(tgt.y, vel * sf, T), 40, top - 10);
  return Math.atan2(leadX - x0, -(leadY - top));
}


export { TRAVERSE, beamGradient, detectWidth };
