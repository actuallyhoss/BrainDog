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

import { b64url, checkBrainl, keyIdOf, openRecord, signBrainl, TRAVELS, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';
import { testSigner } from './signer.ts';

/**
 * ONE SIGNING KEY FOR THIS FILE'S RECORDS. `41 §5.11` step 3 refuses a file with no `dog_sig` row,
 * so every record that exports here needs a signer — which is what a real record has: a wrapped
 * Ed25519 private half in `vault_key`, opened by the host under its KEK.
 */
const SIGNER = testSigner();

/** base64url in, bytes out — so the by-hand verification below uses nothing this file is testing. */
const unb64 = (text: string): Uint8Array =>
  new Uint8Array(Buffer.from(text.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));

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
  const k = await openRecord(sql, fixedClock(NOW), { sign: SIGNER });
  assert.ok((await k.install([OBLIGATIONS])).ok);
  return { k, sql };
}

/**
 * Recompute a file's own manifest so that an edited file is INTERNALLY CONSISTENT again.
 *
 * IT EXISTS TO KEEP THE OLD TESTS HONEST. `checkBrainl` now refuses a file whose rows do not match its
 * manifest, which means every test that damaged a row line was, after that change, testing the
 * checksum and not the thing it was written for. Re-sealing puts the parser back under test: this is
 * a file that passes every integrity check and still carries a line that is not a row.
 *
 * It is also what an attacker with a text editor has, which is the point of the signature that goes
 * on top of it.
 */
function reseal(lines: readonly string[]): string[] {
  const held = new Map<string, string[]>();
  const order: string[] = [];
  let at: string[] | null = null;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith('#table ')) {
      const name = line.slice('#table '.length).split(' ')[0]!;
      at = [];
      held.set(name, at);
      order.push(name);
      continue;
    }
    if (line.startsWith('#') || !line) continue;
    at?.push(line);
  }

  const sums = new Map<string, [number, string]>();
  for (const [name, rows] of held) {
    if (name === 'dog_manifest' || name === 'dog_sig') continue;
    sums.set(name, [rows.length, createHash('sha256').update(rows.join('\n')).digest('hex')]);
  }

  const out: string[] = [];
  let table: string | null = null;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith('#table ')) {
      table = line.slice('#table '.length).split(' ')[0]!;
      out.push(raw);
      if (table === 'dog_manifest')
        for (const [name, [rows, sha]] of [...sums].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
          out.push(JSON.stringify([name, rows, sha]));
      continue;
    }
    if (table === 'dog_manifest' && !line.startsWith('#')) continue;
    /* THE OLD SIGNATURE GOES WITH THE OLD MANIFEST. It signed bytes that no longer exist, and
       leaving it beside a new one gives a file two signatures — which `checkBrainl` refuses for its
       own reason and would hide the one this is testing. `exportBrainl` clears `dog_sig` for the same
       reason. */
    if (table === 'dog_sig' && !line.startsWith('#')) continue;
    out.push(raw);
  }
  return out;
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
  for (const local of ['token', 'auth_fail', 'observation', 'device_grant', 'job', 'invitation'])
    assert.ok(!named.includes(local), `${local} is local and travelled`);

  // `dog_sig` IS LAST, whatever section it sits in, so a signer appends one line to the end of a
  // file whose hashes are already fixed rather than splicing into the middle of it.
  assert.equal(named.at(-1), 'dog_sig');
  // AND THE KERNEL WROTE NO ROW UNDER IT. `exportBrainl` cannot: signing needs a private key `12 §6`
  // keeps in the host. The row on the end came from `signBrainl`, which takes bytes and a callback.
  assert.equal(value<string[]>(await (await openRecord(openSqlite(), fixedClock(NOW))).export()).at(-1)?.startsWith('#table dog_sig '), true, 'an unsigned export wrote a signature row');
  assert.ok(lines.at(-1)?.startsWith('["ed25519",'), 'the signed file carries no signature row');
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
  const k = await openRecord(sql, fixedClock(NOW), { sign: SIGNER });
  const report = value<{ tables: number; rows: number }>(await k.import(first));
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

test('A FILE WRITTEN BEFORE MIGRATION 2 OPENS, and the record it lands in keeps its session register', async () => {
  /* The file carries no kernel `register.session`, and the import replaces the declaration table
     with the file's. The target's ledger already says migration 2 ran, so the import is the only
     thing that can put the row back. */
  const source = await filled();
  source.sql.exec("DELETE FROM declaration WHERE id = 'register.session'");
  const lines = value<string[]>(await source.k.export());
  assert.ok(!lines.some((l) => l.startsWith('["register.session"')), 'the file still carries the kernel row');

  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW), { sign: SIGNER });
  value(await k.import(lines));
  const seated = sql.all<{ pack_id: string }>(
    "SELECT pack_id FROM declaration WHERE id = 'register.session' AND superseded_at IS NULL AND retired = 0",
  );
  assert.deepEqual(seated.map((r) => r.pack_id), ['kernel']);
  assert.equal(k.register('session')?.seq_prefix, 'S', 'the imported record cannot speak S1');
  assert.equal(k.count('obligations'), 2, 'the file’s own rows did not arrive');
  source.sql.close();
  sql.close();
});

test('and everything the record could answer before, it answers after', async () => {
  const source = await filled();
  const lines = value<string[]>(await source.k.export());

  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW), { sign: SIGNER });
  value(await k.import(lines));

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

  const out = (await target.k.import(lines)) as { ok: boolean; refusal?: { code: string; fix: string } };
  assert.equal(out.ok, false);
  /* `IMPORT_NOT_EMPTY` is `30 §6`'s name for this and `41 §6` gives it the same sentence. It read
     `RECORD_NOT_EMPTY`, which mattered more than a synonym normally would: `30 §6`'s HTTP row names
     `IMPORT_NOT_EMPTY` by hand as one of the two refusals a caller might mistake for a 409, so a
     caller that had read the document and branched on it never matched. */
  assert.equal(out.refusal?.code, 'IMPORT_NOT_EMPTY');
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
  const k = await openRecord(sql, fixedClock(NOW), { sign: SIGNER });
  value(await k.import(lines));

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
  const target = await openRecord(sql, fixedClock(NOW), { sign: SIGNER });
  assert.ok((await target.install([OBLIGATIONS])).ok);
  sql.exec(
    "INSERT INTO decision (id, question, answer, reason, decided_by, ts) VALUES ('D9', 'q', 'a', 'r', 'p_1', '2026-01-01T00:00:00.000Z')",
  );
  assert.equal(target.count('obligations'), 0, 'the target does hold rows, so this tests the old check');

  const out = (await target.import(lines)) as { ok: boolean; refusal?: { code: string; fix: string } };
  assert.equal(out.ok, false, 'a record holding a register and a decision was called empty');
  assert.equal(out.refusal?.code, 'IMPORT_NOT_EMPTY');
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
    /* RE-SEALED AND RE-SIGNED, so this is about the PARSER. Without the reseal the manifest catches
       the edit; without the re-signature the signature does. Both are the right answer to a damaged
       file, and both make every assertion below about a check other than the one this test is named
       for. What is left is the case that gets through everything: a file that is internally
       consistent, signed by the key that wrote it, and carrying a line that is not a row. */
    const broken = await signBrainl(reseal([...lines.slice(0, at), damage, ...lines.slice(at + 1)]), SIGNER);
    const sql = openSqlite();
    const k = await openRecord(sql, fixedClock(NOW), { sign: SIGNER });
    const out = (await k.import(broken)) as { ok: boolean; refusal?: { code: string; fix: string } };
    assert.equal(out.ok, false, `\`${damage.slice(0, 24)}…\` was imported as if it were a row`);
    /* `FILE_MALFORMED` — `30 §6`'s new format-and-lifecycle code for the hole `33 §9`'s import row
       left: it names `SIGNATURE_INVALID`, `CHECKSUM_MISMATCH` and `FORMAT_NEWER_THAN_READER` and has
       no word for a file that is simply not a `.brainl`. Both arms of the old ternary here —
       `MALFORMED_FILE` and `IMPORT_FAILED` — are this one code now, and `IMPORT_FAILED` was invisible
       to the refusals gate because its pattern could not see past a `?`. */
    assert.equal(out.refusal?.code, 'FILE_MALFORMED');
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
  const k = await openRecord(sql, fixedClock(NOW), { sign: SIGNER });
  value(await k.import(lines));

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
  /* LINE ONE, WHICH IS WHERE `41 §5.11` STEP 2 PUTS IT. The `dog_meta` row that said the same
     thing was checked inside the writer, after the transaction had opened — and it is now
     unreachable for any file that passes its own checksum, because changing it changes `dog_meta`. */
  assert.equal(lines[0], '#dogl 1');
  const future = ['#dogl 9', ...lines.slice(1)];
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW), { sign: SIGNER });
  const out = (await k.import(future)) as { ok: boolean; refusal?: { code: string; fix: string } };
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
  const k2 = await openRecord(to, fixedClock(NOW), { sign: SIGNER });
  value(await k2.import(lines));
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

/* -- the file checks itself ----------------------------------------------- */

/** Where the rows of one table start and end, in a file's lines. */
function span(lines: readonly string[], table: string): [number, number] {
  const from = lines.findIndex((l) => l.startsWith(`#table ${table} `));
  assert.ok(from >= 0, `${table} is not in the file`);
  let to = from + 1;
  while (to < lines.length && !lines[to]!.startsWith('#')) to++;
  return [from, to];
}

/**
 * A row line inside ONE table's span.
 *
 * SEARCHING THE WHOLE FILE FINDS THE WRONG LINE. `["entry","data"]` is a `dog_section` row and
 * `["entry",1,"86e…"]` is a manifest row, and both start the way an entry row does — so a test that
 * damaged "the line mentioning Halden" damaged the search index, and passed for the wrong reason.
 */
function rowIn(lines: readonly string[], table: string, holds: string): number {
  const [from, to] = span(lines, table);
  const at = lines.slice(from + 1, to).findIndex((l) => l.includes(holds));
  assert.ok(at >= 0, `no ${table} row holding ${holds}`);
  return from + 1 + at;
}

test('A FILE THAT HAS BEEN EDITED SINCE IT WAS WRITTEN DOES NOT OPEN', async () => {
  // Every export hashes each table into `dog_manifest` and every import ignored it, so a truncated
  // download, a deleted row or one changed digit in an amount all became the record. A claim nothing
  // checks reads exactly like a claim that works.
  const { k, sql } = await filled();
  const lines = value<string[]>(await k.export());
  assert.ok((await checkBrainl(lines)).ok, 'a file straight out of export does not match its own manifest');

  const at = rowIn(lines, 'entry', 'Halden');

  // ONE DIGIT, in the one column this product exists to be right about.
  const edited = [...lines];
  edited[at] = edited[at]!.replace('48000', '4800');
  assert.notEqual(edited[at], lines[at], 'the amount was not where the test thought it was');
  const bent = await checkBrainl(edited);
  assert.equal(bent.ok, false, 'an edited amount passed the manifest');
  assert.equal(bent.ok === false ? bent.refusal.code : '', 'CHECKSUM_MISMATCH');
  assert.match(bent.ok === false ? bent.refusal.fix : '', /entry/, 'the refusal does not name the table');

  // A ROW REMOVED. The count and the hash both move, and either is enough.
  const short = [...lines.slice(0, at), ...lines.slice(at + 1)];
  assert.equal((await checkBrainl(short)).ok, false, 'a deleted row passed the manifest');

  // A ROW ADDED, which is the one that matters: somebody appending an invoice they are owed.
  const long = [...lines.slice(0, at + 1), lines[at]!.replace('Halden', 'Nobody'), ...lines.slice(at + 1)];
  assert.equal((await checkBrainl(long)).ok, false, 'an appended row passed the manifest');

  sql.close();
});

test('AND NEITHER DOES A FILE WITH A TABLE MISSING, which is the case a per-table hash cannot see', async () => {
  // Hash each table and compare: a table that is not in the file has nothing to hash, so the loop
  // over the file's tables never looks at it. The manifest names it, and that is the check.
  const { k, sql } = await filled();
  const lines = value<string[]>(await k.export());

  const [from, to] = span(lines, 'entry');
  const gone = [...lines.slice(0, from), ...lines.slice(to)];
  const out = await checkBrainl(gone);
  assert.equal(out.ok, false, 'a file with every entry removed passed');
  assert.equal(out.ok === false ? out.refusal.code : '', 'CHECKSUM_MISMATCH');
  assert.match(out.ok === false ? out.refusal.fix : '', /entry/);

  // A TABLE THE MANIFEST DOES NOT LIST is the same fault from the other side.
  const extra = [...lines, '#table nowhere id,name', '["x","y"]'];
  assert.equal((await checkBrainl(extra)).ok, false, 'a table nothing vouches for passed');

  // AND THE MANIFEST ITSELF CANNOT BE DROPPED. Without this, deleting one header disables every
  // check in this file and the import proceeds.
  const [mfrom, mto] = span(lines, 'dog_manifest');
  const unvouched = [...lines.slice(0, mfrom), ...lines.slice(mto)];
  const bare = await checkBrainl(unvouched);
  assert.equal(bare.ok, false, 'a file with no manifest passed');
  assert.equal(bare.ok === false ? bare.refusal.code : '', 'CHECKSUM_MISMATCH');

  sql.close();
});

test('THE COUNT BESIDE THE HASH IS CHECKED TOO', async () => {
  const { k, sql } = await filled();
  const lines = value<string[]>(await k.export());
  const at = rowIn(lines, 'dog_manifest', '"entry"');

  const [name, rows, sha] = JSON.parse(lines[at]!) as [string, number, string];
  assert.equal(name, 'entry', 'the manifest row found was not entry’s');
  const lying = [...lines];
  lying[at] = JSON.stringify([name, rows + 1, sha]);
  const out = await checkBrainl(lying);
  assert.equal(out.ok, false, 'a manifest whose two halves disagree passed');
  assert.match(out.ok === false ? out.refusal.fix : '', /rows/);
  sql.close();
});

test('A FILE FROM A NEWER BUILD IS REFUSED ON LINE ONE, before anything is parsed', async () => {
  const { k, sql } = await filled();
  const lines = value<string[]>(await k.export());

  const future = await checkBrainl(['#dogl 9', ...lines.slice(1)]);
  assert.equal(future.ok, false);
  assert.equal(future.ok === false ? future.refusal.code : '', 'FORMAT_NEWER_THAN_READER');
  assert.match(future.ok === false ? future.refusal.fix : '', /format 9/);

  // AND SOMETHING THAT IS NOT A .brain FILE AT ALL says so, rather than reporting a checksum.
  for (const first of ['<!doctype html>', '#dogl', '#dogl nine', ''])
    assert.equal((await checkBrainl([first, ...lines.slice(1)])).ok, false, `\`${first}\` was read as a file`);
  assert.equal(
    ((await checkBrainl(['<!doctype html>'])) as { refusal: { code: string } }).refusal.code,
    'FILE_MALFORMED',
  );
  sql.close();
});

test('A dog_meta FORMAT ROW AHEAD OF THE READER IS REFUSED IN ITS OWN WORDS, not in the other code’s', async () => {
  /* TWO CODES MAY NOT SHARE A SENTENCE. A file whose `#dogl` header is ahead of this build is
     `FORMAT_NEWER_THAN_READER` and the repair is an upgrade. Getting past that line and then
     finding a `dog_meta.format` row ahead of the reader is a DIFFERENT fact: the file's two
     statements of its own format disagree, so it is damaged rather than new, and the repair is
     another copy. The sentence here was `FORMAT_NEWER_THAN_READER`'s word for word, which left a
     person holding a 422 that told them to upgrade a build that was never behind. */
  const source = await filled();
  const lines = value<string[]>(await source.k.export());
  const at = rowIn(lines, 'dog_meta', '"format"');
  const [key] = JSON.parse(lines[at]!) as [string, string];
  assert.equal(key, 'format', 'the dog_meta row found was not the format row');
  const ahead = await signBrainl(reseal([...lines.slice(0, at), JSON.stringify([key, '9']), ...lines.slice(at + 1)]), SIGNER);

  const sql = openSqlite();
  const target = await openRecord(sql, fixedClock(NOW), { sign: SIGNER });
  const out = (await target.import(ahead)) as { ok: boolean; refusal?: { code: string; at?: string; fix: string } };
  assert.equal(out.ok, false, 'a file whose dog_meta format row is ahead of the reader was imported');
  assert.equal(out.refusal?.code, 'FILE_MALFORMED');
  assert.equal(out.refusal?.at, 'dog_meta.format');

  const upgrade = await checkBrainl(['#dogl 9', ...lines.slice(1)]);
  const borrowed = upgrade.ok === false ? upgrade.refusal.fix.slice(0, upgrade.refusal.fix.indexOf('.') + 1) : '';
  assert.equal(borrowed, 'This file is format 9 and this build reads 1.', 'the other code no longer says this');
  assert.ok(!(out.refusal?.fix ?? '').includes(borrowed), `FILE_MALFORMED is carrying FORMAT_NEWER_THAN_READER's sentence: ${out.refusal?.fix}`);
  assert.doesNotMatch(out.refusal?.fix ?? '', /[Uu]pgrade/, 'a damaged file was answered with an upgrade');
  assert.match(out.refusal?.fix ?? '', /dog_meta/, 'the refusal does not name the row that is wrong');
  assert.match(out.refusal?.fix ?? '', /re-export/i, 'the refusal does not say what to do');
  assert.equal(sql.one<{ n: number }>('SELECT count(*) AS n FROM entry')?.n, 0, 'a refused import left rows behind');
  sql.close();
  source.sql.close();
});

test('AN EMPTY TABLE IS STILL A TABLE, and a file that grew one does not open', async () => {
  // The hash of a table with no rows is the hash of the empty string, and a reader that skipped
  // headers with nothing under them would let somebody empty a table without moving a single hash.
  const { k, sql } = await filled();
  const lines = value<string[]>(await k.export());

  const [from, to] = span(lines, 'entry');
  const emptied = [...lines.slice(0, from + 1), ...lines.slice(to)];
  assert.equal((await checkBrainl(emptied)).ok, false, 'emptying a table left the manifest satisfied');

  // And a real export DOES carry empty tables, which is what makes the case above reachable.
  const bodiless = lines.filter((l, i) => l.startsWith('#table ') && (lines[i + 1] ?? '#').startsWith('#'));
  assert.ok(bodiless.length > 0, 'no empty table in the file, so this property is untested');
  sql.close();
});

test('AND THE CHECK RUNS BEFORE ONE ROW IS WRITTEN', async () => {
  const source = await filled();
  const lines = value<string[]>(await source.k.export());
  const at = rowIn(lines, 'entry', 'Halden');
  const edited = [...lines];
  edited[at] = edited[at]!.replace('48000', '4800');

  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW), { sign: SIGNER });
  const out = (await k.import(edited)) as { ok: boolean; refusal?: { code: string; fix: string } };
  assert.equal(out.ok, false);
  assert.equal(out.refusal?.code, 'CHECKSUM_MISMATCH');
  assert.equal(sql.one<{ n: number }>('SELECT count(*) AS n FROM entry')?.n, 0, 'a refused import wrote rows');
  /* AND THE DECLARATIONS ARE UNTOUCHED, which is the half a per-table check could still have got
     wrong: `importBrainl` clears a table on its first line, so a refusal that arrived one table in
     would leave the record emptier than it started. */
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM declaration WHERE pack_id IS NOT 'kernel'")?.n ?? 0, 0);
  sql.close();
  source.sql.close();
});


/* -- and the file says who wrote it --------------------------------------- */

test('A SIGNED FILE NAMES ITS KEY, AND THE ID IS THE KEY', async () => {
  const { k, sql } = await filled();
  const lines = value<string[]>(await k.export());

  const [from] = span(lines, 'dog_sig');
  const row = JSON.parse(lines[from + 1]!) as [string, string, string, string, string];
  const [alg, keyId, publicKey, sig, signedAt] = row;

  assert.equal(alg, 'ed25519');
  // `03 §4`: raw 32-byte Ed25519 in base64url, and `key_id` the first 16 hex of SHA-256 over it.
  assert.equal(publicKey.length, 43, 'the public key is not 32 raw bytes in base64url');
  assert.match(keyId, /^[0-9a-f]{16}$/);
  assert.equal(await keyIdOf(await SIGNER.publicKey), keyId, 'the key id is not the id of this key');
  assert.equal(b64url(await SIGNER.publicKey), publicKey, 'the file carries a key other than the one that signed it');
  assert.equal(sig.length, 86, 'an Ed25519 signature is 64 bytes');
  assert.match(signedAt, /^\d{4}-\d{2}-\d{2}T/);

  // AND IT VERIFIES BY HAND, against the bytes `03 §4` names and nothing this repository wrote.
  const key = await crypto.subtle.importKey('raw', await SIGNER.publicKey, { name: 'Ed25519' }, false, ['verify']);
  const manifest = lines.slice(...span(lines, 'dog_manifest')).slice(1);
  const bytes = new TextEncoder().encode(manifest.join('\n'));
  assert.ok(await crypto.subtle.verify('Ed25519', key, unb64(sig), bytes), 'the signature is not over the manifest');

  assert.ok((await checkBrainl(lines)).ok, 'a file straight out of a signing export does not verify');
  sql.close();
});

test('AN EDIT THAT RECOMPUTES THE MANIFEST STILL DOES NOT OPEN', async () => {
  // This is the whole reason the signature is there. The checksums stop damage; anybody with a text
  // editor can change a row and recompute a SHA-256, and the file then passes every integrity check
  // in it. Only a key they do not have stops that.
  const { k, sql } = await filled();
  const lines = value<string[]>(await k.export());

  const at = rowIn(lines, 'entry', 'Halden');
  const forged = reseal([...lines.slice(0, at), lines[at]!.replace('48000', '4800'), ...lines.slice(at + 1)]);

  assert.equal((await checkBrainl(forged)).ok, false, 'a re-sealed forgery opened');
  const out = (await checkBrainl(forged)) as { refusal: { code: string; fix: string } };
  assert.equal(out.refusal.code, 'SIGNATURE_INVALID');

  // AND SIGNING IT WITH ANOTHER KEY DOES NOT HELP, which is what makes the claim "produced by that
  // instance" rather than "produced by somebody".
  const elsewhere = await signBrainl(forged, testSigner());
  const other = (await checkBrainl(elsewhere)) as { ok: boolean };
  assert.equal(other.ok, true, 'a file signed by a key it carries should verify — origin is --key’s job');
  sql.close();
});

test('AND A FILE WITH NO SIGNATURE IS NOT IMPORTED', async () => {
  // `41 §5.11` step 3: no row is `SIGNATURE_INVALID`, not `unsigned`. An importer that accepted
  // unsigned files would accept every forgery, because stripping a signature is one line of `grep`.
  const sql = openSqlite();
  const unsigned = await openRecord(sql, fixedClock(NOW));
  assert.ok((await unsigned.install([OBLIGATIONS])).ok);
  const lines = value<string[]>(await unsigned.export());

  const out = await checkBrainl(lines);
  assert.equal(out.ok, false, 'a file from a record with no signing key imported anyway');
  assert.equal(out.ok === false ? out.refusal.code : '', 'SIGNATURE_INVALID');
  assert.match(out.ok === false ? out.refusal.fix : '', /no signature/);
  sql.close();
});

test('AN INTEGRITY REFUSAL NAMES THE LINE OF THE FILE IT IS ABOUT', async () => {
  // A `.brainl` is thousands of lines and these refusals used to name none of them. The sentence
  // already carried the table (`entry does not match the checksum`), so the fact was there and only
  // a caller reading English could get at it. `40 §6` specifies `dog_manifest.<table>` and
  // `dog_sig.<part>` for exactly this, and nothing had ever produced either, because the runner that
  // would have driven the fixture does not exist. Where a fault is the whole file rather than a line
  // in it there is still no `at`, and the two cases below that carry none are the reason to check.
  const { k, sql } = await filled();
  const lines = value<string[]>(await k.export());
  const refusal = async (ls: string[]) => ((await checkBrainl(ls)) as { refusal: { code: string; at?: string } }).refusal;

  // A ROW EDITED: the table is in scope at the hash comparison, so the address is too.
  const row = rowIn(lines, 'entry', 'Halden');
  const edited = [...lines.slice(0, row), lines[row]!.replace('48000', '4800'), ...lines.slice(row + 1)];
  assert.deepEqual(await refusal(edited), {
    ...(await refusal(edited)),
    code: 'CHECKSUM_MISMATCH',
    at: 'dog_manifest.entry',
  });

  // A TABLE REMOVED, and A TABLE THE MANIFEST DOES NOT LIST: the other two arms of the same loop.
  const [from, to] = span(lines, 'entry');
  assert.equal((await refusal([...lines.slice(0, from), ...lines.slice(to)])).at, 'dog_manifest.entry');
  assert.equal((await refusal([...lines, '#table nowhere id,name', '["x","y"]'])).at, 'dog_manifest.nowhere');

  // AND THE COUNT BESIDE THE HASH, which is the same table by another route.
  const claim = rowIn(lines, 'dog_manifest', '"entry"');
  const [name, rows, sha] = JSON.parse(lines[claim]!) as [string, number, string];
  const lying = [...lines];
  lying[claim] = JSON.stringify([name, rows + 1, sha]);
  assert.equal((await refusal(lying)).at, 'dog_manifest.entry');

  // NO MANIFEST AT ALL HAS NOWHERE TO POINT. There is no table named and no manifest to name it in,
  // and inventing `dog_manifest.entry` here would send a person to a line that is not in the file.
  const [mfrom, mto] = span(lines, 'dog_manifest');
  const bare = await refusal([...lines.slice(0, mfrom), ...lines.slice(mto)]);
  assert.equal(bare.code, 'CHECKSUM_MISMATCH');
  assert.equal(bare.at, undefined, 'a file with no manifest was given a manifest address');

  // AND THE HEADER LINE IS AN ADDRESS LIKE ANY OTHER. `#dogl` is a header of the same kind as
  // `#table`, so the two refusals that are about it name it rather than naming the record, which is
  // where the file was going and not what is wrong with it.
  assert.deepEqual(
    [(await refusal(['<!doctype html>'])).code, (await refusal(['<!doctype html>'])).at],
    ['FILE_MALFORMED', 'dogl'],
  );
  assert.equal((await refusal(['#dogl nine', ...lines.slice(1)])).at, 'dogl');
  const future = await refusal(['#dogl 9', ...lines.slice(1)]);
  assert.deepEqual([future.code, future.at], ['FORMAT_NEWER_THAN_READER', 'dogl']);

  sql.close();
});

test('AND A SIGNATURE REFUSAL NAMES THE PART OF dog_sig THAT IS WRONG', async () => {
  // Four faults live in one line and they are four repairs: re-export, deploy a build that knows the
  // algorithm, fix a header somebody edited, get another copy. Naming `dog_sig` alone would be true
  // and useless; the part is what tells them apart.
  const { k, sql } = await filled();
  const lines = value<string[]>(await k.export());
  const at = span(lines, 'dog_sig')[0] + 1;
  const row = JSON.parse(lines[at]!) as [string, string, string, string];
  const swap = (next: [string, string, string, string]) => [...lines.slice(0, at), JSON.stringify(next), ...lines.slice(at + 1)];
  const where = async (ls: string[]) => ((await checkBrainl(ls)) as { refusal: { at?: string } }).refusal.at;

  assert.equal(await where(swap([row[0], '0'.repeat(16), row[2], row[3]])), 'dog_sig.key_id');
  assert.equal(await where(swap(['rsa', row[1], row[2], row[3]])), 'dog_sig.alg');

  // THE KEY ITSELF, and the id has to be recomputed to match it or the id check answers first,
  // which is the order the file wants, and the reason this case needs building rather than asserting.
  const notAKey = 'bm90LWEta2V5';
  assert.equal(await where(swap([row[0], await keyIdOf(unb64(notAKey)), notAKey, row[3]])), 'dog_sig.public_key');

  assert.equal(await where(swap([row[0], row[1], row[2], b64url(new Uint8Array(64))])), 'dog_sig.sig');

  // A MISSING OR DOUBLED ROW IS THE ROW, not a part of it: there is no one part to blame.
  assert.equal(await where([...lines, lines[at]!]), 'dog_sig');

  sql.close();
});

test('THE HEADER OF A SIGNATURE IS CHECKED, not taken', async () => {
  const { k, sql } = await filled();
  const lines = value<string[]>(await k.export());
  const at = span(lines, 'dog_sig')[0] + 1;
  const row = JSON.parse(lines[at]!) as [string, string, string, string, string];

  const swap = (next: [string, string, string, string, string]) => [
    ...lines.slice(0, at),
    JSON.stringify(next),
    ...lines.slice(at + 1),
  ];
  const code = async (ls: string[]) => ((await checkBrainl(ls)) as { ok: boolean; refusal?: { code: string } }).refusal?.code;

  // A KEY ID THAT IS NOT THE ID OF THE KEY BESIDE IT. Without recomputing it, the field is a claim
  // about a key nobody checked — and `braindog verify --key` compares against exactly that field.
  assert.equal(await code(swap([row[0], '0'.repeat(16), row[2], row[3], row[4]])), 'SIGNATURE_INVALID');

  // ANOTHER ALGORITHM. The column has a CHECK for one value; a file is not the column.
  assert.equal(await code(swap(['rsa', row[1], row[2], row[3], row[4]])), 'SIGNATURE_INVALID');

  // A KEY THAT IS NOT A KEY, which is an exception from `importKey` if nothing catches it.
  assert.equal(await code(swap([row[0], row[1], 'bm90LWEta2V5', row[3], row[4]])), 'SIGNATURE_INVALID');

  // AND TWO SIGNATURES ARE NOT ONE. Appending a second is how somebody adds a key they hold.
  assert.equal(await code([...lines, lines[at]!]), 'SIGNATURE_INVALID');
  sql.close();
});

test('`dog_meta.keys` IS RECOMPUTED ON IMPORT, because a header row about the vault is not identity', async () => {
  /**
   * THE HEADER ALWAYS TRAVELS AND THE VAULT DOES NOT, so one row of the header was arriving as a
   * confident lie.
   *
   * `dog_meta` is the record's identity and is deliberately adopted whole: opening a file into an
   * empty record means becoming that record, and skipping the header left a record that could not
   * say its own name. `keys` was added to that table to answer a real question — a `vault_key` row
   * travels SEALED, so "no keys" and "keys I cannot open" look alike from outside — and it is not
   * identity. It is a count of rows in another table, and `vault_key` is in `NEEDS_IDENTITY`, so a
   * `sections: ['data']` file carries the claim and not the thing claimed.
   *
   * The result was worse than the silence it replaced: a fresh record with an empty vault, saying
   * it holds three keys. A reader who believes it seals a grant against a key that is not there.
   *
   * RECOMPUTED RATHER THAN SKIPPED, because an absent row is ambiguous between "this build never
   * wrote one" and "there are none", and the whole point of the row is to tell those apart. The
   * target's own `vault_key` is the only thing that knows, and it is known by the end of the
   * transaction whether the file carried keys or not.
   */
  const source = await filled();
  for (const purpose of ['connector', 'record', 'signing'])
    source.sql.exec(
      "INSERT OR REPLACE INTO vault_key (purpose, wrapped, nonce, wrapped_by, kek_id, salt, rewrapped_at) VALUES (?, 'x', 'y', 'kek', 'k1', NULL, NULL)",
      purpose,
    );
  source.sql.exec("INSERT OR REPLACE INTO dog_meta (key, value) VALUES ('keys', 'connector,record,signing')");
  const lines = value<string[]>(await source.k.export({ sections: ['data'] }));
  assert.ok(
    lines.some((l) => l.includes('"keys"') && l.includes('connector,record,signing')),
    'the claim did not travel, so this test is about nothing',
  );

  const sql = openSqlite();
  const target = await openRecord(sql, fixedClock(NOW), { sign: SIGNER });
  assert.ok(((await target.import(lines)) as { ok: boolean }).ok, 'the import was refused');

  assert.equal(sql.one<{ n: number }>('SELECT count(*) AS n FROM vault_key')?.n, 0, 'the vault travelled after all');
  assert.equal(
    sql.one<{ value: string }>("SELECT value FROM dog_meta WHERE key = 'keys'")?.value,
    'none',
    'a record with an empty vault says it holds three keys',
  );

  /* AND THE IDENTITY IS STILL ADOPTED, which is the thing this must not break. */
  assert.equal(
    sql.one<{ value: string }>("SELECT value FROM dog_meta WHERE key = 'record_slug'")?.value,
    source.sql.one<{ value: string }>("SELECT value FROM dog_meta WHERE key = 'record_slug'")?.value,
  );
  sql.close();
  source.sql.close();
});

test('AND A FILE THAT DOES CARRY THE VAULT IS BELIEVED, because then the claim and the thing agree', async () => {
  /* The recompute reads the target after the import, so a full export puts the rows in and the row
     counts them. Asserting it separately, because a fix that answered `none` unconditionally would
     pass the test above and lose the answer the row exists to give. */
  const source = await filled();
  for (const purpose of ['record', 'signing'])
    source.sql.exec(
      "INSERT OR REPLACE INTO vault_key (purpose, wrapped, nonce, wrapped_by, kek_id, salt, rewrapped_at) VALUES (?, 'x', 'y', 'kek', 'k1', NULL, NULL)",
      purpose,
    );
  /* THE ROW IS `provision`'s TO WRITE and this reader's only to correct, so the source carries one:
     a record made by any current build has it, and a file from an older one is the case the
     round-trip test above covers. */
  source.sql.exec("INSERT OR REPLACE INTO dog_meta (key, value) VALUES ('keys', 'record')");
  const lines = value<string[]>(await source.k.export());

  const sql = openSqlite();
  const target = await openRecord(sql, fixedClock(NOW), { sign: SIGNER });
  assert.ok(((await target.import(lines)) as { ok: boolean }).ok, 'the import was refused');
  assert.equal(sql.one<{ n: number }>('SELECT count(*) AS n FROM vault_key')?.n, 2, 'the vault did not travel');
  assert.equal(sql.one<{ value: string }>("SELECT value FROM dog_meta WHERE key = 'keys'")?.value, 'record,signing');
  sql.close();
  source.sql.close();
});

test('A FILE WRITTEN BEFORE MIGRATION 22 LANDS WITH THE REGISTER THAT KEEPS A RUN’S APP', async () => {
  /* The file's live kernel row is migration 2's, as a .brain written before 22 carries it, and the target's ledger
     says 22 has run, so the import is the only thing that can seat the newer body. */
  const source = await filled();
  source.sql.exec("DELETE FROM declaration WHERE id = 'register.session' AND superseded_at IS NULL");
  source.sql.exec("UPDATE declaration SET superseded_at = NULL WHERE id = 'register.session'");
  const lines = value<string[]>(await source.k.export());

  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW), { sign: SIGNER });
  value(await k.import(lines));
  assert.deepEqual(
    sql.all<{ version: number; live: number }>("SELECT version, superseded_at IS NULL AS live FROM declaration WHERE id = 'register.session' ORDER BY version").map((r) => ({ ...r })),
    [{ version: 1, live: 0 }, { version: 2, live: 1 }],
  );
  assert.ok(k.register('session')?.fields.some((f) => f.id === 'client'), 'the imported record keeps no app');
  source.sql.close();
  sql.close();
});
