/**
 * `--json` through a real child process, because the claim is about what lands on which stream.
 *
 * THE FLAG IS A PROMISE ABOUT TWO FILE DESCRIPTORS (`docs/48-SPEC-CLI.md` §4.5): exactly one JSON
 * document on stdout, every other line on stderr. A test that called the command function in process
 * and read an array of strings would pass while the real command wrote the briefing and the document
 * to the same pipe, which is the one failure a caller cannot recover from: `JSON.parse` on a buffer
 * with a sentence in front of it throws, and the sentence is the thing the flag exists to avoid.
 *
 * NO TOKEN, ON ANY PATH, IN ANY FORMAT. A JSON mode is a brand new way to leak one, because it prints
 * objects rather than sentences somebody wrote by hand. So every case here runs with an obviously fake
 * bearer in `BRAINDOG_TOKEN` and asserts it is in neither stream, success and refusal alike, and the
 * one command that has a bearer in its hand when it answers, `login`, has its value asserted field by
 * field rather than by a substring.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FORMAT_VERSION, KERNEL_MIGRATION } from '@braindog/kernel';
import { PRIMITIVES_VERSION } from 'braindog-render';

import { machine, takeJson } from '../src/json.ts';

const MAIN = fileURLToPath(new URL('../src/main.ts', import.meta.url));

/* Obviously fake, and long enough that a fragment of it in any output is findable. */
const TOKEN = ['rec_01TESTTESTTESTTESTTESTTEST', 'stub-bearer-for-tests-only-91cd'].join('.');

const CONTEXT = {
  session: { spoken: 'S7', state: 'active' },
  ambiguous: [],
  handoff: null,
  live: { same_repo: [], elsewhere: [] },
  waiting: [],
  people: [],
  faded: 0,
  project: null,
  registers: [],
  next: 'Start with the task in front of you, and call handoff with your next step before you stop.',
};

const PAGE_ANSWER = { page: 'invoicing', title: 'Invoicing', blocks: [{ kind: 'text', body: 'Hello.' }] };

type Ran = { code: number | null; stdout: string; stderr: string };

const ran = (args: string[], env: NodeJS.ProcessEnv, cwd: string): Promise<Ran> =>
  new Promise((done) => {
    const child = spawn(process.execPath, [MAIN, ...args], { env, cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += String(d)));
    child.stderr.on('data', (d) => (stderr += String(d)));
    child.on('close', (code) => done({ code, stdout, stderr }));
  });

/** The stub record: `context` and `arrangement`, and a refusal for anything else, as `page.test.ts` answers. */
async function stub(t: { after: (fn: () => void | Promise<void>) => void }) {
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://stub');
      const method = url.pathname.replace(/^\/api\//, '');
      const raw = Buffer.concat(chunks).toString('utf8');
      const args = (raw ? JSON.parse(raw) : Object.fromEntries(url.searchParams)) as Record<string, unknown>;
      const answer = (value: unknown) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(value));
      };
      if (method === 'context') return answer({ ok: true, value: CONTEXT });
      /* `page pull` READS THE STORED DECLARATION through `arrangement({ page })`, not the drawn `page`. */
      if (method === 'arrangement')
        return answer(
          args.page === 'invoicing'
            ? { ok: true, value: { id: 'page.invoicing', version: 1, pack: null, body: PAGE_ANSWER } }
            : { ok: false, refusal: { code: 'PAGE_UNKNOWN', fix: `There is no page at ${String(args.page)}.`, at: 'page' } },
        );
      return answer({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: `The stub does not answer ${method}.` } });
    });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise<void>((done) => server.close(() => done())));
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
}

async function setup(t: { after: (fn: () => void | Promise<void>) => void }) {
  const base = await stub(t);
  const dir = mkdtempSync(join(tmpdir(), 'braindog-json-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const env: NodeJS.ProcessEnv = { ...process.env, XDG_CONFIG_HOME: join(dir, 'config'), APPDATA: join(dir, 'config'), BRAINDOG_HOST: base, BRAINDOG_TOKEN: TOKEN };
  return { base, dir, env };
}

/** One document and nothing else, and the fake bearer in neither stream. */
function document(out: Ran): Record<string, unknown> {
  assert.equal(out.stdout.trimEnd().includes('\n'), false, `stdout is not one line: ${out.stdout}`);
  assert.equal(out.stdout.includes(TOKEN), false, 'the token reached stdout');
  assert.equal(out.stderr.includes(TOKEN), false, 'the token reached stderr');
  return JSON.parse(out.stdout) as Record<string, unknown>;
}

test('--version --json IS THE FOUR NUMBERS AS FIELDS, on stdout, with nothing on stderr', async (t) => {
  const h = await setup(t);
  const out = await ran(['--version', '--json'], h.env, h.dir);
  assert.equal(out.stderr, '', out.stderr);
  assert.equal(out.code, 0);
  assert.deepEqual(document(out), {
    ok: true,
    value: { app: 'dev+0000000', format: FORMAT_VERSION, kernel: KERNEL_MIGRATION, primitives: PRIMITIVES_VERSION },
  });
});

test('context --json PUTS THE BRIEFING IN THE DOCUMENT AND NOT ON STDOUT BESIDE IT', async (t) => {
  const h = await setup(t);
  const plain = await ran(['context'], h.env, h.dir);
  assert.equal(plain.code, 0, plain.stderr);

  const out = await ran(['context', '--json'], h.env, h.dir);
  assert.equal(out.code, 0, out.stderr);
  const doc = document(out) as { ok: boolean; value: { lines: string[] } };
  assert.equal(doc.ok, true);
  /* The same lines, in the same order, as the readable run printed: the flag moves the output, and
     nothing about the answer itself changes. */
  assert.deepEqual(doc.value.lines, plain.stdout.trimEnd().split('\n'));
  /* The stub sends no card (the record draws it), so the one line is the whole answer. */
  assert.deepEqual(doc.value.lines, ['Connected to BrainDog. Call context.']);
});

test('a refusal IS AS MACHINE-READABLE AS A SUCCESS: the code, the fix and the at, not a sentence', async (t) => {
  const h = await setup(t);
  const out = await ran(['page', 'pull', 'nowhere', '--json'], h.env, h.dir);
  assert.equal(out.code, 1);
  assert.deepEqual(document(out), {
    ok: false,
    refusals: [{ code: 'PAGE_UNKNOWN', fix: 'There is no page at nowhere.', at: 'page' }],
  });
  /* The document keeps the record's own sentence; the stream a person reads has it in plain words (`noPage`). */
  assert.equal(out.stderr.trim(), 'There is no page nowhere here that you can read.');
});

test('a success WITH A REPLY TYPE OF ITS OWN carries it rather than the lines', async (t) => {
  const h = await setup(t);
  const out = await ran(['page', 'pull', 'invoicing', '--json'], h.env, h.dir);
  assert.equal(out.code, 0, out.stderr);
  const doc = document(out) as { ok: boolean; value: { page: string; file: string } };
  assert.equal(doc.ok, true);
  assert.equal(doc.value.page, 'invoicing');
  /* ON macOS THE TEMP FOLDER IS A LINK (/var is /private/var), and the child answers the folder it resolved. */
  assert.equal(realpathSync(doc.value.file), realpathSync(join(h.dir, 'invoicing.dog')));
});

test('a local error IS THE error VARIANT WITH A SENTENCE AND NO INVENTED CODE (§13 D11)', async (t) => {
  const h = await setup(t);
  const out = await ran(['page', 'pull', '--json'], h.env, h.dir);
  assert.equal(out.code, 1);
  const doc = document(out) as { ok: boolean; error: { message: string; cause?: string } };
  assert.equal(doc.ok, false);
  assert.match(doc.error.message, /braindog page pull takes one slug/);
  assert.equal(doc.error.cause, undefined);
});

test('a host that does not answer IS exit 3 AND cause unreachable, never a refusal a caller would retry', async (t) => {
  const h = await setup(t);
  /* A port nothing is listening on: the client synthesises UNREACHABLE and §4.4 makes that exit 3. */
  const env = { ...h.env, BRAINDOG_HOST: 'http://127.0.0.1:1' };
  const out = await ran(['context', '--json'], env, h.dir);
  assert.equal(out.code, 3, out.stderr);
  const doc = document(out) as { ok: boolean; error: { message: string; cause?: string } };
  assert.equal(doc.ok, false);
  assert.equal(doc.error.cause, 'unreachable');
  assert.match(doc.error.message, /did not answer/);
});

test('A BAD ARGUMENT IS STILL ONE DOCUMENT, because a caller reading JSON has nowhere else to look', async (t) => {
  const h = await setup(t);
  const out = await ran(['login', '--json'], h.env, h.dir);
  assert.equal(out.code, 1);
  const doc = document(out) as { ok: boolean; error: { message: string } };
  assert.equal(doc.ok, false);
  assert.match(doc.error.message, /braindog login takes one host/);
});

test('logout --json COUNTS WHAT IT REMOVED AND NAMES NOTHING, and the file it read held a bearer', async (t) => {
  const h = await setup(t);
  const env = { ...h.env };
  delete env.BRAINDOG_TOKEN;
  /* Written by hand rather than by `login`, so the test does not need a device flow to have a token
     on disk: this is the file every other command reads its bearer from. */
  const file = join(h.dir, 'config', 'braindog', 'hosts.json');
  const { mkdirSync, writeFileSync } = await import('node:fs');
  mkdirSync(join(h.dir, 'config', 'braindog'), { recursive: true });
  writeFileSync(
    file,
    JSON.stringify({ default: h.base, hosts: { [h.base]: { token: { value: TOKEN, expires: '2099-01-01T00:00:00.000Z', label: 'a machine' }, vault: { 'things#3': { value: TOKEN, expires: '2099-01-01T00:00:00.000Z' } } } } }),
  );

  const out = await ran(['logout', h.base, '--json'], env, h.dir);
  assert.equal(out.code, 0, out.stderr);
  assert.deepEqual(document(out), { ok: true, value: { host: h.base, tokens: 1, runners: 0, grants: 1, default_cleared: true } });
  /* The readable sentence is still there, on stderr, where it no longer collides with the document. */
  assert.match(out.stderr, /signed out of/);
});

test('THE SIX COMMANDS §4.5 EXCLUDES DO NOT QUIETLY ACCEPT THE FLAG', async (t) => {
  const h = await setup(t);
  /* `mcp`'s stdout is the protocol, so a document on it would corrupt the stream rather than help. */
  const mcp = await ran(['mcp', '--json'], h.env, h.dir);
  assert.equal(mcp.code, 1);
  assert.equal(mcp.stdout, '');
  assert.match(mcp.stderr, /braindog mcp takes --agent, --host and --local/);

  /* `keys exec` and `run` hand stdout to the command they start, so the flag is refused by the verb's
     own option list and the label is not echoed back on the way. */
  for (const argv of [
    ['keys', 'exec', 'a-label', '--json', '--', 'node', '-e', '1'],
    ['run', 'a-label', '--json', '--', 'node', '-e', '1'],
  ]) {
    const out = await ran(argv, h.env, h.dir);
    assert.equal(out.code, 1, argv.join(' '));
    assert.equal(out.stdout, '', argv.join(' '));
    assert.match(out.stderr, /braindog keys exec takes one label/);
  }

  /* `keys put` IS THE EXCEPTION INSIDE ITS OWN COMMAND: it has an answer, so it takes the flag. */
  const put = await ran(['keys', 'put', 'a-label', '--json'], h.env, h.dir);
  assert.equal(put.code, 1);
  const doc = document(put) as { ok: boolean; error: { message: string } };
  assert.equal(doc.ok, false);
  /* Refused before anything is sent: the child is started with stdin on the null device, so there is
     no value to deposit. What matters here is that the refusal arrived as a document rather than as
     the parse error `keys exec` gets. */
  assert.match(doc.error.message, /Standard input was empty/);
});

test('usecase preview REFUSES THE FLAG TOO, because the self-host it spawns owns this stdout', async (t) => {
  const h = await setup(t);
  const { writeFileSync } = await import('node:fs');
  /* A self-host that is only its two streams: `init` succeeds silently and `serve` prints the one line
     the real one prints on startup. Without this the regression under test would spawn the real
     self-host, which listens until Ctrl+C, and the test would hang rather than fail. */
  const entry = join(h.dir, 'stub-selfhost.mjs');
  writeFileSync(entry, "if (process.argv[2] === 'init') process.exit(0);\nprocess.stdout.write('BrainDog self-host listening on http://localhost:5870\\n');\nprocess.exit(0);\n");
  const env = { ...h.env, BRAINDOG_SELFHOST: entry };

  const made = await ran(['usecase', 'new', 'demo-thing'], env, h.dir);
  assert.equal(made.code, 0, made.stderr);

  /* MEASURED BEFORE THE EXCLUSION EXISTED: exit 0, and stdout held the self-host's startup line with
     the document underneath it, so `JSON.parse` over the buffer threw. */
  const out = await ran(['usecase', 'preview', 'demo-thing-1.0.0.usecase.json', '--json'], env, h.dir);
  assert.equal(out.code, 1, out.stdout);
  assert.equal(out.stdout, '', out.stdout);
  assert.match(out.stderr, /braindog usecase preview takes one file and --port/);
});

test('help ANSWERS THE FLAG RATHER THAN IGNORING IT, because it is not one of the six', async (t) => {
  const h = await setup(t);
  const out = await ran(['help', '--json'], h.env, h.dir);
  assert.equal(out.code, 0, out.stderr);
  const doc = document(out) as { ok: boolean; value: { lines: string[] } };
  assert.equal(doc.ok, true);
  /* The same text the readable run prints, moved off stdout and into the document. */
  const plain = await ran(['help'], h.env, h.dir);
  assert.deepEqual(doc.value.lines, plain.stdout.trimEnd().split('\n'));
});

test('takeJson LEAVES A CHILD PROCESS ITS OWN --json, because everything after -- belongs to the child', () => {
  assert.deepEqual(takeJson(['exec', 'openai', '--', 'node', 'x.js', '--json']), { rest: ['exec', 'openai', '--', 'node', 'x.js', '--json'], json: false });
  assert.deepEqual(takeJson(['exec', '--json', '--', 'node', '--json']), { rest: ['exec', '--', 'node', '--json'], json: true });
  assert.deepEqual(takeJson(['pull', 'x']), { rest: ['pull', 'x'], json: false });
});

test('THE ENVELOPE IS THE EXIT CODE READ BACK: four answers, and the order they are decided in', () => {
  const said: string[] = [];
  const m = machine((l) => void said.push(l));
  m.out('a line');
  assert.deepEqual(m.envelope(0), { ok: true, value: { lines: ['a line'] } });

  const r = machine(() => {});
  r.answer({ refusal: { code: 'FORBIDDEN', fix: 'Ask the owner.' } });
  assert.deepEqual(r.envelope(1), { ok: false, refusals: [{ code: 'FORBIDDEN', fix: 'Ask the owner.' }] });

  /* AN UNREACHABLE HOST IS NOT A REFUSAL, whatever shape the client hands it over in. */
  const u = machine(() => {});
  u.say('nowhere did not answer.');
  u.answer({ refusal: { code: 'UNREACHABLE', fix: 'nowhere did not answer.' } });
  assert.deepEqual(u.envelope(3), { ok: false, error: { message: 'nowhere did not answer.', cause: 'unreachable' } });

  const c = machine(() => {});
  c.answer({ conflict: { version: 4, current: { id: 'x' }, actor: 'someone' } });
  assert.deepEqual(c.envelope(2), { ok: false, conflict: { version: 4, current: { id: 'x' }, actor: 'someone' } });
});

test('keys list TAKES THE FLAG AS keys put DOES: one document, and a refusal is in it', async (t) => {
  const h = await setup(t);
  const out = await ran(['keys', 'list', '--json'], h.env, h.dir);
  assert.equal(out.code, 1, out.stderr);
  /* One line and one document: the verb's own lines and its own envelope are not printed beside main's. */
  assert.equal(out.stdout.trim().split('\n').length, 1, out.stdout);
  assert.equal(document(out).ok, false);
});

test('doctor PRINTS ITS LINES, OR ITS REPORT AS THE DOCUMENT, and exits 1 when anything is listed', async (t) => {
  const h = await setup(t);
  const { mkdirSync, writeFileSync } = await import('node:fs');
  /* A home with one profile that holds neither BrainDog's server nor a hook, so one thing at least is listed. */
  mkdirSync(join(h.dir, '.claude'), { recursive: true });
  writeFileSync(join(h.dir, '.claude', 'settings.json'), '{}\n');
  const env = { ...h.env, HOME: h.dir, USERPROFILE: h.dir, CLAUDE_CONFIG_DIR: '', CCENV_HOME: '' };

  const plain = await ran(['doctor'], env, h.dir);
  assert.equal(plain.code, 1, plain.stderr);
  assert.match(plain.stdout, /BrainDog's server is not registered/);

  const doc = await ran(['doctor', '--json'], env, h.dir);
  assert.equal(doc.code, 1, doc.stderr);
  const report = document(doc) as { ok: boolean; value: { places: { kind: string }[]; profiles: unknown[] } };
  assert.equal(report.ok, true);
  assert.equal(report.value.profiles.length, 1);
  assert.ok(report.value.places.some((p) => p.kind === 'profile'));

  /* An argument it does not take is one sentence and nothing on stdout. */
  const wrong = await ran(['doctor', '--apply'], env, h.dir);
  assert.equal(wrong.code, 1);
  assert.equal(wrong.stdout, '');
  assert.match(wrong.stderr, /braindog doctor takes --replaced/);
});

test('env diff AND sync inventory PRINT THEIR LINES, OR THEIR PLAN AS THE DOCUMENT, with the record read and no token shown', async (t) => {
  const h = await setup(t);
  const { mkdirSync, writeFileSync } = await import('node:fs');
  mkdirSync(join(h.dir, '.claude'), { recursive: true });
  writeFileSync(join(h.dir, '.claude', 'settings.json'), '{}\n');
  const env = { ...h.env, HOME: h.dir, USERPROFILE: h.dir, CLAUDE_CONFIG_DIR: '', CCENV_HOME: '', CODEX_HOME: '' };

  /* The stub refuses `list`, which is said in one line, and the profile is compared alone. */
  const plain = await ran(['env', 'diff'], env, h.dir);
  assert.equal(plain.code, 0, plain.stderr);
  assert.match(plain.stdout, /^braindog env diff read 1 profile, and changed nothing\./);
  assert.match(plain.stdout, /BrainDog would not list its tools and skills, so they were not compared\./);
  const doc = await ran(['env', 'diff', '--json'], env, h.dir);
  assert.equal(doc.code, 0, doc.stderr);
  const report = document(doc) as { ok: boolean; value: { profiles: unknown[]; record: { read: boolean; why: string } } };
  assert.equal(report.ok, true);
  assert.equal(report.value.profiles.length, 1);
  assert.deepEqual(report.value.record, { read: false, why: 'refused' });

  const inventory = await ran(['sync', 'inventory', '--json'], env, h.dir);
  assert.equal(inventory.code, 0, inventory.stderr);
  const inv = document(inventory) as { ok: boolean; value: { items: unknown[]; skills: { from: string } } };
  assert.equal(inv.ok, true);
  assert.deepEqual(inv.value.skills, { from: 'lock', why: 'refused' });

  const wrong = await ran(['env', 'diff', '--apply'], env, h.dir);
  assert.equal(wrong.code, 1);
  assert.equal(wrong.stdout, '');
  assert.match(wrong.stderr, /braindog env diff takes --config-dir/);
  const verb = await ran(['sync', 'everything'], env, h.dir);
  assert.equal(verb.code, 1);
  assert.match(verb.stderr, /braindog sync takes inventory/);
});
