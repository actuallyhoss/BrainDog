/**
 * Which `spark` grant the host's own Spark key is opened from, when the vault holds more than one.
 *
 * SPK-3, FOUND ON THE WAY BY AUDIT FORTY-NINE. The vault admits two live grants under one label (`bindGrant` checks no
 * label for uniqueness), and two choosers read them two ways. A scheduled action's `grant:` opens the NEWEST live entry
 * under its label (`keyNamed`, `ORDER BY created_at DESC, id DESC`), and the kernel's `opensOf` says what that entry opens.
 * The Spark key path took `grants().find(...)`, the first live row in `listGrants` order, which is `ORDER BY label` and
 * nothing else, so within one label it was SQLite's order: the oldest. An owner who put a new key under `spark` and had
 * not revoked the old one had the included model answer on the old key while every action named `spark` used the new.
 * And the grant's `kind` was never read, so a password or a note labelled `spark` went out as a bearer.
 *
 * A REAL KERNEL AND ITS REAL VAULT, because the order the rows come back in is the finding, and a fixture array would have
 * been in whatever order its author typed.
 *
 * RED BEFORE THE REPAIR, MEASURED ON 23 SEPTEMBER: four tests, two pass, two fail. Case 1 opened the older grant where
 * `opensOf('spark')` named the newer; case 2 opened a `note` and sent it as `Bearer fake-key-of-...`. Case 3 passed
 * before the repair only because oldest-first happened to land on the token, and it is here for the half-repair: with
 * the newest-first order in and the kind rule taken out, it failed, opening the `password`, and case 2 failed with it.
 * Case 4, a revoked newest grant, passed before and after, which is its job.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixOf } from '@braindog/ports';
import { openRecord, type GrantRow, type Kernel } from '@braindog/kernel';

import { sparkFromEnv, sparkInferenceOf } from '../src/spark.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.parse('2026-09-23T12:00:00.000Z');
const DAY = 86_400_000;
const URL_ = 'https://gateway.example.test/v1/chat/completions';
const CALL = { model: 'glm-5.3-flash', messages: [], maxTokens: 10, jsonSchema: {} };
const CONFIG = sparkFromEnv({ SPARK_ENDPOINT: URL_ }, { operatorKey: false });
const b = (n: number) => new Uint8Array([n, n + 1, 2, 3]);

async function vault() {
  const sql = openSqlite();
  const clock = fixedClock(NOW - 30 * DAY);
  const k: Kernel = await openRecord(sql, clock);
  assert.ok(
    k.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_1', email: 'ada@example.test', name: 'Ada' } }).ok,
  );
  /** One grant labelled `spark`, bound a day after the last. */
  const bind = (kind: GrantRow['kind'], opens: string): string => {
    clock.advance(DAY);
    const made = k.bindGrant({ label: 'spark', opens, kind, ciphertext: b(1), nonce: b(9), kdf: 'hkdf', wrapped_by: 'kek', kek_id: 'kek_2f' }, 'p_1');
    assert.ok(made.ok, fixOf(made));
    return (made.value as GrantRow).id;
  };
  const opened: string[] = [];
  const sent: (string | null)[] = [];
  const inference = sparkInferenceOf(CONFIG, {
    grants: () => k.grants(),
    openKey: async (g) => (opened.push(g.id), `fake-key-of-${g.id}`),
    send: async (_url, init) => {
      sent.push(new Headers(init.headers).get('authorization'));
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"answer":4}' } }] }), { status: 200 });
    },
  });
  assert.ok(inference, 'a host with an endpoint and a key store built no model');
  return { k, sql, bind, opened, sent, inference, close: () => sql.close() };
}

test('(1) TWO LIVE spark GRANTS: THE SPARK KEY IS THE NEWEST, the one a scheduled action named `spark` opens', async () => {
  const v = await vault();
  try {
    const older = v.bind('api_token', 'old.example.test');
    const newer = v.bind('api_token', 'new.example.test');
    assert.notEqual(older, newer);
    /* THE ACTIONS' CHOOSER, read through the kernel: what the entry `keyNamed` picks says it opens. */
    assert.equal(v.k.opensOf('spark'), 'new.example.test');

    await v.inference.complete(CALL);

    assert.deepEqual(v.opened, [newer], `the Spark key path opened ${v.opened.join(', ')}, and an action opens ${newer}`);
    assert.deepEqual(v.sent, [`Bearer fake-key-of-${newer}`]);
  } finally {
    v.close();
  }
});

test('(2) A spark GRANT THAT IS NOT AN API TOKEN IS NEVER OPENED AS ONE: a note alone under the label is no key at all', async () => {
  const v = await vault();
  try {
    v.bind('note', 'the gateway, written down');

    await v.inference.complete(CALL);

    assert.deepEqual(v.opened, [], 'a note was opened as the Spark key');
    assert.deepEqual(v.sent, [null], 'a note went out as a bearer');
  } finally {
    v.close();
  }
});

test('(3) A PASSWORD BOUND AFTER THE TOKEN IS THE NEWEST ROW AND NOT THE KEY: the newest of the right kind is', async () => {
  const v = await vault();
  try {
    const token = v.bind('api_token', 'gateway.example.test');
    v.bind('password', 'gateway.example.test');

    await v.inference.complete(CALL);

    assert.deepEqual(v.opened, [token]);
    assert.deepEqual(v.sent, [`Bearer fake-key-of-${token}`]);
  } finally {
    v.close();
  }
});

test('(4) A REVOKED NEWEST GRANT IS PASSED OVER FOR THE LIVE ONE BELOW IT', async () => {
  const v = await vault();
  try {
    const older = v.bind('api_token', 'old.example.test');
    const newer = v.bind('api_token', 'new.example.test');
    assert.ok(v.k.revokeGrant(newer, 'p_1').ok);

    await v.inference.complete(CALL);

    assert.deepEqual(v.opened, [older]);
  } finally {
    v.close();
  }
});
