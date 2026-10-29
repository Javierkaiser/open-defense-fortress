// tests/test-damagetypes.mjs — dev-7 fase 32
// El sistema de TIPOS DE DAÑO: la matriz tipo × familia de enemigo, el
// mapeo torre→tipo y enemigo→familia, y su aplicación en el combate.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAMAGE_TYPES, DAMAGE_TYPE_IDS, ENEMY_FAMILIES, ENEMY_FAMILY_IDS,
  TYPE_MATRIX, ENEMY_FAMILY_BY_TYPE, dmgTypeFor, familyFor,
  dmgMultiplier, isWeakness, isResisted, typeMatchInfo, buildDamageLegendHtml,
  buildBestiaryHtml, BESTIARY_TYPE_IDS,
  // fase 68: las SIETE variantes de élite y su ficha (textos del catálogo).
  BESTIARY_VARIANT_IDS, BESTIARY_VARIANT_SAMPLE, variantInfo, bestiaryVariantsHtml,
} from '../js/damagetypes.js';
import { TOWERS, DRONES, Tower, unitMods } from '../js/towers.js';
import { CATALOG, CAPS } from '../js/cards.js';
import { applyPerkDamage } from '../js/perks.js';
import {
  ENEMY_TYPES, Enemy, ENEMY_ICON_SIZE, ENEMY_VARIANTS,
} from '../js/enemies.js';
import { renderEnemyIcon } from '../js/enemies-bestiary.js';

test('la matriz tiene 5 tipos y 4 familias, sin huecos', () => {
  assert.equal(DAMAGE_TYPE_IDS.length, 5);
  assert.equal(ENEMY_FAMILY_IDS.length, 4);
  for (const d of DAMAGE_TYPE_IDS) {
    assert.ok(DAMAGE_TYPES[d], `falta el tipo ${d}`);
    for (const f of ENEMY_FAMILY_IDS) {
      const m = TYPE_MATRIX[d][f];
      assert.equal(typeof m, 'number', `falta la celda ${d}×${f}`);
      assert.ok(m >= 0.5 && m <= 1.5, `celda fuera de rango: ${d}×${f} = ${m}`);
    }
  }
});

test('cada tipo tiene UNA fortaleza y UNA debilidad, y su media es ×1,0', () => {
  // La regla de oro: el balance global no se mueve por existir la
  // matriz. Si esto se rompe, la campaña se desplaza.
  for (const d of DAMAGE_TYPE_IDS) {
    const row = TYPE_MATRIX[d];
    const sum = ENEMY_FAMILY_IDS.reduce((a, f) => a + row[f], 0);
    assert.ok(Math.abs(sum / ENEMY_FAMILY_IDS.length - 1) < 1e-9,
      `el tipo ${d} tiene media ${(sum / ENEMY_FAMILY_IDS.length).toFixed(3)} (debe ser 1,0)`);
    const fuertes = ENEMY_FAMILY_IDS.filter((f) => row[f] > 1);
    const debiles = ENEMY_FAMILY_IDS.filter((f) => row[f] < 1);
    assert.equal(fuertes.length, 1, `${d} debe tener una sola fortaleza`);
    assert.equal(debiles.length, 1, `${d} debe tener una sola debilidad`);
  }
});

test('las relaciones que pidió el diseño se cumplen', () => {
  // "el tipo luz hace más daño a los tipo virus, o el tipo balístico
  //  que le haga más daño al tipo meteoro"
  assert.ok(dmgMultiplier('light', 'virus') > 1, 'la luz debe pegarle al virus');
  assert.ok(dmgMultiplier('ballistic', 'rock') > 1, 'la balística debe pegarle a la roca');
});

test('el mapeo de unidades a tipos es el pedido', () => {
  const esperado = {
    guardian: 'ballistic', gauss: 'ballistic',
    beam: 'light', laser: 'light',
    missile: 'blast', mortar: 'blast',
    tesla: 'electric', thunderstroke: 'electric',
  };
  for (const [tipo, dmgType] of Object.entries(esperado)) {
    assert.equal(TOWERS[tipo].dmgType, dmgType, `${tipo} debería ser ${dmgType}`);
  }
  for (const d of Object.values(DRONES)) {
    assert.equal(d.dmgType, 'drone', `${d.name} debería ser de tipo dron`);
  }
});

test('el mapeo de enemigos a familias cubre TODOS los tipos', () => {
  for (const t of Object.keys(ENEMY_TYPES)) {
    const fam = ENEMY_TYPES[t].family;
    assert.ok(fam, `el enemigo ${t} no tiene familia`);
    assert.ok(ENEMY_FAMILIES[fam], `familia desconocida: ${fam}`);
    assert.equal(familyFor(t), fam);
  }
  // Y la tabla de damagetypes.js está sincronizada con la de enemies.js
  for (const t of Object.keys(ENEMY_TYPES)) {
    assert.equal(ENEMY_FAMILY_BY_TYPE[t], ENEMY_TYPES[t].family,
      `ENEMY_FAMILY_BY_TYPE y ENEMY_TYPES no coinciden en ${t}`);
  }
});

test('dmgTypeFor traduce los kinds de ataque', () => {
  assert.equal(dmgTypeFor('laser'), 'light');
  assert.equal(dmgTypeFor('beam'), 'light');
  assert.equal(dmgTypeFor('bolt'), 'electric');
  assert.equal(dmgTypeFor('chain'), 'electric');
  assert.equal(dmgTypeFor('drone'), 'drone');
  assert.equal(dmgTypeFor('splash'), 'blast');
  assert.equal(dmgTypeFor('bullet'), 'ballistic');
  assert.equal(dmgTypeFor('blackhole'), null, 'lo que no sea un tipo conocido es null');
});

test('el multiplicador nunca rompe el combate (datos raros → ×1)', () => {
  assert.equal(dmgMultiplier(null, 'rock'), 1);
  assert.equal(dmgMultiplier('ballistic', null), 1);
  assert.equal(dmgMultiplier('inventado', 'rock'), 1);
  assert.equal(dmgMultiplier('ballistic', 'inventada'), 1);
  assert.equal(dmgMultiplier(undefined, undefined), 1);
});

test('isWeakness / isResisted / typeMatchInfo', () => {
  assert.ok(isWeakness('light', 'virus'));
  assert.ok(!isWeakness('light', 'rock'));
  assert.ok(isResisted('light', 'rock'));
  assert.ok(!isResisted('light', 'virus'));
  const info = typeMatchInfo('ballistic', 'rock');
  assert.equal(info.mul, 1.5);
  assert.equal(info.weak, true);
  assert.equal(info.resist, false);
  assert.ok(info.label.includes('Balístico'));
});

test('la leyenda HTML tiene una fila por tipo y una columna por familia', () => {
  const html = buildDamageLegendHtml();
  for (const d of DAMAGE_TYPE_IDS) assert.ok(html.includes(DAMAGE_TYPES[d].name), `falta ${d}`);
  for (const f of ENEMY_FAMILY_IDS) assert.ok(html.includes(ENEMY_FAMILIES[f].name), `falta ${f}`);
  assert.ok(html.includes('leg-weak'), 'deben marcarse las fortalezas');
  assert.ok(html.includes('leg-resist'), 'deben marcarse las debilidades');
});

test('el daño se multiplica por el tipo en el combate real', () => {
  // Meteorito (familia "roca") + bala balística → ×1,5.
  const eng = {
    _t: 0, particles: [], floats: [], entities: [],
    emit() {}, addEffect() {}, addEntity() {}, spawnParticles() {},
    floatText() {}, shake() {}, sfxSafe() {},
  };
  const game = { engine: eng, stageId: 1, lv: 1, xp: 0, score: 0, streak: 0, mult: 1, kills: 0, timer: 0, _leaks: 0 };
  game.fortress = { hp: 1000, maxHp: 1000, enemies: [], drones: [], slots: [] };
  const e = new Enemy('meteor', 270, { game, y: 100 });
  const hp0 = e.hp;
  e.takeDamage(10, 'ballistic');
  assert.equal(e.hp, hp0 - 15, 'la balística hace ×1,5 contra la roca');
  // Y la luz contra el virus (×1,5) y contra la roca (×0,5).
  const v = new Enemy('blob', 270, { game, y: 100 });
  const hpV = v.hp;
  v.takeDamage(10, 'light');
  assert.equal(v.hp, hpV - 15, 'la luz hace ×1,5 contra el virus');
  const r = new Enemy('meteor', 270, { game, y: 100 });
  const hpR = r.hp;
  r.takeDamage(10, 'light');
  assert.equal(r.hp, hpR - 5, 'la luz hace ×0,5 contra la roca');
});

test('el VENENO no se multiplica por el tipo (es daño continuo, no un golpe)', () => {
  const eng = {
    _t: 0, particles: [], floats: [], entities: [],
    emit() {}, addEffect() {}, addEntity() {}, spawnParticles() {},
    floatText() {}, shake() {}, sfxSafe() {},
  };
  const game = { engine: eng, stageId: 1, lv: 1, xp: 0, score: 0, streak: 0, mult: 1, kills: 0, timer: 0, _leaks: 0 };
  game.fortress = { hp: 1000, maxHp: 1000, enemies: [], drones: [], slots: [] };
  const e = new Enemy('meteor', 270, { game, y: 100 });
  const hp0 = e.hp;
  Enemy.poison(e, 10, 2);
  e.update(1);   // 1 s de veneno a 10/s contra un meteoro (roca)
  assert.equal(e.hp, hp0 - 10, 'el veneno hace su daño plano (sin multiplicador de tipo)');
});

test('el crítico contra una debilidad multiplica ×1,5 × ×1,5 = ×2,25', () => {
  // El crítico se calcula ANTES del multiplicador de tipo: la sinergia
  // es real (y visible en el float).
  const eng = {
    _t: 0, particles: [], floats: [], entities: [],
    emit() {}, addEffect() {}, addEntity() {}, spawnParticles() {},
    floatText() {}, shake() {}, sfxSafe() {},
  };
  const game = { engine: eng, stageId: 1, lv: 1, xp: 0, score: 0, streak: 0, mult: 1, kills: 0, timer: 0, _leaks: 0 };
  game.fortress = { hp: 1000, maxHp: 1000, enemies: [], drones: [], slots: [] };
  const e = new Enemy('blob', 270, { game, y: 100 });   // virus
  const hp0 = e.hp;
  e.takeDamage(10, 'light');                            // ×1,5 (tipo)
  assert.equal(e.hp, hp0 - 15, 'la luz hace ×1,5 contra el virus');
  assert.equal(dmgMultiplier('light', 'virus') * 1.5, 2.25,
    'un crítico contra una debilidad sería ×2,25');
});

// ============================================================
// dev-7 fase 40 — BESTIARIO
// La sección de bestiario (HTML puro, sin DOM) y el icono del
// enemigo (el draw REAL, dibujado en un canvas de mentira).
// ============================================================

/** Contexto 2d de mentira: registra las llamadas y no dibuja nada. */
function fakeCtx(calls) {
  const make = () => new Proxy({}, {
    get(t, prop) {
      if (prop in t) return t[prop];
      return (..._args) => { calls.push(String(prop)); return make(); };
    },
    set(t, prop, value) { t[prop] = value; return true; },
  });
  return make();
}

/** Canvas de mentira con su contexto (para renderEnemyIcon). */
function fakeCanvas(calls) {
  return {
    tagName: 'CANVAS', width: 0, height: 0,
    getContext: () => fakeCtx(calls),
  };
}

/** Las tarjetas del bestiario: { type, html } por enemigo. */
function bestiaryCards() {
  const html = buildBestiaryHtml();
  const out = [];
  const re = /data-bestiary-entry="([a-zA-Z]+)"[\s\S]*?<\/li>/g;
  for (const m of html.matchAll(re)) out.push({ type: m[1], html: m[0] });
  return out;
}

test('el bestiario tiene una entrada (y un icono) por cada tipo de enemigo', () => {
  const html = buildBestiaryHtml();
  const entradas = html.match(/data-bestiary-entry="/g) ?? [];
  assert.equal(entradas.length, Object.keys(ENEMY_TYPES).length,
    'una tarjeta por cada tipo de ENEMY_TYPES');
  for (const t of Object.keys(ENEMY_TYPES)) {
    assert.ok(html.includes(`data-bestiary-entry="${t}"`), `falta la entrada ${t}`);
    assert.ok(html.includes(`data-bestiary-icon="${t}"`), `falta el icono de ${t}`);
  }
  // La lista curada cubre los 6 enemigos base del bloque literal.
  for (const t of ['meteor', 'fragment', 'crystal', 'spore', 'blob', 'boss']) {
    assert.ok(BESTIARY_TYPE_IDS.includes(t), `${t} debe estar en BESTIARY_TYPE_IDS`);
  }
});

test('cada enemigo del bestiario muestra su familia y sus stats', () => {
  const cards = bestiaryCards();
  assert.equal(cards.length, Object.keys(ENEMY_TYPES).length);
  for (const { type, html } of cards) {
    const d = ENEMY_TYPES[type];
    const fam = ENEMY_FAMILIES[d.family];
    assert.ok(html.includes(fam.name), `${type}: falta la familia "${fam.name}"`);
    assert.ok(html.includes(fam.glyph), `${type}: falta el glifo de la familia`);
    assert.ok(html.includes(String(d.hp)), `${type}: falta el HP`);
    assert.ok(html.includes(String(d.vel)), `${type}: falta la velocidad`);
    assert.ok(html.includes(String(d.score)), `${type}: falta el score`);
  }
});

test('cada enemigo tiene una celda por cada tipo de daño con su multiplicador', () => {
  for (const { type, html } of bestiaryCards()) {
    const family = ENEMY_TYPES[type].family;
    const celdas = html.match(/<td/g) ?? [];
    assert.equal(celdas.length, DAMAGE_TYPE_IDS.length,
      `${type}: debe tener una celda por cada tipo de daño`);
    let fortalezas = 0;
    let debilidades = 0;
    for (const dt of DAMAGE_TYPE_IDS) {
      const mul = dmgMultiplier(dt, family);
      const value = mul.toFixed(1).replace('.', ',');   // "1,5" / "0,5" / "1,0"
      const mark = mul > 1 ? '▲' : mul < 1 ? '▼' : '·';
      assert.ok(html.includes(`${value}${mark}`),
        `${type}: falta el multiplicador ${dt} = ${value}${mark}`);
      if (mul > 1) {
        fortalezas++;
        assert.ok(html.includes('leg-weak'), `${type}: ${dt} debe marcarse como fortaleza`);
        assert.ok(html.includes('1,5'), `${type}: la fortaleza debe decir 1,5`);
      } else if (mul < 1) {
        debilidades++;
        assert.ok(html.includes('leg-resist'), `${type}: ${dt} debe marcarse como debilidad`);
        assert.ok(html.includes('0,5'), `${type}: la debilidad debe decir 0,5`);
      }
    }
    // Las marcas del HTML tienen que ser las de la matriz (OJO: la regla
    // de "una fortaleza y una debilidad" es POR TIPO DE DAÑO, no por
    // familia: contra la roca, la luz y la explosión son debilidades).
    const marcadas = (html.match(/leg-weak/g) ?? []).length;
    const resistidas = (html.match(/leg-resist/g) ?? []).length;
    assert.equal(marcadas, fortalezas, `${type}: las fortalezas no coinciden con la matriz`);
    assert.equal(resistidas, debilidades, `${type}: las debilidades no coinciden con la matriz`);
  }
});

test('el bestiario documenta la mecánica y la contra de los tanques', () => {
  const html = buildBestiaryHtml(ENEMY_VARIANTS);
  for (const type of ['boulder', 'blob', 'sporePod', 'geode']) {
    const d = ENEMY_TYPES[type];
    assert.ok(d.desc && d.counter, `${type}: falta desc/counter`);
    assert.ok(html.includes(d.desc), `${type}: el bestiario no muestra su mecánica`);
    assert.ok(html.includes(d.counter), `${type}: el bestiario no muestra su contra`);
  }
  assert.ok(html.includes('bestiary-desc'), 'falta el bloque visual de mecánica');
  assert.ok(html.includes('bestiary-counter'), 'falta el bloque visual de contra');
});

test('el bestiario no tiene undefined ni NaN', () => {
  const html = buildBestiaryHtml();
  assert.ok(!html.includes('undefined'), 'el HTML no debe contener "undefined"');
  assert.ok(!html.includes('NaN'), 'el HTML no debe contener "NaN"');
});

test('el icono del bestiario dibuja el enemigo REAL en el canvas', () => {
  for (const t of Object.keys(ENEMY_TYPES)) {
    const calls = [];
    const canvas = fakeCanvas(calls);
    assert.equal(renderEnemyIcon(canvas, t), true, `no se pudo dibujar ${t}`);
    assert.equal(canvas.width, ENEMY_ICON_SIZE, 'el canvas se reescala al tamaño del icono');
    assert.equal(canvas.height, ENEMY_ICON_SIZE);
    assert.ok(calls.includes('fill'), `${t} no pintó nada`);
  }
});

test('el icono es tolerante: nunca rompe el bestiario', () => {
  const calls = [];
  const canvas = fakeCanvas(calls);
  assert.equal(renderEnemyIcon(canvas, 'no-existe'), false, 'tipo desconocido → false');
  assert.equal(renderEnemyIcon(null, 'meteor'), false, 'sin canvas → false');
  assert.equal(renderEnemyIcon({ tagName: 'DIV' }, 'meteor'), false, 'no es un canvas → false');
  const roto = { tagName: 'CANVAS', getContext() { throw new Error('sin 2d'); } };
  assert.equal(renderEnemyIcon(roto, 'meteor'), false, 'contexto roto → false');
  const sinCtx = { tagName: 'CANVAS', getContext: () => null };
  assert.equal(renderEnemyIcon(sinCtx, 'meteor'), false, 'sin contexto → false');
});

// ============================================================
// dev-7 fase 47 — EL JEFE CON REGLAS (fases, vulnerabilidad y regeneracion)
// ============================================================

/** Game minimo para instanciar enemigos (igual que el test de arriba). */
function mkGameEnemies() {
  const eng = {
    _t: 0, particles: [], floats: [], entities: [],
    emit() {}, addEffect() {}, addEntity() {}, spawnParticles() {},
    floatText() {}, shake() {}, sfxSafe() {},
  };
  const game = { engine: eng, stageId: 1, lv: 1, xp: 0, score: 0, streak: 0, mult: 1, kills: 0, timer: 0, _leaks: 0 };
  game.fortress = { hp: 1000, maxHp: 1000, enemies: [], drones: [], slots: [] };
  return game;
}

test('fase 47: el jefe del stage 1 NO tiene reglas (sigue siendo el sencillo)', () => {
  assert.equal((ENEMY_TYPES.boss.phases ?? []).length, 0, 'el jefe del stage 1 usa los campos planos');
  const game = mkGameEnemies();
  const e = new Enemy('boss', 270, { game, y: 100 });
  const hp0 = e.hp;
  e.takeDamage(10, 'light');
  // Familia roca: la luz hace x0,5 (matriz) y la fase NO suma nada.
  assert.equal(e.hp, hp0 - 5, 'sin regla de fase, manda solo la matriz');
  assert.equal(e._phase, null, 'el jefe del stage 1 no tiene fase vigente');
});

test('fase 47: la fase del jefe cambia lo que le hace dano (x1,5 / x0,5)', () => {
  const game = mkGameEnemies();
  const e = new Enemy('blobBoss', 270, { game, y: 100 });
  e._phase = { name: 'FURIA', weakTo: 'light', regen: 0.008 };
  const hp0 = e.hp;
  e.takeDamage(10, 'light');
  // El blobBoss es de familia virus: la luz hace x1,5 por la matriz Y
  // x1,5 por la regla de la fase -> x2,25.
  assert.equal(e.hp, hp0 - 22.5, 'la luz hace x2,25 (matriz x regla de fase)');
  const hp1 = e.hp;
  e.takeDamage(10, 'ballistic');
  // La balistica contra el virus es x1,0 por la matriz y x1,0 por la fase.
  assert.equal(e.hp, hp1 - 10, 'otro tipo no recibe la regla');
});

test('fase 47: la fase de resistencia hace x0,5 al tipo indicado', () => {
  const game = mkGameEnemies();
  const e = new Enemy('hybridBoss', 270, { game, y: 100 });
  e._phase = { name: 'HIBRIDO', resist: 'ballistic', regen: 0.012 };
  const hp0 = e.hp;
  e.takeDamage(10, 'ballistic');
  // El hibrido es de familia roca: la balistica hace x1,5 por la matriz
  // y x0,5 por la regla -> x0,75.
  assert.equal(e.hp, hp0 - 7.5, 'la regla de resistencia se aplica');
});

test('fase 47: la escolta viva regenera al jefe, y sin ella no', () => {
  const game = mkGameEnemies();
  const jefe = new Enemy('armoredBlob', 270, { game, y: 100 });
  jefe._phase = { name: 'PLACAS', resist: 'blast', regen: 0.01 };
  // primero se lo hiere: a tope de vida no se puede ver la regeneracion
  jefe.hp = jefe.hpMax * 0.5;
  const hp0 = jefe.hp;
  jefe._updateBossRegen(0.5);
  assert.equal(jefe.hp, hp0, 'sin escolta el jefe no se cura');
  const esbirro = new Enemy('spore', 250, { game, y: 100 });
  esbirro.escortOf = jefe;
  game.fortress.enemies.push(esbirro);
  const hp1 = jefe.hp;
  jefe._updateBossRegen(0.5);
  assert.ok(jefe.hp > hp1, 'con la escolta viva el jefe se regenera');
  esbirro.dead = true;
  const hp2 = jefe.hp;
  jefe._updateBossRegen(0.5);
  assert.equal(jefe.hp, hp2, 'sin esbirros vivos no hay regeneracion');
});

test('fase 47: la regeneracion tiene tope (una nube no lo hace inmortal)', () => {
  const game = mkGameEnemies();
  const jefe = new Enemy('armoredBlob', 270, { game, y: 100 });
  jefe._phase = { name: 'PLACAS', regen: 0.01 };
  jefe.hp = jefe.hpMax * 0.5; // a tope no se veria la regeneracion
  for (let i = 0; i < 40; i++) {
    const e = new Enemy('spore', 250, { game, y: 100 });
    e.escortOf = jefe;
    game.fortress.enemies.push(e);
  }
  const hp0 = jefe.hp;
  jefe._updateBossRegen(1);
  const recuperado = jefe.hp - hp0;
  const tope = jefe.hpMax * 0.025; // BOSS_REGEN_CAP
  assert.ok(recuperado <= tope + 0.001,
    'la regeneracion no pasa del tope (' + recuperado + ' vs ' + tope + ')');
});

test('fase 47: los esbirros del jefe quedan marcados como su escolta', () => {
  const game = mkGameEnemies();
  const jefe = new Enemy('graveBlob', 270, { game, y: 100 });
  jefe._summon({ type: 'miniBlob', count: 2 }, false);
  const escolta = game.fortress.enemies;
  assert.equal(escolta.length, 2, 'se convocaron 2 esbirros');
  for (const e of escolta) assert.equal(e.escortOf, jefe, 'el esbirro apunta a su jefe');
});

test('fase 47: al cruzar un umbral el jefe cambia de fase (y la deja vigente)', () => {
  const game = mkGameEnemies();
  const jefe = new Enemy('blobBoss', 270, { game, y: 100 });
  assert.equal(jefe._phase, null, 'arranca sin fase');
  jefe.hp = jefe.hpMax * 0.6; // por debajo del primer umbral (0,66)
  jefe._updateBossPhases();
  assert.ok(jefe._phase, 'tiene fase vigente');
  assert.equal(jefe._phase.name, 'FURIA');
  assert.equal(jefe._phase.weakTo, 'light');
});

test('fase 47: los 4 jefes de stage 10+ declaran nombre, regla y regeneracion', () => {
  for (const t of ['blobBoss', 'graveBlob', 'armoredBlob', 'hybridBoss']) {
    const fases = ENEMY_TYPES[t].phases ?? [];
    assert.ok(fases.length >= 2, t + ' tiene fases');
    for (const p of fases) {
      assert.ok(p.name, t + ': una fase sin nombre');
      assert.ok(p.weakTo || p.resist, t + '/' + p.name + ': sin regla de tipo');
      assert.ok(p.regen > 0, t + '/' + p.name + ': sin regeneracion');
    }
  }
  // El jefe del stage 1 se queda sin reglas (es el primero que ve el jugador).
  assert.equal((ENEMY_TYPES.boss.phases ?? []).length, 0, 'el jefe del stage 1 no tiene reglas');
});

// ============================================================
// dev-7 fase 50 — LA CAZA DE FAMILIA
// ============================================================

test('fase 50: la caza multiplica el daño contra esa familia y solo esa', () => {
  const game = mkGameEnemies();
  const g = new Tower('guardian', 270, 1);
  g.game = game;
  // La carta "Caza de Rocas" (x1,8 contra la familia roca).
  g.cardMods = { famRockMul: 1.8 };
  const mods = unitMods(g);

  // Un meteorito es de familia ROCA: la balistica hace x1,5 por la matriz
  // y x1,8 por la caza -> x2,7. OJO: el bonus de la caza se aplica en la
  // CAPA DE PERKS (applyPerkDamage), que es por donde pasa todo el dano
  // de una torre (proyectiles y dano instantaneo).
  const roca = new Enemy('meteor', 270, { game, y: 100 });
  const hpRoca = roca.hp;
  applyPerkDamage(roca, 10, 'ballistic', mods, game, game.fortress.enemies);
  assert.equal(roca.hp, hpRoca - 27, 'contra la roca: 1,5 de la matriz x 1,8 de la caza');

  // Un cristal es de familia CRISTAL: la balistica hace x0,5 por la
  // matriz y la caza no aplica -> x0,5.
  const cristal = new Enemy('crystal', 270, { game, y: 100 });
  const hpCristal = cristal.hp;
  applyPerkDamage(cristal, 10, 'ballistic', mods, game, game.fortress.enemies);
  assert.equal(cristal.hp, hpCristal - 5, 'contra el cristal: la caza no aplica');

  assert.equal(mods.famRockMul, 1.8, 'el mod de la caza viaja en unitMods');
});

test('fase 50: sin carta de caza el daño no cambia', () => {
  const game = mkGameEnemies();
  const g = new Tower('guardian', 270, 1);
  g.game = game;
  const mods = unitMods(g);
  const roca = new Enemy('meteor', 270, { game, y: 100 });
  const hp0 = roca.hp;
  applyPerkDamage(roca, 10, 'ballistic', mods, game, game.fortress.enemies);
  assert.equal(roca.hp, hp0 - 15, 'solo la matriz de tipos: x1,5 contra la roca');
});

test('fase 50: las 4 cartas de caza existen, tienen tope 1 y son de familia', () => {
  const ids = ['hunt_rock', 'hunt_crystal', 'hunt_spore', 'hunt_virus'];
  for (const id of ids) {
    const card = CATALOG.find((c) => c.id === id);
    assert.ok(card, `falta la carta ${id}`);
    assert.equal(CAPS[id], 1, `${id} debe tener tope 1 (si se aplicara dos, el multiplicador seria x3,24)`);
    assert.ok(card.desc.includes('×1,8'), `${id}: la descripcion debe decir el multiplicador`);
  }
  // Las 4 familias tienen su carta (una por familia).
  const familias = new Set(ids.map((id) => id.replace('hunt_', '')));
  assert.equal(familias.size, 4, 'una carta por familia');
});

// ============================================================
// fase 68 — ÉLITES 2.0: LAS SIETE VARIANTES EN EL BESTIARIO
//
// Los textos de cada variante viven en el CATÁLOGO (ENEMY_VARIANTS,
// js/enemies.js): el bestiario los consume TAL CUAL. Sólo las tablas
// mínimas viejas (con los modificadores sueltos, sin `desc`/`counter`)
// caen en los textos de respaldo, y sólo para las tres históricas.
// ============================================================

/** Los ids, en orden cronológico de aparición (design §Decisión 4). */
const VARIANTES_EN_ORDEN = [
  'escudado', 'rapido', 'divisor', 'sanador', 'regenerador', 'acorazado', 'tenaz',
];

/** El trozo de un texto que esc() NO toca (para buscarlo en el HTML). */
const fragmento = (txt) => String(txt).split(/[<>&"']/)[0].trim();

test('fase 68: el bestiario documenta las 7 variantes en orden de aparición', () => {
  assert.deepEqual(BESTIARY_VARIANT_IDS, VARIANTES_EN_ORDEN);
  // Cada variante trae un enemigo de EJEMPLO que existe en el catálogo.
  for (const id of VARIANTES_EN_ORDEN) {
    const sample = BESTIARY_VARIANT_SAMPLE[id];
    assert.ok(sample, `${id}: sin enemigo de ejemplo`);
    assert.ok(ENEMY_TYPES[sample], `${id}: el ejemplo "${sample}" no está en ENEMY_TYPES`);
  }
});

test('fase 68: cada variante toma su nombre y sus textos del catálogo', () => {
  for (const id of VARIANTES_EN_ORDEN) {
    const d = ENEMY_VARIANTS[id];
    assert.ok(d, `falta la variante ${id} en ENEMY_VARIANTS`);
    const v = variantInfo(id, d);
    assert.ok(v, `${id}: sin ficha`);
    assert.equal(v.name, d.name, `${id}: el nombre sale del catálogo`);
    assert.equal(v.effect, d.desc, `${id}: "qué hace" es el desc del catálogo`);
    assert.equal(v.counter, d.counter, `${id}: el contra-juego es el counter del catálogo`);
    assert.ok(v.effect.trim() !== '' && v.counter.trim() !== '', `${id}: sin textos`);
  }
});

test('fase 68: las 7 fichas del HTML traen efecto y contra-juego', () => {
  const html = bestiaryVariantsHtml(ENEMY_VARIANTS);
  assert.equal((html.match(/data-variant="/g) ?? []).length, VARIANTES_EN_ORDEN.length);
  for (const id of VARIANTES_EN_ORDEN) {
    const d = ENEMY_VARIANTS[id];
    const card = html.split(`data-variant="${id}"`)[1]?.split('</li>')[0] ?? '';
    assert.ok(card.includes('Qué hace:'), `${id}: sin efecto`);
    assert.ok(card.includes('Cómo se contrarresta:'), `${id}: sin contra-juego`);
    assert.ok(card.includes(fragmento(d.desc)), `${id}: no muestra su desc`);
    assert.ok(card.includes(fragmento(d.counter)), `${id}: no muestra su counter`);
  }
  assert.ok(!html.includes('undefined'), 'el HTML no debe contener "undefined"');
  assert.ok(!html.includes('NaN'), 'el HTML no debe contener "NaN"');
});

test('fase 68: una tabla mínima vieja cae en los textos de respaldo', () => {
  const minima = {
    escudado: { shieldFrac: 0.4 },
    rapido: { velMul: 1.4, hpMul: 0.7 },
    regenerador: { regenFrac: 0.02 },
  };
  const escudado = variantInfo('escudado', minima.escudado);
  assert.equal(escudado.name, 'escudado', 'sin nombre en el dato, el id');
  assert.ok(escudado.effect.includes('escudo frontal'), 'escudado: texto de respaldo');
  assert.ok(escudado.effect.includes('del 40 % de su vida'), 'shieldFrac 0.4 → 40 %');
  assert.ok(escudado.counter.trim() !== '', 'escudado: contra-juego de respaldo');

  const rapido = variantInfo('rapido', minima.rapido);
  assert.ok(rapido.effect.includes('un 40 % más'), 'velMul 1.4 → 40 %');
  assert.ok(rapido.effect.includes('un 30 % menos de vida'), 'hpMul 0.7 → 30 %');

  const regenerador = variantInfo('regenerador', minima.regenerador);
  assert.ok(regenerador.effect.includes('un 2 % de su vida por segundo'), 'regenFrac 0.02');

  // Las CUATRO nuevas no tienen respaldo: sin `desc`/`counter` no hay
  // ficha (el bestiario no inventa textos).
  for (const id of ['divisor', 'sanador', 'acorazado', 'tenaz']) {
    assert.equal(variantInfo(id, { scoreMul: 1.35 }), null, `${id}: no inventa texto`);
  }
  // Tolerante a datos basura.
  assert.equal(variantInfo('escudado', null), null);
  assert.equal(variantInfo('', { desc: 'x', counter: 'y' }), null);
  assert.equal(variantInfo('escudado', 'no soy un objeto'), null);
});
