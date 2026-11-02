/**
 * `display()`, which decides how every value in the product reaches a person's eye.
 *
 * `money()` itself is tested in the render package. What is NOT tested there, and is the thing that
 * would actually break, is the DISPATCH: `display()` reads a field's declared type and picks a
 * formatter, and the failure mode is silent. A type that falls through to the `default` branch does
 * not throw and does not look broken — it prints `480000` where `GBP 4,800.00` belongs, and the
 * number is wrong by two orders of magnitude on a screen somebody is about to act on. That is the
 * one formatting bug this product cannot ship, so it is the first thing here.
 *
 * The second is `secret`. Nothing in the app is allowed to render a credential, and the test that
 * matters is not "it returns dots" but "the value never appears in the output".
 *
 * And `isProse`, because bidirectional text is decided from the declared type and getting it
 * backwards is invisible until somebody types Arabic into a record.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { openRecord, type Kernel } from '@braindog/kernel';
import { installSeed } from '@braindog/seed';

import { columnsFor, currencyFor, dirOf, display, identityFor, isProse, labelOf, learnHome, seqWidth, readableFields, spokenRow, toRows, unnamed } from './api.ts';
import { applyFilters, backlinks, boot, metric, page, pages, readBlock, search } from './fixtures/readers.ts';
import { amountOf } from './money.ts';
import { toSegments } from './blocks.ts';
import { declaredValue } from './where.ts';
import { seedBlock } from './seed.ts';
import { hrefFor } from './metrics.ts';
import { AUDIT, JOB, NEWS, NOW, KEYCHAIN } from './fixtures/sample.ts';
import { PAGES, REGISTERS, ROWS } from './held.ts';
import { blockOf as liveBlockOf } from './page-live.ts';
import { layoutOf } from './boot-live.ts';
import type { BlockResult } from './api.ts';
import type { Entry } from './schema.ts';
import type { Column } from 'braindog-render/svelte';
import { magnitudeOf } from 'braindog-render';
/* THE SAMPLE'S ROW NAMES, which a live tab learns from the record and this test asks the mirror about by name. */
import './fixtures/fill.ts';
/* THE SAMPLE'S RECORD IS KEPT IN POUNDS, as its `boot` would say: `homeCurrency()` reads the booted shell now and no longer counts the rows `fill.ts` puts in `held.ts`. */
learnHome('GBP');

/* ── money ───────────────────────────────────────────────────────────────── */

const gbp = (amount: number) => ({ amount, currency: 'GBP' });

test('money is divided out of minor units, with its code', () => {
  assert.equal(display('obligations', 'amount', gbp(480_000)), 'GBP 4,800.00');
  assert.equal(display('obligations', 'amount', gbp(1)), 'GBP 0.01');
  assert.equal(display('obligations', 'amount', gbp(100)), 'GBP 1.00');
});

test('A MONEY VALUE CARRIES ITS OWN CURRENCY, and the screen prints that one', () => {
  /* This read one `CURRENCY = 'GBP'` constant for every money field on every screen, so a euro
     invoice would have rendered as sterling — the right digits under the wrong code, on the one kind
     of figure somebody acts on. */
  assert.equal(display('obligations', 'amount', { amount: 480_000, currency: 'EUR' }), 'EUR 4,800.00');
  assert.equal(display('obligations', 'amount', { amount: 4_800, currency: 'JPY' }), 'JPY 4,800');
});

test('and a money field with no currency prints the digits rather than a guessed code', () => {
  // A row written before the field was money, or a caller that dropped half the value. Digits with
  // no code is honest; digits under an invented one is not.
  assert.equal(display('obligations', 'amount', 480_000), '480,000');
});

test('a money field never renders the raw integer', () => {
  for (const minor of [1, 99, 100, 480_000, 1_910_000]) {
    const out = display('obligations', 'amount', gbp(minor));
    assert.ok(out, 'a value was given, so a string is owed');
    assert.notEqual(out, String(minor), `${minor} reached the screen as minor units`);
    assert.ok(out.startsWith('GBP '), `${out} lost its currency code`);
  }
});

test('zero is a number, not nothing', () => {
  // `0` is falsy and the guard at the top of `display` tests for null/undefined/'' precisely so
  // that a real zero — a service that costs nothing — still prints.
  assert.equal(display('obligations', 'amount', gbp(0)), 'GBP 0.00');
});

test('null, undefined and empty are absent rather than zero', () => {
  assert.equal(display('obligations', 'amount', null), null);
  assert.equal(display('obligations', 'amount', undefined), null);
  assert.equal(display('obligations', 'amount', ''), null);
});

/* ── the other types ─────────────────────────────────────────────────────── */

test('a day is spelled, so no reader has to know the local order', () => {
  // Months as words is the point: 03/09 is two different days either side of an ocean.
  const now = Date.parse('2026-09-03T12:00:00Z');
  assert.equal(display('obligations', 'due', '2026-07-27', now), '27 Jul', 'a day in the year it is read in has no year');
  assert.equal(display('obligations', 'due', '2025-07-27', now), '27 Jul 2025');
});

test('an enum reads as words, not as an identifier', () => {
  assert.equal(display('tasks', 'state', 'done'), 'done');
  /* A VALUE WITH NO LABEL LOSES ITS UNDERSCORES. This was `obligations.state`'s `written_off` until money-core 3.0.0
     labelled that list's values, which the next line holds. */
  assert.equal(display('services', 'cycle', 'two_yearly'), 'two yearly');
  /* `updates.health` WAS THE CASE HERE until the redesign labelled it, as its chips and composer said it. */
  assert.equal(display('updates', 'health', 'at_risk'), 'At risk');
  assert.equal(display('obligations', 'state', 'written_off'), 'Written off');
  /* AND A DECLARED LABEL WINS, where the value has one: money in and money out, not who owes whom. */
  assert.equal(display('obligations', 'direction', 'owed_to_me'), 'Money in');
  assert.equal(display('obligations', 'direction', 'owed_by_me'), 'Money out');
});

test('an int is grouped', () => {
  assert.equal(display('things', 'hue', 12_400), '12,400');
});

test('A LIST OPENS ON WHAT ANSWERS ITS QUESTION, and it used to open on every `index:` field', () => {
  /**
   * `index: true` MEANS FAST TO FILTER, NOT WORTH READING, and this asserted the opposite.
   *
   * The rule it guarded was real once: `columnsFor` read `f.indexed` while the declaration said
   * `index:`, one letter and no error, so the grid quietly fell back to the title and the mobile
   * fields and nothing failed. The fix was right and the test then froze the wrong half of it.
   *
   * A friction pass counted what that cost. `/r/obligations` drew nine columns over thirty-nine
   * rows: 180 numbers, 88 controls and 597 words on a screen whose question is what do I owe and
   * what am I owed. `services` indexes five fields because a page filters on five, which is a
   * decision about SQL taken by whoever wrote the declaration, and it was being read as an
   * editorial one.
   *
   * WHAT IS ASSERTED NOW IS THE EDITORIAL SET the declaration actually nominates: the title, the
   * fields it puts on a card where there is room for three, the state a reader scans to compare,
   * and the deadline the row's whole tone is computed from. A red row with nothing on it saying
   * why is the one thing leaving the deadline off would cost.
   */
  for (const [id, decl] of Object.entries(REGISTERS)) {
    const shown = new Set(columnsFor(id).map((c) => c.field));
    const must = [decl.title, ...decl.mobile, ...(decl.state ? [decl.state] : []), ...decl.fields.filter((f) => f.deadline).map((f) => f.id)];
    for (const f of must) assert.ok(shown.has(f), `${id}.${f} answers this list's question and is not a column`);
    assert.ok(shown.size <= 7, `${id} opens on ${shown.size} columns, which is a database rather than an answer`);
  }
});

test('and every `index:` field is still offerable as a filter, which is what indexing is for', () => {
  /* The half of the old rule that was always true. A filter on an unindexed field is a scan, which
     is what `query.scan` exists to notice, so the filter bar draws exactly the indexed ones: the
     declaration's storage decision belongs there and not in the column set. */
  for (const [id, decl] of Object.entries(REGISTERS)) {
    const offerable = new Set(readableFields(id).map((f) => f.id));
    for (const f of decl.fields)
      if (f.index) assert.ok(offerable.has(f.id), `${id}.${f.id} is declared index: and cannot be filtered on`);
  }
  assert.ok(Object.values(REGISTERS).some((r) => r.fields.some((f) => f.index)), 'no register declares an index');
});

test('A DURATION IS STORED IN SECONDS AND SAID IN ITS DECLARED UNIT', () => {
  /* `0.2` on its own is a number of something, and adding it to `3` needs both to have meant the
     same thing. Seconds is the one unit; the field says how to say it. */
  assert.equal(display('tasks', 'effort', 3 * 86_400), '3 days');
  assert.equal(display('tasks', 'effort', 17_280), '4.8 hours');
  assert.equal(display('tasks', 'effort', 0), '0 days');
});

test('a ref reads as the title of the row it points at', () => {
  // "a person says Halden, not people#1" — the whole reason this branch exists.
  const titleField = REGISTERS.people?.title ?? '';
  const target = ROWS.people?.find((r) => r.seq === 1);
  assert.ok(target, 'the seed needs a people#1 for this to mean anything');
  assert.equal(display('obligations', 'party', 1), String(target.fields[titleField]));
});

test('a ref that points at nothing reads as its kind and number, never a bare number or a spoken id', () => {
  assert.equal(display('obligations', 'party', 999_999), 'Person #999999');
  /* A LIVE RECORD THAT DID NOT NAME IT, and a list this build does not declare, which takes the field's label. */
  assert.equal(display('obligations', 'party', 7, undefined, new Map() as never), 'Person #7');
  assert.equal(unnamed('courses', 1, 'Course'), 'Course #1');
  assert.equal(unnamed('courses', 1), 'Courses #1');
});

test('A REF STILL HELD AS ITS ULID IS NEVER DRAWN AS ONE, nor a ULID in a field nobody declared', () => {
  /* Today's cash by book drew "Book #01M3VMPSHV07AM4S51WDTFM5XG": a ref no walk had turned into a number. */
  const ULID = '01M3VMPSHV07AM4S51WDTFM5XG';
  assert.equal(unnamed('books', ULID), 'Unnamed book');
  assert.equal(display('accounts', 'book', ULID), 'Unnamed book');
  assert.equal(display('accounts', 'book', ULID, undefined, new Map() as never), 'Unnamed book', 'and on a live record that named none');
  assert.equal(unnamed('club_books', ULID), 'Unnamed club book', 'a list this build does not declare, made singular');
  assert.equal(unnamed('courses', ULID, 'Course'), 'Unnamed course');
  assert.equal(unnamed('', ULID), 'Unnamed', 'a part of a figure this build does not declare, and no space after it');
  assert.equal(display('obligations', 'not_a_field', ULID), null);
});

test('A RUN’S PROJECT, HELD AS A SPOKEN ID, READS AS THE PROJECT AND OPENS IT', () => {
  const run = ROWS.session?.find((r) => typeof r.fields.project === 'string');
  assert.ok(run, 'the sample needs a run placed in a project');
  const shown = display('session', 'project', run.fields.project) ?? '';
  assert.doesNotMatch(shown, /#/u);
  const seq = Number(String(run.fields.project).split('#')[1]);
  assert.equal(shown, String(ROWS.things?.find((e) => e.seq === seq)?.fields.name));
  assert.deepEqual(spokenRow('things#999'), { label: 'Project #999', href: '/r/things/999' });
  assert.equal(spokenRow('tracks#1')?.label, String(ROWS.tracks?.find((e) => e.seq === 1)?.fields.name));
  assert.equal(spokenRow('not an id'), null);
});

test('an undeclared field is stringified rather than dropped', () => {
  assert.equal(display('obligations', 'not_a_field', 'whatever'), 'whatever');
});

/* ── the credential ──────────────────────────────────────────────────────── */

test('the one secret field a register declares holds nothing in any row, so there is nothing for display to leak', () => {
  // The strongest form of this guarantee is structural, not behavioural: a key's row indexes what it
  // OPENS. The agents pack declares `credentials.value`, which names the grant the Keychain sealed a key
  // into and which only the Keychain door writes, so no row here holds one and the masking below is the
  // live test for the day one does.
  const declared = Object.entries(REGISTERS).flatMap(([id, reg]) =>
    reg.fields.filter((f) => f.type === 'secret').map((f) => `${id}.${f.id}`),
  );
  assert.deepEqual(declared, ['credentials.value'], 'a secret field reached the record');
  for (const key of ROWS.credentials ?? []) assert.ok(!('value' in key.fields), `credentials#${key.seq} holds a value`);
});

test('a Keychain row carries no value, only what the key opens', () => {
  const SECRETISH = /^(value|secret|token|key|password|credential)$/i;
  for (const row of KEYCHAIN) {
    const leaked = Object.keys(row).filter((k) => SECRETISH.test(k));
    assert.deepEqual(leaked, [], `${row.id} carries ${leaked.join(', ')}`);
  }
});

test('and if one ever is declared, display masks it', () => {
  // Through the same switch the app uses, with a whole register added here rather than a field
  // pushed into an existing one — `fields` is `readonly` on purpose and a test is not a reason to
  // cast that away. The seed staying clean is the previous test's job; this is the branch's.
  const secret = 'sk-live-2f9a41c7d8b3e6';
  REGISTERS.probe = {
    id: 'probe',
    name: 'Probe',
    one: 'probe',
    holds: 'nothing, outside this test',
    title: 'label',
    mobile: ['label', 'label', 'label'],
    fields: [
      { id: 'label', type: 'text' },
      { id: 'token', type: 'secret' },
    ],
  };
  try {
    const out = display('probe', 'token', secret);
    assert.ok(out && !out.includes(secret), 'the credential reached the string');
    assert.equal(out, '••••••••');
    // And it is masked in the metadata too, not just the glyphs.
    assert.equal(out.length, 8);
  } finally {
    delete REGISTERS.probe;
  }
});

/* ── labels ──────────────────────────────────────────────────────────────── */

test('a label is the id with underscores as spaces, capitalised', () => {
  assert.equal(labelOf({ id: 'last_seen', type: 'instant' }), 'Last seen');
  assert.equal(labelOf({ id: 'amount', type: 'money' }), 'Amount');
});

test('a declared label wins over the derived one', () => {
  assert.equal(labelOf({ id: 'what', type: 'text', label: 'Thing owed' }), 'Thing owed');
});

/* ── bidirectional text ──────────────────────────────────────────────────── */

test('prose takes its direction from the text, machine-built strings do not', () => {
  // Prose: somebody typed it, so the first strong character decides.
  assert.equal(isProse('obligations', 'what'), true, 'text');
  assert.equal(isProse('tasks', 'note'), true, 'document');
  assert.equal(isProse('obligations', 'party'), true, 'a ref renders a title, which is prose');

  // Assembled here from a number: the direction is the app's.
  assert.equal(isProse('obligations', 'amount'), false, 'money');
  assert.equal(isProse('obligations', 'due'), false, 'day');
  assert.equal(isProse('obligations', 'direction'), false, 'enum');
  assert.equal(isProse('things', 'hue'), false, 'int');
});

test('an unknown field is treated as prose, because that failure is the safe one', () => {
  // Guessing wrong this way yields a correctly ordered string. The other way yields a broken one.
  assert.equal(isProse('obligations', 'not_a_field'), true);
});

test('dirOf emits the attribute only where it is wanted', () => {
  assert.equal(dirOf('obligations', 'what'), 'auto');
  assert.equal(dirOf('obligations', 'amount'), undefined);
});

/* ── the money tiles, which are the numbers somebody acts on ─────────────── */

test('a per-year figure is annualised, not summed across cycles', () => {
  // `cost` is per CYCLE. Summing a yearly domain and a monthly bucket adds two units: Kiln's
  // "Costs a year" printed GBP 112.00 where the answer is GBP 1,036.00, under the word "year".
  const kiln = metric('project-cost:Kiln');
  assert.match(kiln.label, /year/i);
  const monthlyKiln = (ROWS.services ?? []).filter((s) => s.fields.thing === 1 && s.fields.cycle === 'monthly');
  assert.ok(monthlyKiln.length > 0, 'the seed needs a monthly Kiln service for this to bite');
  const naive = (ROWS.services ?? [])
    .filter((s) => s.fields.thing === 1 && s.fields.state !== 'cancelled')
    .reduce((a, s) => a + (amountOf(s.fields.cost) ?? 0), 0);
  assert.notEqual(kiln.value, `GBP ${(naive / 100).toFixed(2)}`, 'the cycle factor is missing again');
});

test('Overdue is one direction, because two directions do not add up', () => {
  // It summed receivables and payables and painted the total in the alarm colour. Chasing money you
  // are owed and failing to pay a bill are not the same problem and their sum is not a quantity.
  const late = (dir: string) =>
    (ROWS.obligations ?? []).filter(
      (e) =>
        (e.fields.state === 'open' || e.fields.state === 'part') &&
        e.fields.direction === dir &&
        String(e.fields.due) < new Date(NOW).toISOString().slice(0, 10),
    );
  const owe = late('owed_by_me').reduce((a, e) => a + (amountOf(e.fields.amount) ?? 0), 0);
  const owed = late('owed_to_me').reduce((a, e) => a + (amountOf(e.fields.amount) ?? 0), 0);
  assert.ok(owe > 0 && owed > 0, 'the seed needs late rows in both directions for this to mean anything');

  const tile = metric('overdue');
  assert.equal(tile.value, display('obligations', 'amount', gbp(owe)));
  assert.notEqual(tile.value, display('obligations', 'amount', gbp(owe + owed)));
  assert.match(tile.href ?? '', /direction/, 'the link must carry the same direction the figure does');
});

test('the three money tiles are disjoint, so a row is in at most one', () => {
  // "Due in 30 days" counted everything already late as well, so an overdue bill was in it AND in
  // Overdue. Two tiles that overlap cannot be read together, and these three sit in one row.
  const today = new Date(NOW).toISOString().slice(0, 10);
  const rows = (ROWS.obligations ?? []).filter((e) => e.fields.state === 'open' || e.fields.state === 'part');
  const overdue = rows.filter((e) => e.fields.direction === 'owed_by_me' && String(e.fields.due) < today);
  const due30 = rows.filter((e) => {
    if (e.fields.direction !== 'owed_by_me') return false;
    const d = (Date.parse(`${String(e.fields.due)}T12:00:00Z`) - NOW) / 86_400_000;
    return d >= 0 && d <= 30;
  });
  assert.equal(overdue.filter((e) => due30.includes(e)).length, 0, 'a row is counted by two tiles at once');
});

/* ── a total is a total, however many rows went into it ──────────────────── */

/** A record in memory over `node:sqlite`, bound the way the kernel's own tests bind one. */
function openSqlite(): Parameters<typeof openRecord>[0] {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  return {
    exec: (text: string, ...params: unknown[]) => {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
    all: (text: string, ...params: unknown[]) => db.prepare(text).all(...(params as never[])),
    one: (text: string, ...params: unknown[]) => db.prepare(text).get(...(params as never[])),
    transactionSync<T>(fn: () => T): T {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  } as unknown as Parameters<typeof openRecord>[0];
}

/** The seeded record, of this file's own, which a test may write to. */
async function seededRecord(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), { now: () => NOW });
  assert.ok((await installSeed(k)).ok, 'the seed did not install');
  return k;
}

/**
 * A seeded record with `n` extra open obligations owed by you, due inside thirty days.
 *
 * The seed has fewer rows than the cut, which is why this defect was invisible: it only appears on a
 * register that has outgrown one page, and every register does.
 *
 * A RECORD OF ITS OWN, AND IT WAS THE SAMPLE'S `ROWS` PUT BACK AFTERWARDS. Since the app has one engine the fixture reads a record seeded
 * once and never written to (`fixtures/readers.ts`), so a row pushed into `ROWS` reaches no block.
 */
async function withExtra(n: number, amount: number): Promise<Kernel> {
  const k = await seededRecord();
  for (let i = 0; i < n; i++) {
    /* MONEY, not a bare integer: a filler row written as a number would make every total this
       test reads a MIXED one, and the bar would show the refusal rather than the figure. */
    const made = k.create('obligations', { what: `Filler ${i}`, direction: 'owed_by_me', amount: gbp(amount), due: '2026-09-20', state: 'open', note: '', category: 'software' }, { actor: 'p_owner' });
    assert.ok(made.ok, JSON.stringify(made));
  }
  return k;
}

/**
 * WHERE THE MONEY OWED INSIDE THIRTY DAYS GOES, by what it is for, as the Money page declared it before money-core 3.0.0
 * made that page one and left this block off it. Declared here, because what is held is how a block that adds up reads
 * the rows under it, and that is the record's rule for every `split`, not one page's.
 */
const OWED_SPLIT = {
  kind: 'split',
  heading: 'Owed by you, 30 days, by what it is for',
  span: 7,
  source: 'register.obligations',
  where: 'state is open or part, direction is owed by me, due before +31d',
  columns: [{ field: 'category' }, { field: 'amount' }],
  limit: 6,
  unset: 'Uncategorised',
  empty: 'Nothing to pay in the next 30 days.',
} as const;

/** The block as the record reads it and a live page draws it, on `k`, or on the fixture's record. */
const splitOn = (k?: Kernel): BlockResult =>
  k === undefined ? readBlock(OWED_SPLIT as never) : liveBlockOf(k.block(OWED_SPLIT as never) as never, new Map(), NOW);

/** Every row of `k`'s obligations that `OWED_SPLIT`'s filter admits, as the record lists them. */
function admittedBy(k: Kernel): { amount: number }[] {
  const out = k.list({ register: 'obligations', where: OWED_SPLIT.where, limit: 500 });
  assert.ok(out.ok && out.value.cursor === null, JSON.stringify(out.ok ? out.value.cursor : out));
  return out.value.rows.map((r) => ({ amount: amountOf(r.fields.amount) ?? 0 }));
}

const barOf = (slug: string, heading: string) => page(slug)?.blocks.find((b) => b.heading === heading);

test('A BAR ADDS UP THE ANSWER, NOT THE FIRST PAGE OF IT', async () => {
  // `limit:` is how much a reader can take in. Applied before the sum it is how much of the money
  // exists, and the figure is wrong by however many rows did not fit — with nothing on screen that
  // says so, because a total is one line either way.
  const k = await withExtra(80, 100_000);
  const block = splitOn(k);
  assert.deepEqual(block.refusals, [], 'the split refused, so nothing was added up');
  const admitted = admittedBy(k);
  assert.ok(admitted.length > 50, `only ${admitted.length} rows matched, so the cut was never reached`);
  const truth = admitted.reduce((a, e) => a + e.amount, 0);
  const drawn = toSegments(block)
    .flatMap((seg) => ('rows' in seg ? (seg.rows as { cells: string[] }[]) : []))
    .reduce((a, r) => a + Number((r.cells[1] ?? '').replace(/[^0-9.]/g, '')) * 100, 0);
  assert.ok(Math.abs(drawn - truth) < 200, `the bars add to ${drawn} where the rows add to ${truth}`);
});

test('the rows it DRAWS are still cut, because that half was never the bug', async () => {
  /* THE RECORD HANDS A BLOCK THAT ADDS UP EVERY ROW IT MATCHED, never a page of them (`SUMS` in the kernel's
     `pages.ts`), so what is cut is what is DRAWN: the groups, at the block's `limit`, the rest carried below. */
  const k = await withExtra(80, 100_000);
  const block = splitOn(k);
  const admitted = admittedBy(k);
  assert.equal(block.total, admitted.length, 'the count under the block is not the rows it matched');
  assert.equal(block.entries.length, admitted.length, 'the block added up a page of its answer');
  const drawn = toSegments(block).flatMap((seg) => ('rows' in seg ? (seg.rows as { cells: string[] }[]) : []));
  assert.ok(drawn.length <= (block.limit ?? 50), 'the reading cap stopped applying');
  assert.ok(admitted.length > drawn.length, 'nothing was cut, so nothing is being tested');
});

/**
 * NO SHIPPED PAGE DRAWS A GAUGE ANY MORE (estate's moved to `queue` and `split`), but the kind is
 * still one `declare.ts` accepts and `blockOf` still draws, so the two tests below build the block by hand, over the
 * same `services` register estate's gauge once read, rather than assert on a page nobody declares.
 */
const monthlySpend: { kind: 'gauge'; heading: string; span: number; columns: { field: string; label?: string }[]; source: string; where: string; target: number; empty: string } = {
  kind: 'gauge',
  heading: 'Monthly spend',
  span: 5,
  columns: [{ field: 'name', label: 'Every month' }, { field: 'cost' }],
  source: 'register.services',
  where: 'state is live, cycle is monthly',
  target: 22_000,
  empty: 'Nothing on a monthly plan.',
};

test('a gauge sums past the cut too', () => {
  const block = readBlock(monthlySpend as never);
  const of = block.columns[1]?.field ?? '';
  const truth = block.matched.reduce((a, e) => a + (amountOf(e.fields[of]) ?? 0), 0);
  const drawn = toSegments(block).flatMap((seg) => ('rows' in seg ? (seg.rows as { cells: string[] }[]) : []));
  assert.equal(drawn.length, 1, 'a gauge is one row');
  assert.ok(Math.abs(Number((drawn[0]?.cells[1] ?? '').replace(/[^0-9.]/g, '')) * 100 - truth) < 200);
});

test('a gauge keeps its currency when nothing matches', async () => {
  /**
   * BOTH FIGURES LOST THEIR UNIT THE MOMENT THE FILTER MATCHED NOTHING.
   *
   * `total()` reports `currency: null` over an empty set — correctly, no row supplied one — and
   * `asMoney(n, null)` is a value `display()` cannot format, so the value AND the declared target
   * fell through to `String(n)` and printed raw minor units. `/p/estate` on a one-row record read
   * **"Every month  0  of 22,000"** where the declaration says GBP 220.00, three hundred pixels from
   * a tile reading "no more than GBP 3,000.00".
   *
   * It is the state of somebody's first week and nothing had ever looked at it. The target is a
   * declared constant: it does not change when a filter matches nothing, so it cannot lose a unit
   * it never took from the rows.
   */
  /* THE ROWS STAY AND THE FILTER MISSES, which is the state that was measured: a young record
     whose services exist and are not on a monthly cycle. A register with NO rows at all has no
     currency anywhere to find (a money field declares none, only its values carry one), so that
     case is a gap in the declaration rather than in this code, and it is filed as one.

     ON A RECORD OF ITS OWN, AND IT WAS THE SAMPLE'S `ROWS` PUT BACK AFTERWARDS, which since the app has had one engine reached nothing: the
     gauge read the seed's monthly services and this asked the case where something matches. */
  const k = await seededRecord();
  const services = k.list({ register: 'services', limit: 500 });
  assert.ok(services.ok && services.value.rows.length > 0, 'the seed holds no services');
  for (const s of services.value.rows) {
    const wrote = k.update('services', `services#${s.seq}`, { cycle: 'yearly' }, { actor: 'p_owner' });
    assert.ok(wrote.ok, JSON.stringify(wrote));
  }
  const answered = k.block(monthlySpend as never);
  const block = liveBlockOf(answered as never, new Map(), NOW);
  assert.equal(block.total, 0, 'a service is still monthly, so this is not the case where nothing matches');
  const drawn = toSegments(block).flatMap((seg) => ('rows' in seg ? (seg.rows as { cells: string[] }[]) : []));
  assert.equal(drawn.length, 1, 'a gauge is one row');
  const [, value, target] = drawn[0]!.cells;
  assert.match(String(value), /^[A-Z]{3}\s/, `the value lost its currency: ${value}`);
  assert.match(String(target), /^[A-Z]{3}\s/, `the target lost its currency: ${target}`);
  assert.doesNotMatch(String(target), /^\d/, 'the target printed as raw minor units');
});

test('chips count every matching row, and the counts add to the matched total', () => {
  /* ON THE SEED AS IT IS. This ran inside `withExtra`, whose rows are obligations and never reached the estate's chips,
     which count services; the rule is the same at any size, and the size is the bar's to test above. */
  const block = readBlock({ kind: 'chips', heading: 'What it is made of', span: 7, columns: [{ field: 'kind' }], source: 'register.services' } as never);
  assert.ok(block);
  const counted = toSegments(block)
    .flatMap((seg) => ('rows' in seg ? (seg.rows as { cells: string[] }[]) : []))
    .reduce((a, r) => a + Number(r.cells[1] ?? 0), 0);
  assert.equal(counted, block.matched.length);
});

test('when there are more groups than fit, the rest is CARRIED, not dropped', () => {
  // The other way to get a wrong total: cut the bars instead of the rows and the figure is short by
  // the tail. A named remainder keeps the sum whole and says out loud that there is more.
  const block = splitOn();
  const rowsOf = (b: typeof block) =>
    toSegments(b).flatMap((seg) => ('rows' in seg ? (seg.rows as { cells: string[] }[]) : []));
  const whole = rowsOf(block);
  assert.ok(whole.length >= 3, 'the seed needs at least three counterparties for this to mean anything');
  const capped = rowsOf({ ...block, limit: 2 });
  assert.equal(capped.length, 2);
  assert.equal(capped[1]?.cells[0], 'Everything else');
  const sum = (rows: { cells: string[] }[]) =>
    rows.reduce((a, r) => a + Number((r.cells[1] ?? '').replace(/[^0-9.]/g, '')), 0);
  assert.ok(Math.abs(sum(capped) - sum(whole)) < 2, `${sum(capped)} against ${sum(whole)}`);
});

/* ── a tile and its link must agree ──────────────────────────────────────── */

/** The rows a metric's own href actually opens, read the way the register route reads it. */
function opened(href: string): { register: string; entries: Entry[]; rows: number } {
  const url = new URL(href, 'http://x');
  const register = url.pathname.split('/')[2] ?? '';
  const filters = url.searchParams.getAll('f').map((raw) => {
    const [field = '', op = 'is', values = ''] = raw.split(':');
    return { field, op, values: values.split(',') };
  });
  const entries = applyFilters(register, ROWS[register] ?? [], filters);
  return { register, entries, rows: entries.length };
}

test('every metric href opens rows, rather than an empty grid or the whole register', () => {
  // The failure was silent and total: `applyFilters` string-compared dates, so `due:before:today`
  // was true of every row and `due:before:+30d` of none. Overdue said two and opened eighteen;
  // "Due in 30 days" and "Renews in 30 days" opened nothing at all. A figure you cannot click
  // through to is a figure you cannot check.
  const ids = METRICS;
  for (const id of ids) {
    const m = metric(id);
    if (!m.href) continue;
    const { register, rows } = opened(m.href);
    const all = (ROWS[register] ?? []).length;
    assert.ok(rows > 0, `${m.label} links to an empty grid`);
    assert.ok(rows < all, `${m.label} links to the whole register, which is not a filter`);
  }
});

/** Every metric, so a new one cannot be added without being held to the same rule. */
const METRICS = ['project-open:Kiln', 'project-owed:Kiln', 'project-cost:Kiln', 'owed-to-you', 'due-30d', 'overdue', 'renews-30d', 'lapsing'];

const figure = (v: string) => Number(v.replace(/[^0-9.]/g, ''));

test('a tile that shows a COUNT opens exactly that many rows', () => {
  // Not two of them, all of them. The mismatch this catches was a tile counting `blocked` while its
  // link listed three states: 5 on the tile, 4 in the list, and no way to tell which was the answer.
  const counts = METRICS.map((id) => metric(id)).filter((m) => /^[\d,]+$/.test(m.value));
  assert.ok(counts.length >= 3, 'the count tiles have gone missing, so this test is vacuous');
  for (const m of counts) {
    assert.ok(m.href);
    assert.equal(opened(m.href).rows, figure(m.value), `${m.label} says ${m.value} and opens a different number`);
  }
});

test('a tile that shows MONEY adds up to the rows it opens', () => {
  // Same rule, on the half that was never checked: the figure has to be the sum of the rows the link
  // produces. A service's tile is annualised — `cost` is per cycle, and the tile says "a year" — so
  // that is the second reading allowed, and no third one is.
  const money = METRICS.map((id) => metric(id)).filter((m) => /^[A-Z]{3} /.test(m.value));
  assert.ok(money.length >= 4, 'the money tiles have gone missing, so this test is vacuous');
  for (const m of money) {
    assert.ok(m.href);
    const { register, entries } = opened(m.href);
    const field = register === 'services' ? 'cost' : 'amount';
    const plain = entries.reduce((a, e) => a + (amountOf(e.fields[field]) ?? 0), 0);
    const annual = entries.reduce(
      (a, e) => a + (amountOf(e.fields.cost) ?? 0) * (e.fields.cycle === 'monthly' ? 12 : e.fields.cycle === 'two_yearly' ? 0.5 : 1),
      0,
    );
    const tile = Math.round(figure(m.value) * 100);
    assert.ok(
      tile === plain || tile === Math.round(annual),
      `${m.label} shows ${m.value}; the rows it opens add to ${plain} (${Math.round(annual)} a year)`,
    );
  }
});

test('a relative date survives a URL, where + means space', () => {
  // `f=due:before:+30d` arrives as ' 30d' because a query string decodes `+` to a space, so every
  // relative window in a link resolved to nothing. Encoded, it has to round-trip.
  const m = metric('due-30d');
  const href = m.href ?? '';
  assert.ok(href.includes('%2B'), 'a relative date in a href must be percent-encoded');
  const url = new URL(href, 'http://x');
  assert.ok(url.searchParams.getAll('f').some((f) => /:\+\d+d$/.test(f)), 'the + did not survive decoding');
});

test('a ref may be written as a name or as its number, and both resolve', () => {
  // A declaration says `thing is Kiln` because that is what a person reads; a URL says `thing:is:1`
  // because a link should not break when a row is renamed.
  const byName = applyFilters('tasks', ROWS.tasks ?? [], [{ field: 'thing', op: 'is', values: ['Kiln'] }]);
  const bySeq = applyFilters('tasks', ROWS.tasks ?? [], [{ field: 'thing', op: 'is', values: ['1'] }]);
  assert.ok(byName.length > 0);
  assert.equal(byName.length, bySeq.length);
});

/* ── the palette, which is the whole of search ───────────────────────────── */

test('THE CUT IS TAKEN ACROSS THE SOURCES, NOT INSIDE THE FIRST ONE', () => {
  // `search` returned from inside the register loop the moment it hit the cap, and the palette asks
  // for eight — so `obligations`, first in declaration order, took the whole budget every time.
  // Typing `re` returned 8 hits, all Obligations, out of 21 across six other sources, and nothing on
  // screen said the list was partial. `tasks` is last in declaration order, so it was lost most.
  for (const q of ['re', 'in', 'a']) {
    const { hits } = search(q, 8);
    const sources = new Set(hits.map((h) => h.kind));
    assert.ok(hits.length > 0, `${q} found nothing`);
    assert.ok(sources.size >= 4, `${q}: 8 hits came from ${sources.size} source(s): ${[...sources].join(', ')}`);
  }
});

test('a source with more matches than the cap costs the others one slot, not all of them', () => {
  const all = search('a', 9999);
  const byKind = new Map<string, number>();
  for (const h of all.hits) byKind.set(h.kind, (byKind.get(h.kind) ?? 0) + 1);
  /* AND THE GROUPS AGREE WITH THE HITS. `groups` is the same matches kept in their lists rather
     than interleaved, so their counts must add to the total the palette reports. */
  assert.equal(all.groups.reduce((n, g) => n + g.total, 0), all.total);
  assert.equal(all.total, all.hits.length, 'a limit of 9,999 should have held everything');
  const biggest = [...byKind].sort((x, y) => y[1] - x[1])[0];
  assert.ok(biggest && biggest[1] > 8, 'no source has enough matches to swamp the list');
  const { hits } = search('a', 8);
  assert.ok(hits.filter((h) => h.kind === biggest[0]).length <= 2, `${biggest[0]} still took the list`);
});

test('the cap is honoured, and nothing is returned twice', () => {
  const { hits, total } = search('e', 8);
  assert.equal(hits.length, 8);
  assert.equal(new Set(hits.map((h) => h.href)).size, hits.length);
  /* AND IT REPORTS WHAT IT CUT. A capped list that cannot say how much it cut is a list with no way
     past it — which is what the palette was, on the surface `19 §4` makes the primary way to a row. */
  assert.ok(total > hits.length, `nothing was cut, so the report proves nothing (${total})`);
});

/* ── a date is not a deadline ────────────────────────────────────────────── */

test('A ROW IS ONLY LATE AGAINST A DATE THAT MEANS A DEADLINE', () => {
  // The tone came from the first indexed `day` field the register happened to declare. `tracks`
  // declares `opened`, which is always in the past, so every unfinished track was drawn in the
  // alarm colour — a track whose newest update says "on track", painted as an emergency, with the
  // finished one as the only row that was not red.
  const rows = toRows('tracks', ROWS.tracks ?? [], columnsFor('tracks'));
  assert.ok(rows.length > 2);
  assert.equal(rows.filter((r) => r.tone === 'bad').length, 0, 'a track is being drawn as overdue');
});

test('and a register that declares one still reports it', () => {
  for (const register of ['obligations', 'tasks', 'services']) {
    const rows = toRows(register, ROWS[register] ?? [], columnsFor(register));
    assert.ok(rows.some((r) => r.tone === 'bad' || r.tone === 'warn'), `${register} lost its deadline tone`);
  }
});

test('exactly one field per register may be the deadline, and it is declared', () => {
  // Two would make the tone depend on declaration order, which is how this broke in the first place.
  for (const [id, r] of Object.entries(REGISTERS)) {
    const deadlines = r.fields.filter((f) => f.deadline);
    assert.ok(deadlines.length <= 1, `${id} declares ${deadlines.length} deadlines`);
    for (const f of deadlines) assert.equal(f.type, 'day', `${id}.${f.id} is a deadline and not a day`);
  }
});

/* ── the other direction of a ref ────────────────────────────────────────── */

test('A ROW CAN SEE WHAT POINTS AT IT', () => {
  // `ref` declares `to:` and nothing declared the inverse, so the record could say "this invoice is
  // for Halden" and Halden's page could not say "these nine invoices are yours" — which is the half
  // somebody opens a person for. Nothing was added to the data model: the inverse of every ref is
  // already stated once, on the field that declares it.
  const person = backlinks('people', 1);
  assert.ok(person.length > 0, 'a person with invoices has no incoming relations');
  const obligations = person.find((b) => b.register === 'obligations');
  assert.ok(obligations);
  assert.equal(
    obligations.total,
    (ROWS.obligations ?? []).filter((e) => e.fields.party === 1).length,
    'the count is not the number of rows that point here',
  );
});

test('every incoming link opens exactly the rows it counted', () => {
  for (const register of Object.keys(REGISTERS))
    for (const seq of [1, 2]) {
      for (const rel of backlinks(register, seq)) {
        const url = new URL(rel.href, 'http://x');
        const filters = url.searchParams.getAll('f').map((raw) => {
          const [field = '', op = 'is', v = ''] = raw.split(':');
          return { field, op, values: v.split(',') };
        });
        const opened = applyFilters(rel.register, ROWS[rel.register] ?? [], filters).length;
        assert.equal(opened, rel.total, `${register}#${seq} → ${rel.name}·${rel.label} says ${rel.total} and opens ${opened}`);
      }
    }
});

test('the relations are separate, because two fields can point at one place', () => {
  // An update's `track` is what it is about and its `supersedes` is what it replaces. Collapsing
  // them into "Updates (7)" would be a number nobody could act on.
  const seen = new Set<string>();
  for (const rel of backlinks('tracks', 1)) {
    const key = `${rel.register}.${rel.label}`;
    assert.ok(!seen.has(key), `${key} appeared twice`);
    seen.add(key);
  }
  for (const [id, r] of Object.entries(REGISTERS)) {
    const refs = r.fields.filter((f) => f.type === 'ref');
    for (const f of refs) {
      if (!f.to) continue;
      const target = (ROWS[f.to] ?? [])[0];
      if (!target) continue;
      const rels = backlinks(f.to, target.seq);
      const mine = rels.filter((x) => x.register === id);
      // At most one entry per field, never one merged entry for the register.
      assert.ok(mine.length <= refs.length, `${id} produced more relations than it declares refs`);
    }
  }
});

test('a row is never its own backlink, and a register with nothing pointing at it says nothing', () => {
  assert.deepEqual(backlinks('obligations', 1), [], 'nothing points at an obligation, so there is nothing to show');
  for (const rel of backlinks('updates', 1))
    assert.ok(!(rel.register === 'updates' && rel.rows.some((r) => r.key === 'updates#1')), 'a row listed itself');
});

test('the busiest relation is first, because it is why the page was opened', () => {
  const rels = backlinks('things', 1);
  assert.ok(rels.length > 1, 'a project with one incoming relation proves nothing here');
  for (let i = 1; i < rels.length; i++) assert.ok(rels[i - 1]!.total >= rels[i]!.total, 'the relations are not ordered');
});

test('the pointing field is not a column, because every row in the list has the same value for it', () => {
  for (const rel of backlinks('people', 1)) assert.ok(!rel.columns.some((c) => c.field === 'party'));
});

test('A URL CARRIES THE VALUE THE FIELD DECLARES, and one spelling reaches the control', () => {
  /* The record holds `owed_to_me` and the dialect says `owed to me`, and both are right: an
     underscore is not a word and a predicate is a sentence. `norm` made them match, and matching was
     all anything did — so a metric's href wrote `owed%20to%20me` and a segment wrote `owed_to_me`.
     Both filtered correctly, and arriving from the first the segment did not light, because its own
     test is an equality. Pressing it then APPENDED the second spelling to the first. */
  assert.equal(declaredValue('obligations', 'direction', 'owed to me'), 'owed_to_me');
  assert.equal(declaredValue('obligations', 'direction', 'OWED TO ME'), 'owed_to_me');
  assert.equal(declaredValue('obligations', 'direction', 'owed_to_me'), 'owed_to_me');
  /* A value the field does not declare comes back as it was: this canonicalises, it does not
     validate, and swallowing an unknown value would hide a typo behind a filter that matches
     nothing. */
  assert.equal(declaredValue('obligations', 'direction', 'sideways'), 'sideways');
  assert.equal(declaredValue('obligations', 'nosuchfield', 'x'), 'x');

  const href = hrefFor({
    metric: 'owed-to-me',
    name: 'Owed to you',
    source: 'register.obligations',
    where: 'state is open, direction is owed to me',
    value: { sum: 'amount' },
  } as never)!;
  assert.match(href, /direction:in:owed_to_me/, 'a metric handed the reader a spelling its own control does not know');
  assert.ok(!href.includes('%20'), 'a URL carried a spoken value with spaces in it');
});

test('A SEEDED AGGREGATE DOES NOT ADD TWO OPPOSITE THINGS TOGETHER', () => {
  /* A `bar` over obligations grouped every row by counterparty and summed the money — so "Halden
     Type Co GBP 42,490.00" was every obligation regardless of direction: money owed TO you and money
     you OWE, in one bar, in a tile somebody chooses a block from. 21 §3.3 says the preview's config
     is "synthesised from the user's real data"; a figure made of two opposite things is neither. */
  const bar = seedBlock('bar', 'obligations')!;
  assert.ok(bar.where, 'a seeded bar sums the whole register');
  assert.match(bar.where!, /direction is owed/, 'it does not narrow to one side of the register');
  assert.match(bar.heading!, /owed/, 'the heading does not say which side it is about');

  /* AND A GAUGE OVER MONEY GETS A TARGET. `Number({ amount, currency })` is NaN, so the sum was NaN,
     the target was dropped, and the tile read `— of —` — in the one place the picker exists to show
     a shape. Money is an object with its own currency; reading it as a number is the mistake minor
     units exist to make impossible everywhere else. */
  const gauge = seedBlock('gauge', 'obligations')!;
  assert.equal(typeof gauge.target, 'number', 'a gauge over money draws no target, so it draws nothing');
  assert.ok((gauge.target ?? 0) > 0);

  /* A kind that draws one row per row cannot add two things together, so it is not narrowed — the
     rule is about reducing, not about every block. */
  assert.equal(seedBlock('table', 'obligations')?.where, undefined);
});

test('THE CASH WALK SAYS WHAT IT STARTED FROM', () => {
  /* The first row read "In and out −9,190.00 · Balance −4,190.00", which only adds up if you
     already know the walk began at 5,000 — and the red "RUNWAY 0 days" headline above it is derived
     from the same invisible figure. A forecast whose arithmetic cannot be checked from the screen is
     a number somebody has to trust. */
  /* CASH AHEAD IS THE FORECAST PAGE'S SINCE money-core 3.29.0, where Money's home draws the walk small in its hero. */
  const drawn = page('money-forecast');
  const walk = drawn?.blocks.find((b) => b.opening !== undefined);
  assert.ok(walk, 'the forecast page draws no cash walk, so this test proves nothing');
  const first = walk.rows[0]!;
  assert.equal(first.cells[1], 'What is liquid today');
  assert.match(String(first.cells[3]), /GBP/, 'the opening row carries no figure');
  assert.equal(first.cells[2], '', 'the opening is a balance, not a movement');

  /* AND EVERY BALANCE UNDER IT IS THAT NUMBER PLUS A MOVEMENT, which is now checkable by eye. */
  assert.ok(walk.rows.length > 1);
});

test('A RUN LOG QUOTES A NUMBER SOMEBODY CAN GET BACK TO', () => {
  /* Step 1 read "list · obligations where state is open · ✓ 31 rows" and the register holds 22 — not
     open, not open+part, not not-paid. A number nobody can reproduce is the one thing a record about
     being checkable must not print, and a job's log is exactly where somebody goes to find out what
     an agent actually did. */
  const open = (ROWS.obligations ?? []).filter((e) => e.fields.state === 'open').length;
  const step = JOB.events.find((e) => e.seq === 1)!;
  assert.equal(step.out, `${open} rows`, 'the run log and the register disagree about the same query');

  const fenwick = (ROWS.services ?? []).filter((e) => String(e.fields.provider ?? '').includes('Fenwick')).length;
  assert.equal(JOB.events.find((e) => e.seq === 6)!.out, `${fenwick} rows`);
});

test('A ROW AND THE LEDGER AGREE ABOUT WHO PUT IT THERE', () => {
  /* The audit records claude creating `services#6` three days ago; the row's own detail said "Added
     9d ago by you". Two screens, one event, two stories — on the pair whose whole job is that a
     row's history is checkable. A record whose provenance disagrees with its own ledger has no
     provenance. */
  for (const event of AUDIT) {
    if (event.kind !== 'create' || event.target === undefined) continue;
    const [register, seq] = event.target.split('#');
    const row = (ROWS[register!] ?? []).find((e) => e.seq === Number(seq));
    assert.ok(row, `${event.target} is in the audit and not in the record`);
    assert.equal(row.by, event.by, `${event.target}: the row and the ledger disagree about who`);
    assert.equal(row.created, event.at, `${event.target}: the row and the ledger disagree about when`);
  }

  /* AND THE "WHILE YOU WERE AWAY" LINE COUNTS WHAT THE LEDGER HOLDS. It said four services and the
     audit records two, on the surface whose whole job is telling you what happened while you were
     not looking. */
  const made = AUDIT.filter((e) => e.kind === 'create' && e.target?.startsWith('services#')).length;
  const line = NEWS.find((n) => n.text.includes('services from the Fenwick invoice'));
  assert.ok(line, 'the away list no longer mentions the Fenwick services, so this test proves nothing');
  assert.match(line.text, new RegExp(`Added ${made} services`), 'the away list and the audit disagree about how many');
});

test('A ROW SAYS WHICH THING IT BELONGS TO, and every list was grey because nothing could ask', () => {
  /**
   * `identityOf` answers about a NAMED field, which is what a cell needs. A row's leading glyph
   * has no field to name: it wants the answer to "what is this row about", and until this there
   * was no way to ask it, which is why `api.ts`'s own rule that "colour means WHICH PROJECT,
   * everywhere" had four call sites and not one of them was a row.
   */
  const first = (register: string) => ROWS[register]?.[0]?.fields ?? {};

  /* Four of the seven registers the seed ships declare `thing -> things`, and `things` is the one
     register with an `identity:`. So those four lists can say which project a row belongs to in one
     glyph. An agent run names its project as spoken text, not a ref, so it is not among them. */
  for (const register of ['obligations', 'services', 'tracks', 'tasks']) {
    const found = identityFor(register, first(register));
    assert.ok(found, `${register} row 1 belongs to no thing, and it declares a ref that reaches one`);
    assert.ok(found.mark.length > 0, `${register} gave a thing with no mark`);
    assert.equal(typeof found.hue, 'number');
    assert.ok(found.name.length > 0, 'the label a screen reader is given is the name, and it is empty');
  }

  /* AND NULL IS THE COMMON ANSWER AND NOT A FAILURE. `things` is the thing, so it belongs to
     nothing; `people` declares no ref at all. A row with nothing behind it draws no glyph, which
     is the honest picture of "this row is not about a project". */
  assert.equal(identityFor('things', first('things')), null, 'a thing was said to belong to a thing');
  assert.equal(identityFor('people', first('people')), null);
  assert.equal(identityFor('nosuchregister', {}), null, 'a register that does not exist threw or answered');

  /* FIRST MATCH IN DECLARED ORDER, and that is the register's choice and not this function's.
     `obligations` declares `party -> people` BEFORE `thing -> things` BEFORE `book -> books` (the
     book ref money-core 3.1.0 added to every booked list) BEFORE `account -> accounts` (the account a bill is on),
     and the walk lands on the project
     because `people` declares no identity, not because anything here prefers projects. */
  const decl = REGISTERS.obligations!;
  const refs = decl.fields.filter((f) => f.type === 'ref' && f.to).map((f) => f.to);
  assert.deepEqual(refs, ['people', 'things', 'books', 'accounts'], 'the ordering this case rests on has changed');
  assert.equal(identityFor('obligations', first('obligations'))?.name, 'Marlow & Co');

  /* AND A REF THAT POINTS AT NO ROW IS NOT A GLYPH. A row can name a thing that was deleted. */
  assert.equal(identityFor('obligations', { ...first('obligations'), thing: 9999 }), null);
});

/* -- a figure never truncates, and the register says which columns are figures -- */

/* The evaluator hands a block the renderer's columns; the declaration's own column type is the
   other half of that intersection and does not carry `truncate`, so the read is named once here. */
const cols = (b: { columns: unknown }): readonly Column[] => b.columns as readonly Column[];

test('A MONEY COLUMN IS ONE THE REGISTER DECLARES AS MONEY, NOT ONE CALLED amount', () => {
  /* Which columns never truncate was decided by the field NAME, matching `amount` or `cost`.
     `things.revenue` and `people.rate` are declared money and are called neither, so a block
     naming one drew a figure that its column was free to cut off at the ellipsis. 13 section 4.2:
     a truncated figure is not shortened, it is wrong. */
  const things = readBlock({ kind: 'table', source: 'register.things', columns: [{ field: 'revenue' }, { field: 'name' }] });
  assert.equal(cols(things).find((c) => c.field === 'revenue')?.truncate, 'never', 'revenue is money and its column did not say so');
  assert.equal(cols(things).find((c) => c.field === 'name')?.truncate, 'end', 'a name is text and truncates like text');

  const people = readBlock({ kind: 'table', source: 'register.people', columns: [{ field: 'rate' }] });
  assert.equal(cols(people)[0]?.truncate, 'never', 'a rate is money');

  /* AND THE NAME ALONE BUYS NOTHING. A block over no register has no declared type to ask, so a
     column called `amount` is drawn as the text it is being drawn as rather than as a figure. */
  const authored = readBlock({ kind: 'table', columns: [{ field: 'amount' }] });
  assert.equal(cols(authored)[0]?.truncate, 'end', 'a column is not a figure because of what it is called');
});

test('A LIST THE BUILT-IN SAMPLE DOES NOT KNOW TAKES ITS COLUMNS FROM THE DECLARATION THE RECORD SENT, and draws cells', () => {
  assert.deepEqual(columnsFor('suppliers'), [], 'an unknown list with no declaration grew columns');
  const declared = {
    id: 'suppliers', name: 'Suppliers', one: 'Supplier', title: 'name', mobile: ['name', 'city', 'name'] as const,
    fields: [{ id: 'name', type: 'text' as const }, { id: 'city', type: 'text' as const }, { id: 'notes', type: 'text' as const }],
  };
  assert.deepEqual(columnsFor('suppliers', declared as never).map((c) => c.field), ['name', 'city']);
  assert.deepEqual(columnsFor('tasks', declared as never), columnsFor('tasks'), 'a built-in list took a declaration over its own');
});

test('the # column is 8ch for short ids and widens with the digits of the highest id in hand', () => {
  assert.equal(columnsFor('obligations').find((c) => c.field === 'seq'), undefined, 'a list opened on its rows\' numbers');
  assert.equal(columnsFor('obligations', undefined, true).find((c) => c.field === 'seq')?.width, '8ch');
  assert.equal(seqWidth([]), '8ch');
  assert.equal(seqWidth([{ seq: 7 }, { seq: 42 }]), '8ch');
  assert.equal(seqWidth([{ seq: 999 }, { seq: 3 }]), '9ch');
  assert.equal(seqWidth([{ seq: 12345 }]), '11ch');
});

/* ── the Money page's arithmetic ─────────────────────────────────────────── */

const rowsOfBlock = (block: BlockResult) =>
  toSegments(block).flatMap((seg) => ('rows' in seg ? (seg.rows as { cells: string[] }[]) : []));

test('THE BRIDGE ADDS UP BY CONSTRUCTION: cash now, what comes in, what goes out, and where it lands', () => {
  /* A BRIDGE MADE FOR THE TEST, SINCE money-core 3.17.0: Coming and going opens on the calendar, and the
     sample holds no book whose page still draws one. It walks the legs Cash ahead walks on the Forecast page, over thirty days. */
  const ahead = pages()['money-forecast']?.blocks.find((b) => b.kind === 'forecast' && b.source === 'forecast.runway') as { from?: unknown } | undefined;
  assert.ok(ahead?.from, '/p/money-forecast draws no Cash ahead, so this test has no legs to walk');
  const block = readBlock({ kind: 'bridge', span: 12, source: 'forecast.runway', opening: { metric: 'cash-now' }, from: ahead.from, horizon: 30 } as never);
  assert.ok(block.walk, 'the bridge has no walk');
  const rows = rowsOfBlock(block);
  assert.equal(rows.length, 4);
  const figure = (cell: string | undefined) => magnitudeOf(cell ?? '') * 100;
  const [start, arrives, leaves, end] = rows.map((r) => figure(r.cells[1]));
  assert.equal(start, block.walk.from);
  assert.ok(arrives! >= 0 && leaves! <= 0);
  assert.equal(Math.round(start! + arrives! + leaves!), Math.round(end!), 'the rows do not add up');
  assert.equal(rows[3]?.cells[0], 'In 30 days');
});

test('A SPLIT GROUPS BY WHAT THE MONEY IS FOR, in the words the screen shows', () => {
  const block = splitOn();
  const labels = rowsOfBlock(block).map((r) => r.cells[0]);
  assert.ok(labels.includes('Tax'), `no tax group in ${labels.join(', ')}`);
  assert.ok(!labels.some((l) => l?.includes('_')), 'a category printed as its id');
});

test('THE FORECAST PAGE DRAWS ITS BARS BY MONTH as a series, a header naming each line and a row a month', async () => {
  const { draw } = await import('./blocks.ts');
  const series = page('money-forecast')!.blocks.find((b) => b.kind === 'series')!;
  const drawn = draw(series);
  assert.equal(drawn.refusal, null);
  const [segment] = drawn.segments;
  assert.equal(segment?.type, 'block');
  if (segment?.type !== 'block') return;
  assert.equal(segment.kind, 'series');
  assert.deepEqual(segment.rows[0]?.cells, ['Month', 'in: Money in', 'out: Money out', 'state']);
  const months = segment.rows.slice(1);
  assert.equal(months.length, series.bars!.keys.length);
  assert.match(months[0]!.cells[0]!, /^[A-Z][a-z]{2} \d{4}$/u, 'a month as a person says it');
  /* THE FORECAST PAGE'S SINCE money-core 3.29.0: last month, this one and three ahead, where a whole amount ahead is said in whole pounds. */
  assert.ok(months.some((r) => /^£[\d,]+(\.\d\d)?$/u.test(r.cells[1] ?? '')), 'money in the home currency');
  assert.deepEqual(months.slice(-4).map((r) => r.cells[3]), ['due', 'ahead', 'ahead', 'ahead'], 'this month holds money still due in it, and says so');
});

test('THE FORECAST PAGE DRAWS ITS CASH AHEAD as a forecast: the opening, ninety days remembered, every movement, and its knobs', async () => {
  const { draw } = await import('./blocks.ts');
  const forecast = page('money-forecast')!.blocks.find((b) => b.kind === 'forecast')!;
  assert.deepEqual(forecast.refusals, []);
  const drawn = draw(forecast);
  assert.equal(drawn.refusal, null);
  const [segment] = drawn.segments;
  assert.equal(segment?.type, 'block');
  if (segment?.type !== 'block') return;
  assert.equal(segment.kind, 'forecast');
  const marks = segment.rows.map((r) => r.cells[0]);
  assert.equal(marks[0], 'opening');
  assert.ok(marks.filter((m) => m === 'past').length >= 80, 'the sample remembers ninety days of cash');
  assert.equal(marks.filter((m) => m === 'step').length, forecast.walk!.steps.length, 'every movement, not a slice of them');
  /* THIRTEEN WEEKS FIRST ON THE FORECAST PAGE SINCE money-core 3.29.0 (twelve on the home from 3.27.0, ten from 3.17.0),
     AND A YEAR WALKED, the longest length the page offers (`horizons`, and the kernel's WALK_UNASKED), so every length is
     still on the control without walking further than it shows. */
  assert.deepEqual(segment.rows.find((r) => r.cells[0] === 'horizon')?.cells.slice(0, 2), ['horizon', '91']);
  assert.deepEqual(segment.rows.find((r) => r.cells[0] === 'reach')?.cells.slice(0, 2), ['reach', '365']);
  /* `leave` IS FOLDED INTO `count` AND `sell` IS OFFERED, since money-core 3.0.0: one control over the streams, not two
     with opposite meanings, and what a pack declares sellable. */
  assert.deepEqual(segment.rows.find((r) => r.cells[0] === 'knobs')?.cells.slice(0, 2), ['knobs', 'horizon late spend count grow drift sell']);
  /* AND EACH INSTALMENT'S PLAN ON AN `of` ROW UNDER IT, which is what the count control groups the parts of a plan by. */
  assert.ok(segment.rows.some((r) => r.cells[0] === 'of' && r.cells[1] === 'Proofing press'), 'no step says it is part of the proofing press');
  /* THE LATE KNOB MARKS HOW LATE MONEY HAS COME IN, the sample's paid invoices averaged, and a crossing inside a month is said. */
  assert.ok(typeof forecast.lateness === 'number' && forecast.lateness > 0, `clients paid ${forecast.lateness} days late`);
  assert.deepEqual(segment.rows.find((r) => r.cells[0] === 'late')?.cells.slice(0, 2), ['late', String(Math.round(forecast.lateness!))]);
  assert.deepEqual(segment.rows.find((r) => r.cells[0] === 'under')?.cells.slice(0, 2), ['under', '30']);
  assert.equal(forecast.shown, forecast.total, 'a forecast is never a slice');
});

/**
 * A real record's walk, through the page's own door to the chart's own model: the plan each part is in, and what may be
 * sold.
 *
 * MONEY CROSSES THREE HANDS HERE AND EACH ONE WRITES IT DIFFERENTLY: the kernel answers minor units, `blocks.ts` writes
 * them as text with a code, and the renderer reads that text back into pounds and adds it to a balance. A figure off by
 * a hundred, or rounded on the way, is a date control that says the cash lasts longer than it does, so this asks the
 * last hand for its number and holds it to the first hand's to the penny. The figures are invented.
 */
test('A SELL ROW ON A LIVE PAGE IS THE FIGURE THE RECORD READ, to the penny, and selling on a day adds exactly that', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const { openRecord } = await import('@braindog/kernel');
  const { blockOf } = await import('./page-live.ts');
  const { draw } = await import('./blocks.ts');
  const { forecastModel, scenario } = await import('braindog-render');

  const db = new DatabaseSync(':memory:');
  let depth = 0;
  const sql = {
    exec: (text: string, ...params: unknown[]) => (params.length === 0 ? db.exec(text) : db.prepare(text).run(...(params as never[]))),
    all: (text: string, ...params: unknown[]) => db.prepare(text).all(...(params as never[])),
    one: (text: string, ...params: unknown[]) => db.prepare(text).get(...(params as never[])),
    transactionSync<T>(fn: () => T): T {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const out = fn();
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  };
  const at = Date.UTC(2026, 8, 17, 12);
  const k = await openRecord(sql as never, { now: () => at });
  const figure = (metric: string, name: string, source: string, sum: string) => ({
    id: `metric.${metric}`,
    kind: 'metric',
    body: { metric, name, source, value: { sum }, format: 'money.GBP', target: { gte: 0 }, window: '30d', compare: 'none' },
  });
  const put = await k.install([
    { id: 'register.accounts', kind: 'register', body: { id: 'accounts', name: 'Accounts', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'balance', type: 'money', required: true }] } },
    {
      id: 'register.installments',
      kind: 'register',
      body: { id: 'installments', name: 'Instalments', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'plan', type: 'text' }, { id: 'amount', type: 'money', required: true }, { id: 'due', type: 'day', required: true }] },
    },
    { id: 'register.store', kind: 'register', body: { id: 'store', name: 'Store of value', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'worth', type: 'money' }] } },
    figure('cash-now', 'Cash now', 'register.accounts', 'balance'),
    figure('store-value', 'Store value', 'register.store', 'worth'),
  ] as never);
  assert.ok(put.ok, JSON.stringify(put));
  const made = (register: string, fields: Record<string, unknown>) => assert.ok(k.create(register, fields, { actor: 'p_1' }).ok);
  made('accounts', { name: 'Current', balance: { amount: 312_345, currency: 'GBP' } });
  for (const n of [1, 2, 3]) made('installments', { what: `Kiln, ${n} of 3`, plan: 'Kiln', amount: { amount: 120_033, currency: 'GBP' }, due: `2026-1${n - 1}-04` });
  made('store', { what: 'Coins', worth: { amount: 150_075, currency: 'GBP' } });
  made('store', { what: 'Bond', worth: { amount: 99_901, currency: 'GBP' } });

  const answered = k.block({
    kind: 'forecast',
    source: 'forecast.runway',
    opening: { metric: 'cash-now' },
    from: [{ register: 'installments', on: 'due', amount: 'amount', group: 'plan' }],
    horizon: 120,
    knobs: ['horizon', 'count', 'sell'],
    sell: { metric: 'store-value' },
  } as never);
  assert.deepEqual(answered.refusals, []);
  assert.deepEqual(answered.sells, [{ label: 'Store value', value: 249_976 }]);

  const drawn = draw(blockOf(answered as never, new Map(), at));
  assert.equal(drawn.refusal, null);
  const [segment] = drawn.segments;
  assert.ok(segment?.type === 'block' && segment.kind === 'forecast', JSON.stringify(segment));
  const model = forecastModel(segment.rows.map((r) => r.cells));
  assert.ok(model);
  assert.deepEqual(model.knobs, ['horizon', 'count', 'sell']);
  /* THE PLAN REACHES THE CHART, every part under its one name, so counting it out moves all three. */
  assert.deepEqual(model.steps.map((s) => [s.day, s.of, Math.round(s.delta * 100)]), answered.walk!.steps.map((s) => [s.day, 'Kiln', s.delta]));

  const sold = model.sells;
  assert.deepEqual(sold.map((s) => [s.label, Math.round(s.value * 100)]), [['Store value', answered.sells![0]!.value]]);
  const knobs = { horizon: 120, late: 0, spend: 0, leave: [] as string[] };
  const kept = scenario(model, knobs);
  const selling = scenario(model, { ...knobs, sell: '2026-10-20' });
  const on = (s: typeof kept, day: string) => s.days.find((d) => d.day === day)!.balance;
  assert.equal(Math.round((on(selling, '2026-10-19') - on(kept, '2026-10-19')) * 100), 0, 'nothing is sold before the day');
  assert.equal(Math.round((on(selling, '2026-10-20') - on(kept, '2026-10-20')) * 100), 249_976, 'GBP 2,499.76 arrives on the day, to the penny');
  assert.equal(Math.round((selling.days.at(-1)!.balance - kept.days.at(-1)!.balance) * 100), 249_976);
  /* AND THE PLAN COUNTED OUT IS ALL OF IT: GBP 3,600.99 back over the walk. */
  const without = scenario(model, { ...knobs, leave: ['Kiln'] });
  assert.equal(Math.round((without.days.at(-1)!.balance - kept.days.at(-1)!.balance) * 100), 360_099);
});

test('CASH NOW SAYS WHAT IT ADDS UP AND HOW OLD ITS OLDEST BALANCE IS, not its target', () => {
  const stat = readBlock({ kind: 'stat', cells: [{ metric: 'cash-now', label: 'Cash now', note: 'in {{cash-accounts}} account(s), as of {{cash-as-of}}' }] } as never);
  const cash = stat.metrics!.find((m) => m.label === 'Cash now')!;
  assert.match(cash.note, /^in 2 accounts, as of \d{1,2} [A-Z][a-z]{2}$/u);
  assert.equal(metric('cash-as-of').value, cash.note.split('as of ')[1], 'the day is the oldest liquid balance');
});

test('AN ACCOUNT BALANCE OLDER THAN A WEEK SAYS IT IS OUT OF DATE, beside its day, with the watch glyph', () => {
  /* Read by hand, as a book's page declares it: page.money draws no account cards since money-core 3.3.0, and `stale:` is the cards' rule. */
  const cards = readBlock({
    kind: 'cards',
    heading: 'Accounts',
    span: 8,
    source: 'register.accounts',
    columns: [
      { field: 'name', as: 'title' },
      { field: 'balance', as: 'figure' },
      { field: 'kind', label: 'Type', as: 'fact' },
      { field: 'as_of', label: 'As of', as: 'when' },
    ],
    order: [{ field: 'seq', dir: 'asc' }],
    stale: { field: 'as_of', after: '7d' },
  } as never);
  assert.deepEqual(cards.refusals, []);
  const [segment] = toSegments(cards);
  assert.equal(segment?.type, 'block');
  if (segment?.type !== 'block') return;
  const rows = segment.rows.slice(1);
  const reserve = rows.find((r) => r.cells.some((c) => c.includes('Tax reserve')))!;
  assert.equal(reserve.tone, 'warn');
  assert.ok(reserve.cells.some((c) => c.endsWith(', out of date')), reserve.cells.join(' | '));
  const current = rows.find((r) => r.cells.some((c) => c.includes('Studio current account')))!;
  assert.equal(current.tone, undefined, 'a balance from yesterday is not out of date');
  assert.match(readBlock({ ...cards, stale: { field: 'name', after: '7d' } } as never).refusals.join(), /stale:/);
});

/**
 * WHAT IS STILL TO COME IN AND GO OUT, IN ONE LIST BY DATE, as the Money page declared it before money-core 3.0.0 made
 * the page one and drew what falls due from `deadlines` instead. Declared here, because a signed amount and who changed a
 * row last are the record's rules for any table over a list, and Bills and invoices is the list that has both.
 */
const COMING_AND_GOING = {
  kind: 'table',
  heading: 'Coming in and going out',
  span: 12,
  source: 'register.obligations',
  where: 'state is open or part',
  columns: [
    { field: 'what', label: 'Description', width: 'minmax(14ch,1fr)' },
    { field: 'amount', label: 'Amount', width: '15ch', align: 'end', sign: { field: 'direction', minus: 'owed_by_me' } },
    { field: 'due', label: 'Due', width: '13ch', align: 'end' },
    { field: 'changed', label: 'Changed by', width: '18ch' },
  ],
  order: [{ field: 'due', dir: 'asc' }],
  empty: 'Nothing is coming in or going out.',
  limit: 12,
};

test('COMING IN AND GOING OUT SIGN THEIR AMOUNTS AND SAY WHO CHANGED EACH ROW LAST, without a colour', async () => {
  /* ON A RECORD OF ITS OWN, WHERE A RULE CAN ACT. The seed no longer holds a row a rule changed after it was written, so
     the rule's change to Halden's 2026-041 is written here, as a rule matching Halden's reply would write it. */
  const k = await seededRecord();
  const wrote = k.update('obligations', 'obligations#1', { note: 'Halden replied that nothing is due yet.' }, { actor: 'rule:late-reply' });
  assert.ok(wrote.ok, JSON.stringify(wrote));
  const table = liveBlockOf(k.block(COMING_AND_GOING as never) as never, new Map(), NOW);
  assert.deepEqual(table.refusals, []);
  assert.ok(table.entries.length > 0, 'nothing is coming in or going out, so this asks nothing');
  const amount = table.columns.findIndex((c) => c.field === 'amount');
  const changed = table.columns.findIndex((c) => c.field === 'changed');
  table.entries.forEach((e, n) => {
    const cell = String(table.rows[n]?.cells[amount] ?? '');
    assert.equal(cell.charAt(0), e.fields.direction === 'owed_by_me' ? '−' : '+', `${e.fields.what} reads ${cell}`);
  });
  /* THE NEWEST THING SAID ABOUT A ROW IS WHO CHANGED IT: a rule matched Halden's reply on 2026-041. */
  const halden = table.rows.find((r) => r.key === 'obligations#1')!;
  assert.match(String(halden.cells[changed]), /^Late reply, \d{1,2} [A-Z][a-z]{2}$/u);
  /* ANY OTHER IS THE SAMPLE'S OWN HAND, which is BrainDog's and not yours (`byOf`). */
  const other = table.rows.find((r) => r.key !== 'obligations#1')!;
  assert.match(String(other.cells[changed]), /^BrainDog, \d{1,2} [A-Z][a-z]{2}$/u);

  /* A SIGN NOTHING DECIDES IS REFUSED, as the record refuses it. */
  const bad = readBlock({ ...table, columns: [{ field: 'amount', sign: { field: 'what', minus: 'x' } }] } as never);
  assert.match(bad.refusals.join(), /sign: names an enum field/u);
});

test('EVERY MONTH IS SPLIT BY WHAT IT IS FOR, at monthly shares, and what no category holds is its own row, linked', async () => {
  const { draw } = await import('./blocks.ts');
  const split = readBlock({ kind: 'split', heading: 'Every month', span: 12, source: 'metric.every-month-by-category', limit: 6, unset: 'Uncategorised' } as never);
  assert.deepEqual(split.refusals, []);
  const whole = metric('every-month-out');
  const parts = split.parts!;
  assert.ok(parts.groups.length > 0, 'nothing repeats');
  assert.equal(
    parts.groups.reduce((n, g) => n + (g.value ?? 0), 0),
    parts.value,
    'every repeating cost in the sample has a category, so the parts are the whole',
  );
  assert.ok(whole.value.length > 0);

  /* A COST WITH NO CATEGORY IS THE WHOLE LESS THE PARTS, drawn last and opening those rows. */
  const holed = { ...split, parts: { ...parts, value: (parts.value ?? 0) + 12_345 } };
  const drawn = draw(holed);
  const [segment] = drawn.segments;
  assert.equal(segment?.type, 'block');
  if (segment?.type !== 'block') return;
  const last = segment.rows.at(-1)!;
  assert.match(String(last.cells[0]), /Uncategorised/u);
  /* A SPLIT'S VALUE IS A FIGURE, exact in the record's own sign: the 12,345 pence no part holds are £123.45. */
  assert.match(String(last.cells[1]), /£123\.45$/u);
  assert.equal(segment.rows.length, Math.min(parts.groups.length, split.limit ?? 99) + 1);
});

test('a first-party rule acts under its name, and any other rule by its id in words', async () => {
  const { actorOf } = await import('./api.ts');
  assert.equal(actorOf('rule.invoice-late'), 'Chase late payments');
  assert.equal(actorOf('rule.renewal'), 'Renewal');
  assert.equal(actorOf('rule:late-reply'), 'Late reply');
});

test("Student's Assignments list shows the course of each by default", async () => {
  const { useCase } = await import('@braindog/seed/usecases');
  const decl = ((useCase('student')?.pack?.declarations ?? []) as Record<string, unknown>[]).find((d) => d.register === 'assignments');
  assert.ok(decl);
  assert.deepEqual(columnsFor('assignments', decl as never).map((c) => c.field), ['what', 'state', 'course', 'due']);
});

/* ── the rail, at the scale he actually keeps ────────────────────────────── */

/**
 * TWENTY-SIX PROJECTS PUT TWENTY-SIX LINKS IN THE RAIL, and nothing had ever counted them.
 *
 * `pages()` turns one declaration carrying `for:` into one page per row it admits, and `boot()`
 * put every page carrying `nav` into the rail with no cap. Measured on a record at his scale
 * (27 projects, 26 of them building or earning, 401 tasks, 91 credentials): 36 rail entries, 27 of
 * them under Projects. Open tracks in the same function are capped at five under a comment saying
 * why, and the same argument was never applied to the pages a template produces.
 *
 * AT HIS SCALE ON A RECORD OF ITS OWN, AND IT WAS THE SAMPLE'S `ROWS` PUT BACK AFTERWARDS. Since the app has had one engine the fixture's
 * `pages` and `boot` ask a record seeded once and never written to (`fixtures/readers.ts`), so the rows swapped in
 * reached nothing and the sample kept its three projects. The projects are written to a seeded record here, and the rail
 * is the one a live tab draws of it: the record's own list of pages, each saying which row it is about, through the
 * shell's `layoutOf` (`boot-live.ts`), which spends the record's `railRoom`.
 */
type Scaled = { k: Kernel; listed: { slug: string; about: { register: string } | null }[]; shell: ReturnType<typeof layoutOf> };
async function atScale(n: number, also: { id: string; kind: string; body: Record<string, unknown> }[] = []): Promise<Scaled> {
  const k = await seededRecord();
  if (also.length) {
    const installed = await k.install(also as never);
    assert.ok(installed.ok, JSON.stringify(installed));
  }
  /* THE SEED'S PROJECTS IN PLAY COUNT TOWARDS `n`; the rest are written building or earning, named by their number. */
  const seeded = new Set((k.pages() as { about: { register: string; seq: number } | null }[]).flatMap((p) => (p.about?.register === 'things' ? [p.about.seq] : []))).size;
  for (let i = seeded + 1; i <= n; i++) {
    const made = k.create('things', { name: `Project ${i}`, lane: i % 2 ? 'building' : 'earning' }, { actor: 'p_owner' });
    assert.ok(made.ok, JSON.stringify(made));
  }
  const listed = k.pages() as Scaled['listed'];
  const held = k.list({ register: 'things', limit: 1 });
  assert.ok(held.ok);
  const shell = layoutOf({
    registers: [{ id: 'things', name: 'Projects', count: held.value.matched }],
    now: new Date(NOW).toISOString(),
    record: { slug: 'the-studio', name: 'The Studio', locale: 'en', currency: 'GBP' },
    me: { kind: 'person', person: 'p_owner', name: 'You', level: 'owner' },
    pages: listed,
  } as never);
  return { k, listed, shell };
}

/** The rail entries one template produced: the pages about a row of `register`, under `section` when one is named. */
const railRowsOf = (s: Scaled, register: string) => {
  const about = new Set(s.listed.filter((p) => p.about?.register === register).map((p) => `/p/${p.slug}`));
  return s.shell.nav.filter((n) => about.has(n.href));
};

/** The rail entries one template produced on the fixture's record: the pages about a row of `register`. */
const railRows = (register: string) => {
  const about = new Set(Object.entries(pages()).filter(([, p]) => p.identity?.register === register).map(([slug]) => `/p/${slug}`));
  return boot().nav.filter((n) => about.has(n.href));
};

test('A RAIL IS NOT A LIST: twenty-six projects do not put twenty-six links in it', async () => {
  const s = await atScale(26);
  const projects = s.listed.filter((p) => p.about?.register === 'things');
  assert.equal(projects.length, 26, 'the template did not expand');
  const rail = railRowsOf(s, 'things');
  assert.ok(rail.length <= 5, `${rail.length} project links in the rail, and the open tracks beside them are capped at 5`);
});

test('and the projects past the cap are pages, still reachable, not pages that stopped existing', async () => {
  const s = await atScale(26);
  assert.ok(s.listed.some((p) => p.slug === 'project-26'), 'the twenty-sixth project has no page');
  assert.ok(s.shell.pages.includes('project-26'), 'the shell does not offer /p/project-26');
  const opened = s.k.page('project-26');
  assert.ok(opened.ok, '/p/project-26 does not resolve');
  /* THE LIST IS WHERE THEY LIVE, and it says how many: the rail draws Projects with its own count
     out of `index.registers`, and `/p/portfolio` is the page that lists them. */
  const held = s.k.list({ register: 'things', limit: 1 });
  assert.ok(held.ok);
  assert.equal(s.shell.index.registers.find((r) => r.id === 'things')?.count, held.value.matched);
  assert.ok(s.shell.nav.some((n) => n.href === '/p/portfolio'), 'the Projects overview left the rail');
});

test('the cap takes nothing off the rail at the size the record is today', () => {
  const now = boot().nav.map((n) => n.href);
  for (const p of Object.values(pages())) if (p.nav && p.placed !== false) assert.ok(now.includes(`/p/${p.page}`), `/p/${p.page} fell out of the rail`);
  /* EVERY PROJECT, A PARKED ONE TOO, SINCE 24 October (things, not rows): each has its page, so each is on the rail. */
  assert.equal(railRows('things').length, (ROWS.things ?? []).length);
});

test('a page somebody wrote is never capped away by the rows of a register', async () => {
  const written = (s: Scaled): string[] => {
    const templated = new Set(s.listed.filter((p) => p.about).map((p) => `/p/${p.slug}`));
    return s.shell.nav.filter((n) => n.href.startsWith('/p/') && !templated.has(n.href)).map((n) => n.href).sort();
  };
  const before = written(await atScale(0));
  assert.ok(before.length > 0, 'the seed writes no page of its own, so this asks nothing');
  assert.deepEqual(written(await atScale(26)), before, 'growing a register moved the hand-written pages');
});

/**
 * A SECOND TEMPLATE OVER THE SAME LIST DREW NOTHING, WHICH IS NOT WHAT A CAP OF FIVE MEANS.
 *
 * One register can carry two templates under two headings, which is what a pack installing a second
 * view of a list somebody already keeps produces. Counted per register, the first template spent
 * the whole budget: measured with a `Clients` template over `things` beside the shipped `Projects`
 * one at 26 projects, Projects drew 6 and Clients drew 0, where before the cap it drew 26. A
 * heading a declaration asked for was not short, it was gone, and its rows were in the rail under
 * no name at all.
 *
 * Counted per heading instead, so rows still cannot grow either heading past five, which is the
 * thing the cap is for: what grows the rail here is somebody writing a second declaration, not the
 * record filling up.
 */
test('two templates over one list are two capped headings, not one heading and nothing', async () => {
  /* THE SECOND TEMPLATE IS INSTALLED ON THE RECORD, as a pack would install it: the project page, named and headed anew. */
  const probe = await seededRecord();
  const project = (probe.declarations() as { id: string; body: string | Record<string, unknown> }[]).find((d) => d.id === 'page.project');
  assert.ok(project, 'the seed no longer declares the project page');
  const body = (typeof project.body === 'string' ? JSON.parse(project.body) : project.body) as Record<string, unknown>;
  const s = await atScale(26, [{ id: 'page.client', kind: 'page', body: { ...body, page: 'client', title: 'Client {{name}}', nav: { section: 'Clients', order: 10 } } }]);
  const drawn = (section: string) => s.shell.nav.filter((n) => n.section === section).length;
  assert.equal(drawn('Clients'), 5, 'the second template over the same list got no rail entry at all');
  assert.equal(drawn('Projects'), 6, 'five projects and the overview somebody wrote');
});

test('A WHOLE NUMBER DECLARED BETWEEN 1000 AND 9999 IS PRINTED AS A YEAR, NOT WITH A THOUSANDS SEPARATOR', () => {
  const src = readFileSync(new URL('./api.ts', import.meta.url), 'utf8');
  assert.match(src, /f\.min >= 1000 && f\.max <= 9999 \? String\(Math\.trunc\(Number\(value\)\)\)/u);
});

test('a payee and the words a filing rule matches are said as words, the bank\'s own words stay (audit 2 B4)', () => {
  assert.equal(display('transactions', 'payee', 'PAPERHAUS SUPPLIES'), 'Paperhaus Supplies');
  assert.equal(display('transactions', 'payee', 'Bridge Street Coffee'), 'Bridge Street Coffee');
  assert.equal(display('filing_rules', 'match', 'FENWICK CLOUD'), 'Fenwick Cloud');
  assert.equal(display('transactions', 'counterparty_text', 'PAPERHAUS SUPPLIES'), 'PAPERHAUS SUPPLIES');
});
