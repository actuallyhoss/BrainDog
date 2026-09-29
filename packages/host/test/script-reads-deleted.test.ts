/**
 * A script can read the rows a person deleted, when it asks, and is handed them with their secrets off.
 *
 * WHY IT ASKS. mercury's ledger read live rows only, so a transaction he deleted had no row the script could see, and
 * the next run wrote it again. The record's `list` has read `includeDeleted` for as long
 * as rows have been soft-deleted; `scriptReads` did not pass it, and `ctx.record.list` had no way to say it.
 *
 * THE READS HERE ARE THE SHIPPED ONES: `scriptReads` over a real record, and for the whole path the runner the
 * self-host builds, with the script run in QuickJS. The Worker hands its list op to the same `scriptReads`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '@braindog/record';
import type { Scripted } from '@braindog/kernel';
import { runInQuickJs } from '@braindog/script/quickjs';

import { scriptReads, scriptRunner } from '../src/script.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 25, 9);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const GRANT = 'g_01M35E8X545TCAFPPWZN643QKK';

const CLIENTS = {
  id: 'register.clients',
  kind: 'register' as const,
  body: {
    id: 'clients',
    name: 'Clients',
    title: 'name',
    fields: [
      { id: 'name', type: 'text', required: true },
      { id: 'token', type: 'secret' },
    ],
  } as never,
};

type Row = { fields: Record<string, unknown>; deleted_at: string | null };

/** A script that lists `clients` as `call` says and writes what it saw into one row, so the row is its answer. */
const scripted = (call: string): Scripted => ({
  job: { id: 'j_1' } as never,
  host: null,
  scripted: {
    script: 'deleted',
    version: 1,
    actor: 'script:deleted@v1',
    input: null,
    decl: {
      egress: [],
      keys: [],
      reads: ['clients'],
      writes: ['seen'],
      source: `export default async function run(ctx) {
  const rows = await ${call};
  const seen = rows.map((r) => [r.fields.name, r.deleted_at !== null, 'token' in r.fields]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  ctx.write('seen', { said: JSON.stringify(seen) });
}`,
    },
    record: { id: 'self', tz: 'UTC' },
  },
});

/**
 * Acme live, Bolt deleted by the record's own update, and each holding a grant id where a deposit would have put it,
 * because a secret is written by the vault alone.
 */
async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  assert.ok((await api.kernel.install([CLIENTS])).ok);
  const acme = await api.create({ register: 'clients', fields: { name: 'Acme' } }, owner);
  const bolt = await api.create({ register: 'clients', fields: { name: 'Bolt' } }, owner);
  assert.ok(acme.ok && bolt.ok);
  sql.exec("UPDATE entry SET fields = json_set(fields, '$.token', ?) WHERE register = 'clients'", GRANT);
  const fresh = await api.get({ register: 'clients', seq: bolt.value.seq! } as never, owner);
  assert.ok(fresh.ok && fresh.value !== null);
  const gone = await api.update({ register: 'clients', seq: bolt.value.seq!, patch: { deleted_at: true }, version: fresh.value.version }, owner);
  assert.ok(gone.ok, JSON.stringify(gone));
  return { sql, api };
}

test('ASKED FOR, THE DELETED ROWS COME BACK WITH `deleted_at` SET AND THEIR SECRETS OFF; NOT ASKED, THE LIVE ONES ALONE', async () => {
  const { sql, api } = await record();
  const reads = scriptReads(api)(scripted('null'));

  const live = (await reads.list('clients', null)) as unknown as Row[];
  assert.deepEqual(live.map((r) => r.fields.name), ['Acme']);

  const all = (await reads.list('clients', null, { includeDeleted: true })) as unknown as Row[];
  const bolt = all.find((r) => r.fields.name === 'Bolt');
  assert.ok(bolt !== undefined, JSON.stringify(all));
  assert.equal(typeof bolt.deleted_at, 'string');
  assert.equal(all.find((r) => r.fields.name === 'Acme')?.deleted_at, null);
  assert.equal(JSON.stringify(all).includes(GRANT), false, 'a deleted row carried its secret field to the script');

  const off = (await reads.list('clients', null, { includeDeleted: false })) as unknown as Row[];
  assert.deepEqual(off.map((r) => r.fields.name), ['Acme']);
  sql.close();
});

test('AN OPTION THAT IS NOT `{ includeDeleted: true or false }` IS REFUSED, NOT READ AS NO OPTIONS', async () => {
  const { sql, api } = await record();
  const reads = scriptReads(api)(scripted('null'));
  for (const bad of [{ includeDeleted: 'true' }, { includeDeleted: 1 }, { deleted: true }, 'includeDeleted', [true]] as const)
    await assert.rejects(reads.list('clients', null, bad as never), /takes \{"includeDeleted":true\} or nothing, so nothing was read\./u, JSON.stringify(bad));
  sql.close();
});

/*
 * THIS ONE HOLDS THE PRELUDE TO SENDING `list` ITS THIRD ARGUMENT. The prelude (`packages/script/src/prelude.ts`)
 * builds `ctx.record.list` inside the sandbox, and were it to call `host.list` with the register and the filter alone,
 * the option would be dropped before it reached the binding and Bolt would never come back. The two tests above call
 * `scriptReads` directly and do not pass through it.
 */
test("THE WHOLE PATH ON THE SELF-HOST: `ctx.record.list(register, where, { includeDeleted: true })` in QuickJS", async () => {
  const { sql, api } = await record();
  const refuse = async (): Promise<never> => {
    throw new Error('this script fetches nothing');
  };
  const run = scriptRunner({ run: runInQuickJs, send: refuse, pin: refuse, openKey: null, grantOf: () => null, reads: scriptReads(api), now: () => NOW } as never);

  const said = async (call: string): Promise<unknown> => {
    const answer = await run(scripted(call));
    assert.ok('writes' in answer, JSON.stringify(answer));
    const [write] = answer.writes;
    assert.ok(write !== undefined && write.op === 'create');
    return JSON.parse((write.fields as { said: string }).said);
  };

  assert.deepEqual(await said("ctx.record.list('clients', null, { includeDeleted: true })"), [
    ['Acme', false, false],
    ['Bolt', true, false],
  ]);
  assert.deepEqual(await said("ctx.record.list('clients')"), [['Acme', false, false]]);
  sql.close();
});
