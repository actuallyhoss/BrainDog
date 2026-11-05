/**
 * The holes a security pass over the command found, each proved by doing it first, and held shut here.
 *
 * EVERY FOLDER IS A TEMPORARY ONE and every host is a stub on this machine: nothing here reads this machine's hosts
 * file, profiles or keys, and every value is planted.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { saveHosts } from '../src/http.ts';
import { hookCommand } from '../src/install.ts';
import { page } from '../src/page.ts';
import type { AgentIo } from '../src/skills.ts';
import { statusLineEntry, STATUSLINE_FILE } from '../src/statusline-place.ts';
import { update, type UpdateIo } from '../src/update.ts';
import { usecase } from '../src/usecase.ts';

const MAIN = fileURLToPath(new URL('../src/main.ts', import.meta.url));
const TOKEN = ['rec_01TESTTESTTESTTESTTESTTEST', 'stub-bearer-for-tests-only-77aa'].join('.');
type After = { after: (fn: () => void | Promise<void>) => void };

const scratch = (t: After): string => {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-sec-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};

/** A stub record answering each method from `answers`; a method it does not hold is the record's own refusal. */
async function stub(t: After, answers: Record<string, unknown>): Promise<string> {
  const server = createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      const method = new URL(req.url ?? '/', 'http://stub').pathname.replace(/^\/(?:api\/)?/, '');
      res.writeHead(200, { 'content-type': 'application/json' });
      const known = Object.hasOwn(answers, method);
      res.end(JSON.stringify(known ? answers[method] : { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: `No ${method}.` } }));
    });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise<void>((done) => server.close(() => done())));
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
}

const CONTEXT = { ok: true, value: { session: { spoken: 'S7', state: 'active' }, ambiguous: [], handoff: null, live: { same_repo: [], elsewhere: [] }, waiting: [], people: [], faded: 0, project: null, registers: [], next: 'Start.' } };

function agentIo(dir: string, host: string) {
  const out: string[] = [];
  const said: string[] = [];
  const cwd = join(dir, 'a', 'b');
  mkdirSync(cwd, { recursive: true });
  const io: AgentIo = { env: { XDG_CONFIG_HOME: join(dir, 'config'), BRAINDOG_HOST: host, BRAINDOG_TOKEN: TOKEN }, cwd, home: dir, out: (l) => void out.push(l), say: (l) => void said.push(l), headers: async () => ({}) };
  return { io, out, said, cwd };
}

/* ── a name the host chose is a file name, and only that ─────────────────── */

test('usecase export: a file name the host answers cannot leave the folder, by .. or by a whole path', async (t) => {
  for (const name of ['../../escaped.usecase.json', '/PLACE/escaped.usecase.json', '.bashrc', 'a/b.usecase.json', '..\\..\\escaped.usecase.json']) {
    const dir = scratch(t);
    const file = name.replace('/PLACE', dir);
    const host = await stub(t, { context: CONTEXT, exportUseCase: { ok: true, value: { file, doc: { planted: true }, bytes: 16 } } });
    const h = agentIo(dir, host);
    assert.equal(await usecase(['export'], h.io), 1, name);
    assert.equal(existsSync(join(dir, 'escaped.usecase.json')), false, name);
    assert.equal(existsSync(join(h.cwd, '.bashrc')), false, name);
    assert.match(h.said.join('\n'), /file name/u, name);
  }
});

test('page pull: a page name the host answers cannot leave the folder', async (t) => {
  for (const name of ['../../escaped', '/PLACE/escaped', 'a/b', '..\\escaped']) {
    const dir = scratch(t);
    const body = { page: name.replace('/PLACE', dir), title: 'Planted', blocks: [] };
    const host = await stub(t, { context: CONTEXT, arrangement: { ok: true, value: { id: 'page.planted', version: 1, pack: null, body } } });
    const h = agentIo(dir, host);
    assert.equal(await page(['pull', 'planted'], h.io), 1, name);
    assert.equal(existsSync(join(dir, 'escaped.dog')), false, name);
    assert.match(h.said.join('\n'), /file name/u, name);
  }
});

/* ── a path in a hook's command line is one word, whatever it holds ──────── */

test('the hook and the status line name a folder with $(), backticks and quotes as one word, and nothing in it runs', { skip: process.platform === 'win32' }, (t) => {
  const dir = scratch(t);
  for (const name of ['with space', 'dollar$(touch ran-1)', 'tick`touch ran-2`', 'quote"; touch ran-3; "', "single'; touch ran-4; '"]) {
    const scripts = join(dir, name);
    mkdirSync(scripts);
    const mark = join(dir, 'reached');
    rmSync(mark, { force: true });
    writeFileSync(join(scripts, 'braindog-hook.sh'), `printf '%s' "$1" > ${JSON.stringify(mark)}\n`);
    execSync(hookCommand('start', scripts), { cwd: dir, shell: '/bin/sh', stdio: 'ignore' });
    assert.equal(readFileSync(mark, 'utf8'), 'start', name);

    rmSync(mark, { force: true });
    writeFileSync(join(scripts, STATUSLINE_FILE), `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(mark)}, 'drawn');\n`);
    execSync(statusLineEntry(scripts).command, { cwd: dir, shell: '/bin/sh', stdio: 'ignore' });
    assert.equal(readFileSync(mark, 'utf8'), 'drawn', name);
  }
  for (const n of [1, 2, 3, 4]) assert.equal(existsSync(join(dir, `ran-${String(n)}`)), false, `the folder's name ran as a command (${String(n)})`);
});

test('a plain folder keeps the line every machine already pinned', () => {
  assert.equal(hookCommand('start', '/opt/brain dog/hooks', 'linux'), 'sh "/opt/brain dog/hooks/braindog-hook.sh" start');
});

/* ── the update reads https and stays on it ──────────────────────────────── */

const BUILT = '2026.10.09+5a57ba2';
const updateIo = (dir: string, get: typeof fetch) => {
  const file = join(dir, 'braindog.mjs');
  writeFileSync(file, '// the installed command\n');
  const out: string[] = [];
  const err: string[] = [];
  const io: UpdateIo = { file, build: '2026.10.01+4e712da', env: {}, out: (l) => void out.push(l), err: (l) => void err.push(l), home: dir, base: 'https://site.example/cli', fetch: get, place: () => ({ count: 0, failed: null }) };
  return { io, out, err, file };
};

test('update: a move from https to http is refused before that address is asked anything, and the command stays', async (t) => {
  const dir = scratch(t);
  const asked: string[] = [];
  const get = (async (url: string | URL, init?: RequestInit) => {
    asked.push(String(url));
    assert.equal(init?.redirect, 'manual', 'fetch was left to follow a move by itself');
    return new Response(null, { status: 302, headers: { location: 'http://insecure.example/braindog.mjs.build' } });
  }) as typeof fetch;
  const u = updateIo(dir, get);
  assert.equal(await update([], u.io), 1);
  assert.deepEqual(asked, ['https://site.example/cli/braindog.mjs.build']);
  assert.match(u.err.join('\n'), /not https/u);
  assert.equal(readFileSync(u.file, 'utf8'), '// the installed command\n');
});

test('update: a move inside https is followed, at most five times', async (t) => {
  const dir = scratch(t);
  let n = 0;
  const get = (async () => {
    n++;
    return new Response(null, { status: 301, headers: { location: `https://mirror.example/${String(n)}` } });
  }) as unknown as typeof fetch;
  const u = updateIo(dir, get);
  assert.equal(await update(['--check'], u.io), 1);
  assert.equal(n, 6);
  const good = updateIo(dir, (async (url: string | URL) => (String(url).includes('mirror') ? new Response(BUILT) : new Response(null, { status: 302, headers: { location: 'https://mirror.example/b' } }))) as typeof fetch);
  assert.equal(await update(['--check'], good.io), 0);
  assert.match(good.out.join('\n'), /is out/u);
});

/* ── a terminal obeys what it is handed ──────────────────────────────────── */

test("a host's refusal reaches the terminal without its control characters", async (t) => {
  const dir = scratch(t);
  const trick = '\u001b[2K\rApproved. \u001b]0;title\u0007‮no';
  const refused = { ok: false, refusal: { code: 'FORBIDDEN', fix: trick } };
  const host = await stub(t, { context: refused, whoami: refused, boot: refused, attach: refused, 'auth/device': refused });
  const env = { PATH: process.env.PATH, HOME: dir, XDG_CONFIG_HOME: join(dir, 'config'), BRAINDOG_HOST: host, BRAINDOG_TOKEN: TOKEN };
  for (const args of [['context'], ['login', host]]) {
    /* NOT `spawnSync`: the stub answers from this process, which must keep running while the command waits on it. */
    const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', MAIN, ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let all = '';
    child.stdout.on('data', (c: Buffer) => (all += c.toString('utf8')));
    child.stderr.on('data', (c: Buffer) => (all += c.toString('utf8')));
    await new Promise((done) => child.on('close', done));
    assert.match(all, /Approved\./u, args.join(' '));
    assert.doesNotMatch(all, /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e]/u, args.join(' '));
  }
});

/* ── the hosts file ───────────────────────────────────────────────────────── */

const HOSTS = { hosts: { 'https://app.example/kiln': { token: { value: TOKEN, expires: '2099-01-01T00:00:00Z', label: 'x' } } } };

test('the hosts file is written through no link planted at its scratch name, and its folder closes to 0700', { skip: process.platform === 'win32' }, (t) => {
  const dir = scratch(t);
  const folder = join(dir, 'braindog');
  mkdirSync(folder, { mode: 0o755 });
  chmodSync(folder, 0o755);
  const file = join(folder, 'hosts.json');
  const elsewhere = join(dir, 'elsewhere');
  writeFileSync(elsewhere, 'theirs\n', { mode: 0o644 });
  symlinkSync(elsewhere, `${file}.tmp`);
  saveHosts(file, HOSTS);
  assert.equal(readFileSync(elsewhere, 'utf8'), 'theirs\n', 'the tokens went through the link');
  assert.equal(statSync(elsewhere).mode & 0o777, 0o644);
  assert.equal(lstatSync(file).isSymbolicLink(), false);
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.equal(statSync(folder).mode & 0o777, 0o700);
});
