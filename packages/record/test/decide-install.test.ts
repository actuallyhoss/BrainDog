/**
 * Accepting a `change` whose `to` will not install, on a real record.
 *
 * d15066d2 made the kernel refuse such a `to` at `propose`, which closes the door for every change filed from now on.
 * It does nothing for the ones already in the queue: a record that took `{ values: [...] }` before that commit still
 * holds it, and accepting it resolved the suggestion inside the gate's transaction and then threw
 * `Cannot read properties of undefined (reading 'writes')` out of `kernel.install`, before `decide` reached `reopen`.
 * What the owner saw was a crash; what the record kept was SG1 resolved with nothing installed behind it. The rows
 * here are written straight into `suggestion`, because that is the only way left to file one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);

const OBLIGATIONS = {
  id: 'register.obligations',
  kind: 'register' as const,
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['open', 'paid'] },
    ],
  } as never,
};

const WIDER = {
  ...OBLIGATIONS,
  body: {
    ...(OBLIGATIONS.body as Record<string, unknown>),
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'state', type: 'enum', values: ['open', 'paid', 'part'] },
    ],
  } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; at?: string } };

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok((await api.kernel.install([OBLIGATIONS])).ok);
  /* FILED AS A GOOD CHANGE AND THEN REWRITTEN, which is the state an old record is in: the kernel refuses the bad
     `to` at `propose` now, so the row is made the only way it still can be. */
  const file = async (to: unknown): Promise<string> => {
    const made = (await api.propose({ question: 'Should state admit `part`?', body_kind: 'change', body: { declaration_id: 'register.obligations', to: WIDER } } as never, owner)) as Out;
    assert.ok(made.ok, JSON.stringify(made));
    const id = (made.value as { id: string }).id;
    sql.exec('UPDATE suggestion SET body = ? WHERE id = ?', JSON.stringify({ declaration_id: 'register.obligations', to }), id);
    return id;
  };
  const status = (id: string) => sql.one<{ status: string }>('SELECT status FROM suggestion WHERE id = ?', id)!.status;
  const values = () => {
    const decl = api.kernel.declarations().find((d) => d.id === 'register.obligations')!;
    return (JSON.parse(decl.body) as { fields: { id: string; values?: string[] }[] }).fields.find((f) => f.id === 'state')!.values;
  };
  return { sql, api, file, status, values };
}

test('A CHANGE FILED BEFORE d15066d2 WITH A `to` THAT WILL NOT INSTALL is refused on acceptance and goes back in the queue', async () => {
  const { sql, api, file, status, values } = await record();
  for (const to of [
    { values: ['open', 'paid', 'part'] },
    { id: 'register.obligations', kind: 'register' },
    { declarations: [WIDER, { values: ['part'] }] },
  ]) {
    const id = await file(to);
    let out: Out;
    try {
      out = (await api.decide({ id, decide: { option: 'accept', reason: 'part payments happen' } }, owner)) as Out;
    } catch (e) {
      assert.fail(`accepting ${JSON.stringify(to)} threw ${(e as Error).message}, and ${id} was left ${status(id)}`);
    }
    assert.equal(out.ok, false, `accepting ${JSON.stringify(to)} answered ok with nothing installed`);
    assert.ok(out.refusal?.fix, 'the refusal says what to do');
    assert.doesNotMatch(out.refusal!.fix, /Cannot read|undefined/, 'the refusal is a sentence and not a stack');
    assert.equal(status(id), 'open', `${id} resolved with nothing installed behind it`);
    assert.deepEqual(values(), ['open', 'paid'], 'part of the change landed');
  }
  sql.close();
});

test('and a change that does install is still accepted and resolved', async () => {
  const { sql, api, file, status, values } = await record();
  const id = await file(WIDER);
  const out = (await api.decide({ id, decide: { option: 'accept', reason: 'part payments happen' } }, owner)) as Out;
  assert.ok(out.ok, JSON.stringify(out));
  assert.equal(status(id), 'resolved');
  assert.deepEqual(values(), ['open', 'paid', 'part']);
  sql.close();
});
