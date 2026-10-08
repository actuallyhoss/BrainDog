/**
 * `one-clock`: a run's `last_seen` compared with the clock outside `presence.ts` is red; saying "8m ago" is not.
 *
 *   node --test tools/gates/test/one-clock.test.mjs
 *
 * THE COMMITTED NEGATIVE SEEDS ONE READER WITH ITS OWN FIFTEEN MINUTES (`negative/one-clock/`), beside the forms that
 * are not a clock: an age said, an order, a day's edge, a comment, a test and the one clock itself.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { ALLOWED, CLOCK, clockLines, verdict } from '../one-clock.mjs';

const gates = join(import.meta.dirname, '..');
const root = join(gates, '..', '..');
const planted = join(gates, 'negative', 'one-clock');

function run(at) {
  const r = spawnSync(process.execPath, [join(gates, 'one-clock.mjs')], { encoding: 'utf8', env: { ...process.env, BRAINDOG_GATE_ROOT: at } });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

test('the planted tree is red on its one reader with its own clock, once, and on nothing else in it', () => {
  const r = run(planted);
  assert.equal(r.status, 1, r.out);
  const seeded = readFileSync(join(planted, 'expect.txt'), 'utf8').trim();
  const named = r.out.split('\n').filter((l) => /^ {2}\S+:\d+ {2}/u.test(l));
  assert.deepEqual(named.map((l) => l.trim().split('  ')[0]), [`${seeded}:7`]);
  assert.match(r.out, /compares a run's last_seen with the clock/u);
  assert.match(r.out, /\b1 finding\(s\)/u);
});

test('IN CODE: the last seen, a comparison and the clock on one line, or through a name bound from the last seen', () => {
  assert.deepEqual(clockLines("const w = run.fields.state === 'active' && now - Date.parse(String(run.fields.last_seen)) < QUIET_MS;"), [1]);
  assert.deepEqual(clockLines('if (nowMs - Date.parse(row.last_seen) > BRIEFING_LIVE_MS) late++;'), [1]);
  assert.deepEqual(clockLines('const live = Date.parse(r.lastSeen) >= Date.now() - WINDOW;'), [1]);
  /* TODAY'S OWN FORM, BEFORE THIS BATCH: the binding, and the comparison two lines down. */
  const today = [
    "const seen = Date.parse(text(r.fields.last_seen) || text(r.updated_at));",
    'if (!Number.isFinite(seen) || seen < dayStart) continue;',
    "const working = state === 'active' && now - seen < QUIET_AFTER;",
  ].join('\n');
  assert.deepEqual(clockLines(today), [3]);
  /* AN AGE WORKED OUT, AND COMPARED A LINE LATER: `Date.now() - last_seen` is the clock wherever its result goes. */
  assert.deepEqual(clockLines('if (Date.now() - last_seen > QUIET_MS) return false;'), [1]);
  assert.deepEqual(clockLines('const age = Date.now() - Date.parse(run.fields.last_seen);\nreturn age > QUIET_MS;'), [2]);
  assert.deepEqual(clockLines('const seen = Date.parse(run.fields.last_seen);\nconst age = now - seen;\nif (age < QUIET_MS) live++;'), [3]);
  /* BROKEN FOR WIDTH: a line ending on the comparison is read with the next; an arrow is not a comparison. */
  assert.deepEqual(clockLines('const w =\n  now - Date.parse(run.fields.last_seen) <\n  QUIET_MS;'), [2]);
  assert.deepEqual(clockLines('export const w = (run, now) =>\n  now - Date.parse(run.fields.last_seen) < QUIET_MS;'), [2]);
});

test('IN SQL: the last seen against a bound moment, written out or through a name that holds it', () => {
  assert.deepEqual(clockLines("AND state IN ('active', 'idle') AND json_extract(fields, '$.last_seen') > ? AND x = ?"), [1]);
  const named = [
    `const HEARD = "coalesce(json_extract(fields, '$.last_seen'), updated_at)";`,
    'const runs = sql.all(`SELECT state FROM entry WHERE ${HEARD} >= ?`, since);',
  ].join('\n');
  assert.deepEqual(clockLines(named), [2]);
});

test('NOT A CLOCK: an age said, an order, a day`s edge, an arrow, a comment, and a name long out of reach', () => {
  assert.deepEqual(clockLines('const said = `${Math.round((now - Date.parse(run.fields.last_seen)) / 60_000)}m ago`;'), []);
  assert.deepEqual(clockLines("ORDER BY json_extract(fields, '$.last_seen') DESC LIMIT 1"), []);
  assert.deepEqual(clockLines('rows.sort((a, b) => String(b.fields.last_seen).localeCompare(String(a.fields.last_seen)));'), []);
  assert.deepEqual(clockLines("where: 'state is active, last_seen is today',"), []);
  assert.deepEqual(clockLines('const seen = Date.parse(r.fields.last_seen);\nreturn seen >= dayStart;'), []);
  assert.deepEqual(clockLines('const at = (r) => Date.parse(r.lastSeen) + now;'), []);
  assert.deepEqual(clockLines('const mins = Math.round((Date.now() - Date.parse(r.last_seen)) / 60_000);\nreturn `${mins}m ago`;'), []);
  /* A MOMENT CHOSEN BY THE CLOCK IS NOT AN AGE: a span drawn to now while a run works compares moments, not a window. */
  assert.deepEqual(clockLines('const seen = Date.parse(r.lastSeen);\nconst to = r.working ? now : seen;\nif (to < start || from > now) continue;'), []);
  assert.deepEqual(clockLines('// now - Date.parse(run.fields.last_seen) < QUIET_MS'), []);
  assert.deepEqual(clockLines('/* now - Date.parse(run.fields.last_seen)\n   < QUIET_MS, said in a comment */ const x = 1;'), []);
  assert.deepEqual(clockLines('<!-- now - last_seen < QUIET_MS -->'), []);
  const far = ['const seen = Date.parse(r.fields.last_seen);', ...Array(45).fill('noop();'), 'if (now - seen < LIMIT) go();'].join('\n');
  assert.deepEqual(clockLines(far), []);
});

test('THE LIST ONLY SHRINKS: a file over its count is red on every line, and a count above what is there is lowered', () => {
  const allowed = { 'a.ts': 1, 'b.ts': 2 };
  assert.deepEqual(verdict(new Map([['a.ts', [4]], ['b.ts', [1, 9]]]), allowed), []);
  const over = verdict(new Map([['a.ts', [4, 8]], ['b.ts', [1, 9]]]), allowed);
  assert.equal(over.length, 2);
  assert.match(over[0], /a\.ts:4 .*\(2 here, 1 allowed\)/u);
  const under = verdict(new Map([['a.ts', [4]], ['b.ts', [1]]]), allowed);
  assert.deepEqual(under.map((f) => f.trim()), ['tools/gates/one-clock.mjs  allows b.ts 2 line(s), and it has 1: lower its count to 1']);
  assert.match(verdict(new Map([['b.ts', [1, 9]]]), allowed)[0], /take it off the list/u);
  assert.match(verdict(new Map([['new.ts', [3]]]), allowed)[0], /^ {2}new\.ts:3 {2}compares/u);
});

/* TODAY'S LIST, 9 OCTOBER 2026, which no later edit may grow: a file off it, or a count above it, is a new clock. */
const TODAY = {
  'apps/web/src/lib/record/api.ts': 1,
  'packages/kernel/src/schedule.ts': 1,
  'packages/kernel/src/session.ts': 2,
  'packages/kernel/src/signs.ts': 2,
  'packages/record/src/signs.ts': 1,
};

test('the allowed list is only ever today`s, lowered, and every file on it is in the repository', () => {
  for (const [rel, may] of Object.entries(ALLOWED)) {
    assert.ok(rel in TODAY, `${rel} was added to the allowed list; a new reader asks ${CLOCK}`);
    assert.ok(may >= 1 && may <= TODAY[rel], `${rel} is allowed ${may}, above today's ${TODAY[rel]}`);
    assert.ok(existsSync(join(root, rel)), `${rel} is on the allowed list and not in the repository`);
  }
  assert.ok(!(CLOCK in ALLOWED), 'the clock itself is never on the list');
});
