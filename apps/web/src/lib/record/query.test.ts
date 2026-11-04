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
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { openRecord, type Kernel } from '@braindog/kernel';
import { installSeed } from '@braindog/seed';

import './fixtures/fill.ts';
import { REGISTERS, columnsFor, display, sortRows } from './api.ts';
import { list, applyFilters } from './fixtures/readers.ts';
import { ROWS, NOW } from './fixtures/sample.ts';
import { whereFor } from './remote.ts';
import { compile, explain } from './where.ts';
import type { Entry, Filter } from './schema.ts';

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

test('text sorts without regard to case, not the way a byte compares, and in the order the record uses', () => {
  // `<` on strings compares UTF-16 code units: every capital sorts before every lowercase, so
  // "Zebra" landed above "apple". Case is folded now, as the record folds it (`COLLATE NOCASE`), and
  // the order is the record's: a letter outside A to Z, as in "Ökonkwo", sorts after "z" in both
  // engines, because the record has no collation of the reader's to agree with.
  const out = sortRows('people', rows({ name: 'apple' }, { name: 'Zebra' }, { name: 'Ökonkwo' }, { name: 'Banks' }), 'name', 'asc');
  assert.deepEqual(out.map((e) => e.fields.name), ['apple', 'Banks', 'Zebra', 'Ökonkwo']);
});

/* ── filtering ───────────────────────────────────────────────────────────── */

/**
 * THE RECORD MATCHES, SO THE ROWS A FILTER IS ASKED ABOUT ARE WRITTEN TO A RECORD. These asked the fixture's
 * `applyFilters` about rows made up here, which it matched in the browser; now it asks the seeded record which of
 * ITS rows a filter admits and keeps a made-up row whose number the record happened to name (`fixtures/readers.ts`), so
 * the rows below were being matched against obligations they never were. They are written to a record of their own now,
 * under the seed's declaration of obligations with every field optional (so a row may leave a day empty) and the links
 * left out, and asked the way a live list asks: the chips and the box as `whereFor` sends them to the record's `list`.
 */
type Sql = Parameters<typeof openRecord>[0];
function openSqlite(): Sql {
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
  } as unknown as Sql;
}

/** The seed's declaration of obligations, as a record installs it, every field optional and no link in it. */
const DECLARED = (async () => {
  const k = await openRecord(openSqlite(), { now: () => NOW });
  assert.ok((await installSeed(k)).ok, 'the seed did not install');
  const d = (k.declarations() as { id: string; body: string | Record<string, unknown> }[]).find((x) => x.id === 'register.obligations');
  assert.ok(d, 'the seed no longer declares obligations');
  const body = (typeof d.body === 'string' ? JSON.parse(d.body) : d.body) as { fields: { type: string; required?: boolean }[] };
  return { ...body, fields: body.fields.filter((f) => f.type !== 'ref').map(({ required: _, ...f }) => f) };
})();

/** The numbers of the rows the record admits, of `given` written in order, for the chips and the box a list sends. */
async function admitted(given: Record<string, unknown>[], filters: Filter[], q = ''): Promise<number[]> {
  const out = await asked(given, filters, q);
  assert.ok(out.ok, JSON.stringify(out));
  return out.value.rows.map((r) => r.seq!).sort((a, b) => a - b);
}

/** The record's whole answer to that question, a refusal included. */
async function asked(given: Record<string, unknown>[], filters: Filter[], q = ''): Promise<ReturnType<Kernel['list']>> {
  const k = await openRecord(openSqlite(), { now: () => NOW });
  const installed = await k.install([{ id: 'register.obligations', kind: 'register', body: (await DECLARED) as never }]);
  assert.ok(installed.ok, JSON.stringify(installed));
  for (const fields of given) {
    const made = k.create('obligations', Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== null)), { actor: 'p_owner' });
    assert.ok(made.ok, JSON.stringify(made));
  }
  const where = whereFor('obligations', filters, q, new Map());
  return k.list({ register: 'obligations', limit: 500, ...(where === undefined ? {} : { where: where as never }) });
}

const OBL = [
  { state: 'open', direction: 'owed_to_me', due: '2026-07-27' },
  { state: 'paid', direction: 'owed_to_me', due: '2026-09-14' },
  { state: 'open', direction: 'owed_by_me', due: '2026-11-05' },
];

test('`in` keeps a row matching any of its values', async () => {
  assert.deepEqual(await admitted(OBL, [{ field: 'state', op: 'in', values: ['open', 'paid'] }]), [1, 2, 3]);
  assert.deepEqual(await admitted(OBL, [{ field: 'state', op: 'in', values: ['paid'] }]), [2]);
});

test('an empty `in` keeps nothing, which is what the reader asked for', async () => {
  // Not "keeps everything". A filter chip showing zero selected values and a full list underneath
  // is a filter that silently ignored you. The record goes further and refuses the question, so the
  // list draws its sentence rather than no rows: no row comes back either way.
  const out = await asked(OBL, [{ field: 'state', op: 'in', values: [] }]);
  assert.ok(!out.ok, `an empty chip was answered with ${out.ok ? out.value.rows.length : 0} rows`);
});

test('before and after are exclusive of the day named', async () => {
  assert.deepEqual(await admitted(OBL, [{ field: 'due', op: 'before', values: ['2026-09-14'] }]), [1]);
  assert.deepEqual(await admitted(OBL, [{ field: 'due', op: 'after', values: ['2026-09-14'] }]), [3]);
});

test('two filters are AND, never OR', async () => {
  const out = await admitted(OBL, [
    { field: 'state', op: 'in', values: ['open'] },
    { field: 'direction', op: 'in', values: ['owed_to_me'] },
  ]);
  assert.deepEqual(out, [1]);
});

test('no filters and no query is the whole list, untouched', async () => {
  assert.deepEqual(await admitted(OBL, []), [1, 2, 3]);
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

test('a filter and a query are both applied', async () => {
  /* Its own rows, because `OBL` carries no searchable field — which is the point of the fixture it
     is used for and would make this test pass by matching nothing. */
  const both = [
    { state: 'open', what: 'Kiln retainer' },
    { state: 'paid', what: 'Kiln licence' },
    { state: 'open', what: 'Portage invoice' },
  ];
  assert.deepEqual(await admitted(both, [{ field: 'state', op: 'in', values: ['open'] }], 'kiln'), [1]);
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
    ref and a bool are the words drawn in the cell, not the values behind them. */
function readerKey(register: string, field: string, e: Entry): number | string | null {
  if (field === 'seq') return e.seq;
  const raw = e.fields[field];
  if (raw === null || raw === undefined) return null;
  const decl = REGISTERS[register]?.fields.find((f) => f.id === field);
  const type = decl?.type;
  /* AN ENUM IS ITS POSITION IN `values`, the order its author declared. This helper returned the drawn word, so
     the sweep pinned A to Z and went red in twelve registers, each on an enum column, the moment both engines moved to declared order:
     `tasks.state` ascending "puts doing after open", which is exactly the order declared. The position is still a
     function of what is on the screen, since each word stands for one value; a word outside `values` goes after every
     declared one, as `compareRows` and the kernel's `CASE ... ELSE` put it. */
  if (decl?.type === 'enum' && decl.values?.length) {
    const i = decl.values.indexOf(String(raw));
    return i < 0 ? decl.values.length : i;
  }
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

      /* A LINK IS PUT IN THE NAMES' ORDER BY THE SCREEN. The record orders the id it stores, and `data/record.ts` orders an
         answer that came whole through `sortRows`, by what the cell shows; this reader is the record's half alone. Past one
         page the record's order is what is drawn, which the sweep cannot say anything about (see the test below). */
      const linked = REGISTERS[register]?.fields.find((f) => f.id === field)?.type === 'ref';
      const drawn = (dir: 'asc' | 'desc'): Entry[] => {
        const answer = list(register, { sort: { field, dir } }).entries;
        return linked ? sortRows(register, answer, field, dir) : answer;
      };
      const up = drawn('asc');
      const down = drawn('desc');

      /* NOTHING IS DROPPED AND NOTHING IS INVENTED. A sort is a permutation; the fastest way to
         hide a comparator that throws is to return the rows it managed. */
      assert.equal(up.length, held, `${register}.${field} asc lost rows`);
      assert.equal(down.length, held, `${register}.${field} desc lost rows`);
      assert.deepEqual(
        [...up].map((e) => e.seq).sort((a, b) => a - b),
        [...down].map((e) => e.seq).sort((a, b) => a - b),
        `${register}.${field} returns a different set in each direction`,
      );

      /* A LIST OF LINKS IS DRAWN AS THE NAMES IT POINTS AT (`display`), and the record still orders the column by what it
         stores, so the order is not yet the names' order. It is a permutation (above); its order waits on the record
         ordering a list of links as it orders one link, by name. */
      const decl = REGISTERS[register]?.fields.find((f) => f.id === field);
      if (decl?.type === 'list' && decl.of === 'ref') continue;

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

test('A LIST THAT CAME WHOLE IS PUT IN THE ORDER ITS CELLS READ, on the live path as on this one', () => {
  const live = readFileSync(new URL('../data/record.ts', import.meta.url), 'utf8');
  assert.match(live, /if \(a\.sort && out\.value\.cursor === null && entries\.length === out\.value\.matched\)\n\s+entries = sortRows\(register, entries, a\.sort\.field, a\.sort\.dir, names\);/u);
  const names = (dir: 'asc' | 'desc') => sortRows('transactions', list('transactions').entries, 'account', dir).map((e) => display('transactions', 'account', e.fields.account));
  const said = [...new Set(names('asc'))].filter((n) => n);
  assert.deepEqual(said, ['Company card', 'Studio current account', 'Tax reserve'], 'by the name on screen, not by which account was made first');
});

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

test('`is <a date>` ON A DATE FIELD MATCHED NOTHING, ON EVERY REGISTER, ALWAYS', async () => {
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
  const rows2 = [{ due: '2026-09-03' }, { due: '2026-09-14' }, { due: null }];
  assert.deepEqual(await admitted(rows2, [{ field: 'due', op: 'is', values: ['2026-09-03'] }]), [1]);

  /* A relative literal, which is the thing somebody actually types, read as the day itself and kept in its word. The
     rows each of the three operators admits are the record's to count. */
  const said = compile('obligations', 'due is today');
  assert.deepEqual(explain(said), [], 'the clause was not understood');
  assert.deepEqual(said.clauses, [{ field: 'due', op: 'on', day: 'today' }]);
  assert.deepEqual(compile('obligations', 'due before today').clauses, [{ field: 'due', op: 'before', day: 'today' }]);
  assert.deepEqual(compile('obligations', 'due after today').clauses, [{ field: 'due', op: 'after', day: 'today' }]);
});

test('`is not <a date>` IS NOT `is <a date>`', async () => {
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
  const some = [{ due: '2026-09-03' }, { due: '2026-09-14' }, { due: null }];
  const is = compile('obligations', 'due is 2026-09-14');
  const isNot = compile('obligations', 'due is not 2026-09-14');
  assert.deepEqual(explain(is), []);
  assert.deepEqual(explain(isNot), []);
  assert.notDeepEqual(is, isNot, '`is not` compiles to the same clause as `is`');
  assert.deepEqual(is.clauses, [{ field: 'due', op: 'on', day: '2026-09-14' }]);
  assert.deepEqual(isNot.clauses, [{ field: 'due', op: 'not on', day: '2026-09-14' }]);

  /* The same through the URL shape, which is where it was reachable. A row with no date is not the named day, so it is
     in the negation: `34 §6`, every positive operator is false on a missing value. */
  assert.deepEqual(await admitted(some, [{ field: 'due', op: 'not-in', values: ['2026-09-14'] }]), [1, 3]);
});

test('and an enum whose value is the word `today` is untouched', async () => {
  /* The date path is taken only when the FIELD is a date. A register that really holds the word
     would otherwise stop being filterable by it — the fix eating a case it was not about. */
  const some = [{ state: 'open' }, { state: 'paid' }];
  assert.deepEqual(await admitted(some, [{ field: 'state', op: 'in', values: ['open'] }]), [1]);
  const said = compile('obligations', 'state is open');
  assert.deepEqual(explain(said), []);
  assert.deepEqual(said.clauses, [{ field: 'state', op: 'is', values: ['open'] }]);
});

test('AN INSTANT CELL IS BANDED, NOT TRUNCATED TO ITS DAY', () => {
  /* `display()`'s `instant` branch had no test at all — `api.test.ts` asserts `money`, `day`, `enum`,
     `int`, `duration`, `ref`, unknown and `secret`, and reverting this one broke nothing. It was
     `relative(value.slice(0, 10))`, so a run seen two hours ago and one seen eleven hours ago
     both read *today*, on the register whose whole subject is what is happening now. */
  const at = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
  assert.equal(display('session', 'last_seen', at(0), NOW), 'just now');
  assert.equal(display('session', 'last_seen', at(2), NOW), '2h ago');
  assert.equal(display('session', 'last_seen', at(11), NOW), '11h ago');
  assert.notEqual(display('session', 'last_seen', at(2), NOW), display('session', 'last_seen', at(11), NOW));
  /* And a `day` field is still a DATE, which is the branch beside it and a different answer on
     purpose: a deadline is a date somebody diaries against, and an age is not. */
  assert.equal(display('obligations', 'due', '2026-09-03', NOW), '3 Sep');
});

test('money groups by currency then amount, and text sorts without case, as the record sorts them', () => {
  /* The same rows and orders as `packages/kernel/test/list-order-paging.test.ts`, so the two engines are held to one rule. */
  const given = rows(
    { what: 'beta', amount: { amount: 100, currency: 'USD' } },
    { what: 'Alpha', amount: { amount: 50, currency: 'GBP' } },
    { what: 'alpha', amount: { amount: 900, currency: 'EUR' } },
    { what: 'Gamma', amount: { amount: 200, currency: 'GBP' } },
    { what: 'delta' },
  );
  const whats = (field: string, dir: 'asc' | 'desc') => sortRows('obligations', given, field, dir).map((e) => e.fields.what);
  assert.deepEqual(whats('what', 'asc'), ['Alpha', 'alpha', 'beta', 'delta', 'Gamma']);
  assert.deepEqual(whats('what', 'desc'), ['Gamma', 'delta', 'beta', 'alpha', 'Alpha']);
  assert.deepEqual(whats('amount', 'asc'), ['alpha', 'Alpha', 'Gamma', 'beta', 'delta']);
  assert.deepEqual(whats('amount', 'desc'), ['beta', 'Gamma', 'Alpha', 'alpha', 'delta']);
});
