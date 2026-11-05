// Writes the files the workflows would upload into a local folder (same layout as OneDrive).
// Usage: DATA_DIR=<dir with videos.json> node scripts/build-preview.mjs <outDir> <from> <to> <nowIso>
import fs from 'node:fs';
import path from 'node:path';

const [outDir, from, to, nowIso] = process.argv.slice(2);
const { buildFiles } = await import('../src/tracker.js');
const now = nowIso ? new Date(nowIso) : new Date();
const { files } = await buildFiles({ from, to, now });
for (const f of files) {
  const dest = path.join(outDir, f.path);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, Buffer.from(f.base64, 'base64'));
  console.log(`${(f.size / 1024).toFixed(0).padStart(5)} KB  ${f.path}`);
}
