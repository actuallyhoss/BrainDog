/**
 * `braindog install --replace` over several named profiles, each of which must end with BrainDog's server.
 *
 * MEASURED BEFORE THIS EXISTED. The server went in only where Tallybook's came out, so the `client`
 * shape (Tallybook's hooks in `settings.json`, other servers in `.claude.json`, and Tallybook reached only through
 * `C:\Repos\.mcp.json`) was reported as "registers no Tallybook MCP server. Nothing to change." and kept no server
 * at all. And the one `claude mcp add-json` line main.ts prints for a profile left without one was decided by
 * `addsServer` over the lines of the whole run: one file gaining the entry anywhere was enough to print it for
 * nobody. A two-profile run ended with `.claude-studio` holding `braindog`, `.claude-client` holding
 * nothing, and no line saying so. And the `.mcp.json` is no substitute, as measured: a new name
 * there stays `Pending approval` wherever a `settings.local.json` approved the old one by name.
 *
 * EVERY FILE HERE IS UNDER A TEMPORARY FOLDER. The command is run with `HOME` and `USERPROFILE` pointed at it and
 * `CLAUDE_CONFIG_DIR` removed, and each function is called with `home` set to it, so no real profile is read.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { installEvery } from '../src/install.ts';
import { REPLACE, REPLACE_FILE } from './replace.ts';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const scripts = join(APP, 'hooks');

/* Written out, not imported, for the reason `install-adds-server.test.ts` gives. */
const BRAINDOG = { type: 'stdio', command: 'node', args: [join(APP, 'src', 'main.ts').replaceAll('\\', '/'), 'mcp', '--agent', 'claude'] };
const PLUS = `  + mcpServers.braindog: ${JSON.stringify(BRAINDOG)}`;
/*
 * THE HAND-RUN LINE FOR THIS MACHINE'S SHELL, written out for the same reason: PowerShell on Windows, where a bare
 * `--` is dropped before a `claude.ps1` and so is quoted, and `sh` elsewhere. `install-hand-line.test.ts` runs both.
 */
const WIN = process.platform === 'win32';
const HAND = `claude mcp add --scope user braindog ${WIN ? "'--'" : '--'} node '${BRAINDOG.args[0]}' mcp --agent claude`;
const inPs = (set: string) => `& { $was = $env:CLAUDE_CONFIG_DIR; $env:CLAUDE_CONFIG_DIR = ${set}; ${HAND}; $env:CLAUDE_CONFIG_DIR = $was }`;
const forProfile = (dir: string) => (WIN ? inPs(`'${dir.replaceAll("'", "''")}'`) : `CLAUDE_CONFIG_DIR='${dir}' ${HAND}`);
/* The default profile is named by the variable's absence, so the line clears the shell's own for the one call. */
const FOR_DEFAULT = WIN ? inPs('$null') : `(unset CLAUDE_CONFIG_DIR; ${HAND})`;

const SECRET = 'hb-token-never-printed-3e0f';
const HB_START = 'powershell -NoProfile -ExecutionPolicy Bypass -File "C:\\Tools\\tallybook\\hooks\\session-start.ps1"';
const OLD_SERVER = { type: 'stdio', command: 'node', args: ['C:\\Tools\\tallybook\\mcp\\tallybook-mcp.mjs'], env: { MCP_TOKEN: SECRET } };
const OLD_HTTP = { type: 'http', url: `https://tallybook.example/mcp?token=${SECRET}`, headers: { Authorization: `Bearer ${SECRET}` } };
const FIGMA = { type: 'http', url: 'https://mcp.figma.com/mcp' };
const BOT = { type: 'stdio', command: 'node', args: ['C:\\Repos\\bot\\mcp.mjs'], env: { DISCORD_TOKEN: SECRET } };

const scratch = mkdtempSync(join(tmpdir(), 'braindog-install-profiles-'));
/* A read-only file cannot be removed on Windows, so everything is made writable before the folder goes. */
after(() => {
  const loosen = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      chmodSync(path, 0o700);
      if (statSync(path).isDirectory()) loosen(path);
    }
  };
  loosen(scratch);
  rmSync(scratch, { recursive: true, force: true });
});
let folders = 0;
const folder = (name: string) => {
  const dir = join(scratch, `${name}-${String(folders++)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};

/** A named profile with Tallybook's start hook in `settings.json`, and `config` as its `.claude.json` unless null. */
function profile(home: string, name: string, config: Record<string, unknown> | null) {
  const dir = join(home, name);
  mkdirSync(dir, { recursive: true });
  const settings = join(dir, 'settings.json');
  writeFileSync(settings, `${JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: 'command', command: HB_START }] }] } }, null, 2)}\n`);
  const claudeJson = join(dir, '.claude.json');
  const before = config === null ? null : `${JSON.stringify(config, null, 2)}\n`;
  if (before !== null) writeFileSync(claudeJson, before);
  return { dir, settings, claudeJson, before };
}

/** Three profiles as a real machine held them, and the `.mcp.json` beside its repositories. */
function threeProfiles(home: string) {
  const studio = profile(home, '.claude-studio', { numStartups: 12, mcpServers: { brain: OLD_SERVER, figma: FIGMA } });
  /* The client shape: other servers, none of Tallybook's, since it reached Tallybook through the `.mcp.json`. */
  const client = profile(home, '.claude-client', { numStartups: 4, mcpServers: { figma: FIGMA } });
  const work = profile(home, '.claude-work', { mcpServers: { 'brain-http': OLD_HTTP } });
  const repos = folder('repos');
  const mcpJson = join(repos, '.mcp.json');
  writeFileSync(mcpJson, `${JSON.stringify({ mcpServers: { brain: OLD_SERVER, bot: BOT, figma: FIGMA } }, null, 2)}\n`);
  return { studio, client, work, mcpJson };
}

function cli(args: string[], home: string) {
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(home, 'config') };
  for (const name of Object.keys(env)) if (name.startsWith('BRAINDOG_') || name === 'CLAUDE_CONFIG_DIR' || name === 'MSYSTEM' || name === 'SHELL') delete env[name];
  const ran = spawnSync(process.execPath, [join(APP, 'src', 'main.ts'), ...args], { cwd: home, env, encoding: 'utf8', timeout: 30_000 });
  return { code: ran.status, stdout: ran.stdout, stderr: ran.stderr };
}

const servers = (file: string) => (JSON.parse(readFileSync(file, 'utf8')) as { mcpServers: Record<string, unknown> }).mcpServers;
/* The lines a dry run plans for one file: from its heading to the sentence that ends every file's plan. */
const planFor = (stdout: string, file: string): string[] => {
  const lines = stdout.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`braindog install --replace would change ${file}`));
  if (start < 0) return [];
  const end = lines.findIndex((l, i) => i > start && l.startsWith('Nothing was changed.'));
  return lines.slice(start, end < 0 ? undefined : end);
};
/* Every file under a folder with its bytes, keyed by its path from the folder, since skills/braindog/ nests one. */
function snapshot(dir: string, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    const key = prefix ? `${prefix}/${name}` : name;
    if (statSync(path).isDirectory()) Object.assign(out, snapshot(path, key));
    else out[key] = readFileSync(path, 'utf8');
  }
  return out;
}

test('THE CLIENT SHAPE, no Tallybook server in its .claude.json: the dry run plans + mcpServers.braindog there instead of "Nothing to change"', () => {
  const home = folder('home');
  const client = profile(home, '.claude-client', { numStartups: 4, mcpServers: { figma: FIGMA } });

  const dry = installEvery([client.dir], [], { apply: false, replace: REPLACE, scripts, home });
  assert.ok(!dry.includes(`${client.claudeJson} registers no Tallybook MCP server. Nothing to change.`), dry.join('\n'));
  assert.ok(dry.includes(`braindog install --replace would change ${client.claudeJson}:`), dry.join('\n'));
  assert.ok(dry.includes(PLUS), dry.join('\n'));
  assert.equal(readFileSync(client.claudeJson, 'utf8'), client.before, 'the dry run changed the file');
});

test('A PROFILE WITH NO .claude.json AT ALL gets one on --apply, holding only BrainDog’s server', () => {
  const home = folder('home');
  const bare = profile(home, '.claude-bare', null);

  const dry = installEvery([bare.dir], [], { apply: false, replace: REPLACE, scripts, home });
  assert.ok(dry.includes(`braindog install --replace would change ${bare.claudeJson}, a new file:`), dry.join('\n'));
  assert.ok(dry.includes(PLUS), dry.join('\n'));
  assert.ok(!existsSync(bare.claudeJson), 'the dry run made the file');

  const applied = installEvery([bare.dir], [], { apply: true, replace: REPLACE, scripts, home });
  assert.ok(applied.includes('There was no file before, so there is nothing to keep a copy of.'), applied.join('\n'));
  assert.deepEqual(JSON.parse(readFileSync(bare.claudeJson, 'utf8')), { mcpServers: { braindog: BRAINDOG } });
});

test('--APPLY OVER HIS THREE PROFILES, through main.ts: every .claude.json ends with braindog, the .mcp.json loses brain and keeps the rest, and no hand-run line is owed', () => {
  const home = folder('home');
  const { studio, client, work, mcpJson } = threeProfiles(home);
  const args = ['install', '--replace', REPLACE_FILE, '--config-dir', studio.dir, '--config-dir', client.dir, '--config-dir', work.dir, '--mcp-json', mcpJson];

  const dry = cli(args, home);
  assert.equal(dry.code, 0, dry.stderr);
  for (const p of [studio, client, work]) assert.ok(planFor(dry.stdout, p.claudeJson).includes(PLUS), `no + line for ${p.claudeJson}:\n${dry.stdout}`);
  /* The .mcp.json is planned, for Tallybook's removal, and plans no entry of BrainDog's. */
  assert.ok(planFor(dry.stdout, mcpJson).length > 0 && !planFor(dry.stdout, mcpJson).includes(PLUS), dry.stdout);
  /*
   * THE DRY RUN OWES NO HAND-RUN LINE EITHER, since it plans the entry for all three. Asked of the files alone it
   * would: none holds `braindog` until --apply, and a mutation reading only the files, not the plan, printed
   * the line three times here and kept every other test green.
   */
  assert.ok(!dry.stdout.includes('claude mcp add'), dry.stdout);

  const applied = cli([...args, '--apply'], home);
  assert.equal(applied.code, 0, applied.stderr);
  assert.deepEqual(servers(studio.claudeJson), { figma: FIGMA, braindog: BRAINDOG });
  assert.deepEqual(servers(client.claudeJson), { figma: FIGMA, braindog: BRAINDOG });
  assert.deepEqual(servers(work.claudeJson), { braindog: BRAINDOG });
  /* Everything else in the file Claude Code keeps its state in is carried through. */
  assert.equal((JSON.parse(readFileSync(client.claudeJson, 'utf8')) as { numStartups: number }).numStartups, 4);

  /*
   * THE .mcp.json LOSES TALLYBOOK'S, GAINS NOTHING, AND KEEPS THE REST AS IT WAS, the other two entries compared
   * whole. A new name in this file is only a prompt (see the header), so `braindog` is refused here.
   */
  const shared = servers(mcpJson);
  assert.ok(!('brain' in shared), JSON.stringify(shared));
  assert.ok(!('braindog' in shared), JSON.stringify(shared));
  assert.deepEqual(shared.bot, BOT);
  assert.deepEqual(shared.figma, FIGMA);

  /* Every named profile is served, so the line telling the owner to register one by hand is owed to none of them. */
  assert.ok(!applied.stdout.includes('claude mcp add'), applied.stdout);

  /* A second run has nothing left to do in any profile, and keeps no second copy. */
  const again = cli([...args, '--apply'], home);
  assert.equal(again.code, 0, again.stderr);
  for (const p of [studio, client, work]) {
    assert.ok(again.stdout.includes(`${p.claudeJson} registers no Tallybook MCP server. Nothing to change.`), again.stdout);
    assert.deepEqual(readdirSync(p.dir).sort(), ['.claude.json', '.claude.json.pre-braindog', 'settings.json', 'settings.json.pre-braindog', 'skills']);
  }
});

test('A PROFILE ALREADY HOLDING braindog is left byte for byte beside two that gain it', () => {
  const home = folder('home');
  const own = { type: 'stdio', command: 'braindog', args: ['mcp', '--agent', 'claude'] };
  const settled = profile(home, '.claude-settled', { mcpServers: { braindog: own, figma: FIGMA } });
  const studio = profile(home, '.claude-studio', { mcpServers: { brain: OLD_SERVER } });
  const client = profile(home, '.claude-client', { mcpServers: { figma: FIGMA } });

  const lines = installEvery([settled.dir, studio.dir, client.dir], [], { apply: true, replace: REPLACE, scripts, home });
  assert.ok(lines.includes(`${settled.claudeJson} registers no Tallybook MCP server. Nothing to change.`), lines.join('\n'));
  assert.equal(readFileSync(settled.claudeJson, 'utf8'), settled.before);
  assert.ok(!existsSync(`${settled.claudeJson}.pre-braindog`));
  assert.deepEqual(servers(studio.claudeJson), { braindog: BRAINDOG });
  assert.deepEqual(servers(client.claudeJson), { figma: FIGMA, braindog: BRAINDOG });
});

/*
 * THE THIRD PROFILE IS THE ONE THAT ONLY GAINS. Before this it was never written, so a read-only `.claude.json`
 * there failed nothing, and the run cut the first two over and exited 0 with the third left with no server.
 */
test('A FAILURE WRITING THE THIRD PROFILE PUTS THE FIRST TWO BACK AS THEY WERE', { skip: process.platform !== 'win32' }, () => {
  const home = folder('home');
  const { studio, work, client } = threeProfiles(home);
  chmodSync(client.claudeJson, 0o444);
  const before = [snapshot(studio.dir), snapshot(work.dir), snapshot(client.dir)];

  assert.throws(() => installEvery([studio.dir, work.dir, client.dir], [], { apply: true, replace: REPLACE, scripts, home }), /changed nothing/);
  assert.deepEqual([snapshot(studio.dir), snapshot(work.dir), snapshot(client.dir)], before);
});

/*
 * THE LINE IS OWED PER PROFILE, AND NAMES THE PROFILE. Without `--replace` no server is written, so each profile
 * without one is told how to register it. Before this the line was printed once, with no `CLAUDE_CONFIG_DIR`, so run
 * as printed it registered the server in whichever profile the shell was in, and it was printed for a profile that
 * already held `braindog` too.
 */
test('WITHOUT --replace, the hand-run line is printed once for each profile that holds no braindog, with CLAUDE_CONFIG_DIR naming it', () => {
  const home = folder('home');
  const settled = profile(home, '.claude-settled', { mcpServers: { braindog: BRAINDOG } });
  const client = profile(home, '.claude-client', { mcpServers: { figma: FIGMA } });
  const bare = profile(home, '.claude-bare', null);

  const ran = cli(['install', '--config-dir', settled.dir, '--config-dir', client.dir, '--config-dir', bare.dir], home);
  assert.equal(ran.code, 0, ran.stderr);
  const hand = ran.stdout.split('\n').filter((l) => l.includes('claude mcp add'));
  assert.deepEqual(hand, [forProfile(client.dir), forProfile(bare.dir)], ran.stdout);
});

/*
 * THREE BRANCHES OF THE PER-PROFILE LINE THAT NOTHING ABOVE REACHES. Each was removed in turn as a mutation and the suite
 * stayed green: the prefix on the default profile, the one-line-per-file dedupe, and the `mcpServers` that is not an
 * object, which gains no entry and so is still owed the line.
 */
test('THE DEFAULT ~/.claude PROFILE gets the line that clears CLAUDE_CONFIG_DIR, a profile named twice gets one line, and one whose mcpServers is a list is still owed it under --replace', () => {
  const home = folder('home');
  /* No `--config-dir` and no `CLAUDE_CONFIG_DIR`: the profile is `~/.claude`, whose servers are in `~/.claude.json`. */
  const bare = cli(['install'], home);
  assert.equal(bare.code, 0, bare.stderr);
  assert.deepEqual(bare.stdout.split('\n').filter((l) => l.includes('claude mcp add')), [FOR_DEFAULT], bare.stdout);

  const client = profile(home, '.claude-client', { mcpServers: { figma: FIGMA } });
  const twice = cli(['install', '--config-dir', client.dir, '--config-dir', client.dir], home);
  assert.equal(twice.code, 0, twice.stderr);
  assert.deepEqual(twice.stdout.split('\n').filter((l) => l.includes('claude mcp add')), [forProfile(client.dir)], twice.stdout);

  const listed = profile(home, '.claude-listed', { mcpServers: [] });
  const refused = cli(['install', '--replace', REPLACE_FILE, '--config-dir', listed.dir], home);
  assert.equal(refused.code, 0, refused.stderr);
  assert.ok(refused.stdout.includes(`${listed.claudeJson} registers no Tallybook MCP server. Nothing to change. Its mcpServers is not an object`), refused.stdout);
  assert.deepEqual(refused.stdout.split('\n').filter((l) => l.includes('claude mcp add')), [forProfile(listed.dir)], refused.stdout);
});

test('NO TOKEN IN ANY ENTRY OR LINE, on the dry run, on --apply, or in a file written', () => {
  const home = folder('home');
  const { studio, client, work, mcpJson } = threeProfiles(home);
  const args = ['install', '--replace', REPLACE_FILE, '--config-dir', studio.dir, '--config-dir', client.dir, '--config-dir', work.dir, '--mcp-json', mcpJson];

  for (const run of [cli(args, home), cli([...args, '--json'], home), cli([...args, '--apply'], home)]) {
    assert.equal(run.code, 0, run.stderr);
    assert.ok(!`${run.stdout}${run.stderr}`.includes(SECRET), run.stdout);
  }
  /* The token that stays is bot's own, in its own entry; none was carried into a braindog entry. */
  for (const file of [studio.claudeJson, client.claudeJson, work.claudeJson]) assert.ok(!readFileSync(file, 'utf8').includes(SECRET), `${file} holds a token`);
  assert.ok(!JSON.stringify(servers(mcpJson).braindog ?? {}).includes(SECRET));
});
