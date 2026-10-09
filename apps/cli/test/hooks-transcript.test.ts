/**
 * His "transcripts never read" (AGT-B10 job 4). Every hook event names the session's transcript in `transcript_path`,
 * and nothing BrainDog runs opens it: `tools/gates/no-transcript.mjs` is red on a line that does, and the hooks still
 * do their work when the path names a folder, which any read would throw on.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// @ts-expect-error The gate is plain JavaScript with no declarations.
import noTranscript, { blankComments, transcriptReads } from '../../../tools/gates/no-transcript.mjs';
import { hookBeat } from '../src/beat.ts';
import { hookEnd, hookStart } from '../src/hooks.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const scratch = mkdtempSync(join(tmpdir(), 'braindog-transcript-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

type Read = { line: number; says: string };
const reads = transcriptReads as (text: string, rel: string) => Read[];
const gate = noTranscript as (root?: string) => number | undefined;

test('the gate passes this repository and is red on the planted hook that reads transcript_path, once', (t) => {
  t.mock.method(console, 'log', () => {});
  const said: string[] = [];
  t.mock.method(console, 'error', (line: string) => said.push(line));
  assert.equal(gate(ROOT), undefined, said.join('\n'));
  assert.equal(gate(join(ROOT, 'tools', 'gates', 'negative', 'no-transcript')), 1);
  assert.deepEqual(said.filter((l) => l.includes('hook-peek')), ["  apps/cli/src/hook-peek.ts:11 reads the hook event's transcript_path"]);
});

test('the hook files themselves read no transcript, the new beat included before git knows of it', () => {
  for (const rel of ['apps/cli/src/beat.ts', 'apps/cli/src/hooks.ts', 'apps/cli/src/install.ts', 'apps/cli/hooks/braindog-hook.sh', 'apps/cli/hooks/braindog-hook.ps1'])
    assert.deepEqual(reads(readFileSync(join(ROOT, rel), 'utf8'), rel), [], rel);
});

test('what counts as a read, and what is only prose', () => {
  assert.equal(reads("const p = event.transcript_path;", 'a.ts').length, 1);
  assert.equal(reads("const p = event['transcriptPath'];", 'a.ts').length, 1);
  assert.equal(reads("readdirSync(join(home, '.claude', 'projects'))", 'a.ts').length, 1);
  assert.equal(reads('ls "$HOME/.codex/sessions"', 'a.sh').length, 1);
  assert.equal(reads('/* the event names transcript_path */\nconst url = "https://x.example/a"; // transcript_path', 'a.ts').length, 0);
  assert.equal(reads('# transcript_path is never read\nexit 0', 'a.sh').length, 0);
  assert.equal((blankComments as (t: string, r: string) => string)('a // b\nc', 'a.ts'), 'a     \nc');
});

/* ── the hooks, with the transcript a folder ──────────────────────────── */

const CONTEXT = {
  session: { spoken: 'S7', state: 'active' },
  project: { spoken: 'things#1', name: 'Kiln', mark: 'K', hue: 20, how: 'folder' },
  ambiguous: [],
  handoff: null,
  live: { same_repo: [], elsewhere: [] },
  waiting: [],
  registers: [],
  people: [],
  faded: 0,
  next: 'Call handoff with your own next step before you stop.',
};

test('a transcript_path that is a folder is never opened: start prints its card, the beat and the end are sent', async (t) => {
  const seen: string[] = [];
  const server = createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      const method = new URL(req.url ?? '/', 'http://stub').pathname.replace(/^\/api\//u, '');
      seen.push(method);
      const answer = (value: unknown) => (res.writeHead(200, { 'content-type': 'application/json' }), res.end(JSON.stringify(value)));
      const row = { id: 'e_7', seq: 7, state: 'active', version: 2, fields: {} };
      if (method === 'attach') return answer({ ok: true, value: { session: row, spoken: 'S7', resumed: false, project: 'things#1', context: CONTEXT } });
      if (method === 'beat') return answer({ ok: true, value: { run: 'S7' } });
      if (method === 'end') return answer({ ok: true, value: { run: 'S7', state: 'done', changed: true } });
      answer({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: `The stub does not answer ${method}.` } });
    });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise<void>((done) => (server.closeAllConnections(), server.close(() => done()))));
  const base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;

  const home = join(scratch, 'home');
  const cwd = join(scratch, 'work');
  const transcript = join(scratch, 'claude-projects', 'session.jsonl');
  mkdirSync(transcript, { recursive: true });
  mkdirSync(cwd, { recursive: true });
  const env = { XDG_CONFIG_HOME: join(home, '.config'), BRAINDOG_HOST: base, BRAINDOG_TOKEN: 'rec_test-transcript-never-printed', BRAINDOG_TIMEOUT_MS: '3000' };
  const id = '0b7e1c52-9d3a-4f6b-a2c8-5e4d3c2b1a09';
  const event = (name: string) => JSON.stringify({ session_id: id, transcript_path: transcript, cwd, hook_event_name: name, source: 'startup', reason: 'logout' });
  const printed: string[] = [];
  const io = (name: string) => ({ env, stdin: event(name), cwd, home, device: 'the test machine', write: (text: string) => printed.push(text) });

  await hookStart(io('SessionStart'));
  assert.ok(printed.join('\n').includes('S7'), `no card:\n${printed.join('\n')}`);
  assert.equal(await hookBeat(io('PostToolUse')), 'sent');
  await hookEnd(io('SessionEnd'));
  assert.ok(seen.includes('attach') && seen.includes('beat') && seen.includes('end'), seen.join(', '));
});
