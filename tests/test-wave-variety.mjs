// ============================================================
// tests/test-wave-variety.mjs — FASE 77 (variedad de entrada)
//
// La composición del director ya estaba cubierta por test-stages. Este
// archivo fija la capa NUEVA: formas de entrada, tablas manuales
// vestidas por run, spawn determinista por semilla y entrada de jefe
// sin estado de módulo.
// ============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OPEN_T, STAGE_WAVES, campaignWaves, campaignWavesForRun,
  generateStageWaves, waveGroups, waveCount, waveTypes,
} from '../js/waves.js';
import { WaveManager, nextBossEntry, BOSS_ENTRY_ZONES } from '../js/waves-manager.js';
import {
  LANES, CONE_W, FORMATION_KINDS, makeFormation, formationPosition, laneBounds,
} from '../js/waves-formation.js';
import { mulberry32 } from '../js/waves-rng.js';
import { survivalWaveChunk } from '../js/survival.js';
import { CONFIG, SPAWN_Y } from '../js/engine.js';

const MANUAL_IDS = [1, 2, 3, 4, 5];
const GEN_IDS = [6, 10, 20, 50];
const SEEDS = [1234, 4242, 987654];

/** Stub mínimo de partida para el manager. */
function stubGame() {
  const enemies = [];
  const engine = {
    entities: [],
    events: [],
    addEntity(e) { this.entities.push(e); },
    emit(name, payload) { this.events.push({ name, payload }); },
    on() {},
  };
  return { engine, fortress: { enemies } };
}

/** Corre seconds de un WaveManager y devuelve la secuencia de spawns. */
function spawnSequence(stage, seed, seconds = 70) {
  const game = stubGame();
  const wm = new WaveManager(stage, { seed });
  wm.t = 0;
  const out = [];
  for (let t = 0; t < seconds; t += 0.1) {
    const n = game.fortress.enemies.length;
    wm.update(0.1, game);
    for (let i = n; i < game.fortress.enemies.length; i++) {
      const e = game.fortress.enemies[i];
      out.push(e.type + '@' + e.x.toFixed(1) + ',' + e.y.toFixed(1));
    }
  }
  return out;
}
test('fase 77: campaignWavesForRun es determinista y cada semilla cambia la entrada', () => {
  for (const id of [...MANUAL_IDS, ...GEN_IDS]) {
    const a = campaignWavesForRun(id, 1234);
    const b = campaignWavesForRun(id, 1234);
    const c = campaignWavesForRun(id, 1235);
    assert.deepEqual(a, b, 'S' + id + ': misma semilla, misma tabla');
    assert.notDeepEqual(a, c, 'S' + id + ': otra semilla, otra entrada');
  }
});

test('fase 77: las tablas manuales 1..5 conservan tiempos, tipos y cuentas (no mutan STAGE_WAVES)', () => {
  for (const id of MANUAL_IDS) {
    const before = JSON.stringify(STAGE_WAVES[id]);
    const stable = STAGE_WAVES[id];
    const run = campaignWavesForRun(id, 987654);
    assert.equal(JSON.stringify(STAGE_WAVES[id]), before, 'S' + id + ': la tabla canónica se mutó');
    assert.equal(run.length, stable.length, 'S' + id + ': cambió el nº de olas');
    run.forEach((w, i) => {
      const base = stable[i];
      assert.equal(w.t, base.t, 'S' + id + ': cambió el tiempo de la ola ' + i);
      assert.equal(w.groups.length, base.groups.length, 'S' + id + ': cambió la cantidad de grupos');
      assert.equal(waveCount(w), waveCount(base), 'S' + id + ': cambió la cuenta de enemigos');
      assert.deepEqual(waveTypes(w), waveTypes(base), 'S' + id + ': cambió el cast de la ola');
    });
    assert.ok(stable.every((w) => waveGroups(w).every((g) => g.formation === undefined)));
  }
});

test('fase 77: la apertura manual sigue siendo farmable y el crystal sigue en vee', () => {
  const FARMABLE = ['vee', 'line', 'burst-diag'];
  for (const id of MANUAL_IDS) {
    const run = campaignWavesForRun(id, 4242);
    const first = waveGroups(run[0])[0];
    assert.equal(first.pattern, 'vee', 'S' + id + ': la 1ª ola no es vee');
    assert.equal(first.formation?.kind, 'vee', 'S' + id + ': la 1ª formación no es vee');
    for (const w of run.filter((x) => x.t < OPEN_T)) {
      for (const g of waveGroups(w)) {
        if (g.type === 'crystal') {
          assert.equal(g.pattern, 'vee', 'S' + id + ': crystal no centrado');
          assert.equal(g.formation?.kind, 'vee');
        } else {
          assert.ok(FARMABLE.includes(g.pattern), 'S' + id + ': patrón de apertura no farmable: ' + g.pattern);
        }
        assert.equal(g.formation?.depth, 0, 'S' + id + ': la apertura no puede tener profundidad');
        assert.equal(g.formation?.ySpread, 0, 'S' + id + ': la apertura no puede dispersar Y');
      }
    }
  }
});
test('fase 77: toda ola de run trae una formación válida y posiciones dentro del canvas', () => {
  const vistos = new Set();
  for (const id of [...MANUAL_IDS, ...GEN_IDS]) {
    for (const seed of SEEDS) {
      for (const w of campaignWavesForRun(id, seed)) {
        const gs = waveGroups(w);
        let gi = 0;
        for (const g of gs) {
          if (g.type === 'boss' || g.pattern === 'boss') { gi += 1; continue; }
          assert.ok(g.formation, 'S' + id + ' seed ' + seed + ': grupo sin formación');
          assert.ok(FORMATION_KINDS.includes(g.formation.kind),
            'S' + id + ': formación desconocida ' + g.formation.kind);
          vistos.add(g.formation.kind);
          const opening = w.t < OPEN_T;
          const bounds = laneBounds(g.lane, gi, gs.length, {
            width: CONFIG.CANVAS_W,
            opening,
            coneW: CONE_W,
            baseX: CONFIG.BASE_X,
          });
          const n = Math.max(1, g.count ?? 1);
          const xs = new Set();
          for (let i = 0; i < n; i++) {
            const p = formationPosition(g.formation, i, n, bounds, { width: CONFIG.CANVAS_W });
            assert.ok(p.x >= 4 && p.x <= CONFIG.CANVAS_W - 4,
              'S' + id + ': x fuera del canvas (' + p.x + ')');
            assert.ok(p.dy >= 0 && p.dy <= 180, 'S' + id + ': dy fuera de rango (' + p.dy + ')');
            if (opening) assert.equal(p.dy, 0, 'S' + id + ': la apertura no puede variar la caída');
            xs.add(p.x.toFixed(2));
          }
          if (!opening && n >= 6) {
            assert.ok(xs.size >= 2, 'S' + id + ': una formación de ' + n + ' no varió la X');
          }
          gi += 1;
        }
      }
    }
  }
  // La campaña conserva la FAMILIA de cada patrón (V, línea, muro,
  // diagonal) y randomiza sus parámetros; el catálogo completo queda
  // disponible para `explore: true`.
  assert.ok(vistos.size >= 5, 'sólo ' + vistos.size + ' familias de formación en la campaña');
  assert.ok(FORMATION_KINDS.length >= 12, 'el catálogo de formaciones se redujo');
});

test('fase 77: formationPosition es determinista e independiente del orden', () => {
  const f = makeFormation(mulberry32(99), 'vee');
  const bounds = [100, 400];
  const a = formationPosition(f, 3, 8, bounds);
  const b = formationPosition(f, 3, 8, bounds);
  assert.deepEqual(a, b);
  for (let i = 0; i < 8; i++) formationPosition(f, i, 8, bounds);
  assert.deepEqual(formationPosition(f, 3, 8, bounds), a);
  const f2 = makeFormation(mulberry32(99), 'vee');
  assert.deepEqual(f2, f);
});
test('fase 77: el spawn es determinista por semilla y distinto entre semillas', () => {
  const a = spawnSequence(6, 4242);
  const b = spawnSequence(6, 4242);
  const c = spawnSequence(6, 4243);
  assert.ok(a.length > 50, 'la secuencia de spawn es demasiado corta: ' + a.length);
  assert.deepEqual(a, b, 'misma semilla: el spawn tiene que ser idéntico');
  assert.notDeepEqual(a, c, 'otra semilla: el spawn tiene que cambiar');
  for (const s of a) {
    const y = Number(s.split(',')[1]);
    assert.ok(y <= SPAWN_Y + 1e-9, 'un enemigo nació más abajo del borde: ' + s);
  }
});

test('fase 77: la supervivencia reutiliza la formación del grupo con spawns diferidos', () => {
  const game = stubGame();
  const wm = new WaveManager(2, { seed: 77, survival: true });
  const wave = survivalWaveChunk(1, 1, 77)[0];
  const group = waveGroups(wave)[0];
  assert.ok(group && !group.formation, 'el bloque de supervivencia no trae formación precalculada');
  wm._spawnGroup(group, 0, 1, game, game.fortress.enemies, false, 0);
  const first = group.formation;
  assert.ok(first, 'el primer spawn debe crear y guardar la formación');
  wm._spawnGroup(group, 0, 1, game, game.fortress.enemies, false, 1);
  assert.equal(group.formation, first, 'el segundo spawn tiene que usar la MISMA formación');
});

test('fase 77: la entrada del jefe no usa estado de módulo y no repite zona', () => {
  const rnd = mulberry32(555);
  const state = { zone: -1, sweep: 1 };
  let prev = -1;
  for (let i = 0; i < 30; i++) {
    const entry = nextBossEntry(rnd, state);
    assert.ok(entry.zone >= 0 && entry.zone < BOSS_ENTRY_ZONES.length);
    assert.notEqual(entry.zone, prev, 'la zona del jefe se repitió: ' + entry.zone);
    const [a, b] = BOSS_ENTRY_ZONES[entry.zone];
    assert.ok(entry.x >= CONFIG.CANVAS_W * a - 1e-9
      && entry.x <= CONFIG.CANVAS_W * b + 1e-9, 'x del jefe fuera de su zona');
    assert.ok(entry.sweepDir === -1 || entry.sweepDir === 1);
    prev = entry.zone;
  }
  const run = () => {
    const r = mulberry32(777);
    const s = { zone: -1, sweep: 1 };
    return Array.from({ length: 10 }, () => nextBossEntry(r, s).zone);
  };
  assert.deepEqual(run(), run());
});

test('fase 77: LANES conserva las cinco franjas históricas', () => {
  assert.deepEqual(Object.keys(LANES).sort(), ['angosta', 'centro', 'der', 'full', 'izq']);
  assert.deepEqual(LANES.izq, [0, 0.42]);
  assert.deepEqual(LANES.centro, [0.29, 0.71]);
  assert.deepEqual(LANES.der, [0.58, 1]);
});

test('fase 77: campaignWaves sigue siendo la tabla canónica (sin vestido)', () => {
  for (const id of MANUAL_IDS) {
    assert.equal(campaignWaves(id, 1234), STAGE_WAVES[id]);
    for (const w of STAGE_WAVES[id]) {
      for (const g of waveGroups(w)) assert.equal(g.formation, undefined);
    }
  }
  for (const id of GEN_IDS) {
    const canonical = campaignWaves(id, 1234);
    assert.deepEqual(canonical, generateStageWaves(id, 1234));
    for (const w of canonical) {
      for (const g of waveGroups(w)) assert.equal(g.formation, undefined);
    }
  }
});

test('fase 77: el vestido conserva las franjas de los grupos generados', () => {
  for (const id of GEN_IDS) {
    for (const seed of SEEDS) {
      const canonical = campaignWaves(id, seed);
      const run = campaignWavesForRun(id, seed);
      assert.equal(run.length, canonical.length);
      run.forEach((w, wi) => {
        const baseGroups = waveGroups(canonical[wi]);
        const runGroups = waveGroups(w);
        assert.equal(runGroups.length, baseGroups.length,
          `S${id} seed ${seed}: cambió la cantidad de grupos`);
        for (let gi = 0; gi < runGroups.length; gi++) {
          assert.equal(runGroups[gi].lane, baseGroups[gi].lane,
            `S${id} seed ${seed} ola ${wi} grupo ${gi}: cambió la franja`);
        }
      });
    }
  }
});

test('fase 77: los managers de una misma run comparten el estado del jefe', () => {
  const state = { zone: -1, sweep: 1 };
  const a = new WaveManager(10, { seed: 1, bossState: state });
  const b = new WaveManager(20, { seed: 1, bossState: state });
  assert.equal(a._bossState, state);
  assert.equal(b._bossState, state);
  const za = nextBossEntry(a.rng, a._bossState).zone;
  const zb = nextBossEntry(b.rng, b._bossState).zone;
  assert.notEqual(za, zb, 'dos jefes seguidos no pueden repetir zona');
});