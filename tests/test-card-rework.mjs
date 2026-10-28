// ============================================================
// tests/test-card-rework.mjs — fase 74
// Cartas de daño por tipo, tags/combos, explosión al impactar y
// Black Hole con mods. Complementa test-cards (catálogo/elegibilidad)
// y test-towers (mecánicas de torre).
// ============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CATALOG, applyCard, isCardEligible, findTower, findDrone,
} from '../js/cards.js';
import { Fortress } from '../js/player.js';
import { Tower, TOWERS, unitMods } from '../js/towers.js';
import { applyProjectileHit } from '../js/enemies.js';
import { saveMeta } from '../js/meta.js';

saveMeta({});

const card = (id) => CATALOG.find((c) => c.id === id);

function mkEnemy(x, y, hp = 1000) {
  return {
    x, y, r: 10, hp, hpMax: hp, dead: false, slowFactor: 1, stun: 0,
    type: 'grunt', data: { family: 'rock' },
    takeDamage(n) { this.hp -= n; if (this.hp <= 0) this.dead = true; return this.dead; },
  };
}

function mkGame(towers = [], enemies = []) {
  const game = {
    stageId: 4,
    lv: 1, xp: 0, score: 0, kills: 0,
    engine: {
      _t: 0,
      entities: [],
      effects: [],
      addEntity(e) { this.entities.push(e); },
      addEffect(fx) { this.effects.push(fx); },
      spawnParticles() {},
      floatText() {},
      shake() {},
      emit() {},
      sfxSafe() {},
    },
    audio: { sfx() {} },
  };
  game.fortress = new Fortress(game);
  for (const t of towers) game.fortress.addTower(t);
  game.fortress.enemies = enemies;
  return game;
}

// ------------------------------------------------------------
// Daño por tipo y buffs globales
// ------------------------------------------------------------

test('fase 74: las cartas de tipo aplican +20% y llegan a torres futuras', () => {
  const game = mkGame(['guardian']);
  const gw = findTower(game, 'guardian');
  const c = card('dmg_type_ballistic');
  assert.equal(isCardEligible(c, game), true, 'con Guardian debe ser elegible');
  applyCard(c, game);
  assert.equal(gw.dmgMul, 1.2);
  game.fortress.addTower('gauss');
  const gauss = findTower(game, 'gauss');
  assert.equal(gauss.dmgMul, 1.2, 'la torre futura hereda el stack');
  applyCard(c, game);
  assert.equal(gw.dmgMul, 1.44, 'el 2º stack compone ×1.44');
  assert.equal(isCardEligible(c, game), false, 'al tope sale del pool');
});

test('fase 74: dmg_all +10% x2 llega a una torre desbloqueada después', () => {
  const game = mkGame(['guardian']);
  applyCard(card('dmg_all'), game);
  game.fortress.addTower('missile');
  const ms = findTower(game, 'missile');
  assert.equal(ms.dmgMul, 1.1, 'la torre tardía hereda el primer stack');
  applyCard(card('dmg_all'), game);
  assert.ok(Math.abs(ms.dmgMul - 1.21) < 1e-9, `2º stack: ${ms.dmgMul}`);
});

test('fase 74: las cartas de tipo NO se ofrecen sin una unidad de ese tipo', () => {
  const game = mkGame(['guardian', 'missile']);
  assert.equal(isCardEligible(card('dmg_type_electric'), game), false);
  game.fortress.addTower('tesla');
  assert.equal(isCardEligible(card('dmg_type_electric'), game), true);
});

// ------------------------------------------------------------
// Técnicas: llegan al combate, no sólo a unitMods
// ------------------------------------------------------------

test('fase 74: Salva de Misiles lanza 2 misiles con 2 enemigos', () => {
  const game = mkGame(['missile'], [mkEnemy(200, 500), mkEnemy(300, 500)]);
  const t = findTower(game, 'missile');
  t.fire(game.fortress.enemies, game, 1 / 60);
  assert.equal(game.engine.entities.filter((e) => e.constructor?.name === 'HomingMissile').length, 1);
  applyCard(card('tech_missile_salvo'), game);
  t.fire(game.fortress.enemies, game, 1 / 60);
  assert.equal(game.engine.entities.filter((e) => e.constructor?.name === 'HomingMissile').length, 3,
    '1 de la primera salva + 2 de la segunda');
});

test('fase 74: Salto de Cadena alarga la Tesla un nodo', () => {
  const enemies = Array.from({ length: 6 }, (_, i) => mkEnemy(230 + i * 16, 700));
  const game = mkGame(['tesla'], enemies);
  const t = findTower(game, 'tesla');
  t.fire(enemies, game, 1 / 60);
  const base = game.engine.effects[0].points.length;
  applyCard(card('tech_tesla_jump'), game);
  game.engine.effects.length = 0;
  t.fire(enemies, game, 1 / 60);
  assert.equal(game.engine.effects[0].points.length, base + 1);
});

test('fase 74: Láser Dividido dispara 2 rayos con 2 enemigos', () => {
  const game = mkGame(['laser'], [mkEnemy(200, 500), mkEnemy(340, 500)]);
  const t = findTower(game, 'laser');
  t.fire(game.fortress.enemies, game, 1 / 60);
  assert.equal(game.engine.entities.filter((e) => e.constructor?.name === 'LaserStaticFx').length, 1);
  applyCard(card('tech_laser_split'), game);
  t.fire(game.fortress.enemies, game, 1 / 60);
  assert.equal(game.engine.entities.filter((e) => e.constructor?.name === 'LaserStaticFx').length, 3,
    '1 de la primera andanada + 2 de la segunda');
});

test('fase 74: Ojiva Expandida sube el radio del obús', () => {
  const game = mkGame(['mortar'], [mkEnemy(270, 500)]);
  const t = findTower(game, 'mortar');
  t.fire(game.fortress.enemies, game, 1 / 60);
  const base = game.engine.entities.find((e) => e.constructor?.name === 'MortarShell');
  assert.equal(base.blastR, TOWERS.mortar.blastR);
  applyCard(card('tech_mortar_radius'), game);
  t.fire(game.fortress.enemies, game, 1 / 60);
  const boosted = game.engine.entities.filter((e) => e.constructor?.name === 'MortarShell')[1];
  assert.ok(boosted.blastR > base.blastR, `radio ${boosted.blastR} > ${base.blastR}`);
});

test('fase 74: Munición de Tungsteno pasa el crítico al perdigón del Gauss', () => {
  const game = mkGame(['gauss'], [mkEnemy(270, 500)]);
  const t = findTower(game, 'gauss');
  applyCard(card('tech_gauss_crit'), game);
  t.fire(game.fortress.enemies, game, 1 / 60);
  const shot = game.engine.entities.find((e) => e.constructor?.name === 'Bullet');
  assert.equal(shot.critChance, 0.2);
});

// ------------------------------------------------------------
// Explosión al impactar
// ------------------------------------------------------------

test('fase 74: Balas Detonantes daña alrededor del impacto y no duplica al principal', () => {
  const target = mkEnemy(100, 500);
  const near = mkEnemy(100, 470);
  const far = mkEnemy(100, 300);
  const p = {
    x: 100, y: 500, vx: 0, vy: -100, damage: 100, dead: false,
    impactExplodeChance: 1, impactExplodeFrac: 0.4, impactExplodeRadius: 70,
  };
  applyProjectileHit(p, [target, near, far]);
  assert.equal(target.hp, 900, 'el principal come el daño directo una sola vez');
  assert.equal(near.hp, 960, 'el vecino come el 40% del daño');
  assert.equal(far.hp, 1000, 'fuera del radio no hay daño');
});

test('fase 74: Balas Detonantes exige una torre explosiva', () => {
  const game = mkGame(['guardian']);
  assert.equal(isCardEligible(card('tech_explode'), game), false);
  game.fortress.addTower('mortar');
  assert.equal(isCardEligible(card('tech_explode'), game), true);
});

// ------------------------------------------------------------
// Combos
// ------------------------------------------------------------

test('fase 74: Reactor de Cadena exige ambas torres y suma a las dos', () => {
  const game = mkGame(['thunderstroke', 'tesla']);
  const c = card('combo_chain_reactor');
  assert.equal(isCardEligible(c, game), true);
  applyCard(c, game);
  assert.equal(unitMods(findTower(game, 'thunderstroke')).extraCount, 1);
  assert.equal(unitMods(findTower(game, 'tesla')).extraCount, 1);
  const sinPar = mkGame(['tesla']);
  assert.equal(isCardEligible(c, sinPar), false, 'sin Thunderstroke no se ofrece');
});

test('fase 74: Prisma Compuesto exige Beam y Láser', () => {
  const game = mkGame(['beam']);
  const c = card('combo_light_prism');
  assert.equal(isCardEligible(c, game), false);
  game.fortress.addTower('laser');
  assert.equal(isCardEligible(c, game), true);
  applyCard(c, game);
  assert.equal(unitMods(findTower(game, 'beam')).beamRampPerSecAdd, 0.4);
  assert.equal(unitMods(findTower(game, 'laser')).laserDurationAdd, 0.6);
});

// ------------------------------------------------------------
// Black Hole
// ------------------------------------------------------------

function bhGame() {
  const game = mkGame(['guardian']);
  game.fortress.blackHoleUnlocked = true;
  game.fortress.blackHoleCharge = 1;
  game.fortress.bhReady = true;
  return game;
}

test('fase 74: Horizonte de Sucesos alarga y agranda el Black Hole', () => {
  const game = bhGame();
  applyCard(card('bh_horizon'), game);
  assert.equal(game.fortress.blackHoleMods.durationAdd, 1.5);
  assert.equal(game.fortress.blackHoleMods.radiusMul, 1.2);
  assert.equal(game.fortress.fireBlackHole(game), true);
  const bh = game.engine.entities.find((e) => e.constructor?.name === 'BlackHoleFx');
  assert.ok(bh, 'el vórtice se crea');
  assert.equal(bh.life, 5.5);
  assert.equal(bh.radius, 204);
});

test('fase 74: Colapso explota al terminar el Black Hole', () => {
  const game = bhGame();
  applyCard(card('bh_collapse'), game);
  game.fortress.fireBlackHole(game);
  const bh = game.engine.entities.find((e) => e.constructor?.name === 'BlackHoleFx');
  const victim = mkEnemy(bh.x, bh.y, 1000);
  game.fortress.enemies = [victim];
  bh.update(10);
  assert.equal(victim.hp, 850, '150 de daño en el radio');
});

test('fase 74: Singularidad exige Black Hole + explosivo y crea un mini BH', () => {
  const sinBh = mkGame(['missile']);
  assert.equal(isCardEligible(card('combo_singularity'), sinBh), false);
  const game = bhGame();
  assert.equal(isCardEligible(card('combo_singularity'), game), false,
    'sin una torre explosiva tampoco');
  game.fortress.addTower('mortar');
  assert.equal(isCardEligible(card('combo_singularity'), game), true);
  applyCard(card('combo_singularity'), game);
  assert.equal(game.fortress.blackHoleMods.singularity, 1);
  const mini = game.fortress.spawnMiniBlackHole(120, 240, game);
  assert.ok(mini, 'se crea el mini agujero negro');
  assert.equal(mini.mini, true);
  assert.equal(mini.radius, 80);
});
