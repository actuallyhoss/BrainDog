/**
 * The canvas's wire and its sample.
 *
 * THE SAVE IS THE ONE AN AGENT MAKES. The test that matters most here reads the request the canvas sends and holds it
 * to `proposalOf`: a POST to `/api/propose` whose body is a `change` to `rule.<id>`. A canvas that wrote through
 * `setDeclaration` instead would be a second editor with a second set of checks, which is what §5 of the research
 * says the two editors must not be.
 *
 * AND THE READ WAS WRITTEN IN THE SAME WAVE, BY ANOTHER BRIEF. The first reader here guessed a body on every listed
 * row, and the record's list (`packages/record/src/automations.ts`) carries none: every row of a real record would have
 * been dropped and the list would have said nothing was automated. The rows below are that file's shape, key for key.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bodyOf, draftOf, faultsOf, proposalOf } from './flow.ts';
import { SAMPLE_AUTOMATIONS, live, openAutomations, rowLine, rowOf, rowTrigger, rowsOf, sample, type Fetch } from './source.ts';

const answer = (status: number, value: unknown): Response => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

/** One listed row as `packages/record/src/automations.ts` `row()` builds it: no body, and `rule` is the bare id. */
const LISTED = {
  id: 'rule.chase',
  rule: 'chase',
  name: 'Chase late invoices',
  version: 4,
  trigger: 'written',
  path: 'inline',
  register: 'invoices',
  project: null,
  enabled: true,
  pack: null,
  next: null,
  open: 0,
  last: { run: 'R7', state: 'failed', at: '2026-09-22T08:00:00.000Z', say: 'invoices has no field called due.' },
  month: { runs: 12, done: 11, failed: 1, cancelled: 0 },
};

test("THE RECORD'S LIST HAS NO BODIES, AND EVERY ROW OF IT IS DRAWN from the summary it does carry", () => {
  const [row] = rowsOf([LISTED, { ...LISTED, id: 'rule.clock', rule: 'clock', name: 'Clock', trigger: 'every', path: 'run', register: null, enabled: false }]);
  assert.ok(row, 'a listed row with no body is still a row');
  assert.equal(row.id, 'chase');
  assert.equal(row.body, null);
  assert.equal(row.version, 4);
  assert.deepEqual(row.month, { runs: 12, failures: 1 }, "the record's `failed` is the count of failures");
  assert.equal(rowTrigger(row), 'When a row in invoices is added or changed');
  assert.equal(rowLine(row, Date.parse('2026-09-22T10:00:00.000Z')), 'Last run 2h ago, failed. invoices has no field called due.');
  assert.equal(rowsOf([LISTED, { ...LISTED, rule: 'clock', enabled: false }])[1]!.enabled, false);
});

test('ONE AUTOMATION IS ASKED FOR BY ITS BARE ID IN THE QUERY, and comes back with its body and its runs', async () => {
  const asked: string[] = [];
  const io: Fetch = async (url) => {
    asked.push(url);
    return answer(200, {
      ok: true,
      value: {
        ...LISTED,
        body: { rule: 'chase', register: 'invoices', then: [{ tag: 'late' }] },
        runs: [{ id: 'R7', version: 4, state: 'failed', trigger: 'written', actor: 'rule:chase', started_at: '2026-09-22T08:00:00.000Z', finished_at: null, say: 'x', steps: [{ n: 0, kind: 'tag', state: 'failed', answer: null, at: '2026-09-22T08:00:00.000Z' }] }],
      },
    });
  };
  const out = await live(io).automation('rule.chase');
  assert.deepEqual(asked, ['/api/automations?rule=chase']);
  assert.ok(out.ok);
  assert.deepEqual(out.value.body, { rule: 'chase', register: 'invoices', then: [{ tag: 'late' }] });
  assert.equal(out.value.runs[0]!.steps[0]!.state, 'failed');
});

test('A SAVE IS A POST TO propose WITH THE CHANGE AN AGENT WOULD FILE, and nothing else', async () => {
  const sent: { url: string; body: unknown }[] = [];
  const io: Fetch = async (url, init) => {
    sent.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    return answer(200, { ok: true, value: { id: 'SG41' } });
  };
  const d = draftOf('gold-rate', SAMPLE_AUTOMATIONS(0)[1]!.body!);
  const p = proposalOf(d, 2);
  const out = await live(io).propose(p);
  assert.deepEqual(out, { ok: true, value: { id: 'SG41' } });
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.url, '/api/propose');
  assert.deepEqual(sent[0]!.body, JSON.parse(JSON.stringify(p)));
});

test('Run now and Stop name the rule and the run the way the record methods take them', async () => {
  const sent: { url: string; body: unknown }[] = [];
  const io: Fetch = async (url, init) => {
    sent.push({ url, body: JSON.parse(String(init?.body)) });
    return answer(200, { ok: true, value: { run: 'R9' } });
  };
  await live(io).run('rule.friday-review');
  await live(io).cancel('R9');
  assert.deepEqual(sent, [
    { url: '/api/automationRun', body: { rule: 'friday-review' } },
    { url: '/api/cancelRun', body: { run: 'R9' } },
  ]);
});

test('A RECORD WITHOUT THE READ DRAWS NO LIST, and no record at all draws the sample', async () => {
  const unknown: Fetch = async () => answer(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'no such method' } });
  const absent = await openAutomations(unknown);
  assert.equal(absent.absent, true);
  assert.equal(absent.source.sample, false, 'a real record, so a save still goes to it');

  const nobody: Fetch = async () => {
    throw new TypeError('offline');
  };
  const drawn = await openAutomations(nobody, '', () => 0);
  assert.equal(drawn.source.sample, true);
  assert.ok(drawn.first.ok && drawn.first.value.length === 4);
  assert.ok(drawn.first.ok && drawn.first.value.every((r) => r.body === null), "the sample's list has no bodies either");

  const refused: Fetch = async () => answer(403, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'An owner reads this.' } });
  const said = await openAutomations(refused);
  assert.equal(said.source.sample, false, "any other refusal is the record's own sentence, not a sample");
  assert.equal(said.first.ok, false);
});

test('a row is read defensively: no id is no row, and a run in a state the record does not have is not drawn', () => {
  assert.equal(rowOf({ name: 'x' }), null);
  assert.equal(rowOf('nonsense'), null);
  const row = rowOf({ rule: 'd', body: { rule: 'd', on: { manual: true }, steps: [{ note: 'x' }] }, runs: [{ id: 'R2', state: 'exploded', started_at: 'x' }] })!;
  assert.deepEqual(row.runs, []);
  assert.equal(row.trigger, 'manual', 'what the record left out is read off the body');
  assert.equal(row.path, 'run');
});

test('EVERY SAMPLE AUTOMATION ROUND-TRIPS UNCHANGED AND HAS NOTHING TO FIX, so opening and saving one changes nothing', () => {
  for (const row of SAMPLE_AUTOMATIONS(0)) {
    const d = draftOf(row.id, row.body!);
    assert.deepEqual(bodyOf(d), row.body, row.id);
    assert.deepEqual(faultsOf(d), [], row.id);
  }
});

test('the sample runs only a button, stops only a run that has not finished, and keeps a save for the tab', async () => {
  const s = sample(() => Date.UTC(2026, 8, 22));
  assert.equal((await s.run('gold-rate')).ok, false, 'a clock is not started by a button');
  const ran = await s.run('friday-review');
  assert.ok(ran.ok);
  assert.equal((await s.cancel('R3')).ok, false, 'R3 is done');
  assert.ok((await s.cancel(ran.value.run)).ok);

  const d = draftOf('friday-review', { rule: 'friday-review', name: 'Friday review, shorter', on: { manual: true }, steps: [{ notify: { say: 'Done' } }] });
  const filed = await s.propose(proposalOf(d, 1));
  assert.deepEqual(filed, { ok: true, value: { id: null } }, 'nothing is filed on the sample');
  const listed = await s.automations();
  assert.ok(listed.ok);
  assert.equal(listed.value.find((r) => r.id === 'friday-review')!.name, 'Friday review, shorter');
  const one = await s.automation('friday-review');
  assert.ok(one.ok);
  assert.equal(one.value.version, 2);
  assert.equal(one.value.runs[0]!.state, 'cancelled', 'a save keeps the runs it had');
});
