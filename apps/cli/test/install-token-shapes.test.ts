/**
 * What `install --replace` prints of a the old tool server entry, for each entry shape the batch twenty-eight audit tried
 * (`loop/research-batch-twenty-eight-audit.md` §5).
 *
 * WHY ONE ENTRY PER PROFILE. `describe` runs word by word and carries a flag from one word to the next, so two entries
 * in one file would still be two calls, but a line naming the wrong entry is easier to read when each file holds one.
 * EVERY SECRET HERE IS MADE UP, and each carries the same core so that a leak of any part of it is found by one search.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { installInto } from '../src/install.ts';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = mkdtempSync(join(tmpdir(), 'braindog-install-shapes-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
let folders = 0;

/** The dry run's one line about the entry, from a profile whose `.claude.json` holds only that entry. */
function lineFor(server: Record<string, unknown>): string {
  const home = join(scratch, `home-${String(folders++)}`);
  /* NOT `.claude`: that is the default profile, whose servers are kept beside it in `~/.claude.json` (`serversFileOf`). */
  const dir = join(home, '.claude-shapes');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, '.claude.json'), JSON.stringify({ mcpServers: { brain: server } }));
  const lines = installInto(dir, { apply: false, replace: true, scripts: join(APP, 'hooks'), home });
  const line = lines.find((l) => l.startsWith("  - mcpServers.brain, the old tool's: "));
  assert.ok(line, `the entry was not named: ${lines.join(' | ')}`);
  return line.slice("  - mcpServers.brain, the old tool's: ".length);
}

const CORE = 'q7Rw2xT9';

/*
 * MEASURED BEFORE THE FIX, on HEAD at 9f8c6a58. Printed whole: the value after a header named on its own word
 * (`X-Brain-Token` starts with no `-` and holds no colon, so it was not taken to name a secret), a path token of nine
 * characters (below the sixteen `looksLikeToken` asks for), and a twenty-letter token after a throwaway value that
 * follows `--token` (the flag hid one word, and twenty letters with no digit looked like no token). Already hidden at
 * that commit: the value after `-t`, which 9f8c6a58 itself fixed, and a bearer inside one `--header` string. Those two
 * stay as the guard.
 */
const SHAPES: { name: string; server: Record<string, unknown>; secret: string; shown: string }[] = [
  {
    name: 'a header named on its own word, then its value',
    server: { command: 'npx', args: ['-y', 'mcp-remote', 'https://brain.example.com/mcp', '--header', 'X-Brain-Token', `hbt${CORE}`] },
    secret: `hbt${CORE}`,
    shown: 'npx [6 arguments hidden]',
  },
  {
    name: 'a short token in the URL path',
    server: { type: 'http', url: `https://brain.example.com/mcp/t${CORE}` },
    secret: `t${CORE}`,
    shown: 'https://brain.example.com/mcp/[hidden]',
  },
  {
    name: 'a value after -t',
    server: { command: 'node', args: ['C:/Tools/legacy/brain-mcp.mjs', '-t', `k${CORE}`] },
    secret: `k${CORE}`,
    shown: 'node [3 arguments hidden]',
  },
  {
    name: 'a bearer inside one header string',
    server: { command: 'npx', args: ['mcp-remote', 'https://brain.example.com/mcp', '--header', `Authorization: Bearer b${CORE}`] },
    secret: `b${CORE}`,
    shown: 'npx [4 arguments hidden]',
  },
  {
    name: 'a letters-only token after a throwaway value that follows --token',
    server: { command: 'node', args: ['C:/Tools/legacy/brain-mcp.mjs', '--token', 'x', 'qwRtzuIopaSdfghjKlyx'] },
    secret: 'qwRtzuIopaSdfghjKlyx',
    shown: 'node [4 arguments hidden]',
  },
];

for (const shape of SHAPES)
  test(`INSTALL --REPLACE PRINTS NO SECRET: ${shape.name}`, () => {
    const shown = lineFor(shape.server);
    assert.ok(!shown.includes(shape.secret) && !shown.includes(CORE), `printed the secret: ${shown}`);
    assert.equal(shown, shape.shown);
  });

/*
 * AND WHAT NAMES THE ENTRY IS STILL SHOWN. Hiding every word would pass the five above and leave a reader unable to
 * tell which of two entries is which, so the run of hidden words ends at the next flag and at a URL.
 */
test('the words after a hidden value that name the entry are still shown', () => {
  assert.equal(
    lineFor({ command: 'npx', args: ['-y', 'mcp-remote', '--header', `Authorization: Bearer b${CORE}`, 'https://brain.example.com/mcp', '--transport', 'http-only'] }),
    'npx [7 arguments hidden]',
  );
});
