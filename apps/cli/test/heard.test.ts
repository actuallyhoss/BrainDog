/**
 * THE COMMAND'S HALF OF THE AGENT DOOR'S SIGNS: the start hook's time, kept in the session file and
 * sent as a `hook` mark by the next hook of the same session (`owedMark`), and the command's build on every call.
 *
 * WHY. His Mac ran the command of 1 October for a week, and the hook's speed was never measured on a real machine
 * A mark that is sent twice, sent for another run, or sent with a time no hook could take would make the
 * signs say something false, which is worse than saying nothing; these hold each of those out.
 *
 * IN PROCESS, over a stub on node:http, for the one function. `hooks.test.ts` drives the same mark through the real
 * command, a start and an end as Claude Code runs them.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { owedMark, readSession, type SessionFile } from '../src/hooks.ts';
import type { Position } from '../src/position.ts';

const scratch = mkdtempSync(join(tmpdir(), 'braindog-heard-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

const AT: Position = { cwd: '/Users/ada/kiln', repo: 'kiln', remote: 'github.com/ada/kiln', host: 'box', branch: 'main', head: 'abc1234' };

type Seen = { method: string; body: Record<string, unknown>; headers: IncomingHttpHeaders };

/** A host that answers `heard`, or refuses it as a record from before the door's signs does with `older`. */
async function stub(t: { after: (fn: () => Promise<void>) => void }, older = false) {
  const seen: Seen[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      seen.push({ method: new URL(req.url ?? '/', 'http://stub').pathname.replace(/^\/api\//, ''), body: raw ? (JSON.parse(raw) as Record<string, unknown>) : {}, headers: req.headers });
      res.writeHead(older ? 501 : 200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(older ? { ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'Not yet.' } } : { ok: true, value: { marked: true } }));
    });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise<void>((done) => server.close(() => done())));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { seen, to: { key: base, base, token: 'rec_01TEST.stub-bearer' } };
}

const owing = (host: string, more: Partial<SessionFile> = {}): SessionFile => ({ host, spoken: 'S7', client_id: 'claude-run-1', head_at_start: null, at: '2026-10-09T08:00:00Z', hook_ms: 640, ...more });

test('AN OWED TIME IS ONE hook MARK, against the run that hook attached, with the command’s build', async (t) => {
  const { seen, to } = await stub(t);
  await owedMark(to, owing(to.key), AT, {}, AbortSignal.timeout(2_000));
  assert.deepEqual(seen.map((s) => [s.method, s.body]), [['heard', { kind: 'hook', ms: 640, build: 'dev+0000000' }]]);
  const [mark] = seen;
  assert.deepEqual(
    ['x-braindog-session', 'x-braindog-client', 'x-braindog-agent', 'x-braindog-cli'].map((h) => mark!.headers[h]),
    ['S7', 'claude-run-1', 'claude', 'dev+0000000'],
  );
  assert.equal(mark!.headers.authorization, 'Bearer rec_01TEST.stub-bearer');
});

test('NOTHING OWED, OR OWED TO ANOTHER HOST, IS NO REQUEST AT ALL', async (t) => {
  const { seen, to } = await stub(t);
  await owedMark(to, null, AT, {}, AbortSignal.timeout(2_000));
  const { hook_ms: _none, ...paid } = owing(to.key);
  await owedMark(to, paid, AT, {}, AbortSignal.timeout(2_000));
  /* A file written for the record signed in before this one: its run is not this host's to mark. */
  await owedMark(to, owing('https://other.example'), AT, {}, AbortSignal.timeout(2_000));
  assert.deepEqual(seen, []);
});

test('A RECORD WITHOUT heard, AND ONE NOBODY ANSWERS FOR, COST THE HOOK NOTHING: no throw', async (t) => {
  const older = await stub(t, true);
  await owedMark(older.to, owing(older.to.key), AT, {}, AbortSignal.timeout(2_000));
  assert.equal(older.seen.length, 1);
  const closed = { key: 'http://127.0.0.1:9', base: 'http://127.0.0.1:9', token: 'rec_01TEST.x' };
  await owedMark(closed, owing(closed.key), AT, {}, AbortSignal.timeout(2_000));
});

test('ONLY A TIME A HOOK COULD TAKE IS READ BACK from the file: a whole number of milliseconds, under a minute', () => {
  const file = join(scratch, 'session.json');
  const read = (hook_ms: unknown) => {
    writeFileSync(file, JSON.stringify({ host: 'h', spoken: 'S7', head_at_start: null, at: '2026-10-09T08:00:00Z', hook_ms }));
    return readSession(file)?.hook_ms;
  };
  assert.equal(read(0), 0);
  assert.equal(read(412), 412);
  assert.equal(read(60_000), 60_000);
  for (const bad of [-1, 12.5, 60_001, '412', null, Number.MAX_SAFE_INTEGER]) assert.equal(read(bad), undefined, String(bad));
});
