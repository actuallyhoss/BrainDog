/**
 * A trial reads what the scheduled run of the same body reads, and no more than its caller may.
 *
 * WHAT WAS MEASURED. `scriptTry` handed the host the record's `list` and `get` under the caller's own context, while a
 * scheduled run reads through the host's `scriptReads`: as `system` held to the body's `reads:`, with secret fields
 * taken off every row and a filter on one refused. One source was tried by a propose token and then run on its clock.
 * The trial listed Acme with its `token` (a grant id), read `seen#1` from a list outside `reads:`, and answered a
 * filter on the secret; the scheduled run listed Acme without the field, read `null`, and was refused the filter. So a
 * trial showed an agent writes the accepted script would never make.
 *
 * NOT A LEAK: the token read the grant id through its own `list`. The promise was the fault, and this holds the
 * promise: the same three reads, asked of a trial and of the host's own `scriptReads`, answer alike.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext, type RecordDeps } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { scriptReads } from '../../host/src/script.ts';

const NOW = Date.UTC(2026, 8, 22, 12);

const CLIENTS = {
  id: 'register.clients',
  kind: 'register' as const,
  body: { id: 'clients', name: 'Clients', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'token', type: 'secret' }] } as never,
};
const SEEN = {
  id: 'register.seen',
  kind: 'register' as const,
  body: { id: 'seen', name: 'Seen', title: 'said', fields: [{ id: 'said', type: 'text', required: true }] } as never,
};
const BODY = {
  script: 'peek',
  runs: { every: '1h' },
  egress: [],
  keys: [],
  reads: ['clients'],
  writes: ['seen'],
  source: 'export default async function run(ctx) { return null; }',
};

const GRANT = 'g_01M35E8X545TCAFPPWZN643QKK';
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };
const agent: CallContext = { principal: { kind: 'token', id: 't_1', scope: 'propose', person: 'p_1', level: 'write' } };

type Reads = Parameters<NonNullable<RecordDeps['tryScript']>>[0]['reads'];

/** The three reads, and a `get` of the row that holds the key, as lines a log would carry. */
async function probe(reads: Reads): Promise<string[]> {
  const out: string[] = [];
  const say = async (label: string, f: () => Promise<unknown>) => {
    try {
      out.push(`${label} ${JSON.stringify(await f())}`);
    } catch (e) {
      out.push(`${label} refused: ${(e as Error).message}`);
    }
  };
  const fieldsOf = (r: unknown) => (r === null ? null : (r as { fields: unknown }).fields);
  await say('R1 clients', async () => (await reads.list('clients', null)).map(fieldsOf));
  await say('R2 get seen#1', async () => fieldsOf(await reads.get('seen#1')));
  await say('R3 tree on token', async () => (await reads.list('clients', { field: 'token', present: true })).map((r) => (r as { fields: { name: string } }).fields.name));
  await say('R4 get clients#1', async () => fieldsOf(await reads.get('clients#1')));
  await say('R5 sentence on token', async () => (await reads.list('clients', 'token is set')).length);
  return out;
}

/**
 * A list asking for the deleted rows too, and one asking with an option the scheduled run refuses: the trial's copy of
 * `listOptions` (`host/src/script.ts`), held to the original by being asked the same two things.
 */
async function probeDeleted(reads: Reads): Promise<string[]> {
  const out: string[] = [];
  const say = async (label: string, f: () => Promise<unknown>) => {
    try {
      out.push(`${label} ${JSON.stringify(await f())}`);
    } catch (e) {
      out.push(`${label} refused: ${(e as Error).message}`);
    }
  };
  const seen = (r: unknown) => {
    const row = r as { fields: Record<string, unknown>; deleted_at: string | null };
    return [row.fields.name, row.deleted_at !== null, 'token' in row.fields];
  };
  await say('D1 deleted too', async () => (await reads.list('clients', null, { includeDeleted: true })).map(seen));
  await say('D2 option as text', async () => (await reads.list('clients', null, { includeDeleted: 'true' })).length);
  return out;
}

async function record(run: (reads: Reads) => Promise<string[]> = probe) {
  let reads: Reads | null = null;
  const sql = openSqlite();
  const api = await createRecordApi({
    sql,
    clock: fixedClock(NOW),
    tryScript: async (d) => {
      reads = d.reads;
      return run(d.reads);
    },
  });
  assert.ok((await api.kernel.install([CLIENTS, SEEN])).ok);
  for (const name of ['Acme', 'Bolt']) assert.ok((await api.create({ register: 'clients', fields: { name } }, owner)).ok);
  assert.ok((await api.create({ register: 'seen', fields: { said: 'a row of a list the script does not read' } }, owner)).ok);
  /* A SECRET IS WRITTEN BY THE KEYCHAIN ALONE, so the grant id is put where a deposit would have put it. */
  sql.exec("UPDATE entry SET fields = json_set(fields, '$.token', ?) WHERE register = 'clients' AND json_extract(fields, '$.name') = 'Acme'", GRANT);
  const scheduled = scriptReads(api)({
    job: null as never,
    host: null,
    scripted: { script: 'peek', version: 1, actor: 'script:peek@v1', input: null, decl: BODY, record: { id: 'self', tz: 'UTC' } },
  });
  return { sql, api, scheduled, reads: () => reads };
}

test("A TRIAL READS WHAT ITS SCHEDULED RUN READS: the body's reads, no secret field, and no filter on one", async () => {
  const { sql, api, scheduled } = await record();
  const direct = (await api.list({ register: 'clients' }, agent)) as { ok: boolean; value?: { rows: { fields: Record<string, unknown> }[] } };
  assert.ok(direct.ok && direct.value!.rows.some((r) => r.fields.token === GRANT), 'the token no longer reads the grant id itself, so this case proves nothing');

  const tried = (await api.scriptTry({ body: BODY }, agent)) as { ok: boolean; value?: string[] };
  assert.ok(tried.ok, JSON.stringify(tried));
  const ran = await probe(scheduled as unknown as Reads);
  assert.deepEqual(tried.value, ran);
  assert.equal(JSON.stringify(tried.value).includes(GRANT), false);
  sql.close();
});

test("AND NO MORE THAN ITS CALLER MAY: a list the body reads and the caller does not is still refused her", async () => {
  const { sql, api, reads } = await record();
  const seenOnly: CallContext = { principal: { kind: 'token', id: 't_2', scope: 'propose', person: 'p_1', level: 'write' }, registers: ['seen'] };
  const tried = (await api.scriptTry({ body: BODY }, seenOnly)) as { ok: boolean; value?: string[] };
  assert.ok(tried.ok, JSON.stringify(tried));
  assert.match(tried.value![0]!, /^R1 clients refused: /u);
  assert.equal(tried.value![3], 'R4 get clients#1 null');

  const appender: CallContext = { principal: { kind: 'person', id: 'p_2', level: 'write' }, levels: { clients: 'append' } };
  const held = (await api.scriptTry({ body: BODY }, appender)) as { ok: boolean; value?: string[] };
  assert.ok(held.ok, JSON.stringify(held));
  assert.match(held.value![0]!, /^R1 clients refused: /u);
  assert.equal(held.value![3], 'R4 get clients#1 null');
  assert.notEqual(reads(), null);
  sql.close();
});

test("AND ITS ONE LIST OPTION AS THE RUN TAKES IT: the deleted rows when asked, and any other option refused in the run's words", async () => {
  const { sql, api, scheduled } = await record(probeDeleted);
  const fresh = await api.get({ register: 'clients', seq: 2 } as never, owner);
  assert.ok(fresh.ok && fresh.value !== null, JSON.stringify(fresh));
  const gone = await api.update({ register: 'clients', seq: 2, patch: { deleted_at: true }, version: (fresh.value as { version: number }).version } as never, owner);
  assert.ok(gone.ok, JSON.stringify(gone));

  const tried = (await api.scriptTry({ body: BODY }, agent)) as { ok: boolean; value?: string[] };
  assert.ok(tried.ok, JSON.stringify(tried));
  assert.deepEqual(tried.value, await probeDeleted(scheduled as unknown as Reads));
  assert.ok(tried.value![0]!.includes('["Bolt",true,false]'), `the trial did not hand over the deleted row: ${tried.value![0]}`);
  assert.match(tried.value![1]!, /a script's list takes \{"includeDeleted":true\} or nothing, so nothing was read\.$/u);
  sql.close();
});
