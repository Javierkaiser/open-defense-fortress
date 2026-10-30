// =============================================================================
// tower-skins.js — CATÁLOGO DE SKINS DE TORRES/DRONES
// -----------------------------------------------------------------------------
// Una skin es PRESENTACIÓN pura: paleta, motivos de forma, pad y colores de FX.
// Nunca toca daño, cadencia, hitbox ni reglas de combate. El registro vive acá
// (datos puros) y el renderer de tower-art.js lo compila a un rig congelado.
//
// `skinId = 'auto'` sigue al tema de UI elegido por el jugador. Un skinId
// explícito permite, a futuro, una skin independiente del tema sin cambiar
// esta API: TOWER_SKINS es el catálogo y skinFor() resuelve el fallback.
// =============================================================================

import { DRONES, TOWERS } from './towers-data.js';
import { safeLocalStorage } from './storage.js';

export const SKIN_KEY = 'gdf_tower_skin';
export const DEFAULT_SKIN = 'auto';
export const DEFAULT_THEME = 'volcanico';

/** Acentos base por unidad: la familia de color que NUNCA se pierde. */
export const BASE_ACCENTS = {
  guardian: '#35C8FF',
  missile: '#FFB36A',
  beam: '#39FF6A',
  thunderstroke: '#FFB347',
  tesla: '#33E0FF',
  mortar: '#FFD24A',
  gauss: '#FF5CC8',
  laser: '#9DFF3C',
  firewheel: '#FF7A3D',
  wasps: '#FFE24A',
  forcefield: '#7FDFFF',
};

/**
 * Catálogo. Las claves son ids de skin; por convención los cinco temas de UI
 * usan el mismo id. Una skin futura sólo necesita una entrada más.
 */
export const TOWER_SKINS = {
  volcanico: {
    id: 'volcanico',
    name: 'Volcánico',
    base: true,
  },

  cyberpunk: {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    palette: {
      body: '#0B0712',
      bodyTop: '#1B0D2B',
      dark: '#040208',
      metal: '#C9D6E8',
      accent: '#00F0FF',
      hot: '#FF2E97',
      core: '#FFFFFF',
    },
    accents: {
      guardian: '#00F0FF',
      missile: '#FFB36A',
      beam: '#39FF6A',
      thunderstroke: '#B48CFF',
      tesla: '#33E0FF',
      mortar: '#FFD24A',
      gauss: '#FF2E97',
      laser: '#9DFF3C',
      firewheel: '#FF7A3D',
      wasps: '#FFE24A',
      forcefield: '#7FDFFF',
    },
    motifs: [
      { id: 'skin_cyber_antenna', anchor: 'top', offset: [0, -1], role: 'metal', line: [0, 0, 0, -8], width: 1.2, alpha: 0.85 },
      { id: 'skin_cyber_tip', anchor: 'top', offset: [0, -9], role: 'hot', circle: [0, 0, 1.6], alpha: 0.9, pulse: 'flicker' },
      { id: 'skin_cyber_circuitL', anchor: 'sideL', offset: [-2, 0], role: 'accent', d: 'M0,0 L-4,-3 L-4,-6', stroke: true, width: 1, alpha: 0.55 },
      { id: 'skin_cyber_circuitR', anchor: 'sideR', offset: [2, 0], role: 'accent', d: 'M0,0 L4,-3 L4,-6', stroke: true, width: 1, alpha: 0.55 },
      { id: 'skin_cyber_holo', anchor: 'base', offset: [0, 1], role: 'hot', ellipse: [0, 0, 10, 2], stroke: true, width: 1.1, alpha: 0.35, pulse: 'breathe' },
    ],
    perUnit: {
      guardian: { patch: { visor: { role: 'accent', alpha: 0.85 }, visorEye: { role: 'core', alpha: 1 } } },
      thunderstroke: { patch: { coil1: { role: 'hot', alpha: 0.9 }, coil2: { role: 'hot', alpha: 0.9 }, coil3: { role: 'hot', alpha: 0.9 }, coil4: { role: 'hot', alpha: 0.9 } } },
      beam: { patch: { lens: { role: 'hot', alpha: 0.95 }, lensCore: { role: 'core', alpha: 1 } } },
    },
    pad: { plate: '#1A1025', rim: 'rgba(255,46,151,0.45)', glowAlpha: 0.28, tickIdle: 'rgba(200,160,255,0.28)' },
    fx: { beam: '#39FF6A', laser: '#9DFF3C', bolt: '#B48CFF', chain: '#33E0FF', mortar: '#FFD24A', crater: '#FF7A3D', trail: '#FFB36A', explosion: '#FF2E97', core: '#FFFFFF' },
    iconPad: 8,
    flags: { texture: false },
  },

  neon: {
    id: 'neon',
    name: 'Neón',
    palette: {
      body: '#120820',
      bodyTop: '#26123E',
      dark: '#05020A',
      metal: '#B9A6FF',
      accent: '#00FFF0',
      hot: '#FFEE00',
      core: '#FFFFFF',
    },
    accents: {
      guardian: '#00FFF0',
      missile: '#FFB36A',
      beam: '#39FF6A',
      thunderstroke: '#C400FF',
      tesla: '#33E0FF',
      mortar: '#FFEE00',
      gauss: '#FF2E97',
      laser: '#9DFF3C',
      firewheel: '#FF7A3D',
      wasps: '#FFE24A',
      forcefield: '#7FDFFF',
    },
    motifs: [
      { id: 'skin_neon_ring', anchor: 'top', offset: [0, -2], role: 'accent', ellipse: [0, 0, 6, 2], stroke: true, width: 1.4, alpha: 0.85, pulse: 'wave', wave: 0.4 },
      { id: 'skin_neon_dot', anchor: 'top', offset: [0, -2], role: 'hot', circle: [0, 0, 1.5], alpha: 0.9, pulse: 'breathe' },
      { id: 'skin_neon_tubeL', anchor: 'sideL', offset: [-1, 0], role: 'hot', line: [0, 0, -1, -10], width: 1.2, alpha: 0.6 },
      { id: 'skin_neon_tubeR', anchor: 'sideR', offset: [1, 0], role: 'hot', line: [0, 0, 1, -10], width: 1.2, alpha: 0.6 },
      { id: 'skin_neon_arc', anchor: 'base', offset: [0, 1], role: 'accent', ellipse: [0, 0, 9, 1.8], stroke: true, width: 1.2, alpha: 0.45, pulse: 'breathe' },
    ],
    perUnit: {
      tesla: { patch: { ring1: { role: 'hot', alpha: 0.9 }, ring2: { role: 'hot', alpha: 0.9 }, ring3: { role: 'hot', alpha: 0.9 } } },
      laser: { patch: { lens: { role: 'hot', alpha: 0.95 }, lensCore: { role: 'core', alpha: 1 } } },
      mortar: { patch: { boreRing: { role: 'hot', alpha: 0.95 } } },
    },
    pad: { plate: '#150826', rim: 'rgba(255,238,0,0.45)', glowAlpha: 0.30, tickIdle: 'rgba(190,170,255,0.30)' },
    fx: { beam: '#39FF6A', laser: '#9DFF3C', bolt: '#C400FF', chain: '#33E0FF', mortar: '#FFEE00', crater: '#FF7A3D', trail: '#FFB36A', explosion: '#FFEE00', core: '#FFFFFF' },
    iconPad: 8,
    flags: { texture: false },
  },

  aqua: {
    id: 'aqua',
    name: 'Aqua',
    palette: {
      body: '#08222A',
      bodyTop: '#12404A',
      dark: '#031014',
      metal: '#A8DDE6',
      accent: '#2BD9E0',
      hot: '#FFD166',
      core: '#FFFFFF',
    },
    accents: {
      guardian: '#2BD9E0',
      missile: '#FFB36A',
      beam: '#4CD98A',
      thunderstroke: '#6FC3DF',
      tesla: '#2BD9E0',
      mortar: '#FFD166',
      gauss: '#FF8FA3',
      laser: '#8CFFB0',
      firewheel: '#FF9A6A',
      wasps: '#D8F26A',
      forcefield: '#7FDFFF',
    },
    motifs: [
      { id: 'skin_aqua_bubble', anchor: 'top', offset: [0, -2], role: 'accent', circle: [0, 0, 3], stroke: true, width: 1.2, alpha: 0.65, pulse: 'breathe' },
      { id: 'skin_aqua_bubble2', anchor: 'top', offset: [2, -6], role: 'hot', circle: [0, 0, 1.4], stroke: true, width: 1, alpha: 0.7 },
      { id: 'skin_aqua_finL', anchor: 'sideL', offset: [-1, 0], role: 'metal', d: 'M0,0 L-5,-3 L-2,2 Z', alpha: 0.8 },
      { id: 'skin_aqua_finR', anchor: 'sideR', offset: [1, 0], role: 'metal', d: 'M0,0 L5,-3 L2,2 Z', alpha: 0.8 },
      { id: 'skin_aqua_wave', anchor: 'base', offset: [0, 1], role: 'accent', d: 'M-8,0 Q-4,-3 0,0 T8,0', stroke: true, width: 1.2, alpha: 0.5, pulse: 'wave', wave: 1.2 },
    ],
    perUnit: {
      beam: { patch: { lens: { role: 'accent', alpha: 0.95 }, lensCore: { role: 'core', alpha: 1 } } },
      laser: { patch: { lens: { role: 'accent', alpha: 0.95 }, lensCore: { role: 'core', alpha: 1 } } },
      gauss: { patch: { rail: { role: 'metal', alpha: 0.85 } } },
    },
    pad: { plate: '#0E2A3A', rim: 'rgba(43,217,224,0.45)', glowAlpha: 0.26, tickIdle: 'rgba(120,220,230,0.28)' },
    fx: { beam: '#4CD98A', laser: '#8CFFB0', bolt: '#6FC3DF', chain: '#2BD9E0', mortar: '#FFD166', crater: '#FF9A6A', trail: '#FFB36A', explosion: '#FFD166', core: '#FFFFFF' },
    iconPad: 8,
    flags: { texture: false },
  },

  cielo: {
    id: 'cielo',
    name: 'Cielo',
    palette: {
      body: '#101C2C',
      bodyTop: '#1E3350',
      dark: '#050A12',
      metal: '#DCEBFF',
      accent: '#6FC6FF',
      hot: '#FFC94A',
      core: '#FFFFFF',
    },
    accents: {
      guardian: '#6FC6FF',
      missile: '#FFC94A',
      beam: '#7FE0A0',
      thunderstroke: '#B7A8FF',
      tesla: '#7FD8FF',
      mortar: '#FFC94A',
      gauss: '#FF9AC8',
      laser: '#A8FFB8',
      firewheel: '#FF9A6A',
      wasps: '#FFE58A',
      forcefield: '#9FDFFF',
    },
    motifs: [
      { id: 'skin_sky_cloud1', anchor: 'top', offset: [0, -2], role: 'metal', circle: [0, 0, 2.5], alpha: 0.65, pulse: 'breathe' },
      { id: 'skin_sky_cloud2', anchor: 'top', offset: [3, -4], role: 'metal', circle: [0, 0, 2], alpha: 0.55, pulse: 'breathe' },
      { id: 'skin_sky_cloud3', anchor: 'top', offset: [-3, -4], role: 'metal', circle: [0, 0, 2], alpha: 0.55, pulse: 'breathe' },
      { id: 'skin_sky_wingL', anchor: 'sideL', offset: [-1, 0], role: 'hot', d: 'M0,0 L-7,-4 L-4,3 Z', alpha: 0.7 },
      { id: 'skin_sky_wingR', anchor: 'sideR', offset: [1, 0], role: 'hot', d: 'M0,0 L7,-4 L4,3 Z', alpha: 0.7 },
      { id: 'skin_sky_sun', anchor: 'base', offset: [0, 1], role: 'hot', d: 'M-7,0 Q0,-4 7,0', stroke: true, width: 1.2, alpha: 0.55, pulse: 'breathe' },
    ],
    perUnit: {
      guardian: { patch: { shoulderLTop: { role: 'metal', alpha: 0.95 }, shoulderRTop: { role: 'metal', alpha: 0.95 } } },
      missile: { patch: { nose1: { role: 'metal', alpha: 0.95 }, nose2: { role: 'metal', alpha: 0.95 } } },
      thunderstroke: { patch: { orb: { role: 'hot', alpha: 0.95 }, orbCore: { role: 'core', alpha: 1 } } },
    },
    pad: { plate: '#1D2A3D', rim: 'rgba(255,201,74,0.42)', glowAlpha: 0.26, tickIdle: 'rgba(180,210,255,0.30)' },
    fx: { beam: '#7FE0A0', laser: '#A8FFB8', bolt: '#B7A8FF', chain: '#7FD8FF', mortar: '#FFC94A', crater: '#FF9A6A', trail: '#FFC94A', explosion: '#FFC94A', core: '#FFFFFF' },
    iconPad: 8,
    flags: { texture: false },
  },
};

const SKIN_IDS = new Set([DEFAULT_SKIN, ...Object.keys(TOWER_SKINS)]);
const _unitCache = new Map();

/** Normaliza un id de skin: desconocido → auto (nunca rompe la partida). */
export function normalizeSkin(raw) {
  return SKIN_IDS.has(raw) ? raw : DEFAULT_SKIN;
}

/** Skin de tema (o skin explícita) con fallback al tema default. */
export function skinFor(themeId, skinId = DEFAULT_SKIN) {
  const id = normalizeSkin(skinId);
  if (id !== DEFAULT_SKIN && TOWER_SKINS[id]) return TOWER_SKINS[id];
  return TOWER_SKINS[themeId] ?? TOWER_SKINS[DEFAULT_THEME];
}

/**
 * Skin resuelta para una unidad concreta. Para el tema base devuelve una
 * skin "vacía" (palette/motifs null) para que el render actual quede EXACTO.
 */
export function skinForUnit(themeId, skinId, type) {
  const key = `${themeId ?? DEFAULT_THEME}|${normalizeSkin(skinId)}|${type}`;
  const hit = _unitCache.get(key);
  if (hit) return hit;
  const base = skinFor(themeId, skinId);
  if (base.base) {
    const out = {
      id: base.id, name: base.name, base: true,
      palette: null, motifs: null, perUnit: null, pad: null, fx: null,
      iconPad: 0, flags: {},
    };
    _unitCache.set(key, out);
    return out;
  }
  const kind = TOWERS[type]?.kind ?? DRONES[type]?.kind ?? type;
  const accent = base.accents?.[type] ?? base.palette.accent;
  const out = {
    id: base.id,
    name: base.name,
    base: false,
    kind,
    palette: { ...base.palette, accent },
    motifs: base.motifs ?? null,
    perUnit: base.perUnit?.[type] ?? null,
    pad: base.pad ?? null,
    fx: {
      ...base.fx,
      muzzle: base.palette.hot,
      projectile: base.fx?.projectileByType?.[type] ?? accent,
    },
    iconPad: base.iconPad ?? 0,
    flags: base.flags ?? {},
  };
  _unitCache.set(key, out);
  return out;
}

/** Lee la skin equipada (default: seguir al tema). */
export function loadSkin(storage = safeLocalStorage()) {
  try {
    return normalizeSkin(storage.getItem(SKIN_KEY));
  } catch (_err) {
    return DEFAULT_SKIN;
  }
}

/** Guarda la skin equipada; devuelve la normalizada. */
export function saveSkin(id, storage = safeLocalStorage()) {
  const skin = normalizeSkin(id);
  try {
    storage.setItem(SKIN_KEY, skin);
  } catch (_err) { /* storage bloqueado: la skin sigue aplicada en memoria */ }
  return skin;
}
