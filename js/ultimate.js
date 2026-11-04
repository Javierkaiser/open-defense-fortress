// ============================================================
// ultimate.js — BOMBARDEO ORBITAL (1.16.0)
// ------------------------------------------------------------
// El ultimate deja de caer en una banda fija de y=340 con x aleatoria.
// Ahora:
//   · busca el RACIMO más denso con el mismo algoritmo que el Black Hole
//     (`blackHolePoint`, en towers-fx.js);
//   · reparte los impactos en una alfombra de 230 px alrededor del racimo;
//   · cada impacto se "pega" al enemigo vivo más cercano a su punto del
//     patrón, así no cae en el vacío;
//   · cierra con un remate más grande en el centro;
//   · limita el daño a los jefes (×0,5) para que el ultimate no borre una
//     pelea de jefe.
//
// El módulo es PURO respecto del estado del juego: recibe la lista viva y
// devuelve puntos/daño. `Fortress` es quien agenda y aplica; el daño NO vive
// en un efecto visual (el balance-sim no actualiza `engine.effects`, y el
// ultimate tiene que seguir midiéndose en headless).
//
// Sin DOM ni canvas al importar: los helpers de dibujo reciben el ctx.
// ============================================================

import { CONFIG, clamp } from './engine.js';
import { blackHolePoint } from './towers-fx.js';

/** Constantes del bombardeo. Los tiempos están en segundos. */
export const ORBITAL = {
  count: 12,              // 11 impactos normales + 1 remate
  duration: 2.7,          // ventana total (incluye el remate)
  damage: 80,             // daño base por impacto normal
  radius: 90,             // splash normal
  clusterRadius: 230,     // radio de la alfombra (más ancho que el Black Hole)
  warning: 0.18,          // aviso visual antes de cada impacto
  bossMul: 0.5,           // límite explícito: el jefe recibe la mitad
  finisher: {
    damageMul: 2.5,       // 200 de daño
    radiusMul: 1.5,       // 135 px
  },
};

/**
 * Impactos: 3 oleadas que aceleran + una pausa + remate.
 * El aviso de cada impacto se lanza `ORBITAL.warning` antes de su hora.
 */
export const ORBITAL_IMPACT_TIMES = [
  0.50, 0.67, 0.84, 1.01,
  1.18, 1.33, 1.48, 1.63,
  1.78, 1.91, 2.04,
  2.40,
];

/** Índice del remate (último de la tabla). */
export const ORBITAL_LAST = ORBITAL_IMPACT_TIMES.length - 1;

/** Paleta solar del ultimate (distinta del violeta del Black Hole). */
export const ORBITAL_COLORS = {
  gold: '#FFD24A',
  white: '#FFF3C4',
  ember: '#FF9A3D',
  scorch: '#1A0E05',
};

const TAU = Math.PI * 2;
const GOLDEN_ANGLE = 2.399963229728653;

const finite = (v) => Number.isFinite(v);

/** ¿El índice corresponde al remate? */
export function orbitalIsFinisher(index) {
  return Math.trunc(Number(index) || 0) === ORBITAL_LAST;
}

/**
 * Daño de un impacto (sin la matriz de familias, que la aplica `takeDamage`).
 * @param {number} index
 * @param {number} [dmgMul=1] multiplicador de cartas (`orbitalDmgMul`)
 * @returns {number}
 */
export function orbitalDamageFor(index, dmgMul = 1) {
  const mul = finite(Number(dmgMul)) && Number(dmgMul) > 0 ? Number(dmgMul) : 1;
  const base = ORBITAL.damage * mul;
  return orbitalIsFinisher(index) ? base * ORBITAL.finisher.damageMul : base;
}

/**
 * Radio del splash de un impacto (normal o remate).
 * @param {number} index
 * @returns {number}
 */
export function orbitalRadiusFor(index) {
  return orbitalIsFinisher(index)
    ? ORBITAL.radius * ORBITAL.finisher.radiusMul
    : ORBITAL.radius;
}

/**
 * Centro del racimo más denso de la lista viva. Usa el MISMO buscador que
 * el Black Hole, pero con la alfombra del ultimate y todo el campo jugable
 * (incluidos los enemigos que están por tocar la base).
 *
 * @param {Array} enemies lista viva
 * @returns {{x:number, y:number}}
 */
export function orbitalCenter(enemies) {
  return blackHolePoint(enemies, {
    radius: ORBITAL.clusterRadius,
    top: 40,
    bottom: CONFIG.TOWER_Y - 10,
  });
}

/**
 * Punto teórico del patrón de alfombra (espiral de ángulo áureo).
 * No busca enemigos: es el "ideal" que después `orbitalStrikePoint` pega
 * al enemigo más cercano.
 *
 * @param {{x:number,y:number}} center
 * @param {number} index 0..ORBITAL_LAST-1
 * @param {number} [count=ORBITAL_LAST]
 * @returns {{x:number,y:number}}
 */
export function orbitalPatternPoint(center, index, count = ORBITAL_LAST) {
  const c = center && finite(center.x) && finite(center.y)
    ? center : { x: CONFIG.BASE_X ?? CONFIG.CANVAS_W / 2, y: 380 };
  const n = Math.max(1, Math.trunc(Number(count) || ORBITAL_LAST));
  const k = Math.max(1, Math.trunc(Number(index) || 0) + 1);
  const r = ORBITAL.clusterRadius * Math.sqrt(Math.min(k, n) / n);
  const a = k * GOLDEN_ANGLE;
  return {
    x: clamp(c.x + Math.cos(a) * r, 30, CONFIG.CANVAS_W - 30),
    y: clamp(c.y + Math.sin(a) * r, 30, CONFIG.TOWER_Y - 10),
  };
}

const live = (e) => !!e && !e.dead && finite(e.x) && finite(e.y);

/**
 * Punto de impacto normal: el enemigo vivo más cercano al punto teórico
 * (búsqueda limitada para no arrastrar un impacto al otro extremo del
 * campo). Si no hay nadie cerca, cae al punto teórico y el splash igual
 * cubre la zona.
 *
 * @param {Array} enemies
 * @param {{x:number,y:number}} center
 * @param {number} index
 * @param {{searchRadius?:number}} [opts]
 * @returns {{x:number,y:number, snapped:boolean}}
 */
export function orbitalStrikePoint(enemies, center, index, opts = {}) {
  const p = orbitalPatternPoint(center, index);
  const search = Math.max(1, Number(opts.searchRadius) || ORBITAL.radius * 1.6);
  let best = null;
  let bestD = search * search;
  const list = Array.isArray(enemies) ? enemies : [];
  for (const e of list) {
    if (!live(e)) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > bestD) continue;
    bestD = d2;
    best = e;
  }
  if (!best) return { ...p, snapped: false };
  return {
    x: clamp(best.x, 30, CONFIG.CANVAS_W - 30),
    y: clamp(best.y, 30, CONFIG.TOWER_Y - 10),
    snapped: true,
  };
}

/**
 * Punto del remate: el enemigo vivo más cercano al centro del racimo.
 * Si no hay nadie, el centro (el remate visual igual se ve).
 *
 * @param {Array} enemies
 * @param {{x:number,y:number}} center
 * @returns {{x:number,y:number, snapped:boolean}}
 */
export function orbitalFinisherPoint(enemies, center) {
  const c = center && finite(center.x) && finite(center.y)
    ? center : { x: CONFIG.BASE_X ?? CONFIG.CANVAS_W / 2, y: 380 };
  let best = null;
  let bestD = ORBITAL.clusterRadius * ORBITAL.clusterRadius;
  const list = Array.isArray(enemies) ? enemies : [];
  for (const e of list) {
    if (!live(e)) continue;
    const dx = e.x - c.x;
    const dy = e.y - c.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > bestD) continue;
    bestD = d2;
    best = e;
  }
  const x = clamp(best?.x ?? c.x, 30, CONFIG.CANVAS_W - 30);
  const y = clamp(best?.y ?? c.y, 30, CONFIG.TOWER_Y - 10);
  return { x, y, snapped: !!best };
}

/**
 * Aplica un impacto a todos los enemigos dentro del splash.
 *
 * Es el único punto de daño del ultimate. Usa `takeDamage` directo (el
 * mismo camino que el resto del combate: matriz de familia, armadura,
 * escudo, placas y floats), pero sin perks/críticos, igual que antes.
 * Los jefes reciben `bossMul` (0,5) para que el ultimate no sea un
 * borra-jefes.
 *
 * @param {Array} enemies
 * @param {{x:number,y:number,damage:number,radius:number,bossMul?:number}} strike
 * @returns {number} cantidad de enemigos alcanzados
 */
export function applyOrbitalDamage(enemies, strike) {
  if (!strike || !finite(strike.x) || !finite(strike.y)) return 0;
  const damage = Number(strike.damage);
  const radius = Number(strike.radius);
  if (!finite(damage) || damage <= 0 || !finite(radius) || radius <= 0) return 0;
  const bossMul = finite(Number(strike.bossMul)) ? Number(strike.bossMul) : ORBITAL.bossMul;
  const list = Array.isArray(enemies) ? enemies : [];
  let hits = 0;
  for (const e of list) {
    if (!live(e)) continue;
    const reach = radius + (finite(e.r) ? e.r : 10);
    const dx = e.x - strike.x;
    const dy = e.y - strike.y;
    if (dx * dx + dy * dy > reach * reach) continue;
    if (typeof e.takeDamage === 'function') {
      e.takeDamage(damage * (e.isBoss ? bossMul : 1), 'splash');
    }
    hits += 1;
  }
  return hits;
}

// ------------------------------------------------------------
// Dibujo (sin estado): el ctx real lo pasa el engine; los tests usan un
// stub. Todo se dibuja con arcos/líneas y `lighter`; no hay gradientes por
// frame ni `shadowBlur` por impacto (la calidad Baja recorta aún más).
// ------------------------------------------------------------

function designatorFade(t) {
  const rem = clamp(Number(t) || 0, 0, 1);
  return Math.min(1, (1 - rem) * 6, rem * 4);
}

/**
 * Designador del racimo: anillos, brackets y cruz. Se dibuja durante toda
 * la lluvia y se va antes que el último impacto.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x:number,y:number}} center
 * @param {number} t 1 al inicio → 0 al final
 * @param {boolean} [lowQ]
 */
export function drawOrbitalDesignator(ctx, center, t, lowQ = false) {
  if (!ctx || !center || !finite(center.x) || !finite(center.y)) return;
  const fade = designatorFade(t);
  if (fade <= 0.01) return;
  const age = 1 - clamp(Number(t) || 0, 0, 1);
  const R = ORBITAL.clusterRadius;
  const spin = age * 1.8;
  const segs = lowQ ? 8 : 14;
  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = ORBITAL_COLORS.gold;

  // Halo ancho (dos pasadas, sin shadowBlur).
  ctx.globalAlpha = 0.10 * fade;
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.97, 0, TAU);
  ctx.stroke();

  // Anillo principal segmentado.
  ctx.globalAlpha = 0.55 * fade;
  ctx.lineWidth = 2;
  if (ctx.setLineDash) ctx.setLineDash([22, 14]);
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.84, spin, spin + TAU);
  ctx.stroke();
  if (ctx.setLineDash) ctx.setLineDash([]);

  // Anillo interior y marcas de cuadrante.
  ctx.globalAlpha = 0.28 * fade;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.62, -spin * 0.7, -spin * 0.7 + TAU);
  ctx.stroke();
  for (let i = 0; i < segs; i++) {
    const a = spin + (i / segs) * TAU;
    const r0 = R * 0.90;
    const r1 = R * 1.01;
    ctx.globalAlpha = (i % 2 ? 0.30 : 0.55) * fade;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    ctx.stroke();
  }

  // Cruz central y brackets de esquina.
  ctx.globalAlpha = 0.65 * fade;
  ctx.strokeStyle = ORBITAL_COLORS.white;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-18, 0); ctx.lineTo(18, 0);
  ctx.moveTo(0, -18); ctx.lineTo(0, 18);
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    const a = spin * 0.5 + i * (Math.PI / 2);
    const r = R * 0.70;
    const len = lowQ ? 18 : 30;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * (r - len / 2), Math.sin(a) * (r - len / 2));
    ctx.lineTo(Math.cos(a) * (r + len / 2), Math.sin(a) * (r + len / 2));
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Aviso previo de un impacto: retícula que se cierra + columna fina.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x:number,y:number,radius:number}} strike
 * @param {number} t 1 → 0
 * @param {boolean} [lowQ]
 */
export function drawOrbitalWarning(ctx, strike, t, lowQ = false) {
  if (!ctx || !strike || !finite(strike.x) || !finite(strike.y)) return;
  const rem = clamp(Number(t) || 0, 0, 1);
  const age = 1 - rem;
  const fade = Math.min(1, age * 8, rem * 10);
  if (fade <= 0.01) return;
  const R = finite(strike.radius) ? strike.radius : ORBITAL.radius;
  ctx.save();
  ctx.translate(strike.x, strike.y);
  ctx.globalCompositeOperation = 'lighter';

  // Columna que baja desde arriba: anticipa el impacto.
  ctx.globalAlpha = 0.22 * fade;
  ctx.strokeStyle = ORBITAL_COLORS.gold;
  ctx.lineWidth = lowQ ? 2 : 3;
  ctx.beginPath();
  ctx.moveTo(0, -strike.y + 16);
  ctx.lineTo(0, 0);
  ctx.stroke();

  // Retícula que se cierra.
  const rr = R * (1.75 - 0.95 * age);
  ctx.globalAlpha = 0.55 * fade;
  ctx.strokeStyle = ORBITAL_COLORS.gold;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, rr, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 0.8 * fade;
  ctx.strokeStyle = ORBITAL_COLORS.white;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-10, 0); ctx.lineTo(10, 0);
  ctx.moveTo(0, -10); ctx.lineTo(0, 10);
  ctx.stroke();
  ctx.restore();
}

/**
 * Impacto: haz, anillos y marca de ceniza. El remate agrega un flash y
 * anillos extra.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x:number,y:number,radius:number,final?:boolean}} strike
 * @param {number} t 1 → 0
 * @param {boolean} [lowQ]
 */
export function drawOrbitalImpact(ctx, strike, t, lowQ = false) {
  if (!ctx || !strike || !finite(strike.x) || !finite(strike.y)) return;
  const rem = clamp(Number(t) || 0, 0, 1);
  const age = 1 - rem;
  const final = strike.final === true;
  const R = finite(strike.radius) ? strike.radius : ORBITAL.radius;
  const beam = Math.max(0, 1 - age * (final ? 2.2 : 3.8));
  ctx.save();
  ctx.translate(strike.x, strike.y);
  ctx.globalCompositeOperation = 'lighter';

  // Haz vertical: glow ancho + núcleo blanco.
  if (beam > 0.01) {
    ctx.globalAlpha = 0.24 * beam;
    ctx.strokeStyle = ORBITAL_COLORS.gold;
    ctx.lineWidth = final ? 30 : 13;
    ctx.beginPath();
    ctx.moveTo(0, -strike.y - 20);
    ctx.lineTo(0, 0);
    ctx.stroke();
    ctx.globalAlpha = 0.85 * beam;
    ctx.strokeStyle = ORBITAL_COLORS.white;
    ctx.lineWidth = final ? 8 : 3;
    ctx.beginPath();
    ctx.moveTo(0, -strike.y - 20);
    ctx.lineTo(0, 0);
    ctx.stroke();
  }

  // Anillos de choque.
  const ring = R * (0.35 + 0.85 * Math.min(1, age * 1.8));
  const fade = Math.max(0, 1 - age);
  ctx.globalAlpha = 0.75 * fade;
  ctx.strokeStyle = ORBITAL_COLORS.gold;
  ctx.lineWidth = final ? 5 : 3;
  ctx.beginPath();
  ctx.arc(0, 0, ring, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 0.35 * fade;
  ctx.lineWidth = final ? 3 : 2;
  ctx.beginPath();
  ctx.arc(0, 0, ring * 0.68, 0, TAU);
  ctx.stroke();

  // Flash central del remate.
  if (final && age < 0.4) {
    ctx.globalAlpha = 0.75 * (1 - age / 0.4);
    ctx.fillStyle = ORBITAL_COLORS.white;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.86, 0, TAU);
    ctx.fill();
  }

  // Marca de ceniza: el golpe deja huella un instante.
  if (age > 0.06 && age < 0.95) {
    const k = Math.max(0, 1 - age);
    ctx.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.scale(1, 0.38);
    ctx.globalAlpha = 0.30 * k;
    ctx.fillStyle = ORBITAL_COLORS.scorch;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.58, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.26 * k;
    ctx.strokeStyle = ORBITAL_COLORS.ember;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.58, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}
