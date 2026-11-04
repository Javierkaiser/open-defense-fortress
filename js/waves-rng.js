// waves-rng.js — azar reproducible del director de olas (fase 77)

/** PRNG mulberry32. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Hash FNV-1a de 32 bits para partes de texto. */
function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Combina una semilla con cualquier cantidad de numeros/textos. Es la
 * forma canonica de derivar streams independientes (composicion, spawn,
 * jefe, formacion) sin que uno consuma el azar del otro.
 *
 * @param {number} seed
 * @param {...(number|string)} parts
 * @returns {number} uint32
 */
export function hashSeed(seed, ...parts) {
  let h = (Number.isFinite(seed) ? seed : 0) >>> 0;
  for (const part of parts) {
    const p = typeof part === 'number'
      ? ((part >>> 0) ^ Math.imul((part | 0) + 1, 0x9e3779b1)) >>> 0
      : hashString(String(part ?? ''));
    h ^= p + 0x9e3779b9 + (h << 6) + (h >>> 2);
    h = h >>> 0;
  }
  return h >>> 0;
}

/** Numero uniforme en [a,b) a partir de rnd. */
export function range(rnd, a, b) {
  return a + rnd() * (b - a);
}

/** Elige un elemento (tolera listas vacias). */
export function pick(rnd, items) {
  const arr = Array.isArray(items) ? items : [];
  if (!arr.length) return null;
  const i = Math.min(arr.length - 1, Math.max(0, (rnd() * arr.length) | 0));
  return arr[i];
}

/**
 * Ruido determinista 0..1 por (semilla, indice, sal). Permite posicionar
 * a un enemigo sin conocer al resto de su grupo: el scheduler puede
 * soltarlo de a uno y la formacion es la misma que en bloque.
 *
 * @param {number} seed
 * @param {number} index
 * @param {number} [salt]
 * @returns {number} [0,1)
 */
export function unit(seed, index, salt = 0) {
  let h = (seed >>> 0)
    ^ Math.imul((index | 0) + 1, 0x9e3779b1)
    ^ Math.imul((salt | 0) + 1, 0x85ebca6b);
  h = h >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}