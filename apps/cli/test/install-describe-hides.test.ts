/**
 * What `install --replace` prints of a Tallybook server's command line: the program, and how many arguments were
 * hidden, and never an argument.
 *
 * WHY THE RULE WAS INVERTED RATHER THAN WIDENED. `describe` hid a word after one naming a secret, a word after a short
 * flag, and anything shaped like a token, and each review of it found a shape outside those three.
 * Probed on this tree before the fix: `node tallybook-mcp.mjs q7Rw2xT9` and `node tallybook-mcp.mjs --hb q7Rw2xT9` printed the
 * nine-character token whole, since it follows no secret-naming word, `--hb` is neither short enough to be a short flag
 * nor a name the pattern knows, and nine characters is no length a shape test can tell from a folder's name. A list of
 * spellings has no end, so the test below iterates shapes and asks of each that NO argument reaches the line at all.
 * EVERY SECRET HERE IS MADE UP.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { installInto } from '../src/install.ts';
import { REPLACE } from './replace.ts';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = mkdtempSync(join(tmpdir(), 'braindog-describe-hides-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
let folders = 0;

const PREFIX = "  - mcpServers.brain, Tallybook's: ";

/** The dry run's one line about the entry, from a named profile whose `.claude.json` holds only that entry. */
function lineFor(server: Record<string, unknown>): string {
  const home = join(scratch, `home-${String(folders++)}`);
  const dir = join(home, '.claude-hides');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, '.claude.json'), JSON.stringify({ mcpServers: { brain: server } }));
  const lines = installInto(dir, { apply: false, replace: REPLACE, scripts: join(APP, 'hooks'), home });
  const line = lines.find((l) => l.startsWith(PREFIX));
  assert.ok(line, `the entry was not named: ${lines.join(' | ')}`);
  return line.slice(PREFIX.length);
}

const CORE = 'q7Rw2xT9';

const SHAPES: { name: string; server: Record<string, unknown>; shown: string }[] = [
  { name: 'a bare short token after the script (probed)', server: { command: 'node', args: ['C:/Tools/tallybook/mcp/tallybook-mcp.mjs', CORE] }, shown: 'node [2 arguments hidden]' },
  { name: 'a short token after a flag no pattern knows (probed)', server: { command: 'node', args: ['C:/Tools/tallybook/mcp/tallybook-mcp.mjs', '--hb', CORE] }, shown: 'node [3 arguments hidden]' },
  { name: 'the whole command line in one string', server: { command: `node C:\\Tools\\tallybook\\mcp\\tallybook-mcp.mjs --hb ${CORE}` }, shown: 'node [3 arguments hidden]' },
  { name: 'a proxy whose URL carries the token in its path', server: { command: 'npx', args: ['-y', 'mcp-remote', `https://tallybook.example/mcp/${CORE}`] }, shown: 'npx [3 arguments hidden]' },
  { name: 'a proxy with the URL joined to its flag', server: { command: 'npx', args: ['-y', 'mcp-remote', `--url=https://tallybook.example/mcp?t=${CORE}`] }, shown: 'npx [3 arguments hidden]' },
  /* One argument holding spaces is one argument: split whole, this was counted as six. */
  { name: 'a bearer inside one header argument', server: { command: 'npx', args: ['mcp-remote', 'https://tallybook.example/mcp', '--header', `Authorization: Bearer b${CORE}`] }, shown: 'npx [4 arguments hidden]' },
  { name: 'one argument, said in the singular', server: { command: 'node', args: [`C:/Tools/tallybook/mcp/tallybook-mcp.mjs`] }, shown: 'node [1 argument hidden]' },
  /*
   * AN ASSIGNMENT BEFORE THE PROGRAM IS NO PROGRAM. Measured on the first cut of this rule: the first word
   * of `command` was shown as the program, so `TOKEN=q7Rw2xT9 node ...` printed `TOKEN=q7Rw2xT9 [2 arguments hidden]`,
   * where the word-by-word rules it replaced had printed `TOKEN=[hidden]`. The assignment is counted with what is hidden.
   */
  { name: 'an assignment before the program in one command string', server: { command: `TOKEN=${CORE} node C:/Tools/tallybook/mcp/tallybook-mcp.mjs` }, shown: 'node [2 arguments hidden]' },
  /* No `command` at all: nothing to name it by but the count, and no stray space before it. */
  { name: 'arguments and no program', server: { args: ['C:/Tools/tallybook/mcp/tallybook-mcp.mjs', CORE] }, shown: '[2 arguments hidden]' },
];

for (const shape of SHAPES)
  test(`INSTALL --REPLACE SHOWS ONLY THE PROGRAM: ${shape.name}`, () => {
    const shown = lineFor(shape.server);
    /* Every word of `command` but the program the line is expected to name, which is not always the first. */
    const program = shape.shown.split(' [')[0];
    const words = typeof shape.server.command === 'string' ? shape.server.command.split(/\s+/) : [];
    const args = [...(Array.isArray(shape.server.args) ? (shape.server.args as string[]) : []), ...words.filter((word) => word !== program)];
    for (const arg of args) assert.ok(!shown.includes(arg), `printed the argument ${arg}: ${shown}`);
    assert.ok(!shown.includes(CORE), `printed the secret: ${shown}`);
    assert.equal(shown, shape.shown);
  });

/*
 * AN ENTRY REGISTERED BY URL KEEPS ITS ORIGIN. It has no program to name it by, and the origin is what says the entry is
 * Tallybook's; the path past `/mcp` is still hidden.
 */
test('an entry registered by URL is still named by its origin, with its path hidden', () => {
  assert.equal(lineFor({ type: 'http', url: `https://tallybook.example/mcp/t${CORE}?k=${CORE}` }), 'https://tallybook.example/mcp/[hidden]');
});
