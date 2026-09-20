/**
 * `braindog session show|next|tried|note|end` against a stub host on node:http: what each verb reaches,
 * what it sends, what it prints, and the refusals it answers before anything leaves the machine.
 *
 * EVERY FOLDER IS A TEMPORARY ONE, and it is outside any work tree, so `end` sends no branch and no
 * commit and the body of every request is the same on every machine.
 *
 * THE TOKEN IS OBVIOUSLY FAKE and long enough that any fragment of it in a line is findable. Every test
 * keeps what it printed, and the last one says none of it held the token.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sessionPath, writeSession } from '../src/hooks.ts';
import { session } from '../src/session.ts';
import type { AgentIo } from '../src/skills.ts';

/* Obviously fake, and long enough that a fragment of it in any output is findable. */
const TOKEN = ['rec_01TESTTESTTESTTESTTESTTEST', 'stub-bearer-for-tests-only-7b3c'].join('.');

/** Every line any command wrote on either sink, for the last test. */
const printed: string[] = [];

type After = { after: (fn: () => void | Promise<void>) => void };
type Seen = { method: string; args: Record<string, unknown>; authorization: string | undefined };
type Answer = { ok: true; value: unknown } | { ok: false; refusal: { code: string; fix: string; at?: string } } | 'cut';

const LIVE_OTHER = { spoken: 'S9', state: 'active', doing: 'the gates', agent: 'claude', repo: 'kiln', project: null, stale: false, age_s: 120 };
const LIVE_SELF = { spoken: 'S7', state: 'active', doing: 'this', agent: 'claude', repo: 'kiln', project: null, stale: false, age_s: 3 };

/** Where a run stands, as `context` answers it. Each test bends one field of this. */
const CONTEXT = {
  session: { spoken: 'S7', state: 'active' },
  project: { spoken: 'things#1', name: 'Kiln', mark: null, hue: null, how: 'folder' },
  ambiguous: [],
  handoff: { from: 'S5', age_s: 7_200, next: 'Run the refusal gates after the build', tried: ['a shorter budget', 'a second client'], head: 'abc1234' },
  live: { same_repo: [LIVE_OTHER, LIVE_SELF], elsewhere: [] },
  waiting: [],
  registers: [],
  people: [],
  faded: 0,
  next: 'Start with the task in front of you, and call handoff with your next step before you stop.',
};

/** A stub host answering `context` and `handoff`, and recording every request. */
async function stub(t: After, o: { context?: unknown; handoff?: Answer } = {}) {
  const seen: Seen[] = [];
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://stub');
      const method = url.pathname.replace(/^\/api\//, '');
      const raw = Buffer.concat(chunks).toString('utf8');
      const args = (raw ? JSON.parse(raw) : {}) as Record<string, unknown>;
      for (const [k, v] of url.searchParams) {
        try {
          args[k] = JSON.parse(v);
        } catch {
          args[k] = v;
        }
      }
      seen.push({ method, args, authorization: req.headers.authorization });
      const answer = (value: unknown) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(value));
      };
      if (method === 'context') return answer({ ok: true, value: o.context ?? CONTEXT });
      if (method === 'handoff') {
        /* A gateway that answers something that is not JSON, which is one of the ways a socket fails. */
        if (o.handoff === 'cut') {
          res.writeHead(502, { 'content-type': 'text/html' });
          return res.end('<html>gateway</html>');
        }
        return answer(o.handoff ?? { ok: true, value: { id: 'e_7', register: 'session', seq: 7, state: 'idle', version: 2, fields: {} } });
      }
      return answer({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: `The stub does not answer ${method}.` } });
    });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  t.after(
    () =>
      new Promise<void>((done) => {
        server.closeAllConnections();
        server.close(() => done());
      }),
  );
  return { base: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`, seen };
}

/** A base nothing listens on: a server opened for its port and closed again. */
async function gone(): Promise<string> {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  await new Promise<void>((done) => server.close(() => done()));
  return base;
}

/** A folder of its own, its config folder, and the `AgentIo` a command is given. */
function setup(t: After, base: string, o: { file?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-session-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const env = { XDG_CONFIG_HOME: join(dir, 'config'), APPDATA: join(dir, 'config'), BRAINDOG_HOST: base, BRAINDOG_TOKEN: TOKEN, BRAINDOG_TIMEOUT_MS: '4000' };
  const out: string[] = [];
  const said: string[] = [];
  if (o.file !== false) writeSession(sessionPath(env, dir), { host: base, spoken: 'S7', client_id: 'claude-run-1', head_at_start: null, at: '2026-09-15T00:00:00Z' });
  const io: AgentIo = {
    env,
    cwd: dir,
    home: dir,
    out: (l) => void (out.push(l), printed.push(l)),
    say: (l) => void (said.push(l), printed.push(l)),
    headers: async () => ({}),
  };
  return { dir, env, io, out, said };
}

/* ── show ──────────────────────────────────────────────────────────────── */

test('SHOW PRINTS THE RUN, ITS STATE, THE LAST HANDOFF AND WHO ELSE IS LIVE HERE, in one call and never itself', async (t) => {
  const host = await stub(t);
  const h = setup(t, host.base);

  assert.equal(await session(['show'], h.io), 0, h.said.join('\n'));
  assert.deepEqual(
    h.out,
    [
      'S7 is active · project Kiln.',
      'Last handoff (S5, 2 hours ago): Run the refusal gates after the build.',
      '  Already tried: a shorter budget.',
      '  Already tried: a second client.',
      'Also live here: S9 active "the gates", seen 2 minutes ago.',
    ],
    h.said.join('\n'),
  );
  assert.deepEqual(h.said, []);
  assert.deepEqual(host.seen.map((s) => s.method), ['context']);
  assert.equal(host.seen[0]?.authorization, `Bearer ${TOKEN}`);
});

test('show says so when there is no project, no handoff and nobody else here', async (t) => {
  const host = await stub(t, { context: { ...CONTEXT, project: null, handoff: null, live: { same_repo: [LIVE_SELF], elsewhere: [LIVE_OTHER] } } });
  const h = setup(t, host.base);

  assert.equal(await session(['show'], h.io), 0, h.said.join('\n'));
  assert.deepEqual(h.out, ['S7 is active · no project here.', 'No handoff has been left here.', 'Nobody else is live in this repository.'], h.said.join('\n'));
  assert.deepEqual(h.said, []);
});

/* ── next, tried and note ──────────────────────────────────────────────── */

test('NEXT, TRIED AND NOTE EACH REACH handoff UNDER THEIR OWN FIELD, and none of them names a run', async (t) => {
  const cases: [string, Record<string, unknown>, string][] = [
    ['next', { next: 'Run the refusal gates after the build' }, 'S7 now carries that next step.'],
    ['tried', { tried: 'a shorter budget' }, 'S7 now carries that as already tried.'],
    ['note', { note: 'the stub answers on loopback only' }, 'S7 now carries that note.'],
  ];
  for (const [verb, body, line] of cases) {
    const host = await stub(t);
    const h = setup(t, host.base);
    const text = String(Object.values(body)[0]);

    assert.equal(await session([verb, ` ${text} `], h.io), 0, h.said.join('\n'));
    assert.deepEqual(host.seen.map((s) => s.method), ['context', 'handoff'], verb);
    assert.deepEqual(host.seen[1]?.args, body, verb);
    assert.equal(host.seen[1]?.authorization, `Bearer ${TOKEN}`, verb);
    assert.deepEqual(h.out, [line], h.said.join('\n'));
    assert.deepEqual(h.said, [], verb);
  }
});

/* ── end ───────────────────────────────────────────────────────────────── */

test('END DEFAULTS TO IDLE, which is the handoff the end hook already sends', async (t) => {
  const host = await stub(t);
  const h = setup(t, host.base);

  assert.equal(await session(['end'], h.io), 0, h.said.join('\n'));
  assert.deepEqual(host.seen.map((s) => s.method), ['context', 'handoff']);
  /* A temporary folder is outside any work tree, so git answers nothing and neither field is sent. */
  assert.deepEqual(host.seen[1]?.args, { state: 'idle' });
  assert.deepEqual(h.out, ['S7 is idle.'], h.said.join('\n'));
  assert.deepEqual(h.said, []);
});

test('end --state handoff leaves the run to be picked up', async (t) => {
  const host = await stub(t);
  const h = setup(t, host.base);

  assert.equal(await session(['end', '--state', 'handoff'], h.io), 0, h.said.join('\n'));
  assert.deepEqual(host.seen[1]?.args, { state: 'handoff' });
  assert.deepEqual(h.out, ['S7 is handed off.'], h.said.join('\n'));
});

test('END --STATE DONE CARRIES --NEXT, because a finished run leaves its old next step behind', async (t) => {
  const host = await stub(t);
  const h = setup(t, host.base);

  assert.equal(await session(['end', '--state', 'done', '--next', 'Wire session into main.ts'], h.io), 0, h.said.join('\n'));
  assert.deepEqual(host.seen[1]?.args, { state: 'done', next: 'Wire session into main.ts' });
  assert.deepEqual(h.out, ['S7 is done.'], h.said.join('\n'));
  assert.deepEqual(h.said, []);
});

/* ── refused before anything is sent ───────────────────────────────────── */

test('A --STATE THAT IS NOT ONE OF THE THREE IS REFUSED BEFORE ANY REQUEST, in one sentence naming them', async (t) => {
  const host = await stub(t);
  for (const bad of ['active', 'abandoned', 'Idle', '', 'done --next']) {
    const h = setup(t, host.base);
    assert.equal(await session(['end', '--state', bad], h.io), 1, bad);
    assert.deepEqual(h.said, ['braindog session end takes --state idle, handoff or done.'], bad);
    assert.deepEqual(h.out, [], bad);
  }
  assert.deepEqual(host.seen, []);
});

test('A MISSING OR UNQUOTED LINE IS REFUSED BEFORE ANY REQUEST, and the sentence never repeats what was typed', async (t) => {
  const host = await stub(t);
  const secret = 'a-value-pasted-where-a-label-goes-9f41';
  const cases: [string[], string][] = [
    [['next'], 'braindog session next takes one line of text, in quotes, and --host.'],
    [['next', '   '], 'braindog session next takes one line of text, in quotes, and --host.'],
    [['next', 'run', 'the', 'gates'], 'braindog session next takes one line of text, in quotes, and --host.'],
    [['tried'], 'braindog session tried takes one line of text, in quotes, and --host.'],
    /* --next belongs to end alone, so it is not a flag the other three read. */
    [['note', 'a note', '--next', secret], 'braindog session note takes one line of text, in quotes, and --host.'],
    [['next', 'Run the gates', '--state', 'done'], 'braindog session next takes one line of text, in quotes, and --host.'],
    [['next', '--json', secret], 'braindog session next takes one line of text, in quotes, and --host.'],
    [['show', 'S9'], 'braindog session show takes --host and nothing else.'],
    [['show', '--json'], 'braindog session show takes --host and nothing else.'],
    [['end', 'S9'], 'braindog session end takes --state, --next and --host, and nothing else.'],
    [['end', '--next', '  '], 'braindog session end takes --state, --next and --host, and nothing else.'],
    [['end', '--json'], 'braindog session end takes --state, --next and --host, and nothing else.'],
    [[], 'braindog session takes show, next, tried, note or end.'],
    [['pause'], 'braindog session takes show, next, tried, note or end.'],
  ];
  for (const [args, line] of cases) {
    const h = setup(t, host.base);
    assert.equal(await session(args, h.io), 1, args.join(' '));
    assert.deepEqual(h.said, [line], args.join(' '));
    assert.deepEqual(h.out, [], args.join(' '));
    assert.ok(!h.said.join('\n').includes(secret), 'a typed value reached a sentence');
  }
  assert.deepEqual(host.seen, []);
});

test('WITH NO SESSION FILE FOR THIS FOLDER NOTHING IS SENT, and the sentence says what to do about it', async (t) => {
  const host = await stub(t);
  for (const args of [['show'], ['next', 'Run the gates'], ['tried', 'a shorter budget'], ['note', 'a note'], ['end'], ['end', '--state', 'done']]) {
    const h = setup(t, host.base, { file: false });
    assert.equal(await session(args, h.io), 1, args.join(' '));
    assert.deepEqual(h.said, ['No session is open in this folder. Start a Claude Code session here, or run braindog hook start.'], args.join(' '));
    assert.deepEqual(h.out, [], args.join(' '));
  }
  assert.deepEqual(host.seen, []);
});

test('a run the host does not know is one sentence, not a 401', async (t) => {
  const host = await stub(t, { context: { ...CONTEXT, session: null } });
  const h = setup(t, host.base);

  assert.equal(await session(['end'], h.io), 1, h.said.join('\n'));
  assert.deepEqual(h.said, ['The host has no open run for this folder. Start a session here and try again.']);
  assert.deepEqual(h.out, []);
  assert.deepEqual(host.seen.map((s) => s.method), ['context']);
});

/* ── what the host answers ─────────────────────────────────────────────── */

test("A REFUSAL IS PRINTED AS THE HOST'S OWN FIX, on stderr, and exits 1", async (t) => {
  const fix = 'next is the one concrete step the next run takes, and this one names none.';
  const host = await stub(t, { handoff: { ok: false, refusal: { code: 'VALUE_MALFORMED', fix, at: 'next' } } });
  const h = setup(t, host.base);

  assert.equal(await session(['next', 'carry on'], h.io), 1, h.said.join('\n'));
  assert.deepEqual(h.said, [fix]);
  assert.deepEqual(h.out, []);
  assert.deepEqual(host.seen.map((s) => s.method), ['context', 'handoff']);
});

test('A HOST THAT DOES NOT ANSWER EXITS 3, on every verb, and prints nothing to stdout', async (t) => {
  const base = await gone();
  for (const args of [['show'], ['next', 'Run the gates'], ['end']]) {
    const h = setup(t, base);
    assert.equal(await session(args, h.io), 3, args.join(' '));
    assert.equal(h.said.length, 1, args.join(' '));
    assert.deepEqual(h.out, [], args.join(' '));
  }
});

test('A HANDOFF THAT NEVER LANDS EXITS 3 TOO, and says the host did not answer rather than why', async (t) => {
  const host = await stub(t, { handoff: 'cut' });
  const h = setup(t, host.base);

  assert.equal(await session(['end'], h.io), 3, h.said.join('\n'));
  assert.deepEqual(host.seen.map((s) => s.method), ['context', 'handoff']);
  /* Not the refusal's own fix, which carries the reason a socket gave and so could carry anything. */
  assert.deepEqual(h.said, [`${host.base} did not answer.`]);
  assert.deepEqual(h.out, []);
});

test('NOTHING REACHES STDOUT ON ANY REFUSAL PATH, whoever refused', async (t) => {
  const host = await stub(t, { handoff: { ok: false, refusal: { code: 'FORBIDDEN', fix: 'Ask the owner for a token that reaches runs.' } } });
  const refusals: string[][] = [['end', '--state', 'active'], ['note'], ['pause'], ['note', 'a note']];
  for (const args of refusals) {
    const h = setup(t, host.base);
    assert.equal(await session(args, h.io), 1, args.join(' '));
    assert.deepEqual(h.out, [], args.join(' '));
    assert.equal(h.said.length, 1, args.join(' '));
  }
  const missing = setup(t, host.base, { file: false });
  assert.equal(await session(['show'], missing.io), 1);
  assert.deepEqual(missing.out, []);
});

test('THE TOKEN WAS NEVER PRINTED by any command above', () => {
  assert.ok(printed.length > 20, 'the tests above printed nothing, so this proves nothing');
  assert.equal(printed.join('\n').includes('stub-bearer-for-tests-only'), false);
  assert.equal(printed.join('\n').includes(TOKEN), false);
});
