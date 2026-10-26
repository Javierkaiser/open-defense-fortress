// tests/test-survival.mjs — fase 70
// Cubre las reglas PURAS de la Supervivencia (js/survival.js): escala por
// oleada, bloques de 5 con jefe, tema que rota, tipos/nombres de jefe y
// recompensa SOLO por oleadas nuevas (× heat).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SURVIVAL, survivalStage, survivalScale, survivalWaveChunk,
  survivalTheme, survivalBossKind, survivalBossName, survivalReward,
} from '../js/survival.js';
import { heatMods } from '../js/heat.js';
import { waveGroups } from '../js/waves.js';
import { scaleFor } from '../js/stages.js';

test('survival: constantes y stage virtual (1 + oleada × 3)', () => {
  assert.equal(SURVIVAL.baseHp, 25500);
  assert.equal(SURVIVAL.checkEvery, 5);
  assert.equal(SURVIVAL.chunk, 5);
  assert.equal(SURVIVAL.maxLevel, 31, '30 cartas');
  assert.equal(survivalStage(0), 1);
  assert.equal(survivalStage(20), 61);
  assert.equal(survivalStage(40), 121);
  assert.equal(survivalStage(-3), 1);
});

test('survival: la escala crece y aplica Vigor/Prisa del Protocolo', () => {
  const s20 = survivalScale(20);
  const s40 = survivalScale(40);
  assert.equal(s20.hpMul, scaleFor(61).hpMul);
  assert.ok(s40.hpMul > s20.hpMul, 'la oleada 40 es más dura que la 20');
  assert.equal(survivalStage(60), 181);
  const rm = heatMods({ vigor: 1, prisa: 1 });
  const s20h = survivalScale(20, rm);
  assert.equal(s20h.hpMul, s20.hpMul * 1.06);
  assert.equal(s20h.velMul, s20.velMul * 1.05);
});

test('survival: el bloque es determinista, tiene 5 olas y un jefe al final', () => {
  const a = survivalWaveChunk(1, 5, 4242);
  const b = survivalWaveChunk(1, 5, 4242);
  assert.deepEqual(a, b, 'misma semilla → mismo bloque');
  assert.notDeepEqual(a, survivalWaveChunk(1, 5, 4243), 'otra semilla → otro bloque');
  const normales = a.filter((w) => w.pattern !== 'boss');
  const bosses = a.filter((w) => w.pattern === 'boss');
  assert.equal(normales.length, 5, 'cinco olas normales');
  assert.equal(bosses.length, 1, 'un jefe al cerrar el bloque');
  assert.equal(normales[0].t, 0);
  assert.ok(normales[4].t > normales[0].t, 'las olas avanzan en el tiempo');
  assert.ok(bosses[0].t > normales[4].t, 'el jefe entra después de la 5.ª');
  for (const w of normales) {
    assert.ok(w.groups.length > 0, `ola ${w.t}: sin grupos`);
    for (const g of waveGroups(w)) {
      assert.ok(typeof g.type === 'string' && g.type.length > 0);
      assert.ok(g.count >= 1);
    }
  }
});

test('survival: cada bloque con múltiplo de 5 trae su jefe (5, 10, 15…)', () => {
  for (const from of [1, 6, 11, 21]) {
    const waves = survivalWaveChunk(from, 5, 7);
    const boss = waves.filter((w) => w.pattern === 'boss');
    assert.equal(boss.length, 1, `bloque ${from}-${from + 4}: un jefe`);
    const lastNormal = waves.filter((w) => w.pattern !== 'boss').at(-1);
    assert.ok(boss[0].t > lastNormal.t, `bloque ${from}: el jefe va al final`);
  }
});

test('survival: el tema rota cada 5 oleadas', () => {
  assert.equal(survivalTheme(1), 'volcanic');
  assert.equal(survivalTheme(5), 'volcanic');
  assert.equal(survivalTheme(6), 'volcanic2');
  assert.equal(survivalTheme(11), 'graveyard');
  assert.equal(survivalTheme(16), 'nightcity');
  assert.equal(survivalTheme(21), 'core');
  assert.equal(survivalTheme(26), 'volcanic', 'el sexto bloque vuelve al primero');
});

test('survival: los jefes rotan tipo y nombre (5→Blob Rey, 10→Necrótico…)', () => {
  assert.equal(survivalBossKind(5), 'blobBoss');
  assert.equal(survivalBossName(5), 'Blob Rey');
  assert.equal(survivalBossKind(10), 'graveBlob');
  assert.equal(survivalBossName(10), 'Blob Necrótico');
  assert.equal(survivalBossKind(15), 'armoredBlob');
  assert.equal(survivalBossKind(20), 'hybridBoss');
  assert.equal(survivalBossKind(25), 'boss');
  assert.equal(survivalBossName(25), 'Meteorito Colosal');
  assert.equal(survivalBossKind(30), 'blobBoss', 'el ciclo vuelve a empezar');
});

test('survival: la recompensa paga SOLO las oleadas nuevas y multiplica por heat', () => {
  assert.deepEqual(survivalReward(30, 0, 0), { frags: 240, gold: 60 });
  assert.deepEqual(survivalReward(30, 0, 10), { frags: 432, gold: 108 });
  assert.deepEqual(survivalReward(20, 30, 0), { frags: 0, gold: 0 },
    'una oleada por debajo del récord no paga');
  assert.deepEqual(survivalReward(32, 30, 0), { frags: 16, gold: 4 },
    'paga solo las 2 nuevas');
  assert.deepEqual(survivalReward(0, 0, 0), { frags: 0, gold: 0 });
});

test('survival: Leva sube el HP total del bloque; la base es heat 0', () => {
  const suma = (runMods) => {
    let hp = 0;
    for (let seed = 1; seed <= 10; seed++) {
      for (const w of survivalWaveChunk(1, 5, seed, { runMods })) {
        for (const g of waveGroups(w)) {
          if (g.type === 'boss') continue;
          hp += (g.count ?? 1);
        }
      }
    }
    return hp;
  };
  assert.ok(suma(heatMods({ leva: 3 })) > suma(heatMods({})), 'Leva mete más enemigos');
  // Heat 0 es el bloque base (sin diales): los multiplicadores son 1.
  const base = heatMods({});
  assert.equal(base.hpMul, 1);
  assert.equal(base.countMul, 1);
});
