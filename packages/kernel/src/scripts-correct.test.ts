/**
 * Scripts correct (SCR-1): what the kernel promises about a script, held by what it does.
 *
 * FIVE PROMISES, EACH ONE A PLACE A SCRIPT SAID SOMETHING THAT DID NOT HAPPEN. A header over the sandbox's ceilings
 * installed and was refused at every run; a script sending two keys could never be accepted, because accept looked the
 * two labels up as one; `runs.door` was checked and printed and started nothing; a retire took the field a list's
 * `steps` reads; and a bundle under one list's name replaced a page that names no list. Every name and value below is
 * invented.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel } from './index.ts';
import { SCRIPT_CEILINGS, SCRIPT_SOURCE_BYTES } from './script.ts';
import { fixedClock, openSqlite, type NodeSql } from '../test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 25, 12);

const ROWS: Declaration = {
  id: 'register.rows',
  kind: 'register',
  body: { id: 'rows', name: 'Rows', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

const script = (name: string, extra: Record<string, unknown> = {}): Declaration => ({
  id: `script.${name}`,
  kind: 'script',
  body: { script: name, runs: { every: '1h' }, egress: [], keys: [], reads: [], writes: ['rows'], source: 'export default async function run(ctx) {}', ...extra } as never,
});

async function record(decls: Declaration[] = [ROWS]): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const put = await k.install(decls);
  assert.ok(put.ok, JSON.stringify(put));
  return { k, sql };
}

const refusal = (r: unknown): { code: string; fix: string; at?: string } => {
  const x = r as { ok: boolean; refusal: { code: string; fix: string; at?: string } };
  assert.equal(x.ok, false, 'this was supposed to be refused');
  return x.refusal;
};

const accept = { decide: { option: 'accept' as const, reason: 'yes' } };

/* ── the ceilings, at install ─────────────────────────────────────────────── */

test('A LIMIT OVER ITS CEILING IS REFUSED AT INSTALL, in the words the sandbox refuses it at a run', async () => {
  const { k, sql } = await record();
  for (const [name, most] of Object.entries(SCRIPT_CEILINGS)) {
    const out = refusal(await k.install([script('greedy', { limits: { [name]: most + 1 } })]));
    assert.equal(out.code, 'OUT_OF_BOUNDS', name);
    assert.equal(out.at, `limits.${name}`);
    assert.equal(out.fix, `script.greedy's limits.${name} is ${most + 1}; the most a script may ask for is ${most}.`);
    const at = await k.install([script('greedy', { limits: { [name]: most } })]);
    assert.ok(at.ok, `${name} at its ceiling: ${JSON.stringify(at)}`);
  }
  sql.close();
});

test('A SOURCE OVER 64 KB IS REFUSED AT INSTALL, counted in UTF-8 bytes', async () => {
  const { k, sql } = await record();
  const body = 'export default async function run(ctx) {}\n';
  const out = refusal(await k.install([script('long', { source: body + '/'.repeat(SCRIPT_SOURCE_BYTES - body.length + 1) })]));
  assert.equal(out.code, 'OUT_OF_BOUNDS');
  assert.equal(out.at, 'source');
  const fits = await k.install([script('long', { source: body + '/'.repeat(SCRIPT_SOURCE_BYTES - body.length) })]);
  assert.ok(fits.ok, JSON.stringify(fits));
  sql.close();
});

/* ── two keys, each looked up alone ───────────────────────────────────────── */

const bind = (k: Kernel, label: string): void => {
  const put = k.bindGrant(
    { label, opens: 'api.example.com', kind: 'api_token', ciphertext: new Uint8Array([1, 2, 3]), nonce: new Uint8Array([4, 5, 6]), kdf: 'hkdf', wrapped_by: 'kek', kek_id: 'k_1' },
    'p_1',
  );
  assert.ok(put.ok, JSON.stringify(put));
};

test('A SCRIPT SENDING TWO KEYS IS ACCEPTED ONCE BOTH ARE IN THE VAULT, and refused naming the one that is not', async () => {
  const { k, sql } = await record();
  const both = script('two-keys', { egress: ['https://api.example.com'], keys: ['alpha', 'beta'] });
  const filed = k.propose({ question: 'Run it?', body_kind: 'change', body: { declaration_id: both.id, to: both } }, 'p_1');
  assert.ok(filed.ok, JSON.stringify(filed));
  bind(k, 'alpha');
  const missing = refusal(k.decide(filed.value.id, accept, 'p_1'));
  assert.equal(missing.code, 'REQUIRED_MISSING');
  assert.equal(missing.fix, 'Add the key called "beta" to the vault, then accept.');
  bind(k, 'beta');
  const out = k.decide(filed.value.id, accept, 'p_1');
  assert.ok(out.ok, JSON.stringify(out));
  sql.close();
});

/* ── a door starts its script ─────────────────────────────────────────────── */

const PAID: Declaration = {
  id: 'register.paid',
  kind: 'register',
  body: {
    id: 'paid',
    name: 'Paid',
    title: 'merchant',
    fields: [
      { id: 'merchant', type: 'text', required: true },
      { id: 'amount', type: 'money' },
    ],
  } as never,
};
const HOOK: Declaration = {
  id: 'ingest.hook',
  kind: 'ingest',
  body: {
    ingest: 'hook',
    channel: 'webhook',
    match: { all: [{ field: 'body', contains: 'paid' }] },
    extract: { merchant: { text: { between: ['You ', ' USD'] } }, amount: { money: { after: 'USD', currency: 'USD' } } },
    writes: { register: 'paid', confidence: 'exact' },
    dedupe: ['merchant'],
    on_conflict: 'skip',
  } as never,
};
const DOOR = script('on-hook', { runs: { door: 'hook' } });

const runs = (sql: NodeSql) =>
  sql
    .all<{ payload: string }>("SELECT payload FROM outbox WHERE kind = 'script.run' ORDER BY rowid")
    .map((r) => JSON.parse(r.payload) as { script: string; version: number; input: unknown; door?: string });

test('A VERIFIED ARRIVAL AT A SCRIPT\'S DOOR QUEUES ONE RUN, handed the body and headers, and its redelivery queues none', async () => {
  const { k, sql } = await record([ROWS, PAID, HOOK, DOOR]);
  const first = k.arrive({ channel: 'webhook', ingest: 'hook', body: 'You paid USD 12.00 today.', headers: { 'X-Sent-By': 'tests' }, sha256: 'a1', verified: true });
  assert.ok(first.ok, JSON.stringify(first));
  assert.deepEqual(runs(sql), [{ script: 'on-hook', version: 1, input: { body: 'You paid USD 12.00 today.', headers: { 'x-sent-by': 'tests' } }, door: 'hook' }]);

  /* THE SAME BYTES AGAIN ARE THE SAME ARRIVAL, which started its script the first time. */
  assert.ok(k.arrive({ channel: 'webhook', ingest: 'hook', body: 'You paid USD 12.00 today.', sha256: 'a1', verified: true }).ok);
  /* A BODY NO PATTERN READS STILL STARTS IT: the script is how that door is read. */
  assert.ok(k.arrive({ channel: 'webhook', ingest: 'hook', body: 'something else', sha256: 'a2', verified: true }).ok);
  assert.equal(runs(sql).length, 2);
  sql.close();
});

test('AN UNVERIFIED ARRIVAL STARTS NOTHING, and neither does an arrival at another door', async () => {
  const { k, sql } = await record([ROWS, PAID, HOOK, DOOR]);
  assert.ok(k.arrive({ channel: 'webhook', ingest: 'hook', body: 'You paid USD 3.00.', sha256: 'b1', verified: false }).ok);
  assert.ok(k.arrive({ channel: 'webhook', ingest: 'elsewhere', body: 'You paid USD 4.00.', sha256: 'b2', verified: true }).ok);
  assert.deepEqual(runs(sql), []);
  /* AND THE FORGED BYTES SENT AGAIN WITH THE RIGHT TOKEN ARE THE FIRST VERIFIED SIGHTING, so they start it once. */
  assert.ok(k.arrive({ channel: 'webhook', ingest: 'hook', body: 'You paid USD 3.00.', sha256: 'b1', verified: true }).ok);
  assert.equal(runs(sql).length, 1);
  sql.close();
});

/* ── a field a list's steps reads is not retired ──────────────────────────── */

const THINGS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: { id: 'things', name: 'Things', title: 'name', fields: [{ id: 'name', type: 'text' }] } as never,
};
const stepsFields = (doneRetired: boolean) => [
  { id: 'what', type: 'text' },
  { id: 'thing', type: 'ref', to: 'things' },
  { id: 'done', type: 'bool', ...(doneRetired ? { retired: true } : {}) },
  { id: 'note', type: 'text' },
];
const STEPS = (doneRetired = false): Declaration => ({
  id: 'register.steps',
  kind: 'register',
  body: { id: 'steps', name: 'Steps', title: 'what', steps: { of: 'thing', done: 'done' }, fields: stepsFields(doneRetired) } as never,
});

test('A RETIRE OF THE FIELD A LIST\'S steps READS IS REFUSED, by a retire and by a whole body alike', async () => {
  const { k, sql } = await record([THINGS, STEPS()]);
  const retire = refusal(k.propose({ question: 'q', body_kind: 'change', body: { declaration_id: 'register.steps', to: { retire: { fields: ['done'] } } } }, 'p_1'));
  assert.equal(retire.code, 'OUT_OF_BOUNDS');
  assert.equal(retire.at, 'body.to.retire.fields');
  assert.match(retire.fix, /^done is a field Steps's steps reads to tell which row each of its rows is a step of/);

  const whole = refusal(k.propose({ question: 'q', body_kind: 'change', body: { declaration_id: 'register.steps', to: STEPS(true) } }, 'p_1'));
  assert.equal(whole.code, 'OUT_OF_BOUNDS');
  assert.equal(whole.at, 'body.to');
  assert.match(whole.fix, /Change its steps in the same change, or keep done\.$/);

  /* A FIELD NOTHING READS BY IS STILL RETIRED AS EVER. */
  const note = k.propose({ question: 'q', body_kind: 'change', body: { declaration_id: 'register.steps', to: { retire: { fields: ['note'] } } } }, 'p_1');
  assert.ok(note.ok, JSON.stringify(note));
  sql.close();
});

/* ── a page that names no list is the owner's ─────────────────────────────── */

test('A BUNDLE UNDER ONE LIST\'S NAME THAT REPLACES A PAGE NAMING NO LIST IS REFUSED, since it is nobody\'s list to change', async () => {
  const prose: Declaration = {
    id: 'page.welcome',
    kind: 'page',
    body: { page: 'welcome', title: 'Welcome', blocks: [{ kind: 'note', tone: 'warn', heading: 'Hello', span: 12, body: 'Read me first.' }] } as never,
  };
  const { k, sql } = await record([ROWS, prose]);
  const rows: Declaration = {
    id: 'page.welcome',
    kind: 'page',
    body: {
      page: 'welcome',
      title: 'Welcome',
      blocks: [{ kind: 'table', heading: 'Rows', span: 12, source: 'register.rows', columns: [{ field: 'what' }], limit: 50, empty: 'None.' }],
    } as never,
  };
  const out = refusal(k.propose({ question: 'q', body_kind: 'change', body: { declaration_id: 'register.rows', to: { declarations: [ROWS, rows] } } }, 'p_1'));
  assert.equal(out.code, 'VALUE_MALFORMED');
  assert.match(out.fix, /page\.welcome in it replaces one that .*names no list at all/);
  /* PROPOSED UNDER ITS OWN NAME, it is asked of whoever reads the whole record, and is filed. */
  const own = k.propose({ question: 'q', body_kind: 'change', body: { declaration_id: 'page.welcome', to: rows } }, 'p_1');
  assert.ok(own.ok, JSON.stringify(own));
  sql.close();
});
