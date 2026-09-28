/**
 * Spark is called Slash now (`loop/DIRECTION.md` section 31), and a record written before the rename still holds the
 * old name in eight places (`loop/research-slash-rename.md` section 2.1): the actor on a model's events, `opened_by` on
 * its suggestions, its person's prefs and their two keys, the vault label of the included model's key, a parked run's
 * step kind, inside two kinds of declaration body, and inside an open change's `to` holding either kind of body.
 *
 * WHAT WAS MEASURED BEFORE THE MIGRATION. Every one of those values opened unchanged under the renamed build, and each
 * is read by the new name: the daily look's switch and its last day read as unset, the audit no longer called the old
 * actor an agent, the included model's key did not open, a parked `ask_spark` step was never resumed, and a rule
 * holding one failed its own lint. The two bodies are the ones SQL cannot fix: a declaration's checksum is SHA-256 of
 * its JCS body, so rewriting the body in a migration's text would leave a checksum that no longer verifies.
 *
 * THE OLD NAMES ARE WRITTEN OUT HERE AS LITERALS ON PURPOSE. This file stands in for a record written by the build
 * before the rename, and those bytes are what such a record holds.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { digest, jcs, openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { MIGRATIONS } from '../src/migrate.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';
import { testSigner } from './signer.ts';

const NOW = Date.UTC(2026, 8, 25, 9);
const AT = new Date(NOW).toISOString();
const SIGNER = testSigner();

/** The name the record held before, as the older build wrote it. */
const OLD = 'spark';

const OBLIGATIONS: Declaration = {
  id: 'register.obligations',
  kind: 'register',
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'note', type: 'text' },
    ],
  } as never,
};

/** A rule that asks the model, as the older build installed it. */
const RATE = {
  rule: 'rate',
  on: { written: { register: 'obligations', op: ['create'] } },
  once_per: ['entry'],
  steps: [
    { [`ask_${OLD}`]: { question: 'What rate applies to {{what}}?', about: ['what', 'note'], as: 'rate', shape: 'number' } },
    { notify: { say: 'Rate for {{what}}: {{vars.rate}}' } },
  ],
};

/** A digest whose prose the model writes, as the older build installed it. */
const WEEKLY = {
  digest: 'money-weekly',
  name: 'Money, weekly',
  schedule: { day: 'mon', at: '08:00' },
  channels: ['in-app'],
  prose: OLD,
  sections: [{ heading: 'Open', source: 'register.obligations', where: 'state is open', as: 'table', columns: [{ field: 'what' }] }],
};

/**
 * Two changes waiting in the queue, one installing a rule that asks the model and one a digest it writes, as the older
 * build filed them.
 *
 * SECTION 2.1 MISSED THIS ONE. A suggestion's body carries no checksum, so nothing stopped a migration renaming it, and
 * left as it was, pressing accept on either was refused: the renamed build reads `ask_spark` as a step it does not know
 * and `prose: spark` as a host nobody has.
 */
const QUEUED = [
  ['SG2', 'rule.rate-due', { id: 'rule.rate-due', kind: 'rule', body: { ...RATE, rule: 'rate-due' } }],
  ['SG3', 'digest.money-monthly', { id: 'digest.money-monthly', kind: 'digest', body: { ...WEEKLY, digest: 'money-monthly', name: 'Money, monthly' } }],
] as const;

/**
 * Every value section 2.1 names, written straight into the tables, the way the older build left them.
 *
 * THE TWO DECLARATIONS GO IN BY SQL, NOT BY `install`, because the renamed build refuses `ask_spark` at install: the row
 * has to be one an older build wrote, checksum and all.
 */
async function seed(sql: NodeSql): Promise<void> {
  for (const [id, kind, body] of [
    ['rule.rate', 'rule', RATE],
    ['digest.money-weekly', 'digest', WEEKLY],
  ] as const) {
    const text = jcs(body as never);
    sql.exec(
      'INSERT INTO declaration (id, version, kind, pack_id, body, checksum, retired, superseded_at, created_at) VALUES (?, 1, ?, NULL, ?, ?, 0, NULL, ?)',
      id,
      kind,
      text,
      await digest(text),
      AT,
    );
  }
  sql.exec("INSERT INTO event (id, ts, actor, kind, target, target_kind) VALUES ('ev_old', ?, ?, 'suggest', 'suggestion:SG1', 'suggestion')", AT, OLD);
  sql.exec(
    "INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at) VALUES ('SG1', 'options', '{\"options\":[]}', 'open', ?, ?)",
    OLD,
    AT,
  );
  for (const [key, value] of [
    [`${OLD}.daily`, 'false'],
    [`${OLD}.last`, '"2026-09-24"'],
    ['next.done', '["arrange:rent"]'],
  ] as const)
    sql.exec('INSERT INTO pref (person_id, key, value, updated_at) VALUES (?, ?, ?, ?)', OLD, key, value, AT);
  sql.exec(
    'INSERT INTO grant (id, label, opens, kind, version, ciphertext, nonce, kdf, wrapped_by, kek_id, bytes, hint, created_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)',
    'g_1',
    OLD,
    'api.cloudflare.com',
    'api_token',
    new Uint8Array([7, 8, 0, 255]),
    new Uint8Array([9, 10, 0, 255]),
    'hkdf',
    'kek',
    'kek_2f',
    40,
    'the included model',
    AT,
  );
  sql.exec(
    "INSERT INTO automation_run (id, rule, version, trigger, state, step, vars, depth, actor, started_at) VALUES ('run_1', 'rule.rate', 1, 'entry:x', 'waiting', 0, '{}', 0, 'rule:rate', ?)",
    AT,
  );
  sql.exec("INSERT INTO automation_step (run, n, kind, state, at) VALUES ('run_1', 0, ?, 'waiting', ?)", `ask_${OLD}`, AT);
  for (const [id, declaration_id, to] of QUEUED)
    sql.exec(
      "INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at) VALUES (?, 'change', ?, 'open', 'p_1', ?)",
      id,
      JSON.stringify({ declaration_id, to, from_version: 0 }),
      AT,
    );
}

/** Each queued change accepted, and what it installs installed, as the record does on the owner's press. */
async function acceptQueued(k: Kernel): Promise<void> {
  for (const [id, declaration_id] of QUEUED) {
    const out = k.decide(id, { decide: { option: 'accept', reason: 'yes' } }, 'p_owner');
    assert.ok(out.ok, `${id}: ${JSON.stringify(out)}`);
    const put = await k.install([out.value.install as Declaration]);
    assert.ok(put.ok, `${declaration_id}: ${JSON.stringify(put)}`);
  }
}

/**
 * Every column of every table that holds the old name, as `table.column`.
 *
 * A SCAN AND NOT A LIST OF THE SEVEN, so a place section 2.1 missed shows up here rather than in production. The index's
 * shadow tables are skipped because they mirror `entry`, and `event.from_v` and `event.to_v` because an old body copied
 * into the log is history, which a rename does not rewrite.
 */
function holdingOld(sql: NodeSql): string[] {
  const out: string[] = [];
  for (const { name } of sql.all<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'entry_fts%' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  ))
    for (const { name: column } of sql.all<{ name: string }>('SELECT name FROM pragma_table_info(?)', name)) {
      if (name === 'event' && (column === 'from_v' || column === 'to_v')) continue;
      const n = sql.one<{ n: number }>(`SELECT count(*) AS n FROM "${name}" WHERE CAST("${column}" AS TEXT) LIKE ?`, `%${OLD}%`)?.n ?? 0;
      if (n > 0) out.push(`${name}.${column}`);
    }
  return out.sort();
}

/** Each active declaration whose stored checksum is not SHA-256 of its body, by id. */
async function unverified(sql: NodeSql): Promise<string[]> {
  const out: string[] = [];
  for (const row of sql.all<{ id: string; body: string; checksum: string }>('SELECT id, body, checksum FROM declaration WHERE superseded_at IS NULL'))
    if ((await digest(row.body)) !== row.checksum) out.push(row.id);
  return out;
}

const bodyOf = (sql: NodeSql, id: string): Record<string, unknown> =>
  JSON.parse(sql.one<{ body: string }>('SELECT body FROM declaration WHERE id = ? AND superseded_at IS NULL', id)!.body) as Record<string, unknown>;

async function older(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW), { sign: SIGNER, answersSlash: true });
  assert.ok((await k.install([OBLIGATIONS])).ok);
  await seed(sql);
  assert.deepEqual(
    holdingOld(sql),
    ['automation_step.kind', 'declaration.body', 'event.actor', 'grant.label', 'pref.key', 'pref.person_id', 'suggestion.body', 'suggestion.opened_by'],
    'the seed does not hold every value section 2.1 names, so the rest of this file proves less than it says',
  );
  return { k, sql };
}

test('MIGRATION 16 IS THE RENAME, and it is registered where the runner reads it', () => {
  assert.deepEqual(
    MIGRATIONS.map((m) => [m.version, m.slug]).find(([version]) => version === 16),
    [16, 'slash'],
  );
});

test('A RECORD OPENED UNDER THE RENAMED BUILD HOLDS THE OLD NAME NOWHERE, and every checksum still verifies', async () => {
  const { sql } = await older();
  /* THE LEDGER IS REWOUND AND THE TABLES LEFT, which is how a test stands in for an older record (0011's note): the
     next open applies every migration above the older build's last one, over the rows that build wrote. */
  sql.exec('DELETE FROM migration WHERE version > 15');
  /* AND THE TWO COLUMNS MIGRATIONS 19 AND 20 ADD, which `ADD COLUMN` cannot re-apply over themselves: a rewind that
     left them would be a record no older build ever wrote. */
  sql.exec('ALTER TABLE member DROP COLUMN row_where');
  sql.exec('ALTER TABLE record DROP COLUMN quiet');
  const k = await openRecord(sql, fixedClock(NOW), { sign: SIGNER, answersSlash: true });

  assert.deepEqual(holdingOld(sql), [], 'the old name survived the open');
  assert.deepEqual(await unverified(sql), [], 'a declaration body was rewritten and its checksum was not');

  const prefs = Object.fromEntries(sql.all<{ person_id: string; key: string }>('SELECT person_id, key FROM pref ORDER BY key').map((r) => [r.key, r.person_id]));
  assert.deepEqual(prefs, { 'next.done': 'slash', 'slash.daily': 'slash', 'slash.last': 'slash' });
  assert.equal(sql.one<{ actor: string }>("SELECT actor FROM event WHERE id = 'ev_old'")?.actor, 'slash');
  assert.equal(sql.one<{ label: string }>("SELECT label FROM grant WHERE id = 'g_1'")?.label, 'slash');
  assert.equal(sql.one<{ kind: string }>("SELECT kind FROM automation_step WHERE run = 'run_1'")?.kind, 'ask_slash');
  assert.equal(bodyOf(sql, 'digest.money-weekly').prose, 'slash');
  assert.ok('ask_slash' in (bodyOf(sql, 'rule.rate').steps as Record<string, unknown>[])[0]!, 'the rule still asks by the old verb');

  /* THE RULE STILL LINTS: the body the migration wrote is one this build installs as it stands. */
  const again = await k.install([{ id: 'rule.rate', kind: 'rule', body: bodyOf(sql, 'rule.rate') as never }]);
  assert.ok(again.ok, again.ok ? '' : JSON.stringify(again));

  /* AND A CHANGE WAITING IN THE QUEUE IS ACCEPTED, which is where a body the rename missed would be refused. */
  await acceptQueued(k);
  assert.equal(bodyOf(sql, 'digest.money-monthly').prose, 'slash');
  sql.close();
});

test('AND A .brain FILE WRITTEN BEFORE THE RENAME LANDS RENAMED, because an import brings the old rows past the ledger', async () => {
  /* THE TARGET'S LEDGER ALREADY SAYS THE RENAME RAN, so the migration never sees these rows: the import has to rename
     what it carries, as it seats `register.session` for a file older than migration 2. */
  const source = await older();
  const lines = await source.k.export();
  assert.ok(lines.ok, JSON.stringify(lines));

  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW), { sign: SIGNER, answersSlash: true });
  const landed = await k.import(lines.value as string[]);
  assert.ok(landed.ok, JSON.stringify(landed));

  /* `pref` and `automation_step` are `local` and never travel, so a file brings the other five. */
  assert.deepEqual(holdingOld(sql), [], 'the old name arrived in the imported record');
  assert.deepEqual(await unverified(sql), [], 'an imported body was rewritten and its checksum was not');
  assert.equal(bodyOf(sql, 'digest.money-weekly').prose, 'slash');
  await acceptQueued(k);
  source.sql.close();
  sql.close();
});
