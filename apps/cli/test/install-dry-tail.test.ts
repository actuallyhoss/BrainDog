/**
 * The dry run's closing line is the command that writes what it showed.
 *
 * MEASURED BEFORE THIS EXISTED, on copies of three real profiles: the dry run printed "Nothing was
 * changed. Run braindog install --replace --apply to write it." ten times, once per file, and never with the
 * `--config-dir` or `--mcp-json` it was given. Run as printed from the studio profile's window (`CLAUDE_CONFIG_DIR` set to
 * that profile), it cut over studio alone: the default and client profiles kept Tallybook's hooks and skill, and
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
const OLD_SERVER = { type: 'stdio', command: 'node', args: ['C:\\Tools\\tallybook\\mcp\\tallybook-mcp.mjs'], env: {} };
const HB = (which: string) => `powershell -NoProfile -ExecutionPolicy Bypass -File C:/Tools/tallybook/hooks/session-${which}.ps1`;

const scratch = mkdtempSync(join(tmpdir(), 'braindog-dry-tail-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

function profile(name: string): string {
  const dir = join(scratch, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: 'command', command: HB('start'), timeout: 20 }] }], SessionEnd: [{ hooks: [{ type: 'command', command: HB('end'), timeout: 15 }] }] } }, null, 2));
  writeFileSync(join(dir, '.claude.json'), JSON.stringify({ mcpServers: { brain: OLD_SERVER } }, null, 2));
  return dir;
}

test('the dry run ends once, with every --config-dir and the --mcp-json it was given', () => {
  const studio = profile('studio');
  const client = profile('client');
  const mcp = join(scratch, 'repos', '.mcp.json');
  mkdirSync(dirname(mcp), { recursive: true });
  writeFileSync(mcp, JSON.stringify({ mcpServers: { brain: OLD_SERVER } }, null, 2));
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: scratch, USERPROFILE: scratch };
  delete env.CLAUDE_CONFIG_DIR;
  const run = spawnSync(process.execPath, ['--experimental-strip-types', MAIN, 'install', '--replace', REPLACE_FILE, '--config-dir', studio, '--config-dir', client, '--mcp-json', mcp], { env, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const tails = run.stdout.split('\n').filter((line) => line.startsWith('Nothing was changed.'));
  assert.equal(tails.length, 1, run.stdout);
  const [tail = ''] = tails;
  for (const word of ['--replace', '--apply', studio, client, mcp]) assert.ok(tail.includes(word), `${word} is not in: ${tail}`);
  /*
   * ONE 'Close every session' LINE PER PROFILE THAT LOSES A TALLYBOOK SERVER, with the measured reason.
   * No test read this line before it was removed as a mutation and every `install*` and `hooks` test stayed green.
   */
  const close = run.stdout.split('\n').filter((line) => line.startsWith('Close every Claude Code session on this profile before --apply:'));
  assert.equal(close.length, 2, run.stdout);
  assert.ok(close.every((line) => line.includes("keeps Tallybook's server and skill until it closes")), run.stdout);
});
