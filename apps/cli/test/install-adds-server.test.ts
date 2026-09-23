/**
 * `braindog install --replace` putting BrainDog's MCP server in where it takes the old tool's out: brief 2 of
 * `loop/research-switch-recheck.md` §3.
 *
 * MEASURED BEFORE THIS EXISTED, on HEAD at f88eb95b: the cut-over removed every the old tool server it could name and
 * added none, and the one line main.ts printed for BrainDog's server had no `CLAUDE_CONFIG_DIR`, so run as printed it
 * landed in whichever profile the shell was in. A session that reached the old tool only through a `.mcp.json` (the
 * `acme` shape, `C:\Repos\.mcp.json`) had no brain at all after `--apply`, and nothing said so.
 *
 * EVERY FILE HERE IS UNDER A TEMPORARY FOLDER, and each function is called with `home` set to it, so the real
 * `~/.claude.json` is never read. The temporary folder is in no git working tree, which `--mcp-json` requires.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { installEvery, installInto } from '../src/install.ts';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const scripts = join(APP, 'hooks');

/*
 * THE ENTRY WRITTEN OUT HERE, NOT IMPORTED, so the test says what a profile must end up holding rather than whatever
 * install.ts happens to build. It is the entry main.ts has printed for `claude mcp add-json` since the CLI shipped.
 */
const BRAINDOG = { type: 'stdio', command: 'node', args: [join(APP, 'src', 'main.ts').replaceAll('\\', '/'), 'mcp', '--agent', 'claude'] };
const PLUS = `  + mcpServers.braindog: ${JSON.stringify(BRAINDOG)}`;

const HB_SECRET = 'hb-token-never-printed-5a9c';
const SAM = { type: 'stdio', command: 'node', args: ['C:\\Tools\\legacy\\mcp\\brain-mcp.mjs'], env: { MCP_TOKEN: HB_SECRET } };

const scratch = mkdtempSync(join(tmpdir(), 'braindog-install-server-'));
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

/** A named profile whose `.claude.json` holds `config`, and whose `settings.json` already runs BrainDog's hooks. */
function profile(home: string, name: string, config: Record<string, unknown>) {
  const dir = join(home, name);
  mkdirSync(dir, { recursive: true });
  const claudeJson = join(dir, '.claude.json');
  const before = `${JSON.stringify(config, null, 2)}\n`;
  writeFileSync(claudeJson, before);
  /* The hooks are installed first, so each test reads only the server half of the change. */
  installInto(dir, { apply: true, scripts, home });
  return { dir, claudeJson, before };
}

const read = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as { mcpServers: Record<string, unknown>; projects?: Record<string, { mcpServers: Record<string, unknown> }> };

test('A PROFILE WHOSE .claude.json RUNS brain-mcp.mjs: the dry run lists + mcpServers.braindog beside the removal, and --apply writes it', () => {
  const home = folder('home');
  const p = profile(home, '.claude-quartz', { numStartups: 9, mcpServers: { brain: SAM, figma: { type: 'http', url: 'https://mcp.figma.com/mcp' } } });

  const dry = installInto(p.dir, { apply: false, replace: true, scripts, home });
  assert.ok(dry.includes("  - mcpServers.brain, the old tool's: node [1 argument hidden]"), dry.join('\n'));
  assert.ok(dry.includes(PLUS), `no + line for BrainDog's server:\n${dry.join('\n')}`);
  assert.equal(readFileSync(p.claudeJson, 'utf8'), p.before, 'the dry run changed the file');

  const applied = installInto(p.dir, { apply: true, replace: true, scripts, home });
  assert.ok(applied.includes(PLUS), applied.join('\n'));
  const now = read(p.claudeJson);
  assert.deepEqual(now.mcpServers, { figma: { type: 'http', url: 'https://mcp.figma.com/mcp' }, braindog: BRAINDOG });

  /* A second run finds nothing of the old tool's and BrainDog's server in, so it writes nothing and keeps no second copy. */
  const after = readFileSync(p.claudeJson, 'utf8');
  /* `checkout: home`, a folder in no git tree, so the last line is the file's and not the moving-checkout warning. */
  assert.deepEqual(installInto(p.dir, { apply: true, replace: true, scripts, home, checkout: home }).slice(-1), [`${p.claudeJson} registers no the old tool MCP server. Nothing to change.`]);
  assert.equal(readFileSync(p.claudeJson, 'utf8'), after);
  assert.deepEqual(readdirSync(p.dir).sort(), ['.claude.json', '.claude.json.bak', 'settings.json']);
});

test("A SERVER ONLY IN ONE PROJECT'S LOCAL SCOPE is replaced at user scope, since BrainDog's one server serves every folder", () => {
  const home = folder('home');
  const p = profile(home, '.claude-acme', { projects: { 'C:/Repos/acme': { allowedTools: [], mcpServers: { brain: SAM } } } });

  installInto(p.dir, { apply: true, replace: true, scripts, home });
  const now = read(p.claudeJson);
  assert.deepEqual(now.mcpServers, { braindog: BRAINDOG });
  assert.deepEqual(now.projects!['C:/Repos/acme']!.mcpServers, {});
});

/*
 * THIS CASE CHANGED WITH BRIEF 44-B (`loop/research-switch-left.md`). It asserted that a profile with no the old tool
 * server was not given BrainDog's either, and that was the fault: finding 2 of the same file measured that a new
 * name in a `.mcp.json` stays `Pending approval` wherever a `settings.local.json` approved the old one by name, so the
 * profile's own user-scope entry is the one that is started. The profile now gains the entry.
 * AND THE .mcp.json GAINS NOTHING, the half wave forty-four left because `hooks.test.ts` was another brief's then. It
 * asserted `{ braindog }` here, which is the entry finding 2 measured as `Pending approval` in `C:\Repos\acme` and
 * shadowed by the user-scope one wherever both exist: a prompt, and no server.
 */
test('A .mcp.json HOLDING THE ONLY THE OLD TOOL SERVER, the acme shape: after --apply the profile holds braindog, and the .mcp.json loses brain and gains nothing', () => {
  const home = folder('home');
  const p = profile(home, '.claude-acme', { mcpServers: {} });
  const repos = folder('repos');
  const file = join(repos, '.mcp.json');
  writeFileSync(file, `${JSON.stringify({ mcpServers: { brain: SAM }, note: 'kept' }, null, 2)}\n`);

  const dry = installEvery([p.dir], [], { apply: false, replace: true, scripts, home }, [file]);
  assert.ok(dry.includes(PLUS), dry.join('\n'));

  installEvery([p.dir], [], { apply: true, replace: true, scripts, home }, [file]);
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { mcpServers: {}, note: 'kept' });
  assert.deepEqual(read(p.claudeJson).mcpServers, { braindog: BRAINDOG });
});

/*
 * THE AUDIT'S OWN RUN, finding 5 of `loop/research-batch-forty-two-audit.md`: two profiles, `--replace --apply` over
 * both. Measured at 5287d8e4, `.claude-quartz` ended with `braindog`, `.claude-acme` with no server, and no line
 * said so, because the one line was withheld as soon as any file gained the entry. The audit asked for the line once,
 * naming `.claude-acme`; brief 44-B goes further and gives that profile the entry, so no line is owed.
 */
test('THE AUDIT’S TWO-PROFILE RUN through main.ts: both profiles end with braindog, and no hand-run line is printed for either', () => {
  const home = folder('home');
  const quartz = profile(home, '.claude-quartz', { mcpServers: { brain: SAM } });
  const acme = profile(home, '.claude-acme', { mcpServers: {} });
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(home, 'config') };
  for (const name of Object.keys(env)) if (name.startsWith('BRAINDOG_') || name === 'CLAUDE_CONFIG_DIR') delete env[name];
  const ran = spawnSync(process.execPath, [join(APP, 'src', 'main.ts'), 'install', '--replace', '--apply', '--config-dir', quartz.dir, '--config-dir', acme.dir], { cwd: home, env, encoding: 'utf8', timeout: 30_000 });

  assert.equal(ran.status, 0, ran.stderr);
  assert.deepEqual(read(quartz.claudeJson).mcpServers, { braindog: BRAINDOG });
  assert.deepEqual(read(acme.claudeJson).mcpServers, { braindog: BRAINDOG });
  assert.ok(!ran.stdout.includes('claude mcp add'), ran.stdout);
});

test('A FILE ALREADY HOLDING A braindog SERVER keeps it as it is: byte for byte with nothing else to do, and the entry itself untouched beside a removal', () => {
  const home = folder('home');
  const own = { type: 'stdio', command: 'braindog', args: ['mcp', '--agent', 'claude'] };

  /* Nothing of the old tool's: the file is not written, not copied, and not touched. A guard; HEAD passed it too. */
  const settled = profile(home, '.claude-settled', { mcpServers: { braindog: own } });
  const lines = installInto(settled.dir, { apply: true, replace: true, scripts, home });
  assert.ok(!lines.some((l) => l.startsWith('  + mcpServers.braindog')), lines.join('\n'));
  assert.equal(readFileSync(settled.claudeJson, 'utf8'), settled.before);
  assert.deepEqual(readdirSync(settled.dir).sort(), ['.claude.json', 'settings.json']);

  /* the old tool's beside it: the old tool's goes, and the person's own braindog entry is neither replaced nor added twice. */
  const both = profile(home, '.claude-both', { mcpServers: { braindog: own, brain: SAM } });
  const dry = installInto(both.dir, { apply: false, replace: true, scripts, home });
  assert.ok(!dry.some((l) => l.startsWith('  + mcpServers.braindog')), dry.join('\n'));
  assert.ok(dry.includes('  mcpServers.braindog is registered already, and is left as it is.'), dry.join('\n'));
  installInto(both.dir, { apply: true, replace: true, scripts, home });
  assert.deepEqual(read(both.claudeJson).mcpServers, { braindog: own });
});

/*
 * THE ADDED ENTRY GOES BACK WITH THE REMOVED ONES. Windows refuses a rename onto a read-only file, so the second
 * profile's `.claude.json` fails after the first profile's has been renamed into place, with BrainDog's server in it.
 * The rollback half passed at HEAD, where there was no entry to take back; what is new is that the entry was planned.
 */
test('A FAILURE IN A LATER FILE PUTS BACK THE ADDED ENTRY WITH THE REMOVED ONES', { skip: process.platform !== 'win32' }, () => {
  const home = folder('home');
  const a = profile(home, '.claude-a', { mcpServers: { brain: SAM } });
  const b = profile(home, '.claude-b', { mcpServers: { brain: SAM } });
  chmodSync(b.claudeJson, 0o444);

  const dry = installEvery([a.dir, b.dir], [], { apply: false, replace: true, scripts, home });
  assert.equal(dry.filter((l) => l === PLUS).length, 2, dry.join('\n'));

  assert.throws(() => installEvery([a.dir, b.dir], [], { apply: true, replace: true, scripts, home }), /changed nothing/);
  assert.equal(readFileSync(a.claudeJson, 'utf8'), a.before, 'the first profile kept BrainDog in and the old tool out');
  assert.equal(readFileSync(b.claudeJson, 'utf8'), b.before);
  assert.deepEqual(readdirSync(a.dir).sort(), ['.claude.json', 'settings.json']);
});

test('NO TOKEN IN THE ENTRY OR THE OUTPUT: the removed server’s env and headers are not carried into the new one', () => {
  const home = folder('home');
  const http = { type: 'http', url: `https://brain.example.com/mcp?token=${HB_SECRET}`, headers: { Authorization: `Bearer ${HB_SECRET}` } };
  const p = profile(home, '.claude-secret', { mcpServers: { brain: SAM, 'brain-http': http } });

  const lines = installInto(p.dir, { apply: true, replace: true, scripts, home });
  assert.ok(!lines.join('\n').includes(HB_SECRET), lines.join('\n'));
  const now = read(p.claudeJson);
  assert.deepEqual(now.mcpServers, { braindog: BRAINDOG });
  assert.ok(!readFileSync(p.claudeJson, 'utf8').includes(HB_SECRET), 'a token reached the written file');
  /* Exactly one line adds it, although two servers were removed from the one object. */
  assert.equal(lines.filter((l) => l.startsWith('  + mcpServers.braindog')).length, 1, lines.join('\n'));
});
