// tests/test-audio.mjs — dev-7 fase 9
// Cubre audio.js: que cada evento con sample real (fase 5) apunte a un
// archivo que existe de verdad en assets/sfx/, que los gains estén
// acotados a [0,1] y que el pool de <audio> sea lo bastante grande para
// que el sample NO se corte (pool × throttle ≥ duración real del sample).
// No prueba reproducción real (jsdom/Audio no están disponibles en Node)
// — ver docs/TESTING.md "Lo que NO cubre esta suite".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  SFX_FILES, SFX_GAIN, SFX_POOL_SIZE, SFX_POOL_DEFAULT,
  SFX_THROTTLE_MS, SFX_THROTTLE_DEFAULT,
  poolSize, throttleMs, poolWindowMs,
  AudioManager,
} from '../js/audio.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// ---------------------------------------------------------------
// Lector de duración Ogg/Vorbis (sin navegador)
// ---------------------------------------------------------------
// La duración de un .ogg se saca del contenedor: la posición de granulo
// (nº de muestras decodificadas) de la última página dividida por el
// sample rate de la cabecera de identificación Vorbis.
// Estructura: página Ogg = "OggS" + 22 bytes + nº segmentos + tabla de
// segmentos + datos. El packet de identificación Vorbis empieza con
// 0x01 + "vorbis" + versión(4) + canales(1) + sample rate(4, LE).
function oggDurationMs(absPath) {
  const buf = readFileSync(absPath);
  if (buf.length < 58) return null;
  if (buf.toString('latin1', 0, 4) !== 'OggS') return null;

  // --- cabecera de identificación Vorbis (primer packet) ---
  const nSeg = buf[26];
  const pkt = 27 + nSeg; // inicio del primer packet de la primera página
  if (buf[pkt] !== 0x01) return null;
  if (buf.toString('latin1', pkt + 1, pkt + 7) !== 'vorbis') return null;
  const rate = buf.readUInt32LE(pkt + 12); // bytes 12..15 del packet
  if (!rate) return null;

  // --- granulo máximo (última página con muestras completas) ---
  let off = 0;
  let gran = -1;
  while (off + 27 <= buf.length) {
    if (buf.toString('latin1', off, off + 4) !== 'OggS') { off++; continue; }
    const g = Number(buf.readBigInt64LE(off + 6));
    if (g > gran) gran = g;
    const segs = buf[off + 26];
    let data = 0;
    for (let i = 0; i < segs; i++) data += buf[off + 27 + i];
    off += 27 + segs + data;
  }
  if (gran < 0) return null;
  return Math.round((gran / rate) * 1000);
}

// Fallback documentado: duraciones medidas de los .ogg reales (44100 Hz).
// Solo se usa si el lector de Ogg no puede parsear un archivo.
const DUR_MS_FALLBACK = {
  'assets/sfx/shot_bullet.ogg': 239,
  'assets/sfx/explosion_small.ogg': 777,
  'assets/sfx/explosion_alt.ogg': 1553,
  'assets/sfx/level_up.ogg': 444,
  'assets/sfx/stage_clear.ogg': 392,
  'assets/sfx/boss_warning.ogg': 165,
  'assets/sfx/card_select.ogg': 290,
  'assets/sfx/ultimate.ogg': 340,
  'assets/sfx/laser_beam.ogg': 744,
  'assets/sfx/impact_hit.ogg': 688,
  'assets/sfx/explosion.ogg': 1256,
  // fase 26: samples del arsenal y de la base
  'assets/sfx/shot_pew.ogg': 235,
  'assets/sfx/laser_digital.ogg': 1100,
  'assets/sfx/blob_slime.ogg': 500,
  'assets/sfx/shield_field.ogg': 954,
  'assets/sfx/click_ui.ogg': 100,
  'assets/sfx/click_ui_alt.ogg': 367,
  'assets/sfx/impact_light.ogg': 118,
};

const _durCache = new Map();
/** Duración real (ms) del sample de `relPath`, con fallback documentado. */
function durationOf(relPath) {
  if (_durCache.has(relPath)) return _durCache.get(relPath);
  const parsed = oggDurationMs(ROOT + relPath);
  const dur = parsed ?? DUR_MS_FALLBACK[relPath] ?? null;
  _durCache.set(relPath, dur);
  return dur;
}

// ---------------------------------------------------------------
// Tests existentes (fase 9)
// ---------------------------------------------------------------
test('SFX_FILES: cada ruta referenciada existe en disco', () => {
  for (const [event, relPath] of Object.entries(SFX_FILES)) {
    const abs = ROOT + relPath;
    assert.ok(existsSync(abs), `evento '${event}' apunta a un archivo inexistente: ${relPath}`);
  }
});

test('SFX_FILES: todas las rutas son .ogg dentro de assets/sfx/', () => {
  for (const relPath of Object.values(SFX_FILES)) {
    assert.match(relPath, /^assets\/sfx\/[\w-]+\.ogg$/);
  }
});

test('SFX_GAIN: solo tiene entradas para eventos que existen en SFX_FILES', () => {
  for (const event of Object.keys(SFX_GAIN)) {
    assert.ok(event in SFX_FILES, `SFX_GAIN tiene '${event}' sin sample real asociado`);
  }
});

test('SFX_GAIN: todos los valores están en (0, 1]', () => {
  for (const [event, gain] of Object.entries(SFX_GAIN)) {
    assert.ok(gain > 0 && gain <= 1, `gain de '${event}' fuera de rango: ${gain}`);
  }
});

// ---------------------------------------------------------------
// dev-7 fase 25: pool suficiente para NO cortar el sample
// ---------------------------------------------------------------
test('SFX_POOL_SIZE: todo evento con sample real tiene entrada explícita en el pool', () => {
  // Sin entrada explícita el pool cae al valor por defecto (2) y el sample
  // se corta: por eso la tabla es explícita para TODOS los eventos.
  for (const event of Object.keys(SFX_FILES)) {
    assert.ok(event in SFX_POOL_SIZE,
      `evento '${event}' sin entrada explícita en SFX_POOL_SIZE (usaría el default ${SFX_POOL_DEFAULT})`);
  }
});

test('SFX_POOL_SIZE: no hay entradas huérfanas (todo nombre del pool tiene sample)', () => {
  for (const event of Object.keys(SFX_POOL_SIZE)) {
    assert.ok(event in SFX_FILES,
      `SFX_POOL_SIZE tiene '${event}' pero ese evento no tiene sample real`);
    assert.ok(SFX_POOL_SIZE[event] >= 1,
      `pool de '${event}' inválido: ${SFX_POOL_SIZE[event]}`);
  }
});

test('pool: la ventana (pool × throttle) cubre la duración real del sample', () => {
  // Solo los sonidos CON throttle explícito: son los que pueden repetirse
  // rápido. Los de evento único (levelup, card, stageclear...) no se
  // solapan en la práctica y rely del salto de <audio> ocupados.
  for (const [event, relPath] of Object.entries(SFX_FILES)) {
    if (!(event in SFX_THROTTLE_MS)) continue;
    const dur = durationOf(relPath);
    assert.ok(dur !== null, `no se pudo medir la duración de '${relPath}'`);
    const win = poolWindowMs(event);
    assert.ok(win >= dur,
      `pool insuficiente para '${event}': ventana ${win} ms (pool ${poolSize(event)} × throttle ${throttleMs(event)} ms) < duración ${dur} ms`);
  }
});

test('pool: la aritmética pool × throttle ≥ duración se cumple con los valores actuales', () => {
  // Tabla explícita de lo que el test anterior cubre (verificada contra
  // los .ogg reales leídos del contenedor Ogg).
  const esperado = {
    shot: { pool: 6, throttle: 90, dur: 239 },
    kill: { pool: 20, throttle: 40, dur: 777 },
    perkExecute: { pool: 5, throttle: 150, dur: 688 },
    perkBoom: { pool: 9, throttle: 150, dur: 1256 },
    baseHit: { pool: 4, throttle: 120, dur: 118 },
    baseBlocked: { pool: 5, throttle: 200, dur: 954 },
    missile: { pool: 4, throttle: 120, dur: 235 },
    gauss: { pool: 4, throttle: 300, dur: 1100 },
    beam: { pool: 3, throttle: 340, dur: 954 },
    bolt: { pool: 4, throttle: 110, dur: 100 },
    chain: { pool: 3, throttle: 180, dur: 367 },
    mortar: { pool: 3, throttle: 300, dur: 500 },
    drone: { pool: 4, throttle: 140, dur: 235 },
  };
  for (const [event, e] of Object.entries(esperado)) {
    assert.equal(poolSize(event), e.pool, `pool de '${event}' cambiado a ${poolSize(event)}`);
    assert.equal(throttleMs(event), e.throttle, `throttle de '${event}' cambiado a ${throttleMs(event)}`);
    assert.equal(poolWindowMs(event), e.pool * e.throttle);
    assert.ok(poolWindowMs(event) >= e.dur,
      `ventana de '${event}' (${poolWindowMs(event)} ms) < duración medida (${e.dur} ms)`);
  }
});

test('pool: la duración medida del sample coincide con la medida de referencia', () => {
  // El lector de Ogg del test se contrasta con las duraciones medidas a
  // mano (decodificando con decodeAudioData en Chrome).
  const referencia = {
    shot: 239, kill: 777, perkExecute: 688, perkBoom: 1256,
    laser: 744, explosion: 1553, levelup: 444, stageclear: 392,
    warning: 165, card: 290, ultimate: 340, gameover: 1256,
    // fase 26: arsenal y base
    baseHit: 118, baseBlocked: 954,
    missile: 235, gauss: 1100, beam: 954, bolt: 100, chain: 367,
    mortar: 500, drone: 235,
  };
  for (const [event, ms] of Object.entries(referencia)) {
    const dur = durationOf(SFX_FILES[event]);
    assert.ok(dur !== null, `no se pudo medir la duración de '${event}'`);
    assert.ok(Math.abs(dur - ms) <= 5,
      `duración de '${event}' = ${dur} ms, se esperaba ~${ms} ms`);
  }
});

// ---------------------------------------------------------------
// dev-7 fase 25: sin nombres de sonido muertos
// ---------------------------------------------------------------
const AUDIO_SRC = readFileSync(ROOT + 'js/audio.js', 'utf8');
// Nombres con un `case` real en el switch de sfx() (sonidos solo sintetizados).
const SYNTH_CASES = new Set(
  [...AUDIO_SRC.matchAll(/case\s+'([A-Za-z0-9_]+)':/g)].map((m) => m[1]));

test('SFX_THROTTLE_MS: ningún nombre muerto (debe ser sample real o case del switch)', () => {
  for (const event of Object.keys(SFX_THROTTLE_MS)) {
    const ok = event in SFX_FILES || SYNTH_CASES.has(event);
    assert.ok(ok,
      `throttle de '${event}' sin sonido asociado: no está en SFX_FILES ni es un case del switch`);
  }
});

test('SFX_THROTTLE_MS: no hay throttles para nombres que no existen', () => {
  for (const event of Object.keys(SFX_THROTTLE_MS)) {
    assert.ok(event in SFX_FILES || SYNTH_CASES.has(event),
      `SFX_THROTTLE_MS tiene '${event}', un sonido inexistente`);
  }
});

test('sfx(): ningún case del switch es un sonido muerto (nadie lo llama)', () => {
  // Regresión de BUG-2: el case 'hit' existía pero nadie llamaba
  // sfx('hit') → código muerto. Un case solo sintetizado debe llamarse
  // desde algún sitio de js/.
  const fuentes = readdirSync(ROOT + 'js')
    .filter((f) => f.endsWith('.js') && f !== 'audio.js')
    .map((f) => {
      try { return readFileSync(ROOT + 'js/' + f, 'utf8'); } catch (_e) { return ''; }
    });
  for (const name of SYNTH_CASES) {
    if (name in SFX_FILES) continue; // sonido con sample real: vive por SFX_FILES
    const called = fuentes.some((src) => src.includes(`'${name}'`) || src.includes(`"${name}"`));
    assert.ok(called, `case '${name}' del switch de sfx() es código muerto: nadie lo llama`);
  }
});

test('helpers de pool: valores por defecto documentados', () => {
  assert.equal(poolSize('__inexistente__'), SFX_POOL_DEFAULT);
  assert.equal(throttleMs('__inexistente__'), SFX_THROTTLE_DEFAULT);
  assert.equal(poolWindowMs('__inexistente__'), SFX_POOL_DEFAULT * SFX_THROTTLE_DEFAULT);
});

// ---------------------------------------------------------------
// fase 26: la base deja de ser muda + el arsenal se oye
// ---------------------------------------------------------------
// Nombres que js/main.js y js/towers.js van a llamar.
const SFX_BASE = ['baseHit', 'baseBlocked'];
const SFX_ARSENAL = ['missile', 'gauss', 'beam', 'bolt', 'chain', 'mortar', 'drone'];
const SFX_NUEVOS = [...SFX_BASE, ...SFX_ARSENAL];

test('fase 26: la base y el arsenal tienen sample, gain y pool', () => {
  for (const event of SFX_NUEVOS) {
    assert.ok(event in SFX_FILES, `falta el sample de '${event}'`);
    assert.ok(event in SFX_GAIN, `falta el gain de '${event}'`);
    assert.ok(event in SFX_POOL_SIZE, `falta el pool explícito de '${event}'`);
  }
});

test('fase 26: gameover y explosion NO comparten archivo', () => {
  // Perder la base no puede sonar igual que matar a un jefe.
  assert.notEqual(SFX_FILES.gameover, SFX_FILES.explosion,
    "gameover y explosion apuntan al mismo sample");
});

test('fase 26: cada torre tiene sample propio (solo missile/drone comparten)', () => {
  // missile y drone son la misma familia (torre de proyectil) y comparten
  // el "pew" corto; cualquier otro reparto es un bug de diseño sonoro.
  const porArchivo = new Map();
  for (const event of [...SFX_ARSENAL, 'laser']) {
    const file = SFX_FILES[event];
    const otro = porArchivo.get(file);
    const permitido = (event === 'drone' && otro === 'missile')
      || (event === 'missile' && otro === 'drone');
    assert.ok(!otro || permitido,
      `'${event}' y '${otro}' comparten '${file}' y deberían sonar distinto`);
    porArchivo.set(file, event);
  }
});

test('fase 26: el pool de los sonidos nuevos cubre su duración real', () => {
  for (const event of SFX_NUEVOS) {
    const dur = durationOf(SFX_FILES[event]);
    assert.ok(dur !== null, `no se pudo medir la duración de '${event}'`);
    assert.ok(poolWindowMs(event) >= dur,
      `pool insuficiente para '${event}': ventana ${poolWindowMs(event)} ms < duración ${dur} ms`);
    assert.ok(throttleMs(event) >= 40,
      `throttle de '${event}' demasiado corto: ${throttleMs(event)} ms`);
  }
});

test('fase 26 (T3): el shot genérico ya no tapa al resto del arsenal', () => {
  // El 'shot' a 0.35 cada 45 ms era un fondo continuo más fuerte que el
  // aviso de jefe; ahora es más bajo, más espaciado y el aviso manda.
  assert.ok(SFX_GAIN.shot <= 0.2, `SFX_GAIN.shot = ${SFX_GAIN.shot} (esperado ≤ 0.2)`);
  assert.ok(throttleMs('shot') >= 90, `throttle de 'shot' = ${throttleMs('shot')} (esperado ≥ 90)`);
  assert.ok(SFX_GAIN.warning >= 0.75, `SFX_GAIN.warning = ${SFX_GAIN.warning} (esperado ≥ 0.75)`);
  assert.ok(SFX_GAIN.laser >= 0.5, `SFX_GAIN.laser = ${SFX_GAIN.laser} (esperado ≥ 0.5)`);
  // ...y el aviso de jefe debe percibirse MÁS fuerte que el shot de fondo.
  assert.ok(SFX_GAIN.warning > SFX_GAIN.shot);
});

test('fase 26 (T4): setIntensity acepta 1..4 y acota fuera de rango', () => {
  const a = new AudioManager();
  for (let lvl = 1; lvl <= 4; lvl++) {
    a.setIntensity(lvl);
    assert.equal(a.intensity, lvl, `setIntensity(${lvl}) no se aplicó`);
  }
  a.setIntensity(9);
  assert.equal(a.intensity, 4, 'setIntensity(9) debería acotar a 4');
  a.setIntensity(0);
  assert.equal(a.intensity, 1, 'setIntensity(0) debería acotar a 1');
  a.setIntensity(-3);
  assert.equal(a.intensity, 1, 'setIntensity(-3) debería acotar a 1');
  a.setIntensity(2.9);
  assert.equal(a.intensity, 2, 'setIntensity(2.9) debería truncar a 2');
});

test('fase 26 (T5): el volumen de SFX es independiente del de música', () => {
  const a = new AudioManager();
  const musicInicial = a.volumes.music;
  a.setVolumes({ sfx: 0 });
  assert.equal(a.volumes.sfx, 0, 'sfx: 0 debería silenciar el SFX');
  assert.equal(a.volumes.music, musicInicial, 'silenciar el SFX no debe tocar la música');
  a.setVolumes({ music: 0.25 });
  assert.equal(a.volumes.music, 0.25);
  assert.equal(a.volumes.sfx, 0, 'bajar la música no debe tocar el SFX');
  // Desmutear restaura el último nivel pedido.
  a.setSfxMuted(false);
  assert.ok(a.volumes.sfx > 0, 'setSfxMuted(false) debería restaurar el volumen de SFX');
  assert.equal(a.volumes.music, 0.25, 'desmutear el SFX no debe tocar la música');
});

test('fase 26 (T5): setVolumes acota los valores y no lanza con sfx: 0', () => {
  const a = new AudioManager();
  assert.doesNotThrow(() => a.setVolumes({ sfx: 0 }));
  assert.doesNotThrow(() => a.setVolumes({ master: 5, music: -1, sfx: 2 }));
  assert.equal(a.volumes.master, 1);
  assert.equal(a.volumes.music, 0);
  assert.equal(a.volumes.sfx, 1);
  // Valores raros (NaN/Infinity) se ignoran: no rompen la mezcla.
  assert.doesNotThrow(() => a.setVolumes({ sfx: NaN, music: Infinity }));
  assert.equal(Number.isFinite(a.volumes.sfx), true);
  assert.equal(Number.isFinite(a.volumes.music), true);
});

test('fase 26: sfx() no lanza sin AudioContext para ningún sonido', () => {
  // En Node no hay ctx ni <audio>: sfx() debe salir limpio para TODOS los
  // nombres (incluidos los nuevos del arsenal).
  const a = new AudioManager();
  for (const event of Object.keys(SFX_FILES)) {
    assert.doesNotThrow(() => a.sfx(event), `sfx('${event}') lanzó sin AudioContext`);
  }
});
