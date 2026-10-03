/**
 * Every command that prints somebody else's words prints them through `clip.ts`, and nothing reaches the terminal as
 * the record sent it.
 *
 * WHAT THE SHARED MODULE LEFT BEHIND. Commit 73f5f2f8 put the C0, DEL and C1 scrub in one place, but `brief.ts` and
 * `session.ts` kept their own `clip`, which stopped at U+001F, and `automations run`, `automations cancel` and
 * `scripts resume` printed the record's `run` and `script` without `printable`. Run against the tree before this file's
 * fix, every test below failed: the start hook's briefing, `braindog context`, `session show` and all three admin verbs
 * handed a DEL and an eight-bit CSI (U+009B, erase-line under its C1 spelling) to the terminal byte for byte.
 *
 * `--json` IS NOT CHECKED FOR A SCRUB, and is checked for the opposite. An agent is handed the record's value as the
 * record sent it, so the last test says the envelope still carries the bytes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Context } from '@braindog/client';

import { automations, scripts } from '../src/automations.ts';
import { briefingOf } from '../src/brief.ts';
import { headline } from '../src/context.ts';
import { sessionPath, writeSession } from '../src/hooks.ts';
import type { Answer } from '../src/json.ts';
import { session } from '../src/session.ts';
import type { AgentIo } from '../src/skills.ts';

/* Obviously fake, and long enough that a fragment of it in any output is findable. */
const TOKEN = ['rec_01TESTTESTTESTTESTTESTTEST', 'stub-bearer-for-tests-only-5d1f'].join('.');

/* A DEL and an eight-bit CSI in the middle of words a member wrote. Neither is below U+0020, which is exactly why the
   private copies let both through. */
const SAID = 'Run the gates\u007f\u009b2K after the build';
const SHOWN = 'Run the gates 2K after the build';

/** Every control character a printed line could carry, C0, DEL and C1 alike. */
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

/* THE STATES ARE THE RECORD'S WORDS AS WELL. `Brief.state` and `session.state` are `string | null`, not a union, and
   `braindog context` already clipped the run's own; `session show` printed that one and every other run's as sent. The
   run in S8 is not `active`, so the briefing, which names only working runs, leaves it out and its counts hold. */
const hostile = (): Context => ({
  session: { spoken: 'S7', state: `active${SAID}` },
  project: { spoken: 'things#1', name: `Kiln${SAID}`, mark: null, hue: null, how: 'folder' },
  ambiguous: [],
  handoff: { from: 'S5', age_s: 7_200, next: SAID, tried: [SAID], head: 'abc1234' },
  live: {
    same_repo: [
      { spoken: 'S9', state: 'active', doing: SAID, agent: 'claude', repo: 'kiln', project: null, stale: false, quiet: false, age_s: 120 },
      { spoken: 'S7', state: 'active', doing: 'this', agent: 'claude', repo: 'kiln', project: null, stale: false, quiet: false, age_s: 3 },
      { spoken: 'S8', state: SAID, doing: null, agent: 'claude', repo: 'kiln', project: null, stale: false, quiet: false, age_s: 60 },
    ],
    elsewhere: [],
  },
  waiting: [{ id: 'SG12', question: SAID }],
  registers: [],
  people: [],
  faded: 0,
  next: SAID,
});

type After = { after: (fn: () => void | Promise<void>) => void };

/** A stub host answering `context` with the hostile words, and the three ADMIN verbs with them as the id they name. */
async function stub(t: After) {
  const server: Server = createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      const method = new URL(req.url ?? '/', 'http://stub').pathname.replace(/^\/api\//, '');
      const answer = (value: unknown) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(value));
      };
      if (method === 'context') return answer({ ok: true, value: hostile() });
      if (method === 'automationRun') return answer({ ok: true, value: { run: `run_01J${SAID}` } });
      if (method === 'cancelRun') return answer({ ok: true, value: { run: `run_01J${SAID}`, state: 'cancelled' } });
      if (method === 'resumeScript') return answer({ ok: true, value: { script: `fx${SAID}` } });
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
  const base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  const dir = mkdtempSync(join(tmpdir(), 'braindog-clip-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const env = { XDG_CONFIG_HOME: join(dir, 'config'), APPDATA: join(dir, 'config'), BRAINDOG_HOST: base, BRAINDOG_TOKEN: TOKEN, BRAINDOG_TIMEOUT_MS: '4000' };
  writeSession(sessionPath(env, dir), { host: base, spoken: 'S7', client_id: 'claude-run-1', head_at_start: null, at: '2026-09-15T00:00:00Z' });
  const out: string[] = [];
  const said: string[] = [];
  const answered: Answer[] = [];
  const io: AgentIo = { env, cwd: dir, home: dir, out: (l) => void out.push(l), say: (l) => void said.push(l), headers: async () => ({}), answer: (a) => void answered.push(a) };
  return { io, out, said, answered };
}

/** No printed line carries a control character, and every one the words were in shows them scrubbed. */
function clean(lines: string[], expected: number): void {
  for (const line of lines) assert.equal(CONTROL.test(line), false, JSON.stringify(line));
  assert.equal(lines.filter((l) => l.includes(SHOWN)).length, expected, lines.join('\n'));
}

test('the start hook briefing: a DEL and a C1 CSI in the handoff, a live run, a question and the next step never reach the model', () => {
  clean(briefingOf('BrainDog: S7 resumed.', hostile(), undefined).split('\n'), 3);
});

test('braindog context: the headline scrubs a state the record sent, through the same clip as every other line', () => {
  const line = headline({ spoken: 'S7', state: SAID }, { repo: 'kiln', host: 'stub' }, '');
  clean([line], 1);
});

test('session show: the state, the project, the handoff, what was tried and what another run is doing are printed without a control byte', async (t) => {
  const h = await stub(t);
  assert.equal(await session(['show'], h.io), 0, h.said.join('\n'));
  clean(h.out, 4);
});

test('automations run and cancel, and scripts resume: the id the record answered with is printed scrubbed', async (t) => {
  const h = await stub(t);
  assert.equal(await automations(['run', 'chase'], h.io), 0, h.said.join('\n'));
  assert.equal(await automations(['cancel', 'run_01J9ZZZZZZZZZZZZZZZZZZZZZZ'], h.io), 0, h.said.join('\n'));
  assert.equal(await scripts(['resume', 'fx-rates'], h.io), 0, h.said.join('\n'));
  assert.deepEqual(h.out, [
    `chase started as run_01J${SHOWN}. The next drain takes it.`,
    `run_01J${SHOWN} is cancelled. A run stopped while it waits never resumes.`,
    `fx${SHOWN} runs again now. Three more refused runs in a row pause it again.`,
  ]);
  /* THE ENVELOPE IS THE RECORD'S VALUE, bytes and all: scrubbing it would change data an agent may be branching on. */
  assert.deepEqual(h.answered, [{ value: { run: `run_01J${SAID}` } }, { value: { run: `run_01J${SAID}`, state: 'cancelled' } }, { value: { script: `fx${SAID}` } }]);
});
