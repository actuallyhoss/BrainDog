/**
 * `braindog tidy [--json]`: what went stale on the record and the call that clears each, read in GETs and said a line a
 * kind, and the record's refusal said plainly when it cannot read them yet. What `--ask` files is `tidy-ask.test.ts`'s,
 * but for the fold of what is held twice, which is sent here through the real client to a stub that answers it.
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

/**
 * What every host here says to the two newer reads: it has no such route, as a record older than them does. The client
 * refuses them in the same words before sending while its route table has no row for them, so the command prints the
 * same either way. Their answers are `tidy-ask.test.ts`'s.
 */
const OLDER_BOTH = 'This BrainDog cannot say yet what looks like it belongs to a project, or which lessons were learned twice. It will once it is updated.';

type Answer = { value?: unknown; refusal?: { code: string; fix: string }; status?: number };

/** A host whose `stale` answers `value`, or refuses with `refusal`, keeping every request it was sent. */
async function host(t: { after: (fn: () => Promise<void>) => void }, stale: Answer) {
  const seen: { method: string; verb: string | undefined; query: string; headers: IncomingHttpHeaders }[] = [];
  const server = createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://stub');
      const method = url.pathname.replace(/^\/api\//, '');
      seen.push({ method, verb: req.method, query: url.search, headers: req.headers });
      const answer: Answer = method === 'stale' || stale.refusal ? stale : { refusal: { code: 'ROUTE_UNKNOWN', fix: `There is no method called ${method}.` }, status: 404 };
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

test('BRAINDOG TIDY WITHOUT --ask ONLY READS: GETs of stale and the two newer reads, naming no run, and the record’s answer handed on untouched', async (t) => {
  const h = await host(t, { value: STALE });
  const one = io(h.base);
  assert.equal(await tidyCommand([], one), 0, one.said.join('\n'));
  /* STALE ONCE AND FIRST, AND NOTHING BUT GETS: the newer reads reach the host once their route rows land. */
  assert.deepEqual(h.seen[0] && [h.seen[0].method, h.seen[0].verb, h.seen[0].query], ['stale', 'GET', '']);
  assert.equal(h.seen.filter((s) => s.method === 'stale').length, 1);
  for (const s of h.seen) assert.equal(s.verb, 'GET', `${s.method} was sent as a ${String(s.verb)}`);
  assert.ok(h.seen.every((s) => ['stale', 'scopeProposals', 'learningsTwice'].includes(s.method)));
  assert.equal(h.seen[0]!.headers.authorization, 'Bearer rec_01TESTTESTTESTTESTTESTTEST.tidy');
  /* THE COMMAND'S BUILD RIDES EVERY CALL (AGT-B01) and names no run, so it is the one `x-braindog-` header a read carries. */
  for (const s of h.seen) for (const name of Object.keys(s.headers)) assert.doesNotMatch(name, /^x-braindog-(?!cli$)/u, `${name} names a run`);
  assert.deepEqual(one.answered, [{ value: { stale: STALE } }]);
  assert.deepEqual(one.lines, [...LINES, '', OLDER_BOTH]);
  assert.deepEqual(one.said, []);

  /* It takes the host and --ask and nothing else, so there is nothing to apply. */
  const before = h.seen.length;
  for (const flag of ['--apply', '--fix', 'now']) {
    const two = io(h.base);
    assert.equal(await tidyCommand([flag], two), 1);
    assert.match(two.said[0]!, /^braindog tidy takes \[--ask\], \[--json\] and \[--host <host>\]/u);
    assert.deepEqual(two.lines, []);
  }
  assert.equal(h.seen.length, before, 'an unknown flag sends nothing');
});

test('WITH NOTHING STALE IT SAYS SO AND EXITS 0, and what the record says is scrubbed for the terminal', async (t) => {
  const calm = await host(t, { value: { lines: [], count: 0 } });
  const one = io(calm.base);
  assert.equal(await tidyCommand([], one), 0);
  assert.deepEqual(one.lines, ['Nothing is stale.', '', OLDER_BOTH]);
  assert.deepEqual(one.said, []);
  assert.deepEqual(one.answered, [{ value: { stale: { lines: [], count: 0 } } }]);

  /* A sentence holding an escape cannot move the cursor or recolour the terminal. */
  const loud = await host(t, { value: { lines: [{ kind: 'steps', said: '1 step was left: \u001b[31mred\u001b[0m\u0007', count: 1, clear: 'handoff\u001b[2J' }], count: 1 } });
  const two = io(loud.base);
  assert.equal(await tidyCommand([], two), 0);
  // eslint-disable-next-line no-control-regex
  for (const line of two.lines) assert.doesNotMatch(line, /[\u0000-\u0008\u000b-\u001f\u007f]/u, `${JSON.stringify(line)} carries a control character`);
  assert.deepEqual(two.lines.slice(-3), ['1 thing is stale.', '', OLDER_BOTH]);
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
  assert.equal(plain.stdout, `${[...LINES, '', OLDER_BOTH].join('\n')}\n`);

  const asked = await run(h.base, ['tidy', '--json']);
  assert.equal(asked.code, 0, asked.stderr);
  /* BYTE FOR BYTE: the document's value holds the record's answer under its call's name, its keys in the record's order and nothing added. */
  const doc = JSON.parse(asked.stdout) as { ok: boolean; value: unknown };
  assert.equal(doc.ok, true);
  assert.equal(JSON.stringify(doc.value), JSON.stringify({ stale: STALE }));
  assert.deepEqual(h.seen.filter((s) => s.method === 'stale').map((s) => [s.method, s.verb]), [['stale', 'GET'], ['stale', 'GET']]);
  for (const s of h.seen) assert.equal(s.verb, 'GET');
  const sent = h.seen.length;
  for (const s of h.seen) for (const name of Object.keys(s.headers)) assert.doesNotMatch(name, /^x-braindog-(?!cli$)/u, `${name} names a run`);

  const wrong = await run(h.base, ['tidy', '--apply']);
  assert.equal(wrong.code, 1);
  assert.match(wrong.stderr, /^braindog tidy takes/u);
  assert.equal(h.seen.length, sent, 'an unknown flag sends nothing');

  /* THE HELP IS GROUPED: tidy has its short row there, and its own --help gives the whole line. */
  const help = await run(h.base, ['help']);
  assert.match(help.stdout, /^  tidy +\S/mu);
  const own = await run(h.base, ['tidy', '--help']);
  /* `--ask` joins this line when main.ts names it (blocked for batch 89's file), so either form passes. */
  assert.match(own.stdout, /^braindog tidy (\[--ask\] )?\[--json\] \[--host <host>\]$/mu);
});

/**
 * A host keeping three lists, two that say what makes two things the same (`same:`) and one that does not, with `pairs`
 * the numbers `heldTwice` answers for each. It answers the reads the fold makes, and the fold itself as the record
 * does, `{ question }`, keeping every request with its body.
 */
async function foldHost(t: { after: (fn: () => Promise<void>) => void }, pairs: Record<string, number[]>) {
  const seen: { method: string; verb: string | undefined; register: string | null; body: string }[] = [];
  const lists: Record<string, Record<string, unknown>> = {
    tools: { id: 'tools', name: 'Tools', one: 'tool', same: { fields: ['name'], within: 'project', fold: 'text' } },
    skills: { id: 'skills', name: 'Skills', one: 'skill', same: { fields: ['name'], within: 'project', fold: 'text', keep: 'oldest' } },
    notes: { id: 'notes', name: 'Notes', one: 'note' },
  };
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c: Buffer) => (body += c.toString('utf8')));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://stub');
      const method = url.pathname.replace(/^\/api\//, '');
      const register = url.searchParams.get('register') ?? ((body === '' ? {} : JSON.parse(body)) as { register?: string }).register ?? null;
      seen.push({ method, verb: req.method, register, body });
      let value: unknown;
      if (method === 'stale') value = { lines: [], count: 0 };
      else if (method === 'boot') value = { registers: Object.values(lists).map((l) => ({ id: l.id, name: l.name, count: 3, icon: null })), now: '2026-10-15T09:00:00.000Z' };
      else if (method === 'schema' && register !== null) value = lists[register];
      else if (method === 'heldTwice' && register !== null) value = lists[register]?.same ? { seqs: pairs[register] ?? [] } : null;
      else if (method === 'askFoldTwice') value = { question: '01JQUESTIONQUESTIONQUESTIO' };
      const known = value !== undefined;
      res.writeHead(known ? 200 : 404, { 'content-type': 'application/json' });
      res.end(JSON.stringify(known ? { ok: true, value } : { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: `There is no method called ${method}.` } }));
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

test('--ask FILES ONE FOLD QUESTION A LIST THAT HOLDS A PAIR, through the real client, and none for a list with none', async (t) => {
  const h = await foldHost(t, { tools: [2, 5, 7, 9], skills: [] });
  const one = io(h.base);
  assert.equal(await tidyCommand(['--ask'], one), 0, one.said.join('\n'));
  /* THE FOLD IS ASKED OF THE LISTS THAT SAY `same:` ONLY, and filed for the one holding a pair, once, as a POST. */
  assert.deepEqual(h.seen.filter((s) => s.method === 'heldTwice').map((s) => [s.register, s.verb]), [['tools', 'GET'], ['skills', 'GET']]);
  const folds = h.seen.filter((s) => s.method === 'askFoldTwice');
  assert.equal(folds.length, 1);
  assert.equal(folds[0]!.verb, 'POST');
  assert.deepEqual(JSON.parse(folds[0]!.body), { register: 'tools' });
  assert.ok(one.lines.includes('Asked on Decide: 4 tools may be here twice. Keep one of each?'), one.lines.join('\n'));
  for (const line of one.lines) assert.doesNotMatch(line, /01J[0-9A-Z]{10,}|—/u, `${line} holds an id or an em dash`);
  /* THE QUESTION IS THE LOGIN'S, so it names no run either. */
  assert.deepEqual(one.said, []);

  /* NO PAIR, NO QUESTION: the reads go and nothing is filed. */
  const calm = await foldHost(t, { tools: [], skills: [] });
  const two = io(calm.base);
  assert.equal(await tidyCommand(['--ask'], two), 0, two.said.join('\n'));
  assert.equal(calm.seen.filter((s) => s.method === 'heldTwice').length, 2);
  assert.equal(calm.seen.filter((s) => s.method === 'askFoldTwice').length, 0);
  assert.ok(!two.lines.some((l) => l.includes('may be here twice')));
});

test('WITHOUT --ask NOTHING OF THE FOLD IS READ OR FILED: no index read, no heldTwice, no question, nothing but GETs', async (t) => {
  const h = await foldHost(t, { tools: [2, 5], skills: [1, 3] });
  const one = io(h.base);
  assert.equal(await tidyCommand([], one), 0, one.said.join('\n'));
  assert.ok(!h.seen.some((s) => ['boot', 'schema', 'heldTwice', 'askFoldTwice'].includes(s.method)), h.seen.map((s) => s.method).join(' '));
  for (const s of h.seen) assert.equal(s.verb, 'GET');
  assert.ok(!one.lines.some((l) => l.includes('may be here twice')));
});
