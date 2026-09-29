/**
 * Retiring a field from a live list, as a change that names the field and not the list, and that always waits for a press.
 *
 * THE APP COULD NOT REMOVE ANYTHING. `addTo` is additive by construction and tells whoever wants a field gone to
 * "propose the whole list", and nothing the app calls answers a list's installed body: `schema` sends the relabelled
 * copy the screens draw from, with no version. So the kernel resolves a second field-level shape the way it resolves
 * `add`, `to: { retire: { register, fields } }`, onto the list as it is when the owner presses. Before this file, that
 * body was refused `VALUE_MALFORMED` at `body.to` by `shapeFault`, because it is not a declaration.
 *
 * AND IT IS NEVER ANSWERED BY RULE. An agent's purely additive field lands at once, and removing waits for his press. A
 * retire is not an `add`, so `additiveFault` holds it, and the record's `byRule` never sends it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { codeOf, fixOf } from '@braindog/ports';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 24, 12);

type Field = Record<string, unknown>;

const NAME: Field = { id: 'name', type: 'text', required: true };
const LANE: Field = { id: 'lane', type: 'enum', values: ['building', 'live'] };
const DOMAIN: Field = { id: 'domain', type: 'text' };

const THINGS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: { id: 'things', name: 'Projects', title: 'name', fields: [NAME, LANE, DOMAIN] } as never,
};

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([THINGS])).ok);
  assert.ok(k.create('things', { name: 'Kiln', lane: 'building', domain: 'https://kiln.example/' }, { actor: 'p_1' }).ok);
  assert.ok(k.create('things', { name: 'Loom', lane: 'live', domain: 'https://loom.example/' }, { actor: 'p_1' }).ok);
  return { k, sql };
}

const retire = (to: unknown) => ({
  question: 'Retire domain on Projects?',
  body_kind: 'change' as const,
  body: { declaration_id: 'register.things', to },
});

const fieldsOf = (k: Kernel) => (k.register('things') as unknown as { fields: Field[] }).fields;

/** Accept a filed change as the owner, and install what the gate hands back against the version it names. */
async function press(k: Kernel, id: string) {
  const out = k.decide(id, { decide: { option: 'accept', reason: 'nobody fills it in' } }, 'p_owner');
  assert.ok(out.ok, JSON.stringify(out));
  const put = await k.install([out.value.install as unknown as Declaration], out.value.expect, { actor: 'p_owner' });
  assert.ok(put.ok, JSON.stringify(put));
  return out.value;
}

test('A RETIRE IS FILED AS AN OPEN QUESTION, and stored as what was asked rather than as a whole list', async () => {
  const { k, sql } = await record();
  const out = k.propose(retire({ retire: { register: 'things', fields: ['domain'] } }), 'p_1');
  assert.ok(out.ok, `refused: ${JSON.stringify(out)}`);
  const row = sql.one<{ status: string; body: string }>('SELECT status, body FROM suggestion WHERE id = ?', out.value.id)!;
  assert.equal(row.status, 'open');
  /* STORED UNRESOLVED, for the reason an `add` is: resolved at filing, it is a whole body drawn from one reading. */
  assert.deepEqual(JSON.parse(row.body).to, { retire: { register: 'things', fields: ['domain'] } });
  assert.equal(fieldsOf(k).find((f) => f.id === 'domain')?.retired, undefined, 'filing it changed the list');
  sql.close();
});

test('ACCEPTED, THE LIVE BODY IS INSTALLED WITH THE FIELD RETIRED, every value stays in its row, and the schema drops it', async () => {
  const { k, sql } = await record();
  const out = k.propose(retire({ retire: { register: 'things', fields: ['domain'] } }), 'p_1');
  assert.ok(out.ok, JSON.stringify(out));
  const decided = await press(k, out.value.id);

  const body = (decided.install as { body: { fields: Field[] } }).body;
  assert.deepEqual(
    body.fields.map((f) => [f.id, f.retired === true]),
    [['name', false], ['lane', false], ['domain', true]],
    'the resolved body is not the live list with domain retired',
  );
  assert.deepEqual(decided.expect, { id: 'register.things', version: 1 });
  assert.equal(sql.one<{ v: number }>("SELECT version AS v FROM declaration WHERE id = 'register.things' AND superseded_at IS NULL")?.v, 2);

  /* THE ROWS ARE NOT TOUCHED: the value is put away, not deleted, which is what `retired` has always meant. */
  const held = sql.all<{ f: string }>("SELECT fields AS f FROM entry WHERE register = 'things' ORDER BY seq").map((r) => JSON.parse(r.f).domain);
  assert.deepEqual(held, ['https://kiln.example/', 'https://loom.example/']);
  assert.equal(fieldsOf(k).find((f) => f.id === 'domain')?.retired, true);
  /* AND NOTHING WRITES IT NOW. */
  const wrote = k.create('things', { name: 'Anvil', domain: 'https://anvil.example/' }, { actor: 'p_1' });
  assert.equal(codeOf(wrote), 'FIELD_UNKNOWN', 'a retired field still took a value');
  assert.match(fixOf(wrote) ?? '', /no field called domain/);
  sql.close();
});

test('IT IS MERGED ONTO THE LIST AS IT IS AT THE PRESS, so a field added after it was filed survives it', async () => {
  const { k, sql } = await record();
  const retiring = k.propose(retire({ retire: { register: 'things', fields: ['domain'] } }), 'p_1');
  assert.ok(retiring.ok);
  const adding = k.propose(
    { question: 'Add launched?', body_kind: 'change', body: { declaration_id: 'register.things', to: { add: { fields: [{ id: 'launched', type: 'day' }] } } } },
    'p_1',
  );
  assert.ok(adding.ok);
  await press(k, adding.value.id);
  const decided = await press(k, retiring.value.id);
  assert.deepEqual(decided.expect, { id: 'register.things', version: 2 });
  assert.deepEqual(
    fieldsOf(k).map((f) => [f.id, f.retired === true]),
    [['name', false], ['lane', false], ['domain', true], ['launched', false]],
  );
  sql.close();
});

test('A FIELD ALREADY RETIRED IS REFUSED BY NAME, and so is one the list does not have', async () => {
  const { k, sql } = await record();
  const first = k.propose(retire({ retire: { register: 'things', fields: ['domain'] } }), 'p_1');
  assert.ok(first.ok);
  await press(k, first.value.id);

  const again = k.propose(retire({ retire: { register: 'things', fields: ['domain'] } }), 'p_1');
  assert.equal(again.ok, false, 'domain was retired twice');
  assert.equal(codeOf(again), 'VALUE_MALFORMED');
  assert.match(fixOf(again) ?? '', /domain is already retired/);

  const none = k.propose(retire({ retire: { register: 'things', fields: ['colour'] } }), 'p_1');
  assert.equal(codeOf(none), 'FIELD_UNKNOWN');
  assert.match(fixOf(none) ?? '', /Projects has no field called colour/);
  sql.close();
});

test('ONE THAT WAS OPEN WHEN ANOTHER RETIRED THE SAME FIELD IS REFUSED AT THE PRESS, and stays open', async () => {
  const { k, sql } = await record();
  const a = k.propose(retire({ retire: { register: 'things', fields: ['domain'] } }), 'p_1');
  const b = k.propose(retire({ retire: { fields: ['domain'] } }), 'p_1');
  assert.ok(a.ok && b.ok);
  await press(k, a.value.id);
  const out = k.decide(b.value.id, { decide: { option: 'accept', reason: 'same' } }, 'p_owner');
  assert.equal(out.ok, false);
  assert.match(fixOf(out) ?? '', /domain is already retired/);
  assert.equal(sql.one<{ status: string }>('SELECT status FROM suggestion WHERE id = ?', b.value.id)?.status, 'open');
  sql.close();
});

test('THE FIELD A LIST IS READ BY IS NOT RETIRED: its title, its state and its finished day', async () => {
  /* MEASURED WITHOUT THIS REFUSAL: retiring `name` installed at version 3, and the next `create` naming it was refused
     `FIELD_UNKNOWN`, so Projects could never again take a row with a title. */
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const tasks: Declaration = {
    id: 'register.tasks',
    kind: 'register',
    body: {
      id: 'tasks',
      name: 'Tasks',
      title: 'what',
      state: 'status',
      done: ['done'],
      finished: 'done_on',
      fields: [
        { id: 'what', type: 'text', required: true },
        { id: 'status', type: 'enum', values: ['open', 'done'] },
        { id: 'done_on', type: 'day' },
      ],
    } as never,
  };
  const put = await k.install([tasks]);
  assert.ok(put.ok, JSON.stringify(put));
  for (const [field, said] of [['what', 'title'], ['status', 'state'], ['done_on', 'finished day']] as const) {
    const out = k.propose({ question: 'q', body_kind: 'change', body: { declaration_id: 'register.tasks', to: { retire: { fields: [field] } } } }, 'p_1');
    assert.equal(codeOf(out), 'OUT_OF_BOUNDS', field);
    assert.equal(fixOf(out), `${field} is the ${said} of Tasks, so it cannot be retired. Propose the whole list to name another first.`);
  }
  sql.close();
});

test('A FIELD A MOVE REQUIRES IS NOT RETIRED, or every row in that state is stranded there', async () => {
  /* MEASURED WITHOUT THIS REFUSAL: `note` retired from a list whose move out of `open` requires it installed at version
     2, and then e#1 could not leave `open`. Without `note` the move was refused `REQUIRED_MISSING` ("leaves open only
     with note filled"), and with it `FIELD_UNKNOWN`, so no write could ever move the row on. */
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const put = await k.install([
    {
      id: 'register.jobs',
      kind: 'register',
      body: {
        id: 'jobs',
        name: 'Jobs',
        title: 'what',
        state: 'status',
        done: ['shut'],
        fields: [
          { id: 'what', type: 'text' },
          { id: 'note', type: 'text' },
          { id: 'status', type: 'enum', values: ['open', 'shut'], transitions: { open: { to: ['shut'], requires: ['note'] } } },
          { id: 'memo', type: 'text' },
          { id: 'stage', type: 'enum', values: ['a', 'b'], transitions: { a: { to: ['b'], requires: ['memo'] } } },
        ],
      } as never,
    },
  ]);
  assert.ok(put.ok, JSON.stringify(put));
  const out = k.propose({ question: 'q', body_kind: 'change', body: { declaration_id: 'register.jobs', to: { retire: { fields: ['note'] } } } }, 'p_1');
  assert.equal(codeOf(out), 'OUT_OF_BOUNDS', JSON.stringify(out));
  assert.equal(fixOf(out), 'note is what status needs filled to leave open on Jobs, so it cannot be retired. Propose the whole list to change that move first.');
  /* AN ENUM RETIRED IN THE SAME CHANGE STRANDS NOTHING, so the field its move needed goes with it, named first or not. */
  const both = k.propose({ question: 'q', body_kind: 'change', body: { declaration_id: 'register.jobs', to: { retire: { fields: ['memo', 'stage'] } } } }, 'p_1');
  assert.ok(both.ok, JSON.stringify(both));
  sql.close();
});

test('A FIELD NAMED TWICE IN ONE RETIRE IS RETIRED ONCE, and not refused as already retired', async () => {
  /* IT WAS REFUSED "domain is already retired on Projects" while the live list held domain as live as ever: the loop
     marked the copy retired on the first mention and read its own mark on the second. */
  const { k, sql } = await record();
  const out = k.propose(retire({ retire: { register: 'things', fields: ['domain', 'domain'] } }), 'p_1');
  assert.ok(out.ok, JSON.stringify(out));
  await press(k, out.value.id);
  assert.equal(fieldsOf(k).find((f) => f.id === 'domain')?.retired, true);
  sql.close();
});

test('A RETIRE NEVER LANDS BY RULE, whoever filed it: taking away waits for the owner', async () => {
  const { k, sql } = await record();
  const out = k.propose(retire({ retire: { register: 'things', fields: ['domain'] } }), 'p_1');
  assert.ok(out.ok);
  const ruled = k.decide(out.value.id, { rule: 'additive' }, 'p_1');
  assert.equal(codeOf(ruled), 'TRANSITION_ILLEGAL');
  /* ITS OWN SENTENCE, NOT THE WHOLE-LIST ONE. "waits for the owner" alone is the gate's prefix to every refusal by rule,
     so with the retire line deleted from `additiveFault` this still passed on "A whole list is proposed". */
  assert.match(fixOf(ruled) ?? '', /It retires a field, and taking anything away waits for the owner/);
  assert.equal(fieldsOf(k).find((f) => f.id === 'domain')?.retired, undefined);
  sql.close();
});

test('THE SHAPE IS HELD: fields to retire and nothing else, and never a key that could add or remove', async () => {
  const { k, sql } = await record();
  for (const [to, code] of [
    [{ retire: 'domain' }, 'VALUE_MALFORMED'],
    [{ retire: { register: 'things', fields: [] } }, 'REQUIRED_MISSING'],
    [{ retire: { register: 'things', fields: [7] } }, 'VALUE_MALFORMED'],
    [{ retire: { register: 'things', fields: ['domain'], remove: true } }, 'FIELD_UNKNOWN'],
    [{ retire: { register: 'things', fields: ['domain'] }, add: { fields: [] } }, 'FIELD_UNKNOWN'],
    [{ retire: { register: 'nowhere', fields: ['domain'] } }, 'REGISTER_UNKNOWN'],
  ] as const) {
    const out = k.propose(retire(to), 'p_1');
    assert.equal(codeOf(out), code, JSON.stringify(to));
  }
  assert.equal(sql.all('SELECT 1 FROM suggestion').length, 0);
  sql.close();
});
