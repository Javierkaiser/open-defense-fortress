// tests/test-licenses.mjs — cobertura de js/licenses.js (datos puros).
//
// Lo que estos tests protegen:
//   1. Que las CUATRO licencias del proyecto estén declaradas (si mañana
//      entra un asset nuevo con otra licencia, falta acá).
//   2. Que el texto embebido sea EXACTAMENTE el archivo canónico del repo.
//      Sin esto, alguien "arregla" una tilde en js/licenses.js y la obra
//      distribuida pasa a mostrar una licencia que no es la licencia.
//   3. Que la atribución CC BY 3.0 tenga los 5 campos que exige §4 b
//      (autor, obra, URI de origen, licencia y —por ser adaptación— el uso
//      y el cambio realizado).
//   4. Que el módulo siga siendo hoja y seguro en Node: sin imports, sin
//      DOM, sin red (se importa tal cual en la suite).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MIT_TEXT, CC_BY_3_0_TEXT, OFL_1_1_TEXT, LICENSES, ATTRIBUTIONS, FONTS, CODE,
} from '../js/licenses.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const lf = (s) => s.replace(/\r\n/g, '\n').trimEnd();

test('licenses: las cuatro licencias del proyecto están declaradas', () => {
  assert.deepEqual(
    Object.keys(LICENSES).sort(),
    ['CC-BY-3.0', 'CC0-1.0', 'MIT', 'OFL-1.1'],
  );
  for (const [id, lic] of Object.entries(LICENSES)) {
    assert.ok(lic.name, `${id} sin nombre canónico`);
    assert.match(lic.url, /^https:\/\//, `${id} sin URI de licencia`);
  }
});

test('licenses: los textos embebidos son los archivos canónicos (verbatim)', () => {
  assert.equal(lf(MIT_TEXT), lf(leer('LICENSE')), 'MIT derivó de LICENSE');
  assert.equal(
    lf(CC_BY_3_0_TEXT), lf(leer('docs/licenses/CC-BY-3.0-legalcode.txt')),
    'CC BY 3.0 derivó del legal code',
  );
  assert.equal(
    lf(OFL_1_1_TEXT), lf(leer('docs/licenses/OFL-1.1.txt')),
    'OFL 1.1 derivó del archivo canónico',
  );
  // Los tamaños son la otra mitad del contrato (un archivo truncado pasaría
  // el test de igualdad solo si ambos se truncan a la vez).
  assert.ok(MIT_TEXT.length >= 1000, 'MIT truncado');
  assert.ok(CC_BY_3_0_TEXT.length >= 19000, 'CC BY 3.0 truncado');
  assert.ok(OFL_1_1_TEXT.length >= 4000, 'OFL 1.1 truncado');
  assert.ok(CC_BY_3_0_TEXT.includes('Attribution 3.0 Unported'), 'no es el legal code de CC BY 3.0');
  assert.ok(OFL_1_1_TEXT.includes('SIL OPEN FONT LICENSE Version 1.1'), 'no es la OFL 1.1');
});

test('licenses: la atribución CC BY 3.0 tiene autor, obra, fuente, licencia y cambios', () => {
  const cc = ATTRIBUTIONS.filter((a) => a.license === 'CC-BY-3.0');
  assert.equal(cc.length, 1, 'tiene que haber UNA atribución CC BY (el icono del Ultimate)');
  const [a] = cc;
  assert.equal(a.author, 'Lorc');
  assert.equal(a.work, 'Power Lightning');
  assert.equal(a.slug, 'power-lightning');
  assert.match(a.source, /^https:\/\/game-icons\.net\//, 'URI de origen (§4 b iii)');
  assert.ok(a.use && a.use.length > 8, 'tiene que decir PARA QUÉ se usa (§4 b iv)');
  assert.ok(a.modified && a.modified.length > 8, 'tiene que declarar el cambio (§4 b iv)');
  assert.equal(a.thumb, 'assets/sprites/ui_tinted/icon_ultimate_gold.png');
});

test('licenses: la CC BY va PRIMERO y es la única que exige atribución', () => {
  assert.equal(ATTRIBUTIONS[0].license, 'CC-BY-3.0', '§4 b: al menos tan prominente como los demás');
  const obligatorias = ATTRIBUTIONS.filter((a) => LICENSES[a.license].text);
  assert.equal(obligatorias.length, 1, 'solo CC BY 3.0 tiene texto de licencia obligatorio en la lista de assets');
});

test('licenses: el módulo es hoja y seguro en Node (sin imports, DOM ni red)', () => {
  const src = leer('js/licenses.js');
  const imports = src.split('\n').filter((l) => /^\s*import\s/.test(l));
  assert.deepEqual(imports, [], 'licenses.js no debe importar nada');
  // Se mira el CÓDIGO, no los comentarios (el header habla de fetch y de DOM).
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const prohibido of ['document.', 'window.', 'fetch(', 'XMLHttpRequest', 'localStorage']) {
    assert.ok(!code.includes(prohibido), `licenses.js no puede usar ${prohibido}`);
  }
});

test('licenses: las tipografías declaradas existen en assets/fonts/', () => {
  assert.equal(FONTS.length, 4);
  for (const f of FONTS) {
    assert.doesNotThrow(() => leer(f.file), `falta ${f.file}`);
    assert.ok(f.authors, `${f.name} sin autores (OFL pide el aviso de copyright)`);
  }
  assert.equal(CODE.license, 'MIT');
  assert.equal(CODE.holder, 'Javier Lust');
});
