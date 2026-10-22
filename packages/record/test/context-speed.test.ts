/**
 * HOW FAST `context`, `record_index` AND `governance` ANSWER ON A RECORD THE SIZE OF HIS (W1-D).
 *
 * The seed answers `context` in about 50 ms, and his record in 1.4 s through the door: the seed has five runs, and his
 * record 888, 842 of them never ended. So this builds the seed and then writes, straight into the store, thousands of
 * runs (most never ended, a few live), thousands of events, hundreds of tasks and learnings and a queue of questions,
 * and times the three reads the plan names. The bounds are generous, several times what this machine measures, so a
 * slow CI box passes and a read that scans the whole record again does not.
 *
 * `BENCH=1` prints the timings.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

import { createRecordApi, type CallContext, type Context } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { NOW, installSeed } from '../../seed/src/index.ts';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const RUNS = 3_000;
const TASKS = 1_500;
const LEARNINGS = 400;
const QUESTIONS = 120;

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
/** Where the timed agent stands: Portage's repository, which the seed's Portage lists, so it is placed on a project. */
const HERE = { host: 'kiln-mbp', repo: 'portage', agent: 'claude', client_id: 'c-speed' };
const agent: CallContext = { principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_1', level: 'owner' }, session: HERE };

/** A ULID-shaped id, unique by `n`, never one the kernel would mint. */
const idOf = (tag: string, n: number): string => `01Z${tag}${String(n).padStart(22 - tag.length + 1, '0')}`.slice(0, 26);

async function big() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  value(await installSeed(api.kernel));
  clock.advance(5 * MIN);
  const now = clock.now();
  const iso = (ms: number) => new Date(ms).toISOString();

  /* EACH ROW AS THE STORE HOLDS IT, with the line that made it, written straight in: a write through the record costs
     tens of milliseconds a row here, and the reads timed below read the store, not how a row got there. */
  const next = (register: string): number => (sql.one<{ n: number }>('SELECT coalesce(max(seq), 0) AS n FROM entry WHERE register = ?', register)?.n ?? 0) + 1;
  let made = 0;
  const put = (register: string, seq: number, fields: Record<string, unknown>, at: number, updated = at): string => {
    made += 1;
    const id = idOf(register.slice(0, 2).toUpperCase(), made);
    const state = typeof fields.state === 'string' ? fields.state : null;
    sql.exec(
      'INSERT INTO entry (id, register, seq, fields, state, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 2, ?, ?)',
      id, register, seq, JSON.stringify(fields), state, iso(at), iso(updated),
    );
    sql.exec(
      "INSERT INTO event (id, ts, actor, kind, target, target_kind, field, from_v, to_v, note, batch, op_id) VALUES (?, ?, 'agent:claude', 'create', ?, 'entry', NULL, NULL, NULL, NULL, ?, NULL)",
      idOf('E', made), iso(at), `entry:${id}`, idOf('B', made),
    );
    return id;
  };
  const counted = (register: string, upto: number) =>
    sql.exec('INSERT INTO counter (name, next) VALUES (?, ?) ON CONFLICT (name) DO UPDATE SET next = excluded.next', `seq:${register}`, upto + 1);
  const things = sql.all<{ id: string; seq: number }>("SELECT id, seq FROM entry WHERE register = 'things' AND deleted_at IS NULL ORDER BY seq");
  const repos = ['kiln-type', 'kiln-site', 'portage', 'ledger', 'atlas', 'notes', 'tools', 'site', 'app', 'cli'];
  const task = next('tasks');
  sql.transactionSync(() => {
    /* THE RUNS: most opened and never ended, as his 842 of 888 were, a twentieth ended, and four live now. */
    const first = next('session');
    for (let i = 0; i < RUNS; i += 1) {
      const ended = i % 20 === 0;
      const live = i >= RUNS - 4;
      const heard = live ? now - (i % 4) * MIN : now - 2 * 60 * MIN - ((RUNS - i) * 37 * MIN) % (60 * DAY);
      const thing = things[i % things.length]!;
      put('session', first + i, {
        doing: `Run ${String(i)} working on part ${String(i % 17)}`,
        agent: i % 3 === 0 ? 'codex' : 'claude',
        state: ended ? 'done' : 'active',
        repo: repos[i % repos.length],
        host: i % 2 === 0 ? 'kiln-mbp' : 'studio-desktop',
        branch: `b-${String(i % 40)}`,
        project: `things#${String(thing.seq)}`,
        started: iso(heard - 30 * MIN),
        last_seen: iso(heard),
        ...(ended ? { closed_at: iso(heard), closed_as: 'done', next: `Carry on from part ${String(i % 17)}` } : {}),
      }, heard - 30 * MIN, heard);
    }
    counted('session', first + RUNS - 1);
    for (let i = 0; i < TASKS; i += 1)
      put('tasks', task + i, { what: `Task ${String(i)} on part ${String(i % 23)}`, state: i % 5 === 0 ? 'done' : 'open', thing: things[i % things.length]!.id }, now - (i % 90) * DAY);
    counted('tasks', task + TASKS - 1);
    const lesson = next('learnings');
    for (let i = 0; i < LEARNINGS; i += 1)
      put('learnings', lesson + i, {
        lesson: `Lesson ${String(i)}: check part ${String(i % 13)} first.`,
        because: 'It was missed once, and cost a day.',
        kind: i % 3 === 0 ? 'method' : 'fact',
        state: 'active',
        ...(i % 2 === 0 ? { project: things[i % things.length]!.id } : {}),
      }, now - (i % 120) * DAY);
    counted('learnings', lesson + LEARNINGS - 1);
  });
  /* AND A QUEUE OF QUESTIONS, through `propose`, so each carries the lines the queue reads. */
  /* Half asked by an agent's run, about a task, as most of his are, and half by him. */
  const asker: CallContext = { principal: agent.principal, session: { ...HERE, client_id: 'c-asker', repo: 'kiln-site' } };
  value(await api.attach({ source: 'startup', client_id: 'c-asker', doing: 'Asking about the tasks' }, asker));
  for (let i = 1; i <= QUESTIONS; i += 1)
    value(
      i % 2 === 0
        ? await api.propose({ question: `Question ${String(i)}: write task ${String(i)} again?`, body_kind: 'rowset', body: { register: 'tasks', rows: [{ at: `tasks#${String(task + i)}`, version: 2, patch: { what: `Task ${String(i)}, said again` } }] } }, asker)
        : await api.propose({ question: `Question ${String(i)}: keep part ${String(i)}?`, body_kind: 'options', body: { options: [{ id: 'yes', label: 'Keep it', because: 'It is still used.' }, { id: 'no', label: 'Drop it', because: 'Nobody reads it.' }] } }, owner),
    );
  clock.advance(MIN);
  return { api, sql, clock };
}

/** The median and the slowest of `n` calls, after the first, which is timed apart. */
async function timed(n: number, call: () => Promise<unknown>): Promise<{ first: number; p50: number; max: number }> {
  const at = performance.now();
  await call();
  const first = performance.now() - at;
  const all: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = performance.now();
    await call();
    all.push(performance.now() - t);
  }
  all.sort((a, b) => a - b);
  return { first, p50: all[Math.floor(all.length / 2)] ?? first, max: all[all.length - 1] ?? first };
}

const say = (name: string, t: { first: number; p50: number; max: number }) => {
  if (process.env.BENCH) console.log(`${name.padEnd(14)} first ${t.first.toFixed(1).padStart(7)} ms   p50 ${t.p50.toFixed(1).padStart(7)} ms   max ${t.max.toFixed(1).padStart(7)} ms`);
};

test('ON A RECORD OF THOUSANDS OF RUNS, context, record_index and governance answer inside their bounds', async () => {
  const { api, sql, clock } = await big();
  value(await api.attach({ source: 'startup', client_id: HERE.client_id, doing: 'Timing the briefing' }, agent));
  /* THE ALARM HAS RUN, as it has on any record in use: it lints the pages and keeps the briefing's red signs. */
  await api.lintTick();

  /* `record_index` is `boot`, `version` and `figures` at the door (`packages/mcp/src/index.ts`). */
  const index = async () => {
    value(await api.boot(agent));
    value(await api.version(agent));
    value(await api.figures(agent));
  };
  const c = await timed(10, async () => value<Context>(await api.context({}, agent)));
  say('context', c);
  const r = await timed(10, index);
  say('record_index', r);
  const g = await timed(10, async () => value(await api.governance({ limit: 21 }, agent)));
  say('governance', g);
  /* A MEMBER INVITED TO TASKS ALONE is held back from every question about the whole record, so her page is filled from
     the whole queue: only the page is named. */
  const member: CallContext = { principal: { kind: 'person', id: 'p_2', level: null }, levels: { tasks: 'read' } };
  const m = await timed(10, async () => value(await api.governance({ limit: 21 }, member)));
  say('governance, 1', m);

  /* WHAT IT SAYS IS STILL TRUE OF THE RECORD. The runs live are the four heard from in the last minutes and the run that
     asked, and none of the thousands gone quiet; the red signs are the ones the alarm kept. */
  const told = value<Context>(await api.context({}, agent));
  const live = [...told.live.same_repo, ...told.live.elsewhere];
  for (const n of [RUNS - 4, RUNS - 3, RUNS - 2, RUNS - 1]) assert.ok(live.some((run) => run.doing === `Run ${String(n)} working on part ${String(n % 17)}`), `run ${String(n)} is not live`);
  assert.ok(live.some((run) => run.doing === 'Asking about the tasks'), 'the run that asked is not live');
  assert.ok(live.every((run) => run.age_s < 45 * 60), 'a stale run is live');
  assert.ok(told.signs.some((s) => s.name === 'Agent runs end cleanly'), JSON.stringify(told.signs));

  /* AND A WRITE IS SEEN AT ONCE: the briefing held for the version before it is not the one answered after it. */
  const here = (ctx: Context) => ctx.registers.find((x) => x.id === 'tasks')?.here ?? -1;
  clock.advance(1_000);
  value(await api.create({ register: 'tasks', fields: { what: 'Written after the briefing was held', thing: told.project?.spoken ?? 'things#3' } }, owner));
  const fresh = await timed(0, async () => value<Context>(await api.context({}, agent)));
  say('context, new', fresh);
  assert.equal(here(value<Context>(await api.context({}, agent))), here(told) + 1);

  /* GENEROUS: many times this machine's figures, so a busy box passes and only a read that walks the whole record again
     trips them. */
  assert.ok(c.first < 1_500, `context took ${c.first.toFixed(0)} ms the first time`);
  assert.ok(c.p50 < 100, `context took ${c.p50.toFixed(0)} ms at the median`);
  assert.ok(fresh.first < 1_500, `context took ${fresh.first.toFixed(0)} ms after a write`);
  assert.ok(r.p50 < 600, `record_index took ${r.p50.toFixed(0)} ms at the median`);
  assert.ok(g.p50 < 250, `governance took ${g.p50.toFixed(0)} ms at the median`);
  assert.ok(m.p50 < 250, `governance took ${m.p50.toFixed(0)} ms at the median for a member of one list`);
  sql.close();
});
