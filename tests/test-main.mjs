// tests/test-main.mjs — fase 75
// Game vive ahora en game.js (sin DOM al importarse). Estos tests cubren
// decisiones puras que antes solo se leían como texto en test-engine.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { survivalStage } from '../js/survival.js';

test('fase 75: _xpStageNow usa la oleada en Supervivencia y el stage en campaña', () => {
  const g = Object.create(Game.prototype);
  g.mode = 'survival';
  g.waveManager = { survivalWave: 20 };
  g.stageId = 1;
  assert.equal(g._xpStageNow(), survivalStage(20));
  g.mode = 'campaign';
  g.stageId = 7;
  assert.equal(g._xpStageNow(), 7);
});

test('fase 75: _countProjectiles ignora enemigos y proyectiles muertos', () => {
  const g = Object.create(Game.prototype);
  g.engine = {
    entities: [
      { damage: 10 },
      { damage: 10, dead: true },
      { x: 1, y: 2 }, // enemigo: no expone damage
    ],
  };
  assert.equal(g._countProjectiles(), 1);
});

test('fase 75: handleBack usa toMenu (limpia el campo) al salir de PAUSED', () => {
  const g = Object.create(Game.prototype);
  g.engine = { state: 'PAUSED' };
  let menus = 0;
  g.toMenu = () => { menus += 1; };
  assert.equal(g.handleBack(), true);
  assert.equal(menus, 1);
});

test('fase 75: handleBack no consume el back en MENU', () => {
  const g = Object.create(Game.prototype);
  g.engine = { state: 'MENU' };
  assert.equal(g.handleBack(), false);
});

test('fase 75: _musicIntensity prioriza crítico, jefe, oleada y calma', () => {
  const g = Object.create(Game.prototype);
  g.fortress = { enemies: [], maxHp: 100, hp: 20 };
  assert.equal(g._musicIntensity(false), 4, 'HP bajo = crítico');
  g.fortress.hp = 100;
  assert.equal(g._musicIntensity(true), 3, 'jefe');
  g.fortress.enemies = [{}];
  assert.equal(g._musicIntensity(false), 2, 'oleada');
  g.fortress.enemies = [];
  assert.equal(g._musicIntensity(false), 1, 'calma');
});
