/**
 * `braindog tools scan` and `braindog tools write` against a stub record on node:http and a fake `claude`.
 *
 * THE VALUES ARE OBVIOUSLY FAKE, made per run, and long enough that any fragment in an output is findable. The one
 * place a value may appear is the body of a deposit to `/api/vault/deposit`; every other request, line, lock file and
 * `claude` argument is checked for it. Every folder is a temporary one, so this machine's own `~/.claude.json` is
 * never read.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { hostKey, hostsPath, saveHosts } from '../src/http.ts';
import { connect, type AgentIo } from '../src/skills.ts';
import { depositor, looksLikeKey, renderEntry, scanTools, tools, writeTools, type ClaudeRunner } from '../src/tools.ts';

const TOKEN = ['rec_01TESTTESTTESTTESTTESTTEST', 'stub-bearer-for-tests-only-7b3c'].join('.');
const SCOPE = '01JZ8QK3F7R2M9V4XN6TCB5HAE';
const LATER = '2099-01-01T00:00:00.000Z';
const NOW = Date.parse('2026-09-15T12:00:00.000Z');
const CLI = '/fake/braindog/apps/cli/src/main.ts';

const fakeValue = (): string => ['fake-token-for-tests-only', randomBytes(16).toString('hex')].join('-');
const fakeGrant = (): string => ['rec_01TESTTESTTESTTESTTESTTEST', `stub-vault-grant-${randomBytes(12).toString('hex')}`].join('.');
/** Shaped like an issuer's key, so it is found by its shape and not its name. */
const keyShaped = (): string => ['sk', 'proj', `FakeTestsOnly${randomBytes(12).toString('hex')}`].join('-');

type After = { after: (fn: () => void | Promise<void>) => void };
type Row = { seq: number; scope: 'project' | 'global'; state: string; version: number; fields: Record<string, unknown> };
type Seen = { method: string; args: Record<string, unknown>; authorization: string | undefined };

const CONTEXT = { session: { spoken: 'S7', state: 'active' }, ambiguous: [], handoff: null, live: { same_repo: [], elsewhere: [] }, waiting: [], people: [], faded: 0, next: 'Go on.' };
const PROJECT = { spoken: 'things#1', name: 'Kiln', mark: null, hue: null, how: 'folder' };

/** A record with a tools register and a vault door. */
async function stubRecord(t: After, o: { project?: boolean; register?: boolean }) {
  const rows: Row[] = [];
  const seen: Seen[] = [];
  let proposals = 0;
  let credentials = 0;
  const brief = (r: Row) => ({ spoken: `tools#${String(r.seq)}`, version: r.version, scope: r.scope, state: r.state, name: r.fields.name, kind: r.fields.kind, project: null });
  const entry = (r: Row) => ({ id: `e_${String(r.seq)}`, register: 'tools', seq: r.seq, state: r.state, version: r.version, fields: r.fields });
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
      if (method === 'context')
        return answer({
          ok: true,
          value: {
            ...CONTEXT,
            project: o.project ? PROJECT : null,
            registers: o.register === false ? [] : [{ id: 'tools', name: 'Tools', rows: rows.filter((r) => r.state === 'active').map(brief), inherited: [], truncated: false }],
          },
        });
      if (method === 'get') {
        const r = rows.find((x) => x.seq === args.seq);
        return answer(r ? { ok: true, value: entry(r) } : { ok: false, refusal: { code: 'REF_UNKNOWN', fix: 'There is no such row.' } });
      }
      if (method === 'create') {
        const r: Row = { seq: rows.length + 1, scope: o.project ? 'project' : 'global', state: 'active', version: 1, fields: args.fields as Record<string, unknown> };
        rows.push(r);
        return answer({ ok: true, value: entry(r) });
      }
      if (method === 'update') {
        const r = rows.find((x) => x.seq === args.seq);
        if (!r) return answer({ ok: false, refusal: { code: 'REF_UNKNOWN', fix: 'There is no such row.' } });
        Object.assign(r.fields, args.patch);
        r.version++;
        return answer({ ok: true, value: entry(r) });
      }
      if (method === 'propose') return answer({ ok: true, value: { id: `SG${String(++proposals)}` } });
      if (method === 'vault/deposit') return answer({ ok: true, value: { credential: `credentials#${String(++credentials)}`, label: args.label, version: 1, rotated: false } });
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
  const add = (fields: Record<string, unknown>, scope: Row['scope'] = 'global') => {
    const r: Row = { seq: rows.length + 1, scope, state: 'active', version: 1, fields: { kind: 'mcp', ...fields } };
    rows.push(r);
    return r;
  };
  const of = (method: string) => seen.filter((s) => s.method === method);
  return { base: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`, rows, seen, add, of };
}

type Call = { args: string[]; cwd: string };

/* `login: false` IS A MACHINE HOLDING NO LOGIN AT ALL, since `keys put` deposits with the login when there is no vault
   grant (`loop/finish/agents.md` C1), so the name-only path is now the one with neither. The stub reads no bearer. */
async function setup(t: After, o: { project?: boolean; grant?: boolean; register?: boolean; login?: boolean } = {}) {
  const host = await stubRecord(t, o);
  const dir = mkdtempSync(join(tmpdir(), 'braindog-tools-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const home = join(dir, 'home');
  const top = join(dir, 'repo');
  for (const d of [home, top]) mkdirSync(d, { recursive: true });
  const env: Record<string, string> = { XDG_CONFIG_HOME: join(dir, 'config'), BRAINDOG_HOST: host.base, ...(o.login === false ? {} : { BRAINDOG_TOKEN: TOKEN }) };
  const grant = fakeGrant();
  if (o.grant) saveHosts(hostsPath(env), { default: hostKey(host.base), hosts: { [hostKey(host.base)]: { vault: { [SCOPE]: { value: grant, expires: LATER } } } } });
  const out: string[] = [];
  const said: string[] = [];
  const io: AgentIo = { env, cwd: top, home, out: (l) => void out.push(l), say: (l) => void said.push(l), headers: async () => ({}) };
  const lines: string[] = [];
  const at = async () => {
    const got = await connect(undefined, io);
    if (typeof got === 'number') throw new Error(`connect ended with ${String(got)}`);
    return got;
  };
  const scan = async (s: { dryRun?: boolean; once?: boolean } = {}) => {
    const c = await at();
    const said = await scanTools({
      client: c.client,
      context: c.context,
      top,
      cwd: top,
      home,
      dryRun: s.dryRun === true,
      deposit: depositor({ file: hostsPath(env), env, host: c.to.key, headers: {} }),
      machine: 'test-machine',
      now: () => NOW,
      ...(s.once === true ? { once: { host: c.to.key, hosts: hostsPath(env) } } : {}),
    });
    lines.push(...said);
    return said;
  };
  const calls: Call[] = [];
  let code = 0;
  const claude: ClaudeRunner = async (args, cwd) => {
    calls.push({ args, cwd });
    return code;
  };
  const write = async (s: { scope?: 'user' | 'project'; dryRun?: boolean } = {}) => {
    const c = await at();
    const said = await writeTools({ client: c.client, context: c.context, top, cwd: top, home, scope: s.scope ?? null, dryRun: s.dryRun === true, cli: CLI, claude });
    lines.push(...said);
    return said;
  };
  const mcp = (servers: Record<string, unknown>) => writeFileSync(join(top, '.mcp.json'), JSON.stringify({ mcpServers: servers }, null, 2));
  const claudeJson = join(home, '.claude.json');
  const lockFile = join(home, '.braindog', 'tools-lock.json');
  return {
    ...host,
    dir,
    home,
    top,
    env,
    io,
    out,
    said,
    grant,
    lines,
    scan,
    write,
    calls,
    setCode: (c: number) => void (code = c),
    mcp,
    claudeJson,
    lockFile,
  };
}

/** Nothing but a deposit's body holds a value. */
function nowhere(h: Awaited<ReturnType<typeof setup>>, values: string[]) {
  const outside = [
    ...h.lines,
    ...h.out,
    ...h.said,
    ...h.seen.filter((s) => s.method !== 'vault/deposit').map((s) => JSON.stringify(s.args)),
    ...h.calls.map((c) => c.args.join(' ')),
    existsSync(h.lockFile) ? readFileSync(h.lockFile, 'utf8') : '',
  ].join('\n');
  for (const value of [...values, h.grant, 'stub-bearer-for-tests-only']) assert.equal(outside.includes(value), false, 'a value reached an output, a request or the lock');
}

/* ── scan ──────────────────────────────────────────────────────────────── */

test('SCAN WITH A VAULT GRANT: a key-named env value and a secret header are deposited, and the row keeps NAME=credentials#N', async (t) => {
  const h = await setup(t, { project: true, grant: true });
  const token = fakeValue();
  const auth = fakeValue();
  h.mcp({
    'kiln-deploy': { command: 'npx', args: ['-y', 'kiln-mcp'], env: { KILN_API_TOKEN: token, KILN_REGION: 'eu-west', KILN_HOME: '${HOME}/kiln' } },
    docs: { type: 'http', url: 'https://docs.example/mcp', headers: { Authorization: `Bearer ${auth}` } },
  });

  assert.deepEqual(await h.scan(), ['Tool kiln-deploy in .mcp.json was recorded as tools#1, with 1 key deposited.', 'Tool docs in .mcp.json was recorded as tools#2, with 1 key deposited.']);

  const deposits = h.of('vault/deposit');
  assert.deepEqual(
    deposits.map((d) => d.args),
    [
      { label: 'kiln-deploy KILN_API_TOKEN', opens: 'The KILN_API_TOKEN the kiln-deploy MCP server reads', kind: 'api_token', value: token },
      { label: 'docs Authorization', opens: 'The Authorization header the docs MCP server reads', kind: 'api_token', value: `Bearer ${auth}` },
    ],
  );
  assert.ok(deposits.every((d) => d.authorization === `Bearer ${h.grant}`));

  assert.deepEqual(h.of('create').map((c) => c.args), [
    {
      register: 'tools',
      fields: {
        name: 'kiln-deploy',
        kind: 'mcp',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', 'kiln-mcp'],
        needs: ['KILN_API_TOKEN=credentials#1', 'KILN_REGION', 'KILN_HOME'],
        hosts: ['test-machine'],
        seen: new Date(NOW).toISOString(),
        origin: '.mcp.json on test-machine',
      },
    },
    {
      register: 'tools',
      fields: {
        name: 'docs',
        kind: 'mcp',
        transport: 'http',
        endpoint: 'https://docs.example/mcp',
        needs: ['header:Authorization=credentials#1'.replace('#1', '#2')],
        hosts: ['test-machine'],
        seen: new Date(NOW).toISOString(),
        origin: '.mcp.json on test-machine',
      },
    },
  ]);
  assert.ok(existsSync(h.lockFile));
  nowhere(h, [token, auth]);
});

test('SCAN WITH NEITHER A VAULT GRANT NOR A LOGIN: the keys are recorded by name only, nothing is deposited, and one sentence says why', async (t) => {
  const h = await setup(t, { project: true, login: false });
  const token = fakeValue();
  const auth = fakeValue();
  h.mcp({
    'kiln-deploy': { command: 'npx', args: ['-y', 'kiln-mcp'], env: { KILN_API_TOKEN: token, KILN_REGION: 'eu-west' } },
    docs: { type: 'http', url: 'https://docs.example/mcp', headers: { Authorization: `Bearer ${auth}` } },
  });

  assert.deepEqual(await h.scan(), [
    'Tool kiln-deploy in .mcp.json was recorded as tools#1.',
    'Tool docs in .mcp.json was recorded as tools#2.',
    '2 keys were recorded by name only, because this machine holds no vault grant it could deposit with, and the values were not kept. Run braindog login <host> --vault <project>, then scan again.',
  ]);
  assert.deepEqual(h.of('vault/deposit'), []);
  assert.deepEqual(h.rows.map((r) => r.fields.needs), [['KILN_API_TOKEN', 'KILN_REGION'], ['header:Authorization']]);
  nowhere(h, [token, auth]);
});

test('THE NO-GRANT SENTENCE IS SAID ONCE PER HOST, forgotten once a vault grant is kept, and said once again when there is none', async (t) => {
  const h = await setup(t, { project: true, login: false });
  const token = fakeValue();
  const auth = fakeValue();
  const key = hostKey(h.base);
  const state = join(h.home, '.braindog', 'tools-said.json');
  const noGrant = '1 key was recorded by name only, because this machine holds no vault grant it could deposit with, and the values were not kept. Run braindog login <host> --vault <project>, then scan again.';
  const deploy = { command: 'npx', env: { KILN_API_TOKEN: token } };
  h.mcp({ 'kiln-deploy': deploy });

  assert.deepEqual(await h.scan({ once: true }), ['Tool kiln-deploy in .mcp.json was recorded as tools#1.', noGrant]);
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(state, 'utf8')) as object), [key]);
  assert.deepEqual(await h.scan({ once: true }), [], 'the second start hook says nothing');
  assert.deepEqual(await h.scan({ once: true }), []);
  /* Typed by hand, the scan is not told to be quiet, so it says it every time. */
  assert.deepEqual(await h.scan(), [noGrant]);

  saveHosts(hostsPath(h.env), { default: key, hosts: { [key]: { vault: { [SCOPE]: { value: h.grant, expires: LATER } } } } });
  assert.deepEqual(await h.scan({ once: true }), ['Tool kiln-deploy is recorded as tools#1, with 1 key deposited.']);
  assert.deepEqual(JSON.parse(readFileSync(state, 'utf8')), {}, 'a kept grant forgets that it was said');

  saveHosts(hostsPath(h.env), { default: key, hosts: { [key]: {} } });
  h.mcp({ 'kiln-deploy': deploy, docs: { type: 'http', url: 'https://docs.example/mcp', headers: { Authorization: `Bearer ${auth}` } } });
  assert.deepEqual(await h.scan({ once: true }), ['Tool docs in .mcp.json was recorded as tools#2.', noGrant]);
  assert.deepEqual(await h.scan({ once: true }), []);
  for (const value of [token, auth, h.grant]) assert.equal(readFileSync(state, 'utf8').includes(value), false);
  nowhere(h, [token, auth]);
});

test('~/.claude.json IS ONLY READ: its bytes are the same after a scan, and a project server from a run in no project is not recorded', async (t) => {
  const h = await setup(t, { grant: true });
  const token = fakeValue();
  const before = JSON.stringify(
    {
      mcpServers: { fenwick: { type: 'stdio', command: 'fenwick-mcp', args: [], env: { FENWICK_TOKEN: token } } },
      projects: { [h.top]: { mcpServers: { 'local-only': { command: 'local-mcp' } } } },
      numStartups: 12,
    },
    null,
    2,
  );
  writeFileSync(h.claudeJson, before);

  assert.deepEqual(await h.scan(), [
    'This folder is in no project in the record, so the 1 server of its project config was not recorded.',
    'Tool fenwick in ~/.claude.json was recorded as tools#1, with 1 key deposited.',
  ]);
  assert.equal(readFileSync(h.claudeJson, 'utf8'), before);
  assert.equal(h.rows[0]?.scope, 'global');
  assert.deepEqual(h.rows[0]?.fields.needs, ['FENWICK_TOKEN=credentials#1']);
  nowhere(h, [token]);
});

test('A GLOBAL SERVER FOUND FROM A PROJECT RUN is proposed with names only, once, and its key is not deposited', async (t) => {
  const h = await setup(t, { project: true, grant: true });
  const token = fakeValue();
  writeFileSync(h.claudeJson, JSON.stringify({ mcpServers: { fenwick: { command: 'fenwick-mcp', env: { FENWICK_TOKEN: token } } } }));

  assert.deepEqual(await h.scan(), ['Tool fenwick in ~/.claude.json applies everywhere and this run is in a project, so recording it was proposed as SG1, and its keys were not deposited.']);
  assert.deepEqual(h.of('vault/deposit'), []);
  assert.deepEqual(h.of('create'), []);
  const body = h.of('propose')[0]?.args.body as { register: string; rows: { fields?: unknown; needs?: unknown }[] };
  assert.equal(body.register, 'tools');
  assert.deepEqual((body.rows[0] as Record<string, unknown>).needs, ['FENWICK_TOKEN']);
  assert.deepEqual(await h.scan(), [], 'the same server is not proposed twice');
  assert.equal(h.of('propose').length, 1);
  nowhere(h, [token]);
});

test('SEVERAL GLOBAL SERVERS FOUND FROM A PROJECT RUN are one question with a row each, asked once, and a new one later is asked alone', async (t) => {
  const h = await setup(t, { project: true, grant: true });
  const servers: Record<string, unknown> = {};
  for (const name of ['fenwick', 'lantern', 'quill']) servers[name] = { command: `${name}-mcp` };
  writeFileSync(h.claudeJson, JSON.stringify({ mcpServers: servers }));

  assert.deepEqual(await h.scan({ dryRun: true }), ['3 tools in ~/.claude.json (fenwick, lantern, quill) would be proposed together as tools everywhere, with their keys by name only.']);
  assert.deepEqual(await h.scan(), ['3 tools in ~/.claude.json apply everywhere and this run is in a project, so recording them was proposed together as SG1, and their keys were not deposited.']);
  assert.equal(h.of('propose').length, 1);
  const asked = h.of('propose')[0]!.args as { question: string; body: { rows: { name: string }[] } };
  assert.match(asked.question, /^Record 3 MCP servers from ~\/\.claude\.json on .+ as tools everywhere: fenwick, lantern, quill\? Accept them all, or pick which\.$/);
  assert.deepEqual(asked.body.rows.map((r) => r.name), ['fenwick', 'lantern', 'quill']);
  assert.deepEqual(await h.scan(), [], 'the set is not asked again');

  servers.kestrel = { command: 'kestrel-mcp' };
  writeFileSync(h.claudeJson, JSON.stringify({ mcpServers: servers }));
  assert.deepEqual(await h.scan(), ['Tool kestrel in ~/.claude.json applies everywhere and this run is in a project, so recording it was proposed as SG2, and its keys were not deposited.']);
  assert.deepEqual(h.of('create'), []);
});

test('A ROW THAT DIFFERS IS NOT OVERWRITTEN: a rowset update is proposed, once per shape, and a mapped key is not deposited again', async (t) => {
  const h = await setup(t, { project: true, grant: true });
  const token = fakeValue();
  h.add({ name: 'kiln-deploy', transport: 'stdio', command: 'npx', args: ['-y', 'kiln-mcp@1'], needs: ['KILN_API_TOKEN=credentials#7'], hosts: ['test-machine'], seen: new Date(NOW).toISOString() }, 'project');
  h.mcp({ 'kiln-deploy': { command: 'npx', args: ['-y', 'kiln-mcp@2'], env: { KILN_API_TOKEN: token } } });

  assert.deepEqual(await h.scan(), ['Tool kiln-deploy in .mcp.json differs from tools#1, so the row was left and the change was proposed as SG1.']);
  assert.deepEqual(h.of('propose')[0]?.args.body, {
    register: 'tools',
    rows: [{ at: 'tools#1', version: 1, patch: { transport: 'stdio', command: 'npx', args: ['-y', 'kiln-mcp@2'], endpoint: null, needs: ['KILN_API_TOKEN=credentials#7'] } }],
  });
  assert.deepEqual(h.of('update'), []);
  assert.deepEqual(h.of('vault/deposit'), []);
  assert.deepEqual(h.rows[0]?.fields.args, ['-y', 'kiln-mcp@1']);
  assert.deepEqual(await h.scan(), []);
  assert.equal(h.of('propose').length, 1);
  nowhere(h, [token]);
});

test('A ROW THAT MATCHES only has this machine added to hosts and seen moved on, and then is left alone', async (t) => {
  const h = await setup(t, { project: true, grant: true });
  h.add({ name: 'kiln-deploy', transport: 'stdio', command: 'npx', args: ['-y', 'kiln-mcp'], needs: ['KILN_API_TOKEN=credentials#7'], hosts: ['studio-desktop'], seen: new Date(NOW - 3 * 86_400_000).toISOString() }, 'project');
  h.mcp({ 'kiln-deploy': { command: 'npx', args: ['-y', 'kiln-mcp'], env: { KILN_API_TOKEN: fakeValue() } } });

  assert.deepEqual(await h.scan(), []);
  assert.deepEqual(h.of('update').map((u) => u.args), [{ register: 'tools', seq: 1, patch: { hosts: ['studio-desktop', 'test-machine'], seen: new Date(NOW).toISOString() }, version: 1 }]);
  assert.deepEqual(await h.scan(), []);
  assert.equal(h.of('update').length, 1);
  assert.deepEqual([...h.of('create'), ...h.of('propose'), ...h.of('vault/deposit')], []);
});

test('A KEY IN A COMMAND OR ARGUMENT keeps the server out of the record; a key-shaped value under any env name is deposited', async (t) => {
  const h = await setup(t, { project: true, grant: true });
  const inArgs = keyShaped();
  const inEnv = keyShaped();
  h.mcp({ leaky: { command: 'leaky-mcp', args: ['--api-key', inArgs] }, shaped: { command: 'shaped-mcp', env: { SHAPED_SETTING: inEnv } } });

  assert.deepEqual(await h.scan(), [
    'Tool leaky in .mcp.json carries what looks like a key in its command, arguments or address, so it was not recorded. Move the key into its env and scan again.',
    'Tool shaped in .mcp.json was recorded as tools#1, with 1 key deposited.',
  ]);
  assert.deepEqual(h.rows.map((r) => r.fields.needs), [['SHAPED_SETTING=credentials#1']]);
  assert.equal(h.of('vault/deposit')[0]?.args.value, inEnv);
  nowhere(h, [inArgs, inEnv]);

  assert.equal(looksLikeKey(inArgs), true);
  for (const plain of ['eu-west', 'npx', 'kiln-mcp@2', 'https://docs.example/mcp', fakeValue()]) assert.equal(looksLikeKey(plain), false, plain);
});

test('A SCAN DRY RUN deposits, creates and proposes nothing, and writes no lock', async (t) => {
  const h = await setup(t, { project: true, grant: true });
  const token = fakeValue();
  h.mcp({ 'kiln-deploy': { command: 'npx', env: { KILN_API_TOKEN: token } } });
  assert.deepEqual(await h.scan({ dryRun: true }), ['Tool kiln-deploy in .mcp.json would be recorded, and 1 key would be deposited.']);
  assert.deepEqual(h.seen.map((s) => s.method), ['context']);
  assert.equal(existsSync(h.lockFile), false);
  nowhere(h, [token]);
});

/* ── write ─────────────────────────────────────────────────────────────── */

const DEPLOY = { name: 'kiln-deploy', transport: 'stdio', command: 'npx', args: ['-y', 'kiln-mcp'], needs: ['KILN_API_TOKEN=credentials#1', 'KILN_REGION'] };
const DOCS = { name: 'docs', transport: 'http', endpoint: 'https://docs.example/mcp', needs: ['header:Authorization=credentials#2'] };
const deployEntry = { type: 'stdio', command: 'node', args: [CLI, 'keys', 'exec', 'credentials#1', '--as', 'KILN_API_TOKEN', '--', 'npx', '-y', 'kiln-mcp'] };

test('WRITE IS A DRY RUN BY DEFAULT: each entry is shown, a key is handed over by keys exec, and what cannot be carried is said', async (t) => {
  const h = await setup(t);
  h.add(DEPLOY);
  h.add(DOCS);
  assert.deepEqual(await h.write(), [
    'Tool kiln-deploy needs KILN_REGION, whose value BrainDog does not keep, so set it in the entry yourself.',
    `+ kiln-deploy at user scope: ${JSON.stringify(deployEntry)}`,
    `+ docs at user scope: ${JSON.stringify({ type: 'http', url: 'https://docs.example/mcp', headersHelper: `node "${CLI}" keys headers credentials#2 --as Authorization` })}`,
    'Nothing was changed. Run braindog tools write --scope user for the global tools, or --scope project for this repository.',
  ]);
  assert.deepEqual(h.calls, []);
  assert.equal(existsSync(h.lockFile), false);

  const two = renderEntry('two', { transport: 'stdio', command: 'srv', args: [], needs: ['A_KEY=credentials#3', 'B_KEY=credentials#4'] }, CLI).entry;
  assert.deepEqual(two, { type: 'stdio', command: 'node', args: [CLI, 'keys', 'exec', 'credentials#3', '--as', 'A_KEY', '--', 'node', CLI, 'keys', 'exec', 'credentials#4', '--as', 'B_KEY', '--', 'srv'] });
});

test('WRITE --scope user applies through claude mcp add-json, records the lock, and does nothing when the entry already matches', async (t) => {
  const h = await setup(t);
  h.add(DEPLOY);
  assert.deepEqual(await h.write({ scope: 'user' }), ['Tool kiln-deploy needs KILN_REGION, whose value BrainDog does not keep, so set it in the entry yourself.', 'Tool kiln-deploy added at user scope.']);
  assert.deepEqual(h.calls, [{ args: ['mcp', 'add-json', 'kiln-deploy', JSON.stringify(deployEntry), '--scope', 'user'], cwd: h.top }]);
  const lock = JSON.parse(readFileSync(h.lockFile, 'utf8')) as { written: Record<string, string> };
  assert.match(lock.written['global||kiln-deploy'] ?? '', /^[0-9a-f]{64}$/);

  /* What claude would have written. */
  writeFileSync(h.claudeJson, JSON.stringify({ mcpServers: { 'kiln-deploy': deployEntry } }));
  assert.deepEqual(await h.write({ scope: 'user' }), []);
  assert.equal(h.calls.length, 1);

  /* A person changed it by hand since. */
  writeFileSync(h.claudeJson, JSON.stringify({ mcpServers: { 'kiln-deploy': { ...deployEntry, args: ['--my-own'] } } }));
  assert.deepEqual(await h.write({ scope: 'user' }), [
    'Tool kiln-deploy at user scope was changed by hand since BrainDog wrote it, so it is left. Remove it with claude mcp remove kiln-deploy --scope user to take the record\'s.',
  ]);
  assert.equal(h.calls.length, 1);
});

test('AN ENTRY THE SCAN READ, HOLDING A KEY IN ITS ENV, is replaced by one that holds none, and the key is never printed or passed', async (t) => {
  const h = await setup(t);
  const token = fakeValue();
  h.add(DEPLOY);
  writeFileSync(h.claudeJson, JSON.stringify({ mcpServers: { 'kiln-deploy': { type: 'stdio', command: 'npx', args: ['-y', 'kiln-mcp'], env: { KILN_API_TOKEN: token } } } }));

  assert.equal((await h.write())[1], `~ kiln-deploy at user scope, replacing the entry there: ${JSON.stringify(deployEntry)}`);
  assert.equal((await h.write({ scope: 'user' })).at(-1), 'Tool kiln-deploy replaced at user scope.');
  assert.deepEqual(h.calls.map((c) => c.args.slice(0, 3)), [['mcp', 'remove', 'kiln-deploy'], ['mcp', 'add-json', 'kiln-deploy']]);
  nowhere(h, [token]);
});

test('WRITE --scope project applies only the project tools, in the repository folder, and a missing claude is one line', async (t) => {
  const h = await setup(t, { project: true });
  h.add(DOCS);
  h.add({ ...DEPLOY, name: 'kiln-glaze' }, 'project');
  h.setCode(-1);
  assert.deepEqual(await h.write({ scope: 'project' }), ['Tool kiln-glaze needs KILN_REGION, whose value BrainDog does not keep, so set it in the entry yourself.', 'claude was not found, so nothing was applied.']);
  assert.deepEqual(h.calls.map((c) => [c.args[2], c.args.at(-1), c.cwd]), [['kiln-glaze', 'project', h.top]]);

  h.setCode(0);
  assert.equal((await h.write({ scope: 'project' })).at(-1), 'Tool kiln-glaze added at project scope.');
  assert.ok(h.calls.every((c) => c.args[2] === 'kiln-glaze'), 'the global tool is not applied at project scope');
});

/* ── the command ───────────────────────────────────────────────────────── */

test('braindog tools: a wrong verb, flag or scope is exit 1, and a record without tools is exit 0', async (t) => {
  const h = await setup(t, { register: false });
  const io = { ...h.io, cli: CLI };
  assert.equal(await tools(['sync'], io), 1);
  assert.equal(await tools(['scan', '--scope', 'user'], io), 1);
  assert.equal(await tools(['write', '--scope', 'team'], io), 1);
  assert.equal(await tools(['write', '--force'], io), 1);
  assert.deepEqual(h.said, [
    'braindog tools takes scan or write.',
    'braindog tools scan takes --host and --dry-run, and nothing else.',
    'braindog tools write takes --scope user or --scope project, --host and --dry-run, and nothing else.',
    'braindog tools write takes --scope user or --scope project, --host and --dry-run, and nothing else.',
  ]);
  assert.equal(await tools(['scan'], io), 0);
  assert.deepEqual(h.out, ['This record has no tools register, so there is nothing to do.']);
});

test('braindog tools scan --dry-run over the command prints the lines and says it was a dry run', async (t) => {
  const h = await setup(t, { project: true, grant: true });
  const token = fakeValue();
  h.mcp({ 'kiln-deploy': { command: 'npx', env: { KILN_API_TOKEN: token } } });
  assert.equal(await tools(['scan', '--dry-run'], { ...h.io, cli: CLI }), 0);
  assert.equal(h.out.at(-1), 'That was a dry run, so nothing was deposited, written, sent or proposed.');
  nowhere(h, [token]);
});
