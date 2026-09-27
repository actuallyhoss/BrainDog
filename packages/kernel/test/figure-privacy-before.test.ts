/**
 * A figure written into a row stays in the row, so it has to be safe for whoever reads the row LATER, not only for who
 * reads it at the run (audit sixty-four, finding 1: `loop/research-batch-sixty-four-audit.md` §1, probe V1).
 *
 * WHAT WAS MEASURED BEFORE THE REPAIR. `hiddenFigure` asked the `member` rows at the moment the run filled the figure.
 * V1: Salaries (Ada, GBP 5,200.00), Inbox, `metric.payroll` over Salaries, and a rule setting each new inbox note to
 * `filed; payroll {{metric.payroll}}`. The owner filed one Inbox row, invited Bea to Inbox alone, and filed another:
 * `{"before":"filed; payroll GBP 5200.00","after":"filed; payroll <U+2014>"}`. Bea read the first. The first test below
 * failed on that note. Two more readers were never asked: a script whose `reads:` names Inbox and not Salaries, and
 * anybody invited next month.
 *
 * THE RULE NOW: a run writes a figure into a row only when the figure adds up that same list. Only then is every
 * reader of the row, whoever is invited later, somebody who may read the figure, because to read the row is to read
 * the list the figure is over. Any other figure is written as `--withheld--`, whoever is a member today, the owner alone
 * included. A run that lands in no row (a clock that only tells the owner) still reads every figure.
 *
 * AND THE PLACEHOLDER IS NOT AN EM DASH. The dash was the character this tree's prose rule forbids, written into a row
 * a stranger reads, and it read as a hole in the sentence rather than as a value held back on purpose.
 *
 * INSTALL NOW REFUSES V1'S RULE (`figure-install-warning.test.ts`), which is where the owner is told. So the rule goes
 * in here while `payroll` reads a series, which is over no list, and `payroll` is then pointed at Salaries: an install
 * with no rule in it, which the lint does not read, and the one way a record comes to hold this rule now.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 24, 12);
const ID = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD';
const DAY = 86_400_000;
const WITHHELD = 'filed; payroll --withheld--';

const list = (id: string, fields: Record<string, unknown>[]): Declaration => ({
  id: `register.${id}`,
  kind: 'register',
  body: { id, name: id, title: 'what', fields: [{ id: 'what', type: 'text', required: true }, ...fields] } as never,
});

const SALARIES = list('salaries', [{ id: 'pay', type: 'money' }, { id: 'note', type: 'text' }]);
const INBOX = list('inbox', [{ id: 'note', type: 'text' }]);

const figure = (source: string): Declaration => ({
  id: 'metric.payroll',
  kind: 'metric',
  body: { metric: 'payroll', name: 'Payroll', source, value: { sum: 'pay' }, format: 'money.GBP', target: { gte: 0 }, window: '30d', compare: 'none' } as never,
});
const PAYROLL = figure('register.salaries');
const OVER_NO_LIST = figure('series.payroll');

const rule = (name: string, steps: unknown[], on: unknown = { written: { register: 'inbox', op: ['create'] } }): Declaration => ({
  id: `rule.${name}`,
  kind: 'rule',
  body: { rule: name, on, steps } as never,
});

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
  const out = await k.install([SALARIES, INBOX, OVER_NO_LIST, ...decls]);
  assert.ok(out.ok, why(out));
  const moved = await k.install([PAYROLL]);
  assert.ok(moved.ok, why(moved));
  assert.ok(k.create('salaries', { what: 'Ada', pay: { amount: 520000, currency: 'GBP' } }, { actor: 'p_1' }).ok);
  return { k, sql, clock };
}

const noteOf = async (k: Kernel, register: string, what: string): Promise<{ id: string; note: unknown }> => {
  const made = k.create(register, { what }, { actor: 'p_1' });
  assert.ok(made.ok, why(made));
  await k.drain();
  return { id: made.value.id, note: k.get(made.value.id)?.fields.note };
};

test('V1: A BOOKKEEPER INVITED TO INBOX AFTER A RUN READS NO PAYROLL IN THE NOTE WRITTEN BEFORE SHE CAME', async () => {
  const { k, sql } = await record(FILE);
  const before = await noteOf(k, 'inbox', 'Invoice from the printer');
  const invited = k.invite('p_1', { person: 'p_bea', email: 'bea@example.test', name: 'Bea', registers: { inbox: 'read' } });
  assert.ok(invited.ok, why(invited));
  const after = await noteOf(k, 'inbox', 'Receipt from the courier');
  assert.doesNotMatch(String(k.get(before.id)?.fields.note), /5,?200/u, 'Bea, invited to Inbox alone, reads the payroll in the row written before she came');
  assert.equal(before.note, WITHHELD);
  assert.equal(after.note, WITHHELD);
  /* AND THE ROW'S HISTORY SAYS THE SAME, since it holds what was written. */
  const history = sql.all<{ to_v: string | null }>("SELECT to_v FROM event WHERE target = ? AND to_v IS NOT NULL", `entry:${before.id}`).map((e) => e.to_v ?? '');
  assert.ok(history.some((v) => v.includes('--withheld--')), `the history holds no note: ${history.join(' | ')}`);
  assert.ok(!history.some((v) => /5,?200/u.test(v)), history.join(' | '));
  sql.close();
});

test('THE PLACEHOLDER IS NOT AN EM DASH, for a member who reads Inbox alone today as much as for one who comes later', async () => {
  const { k, sql } = await record(FILE);
  assert.ok(k.invite('p_1', { person: 'p_bea', email: 'bea@example.test', name: 'Bea', registers: { inbox: 'read' } }).ok);
  const { note } = await noteOf(k, 'inbox', 'Invoice from the printer');
  assert.ok(!String(note).includes('—'), `the note reads ${JSON.stringify(note)}`);
  assert.equal(note, WITHHELD);
  sql.close();
});

test('A FIGURE OVER THE LIST IT IS WRITTEN INTO IS WRITTEN, members or not, since every reader of the row reads that list', async () => {
  const own = rule('own', [{ set: { field: 'note', to: 'filed; payroll {{metric.payroll}}' } }], { written: { register: 'salaries', op: ['create'] } });
  const { k, sql } = await record(own);
  assert.ok(k.invite('p_1', { person: 'p_bea', email: 'bea@example.test', name: 'Bea', registers: { salaries: 'read' } }).ok);
  const made = k.create('salaries', { what: 'Bo', pay: { amount: 100000, currency: 'GBP' } }, { actor: 'p_1' });
  assert.ok(made.ok, why(made));
  await k.drain();
  assert.equal(k.get(made.value.id)?.fields.note, 'filed; payroll GBP 6,200.00');
  sql.close();
});

test('A SCRIPT THAT READS INBOX AND NOT SALARIES reads no payroll in an Inbox row, with nobody but the owner on the record', async () => {
  const { k, sql } = await record(FILE);
  const { note } = await noteOf(k, 'inbox', 'Invoice from the printer');
  assert.equal(note, WITHHELD, 'a note written while the owner was alone is read by whatever reads Inbox afterwards');
  sql.close();
});

test('A RUN THAT WRITES NO ROW still reads the figure: a clock that only tells the owner', async () => {
  const { k, sql, clock } = await record(rule('tell', [{ notify: { say: 'payroll {{metric.payroll}}' } }], { every: '1d' }));
  assert.ok(k.invite('p_1', { person: 'p_bea', email: 'bea@example.test', name: 'Bea', registers: { inbox: 'read' } }).ok);
  clock.advance(DAY);
  await k.drain();
  const said = sql.all<{ note: string }>("SELECT note FROM event WHERE kind = 'note' AND actor = 'rule:tell'").map((r) => r.note);
  assert.deepEqual(said, ['payroll GBP 5,200.00']);
  sql.close();
});
