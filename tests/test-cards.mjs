// tests/test-cards.mjs — dev-7 fase 9 + fixes dev-7 (CAPS, arsenal, pesos)
// Cubre cards.js: catálogo sin duplicados, elegibilidad dinámica y
// rollOffer/applyCard con rng inyectable. Incluye un test de REGRESIÓN
// explícito para el bug de la sesión de balance: "Sensores Ampliados"
// (detect_up) podía ofrecerse con cero efecto.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATALOG, CAPS, CARD_OFFER_COUNT, isCardEligible, isRelevant, rollOffer,
  applyCard, findTower, findDrone, findUnit, dmgSynergyText, unlockWeightMul,
} from '../js/cards.js';
import { unitMods, DRONES } from '../js/towers.js';

// dev-7 fase 49: la matriz de tipos (la sinonergia se calcula con ella).
import {
  DAMAGE_TYPES, DAMAGE_TYPE_IDS, ENEMY_FAMILY_IDS, dmgMultiplier,
} from '../js/damagetypes.js';
import { Fortress } from '../js/player.js';
import { saveMeta } from '../js/meta.js';

/**
 * Fija el meta (perks elegidos) para poder probar cartas que dependen
 * de un perk concreto (dev-7 fase 31: "Burbuja Reforzada" exige el perk
 * de espinas del Campo de Fuerza, si no la carta sería inerte).
 */
function setMeta({ levels = {}, perks = {} } = {}) {
  const data = new Map();
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  saveMeta({ levels, perkChoices: perks }, storage);
  return storage;
}

/** Fortress/game mínimos, duck-typed (mismo contrato que usa cards.js). */
function makeGame({ stageId = 1, towers = [] } = {}) {
  const slots = Array(5).fill(null);   // fase 61: 5 slots en una fila
  const fortress = {
    slots, pierce: 0, detectMul: 1, detectApps: 0,
    hp: 1000, maxHp: 1000, drones: [],
  };
  towers.forEach((type, i) => { slots[i] = { type, level: 1, dmgMul: 1, cadMul: 1 }; });
  return { stageId, fortress };
}

/** Game con la Fortress REAL (player.js) — para drones y contador de ultimate. */
function makeRealGame({ stageId = 1 } = {}) {
  const game = { stageId, engine: { emit() {}, addEntity() {} }, audio: { sfx() {} } };
  game.fortress = new Fortress(game);
  return game;
}

/** rng determinista (mismo seed → misma oferta). */
function rngFactory(seed = 42) {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

/**
 * Las cartas REPETIBLES del catálogo (las que se pueden volver a ofrecer):
 * todas tienen que tener tope en CAPS (la tabla anti-stack infinito).
 * Las de un solo uso (desbloqueos + Black Hole) o limitadas por estado
 * (Cañón de Ráfaga → Lv.5) quedan afuera.
 */
const REPEATABLE_CARDS = [
  'dmg_all', 'dmg_guard',
  'dmg_type_ballistic', 'dmg_type_light', 'dmg_type_blast',
  'dmg_type_electric', 'dmg_type_drone',
  'dmg_missile', 'dmg_beam', 'dmg_thunder', 'dmg_tesla', 'dmg_mortar', 'dmg_gauss',
  'dmg_laser', 'dmg_firewheel', 'dmg_wasps', 'dmg_forcefield',
  'cadence_up', 'rapid_bullets', 'detect_up', 'pierce_up',
  'xp_boost', 'score_gain', 'streak_shield', 'ult_charge', 'ult_power',
  'repair_500', 'armor_plate',
  // dev-7 fase 30: "Nido Ampliado" (+1 avispa del Dron Avispas).
  'swarm_grow',
  // dev-7 fase 51: las CARTAS DE TÉCNICA.
  'tech_pierce', 'tech_bounce', 'tech_explode', 'tech_slow',
  'tech_crit', 'tech_lifesteal', 'tech_stun_missile', 'tech_exec_missile',
  // fase 74: técnicas para el resto del arsenal.
  'tech_missile_salvo', 'tech_tesla_jump', 'tech_thunder_area',
  'tech_thunder_stun', 'tech_mortar_radius', 'tech_gauss_crit',
  'tech_laser_split', 'tech_beam_focus', 'tech_firewheel_radius',
  'tech_wasps_venom', 'tech_forcefield_radius', 'tech_forcefield_regen',
  // fase 74: combos y Black Hole (tope 1).
  'combo_singularity', 'combo_chain_reactor', 'combo_light_prism',
  'combo_absolute_zero', 'combo_fracture', 'combo_glacial_wave',
  'combo_harvest', 'combo_blood_pact', 'combo_transfusion',
  'combo_rail_mark', 'combo_swarm_link', 'combo_judgment',
  'combo_conductor', 'combo_shared_pierce',
  'bh_horizon', 'bh_collapse',
  // dev-7 fase 50: las 4 cartas de CAZA DE FAMILIA.
  'hunt_rock', 'hunt_crystal', 'hunt_spore', 'hunt_virus',
];

/** Cartas de daño exclusivo: una por unidad (torre o dron del arsenal). */
const EXCLUSIVE_DMG = [
  { id: 'dmg_missile', unit: 'missile', kind: 'tower' },
  { id: 'dmg_beam', unit: 'beam', kind: 'tower' },
  { id: 'dmg_thunder', unit: 'thunderstroke', kind: 'tower' },
  { id: 'dmg_tesla', unit: 'tesla', kind: 'tower' },
  { id: 'dmg_mortar', unit: 'mortar', kind: 'tower' },
  { id: 'dmg_gauss', unit: 'gauss', kind: 'tower' },
  { id: 'dmg_laser', unit: 'laser', kind: 'tower' },
  { id: 'dmg_firewheel', unit: 'firewheel', kind: 'drone' },
  { id: 'dmg_wasps', unit: 'wasps', kind: 'drone' },
  { id: 'dmg_forcefield', unit: 'forcefield', kind: 'drone' },
];

/** Estado de run avanzada: todo comprado y TODAS las repetibles topadas. */
function agotarPool(game) {
  const f = game.fortress;
  for (const t of ['guardian', 'missile', 'thunderstroke', 'tesla', 'beam', 'mortar', 'gauss', 'laser']) {
    f.addTower(t);
  }
  f.addDrone('firewheel');
  f.blackHoleUnlocked = true;
  f.blackHoleCharge = 1;
  toparTodo(f);
  return game;
}

test('CATALOG: sin ids duplicados', () => {
  const ids = CATALOG.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('CATALOG: toda carta tiene apply() y weight > 0', () => {
  for (const c of CATALOG) {
    assert.equal(typeof c.apply, 'function', `${c.id} sin apply()`);
    assert.ok(c.weight > 0, `${c.id} con weight <= 0`);
  }
});

test('CATALOG: 81 cartas (69 repetibles + 12 de un solo uso)', () => {
  // fase 74: +22 cartas (5 de tipo + 12 técnicas + 3 combos + 2 Black Hole).
  // fase 74.2: +11 combos de frío/lifesteal/tipo-mecánica.
  assert.equal(CATALOG.length, 81);
  assert.equal(REPEATABLE_CARDS.length, 69);
});

test('CAPS: TODA carta repetible del catálogo tiene tope (anti-stack infinito)', () => {
  // Regresión: `ult_charge` y `pierce_up` no estaban en la tabla → se
  // ofrecían en cada level-up de cada run, para siempre.
  for (const id of REPEATABLE_CARDS) {
    assert.notEqual(CAPS[id], undefined, `${id} sin tope en CAPS`);
    assert.ok(CAPS[id] >= 1, `${id} con tope inválido`);
    assert.ok(CATALOG.some((c) => c.id === id), `${id} no está en el catálogo`);
  }
  // Ningún tope puede apuntar a una carta inexistente.
  for (const id of Object.keys(CAPS)) {
    assert.ok(CATALOG.some((c) => c.id === id), `CAPS tiene ${id}, que no existe`);
  }
});

test('fase 75: Apagón saca del pool las cartas de ultimate/Black Hole', () => {
  const game = makeGame();
  game.runMods = { noUlt: true };
  const ids = ['ult_charge', 'ult_power', 'black_hole', 'bh_horizon', 'bh_collapse',
    'combo_singularity', 'combo_blood_pact'];
  for (const id of ids) {
    const card = CATALOG.find((c) => c.id === id);
    assert.equal(isRelevant(card, game), false, `${id} no debe ofrecerse con Apagón`);
  }
  assert.equal(isRelevant(CATALOG.find((c) => c.id === 'dmg_all'), game), true,
    'una carta normal sigue siendo relevante');
});

test('fase 75: los combos y BH no se apilan más allá de CAPS', () => {
  const game = makeRealGame({ stageId: 5 });
  game.fortress.addTower('guardian');
  game.fortress.addDrone('firewheel');
  const swarm = CATALOG.find((c) => c.id === 'combo_swarm_link');
  assert.ok(applyCard(swarm, game));
  const mul = game.fortress.drones[0].dmgMul;
  assert.equal(applyCard(swarm, game), null, 'la segunda aplicación debe rechazarse');
  assert.equal(game.fortress.drones[0].dmgMul, mul, 'y no debe volver a multiplicar');

  game.fortress.blackHoleUnlocked = true;
  const horizon = CATALOG.find((c) => c.id === 'bh_horizon');
  assert.ok(applyCard(horizon, game));
  const duration = game.fortress.blackHoleMods.durationAdd;
  assert.equal(applyCard(horizon, game), null);
  assert.equal(game.fortress.blackHoleMods.durationAdd, duration);
});

test('detect_up: NO elegible sin Beam/Tesla (regresión)', () => {
  // Bug real: esta carta escala detectMul, pero Guardian/Missile/Mortar/
  // Gauss/Láser tienen rango infinito desde v4 4a y el Thunderstroke desde
  // la fase 73 — la carta no hacía nada si el jugador solo tenía esas.
  // Viola la regla propia del catálogo ("una carta inútil nunca entra al
  // pool").
  const card = CATALOG.find((c) => c.id === 'detect_up');
  const gameSinFinitas = makeGame({ towers: ['guardian', 'missile', 'mortar'] });
  assert.equal(isCardEligible(card, gameSinFinitas), false);
});

test('detect_up: SÍ elegible con Beam o Tesla (el Thunderstroke ya es global)', () => {
  const card = CATALOG.find((c) => c.id === 'detect_up');
  for (const type of ['beam', 'tesla']) {
    const game = makeGame({ towers: ['guardian', type] });
    assert.equal(isCardEligible(card, game), true, `debería ser elegible con ${type}`);
  }
  // fase 73: el Thunderstroke pasó a alcance global; la carta no le hace nada.
  const soloThunder = makeGame({ towers: ['guardian', 'thunderstroke'] });
  assert.equal(isCardEligible(card, soloThunder), false,
    'con solo Thunderstroke la carta sería inútil');
});

test('bullets_5: NO elegible sin Guardian o con Guardian a tope', () => {
  const card = CATALOG.find((c) => c.id === 'bullets_5');
  const sinGuardian = makeGame({ towers: ['missile'] });
  assert.equal(isCardEligible(card, sinGuardian), false);
  const guardianTope = makeGame({ towers: ['guardian'] });
  guardianTope.fortress.slots[0].level = 5;
  assert.equal(isCardEligible(card, guardianTope), false);
});

test('unlock_*: no elegible si la torre ya está colocada', () => {
  const card = CATALOG.find((c) => c.id === 'unlock_beam');
  const yaColocada = makeGame({ towers: ['guardian', 'beam'] });
  assert.equal(isCardEligible(card, yaColocada), false);
});

test('rollOffer: 3 cartas, sin ids repetidos, todas elegibles', () => {
  const game = makeGame({ towers: ['guardian'] });
  const offer = rollOffer(game, rngFactory(42));
  assert.equal(offer.length, CARD_OFFER_COUNT);
  const ids = offer.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  // Con pool suficiente, TODO lo que se ofrece es elegible.
  for (const c of offer) assert.equal(isCardEligible(c, game), true);
});

test('rollOffer: determinista con el mismo rng (mismo seed → misma oferta)', () => {
  const a = rollOffer(makeGame({ towers: ['guardian'] }), rngFactory(7));
  const b = rollOffer(makeGame({ towers: ['guardian'] }), rngFactory(7));
  assert.deepEqual(a.map((c) => c.id), b.map((c) => c.id));
});

test('fase 69 (Censura): runMods.offerCount recorta la oferta (3 → 2 → 1)', () => {
  const game = makeGame({ towers: ['guardian'] });
  assert.equal(rollOffer(game, rngFactory(11)).length, CARD_OFFER_COUNT,
    'sin runMods la oferta sigue siendo de 3');

  game.runMods = { offerCount: 2 };
  const dos = rollOffer(game, rngFactory(11));
  assert.equal(dos.length, 2, 'Censura 1 deja 2 cartas');
  assert.equal(new Set(dos.map((c) => c.id)).size, 2, 'sin repetidas');

  game.runMods = { offerCount: 1 };
  assert.equal(rollOffer(game, rngFactory(11)).length, 1, 'Censura 2 deja 1 carta');
});

test('fase 69 (Censura): el RELLENO (fillOffer) también respeta offerCount', () => {
  // Pool agotado: rollOffer cae en fillOffer. La oferta recortada no puede
  // "rellenarse" hasta 3 — el modal sigue pidiendo `offerCount` cartas.
  const game = agotarPool(makeRealGame({ stageId: 5 }));
  game.fortress.ultCharge = 1;
  game.fortress.ultReady = true;
  assert.equal(CATALOG.filter((c) => isCardEligible(c, game)).length, 0,
    'el estado de prueba debe agotar el pool');
  game.runMods = { offerCount: 2 };
  const offer = rollOffer(game, rngFactory(3));
  assert.equal(offer.length, 2, 'el relleno respeta el recorte del Protocolo');
});

test('applyCard: pierce_up suma 1 a fortress.pierce', () => {
  const game = makeGame({ towers: ['guardian'] });
  const card = CATALOG.find((c) => c.id === 'pierce_up');
  applyCard(card, game);
  assert.equal(game.fortress.pierce, 1);
  applyCard(card, game);
  assert.equal(game.fortress.pierce, 2);
});

test('applyCard: unlock_missile coloca la torre (findTower la encuentra)', () => {
  const game = makeGame({ towers: ['guardian'] });
  game.fortress.addTower = (type) => {
    const free = game.fortress.slots.findIndex((s) => !s);
    game.fortress.slots[free] = { type, level: 1 };
  };
  const card = CATALOG.find((c) => c.id === 'unlock_missile');
  applyCard(card, game);
  assert.ok(findTower(game, 'missile'));
});

// ---------- dev-7 fase 12: cartas exclusivas por torre + Black Hole gateado ----------

test('cartas de daño exclusivas: NO elegibles sin esa torre puesta', () => {
  const game = makeGame({ towers: ['guardian'] });
  for (const id of ['dmg_missile', 'dmg_beam', 'dmg_thunder', 'dmg_tesla', 'dmg_mortar', 'dmg_gauss']) {
    const card = CATALOG.find((c) => c.id === id);
    assert.equal(isCardEligible(card, game), false, `${id} debería ser inelegible sin su torre`);
  }
});

test('cartas de daño exclusivas: elegibles y aplican solo a SU torre', () => {
  const game = makeGame({ towers: ['guardian', 'missile', 'beam'] });
  const dmgMissile = CATALOG.find((c) => c.id === 'dmg_missile');
  assert.equal(isCardEligible(dmgMissile, game), true);
  const missile = findTower(game, 'missile');
  const beam = findTower(game, 'beam');
  const beamDmgBefore = beam.dmgMul;
  applyCard(dmgMissile, game);
  assert.equal(missile.dmgMul, 1.6);
  assert.equal(beam.dmgMul, beamDmgBefore, 'no debería tocar el dmgMul de otra torre');
});

test('cartas de daño exclusivas: tope ×2 aplicaciones (CAPS)', () => {
  const game = makeGame({ towers: ['guardian', 'gauss'] });
  const card = CATALOG.find((c) => c.id === 'dmg_gauss');
  applyCard(card, game);
  applyCard(card, game);
  applyCard(card, game); // 3ra: no debería sumar más
  const t = findTower(game, 'gauss');
  assert.ok(Math.abs(t.dmgMul - 1.6 * 1.6) < 1e-9);
});

test('fase 26: las cartas de daño exclusivas salen del pool al alcanzar su tope', () => {
  // Bug: las 6 cartas exclusivas se auto-limitaban dentro de su `apply`
  // (comparando `exclusiveDmgApps` contra su CAP) pero `appsOf` no las
  // contaba. Resultado: con el tope ya alcanzado seguían siendo ELEGIBLES,
  // entraban a la oferta y al elegirlas no hacían NADA — una carta inútil
  // en el pool, justo lo que la regla de elegibilidad prohíbe.
  const game = makeGame({ towers: ['guardian', 'gauss'] });
  const card = CATALOG.find((c) => c.id === 'dmg_gauss');
  assert.equal(isCardEligible(card, game), true, 'al principio debe ser elegible');
  applyCard(card, game);
  assert.equal(isCardEligible(card, game), true, 'con 1 de 2 sigue siendo elegible');
  applyCard(card, game);
  assert.equal(isCardEligible(card, game), false,
    'con el tope (2) alcanzado debe SALIR del pool de oferta');
});

test('fase 26: armor_plate tiene tope (la base no puede ser inmatable por leaks)', () => {
  // Sin tope, `armor_plate` sumaba +800 de HP máximo por cada aparición
  // (una run larga llevaba la base de 3 000 a 15 000) y, con el daño de
  // leak topado a 50 (player.js LEAK_DMG_CAP), la base quedaba
  // prácticamente inmatable — anulando el cambio de balance v7.
  // dev-7: recalibrado a +600 y UNA sola vez (+20% de la base).
  const game = makeGame({ towers: ['guardian'] });
  const card = CATALOG.find((c) => c.id === 'armor_plate');
  const maxHp0 = game.fortress.maxHp;
  applyCard(card, game);
  applyCard(card, game);
  applyCard(card, game); // 2da: no debe sumar más
  assert.equal(game.fortress.maxHp, maxHp0 + 600, 'el blindaje es de una sola vez (+600)');
  assert.equal(isCardEligible(card, game), false, 'alcanzado el tope sale del pool');
});

test('fase 26: repair_500 tiene tope (3 reparaciones)', () => {
  const game = makeGame({ towers: ['guardian'] });
  const card = CATALOG.find((c) => c.id === 'repair_500');
  game.fortress.hp = 100;
  game.fortress.maxHp = 100000;
  for (let i = 0; i < 5; i++) applyCard(card, game);
  assert.equal(game.fortress.hp, 100 + 500 * 3, 'la reparación se topa en 3');
  assert.equal(isCardEligible(card, game), false, 'alcanzado el tope sale del pool');
});

test('Black Hole: NO elegible una vez ya desbloqueado (no se repite)', () => {
  const game = makeGame({ towers: ['guardian'], stageId: 2 });
  const card = CATALOG.find((c) => c.id === 'black_hole');
  assert.equal(isCardEligible(card, game), true);
  game.fortress.blackHoleUnlocked = true;
  assert.equal(isCardEligible(card, game), false);
});

test('Black Hole: applyCard desbloquea Y deja el medidor listo de regalo', () => {
  const game = makeGame({ towers: ['guardian'], stageId: 2 });
  const card = CATALOG.find((c) => c.id === 'black_hole');
  assert.equal(game.fortress.blackHoleUnlocked, undefined);
  applyCard(card, game);
  assert.equal(game.fortress.blackHoleUnlocked, true);
  assert.equal(game.fortress.blackHoleCharge, 1);
  assert.equal(game.fortress.bhReady, true);
});

// =====================================================================
// dev-7 (fix de catálogo): topes que faltaban, arsenal sin cartas
// exclusivas, pesos recalibrados y oferta nunca corta.
// =====================================================================

test('pierce_up: tiene tope (3) y sale del pool al alcanzarlo', () => {
  // Antes no estaba en CAPS → se ofrecía en cada level-up y el Guardian
  // atravesaba enemigos sin límite.
  const game = makeGame({ towers: ['guardian'] });
  const card = CATALOG.find((c) => c.id === 'pierce_up');
  assert.equal(CAPS.pierce_up, 3);
  for (let i = 0; i < 3; i++) {
    assert.equal(isCardEligible(card, game), true, `debería ser elegible en la repetición ${i + 1}`);
    applyCard(card, game);
  }
  assert.equal(game.fortress.pierce, 3, '3 apilamientos = 3 atravesamientos');
  applyCard(card, game); // 4ta: ya no hace nada
  assert.equal(game.fortress.pierce, 3);
  assert.equal(isCardEligible(card, game), false, 'alcanzado el tope sale del pool');
});

test('ult_charge: se ofrece con el medidor a medias y NO con el medidor lleno', () => {
  // Regresión: la condición era `f.ultReady` (medidor LLENO) — pero
  // `chargeUltimate()` no hace nada si `ultCharge >= 1` (justo cuando
  // `ultReady` es true): la carta se ofrecía exactamente cuando no podía
  // hacer nada, y en el 0.9 desperdiciaba 0.25 de carga.
  const game = makeRealGame();
  const card = CATALOG.find((c) => c.id === 'ult_charge');
  game.fortress.ultCharge = 0.9;
  game.fortress.ultReady = false;
  assert.equal(isCardEligible(card, game), true, 'con el medidor a medias DEBE ofrecerse');
  game.fortress.ultCharge = 1;
  game.fortress.ultReady = true;
  assert.equal(isCardEligible(card, game), false, 'con el medidor lleno NO debe ofrecerse');
});

test('ult_charge: tope 1 — una sola recarga extra por partida', () => {
  const game = makeRealGame();
  const card = CATALOG.find((c) => c.id === 'ult_charge');
  assert.equal(CAPS.ult_charge, 1);
  assert.equal(isCardEligible(card, game), true);
  applyCard(card, game);
  assert.ok(game.fortress.ultCharge > 0, 'debe sumar carga al medidor');
  assert.equal(isCardEligible(card, game), false, 'alcanzado el tope sale del pool');
  const carga = game.fortress.ultCharge;
  applyCard(card, game); // 2da: ya no hace nada
  assert.equal(game.fortress.ultCharge, carga);
});

test('arsenal: las 4 cartas nuevas de daño exclusivo son elegibles SOLO con su unidad', () => {
  // Láser (torre) + los 3 drones: cada una exige POSEER la unidad.
  const vacio = makeRealGame({ stageId: 2 });
  for (const id of ['dmg_laser', 'dmg_firewheel', 'dmg_wasps', 'dmg_forcefield']) {
    const card = CATALOG.find((c) => c.id === id);
    assert.equal(isCardEligible(card, vacio), false, `${id} sin la unidad no debe ofrecerse`);
  }
  // Con la unidad puesta: elegibles. fase 61: el cupo de drones es 1, así
  // que cada dron se prueba en SU propia partida (dos drones a la vez ya
  // no es un estado posible).
  const conUnidades = makeRealGame({ stageId: 2 });
  conUnidades.fortress.addTower('laser');
  conUnidades.fortress.addDrone('firewheel');
  assert.equal(isCardEligible(CATALOG.find((c) => c.id === 'dmg_laser'), conUnidades), true);
  assert.equal(isCardEligible(CATALOG.find((c) => c.id === 'dmg_firewheel'), conUnidades), true);
  assert.equal(isCardEligible(CATALOG.find((c) => c.id === 'dmg_wasps'), conUnidades), false,
    'con el cupo de drones lleno, la carta de OTRO dron no debe ofrecerse');
  const conAvispas = makeRealGame({ stageId: 2 });
  conAvispas.fortress.addDrone('wasps');
  assert.equal(isCardEligible(CATALOG.find((c) => c.id === 'dmg_wasps'), conAvispas), true);
  // Sin un dron Campo de Fuerza, su carta no entra al pool.
  assert.equal(isCardEligible(CATALOG.find((c) => c.id === 'dmg_forcefield'), conUnidades), false);
  // Con el dron Campo de Fuerza: entra SÓLO si el jugador tiene el perk
  // de espinas (dev-7 fase 31): el dron no tiene daño base —su único
  // daño son las espinas del perk—, así que sin él la carta multiplicaba
  // 0 × 1.6 y era INERTE.
  const conCampo = makeRealGame({ stageId: 2 });
  conCampo.fortress.addDrone('forcefield');
  assert.equal(isCardEligible(CATALOG.find((c) => c.id === 'dmg_forcefield'), conCampo), false,
    'sin el perk de espinas la carta sería inerte: no debe ofrecerse');
  setMeta({ perks: { forcefield: [0] } });   // tier 1 A = "Campo de espinas"
  const conEspinas = makeRealGame({ stageId: 2 });
  conEspinas.fortress.addDrone('forcefield');
  assert.equal(isCardEligible(CATALOG.find((c) => c.id === 'dmg_forcefield'), conEspinas), true,
    'con el perk de espinas la carta sí entra');
  setMeta({});
});

test('arsenal: las 4 cartas nuevas multiplican SOLO el dmgMul de SU unidad (×1.6)', () => {
  // fase 61: el cupo de drones es 1, así que el aislamiento entre drones
  // se prueba con DOS partidas (antes se probaba con dos drones juntos).
  const game = makeRealGame({ stageId: 2 });
  game.fortress.addTower('laser');
  game.fortress.addTower('gauss');
  game.fortress.addDrone('firewheel');

  const laser = findTower(game, 'laser');
  const gauss = findTower(game, 'gauss');
  const firewheel = findDrone(game, 'firewheel');

  applyCard(CATALOG.find((c) => c.id === 'dmg_laser'), game);
  assert.ok(Math.abs(laser.dmgMul - 1.6) < 1e-9, 'el Láser sube ×1.6');
  assert.equal(gauss.dmgMul, 1, 'el Gauss NO se toca');
  assert.equal(firewheel.dmgMul, undefined, 'el dron NO se toca');

  applyCard(CATALOG.find((c) => c.id === 'dmg_firewheel'), game);
  assert.ok(Math.abs(firewheel.dmgMul - 1.6) < 1e-9, 'la Rueda de Fuego sube ×1.6');
  assert.equal(laser.dmgMul, 1.6, 'la torre NO se vuelve a tocar');

  // Las Avispas, en su propia partida: su carta toca SU dron y a nadie más.
  const gameWasps = makeRealGame({ stageId: 2 });
  gameWasps.fortress.addTower('laser');
  gameWasps.fortress.addDrone('wasps');
  const laserW = findTower(gameWasps, 'laser');
  const wasps = findDrone(gameWasps, 'wasps');
  applyCard(CATALOG.find((c) => c.id === 'dmg_wasps'), gameWasps);
  assert.ok(Math.abs(wasps.dmgMul - 1.6) < 1e-9, 'las Avispas suben ×1.6');
  assert.equal(laserW.dmgMul, 1, 'la torre NO se toca');
});

test('arsenal: las 4 cartas nuevas tienen tope ×2 y salen del pool al alcanzarlo', () => {
  const game = makeRealGame({ stageId: 2 });
  game.fortress.addTower('laser');
  game.fortress.addDrone('firewheel');
  const card = CATALOG.find((c) => c.id === 'dmg_laser');
  assert.equal(CAPS.dmg_laser, 2);
  assert.equal(CAPS.dmg_firewheel, 2);
  assert.equal(CAPS.dmg_wasps, 2);
  assert.equal(CAPS.dmg_forcefield, 2);
  assert.equal(isCardEligible(card, game), true);
  applyCard(card, game);
  assert.equal(isCardEligible(card, game), true, 'con 1 de 2 sigue siendo elegible');
  applyCard(card, game);
  assert.equal(isCardEligible(card, game), false, 'con el tope alcanzado sale del pool');
  const laser = findTower(game, 'laser');
  assert.ok(Math.abs(laser.dmgMul - 1.6 * 1.6) < 1e-9, '×1.6 ×2 = ×2.56');
  // El dron lleva su propio contador.
  const fw = CATALOG.find((c) => c.id === 'dmg_firewheel');
  assert.equal(isCardEligible(fw, game), true);
  applyCard(fw, game);
  assert.equal(isCardEligible(fw, game), true);
  applyCard(fw, game);
  assert.equal(isCardEligible(fw, game), false);
});

test('arsenal: las 4 cartas nuevas pesan lo mismo que sus hermanas (9)', () => {
  for (const id of ['dmg_laser', 'dmg_firewheel', 'dmg_wasps', 'dmg_forcefield']) {
    const card = CATALOG.find((c) => c.id === id);
    assert.equal(card.weight, 9, `${id} debería pesar 9 como las demás exclusivas`);
  }
});

test('xp_boost: pesa 10 (compite con las cartas de daño: el XP abre ofertas)', () => {
  // dev-7 fase 59.3: el peso de xp_boost baja de 12 a 10. Con el XP por
  // kill escalando con la etapa (score.js: xpForKill), la carta que sube
  // el XP vale un poco menos que antes (ya no multiplica un XP plano), y
  // la oferta de 3 cartas se llena mejor con las cartas de daño y de
  // desbloqueo (que son las que suben el DPS).
  const card = CATALOG.find((c) => c.id === 'xp_boost');
  assert.equal(card.weight, 10);
  assert.equal(CATALOG.find((c) => c.id === 'dmg_all').weight, 12);
});

test('armor_plate: una sola vez y +600 de HP máximo (la base sigue siendo mortal)', () => {
  // Antes: +800 ×2 = +1 600 sobre 3 000 (+53%) → con LEAK_DMG_CAP=50
  // toleraba 32 leaks extra: base prácticamente inmatable (anulaba el
  // balance v7). Ahora: +600 y una vez (+20% de la base).
  const game = makeRealGame();
  const card = CATALOG.find((c) => c.id === 'armor_plate');
  assert.equal(CAPS.armor_plate, 1);
  const maxHp0 = game.fortress.maxHp;
  const hp0 = game.fortress.hp;
  assert.equal(isCardEligible(card, game), true);
  applyCard(card, game);
  assert.equal(game.fortress.maxHp, maxHp0 + 600);
  assert.equal(game.fortress.hp, hp0 + 600, 'además repara de inmediato');
  assert.equal(isCardEligible(card, game), false, 'alcanzado el tope sale del pool');
  applyCard(card, game); // 2da: no debe sumar más
  assert.equal(game.fortress.maxHp, maxHp0 + 600, 'no se puede volver a elegir');
});

test('rollOffer: SIEMPRE 3 cartas (run fresca, run tardía con muchas cartas tomadas)', () => {
  // El modal de cartas no se puede cerrar sin elegir → una oferta corta
  // deja la run TRABADA en CARD_CHOICE (soft-lock). Con los topes de CAPS
  // el pool elegible se puede agotar → la oferta se rellena.
  const frescos = makeRealGame({ stageId: 1 });
  assert.equal(rollOffer(frescos, rngFactory(1)).length, CARD_OFFER_COUNT);

  const tardio = agotarPool(makeRealGame({ stageId: 5 }));
  const offer = rollOffer(tardio, rngFactory(2));
  assert.equal(offer.length, CARD_OFFER_COUNT, 'la oferta nunca puede quedar corta');
  const ids = offer.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, 'sin ids repetidos en la oferta');
});

test('rollOffer: con el pool elegible vacío la oferta se rellena con 3 cartas', () => {
  const game = agotarPool(makeRealGame({ stageId: 5 }));
  game.fortress.ultCharge = 1;
  game.fortress.ultReady = true;
  // Pool elegible vacío.
  const elegibles = CATALOG.filter((c) => isCardEligible(c, game));
  assert.equal(elegibles.length, 0, 'el estado de prueba debe agotar el pool');
  const offer = rollOffer(game, rngFactory(3));
  assert.equal(offer.length, CARD_OFFER_COUNT, 'aun sin pool, la oferta trae 3 cartas');
  const ids = offer.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('exclusivas: las 10 cartas de daño siguen el mismo patrón (peso 9, tope 2)', () => {
  for (const { id } of EXCLUSIVE_DMG) {
    const card = CATALOG.find((c) => c.id === id);
    assert.equal(card.weight, 9, `${id} debería pesar 9`);
    assert.equal(CAPS[id], 2, `${id} debería tener tope 2`);
  }
});

// ============================================================
// dev-7 fase 30 — LAS CARTAS LLEGAN A LOS 3 DRONES
// ============================================================

test('fase 30: "Munición Reforzada" (dmg_all) alcanza también a los drones', () => {
  // fase 74: +10% por stack (antes +30%); la carta sigue llegando a
  // TODAS las unidades presentes.
  const game = makeRealGame();
  game.fortress.addTower('guardian');
  game.fortress.addDrone('firewheel');
  game.fortress.addDrone('wasps');
  const card = CATALOG.find((c) => c.id === 'dmg_all');
  const dron = game.fortress.drones[0];
  const antes = dron.dmgMul ?? 1;
  applyCard(card, game);
  assert.ok(Math.abs((dron.dmgMul ?? 1) / antes - 1.1) < 1e-9,
    `el dron debe recibir el ×1.1 (${antes} → ${dron.dmgMul})`);
  const torre = game.fortress.slots.find(Boolean);
  assert.ok(Math.abs((torre.dmgMul ?? 1) - 1.1) < 1e-9, 'la torre también');
});

test('fase 74: dmg_all alcanza a una torre desbloqueada DESPUÉS', () => {
  const game = makeRealGame();
  game.fortress.addTower('guardian');
  const card = CATALOG.find((c) => c.id === 'dmg_all');
  applyCard(card, game);
  game.fortress.addTower('missile');
  const ms = findTower(game, 'missile');
  assert.ok(Math.abs((ms.dmgMul ?? 1) - 1.1) < 1e-9,
    `la torre tardía debe heredar el stack (dmgMul=${ms.dmgMul})`);
  applyCard(card, game); // 2º stack: 1.1 × 1.1 = 1.21
  assert.ok(Math.abs((ms.dmgMul ?? 1) - 1.21) < 1e-9,
    `el 2º stack debe componer ×1.21 (dmgMul=${ms.dmgMul})`);
});

test('fase 30: "Servos Acelerados" (cadence_up) reduce el cooldown de picadura del Avispas', () => {
  const game = makeRealGame();
  game.fortress.addDrone('wasps');
  const dron = game.fortress.drones[0];
  const card = CATALOG.find((c) => c.id === 'cadence_up');
  assert.equal(isCardEligible(card, game), true);
  applyCard(card, game);
  assert.ok(Math.abs((dron.cadMul ?? 1) - 0.9) < 1e-9,
    `el dron debe recibir el ×0.9 de cadencia (${dron.cadMul})`);
  // El tope se cuenta sobre torres Y drones: con 3 usos no se ofrece más.
  applyCard(card, game);
  applyCard(card, game);
  assert.equal(isCardEligible(card, game), false, 'alcanzado el tope sale del pool');
});

test('fase 30: "Nido Ampliado" (swarm_grow) añade avispas al enjambre y sale del pool al tope', () => {
  const game = makeRealGame();
  const card = CATALOG.find((c) => c.id === 'swarm_grow');
  assert.equal(isCardEligible(card, game), false, 'sin el dron no se ofrece');
  game.fortress.addDrone('wasps');
  const dron = game.fortress.drones[0];
  const antes = dron.waspCount();
  assert.equal(isCardEligible(card, game), true);
  applyCard(card, game);
  assert.equal(dron.waspCount(), antes + 1, 'debe añadir una avispa');
  applyCard(card, game);
  assert.equal(dron.waspCount(), antes + 2, 'la 2ª vez añade otra');
  assert.equal(isCardEligible(card, game), false, 'alcanzado el tope sale del pool');
  // Y nunca pasa del tope de enjambre del dron.
  applyCard(card, game);
  assert.ok(dron.waspCount() <= 6, `el enjambre no puede pasar de 6 (${dron.waspCount()})`);
});

// =====================================================================
// dev-7 fase 51 — CARTAS DE TÉCNICA (el vocabulario de los perks,
// pero en una partida): el canal cartas → unidad → combate.
// =====================================================================

/** Las cartas de técnica: la unidad que necesitan y el mod que dan. */
const TECH = [
  { id: 'tech_pierce', unit: 'guardian', key: 'pierceCount', valor: 1 },
  { id: 'tech_bounce', unit: 'guardian', key: 'bounceCount', valor: 1 },
  { id: 'tech_explode', unit: 'guardian', key: 'impactExplodeChance', valor: 1 },
  { id: 'tech_slow', unit: 'guardian', key: 'slowOnHit', valor: 0.2 },
  { id: 'tech_crit', unit: 'guardian', key: 'critChanceAdd', valor: 0.2 },
  { id: 'tech_lifesteal', unit: 'guardian', key: 'lifesteal', valor: 0.01 },
  { id: 'tech_stun_missile', unit: 'missile', key: 'stunChance', valor: 0.2 },
  { id: 'tech_exec_missile', unit: 'missile', key: 'executeThreshold', valor: 0.12 },
  // fase 74: técnicas del resto del arsenal.
  { id: 'tech_missile_salvo', unit: 'missile', key: 'extraCount', valor: 1 },
  { id: 'tech_tesla_jump', unit: 'tesla', key: 'extraCount', valor: 1 },
  { id: 'tech_thunder_area', unit: 'thunderstroke', key: 'extraCount', valor: 1 },
  { id: 'tech_thunder_stun', unit: 'thunderstroke', key: 'stunChance', valor: 0.15 },
  { id: 'tech_mortar_radius', unit: 'mortar', key: 'areaMul', valor: 1.2 },
  { id: 'tech_gauss_crit', unit: 'gauss', key: 'critChanceAdd', valor: 0.2 },
  { id: 'tech_laser_split', unit: 'laser', key: 'extraCount', valor: 1 },
  { id: 'tech_beam_focus', unit: 'beam', key: 'beamRampPerSecAdd', valor: 0.4 },
  { id: 'tech_firewheel_radius', unit: 'firewheel', key: 'radiusAdd', valor: 8 },
  { id: 'tech_wasps_venom', unit: 'wasps', key: 'venomDpsAdd', valor: 1 },
  { id: 'tech_forcefield_radius', unit: 'forcefield', key: 'radiusAdd', valor: 20 },
  { id: 'tech_forcefield_regen', unit: 'forcefield', key: 'bubbleRegen', valor: 1.5 },
];

test('fase 51/74: las cartas de técnica existen, con tope ×2 y peso > 0', () => {
  for (const t of TECH) {
    const card = CATALOG.find((c) => c.id === t.id);
    assert.ok(card, `falta la carta ${t.id}`);
    assert.equal(CAPS[t.id], 2, `${t.id} debería tener tope 2`);
    assert.ok(card.weight > 0, `${t.id} con weight <= 0`);
    assert.ok(card.name && card.desc, `${t.id} sin nombre o descripción`);
  }
});

test('fase 51: la carta de rebote deja bounceCount en el GUARDIAN (y sólo en él)', () => {
  const game = makeRealGame();
  game.fortress.addTower('guardian');
  game.fortress.addTower('missile');
  const card = CATALOG.find((c) => c.id === 'tech_bounce');
  const gw = findTower(game, 'guardian');
  const ms = findTower(game, 'missile');
  assert.equal(gw.cardMods.bounceCount, undefined, 'antes de elegirla no hay rebotes');
  applyCard(card, game);
  assert.equal(gw.cardMods.bounceCount, 1, 'el Guardian gana 1 rebote');
  assert.equal(ms.cardMods?.bounceCount, undefined, 'el Misil NO se toca');
});

test('fase 51: los mods de carta se ACUMULAN y el tope ×2 saca la carta del pool', () => {
  const game = makeRealGame();
  game.fortress.addTower('guardian');
  const card = CATALOG.find((c) => c.id === 'tech_bounce');
  const gw = findTower(game, 'guardian');
  assert.equal(isCardEligible(card, game), true);
  applyCard(card, game);
  assert.equal(gw.cardMods.bounceCount, 1, '1ª aplicación');
  assert.equal(isCardEligible(card, game), true, 'con 1 de 2 sigue siendo elegible');
  applyCard(card, game);
  assert.equal(gw.cardMods.bounceCount, 2, 'la 2ª aplicación ACUMULA (2 rebotes)');
  assert.equal(isCardEligible(card, game), false, 'alcanzado el tope sale del pool');
  applyCard(card, game); // 3ra: no debe sumar más
  assert.equal(gw.cardMods.bounceCount, 2, 'no se puede aplicar 3 veces la misma carta');
});

test('fase 51: la carta de técnica NO se ofrece si el jugador NO tiene esa torre', () => {
  const game = makeRealGame({ stageId: 2 });
  const rebote = CATALOG.find((c) => c.id === 'tech_bounce');
  assert.equal(isCardEligible(rebote, game), false, 'sin Guardian no se ofrece');
  game.fortress.addTower('guardian');
  assert.equal(isCardEligible(rebote, game), true, 'con el Guardian sí se ofrece');
  // El Misil es lo mismo: sus cartas de técnica necesitan el Misil.
  const aturdidora = CATALOG.find((c) => c.id === 'tech_stun_missile');
  assert.equal(isCardEligible(aturdidora, game), false, 'sin Misil no se ofrece');
  game.fortress.addTower('missile');
  assert.equal(isCardEligible(aturdidora, game), true, 'con el Misil sí se ofrece');
});

test('fase 51: las cartas de técnica del MISIL sólo offered desde el stage 2', () => {
  const game = makeRealGame({ stageId: 1 });
  game.fortress.addTower('missile');
  const card = CATALOG.find((c) => c.id === 'tech_exec_missile');
  assert.equal(card.minStage, 2, 'la carta del Misil es de arsenal tardío');
  assert.equal(isCardEligible(card, game), false, 'en el stage 1 no se ofrece');
  const stage2 = makeRealGame({ stageId: 2 });
  stage2.fortress.addTower('missile');
  assert.equal(isCardEligible(card, stage2), true, 'desde el stage 2 sí');
});

test('fase 51: unitMods FUSIONa los perks de meta con los mods de la carta', () => {
  // Perk del Guardian (tier 1 B): "Rebote: la bala salta a otro enemigo".
  setMeta({ perks: { guardian: [1] } });
  try {
    const game = makeRealGame();
    game.fortress.addTower('guardian');
    const gw = findTower(game, 'guardian');
    assert.equal(unitMods(gw).bounceCount, 1, 'el perk aporta 1 rebote');
    // Una carta de técnica entra en el MISMO canal: se SUMA.
    applyCard(CATALOG.find((c) => c.id === 'tech_bounce'), game);
    assert.equal(unitMods(gw).bounceCount, 2, 'perk (1) + carta (1) = 2 rebotes');
    // Y una carta de otro tipo de mechanic no inventa rebotes de la nada:
    applyCard(CATALOG.find((c) => c.id === 'tech_slow'), game);
    assert.equal(unitMods(gw).slowOnHit, 0.2, 'la carta de slow aporta su slow');
    assert.equal(unitMods(gw).bounceCount, 2, 'y no altera el rebote');
  } finally {
    setMeta({}); // limpia el meta para los tests siguientes
  }
});

test('fase 51/74: cada carta de técnica da SU mod a SU unidad (y sólo a esa)', () => {
  for (const t of TECH) {
    const game = makeRealGame({ stageId: 2 });
    game.fortress.addTower('guardian');
    game.fortress.addTower('missile');
    if (DRONES[t.unit]) game.fortress.addDrone(t.unit);
    else if (t.unit !== 'guardian' && t.unit !== 'missile') game.fortress.addTower(t.unit);
    const card = CATALOG.find((c) => c.id === t.id);
    applyCard(card, game);
    const suyo = findUnit(game, t.unit);
    assert.ok(suyo, `${t.id}: falta la unidad ${t.unit}`);
    assert.equal(suyo.cardMods[t.key], t.valor,
      `${t.id} debería dar ${t.key}=${t.valor} a ${t.unit}`);
    // Ninguna OTRA unidad puede haber recibido el mismo mod.
    const otras = [
      ...game.fortress.slots.filter((u) => u && u !== suyo),
      ...(game.fortress.drones ?? []).filter((u) => u && u !== suyo),
    ];
    for (const otro of otras) {
      assert.equal(otro.cardMods?.[t.key], undefined,
        `${t.id} NO debe tocar a ${otro.type}`);
    }
  }
});

// ============================================================
// dev-7 fase 49 — LAS CARTAS HABLAN: tipo de daño y SINONERGIA
//
// Las 11 cartas de daño exclusiva ("×1,6 de la torre X") son casi
// gemelas: el jugador no sabía si la que tenía delante pegaba
// contra la roca o contra el virus. Ahora cada una declara su TIPO
// de daño (el de la unidad que mejora) y su descripción dice cómo
// queda contra cada familia, con los números REALES de la matriz.
// ============================================================

test('fase 49: la SINONERGIA se CALCULA con la matriz (no está escrita a mano)', () => {
  for (const tipo of DAMAGE_TYPE_IDS) {
    const texto = dmgSynergyText(tipo, 1.6);
    for (const familia of ENEMY_FAMILY_IDS) {
      const esperado = (1.6 * dmgMultiplier(tipo, familia)).toFixed(1).replace('.', ',');
      assert.ok(texto.includes(`×${esperado}`),
        `${tipo} vs ${familia}: el texto dice "${texto}", no ×${esperado}`);
    }
  }
});

test('fase 49: la sinonergia marca la FORTALEZA con ▲ y la DEBILIDAD con ▼', () => {
  const texto = dmgSynergyText('ballistic', 1.6);
  assert.ok(texto.includes('▲roca ×2,4'), `la roca es la fortaleza del balístico: ${texto}`);
  assert.ok(texto.includes('▼cristal ×0,8'), `el cristal es la debilidad del balístico: ${texto}`);
});

test('fase 49: los 70 nombres del catálogo son DISTINTOS (las gemelas se distinguen)', () => {
  const nombres = CATALOG.map((c) => c.name);
  const repetidos = nombres.filter((n, i) => nombres.indexOf(n) !== i);
  assert.deepEqual(repetidos, [], `nombres repetidos: ${repetidos.join(' | ')}`);
});

test('fase 49/74: solo las cartas que suben el daño declaran un tipo', () => {
  const conTipo = CATALOG.filter((c) => c.dmgType);
  for (const c of conTipo) {
    assert.ok(DAMAGE_TYPES[c.dmgType], `${c.id}: tipo desconocido ${c.dmgType}`);
  }
  // Las 11 exclusivas + el Cañón de Ráfaga (Guardian) + el orbital + las
  // 5 cartas de daño por tipo (fase 74).
  assert.equal(conTipo.length, 18,
    `cartas con tipo: ${conTipo.map((c) => c.id).join(', ')}`);
});


// ============================================================================
// dev-7 fase 59.3 - LOS PESOS DEL SORTEO (el arsenal entra antes)
// ============================================================================
// Diagnostico medido: las torres (que son la mitad del DPS del jugador)
// solo entran por carta y con los pesos viejos el sorteo las enterraba:
// el jugador llegaba al S35 con UNA torre en el campo. Con los pesos
// nuevos el arsenal aparece en las primeras ofertas y las cartas de
// utilidad (que no suben el DPS) pesan menos.
//
// fase 64: la subida de la 59.3 dejó a los desbloqueos como las cartas
// MÁS comunes del catálogo. Su `weight` (el de la ficha, el que leen
// estos tests) es el peso BASE: en el sorteo se multiplica por
// `unlockWeightMul` — ×1.5 con el Guardian solo, ×0.7 con el arsenal
// armado — y la oferta trae como máximo 1 desbloqueo.

test('fase 59.3: las cartas de desbloqueo pesan más que antes (el arsenal es prioridad)', () => {
  const unlocks = CATALOG.filter((c) => c.tower || c.drone);
  assert.equal(unlocks.length, 10, 'las 10 unidades del arsenal');
  for (const c of unlocks) {
    assert.ok(c.weight >= 10, `${c.id} debería pesar 10 o más (pesa ${c.weight})`);
  }
  // el Black Hole también es una carta de arsenal (desbloquea el vórtice)
  const bh = CATALOG.find((c) => c.id === 'black_hole');
  // fase 64: la base baja de 7 a 6 (los desbloqueos eran las cartas más
  // comunes del catálogo). El peso EFECTIVO del sorteo es este ×
  // `unlockWeightMul(game)` — ×1.5 con el Guardian solo —, así que el
  // arsenal sigue entrando temprano: ver el test de `unlockWeightMul`.
  assert.ok(bh.weight >= 6, `black_hole debería pesar 6 o más (pesa ${bh.weight})`);
});

test('fase 59.3: la utilidad no compite con el daño en la oferta de 3', () => {
  const utility = ['repair_500', 'armor_plate', 'score_gain', 'streak_shield', 'detect_up'];
  for (const id of utility) {
    const c = CATALOG.find((x) => x.id === id);
    assert.ok(c.weight <= 5, `${id} (utilidad) pesa ${c.weight}: debería pesar 5 o menos`);
  }
});

test('fase 59.3: las cartas de daño están entre las más pesadas del catálogo', () => {
  const dmgAll = CATALOG.find((c) => c.id === 'dmg_all');
  assert.ok(dmgAll.weight >= 12, 'dmg_all (×1,3 a TODO) es la más valiosa');
  const pesos = CATALOG.map((c) => c.weight);
  assert.ok(Math.max(...pesos) >= dmgAll.weight);
});

// ------------------------------------------------------------
// fase 61 — LÍMITE DE ARSENAL (5 torres + 1 dron por partida)
// ------------------------------------------------------------

test('fase 61: no hay lugar para una sexta torre', () => {
  const game = makeRealGame({ stageId: 2 });
  const cinco = ['guardian', 'missile', 'beam', 'thunderstroke', 'tesla'];
  for (const t of cinco) assert.ok(game.fortress.addTower(t), `${t} debería entrar`);
  assert.equal(game.fortress.slots.length, 5, 'la plataforma tiene 5 slots');
  assert.equal(game.fortress.slots.filter(Boolean).length, 5, 'los 5 slots están ocupados');
  // La sexta no entra por NINGUNA vía: no hay slot.
  assert.equal(game.fortress.addTower('gauss'), null, 'no hay lugar para la sexta torre');
  assert.equal(game.fortress.addTower('laser', 2), null, 'ni forzando un slot ocupado');
  assert.equal(game.fortress.slots.filter(Boolean).length, 5, 'el arsenal sigue en 5');
});

test('fase 61: con el arsenal lleno, ninguna carta de torre es elegible', () => {
  const game = makeRealGame({ stageId: 2 });
  for (const t of ['guardian', 'missile', 'beam', 'thunderstroke', 'tesla']) game.fortress.addTower(t);
  const unlocks = CATALOG.filter((c) => c.tower);
  assert.ok(unlocks.length >= 3, 'el catálogo tiene cartas de desbloqueo de torre');
  for (const c of unlocks) {
    assert.equal(isCardEligible(c, game), false, `${c.id} no debe ofrecerse sin slot libre`);
  }
});

test('fase 61: la oferta nunca trae una torre nueva con el arsenal lleno', () => {
  const game = makeRealGame({ stageId: 50 });
  for (const t of ['guardian', 'missile', 'beam', 'thunderstroke', 'tesla']) game.fortress.addTower(t);
  const rng = rngFactory(7);
  for (let i = 0; i < 150; i++) {
    const offer = rollOffer(game, rng);
    assert.ok(offer.length >= 1, 'la oferta nunca queda vacía (soft-lock)');
    for (const c of offer) {
      assert.ok(!c.tower, `la oferta trajo ${c.id} con el arsenal lleno`);
    }
  }
});

test('fase 61: el fillOffer NO re-ofrece una torre cuando el arsenal está lleno', () => {
  // Escenario de soft-lock: arsenal lleno Y todas las repetibles topadas
  // (pool elegible vacío → entra la red de seguridad `fillOffer`). Antes
  // de la fase 61 esa red re-ofrecía un desbloqueo "pendiente" — con los
  // slots llenos, elegirlo no colocaba nada.
  const game = makeRealGame({ stageId: 50 });
  for (const t of ['guardian', 'missile', 'beam', 'thunderstroke', 'tesla']) game.fortress.addTower(t);
  for (const t of game.fortress.slots.filter(Boolean)) {
    t.cardApps = {};
    for (const c of CATALOG) {
      if (CAPS[c.id] !== undefined) t.cardApps[c.id] = CAPS[c.id];
    }
  }
  const rng = rngFactory(11);
  for (let i = 0; i < 60; i++) {
    const offer = rollOffer(game, rng);
    assert.ok(offer.length >= 1, 'la oferta nunca queda vacía');
    for (const c of offer) {
      assert.ok(!c.tower, `el fillOffer re-ofreció ${c.id} sin slot libre`);
    }
  }
});

test('fase 61: el cupo de drones es 1, y los 3 siguen siendo alcanzables', () => {
  for (const dron of ['firewheel', 'wasps', 'forcefield']) {
    const game = makeRealGame({ stageId: 2 });
    assert.ok(game.fortress.addDrone(dron), `${dron} debería entrar en una partida vacía`);
    assert.equal(game.fortress.drones.length, 1);
    assert.equal(game.fortress.addDrone('firewheel'), null, 'el segundo dron no entra');
    assert.equal(game.fortress.drones.length, 1, 'el cupo no se pasa');
  }
});

// ============================================================================
// fase 64 — EL ARSENAL NO SE DUPLICA (reporte del S50: 2 torres misiles)
// ============================================================================
// El reporte: en el S50, Nvl.35 (una etapa que ahora reparte 20 cartas,
// ver score.js MAX_CARDS_PER_STAGE), dos ofertas seguidas le dieron la
// torre MISSILE las dos veces → el jugador quedó con DOS torres misiles.
// La causa del duplicado —ya corregida en main.js— fue que las ofertas de
// un multikill se sorteaban TODAS con el estado ANTERIOR a la primera
// elección (hoy la cola guarda NIVELES y el sorteo es perezoso: ver el
// handler 'levelup'). De este lado entraba la otra mitad: el relleno de la
// oferta (`fillOffer`) sólo miraba `minStage`, así que en una run larga
// podía ofrecer cartas que no hacen nada (una mejora de una torre AUSENTE,
// un desbloqueo de una unidad que ya está o que no entra porque no hay
// slot, una repetible topada de una unidad que no está). Y una carta de
// unidad ausente es peligrosa de más: si es un desbloqueo ya gastado,
// elegirla vuelve a llamar a `addTower`, que NO deduplica por tipo.
// La fase 64 separa RELEVANCIA de TOPE y reescribe el relleno. De paso, el
// usuario pidió que las cartas de mejora sean SÍ O SÍ de unidades que están
// en el campo y que los desbloqueos sean "un poco más raros".

/** Deja TODAS las repetibles del catálogo en su tope (pool elegible vacío). */
function toparTodo(f) {
  f.dmgAllStacks = CAPS.dmg_all;
  f.cadAllStacks = CAPS.cadence_up;
  f.typeStacks = { ballistic: 2, light: 2, blast: 2, electric: 2, drone: 2 };
  f.huntStacks = { rock: 1, crystal: 1, spore: 1, virus: 1 };
  f.blackHoleMods = {
    durationAdd: 1.5, radiusMul: 1.2, endBurst: 150, singularity: 1, drain: 0.1,
  };
  f.comboMods = {
    slowLightVuln: 1.2, slowBlastVuln: 1.2,
    slowCritChanceAdd: 0.2, slowCritDmgAdd: 0.3, slowFreezeChance: 0.2,
    explosionSlowFrac: 0.25, explosionSlowTime: 2,
    poisonRegen: 0.5, railMark: 1, swarmMark: 1, judgment: 1,
    bounceElectric: 1, pierceBleed: 1, harvest: 1,
  };
  for (const t of f.slots.filter(Boolean)) {
    t.dmgAllApps = CAPS.dmg_all;
    t.guardDmgApps = CAPS.dmg_guard;
    t.exclusiveDmgApps = 2;
    t.cadApps = CAPS.cadence_up;
    t.rapidApps = CAPS.rapid_bullets;
    t.level = 5;                                  // bullets_5 fuera por estado
    t.cardApps = t.cardApps ?? {};
    for (const c of CATALOG) {
      if (CAPS[c.id] !== undefined) t.cardApps[c.id] = CAPS[c.id];
    }
  }
  for (const d of f.drones ?? []) {
    d.exclusiveDmgApps = 2;
    d.swarmApps = CAPS.swarm_grow;
    d.cadApps = CAPS.cadence_up;
    d.cardApps = d.cardApps ?? {};
    for (const c of CATALOG) {
      if (CAPS[c.id] !== undefined) d.cardApps[c.id] = CAPS[c.id];
    }
  }
  f.detectApps = CAPS.detect_up;
  f.xpBoostApps = CAPS.xp_boost;
  f.scoreGainApps = CAPS.score_gain;
  f.streakShieldApps = CAPS.streak_shield;
  f.orbitalPowerApps = CAPS.ult_power;
  f.repairApps = CAPS.repair_500;
  f.armorApps = CAPS.armor_plate;
  f.pierce = CAPS.pierce_up;
  f.pierceApps = CAPS.pierce_up;
  f.ultChargeApps = CAPS.ult_charge;
}

/** fase 64: id de carta → unidad que EXIGE (para cazar cartas de unidades ausentes). */
const UNIT_DE_CARTA = new Map([
  ...EXCLUSIVE_DMG.map(({ id, unit }) => [id, unit]),
  ...TECH.map(({ id, unit }) => [id, unit]),
  ['swarm_grow', 'wasps'],
]);

test('fase 64: fillOffer NUNCA rellena con una unidad ausente', () => {
  // 5 torres puestas (SIN Tesla), el cupo de drones lleno, el Black Hole
  // ya desbloqueado y todas las repetibles topadas → pool elegible vacío
  // (el relleno entra sí o sí). Antes podía colar la carta de una torre
  // que el jugador no tiene.
  for (const quinto of ['mortar', 'gauss', 'laser']) {
    const game = makeRealGame({ stageId: 5 });
    for (const t of ['guardian', 'missile', 'beam', 'thunderstroke', quinto]) {
      assert.ok(game.fortress.addTower(t), `${t} debería entrar en la plataforma`);
    }
    game.fortress.addDrone('firewheel');
    game.fortress.blackHoleUnlocked = true;
    toparTodo(game.fortress);

    const presentes = new Set(game.fortress.slots.filter(Boolean).map((t) => t.type));
    presentes.add('firewheel');
    assert.equal(CATALOG.filter((c) => isCardEligible(c, game)).length, 0,
      `el estado de prueba (con ${quinto}) agota el pool elegible`);

    const rng = rngFactory(13);
    for (let i = 0; i < 30; i++) {
      const offer = rollOffer(game, rng);
      assert.equal(offer.length, CARD_OFFER_COUNT, 'la oferta nunca queda corta');
      const ids = offer.map((c) => c.id);
      // Sin Tesla en el campo: ni su mejora ni su desbloqueo.
      assert.ok(!ids.includes('dmg_tesla'), `el relleno trajo dmg_tesla: ${ids}`);
      assert.ok(!ids.includes('unlock_tesla'), `el relleno trajo unlock_tesla: ${ids}`);
      assert.ok(!ids.includes('dmg_wasps'), `el relleno trajo la carta de un dron ausente: ${ids}`);
      for (const c of offer) {
        assert.ok(!c.tower && !c.drone && c.id !== 'black_hole',
          `el relleno trajo un desbloqueo (${c.id})`);
        const unidad = UNIT_DE_CARTA.get(c.id);
        if (unidad) {
          assert.ok(presentes.has(unidad), `${c.id} es de ${unidad}, que no está en el campo`);
        }
      }
    }
  }
});

test('fase 64: fillOffer no re-ofrece un desbloqueo ya gastado (torre puesta + slot libre)', () => {
  // Escenario del reporte: el Misil YA está puesto y queda slot libre, así
  // que su carta de desbloqueo no puede volver a salir (elegirla colocaría
  // una SEGUNDA torre del mismo tipo). El estado deja UN solo elegible —el
  // desbloqueo que todavía falta— para que la oferta tenga que rellenarse.
  const game = makeRealGame({ stageId: 1 });
  for (const t of ['guardian', 'missile', 'beam', 'thunderstroke']) game.fortress.addTower(t);
  toparTodo(game.fortress);
  assert.deepEqual(CATALOG.filter((c) => isCardEligible(c, game)).map((c) => c.id),
    ['unlock_tesla'], 'el único elegible debe ser el desbloqueo que TODAVÍA falta');

  const offer = rollOffer(game, rngFactory(21));
  const ids = offer.map((c) => c.id);
  assert.equal(offer.length, CARD_OFFER_COUNT, 'la oferta se rellena, pero completa');
  assert.ok(ids.includes('unlock_tesla'), `debería ofrecer el desbloqueo pendiente: ${ids}`);
  for (const gastada of ['unlock_missile', 'unlock_beam', 'unlock_thunderstroke']) {
    assert.ok(!ids.includes(gastada), `el relleno re-ofreció ${gastada}: ${ids}`);
  }
});

test('fase 64: rollOffer — como máximo 1 carta de desbloqueo por oferta', () => {
  const esDesbloqueo = (c) => !!(c.tower || c.drone || c.id === 'black_hole');
  const escenarios = [
    { nombre: 'sólo el Guardian', towers: ['guardian'] },
    { nombre: '2 torres', towers: ['guardian', 'missile'] },
    { nombre: '3 torres', towers: ['guardian', 'missile', 'beam'] },
    { nombre: 'arsenal lleno', towers: ['guardian', 'missile', 'beam', 'thunderstroke', 'tesla'] },
  ];
  for (const esc of escenarios) {
    const game = makeRealGame({ stageId: 5 });
    for (const t of esc.towers) game.fortress.addTower(t);
    const rng = rngFactory(5);
    for (let i = 0; i < 50; i++) {
      const unlocks = rollOffer(game, rng).filter(esDesbloqueo).map((c) => c.id);
      assert.ok(unlocks.length <= 1,
        `${esc.nombre}: la oferta trajo ${unlocks.length} desbloqueos (${unlocks})`);
    }
  }
});

test('fase 64: con sólo el Guardian la oferta GARANTIZA 1 desbloqueo', () => {
  // fase 59.3: sin arsenal el jugador llegaba al S35 con UNA sola torre.
  const game = makeRealGame({ stageId: 5 });
  game.fortress.addTower('guardian');
  const rng = rngFactory(31);
  for (let i = 0; i < 50; i++) {
    const offer = rollOffer(game, rng);
    const unlocks = offer.filter((c) => c.tower || c.drone || c.id === 'black_hole');
    assert.equal(unlocks.length, 1,
      `debería traer exactamente 1 desbloqueo: ${offer.map((c) => c.id)}`);
  }
  // Sin ninguna torre (≤1) la garantía es la misma.
  const otra = rollOffer(makeRealGame({ stageId: 5 }), rngFactory(32));
  assert.equal(otra.filter((c) => c.tower || c.drone || c.id === 'black_hole').length, 1);
});

test('fase 64: unlockWeightMul sube con el arsenal vacío y baja con el lleno', () => {
  const conTorres = (n) => {
    const game = makeRealGame({ stageId: 5 });
    for (const t of ['guardian', 'missile', 'beam', 'thunderstroke', 'tesla'].slice(0, n)) {
      game.fortress.addTower(t);
    }
    return game;
  };
  assert.equal(unlockWeightMul(conTorres(0)), 1.5, 'sin torres: hay que montar el arsenal');
  assert.equal(unlockWeightMul(conTorres(1)), 1.5, 'sólo el Guardian: ×1.5');
  assert.equal(unlockWeightMul(conTorres(2)), 1.25);
  assert.equal(unlockWeightMul(conTorres(3)), 1, 'arsenal a medio armar: peso base');
  assert.equal(unlockWeightMul(conTorres(4)), 0.7);
  assert.equal(unlockWeightMul(conTorres(5)), 0.7, 'arsenal lleno: una torre más interesa menos');
});

test('fase 64: isRelevant va SEPARADO del tope de aplicaciones', () => {
  // Una carta topada de una unidad PRESENTE sigue siendo relevante (elegirla
  // sirve: sólo se le acabaron las aplicaciones). El relleno de la oferta se
  // apoya en eso sin poder ofrecer nunca una unidad ausente.
  const game = makeGame({ towers: ['guardian'] });
  const dmgAll = CATALOG.find((c) => c.id === 'dmg_all');
  assert.equal(isRelevant(dmgAll, game), true);
  assert.equal(isCardEligible(dmgAll, game), true);
  game.fortress.slots[0].dmgAllApps = CAPS.dmg_all;
  assert.equal(isRelevant(dmgAll, game), true, 'topada ≠ irrelevante');
  assert.equal(isCardEligible(dmgAll, game), false, 'el tope la saca del pool');

  // Y al revés: la exclusiva de una torre AUSENTE no es relevante (le sobren
  // o no aplicaciones, sin la torre no hace nada).
  const dmgTesla = CATALOG.find((c) => c.id === 'dmg_tesla');
  assert.equal(isRelevant(dmgTesla, game), false, 'sin Tesla la carta no sirve');
  assert.equal(isCardEligible(dmgTesla, game), false);
  game.fortress.slots[1] = { type: 'tesla', level: 1 };
  assert.equal(isRelevant(dmgTesla, game), true, 'con la Tesla vuelve a ser relevante');
  assert.equal(isCardEligible(dmgTesla, game), true);
});

test('fase 64: regresión del reporte — elegir unlock_missile no lo vuelve a ofrecer', () => {
  const game = makeRealGame({ stageId: 50 });
  game.fortress.addTower('guardian');
  const unlock = CATALOG.find((c) => c.id === 'unlock_missile');
  assert.equal(isCardEligible(unlock, game), true, 'al principio tiene que poder salir');
  applyCard(unlock, game);            // el jugador elige la torre MISSILE
  assert.ok(findTower(game, 'missile'));
  assert.equal(isRelevant(unlock, game), false, 'ya está puesta: la carta no sirve más');
  assert.equal(isCardEligible(unlock, game), false);

  const rng = rngFactory(99);
  for (let i = 0; i < 50; i++) {
    const ids = rollOffer(game, rng).map((c) => c.id);
    assert.ok(!ids.includes('unlock_missile'), `el Misil volvió a salir: ${ids}`);
  }
  // El arsenal tiene UNA sola torre misil: la duplicación del reporte
  // llegaba por volver a elegir la carta — `Fortress.addTower` NO deduplica
  // por tipo (busca el primer slot libre), así que la defensa es que la
  // carta no vuelva a entrar al pool (lo que mira el bucle de arriba).
  assert.equal(game.fortress.slots.filter((t) => t?.type === 'missile').length, 1);
});
