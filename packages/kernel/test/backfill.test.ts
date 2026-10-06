/**
 * The walk over what the record already holds (DIRECTION §38), on a scratch record shaped like the owner's and
 * pseudonymised: ledger lines with no party and the payee only in the bank's words, a note's "Payee:" or the
 * description; runs in no project though most name their repository; projects listing bare repository names; and
 * services in no project.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { understandBackfill, undoBackfill, tidy, BACKFILL_ACTOR, type BackfillDeps, type BackfillSuggestion } from '../src/backfill.ts';
import { ulids } from '../src/ids.ts';
import { openRecord, type Declaration, type Entry, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 6, 2);
const HOUR = 3_600_000;
const OWNER = { actor: 'p_owner' };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const register = (body: Record<string, unknown>): Declaration => ({ id: `register.${body.id as string}`, kind: 'register', body: body as never });

const PROJECTS = register({
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
});

const ORGS = register({
  id: 'organisations',
  name: 'Organisations',
  title: 'name',
  org: { name: 'name', kind: 'kind', domain: 'domain', keys: 'keys', merged_into: 'merged_into' },
  fields: [
    { id: 'name', type: 'text', required: true },
    { id: 'kind', type: 'enum', values: ['company', 'client', 'vendor', 'merchant', 'bank', 'other'] },
    { id: 'domain', type: 'text' },
    { id: 'keys', type: 'list', of: 'text' },
    { id: 'merged_into', type: 'ref', to: 'organisations' },
  ],
});

const PEOPLE = register({
  id: 'people',
  name: 'People',
  title: 'name',
  meets: { name: 'name', email: 'email', met: 'met', merged_into: 'merged_into', keys: 'keys', aliases: 'aliases' },
  fields: [
    { id: 'name', type: 'text', required: true },
    { id: 'email', type: 'email' },
    { id: 'keys', type: 'list', of: 'text' },
    { id: 'aliases', type: 'list', of: 'text' },
    { id: 'met', type: 'list', of: 'text' },
    { id: 'merged_into', type: 'ref', to: 'people' },
  ],
});

const LEDGER = register({
  id: 'transactions',
  name: 'Transactions',
  title: 'what',
  fields: [
    { id: 'what', type: 'text', required: true },
    { id: 'amount', type: 'money', required: true },
    { id: 'party', type: 'ref', to: 'organisations' },
    { id: 'counterparty_text', type: 'text' },
    { id: 'transfer', type: 'bool' },
    { id: 'note', type: 'text' },
  ],
});

const SERVICES = register({
  id: 'services',
  name: 'Services',
  title: 'name',
  fields: [
    { id: 'name', type: 'text', required: true },
    { id: 'provider', type: 'text' },
    { id: 'points_at', type: 'text' },
    { id: 'thing', type: 'ref', to: 'things' },
  ],
});

const gbp = (amount: number) => ({ amount, currency: 'GBP' });

/** A scratch record: the lists, runs written before any project listed where it lives, then the projects and the rest. */
async function record(): Promise<{ k: Kernel; sql: NodeSql; deps: BackfillDeps; clock: ReturnType<typeof fixedClock>; ids: Record<string, string> }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW - 48 * HOUR);
  const k = await openRecord(sql, clock);
  value(await k.install([PROJECTS, ORGS, PEOPLE, LEDGER, SERVICES]));

  /* THE RUNS, from before the projects were written down, so none was placed when it opened. */
  const run = (fields: Record<string, unknown>) => value<Entry>(k.create('session', { doing: 'Work', agent: 'claude', state: 'done', ...fields }, OWNER));
  run({ remote: 'git@github.com:acme/quarry.git', repo: 'quarry', cwd: '/Users/sam/Code/quarry' });
  run({ repo: 'lantern', cwd: '/Users/sam/Code/lantern' });
  run({ cwd: '/Users/sam/Clients/brightside/site' });
  run({ repo: 'tallow', cwd: '/Users/sam/Code/tallow' });
  run({ repo: 'tallow', cwd: '/Users/sam/Code/tallow' });
  for (let i = 0; i < 3; i++) run({ remote: 'https://github.com/acme/Lantern.git', repo: 'lantern', cwd: '/Users/sam/Code/lantern' });
  run({ repo: 'scratch', cwd: '/private/tmp/scratch' });

  const project = (fields: Record<string, unknown>) => value<Entry>(k.create('things', fields, OWNER)).id;
  const ids: Record<string, string> = {
    quarry: project({ name: 'Quarry', repos: ['git@github.com:acme/quarry.git'], domains: ['quarry.example'] }),
    lantern: project({ name: 'Lantern', repos: ['lantern'], domains: ['lantern.example'] }),
    brightside: project({ name: 'Brightside', folders: ['/Users/sam/Clients/brightside'] }),
    tallow: project({ name: 'Tallow', repos: ['tallow'], domains: ['tallow.example'] }),
    tallowSite: project({ name: 'Tallow Site', repos: ['tallow'], domains: ['tallow.example'] }),
  };

  ids.fenwick = value<Entry>(k.create('organisations', { name: 'Fenwick Cloud' }, OWNER)).id;
  ids.halden = value<Entry>(k.create('organisations', { name: 'Halden Type Co', keys: ['bank:haldentypeco'] }, OWNER)).id;
  value(k.create('people', { name: 'Sam Marchetti' }, OWNER));

  const line = (what: string, more: Record<string, unknown> = {}) => value<Entry>(k.create('transactions', { what, amount: gbp(-1_250), ...more }, OWNER)).id;
  for (let i = 0; i < 3; i++) line(`CARD ${i}`, { counterparty_text: 'GEIDEA*BRIDGE ST COFFEE 0423 LONDON GB' });
  line('AMAZON MKTPLACE 1', { note: 'Payee: Amazon. Bought a dock.' });
  line('AMAZON MKTPLACE 2', { note: 'Payee: Amazon.' });
  line('Monthly plan', { note: 'Payee: Kestrel.' });
  ids.fenwickLine = line('FENWICK CLOUD');
  ids.haldenLine = line('HALDEN TYPE CO INV 2026-035');
  ids.corner = line('CORNER SHOP');
  line('S MARCHETTI, AUGUST');
  line('S MARCHETTI, SEPTEMBER');
  line('SAM MARCHETTI');
  line('SAM MARCHETTI');
  line('TRANSFER TO TAX RESERVE', { transfer: true });
  line('TRANSFER TO TAX RESERVE', { transfer: true });
  line('LOWRY ST STUDIOS RENT AUG');
  line('LOWRY ST STUDIOS RENT SEP');
  line('BELLWETHER');
  line('BELLWETHER');

  const service = (fields: Record<string, unknown>) => value<Entry>(k.create('services', fields, OWNER)).id;
  ids.errors = service({ name: 'Error tracking', provider: 'Kestrel' });
  ids.cert = service({ name: 'Wildcard certificate', provider: 'Nordhaven', points_at: '*.quarry.example' });
  ids.lanternDomain = service({ name: 'lantern.example', provider: 'Cove Domains' });
  ids.lanternBox = service({ name: 'Lantern', provider: 'Fenwick Cloud' });
  ids.tallowDomain = service({ name: 'Sending domain', provider: 'Cove Domains', points_at: 'mail.tallow.example' });
  ids.placed = service({ name: 'Analytics', provider: 'Bellwether', thing: ids.quarry });

  clock.set(NOW);
  const deps: BackfillDeps = { sql, clock, mint: ulids(() => clock.now()), transaction: k.transaction, write: k.write, registers: k.registers };
  return { k, sql, deps, clock, ids };
}

const partyOf = (k: Kernel, id: string) => k.get(id)?.fields.party ?? null;
const orgNamed = (k: Kernel, name: string) => value<{ rows: Entry[] }>(k.list({ register: 'organisations', limit: 100 })).rows.find((r) => r.fields.name === name) ?? null;
const lines = (k: Kernel) => value<{ rows: Entry[] }>(k.list({ register: 'transactions', limit: 100 })).rows;
const runs = (k: Kernel) => value<{ rows: Entry[] }>(k.list({ register: 'session', limit: 100 })).rows;
const kinds = (s: readonly BackfillSuggestion[], kind: BackfillSuggestion['kind']) => s.filter((x) => x.kind === kind);

test('A PAYEE THE BANK OR A NOTE SAID, ON TWO LINES OR MORE, IS MET AS AN ORGANISATION BY ITS BANK KEY AND LINKED', async () => {
  const { k, sql, deps } = await record();
  const done = understandBackfill(deps);

  const coffee = orgNamed(k, 'Bridge St Coffee');
  assert.ok(coffee, 'the bank’s words, tidied, name the new organisation');
  assert.deepEqual(coffee.fields.keys, ['bank:bridgestcoffee']);
  assert.equal(lines(k).filter((l) => l.fields.party === coffee.id).length, 3);

  const amazon = orgNamed(k, 'Amazon');
  assert.ok(amazon, '"Payee: Amazon." in a note names it');
  assert.equal(lines(k).filter((l) => l.fields.party === amazon.id).length, 2);

  /* Every write is the walk's, in one batch, with the key's source said. */
  assert.ok(done.ledger.batch);
  const actors = sql.all<{ actor: string }>('SELECT DISTINCT actor FROM event WHERE batch = ?', done.ledger.batch).map((r) => r.actor);
  assert.deepEqual(actors, [BACKFILL_ACTOR]);
  assert.equal(sql.one<{ source: string }>("SELECT source FROM entity_key WHERE key = 'bank:bridgestcoffee'")?.source, 'backfill');
  sql.close();
});

test('A PAYEE ON ONE LINE IS LEFT ALONE UNLESS AN ORGANISATION OR A SERVICE ALREADY NAMES IT', async () => {
  const { k, sql, deps, ids } = await record();
  understandBackfill(deps);

  assert.equal(partyOf(k, ids.fenwickLine!), ids.fenwick, 'Fenwick Cloud is known by its name, folded as a bank folds it');
  assert.deepEqual(k.get(ids.fenwick!)?.fields.keys, ['bank:fenwickcloud'], 'and keeps the key it was found by');
  assert.equal(partyOf(k, ids.haldenLine!), ids.halden, 'a description is cut at what the payment was for');
  assert.equal(partyOf(k, ids.corner!), null, 'a shop on one line is nobody yet');

  const kestrel = orgNamed(k, 'Kestrel');
  assert.ok(kestrel, 'a payee that is a service’s provider is the organisation the service is with');
  assert.equal(kestrel.fields.kind, 'vendor');
  sql.close();
});

test('NEVER A PERSON, NEVER A TRANSFER, AND A PAYEE ONLY A DESCRIPTION NAMES IS A QUESTION', async () => {
  const { k, sql, deps } = await record();
  const done = understandBackfill(deps);

  const names = value<{ rows: Entry[] }>(k.list({ register: 'organisations', limit: 100 })).rows.map((r) => r.fields.name).sort();
  assert.deepEqual(names, ['Amazon', 'Bellwether', 'Bridge St Coffee', 'Fenwick Cloud', 'Halden Type Co', 'Kestrel']);
  for (const l of lines(k).filter((l) => /MARCHETTI|TRANSFER/.test(String(l.fields.what)))) assert.equal(l.fields.party, undefined, String(l.fields.what));
  assert.equal(value<{ rows: Entry[] }>(k.list({ register: 'people', limit: 10 })).rows.length, 1, 'nobody is made');

  const asked = kinds(done.suggestions, 'organisation');
  assert.deepEqual(asked.map((s) => s.kind === 'organisation' && [s.name, s.payments]), [['Lowry St Studios', 2]]);
  assert.match(asked[0]!.question, /^Is Lowry St Studios a company you pay or are paid by\? 2 payments name it\.$/);
  sql.close();
});

test('A RUN IS PLACED BY ITS REMOTE, ITS FOLDER OR A BARE NAME ONE PROJECT LISTS, AND TWO PROJECTS ARE A QUESTION', async () => {
  const { k, sql, deps, ids } = await record();
  const done = understandBackfill(deps);

  const placed = Object.fromEntries(runs(k).map((r) => [r.seq, r.fields.project ?? null]));
  const spoken = (id: string) => k.nameOf(id);
  assert.equal(placed[1], spoken(ids.quarry!), 'by its remote');
  assert.equal(placed[2], spoken(ids.lantern!), 'by the bare name Lantern lists');
  assert.equal(placed[3], spoken(ids.brightside!), 'by its folder');
  assert.equal(placed[4], null, 'tallow is two projects’ name');
  assert.equal(placed[9], null, 'a scratch folder is in no project');
  assert.equal(done.runs.wrote, 6);

  const asked = kinds(done.suggestions, 'run-project');
  assert.equal(asked.length, 1);
  assert.equal(asked[0]!.question, '2 runs worked in tallow. Is that Tallow or Tallow Site?');
  sql.close();
});

test('A RUN STILL WORKING, OR ONE ALREADY PLACED, IS NEVER MOVED', async () => {
  const { k, sql, deps, ids, clock } = await record();
  clock.set(NOW - 10 * 60_000);
  const working = value<Entry>(k.create('session', { doing: 'Now', agent: 'claude', state: 'active', remote: 'github.com/acme/quarry' }, { ...OWNER, stamp: { project: '' } }));
  const elsewhere = value<Entry>(k.create('session', { doing: 'Then', agent: 'claude', state: 'done', remote: 'github.com/acme/quarry' }, { ...OWNER, stamp: { project: k.nameOf(ids.lantern!) } }));
  clock.set(NOW);
  understandBackfill(deps);
  assert.equal(k.get(working.id)?.fields.project, '', 'the ladder places a run that is working');
  assert.equal(k.get(elsewhere.id)?.fields.project, k.nameOf(ids.lantern!));
  sql.close();
});

test('A SERVICE IS LINKED WHEN ITS NAME OR HOST MATCHES EXACTLY ONE PROJECT', async () => {
  const { k, sql, deps, ids } = await record();
  const done = understandBackfill(deps);
  assert.equal(k.get(ids.cert!)?.fields.thing, ids.quarry, 'a wildcard over the project’s domain');
  assert.equal(k.get(ids.lanternDomain!)?.fields.thing, ids.lantern, 'the project’s domain itself');
  assert.equal(k.get(ids.lanternBox!)?.fields.thing, ids.lantern, 'the project’s name');
  assert.equal(k.get(ids.errors!)?.fields.thing, undefined, 'nothing names a project');
  assert.equal(k.get(ids.placed!)?.fields.thing, ids.quarry, 'one already in a project stays');
  assert.equal(k.get(ids.tallowDomain!)?.fields.thing, undefined);
  const asked = kinds(done.suggestions, 'service-project');
  assert.deepEqual(asked.map((s) => s.question), ['Which project is Sending domain for: Tallow or Tallow Site?']);
  sql.close();
});

test('A BARE REPOSITORY NAME WITH ONE REMOTE SEEN ON RUNS IS A SUGGESTION, NEVER A WRITE', async () => {
  const { k, sql, deps, ids } = await record();
  const done = understandBackfill(deps);
  const asked = kinds(done.suggestions, 'project-remote');
  assert.equal(asked.length, 1);
  const [s] = asked;
  assert.ok(s?.kind === 'project-remote');
  assert.deepEqual([s.project, s.repo, s.remote, s.runs], [{ id: ids.lantern, name: 'Lantern' }, 'lantern', 'https://github.com/acme/Lantern.git', 3]);
  assert.equal(s.question, '3 runs worked in a repository called Lantern. Add it to Lantern, so runs there are placed in it?');
  assert.deepEqual(k.get(ids.lantern!)?.fields.repos, ['lantern'], 'the project is left as the person wrote it');
  sql.close();
});

test('WORDS A PERSON READS NAME THINGS, NEVER AN ID, A KEY, A HOST OR A PATH', async () => {
  const { sql, deps } = await record();
  const { suggestions } = understandBackfill(deps);
  assert.ok(suggestions.length >= 4);
  for (const s of suggestions) {
    assert.doesNotMatch(s.question, /[0-9A-HJKMNP-TV-Z]{26}|bank:|github\.com|\/Users|things#|—/, s.question);
  }
  sql.close();
});

test('A SECOND WALK WRITES NOTHING, AND A SMALL LIMIT GETS THERE A SLICE AT A TIME', async () => {
  const { k, sql, deps } = await record();
  let next: { ledger?: string | null; runs?: string | null; services?: string | null } = {};
  let calls = 0;
  do {
    const done = understandBackfill(deps, { limit: 3, after: next });
    next = { ledger: done.ledger.next, runs: done.runs.next, services: done.services.next };
    calls++;
  } while ((next.ledger || next.runs || next.services) && calls < 20);
  assert.ok(calls > 3, `walked in ${calls} calls`);
  const linked = lines(k).filter((l) => l.fields.party !== undefined).length;
  assert.equal(linked, 10);

  const again = understandBackfill(deps);
  assert.deepEqual([again.ledger.wrote, again.runs.wrote, again.services.wrote, again.ledger.organisations], [0, 0, 0, 0]);
  assert.deepEqual([again.ledger.batch, again.runs.batch, again.services.batch], [null, null, null]);
  sql.close();
});

test('ONE SLICE IS ONE BATCH, AND UNDO PUTS IT BACK WHOLE', async () => {
  const { k, sql, deps, ids } = await record();
  const before = value<{ rows: Entry[] }>(k.list({ register: 'organisations', limit: 100 })).rows.length;
  const done = understandBackfill(deps);

  const back = value<{ undone: number }>(undoBackfill(deps, done.ledger.batch!, 'p_owner'));
  assert.ok(back.undone > 0);
  assert.equal(lines(k).filter((l) => l.fields.party !== undefined && l.fields.party !== null).length, 0, 'every link is emptied');
  assert.equal(value<{ rows: Entry[] }>(k.list({ register: 'organisations', limit: 100 })).rows.length, before, 'every organisation it made is gone');
  assert.deepEqual(k.get(ids.fenwick!)?.fields.keys ?? [], [], 'and the key it gave one is taken back');

  value(undoBackfill(deps, done.runs.batch!, 'p_owner'));
  assert.ok(runs(k).every((r) => !r.fields.project), 'every run it placed is unplaced');

  value(undoBackfill(deps, done.services.batch!, 'p_owner'));
  assert.equal(k.get(ids.cert!)?.fields.thing ?? null, null);
  assert.equal(k.get(ids.placed!)?.fields.thing, ids.quarry, 'what it did not write is not touched');

  assert.deepEqual(value(undoBackfill(deps, done.ledger.batch!, 'p_owner')), { undone: 0, batch: null }, 'a second undo puts nothing back');
  sql.close();
});

test('WORDS THAT NAME NOBODY, AND A TRANSFER WITH A PERSON, NEVER MAKE AN ORGANISATION OR A QUESTION', async () => {
  /* As the owner's ledger has them: 11 lines saying "Unknown", 5 "Initial" on opening balances, "Internet Banking
     Transfer", and transfers with a person noted "Payee: <first name>.". */
  const { k, sql, deps, ids } = await record();
  const line = (what: string, more: Record<string, unknown> = {}) => value<Entry>(k.create('transactions', { what, amount: gbp(-500), ...more }, OWNER)).id;
  for (let i = 0; i < 2; i++) {
    line('Unknown');
    line('Initial', { amount: gbp(0) });
    line('Internet Banking Transfer');
    line('TT Payment');
    line('IPN inward transfer from RHEA ALBANY OKAFOR', { note: 'Payee: Rhea.' });
  }
  const toFenwick = line('IPN outward transfer to FENWICK CLOUD LTD', { note: 'Payee: Fenwick Cloud.' });
  const done = understandBackfill(deps);

  for (const name of ['Unknown', 'Initial', 'Internet Banking', 'Tt', 'Rhea']) assert.equal(orgNamed(k, name), null, name);
  assert.deepEqual(kinds(done.suggestions, 'organisation').map((s) => s.kind === 'organisation' && s.name), ['Lowry St Studios']);
  assert.equal(partyOf(k, toFenwick), ids.fenwick, 'a transfer to an organisation the record holds is still linked to it');
  sql.close();
});

test('A SERVICE NAMED FOR ITS PROJECT’S DOMAIN IS LINKED BY THE LETTERS OF THE NAME', async () => {
  const { k, sql, deps } = await record();
  const wren = value<Entry>(k.create('things', { name: 'Wrenfield' }, OWNER)).id;
  const domain = value<Entry>(k.create('services', { name: 'wren.field', provider: 'Spaceship' }, OWNER)).id;
  understandBackfill(deps);
  assert.equal(k.get(domain)?.fields.thing, wren);
  sql.close();
});

test('UNDO LEAVES A RUN THAT WAS MOVED SINCE WHERE IT IS, and its placement is a line saying project from and to', async () => {
  const { k, sql, deps, ids } = await record();
  const done = understandBackfill(deps);
  const quarry = runs(k).find((r) => r.seq === 1)!;
  assert.equal(quarry.fields.project, k.nameOf(ids.quarry!));
  /* THE WALK'S PLACEMENT NAMES ITS FIELD, so the server's own undo (`undo.ts`) can put it back as any other edit. */
  const line = sql.one<{ field: string | null; to_v: string | null }>("SELECT field, to_v FROM event WHERE target = ? AND batch = ? AND kind = 'edit'", `entry:${quarry.id}`, done.runs.batch!);
  assert.equal(line?.field, 'project');
  value(k.update('session', quarry.id, { next: 'Ship the fix' }, { actor: 'p_owner', version: quarry.version, stamp: { project: k.nameOf(ids.lantern!) } }));
  value(undoBackfill(deps, done.runs.batch!, 'p_owner'));
  assert.equal(k.get(quarry.id)?.fields.project, k.nameOf(ids.lantern!), 'the run somebody moved keeps where they put it');
  assert.equal(runs(k).filter((r) => r.fields.project).length, 1, 'every other run is unplaced');
  sql.close();
});

test('A DRY WALK WRITES NOTHING, and answers the counts and its first writes in names', async () => {
  const { k, sql, ids } = await record();
  const events = (): number => sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM event')?.n ?? 0;
  const before = events();
  const dry = k.backfill({ dry: true });
  assert.equal(events(), before, 'not one line written');
  assert.equal(dry.dry, true);
  assert.equal(partyOf(k, ids.fenwickLine!), null, 'the line is still nobody’s');
  assert.ok(dry.ledger.wrote > 0 && dry.runs.wrote > 0, 'the counts are the walk’s');
  assert.deepEqual([dry.ledger.batch, dry.runs.batch, dry.services.batch], [null, null, null], 'a batch rolled back names nothing');
  assert.ok((dry.planned ?? []).length > 0 && (dry.planned ?? []).length <= 10);
  const said = JSON.stringify(dry.planned);
  for (const id of Object.values(ids)) assert.ok(!said.includes(id), 'a row is named, never its id');
  assert.ok(!said.includes('bank:'), 'an identity key is never said');
  assert.ok((dry.planned ?? []).some((p) => p.list === 'Transactions' && typeof p.row === 'string' && p.fields.party === 'Bridge St Coffee'), said);
  assert.ok((dry.planned ?? []).some((p) => p.list === 'Organisations' && p.row === null && p.fields.name === 'Bridge St Coffee'), said);
  /* And the walk itself, run after, writes what the dry one said. */
  const real = k.backfill();
  assert.deepEqual([real.ledger.wrote, real.runs.wrote, real.services.wrote], [dry.ledger.wrote, dry.runs.wrote, dry.services.wrote]);
  sql.close();
});

test('A PAYEE IS NAMED AS A PERSON WOULD WRITE IT', () => {
  assert.equal(tidy('GEIDEA*BRIDGE ST COFFEE 0423 LONDON GB'), 'Bridge St Coffee');
  assert.equal(tidy('PELL & VINE'), 'Pell & Vine');
  assert.equal(tidy('Fenwick Cloud'), 'Fenwick Cloud');
});
