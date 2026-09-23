/**
 * A door is handed with the pattern naming it only where `hands` sends it to the same pack
 * (`loop/research-batch-forty-seven-audit.md` finding 4).
 *
 * THE DOOR WENT WHERE THE PATTERN WENT, WHATEVER `hands` SAID OF IT. `door-follows-patterns.test.ts` made a door follow
 * a handed pattern, so money-core's SMS door stopped retiring from under the patterns it hands to `bank-hsbc-eg`. It also
 * handed a door no `hands` entry named: measured by the audit's `door-unasked.mts`, `banky` 1.1.0 handing only
 * `ingest.bank-twin` to `teller` planned `ingest.bank-door` to `teller` as well, and `teller` 1.0.0, whose twin names a
 * door of its own, then met `{ id: 'ingest.bank-door', handed: true }`, the conflict `install` refuses, so it could not
 * install at all. What the author meant is the author's to say, so the plan hands only what `hands` names and
 * `installFault` says the one line to add.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { installFault, normalise, plan, type Installed, type Pack } from '../src/index.ts';

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

/** banky 1.0.0 with its door, its twin and its list; the twin has filed rows, the door has held no token. */
const RECORD: Installed = {
  format: 1,
  primitives: 1,
  record_version: 7,
  packs: [{ id: 'banky', version: '1.0.0' }],
  declarations: [row('ingest.bank-door', DOOR), row('ingest.bank-twin', TWIN), row('register.lines', LINES)],
  rows: { lines: 0 },
  used: ['ingest.bank-twin'],
};

const banky = async (hands: Record<string, string>): Promise<Pack> =>
  said<Pack>(
    await normalise({
      pack: 'banky',
      version: '1.1.0',
      summary: 'Bank lines.',
      author: 'Halden',
      license: 'MIT',
      requires: { format: 1, primitives: 1, packs: {} },
      hands,
      declarations: [LINES],
    }),
  );

test('A hands THAT SENDS THE PATTERN AND NOT THE DOOR IT NAMES IS REFUSED, naming both and the line to add', async () => {
  const pack = await banky({ 'ingest.bank-twin': 'teller' });
  const diff = await plan(pack, RECORD);
  const door = diff.retires.find((r) => r.id === 'ingest.bank-door');
  const fault = installFault(pack, diff);
  assert.equal(fault?.code, 'DECLARATION_INVALID', `installFault said ${JSON.stringify(fault)}, and the door went to ${door?.to}, which no hands entry named`);
  assert.equal(fault?.at, 'hands.ingest.bank-twin');
  assert.match(fault?.fix ?? '', /ingest\.bank-twin/u);
  assert.match(fault?.fix ?? '', /"ingest\.bank-door": "teller"/u, 'the one line to add to hands');
  assert.equal(door?.to, undefined, 'the door was handed to a pack no hands entry sent it to');
});

test('a hands that sends the door to another pack than its pattern is refused the same way, and the door goes where hands says', async () => {
  const pack = await banky({ 'ingest.bank-twin': 'teller', 'ingest.bank-door': 'porter' });
  const diff = await plan(pack, { ...RECORD, used: ['ingest.bank-twin', 'ingest.bank-door'] });
  assert.deepEqual(
    diff.retires.map((r) => [r.id, r.to ?? null]),
    [
      ['ingest.bank-door', 'porter'],
      ['ingest.bank-twin', 'teller'],
    ],
  );
  const fault = installFault(pack, diff);
  assert.equal(fault?.at, 'hands.ingest.bank-twin', JSON.stringify(fault));
  assert.match(fault?.fix ?? '', /porter/u);
});

test('a hands that sends both to one pack hands the door and refuses nothing', async () => {
  const pack = await banky({ 'ingest.bank-twin': 'teller', 'ingest.bank-door': 'teller' });
  const diff = await plan(pack, RECORD);
  assert.equal(diff.retires.find((r) => r.id === 'ingest.bank-door')?.to, 'teller');
  assert.equal(installFault(pack, diff), null);
});

test('a pattern that is retired, not handed, asks nothing of hands', async () => {
  const pack = await banky({ 'ingest.bank-twin': 'teller' });
  const diff = await plan(pack, { ...RECORD, used: [] });
  assert.deepEqual(diff.retires.map((r) => r.to ?? null), [null, null]);
  assert.equal(installFault(pack, diff), null);
});
