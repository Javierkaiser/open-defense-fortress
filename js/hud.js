// =============================================================================
// hud.js — fachada pública del HUD
// -----------------------------------------------------------------------------
// La implementación vive en hud-builders.js (markup puro) y hud-core.js
// (clase HUD). Se mantiene este archivo para no tocar imports existentes.
// =============================================================================

export * from './hud-builders.js';
export { HUD } from './hud-core.js';
