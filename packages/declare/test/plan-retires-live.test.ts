/**
 * An update that takes a door or pattern away says when the record is still using it (REC-A16, step 1).
 *
 * THE PLAN CALLED IT A RETIRE AND SAID NOTHING OF TEXTS. money-core 3.0.0 drops the card wordings and their text twins;
 * a record whose Shortcut still posts there was planned four retires, and the texts stopped filing the day the owner said
 * yes. `plan` is handed what the record uses now (`PlanOptions.live`) and marks each such retire `live: true`.
 *
 * Driven on a record built by hand, so what is measured is `plan` alone: `banky` 1.0.0 with a door, a pattern reading it
 * and a list, and 1.1.0 keeping only the list.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalise, plan, type Installed, type Pack } from '../src/index.ts';

const said = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value?: T; refusal?: { code: string; fix: string; at?: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code} at ${x.refusal?.at}: ${x.refusal?.fix}`);
  return x.value as T;
};

const DOOR = { ingest: 'bank-door', pack: 'banky', channel: 'webhook', verify: { kind: 'path' }, writes: { register: 'register.lines' } };
const TWIN = { ingest: 'bank-twin', pack: 'banky', channel: 'webhook', door: 'bank-door', writes: { register: 'register.lines' } };
const LINES = { register: 'lines', name: 'Lines', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] };

const row = (id: string, body: unknown): Installed['declarations'][number] => ({
  id,
  version: 1,
  kind: id.slice(0, id.indexOf('.')) as Installed['declarations'][number]['kind'],
  pack_id: 'banky',
  body: JSON.stringify(body),
  checksum: id,
});

const record = (used: string[] = []): Installed => ({
  format: 1,
  primitives: 1,
  record_version: 7,
  packs: [{ id: 'banky', version: '1.0.0' }],
  declarations: [row('ingest.bank-door', DOOR), row('ingest.bank-twin', TWIN), row('register.lines', LINES)],
  rows: { lines: 0 },
  used,
});

/** banky 1.1.0: the list only, and `hands` when given. */
const next = async (hands?: Record<string, string>): Promise<Pack> =>
  said<Pack>(
    await normalise({
      pack: 'banky',
      version: '1.1.0',
      summary: 'Bank lines.',
      author: 'Halden',
      license: 'MIT',
      requires: { format: 1, primitives: 1, packs: {} },
      ...(hands === undefined ? {} : { hands }),
      declarations: [LINES],
    }),
  );

const marks = (retires: readonly { id: string; live?: true }[]) => Object.fromEntries(retires.map((r) => [r.id, r.live === true]));

test('A DOOR AND A PATTERN THE RECORD IS USING ARE MARKED LIVE when the update retires them', async () => {
  const diff = await plan(await next(), record(), { live: new Set(['ingest.bank-door', 'ingest.bank-twin']) });
  assert.deepEqual(marks(diff.retires), { 'ingest.bank-door': true, 'ingest.bank-twin': true });
});

test('a retire with no arrivals and no address is not marked live', async () => {
  const diff = await plan(await next(), record(), { live: new Set(['ingest.bank-twin']) });
  assert.deepEqual(marks(diff.retires), { 'ingest.bank-door': false, 'ingest.bank-twin': true }, 'only the pattern in use is live');
  const none = await plan(await next(), record(), { live: new Set() });
  assert.ok(
    none.retires.every((r) => !('live' in r)),
    'an empty set marks nothing',
  );
});

test('a plan handed no live set marks nothing, as every plan did before', async () => {
  const diff = await plan(await next(), record());
  assert.equal(diff.retires.length, 2);
  assert.ok(diff.retires.every((r) => !('live' in r)));
});

test('one handed on is never marked: it keeps answering under the pack it goes to', async () => {
  const diff = await plan(await next({ 'ingest.bank-door': 'teller', 'ingest.bank-twin': 'teller' }), record(['ingest.bank-twin']), {
    live: new Set(['ingest.bank-door', 'ingest.bank-twin']),
  });
  assert.deepEqual(
    diff.retires.map((r) => [r.id, r.to ?? null, r.live ?? null]),
    [
      ['ingest.bank-door', 'teller', null],
      ['ingest.bank-twin', 'teller', null],
    ],
  );
});

test('only doors and patterns are marked: a list in the set is a retire like any other', async () => {
  const bare = said<Pack>(
    await normalise({
      pack: 'banky',
      version: '1.1.0',
      summary: 'Bank lines.',
      author: 'Halden',
      license: 'MIT',
      requires: { format: 1, primitives: 1, packs: {} },
      declarations: [DOOR, TWIN],
    }),
  );
  const diff = await plan(bare, record(), { live: new Set(['register.lines']) });
  assert.deepEqual(marks(diff.retires), { 'register.lines': false });
});
