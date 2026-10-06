/**
 * Organisations under the same trust as people (research-audit-21 H1, H2, M9, M10, M12), and the organisations the record
 * asks about on its own (research-understanding-judge change 3).
 *
 * TEXT ANYBODY COULD HAVE WRITTEN NEVER CARRIES A DOMAIN OR A KEY ONTO AN ORGANISATION ALREADY HELD. A mail, a bank text
 * or a commit naming one writes its dated line, and what it would have added is one question. A key is never believed
 * outright, whatever its source says.
 *
 * NOTHING IS MADE ON ITS OWN. Two people the record vouches for at a domain nobody holds are one question, "Add Acme?";
 * two organisations whose names fold to the same words are one question per pair.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Entry, type Kernel, type Met, type WriteContext } from '../src/index.ts';
import { domainOrgName, trustOf } from '../src/people.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 7, 12);
const DAY = '2026-10-07';

const PROJECTS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: { id: 'things', name: 'Projects', title: 'name', scopes: { repos: 'repos' }, fields: [{ id: 'name', type: 'text', required: true }, { id: 'repos', type: 'list', of: 'text' }] },
};

const ORGS: Declaration = {
  id: 'register.organisations',
  kind: 'register',
  body: {
    id: 'organisations',
    name: 'Organisations',
    title: 'name',
    org: { name: 'name', keys: 'keys', kind: 'kind', domain: 'domain', merged_into: 'merged_into', met: 'met', projects: 'projects' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'kind', type: 'enum', values: ['company', 'client', 'vendor', 'merchant', 'bank', 'other'] },
      { id: 'domain', type: 'text' },
      { id: 'keys', type: 'list', of: 'text' },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'projects', type: 'list', of: 'ref', to: 'things' },
      { id: 'merged_into', type: 'ref', to: 'organisations' },
    ],
  },
};

const PEOPLE: Declaration = {
  id: 'register.people',
  kind: 'register',
  body: {
    id: 'people',
    name: 'People',
    title: 'name',
    meets: { name: 'name', email: 'email', handles: 'handles', projects: 'projects', met: 'met', merged_into: 'merged_into', keys: 'keys', aliases: 'aliases', org: 'org', self: 'self' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'email', type: 'email', unique: true, index: true },
      { id: 'handles', type: 'list', of: 'text' },
      { id: 'keys', type: 'list', of: 'text' },
      { id: 'aliases', type: 'list', of: 'text' },
      { id: 'self', type: 'bool' },
      { id: 'org', type: 'ref', to: 'organisations' },
      { id: 'projects', type: 'list', of: 'ref', to: 'things' },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'people' },
    ],
  },
};

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const OWNER: WriteContext = { actor: 'p_owner' };
const AGENT: WriteContext = { actor: 'p_owner', principal: { kind: 'token', token: 't_1' }, session: { client_id: 'cc-1', host: 'h', repo: 'braindog' } };

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([PROJECTS, ORGS, PEOPLE]));
  value(k.create('things', { name: 'BrainDog', repos: ['braindog'] }, OWNER));
  return { k, sql };
}

const open = (sql: NodeSql): string[] => sql.all<{ id: string }>("SELECT id FROM suggestion WHERE status = 'open' ORDER BY rowid").map((r) => r.id);
const accept = (k: Kernel, id: string) => value(k.decide(id, { decide: { option: 'accept', reason: 'yes' } }, 'p_owner'));

/* ── H2: a key is never believed outright ─────────────────────────────── */

test('A KEY IS HELD TO A COMMIT’S WORD WHATEVER ITS SOURCE SAYS, and a run relaying a commit or a git log is not believed at all', () => {
  /* A person at her keyboard, a note and the session's own run, as the record's own: believed. */
  assert.equal(trustOf('session in braindog', undefined, false, false), 'trusted');
  assert.equal(trustOf('a note about the launch', undefined, false, true), 'trusted');
  /* The same from a key is a commit's word: it folds only into somebody met in commits alone, and carries nothing. */
  assert.equal(trustOf('session in braindog', undefined, false, false, true), 'commit');
  assert.equal(trustOf('a note about the launch', undefined, false, false, true), 'commit');
  /* And never more than text anybody wrote when it says so. */
  assert.equal(trustOf('mail from evil.test', undefined, false, false, true), 'untrusted');
  assert.equal(trustOf('session in braindog', undefined, true, false, true), 'untrusted');
  for (const relayed of ['session reading a commit', 'a run reading the git log', 'session in braindog, the author of 4464966', 'run on co-authored lines', 'session reading the logs'])
    assert.equal(trustOf(relayed, undefined, false, false), 'untrusted', relayed);
  /* A commit is a commit, as ever. */
  assert.equal(trustOf('commit 4464966 in braindog', undefined, false, false), 'commit');
});

test(
  'A KEY SAYING "session in braindog" NEVER FOLDS A FORGED AUTHOR INTO A PERSON THE OWNER TYPED, and carries nothing onto them',
  async () => {
    const { k, sql } = await record();
    const real = value<Entry>(k.create('people', { name: 'Rohan Mehta', email: 'rohanmehta@encore.example' }, OWNER));
    const met = value<Met>(k.meet({ name: 'Rohan Mehta', email: 'rohanmehta@evil.test', source: 'session in braindog' }, AGENT));
    assert.notEqual(met.matched_by, 'strong', 'a key folded a forged author into the real person');
    assert.deepEqual(k.get(met.row!.id)!.fields.met, [`${DAY} · an agent said: session in braindog`]);
    const hit = value<Met>(k.meet({ email: 'rohanmehta@encore.example', handle: 'github:attacker', source: 'session in braindog' }, AGENT));
    assert.equal(hit.row?.id, real.id);
    assert.equal(k.get(real.id)!.fields.handles, undefined, 'a key carried a handle onto the real person');
    sql.close();
  },
);

/* ── H1: an organisation already held ─────────────────────────────────── */

test('A MAIL NAMING AN ORGANISATION ALREADY HELD WRITES ITS LINE AND NOTHING ELSE, and the new domain is one question', async () => {
  const { k, sql } = await record();
  const stripe = value<Entry>(k.create('organisations', { name: 'Stripe', keys: ['bank:stripe'] }, OWNER));
  const met = value<Met>(k.meet({ kind: 'organisation', name: 'Stripe', domain: 'evil.test', source: 'mail from evil.test' }, AGENT));
  assert.equal(met.row?.id, stripe.id);
  const row = k.get(stripe.id)!;
  assert.equal(row.fields.domain, undefined, 'a mailed domain was carried onto the real organisation');
  assert.deepEqual(row.fields.keys, ['bank:stripe']);
  assert.deepEqual(row.fields.met, [`${DAY} · mail from evil.test`]);
  assert.equal(sql.one("SELECT 1 AS n FROM entity_key WHERE key = 'domain:evil.test'"), undefined);
  assert.ok(met.question);
  const question = k.question(met.question) ?? '';
  assert.equal(question, 'Is mail from evil.test the Stripe you already know? Yes files mail from evil.test under Stripe.');
  assert.doesNotMatch(question, /organisations#|@/u);

  /* Asked once: the same mail again opens nothing, and a no is never asked again. */
  assert.equal(value<Met>(k.meet({ kind: 'organisation', name: 'Stripe', domain: 'evil.test', source: 'mail from evil.test' }, AGENT)).question, undefined);
  assert.equal(open(sql).length, 1);
  value(k.decide(met.question, { decide: { option: 'reject', reason: 'not theirs' } }, 'p_owner'));
  assert.equal(value<Met>(k.meet({ kind: 'organisation', name: 'Stripe', domain: 'evil.test', source: 'mail from evil.test' }, AGENT)).question, undefined);
  assert.equal(sql.one("SELECT 1 AS n FROM entity_key WHERE key = 'domain:evil.test'"), undefined);
  sql.close();
});

test('A PERSON MAILED FROM A FORGED COMPANY NEVER MOVES THE COMPANY: the organisation they name gains only its line', async () => {
  const { k, sql } = await record();
  const stripe = value<Entry>(k.create('organisations', { name: 'Stripe' }, OWNER));
  const pat = value<Met>(k.meet({ name: 'Pat Doe', email: 'pat@evil.test', org: 'Stripe', domain: 'evil.test', source: 'mail from evil.test' }, AGENT));
  const row = k.get(stripe.id)!;
  assert.equal(row.fields.domain, undefined, 'a person’s mail gave the real organisation its domain');
  assert.equal(sql.one("SELECT 1 AS n FROM entity_key WHERE key = 'domain:evil.test'"), undefined);
  assert.equal((row.fields.met as string[]).length, 1);
  /* Nor is whoever mailed one of its people, and nor is a commit author who says so. */
  assert.equal(k.get(pat.row!.id)!.fields.org, undefined, 'a mail saying "Stripe" put its sender in the real Stripe');
  const sam = value<Met>(k.meet({ name: 'Sam Roe', email: 'sam@evil.test', org: 'Stripe', where: 'commit 1 in braindog' }, AGENT));
  assert.equal(k.get(sam.row!.id)!.fields.org, undefined, 'a commit saying "Stripe" put its author in the real Stripe');
  /* The domain their own address is at still says, once Stripe holds it. */
  value(k.update('organisations', stripe.id, { domain: 'stripe.example' }, OWNER));
  const lee = value<Met>(k.meet({ name: 'Lee Park', email: 'lee@stripe.example', org: 'Stripe', where: 'commit 2 in braindog' }, AGENT));
  assert.equal(k.get(lee.row!.id)!.fields.org, stripe.id);
  sql.close();
});

test('A COMMIT NAMING AN ORGANISATION IS ASKED ABOUT TOO, and accepting gives it the domain, so its mail is filed there', async () => {
  const { k, sql } = await record();
  const acme = value<Entry>(k.create('organisations', { name: 'Acme Labs' }, OWNER));
  const met = value<Met>(k.meet({ kind: 'organisation', name: 'Acme Labs LLC', domain: 'acmelabs.example', where: 'commit 1 in braindog' }, AGENT));
  assert.equal(met.row?.id, acme.id);
  assert.equal(k.get(acme.id)!.fields.domain, undefined);
  /* A later line on the organisation keeps the question one he can still accept. */
  value(k.meet({ kind: 'organisation', name: 'Acme Labs', where: 'commit 2 in braindog' }, AGENT));
  assert.match(k.question(met.question!) ?? '', /^Is mail from acmelabs\.example the Acme Labs you already know\? /u);
  accept(k, met.question!);
  assert.equal(k.get(acme.id)!.fields.domain, 'acmelabs.example');
  assert.equal(value<Met>(k.meet({ email: 'billing@acmelabs.example', source: 'mail from acmelabs.example' }, AGENT)).row?.id, acme.id);
  sql.close();
});

test('A BANK TEXT MATCHED BY ITS NAME ASKS NOTHING FOR THE KEY ITS NAME SPELLS, and one for a key the name does not', async () => {
  const { k, sql } = await record();
  const chill = value<Met>(k.meet({ kind: 'organisation', name: 'Chillout', keys: ['bank:Chillout'], source: 'bank text' }, OWNER));
  /* The legal ending folds, so the name files it there anyway: nothing to ask. */
  const named = value<Met>(k.meet({ kind: 'organisation', name: 'Chillout LLC', keys: ['bank:Chillout LLC'], source: 'bank text' }, OWNER));
  assert.equal(named.row?.id, chill.row?.id);
  assert.equal(named.question, undefined);
  /* A payee key that is not the name's is somebody's say-so about where that payee's money goes. */
  const other = value<Met>(k.meet({ kind: 'organisation', name: 'Chillout', keys: ['bank:FAWRY*SOMEWHERE ELSE'], source: 'bank text' }, OWNER));
  assert.equal(other.row?.id, chill.row?.id);
  assert.match(k.question(other.question!) ?? '', /Yes files payments written that way under Chillout\./u);
  assert.deepEqual(k.get(chill.row!.id)!.fields.keys, ['bank:chillout']);
  sql.close();
});

test('A MACHINE THAT SIGNED A COMMIT MAKES NO ORGANISATION, and claims no domain', async () => {
  const { k, sql } = await record();
  const met = value<Met>(k.meet({ name: 'Jenkins', email: 'jenkins@acme.example', where: 'commit 1 in braindog' }, AGENT));
  assert.equal(met.row, null);
  assert.equal(k.count('organisations'), 0);
  assert.equal(sql.one("SELECT 1 AS n FROM entity_key WHERE key = 'domain:acme.example'"), undefined);
  sql.close();
});

/* ── change 3: organisations from mail domains ────────────────────────── */

test('TWO PEOPLE AT A DOMAIN NOBODY HOLDS ARE ONE QUESTION, "Add Acme?", whose yes makes it', async () => {
  const { k, sql } = await record();
  value(k.meet({ name: 'Ada Lovelace', email: 'ada@acme.example', where: 'commit 1 in braindog' }, AGENT));
  assert.deepEqual(open(sql), [], 'one person at a domain is not a company');
  /* The same person again, under another row of her name, is still one. */
  value(k.meet({ name: 'Ada Lovelace', email: 'a.lovelace@acme.example', where: 'commit 2 in braindog' }, AGENT));
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM suggestion WHERE body LIKE '%acme.example%' AND body LIKE '%\"join\"%'")?.n, 0);
  /* Mail vouches for nobody. */
  value(k.meet({ name: 'Eve Mallory', email: 'eve@acme.example', source: 'mail from acme.example' }, AGENT));
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM suggestion WHERE body LIKE '%\"join\"%'")?.n, 0);

  value(k.meet({ name: 'Grace Hopper', email: 'grace@acme.example', where: 'commit 3 in braindog' }, AGENT));
  const asked = sql.all<{ id: string }>("SELECT id FROM suggestion WHERE body LIKE '%\"join\"%'");
  assert.equal(asked.length, 1);
  const question = k.question(asked[0]!.id) ?? '';
  assert.match(question, /^Add Acme\? Ada Lovelace and Grace Hopper have an address at acme\.example\. Yes adds Acme and puts them in it\.$/u);
  assert.equal(k.count('organisations'), 0, 'an organisation was made without asking');

  /* Asked once, however many more arrive. */
  value(k.meet({ name: 'Linus Torvalds', email: 'linus@acme.example', where: 'commit 4 in braindog' }, AGENT));
  assert.equal(sql.all("SELECT id FROM suggestion WHERE body LIKE '%\"join\"%'").length, 1);

  accept(k, asked[0]!.id);
  const acme = value<Met>(k.meet({ kind: 'organisation', domain: 'acme.example', where: 'a note' }, OWNER));
  assert.equal(acme.row?.name, 'Acme');
  /* A later commit by one of them puts them in it. */
  const grace = value<Met>(k.meet({ email: 'grace@acme.example', where: 'commit 5 in braindog' }, AGENT));
  assert.equal(k.get(grace.row!.id)!.fields.org, acme.row!.id);
  sql.close();
});

test('NO QUESTION FOR A PUBLIC MAILBOX, OR FOR A DOMAIN AN ORGANISATION HOLDS; one kept under that name is offered the domain', async () => {
  const { k, sql } = await record();
  value(k.meet({ name: 'Ada Lovelace', email: 'ada.lovelace@gmail.com', where: 'commit 1 in braindog' }, AGENT));
  value(k.meet({ name: 'Grace Hopper', email: 'grace.hopper@gmail.com', where: 'commit 2 in braindog' }, AGENT));
  assert.deepEqual(open(sql), []);

  value(k.create('organisations', { name: 'Initech', domain: 'initech.example' }, OWNER));
  value(k.meet({ name: 'Peter Gibbons', email: 'peter@initech.example', where: 'commit 3 in braindog' }, AGENT));
  value(k.meet({ name: 'Milton Waddams', email: 'milton@initech.example', where: 'commit 4 in braindog' }, AGENT));
  assert.deepEqual(open(sql), []);

  const tidepool = value<Entry>(k.create('organisations', { name: 'Tidepool' }, OWNER));
  value(k.meet({ name: 'Bob Ross', email: 'bob@tidepool.example', where: 'commit 5 in braindog' }, AGENT));
  value(k.meet({ name: 'Joy Ross', email: 'joy@tidepool.example', where: 'commit 6 in braindog' }, AGENT));
  const [offer] = open(sql);
  assert.match(k.question(offer!) ?? '', /^Is mail from tidepool\.example from Tidepool\? Bob Ross and Joy Ross have an address there\./u);
  accept(k, offer!);
  assert.equal(k.get(tidepool.id)!.fields.domain, 'tidepool.example');
  assert.equal(k.count('organisations'), 2);
  sql.close();
});

test('THE NAME COMES FROM THE REPOSITORY’S OWNER WHEN IT AND THE DOMAIN AGREE, and from the domain otherwise', () => {
  assert.equal(domainOrgName('brightloomit.example', 'https://github.com/Brightloom-Infotech/Fanline'), 'Brightloom Infotech');
  assert.equal(domainOrgName('brightloomit.example', 'github.com/BrightloomInfotech/Fanline'), 'Brightloom Infotech');
  assert.equal(domainOrgName('brightloomit.example', 'github.com/kasdev/website'), 'Brightloomit');
  assert.equal(domainOrgName('kestrel-uni.example', null), 'Kestrel Uni');
  assert.equal(domainOrgName('lumacraft.example', 'github.com/lumacraft-ai/lumacraft'), 'Lumacraft');
});

/* ── doubtful organisation pairs ──────────────────────────────────────── */

test('TWO ORGANISATIONS WHOSE NAMES FOLD TO THE SAME WORDS ARE ONE QUESTION, never a merge, and Yes folds them into the older', async () => {
  const { k, sql } = await record();
  const first = value<Met>(k.meet({ kind: 'organisation', name: 'SOWBELL.COM', keys: ['bank:SOWBELL.COM'], source: 'bank text' }, OWNER));
  const second = value<Met>(k.meet({ kind: 'organisation', name: 'Sowbell LLC', keys: ['bank:Sowbell LLC'], source: 'bank text' }, OWNER));
  assert.equal(second.created, true);
  assert.ok(second.question);
  assert.equal(k.count('organisations'), 2, 'two organisations were merged without asking');
  assert.equal(k.question(second.question), 'Are SOWBELL.COM and Sowbell LLC one organisation? Yes keeps SOWBELL.COM and files everything Sowbell LLC was met by under it.');

  /* Met again, either one: the question is kept current, and nothing more is asked. */
  value(k.meet({ kind: 'organisation', name: 'Sowbell LLC', keys: ['bank:Sowbell LLC'], source: 'bank text' }, OWNER));
  value(k.meet({ kind: 'organisation', name: 'SOWBELL.COM', keys: ['bank:SOWBELL.COM'], source: 'bank text' }, OWNER));
  assert.deepEqual(open(sql), [second.question]);

  accept(k, second.question!);
  assert.equal(k.count('organisations'), 1);
  const kept = k.get(first.row!.id)!;
  assert.equal((kept.fields.keys as string[]).length, 2);
  assert.ok((kept.fields.met as string[]).includes(`${DAY} · bank text`));
  /* And the next of either spelling is the one kept. */
  assert.equal(value<Met>(k.meet({ kind: 'organisation', keys: ['bank:Sowbell LLC'], source: 'bank text' }, OWNER)).row?.id, first.row?.id);
  sql.close();
});

test('A PAIR HE SAID NO TO IS NEVER ASKED AGAIN, and names that only share a word are not asked about', async () => {
  const { k, sql } = await record();
  value(k.meet({ kind: 'organisation', name: 'Tarnvale Oy', keys: ['bank:Tarnvale Oy'], source: 'bank text' }, OWNER));
  const asked = value<Met>(k.meet({ kind: 'organisation', name: 'TARNVALE', keys: ['bank:TARNVALE'], source: 'bank text' }, OWNER));
  assert.ok(asked.question);
  value(k.decide(asked.question!, { decide: { option: 'reject', reason: 'two companies' } }, 'p_owner'));
  value(k.meet({ kind: 'organisation', name: 'Tarnvale', keys: ['bank:TARNVALE'], source: 'bank text' }, OWNER));
  assert.deepEqual(open(sql), []);

  value(k.meet({ kind: 'organisation', name: 'Nile Market', keys: ['bank:Nile Market'], source: 'bank text' }, OWNER));
  assert.equal(value<Met>(k.meet({ kind: 'organisation', name: 'Nile Market Prime', keys: ['bank:Nile Market Prime'], source: 'bank text' }, OWNER)).question, undefined);
  assert.deepEqual(open(sql), []);
  sql.close();
});

test(
  'ACCEPTING "Add Acme?" PUTS THE PEOPLE IT NAMED IN IT AT ONCE, not only whoever is met next',
  async () => {
    const { k, sql } = await record();
    const ada = value<Met>(k.meet({ name: 'Ada Lovelace', email: 'ada@acme.example', where: 'commit 1 in braindog' }, AGENT));
    const grace = value<Met>(k.meet({ name: 'Grace Hopper', email: 'grace@acme.example', where: 'commit 2 in braindog' }, AGENT));
    const [asked] = open(sql);
    accept(k, asked!);
    const acme = sql.one<{ id: string }>("SELECT id FROM entry WHERE register = 'organisations' AND deleted_at IS NULL")!.id;
    assert.equal(k.get(ada.row!.id)!.fields.org, acme);
    assert.equal(k.get(grace.row!.id)!.fields.org, acme);
    sql.close();
  },
);

test('THE DOMAIN IS SAID PLAINLY, and what a sender called itself comes after it, never in its place (research-audit-23 M5)', async () => {
  const { k, sql } = await record();
  value(k.create('organisations', { name: 'Stripe', keys: ['bank:stripe'] }, OWNER));
  /* Found by its payee key, under a name the sender chose and a source that says nothing of the domain. */
  const met = value<Met>(k.meet({ kind: 'organisation', name: 'Stripe Billing', keys: ['bank:STRIPE'], domain: 'evil.test', source: 'a calendar invite' }, AGENT));
  assert.ok(met.question);
  assert.equal(k.question(met.question) ?? '', 'Is mail from evil.test the Stripe you already know? Yes files mail from evil.test under Stripe. It was met as Stripe Billing.');
  sql.close();

  /* An address at a public mailbox is that one address: a yes never files all of gmail.com's mail. */
  const two = await record();
  value(two.k.create('organisations', { name: 'Stripe', domain: 'stripe.example' }, OWNER));
  const mailed = value<Met>(two.k.meet({ kind: 'organisation', name: 'Stripe', email: 'stripe.billing@gmail.com', source: 'mail from gmail.com' }, AGENT));
  assert.equal(two.k.question(mailed.question!), 'Is mail from an address at gmail.com the Stripe you already know? Yes files that address under Stripe.');
  two.sql.close();
});

test(
  'A YES ON "Add Acme?" LINKS ONLY WHO IT NAMED: nobody who came later, nobody only mail vouches for, no subdomain address (research-audit-23 M4)',
  async () => {
    const { k, sql } = await record();
    const ada = value<Met>(k.meet({ name: 'Ada Lovelace', email: 'ada@acme.example', where: 'commit 1 in braindog' }, AGENT));
    /* At a part of the domain: its own host, so neither counted nor named. */
    const omar = value<Met>(k.meet({ name: 'Omar Said', email: 'omar@mail.acme.example', where: 'commit 2 in braindog' }, AGENT));
    assert.deepEqual(open(sql), [], 'a subdomain address counted as a second person at the domain');
    /* Mail vouches for nobody. */
    const eve = value<Met>(k.meet({ name: 'Eve Mallory', email: 'eve@acme.example', source: 'mail from acme.example' }, AGENT));
    const grace = value<Met>(k.meet({ name: 'Grace Hopper', email: 'grace@acme.example', where: 'commit 3 in braindog' }, AGENT));
    const [asked] = open(sql);
    assert.equal(k.question(asked!), 'Add Acme? Ada Lovelace and Grace Hopper have an address at acme.example. Yes adds Acme and puts them in it.');
    /* Arrived after it was asked. */
    const linus = value<Met>(k.meet({ name: 'Linus Torvalds', email: 'linus@acme.example', where: 'commit 4 in braindog' }, AGENT));

    accept(k, asked!);
    const acme = sql.one<{ id: string }>("SELECT id FROM entry WHERE register = 'organisations' AND deleted_at IS NULL")!.id;
    assert.equal(k.get(ada.row!.id)!.fields.org, acme);
    assert.equal(k.get(grace.row!.id)!.fields.org, acme);
    assert.equal(k.get(linus.row!.id)!.fields.org, undefined, 'somebody who arrived after the question was put in it');
    assert.equal(k.get(eve.row!.id)!.fields.org, undefined, 'somebody only mail vouches for was put in it');
    assert.equal(k.get(omar.row!.id)!.fields.org, undefined, 'a subdomain address was put in it');
    sql.close();
  },
);
