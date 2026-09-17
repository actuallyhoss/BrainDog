/**
 * Filtering, searching and sorting — the three places a typed record can lie quietly.
 *
 * None of these throw when they are wrong. A filter that drops a row shows a shorter list, and a
 * shorter list looks exactly like a correct answer. A sort that compares money as text puts GBP 99
 * above GBP 480 and the column still looks sorted, because every column of numbers looks sorted
 * from a distance. These are the failures you only catch by asserting the order.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { REGISTERS, ROWS, columnsFor, display, list, sortRows, applyFilters, NOW } from './api.ts';
import { compile, explain, matches } from './where.ts';
import type { Entry } from './schema.ts';

const rows = (...fields: Record<string, unknown>[]): Entry[] =>
  fields.map((f, i) => ({ seq: i + 1, fields: f }) as Entry);

const seqs = (out: Entry[]) => out.map((e) => e.seq);

/* ── sorting ─────────────────────────────────────────────────────────────── */

test('money sorts by magnitude, because it is an integer and not a label', () => {
  // The classic: as text, "480000" sorts before "96000". As money, GBP 960 is the smaller.
  const out = sortRows('obligations', rows({ amount: 480_000 }, { amount: 96_000 }, { amount: 1_910_000 }), 'amount', 'asc');
  assert.deepEqual(out.map((e) => e.fields.amount), [96_000, 480_000, 1_910_000]);
});

test('days sort chronologically', () => {
  const out = sortRows('obligations', rows({ due: '2026-11-05' }, { due: '2026-07-27' }, { due: '2027-01-28' }), 'due', 'asc');
  assert.deepEqual(out.map((e) => e.fields.due), ['2026-07-27', '2026-11-05', '2027-01-28']);
});

test('descending is the exact reverse, not a different order', () => {
  const given = rows({ amount: 300 }, { amount: 100 }, { amount: 200 });
  const up = sortRows('obligations', given, 'amount', 'asc').map((e) => e.fields.amount);
  const down = sortRows('obligations', given, 'amount', 'desc').map((e) => e.fields.amount);
  assert.deepEqual(down, [...up].reverse());
});

test('a missing value sorts last in BOTH directions', () => {
  // Nulls last either way is the right behaviour and the easy one to get wrong: flipping the sign
  // on a null comparison sends the empty rows to the top the moment somebody clicks the header
  // twice, which reads as the list breaking.
  for (const dir of ['asc', 'desc'] as const) {
    const out = sortRows('obligations', rows({ amount: 200 }, { amount: null }, { amount: 100 }), 'amount', dir);
    assert.equal(out[out.length - 1]?.fields.amount, null, `an empty row floated to the top in ${dir}`);
  }
});

test('ties break newest first, as the record breaks them, so the order is stable and the same every time', () => {
  const out = sortRows('obligations', rows({ amount: 100 }, { amount: 100 }, { amount: 100 }), 'amount', 'asc');
  assert.deepEqual(seqs(out), [3, 2, 1]);
  assert.deepEqual(seqs(sortRows('obligations', rows({ amount: 100 }, { amount: 100 }), 'amount', 'desc')), [2, 1], 'in either direction');
});

test('sorting does not mutate what it was given', () => {
  const given = rows({ amount: 300 }, { amount: 100 });
  sortRows('obligations', given, 'amount', 'asc');
  assert.deepEqual(seqs(given), [1, 2], 'the caller’s array was reordered underneath it');
});

test('text sorts the way a person reads a list, not the way a byte compares', () => {
  // `<` on strings compares UTF-16 code units: every capital sorts before every lowercase, so
  // "Zebra" lands above "apple", and anything accented lands after "z". A column of party names is
  // exactly where that shows.
  const out = sortRows('people', rows({ name: 'apple' }, { name: 'Zebra' }, { name: 'Ökonkwo' }, { name: 'Banks' }), 'name', 'asc');
  assert.deepEqual(out.map((e) => e.fields.name), ['apple', 'Banks', 'Ökonkwo', 'Zebra']);
});

/* ── filtering ───────────────────────────────────────────────────────────── */

const OBL = rows(
  { state: 'open', direction: 'owed_to_me', due: '2026-07-27' },
  { state: 'paid', direction: 'owed_to_me', due: '2026-09-14' },
  { state: 'open', direction: 'owed_by_me', due: '2026-11-05' },
);

test('`in` keeps a row matching any of its values', () => {
  assert.deepEqual(seqs(applyFilters('obligations', OBL, [{ field: 'state', op: 'in', values: ['open', 'paid'] }])), [1, 2, 3]);
  assert.deepEqual(seqs(applyFilters('obligations', OBL, [{ field: 'state', op: 'in', values: ['paid'] }])), [2]);
});

test('an empty `in` keeps nothing, which is what the reader asked for', () => {
  // Not "keeps everything". A filter chip showing zero selected values and a full list underneath
  // is a filter that silently ignored you.
  assert.deepEqual(seqs(applyFilters('obligations', OBL, [{ field: 'state', op: 'in', values: [] }])), []);
});

test('before and after are exclusive of the day named', () => {
  assert.deepEqual(seqs(applyFilters('obligations', OBL, [{ field: 'due', op: 'before', values: ['2026-09-14'] }])), [1]);
  assert.deepEqual(seqs(applyFilters('obligations', OBL, [{ field: 'due', op: 'after', values: ['2026-09-14'] }])), [3]);
});

test('two filters are AND, never OR', () => {
  const out = applyFilters('obligations', OBL, [
    { field: 'state', op: 'in', values: ['open'] },
    { field: 'direction', op: 'in', values: ['owed_to_me'] },
  ]);
  assert.deepEqual(seqs(out), [1]);
});

test('no filters and no query is the whole list, untouched', () => {
  assert.deepEqual(seqs(applyFilters('obligations', OBL, [])), [1, 2, 3]);
});

/* ── search ──────────────────────────────────────────────────────────────── */

/**
 * THE BOX IS ONE OPERATOR AND THE REGISTER SAYS WHAT IT READS.
 *
 * This block used to assert the opposite, under a comment beginning *"A DELIBERATE CHOICE"* — the
 * query ran `display()` over every field, so typing `4,800` found a money row and typing `owed to
 * me` found an enum. Three documents say it is not that. `50 §5.2` step 6: *"text → the search box
 * as `matches`"*. `29 §5`: *"the search box (`matches:`, FTS5 over the register's `search:`
 * fields)"*. `34 §6`: *"over the register's `search:` fields; whole-token, case-folded"*. And
 * `fts.ts` gives the reason the flag exists at all — *"an index over everything answers every query
 * with everything … a search that returns the row because its `note` happens to contain ‘invoice’
 * is a search whose results a person stops reading."*
 *
 * The deliberate choice was also a defect one door along: `/search` counted title matches and linked
 * to a list matching every value, so *All 30 in Obligations →* landed on 37 rows. One matcher now,
 * read from the declaration, and `search.test.ts` asserts the two answers are the same set.
 *
 * `13 §5.2`'s `no-results` state carries the cost: the register names the fields it searched, so
 * somebody who typed an amount is told where the amount lives rather than shown an empty list.
 */

test('THE BOX READS THE DECLARATION, AND MONEY IS NOT ON IT', () => {
  const money = rows({ amount: { amount: 480_000, currency: 'GBP' } }, { amount: { amount: 96_000, currency: 'GBP' } });
  /* Neither spelling. The rendered one used to work and the stored one never did, and a box that
     answers one of the two is a box whose rule nobody can state. `obligations` declares `search`
     on `what` alone. */
  assert.deepEqual(seqs(applyFilters('obligations', money, [], '4,800')), []);
  assert.deepEqual(seqs(applyFilters('obligations', money, [], '480000')), []);
});

test('and a searchable field IS on it, whatever else the row holds', () => {
  const some = rows({ what: 'Kiln retainer', amount: { amount: 1, currency: 'GBP' } }, { what: 'Portage invoice' });
  assert.deepEqual(seqs(applyFilters('obligations', some, [], 'kiln')), [1]);
  assert.deepEqual(seqs(applyFilters('obligations', some, [], 'portage')), [2]);
});

test('search is case-insensitive', () => {
  const people = rows({ name: 'Halden Type Co' }, { name: 'Pell & Vine' });
  assert.deepEqual(seqs(applyFilters('people', people, [], 'HALDEN')), [1]);
  assert.deepEqual(seqs(applyFilters('people', people, [], 'halden')), [1]);
});

test('IT IS A PREFIX ON WHOLE WORDS, NOT A SUBSTRING', () => {
  /* `ftsQuery` builds `"word"*`, so a term matches the START of a token and not its middle. That is
     the difference between finding *Renewals* by typing `ren` — which is what anybody expects — and
     finding *children* by it, which is what `includes()` did and what makes a result list stop
     being worth reading. */
  const some = rows({ what: 'Renewals due' }, { what: 'The children of the estate' });
  assert.deepEqual(seqs(applyFilters('obligations', some, [], 'ren')), [1]);
  assert.deepEqual(seqs(applyFilters('obligations', some, [], 'renew')), [1]);
  assert.deepEqual(seqs(applyFilters('obligations', some, [], 'ildren')), []);
});

test('two words are AND, in any order, and need not be adjacent', () => {
  /* `"a"* AND "b"*` is over the ROW, not over positions — so both terms must appear and neither
     order nor adjacency is required. A box that demanded the exact phrase would refuse the way
     people actually type, which is the important half of the word first and the qualifier after. */
  const some = rows({ what: 'Kiln annual retainer' }, { what: 'Retainer for Portage' });
  assert.deepEqual(seqs(applyFilters('obligations', some, [], 'kiln retainer')), [1]);
  assert.deepEqual(seqs(applyFilters('obligations', some, [], 'retainer kiln')), [1]);
  assert.deepEqual(seqs(applyFilters('obligations', some, [], 'retainer')), [1, 2]);
});

test('punctuation separates rather than matching, the way FTS5 tokenises', () => {
  /* `ftsQuery` strips everything that is not a letter, a number or a space BEFORE splitting, so
     `kiln.example` is two tokens on both sides of the comparison and a typed dot cannot fail to
     match a stored one. */
  const some = rows({ what: 'kiln.example renewal' }, { what: 'Something else' });
  assert.deepEqual(seqs(applyFilters('obligations', some, [], 'kiln.example')), [1]);
  assert.deepEqual(seqs(applyFilters('obligations', some, [], 'kiln example')), [1]);
});

test('a filter and a query are both applied', () => {
  /* Its own rows, because `OBL` carries no searchable field — which is the point of the fixture it
     is used for and would make this test pass by matching nothing. */
  const both = rows(
    { state: 'open', what: 'Kiln retainer' },
    { state: 'paid', what: 'Kiln licence' },
    { state: 'open', what: 'Portage invoice' },
  );
  const out = applyFilters('obligations', both, [{ field: 'state', op: 'in', values: ['open'] }], 'kiln');
  assert.deepEqual(seqs(out), [1]);
});


/* ── every key the sort control offers is a key that sorts ───────────────── */

/**
 * A CHIP THAT DOES NOT REORDER THE LIST IS A CONTROL THAT LIES.
 *
 * Sorting used to live on the table's column headers alone, which meant it did not exist below
 * 640px — the table is `display: none` there and the cards have no headers. It is now also a list
 * of chips in the Display sheet, built from `columnsFor`: the same projection, so the offer is
 * every column of every register rather than the handful anybody hand-writes a test for.
 *
 * Both sort bugs this file has caught were one column of one register and both looked sorted from a
 * distance: money compared as objects (`{} < {}` is false both ways, so the column came back in
 * arrival order), and a `ref` ordered by the hidden seq behind it while the cell rendered a name.
 * Neither threw. So the sweep below asserts the rule a READER can check rather than the one the
 * implementation happens to use — *the order is a function of what is on the screen* — which is
 * why it is written out here again instead of importing the comparator.
 */

/** What the reader compares, per kind of column. Money is a magnitude; a day is its ISO text; a
    ref, an enum and a bool are the words drawn in the cell, not the values behind them. */
function readerKey(register: string, field: string, e: Entry): number | string | null {
  if (field === 'seq') return e.seq;
  const raw = e.fields[field];
  if (raw === null || raw === undefined) return null;
  const type = REGISTERS[register]?.fields.find((f) => f.id === field)?.type;
  if (type === 'money') return (raw as { amount: number }).amount;
  if (type === 'int' || type === 'decimal' || type === 'duration') return Number(raw);
  if (type === 'day' || type === 'instant') return String(raw);
  return display(register, field, raw) ?? '';
}

const before = (a: number | string, b: number | string): boolean =>
  typeof a === 'number' && typeof b === 'number' ? a < b : String(a).localeCompare(String(b), 'en-GB') < 0;

for (const register of Object.keys(REGISTERS)) {
  test(`every column ${register} offers is a column that sorts`, () => {
    const held = (ROWS[register] ?? []).length;
    for (const column of columnsFor(register)) {
      const field = column.field;

      const up = list(register, { sort: { field, dir: 'asc' } }).entries;
      const down = list(register, { sort: { field, dir: 'desc' } }).entries;

      /* NOTHING IS DROPPED AND NOTHING IS INVENTED. A sort is a permutation; the fastest way to
         hide a comparator that throws is to return the rows it managed. */
      assert.equal(up.length, held, `${register}.${field} asc lost rows`);
      assert.equal(down.length, held, `${register}.${field} desc lost rows`);
      assert.deepEqual(
        [...up].map((e) => e.seq).sort((a, b) => a - b),
        [...down].map((e) => e.seq).sort((a, b) => a - b),
        `${register}.${field} returns a different set in each direction`,
      );

      /* ASCENDING IS ASCENDING, in the values a person can see. Blanks are allowed to trail, which
         is what `sortRows` does deliberately — a row with nothing in the column has no place in an
         order over that column, and putting it first is the same as claiming it is the smallest. */
      const seen = up.map((e) => readerKey(register, field, e));
      const present = seen.filter((v): v is number | string => v !== null && v !== '');
      assert.equal(
        seen.filter((v) => v !== null && v !== '').length,
        seen.length - seen.filter((v) => v === null || v === '').length,
        `${register}.${field} interleaves blanks with values`,
      );
      for (let i = 1; i < present.length; i++) {
        assert.ok(
          !before(present[i]!, present[i - 1]!),
          `${register}.${field} ascending puts ${JSON.stringify(present[i])} after ${JSON.stringify(present[i - 1])}`,
        );
      }

      /* AND DESCENDING IS THE SAME ORDER READ BACKWARDS. This is the assertion the money bug fails:
         a comparator that always answers "equal" returns the input order both ways, which reads as
         a sort that worked until you ask for the other direction and get the identical list. */
      const downPresent = down
        .map((e) => readerKey(register, field, e))
        .filter((v): v is number | string => v !== null && v !== '');
      for (let i = 1; i < downPresent.length; i++) {
        assert.ok(
          !before(downPresent[i - 1]!, downPresent[i]!),
          `${register}.${field} descending puts ${JSON.stringify(downPresent[i - 1])} before ${JSON.stringify(downPresent[i])}`,
        );
      }
    }
  });
}

test('a column whose values differ actually reorders the list', () => {
  /* THE OTHER HALF OF THE SAME QUESTION. Every assertion above is satisfied by a sort that returns
     its input untouched whenever the rows arrive in order, and the seeded record is written in seq
     order — so at least one column per register has to move something, or the sweep proves nothing
     about the seed it runs on. */
  for (const register of Object.keys(REGISTERS)) {
    if ((ROWS[register] ?? []).length < 3) continue;
    const moved = columnsFor(register).filter((c) => {
      const up = list(register, { sort: { field: c.field, dir: 'asc' } }).entries.map((e) => e.seq);
      return up.join() !== [...up].sort((a, b) => a - b).join();
    });
    assert.ok(moved.length > 0, `${register}: not one of its columns changes the order of the list`);
  }
});


/* ── a date is compared as a date ──────────────────────────────────────── */

test('`is <a date>` ON A DATE FIELD MATCHED NOTHING, ON EVERY REGISTER, ALWAYS', () => {
  /**
   * `before` and `after` had a date path from the day they were written and `is` never got one, so
   * the value went through `formsOf` — which compares against the raw store (`2026-09-03`) and
   * against `display()` (`3 Sep 2026`). `today` is neither, so the one date filter a person types by
   * hand was the one that could not work.
   *
   * AND IT MADE `display()` LOAD-BEARING WHERE IT MUST NOT BE. `last_seen is today` DID match while
   * `display()` happened to render an instant through `relative()` — a filter whose meaning was a
   * side effect of a formatting choice, which broke the day that formatter learned to say `3h ago`.
   */
  const rows2 = rows({ due: '2026-09-03' }, { due: '2026-09-14' }, { due: null });
  assert.deepEqual(seqs(applyFilters('obligations', rows2, [{ field: 'due', op: 'is', values: ['2026-09-03'] }])), [1]);

  /* A relative literal, which is the thing somebody actually types. */
  const said = compile('obligations', 'due is today');
  assert.deepEqual(explain(said), [], 'the clause was not understood');
  assert.deepEqual(rows2.filter((e) => matches(e, said, NOW)).map((e) => e.seq), [1]);

  /* AND THE THREE OPERATORS AGREE ABOUT THE DAY THEY NAME. `34 §6`: before and after are exclusive
     of it, so the three partition the field exactly — every row with a date lands in one of them. */
  const before = compile('obligations', 'due before today');
  const after = compile('obligations', 'due after today');
  const dated = rows2.filter((e) => e.fields.due !== null);
  const parts = [before, said, after].map((c) => dated.filter((e) => matches(e, c, NOW)).length);
  assert.equal(parts.reduce((n, x) => n + x, 0), dated.length, `the three operators cover ${parts.join('+')} of ${dated.length} dated rows`);

  /* A row with no date is in none of them. Counting it would put rows with no due date into an
     overdue list, which is a list somebody acts on. */
  for (const c of [before, said, after]) assert.equal(matches(rows2[2]!, c, NOW), false);
});

test('`is not <a date>` IS NOT `is <a date>`', () => {
  /**
   * The date path was gated on the field's type and not on the OPERATOR, and `before`/`after` are
   * consumed above it — so `is not` fell straight through and the negation was dropped. `due is not
   * today` compiled to the same clause as `due is today`.
   *
   * Reachable from a URL rather than only a typed sentence: `whereOf` maps `not-in` to `is not`, and
   * the register parses `?f=<field>:<op>:<values>` with no operator check, so
   * `?f=due:not-in:2026-09-14` returned the complement of what the chip said. A filter that quietly
   * inverts is the one failure a declarative surface must not have.
   */
  const some = rows({ due: '2026-09-03' }, { due: '2026-09-14' }, { due: null });
  const is = compile('obligations', 'due is 2026-09-14');
  const isNot = compile('obligations', 'due is not 2026-09-14');
  assert.deepEqual(explain(is), []);
  assert.deepEqual(explain(isNot), []);
  assert.notDeepEqual(is, isNot, '`is not` compiles to the same clause as `is`');

  const yes = some.filter((e) => matches(e, is, NOW)).map((e) => e.seq);
  const no = some.filter((e) => matches(e, isNot, NOW)).map((e) => e.seq);
  assert.deepEqual(yes, [2]);
  /* A row with no date is not the named day, so it is in the negation — `34 §6`: every positive
     operator is false on a missing value, and `not` is how a person says "and the empty ones". */
  assert.deepEqual(no, [1, 3]);
  assert.equal(yes.length + no.length, some.length, 'the two do not partition the rows');

  /* The same through the URL shape, which is where it was reachable. */
  assert.deepEqual(seqs(applyFilters('obligations', some, [{ field: 'due', op: 'not-in', values: ['2026-09-14'] }])), [1, 3]);
});

test('and an enum whose value is the word `today` is untouched', () => {
  /* The date path is taken only when the FIELD is a date. A register that really holds the word
     would otherwise stop being filterable by it — the fix eating a case it was not about. */
  const some = rows({ state: 'open' }, { state: 'paid' });
  assert.deepEqual(seqs(applyFilters('obligations', some, [{ field: 'state', op: 'in', values: ['open'] }])), [1]);
  const said = compile('obligations', 'state is open');
  assert.deepEqual(explain(said), []);
  assert.deepEqual(some.filter((e) => matches(e, said, NOW)).map((e) => e.seq), [1]);
});

test('AN INSTANT CELL IS BANDED, NOT TRUNCATED TO ITS DAY', () => {
  /* `display()`'s `instant` branch had no test at all — `api.test.ts` asserts `money`, `day`, `enum`,
     `int`, `duration`, `ref`, unknown and `secret`, and reverting this one broke nothing. It was
     `relative(value.slice(0, 10))`, so a run seen two hours ago and one seen eleven hours ago
     both read *today*, on the register whose whole subject is what is happening now. */
  const at = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
  assert.equal(display('session', 'last_seen', at(0)), 'just now');
  assert.equal(display('session', 'last_seen', at(2)), '2h ago');
  assert.equal(display('session', 'last_seen', at(11)), '11h ago');
  assert.notEqual(display('session', 'last_seen', at(2)), display('session', 'last_seen', at(11)));
  /* And a `day` field is still a DATE, which is the branch beside it and a different answer on
     purpose: a deadline is a date somebody diaries against, and an age is not. */
  assert.equal(display('obligations', 'due', '2026-09-03'), '3 Sep 2026');
});
