// tests/test-theme.mjs — dev-7 fase 13
// Cubre theme.js: catálogo de temas, normalización/persistencia (mismo
// patrón que progress.js/meta.js — storage inyectable, testeable desde
// Node) y que applyTheme() no rompa fuera de un navegador.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  THEMES, normalizeTheme, loadTheme, saveTheme, applyTheme,
  readSceneTint, applyThemeToGame,
} from '../js/theme.js';
import { fakeStorage } from './helpers/storage.mjs';

test('THEMES: ids únicos, cada uno con name y 2 colores de swatch', () => {
  const ids = THEMES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const t of THEMES) {
    assert.equal(typeof t.name, 'string');
    assert.equal(t.swatch.length, 2);
    for (const c of t.swatch) assert.match(c, /^#[0-9A-Fa-f]{6}$/);
  }
});

test('THEMES: incluye el tema original + los pedidos por el usuario', () => {
  const ids = new Set(THEMES.map((t) => t.id));
  for (const id of ['volcanico', 'cyberpunk', 'neon', 'aqua', 'cielo']) {
    assert.ok(ids.has(id), `falta el tema '${id}'`);
  }
});

test('normalizeTheme: tolera datos corruptos/inexistentes → default', () => {
  assert.equal(normalizeTheme('no-existe'), 'volcanico');
  assert.equal(normalizeTheme(null), 'volcanico');
  assert.equal(normalizeTheme(undefined), 'volcanico');
  assert.equal(normalizeTheme(42), 'volcanico');
});

test('normalizeTheme: acepta cualquier id real del catálogo', () => {
  for (const t of THEMES) assert.equal(normalizeTheme(t.id), t.id);
});

test('loadTheme/saveTheme: persisten y normalizan a través del storage inyectado', () => {
  const storage = fakeStorage();
  assert.equal(loadTheme(storage), 'volcanico'); // nada guardado → default
  saveTheme('cyberpunk', storage);
  assert.equal(loadTheme(storage), 'cyberpunk');
  saveTheme('no-existe', storage); // dato inválido: se guarda normalizado
  assert.equal(loadTheme(storage), 'volcanico');
});

test('applyTheme: no tira en Node (sin document)', () => {
  assert.doesNotThrow(() => applyTheme('cyberpunk'));
  assert.doesNotThrow(() => applyTheme('volcanico'));
});

// ============================================================
// dev-7 fase 54 — EL TINTE DE ESCENA
// ============================================================

test('fase 54: el tinte de escena se LEE del CSS (una sola fuente de verdad)', () => {
  // Sin DOM no hay tinte (Node): el tema solo aplica el atributo.
  assert.equal(readSceneTint(), null, 'sin document no hay tinte');
  assert.equal(typeof applyThemeToGame, 'function');
});

test('fase 54: applyThemeToGame empuja el tinte al engine', () => {
  const llamadas = [];
  const engine = { setSceneTint: (color, alpha) => llamadas.push({ color, alpha }) };
  applyThemeToGame('cyberpunk', engine);
  assert.equal(llamadas.length, 1, 'el engine recibe el tinte una vez');
  assert.ok(llamadas[0].color === null || typeof llamadas[0].color === 'string');
  assert.equal(typeof llamadas[0].alpha, 'number');
});

test('fase 76.5: applyThemeToGame avisa el tema de UI y la skin al engine', () => {
  const calls = [];
  const engine = {
    setSceneTint() {},
    setUiTheme: (theme, skin) => calls.push({ theme, skin }),
  };
  applyThemeToGame('neon', engine, 'cyberpunk');
  assert.deepEqual(calls, [{ theme: 'neon', skin: 'cyberpunk' }]);
});

test('fase 76.5: setUiTheme cambia sólo el tema de UI y emite theme:changed', async () => {
  const { Engine } = await import('../js/engine.js');
  const eng = Object.create(Engine.prototype);
  eng.uiTheme = 'volcanico';
  eng.skinId = 'auto';
  const events = [];
  eng.emit = (name, payload) => events.push({ name, payload });
  eng.setUiTheme('cyberpunk', 'neon');
  assert.equal(eng.uiTheme, 'cyberpunk');
  assert.equal(eng.skinId, 'neon');
  assert.deepEqual(events, [{ name: 'theme:changed', payload: { ui: 'cyberpunk', skin: 'neon' } }]);
});

test('fase 76.5: el tema del stage no pisa el tema de UI ni la skin', async () => {
  const { Engine } = await import('../js/engine.js');
  const eng = Object.create(Engine.prototype);
  eng.uiTheme = 'aqua';
  eng.skinId = 'neon';
  eng.theme = {};
  eng.setTheme('night');
  assert.equal(eng.uiTheme, 'aqua');
  assert.equal(eng.skinId, 'neon');
  assert.ok(eng.theme.skyTop, 'el tema del stage sí cambia');
});

test('fase 54: el engine guarda el tinte solo si el alpha es > 0', async () => {
  const { Engine } = await import('../js/engine.js');
  const eng = Object.create(Engine.prototype);
  eng.setSceneTint('#FF2E97', 0.8);
  assert.deepEqual(eng._sceneTint, { color: '#FF2E97', alpha: 0.8 });
  eng.setSceneTint('#FF2E97', 0);
  assert.equal(eng._sceneTint, null, 'con alpha 0 no hay tinte');
  eng.setSceneTint(null, 0.8);
  assert.equal(eng._sceneTint, null, 'sin color no hay tinte');
});
