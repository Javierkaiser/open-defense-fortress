// tests/test-effects.mjs — fase 75
// effects.js tenía 0 % de cobertura ejecutable: MultiKillWatcher, el orbe de
// energía y los spawns se probaban solo a través de main.js (que tampoco se
// ejecuta en la suite). Estos tests usan un engine mínimo.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MultiKillWatcher, EnergyOrb, dropEnergyOrb, spawnGoldenFireworks,
} from '../js/effects.js';
import { CONFIG } from '../js/engine.js';

function mkEngine() {
  return {
    particles: 0,
    entities: [],
    effects: [],
    floats: [],
    emits: [],
    spawnParticles() { this.particles += 1; },
    addEffect(fx) { this.effects.push(fx); },
    addEntity(e) { this.entities.push(e); },
    floatText(x, y, text) { this.floats.push(text); },
    emit(name, payload) { this.emits.push([name, payload]); },
  };
}

test('fase 75: MultiKillWatcher dispara una salva por cada 3 kills en 0.5 s', () => {
  const w = new MultiKillWatcher(mkEngine());
  assert.equal(w.feed(1.0), false);
  assert.equal(w.feed(1.1), false);
  assert.equal(w.feed(1.2), true, 'el tercer kill de la ventana dispara');
  assert.equal(w.feed(1.3), false, 'la racha se reinicia');
  w.reset();
  assert.equal(w.feed(2.0), false);
});

test('fase 75: EnergyOrb se recoge al llegar a la base y suma score', () => {
  const engine = mkEngine();
  const game = { engine, fortress: {}, score: 0 };
  const orb = new EnergyOrb(game, 100, CONFIG.TOWER_Y - 61, 10);
  orb.update(1);
  assert.equal(orb.dead, true);
  assert.equal(orb.collected, true);
  assert.equal(game.score, 10);
  assert.deepEqual(engine.emits[0][0], 'orb:collected');
});

test('fase 75: dropEnergyOrb solo nace para tipos con drop', () => {
  const engine = mkEngine();
  const game = { engine, fortress: {}, score: 0 };
  assert.equal(dropEnergyOrb(game, { x: 1, y: 2, data: {} }, 100), null);
  const orb = dropEnergyOrb(game, {
    x: 1, y: 2, data: { dropXpBonusFrac: 0.15 },
  }, 100);
  assert.ok(orb);
  assert.equal(orb.value, 15);
  assert.equal(engine.entities.length, 1);
});

test('fase 75: spawnGoldenFireworks no rompe con un engine mínimo', () => {
  const engine = mkEngine();
  assert.doesNotThrow(() => spawnGoldenFireworks(engine, 100, 200));
  assert.ok(engine.particles > 0);
});
