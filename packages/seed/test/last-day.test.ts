/**
 * Money's month-end decision, end to end: `last_day` is one of Money's automations, the schedule runs it once a
 * day, it fills each month-end line's days itself with no question in Decide, and the next night writes nothing.
 *
 * THE SCRIPT IS THE PACK'S OWN, RUN AS A HOST RUNS IT: the declaration's `source` imported as a module and handed a
 * `ctx` whose `list` is the kernel's own filter, and its `{ writes, ask }` handed back to the kernel through
 * `runActions`, as `follow-ups.test.ts` runs Work's. So what is measured is the pack document, the kernel's schedule,
 * the run's `ask` (`finishScript`) and the gate's patches on a pick (`decide`), and not a copy of any of them.
 *
 * RED FIRST: with `LAST_DAY_SCRIPT` out of `MONEY_AUTOMATIONS` nothing runs and no line is filled.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Entry, type Kernel, type ScriptAnswer, type Scripted } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

import { NOW, firstPartyDocument, gbp } from '../src/index.ts';
import { MONEY_AUTOMATIONS } from '../src/modules/money/rules.ts';

const OWNER = { actor: 'p_1' };
const DAY = 86_400_000;

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

type Found = { id: string; seq: number; version: number; fields: Record<string, unknown> };
const shaped = (e: Entry): Found => ({ id: e.id, seq: e.seq!, version: e.version, fields: e.fields });

/** The pack's source, run as a host's sandbox runs it: `list` through the kernel's filter, writes and ask handed back. */
function sandbox(k: Kernel) {
  return async (s: Scripted): Promise<ScriptAnswer> => {
    const writes: { op: 'update'; spoken: string; patch: unknown; version: number }[] = [];
    const ctx = {
      input: s.scripted.input,
      record: {
        list: async (register: string, where: unknown) => value<{ rows: Entry[] }>(k.list({ register, where: where as never })).rows.map(shaped),
        get: async (id: string) => {
          const e = k.get(id);
          return e ? shaped(e) : null;
        },
      },
      update: (spoken: string, patch: unknown, version: number) => void writes.push({ op: 'update', spoken, patch, version }),
      log: () => {},
    };
    const mod = (await import(`data:text/javascript,${encodeURIComponent(s.scripted.decl.source)}`)) as { default: (c: typeof ctx) => Promise<unknown> };
    const out = (await mod.default(ctx)) as { ask?: unknown } | null;
    return { writes, log: '', usage: { fetches: 0, bytes: 0, wall_ms: 1, cpu_ms: 1 }, ...(out && out.ask ? { ask: out.ask } : {}) };
  };
}

type Question = { id: string; cause?: string; body?: { about?: string; options?: { id: string; label: string; because: string; patches?: unknown[] }[] } };

/** A record holding money-core as its pack document says, with a clock this test moves on a night at a time. */
async function moneyCore() {
  const sql: NodeSql = openSqlite();
  let now = NOW;
  const k = await openRecord(sql, { now: () => now });
  value(k.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAE', slug: 'the-flat', name: 'The Flat', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  for (const id of ['portfolio', 'people', 'money-core']) {
    const pack = value<Pack>(await normalise(firstPartyDocument(id, { seeds: [] }), { kind: 'local' }));
    const state: Installed = { format: 1, primitives: 1, record_version: k.version(), packs: k.packs(), declarations: k.declarations() as Installed['declarations'], rows: k.census() };
    const diff = await plan(pack, state);
    value(await install(pack, diff, hostFor(k), diff.planHash));
  }
  const run = sandbox(k);
  const execute = (async () => {
    throw new Error('the script fetches nothing');
  }) as never;
  /** One night: the clock moves on past the script's next turn (a day, and the schedule's spread), the schedule fires,
      and the run reaches its sandbox. */
  const night = async () => {
    const due = sql.one<{ due_at: string }>("SELECT due_at FROM schedule WHERE kind = 'script' AND key = 'last_day' AND state = 'pending'")?.due_at;
    now = Math.max(now + DAY, due === undefined ? 0 : Date.parse(due)) + 60_000;
    for (let i = 0; i < 3; i++) {
      await k.drain();
      await k.runActions(execute, { script: run, limit: 50 });
    }
  };
  const runs = () => sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM event WHERE kind = 'pull' AND target = 'declaration:script.last_day' AND to_v IS NOT NULL")!.n;
  const asked = (status: string) => value<Question[]>(k.governance('suggestion', { status, apart: 'with' })).filter((q) => q.cause === 'money.last-day');
  /** What was asked, in its words: the `suggest` event's `to_v`, the only copy (`govern.ts` `propose`). */
  const said = (id: string) => sql.one<{ to_v: string }>("SELECT to_v FROM event WHERE kind = 'suggest' AND target = ?", `suggestion:${id}`)!.to_v;
  return { k, sql, night, runs, asked, said };
}

const line = (what: string, next_due: string) => ({ what, direction: 'in', amount: gbp(250_000), every: 'monthly', next_due, state: 'live' });

test("Money's automations carry the month-end script, which fetches nothing and runs once a day", () => {
  const d = MONEY_AUTOMATIONS.find((a) => a.script === 'last_day');
  assert.ok(d, 'last_day is not one of Money\'s automations');
  assert.deepEqual([d.pack, d.runs, d.egress, d.reads, d.writes], ['money-core', { every: '1d', rule: true }, [], ['recurring'], ['recurring']]);
});

test('a repeating line on a month end is decided at night and asked about never: no history keeps its date, and the next night writes nothing', async () => {
  const r = await moneyCore();
  const salary = value<Entry>(r.k.create('recurring', line('Salary', '2028-02-29'), OWNER));
  const gym = value<Entry>(r.k.create('recurring', line('Gym', '2026-10-29'), OWNER));
  const retainer = value<Entry>(r.k.create('recurring', { ...line('Retainer', '2026-11-30'), started: '2026-04-30', last_paid: '2026-10-31' }, OWNER));

  await r.night();
  assert.ok(r.runs() >= 1, 'the schedule never ran the script');
  assert.deepEqual(r.asked('open'), [], 'a month end was asked about');
  assert.equal(r.sql.one<{ n: number }>("SELECT COUNT(*) AS n FROM suggestion WHERE cause = 'money.last-day'")!.n, 0, 'a question was filed');

  const after = r.k.get(salary.id)!;
  assert.equal(after.fields.day_of_month, '29', 'a line with no history keeps its date');
  const { day_of_month: _days, ...rest } = after.fields;
  const { day_of_month: _none, ...before } = salary.fields;
  assert.deepEqual(rest, before, 'the decision wrote more than the days of the month');
  assert.equal(r.k.get(retainer.id)!.fields.day_of_month, 'last', 'a line paid on two month ends moves with them');
  assert.equal(r.k.get(gym.id)!.fields.day_of_month, gym.fields.day_of_month, 'a 29th that is no month end was written');

  const version = r.k.get(salary.id)!.version;
  const ran = r.runs();
  await r.night();
  assert.ok(r.runs() > ran, 'the second night did not run the script');
  assert.equal(r.k.get(salary.id)!.version, version, 'the second night wrote the line again');
  assert.deepEqual(r.asked('open'), []);
});
