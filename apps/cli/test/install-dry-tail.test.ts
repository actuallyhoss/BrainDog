/**
 * The dry run's closing line is the command that writes what it showed: brief 53-A of
 * `loop/research-cutover-day.md` §9, from its §7 item 1.
 *
 * MEASURED BEFORE THIS EXISTED, at 683b250c, on copies of his three profiles: the dry run printed "Nothing was
 * changed. Run braindog install --replace --apply to write it." ten times, once per file, and never with the
 * `--config-dir` or `--mcp-json` it was given. Run as printed from his quartz window (`CLAUDE_CONFIG_DIR` set to
 * that profile), it cut over quartz alone: the default and acme profiles kept the old tool's hooks and skill, and
 * `C:\Repos\.mcp.json` kept its `brain` server.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPLACE_FILE } from './replace.ts';

const MAIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'main.ts');
const SAM = { type: 'stdio', command: 'node', args: ['C:\\Tools\\legacy\\mcp\\brain-mcp.mjs'], env: {} };
const HB = (which: string) => `powershell -NoProfile -ExecutionPolicy Bypass -File C:/Tools/legacy/hooks/session-${which}.ps1`;

const scratch = mkdtempSync(join(tmpdir(), 'braindog-dry-tail-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

function profile(name: string): string {
  const dir = join(scratch, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: 'command', command: HB('start'), timeout: 20 }] }], SessionEnd: [{ hooks: [{ type: 'command', command: HB('end'), timeout: 15 }] }] } }, null, 2));
  writeFileSync(join(dir, '.claude.json'), JSON.stringify({ mcpServers: { brain: SAM } }, null, 2));
  return dir;
}

test('the dry run ends once, with every --config-dir and the --mcp-json it was given', () => {
  const quartz = profile('quartz');
  const acme = profile('acme');
  const mcp = join(scratch, 'repos', '.mcp.json');
  mkdirSync(dirname(mcp), { recursive: true });
  writeFileSync(mcp, JSON.stringify({ mcpServers: { brain: SAM } }, null, 2));
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: scratch, USERPROFILE: scratch };
  delete env.CLAUDE_CONFIG_DIR;
  const run = spawnSync(process.execPath, ['--experimental-strip-types', MAIN, 'install', '--replace', REPLACE_FILE, '--config-dir', quartz, '--config-dir', acme, '--mcp-json', mcp], { env, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const tails = run.stdout.split('\n').filter((line) => line.startsWith('Nothing was changed.'));
  assert.equal(tails.length, 1, run.stdout);
  const [tail = ''] = tails;
  for (const word of ['--replace', '--apply', quartz, acme, mcp]) assert.ok(tail.includes(word), `${word} is not in: ${tail}`);
  /*
   * ONE 'Close every session' LINE PER PROFILE THAT LOSES A THE OLD TOOL SERVER, with the reason cut-over-day §4 measured.
   * No test read this line before its checker removed it as a mutation and every `install*` and `hooks` test stayed green.
   */
  const close = run.stdout.split('\n').filter((line) => line.startsWith('Close every Claude Code session on this profile before --apply:'));
  assert.equal(close.length, 2, run.stdout);
  assert.ok(close.every((line) => line.includes("keeps the old tool's server and skill until it closes")), run.stdout);
});
