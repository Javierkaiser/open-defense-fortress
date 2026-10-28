// ============================================================
// native.js - contrato mínimo entre el juego web y el contenedor Android.
//
// El juego NO importa Capacitor ni ningún plugin: este módulo es puro y
// sólo describe el mapping del botón atrás y los nombres de los eventos
// que MainActivity.java dispara en el WebView.
// ============================================================

export const NATIVE_EVENTS = Object.freeze({
  pause: 'gdf:native-pause',
  resume: 'gdf:native-resume',
});

/**
 * Qué debe hacer el botón atrás según el estado de la FSM.
 *
 * @param {string} state estado canónico de engine.js
 * @returns {{handled: boolean, next: string|null}}
 *   handled=true: el juego consumió el back (no cerrar/background).
 *   next=null: consumido sin cambiar de estado (p. ej. CARD_CHOICE).
 */
export function backAction(state) {
  switch (state) {
    case 'PLAYING':
      return { handled: true, next: 'PAUSED' };
    case 'PAUSED':
      return { handled: true, next: 'MENU' };
    case 'SELECT_STAGE':
    case 'TORRETAS':
    case 'PROTOCOLO':
    case 'RECORDS':
    case 'CREDITS':
    case 'STAGE_CLEAR':
    case 'GAME_OVER':
      return { handled: true, next: 'MENU' };
    case 'CARD_CHOICE':
      // La elección de carta es obligatoria: el back no la saltea.
      return { handled: true, next: null };
    default:
      // MENU/BOOT: la app nativa decide (moveTaskToBack).
      return { handled: false, next: null };
  }
}

/** ¿Estamos dentro de un contenedor nativo de Capacitor? */
export function isNativePlatform(global = globalThis) {
  try {
    return global?.Capacitor?.isNativePlatform?.() === true;
  } catch (_err) {
    return false;
  }
}
