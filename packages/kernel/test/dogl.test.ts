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
      { id: 'due', type: 'day', index: true },
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
  value(k.create('obligations', { what: 'Retainer, August', party: 'Pell & Vine', amount: { amount: 24_000, currency: 'GBP' }, state: 'paid' }, { actor: 'p_2' }));
  value(k.create('obligations', { what: 'Gone', party: 'Nobody' }, { actor: 'p_1' }));
  value(k.update('obligations', 'obligations#3', { deleted_at: '2026-09-05' }, { actor: 'p_1' }));
  value(k.update('obligations', 'obligations#1', { state: 'paid' }, { actor: 'rule:settle', note: 'Cleared on the statement' }));
  return { k, sql };
}

/* ── the file is stable ──────────────────────────────────────────────────── */

test('TWO EXPORTS OF AN UNCHANGED RECORD ARE THE SAME BYTES', async () => {
  // A timestamp in the file would mean "has anything changed since my last copy" needs a tool
  // instead of `diff`. When the file is signed, the time lives in the signature — where a time that
  // is about the ACT rather than the CONTENT belongs.
  const { k, sql } = await filled();
  const first = await k.export();
  const second = await k.export();
  assert.deepEqual(second, first);
  assert.ok(!first.join('\n').includes('exported_at'), 'the file carries a timestamp of its own making');
  sql.close();
});

test('and a write changes them, which is the other half of that being useful', async () => {
  const { k, sql } = await filled();
  const before = await k.export();
  value(k.create('obligations', { what: 'One more' }, { actor: 'p_1' }));
  assert.notDeepEqual(await k.export(), before);
  sql.close();
});

/* ── the file describes itself ───────────────────────────────────────────── */

test('A TABLE’S HASH IS CHECKABLE WITH sed AND sha256sum AND NOTHING ELSE', async () => {
  // The whole argument for lines over a zip of JSON: somebody who does not trust us can verify a
  // table without a tool of ours.
  const { k, sql } = await filled();
  const lines = await k.export();

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
  const lines = await k.export();
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
  const clean = await k.export({ sections: ['data'] });
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
  const first = await source.k.export();

  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const report = value<{ tables: number; rows: number }>(k.import(first));
  assert.ok(report.rows > 5, `only ${report.rows} rows arrived`);

  const second = await k.export();
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
  const lines = await source.k.export();

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
  const lines = await source.k.export();
  const target = await filled();

  const out = target.k.import(lines) as { ok: boolean; refusal?: { code: string; fix: string } };
  assert.equal(out.ok, false);
  assert.equal(out.refusal?.code, 'RECORD_NOT_EMPTY');
  assert.match(out.refusal?.fix ?? '', /decision per row/);
  assert.equal(target.k.count('obligations'), 2, 'a refused import wrote rows anyway');
  source.sql.close();
  target.sql.close();
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
  const lines = await k.export();

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
  const lines = await k.export();
  const named = new Set(lines.filter((l) => l.startsWith('#table ')).map((l) => l.slice(7).split(' ')[0]));
  const travelling = sql
    .all<{ table_name: string; section: string }>('SELECT table_name, section FROM dog_section')
    .filter((r) => (TRAVELS as readonly string[]).includes(r.section))
    .map((r) => r.table_name);
  for (const name of travelling) assert.ok(named.has(name), `${name} is sectioned to travel and is not in the file`);
  sql.close();
});
