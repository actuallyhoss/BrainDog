/**
 * A key inside its own scope, and the approval saying who opens it (SHL-C05, jobs 2 and 3).
 *
 * AT DECLARATION an action in project P may name a key kept for P or for every project, and no other
 * (`keyOutOfScope`). The project a key is kept for is read from the row holding its keychain entry (`keyScopeOf`). The
 * approval list ends with who else can open a key, and no longer says keys reach everything. A key whose entry names
 * no host is pinned by its first approval (`pinHost`), which the line says. Nothing here reads a key's value: the
 * sealed bytes are four made-up numbers, and every assertion is about a label, an `opens` or a project.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  KEYS_REACH_ALL,
  KEY_OPENED_UNATTENDED,
  KEY_OPENED_UNATTENDED_PASSPHRASE,
  approvalLines,
  egressOf,
  keyNamed,
  keyOutOfScope,
  keyScopeOf,
} from '../src/actions.ts';
import { pinHost } from '../src/keychain.ts';
import { openRecord, type GrantRow, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';
import { testSigner } from './signer.ts';

const NOW = Date.UTC(2026, 9, 15, 12);
const NAMES: Record<string, string> = { r_lantern: 'Lanternly', r_orchard: 'Orchard' };
const nameOf = (p: string): string | null => NAMES[p] ?? null;

/** A key kept for each place: Lanternly's, Orchard's, and one for every project. `null` is every project. */
const KEPT: Record<string, readonly string[] | null> = { 'lantern key': ['r_lantern'], 'orchard key': ['r_orchard'], 'shared key': null };
const scopeOf = (label: string): readonly string[] | null | undefined => KEPT[label];

const POLL = (over: Record<string, unknown> = {}) => ({
  ingest: 'orders',
  channel: 'poll',
  every: '1h',
  url: 'https://oxbow.example/v1/orders',
  grant: 'lantern key',
  project: 'r_lantern',
  ...over,
});

test('A PROJECT KEY IN ITS OWN PROJECT IS FINE, and in another project or for every project it is refused with the fix', () => {
  const own = egressOf(POLL(), nameOf, undefined, scopeOf)!;
  assert.equal(keyOutOfScope(own, scopeOf, nameOf), null);

  const other = egressOf(POLL({ grant: 'orchard key' }), nameOf, undefined, scopeOf)!;
  const refused = keyOutOfScope(other, scopeOf, nameOf);
  assert.equal(refused?.code, 'FORBIDDEN');
  assert.equal(refused?.at, 'grant');
  assert.equal(
    refused?.fix,
    'orders runs for the project Lanternly and names the key "orchard key", which is kept for the project Orchard only. Name a key kept for the project Lanternly or for every project, or move the key.',
  );

  /* AN ACTION FOR EVERY PROJECT MAY NOT CARRY ONE PROJECT'S KEY, which is offered only there. */
  const everywhere = egressOf(POLL({ project: undefined }), nameOf, undefined, scopeOf)!;
  assert.match(keyOutOfScope(everywhere, scopeOf, nameOf)?.fix ?? '', /^orders runs for every project and names the key "lantern key", which is kept for the project Lanternly only\. Name a key kept for every project/);

  /* NAMES, NEVER IDS: a project the caller cannot name is "another project", never its row id. */
  const unnamed = keyOutOfScope(other, scopeOf);
  assert.doesNotMatch(unnamed?.fix ?? '', /r_orchard|r_lantern/);
  assert.match(unnamed?.fix ?? '', /kept for another project only/);
});

test('A GLOBAL KEY IN A PROJECT ACTION IS ALLOWED, on its own approval line', () => {
  const e = egressOf(POLL({ grant: 'shared key' }), nameOf, undefined, scopeOf)!;
  assert.equal(keyOutOfScope(e, scopeOf, nameOf), null);
  assert.equal(e.key_line, 'orders runs for the project Lanternly and sends the key "shared key", which is kept for every project.');
  /* A KEY NO ROW PLACES counts as every project's for the check, and its line says only what it always did. */
  const unplaced = egressOf(POLL({ grant: 'loose key' }), nameOf, undefined, scopeOf)!;
  assert.equal(keyOutOfScope(unplaced, scopeOf, nameOf), null);
  assert.equal(unplaced.key_line, 'orders runs for the project Lanternly and sends the key "loose key".');
  /* AND A KEYLESS ACTION IS NEVER ASKED. */
  assert.equal(keyOutOfScope(egressOf(POLL({ grant: undefined }), nameOf)!, scopeOf, nameOf), null);
});

test('THE APPROVAL ENDS WITH WHO ELSE OPENS THE KEY, and never says keys reach everything', () => {
  const keyed = egressOf(POLL(), nameOf, undefined, scopeOf)!;
  const lines = approvalLines([keyed]);
  assert.equal(lines.at(-1), KEY_OPENED_UNATTENDED);
  assert.equal(KEY_OPENED_UNATTENDED, 'A scheduled action opens this key with nobody present, so the server that runs it can open it too.');
  assert.ok(!lines.includes(KEYS_REACH_ALL), 'the old sentence is still said');
  assert.equal(approvalLines([keyed], { passphrase: true }).at(-1), KEY_OPENED_UNATTENDED_PASSPHRASE);
  assert.match(KEY_OPENED_UNATTENDED_PASSPHRASE, /your keychain password does not cover it\.$/);

  /* ONCE, however many lines send a key, and not at all when none does. */
  const twice = approvalLines([keyed, egressOf(POLL({ ingest: 'stock' }), nameOf, undefined, scopeOf)!]);
  assert.equal(twice.filter((l) => l === KEY_OPENED_UNATTENDED).length, 1);
  const keyless = approvalLines([egressOf(POLL({ grant: undefined, project: undefined }))!]);
  assert.deepEqual(keyless, ['CALLS OUT oxbow.example · every 1h · grant "none"']);
});

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW), { sign: testSigner() });
  const b = (n: number) => new Uint8Array([n, n + 1, n + 2, 255]);
  const made = k.createRecord({
    id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD',
    slug: 'the-bakery',
    name: 'The Bakery',
    tz: 'UTC',
    locale: 'en',
    owner: { id: 'p_1', name: 'Sam' },
    keys: { record: { wrapped: b(90), nonce: b(80), kek_id: 'kek_2f' }, connector: { wrapped: b(70), nonce: b(60), kek_id: 'kek_2f' } },
  });
  assert.ok(made.ok);
  return { k, sql };
}

const bind = (k: Kernel, label: string, opens: string): GrantRow => {
  const b = (n: number) => new Uint8Array([n, n + 1, n + 2, 255]);
  const out = k.bindGrant({ label, opens, kind: 'api_token', ciphertext: b(10), nonce: b(20), kdf: 'hkdf', wrapped_by: 'kek', kek_id: 'kek_2f' }, 'p_1');
  assert.ok(out.ok, out.ok ? '' : 'refusal' in out ? out.refusal.fix : 'a conflict');
  return out.value;
};

test('THE PROJECT A KEY IS KEPT FOR IS READ FROM THE ROW THAT HOLDS ITS ENTRY', async () => {
  const { k, sql } = await record();
  const lantern = bind(k, 'lantern key', 'oxbow.example');
  const shared = bind(k, 'shared key', 'oxbow.example');
  bind(k, 'loose key', 'oxbow.example');
  const row = (id: string, fields: Record<string, unknown>) =>
    sql.exec(
      "INSERT INTO entry (id, register, seq, fields, state, version, created_at, updated_at) VALUES (?, 'credentials', NULL, ?, NULL, 1, ?, ?)",
      id,
      JSON.stringify(fields),
      new Date(NOW).toISOString(),
      new Date(NOW).toISOString(),
    );
  row('e_1', { name: 'Lanternly key', secret: lantern.id, project: 'r_lantern' });
  row('e_2', { name: 'Shared key', secret: shared.id });
  const holders = new Map([['credentials', 'project']]);
  assert.deepEqual(keyScopeOf(sql, 'lantern key', holders), ['r_lantern']);
  assert.equal(keyScopeOf(sql, 'shared key', holders), null);
  assert.equal(keyScopeOf(sql, 'loose key', holders), undefined);
  assert.equal(keyScopeOf(sql, 'no such key', holders), undefined);
  assert.equal(keyScopeOf(sql, 'lantern key', new Map()), undefined);
  sql.close();
});

test('A KEY WITH NO HOST IS PINNED BY ITS FIRST APPROVAL, and the line says so', async () => {
  const { k, sql } = await record();
  const loose = bind(k, 'oxbow key', 'the Oxbow test account');
  const opensOf = (label: string) => keyNamed(sql, label)?.opens ?? null;

  const e = egressOf(POLL({ grant: 'oxbow key', project: undefined }), nameOf, opensOf)!;
  assert.equal(e.key_line, 'This key will be sent to oxbow.example only from now on.');
  assert.deepEqual(approvalLines([e]).slice(1), ['This key will be sent to oxbow.example only from now on.', KEY_OPENED_UNATTENDED]);

  const pinned = pinHost(sql, 'oxbow key', 'oxbow.example', NOW);
  assert.deepEqual(pinned.ok ? pinned.value : null, { id: loose.id, host: 'oxbow.example', pinned: true });
  /* THE NEXT REQUEST CARRIES IT, which is what the host holds the key to. */
  assert.equal(keyNamed(sql, 'oxbow key')?.opens, 'oxbow.example');
  assert.equal(egressOf(POLL({ grant: 'oxbow key', project: undefined }), nameOf, opensOf)?.key_line, null);
  /* THE EVENT SAYS THE ID AND THE KIND, never the label or what it opens. */
  const ev = sql.one<{ kind: string; note: string }>("SELECT kind, note FROM event WHERE target = ? ORDER BY rowid DESC LIMIT 1", `grant:${loose.id}`);
  assert.deepEqual({ ...ev }, { kind: 'grant.bind', note: `${loose.id} api_token` });

  /* A PIN NEVER MOVES A KEY: one that names a host already is left as it is. */
  const moved = pinHost(sql, 'oxbow key', 'collector.example', NOW);
  assert.deepEqual(moved.ok ? moved.value : null, { id: loose.id, host: 'oxbow.example', pinned: false });
  assert.equal(keyNamed(sql, 'oxbow key')?.opens, 'oxbow.example');
  /* ONE WORD NAMES NO HOST, so "Stripe" is pinned like prose rather than read as the host `stripe`. */
  bind(k, 'stripe key', 'Stripe');
  const word = egressOf(POLL({ grant: 'stripe key', project: undefined }), nameOf, opensOf)!;
  assert.equal(word.key_line, 'This key will be sent to oxbow.example only from now on.');
  assert.equal(pinHost(sql, 'stripe key', 'oxbow.example', NOW).ok && keyNamed(sql, 'stripe key')?.opens, 'oxbow.example');
  assert.equal(pinHost(sql, 'nobody', 'oxbow.example', NOW).ok, false);
  assert.equal(pinHost(sql, 'oxbow key', '', NOW).ok, false);
  sql.close();
});
