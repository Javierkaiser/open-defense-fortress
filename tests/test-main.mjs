// tests/test-main.mjs — fase 75
// Game vive ahora en game.js (sin DOM al importarse). Estos tests cubren
// decisiones puras que antes solo se leían como texto en test-engine.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { survivalStage } from '../js/survival.js';
import { normalizeProgress } from '../js/progress.js';
import { defaultMeta, normalizeMeta } from '../js/meta.js';
import { dailyRun } from '../js/endless.js';
import { heatTotal } from '../js/heat.js';

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

// ============================================================
// 1.10.0 — Nueva Partida+, Reset Global y el desafío diario
// ============================================================

test('1.10.0: newGamePlus conserva torres, sube el ciclo y arranca S1', () => {
  const g = Object.create(Game.prototype);
  g.progressData = normalizeProgress({ unlocked: 50, bestScore: { 50: 1234 } });
  const base = defaultMeta();
  g.meta = normalizeMeta({
    ...base,
    levels: { ...base.levels, guardian: 40 },
    unlocked: { ...base.unlocked, missile: true },
    ngPlus: 1,
    gold: 500,
    victories: 7,
    firstClear: [1, 2],
  });
  const stages = [];
  g.startStage = (id) => stages.push(id);
  let aviso = null;
  g.hud = { showAviso: (payload) => { aviso = payload; } };

  assert.equal(g.newGamePlus(), true);
  assert.deepEqual(stages, [1], 'la NG+ arranca directo en el S1');
  assert.equal(g.meta.ngPlus, 2, 'sube un ciclo');
  assert.equal(g.meta.unlocked.missile, true, 'la unidad comprada se conserva');
  assert.equal(g.meta.levels.guardian, 1, 'los niveles se resetean');
  assert.equal(g.meta.gold, 0, 'el oro arranca en 0 (se gana jugando)');
  assert.equal(g.meta.victories, 0);
  assert.deepEqual(g.meta.firstClear, []);
  assert.equal(g.progressData.unlocked, 1, 'la campaña vuelve al S1');
  assert.deepEqual(g.progressData.bestScore, {}, 'los récords se borran');
  assert.equal(aviso.title, 'NUEVA PARTIDA+ 2');
  assert.equal(aviso.name, '+10% DAÑO GLOBAL');
});

test('1.10.0: newGamePlus exige la campaña completa y no toca nada si falta', () => {
  const g = Object.create(Game.prototype);
  g.progressData = normalizeProgress({ unlocked: 30, bestScore: { 10: 500 } });
  g.meta = normalizeMeta(defaultMeta());
  g.startStage = () => { throw new Error('no debería arrancar'); };
  assert.equal(g.newGamePlus(), false);
  assert.equal(g.meta.ngPlus, 0);
  assert.equal(g.progressData.unlocked, 30);
});

test('1.10.0: resetGlobal borra campaña, meta, NG+ y vuelve al menú', () => {
  const g = Object.create(Game.prototype);
  g.progressData = normalizeProgress({ unlocked: 40, bestScore: { 40: 900 } });
  const base = defaultMeta();
  g.meta = normalizeMeta({
    ...base,
    ngPlus: 5,
    gold: 999,
    fragsPool: 400,
    unlocked: { ...base.unlocked, missile: true },
  });
  let menus = 0;
  g.toMenu = () => { menus += 1; };

  assert.equal(g.resetGlobal(), true);
  assert.equal(menus, 1, 'vuelve al menú con el estado limpio');
  assert.equal(g.progressData.unlocked, 1);
  assert.deepEqual(g.progressData.bestScore, {});
  assert.equal(g.meta.ngPlus, 0, 'el bonus NG+ se pierde');
  assert.equal(g.meta.gold, 100, 'el oro vuelve al inicial');
  assert.equal(g.meta.fragsPool, 0);
  assert.equal(g.meta.unlocked.missile, false, 'las unidades compradas se pierden');
});

test('1.10.0: _selectData expone la etapa congelada y el Heat forzado del daily', () => {
  const g = Object.create(Game.prototype);
  const today = dailyRun().date;
  g.progressData = normalizeProgress({
    unlocked: 7,
    bestScore: { 1: 1000 },
    endless: { best: 0, daily: { date: today, stage: 4, bestScore: 5000, heat: 49 } },
  });
  const data = g._selectData();
  assert.equal(data.endless.daily.date, today);
  assert.equal(data.endless.daily.stage, 4, 'la etapa congelada manda sobre el pool');
  assert.equal(data.endless.daily.bestScore, 5000);
  assert.equal(data.endless.daily.heat, 49);
  assert.equal(data.endless.daily.heatForced, 39, 'el HUD conoce el Heat forzado');
  assert.equal(data.endless.daily.rewardMul, 1.5, 'y el bono diario');
  assert.equal(data.endless.open, false, 'el daily no exige el ∞ abierto');
});

test('1.10.0: startDaily elige etapa del pool, fuerza Heat 49 y la congela', () => {
  const g = Object.create(Game.prototype);
  g.progressData = normalizeProgress({ unlocked: 3 });
  const runs = [];
  g.startStage = (id, opts) => runs.push({ id, opts });

  g.startDaily();
  assert.equal(runs.length, 1);
  const first = runs[0];
  assert.ok(first.id >= 1 && first.id <= 3, `etapa fuera del pool: ${first.id}`);
  assert.equal(first.opts.daily, dailyRun().date);
  assert.equal(heatTotal(first.opts.heatMods), 39, 'todos los heats restantes al máximo');
  assert.equal(g.progressData.endless.daily.stage, first.id, 'la etapa queda congelada');

  // Desbloquear más etapas durante el día NO cambia el reto ya elegido.
  g.progressData = normalizeProgress({ ...g.progressData, unlocked: 10 });
  g.startDaily();
  assert.equal(runs[1].id, first.id);
  assert.equal(g.progressData.endless.daily.stage, first.id);
});
