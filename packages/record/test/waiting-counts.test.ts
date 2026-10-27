/**
 * What waits on a person, counted once (`waiting()`), on a record shaped like the owner's on 7 October: 25
 * open questions, some of them past two weeks, and 32 arrivals in the inbox.
 *
 * That day Today said "Nothing needs you" beside a rail badge of 25. So `boot`'s `waits`, its rail counts and Home's
 * line read one answer here, "late" agrees with the kernel's own queue count, and the calm line is said only when no
 * question and nothing in the inbox waits.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, LATE_DAYS, nothingWaits, waiting, type Boot, type CallContext } from '../src/index.ts';
import { homeRulesLine } from '../src/headlines.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 7, 9);
const DAY = 86_400_000;

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

const value = <T>(r: { ok: boolean }): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const ask = (n: number) => ({
  question: `Which account is card ending ${1000 + n}?`,
  body_kind: 'options' as const,
  body: { options: [{ id: 'yes', label: 'Yes', because: 'It is.' }, { id: 'no', label: 'No', because: 'It is not.' }] },
});

/** 25 questions, one a day from 24 days ago, so the oldest ten are past two weeks; and 32 arrivals. */
async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW - 25 * DAY);
  const api = await createRecordApi({ sql, clock });
  for (let n = 0; n < 25; n++) {
    clock.set(NOW - (24 - n) * DAY);
    value(await api.propose(ask(n) as never, owner));
  }
  clock.set(NOW);
  for (let n = 0; n < 32; n++) assert.ok(api.kernel.arrive({ channel: 'webhook', body: `Card ending 7731 used for EGP ${n + 10}.00`, sha256: `s${n}`, verified: true } as never).ok);
  return { api, sql, clock };
}

test('BOOT SAYS WHAT WAITS ONCE: 25 questions, 10 of them late, 32 arrivals, and its rail counts are the same numbers', async () => {
  const { api, sql } = await record();
  const boot = value<Boot>(await api.boot(owner));
  assert.deepEqual(boot.waits, { questions: 25, late: 10, hard: 0, inbox: 32, working: 0 });
  assert.deepEqual([boot.counts.decide, boot.counts.inbox], [25, 32]);
  assert.equal(boot.lateDays, LATE_DAYS);
  sql.close();
});

test('LATE IS THE KERNEL’S: the count agrees with the queue the kernel draws, and so does hard to undo', async () => {
  const { api, sql } = await record();
  const boot = value<Boot>(await api.boot(owner));
  const queue = api.kernel.block({ kind: 'queue', source: 'governance.open', limit: 1 } as never) as unknown as {
    matched: number;
    waiting: { stale: number; hardToUndo: number };
  };
  assert.deepEqual([boot.waits.questions, boot.waits.late, boot.waits.hard], [queue.matched, queue.waiting.stale, queue.waiting.hardToUndo]);
  sql.close();
});

test('NOTHING NEEDS YOU ONLY WHEN NO QUESTION AND NOTHING IN THE INBOX WAITS', () => {
  assert.equal(nothingWaits({ questions: 0, inbox: 0 }), true);
  assert.equal(nothingWaits({ questions: 0, inbox: 32 }), false);
  assert.equal(nothingWaits({ questions: 25, inbox: 0 }), false);
  /* AN INBOX THE READER IS NOT TOLD ABOUT says nothing either way. */
  assert.equal(nothingWaits({ questions: 0, inbox: null }), true);
  assert.equal(homeRulesLine(0, 0, 0, 32), '32 things wait in your inbox, and no agent is working.');
  assert.equal(homeRulesLine(0, 0, 1, 0), 'Nothing needs you, and 1 agent is working.');
  assert.equal(homeRulesLine(25, 10, 0, 32), '25 things need you, and 10 are late.');
});

test('WAITING IS PURE: a question opened past two weeks is late, and an instant it cannot read is not', () => {
  const at = (days: number) => new Date(NOW - days * DAY).toISOString();
  const w = waiting({
    nowMs: NOW,
    questions: [
      { opened_at: at(LATE_DAYS + 1), body_kind: 'options', body: {} },
      { opened_at: at(LATE_DAYS - 1), body_kind: 'pack', body: { disable: 'money' } },
      { opened_at: 'not a day', body_kind: 'options', body: {} },
    ],
    inbox: null,
    runs: [],
  });
  assert.deepEqual(w, { questions: 3, late: 1, hard: 1, inbox: null, working: 0 });
});

/* ONE AGENT WITH A HELPER IS ONE AT WORK, as the kernel's `runs-working` counts it, so the rail and the Agents page's
   line agree; an idle run is not at work however lately it called. */
test('WORKING COUNTS A HELPER UNDER ITS WORKING PARENT ONCE, and an idle run not at all', () => {
  const seen = new Date(NOW - 60_000).toISOString();
  const run = (seq: number, state: string, parent?: string) => ({ seq, state, updated_at: seen, fields: { last_seen: seen, ...(parent ? { parent } : {}) } });
  const w = waiting({ nowMs: NOW, questions: [], inbox: null, runs: [run(1, 'active'), run(2, 'active', 'S1'), run(3, 'active', 'S9'), run(4, 'idle')] });
  assert.equal(w.working, 2);
});

test('HOME’S LINE READS THE SAME COUNTS: the reading handed to the model names 25 questions and 32 arrivals', async () => {
  const { api, sql } = await record();
  /* THE RULES' LINE FOR HOME IS WRITTEN FROM `waiting()`: never "Nothing needs you" while 25 wait. */
  const boot = value<Boot>(await api.boot(owner));
  const line = homeRulesLine(boot.waits.questions, 0, boot.waits.working, boot.waits.inbox ?? 0);
  assert.doesNotMatch(line, /nothing/iu);
  assert.match(line, /^25 things need you/u);
  sql.close();
});
