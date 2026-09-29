/**
 * The default profile's servers are read from one of two files, so the cut-over writes both.
 *
 * MEASURED, with Claude Code 2.1.280 in a scratch home: with `CLAUDE_CONFIG_DIR` unset, `claude mcp list` read
 * `<home>\.claude.json` and listed BrainDog's server connected; with it set to `<home>\.claude`, the same folder,
 * it read `<home>\.claude\.claude.json` and said "No MCP servers configured". A real `~\.claude` was found holding
 * such a file (27 keys, no `mcpServers`), so something has started a session that way, and
 * `serversFileOf` sends the cut-over to `~\.claude.json` alone: that session would have BrainDog's hooks and no
 * BrainDog server.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPLACE_FILE } from './replace.ts';

const MAIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'main.ts');
const OLD_SERVER = { type: 'stdio', command: 'node', args: ['C:\\Tools\\tallybook\\mcp\\tallybook-mcp.mjs'], env: {} };

const home = mkdtempSync(join(tmpdir(), 'braindog-default-both-'));
after(() => rmSync(home, { recursive: true, force: true }));

test('a default profile whose folder holds its own .claude.json has BrainDog in both files after --apply', () => {
  const inside = join(home, '.claude', '.claude.json');
  mkdirSync(dirname(inside), { recursive: true });
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ mcpServers: { brain: OLD_SERVER } }, null, 2));
  writeFileSync(inside, JSON.stringify({ firstStartTime: '2026-09-21T16:56:06.607Z', mcpServers: { brain: OLD_SERVER } }, null, 2));
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, USERPROFILE: home };
  delete env.CLAUDE_CONFIG_DIR;
  const run = spawnSync(process.execPath, ['--experimental-strip-types', MAIN, 'install', '--replace', REPLACE_FILE, '--apply', '--config-dir', join(home, '.claude')], { env, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  for (const file of [join(home, '.claude.json'), inside]) {
    const servers = (JSON.parse(readFileSync(file, 'utf8')) as { mcpServers: Record<string, unknown> }).mcpServers;
    assert.deepEqual(Object.keys(servers), ['braindog'], `${file}\n${run.stdout}`);
  }
});

/*
 * AND NEVER MADE WHEN IT IS MISSING. With the `existsSync` dropped as a mutation, all 70 tests
 * of `install*` and `hooks` stayed green, while the default profile gained a `.claude.json` inside its folder that no
 * session started without `CLAUDE_CONFIG_DIR` would ever read.
 */
test('a default profile whose folder holds no .claude.json is not given one by --apply', () => {
  const bare = mkdtempSync(join(tmpdir(), 'braindog-default-one-'));
  after(() => rmSync(bare, { recursive: true, force: true }));
  mkdirSync(join(bare, '.claude'), { recursive: true });
  writeFileSync(join(bare, '.claude.json'), JSON.stringify({ mcpServers: { brain: OLD_SERVER } }, null, 2));
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: bare, USERPROFILE: bare };
  delete env.CLAUDE_CONFIG_DIR;
  const run = spawnSync(process.execPath, ['--experimental-strip-types', MAIN, 'install', '--replace', REPLACE_FILE, '--apply', '--config-dir', join(bare, '.claude')], { env, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(Object.keys((JSON.parse(readFileSync(join(bare, '.claude.json'), 'utf8')) as { mcpServers: Record<string, unknown> }).mcpServers), ['braindog'], run.stdout);
  assert.ok(!existsSync(join(bare, '.claude', '.claude.json')), `the run made a second servers file:\n${run.stdout}`);
});
