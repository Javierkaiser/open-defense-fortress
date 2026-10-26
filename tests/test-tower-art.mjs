// ============================================================
// tests/test-tower-art.mjs — fase 60
// Cubre js/tower-art.js: los DATOS del rig de cada torre y el
// renderizador. Este archivo existe porque el rediseño "silueta primero"
// se apoya en dos invariantes que un test puede vigilar sin navegador:
//
//   1. TODO `kind` de TOWERS tiene rig, y el rig está bien formado
//      (roles válidos, un solo tipo de shape por pieza, números finitos).
//   2. LAS 8 SILUETAS SON DISTINTAS. Antes no lo eran: pintando las 8
//      torres de negro, 7 daban el mismo borrón redondo porque el disco
//      de acento (r=32..42 ×1.2) era la forma dominante. El test
//      RASTERIZA cada rig en una rejilla y exige que todas difieran.
//
// También cubre el FALLBACK sin Path2D: en Node no existe el global, así
// que el rig se traza con moveTo/lineTo del ctx. Si eso se rompe, el
// juego se ve bien en el navegador y revientan los tests (o al revés).
// ============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TOWER_RIGS, RIG_KINDS, TOWER_PAD, TOWER_VISUAL_SCALE, PAD_GLYPH,
  renderTowerRig, rigColors, rigHotPoint, rigHotRadius, rigBox,
  mixHex, drawGlow, resetTowerArtCaches,
} from '../js/tower-art.js';
import { TOWERS } from '../js/towers.js';

/** ctx de mentira: registra trazos, rellenos y shapes. */
function recCtx() {
  const calls = {
    moveTo: [], lineTo: [], arcs: [], ellipses: [], rects: [], fills: [], strokes: 0, texts: [],
  };
  let enPath = false;
  const ctx = {
    calls,
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: 'butt',
    globalAlpha: 1, globalCompositeOperation: 'source-over',
    font: '', textAlign: 'left', textBaseline: 'alphabetic', shadowBlur: 0, shadowColor: '',
    save() {}, restore() {}, scale() {}, rotate() {}, translate() {}, setLineDash() {},
    beginPath() { enPath = true; calls.moveTo = calls.moveTo; },
    closePath() {},
    moveTo(x, y) { calls.moveTo.push([x, y]); },
    lineTo(x, y) { calls.lineTo.push([x, y]); },
    bezierCurveTo() {}, quadraticCurveTo() {},
    arc(x, y, r) { calls.arcs.push({ x, y, r, style: ctx.fillStyle }); },
    ellipse(x, y, rx, ry, rot, a0, a1) {
      calls.ellipses.push({ x, y, rx, ry, a0, a1, style: ctx.strokeStyle, width: ctx.lineWidth, alpha: ctx.globalAlpha });
    },
    rect(x, y, w, h) { calls.rects.push({ x, y, w, h }); },
    fillRect(x, y, w, h) { calls.rects.push({ x, y, w, h }); calls.fills.push(ctx.fillStyle); },
    fill() { calls.fills.push(ctx.fillStyle); },
    stroke() { calls.strokes++; },
    strokeRect() {},
    clip() {},
    drawImage() {},
    fillText(t) { calls.texts.push(String(t)); },
    strokeText(t) { calls.texts.push(String(t)); },
    measureText: (t) => ({ width: String(t).length * 8 }),
    createRadialGradient: () => ({ addColorStop() {} }),
  };
  return ctx;
}

/** Shapes admitidos por una pieza del rig. */
const SHAPES = ['d', 'circle', 'ellipse', 'rect', 'line'];
/** Roles de color admitidos (ver rigColors). */
const ROLES = ['body', 'bodyTop', 'dark', 'metal', 'accent', 'hot', 'core'];

// ------------------------------------------------------------
// Datos
// ------------------------------------------------------------

test('fase 60: cada kind de TOWERS tiene su rig y no sobra ninguno', () => {
  const kindsTorres = new Set(Object.values(TOWERS).map((t) => t.kind));
  for (const k of kindsTorres) {
    assert.ok(TOWER_RIGS[k], `el kind "${k}" no tiene rig en tower-art.js`);
  }
  for (const k of RIG_KINDS) {
    assert.ok(kindsTorres.has(k), `el rig "${k}" no corresponde a ninguna torre de TOWERS`);
  }
  assert.equal(RIG_KINDS.length, kindsTorres.size);
});

test('fase 60: las 8 torres tienen ARQUETIPO propio (ni un ancho×alto repetido)', () => {
  // La regla del rediseño: ninguna torre comparte la combinación
  // ancho×alto con otra. Sin esto vuelven las "5 torres cono".
  const cajas = new Map();
  for (const k of RIG_KINDS) {
    const bb = TOWER_RIGS[k].bbox;
    const clave = `${Math.round(bb.w / 2) * 2}×${Math.round(bb.h / 2) * 2}`;
    assert.ok(!cajas.has(clave),
      `"${k}" comparte arquetipo ${clave} con "${cajas.get(clave)}"`);
    cajas.set(clave, k);
  }
});

test('fase 60: las piezas del rig son válidas (rol, shape, números)', () => {
  for (const k of RIG_KINDS) {
    const rig = TOWER_RIGS[k];
    assert.ok(Array.isArray(rig.parts) && rig.parts.length >= 8,
      `${k}: el rig tiene ${rig.parts?.length} piezas (se esperan 8+)`);
    assert.ok(rig.bbox && rig.shadow && rig.hot, `${k}: falta bbox/shadow/hot`);
    for (const bb of [rig.bbox]) {
      for (const v of [bb.x, bb.y, bb.w, bb.h]) {
        assert.ok(Number.isFinite(v), `${k}: bbox con valor no finito (${v})`);
      }
      assert.ok(bb.w > 0 && bb.h > 0, `${k}: bbox vacía`);
    }
    const ids = new Set();
    for (const p of rig.parts) {
      assert.ok(ROLES.includes(p.role), `${k}.${p.id}: rol desconocido "${p.role}"`);
      assert.ok(!ids.has(p.id), `${k}: id de pieza repetido "${p.id}"`);
      ids.add(p.id);
      const shapes = SHAPES.filter((s) => p[s] !== undefined);
      assert.equal(shapes.length, 1, `${k}.${p.id}: ${shapes.length} shapes (debe tener 1)`);
      if (p.d !== undefined) {
        assert.ok(typeof p.d === 'string' && /^[Mm]/.test(p.d),
          `${k}.${p.id}: el path tiene que empezar por M (${p.d})`);
        const nums = p.d.match(/-?\d*\.?\d+/g) || [];
        assert.ok(nums.length >= 6, `${k}.${p.id}: el path tiene muy pocos puntos`);
        for (const n of nums) {
          assert.ok(Number.isFinite(Number(n)), `${k}.${p.id}: "${n}" no es un número`);
        }
      }
      const nums = [].concat(p.circle ?? [], p.ellipse ?? [], p.rect ?? [], p.line ?? []);
      for (const n of nums) {
        assert.ok(Number.isFinite(n), `${k}.${p.id}: coordenada no finita (${n})`);
      }
      if (p.alpha !== undefined) {
        assert.ok(p.alpha > 0 && p.alpha <= 1, `${k}.${p.id}: alpha fuera de (0,1]`);
      }
      if (p.rotTrack !== undefined) {
        assert.ok(['aim', 'spin'].includes(p.rotTrack), `${k}.${p.id}: rotTrack "${p.rotTrack}"`);
      }
      if (p.pulse !== undefined) {
        assert.ok(['charge', 'wave', 'flicker', 'breathe'].includes(p.pulse), `${k}.${p.id}: pulse "${p.pulse}"`);
      }
      if (p.stroke) assert.ok(p.width > 0, `${k}.${p.id}: trazo sin grosor`);
    }
  }
});

// ------------------------------------------------------------
// TEST DE SILUETA — el criterio de aceptación del rediseño.
// ------------------------------------------------------------

/** Vértices de un `d` poligonal (M/L/H/V/Z; los rigs no usan curvas). */
function vertices(d) {
  const pts = [];
  const seg = /([MmLlHhVvZz])([^MmLlHhVvZz]*)/g;
  let m;
  let cx = 0, cy = 0, sx = 0, sy = 0;
  while ((m = seg.exec(d)) !== null) {
    const up = m[1].toUpperCase();
    const rel = m[1] !== up;
    const nums = (m[2].match(/-?\d*\.?\d+/g) || []).map(Number);
    const bx = rel ? cx : 0;
    const by = rel ? cy : 0;
    if (up === 'M' || up === 'L') {
      for (let i = 0; i + 1 < nums.length; i += 2) {
        cx = bx + nums[i]; cy = by + nums[i + 1];
        pts.push([cx, cy]);
        if (up === 'M' && i === 0) { sx = cx; sy = cy; }
      }
    } else if (up === 'H') {
      for (const n of nums) { cx = bx + n; pts.push([cx, cy]); }
    } else if (up === 'V') {
      for (const n of nums) { cy = by + n; pts.push([cx, cy]); }
    } else if (up === 'Z') { cx = sx; cy = sy; }
  }
  return pts;
}

/** Aplica pivot + rotación (y el apuntado si la pieza lo sigue). */
function transformar(pts, part, aim) {
  const rot = (part.rot ?? 0) + (part.rotTrack === 'aim' ? aim : 0);
  const px = part.pivot?.[0] ?? 0;
  const py = part.pivot?.[1] ?? 0;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return pts.map(([x, y]) => [px + x * c - y * s, py + x * s + y * c]);
}

/** ¿(x,y) dentro del polígono? (ray casting) */
function dentro(poly, x, y) {
  let dentro = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

/**
 * Firma de silueta: rejilla NxN de ocupación del rig en su caja. Es una
 * versión barata (y suficiente) del "pinta las 8 de negro y míralas":
 * si dos torres dan la misma firma, se ven iguales de lejos.
 */
function firmaSilueta(kind, N = 10, aim = 0) {
  const rig = TOWER_RIGS[kind];
  const bb = rig.bbox;
  const polys = [];
  for (const p of rig.parts) {
    if (p.d === undefined) continue;          // círculos/elipses son adorno
    const v = vertices(p.d);
    if (v.length >= 3) polys.push(transformar(v, p, aim));
  }
  const celdas = [];
  for (let gy = 0; gy < N; gy++) {
    for (let gx = 0; gx < N; gx++) {
      const x = bb.x + ((gx + 0.5) / N) * bb.w;
      const y = bb.y + ((gy + 0.5) / N) * bb.h;
      celdas.push(polys.some((poly) => dentro(poly, x, y)) ? 1 : 0);
    }
  }
  return celdas;
}

test('fase 60: las 8 SILUETAS se distinguen entre sí (test de la rejilla)', () => {
  const firmas = new Map(RIG_KINDS.map((k) => [k, firmaSilueta(k)]));
  // Ninguna silueta puede estar vacía (un rig que no ocupa su caja).
  for (const [k, f] of firmas) {
    const tinta = f.reduce((a, b) => a + b, 0);
    assert.ok(tinta >= 12, `${k}: la silueta ocupa ${tinta}/100 celdas (¿rig vacío?)`);
  }
  // Y todas tienen que DIFERIR: comparamos cada par y exigimos una
  // distancia mínima, no solo "no idénticas" (dos torres que difieren en
  // 1 celda se ven iguales en pantalla).
  const MIN = 8;
  const kinds = [...firmas.keys()];
  for (let i = 0; i < kinds.length; i++) {
    for (let j = i + 1; j < kinds.length; j++) {
      const a = firmas.get(kinds[i]);
      const b = firmas.get(kinds[j]);
      let dist = 0;
      for (let c = 0; c < a.length; c++) if (a[c] !== b[c]) dist++;
      assert.ok(dist >= MIN,
        `${kinds[i]} y ${kinds[j]} se parecen demasiado (${dist}/${a.length} celdas distintas)`);
    }
  }
});

// ------------------------------------------------------------
// Renderizador
// ------------------------------------------------------------

test('fase 60: renderTowerRig pinta los 8 rigs en los 5 niveles sin lanzar', () => {
  resetTowerArtCaches();
  for (const k of RIG_KINDS) {
    const data = Object.values(TOWERS).find((t) => t.kind === k);
    for (let lv = 0; lv <= 5; lv++) {
      const ctx = recCtx();
      assert.doesNotThrow(() => renderTowerRig(ctx, {
        kind: k, data, muzzle: '#FF00FF', lv, t: 1.5, aim: -0.3, charge: 0.7, recoil: 0.5,
      }), `${k} Lv.${lv} lanzó al renderizar`);
      assert.ok(ctx.calls.fills.length > 0, `${k} Lv.${lv}: no pintó nada`);
    }
  }
  assert.equal(renderTowerRig(recCtx(), { kind: 'no-existe', data: {} }), false,
    'un kind desconocido tiene que devolver false, no lanzar');
});

test('fase 60: en Node (sin Path2D) el rig se traza con moveTo/lineTo', () => {
  // Node no tiene el global Path2D: si el fallback se rompe, el navegador
  // sigue viéndose bien pero los tests de render dejan de pintar nada.
  assert.equal(typeof globalThis.Path2D, 'undefined',
    'este test asume el entorno de Node, sin Path2D');
  resetTowerArtCaches();
  const ctx = recCtx();
  renderTowerRig(ctx, { kind: 'fan', data: TOWERS.guardian, lv: 1 });
  assert.ok(ctx.calls.moveTo.length >= 10,
    `el trazador tiene que emitir moveTo (emitió ${ctx.calls.moveTo.length})`);
  assert.ok(ctx.calls.lineTo.length >= 20,
    `el trazador tiene que emitir lineTo (emitió ${ctx.calls.lineTo.length})`);
  for (const [x, y] of ctx.calls.moveTo) {
    assert.ok(Number.isFinite(x) && Number.isFinite(y), `moveTo no finito (${x}, ${y})`);
  }
});

test('fase 60: el PAD enciende un tick por nivel, en el acento, y apaga el resto', () => {
  for (const lv of [0, 1, 3, 5]) {
    const ctx = recCtx();
    renderTowerRig(ctx, { kind: 'laser', data: TOWERS.laser, muzzle: '#9DFF3C', lv });
    const ticks = ctx.calls.ellipses.filter(
      (e) => e.rx === TOWER_PAD.ring.rx && e.ry === TOWER_PAD.ring.ry,
    );
    assert.equal(ticks.length, TOWER_PAD.tick.count,
      `Lv.${lv}: el pad dibuja ${TOWER_PAD.tick.count} ticks (dibujó ${ticks.length})`);
    const lit = ticks.filter((e) => e.style === TOWERS.laser.accent);
    assert.equal(lit.length, lv, `Lv.${lv}: ticks encendidos ${lit.length} (esperados ${lv})`);
    // Los apagados se distinguen de los encendidos por color Y grosor.
    for (const t of ticks.filter((e) => e.style === TOWER_PAD.tick.idleColor)) {
      assert.equal(t.width, TOWER_PAD.tick.idleWidth, 'tick apagado con grosor de encendido');
    }
    for (const t of lit) {
      assert.equal(t.width, TOWER_PAD.tick.width, 'tick encendido con grosor de apagado');
    }
  }
});

test('fase 60: el pad se puede omitir (lo usa el icono del meta-juego)', () => {
  const conPad = recCtx();
  renderTowerRig(conPad, { kind: 'beam', data: TOWERS.beam, lv: 3 });
  const sinPad = recCtx();
  renderTowerRig(sinPad, { kind: 'beam', data: TOWERS.beam, lv: 3, drawPad: false });
  assert.ok(sinPad.calls.fills.length < conPad.calls.fills.length,
    'sin pad se pinta menos (el pad aporta plate + contacto)');
  assert.equal(sinPad.calls.ellipses.filter((e) => e.rx === TOWER_PAD.ring.rx).length, 0,
    'sin pad no puede haber ticks');
});

test('fase 60: la textura del chasis se RECORTA con la silueta (no es un marco suelto)', () => {
  // El sprite del chasis se dibujaba entero, más grande que el cuerpo y en
  // 'lighter': sobre el cono del Beam se veía un marco rectangular
  // flotando. Ahora va clip() + 'overlay' dentro de la pieza que declara
  // el rig, así que: (1) solo se dibuja si hay sprite cargado, (2) el
  // clip está ANTES del drawImage, (3) el blend NO es 'lighter'.
  const orden = [];
  const ctx = recCtx();
  ctx.clip = () => { orden.push('clip'); };
  ctx.drawImage = () => { orden.push('drawImage:' + ctx.globalCompositeOperation); };
  renderTowerRig(ctx, {
    kind: 'beam', data: TOWERS.beam, lv: 1,
    sprites: { beam: { ready: true, img: {} } },
  });
  const iClip = orden.indexOf('clip');
  const iImg = orden.findIndex((o) => o.startsWith('drawImage'));
  assert.ok(iClip >= 0 && iImg > iClip, 'el clip tiene que ir antes del drawImage');
  assert.ok(!orden[iImg].includes('lighter'),
    `el chasis no puede volver al blend 'lighter' (${orden[iImg]})`);

  // Sin sprite cargado (o sin la pieza), no se recorta nada.
  const sinSprite = recCtx();
  renderTowerRig(sinSprite, { kind: 'beam', data: TOWERS.beam, lv: 1 });
  assert.equal(orden.filter((o) => o === 'clip').length, 1);
});

// ------------------------------------------------------------
// Helpers puros
// ------------------------------------------------------------

test('fase 60: rigHotPoint devuelve la boca REAL, también con el cañón rotado', () => {
  for (const k of RIG_KINDS) {
    const rig = TOWER_RIGS[k];
    for (const aim of [-0.6, 0, 0.35]) {
      const [x, y] = rigHotPoint(rig, aim);
      assert.ok(Number.isFinite(x) && Number.isFinite(y), `${k}: boca no finita`);
    }
  }
  // fase 60: las torres de CAÑÓN/TUBO giran con el apuntado; las BOBINAS
  // (Tesla y Thunderstroke) tienen la boca fija, y eso es correcto.
  for (const k of ['gauss', 'homing', 'beam', 'laser', 'mortar']) {
    const a = rigHotPoint(TOWER_RIGS[k], 0);
    const b = rigHotPoint(TOWER_RIGS[k], 0.4);
    assert.ok(Math.hypot(b[0] - a[0], b[1] - a[1]) > 3,
      `${k}: la boca tiene que seguir al cañón (${a} → ${b})`);
  }
  for (const k of ['bolt', 'chain']) {
    assert.deepEqual(rigHotPoint(TOWER_RIGS[k], 0), rigHotPoint(TOWER_RIGS[k], 0.4),
      `${k}: la boca de una bobina no gira`);
  }
  // El Missile en reposo descansa inclinado a la izquierda.
  const m0 = rigHotPoint(TOWER_RIGS.homing, 0);
  assert.ok(m0[0] < 0 && m0[1] < -35,
    `el Missile descansa inclinado a la izquierda (${m0[0].toFixed(1)}, ${m0[1].toFixed(1)})`);
  assert.ok(rigHotRadius(TOWER_RIGS.bolt) > 5, 'el orbe del Thunderstroke es grande');
});

test('fase 60: rigBox incluye la silueta Y el pad', () => {
  for (const k of RIG_KINDS) {
    const box = rigBox(k);
    const bb = TOWER_RIGS[k].bbox;
    assert.ok(box.x0 <= bb.x && box.x1 >= bb.x + bb.w, `${k}: rigBox corta la silueta`);
    assert.ok(box.y0 <= bb.y && box.y1 >= bb.y + bb.h, `${k}: rigBox corta la silueta`);
    assert.ok(box.x0 <= -TOWER_PAD.rx && box.x1 >= TOWER_PAD.rx, `${k}: rigBox corta el pad`);
    assert.ok(box.y1 >= TOWER_PAD.cy + TOWER_PAD.ry, `${k}: rigBox corta el pad`);
    assert.ok(box.x1 > box.x0 && box.y1 > box.y0, `${k}: rigBox vacía`);
  }
});

test('fase 60: mixHex mezcla dos hex y tolera basura', () => {
  assert.equal(mixHex('#000000', '#FFFFFF', 0), '#000000');
  assert.equal(mixHex('#000000', '#FFFFFF', 1), '#FFFFFF');
  assert.equal(mixHex('#000000', '#FFFFFF', 0.5), '#808080');
  assert.equal(mixHex('#10161A', '#10161A', 0.5), '#10161A');
  // Entradas raras: devuelve el primero sin lanzar (el color nunca puede
  // tumbar un frame).
  assert.equal(mixHex('rgba(1,2,3,0.5)', '#FFF', 0.5), 'rgba(1,2,3,0.5)');
  assert.equal(mixHex(undefined, '#FFF', 0.5), undefined);
});

test('fase 60: rigColors arma la paleta de roles desde la tabla TOWERS', () => {
  const c = rigColors(TOWERS.guardian, '#9DFF3C');
  assert.equal(c.body, TOWERS.guardian.bodyColor);
  assert.equal(c.accent, TOWERS.guardian.accent);
  assert.equal(c.hot, '#9DFF3C', 'la boca usa el color de firma que se le pasa');
  assert.notEqual(c.bodyTop, c.body, 'la cara superior tiene que diferenciarse del cuerpo');
  // Sin boca declarada, el acento hace de boca.
  assert.equal(rigColors(TOWERS.guardian).hot, TOWERS.guardian.accent);
});

test('fase 60: drawGlow nunca lanza (ni con un ctx sin gradientes)', () => {
  const ctx = recCtx();
  delete ctx.createRadialGradient;      // stub mínimo, como el de otros tests
  assert.doesNotThrow(() => drawGlow(ctx, 0, 0, 20, '#FF0000', 0.3));
  assert.doesNotThrow(() => drawGlow(ctx, 0, 0, 0, '#FF0000', 0.3));
  assert.doesNotThrow(() => drawGlow(ctx, 0, 0, 20, '#FF0000', 0));
  assert.doesNotThrow(() => drawGlow(recCtx(), 0, 0, 20, '#FF0000', 0.3));
});

test('fase 60: la escala visual vive junto al pad (encaje y pad miden igual)', () => {
  assert.ok(TOWER_VISUAL_SCALE > 1 && TOWER_VISUAL_SCALE <= 1.5,
    `la escala visual ${TOWER_VISUAL_SCALE} se sale de lo razonable`);
  // El encaje de js/player.js deriva su caja de estas dos constantes.
  assert.ok(PAD_GLYPH.y > 0 && PAD_GLYPH.y < TOWER_PAD.ry,
    'el glifo del tipo de daño tiene que caer dentro del pad');
});
