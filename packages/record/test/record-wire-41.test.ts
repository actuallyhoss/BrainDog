/**
 * The record's wiring of batch 41 (record-index-41): the card in `context` (AGT-B07), the same tree (AGT-B08), the
 * handoff that closes (AGT-C05), the door's `behind` (AGT-A02) and the night's copies on `boot` (LCH-C03).
 *
 * Each case is a fresh record with no seed, the runs placed by repository alone, so what is asserted is the wiring in
 * `index.ts` and not a sample row. The composers have their own tests (`card.test.ts`, `same-tree.test.ts`, the
 * kernel's `handoff.test.ts`, `copies.test.ts`); here each is reached the way a host reaches it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Entry } from '@braindog/kernel';

import { BOOT_SHAPE, OLDER, createRecordApi, type Attached, type Boot, type Build, type CallContext, type Context } from '../src/index.ts';
import type { DoorHealth } from '../src/methods/door.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const MIN = 60_000;

const ok = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};
const refused = (r: unknown): { code: string; fix: string } => {
  const x = r as { ok: boolean; refusal?: { code: string; fix: string } };
  assert.equal(x.ok, false, 'the call went through');
  return x.refusal!;
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

/** A record with its owner, and a key minted for each agent asked for, as the device flow mints them. */
async function record(build?: Build) {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock, ...(build === undefined ? {} : { build }) });
  ok(await api.createRecord({ id: 'rec_01J9Z8Y7X6W5V4T3S2R1Q0P9N8', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'ada@example.com', name: 'Ada' } }));
  const keys = new Map<string, string>();
  /** An agent at `host` in the repository `kiln`, by its own key, as the start hook's headers say it. */
  const agent = async (name: string, hints: Record<string, string> = {}): Promise<CallContext> => {
    if (!keys.has(name)) keys.set(name, ok<{ id: string }>(await api.createToken({ scope: 'write', label: name }, owner)).id);
    return {
      principal: { kind: 'token', id: keys.get(name)!, scope: 'write', person: 'p_1', level: 'owner' },
      session: { client_id: `c-${name}`, agent: 'claude', host: 'studio-mac', repo: 'kiln', ...hints },
    };
  };
  const attach = async (ctx: CallContext, doing?: string) =>
    ok<Attached>(await api.attach({ source: 'startup', client_id: String(ctx.session?.client_id), ...(doing === undefined ? {} : { doing }) }, ctx));
  const context = async (ctx: CallContext) => ok<Context>(await api.context({}, ctx));
  return { api, sql, clock, agent, attach, context };
}

/* ── the card ──────────────────────────────────────────────────────────── */

test('CONTEXT CARRIES THE CARD, and the ahead header reaches its Next line as commits since, read 0 to 9,999 only', async () => {
  const { sql, clock, api, agent, attach, context } = await record();
  const first = await agent('first');
  const left = await attach(first, 'Kerning pass');
  ok(await api.handoff({ next: 'Kern the lowercase pairs', state: 'handoff' }, first));
  clock.advance(10 * MIN);
  const second = await agent('second', { ahead: '3' } as Record<string, string>);
  await attach(second);
  const here = await context(second);
  assert.equal(here.handoff?.from, left.spoken);
  assert.match(here.next_lines?.[0] ?? '', /, 3 commits since\. Check before acting\.$/u);
  const card = here.card ?? assert.fail('no card');
  assert.ok(card.startsWith('BrainDog · run '), card);
  assert.match(here.card_next ?? '', /Kern the lowercase pairs\. Left by Claude \(S\d+\) 10 min ago, 3 commits since\. Check before acting\./u);

  const wild = await context({ ...second, session: { ...second.session, ahead: '12000' } as CallContext['session'] });
  assert.ok(!(wild.card ?? '').includes('commits since'), `an ahead past 9,999 was printed: ${wild.card}`);
  assert.ok(!(wild.next_lines?.[0] ?? '').includes('since'), 'an ahead past 9,999 reached the Next line');
  sql.close();
});

test('A COMMAND OLDER THAN THE DOOR is said on the card and in build, and doorHealth reads behind against the same min_cli', async () => {
  const { sql, api, agent, attach, context } = await record({ app: '2026.10.09+abc1234', slash: false, min_cli: '2026.10.07' });
  const old = await agent('old', { cli: '2026.10.01+1a2b3c4' } as Record<string, string>);
  await attach(old);
  const here = await context(old);
  assert.deepEqual(here.build, { cli: '2026.10.01+1a2b3c4', behind: true });
  assert.ok(here.card?.endsWith(OLDER), here.card);

  /* WHAT THE KEY LAST SAID, when this call says nothing: the token's own `last_build`. */
  const id = old.principal.kind === 'token' ? old.principal.id : assert.fail('not a key');
  sql.exec('UPDATE token SET last_build = ? WHERE id = ?', '2026.10.08+5d6e7f8', id);
  const quiet = await context({ ...old, session: { ...old.session, cli: undefined } as CallContext['session'] });
  assert.deepEqual(quiet.build, { cli: '2026.10.08+5d6e7f8', behind: false });
  assert.ok(!(quiet.card ?? '').includes(OLDER));

  sql.exec('UPDATE token SET last_build = ? WHERE id = ?', '2026.10.01+1a2b3c4', id);
  const health = ok<DoorHealth>(await api.doorHealth({}, owner));
  assert.deepEqual([health.host_build, health.min_cli, health.signs.behind], ['2026.10.09+abc1234', '2026.10.07', 1]);
  /* A person is never a key, and is told no build. */
  assert.equal((await context(owner)).build, null);
  sql.close();
});

/* ── the same tree ─────────────────────────────────────────────────────── */

test('THE SAME TREE IS ONE MACHINE AND ONE REPOSITORY: another machine and the caller’s own helper are not also here', async () => {
  const { sql, agent, attach, context } = await record();
  const me = await agent('me');
  const mine = await attach(me, 'Variable axis QA');
  const beside = await attach(await agent('beside'), 'Specimen copy');
  const laptop = await attach(await agent('laptop', { host: 'travel-air' }), 'Kerning pass');
  /* A HELPER WORKS UNDER ITS SESSION'S KEY, naming the run it works for. */
  const helper = await attach(await agent('me', { client_id: 'c-helper', parent: mine.spoken }), 'Reading the tests');
  const here = await context(me);

  const same = here.live.same_repo.map((r) => r.spoken);
  assert.deepEqual(same, [beside.spoken], `same tree: ${same.join(', ')}`);
  assert.ok(here.live.elsewhere.some((r) => r.spoken === laptop.spoken), 'the run on another machine is not listed at all');
  assert.ok(!same.includes(helper.spoken), 'the caller’s own helper warned it');
  assert.deepEqual(here.also_here?.runs, [{ name: `Claude (${beside.spoken})`, doing: 'Specimen copy' }]);
  assert.equal(here.also_here?.more, 0);
  assert.ok(here.card?.includes('Two sessions in one working tree overwrite each other. Coordinate or stop.'), here.card);

  /* AND THE HELPER IS NOT WARNED OF ITS OWN SESSION, even on a call that names no parent: its run says whose it is. */
  const own = await context(await agent('me', { client_id: 'c-helper' }));
  assert.equal(own.session?.spoken, helper.spoken);
  assert.deepEqual(own.live.same_repo.map((r) => r.spoken), [beside.spoken]);

  /* ALONE IN ITS TREE, nobody is also here and the card says nothing of it. */
  const alone = await context(await agent('alone', { repo: 'site' }));
  assert.equal(alone.also_here, null);
  assert.ok(!(alone.card ?? '').includes('Two sessions'), alone.card);
  sql.close();
});

/* ── the handoff that closes ───────────────────────────────────────────── */

test('TAKE AND DROP: the first taker wins and the second is told who, Next says who took it, and a drop needs a reason', async () => {
  const { sql, clock, api, agent, attach, context } = await record();
  const leaver = await agent('leaver');
  const left = await attach(leaver);
  ok(await api.handoff({ next: 'Kern the lowercase pairs', state: 'handoff' }, leaver));
  clock.advance(5 * MIN);

  const taker = await agent('taker');
  const took = await attach(taker, 'Kerning the pairs');
  assert.deepEqual(ok(await api.handoff({ take: left.spoken }, taker)), { left: left.spoken, next: 'Kern the lowercase pairs', agent: 'claude' });
  const late = await agent('late');
  await attach(late);
  const race = refused(await api.handoff({ take: left.spoken }, late));
  assert.equal(race.code, 'TRANSITION_ILLEGAL');
  assert.match(race.fix, new RegExp(`^${took.spoken} already took this`));

  /* A THIRD SESSION IS NOT HANDED THE STEP, and is told who is on it. */
  const third = await context(late);
  assert.equal(third.handoff, null);
  assert.deepEqual(third.next_lines, [`Claude (${took.spoken}) took this just now: Kern the lowercase pairs.`]);

  /* take and drop are calls of their own; a person drops, never takes; a drop says why. */
  assert.equal(refused(await api.handoff({ take: left.spoken, next: 'Something else to do now' }, late)).code, 'VALUE_MALFORMED');
  assert.equal(refused(await api.handoff({ take: left.spoken }, owner)).code, 'FORBIDDEN');
  assert.equal(refused(await api.handoff({ why: 'no longer true' }, late)).code, 'VALUE_MALFORMED');
  const other = await agent('other', { repo: 'site' });
  const gone = await attach(other);
  ok(await api.handoff({ next: 'Ship the specimen page', state: 'handoff' }, other));
  assert.equal(refused(await api.handoff({ drop: gone.spoken }, owner)).code, 'REQUIRED_MISSING');
  assert.deepEqual(ok(await api.handoff({ drop: gone.spoken, why: 'The page shipped yesterday.' }, owner)), { left: gone.spoken, next: 'Ship the specimen page' });
  const row = sql.one<{ state: string; closed_as: string }>(
    "SELECT state, json_extract(fields, '$.closed_as') AS closed_as FROM entry WHERE register = 'session' AND seq = ?",
    Number(gone.spoken.slice(1)),
  );
  assert.deepEqual({ ...row }, { state: 'done', closed_as: 'dropped' });
  sql.close();
});

/* ── the night's copies ────────────────────────────────────────────────── */

test('BOOT CARRIES THE COPIES to whoever may take one: none before the first night, then the newest copy and its size', async () => {
  const { sql, clock, api, agent } = await record();
  const fresh = ok<Boot>(await api.boot(owner));
  assert.equal(fresh.shape, BOOT_SHAPE);
  assert.deepEqual(fresh.copies, { last_copy_at: null, last_copy_bytes: null, last_export_at: null });

  clock.advance(MIN);
  api.kernel.lifecycle('export', 'system', 'snapshot snap_1 2048 bytes');
  const night = ok<Boot>(await api.boot(owner));
  assert.deepEqual([night.copies?.last_copy_at, night.copies?.last_copy_bytes], [new Date(NOW + MIN).toISOString(), 2048]);

  /* A key is no browser, and a member takes no copy: neither is told. */
  assert.equal('copies' in ok<Boot>(await api.boot(await agent('reader'))), false);
  assert.equal('copies' in ok<Boot>(await api.boot({ principal: { kind: 'person', id: 'p_2', level: 'decide' } })), false);
  sql.close();
});

test('BEHIND IS THE UPDATE LINE, never words a run wrote: a step that reads like it does not call a current command old', async () => {
  const { sql, api, agent, attach, context } = await record({ app: '2026.10.09+abc1234', slash: false, min_cli: '2026.10.07' });
  const leaver = await agent('leaver');
  const left = await attach(leaver);
  ok(await api.handoff({ next: `Tell the team: ${OLDER}`, state: 'handoff' }, leaver));
  const current = await agent('current', { cli: '2026.10.09+1a2b3c4' } as Record<string, string>);
  await attach(current);
  const here = await context(current);
  assert.ok(here.card?.includes(OLDER), `the step is not on the card: ${here.card}`);
  assert.deepEqual(here.build, { cli: '2026.10.09+1a2b3c4', behind: false });
  /* AND THE BRIEFING NAMES THE RUN THAT LEFT IT, with its handle beside the name. */
  assert.match(here.next, new RegExp(`^Start from the step Claude \\(${left.spoken}\\) left: take it with handoff take ${left.spoken} `));
  sql.close();
});
