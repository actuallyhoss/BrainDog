/**
 * `braindog understand --dry-run`: the record's dry walk read by what each part means, said in names and quiet groups,
 * and the record's refusal said plainly when a token cannot reach it or the record has no such walk yet.
 *
 * THE HOST IS A STUB ON node:http, as in `hooks.test.ts`, because apps never import apps.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AgentIo } from '../src/skills.ts';
import { dryLines, kindLine, PLANNED_SHOWN, readDry, readLine, understandCommand } from '../src/understand.ts';

const scratch = mkdtempSync(join(tmpdir(), 'braindog-understand-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

/** The record's dry answer, as `understandingOf` in `@braindog/record` gives it. */
const answer = (over: Record<string, unknown> = {}) => ({
  dry: true,
  kinds: [
    { kind: 'payments', looked: 200, linked: 41, refused: 0, organisations: 2 },
    { kind: 'runs', looked: 200, linked: 1, refused: 0 },
    { kind: 'services', looked: 9, linked: 0, refused: 0 },
  ],
  writes: ['Link LOWRY ST STUDIOS RENT AUG to Lowry St Studios', 'Add Lowry St Studios to Organisations'],
  more: 0,
  questions: ['Is Acme a company you pay or are paid by? 3 payments name it.'],
  asks: { organisation: 1 },
  done: true,
  ...over,
});

test('A DRY WALK IS READ AS THE RECORD GIVES IT: what each kind would link, the changes it names and how many more, and its questions', () => {
  assert.deepEqual(readDry(answer({ more: 14, asks: { organisation: 6, 'run-project': 2 }, done: false })), {
    looked: [['payments', 200], ['runs', 200], ['services', 9]],
    counts: [['payments', 41], ['organisations', 2], ['runs', 1]],
    planned: ['Link LOWRY ST STUDIOS RENT AUG to Lowry St Studios', 'Add Lowry St Studios to Organisations'],
    plannedAll: 16,
    asked: ['Is Acme a company you pay or are paid by? 3 payments name it.'],
    askedAll: 8,
    done: false,
    dropped: [],
  });
  assert.deepEqual(readDry(null), { looked: [], counts: [], planned: [], plannedAll: 0, asked: [], askedAll: 0, done: true, dropped: [] });
  assert.equal(kindLine('payments', 1), '1 payment linked to who it was with');
  assert.equal(kindLine('run-project', 1200), '1,200 run project');
  assert.equal(readLine('payments', 1), '1 payment');
  assert.equal(readLine('services', 1200), '1,200 services');
});

test('A DRY RUN SAYS ITS COUNTS, THE FIRST CHANGES AND ITS QUESTIONS in quiet groups, how many more, and that nothing was changed', () => {
  const planned = Array.from({ length: PLANNED_SHOWN }, (_, i) => `Link Payee ${String(i + 1)} to Payee`);
  assert.deepEqual(dryLines({ looked: [['payments', 200], ['runs', 40]], counts: [['payments', 41], ['runs', 1]], planned, plannedAll: PLANNED_SHOWN + 2, asked: ['Which project is glaze for'], askedAll: 3, done: false, dropped: ['Two more questions wait for tomorrow.'] }), [
    'A dry run over 200 payments and 40 runs: nothing was changed and nothing was asked.',
    '',
    'It would link',
    '  41 payments linked to who they were with',
    '  1 run placed in its project',
    '',
    `The first ${String(PLANNED_SHOWN)} changes`,
    ...planned.map((p) => `  ${p}.`),
    '  and 2 more',
    '',
    'It would ask you on Decide',
    '  Which project is glaze for.',
    '  and 2 more',
    '',
    'This is the next part of what your BrainDog holds. The rest is read on later nights.',
    '',
    'Two more questions wait for tomorrow.',
  ]);
  const none = { looked: [] as [string, number][], counts: [], planned: [], plannedAll: 0, asked: [], askedAll: 0, dropped: [] };
  assert.deepEqual(dryLines({ ...none, done: true }), ['Nothing to link and nothing to ask: everything your BrainDog holds is already understood.']);
  assert.deepEqual(dryLines({ ...none, done: false }), ['Nothing to link and nothing to ask in the next part of your BrainDog. The rest is read on later nights.']);
  assert.deepEqual(dryLines({ ...none, looked: [['payments', 217], ['runs', 1]], done: true }), ['Nothing to link and nothing to ask in 217 payments and 1 run: everything your BrainDog holds is already understood.']);
  assert.deepEqual(dryLines({ ...none, looked: [['runs', 200]], done: false }), ['Nothing to link and nothing to ask in the next 200 runs of your BrainDog. The rest is read on later nights.']);
});

/** A host whose `understandPlan` answers `value`, or refuses with `refusal`. */
async function host(t: { after: (fn: () => Promise<void>) => void }, answer: { value?: unknown; refusal?: { code: string; fix: string } }) {
  const seen: { method: string; verb: string | undefined; body: Record<string, unknown> }[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const method = new URL(req.url ?? '/', 'http://stub').pathname.replace(/^\/api\//, '');
      const raw = Buffer.concat(chunks).toString('utf8');
      seen.push({ method, verb: req.method, body: (raw ? JSON.parse(raw) : {}) as Record<string, unknown> });
      res.writeHead(answer.refusal ? 403 : 200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(answer.refusal ? { ok: false, refusal: answer.refusal } : { ok: true, value: answer.value }));
    });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  t.after(
    () =>
      new Promise<void>((done) => {
        server.closeAllConnections();
        server.close(() => done());
      }),
  );
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen };
}

function io(base: string): AgentIo & { lines: string[]; said: string[] } {
  const lines: string[] = [];
  const said: string[] = [];
  return {
    env: { BRAINDOG_HOST: base, BRAINDOG_TOKEN: 'rec_01TESTTESTTESTTESTTESTTEST.understand', XDG_CONFIG_HOME: join(scratch, 'config') },
    cwd: scratch,
    home: scratch,
    out: (l) => void lines.push(l),
    say: (l) => void said.push(l),
    headers: async () => ({}),
    lines,
    said,
  };
}

test('BRAINDOG UNDERSTAND --DRY-RUN reads the record\'s plan, prints what it read and would link in names, and never runs the walk itself', async (t) => {
  const h = await host(t, { value: answer({ kinds: [{ kind: 'runs', looked: 40, linked: 2, refused: 0 }], writes: ['Place Fix the retry in Glaze', 'Place Fire the kiln in Kiln'], questions: [], asks: {} }) });
  const one = io(h.base);
  assert.equal(await understandCommand(['--dry-run'], one), 0, one.said.join('\n'));
  /* A read: the plan, as a GET, and never the walk. */
  assert.deepEqual(h.seen, [{ method: 'understandPlan', verb: 'GET', body: {} }]);
  assert.deepEqual(one.lines, ['A dry run over 40 runs: nothing was changed and nothing was asked.', '', 'It would link', '  2 runs placed in their projects', '', 'The changes', '  Place Fix the retry in Glaze.', '  Place Fire the kiln in Kiln.']);

  /* Without --dry-run nothing is sent, and it says where the walk is done. */
  const two = io(h.base);
  assert.equal(await understandCommand([], two), 1);
  assert.equal(h.seen.length, 1);
  assert.match(two.said[0]!, /only reads, with --dry-run/);
  assert.equal(await understandCommand(['--apply'], two), 1);
  assert.match(two.said.at(-1)!, /^braindog understand takes --dry-run/);
});

test('BRAINDOG UNDERSTAND --DRY-RUN SAYS PLAINLY why the record would not read it: a token it does not let in, a record older than the plan, or a caller who does not read the whole record', async (t) => {
  const browser = await host(t, { refusal: { code: 'NEEDS_BROWSER_SESSION', fix: 'Open this from the app; a token cannot change what this BrainDog is.' } });
  const one = io(browser.base);
  assert.equal(await understandCommand(['--dry-run'], one), 1);
  assert.deepEqual(one.said, ["Only you, signed in to the app, can read this. A key on this machine cannot."]);
  assert.deepEqual(one.lines, []);

  /* A record older than the plan: it has no such method, by either word a host uses for that. */
  for (const code of ['NOT_IN_THIS_BUILD', 'ROUTE_UNKNOWN']) {
    const older = await host(t, { refusal: { code, fix: 'This host has no understandPlan.' } });
    const two = io(older.base);
    assert.equal(await understandCommand(['--dry-run'], two), 1);
    assert.deepEqual(two.said, ['Your BrainDog is older than this command and cannot say this yet. It will once it is updated.']);
  }

  /* Somebody who does not read the whole record: the record's own reason, as it gives it. */
  const narrow = await host(t, { refusal: { code: 'FORBIDDEN', fix: 'Only the owner, reading every list, can see what the record would link.' } });
  const three = io(narrow.base);
  assert.equal(await understandCommand(['--dry-run'], three), 1);
  assert.deepEqual(three.said, ['Only the owner, reading every list, can see what the record would link.']);
  assert.deepEqual(three.lines, []);
});
