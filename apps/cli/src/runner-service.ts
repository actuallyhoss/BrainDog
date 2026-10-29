/**
 * `braindog runner service on|off|status`: the machine's runner starts at log-on and stays up, so a job started from
 * the record is taken without a terminal left open.
 *
 * ONE UNIT PER SYSTEM, AND IT RUNS `runner run` AND NOTHING ELSE. A launch agent `dog.brain.runner` on macOS, a systemd
 * user unit `braindog-runner.service` on Linux, a scheduled task at log-on on Windows. Each starts this machine's Node
 * on this command with `runner run`, and the runner reads its own enrolment from the hosts file as it does in a
 * terminal. No key, token or bearer is written into the unit or the log: the unit's text is built here from the four
 * paths and fixed words, and nothing read from the hosts file goes into it.
 *
 * NOTHING ASKS AND NOTHING STARTS BY ITSELF. The service exists only once the person types `service on`, every verb
 * says what it did in one line, and `on` says how to stop it. A kind the machine never allowed is still refused with
 * no terminal attached (`runner.ts`), and `runner allow <kind>` approves it later.
 *
 * EVERYTHING IS HANDED IN. `fs`, `execFile` and `platform` come in on the io, so a test plants a stub and no real
 * launch agent, unit or task is touched. `execFile` takes a program and its arguments: there is no shell anywhere.
 */

import { execFile as nodeExecFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, posix, win32 } from 'node:path';

export type Os = 'darwin' | 'linux' | 'win32';
/** This machine's Node, this command's file, the log the runner writes to, and the home the unit lives under. */
export type Paths = { node: string; cli: string; log: string; home: string; path?: string | undefined; user?: string | undefined; host?: string | undefined };
/** The file to write and its text. `utf16` is how Task Scheduler reads an XML it is handed. */
export type Unit = { file: string; text: string; utf16?: boolean };

/** The launch agent's label, the systemd unit's name and the scheduled task's name. */
export const LABEL = 'dog.brain.runner';
export const UNIT = 'braindog-runner.service';
export const TASK = 'BrainDog runner';

/** What the unit runs after this command's file: `runner run`, and the host only when one was named. */
const runArgs = (paths: Paths): string[] => ['runner', 'run', ...(paths.host ? ['--host', paths.host] : [])];

const xml = (text: string): string => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

/** One systemd argument, quoted, with `%` doubled so no specifier is read into a path. */
const systemdArg = (text: string): string => `"${text.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('%', '%%')}"`;

/** One Windows argument, quoted as `CommandLineToArgvW` reads it back. */
const windowsArg = (text: string): string => (/^[\w.:\\/-]+$/.test(text) ? text : `"${text.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`);

/**
 * The file to write for `os`, and its text.
 *
 * MACOS: `RunAtLoad` starts it at log-on and `KeepAlive` brings it back when it ends, launchd waiting ten seconds
 * between starts. LINUX: `Restart=on-failure` and `WantedBy=default.target`, so the user's own manager starts it at
 * log-on. Both hand the runner's two streams to the log. WINDOWS: a task at log-on with no time limit that restarts
 * when it fails; Task Scheduler has no streams to hand over, so `runner run` is given the log and writes it itself.
 * PATH is copied in where it is known, because launchd and systemd start a unit with almost none, and `runner run`
 * looks for Claude Code on it.
 */
export function unitFor(os: Os, paths: Paths): Unit {
  if (os === 'darwin') {
    const args = [paths.node, paths.cli, ...runArgs(paths)].map((a) => `    <string>${xml(a)}</string>`).join('\n');
    const env = paths.path ? `  <key>EnvironmentVariables</key>\n  <dict>\n    <key>PATH</key>\n    <string>${xml(paths.path)}</string>\n  </dict>\n` : '';
    const text = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
      '<plist version="1.0">',
      '<dict>',
      `  <key>Label</key>\n  <string>${LABEL}</string>`,
      `  <key>ProgramArguments</key>\n  <array>\n${args}\n  </array>`,
      `${env}  <key>RunAtLoad</key>\n  <true/>`,
      '  <key>KeepAlive</key>\n  <true/>',
      '  <key>ThrottleInterval</key>\n  <integer>10</integer>',
      `  <key>StandardOutPath</key>\n  <string>${xml(paths.log)}</string>`,
      `  <key>StandardErrorPath</key>\n  <string>${xml(paths.log)}</string>`,
      '</dict>',
      '</plist>',
      '',
    ].join('\n');
    return { file: posix.join(paths.home, 'Library', 'LaunchAgents', `${LABEL}.plist`), text };
  }
  if (os === 'linux') {
    const text = [
      '[Unit]',
      'Description=BrainDog runner',
      'After=network-online.target',
      '',
      '[Service]',
      `ExecStart=${[paths.node, paths.cli, ...runArgs(paths)].map(systemdArg).join(' ')}`,
      ...(paths.path ? [`Environment=${systemdArg(`PATH=${paths.path}`)}`] : []),
      'Restart=on-failure',
      'RestartSec=10',
      `StandardOutput=append:${paths.log.replaceAll('%', '%%')}`,
      `StandardError=append:${paths.log.replaceAll('%', '%%')}`,
      '',
      '[Install]',
      'WantedBy=default.target',
      '',
    ].join('\n');
    return { file: posix.join(paths.home, '.config', 'systemd', 'user', UNIT), text };
  }
  const user = paths.user ? `      <UserId>${xml(paths.user)}</UserId>\n` : '';
  const args = [paths.cli, ...runArgs(paths), '--log', paths.log].map(windowsArg).join(' ');
  const text = [
    '<?xml version="1.0" encoding="UTF-16"?>',
    '<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">',
    `  <RegistrationInfo>\n    <Description>${TASK}</Description>\n  </RegistrationInfo>`,
    `  <Triggers>\n    <LogonTrigger>\n      <Enabled>true</Enabled>\n${user}    </LogonTrigger>\n  </Triggers>`,
    `  <Principals>\n    <Principal id="Author">\n${user}      <LogonType>InteractiveToken</LogonType>\n      <RunLevel>LeastPrivilege</RunLevel>\n    </Principal>\n  </Principals>`,
    '  <Settings>',
    '    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>',
    '    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>',
    '    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>',
    '    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>',
    '    <RestartOnFailure>\n      <Interval>PT1M</Interval>\n      <Count>999</Count>\n    </RestartOnFailure>',
    '  </Settings>',
    `  <Actions Context="Author">\n    <Exec>\n      <Command>${xml(paths.node)}</Command>\n      <Arguments>${xml(args)}</Arguments>\n    </Exec>\n  </Actions>`,
    '</Task>',
    '',
  ].join('\n');
  return { file: win32.join(paths.home, '.braindog', 'runner-task.xml'), text, utf16: true };
}

/* ── Turning it on and off ───────────────────────────────────────────────── */

/** What a program said: its exit code and its standard output. A program that did not start ends 127. */
export type Ran = { code: number; stdout: string };
/** A program and its arguments, run with no shell. */
export type ExecFile = (file: string, args: string[]) => Promise<Ran>;
/** The four things the service does to files, so a test plants a stub. `write` makes the folder it needs. */
export type ServiceFs = { read: (file: string) => string | null; write: (file: string, text: string, utf16: boolean) => void; mkdir: (dir: string) => void; remove: (file: string) => void };

export type ServiceIo = {
  platform: string;
  paths: Paths;
  /** One line to stderr: what the verb did. */
  say: (line: string) => void;
  /** Under `--json`, the state `status` read and the one `on` and `off` left (`json.ts`). */
  answer?: ((a: { value?: unknown }) => void) | undefined;
  fs?: ServiceFs | undefined;
  execFile?: ExecFile | undefined;
  /** The user launchd's `gui/<uid>` domain is named for. Left out, this process's own. */
  uid?: number | undefined;
  /** Null when `runner run` would start, else the sentence saying why not, so `on` never installs a runner that cannot run. */
  ready?: ((host: string | undefined) => string | null) | undefined;
};

const REFUSED = 1;
const LOG_WORDS = 'runner.log in your .braindog folder';
export const SERVICE_USAGE = [
  'braindog runner service on [--host <host>]: start this machine\'s runner at log-on and keep it up.',
  'braindog runner service off: stop it and take it out.',
  'braindog runner service status: say whether it is on and running.',
];

export const realFs: ServiceFs = {
  read: (file) => {
    try {
      return readFileSync(file, 'utf8').replace(/^﻿/, '');
    } catch {
      return null;
    }
  },
  write: (file, text, utf16) => {
    mkdirSync(dirname(file), { recursive: true });
    if (utf16) writeFileSync(file, `﻿${text}`, { encoding: 'utf16le', mode: 0o644 });
    else writeFileSync(file, text, { encoding: 'utf8', mode: 0o644 });
  },
  mkdir: (dir) => mkdirSync(dir, { recursive: true }),
  remove: (file) => {
    if (existsSync(file)) rmSync(file, { force: true });
  },
};

export const realExecFile: ExecFile = (file, args) =>
  new Promise((done) => {
    nodeExecFile(file, args, { shell: false, timeout: 15_000, windowsHide: true, encoding: 'utf8' }, (error, stdout) => {
      const code = error === null ? 0 : typeof error.code === 'number' ? error.code : 127;
      done({ code, stdout: String(stdout ?? '') });
    });
  });

/** A UTF-16 file read back as text compares as the text written, whatever the platform's reader made of it. */
const sameText = (held: string | null, text: string): boolean => held !== null && held.replace(/\r\n/g, '\n') === text.replace(/\r\n/g, '\n');

type Seen = { loaded: boolean; running: boolean };

/** Whether the system holds the service, and whether its runner is up. Each asks the system's own program and nothing else. */
async function seen(os: Os, exec: ExecFile, uid: number | undefined): Promise<Seen> {
  if (os === 'darwin') {
    const r = await exec('launchctl', ['print', `gui/${uid}/${LABEL}`]);
    return { loaded: r.code === 0, running: r.code === 0 && /\bstate = running\b/.test(r.stdout) };
  }
  if (os === 'linux') {
    const enabled = await exec('systemctl', ['--user', 'is-enabled', UNIT]);
    const active = await exec('systemctl', ['--user', 'is-active', UNIT]);
    return { loaded: enabled.code === 0, running: active.code === 0 && active.stdout.trim() === 'active' };
  }
  const r = await exec('schtasks', ['/Query', '/TN', TASK, '/FO', 'CSV', '/NH']);
  return { loaded: r.code === 0, running: r.code === 0 && /"Running"/.test(r.stdout) };
}

const osOf = (platform: string): Os | null => (platform === 'darwin' || platform === 'linux' || platform === 'win32' ? platform : null);
const logDir = (os: Os, log: string): string => (os === 'win32' ? win32.dirname(log) : posix.dirname(log));

/** What every verb needs: the system, the unit, the two hands and the user, or the sentence why there are none. */
function setUp(io: ServiceIo): { os: Os; unit: Unit; fs: ServiceFs; exec: ExecFile; uid: number | undefined } | string {
  const os = osOf(io.platform);
  if (os === null) return 'The runner service is made for macOS, Linux and Windows, and this machine is none of them. Run braindog runner run in a terminal instead.';
  const uid = io.uid ?? process.getuid?.();
  if (os === 'darwin' && uid === undefined) return 'This user could not be told apart, so the runner service was left as it was.';
  return { os, unit: unitFor(os, io.paths), fs: io.fs ?? realFs, exec: io.execFile ?? realExecFile, uid };
}

/**
 * `service on`: write the unit and load it, so the runner starts now and at every log-on.
 *
 * A SECOND `on` CHANGES NOTHING when the unit on disk is the one it would write and the system holds it. When the text
 * differs (a new Node, a moved command, another host) it is written again and loaded again, and a runner that was up
 * is started on the new text. A load that fails takes the file back out, so `status` never says on for a unit the
 * system refused.
 */
export async function serviceOn(io: ServiceIo): Promise<number> {
  const set = setUp(io);
  if (typeof set === 'string') return (io.say(set), REFUSED);
  const { os, unit, fs, exec, uid } = set;
  const notReady = io.ready?.(io.paths.host) ?? null;
  if (notReady !== null) return (io.say(`${notReady} The runner service was not turned on.`), REFUSED);
  const before = await seen(os, exec, uid);
  if (sameText(fs.read(unit.file), unit.text) && before.loaded) {
    io.answer?.({ value: { state: 'on', running: before.running } });
    io.say('The runner service was already on. braindog runner service off stops it.');
    return 0;
  }
  fs.mkdir(logDir(os, io.paths.log));
  fs.write(unit.file, unit.text, unit.utf16 === true);
  const steps: [string, string[]][] =
    os === 'darwin'
      ? [...(before.loaded ? [['launchctl', ['bootout', `gui/${uid}/${LABEL}`]] as [string, string[]]] : []), ['launchctl', ['bootstrap', `gui/${uid}`, unit.file]]]
      : os === 'linux'
        ? [['systemctl', ['--user', 'daemon-reload']], ['systemctl', ['--user', 'enable', '--now', UNIT]], ...(before.running ? [['systemctl', ['--user', 'restart', UNIT]] as [string, string[]]] : [])]
        : [['schtasks', ['/Create', '/XML', unit.file, '/TN', TASK, '/F']], ...(before.running ? [['schtasks', ['/End', '/TN', TASK]] as [string, string[]]] : []), ['schtasks', ['/Run', '/TN', TASK]]];
  for (const [program, args] of steps) {
    /* A bootout of a service already gone is not a failure: what matters is the load after it. */
    const r = await exec(program, args);
    if (r.code !== 0 && args[0] !== 'bootout') {
      /* A TASK CREATED THAT WOULD NOT RUN, OR A UNIT ENABLED THAT WOULD NOT START, is still held and would start at the
         next log-on while `status` said off: it is taken back out too, and a failure here changes nothing more. */
      if (os === 'linux') await exec('systemctl', ['--user', 'disable', '--now', UNIT]);
      if (os === 'win32' && args[0] !== '/Create') await exec('schtasks', ['/Delete', '/TN', TASK, '/F']);
      fs.remove(unit.file);
      io.say(`${program} could not load the runner service, so it is off. Run braindog runner run in a terminal to see why.`);
      return REFUSED;
    }
  }
  io.answer?.({ value: { state: 'on', running: true } });
  io.say(`The runner service is on: this machine's runner starts at log-on and stays up, writing what it does to ${LOG_WORDS}. braindog runner service off stops it.`);
  return 0;
}

/** `service off`: unload the unit, which ends the runner, and remove its file. An `off` with nothing on says so and changes nothing. */
export async function serviceOff(io: ServiceIo): Promise<number> {
  const set = setUp(io);
  if (typeof set === 'string') return (io.say(set), REFUSED);
  const { os, unit, fs, exec, uid } = set;
  const before = await seen(os, exec, uid);
  if (fs.read(unit.file) === null && !before.loaded) {
    io.answer?.({ value: { state: 'off', running: false } });
    io.say('The runner service was already off.');
    return 0;
  }
  const steps: [string, string[]][] = !before.loaded
    ? []
    : os === 'darwin'
      ? [['launchctl', ['bootout', `gui/${uid}/${LABEL}`]]]
      : os === 'linux'
        ? [['systemctl', ['--user', 'disable', '--now', UNIT]]]
        : [...(before.running ? [['schtasks', ['/End', '/TN', TASK]] as [string, string[]]] : []), ['schtasks', ['/Delete', '/TN', TASK, '/F']]];
  for (const [program, args] of steps) {
    const r = await exec(program, args);
    if (r.code !== 0) {
      io.say(`${program} could not stop the runner service, so it was left on. Run braindog runner service off again.`);
      return REFUSED;
    }
  }
  fs.remove(unit.file);
  if (os === 'linux' && before.loaded) await exec('systemctl', ['--user', 'daemon-reload']);
  io.answer?.({ value: { state: 'off', running: false } });
  io.say('The runner service is off: the runner no longer starts at log-on. A job started from the record waits until a runner runs again.');
  return 0;
}

/** `service status`: off when there is no unit on disk, else on, and whether its runner is up, in words. */
export async function serviceStatus(io: ServiceIo): Promise<number> {
  const set = setUp(io);
  if (typeof set === 'string') return (io.say(set), REFUSED);
  const { os, unit, fs, exec, uid } = set;
  if (fs.read(unit.file) === null) {
    io.answer?.({ value: { state: 'off', running: false } });
    io.say('The runner service is off. braindog runner service on starts it.');
    return 0;
  }
  const now = await seen(os, exec, uid);
  io.answer?.({ value: { state: 'on', running: now.running } });
  io.say(now.running ? 'The runner service is on, running.' : `The runner service is on, not running. Its log, ${LOG_WORDS}, says why.`);
  return 0;
}

const anAddress = (text: string | undefined): string | null => {
  try {
    const url = new URL(text ?? '');
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.username === '' && url.password === '' && url.search === '' && url.hash === '' ? url.href.replace(/\/$/, '') : null;
  } catch {
    return null;
  }
};

/** The two verbs that take no word after them. */
const VERBS: Record<string, (io: ServiceIo) => Promise<number>> = { off: serviceOff, status: serviceStatus };

/** `braindog runner service <word>`, and the exit code the word decides. With no word, the three. */
export async function service(args: string[], io: ServiceIo): Promise<number> {
  const [word, ...rest] = args;
  if (word === undefined) return (SERVICE_USAGE.forEach((line) => io.say(line)), 0);
  if (word === 'on') {
    /* ONLY AN ADDRESS GOES INTO THE UNIT: a word that is not an http or https address with no user in it could be a key
       pasted in the wrong place, and the unit is a file anyone on this machine can read. */
    if (rest.length === 2 && rest[0] === '--host') {
      const host = anAddress(rest[1]);
      if (host === null) return (io.say('braindog runner service on --host takes the address of your BrainDog, such as https://app.brain.dog/<slug>.'), REFUSED);
      return serviceOn({ ...io, paths: { ...io.paths, host } });
    }
    if (rest.length === 0) return serviceOn(io);
  } else if (Object.hasOwn(VERBS, word) && rest.length === 0) return VERBS[word]!(io);
  /* A plain word is echoed, to catch a typo. Anything else could be a token pasted in the wrong place. */
  const echoed = /^[a-z]{1,16}$/.test(word) && word !== 'on' && !Object.hasOwn(VERBS, word);
  io.say(`braindog runner service takes on [--host <host>], off or status${echoed ? `, not ${word}` : ''}.`);
  return REFUSED;
}
