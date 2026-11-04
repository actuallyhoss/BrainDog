/**
 * A source a page names that is not a list is registered in `src/sources/index.ts`, one module a name, and every
 * registered name answers exactly as it did when it was an arm of `pages.ts`.
 *
 * THE REGISTRY IS IMPORTED BEFORE THE KERNEL, on purpose. A source module is a leaf at run time (`sources/index.ts`
 * says why), so this order loads: a module that reached back into `pages.ts` would stop this file loading at all.
 *
 * THE SNAPSHOT AT THE FOOT OF THIS FILE WAS TAKEN BEFORE ANY SOURCE MOVED, from the record `seeded` builds, read
 * through the record's own wiring (`k.block`). Each test reads the same block again and holds the bytes equal, so a
 * module that answers differently fails here by itself. To take it again after a change that is meant to change an
 * answer: `SOURCES_SNAPSHOT=print node --test test/sources-registry.test.ts`, and paste the lines it prints.
 *
 * TAKEN AGAIN FOR `activity` ALONE IN BATCH 64 (run-by-64): each line a run signed now says who the run is (`run_by`),
 * since the record hands a feed its runs (`runOf`). The line differs from the one before by those keys and nothing else.
 *
 * TAKEN AGAIN IN W102 (usage-sources-102): `actions` and `runs_on` carry the month's five counts, an action's
 * `requests`, `bytes` and `held` beside its `runs` and `failures`, and a key, a tool or a skill on `runs_on` `null` in
 * all five; `actions again` lists the new fields as allowed. The three `usage.*` answers are new. Nothing else moved.
 *
 * `kpis` ADDED IN K2-A (the key numbers, 21 October): a record with no list of key numbers answers none and says
 * nothing. Nothing else moved.
 *
 * `scripts` ADDED IN C33 (24 October), the rows `/scripts` draws: a record with no script installed answers none.
 * Nothing else moved.
 *
 * `scripts` TAKEN AGAIN: it answers each field's type, as every other computed source does, so a script's last run is
 * drawn as how long ago. Nothing else moved.
 *
 * `governance.apart` ADDED with agents' shelf beside Needs you: the seeded record's one question is a call between
 * options, which stays in Needs you, so the shelf answers none. Nothing else moved.
 *
 * `figures.home`, `signs` AND `scripts` TAKEN AGAIN (tests pass, 4 November), each for a change that said so:
 * `figures.home` says each figure a block names (9e03fe8e7), `signs` titles the never-filed line by its count and names
 * them in its sentence (3a04e7020), and `scripts` answers the time of day a script runs at (1b70247cd). Nothing else moved.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

import { SOURCE_MODULES, sourceModule } from '../src/sources/index.ts';
import { openRecord, type Declaration, type Kernel, type WriteContext } from '../src/index.ts';
import { ACTIONS_BLOCKING, registersOfBlock, WHOLE_RECORD, type PageBlock } from '../src/pages.ts';
import { HANDOFFS_OPEN } from '../src/built-in-figures.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 15, 12);
const OWNER = { actor: 'p_1' };

const list = (id: string, name: string, title: string, fields: Record<string, unknown>[], more: Record<string, unknown> = {}): Declaration => ({
  id: `register.${id}`,
  kind: 'register',
  body: { id, name, title, fields, ...more } as never,
});

const SEED: Declaration[] = [
  list('things', 'Projects', 'name', [{ id: 'name', type: 'text', required: true }, { id: 'repos', type: 'list', of: 'text' }], { scopes: { repos: 'repos' } }),
  list('tasks', 'Tasks', 'what', [
    { id: 'what', type: 'text', required: true },
    { id: 'due', type: 'day', deadline: true },
    { id: 'project', type: 'ref', to: 'things', scope: { widen: 'person' } },
  ]),
  list('bills', 'Bills', 'what', [
    { id: 'what', type: 'text', required: true },
    { id: 'amount', type: 'money', required: true },
    { id: 'due', type: 'day', required: true, deadline: true },
  ]),
  list('accounts', 'Accounts', 'name', [{ id: 'name', type: 'text', required: true }, { id: 'balance', type: 'money', required: true }]),
  list('credentials', 'Keys', 'label', [{ id: 'label', type: 'text', required: true }, { id: 'project', type: 'ref', to: 'things', scope: { widen: 'person' } }]),
  list('notes', 'Notes', 'what', [{ id: 'what', type: 'text' }]),
  { id: 'metric.cash-now', kind: 'metric', body: { metric: 'cash-now', name: 'Cash', source: 'register.accounts', value: { sum: 'balance' }, format: 'money', target: { gte: 0 }, window: '7d', compare: 'none', home: 1 } as never },
  { id: 'metric.tasks-open', kind: 'metric', body: { metric: 'tasks-open', name: 'Open tasks', source: 'register.tasks', value: { count: 'id' }, format: 'int', target: { lte: 5 }, window: '7d', compare: 'none', home: 2 } as never },
  {
    id: 'ingest.balance',
    kind: 'ingest',
    body: { ingest: 'balance', channel: 'poll', url: 'https://api.example.test/v1/balance', every: '1h', grant: 'example read', extract: { what: { after: 'balance ' } }, writes: { register: 'notes' } } as never,
  },
];

const as = (client_id: string, repo: string): WriteContext => ({
  actor: 'agent:claude',
  principal: { kind: 'token', token: 't_1' },
  session: { client_id, agent: 'claude', client: 'claude-code', repo },
});

const must = (r: { ok: boolean }, what: string): void => assert.ok(r.ok, `${what}: ${JSON.stringify(r)}`);

/** The record every name below is read from: two projects, work falling due, money, a key, a question, runs and a step left. */
async function seeded(): Promise<{ k: Kernel; close: () => void }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  must(await k.install(SEED), 'install');
  must(k.create('things', { name: 'Kiln', repos: ['kiln'] }, OWNER), 'Kiln');
  must(k.create('things', { name: 'Portage', repos: ['portage'] }, OWNER), 'Portage');
  must(k.create('tasks', { what: 'Fire the bowls', due: '2026-09-18', project: 'things#1' }, OWNER), 'task');
  must(k.create('tasks', { what: 'Order clay', due: '2026-09-10' }, OWNER), 'late task');
  must(k.create('tasks', { what: 'Renew the domain', due: '2027-03-01' }, OWNER), 'far task');
  must(k.create('bills', { what: 'Rent', amount: { amount: 2_000_000, currency: 'EGP' }, due: '2026-09-25' }, OWNER), 'rent');
  must(k.create('bills', { what: 'Glaze', amount: { amount: 350_000, currency: 'EGP' }, due: '2026-09-20' }, OWNER), 'glaze');
  must(k.create('accounts', { name: 'Bank', balance: { amount: 9_000_000, currency: 'EGP' } }, OWNER), 'bank');
  must(k.create('credentials', { label: 'Kiln deploy key', project: 'things#1' }, OWNER), 'key');
  must(k.propose({ question: 'Fire on Friday?', body_kind: 'options', body: { options: [{ id: 'yes', label: 'Yes', because: 'The bowls are dry.' }, { id: 'no', label: 'No', because: 'The kiln is booked.' }], about: 'things#1' } }, 'slash'), 'question');
  /* ONE RUN STILL WORKING AND ONE THAT LEFT A STEP AND CLOSED. */
  must(k.create('tasks', { what: 'Glaze the lids', project: 'things#1' }, as('c1', 'kiln')), 'a run writes');
  must(k.create('tasks', { what: 'Pack the crate' }, as('c2', 'portage')), 'another run writes');
  const left = k.findRun({ client_id: 'c2' }, 't_1')!;
  must(k.update('session', `S${String(left.seq)}`, { next: 'Book the courier' }, as('c2', 'portage')), 'a step left');
  must(k.endRun(as('c2', 'portage'), {}), 'the run closes');
  return { k, close: () => sql.close() };
}

/** One block a name, each asking for what the source answers by itself: no `where:`, the columns it draws unasked. */
const BLOCKS: Record<string, PageBlock> = {
  activity: { kind: 'feed', source: 'activity' },
  'sessions.live': { kind: 'table', source: 'sessions.live' },
  'sessions.working': { kind: 'table', source: 'sessions.working' },
  actions: { kind: 'table', source: 'actions' },
  [ACTIONS_BLOCKING]: { kind: 'table', source: ACTIONS_BLOCKING, about: 'things#1' },
  'governance.open': { kind: 'queue', source: 'governance.open' },
  'governance.later': { kind: 'queue', source: 'governance.later' },
  'governance.apart': { kind: 'queue', source: 'governance.apart' },
  'governance.decided': { kind: 'table', source: 'governance.decided' },
  runs_on: { kind: 'table', source: 'runs_on', about: 'things#1' },
  deadlines: { kind: 'table', source: 'deadlines', horizon: 30 },
  'figures.home': { kind: 'stat', source: 'figures.home' },
  'forecast.runway': { kind: 'forecast', source: 'forecast.runway', opening: { metric: 'cash-now' }, from: [{ register: 'bills', on: 'due', amount: 'amount' }], horizon: 30 },
  [HANDOFFS_OPEN]: { kind: 'table', source: HANDOFFS_OPEN },
  signs: { kind: 'table', source: 'signs' },
  exceptions: { kind: 'table', source: 'exceptions' },
  'usage.days': { kind: 'series', source: 'usage.days' },
  'usage.actions': { kind: 'table', source: 'usage.actions' },
  'usage.projects': { kind: 'table', source: 'usage.projects' },
  kpis: { kind: 'kpis', source: 'kpis', for: 'today' },
  scripts: { kind: 'table', source: 'scripts' },
} as Record<string, PageBlock>;

/** A second block for the names with more than one way to answer: a refusal's own sentence, or a `where:` that narrows. */
const AGAIN: Record<string, PageBlock> = {
  activity: { kind: 'feed', source: 'activity', where: 'nothing is here' },
  actions: { kind: 'table', source: 'actions', columns: [{ field: 'secret' }] },
  'governance.open': { kind: 'queue', source: 'governance.open', where: 'about is things#1', limit: 1 },
  runs_on: { kind: 'table', source: 'runs_on' },
  deadlines: { kind: 'table', source: 'deadlines', where: 'list is tasks', horizon: 400 },
  'figures.home': { kind: 'table', source: 'figures.home' },
  'forecast.runway': { kind: 'forecast', source: 'forecast.runway' },
  signs: { kind: 'table', source: 'signs', where: 'state is red' },
} as Record<string, PageBlock>;

/**
 * An answer as the snapshot keeps it: its JSON, with each row id written as the order it first appears in. A row's id
 * is made new on every run, and is the one part of an answer that is not the same twice over the same record.
 */
function kept(answer: unknown): string {
  const seen = new Map<string, string>();
  return JSON.stringify(answer).replace(/\b[0-9A-HJKMNP-TV-Z]{26}\b/gu, (id) => seen.get(id) ?? (seen.set(id, `<id ${String(seen.size + 1)}>`), seen.get(id)!));
}

/** Every answer the snapshot holds, by the name it is kept under: the source, and `<source> again` for its second block. */
function answers(k: Kernel): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, block] of Object.entries(BLOCKS)) out[name] = kept(k.block(block));
  for (const [name, block] of Object.entries(AGAIN)) out[`${name} again`] = kept(k.block(block));
  return out;
}

if (process.env.SOURCES_SNAPSHOT === 'print') {
  const { k, close } = await seeded();
  for (const [name, answer] of Object.entries(answers(k))) console.log(`  ${JSON.stringify(name)}: ${JSON.stringify(answer)},`);
  close();
}

/** The names a block may say that are not a list, written out: a name added to the registry is added here and below. */
const NAMES = Object.keys(BLOCKS).sort();

test('EVERY SOURCE HAS A MODULE, and a word that is no source has none', () => {
  assert.deepEqual(Object.keys(SOURCE_MODULES).sort(), NAMES);
  for (const name of NAMES) assert.equal(typeof sourceModule(name)?.read, 'function', name);
  assert.ok(sourceModule(HANDOFFS_OPEN), 'the name the built-in figure holds is the name registered');
  assert.ok(sourceModule(ACTIONS_BLOCKING));
  for (const word of ['constructor', 'toString', '__proto__', 'register.tasks', 'metric.cash-now', '', undefined]) assert.equal(sourceModule(word), undefined, String(word));
});

test('EACH NAME ANSWERS AS IT DID BEFORE IT MOVED, byte for byte', async (t) => {
  const { k, close } = await seeded();
  const now = answers(k);
  const then = snapshot();
  assert.deepEqual(Object.keys(now).sort(), Object.keys(then).sort(), 'the snapshot holds an answer for every block read here, and no other');
  for (const name of Object.keys(then)) await t.test(name, () => assert.equal(now[name], then[name]));
  close();
});

test('A MODULE THAT ANSWERS DIFFERENTLY FAILS THAT COMPARISON BY ITSELF, and no other name with it', async () => {
  const { k, close } = await seeded();
  const real = SOURCE_MODULES.signs!;
  SOURCE_MODULES.signs = { ...real, read: (...asked) => ({ ...real.read(...asked), matched: -1 }) };
  try {
    const now = answers(k);
    const then = snapshot();
    assert.deepEqual(Object.keys(then).filter((name) => now[name] !== then[name]), ['signs', 'signs again']);
  } finally {
    SOURCE_MODULES.signs = real;
    close();
  }
});

test('THE REGISTRY IS REACHED WITH NO FLAG: a source registered is read, and a word nobody registered is refused as it was', async () => {
  const { k, close } = await seeded();
  SOURCE_MODULES.weather = { read: (_deps, _block, base) => ({ ...base, matched: 7 }) };
  try {
    const read = k.block({ kind: 'table', source: 'weather' } as PageBlock);
    assert.deepEqual([read.matched, read.refusals], [7, []]);
  } finally {
    delete SOURCE_MODULES.weather;
  }
  assert.deepEqual(k.block({ kind: 'table', source: 'weather' } as PageBlock).refusals.map((r) => r.code), ['SOURCE_UNKNOWN']);
  close();
});

/** The names that belong to no list, written out as the set they were in `pages.ts`. */
const WHOLE = ['actions', ACTIONS_BLOCKING, 'activity', 'exceptions', 'governance.apart', 'governance.decided', 'governance.later', 'governance.open', 'kpis', 'scripts', 'signs', 'usage.actions', 'usage.days', 'usage.projects'];

test('A SOURCE THAT BELONGS TO NO LIST SAYS SO, and a block over it is named as a read of the whole record', () => {
  assert.deepEqual(NAMES.filter((name) => sourceModule(name)?.whole === true), [...WHOLE].sort());
  for (const name of WHOLE) assert.deepEqual(registersOfBlock({ kind: 'table', source: name } as PageBlock, () => null), [WHOLE_RECORD], name);
  assert.deepEqual(NAMES.filter((name) => sourceModule(name)?.first === true), ['deadlines', 'figures.home', 'usage.days']);
});

test('A SOURCE MODULE IS A LEAF AT RUN TIME: it imports a package outside the kernel or a file beside it, and types from anywhere', () => {
  const folder = new URL('../src/sources/', import.meta.url);
  for (const file of readdirSync(folder).filter((f) => f.endsWith('.ts'))) {
    const text = readFileSync(new URL(file, folder), 'utf8');
    for (const [, typed, from] of text.matchAll(/^import\s+(type\s+)?[^;]*?from\s+'([^']+)';/gmu))
      if (typed === undefined) assert.ok(from!.startsWith('@braindog/') || from!.startsWith('./'), `${file} imports ${from} at run time`);
  }
});

/**
 * Every answer as it was before any source moved out of `pages.ts`, by the name `answers` keeps it under. One line an
 * answer, as `SOURCES_SNAPSHOT=print` prints them. A function, so the tests above read it though it is written below.
 */
function snapshot(): Record<string, string> {
  return {
    "activity": "{\"kind\":\"feed\",\"source\":\"activity\",\"rows\":[],\"matched\":15,\"refusals\":[],\"feed\":[{\"by\":\"agent\",\"who\":\"S2\",\"count\":1,\"kind\":\"state\",\"target\":\"session#2\",\"note\":\"Ended and left a next step.\",\"at\":\"2026-09-15T12:00:00.000Z\",\"thing\":\"Claude Code in Portage\",\"run_by\":{\"run\":\"S2\",\"agent\":\"claude\",\"client\":\"claude-code\",\"parent\":null},\"list\":\"session\"},{\"by\":\"agent\",\"who\":\"S2\",\"count\":1,\"kind\":\"create\",\"target\":\"session#2\",\"note\":\"opened: auto\",\"at\":\"2026-09-15T12:00:00.000Z\",\"thing\":\"Claude Code in Portage\",\"run_by\":{\"run\":\"S2\",\"agent\":\"claude\",\"client\":\"claude-code\",\"parent\":null},\"list\":\"session\"},{\"by\":\"agent\",\"who\":\"S2\",\"count\":1,\"kind\":\"create\",\"target\":\"tasks#5\",\"note\":null,\"at\":\"2026-09-15T12:00:00.000Z\",\"thing\":\"Pack the crate\",\"run_by\":{\"run\":\"S2\",\"agent\":\"claude\",\"client\":\"claude-code\",\"parent\":null},\"list\":\"tasks\"},{\"by\":\"agent\",\"who\":\"S1\",\"count\":1,\"kind\":\"create\",\"target\":\"tasks#4\",\"note\":null,\"at\":\"2026-09-15T12:00:00.000Z\",\"thing\":\"Glaze the lids\",\"run_by\":{\"run\":\"S1\",\"agent\":\"claude\",\"client\":\"claude-code\",\"parent\":null},\"list\":\"tasks\"},{\"by\":\"agent\",\"who\":\"S1\",\"count\":1,\"kind\":\"create\",\"target\":\"session#1\",\"note\":\"opened: auto\",\"at\":\"2026-09-15T12:00:00.000Z\",\"thing\":\"Claude Code in Kiln\",\"run_by\":{\"run\":\"S1\",\"agent\":\"claude\",\"client\":\"claude-code\",\"parent\":null},\"list\":\"session\"},{\"by\":\"agent\",\"who\":\"slash\",\"count\":1,\"kind\":\"suggest\",\"target\":\"suggestion:SG1\",\"note\":null,\"at\":\"2026-09-15T12:00:00.000Z\",\"thing\":\"Fire on Friday?\",\"list\":null},{\"by\":\"you\",\"who\":\"p_1\",\"count\":1,\"kind\":\"create\",\"target\":\"credentials#1\",\"note\":null,\"at\":\"2026-09-15T12:00:00.000Z\",\"thing\":\"Kiln deploy key\",\"list\":\"credentials\"},{\"by\":\"you\",\"who\":\"p_1\",\"count\":1,\"kind\":\"create\",\"target\":\"accounts#1\",\"note\":null,\"at\":\"2026-09-15T12:00:00.000Z\",\"thing\":\"Bank\",\"list\":\"accounts\"},{\"by\":\"you\",\"who\":\"p_1\",\"count\":1,\"kind\":\"create\",\"target\":\"bills#2\",\"note\":null,\"at\":\"2026-09-15T12:00:00.000Z\",\"thing\":\"Glaze\",\"list\":\"bills\"},{\"by\":\"you\",\"who\":\"p_1\",\"count\":1,\"kind\":\"create\",\"target\":\"bills#1\",\"note\":null,\"at\":\"2026-09-15T12:00:00.000Z\",\"thing\":\"Rent\",\"list\":\"bills\"},{\"by\":\"you\",\"who\":\"p_1\",\"count\":1,\"kind\":\"create\",\"target\":\"tasks#3\",\"note\":null,\"at\":\"2026-09-15T12:00:00.000Z\",\"thing\":\"Renew the domain\",\"list\":\"tasks\"},{\"by\":\"you\",\"who\":\"p_1\",\"count\":1,\"kind\":\"create\",\"target\":\"tasks#2\",\"note\":null,\"at\":\"2026-09-15T12:00:00.000Z\",\"thing\":\"Order clay\",\"list\":\"tasks\"},{\"by\":\"you\",\"who\":\"p_1\",\"count\":1,\"kind\":\"create\",\"target\":\"tasks#1\",\"note\":null,\"at\":\"2026-09-15T12:00:00.000Z\",\"thing\":\"Fire the bowls\",\"list\":\"tasks\"},{\"by\":\"you\",\"who\":\"p_1\",\"count\":1,\"kind\":\"create\",\"target\":\"things#2\",\"note\":null,\"at\":\"2026-09-15T12:00:00.000Z\",\"thing\":\"Portage\",\"list\":\"things\"},{\"by\":\"you\",\"who\":\"p_1\",\"count\":1,\"kind\":\"create\",\"target\":\"things#1\",\"note\":null,\"at\":\"2026-09-15T12:00:00.000Z\",\"thing\":\"Kiln\",\"list\":\"things\"}],\"key\":\"k1fzqnde\"}",
    "sessions.live": "{\"kind\":\"table\",\"source\":\"sessions.live\",\"rows\":[{\"id\":\"<id 1>\",\"register\":\"session\",\"seq\":1,\"fields\":{\"state\":\"active\",\"client_id\":\"c1\",\"agent\":\"claude\",\"client\":\"claude-code\",\"repo\":\"kiln\",\"doing\":\"Claude Code in Kiln\",\"last_seen\":\"2026-09-15T12:00:00.000Z\",\"token_id\":\"t_1\",\"project\":\"things#1\",\"wrote\":1,\"stretch_at\":\"2026-09-15T12:00:00.000Z\",\"started\":\"2026-09-15T12:00:00.000Z\"},\"state\":\"active\",\"version\":1,\"created_at\":\"2026-09-15T12:00:00.000Z\",\"updated_at\":\"2026-09-15T12:00:00.000Z\",\"deleted_at\":null},{\"id\":\"<id 2>\",\"register\":\"session\",\"seq\":2,\"fields\":{\"state\":\"handoff\",\"client_id\":\"c2\",\"agent\":\"claude\",\"client\":\"claude-code\",\"repo\":\"portage\",\"doing\":\"Claude Code in Portage\",\"last_seen\":\"2026-09-15T12:00:00.000Z\",\"token_id\":\"t_1\",\"project\":\"things#2\",\"wrote\":2,\"stretch_at\":\"2026-09-15T12:00:00.000Z\",\"started\":\"2026-09-15T12:00:00.000Z\",\"next\":\"Book the courier\",\"next_at\":\"2026-09-15T12:00:00.000Z\"},\"state\":\"handoff\",\"version\":3,\"created_at\":\"2026-09-15T12:00:00.000Z\",\"updated_at\":\"2026-09-15T12:00:00.000Z\",\"deleted_at\":null}],\"matched\":2,\"refusals\":[],\"scopes\":[\"Kiln\",\"Portage\"],\"scope_marks\":[{\"mark\":null,\"hue\":null},{\"mark\":null,\"hue\":null}],\"quiet\":[false,false],\"presence\":[\"working\",\"left\"],\"key\":\"k181fpi0\"}",
    "sessions.working": "{\"kind\":\"table\",\"source\":\"sessions.working\",\"rows\":[{\"id\":\"<id 1>\",\"register\":\"session\",\"seq\":1,\"fields\":{\"state\":\"active\",\"client_id\":\"c1\",\"agent\":\"claude\",\"client\":\"claude-code\",\"repo\":\"kiln\",\"doing\":\"Claude Code in Kiln\",\"last_seen\":\"2026-09-15T12:00:00.000Z\",\"token_id\":\"t_1\",\"project\":\"things#1\",\"wrote\":1,\"stretch_at\":\"2026-09-15T12:00:00.000Z\",\"started\":\"2026-09-15T12:00:00.000Z\"},\"state\":\"active\",\"version\":1,\"created_at\":\"2026-09-15T12:00:00.000Z\",\"updated_at\":\"2026-09-15T12:00:00.000Z\",\"deleted_at\":null}],\"matched\":1,\"refusals\":[],\"scopes\":[\"Kiln\"],\"scope_marks\":[{\"mark\":null,\"hue\":null}],\"helpers\":[0],\"key\":\"k1y2cre1\"}",
    "actions": "{\"kind\":\"table\",\"source\":\"actions\",\"rows\":[{\"id\":\"action:balance\",\"register\":\"actions\",\"seq\":null,\"fields\":{\"ingest\":\"balance\",\"channel\":\"poll\",\"project\":null,\"host\":\"api.example.test\",\"every\":\"1h\",\"key\":\"example read\",\"state\":\"pending\",\"next\":\"2026-09-15T12:00:00.000Z\",\"last_at\":null,\"last_outcome\":null,\"last_status\":null,\"last_note\":null,\"runs\":0,\"requests\":0,\"bytes\":0,\"failures\":0,\"held\":0},\"state\":\"pending\",\"version\":1,\"created_at\":\"\",\"updated_at\":\"\",\"deleted_at\":null}],\"matched\":1,\"refusals\":[],\"key\":\"k0kgb4d4\"}",
    "actions.blocking": "{\"kind\":\"table\",\"source\":\"actions.blocking\",\"about\":\"things#1\",\"rows\":[],\"matched\":0,\"refusals\":[],\"types\":{\"name\":\"text\",\"why\":\"enum\",\"since\":\"instant\",\"status\":\"int\",\"said\":\"text\"},\"key\":\"k124xath\"}",
    "governance.open": "{\"kind\":\"queue\",\"source\":\"governance.open\",\"rows\":[],\"matched\":1,\"refusals\":[],\"queue\":[{\"id\":\"SG1\",\"who\":\"slash\",\"at\":\"2026-09-15T12:00:00.000Z\",\"kind\":\"options\",\"question\":\"Fire on Friday?\",\"why\":\"\",\"cost\":\"call\",\"options\":[{\"key\":\"yes\",\"label\":\"Yes\",\"because\":\"The bowls are dry.\",\"recommended\":false},{\"key\":\"no\",\"label\":\"No\",\"because\":\"The kiln is booked.\",\"recommended\":false}],\"about\":\"things#1\",\"waits\":\"new\",\"kinds\":[\"call\"],\"list\":\"things\"}],\"waiting\":{\"stale\":0,\"hardToUndo\":0},\"key\":\"k0poi5qa\"}",
    "governance.later": "{\"kind\":\"queue\",\"source\":\"governance.later\",\"rows\":[],\"matched\":0,\"refusals\":[],\"queue\":[],\"key\":\"k0k0lp8a\"}",
    "governance.apart": "{\"kind\":\"queue\",\"source\":\"governance.apart\",\"rows\":[],\"matched\":0,\"refusals\":[],\"queue\":[],\"key\":\"k1qvt4ei\"}",
    "governance.decided": "{\"kind\":\"table\",\"source\":\"governance.decided\",\"rows\":[],\"matched\":0,\"refusals\":[],\"key\":\"k1h7gcp3\"}",
    "runs_on": "{\"kind\":\"table\",\"source\":\"runs_on\",\"about\":\"things#1\",\"rows\":[{\"id\":\"<id 1>\",\"register\":\"credentials\",\"seq\":1,\"fields\":{\"kind\":\"key\",\"name\":\"Kiln deploy key\",\"scope\":\"project\",\"state\":null,\"detail\":null,\"used_by\":null,\"used_agent\":null,\"used_at\":null,\"used_runs\":0,\"used_agents\":null,\"spoken\":\"credentials#1\",\"quiet\":null,\"runs\":null,\"requests\":null,\"bytes\":null,\"failures\":null,\"held\":null},\"state\":null,\"version\":1,\"created_at\":\"2026-09-15T12:00:00.000Z\",\"updated_at\":\"2026-09-15T12:00:00.000Z\",\"deleted_at\":null},{\"id\":\"action:balance\",\"register\":\"actions\",\"seq\":null,\"fields\":{\"kind\":\"action\",\"name\":\"balance\",\"scope\":\"global\",\"state\":\"pending\",\"detail\":\"2026-09-15T12:00:00.000Z\",\"used_by\":null,\"used_agent\":null,\"used_at\":null,\"used_runs\":0,\"used_agents\":null,\"spoken\":\"balance\",\"quiet\":\"global\",\"runs\":0,\"requests\":0,\"bytes\":0,\"failures\":0,\"held\":0},\"state\":\"pending\",\"version\":1,\"created_at\":\"\",\"updated_at\":\"\",\"deleted_at\":null}],\"matched\":2,\"refusals\":[],\"inherited\":1,\"types\":{\"kind\":\"enum\",\"name\":\"text\",\"scope\":\"enum\",\"state\":\"text\",\"detail\":\"text\",\"used_by\":\"run\",\"used_agent\":\"text\",\"used_at\":\"instant\",\"used_runs\":\"int\",\"used_agents\":\"text\",\"spoken\":\"text\",\"quiet\":\"text\",\"runs\":\"int\",\"requests\":\"int\",\"bytes\":\"int\",\"failures\":\"int\",\"held\":\"int\"},\"scopes\":[\"Kiln\",null],\"scope_marks\":[{\"mark\":null,\"hue\":null},null],\"key\":\"k0vc91av\"}",
    "deadlines": "{\"kind\":\"table\",\"source\":\"deadlines\",\"horizon\":30,\"rows\":[{\"id\":\"<id 1>:due\",\"register\":\"deadlines\",\"seq\":null,\"fields\":{\"list\":\"tasks\",\"row\":\"tasks#2\",\"title\":\"Order clay\",\"day\":\"2026-09-10\",\"amount\":null,\"direction\":null},\"state\":null,\"version\":1,\"created_at\":\"2026-09-15T12:00:00.000Z\",\"updated_at\":\"2026-09-15T12:00:00.000Z\",\"deleted_at\":null},{\"id\":\"<id 2>:due\",\"register\":\"deadlines\",\"seq\":null,\"fields\":{\"list\":\"tasks\",\"row\":\"tasks#1\",\"title\":\"Fire the bowls\",\"day\":\"2026-09-18\",\"amount\":null,\"direction\":null},\"state\":null,\"version\":1,\"created_at\":\"2026-09-15T12:00:00.000Z\",\"updated_at\":\"2026-09-15T12:00:00.000Z\",\"deleted_at\":null},{\"id\":\"<id 3>:due\",\"register\":\"deadlines\",\"seq\":null,\"fields\":{\"list\":\"bills\",\"row\":\"bills#2\",\"title\":\"Glaze\",\"day\":\"2026-09-20\",\"amount\":{\"amount\":350000,\"currency\":\"EGP\"},\"direction\":null},\"state\":null,\"version\":1,\"created_at\":\"2026-09-15T12:00:00.000Z\",\"updated_at\":\"2026-09-15T12:00:00.000Z\",\"deleted_at\":null},{\"id\":\"<id 4>:due\",\"register\":\"deadlines\",\"seq\":null,\"fields\":{\"list\":\"bills\",\"row\":\"bills#1\",\"title\":\"Rent\",\"day\":\"2026-09-25\",\"amount\":{\"amount\":2000000,\"currency\":\"EGP\"},\"direction\":null},\"state\":null,\"version\":1,\"created_at\":\"2026-09-15T12:00:00.000Z\",\"updated_at\":\"2026-09-15T12:00:00.000Z\",\"deleted_at\":null}],\"matched\":4,\"refusals\":[],\"key\":\"k00erjwi\"}",
    /* EACH READING SAYS THE FORMAT ITS FIGURE DECLARES, since a stat draws a declared percent or day as one. */
    "figures.home": "{\"kind\":\"stat\",\"source\":\"figures.home\",\"rows\":[],\"matched\":2,\"refusals\":[],\"readings\":[{\"metric\":\"cash-now\",\"label\":\"Cash\",\"target\":{\"gte\":0},\"format\":\"money\",\"reading\":{\"value\":9000000,\"unit\":\"EGP\",\"rows\":1,\"refusals\":[],\"backs\":[\"accounts#1\"],\"held\":1,\"delta\":null,\"why\":\"no comparison asked for\",\"met\":true}},{\"metric\":\"tasks-open\",\"label\":\"Open tasks\",\"target\":{\"lte\":5},\"format\":\"int\",\"reading\":{\"value\":5,\"unit\":null,\"rows\":5,\"refusals\":[],\"held\":5,\"delta\":null,\"why\":\"no comparison asked for\",\"met\":true}}],\"figures\":{\"cash-now\":{\"name\":\"Cash\",\"source\":\"register.accounts\",\"value\":{\"sum\":\"balance\"},\"format\":\"money\",\"target\":{\"gte\":0}},\"tasks-open\":{\"name\":\"Open tasks\",\"source\":\"register.tasks\",\"value\":{\"count\":\"id\"},\"format\":\"int\",\"target\":{\"lte\":5}}},\"key\":\"k0i0auot\"}",
    "forecast.runway": "{\"kind\":\"forecast\",\"source\":\"forecast.runway\",\"opening\":{\"metric\":\"cash-now\"},\"from\":[{\"register\":\"bills\",\"on\":\"due\",\"amount\":\"amount\"}],\"horizon\":30,\"rows\":[],\"matched\":2,\"refusals\":[],\"walk\":{\"from\":9000000,\"currency\":\"EGP\",\"mixed\":[],\"steps\":[{\"day\":\"2026-09-20\",\"label\":\"Glaze\",\"delta\":-350000,\"source\":\"bills\",\"spoken\":\"bills#2\",\"balance\":8650000},{\"day\":\"2026-09-25\",\"label\":\"Rent\",\"delta\":-2000000,\"source\":\"bills\",\"spoken\":\"bills#1\",\"balance\":6650000}],\"crossed\":null,\"days\":null,\"horizon\":30,\"refusals\":[]},\"key\":\"k19l5cl1\"}",
    "handoffs.open": "{\"kind\":\"table\",\"source\":\"handoffs.open\",\"rows\":[{\"id\":\"<id 1>\",\"register\":\"session\",\"seq\":null,\"fields\":{\"run\":\"S2\",\"agent\":\"Claude Code\",\"next\":\"Book the courier\",\"next_said\":\"Book the courier\",\"left_at\":\"2026-09-15T12:00:00.000Z\",\"mark\":\"next\",\"project\":\"things#2\"},\"state\":\"handoff\",\"version\":1,\"created_at\":\"2026-09-15T12:00:00.000Z\",\"updated_at\":\"2026-09-15T12:00:00.000Z\",\"deleted_at\":null}],\"matched\":1,\"refusals\":[],\"types\":{\"run\":\"run\",\"agent\":\"text\",\"next\":\"text\",\"next_said\":\"text\",\"left_at\":\"instant\",\"mark\":\"enum\"},\"scopes\":[\"Portage\"],\"scope_marks\":[{\"mark\":null,\"hue\":null}],\"key\":\"k0vftbl0\"}",
    "signs": "{\"kind\":\"table\",\"source\":\"signs\",\"rows\":[{\"id\":\"sign:arrivals-filed\",\"register\":\"signs\",\"seq\":null,\"fields\":{\"sign\":\"arrivals-filed\",\"name\":\"Arrivals file by themselves\",\"state\":\"none\",\"value\":null,\"said\":\"Nothing takes messages in yet.\"},\"state\":\"none\",\"version\":1,\"created_at\":\"2026-09-15T12:00:00.000Z\",\"updated_at\":\"2026-09-15T12:00:00.000Z\",\"deleted_at\":null},{\"id\":\"sign:numbers-arrive\",\"register\":\"signs\",\"seq\":null,\"fields\":{\"sign\":\"numbers-arrive\",\"name\":\"Numbers arrive on schedule\",\"state\":\"green\",\"value\":0,\"said\":\"1 feed ran on time.\"},\"state\":\"green\",\"version\":1,\"created_at\":\"2026-09-15T12:00:00.000Z\",\"updated_at\":\"2026-09-15T12:00:00.000Z\",\"deleted_at\":null},{\"id\":\"sign:never-filed\",\"register\":\"signs\",\"seq\":null,\"fields\":{\"sign\":\"never-filed\",\"name\":\"5 checks with nothing filed yet\",\"state\":\"none\",\"value\":null,\"said\":\"Nothing has been filed yet for The model answers, Agents get the tool list, What agents are told is true, Pages draw without errors and What shipped has arrived.\"},\"state\":\"none\",\"version\":1,\"created_at\":\"2026-09-15T12:00:00.000Z\",\"updated_at\":\"2026-09-15T12:00:00.000Z\",\"deleted_at\":null},{\"id\":\"sign:questions-by-cause\",\"register\":\"signs\",\"seq\":null,\"fields\":{\"sign\":\"questions-by-cause\",\"name\":\"Each problem is asked once\",\"state\":\"green\",\"value\":1,\"said\":\"1 open question, no two with the same cause.\"},\"state\":\"green\",\"version\":1,\"created_at\":\"2026-09-15T12:00:00.000Z\",\"updated_at\":\"2026-09-15T12:00:00.000Z\",\"deleted_at\":null},{\"id\":\"sign:oldest-question\",\"register\":\"signs\",\"seq\":null,\"fields\":{\"sign\":\"oldest-question\",\"name\":\"No question waits too long\",\"state\":\"green\",\"value\":0,\"said\":\"The oldest open question was asked today.\"},\"state\":\"green\",\"version\":1,\"created_at\":\"2026-09-15T12:00:00.000Z\",\"updated_at\":\"2026-09-15T12:00:00.000Z\",\"deleted_at\":null},{\"id\":\"sign:runs-true\",\"register\":\"signs\",\"seq\":null,\"fields\":{\"sign\":\"runs-true\",\"name\":\"Agent runs end cleanly\",\"state\":\"green\",\"value\":0,\"said\":\"Every run that ended this week ended normally.\"},\"state\":\"green\",\"version\":1,\"created_at\":\"2026-09-15T12:00:00.000Z\",\"updated_at\":\"2026-09-15T12:00:00.000Z\",\"deleted_at\":null},{\"id\":\"sign:scripts-paused\",\"register\":\"signs\",\"seq\":null,\"fields\":{\"sign\":\"scripts-paused\",\"name\":\"Scripts stay switched on\",\"state\":\"none\",\"value\":null,\"said\":\"No script is installed yet.\"},\"state\":\"none\",\"version\":1,\"created_at\":\"2026-09-15T12:00:00.000Z\",\"updated_at\":\"2026-09-15T12:00:00.000Z\",\"deleted_at\":null},{\"id\":\"sign:scripts-refused\",\"register\":\"signs\",\"seq\":null,\"fields\":{\"sign\":\"scripts-refused\",\"name\":\"Scripts finish their runs\",\"state\":\"none\",\"value\":null,\"said\":\"No script is installed yet.\"},\"state\":\"none\",\"version\":1,\"created_at\":\"2026-09-15T12:00:00.000Z\",\"updated_at\":\"2026-09-15T12:00:00.000Z\",\"deleted_at\":null},{\"id\":\"sign:scripts-sourceless\",\"register\":\"signs\",\"seq\":null,\"fields\":{\"sign\":\"scripts-sourceless\",\"name\":\"Scripts run from what you saved\",\"state\":\"none\",\"value\":null,\"said\":\"No script is installed yet.\"},\"state\":\"none\",\"version\":1,\"created_at\":\"2026-09-15T12:00:00.000Z\",\"updated_at\":\"2026-09-15T12:00:00.000Z\",\"deleted_at\":null},{\"id\":\"sign:automations-failed\",\"register\":\"signs\",\"seq\":null,\"fields\":{\"sign\":\"automations-failed\",\"name\":\"Automations do not fail\",\"state\":\"none\",\"value\":null,\"said\":\"No automation has run in 7 days.\"},\"state\":\"none\",\"version\":1,\"created_at\":\"2026-09-15T12:00:00.000Z\",\"updated_at\":\"2026-09-15T12:00:00.000Z\",\"deleted_at\":null},{\"id\":\"sign:automations-parked\",\"register\":\"signs\",\"seq\":null,\"fields\":{\"sign\":\"automations-parked\",\"name\":\"No run is stuck waiting on a person\",\"state\":\"none\",\"value\":null,\"said\":\"No automation is switched on yet.\"},\"state\":\"none\",\"version\":1,\"created_at\":\"2026-09-15T12:00:00.000Z\",\"updated_at\":\"2026-09-15T12:00:00.000Z\",\"deleted_at\":null},{\"id\":\"sign:automations-idle\",\"register\":\"signs\",\"seq\":null,\"fields\":{\"sign\":\"automations-idle\",\"name\":\"Automations that have never run\",\"state\":\"none\",\"value\":null,\"said\":\"No automation is switched on yet.\"},\"state\":\"none\",\"version\":1,\"created_at\":\"2026-09-15T12:00:00.000Z\",\"updated_at\":\"2026-09-15T12:00:00.000Z\",\"deleted_at\":null},{\"id\":\"sign:automations-stopped-chains\",\"register\":\"signs\",\"seq\":null,\"fields\":{\"sign\":\"automations-stopped-chains\",\"name\":\"Chains run to their end\",\"state\":\"none\",\"value\":null,\"said\":\"No script has run in 7 days.\"},\"state\":\"none\",\"version\":1,\"created_at\":\"2026-09-15T12:00:00.000Z\",\"updated_at\":\"2026-09-15T12:00:00.000Z\",\"deleted_at\":null},{\"id\":\"sign:actions-paused\",\"register\":\"signs\",\"seq\":null,\"fields\":{\"sign\":\"actions-paused\",\"name\":\"No scheduled action is paused\",\"state\":\"green\",\"value\":0,\"said\":\"No action that runs on a schedule is paused.\"},\"state\":\"green\",\"version\":1,\"created_at\":\"2026-09-15T12:00:00.000Z\",\"updated_at\":\"2026-09-15T12:00:00.000Z\",\"deleted_at\":null},{\"id\":\"sign:actions-held\",\"register\":\"signs\",\"seq\":null,\"fields\":{\"sign\":\"actions-held\",\"name\":\"Runs fit the plan's limit\",\"state\":\"green\",\"value\":0,\"said\":\"The plan's limit held no run this month.\"},\"state\":\"green\",\"version\":1,\"created_at\":\"2026-09-15T12:00:00.000Z\",\"updated_at\":\"2026-09-15T12:00:00.000Z\",\"deleted_at\":null},{\"id\":\"sign:schedule-failed\",\"register\":\"signs\",\"seq\":null,\"fields\":{\"sign\":\"schedule-failed\",\"name\":\"Nothing that runs by itself has died\",\"state\":\"green\",\"value\":0,\"said\":\"Nothing that runs by itself has stopped after failing.\"},\"state\":\"green\",\"version\":1,\"created_at\":\"2026-09-15T12:00:00.000Z\",\"updated_at\":\"2026-09-15T12:00:00.000Z\",\"deleted_at\":null},{\"id\":\"sign:doors-silent\",\"register\":\"signs\",\"seq\":null,\"fields\":{\"sign\":\"doors-silent\",\"name\":\"Messages keep arriving\",\"state\":\"none\",\"value\":null,\"said\":\"No way in has had 10 messages in two weeks yet, so none is watched for going quiet.\"},\"state\":\"none\",\"version\":1,\"created_at\":\"2026-09-15T12:00:00.000Z\",\"updated_at\":\"2026-09-15T12:00:00.000Z\",\"deleted_at\":null},{\"id\":\"sign:arrivals-unverified\",\"register\":\"signs\",\"seq\":null,\"fields\":{\"sign\":\"arrivals-unverified\",\"name\":\"Every arrival is verified\",\"state\":\"none\",\"value\":null,\"said\":\"Nothing has come in for 7 days, so there is nothing to judge by.\"},\"state\":\"none\",\"version\":1,\"created_at\":\"2026-09-15T12:00:00.000Z\",\"updated_at\":\"2026-09-15T12:00:00.000Z\",\"deleted_at\":null},{\"id\":\"sign:writes-authored\",\"register\":\"signs\",\"seq\":null,\"fields\":{\"sign\":\"writes-authored\",\"name\":\"Every write has an author\",\"state\":\"green\",\"value\":0,\"said\":\"Every write in the last 24 hours has an author.\"},\"state\":\"green\",\"version\":1,\"created_at\":\"2026-09-15T12:00:00.000Z\",\"updated_at\":\"2026-09-15T12:00:00.000Z\",\"deleted_at\":null},{\"id\":\"sign:format-current\",\"register\":\"signs\",\"seq\":null,\"fields\":{\"sign\":\"format-current\",\"name\":\"This BrainDog is in the current format\",\"state\":\"none\",\"value\":null,\"said\":\"No record has been made in this file yet.\"},\"state\":\"none\",\"version\":1,\"created_at\":\"2026-09-15T12:00:00.000Z\",\"updated_at\":\"2026-09-15T12:00:00.000Z\",\"deleted_at\":null},{\"id\":\"sign:amounts-whole\",\"register\":\"signs\",\"seq\":null,\"fields\":{\"sign\":\"amounts-whole\",\"name\":\"Every amount is whole\",\"state\":\"green\",\"value\":0,\"said\":\"Every amount is whole, with its currency.\"},\"state\":\"green\",\"version\":1,\"created_at\":\"2026-09-15T12:00:00.000Z\",\"updated_at\":\"2026-09-15T12:00:00.000Z\",\"deleted_at\":null},{\"id\":\"sign:rate-age\",\"register\":\"signs\",\"seq\":null,\"fields\":{\"sign\":\"rate-age\",\"name\":\"Rates are fresh enough to match transfers\",\"state\":\"none\",\"value\":null,\"said\":\"No list matches a move between two currencies.\"},\"state\":\"none\",\"version\":1,\"created_at\":\"2026-09-15T12:00:00.000Z\",\"updated_at\":\"2026-09-15T12:00:00.000Z\",\"deleted_at\":null},{\"id\":\"sign:rates-current\",\"register\":\"signs\",\"seq\":null,\"fields\":{\"sign\":\"rates-current\",\"name\":\"Rates are current\",\"state\":\"none\",\"value\":null,\"said\":\"Every amount is in Egyptian Pound, so no exchange rate is needed.\"},\"state\":\"none\",\"version\":1,\"created_at\":\"2026-09-15T12:00:00.000Z\",\"updated_at\":\"2026-09-15T12:00:00.000Z\",\"deleted_at\":null}],\"matched\":23,\"refusals\":[],\"key\":\"k01a2l03\"}",
    "exceptions": "{\"kind\":\"table\",\"source\":\"exceptions\",\"rows\":[],\"matched\":0,\"refusals\":[],\"types\":{\"kind\":\"enum\",\"subject\":\"text\",\"since\":\"day\",\"was\":\"text\"},\"key\":\"k18g0htf\"}",
    "usage.days": "{\"kind\":\"series\",\"source\":\"usage.days\",\"rows\":[{\"id\":\"usage:2026-09-01\",\"register\":\"usage.days\",\"seq\":null,\"fields\":{\"day\":\"2026-09-01\",\"runs\":0,\"requests\":0},\"state\":null,\"version\":1,\"created_at\":\"2026-09-01T00:00:00.000Z\",\"updated_at\":\"2026-09-01T00:00:00.000Z\",\"deleted_at\":null},{\"id\":\"usage:2026-09-02\",\"register\":\"usage.days\",\"seq\":null,\"fields\":{\"day\":\"2026-09-02\",\"runs\":0,\"requests\":0},\"state\":null,\"version\":1,\"created_at\":\"2026-09-02T00:00:00.000Z\",\"updated_at\":\"2026-09-02T00:00:00.000Z\",\"deleted_at\":null},{\"id\":\"usage:2026-09-03\",\"register\":\"usage.days\",\"seq\":null,\"fields\":{\"day\":\"2026-09-03\",\"runs\":0,\"requests\":0},\"state\":null,\"version\":1,\"created_at\":\"2026-09-03T00:00:00.000Z\",\"updated_at\":\"2026-09-03T00:00:00.000Z\",\"deleted_at\":null},{\"id\":\"usage:2026-09-04\",\"register\":\"usage.days\",\"seq\":null,\"fields\":{\"day\":\"2026-09-04\",\"runs\":0,\"requests\":0},\"state\":null,\"version\":1,\"created_at\":\"2026-09-04T00:00:00.000Z\",\"updated_at\":\"2026-09-04T00:00:00.000Z\",\"deleted_at\":null},{\"id\":\"usage:2026-09-05\",\"register\":\"usage.days\",\"seq\":null,\"fields\":{\"day\":\"2026-09-05\",\"runs\":0,\"requests\":0},\"state\":null,\"version\":1,\"created_at\":\"2026-09-05T00:00:00.000Z\",\"updated_at\":\"2026-09-05T00:00:00.000Z\",\"deleted_at\":null},{\"id\":\"usage:2026-09-06\",\"register\":\"usage.days\",\"seq\":null,\"fields\":{\"day\":\"2026-09-06\",\"runs\":0,\"requests\":0},\"state\":null,\"version\":1,\"created_at\":\"2026-09-06T00:00:00.000Z\",\"updated_at\":\"2026-09-06T00:00:00.000Z\",\"deleted_at\":null},{\"id\":\"usage:2026-09-07\",\"register\":\"usage.days\",\"seq\":null,\"fields\":{\"day\":\"2026-09-07\",\"runs\":0,\"requests\":0},\"state\":null,\"version\":1,\"created_at\":\"2026-09-07T00:00:00.000Z\",\"updated_at\":\"2026-09-07T00:00:00.000Z\",\"deleted_at\":null},{\"id\":\"usage:2026-09-08\",\"register\":\"usage.days\",\"seq\":null,\"fields\":{\"day\":\"2026-09-08\",\"runs\":0,\"requests\":0},\"state\":null,\"version\":1,\"created_at\":\"2026-09-08T00:00:00.000Z\",\"updated_at\":\"2026-09-08T00:00:00.000Z\",\"deleted_at\":null},{\"id\":\"usage:2026-09-09\",\"register\":\"usage.days\",\"seq\":null,\"fields\":{\"day\":\"2026-09-09\",\"runs\":0,\"requests\":0},\"state\":null,\"version\":1,\"created_at\":\"2026-09-09T00:00:00.000Z\",\"updated_at\":\"2026-09-09T00:00:00.000Z\",\"deleted_at\":null},{\"id\":\"usage:2026-09-10\",\"register\":\"usage.days\",\"seq\":null,\"fields\":{\"day\":\"2026-09-10\",\"runs\":0,\"requests\":0},\"state\":null,\"version\":1,\"created_at\":\"2026-09-10T00:00:00.000Z\",\"updated_at\":\"2026-09-10T00:00:00.000Z\",\"deleted_at\":null},{\"id\":\"usage:2026-09-11\",\"register\":\"usage.days\",\"seq\":null,\"fields\":{\"day\":\"2026-09-11\",\"runs\":0,\"requests\":0},\"state\":null,\"version\":1,\"created_at\":\"2026-09-11T00:00:00.000Z\",\"updated_at\":\"2026-09-11T00:00:00.000Z\",\"deleted_at\":null},{\"id\":\"usage:2026-09-12\",\"register\":\"usage.days\",\"seq\":null,\"fields\":{\"day\":\"2026-09-12\",\"runs\":0,\"requests\":0},\"state\":null,\"version\":1,\"created_at\":\"2026-09-12T00:00:00.000Z\",\"updated_at\":\"2026-09-12T00:00:00.000Z\",\"deleted_at\":null},{\"id\":\"usage:2026-09-13\",\"register\":\"usage.days\",\"seq\":null,\"fields\":{\"day\":\"2026-09-13\",\"runs\":0,\"requests\":0},\"state\":null,\"version\":1,\"created_at\":\"2026-09-13T00:00:00.000Z\",\"updated_at\":\"2026-09-13T00:00:00.000Z\",\"deleted_at\":null},{\"id\":\"usage:2026-09-14\",\"register\":\"usage.days\",\"seq\":null,\"fields\":{\"day\":\"2026-09-14\",\"runs\":0,\"requests\":0},\"state\":null,\"version\":1,\"created_at\":\"2026-09-14T00:00:00.000Z\",\"updated_at\":\"2026-09-14T00:00:00.000Z\",\"deleted_at\":null},{\"id\":\"usage:2026-09-15\",\"register\":\"usage.days\",\"seq\":null,\"fields\":{\"day\":\"2026-09-15\",\"runs\":0,\"requests\":0},\"state\":null,\"version\":1,\"created_at\":\"2026-09-15T00:00:00.000Z\",\"updated_at\":\"2026-09-15T00:00:00.000Z\",\"deleted_at\":null}],\"matched\":15,\"refusals\":[],\"types\":{\"day\":\"day\",\"runs\":\"int\",\"requests\":\"int\"},\"bars\":{\"bucket\":\"day\",\"current\":\"2026-09-15\",\"keys\":[\"2026-09-01\",\"2026-09-02\",\"2026-09-03\",\"2026-09-04\",\"2026-09-05\",\"2026-09-06\",\"2026-09-07\",\"2026-09-08\",\"2026-09-09\",\"2026-09-10\",\"2026-09-11\",\"2026-09-12\",\"2026-09-13\",\"2026-09-14\",\"2026-09-15\"],\"states\":[\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"\",\"partial\"],\"values\":[[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]],\"unit\":null},\"key\":\"k14szqb8\"}",
    "usage.actions": "{\"kind\":\"table\",\"source\":\"usage.actions\",\"rows\":[{\"id\":\"usage:balance\",\"register\":\"usage.actions\",\"seq\":null,\"fields\":{\"name\":\"balance\",\"channel\":\"poll\",\"project\":null,\"spoken\":null,\"scope\":\"global\",\"runs\":0,\"requests\":0,\"bytes\":0,\"failures\":0,\"held\":0},\"state\":null,\"version\":1,\"created_at\":\"\",\"updated_at\":\"\",\"deleted_at\":null}],\"matched\":1,\"refusals\":[],\"types\":{\"name\":\"text\",\"channel\":\"enum\",\"project\":\"text\",\"spoken\":\"text\",\"scope\":\"enum\",\"runs\":\"int\",\"requests\":\"int\",\"bytes\":\"int\",\"failures\":\"int\",\"held\":\"int\"},\"key\":\"k1012vnv\"}",
    "usage.projects": "{\"kind\":\"table\",\"source\":\"usage.projects\",\"rows\":[{\"id\":\"usage:global\",\"register\":\"usage.projects\",\"seq\":null,\"fields\":{\"name\":null,\"spoken\":null,\"scope\":\"global\",\"actions\":1,\"runs\":0,\"requests\":0,\"bytes\":0,\"failures\":0,\"held\":0},\"state\":null,\"version\":1,\"created_at\":\"\",\"updated_at\":\"\",\"deleted_at\":null}],\"matched\":1,\"refusals\":[],\"types\":{\"name\":\"text\",\"spoken\":\"text\",\"scope\":\"enum\",\"actions\":\"int\",\"runs\":\"int\",\"requests\":\"int\",\"bytes\":\"int\",\"failures\":\"int\",\"held\":\"int\"},\"key\":\"k01lt7rq\"}",
    "kpis": "{\"kind\":\"kpis\",\"source\":\"kpis\",\"for\":\"today\",\"rows\":[],\"matched\":0,\"refusals\":[],\"kpis\":[],\"key\":\"k05lb3wz\"}",
    "scripts": "{\"kind\":\"table\",\"source\":\"scripts\",\"rows\":[],\"matched\":0,\"refusals\":[],\"types\":{\"script\":\"text\",\"title\":\"text\",\"status\":\"enum\",\"every\":\"text\",\"at\":\"text\",\"door\":\"text\",\"rule\":\"boolean\",\"next\":\"instant\",\"last_at\":\"instant\",\"last\":\"text\",\"said\":\"text\",\"in_a_row\":\"decimal\",\"pauses_at\":\"decimal\",\"month\":\"decimal\",\"month_refused\":\"decimal\"},\"key\":\"k0nadgtp\"}",
    "activity again": "{\"kind\":\"feed\",\"source\":\"activity\",\"where\":\"nothing is here\",\"rows\":[],\"matched\":0,\"refusals\":[{\"code\":\"FIELD_UNKNOWN\",\"fix\":\"nothing is here: activity has no field called nothing.\",\"at\":\"nothing\",\"allowed\":[\"actor\",\"kind\",\"target\",\"list\",\"id\",\"seq\",\"created_at\",\"updated_at\",\"version\"]}],\"key\":\"k1fzqnde\"}",
    "actions again": "{\"kind\":\"table\",\"source\":\"actions\",\"columns\":[{\"field\":\"secret\"}],\"rows\":[],\"matched\":0,\"refusals\":[{\"code\":\"FIELD_UNKNOWN\",\"fix\":\"An action has no field called secret.\",\"at\":\"columns\",\"allowed\":[\"ingest\",\"channel\",\"project\",\"host\",\"every\",\"key\",\"state\",\"next\",\"last_at\",\"last_outcome\",\"last_status\",\"last_note\",\"runs\",\"requests\",\"bytes\",\"failures\",\"held\"]}],\"key\":\"k0kgb4d4\"}",
    "governance.open again": "{\"kind\":\"queue\",\"source\":\"governance.open\",\"where\":\"about is things#1\",\"limit\":1,\"rows\":[],\"matched\":1,\"refusals\":[],\"queue\":[{\"id\":\"SG1\",\"who\":\"slash\",\"at\":\"2026-09-15T12:00:00.000Z\",\"kind\":\"options\",\"question\":\"Fire on Friday?\",\"why\":\"\",\"cost\":\"call\",\"options\":[{\"key\":\"yes\",\"label\":\"Yes\",\"because\":\"The bowls are dry.\",\"recommended\":false},{\"key\":\"no\",\"label\":\"No\",\"because\":\"The kiln is booked.\",\"recommended\":false}],\"about\":\"things#1\",\"waits\":\"new\",\"kinds\":[\"call\"],\"list\":\"things\"}],\"waiting\":{\"stale\":0,\"hardToUndo\":0},\"key\":\"k0poi5qa\"}",
    "runs_on again": "{\"kind\":\"table\",\"source\":\"runs_on\",\"rows\":[],\"matched\":0,\"refusals\":[{\"code\":\"REQUIRED_MISSING\",\"fix\":\"runs_on reads what one project runs on, and about: names that project by its row, such as things#1.\",\"at\":\"about\"}],\"key\":\"k0vc91av\"}",
    "deadlines again": "{\"kind\":\"table\",\"source\":\"deadlines\",\"where\":\"list is tasks\",\"horizon\":400,\"rows\":[],\"matched\":0,\"refusals\":[{\"code\":\"OUT_OF_BOUNDS\",\"fix\":\"horizon: on deadlines is a whole number of days ahead, from 0 to 366.\",\"at\":\"horizon\"}],\"key\":\"k00erjwi\"}",
    "figures.home again": "{\"kind\":\"table\",\"source\":\"figures.home\",\"rows\":[],\"matched\":0,\"refusals\":[{\"code\":\"DECLARATION_INVALID\",\"fix\":\"figures.home is drawn by a stat block, and a table block has no figures to draw it with.\",\"at\":\"source\"}],\"key\":\"k0dzrqaj\"}",
    "forecast.runway again": "{\"kind\":\"forecast\",\"source\":\"forecast.runway\",\"rows\":[],\"matched\":0,\"refusals\":[{\"code\":\"REQUIRED_MISSING\",\"fix\":\"A cash walk names what is liquid today (`opening:`) and the legs it reads (`from:`). A runway seeded from a balance nobody declared is a forecast that looks like a fact.\",\"at\":\"opening\"}],\"key\":\"k19l5cl1\"}",
    "signs again": "{\"kind\":\"table\",\"source\":\"signs\",\"where\":\"state is red\",\"rows\":[],\"matched\":0,\"refusals\":[],\"key\":\"k01a2l03\"}",
  };
}
