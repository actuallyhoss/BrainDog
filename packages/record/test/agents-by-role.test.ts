/**
 * The agents' lists are found by the part they play, never by their ids (the record's half).
 *
 * THREE RECORDS, ONE ANSWER. The agents add-on under its own ids answers as it always has; the same lists under other
 * ids, each declaring its `role:`, answer the same; and a record that keeps none of them answers its empty answers, in
 * a sentence where the answer carries one, and never throws or refuses.
 *
 * THE KERNEL REFUSES `role:` ON A LIST TODAY (`REGISTER_KEYS` in `packages/kernel/src/declare.ts` has no such key, a
 * blocked line of this job). So the renamed record is installed under other ids with no key, and the role is put on the
 * parsed declarations the kernel already holds, which are the registers `listFor` is handed. Once `declare.ts` takes
 * the key, the same test reads it from the install.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AGENT_LIST_FALLBACK, AGENT_ROLES, agentLists, fadeDays, fadeOf, listFor, noListSaid } from '../src/agent-lists.ts';
import type { Entry } from '@braindog/kernel';

import { card, type CardAt } from '../src/card.ts';
import { createRecordApi, type Brief, type CallContext, type Context } from '../src/index.ts';
import { install, normalise, plan, type Installed } from '../../declare/src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { NOW as SEEDED, agentsPackDocument, declarations, installAgentsPack } from '../../seed/src/index.ts';
import { MACHINES, PROJECTS } from '../../../fixtures/names.ts';

const NOW = Date.UTC(2026, 9, 15, 9);

/* ── which list plays a part ──────────────────────────────────────────────────────────────────────────────────── */

const list = (id: string, more: Record<string, unknown> = {}) => ({ id, name: id, fields: [], ...more });

test('THE OLD IDS READ WHILE NO LIST DECLARES THE PART, and a list that declares it wins under any id', () => {
  const old = [list('learnings'), list('skills'), list('credentials'), list('tools'), list('tasks')];
  assert.deepEqual(agentLists(old), { skills: 'skills', tools: 'tools', learnings: 'learnings', 'keys-index': 'credentials' });
  const renamed = [list('lessons', { role: 'learnings' }), list('abilities', { role: 'skills' }), list('keyring', { role: 'keys-index' }), list('gear', { role: 'tools' })];
  assert.deepEqual(agentLists(renamed), { skills: 'abilities', tools: 'gear', learnings: 'lessons', 'keys-index': 'keyring' });
  /* A DECLARING LIST BEATS THE OLD ID, and the map the kernel holds reads as the list `context` sends. */
  const both = new Map([['skills', list('skills')], ['abilities', list('abilities', { role: 'skills' })]]);
  assert.equal(listFor('skills', both), 'abilities');
  assert.equal(listFor('tools', both), null);
});

test('A LIST UNDER AN OLD ID THAT DECLARES ANOTHER PART PLAYS THAT PART, and an unknown role is no role', () => {
  const lists = [list('skills', { role: 'tools' }), list('learnings', { role: 'lessons-of-old' })];
  assert.equal(listFor('skills', lists), null, 'it said it keeps the tools');
  assert.equal(listFor('tools', lists), 'skills');
  assert.equal(listFor('learnings', lists), 'learnings', 'a role nobody plays is read as no role, so the old id holds');
});

test('TWO LISTS CLAIMING ONE PART: the older is read, and it is said once in a log line, by name', () => {
  const lines: string[] = [];
  const warn = console.warn;
  console.warn = (line: string) => lines.push(line);
  try {
    const lists = [list('crafts', { name: 'Crafts', role: 'skills' }), list('recipes', { name: 'Recipes', role: 'skills' })];
    assert.equal(listFor('skills', lists), 'crafts');
    assert.equal(listFor('skills', lists), 'crafts');
  } finally {
    console.warn = warn;
  }
  assert.deepEqual(lines, ["2 lists say they keep the record's skills: Crafts and Recipes. The first, Crafts, is read."]);
});

test('THE FADE: a declared rule, else the old day field for ninety days, else none', () => {
  assert.deepEqual(fadeOf(list('lessons', { fade: { field: 'checked_on', after: '30d' } })), { field: 'checked_on', after: '30d' });
  assert.deepEqual(fadeOf(list('learnings', { fields: [{ id: 'confirmed_on', type: 'day' }] })), { field: 'confirmed_on', after: '90d' });
  assert.equal(fadeOf(list('learnings', { fields: [{ id: 'confirmed_on', type: 'day', retired: true }] })), null);
  assert.equal(fadeOf(list('lessons', { fade: { field: 'checked_on', after: 'soon' } })), null, 'an after that is no number of days is no rule');
  assert.equal(fadeOf(list('tasks')), null);
  assert.equal(fadeDays('90d'), 90);
  assert.equal(fadeDays('0d'), null);
});

test('A SENTENCE FOR EACH PART A RECORD KEEPS NONE OF: plain, named, no id and no em dash', () => {
  assert.deepEqual(AGENT_ROLES.map(noListSaid), [
    'This BrainDog keeps no skills.',
    'This BrainDog keeps no tools.',
    'This BrainDog keeps no learnings.',
    'This BrainDog keeps no keys by name.',
    'This BrainDog keeps no profiles.',
    'This BrainDog keeps nothing to carry between machines.',
  ]);
  for (const role of AGENT_ROLES) assert.ok(!noListSaid(role).includes('—') && !noListSaid(role).includes(AGENT_LIST_FALLBACK['keys-index']!));
});

test('THE TWO PERSONAL PARTS: played only by a list that declares them, never by an old id', () => {
  assert.equal(listFor('profiles', [list('profiles'), list('carry')]), null, 'a list under the part\'s name plays nothing until it says so');
  assert.deepEqual(agentLists([list('setups', { role: 'profiles' }), list('bags', { role: 'carry' })]), { profiles: 'setups', carry: 'bags' });
});

/* ── the card ─────────────────────────────────────────────────────────────────────────────────────────────────── */

const row = (spoken: string, fields: Record<string, unknown>): Brief => ({ spoken, version: 1, scope: 'project', state: null, ...fields });
const reg = (id: string, rows: Brief[], role?: string): Context['registers'][number] =>
  ({ id, name: id, rows, inherited: [], truncated: false, ...(role === undefined ? {} : { role }) }) as Context['registers'][number];
const ctx = (registers: Context['registers']): Context =>
  ({ session: { spoken: 'S6', state: 'active' }, project: null, ambiguous: [], handoff: null, live: { same_repo: [], elsewhere: [] }, waiting: [], registers, people: [], self: null, organisations: [], faded: 0, signs: [], next: 'Call context.' }) as Context;
const at: CardAt = { agent: 'claude' } as CardAt;

/** The agents' lists with the card's lines in them, under the ids `ids` gives, each declaring its part when `roles`. */
const agentsIn = (ids: Record<'learnings' | 'skills' | 'keys' | 'tools', string>, roles: boolean, topic?: string): Context['registers'] => [
  reg(ids.learnings, [
    row('LN1', { lesson: `Tag the ${PROJECTS[0]} release before the deploy starts.`, ...(topic ? { topic } : {}), kind: 'method' }),
    row('LN2', { lesson: 'Proofs are read on paper, never on screen.' }),
    row('LN3', { lesson: 'The nightly import skips a file it read before.' }),
    row('LN4', { lesson: 'A second run in one tree overwrites the first.' }),
  ], roles ? 'learnings' : undefined),
  reg(ids.skills, [row('SK1', { name: 'deploy', because: [], agent: 'claude' })], roles ? 'skills' : undefined),
  reg(ids.keys, [row('KY1', { label: 'Deploy key', agent: 'claude' }), row('KY2', { label: 'Mail key' })], roles ? 'keys-index' : undefined),
  reg(ids.tools, [row('TL1', { name: 'linter' })], roles ? 'tools' : undefined),
  reg('tasks', [row('tasks#1', { title: 'Sign off the mastering pass.', agent: 'claude' })]),
];
const OLD = { learnings: 'learnings', skills: 'skills', keys: 'credentials', tools: 'tools' };
const NEW = { learnings: 'lessons', skills: 'abilities', keys: 'keyring', tools: 'gear' };

/** The card as it read before this job, on the add-on's own ids: More by count, and with a lesson on a skill's topic. */
const BEFORE_MORE = 'More     call context for the full picture';
const BEFORE_BEARING = BEFORE_MORE;
const BEFORE_NEXT = 'Next     Sign off the mastering pass. (handed to you)';

test('THE CARD ON THE OLD IDS READS AS BEFORE, and the same lists under other ids with their roles read the same', () => {
  const before = card(ctx(agentsIn(OLD, false)), at, NOW).card;
  const lines = before.split('\n');
  assert.ok(lines.includes(BEFORE_MORE) && lines.includes(BEFORE_NEXT), before);
  /* The first lesson in the record's order leads Learned, not the shortest (the shortest is LN2's). */
  assert.ok(before.includes(`Learned  Tag the ${PROJECTS[0]} release before the deploy starts.`), before);
  assert.ok(!/Deploy key|SK1|KY1/u.test(before), 'a key and a skill handed to the agent are not work it is handed');
  assert.equal(card(ctx(agentsIn(NEW, true)), at, NOW).card, before, 'by role, under other ids');
  assert.equal(card(ctx(agentsIn(OLD, true)), at, NOW).card, before, 'the old ids declaring their roles');
  /* A LESSON ON A SKILL'S TOPIC reads the two lists together, and finds both by role. */
  const bearing = card(ctx(agentsIn(OLD, false, 'deploy')), at, NOW).card;
  assert.ok(bearing.split('\n').includes(BEFORE_BEARING), bearing);
  assert.equal(card(ctx(agentsIn(NEW, true, 'deploy')), at, NOW).card, bearing);
});

test('A CARD ON A RECORD WITH NO AGENTS LISTS leaves their lines out and never throws', () => {
  const lone = card(ctx([reg('tasks', [row('tasks#1', { title: 'Sign off the mastering pass.' })])]), at, NOW).card;
  assert.ok(!/Learned|learning|keys by name|skill/u.test(lone), lone);
  assert.match(lone, /More +call context/u);
  /* UNDER OTHER IDS WITH NO ROLE, the lists are nobody's: they are not the agents' and are read as any list is. */
  const unclaimed = card(ctx(agentsIn(NEW, false)), at, NOW).card;
  assert.ok(!/keys by name|1 skill/u.test(unclaimed), unclaimed);
});

/* ── through the real record ──────────────────────────────────────────────────────────────────────────────────── */

type Api = Awaited<ReturnType<typeof createRecordApi>>;
type Lists = { learnings: string; skills: string; tools: string };

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };
/** A run on one machine in no project, which writes down what the machine holds. */
const run: CallContext = {
  principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_1', level: 'owner' },
  session: { client_id: 'c-loose', client: 'claude-code', host: MACHINES[0], repo: 'scratch-folder' },
};

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/** The agents add-on's document with every list id it spells, bare or as `register.<id>`, under the id `to` gives. */
function respelled(doc: unknown, to: Record<string, string>): unknown {
  if (typeof doc === 'string') {
    if (Object.hasOwn(to, doc)) return to[doc];
    const m = /^register\.(.+)$/u.exec(doc);
    return m && Object.hasOwn(to, m[1]!) ? `register.${to[m[1]!]}` : doc;
  }
  if (Array.isArray(doc)) return doc.map((x) => respelled(x, to));
  /* A LIST'S `role:` IS THE PART IT PLAYS, never a list id, so it is kept as written. */
  if (doc && typeof doc === 'object') return Object.fromEntries(Object.entries(doc).map(([k, v]) => [k, k === 'role' ? v : respelled(v, to)]));
  return doc;
}

/** The agents add-on installed through the pack path as `installAgentsPack` does, its lists under the ids `to` gives. */
async function installRenamed(kernel: Api['kernel'], to: Record<string, string>): Promise<void> {
  const pack = await normalise(respelled(agentsPackDocument(), to) as Record<string, unknown>, { kind: 'local' });
  assert.ok(pack.ok, pack.ok || !('refusal' in pack) ? '' : pack.refusal.fix);
  const state: Installed = {
    format: 1, primitives: 1, record_version: kernel.version(), packs: kernel.packs(),
    declarations: kernel.declarations() as Installed['declarations'], rows: kernel.census(),
  };
  const diff = await plan(pack.value, state);
  value(await install(pack.value, diff, {
    count: (register) => kernel.count(register),
    stage: (batch) => kernel.stageInstall(batch as never),
    transaction: (fn) => kernel.transaction(fn),
    reload: () => kernel.reload(),
    retire: (ids, by) => kernel.retire(ids, by ?? { actor: 'p_seed' }),
    seed: (register, fields) => kernel.create(register, { ...fields, tags: ['example'] }, { actor: 'p_seed', cascade: false } as never) as never,
    remember: (row) => kernel.rememberPack(row),
    forget: (id) => kernel.forgetPack(id),
    claimed: (id) => kernel.packClaims(id),
  }, diff.planHash));
}

/**
 * A record in three shapes: the add-on as it ships (`old`), the same lists under other ids that declare their roles
 * (`renamed`), and a record that never installed it (`none`). Each holds the seed's own lists and none of its rows
 * (`installSeed` installs the add-on with them), then one skill and one lesson that bears on it, so the three are
 * compared on what this file wrote.
 */
async function record(shape: 'old' | 'renamed' | 'none'): Promise<{ api: Api; lists: Lists }> {
  const sql = openSqlite();
  const clock = fixedClock(SEEDED);
  const api = await createRecordApi({ sql, clock });
  value(await api.kernel.install(declarations()));
  const lists: Lists = shape === 'renamed' ? { learnings: 'lessons', skills: 'abilities', tools: 'gear' } : { learnings: 'learnings', skills: 'skills', tools: 'tools' };
  if (shape === 'old') value(await installAgentsPack(api.kernel));
  if (shape === 'renamed') {
    await installRenamed(api.kernel, { learnings: 'lessons', skills: 'abilities', credentials: 'keyring', tools: 'gear' });
    /* THE ROLE ON THE DECLARATION THE KERNEL HOLDS, as `declare.ts` will write it once it takes the key (see the head). */
    for (const [id, role] of [['lessons', 'learnings'], ['abilities', 'skills'], ['keyring', 'keys-index'], ['gear', 'tools']] as const)
      Object.assign(api.kernel.register(id)!, { role });
  }
  clock.set(SEEDED + 30 * 86_400_000);
  if (shape === 'none') return { api, lists };
  value(await api.create({ register: lists.learnings, fields: { lesson: `Tag the ${PROJECTS[1]} release before the deploy starts.`, because: 'A deploy once went out untagged and nobody could say what shipped.', kind: 'method', topic: 'deploy' } }, owner));
  value(await api.create({ register: lists.skills, fields: { name: 'deploy', trigger: 'When a release goes out.', kind: 'skill', body: '# deploy\n\nThe steps.\n', because: [] } }, owner));
  return { api, lists };
}

type Served = {
  skillsBehind: (args: unknown, ctx: CallContext) => Promise<unknown>;
  offered: (ctx: CallContext) => Promise<unknown>;
  toolsSeen: (args: unknown, ctx: CallContext) => Promise<unknown>;
};
const served = (api: Api): Served => api as unknown as Served;
const linter = { name: 'linter', kind: 'cli', scope: 'global', command: 'npx', args: ['-y', '@pellucid/linter'], needs: [], source: 'the user config of Claude Code' };

/** The three reads as one answer, each as the record serves it. */
async function answers(api: Api) {
  const behind = value(await served(api).skillsBehind({}, owner));
  const skills = value<{ skills: unknown[] }>(await served(api).offered(owner)).skills;
  const tools = value(await served(api).toolsSeen({ machine: MACHINES[0], found: [linter] }, run));
  return { behind, skills, tools };
}

test('THE ADD-ON AS IT SHIPS ANSWERS AS BEFORE, and the same lists under other ids with their roles answer the same', async () => {
  const old = await record('old');
  assert.deepEqual(agentLists(old.api.kernel.registers()), { skills: 'skills', tools: 'tools', learnings: 'learnings', 'keys-index': 'credentials' });
  const before = await answers(old.api);
  const behind = before.behind as { skills: { name: string; behind: { lesson: string }[]; count: number }[]; total: number };
  assert.equal(behind.total, 1);
  assert.deepEqual(behind.skills.map((s) => [s.name, s.count, s.behind.map((l) => l.lesson)]), [['deploy', 1, ['Tag the Copperleaf release before the deploy starts.']]]);
  assert.deepEqual(before.skills, [{ name: 'deploy', when: 'When a release goes out.' }]);
  const tools = before.tools as { tools: { name: string; did: string; row?: string }[] };
  assert.deepEqual(tools.tools.map((t) => [t.name, t.did]), [['linter', 'added']]);

  const renamed = await record('renamed');
  assert.deepEqual(agentLists(renamed.api.kernel.registers()), { skills: 'abilities', tools: 'gear', learnings: 'lessons', 'keys-index': 'keyring' });
  assert.ok(!renamed.api.kernel.register('skills') && !renamed.api.kernel.register('tools'), 'no list keeps an old id');
  /* A ROW'S HANDLE IS ITS OWN LIST'S (`abilities#1`), which is the one difference a rename makes, and it is the right one. */
  const handles = (said: unknown): unknown => JSON.parse(JSON.stringify(said).replace(/\babilities#/gu, 'skills#').replace(/\bgear#/gu, 'tools#'));
  assert.deepEqual(handles(await answers(renamed.api)), before, 'the same answers, word for word, read by role');
  const kept = value<{ rows: Entry[] }>(await renamed.api.list({ register: 'gear', limit: 10 }, owner)).rows;
  assert.ok(kept.some((t) => t.fields.name === 'linter'), 'the tool was written down in the list that keeps the tools');
});

test('A RECORD THAT KEEPS NO AGENTS LISTS answers its empty answers, the tools in one sentence each, and never refuses', async () => {
  const none = await record('none');
  assert.deepEqual(agentLists(none.api.kernel.registers()), {});
  const got = await answers(none.api);
  assert.deepEqual(got.behind, { skills: [], total: 0 });
  assert.deepEqual(got.skills, []);
  assert.deepEqual(got.tools, { tools: [{ name: 'linter', did: 'skipped', why: 'This BrainDog keeps no tools.' }] });
  /* AND A CARD DRAWN FROM THIS RECORD'S OWN CONTEXT says nothing of skills, lessons or keys, and the session goes on. */
  const drawn = card(value<Context>(await (none.api as unknown as { context: (a: unknown, c: CallContext) => Promise<unknown> }).context({}, run)), {}, NOW).card;
  assert.ok(!/learning|keys by name|skill/u.test(drawn), drawn);
});
