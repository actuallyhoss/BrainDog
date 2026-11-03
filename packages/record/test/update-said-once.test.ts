/**
 * An update the record made by itself is said once, and is nobody's work: one pass of BrainDog's own update
 * reads as one line with its steps under it, in Activity and in "since you were away" alike, a second pass the same day
 * adds none, two ticks that meet put each version in once, and the count of who did what gives the pass to the record.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FIRST_PARTY_VERSIONS, firstPartyDocument } from '@braindog/seed/packs';

import { createRecordApi, type CallContext, type EventLine, type HistoryPage, type WhatsNew } from '../src/index.ts';
import { byWhoOf, installedTwice, passFolder, passKept, passSentence, whoOf, type UpdatePass } from '../src/update-pass.ts';
import { openSqlite } from '../../kernel/test/sqlite.ts';

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

type Api = Awaited<ReturnType<typeof createRecordApi>>;

/** Put a first-party module in at 1.0.0, as an owner installs one, so this build's version is an update. */
async function putOld(api: Api, id: 'portfolio' | 'work') {
  const doc = { ...firstPartyDocument(id, { holds: [], seeds: [] })!, version: '1.0.0' };
  delete (doc as { seeds?: unknown }).seeds;
  const planned = value<{ diff: { planHash: string } }>(await api.planPack({ doc, source: { kind: 'local' } }, owner));
  value(await api.installPack({ doc, source: { kind: 'local' }, planHash: planned.diff.planHash }, owner));
}

/** A record holding Portfolio and Work behind this build, and one task the owner wrote. */
async function record(now: { at: number }) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: { now: () => now.at } as never });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  await putOld(api, 'portfolio');
  await putOld(api, 'work');
  return { api, sql };
}

const held = (api: Api, id: string) => api.kernel.packStates().find((p) => p.id === id)?.version;
const passes = (lines: readonly EventLine[]) => lines.filter((l) => l.kind === 'update');
const history = async (api: Api, args: { cursor?: unknown; limit?: number } = {}) => value<HistoryPage>(await api.recentHistory({ ...args, everything: false }, owner));

test('ONE PASS THAT MOVES TWO ADD-ONS IS ONE LINE THAT OPENS TO ITS STEPS, and the record wrote it', async () => {
  const now = { at: Date.UTC(2026, 9, 6, 3) };
  const { api, sql } = await record(now);
  api.kernel.setPref('slash', 'slash.daily', false);
  await api.slashTick();
  assert.equal(held(api, 'portfolio'), FIRST_PARTY_VERSIONS.portfolio);
  assert.equal(held(api, 'work'), FIRST_PARTY_VERSIONS.work);
  const page = await history(api, { limit: 200 });
  const [pass, ...more] = passes(page.events);
  assert.ok(pass, 'the pass is said as one line');
  assert.equal(more.length, 0);
  assert.equal(pass.actor, 'system');
  assert.equal(pass.pass?.updated, 2);
  assert.match(pass.pass!.said, /^BrainDog updated 2 plugins: (Portfolio|Projects)/u);
  assert.ok((pass.steps ?? []).length >= 2, 'the steps are under it');
  /* EACH STEP KEEPS ITS OWN LINE, so its own undo, and none of them is said again beside the pass. */
  const ids = new Set(page.events.map((l) => l.id));
  for (const st of pass.steps!) assert.ok(!ids.has(st.id) || st.id === pass.id);
  assert.equal(new Set(pass.steps!.map((st) => st.id)).size, pass.steps!.length);
  /* THE INSTALLS THE OWNER MADE BEFORE IT ARE NOT THE PASS'S, though the kernel signs them as the record too. */
  assert.equal(page.events.filter((l) => l.kind === 'install').length, 2);
  assert.equal(page.byWho.agents, 0);
  assert.equal(page.byWho.record, page.events.filter((l) => ['system', 'p_seed', 'slash'].includes(l.actor)).length);
  assert.ok(page.byWho.record >= 1);
  assert.equal(page.byWho.you, page.events.filter((l) => l.actor === 'p_1').length);
  /* WHAT'S NEW FOLDS IT THE SAME WAY. */
  const news = value<WhatsNew>(await api.whatsNew(undefined, owner));
  assert.equal(passes(news.events).length, 1);
  assert.equal(news.byWho.agents, 0);
  sql.close();
});

test('A SECOND PASS THE SAME DAY LEAVES NO LINE, and two ticks that meet put each version in once', async () => {
  const now = { at: Date.UTC(2026, 9, 6, 3) };
  const { api, sql } = await record(now);
  api.kernel.setPref('slash', 'slash.daily', false);
  await Promise.all([api.slashTick(), api.slashTick()]);
  assert.deepEqual(installedTwice(sql), []);
  const before = passes((await history(api, { limit: 200 })).events).length;
  await api.slashTick();
  assert.equal(passes((await history(api, { limit: 200 })).events).length, before);
  assert.equal(before, 1);
  sql.close();
});

test('A PAGE THAT ENDS ON A PASS STARTS THE NEXT ONE UNDER ALL OF IT', async () => {
  const now = { at: Date.UTC(2026, 9, 6, 3) };
  const { api, sql } = await record(now);
  api.kernel.setPref('slash', 'slash.daily', false);
  await api.slashTick();
  const top = await history(api, { limit: 1 });
  assert.equal(top.events[0]?.kind, 'update');
  const below = await history(api, { cursor: top.cursor, limit: 200 });
  const stepIds = new Set(top.events[0]!.steps!.map((st) => st.id));
  assert.ok(below.events.every((l) => !stepIds.has(l.id) && l.kind !== 'update'));
  sql.close();
});

test('THE PASS SAYS HOW MANY ADD-ONS AND WHETHER WHAT YOU CHANGED WAS KEPT, in plain words', () => {
  const one = passSentence({ updated: ['Projects'], asked: [] });
  assert.equal(one, 'BrainDog updated one plugin: Projects, and nothing you changed was lost.');
  const two = passSentence({ updated: ['Projects', 'Work'], asked: ['Money'] });
  assert.equal(two, 'BrainDog updated 2 plugins: Projects and Work. Money waits on Decide, so what you changed is kept.');
  for (const s of [one, two, passSentence({ updated: [], asked: ['Money', 'People'] })]) assert.doesNotMatch(s, /—|\brow\b|_/u);
  /* A PASS THAT WROTE NOTHING IS NOT KEPT, nor one that updated and asked nothing, and the oldest go first. */
  const p = (from: number): UpdatePass => ({ from, to: from + 1, at: '2026-10-06', updated: ['Work'], asked: [] });
  assert.equal(passKept([], { ...p(4), to: 4 }).length, 0);
  assert.equal(passKept([], { ...p(4), updated: [] }).length, 0);
  assert.equal(passKept([], { ...p(4), updated: [], asked: ['Money'] }).length, 1);
  assert.equal(passKept(Array.from({ length: 40 }, (_, i) => p(i * 2)), p(100)).at(-1)?.from, 100);
});

test('WHO DID IT: the record is never an agent or a person', () => {
  assert.equal(whoOf('system', 'p_1'), 'record');
  assert.equal(whoOf('slash', 'p_1'), 'record');
  assert.equal(whoOf('p_seed', 'p_1'), 'record');
  assert.equal(whoOf('p_1', 'p_1'), 'you');
  assert.equal(whoOf('p_2', 'p_1'), 'people');
  assert.equal(whoOf('agent:claude', 'p_1'), 'agents');
  assert.equal(whoOf('S42', 'p_1'), 'agents');
  assert.equal(whoOf('rule:salary', 'p_1'), 'rules');
  assert.equal(whoOf('ingest:mail', 'p_1'), 'rules');
  /* BRAINDOG'S OWN RULES ARE BRAINDOG'S, as Activity names them; the trust ladder stays a rule. */
  assert.equal(whoOf('rule:handled', 'p_1'), 'record');
  assert.equal(whoOf('rule:additive', 'p_1'), 'record');
  assert.equal(whoOf('rule:update', 'p_1'), 'record');
  assert.equal(whoOf('rule:ladder', 'p_1'), 'rules');
  assert.deepEqual(byWhoOf([{ actor: 'system' }, { actor: 'S1' }, { actor: 'p_1' }], 'p_1'), { you: 1, people: 0, agents: 1, rules: 0, record: 1 });
});

test('A NIGHT WITH NOTHING TO UPDATE WRITES NO LINE, and keeps no pass', async () => {
  const now = { at: Date.UTC(2026, 9, 6, 3) };
  const { api, sql } = await record(now);
  api.kernel.setPref('slash', 'slash.daily', false);
  await api.slashTick();
  const kept = () => (api.kernel.prefsOf('braindog:updates')['first-party'] as { passes?: unknown[] } | undefined)?.passes?.length;
  const top = api.kernel.newestEvent();
  const lines = (await history(api, { limit: 200 })).events.length;
  assert.equal(kept(), 1);
  /* THE NEXT NIGHT, everything already current. */
  now.at += 86_400_000;
  await api.slashTick();
  const written = sql.all<{ kind: string }>('SELECT kind FROM event WHERE rowid > ?', top).filter((e) => e.kind !== 'pref');
  assert.deepEqual(written, []);
  assert.equal(kept(), 1);
  const page = await history(api, { limit: 200 });
  assert.equal(page.events.length, lines);
  assert.equal(passes(page.events).length, 1);
  sql.close();
});

test('WHO YOU ARE, FOUND ON THE SAME NIGHT, IS SAID ON ITS OWN: never as an update, nor under one', async () => {
  const people = {
    id: 'register.people',
    kind: 'register',
    body: { id: 'people', name: 'People', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'keys', type: 'list', of: 'text' }, { id: 'self', type: 'bool' }] },
  } as never;
  for (const behind of [false, true]) {
    const now = { at: Date.UTC(2026, 9, 6, 3) };
    const sql = openSqlite();
    const api = await createRecordApi({ sql, clock: { now: () => now.at } as never });
    assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'mara@example.com', name: 'Mara Lindqvist' } }).ok);
    if (behind) await putOld(api, 'work');
    value(await api.kernel.install([people]));
    const mara = value<{ id: string }>(api.kernel.create('people', { name: 'Mara', keys: ['email:mara@example.com'] } as never, { actor: 'p_1' }));
    api.kernel.setPref('slash', 'slash.daily', false);
    const top = api.kernel.newestEvent();
    await api.slashTick();
    assert.equal(api.kernel.get(mara.id)?.fields.self, true, 'the tick marked nobody');
    const marked = sql.all<{ id: string }>("SELECT id FROM event WHERE rowid > ? AND actor = 'system' AND target = ?", top, `entry:${mara.id}`).map((e) => e.id);
    assert.ok(marked.length > 0);
    const page = await history(api, { limit: 200 });
    const said = passes(page.events);
    assert.equal(said.length, behind ? 1 : 0, said.map((l) => l.note).join(' / '));
    for (const st of said.flatMap((l) => l.steps ?? [])) assert.ok(!marked.includes(st.id), 'the mark is folded under the update');
    sql.close();
  }
});

test("A PERSON'S EDIT BETWEEN TWO STEPS OF A PASS LEAVES IT ONE LINE, with the edit said after it and never folded", () => {
  const pass: UpdatePass = { from: 10, to: 16, at: '2026-10-09T03:00:00Z', updated: ['Money', 'People'], asked: [] };
  const line = (rowid: number, actor: string) =>
    ({ rowid, actor, kind: 'install', target: null, target_kind: null, field: null, register: null, seq: null, title: null, note: null });
  const fold = passFolder<ReturnType<typeof line>>([pass]);
  const walked = [line(17, 'pat'), line(16, 'system'), line(15, 'system'), line(14, 'pat'), line(13, 'system'), line(12, 'system'), line(11, 'system'), line(9, 'pat')];
  const out = [...walked.flatMap((l) => fold.push(l)), ...fold.flush()];
  assert.deepEqual(
    out.map((l) => [l.rowid, l.kind]),
    [[17, 'install'], [16, 'update'], [14, 'install'], [9, 'install']],
  );
  const said = out[1] as ReturnType<typeof line> & { steps: { rowid: number }[]; pass: { steps: number } };
  assert.deepEqual(said.steps.map((s) => s.rowid), [16, 15, 13, 12, 11]);
  assert.equal(said.pass.steps, 5);
});
