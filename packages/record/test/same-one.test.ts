/**
 * `sameOne`: a person says two people may be one (AGT-D05, `src/methods/same-one.ts`). It files the question the
 * nightly pass files for the same people and answers its id; it merges nothing; asked twice is asked once; a caller
 * who cannot write to the list is refused, and so is a pick that is not a person.
 *
 * Through the real record and the kernel's own question (`people.ts`'s `askSame`), and the door's own shape (what it
 * takes, what it hands the kernel) over the method file alone. The first kind needs a kernel that has the verb and is
 * skipped by name on one that has not, where the door answers `NOT_IN_THIS_BUILD`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { no, ok, type Refusal, type Result } from '@braindog/ports';
import type { Entry } from '@braindog/kernel';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { methods, SAME_MOST } from '../src/methods/same-one.ts';
import type { RecordDeps } from '../src/methods/index.ts';
import { fixedClock, openSqlite, type NodeSql } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 13, 12);

const THINGS = {
  id: 'register.things',
  kind: 'register' as const,
  body: { id: 'things', name: 'Projects', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] } as never,
};

const PEOPLE = {
  id: 'register.people',
  kind: 'register' as const,
  body: {
    id: 'people',
    name: 'People',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'email', type: 'email', unique: true, index: true },
      { id: 'handles', type: 'list', of: 'text' },
      { id: 'projects', type: 'list', of: 'ref', to: 'things' },
      { id: 'met', type: 'list', of: 'text' },
      { id: 'merged_into', type: 'ref', to: 'people' },
    ],
  } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const reader: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'read' } };

const refusal = (out: Result<unknown>) => (out as { refusal: Refusal }).refusal;

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }));
  value(await api.kernel.install([THINGS, PEOPLE]));
  const add = (register: string, fields: Record<string, unknown>) => value<Entry>(api.kernel.create(register, fields as never, { actor: 'p_1' }));
  const teodor = add('people', { name: 'Teodor Vance', email: 'teodor@brightwell.example' });
  const teo = add('people', { name: 'Teo V', handles: ['github:teodorvance'] });
  const ines = add('people', { name: 'Ines Duarte' });
  const fanline = add('things', { name: 'Fanline' });
  return { api, sql, teodor, teo, ines, fanline };
}

/**
 * WHAT THE RECORD-WIDE TESTS WAIT ON, said by name where it is missing: the kernel's verb, which the door reads through
 * a local shape, and the method's two lines in `methods/index.ts`. Called through this so the file typechecks on a
 * record that has not registered it yet.
 */
type Api = Awaited<ReturnType<typeof createRecordApi>>;
type Asked = { question: string; opened: boolean };
const sameOne = (api: Api, args: unknown, ctx: CallContext): Promise<Result<Asked>> =>
  (api as unknown as { sameOne: (a: unknown, c: CallContext) => Promise<Result<Asked>> }).sameOne(args, ctx);
const probe = await createRecordApi({ sql: openSqlite(), clock: fixedClock(NOW) });
const REGISTERED = typeof (probe as unknown as { sameOne?: unknown }).sameOne === 'function';
const HAS_VERB = typeof (probe.kernel as unknown as { askSame?: unknown }).askSame === 'function';
const needsMethod = REGISTERED ? {} : { skip: 'sameOne is not registered in methods/index.ts yet' };
const needsVerb = !REGISTERED ? needsMethod : HAS_VERB ? {} : { skip: 'this kernel has no askSame yet' };

const open = (sql: NodeSql) => sql.all<{ id: string; body: string }>("SELECT id, body FROM suggestion WHERE status = 'open' ORDER BY rowid");
const live = (sql: NodeSql) => sql.one<{ n: number }>("SELECT count(*) AS n FROM entry WHERE register = 'people' AND deleted_at IS NULL")!.n;

test('A PERSON WITH WRITE ASKS ABOUT THE TWO PICKED: one question on Decide, by its id, and nobody is merged', needsVerb, async () => {
  const { api, sql, teodor, teo } = await record();
  const out = await sameOne(api, { register: 'people', rows: [teodor.id, teo.id] }, owner);
  const asked = value<Asked>(out);
  assert.equal(asked.opened, true);

  const waiting = open(sql);
  assert.deepEqual(waiting.map((q) => q.id), [asked.question], 'one question, and it is the one answered');
  const body = JSON.parse(waiting[0]!.body) as { register: string; rows: { at: string; patch: Record<string, unknown> }[]; candidates: { name: string; kept?: boolean }[] };
  assert.equal(body.register, 'people');
  assert.deepEqual(body.candidates.map((c) => c.name), ['Teodor Vance', 'Teo V'], 'exactly the people picked, and nobody like them');
  assert.equal(body.candidates.filter((c) => c.kept === true).length, 1, 'the card says who a yes keeps');
  assert.equal(body.rows.filter((r) => typeof r.patch.merged_into === 'string').length, 1, 'a yes folds the other into the one kept');
  assert.ok(body.rows.some((r) => Array.isArray(r.patch.handles)), 'and carries what the other holds');

  /* THE SENTENCE IS THE ONE THE NIGHTLY PASS WRITES, in names, with no id in it. */
  const question = api.kernel.question(asked.question) ?? '';
  assert.match(question, /^Are Teodor Vance .* and Teo V .* one person\? Yes keeps Teodor Vance and carries over the other's addresses, handles and where they were met\.$/u);
  assert.doesNotMatch(question, /people#|[0-9A-HJKMNP-TV-Z]{26}/u);

  /* NOTHING IS MERGED: both are still there, and neither points at the other. */
  assert.equal(live(sql), 3);
  for (const id of [teodor.id, teo.id]) assert.equal(api.kernel.get(id)?.fields.merged_into ?? null, null);
  sql.close();
});

test('ASKED TWICE IS ASKED ONCE: the second pick answers the question already waiting, in either order', needsVerb, async () => {
  const { api, sql, teodor, teo, ines } = await record();
  const first = value<Asked>(await sameOne(api, { register: 'people', rows: [teodor.id, teo.id] }, owner));
  const again = value<Asked>(await sameOne(api, { register: 'people', rows: [teo.id, teodor.id, teo.id] }, owner));
  assert.deepEqual(again, { question: first.question, opened: false });
  assert.equal(open(sql).length, 1);

  /* SOMEBODY ELSE PICKED WITH ONE OF THEM JOINS THE SAME QUESTION, so two questions never go stale on each other. */
  const more = value<Asked>(await sameOne(api, { register: 'people', rows: [teo.id, ines.id] }, owner));
  assert.deepEqual(more, { question: first.question, opened: true });
  const waiting = open(sql);
  assert.equal(waiting.length, 1);
  assert.equal((JSON.parse(waiting[0]!.body) as { candidates: unknown[] }).candidates.length, 3);
  assert.equal(live(sql), 3);
  sql.close();
});

test('A CALLER WHO CANNOT WRITE TO THE LIST IS REFUSED, and nothing is asked', needsMethod, async () => {
  const { api, sql, teodor, teo } = await record();
  const out = await sameOne(api, { register: 'people', rows: [teodor.id, teo.id] }, reader);
  assert.equal(out.ok, false);
  assert.equal(refusal(out).code, 'LEVEL_REQUIRED');
  assert.equal(refusal(out).fix, 'This needs write, and you have read access. Ask an owner to raise your access.', 'said by the access they hold and the one it needs');
  assert.doesNotMatch(refusal(out).fix, /p_2|[0-9A-HJKMNP-TV-Z]{26}/u);
  assert.equal(open(sql).length, 0);

  /* AND A WRITER ON ANOTHER LIST ONLY is held to this one's own level. */
  const elsewhere: CallContext = { principal: { kind: 'person', id: 'p_3', level: 'write' }, levels: { people: 'read' } };
  assert.equal(refusal(await sameOne(api, { register: 'people', rows: [teodor.id, teo.id] }, elsewhere)).code, 'LEVEL_REQUIRED');
  assert.equal(open(sql).length, 0);
  sql.close();
});

test('A PICK THAT IS NOT A PERSON IS REFUSED BY ITS NAME, and so is a list that is not the people', needsMethod, async () => {
  const { api, sql, teodor, fanline } = await record();
  const mixed = await sameOne(api, { register: 'people', rows: [teodor.id, fanline.id] }, owner);
  assert.equal(refusal(mixed).code, 'REF_REGISTER_MISMATCH');
  assert.equal(refusal(mixed).fix, 'Fanline is in Projects, not People. Pick people only.');

  const projects = await sameOne(api, { register: 'things', rows: [fanline.id, fanline.id] }, owner);
  assert.equal(refusal(projects).code, 'VALUE_MALFORMED');
  assert.match(refusal(projects).fix, /Projects/u);

  assert.equal(refusal(await sameOne(api, { register: 'people', rows: [teodor.id, '01JZ8QK3F7R2M9V4XN6TCB5HAD'] }, owner)).code, 'ROW_UNKNOWN');
  assert.equal(refusal(await sameOne(api, { register: 'people', rows: [teodor.id, teodor.id] }, owner)).code, 'REQUIRED_MISSING', 'one person picked twice is one person');
  assert.equal(refusal(await sameOne(api, { register: 'people', rows: 'everyone' }, owner)).code, 'VALUE_MALFORMED');
  assert.equal(open(sql).length, 0);
  sql.close();
});

/* ── the door alone, over a kernel that is four functions ─────────────── */

const ROWS: Record<string, { id: string; register: string; seq: number; name: string }> = {
  a: { id: 'a', register: 'people', seq: 1, name: 'Teodor Vance' },
  b: { id: 'b', register: 'people', seq: 2, name: 'Teo V' },
  'people#2': { id: 'b', register: 'people', seq: 2, name: 'Teo V' },
  f: { id: 'f', register: 'things', seq: 1, name: 'Fanline' },
};

/** The method file over a kernel that only looks rows up, with or without the verb, and a guard that says what it was asked. */
function door(verb?: (w: unknown, a: { rows: readonly string[] }) => Result<{ id: string; asked: boolean } | null>, stop: Refusal | null = null, shut: readonly string[] = []) {
  const guarded: unknown[] = [];
  const handed: unknown[] = [];
  let tails = 0;
  const kernel = {
    meetsList: () => ({ register: 'people', fields: { name: 'name' } }),
    register: (id: string) => ({ people: { name: 'People' }, things: { name: 'Projects' } })[id],
    get: (ref: string) => ROWS[ref] ?? null,
    titleOfRow: (ref: string) => ROWS[ref]?.name ?? null,
    /* THE CALLER'S RULE ON A LIST, as the kernel's one read scope answers it: here the numbers a narrowed grant admits. */
    scope: (ctx: CallContext, register: string) => (ctx.wheres as Record<string, number[]> | undefined)?.[register],
    /* A NARROWED GRANT, as the real kernel reads one: the rule here is the numbers it admits. */
    list: (q: { where: { is: number } }, rule: number[]) => ok({ rows: rule.includes(q.where.is) ? [{}] : [] }),
    ...(verb === undefined ? {} : { askSame: (w: unknown, a: { rows: readonly string[] }) => (handed.push([w, a]), verb(w, a)) }),
  };
  const deps = {
    kernel,
    guard: (_ctx: CallContext, need: string, asked?: string) => (guarded.push([need, asked]), stop),
    readable: (_ctx: CallContext, register: string) => (shut.includes(register) ? ({ code: 'LEVEL_REQUIRED', fix: 'No.' } as Refusal) : null),
    named: (args: { register?: unknown } | undefined) =>
      typeof args?.register === 'string' && args.register !== '' ? null : ({ code: 'REQUIRED_MISSING', fix: 'Say which list.', at: 'register' } as Refusal),
    no,
    tail: async <T>(out: T) => (tails++, out),
  } as unknown as RecordDeps;
  return { ...methods(deps), guarded, handed, tails: () => tails };
}

test('THE DOOR ASKS FOR WRITE ON THE LIST NAMED FIRST, and a caller without it reaches nothing', async () => {
  const stop: Refusal = { code: 'LEVEL_REQUIRED', fix: 'This needs write, and you have read access. Ask an owner to raise your access.', allowed: ['read'] };
  const shut = door(() => ok({ id: 'SG1', asked: true }), stop);
  const out = await shut.sameOne({ register: 'people', rows: ['a', 'b'] }, reader);
  assert.deepEqual(out, { ok: false, refusal: stop });
  assert.deepEqual(shut.guarded, [['write', 'people']]);
  assert.deepEqual(shut.handed, [], 'the kernel is never asked');
  assert.equal(shut.tails(), 0);

  /* A LIST THAT IS NOT NAMED AS ONE is guarded with none, never with what was sent. */
  const odd = door(() => ok({ id: 'SG1', asked: true }));
  assert.equal(refusal(await odd.sameOne({ register: { $ne: null }, rows: ['a', 'b'] }, owner)).code, 'REQUIRED_MISSING');
  assert.deepEqual(odd.guarded, [['write', undefined]]);
  assert.equal(refusal(await odd.sameOne(undefined, owner)).code, 'REQUIRED_MISSING');
});

test('THE DOOR HANDS THE KERNEL THE PEOPLE PICKED, once each by their ids, and the caller, and answers the question', async () => {
  const opened = door(() => ok({ id: 'SG7', asked: true }));
  assert.deepEqual(await opened.sameOne({ register: 'people', rows: ['a', 'people#2', 'b'] }, owner), { ok: true, value: { question: 'SG7', opened: true } });
  assert.deepEqual(opened.handed, [[{ actor: 'p_1' }, { rows: ['a', 'b'] }]]);
  assert.equal(opened.tails(), 1, 'a write arms what waits on it');

  const waiting = door(() => ok({ id: 'SG7', asked: false }));
  assert.deepEqual(await waiting.sameOne({ register: 'people', rows: ['b', 'a'] }, owner), { ok: true, value: { question: 'SG7', opened: false } });

  /* AN AGENT'S KEY SIGNS AS ITS KEY AND ITS RUN'S HINTS, as every write of its does. */
  const agent: CallContext = { principal: { kind: 'token', id: 't_claude', scope: 'write', person: 'p_1', level: 'owner' }, session: { client: 'claude-code', repo: 'braindog' } };
  const byKey = door(() => ok({ id: 'SG8', asked: true }));
  assert.ok((await byKey.sameOne({ register: 'people', rows: ['a', 'b'] }, agent)).ok);
  const [who] = byKey.handed[0] as [{ actor: string; principal: unknown; session: unknown }];
  assert.match(who.actor, /^agent:/u);
  assert.deepEqual(who.principal, { kind: 'token', token: 't_claude' });
  assert.deepEqual(who.session, agent.session);
});

test('THE DOOR REFUSES WHAT IS NOT TWO PEOPLE OF THE LIST BEFORE THE KERNEL IS ASKED, in names', async () => {
  const d = door(() => ok({ id: 'SG1', asked: true }));
  const mixed = await d.sameOne({ register: 'people', rows: ['a', 'f'] }, owner);
  assert.equal(refusal(mixed).code, 'REF_REGISTER_MISMATCH');
  assert.equal(refusal(mixed).fix, 'Fanline is in Projects, not People. Pick people only.');
  assert.equal(refusal(await d.sameOne({ register: 'things', rows: ['f', 'f'] }, owner)).code, 'VALUE_MALFORMED');
  assert.equal(refusal(await d.sameOne({ register: 'people', rows: ['a', 'gone'] }, owner)).code, 'ROW_UNKNOWN');
  assert.equal(refusal(await d.sameOne({ register: 'people', rows: ['a', 'a'] }, owner)).code, 'REQUIRED_MISSING');
  assert.equal(refusal(await d.sameOne({ register: 'people', rows: ['a'] }, owner)).code, 'REQUIRED_MISSING');
  for (const rows of [undefined, 'a,b', ['a', 7], ['a', ''], ['a', 'b c'], ['a', 'x'.repeat(65)]])
    assert.equal(refusal(await d.sameOne({ register: 'people', rows }, owner)).code, 'VALUE_MALFORMED', JSON.stringify(rows));
  assert.deepEqual(d.handed, []);
  assert.equal(d.tails(), 0);
  assert.equal(SAME_MOST, 12, "the kernel's most for one question");
});

test('WHAT THE CALLER MAY NOT READ IS NOT THERE FOR THEM: a list closed to them is never named, and nobody their grant leaves out is asked about', async () => {
  const closed = door(() => ok({ id: 'SG1', asked: true }), null, ['things']);
  const out = await closed.sameOne({ register: 'people', rows: ['a', 'f'] }, owner);
  assert.equal(refusal(out).code, 'ROW_UNKNOWN');
  assert.doesNotMatch(refusal(out).fix, /Fanline|Projects/u);
  assert.deepEqual(refusal(out), refusal(await closed.sameOne({ register: 'people', rows: ['a', 'gone'] }, owner)), 'said as one that is not there is');
  assert.deepEqual(closed.handed, []);

  const narrowed: CallContext = { principal: { kind: 'person', id: 'p_4', level: 'write' }, wheres: { people: [1] as never } };
  const d = door(() => ok({ id: 'SG1', asked: true }));
  assert.equal(refusal(await d.sameOne({ register: 'people', rows: ['a', 'b'] }, narrowed)).code, 'ROW_UNKNOWN');
  assert.deepEqual(d.handed, []);
  const both: CallContext = { ...narrowed, wheres: { people: [1, 2] as never } };
  assert.ok((await d.sameOne({ register: 'people', rows: ['a', 'b'] }, both)).ok);
});

test('A KERNEL WITHOUT THE VERB SAYS SO, and what the kernel refuses or cannot ask comes back in words', async () => {
  const old = door();
  const notYet = await old.sameOne({ register: 'people', rows: ['a', 'b'] }, owner);
  assert.equal(refusal(notYet).code, 'NOT_IN_THIS_BUILD');
  assert.doesNotMatch(refusal(notYet).fix, /askSame|kernel/u);

  const theirs = door(() => no('FORBIDDEN', 'Teo V was added by somebody else here.', { at: 'rows' }));
  assert.equal(refusal(await theirs.sameOne({ register: 'people', rows: ['a', 'b'] }, owner)).fix, 'Teo V was added by somebody else here.');
  assert.equal(theirs.tails(), 0);

  const stuck = door(() => ok(null));
  const out = await stuck.sameOne({ register: 'people', rows: ['a', 'b'] }, owner);
  assert.equal(refusal(out).code, 'TRANSITION_ILLEGAL');
  assert.match(refusal(out).fix, /already waiting on Decide/u);
});
