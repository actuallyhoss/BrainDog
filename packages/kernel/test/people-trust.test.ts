/**
 * Who may say who somebody is (research-audit-17 H1, M1, M2, M4), and asking once per cluster.
 *
 * TEXT ANYBODY COULD HAVE WRITTEN IS NOT EVIDENCE. A mail, a bank text or an import never folds two people, never carries
 * a key onto somebody known, and never folds an address into a real person: a key match gains its line, a sender like
 * nobody known is a person of their own, and one who looks like somebody known is a mention and one question.
 *
 * THE STRONG RULES ARE A NAME AND A HANDLE, never a name and a company. The same handle is read past its dots and the
 * number on its end. Everything weaker is one question per cluster, kept current while the work goes on, and the
 * record's own person is the one a cluster is folded into.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Entry, type Kernel, type Met, type ResolveJob, type WriteContext } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 6, 12);
const DAY = '2026-10-06';

const PROJECTS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: { id: 'things', name: 'Projects', title: 'name', scopes: { repos: 'repos' }, fields: [{ id: 'name', type: 'text', required: true }, { id: 'repos', type: 'list', of: 'text' }] },
};

/** People with every part the understanding layer reads: keys, the other names, and which one is the record's own. */
const PEOPLE: Declaration = {
  id: 'register.people',
  kind: 'register',
  body: {
    id: 'people',
    name: 'People',
    title: 'name',
    meets: { name: 'name', email: 'email', handles: 'handles', projects: 'projects', met: 'met', merged_into: 'merged_into', keys: 'keys', aliases: 'aliases', self: 'self' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'email', type: 'email', unique: true, index: true },
      { id: 'handles', type: 'list', of: 'text' },
      { id: 'keys', type: 'list', of: 'text' },
      { id: 'aliases', type: 'list', of: 'text' },
      { id: 'self', type: 'bool' },
      { id: 'note', type: 'text' },
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
  value(await k.install([PROJECTS, PEOPLE]));
  value(k.create('things', { name: 'BrainDog', repos: ['braindog'] }, OWNER));
  return { k, sql };
}

const questions = (sql: NodeSql): number => Number(sql.one<{ n: number }>('SELECT count(*) AS n FROM suggestion')?.n);
const open = (sql: NodeSql): string[] => sql.all<{ id: string }>("SELECT id FROM suggestion WHERE status = 'open' ORDER BY rowid").map((r) => r.id);

/* ── H1: text anybody could have written ──────────────────────────────── */

test('A FORGED SENDER WITH A KNOWN NAME MAKES NOBODY AND FOLDS NOTHING: a mention, and one question, asked once', async () => {
  const { k, sql } = await record();
  const real = value<Entry>(k.create('people', { name: 'Rohan Mehta', email: 'rohanmehta@encore.example' }, OWNER));
  const forged = { email: '"Rohan Mehta" <rohanmehta@evil.test>', where: 'mail: Re: the invoice', source: 'mail from evil.test' };

  const met = value<Met>(k.meet(forged, AGENT));
  assert.equal(met.row, null, 'a forged sender made a row');
  assert.equal(met.mention, true);
  assert.equal(met.matched_by, 'none');
  assert.equal(k.count('people'), 1);
  const kept = k.get(real.id)!;
  assert.equal(kept.fields.keys, undefined, 'the forged address was carried onto the real person');
  assert.equal(kept.fields.merged_into, undefined);

  /* One question, in names, offering the address and nothing else. */
  assert.ok(met.question);
  const question = k.question(met.question) ?? '';
  assert.match(question, /^Is the Rohan Mehta met in mail from evil\.test the Rohan Mehta you already know \(an address at encore\.xyz\)\? Yes adds the new address to Rohan Mehta\./);
  assert.doesNotMatch(question, /@|people#/);
  /* The sighting is kept, by its source and never by the mail's subject. */
  assert.deepEqual(sql.all<{ source: string }>("SELECT source FROM entity_mention WHERE kind = 'person'").map((m) => m.source), ['mail from evil.test']);

  /* Mailed again, and again from another forged address: no second question while the first waits. */
  assert.equal(value<Met>(k.meet(forged, AGENT)).question, undefined);
  assert.equal(value<Met>(k.meet({ ...forged, email: '"Rohan Mehta" <rohan.mehta@evil2.test>' }, AGENT)).question, undefined);
  assert.equal(questions(sql), 1);

  /* He says no: the address is never offered again, and still nobody is made. */
  value(k.decide(met.question, { decide: { option: 'reject', reason: 'not him' } }, 'p_owner'));
  assert.equal(value<Met>(k.meet(forged, AGENT)).question, undefined);
  assert.equal(k.count('people'), 1);
  assert.equal(questions(sql), 1);
  sql.close();
});

test('AN OFFER KEPT CURRENT STILL GIVES A PERSON WITH NO ADDRESS THE ADDRESS ITSELF, not a key beside an empty field', async () => {
  const { k, sql } = await record();
  const ada = value<Entry>(k.create('people', { name: 'Ada Lovelace', handles: ['github:adal'] }, OWNER));
  const met = value<Met>(k.meet({ name: 'Ada Lovelace', email: 'countess@analytical.org', source: 'mail from analytical.org' }, AGENT));
  value(k.meet({ handle: 'github:adal', where: 'commit 1 in braindog' }, AGENT));
  value(k.decide(met.question!, { decide: { option: 'accept', reason: 'her address' } }, 'p_owner'));
  assert.equal(k.get(ada.id)!.fields.email, 'countess@analytical.org');
  assert.equal(k.get(ada.id)!.fields.keys, undefined);
  sql.close();
});

test('ACCEPTING THE OFFER ADDS THE ADDRESS, and the next mail from it is that person', async () => {
  const { k, sql } = await record();
  const real = value<Entry>(k.create('people', { name: 'Ada Lovelace', email: 'ada@example.com' }, OWNER));
  const met = value<Met>(k.meet({ name: 'Ada Lovelace', email: 'countess@analytical.org', source: 'mail from analytical.org' }, AGENT));
  /* A later mail from her known address moves her row; the offer is kept current with it. */
  value(k.meet({ email: 'ada@example.com', source: 'mail from example.com' }, AGENT));
  value(k.decide(met.question!, { decide: { option: 'accept', reason: 'her second address' } }, 'p_owner'));
  assert.deepEqual(k.get(real.id)!.fields.keys, ['email:countess@analytical.org']);
  assert.equal(value<Met>(k.meet({ email: 'countess@analytical.org', source: 'mail from analytical.org' }, AGENT)).row?.id, real.id);
  sql.close();
});

test('AN ARRIVAL MATCHED BY ITS KEY ADDS ITS LINE AND NOTHING ELSE: no handle, no name, no other name', async () => {
  const { k, sql } = await record();
  const ada = value<Entry>(k.create('people', { name: 'Ada Lovelace', email: 'ada@example.com' }, OWNER));
  const met = value<Met>(k.meet({ name: 'The Countess', email: 'ada@example.com', handle: 'github:attacker', where: 'mail from example.com' }, AGENT));
  assert.equal(met.matched_by, 'key');
  const row = k.get(ada.id)!;
  assert.deepEqual(row.fields.met, [`${DAY} · mail from example.com`]);
  assert.equal(row.fields.handles, undefined, 'a handle read from a mail was carried onto her');
  assert.equal(row.fields.aliases, undefined, 'a name read from a mail was kept as hers');
  /* The handle is still nobody's, so the next meeting by it is not her. */
  assert.equal(sql.one("SELECT 1 AS n FROM entity_key WHERE key = 'github:attacker'"), undefined);

  /* Nor does a project or the day in touch move on a spoofed From (research-audit-21 M10). */
  assert.equal(row.fields.projects, undefined, 'a mail linked her to the run’s project');

  /* A commit by her address is hers, and still carries nothing (M9): anybody can sign one with her address. */
  value(k.meet({ name: 'The Countess', email: 'ada@example.com', handle: 'github:ada', where: 'commit 4464966 in braindog' }, AGENT));
  assert.equal(k.get(ada.id)!.fields.handles, undefined);
  assert.equal(k.get(ada.id)!.fields.aliases, undefined);

  /* The same meeting in a note is evidence, and she gains both. */
  value(k.meet({ name: 'The Countess', email: 'ada@example.com', handle: 'github:ada', where: 'a note about her' }, OWNER));
  assert.deepEqual(k.get(ada.id)!.fields.handles, ['github:ada']);
  assert.deepEqual(k.get(ada.id)!.fields.aliases, ['The Countess']);
  sql.close();
});

test('A SENDER LIKE NOBODY KNOWN IS A PERSON OF THEIR OWN, and a forged one who came first never takes in the real one', async () => {
  const { k, sql } = await record();
  const forged = value<Met>(k.meet({ email: '"Rohan Mehta" <rohanmehta@evil.test>', where: 'mail: hello', source: 'mail from evil.test' }, AGENT));
  assert.equal(forged.created, true);

  /* The real Rohan, in a commit: the same name and the same handle, and still asked, never folded. */
  const real = value<Met>(k.meet({ name: 'Rohan Mehta', email: 'rohanmehta@encore.example', where: 'commit 1 in encore' }, AGENT));
  assert.equal(real.matched_by, 'none');
  assert.equal(real.created, true);
  assert.ok(real.question, 'two people with one name and one handle were neither folded nor asked about');
  assert.equal(k.count('people'), 2);
  sql.close();
});

test('SAID TO BE UNTRUSTED, IT STAYS SO ON THE LINE: a forged sender met that way first still never takes in the real one', async () => {
  const { k, sql } = await record();
  const forged = value<Met>(k.meet({ email: '"Rohan Mehta" <rohanmehta@evil.test>', source: 'a run reading the inbox', untrusted: true }, AGENT));
  assert.equal(forged.created, true);
  assert.deepEqual(k.get(forged.row!.id)!.fields.met, [`${DAY} · arrived in a run reading the inbox`]);
  const real = value<Met>(k.meet({ name: 'Rohan Mehta', email: 'rohanmehta@encore.example', where: 'commit 1 in encore' }, AGENT));
  assert.equal(real.matched_by, 'none', 'the real person was folded into a sender nobody vouched for');
  assert.ok(real.question);
  assert.equal(k.count('people'), 2);
  sql.close();
});

test('A PERSON THE OWNER TYPED IS STILL HIS AFTER THEIR MAIL IS READ: the same name and handle in a note fold into them', async () => {
  const { k, sql } = await record();
  const typed = value<Entry>(k.create('people', { name: 'Rohan Mehta', email: 'rohanmehta@encore.example' }, OWNER));
  value(k.meet({ email: 'rohanmehta@encore.example', source: 'mail from encore.example' }, AGENT));
  const met = value<Met>(k.meet({ name: 'Rohan Mehta', email: 'rohan.mehta@gmail.com', where: 'a note about the launch' }, OWNER));
  assert.equal(met.matched_by, 'strong');
  assert.equal(met.row?.id, typed.id);
  assert.equal(k.count('people'), 1);
  sql.close();
});

/* ── audit 19 H1: a commit's author is whoever signed it ──────────────── */

test('A COMMIT BY AN ADDRESS NOBODY HOLDS NEVER FOLDS INTO A PERSON THE OWNER TYPED: a person of their own, and one question', async () => {
  const { k, sql } = await record();
  const real = value<Entry>(k.create('people', { name: 'Rohan Mehta', email: 'rohanmehta@encore.example' }, OWNER));
  const forged = { name: 'Rohan Mehta', email: 'rohanmehta@evil.test', where: 'commit 1 in encore' };

  const met = value<Met>(k.meet(forged, AGENT));
  assert.equal(met.matched_by, 'none', 'a forged author was folded into the real person');
  assert.equal(met.created, true);
  assert.ok(met.question, 'the lookalike was neither folded nor asked about');
  assert.equal(k.count('people'), 2);
  assert.equal(k.get(real.id)!.fields.keys, undefined, 'the forged address was carried onto the real person');
  assert.equal(k.get(real.id)!.fields.handles, undefined, 'the forged address was carried onto the real person');

  /* A second commit from it is a key match on the forged row, and still asks nothing new and folds nothing. */
  const again = value<Met>(k.meet({ ...forged, where: 'commit 2 in encore' }, AGENT));
  assert.equal(again.row?.id, met.row?.id);
  assert.equal(k.count('people'), 2);
  assert.equal(questions(sql), 1);
  sql.close();
});

test('TWO COMMITS BY ONE AUTHOR UNDER TWO ADDRESSES STILL FOLD, and the real person met later is not taken in by either', async () => {
  const { k, sql } = await record();
  const first = value<Met>(k.meet({ name: 'Lakshmi Vadlamudi', email: 'lakshmi.vadlamudi@brightloom.example', where: 'commit 1 in braindog' }, AGENT));
  const second = value<Met>(k.meet({ name: 'Lakshmi Vadlamudi', email: 'lakshmivadlamudi@gmail.com', where: 'commit 2 in braindog' }, AGENT));
  assert.equal(second.matched_by, 'strong');
  assert.equal(second.row?.id, first.row?.id);

  /* The owner types her in, and a note meets her under a third address: the note folds into the row he typed, and the
     commit-made row is not folded in a step later, since whoever pushed signed it. He is asked once instead. */
  const typed = value<Entry>(k.create('people', { name: 'Lakshmi Vadlamudi', email: 'lv@brightloom.example', handles: ['github:lakshmi-vadlamudi'] }, OWNER));
  const noted = value<Met>(k.meet({ name: 'Lakshmi Vadlamudi', email: 'lakshmivadlamudi@outlook.com', where: 'a note on the launch' }, OWNER));
  assert.equal(noted.matched_by, 'strong');
  assert.equal(noted.row?.id, typed.id);
  assert.equal(k.get(first.row!.id)!.fields.merged_into, undefined, 'a commit author was folded in on the real person’s next meeting');
  assert.ok(noted.question, 'the commit author beside her was not asked about');
  assert.equal(open(sql).length, 1);
  sql.close();
});

test('A FORGED COMMIT AUTHOR WHO THEN MAILS IN FROM THE SAME ADDRESS IS STILL ONLY A COMMIT AUTHOR, and never folds into the real person', async () => {
  const { k, sql } = await record();
  const real = value<Entry>(k.create('people', { name: 'Rohan Mehta', email: 'rohanmehta@encore.example' }, OWNER));
  const forged = value<Met>(k.meet({ name: 'Rohan Mehta', email: 'rohanmehta@evil.test', where: 'commit 1 in encore' }, AGENT));
  /* A mail from the forged address is a key match, and its line is one anybody could have written. */
  value(k.meet({ email: 'rohanmehta@evil.test', source: 'mail from evil.test' }, AGENT));
  const again = value<Met>(k.meet({ name: 'Rohan Mehta', email: 'rohanmehta@evil.test', where: 'commit 2 in encore' }, AGENT));
  assert.equal(again.row?.id, forged.row?.id);
  assert.equal(k.get(forged.row!.id)!.fields.merged_into, undefined, 'a mail line let the forged author fold into the real person');
  assert.equal(k.get(real.id)!.fields.keys, undefined);
  assert.equal(k.count('people'), 2);
  sql.close();
});

test('A COMMIT BY A KEY SOMEBODY HOLDS IS THEIRS, and carries no key, name or other name onto them (research-audit-21 M9)', async () => {
  const { k, sql } = await record();
  const ada = value<Entry>(k.create('people', { name: 'Ada Lovelace', email: 'ada@example.com' }, OWNER));
  const met = value<Met>(k.meet({ name: 'The Countess', email: 'ada@example.com', handle: 'github:ada', keys: ['email:countess@evil.test'], where: 'commit 1 in braindog' }, AGENT));
  assert.equal(met.matched_by, 'key');
  assert.equal(met.row?.id, ada.id);
  const row = k.get(ada.id)!;
  assert.deepEqual(row.fields.met, [`${DAY} · commit 1 in braindog`]);
  assert.deepEqual(row.fields.projects, [sql.one<{ id: string }>("SELECT id FROM entry WHERE register = 'things'")?.id], 'a commit by her key did not link her to its project');
  assert.equal(row.fields.handles, undefined);
  assert.equal(row.fields.keys, undefined);
  assert.equal(row.fields.aliases, undefined);
  /* So the next commit by the address it named is not hers. */
  assert.notEqual(value<Met>(k.meet({ email: 'countess@evil.test', where: 'commit 2 in braindog' }, AGENT)).row?.id, ada.id);
  sql.close();
});

/* ── audit 19 M1: believed only when the source is one that is ────────── */

test('EVERY SOURCE BUT A NOTE, A SESSION’S OWN RUN AND A COMMIT IS TEXT ANYBODY COULD HAVE WRITTEN, however it is worded', async () => {
  const { k, sql } = await record();
  const ada = value<Entry>(k.create('people', { name: 'Ada Lovelace', email: 'ada@example.com' }, OWNER));
  for (const where of ['issue 12 in braindog', 'a slack DM', 'a call with her', 'the calendar invite', 'a pasted transcript', 'a note from the inbox', 'a run reading her mail']) {
    const met = value<Met>(k.meet({ name: 'The Countess', email: 'ada@example.com', handle: `github:${where.replace(/\W/g, '')}`, where }, AGENT));
    assert.equal(met.row?.id, ada.id);
    assert.equal(k.get(ada.id)!.fields.handles, undefined, `${where} carried a handle onto her`);
    assert.equal(k.get(ada.id)!.fields.aliases, undefined, `${where} kept a name as hers`);
  }
  /* The line says what it was, so it never vouches for her later. */
  assert.ok((k.get(ada.id)!.fields.met as string[]).every((l) => l.includes(' · arrived in ')), 'a line read as believed');

  /* A forged lookalike from any of them makes nobody, as a mail's would. */
  const slack = value<Met>(k.meet({ name: 'Ada Lovelace', email: 'ada@evil.test', where: 'a slack DM' }, AGENT));
  assert.equal(slack.row, null);
  assert.equal(slack.mention, true);

  /* A note and the session's own run are believed. */
  value(k.meet({ email: 'ada@example.com', handle: 'github:ada', where: 'a note about the launch' }, OWNER));
  assert.deepEqual(k.get(ada.id)!.fields.handles, ['github:ada']);
  value(k.meet({ email: 'ada@example.com', handle: 'github:countess', where: 'session in braindog' }, OWNER));
  assert.deepEqual(k.get(ada.id)!.fields.handles, ['github:ada', 'github:countess']);
  sql.close();
});

test('UNTRUSTED IS SAID OR READ FROM THE SOURCE, and false never lifts a source that says so', async () => {
  const { k, sql } = await record();
  value(k.create('people', { name: 'Rohan Mehta', email: 'rohanmehta@encore.example' }, OWNER));
  for (const said of [
    { untrusted: true, where: 'a run reading the inbox' },
    { untrusted: false, source: 'bank text' },
    { source: 'import' },
  ]) {
    const met = value<Met>(k.meet({ name: 'Rohan Mehta', email: `rohanmehta@${Object.keys(said).join('')}.test`, ...said }, AGENT));
    assert.equal(met.row, null, `${JSON.stringify(said)} folded or made a person`);
  }
  assert.equal(k.count('people'), 1);
  const refused = k.meet({ name: 'Ada', email: 'ada@example.com', where: 'x', untrusted: 'yes' as never }, AGENT) as { ok: boolean; refusal?: { at?: string } };
  assert.equal(refused.ok, false);
  assert.equal(refused.refusal?.at, 'untrusted');
  sql.close();
});

/* ── M4: the strong rules ─────────────────────────────────────────────── */

test('TWO COLLEAGUES WITH ONE NAME AND ONE COMPANY ARE ASKED ABOUT, never folded', async () => {
  const { k, sql } = await record();
  value(k.create('people', { name: 'Ahmed Hassan', email: 'ahmed@encore.example' }, OWNER));
  const met = value<Met>(k.meet({ name: 'Ahmed Hassan', email: 'a.hassan@encore.example', where: 'commit 1 in encore' }, AGENT));
  assert.equal(met.matched_by, 'none');
  assert.ok(met.question);
  assert.equal(k.count('people'), 2);
  sql.close();
});

test('ONE HANDLE IS ONE HANDLE PAST ITS DOTS AND ITS NUMBER: the same name and handle fold on their own', async () => {
  const { k, sql } = await record();
  const first = value<Met>(k.meet({ name: 'Lakshmi Vadlamudi', email: 'lakshmi.vadlamudi@brightloom.example', where: 'commit 0 in braindog' }, AGENT)).row!;
  const met = value<Met>(k.meet({ name: 'Lakshmi Vadlamudi', email: 'lakshmivadlamudi24@gmail.com', where: 'commit 1 in braindog' }, AGENT));
  assert.equal(met.matched_by, 'strong');
  assert.equal(met.row?.id, first.id);
  /* And a private GitHub address whose login is that handle. */
  const login = value<Met>(k.meet({ name: 'Lakshmi Vadlamudi', email: '4412+lakshmi-vadlamudi@users.noreply.github.com', where: 'commit 2 in braindog' }, AGENT));
  assert.equal(login.matched_by, 'strong');
  assert.equal(k.count('people'), 1);
  assert.equal(questions(sql), 0);
  /* A handle too short to say who somebody is never folds, however alike the names. */
  value(k.create('people', { name: 'Sam Ortiz', email: 'sam@one.example' }, OWNER));
  assert.equal(value<Met>(k.meet({ name: 'Sam Ortiz', email: 'sam@two.example', where: 'commit 3 in braindog' }, AGENT)).matched_by, 'none');
  sql.close();
});

/* ── M2, M1: what is kept, and what a model reads ─────────────────────── */

test('THE SOURCE WINS OVER WHERE, CLIPPED, AND AN ADDRESS IS NEVER A NAME OR A LINE', async () => {
  const { k, sql } = await record();
  const long = `commit 4464966 in braindog, ${'which touched a great many files across the whole repository '.repeat(3)}`;
  const met = value<Met>(k.meet({ email: 'ada.l@example.com', where: 'the lease thread, from bob@x.example', source: long }, AGENT));
  const row = k.get(met.row!.id)!;
  assert.equal(row.fields.name, 'ada.l', 'a person met with no name was named by their whole address');
  const [line] = row.fields.met as string[];
  assert.ok(line!.length <= DAY.length + 3 + 80, `a met line of ${line!.length} characters`);
  assert.match(line!, /^2026-10-06 · commit 4464966 in braindog, which/u);
  assert.match(line!, /…$/u);

  const addressed = value<Met>(k.meet({ name: 'grace@navy.example', email: 'grace@navy.example', source: 'a call with grace@navy.example' }, AGENT));
  const grace = k.get(addressed.row!.id)!;
  assert.equal(grace.fields.name, 'grace');
  /* A call an agent relays is text anybody could have written (audit 19 M1), and its line says so. */
  assert.deepEqual(grace.fields.met, [`${DAY} · arrived in a call with navy.example`]);
  sql.close();
});

test('A MODEL IS HANDED NAMES AND PLACES, never an address, even one an older record kept', async () => {
  const { k, sql } = await record();
  value(k.create('people', { name: 'Sam Ortiz <sam@one.example>', email: 'sam@one.example', met: ['2026-09-01 · mail from sam@one.example', 'no day here'] }, OWNER));
  value(k.create('people', { name: 'Sam Ortiz', email: 'sortiz@two.example' }, OWNER));
  k.purge();
  const [job] = sql.all<{ payload: string }>("SELECT payload FROM outbox WHERE kind = 'infer.resolve'");
  assert.ok(job, 'no job was queued');
  const pairs = (JSON.parse(job.payload) as ResolveJob).pairs;
  assert.equal(pairs.length, 1);
  assert.doesNotMatch(JSON.stringify(pairs), /@/u, 'an address went to the model');
  const side = [pairs[0]!.a, pairs[0]!.b].find((s) => s.seen.length > 0)!;
  assert.deepEqual(side.seen, ['no day here', 'mail from one.example']);
  sql.close();
});

/* ── one question per cluster ─────────────────────────────────────────── */

test('ONE WHO MAY BE THE SAME PERSON JOINS THE QUESTION ALREADY ASKED, and Yes folds them all into the oldest', async () => {
  const { k, sql } = await record();
  const kept = value<Entry>(k.create('people', { name: 'Devraj Banerji', note: 'Founder at Lumacraft' }, OWNER));
  const one = value<Met>(k.meet({ name: 'Devraj Banerji', email: 'devraj@fanline.example', where: 'commit 1 in fanline' }, AGENT));
  const two = value<Met>(k.meet({ name: 'Devraj Banerji', email: 'devrajbanerji@gmail.com', where: 'commit 2 in fanline' }, AGENT));
  assert.equal(two.question, one.question, 'a second question was opened about the same person');
  /* A third address strong-folds into the second row, and a fourth meeting by key moves it; the question keeps up. */
  value(k.meet({ name: 'Devraj Banerji', email: 'devraj@lumacraft.example', where: 'commit 3 in lumacraft' }, AGENT));
  value(k.meet({ name: 'Devraj B', email: 'devrajbanerji@gmail.com', where: 'commit 4 in lumacraft' }, AGENT));
  assert.deepEqual(open(sql), [one.question]);
  assert.equal(questions(sql), 1);
  const body = k.governanceRow('suggestion', one.question!)!.body as { candidates: { name: string; kept?: boolean }[] };
  assert.deepEqual(body.candidates.map((c) => [c.name, c.kept === true]), [['Devraj Banerji', true], ['Devraj Banerji', false], ['Devraj Banerji', false]]);

  value(k.decide(one.question!, { decide: { option: 'accept', reason: 'one Devraj' } }, 'p_owner'));
  assert.equal(k.count('people'), 1);
  const row = k.get(kept.id)!;
  assert.equal(row.fields.email, 'devraj@fanline.example');
  /* "Devraj B" came only from a commit by a key the row held, which carries no other name (research-audit-21 M9). */
  assert.equal(row.fields.aliases, undefined);
  assert.equal((row.fields.met as string[]).length, 4);
  sql.close();
});

test('A SHORT FORM OF A NAME IS ASKED ABOUT: farahq beside Farah Qureshi, tlindqvist beside Tomas Lindqvist', async () => {
  const { k, sql } = await record();
  value(k.create('people', { name: 'Farah Qureshi', email: 'farah.qureshi@fanline.example' }, OWNER));
  const farah = value<Met>(k.meet({ name: 'farahq', email: '6152+farahq@users.noreply.github.com', where: 'commit 1 in fanline' }, AGENT));
  assert.match(k.question(farah.question!) ?? '', /^Are Farah Qureshi .* and farahq .* one person\?/u);
  value(k.create('people', { name: 'Tomas Lindqvist', email: 'tomas@fanline.example' }, OWNER));
  assert.ok(value<Met>(k.meet({ handle: 'github:tlindqvist', name: 'tlindqvist', where: 'commit 2 in fanline' }, AGENT)).question);
  /* And not a first name alone: Rohan beside Rohan Iyer is nobody's short form. */
  value(k.create('people', { name: 'Rohan Iyer', email: 'rohan.iyer@fanline.example' }, OWNER));
  assert.equal(value<Met>(k.meet({ name: 'rohanbrightloom', email: 'rohanbrightloom@gmail.com', where: 'commit 3 in fanline' }, AGENT)).question, undefined);
  sql.close();
});

test('THE RECORD’S OWN PERSON KEEPS EVERY SPELLING OF THEM: a name their handle spells is asked, an alias and a handle fold', async () => {
  const { k, sql } = await record();
  const self = value<Entry>(k.create('people', { name: 'Kas', email: 'kas@kas.example', keys: ['email:karimassaf91@gmail.com', 'github:kasdev'], self: true }, OWNER));
  const second = value<Entry>(k.create('people', { name: 'Kas', note: 'Founder, Tidepool Apps' }, OWNER));

  /* "Karim Assaf" is what karimassaf91 spells: asked, the record's own person kept, the second Kas asked about with them. */
  const met = value<Met>(k.meet({ name: 'Karim Assaf', email: 'karim@tidepool.example', where: 'commit 1 in fanline' }, AGENT));
  assert.match(k.question(met.question!) ?? '', /Yes keeps Kas /u);
  const body = k.governanceRow('suggestion', met.question!)!.body as { candidates: { at: string; kept?: boolean }[] };
  assert.deepEqual(body.candidates.map((c) => [c.at, c.kept === true]), [['people#1', true], ['people#2', false], ['people#3', false]]);
  value(k.decide(met.question!, { decide: { option: 'accept', reason: 'all me' } }, 'p_owner'));
  assert.equal(k.count('people'), 1);
  assert.equal(k.get(second.id, { includeDeleted: true })!.fields.merged_into, self.id);
  assert.deepEqual(k.get(self.id)!.fields.aliases, ['Karim Assaf']);

  /* Now that the record knows the name, a commit with the same name and handle is still asked about: anybody can sign
     a commit as the owner (audit 19 H1). The same from a session's own run folds on its own, into the owner's row, and
     never takes the commit author in with it. */
  const committed = value<Met>(k.meet({ name: 'Karim Assaf', email: 'karimassaf@driftwind.example', where: 'commit 2 in bake' }, AGENT));
  assert.equal(committed.matched_by, 'none');
  assert.ok(committed.question);
  const folded = value<Met>(k.meet({ name: 'Karim Assaf', email: 'karimassaf@tidepool.example', where: 'session in bake' }, OWNER));
  assert.equal(folded.matched_by, 'strong');
  assert.equal(folded.row?.id, self.id);
  assert.equal(k.get(committed.row!.id)!.fields.merged_into, undefined, 'the commit author was folded in down the chain');
  sql.close();
});

test('THE OWNER HELD TWICE IS ONE QUESTION, "Are Kas and Kas both you?", never a fold: even a row no meeting ever touches', async () => {
  const { k, sql } = await record();
  const self = value<Entry>(k.create('people', { name: 'Kas', email: 'kas@kas.example', self: true }, OWNER));
  const second = value<Entry>(k.create('people', { name: 'Kas', note: 'Founder, Tidepool Apps' }, OWNER));
  /* Somebody else entirely is met: the second Kas, whom no key will ever meet, is asked about all the same. */
  value(k.meet({ name: 'Ada Lovelace', email: 'ada@example.com', where: 'commit 1 in braindog' }, AGENT));
  const [asked] = open(sql);
  assert.ok(asked, 'nothing asked about the owner held twice');
  assert.equal(k.question(asked), "Are Kas (an address at kas.example) and Kas both you? Yes keeps Kas and carries over the other's addresses, handles and where they were met.");
  assert.equal(k.count('people'), 3, 'the owner was folded without asking');
  /* Asked once, however much more is met. */
  value(k.meet({ name: 'Grace Hopper', email: 'grace@example.com', where: 'commit 2 in braindog' }, AGENT));
  assert.deepEqual(open(sql), [asked]);
  value(k.decide(asked!, { decide: { option: 'accept', reason: 'both me' } }, 'p_owner'));
  assert.equal(k.get(second.id, { includeDeleted: true })!.fields.merged_into, self.id);
  assert.equal(k.get(self.id)!.fields.note, 'Founder, Tidepool Apps');
  sql.close();
});

test('MARKING HIS ROW ON DECIDE ASKS AT ONCE ABOUT HIS OTHER ROWS, before anybody is met, and a no to the mark asks nothing', async () => {
  const { k, sql } = await record();
  const own = value<Entry>(k.create('people', { name: 'Kas', email: 'kas@kas.example', keys: ['email:karimassaf91@gmail.com'] }, OWNER));
  const second = value<Entry>(k.create('people', { name: 'Kas', note: 'Founder, Tidepool Apps' }, OWNER));
  value(k.create('people', { name: 'Karim Assaf', email: 'karim@karimassaf.example', met: [`${DAY} · note on Lumacraft`] }, OWNER));
  assert.deepEqual(open(sql), []);
  /* As the record's own step marks him (`markOwnRow`): "Mark Kas as you?", filed and accepted by the record. */
  const mark = (row: Entry) =>
    value<{ id: string }>(k.propose({ question: 'Mark Kas as you?', body_kind: 'rowset', body: { register: 'people', rows: [{ at: k.nameOf(row.id), version: row.version, patch: { self: true } }] } }, 'system')).id;
  value(k.decide(mark(own), { decide: { option: 'accept', reason: 'holds the sign-in address' } }, 'system'));
  const asked = open(sql);
  assert.equal(asked.length, 1, 'nothing was asked about his other rows when his row was marked');
  assert.match(k.question(asked[0]!) ?? '', /^Are Kas .*, Kas and Karim Assaf .*all you\? Yes keeps Kas /u);
  assert.doesNotMatch(k.question(asked[0]!) ?? '', /people#|@/u);
  /* Met after, nothing more is asked: the question is the one already waiting. */
  value(k.meet({ name: 'Ada Lovelace', email: 'ada@example.com', where: 'commit 1 in braindog' }, AGENT));
  assert.deepEqual(open(sql), asked);
  value(k.decide(asked[0]!, { decide: { option: 'accept', reason: 'all me' } }, 'p_owner'));
  assert.equal(k.get(second.id, { includeDeleted: true })!.fields.merged_into, own.id);
  sql.close();

  const two = await record();
  const first = value<Entry>(two.k.create('people', { name: 'Kas', email: 'kas@kas.example' }, OWNER));
  value(two.k.create('people', { name: 'Kas' }, OWNER));
  const q = value<{ id: string }>(two.k.propose({ question: 'Mark Kas as you?', body_kind: 'rowset', body: { register: 'people', rows: [{ at: two.k.nameOf(first.id), version: first.version, patch: { self: true } }] } }, 'system')).id;
  value(two.k.decide(q, { decide: { option: 'reject', reason: 'not me' } }, 'p_owner'));
  assert.deepEqual(open(two.sql), []);
  two.sql.close();
});

test('ONE WHO GOES BY THE OWNER’S OTHER NAME IS ASKED ABOUT AS HIM, and what he is met by after lands on his row by key', async () => {
  const { k, sql } = await record();
  const self = value<Entry>(k.create('people', { name: 'Kas', email: 'kas@kas.example', aliases: ['Karim Assaf'], self: true }, OWNER));
  const met = value<Met>(k.meet({ name: 'Karim Assaf', email: 'karim@karimassaf.example', where: 'commit 1 in lumacraft' }, AGENT));
  assert.equal(met.created, true);
  assert.notEqual(met.row?.id, self.id, 'a commit was folded into the owner on its own');
  const [asked] = open(sql);
  assert.match(k.question(asked!) ?? '', /^Are Kas .*and Karim Assaf .*both you\? Yes keeps Kas /u);
  assert.doesNotMatch(k.question(asked!) ?? '', /people#|@/u);
  value(k.decide(asked!, { decide: { option: 'accept', reason: 'me' } }, 'p_owner'));
  assert.equal(k.count('people'), 1);
  const again = value<Met>(k.meet({ name: 'Karim Assaf', email: 'karim@karimassaf.example', where: 'commit 2 in lumacraft' }, AGENT));
  assert.equal(again.matched_by, 'key');
  assert.equal(again.row?.id, self.id);
  sql.close();
});

test('THE OWNER’S NAME IN A MAIL IS NOBODY’S EVIDENCE, a no is never asked again, and two rows marked as him ask nothing', async () => {
  const { k, sql } = await record();
  value(k.create('people', { name: 'Kas', email: 'kas@kas.example', self: true }, OWNER));
  /* Mail only: a stranger signing as Kas is not asked about as the owner. */
  value(k.meet({ email: '"Kas" <kas@stranger.test>', source: 'mail from stranger.test' }, AGENT));
  assert.deepEqual(open(sql).filter((id) => /both you/u.test(k.question(id) ?? '')), []);

  /* A commit author by the owner's name is asked about once; a no stands. */
  value(k.meet({ name: 'Kas', email: 'kas@elsewhere.example', where: 'commit 1 in braindog' }, AGENT));
  const asked = open(sql).filter((id) => /both you/u.test(k.question(id) ?? ''));
  assert.equal(asked.length, 1);
  value(k.decide(asked[0]!, { decide: { option: 'reject', reason: 'not me' } }, 'p_owner'));
  value(k.meet({ name: 'Ada Lovelace', email: 'ada@example.com', where: 'commit 2 in braindog' }, AGENT));
  assert.deepEqual(open(sql).filter((id) => /both you|all you/u.test(k.question(id) ?? '')), []);
  sql.close();

  const two = await record();
  value(two.k.create('people', { name: 'Kas', email: 'kas@kas.example', self: true }, OWNER));
  value(two.k.create('people', { name: 'Kas', email: 'kas@other.example', self: true }, OWNER));
  value(two.k.meet({ name: 'Ada Lovelace', email: 'ada@example.com', where: 'commit 1 in braindog' }, AGENT));
  assert.deepEqual(open(two.sql), []);
  two.sql.close();
});

test('A QUESTION WHOSE PEOPLE BECAME ONE IS TAKEN OFF THE LIST', async () => {
  const { k, sql } = await record();
  value(k.create('people', { name: 'Owen Hartley', email: 'owen@fanline.example', keys: ['email:ohartley@old.example'] }, OWNER));
  const asked = value<Met>(k.meet({ name: 'Owen Hartley', email: 'owenh@fanline.example', where: 'commit 1 in fanline' }, AGENT));
  assert.ok(asked.question);
  /* The second row is met again by its own address, in the session's own run, with a handle the first holds too: the
     strong rules fold it, and the question has nobody left to ask about. A commit never would (audit 19 H1). */
  const last = value<Met>(k.meet({ name: 'Owen Hartley', email: 'owenh@fanline.example', handle: 'github:ohartley', where: 'session in fanline' }, OWNER));
  assert.equal(last.row?.seq, 1);
  assert.equal(k.count('people'), 1);
  assert.equal(k.governanceRow('suggestion', asked.question!)?.status, 'resolved');
  assert.deepEqual(open(sql), []);
  sql.close();
});
