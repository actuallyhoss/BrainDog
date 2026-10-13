/**
 * Money's own rule starts the plans script (plans-list-66, REC-B12; wired in integrate 66), as `money-settle-rule.test.ts`
 * holds `payment-settles`: the rule as Money's pack document installs it, on a record, with a sandbox that runs the
 * queued script's declared source. `money-plans.test.ts` measures the script; this measures that anything starts it.
 *
 * RED FIRST: with `part-counts-plan` out of `MONEY_AUTOMATIONS` nothing is queued when a part is made, and with
 * `plan_row` or `left_after` among the rule's fields the script's own writes start it again without end.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Entry, type Kernel, type ScriptAnswer, type Scripted } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { NOW, firstPartyDocument, gbp } from '../src/index.ts';
import { MONEY_AUTOMATIONS } from '../src/modules/money/rules.ts';
import { PLANS_FROM_NAMES_SCRIPT } from '../src/modules/money/scripts/plans-from-names.js';

type Fields = Record<string, unknown>;
const OWNER = { actor: 'p_1' };
const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T };
  assert.ok(x.ok, sayOf(r as never));
  return x.value;
};
const hostFor = (k: Kernel): Host => ({
  count: (register) => k.count(register),
  stage: (batch) => k.stageInstall(batch as never),
  transaction: (fn) => k.transaction(fn),
  reload: () => k.reload(),
  retire: (ids) => k.retire(ids),
  seed: (register, fields) => k.create(register, { ...fields, tags: ['example'] }, { actor: 'p_seed', cascade: false }) as never,
  remember: (row) => k.rememberPack(row),
  forget: (id) => k.forgetPack(id),
  claimed: (pack) => k.packClaims(pack),
});

type Queued = { script: string; input: Fields };
type ScriptWrite = Extract<ScriptAnswer, { writes: unknown }>['writes'][number];

/** A record holding Money as its pack document says it, and a sandbox that runs a queued script's declared source. */
async function money() {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  for (const id of ['portfolio', 'people', 'money-core'] as const) {
    const pack = value<Pack>(await normalise(firstPartyDocument(id, { seeds: [] }), { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census() };
    const diff = await plan(pack, state);
    value(await install(pack, diff, hostFor(k), diff.planHash));
  }
  const rowsOf = (register: string) => value<{ rows: Entry[] }>(k.list({ register, limit: 500 })).rows;
  const part = (n: number, more: Fields = {}) =>
    value<Entry>(k.create('installments', { what: `Desk, part ${n}`, plan: 'Desk', number: n, direction: 'out', amount: gbp(10_000), due: `2027-0${n}-01`, state: 'open', ...more }, OWNER));

  const log: string[] = [];
  const shaped = (e: Entry) => ({ id: e.id, register: e.register, seq: e.seq!, version: e.version, fields: e.fields });
  const sandbox = async (s: Scripted): Promise<ScriptAnswer> => {
    const writes: ScriptWrite[] = [];
    const ctx = {
      input: s.scripted.input,
      record: {
        get: async (said: string) => {
          const e = k.get(said);
          return e ? shaped(e) : null;
        },
        list: async (register: string, where: unknown) => value<{ rows: Entry[] }>(k.list({ register, ...(where === undefined ? {} : { where: where as never }) })).rows.map(shaped),
      },
      write: (register: string, fields: unknown) => void writes.push({ op: 'create', register, fields }),
      update: (spoken: string, patch: unknown, version: number) => void writes.push({ op: 'update', spoken, patch, version }),
      log: (...words: string[]) => void log.push(words.join(' ')),
    };
    const mod = (await import(`data:text/javascript,${encodeURIComponent(s.scripted.decl.source)}`)) as { default: (c: typeof ctx) => Promise<unknown> };
    await mod.default(ctx);
    return { writes, log: log.join('\n'), usage: { fetches: 0, bytes: 0, wall_ms: 1, cpu_ms: 1 } };
  };
  const execute = (async () => {
    throw new Error('no call is taken here');
  }) as never;
  /** The schedule and then the outbox: how a run reaches its steps, and a script its sandbox. */
  const turn = async (rounds = 2) => {
    for (let i = 0; i < rounds; i++) {
      await k.drain();
      await k.runActions(execute, { script: sandbox, limit: 50 });
    }
  };
  const queued = (): Queued[] => sql.all<{ payload: string }>("SELECT payload FROM outbox WHERE kind = 'script.run' ORDER BY rowid").map((r) => JSON.parse(r.payload) as Queued);
  return { k, part, turn, queued, rowsOf, log };
}

const RULE = MONEY_AUTOMATIONS.find((a) => a.rule === 'part-counts-plan') as { on: { written: { register: string; fields: string[] } }; steps: { script: { id: string } }[] } | undefined;

test("Money's document holds the rule and the script it starts, and the rule does not listen to what the script writes", () => {
  assert.ok(RULE, 'no rule starts the plans script');
  assert.ok(MONEY_AUTOMATIONS.includes(PLANS_FROM_NAMES_SCRIPT), 'the script is in no pack document');
  assert.equal(RULE.steps[0]!.script.id, PLANS_FROM_NAMES_SCRIPT.script);
  assert.equal(RULE.on.written.register, 'installments');
  for (const own of ['plan_row', 'left_after']) assert.equal(RULE.on.written.fields.includes(own), false, `${own} is written by the script, so the rule would start itself`);
});

test('a part made starts the script, handed the part by its list and number', async () => {
  const m = await money();
  const one = m.part(1);
  await m.k.drain();
  const mine = m.queued().filter((q) => q.script === 'plans_from_names');
  assert.equal(mine.length, 1);
  assert.deepEqual([mine[0]!.input.id, mine[0]!.input.register, mine[0]!.input.seq], [one.id, 'installments', one.seq]);
});

test('parts made on a record get their plan, their link and what is left after each, and the script does not start itself', async () => {
  const m = await money();
  m.part(1);
  m.part(2);
  m.part(3);
  await m.turn(4);
  const plans = m.rowsOf('plans');
  assert.deepEqual(plans.map((p) => [p.fields.name, p.fields.state]), [['Desk', 'open']], m.log.join(' '));
  const parts = m.rowsOf('installments').sort((a, b) => Number(a.fields.number) - Number(b.fields.number));
  /* THE PLAN IS MADE BY THE RUN THAT FIRST SEES ITS NAME, AND THE PARTS ARE LINKED BY A LATER ONE: three parts made three
     runs, so the link is there without waiting for the night. */
  assert.deepEqual(parts.map((p) => p.fields.plan_row), [plans[0]!.id, plans[0]!.id, plans[0]!.id], m.log.join(' '));
  assert.deepEqual(parts.map((p) => p.fields.left_after), [gbp(20_000), gbp(10_000), gbp(0)]);

  /* NOTHING MORE IS QUEUED BY WHAT THE SCRIPT WROTE. */
  const before = m.queued().length;
  await m.turn(3);
  assert.equal(m.queued().length, before, 'the script started itself');

  /* AND A PART PAID RECOUNTS THE PARTS BEFORE IT. */
  value(m.k.update('installments', parts[1]!.id, { state: 'paid' }, OWNER));
  await m.turn();
  const after = m.rowsOf('installments').sort((a, b) => Number(a.fields.number) - Number(b.fields.number));
  assert.deepEqual(after.map((p) => p.fields.left_after), [gbp(10_000), gbp(10_000), gbp(0)]);
});
