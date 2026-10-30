// tests/test-towers.mjs — dev-7 fase 9
// Cubre towers.js: catálogo de torres/drones y escalado de daño/cadencia
// por nivel. El solo hecho de poder importar este archivo en Node ya es
// una REGRESIÓN cubierta: la fase 3 agregó `new Image()` a nivel de
// módulo sin guard (TOWER_CHASSIS_SPRITES) y rompía cualquier uso fuera
// de un navegador (encontrado al reconstruir balance-sim.mjs).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TOWERS, DRONES, Tower, Drone, Bullet, HomingMissile, MUZZLE_ACCENT,
  LaserStaticFx, projectileColor, levelPips, MAX_TOWER_LEVEL, WASPS, FIREWHEEL,
  TARGETING, targetingFor, pickByPolicy, targetInRange,
  MortarShell, BlackHoleFx, CraterFx, beamAimAngle, forcefieldBubbleR,
} from '../js/towers.js';
// El dial de presentación del arsenal (towers-data.js): los tests lo leen de
// la fuente en vez de repetir el 0,75.
import { dpsScaleFor } from '../js/towers-data.js';
import {
  applyProjectileHit, collideProjectiles, projectileRadius, Enemy,
} from '../js/enemies.js';
import { CATALOG, applyCard } from '../js/cards.js';
import { PERKS } from '../js/meta.js';
import { saveMeta, META_SLOW_CAP, perkDmgFor, metaDmgMul } from '../js/meta.js';
// fase 60: el arte de las torres vive en js/tower-art.js.
import { TOWER_PAD, TOWER_RIGS, RIG_KINDS, rigHotPoint, rigHotRadius } from '../js/tower-art.js';
import { TRAVERSE_AIM } from '../js/towers.js';
// fase 66: la banda de la Tesla y el rayo del Láser se atan al LAYOUT
// (fila/bandY/fallScale y el tamaño real del campo) — los tests lo leen
// de la fuente en vez de repetir números.
import { CONFIG, LAYOUT, MAX_TOWER_REACH } from '../js/engine.js';

test('towers.js se importa sin errores en Node (regresión: Image sin guard)', () => {
  // Si este archivo no pudo ni importarse, node --test ya habría fallado
  // antes de llegar acá — este test deja explícito QUÉ garantiza.
  assert.ok(TOWERS && Tower);
});

test('TOWERS: nombres únicos entre las 8 torres', () => {
  const names = Object.values(TOWERS).map((t) => t.name);
  assert.equal(new Set(names).size, names.length, `nombres duplicados: ${names.join(', ')}`);
});

test('DRONES: nombres únicos y sin chocar con TOWERS', () => {
  const towerNames = new Set(Object.values(TOWERS).map((t) => t.name));
  for (const d of Object.values(DRONES)) {
    assert.ok(!towerNames.has(d.name), `dron "${d.name}" choca con el nombre de una torre`);
  }
});

test('cards.js: toda carta unlock_* referencia una torre/dron que existe', () => {
  for (const c of CATALOG) {
    if (c.tower) assert.ok(TOWERS[c.tower], `carta ${c.id} apunta a torre inexistente '${c.tower}'`);
    if (c.drone) assert.ok(DRONES[c.drone], `carta ${c.id} apunta a dron inexistente '${c.drone}'`);
  }
});

test('Tower: instanciar cada tipo no tira (todas las 8 torres)', () => {
  for (const type of Object.keys(TOWERS)) {
    assert.doesNotThrow(() => new Tower(type, 100, 1), `Tower('${type}') tiró al construirse`);
  }
});

test('Tower.damage: crece con el nivel (1..5), nunca decrece', () => {
  for (const type of Object.keys(TOWERS)) {
    const t = new Tower(type, 100, 1);
    let prev = -Infinity;
    for (let lv = 1; lv <= 5; lv++) {
      t.level = lv;
      assert.ok(t.damage >= prev, `${type}: daño cae en nivel ${lv}`);
      prev = t.damage;
    }
  }
});

test('Tower.cooldown: baja (o igual) con el nivel — más cadencia, nunca menos', () => {
  // Beam es 100% continuo (damagePerSec, sin campo `cooldown` en TOWERS) —
  // no aplica este concepto, se excluye a propósito.
  for (const type of Object.keys(TOWERS).filter((t) => t !== 'beam')) {
    const t = new Tower(type, 100, 1);
    let prev = Infinity;
    for (let lv = 1; lv <= 5; lv++) {
      t.level = lv;
      assert.ok(t.cooldown <= prev + 1e-9, `${type}: cadencia empeora en nivel ${lv}`);
      prev = t.cooldown;
    }
  }
});

test('Tower.damage: dmgMul de cartas multiplica linealmente', () => {
  const t = new Tower('guardian', 100, 1);
  const base = t.damage;
  t.dmgMul = 2;
  assert.equal(t.damage, base * 2);
});

// ---------- fase 17: perks sistemáticos (consumo en proyectiles) ----------

/** Enemigo mínimo para colisiones (misma forma que Enemy.takeDamage). */
function mkEnemy(x, y, hp = 100, r = 10) {
  return {
    x, y, r, hp, dead: false, slowFactor: 1, stun: 0,
    takeDamage(n) { this.hp -= n; },
  };
}

test('applyProjectileHit: pierce atraviesa sin matar el proyectil (fase 17)', () => {
  // A = más avanzado (mayor y, el más amenazante); B = más arriba.
  const list = [mkEnemy(100, 506), mkEnemy(100, 500)];
  const p = { x: 100, y: 512, vx: 0, vy: -200, damage: 10, pierce: 2, dead: false };
  applyProjectileHit(p, list);
  assert.equal(list[0].hp, 90);  // A primero (mayor y)
  assert.equal(p.pierce, 1);
  p.y = 488;                     // la bala avanzó más allá de B (física real)
  applyProjectileHit(p, list);
  assert.equal(list[1].hp, 90);  // atraviesa a B
  assert.equal(p.pierce, 0);
});

test('applyProjectileHit: bounce re-apunta sin repetir al último golpeado', () => {
  const list = [mkEnemy(100, 506), mkEnemy(100, 500)];
  const p = { x: 100, y: 512, vx: 0, vy: -200, damage: 10, bounce: 2, dead: false };
  assert.equal(applyProjectileHit(p, list), false); // rebota: no muere
  assert.equal(list[0].hp, 90);                     // A (mayor y) primero
  assert.equal(p.bounce, 1);
  assert.equal(applyProjectileHit(p, list), false); // rebota de nuevo
  assert.equal(list[1].hp, 90);                     // B (sin repetir A)
  assert.equal(applyProjectileHit(p, list), true);  // sin rebotes → muere
  assert.equal(list[0].hp, 80);                     // tercer impacto vuelve a A
});

test('applyProjectileHit: slowOnHit y stunChance se aplican al impacto', () => {
  const e = mkEnemy(100, 500);
  applyProjectileHit({
    x: 100, y: 512, vx: 0, vy: -100, damage: 5,
    slowOnHit: 0.25, stunChance: 1, dead: false,
  }, [e]);
  assert.equal(e.slowFactor, 0.75);
  assert.equal(e.stun, 0.5);
});

test('applyProjectileHit: critChance/critMul disparan daño crítico propio', () => {
  const orig = Math.random;
  try {
    Math.random = () => 0.01; // siempre crit
    const e = mkEnemy(100, 500);
    applyProjectileHit({
      x: 100, y: 512, vx: 0, vy: -100, damage: 10,
      critChance: 0.5, critMul: 3, dead: false,
    }, [e]);
    assert.equal(e.hp, 70); // 10 × 3
    Math.random = () => 0.99; // nunca crit
    const e2 = mkEnemy(100, 500);
    applyProjectileHit({
      x: 100, y: 512, vx: 0, vy: -100, damage: 10,
      critChance: 0.5, critMul: 3, dead: false,
    }, [e2]);
    assert.equal(e2.hp, 90); // daño normal
  } finally { Math.random = orig; }
});

test('applyProjectileHit: splash propaga slow/stun/crit a todos los del radio', () => {
  const list = [mkEnemy(200, 300), mkEnemy(210, 310)];
  applyProjectileHit({
    x: 200, y: 300, damage: 10, splashR: 60, dead: false,
    slowOnHit: 0.15, stunChance: 1,
  }, list);
  assert.equal(list[0].hp, 90);
  assert.equal(list[1].hp, 90);
  assert.equal(list[0].slowFactor, 0.85);
  assert.equal(list[1].stun, 0.5);
});

// ---------- fase 73: CCD (colisión barrida) de proyectiles rápidos ----------

test('CCD: una bala rápida no se salta a una espora entre frames', () => {
  const b = new Bullet(100, 512, 0, { speed: 920, damage: 10, radius: 4 });
  const e = mkEnemy(100, 480, 100, 7); // espora: r 7 + bala 4 = 11 px
  b.update(0.05); // 46 px de avance: 512 → 466, pasa de largo el centro
  assert.ok(b.y < e.y, 'la bala ya pasó al enemigo en este frame');
  assert.equal(applyProjectileHit(b, [e]), true);
  assert.equal(e.hp, 90, 'el sweep del segmento sí la alcanza');
});

test('CCD: no pega a un enemigo que quedó DETRÁS del recorrido', () => {
  const b = new Bullet(100, 512, 0, { speed: 920, damage: 10, radius: 4 });
  const e = mkEnemy(100, 530, 100, 7); // detrás del spawn
  b.update(0.05);
  assert.equal(applyProjectileHit(b, [e]), false);
  assert.equal(e.hp, 100);
});

test('Bullet: acepta opts de perks sistemáticos (fase 17)', () => {
  const b = new Bullet(0, 0, 0, {
    bounce: 2, slowOnHit: 0.2, stunChance: 0.3,
    critChance: 0.1, critMul: 2.5,
  });
  assert.equal(b.bounce, 2);
  assert.equal(b.slowOnHit, 0.2);
  assert.equal(b.stunChance, 0.3);
  assert.equal(b.critChance, 0.1);
  assert.equal(b.critMul, 2.5);
  // ausencia de claves = comportamiento histórico (defaults inocuos)
  const plain = new Bullet(0, 0, 0);
  assert.equal(plain.bounce, 0);
  assert.equal(plain.critChance, 0);
});

test('HomingMissile: homingStrength escala el turnRate (fase 17)', () => {
  const m0 = new HomingMissile(0, 0, null, {}, null, { homing: 0 });
  const m1 = new HomingMissile(0, 0, null, {}, null, { homing: 2 });
  assert.ok(m1.turnRate > m0.turnRate, 'el misil con homing debe girar más rápido');
});

test('fase 75: mortero y misil no se consumen como balas directas', () => {
  const enemies = [mkEnemy(100, 480, 100), mkEnemy(110, 490, 100)];
  const game = {
    engine: {
      entities: [],
      spawnParticles() {}, addEffect() {}, shake() {},
      addEntity(e) { this.entities.push(e); },
    },
    fortress: { enemies, spawnMiniBlackHole() {} },
  };
  const shell = new MortarShell(100, 500, enemies[0], game, 45, 150, null);
  game.engine.entities.push(shell);
  collideProjectiles(game.engine, enemies);
  assert.equal(shell.dead, false, 'el obús debe seguir vivo hasta detonar');
  assert.equal(enemies[0].hp, 100, 'no debe pegar como bala directa');

  shell.t = 1;
  shell.update(0.01); // fuerza la detonación
  assert.equal(shell.dead, true);
  assert.ok(enemies[0].hp < 100 && enemies[1].hp < 100,
    'la explosión debe dañar a ambos enemigos del radio');

  const missile = new HomingMissile(100, 500, enemies[0], game, 45, {});
  game.engine.entities.push(missile);
  collideProjectiles(game.engine, enemies);
  assert.equal(missile.dead, false, 'el misil tampoco debe consumirse al rozar');
});

test('fase 75: el Campo de Fuerza usa un dwell finito y no persigue waypoint con blanco', () => {
  const juego = mkGame();
  const dr = new Drone('forcefield', juego, 0);
  const e = mkTank(dr.x, dr.y);
  juego.fortress.enemies = [e];
  dr.fwTarget = e;
  dr.fwState = 'advance';
  dr.x = e.x;
  dr.y = e.y;
  dr._wp = { x: e.x + 1000, y: e.y };
  dr.update(0.016, [e]);
  assert.ok(Number.isFinite(dr._sweepT) && dr._sweepT > 0,
    `el dwell debe ser finito (quedó en ${dr._sweepT})`);
  assert.equal(dr._wp, null, 'con blanco no debe conservar un waypoint viejo');
});

test('fase 76.1: la burbuja del Campo de Fuerza tiene base 120 y tope duro 190', () => {
  setPerks({});
  const juego = mkGame();
  const dr = new Drone('forcefield', juego, 0);
  assert.equal(forcefieldBubbleR(dr), 120, 'la base bajó de 140 a 120');
  // Aunque el canal de cartas/perks sume muchísimo, el radio no pasa el tope.
  dr.cardMods = { radiusAdd: 500 };
  assert.equal(forcefieldBubbleR(dr), 190);
  assert.equal(dr.data.maxBubbleR, 190);
  delete dr.cardMods;
});

test('fase 76.1: la Rueda de Fuego patrulla sin volver a la base', () => {
  setPerks({});
  const juego = mkGame();
  const dr = new Drone('firewheel', juego, 0);
  dr.x = 120;
  dr.y = 220;
  // Waypoint cercano y hacia arriba: si volviera a la base, y subiría.
  dr._wp = { x: 120, y: 170 };
  juego.fortress.enemies = [];
  dr.update(0.2, []);
  assert.equal(dr.fwState, 'patrol');
  assert.ok(dr.y < 220, `debe patrullar hacia el waypoint, no hacia la base (y=${dr.y})`);
  assert.ok(dr.y >= 120, 'la patrulla no sale del campo de batalla');
  assert.notEqual(dr.fwState, 'orbit', 'ya no existe la órbita de regreso');

  // Al aparecer un enemigo, deja el waypoint y avanza desde donde está.
  const e = mkTank(dr.x, 100);
  juego.fortress.enemies = [e];
  dr.update(0.01, [e]);
  assert.equal(dr.fwState, 'advance');
  assert.equal(dr._wp, null, 'el blanco manda sobre la patrulla');

  // Cuando el blanco muere, vuelve a patrullar sin ir a la base.
  e.dead = true;
  const yAntes = dr.y;
  dr.update(0.2, [e]);
  assert.equal(dr.fwState, 'patrol');
  assert.ok(Math.abs(dr.y - yAntes) < 200, 'se queda cerca del último combate');
});

test('fase 75: el Black Hole arrastra también el ancla de drift/zigzag', () => {
  const juego = mkGame();
  const e = new Enemy('meteor', 200, { game: juego, y: 400 });
  juego.fortress.enemies = [e];
  const bh = new BlackHoleFx(juego, {
    x: 100, y: 400, duration: 4, radius: 170, pull: 260,
  });
  bh.update(0.1);
  assert.ok(e.entryX < 200, `entryX debe acercarse al vórtice (quedó en ${e.entryX})`);
  assert.ok(e.x < 200, `x debe acercarse al vórtice (quedó en ${e.x})`);
});

test('HomingMissile._explode: splash propaga los debuffs/crit de perks', () => {
  const enemies = [mkEnemy(200, 300, 100)];
  const game = { engine: { spawnParticles() {}, addEffect() {} }, fortress: { enemies } };
  const m = new HomingMissile(200, 320, enemies[0], game, 100, {
    slowOnHit: 0.2, stunChance: 1, critChance: 0, critMul: 2,
  });
  m._explode();
  assert.ok(enemies[0].hp < 100, 'el splash del misil pegó');
  assert.equal(enemies[0].slowFactor, 0.8);
  assert.equal(enemies[0].stun, 0.5);
});

test('Tower(laser).fire(): con el perk "+1 disparo simultáneo" activo, dispara 2 LaserStaticFx (fase 22)', () => {
  const data = new Map();
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  // Tier 0 (índice 0), rama A: '+1 disparo simultáneo' (extraCount:1).
  saveMeta({ perkChoices: { laser: [0, null, null, null, null, null, null, null, null, null] } }, storage);

  const added = [];
  const game = {
    fortress: {},
    engine: { addEntity: (e) => added.push(e), emit: () => {}, _t: 0 },
  };
  const t = new Tower('laser', 0, 1, 0);
  t.game = game;
  const enemies = [
    { x: 10, y: 300, dead: false, r: 10 },
    { x: -10, y: 250, dead: false, r: 10 },
  ];
  t.fire(enemies, game);
  assert.equal(added.length, 2, 'debería disparar un LaserStaticFx por blanco (1 base + 1 de perk)');

  saveMeta({}, storage); // limpio el perk para no afectar otros tests de este archivo
});

test('fase 24: executeThreshold REMATA un enemigo bajo el umbral (mecánica nueva en combate real)', () => {
  // Enemigo con 100 HP máx y 12 de vida; golpe de 5 de daño. Sin remate
  // quedaría en 7 HP. Con executeThreshold 0.15 (15% de 100 = 15), como
  // 12-5=7 <= 15 → el golpe lo deja en 0 (remate).
  const e = { x: 0, y: 0, r: 10, hp: 12, hpMax: 100, dead: false, slowFactor: 1, stun: 0,
    takeDamage(n) { this.hp -= n; if (this.hp <= 0) this.dead = true; } };
  const p = { x: 0, y: 0, vx: 0, vy: 0, damage: 5, r: 3, executeThreshold: 0.15,
    critChance: 0, game: null, dead: false, pierce: 0, bounces: 0 };
  applyProjectileHit(p, [e]);
  assert.equal(e.hp, 0, 'el enemigo debía quedar rematado (hp 0), no en 7');
});

test('fase 24: lifesteal cura al escudo de la base con el daño hecho', () => {
  const e = { x: 0, y: 0, r: 10, hp: 100, hpMax: 100, dead: false, slowFactor: 1, stun: 0,
    takeDamage(n) { this.hp -= n; } };
  const game = { fortress: { hp: 500, maxHp: 1000 } };
  const p = { x: 0, y: 0, vx: 0, vy: 0, damage: 40, r: 3, lifesteal: 0.10,
    critChance: 0, game, dead: false, pierce: 0, bounces: 0 };
  applyProjectileHit(p, [e]);
  assert.ok(Math.abs(game.fortress.hp - 504) < 1e-9, `esperaba 504 (500 + 10% de 40), dio ${game.fortress.hp}`);
});

// ---------- fase 25 · paso 2: cobertura de las mecánicas de perks sin test ----------

function setPerks(choices) {
  const data = new Map();
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  saveMeta({ perkChoices: choices }, storage);
}
function mkGame(extra = {}) {
  return {
    fortress: { hp: 500, maxHp: 1000, enemies: [] },
    engine: { _t: 0, addEntity() {}, addEffect() {}, emit() {}, spawnParticles() {}, floatText() {}, sfxSafe() {} },
    ...extra,
  };
}

test('explodeOnKill: al matar, la explosión daña a los vecinos cercanos y no a los lejanos', () => {
  const mk = (x, hp) => ({ x, y: 0, r: 10, hp, hpMax: 100, dead: false, slowFactor: 1, stun: 0,
    takeDamage(n) { this.hp -= n; if (this.hp <= 0) this.dead = true; return this.dead; } });
  const victim = mk(0, 5), near = mk(40, 100), far = mk(400, 100);
  const p = { x: 0, y: 0, vx: 0, vy: 0, damage: 50, r: 3, critChance: 0, dead: false, pierce: 0,
    bounces: 0, explodeOnKillChance: 1, explodeOnKillDmg: 30, explodeOnKillRadius: 70, game: null };
  applyProjectileHit(p, [victim, near, far]);
  assert.ok(victim.dead, 'la víctima debía morir');
  assert.equal(near.hp, 70, 'el vecino cercano debía recibir 30 de explosión');
  assert.equal(far.hp, 100, 'el lejano no debía recibir daño');
});

test('crítico: critChance 1 y critMul 3 triplican el daño del impacto', () => {
  const e = { x: 0, y: 0, r: 10, hp: 1000, hpMax: 1000, dead: false, slowFactor: 1, stun: 0,
    takeDamage(n) { this.hp -= n; return false; } };
  const p = { x: 0, y: 0, vx: 0, vy: 0, damage: 10, r: 3, critChance: 1, critMul: 3, dead: false,
    pierce: 0, bounces: 0, game: null };
  applyProjectileHit(p, [e]);
  assert.equal(e.hp, 970, 'esperaba 10 x 3 = 30 de daño');
});

test('Campo de Fuerza: espinas (thornDps) dañan a lo que está dentro de la burbuja', () => {
  setPerks({ forcefield: [0] }); // tier 1, rama A: thornDps 12
  const game = mkGame();
  const dr = new Drone('forcefield', game, 0);
  const e = { x: dr.x, y: dr.y, r: 10, hp: 1000, hpMax: 1000, dead: false, slowFactor: 1, stun: 0,
    takeDamage(n) { this.hp -= n; return false; } };
  game.fortress.enemies = [e];
  dr.update(0.5, [e]);
  assert.ok(e.hp < 1000, `las espinas debían dañar al enemigo (hp ${e.hp})`);
  setPerks({});
});

test('Campo de Fuerza: regeneración (bubbleRegen) cura el escudo por enemigo atrapado', () => {
  setPerks({ forcefield: [1] }); // tier 1, rama B: bubbleRegen 1.5
  const game = mkGame();
  const dr = new Drone('forcefield', game, 0);
  const e = { x: dr.x, y: dr.y, r: 10, hp: 1000, hpMax: 1000, dead: false, slowFactor: 1, stun: 0,
    takeDamage() { return false; } };
  game.fortress.enemies = [e];
  dr.update(1, [e]);
  assert.ok(game.fortress.hp > 500, `el escudo debía curarse (hp ${game.fortress.hp})`);
  setPerks({});
});

test('areaTargetsAdd: Thunderstroke con +1 objetivo golpea a más enemigos que sin él', () => {
  const run = () => {
    const game = mkGame();
    const t = new Tower('thunderstroke', 100, 1, 0);
    // 6 enemigos agrupados dentro del radio de área (130 px): el rayo
    // principal + 3 mini rayos base dejan 2 afuera; chainFork suma +1.
    const es = [0, 1, 2, 3, 4, 5].map((i) => ({
      x: 100 + i * 10, y: 100, r: 10, hp: 5000, hpMax: 5000,
      dead: false, slowFactor: 1, stun: 0, takeDamage(n) { this.hp -= n; return false; },
    }));
    t.fire(es, game);
    return es.filter((e) => e.hp < 5000).length;
  };
  setPerks({});
  const sin = run();
  setPerks({ thunderstroke: [null, null, 0] }); // tier 3, rama A: +1 objetivo de área
  const con = run();
  setPerks({});
  assert.equal(sin, 4, 'sin perks: principal + 3 mini rayos');
  assert.equal(con, 5, 'con +1 objetivo: principal + 4 mini rayos');
  assert.ok(con > sin, `el objetivo extra debía golpear a más enemigos (sin ${sin}, con ${con})`);
});

// ---------- fase 25 · paso 4: señal de activación de perks raros ----------

function fxGame() {
  const log = { floats: [], emits: [] };
  const game = {
    fortress: { hp: 500, maxHp: 1000 },
    engine: { _t: 0, spawnParticles() {},
      floatText: (x, y, text) => log.floats.push(text),
      emit: (name, payload) => log.emits.push([name, payload]) },
  };
  return { game, log };
}
const mkVictim = (x, hp) => ({ x, y: 0, r: 10, hp, hpMax: 100, dead: false, slowFactor: 1, stun: 0,
  takeDamage(n) { this.hp -= n; if (this.hp <= 0) this.dead = true; return this.dead; } });
const mkShot = (game, extra) => ({ x: 0, y: 0, vx: 0, vy: 0, damage: 5, r: 3, critChance: 0,
  dead: false, pierce: 0, bounces: 0, game, ...extra });

test('señal: un remate que hizo falta muestra "¡REMATE!" y emite perk:proc', () => {
  const { game, log } = fxGame();
  applyProjectileHit(mkShot(game, { executeThreshold: 0.15 }), [mkVictim(0, 12)]);
  assert.deepEqual(log.floats, ['¡REMATE!']);
  assert.deepEqual(log.emits, [['perk:proc', { kind: 'execute' }]]);
});

test('señal: NO hay "¡REMATE!" si el golpe normal ya mataba al enemigo', () => {
  const { game, log } = fxGame();
  applyProjectileHit(mkShot(game, { executeThreshold: 0.15, damage: 50 }), [mkVictim(0, 12)]);
  assert.equal(log.floats.length, 0, 'el golpe ya lo mataba: el remate no aportó nada');
});

test('señal: explosión al matar muestra "¡BOOM!"', () => {
  const { game, log } = fxGame();
  applyProjectileHit(mkShot(game, { damage: 50, explodeOnKillChance: 1 }), [mkVictim(0, 5), mkVictim(30, 100)]);
  assert.deepEqual(log.floats, ['¡BOOM!']);
  assert.equal(log.emits[0][1].kind, 'boom');
});

test('señal: límite de frecuencia — dos remates en el mismo instante dan una sola señal', () => {
  const { game, log } = fxGame();
  const a = mkVictim(0, 12), b = mkVictim(200, 12);
  applyProjectileHit(mkShot(game, { executeThreshold: 0.15 }), [a]);
  applyProjectileHit(mkShot(game, { executeThreshold: 0.15, x: 200 }), [b]);
  assert.ok(a.dead && b.dead, 'ambos debían morir');
  assert.equal(log.floats.length, 1, 'el segundo se descarta por el límite de 0.15 s');
});

test('identidad: las espinas del Campo de Fuerza matan sin remate (ya no ejecutan)', () => {
  setPerks({ forcefield: [null, null, 0] }); // tier 3 A: espinas 10/s base
  const { game, log } = fxGame();
  game.fortress.enemies = [];
  const dr = new Drone('forcefield', game, 0);
  const e = mkVictim(dr.x, 3);
  e.y = dr.y;
  game.fortress.enemies = [e];
  // espinas: 10 x 0,75 (dial) x 0,5 s = 3,75 -> muere por daño, no por remate
  dr.update(0.5, [e]);
  assert.ok(e.dead, 'el enemigo debía morir por las espinas');
  assert.deepEqual(log.floats, [], 'el Campo de Fuerza ya no tiene remate: no hay señal');
  setPerks({});
});

// ============================================================
// dev-7 fase 28 — el arsenal extendido (drones) jugaba con reglas
// rotas: las espinas del Campo de Fuerza NO escalaban con el meta
// (21 niveles de meta sin efecto), el tope combinado del slow
// (0.60) anulaba la curva del meta (0.75) y las 3 cartas de daño
// de dron eran INERTES (nadie leía su `dmgMul`).
// ============================================================

/**
 * Fija el meta de test: nivel por torreta + elección de perks (0 = rama
 * A, 1 = rama B, null = tier sin elegir). `saveMeta` refresca la caché
 * global, así que `currentMeta()` —la que leen towers.js y meta.js—
 * ve estos datos durante el test.
 */
function setMeta({ levels = {}, perks = {} } = {}) {
  const data = new Map();
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  saveMeta({ levels, perkChoices: perks }, storage);
  return storage;
}

/** Enemigo que no muere nunca (para medir daño exacto). */
function mkTank(x, y, hp = 1e6) {
  return {
    x, y, r: 10, hp, hpMax: hp, dead: false, slowFactor: 1, stun: 0,
    takeDamage(n) { this.hp -= n; return false; },
  };
}

test('fase 28: las espinas del Campo de Fuerza ESCALAN con el nivel meta (antes eran planas)', () => {
  // Misma elección de perk (tier 1 A: "Campo de espinas" 12/s base) en
  // los dos casos: lo único que cambia es el nivel meta de la torreta.
  const medirEspinas = (lv) => {
    setMeta({ levels: { forcefield: lv }, perks: { forcefield: [0] } });
    const juego = mkGame();
    const dr = new Drone('forcefield', juego, 0);
    const e = mkTank(dr.x, dr.y);
    juego.fortress.enemies = [e];
    dr.update(0.5, [e]);
    // El DPS de espinas = perk (12) × meta × dial de presentación.
    return { dano: 1e6 - e.hp,
      esperado: 12 * metaDmgMul('forcefield') * 0.5 * dpsScaleFor('forcefield') };
  };
  const lv1 = medirEspinas(1);
  const lv50 = medirEspinas(50);
  setMeta({});

  assert.ok(lv1.dano > 0, 'las espinas deben dañar en Nvl.1');
  assert.ok(Math.abs(lv1.dano - lv1.esperado) < 1e-6,
    `Nvl.1 debe hacer 12 × 1.0 × 0.5 × ${dpsScaleFor('forcefield')} = 4.5 (hizo ${lv1.dano})`);
  assert.ok(lv50.dano > lv1.dano * 3,
    `Nvl.50 debe escalar el daño de las espinas (Nvl.1 ${lv1.dano}, Nvl.50 ${lv50.dano})`);
  assert.ok(Math.abs(lv50.dano - lv50.esperado) < 1e-6,
    `Nvl.50 debe hacer 12 × ${metaDmgMul('forcefield', { levels: { forcefield: 50 } })} × 0.5 × ${dpsScaleFor('forcefield')} (hizo ${lv50.dano})`);
  // El helper de meta.js es la fuente de verdad del DPS de espinas.
  setMeta({ levels: { forcefield: 50 }, perks: { forcefield: [0] } });
  assert.ok(perkDmgFor('forcefield') > 12,
    `perkDmgFor debe devolver el thornDps ESCALADO (${perkDmgFor('forcefield')})`);
  setMeta({});
});

test('fase 28: la carta de la Rueda de Fuego (dmg_firewheel) multiplica su daño ×1.6', () => {
  setMeta({}); // meta Nvl.1 y sin perks: daño base limpio
  const quemar = (mul) => {
    const juego = mkGame();
    const dr = new Drone('firewheel', juego, 0);
    dr.dmgMul = mul; // lo que escribe cards.js: (d.dmgMul ?? 1) * 1.6
    const e = mkTank(dr.x, dr.y);
    juego.fortress.enemies = [e];
    dr.update(0.5, [e]);
    return 1e6 - e.hp;
  };
  const base = quemar(1);
  const conCarta = quemar(1.6);
  setMeta({});
  assert.ok(base > 0, 'la rueda debe quemar al enemigo');
  assert.ok(Math.abs(conCarta / base - 1.6) < 1e-9,
    `la carta ×1.6 debe multiplicar el DPS quemado (${base} → ${conCarta})`);
});

test('fase 28: la carta de los Mosquitos (dmg_wasps) multiplica la picadura ×1.6', () => {
  setMeta({});
  const picar = (mul) => {
    const juego = mkGame();
    const dr = new Drone('wasps', juego, 0);
    dr.dmgMul = mul;
    const e = mkTank(dr.x, dr.y);
    juego.fortress.enemies = [e];
    dr.update(0.1, [e]); // 1er update: los mosquitos salen
    dr.update(1, [e]);   // 2do update: pican (3 picaduras)
    return 1e6 - e.hp;
  };
  const base = picar(1);
  const conCarta = picar(1.6);
  setMeta({});
  assert.ok(base > 0, 'los mosquitos deben picar');
  // La picadura se redondea a entero (12 → 19), así que la razón es ≈1.6.
  assert.ok(Math.abs(conCarta / base - 1.6) < 0.05,
    `la carta ×1.6 debe multiplicar la picadura (${base} → ${conCarta})`);
});

test('fase 28: la carta del Campo de Fuerza (dmg_forcefield) multiplica las espinas ×1.6', () => {
  const espinas = (mul) => {
    setMeta({ perks: { forcefield: [0] } }); // tier 1 A: espinas 12/s base
    const juego = mkGame();
    const dr = new Drone('forcefield', juego, 0);
    dr.dmgMul = mul;
    const e = mkTank(dr.x, dr.y);
    juego.fortress.enemies = [e];
    dr.update(0.5, [e]);
    return 1e6 - e.hp;
  };
  const base = espinas(1);
  const conCarta = espinas(1.6);
  setMeta({});
  assert.ok(base > 0, 'las espinas deben dañar');
  assert.ok(Math.abs(conCarta / base - 1.6) < 1e-9,
    `la carta ×1.6 debe multiplicar las espinas (${base} → ${conCarta})`);
});

test('fase 28: el tope COMBINADO del slow es META_SLOW_CAP (0.75), no 0.60', () => {
  // Meta Nvl.60 (la curva del dron satura en 0.75) + el perk "Campo
  // pegajoso" (+10%): con el tope viejo (0.60) el perk era MUERTO.
  setMeta({ levels: { forcefield: 60 }, perks: { forcefield: [null, 1] } });
  const juego = mkGame();
  const dr = new Drone('forcefield', juego, 0);
  const e = mkTank(dr.x, dr.y);
  juego.fortress.enemies = [e];
  dr.update(0.016, [e]);
  const slow = 1 - e.slowFactor;
  setMeta({});
  assert.ok(slow > 0.60, `el slow combinado debe pasar el 0.60 (quedó en ${slow})`);
  assert.ok(Math.abs(slow - META_SLOW_CAP) < 1e-9,
    `el slow debe quedar en META_SLOW_CAP (${META_SLOW_CAP}), quedó en ${slow}`);
});

// ---------- fase 28: cada torre/dron tiene SU sonido de ataque ----------

/** Juego con un engine que registra los eventos emitidos. */
function sfxGame() {
  const emits = [];
  const juego = {
    fortress: { hp: 500, maxHp: 1000, enemies: [] },
    engine: {
      _t: 0, addEntity() {}, addEffect() {}, spawnParticles() {}, floatText() {}, sfxSafe() {},
      emit: (name) => emits.push(name),
    },
  };
  return { juego, emits };
}

test('fase 28: cada torre del arsenal emite SU evento de disparo (una vez por ráfaga)', () => {
  const CASOS = [
    ['missile', 'missile:fire'],
    ['gauss', 'gauss:fire'],
    ['thunderstroke', 'bolt:fire'],
    ['tesla', 'chain:fire'],
    ['mortar', 'mortar:fire'],
  ];
  for (const [type, evento] of CASOS) {
    const { juego, emits } = sfxGame();
    const t = new Tower(type, 100, 1, 400);
    t.game = juego;
    t.fire([mkTank(100, 500)], juego);
    assert.deepEqual(emits, [evento],
      `${type} debe emitir ${evento} (emitió ${JSON.stringify(emits)})`);
  }
});

test('fase 28: el Beam emite "beam:fire" al ENCENDERSE, no en cada frame', () => {
  const { juego, emits } = sfxGame();
  const t = new Tower('beam', 100, 1, 400);
  t.game = juego;
  t.update(0.1, [mkTank(100, 500)], juego);
  assert.deepEqual(emits, ['beam:fire'], 'el haz debe sonar al encenderse');
  t.update(0.1, [mkTank(100, 500)], juego);
  assert.equal(emits.length, 1, 'el haz no debe emitir un evento por frame');
});

test('fase 28: los drones emiten "drone:fire" una vez por tick de ataque', () => {
  // Rueda de Fuego: 3 enemigos quemados en el mismo frame = 1 evento.
  {
    const { juego, emits } = sfxGame();
    const dr = new Drone('firewheel', juego, 0);
    const es = [0, 1, 2].map(() => mkTank(dr.x, dr.y));
    juego.fortress.enemies = es;
    dr.update(0.5, es);
    assert.deepEqual(emits, ['drone:fire'],
      `la rueda debe emitir UN evento por tick (emitió ${JSON.stringify(emits)})`);
  }
  // Mosquitos: los 3 mosquitos que pican en el mismo frame = 1 evento.
  {
    const { juego, emits } = sfxGame();
    const dr = new Drone('wasps', juego, 0);
    const e = mkTank(dr.x, dr.y);
    juego.fortress.enemies = [e];
    dr.update(0.1, [e]);
    dr.update(1, [e]);
    assert.deepEqual(emits, ['drone:fire'],
      `los mosquitos deben emitir UN evento por tick (emitió ${JSON.stringify(emits)})`);
  }
  // Campo de Fuerza: el campo con enemigos adentro = 1 evento.
  {
    const { juego, emits } = sfxGame();
    const dr = new Drone('forcefield', juego, 0);
    const e = mkTank(dr.x, dr.y);
    juego.fortress.enemies = [e];
    dr.update(0.016, [e]);
    assert.deepEqual(emits, ['drone:fire'],
      `el campo debe emitir UN evento por tick (emitió ${JSON.stringify(emits)})`);
  }
});

// ---------- fase 28: firma visual del arsenal avanzado ----------

/** ctx2D de mentira: registra los colores con los que se PINTA. */
function recCtx() {
  const fills = [];
  const rects = [];
  const ellipses = [];
  const arcs = [];
  const ctx = {
    fills, rects, ellipses, arcs,
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setLineDash() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, clip() {},
    bezierCurveTo() {}, quadraticCurveTo() {}, rect() {}, strokeRect() {}, drawImage() {},
    arc(x, y, r) { arcs.push({ x, y, r, style: ctx.fillStyle, stroke: ctx.strokeStyle, alpha: ctx.globalAlpha }); },
    ellipse(x, y, rx, ry, rot, a0, a1) {
      ellipses.push({ x, y, rx, ry, a0, a1, style: ctx.strokeStyle, fill: ctx.fillStyle, width: ctx.lineWidth });
    },
    stroke() {},
    fill() { fills.push(ctx.fillStyle); },
    fillRect(x, y, w, h) {
      fills.push(ctx.fillStyle);
      rects.push({ x, y, w, h, style: ctx.fillStyle, alpha: ctx.globalAlpha });
    },
    fillStyle: '', strokeStyle: '', shadowColor: '', shadowBlur: 0,
    globalAlpha: 1, lineWidth: 1, lineCap: 'butt', globalCompositeOperation: 'source-over',
    fillText() {}, strokeText() {}, font: '', textAlign: 'left', textBaseline: 'alphabetic',
  };
  return ctx;
}

test('fase 28: Láser, Thunderstroke, Tesla y Gauss tienen 4 firmas visuales DISTINTAS', () => {
  // [tipo de torre, kind de TOWERS (la clave de MUZZLE_ACCENT)]
  const CASOS = [
    ['laser', 'laser'],
    ['thunderstroke', 'bolt'],
    ['tesla', 'chain'],
    ['gauss', 'gauss'],
  ];
  const firmas = new Set();
  for (const [type, kind] of CASOS) {
    const t = new Tower(type, 100, 1, 0);
    t.game = { engine: { _t: 0 } };
    const ctx = recCtx();
    t.render(ctx);
    const pintados = new Set(ctx.fills);
    assert.ok(pintados.has(MUZZLE_ACCENT[kind]),
      `${type} debe pintar con su color de firma ${MUZZLE_ACCENT[kind]}`);
    firmas.add(MUZZLE_ACCENT[kind]);
  }
  assert.equal(firmas.size, 4,
    `las 4 torres deben tener 4 colores distintos (hay ${firmas.size})`);
});

// ============================================================
// dev-7 fase 29 — PRESENCIA: color del proyectil por torre,
// pips de nivel, realce de disparo y haces con cuerpo.
// ============================================================

/** Dispara una torre y devuelve lo que generó (entidades y efectos). */
function shotDe(type, y = 400) {
  const entidades = [];
  const efectos = [];
  const juego = {
    fortress: {},
    engine: {
      _t: 0,
      addEntity: (e) => entidades.push(e),
      addEffect: (e) => efectos.push(e),
      emit: () => {}, spawnParticles: () => {}, sfxSafe: () => {},
    },
  };
  const t = new Tower(type, 100, 1, y);
  t.game = juego;
  t.fire([mkTank(100, 500)], juego);
  return { t, entidades, efectos, juego };
}

test('fase 29: projectileColor devuelve el color de firma de cada una de las 8 torres', () => {
  const ESPERADO = {
    guardian: '#35C8FF',      // azul
    missile: '#FFB36A',       // naranja
    beam: '#39FF6A',          // verde
    mortar: '#FFD24A',        // ámbar
    thunderstroke: '#FFB347', // ámbar (firma de la boca)
    tesla: '#33E0FF',         // cian (firma de la boca)
    gauss: '#FF5CC8',         // magenta (firma de la boca)
    laser: '#9DFF3C',         // lima (firma de la boca)
  };
  for (const [type, color] of Object.entries(ESPERADO)) {
    assert.equal(projectileColor(type), color,
      `${type}: el proyectil debe ser ${color}`);
  }
  // Cada torre tiene SU color (nada de "todas azules").
  assert.equal(new Set(Object.values(ESPERADO)).size, Object.keys(ESPERADO).length,
    'las 8 torres deben tener 8 colores de proyectil distintos');
});

test('fase 29: el proyectil que sale de la torre va pintado con SU color', () => {
  // Guardian → bala azul
  {
    const { entidades } = shotDe('guardian');
    assert.ok(entidades[0] instanceof Bullet, 'el Guardian debe disparar balas');
    assert.equal(entidades[0].color, '#35C8FF');
  }
  // Gauss → perdigón magenta (antes salía cian, como el resto)
  {
    const { entidades } = shotDe('gauss');
    assert.ok(entidades[0] instanceof Bullet, 'el Gauss debe disparar balas');
    assert.equal(entidades[0].color, '#FF5CC8');
  }
  // Mortar → obús ámbar (la clave del color es `tint`, NO `color`: el
  // nombre `color` cambiaría el radio de impacto del obús — enemies.js
  //:projectileRadius — y con él el balance).
  {
    const { entidades } = shotDe('mortar');
    assert.equal(entidades[0].tint, TOWERS.mortar.accent);
    assert.equal(entidades[0].tint, '#FFD24A');
    assert.equal(entidades[0].color, undefined,
      'el obús no debe tener `color` (cambia su radio de impacto)');
  }
  // Thunderstroke → descarga ámbar · Tesla → cadena cian
  {
    const { efectos } = shotDe('thunderstroke');
    assert.equal(efectos[0].colors.color, '#FFB347');
  }
  {
    const { efectos } = shotDe('tesla');
    assert.equal(efectos[0].colors.color, '#33E0FF');
  }
  // Láser → rayo lima
  {
    const { entidades } = shotDe('laser');
    assert.ok(entidades[0] instanceof LaserStaticFx, 'el Láser debe encender su rayo');
    assert.equal(entidades[0].color, '#9DFF3C');
  }
  // Missile → misil naranja (su estela es el acento de la torre)
  {
    const { entidades } = shotDe('missile');
    assert.ok(entidades[0] instanceof HomingMissile, 'el Missile debe lanzar misiles');
    assert.equal(TOWERS.missile.trailColor, projectileColor('missile'));
  }
});

test('fase 29: levelPips traduce el nivel de la run al número de pips (1-5)', () => {
  assert.equal(levelPips(1), 1);
  assert.equal(levelPips(3), 3);
  assert.equal(levelPips(5), 5);
  assert.equal(levelPips(0), 0, 'nivel 0 → sin pips');
  assert.equal(levelPips(-3), 0, 'nivel negativo → sin pips');
  assert.equal(levelPips(9), MAX_TOWER_LEVEL, 'nunca más de 5 (tope de la run)');
  // En todo el rango: ni negativos ni por encima del tope.
  for (let lv = -5; lv <= 12; lv++) {
    const n = levelPips(lv);
    assert.ok(n >= 0, `nivel ${lv}: los pips no pueden ser negativos (${n})`);
    assert.ok(n <= MAX_TOWER_LEVEL, `nivel ${lv}: los pips no pueden pasar de 5 (${n})`);
  }
});

test('fase 60: el pad dibuja un tick por nivel, en el color de acento de la torre', () => {
  // fase 60: los pips que flotaban debajo de la torre (a 22 px, sobre la
  // plataforma, junto al glifo del tipo de daño: se leía como un código
  // de barras) se mudaron al ANILLO DEL PAD. Ahora el nivel se ve siempre
  // — 1 tick encendido en Lv.1, 5 en Lv.5 — porque el pad es el
  // indicador de "qué tier es esta torre", comparable de un vistazo entre
  // dos torres de la misma fila.
  const CASOS = [['guardian', 3, 3], ['mortar', 5, 5], ['beam', 1, 1], ['gauss', 0, 0]];
  for (const [type, lv, esperado] of CASOS) {
    const t = new Tower(type, 100, lv, 0);
    t.game = { engine: { _t: 0 } };
    const ctx = recCtx();
    t.render(ctx);
    const ticks = ctx.ellipses.filter((e) => e.rx === TOWER_PAD.ring.rx && e.ry === TOWER_PAD.ring.ry);
    assert.equal(ticks.length, TOWER_PAD.tick.count,
      `${type} Nvl.${lv}: el pad dibuja ${TOWER_PAD.tick.count} ticks (dibujó ${ticks.length})`);
    const encendidos = ticks.filter((e) => e.style === TOWERS[type].accent);
    assert.equal(encendidos.length, esperado,
      `${type} Nvl.${lv}: debe encender ${esperado} ticks (encendió ${encendidos.length})`);
    const apagados = ticks.filter((e) => e.style === TOWER_PAD.tick.idleColor);
    assert.equal(apagados.length, TOWER_PAD.tick.count - esperado,
      `${type} Nvl.${lv}: el resto de los ticks queda apagado`);
  }
});

test('fase 60: TODAS las torres de cañón/tubo apuntan a su blanco', () => {
  // Este test es el que faltaba: la regresión del Beam (el rediseño dejó
  // el lente fijo, cuando el arte viejo lo giraba con beamAimAngle) y el
  // Mortero (nunca giró) pasaron desapercibidos porque ningún test exigía
  // que las torres de cañón tuvieran un `_aim` distinto de 0.
  const juego = {
    fortress: {},
    engine: { _t: 0, addEntity() {}, addEffect() {}, emit() {}, spawnParticles() {}, sfxSafe() {} },
  };
  const APUNTAN = ['guardian', 'missile', 'beam', 'thunderstroke', 'tesla', 'mortar', 'gauss', 'laser'];
  const enemigo = (x) => ({ x, y: 200, hp: 10, dead: false, vx: 0, vy: 0, slowFactor: 1, vel: 0 });

  for (const type of APUNTAN) {
    const kind = TOWERS[type].kind;
    const t = new Tower(type, 270, 1, 400);
    t.game = juego;
    t.cooldownLeft = 99; // que no dispare: solo interesa el apuntado

    // Sin enemigos → pose de reposo (0 para todas menos el misil, que
    // descansa inclinado por su rack).
    t.update(0.016, [], juego);
    const reposo = t._aim;

    // Con un blanco bien a la DERECHA, el cañón tiene que moverse.
    t.targets = [];
    t.update(0.016, [enemigo(500)], juego);
    const gira = t._aim;
    const seMueve = Math.abs(gira - reposo) > 0.05;
    const esBobina = kind === 'bolt' || kind === 'chain';
    if (esBobina) {
      assert.ok(!seMueve, `${type}: una bobina omnidireccional no debería girar (${gira})`);
    } else {
      assert.ok(seMueve, `${type}: con un blanco a la derecha tiene que girar (${reposo} → ${gira})`);
      assert.ok(gira > 0, `${type}: el giro va hacia el blanco (positivo a la derecha), dio ${gira}`);
      // Y el giro está TOPEADO (un blanco en el borde no tumba el cañón).
      const limite = TRAVERSE_AIM[kind]?.limit ?? 1;
      assert.ok(Math.abs(gira) <= limite + 1e-9,
        `${type}: el giro está topeado a ±${limite} (dio ${gira})`);
    }
  }
});

test('fase 60: el Missile APUNTA a su blanco (el rack gira sobre el trípode)', () => {
  // Reportado por el usuario jugando: "la torre de misil no apunta, está
  // quieta, no gira". Tenía razón: el rack se dibujaba con una rotación
  // FIJA (-0.35 rad en el arte viejo, -0.62 en el rediseño) y update() solo
  // refrescaba el `_aim` del Guardian y del Gauss. Ahora el Missile gira
  // hacia su blanco SIN adelanto (el misil es teledirigido) y con tope.
  const juego = {
    fortress: {},
    engine: { _t: 0, addEntity() {}, addEffect() {}, emit() {}, spawnParticles() {}, sfxSafe() {} },
  };
  const torre = new Tower('missile', 270, 1, 400);
  torre.game = juego;
  torre.cooldownLeft = 99; // que no dispare: solo interesa el apuntado

  // Sin enemigos → vertical (0), igual que el resto del arsenal.
  torre.update(0.016, [], juego);
  assert.equal(torre._aim, 0, 'sin blanco el rack queda en su inclinación de reposo');

  // Enemigo a la DERECHA → el rack gira a la derecha (+).
  const derecha = { x: 270 + 180, y: 200, hp: 10, dead: false, vx: 0, vy: 0, slowFactor: 1, vel: 0 };
  torre.update(0.016, [derecha], juego);
  assert.ok(torre._aim > 0.2, `con el blanco a la derecha el rack gira a + (${torre._aim})`);

  // Enemigo a la IZQUIERDA → gira a la izquierda (−).
  const izquierda = { x: 270 - 180, y: 200, hp: 10, dead: false, vx: 0, vy: 0, slowFactor: 1, vel: 0 };
  torre.targets = []; // el blanco es STICKY: hay que soltarlo para re-adquirir
  torre.update(0.016, [izquierda], juego);
  assert.ok(torre._aim < -0.2, `con el blanco a la izquierda el rack gira a − (${torre._aim})`);

  // Y el giro está TOPEADO: un blanco en el borde no tumba el rack.
  const borde = { x: 0, y: 830, hp: 10, dead: false, vx: 0, vy: 0, slowFactor: 1, vel: 0 };
  torre.targets = [];
  torre.update(0.016, [borde], juego);
  assert.ok(Math.abs(torre._aim) <= TRAVERSE_AIM.homing.limit + 1e-9,
    `el giro del Missile está topeado a ±${TRAVERSE_AIM.homing.limit} rad (dio ${torre._aim})`);
});

test('fase 60: el fogonazo sale de la BOCA real de cada torre, no de un punto fijo', () => {
  // Regresión: el render calculaba la boca con un `(0,-52)` por defecto y
  // solo la recalculaba para el Guardian, el Gauss y 3 del arsenal
  // avanzado. El Missile (cañón rotado) y el Mortar (-0.55 rad)
  // dejaban el fogonazo flotando en el aire, a 19 px de su tubo.
  for (const type of Object.keys(TOWERS)) {
    const t = new Tower(type, 100, 1, 0);
    t.game = { engine: { _t: 0 } };
    t.firing = true;
    const ctx = recCtx();
    t.render(ctx);
    const rig = TOWER_RIGS[TOWERS[type].kind];
    const [hx, hy] = rigHotPoint(rig, 0);
    const hotR = rigHotRadius(rig);
    // El punto de poder de la boca se pinta con el color de firma y en el
    // radio exacto del fogonazo (hotR × 0.85): así el test no se conforma
    // con la lente del rig, que es otra pieza.
    const firma = MUZZLE_ACCENT[TOWERS[type].kind] ?? TOWERS[type].accent;
    const bocas = ctx.arcs.filter(
      (a) => a.style === firma && Math.abs(a.x - hx) < 0.01 && Math.abs(a.y - hy) < 0.01
        && Math.abs(a.r - hotR * 0.85) < 0.01,
    );
    assert.ok(bocas.length >= 1,
      `${type}: el fogonazo debe salir de (${hx}, ${hy}) — la boca que declara su rig`);
    // Y la boca tiene que estar DENTRO de la caja de la silueta: si el
    // rig mueve el cañón, el ancla de la boca no puede quedarse atrás.
    const bb = rig.bbox;
    assert.ok(hy >= bb.y - 8 && hy <= bb.y + bb.h + 8 && Math.abs(hx) <= Math.abs(bb.x) + 12,
      `${type}: la boca (${hx}, ${hy}) cae fuera de la silueta ${JSON.stringify(bb)}`);
  }
});

test('fase 29: el realce de disparo se enciende al disparar y se apaga solo', () => {
  const juego = {
    fortress: {},
    engine: { _t: 0, addEntity() {}, addEffect() {}, emit() {}, spawnParticles() {} },
  };
  const t = new Tower('guardian', 100, 1, 400);
  t.game = juego;
  assert.equal(t._flashT, 0, 'el realce arranca apagado');
  t.fire([mkTank(100, 500)], juego);
  assert.ok(t._flashT > 0, 'disparar tiene que encender el realce');
  t.cooldownLeft = 10; // que no vuelva a disparar en este update
  t.update(0.2, [], juego);
  assert.equal(t._flashT, 0, 'el realce se apaga solo (update lo decae)');
});

test('fase 29: la escala visual NO cambió el daño ni la cadencia', () => {
  setMeta({}); // meta limpio: sin niveles ni perks que escalen
  // Guardian (daño plano) — valores de la tabla TOWERS × el dial de presentación.
  const escalaGuardian = dpsScaleFor('guardian');
  const t = new Tower('guardian', 100, 1);
  assert.equal(t.damage, TOWERS.guardian.damage * escalaGuardian);
  assert.equal(t.cooldown, TOWERS.guardian.cooldown);
  t.level = 5;
  assert.equal(t.damage, TOWERS.guardian.damage * escalaGuardian * 2,
    '+25 % por nivel, como siempre');
  assert.ok(Math.abs(t.cooldown - TOWERS.guardian.cooldown * Math.pow(0.92, 4)) < 1e-12,
    'la cadencia sigue bajando 8 % por nivel');
  // Todas las torres: el daño sale de la tabla, no del render.
  for (const type of Object.keys(TOWERS)) {
    const torre = new Tower(type, 100, 1);
    const base = TOWERS[type].kind === 'beam' || TOWERS[type].kind === 'laser'
      ? TOWERS[type].damagePerSec
      : TOWERS[type].damage;
    assert.equal(torre.damage, base * dpsScaleFor(type),
      `${type}: el daño no puede depender del render`);
  }
});

/** Alpha de un color 'rgba(r,g,b,a)'. */
function alphaDe(color) {
  const partes = String(color).split(',');
  return Number(partes[3]?.replace(')', '').trim());
}

test('fase 29: el color del proyectil NO le cambia el radio de impacto', () => {
  // enemies.js:projectileRadius elige 4 px (bala) o 6 px (genérico) según
  // la PRESENCIA de `color` — un cambio de color no puede mover la
  // hitbox (ni el balance) de ningún proyectil.
  const bala = shotDe('guardian').entidades[0];
  assert.equal(projectileRadius(bala), 4, 'la bala del Guardian sigue con radio 4');
  const gauss = shotDe('gauss').entidades[0];
  assert.equal(projectileRadius(gauss), 6, 'el Gauss conserva su radio explícito (6)');
  const obus = shotDe('mortar').entidades[0];
  assert.equal(projectileRadius(obus), 6, 'el obús conserva su radio (6)');
  const misil = shotDe('missile').entidades[0];
  assert.equal(projectileRadius(misil), 6, 'el misil conserva su radio (6)');
});

test('fase 29: el haz del Láser se pinta con gradiente, núcleo de 1 px y glow bajo', () => {
  const ctx = trazaCtx();
  const fx = new LaserStaticFx(
    { engine: { _t: 0, emit() {}, sfxSafe() {} } }, 100, 400, 0, 45, TOWERS.laser,
  );
  fx.t = 0.1;
  fx.draw(ctx);
  assert.equal(ctx.trazos.length, 2, 'el haz se pinta en dos trazos (manto + núcleo)');
  const [manto, nucleo] = ctx.trazos;
  // El manto es un GRADIENTE longitudinal: se apaga en los dos extremos.
  assert.ok(manto.style && Array.isArray(manto.style.stops),
    'el manto debe pintarse con un degradé');
  assert.equal(manto.style.stops.length, 4);
  assert.equal(alphaDe(manto.style.stops[0][1]), 0,
    'el extremo inicial del haz debe arrancar en alpha 0');
  assert.equal(alphaDe(manto.style.stops[1][1]), 1,
    'el centro del haz debe ir a color pleno');
  assert.equal(alphaDe(manto.style.stops[3][1]), 0,
    'el extremo final del haz debe terminar en alpha 0');
  // El núcleo es una línea de 1 px casi blanca EN el centro del haz.
  assert.equal(nucleo.width, 1, 'el núcleo del haz debe medir 1 px');
  assert.ok(nucleo.style.stops.length === 4, 'el núcleo también se apaga en los extremos');
  // Glow bajo (6-12 px), no el halo masivo de antes.
  assert.ok(manto.blur >= 6 && manto.blur <= 12,
    `el glow del manto debe ser bajo (6-12 px), es ${manto.blur}`);
  // El ancho EFECTIVO de daño no se tocó: sigue siendo LASER_WIDTH (6 px).
  assert.equal(manto.width, 6, 'el ancho del rayo (hitbox de daño) sigue siendo 6 px');
});

/** ctx2D de mentira que registra los trazos y los degradés que se usan. */
function trazaCtx() {  const trazos = [];
  const ctx = {
    trazos,
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setLineDash() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, ellipse() {},
    fill() {}, fillRect() {}, strokeRect() {}, drawImage() {},
    fillStyle: '', strokeStyle: '', shadowColor: '', shadowBlur: 0,
    globalAlpha: 1, lineWidth: 1, lineCap: 'butt', globalCompositeOperation: 'source-over',
    fillText() {}, strokeText() {}, font: '', textAlign: 'left', textBaseline: 'alphabetic',
    createLinearGradient(x, y, ex, ey) {
      return {
        x, y, ex, ey, stops: [],
        addColorStop(offset, color) { this.stops.push([offset, color]); },
      };
    },
    stroke() {
      trazos.push({ style: ctx.strokeStyle, width: ctx.lineWidth, blur: ctx.shadowBlur });
    },
  };
  return ctx;
}

// ============================================================
// dev-7 fase 30 — REWORK DEL DRON MOSQUITOS (enjambre continuo + veneno)
// ============================================================

/** Enemigo con veneno (para el combate real del dron). */
function mkVeneno(x, y, hp = 1e6) {
  return {
    x, y, r: 10, hp, hpMax: hp, dead: false, slowFactor: 1, stun: 0,
    poisonT: 0, poisonDps: 0,
    takeDamage(n) { this.hp -= n; if (this.hp <= 0) { this.hp = 0; this.dead = true; } return this.dead; },
    die() { this.dead = true; },
    update(dt) {
      if (this.poisonT > 0 && !this.dead) {
        this.poisonT -= dt;
        this.hp -= this.poisonDps * dt;
        if (this.hp <= 0) { this.hp = 0; this.die(); }
      }
    },
  };
}

test('fase 30: el mosquito pica REPETIDAS veces (ya no se consume con la picadura)', () => {
  // Antes (fase 21): el mosquito picaba una vez y desaparecía 4 s
  // (respawnTime) → 3 × 12 dmg / 4 s = 9 DPS medidos, el peor del
  // arsenal. Ahora: pica, entra en cooldown y sigue volando.
  setMeta({});
  const juego = mkGame();
  const dr = new Drone('wasps', juego, 0);
  const e = mkTank(dr.x, dr.y);
  juego.fortress.enemies = [e];
  dr.update(0.1, [e]);          // salen los mosquitos
  dr.update(1.0, [e]);         // pican (1ª vez)
  const tras1 = 1e6 - e.hp;
  dr.update(2.0, [e]);         // 2ª picadura (el cooldown ya venció)
  const tras2 = 1e6 - e.hp;
  assert.ok(tras1 > 0, 'la primera picadura debe hacer daño');
  assert.ok(tras2 > tras1,
    `el mosquito debe volver a picar (daño ${tras1} → ${tras2}): no puede ser un misil de un solo uso`);
  // Y los 3 mosquitos siguen vivos (no se "consumen").
  assert.equal(dr.wasps.length, 3, 'el enjambre no pierde mosquito al picar');
  assert.equal(dr.wasps.filter((w) => w).length, 3);
});

test('fase 30: el veneno de la picadura hace daño con el tiempo y mata al enemigo', () => {
  setMeta({});
  const juego = mkGame();
  const dr = new Drone('wasps', juego, 0);
  const e = mkVeneno(dr.x, dr.y, 1000);
  juego.fortress.enemies = [e];
  dr.update(0.1, [e]);
  dr.update(1.0, [e]);
  assert.ok(e.poisonT > 0, 'la picadura debe envenenar al objetivo');
  assert.ok(e.poisonDps > 0, 'el veneno debe tener daño por segundo');
  const hpTrasPicadura = e.hp;
  // El veneno sigue haciendo daño aunque el mosquito no vuelva a picar.
  e.update(1.0);
  assert.ok(e.hp < hpTrasPicadura, 'el veneno debe hacer daño con el tiempo');
});

test('fase 30: el veneno mata al enemigo por la vía normal (die())', () => {
  setMeta({});
  const juego = mkGame();
  const dr = new Drone('wasps', juego, 0);
  const e = mkVeneno(dr.x, dr.y, 20);
  juego.fortress.enemies = [e];
  dr.update(0.1, [e]);
  dr.update(1.0, [e]);
  e.update(5.0);   // el veneno sigueCorriendo
  assert.equal(e.dead, true, 'el veneno debe poder matar al enemigo');
});

test('fase 30: el enjambre respeta el tope de diseño (WASPS.maxSwarm)', () => {
  setMeta({ levels: { wasps: 100 }, perks: { wasps: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] } });
  const juego = mkGame();
  const dr = new Drone('wasps', juego, 0);
  assert.ok(dr.wasps.length <= WASPS.maxSwarm,
    `el enjambre (${dr.wasps.length}) no puede pasar de ${WASPS.maxSwarm}`);
  // Y con la carta "Nido Ampliado" tampoco.
  dr.extraWasps = 2;
  dr.rebuildSwarm();
  assert.ok(dr.wasps.length <= WASPS.maxSwarm,
    `con la carta el enjambre (${dr.wasps.length}) no puede pasar de ${WASPS.maxSwarm}`);
});

test('fase 30: el DPS del dron Mosquitos es al menos el doble del valor de la fase 29', () => {
  // Regresión de VALOR: en la fase 29 el dron daba 8,1 DPS (medido con
  // el simulador de daño por fuente). Si el rework se rompe, el dron
  // vuelve a ser inútil y nadie lo quiere.
  // OJO: el mundo se simula a 30 fps (un solo update gigante no
  // reproduce el comportamiento real del cooldown).
  setMeta({});
  const juego = mkGame();
  const dr = new Drone('wasps', juego, 0);
  const e = mkTank(dr.x, dr.y);
  juego.fortress.enemies = [e];
  dr.update(1 / 30, [e]);
  const SEG = 20;
  const DT = 1 / 30;
  for (let t = 0; t < SEG; t += DT) dr.update(DT, [e]);
  const dps = (1e6 - e.hp) / SEG;
  // Objetivo medido tras el rework: ~22 DPS de picadura (meta Nvl.1).
  assert.ok(dps >= 12, `el dron Mosquitos debe dar al menos 12 DPS (dio ${dps.toFixed(1)})`);
});

test('fase 30: la picadura NO es un remate (el veneno no dispara lifesteal ni execute)', () => {
  // El veneno es daño continuo, no un golpe: no debe robar vida ni
  // rematar (son mecánicas de IMPACTO, ver js/perks.js).
  setMeta({});
  const juego = mkGame();
  const dr = new Drone('wasps', juego, 0);
  const e = mkVeneno(dr.x, dr.y, 30);
  juego.fortress.enemies = [e];
  dr.update(0.1, [e]);
  dr.update(1.0, [e]);
  const hpBase = juego.fortress.hp;
  e.update(3.0);   // el veneno sigue Corriendo hasta matarlo
  assert.equal(e.dead, true);
  // El escudo no se ha curado por veneno (lifesteal = 0).
  assert.equal(juego.fortress.hp, hpBase, 'el veneno no debe robar vida');
});

// ============================================================
// dev-7 fase 31 — LA RUEDA DE FUEGO: SE QUEDA CON EL BLANCO
// ============================================================

test('fase 31: la rueda NO abandona a un blanco que sigue vivo', () => {
  // Antes (fase 21): el barrido duraba 0,9 s y la rueda abandonaba al
  // blanco AUNQUE SIGUIERA VIVO (fwTarget = null). Su salida real no
  // era "25 DPS" sino "0,9 s de daño por viaje", y el hueco CRECÍA con
  // el meta (80 % → 74 % del DPS nominal, medido en una etapa real).
  // Ahora se queda con el blanco hasta matarlo (tope: FIREWHEEL.maxDwell).
  setMeta({});
  const juego = mkGame();
  const dr = new Drone('firewheel', juego, 0);
  const e = mkTank(dr.x, dr.y, 1e6);   // el blanco NO muere nunca
  juego.fortress.enemies = [e];
  const DT = 1 / 30;
  for (let t = 0; t < 3; t += DT) dr.update(DT, [e]);
  assert.equal(dr.fwTarget, e, 'la rueda debe seguir con su blanco (sigue vivo)');
  assert.equal(dr.fwState, 'sweep', 'debe estar en el barrido, no volando');
});

test('fase 31: la rueda cambia de blanco tras el tope de permanencia', () => {
  // El tope evita que la rueda se clave con un jefe de 44 032 HP.
  setMeta({});
  const juego = mkGame();
  const dr = new Drone('firewheel', juego, 0);
  const e = mkTank(dr.x, dr.y, 1e6);
  juego.fortress.enemies = [e];
  const DT = 1 / 30;
  let cambios = 0;
  let anterior = dr.fwTarget;
  for (let t = 0; t < FIREWHEEL.maxDwell + 1; t += DT) {
    dr.update(DT, [e]);
    if (dr.fwTarget !== anterior) { cambios++; anterior = dr.fwTarget; }
  }
  assert.ok(cambios >= 1, `tras el tope de ${FIREWHEEL.maxDwell} s debe re-elegir blanco`);
});

test('fase 31: la rueda quema durante el VUELO, no sólo en el barrido', () => {
  // Una rueda de fuego quema lo que cruza: el contacto se aplica en
  // todas las fases (si no, el tiempo volando es daño desperdiciado).
  setMeta({});
  const juego = mkGame();
  const dr = new Drone('firewheel', juego, 0);
  // El blanco está LEJOS: la rueda está en vuelo, no en barrido.
  const e = mkTank(dr.x, dr.y - 500, 1e6);
  juego.fortress.enemies = [e];
  const DT = 1 / 30;
  for (let t = 0; t < 0.5; t += DT) dr.update(DT, [e]);
  assert.equal(dr.fwState, 'advance', 'debe estar volando (el blanco está lejos)');
  // Con el blanco pegado a la rueda: quema.
  const cerca = mkTank(dr.x, dr.y, 1e6);
  juego.fortress.enemies = [cerca];
  const antes = 1e6 - cerca.hp;
  for (let t = 0; t < 0.5; t += DT) dr.update(DT, [cerca]);
  assert.ok(1e6 - cerca.hp > antes, 'la rueda debe quemar al enemigo que tiene debajo');
});

test('fase 31: la rueda cambia de blanco si aparece uno más avanzado', () => {
  // Sin esto podía terminar con un blob lento mientras un fragmento se
  // le acercaba a la base.
  setMeta({});
  const juego = mkGame();
  const dr = new Drone('firewheel', juego, 0);
  const lento = mkTank(dr.x, dr.y, 1e6);
  juego.fortress.enemies = [lento];
  const DT = 1 / 30;
  for (let t = 0; t < 1; t += DT) dr.update(DT, [lento]);
  assert.equal(dr.fwTarget, lento, 'primero quema al lento');
  // Aparece un enemigo MUCHO más avanzado (más cerca de la base).
  const rapido = mkTank(dr.x, dr.y + FIREWHEEL.switchMargin + 30, 1e6);
  juego.fortress.enemies = [lento, rapido];
  dr.update(DT, [lento, rapido]);
  assert.equal(dr.fwTarget, rapido, 'debe cambiar al enemigo más avanzado');
});

test('fase 31: la rueda realiza al menos el 85 % de su DPS nominal', () => {
  // Regresión de VALOR: medido en una etapa real, la rueda fazia el
  // 74-83 % de su DPS nominal (y el hueco crecía con el meta). Con el
  // arreglo debe acercarse al nominal.
  setMeta({});
  const juego = mkGame();
  const dr = new Drone('firewheel', juego, 0);
  const e = mkTank(dr.x, dr.y);
  juego.fortress.enemies = [e];
  const DT = 1 / 30;
  for (let t = 0; t < 1; t += DT) dr.update(DT, [e]);
  const SEG = 20;
  for (let t = 0; t < SEG; t += DT) dr.update(DT, [e]);
  const dps = (1e6 - e.hp) / SEG;
  // El nominal de la rueda incluye el dial de presentación (towers-data.js).
  const nominal = DRONES.firewheel.dps * dpsScaleFor('firewheel');
  assert.ok(dps >= nominal * 0.85,
    `la rueda debe realizar ≥85 % de ${nominal} DPS (hizo ${dps.toFixed(1)})`);
});


// ============================================================
// dev-7 fase 33 — EL TARGETING: POLÍTICA POR TORRE Y BLANCO STICKY
// ============================================================

/** Enemigo de prueba (controla su vida para simular que muere). */
function mkTarget(x, y, hp = 100) {
  return {
    x, y, r: 10, hp, hpMax: hp, dead: false, slowFactor: 1, stun: 0,
    takeDamage(n) { this.hp -= n; if (this.hp <= 0) { this.dead = true; } return this.dead; },
  };
}

/** Torreta placed en el centro, con la lista de enemigos en la fortaleza. */
function mkTower(type, enemies, extra = {}) {
  const juego = mkGame();
  juego.fortress.enemies = enemies;
  const t = new Tower(type, 270, 1, 830);
  t.game = juego;
  return { t, juego };
}

test('fase 33: la política de targeting es la pedida por torre', () => {
  assert.equal(targetingFor('guardian'), 'nearest');
  assert.equal(targetingFor('missile'), 'nearest');
  assert.equal(targetingFor('tesla'), 'nearest');
  assert.equal(targetingFor('laser'), 'nearest');
  assert.equal(targetingFor('gauss'), 'farthest');
  assert.equal(targetingFor('mortar'), 'farthest');
  assert.equal(targetingFor('thunderstroke'), 'farthest');
  assert.equal(targetingFor('beam'), 'toughest');
  assert.equal(targetingFor('firewheel'), 'varying');
  assert.equal(targetingFor('wasps'), 'varying');
});

test('fase 33: "nearest" = el más avanzado (mayor Y) y "farthest" = el más lejano', () => {
  const lejos = mkTarget(270, 100);   // arriba de la pantalla
  const medio = mkTarget(270, 400);
  const cerca = mkTarget(270, 700);   // a punto de tocar la base
  const todos = [lejos, medio, cerca];

  const g = mkTower('guardian', todos);
  assert.equal(g.t._primaryTarget(todos, g.juego, 1), cerca, 'el Guardian va al más avanzado');

  const gr = mkTower('gauss', todos);
  assert.equal(gr.t._primaryTarget(todos, gr.juego, 1), lejos, 'el Gauss va al más lejano');
});

test('fase 33: "toughest" = el que más vida tiene', () => {
  // dev-7 fase 34: el radio del haz es 260 px desde la torre (la torre de
  // los tests está en y=830), así que los enemigos van dentro del radio.
  const debil = mkTarget(270, 620, 30);
  const duro = mkTarget(270, 640, 900);
  const todos = [debil, duro];
  const g = mkTower('beam', todos);
  // El Beam acquisition es aparte (_updateBeamAcquire): el de más vida
  // dentro de su radio.
  g.t._updateBeamAcquire(todos, g.juego);
  assert.equal(g.t._beamTarget, duro, 'el Beam se clava en el más duro');
});

test('fase 33: el blanco NO cambia mientras sigue vivo (sticky)', () => {
  const a = mkTarget(270, 700);   // el más avanzado
  const b = mkTarget(270, 300);
  const g = mkTower('guardian', [a, b]);
  const t1 = g.t._primaryTarget([a, b], g.juego, 1);
  assert.equal(t1, a);
  // Aparece un enemigo MÁS avanzado: la torre NO cambia de blanco.
  const c = mkTarget(270, 780);
  const t2 = g.t._primaryTarget([a, b, c], g.juego, 1);
  assert.equal(t2, a, 'el blanco es sticky: no cambia hasta que lo destruyen');
  // Cuando muere, se re-elige.
  a.dead = true;
  const t3 = g.t._primaryTarget([a, b, c], g.juego, 1);
  assert.equal(t3, c, 'al morir el blanco se re-elige (el más avanzado de los vivos)');
});

test('fase 33: el blanco se suelta si sale de rango', () => {
  // El blanco sale del alcance de la torre y se suelta. En la Tesla el
  // alcance es una BANDA (fase 66): "fuera" = por encima del techo de la
  // banda (y < LAYOUT.bandY − 70), que es donde cae el enemigo movido.
  const dentro = mkTarget(270, 700);
  const g = mkTower('tesla', [dentro]);
  const t1 = g.t._primaryTarget([dentro], g.juego, 1);
  assert.equal(t1, dentro);
  dentro.x = 60; dentro.y = 100;   // fuera del rango
  const t2 = g.t._primaryTarget([dentro], g.juego, 1);
  assert.equal(t2, null, 'un blanco fuera de rango no se conserva');
});

test('fase 33: el multi-blanco (misil N) conserva los suyos', () => {
  setMeta({ perks: { missile: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] } });
  const a = mkTarget(270, 700);
  const b = mkTarget(270, 600);
  const g = mkTower('missile', [a, b]);
  const l1 = g.t._acquireTargets([a, b], g.juego, 2);
  assert.equal(l1.length, 2);
  assert.ok(l1.includes(a) && l1.includes(b));
  // En la siguiente llamada conserva los mismos (no re-elige).
  const l2 = g.t._acquireTargets([a, b], g.juego, 2);
  assert.deepEqual(l2, l1, 'los blancos del misil son sticky');
  setMeta({});
});

test('fase 33: el BUILD-UP carga con el cooldown y NO carga sin blanco', () => {
  const g = mkTower('gauss', []);
  // Sin blanco: la carga no crece (cargar hacia la nada es ruido).
  for (let i = 0; i < 10; i++) g.t.update(0.1, [], g.juego);
  assert.equal(g.t._charge, 0, 'sin blanco no hay carga');
  // Con blanco: la carga crece al agotarse el cooldown.
  const e = mkTarget(270, 100);
  g.juego.fortress.enemies = [e];
  g.t.cooldownLeft = g.t.cooldown * 0.9;
  g.t.update(0.016, [e], g.juego);
  const c1 = g.t._charge;
  assert.ok(c1 > 0, `debe haber carga (${c1})`);
  g.t.cooldownLeft = 0.01;
  g.t.update(0.016, [e], g.juego);
  assert.ok(g.t._charge > c1, 'la carga sigue creciendo');
});

test('fase 33: los drones VARIAN (re-eligen sin esperar a que el blanco muera)', () => {
  setMeta({});
  const juego = mkGame();
  const dr = new Drone('wasps', juego, 0);
  const a = mkTarget(270, 600);
  const b = mkTarget(270, 500);
  juego.fortress.enemies = [a, b];
  dr.update(0.016, [a, b]);
  const w = dr.wasps[0];
  assert.ok(w.target, 'el mosquito toma un blanco');
  // El blanco sigue vivo: tras el periodo de re-elección puede cambiar.
  w.retargetT = 0;
  dr.update(0.016, [a, b]);
  assert.ok(w.target, 'sigue teniendo blanco tras re-elegir');
  // Y el ciclo de re-elección se rearma.
  assert.ok(w.retargetT > 0, 'el reloj de re-elección se rearma');
});


// ============================================================
// dev-7 fase 34 — MORTERO (radio) y BEAM (radio de adquisición)
// ============================================================

/** Game mínimo con engine stub para probar proyectiles. */
function mkGameEnemies(enemies) {
  return {
    fortress: { hp: 500, maxHp: 1000, enemies },
    engine: {
      _t: 0, addEntity() {}, addEffect() {}, emit() {}, spawnParticles() {},
      floatText() {}, shake() {}, sfxSafe() {},
    },
  };
}

/** Enemigo de prueba con la vida controlable. */
function mkAlvo(x, y, hp = 1000) {
  return {
    x, y, r: 12, hp, hpMax: hp, dead: false, slowFactor: 1, stun: 0, type: 'grunt',
    takeDamage(n) { this.hp -= n; if (this.hp <= 0) this.dead = true; return this.dead; },
  };
}

test('fase 34: el mortero tiene un radio de explosión de 150 px', () => {
  assert.equal(TOWERS.mortar.blastR, 150);
});

test('fase 34: la explosión del mortero mata a un GRUPO (2 enemigos a 130 px)', () => {
  const a = mkAlvo(270, 400);
  const b = mkAlvo(270, 530);   // 130 px de separación
  const juego = mkGameEnemies([a, b]);
  const obus = new MortarShell(270, 814, a, juego, 45, null, null);
  let t = 0;
  while (!obus.dead && t < 5) { obus.update(1 / 60); t += 1 / 60; }
  assert.ok(a.hp < a.hpMax, 'el blanco recibe daño');
  assert.ok(b.hp < b.hpMax, 'el vecino a 130 px también recibe daño (grupo)');
});

test('fase 34: la explosión del mortero NO alcanza a quien está a 220 px', () => {
  const a = mkAlvo(270, 400);
  const lejos = mkAlvo(270, 620);  // 220 px: fuera del radio (150 + r 12)
  const juego = mkGameEnemies([a, lejos]);
  const obus = new MortarShell(270, 814, a, juego, 45, null, null);
  let t = 0;
  while (!obus.dead && t < 5) { obus.update(1 / 60); t += 1 / 60; }
  assert.ok(a.hp < a.hpMax);
  assert.equal(lejos.hp, lejos.hpMax, 'a 220 px no llega');
});

test('fase 34: el obús CAE donde iba si su blanco muere en vuelo', () => {
  // Regresión del fallback: antes, si el blanco moría, el obús saltaba al
  // PRIMER enemigo vivo de la lista (puede estar en el otro extremo del
  // campo) y estallaba allí.
  const blanco = mkAlvo(270, 300);
  const otro = mkAlvo(60, 700);
  const juego = mkGameEnemies([blanco, otro]);
  const obus = new MortarShell(270, 814, blanco, juego, 45, null, null);
  let t = 0;
  while (!obus.dead && t < 5) {
    if (t > 0.3) blanco.dead = true;   // el blanco muere a mitad de vuelo
    obus.update(1 / 60);
    t += 1 / 60;
  }
  // Estalló donde apuntaba (x≈270, y≈300), NO en el otro enemigo (x=60).
  assert.ok(Math.abs(obus.x - 270) < 12, `x del obús = ${Math.round(obus.x)}`);
  assert.ok(Math.abs(obus.y - 300) < 60, `y del obús = ${Math.round(obus.y)}`);
});

test('fase 76.2: el Mortar conserva la config del cráter al disparar', () => {
  const target = mkAlvo(270, 500);
  const game = mkGameEnemies([target]);
  const entities = [];
  game.engine.entities = entities;
  game.engine.addEntity = (e) => entities.push(e);
  const t = new Tower('mortar', 270, 1, 0);
  t.game = game;
  t.fire([target], game, 1 / 60);
  const shell = entities.find((e) => e.constructor?.name === 'MortarShell');
  assert.ok(shell, 'el obús se lanzó');
  assert.ok(shell.crater, 'el cráter viaja en el obús (no lo filtra pickOnHit)');
  assert.equal(shell.crater.dps, TOWERS.mortar.mech.dps);
  assert.equal(shell.crater.time, TOWERS.mortar.mech.duration);
  assert.equal(shell.crater.radius, shell.blastR);
});

test('fase 76.2: al detonar, el Mortar agrega un CraterFx visible', () => {
  const entities = [];
  const game = mkGameEnemies([]);
  game.engine.entities = entities;
  game.engine.addEntity = (e) => entities.push(e);
  const shell = new MortarShell(100, 500, null, game, 45, 150, {
    crater: { dps: 12, time: 3, radius: 150, slow: 0.1 },
  });
  shell._explode();
  const crater = entities.find((e) => e.constructor?.name === 'CraterFx');
  assert.ok(crater, 'el impacto debe dejar un CraterFx en el campo');
  assert.equal(crater.dps, 12 * dpsScaleFor('mortar'));
  assert.equal(crater.life, 3);
  assert.equal(crater.radius, 150);
  assert.equal(crater.slow, 0.1);
});

test('fase 76.2: el cráter dibuja un anillo visible sin romper el frame', () => {
  const game = { engine: { _t: 0 }, fortress: { enemies: [] } };
  const crater = new CraterFx(game, 0, 0, { radius: 150, dps: 8, life: 3, slow: 0.1 });
  const calls = [];
  const ctx = {
    save() {}, restore() {}, beginPath() {},
    arc() { calls.push('arc'); }, fill() { calls.push('fill'); }, stroke() { calls.push('stroke'); },
    setLineDash() {}, createRadialGradient() { return { addColorStop() {} }; },
  };
  assert.doesNotThrow(() => crater.draw(ctx));
  assert.ok(calls.includes('stroke'), 'el anillo exterior se dibuja');
  assert.ok(calls.includes('arc'), 'el dibujo usa el radio del área');
});

test('fase 34: el haz adquiere un blanco FUERA de la antigua ventana de ±80 px', () => {
  // La torre de los tests está en (270, 830). El enemigo va 200 px a la
  // derecha: fuera de la antigua ventana de ±80, dentro del radio nuevo.
  const lado = mkAlvo(470, 700);   // dx=200, dy=-130 -> 238 px de distancia
  const g = mkTower('beam', [lado]);
  g.t._updateBeamAcquire([lado], g.juego);
  assert.equal(g.t._beamTarget, lado, 'el haz apunta al blanco de al lado');
  assert.ok(g.t.active, 'el haz se enciende');
});

test('fase 34: el haz NO adquiere un blanco fuera de su alcance (260 px a cada lado)', () => {
  const lejos = mkAlvo(600, 830);   // 330 px de distancia
  const g = mkTower('beam', [lejos]);
  g.t._updateBeamAcquire([lejos], g.juego);
  assert.equal(g.t._beamTarget, null, 'fuera de radio no hay blanco');
  assert.equal(g.t.active, false);
});

test('fase 34: el haz alcanza 260 px a cada lado, a toda altura', () => {
  // El "rango" del juego es un ANCHO de detección (las torres disparan
  // hacia arriba sin límite de Y), así que el haz usa columnHalfWidth.
  assert.equal(TOWERS.beam.columnHalfWidth, 260);
  // fase 66: el DPS de entrada baja de 24 a 10 POR DISEÑO — el haz ahora
  // tiene ramp de foco (×4,5 al tope) y ventana + cooldown (64 % de
  // servicio): el número de la tabla es el daño de ENTRADA, no el soste-
  // nido. El detalle del ciclo está en los tests de la fase 66 (abajo).
  assert.equal(TOWERS.beam.damagePerSec, 10, 'la entrada baja: el ramp la lleva a 45');
});

test('fase 34: la lente del haz mira al blanco con el ángulo real', () => {
  const t = { x: 270, y: 830 };
  // Sin blanco: vertical.
  assert.equal(beamAimAngle(t, null), 0);
  // Blanco arriba y a la derecha: el ángulo es el real (no el tope de 0,5).
  const arriba = { x: 270, y: 100 };
  assert.equal(beamAimAngle(t, arriba), 0, 'vertical = 0');
  const lado = { x: 470, y: 730 };  // dx=200, dy=90 por encima de la boca
  const ang = beamAimAngle(t, lado);
  assert.ok(ang > 0.5, `el ángulo debe ser real (${ang.toFixed(2)} rad), no el tope de 0,5`);
  assert.ok(ang <= 1, 'el tope visual es ±1 rad');
  // Y el signo sigue a la izquierda/derecha.
  assert.ok(beamAimAngle(t, { x: 70, y: 730 }) < 0, 'a la izquierda, ángulo negativo');
});

test('fase 34: el blanco del haz recibe el daño con ramp aunque el ángulo sea cerrado', () => {
  // El rayo es un foco: el daño al blanco no depende del ángulo.
  const lejos = mkAlvo(470, 700);
  const g = mkTower('beam', [lejos]);
  g.t._updateBeamAcquire([lejos], g.juego);
  g.t._beamTime = 0;
  const hpAntes = lejos.hp;
  g.t.fire([lejos], g.juego, 0.1);
  assert.ok(lejos.hp < hpAntes, 'el blanco del haz recibe daño aunque esté de lado');
});

// ============================================================
// dev-7 fase 48 — EL GUARDIAN: TOPE DE 3 Y SIN ABANICO
// ============================================================

/** Enemigo de prueba con la vida y la posicion que se le pida. */
function mkE48(x, y, hp = 100) {
  return {
    x, y, r: 12, hp, hpMax: hp, dead: false, slowFactor: 1, stun: 0, vx: 0, vy: 0,
    type: 'meteor', data: { family: 'rock' },
    takeDamage(n) { this.hp -= n; if (this.hp <= 0) this.dead = true; return this.dead; },
  };
}

/** Game minimo con engine stub para que la torre dispare de verdad. */
function mkGameE48(enemies = []) {
  const eng = {
    _t: 0, particles: [], floats: [], entities: [],
    emit() {}, addEffect() {}, addEntity(e) { eng.entities.push(e); },
    spawnParticles() {}, floatText() {}, shake() {}, sfxSafe() {},
  };
  const game = { engine: eng, stageId: 1, lv: 1, xp: 0, score: 0, streak: 0, mult: 1, kills: 0, timer: 0, _leaks: 0 };
  game.fortress = { hp: 1000, maxHp: 1000, enemies, drones: [], slots: [], pierce: 0 };
  return game;
}

test('fase 48: el Guardian tiene TOPE DURO de 3 balas, con el perk de +2 incluido', () => {
  const g = mkGameE48();
  const t = new Tower('guardian', 270, 1);
  t.game = g;
  // Sin perks: la escalera de niveles es 1, 2, 3, 3, 3.
  const esperado = [1, 2, 3, 3, 3];
  for (let lv = 1; lv <= 5; lv++) {
    t.level = lv;
    assert.equal(t.bulletsPerBurst, esperado[lv - 1], `nivel ${lv}: rafaga de ${t.bulletsPerBurst}`);
  }
});

test('fase 48: el tope de 3 aguanta aunque el perk sume balas', () => {
  // El perk del meta ya NO suma balas (fase 48) pero, aun asi, el tope
  // es duro: ni el nivel ni un extraCount imposible lo pasan.
  const g = mkGameE48();
  const t = new Tower('guardian', 270, 5);
  t.game = g;
  assert.ok(t.bulletsPerBurst <= 3, `con Lv.5 el Guardian no puede pasar de 3 (va ${t.bulletsPerBurst})`);
});

test('fase 48: del Lv.4 las balas van a BLANCOS DISTINTOS (multi-blanco)', () => {
  const enemigos = [mkE48(270, 700), mkE48(200, 500), mkE48(340, 500), mkE48(270, 200)];
  const g = mkGameE48(enemigos);
  const t = new Tower('guardian', 270, 4);
  t.game = g;
  t.fire(enemigos, g, 0.016);
  const balas = g.engine.entities.filter((e) => e.constructor?.name === 'Bullet');
  assert.equal(balas.length, 3, 'la rafaga del Lv.4 son 3 balas');
  // Cada bala va a un blanco distinto -> angulos distintos.
  const angulos = new Set(balas.map((b) => Math.round(Math.atan2(b.vx, -b.vy) * 1000)));
  assert.equal(angulos.size, 3, `las 3 balas apuntan a 3 blancos distintos (angulos: ${angulos.size})`);
});

test('fase 48: hasta el Lv.3 las balas van al MISMO blanco (paralelas)', () => {
  const enemigos = [mkE48(270, 700), mkE48(200, 500)];
  const g = mkGameE48(enemigos);
  const t = new Tower('guardian', 270, 3);
  t.game = g;
  t.fire(enemigos, g, 0.016);
  const balas = g.engine.entities.filter((e) => e.constructor?.name === 'Bullet');
  assert.equal(balas.length, 3, 'la rafaga del Lv.3 son 3 balas');
  const angulos = new Set(balas.map((b) => Math.round(Math.atan2(b.vx, -b.vy) * 1000)));
  assert.equal(angulos.size, 1, `las 3 balas van al mismo blanco (angulos distintos: ${angulos.size})`);
  // fase 73: separación compacta de 10 px (antes 13).
  const xs = balas.map((b) => Math.round(b.x)).sort((a, b) => a - b);
  assert.deepEqual(xs, [260, 270, 280], 'las balas salen a 10 px de distancia');
});

test('fase 48: el Lv.5 del Guardian perfora +1', () => {
  const g = mkGameE48();
  const t4 = new Tower('guardian', 270, 4);
  t4.game = g;
  t4.fire([], g, 0.016);
  const b4 = g.engine.entities.filter((e) => e.constructor?.name === 'Bullet')[0];
  assert.equal(b4.pierce, 0, 'el Lv.4 no perfora por nivel');

  const g2 = mkGameE48();
  const t5 = new Tower('guardian', 270, 5);
  t5.game = g2;
  t5.fire([], g2, 0.016);
  const b5 = g2.engine.entities.filter((e) => e.constructor?.name === 'Bullet')[0];
  assert.equal(b5.pierce, 1, 'el Lv.5 perfora +1');
});

test('fase 48: los perks del Guardian ya no suman balas', () => {
  const conBalas = PERKS.guardian.filter((tier) => tier.A.mods.extraCount || tier.B.mods.extraCount);
  assert.equal(conBalas.length, 0, 'ningun perk del Guardian puede anadir balas (el tope es 3)');
});

// ============================================================
// dev-7 fase 51 — CARTAS DE TÉCNICA: la MECÁNICA llega al combate
// ============================================================

/**
 * Aplica una carta del catálogo a una torre (el canal de cartas de
 * js/cards.js → js/perks.js). La torre se mete en `fortress.slots` para
 * que la carta la encuentre como su unidad destino.
 */
function aplicarCartaATorre(t, cardId) {
  const card = CATALOG.find((c) => c.id === cardId);
  assert.ok(card, `no existe la carta ${cardId}`);
  applyCard(card, { stageId: 2, fortress: { slots: [t], drones: [] } });
  return t;
}

test('fase 51: la carta de rebote hace que la BALA del Guardian rebote', () => {
  const g = mkGameE48([mkE48(270, 700)]);
  const t = new Tower('guardian', 270, 1);
  t.game = g;
  t.fire(g.fortress.enemies, g, 0.016);
  const bala = g.engine.entities.find((e) => e.constructor?.name === 'Bullet');
  assert.equal(bala.bounce, 0, 'sin carta la bala NO rebota');
  // La carta de técnica escribe en el canal de la unidad...
  aplicarCartaATorre(t, 'tech_bounce');
  const g2 = mkGameE48([mkE48(270, 700)]);
  t.game = g2;
  t.fire(g2.fortress.enemies, g2, 0.016);
  const bala2 = g2.engine.entities.find((e) => e.constructor?.name === 'Bullet');
  assert.equal(bala2.bounce, 1, 'con la carta la bala rebota (bounce=1)');
});

test('fase 51: la carta de perforación hace que la bala ATRAVIESE un enemigo más', () => {
  const g = mkGameE48([mkE48(270, 700)]);
  const t = new Tower('guardian', 270, 1);
  t.game = g;
  t.fire(g.fortress.enemies, g, 0.016);
  const bala = g.engine.entities.find((e) => e.constructor?.name === 'Bullet');
  assert.equal(bala.pierce, 0, 'sin carta la bala no perfora');
  aplicarCartaATorre(t, 'tech_pierce');
  const g2 = mkGameE48([mkE48(270, 700)]);
  t.game = g2;
  t.fire(g2.fortress.enemies, g2, 0.016);
  const bala2 = g2.engine.entities.find((e) => e.constructor?.name === 'Bullet');
  assert.equal(bala2.pierce, 1, 'con la carta la bala perfora +1');
});

test('fase 76: la carta de guiado hace que el MISIL persiga mejor (sin stun)', () => {
  const g = mkGameE48([mkE48(270, 700)]);
  const t = new Tower('missile', 100, 1);
  t.game = g;
  t.fire(g.fortress.enemies, g, 0.016);
  const misil = g.engine.entities.find((e) => e.constructor?.name === 'HomingMissile');
  assert.equal(misil.homing, 0, 'sin carta el misil no tiene guiado extra');
  assert.equal(misil.stunChance, 0, 'el Misil ya no aturde: el stun es del Thunderstroke');
  aplicarCartaATorre(t, 'tech_missile_homing');
  const g2 = mkGameE48([mkE48(270, 700)]);
  t.game = g2;
  t.fire(g2.fortress.enemies, g2, 0.016);
  const misil2 = g2.engine.entities.find((e) => e.constructor?.name === 'HomingMissile');
  assert.equal(misil2.homing, 1, 'con la carta el misil persigue mejor');
});

test('fase 74: la carta explosiva hace que la bala DETONE al impactar', () => {
  const g = mkGameE48([mkE48(270, 700)]);
  const t = new Tower('guardian', 270, 1);
  t.game = g;
  t.fire(g.fortress.enemies, g, 0.016);
  const bala = g.engine.entities.find((e) => e.constructor?.name === 'Bullet');
  assert.equal(bala.impactExplodeChance, 0, 'sin carta la bala no detona');
  aplicarCartaATorre(t, 'tech_explode');
  const g2 = mkGameE48([mkE48(270, 700)]);
  t.game = g2;
  t.fire(g2.fortress.enemies, g2, 0.016);
  const bala2 = g2.engine.entities.find((e) => e.constructor?.name === 'Bullet');
  assert.equal(bala2.impactExplodeChance, 1, 'con la carta la bala detona al impactar');
  assert.equal(bala2.impactExplodeFrac, 0.4, 'y hace el 40 % del daño');
  assert.equal(bala2.impactExplodeRadius, 70, 'en un radio de 70');
});

// ============================================================
// fase 66 — REWORK DE TESLA (banda + cadena local), BEAM (ventana,
// ramp y cooldown) y LÁSER (el rayo muere en el BORDE del campo)
// ============================================================

/** x es "casi" y (los tiempos del ramp tienen error de float). */
function casi(x, y, eps = 1e-6) { return Math.abs(x - y) < eps; }

/** Game mínimo que además REGISTRA las entidades y los efectos creados. */
function mkGameF66(enemies = []) {
  const entidades = [];
  const efectos = [];
  const juego = {
    fortress: { hp: 500, maxHp: 1000, enemies },
    engine: {
      _t: 0, entities: entidades,
      addEntity(e) { entidades.push(e); },
      addEffect(e) { efectos.push(e); },
      emit() {}, spawnParticles() {}, floatText() {}, shake() {}, sfxSafe() {},
    },
    log: { entidades, efectos },
  };
  return juego;
}

/** Torreta F66 en el centro de la fila de referencia, con su game. */
function mkTowerF66(type, enemies) {
  const juego = mkGameF66(enemies);
  const t = new Tower(type, 270, 1, 830);
  t.game = juego;
  return { t, juego };
}

/** ctx2D de mentira que MIDE el manto del haz (la primera figura del frame). */
function mantoCtx() {
  const ctx = {
    puntos: [], mantoH0: 0, mantoGlow: 0,
    save() {}, restore() {}, closePath() {}, arc() {}, stroke() {}, fillRect() {},
    clip() {}, ellipse() {}, setLineDash() {},
    moveTo(x, y) { ctx.puntos.push([x, y]); },
    lineTo(x, y) { ctx.puntos.push([x, y]); },
    beginPath() { ctx.puntos = []; },
    fill() {
      if (ctx.mantoH0 || ctx.puntos.length < 4) return; // el manto es la 1ª figura
      ctx.mantoH0 = Math.abs(ctx.puntos[1][0] - ctx.puntos[0][0]) / 2;
      ctx.mantoGlow = ctx.shadowBlur;
    },
    createLinearGradient(x, y, ex, ey) {
      return { x, y, ex, ey, stops: [], addColorStop(o, c) { this.stops.push([o, c]); } };
    },
    fillStyle: '', strokeStyle: '', shadowColor: '', shadowBlur: 0,
    globalAlpha: 1, lineWidth: 1, lineCap: 'butt', globalCompositeOperation: 'source-over',
  };
  return ctx;
}

// ---------- Tesla: banda de cobertura y cadena local ----------

test('fase 66: la tabla de la Tesla es la del rework (banda, cadencia, saltos)', () => {
  const d = TOWERS.tesla;
  // La cadencia y el daño se calibraron con el simulador (§Fase 66 de
  // docs/BALANCE.md): el poder nuevo está en la COBERTURA, así que las dos
  // palancas del daño bajaron — 0,6 s dejaba el escenario Guardian+Tesla
  // en 92 % de bajas en el S50 y 0,8 s lo hacía perder; 0,7 s es el medio.
  assert.equal(d.cooldown, 0.7, 'cadencia alta de anti-enjambre (antes 1,9)');
  assert.equal(d.damage, 7, 'daño por golpe: 7 / 0.7 = 10 DPS a un blanco');
  assert.equal(d.jumps, 5, '5 blancos por descarga (antes 3)');
  assert.equal(d.falloff, 0.75, 'el falloff por salto no se toca');
  assert.equal(d.rangeBand, true);
  assert.equal(d.reachY, 330);
  assert.equal(d.range, undefined, 'la Tesla YA NO usa el círculo de MAX_TOWER_REACH');
  setMeta({});
  assert.equal(mkTowerF66('tesla', []).t.cooldown, 0.7, 'la cadencia efectiva Lv.1 es la de la tabla');
});

test('fase 66: la banda adquiere al enjambre de la ESQUINA opuesta', () => {
  // Layout de referencia (el de Node): fila en 830 → bandY 570 → techo de
  // la banda en 500 (una banda de 330 px sobre la fila = reachY).
  assert.equal(LAYOUT.fallScale, 1, 'el layout de los tests es el de referencia');
  assert.equal(LAYOUT.bandY - 70, 500);
  // El enemigo cae por el extremo IZQUIERDO, a ~400 px de la torre: fuera
  // del viejo círculo de 260 y dentro de la banda.
  const esquina = mkAlvo(20, 520);
  const { t, juego } = mkTowerF66('tesla', [esquina]);
  assert.ok(Math.hypot(esquina.x - t.x, esquina.y - t.y) > MAX_TOWER_REACH,
    'el caso es el que el círculo dejaba afuera');
  assert.equal(targetInRange(esquina, juego, t), true, 'dentro de la banda');
  assert.equal(t._primaryTarget([esquina], juego, 1), esquina, 'la Tesla lo adquiere');
});

test('fase 66: por ENCIMA del techo de la banda la Tesla no adquiere', () => {
  // Mismo X lejano, 30 px sobre el techo (500): el alcance vertical manda.
  const arriba = mkAlvo(20, 470);
  const { t, juego } = mkTowerF66('tesla', [arriba]);
  assert.equal(targetInRange(arriba, juego, t), false, 'por encima de la banda no hay alcance');
  assert.equal(t._primaryTarget([arriba], juego, 1), null, 'no lo adquiere');
  // El borde es INCLUSIVO: a y = 500 (el techo exacto) sí entra.
  const borde = mkAlvo(20, 500);
  assert.equal(targetInRange(borde, juego, t), true, 'el techo de la banda es inclusivo');
});

test('fase 66: Sensores Ampliados (detectMul) SUBE la banda', () => {
  const e = mkAlvo(20, 470);
  const { t, juego } = mkTowerF66('tesla', [e]);
  assert.equal(targetInRange(e, juego, t), false, 'sin la carta, 470 queda fuera');
  juego.fortress.detectMul = 1.4; // la carta real de cards.js (×1,4 por stack)
  assert.equal(targetInRange(e, juego, t), true,
    'con detectMul 1,4 el techo sube a 830 − 330×1,4 = 368');
  // Y la banda NO tiene tope de X (la carta no cambia eso).
  assert.equal(t.detectWidthNow(juego), Infinity, 'el ancho de detección sigue infinito');
});

test('fase 73: el Thunderstroke tiene alcance TOTAL (global, no círculo)', () => {
  const lejos = mkAlvo(20, 520);   // esquina opuesta
  const arriba = mkAlvo(500, 80);  // parte alta de la pantalla
  const { t, juego } = mkTowerF66('thunderstroke', [lejos, arriba]);
  assert.equal(TOWERS.thunderstroke.range, undefined, 'sin círculo de 260');
  assert.equal(TOWERS.thunderstroke.detectHalfWidth, Infinity);
  assert.equal(t.detectWidthNow(juego), Infinity, 'sin tope horizontal');
  assert.equal(targetInRange(lejos, juego, t), true, 'la esquina opuesta entra');
  assert.equal(targetInRange(arriba, juego, t), true, 'la parte alta entra');
  assert.equal(t._primaryTarget([lejos, arriba], juego, 1), arriba,
    'farthest: el más lejano (arriba) es el blanco');
});

test('fase 73: un rayo principal + mini rayos de área (50 %)', () => {
  setMeta({});
  const principal = mkAlvo(270, 200, 1000);
  const vecinoA = mkAlvo(320, 230, 1000);
  const vecinoB = mkAlvo(220, 240, 1000);
  const fuera = mkAlvo(500, 500, 1000);
  const { t, juego } = mkTowerF66('thunderstroke', [principal, vecinoA, vecinoB, fuera]);
  t.fire(juego.fortress.enemies, juego, 1 / 60);

  const d = TOWERS.thunderstroke;
  const dmg = t.damage; // daño REAL de la torre (tabla × dial de presentación)
  const areaDmg = Math.round(dmg * d.areaFrac);
  assert.equal(principal.hp, 1000 - dmg, 'el principal come el daño pleno');
  assert.equal(vecinoA.hp, 1000 - areaDmg, 'el vecino A come el 50 %');
  assert.equal(vecinoB.hp, 1000 - areaDmg, 'el vecino B come el 50 %');
  assert.equal(fuera.hp, 1000, 'fuera del radio no hay daño de área');
  assert.equal(principal.stun, d.stun, 'principal: stun pleno');
  assert.equal(vecinoA.stun, d.areaStun, 'vecino: stun de área');

  const rayos = juego.log.efectos.filter((fx) => Array.isArray(fx.points));
  assert.equal(rayos.length, 3, '1 rayo principal + 2 mini rayos');
  assert.equal(rayos[0].points.length, 2, 'el principal es un solo segmento');
  assert.equal(rayos[0].points[1].x, principal.x, 'el principal va al blanco (x)');
  assert.equal(rayos[0].points[1].y, principal.y, 'el principal va al blanco (y)');
  assert.equal(rayos[1].points[0].x, principal.x, 'los mini rayos salen del impacto (x)');
  assert.equal(rayos[1].points[0].y, principal.y, 'los mini rayos salen del impacto (y)');
  assert.equal(rayos[2].points[0].x, principal.x);
});

test('fase 73: el blanco principal NO recibe también el daño de área', () => {
  setMeta({});
  const principal = mkAlvo(270, 200, 1000);
  const vecino = mkAlvo(300, 220, 1000);
  const { t, juego } = mkTowerF66('thunderstroke', [principal, vecino]);
  t.fire(juego.fortress.enemies, juego, 1 / 60);
  assert.equal(principal.hp, 1000 - t.damage,
    'solo el rayo principal; el estallido excluye al principal');
  assert.ok(vecino.hp < 1000, 'el vecino sí recibe el estallido');
});

test('fase 73/74: el Thunderstroke marca el blanco solo en el build-up final', () => {
  const enemigo = mkAlvo(270, 200);
  const { t, juego } = mkTowerF66('thunderstroke', [enemigo]);
  t.cooldownLeft = 1.2;
  t.update(1 / 60, [enemigo], juego);
  assert.equal(t.targets[0], enemigo, 'adquiere el blanco durante la carga');
  assert.ok(t._charge > 0, 'la carga avanza');
  // Cooldown inicial: NO se dibuja el enlace aunque `_charge` sea alto.
  t._charge = 0.9;
  t.cooldownLeft = 1.2;
  const cooldown = recCtx();
  t.render(cooldown);
  assert.equal(cooldown.arcs.some((a) => Math.abs(a.y + 630) < 3), false,
    'durante el cooldown no hay enlace');
  // Últimos 0,5 s: build-up, sí hay enlace y anillo de lock.
  t.cooldownLeft = 0.1;
  const ctx = recCtx();
  t.render(ctx);
  const lock = ctx.arcs.find((a) => Math.abs(a.y + 630) < 3 && a.r > enemigo.r);
  assert.ok(lock, 'dibuja el anillo de lock sobre el blanco');
  assert.ok(lock.alpha > 0.1, `el anillo se ve en el build-up (alpha ${lock.alpha})`);
  // Sin carga no hay anillo (la torre sigue dibujándose normal).
  t._charge = 0;
  const sin = recCtx();
  t.render(sin);
  assert.equal(sin.arcs.some((a) => Math.abs(a.y + 630) < 3), false);
});

test('fase 66: la cadena SIGUE al enjambre en la esquina opuesta', () => {
  setMeta({});
  // Grupo de 4 esporas apiñadas en la esquina izquierda, TODAS a más de
  // 260 px de la torre (con el círculo viejo ningún salto llegaba: el
  // filtro era `dist(e, torre) <= 260`).
  const grupo = [mkAlvo(20, 520, 1e6), mkAlvo(60, 560, 1e6),
    mkAlvo(100, 505, 1e6), mkAlvo(140, 545, 1e6)];
  for (const e of grupo) {
    assert.ok(Math.hypot(e.x - 270, e.y - 830) > MAX_TOWER_REACH,
      `la espora de (${e.x}, ${e.y}) queda fuera del viejo círculo`);
  }
  const { t, juego } = mkTowerF66('tesla', grupo);
  t.fire(grupo, juego, 1 / 60);
  const bolt = juego.log.efectos[0];
  assert.ok(bolt, 'la descarga se dibuja');
  assert.equal(bolt.points.length, 5, 'la torre + los 4 del enjambre (jumps 5 alcanza)');
  // El primer nodo es el blanco principal (la más avanzada, y=560).
  assert.equal(bolt.points[1].x, 60);
  assert.equal(bolt.points[1].y, 560);
  for (const e of grupo) assert.ok(e.hp < e.hpMax, `el grupo entero recibe la cadena`);
  // Falloff por salto: el primer nodo come más que el último.
  const dano = (e) => 1e6 - e.hp;
  assert.ok(dano(bolt.points[1]) > dano(bolt.points[4]),
    'el daño cae con cada salto (falloff 0,75)');
});

test('fase 66: sin vecinos dentro del radio local no hay saltos', () => {
  setMeta({});
  // El blanco principal (20, 520) está aislado: el otro enemigo está
  // dentro de la banda pero a 480 px (fuera del radio local de 170).
  const solitario = mkAlvo(20, 520, 1e6);
  const lejano = mkAlvo(500, 505, 1e6);
  const { t, juego } = mkTowerF66('tesla', [solitario, lejano]);
  t.fire(juego.fortress.enemies, juego, 1 / 60);
  const bolt = juego.log.efectos[0];
  assert.equal(bolt.points.length, 2, 'la torre + el blanco: sin saltos');
  assert.equal(solitario.hp, 1e6 - TOWERS.tesla.damage,
    'el solitario come el daño pleno de la tabla (sin falloff)');
  assert.equal(lejano.hp, 1e6, 'el que está fuera del radio local no entra en la cadena');
});

// ---------- Beam: entrada baja, ramp de foco, ventana y cooldown ----------

test('fase 66: la tabla del Beam es la del rework (entrada, ramp, ventana, cooldown)', () => {
  const d = TOWERS.beam;
  assert.equal(d.damagePerSec, 10, 'DPS de ENTRADA bajo (antes 24 fijo)');
  assert.equal(d.columnHalfWidth, 260, 'el ancho de adquisición no se toca');
  assert.equal(d.beamRampPerSec, 0.8);
  assert.equal(d.beamRampMax, 4.5, 'tope del ramp (10 → 45 DPS)');
  assert.equal(d.beamBurst, 4.5, 'ventana de ataque');
  assert.equal(d.beamCooldown, 2.5, 'cooldown al cerrarse la ventana');
  // Servicio del ciclo: 4,5 de cada 7 s = 64 % (antes: continuo, techo ×3).
  assert.ok(casi(d.beamBurst / (d.beamBurst + d.beamCooldown), 0.64, 0.01));
});

test('fase 66: el haz entra con el DPS de la tabla y el ramp lo lleva al tope', () => {
  setMeta({});
  // 1 s de haz sobre un blanco que no muere, con el foco ya acumulado.
  const unSegundo = (foco) => {
    const e = mkTank(270, 700);
    const { t, juego } = mkTowerF66('beam', [e]);
    t._beamTarget = e;
    t._beamTime = foco;
    const antes = e.hp;
    t.fire([e], juego, 1);
    return antes - e.hp;
  };
  // Los DPS esperados son los de la tabla × el dial de presentación.
  const escala = dpsScaleFor('beam');
  assert.ok(casi(unSegundo(0), 10 * escala), 'sin foco el DPS es el de la tabla (10 × dial)');
  assert.ok(casi(unSegundo(1), 18 * escala), 'a 1 s de foco el ramp ya es ×1,8');
  assert.ok(casi(unSegundo(2), 26 * escala), 'a 2 s, ×2,6');
  assert.ok(casi(unSegundo(10), 45 * escala), 'el ramp se TOPA en ×4,5 (45 DPS × dial)');
  assert.ok(unSegundo(3) > unSegundo(2), 'y crece de forma continua hasta el tope');
});

test('fase 66: cambiar de blanco REINICIA el ramp y NO dispara el cooldown', () => {
  setMeta({});
  const dt = 1 / 60;
  const a = mkTank(270, 700);
  const b = mkTank(270, 600);
  const { t, juego } = mkTowerF66('beam', [a, b]);
  for (let i = 0; i < 60; i++) t.update(dt, [a, b], juego); // 1 s de foco
  assert.equal(t._beamTarget, a, 'el haz se clava en su blanco');
  assert.ok(t._beamTime > 0.9, `el foco acumula (${t._beamTime.toFixed(2)} s)`);
  const ventana = t._beamWindow;
  // El blanco muere a mitad de la ventana: el haz re-adquiere y SIGUE.
  a.dead = true;
  const hpB = b.hp;
  t.update(dt, [b], juego);
  assert.equal(t._beamTarget, b, 're-adquiere dentro de la MISMA ventana');
  // update() suma el dt del frame antes de disparar, así que el ramp
  // reiniciado se ve como 1/60 s y no como el ~1 s del blanco anterior.
  assert.ok(casi(t._beamTime, dt), `el ramp vuelve al inicio (${t._beamTime} vs ${dt})`);
  assert.equal(t._beamCd, 0, 'cambiar de blanco NO dispara cooldown');
  assert.ok(t.active, 'el haz sigue encendido');
  assert.ok(t._beamWindow < ventana, 'y la ventana sigue corriendo (no se reinicia)');
  assert.ok(b.hp < hpB, 'le pega al blanco nuevo');
});

test('fase 66: al cerrarse la ventana el haz queda APAGADO y no adquiere', () => {
  setMeta({});
  const dt = 1 / 60;
  const a = mkTank(270, 700);
  const { t, juego } = mkTowerF66('beam', [a]);
  let pasos = 0;
  while (t._beamCd === 0 && pasos < 1000) { t.update(dt, [a], juego); pasos++; }
  assert.ok(t._beamCd > 0, 'la ventana se cerró y entró el cooldown');
  assert.ok(casi(t._beamCd, TOWERS.beam.beamCooldown), 'el cooldown es el de la tabla');
  assert.ok(casi(pasos * dt, TOWERS.beam.beamBurst, 2 * dt),
    `la ventana dura beamBurst (${(pasos * dt).toFixed(2)} s, beamBurst ${TOWERS.beam.beamBurst})`);
  assert.equal(t.active, false, 'el haz está apagado');
  assert.equal(t._beamTarget, null, 'y suelta el blanco');
  // Un enemigo NUEVO durante el cooldown NO enciende el haz.
  const nuevo = mkTank(270, 650);
  const hpAntes = nuevo.hp;
  for (let i = 0; i < 60; i++) t.update(dt, [nuevo], juego); // 1 s < 2,5 s
  assert.equal(t.active, false, 'durante el cooldown no adquiere');
  assert.equal(t._beamTarget, null);
  assert.equal(nuevo.hp, hpAntes, 'y no le pega');
  assert.ok(t._beamCd > 0, `el cooldown sigue corriendo (${t._beamCd.toFixed(2)} s)`);
  // Al vencer el cooldown, la próxima adquisición abre ventana nueva.
  let pasosCd = 0;
  while (t._beamTarget === null && pasosCd < 600) { t.update(dt, [nuevo], juego); pasosCd++; }
  assert.ok(casi((60 + pasosCd) * dt, TOWERS.beam.beamCooldown, 2 * dt),
    `el cooldown dura beamCooldown (${((60 + pasosCd) * dt).toFixed(2)} s)`);
  assert.equal(t._beamTarget, nuevo, 'al vencer el cooldown vuelve a adquirir');
  assert.ok(t.active, 'el haz se enciende otra vez');
  assert.ok(nuevo.hp < hpAntes, 'y dispara');
});

test('fase 66: dos enemigos dentro del ANCHO: solo el blanco pierde vida', () => {
  setMeta({});
  // El ancho (columnHalfWidth 260 × detectMul) es la ventana de
  // ADQUISICIÓN, no un área de daño: el haz lastima a UNO solo.
  const blanco = mkTank(270, 600, 5000);
  const otro = mkTank(470, 600, 4000);
  assert.ok(Math.abs(otro.x - 270) <= TOWERS.beam.columnHalfWidth, 'los dos están dentro del ancho');
  const { t, juego } = mkTowerF66('beam', [blanco, otro]);
  for (let i = 0; i < 30; i++) t.update(1 / 60, [blanco, otro], juego);
  assert.equal(t._beamTarget, blanco, "'toughest': se clava en el de más vida");
  assert.ok(blanco.hp < blanco.hpMax, 'el blanco pierde vida');
  assert.equal(otro.hp, otro.hpMax, 'el otro (dentro del ancho) NO recibe nada');
});

test('fase 66: un enemigo SOBRE la línea del haz tampoco come daño (manto solo visual)', () => {
  setMeta({});
  // El MANTO (el grosor dibujado) es SOLO VISUAL — decisión del usuario:
  // "solo daña al target elegido, no a lo demás". Hasta la fase 66 los que
  // cruzaban la línea fina (≤12 px + el `rangeAdd` del perk) comían el DPS
  // base sin ramp: un daño secundario escondido. Ahora no reciben NADA.
  const blanco = mkTank(270, 400, 9000);
  const enLinea = mkTank(270, 600, 5000);   // misma X: cae SOBRE el segmento
  const { t, juego } = mkTowerF66('beam', [blanco, enLinea]);
  for (let i = 0; i < 30; i++) t.update(1 / 60, [blanco, enLinea], juego);
  assert.equal(t._beamTarget, blanco, "'toughest': el de más vida es el blanco");
  assert.ok(blanco.hp < blanco.hpMax, 'el blanco pierde vida');
  assert.equal(enLinea.hp, enLinea.hpMax, 'el que está SOBRE la línea no recibe daño');
});

test('fase 66: el ramp del haz SE VE (grosor y brillo crecen con el foco)', () => {
  const manto = (foco) => {
    const e = mkTank(270, 700);
    const { t, juego } = mkTowerF66('beam', [e]);
    t._beamTarget = e;
    t._beamTime = foco;
    t.fire([e], juego, 1 / 60);
    const fx = juego.log.efectos[0];
    const ctx = mantoCtx();
    fx.draw(ctx, 0.5);
    return { ramp: fx.ramp, h0: ctx.mantoH0, glow: ctx.mantoGlow };
  };
  const inicio = manto(0);
  const tope = manto(10);
  assert.equal(inicio.ramp, 1, 'sin foco el manto va a ×1');
  assert.equal(tope.ramp, TOWERS.beam.beamRampMax, 'y al tope del ramp a ×4,5');
  assert.ok(tope.h0 > inicio.h0, `el manto se ve MÁS GRUESO (${inicio.h0} → ${tope.h0} px de semi-ancho)`);
  assert.ok(tope.glow > inicio.glow, `y con más glow (${inicio.glow} → ${tope.glow} px)`);
});

test('fase 66: durante el cooldown el emisor del Beam se dibuja APAGADO', () => {
  const t = new Tower('beam', 270, 1, 830);
  t.game = { engine: { _t: 0 } };
  // El color de la boca del Beam es su `accent` (MUZZLE_ACCENT no lo cubre).
  const boca = MUZZLE_ACCENT[TOWERS.beam.kind] ?? TOWERS.beam.accent;
  // Listo (sin cooldown): la boca late con su color de firma.
  let ctx = recCtx();
  t.render(ctx);
  assert.ok(ctx.arcs.some((a) => a.r === 2 && a.style === boca),
    'en reposo la boca late con su color de firma');
  // En cooldown: marca apagada (disco chico y tenue) y SIN pulso.
  t._beamCd = 1.2;
  ctx = recCtx();
  t.render(ctx);
  const apagadas = ctx.arcs.filter((a) => a.r < 2.5 && a.alpha <= 0.3);
  assert.equal(apagadas.length, 1, 'una sola marca de boca apagada');
  assert.notEqual(apagadas[0].style, boca, 'la boca apagada NO se pinta con el color de firma');
  assert.ok(!ctx.arcs.some((a) => a.r === 2 && a.style === boca),
    'y no queda el pulso de reposo');
});

// ---------- Láser: el rayo llega al BORDE del campo ----------

test('fase 66: el rayo del Láser muere en el BORDE con cualquier ángulo', () => {
  const mkFx = (ang) => new LaserStaticFx(
    { engine: { _t: 0, emit() {}, sfxSafe() {} } },
    270, 796, ang, 45, TOWERS.laser,
  );
  // Ángulo, borde esperado. La boca está en (270, 796) (fila 830, -34).
  const casos = [
    [0, 'tope'],                              // vertical: sale por arriba
    [30 * Math.PI / 180, 'lateral derecho'],
    [45 * Math.PI / 180, 'lateral derecho'],
    [-40 * Math.PI / 180, 'lateral izquierdo'],
  ];
  for (const [ang, borde] of casos) {
    const fx = mkFx(ang);
    const grados = Math.round(ang * 180 / Math.PI);
    // Los dos extremos dentro del canvas (el de salida SOBRE el borde).
    assert.ok(fx.ex >= -1e-9 && fx.ex <= CONFIG.CANVAS_W + 1e-9
      && fx.ey >= -1e-9 && fx.ey <= LAYOUT.h + 1e-9,
    `a ${grados}° el extremo (${fx.ex}, ${fx.ey}) se sale del canvas`);
    const enBorde = Math.abs(fx.ey) < 1e-6
      || Math.abs(fx.ex) < 1e-6 || Math.abs(fx.ex - CONFIG.CANVAS_W) < 1e-6;
    assert.ok(enBorde, `a ${grados}° el rayo debe morir en el borde (${borde}), no a media altura`);
  }
  // El vertical llega justo al tope (nada de corte a 700 px).
  const vertical = mkFx(0);
  assert.equal(vertical.len, 796, 'el rayo vertical cubre toda la columna');
  assert.equal(vertical.ey, 0, 'y su extremo es el tope del campo');
  // Guardas: `aim` no finito → vertical; cos ≈ 0 → sale por el lateral.
  const raro = mkFx(NaN);
  assert.equal(raro.ex, 270);
  assert.equal(raro.ey, 0, 'un ángulo no finito no rompe el ray-cast: sale por arriba');
  const horizontal = mkFx(Math.PI / 2);
  assert.equal(horizontal.ex, CONFIG.CANVAS_W, 'a 90° (cos ≈ 0) sale por el lateral');
  assert.ok(casi(horizontal.ey, 796), 'y a la altura de la boca');
});

test('fase 66: el rayo penetrante alcanza más allá de los 700 px viejos', () => {
  // Vertical desde la boca (270, 796): el segmento viejo (LASER_LENGTH =
  // 700) terminaba en y = 96; ahora llega al tope. El enemigo a y = 40
  // está a 756 px de la boca: fuera del alcance viejo, dentro del nuevo.
  const e = mkTank(270, 40);
  const juego = mkGameF66([e]);
  const fx = new LaserStaticFx(juego, 270, 796, 0, 45, TOWERS.laser);
  const antes = e.hp;
  fx.update(0.05);
  assert.ok(e.hp < antes, `el enemigo a 756 px recibe daño (hp ${e.hp})`);
  assert.ok(casi(antes - e.hp, 45 * 0.05), 'con el DPS × dt del rayo');
});
