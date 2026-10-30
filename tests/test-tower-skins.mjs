// tests/test-tower-skins.mjs — sistema de skins de torres/drones
// -----------------------------------------------------------------------------
// La skin es PRESENTACIÓN: paleta, motivos, pad y FX. Este test fija que:
//   · los 5 temas cubren las 11 unidades;
//   · compilar una skin no muta TOWER_RIGS;
//   · el tema base (volcanico) deja el render EXACTO;
//   · una skin desconocida cae al fallback;
//   · los motivos añaden formas y respetan el presupuesto;
//   · Node sin canvas/DOM no rompe.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOWERS, DRONES } from '../js/towers-data.js';
import {
  TOWER_SKINS, BASE_ACCENTS, skinFor, skinForUnit,
  normalizeSkin, loadSkin, saveSkin,
} from '../js/tower-skins.js';
import {
  TOWER_RIGS, compileSkin, resolveRig, rigBox, rigColors,
  renderTowerRig, resetTowerArtCaches,
} from '../js/tower-art.js';
import { Tower, projectileColor } from '../js/towers.js';
import { Drone } from '../js/towers-drones.js';
import { renderTowerIcon } from '../js/meta.js';

const THEMES = ['volcanico', 'cyberpunk', 'neon', 'aqua', 'cielo'];
const TOWER_TYPES = Object.keys(TOWERS);
const DRONE_TYPES = Object.keys(DRONES);

/** ctx mínimo para renderizar sin canvas real. */
function fakeCtx() {
  const methods = new Set([
    'save', 'restore', 'translate', 'scale', 'rotate', 'beginPath', 'closePath',
    'moveTo', 'lineTo', 'arc', 'ellipse', 'rect', 'fill', 'stroke', 'clip',
    'drawImage', 'setLineDash', 'clearRect', 'fillRect',
    'fillText', 'strokeText',
  ]);
  return new Proxy({}, {
    get(target, prop) {
      if (prop === 'createRadialGradient') {
        return () => ({ addColorStop() {} });
      }
      if (prop === 'measureText') return () => ({ width: 0 });
      if (methods.has(prop)) return () => {};
      return target[prop];
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });
}

function fakeStorage() {
  const data = new Map();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
}

test('skins: los 5 temas cubren las 8 torres y los 3 drones', () => {
  for (const theme of THEMES) {
    for (const type of TOWER_TYPES) {
      const skin = skinForUnit(theme, 'auto', type);
      assert.ok(skin, `${theme}/${type}: sin skin`);
      if (theme === 'volcanico') {
        assert.equal(skin.base, true, 'el tema base no debe alterar el render');
        assert.equal(skin.palette, null);
      } else {
        assert.equal(skin.base, false);
        assert.ok(skin.palette?.accent, `${theme}/${type}: falta accent`);
        assert.ok(Array.isArray(skin.motifs) && skin.motifs.length >= 3,
          `${theme}/${type}: faltan motivos de forma`);
        // El catálogo no puede referenciar piezas que el rig no tiene.
        const rig = TOWER_RIGS[TOWERS[type].kind];
        const ids = new Set(rig.parts.map((p) => p.id));
        const per = skin.perUnit ?? {};
        for (const id of per.remove ?? []) {
          assert.ok(ids.has(id), `${theme}/${type}: remove de pieza inexistente (${id})`);
        }
        for (const id of Object.keys(per.patch ?? {})) {
          assert.ok(ids.has(id), `${theme}/${type}: patch de pieza inexistente (${id})`);
        }
        for (const extra of per.add ?? []) {
          assert.ok(extra.id && extra.role, `${theme}/${type}: add sin id/rol`);
          assert.equal(['d', 'circle', 'ellipse', 'rect', 'line']
            .filter((k) => extra[k] != null).length, 1,
          `${theme}/${type}: add con shape inválida`);
        }
      }
    }
    for (const type of DRONE_TYPES) {
      const skin = skinForUnit(theme, 'auto', type);
      assert.ok(skin, `${theme}/${type}: sin skin de dron`);
      if (theme !== 'volcanico') {
        assert.ok(skin.palette?.body && skin.palette?.accent);
      }
    }
  }
});

test('skins: el acento conserva la familia de cada torre', () => {
  for (const type of TOWER_TYPES) {
    const base = BASE_ACCENTS[type];
    assert.ok(base, `${type}: falta BASE_ACCENTS`);
    assert.equal(base, projectileColor(type),
      `${type}: BASE_ACCENTS debe coincidir con la firma base`);
    const cyber = skinForUnit('cyberpunk', 'auto', type);
    assert.equal(cyber.palette.accent, cyber.accents?.[type] ?? cyber.palette.accent);
    assert.equal(typeof cyber.palette.accent, 'string');
    assert.match(cyber.palette.accent, /^#[0-9A-Fa-f]{6}$/);
  }
});

test('skins: un skinId explícito pisa al tema (base para skins futuras)', () => {
  const explicit = skinForUnit('aqua', 'cyberpunk', 'guardian');
  assert.equal(explicit.id, 'cyberpunk');
  assert.equal(explicit.base, false);
  assert.equal(explicit.palette.accent, TOWER_SKINS.cyberpunk.accents.guardian);
  // Y el tema base con una skin explícita tampoco vuelve al render viejo.
  const baseTheme = skinForUnit('volcanico', 'neon', 'gauss');
  assert.equal(baseTheme.id, 'neon');
  assert.equal(baseTheme.base, false);
});

test('skins: el tema base resuelve el MISMO rig congelado (sin copia)', () => {
  for (const kind of Object.keys(TOWER_RIGS)) {
    const base = skinForUnit('volcanico', 'auto', 'guardian');
    assert.equal(resolveRig(kind, base), TOWER_RIGS[kind],
      `${kind}: el tema base no debe compilar un rig nuevo`);
  }
});

test('skins: normalize/fallback y persistencia tolerante', () => {
  assert.equal(normalizeSkin('cyberpunk'), 'cyberpunk');
  assert.equal(normalizeSkin('no-existe'), 'auto');
  assert.equal(skinFor('no-existe', 'auto').id, 'volcanico');
  assert.equal(skinFor('cyberpunk', 'no-existe').id, 'cyberpunk');
  const st = fakeStorage();
  assert.equal(loadSkin(st), 'auto');
  assert.equal(saveSkin('neon', st), 'neon');
  assert.equal(loadSkin(st), 'neon');
  saveSkin('no-existe', st);
  assert.equal(loadSkin(st), 'auto');
});

test('skins: compilar no muta TOWER_RIGS y agrega motivos/patch', () => {
  const before = JSON.stringify(TOWER_RIGS.fan);
  const skin = skinForUnit('cyberpunk', 'auto', 'guardian');
  const rig = resolveRig('fan', skin);
  assert.ok(rig);
  assert.ok(Object.isFrozen(rig));
  assert.ok(Object.isFrozen(rig.parts));
  assert.ok(rig.parts.length > TOWER_RIGS.fan.parts.length, 'la skin debe sumar piezas');
  assert.ok(rig.parts.some((p) => p.id === 'skin_cyber_antenna'));
  assert.ok(rig.parts.some((p) => p.lowQSkip === true));
  const visor = rig.parts.find((p) => p.id === 'visorEye');
  assert.equal(visor.role, 'core');
  assert.equal(JSON.stringify(TOWER_RIGS.fan), before, 'TOWER_RIGS no puede mutar');
  resetTowerArtCaches();
  const again = resolveRig('fan', skin);
  assert.notEqual(again, rig, 'resetTowerArtCaches debe limpiar el cache de skins');
});

test('skins: compilar las 8 torres no muta ningún rig base', () => {
  const before = Object.fromEntries(
    Object.keys(TOWER_RIGS).map((k) => [k, JSON.stringify(TOWER_RIGS[k])]),
  );
  for (const type of TOWER_TYPES) {
    const kind = TOWERS[type].kind;
    const skin = skinForUnit('cielo', 'auto', type);
    const rig = resolveRig(kind, skin);
    assert.ok(rig, `${type}/${kind}: sin rig`);
    assert.ok(rig.parts.some((p) => p.lowQSkip === true), `${type}: sin motivos`);
  }
  for (const [k, json] of Object.entries(before)) {
    assert.equal(JSON.stringify(TOWER_RIGS[k]), json, `${k} mutó al compilar skins`);
  }
});

test('skins: remove/patch/add y fallback de piezas inválidas', () => {
  const custom = {
    id: 'test-skin', base: false,
    palette: { body: '#111111', bodyTop: '#222222', dark: '#000000', metal: '#999999', accent: '#00FF00', hot: '#FF0000', core: '#FFFFFF' },
    perUnit: {
      fan: {
        remove: ['chest'],
        patch: {
          visor: { role: 'hot', alpha: 0.5 },
          torso: { role: 'NO-ROLE', alpha: 0.2 },
        },
        add: [{ id: 'testBad', role: 'NO-ROLE', circle: [0, 0, 1] }],
      },
    },
  };
  const rig = compileSkin('fan', custom);
  assert.ok(rig);
  assert.equal(rig.parts.some((p) => p.id === 'chest'), false);
  assert.equal(rig.parts.find((p) => p.id === 'visor').role, 'hot');
  assert.equal(rig.parts.find((p) => p.id === 'torso').role,
    TOWER_RIGS.fan.parts.find((p) => p.id === 'torso').role,
    'un patch con rol inválido se ignora');
  assert.equal(rig.parts.some((p) => p.id === 'testBad'), false);
  assert.ok(rigBox('fan', skinForUnit('cyberpunk', 'auto', 'guardian')).x0
    < rigBox('fan').x0, 'iconPad debe ampliar la caja del icono');
});

test('skins: el tema base deja rigColors y projectileColor EXACTOS', () => {
  const data = TOWERS.guardian;
  const base = rigColors(data, '#35C8FF');
  const skin = skinForUnit('volcanico', 'auto', 'guardian');
  assert.equal(skin.palette, null);
  assert.equal(projectileColor('guardian', skin), projectileColor('guardian'));
  const cyber = skinForUnit('cyberpunk', 'auto', 'guardian');
  assert.equal(projectileColor('guardian', cyber), cyber.fx.projectile);
  assert.notEqual(cyber.fx.projectile, projectileColor('guardian'));
  assert.equal(base.accent, data.accent);
});

test('skins: Tower.render/Drone.draw/icono no rompen en Node', () => {
  const ctx = fakeCtx();
  const skin = skinForUnit('cyberpunk', 'auto', 'guardian');
  const t = new Tower('guardian', 0, 1, 0, skin);
  assert.doesNotThrow(() => t.render(ctx, { skin }));
  const d = new Drone('firewheel', { engine: { _t: 0, uiTheme: 'cyberpunk' } }, 0, skin);
  assert.doesNotThrow(() => d.draw(ctx, { skin }));
  const canvas = { tagName: 'CANVAS', width: 0, height: 0, getContext: () => ctx };
  assert.doesNotThrow(() => renderTowerIcon(canvas, 'guardian', { themeId: 'cyberpunk', skinId: 'auto' }));
});

test('skins: renderTowerRig acepta la skin y salta motivos en calidad baja', () => {
  const ctx = fakeCtx();
  const skin = skinForUnit('neon', 'auto', 'guardian');
  const rig = resolveRig('fan', skin);
  const colors = rigColors(TOWERS.guardian, '#FFEE00', skin.palette);
  assert.doesNotThrow(() => renderTowerRig(ctx, {
    kind: 'fan', data: TOWERS.guardian, rig, colors, pad: skin.pad, lowQ: true, lv: 1, t: 0, aim: 0,
  }));
  assert.ok(rig.parts.some((p) => p.lowQSkip));
});
