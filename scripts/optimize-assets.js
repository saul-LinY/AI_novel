#!/usr/bin/env node

// Writes a WebP sibling next to every PNG under public/assets. The server
// serves the WebP to browsers that accept it, so story data keeps its PNG paths.
//
//   node scripts/optimize-assets.js [--force] [--max-width 1920]

import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ASSETS = path.join(ROOT, 'public', 'assets');
const force = process.argv.includes('--force');
const widthIndex = process.argv.indexOf('--max-width');
const maxWidth = widthIndex > -1 ? Number(process.argv[widthIndex + 1]) : 1920;

async function* pngs(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* pngs(full);
    else if (entry.name.endsWith('.png')) yield full;
  }
}

async function isFresh(source, target) {
  try {
    return (await stat(target)).mtimeMs >= (await stat(source)).mtimeMs;
  } catch {
    return false;
  }
}

let before = 0;
let after = 0;
let written = 0;
for await (const file of pngs(ASSETS)) {
  const target = `${file.slice(0, -4)}.webp`;
  before += (await stat(file)).size;
  if (!force && await isFresh(file, target)) {
    after += (await stat(target)).size;
    continue;
  }
  // Comic pages keep more detail so the lettering stays crisp.
  const quality = file.includes(`${path.sep}comic${path.sep}`) ? 88 : 80;
  await sharp(file).resize({ width: maxWidth, withoutEnlargement: true }).webp({ quality, effort: 5 }).toFile(target);
  after += (await stat(target)).size;
  written += 1;
}
const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;
console.log(`webp: ${written} written · PNG ${mb(before)} → WebP ${mb(after)}`);
