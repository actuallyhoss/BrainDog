/**
 * A figure a run fills into a row is read only when everybody who reads that row may read the figure (audit sixty-two,
 * finding 4, probe F1: `loop/research-batch-sixty-two-audit.md` §4).
 *
 * WHAT WAS MEASURED BEFORE THE REPAIR. Lists `salaries` and `inbox`, a figure `payroll` summing salaries, an owner's rule
 * on each new inbox row that sets `note` to `filed; payroll {{metric.payroll}}`, and a member invited to Inbox alone.
 * The record refuses her `payroll` as a figure that does not exist (`metric` in `packages/record/src/index.ts`, over
 * the figure's `source`), and her own Inbox then read `note: "filed; payroll GBP 5200.00"`. `figureText` read with the
 * run's context and asked nobody. The first test below failed on that note, `filed; payroll GBP 5200.00` where the dash
 * was expected.
 *
 * AT THE RUN AND NOT ONLY AT INSTALL, because who reads a list changes after the rule is in: the owner invites a
 * bookkeeper to Inbox a month later, and a rule checked once at install would be writing Payroll into her list from
 * that day on. The test that invites her after the rule is installed holds that.
 *
 * THE KERNEL ASKS ITS OWN `member` ROWS, which are the authority (`members.ts`'s `access`), and reads a level exactly as
 * the record's `guard` does for `list`: the level held on that list or else on the record, inside the ceiling, and
 * `append` does not read.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 24, 12);
const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const DAY = 86_400_000;
const DASH = 'filed; payroll —';
const FILLED = 'filed; payroll GBP 5200.00';

const list = (id: string, name: string, fields: Record<string, unknown>[]): Declaration => ({
  id: `register.${id}`,
  kind: 'register',
  body: { id, name, title: 'what', fields: [{ id: 'what', type: 'text', required: true }, ...fields] } as never,
});

const SALARIES = list('salaries', 'Salaries', [{ id: 'pay', type: 'money' }]);
const INBOX = list('inbox', 'Inbox', [{ id: 'note', type: 'text' }]);
const DIARY = list('diary', 'Diary', [{ id: 'note', type: 'text' }]);

const PAYROLL: Declaration = {
  id: 'metric.payroll',
  kind: 'metric',
  body: { metric: 'payroll', name: 'Payroll', source: 'register.salaries', value: { sum: 'pay' }, format: 'money.GBP', target: { gte: 0 }, window: '30d', compare: 'none' } as never,
};

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

async function record(...decls: Declaration[]): Promise<{ k: Kernel; sql: NodeSql; clock: ReturnType<typeof fixedClock> }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  assert.ok(k.createRecord({ id: ID, slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  const out = await k.install([SALARIES, INBOX, DIARY, PAYROLL, ...decls]);
  assert.ok(out.ok, why(out));
  assert.ok(k.create('salaries', { what: 'Ada', pay: { amount: 520000, currency: 'GBP' } }, { actor: 'p_1' }).ok);
  return { k, sql, clock };
}

const invite = (k: Kernel, args: { level?: 'read' | 'write' | 'owner'; registers?: Record<string, 'read' | 'append' | 'write'> }): void => {
  const out = k.invite('p_1', { person: 'p_bea', email: 'bea@example.test', name: 'Bea', ...args });
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

test('F1: A MEMBER INVITED TO INBOX ALONE READS THE DASH WHERE THE PAYROLL WOULD BE, and the run still finishes', async () => {
  const { k, sql } = await record(FILE);
  invite(k, { registers: { inbox: 'read' } });
  assert.equal(await noteOf(k, 'inbox', 'Invoice from the printer'), DASH);
  assert.deepEqual(runsOf(sql, 'file'), [{ state: 'done', say: null }]);
  sql.close();
});

test('THE CONTROLS: the owner alone, and a member who reads Salaries too, read the figure', async () => {
  const alone = await record(FILE);
  assert.equal(await noteOf(alone.k, 'inbox', 'Invoice from the printer'), FILLED);
  alone.sql.close();

  const both = await record(FILE);
  invite(both.k, { registers: { inbox: 'read', salaries: 'read' } });
  assert.equal(await noteOf(both.k, 'inbox', 'Invoice from the printer'), FILLED);
  both.sql.close();
});

/* THE OTHER HALF OF THE QUESTION: SHE MUST READ WHERE IT LANDS. The checker took `lands` out of `hiddenFigure`, so any
   member who could not read Salaries hid the figure from every run, and all seven tests in this file still passed. A
   member of Diary alone reads neither Inbox nor Salaries, and the owner's own Inbox keeps the figure. */
test('A MEMBER WHO DOES NOT READ THE LIST THE RUN WRITES INTO hides nothing: invited to Diary alone, the Inbox note keeps the figure', async () => {
  const { k, sql } = await record(FILE);
  invite(k, { registers: { diary: 'read' } });
  assert.equal(await noteOf(k, 'inbox', 'Invoice from the printer'), FILLED);
  sql.close();
});

test('A MEMBER OF THE WHOLE RECORD HELD TO append ON SALARIES does not read it, so the figure is the dash for her too', async () => {
  const { k, sql } = await record(FILE);
  invite(k, { level: 'write', registers: { salaries: 'append' } });
  assert.equal(await noteOf(k, 'inbox', 'Invoice from the printer'), DASH);
  sql.close();
});

test('A MEMBER INVITED AFTER THE RULE WAS INSTALLED is asked about at the run, and the next row reads the dash', async () => {
  const { k, sql } = await record(FILE);
  assert.equal(await noteOf(k, 'inbox', 'First'), FILLED);
  invite(k, { registers: { inbox: 'read' } });
  assert.equal(await noteOf(k, 'inbox', 'Second'), DASH);
  sql.close();
});

test('A FIGURE KEPT IN A VARIABLE FIRST is the dash too, since the variable is written into the row later', async () => {
  const { k, sql } = await record(rule('file', [{ set_var: { name: 'pay', to: '{{metric.payroll}}' } }, { set: { field: 'note', to: 'filed; payroll {{vars.pay}}' } }]));
  invite(k, { registers: { inbox: 'read' } });
  assert.equal(await noteOf(k, 'inbox', 'Invoice from the printer'), DASH);
  sql.close();
});

/* A `create` NEEDS THE RUN'S ROW IN THIS BUILD: first written as a clock, the run failed "rule.tally's create step acts
   on a row, and this run has none to act on", so the rule is on Inbox and she reads Diary alone. What is measured is
   that the list created into is asked about, and not only the run's own row's list, which she does not read. */
test('A ROW THE RUN CREATES IN ANOTHER LIST counts that list: an Inbox rule writing into Diary, which she reads, writes the dash', async () => {
  const { k, sql } = await record(rule('tally', [{ create: { register: 'diary', bound: 1, fields: { what: 'Payroll today', note: 'payroll {{metric.payroll}}' } } }], undefined, { once_per: ['entry'] }));
  invite(k, { registers: { diary: 'read' } });
  assert.ok(k.create('inbox', { what: 'Invoice from the printer' }, { actor: 'p_1' }).ok);
  await k.drain();
  const row = sql.one<{ fields: string }>("SELECT fields FROM entry WHERE register = 'diary' ORDER BY rowid DESC LIMIT 1");
  assert.ok(row, `the run wrote no diary row: ${JSON.stringify(runsOf(sql, 'tally'))}`);
  assert.equal((JSON.parse(row.fields) as { note?: string }).note, 'payroll —');
  sql.close();
});

test('A RUN THAT WRITES NO ROW ANYBODY ELSE READS still reads the figure: a clock that only tells the owner', async () => {
  const clock = rule('tell', [{ notify: { say: 'payroll {{metric.payroll}}' } }], { every: '1d' });
  const { k, sql, clock: time } = await record(clock);
  invite(k, { registers: { inbox: 'read' } });
  time.advance(DAY);
  await k.drain();
  const said = sql.all<{ note: string }>("SELECT note FROM event WHERE kind = 'note' AND actor = 'rule:tell'").map((r) => r.note);
  assert.deepEqual(said, [`payroll GBP 5200.00`], JSON.stringify(runsOf(sql, 'tell')));
  sql.close();
});
