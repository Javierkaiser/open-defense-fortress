// tests/test-level-up.mjs — modal de level-up (1.17.1)
// -----------------------------------------------------------------------------
// Contrato de `openspec/specs/gameplay/level-up-choice/spec.md`:
//   · las cartas se identifican por unidad (chip `TORRE · …`, `GLOBAL · TODAS`);
//   · la línea "Requiere: …" se deriva de los `requires*` sin duplicar el texto;
//   · las descripciones no usan jerga interna y nunca quedan vacías.
//
// La parte de INPUT (sólo puntero, Espacio/Enter inertes, foco en el diálogo)
// vive en `test-hud.mjs` y `test-engine.mjs`, donde están los stubs de DOM.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from '../js/cards.js';
import { LEGENDARY_CARDS } from '../js/cards-legendary.js';
import { cardUnitLabel, cardRequiresText, cardsScrollState } from '../js/hud-builders.js';

const TODAS = [...CATALOG, ...LEGENDARY_CARDS];

/** Formatos válidos del chip (especie · nombre). */
const FORMATO = /^(TORRE|DRON|NUEVA TORRE|NUEVO DRON|COMBO|TIPO|GLOBAL) · \S/;

test('1.17.1: las 141 cartas resuelven a qué unidad pertenecen', () => {
  assert.ok(TODAS.length >= 140, `catálogo chico: ${TODAS.length}`);
  for (const c of TODAS) {
    const u = cardUnitLabel(c);
    assert.ok(u && typeof u.label === 'string' && u.label.length > 2,
      `${c.id}: etiqueta vacía`);
    assert.match(u.label, FORMATO, `${c.id}: formato inválido (${u.label})`);
    if (c.unit) {
      assert.match(u.label, /^(TORRE|DRON) · /,
        `${c.id}: con unit debería decir TORRE/DRON (${u.label})`);
    }
  }
});

test('1.17.1: el chip distingue torre, dron, desbloqueo, combo, tipo y global', () => {
  assert.equal(cardUnitLabel({ unit: 'mortar' }).label, 'TORRE · MORTAR');
  assert.equal(cardUnitLabel({ unit: 'wasps' }).label, 'DRON · MOSQUITOS');
  assert.equal(cardUnitLabel({ tower: 'gauss' }).label, 'NUEVA TORRE · GAUSS');
  assert.equal(cardUnitLabel({ drone: 'wasps' }).label, 'NUEVO DRON · MOSQUITOS');
  assert.equal(cardUnitLabel({ requiresUnits: ['missile', 'mortar'] }).label,
    'COMBO · MISSILE + MORTAR');
  assert.equal(cardUnitLabel({ requiresTags: ['blast'] }).label,
    'COMBO · MISSILE + MORTAR');
  assert.equal(cardUnitLabel({ type: 'light' }).label, 'TIPO · LUZ');
  assert.equal(cardUnitLabel({}).label, 'GLOBAL · TODAS');
  assert.equal(cardUnitLabel(null).label, 'GLOBAL · TODAS', 'tolera cartas nulas');
});

test('1.17.1: la línea "Requiere" sale de los requires* sin duplicar el texto', () => {
  assert.equal(cardRequiresText({ requiresUnits: ['beam', 'laser'], desc: 'algo' }),
    'Requiere: Beam + Láser');
  assert.equal(cardRequiresText({ requiresTags: ['blast'], desc: 'algo' }),
    'Requiere: Missile + Mortar');
  assert.equal(cardRequiresText({ requiresBlackHole: true, desc: 'algo' }),
    'Requiere: Black Hole');
  assert.equal(cardRequiresText({ requiresBlackHole: true, desc: 'Requiere Black Hole' }),
    '', 'si la descripción ya lo dice, no duplica');
  assert.equal(cardRequiresText({ desc: 'global' }), '');
  assert.equal(cardRequiresText(null), '');
});

test('1.17.1: todo requisito es visible (línea propia o en la descripción)', () => {
  const conReq = TODAS.filter((c) => (c.requiresUnits?.length
    || c.requiresTags?.length || c.requiresCards?.length || c.requiresBlackHole));
  assert.ok(conReq.length >= 10, `sólo ${conReq.length} cartas con requisito`);
  for (const c of conReq) {
    const visible = cardRequiresText(c) !== '' || /requiere/i.test(String(c.desc));
    assert.ok(visible, `${c.id}: el requisito no es visible para el jugador`);
  }
  // La línea propia se usa cuando el texto no lo dice (no se duplica).
  const propias = TODAS.filter((c) => cardRequiresText(c));
  assert.ok(propias.length >= 3, `sólo ${propias.length} cartas con línea propia`);
  for (const c of propias) {
    assert.match(cardRequiresText(c), /^Requiere: \S/, `${c.id}: línea inválida`);
  }
});

test('1.17.1: ninguna descripción usa jerga interna ni queda vacía', () => {
  const JERGA = /\b(ramp|homing|ttk|proc|stacks?)\b/i;
  for (const c of TODAS) {
    assert.ok(typeof c.desc === 'string' && c.desc.trim().length > 0,
      `${c.id}: descripción vacía`);
    assert.ok(!JERGA.test(c.desc), `${c.id}: jerga interna en "${c.desc}"`);
  }
});

test('1.17.1: las cartas que declaran efecto traen al menos un número', () => {
  const SIN_NUMERO_OK = new Set(['tech_bounce', 'black_hole']);
  const faltan = TODAS.filter((c) => !SIN_NUMERO_OK.has(c.id)
    && !/\d/.test(String(c.desc)));
  assert.deepEqual(faltan.map((c) => c.id), [],
    'estas cartas describen un efecto sin ningún número');
});

test('adapt 1.17.4: la pista de scroll solo aparece si hay más abajo', () => {
  assert.deepEqual(
    cardsScrollState({ scrollHeight: 657, clientHeight: 450, scrollTop: 0 }),
    { more: true, atEnd: false, show: true },
    'con contenido abajo y sin scrollear, se muestra la pista',
  );
  assert.deepEqual(
    cardsScrollState({ scrollHeight: 657, clientHeight: 450, scrollTop: 207 }),
    { more: true, atEnd: true, show: false },
    'al llegar al final, la pista se apaga',
  );
  assert.deepEqual(
    cardsScrollState({ scrollHeight: 450, clientHeight: 450, scrollTop: 0 }),
    { more: false, atEnd: true, show: false },
    'si todo entra, no hay pista',
  );
  assert.deepEqual(cardsScrollState(),
    { more: false, atEnd: true, show: false });
});
