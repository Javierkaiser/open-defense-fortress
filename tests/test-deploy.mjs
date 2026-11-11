// tests/test-deploy.mjs — contrato del bundle de deploy (1.17.8)
// -----------------------------------------------------------------------------
// El runtime sigue sin build: los tests y el servidor local leen `js/` tal cual.
// El deploy publica un SOLO `main.js` minificado con esbuild; sin esto, el
// LCP en 3G vuelve a atarse a 57 módulos y ~1,5 MB.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = (p) => readFileSync(path.join(ROOT, p), 'utf8');

const deploy = leer('.github/scripts/deploy-herenow.sh');
const pkg = JSON.parse(leer('package.json'));
const workflow = leer('.github/workflows/deploy-herenow.yml');

test('deploy 1.17.8: bundlea js/main.js en un solo archivo minificado', () => {
  assert.match(deploy, /npx --no-install esbuild "\$REPO\/js\/main\.js"/,
    'el deploy tiene que invocar esbuild sobre el entry');
  for (const flag of ['--bundle', '--minify', '--format=esm', '--target=es2020', '--charset=utf8']) {
    assert.ok(deploy.includes(flag), `falta ${flag} en el bundle`);
  }
  assert.ok(deploy.includes('$STAGING/$JS_DIR/main.js'),
    'el bundle se publica como js_v<sha>/main.js');
  assert.ok(!deploy.includes('cp -r "$REPO/js"'),
    'no se copian los 57 módulos sueltos al staging');
});

test('deploy 1.17.8: esbuild es la única devDependency y no hay deps de runtime', () => {
  assert.deepEqual(pkg.dependencies ?? {}, {}, 'sin dependencias de runtime');
  assert.deepEqual(pkg.devDependencies ?? {}, { esbuild: '0.25.0' },
    'solo esbuild para el bundle de deploy');
});

test('deploy 1.17.8: el workflow instala esbuild antes de publicar', () => {
  assert.ok(workflow.includes('npm install --no-audit --no-fund'),
    'el job de deploy tiene que instalar la devDependency');
  assert.ok(workflow.includes('setup-node@v7'), 'el job de deploy necesita Node');
});
