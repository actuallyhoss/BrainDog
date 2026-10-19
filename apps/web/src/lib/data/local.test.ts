/** `local.ts`: the local copy keeps what was read, drops what the log says moved, and wipes on any other owner. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  inOrder,
  keepable,
  localCopy,
  memoryStore,
  patched,
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

test('KEEPABLE: a known declaration, no secret field, never the vault or session; SCRUBBED drops credential keys and refuses a Map', () => {
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
  assert.deepEqual(await copy.answer('work', 'k', 'https://a', null), { value: [1], decls: { tasks: DECL }, current: true });
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
  assert.deepEqual(await next.answer('work', 'k', 'https://a', 'p_ada'), { value: 'w', decls: { tasks: DECL }, current: false });
  const built = localCopy(store, () => fake.log, { build: 'b2', now: () => NOON });
  assert.equal(await built.answer('work', 'k', 'https://a', 'p_ada'), null, 'another build reads no copy');
});

/* ── patching in place ─────────────────────────────────────────────────── */

const TASKS = {
  id: 'tasks',
  title: 'title',
  fields: [
    { id: 'title', type: 'text' },
    { id: 'state', type: 'enum' },
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
