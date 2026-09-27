/**
 * A step reads a figure: `{{metric.<id>}}` in a run's fill is the figure's value, read as a page reads it
 * (`loop/research-m3-dynamic.md` §3, B1).
 *
 * WHAT WAS MEASURED BEFORE THE REPAIR, AND EACH TEST BELOW FAILED ON IT. The survey's probe, a list `items` summed by a
 * figure `total`: `set_var: { name: tot, to: '{{metric.total}}' }` then `set: { field: note, to: 'total {{vars.tot}}' }`
 * installed, the run ended `done`, and the row's note read `total {{metric.total}}`. Nothing refused the rule and
 * nothing in the run said the braces were never filled, so the only place the failure showed was the row itself.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, validateDeclaration, type Declaration, type Kernel } from '../src/index.ts';
import { figureFault } from '../src/figure.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 24, 12);
const MIN = 60_000;

const ITEMS: Declaration = {
  id: 'register.items',
  kind: 'register',
  body: {
    id: 'items',
    name: 'Items',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'n', type: 'int' },
      { id: 'note', type: 'text' },
    ],
  } as never,
};

const SPENT: Declaration = {
  id: 'register.spent',
  kind: 'register',
  body: {
    id: 'spent',
    name: 'Spent',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'amount', type: 'money' },
    ],
  } as never,
};

/** A list with a field that never leaves the record, and a figure counting its rows. */
const KEYS: Declaration = {
  id: 'register.keys',
  kind: 'register',
  body: {
    id: 'keys',
    name: 'Keys',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'pin', type: 'secret' },
      { id: 'note', type: 'text' },
    ],
  } as never,
};

const figure = (id: string, source: string, value: Record<string, string>, format: string): Declaration => ({
  id: `metric.${id}`,
  kind: 'metric',
  body: { metric: id, name: id, source: `register.${source}`, value, format, target: { gte: 0 }, window: '30d', compare: 'none' } as never,
});

const TOTAL = figure('total', 'items', { sum: 'n' }, 'int');
const CASH = figure('cash-now', 'spent', { sum: 'amount' }, 'money.GBP');
const HELD = figure('held', 'keys', { count: 'what' }, 'int');

const rule = (body: Record<string, unknown>): Declaration => ({ id: `rule.${body.rule as string}`, kind: 'rule', body: body as never });
const onItems = { written: { register: 'items', op: ['create'] } };

const why = (r: unknown): string => {
  const x = r as { ok: boolean; refusal?: { code: string; fix: string } };
  return x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`;
};

async function record(...decls: Declaration[]): Promise<{ k: Kernel; sql: NodeSql; clock: ReturnType<typeof fixedClock> }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  const done = await k.install([ITEMS, SPENT, KEYS, TOTAL, CASH, HELD, ...decls]);
  assert.ok(done.ok, why(done));
  return { k, sql, clock };
}

type Run = { state: string; say: string | null };
const runs = (sql: NodeSql, of: string): Run[] =>
  sql.all<Run>('SELECT state, say FROM automation_run WHERE rule = ? ORDER BY started_at, rowid', of).map((r) => ({ state: r.state, say: r.say }));
const noteOf = (sql: NodeSql, what: string): unknown =>
  (JSON.parse(sql.one<{ fields: string }>("SELECT fields FROM entry WHERE register = 'items' AND json_extract(fields, '$.what') = ?", what)!.fields) as Record<string, unknown>).note;
const notes = (sql: NodeSql, actor: string): string[] =>
  sql.all<{ note: string }>("SELECT note FROM event WHERE kind = 'note' AND actor = ? ORDER BY rowid", actor).map((r) => r.note);

/* ── the red the brief asked for ───────────────────────────────────────── */

test('THE SURVEY PROBE: a set_var from {{metric.total}} then a set of note writes the figure, not the braces', async () => {
  const { k, sql } = await record(
    rule({
      rule: 'probe',
      on: onItems,
      steps: [{ set_var: { name: 'tot', to: '{{metric.total}}' } }, { set: { field: 'note', to: 'total {{vars.tot}}' } }],
    }),
  );
  assert.ok(k.create('items', { what: 'Kiln', n: 12 }, { actor: 'p_1' }).ok);
  await k.drain();
  assert.deepEqual(runs(sql, 'probe'), [{ state: 'done', say: null }]);
  assert.equal(noteOf(sql, 'Kiln'), 'total 12');
});

test('A TEXT THE PASS FILLS READS THE FIGURE IN THE SAME PASS as the row and the run: set, and the figure moves with the rows', async () => {
  const { k, sql } = await record(rule({ rule: 'straight', on: onItems, steps: [{ set: { field: 'note', to: '{{what}} of {{metric.total}}' } }] }));
  assert.ok(k.create('items', { what: 'Kiln', n: 12 }, { actor: 'p_1' }).ok);
  await k.drain();
  assert.equal(noteOf(sql, 'Kiln'), 'Kiln of 12');
  assert.ok(k.create('items', { what: 'Glaze', n: 3 }, { actor: 'p_1' }).ok);
  await k.drain();
  assert.equal(noteOf(sql, 'Glaze'), 'Glaze of 15', 'the figure is read when the step is taken, over the rows as they are then');
});

/* ON A CLOCK, WHICH WRITES NO ROW. First written as a note on each new Items row, which a figure over Spent is not
   written into since 24 September (`figure-install-warning.test.ts`): install refused it. What is measured is the
   money's spelling and the hyphen, which a notify fills exactly as it fills a note. */
test('A MONEY FIGURE IS WRITTEN IN ITS CURRENCY AS A MONEY FIELD IS, and an id with a hyphen is read', async () => {
  const { k, sql, clock } = await record(rule({ rule: 'cash', on: { every: '15m' }, steps: [{ notify: { say: 'cash {{metric.cash-now}} and {{ metric.total }}' } }] }));
  assert.ok(k.create('spent', { what: 'Rent', amount: { amount: 123450, currency: 'GBP' } }, { actor: 'p_1' }).ok);
  assert.ok(k.create('items', { what: 'Kiln', n: 2 }, { actor: 'p_1' }).ok);
  clock.advance(15 * MIN);
  await k.drain();
  assert.deepEqual(notes(sql, 'rule:cash'), ['cash GBP 1,234.50 and 2'], JSON.stringify(runs(sql, 'cash')));
});

test('AN if AND A notify READ IT WITH NO EXTRA STEP, on a clock that has no row', async () => {
  const { k, sql, clock } = await record(
    rule({
      rule: 'watch',
      on: { every: '15m' },
      steps: [
        { set_var: { name: 'seen', to: '7' } },
        { if: 'seen is {{metric.total}}', then: [{ notify: { say: 'Items add up to {{metric.total}}.' } }], else: [{ notify: { say: 'The condition read the braces.' } }] },
      ],
    }),
  );
  assert.ok(k.create('items', { what: 'Kiln', n: 7 }, { actor: 'p_1' }).ok);
  clock.advance(15 * MIN);
  await k.drain();
  assert.deepEqual(runs(sql, 'watch').map((r) => r.state), ['done'], JSON.stringify(runs(sql, 'watch')));
  assert.deepEqual(notes(sql, 'rule:watch'), ['Items add up to 7.']);
});

/* INTO A ROW OF KEYS, THE LIST THE FIGURE COUNTS. First written into each new Items row, which install refuses since 24
   September (`figure-install-warning.test.ts`); a note on Keys is read only by whoever reads Keys, who reads the count
   already, and what is measured is still that the secret list's aggregate is not taken for a copy of the secret. */
test('A FIGURE OVER A LIST WITH A SECRET IS ITS AGGREGATE: the count goes into a note and the step is not refused as a copy', async () => {
  const { k, sql } = await record(
    rule({ rule: 'count', on: { written: { register: 'keys', op: ['create'] } }, steps: [{ set_var: { name: 'c', to: '{{metric.held}}' } }, { set: { field: 'note', to: '{{vars.c}} keys' } }] }),
  );
  /* THE SECRET IS PUT IN BY SQL, as `flow-secret-verbs.test.ts` puts it: a secret field written through the record holds
     a vault grant's id, and a plaintext is the plainest way to see that it went nowhere. */
  assert.ok(k.create('keys', { what: 'Bank' }, { actor: 'p_1' }).ok);
  sql.exec("UPDATE entry SET fields = json_set(fields, '$.pin', 'hunter2') WHERE register = 'keys'");
  await k.drain();
  assert.ok(k.create('keys', { what: 'Door' }, { actor: 'p_1' }).ok);
  await k.drain();
  assert.deepEqual(runs(sql, 'count'), [{ state: 'done', say: null }, { state: 'done', say: null }]);
  const door = sql.one<{ fields: string }>("SELECT fields FROM entry WHERE register = 'keys' AND json_extract(fields, '$.what') = 'Door'")!;
  assert.equal((JSON.parse(door.fields) as { note?: unknown }).note, '2 keys');
});

test('A FIGURE THE RECORD DOES NOT HOLD, stored past the lint, is written as the dash a missing field is', async () => {
  const { k, sql } = await record(rule({ rule: 'gone', on: onItems, steps: [{ set: { field: 'note', to: 'x {{metric.total}}' } }] }));
  sql.exec("UPDATE declaration SET retired = 1 WHERE id = 'metric.total'");
  assert.ok(k.create('items', { what: 'Kiln', n: 1 }, { actor: 'p_1' }).ok);
  await k.drain();
  assert.equal(noteOf(sql, 'Kiln'), 'x —');
});

/* ── the lint, as a function, and the one line that puts it at install ───── */

const known = new Map([ITEMS, TOTAL, CASH].map((d) => [d.id, d.body as Record<string, never>]));

test('THE LINT REFUSES A FIGURE NO INSTALLED METRIC IS, the colon spelling, and a figure on the inline path', () => {
  const unknown = figureFault('rule.a', { on: onItems, steps: [{ set: { field: 'note', to: 'x {{metric.nope}}' } }] }, 'run', known);
  assert.equal(unknown?.code, 'DECLARATION_UNKNOWN');
  assert.equal(unknown?.at, 'steps[0].set.to');
  assert.deepEqual(unknown?.allowed, ['cash-now', 'total']);

  const nested = figureFault('rule.a', { on: onItems, steps: [{ if: 'n is 1', then: [{ notify: { say: '{{metric.nope}}' } }] }] }, 'run', known);
  assert.equal(nested?.at, 'steps[0].then[0].notify.say');

  const colon = figureFault('rule.a', { on: onItems, steps: [{ set: { field: 'note', to: 'x {{metric:total}}' } }] }, 'run', known);
  assert.equal(colon?.code, 'DECLARATION_INVALID');
  assert.match(colon!.fix, /\{\{metric\.total\}\}/);

  const inline = figureFault('rule.a', { register: 'items', then: [{ set: { field: 'note', to: 'x {{metric.total}}' } }] }, 'inline', known);
  assert.equal(inline?.code, 'NOT_IN_THIS_BUILD');

  assert.equal(figureFault('rule.a', { on: { every: '15m' }, steps: [{ notify: { say: '{{metric.cash-now}} {{ metric.total }}' } }] }, 'run', known), null);
  assert.equal(figureFault('rule.a', { on: onItems, steps: [{ set: { field: 'note', to: '{{metric.nope}}' } }] }, 'run'), null, 'with nothing installed to read, only the spelling is checked');
});

/* WHAT THE THREE BELOW MEASURED BEFORE `flowFault` ASKED THE LINT, on 24 September: all three were `null` and the
   record took each rule. `{{metric.nope}}` then wrote `x —` into the row, the colon wrote the dash as well, and the
   inline rule wrote `x {{metric.total}}` as typed, since the inline pass fills no figure. */

test('INSTALL REFUSES A RULE NAMING {{metric.nope}} rather than writing the braces', async () => {
  const body = { rule: 'a', on: onItems, steps: [{ set: { field: 'note', to: 'x {{metric.nope}}' } }] };
  const said = validateDeclaration(rule(body), known);
  assert.equal(said?.code, 'DECLARATION_UNKNOWN');
  assert.equal(said?.at, 'steps[0].set.to');
  assert.deepEqual(said?.allowed, ['cash-now', 'total']);

  /* THROUGH THE RECORD AS WELL AS THE FUNCTION, since install is what hands the lint the figures it knows. */
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([ITEMS, SPENT, KEYS, TOTAL, CASH, HELD])).ok);
  const refused = await k.install([rule(body)]);
  assert.equal(refused.ok, false, 'a rule naming a figure the record does not hold is not installed');
  assert.match(why(refused), /DECLARATION_UNKNOWN: rule\.a reads \{\{metric\.nope\}\}/);
});

test('INSTALL REFUSES THE COLON SPELLING on a run and ANY FIGURE on the inline path', () => {
  const colon = validateDeclaration(rule({ rule: 'a', on: onItems, once_per: ['entry'], steps: [{ notify: { say: 'x {{metric:total}}' } }] }), known);
  assert.equal(colon?.code, 'DECLARATION_INVALID');
  assert.equal(colon?.at, 'steps[0].notify.say');

  /* A SPACE AROUND THE DOT IS A SPELLING THE FILL DOES NOT READ. The lint took `{{ metric . total }}` as `total` and
     let it install, and the run wrote `x {{ metric . total }}` into the row as typed: measured by the checker on 24
     September. */
  const spaced = validateDeclaration(rule({ rule: 'a', on: onItems, steps: [{ set: { field: 'note', to: 'x {{ metric . total }}' } }] }), known);
  assert.equal(spaced?.code, 'DECLARATION_INVALID');
  assert.equal(spaced?.at, 'steps[0].set.to');

  const inline = validateDeclaration(rule({ rule: 'a', register: 'items', then: [{ set: { field: 'note', to: 'x {{metric.total}}' } }] }), known);
  assert.equal(inline?.code, 'NOT_IN_THIS_BUILD');
  assert.equal(inline?.at, 'then[0].set.to');
});

test('A FIGURE THE RECORD HOLDS STILL INSTALLS, in a step, in a nested arm and in a condition', () => {
  const said = validateDeclaration(
    rule({
      rule: 'a',
      once_per: ['entry'],
      on: onItems,
      steps: [
        { set: { field: 'note', to: '{{metric.total}} {{ metric.total }}' } },
        { if: 'n is {{metric.total}}', then: [{ notify: { say: 'all {{metric.total}}' } }] },
      ],
    }),
    known,
  );
  assert.equal(said, null, JSON.stringify(said));
});
