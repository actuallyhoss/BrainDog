/**
 * A read mark with nothing the caller may see to mark answers `upTo: 0`.
 *
 * 2cf9ef9c changed `upTo: null` to `upTo: 0` for this case, because the client types `upTo` as a number and the
 * self-host answered 0 on an empty log before `markRead` learned to walk down to an event the caller may see. The
 * commit carried no test, and it was measured holding with nothing to stop it going back. Null here is not only a type
 * error in the client: `seen_at` would still be right, so the only thing that says the mark did not move is this
 * number.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);

const OBLIGATIONS = {
  id: 'register.obligations',
  kind: 'register' as const,
  body: { id: 'obligations', name: 'Obligations', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

const DIARY = {
  id: 'register.diary',
  kind: 'register' as const,
  body: { id: 'diary', name: 'Diary', title: 'body', fields: [{ id: 'body', type: 'text', required: true }] } as never,
};

const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string } };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value as T;
};

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok((await api.kernel.install([OBLIGATIONS, DIARY])).ok);
  assert.ok(
    api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1' } }).ok,
  );
  value(await api.invite({ person: 'p_9', name: 'Wren', registers: { obligations: 'read' } }, owner));
  const held = api.kernel.access('p_9')!;
  const wren: CallContext = { principal: { kind: 'person', id: 'p_9', level: held.level }, registers: held.registers ?? '*', levels: held.levels };
  return { sql, api, wren };
}

test('NOTHING THE CALLER MAY SEE TO MARK IS `upTo: 0`, not null, and a number from her is refused rather than walked', async () => {
  const { sql, api, wren } = await record();
  /* ONLY THE DIARY HAS ROWS, and Wren was invited to Obligations, so every event she could land on is hidden. */
  value(await api.create({ register: 'diary', fields: { body: 'Dinner with the auditor' } } as never, owner));
  const before = sql.one<{ n: number }>('SELECT count(*) AS n FROM event')!.n;
  assert.ok(before > 0, 'the log is not empty, so this is the walk finding nothing and not an empty record');

  for (const args of [undefined, {}]) {
    const out = value<{ upTo: unknown; seen_at: unknown }>(await api.markRead(args, wren));
    assert.strictEqual(out.upTo, 0, `markRead(${JSON.stringify(args)}) answered upTo ${JSON.stringify(out.upTo)}`);
    assert.strictEqual(out.seen_at, null, 'a mark nobody set moved');
  }
  /* A NUMBER FROM HER IS REFUSED NOW, one past the log included (`history-cursor.test.ts`): the answer to a number was
     the rowid it walked to, which said where her lines sit. The owner's `upTo: 0` for nothing to mark is unchanged. */
  for (const upTo of [1, 1_000_000_000_000]) {
    const out = (await api.markRead({ upTo }, wren)) as Out;
    assert.equal(out.ok, false, `markRead({ upTo: ${upTo} }) was taken from a member held to one list`);
    assert.equal(out.refusal?.code, 'VALUE_MALFORMED');
  }
  sql.close();
});

test('and a caller with something to mark is answered the event it landed on, by the id she was shown', async () => {
  const { sql, api, wren } = await record();
  value(await api.create({ register: 'obligations', fields: { what: 'Invoice 41' } } as never, owner));
  const out = value<{ upTo: unknown; seen_at: string | null }>(await api.markRead(undefined, wren));
  const newest = value<{ events: { id: string }[] }>(await api.recentHistory({ limit: 1 }, wren)).events[0]!;
  assert.equal(out.upTo, `e.${newest.id}`, `upTo was ${JSON.stringify(out.upTo)}`);
  assert.equal(typeof out.seen_at, 'string');
  const again = value<{ upTo: unknown }>(await api.markRead({ upTo: out.upTo as string }, wren));
  assert.equal(again.upTo, out.upTo, 'what markRead answered is not what it takes back');
  sql.close();
});
