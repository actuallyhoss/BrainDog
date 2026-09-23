/**
 * `context` over a run written the way the the old tool import writes one: a repository and a next step, and no
 * `project` or `last_seen`, because both are `KERNEL_WRITTEN` and an import is a caller like any other.
 *
 * MEASURED BEFORE THE REPAIR (`loop/research-agent-first-day.md`, finding 4, brief 51-B): an agent attaching in the
 * repository that run named was told `handoff: null`, because the handoff query keyed on `project` whenever a project
 * resolved and the import could not write one; and the same run was listed live, `stale: false`, `age_s: 60`, because
 * a run with no `last_seen` was aged from its row's `updated_at`, which is the import's own write. The body is the
 * survey's `redcheck-handoff.ts`, which printed exactly that against the tree at `7e84f021`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Declaration, Entry } from '@braindog/kernel';

import { createRecordApi, type Attached, type CallContext, type Context } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { NOW, declarations, installSeed } from '../../seed/src/index.ts';

const MIN = 60_000;

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

type Body = { id: string; fields: { id: string }[] } & Record<string, unknown>;
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const agent = (session: CallContext['session']): CallContext => ({
  principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_1', level: 'owner' },
  session,
});

/**
 * The seed with Projects placed by repository, a project `Probe` in `probe-repo`, and a run written as the import
 * writes one (`apps/cli/src/legacy.ts:2145` to `:2170`): by a token, naming the repository, with no hints to attach
 * it by. A minute later a second agent attaches in the same repository and asks where it stands.
 */
async function seeded() {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  value(await installSeed(api.kernel));
  const things = declarations().find((d) => d.id === 'register.things') ?? assert.fail('the seed has no things');
  const body = structuredClone(things.body) as unknown as Body;
  if (!body.fields.some((f) => f.id === 'repos')) body.fields.push({ id: 'repos', type: 'list', of: 'text' } as never);
  value(await api.kernel.install([{ ...things, body: { ...body, scopes: { repos: 'repos' } } as never } as Declaration]));
  const probe = value<Entry>(await api.create({ register: 'things', fields: { name: 'Probe', lane: 'building' } }, owner));
  value(await api.update({ register: 'things', seq: probe.seq!, patch: { repos: ['probe-repo'] } }, owner));
  clock.advance(5 * MIN);
  /* A run as the import writes one: by a token with no hints, naming the repository, and no `last_seen`. */
  const write = async (id: string, fields: Record<string, unknown>) =>
    value<Entry>(
      await api.create(
        { register: 'session', fields: { client_id: `legacy:session:${id}`, agent: 'claude', doing: `the old tool run ${id}`, repo: 'probe-repo', ...fields } },
        agent({}),
      ),
    );
  const ask = async () => {
    const said = agent({ host: 'kiln-mbp', repo: 'probe-repo', agent: 'claude', client_id: 'c-1' });
    value<Attached>(await api.attach({ source: 'startup', client_id: 'c-1' }, said));
    return { said, here: value<Context>(await api.context({}, said)) };
  };
  return { api, sql, clock, write, ask };
}

async function imported() {
  const { api, sql, clock, write, ask } = await seeded();
  const run = await write('S40', { doing: 'Kerning pass', state: 'handoff', next: 'Kern the lowercase pairs', tried: ['Auto-kerning'] });
  clock.advance(MIN);
  const { said, here } = await ask();
  return { api, sql, said, here, spoken: `S${String(run.seq)}` };
}

test('an imported run that left a next step is the handoff in its repository', async () => {
  const { sql, here, spoken } = await imported();
  assert.equal(here.project?.name, 'Probe', 'the second agent stands on the project its repository names');
  assert.ok(here.handoff, 'the imported run left a next step here, and context answered handoff: null');
  assert.equal(here.handoff.from, spoken);
  assert.equal(here.handoff.next, 'Kern the lowercase pairs');
  assert.deepEqual(here.handoff.tried, ['Auto-kerning']);
  sql.close();
});

test('a run nobody attached is not listed live, by context, boot or sessions/live', async () => {
  const { api, sql, said, here, spoken } = await imported();
  const listed = [...here.live.same_repo, ...here.live.elsewhere].find((r) => r.spoken === spoken);
  assert.equal(listed, undefined, `context listed the imported run live: ${JSON.stringify(listed)}`);

  const running = value<{ spoken: string }[]>(await api.sessionsLive({}, said));
  assert.ok(!running.some((r) => r.spoken === spoken), 'sessions/live listed the imported run');
  const booted = value<{ sessions: { spoken: string }[] }>(await api.boot(said));
  assert.ok(!booted.sessions.some((r) => r.spoken === spoken), 'boot listed the imported run');
  /* THE AGENT THAT ATTACHED IS STILL LIVE: the filter drops rows nobody heard from, not runs. */
  assert.ok(running.length > 0 && booted.sessions.length > 0, 'the attached run left the live listing too');
  sql.close();
});

/**
 * WIDENING THE PLACE TO THE REPOSITORY MUST NOT WIDEN IT TO ANOTHER PROJECT. With the `project: empty` half of the
 * repository clause taken out, every test above still passed (measured by the checker of this repair), so nothing held
 * the sentence the repair's own comment says: a run placed on another project is not here, whatever repository it
 * names. Here `probe-repo` belonged to `Other` when the first agent left its next step, and to `Probe` when the second
 * agent asked where it stands.
 */
test('a run placed on another project is not the handoff, although it names this repository', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  value(await installSeed(api.kernel));
  const things = declarations().find((d) => d.id === 'register.things') ?? assert.fail('the seed has no things');
  const body = structuredClone(things.body) as unknown as Body;
  if (!body.fields.some((f) => f.id === 'repos')) body.fields.push({ id: 'repos', type: 'list', of: 'text' } as never);
  value(await api.kernel.install([{ ...things, body: { ...body, scopes: { repos: 'repos' } } as never } as Declaration]));
  const probe = value<Entry>(await api.create({ register: 'things', fields: { name: 'Probe', lane: 'building' } }, owner));
  const other = value<Entry>(await api.create({ register: 'things', fields: { name: 'Other', lane: 'building' } }, owner));
  value(await api.update({ register: 'things', seq: other.seq!, patch: { repos: ['probe-repo'] } }, owner));

  const first = agent({ host: 'kiln-mbp', repo: 'probe-repo', agent: 'claude', client_id: 'c-1' });
  value<Attached>(await api.attach({ source: 'startup', client_id: 'c-1' }, first));
  assert.equal(value<Context>(await api.context({}, first)).project?.name, 'Other', 'the first agent stands on Other');
  value(await api.handoff({ next: 'Ship the other thing', state: 'handoff' }, first));

  clock.advance(5 * MIN);
  value(await api.update({ register: 'things', seq: other.seq!, patch: { repos: [] } }, owner));
  value(await api.update({ register: 'things', seq: probe.seq!, patch: { repos: ['probe-repo'] } }, owner));
  const second = agent({ host: 'forge-mbp', repo: 'probe-repo', agent: 'claude', client_id: 'c-2' });
  value<Attached>(await api.attach({ source: 'startup', client_id: 'c-2' }, second));
  const here = value<Context>(await api.context({}, second));
  assert.equal(here.project?.name, 'Probe', 'the second agent stands on Probe');
  assert.equal(here.handoff, null, `Other's next step was handed to Probe: ${JSON.stringify(here.handoff)}`);
  sql.close();
});

/**
 * SEVERAL IMPORTED RUNS IN ONE REPOSITORY, AND NONE OF THEM HEARD FROM. The handoff query ordered by `last_seen`, which
 * no imported run has, so the tie fell to the kernel's `id DESC` and the handoff was whichever run the import wrote
 * last, `done` and `abandoned` included (wave fifty-one's checker of `f1720e4e`). Here the import writes the run that
 * asked to be picked up first and two finished runs after it, and the agent asking where it stands was handed the
 * abandoned one.
 */
test('among imported runs, the one waiting to be picked up is the handoff, not the one the import wrote last', async () => {
  const { sql, write, ask } = await seeded();
  const waiting = await write('S41', { state: 'handoff', next: 'Kern the lowercase pairs' });
  await write('S42', { state: 'done', next: 'Ship the specimen page' });
  await write('S43', { state: 'abandoned', next: 'Try the variable axis' });
  const { here } = await ask();
  assert.equal(here.handoff?.from, `S${String(waiting.seq)}`, `the handoff was ${JSON.stringify(here.handoff)}`);
  assert.equal(here.handoff?.next, 'Kern the lowercase pairs');
  sql.close();
});

/* AND WITH NONE WAITING, THE ONE THE IMPORT RECORDED LATEST. A row's `id` says when it was first written, and a later
   import that changed a run's next step moves its `updated_at` and not its `id`, so `id DESC` handed over the step of
   the run written second although the first had been changed an hour after it. */
test('among imported runs none of which waits, the one the import changed latest is the handoff', async () => {
  const { api, sql, clock, write, ask } = await seeded();
  const moved = await write('S41', { state: 'done', next: 'Kern the lowercase pairs' });
  await write('S42', { state: 'done', next: 'Ship the specimen page' });
  clock.advance(60 * MIN);
  value(await api.update({ register: 'session', seq: moved.seq!, patch: { next: 'Kern the figures' } }, agent({})));
  clock.advance(MIN);
  const { here } = await ask();
  assert.equal(here.handoff?.from, `S${String(moved.seq)}`, `the handoff was ${JSON.stringify(here.handoff)}`);
  assert.equal(here.handoff?.next, 'Kern the figures');
  sql.close();
});

/* A RUN SOMEBODY HEARD FROM STILL COMES FIRST. `handoff({ next })` with no state leaves an active run active, and nothing
   moves a `handoff` run on once it is picked up, so preferring the state over every run would hand a months-old imported
   step to an agent whose colleague left one five minutes ago. The preference is held to runs nobody heard from. */
test('a run heard from that left a next step outranks an imported run waiting to be picked up', async () => {
  const { api, sql, clock, write, ask } = await seeded();
  await write('S41', { state: 'handoff', next: 'Kern the lowercase pairs' });
  const first = agent({ host: 'forge-mbp', repo: 'probe-repo', agent: 'claude', client_id: 'c-0' });
  value<Attached>(await api.attach({ source: 'startup', client_id: 'c-0' }, first));
  const left = value<Entry>(await api.handoff({ next: 'Run the proofing script' }, first));
  clock.advance(5 * MIN);
  const { here } = await ask();
  assert.equal(here.handoff?.from, `S${String(left.seq)}`, `the handoff was ${JSON.stringify(here.handoff)}`);
  assert.equal(here.handoff?.next, 'Run the proofing script');
  sql.close();
});
