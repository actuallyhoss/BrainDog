/**
 * The walk, held to what was found in it: a folder is a sure place only where the run worked in it or its
 * project names the run's repository, `~` and a Mac's case read as the machine reads them; each run question
 * carries the whole places of exactly its own runs; a payee shaped like a person's name is never a business by a
 * surname or two initials; a line describing itself, "SALARY OCTOBER", names nobody; a walk's undo leaves a key
 * somebody put back and marks the batch undone only for what it put back; a dry walk says the project it would
 * place a run in; and the server's undo plan of a walk batch says each row by its list and number.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { understandBackfill, undoBackfill, soundsLikeBusiness, type BackfillDeps, type BackfillSuggestion } from '../src/backfill.ts';
import { keyOf } from '../src/identity-keys.ts';
import { ulids } from '../src/ids.ts';
import { openRecord, type Declaration, type Entry, type Kernel } from '../src/index.ts';
import { undoPlan } from '../src/undo.ts';
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
      /* A CHOICE THE LEDGER DESCRIBES ITS LINES BY, beside categories that do not hold its words. */
      { id: 'kind', type: 'enum', values: ['salary', 'retainer', 'one_off'], labels: { retainer: 'Monthly retainer', one_off: 'One-off' } },
      { id: 'counterparty_text', type: 'text' },
    ],
  }),
];

const gbp = (amount: number) => ({ amount, currency: 'GBP' });

async function record(): Promise<{ k: Kernel; sql: NodeSql; deps: BackfillDeps; clock: ReturnType<typeof fixedClock> }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW - 48 * HOUR);
  const k = await openRecord(sql, clock);
  value(await k.install(LISTS));
  const deps: BackfillDeps = { sql, clock, mint: ulids(() => clock.now()), transaction: k.transaction, write: k.write, registers: k.registers };
  return { k, sql, deps, clock };
}

const project = (k: Kernel, fields: Record<string, unknown>): string => value<Entry>(k.create('things', fields, OWNER)).id;
const run = (k: Kernel, fields: Record<string, unknown>): string =>
  value<Entry>(k.create('session', { doing: 'Work', agent: 'claude', state: 'done', ...fields }, { ...OWNER, stamp: { project: '', last_seen: SEEN } })).id;
const line = (k: Kernel, what: string, more: Record<string, unknown> = {}): string => value<Entry>(k.create('transactions', { what, amount: gbp(-1_000), ...more }, OWNER)).id;
const runQuestions = (s: readonly BackfillSuggestion[]) => s.filter((x): x is Extract<BackfillSuggestion, { kind: 'run-project' }> => x.kind === 'run-project');
const organisationQuestions = (s: readonly BackfillSuggestion[]) => s.filter((x): x is Extract<BackfillSuggestion, { kind: 'organisation' }> => x.kind === 'organisation');

test('A FOLDER IS SURE ONLY WHERE THE RUN WORKED IN IT, OR WHERE ITS PROJECT NAMES THE REPOSITORY; ~ AND A MAC’S CASE READ AS THE MACHINE READS THEM', async () => {
  const { k, sql, deps, clock } = await record();
  /* A LONE PROJECT LISTING THE WHOLE CODE FOLDER, with no other project's folder in it to say it is broad. */
  const workbench = project(k, { name: 'Workbench', folders: ['~/Developer'] });
  const kiln = project(k, { name: 'Kiln', folders: ['~/Code/Kiln'] });
  const marlow = project(k, { name: 'Marlow', folders: ['/Users/sam/Clients/marlow'], repos: ['marlow-site'] });
  project(k, { name: 'Crate', folders: ['/home/sam/box'] });
  clock.set(NOW - 2 * HOUR);
  const unknown = run(k, { repo: 'stranger', cwd: '/Users/sam/Developer/stranger' });
  const atKiln = run(k, { cwd: '/Users/sam/code/kiln' });
  const site = run(k, { repo: 'marlow-site', cwd: '/Users/sam/Clients/marlow/site' });
  const deeper = run(k, { cwd: '/Users/sam/Clients/marlow/drafts' });
  const linux = run(k, { cwd: '/home/sam/Box' });
  clock.set(NOW);
  const done = understandBackfill(deps);

  assert.equal(k.get(unknown)?.fields.project, '', 'a repository no project knows is not claimed by a folder it sits in');
  assert.equal(k.get(atKiln)?.fields.project, k.nameOf(kiln), '`~/Code/Kiln` is the Mac folder `/Users/sam/code/kiln`');
  assert.equal(k.get(site)?.fields.project, k.nameOf(marlow), 'a project naming the run’s repository places it anywhere in its folder');
  assert.equal(k.get(deeper)?.fields.project, '', 'further down its folder, a run is a question');
  assert.equal(k.get(linux)?.fields.project, '', 'a Linux folder keeps its case');

  const asked = runQuestions(done.suggestions).map((s) => s.question).sort();
  assert.deepEqual(asked, ['A run worked in Box. Is that Crate?', 'A run worked in drafts. Is that Marlow?', 'A run worked in stranger. Is that Workbench?']);
  assert.ok(workbench);
  sql.close();
});

test('EACH RUN QUESTION CARRIES THE WHOLE PLACES OF ITS OWN RUNS, never another `app` that guessed another project', async () => {
  const { k, sql, deps, clock } = await record();
  project(k, { name: 'Marlow', folders: ['/Users/sam/Code/marlow'] });
  project(k, { name: 'Kiln', folders: ['/Volumes/Work/app'] });
  clock.set(NOW - 2 * HOUR);
  run(k, { cwd: '/Users/sam/Code/marlow/app' });
  run(k, { repo: 'app', remote: 'https://gitlab.com/b/app' });
  run(k, { repo: 'app', remote: 'git@gitlab.com:b/app.git' });
  clock.set(NOW);
  const asked = runQuestions(understandBackfill(deps).suggestions);

  const of = (name: string) => asked.find((s) => s.projects.map((p) => p.name).join() === name)!;
  assert.deepEqual(of('Marlow').wheres, [keyOf('folder', '/Users/sam/Code/marlow/app')]);
  assert.deepEqual(of('Kiln').wheres, [keyOf('remote', 'https://gitlab.com/b/app')], 'two spellings of one remote are one place');
  assert.equal(of('Kiln').runs, 2);
  sql.close();
});

test('A SURNAME OR TWO INITIALS NEVER MAKE A PERSON A BUSINESS, and a web address has a name before its dot', () => {
  for (const said of ['SAM PRIME', 'JO RIDE', 'Ada Energy', 'Tom Mobile', 'Lee Media', 'Fee Chan', 'Kim Interest', 'SAM CO MARCHETTI', 'AB OKONKWO', 'Lena Oy Berg', 'A.Co', 'J.COM'])
    assert.ok(!soundsLikeBusiness(said), said);
  for (const said of ['HALDEN TYPE CO', 'Tarnvale Oy', 'Volvo AB', 'Edgewall Ltd Holdings', 'SOWBELL.COM', 'ORCHARD.COM/BILL', 'WWW.AMAZON.CO.UK', 'HARBOUR BANK FEES', 'SWIFTCAB RIDES'])
    assert.ok(soundsLikeBusiness(said), said);
});

test('A LINE DESCRIBING ITSELF NAMES NOBODY: "SALARY OCTOBER", a choice the ledger declares, every word of a category', async () => {
  const { k, sql, deps } = await record();
  value(k.create('categories', { name: 'Rent and utilities' }, OWNER));
  for (const month of ['SEPTEMBER', 'OCTOBER']) {
    line(k, `SALARY ${month}`);
    line(k, `RETAINER ${month}`);
    line(k, `UTILITIES ${month}`);
    line(k, `LOWRY ST STUDIOS RENT ${month}`);
  }
  for (let i = 0; i < 3; i++) line(k, 'Card payment', { counterparty_text: 'SAM PRIME' });
  const done = understandBackfill(deps);

  const asked = organisationQuestions(done.suggestions).map((s) => s.name).sort();
  assert.deepEqual(asked, ['Lowry St Studios', 'Sam Prime'], 'a payee is asked about, and the line’s own words never are');
  const names = value<{ rows: Entry[] }>(k.list({ register: 'organisations', limit: 10 })).rows.map((r) => r.fields.name);
  assert.deepEqual(names, [], 'and nothing is made of a surname');
  sql.close();
});

test('A WALK’S UNDO LEAVES A KEY SOMEBODY PUT BACK, and marks the batch undone only when it put something back', async () => {
  const { k, sql, deps } = await record();
  /* AN ORGANISATION A DOOR MADE FROM A BANK'S WORDS, found by its name, gains its key from the walk. */
  const coffee = value<Entry>(k.create('organisations', { name: 'Bridge St Coffee' }, { actor: 'rule:import' })).id;
  const paid = line(k, 'BRIDGE ST COFFEE');
  const done = understandBackfill(deps);
  assert.equal(k.get(paid)?.fields.party, coffee);
  assert.deepEqual(k.get(coffee)?.fields.keys, ['bank:bridgestcoffee']);

  /* The person takes the key off and puts it back: it reads as it did, and it is theirs now. */
  const keyed = k.get(coffee)!;
  const off = value<Entry>(k.update('organisations', coffee, { keys: null }, { ...OWNER, version: keyed.version }));
  value(k.update('organisations', coffee, { keys: ['bank:bridgestcoffee'] }, { ...OWNER, version: off.version }));

  const marked = () => sql.one('SELECT 1 AS n FROM undone WHERE batch = ?', done.ledger.batch!) !== undefined;
  const back = value<{ undone: number }>(undoBackfill(deps, done.ledger.batch!, 'p_owner'));
  assert.equal(back.undone, 1, 'the link goes back');
  assert.equal(k.get(paid)?.fields.party ?? null, null);
  assert.deepEqual(k.get(coffee)?.fields.keys, ['bank:bridgestcoffee'], 'the key somebody put back stays');
  assert.ok(marked());

  /* A BATCH WHOSE EVERY LINE SOMEBODY CHANGED SINCE PUTS NOTHING BACK, and is not marked undone. */
  const other = value<Entry>(k.create('organisations', { name: 'Bridge Street Cafe' }, OWNER)).id;
  const again = line(k, 'BRIDGE ST COFFEE');
  const second = understandBackfill(deps);
  for (const id of [paid, again]) {
    assert.equal(k.get(id)?.fields.party, coffee);
    value(k.update('transactions', id, { party: other }, { ...OWNER, version: k.get(id)!.version }));
  }
  const none = value<{ undone: number }>(undoBackfill(deps, second.ledger.batch!, 'p_owner'));
  assert.equal(none.undone, 0);
  assert.equal(k.get(again)?.fields.party, other, 'what the person chose stays');
  assert.equal(sql.one('SELECT 1 AS n FROM undone WHERE batch = ?', second.ledger.batch!), undefined, 'nothing put back is nothing marked');
  sql.close();
});

test('A DRY WALK SAYS THE PROJECT IT WOULD PLACE A RUN IN, and the undo plan of a walk says each row by its list and number', async () => {
  const { k, sql, clock } = await record();
  project(k, { name: 'Quarry', repos: ['git@github.com:acme/quarry.git'] });
  clock.set(NOW - 2 * HOUR);
  run(k, { remote: 'https://github.com/acme/quarry', repo: 'quarry' });
  value(k.create('organisations', { name: 'Fenwick Cloud', keys: ['bank:fenwickcloud'] }, OWNER));
  line(k, 'FENWICK CLOUD');
  clock.set(NOW);

  const dry = k.backfill({ dry: true });
  const placing = (dry.planned ?? []).find((p) => p.fields.Project !== undefined);
  assert.equal(placing?.fields.Project, 'Quarry', JSON.stringify(dry.planned));
  assert.ok(!JSON.stringify(dry.planned).includes('things#'), 'a project is said by its name, never its handle');

  const real = k.backfill();
  for (const batch of [real.runs.batch!, real.ledger.batch!]) {
    const plan = value<{ steps: { register?: string; seq?: number; row?: string }[] }>(undoPlan(sql, { batch }));
    assert.ok(plan.steps.length > 0);
    for (const step of plan.steps) {
      assert.equal(typeof step.register, 'string');
      assert.equal(typeof step.seq, 'number');
      assert.equal(k.get({ register: step.register!, seq: step.seq! })?.id, step.row, 'the list and number are the row’s own');
    }
  }
  sql.close();
});
