// =============================================================================
// cards-legendary.js - CARTAS LEGENDARIAS por unidad (1.11.0)
// -----------------------------------------------------------------------------
// No viven en el catálogo normal: cada unidad posee TRES y se ofrecen en una
// elección especial al llegar a 5/10/15 de maestría. Una vez elegida, la carta
// sale del pool de esa unidad para el resto de la run.
//
// El efecto se expresa con el MISMO canal de mods que perks/técnicas
// (`addCardMods` → `unitMods`). Las claves nuevas (`supSplashFrac`,
// `execEvery`, `beamChain`, `extraWasps`, etc.) se consumen en el punto de
// combate correspondiente, no en una segunda lógica paralela.
// =============================================================================

import { addCardMods } from './perks.js';

function unitOf(game, type) {
  return game?.fortress?.slots?.find((t) => t && t.type === type)
    ?? game?.fortress?.drones?.find((d) => d && d.type === type)
    ?? null;
}

function legendary(id, unit, name, desc, mods) {
  return {
    id,
    rarity: 'legendary',
    name,
    desc,
    weight: 0,
    unit,
    legendary: true,
    apply: (game) => {
      const target = unitOf(game, unit);
      if (!target) return false;
      const ok = addCardMods(target, mods, id);
      // Cartas que cambian el TAMAÑO de un enjambre necesitan reconstruirlo.
      target.rebuildSwarm?.();
      return ok;
    },
  };
}

export const LEGENDARY_CARDS = [
  // ---------------- Guardian: supresión, ráfaga y crítico ----------------
  legendary('leg_guard_focus', 'guardian', 'Foco Resonante',
    'El estallido de Supresión también golpea a 3 enemigos a 70 px (60 % del daño del estallido) y les deja 1 carga de foco.',
    { supSplashFrac: 0.6, supSplashRadius: 70, supSplashTargets: 3 }),
  legendary('leg_guard_exec', 'guardian', 'Bastión Ejecutor',
    'Cada 5.º proyectil del Guardian hace 250 % de daño y perfora 3 enemigos.',
    { execEvery: 5, execDmgMul: 2.5, execPierce: 3 }),
  legendary('leg_guard_steel', 'guardian', 'Guardia de Acero',
    '+15 % de crítico; la Supresión acumula 1 carga más (de 3 a 4) y el estallido pasa del 45 % al 60 % del golpe.',
    { critChanceAdd: 0.15, supMaxStacksAdd: 1, supBurstFracAdd: 0.15 }),

  // ---------------- Missile: remate, salva y antimateria ----------------
  legendary('leg_missile_hunter', 'missile', 'Cazador de Titanes',
    '+4 puntos porcentuales al umbral de remate (6 % → 10 % sin perks) y +10 % de daño del Misil.',
    { executeThreshold: 0.04, dmgMul: 1.1 }),
  legendary('leg_missile_salvo', 'missile', 'Salva Saturada',
    '+1 misil por salva y +20 % de radio de explosión.',
    { extraCount: 1, areaMul: 1.2 }),
  legendary('leg_missile_antimatter', 'missile', 'Ojiva de Antimateria',
    '+30 % de daño, +30 % de radio y el splash pasa del 50 % al 100 % del daño.',
    { dmgMul: 1.3, splashRMul: 1.3, splashFracAdd: 0.5 }),

  // ---------------- Beam: fusión, cadena y sostén ----------------
  legendary('leg_beam_chain', 'beam', 'Fusión en Cadena',
    'Con 3 cargas de fusión, el haz salta a un segundo enemigo a 130 px con el 60 % del daño; el foco del blanco principal no se reinicia.',
    { beamChain: 1 }),
  legendary('leg_beam_supernova', 'beam', 'Supernova Térmica',
    '+0,4 de foco por segundo (de 0,8 a 1,2) y +20 % de daño: el haz llega al tope de ×4,5 mucho antes.',
    { beamRampPerSecAdd: 0.4, dmgMul: 1.2 }),
  legendary('leg_beam_devour', 'beam', 'Haz Devorador',
    '+2 % de robo de vida y +15 % de daño del haz.',
    { lifesteal: 0.02, dmgMul: 1.15 }),

  // ---------------- Thunderstroke: área y control ----------------
  legendary('leg_thunder_storm', 'thunderstroke', 'Ojo del Ciclón',
    '+2 objetivos de área, +20 % de radio y +0,1 s de aturdimiento.',
    { areaTargetsAdd: 2, areaMul: 1.2, stunDurationAdd: 0.1 }),
  legendary('leg_thunder_final', 'thunderstroke', 'Juicio Severo',
    '+30 % de daño y +0,15 s de aturdimiento: el rayo castiga a los marcados.',
    { dmgMul: 1.3, stunDurationAdd: 0.15 }),
  legendary('leg_thunder_cataclysm', 'thunderstroke', 'Tormenta Cataclísmica',
    '+1 rayo de área, +2 objetivos y +20 % de daño.',
    { extraCount: 1, areaTargetsAdd: 2, dmgMul: 1.2 }),

  // ---------------- Tesla: cadena e ionización ----------------
  legendary('leg_tesla_chain', 'tesla', 'Reacción en Cadena',
    '+2 saltos de cadena y +40 px de alcance de salto.',
    { extraCount: 2, chainRangeAdd: 40 }),
  legendary('leg_tesla_ion', 'tesla', 'Ionización Crítica',
    '+25 % de daño eléctrico y +60 px de alcance de salto.',
    { dmgMul: 1.25, chainRangeAdd: 60 }),
  legendary('leg_tesla_storm', 'tesla', 'Bobina de Tormenta',
    '+1 salto, +1 bifurcación y +15 % de daño.',
    { extraCount: 1, chainFork: 1, dmgMul: 1.15 }),

  // ---------------- Mortar: cráter y bombardeo ----------------
  legendary('leg_mortar_land', 'mortar', 'Tierra Arrasada',
    '+30 % de radio, +6 dps de cráter y +2 s de duración.',
    { areaMul: 1.3, craterDpsAdd: 6, craterTimeAdd: 2 }),
  legendary('leg_mortar_barrage', 'mortar', 'Bombardeo Pesado',
    '−20 % de recarga y +20 % de radio de explosión: más obuses y más área.',
    { cadMul: 0.8, areaMul: 1.2 }),
  legendary('leg_mortar_magma', 'mortar', 'Núcleo de Magma',
    '+10 dps de cráter, +3 s de duración y +20 % de radio.',
    { craterDpsAdd: 10, craterTimeAdd: 3, areaMul: 1.2 }),

  // ---------------- Gauss: riel y asedio ----------------
  legendary('leg_gauss_rail', 'gauss', 'Riel de Antimateria',
    '+40 % de daño y +10 % de crítico.',
    { dmgMul: 1.4, critChanceAdd: 0.1 }),
  legendary('leg_gauss_siege', 'gauss', 'Cañón de Asedio',
    '−15 % de recarga y +30 % de daño.',
    { cadMul: 0.85, dmgMul: 1.3 }),
  legendary('leg_gauss_mark', 'gauss', 'Riel Crítico',
    '+20 % de daño, +10 % de crítico y críticos ×3.',
    { dmgMul: 1.2, critChanceAdd: 0.1, critDmgMul: 3 }),

  // ---------------- Láser: corte y rejilla ----------------
  legendary('leg_laser_deep', 'laser', 'Corte Profundo',
    '+1,5 s de duración del rayo y +20 % de daño.',
    { laserDurationAdd: 1.5, dmgMul: 1.2 }),
  legendary('leg_laser_grid', 'laser', 'Rejilla de Corte',
    '+1 rayo simultáneo y +10 % de daño.',
    { extraCount: 1, dmgMul: 1.1 }),
  legendary('leg_laser_fission', 'laser', 'Fisión',
    '+1 s de duración y +30 % de daño.',
    { laserDurationAdd: 1, dmgMul: 1.3 }),

  // ---------------- Rueda de Fuego: burn y combustión ----------------
  legendary('leg_firewheel_trail', 'firewheel', 'Combustión Profunda',
    '+6 dps de burn, +2 s de burn y +5 dps del barrido.',
    { burnDpsAdd: 6, burnTimeAdd: 2, dpsAdd: 5 }),
  legendary('leg_firewheel_chain', 'firewheel', 'Combustión en Cadena',
    '50 % de explotar al matar: 60 de daño en un radio de 80.',
    { explodeOnKillChance: 0.5, explodeOnKillDmg: 60, explodeOnKillRadius: 80 }),
  legendary('leg_firewheel_spontaneous', 'firewheel', 'Combustión Espontánea',
    'Si no hay enemigos a menos de 150 px, cada 0,9 s tiene 40 % de apagarse 0,22 s y reencenderse sobre el enemigo más avanzado a 230 px o más. Recarga 4 s.',
    { spontaneousRelight: 1 }),

  // ---------------- Mosquitos: plaga y enjambre ----------------
  legendary('leg_wasps_plague', 'wasps', 'Plaga',
    '+2 dps de veneno, +1 s de veneno y +15 % de daño del enjambre.',
    { venomDpsAdd: 2, venomTimeAdd: 1, dmgMul: 1.15 }),
  legendary('leg_wasps_queen', 'wasps', 'Reina del Enjambre',
    '+1 mosquito, +1 dps de veneno y +10 % de daño.',
    { extraWasps: 1, venomDpsAdd: 1, dmgMul: 1.1 }),
  legendary('leg_wasps_peste', 'wasps', 'Peste Necrótica',
    '+3 dps de veneno, +1,5 s de veneno y +20 % de daño.',
    { venomDpsAdd: 3, venomTimeAdd: 1.5, dmgMul: 1.2 }),

  // ---------------- Campo de Fuerza: control y espinas ----------------
  legendary('leg_ff_gravity', 'forcefield', 'Burbuja Densa',
    '+15 px de radio, +10 % de slow y +1 HP/s de regeneración por enemigo.',
    { radiusAdd: 15, slowOnHit: 0.1, bubbleRegen: 1 }),
  legendary('leg_ff_thorns', 'forcefield', 'Campo de Espinas',
    '+15 dps de espinas y +1,5 HP/s de regeneración por enemigo.',
    { thornDps: 15, bubbleRegen: 1.5 }),
  legendary('leg_ff_prism', 'forcefield', 'Barrera Prismática',
    '+10 px de radio, +5 % de slow y +2 HP/s de regeneración por enemigo.',
    { radiusAdd: 10, slowOnHit: 0.05, bubbleRegen: 2 }),
];

export const LEGENDARY_BY_UNIT = Object.freeze(
  LEGENDARY_CARDS.reduce((acc, card) => {
    (acc[card.unit] ??= []).push(card);
    return acc;
  }, {}),
);

export const LEGENDARY_BY_ID = new Map(LEGENDARY_CARDS.map((c) => [c.id, c]));
