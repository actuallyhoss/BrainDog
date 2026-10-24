/**
 * The walk's second pass at understanding (loop/research-understanding-judge.md, changes 2, 3 and 5): a payee one word
 * longer than a known one is that payee, a held organisation is asked about rather than keyed, a run under an owner
 * whose repositories one project holds is one question, a single guess is asked with the places it is about, and a
 * service is matched by its first word and its domain's label and gives its project the domain. And nothing in the walk
 * names a use case: the words a payment is for and the payment networks a bank writes come off the record.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { understandBackfill, undoBackfill, type BackfillDeps, type BackfillSuggestion } from '../src/backfill.ts';
import { ulids } from '../src/ids.ts';
import { openRecord, type Declaration, type Entry, type Kernel } from '../src/index.ts';
import { matchProject, candidateOf } from '../src/scope.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 6, 2);
const HOUR = 3_600_000;
const OWNER = { actor: 'p_owner' };
/** When a run the hooks opened was last heard, long before the walk: an import writes none. */
const SEEN = '2000-01-01T00:00:00.000Z';

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const register = (body: Record<string, unknown>): Declaration => ({ id: `register.${body.id as string}`, kind: 'register', body: body as never });

const LISTS = [
  register({
    id: 'things',
    name: 'Projects',
    title: 'name',
    scopes: { repos: 'repos', folders: 'folders' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'repos', type: 'list', of: 'text' },
      { id: 'folders', type: 'list', of: 'text' },
      { id: 'domains', type: 'list', of: 'text' },
    ],
  }),
  register({
    id: 'organisations',
    name: 'Organisations',
    title: 'name',
    org: { name: 'name', keys: 'keys', merged_into: 'merged_into' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'keys', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'organisations' },
    ],
  }),
  register({ id: 'categories', name: 'Categories', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] }),
  register({
    id: 'transactions',
    name: 'Transactions',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'amount', type: 'money', required: true },
      { id: 'party', type: 'ref', to: 'organisations' },
      { id: 'category', type: 'ref', to: 'categories' },
      { id: 'counterparty_text', type: 'text' },
      { id: 'note', type: 'text' },
    ],
  }),
  register({
    id: 'services',
    name: 'Services',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'points_at', type: 'text' },
      { id: 'thing', type: 'ref', to: 'things' },
    ],
  }),
];

const gbp = (amount: number) => ({ amount, currency: 'GBP' });

async function record(): Promise<{ k: Kernel; sql: NodeSql; deps: BackfillDeps; clock: ReturnType<typeof fixedClock> }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW - 48 * HOUR);
  const k = await openRecord(sql, clock);
  value(await k.install(LISTS));
  clock.set(NOW);
  const deps: BackfillDeps = { sql, clock, mint: ulids(() => clock.now()), transaction: k.transaction, write: k.write, registers: k.registers };
  return { k, sql, deps, clock };
}

const line = (k: Kernel, what: string, more: Record<string, unknown> = {}): string => value<Entry>(k.create('transactions', { what, amount: gbp(-1_000), ...more }, OWNER)).id;
const orgs = (k: Kernel): Entry[] => value<{ rows: Entry[] }>(k.list({ register: 'organisations', limit: 100 })).rows;
const runQuestions = (s: readonly BackfillSuggestion[]) => s.filter((x): x is Extract<BackfillSuggestion, { kind: 'run-project' }> => x.kind === 'run-project');

test('A PAYEE ONE WORD LONGER THAN ANOTHER IS THAT PAYEE: one organisation, every spelling’s key, and Undo takes the keys back', async () => {
  const { k, sql, deps } = await record();
  const all = ['SWIFTCAB', 'PAYMOB-SWIFTCAB', 'SWIFTCAB RIDE 2210', 'SWIFTCAB RIDE 7781'].map((said) => line(k, 'Ride', { counterparty_text: said }));
  /* The longer one first, so the order the lines are read in decides nothing. */
  const prime = [line(k, 'Shopping', { counterparty_text: 'NILE MARKET PRIME' }), line(k, 'Shopping', { counterparty_text: 'NILE MARKET 7720' }), line(k, 'Shopping', { counterparty_text: 'NILE MARKET' })];
  const done = understandBackfill(deps);

  const made = orgs(k);
  assert.deepEqual(made.map((o) => o.fields.name).sort(), ['Nile Market', 'Swiftcab']);
  const swiftcab = made.find((o) => o.fields.name === 'Swiftcab')!;
  assert.deepEqual([...(swiftcab.fields.keys as string[])].sort(), ['bank:swiftcab', 'bank:swiftcabride']);
  for (const id of all) assert.equal(k.get(id)?.fields.party, swiftcab.id);
  const nile = made.find((o) => o.fields.name === 'Nile Market')!;
  for (const id of prime) assert.equal(k.get(id)?.fields.party, nile.id);
  assert.deepEqual(done.held, []);

  value(undoBackfill(deps, done.ledger.batch!, 'p_owner'));
  assert.equal(orgs(k).length, 0);
  assert.equal(sql.one('SELECT 1 AS n FROM entity_key WHERE key = ?', 'bank:swiftcabride'), undefined);
  sql.close();
});

test('A PAYEE IS NEVER FOLDED UNDER A WORD THAT ONLY SAYS WHAT KIND OF SHOP IT IS: two cafés stay two', async () => {
  const { k, sql, deps } = await record();
  for (const said of ['CAFE', 'CAFE', 'CAFE NERO', 'CAFE ROUGE', 'CAFE NERO', 'CAFE ROUGE']) line(k, 'Coffee', { counterparty_text: said });
  understandBackfill(deps);
  const keys = orgs(k).map((o) => o.fields.keys as string[]);
  assert.ok(!keys.some((held) => held.includes('bank:cafenero') && held.includes('bank:caferouge')), JSON.stringify(keys));
  sql.close();
});

test('A HELD ORGANISATION A PAYEE ONLY EXTENDS IS ASKED ABOUT, never keyed and never linked (research-audit-21 item 12)', async () => {
  const { k, sql, deps } = await record();
  const amazon = value<Entry>(k.create('organisations', { name: 'Amazon', keys: ['bank:amazon'] }, OWNER)).id;
  const exact = line(k, 'Order', { counterparty_text: 'AMAZON' });
  const longer = [line(k, 'Plan', { counterparty_text: 'AMAZON PRIME' }), line(k, 'Plan', { counterparty_text: 'AMAZON PRIME' })];
  const done = understandBackfill(deps);

  assert.equal(k.get(exact)?.fields.party, amazon, 'its own key links');
  for (const id of longer) assert.equal(k.get(id)?.fields.party, undefined, 'a longer name is not linked on its own');
  assert.deepEqual(k.get(amazon)?.fields.keys, ['bank:amazon'], 'and the held organisation gains no key');
  assert.equal(orgs(k).length, 1, 'nor is a second one made');
  assert.equal(done.held.length, 1);
  const [asked] = done.held;
  assert.equal(asked!.kind, 'organisation-key');
  if (asked!.kind !== 'organisation-key') return;
  assert.deepEqual([asked!.organisation, asked!.bank, asked!.payee, asked!.payments], [{ id: amazon, name: 'Amazon' }, 'bank:amazonprime', 'Amazon Prime', 2]);
  assert.equal(asked!.question, 'Are the 2 payments to Amazon Prime with Amazon?');
  assert.ok(!done.suggestions.some((s) => s.kind === 'organisation'), 'and it is not asked as a company of its own');
  sql.close();
});

test('WHAT A PAYMENT WAS FOR, AND A PAYMENT NETWORK, COME OFF THE RECORD: neither is a payee', async () => {
  const { k, sql, deps } = await record();
  value(k.create('categories', { name: 'Allowance' }, OWNER));
  for (let i = 0; i < 2; i++) {
    line(k, `ALLOWANCE ${i === 0 ? 'SEPTEMBER' : 'OCTOBER'}`);
    line(k, 'From a friend', { counterparty_text: 'quill.harbour@paynet' });
    line(k, 'PAYNET');
  }
  const done = understandBackfill(deps);
  assert.equal(orgs(k).length, 0);
  assert.deepEqual(done.suggestions.filter((s) => s.kind === 'organisation'), [], 'and none is a question either');
  sql.close();
});

test('A RUN UNDER AN OWNER WHOSE REPOSITORIES ONE PROJECT HOLDS IS ONE QUESTION FOR THE OWNER, with every place it is about', async () => {
  const { k, sql, deps, clock } = await record();
  const project = (fields: Record<string, unknown>) => value<Entry>(k.create('things', fields, OWNER)).id;
  const oxbow = project({ name: 'Oxbow.gg', repos: ['oxbow-site'] });
  /* A person's own account, whose repositories two projects hold, settles nothing. */
  project({ name: 'Pinwheel', repos: ['pinwheel'] });
  project({ name: 'Inkwell', repos: ['inkwell'] });
  const braindog = project({ name: 'BrainDog', repos: ['/Users/sam/Code/braindog'] });
  clock.set(NOW - 2 * HOUR);
  const run = (fields: Record<string, unknown>) => value<Entry>(k.create('session', { doing: 'Work', agent: 'claude', state: 'done', ...fields }, { ...OWNER, stamp: { project: '', last_seen: SEEN } })).id;
  run({ remote: 'https://github.com/OxbowGame/oxbow-site', repo: 'oxbow-site', cwd: '/Users/sam/Code/oxbow/site' });
  run({ remote: 'https://github.com/OxbowGame/bot', repo: 'bot', cwd: '/Users/sam/Code/oxbow/bot' });
  run({ remote: 'git@github.com:OxbowGame/oxbow-health.git', repo: 'oxbow-health', cwd: '/Users/sam/Code/oxbow/health' });
  run({ remote: 'https://github.com/samdev/pinwheel', repo: 'pinwheel', cwd: '/Users/sam/Code/pinwheel' });
  run({ remote: 'https://github.com/samdev/inkwell', repo: 'inkwell', cwd: '/Users/sam/Code/inkwell' });
  run({ remote: 'https://github.com/samdev/website', repo: 'website', cwd: '/Users/sam/Code/website' });
  const inBrainDog = run({ remote: 'https://github.com/samdev/BrainDog', repo: 'BrainDog', cwd: '/Users/sam/Code/braindog' });
  clock.set(NOW);
  const done = understandBackfill(deps);

  assert.equal(k.get(inBrainDog)?.fields.project, k.nameOf(braindog), 'a folder kept among the repositories places the run');
  const asked = runQuestions(done.suggestions);
  const owner = asked.find((s) => s.place === 'OxbowGame');
  assert.ok(owner, asked.map((s) => s.question).join(' / '));
  assert.equal(owner.question, '2 runs worked in OxbowGame repositories. Is that Oxbow.gg?');
  assert.deepEqual(owner.projects, [{ id: oxbow, name: 'Oxbow.gg' }]);
  assert.deepEqual(owner.wheres, ['remote:github.com/oxbowgame/bot', 'remote:github.com/oxbowgame/oxbow-health']);
  assert.ok(!asked.some((s) => s.place === 'website' || s.place === 'samdev'), 'an owner two projects hold asks nothing');

  /* A SINGLE GUESS IS ASKED, with the whole place of every run it is about. */
  const site = asked.find((s) => s.place === 'oxbow-site');
  assert.equal(site?.question, 'A run worked in oxbow-site. Is that Oxbow.gg?');
  assert.deepEqual(site?.wheres, ['remote:github.com/oxbowgame/oxbow-site']);
  for (const s of asked) assert.doesNotMatch(s.question, /github\.com|\/Users|things#|remote:|—/u, s.question);
  sql.close();
});

test('A FOLDER KEPT AMONG A PROJECT’S REPOSITORIES IS READ AS A FOLDER, wherever a run is placed from', () => {
  const projects = [candidateOf('p1', 'things#1', ['/Users/sam/Code/braindog', 'braindog-site'], []), candidateOf('p2', 'things#2', ['C:\\Repos\\roomy'], [])];
  assert.deepEqual(projects[0], { id: 'p1', spoken: 'things#1', repos: ['braindog-site'], folders: ['/Users/sam/Code/braindog'] });
  assert.equal(matchProject(projects, { cwd: '/Users/sam/Code/braindog/apps/web', remote: 'https://github.com/samdev/BrainDog' }).project?.id, 'p1');
  assert.equal(matchProject(projects, { cwd: 'c:/repos/nook' }).project?.how, 'folder');
});

test('A SERVICE IS MATCHED BY ITS FIRST WORD AND ITS DOMAIN’S LABEL, AND ITS PROJECT GAINS THE DOMAIN, which Undo takes off', async () => {
  const { k, sql, deps } = await record();
  const project = (fields: Record<string, unknown>) => value<Entry>(k.create('things', fields, OWNER)).id;
  const oxbow = project({ name: 'Oxbow.gg' });
  const bluff = project({ name: 'Tee Time', domains: ['tee.time'] });
  const harbourside = project({ name: 'Harbourside' });
  project({ name: 'Harbour' });
  const service = (fields: Record<string, unknown>) => value<Entry>(k.create('services', fields, OWNER)).id;
  const vm = service({ name: 'oxbow VM' });
  const db = service({ name: 'harbourside database' });
  const site = service({ name: 'teetime.com', points_at: 'www.teetime.com' });
  const law = service({ name: 'nadrylaw.com' });
  const stats = service({ name: 'oxbow analytics', points_at: 'plausible.io' });
  const done = understandBackfill(deps);

  assert.equal(k.get(vm)?.fields.thing, oxbow, 'the first word, against the project’s name without its ending');
  assert.equal(k.get(db)?.fields.thing, harbourside, 'and never the project whose name it only starts with');
  assert.equal(k.get(site)?.fields.thing, bluff, 'the label of its domain, against the project’s name');
  assert.equal(k.get(law)?.fields.thing, undefined);
  assert.deepEqual(k.get(bluff)?.fields.domains, ['tee.time', 'teetime.com']);
  assert.equal(k.get(stats)?.fields.thing, oxbow);
  assert.equal(k.get(oxbow)?.fields.domains, undefined, 'a domain that is somebody else’s never goes on the project');

  value(undoBackfill(deps, done.services.batch!, 'p_owner'));
  assert.deepEqual(k.get(bluff)?.fields.domains, ['tee.time']);
  assert.equal(k.get(site)?.fields.thing ?? null, null);
  sql.close();
});
