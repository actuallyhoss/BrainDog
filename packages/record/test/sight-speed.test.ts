/**
 * A narrowed reader's page of the log is drawn inside the plan's bound (sharing plan §2.13, Slice 3): one
 * `recentHistory` page of 50 lines, for a reader held to one project's tasks, in 60 ms or less over 100,000 events.
 *
 * WHAT IT GUARDS. A log line about a row is shown only when the reader's grant admits the row, and that was asked one row
 * at a time: `rowAdmitted` ran a `list` per line, so a walk of 500 lines was 500 statements. `sight.lines` asks the
 * kernel's `admittedIds` once per list for the whole batch of 500, and this file keeps it that way. Measured on this
 * file's record: 458 ms at the median before, 30 ms after, where the owner's page takes 8 ms.
 *
 * RUN IN A WORKER THREAD WITH A DEADLINE, as `pairs-settle-speed.test.ts` runs its pass: the walk is synchronous, so a
 * test timeout cannot stop a return to a per-row walk on a record this size.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { sessionContext } from '../../host/src/auth.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 20, 12);
const OWNER = 'p_ada';

type Shape = { events: number; rows: number; kiln: number };
type Timed = { median: number; worst: number; lines: number; owner: number };

/**
 * A record of `rows` tasks over ten projects, one in `kiln` of them on Kiln, and `events` lines of the log about them,
 * written straight into the log after the rows (an edit each, to a task picked by a fixed seed), with a reader held to
 * Kiln's tasks. Then her first page of `recentHistory`, timed over nine asks after one to warm the statements.
 */
async function measure({ events, rows, kiln }: Shape): Promise<Timed> {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW), invitations: () => null });
  const owner: CallContext = { principal: { kind: 'person', id: OWNER, level: 'owner' }, credentialed: true };
  const k = api.kernel;
  assert.ok(k.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAE', slug: 'the-speed', name: 'The Speed', tz: 'UTC', locale: 'en', owner: { id: OWNER, email: 'ada@example.com' } }).ok);
  assert.ok(
    (
      await k.install([
        { id: 'register.things', kind: 'register', body: { id: 'things', name: 'Projects', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never },
        {
          id: 'register.tasks',
          kind: 'register',
          body: {
            id: 'tasks',
            name: 'Tasks',
            title: 'name',
            fields: [
              { id: 'name', type: 'text', required: true },
              { id: 'thing', type: 'ref', to: 'things', index: true },
              { id: 'notes', type: 'text' },
            ],
          } as never,
        },
      ])
    ).ok,
  );
  const by = { actor: OWNER };
  const projects: string[] = [];
  const tasks: string[] = [];
  k.transaction(() => {
    for (let i = 0; i < 10; i++) projects.push((k.create('things', { name: `Project ${i}` }, by) as { value: { id: string } }).value.id);
    for (let i = 0; i < rows; i++) tasks.push((k.create('tasks', { name: `Task ${i}`, thing: projects[i % kiln === 0 ? 0 : 1 + (i % 9)]! }, by) as { value: { id: string } }).value.id);
  });
  /* THE REST OF THE LOG, AN EDIT A LINE, each to a task a fixed seed picks, a thousand to a statement. */
  let seed = 7;
  const next = () => ((seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648), seed / 2_147_483_648);
  const have = sql.one<{ n: number }>('SELECT count(*) AS n FROM event')!.n;
  k.transaction(() => {
    for (let at = have; at < events; ) {
      const n = Math.min(1_000, events - at);
      const values: { id: string; ts: string; target: string; to: string }[] = [];
      for (let i = 0; i < n; i++) {
        const ms = NOW - (events - at - i) * 1_000;
        values.push({ id: `e_speed_${at + i}`, ts: new Date(ms).toISOString(), target: `entry:${tasks[Math.floor(next() * tasks.length)]!}`, to: JSON.stringify(`note ${at + i}`) });
      }
      /* ONE ARRAY BOUND, read with `json_each`, as the Durable Object's bound on parameters asks. */
      sql.exec(
        `INSERT INTO event (id, ts, actor, kind, target, target_kind, field, to_v)
         SELECT json_extract(value, '$.id'), json_extract(value, '$.ts'), ?, 'edit', json_extract(value, '$.target'), 'entry', 'notes', json_extract(value, '$.to')
           FROM json_each(?)`,
        OWNER,
        JSON.stringify(values),
      );
      at += n;
    }
  });
  assert.equal(sql.one<{ n: number }>('SELECT count(*) AS n FROM event')!.n, events);

  assert.ok(k.invite(OWNER, { person: 'p_kim', name: 'Kim', level: 'read', registers: { tasks: 'read' }, wheres: { tasks: { field: 'thing', is: projects[0]! } } } as never).ok);
  const kim = sessionContext({ person: 'p_kim', provedAt: NOW } as never, k.access('p_kim') as never) as CallContext;

  const page = async (ctx: CallContext): Promise<{ ms: number; lines: number }> => {
    const t = performance.now();
    const got = (await api.recentHistory({ limit: 50 }, ctx)) as { ok: boolean; value?: { events: unknown[] } };
    const ms = performance.now() - t;
    assert.ok(got.ok, JSON.stringify(got));
    return { ms, lines: got.value!.events.length };
  };
  await page(kim);
  const times: number[] = [];
  let lines = 0;
  for (let i = 0; i < 9; i++) {
    const one = await page(kim);
    times.push(one.ms);
    lines = one.lines;
  }
  await page(owner);
  const own: number[] = [];
  for (let i = 0; i < 5; i++) own.push((await page(owner)).ms);
  sql.close();
  times.sort((a, b) => a - b);
  own.sort((a, b) => a - b);
  return { median: times[4]!, worst: times.at(-1)!, lines, owner: own[2]! };
}

if (!isMainThread) {
  measure(workerData as Shape).then((timed) => parentPort!.postMessage(timed));
} else {
  /** `measure` in a worker, stopped at `deadline` ms. */
  const inWorker = (shape: Shape, deadline: number): Promise<Timed | 'stopped'> =>
    new Promise((resolve, reject) => {
      const worker = new Worker(new URL(import.meta.url), { workerData: shape });
      const stop = setTimeout(() => void worker.terminate().then(() => resolve('stopped')), deadline);
      worker.once('message', (timed: Timed) => {
        clearTimeout(stop);
        void worker.terminate().then(() => resolve(timed));
      });
      worker.once('error', (e) => {
        clearTimeout(stop);
        reject(e);
      });
    });

  /* THE PLAN'S BOUND, §2.13: one page of 50 lines, narrowed, in 60 ms. The median of nine is held to it, so one slow ask
     on a loaded runner does not fail the file while a return to a statement per line (several times over) still does. */
  const BOUND_MS = 60;

  test('A READER HELD TO KILN\'S TASKS IS DRAWN A PAGE OF 50 LINES OVER 100,000 EVENTS WITHIN 60 MS, one in ten lines hers', async () => {
    const timed = await inWorker({ events: 100_000, rows: 5_000, kiln: 10 }, 120_000);
    assert.notEqual(timed, 'stopped', 'the record was not built and measured in 120 s');
    const { median, worst, lines, owner } = timed as Timed;
    assert.equal(lines, 50, 'her page was not full, so it measured a short walk');
    assert.ok(median <= BOUND_MS, `her page took ${median.toFixed(1)} ms at the median (worst ${worst.toFixed(1)} ms, the owner's ${owner.toFixed(1)} ms), against ${BOUND_MS} ms`);
  });
}
