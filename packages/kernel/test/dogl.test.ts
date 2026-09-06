/**
 * The file a customer can take with them.
 *
 * The properties asserted here are the ones that make the promise real rather than marketing:
 *
 *   - two exports of an unchanged record are IDENTICAL, so "has anything changed since my last copy"
 *     is `diff` rather than a tool;
 *   - a table's manifest hash is checkable with `sed` and `sha256sum` and nothing else;
 *   - export, import into an empty record, export again — and the second file equals the first, which
 *     is the only evidence that the file is complete.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { openRecord, TRAVELS, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);

const OBLIGATIONS: Declaration = {
  id: 'register.obligations',
  kind: 'register',
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    state: 'state',
    fields: [
      { id: 'what', type: 'text', required: true, search: true },
      { id: 'party', type: 'text', search: true },
      { id: 'amount', type: 'money', index: true },
      { id: 'due', type: 'day', index: true, remind: ['-7d'] },
      { id: 'state', type: 'enum', values: ['open', 'paid'] },
    ],
  } as never,
};

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([OBLIGATIONS])).ok);
  return { k, sql };
}

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

async function filled() {
  const { k, sql } = await record();
  value(k.create('obligations', { what: 'Invoice 41 — brand', party: 'Halden', amount: { amount: 48_000, currency: 'GBP' }, due: '2026-08-01', state: 'open' }, { actor: 'p_1', note: 'From the PDF' }));
  value(
    k.create(
      'obligations',
      { what: 'Retainer, August', party: 'Pell & Vine', amount: { amount: 24_000, currency: 'GBP' }, due: '2026-12-01', state: 'paid' },
      { actor: 'p_2' },
    ),
  );
  value(k.create('obligations', { what: 'Gone', party: 'Nobody' }, { actor: 'p_1' }));
  value(k.update('obligations', 'obligations#3', { deleted_at: '2026-09-05' }, { actor: 'p_1' }));
  value(k.update('obligations', 'obligations#1', { state: 'paid' }, { actor: 'rule:settle', note: 'Cleared on the statement' }));
  everythingElse(sql);
  return { k, sql };
}

/**
 * One row in every OTHER travelling table.
 *
 * Without this the round-trip proved almost nothing: the fixture filled `entry`, `event`,
 * `declaration` and `counter`, so an export that silently dropped grants, members, metric points,
 * predictions or the vault keys would have passed every assertion in this file — and a customer
 * would have found out by opening their copy and discovering their credentials index was gone.
 *
 * These are written with SQL rather than through the kernel because most of them have no kernel
 * write path yet, and the question this file asks is about the FORMAT, not about how a row got
 * there.
 */
function everythingElse(sql: NodeSql): void {
  const b = (n: number) => new Uint8Array([n, n + 1, 0, 255]);
  sql.exec(
    "INSERT INTO pack (id, version, source, source_ref, manifest, installed_at, checksum) VALUES ('freelance', '1.2.0', 'kennel', NULL, '{\"name\":\"Freelance\"}', '2026-01-04T09:00:00.000Z', 'abc123')",
  );
  sql.exec("INSERT INTO person (id, email, name, suspended_at) VALUES ('p_1', 'h@example.test', 'Halden', NULL)");
  sql.exec(
    "INSERT INTO metric_point (series, grain, at, value, unit, n, source, wrote_at) VALUES ('revenue', 'month', '2026-08', 72000, 'GBP', 3, 'obligations', '2026-09-01T00:00:00.000Z')",
  );
  sql.exec(
    "INSERT INTO inbox_raw (id, ts, channel, headers, body, sha256, state, reason) VALUES ('in_1', '2026-08-02T10:00:00.000Z', 'email', '{\"from\":\"halden\"}', 'Invoice attached', 'deadbeef', 'matched', NULL)",
  );
  sql.exec(
    "INSERT INTO ingest_receipt (id, raw_id, ingest_id, wrote, confidence, ts) VALUES ('ir_1', 'in_1', 'ingest.invoices', '[\"obligations#1\"]', 'exact', '2026-08-02T10:00:01.000Z')",
  );
  sql.exec(
    "INSERT INTO decision (id, question, answer, reason, decided_by, ts, supersedes) VALUES ('D1', 'Do we chase at 30 days?', 'Yes', 'Two clients paid only after a reminder.', 'p_1', '2026-08-10T00:00:00.000Z', NULL)",
  );
  sql.exec(
    "INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at, resolved_as, defer_until, defer_why) VALUES ('SG1', 'options', '{\"options\":[]}', 'open', 'system', '2026-08-11T00:00:00.000Z', NULL, NULL, NULL)",
  );
  sql.exec(
    "INSERT INTO prediction (id, for_decl, claim, measure, baseline, unit, target, window, score_at, scored_at, observed, met, on_miss) VALUES ('pr_1', 'register.obligations', 'Chasing halves the wait', '{\"source\":\"obligations\"}', 41, 'days', '20', '90d', '2026-11-10T00:00:00.000Z', NULL, NULL, NULL, 'suggest')",
  );
  sql.exec("INSERT INTO member (person_id, register, level, seen_at) VALUES ('p_1', '*', 'owner', '2026-09-01T00:00:00.000Z')");
  sql.exec(
    'INSERT INTO grant (id, label, opens, kind, version, ciphertext, nonce, kdf, wrapped_by, kek_id, bytes, hint, created_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)',
    'g_1',
    'Stripe, live',
    'stripe.com',
    'api_token',
    b(7),
    b(9),
    'hkdf',
    'kek',
    'kek_2f',
    64,
    'a 64-char token',
    '2026-01-01T00:00:00.000Z',
  );
  sql.exec(
    "INSERT INTO vault_key (purpose, wrapped, nonce, wrapped_by, kek_id, salt, rewrapped_at) VALUES ('record', ?, ?, 'kek', 'kek_2f', NULL, NULL)",
    b(3),
    b(5),
  );
  sql.exec(
    "INSERT INTO outbox (id, created, kind, payload, state, attempts) VALUES ('ob_1', '2026-09-05T12:00:00.000Z', 'notify.email', '{\"to\":\"p_1\"}', 'pending', 0)",
  );
}

/* ── the file is stable ──────────────────────────────────────────────────── */

test('TWO EXPORTS OF AN UNCHANGED RECORD ARE THE SAME BYTES', async () => {
  // A timestamp in the file would mean "has anything changed since my last copy" needs a tool
  // instead of `diff`. When the file is signed, the time lives in the signature — where a time that
  // is about the ACT rather than the CONTENT belongs.
  const { k, sql } = await filled();
  const first = value<string[]>(await k.export());
  const second = value<string[]>(await k.export());
  assert.deepEqual(second, first);
  assert.ok(!first.join('\n').includes('exported_at'), 'the file carries a timestamp of its own making');
  sql.close();
});

test('and a write changes them, which is the other half of that being useful', async () => {
  const { k, sql } = await filled();
  const before = value<string[]>(await k.export());
  value(k.create('obligations', { what: 'One more' }, { actor: 'p_1' }));
  assert.notDeepEqual(value<string[]>(await k.export()), before);
  sql.close();
});

/* ── the file describes itself ───────────────────────────────────────────── */

test('A TABLE’S HASH IS CHECKABLE WITH sed AND sha256sum AND NOTHING ELSE', async () => {
  // The whole argument for lines over a zip of JSON: somebody who does not trust us can verify a
  // table without a tool of ours.
  const { k, sql } = await filled();
  const lines = value<string[]>(await k.export());

  const claimed = new Map(
    sql.all<{ table_name: string; rows: number; sha256: string }>('SELECT table_name, rows, sha256 FROM dog_manifest').map((r) => [
      r.table_name,
      r,
    ]),
  );
  assert.ok(claimed.size > 5, 'the manifest is empty');

  // Cut the file up the way `sed` would: a `#table` header, then every line until the next one.
  const seen = new Map<string, string[]>();
  let at: string | null = null;
  for (const line of lines) {
    if (line.startsWith('#table ')) {
      at = line.slice('#table '.length).split(' ')[0] ?? null;
      if (at) seen.set(at, []);
      continue;
    }
    if (line.startsWith('#') || !at) continue;
    seen.get(at)?.push(line);
  }

  for (const [name, rows] of seen) {
    const claim = claimed.get(name);
    if (!claim) continue;
    assert.equal(rows.length, Number(claim.rows), `${name} claims ${claim.rows} rows and carries ${rows.length}`);
    const sha = createHash('sha256').update(rows.join('\n')).digest('hex');
    assert.equal(sha, claim.sha256, `${name}'s hash does not describe its lines`);
  }
  sql.close();
});

test('the header travels, the local section does not', async () => {
  // A lockout counter and a device grant are facts about one machine, and a record that carried them
  // would import somebody else's failed logins.
  const { k, sql } = await filled();
  const lines = value<string[]>(await k.export());
  const named = lines.filter((l) => l.startsWith('#table ')).map((l) => l.slice(7).split(' ')[0]);

  for (const wanted of ['dog_meta', 'dog_section', 'dog_manifest', 'entry', 'event', 'declaration', 'counter', 'dog_sig'])
    assert.ok(named.includes(wanted), `${wanted} is not in the file`);
  for (const local of ['token', 'auth_fail', 'observation', 'device_grant', 'job'])
    assert.ok(!named.includes(local), `${local} is local and travelled`);

  // `dog_sig` is last and the kernel writes no row under it: signing needs a private key the kernel
  // must never see.
  assert.equal(named.at(-1), 'dog_sig');
  assert.ok(lines.at(-1)?.startsWith('#table dog_sig '), 'a row was written under the signature header');
  sql.close();
});

test('a section can be left out, and the header still travels', async () => {
  // Data without origin is a clean handover; origin without data is an audit. Both are cheap because
  // the sections are addressable.
  const { k, sql } = await filled();
  const clean = value<string[]>(await k.export({ sections: ['data'] }));
  const named = clean.filter((l) => l.startsWith('#table ')).map((l) => l.slice(7).split(' ')[0]);
  assert.ok(named.includes('entry'), 'the data went missing');
  assert.ok(named.includes('dog_meta'), 'the header has to travel whatever else does');
  assert.ok(!named.includes('event'), 'origin travelled in a data-only export');
  assert.ok(!named.includes('declaration'), 'governance travelled in a data-only export');
  sql.close();
});

/* ── the round trip ──────────────────────────────────────────────────────── */

test('EXPORT · IMPORT · EXPORT PRODUCES THE SAME FILE, which is the only proof it is complete', async () => {
  const source = await filled();
  const first = value<string[]>(await source.k.export());

  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const report = value<{ tables: number; rows: number }>(k.import(first));
  assert.ok(report.rows > 5, `only ${report.rows} rows arrived`);

  const second = value<string[]>(await k.export());
  /* The ledger is the one table that does not round-trip across machines: it is a fact about the
     database it is in, and the target applied its own migrations before it could read a file at all.
     Here both were applied by the same build at the same clock, so the lines are identical anyway —
     the exclusion is stated rather than relied on. */
  assert.deepEqual(second, first, 'the record that came out of the file is not the record that went in');
  source.sql.close();
  sql.close();
});

test('and everything the record could answer before, it answers after', async () => {
  const source = await filled();
  const lines = value<string[]>(await source.k.export());

  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(k.import(lines));

  // The rows, with their numbers.
  assert.equal(k.count('obligations'), 2, 'a deleted row came back live, or a live one went missing');
  assert.equal(k.get('obligations#1')?.fields.what, 'Invoice 41 — brand');
  assert.equal(k.get('obligations#3'), null, 'a deleted row was restored by the import');

  // The declarations, so the write path works at all.
  assert.ok(k.register('obligations'), 'the register did not travel');

  // The history, with its original actors: a copy that says every fact was written by whoever
  // imported it is not a copy.
  const events = k.history(k.get('obligations#1')!.id);
  assert.deepEqual(events.map((e) => e.actor), ['p_1', 'rule:settle']);
  assert.equal(events[0]?.note, 'From the PDF');

  // The counter, so the next number does not collide with one that already exists.
  const next = value<{ seq: number }>(k.create('obligations', { what: 'After the import' }, { actor: 'p_1' }));
  assert.equal(next.seq, 4, `the next number is ${next.seq}, and 3 is taken`);

  // And the search index, rebuilt from the rows the file brought.
  assert.equal(k.search('halden').length, 1, 'the index was not rebuilt after the import');
  sql.close();
  source.sql.close();
});

test('AN IMPORT OPENS A FILE INTO AN EMPTY RECORD, and refuses anything else', async () => {
  // Merging two records is a decision about which of two facts is true, made per row, by somebody
  // who knows. A tool that guessed would be wrong quietly, which for a record of what somebody is
  // owed is the worst failure available.
  const source = await filled();
  const lines = value<string[]>(await source.k.export());
  const target = await filled();

  const out = target.k.import(lines) as { ok: boolean; refusal?: { code: string; fix: string } };
  assert.equal(out.ok, false);
  assert.equal(out.refusal?.code, 'RECORD_NOT_EMPTY');
  assert.match(out.refusal?.fix ?? '', /decision per row/);
  assert.equal(target.k.count('obligations'), 2, 'a refused import wrote rows anyway');
  source.sql.close();
  target.sql.close();
});

test('every travelling table arrives, and not one of them quietly stays behind', async () => {
  // The fixture puts a row in every table that travels, so this is the assertion that a dropped
  // table is caught. The earlier fixture filled four of them, which meant an export that lost the
  // grants — a customer's whole credentials index — passed every test in this file.
  const source = await filled();
  const lines = value<string[]>(await source.k.export());

  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(k.import(lines));

  const travelling = source.sql
    .all<{ table_name: string; section: string }>('SELECT table_name, section FROM dog_section')
    .filter((r) => r.section !== 'local' && r.section !== 'header' && r.table_name !== 'migration');

  for (const { table_name } of travelling) {
    /* AN `export` EVENT DOES NOT TRAVEL, and is the only row that does not. It is a fact about this
       installation's copies rather than about the business — the same argument the `local` section
       makes for tokens and device grants — and it has to be written, because a vault whose reads are
       not audited cannot answer "did anything get out". Counting it here would mean no two exports
       of an unchanged record are the same bytes, because the first one changed the record. */
    const skip = table_name === 'event' ? " WHERE kind <> 'export'" : '';
    const before = source.sql.one<{ n: number }>(`SELECT count(*) AS n FROM ${table_name}${skip}`)?.n ?? 0;
    const after = sql.one<{ n: number }>(`SELECT count(*) AS n FROM ${table_name}`)?.n ?? 0;
    assert.equal(after, before, `${table_name}: ${before} rows went in and ${after} came out`);
    if (table_name !== 'entry_fts' && table_name !== 'entry_vec' && table_name !== 'record')
      assert.ok(Number(before) > 0, `${table_name} is empty in the fixture, so this proves nothing about it`);
  }

  // And a blob is still a blob, not the base64 of one.
  const grant = sql.one<{ ciphertext: Uint8Array; kek_id: string }>('SELECT ciphertext, kek_id FROM grant');
  assert.deepEqual(Array.from(grant?.ciphertext ?? []), [7, 8, 0, 255], 'the sealed bytes did not survive the file');
  assert.equal(grant?.kek_id, 'kek_2f');
  sql.close();
  source.sql.close();
});

test('A RECORD WITH NO ROWS BUT ITS OWN GOVERNANCE IS NOT EMPTY', async () => {
  // The emptiness check used to count entries only. A record holding registers, decisions and grants
  // and no rows called itself empty — and then the first `declaration` line cleared the declarations
  // while the decisions and grants stood, which is the half-merge the refusal exists to prevent.
  const source = await filled();
  const lines = value<string[]>(await source.k.export());

  const sql = openSqlite();
  const target = await openRecord(sql, fixedClock(NOW));
  assert.ok((await target.install([OBLIGATIONS])).ok);
  sql.exec(
    "INSERT INTO decision (id, question, answer, reason, decided_by, ts) VALUES ('D9', 'q', 'a', 'r', 'p_1', '2026-01-01T00:00:00.000Z')",
  );
  assert.equal(target.count('obligations'), 0, 'the target does hold rows, so this tests the old check');

  const out = target.import(lines) as { ok: boolean; refusal?: { code: string; fix: string } };
  assert.equal(out.ok, false, 'a record holding a register and a decision was called empty');
  assert.equal(out.refusal?.code, 'RECORD_NOT_EMPTY');
  assert.match(out.refusal?.fix ?? '', /declaration|decision/, 'the refusal does not say what is in the way');
  assert.ok(target.register('obligations'), 'the refused import destroyed the register anyway');
  assert.equal(sql.one<{ n: number }>('SELECT count(*) AS n FROM decision')?.n, 1);
  sql.close();
  source.sql.close();
});

test('a damaged file is a refusal and not an exception, and it writes nothing', async () => {
  const source = await filled();
  const lines = value<string[]>(await source.k.export());
  const at = lines.findIndex((l) => l.startsWith('[') && l.includes('obligations'));
  assert.ok(at > 0, 'no row line to damage');

  for (const damage of [lines[at]!.slice(0, 20), '{"not":"an array"}']) {
    const broken = [...lines.slice(0, at), damage, ...lines.slice(at + 1)];
    const sql = openSqlite();
    const k = await openRecord(sql, fixedClock(NOW));
    const out = k.import(broken) as { ok: boolean; refusal?: { code: string; fix: string } };
    assert.equal(out.ok, false, `\`${damage.slice(0, 24)}…\` was imported as if it were a row`);
    assert.equal(out.refusal?.code, 'MALFORMED_FILE');
    assert.equal(sql.one<{ n: number }>('SELECT count(*) AS n FROM entry')?.n, 0, 'a failed import left rows behind');
    sql.close();
  }
  source.sql.close();
});

test('A RECORD OPENED FROM A FILE KNOWS WHAT IT IS CALLED', async () => {
  /* The header used to be skipped wholesale on import, so a record opened from a file could not say
     its own name or timezone — and rendered every digest in UTC. Three of the four header tables
     are still skipped, for three different reasons; `dog_meta` is the record's identity, and opening
     a file into an empty record means becoming that record. */
  const source = await filled();
  value(
    source.k.createRecord({
      id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD',
      slug: 'the-studio',
      name: 'The Studio',
      tz: 'Europe/London',
      locale: 'en-GB',
      owner: { id: 'p_1', email: 'me@example.test', name: 'Sam' },
    }),
  );
  const lines = value<string[]>(await source.k.export());

  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  value(k.import(lines));

  assert.equal(k.identity()?.slug, 'the-studio', 'the record row did not travel');
  assert.equal(k.identity()?.tz, 'Europe/London');
  assert.equal(sql.one<{ value: string }>("SELECT value FROM dog_meta WHERE key = 'record_slug'")?.value, 'the-studio');

  // The three that are about the FILE rather than the record are rebuilt, not adopted.
  assert.ok(sql.all('SELECT 1 FROM dog_section').length > 20, 'the section map was cleared by the import');
  assert.equal(sql.all('SELECT 1 FROM dog_sig').length, 0);

  // And the second export equals the first, which is what says the identity round-trips.
  assert.deepEqual(value<string[]>(await k.export()), lines);

  /* The manifest is written BY the export and describes the rows this record now holds, so the file's
     copy of it was never adopted — which is the whole reason it is skipped. */
  assert.ok(
    sql.one<{ sha256: string }>("SELECT sha256 FROM dog_manifest WHERE table_name = 'entry'"),
    'the manifest was not rebuilt by the export',
  );
  sql.close();
  source.sql.close();
});

test('a file from a build that reads a newer format is refused, not half read', async () => {
  // Reading it would mean writing rows whose columns this build does not know into a record it then
  // calls a complete copy — and the customer finds out by opening it and finding a table missing.
  const source = await filled();
  const lines = value<string[]>(await source.k.export());
  const at = lines.findIndex((l) => l.startsWith('["format"'));
  assert.ok(at > 0, `no format line in the header: ${lines.slice(0, 6).join(' / ')}`);

  const future = [...lines.slice(0, at), '["format","9"]', ...lines.slice(at + 1)];
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const out = k.import(future) as { ok: boolean; refusal?: { code: string; fix: string } };
  assert.equal(out.ok, false, 'a file from a newer build was read as if this build had written it');
  assert.match(out.refusal?.fix ?? '', /format 9/);
  assert.equal(sql.one<{ n: number }>('SELECT count(*) AS n FROM entry')?.n, 0, 'a refused import wrote rows');
  sql.close();
  source.sql.close();
});

/* ── the values survive ──────────────────────────────────────────────────── */

test('every kind of value comes back as itself', async () => {
  const { k, sql } = await record();
  value(
    k.create(
      'obligations',
      { what: 'A quote " and a backslash \\ and a newline\nin one', amount: { amount: -4800, currency: 'EUR' }, due: '2026-12-31' },
      { actor: 'p_1' },
    ),
  );
  const lines = value<string[]>(await k.export());

  const to = openSqlite();
  const k2 = await openRecord(to, fixedClock(NOW));
  value(k2.import(lines));
  const row = k2.get('obligations#1');
  assert.equal(row?.fields.what, 'A quote " and a backslash \\ and a newline\nin one');
  assert.deepEqual(row?.fields.amount, { amount: -4800, currency: 'EUR' });
  assert.equal(row?.fields.due, '2026-12-31');
  sql.close();
  to.close();
});

test('the shape is read from the schema, so a table nobody listed still travels', async () => {
  // A list of tables in the format code would be a second copy of the schema, and the copy that
  // drifted would be the one deciding what a customer's file contains.
  const { k, sql } = await filled();
  const lines = value<string[]>(await k.export());
  const named = new Set(lines.filter((l) => l.startsWith('#table ')).map((l) => l.slice(7).split(' ')[0]));
  const travelling = sql
    .all<{ table_name: string; section: string }>('SELECT table_name, section FROM dog_section')
    .filter((r) => (TRAVELS as readonly string[]).includes(r.section))
    .map((r) => r.table_name);
  for (const name of travelling) assert.ok(named.has(name), `${name} is sectioned to travel and is not in the file`);
  sql.close();
});
