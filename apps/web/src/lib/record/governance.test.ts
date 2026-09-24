/**
 * `/decide` on a live record: which rows it draws, the host's own sentence when it refuses (with no record
 * behind it too), and the `decide` call an answer sends.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { copy } from '../copy.ts';
import { answer, DECIDED_PAGE, everyGovernance, keepDecided, olderDecisions, pagesStanding, pairs, park, plainOf, questionOf, readOne, readQueue, type Governor, type Queue } from './governance.ts';
import { updatesOf } from '../../routes/decide/[id]/changes.ts';
import type { Question } from './schema.ts';

type Calls = { name: string; args: unknown }[];

const refused = (code: string, fix: string) => ({ ok: false as const, refusal: { code, fix } });

/** A row named by its internal id in a proposal, and the row in another register named the same way. */
const PORTAGE = '01J8Z3K9Q2W4E6R8T0Y2V4X6Z8';
const ELSEWHERE = '01J8Z3K9Q2W4E6R8T0Y2V4X6Z9';

function client(over: Partial<Governor> = {}, calls: Calls = []): Governor {
  return {
    boot: async () => ({ ok: true, value: { waiting: [{ id: 'SG2', question: 'Per seat or per product?' }] } }),
    governance: async (args) => {
      calls.push({ name: 'governance', args });
      if (args.register === 'decision') {
        const decisions = [{ id: 'D1', question: 'Which registrar?', answer: 'nordhaven', reason: 'Registry lock.', decided_by: 'sam', ts: '2026-09-01T10:00:00Z', suggestion: 'SG1' }];
        return { ok: true, value: args.id ? decisions.find((d) => d.id === args.id) ?? null : decisions };
      }
      if (args.id === 'SG3') return { ok: true, value: null };
      const rows = [
        {
          id: 'SG4',
          body_kind: 'rowset',
          status: 'open',
          opened_by: 'spark',
          opened_at: '2026-09-14T09:00:00Z',
          body: {
            register: 'things',
            rows: [
              { at: 'things#1', version: 3, patch: { lane: 'earning', note: 'one\n2' } },
              { at: PORTAGE, version: 1, patch: { lane: 'earning' } },
              { at: ELSEWHERE, version: 1, patch: { lane: 'earning' } },
              { name: 'A new one' },
            ],
          },
        },
        { id: 'SG2', body_kind: 'options', status: 'open', opened_by: 'sam', opened_at: '2026-09-10T09:00:00Z', body: { options: [{ id: 'seat', label: 'Per seat', because: 'Predictable.' }, { id: 'product', label: 'Per product', because: 'Matches use.', recommended: true }] } },
        { id: 'SG1', body_kind: 'options', status: 'resolved', opened_by: 'sam', opened_at: '2026-08-30T09:00:00Z', body: { options: [{ id: 'nordhaven', label: 'Nordhaven Registry', because: 'Lock.' }, { id: 'cove', label: 'Cove Domains', because: 'Cheaper.' }] }, decision: 'D1' },
      ];
      if (args.id) return { ok: true, value: rows.find((r) => r.id === args.id) ?? null };
      return { ok: true, value: args.status === 'all' ? rows : rows.filter((r) => r.status === (args.status ?? 'open')) };
    },
    schema: async () => ({ ok: true, value: { title: 'name', fields: [{ id: 'name', type: 'text' }, { id: 'lane', type: 'enum', label: 'Status' }, { id: 'note', type: 'document' }] } }),
    get: async (register, seq) => {
      calls.push({ name: 'get', args: { register, seq } });
      return { ok: true, value: { id: '01J', seq, version: 3, fields: { name: 'Kiln', lane: 'building', note: 'one\ntwo' } } };
    },
    call: async (name, args) => {
      calls.push({ name, args });
      if (name === 'get' && args?.spoken === PORTAGE)
        return { ok: true, value: { id: PORTAGE, register: 'things', seq: 2, version: 1, fields: { name: 'Portage', lane: 'building' } } };
      if (name === 'get' && args?.spoken === ELSEWHERE)
        return { ok: true, value: { id: ELSEWHERE, register: 'people', seq: 2, version: 1, fields: { name: 'Halden', lane: 'building' } } };
      return { ok: true, value: { decision: 'D2' } };
    },
    ...over,
  };
}

test('the queue is the record’s open suggestions, in its order, each with the question it asks', async () => {
  const calls: Calls = [];
  const out = await readQueue(client({}, calls));
  assert.equal(out.from, 'live');
  if (out.from !== 'live') return;
  assert.deepEqual(out.value.open.map((q) => [q.id, q.rank]), [['SG4', 1], ['SG2', 2]]);
  assert.deepEqual(calls.find((c) => c.name === 'governance')?.args, { status: 'open', limit: 200 });

  const [rowset, options] = out.value.open;
  assert.equal(options?.title, 'Per seat or per product?');
  assert.deepEqual(options?.options, [
    { key: 'seat', title: 'Per seat', body: 'Predictable.' },
    { key: 'product', title: 'Per product', body: 'Matches use.', recommended: true },
  ]);
  /* A proposal the record did not say the question of is still named, by its id. */
  assert.equal(rowset?.title, 'SG4');
  assert.deepEqual(rowset?.options.map((o) => o.key), ['accept', 'reject']);

  assert.deepEqual(out.value.decided.map((q) => [q.id, q.title, q.decided?.option, q.decided?.by]), [['D1', 'Which registrar?', 'nordhaven', 'sam']]);
  /* THE OPTION IS NAMED BY ITS LABEL, from the suggestion the decision settled. */
  const d1 = out.value.decided[0];
  assert.equal(d1?.options.find((o) => o.key === d1.decided?.option)?.title, 'Nordhaven Registry');
});

test('a rowset update draws its diff from the record’s own rows and declaration', async () => {
  const calls: Calls = [];
  const out = await readQueue(client({}, calls));
  assert.equal(out.from, 'live');
  if (out.from !== 'live') return;
  const updates = updatesOf(out.value.rowsets.SG4, out.value.registers, out.value.rows, plainOf(out.value.registers));
  assert.equal(updates.length, 2);
  assert.equal(updates[0]?.title, 'Kiln');
  const [lane, note] = updates[0]?.changes ?? [];
  assert.deepEqual(lane, { field: 'lane', label: 'Status', long: false, before: 'building', after: 'earning' });
  assert.equal(note?.long, true);

  /* A ROW NAMED BY ITS INTERNAL ID is fetched by that id and drawn; one in another register is not. */
  assert.deepEqual(calls.filter((c) => c.name === 'get' && typeof (c.args as { spoken?: unknown }).spoken === 'string').map((c) => c.args), [
    { spoken: PORTAGE },
    { spoken: ELSEWHERE },
  ]);
  assert.equal(updates[1]?.at, PORTAGE);
  assert.equal(updates[1]?.title, 'Portage');
  assert.deepEqual(updates[1]?.changes, [{ field: 'lane', label: 'Status', long: false, before: 'building', after: 'earning' }]);
});

test('a suggestion no longer open is drawn settled: what was decided, by whom, when, and why', async () => {
  const out = await readOne(client(), 'SG1');
  assert.ok(out.from === 'live');
  const { question, closed } = out.value;
  assert.equal(closed, true);
  assert.equal(question?.title, 'Which registrar?');
  assert.deepEqual(question?.decided, { option: 'nordhaven', reason: 'Registry lock.', by: 'sam', at: '2026-09-01T10:00:00Z' });
  assert.equal(question?.options.find((o) => o.key === question.decided?.option)?.title, 'Nordhaven Registry');

  const open = await readOne(client(), 'SG2');
  assert.ok(open.from === 'live' && open.value.closed === false && open.value.question?.decided === undefined);

  const d = await readOne(client(), 'D1');
  assert.ok(d.from === 'live' && d.value.closed);
  assert.equal(d.value.question?.options.find((o) => o.key === 'nordhaven')?.title, 'Nordhaven Registry');
});

test('what an accepted arrangement did is read back from its decision, for a reload and for every member', async () => {
  const body = { install: 'usecase-personal', title: 'Personal' };
  const governance: Governor['governance'] = async (args) => {
    if (args.register === 'decision')
      return { ok: true, value: { id: 'D7', question: 'Add Personal?', answer: 'accept', reason: 'Yes.', decided_by: 'sam', ts: '2026-09-17T10:00:00Z', suggestion: 'SG7', applied: { installed: ['usecase-personal'] } } };
    return { ok: true, value: { id: 'SG7', body_kind: 'pack', status: 'resolved', opened_by: 'spark', opened_at: '2026-09-17T09:00:00Z', body, decision: 'D7' } };
  };
  for (const id of ['SG7', 'D7']) {
    const out = await readOne(client({ governance }), id);
    assert.ok(out.from === 'live');
    assert.deepEqual(out.value.applied, { did: { installed: ['usecase-personal'] }, body }, id);
  }
  const none = await readOne(client(), 'SG1');
  assert.ok(none.from === 'live' && none.value.applied === undefined);
});

test('decisions pair with the suggestions they name, and one that names none or an unread one pairs with nothing', () => {
  const s = (id: string) => ({ id, body_kind: 'rowset', status: 'resolved', opened_at: '2026-09-01', body: {} });
  const paired = pairs(
    [
      { id: 'D3', answer: 'accept', suggestion: 'SG1' },
      { id: 'D2', answer: 'accept', suggestion: null },
      { id: 'D1', answer: 'accept', suggestion: 'SG9' },
    ],
    [s('SG2'), s('SG1')],
  );
  assert.deepEqual([...paired].map(([k, v]) => [k, v.id]), [['D3', 'SG1']]);
});

/**
 * NO RECORD HERE IS A REFUSAL LIKE ANY OTHER, AND NEVER THE SAMPLE (DIRECTION 26).
 *
 * `node --test` has no `location`, so `noRecord` read an empty pathname as "no slug" and this is the
 * no-slug case exactly: before the sample went, a 401 or an unreachable host at `/app/decide` answered
 * `{ from: 'sample' }` and both screens drew fixture questions nobody had asked. The layout sends a 401
 * to sign-in; a reader that is asked anyway says the host's own sentence.
 */
test('no record here is the host’s own sentence, the same as any other refusal', async () => {
  for (const code of ['UNREACHABLE', 'UNAUTHORIZED']) {
    const wall = client({ governance: async () => refused(code, 'Sign in to open this record.') });
    assert.deepEqual(await readQueue(wall), { from: 'refused', fix: 'Sign in to open this record.' }, `the queue on ${code}`);
    assert.deepEqual(await readOne(wall, 'SG2'), { from: 'refused', fix: 'Sign in to open this record.' }, `one question on ${code}`);
    assert.deepEqual(
      await olderDecisions(wall, { cursor: 'D1', total: 2, suggestions: new Map(), after: null, read: false }),
      { from: 'refused', fix: 'Sign in to open this record.' },
      `older decisions on ${code}`,
    );
  }
  const out = await readQueue(client({ governance: async () => refused('FORBIDDEN', 'You may not read the queue.') }));
  assert.deepEqual(out, { from: 'refused', fix: 'You may not read the queue.' });
});

test('one question is read by its id, a decision from the decisions, and a missing one is null', async () => {
  const calls: Calls = [];
  const sg = await readOne(client({}, calls), 'SG2');
  assert.ok(sg.from === 'live' && sg.value.question?.title === 'Per seat or per product?');
  assert.deepEqual(calls[0]?.args, { register: 'suggestion', id: 'SG2' });

  const d = await readOne(client(), 'D1');
  assert.ok(d.from === 'live' && d.value.question?.decided?.reason === 'Registry lock.');

  const none = await readOne(client(), 'SG3');
  assert.ok(none.from === 'live' && none.value.question === null);
});

test('answering sends decide with the option and the reason, and an empty reason sends nothing', async () => {
  const calls: Calls = [];
  const c = client({}, calls);
  assert.deepEqual(await answer(c, 'SG2', 'product', '  Matches how the fonts are used.  '), { ok: true });
  assert.deepEqual(calls.at(-1), { name: 'decide', args: { id: 'SG2', decide: { option: 'product', reason: 'Matches how the fonts are used.' } } });

  const before = calls.length;
  assert.deepEqual(await answer(c, 'SG2', 'product', '   '), { ok: false, fix: copy.reasonRequired });
  assert.equal(calls.length, before);

  assert.deepEqual(await park(c, 'SG2', '2026-10-01', 'Waiting on the quote.'), { ok: true });
  assert.deepEqual(calls.at(-1), { name: 'decide', args: { id: 'SG2', defer: { until: '2026-10-01', why: 'Waiting on the quote.' } } });
});

test('a refused answer shows the record’s fix, and a conflict says the row changed', async () => {
  const no = client({ call: async () => refused('TRANSITION_ILLEGAL', 'SG2 is resolved, and a decision is made once.') });
  assert.deepEqual(await answer(no, 'SG2', 'seat', 'Because.'), { ok: false, fix: 'SG2 is resolved, and a decision is made once.' });
  const stale = client({ call: async () => ({ ok: false, conflict: { current: {} } }) });
  assert.deepEqual(await answer(stale, 'SG4', 'accept', 'Both are right.'), { ok: false, fix: copy.changedSince });
});

test('an options body with no usable options offers the two words, and a blank question falls back to the id', () => {
  const q = questionOf({ id: 'SG9', body_kind: 'pattern', body: {}, opened_at: '' }, '   ', 3);
  assert.equal(q.title, 'SG9');
  assert.deepEqual(q.options.map((o) => o.title), [copy.acceptIt, copy.rejectIt]);
});

test('an open change that calls out carries its lines, from the egress the record worked out, and nothing else does', async () => {
  const change = {
    id: 'SG7',
    body_kind: 'change',
    status: 'open',
    opened_by: 'S12',
    opened_at: '2026-09-14T09:00:00Z',
    body: {
      declaration_id: 'ingest.paid_hook',
      to: { declarations: [] },
      egress: [{ ingest: 'paid_hook', channel: 'call', host: 'hooks.example.test', every: '15m', trigger: 'schedule', per_day: null, key: 'hook key', sends: [], key_line: null }],
      approve: ['CALLS OUT hooks.example.test · every 15m · grant "hook key"'],
    },
  };
  const base = client();
  const over = client({ governance: async (args) => (args.id === 'SG7' ? { ok: true, value: change } : base.governance(args)) });
  const out = await readOne(over, 'SG7');
  assert.ok(out.from === 'live');
  assert.deepEqual(out.value.calls, [{ ingest: 'paid_hook', channel: 'call', host: 'hooks.example.test', every: '15m', key: 'hook key', sends: [] }]);
  assert.equal(out.value.question?.options.map((o) => o.key).join(), 'accept,reject');

  const plain = await readOne(client(), 'SG2');
  assert.ok(plain.from === 'live' && plain.value.calls.length === 0);
});

test('A DECISION IS PAIRED BY THE SUGGESTION IT NAMES, not guessed from its option and its instant', async () => {
  /* Two questions worded alike, offering the same option ids, answered by one person at one instant and
     out of order. Only the record's link tells them apart, and the labels say which one the screen chose. */
  const opts = (label: string) => ({ options: [{ id: 'yes', label }, { id: 'no', label: 'No' }] });
  const at = '2026-09-02T10:00:00Z';
  const suggestions = [
    { id: 'SG2', body_kind: 'options', status: 'resolved', opened_at: '2026-09-01T09:00:00Z', body: opts('Yes, the second'), decision: 'D1' },
    { id: 'SG1', body_kind: 'options', status: 'resolved', opened_at: '2026-09-01T09:00:00Z', body: opts('Yes, the first'), decision: 'D2' },
  ];
  const decisions = [
    { id: 'D2', question: 'Same words?', answer: 'yes', reason: 'this one', decided_by: 'sam', ts: at, suggestion: 'SG1' },
    { id: 'D1', question: 'Same words?', answer: 'yes', reason: 'not this one', decided_by: 'sam', ts: at, suggestion: 'SG2' },
  ];
  const linked = client({
    governance: async (args) => {
      const rows = args.register === 'decision' ? decisions : suggestions;
      if (args.id) return { ok: true, value: (rows as Record<string, unknown>[]).find((r) => r.id === args.id) ?? null };
      return { ok: true, value: args.status === 'open' ? [] : rows };
    },
  });

  const label = (q: Question | null | undefined) =>
    q?.options.find((o) => o.key === q.decided?.option)?.title;

  const queue = await readQueue(linked);
  assert.ok(queue.from === 'live');
  assert.deepEqual(queue.value.decided.map((q) => [q.id, label(q)]), [['D2', 'Yes, the first'], ['D1', 'Yes, the second']]);

  const d1 = await readOne(linked, 'D1');
  assert.ok(d1.from === 'live');
  assert.equal(label(d1.value.question), 'Yes, the second');

  const sg1 = await readOne(linked, 'SG1');
  assert.ok(sg1.from === 'live');
  assert.equal(sg1.value.question?.decided?.reason, 'this one');
  assert.equal(label(sg1.value.question), 'Yes, the first');
});

test('an arrangement reads the pages it changes as they stand, and not the ones it adds', async () => {
  const calls: Calls = [];
  const got = await pagesStanding(
    client(
      {
        call: async (name, args) => {
          calls.push({ name, args });
          return (args as { page?: string }).page === 'money'
            ? { ok: true, value: { id: 'page.money', version: 3, body: { title: 'Money', blocks: [{ kind: 'table', heading: 'Bills due' }] } } }
            : refused('PAGE_UNKNOWN', 'There is no page declaration page.gone that you can read.');
        },
      },
      calls,
    ),
    [
      { id: 'page.money', kind: 'page', body: {}, was: 3 },
      { id: 'page.gone', kind: 'page', body: {}, was: 1 },
      { id: 'page.dashboards', kind: 'page', body: {}, was: null },
    ],
  );
  assert.deepEqual(got, { 'page.money': { title: 'Money', blocks: [{ kind: 'table', heading: 'Bills due' }] } });
  assert.deepEqual(calls.map((c) => c.args), [{ page: 'money' }, { page: 'gone' }]);
});

test('A QUESTION CARRIES THE REASONING IT WAS OPENED WITH, and one opened with none carries nothing', () => {
  const asked = questionOf({ id: 'SG4', body_kind: 'options', body: { options: [{ id: 'a', label: 'Ship it' }], context: '  Two clients asked for it this week.  ' }, opened_at: '' }, 'Ship dark mode?', 1);
  assert.equal(asked.context, 'Two clients asked for it this week.');
  assert.equal('context' in questionOf({ id: 'SG5', body_kind: 'options', body: { options: [], context: '   ' }, opened_at: '' }, 'Q', 2), false);
});

/** A record of `n` rows that pages as the record does: newest first, `limit` at a time, after the id in `cursor`. */
const paged = (rows: readonly Record<string, unknown>[]) => (args: { limit?: number; cursor?: string }) => {
  const from = args.cursor ? rows.findIndex((r) => r.id === args.cursor) + 1 : 0;
  return rows.slice(from, from + (args.limit ?? 50));
};

test('OPEN QUESTIONS PAST BOOT’S TWENTY: the queue reads every one, a page at a time', async () => {
  const open = Array.from({ length: 437 }, (_, i) => ({ id: `SG${1000 - i}`, body_kind: 'options', status: 'open', question: `Q${i}?`, body: {} }));
  const pages: unknown[] = [];
  const many = client({
    boot: async () => ({ ok: true, value: { waiting: open.slice(0, 20).map((r) => ({ id: r.id, question: r.question })), counts: { decided: 0 } } }),
    governance: async (args) => {
      if (args.register === 'decision') return { ok: true, value: [] };
      pages.push(args.cursor ?? null);
      return { ok: true, value: paged(open)(args) };
    },
  });
  const out = await readQueue(many);
  assert.ok(out.from === 'live');
  assert.equal(out.value.open.length, 437);
  assert.equal(new Set(out.value.open.map((q) => q.id)).size, 437);
  /* BY ID AND NOT BY POSITION. The queue comes back ranked by cost of being wrong, and these 437 are
     all `options` — one band, so the tie falls to the oldest and then to the id, which is not the order
     the pages arrived in. What this line is about is the WORDS, and they belong to a question, not to a
     place in a list. */
  assert.equal(out.value.open.find((q) => q.id === 'SG564')?.title, 'Q436?', 'a question past boot’s twenty keeps the words it asks');
  assert.deepEqual(pages, [null, 'SG801', 'SG601']);
});

test('DECISIONS PAST THE NEWEST TWO HUNDRED: Decide reads a page, says how many there are, and loads the rest in order', async () => {
  const suggestions = Array.from({ length: 260 }, (_, i) => ({
    id: `SG${260 - i}`,
    body_kind: 'options',
    status: 'resolved',
    body: { options: [{ id: 'yes', label: `Yes to ${260 - i}` }] },
    decision: `D${260 - i}`,
  }));
  const decisions = suggestions.map((s) => ({ id: s.decision, question: `About ${s.id}?`, answer: 'yes', reason: 'r', ts: '2026-09-01T00:00:00Z', suggestion: s.id }));
  const many = client({
    boot: async () => ({ ok: true, value: { waiting: [], counts: { decided: 260 } } }),
    governance: async (args) => {
      if (args.id) return { ok: true, value: null };
      if (args.register === 'decision') return { ok: true, value: paged(decisions)(args) };
      if (args.status === 'open') return { ok: true, value: [] };
      return { ok: true, value: paged(suggestions)(args) };
    },
  });
  const out = await readQueue(many);
  assert.ok(out.from === 'live');
  assert.equal(out.value.decided.length, DECIDED_PAGE);
  assert.equal(out.value.older?.total, 260);
  let older = out.value.older!;
  const all = [...out.value.decided];
  while (older.cursor !== null) {
    const next = await olderDecisions(many, older);
    assert.ok(next.from === 'live');
    all.push(...next.value.decided);
    older = next.value.older;
  }
  assert.equal(all.length, 260);
  assert.equal(new Set(all.map((q) => q.id)).size, 260);
  const last = all.at(-1)!;
  assert.equal(last.id, 'D1');
  assert.equal(last.options.find((o) => o.key === last.decided?.option)?.title, 'Yes to 1', 'the oldest decision is named by the option it chose');
});

test('DECISIONS ALREADY PAGED IN STAY DOWN THE SCREEN when the queue is read again, and paging carries on from there', () => {
  const decision = (n: number): Question => ({ id: `D${n}`, title: `About SG${n}?`, cost: '', rank: 0, opened: '2026-09-01T00:00:00Z', options: [], decided: { option: 'yes', reason: 'r', by: 'sam', at: '2026-09-01T00:00:00Z' } });
  const queue = (decided: Question[], cursor: string | null, total: number, suggestions: [string, Record<string, unknown>][]): Queue => ({
    open: [],
    decided,
    rowsets: {},
    registers: {},
    rows: {},
    older: { cursor, total, suggestions: new Map(suggestions), after: cursor, read: true },
  });
  /* The reader had three pages of fifty and was partway down; the answer they just gave conflicted. */
  const had = queue(Array.from({ length: 150 }, (_, i) => decision(300 - i)), 'D151', 300, [['SG300', { id: 'SG300' }]]);
  /* The fresh read answers the newest fifty only, led by the decision just written. */
  const fresh = queue([decision(301), ...Array.from({ length: 49 }, (_, i) => decision(300 - i))], 'D252', 301, [['SG301', { id: 'SG301' }]]);

  const merged = keepDecided(had, fresh);
  assert.equal(merged.decided.length, 151, 'the fifty read again plus every older one already asked for');
  assert.equal(merged.decided[0]?.id, 'D301', 'the decision just written leads');
  assert.equal(merged.decided.at(-1)?.id, 'D151', 'the oldest one the reader had paged in is still there');
  assert.equal(new Set(merged.decided.map((d) => d.id)).size, 151, 'nothing is drawn twice');
  assert.equal(merged.older?.cursor, 'D151', 'the next page starts below what the reader already has');
  assert.equal(merged.older?.total, 301, "the record's own count of every decision");
  assert.deepEqual([...(merged.older?.suggestions.keys() ?? [])], ['SG301', 'SG300'], 'the suggestions read for both pages name the options');

  /* A first read has nothing to keep, and a queue with no older page is taken as it comes. */
  assert.equal(keepDecided(null, fresh), fresh);
  assert.equal(keepDecided(queue([], null, 0, []), fresh), fresh);
});

test('A HOST THAT IGNORES THE CURSOR cannot loop a screen: a page that goes nowhere is the last', async () => {
  const rows = Array.from({ length: 200 }, (_, i) => ({ id: `SG${i}` }));
  let asked = 0;
  const out = await everyGovernance({ governance: async () => (asked++, { ok: true, value: rows }) }, { status: 'open' });
  assert.ok(out.ok);
  assert.equal(asked, 2);
});
