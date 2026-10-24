/**
 * A STALE STEP IS NEVER NEXT (scope H7). On the owner's record a step "Run full CI on master" left 39 hours earlier, with
 * master a hundred commits past the head it was left at, led every card and the Agents page. A step older than a day,
 * or one HEAD has moved `FAR_BEHIND` commits past, is an older step: still open to take, never the one thing to do.
 *
 * Each case is a fresh record reached the way the start hook reaches it, the ahead count in the session's hints.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FAR_BEHIND, createRecordApi, type Attached, type CallContext, type Context } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const HOUR = 3_600_000;

const ok = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  ok(await api.createRecord({ id: 'rec_01J9Z8Y7X6W5V4T3S2R1Q0P9N8', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'ada@example.com', name: 'Ada' } }));
  let n = 0;
  const agent = async (hints: Record<string, string> = {}): Promise<CallContext> => {
    const id = ok<{ id: string }>(await api.createToken({ scope: 'write', label: `agent ${String(++n)}` }, owner)).id;
    const ctx: CallContext = {
      principal: { kind: 'token', id, scope: 'write', person: 'p_1', level: 'owner' },
      session: { client_id: `c-${String(n)}`, agent: 'claude', host: 'studio-mac', repo: 'kiln', ...hints },
    };
    ok<Attached>(await api.attach({ source: 'startup', client_id: `c-${String(n)}` }, ctx));
    return ctx;
  };
  const context = async (ctx: CallContext) => ok<Context>(await api.context({}, ctx));
  return { api, sql, clock, agent, context };
}

const nextLine = (c: Context): string => (c.card ?? '').split('\n').find((l) => l.startsWith('Next')) ?? '';

test('A 39-HOUR STEP IS AN OLDER ONE, not Next: no handoff, no Next line naming it', async () => {
  const { api, sql, clock, agent, context } = await record();
  ok(await api.handoff({ next: 'Run full CI on master', state: 'handoff' }, await agent()));
  clock.advance(39 * HOUR);
  const later = await context(await agent());
  assert.equal(later.handoff, null, 'a step a day and a half old was handed over');
  assert.doesNotMatch(nextLine(later), /full CI/u);
  assert.ok(!(later.next_lines ?? []).some((l) => l.includes('full CI')), 'the old step reached the Next lines');
  sql.close();
});

test('A STEP HEAD HAS MOVED FAR PAST IS NOT NEXT, though an hour old; a few commits on, it still is', async () => {
  const { api, sql, clock, agent, context } = await record();
  ok(await api.handoff({ next: 'Run full CI on master', state: 'handoff' }, await agent()));
  clock.advance(HOUR);
  const near = await context(await agent({ ahead: '3' }));
  assert.equal(near.handoff?.next, 'Run full CI on master');
  assert.match(nextLine(near), /full CI on master/u);
  const far = await context(await agent({ ahead: String(FAR_BEHIND + 50) }));
  assert.equal(far.handoff, null, 'a step 100 commits behind was handed over');
  assert.doesNotMatch(nextLine(far), /full CI/u);
  sql.close();
});
