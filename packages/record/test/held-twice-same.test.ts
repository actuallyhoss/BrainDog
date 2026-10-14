/**
 * What a list that says what makes two of its rows the same holds twice (`src/methods/held-twice.ts`): `heldTwice` names
 * every row of a group with another, and `askFoldTwice`, a person's press, files ONE question on Decide that folds them
 * all, with one Undo. Never a question by itself at night: only the press asks.
 *
 * Through the real record: a list of skills declaring `same:`, three pairs among others, accepted through the record's
 * own `decide` and put back through its own `undo`. The kernel's readers (`same.ts`'s `clashes` and the fold's plan) are
 * stood in for by this file's own when the kernel has none yet, over the same real record, and the door's checks that
 * come before them (a token, a list closed to the reader) are asked of the record's own door either way.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, type Refusal, type Result, type Sql } from '@braindog/ports';
import type { Entry } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { foldQuestion, methods, writesOf, type Clash, type SameReaders } from '../src/methods/held-twice.ts';
import type { RecordDeps } from '../src/methods/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 14, 9);

const SKILLS = {
  id: 'register.skills',
  kind: 'register' as const,
  body: {
    id: 'skills',
    name: 'Skills',
    one: 'skill',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true, index: true },
      { id: 'after', label: 'Comes after', type: 'ref', to: 'skills' },
    ],
    same: { fields: ['name'], fold: 'text' },
  } as never,
};

/** A list that links to skills, so a fold that would move a link held elsewhere is seen. */
const NOTES = {
  id: 'register.notes',
  kind: 'register' as const,
  body: { id: 'notes', name: 'Notes', title: 'text', fields: [{ id: 'text', type: 'text', required: true }, { id: 'skill', type: 'ref', to: 'skills' }] } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };
const agent: CallContext = { principal: { kind: 'token', id: 't_claude', scope: 'write', person: 'p_1', level: 'owner' }, session: { client: 'claude-code', repo: 'braindog' } } as never;
/** Somebody who reads Notes and nothing else: Skills are not there for them. */
const shut: CallContext = { principal: { kind: 'person', id: 'p_3', level: 'write' }, registers: ['notes'] };

type Twice = { seqs: number[] } | null;
type Asked = { question: string };
type Door = {
  heldTwice: (a: unknown, c: CallContext) => Promise<Result<Twice>>;
  askFoldTwice: (a: unknown, c: CallContext) => Promise<Result<Asked>>;
};

const refusal = (out: Result<unknown>) => (out as { refusal: Refusal }).refusal;
const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

/** Whether this kernel has the two verbs itself; without them its own door answers nothing, and the stand-in is asked. */
const probe = await createRecordApi({ sql: openSqlite(), clock: fixedClock(NOW) });
const KERNEL_HAS = ['sameClashes', 'sameFoldPlan'].every((v) => typeof (probe.kernel as unknown as Record<string, unknown>)[v] === 'function');

/* ── the stand-in: what `same.ts` is to answer, written over the same record ──────────────────────────────────── */

type Live = { id: string; register: string; seq: number; version: number; fields: Record<string, unknown> };
const live = (sql: Sql, register: string): Live[] =>
  sql
    .all<{ id: string; register: string; seq: number; version: number; fields: string }>('SELECT id, register, seq, version, fields FROM entry WHERE register = ? AND deleted_at IS NULL ORDER BY seq', register)
    .map((r) => ({ ...r, fields: JSON.parse(r.fields) as Record<string, unknown> }));
const folded = (v: unknown): string => String(v ?? '').toLowerCase().replace(/\s+/gu, ' ').trim();

/** The groups of live skills one name folds to, the first made kept. */
function clashesIn(sql: Sql, list: string): Clash[] {
  const by = new Map<string, Live[]>();
  for (const r of live(sql, list)) {
    const key = `same:${list}:*:${folded(r.fields.name)}`;
    by.set(key, [...(by.get(key) ?? []), r]);
  }
  return [...by].filter(([, rows]) => rows.length > 1).map(([key, rows]) => ({ key, keep: rows[0]!.id, others: rows.slice(1).map((r) => r.id) }));
}

/** In the kernel's own shape (`FoldGroup`): each group's links to one of the others moved to the one kept, then each other deleted. */
function standInPlan(sql: Sql, links: readonly [string, string][]) {
  return (list: string) => {
    const groups = clashesIn(sql, list);
    const into = new Map<string, string>();
    for (const g of groups) for (const o of g.others) into.set(o, g.keep);
    const moved = links.flatMap(([register, field]) =>
      live(sql, register).flatMap((r) => {
        const to = into.get(String(r.fields[field] ?? ''));
        return to === undefined || into.has(r.id) ? [] : [{ register, at: r.id, patch: { [field]: to } }];
      }),
    );
    return groups.map((g, i) => ({ ...g, writes: [...(i === 0 ? moved : []), ...g.others.map((o) => ({ register: list, at: o, delete: true as const, note: 'Folded' }))] }));
  };
}

/** The method file over the real record, with the stand-in readers and a door that admits whoever it is handed. */
function standInDoor(api: Api, sql: Sql, readers: SameReaders): Door {
  const deps = {
    kernel: api.kernel,
    sql,
    guard: () => null,
    named: (args: { register?: unknown } | undefined) =>
      typeof args?.register === 'string' && args.register !== '' ? null : ({ code: 'REQUIRED_MISSING', fix: 'Say which list.', at: 'register' } as Refusal),
    no,
    tail: async <T>(out: T) => out,
    clock: fixedClock(NOW),
  } as unknown as RecordDeps;
  return methods(deps, readers) as unknown as Door;
}

type Api = Awaited<ReturnType<typeof createRecordApi>>;

/* ── the record ───────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Three pairs among others: Ponytail, Writing and Deploy each twice, the second of each made later, and two skills that
 * come after a later one, so folding moves their links. The rows are made before the list says what makes two the same,
 * then the list is installed again saying it, so the pairs are there however the door treats a second one today.
 */
async function studio() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  const plain = { ...SKILLS, body: { ...(SKILLS.body as object), same: undefined } } as never;
  value(await api.kernel.install([plain, NOTES] as never));
  const add = (register: string, fields: Record<string, unknown>) => value<Entry>(api.kernel.create(register, fields as never, { actor: 'p_1' }));
  const first = ['Ponytail', 'Writing', 'Deploy', 'Review'].map((name) => add('skills', { name }));
  const later = ['ponytail', 'writing ', 'DEPLOY'].map((name) => add('skills', { name }));
  const release = add('skills', { name: 'Release', after: later[1]!.id });
  value(api.kernel.update('skills', first[3]!.id, { after: later[2]!.id } as never, { actor: 'p_1' }));
  value(await api.kernel.install([SKILLS, NOTES] as never));
  return { api, sql, add, first, later, release, review: first[3]! };
}

const seqs = (rows: readonly Entry[]): number[] => rows.map((r) => r.seq!).sort((a, b) => a - b);
const questions = (sql: Sql) => sql.all<{ id: string; opened_by: string; body: string }>("SELECT id, opened_by, body FROM suggestion WHERE body_kind = 'rowset' AND status = 'open'");
const liveIds = (sql: Sql) => new Set(live(sql, 'skills').map((r) => r.id));
const afterOf = (api: Api, id: string) => api.kernel.get(id)?.fields.after ?? null;

/** The whole walk, asked of a door: the six named, one question for three folds, asked twice once, accepted, undone. */
async function walk(door: Door, r: Awaited<ReturnType<typeof studio>>) {
  const { api, sql, first, later, release, review } = r;
  /* THE SIX, kept and others, lowest first, and never the one held once. */
  const six = value<Twice>(await door.heldTwice({ register: 'skills' }, owner));
  assert.deepEqual(six, { seqs: seqs([...first.slice(0, 3), ...later]) });
  assert.ok(!six!.seqs.includes(review.seq!) && !six!.seqs.includes(release.seq!), 'a skill held once was named');

  /* ONE QUESTION, signed by the person who pressed, holding the three folds and the two links moved. */
  const asked = value<Asked>(await door.askFoldTwice({ register: 'skills' }, owner));
  const open = questions(sql);
  assert.equal(open.length, 1);
  assert.equal(open[0]!.id, asked.question);
  assert.equal(open[0]!.opened_by, 'p_1');
  assert.equal(api.kernel.question(asked.question), '3 skills are here twice. Keep the oldest of each?');
  const rows = (JSON.parse(open[0]!.body) as { rows: { patch: Record<string, unknown> }[] }).rows;
  assert.equal(rows.filter((w) => w.patch.deleted_at !== undefined).length, 3);
  assert.equal(rows.filter((w) => w.patch.after !== undefined).length, 2);
  assert.doesNotMatch(api.kernel.question(asked.question)!, /[0-9A-HJKMNP-TV-Z]{26}|—/u);

  /* PRESSED AGAIN, the same question is answered and nothing is filed twice. */
  assert.deepEqual(value<Asked>(await door.askFoldTwice({ register: 'skills' }, owner)), asked);
  assert.equal(questions(sql).length, 1);

  /* ACCEPTED THROUGH THE RECORD'S OWN DECIDE: three skills of the six left, and the links on the one kept. */
  value(await api.decide({ id: asked.question, decide: { option: 'accept', reason: 'Fold them.' } } as never, owner));
  const after = liveIds(sql);
  for (const k of first.slice(0, 3)) assert.ok(after.has(k.id), `${String(k.fields.name)} was folded away`);
  for (const o of later) assert.ok(!after.has(o.id), `${String(o.fields.name)} is still here`);
  assert.equal(afterOf(api, release.id), first[1]!.id);
  assert.equal(afterOf(api, review.id), first[2]!.id);
  assert.deepEqual(value<Twice>(await door.heldTwice({ register: 'skills' }, owner)), { seqs: [] });

  /* ONE UNDO BRINGS ALL SIX BACK. */
  const decision = sql.one<{ id: string }>('SELECT id FROM decision ORDER BY rowid DESC LIMIT 1')!.id;
  const plan = value<{ hash: string }>(await api.undo({ decision, dry: true }, owner));
  value(await api.undo({ decision, hash: plan.hash }, owner));
  const back = liveIds(sql);
  for (const k of [...first, ...later]) assert.ok(back.has(k.id), `${String(k.fields.name)} did not come back`);
  assert.deepEqual(value<Twice>(await door.heldTwice({ register: 'skills' }, owner)), { seqs: seqs([...first.slice(0, 3), ...later]) });
  return { release, review, later };
}

/** And the links where they were: the kernel's undo puts back a link to a row the same undo brings back (`undo.ts`). */
function linksBack(api: Api, w: Awaited<ReturnType<typeof walk>>) {
  assert.equal(afterOf(api, w.release.id), w.later[1]!.id);
  assert.equal(afterOf(api, w.review.id), w.later[2]!.id);
}

const realDoor = (api: Api): Door => api as unknown as Door;
const standIn = (r: Awaited<ReturnType<typeof studio>>) =>
  standInDoor(r.api, r.sql, { sameClashes: (list) => clashesIn(r.sql, list), sameFoldPlan: standInPlan(r.sql, [['skills', 'after'], ['notes', 'skill']]) });

/* ── the tests ────────────────────────────────────────────────────────────────────────────────────────────── */

test('ONE PRESS FOLDS EVERY PAIR: the six named, one question for the three, accepted, and one Undo brings all six back', async () => {
  const r = await studio();
  await walk(standIn(r), r);
  r.sql.close();
});

test('AND THAT UNDO PUTS EACH LINK BACK ON THE ONE IT NAMED', async () => {
  const r = await studio();
  linksBack(r.api, await walk(standIn(r), r));
  r.sql.close();
});

test('THE RECORD\'S OWN DOOR WALKS THE SAME, over the kernel\'s own readers', { skip: KERNEL_HAS ? false : 'this kernel has no clashes and fold plan yet' }, async () => {
  const r = await studio();
  await walk(realDoor(r.api), r);
  r.sql.close();
});

test('A KERNEL WITHOUT THE READERS ANSWERS NOTHING FOR THE LIST, and the press says so in words and files nothing', { skip: KERNEL_HAS ? 'this kernel has the readers' : false }, async () => {
  const { api, sql } = await studio();
  assert.equal(value<Twice>(await realDoor(api).heldTwice({ register: 'skills' }, owner)), null);
  const out = await realDoor(api).askFoldTwice({ register: 'skills' }, owner);
  assert.equal(refusal(out).code, 'NOT_IN_THIS_BUILD');
  assert.doesNotMatch(refusal(out).fix, /clashes|kernel|same\.ts/u);
  assert.equal(questions(sql).length, 0);
  sql.close();
});

test('A TOKEN IS REFUSED, in one sentence that sends it to the app, and nothing is asked', async () => {
  const { api, sql } = await studio();
  const out = await realDoor(api).askFoldTwice({ register: 'skills' }, agent);
  assert.equal(refusal(out).code, 'NEEDS_BROWSER_SESSION');
  assert.match(refusal(out).fix, /a person decides that, signed in/u);
  assert.equal(questions(sql).length, 0);
  sql.close();
});

test('A READER THE LIST IS CLOSED TO IS REFUSED AS TODAY, the read and the press, told nothing of what is in it', async () => {
  const { api, sql } = await studio();
  const read = await realDoor(api).heldTwice({ register: 'skills' }, shut);
  assert.equal(read.ok, false);
  assert.equal(refusal(read).code, refusal((await api.list({ register: 'skills' } as never, shut)) as Result<unknown>).code, 'refused as reading the list is');
  const press = await realDoor(api).askFoldTwice({ register: 'skills' }, shut);
  assert.equal(press.ok, false);
  for (const out of [read, press]) assert.doesNotMatch(JSON.stringify(refusal(out)), /Ponytail|Writing|Deploy|—/u);
  assert.equal(questions(sql).length, 0);
  sql.close();
});

test('NOTHING TWICE FILES NOTHING AND SAYS SO, and a list that says nothing of what is the same is told so', async () => {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  value(await api.kernel.install([SKILLS, NOTES] as never));
  value(api.kernel.create('skills', { name: 'Ponytail' } as never, { actor: 'p_1' }));
  const door = standInDoor(api, sql, { sameClashes: (list) => clashesIn(sql, list), sameFoldPlan: standInPlan(sql, []) });
  assert.deepEqual(value<Twice>(await door.heldTwice({ register: 'skills' }, owner)), { seqs: [] });
  const none = await door.askFoldTwice({ register: 'skills' }, owner);
  assert.equal(refusal(none).code, 'ALREADY_KNOWN');
  assert.equal(refusal(none).fix, 'Nothing in Skills is here twice, so nothing was asked.');
  /* A LIST WITHOUT same: is not looked at by the read, and the press says why. */
  assert.equal(value<Twice>(await door.heldTwice({ register: 'notes' }, owner)), null);
  assert.equal(refusal(await door.askFoldTwice({ register: 'notes' }, owner)).code, 'VALUE_MALFORMED');
  assert.equal(questions(sql).length, 0);
  sql.close();
});

test('A FOLD THAT MOVES A LINK HELD IN ANOTHER LIST IS ONE QUESTION, its row naming its own list, and one Undo puts it back', async () => {
  const r = await studio();
  const note = r.add('notes', { text: 'Use the short form', skill: r.later[0]!.id });
  const asked = value<Asked>(await standIn(r).askFoldTwice({ register: 'skills' }, owner));
  const open = questions(r.sql);
  assert.equal(open.length, 1);
  const rows = (JSON.parse(open[0]!.body) as { rows: { register?: string; patch: Record<string, unknown> }[] }).rows;
  assert.deepEqual(rows.filter((w) => w.register !== undefined).map((w) => [w.register, w.patch.skill]), [['notes', r.first[0]!.id]]);
  value(await r.api.decide({ id: asked.question, decide: { option: 'accept', reason: 'Fold them.' } } as never, owner));
  assert.equal(r.api.kernel.get(note.id)?.fields.skill, r.first[0]!.id, 'the note links the one kept');
  const decision = r.sql.one<{ id: string }>('SELECT id FROM decision ORDER BY rowid DESC LIMIT 1')!.id;
  const plan = value<{ hash: string }>(await r.api.undo({ decision, dry: true }, owner));
  value(await r.api.undo({ decision, hash: plan.hash }, owner));
  assert.equal(r.api.kernel.get(note.id)?.fields.skill, r.later[0]!.id, 'and links the one it named again');
  r.sql.close();
});

test('A GRANT NARROWED TO SOME SKILLS IS ANSWERED ONLY THOSE, and is not the one to fold the list', async () => {
  const r = await studio();
  const narrowed = { principal: { kind: 'person', id: 'p_4', level: 'write' }, wheres: { skills: { field: 'name', is: 'Ponytail' } } } as unknown as CallContext;
  const door = standIn(r);
  assert.deepEqual(value<Twice>(await door.heldTwice({ register: 'skills' }, narrowed)), { seqs: [r.first[0]!.seq!] });
  assert.equal(refusal(await door.askFoldTwice({ register: 'skills' }, narrowed)).code, 'FORBIDDEN');
  assert.equal(questions(r.sql).length, 0);
  r.sql.close();
});

test('THE QUESTION SAYS THE LIST BY ITS OWN NAME AND KEEPS BY ITS keep, and the plan is read whatever wraps it', () => {
  const decl = { name: 'Skills', one: 'skill' };
  assert.equal(foldQuestion(decl, { fields: ['name'] }, 3), '3 skills are here twice. Keep the oldest of each?');
  assert.equal(foldQuestion(decl, { fields: ['name'], keep: 'latest' }, 2), '2 skills are here twice. Keep the newest of each?');
  assert.equal(foldQuestion({ name: 'Keys', one: 'key' }, { fields: ['name'], keep: 'sealed' }, 4), '4 keys are here twice. Keep the one with the sealed value in each?');
  assert.equal(foldQuestion(decl, { fields: ['name'] }, 1), 'One skill is here twice. Keep the oldest?');
  const w = { register: 'skills', at: 'a', patch: { deleted_at: 'x' } };
  const gone = [{ register: 'skills', at: 'a', delete: true, note: 'Folded into Ponytail' }];
  assert.deepEqual(writesOf(gone, 'x'), [w]);
  assert.deepEqual(writesOf({ writes: [{ register: 'skills', id: 'a', version: 2, patch: { deleted_at: 'x' } }] }, 'y'), [{ ...w, version: 2 }]);
  assert.deepEqual(writesOf([{ key: 'k', keep: 'b', others: ['a'], writes: gone }, { nothing: true }], 'x'), [w]);
});
