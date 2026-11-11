// =============================================================================
// transitions.js — overdrive 1.17.11
// -----------------------------------------------------------------------------
// Transiciones de pantalla con la View Transitions API (same-document).
//
// La idea es una sola: la pantalla nueva NACE del elemento que la provocó.
//   · entrar a la batalla  → la etapa se abre desde su fila (clip-path).
//   · pausa               → el panel crece desde el botón de pausa (círculo).
//   · continuar           → el panel se encoge de vuelta al botón.
//   · fin de etapa        → el parte sube desde el borde inferior.
//   · level-up            → el chip Lv se convierte en el encabezado del modal.
//   · menú ↔ hojas        → empuje lateral corto, como una pila de pantallas.
//
// Sin soporte (o con prefers-reduced-motion) el cambio es el de siempre:
// instantáneo. El módulo es PURO: no toca document/window al importarse y
// recibe doc/win por parámetro, así los tests corren en Node sin DOM.
// =============================================================================

/** Pantallas que viven "dentro" del menú, como hojas de una pila. */
const SUB_SCREENS = new Set([
  'SELECT_STAGE', 'TORRETAS', 'PROTOCOLO', 'RECORDS', 'CREDITS',
]);

/** Pantallas de cierre de run. */
const END_SCREENS = new Set(['STAGE_CLEAR', 'GAME_OVER']);

/**
 * Clasifica el par de pantallas en una transición.
 *
 * Devuelve `null` cuando el cambio no debe animarse: la misma pantalla
 * (re-render de PROTOCOLO/TORRETAS) o el cierre del modal de cartas, que
 * ya se resolvió con su propia transición.
 *
 * @param {?string} from pantalla anterior
 * @param {?string} to pantalla nueva
 * @returns {?string} 'deploy' | 'pause-in' | 'pause-out' | 'rise' |
 *   'push-forward' | 'push-back' | 'fade' | null
 */
export function transitionKind(from, to) {
  if (!from || !to || from === to) return null;
  if (to === 'PLAYING') {
    // El modal de cartas ya cerró su propia transición: reanudar no
    // necesita otra capa encima.
    if (from === 'CARD_CHOICE') return null;
    if (from === 'PAUSED') return 'pause-out';
    return 'deploy';
  }
  if (to === 'PAUSED') return 'pause-in';
  // El modal de cartas lo maneja showCardChoice() con su shared element.
  if (to === 'CARD_CHOICE') return null;
  if (END_SCREENS.has(to) && from === 'PLAYING') return 'rise';
  // Menú → hoja: la hoja entra desde la derecha.
  if (from === 'MENU' && SUB_SCREENS.has(to)) return 'push-forward';
  // Hoja → menú: vuelve la pila hacia atrás.
  if (SUB_SCREENS.has(from) && to === 'MENU') return 'push-back';
  // Selector → hoja (Protocolo, Torretas, Récords, Créditos).
  if (from === 'SELECT_STAGE' && SUB_SCREENS.has(to)) return 'push-forward';
  // Hoja → selector: vuelve atrás.
  if (SUB_SCREENS.has(from) && to === 'SELECT_STAGE') return 'push-back';
  // Abandonar la run desde la pausa devuelve a la pila del menú.
  if (from === 'PAUSED' && (SUB_SCREENS.has(to) || to === 'MENU')) return 'push-back';
  // Cerrar una pantalla de fin vuelve a la pila.
  if (END_SCREENS.has(from) && (SUB_SCREENS.has(to) || to === 'MENU')) return 'push-back';
  return 'fade';
}

/** ¿El navegador tiene View Transitions same-document? */
export function supportsViewTransition(doc = null) {
  return !!doc && typeof doc.startViewTransition === 'function';
}

/** ¿El jugador pidió menos movimiento? A prueba de matchMedia ausente. */
export function prefersReducedMotion(win = null) {
  try {
    return !!win && typeof win.matchMedia === 'function'
      && win.matchMedia('(prefers-reduced-motion: reduce)').matches === true;
  } catch (_err) {
    return false;
  }
}

const clamp = (n, lo, hi) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return lo;
  return Math.min(Math.max(v, lo), hi);
};

/**
 * Convierte un rectángulo de viewport en las variables CSS que usan los
 * clip-path de deploy/pausa. Todo se recorta al viewport: una fila
 * scrolleada fuera de pantalla no puede generar un clip negativo.
 *
 * @param {{top:number,left:number,right:number,bottom:number}|null} rect
 * @param {number} width ancho del viewport
 * @param {number} height alto del viewport
 * @returns {{top:string,right:string,bottom:string,left:string,cx:string,cy:string}}
 */
export function rectVars(rect, width, height) {
  const w = Math.max(0, Number(width) || 0);
  const h = Math.max(0, Number(height) || 0);
  // Sin rect válido (teclado, nodo ausente): el origen es el centro.
  const valid = rect && ['top', 'left', 'right', 'bottom']
    .every((key) => Number.isFinite(Number(rect[key])));
  if (!valid) {
    const cx = Math.round(w / 2);
    const cy = Math.round(h / 2);
    return {
      top: `${cy}px`, right: `${cx}px`, bottom: `${h - cy}px`,
      left: `${cx}px`, cx: `${cx}px`, cy: `${cy}px`,
    };
  }
  const top = clamp(rect.top, 0, h);
  const left = clamp(rect.left, 0, w);
  const right = clamp(w - Number(rect.right), 0, w);
  const bottom = clamp(h - Number(rect.bottom), 0, h);
  // Centro del área visible del rectángulo (para el círculo de la pausa).
  const cx = clamp(left + Math.max(0, w - left - right) / 2, 0, w);
  const cy = clamp(top + Math.max(0, h - top - bottom) / 2, 0, h);
  return {
    top: `${Math.round(top)}px`,
    right: `${Math.round(right)}px`,
    bottom: `${Math.round(bottom)}px`,
    left: `${Math.round(left)}px`,
    cx: `${Math.round(cx)}px`,
    cy: `${Math.round(cy)}px`,
  };
}

/** Nombres de las variables que escribe applyRectVars(). */
export const RECT_VAR_NAMES = Object.freeze([
  '--vt-top', '--vt-right', '--vt-bottom', '--vt-left', '--vt-cx', '--vt-cy',
]);

/** Escribe el rectángulo como variables CSS en la raíz del documento. */
export function applyRectVars(root, rect, width, height) {
  if (!root?.style) return null;
  const vars = rectVars(rect, width, height);
  for (const name of RECT_VAR_NAMES) {
    const key = name.replace('--vt-', '');
    root.style.setProperty(name, vars[key]);
  }
  return vars;
}

/** Borra las variables de rectángulo (fin de la transición). */
export function clearRectVars(root) {
  if (!root?.style) return;
  for (const name of RECT_VAR_NAMES) root.style.removeProperty(name);
}

/**
 * Pone o quita `view-transition-name` inline. Un nombre duplicado en el
 * mismo estado aborta la transición, así que la limpieza es obligatoria.
 *
 * @param {?Element} el
 * @param {?string} name nombre o null/'' para quitarlo
 */
export function setViewTransitionName(el, name) {
  if (!el?.style?.setProperty) return;
  if (name) el.style.setProperty('view-transition-name', name);
  else el.style.removeProperty('view-transition-name');
}

/**
 * Quita cualquier nombre inline que haya quedado de una transición
 * salteada. Se corre ANTES de preparar la siguiente: un nombre huérfano
 * duplicado haría que el navegador aborte sin avisar.
 *
 * @param {?Document} doc
 * @returns {number} cuántos nodos se limpiaron
 */
export function clearViewTransitionNames(doc) {
  const nodes = doc?.querySelectorAll?.('[style*="view-transition-name"]');
  if (!nodes || typeof nodes[Symbol.iterator] !== 'function') return 0;
  let n = 0;
  for (const el of nodes) {
    if (!el?.style?.removeProperty) continue;
    el.style.removeProperty('view-transition-name');
    n += 1;
  }
  return n;
}

/** Quita las clases `vt-*` de la raíz (por si una transición fue salteada). */
function clearVtClasses(root) {
  if (!root?.classList) return;
  for (const cls of Array.from(root.classList)) {
    if (cls === 'vt-active' || cls === 'vt-reduced' || cls.startsWith('vt-')) {
      root.classList.remove(cls);
    }
  }
}

// Token por documento: si una transición se pisa con otra, solo la última
// puede limpiar clases y nombres. Evita que la limpieza vieja apague la nueva.
const sessionByDoc = new WeakMap();

/**
 * Ejecuta `update` dentro de una View Transition.
 *
 * Si no hay soporte, `update` corre SÍNCRONO (mismo contrato que siempre)
 * y se llama `onCleanup` para no dejar nombres/clases preparados. Si el
 * navegador falla al arrancar, se cae al mismo camino.
 *
 * @param {?Document} doc
 * @param {() => void} update mutación de DOM
 * @param {{kind?:string, win?:Window|null, onCleanup?:Function|null}} [opts]
 * @returns {ViewTransition|null}
 */
export function runViewTransition(doc, update, opts = {}) {
  if (typeof update !== 'function') return null;
  const { kind = 'fade', win = null, onCleanup = null } = opts;

  const cleanup = () => {
    try { onCleanup?.(); } catch (_err) { /* la limpieza nunca rompe la pantalla */ }
  };

  if (!supportsViewTransition(doc)) {
    update();
    cleanup();
    return null;
  }

  const root = doc.documentElement;
  if (!root?.classList) {
    update();
    cleanup();
    return null;
  }

  const token = (sessionByDoc.get(doc) ?? 0) + 1;
  sessionByDoc.set(doc, token);
  // Una transición salteada puede dejar su clase: la nueva manda.
  clearVtClasses(root);
  const reduced = prefersReducedMotion(win);
  const klass = reduced ? 'vt-fade' : `vt-${kind}`;
  root.classList.add('vt-active', klass);
  if (reduced) root.classList.add('vt-reduced');

  let vt = null;
  try {
    vt = doc.startViewTransition(update);
  } catch (_err) {
    root.classList.remove('vt-active', klass, 'vt-reduced');
    update();
    cleanup();
    return null;
  }

  const done = () => {
    // Si otra transición tomó el control, su `clearVtClasses` y su
    // `clearViewTransitionNames` ya limpiaron lo viejo: correr este
    // cleanup tarde borraría los nombres de la transición NUEVA.
    if (sessionByDoc.get(doc) !== token) return;
    cleanup();
    root.classList.remove('vt-active', klass, 'vt-reduced');
  };

  // Los rechazos son esperables (transición salteada por otra): nunca
  // deben quedar como unhandled rejection.
  vt?.ready?.catch?.(() => {});
  vt?.updateCallbackDone?.catch?.(() => {});
  if (vt?.finished?.then) vt.finished.then(done, done);
  else done();

  return vt;
}
