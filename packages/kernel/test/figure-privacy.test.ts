/**
 * A figure a run fills into a row is read only where it adds up the list the row is in (audit sixty-two, finding 4,
 * probe F1: `loop/research-batch-sixty-two-audit.md` §4; audit sixty-four, finding 1, as the owner decided it on 24
 * September: `loop/DIRECTION.md` section 25).
 *
 * WHAT WAS MEASURED BEFORE THE FIRST REPAIR. Lists `salaries` and `inbox`, a figure `payroll` summing salaries, an
 * owner's rule on each new inbox row that sets `note` to `filed; payroll {{metric.payroll}}`, and a member invited to
 * Inbox alone. The record refuses her `payroll` as a figure that does not exist (`metric` in
 * `packages/record/src/index.ts`, over the figure's `source`), and her own Inbox then read
 * `note: "filed; payroll GBP 5200.00"`. `figureText` read with the run's context and asked nobody.
 *
 * THE FIRST REPAIR ASKED THE `member` ROWS AT THE RUN, AND THE ROW OUTLIVES THE RUN. A note written before she was
 * invited kept the payroll (`figure-privacy-before.test.ts`), and a script reading Inbox was never asked. So who is a
 * member no longer decides it: a figure over another list is `--withheld--` for everyone, the owner alone included,
 * and the tests here that once proved the member rows were read now prove they are not.
 *
 * HOW THESE RULES REACH A RUN AT ALL. Install now refuses F1's rule (`figure-install-warning.test.ts`), so each rule
 * here goes in while `payroll` reads a series, and `payroll` is then pointed at Salaries. That install carries no rule,
 * so the lint never reads one, and it is the way a record comes to hold a rule whose figure is over another list:
 * measured here, it installs, and the run is the line that holds.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 24, 12);
const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const DAY = 86_400_000;
const WITHHELD = 'filed; payroll --withheld--';
const FILLED = 'filed; payroll GBP 5,200.00';

const list = (id: string, name: string, fields: Record<string, unknown>[]): Declaration => ({
  id: `register.${id}`,
  kind: 'register',
  body: { id, name, title: 'what', fields: [{ id: 'what', type: 'text', required: true }, ...fields] } as never,
});

const SALARIES = list('salaries', 'Salaries', [{ id: 'pay', type: 'money' }, { id: 'note', type: 'text' }]);
const INBOX = list('inbox', 'Inbox', [{ id: 'note', type: 'text' }]);
const DIARY = list('diary', 'Diary', [{ id: 'note', type: 'text' }]);

const figure = (source: string): Declaration => ({
  id: 'metric.payroll',
  kind: 'metric',
  body: { metric: 'payroll', name: 'Payroll', source, value: { sum: 'pay' }, format: 'money.GBP', target: { gte: 0 }, window: '30d', compare: 'none' } as never,
});

const PAYROLL = figure('register.salaries');
/**
 * What `payroll` reads while a rule goes in that install would refuse over Salaries: a series, which is over no list and
 * so is written wherever a run lands. First written as a count of Inbox, and install refused the Diary rule below all
 * the same, since that run lands in Inbox and Diary both and no figure over one list is over both.
 */
const OVER_NO_LIST = figure('series.payroll');

const rule = (rule: string, steps: unknown[], on: unknown = { written: { register: 'inbox', op: ['create'] } }, extra: Record<string, unknown> = {}): Declaration => ({
  id: `rule.${rule}`,
  kind: 'rule',
  body: { rule, on, steps, ...extra } as never,
});

/** F1's own rule: every new inbox row is filed with the payroll written into its note. */
const FILE = rule('file', [{ set: { field: 'note', to: 'filed; payroll {{metric.payroll}}' } }]);

const why = (r: unknown): string => {
  const x = r as { ok: boolean; refusal?: { code: string; fix: string } };
  return x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`;
};

/** The record, with `decls` installed while `payroll` reads a series and `payroll` then pointed at Salaries. */
async function record(...decls: Declaration[]): Promise<{ k: Kernel; sql: NodeSql; clock: ReturnType<typeof fixedClock> }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  assert.ok(k.createRecord({ id: ID, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  const before = await k.install([SALARIES, INBOX, DIARY, OVER_NO_LIST, ...decls]);
  assert.ok(before.ok, why(before));
  const moved = await k.install([PAYROLL]);
  assert.ok(moved.ok, `pointing payroll at Salaries under an installed rule was refused: ${why(moved)}`);
  assert.ok(k.create('salaries', { what: 'Ada', pay: { amount: 520000, currency: 'GBP' } }, { actor: 'p_1' }).ok);
  return { k, sql, clock };
}

const invite = (k: Kernel, args: { level?: 'read' | 'write' | 'owner'; registers?: Record<string, 'read' | 'append' | 'write'> }, name = 'Bea'): void => {
  const out = k.invite('p_1', { person: `p_${name.toLowerCase()}`, email: `${name.toLowerCase()}@example.test`, name, ...args });
  assert.ok(out.ok, why(out));
};

const noteOf = async (k: Kernel, register: string, what: string): Promise<unknown> => {
  const made = k.create(register, { what }, { actor: 'p_1' });
  assert.ok(made.ok, why(made));
  await k.drain();
  return k.get(made.value.id)?.fields.note;
};

const runsOf = (sql: NodeSql, rule: string): { state: string; say: string | null }[] =>
  sql.all<{ state: string; say: string | null }>('SELECT state, say FROM automation_run WHERE rule = ? ORDER BY started_at, rowid', rule).map((r) => ({ ...r }));

test('F1: A MEMBER INVITED TO INBOX ALONE READS --withheld-- WHERE THE PAYROLL WOULD BE, and the run still finishes', async () => {
  const { k, sql } = await record(FILE);
  invite(k, { registers: { inbox: 'read' } });
  assert.equal(await noteOf(k, 'inbox', 'Invoice from the printer'), WITHHELD);
  assert.deepEqual(runsOf(sql, 'file'), [{ state: 'done', say: null }]);
  sql.close();
});

/* WHAT THE MEMBER ROWS ONCE DECIDED, AND DO NOT NOW. The owner alone, a member who reads Salaries too, a member of Diary
   alone, one held to `append` on Salaries and one invited after the rule went in were five answers under the first
   repair: filled, filled, filled, the dash, the dash. Each is now the placeholder, since the row is read later by
   whoever reads Inbox then. */
test('WHO IS A MEMBER NO LONGER DECIDES IT: nobody, Salaries too, Diary alone, append on Salaries and a late invitation all write --withheld--', async () => {
  const cases: [string, Parameters<typeof invite>[1] | null][] = [
    ['the owner alone', null],
    ['a member of Inbox and Salaries', { registers: { inbox: 'read', salaries: 'read' } }],
    ['a member of Diary alone', { registers: { diary: 'read' } }],
    ['a writer held to append on Salaries', { level: 'write', registers: { salaries: 'append' } }],
  ];
  for (const [who, args] of cases) {
    const { k, sql } = await record(FILE);
    if (args) invite(k, args);
    assert.equal(await noteOf(k, 'inbox', 'First'), WITHHELD, who);
    invite(k, { registers: { inbox: 'read' } }, 'Cy');
    assert.equal(await noteOf(k, 'inbox', 'Second'), WITHHELD, `${who}, then Cy invited to Inbox`);
    sql.close();
  }
});

test('THE CONTROL: a figure over the list it is written into is filled, with a member who reads that list alone', async () => {
  const own = rule('own', [{ set: { field: 'note', to: 'filed; payroll {{metric.payroll}}' } }], { written: { register: 'salaries', op: ['create'] } });
  const { k, sql } = await record(own);
  invite(k, { registers: { salaries: 'read' } });
  const made = k.create('salaries', { what: 'Bo', pay: { amount: 0, currency: 'GBP' } }, { actor: 'p_1' });
  assert.ok(made.ok, why(made));
  await k.drain();
  assert.equal(k.get(made.value.id)?.fields.note, FILLED);
  sql.close();
});

test('A FIGURE KEPT IN A VARIABLE FIRST is withheld too, since the variable is written into the row later', async () => {
  const { k, sql } = await record(rule('file', [{ set_var: { name: 'pay', to: '{{metric.payroll}}' } }, { set: { field: 'note', to: 'filed; payroll {{vars.pay}}' } }]));
  assert.equal(await noteOf(k, 'inbox', 'Invoice from the printer'), WITHHELD);
  sql.close();
});

/* STARTED BY A NEW SALARY, NOT A CLOCK. It was first written as a clock and the run failed "rule.tally's create step
   acts on a row, and this run has none to act on"; a create on a run with no row now makes its row (`createAlone` in
   `rules.ts`), but a clock has no row's list to compare with. What is measured is that the list created into is asked
   about, and not only the run's own row's list, so the run needs a row of its own.

   ON SALARIES, THE LIST THE FIGURE ADDS UP, AND NOT ON INBOX. Written on Inbox, the run's own row was already a list
   other than Salaries, so the note was withheld whether or not Diary was counted: the checker took `create` out of
   `landsOf` in `flow.ts` and every test in this file still passed. On Salaries, Diary is the only other list. */
test('A ROW THE RUN CREATES IN ANOTHER LIST counts that list: a Salaries rule writing into Diary writes --withheld--', async () => {
  const { k, sql } = await record(
    rule('tally', [{ create: { register: 'diary', bound: 1, fields: { what: 'Payroll today', note: 'payroll {{metric.payroll}}' } } }], { written: { register: 'salaries', op: ['create'] } }, { once_per: ['entry'] }),
  );
  assert.ok(k.create('salaries', { what: 'Bo', pay: { amount: 0, currency: 'GBP' } }, { actor: 'p_1' }).ok);
  await k.drain();
  const row = sql.one<{ fields: string }>("SELECT fields FROM entry WHERE register = 'diary' ORDER BY rowid DESC LIMIT 1");
  assert.ok(row, `the run wrote no diary row: ${JSON.stringify(runsOf(sql, 'tally'))}`);
  assert.equal((JSON.parse(row.fields) as { note?: string }).note, 'payroll --withheld--');
  sql.close();
});

test('A RUN THAT WRITES NO ROW ANYBODY ELSE READS still reads the figure: a clock that only tells the owner', async () => {
  const clock = rule('tell', [{ notify: { say: 'payroll {{metric.payroll}}' } }], { every: '1d' });
  const { k, sql, clock: time } = await record(clock);
  invite(k, { registers: { inbox: 'read' } });
  time.advance(DAY);
  await k.drain();
  const said = sql.all<{ note: string }>("SELECT note FROM event WHERE kind = 'note' AND actor = 'rule:tell'").map((r) => r.note);
  assert.deepEqual(said, [`payroll GBP 5,200.00`], JSON.stringify(runsOf(sql, 'tell')));
  sql.close();
});
