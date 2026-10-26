// tests/test-progress.mjs — dev-7 fase 14 · fase 67 (modo infinito)
// Cubre progress.js: normalización/persistencia (storage inyectable,
// mismo patrón que meta.js/theme.js), el botón "Borrar progreso" del menú
// y el estado del endgame (`endless.best` + el récord del desafío diario).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultProgress, normalizeProgress, loadProgress, saveProgress,
  recordVictory, recordDaily, isUnlocked, resetProgress,
  recordHeatRun, claimHeatMilestone, recordSurvival,
} from '../js/progress.js';

function fakeStorage() {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
}

// Progreso con la campaña completa (lo que abre el modo ∞).
function campaignDone(extra = {}) {
  return {
    unlocked: 50,
    bestScore: { 50: 12345 },
    endless: { best: 0, daily: { date: '', bestScore: 0 } },
    ...extra,
  };
}

test('defaultProgress: solo Stage 1 desbloqueado, sin récords ni endgame', () => {
  const p = defaultProgress();
  assert.equal(p.unlocked, 1);
  assert.deepEqual(p.bestScore, {});
  assert.deepEqual(p.endless, { best: 0, daily: { date: '', bestScore: 0 } });
});

test('normalizeProgress: tolera datos corruptos/fuera de rango', () => {
  const p = normalizeProgress({ unlocked: 9999, bestScore: { 1: -5, 2: 'x', 3: 500 } });
  assert.equal(p.unlocked, 50); // clamp al techo de la campaña
  assert.deepEqual(p.bestScore, { 3: 500 }); // negativos/no numéricos se descartan
});

test('normalizeProgress: un progreso VIEJO (sin endless) carga sin romper', () => {
  const p = normalizeProgress({ unlocked: 12, bestScore: { 12: 800 } });
  assert.deepEqual(p.endless, { best: 0, daily: { date: '', bestScore: 0 } });
  assert.equal(p.unlocked, 12);
});

test('normalizeProgress: el campo endless corrupto se descarta, el resto sobrevive', () => {
  const p = normalizeProgress({
    unlocked: 50,
    bestScore: { 50: 900 },
    endless: { best: 'x', daily: { date: 'ayer', bestScore: -4 } },
  });
  assert.deepEqual(p.endless, { best: 0, daily: { date: '', bestScore: 0 } });
  assert.equal(p.bestScore[50], 900);
  // Un `best` por debajo del infinito tampoco vale.
  assert.equal(normalizeProgress({ endless: { best: 40 } }).endless.best, 0);
});

test('recordVictory: desbloquea el siguiente stage y guarda el mejor score', () => {
  let p = defaultProgress();
  p = recordVictory(p, 1, 1200);
  assert.equal(isUnlocked(p, 2), true);
  assert.equal(isUnlocked(p, 3), false);
  assert.equal(p.bestScore[1], 1200);
  p = recordVictory(p, 1, 900); // score peor: no debe bajar el récord
  assert.equal(p.bestScore[1], 1200);
});

test('recordVictory: en el S50 el desbloqueo sigue clavado en 50 (no hay S51 "de campaña")', () => {
  let p = defaultProgress();
  for (let id = 1; id <= 50; id++) p = recordVictory(p, id, 1000 + id);
  assert.equal(p.unlocked, 50);
  assert.equal(p.endless.best, 0, 'limpiar la campaña NO regala profundidad');
});

test('recordVictory(57): sube el récord de profundidad y NO mueve `unlocked`', () => {
  let p = campaignDone();
  p = recordVictory(p, 57, 4000);
  assert.equal(p.endless.best, 57);
  assert.equal(p.unlocked, 50);
  assert.equal(p.bestScore[57], 4000);
  // Una etapa más baja no baja el récord (ni el score propio).
  p = recordVictory(p, 55, 5000);
  assert.equal(p.endless.best, 57);
  assert.equal(p.bestScore[55], 5000);
});

test('isUnlocked: el infinito va hasta la mejor limpiada + 1 y exige el modo abierto', () => {
  const closed = { unlocked: 50, bestScore: {} };
  assert.equal(isUnlocked(closed, 51), false, 'sin S50 limpiado no hay S51');
  assert.equal(isUnlocked(closed, 50), true, 'la campaña sigue igual');

  const open = campaignDone(); // best 0 → se puede jugar el 51
  assert.equal(isUnlocked(open, 51), true);
  assert.equal(isUnlocked(open, 52), false);

  const deep = campaignDone({ endless: { best: 62, daily: { date: '', bestScore: 0 } } });
  assert.equal(isUnlocked(deep, 51), true, 'se puede rejugar una etapa vieja');
  assert.equal(isUnlocked(deep, 63), true, 'la siguiente a la mejor limpiada');
  assert.equal(isUnlocked(deep, 64), false, 'no se salta la pared');
});

test('recordDaily: guarda el mejor score del día y resetea al cambiar la fecha', () => {
  let p = campaignDone();
  p = recordDaily(p, '2026-10-26', 3000);
  assert.deepEqual(p.endless.daily, { date: '2026-10-26', bestScore: 3000 });
  p = recordDaily(p, '2026-10-26', 2500); // peor intento: no baja
  assert.equal(p.endless.daily.bestScore, 3000);
  p = recordDaily(p, '2026-10-26', 4200); // mejor intento: sube
  assert.equal(p.endless.daily.bestScore, 4200);
  p = recordDaily(p, '2026-10-27', 100); // otro día: arranca de cero
  assert.deepEqual(p.endless.daily, { date: '2026-10-27', bestScore: 100 });
  // Una fecha inválida no toca nada.
  const before = { ...p.endless.daily };
  p = recordDaily(p, 'ayer', 9999);
  assert.deepEqual(p.endless.daily, before);
});

test('saveProgress/loadProgress: el endgame persiste en el storage inyectado', () => {
  const storage = fakeStorage();
  let p = campaignDone();
  p = recordVictory(p, 63, 7777);
  p = recordDaily(p, '2026-10-26', 5555);
  const saved = saveProgress(p, storage);
  assert.equal(saved.endless.best, 63);
  const loaded = loadProgress(storage);
  assert.equal(loaded.endless.best, 63);
  assert.deepEqual(loaded.endless.daily, { date: '2026-10-26', bestScore: 5555 });
  assert.equal(loaded.bestScore[63], 7777);
});

test('resetProgress: vuelve exactamente al default, a través del storage inyectado', () => {
  const storage = fakeStorage();
  saveProgress(recordVictory(defaultProgress(), 1, 5000), storage);
  assert.notDeepEqual(loadProgress(storage), defaultProgress());
  const result = resetProgress(storage);
  assert.deepEqual(result, defaultProgress());
  assert.deepEqual(loadProgress(storage), defaultProgress());
});

test('heat: el default y un progreso VIEJO arrancan en cero, sin romper', () => {
  assert.deepEqual(defaultProgress().heat, {
    best: 0, byStage: {}, endless: {}, claimed: [], last: {},
  });
  const p = normalizeProgress({ unlocked: 12, bestScore: { 12: 800 } });
  assert.deepEqual(p.heat, { best: 0, byStage: {}, endless: {}, claimed: [], last: {} });
});

test('heat: la normalización descarta rangos/récords basura', () => {
  const p = normalizeProgress({
    heat: {
      best: 999,
      byStage: { 50: 999, x: 3, 0: 4, 60: 7 },
      endless: { 10: 58, 60: 70, '-1': 2, 5: 0 },
      claimed: [5, 5, 7, 10],
      last: { asedio: 99, leva: '2', inventada: 4 },
    },
  });
  assert.equal(p.heat.best, 49);
  assert.deepEqual(p.heat.byStage, { 50: 49, 60: 7 });
  assert.deepEqual(p.heat.endless, { 10: 58 });
  assert.deepEqual(p.heat.claimed, [5, 10]);
  assert.deepEqual(p.heat.last, { asedio: 4, leva: 2 });
});

test('heat: recordHeatRun guarda el heat de campaña y la profundidad del ∞', () => {
  let p = campaignDone();
  p = recordHeatRun(p, { heat: 8, stageId: 40 });
  assert.equal(p.heat.best, 8);
  assert.equal(p.heat.byStage[40], 8);
  // Una etapa más baja con menos heat no baja el récord.
  p = recordHeatRun(p, { heat: 5, stageId: 40 });
  assert.equal(p.heat.byStage[40], 8);
  // El ∞ guarda la profundidad POR nivel de heat (no por etapa).
  p = recordHeatRun(p, { heat: 10, endlessDepth: 58 });
  assert.equal(p.heat.best, 10);
  assert.equal(p.heat.endless[10], 58);
  assert.equal(p.heat.byStage[58], undefined);
  // Reintentar con menos profundidad no baja el récord.
  p = recordHeatRun(p, { heat: 10, endlessDepth: 54 });
  assert.equal(p.heat.endless[10], 58);
  // Heat 0 no toca nada.
  const before = JSON.stringify(p.heat);
  p = recordHeatRun(p, { heat: 0, stageId: 50, endlessDepth: 99 });
  assert.equal(JSON.stringify(normalizeProgress(p).heat), before);
});

test('heat: los hitos se cobran UNA sola vez', () => {
  let p = campaignDone();
  const first = claimHeatMilestone(p, 10);
  assert.equal(first.claimed, true);
  p = first.progress;
  assert.deepEqual(p.heat.claimed, [10]);
  const again = claimHeatMilestone(p, 10);
  assert.equal(again.claimed, false);
  assert.deepEqual(again.progress.heat.claimed, [10]);
  // Un umbral que no es hito no se cobra.
  assert.equal(claimHeatMilestone(p, 12).claimed, false);
  // Los hitos quedan ordenados.
  const { progress } = claimHeatMilestone(claimHeatMilestone(p, 5).progress, 35);
  assert.deepEqual(progress.heat.claimed, [5, 10, 35]);
});

test('heat: el estado del Protocolo persiste en el storage', () => {
  const storage = fakeStorage();
  let p = campaignDone();
  p = recordHeatRun(p, { heat: 16, stageId: 50 });
  p = claimHeatMilestone(p, 10).progress;
  p.heat.last = { asedio: 3, prisa: 2 };
  saveProgress(p, storage);
  const loaded = loadProgress(storage);
  assert.equal(loaded.heat.best, 16);
  assert.equal(loaded.heat.byStage[50], 16);
  assert.deepEqual(loaded.heat.claimed, [10]);
  assert.deepEqual(loaded.heat.last, { asedio: 3, prisa: 2 });
});

test('survival: default, progreso viejo y datos corruptos', () => {
  assert.deepEqual(defaultProgress().survival, {
    bestWave: 0, bestScore: 0, runs: 0, byHeat: {},
  });
  assert.deepEqual(normalizeProgress({ unlocked: 3 }).survival, {
    bestWave: 0, bestScore: 0, runs: 0, byHeat: {},
  });
  const p = normalizeProgress({
    survival: {
      bestWave: -4,
      bestScore: 99999999,
      runs: 'x',
      byHeat: { 10: 27, 60: 5, '-1': 9, x: 3, 5: 0 },
    },
  });
  assert.equal(p.survival.bestWave, 0);
  assert.equal(p.survival.bestScore, 9999999, 'clamp del score');
  assert.equal(p.survival.runs, 0);
  assert.deepEqual(p.survival.byHeat, { 10: 27, 5: 0 });
});

test('survival: recordSurvival guarda récord, score, runs y por heat', () => {
  let p = defaultProgress();
  p = recordSurvival(p, { wave: 27, score: 5000, heat: 0 });
  assert.equal(p.survival.bestWave, 27);
  assert.equal(p.survival.bestScore, 5000);
  assert.equal(p.survival.runs, 1);
  assert.equal(p.survival.byHeat[0], 27);
  // Una run peor no baja el récord, pero cuenta como run.
  p = recordSurvival(p, { wave: 20, score: 9000, heat: 5 });
  assert.equal(p.survival.bestWave, 27);
  assert.equal(p.survival.bestScore, 9000);
  assert.equal(p.survival.runs, 2);
  assert.equal(p.survival.byHeat[5], 20);
  // Una run récord con heat guarda su propia entrada.
  p = recordSurvival(p, { wave: 31, score: 12000, heat: 10 });
  assert.equal(p.survival.bestWave, 31);
  assert.equal(p.survival.byHeat[10], 31);
});

test('survival: el estado persiste en el storage', () => {
  const storage = fakeStorage();
  let p = recordSurvival(defaultProgress(), { wave: 33, score: 8000, heat: 8 });
  saveProgress(p, storage);
  const loaded = loadProgress(storage);
  assert.equal(loaded.survival.bestWave, 33);
  assert.equal(loaded.survival.bestScore, 8000);
  assert.equal(loaded.survival.runs, 1);
  assert.equal(loaded.survival.byHeat[8], 33);
});
