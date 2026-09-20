/**
 * `map:`'s `type: 'day'`, and the difference between a field nobody sent and a field nobody could read.
 *
 * TWO THINGS ARE UNDER TEST HERE AND THE DOCUMENT DECIDES BOTH. `docs/43-SPEC-EXTRACT.md` §4.3 gives the
 * date format a token grammar, and §9.3 works seven of its formats through by hand; §4.5's table gives
 * every mappable type an `invalid` outcome for a value it cannot take, and §5.1 step 9 ranks `invalid`
 * above `missing`. Neither is a preference of this package: the rows below copy their expected values out
 * of the specification's own tables, and each case quotes the sentence it came from.
 *
 * WHY THE TWO BELONG IN ONE FILE. They are the same failure seen twice. A date in a format this build
 * cannot read comes back as nothing, and nothing used to file as `missing`, so an arrival whose provider
 * had changed its date format from `29/08/2026` to `29.08.2026` reported that the provider had stopped
 * sending the field. The person reading that receipt writes to the provider to ask for a field that was
 * in every message.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf, type Result } from '@braindog/ports';

import { mapField, readRow, type MapDeps, type Mapping } from '../src/map.ts';
import { day, exponentOf } from '../src/ingest.ts';
import { openRecord, validateDeclaration, type Declaration, type ExtractDecl } from '../src/index.ts';
/* `43 §4.3`'s token grammar, reached the way `@braindog/record` reaches it and not the way the kernel
   could: `extract` is rank 9 to this package's 7, so `src/` may not import it and a test may, because
   a test is where the two ends of an injection seam are proved to agree (`31 §2`, and the precedent of
   `packages/record/test/context.test.ts` reaching `../../seed/src`). */
import { parseDate } from '../../extract/src/date.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

/**
 * The kernel's own reader, which is what a kernel used bare still falls back to.
 *
 * `MapDeps.day` is a seam, so `map.ts` reads whatever date grammar it is handed. Unwired, that is
 * `ingest.ts`'s `day`, four formats keyed by name.
 */
const deps: MapDeps = { exponent: exponentOf, day };

/**
 * And the reader a real record hands down, which is the configuration that matters.
 *
 * THE ADAPTER IS TWO LINES AND NEITHER IS A GRAMMAR. `parseDate` answers `undefined` where this seam
 * says `null`, and it THROWS `DATE_FORMAT_INVALID` for a format the grammar does not admit — which
 * `map.ts`'s header forbids at this point: *"NOTHING HERE THROWS."* A format that bad is refused by
 * `declare` at install, so reaching it here means a declaration arrived another way, and the answer
 * that keeps the arrival is `invalid` rather than an exception that takes the ingest down.
 */
const wiredDay = (text: string, format: string): string | null => {
  try {
    return parseDate(text, format) ?? null;
  } catch {
    return null;
  }
};
const wired: MapDeps = { exponent: exponentOf, day: wiredDay };

/** The arrival's own instant, which `{ arrived: true }` would read. No case below depends on its value. */
const TS = '2026-09-19T09:00:00.000Z';

const read = (mapping: Mapping, root: unknown, fieldType?: string) => mapField(deps, mapping, root, TS, fieldType);

/* ------------------------------------------------------------------------------------------------ */
/* §9.3's table, one row per format                                                                    */
/* ------------------------------------------------------------------------------------------------ */

type Row = [input: string, format: string, want: string];

/**
 * Every format `docs/43-SPEC-EXTRACT.md` §9.3 names as readable, with the value that section gives it.
 *
 * §4.3 states the grammar these are instances of: *"Tokens `YYYY` (4 digits) · `YY` (2, read as 20YY) ·
 * `MM` · `DD` (exactly 2) · `M` · `D` (1 or 2, greedy). Every other character is a literal matching
 * itself."* So the readable set is not a list of four or seven strings, it is every arrangement of those
 * tokens that holds one year, one month and one day. §9.3's seven rows are the worked examples, and they
 * are the floor: a build that cannot read all seven is not reading the grammar.
 */
const SPEC_9_3: Row[] = [
  /* §9.3: `29/08/26` · `DD/MM/YY` → `2026-08-29` */
  ['29/08/26', 'DD/MM/YY', '2026-08-29'],
  /* §9.3: `29/08/2026` · `DD/MM/YYYY` → `2026-08-29` */
  ['29/08/2026', 'DD/MM/YYYY', '2026-08-29'],
  /* §9.3: `08/29/2026` · `MM/DD/YYYY` → `2026-08-29` */
  ['08/29/2026', 'MM/DD/YYYY', '2026-08-29'],
  /* §9.3: `2026-08-29` · `YYYY-MM-DD` → `2026-08-29` */
  ['2026-08-29', 'YYYY-MM-DD', '2026-08-29'],
  /* §9.3: `9/8/26` · `D/M/YY` → `2026-08-09` */
  ['9/8/26', 'D/M/YY', '2026-08-09'],
  /* §9.3: `29.08.2026` · `DD.MM.YYYY` → `2026-08-29`. §9.3 uses this one in its own worked example. */
  ['29.08.2026', 'DD.MM.YYYY', '2026-08-29'],
  /* §9.3: `29082026` · `DDMMYYYY` → `2026-08-29` — "fixed widths need no separator" */
  ['29082026', 'DDMMYYYY', '2026-08-29'],
];

/** The four `ingest.ts`'s own table holds, which is what a kernel with nothing wired still reads. */
const BARE_FOUR = new Set(['DD/MM/YY', 'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']);

/**
 * Every one of §9.3's seven, through `map:`'s `type: 'day'`, on a record that wired its reader.
 *
 * THESE WERE THREE `todo` ROWS UNTIL THE SEAM EXISTED. `map.ts` never held a grammar — it hands the
 * declared format to `MapDeps.day` — but until `day` became an injection point there was no way for a
 * record to hand it anything, so `index.ts` gave it `ingest.ts`'s four-format table and §9.3's other
 * three rows could not be read by any caller. `day` is now the eighth value across the rank 7 to 9 seam
 * (`43 §14`), beside `rows`, `numbers`, `literals`, `dates`, `duplicate` and `normalise`, and this is
 * the reader a real record hands down.
 */
for (const [input, format, want] of SPEC_9_3)
  test(`map day, wired: ${input} as ${format} reads ${want}`, () => {
    assert.deepEqual(mapField(wired, { path: 'd', type: 'day', format }, { d: input }, TS), { value: want, outcome: 'exact' });
  });

test('a kernel with nothing wired still reads exactly the four it read before, and no others', () => {
  /* THE FALLBACK IS THE POINT OF A FALLBACK. A kernel used bare — a test, a tool, an embedder that
     never passed `day` — must behave today as it behaved yesterday, so `ingest.ts` keeps its table and
     nothing silently changes for a caller who did not ask. The three it cannot read are `invalid` and
     not `missing`, which is the distinction the rest of this file is about. */
  for (const [input, format, want] of SPEC_9_3)
    assert.deepEqual(
      read({ path: 'd', type: 'day', format }, { d: input }),
      BARE_FOUR.has(format) ? { value: want, outcome: 'exact' } : { value: null, outcome: 'invalid' },
      `${format} read differently by the bare kernel than this test expects`,
    );
});

test("a day with no format declared is read as `YYYY-MM-DD`, which is 43 §4.5's default", () => {
  /* §4.5: *"`day` | `format` (default `YYYY-MM-DD`) over a string; or `from:` an epoch → the UTC day"*. */
  assert.deepEqual(read({ path: 'd', type: 'day' }, { d: '2026-08-29' }), { value: '2026-08-29', outcome: 'exact' });
  assert.deepEqual(mapField(wired, { path: 'd', type: 'day' }, { d: '2026-08-29' }, TS), { value: '2026-08-29', outcome: 'exact' });
});

test('a format the grammar does not admit is invalid and never an exception', () => {
  /* §9.3: `DD/MM` · `MMM DD YYYY` · `DMYYYY` → *"throws `DATE_FORMAT_INVALID` (no year · two month
     tokens · variable width before a digit token)"*. `declare` raises that at install, which is where
     an author should hear it. Here, mid-ingest, `map.ts`'s header is the rule: *"NOTHING HERE THROWS."*
     A declaration that reached this point another way costs one field, not the whole arrival. */
  for (const format of ['DD/MM', 'MMM DD YYYY', 'DMYYYY']) {
    assert.deepEqual(mapField(wired, { path: 'd', type: 'day', format }, { d: '29/08/2026' }, TS), { value: null, outcome: 'invalid' });
    assert.deepEqual(read({ path: 'd', type: 'day', format }, { d: '29/08/2026' }), { value: null, outcome: 'invalid' });
  }
});

test('the declared format is handed to the reader verbatim, and the reader decides', () => {
  /* `map.ts` OWNS THE SEAM AND NOT THE GRAMMAR. This is what keeps the three rows above a defect in one
     file rather than in two: hand the same field a complete reader and every format in §9.3 is read. The
     stub stands in for `packages/extract`'s `parseDate` without importing it, because `extract` depends on
     `kernel` and the dependency cannot run the other way. */
  const seen: [string, string][] = [];
  const stub: MapDeps = { exponent: exponentOf, day: (text, format) => { seen.push([text, format]); return '2026-08-29'; } };

  for (const [input, format] of SPEC_9_3)
    assert.deepEqual(mapField(stub, { path: 'd', type: 'day', format }, { d: input }, TS), { value: '2026-08-29', outcome: 'exact' });

  assert.deepEqual(seen, SPEC_9_3.map(([input, format]) => [input, format]));
});

/* ------------------------------------------------------------------------------------------------ */
/* The seam, through a real record                                                                     */
/* ------------------------------------------------------------------------------------------------ */

const PAGE: ExtractDecl = {
  ingest: 'invoices',
  fetch: { read: { rows: 'data' } },
  map: { when: { path: 'date', type: 'day', format: 'DD.MM.YYYY' } },
  writes: { register: 'invoices' },
};
const BODY = { ts: TS, body: JSON.stringify({ data: [{ date: '29.08.2026' }] }) };

test("a record that wired its date reader reads a format the kernel's own table has never held", async () => {
  /* END TO END, THROUGH THE DOOR A CONNECTOR'S PAGE COMES IN BY. `openRecord`'s `day` is the eighth
     value handed across the seam, and this asserts it actually arrives: the declaration says
     `DD.MM.YYYY`, which is §9.3's own worked example and which `ingest.ts`'s table does not hold. */
  const k = await openRecord(openSqlite(), fixedClock(Date.UTC(2026, 8, 19, 9)), { day: wiredDay });
  const out = k.extract(PAGE, BODY);
  assert.equal(out.rows[0]?.fields['when'], '2026-08-29');
  assert.equal(out.rows[0]?.confidence, 'exact');
  assert.deepEqual(out.rows[0]?.outcome, {});
});

test('and a record that wired nothing says it could not read it, rather than pretending it was absent', async () => {
  const k = await openRecord(openSqlite(), fixedClock(Date.UTC(2026, 8, 19, 9)));
  const out = k.extract(PAGE, BODY);
  assert.equal(out.rows[0]?.confidence, 'needs-review');
  /* THE WORD IS THE WHOLE POINT. The message carried a date; this build could not read it. */
  assert.deepEqual(out.rows[0]?.outcome, { when: 'invalid' });
});

test('a format that names a property of Object.prototype is invalid, and not an exception', () => {
  /* `declare` DID NOT CHECK A `map:` DAY'S FORMAT AT ALL: `mappingFault` validated `path`, `type`,
     `from`, a money currency and an enum's values, and let `format` through whatever it said. So
     `format` was attacker-shaped input by the time it reached the reader, and the bare reader looked it
     up in a plain object literal: `FORMATS['__proto__']` is `Object.prototype`, which is truthy, so the
     guard for an unknown format did not fire and the next line called `.exec` on it. That is a
     `TypeError` out of the middle of an ingest, which `map.ts`'s header forbids: *"NOTHING HERE
     THROWS."* An unreadable format costs one field.

     THE INSTALL-TIME CHECK BELOW NOW REFUSES ALL FOUR OF THESE, and this case stays anyway. The two
     answers are not the same answer: install decides whether a declaration may exist, and `map.ts`
     decides what a running ingest does with one that reached it another way. A reader whose safety
     depends on a validator upstream is a reader that breaks the first time something skips it. */
  for (const format of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
    assert.deepEqual(read({ path: 'd', type: 'day', format }, { d: '2026-08-29' }), { value: null, outcome: 'invalid' });
    assert.deepEqual(mapField(wired, { path: 'd', type: 'day', format }, { d: '2026-08-29' }, TS), { value: null, outcome: 'invalid' });
  }
});

test('a value holding an impossible day and then a real one reads the real one', () => {
  /* §4.3's form table is the oracle and it says a `date` form yields *"each valid calendar day matching
     `F`"* — valid qualifies which matches count, so a run of digits that has the right shape and is not
     a day is not a match, and the scan goes on. §9.3 shows the same thing twice: `31/02/26` yields
     nothing, and `1/1/26 and 2/2/26` under `nth: 2` reaches `2026-02-02`, which it could not if the
     first candidate ended the scan.

     THIS IS A REAL CHANGE FOR THE FOUR FORMATS THAT ALREADY WORKED, and it is the document's change
     rather than a side effect. The bare reader takes the first shape match, checks the calendar, and
     gives up if it fails — so a field that held an impossible date followed by a real one answered
     `invalid` where the grammar answers with the real one. */
  const held = { d: '31/02/2026 then 15/03/2026' };
  assert.deepEqual(mapField(wired, { path: 'd', type: 'day', format: 'DD/MM/YYYY' }, held, TS), { value: '2026-03-15', outcome: 'exact' });
  /* And the bare kernel keeps its own answer, because a fallback that quietly changed would be the
     thing this file exists to catch. */
  assert.deepEqual(read({ path: 'd', type: 'day', format: 'DD/MM/YYYY' }, held), { value: null, outcome: 'invalid' });
});

test('a day the calendar does not hold is invalid, not missing', () => {
  /* §9.3: `31/02/26` · `DD/MM/YY` → *"undefined — no such day"*, and §4.3: *"The day must exist in the
     Gregorian calendar (leap years included)."* §4.5's table then turns that into the outcome: a `day`
     the reader cannot take is `invalid`. */
  assert.deepEqual(read({ path: 'd', type: 'day', format: 'DD/MM/YY' }, { d: '31/02/26' }), { value: null, outcome: 'invalid' });
  /* §9.3: `29/02/2026` · `DD/MM/YYYY` → undefined; `29/02/2024` → `2024-02-29`. */
  assert.deepEqual(read({ path: 'd', type: 'day', format: 'DD/MM/YYYY' }, { d: '29/02/2026' }), { value: null, outcome: 'invalid' });
  assert.deepEqual(read({ path: 'd', type: 'day', format: 'DD/MM/YYYY' }, { d: '29/02/2024' }), { value: '2024-02-29', outcome: 'exact' });
});

test('a date written in another format than the one declared is invalid, and never guessed at', () => {
  /* §9.3: `2026-08-29` · `DD/MM/YY` → *"undefined — separator mismatch"*. The declaration decides, so a
     value that does not match it is a value that was sent and could not be read. */
  assert.deepEqual(read({ path: 'd', type: 'day', format: 'DD/MM/YY' }, { d: '2026-08-29' }), { value: null, outcome: 'invalid' });
  /* §9.3: `29/08/26` · `MM/DD/YY` → *"undefined — month 29"*. */
  assert.deepEqual(read({ path: 'd', type: 'day', format: 'MM/DD/YYYY' }, { d: '29/08/2026' }), { value: null, outcome: 'invalid' });
});

/* ------------------------------------------------------------------------------------------------ */
/* `invalid` is not `missing`                                                                          */
/* ------------------------------------------------------------------------------------------------ */

/**
 * `map.ts`'s own comment above `INVALID` states the distinction in full:
 *
 *   *"A VALUE WAS THERE AND COULD NOT BE READ, which is not the same as one that was not there. […]
 *   `missing` sends them to the provider to ask why a field was not sent; `invalid` sends them to a value
 *   that WAS sent and that we could not read, which is usually a format that changed. `invalid` also
 *   outranks `missing` in `§5.1` step 9's severity, so collapsing them understated a field that was
 *   invalid in one row and absent in another."*
 *
 * And `docs/43-SPEC-EXTRACT.md` §5.1 step 9 is the sentence it cites:
 *
 *   *"`receipt.fields` is the worst outcome per field over rows, on the severity
 *   `invalid > ambiguous > missing > defaulted > chosen > exact`."*
 *
 * `mapField` has always answered correctly. `readRow` did not carry the answer out: every field whose
 * value came back `null` went onto one list called `missed`, so the two words the comment and the
 * specification separate arrived at the receipt as one.
 */

const MAP: Record<string, Mapping> = {
  ref: { path: 'id', type: 'text' },
  n: { path: 'count', type: 'int' },
  when: { path: 'date', type: 'day', format: 'DD/MM/YYYY' },
  kind: { path: 'kind', type: 'enum', values: ['charge', 'refund'], other: 'other' },
};

const typeOf = (field: string): string | undefined => ({ ref: 'text', n: 'int', when: 'day', kind: 'enum' })[field];

test('a field the answer did not carry is missing', () => {
  const got = readRow(deps, MAP, { id: 'ch_1', date: '29/08/2026', kind: 'charge' }, TS, typeOf);
  /* §4.5: *"`select(row, path)` must reach exactly one value: zero → `missing`"*. */
  assert.deepEqual(got.outcome, { ref: 'exact', n: 'missing', when: 'exact', kind: 'exact' });
  assert.deepEqual(got.missed, ['n']);
  assert.deepEqual(got.invalid, []);
});

test('a field the answer carried and the row could not read is invalid', () => {
  const got = readRow(deps, MAP, { id: 'ch_1', count: 1.5, date: '29/08/2026', kind: 'charge' }, TS, typeOf);
  /* §4.5: *"`int` | integer, or a string under the `int` grammar | fraction […] → `invalid`"*. */
  assert.deepEqual(got.outcome, { ref: 'exact', n: 'invalid', when: 'exact', kind: 'exact' });
  assert.deepEqual(got.invalid, ['n']);
  /* And it is still on `missed`, which stays the full list of fields that were not written. */
  assert.deepEqual(got.missed, ['n']);
});

test('the two are reported apart in one row, so a receipt can rank them', () => {
  /* The case §5.1 step 9's severity order exists for: one field absent, one field sent and unreadable.
     Collapsed into one word, a person is told the same thing about both and can act on neither. */
  const got = readRow(deps, MAP, { id: 'ch_1', date: 'yesterday' }, TS, typeOf);
  assert.deepEqual(got.outcome, { ref: 'exact', n: 'missing', when: 'invalid', kind: 'missing' });
  assert.deepEqual(got.missed, ['n', 'when', 'kind'], 'all three were not written');
  assert.deepEqual(got.invalid, ['when'], 'and only one of the three was sent and unreadable');
});

test('an unreadable date files as invalid and an absent one as missing, which is the whole defect', () => {
  /* The provider that changed `29/08/2026` to `29.08.2026` overnight. Before this, both rows below said
     `missing`, and the receipt sent a person to ask for a field that was in every single message. */
  const sent = readRow(deps, MAP, { id: 'ch_1', count: 1, date: '29.08.2026', kind: 'charge' }, TS, typeOf);
  const absent = readRow(deps, MAP, { id: 'ch_1', count: 1, kind: 'charge' }, TS, typeOf);

  assert.equal(sent.outcome['when'], 'invalid', 'a date that was sent and could not be read reported as absent');
  assert.equal(absent.outcome['when'], 'missing');
});

test('every non-exact field is still named, so no caller loses a row it used to review', () => {
  /* `missed` KEEPS ITS MEANING FOR THE CALLERS THAT HAVE ONE. `extract.ts` decides a row's confidence
     from whether `missed` is empty, and §5.1 step 7 puts `missing`, `ambiguous` and `invalid` all at
     `needs-review`, so the list a caller checks for emptiness has to hold both words until that caller is
     changed to read `outcome` instead. `invalid` is the subset, named separately, and never a field that
     `missed` does not also hold. */
  const got = readRow(deps, MAP, { id: 'ch_1', count: 1.5, date: 'yesterday' }, TS, typeOf);
  assert.deepEqual(got.missed, ['n', 'when', 'kind'], 'missed must stay the full list of fields that were not written');
  assert.deepEqual(got.invalid, ['n', 'when']);
  for (const field of got.invalid) assert.ok(got.missed.includes(field), `${field} is invalid and not in missed`);
});

test("a declared `other:` is a defaulted value and neither missing nor invalid", () => {
  /* §4.5: *"`enum` | the string must be in `values`; else `other` if declared (outcome `defaulted`)"*, and
     §5.1 step 7 puts `defaulted` at `proposed` rather than `needs-review`. */
  const got = readRow(deps, MAP, { id: 'ch_1', count: 1, date: '29/08/2026', kind: 'payout' }, TS, typeOf);
  assert.deepEqual(got.outcome, { ref: 'exact', n: 'exact', when: 'exact', kind: 'defaulted' });
  assert.deepEqual(got.soft, ['kind']);
  assert.deepEqual(got.missed, []);
  assert.deepEqual(got.invalid, []);
  assert.equal(got.fields['kind'], 'other');
});

/* ------------------------------------------------------------------------------------------------ */
/* The receipt a person reads                                                                          */
/* ------------------------------------------------------------------------------------------------ */

/**
 * The two consumers of `readRow` both rebuilt the outcome from `missed` alone, so both said `missing`
 * about a field the message had sent.
 *
 * THIS IS THE FAILURE THE WHOLE FILE IS ABOUT, SEEN WHERE IT COSTS SOMETHING. A provider changes its
 * date format overnight. Every arrival files for review, and the receipt says the date is missing. The
 * person reading it writes to the provider to ask why they stopped sending a date, and the provider
 * answers that they never stopped, and the fix — a two-character edit to `format:` — is not even in
 * the sentence. Both outcomes are `needs-review` by `43 §5.1` step 7, so no wrong row was ever written
 * and nothing was ever going to catch this except somebody reading the sentence.
 */

const INVOICES: Declaration = {
  id: 'register.invoices',
  kind: 'register',
  body: {
    id: 'invoices',
    name: 'Invoices',
    title: 'ref',
    fields: [
      { id: 'ref', type: 'text', required: true },
      { id: 'when', type: 'day' },
    ],
  } as never,
};

const DATED_POLL: Declaration = {
  id: 'ingest.invoices',
  kind: 'ingest',
  body: {
    ingest: 'invoices',
    channel: 'poll',
    url: 'https://billing.example.test/v1/latest.json',
    every: '1h',
    grant: 'billing read',
    map: {
      ref: { path: 'data.ref', type: 'text' },
      when: { path: 'data.date', type: 'day', format: 'DD.MM.YYYY' },
    },
    writes: { register: 'invoices' },
  } as never,
};

async function polled(opts: Parameters<typeof openRecord>[2], body: string) {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(Date.UTC(2026, 8, 19, 9)), opts);
  assert.ok(k.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAE', slug: 'northwind', name: 'Northwind', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'ada@example.test', name: 'Ada' } }).ok);
  assert.ok(k.bindGrant({ label: 'billing read', opens: 'billing.example.test', kind: 'api_token', ciphertext: new Uint8Array([1, 2, 3, 4]), nonce: new Uint8Array([9, 9, 9, 9]), kdf: 'hkdf', wrapped_by: 'kek', kek_id: 'kek_fake' }, 'p_1').ok);
  const out = await k.install([INVOICES, DATED_POLL]);
  assert.ok(out.ok, fixOf(out as Result<unknown>));
  await k.runActions(async () => ({ status: 200, body, bytes: body.length, ms: 4, requests: 1 }));
  return sql.one<{ state: string; reason: string }>("SELECT state, reason FROM inbox_raw WHERE channel = 'pull' ORDER BY rowid DESC");
}

test('a receipt says which fields were absent and which were sent and unreadable, and never calls the second the first', async () => {
  /* `ref` is not in the answer at all. `date` is, and this record reads four formats, so `DD.MM.YYYY`
     is a value that WAS sent and could not be read. One sentence naming both as *could not read* was
     what this said before. */
  const raw = await polled(undefined, JSON.stringify({ data: { date: '29.08.2026' } }));
  assert.equal(raw?.state, 'review');
  assert.match(raw?.reason ?? '', /could not read ref out of this one\./, 'the absent field must keep the sentence it already had');
  assert.match(raw?.reason ?? '', /found when in this one and could not make sense of it/, 'the field that WAS sent reported as absent');
  assert.doesNotMatch(raw?.reason ?? '', /could not read ref, when|could not read when/, 'the two were named by one clause');
});

test('and a record that wired the grammar reads the date, so only the genuinely absent field is named', async () => {
  const raw = await polled({ day: wiredDay }, JSON.stringify({ data: { date: '29.08.2026' } }));
  assert.equal(raw?.state, 'review');
  assert.match(raw?.reason ?? '', /could not read ref out of this one\./);
  assert.doesNotMatch(raw?.reason ?? '', /when/, 'the date was read, so nothing should name it');
});

test('an arrival with nothing but absent fields reads exactly as it read before', async () => {
  /* THE CLAUSE FOR AN ABSENT FIELD IS UNCHANGED, WORD FOR WORD, which is what keeps every receipt
     already sitting in a record meaning what it meant when it was written. */
  const raw = await polled({ day: wiredDay }, JSON.stringify({ data: {} }));
  assert.equal(raw?.reason, 'invoices could not read ref, when out of this one.');
});

/* ------------------------------------------------------------------------------------------------ */
/* And the same format, an install earlier                                                             */
/* ------------------------------------------------------------------------------------------------ */

/**
 * EVERY CASE ABOVE IS A ROW THAT SHOULD NEVER HAVE BEEN WRITTEN, because the declaration that wrote it
 * should not have installed.
 *
 * `map.ts` is right to answer `invalid` rather than throw: its header says *"NOTHING HERE THROWS."* But
 * `invalid` is the answer for a value the provider sent in a shape nobody could read, and a format the
 * grammar does not admit is not that. It is the author's own typing, wrong at the moment they wrote it,
 * and it costs the same field on every row for as long as the pack is installed. `43 §13 D13` puts the
 * check at install, where the author is still looking at what they typed, and `extractorFault` has run
 * it on the `date:` extractor since the same work. `mappingFault` never did.
 */
const mapping = (when: unknown): { code: string; at: string | undefined } | null => {
  const body = { ...(DATED_POLL.body as Record<string, unknown>), map: { ref: { path: 'data.ref', type: 'text' }, when } };
  const said = validateDeclaration({ id: 'ingest.invoices', kind: 'ingest', body } as Declaration);
  return said === null ? null : { code: said.code, at: said.at };
};

test('A DAY WHOSE FORMAT NOTHING COULD READ IS REFUSED AT INSTALL, NOT LEFT TO EMPTY EVERY ROW', () => {
  /* The three `43 §9.3` names, plus a word with no token in it and a format that is not text at all.
     Each installed clean before this, matched arrivals, wrote rows, and left the day null on all of them. */
  for (const format of ['banana', 'DD/MM', 'MMM DD YYYY', 'DMYYYY', '', 42]) {
    const said = mapping({ path: 'data.date', type: 'day', format });
    assert.equal(said?.code, 'DATE_FORMAT_INVALID', `${JSON.stringify(format)} installed`);
    assert.equal(said?.at, 'ingest.invoices.map.when.format');
  }
  /* And the seven the grammar does admit still install, including the three no bare kernel can read:
     what a build reads is a deploy, and what the grammar admits is the declaration. */
  for (const [, format] of SPEC_9_3) assert.equal(mapping({ path: 'data.date', type: 'day', format }), null, format);
  /* A day that names no format takes `YYYY-MM-DD` by `43 §4.5` and is not an author who forgot one. */
  assert.equal(mapping({ path: 'data.date', type: 'day' }), null);
});

test('AND A FORMAT ON A MAPPING THAT NEVER READS ONE IS REFUSED TOO, BECAUSE A DEAD KEY IS THE SAME SILENCE', () => {
  /* `43 §4.5` gives `format` to `day` alone. `instant` reads RFC 3339 or an epoch through `from:`, and
     `map.ts` looks at `mapping.format` in exactly one branch. So a format written anywhere else is a
     rule the author wrote, believed, and never got. `readFault` already answers this shape for a
     `delimiter` on a read that is not CSV. */
  for (const type of ['text', 'int', 'decimal', 'instant', 'bool', 'url', 'json'])
    assert.deepEqual(
      mapping({ path: 'data.date', type, format: 'YYYY-MM-DD' }),
      { code: 'DECLARATION_INVALID', at: 'ingest.invoices.map.when.format' },
      `${type} accepted a format it never reads`,
    );
  assert.equal(mapping({ path: 'data.amount', type: 'money', currency: 'GBP', format: 'YYYY-MM-DD' })?.code, 'DECLARATION_INVALID');

  /* THE SHARPEST OF THEM IS A DAY THAT NAMES BOTH. `map.ts` takes the `from:` branch and returns before
     it ever reads `format`, so an author who wrote two ways to read one value got the one they did not
     write second, and nothing said which had won. */
  assert.deepEqual(
    mapping({ path: 'data.date', type: 'day', from: 'epoch_s', format: 'DD/MM/YYYY' }),
    { code: 'DECLARATION_INVALID', at: 'ingest.invoices.map.when.format' },
  );
  assert.equal(mapping({ path: 'data.date', type: 'day', from: 'epoch_s' }), null, 'an epoch day with no format is legal');
});
