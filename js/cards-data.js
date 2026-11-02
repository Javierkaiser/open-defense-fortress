// =============================================================================
// cards-data.js — datos puros del catálogo de cartas
// -----------------------------------------------------------------------------
// Extraído de cards.js (fase 75): topes, tags de unidad, técnicas y cazas.
// No importa la lógica de la partida; solo la tabla de mosquitos para el tope
// del enjambre y la constante de daño de caza.
// =============================================================================

import { WASPS } from './towers.js';
import { HUNT_DMG_MUL } from './card-constants.js';

export const MAX_SWARM = WASPS.maxSwarm;

/** Cartas por oferta (§4.4: fila de 3 con reveal flip escalonado). */
export const CARD_OFFER_COUNT = 3;

// Aplicaciones por carta y partida: 1 = una sola vez.
// Desde 1.8.0 ninguna carta de mejora se acumula. `appsOf()` cuenta las
// aplicaciones y `isCardEligible()` saca la carta del pool al alcanzar su
// tope. Las cartas de DESBLOQUEO (unlock_* y black_hole) y `bullets_5` —el
// level-up del Guardian, que puede subir hasta Lv.5— NO están en esta tabla.
export const CAPS = {
  // Daño global y por tipo.
  dmg_all: 1,
  dmg_type_ballistic: 1,
  dmg_type_light: 1,
  dmg_type_blast: 1,
  dmg_type_electric: 1,
  dmg_type_drone: 1,
  // Daño exclusivo por unidad: 7 torres + Láser + 3 drones.
  dmg_guard: 1,
  dmg_missile: 1,
  dmg_beam: 1,
  dmg_thunder: 1,
  dmg_tesla: 1,
  dmg_mortar: 1,
  dmg_gauss: 1,
  dmg_laser: 1,
  dmg_firewheel: 1,
  dmg_wasps: 1,
  dmg_forcefield: 1,
  // Cantidad, cadencia y alcance.
  swarm_grow: 1,     // Nido Ampliado: +1 mosquito
  cadence_up: 1,     // Servos Acelerados
  rapid_bullets: 1,  // Balas Hipersónicas
  detect_up: 1,      // Sensores Ampliados
  pierce_up: 1,      // Núcleos Perforantes
  // Economía y defensa.
  base_shield: 1,    // una carga del Escudo de Base
  ult_charge: 1,     // una recarga extra del ORBITAL STRIKE
  ult_power: 1,      // Impacto Orbital+
  repair_500: 1,     // una reparación (+500 de cura)
  armor_plate: 1,    // un blindaje (+600 de HP máximo)
  // Cartas de TÉCNICA: una mecánica por unidad.
  tech_pierce: 1,
  tech_bounce: 1,
  tech_explode: 1,
  tech_slow: 1,
  tech_crit: 1,
  tech_lifesteal: 1,
  tech_missile_homing: 1,
  tech_exec_missile: 1,
  tech_missile_salvo: 1,
  tech_tesla_jump: 1,
  tech_thunder_area: 1,
  tech_thunder_stun: 1,
  tech_mortar_radius: 1,
  tech_gauss_crit: 1,
  tech_laser_split: 1,
  tech_beam_focus: 1,
  tech_firewheel_radius: 1,
  tech_wasps_venom: 1,
  tech_forcefield_radius: 1,
  tech_forcefield_regen: 1,
  // Combos de dos piezas y cartas de Black Hole.
  combo_singularity: 1,
  combo_overload: 1,
  combo_prism_loop: 1,
  combo_siege_sync: 1,
  combo_ignition: 1,
  combo_venom_shell: 1,
  combo_bubble_chain: 1,
  combo_railstorm: 1,
  combo_melt_rail: 1,
  combo_slow_siege: 1,
  combo_coup: 1,
  combo_arc_guard: 1,
  combo_absolute_zero: 1,
  combo_fracture: 1,
  combo_glacial_wave: 1,
  combo_blood_pact: 1,
  combo_transfusion: 1,
  combo_rail_mark: 1,
  combo_shared_pierce: 1,
  bh_horizon: 1,
  bh_collapse: 1,
  // Caza de familia: ×1,8 una sola vez (dos aplicaciones darían ×3,24).
  hunt_rock: 1,
  hunt_crystal: 1,
  hunt_spore: 1,
  hunt_virus: 1,
};

export const UNIT_TAGS = {
  guardian: ['projectile'],
  missile: ['projectile', 'explosive', 'area'],
  beam: ['beam'],
  thunderstroke: ['bolt', 'area'],
  tesla: ['chain'],
  mortar: ['explosive', 'area'],
  gauss: ['projectile', 'rail'],
  laser: ['beam', 'laser'],
  firewheel: ['contact', 'area'],
  wasps: ['swarm'],
  forcefield: ['shield', 'area'],
};

export const TECH_CARDS = [
  {
    id: 'tech_pierce',
    rarity: 'uncommon',
    name: 'Núcleos Perforantes II',
    desc: 'Las balas del Guardian atraviesan +1 enemigo.',
    weight: 6,
    unit: 'guardian',
    mods: { pierceCount: 1 },
  },
  {
    id: 'tech_bounce',
    rarity: 'rare',
    name: 'Rebote Magnético',
    desc: 'Las balas del Guardian rebotan a un enemigo cercano al impactar.',
    weight: 6,
    unit: 'guardian',
    mods: { bounceCount: 1 },
  },
  {
    id: 'tech_explode',
    rarity: 'rare',
    name: 'Balas Detonantes',
    // fase 74: rework. Antes era explosión AL MATAR; ahora el impacto
    // detona (una vez por proyectil) y la carta exige una torre con tag
    // `blast` (Missile o Mortar). `impactExplodeChance` se guarda en el
    // proyectil; el daño de área lo aplica enemies.js.
    desc: 'Las balas del Guardian detonan al IMPACTAR: 40% del daño en un radio de 70. Requiere Missile o Mortar.',
    weight: 6,
    unit: 'guardian',
    requiresTags: ['blast'],
    mods: { impactExplodeChance: 1, impactExplodeFrac: 0.4, impactExplodeRadius: 70 },
  },
  {
    id: 'tech_slow',
    rarity: 'uncommon',
    name: 'Haz Gélido',
    desc: 'El Beam ralentiza un 20 % al impactar. El slow es de la luz, no de las balas.',
    weight: 6,
    unit: 'beam',
    mods: { slowOnHit: 0.2 },
  },
  {
    id: 'tech_crit',
    rarity: 'uncommon',
    name: 'Ojo de Halcón',
    desc: 'El Guardian hace un 20 % de crítico.',
    weight: 6,
    unit: 'guardian',
    mods: { critChanceAdd: 0.2 },
  },
  {
    id: 'tech_lifesteal',
    rarity: 'rare',
    name: 'Drenaje del Haz',
    desc: 'Cada tick del Beam cura al escudo el 1,5 % del daño hecho. El robo de vida es de la luz y del veneno.',
    weight: 6,
    unit: 'beam',
    mods: { lifesteal: 0.015 },
  },
  {
    id: 'tech_missile_homing',
    rarity: 'uncommon',
    name: 'Guiado Táctico',
    desc: 'Los misiles giran más rápido y persiguen mejor (homing +1). El aturdimiento es del Thunderstroke.',
    weight: 5,
    minStage: 2,
    unit: 'missile',
    mods: { homingStrength: 1 },
  },
  {
    id: 'tech_exec_missile',
    rarity: 'rare',
    name: 'Cabeza Nuclear',
    desc: 'Los misiles del Misil rematen a los que quedan bajo el 12 % de vida.',
    weight: 5,
    minStage: 2,
    unit: 'missile',
    mods: { executeThreshold: 0.12 },
  },
  // fase 74 — técnicas para el resto del arsenal. Todas usan mods que
  // `unitMods()` ya lee (o que se agregan en esta fase) y exigen poseer
  // la unidad por `TECH_UNIT`/`findUnit`.
  {
    id: 'tech_missile_salvo',
    rarity: 'rare',
    name: 'Salva de Misiles',
    desc: 'El Misil lanza +1 misil por andanada.',
    weight: 5,
    minStage: 2,
    unit: 'missile',
    mods: { extraCount: 1 },
  },
  {
    id: 'tech_tesla_jump',
    rarity: 'uncommon',
    name: 'Salto de Cadena',
    desc: 'La Tesla encadena +1 salto.',
    weight: 6,
    unit: 'tesla',
    mods: { extraCount: 1 },
  },
  {
    id: 'tech_thunder_area',
    rarity: 'uncommon',
    name: 'Tormenta Ramificada',
    desc: 'El Thunderstroke genera +1 mini rayo de área.',
    weight: 6,
    unit: 'thunderstroke',
    mods: { areaTargetsAdd: 1 },
  },
  {
    id: 'tech_thunder_stun',
    rarity: 'uncommon',
    name: 'Descarga Paralizante',
    desc: 'El Thunderstroke tiene +15% de aturdir.',
    weight: 5,
    unit: 'thunderstroke',
    mods: { stunChance: 0.15 },
  },
  {
    id: 'tech_mortar_radius',
    rarity: 'uncommon',
    name: 'Ojiva Expandida',
    desc: 'El Mortar explota con +20% de radio.',
    weight: 6,
    minStage: 2,
    unit: 'mortar',
    mods: { areaMul: 1.2 },
  },
  {
    id: 'tech_gauss_crit',
    rarity: 'rare',
    name: 'Munición de Tungsteno',
    desc: 'El Gauss tiene +20% de crítico.',
    weight: 6,
    minStage: 2,
    unit: 'gauss',
    mods: { critChanceAdd: 0.2 },
  },
  {
    id: 'tech_laser_split',
    rarity: 'rare',
    name: 'Láser Dividido',
    desc: 'El Láser dispara +1 rayo simultáneo.',
    weight: 6,
    minStage: 2,
    unit: 'laser',
    mods: { extraCount: 1 },
  },
  {
    id: 'tech_beam_focus',
    rarity: 'rare',
    name: 'Foco Acelerado',
    desc: 'El Beam acelera su ramp de foco +50%.',
    weight: 6,
    unit: 'beam',
    mods: { beamRampPerSecAdd: 0.4 },
  },
  {
    id: 'tech_firewheel_radius',
    rarity: 'uncommon',
    name: 'Barrido Ancho',
    desc: 'La Rueda de Fuego barre +8 px de radio.',
    weight: 5,
    minStage: 2,
    unit: 'firewheel',
    mods: { radiusAdd: 8 },
  },
  {
    id: 'tech_wasps_venom',
    rarity: 'uncommon',
    name: 'Veneno Concentrado',
    desc: 'El veneno de los Mosquitos hace +1 de daño por segundo.',
    weight: 5,
    minStage: 2,
    unit: 'wasps',
    mods: { venomDpsAdd: 1 },
  },
  {
    id: 'tech_forcefield_radius',
    rarity: 'uncommon',
    name: 'Burbuja Expandida',
    desc: 'El Campo de Fuerza gana +10 px de burbuja.',
    weight: 5,
    minStage: 2,
    unit: 'forcefield',
    mods: { radiusAdd: 10 },
  },
  {
    id: 'tech_forcefield_regen',
    rarity: 'rare',
    name: 'Burbuja Regenerativa',
    desc: 'La burbuja del Campo de Fuerza regenera +1,5 HP/s por enemigo atrapado.',
    weight: 5,
    minStage: 2,
    unit: 'forcefield',
    mods: { bubbleRegen: 1.5 },
  },
]

export const HUNT_CARDS = [
  {
    id: 'hunt_rock', name: 'Caza de Rocas', family: 'rock', mul: HUNT_DMG_MUL,
    rarity: 'rare', weight: 6, minStage: 2,
    desc: 'Todas las torres hacen ×1,8 contra la ROCA (meteoritos, fragmentos y blindados).',
  },
  {
    id: 'hunt_crystal', name: 'Caza de Cristales', family: 'crystal', mul: HUNT_DMG_MUL,
    rarity: 'rare', weight: 6, minStage: 2,
    desc: 'Todas las torres hacen ×1,8 contra el CRISTAL (los cristales rojos).',
  },
  {
    id: 'hunt_spore', name: 'Caza de Esporas', family: 'spore', mul: HUNT_DMG_MUL,
    rarity: 'rare', weight: 6, minStage: 2,
    desc: 'Todas las torres hacen ×1,8 contra la ESPORA (las esporas y los blobs).',
  },
  {
    id: 'hunt_virus', name: 'Caza de Virus', family: 'virus', mul: HUNT_DMG_MUL,
    rarity: 'rare', weight: 6, minStage: 2,
    desc: 'Todas las torres hacen ×1,8 contra el VIRUS (los blobs y sus jefes).',
  },
]
