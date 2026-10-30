// tests/test-player.mjs — dev-7 fase 12
// Cubre player.js: Fortress, el gating del Black Hole (antes cargaba
// desde el arranque de la partida sin que el jugador pidiera nada; ahora
// exige desbloquearlo con una carta — ver cards.js 'black_hole') y el
// VISUAL de la base (anillo de escudo segmentado, núcleo y encaje de
// los slots vacíos).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Fortress,
  LEAK_INVULN_MULT,
  ARC_R,
  SHIELD_SEGMENTS,
  hpFraction,
  shieldTone,
  shieldSegments,
  shieldAliveCount,
} from '../js/player.js';
import { CONFIG } from '../js/engine.js';
import { GUARDIAN_SLOT } from '../js/towers.js';
import { healBase } from '../js/base-heal.js';

function makeGame() {
  const game = {
    engine: {
      emit() {}, addEntity() {},
      setDeckSlotCount(n) { this.deckSlots = n; },
    },
    audio: { sfx() {} },
  };
  game.fortress = new Fortress(game);
  return game;
}

// ------------------------------------------------------------
// Doble de canvas: registra lo que se dibuja para poder verificar el
// anillo de escudo sin navegador (mismo patrón que el resto de la
// suite: el render es canvas, pero los cálculos van por helpers puros).
// ------------------------------------------------------------
function makeCtx() {
  const calls = { arcs: [], text: [], strokes: 0, fittings: 0 };
  let conMoveTo = false;
  const ctx = {
    calls,
    globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1,
    lineCap: 'butt', lineJoin: 'miter', font: '', textAlign: 'left',
    textBaseline: 'alphabetic', shadowColor: '', shadowBlur: 0,
    save() {}, restore() {}, closePath() {},
    beginPath() { conMoveTo = false; },
    moveTo() { conMoveTo = true; },
    lineTo() {}, rect() {}, clip() {},
    ellipse() {}, arcTo() {}, roundRect() {},
    quadraticCurveTo() {}, bezierCurveTo() {}, setLineDash() {},
    arc(x, y, r) { calls.arcs.push({ x, y, r, shadow: ctx.shadowBlur, stroke: ctx.strokeStyle }); },
    fill() {},
    stroke() {
      calls.strokes++;
      // fase 60: el ENCAJE de un slot vacío es un trazo a 1.5 con
      // lineCap 'butt' compuesto por moveTo/lineTo (4 esquinas en L). El
      // `conMoveTo` es lo que lo distingue de los TICKS del pad, que
      // también van a 1.5 cuando están apagados pero se dibujan con
      // ellipse() (sin moveTo). Contarlo aparte permite verificar "el
      // slot ocupado deja de dibujar su encaje" sin depender del total de
      // trazos, que ahora incluye el rig de la torre.
      if (conMoveTo && ctx.lineWidth === 1.5 && ctx.lineCap === 'butt') calls.fittings++;
      conMoveTo = false;
    },
    fillRect() {}, strokeRect() {}, clearRect() {},
    translate() {}, rotate() {}, scale() {}, setTransform() {},
    fillText(t) { calls.text.push(String(t)); },
    strokeText(t) { calls.text.push(String(t)); },
    measureText: (t) => ({ width: String(t).length * 8 }),
    drawImage() {},
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
  };
  return ctx;
}

/** Cuenta los segmentos del anillo (radio ARC_R) vivos (con glow) y rotos. */
function countSegments(ctx) {
  const seg = ctx.calls.arcs.filter((a) => Math.abs(a.r - ARC_R) < 0.5);
  return {
    alive: seg.filter((a) => a.shadow > 0).length,
    dead: seg.filter((a) => a.shadow === 0).length,
  };
}

test('Fortress: Black Hole arranca bloqueado y sin carga', () => {
  const { fortress } = makeGame();
  assert.equal(fortress.blackHoleUnlocked, false);
  assert.equal(fortress.blackHoleCharge, 0);
  assert.equal(fortress.canFireBlackHole(), false);
});

test('chargeBlackHole: no acumula nada mientras esté bloqueado (regresión fase 12)', () => {
  const { fortress } = makeGame();
  for (let i = 0; i < 50; i++) fortress.chargeBlackHole(1);
  assert.equal(fortress.blackHoleCharge, 0);
  assert.equal(fortress.bhReady, false);
});

test('chargeBlackHole: sí acumula una vez desbloqueado', () => {
  const { fortress } = makeGame();
  fortress.blackHoleUnlocked = true;
  fortress.chargeBlackHole(1);
  assert.ok(fortress.blackHoleCharge > 0);
});

test('canFireBlackHole: false si está desbloqueado pero no lleno', () => {
  const { fortress } = makeGame();
  fortress.blackHoleUnlocked = true;
  fortress.chargeBlackHole(1);
  assert.equal(fortress.canFireBlackHole(), false);
});

test('fireBlackHole: no dispara sin desbloquear aunque se fuerce el medidor lleno', () => {
  const game = makeGame();
  game.fortress.blackHoleCharge = 1;
  game.fortress.bhReady = true; // simula un estado corrupto/viejo sin unlock
  assert.equal(game.fortress.fireBlackHole(game), false);
});

test('fireBlackHole: dispara y resetea el medidor una vez desbloqueado y lleno', () => {
  const game = makeGame();
  game.fortress.blackHoleUnlocked = true;
  game.fortress.blackHoleCharge = 1;
  game.fortress.bhReady = true;
  assert.equal(game.fortress.fireBlackHole(game), true);
  assert.equal(game.fortress.blackHoleCharge, 0);
  assert.equal(game.fortress.bhReady, false);
});

// ------------------------------------------------------------
// Daño de leak: la invuln post-hit ya NO anula el golpe — cada enemigo
// que llega inflige SIEMPRE daño; durante la invuln se aplica el factor
// LEAK_INVULN_MULT.
// dev-7 fase 59: el tope por bicho (`LEAK_DMG_CAP = 50`) se RETIRÓ. El
// golpe vale el HP restante REAL del enemigo (el "RBE" de Bloons TD): un
// tanque que se escapa duele lo que vale y un mortero que llega muerto
// duele casi nada. Con el tope plano la base era una esponja: había que
// filtrar más del 100 % de los enemigos del stage para tumbararla desde
// el S20 (S50: 550 fugas para 231 enemigos = 239 %).
// ------------------------------------------------------------

test('takeDamage: el segundo golpe dentro de la invuln SÍ aplica daño (no más golpes gratis por clúster)', () => {
  const { fortress } = makeGame();
  fortress.maxHp = 1000;
  fortress.hp = 1000;
  fortress.takeDamage(30);
  assert.equal(fortress.hp, 970);
  assert.ok(fortress.invuln > 0, 'el primer golpe debe haber dejado la invuln activa');
  // Segundo golpe dentro de la ventana: antes devolvía false y no dañaba;
  // ahora aplica el resto (LEAK_INVULN_MULT actualmente 1.0).
  const ret = fortress.takeDamage(30);
  assert.equal(ret, true, 'el golpe dentro de la invuln NO puede anularse');
  assert.equal(fortress.hp, 970 - Math.round(30 * LEAK_INVULN_MULT));
});

test('takeDamage (fase 59): la fuga vale el HP restante REAL, sin tope', () => {
  const { fortress } = makeGame();
  fortress.maxHp = 5000;
  fortress.hp = 5000;
  fortress.invuln = 0;
  // Un tanque que llega con 1200 de HP se lleva 1200 (antes: 50).
  fortress.takeDamage(1200);
  assert.equal(fortress.hp, 5000 - 1200, 'la fuga debe costar el HP restante del enemigo');
});

test('takeDamage (fase 59): un enemigo casi muerto se escapa barato', () => {
  const { fortress } = makeGame();
  fortress.maxHp = 5000;
  fortress.hp = 5000;
  fortress.invuln = 0;
  fortress.takeDamage(7);
  assert.equal(fortress.hp, 4993, 'matar casi todo el enemigo antes de que llegue lo abarata');
});

test('takeDamage (fase 59): el ESCUDO DE BASE bloquea el golpe completo', () => {
  const { fortress } = makeGame();
  fortress.maxHp = 5000;
  fortress.hp = 5000;
  fortress.invuln = 0;
  fortress.baseShields = 1;
  fortress.takeDamage(1200);
  assert.equal(fortress.hp, 5000, 'el Escudo de Base no deja entrar el daño');
  assert.equal(fortress.baseShields, 0, 'el escudo se consume');
});

test('takeDamage: daños íntegros se respetan', () => {
  const { fortress } = makeGame();
  fortress.maxHp = 1000;
  fortress.hp = 1000;
  fortress.invuln = 0;
  fortress.takeDamage(10);
  assert.equal(fortress.hp, 990);
});

test('takeDamage (fase 75): un NaN no deja la base inmortal', () => {
  const { fortress } = makeGame();
  fortress.maxHp = 1000;
  fortress.hp = 1000;
  assert.equal(fortress.takeDamage(NaN), false);
  assert.equal(fortress.hp, 1000, 'el HP debe quedar intacto');
  assert.equal(fortress.takeDamage(Infinity), false);
  assert.equal(fortress.hp, 1000);
});

test('healBase (fase 75): no revive una base en 0 y respeta el máximo', () => {
  const game = makeGame();
  game.fortress.hp = 0;
  assert.equal(healBase(game, 100), 0, 'una base destruida no se resucita');
  assert.equal(game.fortress.hp, 0);
  game.fortress.maxHp = 100;
  game.fortress.hp = 90;
  assert.equal(healBase(game, 100), 10, 'cura solo el faltante');
  assert.equal(game.fortress.hp, game.fortress.maxHp);
});

test('takeDamage (fase 69, Asedio): leakMul multiplica el daño de fuga', () => {
  const game = makeGame();
  game.runMods = { leakMul: 2 };
  const { fortress } = game;
  fortress.maxHp = 1000;
  fortress.hp = 1000;
  fortress.invuln = 0;
  fortress.takeDamage(30);
  assert.equal(fortress.hp, 940, 'con Asedio la misma fuga duele el doble');
  // Sin runMods la base recibe el daño de siempre (heat 0, fase 68 exacta).
  const { fortress: base } = makeGame();
  base.maxHp = 1000;
  base.hp = 1000;
  base.invuln = 0;
  base.takeDamage(30);
  assert.equal(base.hp, 970);
});

// ------------------------------------------------------------
// fase 69 — condición ARSENAL: una ranura menos (slots/_slotGeom
// coherentes). El recorte ocurre ANTES de colocar torres (startStage).
// ------------------------------------------------------------

test('dropLastSlot (Arsenal): deja 4 slots con geometría y tope coherentes', () => {
  const game = makeGame();
  const { fortress } = game;
  assert.equal(fortress.dropLastSlot(), true);
  assert.equal(fortress.slots.length, 4);
  assert.equal(fortress._slotGeom.length, 4, 'la tabla de bahías encoge con los slots');
  assert.equal(fortress._frontCount, 4);
  assert.equal(game.engine.deckSlots, 4, 'el deck deja de dibujar la bahía recortada');
  // El tope real baja a 4: la quinta torre ya no tiene dónde entrar.
  for (let i = 0; i < 4; i++) fortress.addTower('guardian');
  assert.equal(fortress.slots.filter(Boolean).length, 4);
  assert.equal(fortress.addTower('guardian'), null, 'no hay una quinta ranura');
});

test('fase 75: relayout reconstruye la geometría y mueve las torres', () => {
  const { fortress } = makeGame();
  const t = fortress.addTower('guardian', 2);
  const oldY = CONFIG.TOWER_Y;
  try {
    CONFIG.TOWER_Y = oldY + 120;
    fortress.relayout();
    assert.equal(t.y, CONFIG.TOWER_Y, 'la torre debe seguir a la plataforma');
    assert.equal(fortress._slotGeom[2].y, CONFIG.TOWER_Y, 'la bahía también');
  } finally {
    CONFIG.TOWER_Y = oldY;
    fortress.relayout();
  }
  assert.equal(t.y, oldY, 'al volver el layout, la torre vuelve a su fila');
});

test('dropLastSlot: no quita una ranura ocupada ni la última', () => {
  const { fortress } = makeGame();
  fortress.addTower('guardian', 4); // la última ranura, ocupada
  assert.equal(fortress.dropLastSlot(), false);
  assert.equal(fortress.slots.length, 5, 'no se recorta bajo una torre');

  const sola = makeGame().fortress;
  while (sola._frontCount > 1) sola.dropLastSlot();
  assert.equal(sola.slots.length, 1);
  assert.equal(sola.dropLastSlot(), false, 'la base no puede quedarse sin ranuras');
  assert.equal(sola.slots.length, 1);
  assert.equal(sola._slotGeom.length, 1);
});

// ------------------------------------------------------------
// Visual de la base: anillo de escudo segmentado (helper puro),
// núcleo/encaje sin excepciones y coherencia con las torres.
// ------------------------------------------------------------

test('shieldSegments: al 100 % de HP todos los segmentos están vivos', () => {
  const seg = shieldSegments(1000, 1000);
  assert.equal(seg.length, SHIELD_SEGMENTS);
  assert.ok(seg.every((s) => s === true), 'con la base intacta no hay segmentos rotos');
});

test('shieldSegments: al 50 % de HP queda la mitad encendida y se apaga desde un extremo', () => {
  const seg = shieldSegments(500, 1000);
  assert.equal(seg.length, SHIELD_SEGMENTS);
  const vivos = seg.filter(Boolean).length;
  assert.equal(vivos, SHIELD_SEGMENTS / 2, 'la mitad de los segmentos sigue vivo');
  // El anillo se vacía desde un extremo: los vivos son contiguos.
  const primeros = seg.indexOf(false);
  assert.ok(primeros > 0, 'debe haber un tramo apagado');
  assert.ok(seg.slice(primeros).every((s) => s === false), 'el tramo apagado es contiguo');
});

test('shieldSegments: al 0 % de HP no queda ningún segmento vivo', () => {
  const seg = shieldSegments(0, 1000);
  assert.equal(seg.length, SHIELD_SEGMENTS);
  assert.ok(seg.every((s) => s === false));
});

test('shieldSegments: helper puro — mismos inputs, mismo output, tamaño esperado', () => {
  const a = shieldSegments(750, 1000);
  const b = shieldSegments(750, 1000);
  assert.deepEqual(a, b, 'mismo input → mismo output');
  assert.notEqual(a, b, 'devuelve un array nuevo (no comparte estado)');
  assert.equal(a.length, SHIELD_SEGMENTS);
  assert.equal(shieldSegments(750, 1000, 8).length, 8, 'el tamaño es parametrizable');
  assert.equal(shieldAliveCount(750, 1000, 8), 6);
});

test('shieldSegments: casos borde (maxHp = 0, hp > maxHp, NaN) no rompen nada', () => {
  // maxHp = 0 → nada vivo y NINGÚN NaN.
  const sinMax = shieldSegments(500, 0);
  assert.equal(sinMax.length, SHIELD_SEGMENTS);
  assert.ok(sinMax.every((s) => s === false));
  assert.ok(!Number.isNaN(hpFraction(500, 0)));

  // hp > maxHp → se satura en 100 %.
  const sobrecarga = shieldSegments(5000, 1000);
  assert.ok(sobrecarga.every((s) => s === true));

  // NaN / negativos → 0, sin excepción ni NaN.
  const basura = shieldSegments(NaN, 1000);
  assert.equal(basura.length, SHIELD_SEGMENTS);
  assert.ok(basura.every((s) => s === false));
  assert.equal(hpFraction(-50, 1000), 0);
  assert.equal(hpFraction(500, NaN), 0);
  // count inválido → array vacío (nunca índice fuera de rango).
  assert.deepEqual(shieldSegments(1000, 1000, 0), []);
  assert.deepEqual(shieldSegments(1000, 1000, -3), []);
});

test('shieldTone: el estado del escudo cambia con el porcentaje de HP', () => {
  assert.equal(shieldTone(1), 'ok');
  assert.equal(shieldTone(0.5), 'ok');
  assert.equal(shieldTone(0.49), 'warn');
  assert.equal(shieldTone(0.25), 'warn');
  assert.equal(shieldTone(0.24), 'crit');
  assert.equal(shieldTone(0), 'crit');
});

test('Fortress: el estado del anillo sigue al HP de la fortaleza', () => {
  const { fortress } = makeGame();
  assert.ok(fortress.shieldSegmentState().every((s) => s === true));
  fortress.hp = fortress.maxHp / 2;
  assert.equal(fortress.shieldSegmentState().filter(Boolean).length, SHIELD_SEGMENTS / 2);
  fortress.hp = 0;
  assert.ok(fortress.shieldSegmentState().every((s) => s === false));
});

test('render: el anillo dibujado refleja el HP (segmentos vivos vs rotos)', () => {
  const { fortress } = makeGame();

  const ctxFull = makeCtx();
  fortress.render(ctxFull);
  const full = countSegments(ctxFull);
  assert.equal(full.alive, SHIELD_SEGMENTS, 'con el HP completo están todos encendidos');
  assert.equal(full.dead, 0);

  fortress.hp = fortress.maxHp / 2;
  const ctxHalf = makeCtx();
  fortress.render(ctxHalf);
  const half = countSegments(ctxHalf);
  assert.equal(half.alive, SHIELD_SEGMENTS / 2, 'la mitad de los segmentos sigue con glow');
  assert.equal(half.dead, SHIELD_SEGMENTS / 2, 'la otra mitad queda apagada');

  fortress.hp = 0;
  const ctxDead = makeCtx();
  fortress.render(ctxDead);
  const dead = countSegments(ctxDead);
  assert.equal(dead.alive, 0, 'sin HP no queda ningún segmento encendido');
  assert.equal(dead.dead, SHIELD_SEGMENTS);
});

test('render: el núcleo y el encaje de los slots no lanzan excepciones en Node', () => {
  const { fortress } = makeGame();
  const ctx = makeCtx();
  assert.doesNotThrow(() => fortress.render(ctx));
  // El número de HP se dibuja (contorno oscuro + relleno) y los slots
  // vacíos marcan el encaje (trazos, no manchas).
  assert.ok(ctx.calls.text.includes('3000'), 'el número de HP se dibuja');
  assert.ok(ctx.calls.strokes >= 3, 'anillo, encajes de los slots y núcleo se dibujan');
});

test('render: con el slot ocupado no se dibuja su encaje', () => {
  const { fortress } = makeGame();
  const vacio = makeCtx();
  fortress.render(vacio);
  // fase 60: el encaje se cuenta por su firma propia (trazo a 1.5 con
  // lineCap butt), no por el TOTAL de trazos: el render de una torre
  // también traza (rim light del rig, ticks del pad), así que el total
  // sube al ocupar el slot y no sirve como señal.
  const encajesVacio = vacio.calls.fittings;
  assert.ok(encajesVacio >= 1, 'con slots libres hay encajes dibujados');

  fortress.addTower('guardian', 2);
  const ocupado = makeCtx();
  fortress.render(ocupado);
  assert.equal(encajesVacio - ocupado.calls.fittings, 1,
    'un slot ocupado deja de dibujar SU encaje (y solo el suyo)');
});

test('el núcleo de la base no se solapa con las torres de la fila frontal', () => {
  const { fortress } = makeGame();
  // Las torres frontales están en CONFIG.TOWER_Y y su cuerpo arranca
  // ~56 px por encima del origen; el halo del núcleo no debe llegar.
  const geom = fortress._slotGeom;
  const frontal = geom[2]; // slot central = BASE_X
  assert.equal(frontal.x, 270, 'el slot central está bajo la base');
  const topeNucleo = 710 + 44;   // BASE_ARC_Y + radio máximo del halo
  assert.ok(topeNucleo < frontal.y - 35,
    `el halo del núcleo (hasta ${topeNucleo}) no puede tocar el cuerpo de la torre (${frontal.y - 35})`);
});


// ------------------------------------------------------------
// fase 61 — 5 SLOTS EN UNA FILA
// ------------------------------------------------------------

test('fase 61: la plataforma tiene 5 slots, todos en la misma fila', () => {
  const { fortress } = makeGame();
  assert.equal(fortress.slots.length, 5, '5 lugares de construcción');
  const ys = new Set(fortress._slotGeom.map((g) => g.y));
  assert.equal(ys.size, 1, 'todos los slots están a la misma altura (no hay fila trasera)');
  assert.equal([...ys][0], CONFIG.TOWER_Y);
  // El del centro coincide con el eje de la base (donde va el Guardian).
  assert.equal(fortress._slotGeom[2].x, CONFIG.BASE_X);
});

test('fase 61: el arsenal extendido cae en el primer slot libre (ya no hay fila trasera)', () => {
  const { fortress } = makeGame();
  // El mortero no tiene slot canónico: antes iba a la fila trasera, ahora
  // al primer lugar libre de la única fila.
  const mortero = fortress.addTower('mortar');
  assert.ok(mortero, 'el mortero entra');
  assert.equal(mortero.slotIndex, 0, 'cae en el primer slot libre');
  assert.equal(mortero.y, CONFIG.TOWER_Y, 'en la misma fila que el resto');
  // Y los 5 se llenan sin huecos.
  for (const t of ['missile', 'beam', 'thunderstroke', 'tesla']) fortress.addTower(t);
  assert.equal(fortress.slots.filter(Boolean).length, 5);
  assert.equal(fortress.addTower('gauss'), null, 'el sexto no entra');
});

test('fase 63: NINGUNA torre tiene lugar predeterminado — todas caen en el primer slot libre', () => {
  // Antes cada tipo tenía un slot canónico (el Beam siempre contra el borde
  // derecho, el Missile a la izquierda, el Thunderstroke junto al centro…),
  // herencia del diseño base. Con un arsenal libre eso era una
  // promesa falsa: la torre aparecía siempre en el mismo sitio.
  const { fortress } = makeGame();
  const orden = ['beam', 'missile', 'tesla', 'thunderstroke', 'guardian'];
  const puestos = orden.map((t) => {
    const x = fortress.addTower(t);
    return x ? `${t}@${x.slotIndex}` : `${t}=NO`;
  });
  assert.deepEqual(puestos,
    ['beam@0', 'missile@1', 'tesla@2', 'thunderstroke@3', 'guardian@4'],
    'las torres tienen que llenar los slots por ORDEN DE LLEGADA, sin canónicos');
  assert.equal(fortress.slots.filter(Boolean).length, 5);
  assert.equal(fortress.addTower('laser'), null, 'el sexto sigue sin entrar');
});

test('fase 63: el Guardian arranca en el centro solo porque se le PIDE ese slot', () => {
  // El Guardian es la única excepción, y no por un canónico por tipo: es el
  // eje de la base (cúpula, arco de HP y núcleo están en x=270). `main.js`
  // lo coloca con el slot explícito (GUARDIAN_SLOT).
  const { fortress } = makeGame();
  const g = fortress.addTower('guardian', GUARDIAN_SLOT);
  assert.ok(g);
  assert.equal(g.slotIndex, 2, 'el Guardian va al centro cuando se le pide');
  assert.equal(g.x, CONFIG.BASE_X);
  assert.equal(GUARDIAN_SLOT, 2);
  // Y sin pedirlo, cae donde haya lugar como cualquier otra.
  const { fortress: f2 } = makeGame();
  f2.addTower('beam');
  assert.equal(f2.addTower('guardian').slotIndex, 1, 'sin slot explícito va al primer libre');
});

test('fase 63: la bahía libre NO promete qué torre va a recibir', () => {
  // El acento de un slot vacío era el color de la torre que "le tocaba".
  // Ahora las 5 bahías libres comparten el mismo acento: dice "acá podés
  // construir", nada más.
  const { fortress } = makeGame();
  const acentos = fortress._slotGeom.map((g) => g.accent);
  assert.equal(new Set(acentos).size, 1,
    `las 5 bahías libres tienen que compartir el acento (hay ${new Set(acentos).size})`);
});
