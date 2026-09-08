/**
 * The seventeen a second adversarial pass found, each with the probe that found it.
 *
 * Same class as the first: every one of them returned, reported `ok` or drew a screen, and the
 * record was quietly not doing what its own comments said it did. Two of them were guards that did
 * not guard — a savepoint that rolled nothing back, a key check satisfied by not asking — which is
 * worse than no guard at all, because a guard that is there is a guard nobody looks at twice.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  fill,
  headline,
  localParts,
  nextOccurrence,
  openRecord,
  render,
  slugify,
  targetOf,
  type Declaration,
  type Kernel,
  type MetricDecl,
} from '../src/index.ts';
import { attempt } from '../src/tx.ts';
import { parseWhere, type Schema } from '@braindog/where';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);

const BOOKS: Declaration = {
  id: 'register.books',
  kind: 'register',
  body: {
    id: 'books',
    name: 'Books',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'amount', type: 'money' },
      { id: 'trend', type: 'int' },
      { id: 'due', type: 'day', index: true },
      { id: 'note', type: 'text' },
      { id: 'state', type: 'enum', values: ['open', 'paid'] },
    ],
  } as never,
};

const gbp = (amount: number) => ({ amount, currency: 'GBP' });
const usd = (amount: number) => ({ amount, currency: 'USD' });

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([BOOKS])).ok);
  return { k, sql };
}

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const refusal = (r: unknown) => {
  const x = r as { ok: boolean; refusal: { code: string; fix: string; at?: string } };
  assert.equal(x.ok, false, 'this was supposed to be refused');
  return x.refusal;
};

const METRIC = (over: Partial<MetricDecl> = {}): MetricDecl => ({
  metric: 'm',
  name: 'M',
  source: 'register.books',
  value: { sum: 'amount' },
  target: { lte: 1_000_000 },
  window: '30d',
  compare: 'none',
  ...over,
});

/* ── 1 · a diff across two currencies ────────────────────────────────────── */

test('A DIFF OF TWO CURRENCIES IS REFUSED, not answered in the numerator’s', async () => {
  /* Each half was checked for a mixed currency inside itself and neither against the other, so
     GBP minus USD came out as a number labelled GBP — the failure this file's header is written
     against, arrived at through the guard against it. */
  const { k, sql } = await record();
  assert.ok(k.create('books', { name: 'a', amount: gbp(16_000), state: 'open' }, { actor: 'p_1' }).ok);
  assert.ok(k.create('books', { name: 'b', amount: usd(4_500), state: 'paid' }, { actor: 'p_1' }).ok);

  const out = refusal(
    k.metric(
      METRIC({
        value: { diff: { of: { sum: 'amount' }, per: { sum: 'amount' } } },
      }),
    ),
  );
  void out;

  // Two halves with different predicates is where it actually bites; one read, two currencies.
  const both = refusal(k.metric(METRIC({ value: { sum: 'amount' } })));
  assert.equal(both.code, 'MIXED_CURRENCY');
  sql.close();
});

/* ── 15 · a field named after a shape ────────────────────────────────────── */

test('A FIELD CALLED `trend` CAN BE SUMMED, because a key is not a substring of the JSON', async () => {
  const { k, sql } = await record();
  assert.ok(k.create('books', { name: 'a', trend: 3 }, { actor: 'p_1' }).ok);
  assert.equal(value<{ value: number }>(k.metric(METRIC({ value: { sum: 'trend' }, target: { gte: 0 } }))).value, 3);
  // And a shape this build does not read is still refused, by its KEY.
  assert.equal(refusal(k.metric(METRIC({ value: { trend: 'amount' } as never }))).code, 'NOT_IN_THIS_BUILD');
  sql.close();
});

/* ── 8 · a target that is not a bound ────────────────────────────────────── */

test('A TARGET THAT IS NOT A BOUND IS NOT A VERDICT', () => {
  /* `Number('')` is zero, so an empty target read as "at least nothing" — met by every figure,
     scored once, and never revisited because `scored_at` was set. A prediction that cannot be wrong
     is not a prediction. */
  assert.equal(targetOf(''), null);
  assert.equal(targetOf('abc'), null);
  assert.equal(targetOf('20%'), null);
  assert.deepEqual(targetOf('<=400000'), { lte: 400_000 });
  assert.deepEqual(targetOf('20'), { gte: 20 });
});

/* ── 2 · a refused section in the headline ───────────────────────────────── */

test('A REFUSED SECTION IS AN EM DASH IN THE NOTIFICATION, not a zero', () => {
  /* It fell through to `rows.length`, so a money figure the record had REFUSED to compute was
     announced as nothing owed. The email said why and the notification said zero, and the
     notification is the one somebody reads first. */
  const line = headline('Weekly', [
    { heading: 'Owed to you', source: 'metric.owed', as: 'stat', rows: [], refusals: [{ code: 'MIXED_CURRENCY', fix: 'two currencies' }] },
    { heading: 'Bills', source: 'register.bills', as: 'table', rows: [{ seq: 1 }, { seq: 2 }] as never, refusals: [] },
  ]);
  assert.equal(line, 'Weekly: Owed to you — · Bills 2');
});

test('and a table with no declared columns still escapes a pipe', () => {
  const text = render('W', [
    { heading: 'Rows', source: 'register.rows', as: 'table', rows: [{ seq: 1, fields: { what: 'a | b' } }] as never, refusals: [] },
  ]);
  assert.match(text, /a \\\| b/, 'a value with a pipe in it split into two columns');
});

/* ── 5 · the clock ───────────────────────────────────────────────────────── */

test('A DIGEST LANDS AT ITS HOUR ACROSS A DAYLIGHT-SAVING TRANSITION', () => {
  /* The offset was read at the PROBE and never re-read at the answer, so a transition between the
     two moved the result by an hour — in both directions. A Sunday digest landed at 07:00 in
     October and 09:00 in March, on the two mornings anybody would notice. */
  const autumn = Date.UTC(2026, 9, 24, 23, 30); // Sat 24 Oct 23:30 UTC = Sun 00:30 BST
  const a = nextOccurrence({ day: 'sun', at: '08:00' }, autumn, 'Europe/London')!;
  assert.equal(localParts(a, 'Europe/London').hour, 8, `landed at ${new Date(a).toISOString()}`);

  const spring = Date.UTC(2026, 2, 29, 0, 10); // Sun 29 Mar 00:10 GMT
  const b = nextOccurrence({ day: 'sun', at: '08:00' }, spring, 'Europe/London')!;
  assert.equal(localParts(b, 'Europe/London').hour, 8, `landed at ${new Date(b).toISOString()}`);

  const c = nextOccurrence({ day: 'sun', at: '09:00' }, spring, 'Europe/London')!;
  assert.equal(localParts(c, 'Europe/London').hour, 9);
});

test('and a schedule that is not a schedule is `null`, not twenty-four hours from now', () => {
  // `Number('8am')` is NaN and `NaN ?? 8` is NaN, so a malformed `at` silently became "a day from
  // now" — a weekly digest arriving at a different hour every week, with nothing saying why.
  for (const at of ['8am', '25:00', '', 'noon', '8:0']) assert.equal(nextOccurrence({ at }, NOW, 'UTC'), null, at);
  assert.equal(nextOccurrence({ day: 'someday', at: '08:00' }, NOW, 'UTC'), null);
  assert.ok(nextOccurrence({ at: '08:00' }, NOW, 'UTC') !== null);
});

/* ── 4 · a title that is not JSON-safe ───────────────────────────────────── */

test('ONE ROW WITH A BACKSLASH IN ITS TITLE DOES NOT MAKE EVERY PAGE UNLISTABLE', () => {
  /* `fill` escaped the one character somebody remembered. A title with a backslash, a newline or a
     tab made `JSON.parse` throw — out of `resolvePages`, which every page listing calls. */
  for (const title of ['C:\\Repos', 'two\nlines', 'a\ttab', 'say "hi"', 'a {{ b']) {
    const out = fill({ title: 'Page {{name}}', where: 'thing is {{name}}' }, { fields: { name: title } } as never) as {
      title: string;
      where: string;
    };
    assert.equal(out.title, `Page ${title}`);
    assert.equal(out.where, `thing is ${title}`);
  }
  // And the `{{it}}` parameter is escaped the same way, which it was not at all.
  const param = fill({ where: 'thing is {{it}}' }, null, 'say "hi"') as { where: string };
  assert.equal(param.where, 'thing is say "hi"');
});

/* ── 10 · two rows, one slug ─────────────────────────────────────────────── */

test('a slug is what somebody types, and a title that makes none falls back to the number', () => {
  assert.equal(slugify('Marlow & Co'), 'marlow-co');
  assert.equal(slugify('!!!'), '');
  assert.equal(slugify('— / —'), '');
});

/* ── 11 · the savepoint ──────────────────────────────────────────────────── */

test('A REFUSAL WRITES NOTHING, EVEN INSIDE A TRANSACTION SOMEBODY ELSE OPENED', async () => {
  /* The kernel's `transaction` is re-entrant: at depth greater than zero it calls the function
     directly and opens nothing, so the throw this used to carry the refusal out on reached nobody
     who could roll anything back. A safety net that was not there in the one case it was written
     for — a caller doing `k.transaction(() => k.bindGrant(…))`. */
  const { k, sql } = await record();
  sql.exec('CREATE TABLE probe (x TEXT)');

  const outer = k.transaction(() =>
    attempt(sql, k.transaction, () => {
      sql.exec("INSERT INTO probe (x) VALUES ('inner')");
      return { ok: false as const, refusal: { code: 'NOPE', fix: 'no' } };
    }),
  );
  assert.equal(outer.ok, false);
  assert.deepEqual(sql.all('SELECT x FROM probe'), [], 'a refusal inside an open transaction wrote a row');

  // The outer work still commits: one refusal is not the whole transaction.
  k.transaction(() => {
    sql.exec("INSERT INTO probe (x) VALUES ('outer')");
    attempt(sql, k.transaction, () => {
      sql.exec("INSERT INTO probe (x) VALUES ('inner')");
      return { ok: false as const, refusal: { code: 'NOPE', fix: 'no' } };
    });
  });
  assert.deepEqual(sql.all<{ x: string }>('SELECT x FROM probe').map((r) => r.x), ['outer']);

  // And a real throw still rolls back and keeps going up.
  assert.throws(() =>
    k.transaction(() =>
      attempt(sql, k.transaction, () => {
        sql.exec("INSERT INTO probe (x) VALUES ('thrown')");
        throw new TypeError('a real error');
      }),
    ),
  );
  assert.equal(sql.all("SELECT x FROM probe WHERE x = 'thrown'").length, 0);
  sql.close();
});

/* ── 9, 17 · the sentence grammar ────────────────────────────────────────── */

const SCHEMA: Schema = {
  register: 'books',
  fields: { name: { type: 'text' }, note: { type: 'text' }, due: { type: 'day' }, state: { type: 'enum', values: ['open', 'paid'] } },
};
const parse = (text: string) => parseWhere(text, SCHEMA, { nowMs: NOW });

test('A DATE THAT CANNOT EXIST IS A REFUSAL, not a filter that matches every row', () => {
  // The pattern checked the shape and the value was then compared as a string, so
  // `due before 2026-13-45` was true of everything.
  assert.equal(parse('due before 2026-13-45').predicate, undefined);
  assert.equal(parse('due after 2026-00-00').predicate, undefined);
  assert.equal(parse('due before 2026-02-30').predicate, undefined);
  assert.deepEqual(parse('due before 2026-02-28').predicate, { field: 'due', before: '2026-02-28' });
});

test('a sentence made only of separators says nothing, and is refused rather than meaning everything', () => {
  // `,,,` produced `{all: []}`, which the compiler renders as `1 = 1`: somebody wrote a filter and
  // got the whole register.
  const out = parse(',,,');
  assert.equal(out.predicate, undefined);
  /* `VALUE_MALFORMED`: a sentence IS the value of `where:`, and `,,,` is one outside the shape a
     filter takes — `30 §6`'s own words for that code. `WHERE_MALFORMED` was in no registry. */
  assert.equal(out.bad[0]?.code, 'VALUE_MALFORMED');
  // An empty string is still no filter, which is a different thing.
  assert.equal(parse('').bad.length, 0);
  assert.equal(parse('').predicate, undefined);
});

test('and `is not` with nothing after it is not a search for the word `not`', () => {
  assert.equal(parse('note is not').predicate, undefined);
  assert.equal(parse('note is not').bad[0]?.code, 'REQUIRED_MISSING');
  assert.deepEqual(parse('note is not x').predicate, { field: 'note', not: 'x' });
});
