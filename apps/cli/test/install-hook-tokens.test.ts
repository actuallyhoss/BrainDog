/**
 * What `install --replace` prints of a the old tool hook it removes, and of a program kept under a folder named like a key
 * (finding 5 of `loop/research-batch-fifty-four-audit.md`, which carries SEC-6's rule to the hooks).
 *
 * MEASURED BEFORE THE FIX, on b7409d2d. SEC-6 inverted `describe` so a server is named by its program and a count, and
 * the line for a hook, two above it, was left printing the command whole: a hook written as
 * `powershell -File C:/Tools/legacy/hooks/session-start.ps1 -Token q7Rw2xT9` came out with the token on the line. And the
 * program path is the one word SEC-6 still shows, split at each slash and each piece asked `looksLikeToken`, which hides
 * a piece only on a known prefix or at sixteen characters, so `C:/keys/q7Rw2xT9/node.exe` printed the eight-character
 * key in the folder's name. EVERY SECRET HERE IS MADE UP, and each carries the same core so one search finds a leak.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { installInto } from '../src/install.ts';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = mkdtempSync(join(tmpdir(), 'braindog-hook-tokens-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
let folders = 0;

const CORE = 'q7Rw2xT9';

/** The dry run of a named profile holding the one hook, or the one server, and nothing else. */
function dryRun(hook: string | null, server: Record<string, unknown> | null): string[] {
  const home = join(scratch, `home-${String(folders++)}`);
  /* NOT `.claude`: that is the default profile, whose servers are kept beside it in `~/.claude.json`. */
  const dir = join(home, '.claude-hooks');
  mkdirSync(dir, { recursive: true });
  if (hook) writeFileSync(join(dir, 'settings.json'), JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: 'command', command: hook }] }] } }));
  if (server) writeFileSync(join(dir, '.claude.json'), JSON.stringify({ mcpServers: { brain: server } }));
  return installInto(dir, { apply: false, replace: true, scripts: join(APP, 'hooks'), home });
}

/** The words after "the old tool's: " on the line that starts with `prefix`. */
function shownAfter(lines: string[], prefix: string): string {
  const line = lines.find((l) => l.startsWith(prefix));
  assert.ok(line, `the entry was not named: ${lines.join(' | ')}`);
  return line.slice(prefix.length);
}

const HOOK = "  - hooks.SessionStart, the old tool's: ";
const SERVER = "  - mcpServers.brain, the old tool's: ";

const HOOKS: { name: string; command: string; shown: string }[] = [
  { name: 'a token as an argument (the audit\'s I1)', command: `powershell -File C:/Tools/legacy/hooks/session-start.ps1 -Token ${CORE}`, shown: 'powershell [4 arguments hidden]' },
  { name: 'a token assigned before the program', command: `TOKEN=${CORE} sh C:/Tools/legacy/hooks/session-start.sh`, shown: 'sh [2 arguments hidden]' },
  { name: 'a program under a folder named for a key', command: `C:/keys/${CORE}/pwsh.exe -File C:/Tools/legacy/hooks/session-start.ps1`, shown: 'C:/keys/[hidden]/pwsh.exe [2 arguments hidden]' },
  { name: 'a program under a folder that joins a word to a key', command: `C:/keys/key_${CORE}/pwsh.exe -File C:/Tools/legacy/hooks/session-start.ps1`, shown: 'C:/keys/[hidden]/pwsh.exe [2 arguments hidden]' },
  /* Measured by this change's checker: judged run by run between `-`, `_` and `.`, this folder's two halves were four characters each and it printed whole. */
  { name: 'a program under a folder whose key a dash splits', command: `C:/keys/${CORE.slice(0, 4)}-${CORE.slice(4)}/pwsh.exe -File C:/Tools/legacy/hooks/session-start.ps1`, shown: 'C:/keys/[hidden]/pwsh.exe [2 arguments hidden]' },
];

for (const shape of HOOKS)
  test(`INSTALL --REPLACE SHOWS A THE OLD TOOL HOOK BY ITS PROGRAM ALONE: ${shape.name}`, () => {
    const lines = dryRun(shape.command, null);
    const shown = shownAfter(lines, HOOK);
    assert.ok(!lines.join('\n').includes(CORE), `printed the secret: ${lines.join(' | ')}`);
    assert.ok(!shown.includes('session-start'), `printed an argument: ${shown}`);
    assert.equal(shown, shape.shown);
  });

/* The audit's I2: the same folder under a server's program, where `describe` already hid the arguments. */
test('a server program under a folder named for a key hides that folder', () => {
  const lines = dryRun(null, { command: `C:/keys/${CORE}/node.exe`, args: ['C:/Tools/legacy/mcp/brain-mcp.mjs'] });
  assert.ok(!lines.join('\n').includes(CORE), `printed the secret: ${lines.join(' | ')}`);
  assert.equal(shownAfter(lines, SERVER), 'C:/keys/[hidden]/node.exe [1 argument hidden]');
});

/*
 * AND A FOLDER THAT IS ONLY A NAME IS STILL SHOWN. Hiding every piece with a digit in it would pass every test above and
 * hide `System32`, `v1.0` and `v24.1.0`, the folders a real PowerShell or Node sits under, which is where a reader looks
 * to see which program the entry ran.
 */
test('the folders a real program sits under are shown whole', () => {
  const powershell = 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe';
  assert.equal(shownAfter(dryRun(`${powershell} -NoProfile -File C:/Tools/legacy/hooks/session-start.ps1`, null), HOOK), `${powershell} [3 arguments hidden]`);
  const node = 'C:/Users/someone/AppData/Roaming/nvm/v24.1.0/node-v24/node.exe';
  assert.equal(shownAfter(dryRun(null, { command: node, args: ['C:/Tools/legacy/mcp/brain-mcp.mjs'] }), SERVER), `${node} [1 argument hidden]`);
  assert.equal(shownAfter(dryRun(null, { command: 'C:/Python312/python.exe', args: ['C:/Tools/legacy/mcp/brain-mcp.mjs'] }), SERVER), 'C:/Python312/python.exe [1 argument hidden]');
});
