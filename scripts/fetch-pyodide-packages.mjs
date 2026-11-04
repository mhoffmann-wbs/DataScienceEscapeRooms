// Downloads the Pyodide package wheels that rooms declare (manifest `packages`), plus their
// dependencies, into vendor/pyodide/ (gitignored). The site serves them next to the Pyodide
// core (see vite.config.ts), and Node tests load them from there.
// Usage: npm run fetch-packages
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const pyodideDir = dirname(createRequire(import.meta.url).resolve('pyodide/package.json'));
const { version } = JSON.parse(readFileSync(join(pyodideDir, 'package.json'), 'utf8'));
const lock = JSON.parse(readFileSync(join(pyodideDir, 'pyodide-lock.json'), 'utf8')).packages;
const OUT = 'vendor/pyodide';
const CDN = `https://cdn.jsdelivr.net/pyodide/v${version}/full/`;

const wanted = new Set();
for (const room of readdirSync('content/rooms')) {
  const file = join('content/rooms', room, 'manifest.json');
  if (existsSync(file)) for (const p of JSON.parse(readFileSync(file, 'utf8')).packages ?? []) wanted.add(p);
}

// Dependency closure.
const all = new Set();
const visit = (name) => {
  if (all.has(name)) return;
  const pkg = lock[name];
  if (!pkg) throw new Error(`Unknown Pyodide package "${name}" (not in pyodide-lock.json)`);
  all.add(name);
  pkg.depends.forEach(visit);
};
wanted.forEach(visit);

mkdirSync(OUT, { recursive: true });
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
let bytes = 0;
for (const name of [...all].sort()) {
  const { file_name: file, sha256: expected } = lock[name];
  const target = join(OUT, file);
  if (existsSync(target) && sha256(readFileSync(target)) === expected) {
    bytes += readFileSync(target).length;
    continue;
  }
  const res = await fetch(CDN + file);
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (sha256(buf) !== expected) throw new Error(`${file}: checksum mismatch`);
  writeFileSync(target, buf);
  bytes += buf.length;
  console.log(`fetched ${file}`);
}
console.log(`${all.size} packages for [${[...wanted].join(', ')}] in ${OUT} (${(bytes / 1e6).toFixed(1)} MB)`);
