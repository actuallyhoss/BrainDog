/**
 * Asked once (AGT-C07 job e): the record's `propose` and its held-back writes, over the kernel's cause.
 *
 * Two agents proposing one change make one question, and the second is answered as the first was, with the question's
 * name, its card's facts and "Already waiting as SG1.". A cause the filer gives joins whatever else it was asked in. A
 * write the floor held back and tried again joins the question its first try filed, and another patch to the same row is
 * another question. A member handed a handle, not a name, is told only that it waits.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type Asked, type CallContext } from '../src/index.ts';
import { openSqlite } from '../../kernel/test/sqlite.ts';
import type { Entry } from '@braindog/kernel';

const NOW = Date.UTC(2026, 9, 9, 12);

const TASKS = {
  id: 'register.tasks',
  kind: 'register' as const,
  body: {
    id: 'tasks',
    name: 'Tasks',
    title: 'name',
    state: 'state',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['open', 'done'], labels: { open: 'Open', done: 'Done' }, default: 'open' },
      { id: 'cost', type: 'money', label: 'Cost' },
    ],
  } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' }, credentialed: true };
const claude: CallContext = {
  principal: { kind: 'token', id: 't_claude', scope: 'write', person: 'p_1', level: 'owner' },
  session: { client_id: 'c1', client: 'claude-code', host: 'mac', repo: 'braindog' },
};
const codex: CallContext = {
  principal: { kind: 'token', id: 't_codex', scope: 'write', person: 'p_1', level: 'owner' },
  session: { client_id: 'x1', client: 'codex', host: 'mac', repo: 'braindog' },
};

type Joined = { id: string; joined?: true; said?: string; money?: { amount: number; currency: string }[] };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: { now: () => NOW } as never });
  assert.ok(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok);
  value(await api.kernel.install([TASKS]));
  for (const t of ['t_claude', 't_codex']) sql.exec(`INSERT INTO token (id, person_id, hash, scope, label, created_at) VALUES (?, 'p_1', ?, 'write', ?, '2026-10-01T00:00:00.000Z')`, t, `h_${t}`, t);
  const ship = value<Entry>(await api.create({ register: 'tasks', fields: { name: 'Ship' } }, owner));
  const open = () => sql.one<{ n: number }>("SELECT count(*) AS n FROM suggestion WHERE status = 'open'")!.n;
  return { api, sql, ship, open };
}

/** Price Ship: money is on the floor, so it is asked, never landed by a rung. */
const price = (ship: Entry, amount: number) => ({
  question: 'Price Ship?',
  body_kind: 'rowset' as const,
  body: { register: 'tasks', rows: [{ at: `tasks#${ship.seq}`, version: ship.version, patch: { cost: { amount, currency: 'EUR' } } }] },
});

test('TWO AGENTS PROPOSING ONE CHANGE MAKE ONE QUESTION, and the second is answered with its name, its facts and "Already waiting as"', async () => {
  const { api, sql, ship, open } = await record();
  const first = value<Joined>(await api.propose(price(ship, 900), claude));
  assert.match(first.id, /^SG[1-9][0-9]*$/u);
  assert.equal(first.joined, undefined);
  assert.equal(first.said, undefined);

  const second = value<Joined>(await api.propose(price(ship, 900), codex));
  assert.equal(second.id, first.id);
  assert.equal(second.joined, true);
  assert.equal(second.said, `Already waiting as ${first.id}.`);
  assert.deepEqual(second.money, first.money, 'the card facts of the question waiting');
  assert.equal(open(), 1);
  sql.close();
});

test('A CAUSE THE FILER GIVES IS THE QUESTION, whatever words it is asked in', async () => {
  const { api, sql, ship, open } = await record();
  const cause = 'pricing#ship';
  const first = value<Joined>(await api.propose({ ...price(ship, 900), cause } as never, claude));
  const again = value<Joined>(await api.propose({ ...price(ship, 950), question: 'Should Ship cost 950?', cause } as never, codex));
  assert.equal(again.id, first.id);
  assert.equal(again.joined, true);
  assert.equal(sql.one<{ cause: string }>('SELECT cause FROM suggestion WHERE id = ?', first.id)!.cause, cause);
  /* A different change with no cause is its own question. */
  const other = value<Joined>(await api.propose(price(ship, 1_200), claude));
  assert.notEqual(other.id, first.id);
  assert.equal(open(), 2);
  sql.close();
});

test('A HELD-BACK WRITE TRIED AGAIN JOINS ITS QUESTION, by the list, the row and the patch', async () => {
  const { api, sql, ship, open } = await record();
  const patch = { cost: { amount: 1_250, currency: 'GBP' } };
  const first = value<Asked>(await api.update({ register: 'tasks', seq: ship.seq!, patch }, claude));
  assert.equal(first.asked.joined, undefined);
  const cause = sql.one<{ cause: string }>('SELECT cause FROM suggestion WHERE id = ?', first.asked.id)!.cause;
  assert.match(cause, new RegExp(`^write#tasks#tasks#${String(ship.seq)}#[0-9a-f]{24}$`, 'u'));

  const retry = value<Asked>(await api.update({ register: 'tasks', seq: ship.seq!, patch }, codex));
  assert.equal(retry.asked.id, first.asked.id);
  assert.equal(retry.asked.joined, true);
  assert.equal(open(), 1);

  /* Another amount is another question. */
  const other = value<Asked>(await api.update({ register: 'tasks', seq: ship.seq!, patch: { cost: { amount: 2_000, currency: 'GBP' } } }, claude));
  assert.notEqual(other.asked.id, first.asked.id);
  assert.equal(open(), 2);
  sql.close();
});

test('A MEMBER HANDED A HANDLE IS TOLD ONLY THAT IT WAITS, never the handle said as a name', async () => {
  const { api, sql, ship } = await record();
  /* A PERSON'S OWN PROPOSAL DERIVES NO CAUSE (only a run's does), so she joins by the cause the agent gave. */
  const cause = 'pricing#ship';
  const first = value<Joined>(await api.propose({ ...price(ship, 900), cause } as never, claude));
  /* BUILT THE WAY THE HOST BUILDS A MEMBER, from `kernel.access`, invited to Tasks alone. */
  assert.ok((await api.invite({ person: 'p_2', name: 'Wren', registers: { tasks: 'write' } } as never, owner)).ok);
  const held = api.kernel.access('p_2')!;
  const member: CallContext = { principal: { kind: 'person', id: 'p_2', level: held.level }, registers: held.registers ?? '*', levels: held.levels };
  const joined = value<Joined>(await api.propose({ ...price(ship, 900), cause } as never, member));
  assert.equal(joined.joined, true);
  assert.notEqual(joined.id, first.id, 'a member held to one list is never handed the number');
  assert.equal(joined.said, 'Already waiting.');
  sql.close();
});
