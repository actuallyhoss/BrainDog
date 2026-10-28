/** `local.ts`: the local copy keeps what was read, drops what the log says moved, and wipes on any other owner. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  EVERY,
  inOrder,
  keepable,
  localCopy,
  localWhere,
  memoryStore,
  PAGE_ANSWERS,
  patched,
  patchedRow,
  railOf,
  QUESTIONS,
  REDACTED,
  scopeOf,
  scrubbed,
  touched,
  type Cursor,
  type Line,
  type Log,
  type Owner,
  type Spot,
  type Stored,
} from './local.ts';

const DECL = { id: 'tasks', fields: [{ id: 'title', type: 'text' }] };
const SECRET = { id: 'keys', fields: [{ id: 'value', type: 'secret' }] };
const ada: Owner = { base: 'https://a', person: 'p_ada', scope: scopeOf({ level: 'owner', owner: true, lists: null }) };
const NOON = new Date(2026, 9, 20, 12).getTime();

const line = (id: string, kind: string, register: string | null = null, rowid?: number): Line => ({ id, kind, register, ...(rowid === undefined ? {} : { rowid }) });

/** A log the test writes to: the newest first, as the record answers. */
function fakeLog(lines: Line[] = [line('e1', 'create', 'tasks', 1)]) {
  const asked: Cursor[] = [];
  let refuse: string | null = null;
  let capped = false;
  const log: Log = {
    async since(cursor) {
      asked.push(cursor);
      if (refuse) return { ok: false, refusal: { code: refuse } };
      const at = lines.findIndex((l) => l.rowid === cursor || `e.${l.id}` === cursor);
      const events = at === -1 ? lines : lines.slice(0, at + 1);
      return { ok: true, value: { events, upTo: events[0]?.rowid ?? null, sinceCapped: capped } };
    },
    async newest() {
      return { ok: true, value: { events: lines.slice(0, 1) } };
    },
  };
  return {
    log,
    asked,
    write: (l: Line) => lines.unshift(l),
    refuse: (code: string | null) => (refuse = code),
    cap: () => (capped = true),
  };
}

const setup = (lines?: Line[]) => {
  const store = memoryStore();
  const fake = fakeLog(lines);
  const copy = localCopy(store, () => fake.log, { build: 'b1', now: () => NOON });
  return { store, fake, copy };
};

test('TOUCHED: a row write names its list; a question names the questions; a quiet kind names none; anything it cannot place is everything', () => {
  assert.deepEqual([...touched([line('a', 'edit', 'tasks'), line('b', 'decide'), line('c', 'create', 'projects')]).lists].sort(), [QUESTIONS, 'projects', 'tasks']);
  assert.deepEqual([...touched([line('a', 'grant.add')]).lists], [], 'a grant moves no row');
  assert.equal(touched([line('a', 'edit', 'tasks')]).all, false);
  assert.equal(touched([line('a', 'declare')]).all, true, 'a declaration');
  assert.equal(touched([line('a', 'access.grant')]).all, true, 'a scope change');
  assert.equal(touched([line('a', 'setup')]).all, true, 'a setup folded into one line');
  assert.equal(touched([line('a', 'edit', null)]).all, true, 'a row write that names no list');
  assert.equal(touched([line('a', 'declare')], 'a').all, false, 'the cursor line is skipped');
  assert.deepEqual([...touched([{ id: 'p', kind: 'update', register: null, steps: [line('s', 'edit', 'tasks')] }]).lists], ['tasks'], 'a pass is its steps');
});

test('KEEPABLE: a known declaration, no secret field, never the Keychain or session; SCRUBBED drops credential keys and refuses a Map', () => {
  assert.equal(keepable(['tasks'], { tasks: DECL }), true);
  assert.equal(keepable(['tasks'], {}), false, 'an undeclared list is not kept');
  assert.equal(keepable(['keys'], { keys: SECRET }), false);
  assert.equal(keepable(['tasks', 'keys'], { tasks: DECL, keys: SECRET }), false, 'nor an answer naming a secret list');
  assert.equal(keepable(['tasks', 'people'], { tasks: DECL }), true, 'a named list not yet learnt is allowed beside a known one');
  assert.equal(keepable(['session'], { session: DECL }), false);
  assert.equal(keepable(['vault'], { vault: DECL }), false);
  assert.equal(keepable([QUESTIONS], {}), true, 'a pseudo list first needs no declaration');
  assert.equal(keepable([QUESTIONS, 'session'], {}), false, 'and still never beside the runs');
  assert.deepEqual(scrubbed({ a: 1, api_key: 'x', nested: [{ Access_Token: 'y', ok: true }] }), { a: 1, nested: [{ ok: true }] });
  assert.equal(scrubbed({ names: new Map() }), undefined);
});

test('NOTHING IS KEPT BEFORE A CLAIM; after one the cursor is taken first and an answer is kept and current', async () => {
  const { copy, store } = setup();
  assert.equal(await copy.put('work', 'k', ['tasks'], { tasks: DECL }, [1], copy.ticket()), false, 'no claim, no copy');
  await copy.claim(ada);
  assert.equal(store.saved?.cursor, 1);
  assert.equal(await copy.put('work', 'k', ['tasks'], { tasks: DECL }, [1], copy.ticket()), true);
  assert.deepEqual(await copy.answer('work', 'k', 'https://a', null), { value: [1], decls: { tasks: DECL }, current: true, kept: NOON });
  assert.equal(await copy.answer('work', 'k', 'https://b', null), null, 'another record answers nothing');
});

test('A CHANGE TO A LIST DROPS WHAT WAS READ FROM IT AND NOTHING ELSE, and the cursor moves to the newest line', async () => {
  const { copy, fake, store } = setup();
  await copy.claim(ada);
  const t = copy.ticket();
  await copy.put('work', 'tasks', ['tasks', 'projects'], { tasks: DECL }, 'w', t);
  await copy.put('list', 'notes', ['notes'], { notes: DECL }, 'n', t);
  fake.write(line('e2', 'edit', 'projects', 2));
  const asking = copy.heard();
  assert.equal((await copy.answer('list', 'notes', 'https://a', null))?.current, false, 'not current while the log is out');
  await asking;
  assert.equal(await copy.answer('work', 'tasks', 'https://a', null), null);
  assert.equal((await copy.answer('list', 'notes', 'https://a', null))?.current, true);
  assert.equal(store.saved?.cursor, 2);
  assert.equal(store.saved?.cursorId, 'e2');
  await copy.heard();
  assert.equal((await copy.answer('list', 'notes', 'https://a', null))?.current, true, 'the cursor line answered again is not news');
});

test('AN ANSWER ASKED BEFORE A DROP IS NOT KEPT AFTER IT', async () => {
  const { copy, fake } = setup();
  await copy.claim(ada);
  const before = copy.ticket();
  fake.write(line('e2', 'edit', 'tasks', 2));
  await copy.heard();
  assert.equal(await copy.put('work', 'k', ['tasks'], { tasks: DECL }, 'old', before), false);
  assert.equal(await copy.put('work', 'k', ['tasks'], { tasks: DECL }, 'new', copy.ticket()), true);
});

test('A DECLARATION, A CAPPED WALK OR A REFUSED CURSOR DROPS EVERYTHING; offline drops nothing', async () => {
  const { copy, fake } = setup();
  await copy.claim(ada);
  const keepOne = async () => copy.put('list', 'notes', ['notes'], { notes: DECL }, 'n', copy.ticket());
  await keepOne();
  fake.write(line('e2', 'declare', null, 2));
  await copy.heard();
  assert.equal(await copy.answer('list', 'notes', 'https://a', null), null, 'a declaration');

  await keepOne();
  fake.cap();
  fake.write(line('e3', 'decide', null, 3));
  await copy.heard();
  assert.equal(await copy.answer('list', 'notes', 'https://a', null), null, 'a capped walk');

  const { copy: c2, fake: f2, store: s2 } = setup();
  await c2.claim(ada);
  await c2.put('list', 'notes', ['notes'], { notes: DECL }, 'n', c2.ticket());
  f2.refuse('UNREACHABLE');
  await c2.heard();
  assert.equal((await c2.answer('list', 'notes', 'https://a', null))?.current, false, 'offline keeps the copy, possibly stale');
  f2.refuse('VALUE_MALFORMED');
  await c2.heard();
  assert.equal(await c2.answer('list', 'notes', 'https://a', null), null, 'a cursor the record will not take starts over');
  assert.equal(s2.saved?.cursor, 1, 'and takes the newest line again');
});

test('ANOTHER PERSON, SCOPE OR FORMAT, AND A WIPE, LEAVE NOTHING', async () => {
  const { copy, store } = setup();
  await copy.claim(ada);
  await copy.put('list', 'notes', ['notes'], { notes: DECL }, 'n', copy.ticket());
  await copy.claim({ ...ada, scope: scopeOf({ level: 'read', owner: false, lists: ['notes'] }) });
  assert.equal(store.rows.size, 0, 'a scope change');

  await copy.put('list', 'notes', ['notes'], { notes: DECL }, 'n', copy.ticket());
  await copy.stamp('1.1.1');
  assert.equal(store.rows.size, 1, 'the first stamp is the baseline');
  await copy.stamp('2.1.1');
  assert.equal(store.rows.size, 0, 'a moved format');

  await copy.put('list', 'notes', ['notes'], { notes: DECL }, 'n', copy.ticket());
  await copy.wipe();
  assert.equal(store.rows.size, 0);
  assert.equal(store.saved, null);
});

test('BEFORE THIS TAB CLAIMS IT, only the person the last shell named is answered', async () => {
  const store = memoryStore();
  const fake = fakeLog();
  const first = localCopy(store, () => fake.log, { build: 'b1', now: () => NOON });
  await first.claim(ada);
  await first.put('work', 'k', ['tasks'], { tasks: DECL }, 'w', first.ticket());

  const next = localCopy(store, () => fake.log, { build: 'b1', now: () => NOON });
  assert.equal(await next.answer('work', 'k', 'https://a', 'p_bo'), null);
  assert.deepEqual(await next.answer('work', 'k', 'https://a', 'p_ada'), { value: 'w', decls: { tasks: DECL }, current: false, kept: NOON });
  const built = localCopy(store, () => fake.log, { build: 'b2', now: () => NOON });
  assert.deepEqual(await built.answer('work', 'k', 'https://a', 'p_ada'), { value: 'w', decls: { tasks: DECL }, current: false, kept: NOON }, 'another build draws the copy');
});

test('A NEW BUILD KEEPS THE COPY, drawn and asked again, never current until it keeps the answer itself', async () => {
  const store = memoryStore();
  const fake = fakeLog();
  const first = localCopy(store, () => fake.log, { build: 'b1', now: () => NOON });
  await first.claim(ada);
  await first.put('work', 'k', ['tasks'], { tasks: DECL }, 'w', first.ticket());
  assert.equal((await first.answer('work', 'k', 'https://a', 'p_ada'))?.current, true, 'its own build reads it as current');

  const next = localCopy(store, () => fake.log, { build: 'b2', now: () => NOON });
  await next.claim(ada);
  const drawn = await next.answer('work', 'k', 'https://a', 'p_ada');
  assert.equal(drawn?.value, 'w', 'what the last build kept is drawn');
  assert.equal(drawn?.current, false, 'and asked again');
  assert.equal(store.saved?.build, 'b2', 'the claim says the new build');
  await next.put('work', 'k', ['tasks'], { tasks: DECL }, 'w2', next.ticket());
  assert.deepEqual(await next.answer('work', 'k', 'https://a', 'p_ada'), { value: 'w2', decls: { tasks: DECL }, current: true, kept: NOON }, 'kept again by this build, it is current');
});

/* ── patching in place ─────────────────────────────────────────────────── */

const TASKS = {
  id: 'tasks',
  title: 'title',
  fields: [
    { id: 'title', type: 'text' },
    { id: 'state', type: 'enum', values: ['open', 'doing', 'done'] },
    { id: 'due', type: 'day' },
    { id: 'tags', type: 'list', of: 'text' },
    { id: 'project', type: 'ref', to: 'projects' },
    { id: 'cost', type: 'money' },
  ],
};
const PROJECTS = { id: 'projects', title: 'name', fields: [{ id: 'name', type: 'text' }, { id: 'phase', type: 'enum' }] };

type Rows = { rows: { seq: number; fields: Record<string, unknown>; version: number }[]; moved: Record<number, string> };
const task = (seq: number, fields: Record<string, unknown>, version = 1) => ({ seq, fields, version });
const edit = (id: string, seq: number, field: string, from: unknown, to: unknown, more: Partial<Line> = {}): Line => ({
  id,
  kind: 'edit',
  register: 'tasks',
  seq,
  field,
  from,
  to,
  ts: `2026-10-20T12:00:0${id.length}Z`,
  ...more,
});

const stored = (value: unknown, spots: Spot[], lists = ['tasks', 'projects']): Stored => ({
  at: 'work k',
  name: 'work',
  key: 'k',
  lists,
  decls: { tasks: TASKS, projects: PROJECTS },
  value,
  kept: NOON,
  spots,
});
const WORK: Spot = { list: 'tasks', at: ['rows'], by: ['state'], moved: ['moved'] };

test('PATCHED: an edit lands on its row by number, moves its version on once a write, and stamps when it moved', () => {
  const row = stored({ rows: [task(1, { title: 'Call', due: '2026-10-21' }), task(2, { title: 'Pay' })], moved: {} }, [WORK]);
  const out = patched(row, [edit('a', 1, 'title', 'Call', 'Call the bank'), edit('b', 1, 'due', '2026-10-21', '2026-10-22', { batch: 'a' })]) as Rows;
  assert.deepEqual(out.rows[0]!.fields, { title: 'Call the bank', due: '2026-10-22' });
  assert.equal(out.rows[0]!.version, 2, 'two lines of one write are one version');
  assert.equal(out.rows[1]!.version, 1, 'another row is left alone');
  assert.equal(out.moved[1], '2026-10-20T12:00:01Z');
  assert.deepEqual((row.value as Rows).rows[0]!.fields, { title: 'Call', due: '2026-10-21' }, 'the kept answer itself is not changed');
});

test('PATCHED: a line already in the answer changes nothing; half a write in and half not drops it', () => {
  const row = stored({ rows: [task(1, { title: 'Call the bank', due: '2026-10-21' }, 2)], moved: {} }, [WORK]);
  assert.equal((patched(row, [edit('a', 1, 'title', 'Call', 'Call the bank')]) as Rows).rows[0]!.version, 2, 'already in: no second version');
  assert.equal(patched(row, [edit('a', 1, 'title', 'Call', 'Call the bank'), edit('b', 1, 'due', '2026-10-21', '2026-10-23', { batch: 'a' })]), undefined, 'one write, half in');
  assert.equal(patched(row, [edit('a', 1, 'title', 'Something', 'Else')]), undefined, 'a value the line never saw');
});

test('PATCHED: words are added and taken; a note changes nothing', () => {
  const row = stored({ rows: [task(1, { title: 'Call', tags: ['bank'] })], moved: {} }, [WORK]);
  const out = patched(row, [
    { id: 'a', kind: 'tag', register: 'tasks', seq: 1, field: 'tags', to: 'urgent' },
    { id: 'b', kind: 'untag', register: 'tasks', seq: 1, field: 'tags', from: 'bank' },
    { id: 'c', kind: 'note', register: 'tasks', seq: 1, field: null },
  ]) as Rows;
  assert.deepEqual(out.rows[0]!.fields.tags, ['urgent']);
  assert.equal(out.rows[0]!.version, 3);
});

test('PATCHED: what it cannot place drops the answer', () => {
  const row = stored({ rows: [task(1, { title: 'Call', state: 'open', project: 3 })], moved: {} }, [WORK]);
  assert.equal(patched(row, [{ ...edit('a', 1, 'state', 'open', 'done'), kind: 'state' }]), undefined, 'a field the question was asked by');
  assert.equal(patched(row, [edit('a', 1, 'project', 'x', 'y')]), undefined, 'a ref');
  assert.equal(patched(row, [edit('a', 1, 'cost', REDACTED, REDACTED)]), undefined, 'a redacted money field');
  assert.equal(patched(row, [{ id: 'a', kind: 'create', register: 'tasks', seq: 9 }]), undefined, 'a new row');
  assert.equal(patched(row, [{ id: 'a', kind: 'delete', register: 'tasks', seq: 1 }]), undefined, 'a row gone');
  assert.equal(patched(row, [edit('a', 9, 'state', 'done', 'open')]), undefined, 'a row it does not hold that could come in');
  assert.notEqual(patched(row, [edit('a', 9, 'title', 'x', 'y')]), undefined, 'a row it does not hold, by a field that cannot bring it in');
  assert.equal(patched(stored({ rows: [] }, []), [edit('a', 1, 'title', 'x', 'y')]), undefined, 'an answer with no spots');
  const derived = { ...stored({ rows: [task(1, { title: 'x' })] }, [WORK]), decls: { tasks: { ...TASKS, fields: [...TASKS.fields, { id: 'age', type: 'int', derive: 'x' }] } } };
  assert.equal(patched(derived, [edit('a', 1, 'title', 'x', 'y')]), undefined, 'a list that works a field out');
});

test('PATCHED: a list only named is news only when a name it shows moves', () => {
  const row = stored({ rows: [task(1, { title: 'Call', project: 3 })], moved: {} }, [WORK]);
  const phase: Line = { id: 'a', kind: 'edit', register: 'projects', seq: 3, field: 'phase', from: 'a', to: 'b' };
  assert.notEqual(patched(row, [phase]), undefined, 'a field no name is drawn from');
  assert.equal(patched(row, [{ ...phase, field: 'name' }]), undefined, 'the title');
  assert.equal(patched(row, [{ ...phase, kind: 'create' }]), undefined, 'a new project');
});

test("PATCHED: in the record's own order a placed write moves its row to the head; a row beyond the page cannot be placed", () => {
  const spot: Spot = { list: 'tasks', at: ['entries'], by: [], newest: true };
  const row = stored({ entries: [task(1, { title: 'a' }), task(2, { title: 'b' })] }, [spot]);
  const out = patched(row, [edit('a', 2, 'title', 'b', 'B')]) as { entries: { seq: number }[] };
  assert.deepEqual(out.entries.map((e) => e.seq), [2, 1]);
  assert.equal(patched(row, [edit('a', 7, 'title', 'x', 'y')]), undefined);
  assert.equal(patched({ ...row, spots: [{ ...spot, by: null }] }, [edit('a', 1, 'title', 'a', 'A')]), undefined, 'a search reads every field');
});

test("IN ORDER: oldest first, a pass's steps in its place, the cursor line left out", () => {
  const pass: Line = { id: 'p', kind: 'update', register: null, steps: [line('s2', 'edit', 'tasks'), line('s1', 'edit', 'tasks')] };
  assert.deepEqual(inOrder([line('n', 'edit', 'tasks'), pass, line('c', 'edit', 'tasks')], 'c').map((l) => l.id), ['s1', 's2', 'n']);
});

test('A CATCH-UP PATCHES WHAT IT CAN AND DROPS WHAT IT CANNOT; an answer kept `always` is never current', async () => {
  const { copy, fake } = setup();
  await copy.claim(ada);
  const t = copy.ticket();
  const decls = { tasks: TASKS, projects: PROJECTS };
  await copy.put('work', 'k', ['tasks'], decls, { rows: [task(1, { title: 'Call' })], moved: {} }, t, { spots: [WORK] });
  await copy.put('list', 'k', ['tasks'], decls, { rows: [task(1, { title: 'Call' })] }, t);
  await copy.put('today', 'k', ['tasks'], decls, { n: 1 }, t, { always: true });
  assert.equal((await copy.answer('today', 'k', 'https://a', null))?.current, false, 'always asked behind');
  fake.write({ ...edit('e2', 1, 'title', 'Call', 'Call the bank'), rowid: 2 });
  const before = copy.ticket();
  await copy.heard();
  const work = await copy.answer<Rows>('work', 'k', 'https://a', null);
  assert.equal(work?.value.rows[0]!.fields.title, 'Call the bank');
  assert.equal(work?.current, true, 'patched and caught up');
  assert.equal(await copy.answer('list', 'k', 'https://a', null), null, 'no spots: dropped as before');
  assert.equal(await copy.put('work', 'k', ['tasks'], decls, { rows: [] }, before, { spots: [WORK] }), false, 'a read from before the patch is not kept over it');
});

/* ── creates and deletes ───────────────────────────────────────────────── */

const LIST: Spot = {
  list: 'tasks',
  at: ['entries'],
  by: ['state'],
  newest: true,
  lands: { where: { field: 'state', is: 'open' }, exact: true, more: ['cursor'], count: ['matched'], tally: ['counted'] },
};
type Listed = { entries: { seq: number; fields: Record<string, unknown>; version: number; id?: string }[]; matched: number; cursor: string | null; counted?: unknown };
const make = (id: string, seq: number, to: Record<string, unknown>, more: Partial<Line> = {}): Line => ({ id, kind: 'create', register: 'tasks', seq, field: null, to, target: `entry:R${seq}`, ts: '2026-10-20T12:00:00Z', ...more });
const listed = (entries: ReturnType<typeof task>[], more: Partial<Listed> = {}) => ({ entries, matched: entries.length, cursor: null, ...more });

test('CREATE: a row the filter takes lands at the head, counted, with its id and version one', () => {
  const row = stored(listed([task(1, { title: 'a', state: 'open' })]), [LIST]);
  const out = patched(row, [make('c', 2, { title: 'b', state: 'open', project: null })]) as Listed;
  assert.deepEqual(out.entries.map((e) => e.seq), [2, 1]);
  assert.equal(out.entries[0]!.id, 'R2');
  assert.equal(out.entries[0]!.version, 1);
  assert.deepEqual(out.entries[0]!.fields, { title: 'b', state: 'open' }, 'an empty field is left out');
  assert.equal(out.matched, 2);
});

test('CREATE: the new row says who made it, and is mine when the reader the copy is kept for made it', () => {
  const row = stored(listed([task(1, { title: 'a', state: 'open' })]), [LIST]);
  type Made = Listed['entries'][number] & { by?: string; mine?: true };
  const mine = (patched(row, [make('c', 2, { title: 'b', state: 'open' }, { actor: 'p_ada' })], 'p_ada') as Listed).entries[0] as Made;
  assert.equal(mine.by, 'p_ada');
  assert.equal(mine.mine, true);
  const theirs = (patched(row, [make('c', 2, { title: 'b', state: 'open' }, { actor: 'run_7' })], 'p_ada') as Listed).entries[0] as Made;
  assert.equal(theirs.by, 'run_7');
  assert.equal(theirs.mine, undefined, 'an agent run is not the reader, as far as the browser can tell');
  assert.equal(((patched(row, [make('c', 2, { title: 'b', state: 'open' })]) as Listed).entries[0] as Made).by, '', 'no actor logged');
});

test('CREATE: a row the filter leaves out is not news when the filter is the question, and drops the answer when it is not', () => {
  const row = stored(listed([task(1, { title: 'a', state: 'open' })]), [LIST]);
  assert.deepEqual((patched(row, [make('c', 2, { title: 'b', state: 'done' })]) as Listed).entries.map((e) => e.seq), [1]);
  const loose = stored(listed([task(1, { title: 'a', state: 'open' })]), [{ ...LIST, lands: { ...LIST.lands!, exact: false } }]);
  assert.equal(patched(loose, [make('c', 2, { title: 'b', state: 'done' })]), undefined);
});

test('CREATE: what the browser cannot answer as the record would drops the answer', () => {
  const row = (lands: Spot['lands']) =>
    stored(listed([task(1, { title: 'a', state: 'open' })]), [lands ? { ...LIST, lands } : { list: LIST.list, at: LIST.at, by: LIST.by, newest: true }]);
  assert.equal(patched(row(undefined), [make('c', 2, { title: 'b' })]), undefined, 'no lands, as before');
  assert.equal(patched(row({ ...LIST.lands!, where: { field: 'due', before: 'today' } }), [make('c', 2, { title: 'b' })]), undefined, 'a relative day');
  assert.equal(patched(row({ ...LIST.lands!, where: { field: 'project', is: '3' } }), [make('c', 2, { title: 'b' })]), undefined, 'a ref');
  assert.equal(patched(row({ ...LIST.lands!, where: null }), [make('c', 2, { title: 'b', project: 'R9' })]), undefined, 'a ref value on the row');
  assert.equal(patched(row({ ...LIST.lands!, where: null }), [make('c', 2, { title: REDACTED })]), undefined, 'a redacted value');
  assert.equal(patched(row({ ...LIST.lands!, where: null }), [make('c', 2, { title: 'b', cost: { amount: 1, currency: 'GBP' } })]), undefined, 'a money value');
});

test('CREATE: with a sort it goes where the record puts it, empties last and the newest first among equals; past a page it is only counted', () => {
  const spot: Spot = { list: 'tasks', at: ['entries'], by: ['due'], lands: { where: null, exact: true, sort: { field: 'due', dir: 'asc' }, more: ['cursor'], count: ['matched'] } };
  const rows = [task(1, { due: '2026-10-01' }), task(2, { due: '2026-10-05' }), task(3, {})];
  const seqs = (v: unknown) => (v as Listed).entries.map((e) => e.seq);
  assert.deepEqual(seqs(patched(stored(listed(rows), [spot]), [make('c', 9, { due: '2026-10-03' })])), [1, 9, 2, 3]);
  assert.deepEqual(seqs(patched(stored(listed(rows), [spot]), [make('c', 9, { due: '2026-10-05' })])), [1, 9, 2, 3], 'equal: the new one first');
  assert.deepEqual(seqs(patched(stored(listed(rows), [spot]), [make('c', 9, {})])), [1, 2, 9, 3], 'empty: first of the empties');
  const paged = listed(rows.slice(0, 2), { cursor: 'next', matched: 10 });
  const out = patched(stored(paged, [spot]), [make('c', 9, { due: '2026-11-01' })]) as Listed;
  assert.deepEqual(out.entries.map((e) => e.seq), [1, 2], 'on a later page');
  assert.equal(out.matched, 11);
  const byTitle: Spot = { ...spot, lands: { ...spot.lands!, sort: { field: 'title', dir: 'asc' } } };
  assert.equal(patched(stored(listed(rows), [byTitle]), [make('c', 9, { title: 'x' })]), undefined, 'text order is the record collation');
});

test('CREATE: pills count it on a whole question and give up on a narrowed one; a create already in is skipped', () => {
  const counted = [['state', [['open', 1], ['done', 0]]]];
  const whole = stored(listed([task(1, { state: 'open' })], { counted }), [{ ...LIST, lands: { ...LIST.lands!, where: null } }]);
  assert.deepEqual((patched(whole, [make('c', 2, { state: 'done' })]) as Listed).counted, [['state', [['open', 1], ['done', 1]]]]);
  const narrowed = stored(listed([task(1, { state: 'open' })], { counted }), [LIST]);
  assert.equal(patched(narrowed, [make('c', 2, { state: 'open' })]), undefined);
  const row = stored(listed([task(2, { state: 'open' }), task(1, { state: 'open' })]), [LIST]);
  assert.equal((patched(row, [make('c', 2, { state: 'open' })]) as Listed).matched, 2, 'kept after the create');
});

test('DELETE: a held row goes and its counts with it; one not held is news only past a page or under narrowed pills', () => {
  const counted = [['state', [['open', 2]]]];
  const row = stored(listed([task(1, { state: 'open' }), task(2, { state: 'open' })], { counted }), [LIST]);
  const out = patched(row, [{ id: 'd', kind: 'delete', register: 'tasks', seq: 1 }]) as Listed;
  assert.deepEqual(out.entries.map((e) => e.seq), [2]);
  assert.equal(out.matched, 1);
  assert.deepEqual(out.counted, [['state', [['open', 1]]]]);
  const plain = stored(listed([task(1, { state: 'open' })]), [LIST]);
  assert.notEqual(patched(plain, [{ id: 'd', kind: 'delete', register: 'tasks', seq: 7 }]), undefined, 'not held, nothing past it');
  assert.equal(patched(stored(listed([task(1, {})], { cursor: 'n' }), [LIST]), [{ id: 'd', kind: 'delete', register: 'tasks', seq: 7 }]), undefined, 'maybe on a later page');
  assert.equal(patched(row, [{ id: 'd', kind: 'delete', register: 'tasks', seq: 7 }]), undefined, 'maybe in a pill');
  assert.equal(patched(row, [{ id: 'r', kind: 'restore', register: 'tasks', seq: 7 }]), undefined, 'a restore still drops it');
});

test('CREATE THEN EDIT IN ONE WRITE is one version', () => {
  const row = stored(listed([]), [{ ...LIST, by: [] }]);
  const out = patched(row, [make('c', 2, { title: 'b', state: 'open' }, { batch: 'w' }), edit('e', 2, 'title', 'b', 'B', { batch: 'w' })]) as Listed;
  assert.equal(out.entries[0]!.fields.title, 'B');
  assert.equal(out.entries[0]!.version, 1);
});

test('RAIL: the lists by name, a count only from a whole list, and the pages kept with their nav', () => {
  const list: Stored = { ...stored(listed([task(1, {})], { matched: 4 }), [{ ...LIST, lands: { ...LIST.lands!, where: null } }], ['tasks', 'projects']), decls: { tasks: { ...TASKS, name: 'Tasks' }, projects: PROJECTS } };
  const page: Stored = {
    at: 'Page x',
    name: PAGE_ANSWERS,
    key: JSON.stringify(['https://a', 'work', []]),
    lists: [':page', 'tasks'],
    decls: {},
    value: { from: 'live', page: { page: { title: 'Work', nav: { section: 'Work', order: 1 } }, blocks: [] }, now: 0 },
    kept: NOON,
  };
  const rail = railOf([list, page]);
  assert.deepEqual(rail.lists, [
    { id: 'tasks', name: 'Tasks', icon: null, count: 4 },
    { id: 'projects', name: 'projects', icon: null, count: null },
  ]);
  assert.deepEqual(rail.pages, [{ slug: 'work', title: 'Work', icon: null, section: 'Work', order: 1 }]);
});

test('HELD AND SIZE: only the owner is handed the answers; the size counts them', async () => {
  const { copy } = setup();
  await copy.claim(ada);
  await copy.put('work', 'k', ['tasks'], { tasks: DECL }, [1], copy.ticket());
  assert.equal((await copy.held('https://a', null)).length, 1);
  assert.equal((await copy.held('https://b', null)).length, 0);
  const size = await copy.size();
  assert.equal(size.answers, 1);
  assert.ok(size.bytes > 0);
});

test('LOCAL WHERE: plain fields with literal values only', () => {
  assert.equal(localWhere({ all: [{ field: 'state', in: ['open', 'doing'] }, { field: 'due', before: '2026-11-01' }] }, TASKS), true);
  assert.equal(localWhere({ field: 'tags', has: 'bank' }, TASKS), true);
  assert.equal(localWhere({ field: 'tags', is: 'bank' }, TASKS), false, 'a list is not asked is');
  assert.equal(localWhere({ field: 'due', after: '+30d' }, TASKS), false);
  assert.equal(localWhere({ field: 'title', matches: 'x' }, TASKS), false);
  assert.equal(localWhere({ field: 'nope', is: 'x' }, TASKS), false);
  assert.equal(localWhere({ pointed: { register: 'projects', by: 'project' } }, TASKS), false);
});

/* ── refs on a create, restores, questions, rows drawn a screen's way, eviction ─────────── */

test('CREATE WITH A REF: drawn as the number of the row it points at when the answer holds its id, else dropped', () => {
  const spot: Spot = { ...LIST, lands: { ...LIST.lands!, where: null, ids: ['ids'] } };
  const row = stored({ ...listed([task(1, { state: 'open' })]), ids: [['projects R3', 3]] }, [spot]);
  const out = patched(row, [make('c', 2, { title: 'b', project: 'R3' })]) as Listed;
  assert.equal(out.entries[0]!.fields.project, 3);
  assert.notEqual(patched(row, [make('c', 2, { title: 'b', project: 'entry:R3' })]), undefined, 'the log may say entry:');
  assert.equal(patched(row, [make('c', 2, { title: 'b', project: 'R9' })]), undefined, 'a row it holds no id for');
});

test('RESTORE: a row a placed delete took out comes back where it stood, one version on; one never held drops it', () => {
  const row = stored(listed([task(1, { state: 'open' }, 4), task(2, { state: 'open' })]), [LIST]);
  const del: Line = { id: 'd', kind: 'delete', register: 'tasks', seq: 1 };
  const gone = patchedRow(row, [del])!;
  assert.deepEqual((gone.value as Listed).entries.map((e) => e.seq), [2]);
  assert.equal(gone.gone?.length, 1, 'kept beside the answer');
  const back = patchedRow(gone, [{ id: 'r', kind: 'restore', register: 'tasks', seq: 1 }])!;
  assert.deepEqual((back.value as Listed).entries.map((e) => e.seq), [1, 2]);
  assert.equal((back.value as Listed).entries[0]!.version, 5);
  assert.equal((back.value as Listed).matched, 2);
  assert.equal(back.gone, undefined, 'and no longer kept aside');
  assert.notEqual(patched(row, [del, { id: 'r', kind: 'restore', register: 'tasks', seq: 1 }]), undefined, 'both in one catch-up');
  assert.equal(patched(row, [{ id: 'r', kind: 'restore', register: 'tasks', seq: 9 }]), undefined);
});

const ASKS: Spot = { list: QUESTIONS, at: ['questions'], by: null, questions: { total: ['open'] } };
const asked = (ids: string[], open = ids.length) => ({ questions: ids.map((id) => ({ id })), open });
const resolve = (id: string, to = 'accepted'): Line => ({ id: 'z', kind: 'resolve', register: null, target: `suggestion:${id}`, to });

test('QUESTIONS: an answer takes its card out and the count down; a decision adds nothing; a question asked drops it', () => {
  const row = stored(asked(['SG1', 'SG2']), [ASKS], [QUESTIONS]);
  const out = patched(row, [{ id: 'y', kind: 'decide', register: null, target: 'decision:D1' }, resolve('SG1')]) as ReturnType<typeof asked>;
  assert.deepEqual(out.questions, [{ id: 'SG2' }]);
  assert.equal(out.open, 1);
  assert.notEqual(patched(row, [resolve('SG7')]), undefined, 'one it never counted');
  assert.equal(patched(stored(asked(['SG1', 'SG2'], 5), [ASKS], [QUESTIONS]), [resolve('SG1')]), undefined, 'one not drawn would take its place');
  assert.equal(patched(stored(asked(['q.01J']), [ASKS], [QUESTIONS]), [resolve('SG7')]), undefined, 'named otherwise than the line');
  assert.equal(patched(row, [{ id: 'x', kind: 'suggest', register: null, target: 'suggestion:SG3' }]), undefined, 'a question asked');
  assert.equal(patched(stored(asked(['SG1']), [], [QUESTIONS]), [resolve('SG1')]), undefined, 'no spot for them');
});

test('QUESTIONS ON A PAGE THAT DRAWS WHAT WAS DECIDED: only a withdrawal is placed, and counts it cannot move go', () => {
  const spot: Spot = { ...ASKS, questions: { total: ['open'], decided: true, drops: [['waiting']] } };
  const row = stored({ ...asked(['SG1', 'SG2']), waiting: { hardToUndo: 1, stale: 0 } }, [spot], [QUESTIONS]);
  const out = patched(row, [resolve('SG1', 'withdrawn')]) as { waiting?: unknown; open: number };
  assert.equal(out.open, 1);
  assert.equal(out.waiting, undefined);
  assert.equal(patched(row, [resolve('SG1')]), undefined, 'an answer is decided');
  assert.equal(patched(row, [{ id: 'y', kind: 'decide', register: null, target: 'decision:D1' }]), undefined);
});

const SHOWN: Spot = {
  list: 'tasks',
  at: ['tasks'],
  by: null,
  shown: { says: { title: 'what' }, asks: ['state', 'due'], leaves: { field: 'state', values: ['done'] } },
};
type Drawn = { tasks: { seq: number; what: string; version: number }[] };
const drawn = (full = false): Stored => stored({ tasks: [{ seq: 1, what: 'Call', version: 1 }, { seq: 2, what: 'Pay', version: 1 }] }, [{ ...SHOWN, shown: { ...SHOWN.shown!, full } }]);

test('SHOWN: a drawn field takes the value logged, another moves the version, done takes the row out', () => {
  const out = patched(drawn(), [edit('a', 1, 'title', 'Call', 'Call the bank'), edit('b', 2, 'tags', null, ['x'])]) as Drawn;
  assert.deepEqual(out.tasks[0], { seq: 1, what: 'Call the bank', version: 2 });
  assert.equal(out.tasks[1]!.version, 2, 'a field it does not draw');
  assert.deepEqual((patched(drawn(), [{ ...edit('a', 2, 'state', 'open', 'done'), kind: 'state' }]) as Drawn).tasks.map((t) => t.seq), [1]);
  assert.notEqual(patched(drawn(), [edit('a', 7, 'title', 'x', 'y')]), undefined, 'a row it does not draw');
  assert.deepEqual((patched(drawn(), [{ id: 'd', kind: 'delete', register: 'tasks', seq: 1 }]) as Drawn).tasks.map((t) => t.seq), [2]);
});

test('SHOWN: a field the reads asked by, a create, an emptied title or a full read drops it', () => {
  assert.equal(patched(drawn(), [edit('a', 1, 'due', null, '2026-10-21')]), undefined);
  assert.equal(patched(drawn(), [edit('a', 9, 'due', null, '2026-10-21')]), undefined, 'and it could bring one in');
  assert.equal(patched(drawn(), [make('c', 9, { title: 'x' })]), undefined);
  assert.equal(patched(drawn(), [edit('a', 1, 'title', 'Call', '')]), undefined);
  assert.equal(patched(drawn(true), [{ ...edit('a', 2, 'state', 'open', 'done'), kind: 'state' }]), undefined, 'one past the limit would come in');
});

test('EVERY: an answer that reads more than it names drops on a line about a list it holds no spot for', () => {
  const row = stored({ tasks: [] }, [SHOWN], ['tasks', EVERY]);
  const money: Line = { id: 'a', kind: 'edit', register: 'accounts', seq: 1, field: 'balance', from: 1, to: 2 };
  assert.equal(patched(row, [money]), undefined);
  assert.notEqual(patched(row, [line('g', 'grant.add')]), undefined, 'a line that moves no row');
  assert.notEqual(patched({ ...row, lists: ['tasks'] }, [money]), undefined, 'without it, not its business');
});

test('A CATCH-UP HANDS AN `EVERY` ANSWER TO THE PATCH, whatever list the line names', async () => {
  const { copy, fake } = setup();
  await copy.claim(ada);
  await copy.put('today', 'k', ['tasks', EVERY], { tasks: TASKS }, { tasks: [] }, copy.ticket(), { spots: [SHOWN] });
  fake.write({ id: 'e2', kind: 'edit', register: 'accounts', rowid: 2, seq: 1, field: 'balance', from: 1, to: 2 });
  await copy.heard();
  assert.equal(await copy.answer('today', 'k', 'https://a', null), null);
});

test('EVICTION: the least recently opened go first past the count or the bytes, never the one just kept', async () => {
  const store = memoryStore();
  const at = (name: string, opened: number, bytes: number): Stored => ({ at: name, name, key: '', lists: ['tasks'], decls: {}, value: null, kept: 0, opened, bytes });
  await store.put(at('old', 1, 10));
  await store.put(at('mid', 2, 10));
  await store.put(at('new', 3, 10));
  await store.prune(2, 1_000, null);
  assert.deepEqual([...store.rows.keys()].sort(), ['mid', 'new']);
  await store.put(at('big', 0, 50));
  await store.prune(10, 30, 'big');
  assert.deepEqual([...store.rows.keys()], ['big'], 'over the bytes, every other answer goes first');
  await store.touch('big', 9);
  assert.equal(store.rows.get('big')?.opened, 9);
});

test('AN ANSWER BIGGER THAN THE BUDGET IS NOT KEPT, and a kept one says when it was opened and its size', async () => {
  const { copy, store } = setup();
  await copy.claim(ada);
  assert.equal(await copy.put('work', 'k', ['tasks'], { tasks: DECL }, [1], copy.ticket()), true);
  const kept = store.rows.get('work k')!;
  assert.equal(kept.opened, NOON);
  assert.ok((kept.bytes ?? 0) > 0);
  assert.equal(await copy.put('work', 'big', ['tasks'], { tasks: DECL }, 'x'.repeat(21 * 1024 * 1024), copy.ticket()), false);
});

test('REVISION: a list moves only when the log touched it, everything moves on a declaration, and nothing is vouched for before the copy has caught up', async () => {
  const { fake, copy } = setup();
  assert.equal(copy.revision('tasks'), null, 'not claimed');
  await copy.claim(ada);
  const tasks = copy.revision('tasks');
  const projects = copy.revision('projects');
  const declared = copy.revision();
  assert.notEqual(tasks, null);
  fake.write(line('e2', 'edit', 'tasks', 2));
  const asking = copy.heard();
  assert.equal(copy.revision('tasks'), null, 'a move heard and not yet caught up');
  await asking;
  assert.notEqual(copy.revision('tasks'), tasks, 'the log touched tasks');
  assert.equal(copy.revision('projects'), projects, 'and not projects');
  assert.equal(copy.revision(), declared, 'and no declaration');
  fake.write(line('e3', 'declare', null, 3));
  await copy.heard();
  assert.notEqual(copy.revision(), declared, 'a declaration moves the declarations');
  assert.notEqual(copy.revision('projects'), projects, 'and every list');
  fake.refuse('UNREACHABLE');
  await copy.heard();
  assert.equal(copy.revision('projects'), null, 'a catch-up that failed vouches for nothing');
});

test('SCOPE: the access epoch and what shares narrow are in the fingerprint, and nobody else\'s fingerprint moves', () => {
  const member = { level: 'write', owner: false, lists: null };
  /* SOMEBODY NO SHARE LET IN KEEPS THE FINGERPRINT THEY HAD, so an owner's copy outlives this change. */
  assert.equal(scopeOf(member), JSON.stringify(['write', false, null, null]));
  const guest = { level: 'read', owner: false, lists: ['tasks'], grant: { epoch: 4 }, lens: 'k1' };
  assert.notEqual(scopeOf(guest), scopeOf({ ...guest, grant: { epoch: 5 } }), 'a share changed is a new owner');
  assert.notEqual(scopeOf(guest), scopeOf({ ...guest, lens: 'k2' }), 'a narrowing changed is a new owner');
  assert.notEqual(scopeOf({ ...member, lens: 'k1' }), scopeOf(member), 'a member narrowed by a rule is a new owner');
  assert.equal(scopeOf(guest), scopeOf({ ...guest }), 'the same grant is the same owner');
});

test('A GUEST\'S COPY IS DRAWN A DAY AT MOST, after it was kept and after the last live open, and never past the share', async () => {
  const store = memoryStore();
  const fake = fakeLog();
  let t = NOON;
  const copy = localCopy(store, () => fake.log, { build: 'b1', now: () => t });
  const scope = scopeOf({ level: 'read', owner: false, lists: ['tasks'], grant: { epoch: 2 } });
  const priya: Owner = { base: 'https://a', person: 'p_pri', scope, guest: { until: new Date(NOON + 30 * 3_600_000).toISOString() } };
  await copy.claim(priya);
  assert.equal(store.saved?.live, NOON);
  assert.equal(await copy.put('work', 'k', ['tasks'], { tasks: DECL }, [1], copy.ticket()), true);
  t = NOON + 23 * 3_600_000;
  assert.ok(await copy.answer('work', 'k', 'https://a', null), 'a guest\'s copy went inside the day');
  t = NOON + 24 * 3_600_000;
  assert.equal(await copy.answer('work', 'k', 'https://a', null), null, 'a guest\'s copy outlived the day');
  assert.deepEqual(await copy.held('https://a', null), []);

  /* AND NEVER PAST THE SHARE'S END, however fresh. */
  const short: Owner = { ...priya, guest: { until: new Date(NOON + 2 * 3_600_000).toISOString() } };
  const other = localCopy(memoryStore(), () => fakeLog().log, { build: 'b1', now: () => t });
  t = NOON;
  await other.claim(short);
  await other.put('work', 'k', ['tasks'], { tasks: DECL }, [1], other.ticket());
  t = NOON + 2 * 3_600_000;
  assert.equal(await other.answer('work', 'k', 'https://a', null), null, 'a copy was drawn past the share\'s end');

  /* AN OWNER'S COPY IS STILL A WEEK. */
  const own = localCopy(memoryStore(), () => fakeLog().log, { build: 'b1', now: () => t });
  t = NOON;
  await own.claim(ada);
  await own.put('work', 'k', ['tasks'], { tasks: DECL }, [1], own.ticket());
  t = NOON + 6 * 24 * 3_600_000;
  assert.ok(await own.answer('work', 'k', 'https://a', null));
});
