// tests/test-version.mjs — fase 75
// Una sola versión visible: js/version.js, package.json y mobile/version.json
// no pueden divergir (el pie del menú usa VERSION; el wrapper Android usa
// versionName). Un bump a medias rompe el badge del README y el APK.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSION } from '../js/version.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const readJson = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));

test('fase 75: la versión del runtime, package.json y Android coincide', () => {
  assert.equal(readJson('package.json').version, VERSION);
  assert.equal(readJson('mobile/package.json').version, VERSION);
  const android = readJson('mobile/version.json');
  assert.equal(android.versionName, VERSION);
  assert.ok(Number.isInteger(android.versionCode) && android.versionCode > 0);
});
