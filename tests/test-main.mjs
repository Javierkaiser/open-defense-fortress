// tests/test-main.mjs — fase 75
// Game vive ahora en game.js (sin DOM al importarse). Estos tests cubren
// decisiones puras que antes solo se leían como texto en test-engine.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { survivalStage } from '../js/survival.js';
import { normalizeProgress } from '../js/progress.js';

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

test('v1.7.2: _selectData expone el Heat activo y su récord en el ∞', () => {
  const g = Object.create(Game.prototype);
  g.progressData = normalizeProgress({
    unlocked: 50,
    bestScore: { 50: 1 },
    heat: { last: { apagon: 1 }, endless: { 3: 60 } },
  });
  const data = g._selectData();
  assert.equal(data.endless.heat, 3, 'la tarjeta ∞ conoce el Heat activo');
  assert.equal(data.endless.bestAtHeat, 60, 'y su récord de profundidad');
  assert.equal(data.endless.daily.heat, 0, 'sin récord diario hoy no inventa Heat');
});

test('v1.7.2: _recordDaily guarda el Heat del récord y no lo pisa con un score peor', () => {
  const g = Object.create(Game.prototype);
  g._runOpts = { daily: '2026-10-26' };
  g.stageId = 57;
  g.score = 500;
  g.runMods = { heat: 8 };
  g.progressData = normalizeProgress({ unlocked: 50, bestScore: { 50: 1 } });
  const first = g._recordDaily(false);
  assert.equal(first.heat, 8, 'el resumen conoce el Heat jugado');
  assert.equal(first.bestHeat, 8, 'y el Heat del récord');
  assert.equal(g.progressData.endless.daily.heat, 8);
  // Peor score a otro Heat: el récord (score y Heat) no cambia.
  g.score = 100;
  g.runMods = { heat: 3 };
  const second = g._recordDaily(false);
  assert.equal(second.isRecord, false);
  assert.equal(second.bestHeat, 8);
  assert.equal(g.progressData.endless.daily.heat, 8);
});

test('v1.7.2: Apagón bloquea Ultimate y Black Hole antes de tocar audio', () => {
  const g = Object.create(Game.prototype);
  g._playing = true;
  g.engine = { state: 'PLAYING' };
  g.runMods = { noUlt: true };
  let ult = 0;
  let bh = 0;
  g.fortress = {
    fireUltimate() { ult += 1; return true; },
    fireBlackHole() { bh += 1; return true; },
  };
  g._tryFireUltimate();
  g._tryFireBlackHole();
  assert.equal(ult, 0, 'Apagón apaga el ORBITAL STRIKE');
  assert.equal(bh, 0, 'Apagón apaga el Black Hole');
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
