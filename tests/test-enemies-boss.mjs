// tests/test-enemies-boss.mjs — fase 78: MECÁNICAS FIRMA DE LOS JEFES
// -----------------------------------------------------------------------------
// Los 5 jefes de la campaña ya no son "un tanque con fases": cada uno trae una
// mecánica que cambia la pelea (js/enemies-boss.js + el campo `bossMech` de
// js/enemies-data.js):
//   · LLUVIA (jefe S1)          — inyecta fragmentos en columnas durante el asedio;
//   · DEVORAR (Blob Rey)        — se come su escolta para curarse y queda expuesto;
//   · RESURRECCIÓN (Blob Necro) — "no cae" si le quedan 2 esbirros vivos;
//   · PLACAS (Coloso Blindado)  — coraza que absorbe antes que el cuerpo y, al
//     romperse, lo deja expuesto al eléctrico;
//   · METAMORFOSIS (Abominación) — cambia de FAMILIA en cada fase y blinkea.
//
// Lo que fijan estos tests, en orden de importancia:
//   · el CATÁLOGO: los 5 jefes declaran `bossMech` con las claves canónicas y
//     NINGÚN otro tipo lo declara (una mecánica sin dato no existe);
//   · las funciones PURAS del módulo (sin canvas ni DOM): normalización con
//     defaults y clamps, calendario de la lluvia y del devorar, ventanas de
//     EXPOSICIÓN, condición de resurrección y etiqueta del HUD;
//   · la INTEGRACIÓN con Enemy: lluvia real desde SPAWN_Y, cura/bocado exacto,
//     resurrección por golpe Y por veneno (sin `enemy:killed`), placas que
//     absorben con tope `bodyMax` y metamorfosis que cambia el daño;
//   · el DIBUJO con un contexto 2D simulado (Node no tiene canvas): no tira, no
//     muta el estado y sin ctx/kit no hace nada;
//   · sin `game`/`engine` (iconos del bestiario, tests viejos) no rompe.
//
// Sin DOM ni dependencias: mismo patrón que tests/test-enemies.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Enemy, ENEMY_TYPES } from '../js/enemies.js';
import {
  BOSS_KIT_KEYS, BOSS_MECH_COLORS, bossKit, initBossKit, bossReviveSpec,
  setBossExpose, bossExposeMul, tickBossKit, onBossPlateBroken, onBossMorph,
  bossMechLabel, drawBossKit,
} from '../js/enemies-boss.js';
import { CONFIG, SPAWN_Y } from '../js/engine.js';

/** Y de asedio del jefe (misma cuenta que enemies.js: TOWER_Y - 220). */
const SIEGE_Y = CONFIG.TOWER_Y - 220;

/** Los 5 jefes con mecánica firma, en el orden del bestiario. */
const JEFES = ['boss', 'blobBoss', 'graveBlob', 'armoredBlob', 'hybridBoss'];

/** Juego mínimo: engine (partículas, floats, eventos) + lista viva. */
function mkGame() {
  const log = { floats: [], particles: 0, effects: 0, emits: [] };
  const engine = {
    _t: 0, particles: [], entities: [],
    spawnParticles: () => { log.particles += 1; },
    addEffect: () => { log.effects += 1; },
    floatText: (x, y, text) => log.floats.push(text),
    emit: (name, payload) => log.emits.push([name, payload]),
    addEntity(e) { this.entities.push(e); }, shake() {},
  };
  const game = {
    engine,
    fortress: { hp: 1000, maxHp: 1000, enemies: [], takeDamage() {} },
    log,
  };
  return game;
}

/** Contexto 2D mínimo (stub) que CUENTA lo que se dibuja. */
function mkCtx() {
  const grad = { addColorStop() {} };
  const noop = () => {};
  return {
    globalAlpha: 1, globalCompositeOperation: 'source-over',
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: 'butt',
    shadowColor: '', shadowBlur: 0,
    arcs: [], ops: [], strokes: 0, drawImages: 0, rotations: [],
    saveCount: 0, restoreCount: 0,
    save() { this.saveCount += 1; },
    restore() { this.restoreCount += 1; },
    translate: noop, scale: noop,
    rotate(a) { this.rotations.push(a); },
    drawImage() { this.drawImages += 1; },
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop,
    quadraticCurveTo: noop, bezierCurveTo: noop,
    arc(_x, _y, r) { this.arcs.push(r); this.ops.push({ op: 'arc', r }); },
    ellipse: noop,
    fill() { this.ops.push({ op: 'fill' }); },
    stroke() { this.strokes += 1; this.ops.push({ op: 'stroke' }); },
    fillRect: noop, strokeRect: noop, clearRect: noop, clip: noop, setLineDash: noop,
    createLinearGradient: () => grad, createRadialGradient: () => grad,
    measureText: () => ({ width: 0 }), fillText: noop, strokeText: noop,
  };
}

/**
 * Jefe "de mentira" para las funciones PURAS: no necesita Enemy, sólo el dato
 * del tipo, el reloj propio (`t`) y la lista viva del juego.
 */
function jefeFalso(bossMech, game = mkGame()) {
  const e = { data: { bossMech }, t: 0, x: 270, y: SIEGE_Y, dead: false, game };
  initBossKit(e);
  return e;
}

/** Escolta viva del jefe a `dx` px (queda anotada en la lista viva). */
function escoltaDe(game, boss, dx = 60, type = 'spore') {
  const e = new Enemy(type, boss.x + dx, { game, y: boss.y });
  e.escortOf = boss;
  game.fortress.enemies.push(e);
  return e;
}

/** Foto de los campos que el DIBUJO no puede tocar (para comparar después). */
function fotoSimulacion(e) {
  return {
    x: e.x, y: e.y, r: e.r, t: e.t, hp: e.hp, hpMax: e.hpMax,
    dead: e.dead, platesLeft: e.platesLeft, plateHp: e.plateHp,
    expose: e._expose ? { ...e._expose } : null,
    revived: e._revived, reviveReady: e._reviveReady,
    morphT: e._morphT, devourFlash: e._devourFlash,
    rainT: e._rainT, devourT: e._devourT,
  };
}

// ============================================================
// Catálogo: la mecánica es DATO del jefe
// ============================================================

test('fase 78 — catálogo: los 5 jefes declaran su mecánica firma y ningún otro tipo', () => {
  const esperado = {
    boss: 'rain',
    blobBoss: 'devour',
    graveBlob: 'revive',
    armoredBlob: 'plateExpose',
    hybridBoss: 'morph',
  };
  for (const [type, clave] of Object.entries(esperado)) {
    const d = ENEMY_TYPES[type];
    assert.equal(d.boss, true, `${type}: tiene que ser jefe`);
    assert.ok(d.bossMech && typeof d.bossMech === 'object', `${type}: falta bossMech`);
    assert.ok(clave in d.bossMech, `${type}: la mecánica del contrato es ${clave}`);
    // El bestiario lee desc/counter del dato: un jefe sin texto es una tarjeta vacía.
    assert.ok(typeof d.desc === 'string' && d.desc.trim().length > 20, `${type}: falta desc`);
    assert.ok(typeof d.counter === 'string' && d.counter.trim().length > 20, `${type}: falta counter`);
    // Cada clave declarada es una clave del kit (y el kit normalizado la lee).
    for (const k of Object.keys(d.bossMech)) {
      assert.ok(BOSS_KIT_KEYS.includes(k), `${type}: "${k}" no es una clave del kit`);
    }
    const kit = bossKit({ data: d });
    assert.ok(kit?.[clave], `${type}: bossKit no normaliza ${clave}`);
  }
  // Sólo los jefes (y sólo esos 5) declaran bossMech.
  const conMecanica = Object.entries(ENEMY_TYPES).filter(([, d]) => d.bossMech);
  assert.deepEqual(conMecanica.map(([t]) => t).sort(), [...JEFES].sort());
});

test('fase 78 — BOSS_KIT_KEYS y BOSS_MECH_COLORS: el contrato de lectura del kit', () => {
  assert.deepEqual(BOSS_KIT_KEYS, ['rain', 'devour', 'revive', 'plateExpose', 'morph']);
  // Además de las 5 claves del kit hay DOS colores de aviso: placa y exposición.
  assert.deepEqual(Object.keys(BOSS_MECH_COLORS).sort(),
    ['devour', 'expose', 'morph', 'plate', 'rain', 'revive']);
  for (const [clave, color] of Object.entries(BOSS_MECH_COLORS)) {
    assert.match(color, /^#[0-9A-Fa-f]{6}$/, `${clave}: color inválido (${color})`);
  }
});

// ============================================================
// bossKit: normalización y defaults (funciones puras)
// ============================================================

test('fase 78 — bossKit: defaults y null para un tipo sin mecánica (no muta el dato)', () => {
  assert.equal(bossKit(null), null);
  assert.equal(bossKit({}), null);
  assert.equal(bossKit({ data: {} }), null);
  assert.equal(bossKit({ data: { bossMech: {} } }), null, 'un bossMech vacío no es un kit');
  const raw = { rain: {}, devour: {}, revive: {} };
  const antes = JSON.stringify(raw);
  const kit = bossKit({ data: { bossMech: raw } });
  assert.equal(JSON.stringify(raw), antes, 'bossKit no puede mutar el dato del tipo');
  assert.deepEqual(kit.rain, {
    every: 8, first: 6, type: 'fragment', count: 3, maxAlive: 6,
    hpMul: 1, velMul: 1, scoreMul: 0.1,
  });
  assert.deepEqual(kit.devour, {
    every: 6, first: 4, radius: 180, maxEscorts: 3, hpFrac: 0.015,
    maxConsumed: 6, spawnWhenEmpty: null, maxEmpty: 4, expose: null,
  });
  assert.deepEqual(kit.revive, { hpFrac: 0.3, minEscorts: 1 });
  assert.equal(kit.morph, undefined);
  assert.equal(kit.plateExpose, undefined);
});

test('fase 78 — bossKit: normaliza lluvia y devorar (clamps y descartes)', () => {
  const kit = bossKit({ data: { bossMech: {
    rain: { every: -1, first: -5, count: 99, maxAlive: -2, hpMul: 0, velMul: NaN, scoreMul: 7, type: 42 },
    devour: { every: 0, first: -1, radius: 0, maxEscorts: 0, hpFrac: -1, maxConsumed: -3, spawnWhenEmpty: 42, expose: { mul: 5 } },
  } } });
  assert.equal(kit.rain.every, 0.1, 'un ciclo no puede ser 0 o negativo');
  assert.equal(kit.rain.first, 0);
  assert.equal(kit.rain.count, 8, 'tope de 8 columnas por descarga');
  assert.equal(kit.rain.maxAlive, 0);
  assert.equal(kit.rain.hpMul, 0.1);
  assert.equal(kit.rain.velMul, 1, 'NaN cae al default');
  assert.equal(kit.rain.scoreMul, 1);
  assert.equal(kit.rain.type, 'fragment', 'un tipo no-string cae al default');
  assert.equal(kit.devour.every, 0.1);
  assert.equal(kit.devour.first, 0);
  assert.equal(kit.devour.radius, 1);
  assert.equal(kit.devour.maxEscorts, 1);
  assert.equal(kit.devour.hpFrac, 0);
  assert.equal(kit.devour.maxConsumed, 0);
  assert.equal(kit.devour.spawnWhenEmpty, null, 'un tipo no-string no pare nada');
  assert.equal(kit.devour.expose, null, 'una exposición sin weakTo no se lee');
});

test('fase 78 — bossKit: revive, plateExpose y morph se normalizan sin inventar ventanas', () => {
  const kit = bossKit({ data: { bossMech: {
    revive: { hpFrac: 1.5, minEscorts: 0 },
    plateExpose: { seconds: 0, mul: 0.5, weakTo: 'electric' },
    morph: { blink: 'no' },
  } } });
  assert.deepEqual(kit.revive, { hpFrac: 0.95, minEscorts: 1 });
  assert.deepEqual(kit.plateExpose, { seconds: 0.1, weakTo: 'electric', mul: 1.01 });
  assert.equal(kit.morph.blink, true, 'sólo blink:false apaga el teletransporte');
  // Una ventana VÁLIDA conserva los números del dato.
  const ok = bossKit({ data: { bossMech: { devour: { expose: { seconds: 2.5, weakTo: 'light', mul: 1.5 } } } } });
  assert.deepEqual(ok.devour.expose, { seconds: 2.5, weakTo: 'light', mul: 1.5 });
  // plateExpose SIN weakTo se descarta junto con el resto del kit.
  const sinTipo = bossKit({ data: { bossMech: { plateExpose: { seconds: 3, mul: 1.5 } } } });
  assert.equal(sinTipo, null, 'sin weakTo no hay ventana ni kit');
  // Morph es el único dato que no necesita más campos.
  assert.deepEqual(bossKit({ data: { bossMech: { morph: { blink: false } } } }).morph, { blink: false });
  // revive hpFrac 0 → piso 0,01: revivir con 0 de vida no es revivir.
  assert.equal(bossKit({ data: { bossMech: { revive: { hpFrac: 0 } } } }).revive.hpFrac, 0.01);
});

test('fase 78 — initBossKit deja estado neutro en un tipo sin mecánica', () => {
  const e = { data: { bossMech: null } };
  assert.equal(initBossKit(e), null);
  assert.equal(e._bossKit, null);
  assert.equal(e._expose, null);
  assert.equal(e._revived, false);
  assert.equal(e._reviveReady, false);
  assert.equal(e._consumedEscorts, 0);
  assert.equal(e._emptySpawns, 0);
  assert.equal(e._rainT, 0);
  assert.equal(e._devourT, 0);
  assert.equal(e._morphT, 0);
  assert.equal(bossMechLabel(e), null);
  // Con mecánica devuelve el kit normalizado y lo deja puesto en el jefe.
  const boss = { data: { bossMech: ENEMY_TYPES.boss.bossMech } };
  const kit = initBossKit(boss);
  assert.equal(kit, boss._bossKit);
  assert.deepEqual(Object.keys(kit), ['rain']);
  assert.equal(bossMechLabel(boss), null, 'un jefe sin novedades no escribe en la barra');
});

// ============================================================
// LLUVIA (jefe del Stage 1): calendario, tope y spawn real
// ============================================================

test('fase 78 — lluvia: la primera descarga cae a los 6 s de asedio, no antes', () => {
  const boss = jefeFalso(ENEMY_TYPES.boss.bossMech);
  assert.deepEqual(tickBossKit(boss, 0), [], 'dt 0 no hace nada');
  assert.deepEqual(tickBossKit(boss, -1), []);
  assert.deepEqual(tickBossKit({}, 10), [], 'sin kit no hay acciones');
  assert.deepEqual(tickBossKit(boss, 5.9), [], 'todavía no');
  const [accion] = tickBossKit(boss, 0.2);
  assert.equal(accion.kind, 'rain');
  assert.equal(accion.xList.length, ENEMY_TYPES.boss.bossMech.rain.count);
  for (const x of accion.xList) {
    assert.ok(x >= 24 && x <= CONFIG.CANVAS_W - 24, `columna fuera del campo: ${x}`);
  }
  // Y la siguiente descarga espera `every` (8 s), no 6.
  boss._rainT = 0;
  assert.deepEqual(tickBossKit(boss, 7.9), [], 'el segundo ciclo es de 8 s');
  assert.equal(tickBossKit(boss, 0.2)[0].kind, 'rain');
  // Un jefe muerto ya no hace llover.
  boss.dead = true;
  boss._rainT = 0;
  assert.deepEqual(tickBossKit(boss, 10), []);
});

test('fase 78 — lluvia: respeta el tope de escoltas vivas (maxAlive)', () => {
  const lleno = jefeFalso(ENEMY_TYPES.boss.bossMech);
  for (let i = 0; i < 6; i++) escoltaDe(lleno.game, lleno, 40 + i * 20);
  assert.deepEqual(tickBossKit(lleno, 6), [], 'con 6 escoltas vivas no entra ninguna');
  const medio = jefeFalso(ENEMY_TYPES.boss.bossMech);
  for (let i = 0; i < 4; i++) escoltaDe(medio.game, medio, 40 + i * 20);
  const [accion] = tickBossKit(medio, 6);
  assert.equal(accion.xList.length, 2, 'sólo hay sitio para 2 (6 - 4)');
});

test('fase 78 — lluvia: el jefe spawnea 3 fragmentos desde SPAWN_Y y avisa una vez', () => {
  const game = mkGame();
  const boss = new Enemy('boss', 270, { game, y: SIEGE_Y });
  game.fortress.enemies.push(boss);
  boss._updateBossKit(6.1);
  const hijos = game.fortress.enemies.filter((e) => e !== boss);
  assert.equal(hijos.length, 3);
  const d = ENEMY_TYPES.fragment;
  const rain = ENEMY_TYPES.boss.bossMech.rain;
  for (const hijo of hijos) {
    assert.equal(hijo.type, 'fragment');
    assert.equal(hijo.y, SPAWN_Y, 'entran por arriba, no a la altura del jefe');
    assert.equal(hijo.escortOf, boss, 'son escolta del jefe (lo curan / lo sostienen)');
    assert.equal(hijo.spawnedBy, boss);
    assert.equal(hijo.fromSpawn, true, 'pagan score reducido y no vuelven a spawnear');
    assert.equal(hijo.hpMax, Math.round(d.hp * rain.hpMul));
    assert.equal(hijo.vel, d.vel * rain.velMul);
    assert.equal(hijo.scoreReward, d.score * rain.scoreMul);
  }
  // El aviso es UNO por pelea: el HUD no se llena con cada descarga.
  const avisos = game.log.emits.filter(([n]) => n === 'boss:mechanic');
  assert.equal(avisos.length, 1);
  const [, payload] = avisos[0];
  assert.equal(payload.kind, 'rain');
  assert.equal(payload.boss, boss);
  assert.ok(payload.title.includes('LLUVIA'));
  assert.ok(payload.name.length > 0 && payload.rule.length > 0);
  // Segunda descarga: suma hasta el tope y NO repite el aviso.
  boss._updateBossKit(8.1);
  assert.equal(game.fortress.enemies.length, 7, '6 escoltas del tope + el jefe');
  boss._updateBossKit(8.1);
  assert.equal(game.fortress.enemies.length, 7, 'el tope maxAlive 6 no se pasa');
  assert.equal(game.log.emits.filter(([n]) => n === 'boss:mechanic').length, 1);
  // En la bajada (todavía no asedia) el jefe no hace llover.
  const game2 = mkGame();
  const bajando = new Enemy('boss', 270, { game: game2, y: 100 });
  game2.fortress.enemies.push(bajando);
  bajando._updateBossKit(10);
  assert.equal(game2.fortress.enemies.length, 1, 'la mecánica es de asedio');
});

// ============================================================
// DEVORAR (Blob Rey): calendario, cura y exposición
// ============================================================

test('fase 78 — devorar: a los 4 s se come hasta maxEscorts escoltas DENTRO del radio', () => {
  const devorador = jefeFalso(ENEMY_TYPES.blobBoss.bossMech);
  assert.deepEqual(tickBossKit(devorador, 3.9), [], 'todavía no');
  const cerca = [];
  for (let i = 0; i < 4; i++) cerca.push(escoltaDe(devorador.game, devorador, 40 + i * 10));
  const lejos = escoltaDe(devorador.game, devorador, 400); // fuera de los 180 px
  const [accion] = tickBossKit(devorador, 0.2);
  assert.equal(accion.kind, 'devour');
  assert.equal(accion.targets.length, 3, 'maxEscorts = 3');
  assert.ok(!accion.targets.includes(lejos), 'la escolta lejana no se devora');
  assert.ok(accion.targets.every((e) => cerca.includes(e)));
  assert.equal(accion.hpFrac, 0.015);
  assert.deepEqual(accion.expose, { seconds: 2.5, weakTo: 'light', mul: 1.5 });
});

test('fase 78 — devorar: sin escolta pare una espora y respeta los topes', () => {
  const solo = jefeFalso(ENEMY_TYPES.blobBoss.bossMech);
  const [vacia] = tickBossKit(solo, 4);
  assert.equal(vacia.kind, 'empty');
  assert.equal(vacia.type, 'spore', 'pare lo que declara spawnWhenEmpty');
  // maxEmpty: después de 4 crías ya no pare más.
  solo._emptySpawns = 4;
  solo._devourTicks = 1;
  solo._devourT = 0;
  assert.deepEqual(tickBossKit(solo, 6), [], 'tope de crías sin escolta');
  // maxConsumed: si ya comió su tope no hay bocado aunque haya escolta.
  const harto = jefeFalso(ENEMY_TYPES.blobBoss.bossMech);
  escoltaDe(harto.game, harto);
  harto._consumedEscorts = 6;
  const [accion] = tickBossKit(harto, 4);
  assert.equal(accion.kind, 'empty', 'sin presupuesto de bocados vuelve a parir');
});

test('fase 78 — devorar: cura exacto, consume sin matar y abre la exposición', () => {
  const game = mkGame();
  const boss = new Enemy('blobBoss', 270, { game, y: SIEGE_Y });
  game.fortress.enemies.push(boss);
  boss.hp = Math.round(boss.hpMax * 0.5);
  const presas = [escoltaDe(game, boss, 60), escoltaDe(game, boss, 90)];
  boss._updateBossKit(4.1);
  const heal = Math.round(boss.hpMax * 0.015 * presas.length);
  assert.equal(boss.hp, Math.round(boss.hpMax * 0.5) + heal,
    'cura targets × 1,5 % del HP máximo');
  assert.ok(presas.every((e) => e.dead), 'la escolta consumida desaparece');
  assert.equal(game.log.emits.filter(([n]) => n === 'enemy:killed').length, 0,
    'comerse la escolta NO es una baja (no paga score/XP/ultimate)');
  const aviso = game.log.emits.find(([n, p]) => n === 'boss:mechanic' && p.kind === 'devour');
  assert.ok(aviso, 'el bocado se avisa');
  assert.equal(aviso[1].boss, boss);
  // Queda EXPUESTO 2,5 s a la luz ×1,5: el neto es matriz(virus) × ventana.
  assert.deepEqual(boss._expose, { weakTo: 'light', mul: 1.5, until: 2.5 });
  let hp0 = boss.hpDisplay;
  boss.takeDamage(100, 'light');
  assert.equal(hp0 - boss.hpDisplay, 100 * 1.5 * 1.5,
    'luz: ×1,5 de familia ×1,5 de ventana');
  hp0 = boss.hpDisplay;
  boss.takeDamage(100, 'electric');
  assert.equal(hp0 - boss.hpDisplay, 100 * 0.5,
    'la ventana es SÓLO del tipo declarado');
  assert.equal(boss._devourFlash, 0.6, 'y deja el bocado visible');
});

test('fase 78 — devorar: la cura topa en bodyMax y sin escolta pare 1 espora', () => {
  const game = mkGame();
  const boss = new Enemy('blobBoss', 270, { game, y: SIEGE_Y });
  game.fortress.enemies.push(boss);
  boss.hp = boss.bodyMax - 1; // el cuerpo está casi lleno
  escoltaDe(game, boss, 60);
  escoltaDe(game, boss, 90);
  boss._updateBossKit(4.1);
  assert.equal(boss.hp, boss.bodyMax, 'la cura no pasa del tope del cuerpo');
  // Sin escolta: el bocado no cura, pero el jefe pare una espora.
  const game2 = mkGame();
  const solo = new Enemy('blobBoss', 270, { game: game2, y: SIEGE_Y });
  game2.fortress.enemies.push(solo);
  const hp0 = solo.hp;
  solo._updateBossKit(4.1);
  assert.equal(solo.hp, hp0, 'sin escolta no hay vida que recuperar');
  const crias = game2.fortress.enemies.filter((e) => e !== solo);
  assert.equal(crias.length, 1);
  assert.equal(crias[0].type, 'spore');
  assert.equal(crias[0].escortOf, solo, 'la cría queda como escolta del jefe');
  assert.equal(crias[0].fromSpawn, true);
  assert.equal(solo._emptySpawns, 1);
});

// ============================================================
// RESURRECCIÓN (Blob Necrótico): condición y efecto
// ============================================================

test('fase 78 — resurrección: exige escolta viva y una sola vez por pelea', () => {
  assert.equal(bossReviveSpec({}), null, 'sin kit no hay resurrección');
  const game = mkGame();
  const boss = jefeFalso(ENEMY_TYPES.graveBlob.bossMech, game);
  assert.equal(bossReviveSpec(boss), null, 'sin escolta no revive');
  const e1 = escoltaDe(game, boss, 40);
  assert.equal(bossReviveSpec(boss), null, 'con UNA escolta no alcanza (minEscorts 2)');
  escoltaDe(game, boss, 80);
  assert.deepEqual(bossReviveSpec(boss), { hpFrac: 0.3, minEscorts: 2 });
  e1.dead = true;
  assert.equal(bossReviveSpec(boss), null, 'la escolta muerta no cuenta');
  escoltaDe(game, boss, 100);
  assert.ok(bossReviveSpec(boss));
  boss._revived = true;
  assert.equal(bossReviveSpec(boss), null, 'ya usó su resurrección');
  boss._revived = false;
  boss.dead = true;
  assert.equal(bossReviveSpec(boss), null, 'un muerto no revive');
});

test('fase 78 — resurrección: golpe letal con 2 escoltas revive al 30 % sin pagar la baja', () => {
  const game = mkGame();
  const boss = new Enemy('graveBlob', 270, { game, y: SIEGE_Y });
  game.fortress.enemies.push(boss);
  const escoltas = [escoltaDe(game, boss, -60), escoltaDe(game, boss, 60)];
  boss.hp = 1;
  const murio = boss.takeDamage(1e9, 'ballistic');
  assert.equal(murio, false, 'el golpe letal NO lo mata: revive');
  assert.equal(boss.dead, false);
  assert.equal(boss._revived, true);
  assert.equal(boss.hp, Math.round(boss.hpMax * 0.3), 'vuelve con el 30 % del máximo');
  assert.ok(escoltas.every((e) => e.dead), 'se come la escolta que lo sostiene');
  assert.equal(game.log.emits.filter(([n]) => n === 'enemy:killed').length, 0,
    'revivir no paga la baja (score/XP/ultimate)');
  const aviso = game.log.emits.find(([n, p]) => n === 'boss:mechanic' && p.kind === 'revive');
  assert.ok(aviso);
  assert.ok(aviso[1].name.includes('30'));
  assert.equal(boss._phaseIdx, 0, 'la resurrección no dispara fases por sí sola');
  // El SEGUNDO letal sí lo mata, y ahora sí paga la baja.
  boss.hp = 1;
  assert.equal(boss.takeDamage(1e9, 'ballistic'), true);
  assert.equal(boss.dead, true);
  assert.equal(game.log.emits.filter(([n]) => n === 'enemy:killed').length, 1);
});

test('fase 78 — resurrección: sin escolta muere, y el VENENO también lo revive', () => {
  // Sin escolta: muere como cualquier jefe.
  const game = mkGame();
  const solo = new Enemy('graveBlob', 270, { game, y: SIEGE_Y });
  game.fortress.enemies.push(solo);
  solo.hp = 1;
  assert.equal(solo.takeDamage(1e9, 'ballistic'), true);
  assert.equal(solo.dead, true);
  assert.equal(solo._revived, false);
  // Con UNA escolta (minEscorts 2) tampoco.
  const game2 = mkGame();
  const uno = new Enemy('graveBlob', 270, { game: game2, y: SIEGE_Y });
  game2.fortress.enemies.push(uno);
  escoltaDe(game2, uno, 60);
  uno.hp = 1;
  assert.equal(uno.takeDamage(1e9, 'ballistic'), true);
  assert.equal(uno.dead, true);
  // VENENO: el DoT pasa por el MISMO camino de muerte (_resolveHpDepleted).
  const game3 = mkGame();
  const envenenado = new Enemy('graveBlob', 270, { game: game3, y: SIEGE_Y });
  game3.fortress.enemies.push(envenenado);
  escoltaDe(game3, envenenado, -60);
  escoltaDe(game3, envenenado, 60);
  envenenado.hp = 1;
  // Fases ya consumidas: se aísla la resurrección del pulso de regen posterior.
  envenenado._phaseIdx = envenenado.data.phases.length;
  Enemy.poison(envenenado, 1000, 1);
  envenenado.update(0.1);
  assert.equal(envenenado._revived, true, 'un DoT no puede esquivar la resurrección');
  assert.equal(envenenado.dead, false);
  assert.equal(envenenado.hp, Math.round(envenenado.hpMax * 0.3), 'vuelve con el 30 % exacto');
  assert.equal(game3.log.emits.filter(([n]) => n === 'enemy:killed').length, 0);
  assert.ok(game3.log.emits.some(([n, p]) => n === 'boss:mechanic' && p.kind === 'revive'));
});

// ============================================================
// PLACAS + EXPOSICIÓN (Coloso Blindado)
// ============================================================

test('fase 78 — placas: hp/bodyMax exactos y ninguna fase al nacer', () => {
  const game = mkGame();
  const boss = new Enemy('armoredBlob', 270, { game, y: 400 });
  game.fortress.enemies.push(boss);
  const plateMax = Math.round(boss.hpMax * ENEMY_TYPES.armoredBlob.plates.hpFracEach);
  assert.equal(boss.plateCount, 3);
  assert.equal(boss.platesLeft, 3);
  assert.equal(boss.plateMax, plateMax);
  assert.equal(boss.bodyMax, boss.hpMax - 3 * plateMax);
  assert.equal(boss.hp, boss.bodyMax, 'el cuerpo nace con su HP real');
  assert.equal(boss.hpDisplay, boss.hpMax, 'la barra arranca LLENA (cuerpo + placas)');
  // El umbral de fase se mide sobre hpDisplay: al nacer NO se dispara nada.
  boss._updateBossPhases();
  assert.equal(boss._phaseIdx, 0, 'ninguna fase al spawn');
  assert.equal(boss._phase, null);
  assert.equal(game.log.emits.filter(([n]) => n === 'boss:phase2').length, 0);
});

test('fase 78 — placas: la rotura abre exposición al eléctrico y expira sola', () => {
  const game = mkGame();
  const boss = new Enemy('armoredBlob', 270, { game, y: 400 });
  game.fortress.enemies.push(boss);
  const vel0 = boss.vel;
  const murio = boss.takeDamage(boss.plateMax, 'electric');
  assert.equal(murio, false);
  assert.equal(boss.platesLeft, 2);
  assert.equal(boss.plateHp, boss.plateMax, 'la siguiente placa arranca entera');
  assert.equal(boss.hp, boss.bodyMax, 'el cuerpo todavía no sintió el golpe');
  assert.ok(Math.abs(boss.vel - vel0 * 1.06) < 1e-9, 'romper una placa lo acelera');
  const avisos = game.log.emits.filter(([n, p]) => n === 'boss:mechanic' && p.kind === 'plate');
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0][1].title, '¡CORAZA ROTA!');
  assert.ok(avisos[0][1].rule.includes('ELÉCTRICO'));
  assert.equal(bossMechLabel(boss), 'PLACAS 2/3');
  // La ventana: eléctrico ×1,5 (matriz roca ×1) por 3 s.
  assert.equal(bossExposeMul(boss, 'electric'), 1.5);
  assert.equal(bossExposeMul(boss, 'light'), 1);
  let hp0 = boss.hpDisplay;
  boss.takeDamage(100, 'electric');
  assert.equal(hp0 - boss.hpDisplay, 150, 'el eléctrico pega ×1,5');
  hp0 = boss.hpDisplay;
  boss.takeDamage(100, 'light');
  assert.equal(hp0 - boss.hpDisplay, 50, 'la ventana NO aplica a otros tipos');
  boss.t += 3.01;
  assert.equal(bossExposeMul(boss, 'electric'), 1, 'la ventana expira');
  hp0 = boss.hpDisplay;
  boss.takeDamage(100, 'electric');
  assert.equal(hp0 - boss.hpDisplay, 100, 'sin ventana el eléctrico pega ×1');
  // Un golpe grande rompe las 3 placas y avisa una vez por cada una.
  const game2 = mkGame();
  const otro = new Enemy('armoredBlob', 270, { game: game2, y: 400 });
  game2.fortress.enemies.push(otro);
  otro.takeDamage(5000, 'electric');
  assert.equal(otro.platesLeft, 0);
  assert.equal(game2.log.emits.filter(([n, p]) => p?.kind === 'plate').length, 3);
});

test('fase 78 — placas: la regen del jefe topa en bodyMax (no "cura" las placas)', () => {
  const game = mkGame();
  const boss = new Enemy('armoredBlob', 270, { game, y: 400 });
  game.fortress.enemies.push(boss);
  escoltaDe(game, boss, 60);
  boss._phase = { regen: 0.008 };
  boss.hp = boss.bodyMax - 1;
  boss._updateBossRegen(10);
  assert.equal(boss.hp, boss.bodyMax, 'la cura se corta en el cuerpo');
  assert.equal(boss.plateHp, boss.plateMax, 'las placas no se curan');
  assert.ok(boss.hp < boss.hpMax, 'y jamás sube al HP total del jefe');
});

// ============================================================
// METAMORFOSIS (Abominación Híbrida): familia activa y blink
// ============================================================

test('fase 78 — metamorfosis: la familia activa cambia y con ella el daño', () => {
  const game = mkGame();
  const boss = new Enemy('hybridBoss', 270, { game, y: 400 });
  game.fortress.enemies.push(boss);
  assert.equal(boss.activeFamily, 'rock', 'nace con la familia del tipo');
  let hp0 = boss.hpDisplay;
  boss.takeDamage(100, 'light');
  assert.equal(hp0 - boss.hpDisplay, 50, 'roca recibe luz ×0,5');
  // Cruza el 66 %: la fase 1 declara family crystal.
  boss.hp = Math.round(boss.hpMax * 0.6);
  boss._updateBossPhases();
  assert.equal(boss._phaseIdx, 1);
  assert.equal(boss.activeFamily, 'crystal', 'la familia VIGENTE sigue a la fase');
  assert.equal(boss.family, 'crystal');
  assert.equal(boss.data.family, 'rock', 'el dato del tipo no se muta');
  assert.ok(boss._morphT > 0, 'la metamorfosis deja pulso visual');
  assert.ok(game.log.emits.some(([n]) => n === 'boss:phase2'));
  hp0 = boss.hpDisplay;
  boss.takeDamage(100, 'light');
  assert.equal(hp0 - boss.hpDisplay, 150,
    'cristal + debilidad de fase: ×1,5 (NO el ×0,75 de la roca)');
  // La fase 2 vuelve a cambiar la familia (crystal → virus).
  boss.hp = Math.round(boss.hpMax * 0.3);
  boss._updateBossPhases();
  assert.equal(boss.activeFamily, 'virus');
  hp0 = boss.hpDisplay;
  boss.takeDamage(100, 'ballistic');
  assert.equal(hp0 - boss.hpDisplay, 50, 'virus resiste balístico ×0,5');
});

test('fase 78 — metamorfosis: blink mueve al jefe a otra columna dentro del campo', () => {
  const game = mkGame();
  const boss = new Enemy('hybridBoss', 270, { game, y: 400 });
  game.fortress.enemies.push(boss);
  boss.hp = Math.round(boss.hpMax * 0.6);
  boss._updateBossPhases(); // fase con family crystal → onBossMorph pide blink
  const margin = Math.min(CONFIG.CANVAS_W / 2, boss.r + 12);
  assert.ok(boss.x >= margin && boss.x <= CONFIG.CANVAS_W - margin,
    `el blink tiene que quedar dentro del campo (x=${boss.x})`);
  assert.equal(boss.entryX, boss.x, 'las anclas siguen al blink');
  assert.equal(boss.baseX, boss.x);
  assert.equal(boss._sweepAcc, 0);
  assert.equal(boss._wander, 0);
  // El módulo: sólo el dato con blink:true teletransporta.
  assert.equal(onBossMorph({ _bossKit: { morph: { blink: true } }, _morphT: 0 }), true);
  assert.equal(onBossMorph({ _bossKit: { morph: { blink: false } }, _morphT: 0 }), false);
  assert.equal(onBossMorph({}), false, 'sin kit no hay pulso ni blink');
  // Muchos blinks: SIEMPRE dentro del campo (nunca fuera del canvas).
  const xs = [];
  for (let i = 0; i < 20; i++) { boss.x = 270; boss._bossBlink(); xs.push(boss.x); }
  assert.ok(xs.every((x) => x >= margin && x <= CONFIG.CANVAS_W - margin),
    `blink fuera del campo: ${xs.join(', ')}`);
});

// ============================================================
// EXPOSICIÓN: ventana de daño (módulo puro)
// ============================================================

test('fase 78 — exposición: sólo el tipo declarado, expira por reloj y no apila', () => {
  const boss = { _bossKit: {}, _expose: null, t: 0 };
  assert.equal(setBossExpose(boss, { seconds: 2, weakTo: 'light', mul: 1.5 }), true);
  assert.equal(bossExposeMul(boss, 'light'), 1.5);
  assert.equal(bossExposeMul(boss, 'electric'), 1);
  assert.equal(bossExposeMul(boss, undefined), 1);
  // Refrescar la MISMA ventana no apila: gana el fin más lejano y el mul mayor.
  setBossExpose(boss, { seconds: 2, weakTo: 'light', mul: 1.2 });
  assert.deepEqual(boss._expose, { weakTo: 'light', mul: 1.5, until: 2 });
  boss.t = 1.99;
  assert.equal(bossExposeMul(boss, 'light'), 1.5);
  boss.t = 2.5;
  assert.equal(bossExposeMul(boss, 'light'), 1, 'pasado `until` la ventana no existe');
  assert.equal(bossMechLabel(boss), null);
  // Specs inválidas no abren nada.
  assert.equal(setBossExpose(boss, { seconds: 2, mul: 2 }), false);
  assert.equal(setBossExpose(boss, null), false);
  assert.equal(setBossExpose(null, { seconds: 2, weakTo: 'light', mul: 1.5 }), false);
  // El multiplicador mínimo es > 1: una "ventana de debilidad" no expone.
  const flojo = { _bossKit: {}, _expose: null, t: 0 };
  setBossExpose(flojo, { seconds: 1, weakTo: 'light', mul: 0.5 });
  assert.equal(bossExposeMul(flojo, 'light'), 1.01);
});

test('fase 78 — onBossPlateBroken: payload del aviso y null sin plateExpose', () => {
  const boss = {
    _bossKit: { plateExpose: { seconds: 3, weakTo: 'electric', mul: 1.5 } },
    t: 0, platesLeft: 2,
  };
  assert.deepEqual(onBossPlateBroken(boss), {
    kind: 'plate', left: 2, weakTo: 'electric', mul: 1.5, seconds: 3,
  });
  assert.ok(boss._expose, 'la rotura abre la ventana de exposición');
  assert.equal(bossExposeMul(boss, 'electric'), 1.5);
  // Sin plateExpose (o sin kit) la rotura no abre nada.
  assert.equal(onBossPlateBroken({ _bossKit: {} }), null);
  assert.equal(onBossPlateBroken({}), null);
  assert.equal(onBossPlateBroken(null), null);
});

// ============================================================
// ETIQUETA DEL HUD: bossMechLabel
// ============================================================

test('fase 78 — bossMechLabel: prioridad placas → resurrección → expuesto', () => {
  const base = {
    _bossKit: {}, platesLeft: 0, plateCount: 0,
    _reviveReady: false, _revived: false, t: 0,
  };
  assert.equal(bossMechLabel({ ...base }), null);
  const conTodo = {
    ...base, platesLeft: 2, plateCount: 3, _reviveReady: true,
    _expose: { weakTo: 'light', mul: 1.5, until: 5 },
  };
  assert.equal(bossMechLabel(conTodo), 'PLACAS 2/3', 'las placas mandan');
  const revivible = { ...base, _reviveReady: true, _expose: { weakTo: 'light', mul: 1.5, until: 5 } };
  assert.equal(bossMechLabel(revivible), 'VA A RESUCITAR');
  assert.equal(bossMechLabel({ ...revivible, _revived: true }), 'EXPUESTO');
  assert.equal(bossMechLabel({ ...base, _expose: { weakTo: 'light', mul: 1.5, until: 5 } }), 'EXPUESTO');
  assert.equal(bossMechLabel({ ...base, _expose: { weakTo: 'light', mul: 1.5, until: 5 }, t: 5 }), null);
  assert.equal(bossMechLabel({ _bossKit: null }), null);
  assert.equal(bossMechLabel(null), null);
});

test('fase 78 — bossMechLabel lee el estado REAL del Enemy', () => {
  const game = mkGame();
  const blindado = new Enemy('armoredBlob', 270, { game, y: 400 });
  game.fortress.enemies.push(blindado);
  assert.equal(bossMechLabel(blindado), 'PLACAS 3/3');
  blindado.takeDamage(blindado.plateMax, 'electric');
  assert.equal(bossMechLabel(blindado), 'PLACAS 2/3');
  // Resurrección lista: lo decide el tick del kit, no el dibujo.
  const game2 = mkGame();
  const necr = new Enemy('graveBlob', 270, { game: game2, y: SIEGE_Y });
  game2.fortress.enemies.push(necr);
  escoltaDe(game2, necr, -60);
  escoltaDe(game2, necr, 60);
  assert.notEqual(bossMechLabel(necr), 'VA A RESUCITAR', 'todavía no lo evaluó el tick');
  necr._updateBossKit(0.1);
  assert.equal(bossMechLabel(necr), 'VA A RESUCITAR');
  // Bocado: queda EXPUESTO.
  const game3 = mkGame();
  const rey = new Enemy('blobBoss', 270, { game: game3, y: SIEGE_Y });
  game3.fortress.enemies.push(rey);
  escoltaDe(game3, rey, 60);
  rey._updateBossKit(4.1);
  assert.equal(bossMechLabel(rey), 'EXPUESTO');
  rey.t += 3;
  assert.equal(bossMechLabel(rey), null, 'la ventana expira y la barra se limpia');
});

// ============================================================
// DIBUJO: pase del kit con contexto simulado
// ============================================================

test('fase 78 — drawBossKit dibuja sin tirar y sin tocar la simulación', () => {
  const game = mkGame();
  const casos = JEFES.map((type) => new Enemy(type, 270, { game, y: 400 }));
  // Encender las cinco ramas visuales del pase.
  casos[0]._expose = { weakTo: 'light', mul: 1.5, until: 10 }; // aro de exposición
  casos[1]._devourFlash = 0.3;                                // boca del devorar
  casos[2]._reviveReady = true;                                // doble aro de revive
  casos[3].takeDamage(575, 'electric');                        // placas + exposición
  casos[4]._morphT = 0.5;                                      // onda de metamorfosis
  for (const boss of casos) {
    const antes = fotoSimulacion(boss);
    const ctx = mkCtx();
    assert.doesNotThrow(() => drawBossKit(ctx, boss), `drawBossKit falló con ${boss.type}`);
    assert.equal(ctx.saveCount, ctx.restoreCount, `${boss.type}: save/restore desbalanceado`);
    assert.ok(ctx.strokes > 0, `${boss.type}: no dibujó nada`);
    assert.deepEqual(fotoSimulacion(boss), antes, `${boss.type}: el dibujo mutó la simulación`);
  }
});

test('fase 78 — la boca del devorar se dibuja SOBRE el cuerpo (no queda tapada)', () => {
  // Regresión de orden: drawBossKit se llamaba ANTES del cuerpo. La boca
  // del devorar (radio 0,55-0,9 r) queda dentro de la silueta y el fill
  // opaco del blob la tapaba por completo.
  const game = mkGame();
  const boss = new Enemy('blobBoss', 270, { game, y: SIEGE_Y });
  boss._devourFlash = 0.3; // k = 0,5 → radio 0,725 r (dentro del cuerpo)
  const ctx = mkCtx();
  boss.draw(ctx);
  const r = boss.r;
  // El cuerpo es el círculo del blob (r ± el pulso del 6 %). Los "cromas"
  // de la estela también son arcos de 0,5-0,7 r, pero se RELLENAN; la boca
  // del devorar es el único arco de ese radio que se STROKEA.
  const body = ctx.ops.findIndex((o) => o.op === 'arc'
    && o.r >= r * 0.9 && o.r <= r * 1.1);
  const mouth = ctx.ops.findIndex((o, i) => o.op === 'arc'
    && o.r >= r * 0.55 && o.r <= r * 0.9 && ctx.ops[i + 1]?.op === 'stroke');
  assert.ok(body >= 0, 'el cuerpo se tiene que dibujar');
  assert.ok(mouth >= 0, `la boca del devorar se tiene que dibujar (r=${r})`);
  assert.ok(mouth > body,
    'la boca tiene que dibujarse DESPUÉS del cuerpo para no quedar tapada');
});

test('fase 78 — drawBossKit no hace nada sin ctx, sin kit o con el jefe muerto', () => {
  const game = mkGame();
  const boss = new Enemy('armoredBlob', 270, { game, y: 400 });
  assert.doesNotThrow(() => drawBossKit(null, boss));
  assert.doesNotThrow(() => drawBossKit(undefined, boss));
  const ctx = mkCtx();
  drawBossKit(ctx, null);
  drawBossKit(ctx, new Enemy('meteor', 100, { game, y: 300 }));
  assert.equal(ctx.strokes, 0, 'un tipo sin kit no pinta nada');
  const muerto = new Enemy('boss', 270, { game, y: 400 });
  muerto.dead = true;
  const ctx2 = mkCtx();
  drawBossKit(ctx2, muerto);
  assert.equal(ctx2.strokes, 0, 'un jefe muerto no se dibuja');
  assert.equal(ctx2.saveCount, 0, 'ni siquiera abre el contexto');
});

// ============================================================
// Sin mundo: los jefes existen aunque no haya game/engine
// ============================================================

test('fase 78 — sin game/engine: los 5 jefes se construyen, tickean y actualizan sin romper', () => {
  for (const type of JEFES) {
    const boss = new Enemy(type, 270, { y: SIEGE_Y });
    assert.ok(boss._bossKit, `${type}: el kit existe aunque no haya mundo`);
    assert.doesNotThrow(() => boss._updateBossKit(10), `${type}: tick sin engine`);
    assert.doesNotThrow(() => boss.update(0.1), `${type}: update sin game`);
    assert.equal(boss.dead, false);
    assert.ok(boss.hp > 0);
    assert.doesNotThrow(() => bossMechLabel(boss));
    assert.doesNotThrow(() => drawBossKit(mkCtx(), boss));
  }
});
