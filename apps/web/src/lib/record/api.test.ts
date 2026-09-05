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

import { applyFilters, backlinks, columnsFor, currencyFor, dirOf, display, isProse, labelOf, metric, page, search, toRows } from './api.ts';
import { amountOf } from './money.ts';
import { toSegments } from './blocks.ts';
import { NOW, REGISTERS, ROWS, VAULT } from './data.ts';
import type { Entry } from './schema.ts';

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
  assert.equal(display('sessions', 'wrote', 12_400), '12,400');
});

test('THE DEFAULT COLUMNS INCLUDE EVERY `index:` FIELD, and the word is the one the record uses', () => {
  /* This read `f.indexed` while the declaration said `index:`, which is one letter and no error:
     `undefined` is falsy, so the grid quietly fell back to the title and the three mobile fields and
     the filter bar offered nothing. Nothing failed — there was just less of the register on screen
     than the register declares. */
  for (const [id, decl] of Object.entries(REGISTERS)) {
    const shown = new Set(columnsFor(id).map((c) => c.field));
    for (const f of decl.fields)
      if (f.index) assert.ok(shown.has(f.id), `${id}.${f.id} is declared index: and is not a column`);
  }
  // And there is at least one, or the assertion above is vacuous.
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

test('no register declares a secret, so there is nothing for display to leak', () => {
  // The strongest form of this guarantee is structural, not behavioural: the vault indexes what a
  // key OPENS and the value is never a field on a row, so no rendering path can reach one. If a
  // register ever grows a `secret` field, this fails and the masking below becomes the live test.
  const declared = Object.entries(REGISTERS).flatMap(([id, reg]) =>
    reg.fields.filter((f) => f.type === 'secret').map((f) => `${id}.${f.id}`),
  );
  assert.deepEqual(declared, [], 'a secret reached the record');
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
  assert.equal(isProse('sessions', 'wrote'), false, 'int');
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
    const hits = search(q, 8);
    const sources = new Set(hits.map((h) => h.kind));
    assert.ok(hits.length > 0, `${q} found nothing`);
    assert.ok(sources.size >= 4, `${q}: 8 hits came from ${sources.size} source(s): ${[...sources].join(', ')}`);
  }
});

test('a source with more matches than the cap costs the others one slot, not all of them', () => {
  const all = search('a', 9999);
  const byKind = new Map<string, number>();
  for (const h of all) byKind.set(h.kind, (byKind.get(h.kind) ?? 0) + 1);
  const biggest = [...byKind].sort((x, y) => y[1] - x[1])[0];
  assert.ok(biggest && biggest[1] > 8, 'no source has enough matches to swamp the list');
  const hits = search('a', 8);
  assert.ok(hits.filter((h) => h.kind === biggest[0]).length <= 2, `${biggest[0]} still took the list`);
});

test('the cap is honoured, and nothing is returned twice', () => {
  const hits = search('e', 8);
  assert.equal(hits.length, 8);
  assert.equal(new Set(hits.map((h) => h.href)).size, hits.length);
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
