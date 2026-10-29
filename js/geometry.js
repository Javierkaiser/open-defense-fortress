// =============================================================================
// geometry.js — helpers geométricos puros compartidos por combate/render
// -----------------------------------------------------------------------------
// `pointSegmentDistance`/`closestPointOnSegment` estaban duplicados en
// enemies.js (colisión CCD) y towers.js (Láser), con la misma proyección
// copiada. `withAlpha` tenía DOS contratos distintos (#RRGGBB vs #RGB).
// Una sola implementación evita que un fix de borde se aplique a medias.
// =============================================================================

/**
 * Punto del segmento (x1,y1)-(x2,y2) más cercano a (px,py).
 * @returns {[number,number]}
 */
export function closestPointOnSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 <= 1e-9) return [x1, y1];
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return [x1 + t * dx, y1 + t * dy];
}

/** Distancia de (px,py) al segmento (proyección acotada). */
export function pointSegmentDistance(px, py, x1, y1, x2, y2) {
  const [cx, cy] = closestPointOnSegment(px, py, x1, y1, x2, y2);
  return Math.hypot(px - cx, py - cy);
}

/**
 * '#RGB'/'#RRGGBB' + alfa → 'rgba(r,g,b,a)'.
 * Si el color no es un hex válido, se devuelve tal cual (el caller puede
 * usar nombres CSS/rgba ya resueltos sin romper).
 */
export function withAlpha(color, a = 1) {
  if (typeof color !== 'string') return color;
  const h = color.replace('#', '');
  if (!/^(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(h)) return color;
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
