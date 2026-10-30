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

// Capas de aplicación por carta repetible (anti-stack infinito; §2.2).
// Una repetible NUNCA puede aparecer más de `CAPS[id]` veces por partida:
// su contador vive en la unidad (o en la fortaleza) y `appsOf()` lo lee
// para sacarla del pool en cuanto se alcanza el tope.
//   · daño genérico    → dmg_all 2, dmg_guard 2
//   · daño exclusivo   → 10 cartas (6 torres clásicas + Láser + 3 drones), 2 c/u
//   · cadencia/detección→ cadence_up 3, rapid_bullets 2, detect_up 2
//   · puntería         → pierce_up 3
//   · economía/defensa → xp_boost 2, score_gain 2, streak_shield 2,
//                         ult_charge 1, ult_power 2, repair_500 3,
//                         armor_plate 1
// dev-7 fase 30: swarm_grow 2 (+1 mosquito del Dron Mosquitos).
export const CAPS = {
  dmg_all: 2,        // Munición Reforzada ×2 como máximo
  // fase 74: cartas de DAÑO POR TIPO (afectan a todas las unidades de
  // ese tipo, presentes y futuras). Son más angostas que dmg_all y más
  // fuertes por stack (+20% vs +10%).
  dmg_type_ballistic: 2,
  dmg_type_light: 2,
  dmg_type_blast: 2,
  dmg_type_electric: 2,
  dmg_type_drone: 2,
  dmg_guard: 2,      // Cañones Potenciados ×2
  // dev-7 fase 12: cartas exclusivas por torre (una por cada torre
  // además de Guardian) — mismo tope ×2 que dmg_guard, mismo patrón.
  dmg_missile: 2,
  dmg_beam: 2,
  dmg_thunder: 2,
  dmg_tesla: 2,
  dmg_mortar: 2,
  dmg_gauss: 2,
  // dev-7: el arsenal extendido (Láser + los 3 drones) se quedó SIN carta
  // de daño propia — invertir en el Láser rendía 25% menos que en el
  // Gauss. Estas 4 lo igualan: mismo ×1.6, mismo tope ×2, mismo patrón.
  dmg_laser: 2,
  dmg_firewheel: 2,
  dmg_wasps: 2,
  dmg_forcefield: 2,
  // dev-7 fase 30: "Nido Ampliado" (+1 mosquito del enjambre del Dron
  // Mosquitos). Tope 2: el enjambre base son 3 mosquitos y el tope de diseño
  // son 5 (+ el +1/+2 del perk de meta, que va por otro lado).
  swarm_grow: 2,
  cadence_up: 3,     // Servos Acelerados ×3 (×0.9³ ≈ 0.73 cadencia)
  rapid_bullets: 2,  // Balas Hipersónicas ×2 (×1.5625 velocidad de bala Guardian)
  detect_up: 2,      // Sensores Ampliados ×2 (±60 → ±118 px)
  // dev-7: `pierce_up` NO tenía tope → apilado infinito de atravesamientos
  // por enemigo. Tope 3 (3 extras es el techo de diseño).
  pierce_up: 3,      // Núcleos Perforantes ×3
  xp_boost: 2,       // ×1.25² = ×1.56 XP máximo
  score_gain: 2,     // ×1.2² = ×1.44 score máximo
  streak_shield: 2,  // hasta 2 cargas de escudo de racha
  // dev-7: `ult_charge` NO tenía tope → se ofrecía en CADA level-up de
  // toda la run. Tope 1: una sola recarga extra del ultimate por partida.
  ult_charge: 1,     // una sola carga extra del ORBITAL STRIKE
  ult_power: 2,      // Impacto Orbital+ ×2 (×2.25 daño ultimate)
  // dev-7 fase 26: estas dos NO tenían tope. `armor_plate` sumaba +800 de
  // HP máximo por cada aparición (una run larga podía llevar la base de
  // 3 000 a 15 000 de HP) y, con el daño de leak topado a 50 (player.js
  // LEAK_DMG_CAP), una base tan grande quedaba PRÁCTICAMENTE inmatable por
  // leaks — lo que anulaba el cambio de balance v7 que hizo que los leaks
  // dolieran de verdad. Ahora tienen tope explícito.
  // dev-7 (recalibración): `armor_plate` baja a +600 y UNA sola vez
  // (+20% de la base de 3 000). Antes eran +800 ×2 = +1 600 (+53%), que
  // toleraban 32 leaks extra (50 de daño por leak): la base era
  // literalmente inmatable. Ahora el blindaje es real pero no rompe el
  // balance v7.
  repair_500: 3,     // hasta 3 reparaciones (+1500 de cura)
  armor_plate: 1,    // un blindaje (+600 de HP máximo)
  // dev-7 fase 51: CARTAS DE TÉCNICA — por primera vez una carta puede
  // dar MECÁNICAS (el vocabulario de los perks: rebote, perforación,
  // explosión al morir, ralentizar, crítico, robo de vida, aturdir,
  // remate), no sólo multiplicadores. Tope ×2 cada una: la 2ª
  // aplicación ACUMULA el efecto (2 rebotes, 60 % de detonar, 40 % de
  // crítico…), la 3ª ya no entra al pool (appsOf → isCardEligible).
  tech_pierce: 2,
  tech_bounce: 2,
  tech_explode: 2,
  tech_slow: 2,
  tech_crit: 2,
  tech_lifesteal: 2,
  tech_missile_homing: 2,
  tech_exec_missile: 2,
  // fase 74: técnicas para el resto del arsenal (mecánicas que el motor
  // ya lee o que se agregan en esta fase).
  tech_missile_salvo: 2,
  tech_tesla_jump: 2,
  tech_thunder_area: 2,
  tech_thunder_stun: 2,
  tech_mortar_radius: 2,
  tech_gauss_crit: 2,
  tech_laser_split: 2,
  tech_beam_focus: 2,
  tech_firewheel_radius: 2,
  tech_wasps_venom: 2,
  tech_forcefield_radius: 2,
  tech_forcefield_regen: 2,
  // fase 74: combos de dos piezas y cartas de Black Hole (1 sola vez).
  combo_singularity: 1,
  // Fase 76 — combos de identidad (reemplazan los débiles de la fase 74).
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
  // fase 74.2: combos de frío, lifesteal y tipo/mecánica.
  combo_absolute_zero: 1,
  combo_fracture: 1,
  combo_glacial_wave: 1,
  combo_blood_pact: 1,
  combo_transfusion: 1,
  combo_rail_mark: 1,
  combo_shared_pierce: 1,
  bh_horizon: 1,
  bh_collapse: 1,
  // dev-7 fase 50: la caza de familia se aplica UNA vez (si se
  // aplicara dos, el multiplicador pasaria de x1,8 a x3,24).
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
    desc: 'Las balas del Guardian atraviesan +1 enemigo (hasta 2 veces).',
    weight: 6,
    unit: 'guardian',
    mods: { pierceCount: 1 },
  },
  {
    id: 'tech_bounce',
    rarity: 'rare',
    name: 'Rebote Magnético',
    desc: 'Las balas del Guardian rebotan a un enemigo cercano al impactar (hasta 2 veces).',
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
    desc: 'Las balas del Guardian detonan al IMPACTAR: 40% del daño en un radio de 70. Requiere Missile o Mortar. Hasta 2 veces.',
    weight: 6,
    unit: 'guardian',
    requiresTags: ['blast'],
    mods: { impactExplodeChance: 1, impactExplodeFrac: 0.4, impactExplodeRadius: 70 },
  },
  {
    id: 'tech_slow',
    rarity: 'uncommon',
    name: 'Haz Gélido',
    desc: 'El Beam ralentiza un 20 % al impactar (hasta 2 veces). El slow es de la luz, no de las balas.',
    weight: 6,
    unit: 'beam',
    mods: { slowOnHit: 0.2 },
  },
  {
    id: 'tech_crit',
    rarity: 'uncommon',
    name: 'Ojo de Halcón',
    desc: 'El Guardian hace un 20 % de crítico (hasta 2 veces).',
    weight: 6,
    unit: 'guardian',
    mods: { critChanceAdd: 0.2 },
  },
  {
    id: 'tech_lifesteal',
    rarity: 'rare',
    name: 'Drenaje del Haz',
    desc: 'Cada tick del Beam cura al escudo el 1,5 % del daño hecho (hasta 2 veces). El robo de vida es de la luz y del veneno.',
    weight: 6,
    unit: 'beam',
    mods: { lifesteal: 0.015 },
  },
  {
    id: 'tech_missile_homing',
    rarity: 'uncommon',
    name: 'Guiado Táctico',
    desc: 'Los misiles giran más rápido y persiguen mejor (homing +1, hasta 2 veces). El aturdimiento es del Thunderstroke.',
    weight: 5,
    minStage: 2,
    unit: 'missile',
    mods: { homingStrength: 1 },
  },
  {
    id: 'tech_exec_missile',
    rarity: 'rare',
    name: 'Cabeza Nuclear',
    desc: 'Los misiles del Misil rematen a los que quedan bajo el 12 % de vida (hasta 2 veces).',
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
    desc: 'El Misil lanza +1 misil por andanada (hasta 2 veces).',
    weight: 5,
    minStage: 2,
    unit: 'missile',
    mods: { extraCount: 1 },
  },
  {
    id: 'tech_tesla_jump',
    rarity: 'uncommon',
    name: 'Salto de Cadena',
    desc: 'La Tesla encadena +1 salto (hasta 2 veces).',
    weight: 6,
    unit: 'tesla',
    mods: { extraCount: 1 },
  },
  {
    id: 'tech_thunder_area',
    rarity: 'uncommon',
    name: 'Tormenta Ramificada',
    desc: 'El Thunderstroke genera +1 mini rayo de área (hasta 2 veces).',
    weight: 6,
    unit: 'thunderstroke',
    mods: { areaTargetsAdd: 1 },
  },
  {
    id: 'tech_thunder_stun',
    rarity: 'uncommon',
    name: 'Descarga Paralizante',
    desc: 'El Thunderstroke tiene +15% de aturdir (hasta 2 veces).',
    weight: 5,
    unit: 'thunderstroke',
    mods: { stunChance: 0.15 },
  },
  {
    id: 'tech_mortar_radius',
    rarity: 'uncommon',
    name: 'Ojiva Expandida',
    desc: 'El Mortar explota con +20% de radio (hasta 2 veces).',
    weight: 6,
    minStage: 2,
    unit: 'mortar',
    mods: { areaMul: 1.2 },
  },
  {
    id: 'tech_gauss_crit',
    rarity: 'rare',
    name: 'Munición de Tungsteno',
    desc: 'El Gauss tiene +20% de crítico (hasta 2 veces).',
    weight: 6,
    minStage: 2,
    unit: 'gauss',
    mods: { critChanceAdd: 0.2 },
  },
  {
    id: 'tech_laser_split',
    rarity: 'rare',
    name: 'Láser Dividido',
    desc: 'El Láser dispara +1 rayo simultáneo (hasta 2 veces).',
    weight: 6,
    minStage: 2,
    unit: 'laser',
    mods: { extraCount: 1 },
  },
  {
    id: 'tech_beam_focus',
    rarity: 'rare',
    name: 'Foco Acelerado',
    desc: 'El Beam acelera su ramp de foco +50% (hasta 2 veces).',
    weight: 6,
    unit: 'beam',
    mods: { beamRampPerSecAdd: 0.4 },
  },
  {
    id: 'tech_firewheel_radius',
    rarity: 'uncommon',
    name: 'Barrido Ancho',
    desc: 'La Rueda de Fuego barre +8 px de radio (hasta 2 veces).',
    weight: 5,
    minStage: 2,
    unit: 'firewheel',
    mods: { radiusAdd: 8 },
  },
  {
    id: 'tech_wasps_venom',
    rarity: 'uncommon',
    name: 'Veneno Concentrado',
    desc: 'El veneno de los Mosquitos hace +1 de daño por segundo (hasta 2 veces).',
    weight: 5,
    minStage: 2,
    unit: 'wasps',
    mods: { venomDpsAdd: 1 },
  },
  {
    id: 'tech_forcefield_radius',
    rarity: 'uncommon',
    name: 'Burbuja Expandida',
    desc: 'El Campo de Fuerza gana +10 px de burbuja (hasta 2 veces).',
    weight: 5,
    minStage: 2,
    unit: 'forcefield',
    mods: { radiusAdd: 10 },
  },
  {
    id: 'tech_forcefield_regen',
    rarity: 'rare',
    name: 'Burbuja Regenerativa',
    desc: 'La burbuja del Campo de Fuerza regenera +1,5 HP/s por enemigo atrapado (hasta 2 veces).',
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
