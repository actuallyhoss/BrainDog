/**
 * The canvas's wire.
 *
 * THE SAVE IS THE ONE AN AGENT MAKES. The test that matters most here reads the request the canvas sends and holds it
 * to `proposalOf`: a POST to `/api/propose` whose body is a `change` to `rule.<id>`. A canvas that wrote through
 * `setDeclaration` instead would be a second editor with a second set of checks, which is what the two editors
 * must not be.
 *
 * AND THE READ WAS WRITTEN ALONGSIDE THE RECORD'S LIST, NOT AFTER IT. The first reader here guessed a body on every listed
 * row, and the record's list (`packages/record/src/automations.ts`) carries none: every row of a real record would have
 * been dropped and the list would have said nothing was automated. The rows below are that file's shape, key for key.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bodyOf, draftOf, faultsOf, proposalOf } from './flow.ts';
import type { Body } from './flow.ts';
import { answerWords, editWords, rowsNote, firedOf, lastSaid, live, openAutomations, rowLine, rowOf, rowTrigger, rowsOf, withFired, type Fetch } from './source.ts';
import { copy } from '../copy.ts';

/**
 * Four bodies, one for each trigger the canvas offers: a change (inline), a clock that calls out and branches, an
 * arrival that asks a person, and a button.
 *
 * TEST DATA, AND ONLY HERE. They were the sample's four automations, drawn on the list when no record answered; the
 * sample is gone and they stay as the bodies the round trip and the wire are tested on.
 *
 * `friday-review` ASKS A PERSON AND NOT SLASH, because `ask_slash` is a fault on a host with no model (`flow-lint.ts`
 * `slashAskAt`), and a starter body that opened with a fault on its first card failed the round trip below until it
 * was changed.
 */
const BODIES: Record<'chase' | 'gold' | 'phone' | 'friday', Body> = {
  chase: {
    rule: 'obligation-late',
    name: 'Chase late payments',
    register: 'obligations',
    when: 'due before today, state is open',
    then: [{ tag: 'late' }, { notify: { say: '{{trigger.row.what}} is past due' } }],
    once_per: ['entry', 'due'],
  },
  gold: {
    rule: 'gold-rate',
    name: 'Gold rate',
    on: { every: '1h' },
    steps: [
      { call: { ingest: 'gold_rate', as: 'rate' } },
      { if: { field: 'rate', gt: 70 }, then: [{ notify: { say: 'Gold is {{vars.rate}} a gram' } }], else: [{ set_var: { name: 'quiet', to: 'yes' } }] },
    ],
  },
  phone: {
    rule: 'shortcut-spend',
    name: 'Spending from the phone',
    on: { arrival: { ingest: 'shortcut' } },
    steps: [
      { ask_person: { question: 'File {{trigger.arrival.body}} as spending?', options: ['File it', 'Leave it'], as: 'file', wait: '7d' } },
      { if: 'file is File it', then: [{ notify: { say: 'Filed the spending from the phone' } }] },
    ],
  },
  friday: {
    rule: 'friday-review',
    name: 'Friday review',
    on: { manual: true },
    steps: [
      { ask_person: { question: 'Did everything due this week go out?', options: ['All of it', 'Not yet'], as: 'sent' } },
      { notify: { say: 'Friday review: {{vars.sent}}' } },
    ],
  },
};

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
  assert.equal(rowTrigger(row), 'When an item in invoices is added or changed');
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
  const d = draftOf('gold-rate', BODIES.gold);
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

/* NO RECORD DREW THE SAMPLE'S FOUR AUTOMATIONS, and a flow drawn and "sent" on it was kept for the tab and filed nowhere.
   Each way of there being no record is now its sentence; the one for a dead network said "The demo has no
   account", which was about a door that is gone. */
test('A RECORD WITHOUT THE READ DRAWS NO LIST, and no record at all draws why', async () => {
  const unknown: Fetch = async () => answer(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'no such method' } });
  const absent = await openAutomations(unknown);
  assert.equal(absent.absent, true);
  /* NO `sample` FLAG ON A SOURCE AT ALL, since the sample left: it was `false` on every one, and two screens still branched on it. */
  assert.equal('sample' in absent.source, false, 'a source still says whether it is the sample');

  const nobody: Fetch = async () => {
    throw new TypeError('offline');
  };
  const drawn = await openAutomations(nobody);
  assert.equal(drawn.absent, false);
  assert.deepEqual(drawn.first, { ok: false, refusal: { code: 'UNREACHABLE', fix: copy.recordNotReached } });

  const signedOut: Fetch = async () => new Response('', { status: 401 });
  const out = await openAutomations(signedOut);
  assert.deepEqual(out.first, { ok: false, refusal: { code: 'UNAUTHORIZED', fix: copy.signInAgain } });

  const refused: Fetch = async () => answer(403, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'An owner reads this.' } });
  const said = await openAutomations(refused);
  assert.equal(said.first.ok, false);

  const source: Record<string, unknown> = await import('./source.ts');
  assert.equal('sample' in source || 'SAMPLE_AUTOMATIONS' in source, false, 'the sample source is still exported');
});

test('a row is read defensively: no id is no row, and a run in a state the record does not have is not drawn', () => {
  assert.equal(rowOf({ name: 'x' }), null);
  assert.equal(rowOf('nonsense'), null);
  const row = rowOf({ rule: 'd', body: { rule: 'd', on: { manual: true }, steps: [{ note: 'x' }] }, runs: [{ id: 'R2', state: 'exploded', started_at: 'x' }] })!;
  assert.deepEqual(row.runs, []);
  assert.equal(row.trigger, 'manual', 'what the record left out is read off the body');
  assert.equal(row.path, 'run');
});

test('EVERY STARTER BODY ROUND-TRIPS UNCHANGED AND HAS NOTHING TO FIX, so opening and saving one changes nothing', () => {
  for (const body of Object.values(BODIES)) {
    const id = String(body.rule);
    const d = draftOf(id, body);
    assert.deepEqual(bodyOf(d), body, id);
    /* ON A HOST WITH NO MODEL, said out loud rather than left to the default: an Ask Slash card would be a fault on
       every host that has none. */
    assert.deepEqual(faultsOf(d, { slash: false }), [], id);
  }
});

/* ── Try it: the record's own dry run, before anything is sent ──────────── */

test("TRY IT ASKS THE RECORD'S dryRun WITH THE WHOLE BODY IN THE QUERY, as JSON the host decodes, and nothing is written", async () => {
  const asked: { url: string; method: string | undefined }[] = [];
  const io: Fetch = async (url, init) => {
    asked.push({ url, method: init?.method });
    return answer(200, { ok: true, value: { path: 'run', trigger: 'Every 1h.', steps: ['Call gold_rate.'] } });
  };
  const body = BODIES.gold;
  const out = await live(io).dryRun(body);
  assert.equal(asked.length, 1);
  assert.equal(asked[0]!.method, 'GET', 'dryRun is a READ+ route, so it is not a POST');
  const url = new URL(asked[0]!.url, 'http://x');
  assert.equal(url.pathname, '/api/dryRun');
  /* THE HOST JSON-PARSES AN ARGUMENT ITS TABLE TYPES `json` (`packages/host/src/index.ts`, `takes: { rule: 'json' }`),
     so what arrives is exactly what this parse gives back. */
  assert.deepEqual(JSON.parse(url.searchParams.get('rule')!), body);
  assert.deepEqual(out, { ok: true, value: { path: 'run', trigger: 'Every 1h.', steps: ['Call gold_rate.'], matches: null, rows: null, sample: [] } });
});

test("A STEP'S ANSWER IS SAID AS NAME AND VALUE, not printed as the JSON the runner kept", () => {
  assert.equal(answerWords('{"rate": 71.4}'), 'rate 71.4');
  assert.equal(answerWords('{"file": "File it", "n": 2}'), 'file File it, n 2');
  assert.equal(answerWords('plain words'), 'plain words');
  assert.equal(answerWords('[1,2]'), '1, 2');
});

/* EIGHTEEN AUTOMATIONS READ "Not run yet" WHILE ACTIVITY LISTED THEM RUNNING THAT MORNING. The record counts runs, and
   one that runs inside the change that starts it keeps none: its turns are lines of the log, signed `rule:<id>`. */
test('WHEN ONE WITH NO RUNS LAST DID SOMETHING IS READ FROM THE LOG, by the rule that signed each line', () => {
  const page = {
    cursor: 41,
    events: [
      { id: 'e9', ts: '2026-09-03T10:45:00.000Z', actor: 'rule:part-due', kind: 'note' },
      { id: 'e8', ts: '2026-09-03T10:10:00.000Z', actor: 'rule:categorise', kind: 'edit' },
      { id: 'e7', ts: '2026-09-03T09:00:00.000Z', actor: 'rule:part-due', kind: 'note' },
      { id: 'e6', ts: '2026-09-03T08:00:00.000Z', actor: 'p_01M1KJ7RG0TYYA0AX15QPGJJ4', kind: 'edit' },
      { id: 'e5', ts: '2026-09-03T07:00:00.000Z', actor: 'agent:claude', kind: 'edit' },
      { id: 'e4', actor: 'rule:no-time' },
      'not a line',
    ],
  };
  const fired = firedOf(page);
  assert.deepEqual([...fired], [['part-due', '2026-09-03T10:45:00.000Z'], ['categorise', '2026-09-03T10:10:00.000Z']]);
  assert.equal(firedOf(null).size, 0);
  assert.equal(firedOf({ events: 'none' }).size, 0);

  const inline = rowOf({ rule: 'part-due', name: 'Say when a part falls due', trigger: 'written', path: 'inline', register: 'installments', enabled: true, last: null })!;
  const quiet = rowOf({ rule: 'cash-stale', name: 'Keep balances current', trigger: 'written', path: 'inline', register: 'accounts', enabled: true, last: null })!;
  const ran = rowOf({ rule: 'gold-rate', name: 'Gold rate', trigger: 'every', path: 'run', enabled: true, last: { run: 'R1', at: '2026-09-03T06:00:00.000Z', state: 'done', say: null } })!;
  const [a, b, c] = withFired([inline, quiet, ran], fired);
  assert.equal(a!.acted, '2026-09-03T10:45:00.000Z');
  assert.equal(b!.acted, null, 'the page holds nothing from it, which is said as lately and not as never');
  assert.equal(c!.acted, undefined, 'one with a run keeps its run, which says more');

  const now = Date.parse('2026-09-03T12:45:00.000Z');
  assert.equal(lastSaid(a!, now), 'Last ran 2h ago.');
  assert.equal(lastSaid(b!, now), 'Has done nothing lately.');
  assert.match(lastSaid(c!, now), /^Last run .*, done\.$/u);
  assert.equal(lastSaid(inline, now), '', 'the log unread, nothing is claimed');
  assert.equal(rowLine(a!, now), 'Last ran 2h ago.');
  /* ONLY ONE THAT WOULD HAVE LEFT A RUN IS SAID NOT TO HAVE RUN YET. */
  assert.equal(lastSaid(rowOf({ rule: 'new-clock', trigger: 'every', path: 'run', enabled: true, last: null })!, now), 'Not run yet.');
});

test('THE LIST ASKS THE LOG ONLY WHEN TOLD TO, and only when a turned-on row came with no last run', async () => {
  const asked: string[] = [];
  const list = [
    { rule: 'part-due', name: 'Say when a part falls due', trigger: 'written', path: 'inline', register: 'installments', enabled: true, last: null },
    { rule: 'off-one', name: 'Off one', trigger: 'written', path: 'inline', register: 'tasks', enabled: false, last: null },
  ];
  const io = (rows: unknown[], log: Response | null): Fetch => async (url) => {
    asked.push(url);
    if (url.includes('/api/recentHistory')) return log ?? answer(200, { ok: true, value: { cursor: null, events: [{ id: 'e1', ts: '2026-09-03T10:45:00.000Z', actor: 'rule:part-due', kind: 'note' }] } });
    return answer(200, { ok: true, value: rows });
  };

  const plain = await openAutomations(io(list, null));
  assert.deepEqual(asked, ['/api/automations'], 'a screen that does not say when each last ran pays for no second read');
  assert.equal(plain.first.ok && plain.first.value[0]!.acted, undefined);

  asked.length = 0;
  const out = await openAutomations(io(list, null), '', { acted: true });
  assert.deepEqual(asked, ['/api/automations', '/api/recentHistory?limit=200']);
  assert.ok(out.first.ok);
  assert.equal(out.first.value[0]!.acted, '2026-09-03T10:45:00.000Z');
  assert.equal(out.first.value[1]!.acted, null);

  /* EVERY TURNED-ON ROW HAS A RUN TO SAY: the log is not asked. */
  asked.length = 0;
  await openAutomations(io([{ rule: 'gold-rate', trigger: 'every', path: 'run', enabled: true, last: { at: '2026-09-03T06:00:00.000Z', state: 'done' } }], null), '', { acted: true });
  assert.deepEqual(asked, ['/api/automations']);

  /* A LOG THAT WILL NOT READ LEAVES THE LIST AS IT CAME, drawn, with nothing claimed about a last turn. */
  const refused = await openAutomations(io(list, answer(403, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'An owner reads this.' } })), '', { acted: true });
  assert.ok(refused.first.ok);
  assert.equal(refused.first.value[0]!.acted, undefined);
  assert.equal(refused.absent, false);
});

test('A ROW NAMES ITS LIST AS THE RAIL DOES, never by its id', () => {
  const row = rowOf({ rule: 'part-due', trigger: 'written', path: 'inline', register: 'installments', enabled: true })!;
  const said = (id: string): string => ({ installments: 'Instalments' })[id] ?? id;
  assert.equal(rowTrigger(row, said), 'When an item in Instalments is added or changed');
  assert.equal(rowTrigger({ ...row, body: { rule: 'part-due', register: 'installments', then: [{ tag: 'due' }] } }, said), 'When an item in Instalments is added or changed');
  assert.equal(rowTrigger(row), 'When an item in installments is added or changed', 'with no names to hand it is said as written');
});

/* A LIST THAT COULD NOT BE READ IS NOT AN EMPTY ONE (audit B of 25 October, Y14): "If it ran now" said "This list is empty"
   over Bills and invoices, which held two, because a read that failed and a list with nothing in it were drawn alike. */
test('the latest item says what it is, and an unread or a refused list says that, never that it is empty', () => {
  const kiln = { id: 'e_1', label: 'Glaze order for the big kiln', at: null };
  assert.equal(rowsNote([kiln], 'read'), 'Glaze order for the big kiln');
  assert.equal(rowsNote([], 'read'), editWords.noRows);
  assert.equal(rowsNote([], 'reading'), editWords.rowsReading);
  assert.equal(rowsNote([], 'refused'), editWords.rowsUnread);
  assert.doesNotMatch(editWords.rowsUnread, /empty/u);
});

/* THE THREE CHOICES FIT A PHONE ON ONE LINE (audit B of 25 October, Y14): "Something I paste" wrapped under the other two
   and was cut at the edge at 390. Each is two words at most. */
test('each way to try it is two words at most', () => {
  for (const w of [editWords.fromLatest, editWords.fromRow, editWords.fromArrival, editWords.fromJson, editWords.fromAsIs, editWords.fromNow])
    assert.ok(w.split(' ').length <= 2, w);
});
