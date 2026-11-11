// tests/test-transitions.mjs — overdrive 1.17.11
// Cubre js/transitions.js sin DOM real: clasificación de pares de
// pantalla, geometría de los clip-path, guardas de soporte/movimiento
// reducido y el ciclo de vida de startViewTransition (incluida una
// transición que pisa a otra). También revisa el contrato del CSS y el
// cableado del HUD.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  transitionKind, supportsViewTransition, prefersReducedMotion,
  rectVars, applyRectVars, clearRectVars, RECT_VAR_NAMES,
  setViewTransitionName, clearViewTransitionNames, runViewTransition,
} from '../js/transitions.js';

const css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
const hudSrc = readFileSync(new URL('../js/hud-core.js', import.meta.url), 'utf8');

const tick = () => new Promise((resolve) => setImmediate(resolve));

/** classList mínima e iterable, como la del DOM. */
function fakeClassList(initial = []) {
  const set = new Set(initial);
  return {
    add: (...names) => names.forEach((n) => set.add(n)),
    remove: (...names) => names.forEach((n) => set.delete(n)),
    contains: (name) => set.has(name),
    [Symbol.iterator]: () => set[Symbol.iterator](),
  };
}

function fakeStyle() {
  const map = new Map();
  return {
    setProperty: (k, v) => map.set(k, String(v)),
    removeProperty: (k) => map.delete(k),
    getPropertyValue: (k) => map.get(k) ?? '',
  };
}

function fakeDoc() {
  const root = { classList: fakeClassList(), style: fakeStyle() };
  const doc = {
    documentElement: root,
    _update: null,
    _vt: null,
    startViewTransition(update) {
      doc._update = update;
      // Cada transición tiene su propio par resolve/reject: una segunda
      // no puede resolver la promesa de la primera.
      let resolveFinished = null;
      let rejectFinished = null;
      const finished = new Promise((resolve, reject) => {
        resolveFinished = resolve;
        rejectFinished = reject;
      });
      finished.catch(() => {}); // el test decide si la rechaza
      const vt = {
        ready: Promise.resolve(),
        updateCallbackDone: Promise.resolve(),
        finished,
        resolve: () => resolveFinished(),
        reject: (err) => rejectFinished(err),
      };
      doc._vt = vt;
      return vt;
    },
  };
  return doc;
}

test('transitionKind: clasifica cada par con intención', () => {
  const cases = [
    [null, 'MENU', null],
    ['MENU', 'MENU', null],
    ['MENU', 'SELECT_STAGE', 'push-forward'],
    ['MENU', 'TORRETAS', 'push-forward'],
    ['SELECT_STAGE', 'MENU', 'push-back'],
    ['SELECT_STAGE', 'PROTOCOLO', 'push-forward'],
    ['PROTOCOLO', 'SELECT_STAGE', 'push-back'],
    ['MENU', 'PLAYING', 'deploy'],
    ['SELECT_STAGE', 'PLAYING', 'deploy'],
    ['STAGE_CLEAR', 'PLAYING', 'deploy'],
    ['GAME_OVER', 'PLAYING', 'deploy'],
    ['PLAYING', 'PAUSED', 'pause-in'],
    ['PAUSED', 'PLAYING', 'pause-out'],
    ['PAUSED', 'MENU', 'push-back'],
    ['PAUSED', 'SELECT_STAGE', 'push-back'],
    ['PLAYING', 'STAGE_CLEAR', 'rise'],
    ['PLAYING', 'GAME_OVER', 'rise'],
    ['STAGE_CLEAR', 'SELECT_STAGE', 'push-back'],
    ['GAME_OVER', 'MENU', 'push-back'],
    ['CARD_CHOICE', 'PLAYING', null],
    ['PLAYING', 'CARD_CHOICE', null],
    ['PLAYING', 'MENU', 'fade'],
    ['RECORDS', 'MENU', 'push-back'],
  ];
  for (const [from, to, want] of cases) {
    assert.equal(transitionKind(from, to), want, `${from} → ${to}`);
  }
});

test('supportsViewTransition / prefersReducedMotion: guardas sin DOM', () => {
  assert.equal(supportsViewTransition(null), false);
  assert.equal(supportsViewTransition({}), false);
  assert.equal(supportsViewTransition({ startViewTransition() {} }), true);
  assert.equal(prefersReducedMotion(null), false);
  assert.equal(prefersReducedMotion({}), false);
  assert.equal(prefersReducedMotion({
    matchMedia: () => { throw new Error('bloqueado'); },
  }), false);
  assert.equal(prefersReducedMotion({
    matchMedia: () => ({ matches: true }),
  }), true);
  assert.equal(prefersReducedMotion({
    matchMedia: () => ({ matches: false }),
  }), false);
});

test('rectVars: convierte el rectángulo y recorta al viewport', () => {
  const vars = rectVars({ top: 100, left: 50, right: 350, bottom: 500 }, 400, 800);
  assert.deepEqual(vars, {
    top: '100px', right: '50px', bottom: '300px', left: '50px',
    cx: '200px', cy: '300px',
  });
  // Fuera de pantalla: todo se recorta, nunca hay medidas negativas.
  const off = rectVars({ top: -100, left: -50, right: -10, bottom: -20 }, 400, 800);
  assert.deepEqual(off, {
    top: '0px', right: '400px', bottom: '800px', left: '0px',
    cx: '0px', cy: '0px',
  });
  // Sin rect (teclado, nodo ausente): el origen es el centro del viewport.
  const nil = rectVars(null, 400, 800);
  assert.deepEqual(nil, {
    top: '400px', right: '200px', bottom: '400px', left: '200px',
    cx: '200px', cy: '400px',
  });
});

test('applyRectVars/clearRectVars: escriben y limpian las seis variables', () => {
  const root = { style: fakeStyle() };
  applyRectVars(root, { top: 100, left: 50, right: 350, bottom: 700 }, 400, 800);
  assert.equal(root.style.getPropertyValue('--vt-top'), '100px');
  assert.equal(root.style.getPropertyValue('--vt-right'), '50px');
  assert.equal(root.style.getPropertyValue('--vt-bottom'), '100px');
  assert.equal(root.style.getPropertyValue('--vt-left'), '50px');
  assert.equal(root.style.getPropertyValue('--vt-cx'), '200px');
  assert.equal(root.style.getPropertyValue('--vt-cy'), '400px');
  clearRectVars(root);
  for (const name of RECT_VAR_NAMES) {
    assert.equal(root.style.getPropertyValue(name), '');
  }
});

test('setViewTransitionName y clearViewTransitionNames limpian huérfanos', () => {
  const el = { style: fakeStyle() };
  setViewTransitionName(el, 'lv-hero');
  assert.equal(el.style.getPropertyValue('view-transition-name'), 'lv-hero');
  setViewTransitionName(el, '');
  assert.equal(el.style.getPropertyValue('view-transition-name'), '');

  const a = { style: fakeStyle() };
  const b = { style: fakeStyle() };
  a.style.setProperty('view-transition-name', 'a');
  b.style.setProperty('view-transition-name', 'b');
  let queried = null;
  const doc = {
    querySelectorAll(sel) { queried = sel; return [a, b]; },
  };
  assert.equal(clearViewTransitionNames(doc), 2);
  assert.match(queried, /view-transition-name/);
  assert.equal(a.style.getPropertyValue('view-transition-name'), '');
  assert.equal(b.style.getPropertyValue('view-transition-name'), '');
  // Sin querySelectorAll (DOM de prueba incompleto) no rompe.
  assert.equal(clearViewTransitionNames({}), 0);
});

test('runViewTransition: sin soporte corre síncrono y limpia', () => {
  let ran = 0;
  let cleaned = 0;
  const doc = { documentElement: { classList: fakeClassList() } };
  const vt = runViewTransition(doc, () => { ran += 1; }, {
    kind: 'deploy',
    onCleanup: () => { cleaned += 1; },
  });
  assert.equal(vt, null);
  assert.equal(ran, 1);
  assert.equal(cleaned, 1);
});

test('runViewTransition: con soporte muta en el callback y limpia al terminar', async () => {
  const doc = fakeDoc();
  let ran = 0;
  const vt = runViewTransition(doc, () => { ran += 1; }, { kind: 'deploy' });
  assert.ok(vt);
  assert.equal(ran, 0, 'el DOM todavía no se tocó');
  assert.ok(doc.documentElement.classList.contains('vt-active'));
  assert.ok(doc.documentElement.classList.contains('vt-deploy'));

  doc._update();
  assert.equal(ran, 1);
  vt.resolve();
  await tick();
  assert.equal(doc.documentElement.classList.contains('vt-active'), false);
  assert.equal(doc.documentElement.classList.contains('vt-deploy'), false);
});

test('runViewTransition: movimiento reducido usa fade corto', () => {
  const doc = fakeDoc();
  const win = { matchMedia: () => ({ matches: true }) };
  runViewTransition(doc, () => {}, { kind: 'deploy', win });
  assert.ok(doc.documentElement.classList.contains('vt-fade'));
  assert.ok(doc.documentElement.classList.contains('vt-reduced'));
  assert.ok(!doc.documentElement.classList.contains('vt-deploy'));
});

test('runViewTransition: la transición vieja no limpia la nueva', async () => {
  const doc = fakeDoc();
  const first = runViewTransition(doc, () => {}, { kind: 'pause-in' });
  // La nueva empieza antes de que la vieja termine (level-up al reanudar).
  runViewTransition(doc, () => {}, { kind: 'deploy' });
  assert.ok(doc.documentElement.classList.contains('vt-deploy'));
  first.reject(new Error('skipped'));
  await tick();
  assert.ok(doc.documentElement.classList.contains('vt-deploy'),
    'el cleanup viejo no puede apagar la transición nueva');
  assert.ok(doc.documentElement.classList.contains('vt-active'));
});

test('CSS: tokens, kinds y fallback de .screen', () => {
  assert.ok(css.includes('--vt-dur-deploy: 420ms'));
  assert.ok(css.includes('--vt-dur-card: 360ms'));
  assert.ok(css.includes('--vt-ease: cubic-bezier'));
  assert.ok(/\.screen\.is-vt,[\s\S]*?\.menu-tile-grid > \* \{[\s\S]*?animation: none;/.test(css),
    'la pantalla nueva no puede capturar las entradas CSS en el frame 0');
  assert.ok(hudSrc.includes("classList?.add('is-vt')"),
    'el HUD marca la pantalla que entra con transición');
  for (const kind of ['push-forward', 'push-back', 'deploy', 'pause-in', 'pause-out', 'rise', 'card']) {
    assert.ok(css.includes(`html.vt-${kind}::view-transition`), `falta el kind ${kind}`);
  }
  assert.ok(/@keyframes vt-deploy-in[^}]*clip-path: inset\(/s.test(css));
  assert.ok(/@keyframes vt-pause-in[^}]*clip-path: circle\(/s.test(css));
  assert.ok(/@keyframes vt-rise-in[^}]*clip-path: inset\(100%/s.test(css));
  assert.ok(css.includes('::view-transition-group(lv-hero)'));
  assert.ok(css.includes('html.vt-reduced { --vt-dur-active: 120ms; }'));
});

test('HUD: showScreen usa el clasificador y el modal usa el chip Lv', () => {
  assert.ok(hudSrc.includes("from './transitions.js'"));
  assert.ok(hudSrc.includes('transitionKind(from, name)'));
  assert.ok(hudSrc.includes('_transitionScreen(kind, name, data)'));
  assert.ok(hudSrc.includes("setViewTransitionName(chip, 'lv-hero')"));
  assert.ok(hudSrc.includes("querySelector('.card-head span:last-child')"));
  assert.ok(hudSrc.includes('clearViewTransitionNames(doc)'));
});
