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

import { CURRENCY, applyFilters, dirOf, display, isProse, labelOf, metric, page } from './api.ts';
import { toSegments } from './blocks.ts';
import { NOW, REGISTERS, ROWS, VAULT } from './data.ts';

/* ── money ───────────────────────────────────────────────────────────────── */

test('money is divided out of minor units, with its code', () => {
  assert.equal(display('obligations', 'amount', 480_000), 'GBP 4,800.00');
  assert.equal(display('obligations', 'amount', 1), 'GBP 0.01');
  assert.equal(display('obligations', 'amount', 100), 'GBP 1.00');
});

test('a money field never renders the raw integer', () => {
  for (const minor of [1, 99, 100, 480_000, 1_910_000]) {
    const out = display('obligations', 'amount', minor);
    assert.ok(out, 'a value was given, so a string is owed');
    assert.notEqual(out, String(minor), `${minor} reached the screen as minor units`);
    assert.ok(out.startsWith(`${CURRENCY} `), `${out} lost its currency code`);
  }
});

test('zero is a number, not nothing', () => {
  // `0` is falsy and the guard at the top of `display` tests for null/undefined/'' precisely so
  // that a real zero — a service that costs nothing — still prints.
  assert.equal(display('obligations', 'amount', 0), 'GBP 0.00');
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

test('a duration carries its declared unit', () => {
  assert.equal(display('tasks', 'effort', 3), '3 d');
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
  const kiln = metric('kiln-cost');
  assert.match(kiln.label, /year/i);
  const monthlyKiln = (ROWS.services ?? []).filter((s) => s.fields.thing === 1 && s.fields.cycle === 'monthly');
  assert.ok(monthlyKiln.length > 0, 'the seed needs a monthly Kiln service for this to bite');
  const naive = (ROWS.services ?? [])
    .filter((s) => s.fields.thing === 1 && s.fields.state !== 'cancelled')
    .reduce((a, s) => a + Number(s.fields.cost ?? 0), 0);
  assert.notEqual(kiln.value, `${CURRENCY} ${(naive / 100).toFixed(2)}`, 'the cycle factor is missing again');
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
  const owe = late('owed_by_me').reduce((a, e) => a + Number(e.fields.amount ?? 0), 0);
  const owed = late('owed_to_me').reduce((a, e) => a + Number(e.fields.amount ?? 0), 0);
  assert.ok(owe > 0 && owed > 0, 'the seed needs late rows in both directions for this to mean anything');

  const tile = metric('overdue');
  assert.equal(tile.value, display('obligations', 'amount', owe));
  assert.notEqual(tile.value, display('obligations', 'amount', owe + owed));
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
      fields: { what: `Filler ${i}`, party: 3, direction: 'owed_by_me', amount, due: '2026-12-01', state: 'open', thing: null, note: '' },
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
    const truth = block.matched.reduce((a, e) => a + Number(e.fields.amount ?? 0), 0);
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
  const truth = block.matched.reduce((a, e) => a + Number(e.fields[of] ?? 0), 0);
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
function opened(href: string): { register: string; rows: number } {
  const url = new URL(href, 'http://x');
  const register = url.pathname.split('/')[2] ?? '';
  const filters = url.searchParams.getAll('f').map((raw) => {
    const [field = '', op = 'is', values = ''] = raw.split(':');
    return { field, op, values: values.split(',') };
  });
  return { register, rows: applyFilters(register, ROWS[register] ?? [], filters).length };
}

test('every metric href opens rows, rather than an empty grid or the whole register', () => {
  // The failure was silent and total: `applyFilters` string-compared dates, so `due:before:today`
  // was true of every row and `due:before:+30d` of none. Overdue said two and opened eighteen;
  // "Due in 30 days" and "Renews in 30 days" opened nothing at all. A figure you cannot click
  // through to is a figure you cannot check.
  const ids = ['kiln-open', 'kiln-owed', 'kiln-cost', 'owed-to-you', 'due-30d', 'overdue', 'renews-30d', 'lapsing'];
  for (const id of ids) {
    const m = metric(id);
    if (!m.href) continue;
    const { register, rows } = opened(m.href);
    const all = (ROWS[register] ?? []).length;
    assert.ok(rows > 0, `${m.label} links to an empty grid`);
    assert.ok(rows < all, `${m.label} links to the whole register, which is not a filter`);
  }
});

test('a href that counts rows opens exactly that many', () => {
  // The three whose note is a count can be checked exactly. The rest report money, and the count is
  // asserted above only for being neither zero nor everything.
  for (const [id, n] of [['overdue', 2], ['lapsing', 1]] as const) {
    const m = metric(id);
    assert.ok(m.href);
    assert.equal(opened(m.href).rows, n, `${m.label} says ${n} and opens a different number`);
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
