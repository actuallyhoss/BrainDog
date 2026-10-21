/**
 * `braindog doctor`: what still names a replaced tool, and what holds something shaped like a key, listed and never
 * changed.
 *
 * WRITTEN BEFORE `src/doctor.ts` EXISTED, when every case here failed on the import. `install --replace` takes the old
 * tool out of the files it is pointed at, and nothing said afterwards what was left: the one reading of a real machine
 * was done by hand, once, for one app. So a home is planted with each kind of place, and each must come back named by
 * its file and its entry.
 *
 * EVERY FILE IS UNDER A TEMPORARY FOLDER and `home` is always passed, so no real profile and no real crontab is read.
 * The crontab is a text handed in, as the command hands in what `crontab -l` printed.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { doctor, installedOf, planDoctor, printDoctor, profilesIn } from '../src/doctor.ts';
import { codex, cursor } from '../src/clients/index.ts';
import { BRAINDOG_SERVER, hookCommand, readReplace } from '../src/install.ts';
import { REPLACE, REPLACE_FILE } from './replace.ts';

const scripts = join(dirname(fileURLToPath(import.meta.url)), '..', 'hooks');

/* Made up, in the shape of a key: a known prefix, letters and digits mixed. It must never reach a line. */
const TOKEN = 'hb_live_4f9K2mQ8xZ71';
/* Eight characters with no prefix, the shape a length test alone lets through. */
const SHORT = 'q7Rw2xT9';

const OLD_HOOK = `sh /opt/tallybook/hooks/session-start.sh --token ${TOKEN}`;
const OLD_SERVER = { type: 'stdio', command: 'node', args: ['/opt/tallybook/mcp/tallybook-mcp.mjs', '--hb', TOKEN] };
const OLD_SKILL = '---\nname: old-brain\ndescription: Read and write the shared brain at https://tallybook.example.\n---\n\n# Tallybook\n';
/* Notes that mention the host in their body and not in their description: no skill of the old tool's (H.620). */
const NOTES = '---\nname: notes\ndescription: Notes on moving between tools.\n---\n\nWe left https://tallybook.example in March.\n';
const CRONTAB = `# nightly\n0 3 * * * node /opt/tallybook/mcp/tallybook-mcp.mjs sync ${SHORT}\n15 4 * * * /usr/bin/true\n`;

/* No real process, installed command or other app is read unless a case hands its own in. */
const quiet = { ps: () => [], installed: () => null, clients: [] };

const scratch = mkdtempSync(join(tmpdir(), 'braindog-doctor-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
let homes = 0;
const newHome = () => {
  const dir = join(scratch, `home-${String(homes++)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};
const json = (file: string, value: unknown) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};

/** One hash of every file under a folder, by path and bytes: what "it changes nothing" is held to. */
const hashOf = (dir: string): string => {
  const hash = createHash('sha256');
  const walk = (at: string) => {
    for (const name of readdirSync(at).sort()) {
      const path = join(at, name);
      hash.update(path);
      if (statSync(path).isDirectory()) walk(path);
      else hash.update(readFileSync(path));
    }
  };
  walk(dir);
  return hash.digest('hex');
};

/** BrainDog's own entries, as `install` and the hand-run line leave a profile. */
const ours = {
  hooks: {
    SessionStart: [{ hooks: [{ type: 'command', command: hookCommand('start', scripts), timeout: 10 }] }],
    SessionEnd: [{ hooks: [{ type: 'command', command: hookCommand('end', scripts), timeout: 10 }] }],
  },
};

/** A home where the old tool is still everywhere: a server, a hook, a skill, and a project file under `work/`. */
function planted() {
  const home = newHome();
  const profile = join(home, '.claude');
  const servers = join(home, '.claude.json');
  const settings = join(profile, 'settings.json');
  json(servers, { mcpServers: { brain: OLD_SERVER, braindog: BRAINDOG_SERVER } });
  json(settings, { hooks: { ...ours.hooks, SessionStart: [...ours.hooks.SessionStart, { hooks: [{ type: 'command', command: OLD_HOOK }] }] } });
  mkdirSync(join(profile, 'skills', 'old-brain'), { recursive: true });
  mkdirSync(join(profile, 'skills', 'notes'), { recursive: true });
  writeFileSync(join(profile, 'skills', 'old-brain', 'SKILL.md'), OLD_SKILL);
  writeFileSync(join(profile, 'skills', 'notes', 'SKILL.md'), NOTES);
  const project = join(home, 'work', 'shop', '.mcp.json');
  json(project, { mcpServers: { tally: { url: 'https://tallybook.example/mcp' } } });
  writeFileSync(join(home, '.zshrc'), `export PATH=$PATH:/usr/local/bin\nsh /opt/tallybook/hooks/session-end.sh\n`);
  return { home, profile, servers, settings, project, skill: join(profile, 'skills', 'old-brain', 'SKILL.md') };
}

const has = (places: { file: string; entry: string; kind: string }[], kind: string, file: string, entry: string) =>
  assert.ok(
    places.some((p) => p.kind === kind && p.file === file && p.entry === entry),
    `no ${kind} at ${file}, ${entry}:\n${JSON.stringify(places, null, 2)}`,
  );

test('EACH PLANTED PLACE IS FOUND, named by its file and its entry', () => {
  const p = planted();
  const report = planDoctor({ home: p.home, profiles: [p.profile], replace: REPLACE, under: [join(p.home, 'work')], crontab: CRONTAB });
  has(report.places, 'server', p.servers, 'mcpServers.brain');
  has(report.places, 'hook', p.settings, 'hooks.SessionStart');
  has(report.places, 'skill', p.skill, 'description');
  has(report.places, 'schedule', 'crontab', 'line 2');
  has(report.places, 'server', p.project, 'mcpServers.tally');
  has(report.places, 'startup', join(p.home, '.zshrc'), 'line 2');
  has(report.places, 'key', p.servers, 'mcpServers.brain');
  has(report.places, 'key', p.settings, 'hooks.SessionStart');
  /* The notes folder names the host in its body only, the other crontab line names nothing, and BrainDog's own are left. */
  assert.equal(report.places.filter((x) => x.kind === 'skill').length, 1);
  assert.equal(report.places.filter((x) => x.kind === 'schedule').length, 1);
  assert.ok(!report.places.some((x) => x.entry === 'mcpServers.braindog'), JSON.stringify(report.places));
});

test('THE PRINTED LINES NAME EACH FILE AND ENTRY, and the tool by its name', () => {
  const p = planted();
  const lines = printDoctor(planDoctor({ home: p.home, profiles: [p.profile], replace: REPLACE, under: [], crontab: CRONTAB }), p.home);
  const text = lines.join('\n');
  for (const [file, entry] of [
    [p.servers, 'mcpServers.brain'],
    [p.settings, 'hooks.SessionStart'],
    [p.skill, 'description'],
    ['crontab', 'line 2'],
  ] as const)
    assert.ok(
      lines.some((l) => l.includes(file.replace(p.home, '~')) && l.includes(entry)),
      `no line for ${file}, ${entry}:\n${text}`,
    );
  assert.match(text, /Tallybook/);
  assert.doesNotMatch(text, /—/, 'an em dash in a line a person reads');
});

test('THE TOKEN IS NEVER PRINTED, in the lines or in the JSON, whole or short', () => {
  const p = planted();
  const out = doctor(['--replaced', REPLACE_FILE, '--under', join(p.home, 'work'), '--json'], { ...quiet, home: p.home, env: {}, crontab: () => CRONTAB });
  const all = `${out.lines.join('\n')}\n${JSON.stringify(out.report)}`;
  assert.ok(!all.includes(TOKEN), `the token was printed:\n${all}`);
  assert.ok(!all.includes(SHORT), `the short token was printed:\n${all}`);
  assert.ok(!all.includes('--token'), 'a hook was printed with its arguments');
  assert.equal(out.json, true);
});

test('EXIT 1 WHEN ANYTHING IS LISTED, and the home is byte for byte what it was', () => {
  const p = planted();
  const before = hashOf(p.home);
  const out = doctor(['--replaced', REPLACE_FILE, '--under', join(p.home, 'work')], { ...quiet, home: p.home, env: {}, crontab: () => CRONTAB });
  assert.equal(out.code, 1);
  assert.ok(out.report.places.length >= 6, JSON.stringify(out.report.places));
  assert.equal(hashOf(p.home), before, 'doctor changed the home');
});

test('A KEY IS LISTED WITHOUT --replaced TOO, and the old tool is not looked for', () => {
  const p = planted();
  const out = doctor([], { ...quiet, home: p.home, env: {}, crontab: () => CRONTAB });
  assert.equal(out.code, 1);
  assert.deepEqual([...new Set(out.report.places.map((x) => x.kind))], ['key']);
});

test('A CLEAN HOME EXITS 0: BrainDog served, both hooks, nothing of the old tool', () => {
  const home = newHome();
  json(join(home, '.claude.json'), { mcpServers: { braindog: BRAINDOG_SERVER } });
  json(join(home, '.claude', 'settings.json'), ours);
  const before = hashOf(home);
  const out = doctor(['--replaced', REPLACE_FILE], { ...quiet, home, env: {}, crontab: () => '15 4 * * * /usr/bin/true\n' });
  assert.equal(out.code, 0, out.lines.join('\n'));
  assert.deepEqual(out.report.places, []);
  assert.deepEqual(out.report.profiles, [{ dir: join(home, '.claude'), server: 'this', start: true, end: true }]);
  assert.equal(hashOf(home), before);
});

test('A PROFILE WITHOUT BRAINDOG IS LISTED: no server, and the hook that is missing is named', () => {
  const home = newHome();
  json(join(home, '.claude-studio', 'settings.json'), { hooks: { SessionStart: ours.hooks.SessionStart } });
  const out = doctor([], { ...quiet, home, env: {}, crontab: () => null });
  assert.deepEqual(out.report.profiles, [{ dir: join(home, '.claude-studio'), server: 'none', start: true, end: false }]);
  assert.equal(out.code, 1);
  assert.ok(out.report.places.some((x) => x.kind === 'profile' && x.entry === 'mcpServers.braindog'));
  assert.ok(out.report.places.some((x) => x.kind === 'profile' && x.entry === 'hooks.SessionEnd'));
});

test('EVERY PROFILE IN THE HOME IS FOUND: .claude and each .claude-<name> that holds settings', () => {
  const home = newHome();
  json(join(home, '.claude', 'settings.json'), {});
  json(join(home, '.claude-work', 'settings.json'), {});
  mkdirSync(join(home, '.claude-empty'));
  assert.deepEqual(profilesIn(home, [], {}), [join(home, '.claude'), join(home, '.claude-work')]);
  assert.deepEqual(profilesIn(home, [join(home, 'elsewhere')], {}), [join(home, 'elsewhere')]);
});

test('EVERY CCENV PROFILE IS FOUND, under CCENV_HOME when it is set, and a profile reached twice is read once', () => {
  const home = newHome();
  const profiles = join(home, '.ccenv', 'profiles');
  json(join(home, '.claude', 'settings.json'), {});
  json(join(profiles, 'studio', 'settings.json'), {});
  json(join(profiles, 'work', 'settings.json'), {});
  mkdirSync(join(profiles, 'empty'), { recursive: true });
  /* A link in the home names one of them, and ccenv's own switch sets CLAUDE_CONFIG_DIR to another. */
  symlinkSync(join(profiles, 'work'), join(home, '.claude-work'), 'junction');
  assert.deepEqual(profilesIn(home, [], { CLAUDE_CONFIG_DIR: join(profiles, 'studio') }), [join(home, '.claude'), join(home, '.claude-work'), join(profiles, 'studio')]);
  /* Set, CCENV_HOME is where ccenv's profiles are looked for, and `~/.ccenv` is not. */
  const elsewhere = join(home, 'tools', 'ccenv');
  json(join(elsewhere, 'profiles', 'lab', 'settings.json'), {});
  assert.deepEqual(profilesIn(home, [], { CCENV_HOME: elsewhere }), [join(home, '.claude'), join(home, '.claude-work'), join(elsewhere, 'profiles', 'lab')]);
  /* An empty CCENV_HOME is no CCENV_HOME, as an empty CLAUDE_CONFIG_DIR is none. */
  assert.deepEqual(profilesIn(home, [], { CCENV_HOME: '', CLAUDE_CONFIG_DIR: '' }), profilesIn(home, [], {}));
});

test('A CCENV PROFILE IS NAMED BY ITS NAME, and its servers are read from its own folder', () => {
  const home = newHome();
  const studio = join(home, '.ccenv', 'profiles', 'studio');
  json(join(studio, 'settings.json'), ours);
  json(join(studio, '.claude.json'), { mcpServers: { braindog: BRAINDOG_SERVER } });
  const out = doctor([], { ...quiet, home, env: {}, crontab: () => null });
  assert.ok(out.lines.includes("Claude Code, ccenv profile studio: BrainDog's server is registered and runs this command. Both hooks are there."), out.lines.join('\n'));
  assert.equal(out.code, 0, out.lines.join('\n'));
  /* Under another CCENV_HOME the profile is named by it too. */
  const other = join(home, 'tools', 'ccenv');
  json(join(other, 'profiles', 'lab', 'settings.json'), ours);
  const there = doctor([], { ...quiet, home, env: { CCENV_HOME: other }, crontab: () => null });
  assert.ok(there.lines.some((l) => l.startsWith('Claude Code, ccenv profile lab: ')), there.lines.join('\n'));
});

test('ARGUMENTS IT DOES NOT KNOW ARE REFUSED IN ONE SENTENCE, and so is a replace file that does not read', () => {
  const home = newHome();
  assert.throws(() => doctor(['--apply'], { ...quiet, home, env: {}, crontab: () => null }), /braindog doctor takes/);
  assert.throws(() => doctor(['--replaced', join(home, 'none.json')], { ...quiet, home, env: {}, crontab: () => null }), /could not be read as JSON/);
});

/* ── every app, and every old server process ───────────────────────────── */

/* Codex reads `CODEX_HOME` before the home it is handed, so a runner that sets it would point the case at a real file. */
delete process.env.CODEX_HOME;

const INSTALLED = { file: '/opt/braindog/apps/cli/src/main.ts', changed: Date.parse('2026-10-14T12:00:00Z') };
const BEFORE = Date.parse('2026-10-13T09:00:00Z');
const AFTER = Date.parse('2026-10-14T13:00:00Z');

/**
 * A home with Claude Code's default profile clean, Cursor with BrainDog's server and a key in an entry's environment,
 * and Codex with the old tool's server and none of BrainDog's. And the machine's processes: Claude Code with a
 * BrainDog server started before the command changed (its command line holding a key), one started after, and an app
 * with a server that names no `--agent`, found by its parent.
 */
function everyApp() {
  const home = newHome();
  json(join(home, '.claude.json'), { mcpServers: { braindog: BRAINDOG_SERVER } });
  json(join(home, '.claude', 'settings.json'), ours);
  json(join(home, '.cursor', 'mcp.json'), {
    mcpServers: { braindog: { type: 'stdio', command: 'node', args: [BRAINDOG_SERVER.args[0], 'mcp', '--agent', 'cursor'] }, notes: { command: 'notes-mcp', env: { NOTES_API_TOKEN: TOKEN } } },
  });
  mkdirSync(join(home, '.codex'), { recursive: true });
  writeFileSync(join(home, '.codex', 'config.toml'), `[mcp_servers.brain]\ncommand = "node"\nargs = ["/opt/tallybook/mcp/tallybook-mcp.mjs"]\n\n[mcp_servers.ok]\nurl = "https://tools.example/mcp"\nbearer_token_env_var = "TOOLS_TOKEN"\n`);
  const ps = () => [
    { pid: 1, ppid: 0, started: BEFORE, command: '/sbin/launchd' },
    { pid: 40, ppid: 1, started: BEFORE, command: '/usr/local/bin/claude --resume' },
    { pid: 41, ppid: 40, started: BEFORE, command: `node ${INSTALLED.file} mcp --agent claude --hb ${TOKEN}` },
    { pid: 42, ppid: 40, started: AFTER, command: `node ${INSTALLED.file} mcp --agent claude` },
    { pid: 43, ppid: 40, started: BEFORE, command: `node ${INSTALLED.file} context --json` },
  ];
  return { home, ps };
}

const appsIo = (x: ReturnType<typeof everyApp>) => ({ home: x.home, env: {}, crontab: () => null, clients: [cursor, codex], ps: x.ps, installed: () => INSTALLED });

test('EVERY APP AND THE OLD PROCESS IN THREE LINES OF WORDS: Cursor has BrainDog, Codex has the old tool, Claude Code to restart', () => {
  const x = everyApp();
  const out = doctor(['--replaced', REPLACE_FILE], appsIo(x));
  const text = out.lines.join('\n');
  assert.ok(out.lines.includes("Cursor: BrainDog's server is registered and runs this command."), text);
  assert.ok(out.lines.includes("Codex: BrainDog's server is not registered. A server of Tallybook's is still there."), text);
  assert.ok(out.lines.includes('Started before this command was updated: restart Claude Code.'), text);
  /* The profile by its name, and each file under the home as `~`, never the folder a temporary home sits in. */
  assert.ok(out.lines.includes("Claude Code, the default profile: BrainDog's server is registered and runs this command. Both hooks are there."), text);
  assert.ok(!text.includes(x.home), `a path a person cannot act on:\n${text}`);
  assert.ok(out.lines.some((l) => l.includes('~/.codex/config.toml') && l.includes('mcp_servers.brain')), text);
  /* The server started after the change, and a process that is no server, are not listed. */
  assert.deepEqual(out.report.places.filter((p) => p.kind === 'process').map((p) => p.entry), ['process 41']);
  assert.deepEqual(out.report.apps, [
    { app: 'Cursor', server: 'this', replaced: false, unread: false },
    { app: 'Codex', server: 'none', replaced: true, unread: false },
  ]);
  assert.equal(out.code, 1);
});

test('A CONFIG HOLDING A TOKEN NEVER PRINTS IT: named by its file and entry, in the lines and in the JSON', () => {
  const x = everyApp();
  const out = doctor(['--replaced', REPLACE_FILE, '--json'], appsIo(x));
  const all = `${out.lines.join('\n')}\n${JSON.stringify(out.report)}`;
  assert.ok(!all.includes(TOKEN), `the token was printed:\n${all}`);
  assert.ok(!all.includes('--hb') && !all.includes('notes-mcp'), `a command line was copied out:\n${all}`);
  assert.ok(out.report.places.some((p) => p.kind === 'key' && p.file === '~/.cursor/mcp.json' && p.entry === 'mcpServers.notes'), JSON.stringify(out.report.places));
  /* A bearer token Codex reads from a variable is a name, not a key. */
  assert.ok(!out.report.places.some((p) => p.entry === 'mcp_servers.ok'), JSON.stringify(out.report.places));
});

test('A SERVER WITH NO --agent IS PUT TO THE APP AMONG ITS PARENTS, and one app with two old servers is one line', () => {
  const home = newHome();
  const ps = () => [
    { pid: 7, ppid: 1, started: BEFORE, command: '/Applications/Cursor.app/Contents/MacOS/Cursor' },
    { pid: 8, ppid: 7, started: BEFORE, command: '/bin/sh -c node' },
    { pid: 9, ppid: 8, started: BEFORE, command: `node "${INSTALLED.file}" mcp` },
    { pid: 10, ppid: 8, started: BEFORE, command: `node ${INSTALLED.file} mcp --agent other` },
    { pid: 11, ppid: 99, started: BEFORE, command: `node ${INSTALLED.file} mcp --agent other` },
  ];
  const out = doctor([], { home, env: {}, crontab: () => null, clients: [], ps, installed: () => INSTALLED });
  assert.ok(out.lines.includes('Started before this command was updated: restart Cursor (2 servers).'), out.lines.join('\n'));
  assert.ok(out.lines.includes('Started before this command was updated: restart the app that started it.'), out.lines.join('\n'));
  /* Without an installed command to compare with, no process is listed. */
  assert.equal(doctor([], { home, env: {}, crontab: () => null, clients: [], ps, installed: () => null }).report.places.length, 0);
});

test('THE EXAMPLE REPLACE FILE READS AS install READS ONE, and names an invented tool', () => {
  const file = fileURLToPath(new URL('../replace.example.json', import.meta.url));
  const r = readReplace(file);
  assert.equal(r.name, 'Ledgerline');
  assert.ok(r.hooks.length > 0 && r.programs.length > 0 && r.hosts.length > 0 && r.skills.length > 0);
  assert.ok(r.programs[0]!.test('node /srv/ledgerline/ledgerline-mcp.mjs'));
  const home = newHome();
  json(join(home, '.claude', 'settings.json'), ours);
  json(join(home, '.claude.json'), { mcpServers: { braindog: BRAINDOG_SERVER, ledger: { url: 'https://api.ledgerline.example/mcp' } } });
  const out = doctor(['--replaced', file], { ...quiet, home, env: {}, crontab: () => null });
  assert.ok(out.lines.includes('Still naming Ledgerline:'), out.lines.join('\n'));
  assert.ok(out.lines.some((l) => l.startsWith('  ~/.claude.json, mcpServers.ledger: ')), out.lines.join('\n'));
});

test('THE INSTALLED COMMAND IS THE FILE A SERVER RUNS, and a checkout is as new as its newest source, packages too', () => {
  /* Never the name the command was typed by: a link on the path keeps its own name in process.argv[1]. */
  assert.equal(installedOf()?.file.replaceAll('\\', '/'), BRAINDOG_SERVER.args[0]);
  const top = join(newHome(), 'checkout');
  const main = join(top, 'apps', 'cli', 'src', 'main.ts');
  const tool = join(top, 'packages', 'mcp', 'src', 'tools.ts');
  const check = join(top, 'packages', 'mcp', 'test', 'tools.test.ts');
  for (const file of [main, tool, check]) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, '');
  }
  const at = (file: string, iso: string) => utimesSync(file, new Date(iso), new Date(iso));
  at(main, '2026-10-01T00:00:00Z');
  at(tool, '2026-10-05T00:00:00Z');
  at(check, '2026-10-09T00:00:00Z');
  /* A pull that changed only a package moves the build's time; a test, which no server runs, does not. */
  assert.equal(installedOf(main)?.changed, Date.parse('2026-10-05T00:00:00Z'));
  const bundle = join(top, 'braindog.mjs');
  writeFileSync(bundle, '');
  at(bundle, '2026-10-07T00:00:00Z');
  assert.deepEqual(installedOf(bundle), { file: bundle, changed: Date.parse('2026-10-07T00:00:00Z') });
  assert.equal(installedOf(join(top, 'gone.mjs')), null);
});
