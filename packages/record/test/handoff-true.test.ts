/**
 * The briefing card's Next slot is true about the step, through the record (AGT-B08 job 4, AGT-C05's card line): each
 * case is a fresh record with no seed, runs placed by repository alone, and the card read the way a starting session
 * reads it, from `context`.
 *
 * The record worked out who took a step and who was here last, and the card it sent printed none of it: a third session
 * was offered nothing, or a step somebody else was already on. So a taken step is said as taken, by whom and when, and
 * never offered; a record with no step says where the last session stopped; and another run at work in the same tree is
 * named after the warning. Every name is made up.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CARD_MOST, TWO_SESSIONS, createRecordApi, type Attached, type CallContext, type Context } from '../src/index.ts';
import { wordCount } from '../src/card.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const MIN = 60_000;

const ok = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

/** A record with its owner, and a key for each agent asked for, each at `studio-mac` in the repository `kiln`. */
async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  ok(await api.createRecord({ id: 'rec_01J9Z8Y7X6W5V4T3S2R1Q0P9N8', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'ada@example.com', name: 'Ada' } }));
  const agent = async (name: string): Promise<CallContext> => {
    const key = ok<{ id: string }>(await api.createToken({ scope: 'write', label: name }, owner)).id;
    return {
      principal: { kind: 'token', id: key, scope: 'write', person: 'p_1', level: 'owner' },
      session: { client_id: `c-${name}`, agent: 'claude', host: 'studio-mac', repo: 'kiln' },
    };
  };
  const attach = async (ctx: CallContext, doing?: string) =>
    ok<Attached>(await api.attach({ source: 'startup', client_id: String(ctx.session?.client_id), ...(doing === undefined ? {} : { doing }) }, ctx));
  const context = async (ctx: CallContext) => ok<Context>(await api.context({}, ctx));
  return { api, sql, clock, agent, attach, context };
}

const nextOf = (card: string): string | null => card.split('\n').find((l) => l.startsWith('Next ')) ?? null;

test('A STEP SOMEBODY TOOK IS SAID AS TAKEN, by whom and when, and never offered to a third session', async () => {
  const { sql, clock, api, agent, attach, context } = await record();
  const leaver = await agent('leaver');
  const left = await attach(leaver);
  ok(await api.handoff({ next: 'Kern the lowercase pairs', tried: 'Auto-kerning read as uneven', state: 'handoff' }, leaver));
  clock.advance(5 * MIN);

  const taker = await agent('taker');
  const took = await attach(taker, 'Kerning the pairs');
  ok(await api.handoff({ take: left.spoken }, taker));
  clock.advance(3 * MIN);

  const third = await agent('third');
  await attach(third);
  const c = await context(third);
  const card = c.card ?? assert.fail('no card');
  assert.equal(c.handoff, null, `the taken step was handed over: ${JSON.stringify(c.handoff)}`);
  const next = nextOf(card);
  /* THE CARD SAYS NAMES, NEVER RUN IDS: the taker is Claude here, and the id stays in the Also line that names the run at work. */
  assert.equal(next, 'Next     Claude took this 3 min ago: Kern the lowercase pairs.', card);
  assert.equal(c.card_next, `Next     Claude (${took.spoken}) took this 3 min ago: Kern the lowercase pairs.`, 'the whole line keeps the run it names');
  /* NEVER OFFERED: no "Left by", no check before acting on it, no Tried line for a step that is somebody else's now. */
  assert.doesNotMatch(card, /Left by|check before acting|Tried:/iu, card);
  /* AND THE TAKER, STILL AT WORK HERE, is named after the warning. */
  const also = card.split('\n').find((l) => l.startsWith('Also ')) ?? '';
  assert.ok(also.includes(`${TWO_SESSIONS} Also here: Claude (${took.spoken}), Kerning the pairs`), card);
  assert.ok(wordCount(card) <= CARD_MOST, card);
  sql.close();
});

test('AN OPEN STEP IS THE RECORD\'S OWN LINES: who left it, how long ago, check before acting, and what was tried', async () => {
  const { sql, clock, api, agent, attach, context } = await record();
  const leaver = await agent('leaver');
  const left = await attach(leaver);
  ok(await api.handoff({ next: 'Kern the lowercase pairs', tried: 'Auto-kerning read as uneven', state: 'handoff' }, leaver));
  clock.advance(10 * MIN);
  const fresh = await agent('fresh');
  await attach(fresh);
  const c = await context(fresh);
  const card = c.card ?? assert.fail('no card');
  assert.deepEqual(c.next_lines, [`Kern the lowercase pairs. Left by Claude (${left.spoken}) 10 min ago. Check before acting.`, 'Tried: Auto-kerning read as uneven']);
  /* THE CARD'S LINE IS THE STEP IN NAMES, with no run id and not the dead end: `next_lines` keeps both for a reader who wants them. */
  assert.equal(nextOf(card), 'Next     Kern the lowercase pairs. Left by Claude 10 min ago. Check before acting.', card);
  assert.doesNotMatch(card, /dead end/u, card);
  sql.close();
});

test('A RECORD WITH NO STEP SAYS NOTHING WAS HANDED OVER, and where the last session here stopped', async () => {
  const { sql, clock, api, agent, attach, context } = await record();
  const before = await agent('before');
  const ended = await attach(before);
  ok(await api.handoff({ state: 'done', next: 'Nothing more on the kerning' }, before));
  clock.advance(2 * 60 * MIN);
  const fresh = await agent('fresh');
  await attach(fresh);
  const c = await context(fresh);
  const card = c.card ?? assert.fail('no card');
  assert.equal(c.handoff, null);
  const next = nextOf(card) ?? assert.fail(`no Next line:\n${card}`);
  assert.match(next, new RegExp(`^Next {5}Nothing was handed over\\. Last here: Claude, 2h ago\\.$`, 'u'), card);
  /* A FINISHED RUN'S STEP IS ITS HISTORY, never anybody's next step. */
  assert.doesNotMatch(card, /Nothing more on the kerning/u, card);
  sql.close();
});

test('A PLACE NO RUN WAS IN BEFORE HAS NO NEXT LINE', async () => {
  const { sql, agent, attach, context } = await record();
  const first = await agent('first');
  await attach(first);
  const c = await context(first);
  assert.deepEqual(c.next_lines, []);
  assert.equal(nextOf(c.card ?? ''), null, c.card);
  sql.close();
});
