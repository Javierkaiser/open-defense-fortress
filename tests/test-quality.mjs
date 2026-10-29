// tests/test-quality.mjs — dev-7 fase 19
// Cubre quality.js: catálogo de niveles, normalización/persistencia
// (mismo patrón que theme.js), y que applyQualityToContext() realmente
// neutraliza shadowBlur en 'baja' y lo restaura en 'alta' — probado con
// un contexto 2D simulado (Node no tiene canvas real).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  QUALITY_LEVELS, normalizeQuality, loadQuality, saveQuality,
  applyQualityToContext, applyQualityToDom, particleCapFor,
} from '../js/quality.js';
import { fakeStorage } from './helpers/storage.mjs';

/** Simula lo mínimo de un CanvasRenderingContext2D: shadowBlur como
 *  propiedad normal de instancia (igual que el navegador real). */
function fakeCtx() {
  return { shadowBlur: 0 };
}

test('QUALITY_LEVELS: incluye alta y baja, cada uno con particleCap', () => {
  const ids = QUALITY_LEVELS.map((q) => q.id);
  assert.deepEqual(new Set(ids), new Set(['alta', 'baja']));
  for (const q of QUALITY_LEVELS) {
    assert.equal(typeof q.name, 'string');
    assert.ok(q.particleCap > 0);
  }
});

test('normalizeQuality: tolera datos corruptos/inexistentes → alta', () => {
  assert.equal(normalizeQuality('no-existe'), 'alta');
  assert.equal(normalizeQuality(null), 'alta');
  assert.equal(normalizeQuality(undefined), 'alta');
});

test('loadQuality/saveQuality: persisten a través del storage inyectado', () => {
  const storage = fakeStorage();
  assert.equal(loadQuality(storage), 'alta'); // nada guardado → default
  saveQuality('baja', storage);
  assert.equal(loadQuality(storage), 'baja');
});

test('particleCapFor: baja < alta (menos partículas simultáneas)', () => {
  assert.ok(particleCapFor('baja') < particleCapFor('alta'));
});

test('applyQualityToContext: en "baja", shadowBlur queda en 0 pase lo que pase', () => {
  const ctx = fakeCtx();
  applyQualityToContext(ctx, 'baja');
  ctx.shadowBlur = 22; // como haría cualquiera de los 69 sitios reales
  assert.equal(ctx.shadowBlur, 0);
  ctx.shadowBlur = 999;
  assert.equal(ctx.shadowBlur, 0);
});

test('applyQualityToContext: en "alta", shadowBlur funciona normal', () => {
  const ctx = fakeCtx();
  applyQualityToContext(ctx, 'alta');
  ctx.shadowBlur = 14;
  assert.equal(ctx.shadowBlur, 14);
});

test('applyQualityToContext: pasar de "baja" a "alta" restaura el comportamiento normal', () => {
  const ctx = fakeCtx();
  applyQualityToContext(ctx, 'baja');
  ctx.shadowBlur = 14;
  assert.equal(ctx.shadowBlur, 0);
  applyQualityToContext(ctx, 'alta');
  ctx.shadowBlur = 14;
  assert.equal(ctx.shadowBlur, 14);
});

test('applyQualityToContext: no tira con ctx null/undefined', () => {
  assert.doesNotThrow(() => applyQualityToContext(null, 'baja'));
  assert.doesNotThrow(() => applyQualityToContext(undefined, 'alta'));
});

// dev-7 fase 29: la calidad también llega a la capa DOM (el desenfoque de
// los overlays se apaga en "baja": sin GPU, el blur del modal de cartas
// costaba 34 FPS → 4,6 FPS).
test('applyQualityToDom: "baja" marca la clase gdf-lowq y "alta" la quita', () => {
  const fakeRoot = {
    classList: {
      _set: new Set(),
      toggle(name, on) { if (on) this._set.add(name); else this._set.delete(name); },
      contains(name) { return this._set.has(name); },
    },
  };
  applyQualityToDom('baja', fakeRoot);
  assert.ok(fakeRoot.classList.contains('gdf-lowq'), '"baja" debe marcar gdf-lowq');
  applyQualityToDom('alta', fakeRoot);
  assert.ok(!fakeRoot.classList.contains('gdf-lowq'), '"alta" debe quitar gdf-lowq');
  // Idempotente y tolera valores raros.
  applyQualityToDom('baja', fakeRoot);
  applyQualityToDom('baja', fakeRoot);
  assert.ok(fakeRoot.classList.contains('gdf-lowq'));
  applyQualityToDom('basura', fakeRoot);
  assert.ok(!fakeRoot.classList.contains('gdf-lowq'), 'un id inválido cae en "alta"');
});

test('applyQualityToDom: no tira sin document (Node)', () => {
  assert.doesNotThrow(() => applyQualityToDom('baja'));
  assert.doesNotThrow(() => applyQualityToDom('alta', null));
});
