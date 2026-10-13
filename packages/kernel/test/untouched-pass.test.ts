/**
 * `untouchedExamples`, read in one pass: which planted rows nobody has touched.
 *
 * The kernel asked the whole record once for each untouched planted row whether a row of the person's names it
 * (`instr(fields, id)`), which was the cost of the first boot after every write. It now reads each live row once and
 * looks its text over for every id asked about. The answers must not move, so each test here works the old question out
 * in SQL beside the kernel's answer and holds the two equal: over examples linked to each other, a real row naming one,
 * a deleted row naming one, a row formed around the person's own words, and an id written inside a longer text.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 14, 12);
const W = { actor: 'system' } as never;

const PROJECTS: Declaration = {
  id: 'register.projects',
  kind: 'register',
  body: {
    id: 'projects',
    name: 'Projects',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
    ],
  } as never,
};

const TASKS: Declaration = {
  id: 'register.tasks',
  kind: 'register',
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'project', type: 'ref', to: 'projects' },
      { id: 'about', type: 'text' },
    ],
  } as never,
};

async function record(): Promise<{ sql: NodeSql; k: Kernel; clock: ReturnType<typeof fixedClock>; make: (register: string, fields: Record<string, unknown>) => string }> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const k = await openRecord(sql, clock);
  const installed = await k.install([PROJECTS, TASKS]);
  assert.ok(installed.ok, JSON.stringify(installed));
  const make = (register: string, fields: Record<string, unknown>): string => {
    const out = k.create(register, fields as never, W) as { ok: boolean; value: { id: string }; refusal?: unknown };
    assert.ok(out.ok, JSON.stringify(out.refusal));
    return out.value.id;
  };
  return { sql, k, clock, make };
}

/**
 * THE QUESTION AS IT WAS ASKED BEFORE, one look through every row for each example: the live examples a live row that is
 * not an example names. `edited` are the ones this test changed itself, which the log calls touched without asking.
 */
function before(sql: NodeSql, edited: string[] = []): { untouched: string[]; touched: number } {
  const tagged = sql.all<{ id: string; deleted_at: string | null }>(
    "SELECT DISTINCT e.id, e.deleted_at FROM entry e, json_each(e.fields, '$.tags') t WHERE json_type(e.fields, '$.tags') = 'array' AND t.value = 'example'" +
      " AND NOT EXISTS (SELECT 1 FROM json_each(e.fields, '$.tags') f WHERE f.value = 'formed')",
  );
  const examples = new Set(tagged.map((r) => r.id));
  const untouched: string[] = [];
  let touched = 0;
  for (const { id, deleted_at } of tagged) {
    if (deleted_at !== null) continue;
    const named = sql
      .all<{ id: string }>('SELECT id FROM entry WHERE deleted_at IS NULL AND id <> ? AND instr(fields, ?) > 0', id, id)
      .some((r) => !examples.has(r.id));
    if (named || edited.includes(id)) touched++;
    else untouched.push(id);
  }
  return { untouched: untouched.sort(), touched };
}

/** What the kernel answers, and then which rows clearing the examples takes, so the rows are held and not only the count. */
function now(sql: NodeSql, k: Kernel): { untouched: string[]; touched: number; counted: number } {
  const said = k.examples();
  const live = () => new Set(sql.all<{ id: string }>('SELECT id FROM entry WHERE deleted_at IS NULL').map((r) => r.id));
  const was = live();
  const cleared = k.clearExamples(W) as { ok: boolean; value: { cleared: number; kept: number } };
  assert.ok(cleared.ok);
  const is = live();
  return { untouched: [...was].filter((id) => !is.has(id)).sort(), touched: said.touched, counted: said.untouched };
}

test('THE SAME ANSWER AS ONE LOOK FOR EACH: linked examples, a real row naming one, a deleted row naming one, a formed row', async () => {
  const { sql, k, make } = await record();
  const example = ['example'];
  const alone = make('projects', { name: 'Alone', tags: example });
  const linked = make('projects', { name: 'Linked to by an example', tags: example });
  const real = make('projects', { name: 'A real task is in it', tags: example });
  const gone = make('projects', { name: 'Only a deleted task was in it', tags: example });
  const formed = make('projects', { name: 'A formed task is in it', tags: example });
  const edited = make('projects', { name: 'Renamed', tags: example });

  /* An example pointed at another example after it arrived, which is what setting up a use case does. */
  const task = make('tasks', { what: 'An example task', tags: example });
  assert.ok(k.update('tasks', task, { project: linked } as never, W).ok);

  make('tasks', { what: 'Mine', project: real });
  const binned = make('tasks', { what: 'Mine, and binned', project: gone });
  assert.ok(k.update('tasks', binned, { deleted_at: true } as never, W).ok);
  const plan = make('tasks', { what: 'What I asked for', project: formed, tags: ['example', 'formed'] });
  assert.ok(k.update('projects', edited, { name: 'Renamed by me' } as never, W).ok);

  const old = before(sql, [edited]);
  assert.deepEqual(old.untouched, [alone, linked, gone, task].sort(), 'the test’s own reading of the old rule');
  assert.equal(old.touched, 3);

  const said = k.examples();
  assert.deepEqual(said.registers, { projects: 3, tasks: 1 });
  const got = now(sql, k);
  assert.equal(got.counted, old.untouched.length);
  assert.equal(got.touched, old.touched);
  assert.deepEqual(got.untouched, old.untouched);

  /* THE FORMED ROW IS NEITHER CLEARED NOR COUNTED, and the three touched examples stand. */
  const left = new Set(sql.all<{ id: string }>('SELECT id FROM entry WHERE deleted_at IS NULL').map((r) => r.id));
  for (const id of [real, formed, edited, plan]) assert.ok(left.has(id));
  assert.deepEqual(k.examples(), { untouched: 0, touched: 3, registers: {}, others: 0 });
  sql.close();
});

test('AN ID WRITTEN INSIDE A TEXT IS FOUND AS IT WAS: in a handle, among other letters, and never when a letter is off', async () => {
  const { sql, k, make } = await record();
  const ids = ['handle', 'inside', 'near', 'lower', 'quiet'].map((name) => make('projects', { name, tags: ['example'] }));
  const [handle, inside, near, lower, quiet] = ids as [string, string, string, string, string];
  make('tasks', { what: 'Said as a handle', about: `See projects#${handle} first` });
  /* A run of id letters longer than an id, with the id in the middle of it: `instr` found it, so the pass must. */
  make('tasks', { what: 'Among other letters', about: `REF0${inside}9ZZ` });
  /* One letter off, and in small letters: neither is the id, to `instr` or to the pass. */
  make('tasks', { what: 'One off', about: `${near.slice(0, 25)}${near.endsWith('0') ? '1' : '0'}` });
  make('tasks', { what: 'Small letters', about: lower.toLowerCase() });

  const old = before(sql);
  assert.deepEqual(old.untouched, [near, lower, quiet].sort());
  const got = now(sql, k);
  assert.deepEqual(got.untouched, old.untouched);
  assert.equal(got.touched, old.touched);
  assert.equal(got.touched, 2);
  sql.close();
});

test('A ROW OF THE PERSON’S WRITTEN AFTER A THOUSAND OTHERS STILL TOUCHES THE EXAMPLE, and the thousand are not hers in its list', async () => {
  const { sql, k, make } = await record();
  const first = make('projects', { name: 'Named at the very end', tags: ['example'] });
  const second = make('projects', { name: 'Named by nobody', tags: ['example'] });
  for (let n = 0; n < 1100; n++) make('tasks', { what: `Task ${n}` });
  make('tasks', { what: 'The last one', project: first });

  const old = before(sql);
  assert.deepEqual(old.untouched, [second]);
  const said = k.examples();
  assert.equal(said.untouched, 1);
  assert.equal(said.touched, 1);
  assert.equal(said.others, 0, 'no row of the person’s is in the list the untouched example is in');
  assert.deepEqual(now(sql, k).untouched, old.untouched);
  sql.close();
});

test('EXAMPLES MINTED HOURS APART ARE ANSWERED THE SAME, where their ids share no opening to ask the record for', async () => {
  const { sql, k, clock, make } = await record();
  const ids = [1, 2, 3, 4, 5, 6].map((n) => {
    clock.advance(3_600_000);
    return make('projects', { name: `Planted in hour ${n}`, tags: ['example'] });
  });
  assert.equal(new Set(ids.map((id) => id.slice(0, 6))).size, 6, 'the six ids open alike, so this test reads nothing new');
  /* More rows than the pass reads at once, and the two that name an example come after them all. */
  for (let n = 0; n < 600; n++) make('tasks', { what: `Task ${n}` });
  make('tasks', { what: 'In the oldest', project: ids[0] });
  make('tasks', { what: 'Names the newest', about: `projects#${ids[5]}` });

  const old = before(sql);
  assert.deepEqual(old.untouched, ids.slice(1, 5).sort());
  const got = now(sql, k);
  assert.deepEqual(got.untouched, old.untouched);
  assert.equal(got.touched, 2);
  sql.close();
});
