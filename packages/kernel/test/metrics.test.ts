/**
 * A metric: one number the record computes, over the same rows a list of the same predicate reads.
 *
 * THE FIGURE AND THE LINK AGREE OR THE TILE IS A LIE. That is what compiling the predicate with the
 * same function `list` uses buys: two definitions of "overdue" agree until somebody edits one, and
 * then a tile says two and the page it opens shows four, and nobody can tell which is wrong.
 *
 * Everything else here is about refusing rather than answering — a target that is the wrong shape, a
 * window that is not a window, an aggregation this build does not read, and a sum of two currencies.
 * A metric that answers anyway is a number on a screen with nothing behind it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fixOf } from '@braindog/ports';

import {
  evaluateMetric,
  deltaFrom,
  fill,
  meets,
  openRecord,
  snapshot,
  targetOf,
  windowMs,
  type Declaration,
  type Kernel,
  type MetricDecl,
  type Reading,
  type Snapshot,
} from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);
const DAY = 86_400_000;

const OBLIGATIONS: Declaration = {
  id: 'register.obligations',
  kind: 'register',
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    state: 'state',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'party', type: 'text', index: true },
      { id: 'direction', type: 'enum', values: ['owed_by_me', 'owed_to_me'], index: true },
      { id: 'amount', type: 'money', index: true },
      { id: 'effort', type: 'duration' },
      { id: 'due', type: 'day', index: true },
      { id: 'state', type: 'enum', values: ['open', 'part', 'paid'], index: true },
    ],
  } as never,
};

const day = (offset: number) => new Date(NOW + offset * DAY).toISOString().slice(0, 10);
const gbp = (amount: number) => ({ amount, currency: 'GBP' });

type Clockish = ReturnType<typeof fixedClock>;

async function record(): Promise<{ k: Kernel; sql: NodeSql; clock: Clockish }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  assert.ok((await k.install([OBLIGATIONS])).ok);

  for (const row of [
    { what: 'Invoice 41', party: 'Halden', direction: 'owed_to_me', amount: gbp(480_000), due: day(-38), state: 'open', effort: 3600 },
    { what: 'Invoice 46', party: 'Ravensworth', direction: 'owed_to_me', amount: gbp(240_000), due: day(-9), state: 'open', effort: 1800 },
    { what: 'Illustration', party: 'Okonkwo', direction: 'owed_by_me', amount: gbp(135_000), due: day(-2), state: 'open' },
    { what: 'Tax', party: 'HMRC', direction: 'owed_by_me', amount: gbp(1_910_000), due: day(4), state: 'open' },
    { what: 'Invoice 38', party: 'Ravensworth', direction: 'owed_to_me', amount: gbp(180_000), due: day(-71), state: 'paid' },
  ])
    assert.ok(k.create('obligations', row, { actor: 'p_1' }).ok);

  return { k, sql, clock };
}

const OVERDUE: MetricDecl = {
  metric: 'overdue',
  name: 'Overdue',
  source: 'register.obligations',
  where: { all: [{ field: 'direction', is: 'owed_to_me' }, { field: 'state', in: ['open', 'part'] }, { field: 'due', before: day(0) }] },
  value: { sum: 'amount' },
  target: { lte: 400_000 },
  window: '30d',
  format: 'money.GBP',
};

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const refusal = (r: unknown) => {
  const x = r as { ok: boolean; refusal: { code: string; fix: string; at?: string; allowed?: readonly string[] } };
  assert.equal(x.ok, false, 'this was supposed to be refused');
  return x.refusal;
};

/* ── the figure ──────────────────────────────────────────────────────────── */

test('THE FIGURE IS THE SUM OF THE ROWS THE SAME PREDICATE LISTS', async () => {
  const { k, sql } = await record();
  const read = value<Reading>(k.metric(OVERDUE));

  const listed = k.list({ register: 'obligations', ...(OVERDUE.where === undefined ? {} : { where: OVERDUE.where }), limit: 100 });
  assert.ok(listed.ok);
  const truth = listed.value.rows.reduce((a, e) => a + (e.fields.amount as { amount: number }).amount, 0);

  assert.equal(read.value, truth, 'the tile and the page it opens disagree');
  assert.equal(read.value, 720_000);
  assert.equal(read.rows, 2);
  assert.equal(read.unit, 'GBP', 'a money figure came back with no currency');
  assert.equal(read.met, false, '720,000 is not under a 400,000 ceiling');
  sql.close();
});

test('A MISTYPED CURRENCY IS REFUSED AT THE WRITE, so the figure over it stays a number', async () => {
  /* `34 §3`: `money = "{" "amount" ":" integer "," "currency" ":" iso4217 "}" ;`
     The write path checked three letters and nothing else, so `GPB` — one transposition away from
     `GBP` — was stored. It is the worst kind of bad row, because it does not break the row, it
     breaks the FIGURE: `sum` cannot add GBP to GPB, no FX rate can ever exist for a currency that
     does not exist, and the reading comes back `value: null`, `unit: null`, `parts: [...]`,
     `met: null`. `met: null` is a target that has silently stopped being evaluated, and nothing on
     the screen says why. Measured before the fix, against this exact register:

       FIGURE BEFORE THE TYPO: {"value":720000,"unit":"GBP","met":false}
       GPB 4200.00 -> accepted
       FIGURE AFTER  THE TYPO: {"value":null,"unit":null,"parts":[…],"met":null} */
  const { k, sql } = await record();

  const wrote = k.create(
    'obligations',
    { what: 'Invoice 52', party: 'Halden', direction: 'owed_to_me', amount: { amount: 420_000, currency: 'GPB' }, due: day(-3), state: 'open' },
    { actor: 'p_1' },
  );
  assert.equal(refusal(wrote).code, 'CURRENCY_UNKNOWN');

  const read = value<Reading>(k.metric(OVERDUE));
  assert.equal(read.value, 720_000, 'one typo turned the figure into null');
  assert.equal(read.unit, 'GBP');
  assert.equal(read.parts, undefined, 'the figure split itself by currency over a currency that does not exist');
  assert.equal(read.met, false, 'met went null, so the target stopped being evaluated');
  sql.close();
});

test('the six aggregations this build reads', async () => {
  const { k, sql } = await record();
  const of = (v: MetricDecl['value']) => value<Reading>(k.metric({ ...OVERDUE, value: v, where: undefined, target: { gte: 0 } }));

  assert.equal(of({ count: 'id' }).value, 5);
  assert.equal(of({ count: 'effort' }).value, 2, 'a count of a field counts the rows that carry it');
  assert.equal(of({ distinct: 'party' }).value, 4);
  assert.equal(of({ sum: 'effort' }).value, 5400);
  assert.equal(of({ avg: 'effort' }).value, 2700);
  assert.equal(of({ min: 'effort' }).value, 1800);
  assert.equal(of({ max: 'effort' }).value, 3600);
  sql.close();
});

test('A SUM OF A DAY, OR A SUM, AVERAGE, MINIMUM OR MAXIMUM OF A WORD, IS REFUSED, not answered as a number', async () => {
  const { k, sql } = await record();
  /* SQLite reads the text `2026-07-28` as 2026 inside sum() and avg(), and `Number('2026-07-28')` is
     NaN after min() and max(), which went out as null beside `met: false` and two rows counted. */
  for (const v of [{ sum: 'due' }, { avg: 'party' }, { sum: 'party' }, { max: 'state' }] as MetricDecl['value'][]) {
    const said = refusal(k.metric({ ...OVERDUE, value: v, where: undefined, target: { gte: 0 }, format: 'int' }));
    assert.equal(said.code, 'VALUE_MALFORMED', JSON.stringify(v));
    assert.equal(said.at, 'value');
  }
  /* A COUNT OR A DISTINCT OF ANY FIELD IS STILL A NUMBER. */
  assert.equal(value<Reading>(k.metric({ ...OVERDUE, value: { distinct: 'due' }, where: undefined, target: { gte: 0 }, format: 'int' })).value, 5);

  /* THE EARLIEST AND THE LATEST DAY ARE DAYS, kept as whole days since 1970: the oldest due date here is day(-71). */
  const earliest = value<Reading>(k.metric({ ...OVERDUE, value: { min: 'due' }, where: undefined, target: { gte: 0 }, format: 'day' }));
  assert.equal(earliest.value, Date.parse(`${day(-71)}T00:00:00Z`) / DAY);
  const latest = value<Reading>(k.metric({ ...OVERDUE, value: { max: 'due' }, where: undefined, target: { gte: 0 }, format: 'day' }));
  assert.equal(latest.value, Date.parse(`${day(4)}T00:00:00Z`) / DAY);

  /* AND THE AVERAGE DAY IS A DAY TOO, as whole days since 1970 averaged, so two averages of days subtract into days. */
  const dues = sql.all<{ d: string }>("SELECT json_extract(fields, '$.due') AS d FROM entry WHERE register = 'obligations' AND deleted_at IS NULL AND json_extract(fields, '$.due') IS NOT NULL");
  const mean = dues.reduce((n, r) => n + Date.parse(`${r.d}T00:00:00Z`) / DAY, 0) / dues.length;
  const average = value<Reading>(k.metric({ ...OVERDUE, value: { avg: 'due' }, where: undefined, target: { gte: 0 }, format: 'day' }));
  assert.ok(Math.abs((average.value ?? 0) - mean) < 1e-6, `${average.value} is not ${mean}`);
  const none = value<Reading>(k.metric({ ...OVERDUE, value: { diff: { of: { avg: 'due' }, per: { avg: 'due' } } }, where: undefined, target: { lte: 0 }, format: 'days' }));
  assert.equal(none.value, 0);

  /* AND AT INSTALL, so the tile never reaches a page. */
  const installed = await k.install([
    { id: 'metric.oldest', kind: 'metric', body: { metric: 'oldest', name: 'Oldest', source: 'register.obligations', value: { sum: 'due' }, format: 'int', target: { gte: 0 }, window: '30d' } } as never,
  ]);
  assert.equal(installed.ok, false, 'a sum of a day installed');
  assert.equal(refusal(installed).code, 'VALUE_MALFORMED');
  sql.close();
});

test('AN AVERAGE OF NOTHING IS NOT ZERO, and a sum of nothing is', async () => {
  // Zero is an answer about the rows; the em dash is an answer about there being none. A tile that
  // says "0 days average" over an empty set is a claim nobody made.
  const { k, sql } = await record();
  const none = { ...OVERDUE, where: { field: 'party', is: 'Nobody' } as never, target: { gte: 0 } };
  assert.equal(value<Reading>(k.metric({ ...none, value: { avg: 'effort' } })).value, null);
  assert.equal(value<Reading>(k.metric({ ...none, value: { min: 'effort' } })).value, null);
  assert.equal(value<Reading>(k.metric({ ...none, value: { sum: 'effort' } })).value, 0);
  assert.equal(value<Reading>(k.metric({ ...none, value: { count: 'id' } })).value, 0);
  sql.close();
});

test('AN EMPTY REGISTER AND AN EMPTY MATCH ARE TWO DIFFERENT ZEROES, and a reading said the same thing about both', async () => {
  /* A tile at zero is either "add your first invoice" or "nothing is overdue", and those are not the
     same sentence. The reading carried no count of what was in scope before the filter, so the two
     came back identical and whichever one the app drew it was guessing. Measured against this seed
     before `held` existed:

       FIVE ROWS HELD, FILTER MATCHED NONE: {"value":0,"unit":null,"rows":0}
       REGISTER NOBODY HAS WRITTEN TO:      {"value":0,"unit":null,"rows":0}

     The guess that goes wrong is the one told to somebody who has just arrived: their empty record
     reads as a record that is up to date. */
  const { k, sql } = await record();
  const counted = { ...OVERDUE, value: { count: 'id' } as MetricDecl['value'], target: { lte: 5 }, format: 'int' };

  const matched = value<Reading>(k.metric({ ...counted, where: { field: 'party', is: 'Nobody' } as never }));
  assert.equal(matched.value, 0);
  assert.equal(matched.rows, 0);
  assert.equal(matched.held, 5, 'the register holds five rows, and the filter matched none of them');

  assert.ok(
    (
      await k.install([
        {
          id: 'register.arrivals',
          kind: 'register',
          body: { id: 'arrivals', name: 'Arrivals', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] },
        } as never,
      ])
    ).ok,
  );
  const empty = value<Reading>(k.metric({ ...counted, source: 'register.arrivals', where: undefined }));
  assert.equal(empty.value, 0);
  assert.equal(empty.rows, 0);
  assert.equal(empty.held, 0, 'nothing has ever been written to this register');
  assert.notEqual(matched.held, empty.held, 'the two zeroes are one zero again, and the app cannot say which it is holding');

  /* AND IT IS THE SCOPE RATHER THAN THE MATCH: the figure the tile draws still counts the rows the
     predicate matched, `held` counts the rows it chose from, and a deleted row is in neither. */
  const overdue = value<Reading>(k.metric(OVERDUE));
  assert.equal(overdue.rows, 2, 'the filter still decides the figure');
  assert.equal(overdue.held, 5);

  sql.exec("UPDATE entry SET deleted_at = ? WHERE register = 'obligations' AND json_extract(fields, '$.what') = 'Tax'", new Date(NOW).toISOString());
  const after = value<Reading>(k.metric(OVERDUE));
  assert.equal(after.rows, 2, 'the deleted row was never one the predicate matched');
  assert.equal(after.held, 4, 'a deleted row is not held by anybody');
  sql.close();
});

test('A PARAMETERISED FIGURE HOLDS ITS PARAMETER, and it held the whole register instead', async () => {
  /* `held` was added so a tile can tell "nothing matched" from "nothing is there", and a project
     page is the screen that needs it most: it is the one most likely to be new and empty. A cell
     reading `party-owed:Fenwick` goes through `fill(decl, null, param)`, which puts the name into
     the predicate, and `held` was a bare `count(*)` over the register. Measured against this seed
     before the repair, with five obligations and nothing at all for Fenwick:

       party-owed:Fenwick   {"rows":0,"held":5}

     Five held and none matched is "nothing is owed by Fenwick", so the tile would have drawn a
     settled account for a party with no invoice in the record. A parameter is not a filter over the
     register, it is WHICH register the figure is about, so the rows it admits are the scope. */
  const { k, sql } = await record();
  const template: MetricDecl = {
    metric: 'party-owed',
    name: 'Owed, one party',
    source: 'register.obligations',
    where: 'state is open or part, party is {{it}}',
    value: { count: 'id' },
    target: { lte: 5 },
    window: '30d',
    compare: 'none',
    format: 'int',
  };
  const read = (param: string) => value<Reading>(k.metric(fill(template, null, param) as MetricDecl));

  const fresh = read('Fenwick');
  assert.equal(fresh.rows, 0, 'Fenwick has no obligations at all');
  assert.equal(fresh.held, 0, 'a party with no rows holds none, and the whole register is not its scope');

  /* AND THE FILTER STILL DECIDES THE FIGURE INSIDE THE PARAMETER'S ROWS. Ravensworth has two
     obligations, one open and one paid, so the two numbers have to differ: `held` is the two the
     parameter admits and `rows` is the one the rest of the predicate kept. */
  const busy = read('Ravensworth');
  assert.equal(busy.rows, 1, 'one of Ravensworth two obligations is still open');
  assert.equal(busy.held, 2, 'the parameter narrows the scope and the rest of the predicate does not');
  assert.notEqual(fresh.held, busy.held, 'the two zeroes are one zero again for a parameterised figure');

  /* A FIGURE WITH NO PARAMETER IS UNCHANGED: its scope is still the register. */
  assert.equal(value<Reading>(k.metric(OVERDUE)).held, 5, 'an unparameterised figure still holds the register');
  sql.close();
});

test('AND THE PARAMETER IS A PROJECT BY NAME, which is the shape every shipped one has', async () => {
  /* The three parameterised figures in the seed (`project-owed`, `project-cost`, `project-open`) all
     say `thing is {{it}}` over a REF, so the name has to be resolved against the register it points
     at before either the figure or its scope can be counted. Both go through one `predicateOf` with
     one `refByTitle`, which is why the clause set aside as `within` cannot resolve to a different
     row than the same clause inside `where` did. Measured here rather than argued: a project with
     one lease reads `held: 1` and a project with none reads `held: 0`, out of three leases. */
  const { k, sql } = await record();
  assert.ok(
    (
      await k.install([
        { id: 'register.things', kind: 'register', body: { id: 'things', name: 'Projects', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } },
        {
          id: 'register.leases',
          kind: 'register',
          body: {
            id: 'leases',
            name: 'Leases',
            title: 'what',
            fields: [
              { id: 'what', type: 'text', required: true },
              { id: 'state', type: 'enum', values: ['live', 'ended'], index: true },
              { id: 'thing', type: 'ref', to: 'things', index: true },
            ],
          },
        },
      ] as never)
    ).ok,
  );
  const kiln = value<{ id: string }>(k.create('things', { name: 'Kiln' }, { actor: 'p_1' }));
  assert.ok(k.create('things', { name: 'Atlantis' }, { actor: 'p_1' }).ok);
  for (const row of [
    { what: 'Studio', state: 'live', thing: kiln.id },
    { what: 'Store', state: 'ended', thing: kiln.id },
    { what: 'Desk', state: 'live' },
  ])
    assert.ok(k.create('leases', row, { actor: 'p_1' }).ok);

  const template: MetricDecl = {
    metric: 'project-leases',
    name: 'Leases, one project',
    source: 'register.leases',
    where: 'state is live, thing is {{it}}',
    value: { count: 'id' },
    target: { lte: 9 },
    window: '30d',
    compare: 'none',
    format: 'int',
  };
  const read = (param: string) => value<Reading>(k.metric(fill(template, null, param) as MetricDecl));

  const kilns = read('Kiln');
  assert.equal(kilns.rows, 1, 'one of Kiln two leases is live');
  assert.equal(kilns.held, 2, 'the ref clause was resolved for the scope as well as for the figure');

  const fresh = read('Atlantis');
  assert.equal(fresh.rows, 0);
  assert.equal(fresh.held, 0, 'a project with no lease holds none of the three in the register');
  sql.close();
});

test('AND A PREDICATE WRITTEN AS JSON NARROWS UNDER AN `all` AND NOWHERE ELSE', async () => {
  /* Every parameterised figure the seed ships writes its `where` as a SENTENCE, so the tree form of
     `scopeOf` had no test behind it at all: both branches of it, the `all` conjunct filter and the
     `any`/`none` refusal to narrow, survived being deleted with all 988 kernel tests still green.
     `declare` reads both forms of a predicate, so a pack may write a parameterised figure as JSON,
     and the two branches decide opposite things.

     UNDER A CONJUNCTION THE PARAMETER IS THE SCOPE, and under a disjunction it is not: a parameter
     inside an `any` widens the rows and one inside a `none` inverts them, so neither cuts out a
     slice to count and `held` stays the register it always was. Narrowing on a disjunct would put
     `held` UNDER `rows`, which is a reading that contradicts itself. */
  const { k, sql } = await record();
  const base = { name: 'Held', source: 'register.obligations', value: { count: 'id' }, target: { lte: 9 }, window: '30d', compare: 'none', format: 'int' } as const;
  const held = (metric: string, where: unknown, param: string) =>
    value<Reading>(k.metric(fill({ ...base, metric, where } as MetricDecl, null, param) as MetricDecl));

  /* Ravensworth holds two of the five obligations and one of them is open. */
  const conjoined = held('by-party', { all: [{ field: 'state', is: 'open' }, { field: 'party', is: '{{it}}' }] }, 'Ravensworth');
  assert.equal(conjoined.rows, 1, 'one of Ravensworth two obligations is open');
  assert.equal(conjoined.held, 2, 'a tree-form parameter narrows the scope to its own rows');

  /* Halden holds one, and one other obligation is paid, so the disjunction matches two of five. */
  const widened = held('paid-or-party', { any: [{ field: 'state', is: 'paid' }, { field: 'party', is: '{{it}}' }] }, 'Halden');
  assert.equal(widened.rows, 2, 'the paid one and Halden own one');
  assert.equal(widened.held, 5, 'a parameter under an `any` is not a scope, so the register is still what is held');

  const inverted = held('not-party', { none: [{ field: 'party', is: '{{it}}' }] }, 'Halden');
  assert.equal(inverted.rows, 4, 'the four obligations that are not Halden own');
  assert.equal(inverted.held, 5, 'a parameter under a `none` is not a scope either');
  for (const r of [conjoined, widened, inverted]) assert.ok(r.held >= r.rows, 'a reading that holds fewer rows than it matched contradicts itself');
  sql.close();
});

test('A `within` WRITTEN INTO A BODY IS REFUSED AT INSTALL, and the field itself is still unguarded', async () => {
  /* `MetricDecl.within` says both halves of this, and it used to say the first half was still to do.
     The guard is `metricBody` in `declare.ts` and it refuses the key by name, so the route the old
     comment measured is shut: the body it described as accepted does not install.

     THE SECOND HALF IS THE PART THAT DID NOT CHANGE, and it is why the comment cannot simply say the
     hole is closed. `evaluateMetric` honours a `within` from whoever hands it one, so the same object
     built here rather than parsed out of a declaration row still answers `rows: 4, held: 1` over this
     seed. Four matched out of one held is a reading that contradicts itself, and `held === 0` is how
     the tiles spell a list nobody has written to, which is the whole reason the install-time refusal
     is worth having. The invariant is at the boundary, not in the type. */
  const { k, sql } = await record();
  const body = {
    metric: 'scoped',
    name: 'Scoped by hand',
    source: 'register.obligations',
    where: 'state is open',
    within: 'party is HMRC',
    value: { count: 'id' },
    target: { lte: 9 },
    window: '30d',
    compare: 'none',
    format: 'int',
  };

  const said = refusal(await k.install([{ id: 'metric.scoped', kind: 'metric', body } as never]));
  assert.equal(said.code, 'DECLARATION_INVALID', 'a body carrying the reader’s own key installed again');
  assert.equal(said.at, 'within');

  const read = value<Reading>(k.metric(body as unknown as MetricDecl));
  assert.equal(read.rows, 4, 'four of the five obligations are open');
  assert.equal(read.held, 1, 'the hand-written scope admits HMRC alone, so the evaluator honoured it');
  assert.ok(read.held < read.rows, 'the evaluator now guards the field, so the comment beside it is stale');

  /* AND THE REFUSAL IS BY NAME RATHER THAN AN UNKNOWN-KEY CHECK, which is the other half the comment
     has to keep saying: a metric body has no such check, so the next key a pack invents is admitted
     exactly as `within` was. Asserted rather than assumed, because "closed by name" and "closed" are
     different sentences and only one of them is true. */
  const { within: _unscoped, ...plain } = body;
  const invented = await k.install([{ id: 'metric.wibbly', kind: 'metric', body: { ...plain, metric: 'wibbly', wibble: 1 } } as never]);
  assert.ok(invented.ok, 'a metric body now refuses a key it does not read, so the comment overstates the hole');
  sql.close();
});

/** The repository root, for the three comments below that make a claim about another file. */
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const source = (...parts: string[]): string => readFileSync(join(REPO, ...parts), 'utf8');

test('THE THREE COMMENTS IN `metrics.ts` THAT NAMED WORK IN ANOTHER FILE SAY WHAT THAT FILE DOES NOW', () => {
  /* THREE OF THEM SAID THE OPPOSITE, and each one went stale the same way: the comment argued for a
     repair, somebody made the repair in the file the comment named, and the sentence describing the
     hole stayed behind as a claim about the present. Two audits found this shape here before this
     one, which makes it a habit rather than an accident, so the pairing is held by a test instead of
     by whoever reads the file next.

     IT IS THE PREMISE THAT IS ASSERTED FIRST, and that is what keeps this from being a spell check. A
     deferral sentence is only false while the other file holds the check; if the check is ever taken
     out, the first assertion of each pair fails and whoever took it out is sent to the comment that
     goes with it. The two move together or the test says so. */
  const mine = source('packages', 'kernel', 'src', 'metrics.ts');

  /* `MetricDecl.within`: `declare.ts` refuses the key, so nothing here may say the closing is still owed. */
  assert.match(source('packages', 'kernel', 'src', 'declare.ts'), /if \(body\.within !== undefined\)/u, 'declare.ts no longer refuses a hand-written within');
  assert.equal(mine.includes('Closing it belongs in `declare.ts`'), false, 'the field still defers a check declare.ts has made');
  assert.equal(mine.includes('a convention rather than an invariant'), false, 'the field still calls the refusal a convention');

  /* `Reading.held`: the record counts held inside the scope a parameter filled, and the browser counts nothing (it
     prints the record's `held`), so what is held here is that `withParam` still writes the scope it cut. */
  const web = source('apps', 'web', 'src', 'lib', 'record', 'metrics.ts');
  assert.match(web, /within: scope\.join/u, 'withParam no longer writes the scope it cut');
  assert.equal(mine.includes('without setting any scope'), false, 'held still says the browser sets no scope');
  assert.equal(mine.includes('nothing measures the half they differ on'), false, 'held still says the parameterised case is unmeasured');

  /* `BARE_UNIT`: the web holds one literal and a re-export, not two literals, and its own test says so. */
  assert.equal(web.includes("BARE = 'no unit'"), false, 'the browser declares the mark again, so three modules hold it');
  assert.match(web, /^export \{ BARE \};$/mu, 'the browser no longer passes on money.ts’s one literal');
  assert.equal(mine.includes('three modules, one string'), false, 'the mark still claims three modules hold it');
});

test('a ratio with a zero denominator is not a number', async () => {
  // Never `0`, never infinity, never `NaN` — the em dash, and the numerator is still behind it.
  const { k, sql } = await record();
  const r = value<Reading>(
    k.metric({
      ...OVERDUE,
      where: undefined,
      value: { ratio: { of: { count: 'id' }, per: { count: 'effort' } } },
      target: { gte: 0 },
    }),
  );
  assert.equal(r.value, 2.5);

  const zero = value<Reading>(
    k.metric({
      ...OVERDUE,
      where: { field: 'party', is: 'Nobody' } as never,
      value: { ratio: { of: { count: 'id' }, per: { count: 'id' } } },
      target: { gte: 0 },
    }),
  );
  assert.equal(zero.value, null);
  sql.close();
});

/* ── two currencies are never added ──────────────────────────────────────── */

test('A SUM ACROSS TWO CURRENCIES IS NOT ADDED: it is one amount per currency, with the rate it lacks named', async () => {
  /* One SUM over a column of amounts is a figure of the right size in whatever unit happened to be
     commonest, in a tile with a code beside it. There is no screen on which anybody notices. So with
     no rate the answer is the parts, and never a refusal that leaves the tile blank either. */
  const { k, sql } = await record();
  assert.ok(
    k.create('obligations', { what: 'Euro one', direction: 'owed_to_me', amount: { amount: 100_000, currency: 'EUR' }, due: day(-1), state: 'open' }, { actor: 'p_1' }).ok,
  );

  const out = value<Reading>(k.metric(OVERDUE));
  assert.equal(out.value, null);
  assert.equal(out.unit, null);
  assert.deepEqual(out.parts, [
    { currency: 'EUR', amount: 100_000 },
    { currency: 'GBP', amount: 720_000 },
  ]);
  /* `into: null` BECAUSE NOBODY HAS CHOSEN A CURRENCY TO ADD UP IN. This line read `into: 'GBP'` for
     as long as the declared format stood in for that choice, which is a currency out of a pack
     written into the answer about somebody's own record. */
  assert.deepEqual(out.fx, { into: null, home: null, asOf: null, forward: false, stale: false, missing: [] });
  assert.equal(out.met, null, 'a verdict on no one number');
  sql.close();
});

test('A RATIO OF TWO DIFFERENT UNITS IS A RATE, and it was refused as a mixed currency', async () => {
  /* Money over a duration is cost per hour, and money over a count is average invoice size. The
     two-halves check refused both: it compared the units of a `ratio` the same way it compares the
     units of a `diff`, so a whole family of ordinary figures could not be declared. Dividing one
     unit by another is the entire point of a rate. */
  const { k, sql } = await record();
  const rate = value<Reading>(
    k.metric({
      ...OVERDUE,
      where: undefined,
      value: { ratio: { of: { sum: 'amount' }, per: { sum: 'effort' } } },
      format: 'decimal',
      target: { gte: 0 },
    } as never),
  );
  assert.equal(typeof rate.value, 'number', 'a rate over two units was refused');
  sql.close();
});

test('A FORMAT THAT CONTRADICTS THE ROWS IS NEVER PRINTED UNDER IT: the rows are said in their own currency', async () => {
  /* `format: money.USD` is a declaration about how to WRITE the figure and the rows are what it is a
     figure OF. This side once checked neither: a sum of sterling invoices declared `money.USD` came
     back as a plain number with `unit: 'GBP'` and no refusal, and the renderers of the day formatted
     from `decl.format`, so it reached a screen as USD 168,794.00 over rows that are in pounds.

     THE FIGURE IS THE POUNDS AND THE READING SAYS SO, which is the repair that survived. It was a
     part for a while, `{"value":null,"parts":[{"currency":"GBP","amount":2945000}]}`, and a part is
     how two currencies are said apart: one of them is not two, and a `null` there costs the delta,
     the verdict and the night's snapshot, which skips a figure whose `value` is `null`. So the sum is
     a number in the currency the rows are in, `unit` carries that currency, and the tile writes the
     figure from `unit` rather than from the format when they differ
     (`apps/web/src/lib/record/metrics.ts:1106`). The contradiction is still never printed; it is the
     format that loses, not the figure. */
  const { k, sql } = await record();
  const out = value<Reading>(k.metric({ ...OVERDUE, where: undefined, value: { sum: 'amount' }, format: 'money.USD', target: { lte: 99_999_999 } } as never));
  assert.equal(out.value, 2_945_000, 'a sterling sum read under a dollar format lost its number');
  assert.equal(out.unit, 'GBP', 'the reading does not say which currency the figure is in');
  assert.equal(out.parts, undefined, 'one currency was said as parts, which is the shape for two');
  assert.equal(out.met, null, 'a dollar ceiling over a sterling figure, with no rate, is no verdict');

  const avg = value<Reading>(k.metric({ ...OVERDUE, where: undefined, value: { avg: 'amount' }, format: 'money.USD', target: { lte: 99_999_999 } } as never));
  assert.equal(avg.value, 2_945_000 / 5, 'a sterling average was read under a dollar format');
  assert.equal(avg.unit, 'GBP');
  void fixOf;

  /* AND THE FORMAT THAT AGREES IS UNTOUCHED, so the check is about a contradiction rather than
     about declaring a currency at all. */
  const fine = value<Reading>(k.metric({ ...OVERDUE, where: undefined, value: { sum: 'amount' }, format: 'money.GBP', target: { lte: 99_999_999 } } as never));
  assert.equal(fine.value, 2_945_000);
  assert.equal(fine.fx, undefined);
  sql.close();
});

/* ── a currency nobody chose ─────────────────────────────────────────────── */

/**
 * THE DIRECTIONS A MONEY FIGURE CAN GO WHEN THE RECORD IS NOT IN THE CURRENCY THE FIGURE DECLARES,
 * and the reason they are one block of tests: the currency a figure is added up in is decided in this
 * file, once, and each direction is that decision seen from a different record.
 *
 * WHAT WAS THERE BEFORE: `into: held.home ?? declared`. With no home currency chosen, the currency a
 * pack happened to declare became the currency the figure was added up in, so a record holding one
 * currency and no sterling read its own money as a foreign part: measured on the record below,
 *
 *     one currency, declared GBP   {"value":null,"unit":null,"parts":[{"currency":"EGP","amount":5818554}],"fx":{"into":"GBP","home":null}}
 *     two currencies, declared GBP {"value":null,"unit":null,"parts":[…],"fx":{"into":"GBP","home":null}}
 *
 * `into: "GBP"` on a record with no sterling in it and no sterling asked for is the label nobody
 * chose, and it is published to every reader of the reading, the agent tools included.
 */
const ABROAD: readonly Record<string, unknown>[] = [
  { what: 'Cairo rent', party: 'Landlord', direction: 'owed_by_me', amount: { amount: 5_200_000, currency: 'EGP' }, due: day(4), state: 'open' },
  { what: 'Cairo power', party: 'Utility', direction: 'owed_by_me', amount: { amount: 618_554, currency: 'EGP' }, due: day(9), state: 'open' },
];

/** The register of dated rates a pack declares (`08 §2.5`), so a home currency has something to convert with. */
const FX: Declaration = {
  id: 'register.fx',
  kind: 'register',
  body: {
    id: 'fx',
    name: 'Rates',
    title: 'currency',
    fields: [
      { id: 'currency', type: 'text', required: true },
      { id: 'base', type: 'text', required: true },
      { id: 'rate', type: 'decimal', required: true },
      { id: 'as_of', type: 'day', index: true, required: true },
    ],
  } as never,
};

/** A record in pounds Egyptian, with the rates register installed and a pack that can hold a home currency. */
async function abroad(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([OBLIGATIONS, FX])).ok);
  for (const row of ABROAD) assert.ok(k.create('obligations', row, { actor: 'p_1' }).ok);
  k.rememberPack({
    id: 'money-core',
    version: '1.0.0',
    source: 'local',
    ref: null,
    manifest: JSON.stringify({ pack: 'money-core', version: '1.0.0', config: { home_currency: { type: 'text' } } }),
    checksum: 'not-a-real-checksum',
  });
  return { k, sql };
}

/** The dollar bill that makes this record hold two currencies, and the party a grouping cuts it by. */
const MERCURY = { what: 'Mercury', party: 'Bank', direction: 'owed_by_me', amount: { amount: 340_000, currency: 'USD' }, due: day(2), state: 'open' };

/** The same declaration every direction below reads, in the currency this record does not hold. */
const OWED = { ...OVERDUE, metric: 'owed-abroad', where: undefined, value: { sum: 'amount' }, format: 'money.GBP', target: { lte: 400_000 } };

test('ONE CURRENCY AND NO HOME CURRENCY IS A FIGURE IN THAT CURRENCY, not a part of a sum nobody asked for', async () => {
  /* A record with a single currency has nothing to add across. It read `value: null` because the
     figure was being added up in the currency its format declares, and 5,818,554 piastres are not
     sterling, so the one currency came back as one part. Nothing on the screen was wrong and
     everything behind it was: no delta, no verdict, and no row in `snapshots`, because the night
     skips a figure whose `value` is `null` (`packages/kernel/src/index.ts:3538`), so the Ledger's
     night-by-night history never starts on a record whose one currency is not the pack's. */
  const { k, sql } = await abroad();
  const out = value<Reading>(k.metric(OWED as never));
  assert.equal(out.value, 5_818_554, 'a record in one currency has no number for its own money');
  assert.equal(out.unit, 'EGP', 'the figure is not said in the currency its rows are in');
  assert.equal(out.rows, 2);
  assert.equal(out.parts, undefined, 'one currency was split into parts, and parts are for two');
  assert.equal(out.fx, undefined, 'nothing was converted and nothing was left unconverted, so there is nothing to say');
  /* AND THE TARGET, WHICH IS IN THE DECLARED CURRENCY, HAS NO VERDICT RATHER THAN A WRONG ONE: there
     is no rate from sterling here, so there is nothing to carry a sterling ceiling into pounds. */
  assert.equal(out.met, null, 'a sterling ceiling was applied to a figure in pounds Egyptian');
  assert.equal(out.targetIn, undefined);
  sql.close();
});

test('TWO CURRENCIES AND NO HOME CURRENCY ARE STILL PARTS, and the reading no longer names a currency nobody chose', async () => {
  /* The parts were always right. What was wrong was `into`, which said GBP over a record holding
     pounds Egyptian and dollars: a reader of the reading was told the figure was being added up in
     sterling, and the only thing sterling about it was a line in a pack. `into` now says what it
     means, the currency somebody chose to add up in, and nobody chose one here. */
  const { k, sql } = await abroad();
  assert.ok(k.create('obligations', MERCURY, { actor: 'p_1' }).ok);

  const out = value<Reading>(k.metric(OWED as never));
  assert.equal(out.value, null, 'two currencies were added together');
  assert.deepEqual(out.parts, [
    { currency: 'EGP', amount: 5_818_554 },
    { currency: 'USD', amount: 340_000 },
  ]);
  assert.deepEqual(out.fx, { into: null, home: null, asOf: null, forward: false, stale: false, missing: [] });
  assert.deepEqual(out.fx?.missing, [], 'no home currency was chosen, so no rate is what is missing');
  sql.close();
});

test('AND EVERY GROUP OF THAT FIGURE IS SAID IN ITS OWN CURRENCY, never as a bare number beside another currency’s', async () => {
  /**
   * THE HOLE THE LINE ABOVE OPENED, AND IT IS A CHART RATHER THAN A LABEL. `inParts` wraps a group's
   * number into a one-currency part so that no bar is drawn as a bare number beside a bar in another
   * currency, and it fired only when some group ALREADY held parts. A group holds parts when its own
   * rows are in two currencies, and with `into` no longer falling back to the declared format, no
   * group on a record with no home currency comes back in parts at all: each party here is in one
   * currency, so `across` answers `one`. Measured on these three obligations, grouped by party:
   *
   *     [{"key":"Landlord","value":5200000},{"key":"Utility","value":618554},{"key":"Bank","value":340000}]
   *
   * The tile above it refuses to add two currencies and the bars under it added them anyway:
   * `largestFirst` ranked E£52,000.00 above $3,400.00 on the raw minor units, with no currency drawn
   * anywhere on the chart. So the question `inParts` asks is now the one the `units` map can answer,
   * how many currencies the groups hold BETWEEN them.
   */
  const { k, sql } = await abroad();
  assert.ok(k.create('obligations', MERCURY, { actor: 'p_1' }).ok);

  const out = value<Reading>(k.metric({ ...OWED, group_by: 'party' } as never));
  assert.deepEqual(out.groups, [
    { key: 'Bank', value: null, rows: 1, state: 'full', parts: [{ currency: 'USD', amount: 340_000 }] },
    { key: 'Landlord', value: null, rows: 1, state: 'full', parts: [{ currency: 'EGP', amount: 5_200_000 }] },
    { key: 'Utility', value: null, rows: 1, state: 'full', parts: [{ currency: 'EGP', amount: 618_554 }] },
  ]);
  /* AND ONE CURRENCY IS LEFT ALONE, because a chart of one currency is a chart of numbers with a
     code above it and wrapping those would cost every grouped money figure its bars. */
  const home = value<Reading>(k.metric({ ...OWED, where: 'party is not Bank', group_by: 'party' } as never));
  assert.deepEqual(home.groups, [
    { key: 'Landlord', value: 5_200_000, rows: 1, state: 'full' },
    { key: 'Utility', value: 618_554, rows: 1, state: 'full' },
  ]);
  sql.close();
});

test('A HOME CURRENCY THE ROWS DO NOT HOLD IS STILL THE ONE THEY ARE ADDED UP IN, and the declared one is not', async () => {
  /* THIS IS THE DIRECTION THAT MAKES IT A KERNEL DECISION RATHER THAN A SEED ONE. A pack cannot know
     what a record holds, and this record holds neither the currency the figure declares nor the one
     it is read in: pounds Egyptian and dollars, added up in sterling because that is what was chosen
     on Money's settings. The home currency decides, the declaration does not, and the declaration is
     left to say what the target is in. */
  const { k, sql } = await abroad();
  assert.ok(k.create('obligations', MERCURY, { actor: 'p_1' }).ok);
  for (const r of [
    { currency: 'EGP', base: 'GBP', rate: 0.0155, as_of: day(0) },
    { currency: 'USD', base: 'GBP', rate: 0.74, as_of: day(0) },
  ])
    assert.ok(k.create('fx', r, { actor: 'p_1' }).ok);
  assert.ok(k.setPackConfig('money-core', { home_currency: 'GBP' }, { actor: 'p_1' }).ok);

  /* Declared in pounds Egyptian, so the format and the home currency disagree and the home currency wins. */
  const out = value<Reading>(k.metric({ ...OWED, format: 'money.EGP', target: { lte: 6_000_000 } } as never));
  assert.equal(out.unit, 'GBP', 'the currency chosen on the settings is not the one the figure came back in');
  /* 5,818,554 piastres at 0.0155 is 90,188 pence, and 340,000 cents at 0.74 is 251,600. */
  assert.equal(out.value, 90_188 + 251_600);
  assert.deepEqual(out.fx, {
    into: 'GBP',
    home: 'GBP',
    asOf: day(0),
    forward: false,
    stale: false,
    pairs: [
      { from: 'EGP', rate: 0.0155 },
      { from: 'USD', rate: 0.74 },
    ],
    missing: [],
  });
  /* AND THE TARGET COMES WITH IT: it is in the declared currency, so it is converted at the latest rate. */
  assert.equal(out.targetIn?.currency, 'GBP');
  assert.equal(out.met, false, 'a ceiling of E£60,000.00 is £930.00, and the figure is £3,417.88');
  sql.close();
});

test('A DIFF WHOSE OTHER HALF READ NOTHING IS THE FIRST HALF, and it refused MIXED_CURRENCY', async () => {
  /* A sum over no rows is zero, and its unit is `null` because there was nothing to take a unit
     from. `'GBP' !== null` is true, so `sum(received) - sum(paid)` refused on any record that had
     received money and not yet paid any: the tile read "one half of this figure is in GBP and the
     other in no unit" and repaired itself the day somebody entered a bill. A money tile that is
     broken only while a register is young is broken for exactly the people who have just arrived. */
  const { k, sql } = await record();
  const net = value<Reading>(
    k.metric({
      ...OVERDUE,
      where: undefined,
      value: {
        diff: {
          of: { sum: 'amount', where: 'direction is owed_to_me' },
          per: { sum: 'amount', where: 'party is Nobody At All' },
        },
      },
      format: 'money',
      target: { gte: 0 },
    } as never),
  );
  assert.equal(typeof net.value, 'number', 'a diff against a half that read nothing was refused');
  assert.equal(net.unit, 'GBP', 'the answer lost the currency the half that read something was in');
  sql.close();
});

test('AND A RATIO OF TWO CURRENCIES IS ONE RATIO PER CURRENCY, never one number', async () => {
  /* `04 §5` names this one and names it narrowly: "a `ratio` of two different CURRENCIES", with the
     repair "revenue is USD, spend is EGP. Name an fx source, or scope the predicate to one
     currency". GBP over USD is a number with no meaning; GBP over hours is a rate. Both arms of
     this check used to say `MIXED_CURRENCY`, so an agent branching on it could not tell a division
     of two currencies from a sum across three. */
  const { k, sql } = await record();
  assert.ok(
    k.create('obligations', { what: 'Euro one', direction: 'owed_to_me', amount: { amount: 100_000, currency: 'EUR' }, due: day(-1), state: 'open' }, { actor: 'p_1' }).ok,
  );
  const out = value<Reading>(
    k.metric({
      ...OVERDUE,
      where: undefined,
      value: { ratio: { of: { sum: 'amount', where: 'direction is owed_to_me' }, per: { sum: 'amount', where: 'direction is owed_by_me' } } },
      format: 'decimal',
      target: { gte: 0 },
    } as never),
  );
  /* With no rate the rows in each currency are divided among themselves, so the answer is a ratio in euros and one in
     pounds, and never the two added (`fx.ts` `pairParts`). */
  assert.equal(out.value, null);
  assert.deepEqual(out.parts?.map((p) => p.currency), ['EUR', 'GBP']);
  void refusal;
  sql.close();
});

test('and a count across two is fine, because a count is not a sum', async () => {
  const { k, sql } = await record();
  assert.ok(
    k.create('obligations', { what: 'Euro one', direction: 'owed_to_me', amount: { amount: 100_000, currency: 'EUR' }, due: day(-1), state: 'open' }, { actor: 'p_1' }).ok,
  );
  assert.equal(value<Reading>(k.metric({ ...OVERDUE, value: { count: 'amount' } })).value, 3);
  sql.close();
});

/* ── and the word for what two of them are ───────────────────────────────── */

/**
 * A register of quantities and nothing else, so a mixed-unit refusal can be read where NEITHER half
 * is money.
 *
 * SEPARATE FROM `OBLIGATIONS` BECAUSE THAT ONE IS COUNTED. Five tests above assert `rows`, `value`
 * and `met` over its five rows, so a sixth field or a sixth row there is a change to their
 * arithmetic and not to this one's.
 */
const MEASURES: Declaration = {
  id: 'register.measures',
  kind: 'register',
  body: {
    id: 'measures',
    name: 'Measures',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'spent', type: 'quantity' },
      { id: 'weighed', type: 'quantity' },
    ],
  } as never,
};

const MEASURED: MetricDecl = {
  metric: 'measured',
  name: 'Measured',
  source: 'register.measures',
  value: { sum: 'spent' },
  target: { gte: 0 },
  window: '30d',
  format: 'decimal',
};

/**
 * TWO QUANTITY FIELDS RATHER THAN ONE FIELD AND A PREDICATE PER HALF, and that is not a style
 * choice. `one()` reads `Object.entries(agg)[0]`, so a `where` written on a half of a `diff` or a
 * `ratio` never reaches SQL: both halves then read the same rows, the mixed-unit refusal fires
 * INSIDE a half, and the two-halves check below it is never reached. The first shape of this test
 * used one `size` field and a `where` per half, and it came back `QUANTITY_MIXED_UNIT` from the sum
 * rather than the `diff` sentence it was written about. Two fields is the shape that reaches the
 * check.
 */
async function measured(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([MEASURES])).ok);
  for (const row of [
    { what: 'Editing', spent: { value: 3, unit: 'h' }, weighed: { value: 5, unit: 'kg' } },
    { what: 'Binding', spent: { value: 2, unit: 'h' }, weighed: { value: 1, unit: 'kg' } },
  ])
    assert.ok(k.create('measures', row, { actor: 'p_1' }).ok);
  return { k, sql };
}

test('SUBTRACTING KILOGRAMS FROM HOURS IS NOT TWO CURRENCIES, and the refusal said it was', async () => {
  /* The check is right to refuse — `h − kg` is not a quantity that exists — and the SENTENCE it
     refuses with named the wrong thing entirely. Driven against the code before this test, over the
     two rows below:

       MIXED_CURRENCY  one half of this figure is in h and the other in kg, and two currencies are
                       never subtracted either

     Nothing in that record is money. `04 §5` gives the unit case its own row and the `added` arm
     already splits on it, so the `diff` arm was the one place a person measuring in hours was sent
     looking for a currency. */
  const { k, sql } = await measured();
  const out = refusal(
    k.metric({ ...MEASURED, value: { diff: { of: { sum: 'spent' }, per: { sum: 'weighed' } } } } as never),
  );
  assert.equal(out.code, 'MIXED_CURRENCY');
  assert.equal(out.fix, 'one half of this figure is in h and the other in kg, and two units are never subtracted either');
  sql.close();
});

test('and a sum across two units says units, which is the arm that already did', async () => {
  /* The neighbour that was right, kept beside the one that was wrong so a repair cannot swap them.
     One `quantity` field holding two units, which is what the `added` arm is for. */
  const { k, sql } = await measured();
  sql.exec(`UPDATE entry SET fields = json_set(fields, '$.spent', json('{"value":4,"unit":"d"}')) WHERE json_extract(fields, '$.what') = 'Binding'`);
  const out = refusal(k.metric(MEASURED));
  assert.equal(out.code, 'QUANTITY_MIXED_UNIT');
  assert.equal(out.fix, 'these rows are in d and h, and two units are never added');
  sql.close();
});

test('TWO UNITS SPELLED LIKE CURRENCY CODES ARE STILL UNITS, because the declaration knows what the regex cannot', async () => {
  /* THE `money` ARGUMENT OF `mixedUnits` WAS THE ONE PART OF IT NOTHING DROVE. Deleting it, so that
     the word came from `units.every(isCurrencyUnit)` alone, left all fifty-two tests in this file
     green, and the paragraph above the function claims a behaviour on its own word. With it deleted
     this test reads

       QUANTITY_MIXED_UNIT  these rows are in KGS and LBS, and two currencies are never added

     over a register that holds no money anywhere. `KGS` and `LBS` are three upper-case letters and
     are not ISO 4217, so the regex is wrong about them and the field's declared type is not: a
     `quantity` column is never currencies however its units happen to be spelled. */
  const { k, sql } = await measured();
  sql.exec(`UPDATE entry SET fields = json_set(fields, '$.spent', json('{"value":3,"unit":"LBS"}')) WHERE json_extract(fields, '$.what') = 'Editing'`);
  sql.exec(`UPDATE entry SET fields = json_set(fields, '$.spent', json('{"value":4,"unit":"KGS"}')) WHERE json_extract(fields, '$.what') = 'Binding'`);
  const out = refusal(k.metric(MEASURED));
  assert.equal(out.code, 'QUANTITY_MIXED_UNIT');
  assert.equal(out.fix, 'these rows are in KGS and LBS, and two units are never added');
  sql.close();
});

test('A MONEY COLUMN WITH A ROW THAT CARRIES NO CURRENCY SAYS UNITS TOO, because one of the two is not a currency', async () => {
  /* WRITTEN WITH SQL AND NOT WITH `create`, and that is the finding as much as the wording is.
     `coerce.ts` refuses `{ amount: 250 }` — *"currency takes a three-letter code, and every money
     value carries its own"* — so no caller of this record can put a unitless row in a money column,
     and the `?? 'no unit'` in the refusal below cannot be reached through the write path at all.
     What reaches it is JSON that was already in the column: a field that was `decimal` when the row
     was written, or an import that went in under an older build. The browser's sample register is
     the live instance of that, because it is typed in rather than coerced, and its own
     `mixedFix` has said *"units"* about this set since `adf59786` while this said *"currencies"* —
     one set of rows, two sentences, and this is the copy a paying customer reads.

     Driven against the code before this test:

       MIXED_CURRENCY  these rows are in GBP and no unit, and two currencies are never added

     One currency named and two claimed. */
  const { k, sql } = await record();
  sql.exec(`UPDATE entry SET fields = json_set(fields, '$.amount', json('{"amount":250}')) WHERE json_extract(fields, '$.what') = 'Tax'`);

  const out = refusal(k.metric({ ...OVERDUE, where: undefined, value: { sum: 'amount' }, format: 'decimal' } as never));
  assert.equal(out.code, 'MIXED_CURRENCY', 'a money column is still refused under the money code, whatever the sentence calls the set');
  assert.equal(out.fix, 'these rows are in GBP and no unit, and two units are never added');
  sql.close();
});

test('A MONEY FORMAT OVER ROWS THAT ARE NOT MONEY IS STILL REFUSED, and it is the only disagreement left', async () => {
  /* THE ARM THAT SURVIVED THE FALLBACK, AND IT IS THE ONE WORTH KEEPING. A figure in a currency the
     format does not name is written in its own currency and is a fact; a figure in HOURS under
     `money.GBP` cannot be written at all, because there is no amount of sterling that is three
     hours. The condition used to reach this by accident: the declared currency stood in for the
     currency to add up in, and `'GBP' !== 'h'` happened to be true. So it now asks what it means, is
     this a figure of money, and this test is why the narrowing did not take the branch with it. */
  const { k, sql } = await measured();
  const out = refusal(k.metric({ ...MEASURED, format: 'money.GBP' } as never));
  assert.equal(out.code, 'MIXED_CURRENCY');
  assert.equal(out.fix, 'measured: the rows are in h and the format says GBP.');
  assert.deepEqual(out.allowed, ['h']);
  assert.equal(out.at, 'format');
  sql.close();
});

test('AND A UNIT SPELLED LIKE A CURRENCY CODE IS STILL NOT MONEY, which is why the declaration is asked and not the spelling', async () => {
  /* `isCurrencyUnit` IS THREE UPPER-CASE LETTERS AND CANNOT DO THIS JOB, which this file says in its
     own words one function away: `mixedUnits` takes `money = false` from the quantity arm precisely so
     that `KGS` against `LBS` stay units, because the regex is wrong about them and the declaration is
     not. The first repair of the check above tested `!isCurrencyUnit(unit)`, and driven over the two
     rows below it answered

         {"value":7,"unit":"KGS","rows":2}

     a weight read as money, with no refusal, where the same rows in `h` refused. The type of the
     field the figure aggregates is in scope in `evaluateMetric`, and it is the only thing that knows. */
  const { k, sql } = await measured();
  sql.exec(`UPDATE entry SET fields = json_set(fields, '$.spent', json('{"value":3,"unit":"KGS"}')) WHERE json_extract(fields, '$.what') = 'Editing'`);
  sql.exec(`UPDATE entry SET fields = json_set(fields, '$.spent', json('{"value":4,"unit":"KGS"}')) WHERE json_extract(fields, '$.what') = 'Binding'`);
  const out = refusal(k.metric({ ...MEASURED, format: 'money.GBP' } as never));
  assert.equal(out.code, 'MIXED_CURRENCY');
  assert.equal(out.fix, 'measured: the rows are in KGS and the format says GBP.');
  /* AND THE SAME ROWS UNDER THE FORMAT THAT FITS THEM ARE A FIGURE, so what is refused is the money
     declaration and never the quantity. */
  const fine = value<Reading>(k.metric(MEASURED));
  assert.equal(fine.value, 7);
  assert.equal(fine.unit, 'KGS');
  sql.close();
});

/* ── the two required fields ─────────────────────────────────────────────── */

test('A NUMBER WITH NO TARGET IS DECORATION, and one with no window cannot be acted on', async () => {
  // `08` §2.2 in bold, and it says every dashboard product makes them optional. Both are refused.
  const { k, sql } = await record();
  assert.equal(refusal(k.metric({ ...OVERDUE, target: undefined })).at, 'target');
  assert.equal(refusal(k.metric({ ...OVERDUE, window: undefined })).at, 'window');
  assert.equal(refusal(k.metric({ ...OVERDUE, window: 'a month' })).at, 'window');
  sql.close();
});

test('and a target of the wrong SHAPE is refused too, which is the one that renders as NaN', async () => {
  /* `docs/08` writes `target: { lte: { amount, currency } }` three times. An object compared with
     `<=` is neither true nor false: it printed `target ≤ GBP NaN` under a warn glyph, with no
     refusal at all — the exact class this file exists to prevent, in the file that prevents it. */
  const { k, sql } = await record();
  const out = refusal(k.metric({ ...OVERDUE, target: { lte: { amount: 400_000, currency: 'GBP' } } as never }));
  assert.equal(out.at, 'target');
  assert.match(out.fix, /minor units/);
  sql.close();
});

test('a shape this build does not read is named rather than answered as the ungrouped one', async () => {
  // `group_by` and `bucket` were ignored in silence, and the figure that came back was the UNGROUPED
  // one — drawn under a heading that says it is grouped, which is worse than an em dash.
  const { k, sql } = await record();
  /* `NOT_IN_THIS_BUILD`, added to `30 §6` in the same change. `UNIMPLEMENTED` named nothing — not
     what is unimplemented, not by whom, not what to do — and `08 §2.2` PUBLISHES these eleven
     aggregations, so telling their author the shape is unknown or malformed would send them to
     check a spelling that is correct. The build is behind the document; a deploy is the repair. */
  for (const value of [{ last: 'amount' }, { median: 'amount' }, { group_by: 'party' }])
    assert.equal(refusal(k.metric({ ...OVERDUE, value: value as never })).code, 'NOT_IN_THIS_BUILD');

  // A product naming a table the metric does not carry is named too, rather than read as factor one.
  assert.equal(
    refusal(k.metric({ ...OVERDUE, value: { sum: { product: ['amount', { lookup: 'per_week', by: 'state' }] } } })).code,
    'LOOKUP_UNKNOWN',
  );

  assert.equal(refusal(k.metric({ ...OVERDUE, value: { sum: 'nonesuch' } })).code, 'FIELD_UNKNOWN');
  assert.equal(refusal(k.metric({ ...OVERDUE, source: 'series.revenue' })).code, 'SOURCE_UNKNOWN');
  assert.equal(refusal(k.metric({ ...OVERDUE, source: 'register.nothing' })).code, 'REGISTER_UNKNOWN');
  sql.close();
});

test('A GROUPED FIGURE KEEPS ITS WHOLE AND CARRIES ITS PARTS, a missing bucket a gap and never a zero', async () => {
  const { k, sql } = await record();
  const whole = value<Reading>(k.metric({ ...OVERDUE, where: undefined, target: { gte: 0 } }));

  const byParty = value<Reading>(k.metric({ ...OVERDUE, where: undefined, target: { gte: 0 }, group_by: 'party' }));
  assert.equal(byParty.value, whole.value, 'the figure is still the whole');
  assert.ok(byParty.groups && byParty.groups.length > 0);
  assert.equal(
    byParty.groups!.reduce((n, g) => n + (g.value ?? 0), 0),
    whole.value,
    'the parts add up to the whole when every row names a party',
  );

  const byMonth = value<Reading>(k.metric({ ...OVERDUE, where: undefined, target: { gte: 0 }, group_by: 'due', bucket: 'month' }));
  const keys = byMonth.groups!.map((g) => g.key);
  assert.deepEqual(keys, [...keys].sort(), 'in order');
  for (let i = 1; i < keys.length; i++) assert.notEqual(keys[i], keys[i - 1]);
  for (const g of byMonth.groups!) if (g.rows === 0) assert.equal(g.value, null, `${g.key} held nothing and is a gap`);
  assert.equal(byMonth.current, '2026-09');
  assert.deepEqual(keys, ['2026-06', '2026-07', '2026-08', '2026-09']);
  assert.equal(byMonth.groups!.at(-1)!.state, 'partial', 'the month the clock is in is not finished');
  assert.equal(byMonth.groups![0]!.state, 'partial', 'the month the data began in holds only the days after it began');
  assert.ok(byMonth.groups!.slice(1, -1).every((g) => g.state !== 'partial'), 'the months between are whole');

  const byWeek = value<Reading>(k.metric({ ...OVERDUE, where: undefined, target: { gte: 0 }, group_by: 'due', bucket: 'week' }));
  const gaps = byWeek.groups!.filter((g) => g.state === 'empty');
  assert.ok(gaps.length > 0 && gaps.every((g) => g.value === null), 'a week nothing fell in is a gap');
  assert.equal(byWeek.groups![0]!.key, '2026-06-22', 'a week is keyed by its Monday');

  /* A DATE WITH NO BUCKET, A BUCKET ON A WORD, AND A RATIO OF GROUPS are each said by name. */
  assert.equal(refusal(k.metric({ ...OVERDUE, group_by: 'due' })).at, 'bucket');
  assert.equal(refusal(k.metric({ ...OVERDUE, group_by: 'party', bucket: 'month' })).code, 'DECLARATION_INVALID');
  assert.equal(refusal(k.metric({ ...OVERDUE, group_by: 'nonesuch' })).code, 'FIELD_UNKNOWN');

  /* MORE THAN FIFTY PARTS IS REFUSED AT INSTALL, by the values an enum declares. */
  const wide = await k.install([
    {
      id: 'register.shades',
      kind: 'register',
      body: { id: 'shades', name: 'Shades', title: 'name', fields: [{ id: 'name', type: 'text' }, { id: 'tone', type: 'enum', values: Array.from({ length: 51 }, (_, i) => `t${i}`) }] },
    } as never,
    {
      id: 'metric.by-tone',
      kind: 'metric',
      body: { metric: 'by-tone', name: 'By tone', source: 'register.shades', value: { count: 'id' }, group_by: 'tone', format: 'int', target: { gte: 0 }, window: '30d' },
    } as never,
  ]);
  assert.equal(refusal(wide).code, 'GROUP_BY_CARDINALITY');
  assert.equal(refusal(wide).at, 'group_by');
  assert.equal(
    refusal(k.metric({ ...OVERDUE, group_by: 'party', value: { ratio: { of: { sum: 'amount' }, per: { count: 'id' } } } })).code,
    'NOT_IN_THIS_BUILD',
  );
  sql.close();
});

test('A FIGURE SPLIT BY A LIST THAT GREW IS STILL UPDATED; only a new split is asked about the list', async () => {
  const { k, sql } = await record();
  const rules = { id: 'register.rules', kind: 'register', body: { id: 'rules', name: 'Rules', title: 'name', fields: [{ id: 'name', type: 'text' }] } } as never;
  const lines = { id: 'register.lines', kind: 'register', body: { id: 'lines', name: 'Lines', title: 'name', fields: [{ id: 'name', type: 'text' }, { id: 'rule', type: 'ref', to: 'rules' }] } } as never;
  const split = (id: string, name: string) => ({ id: `metric.${id}`, kind: 'metric', body: { metric: id, name, source: 'register.lines', value: { count: 'id' }, group_by: 'rule', format: 'int', target: { gte: 0 }, window: '30d' } }) as never;
  assert.ok((await k.install([rules, lines, split('by-rule', 'By rule')])).ok);
  for (let i = 0; i < 51; i++) assert.ok(k.create('rules', { name: `Rule ${i}` }, { actor: 'p_1' }).ok);
  const again = await k.install([split('by-rule', 'By its rule')]);
  assert.ok(again.ok, 'rows the person added since do not block an update of a split the record holds');
  const fresh = await k.install([split('by-rule-too', 'By rule too')]);
  assert.equal(refusal(fresh).code, 'GROUP_BY_CARDINALITY');
  sql.close();
});

test('A PREDICATE THE REGISTER CANNOT ANSWER IS REFUSED, not run as if it matched nothing', async () => {
  const { k, sql } = await record();
  const out = refusal(k.metric({ ...OVERDUE, where: { field: 'colour', is: 'red' } as never }));
  assert.match(out.fix, /colour/);
  sql.close();
});

/* ── the comparison ──────────────────────────────────────────────────────── */

test('a window is a window, and a comparison under a week is noise', async () => {
  assert.equal(windowMs('30d'), 30 * DAY);
  assert.equal(windowMs('4w'), 28 * DAY);
  assert.equal(windowMs('3m'), 90 * DAY);
  assert.equal(windowMs('quarterly'), null);

  const { k, sql } = await record();
  assert.equal(value<Reading>(k.metric({ ...OVERDUE, window: '3d' })).why, 'a window under seven days is noise');
  assert.equal(value<Reading>(k.metric({ ...OVERDUE, compare: 'none' })).why, 'no comparison asked for');
  sql.close();
});

test('AND A COMPARISON OF A SET WITH ITSELF SAYS SO rather than reporting no change', async () => {
  /* The shifted window is the same sentence against a MOVED CLOCK. A predicate with no dated clause
     resolves to the same tree at both ends, so the delta would be structurally zero — and reporting
     that as "steady" is a fact about the arithmetic dressed as a fact about the business, which is
     worse than saying nothing because somebody would act on it. */
  const { k, sql } = await record();
  const undated = value<Reading>(k.metric({ ...OVERDUE, where: { field: 'direction', is: 'owed_to_me' } }));
  assert.equal(undated.delta, null);
  assert.equal(undated.why, 'the predicate does not mention time, so the window moves nothing');

  // A dated one moves, and the delta is a real movement.
  const dated = value<Reading>(k.metric({ ...OVERDUE, where: 'direction is owed to me, due before today' }));
  assert.notEqual(dated.why, 'the predicate does not mention time, so the window moves nothing');
  sql.close();
});

test('`year_ago` READS LAST YEAR, and it used to read last month', async () => {
  /* `08 §2` publishes three comparison words and `declare` admits all three; this evaluator's union
     carried two, so anything that was not `none` went down the `now minus window` arm. A metric
     saying *against the same period last year* rendered a delta against the previous THIRTY DAYS,
     and said nothing, because the comparability gate above it is correct and passes: `why` was
     empty and `delta` was a number with every honesty check green.

     THREE WINDOWS, SO READING THE WRONG ONE IS A DIFFERENT NUMBER rather than a missing one. A test
     seeded with two could not tell the two words apart at all, which is how the drift survived. */
  const { k, sql } = await record();

  const seed = (offset: number, amount: number, tag: string): void => {
    for (let n = 0; n < 3; n++)
      assert.ok(
        k.create(
          'obligations',
          { what: `${tag} ${n}`, party: 'Anniversary', direction: 'owed_to_me', amount: gbp(amount), due: day(offset), state: 'open' },
          { actor: 'p_1' },
        ).ok,
      );
  };
  /* Equal counts in all three, so the "prior holds at least half the current's rows" clause of the
     gate cannot be what a failure here is about. */
  seed(-5, 10_000, 'this month');
  seed(-40, 100_000, 'last month');
  seed(-370, 1_000_000, 'last year');

  const ANNIVERSARY: MetricDecl = {
    metric: 'anniversary',
    name: 'Owed, this window',
    source: 'register.obligations',
    where: { all: [{ field: 'party', is: 'Anniversary' }, { field: 'due', after: '-30d' }, { field: 'due', before: 'today' }] },
    value: { sum: 'amount' },
    target: { lte: 1 },
    window: '30d',
    format: 'money.GBP',
  };

  const previous = value<Reading>(k.metric({ ...ANNIVERSARY, compare: 'previous' }));
  const yearAgo = value<Reading>(k.metric({ ...ANNIVERSARY, compare: 'year_ago' }));

  assert.equal(previous.value, 30_000, 'both words read the same current window');
  assert.equal(yearAgo.value, 30_000);
  assert.equal(previous.why, '', 'the comparability gate refused the comparison this test is about');
  assert.equal(yearAgo.why, '');

  // 30,000 against 300,000 is the month before; 30,000 against 3,000,000 is the year before.
  assert.equal(previous.delta, deltaFrom(300_000, 30_000));
  assert.equal(previous.delta, -0.9);
  assert.equal(yearAgo.delta, deltaFrom(3_000_000, 30_000));
  assert.equal(yearAgo.delta, -0.99, '`year_ago` was computed as `previous`, so it read last month');
  assert.notEqual(yearAgo.delta, previous.delta, 'two comparison words that always agree are one word');
  sql.close();
});

test('and a year is calendar arithmetic, so the anniversary of 29 February is the 28th', async () => {
  /* A YEAR IS NOT A FIXED NUMBER OF MILLISECONDS. `resolveDay` resolves `+1m` by the calendar and
     clamps the day of the month, on the argument that rolling 31 January into 3 March is not what
     anybody means by a month; a year is twelve of those. Subtracting `365 * DAY` from noon on
     29 February 2028 lands on 1 MARCH 2027, and letting `Date.UTC` roll the impossible 29 February
     2027 forward lands there too. The record's answer is 28 February 2027, and this seeds both
     candidate days with different amounts so the three readings are three numbers. */
  const LEAP = Date.UTC(2028, 1, 29, 12);
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(LEAP));
  assert.ok((await k.install([OBLIGATIONS])).ok);

  const on = (iso: string, amount: number): void => {
    assert.ok(
      k.create('obligations', { what: iso, direction: 'owed_to_me', amount: gbp(amount), due: iso, state: 'open' }, { actor: 'p_1' }).ok,
    );
  };
  on('2028-02-29', 10_000);
  on('2027-02-28', 40_000); // the anniversary
  on('2027-03-01', 90_000); // where 365 days, and an unclamped roll, both land

  const TODAY: MetricDecl = {
    metric: 'leap',
    name: 'Owed today',
    source: 'register.obligations',
    where: { field: 'due', is: 'today' },
    value: { sum: 'amount' },
    target: { lte: 1 },
    window: '30d',
    format: 'money.GBP',
    compare: 'year_ago',
  };

  const read = value<Reading>(k.metric(TODAY));
  assert.equal(read.value, 10_000);
  assert.equal(read.why, '', 'the anniversary window came back empty, so the clock moved to a day with no rows');
  assert.equal(read.delta, deltaFrom(40_000, 10_000), 'the anniversary of 29 February is 28 February, not 1 March');
  assert.equal(read.delta, -0.75);
  sql.close();
});

test('A SENTENCE IS A PREDICATE, in a metric and in a list, and both read the same rows', async () => {
  // A declaration is written as `direction is owed to me, state is open`. One form the record
  // accepts and the other it does not would make `where:` two languages.
  const { k, sql } = await record();
  const said = 'direction is owed to me, state is open or part, due before today';
  const read = value<Reading>(k.metric({ ...OVERDUE, where: said }));
  assert.equal(read.value, 720_000, 'the sentence read different rows from the tree');

  const listed = k.list({ register: 'obligations', where: said, limit: 100 });
  assert.ok(listed.ok, fixOf(listed));
  assert.equal(listed.value.rows.length, 2);

  // And a sentence the register cannot answer is refused, in both.
  assert.equal(refusal(k.metric({ ...OVERDUE, where: 'state is not done' })).code, 'ENUM_VALUE_UNKNOWN');
  const badList = k.list({ register: 'obligations', where: 'state is not done', limit: 100 });
  assert.equal(badList.ok, false);
  sql.close();
});

test('a target is a bound, and `met` is a fact about one number', () => {
  assert.equal(meets(100, { lte: 200 }), true);
  assert.equal(meets(300, { lte: 200 }), false);
  assert.equal(meets(300, { gte: 200 }), true);
  assert.equal(meets(200, { lte: 200 }), true, 'a bound includes the bound');
});

test('the evaluator is a function, and it reads a record it was handed', async () => {
  // It takes `Sql` and a schema lookup rather than a kernel, so a host with a different cache can
  // call it — and so this test is about the arithmetic rather than about the wiring.
  const { k, sql } = await record();
  const out = evaluateMetric(sql, OVERDUE, {
    nowMs: NOW,
    schemaOf: (register) => {
      const r = k.register(register);
      return r ? { register, fields: Object.fromEntries(r.fields.map((f) => [f.id, f])) } : null;
    },
  });
  assert.equal(value<Reading>(out).value, 720_000);
  sql.close();
});

/* ── a prediction comes due ────────────────────────────────────── */

const predict = (sql: NodeSql, target: string, on_miss = 'suggest') =>
  sql.exec(
    `INSERT INTO prediction (id, for_decl, claim, measure, baseline, unit, target, window, score_at, on_miss)
     VALUES ('pr_1', 'decision.D1', 'Chasing halves what is overdue', ?, 720000, 'GBP', ?, '30d', ?, ?)`,
    JSON.stringify({
      source: 'register.obligations',
      where: { all: [{ field: 'direction', is: 'owed_to_me' }, { field: 'state', in: ['open', 'part'] }] },
      value: { sum: 'amount' },
    }),
    target,
    new Date(NOW).toISOString(),
    on_miss,
  );

test('A DECISION THAT PREDICTED NOTHING CANNOT BE WRONG, so the record checks the ones that did', async () => {
  const { k, sql, clock } = await record();
  predict(sql, '<=400000');
  sql.exec(
    "INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts) VALUES ('s_1', ?, 'score', 'pr_1', ?, 'pending', 0)",
    new Date(NOW).toISOString(),
    JSON.stringify({ prediction: 'pr_1' }),
  );

  clock.set(NOW + 1000);
  const drained = await k.drain();
  assert.equal(drained.done, 1);
  assert.equal(drained.failed, 0);

  const row = sql.one<{ scored_at: string; observed: number; met: number }>('SELECT scored_at, observed, met FROM prediction')!;
  assert.ok(row.scored_at, 'the prediction came due and was not scored');
  assert.equal(row.observed, 720_000, 'the observed figure is not the measure it named');
  assert.equal(row.met, 0, '720,000 is not under a 400,000 ceiling');

  // And the event, with the reading in it, because a verdict nobody can find is not a verdict.
  const event = sql.one<{ actor: string; target: string; to_v: string }>("SELECT actor, target, to_v FROM event WHERE kind = 'score'")!;
  assert.equal(event.actor, 'system');
  assert.equal(event.target, 'prediction:pr_1');
  assert.deepEqual(JSON.parse(event.to_v), { observed: 720_000, met: false });
  sql.close();
});

/* THE QUESTION A MISS FILES SAYS WHICH PREDICTION IT GRADES. Its body was the two options and `requires_reason` and
   nothing else, so the record found the prediction by the words of the question, and two predictions with the same
   claim and target, one over Money and one over Inbox, both answered: the Inbox miss was held from Inbox's readers
   because its words matched the Money one too (measured `actual: undefined`). Only `system` opens it, so the record can
   believe the id it carries. */
test('A MISSED PREDICTION FILES ITS QUESTION NAMING THE PREDICTION, which only the system can open', async () => {
  const { k, sql, clock } = await record();
  predict(sql, '<=400000');
  sql.exec(
    "INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts) VALUES ('s_1', ?, 'score', 'pr_1', ?, 'pending', 0)",
    new Date(NOW).toISOString(),
    JSON.stringify({ prediction: 'pr_1' }),
  );
  clock.set(NOW + 1000);
  await k.drain();
  const asked = sql.one<{ body: string; opened_by: string }>("SELECT body, opened_by FROM suggestion WHERE body_kind = 'options'");
  assert.equal(asked?.opened_by, 'system', 'the precondition: the miss filed its question');
  assert.equal((JSON.parse(asked!.body) as { prediction?: unknown }).prediction, 'pr_1');
  sql.close();
});

test('and a prediction it met says so', async () => {
  const { k, sql, clock } = await record();
  predict(sql, '<=800000');
  sql.exec(
    "INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts) VALUES ('s_1', ?, 'score', 'pr_1', ?, 'pending', 0)",
    new Date(NOW).toISOString(),
    JSON.stringify({ prediction: 'pr_1' }),
  );
  clock.set(NOW + 1000);
  await k.drain();
  assert.equal(sql.one<{ met: number }>('SELECT met FROM prediction')?.met, 1);
  sql.close();
});

test('IT IS SCORED ONCE, so a re-entered alarm does not overwrite a verdict with a later reading', async () => {
  const { k, sql, clock } = await record();
  predict(sql, '<=400000');
  sql.exec(
    "INSERT INTO schedule (id, due_at, kind, key, payload, state, attempts) VALUES ('s_1', ?, 'score', 'pr_1', ?, 'pending', 0)",
    new Date(NOW).toISOString(),
    JSON.stringify({ prediction: 'pr_1' }),
  );
  clock.set(NOW + 1000);
  await k.drain();
  const first = sql.one<{ scored_at: string; observed: number }>('SELECT scored_at, observed FROM prediction')!;

  // The rows move, and the row is scored again — which it must not be.
  assert.ok(k.create('obligations', { what: 'More', direction: 'owed_to_me', amount: gbp(1_000_000), due: day(-1), state: 'open' }, { actor: 'p_1' }).ok);
  sql.exec("UPDATE schedule SET state = 'pending', due_at = ? WHERE id = 's_1'", new Date(NOW).toISOString());
  clock.set(NOW + 2000);
  await k.drain();

  const again = sql.one<{ scored_at: string; observed: number }>('SELECT scored_at, observed FROM prediction')!;
  assert.deepEqual(again, first, 'a scored prediction was scored a second time');
  assert.equal(sql.all("SELECT 1 FROM event WHERE kind = 'score'").length, 1);
  sql.close();
});

test('a target is a bound however it is written', () => {
  // `<= 20` and `20` are the same claim written two ways, and a bare number means "at least this".
  assert.deepEqual(targetOf('<=400000'), { lte: 400_000 });
  assert.deepEqual(targetOf('≤ 400000'), { lte: 400_000 });
  assert.deepEqual(targetOf('>=20'), { gte: 20 });
  assert.deepEqual(targetOf('> 20'), { gte: 20 });
  assert.deepEqual(targetOf('20'), { gte: 20 });
});

/* ── the row-level product ────────────────────────────────────── */

const CYCLES: Declaration = {
  id: 'register.services',
  kind: 'register',
  body: {
    id: 'services',
    name: 'Services',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'cost', type: 'money' },
      { id: 'cycle', type: 'enum', values: ['monthly', 'yearly', 'two_yearly'] },
    ],
  } as never,
};

async function services() {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([CYCLES])).ok);
  for (const row of [
    { name: 'Object storage', cost: gbp(4_100), cycle: 'monthly' },
    { name: 'kiln.example', cost: gbp(1_400), cycle: 'yearly' },
    { name: 'A two-year one', cost: gbp(3_000), cycle: 'two_yearly' },
  ])
    assert.ok(k.create('services', row, { actor: 'p_1' }).ok);
  return { k, sql };
}

const ANNUAL: MetricDecl = {
  metric: 'estate-year',
  name: 'Estate, a year',
  source: 'register.services',
  value: { sum: { product: ['cost', { lookup: 'per_year', by: 'cycle' }] } },
  lookups: { per_year: { monthly: 12, yearly: 1, two_yearly: 0.5 } },
  target: { lte: 100_000 },
  window: '90d',
  compare: 'none',
  format: 'money.GBP',
};

test('A COST PER CYCLE IS ANNUALISED PER ROW, before the sum', async () => {
  /* `cost` is per CYCLE, so a yearly domain and a monthly subscription are two different units and
     adding them straight gives a number that is not about anything. Written out longhand in one
     metric and omitted from another, this came out 9.25 times too low under the word "year". */
  const { k, sql } = await services();
  const read = value<Reading>(k.metric(ANNUAL));

  const naive = 4_100 + 1_400 + 3_000;
  const annual = 4_100 * 12 + 1_400 * 1 + 3_000 * 0.5;
  assert.equal(read.value, annual, `${read.value} is not the annualised figure`);
  assert.notEqual(read.value, naive, 'the cycle factor is missing again');
  assert.equal(read.unit, 'GBP');
  sql.close();
});

test('A ROW THE TABLE HAS NO FACTOR FOR IS EXCLUDED AND NAMED, never multiplied by one', async () => {
  // Factor one is the answer that made this 9.25 times too low. A figure missing one row is a
  // refusal; a figure with one row counted wrongly is a number nobody can spot.
  const { k, sql } = await services();
  const out = refusal(k.metric({ ...ANNUAL, lookups: { per_year: { monthly: 12, yearly: 1 } } }));
  assert.equal(out.code, 'LOOKUP_MISSING');
  assert.match(out.fix, /two_yearly/);
  assert.deepEqual(out.allowed, ['monthly', 'yearly']);
  sql.close();
});

test('THE TABLE IS INSTALLED WITH THE FIGURE, and a figure that does not carry it is refused at install', async () => {
  /* The tables were handed to the kernel by the host, no host handed one in, and every real record
     read "cannot be worked out yet" for the pack's own Cost per year while every test passed. */
  const { k, sql } = await services();
  const { lookups: _, ...bareBody } = ANNUAL;
  const installed = await k.install([{ id: 'metric.estate-year', kind: 'metric', body: ANNUAL as never }]);
  assert.ok(installed.ok, JSON.stringify(installed));
  assert.equal(value<Reading>(k.metric(k.metricDecl('estate-year')!)).value, 4_100 * 12 + 1_400 + 1_500);

  const bare = await k.install([{ id: 'metric.bare-year', kind: 'metric', body: { ...bareBody, metric: 'bare-year' } as never }]);
  assert.equal(!bare.ok && 'refusal' in bare ? bare.refusal.code : null, 'LOOKUP_UNKNOWN');
  sql.close();
});

test('A BODY FROM BEFORE A METRIC COULD CARRY ITS TABLE still reads per_year, because declaration rows are never edited', async () => {
  const { k, sql } = await services();
  const { lookups, ...legacy } = ANNUAL;
  assert.equal(value<Reading>(k.metric(legacy)).value, 4_100 * 12 + 1_400 + 1_500);
  // A body that carries tables gets only its own.
  assert.equal(refusal(k.metric({ ...legacy, lookups: { other: { monthly: 1 } } })).code, 'LOOKUP_UNKNOWN');
  sql.close();
});

test('and the product is rounded per row, because minor units are integers', async () => {
  const { k, sql } = await services();
  const read = value<Reading>(k.metric(ANNUAL));
  assert.equal(Number.isInteger(read.value), true, `${read.value} is not a whole number of minor units`);
  sql.close();
});

/* ── a figure, kept ────────────────────────────────────────────────── */

const OPEN: MetricDecl = {
  metric: 'still-open',
  name: 'Still open',
  source: 'register.obligations',
  where: 'state is open, due before today',
  value: { count: 'id' },
  target: { lte: 5 },
  window: '30d',
  compare: 'none',
  format: 'int',
};

const ctxOf = (k: Kernel, nowMs: number) => ({
  nowMs,
  schemaOf: (register: string) => {
    const r = k.register(register);
    return r ? { register, fields: Object.fromEntries(r.fields.map((f) => [f.id, f as never])) } : null;
  },
});

test('A METRIC IS A QUESTION AND A SERIES IS ITS ANSWERS', async () => {
  /* Everything else the record computes is computed fresh. This is the one thing it remembers,
     because "is this getting better" cannot be asked of a number that only exists now. */
  const { k, sql } = await record();
  const out = value<Snapshot>(snapshot(sql, OPEN, ctxOf(k, NOW), { nowAt: new Date(NOW).toISOString(), tz: 'UTC' }, 10));

  assert.equal(out.wrote, 1, 'yesterday was not written');
  assert.ok(out.backfilled > 0, 'a series that starts today has no shape for a month');

  const points = sql.all<{ at: string; value: number; unit: string; source: string }>(
    "SELECT at, value, unit, source FROM metric_point WHERE series = 'still-open' ORDER BY at",
  );
  assert.equal(points.length, out.wrote + out.backfilled);
  assert.equal(points.at(-1)?.at, new Date(NOW - DAY).toISOString().slice(0, 10), 'today was written');
  assert.equal(points[0]?.source, 'register.obligations');
  sql.close();
});

test('AND THE PREDICATE MOVES WITH THE DAY, which is what makes a stored figure worth keeping', async () => {
  /* `due before today` resolves against the day being snapshotted. A backfill that asked today's
     question of every past day would store thirty copies of one number. */
  const { k, sql } = await record();
  value<Snapshot>(snapshot(sql, OPEN, ctxOf(k, NOW), { nowAt: new Date(NOW).toISOString(), tz: 'UTC' }, 60));

  const values = sql.all<{ value: number }>("SELECT value FROM metric_point WHERE series = 'still-open' ORDER BY at").map((r) => r.value);
  assert.ok(new Set(values).size > 1, `every day stored the same figure: ${[...new Set(values)].join(', ')}`);
  // Earlier days have fewer rows overdue, because fewer of them were overdue yet.
  assert.ok(values[0]! < values.at(-1)!, 'the series does not move in the direction the rows do');
  sql.close();
});

test('YESTERDAY IS OVERWRITTEN AND EVERY EARLIER DAY IS KEPT', async () => {
  // A snapshot that ran twice in one day should agree with itself rather than refuse; a backfill
  // that overwrote would rewrite history every night.
  const { k, sql } = await record();
  const ctx = ctxOf(k, NOW);
  value<Snapshot>(snapshot(sql, OPEN, ctx, { nowAt: new Date(NOW).toISOString(), tz: 'UTC' }, 10));

  const before = sql.all<{ at: string; value: number }>("SELECT at, value FROM metric_point ORDER BY at");
  sql.exec("UPDATE metric_point SET value = 999 WHERE at = ?", before[0]!.at);

  const again = value<Snapshot>(snapshot(sql, OPEN, ctx, { nowAt: new Date(NOW).toISOString(), tz: 'UTC' }, 10));
  assert.equal(again.backfilled, 0, 'the backfill rewrote days it had already written');
  assert.equal(sql.one<{ value: number }>('SELECT value FROM metric_point WHERE at = ?', before[0]!.at)?.value, 999);
  assert.equal(sql.all('SELECT 1 FROM metric_point').length, before.length, 'a second run doubled the series');
  sql.close();
});

test("A RECORD AT UTC+12 GETS ITS OWN YESTERDAY, and it used to get today's date on it", async () => {
  /**
   * `endOf` SEEDED ITS SEARCH AT NOON UTC. The comment above it argues for noon because no clock
   * change has ever crossed it, which is an argument about noon LOCAL: in `Pacific/Auckland` noon
   * UTC is one o'clock the following morning, so the walk began in the wrong day and stayed there.
   * The newest point came out stamped with TODAY's local date, holding a reading taken as of one in
   * the morning, and the row that fires this is armed for five past midnight local.
   *
   * EVERY OTHER SNAPSHOT TEST IN THIS FILE PASSES `tz: 'UTC'`, the one zone where the defect is
   * invisible, under code whose own comment is about Auckland.
   */
  const { k, sql } = await record();
  const tz = 'Pacific/Auckland';
  const local = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const today = local.format(new Date(NOW));

  value<Snapshot>(snapshot(sql, OPEN, ctxOf(k, NOW), { nowAt: new Date(NOW).toISOString(), tz }, 3));
  const newest = sql.one<{ at: string }>("SELECT at FROM metric_point WHERE series = 'still-open' ORDER BY at DESC")?.at;
  assert.ok(newest, 'nothing was written at all');
  assert.ok(newest < today, `the newest point is ${newest} and the local day is ${today}, so today was written as yesterday`);
  sql.close();
});

test('A MONEY POINT IS MONEY, and it went in ten thousand times too large with a currency on it', async () => {
  /**
   * `stored()` TOOK A VALUE AND NOTHING ELSE. Any figure that was not a whole number became basis
   * points, and each of the three call sites wrote the unit from a SEPARATE expression that kept a
   * real unit when the reading had one. So an average of money landing between two pennies was
   * multiplied by ten thousand and filed under `GBP`, which every surface in this product renders
   * with a pound sign in front of it.
   *
   * THE SEED'S FIVE AMOUNTS AVERAGE TO A HALF-PENNY. 480,000 + 240,000 + 135,000 + 1,910,000 +
   * 180,000 is 2,945,000 over five, which is 589,000 exactly, so the amounts are cut to four rows to
   * reach a fraction: an average that lands on a whole penny cannot tell the two rules apart, which
   * is why the one `avg` test in this file could not fail. It averages a `duration`, the single type
   * where the old scaling happened to be harmless.
   */
  const { k, sql } = await record();
  assert.ok(
    k.create('obligations', { what: 'Odd one', direction: 'owed_to_me', amount: gbp(1), due: day(-1), state: 'open' }, { actor: 'p_1' }).ok,
  );
  const avg: MetricDecl = { ...OPEN, metric: 'avg-owed', value: { avg: 'amount' }, where: 'state is open', target: { lte: 9_999_999 }, format: 'money' };

  const read = value<Reading>(evaluateMetric(sql, avg, ctxOf(k, NOW)));
  assert.equal(read.unit, 'GBP', 'the reading is not in a currency, so this test is about the wrong thing');
  assert.equal(Number.isInteger(read.value ?? 0), false, 'the average is a whole number of pennies, so the two rules agree here');

  value<Snapshot>(snapshot(sql, avg, ctxOf(k, NOW), { nowAt: new Date(NOW).toISOString(), tz: 'UTC' }, 1));
  const kept = sql.one<{ value: number; unit: string }>("SELECT value, unit FROM metric_point WHERE series = 'avg-owed' ORDER BY at DESC");
  assert.ok(kept, 'nothing was written');

  assert.equal(kept.unit, 'GBP', 'a money point lost its currency');
  /* WITHIN A PENNY OF THE READING, and not four orders of magnitude away from it. Money is an
     integer in minor units, so an average between two pennies rounds to a penny: that is what money
     does, and half a penny is not a number this record can hold. */
  assert.ok(
    Math.abs(kept.value - (read.value ?? 0)) <= 1,
    `the point is ${kept.value} and the reading is ${read.value}`,
  );
  sql.close();
});

test('and a day the metric could not answer is NO ROW, not a zero', async () => {
  /* A series with a zero on every day nothing happened cannot tell "nothing" from "no answer", and
     the difference is the whole of a trend. */
  const { k, sql } = await record();
  const avg: MetricDecl = { ...OPEN, metric: 'avg-effort', value: { avg: 'effort' }, target: { lte: 100_000 } };
  const out = value<Snapshot>(snapshot(sql, avg, ctxOf(k, NOW), { nowAt: new Date(NOW).toISOString(), tz: 'UTC' }, 90));
  assert.ok(out.missing > 0, 'a day with nothing to average stored a number anyway');
  assert.equal(sql.all("SELECT 1 FROM metric_point WHERE series = 'avg-effort' AND value = 0").length, 0);
  sql.close();
});

/* ── the other rendering of the same predicate ───────────────────────── */

const OPEN_JSON: MetricDecl = {
  ...OPEN,
  metric: 'still-open-json',
  where: { all: [{ field: 'state', is: 'open' }, { field: 'due', before: 'today' }] },
};

test('A PREDICATE WRITTEN AS JSON SAYS `today` TOO, and it used to reach SQL as the word', async () => {
  /* `'2026-…' < 'today'` is a string comparison true of every date there has ever been, so the
     figure was the whole register and looked like an answer. The clause that quietly matches
     everything, reached through the one form of the grammar nobody was resolving. */
  const { k, sql } = await record();
  const sentence = value<Reading>(evaluateMetric(sql, OPEN, ctxOf(k, NOW)));
  const json = value<Reading>(evaluateMetric(sql, OPEN_JSON, ctxOf(k, NOW)));
  assert.equal(json.value, sentence.value, 'the two renderings of one predicate disagree');
  assert.ok((json.value ?? 0) < k.count('obligations'), 'the JSON form matched every row in the register');
  sql.close();
});

test('and `asOf` moves it, so a backfill is history rather than thirty copies of today', async () => {
  const { k, sql } = await record();
  const out = value<Snapshot>(snapshot(sql, OPEN_JSON, ctxOf(k, NOW), { nowAt: new Date(NOW).toISOString(), tz: 'UTC' }, 60));
  assert.equal(out.missing, 0);

  const values = sql
    .all<{ value: number }>("SELECT value FROM metric_point WHERE series = 'still-open-json' ORDER BY at")
    .map((r) => r.value);
  assert.ok(new Set(values).size > 1, `every day stored the same figure: ${[...new Set(values)].join(', ')}`);
  assert.ok(values[0]! < values.at(-1)!, 'the series does not move in the direction the rows do');
  sql.close();
});

test('and a day the grammar does not admit is refused in JSON as it is in a sentence', async () => {
  // `2026-13-45` matched the shape and was then compared as a string, so it was true of every row.
  const { k, sql } = await record();
  const bad = evaluateMetric(sql, { ...OPEN_JSON, where: { field: 'due', before: '2026-13-45' } }, ctxOf(k, NOW));
  assert.equal(bad.ok, false);
  // `RELATIVE_LITERAL_UNKNOWN`: `30 §6`'s code for a temporal literal outside the anchors and
  // offsets, which is what `2026-13-45` is. The sentence form has always answered the same way.
  assert.equal((bad as { refusal: { code: string } }).refusal.code, 'RELATIVE_LITERAL_UNKNOWN');
  sql.close();
});

/* ── wrong numbers that looked right ───────────────────────────────────── */

test('DISTINCT OVER MONEY COUNTS THE PAIR, not the number', async () => {
  /* GBP 50, USD 50 and EUR 50 came back as ONE distinct value — three different sums of money
     counted as the same one — because the currency was dropped on the way into the expression.
     `sum` over the same rows refuses `MIXED_CURRENCY`; this quietly agreed with itself. */
  const { k, sql } = await record();
  for (const currency of ['GBP', 'USD', 'EUR'])
    value(k.create('obligations', { what: `Fifty ${currency}`, amount: { amount: 5000, currency } }, { actor: 'p_1' }));

  const out = k.metric({
    metric: 'kinds',
    name: 'How many different amounts',
    source: 'register.obligations',
    value: { distinct: 'amount' },
    where: { field: 'what', contains: 'Fifty ' },
    target: { gte: 1 },
    window: '30d',
    compare: 'none',
  });
  assert.ok(out.ok, fixOf(out));
  assert.equal(out.value.rows, 3, 'the predicate did not isolate the three rows under test');
  assert.equal(out.value.value, 3, 'three currencies of the same number counted as one');
  sql.close();
});

test('A DELTA OVER A NEGATIVE PRIOR KEEPS ITS DIRECTION', async () => {
  /* Dividing by a negative denominator inverts the sign, and the interface keys the word "up" off
     it — so a net position that got 50% worse was reported as improving by half. The web build has
     divided by the magnitude since it was written; these two disagreed. */
  assert.equal(deltaFrom(-48_000, -72_000), -0.5);
  assert.equal(deltaFrom(-48_000, -24_000), 0.5);
  assert.equal(deltaFrom(48_000, 72_000), 0.5);
});

test('A DIFF WHOSE FIRST HALF READ NOTHING KEEPS THE OTHER HALF\'S CURRENCY', async () => {
  /* The unit was the first half's alone, so nothing received and GBP 50.00 paid read
     `{ value: -5000, unit: null }`: a bare number an agent could not tell was money. */
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const LEDGER: Declaration = {
    id: 'register.ledger',
    kind: 'register',
    body: {
      id: 'ledger',
      name: 'Ledger',
      title: 'what',
      fields: [
        { id: 'what', type: 'text', required: true },
        { id: 'got', type: 'money' },
        { id: 'paid', type: 'money' },
      ],
    } as never,
  };
  assert.ok((await k.install([LEDGER])).ok);
  assert.ok(k.create('ledger', { what: 'Hosting', paid: gbp(5_000) }, { actor: 'p_1' }).ok);
  const net = value<Reading>(
    k.metric({ metric: 'net', name: 'Net', source: 'register.ledger', value: { diff: { of: { sum: 'got' }, per: { sum: 'paid' } } }, format: 'money', target: { gte: 0 }, window: '30d' } as never),
  );
  assert.equal(net.value, -5_000);
  assert.equal(net.unit, 'GBP', 'a diff whose first half read nothing lost its currency');
  sql.close();
});
