/**
 * `braindog tidy [--json]`: what went stale on the record and the call that clears each, read in one GET and said a
 * line a kind, and the record's refusal said plainly when it cannot read them yet.
 *
 * THE HOST IS A STUB ON node:http, as in `signs.test.ts`, because apps never import apps. What is under test is the
 * command: the one read it sends, that it names no run, and what it prints.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AgentIo } from '../src/skills.ts';
import { readStale, tidyCommand, tidyLines } from '../src/tidy.ts';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = mkdtempSync(join(tmpdir(), 'braindog-tidy-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

/** Three kinds as the record's `stale` answers them (`packages/record/src/methods/stale.ts`), seven things in all. */
const STALE = {
  lines: [
    {
      kind: 'steps',
      said: '3 steps were left earlier and nobody took them. The oldest was left 9 days ago: Send the invoice to Mira Holt',
      count: 3,
      clear: 'handoff with drop and why',
    },
    { kind: 'questions', said: '2 questions have waited more than 14 days for an answer. The oldest has waited 19 days.', count: 2, clear: 'decide with id and your answer' },
    { kind: 'keys-expired', said: 'Keys past their day: 2', count: 2, clear: 'Nothing to call. The hourly tidy looks at these again.' },
  ],
  count: 7,
};

const LINES = [
  '3  3 steps were left earlier and nobody took them. The oldest was left 9 days ago: Send the invoice to Mira Holt.',
  '   Clear it: handoff with drop and why.',
  '2  2 questions have waited more than 14 days for an answer. The oldest has waited 19 days.',
  '   Clear it: decide with id and your answer.',
  '2  Keys past their day: 2.',
  '   Clear it: Nothing to call. The hourly tidy looks at these again.',
  '',
  '7 things are stale.',
];

test('WHAT IS STALE IS SAID A LINE A KIND: the count, the sentence, the call that clears it under it, and the whole last', () => {
  const lines = tidyLines(readStale(STALE));
  assert.deepEqual(lines, LINES);
  for (const line of lines) assert.doesNotMatch(line, /—/u, 'no em dash in what a person reads');
  /* The kind is the record's handle for a line and is never printed. */
  assert.ok(!lines.some((l) => l.includes('keys-expired')));
  /* One thing is said as one, and counts of different widths line up on the sentence. */
  assert.deepEqual(tidyLines(readStale({ lines: [STALE.lines[0] && { ...STALE.lines[0], count: 1, said: '1 step was left 2 days ago and nobody took it.' }], count: 1 })), [
    '1  1 step was left 2 days ago and nobody took it.',
    '   Clear it: handoff with drop and why.',
    '',
    '1 thing is stale.',
  ]);
  const wide = tidyLines(readStale({ lines: [{ kind: 'a', said: 'Tools nobody has seen: 12', count: 12, clear: '' }, STALE.lines[1]] }));
  assert.deepEqual(wide, ['12  Tools nobody has seen: 12.', ' 2  2 questions have waited more than 14 days for an answer. The oldest has waited 19 days.', '    Clear it: decide with id and your answer.', '', '14 things are stale.']);
});

test('THE ANSWER IS READ AS THE RECORD GIVES IT: a missing part read as nothing, and nothing stale said in one sentence', () => {
  assert.deepEqual(readStale(null), { lines: [], count: 0 });
  assert.deepEqual(readStale({ lines: 'none' }), { lines: [], count: 0 });
  /* A line with no sentence, or that counts nothing, is not a line; the whole is the record's own number when it gives one. */
  assert.deepEqual(readStale({ lines: [{ kind: 'x', count: 4 }, { said: 'Nothing here', count: 0 }, 7, STALE.lines[2]], count: 2 }), {
    lines: [{ said: 'Keys past their day: 2', count: 2, clear: 'Nothing to call. The hourly tidy looks at these again.' }],
    count: 2,
  });
  assert.deepEqual(tidyLines(readStale({ lines: [], count: 0 })), ['Nothing is stale.']);
  assert.deepEqual(tidyLines(readStale({})), ['Nothing is stale.']);
});

/** A host whose `stale` answers `value`, or refuses with `refusal`, keeping every request it was sent. */
async function host(t: { after: (fn: () => Promise<void>) => void }, answer: { value?: unknown; refusal?: { code: string; fix: string }; status?: number }) {
  const seen: { method: string; verb: string | undefined; query: string; headers: IncomingHttpHeaders }[] = [];
  const server = createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://stub');
      seen.push({ method: url.pathname.replace(/^\/api\//, ''), verb: req.method, query: url.search, headers: req.headers });
      res.writeHead(answer.status ?? (answer.refusal ? 403 : 200), { 'content-type': 'application/json' });
      res.end(JSON.stringify(answer.refusal ? { ok: false, refusal: answer.refusal } : { ok: true, value: answer.value }));
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
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen };
}

function io(base: string): AgentIo & { lines: string[]; said: string[]; answered: unknown[] } {
  const lines: string[] = [];
  const said: string[] = [];
  const answered: unknown[] = [];
  return {
    env: { BRAINDOG_HOST: base, BRAINDOG_TOKEN: 'rec_01TESTTESTTESTTESTTESTTEST.tidy', XDG_CONFIG_HOME: join(scratch, 'config') },
    cwd: scratch,
    home: scratch,
    out: (l) => void lines.push(l),
    say: (l) => void said.push(l),
    answer: (a) => void answered.push(a),
    /* A run this folder is in, which the command must not send: asking what is stale is nobody's work. */
    headers: async () => ({ 'x-braindog-session': 'S7', 'x-braindog-client': 'claude-run-1' }),
    lines,
    said,
    answered,
  };
}

test('BRAINDOG TIDY IS ONE READ: a GET of stale and nothing else, naming no run, and the record’s answer handed on untouched', async (t) => {
  const h = await host(t, { value: STALE });
  const one = io(h.base);
  assert.equal(await tidyCommand([], one), 0, one.said.join('\n'));
  assert.deepEqual(h.seen.map((s) => [s.method, s.verb, s.query]), [['stale', 'GET', '']]);
  assert.equal(h.seen[0]!.headers.authorization, 'Bearer rec_01TESTTESTTESTTESTTESTTEST.tidy');
  /* THE COMMAND'S BUILD RIDES EVERY CALL (AGT-B01) and names no run, so it is the one `x-braindog-` header a read carries. */
  for (const name of Object.keys(h.seen[0]!.headers)) assert.doesNotMatch(name, /^x-braindog-(?!cli$)/u, `${name} names a run`);
  assert.deepEqual(one.answered, [{ value: STALE }]);
  assert.deepEqual(one.lines, LINES);
  assert.deepEqual(one.said, []);

  /* It takes nothing but the host: it files nothing and answers nothing, so there is nothing to apply. */
  for (const flag of ['--apply', '--fix', 'now']) {
    const two = io(h.base);
    assert.equal(await tidyCommand([flag], two), 1);
    assert.match(two.said[0]!, /^braindog tidy takes/u);
    assert.deepEqual(two.lines, []);
  }
  assert.equal(h.seen.length, 1);
});

test('WITH NOTHING STALE IT SAYS SO AND EXITS 0, and what the record says is scrubbed for the terminal', async (t) => {
  const calm = await host(t, { value: { lines: [], count: 0 } });
  const one = io(calm.base);
  assert.equal(await tidyCommand([], one), 0);
  assert.deepEqual(one.lines, ['Nothing is stale.']);
  assert.deepEqual(one.said, []);
  assert.deepEqual(one.answered, [{ value: { lines: [], count: 0 } }]);

  /* A sentence holding an escape cannot move the cursor or recolour the terminal. */
  const loud = await host(t, { value: { lines: [{ kind: 'steps', said: '1 step was left: \u001b[31mred\u001b[0m\u0007', count: 1, clear: 'handoff\u001b[2J' }], count: 1 } });
  const two = io(loud.base);
  assert.equal(await tidyCommand([], two), 0);
  // eslint-disable-next-line no-control-regex
  for (const line of two.lines) assert.doesNotMatch(line, /[\u0000-\u0008\u000b-\u001f\u007f]/u, `${JSON.stringify(line)} carries a control character`);
  assert.equal(two.lines.at(-1), '1 thing is stale.');
});

test('BRAINDOG TIDY SAYS PLAINLY why the record would not read: an older BrainDog exits 0 with one sentence, a refusal prints its fix', async (t) => {
  for (const [code, status] of [['NOT_IN_THIS_BUILD', 501], ['ROUTE_UNKNOWN', 404]] as const) {
    const older = await host(t, { refusal: { code, fix: 'This host has no stale.' }, status });
    const one = io(older.base);
    assert.equal(await tidyCommand([], one), 0, 'an older record is not a failed command');
    assert.deepEqual(one.lines, ['This BrainDog is older than this command and cannot say what is stale yet. It will once it is updated.']);
    assert.deepEqual(one.said, []);
    assert.deepEqual(one.answered, []);
  }
  const narrow = await host(t, { refusal: { code: 'FORBIDDEN', fix: 'This key may not read what is stale. Ask the owner for one that reads the record.' } });
  const two = io(narrow.base);
  assert.equal(await tidyCommand([], two), 1);
  assert.deepEqual(two.said, ['This key may not read what is stale. Ask the owner for one that reads the record.']);
  assert.deepEqual(two.lines, []);
  assert.deepEqual(two.answered, [{ refusal: { code: 'FORBIDDEN', fix: 'This key may not read what is stale. Ask the owner for one that reads the record.' } }]);

  const down = io('http://127.0.0.1:9');
  assert.equal(await tidyCommand([], down), 3);
  assert.equal(down.said.length, 1);
  assert.doesNotMatch(down.said[0]!, /—/u);
});

/** `braindog <args>` as a person runs it, against `base`: its exit code and both streams. */
async function run(base: string, args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const child = spawn(process.execPath, [join(APP, 'src', 'main.ts'), ...args], {
    cwd: scratch,
    env: { PATH: process.env.PATH, HOME: scratch, XDG_CONFIG_HOME: join(scratch, 'config'), BRAINDOG_HOST: base, BRAINDOG_TOKEN: 'rec_01TESTTESTTESTTESTTESTTEST.tidy' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (c: Buffer) => (stdout += c.toString('utf8')));
  child.stderr.on('data', (c: Buffer) => (stderr += c.toString('utf8')));
  const code = await new Promise<number | null>((done) => child.on('close', done));
  return { code, stdout, stderr };
}

test('BRAINDOG TIDY, AS A PERSON RUNS IT: the word is wired, --json prints one document holding the record’s answer, and help lists it', async (t) => {
  const h = await host(t, { value: STALE });
  const plain = await run(h.base, ['tidy']);
  assert.equal(plain.code, 0, plain.stderr);
  assert.equal(plain.stdout, `${LINES.join('\n')}\n`);

  const asked = await run(h.base, ['tidy', '--json']);
  assert.equal(asked.code, 0, asked.stderr);
  /* BYTE FOR BYTE: the document's value is the record's answer, its keys in the record's order and nothing added. */
  const doc = JSON.parse(asked.stdout) as { ok: boolean; value: unknown };
  assert.equal(doc.ok, true);
  assert.equal(JSON.stringify(doc.value), JSON.stringify(STALE));
  assert.deepEqual(h.seen.map((s) => [s.method, s.verb]), [['stale', 'GET'], ['stale', 'GET']]);
  for (const s of h.seen) for (const name of Object.keys(s.headers)) assert.doesNotMatch(name, /^x-braindog-(?!cli$)/u, `${name} names a run`);

  const wrong = await run(h.base, ['tidy', '--apply']);
  assert.equal(wrong.code, 1);
  assert.match(wrong.stderr, /^braindog tidy takes/u);
  assert.equal(h.seen.length, 2, 'an unknown flag sends nothing');

  const help = await run(h.base, ['help']);
  assert.match(help.stdout, /^braindog tidy \[--json\] \[--host <host>\]$/mu);
});
