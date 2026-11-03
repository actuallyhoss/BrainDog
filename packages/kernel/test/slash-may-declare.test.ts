/**
 * What Slash may declare: a look that says it is its own, and nothing else.
 *
 * AN INSTALL WROTE ITS `declare` LINE WITH A PLAIN INSERT AND THE ACTOR IT WAS HANDED, so `slashMayWrite` never saw
 * it: a page installed as Slash was written and signed, and the first look a model wrote broke `30 §3`'s query with
 * nothing saying so. The guard now takes the thing written, and the install and the retire ask it before their line.
 *
 * OVER THE INSTALL, NOT ONLY OVER THE GUARD, for `slash.test.ts`'s reason: what is worth knowing is that the path a
 * model's declaration takes to the log goes through it, and that the one declaration it is allowed still lands.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, SLASH, slashMayWrite, type Declaration } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 13, 12);

const OBLIGATIONS: Declaration = {
  id: 'register.obligations',
  kind: 'register',
  body: { id: 'obligations', name: 'Obligations', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'note', type: 'text' }] } as never,
};
const DESK: Declaration = {
  id: 'page.desk',
  kind: 'page',
  body: { page: 'desk', title: 'Desk', blocks: [{ kind: 'table', source: 'register.obligations', heading: 'Open', key: 'open', columns: [{ field: 'what' }] }] } as never,
};

/* WHAT A MODEL MIGHT HAND AN INSTALL, one of each thing a person installs. */
const PAID: Declaration = {
  id: 'page.paid',
  kind: 'page',
  body: { page: 'paid', title: 'Paid', blocks: [{ kind: 'table', source: 'register.obligations', heading: 'Paid', columns: [{ field: 'what' }] }] } as never,
};
const NOTES: Declaration = {
  id: 'register.notes',
  kind: 'register',
  body: { id: 'notes', name: 'Notes', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};
const CHASED: Declaration = {
  id: 'rule.chased',
  kind: 'rule',
  body: { rule: 'chased', on: { written: { register: 'obligations', op: ['create'] } }, once_per: ['entry'], steps: [{ set: { field: 'note', to: 'chased' } }] } as never,
};
/* AN ADD-ON IS ITS DECLARATIONS, each naming the add-on that carries it. */
const ADD_ON: Declaration[] = [
  { ...NOTES, id: 'register.calls', pack: 'caller', body: { ...NOTES.body, id: 'calls', name: 'Calls' } },
  { id: 'look.desk', kind: 'look', pack: 'caller', body: { look: 'desk', basis: 'b1', by: 'slash' } as never },
];

const look = (by: string, more: Record<string, unknown> = {}): Declaration => ({ id: 'look.desk', kind: 'look', body: { look: 'desk', basis: 'b1', by, ...more } as never });

async function record() {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([OBLIGATIONS, DESK])).ok);
  return { k, sql };
}

/** Every line Slash signed, as plain objects so they compare. */
const signed = (sql: ReturnType<typeof openSqlite>) =>
  sql.all<{ kind: string; target: string }>("SELECT kind, target FROM event WHERE actor = 'slash' ORDER BY id").map((e) => ({ kind: e.kind, target: e.target }));

test('THE GUARD TAKES THE THING WRITTEN, and a look that says it is Slash\'s is the one declaration it signs', () => {
  slashMayWrite(SLASH, 'declare', { kind: 'look', body: { look: 'desk', basis: 'b1', by: 'slash' } });
  slashMayWrite(SLASH, 'declare', { kind: 'look', body: JSON.stringify({ look: 'desk', basis: 'b1', by: 'slash' }), pack: null });

  for (const kind of ['page', 'register', 'rule', 'script', 'metric', 'block', 'theme'])
    assert.throws(() => slashMayWrite(SLASH, 'declare', { kind, body: {} }), new RegExp(`slash wrote declare of a ${kind}\\.`), kind);

  /* A LOOK IS NOT ENOUGH: the body says whose it is, and an add-on's look is the add-on's. */
  assert.throws(() => slashMayWrite(SLASH, 'declare', { kind: 'look', body: { look: 'desk', basis: 'b1', by: 'owner' } }), /a look that does not say it is its own/);
  assert.throws(() => slashMayWrite(SLASH, 'declare', { kind: 'look', body: { look: 'desk', basis: 'b1', by: 'rule' } }), /a look that does not say it is its own/);
  assert.throws(() => slashMayWrite(SLASH, 'declare', { kind: 'look', body: 'not json' }), /slash wrote declare/);
  assert.throws(() => slashMayWrite(SLASH, 'declare', { kind: 'look', body: { look: 'desk', basis: 'b1', by: 'slash' }, pack: 'caller' }), /a plugin carries/);
});

test('THE TWO-ARGUMENT CALL STILL ANSWERS, and a declare with nothing named is refused', () => {
  for (const kind of ['suggest', 'propose', 'predict']) slashMayWrite(SLASH, kind);
  assert.throws(() => slashMayWrite(SLASH, 'note'), /slash wrote note\./);
  assert.throws(() => slashMayWrite(SLASH, 'declare'), /slash wrote declare of a declaration it did not name/);

  /* WHAT IS WRITTEN OPENS NO OTHER KIND. Naming a look beside a note does not make the note Slash's. */
  assert.throws(() => slashMayWrite(SLASH, 'note', { kind: 'look', body: { by: 'slash' } }), /slash wrote note\./);

  /* AND IT IS ABOUT THE ACTOR. A person declares anything. */
  for (const kind of ['page', 'register', 'rule', 'look']) slashMayWrite('p_1', 'declare', { kind, body: {} });
});

test('AN INSTALL SIGNED BY SLASH IS REFUSED for a page, a list, a rule and an add-on, and nothing of it lands', async () => {
  const { k, sql } = await record();
  const before = sql.one<{ n: number }>('SELECT count(*) AS n FROM declaration')?.n;

  for (const [name, batch] of [['a page', [PAID]], ['a list', [NOTES]], ['a rule', [CHASED]], ['an add-on', ADD_ON]] as const)
    await assert.rejects(async () => k.install(batch, undefined, { actor: SLASH }), /slash wrote declare of/, `${name} installed as Slash was written`);

  /* THE LINE IS WRITTEN IN THE TRANSACTION THAT WRITES THE VERSION, so the refusal takes the version with it. */
  assert.deepEqual(signed(sql), []);
  assert.equal(sql.one<{ n: number }>('SELECT count(*) AS n FROM declaration')?.n, before);

  /* A PERSON INSTALLS THE SAME FOUR, which is what makes the refusal about Slash and not about the declarations. */
  for (const batch of [[PAID], [NOTES], [CHASED]]) assert.ok((await k.install(batch, undefined, { actor: 'p_1' })).ok);
  sql.close();
});

test('A LOOK THAT SAYS IT IS SLASH\'S IS INSTALLED AND SIGNED BY SLASH, and one that says it is the owner\'s is not', async () => {
  const { k, sql } = await record();

  const put = await k.install([look('slash', { lead: 'open' })], undefined, { actor: SLASH });
  assert.ok(put.ok, 'the one declaration Slash may sign was refused');
  assert.deepEqual(signed(sql), [{ kind: 'declare', target: 'declaration:look.desk' }]);

  /* SLASH SIGNING THE OWNER'S ARRANGEMENT is the write the body's `by:` exists to stop. */
  await assert.rejects(async () => k.install([look('owner', { pinned: ['open'] })], undefined, { actor: SLASH }), /a look that does not say it is its own/);
  assert.equal(signed(sql).length, 1);

  /* `30 §3`'s QUERY WITH THE LIST AS IT NOW STANDS: every line Slash signed is of a named kind, and the one `declare`
     is of a look. */
  const wrong = sql.all<{ kind: string; target: string }>(
    `SELECT kind, target FROM event WHERE actor = 'slash' AND kind NOT IN ('suggest','propose','predict')
       AND NOT (kind = 'declare' AND target LIKE 'declaration:look.%')`,
  );
  assert.deepEqual(wrong, []);
  sql.close();
});

test('A RETIRE IS HELD TO THE SAME LIST: Slash takes its own look off, and never a page', async () => {
  const { k, sql } = await record();
  assert.ok((await k.install([PAID], undefined, { actor: 'p_1' })).ok);
  assert.ok((await k.install([look('slash')], undefined, { actor: SLASH })).ok);

  assert.throws(() => k.retire(['page.paid'], { actor: SLASH }), /slash wrote declare of a page\./);
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM declaration WHERE id = 'page.paid' AND retired = 0 AND superseded_at IS NULL")?.n, 1, 'the refused retire took the page off');

  assert.ok(k.retire(['look.desk'], { actor: SLASH }).ok);
  assert.deepEqual(signed(sql).map((e) => e.target), ['declaration:look.desk', 'declaration:look.desk']);
  sql.close();
});
