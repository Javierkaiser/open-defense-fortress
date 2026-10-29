// ============================================================
// quality.js — dev-7 fase 19 (pedido del usuario: "el juego anda lento
// en el navegador del celular o en una PC vieja, aun en 2x")
//
// Ajuste de calidad gráfica persistente, mismo patrón que theme.js
// (funciones puras + storage inyectable, testeable desde Node).
//
// 'alta' (default): igual que siempre, sin cambios.
// 'baja': apaga shadowBlur en TODO el juego con un solo cambio (ver
// applyQuality() abajo — sobrescribe el getter/setter de shadowBlur en
// la instancia del contexto 2D, así no hace falta tocar los 69 sitios
// que lo usan en towers.js/enemies.js/engine.js/player.js/effects.js) y
// reduce el tope de partículas simultáneas. Es la optimización de mayor
// impacto por esfuerzo: shadowBlur fuerza un blur por software en la
// mayoría de motores de canvas 2D, carísimo en GPUs viejas/integradas.
// ============================================================

import { safeLocalStorage } from './storage.js';

const KEY = 'gdf_quality';

export const QUALITY_LEVELS = [
  { id: 'alta', name: 'Alta', particleCap: 400 },
  { id: 'baja', name: 'Baja (más rendimiento)', particleCap: 150 },
];
const QUALITY_IDS = new Set(QUALITY_LEVELS.map((q) => q.id));
const DEFAULT_QUALITY = 'alta';

/** Normaliza cualquier valor guardado — tolera datos viejos/corruptos. */
export function normalizeQuality(raw) {
  return QUALITY_IDS.has(raw) ? raw : DEFAULT_QUALITY;
}

export function loadQuality(storage = safeLocalStorage()) {
  try {
    return normalizeQuality(storage.getItem(KEY));
  } catch (_err) {
    return DEFAULT_QUALITY;
  }
}

export function saveQuality(id, storage = safeLocalStorage()) {
  const q = normalizeQuality(id);
  try {
    storage.setItem(KEY, q);
  } catch (_err) { /* storage lleno/bloqueado: la calidad sigue aplicada igual */ }
  return q;
}

/**
 * Aplica el nivel de calidad a un contexto 2D real. En 'baja', el
 * shadowBlur queda permanentemente en 0 sin importar qué le asignen —
 * un solo `Object.defineProperty` en la INSTANCIA del contexto (no en el
 * prototipo, no afecta a otros canvas) alcanza para anular el efecto en
 * cualquiera de los 69 sitios que lo usan, sin tocar ninguno de ellos.
 * No hace nada en Node (sin contexto real) ni si `ctx` es null/undefined.
 */
export function applyQualityToContext(ctx, quality) {
  if (!ctx) return;
  const q = normalizeQuality(quality);
  if (q === 'baja') {
    let blur = 0;
    Object.defineProperty(ctx, 'shadowBlur', {
      configurable: true,
      get() { return blur; },
      set(v) { blur = 0; void v; }, // ignora cualquier valor: siempre 0
    });
  } else if (Object.prototype.hasOwnProperty.call(ctx, 'shadowBlur')) {
    // Volver a 'alta' después de haber estado en 'baja': saca el override
    // de la instancia para que el shadowBlur real del prototipo responda de nuevo.
    delete ctx.shadowBlur;
  }
}

/** Tope de partículas simultáneas para el nivel de calidad dado. */
export function particleCapFor(quality) {
  return QUALITY_LEVELS.find((q) => q.id === normalizeQuality(quality))?.particleCap ?? 400;
}

/**
 * Aplica el nivel de calidad a la CAPA DOM (fase 29).
 *
 * El `backdrop-filter: blur()` de los overlays (menú, selector, modal de
 * cartas) es carísimo sin GPU: medido en Chrome sin aceleración, abrir el
 * modal de cartas con blur de 7 px pasaba de 34 FPS a **4,6 FPS** (el
 * blur se recalcula en cada frame porque el canvas de detrás se mueve).
 *
 * En calidad 'baja' se desactiva el blur (el velo opaco se queda, así
 * que el texto se sigue leyendo igual) y con eso el modal vuelve a los
 * ~34 FPS. En 'alta' se mantiene el desenfoque.
 *
 * Pone la clase `gdf-lowq` en el elemento raíz del documento.
 * @param {string} quality id del nivel de calidad
 * @param {Element} [root] elemento raíz (por defecto document.documentElement)
 */
export function applyQualityToDom(quality, root = undefined) {
  // La raíz puede inyectarse (tests en Node): si viene dada, no hace falta
  // que exista `document`.
  const el = root ?? (typeof document !== 'undefined' ? document.documentElement : null);
  if (!el || !el.classList) return;
  el.classList.toggle('gdf-lowq', normalizeQuality(quality) === 'baja');
}


