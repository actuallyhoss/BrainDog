/**
 * The live run of the seventeen descriptions, held without a model (ENG-B11): `describe-live.mjs` asks each description
 * through a host's own door on a fresh record, as the Slash page asks, and counts what drew clean on the first ask apart
 * from what drew clean only after a repair. The host here is a stub host, the shipped record and door over the stub model
 * of `packages/record/eval/stub.ts`, and the provider in the last two tests is stood up on localhost, so no test spends
 * a neuron or needs a key.
 *
 *   node --test tools/model-checks/test/describe-live.test.mjs
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as lib from '../lib.mjs';
import { CASES } from '../../../packages/record/eval/cases.ts';

const here = dirname(fileURLToPath(import.meta.url));
const runner = join(here, '..', 'describe-live.mjs');
const root = join(here, '..', '..', '..');

/** Every name a key or a token could arrive under, taken out, so a developer's own shell never turns a test into a spend. */
const bare = () => {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('DRAFT_EVAL_') || k.startsWith('MODEL_CHECK_')) delete env[k];
  return env;
};

/** One run of the runner: its exit code, what it printed, and the report on stdout's last line when `--json` was said. */
const run = (argv, env = {}) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [runner, ...argv], { cwd: root, env: { ...bare(), ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('close', (code) => {
      let report = null;
      try {
        report = JSON.parse(out.trim().split('\n').at(-1) ?? '');
      } catch {}
      resolve({ code, out, err, report });
    });
  });

/** A provider on localhost answering every chat completion with `answer()`: `{ status, content }`. */
const provider = async (t, answer) => {
  let asked = 0;
  const server = createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      asked++;
      const { status, content } = answer();
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(status === 200 ? JSON.stringify({ choices: [{ message: { role: 'assistant', content } }], usage: { prompt_tokens: 10, completion_tokens: 3 } }) : '{"error":"busy"}');
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  return { url: `http://127.0.0.1:${server.address().port}/v1`, asked: () => asked };
};

const sentences = (text) => text.split(/(?<=[.?!])\s+/u).filter((s) => s.trim() !== '');
const kindsOf = (c) => (c.stub.built?.declarations ?? []).map((d) => d.kind);
const CHARTS = ['lines', 'series', 'sparkline', 'bar', 'split', 'ring', 'gauge', 'heat', 'progress'];

test('there are seventeen descriptions, and the four before the last ask for what the Trunk bar asks', () => {
  assert.equal(CASES.length, 17);
  assert.deepEqual(CASES.map((c) => c.n), Array.from({ length: 17 }, (_, i) => i + 1));
  assert.equal(lib.CASES.record <= CASES.length, true);
  for (const c of CASES.slice(12, 16)) {
    assert.equal(sentences(c.asked).length, 3, `${c.name} is three sentences in a person's words`);
    assert.doesNotMatch(c.asked, /\u2014|\b(?:rows?|register|entity|metric|block)\b/iu, `${c.name} is said as a person says it`);
    /* WHAT A GOOD ANSWER TO IT DECLARES, which the stub host answers with: a list with its own fields, two figures, a
       page with a lead line, a chart and a form, and one rule. */
    const built = c.stub.built;
    assert.ok(built, `${c.name} says what a good answer builds`);
    assert.deepEqual(kindsOf(c).toSorted(), ['metric', 'metric', 'page', 'register', 'rule'], c.name);
    const list = built.declarations.find((d) => d.kind === 'register');
    assert.ok(list.body.fields.length >= 4, `${c.name}: a list with its own fields`);
    const blocks = built.declarations.find((d) => d.kind === 'page').body.blocks;
    assert.equal(blocks[0].kind === 'note' && blocks[0].lead === true, true, `${c.name}: a lead line`);
    assert.ok(blocks.some((b) => CHARTS.includes(b.kind)), `${c.name}: a chart`);
    assert.ok(blocks.some((b) => b.kind === 'capture'), `${c.name}: a form`);
    assert.ok((built.rows?.[list.body.id] ?? []).length >= 3, `${c.name}: three points, so the chart says something`);
  }
});

test("THE TRUNK BAR BY DESCRIBING IT: three sentences in his words that ask for the six parts, and a good answer has all six (C36)", () => {
  const c = CASES.find((x) => x.n === 17);
  assert.ok(c?.parts, 'the seventeenth names its parts');
  assert.equal(sentences(c.asked).length, 3);
  assert.doesNotMatch(c.asked, /\u2014|\b(?:rows?|register|entity|metric|block)\b/iu, 'said as a person says it');
  assert.equal(c.parts.of.length, 6);
  assert.equal(c.parts.need, 5);
  const blocks = c.stub.built.declarations.filter((d) => d.kind === 'page').flatMap((d) => d.body.blocks);
  for (const p of c.parts.of) assert.ok(blocks.some((b) => p.is(b)), `the good answer has ${p.name}`);
  /* A PAGE WITHOUT THEM IS NONE OF THEM: a lead with no figure is no sentence, and cards with no colour are no sections. */
  assert.equal(c.parts.of.filter((p) => [{ kind: 'note', lead: true, body: 'Hello.' }, { kind: 'cards', columns: [{ field: 'name', as: 'title' }] }].some((b) => p.is(b))).length, 0);
});

test('with a stub host, seventeen are asked through the door, and a first ask is counted apart from a repair', async () => {
  const got = await run(['--stub', '--json']);
  assert.equal(got.code, 0, got.err);
  const r = got.report;
  assert.ok(r, got.out);
  assert.equal(r.door, 'POST /api/slashDraft');
  assert.equal(r.cases.length, 17);
  assert.ok(r.cases.every((c) => c.status === 200), 'every description was answered at the door');
  const mends = CASES.filter((c) => c.stub.mends === true).map((c) => c.n);
  assert.ok(mends.length > 0 && mends.some((n) => n > 12), 'one of the four is mended, so the repair is walked at that level too');
  for (const c of r.cases) {
    assert.equal(c.clean, mends.includes(c.n) ? 'repaired' : 'first', `description ${c.n}`);
    assert.equal(c.asks, mends.includes(c.n) ? 2 : 1, `description ${c.n}`);
  }
  assert.equal(r.firstTry, 17 - mends.length);
  assert.equal(r.afterRepair, 17);
  assert.match(got.err, new RegExp(`first try: ${17 - mends.length} of 17`, 'u'));
  /* THE FOUR DREW WHAT THEY WERE ASKED FOR, read off what the record drew and not off what the stub wrote. */
  for (const c of r.cases.slice(12, 16)) {
    assert.equal(c.drew[0], 'note', `description ${c.n} opens on its lead line`);
    assert.ok(c.drew.includes('capture') && c.drew.some((k) => CHARTS.includes(k)), `description ${c.n} drew ${c.drew.join(', ')}`);
    assert.equal(c.built.join(','), 'register,metric,metric,page,rule', `description ${c.n}`);
  }
  /* AND THE TRUNK DREW CLEAN WITH ALL SIX PARTS, so the record can hold that page from one ask (C36). */
  const trunk = r.cases.find((c) => c.n === 17);
  assert.equal(trunk.clean, 'first');
  assert.equal(trunk.parts.drew.length, 6, trunk.parts.missing.join(', '));
  assert.ok(['note', 'queue', 'cards', 'steps', 'capture', 'inputs'].every((k) => trunk.drew.includes(k)), trunk.drew.join(', '));
  /* THREE PAGES FROM ONE ASK, KEPT AS ONE DRAFT (C37): the desk, a page for each part, and the price check. */
  assert.equal(trunk.built.filter((k) => k === 'page').length, 3, trunk.built.join(', '));
  assert.equal(trunk.kept, 1);
  /* A STUB IS NEVER A MEASUREMENT OF A MODEL, whatever it scored. */
  assert.equal(r.stub, true);
  assert.equal(r.outcome, lib.NONE);
});

test('it prints "first try: N of 17", exits 1 below the bar it is handed, and 0 at it', async () => {
  const first = 17 - CASES.filter((c) => c.stub.mends === true).length;
  const plain = await run(['--stub']);
  assert.equal(plain.code, 0, plain.err);
  assert.match(plain.out, new RegExp(`^first try: ${first} of 17$`, 'mu'));
  assert.match(plain.out, /^after repair: 17 of 17$/mu);
  assert.match(plain.out, /^17 first ask .*parts 6 of 6/mu, 'the trunk says how many of its parts it drew');

  const below = await run(['--stub', '--bar', String(first + 1)]);
  assert.equal(below.code, 1, below.out);
  assert.match(below.out, new RegExp(`first try: ${first} of 17`, 'u'));
  assert.match(below.out, new RegExp(`below the bar of ${first + 1}`, 'u'));

  const at = await run(['--stub', '--bar', String(first)]);
  assert.equal(at.code, 0, at.out);

  const typo = await run(['--stub', '--bars', '3']);
  assert.equal(typo.code, 2, 'an unknown flag is refused, so a typo never runs the seventeen');
});

test('with no model key it says "no model key: not measured", exits 0, and is never a pass', async () => {
  const got = await run(['--bar', '13', '--json']);
  assert.equal(got.code, 0, got.err);
  assert.match(got.err, /no model key: not measured/u);
  assert.doesNotMatch(`${got.out}${got.err}`, /\bpass/iu);
  assert.equal(got.report.outcome, lib.NONE);
  assert.equal(got.report.reason, lib.NO_TOKEN);
  assert.equal(got.report.firstTry, null);
  assert.deepEqual(got.report.cases, []);
  const plain = await run([]);
  assert.equal(plain.code, 0);
  assert.match(plain.out, /no model key: not measured/u);
});

test('a model that answers with nothing is measured, and falls below the bar', async (t) => {
  const p = await provider(t, () => ({ status: 200, content: '{"drafts":[]}' }));
  const got = await run(['--only', '1,13', '--bar', '1', '--json'], { DRAFT_EVAL_URL: p.url, DRAFT_EVAL_MODEL: 'local', DRAFT_EVAL_KEY: 'sk-local-0000' });
  assert.equal(got.code, 1, got.err);
  assert.equal(got.report.outcome, lib.BELOW);
  assert.equal(got.report.firstTry, 0);
  assert.equal(got.report.of, 2);
  assert.ok(p.asked() >= 2, 'the model was asked, through the host\'s own model on the key');
  assert.doesNotMatch(`${got.out}${got.err}`, /sk-local-0000/u, 'the key is never printed');
});

test('a provider that gives no answer is not measured, never red', async (t) => {
  const p = await provider(t, () => ({ status: 503, content: '' }));
  const env = { DRAFT_EVAL_URL: p.url, DRAFT_EVAL_MODEL: 'local', DRAFT_EVAL_KEY: 'sk-local-0000', MODEL_CHECK_WAIT_MS: '1' };
  const got = await run(['--only', '1,2', '--bar', '0', '--json'], env);
  assert.equal(got.code, 0, got.err);
  assert.equal(got.report.outcome, lib.NONE);
  assert.equal(got.report.reason, lib.NO_ANSWER);
  assert.ok(got.report.cases.every((c) => c.clean === 'unanswered'));
});
