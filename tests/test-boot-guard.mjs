// Tests de la guarda de arranque de index.html (fix móvil).
//
// La guarda es un script CLÁSICO inline (no un módulo): tiene que correr
// incluso si js/ no carga. Por eso no se importa: se extrae del HTML y se
// ejecuta en node:vm con un DOM mínimo, sin jsdom.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

/** El único <script> inline de index.html (la guarda). */
function bootGuardSource() {
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
  assert.equal(scripts.length, 1, 'index.html debe tener exactamente un script inline');
  return scripts[0][1];
}

/** DOM mínimo para ejecutar la guarda. */
function makeEnv({ protocol = 'https:', capacitor = false } = {}) {
  const timers = [];
  const cleared = [];
  const windowListeners = {};

  const makeEl = (extra = {}) => ({
    hidden: true,
    textContent: '',
    style: {},
    listeners: {},
    addEventListener(type, fn) { this.listeners[type] = fn; },
    ...extra,
  });

  const bootError = makeEl();
  const bootTitle = makeEl();
  const bootMsg = makeEl();
  const bootLoading = makeEl({ hidden: false });
  const bootCmd = makeEl();
  const entry = makeEl();

  const byId = {
    'boot-error': bootError,
    'boot-error-title': bootTitle,
    'boot-error-msg': bootMsg,
    'boot-loading': bootLoading,
    'boot-entry': entry,
  };

  const window = {
    Capacitor: capacitor ? {} : undefined,
    __GDF__: undefined,
    addEventListener(type, fn) { windowListeners[type] = fn; },
  };

  const document = {
    getElementById: (id) => byId[id] ?? null,
    querySelector: (sel) => (sel === '.boot-error-cmd' ? bootCmd : null),
  };

  const sandbox = {
    window,
    document,
    location: { protocol },
    setTimeout: (fn, ms) => {
      const id = timers.length + 1;
      timers.push({ id, fn, ms });
      return id;
    },
    clearTimeout: (id) => { cleared.push(id); },
    console,
  };

  vm.runInNewContext(bootGuardSource(), sandbox, { filename: 'index.html#boot-guard' });

  return {
    window, windowListeners, bootError, bootTitle, bootMsg, bootLoading,
    bootCmd, entry, timers, cleared,
  };
}

test('index.html tiene los nodos que la guarda necesita', () => {
  assert.match(html, /<script[^>]*id="boot-entry"[^>]*src="js\/main\.js"/);
  assert.match(html, /id="boot-error-title"/);
  assert.match(html, /id="boot-error-msg"/);
  assert.match(html, /id="boot-loading"/);
  assert.match(html, /python3 -m http\.server 8080/);
});

test('la guarda espera bastante más que los 2,5 s originales', () => {
  const env = makeEnv();
  assert.equal(env.timers.length, 1);
  assert.ok(
    env.timers[0].ms >= 15000,
    `timeout demasiado corto para una red móvil: ${env.timers[0].ms} ms`,
  );
});

test('https: una falla del entry muestra un mensaje de conexión, no de servidor local', () => {
  const env = makeEnv();
  env.entry.listeners.error();
  assert.equal(env.bootError.hidden, false);
  assert.match(env.bootMsg.textContent, /No se pudo cargar el juego/);
  assert.match(env.bootMsg.textContent, /conexión/i);
  assert.doesNotMatch(env.bootMsg.textContent, /python3|servidor local/i);
  assert.equal(env.bootCmd.style.display, 'none');
  assert.equal(env.bootLoading.hidden, true);
  assert.match(env.bootTitle.textContent, /No se pudo iniciar/);
});

test('file:// muestra las instrucciones de servidor local', () => {
  const env = makeEnv({ protocol: 'file:' });
  env.entry.listeners.error();
  assert.equal(env.bootError.hidden, false);
  assert.match(env.bootMsg.textContent, /servidor local/);
  assert.equal(env.bootCmd.style.display, '');
});

test('Capacitor muestra el mensaje de la app y oculta el comando', () => {
  const env = makeEnv({ capacitor: true });
  env.entry.listeners.error();
  assert.match(env.bootMsg.textContent, /app|WebView/i);
  assert.equal(env.bootCmd.style.display, 'none');
});

test('un error de ejecución en /js muestra el detalle', () => {
  const env = makeEnv();
  env.windowListeners.error({ filename: 'https://x/js_v123/main.js', message: 'boom' });
  assert.equal(env.bootError.hidden, false);
  assert.match(env.bootMsg.textContent, /boom/);
});

test('el timeout avisa que está tardando, no que falló', () => {
  const env = makeEnv();
  env.timers[0].fn();
  assert.equal(env.bootError.hidden, false);
  assert.match(env.bootTitle.textContent, /tardando/i);
  assert.match(env.bootMsg.textContent, /conexión|recargá/i);
});

test('__gdfBootOk cierra carga y aviso y cancela el timer', () => {
  const env = makeEnv();
  env.timers[0].fn(); // primero aparece el aviso
  assert.equal(env.bootError.hidden, false);
  env.window.__gdfBootOk();
  assert.equal(env.bootError.hidden, true);
  assert.equal(env.bootLoading.hidden, true);
  assert.deepEqual(env.cleared, [1]);
});

test('un timeout tardío no tapa el juego si ya booteó', () => {
  const env = makeEnv();
  env.bootLoading.hidden = true; // __gdfBootOk() ya corrió
  env.window.__GDF__ = { game: {} };
  env.timers[0].fn();
  assert.equal(env.bootError.hidden, true);
  assert.equal(env.bootTitle.textContent, '');
  assert.equal(env.bootMsg.textContent, '');
});
