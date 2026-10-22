/**
 * `~/.braindog/pins.json` and `braindog env pins`: the program entries approved on one machine, each by the SHA-256 of
 * its kind, name and entry, and a name forgotten so it is asked about again.
 *
 * EVERY FILE IS UNDER A TEMPORARY FOLDER, the home handed in, so this machine's own pins are never read.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { envCommand } from '../src/env.ts';
import { envPins, forgetPins, keepPin, pinOf, pinsFile, readPins } from '../src/pins.ts';

const scratch = mkdtempSync(join(tmpdir(), 'braindog-pins-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
let homes = 0;
const newHome = () => {
  const dir = join(scratch, `home-${String(homes++)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};

const DAY = Date.parse('2026-10-22T12:00:00.000Z');
const LANTERN = { type: 'stdio', command: 'node', args: ['lantern.mjs'] };

test('A PIN IS THE HASH OF KIND, NAME AND ENTRY: one entry anywhere is one pin, and a change is another', () => {
  assert.equal(pinOf('tool', 'lantern', LANTERN), pinOf('tool', 'lantern', { args: ['lantern.mjs'], command: 'node', type: 'stdio' }));
  assert.notEqual(pinOf('tool', 'lantern', LANTERN), pinOf('tool', 'lantern', { ...LANTERN, args: ['lantern.mjs', '--fast'] }));
  assert.notEqual(pinOf('tool', 'lantern', LANTERN), pinOf('server', 'lantern', LANTERN));
  assert.match(pinOf('tool', 'lantern', LANTERN), /^[0-9a-f]{64}$/u);
});

test('KEPT, A PIN GAINS EACH PROFILE IT GOES INTO, and a new entry of the same kind and name replaces the old one', () => {
  const file = pinsFile(newHome());
  const old = pinOf('tool', 'lantern', LANTERN);
  keepPin(file, old, { name: 'lantern', kind: 'tool', profile: 'default', now: DAY });
  keepPin(file, old, { name: 'lantern', kind: 'tool', profile: 'studio', now: DAY + 1000 });
  keepPin(file, old, { name: 'lantern', kind: 'tool', profile: 'studio', now: DAY + 2000 });
  const server = pinOf('server', 'braindog', { command: 'node' });
  keepPin(file, server, { name: 'braindog', kind: 'server', profile: 'default', now: DAY });
  assert.deepEqual(readPins(file), {
    [old]: { name: 'lantern', kind: 'tool', profiles: ['default', 'studio'], at: '2026-10-22T12:00:00.000Z' },
    [server]: { name: 'braindog', kind: 'server', profiles: ['default'], at: '2026-10-22T12:00:00.000Z' },
  });
  const changed = pinOf('tool', 'lantern', { ...LANTERN, args: ['lantern.mjs', '--fast'] });
  keepPin(file, changed, { name: 'lantern', kind: 'tool', profile: 'work', now: DAY + 86_400_000 });
  const pins = readPins(file) ?? {};
  assert.equal(pins[old], undefined, 'the old entry kept its pin');
  assert.deepEqual(pins[changed], { name: 'lantern', kind: 'tool', profiles: ['work'], at: '2026-10-23T12:00:00.000Z' });
  assert.ok(pins[server] !== undefined, 'another name lost its pin');
  /* No entry is in the file: a name, a kind, profiles, a hash and a time. */
  assert.doesNotMatch(readFileSync(file, 'utf8'), /lantern\.mjs|--fast|"command"/u);
});

test('NO FILE IS NO PINS, a file that does not read is null, and a pin out of shape is passed over', () => {
  const home = newHome();
  assert.deepEqual(readPins(pinsFile(home)), {});
  mkdirSync(dirname(pinsFile(home)), { recursive: true });
  writeFileSync(pinsFile(home), '{ not json');
  assert.equal(readPins(pinsFile(home)), null);
  const sha = pinOf('hooks', 'hooks', ['a']);
  writeFileSync(
    pinsFile(home),
    JSON.stringify({ pins: { [sha]: { name: 'hooks', kind: 'hooks', profiles: ['default', 7], at: '2026-10-22T12:00:00.000Z' }, short: { name: 'x', kind: 'tool', at: 'now' }, [[...sha].reverse().join('')]: { name: 'y', kind: 'gadget', at: 'now' } } }),
  );
  assert.deepEqual(readPins(pinsFile(home)), { [sha]: { name: 'hooks', kind: 'hooks', profiles: ['default'], at: '2026-10-22T12:00:00.000Z' } });
});

test('env pins LISTS EACH PIN, OLDEST FIRST, and --forget drops a name so it is asked about again', () => {
  const home = newHome();
  const file = pinsFile(home);
  assert.deepEqual(envPins([], { home }).lines, ['No program entry is approved on this machine yet. braindog env apply asks before it places one.']);
  const hooks = pinOf('hooks', 'hooks', ['sh hook.sh start']);
  const lantern = pinOf('tool', 'lantern', LANTERN);
  keepPin(file, lantern, { name: 'lantern', kind: 'tool', profile: 'studio', now: DAY + 5000 });
  keepPin(file, hooks, { name: 'hooks', kind: 'hooks', profile: 'default', now: DAY });
  keepPin(file, hooks, { name: 'hooks', kind: 'hooks', profile: 'work', now: DAY });
  const listed = envPins([], { home });
  assert.equal(listed.code, 0);
  assert.deepEqual(listed.lines, [
    'braindog env pins: 2 program entries are approved on this machine, in ~/.braindog/pins.json.',
    `  hooks, BrainDog's hooks: placed in default and work; ${hooks.slice(0, 12)}; approved 2026-10-22.`,
    `  lantern, an MCP tool: placed in studio; ${lantern.slice(0, 12)}; approved 2026-10-22.`,
    'Forget one with braindog env pins --forget <name>, and it is asked about again the next time it is placed.',
  ]);
  const json = envPins(['--json'], { home });
  assert.equal(json.json, true);
  assert.deepEqual(
    json.report.pins.map((p) => [p.name, p.sha256]),
    [
      ['hooks', hooks],
      ['lantern', lantern],
    ],
  );

  const forgot = envPins(['--forget', 'lantern'], { home });
  assert.equal(forgot.code, 0);
  assert.deepEqual(forgot.lines, ['Forgot the pin named lantern. It is asked about again the next time it is placed.']);
  assert.deepEqual(Object.keys(readPins(file) ?? {}), [hooks]);
  const none = envPins(['--forget', 'lantern'], { home });
  assert.equal(none.code, 1);
  assert.deepEqual(none.lines, ['No pin is named lantern, so nothing was forgotten.']);
  assert.equal(forgetPins(file, 'hooks'), 1);
  assert.deepEqual(readPins(file), {});
});

test('A PROGRAM SETUP SYNC PLACED IS PINNED AS carry, by where it goes and its bytes and mode, and said as carried by its thing', () => {
  const home = newHome();
  const file = pinsFile(home);
  const where = '~/.local/bin/tidy';
  const tidy = pinOf('carry', where, { sha256: 'ab'.repeat(32), mode: 0o755 });
  keepPin(file, tidy, { name: where, kind: 'carry', profile: 'Local programs', now: DAY });
  assert.deepEqual(readPins(file), { [tidy]: { name: where, kind: 'carry', profiles: ['Local programs'], at: '2026-10-22T12:00:00.000Z' } });
  assert.deepEqual(envPins([], { home }).lines.slice(1, 2), [`  ${where}, a program setup sync placed: carried by Local programs; ${tidy.slice(0, 12)}; approved 2026-10-22.`]);
  /* OTHER BYTES OR ANOTHER MODE ARE ANOTHER PIN, and approving one drops the pin of the file it replaces. */
  assert.notEqual(pinOf('carry', where, { sha256: 'ab'.repeat(32), mode: 0o700 }), tidy, 'a changed mode kept the pin');
  const tidier = pinOf('carry', where, { sha256: 'cd'.repeat(32), mode: 0o755 });
  assert.notEqual(tidier, tidy);
  keepPin(file, tidier, { name: where, kind: 'carry', profile: 'Local programs', now: DAY + 1000 });
  assert.deepEqual(Object.keys(readPins(file) ?? {}), [tidier]);
});

test('env pins REFUSES WHAT IT DOES NOT TAKE in one sentence, and a file that does not read before anything changes', async () => {
  const home = newHome();
  assert.throws(() => envPins(['--all'], { home }), /^Error: braindog env pins takes --forget <name> and --json, and nothing else\.$/u);
  mkdirSync(dirname(pinsFile(home)), { recursive: true });
  writeFileSync(pinsFile(home), '{ not json');
  assert.throws(() => envPins([], { home }), /is not valid JSON, so no pin could be read/u);
  assert.throws(() => envPins(['--forget', 'x'], { home }), /is not valid JSON, so nothing was forgotten/u);
  assert.equal(readFileSync(pinsFile(home), 'utf8'), '{ not json');
  /* Reached through `braindog env`, as main.ts dispatches it. */
  const via = await envCommand(['pins'], { home: newHome(), env: {} });
  assert.equal(via.code, 0);
  assert.match(via.lines[0] ?? '', /^No program entry is approved/u);
});
