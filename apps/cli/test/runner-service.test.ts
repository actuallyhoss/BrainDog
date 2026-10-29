/**
 * `braindog runner service on|off|status`: the runner started at log-on and kept up, against a stubbed file system
 * and a stubbed `execFile`, so no real launch agent, unit or task is touched.
 *
 * THE STUB SYSTEM KEEPS ONE FACT: whether the service is loaded. Loading it (`bootstrap`, `enable --now`, `/Create`)
 * sets it and unloading it clears it, and each program's query answers from it, so on, status and off are read in
 * order exactly as the real programs would answer them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LABEL, TASK, UNIT, service, serviceOff, serviceOn, serviceStatus, unitFor, type Os, type Paths, type ServiceIo } from '../src/runner-service.ts';

/* Made up, in the shape of a key. It is never handed to the service, and must never reach a unit or a line. */
const TOKEN = 'hb_live_4f9K2mQ8xZ71';
const HOME = '/home/sample';
const paths = (os: Os): Paths =>
  os === 'win32'
    ? { node: 'C:\\Program Files\\nodejs\\node.exe', cli: 'C:\\tools\\braindog.mjs', log: 'C:\\Users\\sample\\.braindog\\runner.log', home: 'C:\\Users\\sample', user: 'sample' }
    : { node: '/usr/local/bin/node', cli: '/opt/braindog/braindog.mjs', log: `${HOME}/.braindog/runner.log`, home: HOME, path: '/usr/local/bin:/usr/bin:/bin' };

type Call = [string, string[]];

/** A stub machine: files in a map, and the programs answering from one `loaded` fact. `fail` names a program, or one verb of one, that fails. */
function machine(os: Os, fail?: string) {
  const files = new Map<string, string>();
  const calls: Call[] = [];
  const lines: string[] = [];
  let loaded = false;
  const io: ServiceIo = {
    platform: os,
    paths: paths(os),
    uid: 501,
    say: (line) => lines.push(line),
    ready: () => null,
    fs: {
      read: (file) => files.get(file) ?? null,
      write: (file, text) => void files.set(file, text),
      mkdir: () => {},
      remove: (file) => void files.delete(file),
    },
    execFile: async (file, args) => {
      calls.push([file, args]);
      const verb = args.find((a) => !a.startsWith('--')) ?? '';
      if (file === fail || verb === fail) return { code: 1, stdout: '' };
      if (['bootstrap', 'enable', '/Create'].includes(verb)) loaded = true;
      if (['bootout', 'disable', '/Delete'].includes(verb)) loaded = false;
      if (verb === 'print') return loaded ? { code: 0, stdout: `${LABEL} = {\n\tstate = running\n}` } : { code: 113, stdout: '' };
      if (verb === 'is-enabled') return loaded ? { code: 0, stdout: 'enabled\n' } : { code: 1, stdout: 'disabled\n' };
      if (verb === 'is-active') return loaded ? { code: 0, stdout: 'active\n' } : { code: 3, stdout: 'inactive\n' };
      if (verb === '/Query') return loaded ? { code: 0, stdout: `"\\${TASK}","N/A","Running"\r\n` } : { code: 1, stdout: '' };
      return { code: 0, stdout: '' };
    },
  };
  return { io, files, calls, lines };
}

/** The calls that change the system, without the queries every verb reads first. */
const changes = (calls: Call[]): Call[] => calls.filter(([, args]) => !['print', 'is-enabled', 'is-active', '/Query'].includes(args.find((a) => !a.startsWith('--')) ?? ''));

for (const os of ['darwin', 'linux', 'win32'] as const) {
  test(`${os}: the unit runs runner run and holds no token, bearer or key`, () => {
    const unit = unitFor(os, paths(os));
    assert.match(unit.text, os === 'darwin' ? /<string>runner<\/string>\s*<string>run<\/string>/ : os === 'linux' ? /"runner" "run"/ : /runner run/);
    /* A plist names its fields with `<key>` and a task's log-on type is `InteractiveToken`, the schema's own words for
       running as the person signed in; past those, the words must not appear at all. */
    const words = unit.text.replace(/<\/?key>/g, '').replace('<LogonType>InteractiveToken</LogonType>', '');
    for (const word of [/token/i, /bearer/i, /\bkey\b/i, /authori[sz]ation/i, /hb_live/, new RegExp(TOKEN)]) assert.doesNotMatch(words, word);
    /* Nothing but this Node, this file and the two words, and on Windows the log it is handed. */
    if (os === 'linux') assert.match(unit.text, /^ExecStart="\/usr\/local\/bin\/node" "\/opt\/braindog\/braindog.mjs" "runner" "run"$/m);
    if (os === 'win32') assert.match(unit.text, /<Arguments>C:\\tools\\braindog\.mjs runner run --log C:\\Users\\sample\\\.braindog\\runner\.log<\/Arguments>/);
  });

  test(`${os}: on, then status, then off call the right programs in order, with no shell`, async () => {
    const m = machine(os);
    assert.equal(await serviceOn(m.io), 0);
    const unit = unitFor(os, paths(os));
    assert.equal(m.files.get(unit.file), unit.text);
    assert.equal(await serviceStatus(m.io), 0);
    assert.equal(await serviceOff(m.io), 0);
    assert.equal(m.files.has(unit.file), false);
    const expected: Call[] =
      os === 'darwin'
        ? [['launchctl', ['bootstrap', 'gui/501', unit.file]], ['launchctl', ['bootout', `gui/501/${LABEL}`]]]
        : os === 'linux'
          ? [['systemctl', ['--user', 'daemon-reload']], ['systemctl', ['--user', 'enable', '--now', UNIT]], ['systemctl', ['--user', 'disable', '--now', UNIT]], ['systemctl', ['--user', 'daemon-reload']]]
          : [['schtasks', ['/Create', '/XML', unit.file, '/TN', TASK, '/F']], ['schtasks', ['/Run', '/TN', TASK]], ['schtasks', ['/End', '/TN', TASK]], ['schtasks', ['/Delete', '/TN', TASK, '/F']]];
    assert.deepEqual(changes(m.calls), expected);
    for (const [file] of m.calls) assert.ok(['launchctl', 'systemctl', 'schtasks'].includes(file), `${file} is no shell`);
    assert.equal(m.lines.length, 3, 'one line a verb');
    assert.match(m.lines[0] ?? '', /is on: .*starts at log-on.*braindog runner service off stops it/);
    assert.equal(m.lines[1], 'The runner service is on, running.');
    assert.match(m.lines[2] ?? '', /is off/);
    for (const line of m.lines) assert.doesNotMatch(line, /\/home\/|C:\\|—/);
  });

  test(`${os}: a second on changes nothing`, async () => {
    const m = machine(os);
    await serviceOn(m.io);
    const before = changes(m.calls).length;
    assert.equal(await serviceOn(m.io), 0);
    assert.equal(changes(m.calls).length, before, 'nothing loaded twice');
    assert.equal(m.lines.at(-1), 'The runner service was already on. braindog runner service off stops it.');
  });

  test(`${os}: status reads off when there is no unit, and asks no program`, async () => {
    const m = machine(os);
    assert.equal(await serviceStatus(m.io), 0);
    assert.deepEqual(m.calls, []);
    assert.equal(m.lines[0], 'The runner service is off. braindog runner service on starts it.');
  });
}

test('on refuses, and writes nothing, when runner run could not start', async () => {
  const m = machine('darwin');
  m.io.ready = () => 'This machine is not enrolled as a runner.';
  assert.equal(await serviceOn(m.io), 1);
  assert.equal(m.files.size, 0);
  assert.deepEqual(changes(m.calls), []);
  assert.equal(m.lines[0], 'This machine is not enrolled as a runner. The runner service was not turned on.');
});

test('a load the system refuses takes the unit back out, so status says off', async () => {
  const m = machine('linux', 'systemctl');
  assert.equal(await serviceOn(m.io), 1);
  assert.equal(m.files.size, 0);
  assert.match(m.lines[0] ?? '', /could not load the runner service, so it is off/);
});

test('a task created that would not run is deleted again, so it does not start at the next log-on', async () => {
  const m = machine('win32', '/Run');
  assert.equal(await serviceOn(m.io), 1);
  assert.equal(m.files.size, 0);
  assert.deepEqual(changes(m.calls).at(-1), ['schtasks', ['/Delete', '/TN', TASK, '/F']]);
  assert.equal(await serviceStatus(m.io), 0);
  assert.equal(m.lines.at(-1), 'The runner service is off. braindog runner service on starts it.');
});

test('a unit enabled that would not start is disabled again', async () => {
  const m = machine('linux', 'enable');
  assert.equal(await serviceOn(m.io), 1);
  assert.deepEqual(changes(m.calls).at(-1), ['systemctl', ['--user', 'disable', '--now', UNIT]]);
});

test('on --host writes the address into the unit, and a word that is no address is refused before anything is written', async () => {
  const m = machine('linux');
  assert.equal(await service(['on', '--host', 'https://record.example/sample'], m.io), 0);
  const [text] = [...m.files.values()];
  assert.match(text ?? '', /"runner" "run" "--host" "https:\/\/record.example\/sample"$/m);

  for (const host of [TOKEN, `https://sample:${TOKEN}@record.example`, `https://record.example/?token=${TOKEN}`]) {
    const n = machine('linux');
    assert.equal(await service(['on', '--host', host], n.io), 1);
    assert.equal(n.files.size, 0);
    assert.deepEqual(n.calls, []);
    for (const line of n.lines) assert.doesNotMatch(line, new RegExp(TOKEN));
  }
});

test('service with no word says the three, and a wrong word is refused without being echoed when it could be a key', async () => {
  const m = machine('darwin');
  assert.equal(await service([], m.io), 0);
  assert.equal(m.lines.length, 3);
  assert.match(m.lines.join('\n'), /service on .*\n.*service off.*\n.*service status/);
  assert.equal(await service([TOKEN], m.io), 1);
  assert.doesNotMatch(m.lines.at(-1) ?? '', new RegExp(TOKEN));
  assert.equal(await service(['start'], m.io), 1);
  assert.match(m.lines.at(-1) ?? '', /takes on \[--host <host>\], off or status, not start\./);
  assert.deepEqual(m.calls, []);
});

test('a machine that is not macOS, Linux or Windows is told so and nothing is run', async () => {
  const m = machine('darwin');
  m.io.platform = 'aix';
  assert.equal(await serviceOn(m.io), 1);
  assert.deepEqual(m.calls, []);
  assert.match(m.lines[0] ?? '', /Run braindog runner run in a terminal instead/);
});
