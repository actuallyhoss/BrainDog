/**
 * Install the seed into the record the public demo reads, through the Worker's own routes.
 *
 *   BRAINDOG_API=https://app.brain.dog \
 *   BRAINDOG_DEMO_AUTH='<an owner credential for the demo record, as an Authorization header value>' \
 *   node apps/worker/scripts/provision-demo.mjs
 *
 * NOT RUN BY ANYTHING, and not safe to run casually: it writes to a production record. It is the
 * one out-of-band step the pinned anonymous read (`DEMO_RECORD` in `apps/worker/src/route.ts`) waits
 * on, written down so that the day it can run, it is a command rather than a procedure somebody
 * reconstructs.
 *
 * WHAT IT DOES, IN ORDER, AND IT STOPS AT THE FIRST REFUSAL:
 *
 *   1. `boot`, with the credential. The record must answer and hold no rows, because the seed opens
 *      an empty record; run twice, it would double every register and cross-link the copies.
 *   2. `setDeclaration` for every register, then every metric, then every page, from
 *      `packDocument()`: the same declarations `installSeed` installs, in the form a pack carries
 *      them, and in the order in which each one only names things already declared.
 *   3. `create` for every row, register by register in `ORDER`, with each ref written as the spoken
 *      id `forWrite` gives it (`people#1`), which the record resolves to the row it stored.
 *   4. `boot` again, printing what each register now holds, and the value to set `DEMO_RECORD` to.
 *
 * WHAT IT CANNOT DO TODAY, SAID PLAINLY, because the first two are why it has not been run:
 *
 *   - CREATE THE RECORD. `createRecord` is in `UNROUTED` (`packages/host/src/index.ts`) and the
 *     Directory has no provisioning call the Worker exposes, so nothing reachable over HTTP writes a
 *     record's identity, its owner or its entry in the Directory. That is the sign-up work.
 *   - GET PAST `setDeclaration` WITH A BEARER. It is an ADMIN route, and `admin()` in
 *     `packages/record/src/index.ts` refuses every token by kind (`NEEDS_BROWSER_SESSION`, ADR-060).
 *     ADMIN admits an owner's browser session or an operation grant, and neither is built. The
 *     credential this script sends is whatever those turn out to be; until then it is refused at
 *     step 2 with that sentence, and step 1 is the only thing it can prove.
 *   - SET `DEMO_RECORD`. That is a deploy: `"DEMO_RECORD": "<rec_id>"` in the environment's `vars`
 *     in `apps/worker/wrangler.jsonc`, or `--var DEMO_RECORD:<rec_id>` on the deploy command.
 *
 * AND AFTERWARDS, THE CHECK THAT SWITCHES THE DEMO: `curl -s https://app.brain.dog/api/boot` with no
 * Authorization header answers `"ok":true`. From that deploy on, the sample fallback in
 * `apps/web/src/lib/data/record.ts` is dead code and is deleted, which its own comment says.
 */

import { env, exit } from 'node:process';

import { ORDER, ROWS, forWrite, packDocument } from '../../../packages/seed/src/index.ts';

const base = (env.BRAINDOG_API ?? '').replace(/\/+$/, '');
const auth = env.BRAINDOG_DEMO_AUTH ?? '';
if (!base || !auth) {
  console.error('Set BRAINDOG_API and BRAINDOG_DEMO_AUTH. This script writes to a record; it has no default for either.');
  exit(2);
}

/** One call. Reads are GETs with JSON per value, writes are POSTs, which is what the route table says. */
async function call(name, args = {}, writes = false) {
  const url = new URL(`${base}/api/${name}`);
  if (!writes) for (const [k, v] of Object.entries(args)) url.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  const res = await fetch(url, {
    method: writes ? 'POST' : 'GET',
    headers: { authorization: auth, ...(writes ? { 'content-type': 'application/json' } : {}) },
    ...(writes ? { body: JSON.stringify(args) } : {}),
  });
  const body = await res.json().catch(() => null);
  if (body?.ok !== true) {
    const why = body?.refusal ? `${body.refusal.code}: ${body.refusal.fix}` : `${res.status} with no answer this script recognises`;
    console.error(`${name} was refused. ${why}`);
    exit(1);
  }
  return body.value;
}

const before = await call('boot');
const held = before.registers.filter((r) => r.count > 0);
if (held.length) {
  console.error(`This record already holds rows (${held.map((r) => `${r.id} ${r.count}`).join(', ')}). The seed opens an empty record.`);
  exit(1);
}

const doc = packDocument();
const kindOf = (d) => ('register' in d ? 0 : 'metric' in d ? 1 : 2);
const declarations = [...doc.declarations].sort((a, b) => kindOf(a) - kindOf(b));
for (const body of declarations) await call('setDeclaration', { body }, true);
console.log(`  ${declarations.length} declarations set.`);

let rows = 0;
for (const register of ORDER)
  for (const entry of ROWS[register] ?? []) {
    await call('create', { register, fields: forWrite(register, entry) }, true);
    rows += 1;
  }
console.log(`  ${rows} rows written.`);

const after = await call('boot');
for (const r of after.registers) console.log(`  ${r.id.padEnd(12)} ${r.count}`);
const rec = /^Bearer\s+(rec_[0-9A-Z]{26})\./i.exec(auth)?.[1];
console.log(
  rec
    ? `  Set DEMO_RECORD to ${rec} and deploy, then check: curl -s ${base}/api/boot`
    : `  Set DEMO_RECORD to this record's id and deploy, then check: curl -s ${base}/api/boot`,
);
