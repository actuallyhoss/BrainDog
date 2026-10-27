/**
 * Setup sync: what each of a person's machines carries to the next (Carry), what each machine sealed and sent
 * (Bundles), and each restore drill (Drills), with a page and two automations.
 *
 * ALL THREE LISTS ARE PERSONAL (`personal: true`), so only the owner's own session and his own keys read or write them.
 * Carry plays the agents' part `carry` by declaring it. The command line finds the three by that part and by the fields
 * each holds (`findLists` in `apps/cli/src/sync-record.ts`), reads each thing to carry with `carryRowOf` and writes
 * Bundles and Drills through the normal write path, so this file installs the add-on as it ships and reads and writes
 * it the way the command does, through the record's own methods called by name.
 *
 * Installed here after Projects, People, Agents and Profiles, through the add-on door a person presses, on a fixed clock
 * the tests move to let days pass. Every name here is invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { fixedClock, openSqlite, type NodeSql } from '../../packages/kernel/test/sqlite.ts';
import { agentLists, createRecordApi, type CallContext } from '../../packages/record/src/index.ts';
import { agentsPackDocument, firstPartyDocument } from '../../packages/seed/src/index.ts';
import { carryRowOf, hardLine, placeOf, SYSTEMS, type CarryRow } from '../../apps/cli/src/carry.ts';
import { createRow, findLists, isFail, rowsOf, updateRow, type Call, type Lists } from '../../apps/cli/src/sync-record.ts';

const NOW = Date.UTC(2026, 9, 21, 9);
const DAY = 86_400_000;
const HOST = 'https://brain.example/app/the-bench';
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };

type Refusal = { code: string; fix: string; at?: string };
type Out = { ok: boolean; value?: unknown; refusal?: Refusal };
const said = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};
const refused = (r: unknown): Refusal => {
  const x = r as Out;
  assert.ok(!x.ok && x.refusal, `expected a refusal, and the call answered ${String(JSON.stringify(x.value)).slice(0, 200)}`);
  return x.refusal!;
};

type Api = Awaited<ReturnType<typeof createRecordApi>>;
type Diff = { planHash: string; approve: unknown[] };
type Clock = ReturnType<typeof fixedClock>;
type Row = { id: string; seq: number; version: number; fields: Record<string, unknown>; state?: string | null };
type Decl = { register?: string; rule?: string; metric?: string; page?: string; personal?: boolean; role?: string; blocks?: Record<string, unknown>[] };

/** The file as it ships, read fresh each time so no test can hand the next one a copy it changed. */
const file = (): Record<string, unknown> => JSON.parse(readFileSync(new URL('./setup-sync.pack.json', import.meta.url), 'utf8')) as Record<string, unknown>;
const profiles = (): Record<string, unknown> => JSON.parse(readFileSync(new URL('../profiles/profiles.pack.json', import.meta.url), 'utf8')) as Record<string, unknown>;

/** Plan and install with exactly what the plan asked to be approved. */
async function put(api: Api, doc: unknown): Promise<void> {
  const diff = said<{ diff: Diff }>(await api.planPack({ doc, source: { kind: 'local' } } as never, owner)).diff;
  said(await api.installPack({ doc, source: { kind: 'local' }, planHash: diff.planHash, approve: diff.approve } as never, owner));
}

/** A record with Projects, People, Agents and Profiles, and this add-on when `withPack` says so. */
async function record(withPack = true): Promise<{ api: Api; sql: NodeSql; clock: Clock }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  said(await api.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAF', slug: 'the-bench', name: 'The Bench', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'rowan@example.test', name: 'Rowan' } }));
  for (const id of ['portfolio', 'people']) await put(api, firstPartyDocument(id, { seeds: [] }));
  await put(api, agentsPackDocument());
  await put(api, profiles());
  if (withPack) await put(api, file());
  return { api, sql, clock };
}

/**
 * The record as the command line calls it: each method by its name, as the owner's own session. `boot` and `packs` take
 * no arguments; a name the record has no method for is answered as an older host answers it.
 */
const callOf =
  (api: Api, ctx: CallContext = owner): Call =>
  async (method, args) => {
    const m = (api as unknown as Record<string, ((...a: unknown[]) => Promise<unknown>) | undefined>)[method];
    if (typeof m !== 'function') return { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: `There is no ${method}.` } } as never;
    return (method === 'boot' || method === 'packs' ? await m.call(api, ctx) : await m.call(api, args, ctx)) as never;
  };

/** The three lists as the command line finds them. */
async function lists(api: Api): Promise<Lists> {
  const found = await findLists(callOf(api), HOST);
  assert.ok(found !== 'none' && !isFail(found), `the command line did not find the lists: ${JSON.stringify(found)}`);
  return found;
}

/** Every thing to carry, as the command line reads it. */
async function things(api: Api): Promise<CarryRow[]> {
  const read = await rowsOf(callOf(api), 'carry', HOST);
  assert.ok(!isFail(read), JSON.stringify(read));
  return read.map(carryRowOf).filter((c): c is CarryRow => c !== null);
}

const rows = async (api: Api, register: string, ctx: CallContext = owner): Promise<Row[]> => said<{ rows: Row[] }>(await api.list({ register, limit: 100 } as never, ctx)).rows;
const at = (ms: number): string => new Date(ms).toISOString();

/** A bundle as `sync push` writes it. */
const bundle = (machine: string, when: number, state = 'latest') => ({
  host: machine,
  ref: `${machine}.20261021090000.ab12`,
  at: at(when),
  heard: at(when),
  rows: ['Context folder: 3 files, 2 KB'],
  files: 3,
  size: 2048,
  sealed: ['carry/4/0123456789abcdef01234567 0123456789ab'],
  kept: 'whole',
  state,
});

test('BEFORE THE ADD-ON: no Carry, Bundles or Drills, and the command line finds nothing to carry', async () => {
  const { api, sql } = await record(false);
  for (const list of ['carry', 'sync_bundles', 'sync_drills']) assert.equal(api.kernel.register(list), undefined, list);
  assert.equal(agentLists(api.kernel.registers()).carry, undefined);
  assert.equal(await findLists(callOf(api), HOST), 'none');
  sql.close();
});

test('THE FILE: setup-sync 1.0.2 on Profiles and People, three personal lists, one figure, two automations, a page and eight starter things', () => {
  const doc = file() as { pack: string; version: string; requires: { packs: unknown }; declarations: Decl[]; seeds: { register: string; fields: Record<string, unknown> }[] };
  assert.deepEqual([doc.pack, doc.version], ['setup-sync', '1.0.5']);
  assert.deepEqual(doc.requires.packs, { profiles: '^1.0.0', people: '>=3.3.0 <5.0.0' });
  const listed = doc.declarations.filter((d) => d.register !== undefined && d.rule === undefined);
  assert.deepEqual(
    listed.map((d) => [d.register, d.personal]),
    [
      ['carry', true],
      ['sync_bundles', true],
      ['sync_drills', true],
    ],
  );
  assert.equal(listed[0]?.role, 'carry');
  assert.deepEqual(doc.declarations.filter((d) => d.rule !== undefined).map((d) => d.rule), ['sync-machine-quiet', 'sync-drill-due']);
  assert.deepEqual(doc.declarations.filter((d) => d.metric !== undefined).map((d) => d.metric), ['sync-quiet-machines']);
  assert.equal(doc.seeds.length, 8, 'eight starter things, the most an add-on seeds');
  assert.ok(!JSON.stringify(doc).includes('—'), 'no long dash in anything a person reads');

  /* WHAT A PERSON READS ON THE PAGE says none of the machinery's words. */
  const page = doc.declarations.find((d) => d.page === 'setup-sync');
  const read = (page?.blocks ?? []).flatMap((b) => [b.heading, b.body, b.empty, ...((b.columns as { label?: string }[] | undefined) ?? []).map((c) => c.label)]).filter((s): s is string => typeof s === 'string');
  for (const s of read) assert.doesNotMatch(s, /\brows?\b|\bcredentials?\b|\bMCP\b|\bpacks?\b|\bschemas?\b/u, s);

  /* AUTO MEMORY IS OFF AND WAITS ON THE OWNER'S YES; NOTHING NAMES AN AGENT APP'S OWN LOGIN. */
  const memory = doc.seeds.find((s) => s.fields.kind === 'memory');
  assert.equal(memory?.fields.state, 'off');
  assert.match(String(memory?.fields.note), /waits on the owner's yes/u);
  const all = JSON.stringify(doc.seeds);
  for (const login of ['Claude Code-credentials', 'claudeAiOauth', '.credentials.json']) assert.ok(!all.includes(login), login);
  assert.ok(!/(?<![-\w])auth\.json/u.test(all), "Codex's login file");
});

test('INSTALLED AS IT SHIPS: three personal lists, Carry plays its part, and the command line finds all three and reads the eight things', async () => {
  const { api, sql } = await record();
  const personal = [...api.kernel.personalLists()];
  for (const list of ['carry', 'sync_bundles', 'sync_drills']) assert.ok(personal.includes(list), `${list} is not personal`);
  assert.equal(agentLists(api.kernel.registers()).carry, 'carry');

  const found = await lists(api);
  assert.deepEqual([found.carry.id, found.bundles?.id, found.drills?.id], ['carry', 'sync_bundles', 'sync_drills']);

  const carried = await things(api);
  assert.deepEqual(carried.map((c) => c.name).sort(), ['.env files', 'Auto memory', 'Context folder', 'Local programs', 'Tool sign-ins', 'Work not yet pushed', 'ccenv shared files', 'npm settings'].sort());
  const named = (name: string): CarryRow => carried.find((c) => c.name === name)!;
  const home = '/home/rowan';

  /* TOOL SIGN-INS: ccenv's own Keychain item on a Mac, never a profile's; a file elsewhere. */
  assert.deepEqual(placeOf(named('Tool sign-ins'), 'mac', { home, env: {}, user: 'rowan' }), { place: { kind: 'keychain', item: { service: 'ccenv-mcp-auth', account: 'rowan' } } });
  const linux = placeOf(named('Tool sign-ins'), 'linux', { home, env: {} });
  assert.ok('place' in linux && linux.place.kind === 'path' && linux.place.path.endsWith('mcp-auth.json'), JSON.stringify(linux));
  assert.equal(named('Tool sign-ins').kind, 'sign_ins');

  /* PROGRAMS RUN, AND A BASH TOOL HAS NO WINDOWS PLACE, SO IT IS SKIPPED THERE. */
  assert.equal(named('Local programs').runs, true);
  assert.deepEqual(placeOf(named('Local programs'), 'windows', { home, env: {} }), { none: true });
  assert.deepEqual(named('Local programs').leaveOut, ['claude']);
  assert.ok(named('ccenv shared files').leaveOut.includes('mcp-auth.json'), 'the sign-ins file rides only as tool sign-ins');

  /* AUTO MEMORY IS OFF, AND ITS PLACE CROSSES THE TRANSCRIPTS LINE, SO IT IS REFUSED EVEN WHEN TURNED ON. */
  assert.deepEqual([named('Auto memory').kind, named('Auto memory').on], ['memory', false]);
  for (const system of SYSTEMS) assert.ok('refused' in placeOf(named('Auto memory'), system, { home, env: {} }), system);

  /* EVERY OTHER THING'S PLACE ON EVERY SYSTEM IS CLEAR OF THE HARD LINES. */
  for (const c of carried.filter((x) => x.kind !== 'memory'))
    for (const system of SYSTEMS) {
      const p = placeOf(c, system, { home, env: {}, user: 'rowan' });
      assert.ok(!('refused' in p), `${c.name} on ${system}: ${JSON.stringify(p)}`);
      if ('place' in p && p.place.kind === 'path') assert.equal(hardLine(p.place.path), null, `${c.name} on ${system}`);
    }

  /* THE STARTER THINGS ARE MARKED AS EXAMPLES. */
  assert.ok((await rows(api, 'carry')).every((r) => (r.fields.tags as string[] | undefined)?.includes('example')));
  sql.close();
});

test('ONLY THE OWNER READS THEM: an Admin is refused all three lists and sees nothing of them on the page', async () => {
  const { api, sql } = await record();
  const found = await lists(api);
  assert.equal(await createRow(callOf(api), found.bundles!, bundle('bench-laptop', NOW), HOST), 'written');
  said(await api.invite({ person: 'p_2', name: 'Sasha', level: 'decide' }, owner));
  const held = api.kernel.access('p_2')!;
  const admin: CallContext = { principal: { kind: 'person', id: 'p_2', level: held.level }, ...(held.registers === null ? {} : { registers: held.registers }), levels: held.levels };
  for (const register of ['carry', 'sync_bundles', 'sync_drills']) {
    const no = refused(await api.list({ register } as never, admin));
    assert.equal(no.code, 'FORBIDDEN');
    assert.match(no.fix, /is personal/u);
  }
  /* AND THE COMMAND LINE, AS ANYBODY BUT THE OWNER, FINDS NOTHING TO CARRY. */
  assert.equal(await findLists(callOf(api, admin), HOST), 'none');
  const page = JSON.stringify(await api.page({ slug: 'setup-sync' } as never, admin));
  /* THE STARTER ROW'S NAME, NOT 'Tool sign-ins': that is also the first words of a note every reader is shown. */
  for (const word of ['ccenv shared files', 'bench-laptop']) assert.ok(!page.includes(word), `the page showed ${word} to an Admin`);
  assert.equal(refused(await api.invite({ person: 'p_3', name: 'Kit', level: 'read', registers: { carry: 'read' } }, owner)).code, 'FORBIDDEN');
  sql.close();
});

test("THE PAGE: each machine's last bundle, what waits for a yes, and the last drill, as the command line writes them", async () => {
  const { api, sql } = await record();
  const call = callOf(api);
  const found = await lists(api);
  assert.equal(await createRow(call, found.bundles!, bundle('bench-laptop', NOW - DAY, 'older'), HOST), 'written');
  assert.equal(await createRow(call, found.bundles!, bundle('bench-laptop', NOW), HOST), 'written');
  assert.equal(await createRow(call, found.bundles!, bundle('studio-tower', NOW), HOST), 'written');
  assert.equal(
    await createRow(call, found.drills!, { host: 'studio-tower', ref: 'bench-laptop.20261021090000.ab12', sent_by: 'bench-laptop', at: at(NOW), grade: 'pass', files: 3, matched: 3, fails: [], state: 'latest' }, HOST),
    'written',
  );
  /* A PROGRAM WAITING FOR A YES ON ONE MACHINE, written on its thing as `sync pull` writes it. */
  const local = await rowsOf(call, 'carry', HOST);
  assert.ok(!isFail(local), JSON.stringify(local));
  const programs = local.find((r) => r.fields.name === 'Local programs');
  assert.ok(programs !== undefined);
  assert.equal(await updateRow(call, found.carry, programs, { waits: ['studio-tower'] }, HOST), 'written');

  const page = said<{ blocks: { kind: string; heading?: string; rows?: Row[]; refusals?: unknown[] }[] }>(await api.page({ slug: 'setup-sync' } as never, owner));
  for (const b of page.blocks) assert.deepEqual(b.refusals ?? [], [], `${b.heading ?? b.kind} was refused`);
  const block = (heading: string) => page.blocks.find((b) => b.heading === heading)!;
  assert.deepEqual(block("Each machine's last bundle").rows!.map((r) => r.fields.host).sort(), ['bench-laptop', 'studio-tower']);
  assert.deepEqual(block('Waiting for a yes at a terminal').rows!.map((r) => r.fields.name), ['Local programs']);
  assert.deepEqual(block('The last drill').rows!.map((r) => r.fields.grade), ['pass']);
  assert.equal(block('What each machine carries').rows!.length, 8);
  assert.equal(said<{ value: number }>(await api.metric({ metric: 'sync-quiet-machines' } as never, owner)).value, 0, 'no machine is quiet yet');
  sql.close();
});

test('A MACHINE QUIET FOR SEVEN DAYS IS ASKED ABOUT ONCE, AND A DRILL OVER THIRTY DAYS OLD ONCE', async () => {
  const { api, sql, clock } = await record();
  const call = callOf(api);
  const found = await lists(api);
  assert.equal(await createRow(call, found.bundles!, bundle('bench-laptop', NOW), HOST), 'written');
  assert.equal(
    await createRow(call, found.drills!, { host: 'bench-laptop', ref: 'bench-laptop.20261021090000.ab12', sent_by: 'bench-laptop', at: at(NOW), grade: 'pass', files: 3, matched: 3, fails: [], state: 'latest' }, HOST),
    'written',
  );
  /* WHAT EACH QUESTION ASKS IS THE LINE THAT OPENED IT (`questionOf` in the kernel's `govern.ts`). */
  const asked = (rule: string) =>
    sql
      .all<{ q: string }>(
        "SELECT coalesce(e.to_v, e.note) AS q FROM suggestion s JOIN event e ON e.target = 'suggestion:' || s.id AND e.kind = 'suggest' AND e.field IS NULL WHERE s.opened_by = ? ORDER BY e.rowid",
        `rule:${rule}`,
      )
      .map((r) => r.q);

  clock.advance(6 * DAY);
  api.kernel.purge();
  assert.deepEqual(asked('sync-machine-quiet'), [], 'six quiet days is not seven');
  clock.advance(2 * DAY);
  api.kernel.purge();
  assert.deepEqual(asked('sync-machine-quiet'), ['bench-laptop has not checked in its setup for seven days. Run braindog sync push there, or retire it if it is gone?']);
  clock.advance(60 * 60_000);
  api.kernel.purge();
  assert.equal(asked('sync-machine-quiet').length, 1, 'the same quiet machine was asked about twice');
  assert.equal(said<{ value: number }>(await api.metric({ metric: 'sync-quiet-machines' } as never, owner)).value, 1);
  assert.deepEqual(asked('sync-drill-due'), [], 'eight days is not thirty');

  clock.advance(23 * DAY);
  api.kernel.purge();
  assert.deepEqual(asked('sync-drill-due'), ['The last restore drill ran over thirty days ago, on bench-laptop. Run braindog sync drill to check a new machine could still be set up?']);
  sql.close();
});
