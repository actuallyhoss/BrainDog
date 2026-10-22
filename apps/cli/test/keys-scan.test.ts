/**
 * `braindog keys scan`: every key lying in a repository's files, by name and file, never a value. Each test builds its
 * own invented repository under the test's temporary folder, with invented names and fresh fake values, and checks the
 * values appear nowhere in what the scan prints, says or answers. No real `.env`, `.dev.vars` or `.secrets` on this
 * machine is opened.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PROJECTS } from '../../../fixtures/names.ts';
import { hostKey, saveHosts } from '../src/http.ts';
import { keys, type KeysIo } from '../src/keys.ts';
import { ASK_MOST, FOLDER_LIMIT, askWords, findKeys, lyingAt } from '../src/keys-scan.ts';

const MAIN = fileURLToPath(new URL('../src/main.ts', import.meta.url));
const BASE = 'http://127.0.0.1:5998';
const LATER = '2099-01-01T00:00:00.000Z';

const fakeValue = (): string => ['fake-key-for-tests-only-', randomBytes(16).toString('hex')].join('');

/** An invented repository: a `.env`, a `.env.local`, a `.secrets` file and a `.pem`, and three places that are not keys. */
function repository(t: { after: (fn: () => void) => void }) {
  const top = mkdtempSync(join(tmpdir(), 'braindog-keys-scan-'));
  t.after(() => rmSync(top, { recursive: true, force: true }));
  const repo = join(top, PROJECTS[1].toLowerCase());
  const values = Array.from({ length: 7 }, fakeValue);
  mkdirSync(join(repo, 'apps', 'site'), { recursive: true });
  mkdirSync(join(repo, '.secrets'));
  mkdirSync(join(repo, 'node_modules', 'some-package'), { recursive: true });
  mkdirSync(join(repo, 'certs'));
  writeFileSync(join(repo, '.env'), `# invented\nQUIETCART_API_KEY=${values[0]!}\nOXBOW_WEBHOOK_SECRET="${values[1]!}"\n`);
  writeFileSync(join(repo, 'apps', 'site', '.env.local'), `BRIGHTWELL_TOKEN=${values[2]!}\n`);
  writeFileSync(join(repo, '.secrets', 'lanternfish-deploy'), `${values[3]!}\n`);
  writeFileSync(join(repo, 'certs', 'copperleaf.pem'), `-----BEGIN INVENTED TEST KEY-----\n${values[4]!}\n-----END INVENTED TEST KEY-----\n`);
  writeFileSync(join(repo, '.env.example'), `EXAMPLE_ONLY=${values[5]!}\n`);
  writeFileSync(join(repo, 'node_modules', 'some-package', '.env'), `VENDORED_KEY=${values[6]!}\n`);
  writeFileSync(join(repo, 'README.md'), 'An invented repository for a test.\n');
  return { top, repo, values };
}

/** An in-process `KeysIo` whose door is a stub that keeps every deposit, and whose terminal says yes. */
function io(cwd: string, file: string) {
  const said: string[] = [];
  const printed: string[] = [];
  const answered: unknown[] = [];
  const sent: Record<string, unknown>[] = [];
  const shape: KeysIo = {
    file,
    env: {},
    stdin: () => null,
    say: (line) => void said.push(line),
    out: (line) => void printed.push(line),
    answer: (a) => void answered.push(a),
    headers: async () => ({}),
    spawn: async () => 0,
    cwd,
    confirm: async () => true,
    fetch: (async (_input: string | URL | Request, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(JSON.stringify({ ok: true, value: { credential: `credentials#${String(sent.length)}`, version: 1, rotated: false } }), { status: 200 });
    }) as typeof globalThis.fetch,
  };
  return { io: shape, said, printed, answered, sent };
}

const nowhere = (texts: string[], values: string[]) => {
  for (const text of texts) for (const v of values) for (const piece of [v, v.slice(-12)]) assert.ok(!text.includes(piece), 'a value, or a part of one, was printed');
};

test('FINDS .env, .env.local, a .secrets file and a .pem, and skips .env.example and node_modules', (t) => {
  const { repo } = repository(t);
  const found = findKeys(repo);
  assert.deepEqual(
    found.keys.map((k) => k.name).sort(),
    ['BRIGHTWELL_TOKEN', 'OXBOW_WEBHOOK_SECRET', 'QUIETCART_API_KEY', 'copperleaf.pem', 'lanternfish-deploy'],
  );
  assert.ok(!found.keys.some((k) => k.name === 'EXAMPLE_ONLY' || k.name === 'VENDORED_KEY'));
  assert.equal(found.keys.find((k) => k.name === 'lanternfish-deploy')?.from, join(repo, '.secrets'), 'a .secrets file is sealed with its folder');
  assert.deepEqual(found.passed, []);
});

test('PRINTS NAMES AND PATHS AND NEVER A VALUE, with the command that seals each place, and sends nothing', async (t) => {
  const { top, repo, values } = repository(t);
  const run = io(top, join(top, 'hosts.json'));
  assert.equal(await keys(['scan', repo, '--project', PROJECTS[1]], run.io), 0, run.said.join('\n'));
  assert.equal(run.sent.length, 0);
  assert.ok(run.printed.includes('QUIETCART_API_KEY · .env'));
  assert.ok(run.printed.includes('BRIGHTWELL_TOKEN · apps/site/.env.local'));
  assert.ok(run.printed.includes('lanternfish-deploy · .secrets/lanternfish-deploy'));
  assert.ok(run.printed.includes('copperleaf.pem · certs/copperleaf.pem'));
  const repoName = PROJECTS[1].toLowerCase();
  assert.ok(run.printed.includes(`  braindog keys put --from ${repoName}/.secrets --project ${PROJECTS[1]}`), run.printed.join('\n'));
  assert.ok(run.printed.includes(`  braindog keys put --from ${repoName}/.env --project ${PROJECTS[1]}`));
  assert.ok(run.said.includes('5 keys lie in 4 files. These seal them, asking you about each key first:'));
  nowhere([...run.printed, ...run.said, JSON.stringify(run.answered)], values);
});

test('--deposit RUNS put --from FOR EACH PLACE, and the door is called once a key', async (t) => {
  const { top, repo, values } = repository(t);
  const file = join(top, 'hosts.json');
  saveHosts(file, { default: hostKey(BASE), hosts: { [hostKey(BASE)]: { token: { value: `stub-login-${randomBytes(8).toString('hex')}`, expires: LATER, label: 'studio-desktop' } } } });
  const run = io(repo, file);
  assert.equal(await keys(['scan', '--deposit'], run.io), 0, run.said.join('\n'));
  assert.deepEqual(run.sent.map((s) => s.label).sort(), ['BRIGHTWELL_TOKEN', 'OXBOW_WEBHOOK_SECRET', 'QUIETCART_API_KEY', 'copperleaf.pem', 'lanternfish-deploy']);
  assert.equal(run.sent.find((s) => s.label === 'OXBOW_WEBHOOK_SECRET')?.value, values[1], 'the quotes are off what is sealed');
  assert.ok(run.said.includes('Every key in .secrets is sealed. The folder is yours to delete.'));
  assert.equal(run.answered.length, 1, 'the scan answers once, and the put --from it runs does not');
  nowhere([...run.printed, ...run.said, JSON.stringify(run.answered)], values);
});

test('--deposit STILL ASKS ABOUT EACH KEY: a no is not sent, and with no terminal nothing is', async (t) => {
  const { top, repo, values } = repository(t);
  const file = join(top, 'hosts.json');
  saveHosts(file, { default: hostKey(BASE), hosts: { [hostKey(BASE)]: { token: { value: `stub-login-${randomBytes(8).toString('hex')}`, expires: LATER, label: 'studio-desktop' } } } });

  const asked: string[] = [];
  const picky = io(repo, file);
  picky.io.confirm = async (question) => {
    asked.push(question);
    return !question.includes('QUIETCART_API_KEY');
  };
  await keys(['scan', '--deposit'], picky.io);
  assert.equal(asked.length, 5, 'one question a key');
  assert.deepEqual(picky.sent.map((s) => s.label).sort(), ['BRIGHTWELL_TOKEN', 'OXBOW_WEBHOOK_SECRET', 'copperleaf.pem', 'lanternfish-deploy']);

  const away = io(repo, file);
  away.io.confirm = undefined;
  assert.equal(await keys(['scan', '--deposit'], away.io), 1);
  assert.equal(away.sent.length, 0, 'no terminal, nothing sent');
  nowhere([...picky.printed, ...picky.said, ...asked, ...away.printed, ...away.said], values);
});

test('A FOLDER OVER 5,000 FILES DEEP IS PASSED OVER and named, and the folder around it is still read', (t) => {
  const { repo } = repository(t);
  const big = join(repo, 'generated', 'inner');
  mkdirSync(join(big, 'deeper'), { recursive: true });
  for (let i = 0; i < FOLDER_LIMIT; i++) writeFileSync(join(big, 'deeper', `f${String(i)}`), '');
  /* 5,000 below `deeper` is not over; one more beside it puts `inner` over, and `deeper` is said as part of it. */
  writeFileSync(join(big, '.env'), 'PASSED_BY_SIZE=x\n');
  writeFileSync(join(repo, 'generated', '.env'), 'BESIDE_IT=x\n');
  const found = findKeys(repo);
  assert.deepEqual(found.passed, [big]);
  assert.ok(!found.keys.some((k) => k.name === 'PASSED_BY_SIZE'));
  assert.ok(found.keys.some((k) => k.name === 'BESIDE_IT'));
});

test('AS A PROCESS: the scan prints names and paths on stdout, and nothing of a value anywhere', async (t) => {
  const { top, repo, values } = repository(t);
  const env: Record<string, string | undefined> = { ...process.env, XDG_CONFIG_HOME: top, APPDATA: top };
  delete env.BRAINDOG_TOKEN;
  delete env.BRAINDOG_HOST;
  const child = spawn(process.execPath, [MAIN, 'keys', 'scan'], { env, cwd: repo, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')));
  child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
  child.stdin.end('');
  const code = await new Promise<number | null>((done) => child.on('close', done));
  assert.equal(code, 0, stderr);
  assert.match(stdout, /QUIETCART_API_KEY · \.env/);
  assert.match(stdout, /braindog keys put --from \.secrets --project copperleaf/);
  nowhere([stdout, stderr], values);
});

/* ── --ask: one question on Decide, only when asked ───────────────────────── */

const COPPERLEAF = '01JTHINGCOPPERLEAFCOPPERLE';
const OTHER = '01JTHINGLANTERNFISHLANTERN';

/**
 * A host keeping Keys and the projects it scopes to, answering `schema`, `list` and `propose` as the record does, with
 * `held` the keys it already keeps. Every request is kept whole, its address and its body, so a test can look for a
 * value in everything sent.
 */
async function keysHost(t: { after: (fn: () => Promise<void>) => void }, held: Record<string, unknown>[] = [], filed: Record<string, unknown> = { id: '01JQUESTIONQUESTIONQUESTIO' }) {
  const seen: { method: string; verb: string | undefined; url: string; body: string }[] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c: Buffer) => (body += c.toString('utf8')));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://stub');
      const method = url.pathname.replace(/^\/api\//, '');
      const register = url.searchParams.get('register');
      seen.push({ method, verb: req.method, url: req.url ?? '', body });
      let value: unknown;
      if (method === 'schema')
        value =
          register === 'credentials'
            ? { id: 'credentials', name: 'Keys', title: 'label', state: 'state', done: ['retired'], fields: [{ id: 'label', type: 'text' }, { id: 'project', type: 'ref', to: 'things', scope: { widen: 'person' } }, { id: 'value', type: 'secret' }] }
            : { id: 'things', title: 'name', fields: [{ id: 'name', type: 'text' }] };
      if (method === 'list') value = { rows: register === 'credentials' ? held : [{ id: COPPERLEAF, seq: 1, fields: { name: PROJECTS[1] } }, { id: OTHER, seq: 2, fields: { name: PROJECTS[0] } }], cursor: null };
      if (method === 'propose') value = filed;
      res.writeHead(value === undefined ? 404 : 200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(value === undefined ? { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: `There is no method called ${method}.` } } : { ok: true, value }));
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
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, seen, proposed: () => seen.filter((s) => s.method === 'propose').map((s) => JSON.parse(s.body) as { question: string; body_kind: string; body: { register: string; rows: Record<string, unknown>[] }; cause?: string }) };
}

/** `io` pointed at a host by the environment, with the record's slug, so a filed question has a link. */
function asking(cwd: string, base: string) {
  const run = io(cwd, join(cwd, 'hosts.json'));
  run.io.env = { BRAINDOG_HOST: `${base}/app/${PROJECTS[1].toLowerCase()}`, BRAINDOG_TOKEN: 'rec_01TESTTESTTESTTESTTESTTEST.keys' };
  return run;
}

test('--ask FILES ONE QUESTION WITH A ROW A KEY: name, kind, what it opens, where it lies, its project, and never a value', async (t) => {
  const { top, repo, values } = repository(t);
  const h = await keysHost(t);
  const run = asking(top, h.base);
  assert.equal(await keys(['scan', repo, '--ask'], run.io), 0, run.said.join('\n'));
  const [asked, ...more] = h.proposed();
  assert.ok(asked !== undefined && more.length === 0, 'one question, and one only');
  assert.equal(asked.question, 'Add these 5 keys to Keys? They are kept in files on this machine.');
  assert.equal(asked.body_kind, 'rowset');
  assert.equal(asked.body.register, 'credentials');
  /* THE PROJECT IS THE FOLDER'S, read as the row of the project of that name. */
  const repoName = PROJECTS[1].toLowerCase();
  assert.deepEqual(
    asked.body.rows.sort((a, b) => (String(a.label) < String(b.label) ? -1 : 1)),
    [
      { label: 'BRIGHTWELL_TOKEN', opens: 'brightwell token', kind: 'api_token', where: 'site/.env.local', project: COPPERLEAF },
      { label: 'OXBOW_WEBHOOK_SECRET', opens: 'oxbow webhook secret', kind: 'api_token', where: `${repoName}/.env`, project: COPPERLEAF },
      { label: 'QUIETCART_API_KEY', opens: 'quietcart api key', kind: 'api_token', where: `${repoName}/.env`, project: COPPERLEAF },
      { label: 'copperleaf.pem', opens: 'copperleaf pem', kind: 'ssh_key', where: 'certs/copperleaf.pem', project: COPPERLEAF },
      { label: 'lanternfish-deploy', opens: 'lanternfish deploy', kind: 'api_token', where: '.secrets/lanternfish-deploy', project: COPPERLEAF },
    ],
  );
  assert.ok(run.printed.includes('Asked on Decide: Add these 5 keys to Keys? They are kept in files on this machine.'), run.printed.join('\n'));
  assert.ok(run.printed.includes(`  ${h.base}/app/${repoName}/decide/01JQUESTIONQUESTIONQUESTIO`));
  /* SIGNED BY THE LOGIN AND NAMING NO RUN, and the planted values nowhere: not printed, said, answered or sent. */
  nowhere([...run.printed, ...run.said, JSON.stringify(run.answered), ...h.seen.map((s) => `${s.url} ${s.body}`)], values);
  assert.equal(run.answered.length, 1, 'one answer, after the question');
});

test('--ask LEAVES OUT A NAME KEYS ALREADY HOLDS, here or everywhere, and asks nothing when it holds them all', async (t) => {
  const { top, repo, values } = repository(t);
  const held = [
    { id: '01JKEYROW00000000000000001', seq: 1, fields: { label: 'quietcart_api_key', project: COPPERLEAF, state: 'live' } },
    { id: '01JKEYROW00000000000000002', seq: 2, fields: { label: 'lanternfish-deploy', state: 'live' } },
    /* Held for another project, or retired: the name is not held here, so it is asked. */
    { id: '01JKEYROW00000000000000003', seq: 3, fields: { label: 'BRIGHTWELL_TOKEN', project: OTHER, state: 'live' } },
    { id: '01JKEYROW00000000000000004', seq: 4, fields: { label: 'OXBOW_WEBHOOK_SECRET', project: COPPERLEAF, state: 'retired' } },
  ];
  const h = await keysHost(t, held);
  const run = asking(top, h.base);
  assert.equal(await keys(['scan', repo, '--ask'], run.io), 0, run.said.join('\n'));
  const [asked] = h.proposed();
  assert.deepEqual(asked?.body.rows.map((r) => r.label).sort(), ['BRIGHTWELL_TOKEN', 'OXBOW_WEBHOOK_SECRET', 'copperleaf.pem']);
  assert.equal(asked?.question, 'Add these 3 keys to Keys? They are kept in files on this machine.');
  assert.ok(run.said.includes('2 of the names found are in Keys already, so they were left out.'), run.said.join('\n'));

  const all = ['BRIGHTWELL_TOKEN', 'OXBOW_WEBHOOK_SECRET', 'QUIETCART_API_KEY', 'copperleaf.pem', 'lanternfish-deploy'].map((label, i) => ({ id: `01JKEYROW0000000000000001${String(i)}`, seq: 10 + i, fields: { label, state: 'live' } }));
  const full = await keysHost(t, all);
  const again = asking(top, full.base);
  assert.equal(await keys(['scan', repo, '--ask'], again.io), 0);
  assert.equal(full.proposed().length, 0, 'nothing to add, nothing asked');
  assert.ok(again.said.includes('Every key found here is in Keys already, so nothing was asked.'));
  nowhere([...run.printed, ...run.said, ...again.said, ...h.seen.map((s) => s.body)], values);
});

test('NOTHING IS FILED WITHOUT --ask: a bare scan sends no request, and --ask with --deposit is refused before any is sent', async (t) => {
  const { top, repo } = repository(t);
  const h = await keysHost(t);
  const bare = asking(top, h.base);
  assert.equal(await keys(['scan', repo], bare.io), 0);
  assert.equal(h.seen.length, 0, 'a bare scan reads the files and sends nothing');
  assert.ok(!bare.printed.some((l) => l.includes('Decide')));

  const both = asking(top, h.base);
  assert.equal(await keys(['scan', repo, '--ask', '--deposit'], both.io), 1);
  assert.match(both.said[0]!, /^braindog keys scan takes/u);
  assert.equal(h.seen.length, 0);
});

test('--project NAMING NONE OF HIS ASKS NOTHING and is not said back; a folder naming none asks for everywhere, and says so', async (t) => {
  const { top, repo, values } = repository(t);
  const h = await keysHost(t);
  const typed = asking(top, h.base);
  assert.equal(await keys(['scan', repo, '--ask', '--project', 'Nowhere Studio'], typed.io), 1);
  assert.equal(h.proposed().length, 0);
  assert.ok(typed.said.includes('No project of yours has that name, so nothing was asked.'));
  assert.ok(!typed.said.some((l) => l.includes('Nowhere Studio')));

  /* A folder no project is called: the rows carry no project, and the line says where they would apply. */
  const loose = join(top, 'scratchpad-folder');
  mkdirSync(loose);
  writeFileSync(join(loose, '.env'), `QUILL_TOKEN=${values[0]!}\n`);
  const run = asking(top, h.base);
  assert.equal(await keys(['scan', loose, '--ask'], run.io), 0, run.said.join('\n'));
  const [asked] = h.proposed();
  assert.deepEqual(asked?.body.rows, [{ label: 'QUILL_TOKEN', opens: 'quill token', kind: 'api_token', where: 'scratchpad-folder/.env' }]);
  assert.equal(asked?.question, 'Add this key to Keys? It is kept in a file on this machine.');
  assert.ok(run.said.includes('No project of yours is called scratchpad-folder, so this key would apply everywhere. Name one with --project.'));
  nowhere([...run.printed, ...run.said, ...h.seen.map((s) => s.body)], values);
});

test('THE WORDS AND THE PLACE: a question in the singular and the plural, and where a key lies as its folder and name', () => {
  assert.equal(askWords(1, 'Keys'), 'Add this key to Keys? It is kept in a file on this machine.');
  assert.equal(askWords(12, 'Keys'), 'Add these 12 keys to Keys? They are kept in files on this machine.');
  assert.equal(lyingAt(join('/somewhere', 'deep', PROJECTS[1].toLowerCase(), '.env')), `${PROJECTS[1].toLowerCase()}/.env`);
  assert.equal(ASK_MOST, 200);
});
