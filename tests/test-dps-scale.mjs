// tests/test-dps-scale.mjs — DIAL DE PRESENTACIÓN/BALANCE DEL ARSENAL
// -----------------------------------------------------------------------------
// towers-data.js declara `DPS_SCALE` (×0,75) y su tabla de excepciones
// (`DPS_SCALE_BY_UNIT`: la Tesla ×1 por identidad anti-enjambre). Este test
// fija el contrato:
//   · el daño de salida de las 8 torres es el de la tabla × su escala;
//   · la Tesla NO se escala;
//   · la cadencia no se toca;
//   · el DoT propio (cráter, quemadura) y los 3 drones escalan igual, y
//     `perkDmgFor` de meta.js sigue devolviendo el valor SIN dial (se escala
//     en el call site);
//   · las mecánicas de identidad (Supresión al 45 %, umbral del Misil) no
//     cambian por el dial.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TOWERS, DRONES, DPS_SCALE, DPS_SCALE_BY_UNIT, dpsScaleFor,
} from '../js/towers-data.js';
import { Tower, Drone, CraterFx } from '../js/towers.js';
import { onMechanicHit } from '../js/tower-mechanics.js';
import { saveMeta, perkDmgFor } from '../js/meta.js';

/** Meta limpio (Nvl.1, sin perks) en el storage falso de meta.js. */
function setMeta({ levels = {}, perks = {} } = {}) {
  const data = new Map();
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  saveMeta({ levels, perkChoices: perks }, storage);
  return storage;
}

function mkGame() {
  return {
    fortress: { hp: 500, maxHp: 1000, enemies: [] },
    engine: {
      _t: 0, addEntity() {}, addEffect() {}, emit() {}, spawnParticles() {},
      floatText() {}, sfxSafe() {},
    },
  };
}

/** Enemigo que no muere nunca (para medir daño exacto). */
function mkTank(x, y, hp = 1e6) {
  return {
    x, y, r: 10, hp, hpMax: hp, dead: false, slowFactor: 1, stun: 0,
    poisonT: 0, poisonDps: 0,
    takeDamage(n) { this.hp -= n; return false; },
  };
}

function dummy(over = {}) {
  return {
    x: 0, y: 0, r: 10, dead: false, hp: 100, hpMax: 100, marks: {},
    takeDamage(n) { this.hp -= n; return false; },
    ...over,
  };
}

test('escala: el dial vale 0,75 y la Tesla es la ÚNICA exenta', () => {
  assert.equal(DPS_SCALE, 0.75);
  assert.ok(Object.isFrozen(DPS_SCALE_BY_UNIT), 'la tabla de excepciones es inmutable');
  assert.deepEqual(Object.keys(DPS_SCALE_BY_UNIT), ['tesla']);
  assert.equal(dpsScaleFor('tesla'), 1, 'la Tesla conserva su DPS (anti-enjambre)');
  for (const type of Object.keys(TOWERS).filter((t) => t !== 'tesla')) {
    assert.equal(dpsScaleFor(type), DPS_SCALE, `${type} debe usar el dial`);
  }
  for (const type of Object.keys(DRONES)) {
    assert.equal(dpsScaleFor(type), DPS_SCALE, `${type} debe usar el dial`);
  }
  assert.equal(dpsScaleFor('unidad-inexistente'), DPS_SCALE, 'sin excepción manda el dial');
});

test('escala: el daño de cada torre es el previo al dial × su escala', () => {
  setMeta({});
  for (const type of Object.keys(TOWERS)) {
    const d = TOWERS[type];
    const base = (d.kind === 'beam' || d.kind === 'laser') ? d.damagePerSec : d.damage;
    const t = new Tower(type, 100, 1);
    const previo = Math.round(base);
    assert.equal(t.damage, previo * dpsScaleFor(type),
      `${type}: ${previo} × ${dpsScaleFor(type)}`);
    // La curva por nivel se conserva (se escala DESPUÉS del redondeo).
    t.level = 5;
    assert.equal(t.damage, Math.round(base * 2) * dpsScaleFor(type),
      `${type}: el ×2 del Lv.5 se mantiene`);
  }
});

test('escala: la Tesla sigue en ×1 y no es un caso especial de la tabla', () => {
  setMeta({});
  const t = new Tower('tesla', 100, 1);
  assert.equal(t.damage, TOWERS.tesla.damage, 'Tesla: daño de tabla, sin dial');
  assert.equal(t.damage, 7);
});

test('1.7.1: DPS objetivo de Guardian, Missile y Tesla', () => {
  setMeta({});
  // Guardian: 5 × 0.75 = 3.75 por disparo / 0.25 = 15.0.
  const g = new Tower('guardian', 100, 1);
  assert.equal(g.damage / g.cooldown, 15, 'Guardian 15.0 DPS');
  // Missile: 170 × 0.75 = 127.5; splash round(63.75) = 64 / 3.2 = 20.0.
  const m = new Tower('missile', 100, 1);
  assert.equal(Math.round(m.damage * 0.5) / m.cooldown, 20, 'Missile 20.0 DPS efectivo');
  // Tesla: 7 / 0.7 = 10.0.
  const t = new Tower('tesla', 100, 1);
  assert.equal(t.damage / t.cooldown, 10, 'Tesla 10.0 DPS');
});

test('escala: la cadencia no se toca', () => {
  setMeta({});
  for (const type of Object.keys(TOWERS)) {
    const d = TOWERS[type];
    if (!Number.isFinite(d.cooldown)) continue; // Beam: continuo, sin cooldown
    const t = new Tower(type, 100, 1);
    assert.equal(t.cooldown, d.cooldown, `${type}: cooldown Lv.1 intacto`);
    t.level = 5;
    assert.ok(Math.abs(t.cooldown - d.cooldown * Math.pow(0.92, 4)) < 1e-12,
      `${type}: la curva de cadencia por nivel sigue igual`);
  }
});

test('escala: el cráter del Mortar escala su DPS (incluye craterDpsAdd)', () => {
  // DPS de la tabla (sin opts).
  const base = new CraterFx({ engine: { _t: 0 } }, 0, 0);
  assert.equal(base.dps, TOWERS.mortar.mech.dps * dpsScaleFor('mortar'));
  // Con el addon de los perks ya sumado (como lo pasa towers.js).
  const conAddon = new CraterFx({ engine: { _t: 0 } }, 0, 0, {
    dps: TOWERS.mortar.mech.dps + 4,
  });
  assert.equal(conAddon.dps, (TOWERS.mortar.mech.dps + 4) * dpsScaleFor('mortar'));
  // La vida y el slow NO se tocan.
  assert.equal(conAddon.life, TOWERS.mortar.mech.duration);
  assert.equal(conAddon.slow, TOWERS.mortar.mech.slow);
});

test('escala: la quemadura de la Rueda de Fuego escala base y addons', () => {
  const limpio = dummy();
  onMechanicHit('firewheel', limpio, {}, {});
  assert.equal(limpio.poisonDps, 8 * dpsScaleFor('firewheel'));
  assert.equal(limpio.poisonT, 3, 'la duración no cambia');

  const conPerk = dummy();
  onMechanicHit('firewheel', conPerk, {}, { mods: { burnDpsAdd: 4, burnTimeAdd: 1 } });
  assert.equal(conPerk.poisonDps, (8 + 4) * dpsScaleFor('firewheel'));
  assert.equal(conPerk.poisonT, 4);
});

test('escala: el dron Rueda de Fuego escala su DPS de contacto', () => {
  setMeta({});
  const juego = mkGame();
  const dr = new Drone('firewheel', juego, 0);
  const e = mkTank(dr.x, dr.y);
  juego.fortress.enemies = [e];
  dr.update(0.5, [e]);
  const esperado = DRONES.firewheel.dps * 0.5 * dpsScaleFor('firewheel');
  assert.ok(Math.abs((1e6 - e.hp) - esperado) < 1e-9,
    `la rueda debe hacer ${esperado} en 0,5 s (hizo ${1e6 - e.hp})`);
});

test('escala: la picadura y el veneno de los Mosquitos escalan', () => {
  setMeta({});
  const juego = mkGame();
  const dr = new Drone('wasps', juego, 0);
  const e = mkTank(dr.x, dr.y);
  juego.fortress.enemies = [e];
  dr.update(0.1, [e]); // salen los mosquitos
  dr.update(1.0, [e]); // pican los 3
  const picadura = 3 * Math.round(DRONES.wasps.stingDamage) * dpsScaleFor('wasps');
  assert.ok(Math.abs((1e6 - e.hp) - picadura) < 1e-9,
    `3 picaduras deben hacer ${picadura} (hicieron ${1e6 - e.hp})`);
  assert.equal(e.poisonDps, DRONES.wasps.venomDps * dpsScaleFor('wasps'),
    'el veneno escala con el mismo dial');
  assert.equal(e.poisonT, DRONES.wasps.venomTime, 'la duración del veneno no cambia');
});

test('escala: las espinas del Campo de Fuerza escalan en el CALL SITE', () => {
  // meta.js NO se toca: `perkDmgFor` sigue devolviendo el DPS del perk × meta.
  setMeta({ perks: { forcefield: [0] } }); // tier 1 A: espinas 12/s
  const sinDial = perkDmgFor('forcefield');
  assert.equal(sinDial, 12, 'perkDmgFor devuelve el valor SIN dial');

  const juego = mkGame();
  const dr = new Drone('forcefield', juego, 0);
  const e = mkTank(dr.x, dr.y);
  juego.fortress.enemies = [e];
  dr.update(0.5, [e]);
  const esperado = sinDial * 0.5 * dpsScaleFor('forcefield');
  assert.ok(Math.abs((1e6 - e.hp) - esperado) < 1e-9,
    `las espinas deben hacer ${esperado} en 0,5 s (hicieron ${1e6 - e.hp})`);
  setMeta({});
});

test('escala: la Supresión sigue siendo el 45 % del impacto ESCALADO', () => {
  setMeta({});
  const e = dummy();
  const game = { engine: { _t: 0 } };
  const impacto = new Tower('guardian', 100, 1).damage; // 5 × 0,75 = 3,75
  onMechanicHit('guardian', e, game, { dmg: impacto });
  onMechanicHit('guardian', e, game, { dmg: impacto });
  onMechanicHit('guardian', e, game, { dmg: impacto });
  assert.equal(e.hp, 100 - Math.round(impacto * 0.45),
    'la detonación conserva la fracción, sobre el daño ya escalado');
});

test('escala: el umbral del Misil es umbral, no daño', () => {
  setMeta({});
  const t = new Tower('missile', 270, 1, 830);
  assert.equal(t.damage, TOWERS.missile.damage * dpsScaleFor('missile'));
  const added = [];
  const game = {
    engine: { addEntity: (x) => added.push(x), emit() {}, _t: 0 },
    fortress: { enemies: [] },
  };
  t.game = game;
  t.fire([{ x: 270, y: 200, dead: false, r: 10 }], game, 0.016);
  assert.equal(added.length, 1, 'el misil se lanzó');
  assert.equal(added[0].executeThreshold, TOWERS.missile.mech.threshold,
    'el umbral de ejecución no se escala');
});
