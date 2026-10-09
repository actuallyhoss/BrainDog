/**
 * CURSOR ON RUNS (AGT-C01 job c): the scenario of `runs-codex.check.mjs` with Cursor's command line, `cursor-agent`, as
 * the client. A run opens at the first write, reads as Cursor and never as "other", is found again inside 45 minutes,
 * and a new one opens after (a line a night reads "not run", held by the tests on a local record).
 *
 * Cursor ships no npm package. Its install script fetches one build by date and hash from Cursor's downloads, so the
 * check fetches the pinned build the same way, into the fresh home, and never runs the script. It reads
 * `CURSOR_API_KEY`; without it the row reads "not run: no key". It finds its servers in `~/.cursor/mcp.json`, written
 * here naming `braindog mcp --agent cursor` and no key: the server is started with Cursor's own environment, which
 * holds the record's key as `BRAINDOG_TOKEN`.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { clientCheck, SESSION_MS, stopped } from './runs-codex.check.mjs';
import { lastLine, run } from './runs-claude-code.check.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const PIN = JSON.parse(readFileSync(join(HERE, 'versions', 'cursor.json'), 'utf8'));
const INSTALL_MS = 5 * 60_000;

/**
 * What `cursor-agent --output-format stream-json` printed: each tool call that names braindog's `log`, whether it
 * ended well, and the error the run ended with. Its tool events say `tool_call` with a `subtype` of `started` or
 * `completed`; the shape of the call inside moves between builds, so the call is read by its words, not its path.
 */
export function readCursor(out) {
  const calls = [];
  let error = '';
  let session = '';
  for (const text of String(out).split('\n')) {
    let e;
    try {
      e = JSON.parse(text);
    } catch {
      continue;
    }
    if (typeof e?.session_id === 'string' && !session) session = e.session_id;
    if (e?.type === 'tool_call' && e.subtype === 'completed') {
      const said = JSON.stringify(e.tool_call ?? {});
      const named = /braindog/.test(said) && /"(?:toolName|name|tool)":"(?:[^"]*__)?log"/.test(said);
      calls.push({ log: named, ok: !/"(?:isError|is_error)":true|"error":\{/.test(said) });
    }
    if (e?.type === 'result' && e.is_error) error = String(e.result ?? e.error ?? 'failed');
  }
  return { calls, error, session };
}

/** One `cursor-agent -p` in the folder, its servers approved for the run, with the key in its environment. */
async function cursorWrite(bin, env, folder, prompt, signal) {
  const got = await run(join(bin, 'cursor-agent'), ['-p', prompt, ...PIN.flags], { env, cwd: folder, signal, ms: SESSION_MS });
  const s = readCursor(got.out);
  const logged = s.calls.some((c) => c.log && c.ok);
  return { version: '', failed: logged ? '' : s.error || stopped(got) || `it made ${s.calls.length} tool calls and no log to braindog` };
}

/** The pinned build, for this machine's system and processor, unpacked under `root` as Cursor's install script does. */
async function cursorInstall(pin, root, env, signal) {
  const os = process.platform === 'darwin' ? 'darwin' : 'linux';
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const dir = join(root, `cursor-${pin.pinned}`);
  mkdirSync(dir, { recursive: true });
  const url = pin.download.replace('<version>', pin.pinned).replace('<os>', os).replace('<arch>', arch);
  const got = await run('sh', ['-c', 'curl -fsSL "$CURSOR_BUILD" | tar --strip-components=1 -xzf - -C "$CURSOR_DIR"'], { env: { ...env, CURSOR_BUILD: url, CURSOR_DIR: dir }, cwd: root, signal, ms: INSTALL_MS });
  if (got.code !== 0) throw new Error(`Cursor ${pin.pinned} did not install: ${lastLine(got.err || got.out)}`);
  return dir;
}

/** `~/.cursor/mcp.json`, as a person writes it: the command, and no key. */
function cursorConfigure(home, braindog) {
  const dir = join(home, '.cursor');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'mcp.json'), `${JSON.stringify({ mcpServers: { braindog: { command: braindog, args: ['mcp', '--agent', 'cursor'] } } }, null, 2)}\n`);
}

const cursorVersion = async (bin, env, signal) => (await run(join(bin, 'cursor-agent'), ['--version'], { env, signal, ms: 30_000 })).out.trim().split(/\s+/).pop() || '';

export default clientCheck({
  pin: PIN,
  key: 'CURSOR_API_KEY',
  kind: 'cursor',
  called: 'Cursor',
  install: cursorInstall,
  configure: cursorConfigure,
  write: cursorWrite,
  version: cursorVersion,
});
