/**
 * `audit-append-only`: a statement that rewrites a line of the log is red unless the list holds it, with its reason.
 *
 *   node --test tools/gates/test/audit-append-only.test.mjs
 *
 * THE COMMITTED NEGATIVE PLANTS ONE `UPDATE event` (`negative/audit-append-only/`), beside the forms that are not one:
 * a migration, a comment, a read and two other tables. The list is asked of `verdict` here, so a seventh statement, a
 * second copy of one on the list and an entry whose statement went are each red by themselves.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { ALLOWED, inScope, rewritesIn, verdict } from '../audit-append-only.mjs';

const gates = join(import.meta.dirname, '..');
const planted = join(gates, 'negative', 'audit-append-only');
const BOOK = JSON.parse(readFileSync(join(gates, 'ledger.json'), 'utf8'));

function run(at) {
  const r = spawnSync(process.execPath, [join(gates, 'audit-append-only.mjs')], { encoding: 'utf8', env: { ...process.env, BRAINDOG_GATE_ROOT: at } });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

/** The list as the repository finds it: each entry's statement, in its file, at a line. */
const asFound = () => ALLOWED.map((a, i) => ({ file: a.file, line: i + 1, text: `${a.statement} WHERE id = ?` }));

test('the planted tree is red on its one statement, once, and on nothing else in it', () => {
  const r = run(planted);
  assert.equal(r.status, 1, r.out);
  const seeded = readFileSync(join(planted, 'expect.txt'), 'utf8').trim();
  const named = r.out.split('\n').filter((l) => /^ {2}\S+:\d+ {2}/u.test(l));
  assert.deepEqual(named.map((l) => l.trim().split('  ')[0]), [`${seeded}:4`]);
  assert.match(r.out, /rewrites the audit log \("UPDATE event"\)/u);
  assert.match(r.out, /\b1 finding\(s\)/u);
});

test('the repository is green, and finds exactly what the list holds', () => {
  const r = run(join(gates, '..', '..'));
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, new RegExp(`\\b${ALLOWED.length} statement\\(s\\) that rewrite the log, each on the list with its reason, 0 finding\\(s\\)`, 'u'));
});

test('every entry names its file, how its statement starts and why, and the ledger holds the list at its size', () => {
  for (const a of ALLOWED) {
    assert.ok(inScope(a.file), a.file);
    assert.match(a.statement, /^(?:UPDATE|DELETE FROM|REPLACE INTO) event\b/u, a.statement);
    assert.ok(a.why.trim().length > 0, `${a.file}: a reason`);
    assert.doesNotMatch(a.why, /\u2014/u, `${a.file}: no long dash`);
  }
  assert.equal(BOOK.held['audit-append-only.ALLOWED'].lines.at(-1).count, ALLOWED.length);
});

test('a seventh statement is red, and so is a second copy of one the list holds', () => {
  assert.deepEqual(verdict(asFound(), ALLOWED), []);
  const seventh = [...asFound(), { file: 'packages/kernel/src/undo.ts', line: 9, text: 'DELETE FROM event WHERE batch = ?' }];
  const [finding, ...rest] = verdict(seventh, ALLOWED);
  assert.deepEqual(rest, []);
  assert.match(finding, /^ {2}packages\/kernel\/src\/undo\.ts:9 {2}rewrites the audit log \("DELETE FROM event"\)/u);
  const twice = [...asFound(), { ...asFound()[0], line: 400 }];
  assert.equal(verdict(twice, ALLOWED).length, 1);
});

test('an entry whose statement went is red until it comes off the list', () => {
  const found = asFound().slice(1);
  const findings = verdict(found, ALLOWED);
  assert.equal(findings.length, 1);
  assert.match(findings[0], new RegExp(`allows ".*" in ${ALLOWED[0].file.replaceAll('.', '\\.')}, and it is gone`, 'u'));
});

test('a statement is a string on the syntax tree: a comment is not, and other tables are not', () => {
  const at = (src, rel = 'packages/kernel/src/x.ts') => rewritesIn(src, rel).map((h) => h.text);
  assert.deepEqual(at("sql.exec('UPDATE event SET note = ? WHERE id = ?', n, id);"), ['UPDATE event SET note = ? WHERE id = ?']);
  assert.deepEqual(at('sql.exec(`\n  delete   from "event"\n  WHERE id = ${id}`);'), ['delete from "event" WHERE id = ?']);
  assert.deepEqual(at("db.run('INSERT OR REPLACE INTO event (id) VALUES (?)', id);"), ['REPLACE INTO event (id) VALUES (?)']);
  assert.deepEqual(at("q('UPDATE OR IGNORE event SET batch = ?');"), ['UPDATE OR IGNORE event SET batch = ?']);
  assert.deepEqual(at('/* never UPDATE event here */\n// nor DELETE FROM event\nconst x = 1;'), []);
  assert.deepEqual(at("q('UPDATE event_kind SET x = ?'); q('DELETE FROM events'); q('SELECT * FROM event');"), []);
  assert.deepEqual(at('DELETE FROM event WHERE ts < ?;\n', 'packages/kernel/src/sweep.sql'), ['DELETE FROM event WHERE ts < ?;']);
});

test('what is read is a package\'s own source, outside its migrations', () => {
  assert.ok(inScope('packages/kernel/src/erase.ts'));
  assert.ok(inScope('packages/record/src/methods/index.ts'));
  assert.ok(!inScope('packages/kernel/src/migrations/0036_runs_before.ts'));
  assert.ok(!inScope('packages/kernel/test/erase.test.ts'));
  assert.ok(!inScope('apps/worker/src/index.ts'));
  assert.ok(!inScope('tools/gates/negative/audit-append-only/packages/kernel/src/retitle.ts'));
});
