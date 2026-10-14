/**
 * A PATTERN DRAFT ASKS THE GOVERNOR FIRST (ENG-B17 job 4). What the model drafts is filed as Slash's question by the
 * kernel's ack, so the pass asks `mayPropose` (the floor and the brake) before it sends a draft to the model. Held, the
 * model is never asked, Decide holds nothing new, the job is done, and one line says how many were held and why. Free,
 * the draft is sent and filed as it always was; a host that hands no governor sends every draft, as before. Over a real
 * record's outbox, so the ack that files is the kernel's own.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mayPropose, type MayPropose } from '@braindog/kernel';
import { createRecordApi } from '@braindog/record';

import { serveModelJobs, type ModelJobMeter, type ModelJobsApi, type ModelJobsDeps } from '../src/model-jobs.ts';
import { enqueue } from '../../kernel/src/outbox.ts';
import { openSqlite } from '../../kernel/test/sqlite.ts';

const T0 = Date.UTC(2026, 9, 14, 9, 0);
const ROOM: ModelJobMeter = { cap: 30, spent: () => 0 };
const BRAKED = 'You turned down 13 of the last 20, so Slash waits.';

const ARRIVALS = ['a1', 'a2', 'a3'].map((id, i) => ({
  id,
  channel: 'email',
  ts: new Date(T0 - (3 - i) * 60_000).toISOString(),
  from: 'orders@shop.example',
  to: 'me@inbox.example',
  subject: `Order ${i + 1} is on its way`,
  body: `Your order ${i + 1} has shipped.`,
}));

type Governed = ((sql: ReturnType<typeof openSqlite>) => (nowMs: number) => MayPropose) | undefined;

async function pass(governed: Governed, jobs = 1) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: { now: () => T0 } });
  for (let i = 0; i < jobs; i++) enqueue(sql, () => `J${i + 1}`, T0, 'infer.draft', { examples: ['a1', 'a2', 'a3'], waiting: 3 });
  const lines: string[] = [];
  let sent = 0;
  let asked = 0;
  const deps: ModelJobsDeps = {
    inference: {
      draft: async () => {
        sent++;
        /* A TWO-ANSWER QUESTION AND NOT A PATTERN, so no register is needed for the kernel's gate to file it: the
           path under test is the pass's, and the ack files whatever a draft comes back with. */
        return {
          ok: true,
          value: {
            question: 'File the shipping notices under orders?',
            body_kind: 'options',
            body: { about: 'Shipping notices', options: [{ id: 'file', label: 'File them', because: 'Three came this week.' }, { id: 'leave', label: 'Leave them', because: 'They need nothing.' }] },
          } as never,
        };
      },
      prose: async () => assert.fail('no digest is queued'),
    },
    meter: ROOM,
    now: () => T0,
    store: openSqlite(),
    log: (line) => lines.push(line),
    health: async () => ({ health: { state: 'answering', last_ok: '2026-10-14T08:00:00.000Z', since: null } }),
    ...(governed ? { mayPropose: (at: number) => (asked++, governed(sql)(at)) } : {}),
  };
  const inbox = (async () => ({ ok: true, value: { arrivals: [...ARRIVALS].reverse(), cursor: null } })) as unknown as ModelJobsApi['inbox'];
  const filed = (): number => Number(sql.one<{ n: number }>("SELECT count(*) AS n FROM suggestion WHERE opened_by = 'slash'")?.n ?? 0);
  const before = filed();
  await serveModelJobs({ inbox, kernel: api.kernel }, deps);
  const states = sql.all<{ state: string }>("SELECT state FROM outbox WHERE kind = 'infer.draft'").map((r) => r.state);
  return { sent, asked, filed: filed() - before, states, lines, held: lines.filter((l) => l.startsWith('Slash held')) };
}

test('THE BRAKE ON: the model is not asked, nothing is filed, the job is done, and one held count says why', async () => {
  const r = await pass(() => () => ({ may: false, why: BRAKED, share: 0.35, of: 20 }));
  assert.equal(r.sent, 0, 'a held draft was sent to the model');
  assert.equal(r.filed, 0, 'a held draft was filed as a question');
  assert.deepEqual(r.states, ['done']);
  assert.equal(r.held.length, 1, r.lines.join('\n'));
  assert.match(r.held[0]!, /^Slash held one pattern it noticed and asked you nothing: You turned down 13 of the last 20/u);
});

test('THE BRAKE OFF: the draft is sent and filed as Slash\'s question, as today, and nothing is said held', async () => {
  const r = await pass(() => () => ({ may: true }));
  assert.equal(r.sent, 1);
  assert.equal(r.filed, 1, r.lines.join('\n'));
  assert.deepEqual(r.states, ['done']);
  assert.equal(r.held.length, 0);
});

test('NO GOVERNOR HANDED IN: every draft is sent and filed, as a host built by hand always did', async () => {
  const r = await pass(undefined);
  assert.equal(r.sent, 1);
  assert.equal(r.filed, 1, r.lines.join('\n'));
  assert.equal(r.held.length, 0);
});

test('THREE DRAFTS HELD IN ONE PASS: the governor is asked once and the line counts all three', async () => {
  const r = await pass(() => () => ({ may: false, why: BRAKED }), 3);
  assert.equal(r.asked, 1);
  assert.equal(r.sent, 0);
  assert.equal(r.filed, 0);
  assert.deepEqual(r.states, ['done', 'done', 'done']);
  assert.equal(r.held.length, 1);
  assert.match(r.held[0]!, /^Slash held 3 patterns it noticed/u);
});

test('THE KERNEL\'S OWN GOVERNOR, on a record nobody has used yet: the floor holds the draft, in its own words', async () => {
  const r = await pass((sql) => (at) => mayPropose(sql, at));
  assert.equal(r.sent, 0);
  assert.equal(r.filed, 0);
  assert.equal(r.held.length, 1, r.lines.join('\n'));
  assert.match(r.held[0]!, /Slash waits until you have used BrainDog for two weeks/u);
});
