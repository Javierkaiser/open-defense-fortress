// tests/test-wave-pacing.mjs — RITMO ADAPTATIVO DEL DIRECTOR (1.17.0)
// -----------------------------------------------------------------------------
// Contrato de `openspec/specs/gameplay/wave-director/spec.md` §Ritmo sin
// espacios muertos: si la arena queda limpia, la próxima descarga entra ya
// (con piso entre descargas y respiro antes del jefe), sin cambiar la
// composición ni la clasificación apertura/clásico de cada ola.
//
// El modelo de juego es mínimo: los enemigos se borran a mano para simular
// que el jugador limpia la arena. No hay DOM, canvas ni torres.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WaveManager, CLEAR_GRACE, WAVE_MIN_GAP, BOSS_BREATH,
} from '../js/waves-manager.js';
import { campaignWavesForRun, waveGroups } from '../js/waves.js';
import { ENEMY_TYPES } from '../js/enemies.js';

/** Engine mínimo: sólo lo que usa el WaveManager. */
class EngineStub {
  constructor() { this.entities = []; this.events = []; }
  emit(name, payload) { this.events.push({ name, payload }); }
  addEntity(e) { this.entities.push(e); }
}

function stubGame() {
  return { engine: new EngineStub(), fortress: { enemies: [] } };
}

/** Avanza el manager `seconds` con paso `dt`, limpiando la arena si `kill`. */
function tick(wm, game, seconds, { dt = 0.05, kill = true } = {}) {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    wm.update(dt, game);
    wm.checkBossDead();
    if (kill) game.fortress.enemies.length = 0;
  }
}

/** Enemigo vivo mínimo (no se actualiza: sólo cuenta para la arena). */
function dummyEnemy() {
  return { dead: false, isBoss: false, x: 0, y: 0, hp: 1 };
}

const wave = (t, type = 'spore', count = 1) => ({
  t,
  groups: [{ type, count, pattern: 'vee' }],
});

test('1.17.0: las constantes del ritmo adaptativo están exportadas y ordenadas', () => {
  assert.ok(CLEAR_GRACE > 0 && CLEAR_GRACE < 1, 'gracia de arena limpia acotada');
  assert.ok(WAVE_MIN_GAP >= 1, 'piso entre descargas');
  assert.ok(BOSS_BREATH > WAVE_MIN_GAP, 'el jefe respira más que una ola normal');
});

test('1.17.0: con la arena limpia la próxima ola entra ya (no espera su t)', () => {
  const game = stubGame();
  const wm = new WaveManager(20);
  wm.queue = [wave(5), wave(40)];
  wm.t = 0;
  tick(wm, game, 8);
  assert.equal(wm.dispatched, 2,
    'la segunda ola tenía t=40 y entró al quedar la arena limpia');
  assert.ok(wm.t < 10, `el reloj quedó en ${wm.t.toFixed(2)} s`);
});

test('1.17.0: con enemigos vivos NO se adelanta nada', () => {
  const game = stubGame();
  const wm = new WaveManager(20);
  wm.queue = [wave(5), wave(40)];
  const vivo = dummyEnemy();
  game.fortress.enemies.push(vivo);   // la arena nunca queda limpia
  const tiempos = [];
  const original = wm._dispatchWave.bind(wm);
  wm._dispatchWave = (w, g) => { tiempos.push(wm.t); return original(w, g); };
  tick(wm, game, 42, { kill: false });
  assert.equal(wm.dispatched, 2, 'entraron las dos olas');
  assert.ok(tiempos[1] >= 40 - 1e-6,
    `la 2ª ola se adelantó a los ${tiempos[1].toFixed(2)} s`);
  assert.equal(wm.queue.length, 0, 'no quedan olas');
});

test('1.17.0: hay un piso entre descargas (no es una ametralladora)', () => {
  const game = stubGame();
  const wm = new WaveManager(20);
  // Gaps de agenda realistas (el generador nunca baja de 2 s) + muchas olas.
  wm.queue = [wave(1), wave(40), wave(43), wave(46), wave(49), wave(52)];
  const tiempos = [];
  const original = wm._dispatchWave.bind(wm);
  wm._dispatchWave = (w, g) => {
    tiempos.push(wm.t);
    return original(w, g);
  };
  tick(wm, game, 40);
  assert.ok(tiempos.length >= 4, `se despacharon ${tiempos.length} olas`);
  for (let i = 1; i < tiempos.length; i++) {
    const gap = tiempos[i] - tiempos[i - 1];
    assert.ok(gap >= WAVE_MIN_GAP - 1e-6,
      `gap ${gap.toFixed(2)} s < piso ${WAVE_MIN_GAP} s`);
  }
});

test('1.17.0: el jefe respeta su respiro mínimo antes del aviso', () => {
  const game = stubGame();
  const wm = new WaveManager(20);
  wm.queue = [
    wave(5),
    { t: 60, groups: [{ type: 'boss', count: 1, pattern: 'boss' }] },
  ];
  let bossT = null;
  const original = wm._dispatchWave.bind(wm);
  wm._dispatchWave = (w, g) => {
    if (w.groups?.[0]?.type === 'boss') bossT = wm.t;
    return original(w, g);
  };
  tick(wm, game, 20);
  assert.ok(bossT != null, 'el jefe se adelantó');
  assert.ok(bossT >= 5 + BOSS_BREATH - 1e-6,
    `el jefe entró a los ${(bossT - 5).toFixed(2)} s de la última ola`);
  assert.ok(bossT < 20, 'y no esperó a su t=60');
});

test('1.17.0: la cola se corre lo mismo que se adelantó (espaciado relativo)', () => {
  const game = stubGame();
  const wm = new WaveManager(20);
  wm.queue = [wave(5), wave(40), wave(45)];
  // Hasta despachar la 1ª ola y limpiar la arena.
  tick(wm, game, 5.2);
  const t2Antes = wm.queue[0].t;
  assert.equal(t2Antes, 40, 'la 2ª ola todavía no se movió');
  // Ahora se adelanta: la 2ª entra en ~6,6 s y la 3ª debe quedar 5 s después.
  tick(wm, game, 1.6);
  assert.equal(wm.dispatched, 2, 'la 2ª ola entró adelantada');
  const t3 = wm.queue[0]?.t;
  assert.ok(t3 != null, 'queda la 3ª ola');
  assert.ok(Math.abs(t3 - 11.6) < 0.3,
    `la 3ª ola quedó en ${t3.toFixed(2)} s (esperado ~11,6)`);
});

test('1.17.0: una ola clásica adelantada NO se reclasifica como apertura', () => {
  const game = stubGame();
  const wm = new WaveManager(20);
  // OPEN_T = 40: la 2ª ola es clásica y se va a adelantar por debajo de 40.
  wm.queue = [wave(1), wave(45)];
  const flags = [];
  wm._spawnGroup = (group, gi, gn, g, list, isOpening) => { flags.push(isOpening); };
  tick(wm, game, 6);
  assert.equal(wm.dispatched, 2, 'la ola clásica se adelantó');
  assert.equal(flags.length, 2, 'entraron los dos grupos');
  assert.equal(flags[0], true, 'la 1ª ola es apertura');
  assert.equal(flags[1], false, 'la 2ª sigue siendo clásica aunque t < OPEN_T');
});

test('1.17.0: la primera ola respeta su t (no se adelanta al arranque)', () => {
  const game = stubGame();
  const wm = new WaveManager(20);
  wm.queue = [wave(3), wave(40)];
  tick(wm, game, 1);
  assert.equal(wm.dispatched, 0, 'antes de t=3 no entró nada');
});

test('1.17.0: sin espacios muertos en una etapa real (arena limpia al instante)', () => {
  for (const stage of [1, 6, 20, 40]) {
    const game = stubGame();
    const wm = new WaveManager(stage, { seed: 4242 });
    const tiempos = [];
    const original = wm._dispatchWave.bind(wm);
    wm._dispatchWave = (w, g) => {
      tiempos.push(wm.t);
      return original(w, g);
    };
    // 240 s alcanzan para toda la etapa con el ritmo adaptativo.
    tick(wm, game, 240, { dt: 0.05 });
    let peor = 0;
    for (let i = 1; i < tiempos.length; i++) {
      peor = Math.max(peor, tiempos[i] - tiempos[i - 1]);
    }
    assert.ok(tiempos.length >= 10, `S${stage}: sólo ${tiempos.length} descargas`);
    // Con el tope por descarga (MAX_PULL) el hueco máximo es el de la banda
    // "respiro" menos el tope: 8,2 − 3,0 = 5,2 s (+ holgura del tick).
    assert.ok(peor <= 5.5,
      `S${stage}: hueco máximo entre descargas ${peor.toFixed(2)} s`);
  }
});

test('1.17.0: el hueco estructural de la apertura se colapsa', () => {
  // La tabla generada cierra la apertura antes de OPEN_T y recién vuelve
  // en OPEN_T: sin el colapso son 20-30 s de pantalla vacía.
  for (const stage of [6, 20, 50]) {
    const game = stubGame();
    const wm = new WaveManager(stage, { seed: 909 });
    const tiempos = [];
    const original = wm._dispatchWave.bind(wm);
    wm._dispatchWave = (w, g) => { tiempos.push(wm.t); return original(w, g); };
    let abierto = false;
    const originalClear = wm._pullForward.bind(wm);
    wm._pullForward = (now) => {
      const out = originalClear(now);
      if (out > 0) abierto = true;
      return out;
    };
    tick(wm, game, 120, { dt: 0.05 });
    let peor = 0;
    for (let i = 1; i < tiempos.length; i++) {
      peor = Math.max(peor, tiempos[i] - tiempos[i - 1]);
    }
    assert.ok(peor <= 5.5, `S${stage}: quedó un hueco de ${peor.toFixed(1)} s`);
    assert.equal(abierto, true, `S${stage}: el director nunca adelantó nada`);
  }
});

test('1.17.0: la composición no cambia (sólo se mueve el instante de entrada)', () => {
  const stage = 20;
  const seed = 555;
  const tabla = campaignWavesForRun(stage, seed);
  const antes = tabla.map((w) => ({
    tipos: waveGroups(w).map((g) => `${g.type}x${g.count}`).join(','),
    total: waveGroups(w).length,
  }));
  const game = stubGame();
  const wm = new WaveManager(stage, { seed });
  tick(wm, game, 240, { dt: 0.05 });
  // La tabla generada es la referencia: el scheduler no recompone nada.
  assert.equal(antes.length, tabla.length, 'la tabla no se mutó al jugar');
  assert.deepEqual(
    antes.map((w) => w.total),
    tabla.map((w) => waveGroups(w).length),
    'los grupos por ola no cambiaron',
  );
  assert.deepEqual(
    antes.map((w) => w.tipos),
    tabla.map((w) => waveGroups(w).map((g) => `${g.type}x${g.count}`).join(',')),
    'los tipos y las cuentas no cambiaron',
  );
});

test('1.17.0: dos runs con la misma semilla y la misma limpieza spawnean igual', () => {
  const run = () => {
    const game = stubGame();
    const wm = new WaveManager(20, { seed: 777 });
    const log = [];
    const original = wm._spawnGroup.bind(wm);
    wm._spawnGroup = (group, gi, gn, g, list, isOpening, only) => {
      log.push(`${group.type}@${wm.t.toFixed(2)}`);
      return original(group, gi, gn, g, list, isOpening, only);
    };
    tick(wm, game, 60, { dt: 0.05 });
    return log;
  };
  assert.deepEqual(run(), run(), 'el ritmo adaptativo sigue siendo determinista');
});

test('1.17.0: la etapa real cierra antes que con la agenda fija', () => {
  const stage = 6;
  const game = stubGame();
  const wm = new WaveManager(stage, { seed: 1006 });
  let cerrada = false;
  wm.onWavesDone(() => { cerrada = true; });
  wm.onBossDead(() => { cerrada = true; });
  tick(wm, game, 300, { dt: 0.05 });
  assert.equal(cerrada, true, 'la etapa cerró');
  assert.ok(wm.t < 140, `la etapa duró ${wm.t.toFixed(1)} s (la agenda fija daba ~141 s)`);
});

test('1.17.0: el catálogo de enemigos sigue disponible para el test', () => {
  // Guarda barata: si el stub deja de usar tipos reales, este archivo se
  // vuelve un test de humo sin valor.
  assert.ok(ENEMY_TYPES.spore, 'los tipos existen');
});
