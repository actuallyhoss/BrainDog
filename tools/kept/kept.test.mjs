/**
 * The kept lane against the Cloud harness: `startCloud` from `apps/worker/test/cloud-serve.ts`, as the drill's
 * own test runs it (`tools/drill/drill.test.mjs`), sign-up by invitation, every letter captured, and the lane's stand-in
 * in the platform's `fetch` for each turn (`harnessOf`).
 *
 * GREEN FOR EVERY ADD-ON WHOSE CODE RUNS HERE, AND A NAMED RED FOR EACH THAT DOES NOT. The harness binds no script
 * sandbox (`LOADER`), so the two add-ons that are scripts, stripe and portfolio-bands, are FAIL lines quoting the
 * Worker's own sentence, and stripe's refused-key line skips for want of a run. `SCRIPT_BOUND` names them, and the test
 * fails the day either goes green so the list is made shorter, not left to say something no longer true.
 *
 * THEN A PLANTED FAULT: card-alerts' file served with its reading rule taken out (each text door's `match` made one no
 * bank text holds), its checksum the catalogue's own for the planted file, and that one line turns red.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fileChecksum } from '../../packages/declare/src/catalogue.ts';
import { OPERATOR, startCloud } from '../../apps/worker/test/cloud-serve.ts';
import { HOST } from '../../apps/worker/test/cloud-harness.ts';
import { capturedMail } from '../drill/steps.mjs';
import { argsOf, KEPT, lineOf, runKept, testModeOf } from './run.mjs';
import { diskCatalogue, harnessOf, kept } from './steps.mjs';

/** The add-ons that are scripts, red on the harness because it runs no script: each one's FAIL quotes why. */
const SCRIPT_BOUND = ['stripe', 'portfolio-bands'];

const ADDRESS = 'kept-founder@example.test';

/** A Cloud by invitation and a drill code minted at its operator door, as the drill's test makes one. */
async function cloudWithCode() {
  const c = await startCloud({ env: { SIGNUP: 'invite' } });
  const res = await c.ask('/account/ops/invite', { method: 'POST', bearer: OPERATOR, body: JSON.stringify({ note: 'drill' }) });
  const link = ((await res.json()).value?.links ?? [])[0] ?? '';
  return { c, code: link.slice(link.indexOf('#code=') + '#code='.length) };
}

/** A lane on `c`, reading its captured letters, at one invented address, with the harness's turn and stand-in. */
const laneOn = (c, code, more = {}) =>
  kept({ host: c.base, publicHost: HOST, address: ADDRESS, code, mail: capturedMail(c.letters), ip: '203.0.113.41', waitMs: 3_000, quietMs: 100, harness: harnessOf(c), ...more });

/** Whether the harness's Directory still answers for the lane's record by its name, after the end. */
const stillThere = async (c, ctx) => (await c.cloud.directory.resolve(ctx.made?.slug ?? ctx.slug)) !== null;

test('THE KEPT LANE ON THE HARNESS: every add-on that runs here is PASS, each script is a named FAIL, and no line holds a value', async () => {
  const { c, code } = await cloudWithCode();
  try {
    const ctx = laneOn(c, code);
    const lines = [];
    const results = await runKept(ctx, { say: (l) => lines.push(l) });
    const by = Object.fromEntries(results.map((r) => [r.name, r]));
    const all = results.map(lineOf).join('\n');
    assert.equal(results[0].name, 'sign-up');
    assert.equal(results.at(-1).name, 'delete');
    assert.equal(by['sign-up'].pass && !by['sign-up'].skipped, true, all);
    assert.equal(by.delete.pass && !by.delete.skipped, true, all);
    for (const name of KEPT) assert.ok(by[name], `${name} has no line\n${all}`);
    const reds = results.filter((r) => !r.pass).map((r) => r.name);
    assert.deepEqual(reds, SCRIPT_BOUND, `the named failures moved: a script-bound add-on went green, or another went red\n${all}`);
    for (const name of SCRIPT_BOUND) assert.match(by[name].said, /no sandbox to run it in/u, `${name} is red for another reason\n${all}`);
    for (const r of results.filter((x) => x.pass && !SCRIPT_BOUND.includes(x.name.split(' ')[0]))) assert.ok(!r.skipped, `${r.name} skipped: ${r.said}`);
    assert.match(by.stripe.said, /not against Stripe/u);
    assert.equal(by['rates-poll gold'].todo ?? false, false, by['rates-poll gold'].said);
    /* NO LINE HOLDS A VALUE: not the address, the code, the session, a door's token, nor the lane's own vault key. */
    for (const v of [ADDRESS, code, ctx.cookie, ctx.link?.token, ...ctx.secrets]) if (typeof v === 'string' && v.length >= 4) assert.ok(!lines.join('\n').includes(v), 'a line holds a value');
    assert.doesNotMatch(lines.join('\n'), /@|https?:\/\/|#(verify|code|magic)=|Bearer /u, 'a line holds an address or a link');
    /* AND NOTHING IS LEFT: the Directory no longer answers for the record's name. */
    assert.equal(await stillThere(c, ctx), false, 'the lane left its record behind');
  } finally {
    await c.close();
  }
});

/** The catalogue as published, with `id`'s offered file served changed by `plant` and the index's checksum its own. */
function planted(id, plant) {
  const disk = diskCatalogue();
  return async (path) => {
    const index = JSON.parse(await disk('index.json'));
    const entry = index.entries.find((e) => e.kind === 'pack' && e.id === id);
    const v = entry.versions.find((x) => x.yanked === undefined) ?? entry.versions[0];
    const file = `packs/${id}/${v.version}.pack.json`;
    const text = JSON.stringify(plant(JSON.parse(await disk(file))));
    if (path === file) return text;
    if (path !== 'index.json') return disk(path);
    v.checksum = await fileChecksum(text);
    return JSON.stringify(index);
  };
}

test('A PLANTED FAULT TURNS ITS LINE RED: card-alerts with its reading rule taken out files no row from a bank text', async () => {
  const { c, code } = await cloudWithCode();
  try {
    const never = { all: [{ field: 'body', contains: 'a sentence no bank text holds' }] };
    const plant = (doc) => ({ ...doc, declarations: doc.declarations.map((x) => (x.channel === 'webhook' ? { ...x, match: never } : x)) });
    const ctx = laneOn(c, code, { catalogue: planted('card-alerts', plant) });
    const results = await runKept(ctx, { only: ['card-alerts'] });
    const line = results.find((r) => r.name === 'card-alerts');
    assert.equal(line?.pass, false, results.map(lineOf).join('\n'));
    assert.match(line.said, /filed no row/u);
    assert.equal(results.at(-1).pass, true, 'the record was not deleted after a red line');
  } finally {
    await c.close();
  }
});

test('THE COMMAND refuses production, an add-on it does not have and no host, and a host whose billing is not test', async () => {
  assert.match(argsOf(['--host', 'https://brain.dog']).wrong, /is production/u);
  assert.match(argsOf(['--host', 'https://alpha.brain.dog', '--only', 'nothing-such']).wrong, /no add-on called nothing-such/u);
  assert.match(argsOf([]).wrong, /--host <origin>/u);
  assert.deepEqual(argsOf(['--host', 'https://alpha.brain.dog/x', '--only', 'roadmap']), { host: 'https://alpha.brain.dog', only: ['roadmap'], help: false });
  const { c, code } = await cloudWithCode();
  try {
    assert.match(await testModeOf(laneOn(c, code)), /billing on .* is off, and the lane runs only where it is test/u);
  } finally {
    await c.close();
  }
});
