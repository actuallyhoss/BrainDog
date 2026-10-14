/**
 * What a person at "Adds only" is told when the app's first read is refused (USE-A11).
 *
 * The sentence every level gets ends "Ask an owner to raise your access.", which at `append` asks the owner to undo his
 * own invitation. Hers says what she can do and where, and carries `at: 'level.append'` so Home can draw the one button
 * under it ("Make your agent's key") without matching the words.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PEOPLE } from '../../../fixtures/names.ts';
import { APPEND_READ_AT, APPEND_READ_FIX, appendReadRefusal } from '../src/append-refusal.ts';
import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

test('THE SENTENCE SAYS WHAT SHE CAN DO AND WHERE, and the refusal carries `level.append`', () => {
  const r = appendReadRefusal();
  assert.equal(r.code, 'LEVEL_REQUIRED');
  assert.equal(
    r.fix,
    'You can add to this record and you cannot read it here. You add through an agent of your own. Make its key in Settings, under Agents.',
  );
  assert.equal(r.fix, APPEND_READ_FIX);
  assert.equal(r.at, 'level.append');
  assert.equal(APPEND_READ_AT, 'level.append');
  /* NO DEAD END IN IT, and none of the words a person must never read. */
  assert.doesNotMatch(r.fix, /raise your access|token|row|entity|—/u);
  /* A FRESH OBJECT EACH CALL, so a caller that changes one changes nobody else's. */
  assert.notEqual(appendReadRefusal(), appendReadRefusal());
});

/* THE LINE IN `index.ts` (`allows`, just before "Ask an owner to raise your access." is said) measured through the real boot. */
test('A PERSON AT ADDS ONLY ASKING FOR THE BOOT IS REFUSED WITH HER SENTENCE', async () => {
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(Date.UTC(2026, 9, 14, 9)) });
  const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
  const made = api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'saltmarsh', name: 'Saltmarsh Labs', tz: 'UTC', locale: 'en', owner: { id: 'p_owner' } });
  assert.ok(made.ok, JSON.stringify(made));
  const invited = await api.invite({ person: 'p_her', name: PEOPLE[3]!.name, level: 'append' }, owner);
  assert.ok(invited.ok, JSON.stringify(invited));

  const out = (await api.boot({ principal: { kind: 'person', id: 'p_her', level: 'append' } })) as {
    ok: boolean;
    refusal?: { code: string; fix: string; at?: string };
  };
  assert.equal(out.ok, false, 'a person at append read the boot');
  assert.deepEqual(
    { code: out.refusal?.code, fix: out.refusal?.fix, at: out.refusal?.at },
    { code: 'LEVEL_REQUIRED', fix: APPEND_READ_FIX, at: APPEND_READ_AT },
  );
});

/* AND AN AGENT'S TOKEN KEEPS THE TOKEN'S SENTENCE: it is already the agent, so "add through an agent" is not its fix. */
test('HER AGENT IS NOT TOLD TO MAKE AN AGENT', async () => {
  const api = await createRecordApi({ sql: openSqlite(), clock: fixedClock(Date.UTC(2026, 9, 14, 9)) });
  const out = (await api.boot({ principal: { kind: 'token', id: 't_her', scope: 'write', person: 'p_her', level: 'append' } })) as {
    ok: boolean;
    refusal?: { fix: string; at?: string };
  };
  assert.equal(out.ok, false, 'a write token at append read the boot');
  assert.notEqual(out.refusal?.fix, APPEND_READ_FIX);
  assert.notEqual(out.refusal?.at, APPEND_READ_AT);
});
