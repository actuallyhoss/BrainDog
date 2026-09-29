/**
 * A door goes where the patterns naming it go.
 *
 * A HANDED PATTERN ARRIVED NAMING A DOOR THAT WAS GONE. `hands` passes on only what the record uses (`Installed.used`):
 * a pattern that has filed a row, and a webhook door that holds a token. The door a pattern names through `door:` is
 * neither when every text reaches it through the pattern, so money-core's plan handed `ingest.bank-ipn-in-sms`, which
 * names `door: bank-from-out-sms`, and retired the door. The pattern then sat live under `bank-hsbc-eg` naming a door no
 * text can arrive at, which is exactly the declaration the kernel's `doorFault` refuses at install.
 *
 * Driven here on a record built by hand, so what is measured is `plan` and nothing the record adds: a pack `banky`
 * holding a door and its twin, and a next version that hands both to `teller` with only the twin in use.
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

/** banky 1.0.0 with its door, its twin and its list, and `used` naming what this record has put to work. */
const recordWith = (used: string[]): Installed => ({
  format: 1,
  primitives: 1,
  record_version: 7,
  packs: [{ id: 'banky', version: '1.0.0' }],
  declarations: [row('ingest.bank-door', DOOR), row('ingest.bank-twin', TWIN), row('register.lines', LINES)],
  rows: { lines: 0 },
  used,
});

/** banky 1.1.0: the list only, handing both doors to `teller`, which the record does not hold. */
const next = async (): Promise<Pack> =>
  said<Pack>(
    await normalise({
      pack: 'banky',
      version: '1.1.0',
      summary: 'Bank lines.',
      author: 'Halden',
      license: 'MIT',
      requires: { format: 1, primitives: 1, packs: {} },
      hands: { 'ingest.bank-door': 'teller', 'ingest.bank-twin': 'teller' },
      declarations: [LINES],
    }),
  );

test('A DOOR NOBODY POSTED TO GOES WITH THE PATTERN THAT NAMES IT, handed to the same pack and not retired', async () => {
  const diff = await plan(await next(), recordWith(['ingest.bank-twin']));
  const retires = Object.fromEntries(diff.retires.map((r) => [r.id, r.to ?? null]));
  assert.deepEqual(retires, { 'ingest.bank-twin': 'teller', 'ingest.bank-door': 'teller' }, 'the twin was handed and the door it names retired');
  const door = diff.retires.find((r) => r.id === 'ingest.bank-door')!;
  /* STAGED AS EVERY HANDOVER IS, the live body with `pack` set to where it goes, so the kernel moves the row's owner. */
  assert.deepEqual(JSON.parse(door.body!), { ...DOOR, pack: 'teller' });
});

test('a door is still retired when no handed pattern names it', async () => {
  const diff = await plan(await next(), recordWith([]));
  assert.deepEqual(
    diff.retires.map((r) => [r.id, r.to ?? null]),
    [
      ['ingest.bank-door', null],
      ['ingest.bank-twin', null],
    ],
  );
});

test('a door the record uses is handed on its own account, once', async () => {
  const diff = await plan(await next(), recordWith(['ingest.bank-door', 'ingest.bank-twin']));
  assert.deepEqual(
    diff.retires.map((r) => [r.id, r.to ?? null]),
    [
      ['ingest.bank-door', 'teller'],
      ['ingest.bank-twin', 'teller'],
    ],
  );
});
