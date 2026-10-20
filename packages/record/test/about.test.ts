/**
 * `about`: what one thing on the record is and where it was seen (`src/methods/about.ts`), asked by its name or by its
 * number in its list. A read over the kernel's about read (`aboutOfRow`, `candidatesFor`), held to the lists the
 * caller may read: somebody a list is closed to is answered as though the thing were not on the record at all.
 *
 * Through the real record: a project is added with its repository, a note is written that names it, and the read
 * answers the project's kind, its name and the note as a place it was seen, in names.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { guarded, type Refusal, type Result } from '@braindog/ports';
import { noteMention, type Entry } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 14, 12);

const THINGS = {
  id: 'register.things',
  kind: 'register' as const,
  body: {
    id: 'things',
    name: 'Projects',
    title: 'name',
    search: ['name'],
    scopes: { repos: 'repos', folders: 'folders' },
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'repos', type: 'list', of: 'text' },
      { id: 'folders', type: 'list', of: 'text' },
    ],
  } as never,
};

const NOTES = {
  id: 'register.notes',
  kind: 'register' as const,
  body: {
    id: 'notes',
    name: 'Notes',
    title: 'subject',
    search: ['subject', 'body'],
    fields: [
      { id: 'subject', type: 'text', required: true },
      { id: 'body', type: 'text' },
    ],
  } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
/** A member who reads every list. */
const reader: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'read' } };
/** A member whose grant reaches the notes and not the projects. */
const notesOnly: CallContext = { principal: { kind: 'person', id: 'p_3', level: 'read' }, registers: ['notes'] };
/** A member whose grant reaches the projects and not the notes. */
const projectsOnly: CallContext = { principal: { kind: 'person', id: 'p_4', level: 'read' }, registers: ['things'] };

type Seen = { at: string; where: string };
type Said = { kind: string; name: string; also: string[]; seen: Seen[]; register: string; seq: number };
type Answer = { is: Said | null; candidates: { kind: string; name: string; also: string[]; seen: string[]; register: string; seq: number }[] };
type Api = Awaited<ReturnType<typeof createRecordApi>>;

const ID = /[0-9A-HJKMNP-TV-Z]{26}/u;
const refusal = (out: Result<unknown>) => (out as { refusal: Refusal }).refusal;
const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/** Called through this so the file typechecks on a record that has not registered the method yet. */
const about = (api: Api, args: unknown, ctx: CallContext): Promise<Result<Answer>> => {
  const method = (api as unknown as { about?: (a: unknown, c: CallContext) => Promise<Result<Answer>> }).about;
  assert.equal(typeof method, 'function', 'about is not registered in methods/index.ts');
  return method!(args, ctx);
};

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  value(await api.kernel.install([THINGS, NOTES] as never));
  const add = (register: string, fields: Record<string, unknown>) => value<Entry>(api.kernel.create(register, fields as never, { actor: 'p_1' }));
  return { api, sql, add };
}

/** A project with its repository, a note that names it, a note that does not, and another project. */
async function studio() {
  const r = await record();
  r.add('things', { name: 'Fanline' });
  const northbank = r.add('things', { name: 'Northbank', repos: ['git@github.com:mara/northbank.git'], folders: ['/Users/mara/Developer/northbank'] });
  const note = r.add('notes', { subject: 'Call with the printers', body: 'Northbank goes to print on Friday, so the proofs are due Wednesday.' });
  r.add('notes', { subject: 'Groceries', body: 'Bread, and nothing about work.' });
  return { ...r, northbank, note };
}

test('THE OWNER ASKS WHAT NORTHBANK IS and is answered its kind, its name and the note as a place it was seen', async () => {
  const { api, sql, northbank } = await studio();
  const out = value<Answer>(await about(api, { name: 'Northbank' }, owner));
  assert.ok(out.is, 'the one project of that name was not answered');
  assert.equal(out.is.kind, 'project');
  assert.equal(out.is.name, 'Northbank');
  assert.equal(out.is.register, 'things');
  assert.equal(out.is.seq, northbank.seq);
  assert.deepEqual(out.is.seen.map((s) => s.where), ['Notes: Call with the printers']);
  assert.deepEqual(out.candidates, [], 'one row answers to the name, so nothing else is proposed');
  /* IN NAMES: no id of a row, and neither the repository nor the folder the project is keyed by. */
  const said = JSON.stringify(out);
  assert.doesNotMatch(said, ID);
  assert.doesNotMatch(said, /github|git@|\/Users\//u);
  /* However it is typed. */
  assert.deepEqual(value<Answer>(await about(api, { name: '  northbank ' }, owner)), out);
  sql.close();
});

test('ASKED BY ITS NUMBER IN ITS LIST, the same answer', async () => {
  const { api, sql, northbank } = await studio();
  const byName = value<Answer>(await about(api, { name: 'Northbank' }, owner));
  assert.deepEqual(value<Answer>(await about(api, { row: { register: 'things', seq: northbank.seq } }, owner)), byName);
  /* A row of a list whose rows are not people, organisations or projects is nothing this read knows. */
  assert.deepEqual(value<Answer>(await about(api, { row: { register: 'notes', seq: 1 } }, owner)), { is: null, candidates: [] });
  assert.deepEqual(value<Answer>(await about(api, { row: { register: 'things', seq: 999 } }, owner)), { is: null, candidates: [] });
  sql.close();
});

test('A MEMBER WHOSE GRANT DOES NOT REACH THE PROJECTS IS ANSWERED NOTHING, exactly as for a name nobody has', async () => {
  const { api, sql, northbank } = await studio();
  const nothing = value<Answer>(await about(api, { name: 'Zzyzx' }, notesOnly));
  assert.deepEqual(nothing, { is: null, candidates: [] });
  assert.deepEqual(value<Answer>(await about(api, { name: 'Northbank' }, notesOnly)), nothing);
  assert.deepEqual(value<Answer>(await about(api, { row: { register: 'things', seq: northbank.seq } }, notesOnly)), nothing);
  sql.close();
});

test('WHERE IT WAS SEEN IS HELD TO THE LISTS THE CALLER READS: the note is not a place for somebody the notes are closed to', async () => {
  const { api, sql } = await studio();
  /* A sighting kept by the record itself, as a reading keeps one: its place is words nobody checked against a grant. */
  noteMention(sql, { name: 'Northbank', kind: 'project' as never, project: null, source: 'the printers thread', at: new Date(NOW).toISOString() });
  const whole = value<Answer>(await about(api, { name: 'Northbank' }, reader));
  assert.deepEqual(whole.is?.seen.map((s) => s.where).sort(), ['Notes: Call with the printers', 'the printers thread']);
  const part = value<Answer>(await about(api, { name: 'Northbank' }, projectsOnly));
  assert.equal(part.is?.name, 'Northbank');
  assert.deepEqual(part.is?.seen, [], 'a place in a list closed to her, or one no list vouches for, was said');
  sql.close();
});

test('A NAME TWO ROWS ANSWER TO IS BOTH OF THEM AS CANDIDATES, and neither is picked', async () => {
  const { api, sql, add } = await studio();
  const a = add('things', { name: 'Web' });
  const b = add('things', { name: 'Web', repos: ['git@github.com:mara/web.git'] });
  add('notes', { subject: 'Web plans', body: 'Web ships next month.' });
  const out = value<Answer>(await about(api, { name: 'Web' }, owner));
  assert.equal(out.is, null, 'a name alone decided between two rows');
  assert.deepEqual(out.candidates.map((c) => `${c.kind}:${c.name}:${c.register}`), ['project:Web:things', 'project:Web:things']);
  assert.deepEqual(out.candidates.map((c) => c.seq).sort(), [a.seq, b.seq].sort());
  assert.doesNotMatch(JSON.stringify(out), ID);
  assert.doesNotMatch(JSON.stringify(out), /github|git@/u);
  /* Each is then asked by its number. */
  const one = value<Answer>(await about(api, { row: { register: 'things', seq: b.seq } }, owner));
  assert.equal(one.is?.name, 'Web');
  assert.deepEqual(one.is?.seen, [], 'a note naming Web was given to one of two rows called Web');
  sql.close();
});

test('A READ: nothing is written or asked, and a call that names nothing is refused at the field', async () => {
  const { api, sql } = await studio();
  const count = () => ['event', 'suggestion', 'entity_mention', 'observation'].map((t) => sql.one<{ n: number }>(`SELECT count(*) AS n FROM ${t}`)!.n);
  const before = count();
  value<Answer>(await about(api, { name: 'Northbank' }, owner));
  value<Answer>(await about(api, { name: 'Nobody At All' }, reader));
  assert.deepEqual(count(), before);
  assert.equal(refusal(await about(api, {}, owner)).at, 'name');
  assert.equal(refusal(await about(api, { name: '   ' }, owner)).at, 'name');
  assert.equal(refusal(await about(api, { row: { register: 'things' } }, owner)).at, 'row');
  sql.close();
});

test('A PROJECT NAMED IN A SENTENCE IS FOUND: the name-range read is one statement', async () => {
  /* THE PRODUCTION GUARD, which the test database does not apply: `'name;'` read as a second statement. */
  const raw = openSqlite();
  const sql = guarded(raw);
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  value(await api.kernel.install([THINGS, NOTES] as never));
  value<Entry>(api.kernel.create('things', { name: 'Kiln' } as never, { actor: 'p_1' }));
  const out = value<Answer>(await about(api, { name: 'kiln' }, owner));
  assert.equal(out.is?.name, 'Kiln');
  raw.close();
});
