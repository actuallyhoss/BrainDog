/**
 * `braindog signs [--json]`: the record's vital signs, read in one GET and said by name, each with a word beside its
 * state, and the record's refusal said plainly when it cannot read them yet.
 *
 * THE HOST IS A STUB ON node:http, as in `hooks.test.ts`, because apps never import apps. What is under test is the
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
import { FACTS_SHOWN, readSigns, signLines, signsCommand } from '../src/signs.ts';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = mkdtempSync(join(tmpdir(), 'braindog-signs-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

/** Five signs as the kernel's `signs()` answers them, three red on a record like the owner's of 7 October. */
const SIGNS = [
  {
    sign: 'arrivals-filed',
    state: 'red',
    value: 32,
    said: '32 arrivals wait to be filed, and the newest Ledger row is from 28 September',
    facts: ['Bank card messages: 17 waiting', 'Bank transfer messages: 15 waiting'],
    days: Array<string>(14).fill('red'),
  },
  { sign: 'numbers-arrive', state: 'red', value: 10, said: 'No project number has arrived since 28 September', facts: [], days: [{ day: '2026-10-07', state: 'red' }] },
  { sign: 'questions-by-cause', state: 'red', value: 17, said: '17 open questions share one cause: an unknown card ending 7731', facts: [] },
  { sign: 'oldest-question', state: 'green', value: 6, said: 'The oldest open question is 6 days old', facts: [] },
  { sign: 'runs-true', state: 'none', value: null, said: '', facts: [] },
];

test('THE SIGNS ARE READ AS THE RECORD GIVES THEM: a list or an object holding one, a missing part read as nothing', () => {
  const read = readSigns({ signs: SIGNS });
  assert.deepEqual(
    read.map((s) => [s.id, s.name, s.state, s.days.length]),
    [
      ['arrivals-filed', 'Arrivals filed', 'red', 14],
      ['numbers-arrive', 'Numbers arriving', 'red', 1],
      ['questions-by-cause', 'Questions by cause', 'red', 0],
      ['oldest-question', 'Oldest question', 'green', 0],
      ['runs-true', 'Runs ending true', 'none', 0],
    ],
  );
  assert.deepEqual(readSigns(SIGNS), read);
  assert.deepEqual(readSigns(null), []);
  /* A sign added later is read by the name the record gives it, or by its id said as words, never by the bare id. */
  assert.deepEqual(readSigns([{ sign: 'keys-fresh', state: 'amber' }, { id: 'model-answers', name: 'Model answering', state: 'green' }, { state: 'red' }]).map((s) => [s.name, s.state]), [
    ['Keys fresh', 'none'],
    ['Model answering', 'green'],
  ]);
});

test('THE SIGNS ARE SAID BY NAME, each state with a word and never a colour alone, a few facts each, and how many of the last days read red', () => {
  const facts = Array.from({ length: FACTS_SHOWN + 2 }, (_, i) => `Fact ${String(i + 1)}`);
  const lines = signLines(readSigns([{ ...SIGNS[0], facts }, SIGNS[3], SIGNS[4]]));
  assert.deepEqual(lines, [
    '1 of 3 signs need a look.',
    '',
    'Arrivals filed: Needs a look',
    '  32 arrivals wait to be filed, and the newest Ledger row is from 28 September.',
    ...facts.slice(0, FACTS_SHOWN).map((f) => `  ${f}.`),
    '  Red on 14 of the last 14 days.',
    '',
    'Oldest question: Fine',
    '  The oldest open question is 6 days old.',
    '',
    'Runs ending true: Not read yet',
  ]);
  for (const line of lines) {
    assert.doesNotMatch(line, /—/u, 'no em dash in what a person reads');
    assert.doesNotMatch(line, /\b[a-z]+-[a-z]+(-[a-z]+)?\b/u, `${line} prints an id`);
  }
  assert.deepEqual(signLines(readSigns([SIGNS[3]])), ['The one sign is fine.', '', 'Oldest question: Fine', '  The oldest open question is 6 days old.']);
  assert.deepEqual(signLines([]), ['Your record has no signs to read yet.']);
});

test('A SIGN NOT READ YET IS NEVER COUNTED AS FINE: none read says so, and some unread are counted apart from the fine', () => {
  /* An empty record reads every sign `none`, and the line said "All 16 signs are fine, or not read yet.", read as fine. */
  const unread = (n: number) => Array.from({ length: n }, (_, i) => ({ sign: `unread-${String(i)}`, state: 'none', said: 'Nothing has been filed for this sign yet.' }));
  assert.equal(signLines(readSigns(unread(16)))[0], 'No sign has been read yet.');
  assert.equal(signLines(readSigns(unread(1)))[0], 'The one sign has not been read yet.');
  assert.equal(signLines(readSigns([SIGNS[3], ...unread(14), { ...SIGNS[3], sign: 'runs-true' }]))[0], '2 signs are fine. 14 have not been read yet.');
  assert.equal(signLines(readSigns([SIGNS[3], SIGNS[4]]))[0], '1 sign is fine. 1 has not been read yet.');
  assert.equal(signLines(readSigns([SIGNS[3], { ...SIGNS[3], sign: 'runs-true' }]))[0], 'All 2 signs are fine.');
  /* A red sign leads, whatever else is unread. */
  assert.equal(signLines(readSigns([SIGNS[0], ...unread(3)]))[0], '1 of 4 signs need a look.');
  for (const n of [1, 2, 16]) for (const line of signLines(readSigns(unread(n)))) assert.doesNotMatch(line, /\bfine\b/u, `${line} calls an unread sign fine`);
});

/** A host whose `signs` answers `value`, or refuses with `refusal`, keeping every request it was sent. */
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
    env: { BRAINDOG_HOST: base, BRAINDOG_TOKEN: 'rec_01TESTTESTTESTTESTTESTTEST.signs', XDG_CONFIG_HOME: join(scratch, 'config') },
    cwd: scratch,
    home: scratch,
    out: (l) => void lines.push(l),
    say: (l) => void said.push(l),
    answer: (a) => void answered.push(a),
    /* A run this folder is in, which the command must not send: a read of the signs is nobody's work. */
    headers: async () => ({ 'x-braindog-session': 'S7', 'x-braindog-client': 'claude-run-1' }),
    lines,
    said,
    answered,
  };
}

test('BRAINDOG SIGNS IS ONE READ: a GET of signs and nothing else, naming no run, and the record’s answer handed on untouched', async (t) => {
  const h = await host(t, { value: { signs: SIGNS } });
  const one = io(h.base);
  assert.equal(await signsCommand([], one), 0, one.said.join('\n'));
  assert.deepEqual(h.seen.map((s) => [s.method, s.verb, s.query]), [['signs', 'GET', '']]);
  assert.equal(h.seen[0]!.headers.authorization, 'Bearer rec_01TESTTESTTESTTESTTESTTEST.signs');
  /* THE COMMAND'S BUILD RIDES EVERY CALL and names no run, so it is the one `x-braindog-` header a read carries. */
  for (const name of Object.keys(h.seen[0]!.headers)) assert.doesNotMatch(name, /^x-braindog-(?!cli$)/u, `${name} names a run`);
  assert.deepEqual(one.answered, [{ value: { signs: SIGNS } }]);
  assert.equal(one.lines[0], '3 of 5 signs need a look.');
  assert.ok(one.lines.includes('Questions by cause: Needs a look'));

  /* It takes nothing but the host. */
  const two = io(h.base);
  assert.equal(await signsCommand(['--apply'], two), 1);
  assert.match(two.said[0]!, /^braindog signs takes/u);
  assert.equal(h.seen.length, 1);
});

test('A RED SIGN EXITS 0 ON PURPOSE, and --strict exits 2 on any red and says why, for a script', async (t) => {
  const reds = await host(t, { value: { signs: SIGNS } });
  const plain = io(reds.base);
  assert.equal(await signsCommand([], plain), 0, 'a red sign is the answer, not a failed read');
  assert.deepEqual(plain.said, []);
  const strict = io(reds.base);
  assert.equal(await signsCommand(['--strict'], strict), 2);
  assert.equal(strict.lines[0], '3 of 5 signs need a look.', 'the signs are still printed');
  assert.deepEqual(strict.said, ['3 signs need a look, so this ends with exit 2 as --strict asks.']);
  for (const line of strict.said) assert.doesNotMatch(line, /—/u);

  /* No red, or nothing read yet, is not a failure even under --strict. */
  const calm = await host(t, { value: { signs: [SIGNS[3], SIGNS[4]] } });
  const quiet = io(calm.base);
  assert.equal(await signsCommand(['--strict'], quiet), 0);
  assert.deepEqual(quiet.said, []);
  assert.equal(quiet.lines[0], '1 sign is fine. 1 has not been read yet.');

  /* A refusal and an unreachable host keep their own codes under --strict. */
  const narrow = await host(t, { refusal: { code: 'FORBIDDEN', fix: 'The signs are about the whole record, and this caller is held to part of it.' } });
  assert.equal(await signsCommand(['--strict'], io(narrow.base)), 1);
  assert.equal(await signsCommand(['--strict'], io('http://127.0.0.1:9')), 3);
});

test('BRAINDOG SIGNS SAYS PLAINLY why the record would not read them: a record older than the command, or the record’s own reason', async (t) => {
  for (const [code, status] of [['ROUTE_UNKNOWN', 404], ['NOT_IN_THIS_BUILD', 501]] as const) {
    const older = await host(t, { refusal: { code, fix: 'This host has no signs.' }, status });
    const one = io(older.base);
    assert.equal(await signsCommand([], one), 1);
    assert.deepEqual(one.said, ['Your record is older than this command and cannot read its signs yet. It will once it is updated.']);
    assert.deepEqual(one.lines, []);
  }
  const narrow = await host(t, { refusal: { code: 'FORBIDDEN', fix: 'The signs are about the whole record, and this caller is held to part of it.' } });
  const two = io(narrow.base);
  assert.equal(await signsCommand([], two), 1);
  assert.deepEqual(two.said, ['The signs are about the whole record, and this caller is held to part of it.']);

  const down = io('http://127.0.0.1:9');
  assert.equal(await signsCommand([], down), 3);
});

test('BRAINDOG SIGNS --JSON, AS A PERSON RUNS IT, prints one document holding the record’s answer and exits 0', async (t) => {
  const h = await host(t, { value: { signs: SIGNS } });
  const child = spawn(process.execPath, [join(APP, 'src', 'main.ts'), 'signs', '--json'], {
    cwd: scratch,
    env: { PATH: process.env.PATH, HOME: scratch, XDG_CONFIG_HOME: join(scratch, 'config'), BRAINDOG_HOST: h.base, BRAINDOG_TOKEN: 'rec_01TESTTESTTESTTESTTESTTEST.signs' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  child.stdout.on('data', (c: Buffer) => (stdout += c.toString('utf8')));
  const code = await new Promise<number | null>((done) => child.on('close', done));
  assert.equal(code, 0);
  const doc = JSON.parse(stdout) as { ok: boolean; value: unknown };
  assert.equal(doc.ok, true);
  assert.deepEqual(doc.value, { signs: SIGNS });
  assert.deepEqual(h.seen.map((s) => s.method), ['signs']);
});
