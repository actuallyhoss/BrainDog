/**
 * CLAUDE CODE ON RUNS, EVERY LINE READ BACK FROM THE RECORD (AGT-C01 job b, `loop/scope/area-agents-c.md`).
 *
 * The door check (`claude-code.check.mjs`) proves a stranger's Claude Code reaches the record. This one proves what the
 * record makes of it, the run rules held by the real app rather than by a hand-written client:
 *
 *   start    the start opens one run, named for the app and its version, placed in the project of its folder, with
 *            a spoken id;
 *   write    a write is signed by that run and moves its last seen, and the run's own history gains no line for it;
 *   compact  a compaction keeps the run;
 *   resume   a resume does what the hook-events table measured (`docs/48-SPEC-CLI.md`, "What Claude Code hands each
 *            hook"): the resumed conversation's own id, so the same run, attached again;
 *   clear    a clear keeps the run it cleared, and is a conversation of its own, as the table measured;
 *   second   a second sign-in on the same machine and folder gets its own run, and naming the first is refused;
 *   reads    `list`, `get` and `update` work on runs, and a search for the words it is doing finds it;
 *   120      `list` with 120 runs: OFF until part B's read fix, and its line says so.
 *
 * THE BRIEF SAID A CLEAR KEEPS THE RUN. The measured table says a clear arrives with a new `session_id`, and the start
 * hook opens a run for it (`apps/cli/src/hooks.ts`, `hookStart`). This check asserts what was measured: the cleared run
 * is kept, and the clear opens at most one run of its own. If the record's intent is one run across a clear, the hook
 * changes first and this line with it.
 *
 * WHAT IT NEEDS, as `claude-code.check.mjs`: `ANTHROPIC_API_KEY`, else every line reads "not run: no key". A sign-in
 * for the record, `DOOR_TOKEN`, else six digits a person approves (and in CI, "not run"). The second sign-in needs a
 * second key, `DOOR_TOKEN_2`, or a second six digits; in CI without one that line alone reads "not run". No key is
 * minted here or written down. A key at Ask files the folder's project as a question rather than adding it, and a
 * check never answers its own question, so then the placing and the write read "not run" and say so: the night's key
 * is one the record trusts to add and note projects.
 *
 * THE CHECK'S OWN READS GO TO THE HOST'S `/mcp` with the sign-in's bearer, one plain JSON-RPC call each, with
 * `format: 'full'` so the answer is the record's JSON. Its two writes (the project the folder belongs to, and the
 * rename) each name the run they are made as in `_meta.session`, so neither opens a run nobody asked for.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const PIN = JSON.parse(readFileSync(join(HERE, 'versions', 'claude-code.json'), 'utf8'));
export const APP = PIN.app;
export const PREFIX = 'mcp__braindog__';
const REVISION = '2025-06-18';
const SETUP_MS = 10 * 60_000;
const INSTALL_MS = 5 * 60_000;
const SESSION_MS = 4 * 60_000;
const KEPT = 400_000;
/** Runs the 120-run step would list, once part B's read fix is in: `list` of 100 runs crashed in production. */
const MANY = 120;

export const lastLine = (s) =>
  String(s)
    .trim()
    .split('\n')
    .filter((l) => l.trim() !== '')
    .pop() ?? '';

/** One child, its output kept; resolves with its exit code and never rejects (127 when it could not start). */
export function run(cmd, args, { env, cwd, signal, ms, input, echo = false }) {
  return new Promise((done) => {
    let out = '';
    let err = '';
    const child = spawn(cmd, args, { env, cwd, signal, stdio: ['pipe', 'pipe', 'pipe'] });
    const timer = setTimeout(() => child.kill('SIGTERM'), ms);
    child.stdout.on('data', (b) => {
      if (out.length < KEPT) out += b;
    });
    child.stderr.on('data', (b) => {
      if (err.length < KEPT) err += b;
      /* THE SIX DIGITS ARE ON STDERR, for a person to approve. */
      if (echo) process.stderr.write(b);
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      done({ code: 127, out, err: err + e.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      done({ code: code ?? 1, out, err });
    });
    child.stdin.end(input ?? '');
  });
}

/**
 * The environment a child gets: this machine's BrainDog and Claude Code settings left out, the fresh home in their
 * place, and the record's key, when one was handed in, as `BRAINDOG_TOKEN` with `BRAINDOG_HOST` beside it.
 */
export function envOf(home, address, extraPath, token) {
  const env = {};
  for (const [name, value] of Object.entries(process.env)) {
    /* NO OTHER APP'S KEY, and no second key for the record: the night's environment holds Codex's and Cursor's too. */
    if (name.startsWith('BRAINDOG_') || name.startsWith('CLAUDE') || name === 'XDG_CONFIG_HOME' || name.startsWith('DOOR_TOKEN') || /^(OPENAI|CODEX|CURSOR)_API_KEY$/.test(name)) continue;
    env[name] = value;
  }
  env.HOME = home;
  env.CLAUDE_CONFIG_DIR = join(home, '.claude');
  env.XDG_CONFIG_HOME = join(home, '.config');
  env.PATH = [join(home, '.braindog', 'bin'), ...extraPath, process.env.PATH ?? ''].join(':');
  if (token) {
    env.BRAINDOG_TOKEN = token;
    env.BRAINDOG_HOST = address;
  }
  return env;
}

/** The same with no key in it, for the install script and npm, neither of which needs one. */
export function keyless(env) {
  const { ANTHROPIC_API_KEY: _model, BRAINDOG_TOKEN: _record, BRAINDOG_HOST: _host, ...rest } = env;
  return rest;
}

/** The bearer a six-digit sign-in kept in a home's hosts file: read to ask the host, written nowhere. */
export function tokenIn(home) {
  const file = join(home, '.config', 'braindog', 'hosts.json');
  if (!existsSync(file)) return undefined;
  try {
    const hosts = JSON.parse(readFileSync(file, 'utf8'));
    const entry = (hosts.default && hosts.hosts?.[hosts.default]) || Object.values(hosts.hosts ?? {})[0];
    return typeof entry?.token?.value === 'string' ? entry.token.value : undefined;
  } catch {
    return undefined;
  }
}

/** The record's address from `--record`: a slug on the host, or a whole address. */
export const addressOf = (host, record) => (/^https?:\/\//.test(record) ? record.replace(/\/+$/, '') : `${host}/app/${record}`);

/** The command, as a stranger installs it, into one home. */
export async function installCli(host, home, signal) {
  const plain = keyless(envOf(home, host, [], undefined));
  const got = await run('sh', ['-c', 'curl -fsSL "$DOOR_INSTALL" | sh'], { env: { ...plain, DOOR_INSTALL: `${host}/cli/install.sh` }, cwd: home, signal, ms: INSTALL_MS });
  if (got.code !== 0 || !existsSync(join(home, '.braindog', 'bin', 'braindog'))) throw new Error(`install failed: ${lastLine(got.err || got.out)}`);
}

/** Claude Code at one version, under `root`, and the folder its `claude` is in. */
export async function installClaude(version, root, home, signal) {
  const prefix = join(root, `claude-${version}`);
  const env = keyless(envOf(home, '', [], undefined));
  const got = await run('npm', ['install', '--prefix', prefix, '--no-save', '--no-audit', '--no-fund', `${PIN.package}@${version}`], { env, cwd: root, signal, ms: INSTALL_MS });
  const bin = join(prefix, 'node_modules', '.bin');
  if (got.code !== 0 || !existsSync(join(bin, 'claude'))) throw new Error(`Claude Code ${version} did not install: ${lastLine(got.err || got.out)}`);
  return bin;
}

/**
 * One sign-in: `braindog setup <address>` in a home of its own, with the key handed in or six digits on this terminal.
 * `paths` are the folders the command and Claude Code are in, which a second home borrows from the first. Answers the environment its sessions run with and the bearer the record knows it by.
 */
export async function signIn(home, address, paths, token, signal) {
  mkdirSync(home, { recursive: true });
  const env = envOf(home, address, paths, token);
  const setup = await run('braindog', ['setup', address, '--yes'], { env, cwd: home, signal, ms: SETUP_MS, echo: true });
  if (setup.code !== 0) throw new Error(`setup failed: ${lastLine(setup.err || setup.out)}`);
  const bearer = token || tokenIn(home);
  if (!bearer) throw new Error('setup left no key for the record');
  return { env, bearer };
}

/** A scratch git repository with one commit, by its real path, which is the folder Claude Code reports. */
export async function scratchRepo(dir, env, signal) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'README.md'), '# Scratch\n\nA folder the door check made.\n');
  const git = (...a) => run('git', a, { env: { ...env, GIT_AUTHOR_NAME: 'Door Check', GIT_AUTHOR_EMAIL: 'door@example.test', GIT_COMMITTER_NAME: 'Door Check', GIT_COMMITTER_EMAIL: 'door@example.test' }, cwd: dir, signal, ms: 30_000 });
  await git('init', '-q');
  await git('add', '.');
  await git('commit', '-q', '-m', 'Start');
  return realpathSync(dir);
}

/**
 * One tool of the record's `/mcp`, asked plainly as `call` is answered to Claude Code, with `format: 'full'` so the
 * answer is the record's JSON. `session` goes in `_meta.session`: the run the call is made as. Answers `{ value }`,
 * or `{ refused }` with the record's sentence; a host that does not answer throws.
 */
export async function tool(origin, bearer, name, args, { session, signal, fetcher = fetch } = {}) {
  const params = { name, arguments: { ...args, format: 'full' }, ...(session ? { _meta: { session } } : {}) };
  const res = await fetcher(`${origin}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': REVISION, authorization: `Bearer ${bearer}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params }),
    signal,
    redirect: 'error',
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`the host's /mcp answered ${name} with ${res.status}: ${lastLine(text).slice(0, 160)}`);
  const body = res.headers.get('content-type')?.includes('text/event-stream')
    ? text
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim())
        .pop()
    : text;
  return answerOf(JSON.parse(body ?? 'null'), name);
}

/** A `tools/call` answer as the check reads it. Exported for the tests. */
export function answerOf(msg, name = 'the call') {
  if (!msg || msg.error) throw new Error(`the host's /mcp refused ${name}: ${msg?.error?.message ?? 'no answer'}`);
  const result = msg.result ?? {};
  const text = (result.content ?? []).map((c) => c.text ?? '').join('\n');
  if (result.isError) return { refused: text || 'refused' };
  if (result.structuredContent !== undefined) return { value: result.structuredContent };
  try {
    return { value: JSON.parse(text) };
  } catch {
    return { value: text };
  }
}

/** The rows of a page, whatever the record wrapped them in. */
export const rowsOf = (value) => (Array.isArray(value) ? value : Array.isArray(value?.rows) ? value.rows : []);
/** A run's spoken id: the record's when it says one, else its number after the runs list's `S`. */
export const spokenOf = (row) => (typeof row?.spoken === 'string' ? row.spoken : Number.isInteger(row?.seq) ? `S${row.seq}` : '');

/**
 * What one `claude -p` printed, read as stream-json: its session id and version from the first event, every tool call
 * with its input and whether it was refused, in order, and the words the model said, in order.
 */
export function readStream(out) {
  const events = [];
  for (const line of String(out).split('\n')) {
    try {
      events.push(JSON.parse(line));
    } catch {
      /* not an event */
    }
  }
  const init = events.find((e) => e.type === 'system' && e.subtype === 'init') ?? null;
  const calls = [];
  const byId = new Map();
  const said = [];
  for (const e of events) {
    for (const c of e.type === 'assistant' ? (e.message?.content ?? []) : []) {
      if (c.type === 'tool_use') {
        const call = { id: c.id, name: c.name, input: c.input ?? {}, ok: null, at: said.length };
        calls.push(call);
        byId.set(c.id, call);
      } else if (c.type === 'text' && c.text?.trim()) said.push({ text: c.text, at: calls.length });
    }
    for (const c of e.type === 'user' ? (e.message?.content ?? []) : []) {
      const call = c.type === 'tool_result' ? byId.get(c.tool_use_id) : undefined;
      if (call) call.ok = c.is_error !== true;
    }
  }
  const result = events.findLast((e) => e.type === 'result') ?? null;
  return { id: init?.session_id ?? result?.session_id ?? null, version: init?.claude_code_version ?? '', init, calls, said, result };
}

/** One `claude -p` in `cwd`, with the pin's stream-json flags and the given ones. */
export async function session(bin, env, cwd, prompt, extra, signal, { ms = SESSION_MS, quiet = false } = {}) {
  const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose', ...extra];
  const got = await run(join(bin, 'claude'), args, { env, cwd, signal, ms });
  const s = readStream(got.out);
  /* A SLASH COMMAND MAY PRINT NO FIRST EVENT, so `quiet` answers it with no id rather than failing the night. */
  if (!s.id && !quiet) throw new Error(`Claude Code started no session: ${lastLine(got.err || got.out) || `exit ${got.code}`}`);
  /* BUT ONE THAT PRINTED NOTHING AND EXITED WITH AN ERROR NEVER RAN, and `failed` says so, so its line cannot pass on
     a step that did nothing. */
  const failed = !s.id && got.code !== 0 ? lastLine(got.err || got.out).slice(0, 160) || `exit ${got.code}` : '';
  return { ...s, failed };
}

/* ── THE SCENARIO, held apart from Claude Code so the tests drive it with a fake client and a local record ── */

/**
 * The one state that is a run lost. A `claude -p` ends its session, so between steps a run reads `done` or `handoff`
 * (AGT-C04's end), and the next step's attach brings it back: done is a session closed, never a run lost. Abandoned is
 * the sweep's, a run nobody heard from.
 */
const LOST = ['abandoned'];
/** A count and its word, one or many: "1 run", "2 runs". */
const many = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const ago = (from, to) => `${Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 1000))}s`;

/**
 * The record as the check reads it, through one key. Every call goes through `ask`, which is `tool` bound to the host
 * and the key: `(name, args, session?) => { value } | { refused }`. `post` is the record's `/api/<method>` with the same
 * key, `(method, body) => { ok, value } | { ok: false, refusal }`, for the one call a hook makes and no tool does.
 */
export function reader(ask, post) {
  const must = async (name, args, session) => {
    const got = await ask(name, args, session);
    if (got.refused !== undefined) throw new Error(`the record refused ${name}: ${lastLine(got.refused).slice(0, 160)}`);
    return got.value;
  };
  return {
    ask,
    must,
    runsWhere: async (field, is) => rowsOf(await must('list', { register: 'session', where: { field, is }, limit: 100 })),
    get: async (spoken) => must('get', { spoken }),
    history: async (spoken) => rowsOf(await must('history', { spoken })),
    /* WHAT THE START HOOK SENDS ON A RESUME, word for word, so a run a closed session ended is working again. */
    attach: async (id) => {
      const got = await post('attach', { source: 'resume', client_id: id });
      if (got?.ok !== true) throw new Error(`the record refused attach: ${got?.refusal?.fix ?? 'no answer'}`);
      return got.value;
    },
  };
}

/**
 * The register the record places runs by: the one that declares `scopes`, read off `record_index` and each register's
 * `schema`, never a name this check knows. `null` when the record keeps no projects.
 */
export async function projectsList(r) {
  const index = await r.must('record_index', {});
  const held = Array.isArray(index?.registers) ? index.registers : Object.entries(index?.registers ?? {}).map(([id, v]) => ({ id, ...(typeof v === 'object' ? v : {}) }));
  for (const reg of held) {
    const id = typeof reg === 'string' ? reg : reg?.id;
    if (typeof id !== 'string' || id === 'session') continue;
    const decl = reg?.scopes ? reg : await r.must('schema', { register: id }).catch(() => null);
    if (decl?.scopes?.folders) return { register: id, folders: decl.scopes.folders, title: typeof decl.title === 'string' ? decl.title : 'name' };
  }
  return null;
}

/**
 * A project for the scratch folder, so the start has somewhere to be placed: made as a run of the check's own
 * (`maker`, a client id), so it signs no run Claude Code opens.
 */
export async function projectFor(r, folder, name, maker) {
  const list = await projectsList(r);
  if (!list) return { refused: 'the record keeps no projects, so a run has nowhere to be placed' };
  const got = await r.ask('create', { register: list.register, fields: { [list.title]: name, [list.folders]: [folder] } }, { client_id: maker });
  if (got.refused !== undefined) return { refused: `the record refused the folder's project: ${lastLine(got.refused).slice(0, 160)}` };
  /* A KEY AT ASK FILES THE PROJECT AS A QUESTION (DIRECTION 37), and a check never answers its own question: the
     placing and the write read "not run" with the reason, never a failure of the rule and never green. */
  if (got.value?.filed)
    return { refused: 'the key asks before it adds a project, and its question waits on Decide, so the folder has no project; hand the check a key the record trusts to add projects', asked: true };
  return { project: got.value, spoken: spokenOfRow(got.value, list.register), name };
}

/** A row's spoken id as `get` takes it: its own when the answer says one, else `register#number`. */
const spokenOfRow = (row, register) => (typeof row?.spoken === 'string' ? row.spoken : `${register}#${row?.seq}`);

/**
 * The scenario. `client` is the app, one method a step, each answering the session it ran as `{ id, version }`:
 * `start()`, `write(id, spoken, note)`, `compact(id)`, `resume(id)`, `clear(id)`, and `second()` when a second sign-in
 * is there to make. `r` reads as the first sign-in, `r2` as the second or `null`, `folder` is the scratch repository and
 * `project` what `projectFor` answered, `word` a word no record holds, for the search, and `why2` why there is no second
 * sign-in when there is none. Answers one row a line, `ok: null` for a line that could not run.
 */
export async function runsScenario({ client, r, r2, folder, project, word, why2, version: said = '' }) {
  const rows = [];
  let version = said;
  const line = (step, ok, saw) => rows.push({ app: APP, version, ok, saw: `${step}: ${saw}` });
  const runsHere = async () => (await r.runsWhere('cwd', folder)).filter((x) => !x.deleted_at);

  /* START: one run, named for the app, its version, the folder's project, a spoken id. */
  const s = await client.start();
  version = s.version || version;
  const opened = await r.runsWhere('client_id', s.id);
  const first = opened[0];
  const spoken = spokenOf(first);
  if (opened.length !== 1 || !first) {
    line('start', false, `${many(opened.length, 'run')} hold the session's id, and one should`);
    line('the rest', false, 'not reached, because the start did not open exactly one run');
    return rows;
  }
  const f = first.fields ?? {};
  const misses = [];
  if (!/^S[1-9]\d*$/.test(spoken)) misses.push(`its spoken id reads "${spoken}"`);
  if (!/^Claude Code\b/.test(String(f.doing ?? ''))) misses.push(`it is called "${f.doing ?? ''}", not for the app`);
  if (s.version && f.client_version !== s.version) misses.push(`its app version reads "${f.client_version ?? ''}", the app said ${s.version}`);
  /* A PROJECT ASKED FOR AND NOT YET MADE is nothing to be placed in, and says so on a line of its own below. */
  if (project.asked) {
    /* said on the placing line */
  } else if (project.refused) misses.push(project.refused);
  else if (f.project !== project.project?.id && f.project !== project.spoken) misses.push(`it is in ${f.project ? 'another project' : 'no project'}, not ${project.name}`);
  line('start', misses.length === 0, misses.length ? `${spoken}: ${misses.join('; ')}` : `opened ${spoken}, "${f.doing}", app version ${f.client_version}, ${project.asked ? 'in no project yet' : `in ${project.name}`}`);

  /* WRITE: signed by the run, its last seen moved, its own history no longer. THE RUN IS WORKING FIRST, as it is inside
     a session, because a write to a run its session closed brings it back, and that is a line of its own. */
  if (project.asked) {
    line('placed', null, project.refused);
    line('write', null, 'no project to write a note on, because the key asks before it adds one');
  } else if (project.refused) line('write', false, 'not reached: no project to write a note on');
  else {
    await r.attach(s.id);
    const before = await r.get(spoken);
    const lines = (await r.history(spoken)).length;
    const note = `Door check: a note written by ${spoken}`;
    await client.write(s.id, project.spoken, note);
    const by = (await r.history(project.spoken)).filter((e) => e.actor === spoken);
    const after = await r.get(spoken);
    /* THE SESSION'S OWN COMING AND GOING IS NOT THE WRITE'S: a resumed `claude -p` is attached again and ends, and each
       is a line on the run. Any other line is the write landing on the run, which it must not. */
    const grew = (await r.history(spoken)).slice(lines).filter((e) => e.kind !== 'state' && !/^attached: /.test(String(e.note ?? ''))).length;
    const moved = String(after?.fields?.last_seen ?? '') > String(before?.fields?.last_seen ?? '');
    const ok = by.length > 0 && moved && grew === 0;
    const saw = [by.length > 0 ? `signed by ${spoken}` : `no line on ${project.name} signed by ${spoken}`];
    saw.push(moved ? `last seen moved ${ago(before.fields.last_seen, after.fields.last_seen)}` : 'last seen did not move');
    saw.push(grew === 0 ? 'the run\'s own history gained no line' : `the run's own history gained ${many(grew, 'line')}`);
    line('write', ok, saw.join(', '));
  }

  /* COMPACT: the same run. */
  const count = async () => (await runsHere()).length;
  const kept = async (id) => {
    const held = await r.runsWhere('client_id', s.id);
    const same = held.length === 1 && spokenOf(held[0]) === spoken;
    const state = held[0]?.state ?? held[0]?.fields?.state ?? '';
    return { same: same && !LOST.includes(state), state, moved: Boolean(id) && id !== s.id };
  };
  let n = await count();
  const c = await client.compact(s.id);
  const ck = await kept(c.id);
  const cn = (await count()) - n;
  const cs = c.failed ? `Claude Code did not compact: ${c.failed}, ` : '';
  line('compact', !c.failed && ck.same && cn === 0 && !ck.moved, `${cs}${ck.same ? `${spoken} kept (${ck.state})` : `${spoken} not kept (${ck.state || 'gone'})`}${ck.moved ? ', the session came back with a new id' : ''}, ${many(cn, 'run')} opened`);

  /* RESUME, as the table measured: the resumed conversation's own id, so the same run, attached again. */
  n = await count();
  const lines = (await r.history(spoken)).length;
  const rs = await client.resume(s.id);
  const rk = await kept(rs.id);
  const rn = (await count()) - n;
  const attached = (await r.history(spoken)).slice(lines).some((e) => /attached: resume/.test(String(e.note ?? '')));
  line(
    'resume',
    rk.same && rs.id === s.id && rn === 0 && attached,
    `${rs.id === s.id ? 'the same id, as the table measured' : rs.id ? 'a new id, where the table measured the same' : 'no id said'}, ${rk.same ? `${spoken} kept` : `${spoken} not kept`}, ${many(rn, 'run')} opened, ${attached ? 'attached again' : 'never attached again'}`,
  );

  /* CLEAR: the cleared run kept; the clear is a conversation of its own, as the table measured. */
  n = await count();
  const k = await client.clear(s.id);
  const kk = await kept(k.id);
  const kn = (await count()) - n;
  const ks = k.failed ? `Claude Code did not clear: ${k.failed}, ` : '';
  line('clear', !k.failed && kk.same && kn <= 1, `${ks}${kk.same ? `${spoken} kept (${kk.state})` : `${spoken} not kept (${kk.state || 'gone'})`}, ${many(kn, 'run')} of its own opened${kn === 1 ? ', as the table measured a new id' : ''}`);

  await second({ client, r, r2, sid: s.id, spoken, line, why2 });
  await reads({ r, spoken, sid: s.id, word, line });
  rows.push({ app: APP, version, ok: null, saw: `list of ${MANY} runs: off until part B's read fix, because a list of 100 runs crashed in production` });
  return rows;
}

/** A second sign-in on the same machine and folder: a run of its own, and the first one's name refused to it. */
async function second({ client, r, r2, sid, spoken, line, why2 }) {
  if (!r2 || !client.second) {
    line('second sign-in', null, why2 || 'no second key for the record');
    return;
  }
  const t = await client.second();
  const own = await r2.runsWhere('client_id', t.id);
  const theirs = spokenOf(own[0]);
  /* NAMED WHILE IT WORKS. A finished run's name is dropped and the caller's own run is found instead (rung 2 of the
     ladder, `packages/kernel/src/session.ts`), so naming a run its session closed proves nothing. */
  await r.attach(sid);
  const named = await r2.ask('handoff', { doing: 'Door check, naming another run' }, { spoken });
  const refused = named.refused !== undefined && /another key/i.test(named.refused);
  const ok = own.length === 1 && theirs !== '' && theirs !== spoken && refused;
  const saw = [own.length === 1 ? (theirs === spoken ? `it was handed ${spoken}` : `its own run, ${theirs}`) : `${many(own.length, 'run')} hold its session's id`];
  saw.push(refused ? `naming ${spoken} refused` : named.refused !== undefined ? `naming ${spoken} refused for another reason: ${lastLine(named.refused).slice(0, 120)}` : `naming ${spoken} was let through`);
  line('second sign-in', ok, saw.join(', '));
}

/** `list`, `get` and `update` on runs, and a search for the words the run is doing. */
async function reads({ r, spoken, sid, word, line }) {
  const listed = (await r.runsWhere('client_id', sid)).some((x) => spokenOf(x) === spoken);
  const got = await r.get(spoken);
  const read = got?.fields?.client_id === sid;
  const doing = `Checking the door ${word}`;
  /* AS THE RUN ITSELF, by its session's id, so the rename is the run's own write and opens no other run. */
  const changed = await r.ask('update', { spoken, patch: { doing }, version: got?.version }, { client_id: sid });
  const now = changed.refused === undefined ? await r.get(spoken) : null;
  const renamed = now?.fields?.doing === doing;
  const found = renamed ? rowsOf(await r.must('search', { q: word })).some((h) => spokenOf(h) === spoken || h?.id === got?.id) : false;
  const saw = [listed ? 'list finds it' : 'list does not find it', read ? 'get reads it' : 'get does not read it'];
  saw.push(changed.refused !== undefined ? `update refused: ${lastLine(changed.refused).slice(0, 120)}` : renamed ? 'update renames it' : 'update changed nothing');
  saw.push(found ? `a search for "${word}" finds it` : `a search for "${word}" does not find it`);
  line('list, get, update', listed && read && renamed && found, saw.join(', '));
}

/* ── THE REAL APP: Claude Code at its pin, signed in through `braindog setup`, driven one `claude -p` a step ── */

/** A word no record holds: letters only, so a search reads it as one word. */
export const freshWord = () => `door${Array.from({ length: 8 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('')}`;

/**
 * The record's `/api/<method>` through one key, as the command's hooks call it: the session's id in the body and in
 * `x-braindog-client` both, as `sessionHeaders` sends it. Answers the record's `{ ok, value }` or `{ ok: false, refusal }`.
 */
export function poster(origin, bearer, signal, fetcher = fetch) {
  return async (method, body) => {
    const headers = { 'content-type': 'application/json', authorization: `Bearer ${bearer}` };
    if (typeof body?.client_id === 'string') headers['x-braindog-client'] = body.client_id;
    const res = await fetcher(`${origin}/api/${method}`, { method: 'POST', headers, body: JSON.stringify(body ?? {}), signal, redirect: 'error' });
    try {
      return await res.json();
    } catch {
      return { ok: false, refusal: { fix: `${res.status} with an answer that is not JSON` } };
    }
  };
}

/** Claude Code as the scenario's client: each step one `claude -p` in the scratch folder, a resume where it continues. */
export function claudeClient({ bin, env, env2, folder, signal }) {
  const one = (prompt, extra, opts) => session(bin, env, folder, prompt, extra, signal, opts);
  const said = (s, id) => ({ id: s.id ?? id, version: s.version });
  return {
    start: async () =>
      said(await one('Call the context tool of braindog once, then say in one line which run it named.', ['--max-turns', '3', '--allowedTools', `${PREFIX}context`])),
    write: async (id, spoken, note) =>
      said(await one(`Call the log tool of braindog once, with spoken "${spoken}" and the note "${note}". Then stop.`, ['--resume', id, '--max-turns', '3', '--allowedTools', `${PREFIX}log`]), id),
    /* A SLASH COMMAND IN A RESUMED PRINT SESSION, which may print no first event: then the id it ran as is not said. */
    compact: async (id) => {
      const s = await one('/compact', ['--resume', id], { quiet: true });
      return { id: s.id, version: s.version, failed: s.failed };
    },
    resume: async (id) => said(await one('Say the one word: back.', ['--resume', id, '--max-turns', '1'])),
    clear: async (id) => {
      const s = await one('/clear', ['--resume', id], { quiet: true });
      return { id: s.id, version: s.version, failed: s.failed };
    },
    ...(env2
      ? {
          second: async () =>
            said(await session(bin, env2, folder, 'Call the context tool of braindog once, then say in one line which run it named.', ['--max-turns', '3', '--allowedTools', `${PREFIX}context`], signal)),
        }
      : {}),
  };
}

/** Each bearer a six-digit sign-in left in a home, cut out of every row and failure, as `claude-code.check.mjs` does. */
export function cutter(homes) {
  return (s) => homes.reduce((text, h) => {
    const token = tokenIn(h);
    return token && token.length >= 8 ? text.split(token).join('[withheld]') : text;
  }, String(s));
}

export default async function runsClaudeCode(ctx) {
  const homes = [ctx.home, join(ctx.home, 'second')];
  const cut = cutter(homes);
  try {
    return JSON.parse(cut(JSON.stringify(await runs(ctx, homes))));
  } catch (error) {
    throw new Error(cut(error instanceof Error ? error.message : error));
  }
}

/** Why the check cannot run here, or `null`: the same three reasons as the door check, each read "not run", never green. */
export function notRun({ record, env = process.env }) {
  if (!env.ANTHROPIC_API_KEY) return 'no key for the model';
  if (!record) return 'no record, pass --record';
  if (env.CI && !env.DOOR_TOKEN) return 'no key for the record, and no one here to approve six digits';
  return null;
}

async function runs({ host, record, home, signal }, [home1, home2]) {
  const why = notRun({ record });
  /* NAMED FOR THE SCENARIO, because three checks print as Claude Code and a night's lines must say which is which. */
  if (why) return { app: APP, version: PIN.pinned, ok: null, saw: `${why}, for the runs scenario` };
  const address = addressOf(host, record);
  const origin = new URL(address).origin;

  await installCli(host, home1, signal);
  const bin = await installClaude(PIN.pinned, home1, home1, signal);
  const paths = [join(home1, '.braindog', 'bin'), bin];
  const one = await signIn(home1, address, paths, process.env.DOOR_TOKEN, signal);

  /* THE SECOND SIGN-IN: a key of its own, or six digits for a person here; in CI with no second key, none. */
  let two = null;
  let why2 = '';
  if (process.env.DOOR_TOKEN_2 || !process.env.CI) two = await signIn(home2, address, paths, process.env.DOOR_TOKEN_2, signal);
  else why2 = 'no second key for the record, DOOR_TOKEN_2';
  if (two && two.bearer === one.bearer) {
    two = null;
    why2 = 'the second sign-in was handed the first one\'s key, so it is not a second sign-in';
  }

  const word = freshWord();
  const folder = await scratchRepo(join(home1, 'work', word), one.env, signal);
  const readerOf = (s) => reader((name, args, at) => tool(origin, s.bearer, name, args, { session: at, signal }), poster(origin, s.bearer, signal));
  const r = readerOf(one);
  const project = await projectFor(r, folder, `Door check ${word}`, `door-check-${word}`);
  const client = claudeClient({ bin, env: one.env, env2: two?.env, folder, signal });
  const version = (await run(join(bin, 'claude'), ['--version'], { env: one.env, signal, ms: 30_000 })).out.trim().split(/\s+/)[0] || PIN.pinned;
  return runsScenario({ client, r, r2: two ? readerOf(two) : null, folder, project, word, why2, version });
}
