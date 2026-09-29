/**
 * The owner is told at install that a figure over another list would be written `--withheld--` into the row, as he
 * decided it.
 *
 * WHAT WAS MEASURED BEFORE THIS. With the run writing `--withheld--` for every figure over a list other than the one
 * the row is in (`hiddenFigure` in `flow.ts`), the measured rule, `filed; payroll {{metric.payroll}}` into each new
 * Inbox row over a figure summing Salaries, still installed without a word, and the first the owner heard of it was the
 * placeholder in the row. Every refusal below was `null` from `figureFault`, and the rule went in.
 *
 * A REFUSAL, BECAUSE INSTALL HAS NO WARNING TO CARRY. `install` answers `Result<Installed[]>`, whose value is each
 * declaration's `{ id, version, changed }`, and nothing beside it reaches the owner. The lists a run lands in are
 * written in the rule (its `written` list and its `create` steps), so a rule refused here is one whose run would write
 * the placeholder every time; the fix in the refusal is what to write instead.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, validateDeclaration, type Declaration } from '../src/index.ts';
import { figureFault } from '../src/figure.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 24, 12);

const list = (id: string, fields: Record<string, unknown>[]): Declaration => ({
  id: `register.${id}`,
  kind: 'register',
  body: { id, name: id, title: 'what', fields: [{ id: 'what', type: 'text', required: true }, ...fields] } as never,
});

const SALARIES = list('salaries', [{ id: 'pay', type: 'money' }, { id: 'note', type: 'text' }]);
const INBOX = list('inbox', [{ id: 'note', type: 'text' }]);
const DIARY = list('diary', [{ id: 'note', type: 'text' }]);

const PAYROLL: Declaration = {
  id: 'metric.payroll',
  kind: 'metric',
  body: { metric: 'payroll', name: 'Payroll', source: 'register.salaries', value: { sum: 'pay' }, format: 'money.GBP', target: { gte: 0 }, window: '30d', compare: 'none' } as never,
};

const known = new Map([SALARIES, INBOX, DIARY, PAYROLL].map((d) => [d.id, d.body as Record<string, never>]));

const onInbox = { written: { register: 'inbox', op: ['create'] } };
const onSalaries = { written: { register: 'salaries', op: ['create'] } };
const rule = (body: Record<string, unknown>): Declaration => ({ id: `rule.${body.rule as string}`, kind: 'rule', body: body as never });

test("THE MEASURED RULE IS REFUSED AT INSTALL, and the refusal says the note would read --withheld-- and why", async () => {
  const body = { rule: 'file', on: onInbox, steps: [{ set: { field: 'note', to: 'filed; payroll {{metric.payroll}}' } }] };
  const said = figureFault('rule.file', body, 'run', known);
  assert.equal(said?.code, 'DECLARATION_INVALID');
  assert.equal(said?.at, 'steps[0].set.to');
  assert.match(said!.fix, /writes into inbox, and payroll adds up salaries/);
  assert.match(said!.fix, /--withheld--/);
  assert.match(said!.fix, /whoever reads inbox later/);
  assert.doesNotMatch(said!.fix, /—/, 'the refusal is prose a stranger reads');

  /* THROUGH THE RECORD, since install is what hands the lint the figures it knows, and nothing is installed. */
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([SALARIES, INBOX, DIARY, PAYROLL])).ok);
  const refused = await k.install([rule(body)]);
  assert.equal(refused.ok, false, 'a rule whose run could only write the placeholder went in without a word');
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM declaration WHERE id = 'rule.file'")?.n, 0);
  sql.close();
});

test('A FIGURE KEPT IN A VARIABLE FIRST, AND ONE IN A CONDITION, are refused where they are read, since the run withholds every fill', () => {
  const kept = figureFault(
    'rule.file',
    { rule: 'file', on: onInbox, steps: [{ set_var: { name: 'pay', to: '{{metric.payroll}}' } }, { set: { field: 'note', to: 'filed; payroll {{vars.pay}}' } }] },
    'run',
    known,
  );
  assert.equal(kept?.at, 'steps[0].set_var.to');

  const asked = figureFault('rule.file', { rule: 'file', on: onInbox, steps: [{ if: 'what is {{metric.payroll}}', then: [{ notify: { say: 'same' } }] }] }, 'run', known);
  assert.equal(asked?.at, 'steps[0].if');
});

test('A ROW CREATED IN ANOTHER LIST IS A LIST THE RUN LANDS IN, however well the trigger list matches the figure', () => {
  const said = validateDeclaration(
    rule({ rule: 'tally', on: onSalaries, once_per: ['entry'], steps: [{ create: { register: 'diary', bound: 1, fields: { what: 'Payroll today', note: 'payroll {{metric.payroll}}' } } }] }),
    known,
  );
  assert.equal(said?.code, 'DECLARATION_INVALID');
  assert.match(said!.fix, /writes into diary, and payroll adds up salaries/);
});

test('WHAT STILL INSTALLS: a figure over the list it lands in, a notify on a clock, and a button with nothing to create', () => {
  const own = validateDeclaration(rule({ rule: 'own', on: onSalaries, steps: [{ set: { field: 'note', to: 'payroll {{metric.payroll}}' } }] }), known);
  assert.equal(own, null, JSON.stringify(own));
  const clock = validateDeclaration(rule({ rule: 'tell', on: { every: '1d' }, steps: [{ notify: { say: 'payroll {{metric.payroll}}' } }] }), known);
  assert.equal(clock, null, JSON.stringify(clock));
  const button = validateDeclaration(rule({ rule: 'press', on: { manual: true }, steps: [{ notify: { say: 'payroll {{metric.payroll}}' } }] }), known);
  assert.equal(button, null, JSON.stringify(button));
  /* AND WITH NOTHING INSTALLED TO READ, only the spelling is checked, as every other lint in `figureFault` does. */
  assert.equal(figureFault('rule.file', { rule: 'file', on: onInbox, steps: [{ set: { field: 'note', to: '{{metric.payroll}}' } }] }, 'run'), null);
});
