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

import { applyFilters, backlinks, columnsFor, currencyFor, dirOf, display, identityFor, isProse, labelOf, metric, seqWidth, packDiff, page, readableFields, readBlock, search, toRows } from './api.ts';
import { amountOf } from './money.ts';
import { toSegments } from './blocks.ts';
import { declaredValue } from './where.ts';
import { seedBlock } from './seed.ts';
import { hrefFor } from './metrics.ts';
import { AUDIT, JOB, NEWS, NOW, PACKS, PAGES, REGISTERS, ROWS, VAULT } from './data.ts';
import type { Entry } from './schema.ts';
import type { Column } from 'braindog-render/svelte';

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
  assert.equal(display('obligations', 'due', '2026-07-27'), '27 Jul 2026');
});

test('an enum reads as words, not as an identifier', () => {
  assert.equal(display('obligations', 'direction', 'owed_to_me'), 'owed to me');
  assert.equal(display('tasks', 'state', 'done'), 'done');
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
  assert.equal(display('tasks', 'effort', 3 * 86_400), '3 d');
  assert.equal(display('tasks', 'effort', 17_280), '0.2 d');
  assert.equal(display('tasks', 'effort', 0), '0 d');
});

test('a ref reads as the title of the row it points at', () => {
  // "a person says Halden, not people#1" — the whole reason this branch exists.
  const titleField = REGISTERS.people?.title ?? '';
  const target = ROWS.people?.find((r) => r.seq === 1);
  assert.ok(target, 'the seed needs a people#1 for this to mean anything');
  assert.equal(display('obligations', 'party', 1), String(target.fields[titleField]));
});

test('a ref that points at nothing degrades to the spoken id, not to a bare number', () => {
  const out = display('obligations', 'party', 999_999);
  assert.equal(out, 'people#999999');
});

test('an undeclared field is stringified rather than dropped', () => {
  assert.equal(display('obligations', 'not_a_field', 'whatever'), 'whatever');
});

/* ── the credential ──────────────────────────────────────────────────────── */

test('the one secret field a register declares holds nothing in any row, so there is nothing for display to leak', () => {
  // The strongest form of this guarantee is structural, not behavioural: a key's row indexes what it
  // OPENS. The agents pack declares `credentials.value`, which names the grant the vault sealed a key
  // into and which only the vault door writes, so no row here holds one and the masking below is the
  // live test for the day one does.
  const declared = Object.entries(REGISTERS).flatMap(([id, reg]) =>
    reg.fields.filter((f) => f.type === 'secret').map((f) => `${id}.${f.id}`),
  );
  assert.deepEqual(declared, ['credentials.value'], 'a secret field reached the record');
  for (const key of ROWS.credentials ?? []) assert.ok(!('value' in key.fields), `credentials#${key.seq} holds a value`);
});

test('a vault row carries no value, only what the key opens', () => {
  const SECRETISH = /^(value|secret|token|key|password|credential)$/i;
  for (const row of VAULT) {
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

/**
 * Run `fn` with `n` extra open obligations owed by you, then put the register back.
 *
 * The seed has fewer rows than the cut, which is why this defect was invisible: it only appears on a
 * register that has outgrown one page, and every register does.
 */
function withExtra<T>(n: number, amount: number, fn: () => T): T {
  const before = [...(ROWS.obligations ?? [])];
  const next = before.length + 1;
  ROWS.obligations = [
    ...before,
    ...Array.from({ length: n }, (_, i) => ({
      seq: next + i,
      /* MONEY, not a bare integer: a filler row written as a number would make every total this
         test reads a MIXED one, and the bar would show the refusal rather than the figure. */
      fields: { what: `Filler ${i}`, party: 3, direction: 'owed_by_me', amount: gbp(amount), due: '2026-12-01', state: 'open', thing: null, note: '' },
      version: 1,
      created: '2026-01-01T00:00:00.000Z',
      by: 'test',
    })),
  ];
  try {
    return fn();
  } finally {
    ROWS.obligations = before;
  }
}

const barOf = (slug: string, heading: string) => page(slug)?.blocks.find((b) => b.heading === heading);

test('A BAR ADDS UP THE ANSWER, NOT THE FIRST PAGE OF IT', () => {
  // `limit:` is how much a reader can take in. Applied before the sum it is how much of the money
  // exists, and the figure is wrong by however many rows did not fit — with nothing on screen that
  // says so, because a total is one line either way.
  withExtra(80, 100_000, () => {
    const block = barOf('money', 'Owed by you, by counterparty');
    assert.ok(block, 'the bar is gone; this test is about the bar');
    assert.ok(block.matched.length > 50, `only ${block.matched.length} rows matched, so the cut was never reached`);
    const truth = block.matched.reduce((a, e) => a + (amountOf(e.fields.amount) ?? 0), 0);
    const drawn = toSegments(block)
      .flatMap((seg) => ('rows' in seg ? (seg.rows as { cells: string[] }[]) : []))
      .reduce((a, r) => a + Number((r.cells[1] ?? '').replace(/[^0-9.]/g, '')) * 100, 0);
    assert.ok(Math.abs(drawn - truth) < 200, `the bars add to ${drawn} where the rows add to ${truth}`);
  });
});

test('the rows it DRAWS are still cut, because that half was never the bug', () => {
  withExtra(80, 100_000, () => {
    const block = barOf('money', 'Owed by you, by counterparty');
    assert.ok(block);
    assert.ok(block.entries.length <= (block.limit ?? 50), 'the reading cap stopped applying');
    assert.ok(block.matched.length > block.entries.length, 'nothing was cut, so nothing is being tested');
    assert.equal(block.total, block.matched.length, 'the count under the block counts the drawn rows');
  });
});

test('a gauge sums past the cut too', () => {
  const block = page('estate')?.blocks.find((b) => b.kind === 'gauge');
  assert.ok(block, 'the estate page has no gauge');
  const of = block.columns[1]?.field ?? '';
  const truth = block.matched.reduce((a, e) => a + (amountOf(e.fields[of]) ?? 0), 0);
  const drawn = toSegments(block).flatMap((seg) => ('rows' in seg ? (seg.rows as { cells: string[] }[]) : []));
  assert.equal(drawn.length, 1, 'a gauge is one row');
  assert.ok(Math.abs(Number((drawn[0]?.cells[1] ?? '').replace(/[^0-9.]/g, '')) * 100 - truth) < 200);
});

test('a gauge keeps its currency when nothing matches', () => {
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
  const kept = ROWS.services;
  try {
    /* THE ROWS STAY AND THE FILTER MISSES, which is the state that was measured: a young record
       whose services exist and are not on a monthly cycle. A register with NO rows at all has no
       currency anywhere to find — a money field declares none, only its values carry one — so that
       case is a gap in the declaration rather than in this code, and it is filed as one. */
    ROWS.services = kept!.map((e) => ({ ...e, fields: { ...e.fields, cycle: 'yearly' } }));
    const block = page('estate')?.blocks.find((b) => b.kind === 'gauge');
    assert.ok(block, 'the estate page has no gauge');
    const drawn = toSegments(block).flatMap((seg) => ('rows' in seg ? (seg.rows as { cells: string[] }[]) : []));
    assert.equal(drawn.length, 1, 'a gauge is one row');
    const [, value, target] = drawn[0]!.cells;
    assert.match(String(value), /^[A-Z]{3}\s/, `the value lost its currency: ${value}`);
    assert.match(String(target), /^[A-Z]{3}\s/, `the target lost its currency: ${target}`);
    assert.doesNotMatch(String(target), /^\d/, 'the target printed as raw minor units');
  } finally {
    ROWS.services = kept!;
  }
});

test('chips count every matching row, and the counts add to the matched total', () => {
  withExtra(80, 100_000, () => {
    const block = page('money')?.blocks.find((b) => b.kind === 'chips');
    assert.ok(block);
    const counted = toSegments(block)
      .flatMap((seg) => ('rows' in seg ? (seg.rows as { cells: string[] }[]) : []))
      .reduce((a, r) => a + Number(r.cells[1] ?? 0), 0);
    assert.equal(counted, block.matched.length);
  });
});

test('when there are more groups than fit, the rest is CARRIED, not dropped', () => {
  // The other way to get a wrong total: cut the bars instead of the rows and the figure is short by
  // the tail. A named remainder keeps the sum whole and says out loud that there is more.
  const block = barOf('money', 'Owed by you, by counterparty');
  assert.ok(block);
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
  } as never);
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
  const drawn = page('money');
  const walk = drawn?.blocks.find((b) => b.opening !== undefined);
  assert.ok(walk, 'the money page draws no cash walk, so this test proves nothing');
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

/* ── the one screen that carries the trust model ─────────────────────────── */

test('A PACK DIFF COUNTS WHAT IT SAYS IT COUNTS', () => {
  /* `04 §3`: "A pack is readable text, so a truthful diff is possible — this is the entire trust
     model. You cannot diff a binary's intentions." The screen that carries it printed
     `${pack.registers.length} field(s) added` — a count of REGISTERS labelled as FIELDS — so all
     five installed packs said "1 field(s)" while Obligations declares eight. */
  const money = PACKS.find((p) => p.id === 'money-core')!;
  const d = packDiff(money);

  const list = d.adds.find((a) => a.kind === 'list')!;
  assert.equal(list.name, REGISTERS.obligations!.name, 'the diff named the id, not the list');
  assert.equal(list.detail, `${REGISTERS.obligations!.fields.length} fields`);
  assert.notEqual(list.detail, `${money.registers.length} fields`, 'the register count is back in the field slot');

  const page_ = d.adds.find((a) => a.kind === 'page')!;
  assert.equal(page_.name, PAGES.money!.title);
  /* THE COUNT IS THE DECLARATION'S, AND THE WORD IS NO LONGER `blocks`. It asserted the whole
     phrase, so it was holding two facts in one regex: that the number comes from the page rather
     than from anywhere else, which is what this test is about and has not moved, and that the
     noun beside it is `block`, which was never this test's subject. `block` is defined once, on a
     sheet a person reaches from a different screen, once per device, behind a cookie — and this
     is the screen where a stranger decides whether to let a file into their business and the one
     screen in the product that can define nothing. So the number is asserted, and the word this
     surface may not use is asserted absent. */
  assert.match(page_.detail ?? '', new RegExp(`^${PAGES.money!.blocks.length} `));
  assert.doesNotMatch(page_.detail ?? '', /\bblocks?\b/u, 'the trust screen is printing a word it has no room to define');
});

test('and it never names a page that does not exist', () => {
  /* `+ page.— placed in nav` — the em-dash fallback for a pack with no page, rendered as though `—`
     were a page about to be put in somebody's sidebar. Two of the eight packs declare none. */
  for (const pack of PACKS) {
    const d = packDiff(pack);
    assert.equal(d.adds.filter((a) => a.kind === 'page').length, pack.pages.length, `${pack.id}: page rows and declared pages disagree`);
    /* A COLLIDING NAME IS NOT AN ADD. It is the reason the install does not happen and it has its
       own section; under ADDS it would say the pack brings you a Services you already have — with
       the EXISTING list's field count, because that name resolves. */
    const clashes = pack.conflicts?.length ?? 0;
    assert.equal(
      d.adds.filter((a) => a.kind === 'list').length,
      pack.registers.length - clashes,
      `${pack.id}: list rows and declared registers disagree`,
    );
    for (const clash of pack.conflicts ?? [])
      assert.ok(
        !d.adds.some((a) => a.name === REGISTERS[clash]?.name),
        `${pack.id}: ${clash} is listed as an add and as a conflict`,
      );
    for (const add of d.adds) {
      assert.ok(add.name, `${pack.id}: an unnamed thing in the diff`);
      assert.ok(!add.name.includes('—'), `${pack.id}: the em-dash fallback reached the screen as a name`);
      /* EVERY LINE SAYS WHICH KIND IT IS, in words. The glyph beside it is decorative, so without
         this an unread pack is three bare nouns to anybody listening. */
      assert.ok(add.detail, `${pack.id}: "${add.name}" says nothing about what it is`);
    }
  }
});

test('an unread pack says the shape is unknown rather than inventing one', () => {
  const available = PACKS.find((p) => !p.installed)!;
  const d = packDiff(available);
  assert.equal(d.unread, true);
  /* A pack this record has not installed declares lists it does not have, so there is no field
     count — and the previous version printed one anyway. */
  for (const add of d.adds) assert.match(add.detail ?? '', /^a (list|page)$/);
});

test('the two guarantees are stated, and the two findings only when there are any', () => {
  for (const pack of PACKS) {
    const d = packDiff(pack);
    /* `04 §3.2`: seeds are a WRITE and get their own line — the trust screen was untrue for as long
       as it claimed "0 rows written" while three documents required seeding. */
    assert.match(d.seeds, /example/);
    /* And this one is a fact about the mechanism: a pack physically cannot read a row at install. */
    assert.match(d.touches, /0 rows read/);
    /* `06 §1`: a warning that does not apply teaches people to ignore warnings, so a pack with
       nothing to declare in these two sections declares nothing. */
    assert.equal(d.changes.length, pack.moves?.length ?? 0, `${pack.id}: the CHANGES section and the declaration disagree`);
    assert.equal(d.conflicts.length, pack.conflicts?.length ?? 0, `${pack.id}: the CONFLICTS section and the declaration disagree`);
  }
});

test('AND THE TWO SECTIONS THAT WERE BEHIND A CONDITION THAT COULD NOT BE TRUE', () => {
  /* `packDiff` returned `changes: []` and `conflicts: []` as literals and never wrote to either, so
     `copy.diffChanges`, `copy.diffConflicts` and `copy.diffNavKept` were shipped to the browser
     behind `{#if}`s that were permanently false — three sentences rendered nowhere, on a screen
     whose `04 §4` section is the most important refusal it makes. The `dead-copy` gate could not
     see it: it proves a MENTION, not a render.

     The record can hold both facts now, and two of the three packs you can install carry one. */
  const moves = PACKS.find((p) => p.moves?.length);
  assert.ok(moves, 'no pack declares a nav move, so the CHANGES section is unreachable again');
  const changed = packDiff(moves).changes;
  assert.equal(changed.length, 1);
  /* NAMED BY TITLE, because the reader is being asked about their own sidebar rather than about a
     declaration — and `04 §4` is that a pack may place a page it owns and may never move yours. */
  assert.match(changed[0]!, new RegExp(`^${PAGES[moves.moves![0]!.page]!.title} would move from`));

  const clash = PACKS.find((p) => p.conflicts?.length);
  assert.ok(clash, 'no pack declares a collision, so the CONFLICTS section is unreachable again');
  const found = packDiff(clash).conflicts;
  assert.equal(found.length, 1);
  /* AND IT NAMES WHO ALREADY OWNS IT. `02 §1`: a register another pack ships is a name this one
     cannot own, and "Services already exists" without the owner leaves the reader nowhere. */
  assert.match(found[0]!, /already exists, from /);
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
     `obligations` declares `party -> people` BEFORE `thing -> things`, and the walk lands on the
     project because `people` declares no identity, not because anything here prefers projects. */
  const decl = REGISTERS.obligations!;
  const refs = decl.fields.filter((f) => f.type === 'ref' && f.to).map((f) => f.to);
  assert.deepEqual(refs, ['people', 'things'], 'the ordering this case rests on has changed');
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
  assert.deepEqual(columnsFor('suppliers', declared as never).map((c) => c.field), ['seq', 'name', 'city']);
  assert.deepEqual(columnsFor('tasks', declared as never), columnsFor('tasks'), 'a built-in list took a declaration over its own');
});

test('the # column is 8ch for short ids and widens with the digits of the highest id in hand', () => {
  assert.equal(columnsFor('obligations').find((c) => c.field === 'seq')?.width, '8ch');
  assert.equal(seqWidth([]), '8ch');
  assert.equal(seqWidth([{ seq: 7 }, { seq: 42 }]), '8ch');
  assert.equal(seqWidth([{ seq: 999 }, { seq: 3 }]), '9ch');
  assert.equal(seqWidth([{ seq: 12345 }]), '11ch');
});
