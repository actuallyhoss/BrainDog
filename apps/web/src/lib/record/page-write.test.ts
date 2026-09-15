/**
 * A declared page's writes: a moved card and a ticked task become one `update` of the row they came from, at the version
 * the page read, and the answer is written, the record's sentence, a conflict, or no record at all.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { copy } from '../copy.ts';
import { REGISTERS } from './data.ts';
import { movePatch, tickPatch, updateRow, type Fetch } from './page-write.ts';

const BASE = 'http://record.test';

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function host(answer: (() => Response) | null): { io: Fetch; sent: { url: string; init: RequestInit | undefined }[] } {
  const sent: { url: string; init: RequestInit | undefined }[] = [];
  const io: Fetch = async (url, init) => {
    sent.push({ url, init });
    if (!answer) throw new TypeError('fetch failed');
    return answer();
  };
  return { io, sent };
}

/* A register the sample declares with a state and terminal states, whichever it is. */
const withState = Object.values(REGISTERS).find((r) => r.state && (r.done?.length ?? 0) > 0 && r.fields.some((f) => f.id === r.state && (f.values?.length ?? 0) > 1));

test('a ticked task is its register state: the first terminal one, and back to the first that is not', () => {
  assert.ok(withState, 'the sample declares no register with a state and terminal states');
  const field = withState.state!;
  const values = withState.fields.find((f) => f.id === field)!.values!;
  const ref = { register: withState.id, seq: 1, version: 1 };
  assert.deepEqual(tickPatch(ref, true), { [field]: withState.done![0] });
  assert.deepEqual(tickPatch(ref, false), { [field]: values.find((v) => !withState.done!.includes(v)) });
  assert.equal(tickPatch({ register: 'no-such-list', seq: 1, version: 1 }, true), null);
});

test("a moved card's column goes back to the declared value", () => {
  assert.ok(withState);
  const field = withState.state!;
  const declared = withState.fields.find((f) => f.id === field)!.values!.find((v) => v.includes('_')) ?? withState.done![0]!;
  const drawn = declared.replaceAll('_', ' ').toUpperCase();
  assert.deepEqual(movePatch({ register: withState.id, seq: 1, version: 1 }, field, drawn), { [field]: declared });
});

test('the change is one update of that row at the version the page read, with the session', async () => {
  const { io, sent } = host(() => json(200, { ok: true, value: { id: 'e_1', seq: 4, version: 9 } }));
  const out = await updateRow(BASE, { register: 'tasks', seq: 4, version: 8 }, { state: 'done' }, 'Send the invoice', io);
  assert.deepEqual(out, { from: 'written' });
  assert.equal(sent[0]!.url, `${BASE}/api/update`);
  assert.equal(sent[0]!.init?.method, 'POST');
  assert.equal(sent[0]!.init?.credentials, 'same-origin');
  assert.deepEqual(JSON.parse(String(sent[0]!.init?.body)), { register: 'tasks', seq: 4, patch: { state: 'done' }, version: 8 });
});

test("a refusal is the record's sentence, and a row changed first is a conflict", async () => {
  const fix = 'done is not a state tasks can move to from dropped.';
  const refused = host(() => json(422, { ok: false, refusal: { code: 'TRANSITION_ILLEGAL', fix } }));
  assert.deepEqual(await updateRow(BASE, { register: 'tasks', seq: 4, version: 8 }, {}, 'Send the invoice', refused.io), { from: 'refused', fix });

  const moved = host(() => json(409, { ok: false, conflict: { current: {}, actor: 'p_2' } }));
  assert.deepEqual(await updateRow(BASE, { register: 'tasks', seq: 4, version: 8 }, {}, 'Send the invoice', moved.io), {
    from: 'conflict',
    fix: copy.pageRowConflict('Send the invoice'),
  });
});

test('no record is a calm sentence and never the error text', async () => {
  assert.deepEqual(await updateRow(BASE, { register: 'tasks', seq: 4, version: 8 }, {}, 'x', host(null).io), {
    from: 'unreachable',
    fix: copy.recordNotReached,
  });
});
