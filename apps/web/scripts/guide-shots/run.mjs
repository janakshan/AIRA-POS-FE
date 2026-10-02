// Regenerates the user-guide screenshots in public/guide/shots/.
// Needs the app running in mock mode with dev tools hidden, e.g.:
//   VITE_ENABLE_DEVTOOLS=false pnpm --filter @rbp/web exec vite --port 5175
// Usage: node scripts/guide-shots/run.mjs [group ...]
import { readdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { close } from './lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const all = readdirSync(HERE)
  .filter((f) => f.endsWith('.mjs') && !f.startsWith('_') && !['lib.mjs', 'run.mjs'].includes(f))
  .map((f) => f.replace(/\.mjs$/, ''))
  .sort();
const groups = process.argv.slice(2).length ? process.argv.slice(2) : all;

let failed = 0;
for (const group of groups) {
  console.log(`▶ ${group}`);
  try {
    const mod = await import(`./${group}.mjs`);
    await mod.default();
  } catch (e) {
    failed++;
    console.error(`✗ ${group}: ${e.stack ?? e}`);
  }
}
await close();
process.exit(failed ? 1 : 0);
