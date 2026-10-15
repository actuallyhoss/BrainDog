/**
 * `ctx.cycle` as a host hands it: the kernel's `cycleAfter` and no second copy, held to a shape, a size and a count.
 *
 * WHY IT IS HANDED. Money's line settler is held out of the pack because a sandbox cannot work out the day "Next"
 * moves to: that is the forecast walk's arithmetic. With the walk's own step behind `ctx.cycle`, a repeating line paid
 * this month can say next month's day.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cycleAfter, type CycleLine, type Scripted } from '@braindog/kernel';
import type { CtxHost, Json, ScriptDecl } from '@braindog/script';
import { runInQuickJs } from '@braindog/script/quickjs';

import { CYCLE_CALLS, CYCLE_CHARS, scriptCycle, scriptRunner, type ScriptCycle } from '../src/script.ts';

/** A leg as a pack's forecast declares one: the day, the cycle field and its tables, an end, a weekend rule. */
const LEG = {
  on: 'next',
  every: { field: 'cycle', months: { monthly: 1, quarterly: 3, yearly: 12 }, weeks: { weekly: 1, fortnightly: 2 }, twice: { twice_monthly: [1, 15] as [number, number] } },
  ends: 'until',
  weekend: 'moves',
};
const line = (fields: Record<string, Json>, more: Record<string, Json> = {}): Json => ({ leg: LEG, fields, ...more });

test('A MONTHLY LINE ON THE 1ST PAID ON 3 OCTOBER ANSWERS 1 NOVEMBER', async () => {
  const cycle = scriptCycle('settle_matched_line');
  assert.equal(await cycle('2026-10-03', line({ next: '2026-10-01', cycle: 'monthly' })), '2026-11-01');
  assert.equal(await cycle('2026-10-01', line({ next: '2026-10-01', cycle: 'monthly' })), '2026-11-01');
  assert.equal(await cycle('2026-09-28', line({ next: '2026-10-01', cycle: 'monthly' })), '2026-10-01');
});

test('A WEEKLY AND A FORTNIGHTLY LINE STEP BY SEVEN AND FOURTEEN DAYS', async () => {
  const cycle = scriptCycle('settle_matched_line');
  assert.equal(await cycle('2026-10-05', line({ next: '2026-10-05', cycle: 'weekly' })), '2026-10-12');
  assert.equal(await cycle('2026-10-06', line({ next: '2026-10-05', cycle: 'weekly' })), '2026-10-12');
  assert.equal(await cycle('2026-10-05', line({ next: '2026-10-05', cycle: 'fortnightly' })), '2026-10-19');
});

test('A LINE WITH NO CYCLE, A ONE-OFF OR ONE PAST ITS LAST DAY ANSWERS NULL', async () => {
  const cycle = scriptCycle('settle_matched_line');
  assert.equal(await cycle('2026-10-03', line({ next: '2026-10-01', cycle: '' })), null);
  assert.equal(await cycle('2026-10-03', line({ next: '2026-10-01', cycle: 'none' })), null);
  assert.equal(await cycle('2026-10-03', line({ next: '2026-10-01', cycle: 'whenever' })), null);
  assert.equal(await cycle('2026-10-03', { leg: { on: 'next' }, fields: { next: '2026-10-01' } }), null);
  assert.equal(await cycle('2026-10-03', line({ next: '2026-10-01', cycle: 'monthly', until: '2026-10-31' })), null);
});

test('IT IS THE WALK\'S OWN STEP: month ends, the anchor, rest days and twice a month answer as cycleAfter does', async () => {
  const cycle = scriptCycle('settle_matched_line');
  const cases: [string, CycleLine][] = [
    ['2026-01-31', { leg: LEG, fields: { next: '2026-01-31', cycle: 'monthly' } }],
    ['2026-02-28', { leg: LEG, fields: { next: '2026-02-28', cycle: 'monthly' }, anchorDay: 30 }],
    ['2026-10-29', { leg: LEG, fields: { next: '2026-10-30', cycle: 'monthly', moves: 'before' }, rest: [5, 6] }],
    ['2026-10-02', { leg: LEG, fields: { next: '2026-10-01', cycle: 'twice_monthly' } }],
    ['2026-10-02', { leg: LEG, fields: { next: '2026-10-01', cycle: 'quarterly' } }],
    ['2028-02-29', { leg: LEG, fields: { next: '2028-02-29', cycle: 'yearly' }, anchorDay: 29 }],
  ];
  for (const [day, l] of cases) assert.equal(await cycle(day, l as unknown as Json), cycleAfter(day, l), `${day} ${JSON.stringify(l.fields)}`);
  assert.equal(await cycle('2026-02-28', cases[1]![1] as unknown as Json), '2026-03-30');
  assert.equal(await cycle('2026-10-02', cases[3]![1] as unknown as Json), '2026-10-15');
});

test('A BAD DAY OR A BAD LINE ANSWERS NULL AND NEVER THROWS', async () => {
  const cycle = scriptCycle('settle_matched_line');
  const good = line({ next: '2026-10-01', cycle: 'monthly' });
  for (const day of ['2026-02-30', '2026-13-01', 'soon', '', '2026-10-3', '2026-10-03T10:00:00Z', 42, null])
    assert.equal(await cycle(day as unknown as string, good), null, String(day));
  const bad: Json[] = [
    null,
    'monthly',
    [],
    { fields: { next: '2026-10-01' } },
    { leg: LEG },
    { leg: { ...LEG, on: '' }, fields: { next: '2026-10-01', cycle: 'monthly' } },
    { leg: { ...LEG, on: 7 }, fields: { next: '2026-10-01', cycle: 'monthly' } },
    { leg: { ...LEG, every: { field: 'cycle', months: { monthly: 'one' } } }, fields: { next: '2026-10-01', cycle: 'monthly' } },
    { leg: { ...LEG, every: { field: 'cycle', months: { monthly: 0.5 } } }, fields: { next: '2026-10-01', cycle: 'monthly' } },
    { leg: { ...LEG, every: { field: 'cycle', twice: { twice_monthly: [15, 1] } } }, fields: { next: '2026-10-01', cycle: 'twice_monthly' } },
    { leg: { ...LEG, every: 'monthly' }, fields: { next: '2026-10-01', cycle: 'monthly' } },
    { leg: { ...LEG, ends: 3 }, fields: { next: '2026-10-01', cycle: 'monthly' } },
    line({ next: '2026-10-01', cycle: 'monthly' }, { rest: [7] }),
    line({ next: '2026-10-01', cycle: 'monthly' }, { rest: 'weekends' }),
    line({ next: '2026-10-01', cycle: 'monthly' }, { anchorDay: 'first' }),
    line({ next: 'first of the month', cycle: 'monthly' }),
    line({ next: '2026-10-01', cycle: 'monthly', until: 'later' }),
    line({ next: '2026-10-01', cycle: 'monthly', pad: 'x'.repeat(CYCLE_CHARS) }),
  ];
  for (const l of bad) assert.equal(await cycle('2026-10-03', l), null, JSON.stringify(l).slice(0, 120));
  assert.equal(await cycle('2026-10-03', good), '2026-11-01');
});

test('A RUN IS ANSWERED CYCLE_CALLS TIMES AND REFUSED THE REST, each run on its own count', async () => {
  const cycle = scriptCycle('settle_matched_line');
  const l = line({ next: '2026-10-01', cycle: 'monthly' });
  for (let i = 0; i < CYCLE_CALLS - 1; i++) await cycle('2026-10-03', l);
  /* A BAD ASK IS COUNTED TOO: the host did the work of reading it. */
  assert.equal(await cycle('soon', l), null);
  await assert.rejects(cycle('2026-10-03', l), /settle_matched_line asked for more than 1000 next days in one run/);
  assert.equal(await scriptCycle('settle_matched_line')('2026-10-03', l), '2026-11-01');
});

test('scriptRunner HANDS THE SANDBOX cycle, and a script that reads and fetches nothing is still handed it', async () => {
  let handed: ScriptCycle | undefined;
  const runner = scriptRunner({
    run: async (_decl, host) => {
      handed = host.cycle;
      return { writes: [], log: '', usage: { fetches: 0, bytes: 0, wall_ms: 0, cpu_ms: 0 } } as never;
    },
    send: async () => { throw new Error('nothing is sent'); },
    openKey: null,
    grantOf: () => null,
    now: () => 0,
  });
  const s = {
    job: { id: 'j_1' },
    scripted: { script: 'settle_matched_line', version: 1, actor: 'a_1', record: { tz: 'UTC' }, input: null, decl: { egress: [], keys: [], reads: [], writes: [], source: '' } },
  } as unknown as Scripted;
  await runner(s);
  assert.equal(typeof handed, 'function');
  assert.equal(await handed!('2026-10-03', line({ next: '2026-10-01', cycle: 'monthly' })), '2026-11-01');
});

/* ── across the sandbox ─────────────────────────────────────────────────────────────────────────── */

const decl = (source: string): ScriptDecl => ({ id: 'settle_matched_line', version: 1, egress: [], keys: [], reads: [], writes: ['seen'], source });
const sandboxHost = (cycle?: ScriptCycle): CtxHost => ({
  fetch: async () => ({ status: 200, headers: {}, body: '' }),
  ...(cycle === undefined ? {} : { cycle }),
  now: () => '2026-10-03T10:00:00Z',
  clock: () => 0,
  tz: 'UTC',
  input: null,
});
const SAYS = `export default async function run(ctx) {
  const leg = ${JSON.stringify(LEG)};
  ctx.write('seen', {
    has: typeof ctx.cycle,
    next: typeof ctx.cycle === 'function' ? await ctx.cycle('2026-10-03', { leg, fields: { next: '2026-10-01', cycle: 'monthly' } }) : 'none',
    bad: typeof ctx.cycle === 'function' ? await ctx.cycle('soon', { leg, fields: {} }) : 'none',
    nothing: typeof ctx.cycle === 'function' ? await ctx.cycle('2026-10-03') : 'none',
  });
}`;

test('IN THE SANDBOX, ctx.cycle answers the next day, and null for a bad ask', async () => {
  const a = await runInQuickJs(decl(SAYS), sandboxHost(scriptCycle('settle_matched_line')));
  assert.ok('writes' in a, JSON.stringify(a));
  assert.deepEqual(a.writes, [{ op: 'create', register: 'seen', fields: { has: 'function', next: '2026-11-01', bad: null, nothing: null } }]);
});

test('A HOST THAT HANDS NONE leaves the script with no ctx.cycle, not one that answers nothing', async () => {
  const a = await runInQuickJs(decl(SAYS), sandboxHost());
  assert.ok('writes' in a, JSON.stringify(a));
  assert.deepEqual(a.writes, [{ op: 'create', register: 'seen', fields: { has: 'undefined', next: 'none', bad: 'none', nothing: 'none' } }]);
});

test('PAST THE COUNT, the sandbox gets an error the script may catch', async () => {
  const cycle = scriptCycle('settle_matched_line');
  const a = await runInQuickJs(
    decl(`export default async function run(ctx) {
      let said = '';
      for (let i = 0; i <= ${CYCLE_CALLS}; i++) { try { await ctx.cycle('2026-10-03', null); } catch (e) { said = String(e.message); } }
      ctx.write('seen', { said });
    }`),
    sandboxHost(cycle),
  );
  assert.ok('writes' in a, JSON.stringify(a));
  assert.deepEqual(a.writes, [{ op: 'create', register: 'seen', fields: { said: 'settle_matched_line asked for more than 1000 next days in one run, so no more were answered.' } }]);
});
