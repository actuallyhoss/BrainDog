/**
 * Accepting a change whose install throws for a reason that is not the change's shape.
 *
 * `decide-install.test.ts` is about a `to` that is not a declaration, which throws a `TypeError` out of
 * `kernel.install` and is answered "not a declaration" with the question reopened. The `catch` that answers it was bare,
 * so every other throw got the same sentence: a full disk or a corrupt page told the owner to propose the change again
 * as `{"id":"register.<id>",...}`, which is advice about a shape that was never wrong, and the real message was thrown
 * away with nothing logged. Here the install is made to throw the way a driver does, and the answer has to be that
 * error, with the question still put back in the queue.
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

async function asked() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok((await api.kernel.install([OBLIGATIONS])).ok);
  const made = (await api.propose({ question: 'Should state admit `part`?', body_kind: 'change', body: { declaration_id: 'register.obligations', to: WIDER } } as never, owner)) as Out;
  assert.ok(made.ok, JSON.stringify(made));
  const id = (made.value as { id: string }).id;
  const status = () => sql.one<{ status: string }>('SELECT status FROM suggestion WHERE id = ?', id)!.status;
  return { sql, api, id, status };
}

test('A THROW THAT IS NOT ABOUT THE SHAPE SURFACES AS ITSELF, and the question is open again behind it', async () => {
  const { sql, api, id, status } = await asked();
  const install = api.kernel.install;
  /* THE WAY `node:sqlite` THROWS: a plain `Error`, with the driver's words in it. */
  api.kernel.install = (async () => {
    throw new Error('database or disk is full');
  }) as typeof install;
  let said: Out | null = null;
  await assert.rejects(
    async () => {
      said = (await api.decide({ id, decide: { option: 'accept', reason: 'part payments happen' } }, owner)) as Out;
    },
    /database or disk is full/u,
    'the record answered a full disk as a change that is not a declaration',
  );
  assert.equal(said, null);
  assert.equal(status(), 'open', 'the question stayed resolved with nothing installed behind it');
  api.kernel.install = install;
  sql.close();
});

test('AND A `TypeError` FROM A MALFORMED `to` IS STILL THE SENTENCE, as `decide-install.test.ts` holds', async () => {
  const { sql, api, id, status } = await asked();
  const install = api.kernel.install;
  api.kernel.install = (async () => {
    throw new TypeError("Cannot read properties of undefined (reading 'writes')");
  }) as typeof install;
  const out = (await api.decide({ id, decide: { option: 'accept', reason: 'part payments happen' } }, owner)) as Out;
  assert.equal(out.ok, false);
  assert.equal(out.refusal?.code, 'VALUE_MALFORMED');
  assert.equal(out.refusal?.at, 'body.to');
  assert.equal(status(), 'open');
  api.kernel.install = install;
  sql.close();
});
