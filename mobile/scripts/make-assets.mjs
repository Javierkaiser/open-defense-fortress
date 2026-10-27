#!/usr/bin/env node
// Convierte las fuentes SVG de mobile/assets/src a PNG para @capacitor/assets.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const dir = path.resolve(import.meta.dirname, '..', 'assets');
const src = path.join(dir, 'src');
const jobs = [
  ['icon-only.svg', 'icon-only.png', 1024],
  ['icon-foreground.svg', 'icon-foreground.png', 1024],
  ['icon-background.svg', 'icon-background.png', 1024],
  ['splash.svg', 'splash.png', 2732],
  ['splash-dark.svg', 'splash-dark.png', 2732],
];

for (const [from, to, size] of jobs) {
  const input = path.join(src, from);
  if (!fs.existsSync(input)) {
    console.error(`[assets] falta ${from}`);
    process.exit(1);
  }
  await sharp(input)
    .resize(size, size, { fit: 'cover' })
    .png({ compressionLevel: 9 })
    .toFile(path.join(dir, to));
  console.log(`[assets] ${from} -> ${to} (${size}x${size})`);
}
