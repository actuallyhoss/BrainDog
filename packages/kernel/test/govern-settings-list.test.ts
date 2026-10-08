/**
 * A settings value may be a list of text, checked as the setting's type says (REC-A06 step 3, the kernel's half).
 *
 * BEFORE: `propose` took text, a number, true or false, or null, so a `list` setting (the words a script matches a bank
 * line against) could be set on the settings screen and never proposed: an arrangement carrying the owner's list was
 * refused at the key, and asked as ten questions instead of one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { jcs, openRecord, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 9, 9, 12);

const CONFIG = {
  words: { type: 'list', max: 3 },
  heading: { type: 'text', default: 'Sample invoices' },
  cadence: { type: 'enum', values: ['weekly', 'monthly'], default: 'monthly' },
};

async function withPack(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  k.rememberPack({
    id: 'sample-ledger',
    version: '1.0.0',
    source: 'local',
    ref: null,
    manifest: jcs({ pack: 'sample-ledger', version: '1.0.0', config: CONFIG }),
    checksum: 'not-a-real-checksum',
  });
  return { k, sql };
}

type Answer = { ok: boolean; value?: { id: string }; refusal?: { code: string; fix: string; at?: string } };
const propose = (k: Kernel, pack: string, values: Record<string, unknown>, cause: string): Answer =>
  k.propose({ question: 'Change the settings?', body_kind: 'settings', body: { pack, values }, cause }, 'S1') as Answer;

test('A LIST SETTING TAKES LINES OF TEXT, and the question holds them as sent', async () => {
  const { k, sql } = await withPack();
  const out = propose(k, 'sample-ledger', { words: ['rent', 'rates'] }, 'words-1');
  assert.ok(out.ok, JSON.stringify(out));
  const body = JSON.parse(sql.one<{ body: string }>('SELECT body FROM suggestion WHERE id = ?', out.value!.id)!.body) as { values: unknown };
  assert.deepEqual(body.values, { words: ['rent', 'rates'] });
  sql.close();
});

test('A LIST IS CHECKED AS THE SETTING SAYS: lines of text, none blank, no more than it holds', async () => {
  const { k, sql } = await withPack();
  const at = (values: Record<string, unknown>, n: number) => propose(k, 'sample-ledger', values, `bad-${n}`).refusal;
  assert.equal(at({ words: 'rent' }, 1)?.at, 'body.values.words');
  assert.equal(at({ words: ['rent', 4] }, 2)?.at, 'body.values.words[1]');
  assert.equal(at({ words: ['rent', '  '] }, 3)?.at, 'body.values.words[1]');
  assert.equal(at({ words: ['a', 'b', 'c', 'd'] }, 4)?.code, 'OUT_OF_BOUNDS');
  /* AND A SETTING THAT IS NOT A LIST TAKES NONE: a text is one line, an enum one of its values. */
  assert.equal(at({ heading: ['Sample invoices'] }, 5)?.at, 'body.values.heading');
  assert.equal(at({ heading: [1, 2] }, 7)?.at, 'body.values.heading');
  assert.equal(at({ words: [1, 2] }, 8)?.at, 'body.values.words[0]');
  assert.equal(at({ cadence: 'daily' }, 6)?.code, 'ENUM_VALUE_UNKNOWN');
  assert.ok(propose(k, 'sample-ledger', { cadence: 'weekly', heading: null }, 'good').ok);
  assert.equal(sql.one<{ n: number }>("SELECT count(*) AS n FROM suggestion WHERE body_kind = 'settings'")!.n, 1);
  sql.close();
});

test('A PACK NOT YET INSTALLED HOLDS THE SHAPE ONLY, and a list of text is one of the shapes', async () => {
  const { k, sql } = await withPack();
  assert.ok(propose(k, 'usecase-student', { words: ['rent'] }, 'later-1').ok, 'a list for a pack an arrangement installs was refused');
  const bad = (v: unknown, n: number) => propose(k, 'usecase-student', { words: v }, `later-bad-${n}`).refusal;
  assert.equal(bad([], 1)?.at, 'body.values.words');
  assert.equal(bad([1], 2)?.at, 'body.values.words');
  assert.equal(bad({ a: 'b' }, 3)?.fix, 'The setting words takes text, a number, true or false, a list of text, or null for its default.');
  sql.close();
});
