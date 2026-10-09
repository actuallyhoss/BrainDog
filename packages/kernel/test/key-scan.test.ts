/**
 * The nightly walk for a key written in plain text (`key-scan.ts`, AGT-D01).
 *
 * The keys are planted straight into the tables, because the write path refuses them, which is the point: the walk
 * is for what a record already holds. Each planted key is built at run time from its issuer's shape, and no assertion
 * may find it in anything the walk keeps or says.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BUILT_IN_FIGURES } from '../src/built-in-figures.ts';
import { KEYS_IN_TEXT, KEY_SCAN_META, KEY_SCAN_NIGHT, keysInText, readKeysInText, scanKeys } from '../src/key-scan.ts';
import { openRecord } from '../src/index.ts';
import { figureLists } from '../src/money-figures.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 3);
const DAY = 86_400_000;
const KEY = `ghp_${'A1b2C3d4'.repeat(5)}`;
const SLACK = `xoxb-${'1234567890'.repeat(2)}-Zz`;

let n = 0;
function plant(sql: NodeSql, register: string, fields: unknown, seq: number | null = null): string {
  const id = `01KSCAN${String(++n).padStart(19, '0')}`;
  const at = new Date(NOW).toISOString();
  sql.exec(
    'INSERT INTO entry (id, register, seq, fields, version, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)',
    id,
    register,
    seq,
    JSON.stringify(fields),
    at,
    at,
  );
  return id;
}

function many(sql: NodeSql, count: number): void {
  for (let i = 1; i <= count; i++) plant(sql, 'diary', { title: `Day ${i}`, body: 'Walked the dog. Commit 4f9a2c1e8b7d6a5f4e3d2c1b0a9f8e7d6c5b4a39.' }, i);
}

async function record(): Promise<NodeSql> {
  const sql = openSqlite();
  await openRecord(sql, fixedClock(NOW));
  return sql;
}

const meta = (sql: NodeSql): string => sql.one<{ value: string }>('SELECT value FROM dog_meta WHERE key = ?', KEY_SCAN_META)?.value ?? '';
const cursor = (sql: NodeSql): { in: string; after: number; passes: number } => JSON.parse(meta(sql));

test('A PLANTED KEY IS FOUND IN A ROW, A NOTE AND A QUESTION, and the walk never keeps or says what it found', async () => {
  const sql = await record();
  many(sql, 3);
  plant(sql, 'credentials', { label: 'Deploy token', where: KEY }, 18);
  const handed = plant(sql, 'session', { name: 'Builder', handoff: { step: `use ${SLACK} to post` } }, 4);
  sql.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, note) VALUES ('01KSCANNOTE0000000000000001', ?, 'p_1', 'note', ?, 'entry', ?)",
    new Date(NOW).toISOString(),
    `entry:${handed}`,
    `the token is ${KEY}`,
  );
  sql.exec(
    "INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at) VALUES ('SG7', 'options', ?, 'open', 'slash', ?)",
    JSON.stringify({ options: [{ id: 'yes', label: 'Use it', because: `it is ${KEY}` }] }),
    new Date(NOW).toISOString(),
  );

  const before = readKeysInText(sql, {}, KEYS_IN_TEXT);
  assert.ok(before.ok);
  assert.equal(before.value.value, null, 'a record not yet walked read as a record with no key in it');

  const night = scanKeys(sql, NOW);
  assert.equal(night.finished, true);
  assert.deepEqual(keysInText(sql), [
    { in: 'row', list: 'Credentials', number: 18 },
    { in: 'row', list: 'Agent runs', number: 4 },
    { in: 'note', list: 'Agent runs', number: 4 },
    { in: 'question', list: null, number: 7 },
  ]);
  const read = readKeysInText(sql, {}, KEYS_IN_TEXT);
  assert.ok(read.ok);
  assert.equal(read.value.value, 4);
  assert.equal(read.value.met, false);
  assert.equal(read.value.why, '4 places hold what looks like a key, the first in Credentials number 18');
  for (const said of [meta(sql), read.value.why, JSON.stringify(keysInText(sql))]) {
    assert.ok(!said.includes(KEY) && !said.includes(SLACK) && !said.includes('ghp_') && !said.includes('xoxb'), 'the walk printed the key');
    assert.ok(!said.includes('—'), 'an em dash in words a person reads');
  }
  assert.ok(!/01KSCAN/.test(read.value.why), 'the finding named a row by its id');
  sql.close();
});

test('THE FINDING CLEARS ONCE THE KEY IS MOVED, and a record with none reads nought after its first pass', async () => {
  const sql = await record();
  many(sql, 10);
  const id = plant(sql, 'credentials', { label: 'Deploy token', where: KEY }, 2);
  scanKeys(sql, NOW);
  assert.equal(keysInText(sql)?.length, 1);
  sql.exec('UPDATE entry SET fields = ? WHERE id = ?', JSON.stringify({ label: 'Deploy token', where: 'the vault' }), id);
  scanKeys(sql, NOW + DAY);
  const read = readKeysInText(sql, {}, KEYS_IN_TEXT);
  assert.ok(read.ok);
  assert.equal(read.value.value, 0);
  assert.equal(read.value.met, true);
  assert.equal(read.value.why, 'no text on this record holds a key');
  sql.close();
});

test('THE CURSOR MOVES 500 A NIGHT AND WRAPS: a record of 1,200 rows is covered in three nights', async () => {
  const sql = await record();
  many(sql, 1_199);
  plant(sql, 'credentials', { label: 'Last key', where: KEY }, 9);

  const one = scanKeys(sql, NOW);
  assert.deepEqual([one.read, one.finished], [KEY_SCAN_NIGHT, false]);
  assert.equal(keysInText(sql), null, 'a walk half done read as a record with no key in it');
  const two = scanKeys(sql, NOW + DAY);
  assert.deepEqual([two.read, two.finished], [500, false]);
  assert.equal(cursor(sql).in, 'row');
  const three = scanKeys(sql, NOW + 2 * DAY);
  assert.deepEqual([three.read, three.finished, three.found], [200, true, 1]);
  assert.deepEqual(keysInText(sql), [{ in: 'row', list: 'Credentials', number: 9 }], 'the 1,200th row was not reached');
  assert.deepEqual([cursor(sql).in, cursor(sql).after, cursor(sql).passes], ['row', 0, 1], 'the cursor did not wrap');

  /* THE NEXT NIGHT STARTS AGAIN AT THE FIRST ROW, and the finding stands until its row is read again. */
  const four = scanKeys(sql, NOW + 3 * DAY);
  assert.deepEqual([four.read, four.finished, four.found], [500, false, 1]);
  sql.close();
});

test('A ROW DELETED SINCE IT WAS FOUND LEAVES THE COUNT when the pass that did not see it ends', async () => {
  const sql = await record();
  const id = plant(sql, 'credentials', { label: 'Old key', where: KEY }, 3);
  scanKeys(sql, NOW);
  assert.equal(keysInText(sql)?.length, 1);
  sql.exec('UPDATE entry SET deleted_at = ? WHERE id = ?', new Date(NOW).toISOString(), id);
  scanKeys(sql, NOW + DAY);
  assert.deepEqual(keysInText(sql), []);
  sql.close();
});

test('THE CHECK IS THE WRITE PATH\'S: a key as an object\'s name is found, and ids, digests and links are not', async () => {
  const sql = await record();
  plant(sql, 'tools', { name: 'Hook', config: { [KEY]: 'x' } }, 1);
  plant(sql, 'tools', { name: 'Docs', url: 'https://example.com/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit', id: '01J9ZQ3XKT8M6Y4V2N0P5R7S9W' }, 2);
  scanKeys(sql, NOW);
  assert.deepEqual(keysInText(sql), [{ in: 'row', list: 'Tools', number: 1 }]);
  sql.close();
});

test('NO PIECE OF THE KEY IS KEPT OR SAID: not ten characters of it in a row', async () => {
  const sql = await record();
  plant(sql, 'credentials', { label: 'Deploy token', where: KEY }, 18);
  plant(sql, 'session', { name: 'Builder', handoff: { step: `use ${SLACK} to post` } }, 4);
  scanKeys(sql, NOW);
  const read = readKeysInText(sql, {}, KEYS_IN_TEXT);
  assert.ok(read.ok);
  for (const key of [KEY, SLACK])
    for (let i = 0; i + 10 <= key.length; i++) {
      const piece = key.slice(i, i + 10);
      for (const said of [meta(sql), read.value.why, JSON.stringify(keysInText(sql))]) assert.ok(!said.includes(piece), `the walk kept ${piece}`);
    }
  sql.close();
});

test('THE CURSOR SURVIVES A RECORD THAT SHRANK under it: the night ends the pass and the next finds a new key', async () => {
  const sql = await record();
  many(sql, 1_000);
  plant(sql, 'credentials', { label: 'Late key', where: KEY }, 7);
  scanKeys(sql, NOW);
  assert.deepEqual([cursor(sql).in, cursor(sql).after], ['row', 500]);
  /* THE PURGE TAKES EVERY ROW PAST THE FIRST 300, the cursor's own and the key's among them. */
  sql.exec('DELETE FROM entry WHERE rowid > 300');
  const two = scanKeys(sql, NOW + DAY);
  assert.deepEqual([two.read, two.finished, two.found], [0, true, 0]);
  assert.deepEqual(keysInText(sql), []);
  plant(sql, 'credentials', { label: 'New key', where: KEY }, 8);
  const three = scanKeys(sql, NOW + 2 * DAY);
  assert.deepEqual([three.read, three.found], [301, 1]);
  assert.deepEqual(keysInText(sql), [{ in: 'row', list: 'Credentials', number: 8 }]);
  sql.close();
});

test('A SEALED FIELD\'S GRANT IS NOT A KEY: the vault handle a key row holds is not counted', async () => {
  const sql = await record();
  plant(sql, 'credentials', { label: 'Deploy token', value: 'g_01J9ZQ3XKT8M6Y4V2N0P5R7S9W' }, 18);
  scanKeys(sql, NOW);
  assert.deepEqual(keysInText(sql), []);
  sql.close();
});

test('THE RECORD ANSWERS keys-in-text BY NAME, this declaration by its own reader, and only a reader of every list reads it', async () => {
  /* It must name the whole record, because its `why` names another list's row: named by no list, a member held to
     Projects would read where the record keeps a key in Credentials (`pages.ts` `mayRead`). */
  assert.deepEqual(BUILT_IN_FIGURES['keys-in-text'], KEYS_IN_TEXT);
  assert.deepEqual(figureLists(KEYS_IN_TEXT), ['*'], 'keys-in-text named no list, so a member held to one list reads it');
  /* AND THE RECORD'S OWN `metric` READS IT, as a page does, and not by refusing a source it does not know. */
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const before = k.metric(KEYS_IN_TEXT);
  assert.ok(before.ok, JSON.stringify(before));
  assert.equal(before.value.value, null, 'read nought before the first walk ended');
  plant(sql, 'credentials', { label: 'Deploy token', where: KEY }, 8);
  scanKeys(sql, NOW);
  const after = k.metric(KEYS_IN_TEXT);
  assert.ok(after.ok, JSON.stringify(after));
  assert.equal(after.value.value, 1);
  assert.equal(after.value.met, false);
  assert.ok(!JSON.stringify(after.value).includes(KEY.slice(4, 14)), 'the reading said a piece of the key');
  sql.close();
});
