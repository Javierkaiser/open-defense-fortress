// RNGs deterministas compartidos por tests y scripts.
// No es un archivo de test: el glob es tests/test-*.mjs.

/** LCG usado por test-cards (misma secuencia que la definición local previa). */
export function makeLcgRng(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

/** xorshift32 usado por test-integration/test-stages/waves. */
export function makeXorShift32(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return (s % 1_000_000_007) / 1_000_000_007;
  };
}

/** Ejecuta `fn` con Math.random sembrado y lo restaura SIEMPRE. */
export function withSeededRandom(seed, fn, kind = 'xorshift') {
  const original = Math.random;
  Math.random = kind === 'lcg' ? makeLcgRng(seed) : makeXorShift32(seed);
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}
