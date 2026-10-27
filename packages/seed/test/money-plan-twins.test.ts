/**
 * Two plans of one name written two ways, end to end: the night's run of
 * `plans_from_names` files one question on Decide, nothing is moved until it is answered, "Make them one" closes the
 * second plan and links it to the first, and the run that answer starts moves its parts to the first.
 *
 * AS `last-day.test.ts` RUNS ITS SCRIPT: the pack's declared `source` imported as a module, handed a `ctx` whose `list`
 * is the kernel's own filter, and its `{ writes, ask }` handed back through `runActions`. So what is measured is Money's
 * document, the kernel's schedule, the run's `ask`, the gate's patches on a pick and the rule they start.
 *
 * RED FIRST: with the name matched letter for letter a part written "loft" makes a third plan; with no `one_with` on
 * Plans the patch is refused; with no `plan-made-one` the parts stay on the closed plan until the night.
 *
 * THE NAMES ARE INVENTED, as every test's are.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { openRecord, type Entry, type Kernel, type ScriptAnswer, type Scripted } from '@braindog/kernel';
import { sayOf } from '@braindog/ports';
import { openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

import { NOW, firstPartyDocument, gbp } from '../src/index.ts';

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

const shaped = (e: Entry) => ({ id: e.id, seq: e.seq!, version: e.version, fields: e.fields });

/** The pack's source, run as a host's sandbox runs it: writes and its ask handed back to the kernel. */
function sandbox(k: Kernel) {
  return async (s: Scripted): Promise<ScriptAnswer> => {
    const writes: unknown[] = [];
    const ctx = {
      input: s.scripted.input,
      record: {
        list: async (register: string, where: unknown) => value<{ rows: Entry[] }>(k.list({ register, ...(where === undefined ? {} : { where: where as never }) })).rows.map(shaped),
        get: async (id: string) => {
          const e = k.get(id);
          return e ? shaped(e) : null;
        },
      },
      write: (register: string, fields: unknown) => void writes.push({ op: 'create', register, fields }),
      update: (spoken: string, patch: unknown, version: number) => void writes.push({ op: 'update', spoken, patch, version }),
      log: () => {},
    };
    const mod = (await import(`data:text/javascript,${encodeURIComponent(s.scripted.decl.source)}`)) as { default: (c: typeof ctx) => Promise<unknown> };
    const out = (await mod.default(ctx)) as { ask?: unknown } | null;
    return { writes, log: '', usage: { fetches: 0, bytes: 0, wall_ms: 1, cpu_ms: 1 }, ...(out && out.ask ? { ask: out.ask } : {}) } as ScriptAnswer;
  };
}

type Question = { id: string; cause?: string; body?: { about?: string; options?: { id: string; label: string; because: string; patches?: unknown[] }[] } };

async function money() {
  const sql: NodeSql = openSqlite();
  let now = NOW;
  const k = await openRecord(sql, { now: () => now });
  value(k.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAE', slug: 'the-loft', name: 'The Loft', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
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
  const turn = async (rounds = 3) => {
    for (let i = 0; i < rounds; i++) {
      await k.drain();
      await k.runActions(execute, { script: run, limit: 50 });
    }
  };
  /** One night: the clock moves past the script's next turn, the schedule fires, and the run reaches its sandbox. */
  const night = async () => {
    const due = sql.one<{ due_at: string }>("SELECT due_at FROM schedule WHERE kind = 'script' AND key = 'plans_from_names' AND state = 'pending'")?.due_at;
    now = Math.max(now + DAY, due === undefined ? 0 : Date.parse(due)) + 60_000;
    await turn();
  };
  const rowsOf = (register: string) => value<{ rows: Entry[] }>(k.list({ register, limit: 500 })).rows.sort((a, b) => a.seq! - b.seq!);
  const asked = (status: string) => value<Question[]>(k.governance('suggestion', { status })).filter((q) => (q.cause ?? '').startsWith('plans.twins:'));
  const said = (id: string) => sql.one<{ to_v: string }>("SELECT to_v FROM event WHERE kind = 'suggest' AND target = ?", `suggestion:${id}`)!.to_v.replace(/^"|"$/gu, '');
  const part = (plan: string, n: number) =>
    value<Entry>(k.create('installments', { what: `${plan}, part ${n}`, plan, number: n, direction: 'out', amount: gbp(10_000), due: `2027-0${n}-01`, state: 'open' }, OWNER));
  return { k, turn, night, rowsOf, asked, said, part };
}

test('a part written in other capitals joins the plan already here, and no second plan is made', async () => {
  const m = await money();
  m.part('Loft', 1);
  await m.turn();
  m.part('loft', 2);
  m.part('LOFT ', 3);
  await m.turn();
  const plans = m.rowsOf('plans');
  assert.deepEqual(plans.map((p) => p.fields.name), ['Loft']);
  assert.deepEqual(m.rowsOf('installments').map((p) => p.fields.plan_row), [plans[0]!.id, plans[0]!.id, plans[0]!.id]);
  assert.deepEqual(m.rowsOf('installments').map((p) => p.fields.left_after), [gbp(20_000), gbp(10_000), gbp(0)]);
});

test('two plans already here under one name are asked about once, and his yes makes them one plan, deleting nothing', async () => {
  const m = await money();
  /* AS THE AUDIT FOUND IT: "Loft" with its first part, and "loft" made later for the rest. */
  const first = value<Entry>(m.k.create('plans', { name: 'Loft', state: 'open' }, OWNER));
  const second = value<Entry>(m.k.create('plans', { name: 'loft', state: 'open' }, OWNER));
  m.part('Loft', 1);
  m.part('loft', 2);
  m.part('loft', 3);
  await m.turn();
  /* NOTHING IS MOVED BEFORE HE ANSWERS: each part stays with the plan its text names. */
  assert.deepEqual(m.rowsOf('installments').map((p) => p.fields.plan_row), [first.id, second.id, second.id]);

  await m.night();
  const open = m.asked('open');
  assert.equal(open.length, 1, JSON.stringify(open));
  assert.equal(m.said(open[0]!.id), 'Loft and loft are one plan written two ways. Make them one plan?');
  assert.deepEqual(m.rowsOf('installments').map((p) => p.fields.plan_row), [first.id, second.id, second.id], 'the question moved nothing');

  /* A SECOND NIGHT ASKS NOTHING MORE. */
  await m.night();
  assert.equal(m.asked('open').length, 1);

  const yes = open[0]!.body!.options!.find((o) => o.label === 'Make them one')!;
  value(m.k.decide(open[0]!.id, { decide: { option: yes.id, reason: 'One flat.' } }, 'p_1'));
  await m.turn();
  const plans = m.rowsOf('plans');
  assert.deepEqual(plans.map((p) => [p.fields.name, p.fields.state, p.fields.one_with ?? null]), [['Loft', 'open', null], ['loft', 'cancelled', first.id]], 'kept and closed, never deleted');
  assert.deepEqual(m.rowsOf('installments').map((p) => p.fields.plan_row), [first.id, first.id, first.id], 'the parts moved on the day of the answer');
  assert.deepEqual(m.rowsOf('installments').map((p) => p.fields.left_after), [gbp(20_000), gbp(10_000), gbp(0)]);
  await m.night();
  assert.deepEqual([m.asked('open').length, m.rowsOf('plans').length], [0, 2]);
});

test('keeping the twins apart changes nothing and is not asked again', async () => {
  const m = await money();
  const first = value<Entry>(m.k.create('plans', { name: 'Kiln', state: 'open' }, OWNER));
  const second = value<Entry>(m.k.create('plans', { name: 'kiln', state: 'open' }, OWNER));
  m.part('Kiln', 1);
  m.part('kiln', 2);
  await m.night();
  const q = m.asked('open')[0]!;
  const no = q.body!.options!.find((o) => o.label === 'Keep them apart')!;
  value(m.k.decide(q.id, { decide: { option: no.id, reason: 'Two kilns.' } }, 'p_1'));
  await m.night();
  await m.night();
  assert.deepEqual(m.asked('open'), []);
  assert.deepEqual(m.rowsOf('plans').map((p) => [p.fields.state, p.fields.one_with ?? null]), [['open', null], ['open', null]]);
  assert.deepEqual(m.rowsOf('installments').map((p) => p.fields.plan_row), [first.id, second.id]);
});
