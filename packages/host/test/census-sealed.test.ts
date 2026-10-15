/**
 * The sealed census (LCH-C08 job 5): no route that is safe by method answers a sealed value, to the owner or to a
 * member, on a record whose vault holds one.
 *
 * WHAT IS PLANTED is what the record keeps and never hands back: a vault key's wrapped bytes and nonce, and a key's
 * sealed columns, `ciphertext`, `nonce` and the two `prev_` ones, each an invented string written as bytes, and a list
 * whose secret field names that key, as a deposit leaves it. Every GET route of `ROUTES` is then asked, with each
 * argument it takes filled with something this record holds, and every answer is searched for each planted string as
 * text, base64, hex and as the numbers a byte array is written out as.
 *
 * THE CENSUS MUST SEE SOMETHING. A setup where every route refused would pass by saying nothing, so the owner's
 * answers must include enough 200s, and `listGrants` must name the key by its label: the vault was read through a
 * safe door, and only its sealed half stayed in.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '@braindog/record';

import { ROUTES, handlersFor, serveApi } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 15, 12);
const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAE';
const GRANT = 'g_01M35E8X545TCAFPPWZN643QKM';
const OWNER: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' }, credentialed: true, provedAt: NOW };
const MEMBER: CallContext = { principal: { kind: 'person', id: 'p_member', level: 'write' }, credentialed: true, provedAt: NOW };

/** One invented string per sealed column, so a find says which column got out. */
const PLANTS = {
  'grant.ciphertext': 'plant-ciphertext-Qv7rZ2mWk9',
  'grant.nonce': 'plant-nonce-Lx4bT8',
  'grant.prev_ciphertext': 'plant-prevcipher-Hy3nD6pRs1',
  'grant.prev_nonce': 'plant-prevnonce-Jc5wF0',
  'vault_key.wrapped': 'plant-wrapped-Uo2kE7vNq4',
  'vault_key.nonce': 'plant-wrapnonce-Mz8gA3',
} as const;
const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

/** Every way a column's bytes could be written into JSON: as text, base64, base64url, hex, and as an array's numbers. */
const spellings = (text: string): string[] => {
  const b = Buffer.from(bytes(text));
  return [text, b.toString('base64'), b.toString('base64url'), b.toString('hex'), [...b].join(','), JSON.stringify({ 0: b[0], 1: b[1], 2: b[2] }).slice(1, -1)];
};

const CLIENTS = {
  id: 'register.clients',
  kind: 'register' as const,
  body: { id: 'clients', name: 'Clients', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'token', type: 'secret' }] } as never,
};

async function planted() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
  const made = await api.createRecord({ id: REC, slug: 'tallow-works', name: 'Tallow Works', tz: 'UTC', locale: 'en', owner: { id: 'p_owner', email: 'wren@tallow.example', name: 'Wren Abernathy' } });
  assert.ok(made.ok, JSON.stringify(made));
  sql.exec("INSERT INTO person (id, email, name, suspended_at) VALUES ('p_member', 'oswin@tallow.example', 'Oswin Pell', NULL)");
  sql.exec("INSERT OR REPLACE INTO member (person_id, register, level, seen_at) VALUES ('p_member', '*', 'write', NULL)");
  assert.ok((await api.kernel.install([CLIENTS])).ok);
  sql.exec(
    "INSERT INTO grant (id, label, opens, kind, version, ciphertext, nonce, prev_ciphertext, prev_nonce, kdf, wrapped_by, kek_id, bytes, hint, created_at) VALUES (?, 'Kiln supplier portal', 'kiln.example', 'api_token', 2, ?, ?, ?, ?, 'hkdf', 'kek', 'kek_7c', 40, 'a 40-character token', '2026-10-01T00:00:00.000Z')",
    GRANT, bytes(PLANTS['grant.ciphertext']), bytes(PLANTS['grant.nonce']), bytes(PLANTS['grant.prev_ciphertext']), bytes(PLANTS['grant.prev_nonce']),
  );
  /* THE RECORD KEY'S PURPOSE AND THE CONNECTOR'S, whichever the new record has not written itself. */
  const held = new Set(sql.all<{ purpose: string }>('SELECT purpose FROM vault_key').map((r) => r.purpose));
  const free = ['record', 'connector'].filter((p) => !held.has(p));
  assert.ok(free.length > 0, 'the new record already holds every vault key this census could plant');
  for (const purpose of free)
    sql.exec("INSERT INTO vault_key (purpose, wrapped, nonce, wrapped_by, kek_id) VALUES (?, ?, ?, 'kek', 'kek_7c')", purpose, bytes(PLANTS['vault_key.wrapped']), bytes(PLANTS['vault_key.nonce']));
  const acme = await api.create({ register: 'clients', fields: { name: 'Acme Candles' } }, OWNER);
  assert.ok(acme.ok, JSON.stringify(acme));
  sql.exec("UPDATE entry SET fields = json_set(fields, '$.token', ?) WHERE register = 'clients'", GRANT);
  return { sql, api, seq: (acme.value as { seq: number }).seq };
}

/** Something this record holds for each argument a read takes, so the read reaches the record and not a refusal. */
const filled = (seq: number): Record<string, string> => ({
  register: 'clients', seq: String(seq), list: 'clients', q: 'Acme', name: 'Acme Candles', slug: 'home', limit: '50',
  includeDeleted: 'true', id: GRANT, on: `clients:${seq}`, field: 'name', by: 'name', days: '30',
});

const SAFE = ROUTES.filter((r) => !r.writes);

/** Every safe route asked as the owner and as the member: what was found, how many were answered, and `listGrants`. */
async function census(handlers: ReturnType<typeof handlersFor>, seq: number) {
  const args = filled(seq);
  const found: string[] = [];
  const answered = { owner: 0, member: 0 };
  let grants = '';
  for (const [who, ctx] of [['owner', OWNER], ['member', MEMBER]] as const) {
    for (const route of SAFE) {
      /* NEVER A NETWORK FETCH: a read that takes an address is asked without one. */
      const takes = Object.keys(route.takes ?? {}).filter((k) => k !== 'url' && Object.hasOwn(args, k));
      const query = new URLSearchParams(takes.map((k): [string, string] => [k, args[k]!]));
      const res = await serveApi(new Request(`https://tallow.example/api/${route.name}?${query}`), handlers, ctx);
      const text = await res.text();
      if (res.status === 200) answered[who] += 1;
      if (who === 'owner' && route.name === 'listGrants') grants = text;
      for (const [column, plant] of Object.entries(PLANTS))
        if (spellings(plant).some((s) => text.includes(s))) found.push(`${route.name} as the ${who} answered ${column}`);
    }
  }
  return { found, answered, grants };
}

test('NO SAFE ROUTE ANSWERS A SEALED VALUE, to the owner or to a member', async () => {
  const { sql, api, seq } = await planted();
  const { found, answered, grants } = await census(handlersFor(api), seq);
  assert.deepEqual(found, [], 'a safe route answered a sealed value');
  assert.ok(answered.owner >= SAFE.length / 2, `the owner was answered ${answered.owner} of ${SAFE.length} reads, too few to say anything`);
  assert.ok(answered.member > 0, 'the member was answered nothing');
  assert.match(grants, /Kiln supplier portal/, 'listGrants did not read the vault, so the census proves nothing about it');
  sql.close();
});

test('THE CENSUS SEES A LEAK: a listGrants that answered whole rows is found, column by column', async () => {
  const { sql, api, seq } = await planted();
  const leaky = handlersFor(Object.assign(Object.create(api) as typeof api, {
    listGrants: async () => ({ ok: true, value: { grants: sql.all('SELECT * FROM grant'), keys: sql.all('SELECT * FROM vault_key') } }),
  }) as never);
  const { found } = await census(leaky, seq);
  for (const column of Object.keys(PLANTS)) assert.ok(found.includes(`listGrants as the owner answered ${column}`), `${column} got out unseen`);
  sql.close();
});

test('THE CENSUS IS EVERY SAFE ROUTE, and neither of the two that carry sealed material is routed', () => {
  assert.ok(SAFE.length > 50, `only ${SAFE.length} safe routes`);
  for (const name of ['openGrant', 'bindGrant']) assert.equal(ROUTES.some((r) => r.name === name), false, `${name} is routed`);
});
