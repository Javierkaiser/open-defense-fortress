// =============================================================================
// cards-doctrine.js - DOCTRINAS de unidad (1.11.0)
// -----------------------------------------------------------------------------
// Cada doctrina es una carta de la RUN dedicada a UNA unidad. Se puede elegir
// DOS veces (CAPS = 2): el primer rango da un efecto chico y el segundo lo
// completa. Cada aplicación sube el nivel de la unidad (hasta MAX_TOWER_LEVEL)
// y su maestría; eso lo aplica el pipeline central de cards.js, no esta tabla.
//
// Los mods usan el MISMO vocabulario de perks/cartas (`unitMods()`), así que
// no hay una segunda implementación de daño, cadencia, área, cráter, etc.
// =============================================================================

import { addCardMods, cardApps } from './perks.js';

function unitOf(game, type) {
  return game?.fortress?.slots?.find((t) => t && t.type === type)
    ?? game?.fortress?.drones?.find((d) => d && d.type === type)
    ?? null;
}

function applyRank(card, game) {
  const unit = unitOf(game, card.unit);
  if (!unit) return false;
  // Si la carta ya alcanzó su tope, `applyCard` no debería llamarnos; este
  // clamp es defensivo para tests que invocan apply() a mano.
  const rank = Math.min(cardApps(unit, card.id), card.ranks.length - 1);
  const def = card.ranks[rank];
  if (!def) return false;
  return addCardMods(unit, def.mods, card.id);
}

/** Helper de declaración: `desc` lista los dos rangos de forma legible. */
function doctrine(id, unit, name, r1, r2) {
  return {
    id,
    rarity: 'uncommon',
    name,
    desc: `Rango 1: ${r1.desc}. Rango 2: ${r2.desc}.`,
    weight: 6,
    unit,
    doctrine: true,
    ranks: [r1, r2],
    apply: (game) => applyRank(DOCTRINE_BY_ID.get(id), game),
  };
}

export const DOCTRINE_CARDS = [
  // Missile (1 doctrina, 2 rangos)
  doctrine(
    'doc_missile_proximity', 'missile', 'Doctrina: Ojiva de Proximidad',
    { desc: '+0,5 de guiado', mods: { homingStrength: 0.5 } },
    { desc: '+10 % de daño y −5 % de recarga', mods: { dmgMul: 1.1, cadMul: 0.95 } },
  ),

  // Beam (1)
  doctrine(
    'doc_beam_lens', 'beam', 'Doctrina: Lente Térmica',
    { desc: '+0,15 de ramp por segundo', mods: { beamRampPerSecAdd: 0.15 } },
    { desc: '+10 % de daño del haz', mods: { dmgMul: 1.1 } },
  ),

  // Thunderstroke (2)
  doctrine(
    'doc_thunder_conductor', 'thunderstroke', 'Doctrina: Conductor',
    { desc: '+0,05 s de aturdimiento', mods: { stunDurationAdd: 0.05 } },
    { desc: '+1 objetivo de área', mods: { areaTargetsAdd: 1 } },
  ),
  doctrine(
    'doc_thunder_lightning_rod', 'thunderstroke', 'Doctrina: Pararrayos',
    { desc: '+10 % de radio de área', mods: { areaMul: 1.1 } },
    { desc: '+10 % de daño', mods: { dmgMul: 1.1 } },
  ),

  // Tesla (3)
  doctrine(
    'doc_tesla_coil', 'tesla', 'Doctrina: Bobina',
    { desc: '+20 px de alcance de salto', mods: { chainRangeAdd: 20 } },
    { desc: '+1 salto de cadena', mods: { extraCount: 1 } },
  ),
  doctrine(
    'doc_tesla_ion', 'tesla', 'Doctrina: Ion',
    { desc: '+5 % de daño eléctrico', mods: { dmgMul: 1.05 } },
    { desc: '+10 % de daño eléctrico', mods: { dmgMul: 1.1 } },
  ),
  doctrine(
    'doc_tesla_capacitor', 'tesla', 'Doctrina: Capacitor',
    { desc: '−5 % de recarga', mods: { cadMul: 0.95 } },
    { desc: '−5 % de recarga adicional', mods: { cadMul: 0.95 } },
  ),

  // Mortar (3)
  doctrine(
    'doc_mortar_shell', 'mortar', 'Doctrina: Obús',
    { desc: '+5 % de radio de explosión', mods: { areaMul: 1.05 } },
    { desc: '+10 % de radio de explosión', mods: { areaMul: 1.1 } },
  ),
  doctrine(
    'doc_mortar_crater', 'mortar', 'Doctrina: Cráter',
    { desc: '+2 de daño por segundo del cráter', mods: { craterDpsAdd: 2 } },
    { desc: '+0,5 s de duración del cráter', mods: { craterTimeAdd: 0.5 } },
  ),
  doctrine(
    'doc_mortar_powder', 'mortar', 'Doctrina: Pólvora',
    { desc: '−5 % de recarga', mods: { cadMul: 0.95 } },
    { desc: '+10 % de daño del impacto', mods: { dmgMul: 1.1 } },
  ),

  // Gauss (3)
  doctrine(
    'doc_gauss_rail', 'gauss', 'Doctrina: Riel',
    { desc: '+5 % de crítico', mods: { critChanceAdd: 0.05 } },
    { desc: '+10 % de daño', mods: { dmgMul: 1.1 } },
  ),
  doctrine(
    'doc_gauss_tungsten', 'gauss', 'Doctrina: Tungsteno',
    { desc: '+10 % de daño', mods: { dmgMul: 1.1 } },
    { desc: '+5 % de crítico', mods: { critChanceAdd: 0.05 } },
  ),
  doctrine(
    'doc_gauss_cannon', 'gauss', 'Doctrina: Cañón',
    { desc: '−5 % de recarga', mods: { cadMul: 0.95 } },
    { desc: '+10 % de daño', mods: { dmgMul: 1.1 } },
  ),

  // Láser (3)
  doctrine(
    'doc_laser_focus', 'laser', 'Doctrina: Foco',
    { desc: '+0,2 s de duración del rayo', mods: { laserDurationAdd: 0.2 } },
    { desc: '+10 % de daño', mods: { dmgMul: 1.1 } },
  ),
  doctrine(
    'doc_laser_prism', 'laser', 'Doctrina: Prisma',
    { desc: '+5 % de daño', mods: { dmgMul: 1.05 } },
    { desc: '+0,2 s de duración del rayo', mods: { laserDurationAdd: 0.2 } },
  ),
  doctrine(
    'doc_laser_coolant', 'laser', 'Doctrina: Refrigerante',
    { desc: '−5 % de recarga', mods: { cadMul: 0.95 } },
    { desc: '+5 % de daño', mods: { dmgMul: 1.05 } },
  ),

  // Rueda de Fuego (3)
  doctrine(
    'doc_firewheel_flame', 'firewheel', 'Doctrina: Llama',
    { desc: '+1 de daño por segundo de burn', mods: { burnDpsAdd: 1 } },
    { desc: '+0,3 s de burn', mods: { burnTimeAdd: 0.3 } },
  ),
  doctrine(
    'doc_firewheel_orbit', 'firewheel', 'Doctrina: Órbita',
    { desc: '+3 de DPS del barrido', mods: { dpsAdd: 3 } },
    { desc: '+3 de DPS del barrido', mods: { dpsAdd: 3 } },
  ),
  doctrine(
    'doc_firewheel_fuel', 'firewheel', 'Doctrina: Combustible',
    { desc: '+2 de DPS del barrido', mods: { dpsAdd: 2 } },
    { desc: '+2 de daño por segundo de burn', mods: { burnDpsAdd: 2 } },
  ),

  // Mosquitos (2)
  doctrine(
    'doc_wasps_sting', 'wasps', 'Doctrina: Aguijón',
    { desc: '+1 de daño por segundo de veneno', mods: { venomDpsAdd: 1 } },
    { desc: '+0,3 s de veneno', mods: { venomTimeAdd: 0.3 } },
  ),
  doctrine(
    'doc_wasps_swarm', 'wasps', 'Doctrina: Enjambre',
    { desc: '+10 % de daño del enjambre', mods: { dmgMul: 1.1 } },
    { desc: '+1 de daño por segundo de veneno', mods: { venomDpsAdd: 1 } },
  ),

  // Campo de Fuerza (2)
  doctrine(
    'doc_forcefield_bubble', 'forcefield', 'Doctrina: Burbuja',
    { desc: '+3 px de radio de burbuja', mods: { radiusAdd: 3 } },
    { desc: '+3 px de radio de burbuja', mods: { radiusAdd: 3 } },
  ),
  doctrine(
    'doc_forcefield_thorns', 'forcefield', 'Doctrina: Espinas',
    { desc: '+1,5 de daño por segundo de espinas', mods: { thornDps: 1.5 } },
    { desc: '+1,5 HP/s de regeneración por enemigo', mods: { bubbleRegen: 1.5 } },
  ),
];

export const DOCTRINE_BY_ID = new Map(DOCTRINE_CARDS.map((c) => [c.id, c]));
