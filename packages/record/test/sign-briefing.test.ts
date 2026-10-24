/**
 * `briefing-true` (PRF-A05 job 2): the record's own `context` for the repositories with the newest runs, checked claim by
 * claim against reads of the tables, and filed through the kernel's `signRead`.
 *
 * A green record built through public verbs (runs written and attached, a question asked); a red one the same way (the
 * newest step ten days old); and three briefings that lie, handed in place of the record's own, each caught: a step
 * from a run that is not there, a queue shorter than the questions open, and a run named live that went quiet hours ago.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext, type Context } from '../src/index.ts';
import { fileRecordSigns, readBriefingSign, repoName, type RecordSignsDeps } from '../src/signs.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const OPTIONS = { options: [{ id: 'yes', label: 'Yes', because: 'It is due' }, { id: 'no', label: 'No', because: 'It is not' }] };

const owner = (repo: string): CallContext => ({ principal: { kind: 'person', id: 'p_1', level: 'owner' }, session: { repo } });
const agent = (session: CallContext['session']): CallContext => ({ principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_1', level: 'owner' }, session });

const NO_ID = /\b[0-9A-HJKMNP-TV-Z]{26}\b|\bS\d+\b|\bSG\d+\b|#\d/u;

async function record() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  /** A run as an import writes one: a repository, what it did, and the step it left. */
  const left = async (repo: string, doing: string, next: string) => {
    const r = await api.create({ register: 'session', fields: { client_id: `import:${doing}`, agent: 'claude', doing, repo, state: 'handoff', next } }, agent({}));
    assert.ok(r.ok, JSON.stringify(r));
  };
  /** A session that connects in a repository and is heard from now. */
  const attach = async (repo: string, client: string) => assert.ok((await api.attach({ source: 'startup', client_id: client } as never, agent({ host: 'mbp', repo, agent: 'claude', client_id: client }))).ok);
  const deps: RecordSignsDeps = {
    sql,
    briefing: async (repo) => {
      const r = await api.context({} as never, owner(repo));
      return r.ok ? r.value : null;
    },
  };
  return { sql, clock, api, left, attach, deps };
}

const briefingSign = async (api: Awaited<ReturnType<typeof record>>['api']) => {
  const all = api.kernel.signs();
  assert.ok(all.ok);
  return all.value.signs.find((s) => s.sign === 'briefing-true')!;
};

test('NONE ON AN EMPTY RECORD: no run in any repository is nothing to judge by, never green', async () => {
  const { api, deps } = await record();
  assert.equal((await briefingSign(api)).state, 'none', 'unfiled');
  const filed = await fileRecordSigns(api.kernel, deps, NOW);
  assert.deepEqual(filed.refused, []);
  assert.equal(filed.briefing.state, 'none');
  const s = await briefingSign(api);
  assert.equal(s.state, 'none');
  assert.match(s.said, /No agent has worked in a repository yet/u);
});

test('GREEN: the step handed is the newest, the queue is the questions open, and every run named live was heard from', async () => {
  const { api, clock, left, attach, deps } = await record();
  await left('git@github.com:ada/kiln.git', 'Kerning pass', 'Kern the lowercase pairs');
  clock.advance(30 * MIN);
  await left('git@github.com:ada/kiln.git', 'Glyph audit', 'Draw the missing euro sign');
  await attach('/Users/ada/site', 'c-1');
  assert.ok(api.kernel.propose({ question: 'Fire the kiln on Friday?', body_kind: 'options', body: { ...OPTIONS, about: 'kiln' } } as never, 'slash').ok);
  clock.advance(2 * 60 * MIN);
  await attach('/Users/ada/site', 'c-1');

  await fileRecordSigns(api.kernel, deps, clock.now());
  const s = await briefingSign(api);
  assert.equal(s.state, 'green', `${s.said} ${s.facts.join(' | ')}`);
  assert.equal(s.said, 'The briefing a new session is handed is true in site and kiln.');
  assert.ok(s.facts.includes('kiln: hands the step "Glyph audit" left 2 hours ago.'), s.facts.join(' | '));
  assert.ok(s.facts.includes('site: no run left a step, and none is handed.'), s.facts.join(' | '));
  assert.doesNotMatch([s.said, ...s.facts].join(' '), NO_ID);
  assert.doesNotMatch([s.said, ...s.facts].join(' '), /github\.com|\/Users\//u, 'a repository by its name, never its address');
});

test('A STEP TEN DAYS OLD IS NOT HANDED (AGT-C05), so the briefing is true without it, and one that hands a step that old is red', async () => {
  const { sql, api, clock, left, deps } = await record();
  await left('kiln', 'Kerning pass', 'Kern the lowercase pairs');
  const real = (await deps.briefing('kiln'))!;
  const old = await readBriefingSign({ sql, briefing: () => ({ ...real, handoff: { ...real.handoff!, age_s: 10 * 86_400 } }) }, clock.now());
  assert.equal(old.state, 'red');
  assert.equal(old.said, 'The briefing for kiln hands a step 10 days old.');
  assert.equal(old.value, 1);
  clock.advance(10 * DAY);
  await fileRecordSigns(api.kernel, deps, clock.now());
  const s = await briefingSign(api);
  assert.equal(s.state, 'green', `${s.said} ${s.facts.join(' | ')}`);
  assert.ok(s.facts.includes('kiln: no run left a step, and none is handed.'), s.facts.join(' | '));
});

test('RED: a briefing that hands a step from a run the record does not hold', async () => {
  const { sql, left, api, deps } = await record();
  await left('kiln', 'Kerning pass', 'Kern the lowercase pairs');
  const real = (await deps.briefing('kiln'))!;
  const lie: Context = { ...real, handoff: { ...real.handoff!, from: 'S99' } };
  const r = await readBriefingSign({ sql, briefing: () => lie }, NOW);
  assert.equal(r.state, 'red');
  assert.equal(r.said, 'The briefing for kiln hands a step no run on the record left.');
  assert.equal((await readBriefingSign(deps, NOW)).state, 'green', 'the record’s own briefing is true');
  void api;
});

test('RED: a briefing that hands an older step, or none, while a newer one was left', async () => {
  const { sql, clock, left, deps } = await record();
  await left('kiln', 'Kerning pass', 'Kern the lowercase pairs');
  const older = (await deps.briefing('kiln'))!;
  clock.advance(3 * DAY);
  await left('kiln', 'Glyph audit', 'Draw the missing euro sign');
  const stale = await readBriefingSign({ sql, briefing: () => older }, clock.now());
  assert.equal(stale.state, 'red');
  /* AND THE OLD BRIEFING STILL NAMES THE IMPORT'S OWN RUN LIVE, three days quiet: a second thing not true. */
  assert.equal(stale.said, 'The briefing for kiln hands the step "Kerning pass" left, 3 days before the newest, from "Glyph audit". And 1 more thing is not true.');
  assert.deepEqual(stale.facts, ['The briefing for kiln names "Agent run" as live, and it was last heard from 3 days ago.']);
  const none = await readBriefingSign({ sql, briefing: () => ({ ...older, handoff: null, live: { same_repo: [], elsewhere: [] } }) }, clock.now());
  assert.equal(none.said, 'The briefing for kiln hands no step, though "Glyph audit" left one a moment ago.');
});

test('RED: the questions it says wait are not the questions open, and a run named live went quiet hours ago', async () => {
  const { sql, clock, api, left, attach, deps } = await record();
  await left('kiln', 'Kerning pass', 'Kern the lowercase pairs');
  await attach('kiln', 'c-1');
  for (const question of ['Fire the kiln on Friday?', 'Order more clay?'])
    assert.ok(api.kernel.propose({ question, body_kind: 'options', body: { ...OPTIONS, about: question } } as never, 'slash').ok);
  const then = (await deps.briefing('kiln'))!;
  assert.equal(then.waiting.length, 2);
  /* THE SYSTEM BRIEFING SENDS ONLY { repo } AND NAMES NO MACHINE, so no run shares its tree (`sameTree`): live, wherever it is. */
  assert.equal([...then.live.same_repo, ...then.live.elsewhere].length, 2);
  clock.advance(3 * 60 * MIN);
  const r = await readBriefingSign({ sql, briefing: () => ({ ...then, waiting: then.waiting.slice(0, 1) }) }, clock.now());
  assert.equal(r.state, 'red');
  assert.equal(r.said, 'The briefing for kiln says 1 question waits, and 2 are open. And 2 more things are not true.');
  assert.ok((r.facts ?? []).includes('The briefing for kiln names "Claude in kiln" as live, and it was last heard from 3 hours ago.'), (r.facts ?? []).join(' | '));
  assert.equal((await readBriefingSign(deps, clock.now())).state, 'green', 'the record’s own briefing leaves the quiet run out');
});

test('A REPOSITORY IS SAID BY ITS NAME', () => {
  assert.equal(repoName('git@github.com:ada/kiln.git'), 'kiln');
  assert.equal(repoName('https://github.com/ada/kiln'), 'kiln');
  assert.equal(repoName('/Users/ada/Developer/kiln/'), 'kiln');
  assert.equal(repoName('C:\\work\\kiln'), 'kiln');
});

test('A RUN IS SAID BY WHAT IT DID, with no path, address or key in it', async () => {
  const { left, clock, deps } = await record();
  await left('kiln', 'Fix /Users/ada/kiln/src/glyphs.ts for ada@kiln.example', 'Kern the lowercase pairs');
  clock.advance(2 * HOUR);
  const real = (await deps.briefing('kiln'))!;
  const none = await readBriefingSign({ sql: deps.sql, briefing: () => ({ ...real, handoff: null, live: { same_repo: [], elsewhere: [] } }) }, clock.now());
  assert.match(none.said, /though "Fix for someone at kiln\.example" left one 2 hours ago/u);
  assert.doesNotMatch(none.said, /\/Users|glyphs\.ts|ada@/u);
});

test('RED: a queue of the right length that names a question the record does not hold open', async () => {
  const { sql, api, left, deps } = await record();
  await left('kiln', 'Kerning pass', 'Kern the lowercase pairs');
  assert.ok(api.kernel.propose({ question: 'Fire the kiln on Friday?', body_kind: 'options', body: { ...OPTIONS, about: 'kiln' } } as never, 'slash').ok);
  const real = (await deps.briefing('kiln'))!;
  assert.equal(real.waiting.length, 1);
  const lie: Context = { ...real, waiting: [{ id: 'SG99', question: 'Order more clay?' }] };
  const r = await readBriefingSign({ sql, briefing: () => lie }, NOW);
  assert.equal(r.state, 'red');
  assert.equal(r.said, 'The briefing for kiln says 1 question waits that is not open.');
  assert.doesNotMatch([r.said, ...(r.facts ?? [])].join(' '), NO_ID);
  assert.equal((await readBriefingSign(deps, NOW)).state, 'green', 'the record’s own queue names the question open');
});
