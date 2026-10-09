/**
 * The five held lists the ledger reads off their gates (PRF-B03 step 3), held to the ledger's newest lines.
 *
 *   node --test tools/gates/test/held-exports.test.mjs
 *
 * `ledger.mjs` imports each gate to read its list, so two things have to be true: each export holds what
 * `ledger.json`'s newest line says, and importing a gate starts nothing. A gate that opened a port, a record or a
 * browser on import would be started by every ledger run, and a handle left open is a runner that never exits.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

import { heldExportsIn, sizeOf } from '../ledger.mjs';

const GATES = join(import.meta.dirname, '..');
const BOOK = JSON.parse(readFileSync(join(GATES, 'ledger.json'), 'utf8'));

/** The five this job exports, as the ledger names them. */
const FIVE = ['web-lists.HELD', 'shell-words.EXEMPT', 'dead-copy.ALLOWED', 'keys.SKIPPED', 'prefs.UNCOVERED'];

const split = (name) => [name.slice(0, name.lastIndexOf('.')), name.slice(name.lastIndexOf('.') + 1)];

for (const name of FIVE) {
  const [gate, exported] = split(name);
  test(`${name} holds what the ledger's newest line says`, async () => {
    const entry = BOOK.held[name];
    assert.ok(entry, `ledger.json has no line for ${name}`);
    const newest = entry.lines.at(-1).count;
    const mod = await import(pathToFileURL(join(GATES, `${gate}.mjs`)).href);
    assert.ok(exported in mod, `${gate}.mjs does not export ${exported}`);
    assert.equal(sizeOf(mod[exported]), newest);
  });

  test(`${name} is found in the gate's text, the way the ledger finds it`, () => {
    assert.ok(heldExportsIn(readFileSync(join(GATES, `${gate}.mjs`), 'utf8')).includes(exported));
  });
}

test('keys.SKIPPED is the bindings the run skips, read off the registry with no browser', async () => {
  const { SKIPPED, bindingsIn, skips } = await import(pathToFileURL(join(GATES, 'keys.mjs')).href);
  const rows = bindingsIn(readFileSync(join(GATES, '..', '..', 'apps', 'web', 'src', 'lib', 'a11y', 'bindings.ts'), 'utf8'));
  assert.ok(rows.length >= 20, `read ${rows.length} bindings, which cannot be right`);
  assert.deepEqual(SKIPPED, rows.filter(skips).map((r) => r.id));
  assert.equal(skips({ bare: false, scope: 'grid' }), true);
  assert.equal(skips({ bare: true, scope: 'palette' }), true);
  assert.equal(skips({ bare: true, scope: 'nav' }), true);
  assert.equal(skips({ bare: true, scope: 'grid' }), false);
});

test('importing the five gates starts nothing: no port, no process, no output, and the import exits by itself', () => {
  const files = [...new Set(FIVE.map((n) => split(n)[0]))].map((g) => pathToFileURL(join(GATES, `${g}.mjs`)).href);
  /* The child's own stdio is three pipes, each opened when first touched, so they are touched before the count is
     taken and what counts is only what the imports add. `record.mjs` imports from `node:process`, and building that
     namespace touches `process.stdin`: a pipe that reads nothing and keeps nothing alive, which the exit proves. */
  const script =
    `process.stdin; process.stdout; process.stderr;\n` +
    `const open = () => process.getActiveResourcesInfo().filter((r) => /TCP|Pipe|Process|UDP|FSEvent|StatWatcher/.test(r));\n` +
    `const before = open();\n` +
    /* An `unref`ed listen or child is not an active resource, so the count alone would miss it: every listen and
       every spawn the imports ask for is caught where it is asked, ref'd or not. */
    `const { Server } = await import('node:net');\n` +
    `const { ChildProcess } = await import('node:child_process');\n` +
    `const asked = [];\n` +
    `const listen = Server.prototype.listen;\n` +
    `Server.prototype.listen = function (...a) { asked.push('listen'); return listen.apply(this, a); };\n` +
    `const spawn = ChildProcess.prototype.spawn;\n` +
    `ChildProcess.prototype.spawn = function (o) { asked.push('spawn ' + o?.file); return spawn.call(this, o); };\n` +
    `for (const f of ${JSON.stringify(files)}) await import(f);\n` +
    /* A listen is bound a tick after it is asked for, so the count waits for it. */
    `await new Promise((r) => setTimeout(r, 100));\n` +
    `const held = open();\n` +
    `for (const r of before) if (held.includes(r)) held.splice(held.indexOf(r), 1);\n` +
    `process.stderr.write('HELD-HANDLES ' + JSON.stringify([...held, ...asked]) + '\\n');`;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 60_000 });
  assert.equal(run.error, undefined, `the import did not exit by itself: ${run.error?.message}`);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, '', 'a gate printed on import, so it ran');
  const line = run.stderr.split('\n').find((l) => l.startsWith('HELD-HANDLES '));
  assert.ok(line, run.stderr);
  assert.deepEqual(JSON.parse(line.slice('HELD-HANDLES '.length)), []);
});
