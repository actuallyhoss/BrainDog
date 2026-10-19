/** `local.ts`: the local copy keeps what was read, drops what the log says moved, and wipes on any other owner. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { keepable, localCopy, memoryStore, scopeOf, scrubbed, touched, type Cursor, type Line, type Log, type Owner } from './local.ts';

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

test('TOUCHED: a row write names its list; a quiet kind names none; anything it cannot place is everything', () => {
  assert.deepEqual([...touched([line('a', 'edit', 'tasks'), line('b', 'decide'), line('c', 'create', 'projects')]).lists].sort(), ['projects', 'tasks']);
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
