/**
 * What a refused script run leaves on its run line, for everybody who reads the record as a whole (the record-log-and-ref
 * checker of wave thirty-seven, its one open finding).
 *
 * `script-log-visibility.test.ts` holds the log to the owner who reads every list the script touched. A thrown error's
 * message is script-controlled free text just as `ctx.log` is, and it reached the run line's `note`, which `logOf` leaves
 * visible to all: measured, a member at `write` held to `append` on Money read "Salary: Omar 91000" in `recentHistory`
 * after the script ran `throw new Error(...)` with the salary in it, as `tally did not finish, so it wrote nothing: tally
 * threw: Salary: Omar 91000`. The same held for a stopped engine's message and for a register name the script made up. A
 * write the record refused goes the same way, since its reason is the write path's sentence about what it was handed. So
 * the note names the script and what happened, and the why goes in the log, beside what the script said.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);
const DAY = 86_400_000;
const SALARY = 'Salary: Omar 91000';

const MONEY = {
  id: 'register.money',
  kind: 'register' as const,
  body: { id: 'money', name: 'Money', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'amount', type: 'int' }] } as never,
};
const SUMS = {
  id: 'register.sums',
  kind: 'register' as const,
  body: { id: 'sums', name: 'Sums', title: 'at', fields: [{ id: 'at', type: 'text', required: true }, { id: 'total', type: 'int' }] } as never,
};
const TALLY = {
  id: 'script.tally',
  kind: 'script' as const,
  body: { script: 'tally', runs: { every: '1d' }, egress: [], keys: [], reads: ['money'], writes: ['sums'], source: 'export default async function run(ctx) {}' } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const member: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'write' }, levels: { money: 'append' } };

type Line = { kind: string; target: string | null; to: Record<string, unknown> | null; note: string | null };
const usage = { fetches: 0, bytes: 0, wall_ms: 5, cpu_ms: 1 };

async function ran(answer: unknown) {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  const installed = await api.kernel.install([MONEY, SUMS, TALLY]);
  assert.ok(installed.ok, JSON.stringify(installed));
  assert.ok(api.kernel.create('money', { name: 'Salary: Omar', amount: 91000 }, { actor: 'p_1' }).ok);
  clock.advance(2 * DAY);
  const run = await api.kernel.runActions(async () => assert.fail('a script sends no action request'), { script: async () => answer as never });
  assert.equal(run.ran, 1, JSON.stringify(run));
  const line = async (ctx: CallContext): Promise<Line> => {
    const out = await api.recentHistory({}, ctx);
    assert.ok(out.ok, JSON.stringify(out));
    const found = (out.value.events as unknown as Line[]).find((e) => e.kind === 'pull' && e.target === 'declaration:script.tally');
    assert.ok(found, 'the reader is not shown that the script ran');
    return found;
  };
  return { sql, api, line };
}

const CASES: [string, unknown, RegExp][] = [
  ['a thrown error', { refused: { code: null, why: `tally threw: ${SALARY}` }, log: '', usage }, /^tally threw: Salary: Omar 91000$/u],
  ['a stopped engine', { refused: { code: null, why: `tally stopped the engine: ${SALARY}` }, log: 'started', usage }, /^tally stopped the engine: Salary: Omar 91000\nstarted$/u],
  ['a register it made up', { writes: [{ op: 'create', register: SALARY, fields: { at: 'x' } }], log: '', usage }, /asked to write to Salary: Omar 91000/u],
  ['a write the record refused', { writes: [{ op: 'create', register: 'sums', fields: { at: SALARY, total: 1 } }, { op: 'create', register: 'sums', fields: { at: SALARY, total: 'many' } }], log: '', usage }, /total takes a whole number/u],
];

for (const [what, answer, why] of CASES)
  test(`A RUN REFUSED FOR ${what.toUpperCase()} SAYS SO WITH NO WORD THE SCRIPT CHOSE, and the owner reads why in its log`, async () => {
    const { sql, api, line } = await ran(answer);
    assert.equal((await api.list({ register: 'money' }, member)).ok, false, 'the member reads Money, so this case proves nothing');
    const theirs = await line(member);
    assert.equal(theirs.to?.outcome, 'refused');
    assert.ok(!JSON.stringify(theirs).includes('Omar'), `her run line hands her the salary: ${JSON.stringify(theirs)}`);
    assert.match(theirs.note ?? '', /^tally .*its log says why\.$/u);
    const mine = await line(owner);
    assert.match(String(mine.to?.log), why, `the owner lost the reason: ${JSON.stringify(mine)}`);
    sql.close();
  });
