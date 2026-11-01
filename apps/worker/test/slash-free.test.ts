/**
 * Free's Slash credits on the Worker, and the first run's two asks under this host's wrappers.
 *
 * FREE STARTED AT CLOUD'S ASKS. `ASK_CAP_FREE` was named and held to the site's Free card, but a free record was made at
 * `ASK_CAP_DEFAULT`, and its owner could type any number up to the operator's ceiling. Now the record is lowered to it when
 * it is put on Free or when its engine is first built there, a save above it is refused in a sentence that names the plan,
 * and paying raises it to the plan's own credits once (`PLAN_TABLE`), which then hold a save as Free's do.
 *
 * THE FIRST RUN'S TWO ASKS WENT AROUND BOTH WRAPPERS. `keyOnly` and `operatorCeiling` named every other ask, so a setup on
 * a keyless Worker or past the operator's ceiling reached the engine through the prototype.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi } from '@braindog/record';
import { ASK_CAP_DEFAULT, ASK_CAP_FREE } from '@braindog/slash';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { PLAN_AGENTS, PLAN_ASK_CAP, slashPlanMoved, workerSlashDoor } from '../src/slash.ts';

const OWNER = { principal: { kind: 'person' as const, id: 'p_owner', level: 'owner' as const } };
const T0 = Date.UTC(2026, 9, 2, 9);
const KEK = 'a'.repeat(64);

type Refused = { ok: boolean; refusal?: { code: string; fix: string; at?: string } };
type Status = { asks: { used: number; cap: number } };

const fakeAi = () => {
  let runs = 0;
  return {
    runs: () => runs,
    AI: {
      run: async () => {
        runs++;
        return { choices: [{ message: { role: 'assistant', content: '{}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 10 } };
      },
    },
  };
};

const SETUP = {
  said: 'I run a bakery.',
  offer: { usecases: [{ id: 'business', title: 'Small business', summary: 'Orders.' }], modules: [] },
  today: '2026-10-02',
};

/** The door's engine over the included model, on a record the Directory says is on `plan`. */
async function built(plan: string | null, env: Record<string, unknown> = {}) {
  const clock = fixedClock(T0);
  const sql = openSqlite();
  const own = openSqlite();
  const api = await createRecordApi({ sql, clock });
  const ai = fakeAi();
  const door = workerSlashDoor({ AI: ai.AI as never, SLASH_INCLUDED: 'yes', ...env }, () => api, { sql: own, clock, plan: async () => plan }, new Set());
  const engine = (await door.engine!())!;
  const cap = () => own.one<{ ask_cap: number }>('SELECT ask_cap FROM slash_settings WHERE singleton = 1')?.ask_cap;
  const held = () => own.one<{ value: string }>('SELECT value FROM slash_meta WHERE key = ?', PLAN_ASK_CAP)?.value;
  return { engine, own, ai, cap, held, done: () => (sql.close(), own.close()) };
}

test('A RECORD ON FREE STARTS AT FREE\'S ASKS, and a save above them is refused in a sentence that names the plan', async () => {
  const { engine, cap, held, done } = await built('free');
  assert.equal(cap(), ASK_CAP_FREE);
  assert.equal(held(), String(ASK_CAP_FREE));
  assert.equal((engine.status() as Status).asks.cap, ASK_CAP_FREE);

  const over = engine.configure({ ask_cap: ASK_CAP_FREE + 1 }, OWNER) as Refused;
  assert.equal(over.ok, false);
  assert.equal(over.refusal?.at, 'ask_cap');
  assert.match(over.refusal?.fix ?? '', new RegExp(`^Free comes with ${ASK_CAP_FREE} Slash questions a month`, 'u'));
  /* FEWER IS HIS TO CHOOSE. */
  assert.ok((engine.configure({ ask_cap: 5 }, OWNER) as Refused).ok);
  assert.equal(cap(), 5);
  done();
});

test("PAID FOR, THE ASKS GO UP TO THE PLAN'S CREDITS ONCE, and the plan still holds a save", async () => {
  const { engine, own, cap, held, done } = await built('free');
  await slashPlanMoved(own, 'hosted');
  assert.equal(cap(), ASK_CAP_DEFAULT);
  assert.equal(held(), String(ASK_CAP_DEFAULT));
  const over = engine.configure({ ask_cap: 200 }, OWNER) as Refused;
  assert.equal(over.ok, false);
  assert.match(over.refusal?.fix ?? '', /^Cloud comes with 80 Slash questions a month, so the monthly limit is 80 or lower\. Cloud Plus comes with more\.$/u);

  /* A RENEWAL MOVES NOTHING: an owner's own number on Cloud stays his. */
  assert.ok((engine.configure({ ask_cap: 30 }, OWNER) as Refused).ok);
  await slashPlanMoved(own, 'hosted');
  assert.equal(cap(), 30);

  /* CLOUD PLUS IS ITS OWN 400, raised once and held. */
  await slashPlanMoved(own, 'plus');
  assert.equal(cap(), 400);
  assert.equal(held(), '400');
  assert.equal((engine.configure({ ask_cap: 401 }, OWNER) as Refused).ok, false);
  done();
});

test('AN OWNER WHO TURNED SLASH OFF ON FREE IS LEFT OFF WHEN HE PAYS', async () => {
  const { engine, own, cap, done } = await built('free');
  assert.ok((engine.configure({ ask_cap: 0 }, OWNER) as Refused).ok);
  await slashPlanMoved(own, 'plus');
  assert.equal(cap(), 0);
  done();
});

test("CLOUD HOLDS CLOUD'S ASKS, AND A PLAN NOBODY COULD ASK FOR HOLDS NONE", async () => {
  for (const plan of ['hosted', null]) {
    const { engine, cap, held, done } = await built(plan);
    assert.equal(cap(), ASK_CAP_DEFAULT);
    assert.equal(held(), plan === null ? undefined : String(ASK_CAP_DEFAULT));
    assert.equal((engine.configure({ ask_cap: 100 }, OWNER) as Refused).ok, plan === null);
    done();
  }
});

test('A PLAN MOVED BEFORE SLASH WAS EVER ASKED TOUCHES NOTHING, and the first build reads it', async () => {
  const own = openSqlite();
  await slashPlanMoved(own, 'free');
  assert.equal(own.one("SELECT 1 AS n FROM sqlite_master WHERE name = 'slash_settings'"), undefined);
  own.close();
});

test('THE FIRST RUN IS HELD UNDER THE OPERATOR\'S CEILING, before the binding', async () => {
  /* 0 NEURONS IS NO ASKS, so the ceiling is spent from the start. */
  const { engine, ai, done } = await built('hosted', { SLASH_INCLUDED_MONTH_NEURONS: '0' });
  const slash = engine as unknown as { proposeSetup(a: unknown, c: unknown): Promise<Refused>; proposeMapping(a: unknown, c: unknown): Promise<Refused> };
  assert.equal((await slash.proposeSetup(SETUP, OWNER)).refusal?.code, 'SLASH_BUDGET_SPENT');
  assert.equal((await slash.proposeMapping({ file: 'a.csv', columns: ['A'], sample: [{ A: '1' }], lists: [] }, OWNER)).refusal?.code, 'SLASH_BUDGET_SPENT');
  assert.equal(ai.runs(), 0);
  done();
});

test('ON A WORKER WITH NO INCLUDED MODEL THE FIRST RUN WAITS FOR HIS OWN KEY, in the sentence every ask says', async () => {
  const clock = fixedClock(T0);
  const sql = openSqlite();
  const own = openSqlite();
  const api = await createRecordApi({ sql, clock });
  const engine = (await workerSlashDoor({ KEK }, () => api, { sql: own, clock }, new Set()).engine!())! as unknown as {
    proposeSetup(a: unknown, c: unknown): Promise<Refused>;
    proposeMapping(a: unknown, c: unknown): Promise<Refused>;
  };
  assert.equal((await engine.proposeSetup(SETUP, OWNER)).refusal?.code, 'NOT_IN_THIS_BUILD');
  assert.equal((await engine.proposeMapping({}, OWNER)).refusal?.code, 'NOT_IN_THIS_BUILD');
  sql.close();
  own.close();
});

test("THE PLAN MOVES THE COUNT OF AGENT KEYS, whether or not Slash was ever asked, and a self-host has none", async () => {
  /* A MIGRATED RECORD WITH NO SLASH STORE, as most are: the count is written all the same (`planAgents`), because the
     first key is minted long before anybody asks Slash anything. */
  const sql = openSqlite();
  await createRecordApi({ sql, clock: fixedClock(T0) });
  const held = (): string | null => sql.one<{ value: string }>('SELECT value FROM host_meta WHERE key = ?', PLAN_AGENTS)?.value ?? null;
  await slashPlanMoved(sql, 'free');
  assert.equal(held(), JSON.stringify({ agents: 3, plan: 'Free', next: 'Cloud' }));
  await slashPlanMoved(sql, 'hosted');
  assert.equal(held(), JSON.stringify({ agents: 15, plan: 'Cloud', next: 'Cloud Plus' }));
  await slashPlanMoved(sql, 'plus');
  assert.equal(held(), JSON.stringify({ agents: 75, plan: 'Cloud Plus', next: null }));
  await slashPlanMoved(sql, 'selfhost');
  assert.equal(held(), null, 'a self-host keeps no count');
  sql.close();
});
