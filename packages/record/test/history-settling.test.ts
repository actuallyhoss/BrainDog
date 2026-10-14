/**
 * Who suggested, who drafted and who settled, on the record's own reads (ENG-B16 job 3, `settling.ts`).
 *
 * THE CLIENT TYPED FIVE KEYS AND NO HOST SENT THEM, so Activity and a row's history said only who signed a line. These
 * cases hold the one fact on a real record: Slash drafts rows by its rules and the owner accepts them, so the `decide`
 * line names Slash and the rules, and the row's own event names who settled it; the undo says `undone`; a model's draft
 * names the model and an option's own words; and a plain edit carries none of the keys at all.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext, type EventLine } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 14, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' }, credentialed: true };
const KEYS = ['suggested_by', 'drafted_by', 'answer_label', 'settled_by', 'undone'] as const;

const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value;
};

type Said = { kind: string; target?: string | null; batch?: string | null } & Partial<Record<(typeof KEYS)[number], unknown>>;
const keysOf = (l: Said) => Object.fromEntries(KEYS.filter((k) => k in l).map((k) => [k, l[k]]));

const record = async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  value(await api.kernel.install([TASKS]));
  return { sql, api, clock };
};

const rowsOf = (sql: ReturnType<typeof openSqlite>, what: string): number => {
  const row = sql.one<{ seq: number }>("SELECT seq FROM entry WHERE register = 'tasks' AND json_extract(fields, '$.what') = ?", what);
  assert.ok(row, `${what} was written`);
  return Number(row.seq);
};

test("SLASH'S RULES DRAFT IT AND HE ACCEPTS: the decide line, the row's event and the undo each say who", async () => {
  const { sql, api } = await record();
  const filed = value<{ id: string }>(api.kernel.propose({ question: 'Add a task to ship?', body_kind: 'rowset', body: { register: 'tasks', rows: [{ what: 'Ship' }] } }, 'slash', 'rules'));
  const decided = value<{ decision: string }>(await api.decide({ id: filed.id, decide: { option: 'accept', reason: '' } }, owner));

  const page = value<{ events: EventLine[] }>(await api.recentHistory({}, owner));
  const decide = page.events.find((e) => e.kind === 'decide')!;
  assert.deepEqual(keysOf(decide), { suggested_by: 'slash', drafted_by: 'rules', answer_label: null }, 'a rowset has no option words of its own');
  const resolve = page.events.find((e) => e.kind === 'resolve' && e.target === `suggestion:${filed.id}`)!;
  assert.deepEqual(keysOf(resolve), { suggested_by: 'slash', drafted_by: 'rules' });

  const seq = rowsOf(sql, 'Ship');
  const made = value<Said[]>(await api.history({ register: 'tasks', seq }, owner));
  assert.deepEqual(keysOf(made.find((e) => e.kind === 'create')!), { suggested_by: 'slash', drafted_by: 'rules', settled_by: 'p_owner' });
  /* AND THE SAME ON THE LOG AND ON WHAT IS NEW, from the one read. */
  const logged = page.events.find((e) => e.kind === 'create' && e.register === 'tasks')!;
  assert.equal(logged.settled_by, 'p_owner');
  const news = value<{ events: EventLine[] }>(await api.whatsNew(undefined, owner));
  assert.equal(news.events.find((e) => e.kind === 'decide')?.suggested_by, 'slash');

  /* HE UNDOES IT: the event that took the row back says so, and who did it. */
  const plan = value<{ hash: string }>(await api.undo({ decision: decided.decision, dry: true }, owner));
  value(await api.undo({ decision: decided.decision, hash: plan.hash }, owner));
  /* THE ROW IS GONE, so its event is read where Activity reads it, on the log. */
  const id = sql.one<{ id: string }>("SELECT id FROM entry WHERE register = 'tasks' AND seq = ?", seq)!.id;
  const log = value<{ events: EventLine[] }>(await api.recentHistory({}, owner)).events;
  const back = log.find((e) => e.target === `entry:${id}`)!;
  assert.notEqual(back.kind, 'create', JSON.stringify(log.map((e) => e.kind)));
  assert.deepEqual(keysOf(back), { suggested_by: 'slash', drafted_by: 'rules', settled_by: 'p_owner', undone: true });
  /* AND THE QUESTION ASKED AGAIN SAYS WHOSE IT WAS; the accepted row's own create still reads as accepted. */
  const reopened = log.find((e) => e.kind === 'suggest' && e.target === `suggestion:${filed.id}` && e.to === 'reopened');
  assert.deepEqual(reopened && keysOf(reopened), { suggested_by: 'slash', drafted_by: 'rules' });
  assert.equal(log.find((e) => e.kind === 'create' && e.target === `entry:${id}`)?.undone, undefined);
  sql.close();
});

test("A MODEL'S DRAFT NAMES THE MODEL, and a chosen option says its own words", async () => {
  const { sql, api } = await record();
  const rows = value<{ id: string }>(api.kernel.propose({ question: 'Add a task to bake?', body_kind: 'rowset', body: { register: 'tasks', rows: [{ what: 'Bake' }] } }, 'slash', 'test model'));
  value(await api.decide({ id: rows.id, decide: { option: 'accept', reason: '' } }, owner));
  const made = value<Said[]>(await api.history({ register: 'tasks', seq: rowsOf(sql, 'Bake') }, owner));
  assert.deepEqual(keysOf(made[0]!), { suggested_by: 'slash', drafted_by: 'test model', settled_by: 'p_owner' });

  const options = [
    { id: 'weekly', label: 'Every week', because: 'It keeps the list short.' },
    { id: 'monthly', label: 'Every month', because: 'It is quieter.' },
  ];
  const asked = value<{ id: string }>(api.kernel.propose({ question: 'How often should I tidy Tasks?', body_kind: 'options', body: { options } }, 'slash', 'test model'));
  value(await api.decide({ id: asked.id, decide: { option: 'monthly', reason: '' } }, owner));
  const decide = value<{ events: EventLine[] }>(await api.recentHistory({}, owner)).events.find((e) => e.kind === 'decide' && e.settles === asked.id)!;
  assert.deepEqual(keysOf(decide), { suggested_by: 'slash', drafted_by: 'test model', answer_label: 'Every month' });
  sql.close();
});

test('A PLAIN EDIT CARRIES NONE OF THE KEYS, on the row and on the log', async () => {
  const { sql, api, clock } = await record();
  const row = value<{ id: string; seq: number }>(api.kernel.create('tasks', { what: 'Plan' }, { actor: 'p_owner' }));
  clock.advance(3_600_000);
  value(api.kernel.update('tasks', row.id, { what: 'Plan the week' }, { actor: 'p_owner', version: 1 }));
  const lines = value<Said[]>(await api.history({ register: 'tasks', seq: row.seq }, owner));
  assert.equal(lines.length, 2, JSON.stringify(lines));
  for (const l of lines) assert.deepEqual(keysOf(l), {});
  for (const l of value<{ events: EventLine[] }>(await api.recentHistory({ everything: true }, owner)).events) assert.deepEqual(keysOf(l as Said), {}, l.kind);
  sql.close();
});
