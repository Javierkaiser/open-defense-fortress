#!/usr/bin/env node
// Copia el juego estático a mobile/www para que Capacitor lo empaquete.
// No hay build step: el juego se sirve tal cual, solo se limpia el destino.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const out = path.resolve(import.meta.dirname, '..', 'www');
const entries = ['index.html', 'privacy.html', 'css', 'assets', 'js'];

function fail(msg) {
  console.error(`[build-web] ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(path.join(root, 'index.html'))) fail('no existe index.html en la raíz');
if (!fs.existsSync(path.join(root, 'js', 'main.js'))) fail('no existe js/main.js');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const entry of entries) {
  const src = path.join(root, entry);
  const dest = path.join(out, entry);
  if (!fs.existsSync(src)) fail(`falta ${entry}`);
  fs.cpSync(src, dest, { recursive: true });
}

const count = (dir) => fs.readdirSync(dir, { recursive: true, withFileTypes: true })
  .filter((d) => d.isFile()).length;

console.log(`[build-web] OK -> ${path.relative(root, out)}`);
console.log(`[build-web] js: ${count(path.join(out, 'js'))} archivos; assets: ${count(path.join(out, 'assets'))}`);
