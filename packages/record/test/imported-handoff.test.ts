/**
 * `context` over a run written the way an import writes one: a repository and a next step, and no `project` or
 * `last_seen`, because both are `KERNEL_WRITTEN` and an import is a caller like any other. Since AGT-C10 an import may
 * send the day a run was last seen where it came from, which lands as `seen_before` and leaves `last_seen` empty.
 *
 * MEASURED BEFORE THE REPAIR: an agent attaching in the repository that run named was told `handoff: null`, because the
 * handoff query keyed on `project` whenever a project resolved and the import could not write one; and the same run was
 * listed live, `stale: false`, `age_s: 60`, because a run with no `last_seen` was aged from its row's `updated_at`,
 * which is the import's own write. The body below printed exactly that against the tree at `7e84f021`.
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
 * writes one: by a token, naming the repository, with no hints to attach it by. A minute later a second agent attaches
 * in the same repository and asks where it stands.
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
        { register: 'session', fields: { client_id: `import:session:${id}`, agent: 'claude', doing: `Imported run ${id}`, repo: 'probe-repo', ...fields } },
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
 * repository clause taken out, every test above still passed (measured), so nothing held the sentence the repair's own
 * comment says: a run placed on another project is not here, whatever repository it names. Here `probe-repo` belonged
 * to `Other` when the first agent left its next step, and to `Probe` when the second agent asked where it stands.
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
 * last, `done` and `abandoned` included (measured at `f1720e4e`). Here the import writes the run that asked to be
 * picked up first and two finished runs after it, and the agent asking where it stands was handed the abandoned one.
 */
test('among imported runs, the one waiting to be picked up is the handoff, not the one the import wrote last', async () => {
  const { sql, write, ask } = await seeded();
  const waiting = await write('S41', { state: 'handoff', next: 'Kern the lowercase pairs' });
  /* AND AS THE IMPORT WRITES A RUN NOW (AGT-C10): with the day it was last seen in the old system, which lands as
     `seen_before`, and a finished run's step dropped, so a done or abandoned run carried in holds none to hand over. */
  const SEEN = '2026-09-21T10:00:00.000Z';
  const done = await write('S42', { state: 'done', next: 'Ship the specimen page', last_seen: SEEN });
  const gone = await write('S43', { state: 'abandoned', next: 'Try the variable axis', last_seen: SEEN });
  for (const r of [done, gone]) {
    assert.equal(r.fields.next, undefined, `${String(r.fields.state)} carried run kept its step`);
    assert.deepEqual([r.fields.seen_before, r.fields.last_seen], [SEEN, undefined]);
  }
  const { here } = await ask();
  assert.equal(here.handoff?.from, `S${String(waiting.seq)}`, `the handoff was ${JSON.stringify(here.handoff)}`);
  assert.equal(here.handoff?.next, 'Kern the lowercase pairs');
  sql.close();
});

/* AND WITH NONE WAITING, NOTHING IS HANDED OVER (AGT-C05). A finished run's step is its history: handing over the newest
   step here in any state sent a starting session after work that had shipped. So the handoff is null, and Next says
   where the last run here stopped instead: the one the import changed latest, since none of them was heard from. */
test('among imported runs none of which waits, nothing is handed over and Next names the one changed latest', async () => {
  const { api, sql, clock, write, ask } = await seeded();
  const moved = await write('S41', { state: 'done', next: 'Kern the lowercase pairs', head: '5a57ba2' });
  await write('S42', { state: 'done', next: 'Ship the specimen page' });
  clock.advance(60 * MIN);
  value(await api.update({ register: 'session', seq: moved.seq!, patch: { next: 'Kern the figures' } }, agent({})));
  clock.advance(MIN);
  const { here } = await ask();
  assert.equal(here.handoff, null, `a finished run's step was handed over: ${JSON.stringify(here.handoff)}`);
  assert.deepEqual(here.next_lines, [`Nothing was handed over. Last here: Claude (S${String(moved.seq)}), 1 min ago, at 5a57ba2.`]);
  sql.close();
});

/* A RUN STILL WORKING HAS HANDED NOTHING OVER. `handoff({ next })` with no state leaves the run active: the step is open
   only once the run waits in `handoff` (`openHandoffs`). Then the newer step leads, and the imported one is counted. */
test('a working run that wrote a next step hands it over only once it waits, and then it leads', async () => {
  const { api, sql, clock, write, ask } = await seeded();
  const imported = await write('S41', { state: 'handoff', next: 'Kern the lowercase pairs' });
  const first = agent({ host: 'forge-mbp', repo: 'probe-repo', agent: 'claude', client_id: 'c-0' });
  value<Attached>(await api.attach({ source: 'startup', client_id: 'c-0' }, first));
  const left = value<Entry>(await api.handoff({ next: 'Run the proofing script' }, first));
  clock.advance(5 * MIN);
  const working = (await ask()).here;
  assert.equal(working.handoff?.from, `S${String(imported.seq)}`, `the handoff was ${JSON.stringify(working.handoff)}`);
  value(await api.handoff({ state: 'handoff' }, first));
  clock.advance(MIN);
  const { here } = await ask();
  assert.equal(here.handoff?.from, `S${String(left.seq)}`, `the handoff was ${JSON.stringify(here.handoff)}`);
  assert.equal(here.handoff?.next, 'Run the proofing script');
  assert.equal(here.handoff?.earlier, 1, 'the imported step still open here is not counted');
  sql.close();
});
