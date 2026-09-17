/**
 * The declaration features the agents pack needs: bounds, conditions, who changes what, the vault
 * door, and the refusal that keeps a key out of every row.
 *
 * Each feature is asserted where it has each: it installs, its lint refuses a malformed declaration
 * by code and `at`, and the write path refuses what it forbids by code and `at`.
 *
 * NO LINE HERE HOLDS A KEY. Every key-shaped value is put together at run time from an issuer's
 * prefix, split in two, and a body that says it is fake; the random ones come from a seeded
 * generator.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  coerce,
  looksLikeCredential,
  openRecord,
  validateDeclaration,
  type Declaration,
  type Entry,
  type Kernel,
  type WriteContext,
} from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 11, 12);

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

type Said = { code: string; fix: string; at?: string; allowed?: readonly string[]; found?: unknown };
const refusal = (r: unknown): Said => {
  const x = r as { ok: boolean; refusal?: Said };
  assert.equal(x.ok, false, 'the call went through');
  return x.refusal!;
};

/** A refusal's code and where it points, which is what a caller branches on and fixes. */
const said = (r: unknown): string => {
  const x = refusal(r);
  return `${x.code} at ${String(x.at)}`;
};
const linted = (decl: Declaration): string | null => {
  const x = validateDeclaration(decl);
  return x ? `${x.code} at ${String(x.at)}` : null;
};

const OWNER: WriteContext = { actor: 'p_owner' };
const agent = (client_id = 'cc-1'): WriteContext => ({
  actor: 'p_owner',
  principal: { kind: 'token', token: 't_1' },
  session: { client_id, host: 'h', repo: 'braindog' },
});

const register = (id: string, fields: unknown[], extra: Record<string, unknown> = {}): Declaration => ({
  id: `register.${id}`,
  kind: 'register',
  body: { id, name: id, title: (fields[0] as { id: string }).id, fields, ...extra } as never,
});

/** One field under test, on a register whose title is a plain text. */
const probe = (...fields: Record<string, unknown>[]): Declaration => register('probe', [{ id: 'what', type: 'text' }, ...fields]);

const LEARNINGS = register(
  'learnings',
  [
    { id: 'lesson', type: 'text', required: true, min: 12, max: 400 },
    { id: 'rank', type: 'int', min: 1, max: 9 },
    { id: 'fee', type: 'money', max: 5000 },
    { id: 'notes', type: 'list', of: 'text' },
    { id: 'body', type: 'document' },
    { id: 'why', type: 'text', min: 24 },
    {
      id: 'state',
      type: 'enum',
      values: ['active', 'superseded', 'reverted'],
      default: 'active',
      transitions: {
        active: { to: ['superseded', 'reverted'], requires: ['why'] },
        superseded: { to: ['active'], by: 'decide' },
        reverted: { to: ['active'], by: 'decide' },
      },
    },
  ],
  { state: 'state', seq_prefix: 'LN' },
);

const SKILLS = register('skills', [
  { id: 'name', type: 'text', required: true, max: 64 },
  { id: 'trigger', type: 'text' },
  { id: 'body', type: 'document', required: true, by: 'decide' },
  { id: 'rev', type: 'int', default: 1, required: true, by: 'decide' },
]);

const TOOLS = register('tools', [
  { id: 'name', type: 'text', required: true },
  { id: 'kind', type: 'enum', values: ['mcp', 'cli', 'integration'], required: true },
  { id: 'transport', type: 'enum', values: ['stdio', 'http'], required_when: { field: 'kind', is: 'mcp' } },
  { id: 'command', type: 'text', required_when: { field: 'transport', is: 'stdio' } },
  { id: 'endpoint', type: 'text', required_when: { field: 'transport', is: 'http' } },
]);

const KEYS = register('credentials', [
  { id: 'label', type: 'text', required: true },
  { id: 'opens', type: 'text', required: true },
  { id: 'value', type: 'secret' },
]);

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(await k.install([LEARNINGS, SKILLS, TOOLS, KEYS]));
  return { k, sql };
}

const LESSON = 'Run the gates after the build, never beside it.';

/* ── min and max ─────────────────────────────────────────────────────────── */

test('MIN AND MAX BOUND A TEXT BY ITS BYTES AND A NUMBER BY ITS VALUE', async () => {
  const { k, sql } = await record();

  const short = refusal(k.create('learnings', { lesson: 'Too short.' }, OWNER));
  assert.equal(`${short.code} at ${short.at}`, 'OUT_OF_BOUNDS at lesson');
  assert.match(short.fix, /is 10 bytes, and takes 12 to 400 bytes/);

  /* BYTES, NOT CHARACTERS: six two-byte letters are twelve bytes, and two hundred and one are 402. */
  value(k.create('learnings', { lesson: 'é'.repeat(6) }, OWNER));
  assert.equal(said(k.create('learnings', { lesson: 'é'.repeat(201) }, OWNER)), 'OUT_OF_BOUNDS at lesson');

  assert.equal(said(k.create('learnings', { lesson: LESSON, rank: 0 }, OWNER)), 'OUT_OF_BOUNDS at rank');
  assert.equal(said(k.create('learnings', { lesson: LESSON, rank: 10 }, OWNER)), 'OUT_OF_BOUNDS at rank');
  assert.equal(said(k.create('learnings', { lesson: LESSON, fee: { amount: 5001, currency: 'GBP' } }, OWNER)), 'OUT_OF_BOUNDS at fee');
  const row = value<Entry>(k.create('learnings', { lesson: LESSON, rank: 9, fee: { amount: 5000, currency: 'GBP' } }, OWNER));
  assert.equal(said(k.update('learnings', row.id, { rank: 12 }, OWNER)), 'OUT_OF_BOUNDS at rank');

  /* A ROW IS NOT REFUSED FOR A BOUND IT PREDATES: raising `min` leaves an old lesson alone until a
     write sets it again. */
  const old = value<Entry>(k.create('learnings', { lesson: 'Twelve bytes' }, OWNER));
  const body = LEARNINGS.body as { fields: Record<string, unknown>[] };
  value(await k.install([{ ...LEARNINGS, body: { ...body, fields: body.fields.map((f) => (f.id === 'lesson' ? { ...f, min: 20 } : f)) } as never }]));
  value(k.update('learnings', old.id, { rank: 3 }, OWNER));
  assert.equal(said(k.update('learnings', old.id, { lesson: 'Still twelve' }, OWNER)), 'OUT_OF_BOUNDS at lesson');
  sql.close();
});

test('AND THE LINT REFUSES A BOUND THAT CANNOT BE KEPT, naming the field', () => {
  assert.equal(linted(probe({ id: 'n', type: 'int', min: 1, max: 9 })), null);
  assert.equal(linted(probe({ id: 'n', type: 'decimal', min: 0.5 })), null);
  assert.equal(linted(probe({ id: 'n', type: 'document', max: 524_288 })), null);

  assert.equal(linted(probe({ id: 'flag', type: 'bool', min: 1 })), 'DECLARATION_INVALID at flag', 'a bool has no size');
  assert.equal(linted(probe({ id: 'tags', type: 'list', of: 'text', max: 3 })), 'NOT_IN_THIS_BUILD at tags', 'a list is published and unbounded here');
  assert.equal(linted(probe({ id: 'site', type: 'url', max: 200 })), 'NOT_IN_THIS_BUILD at site');
  assert.equal(linted(probe({ id: 'n', type: 'text', min: 'ten' })), 'VALUE_MALFORMED at n');
  assert.equal(linted(probe({ id: 'n', type: 'text', min: -1 })), 'VALUE_MALFORMED at n');
  assert.equal(linted(probe({ id: 'n', type: 'int', max: 1.5 })), 'VALUE_MALFORMED at n');
  assert.equal(linted(probe({ id: 'n', type: 'int', min: 5, max: 2 })), 'OUT_OF_BOUNDS at n');
  assert.equal(linted(probe({ id: 'n', type: 'text', max: 20_000 })), 'OUT_OF_BOUNDS at n', 'a max lowers the ceiling and never raises it');
  assert.equal(linted(probe({ id: 'n', type: 'text', min: 3, default: 'x' })), 'OUT_OF_BOUNDS at n', 'a default outside its own bounds');
});

/* ── required_when ───────────────────────────────────────────────────────── */

test('REQUIRED_WHEN MAKES A FIELD REQUIRED WHILE ANOTHER HOLDS A VALUE, and names both', async () => {
  const { k, sql } = await record();

  const mcp = refusal(k.create('tools', { name: 'braindog', kind: 'mcp' }, OWNER));
  assert.equal(`${mcp.code} at ${mcp.at}`, 'REQUIRED_MISSING at transport');
  assert.match(mcp.fix, /needs transport when kind is mcp/);
  assert.equal(said(k.create('tools', { name: 'braindog', kind: 'mcp', transport: 'stdio' }, OWNER)), 'REQUIRED_MISSING at command');
  const tool = value<Entry>(k.create('tools', { name: 'braindog', kind: 'mcp', transport: 'stdio', command: 'node' }, OWNER));
  const cli = value<Entry>(k.create('tools', { name: 'gh', kind: 'cli' }, OWNER));

  /* Checked when either field is written, and not when neither is. */
  assert.equal(said(k.update('tools', cli.id, { kind: 'mcp' }, OWNER)), 'REQUIRED_MISSING at transport');
  assert.equal(said(k.update('tools', tool.id, { transport: 'http' }, OWNER)), 'REQUIRED_MISSING at endpoint');
  value(k.update('tools', tool.id, { name: 'braindog-mcp' }, OWNER));
  sql.close();
});

test('AND ITS LINT: one field, one value it can hold, and the operators it reads', () => {
  const when = (required_when: unknown, target: Record<string, unknown> = { id: 'kind', type: 'enum', values: ['mcp', 'cli'] }) =>
    linted(probe(target, { id: 'x', type: 'text', required_when }));

  assert.equal(when({ field: 'kind', is: 'mcp' }), null);
  assert.equal(when({ field: 'on', is: true }, { id: 'on', type: 'bool' }), null);
  assert.equal(when({ field: 'n', is: 3 }, { id: 'n', type: 'int' }), null);

  assert.equal(when({ field: 'nothing', is: 'mcp' }), 'FIELD_UNKNOWN at x.required_when');
  assert.equal(when({ field: 'x', is: 'mcp' }), 'DECLARATION_INVALID at x.required_when', 'a field required when it holds a value itself');
  assert.equal(when({ field: 'kind', is: 'api' }), 'ENUM_VALUE_UNKNOWN at x.required_when');
  assert.equal(when({ field: 'kind' }), 'DECLARATION_INVALID at x.required_when');
  assert.equal(when('kind is mcp'), 'DECLARATION_INVALID at x.required_when');
  assert.equal(when({ field: 'n', is: 'seven' }, { id: 'n', type: 'int' }), 'VALUE_MALFORMED at x.required_when');
  assert.equal(when({ field: 'at', is: 'x' }, { id: 'at', type: 'ref', to: 'probe' }), 'DECLARATION_INVALID at x.required_when');
  assert.equal(when({ field: 'kind', present: true }), 'NOT_IN_THIS_BUILD at x.required_when', 'present is published and unread');
  assert.equal(when({ field: 'kind', contains: 'mc' }), 'REQUIRED_WHEN_OP_UNSUPPORTED at x.required_when');
  assert.equal(when({ field: 'kind', is: 'mcp', unless: 'cli' }), 'DECLARATION_INVALID at x.required_when');
});

/* ── a transition's requires and by ─────────────────────────────────────── */

test('A MOVE NEEDS ITS REQUIRED FIELDS FILLED, and a move `by: decide` is only proposed', async () => {
  const { k, sql } = await record();
  const row = value<Entry>(k.create('learnings', { lesson: LESSON }, agent()));

  const bare = refusal(k.update('learnings', row.id, { state: 'superseded' }, OWNER));
  assert.equal(`${bare.code} at ${bare.at}`, 'REQUIRED_MISSING at why');
  assert.match(bare.fix, /LN1 leaves active only with why filled/);
  const gone = value<Entry>(k.update('learnings', row.id, { state: 'superseded', why: 'LN2 says the same thing, and says it better.' }, OWNER));
  assert.equal(gone.state, 'superseded');

  /* COMING BACK IS A DECISION, for the owner as much as for an agent. */
  const back = refusal(k.update('learnings', row.id, { state: 'active' }, OWNER));
  assert.equal(`${back.code} at ${back.at}`, 'FORBIDDEN at state');
  assert.match(back.fix, /LN1 leaves superseded only by an accepted proposal\. Propose the move/);
  assert.equal(said(k.update('learnings', row.id, { state: 'active' }, agent())), 'FORBIDDEN at state');
  assert.equal(k.get(row.id)?.version, gone.version, 'a refused move changed the row');

  /* A create is not a move, so a row may start in any state. */
  value(k.create('learnings', { lesson: LESSON, state: 'reverted' }, OWNER));
  sql.close();
});

test('AND A MOVE’S LINT: requires names fields of the register, and by is decide', () => {
  const moves = (transitions: unknown) =>
    linted(probe({ id: 'why', type: 'text' }, { id: 'state', type: 'enum', values: ['active', 'superseded'], transitions }));

  assert.equal(moves({ active: { to: ['superseded'], requires: ['why'] }, superseded: { to: ['active'], by: 'decide' } }), null);
  assert.equal(moves({ active: { to: ['superseded'], requires: ['reason'] } }), 'FIELD_UNKNOWN at state.transitions.active');
  assert.equal(moves({ active: { to: ['superseded'], requires: 'why' } }), 'DECLARATION_INVALID at state.transitions.active');
  assert.equal(moves({ active: { to: ['superseded'], requires: [] } }), 'DECLARATION_INVALID at state.transitions.active');
  const level = validateDeclaration(probe({ id: 'state', type: 'enum', values: ['a', 'b'], transitions: { b: { to: ['a'], by: 'owner' } } }));
  assert.equal(`${level?.code} at ${level?.at}`, 'ENUM_VALUE_UNKNOWN at state.transitions.b');
  assert.deepEqual(level?.allowed, ['decide']);
});

/* ── a field `by: decide` ────────────────────────────────────────────────── */

test('A FIELD `by: decide` IS SET AT CREATE AND CHANGED ONLY BY AN ACCEPTED PROPOSAL', async () => {
  const { k, sql } = await record();
  const skill = value<Entry>(k.create('skills', { name: 'review-pr', body: '# Review\nRead the diff first.' }, agent()));
  assert.equal(skill.fields.rev, 1, 'the default is what a row starts as');

  const text = refusal(k.update('skills', skill.id, { body: '# Review\nRead the tests first.' }, OWNER));
  assert.equal(`${text.code} at ${text.at}`, 'FORBIDDEN at body');
  assert.match(text.fix, /changes only by an accepted proposal\. Propose the change/);
  assert.equal(said(k.update('skills', skill.id, { rev: 2 }, agent())), 'FORBIDDEN at rev');
  assert.equal(said(k.update('skills', skill.id, { body: null }, OWNER)), 'FORBIDDEN at body', 'clearing is a change');

  /* RE-SENDING WHAT THE ROW HOLDS IS NO CHANGE, so a client writing the whole row back is not locked out. */
  const moved = value<Entry>(k.update('skills', skill.id, { trigger: 'Before a merge.', body: skill.fields.body, rev: 1 }, OWNER));
  assert.equal(moved.fields.body, skill.fields.body);

  const lint = validateDeclaration(probe({ id: 'body', type: 'document', by: 'owner' }));
  assert.equal(`${lint?.code} at ${lint?.at}`, 'ENUM_VALUE_UNKNOWN at body');
  assert.deepEqual(lint?.allowed, ['decide']);
  sql.close();
});

/* ── secret fields and the vault door ────────────────────────────────────── */

/** What a host's door hands the kernel: sealed bytes and what they open, never a value. */
const SEALED = {
  label: 'Stripe test',
  opens: 'the Bake test account',
  kind: 'api_token' as const,
  ciphertext: new Uint8Array([1, 2, 3, 4]),
  nonce: new Uint8Array([9, 9]),
  kdf: 'hkdf',
  wrapped_by: 'kek' as const,
  kek_id: 'kek_2f',
};

const INDEX = { label: 'Stripe test', opens: 'the Bake test account' };

test('A SECRET FIELD IS WRITTEN BY NO CALLER, however it asks', async () => {
  const { k, sql } = await record();
  const grant = value<{ id: string }>(k.bindGrant(SEALED, 'p_owner'));

  const person = refusal(k.create('credentials', { ...INDEX, value: grant.id }, OWNER));
  assert.equal(`${person.code} at ${person.at}`, 'IMMUTABLE_FIELD at value');
  assert.match(person.fix, /only the vault writes it/);
  assert.equal(said(k.create('credentials', { ...INDEX, value: grant.id }, agent())), 'IMMUTABLE_FIELD at value');

  const row = value<Entry>(k.create('credentials', INDEX, OWNER));
  assert.equal(said(k.update('credentials', row.id, { value: grant.id }, OWNER)), 'IMMUTABLE_FIELD at value');
  assert.equal(said(k.update('credentials', row.id, { value: null }, OWNER)), 'IMMUTABLE_FIELD at value');
  sql.close();
});

test('AND ITS LINT: nothing may put a value in a secret field, search it, or call a row by it', () => {
  assert.equal(linted(probe({ id: 'value', type: 'secret' })), null);
  assert.equal(linted(probe({ id: 'value', type: 'secret', required: true })), 'DECLARATION_INVALID at value');
  assert.equal(linted(probe({ id: 'value', type: 'secret', default: 'g_01J8ZQ6N3R4V5W6X7Y8Z9A0B1C' })), 'DECLARATION_INVALID at value');
  assert.equal(linted(probe({ id: 'value', type: 'secret', required_when: { field: 'what', is: 'x' } })), 'DECLARATION_INVALID at value');
  assert.equal(linted(probe({ id: 'values', type: 'list', of: 'secret' })), 'DECLARATION_INVALID at values');
  assert.equal(linted(probe({ id: 'value', type: 'secret', search: true })), 'SEARCH_FIELD_TYPE at value');
  assert.equal(linted(register('probe', [{ id: 'value', type: 'secret' }, { id: 'what', type: 'text' }])), 'DECLARATION_INVALID at title');
});

const kindsOf = (sql: NodeSql, target: string): string[] =>
  sql.all<{ actor: string; kind: string }>('SELECT actor, kind FROM event WHERE target = ? ORDER BY rowid', target).map((e) => `${e.actor} ${e.kind}`);

test('THE VAULT DOOR SEALS A KEY AND POINTS THE ROW AT IT, in one write signed by the run', async () => {
  const { k, sql } = await record();

  const out = value<{ entry: Entry; grant: { id: string; version: number; label: string } }>(
    k.depositGrant({ register: 'credentials', field: 'value', fields: INDEX, grant: SEALED }, agent()),
  );
  assert.equal(out.entry.fields.value, out.grant.id);
  assert.equal(out.grant.label, 'Stripe test');

  /* BOTH EVENTS ARE THE RUN'S, and the create event says a value is sealed without naming the grant. */
  assert.deepEqual(kindsOf(sql, `grant:${out.grant.id}`), ['S1 grant.add']);
  assert.deepEqual(kindsOf(sql, `entry:${out.entry.id}`), ['S1 create']);
  const made = sql.one<{ to_v: string }>("SELECT to_v FROM event WHERE target = ? AND kind = 'create'", `entry:${out.entry.id}`)!;
  assert.equal((JSON.parse(made.to_v) as Record<string, unknown>).value, '--redacted--');
  assert.ok(!made.to_v.includes(out.grant.id), 'the create event names the grant');

  /* A SECOND DEPOSIT TO THE ROW ROTATES ITS GRANT, keeping the id and moving the version. */
  const again = value<{ entry: Entry; grant: { id: string; version: number } }>(
    k.depositGrant({ register: 'credentials', ref: out.entry.id, field: 'value', grant: SEALED }, agent()),
  );
  assert.equal(again.grant.id, out.grant.id);
  assert.equal(again.grant.version, 2);
  assert.deepEqual(kindsOf(sql, `grant:${out.grant.id}`), ['S1 grant.add', 'S1 grant.rotate']);

  /* A REVOKED GRANT IS REPLACED rather than rotated, and the row points at the new one. */
  value(k.revokeGrant(out.grant.id, 'p_owner'));
  const fresh = value<{ entry: Entry; grant: { id: string } }>(
    k.depositGrant({ register: 'credentials', ref: out.entry.id, field: 'value', grant: SEALED }, OWNER),
  );
  assert.notEqual(fresh.grant.id, out.grant.id);
  assert.equal(fresh.entry.fields.value, fresh.grant.id);
  sql.close();
});

test('AND A REFUSED DEPOSIT SEALS NOTHING AND OPENS NO RUN', async () => {
  const { k, sql } = await record();
  const count = (table: string, where = '1 = 1') => sql.one<{ n: number }>(`SELECT count(*) AS n FROM ${table} WHERE ${where}`)!.n;

  assert.equal(
    said(k.depositGrant({ register: 'credentials', field: 'value', fields: { label: 'Stripe test' }, grant: SEALED }, agent())),
    'REQUIRED_MISSING at opens',
  );
  /* Refused by the grant itself, after the ladder would have opened a run: rolled back whole. */
  assert.equal(
    said(k.depositGrant({ register: 'credentials', field: 'value', fields: INDEX, grant: { ...SEALED, ciphertext: new Uint8Array() } }, agent())),
    'REQUIRED_MISSING at ciphertext',
  );
  assert.equal(count('grant'), 0, 'a refused deposit left a grant behind');
  assert.equal(count('entry', "register = 'session'"), 0, 'a refused deposit opened a run');
  assert.equal(count('entry', "register = 'credentials'"), 0);

  assert.equal(said(k.depositGrant({ register: 'credentials', field: 'label', fields: INDEX, grant: SEALED }, OWNER)), 'FIELD_UNKNOWN at label');
  assert.equal(refusal(k.depositGrant({ register: 'keys', field: 'value', grant: SEALED }, OWNER)).code, 'REGISTER_UNKNOWN');
  sql.close();
});

/* ── the credential-shaped text refusal ──────────────────────────────────── */

/** A body that says it is fake, long enough to fill any issuer's shape. */
const FAKE = 'FAKE0NOT0A0REAL0KEY0FOR0TESTS0ONLY0000';

/** Each issuer's shape, its prefix split in two so that no line holds it whole. */
const SHAPES: Record<string, string> = {
  'a private key': ['-----BEGIN ', 'PRIVATE KEY-----\n', FAKE].join(''),
  Stripe: ['sk', '_live_', FAKE].join(''),
  GitHub: ['gh', 'p_', FAKE].join(''),
  'a GitHub PAT': ['github', '_pat_', FAKE].join(''),
  Slack: ['xo', 'xb-', FAKE].join(''),
  AWS: ['AK', 'IA', 'FAKE0NOT0REAL000'].join(''),
  Google: ['AI', 'za', FAKE.slice(0, 35)].join(''),
  Anthropic: ['sk-', 'ant-', FAKE].join(''),
  'a JWT': ['ey', 'J', FAKE, '.', 'ey', 'J', FAKE, '.', FAKE].join(''),
  'a webhook': ['https://hooks.slack.com/', 'services/', FAKE].join(''),
  'a password in a URL': ['https://deploy:', 'FAKEPASSWORD', '@example.com/repo'].join(''),
};

/** A random token, made at run time from a fixed seed, so it is the same token on every run. */
function noise(n: number, seed: number): string {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let x = seed;
  let out = '';
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) % 2147483648;
    out += abc[Math.floor((x / 2147483648) * abc.length)];
  }
  return out;
}

test('TEXT THAT LOOKS LIKE A KEY IS REFUSED, from every caller and in every text a row holds', async () => {
  const { k, sql } = await record();

  for (const [issuer, key] of Object.entries(SHAPES)) {
    const out = refusal(k.create('learnings', { lesson: `The deploy uses ${key} for now.` }, agent()));
    assert.equal(`${out.code} at ${out.at}`, 'VALUE_MALFORMED at lesson', issuer);
    assert.equal(out.found, undefined, `${issuer}: the refusal carried the value`);
    assert.ok(!out.fix.includes(key), `${issuer}: the sentence carried the value`);
    assert.match(out.fix, /looks like a key, and a key never goes in a row\. Deposit it in the vault/);
  }

  const token = noise(48, 7);
  assert.equal(said(k.create('learnings', { lesson: `Use ${token} to reach the API.` }, OWNER)), 'VALUE_MALFORMED at lesson');
  assert.equal(said(k.create('learnings', { lesson: LESSON, notes: ['fine', `token ${token}`] }, OWNER)), 'VALUE_MALFORMED at notes[1]');
  assert.equal(said(k.create('learnings', { lesson: LESSON, body: `# Setup\n\n${SHAPES.GitHub}\n` }, OWNER)), 'VALUE_MALFORMED at body');
  const row = value<Entry>(k.create('learnings', { lesson: LESSON }, OWNER));
  assert.equal(said(k.update('learnings', row.id, { why: `Rotated to ${SHAPES.Stripe} on Monday, as agreed.` }, OWNER)), 'VALUE_MALFORMED at why');
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM entry WHERE register = 'learnings'")!.n, 1);
  sql.close();
});

test('AND WHAT IT LETS THROUGH: digests, ids, names, paths and links', () => {
  for (const text of [
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    '4464966a1b2c3d4e5f60718293a4b5c6d7e8f901',
    '01J8ZQ6N3R4V5W6X7Y8Z9A0B1C',
    'g_01J8ZQ6N3R4V5W6X7Y8Z9A0B1C',
    '3f2b8c1e-9d4a-4b7e-8f6a-2c1d0e9b8a7f',
    'ConfigurationManagerFactoryImpl2024Version',
    'How-To-Write-A-Good-Commit-Message-In-2026',
    '/Users/Sam/Projects/BrainDog2026/apps/web/src',
    'git@github.com:sam/braindog.git',
    'ssh://git@github.com:22/sam/braindog',
    `https://docs.example.com/document/d/${noise(44, 3)}/edit`,
    `${FAKE.slice(0, 20)} is under thirty-two characters`,
    LESSON,
  ])
    assert.equal(looksLikeCredential(text), false, text);

  /* A token in a URL's query is a key, where the same token in its path is a link. */
  assert.equal(looksLikeCredential(`https://api.example.com/v1/items?token=${noise(40, 5)}`), true);
  for (const key of Object.values(SHAPES)) assert.equal(looksLikeCredential(key), true, key.slice(0, 12));
});

test('A TEXT OF TENS OF MEGABYTES IN ONE RUN IS JUDGED, NOT THROWN, and a key after it is still found', () => {
  const long = 'x'.repeat(30_000_000);
  assert.equal(looksLikeCredential(long), false);
  assert.equal(looksLikeCredential(`${long} ${SHAPES.Stripe}`), true);
  assert.equal(looksLikeCredential(`${long} ${noise(48, 7)}`), true, 'a random run after the long one');
});

test('A TEXT WITH NO MAX IS STILL HELD TO 16 KB, a document to 512 KB and an address to 2 KB, from every writer', async () => {
  /* `02 §5`'s default caps. Before them a write token could put a field of any length in any row, and a thousand of
     them filled a record. Measured in bytes, as `max:` is, and in a list's elements as in a field. */
  const { k, sql } = await record();
  const why = 'Long enough to pass the min.';
  value(k.create('learnings', { lesson: LESSON, why: 'x'.repeat(16_384) }, OWNER));
  const long = refusal(k.create('learnings', { lesson: LESSON, why: 'x'.repeat(16_385) }, OWNER));
  assert.equal(`${long.code} at ${long.at}`, 'OUT_OF_BOUNDS at why');
  assert.match(long.fix, /is 16385 bytes, and a text takes at most 16384 bytes/);
  assert.equal(said(k.create('learnings', { lesson: LESSON, why: 'é'.repeat(8_193) }, OWNER)), 'OUT_OF_BOUNDS at why');
  assert.equal(said(k.create('learnings', { lesson: LESSON, notes: ['fine', 'x'.repeat(16_385)] }, OWNER)), 'OUT_OF_BOUNDS at notes[1]');

  value(k.create('learnings', { lesson: LESSON, why, body: 'x'.repeat(524_288) }, OWNER));
  assert.equal(said(k.create('learnings', { lesson: LESSON, why, body: 'x'.repeat(524_289) }, OWNER)), 'OUT_OF_BOUNDS at body');

  const row = value<Entry>(k.create('learnings', { lesson: LESSON, why }, OWNER));
  assert.equal(said(k.update('learnings', row.id, { why: 'x'.repeat(20_000) }, OWNER)), 'OUT_OF_BOUNDS at why');

  const site = `https://example.com/${'a'.repeat(2_048 - 20)}`;
  assert.equal(coerce({ id: 'site', type: 'url' }, site).ok, true);
  assert.equal(said(coerce({ id: 'site', type: 'url' }, `${site}a`)), 'OUT_OF_BOUNDS at site');
  const address = `${'a'.repeat(2_048 - 12)}@example.com`;
  assert.equal(coerce({ id: 'to', type: 'email' }, address).ok, true);
  assert.equal(said(coerce({ id: 'to', type: 'email' }, `a${address}`)), 'OUT_OF_BOUNDS at to');
  sql.close();
});
