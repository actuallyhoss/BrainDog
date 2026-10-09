/**
 * `migration-lock`, asked of planted trees and of this one.
 *
 *   node --test tools/gates/test/migration-lock.test.mjs
 *
 * EVERY RULE IS A TREE OF ITS OWN, because `negative/migration-lock/` holds one (a byte edited in an applied migration)
 * and a fixture that seeds two faults cannot say which one turned it red. Each tree here is two or three migrations and
 * the lock that was written for them, then one thing done to it.
 *
 * THE WHITESPACE CASES ARE THE RUNNER'S RULE, NOT THIS GATE'S: a trailing space or a CRLF moves no checksum, because
 * `canon` strips them before `migrate.ts` hashes, and a space inside a line does. The gate imports `checksum`, so if
 * these ever disagree with `migrate.ts` it is because `migrate.ts` changed, and these say so.
 *
 * SPAWNED, NOT CALLED, because the exit code is what `run.mjs` and CI read, and a migration file is imported once per
 * process, so a tree edited after a first run would be read from the module cache.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { MIGRATIONS, checksum } from '../../../packages/kernel/src/migrate.ts';
import { LOCK, MIGRATIONS_DIR, lockText } from '../migration-lock.mjs';

const gates = join(import.meta.dirname, '..');
const repo = join(gates, '..', '..');
const GATE = join(gates, 'migration-lock.mjs');

const run = (root) => {
  const r = spawnSync(process.execPath, [GATE, root], { encoding: 'utf8', env: { ...process.env, BRAINDOG_GATE_ROOT: '' } });
  return { status: r.status, said: `${r.stdout}${r.stderr}` };
};

const START = '\nCREATE TABLE seeded (id TEXT PRIMARY KEY);\n';
const NEXT = '\nALTER TABLE seeded ADD COLUMN name TEXT;\n';
const RECEIPT = { at: '2026-10-09T03:20:00.000Z', records: 2, rows: 41, pass: true };

/**
 * A root holding `files` (name to SQL text) as migrations, and a lock written over `locked` (name to SQL text and how it
 * stands), removed when the test is done.
 */
async function tree(t, files, locked) {
  const root = mkdtempSync(join(tmpdir(), 'braindog-migration-lock-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dir = join(root, MIGRATIONS_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(root, 'package.json'), '{ "type": "module" }\n');
  for (const [file, sql] of Object.entries(files)) writeFileSync(join(dir, file), `/** A planted migration. */\nexport default ${JSON.stringify(sql)};\n`);
  const lock = {};
  for (const [file, { sql, applied = true, rehearsed = null }] of Object.entries(locked)) lock[file] = { checksum: await checksum(sql), applied, rehearsed };
  writeFileSync(join(root, LOCK), lockText(lock));
  return root;
}

const both = { '0001_start.ts': { sql: START }, '0002_next.ts': { sql: NEXT } };

test('THIS TREE IS GREEN, AND ITS LOCK IS THE RUNNER\'S OWN: one line per migration, each the checksum migrate.ts holds', async () => {
  const r = run(repo);
  assert.equal(r.status, 0, r.said);
  const text = readFileSync(join(repo, LOCK), 'utf8');
  const lock = JSON.parse(text);
  const files = Object.keys(lock);
  assert.equal(files.length, MIGRATIONS.length, 'a migration the runner holds is not in the lock, or the lock holds one it does not');
  for (const m of MIGRATIONS) {
    const file = files[m.version - 1];
    assert.equal(file, `${String(m.version).padStart(4, '0')}_${m.slug}.ts`);
    assert.equal(lock[file].checksum, await checksum(m.sql), `${file} is locked at a checksum the runner does not compute`);
  }
  assert.equal(text, lockText(lock), 'the lock is not written one line per migration');
});

test('THE PLANTED TREE IS RED ON ONE LINE, the edited file', () => {
  const r = run(join(gates, 'negative', 'migration-lock'));
  assert.equal(r.status, 1, r.said);
  assert.equal(r.said.split('\n').filter((l) => l.includes('0002_seeded.ts')).length, 1, r.said);
  assert.match(r.said, /is not the text the lock holds/);
  assert.match(r.said, /\b1 finding\(s\)/);
});

test('A TRAILING SPACE AND A CRLF MOVE NOTHING, and a space inside a line does, as migrate.ts reads it', async (t) => {
  const trailing = await tree(t, { '0001_start.ts': START, '0002_next.ts': NEXT.replace('TEXT;', 'TEXT;   \t').replaceAll('\n', '\r\n') }, both);
  assert.equal(run(trailing).status, 0, run(trailing).said);

  const inside = await tree(t, { '0001_start.ts': START, '0002_next.ts': NEXT.replace('ADD COLUMN', 'ADD  COLUMN') }, both);
  const r = run(inside);
  assert.equal(r.status, 1, r.said);
  assert.match(r.said, /0002_next\.ts is not the text the lock holds/);
  assert.doesNotMatch(r.said, /0001_start\.ts/);

  /* NO MORE AND NO LESS: the file around the SQL is not what a record ran, so its spacing moves nothing, and a line's
     indent or a blank line inside the SQL is what it ran, so each moves it. */
  const around = await tree(t, { '0001_start.ts': START, '0002_next.ts': NEXT }, both);
  writeFileSync(join(around, MIGRATIONS_DIR, '0002_next.ts'), `/**  A planted   migration,\n   respaced. */\n\nexport  default  ${JSON.stringify(NEXT)} ;\n`);
  assert.equal(run(around).status, 0, run(around).said);
  for (const sql of [NEXT.replace('ALTER', '  ALTER'), NEXT.replace('ALTER', '\tALTER'), `${NEXT}\n`]) {
    const moved = await tree(t, { '0001_start.ts': START, '0002_next.ts': sql }, both);
    assert.match(run(moved).said, /0002_next\.ts is not the text the lock holds/, JSON.stringify(sql));
  }
});

test('A NUMBER SKIPPED IS RED, NAMING THE NUMBER', async (t) => {
  const root = await tree(t, { '0001_start.ts': START, '0003_next.ts': NEXT }, { '0001_start.ts': { sql: START }, '0003_next.ts': { sql: NEXT } });
  const r = run(root);
  assert.equal(r.status, 1, r.said);
  assert.match(r.said, /number 0002 is skipped/);
  assert.match(r.said, /\b1 finding\(s\)/);
});

test('A NUMBER HELD TWICE IS RED, NAMING BOTH FILES', async (t) => {
  const root = await tree(t, { '0001_start.ts': START, '0002_next.ts': NEXT, '0002_other.ts': NEXT }, { ...both, '0002_other.ts': { sql: NEXT } });
  const r = run(root);
  assert.equal(r.status, 1, r.said);
  assert.match(r.said, /number 0002 is held twice, by 0002_next\.ts and 0002_other\.ts/);
});

test('A NEW FILE NOT IN THE LOCK IS RED, with the line to add and its checksum', async (t) => {
  const root = await tree(t, { '0001_start.ts': START, '0002_next.ts': NEXT }, { '0001_start.ts': { sql: START } });
  const r = run(root);
  assert.equal(r.status, 1, r.said);
  assert.match(r.said, /0002_next\.ts is not in the lock/);
  assert.ok(r.said.includes(`"checksum": "${await checksum(NEXT)}", "applied": false, "rehearsed": null`), r.said);
});

test('A LOCKED FILE THAT IS GONE IS RED', async (t) => {
  const root = await tree(t, { '0001_start.ts': START }, both);
  const r = run(root);
  assert.equal(r.status, 1, r.said);
  assert.match(r.said, /0002_next\.ts is in the lock and not on disk/);
});

test('A NEW MIGRATION SHIPS ONLY WITH A PASSING RECEIPT: none is red, a FAIL is red, a PASS is green', async (t) => {
  const none = await tree(t, { '0001_start.ts': START, '0002_next.ts': NEXT }, { ...both, '0002_next.ts': { sql: NEXT, applied: false } });
  const r = run(none);
  assert.equal(r.status, 1, r.said);
  assert.match(r.said, /0002_next\.ts has no passing rehearsal in the lock/);

  const failed = await tree(t, { '0001_start.ts': START, '0002_next.ts': NEXT }, { ...both, '0002_next.ts': { sql: NEXT, applied: false, rehearsed: { ...RECEIPT, pass: false } } });
  assert.equal(run(failed).status, 1);

  const passed = await tree(t, { '0001_start.ts': START, '0002_next.ts': NEXT }, { ...both, '0002_next.ts': { sql: NEXT, applied: false, rehearsed: RECEIPT } });
  const g = run(passed);
  assert.equal(g.status, 0, g.said);
});

test('A ROOT WITH NO MIGRATION HAS NOT PASSED: it is red, never a skip', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'braindog-migration-lock-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.equal(run(root).status, 1);
});

test("THE OWNER'S WAIVER LETS A NEW MIGRATION SHIP, and only in its full shape", async () => {
  const { waived } = await import('../migration-lock.mjs');
  assert.equal(waived({ at: '2026-10-09', by: 'owner', why: 'no copy could be had' }), true);
  assert.equal(waived({ at: '2026-10-09', by: 'agent', why: 'no copy could be had' }), false, 'only the owner waives');
  assert.equal(waived({ at: '2026-10-09', by: 'owner', why: '  ' }), false, 'a waiver says why');
  assert.equal(waived({ at: 'yesterday', by: 'owner', why: 'x' }), false, 'a waiver has a date');
  assert.equal(waived(null), false);
  const lock = { '0001_a.ts': { checksum: 'a'.repeat(64), applied: false, rehearsed: null, waived: { at: '2026-10-09', by: 'owner', why: 'x' } } };
  assert.match(lockText(lock), /"waived":\{"at":"2026-10-09","by":"owner","why":"x"\}/, 'the lock keeps the waiver when rewritten');
});
