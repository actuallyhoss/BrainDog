/**
 * A pattern question's messages as its rule reads them on Decide (`pattern-reads.ts`): who each is from, every field
 * and its value, how many more like them wait, and what all that waits comes to.
 *
 * THE RECORD IS A STAND-IN, answering the four calls the reads make (`inbox`, `schema`, `tryPattern`) from tables here,
 * so what is asserted is what the screen makes of the answers and what it asked for.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import '../../../lib/record/fixtures/fill.ts';
import { proposedOf } from './proposed.ts';
import { acceptSaid, closedSaid, patternReads, readsOf, totalOf, wholeOf, words } from './pattern-reads.ts';

/* TWO OF `fixtures/names.ts`'s invented people and one of its projects, written here: a file under `src/` may not reach
   out of `apps/web` by a relative path (`graph`, 31 §3 layer 3), and the names file is no package to import. */
const SHOP = 'priya@saltmarsh.example';
const OTHER = 'joaquin@pellucid.example';
const PROJECTS = ['Lanternfish', 'Copperleaf', 'Brightwell site', 'Quietcart'] as const;

type Arrival = { id: string; from: string; state: 'untriaged' | 'matched'; read: Record<string, unknown> };

const eur = (amount: number) => ({ amount, currency: 'EUR' });

/** Three samples, two more alike waiting, one from somebody else; the third sample has no day the rule can find. */
const ARRIVALS: Arrival[] = [
  { id: 'a5', from: SHOP, state: 'untriaged', read: { amount: eur(400), merchant: PROJECTS[3], day: '2026-10-05' } },
  { id: 'a4', from: SHOP, state: 'untriaged', read: { amount: eur(600), merchant: PROJECTS[3], day: '2026-10-04' } },
  { id: 'x1', from: OTHER, state: 'untriaged', read: {} },
  { id: 'a3', from: SHOP, state: 'untriaged', read: { amount: eur(1000), merchant: PROJECTS[3] } },
  { id: 'a2', from: SHOP, state: 'untriaged', read: { amount: eur(2000), merchant: PROJECTS[3], day: '2026-10-02' } },
  { id: 'a1', from: SHOP, state: 'matched', read: { amount: eur(1250), merchant: PROJECTS[3], day: '2026-10-01' } },
];

const INGEST = {
  ingest: 'shop_receipts',
  channel: 'email',
  extract: { amount: { money: { after: 'Total' } }, merchant: { text: { after: 'From' } }, day: { date: { after: 'On' } } },
  writes: { register: 'receipts' },
};

const reply = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** The record as a stand-in fetch, with what it was asked. `refuse` names a method it answers with a refusal. */
function standIn(arrivals: readonly Arrival[], refuse?: string): { io: typeof fetch; asked: { method: string; args: Record<string, unknown> }[] } {
  const asked: { method: string; args: Record<string, unknown> }[] = [];
  const line = (a: Arrival) => ({ rowid: 0, id: a.id, ts: '2026-10-05T09:00:00Z', channel: 'email', from: a.from, to: '', subject: 'Receipt', body: 'Total 4.00', state: a.state, reason: null });
  const io = (async (url: string | URL | Request, init?: RequestInit) => {
    const at = new URL(String(url));
    const method = at.pathname.slice('/api/'.length);
    /* A READ GOES AS A GET, its structured arguments as JSON in the query, so each is read back as the client wrote it. */
    const said = (v: string): unknown => {
      try {
        return JSON.parse(v);
      } catch {
        return v;
      }
    };
    const args = (init?.body ? JSON.parse(String(init.body)) : Object.fromEntries([...at.searchParams].map(([k, v]) => [k, said(v)]))) as Record<string, unknown>;
    asked.push({ method, args });
    if (method === refuse) return reply({ ok: false, refusal: { code: 'FORBIDDEN', fix: 'Not yours to read.' } }, 403);
    if (method === 'inbox') {
      const lines = arrivals.filter((a) => args.state === 'all' || a.state === args.state).map(line);
      return reply({ ok: true, value: { arrivals: lines, cursor: null } });
    }
    if (method === 'schema')
      return reply({ ok: true, value: { id: 'receipts', fields: [{ id: 'amount', label: 'Amount', type: 'money' }, { id: 'merchant', label: 'Shop' }] } });
    if (method === 'tryPattern') {
      const ids = args.samples as string[];
      const reads = ids.map((id) => arrivals.find((a) => a.id === id)?.read ?? {});
      const extract = ((args.ingest as Record<string, unknown>).extract ?? {}) as Record<string, unknown>;
      const fields = Object.keys(extract).map((field) => ({
        field,
        from: 'extract',
        how: extract[field],
        cells: reads.map((r) => (field in r ? { ok: true, value: r[field], raw: null } : { ok: false, value: null, raw: null })),
      }));
      return reply({ ok: true, value: { claims: ids.map(() => true), fields, waited: null } });
    }
    return reply({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: `There is no method called ${method}.` } }, 404);
  }) as typeof fetch;
  return { io, asked };
}

/** The reads with the stand-in as the page's fetch, put back after. */
async function withRecord<T>(io: typeof fetch, run: () => Promise<T>): Promise<T> {
  const was = globalThis.fetch;
  globalThis.fetch = io;
  try {
    return await run();
  } finally {
    globalThis.fetch = was;
  }
}

test('A PATTERN QUESTION CARRIES ITS INGEST AND SAMPLES for the reads, and a question of another kind carries none', () => {
  const out = proposedOf('pattern', { ingest: INGEST, samples: ['a3', 'a2', 'a1'] });
  assert.deepEqual(out?.pattern, { ingest: INGEST, samples: ['a3', 'a2', 'a1'] });
  assert.equal(out?.samples, 3);
  const rule = proposedOf('pattern', { ingest: { id: 'rule.flag', kind: 'rule', body: { rule: 'flag', register: 'invoices', then: [] } }, samples: ['a1'] });
  assert.equal(rule?.pattern, undefined);
  const page = proposedOf('change', { to: { id: 'page.x', kind: 'page', body: { title: 'X', blocks: [] } } });
  assert.equal(page?.pattern, undefined);
});

test('three samples read into a message each: who it is from, then each field by its label, and a missed one empty', async () => {
  const { io } = standIn(ARRIVALS);
  const out = await withRecord(io, () => patternReads('http://one.record.test', { ingest: INGEST, samples: ['a3', 'a2', 'a1'] }));
  assert.ok(out);
  assert.equal(out.rows.length, 3);
  assert.deepEqual(out.rows.map((r) => r.from), [SHOP, SHOP, SHOP]);
  assert.deepEqual(out.rows[0]?.fields, [
    { field: 'Amount', value: 'EUR 10.00' },
    { field: 'Shop', value: PROJECTS[3] },
    /* THE LIST DOES NOT NAME `day`, so it is said from its id; and this message has none the rule could find. */
    { field: 'Day', value: '' },
  ]);
  assert.equal(out.rows[1]?.fields[2]?.value, '2026-10-02');
});

test('HOW MANY MORE WAIT IS THE KERNEL SHAPE, and what all that waits comes to is summed in its currency', async () => {
  const { io, asked } = standIn(ARRIVALS);
  const out = await withRecord(io, () => patternReads('http://two.record.test', { ingest: INGEST, samples: ['a3', 'a2', 'a1'] }));
  /* a5 and a4 wait beside the samples; x1 is from somebody else and a1 was filed, so neither is one more. */
  assert.equal(out?.waiting, 2);
  assert.match(words.more(2), /^2 more like these wait/u);
  /* EVERYTHING WAITING WAS READ IN ONE REHEARSAL: a3, a2, a5 and a4, and not a1, which no longer waits. */
  assert.equal(out?.total, 'EUR 40.00');
  const tried = asked.find((a) => a.method === 'tryPattern');
  assert.deepEqual(tried?.args.samples, ['a3', 'a2', 'a1', 'a5', 'a4']);
});

test('null when the samples cannot be read, and null when the rehearsal is refused', async () => {
  const unread = standIn(ARRIVALS, 'inbox');
  assert.equal(await withRecord(unread.io, () => patternReads('http://three.record.test', { ingest: INGEST, samples: ['a3'] })), null);
  const untried = standIn(ARRIVALS, 'tryPattern');
  assert.equal(await withRecord(untried.io, () => patternReads('http://four.record.test', { ingest: INGEST, samples: ['a3'] })), null);
  /* AND NONE OF THE SAMPLES FOUND IS THE SAME: nothing to draw. */
  const gone = standIn([]);
  assert.equal(await withRecord(gone.io, () => patternReads('http://five.record.test', { ingest: INGEST, samples: ['a3'] })), null);
});

test('NO TOTAL ACROSS TWO CURRENCIES, and none when more wait than one rehearsal reads', () => {
  const tried = {
    claims: [true, true, false],
    fields: [{ field: 'amount', from: 'extract' as const, how: null, cells: [eur(500), { amount: 700, currency: 'USD' }, eur(900)].map((value) => ({ ok: true, value, raw: null })) }],
    waited: null,
  };
  assert.equal(totalOf(tried, [0, 1]), null);
  /* AN ARRIVAL THE RULE DOES NOT CLAIM FILES NOTHING, so its amount is not counted. */
  assert.equal(totalOf(tried, [0, 2]), 'EUR 5.00');
  const shown = [{ key: 'a1', channel: 'email', from: ' ', subject: '', body: '' }];
  const out = readsOf(shown, tried, (f) => f, { more: 40, tried: null });
  assert.deepEqual(out, { rows: [{ from: null, fields: [{ field: 'amount', value: 'EUR 5.00' }] }], waiting: 40, total: null, accept: null });
});

test('WHAT ACCEPT DOES IS SAID FROM THE SAME REHEARSAL: the whole ones filed with one Undo, the part one kept waiting', async () => {
  const { io, asked } = standIn(ARRIVALS);
  const out = await withRecord(io, () => patternReads('http://six.record.test', { ingest: INGEST, samples: ['a3', 'a2', 'a1'] }));
  /* a5, a4 and a2 read every field; a3 has no day, so it waits in the same question. a1 was filed and is not counted. */
  assert.equal(out?.accept, 'Accept files the 3 it reads, with one Undo. 1 keeps waiting: it reads only part of it.');
  /* NEVER A SECOND REQUEST A SAMPLE: one rehearsal answers the reads and the counts alike. */
  assert.equal(asked.filter((a) => a.method === 'tryPattern').length, 1);
});

test('MORE WAITING THAN ONE REHEARSAL READS: the rest are said as read when he accepts, never guessed from the ten', async () => {
  const many: Arrival[] = Array.from({ length: 14 }, (_, i) => ({
    id: `m${String(i).padStart(2, '0')}`,
    from: SHOP,
    state: 'untriaged' as const,
    read: i % 5 === 0 ? { amount: eur(100), merchant: PROJECTS[1] } : { amount: eur(100), merchant: PROJECTS[1], day: '2026-10-03' },
  }));
  const { io } = standIn(many);
  const out = await withRecord(io, () => patternReads('http://seven.record.test', { ingest: INGEST, samples: ['m00', 'm01', 'm02'] }));
  /* TEN READ: m00 and m05 miss the day, eight read whole; four more wait past the rehearsal. */
  assert.equal(out?.accept, 'Accept files the 8 it reads, with one Undo. 2 keep waiting: it reads only part of them. It reads the other 4 when you accept.');
  assert.equal(out?.total, null);
});

test('one and many, none whole, and a count the walk could not reach', () => {
  assert.equal(acceptSaid({ whole: 1, part: 0 }, 1), 'Accept files the one it reads, with Undo.');
  assert.equal(acceptSaid({ whole: 28, part: 4 }, 32), 'Accept files the 28 it reads, with one Undo. 4 keep waiting: it reads only part of them.');
  assert.equal(acceptSaid({ whole: 2, part: 1 }, 4), 'Accept files the 2 it reads, with one Undo. 1 keeps waiting: it reads only part of it. It reads the other one when you accept.');
  assert.equal(acceptSaid({ whole: 1_200, part: 0 }, 1_200), 'Accept files the 1,200 it reads, with one Undo.');
  /* NONE READ WHOLE: Accept still keeps the pattern, and says it files nothing yet. */
  assert.equal(acceptSaid({ whole: 0, part: 0 }, 0), words.filesNone);
  assert.equal(acceptSaid({ whole: 0, part: 3 }, 3), 'Accept keeps the pattern; nothing it reads yet would be filed. 3 keep waiting: it reads only part of them.');
  assert.equal(acceptSaid({ whole: 0, part: 2 }, 12), 'Accept keeps the pattern; nothing it has read yet would be filed. 2 keep waiting: it reads only part of them. It reads the other 10 when you accept.');
  /* MORE WAIT THAN THE WALK REACHED: how many is not said. */
  assert.equal(acceptSaid({ whole: 7, part: 3 }, null), 'Accept files the 7 it reads, with one Undo. 3 keep waiting: it reads only part of them. It reads the rest that wait when you accept.');
});

test('A READ IS WHOLE WHEN IT FILLS EVERY FIELD THE PATTERN WRITES, and claimed; an empty value is a part read', () => {
  const cell = (value: unknown, ok = true) => ({ ok, value: value as never, raw: null });
  const tried = {
    claims: [true, true, true, false],
    fields: [
      { field: 'amount', from: 'extract' as const, how: null, cells: [cell(eur(100)), cell(eur(200)), cell(eur(300)), cell(eur(400))] },
      { field: 'merchant', from: 'extract' as const, how: null, cells: [cell(PROJECTS[0]), cell(''), cell(null, false), cell(PROJECTS[2])] },
    ],
    waited: null,
  };
  assert.deepEqual(wholeOf(tried, [0, 1, 2, 3]), { whole: 1, part: 3 });
  assert.deepEqual(wholeOf(tried, []), { whole: 0, part: 0 });
  /* AND readsOf SAYS IT ONLY WHEN THE WAITING ONES WERE READ. */
  const shown = [{ key: 'a1', channel: 'email', from: SHOP, subject: '', body: '' }];
  assert.equal(readsOf(shown, tried, (f) => f, { more: 3, tried: null, read: [0, 1, 2, 3], all: 4 }).accept, 'Accept files the one it reads, with Undo. 3 keep waiting: it reads only part of them.');
  assert.equal(readsOf(shown, tried, (f) => f, { more: 3, tried: null }).accept, null);
});

test('A RESOLVED QUESTION SAYS THE RECORD\'S OWN CLOSING NOTE as it was written, and an open one says none', () => {
  const note = 'Filed 4 with this pattern. 1 still waits: it reads only part of it.';
  assert.equal(closedSaid(note, true), note);
  assert.equal(closedSaid('Nothing waited.', true), 'Nothing waited.');
  /* OPEN, or closed with nothing said, or a note that is not words: nothing stands in for the reads. */
  assert.equal(closedSaid(note, false), null);
  assert.equal(closedSaid(undefined, true), null);
  assert.equal(closedSaid('  ', true), null);
  assert.equal(closedSaid({ filed: 4 }, true), null);
});
