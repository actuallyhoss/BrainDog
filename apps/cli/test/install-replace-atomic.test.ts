/**
 * `braindog install --replace --apply` as all or nothing, what its printout withholds, and the proxied
 * registration it used to miss: findings 1, 4 and 5 of `loop/research-batch-twenty-four-audit.md`.
 *
 * EVERY FILE HERE IS UNDER A TEMPORARY FOLDER. The command is run with `HOME` and `USERPROFILE` pointed at it,
 * `CLAUDE_CONFIG_DIR` removed and each profile named with `--config-dir`, so the real `~/.claude` and
 * `~/.claude.json` are never read, and the functions are called with `home` set to the same folder.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { installEvery, installInto } from '../src/install.ts';
import { REPLACE, REPLACE_FILE } from './replace.ts';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const scripts = join(APP, 'hooks');

const scratch = mkdtempSync(join(tmpdir(), 'braindog-install-atomic-'));
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

const HB_START = 'powershell -NoProfile -ExecutionPolicy Bypass -File "C:\\Tools\\legacy\\hooks\\session-start.ps1"';

/** A profile as the cut-over finds it: the old tool's start hook in `settings.json` and its server in `.claude.json`. */
function profile(dir: string, servers: Record<string, unknown> = { brain: { type: 'stdio', command: 'node', args: ['C:\\Tools\\legacy\\mcp\\brain-mcp.mjs'] } }) {
  mkdirSync(dir, { recursive: true });
  const settings = join(dir, 'settings.json');
  const claudeJson = join(dir, '.claude.json');
  writeFileSync(settings, `${JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: 'command', command: HB_START }] }] } }, null, 2)}\n`);
  writeFileSync(claudeJson, `${JSON.stringify({ numStartups: 3, mcpServers: servers }, null, 2)}\n`);
  return { dir, settings, claudeJson };
}

/** Every file in a folder with its bytes, so "as it was" is compared whole and a stray `.tmp` or `.bak` is seen. */
const snapshot = (dir: string) => Object.fromEntries(readdirSync(dir).sort().map((name) => [name, readFileSync(join(dir, name), 'utf8')]));

function cli(args: string[], home: string) {
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(home, 'config') };
  for (const name of Object.keys(env)) if (name.startsWith('BRAINDOG_') || name === 'CLAUDE_CONFIG_DIR') delete env[name];
  const ran = spawnSync(process.execPath, [join(APP, 'src', 'main.ts'), ...args], { cwd: home, env, encoding: 'utf8', timeout: 30_000 });
  return { code: ran.status, stdout: ran.stdout, stderr: ran.stderr };
}

/* ── finding 1: all or nothing ─────────────────────────────────────────── */

/*
 * THE AUDIT'S OWN FAULT, A READ-ONLY `.claude.json`. Windows refuses a rename onto a read-only file, so the second
 * write fails after the first has been renamed into place. Measured before the fix: `settings.json` had lost Sam
 * Brain's hook, `.claude.json` still held its server, stdout was empty, and the `.tmp` left behind (made with the
 * original's read-only mode) failed every retry at `open`, each retry adding one more `.claude.json.bak`.
 */
test('A WRITE THAT FAILS ON THE SECOND FILE PUTS THE FIRST BACK, leaves no .tmp or .bak, says so, and a retry fails the same clean way', { skip: process.platform !== 'win32' }, () => {
  const home = folder('home');
  const a = profile(join(home, '.claude-a'));
  chmodSync(a.claudeJson, 0o444);
  const before = snapshot(a.dir);

  for (const attempt of ['first', 'retry']) {
    const ran = cli(['install', '--replace', REPLACE_FILE, '--apply', '--config-dir', a.dir], home);
    assert.equal(ran.code, 1, `${attempt}: ${ran.stdout}`);
    assert.deepEqual(snapshot(a.dir), before, `${attempt}: the profile is not as it was`);
    assert.ok(ran.stderr.includes('changed nothing'), `${attempt}: ${ran.stderr}`);
    assert.ok(ran.stderr.includes(`Writing ${a.claudeJson} failed`), `${attempt}: ${ran.stderr}`);
    for (const file of [a.settings, a.claudeJson]) assert.ok(ran.stderr.includes(`  ${file}\n`), `${attempt}: ${file} is not named as it was\n${ran.stderr}`);
  }
});

/*
 * A THIRD PROFILE THAT CANNOT BE READ STOPS THE OTHER TWO. Measured before the fix, through `main.ts`'s loop of one
 * `installInto` per profile: `.claude-a` and `.claude-b` were cut over and copied, and the only line printed was
 * the refusal of `.claude-c`. Every profile is now read before any is written.
 */
test('EVERY PROFILE IS READ BEFORE ANY IS WRITTEN: a malformed third profile leaves the first two as they were', () => {
  const home = folder('home');
  const a = profile(join(home, '.claude-a'));
  const b = profile(join(home, '.claude-b'));
  const c = profile(join(home, '.claude-c'));
  writeFileSync(c.settings, '{ "hooks": {}, }');
  const before = [snapshot(a.dir), snapshot(b.dir), snapshot(c.dir)];

  assert.throws(() => installEvery([a.dir, b.dir, c.dir], [], { apply: true, replace: REPLACE, scripts, home }), /is not valid JSON, so braindog install leaves it alone/);
  assert.deepEqual([snapshot(a.dir), snapshot(b.dir), snapshot(c.dir)], before);

  writeFileSync(c.settings, '{ "hooks": {} }');
  const lines = installEvery([a.dir, b.dir, c.dir], [], { apply: true, replace: REPLACE, scripts, home });
  for (const p of [a, b]) {
    assert.deepEqual(readdirSync(p.dir).sort(), ['.claude.json', '.claude.json.bak', 'settings.json', 'settings.json.bak', 'skills']);
    assert.ok(!readFileSync(p.settings, 'utf8').includes('session-start.ps1'));
    assert.ok(!readFileSync(p.claudeJson, 'utf8').includes('brain-mcp.mjs'));
  }
  assert.equal(lines.filter((l) => l.startsWith('Changed ')).length, 6, lines.join('\n'));
});

test('A STALE .tmp FROM AN EARLIER FAILED RUN, read-only as that run made it, does not block the next one, and one copy is kept per file', () => {
  const home = folder('home');
  const a = profile(join(home, '.claude-a'));
  writeFileSync(`${a.claudeJson}.tmp`, '{ "half": ');
  chmodSync(`${a.claudeJson}.tmp`, 0o444);

  const lines = installInto(a.dir, { apply: true, replace: REPLACE, scripts, home });
  assert.ok(lines.includes(`The file as it was is kept at ${a.claudeJson}.bak.`), lines.join('\n'));
  assert.deepEqual(readdirSync(a.dir).sort(), ['.claude.json', '.claude.json.bak', 'settings.json', 'settings.json.bak', 'skills']);
  assert.ok(!readFileSync(a.claudeJson, 'utf8').includes('brain-mcp.mjs'));
});

test('THE SAME FILE NAMED TWICE is written once, from one reading', () => {
  const home = folder('home');
  const a = profile(join(home, '.claude-a'));
  const lines = installEvery([a.dir], [a.settings], { apply: true, replace: REPLACE, scripts, home });
  assert.deepEqual(readdirSync(a.dir).sort(), ['.claude.json', '.claude.json.bak', 'settings.json', 'settings.json.bak', 'skills']);
  assert.equal(lines.filter((l) => l === `Changed ${a.settings}:`).length, 1, lines.join('\n'));
});

/* ── finding 4: what the printout withholds ────────────────────────────── */

const SECRETS = ['hb_live_SECRET_77', 'hb_live_SECRET_88', 'hb_live_SECRET_99', 'sk-ant-SECRET0042', 'SECRETheader31', 'SECRETquery55', 'SECRETword66', 'SECRETcolon1', 'SECRETcolon2'];

const LEAKY = {
  'token-in-args': { command: 'node', args: ['C:\\Tools\\legacy\\mcp\\brain-mcp.mjs', '--token', 'hb_live_SECRET_77'] },
  'token-in-path': { type: 'http', url: 'https://brain.example.com/mcp/hb_live_SECRET_88' },
  'token-joined': { command: 'node', args: ['C:\\Tools\\legacy\\mcp\\brain-mcp.mjs', '--api-key=sk-ant-SECRET0042'] },
  'token-in-one-string': { command: 'node C:\\Tools\\legacy\\mcp\\brain-mcp.mjs --secret hb_live_SECRET_99' },
  'token-bare': { command: 'node', args: ['C:\\Tools\\legacy\\mcp\\brain-mcp.mjs', 'SECRETword66a1b2c3d4'] },
  'proxied-with-header': {
    command: 'npx',
    args: ['-y', 'mcp-remote', 'https://brain.example.com/mcp?key=SECRETquery55', '--header', 'Authorization: Bearer SECRETheader31'],
  },
  /*
   * WITHOUT THE SPACE, as mcp-remote's own README writes it, because Windows splits an argument at a space. Measured
   * before the colon was read as a separator: `Authorization:Bearer` was hidden and the short key after it printed.
   */
  'proxied-header-no-space': { command: 'npx', args: ['-y', 'mcp-remote', 'https://brain.example.com/mcp', '--header', 'Authorization:Bearer SECRETcolon1'] },
  'proxied-header-short-flag': { command: 'npx', args: ['-y', 'mcp-remote', 'https://brain.example.com/mcp', '-H', 'Authorization:SECRETcolon2'] },
};

test('A TOKEN IN AN ARGUMENT, A PATH OR A QUERY IS NEVER PRINTED, on the dry run or under --json', () => {
  const home = folder('home');
  const a = profile(join(home, '.claude-a'), LEAKY);

  const text = installInto(a.dir, { apply: false, replace: REPLACE, scripts, home }).join('\n');
  for (const secret of SECRETS) assert.ok(!text.includes(secret.slice(0, 12)), `${secret} was printed:\n${text}`);
  /* Still readable: what runs is named, and what was withheld is marked rather than silently dropped. */
  assert.ok(text.includes("  - mcpServers.token-in-args, the old tool's: node [3 arguments hidden]"), text);
  assert.ok(text.includes("  - mcpServers.token-in-path, the old tool's: https://brain.example.com/mcp/[hidden]"), text);
  assert.ok(text.includes("  - mcpServers.token-joined, the old tool's: node [2 arguments hidden]"), text);
  assert.ok(text.includes("  - mcpServers.proxied-with-header, the old tool's: npx [5 arguments hidden]"), text);

  const ran = cli(['install', '--replace', REPLACE_FILE, '--json', '--config-dir', a.dir], home);
  assert.equal(ran.code, 0, ran.stderr);
  for (const secret of SECRETS) assert.ok(!`${ran.stdout}${ran.stderr}`.includes(secret.slice(0, 12)), `${secret} reached the envelope`);
  assert.ok(ran.stdout.includes('[hidden]'), ran.stdout);
});

/* ── finding 5: a proxied registration ─────────────────────────────────── */

/*
 * MEASURED BEFORE THE FIX: a profile whose only the old tool server went through `mcp-remote` printed "registers no
 * the old tool MCP server. Nothing to change." and kept it. The host is now looked for in the arguments too.
 */
test('A SERVER REGISTERED THROUGH A PROXY, npx mcp-remote https://brain.example.com/mcp, is named and removed, and a near miss is kept', () => {
  const home = folder('home');
  const a = profile(join(home, '.claude-a'), {
    remote: { command: 'npx', args: ['-y', 'mcp-remote', 'https://brain.example.com/mcp'] },
    'remote-one-string': { command: 'npx -y mcp-remote "https://BRAIN.example.com/mcp"' },
    dotted: { type: 'http', url: 'https://brain.example.com./mcp' },
    other: { command: 'npx', args: ['-y', 'mcp-remote', 'https://notbrain.example.com.example.com/mcp'] },
  });

  const dry = installInto(a.dir, { apply: false, replace: REPLACE, scripts, home });
  assert.ok(dry.includes("  - mcpServers.remote, the old tool's: npx [3 arguments hidden]"), dry.join('\n'));
  assert.ok(dry.some((l) => l.startsWith("  - mcpServers.remote-one-string, the old tool's: ")), dry.join('\n'));
  assert.ok(dry.some((l) => l.startsWith("  - mcpServers.dotted, the old tool's: ")), dry.join('\n'));
  assert.ok(!dry.some((l) => l.includes('mcpServers.other')), dry.join('\n'));

  installInto(a.dir, { apply: true, replace: REPLACE, scripts, home });
  const now = JSON.parse(readFileSync(a.claudeJson, 'utf8')) as { mcpServers: Record<string, unknown> };
  assert.deepEqual(Object.keys(now.mcpServers), ['other', 'braindog']);
  assert.ok(!existsSync(`${a.claudeJson}.tmp`));
});
