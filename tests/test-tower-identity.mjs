// tests/test-tower-identity.mjs — GUARDIÁN DE IDENTIDAD
// -----------------------------------------------------------------------------
// Antes de la fase 76 las 11 unidades compartían remate + robo de vida +
// explosión al matar. Este test fija el contrato de openspec/specs/gameplay/
// tower-identity/spec.md: una mecánica firma por unidad, vocabulario acotado
// y hooks que de verdad cambian el combate.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOWERS, DRONES } from '../js/towers-data.js';
import {
  MECHANICS, mechanicOf, mechIdOf, isMechanicOwner,
  mechanicDamageMul, onMechanicHit, onMechanicTick, onMechanicKill,
} from '../js/tower-mechanics.js';
import { PERKS } from '../js/meta.js';
import { CATALOG } from '../js/cards.js';
import { TECH_CARDS } from '../js/cards-data.js';
import { applyMark, applyPoison, hasMark } from '../js/enemies-status.js';
import { Tower } from '../js/towers.js';
import { CraterFx } from '../js/towers-fx.js';

const UNITS = [...Object.keys(TOWERS), ...Object.keys(DRONES)];

/** Enemigo mínimo para probar los hooks sin DOM. */
function dummy(over = {}) {
  return {
    x: 0, y: 0, r: 10, dead: false, hp: 100, hpMax: 100, marks: {},
    takeDamage(n) {
      this.hp -= n;
      if (this.hp <= 0) { this.dead = true; return true; }
      return false;
    },
    ...over,
  };
}

test('identidad: las 11 unidades declaran una mecánica firma ÚNICA', () => {
  assert.equal(UNITS.length, 11);
  const ids = UNITS.map((type) => mechIdOf(type));
  for (const type of UNITS) {
    const id = mechIdOf(type);
    assert.ok(id, `${type} no declara mech.id`);
    assert.ok(MECHANICS[id], `${type} declara una mecánica desconocida: ${id}`);
    assert.equal(MECHANICS[id].owner, type,
      `${type} usa "${id}", pero su dueño declarado es ${MECHANICS[id].owner}`);
    assert.equal(isMechanicOwner(type, id), true);
    assert.equal(mechanicOf(type).id, id);
    assert.ok(Array.isArray(MECHANICS[id].hooks) && MECHANICS[id].hooks.length > 0,
      `${id} no declara hooks`);
  }
  assert.equal(new Set(ids).size, UNITS.length,
    `hay mecánicas repetidas: ${ids.join(', ')}`);
});

test('identidad: el vocabulario genérico sólo vive en su dueño', () => {
  const DUEÑOS = {
    executeThreshold: ['missile'],
    lifesteal: ['beam', 'wasps'],
    explodeOnKillChance: ['firewheel'],
    explodeOnKillDmg: ['firewheel'],
    explodeOnKillRadius: ['firewheel'],
    slowOnHit: ['beam'],
    stunChance: ['thunderstroke'],
    bounceCount: ['guardian'],
    critChanceAdd: ['guardian', 'gauss'],
    critDmgMul: ['guardian', 'gauss'],
    chainFork: ['tesla'],
    extraCount: ['missile', 'tesla', 'wasps', 'laser'],
    areaMul: ['mortar'],
    radiusAdd: ['firewheel', 'forcefield'],
  };
  const ofensas = [];
  for (const [type, tiers] of Object.entries(PERKS)) {
    for (const [i, tier] of tiers.entries()) {
      for (const rama of ['A', 'B']) {
        for (const key of Object.keys(tier[rama].mods)) {
          const dueños = DUEÑOS[key];
          if (dueños && !dueños.includes(type)) {
            ofensas.push(`${type} tier ${i + 1} ${rama}: "${key}" pertenece a ${dueños.join('/')}`);
          }
        }
      }
    }
  }
  assert.deepEqual(ofensas, [],
    `claves fuera de identidad:\n  - ${ofensas.join('\n  - ')}`);
});

test('identidad: las cartas de técnica tampoco reparten mecánicas ajenas', () => {
  // Las técnicas son el segundo canal de mecánicas (además de los perks).
  // Un `tech_slow` del Guardian volvería a homogenizar la torre aunque sus
  // perks ya estén limpios: este test cierra ese agujero.
  const DUEÑOS = {
    executeThreshold: ['missile'],
    lifesteal: ['beam', 'wasps'],
    slowOnHit: ['beam'],
    stunChance: ['thunderstroke'],
    critChanceAdd: ['guardian', 'gauss'],
    bounceCount: ['guardian'],
    extraCount: ['missile', 'tesla', 'wasps', 'laser'],
    areaMul: ['mortar'],
    radiusAdd: ['firewheel', 'forcefield'],
  };
  const ofensas = [];
  for (const tech of TECH_CARDS) {
    for (const key of Object.keys(tech.mods)) {
      const dueños = DUEÑOS[key];
      if (dueños && !dueños.includes(tech.unit)) {
        ofensas.push(`${tech.id} (${tech.unit}): "${key}" pertenece a ${dueños.join('/')}`);
      }
    }
  }
  assert.deepEqual(ofensas, [], `técnicas fuera de identidad:\n  - ${ofensas.join('\n  - ')}`);
});

test('identidad: cada combo exige al menos DOS piezas reales', () => {
  const combos = CATALOG.filter((c) => c.id.startsWith('combo_'));
  for (const c of combos) {
    const piezas = (c.requiresUnits?.length ?? 0)
      + (c.requiresTags?.length ?? 0)
      + (c.requiresAllTags?.length ?? 0)
      + (c.requiresCards?.length ?? 0)
      + (c.requiresBlackHole ? 1 : 0);
    assert.ok(piezas >= 2, `${c.id} sólo exige ${piezas} pieza(s): no es un combo`);
  }
});

test('identidad: nadie conserva la trinidad remate + robo + explosión', () => {
  const trinidad = ['executeThreshold', 'lifesteal', 'explodeOnKillChance'];
  for (const [type, tiers] of Object.entries(PERKS)) {
    const keys = new Set(tiers.flatMap((tier) => [tier.A, tier.B])
      .flatMap((perk) => Object.keys(perk.mods)));
    const tiene = trinidad.filter((k) => keys.has(k));
    assert.ok(tiene.length <= 1,
      `${type} conserva ${tiene.join(' + ')}: la identidad compartida volvió`);
  }
});

test('identidad: Supresión acumula foco y detona al tercer impacto', () => {
  const e = dummy();
  const game = { engine: { _t: 0 } };
  onMechanicHit('guardian', e, game, { dmg: 10 });
  assert.equal(e._sup, 1);
  onMechanicHit('guardian', e, game, { dmg: 10 });
  assert.equal(e._sup, 2);
  onMechanicHit('guardian', e, game, { dmg: 10 });
  assert.equal(e._sup, 0, 'el foco se consume al detonar');
  assert.equal(e.hp, 95, 'la detonación aplica 45 % del daño del impacto (redondeado)');
});

test('identidad: Juicio, Ion, Riel, Corte y Quemadura dejan su marca', () => {
  const e = dummy();
  onMechanicHit('thunderstroke', e, {}, {});
  assert.ok(hasMark(e, 'judgment'));
  onMechanicHit('tesla', e, {}, {});
  assert.ok(hasMark(e, 'ion'));
  onMechanicHit('gauss', e, {}, {});
  assert.ok(hasMark(e, 'rail'));
  onMechanicHit('laser', e, {}, {});
  assert.ok(hasMark(e, 'cut'));

  const burn = dummy();
  onMechanicHit('firewheel', burn, {}, { mods: { burnDpsAdd: 2, burnTimeAdd: 1 } });
  assert.equal(burn.poisonKind, 'burn');
  assert.equal(burn.poisonDps, 10); // 8 base + 2 del perk
  assert.equal(burn.poisonT, 4);    // 3 base + 1 del perk
});

test('identidad: el DoT conserva la fuente más fuerte (fuego vs veneno)', () => {
  const e = dummy();
  applyPoison(e, 10, 3, 'burn');
  applyPoison(e, 2, 3, 'poison');
  assert.equal(e.poisonKind, 'burn', 'un veneno débil no pinta de verde una quemadura');
  assert.equal(e.poisonDps, 10);
  applyPoison(e, 20, 3, 'poison');
  assert.equal(e.poisonKind, 'poison', 'un veneno más fuerte sí toma la identidad');
  assert.equal(e.poisonDps, 20);
});

test('identidad: Fusión acumula stacks con throttle y los pierde al expirar', () => {
  const e = dummy();
  const tower = { _meltAcc: 0 };
  onMechanicTick('beam', e, {}, { unit: tower, dt: 0.7 });
  assert.equal(e.meltStacks, 1);
  onMechanicTick('beam', e, {}, { unit: tower, dt: 0.7 });
  assert.equal(e.meltStacks, 2);
  // La marca expiró: el próximo stack arranca de cero, no de 2.
  e.marks.melt = 0;
  onMechanicTick('beam', e, {}, { unit: tower, dt: 0.7 });
  assert.equal(e.meltStacks, 1);
});

test('identidad: las marcas amplifican sólo donde corresponde', () => {
  const e = dummy();
  assert.equal(mechanicDamageMul(e, 'ballistic', 'guardian'), 1);
  applyMark(e, 'cut', 2);
  assert.ok(Math.abs(mechanicDamageMul(e, 'beam', 'beam') - 1.08) < 1e-9);
  applyMark(e, 'melt', 2);
  e.meltStacks = 3;
  assert.ok(Math.abs(mechanicDamageMul(e, 'beam', 'beam') - 1.08 * 1.12) < 1e-9);
  applyMark(e, 'judgment', 2);
  assert.ok(mechanicDamageMul(e, 'bolt', 'thunderstroke') > mechanicDamageMul(e, 'blast', 'mortar'));
  applyMark(e, 'ion', 2);
  assert.ok(mechanicDamageMul(e, 'chain', 'tesla') > mechanicDamageMul(e, 'ballistic', 'guardian'));
  // Riel sobre un enemigo LIMPIO (sin cut/melt/judgment/ion de las pruebas
  // anteriores): el Gauss no se buffea con su propia marca; el Guardian sí.
  const rail = dummy();
  applyMark(rail, 'rail', 2);
  assert.ok(mechanicDamageMul(rail, 'ballistic', 'guardian') > 1);
  assert.equal(mechanicDamageMul(rail, 'ballistic', 'gauss'), 1,
    'el Gauss no se buffea con su propia marca de riel');
});

test('identidad: el veneno de las Avispas se propaga al morir', () => {
  const a = dummy({ x: 20, y: 0, poisonKind: 'poison', poisonDps: 10 });
  const b = dummy({ x: 60, y: 0 });
  const game = { fortress: { enemies: [a, b] } };
  onMechanicKill(a, game);
  assert.equal(b.poisonKind, 'poison');
  assert.equal(b.poisonDps, 5, 'propaga el 50 % del DPS');
  assert.equal(b.poisonT, 2);
});

test('identidad: el Misil lleva execute intrínseco aunque no tenga perks', () => {
  const added = [];
  const game = { engine: { addEntity: (e) => added.push(e), emit() {}, _t: 0 } };
  const t = new Tower('missile', 270, 1, 0);
  t.game = game;
  t.fire([{ x: 270, y: 200, dead: false, r: 10 }], game, 0.016);
  assert.equal(added.length, 1);
  assert.equal(added[0].executeThreshold, TOWERS.missile.mech.threshold);
});

test('identidad: el Cráter del Mortar quema y frena dentro de su radio', () => {
  const dentro = dummy({ x: 10, y: 0 });
  const fuera = dummy({ x: 500, y: 0 });
  const game = { engine: { _t: 0 }, fortress: { enemies: [dentro, fuera] } };
  const crater = new CraterFx(game, 0, 0, { radius: 150, dps: 20, life: 3, slow: 0.1 });
  crater.update(0.3);
  assert.ok(dentro.hp < 100, 'el cráter hace daño dentro del radio');
  assert.equal(fuera.hp, 100, 'el cráter no toca fuera del radio');
  assert.ok((dentro.slowTimer ?? 0) > 0, 'el cráter frena');
});
