/**
 * `createSlash`, `status` and `configure`: the store, the meter and the one door a credential
 * could walk in through.
 *
 * THE LAST GROUP IS THE POINT OF THIS FILE. `46 §1` boundary 3 says the package never sees a
 * credential, including the customer's own model key, and the only place that claim could be
 * broken from outside is an owner typing a key where a grant id belongs. Everything else about
 * tier B is architecture; this is the part a person can get wrong.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { codeOf, refused } from '@braindog/ports';

import { ASK_CAP_DEFAULT, BACKGROUND_ASKS_MONTH, createSlash } from '../src/index.ts';
import { canned, fakeRecord, fixedClock, MEMBER, NOW, OWNER, openSqlite } from './double.ts';

const build = () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const inference = canned();
  const record = fakeRecord();
  return { sql, clock, inference, record, slash: createSlash({ sql, clock, inference, record }) };
};

test('createSlash makes the store under Slash\'s own names, one settings row and its version row, and says nothing on a second call', () => {
  const { sql, clock, inference, record } = build();
  const tables = sql.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name");
  assert.deepEqual(
    tables.map((t) => t.name),
    ['slash_call', 'slash_meta', 'slash_settings'],
  );
  assert.equal(sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM slash_settings')?.n, 1);
  assert.equal(sql.one<{ value: string }>("SELECT value FROM slash_meta WHERE key = 'version'")?.value, '2');

  createSlash({ sql, clock, inference, record });
  assert.equal(sql.one<{ n: number }>('SELECT COUNT(*) AS n FROM slash_settings')?.n, 1);
});

test('createSlash costs no network and no model call', () => {
  const { inference } = build();
  assert.equal(inference.seen.length, 0);
});

test('status is the included source on tier a, the routing table model, and a capped meter that resets on the first of next month', () => {
  const { slash } = build();
  assert.deepEqual(slash.status(), {
    source: 'included',
    tier: 'a',
    provider: null,
    model: 'glm-5.3-flash',
    asks: { used: 0, cap: 80, resets: '2026-12-01T00:00:00.000Z', capped: true },
  });
});

/* HIS OWN KEY: the source, the provider and the model he chose, and his asks listed with no
   cap beside them. A save of nothing reads what is saved, for Settings' form, and writes nothing. */
test('on his own key status says so, lists his asks uncapped, and a save of nothing reads the setup back unchanged', () => {
  const { sql, slash } = build();
  const saved = slash.configure({ source: 'key', provider: 'anthropic', base_url: 'https://api.example.test', model: ' claude-x ', grant_id: 'g_01JZ8QK3F7R2M9V4XN6TCB5HAE' }, OWNER);
  assert.ok(saved.ok, JSON.stringify(saved));
  sql.exec(
    `INSERT INTO slash_call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status)
     VALUES ('c_key', '2026-11-14T08:00:00.000Z', 'read', 'b', 'claude-x', 1, 1, 0, 1, 'ok')`,
  );
  assert.deepEqual(slash.status(), {
    source: 'key',
    tier: 'b',
    provider: 'anthropic',
    model: 'claude-x',
    asks: { used: 1, cap: 80, resets: '2026-12-01T00:00:00.000Z', capped: false },
  });
  const read = slash.configure({}, OWNER);
  assert.ok(read.ok);
  assert.deepEqual(read.value, saved.value);
});

test('ASK_CAP_DEFAULT AND BACKGROUND_ASKS_MONTH ARE THE NAMES THE CONTRACT GIVES, at 80 and 60', () => {
  assert.equal(ASK_CAP_DEFAULT, 80);
  assert.equal(BACKGROUND_ASKS_MONTH, 60);
});

test('the meter counts tier a asks in this month, reads and patterns alike, and never a propose', () => {
  const { sql, slash } = build();
  const put = (kind: string, tier: string, ts: string): void =>
    sql.exec(
      `INSERT INTO slash_call (id, ts, kind, tier, model, tokens_in, tokens_out, neurons, ms, status)
       VALUES (?, ?, ?, ?, 'glm-5.3-flash', 1, 1, 1, 1, 'ok')`,
      `${kind}${tier}${ts}`,
      ts,
      kind,
      tier,
    );
  /* A READ IS AN ASK since the read door was metered: before, `ask_cap` could never be reached through the only door. */
  put('read', 'a', '2026-11-02T00:00:00.000Z');
  put('read', 'a', '2026-11-13T00:00:00.000Z');
  put('pattern', 'a', '2026-11-05T00:00:00.000Z');
  /* A PROPOSE NO LONGER COUNTS on its own: one question is one ask, whatever passes it took,
     and the `read` its pass 1 or its drafting read already wrote is that ask. */
  put('propose', 'a', '2026-11-06T00:00:00.000Z');
  /* Not this month, not this tier: two rows that must not be counted. */
  put('read', 'a', '2026-10-30T00:00:00.000Z');
  put('read', 'b', '2026-11-05T00:00:00.000Z');
  assert.equal(slash.status().asks.used, 3);
});

test('configure is the owner and nobody else', () => {
  const { slash } = build();
  const out = slash.configure({ ask_cap: 10 }, MEMBER);
  assert.equal(codeOf(out), 'FORBIDDEN');
  assert.equal(slash.status().asks.cap, 80);
});

test('configure refuses a tier outside the three, and says which three', () => {
  const { slash } = build();
  const out = slash.configure({ tier: 'gpt' as 'a' }, OWNER);
  assert.equal(codeOf(out), 'ENUM_VALUE_UNKNOWN');
  assert.deepEqual(refused(out) ? out.refusal.allowed : [], ['a', 'b', 'byo']);
});

test('configure refuses an ask cap that is not a whole number of asks', () => {
  const { slash } = build();
  assert.equal(codeOf(slash.configure({ ask_cap: -1 }, OWNER)), 'VALUE_MALFORMED');
  assert.equal(codeOf(slash.configure({ ask_cap: 2.5 }, OWNER)), 'VALUE_MALFORMED');
  assert.equal(slash.configure({ ask_cap: 0 }, OWNER).ok, true);
});

test('tier b needs a grant, and a grant is an id the vault holds', () => {
  const { slash } = build();
  assert.equal(codeOf(slash.configure({ tier: 'b', model: 'claude-x' }, OWNER)), 'VALUE_MALFORMED');
});

/**
 * THE ONE THAT MATTERS. A key pasted into the grant box is a plaintext credential arriving in a
 * package that is supposed never to hold one, and it would then sit in `slash_settings.grant_id` until
 * somebody exported the database.
 */
test('a key pasted where a grant id belongs is refused, and nothing is stored', () => {
  const { sql, slash } = build();
  const key = 'sk-ant-api03-notarealkeybutshapedlikeone';
  const out = slash.configure({ tier: 'b', model: 'claude-x', grant_id: key }, OWNER);
  assert.equal(codeOf(out), 'VALUE_MALFORMED');
  assert.equal(refused(out) ? out.refusal.at : '', 'grant_id');
  const stored = JSON.stringify(sql.all('SELECT * FROM slash_settings'));
  assert.equal(stored.includes(key), false);
  assert.equal(stored.includes('sk-'), false);
});

test('tier b stores the grant id, the model, and no key', () => {
  const { sql, slash } = build();
  const out = slash.configure(
    { tier: 'b', model: 'claude-sonnet-4-6', grant_id: 'g_01JRQ8Z0X1Y2Z3A4B5C6D7E8F9' },
    OWNER,
  );
  assert.equal(out.ok, true);
  const row = sql.one<{ tier: string; model: string; grant_id: string }>('SELECT * FROM slash_settings');
  assert.equal(row?.tier, 'b');
  assert.equal(row?.model, 'claude-sonnet-4-6');
  assert.equal(row?.grant_id, 'g_01JRQ8Z0X1Y2Z3A4B5C6D7E8F9');
  assert.equal(slash.status().model, 'claude-sonnet-4-6');
});

test('going back to tier a drops the model, because the routing table decides there', () => {
  const { slash } = build();
  slash.configure({ tier: 'byo', model: 'llama-local' }, OWNER);
  assert.equal(slash.status().model, 'llama-local');
  const back = slash.configure({ tier: 'a' }, OWNER);
  assert.equal(back.ok && back.value.model, null);
  assert.equal(slash.status().model, 'glm-5.3-flash');
});

test('byo needs a model name, because nothing here knows what the endpoint answers with', () => {
  const { slash } = build();
  assert.equal(codeOf(slash.configure({ tier: 'byo' }, OWNER)), 'VALUE_MALFORMED');
});
