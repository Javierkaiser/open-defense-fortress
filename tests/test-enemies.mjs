// tests/test-enemies.mjs — oleadas dinámicas
// Las VARIANTES DE ÉLITE (design §Decisión 4 + specs/gameplay/enemy-variants),
// fase 68 "Élites 2.0": los 7 afijos del contrato — `escudado` (escudo que
// absorbe antes que el hp), `rapido` (vel ×1,4, hp ×0,7), `regenerador`
// (cura 2 %/s con tope en el máximo), `divisor` (se parte en 2 crías),
// `sanador` (aura a los aliados), `acorazado` (armadura plana por golpe) y
// `tenaz` (ignora slow y stun).
//
// Lo que fijan estos tests, en orden de importancia:
//   - SIN `variant` las stats son EXACTAMENTE las de siempre (una variante es
//     un modificador, no un tipo nuevo: ni el tipo, ni la familia, ni el
//     radio cambian);
//   - el escudo se come el daño antes que el hp, se rompe y NO vuelve;
//   - el regenerador cura y nunca pasa del máximo;
//   - la MECÁNICA de los cuatro afijos nuevos (divisor, sanador, acorazado y
//     tenaz) y el doble afijo;
//   - NINGUNA variante es inmune: los 5 tipos de daño × las 7 variantes hacen
//     daño, y la matriz de familias (fase 32) se aplica igual que al base
//     (el `acorazado` suma su regla plana con mínimo 1);
//   - la CONTENCIÓN lateral (spec gameplay/field-bounds): ningún enemigo sale
//     del campo por un costado — el que llega al borde vuelve hacia adentro —
//     y salir del campo no es una forma de morir.
//
// Sin DOM: el dibujo se ejercita con un contexto 2D simulado (Node no tiene
// canvas), igual que test-perks.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ENEMY_TYPES, ENEMY_VARIANTS, Enemy, renderEnemyIcon, effectiveHpOf,
} from '../js/enemies.js';
import { DAMAGE_TYPE_IDS, dmgMultiplier } from '../js/damagetypes.js';
import { CONFIG } from '../js/engine.js';

/** Escala de etapa de mentira (misma forma que stages.scaleFor). */
const SCALE = { hpMul: 2.5, velMul: 1.4 };

/** Juego mínimo: engine (partículas, floats, efectos) + lista viva. */
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
    arcs: [], strokes: 0,
    save: noop, restore: noop, translate: noop, rotate: noop, scale: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop,
    quadraticCurveTo: noop, bezierCurveTo: noop,
    arc(_x, _y, r) { this.arcs.push(r); },
    ellipse: noop,
    fill: noop,
    stroke() { this.strokes++; },
    fillRect: noop, strokeRect: noop, clearRect: noop, clip: noop, setLineDash: noop,
    createLinearGradient: () => grad, createRadialGradient: () => grad,
    measureText: () => ({ width: 0 }), fillText: noop, strokeText: noop,
  };
}

/** Dibuja al enemigo con un stub y devuelve lo que pintó. */
function dibujar(e) {
  const ctx = mkCtx();
  e.draw(ctx);
  return ctx;
}

/**
 * Vida TOTAL de un enemigo: escudo + hp. Es la magnitud que tiene que
 * coincidir con la del enemigo base (una variante cambia el reparto, no
 * cuánto daño entra).
 */
const vidaTotal = (e) => e.hp + e.shieldHp;

// ============================================================
// Catálogo
// ============================================================

test('ENEMY_VARIANTS: las 7 variantes del contrato (fase 68)', () => {
  assert.deepEqual(Object.keys(ENEMY_VARIANTS).sort(), [
    'acorazado', 'divisor', 'escudado', 'rapido', 'regenerador', 'sanador', 'tenaz',
  ]);
  assert.equal(ENEMY_VARIANTS.escudado.shieldFrac, 0.40, 'escudo = 40 % del HP escalado');
  assert.equal(ENEMY_VARIANTS.rapido.velMul, 1.4);
  assert.equal(ENEMY_VARIANTS.rapido.hpMul, 0.7);
  assert.equal(ENEMY_VARIANTS.regenerador.regenFrac, 0.02, 'cura 2 %/s del HP máximo');
  assert.equal(ENEMY_VARIANTS.divisor.split.count, 2);
  assert.equal(ENEMY_VARIANTS.divisor.split.hpFrac, 0.35);
  assert.equal(ENEMY_VARIANTS.sanador.healAura.radius, 110);
  assert.equal(ENEMY_VARIANTS.acorazado.armor.max, 60);
  assert.equal(ENEMY_VARIANTS.tenaz.slowImmune, true);
  // El bestiario ya no hardcodea: nombre, descripción, contrapartida y pago.
  for (const [id, v] of Object.entries(ENEMY_VARIANTS)) {
    assert.equal(typeof v.name, 'string', `la variante ${id} necesita nombre`);
    assert.ok(v.name.length > 0, `el nombre de ${id} no puede estar vacío`);
    assert.ok(typeof v.desc === 'string' && v.desc.length > 10,
      `la variante ${id} necesita una descripción para el bestiario`);
    assert.ok(typeof v.counter === 'string' && v.counter.length > 10,
      `la variante ${id} necesita una contrapartida`);
    assert.ok(typeof v.kind === 'string' && v.kind.length > 0, `${id}: falta kind`);
    assert.ok(v.scoreMul >= 1.2, `${id}: una élite tiene que pagar más (scoreMul)`);
  }
});

test('fase 68: variants[] combina dos afijos, deduplica y corta en 2', () => {
  const game = mkGame();
  const doble = new Enemy('meteor', 100, { game, y: 0, variants: ['acorazado', 'sanador'] });
  assert.deepEqual(doble.variants, ['acorazado', 'sanador']);
  assert.equal(doble.variant, 'acorazado', 'el getter devuelve el primero (compatibilidad)');
  assert.equal(doble.variantName, 'Acorazado + Sanador');
  assert.ok(doble.armor > 0, 'el acorazado deja armadura');
  assert.ok(doble._healAura, 'el sanador deja el aura');

  // Dedupe: el mismo afijo dos veces no se apila.
  const dup = new Enemy('meteor', 100, { game, y: 0, variants: ['divisor', 'divisor'] });
  assert.deepEqual(dup.variants, ['divisor']);

  // Tope 2: el tercero se ignora.
  const tres = new Enemy('meteor', 100, { game, y: 0, variants: ['divisor', 'tenaz', 'sanador'] });
  assert.deepEqual(tres.variants, ['divisor', 'tenaz']);
});

test('fase 68: dos afijos combinan stats sin duplicar estados', () => {
  const game = mkGame();
  const d = ENEMY_TYPES.meteor;
  const e = new Enemy('meteor', 100, {
    game, y: 0, scale: SCALE, variants: ['rapido', 'escudado'],
  });
  assert.equal(e.hpMax, Math.max(1, Math.round(d.hp * SCALE.hpMul * 0.7)));
  assert.ok(Math.abs(e.vel - d.vel * SCALE.velMul * 1.4) < 1e-9);
  assert.equal(e.shieldMax, Math.round(e.hpMax * 0.40), 'el escudo sale del HP ya reducido');
  assert.equal(e.armor, 0);
});

test('fase 68: la élite paga más score/XP y el scoreMul se puede pisar', () => {
  const game = mkGame();
  const base = new Enemy('meteor', 100, { game, y: 0 });
  const simple = new Enemy('meteor', 100, { game, y: 0, variant: 'acorazado' });
  const doble = new Enemy('meteor', 100, { game, y: 0, variants: ['acorazado', 'sanador'] });
  assert.ok(simple.scoreReward > base.scoreReward, 'una élite paga más');
  assert.ok(doble.scoreReward > simple.scoreReward, 'dos afijos pagan más que uno');
  assert.equal(simple.scoreReward, base.scoreReward * 1.35);
  // Las crías del divisor pisan el pago (score reducido) sin tocar el tipo.
  const cria = new Enemy('meteor', 100, { game, y: 0, scoreMul: 0.35 });
  assert.equal(cria.scoreReward, base.scoreReward * 0.35);
  assert.deepEqual(cria.variants, []);
});

test('fase 68: la armadura escala con la etapa y tiene tope', () => {
  const d = ENEMY_TYPES.meteor;
  const s1 = new Enemy('meteor', 100, { game: { ...mkGame(), stageId: 1 }, y: 0, variant: 'acorazado' });
  const s50 = new Enemy('meteor', 100, { game: { ...mkGame(), stageId: 50 }, y: 0, variant: 'acorazado' });
  const s200 = new Enemy('meteor', 100, { game: { ...mkGame(), stageId: 200 }, y: 0, variant: 'acorazado' });
  assert.equal(s1.armor, 2, 'S1: 2 + 0,8 × 0');
  assert.ok(Math.abs(s50.armor - (2 + 0.8 * 49)) < 1e-9, 'S50: escala por etapa');
  assert.equal(s200.armor, 60, 'tope duro');
  assert.equal(d.armor, undefined, 'la armadura no vive en el tipo base');
});


test('variant: un id desconocido (o basura) cae al enemigo base, sin romper nada', () => {
  const d = ENEMY_TYPES.meteor;
  for (const raro of ['inventada', '', 'constructor', '__proto__', 42, null, {}, []]) {
    const e = new Enemy('meteor', 100, { y: 0, variant: raro });
    assert.equal(e.variant, null, `"${raro}" no es una variante`);
    assert.equal(e.variantName, null);
    assert.equal(e.hpMax, d.hp);
    assert.equal(e.vel, d.vel);
    assert.equal(e.shieldMax, 0);
  }
});

// ============================================================
// Regresión: sin `variant` no cambia NADA
// ============================================================

test('sin `variant` las stats son EXACTAMENTE las de hoy (regresión)', () => {
  const game = mkGame();
  for (const [type, d] of Object.entries(ENEMY_TYPES)) {
    const sin = new Enemy(type, 100, { game, y: 0 });
    // Escalado de etapa: el hp es el redondeo de siempre y la velocidad la
    // multiplicación de siempre.
    const con = new Enemy(type, 100, { game, y: 0, scale: SCALE });
    assert.equal(con.hpMax, Math.max(1, Math.round(d.hp * SCALE.hpMul)),
      `${type}: el HP escalado cambió`);
    assert.equal(con.vel, d.vel * SCALE.velMul, `${type}: la velocidad escalada cambió`);
    assert.equal(con.hpDisplay, con.hpMax, `${type}: el HP visible no arranca lleno`);
    assert.equal(sin.hpMax, Math.max(1, Math.round(d.hp)));
    assert.equal(sin.hpDisplay, sin.hpMax, `${type}: el HP visible base no arranca lleno`);
    assert.equal(sin.vel, d.vel);
    // Y no aparece ningún estado de variante.
    assert.equal(sin.variant, null);
    assert.equal(sin.variantName, null);
    assert.equal(sin.shieldMax, 0);
    assert.equal(sin.shieldHp, 0);
    // El daño sigue exactamente igual (mismo camino: matriz de familias).
    // `hpDisplay` incluye las placas de la geoda: lo que baja es el HP
    // visible total, no el cuerpo escondido detrás del blindaje.
    const hp0 = sin.hpDisplay;
    sin.takeDamage(4, 'electric');
    assert.equal(sin.hpDisplay, hp0 - 4 * dmgMultiplier('electric', d.family),
      `${type}: el daño del enemigo base cambió`);
  }
});

test('una variante no es un tipo nuevo: no toca tipo, familia, radio ni daño recibido', () => {
  const d = ENEMY_TYPES.meteor;
  for (const variant of Object.keys(ENEMY_VARIANTS)) {
    const e = new Enemy('meteor', 100, { y: 0, variant });
    assert.equal(e.type, 'meteor');
    assert.equal(e.data, d);
    assert.equal(e.family, d.family, `${variant}: la familia no puede cambiar`);
    assert.equal(e.r, d.r, `${variant}: el radio (silueta/colisión) no puede cambiar`);
  }
});

// ============================================================
// `rapido` (Veloz): vel ×1,4 y hp ×0,7
// ============================================================

test('rapido: velocidad ×1,4 y HP ×0,7 exactos (con la escala de la etapa)', () => {
  const d = ENEMY_TYPES.meteor;
  const gemelo = new Enemy('meteor', 100, { y: 0, scale: SCALE });
  const e = new Enemy('meteor', 100, { y: 0, scale: SCALE, variant: 'rapido' });

  assert.equal(e.vel, d.vel * SCALE.velMul * 1.4, 'la velocidad es ×1,4');
  assert.equal(e.vel, gemelo.vel * 1.4, 'y exactamente 1,4× la de su gemelo sin variante');
  const hpBase = Math.max(1, Math.round(d.hp * SCALE.hpMul));
  assert.equal(e.hpMax, Math.max(1, Math.round(hpBase * 0.7)), 'el HP es ×0,7 del escalado');
  assert.equal(e.hp, e.hpMax, 'arranca con la vida llena');
  assert.ok(e.hpMax < gemelo.hpMax);

  assert.equal(e.variant, 'rapido');
  assert.equal(e.variantName, 'Veloz');
  // No tiene escudo ni cura: es SÓLO el intercambio de stats.
  assert.equal(e.shieldMax, 0);
  assert.equal(e._regenFrac, 0);
});

// ============================================================
// `escudado`: el escudo absorbe antes que el hp
// ============================================================

test('escudado: el escudo es plano (40 % del HP) y absorbe antes que el HP', () => {
  const game = mkGame();
  const e = new Enemy('meteor', 100, { game, y: 100, scale: SCALE, variant: 'escudado' });
  assert.equal(e.shieldMax, Math.round(e.hpMax * 0.40), 'el escudo es el 40 % del HP escalado');
  assert.equal(e.shieldHp, e.shieldMax, 'entra con el escudo lleno');
  assert.equal(e.variantName, 'Escudado');

  const hp0 = e.hp;
  const sc0 = e.shieldHp;
  // 'electric' es ×1,0 contra la roca: lo que entra es lo que se resta.
  e.takeDamage(10, 'electric');
  assert.equal(e.shieldHp, sc0 - 10, 'el escudo baja con el golpe');
  assert.equal(e.hp, hp0, 'y el HP NO se toca mientras haya escudo');
});

test('escudado: el sobrante pasa al HP en el mismo golpe', () => {
  const game = mkGame();
  const e = new Enemy('meteor', 100, { game, y: 100, scale: SCALE, variant: 'escudado' });
  const hp0 = e.hp;
  const exceso = 7;
  e.takeDamage(e.shieldMax + exceso, 'electric');
  assert.equal(e.shieldHp, 0, 'el escudo se agota');
  assert.equal(e.hp, hp0 - exceso, 'el sobrante (y sólo el sobrante) va al HP');
});

test('escudado: el escudo se rompe con feedback visible y NO vuelve nunca', () => {
  const game = mkGame();
  const e = new Enemy('meteor', 100, { game, y: 100, scale: SCALE, variant: 'escudado' });
  const hp0 = e.hp;

  e.takeDamage(e.shieldMax, 'electric'); // el golpe justo lo rompe
  assert.equal(e.shieldHp, 0);
  assert.equal(e.hp, hp0, 'romper el escudo no cuesta HP');
  assert.ok(game.log.particles > 0, 'la rotura suelta esquirlas');
  assert.ok(game.log.effects > 0, 'la rotura dibuja su anillo expansivo');
  assert.ok(e._shieldFlash > 0, 'y deja un flash propio sobre el cuerpo');

  // Roto: el daño va al HP y el escudo no sube por ningún camino.
  e.takeDamage(10, 'electric');
  assert.equal(e.hp, hp0 - 10, 'después de la rotura manda el HP');
  assert.equal(e.shieldHp, 0, 'el escudo no regenera');
  // Un golpe con ENERGÍA de sobra (aunque fuera ×1,5, aquí es ×1,0) sigue
  // entrando al hp: el escudo no vuelve ni recargándose.
  for (let i = 0; i < 60; i++) e.update(1 / 60);
  assert.equal(e.shieldHp, 0, 'ni con el tiempo (no hay regeneración de escudo)');
  assert.ok(e.hp <= hp0 - 10, 'y el HP nunca sube');
});

test('escudado: el HP no baja mientras quede escudo, ni con golpes ×1,5', () => {
  const game = mkGame();
  const e = new Enemy('blob', 100, { game, y: 100, variant: 'escudado' }); // virus
  const hp0 = e.hp;
  // 'light' es la FORTALEZA del virus (×1,5): ni la debilidad ni la
  // fortaleza de la familia saltean el escudo.
  assert.equal(dmgMultiplier('light', 'virus'), 1.5);
  e.takeDamage(4, 'light');
  assert.equal(e.shieldHp, e.shieldMax - 6, 'entran 4 × 1,5 = 6 al escudo');
  assert.equal(e.hp, hp0, 'y el HP sigue intacto');
});

test('escudado: el VENENO también pasa por el escudo (es daño, no un bypass)', () => {
  const game = mkGame();
  const e = new Enemy('meteor', 100, { game, y: 100, variant: 'escudado' });
  const hp0 = e.hp;
  const sc0 = e.shieldHp;
  Enemy.poison(e, 10, 2);
  e.update(1); // 1 s a 10/s
  assert.equal(e.shieldHp, sc0 - 10, 'el veneno entra por el escudo');
  assert.equal(e.hp, hp0, 'el HP no baja mientras haya escudo');
});

// ============================================================
// `regenerador`: cura 2 %/s, tope en el máximo
// ============================================================

test('regenerador: sin daño no hace nada raro (y no pasa del máximo)', () => {
  const game = mkGame();
  const e = new Enemy('meteor', 100, { game, y: 100, variant: 'regenerador' });
  const max = e.hpMax;
  assert.equal(e.hp, max);
  e.update(1); // 1 s entero: curaría 2 % si le faltara vida
  assert.equal(e.hp, max, 'con la vida llena la cura no pasa del máximo');
  assert.deepEqual(game.log.floats, [], 'y no anuncia una cura que no existe');
});

test('regenerador: cura 2 %/s del máximo y se corta en el máximo', () => {
  const game = mkGame();
  const e = new Enemy('meteor', 100, { game, y: 100, variant: 'regenerador' });
  const max = e.hpMax;

  e.takeDamage(10, 'electric');
  const herido = e.hp;
  e.update(1);
  assert.ok(Math.abs(e.hp - (herido + max * 0.02)) < 1e-9,
    `debía curar 2 %/s (${max * 0.02}): ${herido} → ${e.hp}`);
  assert.ok(game.log.floats.length > 0, 'el pulso de la cura se anuncia');

  // Media vida: un segundo de cura completa no puede pasar del máximo.
  e.hp = max - 0.01;
  e.update(1);
  assert.equal(e.hp, max, 'la cura se corta exactamente en el máximo');
});

test('regenerador: la variante convive con la regeneración por fases del jefe (fase 47)', () => {
  // Son DOS cosas distintas: la del jefe depende de que su escolta viva
  // (tope BOSS_REGEN_CAP) y la de la variante es del propio enemigo.
  const game = mkGame();
  const boss = new Enemy('blobBoss', 100, { game, y: 100, variant: 'regenerador' });
  boss.hp = boss.hpMax * 0.5;       // cruza el umbral de la fase FURIA (regen)
  boss.update(1 / 60);              // la fase convoca esbirros y la escolta lo cura
  assert.ok(boss._phase?.regen > 0, 'el jefe ya está en una fase con regeneración');
  assert.equal(typeof boss._regenAcc, 'number', 'la regeneración del jefe usó su contador');

  for (const e of game.fortress.enemies) e.dead = true; // la escolta cae
  const hp0 = boss.hp;
  boss.update(1);
  // Sin escolta viva la fase NO cura (rate 0): lo que curó es la variante.
  assert.ok(Math.abs(boss.hp - (hp0 + boss.hpMax * 0.02)) < 1e-9,
    `debía curar sólo la variante (2 %/s): ${hp0} → ${boss.hp}`);
  assert.ok(boss._varRegenAcc >= 0, 'y la variante usa SU contador (no pisa el del jefe)');
});

// ============================================================
// Ninguna variante es inmune (spec: nada de "lock & key")
// ============================================================

test('ninguna variante es inmune: los 5 tipos de daño × las 7 variantes', () => {
  const game = mkGame();
  /** Daño que entra (escudo + hp) en un golpe de `n` de ese tipo. */
  const entra = (e, n, dmgType) => {
    const antes = vidaTotal(e);
    e.takeDamage(n, dmgType);
    return antes - vidaTotal(e);
  };
  for (const dmgType of DAMAGE_TYPE_IDS) {
    const base = new Enemy('meteor', 100, { game, y: 100 });
    const dmgBase = entra(base, 4, dmgType);
    assert.ok(dmgBase > 0, `el enemigo base no recibe daño de ${dmgType}`);
    for (const variant of Object.keys(ENEMY_VARIANTS)) {
      const e = new Enemy('meteor', 100, { game, y: 100, variant });
      const dmg = entra(e, 4, dmgType);
      assert.ok(dmg > 0, `la variante ${variant} es INMUNE a ${dmgType}`);
      // fase 68: el `acorazado` tiene SU regla plana (arma el golpe con
      // mínimo 1) además de la matriz; el resto tiene que entrar igual que
      // al base. La matriz se aplica en ambos casos: eso es lo que se fija.
      const esperado = variant === 'acorazado'
        ? Math.max(1, dmgBase - e.armor)
        : dmgBase;
      assert.equal(dmg, esperado,
        `${variant} × ${dmgType}: la matriz de familias debe aplicar igual que al base`);
    }
  }
});

test('ninguna variante necesita un tipo concreto para morir', () => {
  const game = mkGame();
  // El meteorito es ROCA y la roca RESISTE luz y explosión (×0,5): si una
  // élite sólo muriera con un tipo concreto, esto no llegaría a matarla.
  const resistidos = DAMAGE_TYPE_IDS.filter((t) => dmgMultiplier(t, 'rock') === 0.5);
  assert.ok(resistidos.length > 0);
  for (const dmgType of resistidos) {
    for (const variant of Object.keys(ENEMY_VARIANTS)) {
      const e = new Enemy('meteor', 100, { game, y: 100, variant });
      // Cota segura: con la armadura del `acorazado` (mínimo 1 por golpe)
      // cada golpe entra al menos 1, así que vida + 2 golpes siempre mata.
      const golpes = Math.ceil(vidaTotal(e)) + 2;
      for (let i = 0; i < golpes && !e.dead; i++) e.takeDamage(10, dmgType);
      assert.ok(e.dead, `${variant} no muere a base de ${dmgType} (el tipo que la familia resiste)`);
    }
  }
});

// ============================================================
// Rasgo visual: cada variante se ve distinta y el draw no simula nada
// ============================================================

test('cada variante tiene un rasgo visual propio (y el draw no toca la simulación)', () => {
  const game = mkGame();
  const base = new Enemy('meteor', 100, { game, y: 300 });
  const ctxBase = dibujar(base);

  const escudado = new Enemy('meteor', 100, { game, y: 300, variant: 'escudado' });
  const ctxEsc = dibujar(escudado);
  assert.ok(ctxEsc.arcs.some((r) => r > escudado.r * 1.2),
    'el escudado dibuja su anillo de escudo alrededor del cuerpo');

  const rapido = new Enemy('meteor', 100, { game, y: 300, variant: 'rapido' });
  rapido.update(1 / 60); // la estela necesita que esté cayendo
  const ctxVel = dibujar(rapido);
  assert.ok(ctxVel.strokes > ctxBase.strokes, 'el veloz dibuja líneas de velocidad');

  const regen = new Enemy('meteor', 100, { game, y: 300, variant: 'regenerador' });
  const ctxReg = dibujar(regen);
  assert.ok(ctxReg.arcs.some((r) => r > regen.r * 1.2), 'el regenerador dibuja su aura');

  // El pase visual es de LECTURA: no mueve, no cura y no mata a nadie.
  for (const e of [escudado, rapido, regen]) {
    assert.equal(e.dead, false);
    assert.ok(e.hp <= e.hpMax);
    assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y));
  }

  // Roto el escudo, su rasgo desaparece (no vuelve a pintarse).
  const roto = new Enemy('meteor', 100, { game, y: 300, variant: 'escudado' });
  roto.takeDamage(roto.shieldMax, 'electric');
  assert.equal(roto.shieldHp, 0);
  const ctxRoto = dibujar(roto);
  assert.ok(!ctxRoto.arcs.some((r) => r > roto.r * 1.2),
    'sin escudo no queda anillo que dibujar');
});

test('el rasgo visual se dibuja en TODOS los tipos × variantes sin romper nada', () => {
  // La élite puede caer sobre cualquier tipo (meteorito, espora, blob, jefe
  // incluido): el pase visual no puede tirar ni cambiar la simulación.
  const game = mkGame();
  for (const type of Object.keys(ENEMY_TYPES)) {
    for (const variant of [null, ...Object.keys(ENEMY_VARIANTS)]) {
      const e = new Enemy(type, 100, { game, y: 300, variant });
      e.update(1 / 60); // ya cayendo: las estelas necesitan velocidad
      assert.doesNotThrow(() => dibujar(e), `${type} × ${variant ?? 'base'}`);
      assert.equal(e.dead, false, `${type} × ${variant ?? 'base'}: el draw no mata`);
      assert.ok(e.hp > 0 && e.hp <= e.hpMax, `${type} × ${variant ?? 'base'}: el draw no cura`);
    }
  }
});

test('renderEnemyIcon acepta la variante: el icono del bestiario muestra el rasgo', () => {
  /** Dibuja el icono con un canvas de mentira y devuelve su contexto. */
  const icono = (type, variant) => {
    const ctx = mkCtx();
    const canvas = { tagName: 'CANVAS', width: 0, height: 0, getContext: () => ctx };
    const ok = renderEnemyIcon(canvas, type, variant);
    return { ok, ctx };
  };
  assert.equal(icono('meteor').ok, true, 'sin variante (llamadas de hoy) sigue igual');
  const elite = icono('meteor', 'escudado');
  assert.equal(elite.ok, true, 'el icono de una élite se dibuja');
  assert.ok(elite.ctx.arcs.some((r) => r > ENEMY_TYPES.meteor.r * 1.2),
    'y muestra el aro del escudo');
  assert.equal(icono('meteor', 'inventada').ok, true, 'una variante desconocida no rompe');
  assert.equal(icono('no-existe', 'escudado').ok, false, 'un tipo desconocido sigue devolviendo false');
});

// ============================================================
// MECÁNICAS INTRÍNSECAS DE TANQUE
// ============================================================

test('tanques: el HP efectivo de sus mecánicas queda en 220–254', () => {
  const expected = {
    boulder: ENEMY_TYPES.boulder.hp + 3 * ENEMY_TYPES.rockSwarm.hp,
    sporePod: ENEMY_TYPES.sporePod.hp
      + ENEMY_TYPES.spore.hp * ENEMY_TYPES.sporePod.spawner.maxAlive
      + ENEMY_TYPES.spore.hp * ENEMY_TYPES.sporePod.deathSpawn.count,
    geode: ENEMY_TYPES.geode.hp,
    blob: ENEMY_TYPES.blob.hp,
  };
  for (const [type, hp] of Object.entries(expected)) {
    assert.equal(effectiveHpOf(type), hp, `${type}: HP efectivo inesperado`);
    assert.ok(hp >= 220 && hp <= 254, `${type}: HP efectivo ${hp} fuera de 220–254`);
  }
  assert.equal(effectiveHpOf('meteor'), ENEMY_TYPES.meteor.hp,
    'un tipo sin mecánicas conserva su HP base');
});

test('boulder: Desmoronamiento — 3 enjambres al morir, 10 % de XP y sin recursión', () => {
  const game = mkGame();
  const boulder = new Enemy('boulder', 100, { game, y: 300 });
  game.fortress.enemies.push(boulder);
  boulder.die();
  const kids = game.fortress.enemies.filter((e) => e !== boulder);
  assert.equal(kids.length, 3, 'el boulder debe dejar 3 crías');
  for (const kid of kids) {
    assert.equal(kid.type, 'rockSwarm');
    assert.equal(kid.fromSpawn, true);
    assert.equal(kid.spawnedBy, boulder);
    assert.equal(kid.scoreReward, 0.5, '10 % de 5 puntos = 0,5');
    assert.equal(kid.dead, false);
  }
  assert.equal(boulder.dead, true);
  // Las crías heredan la ESCALA de la etapa (si no, en S50 saldrían con
  // stats base y serían decorativas).
  const gameScale = mkGame();
  const scaled = new Enemy('boulder', 100, { game: gameScale, y: 300, scale: { hpMul: 2, velMul: 1.5 } });
  gameScale.fortress.enemies.push(scaled);
  scaled.die();
  const scaledKid = gameScale.fortress.enemies.find((e) => e !== scaled);
  assert.equal(scaledKid.hpMax, ENEMY_TYPES.rockSwarm.hp * 2);
  assert.equal(scaledKid.vel, ENEMY_TYPES.rockSwarm.vel * 1.5);

  // Una cría de `divisor` no vuelve a desmoronarse (anti-exponencial).
  const game2 = mkGame();
  const splitBoulder = new Enemy('boulder', 100, { game: game2, y: 300, fromSplit: true });
  game2.fortress.enemies.push(splitBoulder);
  splitBoulder.die();
  assert.equal(game2.fortress.enemies.length, 1,
    'la cría de divisor no debe generar deathSpawn');

  // La VARIANTE divisor se parte (35 %) pero no mezcla deathSpawn.
  const game3 = mkGame();
  const divisorBoulder = new Enemy('boulder', 100, { game: game3, y: 300, variant: 'divisor' });
  game3.fortress.enemies.push(divisorBoulder);
  divisorBoulder.die();
  const inherited = game3.fortress.enemies.filter((e) => e !== divisorBoulder);
  assert.equal(inherited.length, 2, 'el divisor debe dejar 2 boulders');
  assert.ok(inherited.every((e) => e.type === 'boulder'),
    'el divisor no debe convertir las crías en rockSwarm');
});

test('sporePod: Esporulación — 2 esporas/6 s, tope 6, 10 % de XP y sin recursión', () => {
  const game = mkGame();
  const pod = new Enemy('sporePod', 100, { game, y: 300 });
  game.fortress.enemies.push(pod);
  pod._spawnAcc = 5.99;
  pod.update(0.02);
  let kids = game.fortress.enemies.filter((e) => e !== pod);
  assert.equal(kids.length, 2, 'la primera esporulación debe soltar 2 esporas');
  for (const kid of kids) {
    assert.equal(kid.type, 'spore');
    assert.equal(kid.fromSpawn, true);
    assert.equal(kid.spawnedBy, pod);
    assert.equal(kid.scoreReward, 0.5, '10 % de 5 puntos = 0,5');
  }
  // El tope de 6 se respeta aunque pasen varios ciclos.
  for (let i = 0; i < 5; i++) pod._updateSpawner(6);
  kids = game.fortress.enemies.filter((e) => e !== pod);
  assert.equal(kids.length, 6, 'el pod no debe pasar de 6 crías vivas');
  // Las hijas no esporulan.
  const before = game.fortress.enemies.length;
  for (const kid of kids) kid.update(10);
  assert.equal(game.fortress.enemies.length, before, 'las esporas hijas no deben esporular');

  // Al morir suelta 2 más (aunque el tope ya esté lleno).
  pod.die();
  const afterDeath = game.fortress.enemies.filter((e) => e !== pod && e.fromSpawn);
  assert.equal(afterDeath.length, 8, 'el pod debe soltar 2 esporas al morir');

  // Una cría de divisor no esporula.
  const game2 = mkGame();
  const splitPod = new Enemy('sporePod', 100, { game: game2, y: 300, fromSplit: true });
  game2.fortress.enemies.push(splitPod);
  splitPod._updateSpawner(10);
  assert.equal(game2.fortress.enemies.length, 1, 'la cría de divisor no debe esporular');

  // La VARIANTE divisor no mezcla spawner/deathSpawn.
  const game3 = mkGame();
  const divisorPod = new Enemy('sporePod', 100, { game: game3, y: 300, variant: 'divisor' });
  game3.fortress.enemies.push(divisorPod);
  divisorPod._updateSpawner(10);
  assert.equal(game3.fortress.enemies.length, 1, 'un pod divisor no debe esporular');
  divisorPod.die();
  const inherited = game3.fortress.enemies.filter((e) => e !== divisorPod);
  assert.equal(inherited.length, 2, 'el pod divisor debe dejar 2 pods');
  assert.ok(inherited.every((e) => e.type === 'sporePod'),
    'el pod divisor no debe dejar esporas por deathSpawn');
});

test('blob: Cepa — buffea solo enjambres virus en radio, sin self ni stack', () => {
  const game = mkGame();
  const blob = new Enemy('blob', 100, { game, y: 300 });
  const virus = new Enemy('virusSwarm', 140, { game, y: 300 });
  const rock = new Enemy('rockSwarm', 120, { game, y: 300 });
  const tank = new Enemy('miniBlob', 130, { game, y: 300 });
  game.fortress.enemies.push(blob, virus, rock, tank);
  blob._updateHiveAura();
  assert.ok(virus._hiveT > 0, 'el enjambre virus debe recibir la Cepa');
  assert.equal(rock._hiveT ?? 0, 0, 'otra familia no debe recibir la Cepa');
  assert.equal(tank._hiveT ?? 0, 0, 'un tanque virus no debe recibir la Cepa');
  assert.equal(blob._hiveT ?? 0, 0, 'el blob no se buffea a sí mismo');
  virus.update(1 / 60);
  assert.equal(virus.speedMul, 1.2, 'la Cepa acelera ×1,2');
  virus._hiveT = 0.01;
  virus.update(0.02);
  assert.equal(virus.speedMul, 1, 'al expirar la Cepa la velocidad vuelve a 1');
});

test('drawTrail:false no emite la estela de partículas de los tipos viejos', () => {
  const game = mkGame();
  const swarm = new Enemy('rockSwarm', 100, { game, y: 300 });
  swarm.update(0.1);
  assert.equal(game.log.particles, 0, 'el enjambre no debe inundar de partículas');
  const meteor = new Enemy('meteor', 100, { game, y: 300 });
  meteor.update(0.1);
  assert.ok(game.log.particles > 0, 'el meteorito conserva su estela');
});

test('blob: el empuje alcanza a los enjambres de cualquier familia, no a tanques', () => {
  const game = mkGame();
  const blob = new Enemy('blob', 100, { game, y: 300 });
  const rock = new Enemy('rockSwarm', 120, { game, y: 290 });
  const virus = new Enemy('virusSwarm', 80, { game, y: 290 });
  const pod = new Enemy('sporePod', 110, { game, y: 290 });
  game.fortress.enemies.push(blob, rock, virus, pod);
  const y0 = { rock: rock.y, virus: virus.y, pod: pod.y };
  blob._pushAcc = 0.6;
  blob.update(0.01);
  assert.ok(rock.y > y0.rock, 'el enjambre de roca debe ser empujado');
  assert.ok(virus.y > y0.virus, 'el enjambre viral debe ser empujado');
  assert.equal(pod.y, y0.pod, 'un tanque no debe ser empujado');
});

test('geode: Placas — absorben antes que el HP, no regeneran y aceleran al romperse', () => {
  const game = mkGame();
  const geode = new Enemy('geode', 100, { game, y: 300 });
  game.fortress.enemies.push(geode);
  assert.equal(geode.hpDisplay, geode.hpMax, 'la barra arranca llena');
  assert.equal(geode.platesLeft, 3);
  const body = geode.hp;
  geode.takeDamage(20, 'electric'); // 20 × 1,5 = 30: 30 de placa
  assert.equal(geode.hp, body, 'el cuerpo no baja mientras haya placas');
  assert.ok(geode.plateHp < geode.plateMax, 'la placa absorbe el golpe');
  assert.equal(geode.hpDisplay, geode.hpMax - 30, 'la barra refleja el daño absorbido');
  // No regeneran: siguen dañadas tras un update largo (con la geoda viva).
  const plateHp0 = geode.plateHp;
  geode.update(10);
  assert.equal(geode.plateHp, plateHp0, 'las placas no se regeneran');
  const vel0 = geode.vel;
  geode.takeDamage(200, 'electric');
  assert.equal(geode.platesLeft, 0, 'un golpe grande puede romper todas las placas');
  assert.ok(geode.vel > vel0, 'romper placas acelera la geoda');
  assert.ok(geode.hp < body, 'el sobrante llega al cuerpo');
});

test('geode: el escudo de variante se rompe ANTES que las placas', () => {
  const game = mkGame();
  const geode = new Enemy('geode', 100, { game, y: 300, variant: 'escudado' });
  game.fortress.enemies.push(geode);
  const plates0 = geode.plateHp;
  geode.takeDamage(10, 'electric'); // 15: entra al escudo (96)
  assert.ok(geode.shieldHp < geode.shieldMax, 'el escudo absorbe primero');
  assert.equal(geode.plateHp, plates0, 'las placas quedan intactas');
});

test('geode: las curas no sobrepasan el cuerpo ni las placas', () => {
  const game = mkGame();
  const regen = new Enemy('geode', 100, { game, y: 300, variant: 'regenerador' });
  regen.hp = regen.bodyMax - 10;
  regen._updateVariantRegen(10);
  assert.ok(regen.hp <= regen.bodyMax, 'el regenerador no debe curar el cuerpo por encima del bodyMax');
  assert.equal(regen.plateHp, regen.plateMax, 'las placas no se curan');

  const healer = new Enemy('blob', 100, { game, y: 300, variant: 'sanador' });
  const patient = new Enemy('geode', 120, { game, y: 300 });
  patient.hp = patient.bodyMax - 10;
  game.fortress.enemies.push(healer, patient);
  healer._updateHealAura(1);
  assert.ok(patient.hp <= patient.bodyMax, 'el sanador no debe curar el cuerpo por encima del bodyMax');
  assert.equal(patient.plateHp, patient.plateMax, 'las placas no se curan');
});

// ============================================================
// Contención lateral (spec gameplay/field-bounds)
// ============================================================
//
// El FRAGMENTO era el único tipo sin ningún clampeo lateral: nace con
// `angleDeg: 25` y avanza con `x += vx·dt`, así que en una caída larga
// recorría ~250 px de costado y el que nacía apuntando hacia afuera terminaba
// fuera del canvas — donde el matado de seguridad lo borraba SIN fuga y SIN
// daño (un encuentro gratis, invisible en el balance). Ahora el movimiento
// termina siempre contenido en los márgenes del tipo y, al tocar un lateral,
// `vx` se refleja: vuelve hacia adentro en vez de quedar pegado al borde (el
// rastro se calcula desde `vx`, así que también mira hacia adentro).

/**
 * Corre al enemigo `steps` frames de `dt` y devuelve lo observado: su
 * recorrido lateral, si murió y si la caída se mantuvo (Y siempre bajando).
 * @param {Enemy} e enemigo a simular (se muta: es el sujeto del test)
 * @param {number} steps nº de frames
 * @param {number} [dt] segundos por frame
 */
function correr(e, steps, dt = 1 / 60) {
  const r = { xMin: Infinity, xMax: -Infinity, murio: false, cae: true };
  let yPrev = e.y;
  for (let i = 0; i < steps; i++) {
    e.update(dt);
    if (e.dead) r.murio = true;
    r.xMin = Math.min(r.xMin, e.x);
    r.xMax = Math.max(r.xMax, e.x);
    if (!(e.y > yPrev)) r.cae = false;
    yPrev = e.y;
  }
  return r;
}

/** Márgenes laterales del campo para un enemigo: los `r + 4` de la deriva. */
const margenes = (e) => ({ minX: e.r + 4, maxX: CONFIG.CANVAS_W - e.r - 4 });

test('contención: un Fragmento en diagonal no se escapa (ni muere por salirse)', () => {
  const game = mkGame();
  const e = new Enemy('fragment', 270, { game, y: -300, angleDeg: 25 });
  const { minX, maxX } = margenes(e);
  const vx0 = e.vx;
  assert.ok(vx0 > 0, 'la diagonal del test tiene que caer hacia afuera (derecha)');
  // Gemelo SIN componente lateral: su Y tiene que ser idéntica frame a frame
  // (el rebote es SOLO lateral, la caída no se toca).
  const gemelo = new Enemy('fragment', 270, { game, y: -300, angleDeg: 0 });
  assert.equal(gemelo.vx, 0);

  let rebotes = 0;
  for (let i = 0; i < 600; i++) {          // 10 s a 60 fps
    const vxPrev = e.vx;
    e.update(1 / 60);
    gemelo.update(1 / 60);
    assert.ok(e.x >= minX && e.x <= maxX, `frame ${i}: X fuera del campo (${e.x})`);
    assert.equal(e.dead, false, `frame ${i}: se salió y el matado de seguridad lo borró`);
    assert.equal(e.y, gemelo.y, `frame ${i}: el rebote movió la caída`);
    if (vxPrev > 0 && e.vx < 0) rebotes += 1;
  }
  assert.equal(rebotes, 1, 'en 10 s la diagonal toca el lateral una vez y vuelve');
  assert.equal(e.vx, -vx0, 'vuelve hacia adentro, con la misma rapidez lateral');
  assert.ok(e.x < maxX - 100, `tenía que estar volviendo al centro (x = ${e.x})`);
  // Y el ritmo de caída sigue siendo el del tipo: 110 px/s durante 10 s.
  assert.ok(Math.abs(e.y - (-300 + e.vel * 10)) < 1e-6, `la caída cambió de ritmo: y = ${e.y}`);
});

test('contención: al tocar el lateral el vx se invierte (vuelve hacia adentro)', () => {
  const game = mkGame();
  // Lateral derecho: nace cerca del borde y cae hacia afuera.
  const der = new Enemy('fragment', CONFIG.CANVAS_W - 30, { game, y: 0, angleDeg: 25 });
  const { maxX } = margenes(der);
  const vxDer = der.vx;
  let marco = -1;
  for (let i = 0; i < 60 && marco < 0; i++) {
    der.update(1 / 60);
    if (der.x >= maxX) marco = i;
  }
  assert.ok(marco >= 0, 'el fragmento tenía que llegar al lateral derecho');
  assert.equal(der.x, maxX, 'se fija EXACTO en el margen (r + 4)');
  assert.equal(der.vx, -vxDer, 'y sale reflejado, con la misma rapidez');
  assert.equal(der.dead, false);
  der.update(1 / 60);
  assert.ok(der.x < maxX, 'al frame siguiente vuelve hacia adentro');

  // Lateral izquierdo (el espejo): el reflejo lo manda a la derecha.
  const izq = new Enemy('fragment', 20, { game, y: 0, angleDeg: -25 });
  const { minX } = margenes(izq);
  const vxIzq = izq.vx;
  assert.ok(vxIzq < 0, 'la diagonal del test tiene que caer hacia la izquierda');
  let marcoIzq = -1;
  for (let i = 0; i < 60 && marcoIzq < 0; i++) {
    izq.update(1 / 60);
    if (izq.x <= minX) marcoIzq = i;
  }
  assert.ok(marcoIzq >= 0, 'el fragmento tenía que llegar al lateral izquierdo');
  assert.equal(izq.x, minX);
  assert.equal(izq.vx, -vxIzq, 'y sale reflejado hacia la derecha');
  assert.ok(izq.vx > 0);
  assert.equal(izq.dead, false);
});

test('contención: un empujón lateral fuerte tampoco lo saca (ni lo mata)', () => {
  const game = mkGame();
  // El empuje del blob y la succión del Black Hole mueven la X a mano: acá se
  // simula soltando al enemigo ya fuera del margen del matado de seguridad.
  const e = new Enemy('fragment', 270, { game, y: 0, angleDeg: 25 });
  const { minX, maxX } = margenes(e);
  const vx0 = e.vx;

  e.x = CONFIG.CANVAS_W + 80; // 620 > CANVAS_W + 60: antes lo borraba el safety
  e.update(1 / 60);
  assert.equal(e.x, maxX, 'vuelve al margen derecho');
  assert.equal(e.vx, -vx0, 'y reflejado hacia adentro');
  assert.equal(e.dead, false, 'salir del campo no es una muerte');

  e.x = -90; // < -60
  e.vx = vx0;
  e.update(1 / 60);
  assert.equal(e.x, minX, 'vuelve al margen izquierdo');
  assert.equal(e.vx, vx0, 'y reflejado hacia la derecha');
  assert.equal(e.dead, false);
});

test('contención: una X o una vx corruptas (NaN) no rompen nada', () => {
  const game = mkGame();
  // Con NaN no hay nada que contener: la contención NO inventa coordenadas
  // (inventarlas sería peor — una X basura pasaría por buena).
  const xRara = new Enemy('blob', 270, { game, y: 0 });
  xRara.x = NaN;
  const y0 = xRara.y;
  assert.doesNotThrow(() => xRara.update(1 / 60));
  assert.ok(Number.isNaN(xRara.x), 'la contención fabricó una X a partir de un NaN');
  assert.equal(xRara.dead, false, 'una X corrupta no es una muerte');
  assert.ok(xRara.y > y0, 'la caída sigue');

  const vxRara = new Enemy('blob', 270, { game, y: 0 });
  vxRara.vx = NaN;
  assert.doesNotThrow(() => vxRara.update(1 / 60));
  assert.equal(vxRara.dead, false);
  assert.ok(vxRara.y > 0, 'la caída sigue');
  // Y tampoco explota en los frames siguientes: el estado queda corrupto,
  // pero ni excepción ni muerte silenciosa por coordenada.
  assert.doesNotThrow(() => correr(vxRara, 60));
  assert.equal(vxRara.dead, false);
});

// ------------------------------------------------------------
// Regresión: deriva y zigzag no cambian
// ------------------------------------------------------------

test('regresión: la deriva del meteorito conserva sus límites y su oscilación', () => {
  const game = mkGame();
  const entryX = 270;
  // Valores calculados a mano con el §2.4: la deriva avanza a
  // freq·amp·0,5 = 12 px/s desde el ancla y la X es `ancla + seno ±30`.
  const e = new Enemy('meteor', entryX, { game, y: 0 });
  e.phase = 0;
  e._wanderDir = 1;
  e.update(0.5); // t = 0,5 → _wander 6 → ancla 276
  assert.equal(e._wander, 6);
  assert.ok(Math.abs(e.x - (276 + 30 * Math.sin(0.4))) < 1e-9,
    `t = 0,5: esperaba 276 + 30·sin(0,4), llegó ${e.x}`);
  e.update(0.5); // t = 1 → _wander 12 → ancla 282
  assert.equal(e._wander, 12);
  assert.ok(Math.abs(e.x - (282 + 30 * Math.sin(0.8))) < 1e-9,
    `t = 1: esperaba 282 + 30·sin(0,8), llegó ${e.x}`);

  // Caída larga: los mismos márgenes del tipo (r + 4 = 20 y 520) y el mismo
  // vaivén de hoy: ±30 px de deriva + ±30 px de seno alrededor del ancla.
  // `phase` y `_wanderDir` fijos: el recorrido tiene que ser reproducible
  // (con estos valores el vaivén medido va del ancla −44,3 al ancla +57,3).
  const largo = new Enemy('meteor', entryX, { game, y: -300 });
  largo.phase = 0;
  largo._wanderDir = 1;
  const rec = correr(largo, 600); // 10 s
  assert.equal(rec.murio, false);
  assert.equal(rec.cae, true);
  assert.ok(rec.xMin >= 20 && rec.xMax <= 520, `fuera de los márgenes: [${rec.xMin}, ${rec.xMax}]`);
  assert.ok(rec.xMax >= entryX + 45 && rec.xMin <= entryX - 25,
    `la oscilación de la deriva no es la de hoy: [${rec.xMin}, ${rec.xMax}]`);
  assert.ok(rec.xMax <= entryX + 60 + 1e-9 && rec.xMin >= entryX - 60 - 1e-9,
    `el vaivén se pasó del sobre de ±60: [${rec.xMin}, ${rec.xMax}]`);
  assert.ok(largo._wander <= 30 && largo._wander >= -30, 'el tope de la deriva cambió');
});

test('regresión: el zigzag de la espora conserva sus límites y su amplitud', () => {
  const game = mkGame();
  const entryX = 270;
  // La espora no deriva: su X es el ancla + seno ±26 (freq 3,2), clampeada a
  // 12 px del borde — un margen más estrecho que el de la contención (11):
  // la contención no puede alterar el zigzag.
  const e = new Enemy('spore', entryX, { game, y: 0 });
  e.phase = 0;
  e.update(0.5); // t = 0,5
  assert.ok(Math.abs(e.x - (entryX + 26 * Math.sin(1.6))) < 1e-9,
    `t = 0,5: esperaba 270 + 26·sin(1,6), llegó ${e.x}`);
  e.update(0.5); // t = 1
  assert.ok(Math.abs(e.x - (entryX + 26 * Math.sin(3.2))) < 1e-9,
    `t = 1: esperaba 270 + 26·sin(3,2), llegó ${e.x}`);
  assert.equal(e.baseX, entryX, 'la espora no tiene ancla móvil (no deriva)');
  assert.equal(e._wander, 0, 'ni deriva acumulada');

  // `phase` fijo: el recorrido de la caída larga tiene que ser reproducible
  // (el zigzag llega a los ±26 exactos en cualquier fase, pero mejor fijarlo).
  const largo = new Enemy('spore', entryX, { game, y: -300 });
  largo.phase = 0;
  const rec = correr(largo, 600); // 10 s
  assert.equal(rec.murio, false);
  assert.equal(rec.cae, true);
  assert.ok(rec.xMin >= 12 && rec.xMax <= CONFIG.CANVAS_W - 12,
    `fuera del margen del zigzag: [${rec.xMin}, ${rec.xMax}]`);
  assert.ok(rec.xMax <= entryX + 26 + 1e-9 && rec.xMin >= entryX - 26 - 1e-9,
    `la amplitud del zigzag cambió: [${rec.xMin}, ${rec.xMax}]`);
  assert.ok(rec.xMax >= entryX + 25 && rec.xMin <= entryX - 25,
    `el zigzag no llega a los extremos de hoy: [${rec.xMin}, ${rec.xMax}]`);
});


// ============================================================
// Fase 68 — MECÁNICA de los cuatro afijos nuevos
// ============================================================
//
// El contrato (catálogo, `variants[]`, `scoreMul`) ya está en los tests de
// arriba. Acá se fija lo que HACE cada afijo en combate: el divisor que se
// parte, el sanador que sostiene a los aliados, el acorazado que recorta
// cada golpe y el tenaz que ignora el control.

test('divisor: al morir suelta 2 crías con el 35 % del HP, sin afijo y sin recursión', () => {
  const game = mkGame();
  const madre = new Enemy('meteor', 100, { game, y: 300, variant: 'divisor' });
  game.fortress.enemies.push(madre);
  const hpCria = Math.round(madre.hpMax * ENEMY_VARIANTS.divisor.split.hpFrac);
  const pagoMadre = madre.scoreReward;
  assert.ok(pagoMadre > ENEMY_TYPES.meteor.score, 'la madre es una élite y paga como tal');

  madre.takeDamage(9999, 'electric');

  const crias = game.fortress.enemies.filter((e) => e !== madre);
  assert.equal(crias.length, ENEMY_VARIANTS.divisor.split.count, 'se parte en dos');
  for (const c of crias) {
    assert.equal(c.type, 'meteor', 'la cría es del MISMO tipo');
    assert.equal(c.hpMax, hpCria, 'nace con el 35 % del HP de la madre');
    assert.equal(c.hp, hpCria, 'y con esa vida llena (no al máximo del tipo)');
    assert.deepEqual(c.variants, [], 'la cría NO hereda el afijo');
    assert.equal(c._fromSplit, true, 'queda marcada para no volver a dividirse');
    assert.equal(c.y, 300, 'cae desde donde murió la madre');
    assert.ok(Math.abs(Math.abs(c.x - 100) - 14) < 1e-9, `nace a x ± 14 (fue ${c.x})`);
    assert.ok(c.scoreReward < pagoMadre, 'la cría paga menos que la madre');
    assert.equal(c.scoreReward,
      ENEMY_TYPES.meteor.score * ENEMY_VARIANTS.divisor.split.scoreMul,
      'el pago de la cría es el scoreMul del afijo');
  }
  assert.equal(game.engine.entities.length, 2, 'las dos crías entran al engine');
  assert.ok(game.log.emits.some(([n, p]) => n === 'enemy:killed' && p === madre),
    'la muerte de la madre se sigue anunciando');

  // Sin recursión: una cría ya no se parte (si no, un divisor sería infinito).
  const antes = game.fortress.enemies.length;
  crias[0].takeDamage(9999, 'electric');
  assert.equal(crias[0].dead, true, 'la cría muere normalmente');
  assert.equal(game.fortress.enemies.length, antes, 'y no suelta nada');
});

test('divisor: un jefe nunca se parte, y sin engine/fortaleza no rompe nada', () => {
  const game = mkGame();
  const jefe = new Enemy('boss', 100, { game, y: 0, variant: 'divisor' });
  game.fortress.enemies.push(jefe);
  jefe.die();
  assert.equal(game.fortress.enemies.length, 1, 'el jefe no suelta crías');

  // Sin game (iconos del bestiario) o sin lista viva: el afijo es inerte.
  const suelto = new Enemy('meteor', 100, { y: 300, variant: 'divisor' });
  assert.doesNotThrow(() => suelto.die());
  const sinLista = {
    engine: {
      addEntity() {}, spawnParticles() {}, addEffect() {}, shake() {}, emit() {},
    },
  };
  const soloEngine = new Enemy('meteor', 100, { game: sinLista, y: 300, variant: 'divisor' });
  assert.doesNotThrow(() => soloEngine.die());
});

test('sanador: cura a un aliado herido en el radio, nunca a sí mismo ni por encima del máximo', () => {
  const game = mkGame();
  const san = new Enemy('meteor', 100, { game, y: 300, variant: 'sanador' });
  const herido = new Enemy('meteor', 160, { game, y: 300 });
  const lejos = new Enemy('meteor', 400, { game, y: 300 });
  const lleno = new Enemy('meteor', 140, { game, y: 300 });
  game.fortress.enemies.push(san, herido, lejos, lleno);
  san.hp = san.hpMax * 0.5;
  herido.hp = herido.hpMax * 0.5;
  lejos.hp = lejos.hpMax * 0.5;

  const antesHerido = herido.hp;
  const antesLejos = lejos.hp;
  san.update(0.5); // primer tick del aura (0,5 s)

  const esperado = herido.hpMax * ENEMY_VARIANTS.sanador.healAura.fracPerSec * 0.5;
  assert.ok(Math.abs((herido.hp - antesHerido) - esperado) < 1e-9,
    `debía curar ${esperado} al aliado del radio: ${antesHerido} → ${herido.hp}`);
  assert.equal(san.hp, san.hpMax * 0.5, 'NUNCA se cura a sí mismo');
  assert.equal(lejos.hp, antesLejos, 'fuera del radio no hay cura');
  assert.equal(lleno.hp, lleno.hpMax, 'al aliado sano no lo sobre-cura');

  // Dos sanadores sobre el mismo aliado: curan el doble de rápido, pero el
  // tope sigue siendo el HP máximo (el aura no se apila sin control).
  const objetivo = new Enemy('meteor', 200, { game, y: 300 });
  const san2 = new Enemy('meteor', 210, { game, y: 300, variant: 'sanador' });
  san.entryX = 150; // los dos tienen que quedar dentro del radio en cada tick
  objetivo.hp = objetivo.hpMax - 0.1;
  game.fortress.enemies.push(objetivo, san2);
  for (let i = 0; i < 5; i++) {
    san.x = 150; san.y = 300; san2.x = 210; san2.y = 300;
    objetivo.x = 200; objetivo.y = 300;
    san.update(0.5);
    san2.update(0.5);
  }
  assert.equal(objetivo.hp, objetivo.hpMax, 'la cura se corta en el máximo del aliado');
  assert.ok(objetivo.hp <= objetivo.hpMax, 'y nunca lo pasa');

  // Sin engine (iconos) el aura no existe: no rompe.
  const icono = new Enemy('meteor', 100, { y: 300, variant: 'sanador' });
  assert.doesNotThrow(() => icono.update(1));
});

test('acorazado: armadura plana por golpe, mínimo 1, escudo primero y veneno sin armadura', () => {
  const game = mkGame();
  /** Daño EFECTIVO (escudo + hp) de un golpe de `n`. */
  const entra = (e, n) => {
    const antes = vidaTotal(e);
    e.takeDamage(n, 'electric'); // 'electric' es ×1,0 contra la roca
    return antes - vidaTotal(e);
  };

  const aco = new Enemy('meteor', 100, { game, y: 100, variant: 'acorazado' });
  assert.equal(aco.armor, 2, 'S1: 2 + 0,8 × 0 = 2');
  assert.equal(entra(aco, 1), 1, 'un golpe chico entra con el mínimo de 1 (no es inmunidad)');
  assert.equal(entra(aco, 20), 20 - 2, 'un golpe grande pierde sólo la armadura');

  // Proporción: el acorazado castiga más a la cadencia rápida que al burst.
  const chico = new Enemy('meteor', 100, { game, y: 100, variant: 'acorazado' });
  const grande = new Enemy('meteor', 100, { game, y: 100, variant: 'acorazado' });
  const relChico = entra(chico, 4) / 4;
  const relGrande = entra(grande, 40) / 40;
  assert.ok(relChico < relGrande,
    `el golpe chico tiene que perder proporcionalmente más: ${relChico} vs ${relGrande}`);

  // El escudo se come PRIMERO el golpe entero y la armadura NO lo recorta:
  // sólo el sobrante que llega al hp paga la armadura.
  const doble = new Enemy('meteor', 100, { game, y: 100, variants: ['acorazado', 'escudado'] });
  assert.equal(doble.shieldMax, Math.round(doble.hpMax * 0.40));
  const hp0 = doble.hp;
  const escudo0 = doble.shieldHp;
  doble.takeDamage(escudo0 + 6, 'electric');
  assert.equal(doble.shieldHp, 0, 'el escudo absorbe su pool completo');
  assert.equal(doble.hp, hp0 - Math.max(1, 6 - doble.armor),
    'y del sobrante se resta la armadura, con mínimo 1');

  // VENENO: es daño continuo por frame, va con `{ armor: false }`. Si la
  // armadura lo recortara, cada tick caería en el mínimo de 1 (bypass oculto).
  const envenenado = new Enemy('meteor', 100, { game, y: 100, variant: 'acorazado' });
  const hpVeneno = envenenado.hp;
  Enemy.poison(envenenado, 100, 2); // 100/s
  envenenado.update(0.1);           // 10 de veneno
  assert.ok(Math.abs((hpVeneno - envenenado.hp) - 10) < 1e-9,
    `el veneno NO pasa por la armadura: perdió ${hpVeneno - envenenado.hp}`);
});

test('tenaz: ignora el slow y el stun externos y sigue recibiendo los 5 tipos de daño', () => {
  const game = mkGame();
  /** Un frame con (o sin) control externo encima; devuelve cuánto avanzó. */
  const avance = (e, control) => {
    const y0 = e.y;
    if (control) { e.slowFactor = 0.3; e.stun = 1; }
    e.update(1 / 60);
    return e.y - y0;
  };

  const libre = avance(new Enemy('meteor', 100, { game, y: 200, variant: 'tenaz' }), false);
  assert.ok(libre > 0, 'el enemigo sin control avanza');
  const tenaz = new Enemy('meteor', 100, { game, y: 200, variant: 'tenaz' });
  assert.ok(Math.abs(avance(tenaz, true) - libre) < 1e-9,
    'con slowFactor 0,3 y stun 1 el tenaz avanza exactamente igual');
  assert.equal(tenaz.slowFactor, undefined, 'el slow se descarta al inicio del frame');
  assert.equal(tenaz.stun, 0, 'y el stun también');

  // El test no es trivial: la MISMA trampa frena a un enemigo normal.
  const normal = new Enemy('meteor', 100, { game, y: 200 });
  assert.equal(avance(normal, true), 0, 'un enemigo normal sí queda stuneado');

  for (const dmgType of DAMAGE_TYPE_IDS) {
    const e = new Enemy('meteor', 100, { game, y: 100, variant: 'tenaz' });
    const antes = vidaTotal(e);
    e.takeDamage(8, dmgType);
    assert.ok(antes - vidaTotal(e) > 0, `el tenaz es INMUNE a ${dmgType}`);
  }
});

test('doble afijo: acorazado + sanador conviven (armadura y aura) y el render no rompe', () => {
  const game = mkGame();
  const doble = new Enemy('blob', 100, { game, y: 300, variants: ['acorazado', 'sanador'] });
  const herido = new Enemy('meteor', 150, { game, y: 300 });
  herido.hp = 1;
  game.fortress.enemies.push(doble, herido);

  assert.ok(doble.armor >= 2, 'la armadura del acorazado está puesta');
  assert.ok(doble._healAura, 'y el aura del sanador también');
  doble.update(0.5);
  assert.ok(herido.hp > 1, 'el aura cura aunque el enemigo lleve armadura');

  // Las dos mecánicas de daño conviven: matriz × armadura.
  const antes = doble.hp;
  doble.takeDamage(20, 'electric'); // virus × electric = 0,5 → 10
  assert.equal(doble.hp, antes - Math.max(1, 10 - doble.armor));

  // El render dibuja los DOS rasgos y no toca la simulación.
  let ctx;
  assert.doesNotThrow(() => { ctx = dibujar(doble); });
  assert.ok(ctx.arcs.some((r) => r > doble.r * 1.2), 'se ve el aura del sanador');
  assert.ok(ctx.strokes > 0, 'y las placas del acorazado');
  assert.equal(doble.dead, false);
});

test('fase 68: cada afijo nuevo pinta su rasgo (formas del canvas, sin arte nuevo)', () => {
  const game = mkGame();
  const base = dibujar(new Enemy('meteor', 100, { game, y: 300 }));

  for (const id of ['acorazado', 'tenaz', 'divisor']) {
    const e = new Enemy('meteor', 100, { game, y: 300, variant: id });
    const ctx = dibujar(e);
    assert.ok(ctx.strokes > base.strokes,
      `el afijo ${id} no dibuja nada (trazos ${ctx.strokes} vs ${base.strokes})`);
    assert.equal(e.dead, false, `${id}: el draw no mata`);
    assert.ok(e.hp > 0 && e.hp <= e.hpMax, `${id}: el draw no cura`);
  }

  // El sanador pinta su aura, y además el VÍNCULO con cada aliado herido
  // del radio (los sanos no se curan: no hay vínculo que dibujar).
  const san = new Enemy('meteor', 100, { game, y: 300, variant: 'sanador' });
  const ctxSolo = dibujar(san);
  assert.ok(ctxSolo.arcs.some((r) => r > san.r * 1.2), 'el aura del sanador se dibuja');

  const san2 = new Enemy('meteor', 100, { game, y: 300, variant: 'sanador' });
  const herido = new Enemy('meteor', 150, { game, y: 300 });
  herido.hp = 1;
  game.fortress.enemies.push(san2, herido);
  assert.ok(dibujar(san2).strokes > ctxSolo.strokes,
    'con un aliado herido en el radio aparece el vínculo');
  assert.equal(herido.hp, 1, 'y el render no lo cura');
});
