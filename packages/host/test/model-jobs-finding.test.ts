/**
 * A finding of the weekly analysis files no question (ENG-B17 job 4). It used to come back as "Look into it / Not now",
 * signed by Slash, two answers that changed nothing; now the job settles done, the finding's sentence is logged as a
 * reading, and Decide holds nothing new. Over a real record's outbox, so the ack is the kernel's own, the one that files
 * whatever question a draft comes back with.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi } from '@braindog/record';

import { serveModelJobs, type ModelJobMeter, type ModelJobsDeps } from '../src/model-jobs.ts';
import { enqueue } from '../../kernel/src/outbox.ts';
import { openSqlite } from '../../kernel/test/sqlite.ts';

const T0 = Date.UTC(2026, 9, 14, 9, 0);
const ROOM: ModelJobMeter = { cap: 30, spent: () => 0 };
const WHY = 'Searches for the week ahead found nothing on five separate days.';

async function record(payload: Record<string, unknown>) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: { now: () => T0 } });
  const id = enqueue(sql, () => 'J1', T0, 'infer.draft', payload);
  const lines: string[] = [];
  const deps: ModelJobsDeps = {
    inference: {
      draft: async () => assert.fail('a finding is never sent to a model'),
      prose: async () => assert.fail('no digest is queued'),
    },
    meter: ROOM,
    now: () => T0,
    store: openSqlite(),
    log: (line) => lines.push(line),
    health: async () => ({ health: { state: 'answering', last_ok: '2026-10-14T08:00:00.000Z', since: null } }),
  };
  const questions = (): number => Number(sql.one<{ n: number }>('SELECT count(*) AS n FROM suggestion')?.n ?? 0);
  const before = questions();
  await serveModelJobs(api, deps);
  return { state: sql.one<{ state: string }>('SELECT state FROM outbox WHERE id = ?', id)?.state, filed: questions() - before, lines };
}

test('A FINDING FILES NO QUESTION: the job is done, Decide holds nothing new, and the finding is logged as a reading', async () => {
  const r = await record({ signal: 'search.empty', subject: 'tasks', why: WHY });
  assert.equal(r.state, 'done');
  assert.equal(r.filed, 0, 'a finding that changes nothing was filed as a question');
  assert.equal(r.lines.length, 1, r.lines.join('\n'));
  assert.ok(r.lines[0]!.endsWith(WHY), r.lines[0]);
});

test('A FINDING WITH NO SENTENCE OF ITS OWN IS STILL LOGGED, in the words the record has for it, and files nothing', async () => {
  const r = await record({ signal: 'query.scan', subject: 'tasks' });
  assert.equal(r.state, 'done');
  assert.equal(r.filed, 0);
  assert.match(r.lines[0] ?? '', /The record noticed query\.scan on tasks\./u);
});
