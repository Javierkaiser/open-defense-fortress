// tests/test-engine.mjs
// Cubre el núcleo del motor (js/engine.js) sin DOM: la FSM, el tope de
// partículas y la velocidad de juego. Todo corre en Node porque engine.js
// no importa NADA (regla de dependencias de docs/DESIGN.md §1.1) y sus guards
// `typeof document === 'undefined'` permiten instanciarlo sin canvas.
//
// main.js NO se puede importar en Node (hace DOM en el scope del módulo),
// así que los fixes de ese archivo se cubren con guardas estáticas sobre
// su código fuente (últimos tests del archivo).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  Engine, CONFIG, SCENE, STATES, THEMES,
  NEBULA_ALPHA_MIN, NEBULA_ALPHA_MAX,
  LAYOUT, SPAWN_Y, MAX_TOWER_REACH, TOWER_BAY,
  logicalHeightForFrame, setLogicalHeight, fallYAfter,
} from '../js/engine.js';
import { Enemy } from '../js/enemies.js';
// fase 62: el pad de la torre tiene que ENTRAR en la bahía del deck — el
// único lugar donde engine.js y tower-art.js se miran de frente.
import { TOWER_PAD, TOWER_VISUAL_SCALE } from '../js/tower-art.js';

// ---------- helpers ----------

/**
 * Contexto 2D falso: acepta cualquier llamada del motor (para poder
 * renderizar en Node) y cuenta lo que hace falta para los asserts.
 */
function recordingCtx() {
  const calls = { radial: 0, linear: 0, fillRect: 0, stroke: 0, arc: 0 };
  const noop = () => {};
  return {
    calls,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '', strokeStyle: '', lineWidth: 1,
    shadowBlur: 0, shadowColor: '',
    font: '', textAlign: 'left', lineCap: 'butt', lineJoin: 'miter',
    save: noop, restore: noop, translate: noop, rotate: noop, scale: noop,
    transform: noop, setTransform: noop, resetTransform: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop,
    quadraticCurveTo: noop, bezierCurveTo: noop, arcTo: noop, rect: noop,
    ellipse: noop,
    arc: () => { calls.arc++; },
    fill: noop, clip: noop,
    stroke: () => { calls.stroke++; },
    fillRect: () => { calls.fillRect++; },
    strokeRect: noop, clearRect: noop,
    fillText: noop, strokeText: noop,
    setLineDash: noop, getLineDash: () => [],
    measureText: () => ({ width: 8 }),
    drawImage: noop,
    createLinearGradient: () => { calls.linear++; return { addColorStop() {} }; },
    createRadialGradient: () => { calls.radial++; return { addColorStop() {} }; },
  };
}

/** Canvas mínimo: el Engine solo necesita getContext('2d') + scale(). */
function fakeCanvas() {
  const ctx = recordingCtx();
  const c = { width: 0, height: 0, getContext: () => ctx };
  c.ctx = ctx; // atajo para inspeccionar las llamadas del ctx del engine
  return c;
}

function makeEngine() {
  return new Engine(fakeCanvas());
}

/** Documento falso: habilita los caches offscreen del engine (fase 19/28). */
function fakeDocument() {
  return {
    hidden: false,
    createElement(tag) {
      assert.equal(tag, 'canvas');
      return { width: 0, height: 0, getContext: () => recordingCtx() };
    },
    addEventListener() {},
  };
}

/** Ejecuta `fn` con un document falso (los caches offscreen existen) y
 *  restaura el entorno original al terminar. */
function withFakeDocument(fn) {
  const prev = globalThis.document;
  globalThis.document = fakeDocument();
  try {
    return fn();
  } finally {
    if (prev === undefined) delete globalThis.document;
    else globalThis.document = prev;
  }
}

/** Evento de teclado mínimo (los handlers usan ev.key y ev.preventDefault). */
function key(k) {
  return { key: k, preventDefault() {} };
}

/** Cuerpo de un método del código fuente (llaves balanceadas). */
function methodBody(src, signature) {
  const i = src.indexOf(signature);
  assert.ok(i >= 0, `no se encontró "${signature}"`);
  return bracesFrom(src, src.indexOf('{', i));
}

/** Cuerpo de una función flecha que sigue a un marker (handler de event). */
function arrowBody(src, marker) {
  const i = src.indexOf(marker);
  assert.ok(i >= 0, `no se encontró "${marker}"`);
  const arrow = src.indexOf('=>', i);
  assert.ok(arrow > 0, `no se encontró la flecha de "${marker}"`);
  return bracesFrom(src, src.indexOf('{', arrow));
}

/** Texto entre llaves balanceadas, desde la llave de apertura `open`. */
function bracesFrom(src, open) {
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') {
      depth--;
      if (depth === 0) return src.slice(open + 1, j);
    }
  }
  throw new Error('llaves desbalanceadas');
}

// ---------- BUG 1: setParticleCap duplicado ----------

test('setParticleCap: trunca las partículas vivas al bajar el tope', () => {
  const e = makeEngine();
  e.particles = Array.from({ length: 400 }, (_, i) => ({ x: i, y: 0 }));
  e.setParticleCap(150);
  assert.equal(e._particleCap, 150);
  assert.equal(e.particles.length, 150, 'las partículas vivas NO se truncaron');
});

test('setParticleCap: clampa el tope a un entero >= 0', () => {
  const e = makeEngine();
  e.setParticleCap(-5);
  assert.equal(e._particleCap, 0);
  e.setParticleCap(12.7);
  assert.equal(e._particleCap, 12);
  e.setParticleCap(NaN);
  assert.equal(e._particleCap, 0);
  e.setParticleCap('80');
  assert.equal(e._particleCap, 80);
});

test('setParticleCap: con tope 0 no queda ninguna partícula viva', () => {
  const e = makeEngine();
  e.particles = Array.from({ length: 30 }, () => ({ x: 0, y: 0 }));
  e.setParticleCap(0);
  assert.equal(e.particles.length, 0);
});

test('setParticleCap: subir el tope no recorta ni crea partículas', () => {
  const e = makeEngine();
  e.particles = Array.from({ length: 10 }, () => ({ x: 0, y: 0 }));
  e.setParticleCap(200);
  assert.equal(e._particleCap, 200);
  assert.equal(e.particles.length, 10);
});

test('setParticleCap: el tope por defecto es MAX_PARTICLES', () => {
  const e = makeEngine();
  assert.equal(e._particleCap, CONFIG.MAX_PARTICLES);
});

test('spawnParticles: respeta el tope vigente (FIFO)', () => {
  const e = makeEngine();
  e.setParticleCap(10);
  e.spawnParticles(0, 0, '#FFF', 50);
  assert.ok(e.particles.length <= 10, `se pasaron del tope: ${e.particles.length}`);
});

// ---------- BUG 2: las teclas 1/2/3 en pausa no reanudan ----------

test('setTimeScale: en PAUSED no cambia timeScale pero guarda la velocidad', () => {
  const e = makeEngine();
  e.setState('PLAYING');
  e.setTimeScale(2);
  e.setState('PAUSED');
  assert.equal(e.timeScale, 0);
  e.setTimeScale(1);
  assert.equal(e.timeScale, 0, 'setTimeScale(1) reanudó la simulación en pausa');
  assert.equal(e._savedSpeed, 1);
  e.setTimeScale(1.5);
  assert.equal(e.timeScale, 0);
  assert.equal(e._savedSpeed, 1.5);
  e.setTimeScale(2);
  assert.equal(e.timeScale, 0);
  assert.equal(e._savedSpeed, 2);
});

test('setTimeScale: en PAUSED las teclas 1/2/3 no reanudan la simulación', () => {
  const e = makeEngine();
  e.setState('PLAYING');
  e.setState('PAUSED');
  for (const k of ['1', '2', '3']) {
    e._onKeyDown(key(k));
    assert.equal(e.state, 'PAUSED', `la tecla ${k} cambió el estado`);
    assert.equal(e.timeScale, 0, `la tecla ${k} descongeló la simulación`);
  }
  assert.equal(e._savedSpeed, 2, 'la tecla 3 no guardó la velocidad x2');
});

test('setTimeScale: en CARD_CHOICE tampoco reanuda la simulación', () => {
  const e = makeEngine();
  e.setState('PLAYING');
  e.setState('CARD_CHOICE');
  assert.equal(e.timeScale, 0);
  e.setTimeScale(2);
  assert.equal(e.timeScale, 0);
  assert.equal(e._savedSpeed, 2);
});

test('setState: entrar en PAUSED congela y volver a PLAYING restaura', () => {
  const e = makeEngine();
  e.setState('PLAYING');
  e.setTimeScale(2);
  e.setState('PAUSED');
  assert.equal(e.timeScale, 0, 'entrar en pausa no congeló el tiempo');
  e.setState('PLAYING');
  assert.equal(e.timeScale, 2, 'volver a PLAYING no restauró la velocidad');
});

test('setState: ciclo completo pausa → elegir velocidad → reanudar', () => {
  const e = makeEngine();
  e.setState('PLAYING');
  e.setTimeScale(1);
  e.setState('PAUSED');
  e._onKeyDown(key('3'));           // elige x2 para reanudar
  assert.equal(e.timeScale, 0);
  assert.equal(e._savedSpeed, 2);
  e.setState('PLAYING');
  assert.equal(e.timeScale, 2, 'no se restauró la velocidad elegida en pausa');
});

test('setState: volver a PLAYING sin velocidad guardada arranca en x1', () => {
  const e = makeEngine();
  e.setState('PLAYING');
  e.setState('PAUSED');
  e.setState('PLAYING');
  assert.equal(e.timeScale, 1);
});

test('resumeSpeed: expone la velocidad con la que se reanudará', () => {
  const e = makeEngine();
  e.setState('PLAYING');
  e.setTimeScale(1.5);
  e.setState('PAUSED');
  assert.equal(e.resumeSpeed, 1.5);
  e.setTimeScale(2);
  assert.equal(e.resumeSpeed, 2);
});

test('timescale:changed: se sigue emitiendo al cambiar la velocidad en pausa', () => {
  const e = makeEngine();
  const seen = [];
  e.on('timescale:changed', (v) => seen.push(v));
  e.setState('PLAYING');
  e.setState('PAUSED');
  e.setTimeScale(2);
  assert.ok(seen.length >= 2, 'no se emitió el evento de velocidad');
  assert.equal(seen.at(-1), 0, 'en pausa la velocidad efectiva sigue siendo 0');
});

test('cycleSpeed: en pausa cicla sobre la velocidad guardada, no sobre 0', () => {
  const e = makeEngine();
  e.setState('PLAYING');
  e.setTimeScale(1.5);
  e.setState('PAUSED');
  assert.equal(e.cycleSpeed(), 2);
  assert.equal(e.timeScale, 0, 'cycleSpeed descongeló la simulación');
  assert.equal(e._savedSpeed, 2);
});

// ---------- BUG 3/BUG 4: main.js (guardas estáticas) ----------

test('engine.js: no importa nada (regla de dependencias §1.1)', () => {
  const src = readFileSync(new URL('../js/engine.js', import.meta.url), 'utf8');
  const imports = src.split('\n').filter((l) => /^\s*import\s/.test(l));
  assert.deepEqual(imports, [], 'engine.js no debe tener imports');
  assert.ok(!/\brequire\s*\(/.test(src), 'engine.js no debe usar require()');
});

test('engine.js: los estados de pausa están declarados', () => {
  assert.ok(STATES.includes('PAUSED'));
  assert.ok(STATES.includes('CARD_CHOICE'));
});

test('fase 69: PROTOCOLO es un estado más (y NO de pausa)', () => {
  assert.ok(STATES.includes('PROTOCOLO'), 'la pantalla del protocolo tiene su estado');
  const e = makeEngine();
  assert.doesNotThrow(() => e.setState('PROTOCOLO'), 'setState rechaza el estado nuevo');
  assert.equal(e.state, 'PROTOCOLO');
  // No congela: el juego ya está fuera de PLAYING cuando se entra.
  assert.notEqual(e.timeScale, 0, 'PROTOCOLO no es un estado de pausa');
  e.setState('MENU');
  assert.equal(e.state, 'MENU');
});

test('fase 70: RECORDS es un estado más (y NO de pausa)', () => {
  assert.ok(STATES.includes('RECORDS'), 'la sala de récords tiene su estado');
  const e = makeEngine();
  assert.doesNotThrow(() => e.setState('RECORDS'), 'setState rechaza el estado nuevo');
  assert.equal(e.state, 'RECORDS');
  // Consultar los récords no congela la partida de fondo.
  assert.notEqual(e.timeScale, 0, 'RECORDS no es un estado de pausa');
  e.setState('MENU');
  assert.equal(e.state, 'MENU');
});

test('fase 72: CREDITS es un estado más (y NO de pausa)', () => {
  assert.ok(STATES.includes('CREDITS'), 'la pantalla de créditos tiene su estado');
  const e = makeEngine();
  assert.doesNotThrow(() => e.setState('CREDITS'), 'setState rechaza el estado nuevo');
  assert.equal(e.state, 'CREDITS');
  // Consultar los créditos no congela nada: se entra con el juego ya fuera
  // de PLAYING (igual que PROTOCOLO y RECORDS).
  assert.notEqual(e.timeScale, 0, 'CREDITS no es un estado de pausa');
  e.setState('MENU');
  assert.equal(e.state, 'MENU');
});

test('game.js: Esc en PAUSED reanuda la partida (BUG-003)', () => {
  const src = readFileSync(new URL('../js/game.js', import.meta.url), 'utf8');
  const body = methodBody(src, '_onEscape() {');
  assert.ok(body.includes("'PAUSED'"), '_onEscape no contempla el estado PAUSED');
  assert.ok(body.includes('this.resume()'), '_onEscape no reanuda desde PAUSED');
});

test('game.js: el modal de cartas/perk se cierra en TODO cambio de estado (BUG-004)', () => {
  const src = readFileSync(new URL('../js/game.js', import.meta.url), 'utf8');
  assert.ok(
    !src.includes("prev === 'CARD_CHOICE'"),
    'el modal solo se cierra si el estado PREVIO era CARD_CHOICE',
  );
  const handler = arrowBody(src, "engine.on('state:changed'");
  assert.ok(handler.includes('this.hud.hideCardChoice()'), 'el modal no se cierra al cambiar de estado');
});

// ---------- Fondo: caches offscreen, nebulosa, terminador y halo de spawn ----------

test('applyQualityTo: la calidad se aplica al ctx visible y a los 4 caches offscreen', () => {
  withFakeDocument(() => {
    const e = makeEngine();
    const seen = [];
    e.applyQualityTo((ctx) => seen.push(ctx), 'baja');
    assert.equal(seen.length, 5, 'debe aplicar la calidad al ctx visible + los 4 caches');
    assert.ok(seen.includes(e.ctx), 'falta el contexto visible');
    assert.ok(seen.includes(e._skyCache.ctx), 'falta el cache del cielo');
    assert.ok(seen.includes(e._planetCache.ctx), 'falta el cache del planeta');
    assert.ok(seen.includes(e._fogCache.ctx), 'falta el cache de la niebla');
    assert.ok(seen.includes(e._deckCache.ctx), 'falta el cache del deck (fase 62)');
  });
});

test('caches offscreen: existen y el fondo NO se redibuja en cada frame', () => {
  withFakeDocument(() => {
    const e = makeEngine();
    for (const c of [e._skyCache, e._planetCache, e._fogCache]) {
      assert.ok(c?.canvas, 'el cache no tiene canvas');
      assert.ok(c?.ctx, 'el cache no tiene contexto 2D');
    }
    // Cielo+planeta: 1 refresh cada 3 frames (no en cada frame).
    let skyRefreshes = 0;
    e._drawSky = () => { skyRefreshes++; };
    for (let i = 0; i < 9; i++) e._refreshBgCacheIfNeeded();
    assert.ok(skyRefreshes < 9, `el fondo se redibuja cada frame (${skyRefreshes}/9)`);
    assert.equal(skyRefreshes, 4, 'el cache del fondo debería refrescar 1 de cada 3 frames');
    // Niebla: mismo criterio (1 de cada 3).
    let fogRefreshes = 0;
    e._drawFogDirect = () => { fogRefreshes++; };
    const ctx = recordingCtx();
    for (let i = 0; i < 6; i++) e._drawFogCached(ctx, e.theme);
    assert.ok(fogRefreshes < 6, `la niebla se redibuja cada frame (${fogRefreshes}/6)`);
    assert.equal(fogRefreshes, 3, 'el cache de la niebla debería refrescar 1 de cada 3 frames');
  });
});

test('nebulosa: el alpha (base y efectivo) nunca sale del rango de bruma', () => {
  const e = makeEngine();
  assert.ok(e._nebula.length >= 2, 'faltan manchas de nebulosa');
  for (const n of e._nebula) {
    assert.ok(
      n.a >= NEBULA_ALPHA_MIN && n.a <= NEBULA_ALPHA_MAX,
      `alpha base fuera de rango: ${n.a}`,
    );
    assert.ok(n.r >= 260 && n.r <= 420, `radio fuera de rango: ${n.r}`);
    assert.ok(n.y > CONFIG.CANVAS_H * 0.4, 'la nebulosa debe ir en la mitad inferior del cielo');
    assert.ok(
      Math.abs(n.x - CONFIG.BASE_X) > 20,
      'la nebulosa no debe formar un eje con el centro (planeta)',
    );
  }
  // El pulso y el multiplicador del tema tampoco pueden romper el rango.
  for (const th of Object.values(THEMES)) {
    e.theme = th;
    for (let t = 0; t < 120; t += 0.5) {
      e._t = t;
      for (const n of e._nebula) {
        const a = e._nebulaAlpha(n);
        assert.ok(
          a >= NEBULA_ALPHA_MIN && a <= NEBULA_ALPHA_MAX,
          `alpha efectivo fuera de rango en ${th.feature}: ${a}`,
        );
      }
    }
  }
});

test('engine: render() en Node no lanza (nebulosa, terminador y halo de spawn)', () => {
  const e = makeEngine();
  let haloCalls = 0;
  const orig = e._drawSpawnHalo;
  e._drawSpawnHalo = (ctx) => { haloCalls++; orig.call(e, ctx); };
  assert.doesNotThrow(() => e.render(), 'render() lanzó en Node');
  assert.equal(haloCalls, 1, 'el halo del spawn no se dibujó');
  assert.ok(e.ctx.calls.radial > 0, 'no se creó ningún gradiente radial');
});

// ============================================================
// FASE 58 — EL ALTO LÓGICO SE DERIVA DEL MARCO
// (el marco ya no tiene proporción fija 54/88: usa todo el alto
//  disponible y el ancho se limita a 100vw - 16px)
// ============================================================

/** Aplica un alto lógico y RESTAURA el anterior al terminar. */
function withLogicalHeight(h, fn) {
  const prev = LAYOUT.h;
  try {
    setLogicalHeight(h);
    return fn();
  } finally {
    setLogicalHeight(prev);
  }
}

test('fase 58: el alto lógico sale de la proporción REAL del marco', () => {
  // Escritorio 1920×1080 → marco 653×1064 → 540×880 (idéntico a siempre).
  assert.equal(logicalHeightForFrame(653, 1064), 880);
  // Móvil 390×844 → marco 374×828 → 540×1195 (el campo de juego crece).
  assert.equal(logicalHeightForFrame(374, 828), 1195);
  // Un marco MÁS ALTO que 54:88 da un alto lógico mayor (y nunca menor).
  assert.ok(logicalHeightForFrame(374, 900) > 1195);
  assert.ok(logicalHeightForFrame(700, 1000) >= 880);
  // Sin marco (Node) → layout de referencia.
  assert.equal(logicalHeightForFrame(0, 0), 880);
  // Acotado por el tope (un móvil extremo no estira el campo sin límite).
  assert.ok(logicalHeightForFrame(200, 4000) <= LAYOUT.maxH);
});

test('fase 58: lo anclado ABAJO se mueve con el alto; lo de ARRIBA no', () => {
  withLogicalHeight(1195, () => {
    const d = 1195 - 880;
    assert.equal(CONFIG.CANVAS_H, 1195);
    assert.equal(CONFIG.TOWER_Y, 830 + d);
    assert.equal(SCENE.PLATFORM_Y, 810 + d);
    assert.equal(SCENE.BASE_ARC_Y, 710 + d);
    // Arriba (planeta) NO se mueve: el disco sigue igual.
    assert.equal(SCENE.PLANET_CX, 270);
    assert.equal(SCENE.PLANET_CY, -150);
    assert.equal(SCENE.PLANET_R, 450);
    // El ancho lógico NUNCA cambia.
    assert.equal(CONFIG.CANVAS_W, 540);
    // El tramo "bajo fuego" (borde del alcance de las torres) baja con las torres.
    assert.equal(LAYOUT.bandY, CONFIG.TOWER_Y - MAX_TOWER_REACH);
  });
  withLogicalHeight(880, () => {
    assert.equal(CONFIG.CANVAS_H, 880);
    assert.equal(CONFIG.TOWER_Y, 830);
    assert.equal(SCENE.PLATFORM_Y, 810);
    assert.equal(SCENE.BASE_ARC_Y, 710);
    assert.equal(LAYOUT.fallScale, 1, 'sin campo extra no hay compensación');
  });
});

test('fase 58: la caída se compensa (spawn→base tarda lo mismo con 880 y con 1195)', () => {
  const fallTime = (h) => withLogicalHeight(h, () => {
    const e = new Enemy('meteor', 270, { y: SPAWN_Y });
    const baseY = CONFIG.TOWER_Y + 20;
    const dt = 1 / 60;
    let t = 0;
    while (e.y < baseY && t < 300) { e.update(dt); t += dt; }
    assert.ok(e.y >= baseY, 'el enemigo no llegó a la base');
    return t;
  });
  const t880 = fallTime(880);
  const t1195 = fallTime(1195);
  // El campo de caída crece un 32 %, pero el tiempo de viaje es el MISMO:
  // es lo que hace que el balance no cambie.
  assert.ok(Math.abs(t1195 - t880) < 0.05,
    `el tiempo de caída cambió: ${t880.toFixed(3)} s → ${t1195.toFixed(3)} s`);
  // Y el tramo libre (donde no hay torre que pueda disparar) es el que acelera.
  withLogicalHeight(1195, () => {
    assert.ok(LAYOUT.fallScale > 1.4, `fallScale demasiado bajo: ${LAYOUT.fallScale}`);
  });
});

test('fase 58: la proyección de la caída integra el cambio de velocidad', () => {
  withLogicalHeight(1195, () => {
    const vel = 60;
    const T = 20;               // enough to cross the "under fire" edge
    const y = SPAWN_Y;          // tramo libre
    const band = LAYOUT.bandY;
    const t1 = (band - y) / (vel * LAYOUT.fallScale);
    assert.ok(t1 < T, 'el caso de prueba tiene que cruzar el borde');
    const esperado = band + vel * (T - t1);
    const y1 = fallYAfter(y, vel, T);
    assert.ok(Math.abs(y1 - esperado) < 1e-6,
      `proyección incorrecta: ${y1} vs ${esperado}`);
    // Ya en el tramo "bajo fuego" la proyección es la lineal de siempre.
    assert.equal(fallYAfter(band + 10, vel, T), band + 10 + vel * T);
  });
});

test('fase 58: el motor mide el marco y redimensiona el buffer', () => {
  const box = { w: 653, h: 1064 };
  const ctx = recordingCtx();
  const calls = { scale: 0 };
  ctx.scale = () => { calls.scale++; };
  const canvas = {
    width: 0, height: 0,
    getContext: () => ctx,
    getBoundingClientRect: () => ({ width: box.w, height: box.h }),
  };
  // con document falso: los caches offscreen existen (como en el navegador).
  withFakeDocument(() => {
    const e = new Engine(canvas);
    try {
      // Marco 54:88 → el layout de referencia (idéntico a antes de la fase 58).
      assert.equal(CONFIG.CANVAS_H, 880);
      assert.equal(canvas.width, 540 * e.dpr);
      assert.equal(canvas.height, 880 * e.dpr);
      assert.equal(calls.scale, 1, 'el scale del DPR se aplica una vez');

      // El marco se estira (móvil): el buffer sigue al marco.
      box.w = 374; box.h = 828;
      assert.ok(e.relayout(), 'el relayout no detectó el cambio de proporción');
      assert.equal(CONFIG.CANVAS_H, 1195);
      assert.equal(canvas.width, 540 * e.dpr);
      assert.equal(canvas.height, 1195 * e.dpr);
      // El cambio de width/height RESETEA el contexto: hay que reaplicar el scale.
      assert.ok(calls.scale >= 2, 'el scale del DPR no se reaplicó tras redimensionar');
      // Los caches offscreen también siguen el alto nuevo.
      assert.equal(e._skyCache.canvas.height, 1195 * e.dpr);
      assert.equal(e._fogCache.canvas.height, 1195 * e.dpr);
      // Y el fondo se fuerza a redibujar.
      assert.equal(e._bgDirty, true);
      assert.equal(e._fogDirty, true);
    } finally {
      setLogicalHeight(880);
    }
  });
});

// ------------------------------------------------------------
// fase 62 — BAHÍAS DE MONTAJE del deck
// ------------------------------------------------------------

test('fase 62: el pad de la torre ENTRA en la bahía de montaje', () => {
  // Acoplamiento por convención: `TOWER_BAY` vive en engine.js (que no
  // importa nada, por invariante) y `TOWER_PAD` en tower-art.js. Este test
  // es el único lugar donde los dos se miran de frente.
  //
  // OJO con la escala: el pad se dibuja dentro del ctx.scale(TOWER_VISUAL_SCALE)
  // de la torre, la bahía NO. Con el anillo a rx 25 el pad medía 60 px y se
  // salía de una bahía de 56 — exactamente lo que este test vigila.
  const s = TOWER_VISUAL_SCALE;
  const lwMax = Math.max(TOWER_PAD.tick.width, TOWER_PAD.tick.idleWidth);
  const padHalfW = TOWER_PAD.ring.rx * s + lwMax / 2;
  const padTop = (TOWER_PAD.cy - TOWER_PAD.ring.ry) * s - lwMax / 2;
  const padBot = (TOWER_PAD.cy + TOWER_PAD.ring.ry) * s + lwMax / 2;
  assert.ok(padHalfW <= TOWER_BAY.halfW,
    `el anillo del pad (${padHalfW.toFixed(1)}) no entra en la bahía (${TOWER_BAY.halfW})`);
  assert.ok(padTop >= TOWER_BAY.top,
    `el pad se sale por arriba (${padTop.toFixed(1)} < ${TOWER_BAY.top})`);
  assert.ok(padBot <= TOWER_BAY.bottom,
    `el pad se sale por abajo (${padBot.toFixed(1)} > ${TOWER_BAY.bottom})`);
});

test('fase 62: las bahías no se pisan entre sí y entran en la plataforma', () => {
  const xs = CONFIG.SLOTS;
  assert.ok(xs.length >= 2, 'hay al menos 2 slots');
  for (let i = 1; i < xs.length; i++) {
    const hueco = xs[i] - xs[i - 1];
    assert.ok(hueco > TOWER_BAY.halfW * 2,
      `las bahías ${i - 1} y ${i} se pisan (hueco ${hueco}, bahía ${TOWER_BAY.halfW * 2})`);
  }
  // Reparto uniforme (fase 62): era 90/215/270/325/450, con las tres del
  // medio a 55 px. Con 5 slots en una fila no hay motivo para el apiñamiento.
  const huecos = xs.slice(1).map((v, i) => v - xs[i]);
  assert.equal(new Set(huecos).size, 1, `los huecos entre bahías no son uniformes: ${huecos}`);
  // Y todas dentro del casco (x=18..522), con el chaflán de la esquina.
  const r = 34;
  const bordeEn = (y) => 18 + r - Math.sqrt(Math.max(0, r * r - (810 + r - y) ** 2));
  for (const sx of xs) {
    assert.ok(sx - TOWER_BAY.halfW >= bordeEn(CONFIG.TOWER_Y + TOWER_BAY.top) - 0.5,
      `la bahía de x=${sx} se sale del casco por la izquierda`);
    assert.ok(sx + TOWER_BAY.halfW <= CONFIG.CANVAS_W - 18,
      `la bahía de x=${sx} se sale del casco por la derecha`);
  }
});
