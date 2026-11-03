/**
 * Writes `packages/declare/schema/pack.schema.json` from `packSchema()`, and the copy the site serves at
 * brain.dog/schema/pack.schema.json. `--check` writes nothing and exits 1 when either file is not what it would write.
 *
 *   node packages/declare/scripts/pack-schema.ts [--check]
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { argv, exit } from 'node:process';
import { fileURLToPath } from 'node:url';

import { packSchema } from '../src/pack-schema.ts';

const WHERE = [new URL('../schema/pack.schema.json', import.meta.url), new URL('../../../apps/site/static/schema/pack.schema.json', import.meta.url)].map((u) => fileURLToPath(u));
const text = `${JSON.stringify(packSchema(), null, 2)}\n`;
const check = argv.includes('--check');
let stale = 0;
for (const file of WHERE) {
  const now = existsSync(file) ? readFileSync(file, 'utf8') : null;
  if (now === text) continue;
  if (check) {
    console.log(`${file} is behind the lists BrainDog reads. Run node packages/declare/scripts/pack-schema.ts.`);
    stale++;
    continue;
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  console.log(`Wrote ${file}.`);
}
if (!check && stale === 0) console.log('The add-on schema is written.');
exit(stale > 0 ? 1 : 0);
