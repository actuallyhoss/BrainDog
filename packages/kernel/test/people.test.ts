/**
 * Automatic people: `meet` matches by email, then by handle, adds whoever it cannot match, and asks
 * once about two people who share a name.
 *
 * What is asserted is how little it changes. A match gains a dated line, the run's project and the
 * identifiers it was missing, and nothing it already held is overwritten. A shared name is a
 * question for the owner and never a join, and it is asked once per pair. Without the people
 * register, or without the fields the agents pack declares on it, nothing at all is written.
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

/** People as the agents pack declares it (plan 5.2). */
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

/* ── matching ────────────────────────────────────────────────────────────── */

test('A PERSON IS MATCHED BY EMAIL, and gains a dated line, the project and a handle, and nothing else', async () => {
  const { k, sql, project } = await record();
  const ada = value<Entry>(k.create('people', { name: 'Ada Lovelace', email: 'ada@example.com', role: 'client' }, OWNER));

  const met = value<Met>(
    k.meet({ name: 'A. Lovelace', email: '  ADA@Example.COM ', handle: 'GitHub:@Ada', where: 'commit 4464966 in braindog' }, AGENT),
  );
  assert.deepEqual(met, { person: 'people#1', created: false, linked: true, merge: null });

  const row = k.get(ada.id)!;
  assert.equal(row.fields.name, 'Ada Lovelace', 'a name the owner typed was overwritten by one read from a commit');
  assert.equal(row.fields.role, 'client');
  assert.equal(row.fields.email, 'ada@example.com');
  assert.deepEqual(row.fields.handles, ['github:ada']);
  assert.deepEqual(row.fields.projects, [project]);
  assert.deepEqual(row.fields.met, [`${DAY} · commit 4464966 in braindog`]);
  assert.equal(sql.one<{ actor: string }>("SELECT actor FROM event WHERE target = ? AND field = 'met'", `entry:${ada.id}`)?.actor, 'S1');

  /* Met again, in the same project: another line, and no second link. */
  const again = value<Met>(k.meet({ email: 'ada@example.com', where: 'commit 9f00aa1 in braindog' }, AGENT));
  assert.deepEqual(again, { person: 'people#1', created: false, linked: false, merge: null });
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

  const met = value<Met>(k.meet({ name: 'G. Hopper', email: 'grace@example.com', handle: 'github:GHopper', where: 'issue 12 in braindog' }, AGENT));
  assert.equal(met.person, 'people#1');
  assert.equal(met.created, false);

  const row = k.get(grace.id)!;
  assert.equal(row.fields.email, 'grace@example.com');
  assert.equal(row.fields.name, 'Grace Hopper');
  assert.deepEqual(row.fields.handles, ['github:ghopper']);
  sql.close();
});

test('NOBODY MATCHED IS ADDED, linked to the run’s project when there is one', async () => {
  const { k, sql, project } = await record();
  const met = value<Met>(k.meet({ name: ' Linus  Torvalds ', email: 'linus@example.com', where: 'commit 1da177e in braindog' }, AGENT));
  assert.deepEqual(met, { person: 'people#1', created: true, linked: true, merge: null });

  const row = k.get('people#1')!;
  assert.equal(row.fields.name, 'Linus Torvalds');
  assert.deepEqual(row.fields.projects, [project]);
  assert.deepEqual(row.fields.met, [`${DAY} · commit 1da177e in braindog`]);
  assert.equal(sql.one<{ actor: string }>("SELECT actor FROM event WHERE kind = 'create' AND target = ?", `entry:${row.id}`)?.actor, 'S1');

  /* A person has no run, so nothing is linked. */
  const byHand = value<Met>(k.meet({ handle: 'github:mia', name: 'Mia', where: 'a call about the site' }, OWNER));
  assert.deepEqual(byHand, { person: 'people#2', created: true, linked: false, merge: null });
  assert.equal(k.get('people#2')!.fields.projects, undefined);
  sql.close();
});

/* ── a shared name ───────────────────────────────────────────────────────── */

test('A SHARED NAME OPENS ONE MERGE PROPOSAL, and the same pair is never asked about twice', async () => {
  const { k, sql, project } = await record();
  value(k.create('people', { name: 'Ada Lovelace', email: 'ada@example.com' }, OWNER));

  const met = value<Met>(k.meet({ name: 'ada  lovelace', email: 'ada@work.example', handle: 'github:ada-l', where: 'commit 4464966 in braindog' }, AGENT));
  assert.deepEqual(met, { person: 'people#2', created: true, linked: true, merge: 'SG1' });

  const sg = k.governanceRow('suggestion', 'SG1')!;
  assert.equal(sg.opened_by, 'S1');
  assert.match(k.question('SG1') ?? '', /^Are people#1 and people#2 the same person, Ada Lovelace\? Accepting folds people#2 into people#1\.$/);
  const second = k.get('people#2')!;
  assert.deepEqual(sg.body, {
    register: 'people',
    rows: [
      { at: 'people#1', version: 1, patch: { handles: ['github:ada-l'], projects: [project], met: [`${DAY} · commit 4464966 in braindog`] } },
      { at: 'people#2', version: second.version, patch: { merged_into: 'people#1', deleted_at: new Date(NOW).toISOString() } },
    ],
  });

  /* Met again, by the second address: matched, and not asked about again. */
  const again = value<Met>(k.meet({ name: 'Ada Lovelace', email: 'ada@work.example', where: 'commit 9f00aa1 in braindog' }, AGENT));
  assert.deepEqual(again, { person: 'people#2', created: false, linked: false, merge: null });

  /* And once the owner has said no, still not. */
  value(k.decide('SG1', { decide: { option: 'reject', reason: 'two different people called Ada' } }, 'p_owner'));
  assert.equal(value<Met>(k.meet({ email: 'ada@work.example', where: 'commit 77aa001 in braindog' }, AGENT)).merge, null);
  assert.equal(counts(sql).suggestions, 1);
  sql.close();
});

test('an accepted merge folds the newer row into the older, with both changes in the history', async () => {
  const { k, sql, project } = await record();
  const first = value<Entry>(k.create('people', { name: 'Ada Lovelace', email: 'ada@example.com' }, OWNER));
  const met = value<Met>(k.meet({ name: 'Ada Lovelace', handle: 'github:ada-l', where: 'commit 4464966 in braindog' }, AGENT));
  assert.equal(met.merge, 'SG1', 'a missing email is a near match too');

  value(k.decide('SG1', { decide: { option: 'accept', reason: 'the same Ada' } }, 'p_owner'));

  const kept = k.get(first.id)!;
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

  /* A merged row is no longer met: the handle now finds the row it was folded into. */
  assert.equal(value<Met>(k.meet({ handle: 'github:ada-l', where: 'commit 9f00aa1 in braindog' }, AGENT)).person, 'people#1');
  sql.close();
});

test('A MERGE DRAWN BEFORE THE ROW MOVED AGAIN IS STALE, and accepting it changes nothing', async () => {
  const { k, sql } = await record();
  value(k.create('people', { name: 'Ada Lovelace', email: 'ada@example.com' }, OWNER));
  value(k.meet({ name: 'Ada Lovelace', email: 'ada@work.example', where: 'commit 4464966 in braindog' }, AGENT));
  value(k.meet({ email: 'ada@work.example', where: 'commit 9f00aa1 in braindog' }, AGENT));

  const out = k.decide('SG1', { decide: { option: 'accept', reason: 'the same Ada' } }, 'p_owner') as { ok: boolean; conflict?: unknown };
  assert.equal(out.ok, false);
  assert.ok(out.conflict, 'a stale merge was not answered with the conflict');
  assert.equal(k.get('people#2')?.deleted_at, null);
  assert.equal(k.get('people#1')?.fields.met, undefined);
  assert.equal(k.governanceRow('suggestion', 'SG1')?.status, 'open');
  sql.close();
});

/* ── refusals ────────────────────────────────────────────────────────────── */

test('WITH PEOPLE SWITCHED OFF, OR WITHOUT THE AGENTS PACK’S FIELDS, MEET REFUSES AND WRITES NOTHING', async () => {
  const off = await record([]);
  const before = counts(off.sql);
  assert.equal(said(off.k.meet({ name: 'Ada', email: 'ada@example.com', where: 'commit 4464966 in braindog' }, AGENT)), 'REGISTER_UNKNOWN at register');
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
