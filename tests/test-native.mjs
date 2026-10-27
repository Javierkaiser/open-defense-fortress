// tests/test-native.mjs - contrato del contenedor Android (sin DOM ni Capacitor).
import test from 'node:test';
import assert from 'node:assert/strict';

import { NATIVE_EVENTS, backAction, isNativePlatform } from '../js/native.js';

test('NATIVE_EVENTS: nombres estables que usa MainActivity.java', () => {
  assert.equal(NATIVE_EVENTS.pause, 'gdf:native-pause');
  assert.equal(NATIVE_EVENTS.resume, 'gdf:native-resume');
  assert.ok(Object.isFrozen(NATIVE_EVENTS));
});

test('backAction: PLAYING pausa', () => {
  assert.deepEqual(backAction('PLAYING'), { handled: true, next: 'PAUSED' });
});

test('backAction: PAUSED va al menú', () => {
  assert.deepEqual(backAction('PAUSED'), { handled: true, next: 'MENU' });
});

test('backAction: pantallas de navegación vuelven al menú', () => {
  for (const state of [
    'SELECT_STAGE', 'TORRETAS', 'PROTOCOLO', 'RECORDS', 'STAGE_CLEAR', 'GAME_OVER',
  ]) {
    assert.deepEqual(backAction(state), { handled: true, next: 'MENU' }, state);
  }
});

test('backAction: CARD_CHOICE se consume sin saltear la elección', () => {
  assert.deepEqual(backAction('CARD_CHOICE'), { handled: true, next: null });
});

test('backAction: MENU/BOOT dejan que Android mande a background', () => {
  for (const state of ['MENU', 'BOOT', 'DESCONOCIDO']) {
    assert.deepEqual(backAction(state), { handled: false, next: null }, state);
  }
});

test('isNativePlatform: detecta el bridge de Capacitor sin explotar', () => {
  assert.equal(isNativePlatform({}), false);
  assert.equal(isNativePlatform({ Capacitor: { isNativePlatform: () => true } }), true);
  assert.equal(isNativePlatform({ Capacitor: { isNativePlatform: () => false } }), false);
  assert.equal(isNativePlatform({ Capacitor: { isNativePlatform: () => { throw new Error('x'); } } }), false);
});
