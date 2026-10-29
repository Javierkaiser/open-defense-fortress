// =============================================================================
// main.js — BOOT del juego en el navegador
// -----------------------------------------------------------------------------
// La clase Game vive en game.js (testeable sin DOM). Este archivo solo
// construye Engine/HUD/Game, aplica calidad/tema y cablea el lifecycle.
// =============================================================================

import { Engine } from './engine.js';
import { HUD } from './hud.js';
import {
  loadQuality, applyQualityToContext, applyQualityToDom, particleCapFor,
} from './quality.js';
import { NATIVE_EVENTS } from './native.js';
import { Game } from './game.js';

export { Game };

// ------------------------------------------------------------
// BOOT
// ------------------------------------------------------------
const canvas = document.getElementById('game-canvas');
if (!canvas) throw new Error('[main] no se encontró #game-canvas');

const engine = new Engine(canvas);
// dev-7 fase 19 (rendimiento — reportado lento en mobile/PC viejas):
// aplica la calidad gráfica guardada ANTES del primer frame. engine.js
// sigue sin importar nada — esto vive acá para no romper esa invariante.
const qualityId = loadQuality();
// dev-7 fase 28: la calidad se aplica a TODOS los contexts del engine
// (el visible y los 3 caches offscreen del fondo/niebla). Antes sólo
// alcanzaba al visible, así que en calidad "baja" el planeta seguía
// haciendo 34 operaciones de shadowBlur por software cada 3 frames.
engine.applyQualityTo(applyQualityToContext, qualityId);
engine.setParticleCap(particleCapFor(qualityId));
// dev-7 fase 29: la calidad también llega a la CAPA DOM (el desenfoque
// de los overlays se apaga en calidad "baja": sin GPU, el blur del modal
// de cartas costaba 34 FPS → 4,6 FPS).
applyQualityToDom(qualityId);
// dev-7 fase 54: el HUD aplica el tema guardado (DOM + tinte de escena).
const hud = new HUD(engine);
const game = new Game(engine, hud);

// dev-7 fase 28: si un frame lanza (un draw() con un campo faltante,
// un nodo del HUD en null...), el engine NO se muere pero hay que
// avisarle al jugador: el juego seguiría con el último frame congelado
// sin explicación.
engine.onFatalError = (err) => {
  const el = document.getElementById('boot-error');
  if (!el) return;
  const msg = document.getElementById('boot-error-msg');
  if (msg) {
    msg.textContent = 'Ocurrió un error inesperado y el juego se detuvo. '
      + 'Recargá la página para seguir jugando. Detalle: '
      + (err?.message ?? String(err));
  }
  el.hidden = false;
};

game.toMenu();   // BOOT → MENU
engine.start();  // loop rAF corre desde ya (escena animada en menú)

// Audio: crear/reanudar el AudioContext en el PRIMER gesto del usuario
// (política de autoplay; §audio.js init()).
const unlockAudio = () => { hud.audio.init(); hud.audio.resume(); };
window.addEventListener('pointerdown', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });

// BUG-010 (v3 4/7): orientación portrait forzada en mobile.
// El aviso #rotate-hint solo aparece con pantalla táctil en landscape
// (media query CSS); acá se alterna .show según la orientación REAL
// (matchMedia cubre resize/rotación aunque el SO no dispare eventos).
const rotateHint = document.getElementById('rotate-hint');
if (rotateHint) {
  const coarseMq = window.matchMedia('(pointer: coarse)');
  const landscapeMq = window.matchMedia('(orientation: landscape)');
  const refreshRotateHint = () => {
    const mostrar = coarseMq.matches && landscapeMq.matches;
    rotateHint.classList.toggle('show', mostrar);
    // dev-7 fase 28: girar el móvil PAUSA la partida. Antes el aviso
    // (position:fixed, z-index 999, opaco) tapaba la pantalla pero el
    // mundo seguía corriendo detrás: al volver a portrait el jugador
    // se encontraba con la base destruida, sin aviso. Ahora el juego
    // queda pausado y se ve la pantalla de pausa al volver.
    if (mostrar && engine.state === 'PLAYING') engine.setState('PAUSED');
  };
  const onOrientChange = () => { refreshRotateHint(); }; // compat legacy
  if (typeof coarseMq.addEventListener === 'function') {
    coarseMq.addEventListener('change', refreshRotateHint);
    landscapeMq.addEventListener('change', refreshRotateHint);
  } else {
    // Safari viejo: API addListener
    coarseMq.addListener?.(refreshRotateHint);
    landscapeMq.addListener?.(refreshRotateHint);
  }
  window.addEventListener('orientationchange', onOrientChange);
  window.addEventListener('resize', refreshRotateHint);
  refreshRotateHint();
}

// dev-7 fase 37: el HUD se adapta al MARCO (no al viewport). El marco
// es `alto × 0,614` de ancho, así que puede quedar más estrecho que los
// 540 px del diseño aunque la ventana sea ancha (landscape, portátil
// chico). Si no se re-mide al redimensionar, el HUD se sale del marco.
window.addEventListener('resize', () => hud.refreshFrameMode());
window.addEventListener('orientationchange', () => hud.refreshFrameMode());

// Exposición mínima para smoke tests headless (no usada por el juego).
// La Fortress viva siempre en window.__GDF__.game.fortress (se recrea
// por stage en startStage()).
window.__GDF__ = { game, engine, hud };

// Fix móvil: la guarda de index.html ya no avisa a los 2,5 s. Al terminar
// el boot, cierra la pantalla de carga y cualquier aviso de error tardío.
window.__gdfBootOk?.();

// ------------------------------------------------------------
// Puente nativo (Android/Capacitor)
// ------------------------------------------------------------
// MainActivity.java llama a window.__gdfBack() desde onBackPressed. Si el
// juego no lo maneja, el nativo manda la app a background (no la cierra).
window.__gdfBack = () => game.handleBack();

// Background/foreground: la partida se pausa y la música se detiene/duckea.
// Al volver, el AudioContext se reanuda pero la partida sigue en pausa.
window.addEventListener(NATIVE_EVENTS.pause, () => {
  if (engine.state === 'PLAYING') engine.setState('PAUSED');
  // En Android no alcanza con duckear: el WebView puede seguir sonando en
  // background. Se corta la música; al volver a jugar se rearma sola.
  hud.audio.setPaused(true);
  hud.audio.stopMusic();
});
window.addEventListener(NATIVE_EVENTS.resume, () => {
  hud.audio.resume();
});
