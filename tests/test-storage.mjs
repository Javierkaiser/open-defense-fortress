// tests/test-storage.mjs — fase 75
// Cubre las ramas de error de los cuatro módulos que persisten en
// localStorage. Antes los `catch` de JSON corrupto / storage lleno no se
// ejecutaban en ningún test.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMeta, saveMeta, defaultMeta } from '../js/meta.js';
import { loadProgress, saveProgress, defaultProgress } from '../js/progress.js';
import { loadTheme, saveTheme } from '../js/theme.js';
import { loadQuality, saveQuality } from '../js/quality.js';
import { throwingStorage } from './helpers/storage.mjs';

test('fase 75: storage que lanza no rompe meta/progress/theme/quality', () => {
  const bad = throwingStorage({ get: true, set: true });
  assert.deepEqual(loadMeta(bad), defaultMeta());
  assert.doesNotThrow(() => saveMeta(defaultMeta(), bad));
  assert.deepEqual(loadProgress(bad), defaultProgress());
  assert.doesNotThrow(() => saveProgress(defaultProgress(), bad));
  assert.equal(loadTheme(bad), 'volcanico');
  assert.doesNotThrow(() => saveTheme('neon', bad));
  assert.equal(loadQuality(bad), 'alta');
  assert.doesNotThrow(() => saveQuality('baja', bad));
});

test('fase 75: un JSON corrupto cae al default sin excepción', () => {
  const corrupt = {
    getItem: () => '{no-es-json',
    setItem: () => {},
  };
  assert.deepEqual(loadMeta(corrupt), defaultMeta());
  assert.deepEqual(loadProgress(corrupt), defaultProgress());
});
