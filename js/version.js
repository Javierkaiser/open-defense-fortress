// =============================================================================
// version.js — versión visible del juego
// -----------------------------------------------------------------------------
// package.json, mobile/version.json y el pie del menú deben decir lo mismo.
// tests/test-version.mjs compara los tres; esta constante es la fuente que
// usa el runtime (el HTML no puede importar package.json sin build).
// =============================================================================

export const VERSION = '1.5.2';
