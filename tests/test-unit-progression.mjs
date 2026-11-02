// tests/test-unit-progression.mjs — 1.11.0
// Nivel 1-6 + maestría 0-15 + doctrinas + elección legendaria.
// Cubre el contrato central de cards.js y el flujo de draft de Game.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATALOG, CAPS, applyCard, cardUnitTargets, legendaryCardsFor,
  DOCTRINE_CARDS, LEGENDARY_CARDS,
} from '../js/cards.js';
import {
  MAX_TOWER_LEVEL, Drone, HomingMissile, Tower,
} from '../js/towers.js';
import { Game } from '../js/game.js';
import { onMechanicHit } from '../js/tower-mechanics.js';

const UNITS = [
  'guardian', 'missile', 'beam', 'thunderstroke', 'tesla',
  'mortar', 'gauss', 'laser', 'firewheel', 'wasps', 'forcefield',
];

function dummyUnit(type, level = 1) {
  return {
    type,
    data: { name: type, dmgType: 'ballistic' },
    level,
    mastery: 0,
    legendaryTier: 0,
    legendaryDrafts: 0,
    legendaryPicks: [],
    dmgMul: 1,
    cadMul: 1,
    cardMods: {},
    cardApps: {},
    upgrade() {
      if (this.level >= MAX_TOWER_LEVEL) return false;
      this.level += 1;
      return true;
    },
  };
}

function gameWith(unit) {
  return {
    fortress: {
      slots: [unit],
      drones: [],
      hp: 1000,
      maxHp: 1000,
      dmgAllStacks: 0,
      cadAllStacks: 0,
      typeStacks: {},
      huntStacks: {},
    },
    meta: {},
    stageId: 1,
  };
}

test('1.11.0: 23 doctrinas, cap 2 y presentes en el catálogo normal', () => {
  assert.equal(DOCTRINE_CARDS.length, 23);
  for (const c of DOCTRINE_CARDS) {
    assert.ok(c.unit && c.doctrine, `${c.id}: unidad/doctrina`);
    assert.equal(CAPS[c.id], 2, `${c.id}: cap 2`);
    assert.ok(CATALOG.some((x) => x.id === c.id), `${c.id}: en CATALOG`);
  }
});

test('1.11.0: 33 legendarias, 3 por unidad y fuera del catálogo normal', () => {
  assert.equal(LEGENDARY_CARDS.length, 33);
  assert.equal(new Set(LEGENDARY_CARDS.map((c) => c.id)).size, 33);
  for (const type of UNITS) {
    const cards = legendaryCardsFor(type);
    assert.equal(cards.length, 3, `${type}: 3 legendarias`);
    for (const c of cards) {
      assert.equal(c.unit, type);
      assert.equal(c.rarity, 'legendary');
      assert.equal(typeof c.apply, 'function');
      assert.ok(!CATALOG.some((x) => x.id === c.id), `${c.id}: no va al catálogo`);
    }
  }
});

test('1.11.0: todas las unidades pueden llegar a Lv.6 con cartas dedicadas', () => {
  for (const type of UNITS) {
    const existing = CATALOG.filter((c) => !c.doctrine && cardUnitTargets(c).includes(type))
      .length;
    const doctrines = DOCTRINE_CARDS.filter((c) => c.unit === type).length;
    // Cada doctrina se aplica 2 veces (rango 1 y 2).
    assert.ok(existing + doctrines * 2 >= MAX_TOWER_LEVEL - 1,
      `${type}: ${existing} dedicadas + ${doctrines}×2 doctrinas no llegan a Lv.6`);
  }
});

test('1.11.0: carta dedicada sube nivel y maestría; carta global sólo maestría', () => {
  const tower = dummyUnit('missile');
  const game = gameWith(tower);
  const dmg = CATALOG.find((c) => c.id === 'dmg_missile');
  const global = CATALOG.find((c) => c.id === 'dmg_all');

  assert.equal(applyCard(dmg, game), dmg);
  assert.equal(tower.level, 2, 'la carta dedicada sube un nivel');
  assert.equal(tower.mastery, 1);

  assert.equal(applyCard(global, game), global);
  assert.equal(tower.level, 2, 'la global NO sube nivel');
  assert.equal(tower.mastery, 2, 'pero sí suma maestría');
});

test('1.11.0: doctrina aplica dos rangos, sube nivel/maestría y se topa', () => {
  const tower = dummyUnit('missile');
  const game = gameWith(tower);
  const doc = DOCTRINE_CARDS.find((c) => c.id === 'doc_missile_proximity');

  assert.equal(applyCard(doc, game), doc);
  assert.equal(tower.level, 2);
  assert.equal(tower.mastery, 1);
  assert.equal(tower.cardApps[doc.id], 1);
  assert.equal(tower.cardMods.homingStrength, 0.5);

  assert.equal(applyCard(doc, game), doc);
  assert.equal(tower.level, 3);
  assert.equal(tower.mastery, 2);
  assert.equal(tower.cardApps[doc.id], 2);
  assert.ok(tower.cardMods.dmgMul > 1, 'rango 2 aplicó su mod');

  assert.equal(applyCard(doc, game), null, 'el tercer rango está topado');
  assert.equal(tower.cardApps[doc.id], 2);
});

test('1.11.0: el nivel se topa en 6 y la maestría sigue subiendo', () => {
  const tower = dummyUnit('tesla', MAX_TOWER_LEVEL);
  const game = gameWith(tower);
  const doc = DOCTRINE_CARDS.find((c) => c.id === 'doc_tesla_coil');
  applyCard(doc, game);
  assert.equal(tower.level, MAX_TOWER_LEVEL, 'no pasa del techo');
  assert.equal(tower.mastery, 1, 'la maestría sí cuenta');
});

test('1.11.0: cada 5 de maestría se encola una elección legendaria', () => {
  const tower = dummyUnit('missile');
  const game = gameWith(tower);
  tower.mastery = 4;
  tower.legendaryTier = 0;
  const dmg = CATALOG.find((c) => c.id === 'dmg_missile');
  applyCard(dmg, game);
  assert.equal(tower.mastery, 5);
  assert.equal(tower.legendaryTier, 1);
  assert.equal(tower.legendaryDrafts, 1);

  // Al cruzar 10 se encola la segunda.
  tower.mastery = 9;
  tower.legendaryTier = 1;
  tower.legendaryDrafts = 0;
  applyCard(CATALOG.find((c) => c.id === 'dmg_all'), game);
  assert.equal(tower.mastery, 10);
  assert.equal(tower.legendaryTier, 2);
  assert.equal(tower.legendaryDrafts, 1);
});

test('1.11.0: ninguna legendaria es inerte (siempre cambia los mods)', () => {
  for (const type of UNITS) {
    for (const leg of legendaryCardsFor(type)) {
      const unit = dummyUnit(type);
      const game = gameWith(unit);
      assert.equal(applyCard(leg, game), leg, `${leg.id}: se aplica`);
      assert.ok(Object.keys(unit.cardMods).length > 0,
        `${leg.id}: dejó al menos un mod`);
    }
  }
});

test('1.11.0: Cañón de Ráfaga entrega las balas 2.ª y 3.ª por mods', () => {
  const tower = new Tower('guardian', 100, 1);
  const game = gameWith(tower);
  tower.game = game;
  game.engine = { _t: 0 };
  const card = CATALOG.find((c) => c.id === 'bullets_5');
  assert.equal(tower.bulletsPerBurst, 1);
  applyCard(card, game);
  assert.equal(tower.level, 2);
  assert.equal(tower.bulletsPerBurst, 2, 'la primera aplicación da la 2.ª bala');
  applyCard(card, game);
  assert.equal(tower.level, 3);
  assert.equal(tower.bulletsPerBurst, 3, 'la segunda da la 3.ª');
  applyCard(card, game);
  assert.equal(tower.bulletsPerBurst, 3, 'el tope de 3 no se pasa');
});

test('1.11.0: Foco Resonante salpica el estallido de Supresión a los vecinos', () => {
  const mk = (x, y) => ({
    x, y, r: 10, hp: 1000, dead: false, hits: 0,
    takeDamage(n) { this.hits += n; return this.hp <= 0; },
  });
  const a = mk(100, 100);
  const b = mk(130, 100);
  const c = mk(100, 130);
  const game = {
    engine: { _t: 0, spawnParticles() {} },
    fortress: { enemies: [a, b, c] },
  };
  const mods = { supSplashFrac: 0.6, supSplashRadius: 70, supSplashTargets: 3 };
  for (let i = 0; i < 3; i++) {
    onMechanicHit('guardian', a, game, { dmg: 100, mods });
  }
  assert.ok(a.hits >= 45, `el blanco recibe el estallido (${a.hits})`);
  assert.ok(b.hits > 0, 'el vecino B recibe el splash');
  assert.ok(c.hits > 0, 'el vecino C recibe el splash');
  assert.ok((b._sup ?? 0) > 0 && (c._sup ?? 0) > 0, 'el splash deja 1 stack');
});

test('1.11.0: Ojiva de Antimateria usa radio y splash modificados', () => {
  const enemy = {
    x: 0, y: 0, r: 10, hp: 500, dead: false, hits: 0,
    takeDamage(n) { this.hits += n; return false; },
  };
  const game = {
    engine: { addEffect() {}, spawnParticles() {} },
    fortress: { enemies: [enemy] },
  };
  const missile = new HomingMissile(0, 0, null, game, 100, {
    splashRMul: 2, splashFracAdd: 0.5,
  });
  missile._explode();
  assert.equal(enemy.hits, 100, 'el splash legendario pega el 100 % del daño');
});

test('1.11.0: Reina del Enjambre suma un mosquito real al dron', () => {
  const game = {
    fortress: { slots: [], drones: [], hp: 1000, maxHp: 1000 },
    engine: { _t: 0 },
  };
  const drone = new Drone('wasps', game);
  game.fortress.drones.push(drone);
  const before = drone.waspCount();
  const queen = legendaryCardsFor('wasps').find((c) => c.id === 'leg_wasps_queen');
  assert.equal(applyCard(queen, game), queen);
  assert.equal(drone.waspCount(), before + 1, 'el enjambre se reconstruye con +1');
  assert.equal(drone.level, 2, 'la legendaria también sube el nivel del dron');
  assert.equal(drone.mastery, 1);
});

test('1.11.0: una legendaria también sube nivel/maestría y queda elegida', () => {
  const tower = dummyUnit('missile', 2);
  const game = gameWith(tower);
  tower.mastery = 4;
  tower.legendaryTier = 1;
  tower.legendaryPicks = [];
  const leg = legendaryCardsFor('missile')[0];
  assert.equal(applyCard(leg, game), leg);
  assert.equal(tower.level, 3, 'la legendaria es una carta dedicada');
  assert.equal(tower.mastery, 5);
  assert.ok(tower.cardMods.executeThreshold > 0 || tower.cardMods.dmgMul > 1,
    'el efecto de la legendaria quedó en los mods');
});

test('1.11.0: el draft de Game ofrece 3/2/1 y no consume niveles', () => {
  const tower = dummyUnit('missile');
  const game = Object.create(Game.prototype);
  game.fortress = { slots: [tower], drones: [] };
  game.engine = {
    state: 'CARD_CHOICE',
    setState(next) { this.state = next; },
    floatText() {},
  };
  game.hud = { showCardChoice() {}, showAviso() {} };
  game.audio = { sfx() {} };
  game.pendingOffer = [CATALOG.find((c) => c.id === 'dmg_missile')];
  game._cardOfferKind = 'normal';
  game._legendaryDraft = null;
  game._cardChoiceMeta = null;
  game._pendingLevels = 1;
  game._cardsApplied = 0;
  game._ended = false;
  tower.mastery = 4;
  tower.legendaryTier = 0;
  tower.legendaryDrafts = 0;
  tower.legendaryPicks = [];

  game.pickCard('dmg_missile');
  assert.equal(tower.mastery, 5);
  assert.equal(tower.level, 2);
  assert.equal(game._pendingLevels, 0, 'la carta normal consumió el nivel');
  assert.equal(game._cardOfferKind, 'legendary', 'el draft tiene prioridad');
  assert.equal(game.pendingOffer.length, 3, 'primer draft: 3 opciones');
  assert.equal(tower.legendaryDrafts, 0, 'el draft se consumió al mostrarse');

  const first = game.pendingOffer[0];
  game.pickCard(first.id);
  assert.deepEqual(tower.legendaryPicks, [first.id]);
  assert.equal(game.engine.state, 'PLAYING');
  assert.equal(game.pendingOffer, null);
  assert.equal(game._pendingLevels, 0, 'la legendaria no consume niveles');

  // Segundo draft: quedan 2.
  tower.mastery = 9;
  tower.legendaryTier = 1;
  tower.legendaryDrafts = 1;
  const second = game._nextLegendaryOffer();
  assert.deepEqual(second.cards.map((c) => c.id).sort(),
    legendaryCardsFor('missile').map((c) => c.id).filter((id) => id !== first.id).sort());
  assert.equal(second.cards.length, 2);
});

test('1.11.0: Censura no recorta la elección legendaria', () => {
  const tower = dummyUnit('tesla');
  const game = Object.create(Game.prototype);
  game.fortress = { slots: [tower], drones: [] };
  game.runMods = { offerCount: 1 };
  tower.legendaryDrafts = 1;
  const draft = game._nextLegendaryOffer();
  assert.equal(draft.cards.length, 3, 'el draft ignora offerCount');
});
