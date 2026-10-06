/**
 * Automatic people: `meet` resolves who somebody is by what identifies them (`entity_key`), adds whoever carries a key
 * nobody holds, keeps a bare name as a mention and never a row, and asks once, in names, about a cluster that may be
 * one person.
 *
 * What is asserted is how little it changes. A match gains a dated line, the run's project and the identifiers it was
 * missing, and nothing it already held is overwritten. A shared name is a question for the owner and never a join, and
 * it is asked once. Without the people register, or without the fields it must have, nothing at all is written.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MET_CAP, openRecord, type Declaration, type Entry, type Kernel, type Met, type WriteContext } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 11, 12);
const DAY = '2026-09-11';

const PROJECTS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: {
    id: 'things',
    name: 'Projects',
    title: 'name',
    scopes: { repos: 'repos' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'repos', type: 'list', of: 'text' },
    ],
  },
};

/** People as the agents pack declared it (plan 5.2), read by name: no `meets:` key. */
const PEOPLE: Declaration = {
  id: 'register.people',
  kind: 'register',
  body: {
    id: 'people',
    name: 'People',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'role', type: 'enum', values: ['client', 'collaborator', 'other'] },
      { id: 'email', type: 'email', unique: true, index: true },
      { id: 'handles', type: 'list', of: 'text' },
      { id: 'projects', type: 'list', of: 'ref', to: 'things', scope: { links: true } },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'people' },
    ],
  },
};

/** People as the seed has it today, before the agents pack. */
const PLAIN_PEOPLE: Declaration = {
  id: 'register.people',
  kind: 'register',
  body: {
    id: 'people',
    name: 'People',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'role', type: 'enum', values: ['client', 'contractor'] },
      { id: 'email', type: 'text' },
    ],
  },
};

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const said = (r: unknown): string => {
  const x = r as { ok: boolean; refusal?: { code: string; at?: string } };
  assert.equal(x.ok, false, 'the call went through');
  return `${x.refusal?.code} at ${x.refusal?.at}`;
};

const OWNER: WriteContext = { actor: 'p_owner' };
const AGENT: WriteContext = {
  actor: 'p_owner',
  principal: { kind: 'token', token: 't_1' },
  session: { client_id: 'cc-1', host: 'h', repo: 'braindog' },
};

async function record(people: Declaration[] = [PEOPLE]): Promise<{ k: Kernel; sql: NodeSql; project: string }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([PROJECTS, ...people]));
  const project = value<Entry>(k.create('things', { name: 'BrainDog', repos: ['braindog'] }, OWNER)).id;
  return { k, sql, project };
}

const counts = (sql: NodeSql) => ({
  rows: Number(sql.one<{ n: number }>('SELECT count(*) AS n FROM entry')?.n),
  events: Number(sql.one<{ n: number }>('SELECT count(*) AS n FROM event')?.n),
  suggestions: Number(sql.one<{ n: number }>('SELECT count(*) AS n FROM suggestion')?.n),
});

/** What a test reads of an answer: who, how, and the old fields, without the row's minted id. */
const shape = (m: Met) => ({ name: m.row?.name ?? null, person: m.person, created: m.created, matched_by: m.matched_by, linked: m.linked, merge: m.merge });

/* ── matching ────────────────────────────────────────────────────────────── */

test('A PERSON IS MATCHED BY EMAIL, and gains a dated line, the project and a handle, and nothing else', async () => {
  const { k, sql, project } = await record();
  const ada = value<Entry>(k.create('people', { name: 'Ada Lovelace', email: 'ada@example.com', role: 'client' }, OWNER));

  const met = value<Met>(
    k.meet({ name: 'A. Lovelace', email: '  ADA@Example.COM ', handle: 'GitHub:@Ada', where: 'commit 4464966 in braindog' }, AGENT),
  );
  assert.deepEqual(shape(met), { name: 'Ada Lovelace', person: 'people#1', created: false, matched_by: 'key', linked: true, merge: null });
  assert.equal(met.row?.id, ada.id);

  const row = k.get(ada.id)!;
  assert.equal(row.fields.name, 'Ada Lovelace', 'a name the owner typed was overwritten by one read from a commit');
  assert.equal(row.fields.role, 'client');
  assert.equal(row.fields.email, 'ada@example.com');
  assert.deepEqual(row.fields.handles, ['github:ada']);
  assert.deepEqual(row.fields.projects, [project]);
  assert.deepEqual(row.fields.met, [`${DAY} · commit 4464966 in braindog`]);
  assert.equal(sql.one<{ actor: string }>("SELECT actor FROM event WHERE target = ? AND field = 'met'", `entry:${ada.id}`)?.actor, 'S1');
  /* The key it was met by says where it came from. */
  assert.equal(sql.one<{ source: string }>("SELECT source FROM entity_key WHERE key = 'github:ada'")?.source, 'commit 4464966 in braindog');

  /* Met again, in the same project: another line, and no second link. */
  const again = value<Met>(k.meet({ email: 'ada@example.com', where: 'commit 9f00aa1 in braindog' }, AGENT));
  assert.deepEqual(shape(again), { name: 'Ada Lovelace', person: 'people#1', created: false, matched_by: 'key', linked: false, merge: null });
  assert.equal((k.get(ada.id)!.fields.met as string[]).length, 2);
  assert.equal(k.count('people'), 1);
  sql.close();
});

test('A PERSON KEEPS THE NEWEST MET LINES, up to the cap, in the order they happened', async () => {
  const { k, sql } = await record();
  const ada = value<Entry>(k.create('people', { name: 'Ada Lovelace', email: 'ada@example.com', met: ['2020-01-01 · the oldest meeting'] }, OWNER));
  /* Named so that sorting the text would put the last one first. */
  for (let i = MET_CAP; i >= 1; i--) value<Met>(k.meet({ email: 'ada@example.com', where: `commit ${String(i).padStart(2, '0')}` }, AGENT));

  const met = k.get(ada.id)!.fields.met as string[];
  assert.equal(met.length, MET_CAP);
  assert.ok(!met.includes('2020-01-01 · the oldest meeting'), 'the cap kept the oldest line');
  assert.deepEqual([met[0], met.at(-1)], [`${DAY} · commit ${String(MET_CAP)}`, `${DAY} · commit 01`]);
  sql.close();
});

test('WITH NO EMAIL MATCH, A HANDLE MATCHES, and the missing email is filled', async () => {
  const { k, sql } = await record();
  const grace = value<Entry>(k.create('people', { name: 'Grace Hopper', handles: ['github:ghopper'] }, OWNER));

  const met = value<Met>(k.meet({ name: 'G. Hopper', email: 'grace@example.com', handle: 'github:GHopper', where: 'commit 12ab34c in braindog' }, AGENT));
  assert.equal(met.person, 'people#1');
  assert.equal(met.created, false);
  assert.equal(met.matched_by, 'key');

  const row = k.get(grace.id)!;
  assert.equal(row.fields.email, 'grace@example.com');
  assert.equal(row.fields.name, 'Grace Hopper');
  assert.deepEqual(row.fields.handles, ['github:ghopper']);
  sql.close();
});

test('NOBODY MATCHED IS ADDED, linked to the run’s project when there is one', async () => {
  const { k, sql, project } = await record();
  const met = value<Met>(k.meet({ name: ' Linus  Torvalds ', email: 'linus@example.com', where: 'commit 1da177e in braindog' }, AGENT));
  assert.deepEqual(shape(met), { name: 'Linus Torvalds', person: 'people#1', created: true, matched_by: 'none', linked: true, merge: null });

  const row = k.get('people#1')!;
  assert.equal(row.fields.name, 'Linus Torvalds');
  assert.deepEqual(row.fields.projects, [project]);
  assert.deepEqual(row.fields.met, [`${DAY} · commit 1da177e in braindog`]);
  assert.equal(sql.one<{ actor: string }>("SELECT actor FROM event WHERE kind = 'create' AND target = ?", `entry:${row.id}`)?.actor, 'S1');

  /* A person has no run, so nothing is linked. */
  const byHand = value<Met>(k.meet({ handle: 'github:mia', name: 'Mia', where: 'a call about the site' }, OWNER));
  assert.deepEqual(shape(byHand), { name: 'Mia', person: 'people#2', created: true, matched_by: 'none', linked: false, merge: null });
  assert.equal(k.get('people#2')!.fields.projects, undefined);
  sql.close();
});

test('A NAME ALONE NEVER MAKES A PERSON: it is kept as a mention, however often it is met', async () => {
  const { k, sql } = await record();
  const before = Number(sql.one<{ n: number }>("SELECT count(*) AS n FROM entry WHERE register = 'people'")?.n);
  for (const where of ['commit 1 in braindog', 'commit 2 in braindog', 'commit 2 in braindog']) {
    const met = value<Met>(k.meet({ name: 'Priya Raman', where }, AGENT));
    assert.deepEqual(met, { row: null, created: false, matched_by: 'none', mention: true, person: null, linked: false, merge: null });
  }
  assert.equal(Number(sql.one<{ n: number }>("SELECT count(*) AS n FROM entry WHERE register = 'people'")?.n), before, 'a bare name made a row');
  assert.equal(k.count('people'), 0);
  /* One line per source, so the same commit read twice is one mention. */
  assert.deepEqual(
    sql.all<{ name: string; source: string }>("SELECT name, source FROM entity_mention WHERE kind = 'person' ORDER BY source").map((m) => `${m.name} · ${m.source}`),
    ['Priya Raman · commit 1 in braindog', 'Priya Raman · commit 2 in braindog'],
  );
  assert.equal(counts(sql).suggestions, 0);
  sql.close();
});

test('A RAW From HEADER IS READ INTO A NAME AND AN ADDRESS', async () => {
  const { k, sql } = await record();
  const met = value<Met>(k.meet({ email: '"Ada Lovelace" <Ada@Example.com>', where: 'mail from example.com' }, OWNER));
  assert.equal(met.created, true);
  const row = k.get(met.row!.id)!;
  assert.equal(row.fields.name, 'Ada Lovelace');
  assert.equal(row.fields.email, 'ada@example.com');
  sql.close();
});

/* ── keys ────────────────────────────────────────────────────────────────── */

test('GMAIL’S DOTS AND +TAGS FOLD, and googlemail is gmail, so one mailbox is one person', async () => {
  const { k, sql } = await record();
  const ada = value<Entry>(k.create('people', { name: 'Ada Lovelace', email: 'ada.lovelace+work@gmail.com' }, OWNER));
  for (const email of ['adalovelace@googlemail.com', 'A.D.A.Lovelace@gmail.com']) {
    const met = value<Met>(k.meet({ email, where: 'mail' }, AGENT));
    assert.equal(met.row?.id, ada.id, `${email} made a second person`);
    assert.equal(met.matched_by, 'key');
  }
  /* Another host's dots are not folded: two colleagues stay two. */
  value(k.create('people', { name: 'Bo Chen', email: 'bo.chen@encore.example' }, OWNER));
  assert.equal(value<Met>(k.meet({ email: 'bochen@encore.example', name: 'Bob Chen', where: 'commit 1 in encore' }, AGENT)).created, true);
  assert.equal(k.count('people'), 3);
  sql.close();
});

test('GITHUB’S PRIVATE ADDRESS IS THE LOGIN, kept as a handle and never as an email', async () => {
  const { k, sql } = await record();
  const met = value<Met>(k.meet({ name: 'Octo Cat', email: '583231+Octo-Cat@users.noreply.github.com', where: 'commit 77aa001 in braindog' }, AGENT));
  assert.equal(met.created, true);
  const row = k.get(met.row!.id)!;
  assert.deepEqual(row.fields.handles, ['github:octo-cat']);
  assert.equal(row.fields.email, undefined, 'a no-reply address was kept as somebody’s email');
  assert.equal(value<Met>(k.meet({ handle: 'github:@Octo-Cat', where: 'review in braindog' }, AGENT)).row?.id, row.id);
  assert.equal(value<Met>(k.meet({ email: 'octo-cat@users.noreply.github.com', where: 'commit 1 in braindog' }, AGENT)).row?.id, row.id);
  sql.close();
});

test('A SHARED INBOX OR A MACHINE NEVER MAKES A PERSON', async () => {
  const { k, sql } = await record();
  for (const email of ['noreply@encore.example', 'Notifications <notifications@github.com>', 'billing@hetzner.com'])
    assert.equal(value<Met>(k.meet({ email, where: 'mail' }, AGENT)).mention, true, `${email} met as a person`);
  assert.equal(k.count('people'), 0);
  sql.close();
});

/* ── a shared name ───────────────────────────────────────────────────────── */

test('A SHARED NAME OPENS ONE QUESTION, in names and evidence and never ids, and it is never asked twice', async () => {
  const { k, sql, project } = await record();
  value(k.create('people', { name: 'Ada Lovelace', email: 'ada@example.com', projects: [project] }, OWNER));

  const met = value<Met>(k.meet({ name: 'ada  lovelace', email: 'ada@work.example', handle: 'github:ada-l', where: 'commit 4464966 in braindog' }, AGENT));
  assert.deepEqual(shape(met), { name: 'ada lovelace', person: 'people#2', created: true, matched_by: 'none', linked: true, merge: 'SG1' });
  assert.equal(met.question, 'SG1');

  const sg = k.governanceRow('suggestion', 'SG1')!;
  assert.equal(sg.opened_by, 'S1');
  const question = k.question('SG1') ?? '';
  assert.equal(
    question,
    "Are Ada Lovelace (BrainDog, an address at example.com) and ada lovelace (BrainDog, met once, an address at work.example, GitHub) one person? Yes keeps Ada Lovelace and carries over the other's addresses, handles and where they were met.",
  );
  assert.doesNotMatch(question, /#|\bP\d|people#|@/, 'the question shows an id or an address');
  const second = k.get('people#2')!;
  assert.deepEqual(sg.body, {
    register: 'people',
    rows: [
      { at: 'people#2', version: second.version, patch: { merged_into: 'people#1', deleted_at: new Date(NOW).toISOString() } },
      { at: 'people#1', version: 1, patch: { handles: ['github:ada-l', 'email:ada@work.example'], met: [`${DAY} · commit 4464966 in braindog`] } },
    ],
    /* What the merge card in Decide reads: each name by its handle, where they were seen, and the one Yes keeps. */
    candidates: [
      { at: 'people#1', name: 'Ada Lovelace', seen: ['BrainDog'], kept: true },
      { at: 'people#2', name: 'ada lovelace', seen: ['BrainDog', 'commit 4464966 in braindog'] },
    ],
  });

  /* Met again, by the second address: matched, and not asked about again. */
  const again = value<Met>(k.meet({ name: 'Ada Lovelace', email: 'ada@work.example', where: 'commit 9f00aa1 in braindog' }, AGENT));
  assert.deepEqual(shape(again), { name: 'ada lovelace', person: 'people#2', created: false, matched_by: 'key', linked: false, merge: null });

  /* And once the owner has said no, still not. */
  value(k.decide('SG1', { decide: { option: 'reject', reason: 'two different people called Ada' } }, 'p_owner'));
  assert.equal(value<Met>(k.meet({ email: 'ada@work.example', where: 'commit 77aa001 in braindog' }, AGENT)).merge, null);
  assert.equal(counts(sql).suggestions, 1);
  sql.close();
});

test('A CLUSTER IS ONE QUESTION: three spellings of one person are asked about together', async () => {
  const { k, sql } = await record();
  value(k.create('people', { name: 'Rohan Mehta', email: 'sm@encore.example' }, OWNER));
  value(k.create('people', { name: 'rohanmehta', handles: ['github:rohanmehta'] }, OWNER));

  const met = value<Met>(k.meet({ name: 'Rohan Mehta', email: 'rohan@brightloom.com', where: 'commit 1 in encore' }, AGENT));
  assert.equal(met.created, true);
  assert.equal(counts(sql).suggestions, 1, 'one question per pair, not per cluster');
  const question = k.question(met.question!) ?? '';
  assert.match(question, /^Are Rohan Mehta \(an address at encore\.xyz\), rohanmehta \(GitHub\) and Rohan Mehta \(BrainDog, met once, an address at brightloom\.com\) one person\?/);
  assert.doesNotMatch(question, /people#|#\d/);
  sql.close();
});

test('ACCEPTING A MERGE CARRIES WHAT THE KEPT ROW LACKED, the email first, so the second address finds one person (H2)', async () => {
  const { k, sql, project } = await record();
  const first = value<Entry>(k.create('people', { name: 'Ada Lovelace', handles: ['github:ada-l'] }, OWNER));
  const met = value<Met>(k.meet({ name: 'Ada Lovelace', email: 'ada@work.example', where: 'commit 4464966 in braindog' }, AGENT));
  assert.equal(met.merge, 'SG1', 'a near match was not asked about');

  value(k.decide('SG1', { decide: { option: 'accept', reason: 'the same Ada' } }, 'p_owner'));

  const kept = k.get(first.id)!;
  assert.equal(kept.fields.email, 'ada@work.example', 'the folded row’s email was lost');
  assert.deepEqual(kept.fields.handles, ['github:ada-l']);
  assert.deepEqual(kept.fields.projects, [project]);
  assert.deepEqual(kept.fields.met, [`${DAY} · commit 4464966 in braindog`]);

  const folded = k.get('people#2', { includeDeleted: true })!;
  assert.ok(folded.deleted_at);
  assert.equal(folded.fields.merged_into, first.id);
  const trail = sql.all<{ kind: string; field: string | null; actor: string }>(
    "SELECT kind, field, actor FROM event WHERE target = ? AND kind <> 'create' ORDER BY rowid",
    `entry:${folded.id}`,
  );
  assert.deepEqual(trail.map((e) => `${e.actor} ${e.kind} ${e.field}`), ['p_owner edit merged_into', 'p_owner delete null']);

  /* Both addresses now find the one person, and no third is made or asked about. */
  for (const said of [{ handle: 'github:ada-l' }, { email: 'ada@work.example' }]) {
    const again = value<Met>(k.meet({ ...said, where: 'commit 9f00aa1 in braindog' }, AGENT));
    assert.equal(again.person, 'people#1');
    assert.equal(again.merge, null);
  }
  assert.equal(k.count('people'), 1);
  sql.close();
});

test('A LATER MEETING KEEPS THE QUESTION CURRENT, so the owner can still accept it, with the new line carried', async () => {
  const { k, sql } = await record();
  const ada = value<Entry>(k.create('people', { name: 'Ada Lovelace', email: 'ada@example.com' }, OWNER));
  value(k.meet({ name: 'Ada Lovelace', email: 'ada@work.example', where: 'commit 4464966 in braindog' }, AGENT));
  value(k.meet({ email: 'ada@work.example', where: 'commit 9f00aa1 in braindog' }, AGENT));

  value(k.decide('SG1', { decide: { option: 'accept', reason: 'the same Ada' } }, 'p_owner'));
  assert.equal(k.count('people'), 1);
  assert.deepEqual(k.get(ada.id)!.fields.met, [`${DAY} · commit 4464966 in braindog`, `${DAY} · commit 9f00aa1 in braindog`], 'the later line was lost');
  assert.equal(counts(sql).suggestions, 1, 'a later meeting opened a second question');
  sql.close();
});

test('A MERGE DRAWN BEFORE SOMEBODY EDITED THE ROW IS STALE, and accepting it changes nothing', async () => {
  const { k, sql } = await record();
  value(k.create('people', { name: 'Ada Lovelace', email: 'ada@example.com' }, OWNER));
  value(k.meet({ name: 'Ada Lovelace', email: 'ada@work.example', where: 'commit 4464966 in braindog' }, AGENT));
  value(k.update('people', 'people#2', { role: 'client' }, OWNER));

  const out = k.decide('SG1', { decide: { option: 'accept', reason: 'the same Ada' } }, 'p_owner') as { ok: boolean; conflict?: unknown };
  assert.equal(out.ok, false);
  assert.ok(out.conflict, 'a stale merge was not answered with the conflict');
  assert.equal(k.get('people#2')?.deleted_at, null);
  assert.equal(k.get('people#1')?.fields.met, undefined);
  assert.equal(k.governanceRow('suggestion', 'SG1')?.status, 'open');
  sql.close();
});

/* ── the strong rules ────────────────────────────────────────────────────── */

test('THE STRONG RULES MERGE ON THEIR OWN, as one batch, and Undo puts both back and never merges them again', async () => {
  const { k, sql } = await record();
  /* Met in a commit first: a commit folds only into somebody met in commits alone (audit 19 H1). */
  const first = value<Met>(k.meet({ name: 'Rohan Mehta', email: 'rohanm@encore.example', where: 'commit 0 in encore' }, AGENT)).row!;

  const met = value<Met>(k.meet({ name: 'Rohan Mehta', email: 'rohanm@brightloom.com', where: 'commit 1 in encore' }, AGENT));
  assert.equal(met.matched_by, 'strong');
  assert.equal(met.row?.id, first.id);
  assert.equal(met.created, false);
  assert.ok(met.undo, 'a merge the record made carried no undo');
  assert.equal(counts(sql).suggestions, 0, 'a certain merge was asked about');
  assert.equal(k.count('people'), 1);
  assert.deepEqual(k.get(first.id)!.fields.handles, ['email:rohanm@brightloom.com']);
  /* One batch: the fold's two lines and the kept row's. */
  assert.equal(Number(sql.one<{ n: number }>('SELECT count(DISTINCT target) AS n FROM event WHERE batch = ?', met.undo!)?.n), 2);
  assert.equal(value<Met>(k.meet({ email: 'rohanm@brightloom.com', where: 'commit 2 in encore' }, AGENT)).row?.id, first.id);

  const undone = value<{ restored: string[] }>(k.undoMerge(met.undo!, OWNER));
  assert.deepEqual(undone.restored, ['Rohan Mehta']);
  /* THE LADDER IS TOLD: one line in `undone` for the merge's batch, by whoever met them, with the kinds it was. */
  const mark = sql.one<{ actor: string | null; kinds: string; undone_by: string }>('SELECT actor, kinds, undone_by FROM undone WHERE batch = ?', met.undo!);
  assert.match(mark?.actor ?? '', /^S\d+$/u, 'the run that met them, as its writes are signed');
  assert.equal(mark?.undone_by, OWNER.actor);
  const kinds = JSON.parse(mark!.kinds) as string[];
  assert.ok(kinds.length > 0 && kinds.every((kind) => kind.startsWith('people:')), kinds.join(', '));
  assert.equal(k.count('people'), 2);
  const back = k.get('people#2')!;
  assert.equal(back.fields.merged_into, undefined);
  assert.equal(back.fields.email, 'rohanm@brightloom.com');
  assert.equal(k.get(first.id)!.fields.handles, undefined, 'the kept row kept what the merge carried to it');

  /* Its address finds it again, and the pair is never merged again: an undo is a no. */
  const again = value<Met>(k.meet({ name: 'Rohan Mehta', email: 'rohanm@brightloom.com', where: 'commit 3 in encore' }, AGENT));
  assert.equal(again.row?.id, back.id);
  assert.equal(again.matched_by, 'key');
  assert.equal(again.merge, null);
  assert.equal(k.count('people'), 2);
  sql.close();
});

test('A STRONG MERGE MOVES EVERY LINK TO THE KEPT ROW, so a list that refuses deletes while referenced lets it through', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const people = { ...PEOPLE, body: { ...PEOPLE.body, delete: 'refuse_while_referenced' } } as Declaration;
  const notes: Declaration = {
    id: 'register.notes',
    kind: 'register',
    body: { id: 'notes', name: 'Notes', title: 'heading', fields: [{ id: 'heading', type: 'text', required: true }, { id: 'about', type: 'list', of: 'ref', to: 'people' }] },
  };
  value(await k.install([PROJECTS, people, notes]));
  const first = value<Entry>(k.create('people', { name: 'Rohan Mehta', email: 'rohanm@encore.example' }, OWNER));
  const second = value<Entry>(k.create('people', { name: 'Rohan', email: 'rohanm@brightloom.com' }, OWNER));
  const note = value<Entry>(k.create('notes', { heading: 'Call with Rohan', about: [second.id, first.id] }, OWNER));
  /* The second row learns its full name, and is folded the moment it is met. */
  value(k.update('people', second.id, { name: 'Rohan Mehta' }, OWNER));

  const met = value<Met>(k.meet({ email: 'rohanm@brightloom.com', where: 'commit 1 in encore' }, AGENT));
  assert.equal(met.matched_by, 'key');
  assert.equal(met.row?.id, first.id, 'the strong rules did not fold the second Rohan');
  assert.deepEqual(k.get(note.id)!.fields.about, [first.id]);

  value(k.undoMerge(second.id, OWNER));
  assert.deepEqual(k.get(note.id)!.fields.about, [second.id, first.id], 'undo did not point the note back');
  sql.close();
});

/* ── organisations ───────────────────────────────────────────────────────── */

const ORGS: Declaration = {
  id: 'register.organisations',
  kind: 'register',
  body: {
    id: 'organisations',
    name: 'Organisations',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'kind', type: 'enum', values: ['company', 'employer', 'client', 'vendor', 'merchant', 'bank', 'other'] },
      { id: 'domain', type: 'text' },
      { id: 'keys', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'organisations' },
    ],
  },
};

/** People declaring the keys, with the organisation they are with. */
const KEYED_PEOPLE: Declaration = {
  id: 'register.people',
  kind: 'register',
  body: {
    id: 'people',
    name: 'People',
    title: 'name',
    meets: { name: 'name', email: 'email', handles: 'handles', projects: 'projects', met: 'met', merged_into: 'merged_into', keys: 'keys', org: 'org', aliases: 'aliases' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'email', type: 'email', unique: true, index: true },
      { id: 'handles', type: 'list', of: 'text' },
      { id: 'keys', type: 'list', of: 'text' },
      { id: 'aliases', type: 'list', of: 'text' },
      { id: 'org', type: 'ref', to: 'organisations' },
      { id: 'projects', type: 'list', of: 'ref', to: 'things' },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'people' },
    ],
  },
};

test('AN ORGANISATION IS MET BY ITS DOMAIN, A SHARED INBOX IS ITS KEY, and a person is linked to it and never merged with it', async () => {
  const { k, sql } = await record([ORGS, KEYED_PEOPLE]);
  const encore = value<Met>(k.meet({ email: '"Encore" <noreply@encore.example>', where: 'mail from encore.example' }, AGENT));
  assert.equal(encore.row?.register, 'organisations');
  assert.equal(encore.row?.name, 'Encore');
  assert.equal(encore.created, true);
  assert.equal(k.count('people'), 0, 'a no-reply sender became a person');

  /* Another inbox of the same domain is the same organisation. */
  const billing = value<Met>(k.meet({ email: 'billing@encore.example', where: 'mail from encore.example' }, AGENT));
  assert.equal(billing.row?.id, encore.row?.id);
  assert.equal(billing.matched_by, 'key');
  assert.equal(k.count('organisations'), 1);

  /* A person at that domain is linked to it, and a person called Encore is still a person. */
  const rohan = value<Met>(k.meet({ name: 'Rohan Mehta', email: 'rohan@encore.example', where: 'commit 1 in encore' }, AGENT));
  assert.equal(rohan.row?.register, 'people');
  assert.equal(k.get(rohan.row!.id)!.fields.org, encore.row!.id);
  const named = value<Met>(k.meet({ name: 'Encore', handle: 'github:encore', where: 'commit 2 in encore' }, AGENT));
  assert.equal(named.row?.register, 'people');
  assert.equal(counts(sql).suggestions, 0, 'a person and an organisation were asked about as one');

  /* A merchant by its payee: the processor's prefix and the town fold away. */
  const chill = value<Met>(k.meet({ kind: 'organisation', name: 'Chillout', keys: ['bank:GEIDEA*CHILLOUT 0423 CAIRO EG'], role: 'merchant', where: 'bank text' }, AGENT));
  assert.equal(chill.created, true);
  assert.equal(k.get(chill.row!.id)!.fields.kind, 'merchant');
  assert.equal(value<Met>(k.meet({ kind: 'organisation', keys: ['bank:Chill Out'], where: 'bank text' }, AGENT)).row?.id, chill.row?.id);
  /* And by its name, the legal ending folded. */
  assert.equal(value<Met>(k.meet({ kind: 'organisation', name: 'Chillout LLC', where: 'import' }, AGENT)).row?.id, chill.row?.id);
  /* A name the record has never seen, with no key, is a mention. */
  assert.equal(value<Met>(k.meet({ kind: 'organisation', name: 'Northwind', where: 'a note' }, AGENT)).mention, true);
  sql.close();
});

test('A NOTIFICATION IS THE SERVICE’S, NOT THE NAME IT IS SIGNED WITH: GitHub writing as Ada makes no organisation called Ada', async () => {
  const { k, sql } = await record([ORGS, KEYED_PEOPLE]);
  const gh = value<Met>(k.meet({ email: '"Ada Lovelace" <notifications@github.com>', where: 'mail from github.com' }, AGENT));
  assert.equal(gh.row?.register, 'organisations');
  assert.notEqual(gh.row?.name, 'Ada Lovelace');
  assert.equal(value<Met>(k.meet({ email: '"Rohan (via Slack)" <notification@slack.com>', where: 'mail' }, AGENT)).row?.name, 'Slack');
  assert.equal(value<Met>(k.meet({ email: 'Stripe <receipts@stripe.com>', where: 'mail' }, AGENT)).row?.name, 'Stripe');
  sql.close();
});

test('A STRONG MERGE THE RECORD REFUSES IS ASKED INSTEAD, and the meeting still goes through', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const desks: Declaration = {
    id: 'register.desks',
    kind: 'register',
    body: { id: 'desks', name: 'Desks', title: 'label', fields: [{ id: 'label', type: 'text', required: true }, { id: 'holder', type: 'ref', to: 'people', unique: true }] },
  };
  value(await k.install([PROJECTS, PEOPLE, desks]));
  const first = value<Entry>(k.create('people', { name: 'Rohan Mehta', email: 'rohanm@encore.example' }, OWNER));
  const second = value<Entry>(k.create('people', { name: 'Rohan', email: 'rohanm@brightloom.com' }, OWNER));
  value(k.create('desks', { label: 'One', holder: first.id }, OWNER));
  value(k.create('desks', { label: 'Two', holder: second.id }, OWNER));
  value(k.update('people', second.id, { name: 'Rohan Mehta' }, OWNER));

  const met = value<Met>(k.meet({ email: 'rohanm@brightloom.com', where: 'commit 1 in encore' }, AGENT));
  assert.equal(met.row?.id, second.id);
  assert.equal(met.matched_by, 'key');
  assert.ok(met.question, 'a merge the record refused was neither made nor asked');
  assert.equal(k.count('people'), 2);
  assert.equal(k.get(second.id)!.fields.merged_into, undefined, 'a refused merge left its first half behind');
  sql.close();
});

/* ── refusals ────────────────────────────────────────────────────────────── */

test('WITH PEOPLE SWITCHED OFF, OR WITHOUT THE AGENTS PACK’S FIELDS, MEET REFUSES AND WRITES NOTHING', async () => {
  const off = await record([]);
  const before = counts(off.sql);
  assert.equal(said(off.k.meet({ name: 'Ada', email: 'ada@example.com', where: 'commit 4464966 in braindog' }, AGENT)), 'REGISTER_UNKNOWN at register');
  assert.equal(said(off.k.meet({ kind: 'organisation', domain: 'encore.example', where: 'mail' }, AGENT)), 'REGISTER_UNKNOWN at kind');
  assert.deepEqual(counts(off.sql), before, 'a refused meet wrote something, a run perhaps');
  off.sql.close();

  /* The seed's people today: a name and a plain-text email, and none of the fields meet writes. */
  const plain = await record([PLAIN_PEOPLE]);
  const was = counts(plain.sql);
  assert.equal(said(plain.k.meet({ name: 'Ada', email: 'ada@example.com', where: 'commit 4464966 in braindog' }, AGENT)), 'FIELD_UNKNOWN at handles');
  assert.deepEqual(counts(plain.sql), was);
  plain.sql.close();
});

test('AND WHAT IT IS TOLD IS CHECKED: who, where, and a handle as provider:name', async () => {
  const { k, sql } = await record();
  const before = counts(sql);
  assert.equal(said(k.meet({ name: 'Ada' } as never, AGENT)), 'REQUIRED_MISSING at where');
  assert.equal(said(k.meet({ where: 'commit 4464966 in braindog' }, AGENT)), 'REQUIRED_MISSING at name');
  assert.equal(said(k.meet({ handle: 'ada', where: 'x' }, AGENT)), 'VALUE_MALFORMED at handle');
  assert.equal(said(k.meet({ email: 'not an address', where: 'x' }, AGENT)), 'VALUE_MALFORMED at email');
  assert.equal(said(k.meet({ email: 42 as never, where: 'x' }, AGENT)), 'VALUE_MALFORMED at email');
  assert.equal(said(k.meet({ keys: ['nothing'], where: 'x' }, AGENT)), 'VALUE_MALFORMED at keys[0]');
  assert.equal(said(k.meet({ name: 'Ada', kind: 'robot' as never, where: 'x' }, AGENT)), 'VALUE_MALFORMED at kind');
  assert.deepEqual(counts(sql), before);
  sql.close();
});

test('A KEY MEETS SOMEBODY AS ITS OWN RUN: naming a run another key opened is refused, and nothing is written', async () => {
  const { k, sql } = await record();
  value<Met>(k.meet({ email: 'ada@example.com', name: 'Ada', where: 'commit 4464966 in braindog' }, AGENT));
  const before = counts(sql);
  const other: WriteContext = { actor: 'p_owner', principal: { kind: 'token', token: 't_2' }, session: { spoken: 'S1' } };
  const out = k.meet({ email: 'grace@example.com', name: 'Grace', where: 'commit 9f00aa1 in braindog' }, other);
  assert.equal(out.ok, false, 'another key met somebody as S1');
  if (!out.ok && 'refusal' in out) assert.deepEqual([out.refusal.code, out.refusal.at], ['FORBIDDEN', 'session']);
  else assert.fail('refused without a refusal');
  assert.deepEqual(counts(sql), before);
  sql.close();
});
