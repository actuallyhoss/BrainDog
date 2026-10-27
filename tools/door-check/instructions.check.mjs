/**
 * WHAT HE TELLS A RUN, HEARD BY A REAL CLAUDE CODE (agents and MCP plan, Wave 4, W4-A). Four lines, each read back
 * from the record and from the files the hooks keep:
 *
 *   prompt   an instruction sent through `instruct` reaches the run on its next prompt (UserPromptSubmit), and the
 *            run acts on it though the prompt itself never says it;
 *   stop     a stop denies the next tool (PreToolUse), with the record's own words;
 *   reply    the reply lands with receipts: the run's own write, by name, and nothing else;
 *   end      the run ends as Ended (`done`) when the session closes.
 *
 * ONE SESSION, SEVERAL PROMPTS. `claude -p --input-format stream-json` keeps one session open and reads each prompt
 * from standard input as it comes, so the bridge (the MCP server) lives for the whole session and pulses the record
 * as it does in a window a person types into: the instruction is said between two prompts, the pulse writes it to the
 * session's inbox file, and the next prompt's hook adds it. Closing standard input closes the session, which is the
 * window closing.
 *
 * PATHS A, B AND F (start, tool answers, asked) are what every client gets, Codex and Cursor too, which have no hooks:
 * three more rows say them, through the same key as a session that says it is Codex, straight to the record's `/mcp`
 * (`pathsScenario`). Codex itself is not driven here.
 *
 * WHAT IT NEEDS. A seed host (`seed-host.mjs`) and its key, `DOOR_SEED_KEY`, which that script hands the command it
 * runs: the check speaks as the seed's owner with it to make the agent's token and to tell the run things, since only
 * a person tells. Never brain.dog, where the person is him. A model: `ANTHROPIC_API_KEY` in a fresh profile, else a profile already signed
 * in on this machine, named by `DOOR_CLAUDE_PROFILE`. A borrowed profile lends its sign-in and nothing else: its own
 * settings, hooks, plugins and MCP servers are left out (`--setting-sources project`, `--strict-mcp-config`), and the
 * hooks and the server are the ones `braindog setup` wrote into the check's own home, handed in as flags. The model is
 * the small one (`DOOR_MODEL`, default haiku) and every prompt is a line, so a night costs pennies. Without a model or
 * a sign-in every line reads "not run".
 */

import { existsSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

import { APP, PREFIX, installCli, lastLine, poster, rowsOf, scratchRepo, signIn, spokenOf, tool } from './runs-claude-code.check.mjs';
/** The longest one prompt may take, and the longest the bridge's pulse is waited for (it pulses every 15 s). */
const TURN_MS = 3 * 60_000;
const PULSE_WAIT_MS = 45_000;
const END_WAIT_MS = 20_000;
/** How long the run's answer is waited for once its turn is over, since its last call may land a moment after. */
const REPLY_WAIT_MS = 20_000;

const sleep = (ms, signal) => new Promise((done) => {
  const t = setTimeout(done, ms);
  signal?.addEventListener('abort', () => {
    clearTimeout(t);
    done();
  });
});

/** Waits until `ok()` answers something truthy, every half second, and answers it; `null` once `ms` has passed. */
export async function until(ok, ms, signal, every = 500) {
  const end = Date.now() + ms;
  for (;;) {
    const got = await ok();
    if (got) return got;
    if (Date.now() > end || signal?.aborted) return null;
    await sleep(every, signal);
  }
}

const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

/** The files the hooks keep for one session, as `apps/cli/src/inbox-file.ts` names them. */
export const sessionFiles = (configHome, id) => {
  const dir = join(configHome, 'braindog', 'sessions');
  const name = id.replace(/[^A-Za-z0-9_-]/gu, '_');
  return { inbox: join(dir, `${name}.inbox.json`), flags: join(dir, `${name}.inbox.flags`), state: join(dir, `${name}.hooks.json`) };
};

/* ── THE SCENARIO, apart from Claude Code so a test drives it with a fake session and a local record ── */

/**
 * `session` is the app: `prompt(text)` sends one prompt and answers that turn as `{ calls, said, result }` (each call
 * `{ name, ok, text }`), `close()` closes it, `id` and `version` say what it is. `owner(method, body)` is the record's
 * `/api/<method>` as its owner; `ask(name, args)` its `/mcp` as the agent; `files` the session's hook files (`inbox`,
 * `state`, read as JSON or null). `word` is a word no record holds. Answers one row a line.
 */
export async function instructionsScenario({ session, owner, ask, files, word, signal, pulseMs = PULSE_WAIT_MS, endMs = END_WAIT_MS, replyMs = REPLY_WAIT_MS }) {
  const rows = [];
  const version = () => session.version || '';
  const line = (step, ok, saw) => rows.push({ app: APP, version: version(), ok, saw: `${step}: ${saw}` });
  const must = async (name, args) => {
    const got = await ask(name, args);
    if (got.refused !== undefined) throw new Error(`the record refused ${name}: ${lastLine(got.refused).slice(0, 160)}`);
    return got.value;
  };
  const told = async (body) => {
    const got = await owner('instruct', body);
    if (got?.ok !== true) throw new Error(`the record refused instruct: ${got?.refusal?.fix ?? 'no answer'}`);
    return got.value;
  };
  const thread = async (id) => {
    const got = await owner('instructionList', { limit: 50 });
    return (got?.ok === true ? (got.value?.rows ?? []) : []).find((t) => t.id === id) ?? null;
  };

  /* THE START: the run the session opened, by its id. */
  await session.prompt('Call the context tool of braindog once, then say in one line which run it named.');
  const opened = rowsOf(await must('list', { register: 'session', where: { field: 'client_id', is: session.id }, limit: 10 }));
  const spoken = spokenOf(opened[0]);
  if (opened.length !== 1 || spoken === '') {
    line('start', false, `${opened.length} runs hold the session's id, and one should`);
    return rows;
  }

  /* PROMPT: said between two prompts, written by the pulse, added by the next prompt's hook, and acted on. */
  /* A LESSON, BECAUSE A NEW AGENT'S OTHER WRITES ASK (the ladder, `packages/record/src/ladder.ts`): a learning
     captured needs nobody, so it is a write the receipts can name, where a task would be a question waiting on him and
     the run would rightly answer Needs you. */
  const task = `Door check ${word}`;
  const tell = await told({
    said: `Add a lesson to the learnings list with the braindog create tool, saying "${task}", then answer this with the braindog instructions tool, reply set to its id and state done.`,
    to_run: spoken,
    when: 'now',
  });
  const pulsed = await until(() => (readJson(files.inbox)?.pending ?? []).some((t) => t.id === tell.id), pulseMs, signal);
  const turn = await session.prompt('Do what BrainDog told you in this session, using its tools, then say done in one word.');
  const shown = readJson(files.state)?.shown?.[tell.id] ?? null;
  const t1 = await until(async () => {
    const t = await thread(tell.id);
    return t && t.state !== 'sent' && t.state !== 'seen' && t.state !== 'working' ? t : null;
  }, replyMs, signal) ?? (await thread(tell.id));
  const ways = [...new Set((t1?.seen ?? []).map((s) => s.how))];
  const acted = turn.calls.some((c) => c.name === `${PREFIX}instructions` || c.name === `${PREFIX}create`);
  line(
    'prompt',
    Boolean(pulsed) && shown === 'prompt' && acted,
    [
      pulsed ? `${tell.id} reached the session's inbox file` : `${tell.id} never reached the inbox file in ${Math.round(pulseMs / 1000)}s`,
      shown === 'prompt' ? 'the prompt hook showed it' : `the prompt hook did not show it (${shown ?? 'not shown'})`,
      acted ? 'the run acted on it unprompted' : 'the run did not act on it',
      `the record saw it ${ways.join(' and ') || 'nowhere'}`,
    ].join(', '),
  );

  /* REPLY: done, its words, and the receipts naming the task it made and nothing else. */
  const names = (t1?.receipts?.batches ?? []).flatMap((b) => b.names ?? []);
  const changes = t1?.receipts?.changes ?? 0;
  const onlyOwn = names.length > 0 && names.every((n) => n.includes(word));
  const replied = t1?.state === 'done' && changes >= 1 && onlyOwn;
  /* WHY, WHEN IT DID NOT: what the record answered the run's create, in its words. */
  const made = turn.calls.find((c) => c.name === `${PREFIX}create`);
  line(
    'reply',
    replied,
    [
      t1 === null ? `${tell.id} is gone` : `${tell.id} reads ${t1.state}${t1.reply ? `, "${String(t1.reply).slice(0, 60)}"` : ', with no words'}`,
      changes >= 1 ? `${changes} change${changes === 1 ? '' : 's'}: ${names.join(', ')}` : 'no receipts',
      names.length > 0 && !onlyOwn ? 'the receipts name another row' : '',
      !replied && made ? `its create was answered "${lastLine(made.text).slice(0, 120)}"` : '',
    ].filter(Boolean).join(', '),
  );

  /* STOP: said while the run is working, between two tool calls, as a stop comes in a window: the first call runs,
     the stop lands, and the next call is denied in the record's words. No prompt comes between, so only the tool hook
     can stop it. */
  let stop = null;
  let held = null;
  const working = session.prompt(
    'Run two shell commands with the Bash tool, one after the other, waiting for the first to finish: first `ping -c 40 127.0.0.1`, then `echo door-check`. Then say done.',
    {
      onCall: (call) => {
        if (call.name !== 'Bash' || stop !== null) return;
        stop = told({ kind: 'stop', said: 'Stop here, the door check is over.', to_run: spoken }).then(async (i) => {
          held = await until(() => readJson(files.inbox)?.stop?.id === i.id, pulseMs, signal);
          return i;
        });
      },
    },
  );
  const denied = await working;
  await stop;
  const bashes = denied.calls.filter((c) => c.name === 'Bash');
  const after = bashes.slice(1);
  const refusedWith = after.find((c) => c.ok === false);
  const reason = String(refusedWith?.text ?? '');
  const said = /stopped this run in BrainDog/u.test(reason);
  line(
    'stop',
    Boolean(held) && refusedWith !== undefined && said && after.every((c) => c.ok === false),
    [
      stop === null ? 'the run called no tool, so no stop was said' : held ? 'the stop reached the inbox file while the first call ran' : `the stop never reached the inbox file in ${Math.round(pulseMs / 1000)}s`,
      after.length === 0
        ? 'no tool was called after it'
        : refusedWith
          ? `the next Bash call was denied${said ? ", in the record's words" : `: ${reason.slice(0, 80)}`}`
          : 'the next Bash call ran',
    ].join(', '),
  );

  /* END: the window closes, and the run reads Ended. */
  await session.close();
  const ended = await until(async () => {
    const r = rowsOf(await must('list', { register: 'session', where: { field: 'client_id', is: session.id }, limit: 10 }))[0];
    const state = r?.state ?? r?.fields?.state ?? '';
    return state === 'done' ? state : null;
  }, endMs, signal);
  const last = rowsOf(await must('list', { register: 'session', where: { field: 'client_id', is: session.id }, limit: 10 }))[0];
  line('end', ended === 'done', ended ? `${spoken} reads Ended once the session closed` : `${spoken} reads ${last?.state ?? last?.fields?.state ?? 'nothing'}, not Ended`);
  return rows;
}

/* ── PATHS A, B AND F, FOR A CLIENT WITH NO HOOKS, said to the record directly ── */

/** The app these rows are about: Codex has no hooks, and is not driven here. */
export const NO_HOOKS = 'codex (no hooks)';

/**
 * One `tools/call` over `/mcp` as a session of an agent with no hooks, answered whole: the text, and `_meta.braindog`
 * (`{ stamp, pending, stop }`) as the record put it on the answer. Its hints go in `_meta.session`, as an HTTP client
 * says them.
 */
export async function asSession(origin, bearer, session, name, args, { signal, fetcher = fetch } = {}) {
  const res = await fetcher(`${origin}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18', authorization: `Bearer ${bearer}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args, _meta: { session } } }),
    signal,
    redirect: 'error',
  });
  const raw = await res.text();
  const body = res.headers.get('content-type')?.includes('text/event-stream')
    ? raw
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim())
        .pop()
    : raw;
  const msg = JSON.parse(body ?? 'null');
  const result = msg?.result ?? {};
  return { text: (result.content ?? []).map((c) => c.text ?? '').join('\n'), meta: result._meta?.braindog ?? null, error: result.isError === true || Boolean(msg?.error) };
}

/**
 * What an agent with no hooks gets: A, what waits is said at its start; F, `instructions` with nothing
 * asked lists it; B, a tool answer carries what is new for it in `_meta.braindog` and a line in the text. `call` is
 * `asSession` bound to the host and the agent's key, `(session, name, args)`. One row a path.
 */
export async function pathsScenario({ call, owner, word }) {
  const rows = [];
  const line = (path, ok, saw) => rows.push({ app: NO_HOOKS, version: '', ok, saw: `${path}: ${saw}` });
  const told = async (body) => {
    const got = await owner('instruct', body);
    if (got?.ok !== true) throw new Error(`the record refused instruct: ${got?.refusal?.fix ?? 'no answer'}`);
    return got.value;
  };
  const session = { client_id: `door-${word}`, agent: 'codex', client: 'codex', host: 'door-check', cwd: `/door/${word}`, repo: word };

  /* A: SAID FOR THE NEXT CODEX TO START, and that run's first context says it. */
  const next = await told({ said: `Say the word ${word} in your first line.`, to: 'agent', to_agent: 'codex', when: 'next' });
  const first = await call(session, 'context', {});
  const at = first.text.indexOf(`(${next.id})`);
  line('A, start', at >= 0, at < 0 ? `the first context does not say ${next.id}: ${lastLine(first.text).slice(0, 100)}` : `the first context says ${next.id}, ${at < 400 ? 'near the top' : `${at} characters in`}`);

  /* F: ASKED, `instructions` lists what is for it. */
  const listed = await call(session, 'instructions', {});
  line(
    'F, asked',
    !listed.error && listed.text.includes(next.id),
    listed.error ? `instructions was refused: ${lastLine(listed.text).slice(0, 100)}` : listed.text.includes(next.id) ? `instructions lists ${next.id}` : `instructions does not list ${next.id}`,
  );

  /* B: SAID TO THE RUN WHILE IT WORKS, and its next answer of any tool carries it. */
  const runs = await call(session, 'list', { register: 'session', where: { field: 'client_id', is: session.client_id }, limit: 1, format: 'full' });
  let run = null;
  try {
    const v = JSON.parse(runs.text);
    run = spokenOf((Array.isArray(v) ? v : (v?.rows ?? []))[0]) || null;
  } catch {
    run = runs.text.match(/\bS[1-9]\d*\b/u)?.[0] ?? null;
  }
  if (run === null) {
    line('B, any answer', false, 'the session opened no run to say it to');
    return rows;
  }
  const now = await told({ said: `Also say ${word} twice.`, to_run: run, when: 'now' });
  const answer = await call(session, 'list', { register: 'session', limit: 1 });
  const pending = (answer.meta?.pending ?? []).map((t) => (typeof t === 'string' ? t : t?.id));
  const inText = answer.text.includes(now.id);
  line(
    'B, any answer',
    pending.includes(now.id) && inText,
    `${pending.includes(now.id) ? `_meta.braindog has ${now.id}` : `_meta.braindog has ${pending.join(', ') || 'nothing'}`}, ${inText ? 'and the answer says it' : 'and the answer does not say it'}`,
  );
  return rows;
}

/* ── THE REAL APP: one `claude -p` session over stream-json, its prompts on standard input ── */

/**
 * One Claude Code session kept open: `prompt(text)` answers the turn's calls and words once its `result` comes, and
 * `close()` ends standard input and waits for the process. `args` are the flags after `-p`.
 */
export function streamSession(bin, args, { env, cwd, signal }) {
  const child = spawn(bin, ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', ...args], { env, cwd, signal, stdio: ['pipe', 'pipe', 'pipe'] });
  const s = { id: null, version: '', stderr: '' };
  let turn = null;
  const byId = new Map();
  let closed = null;
  const done = new Promise((resolve) => child.on('close', (code) => resolve((closed = code ?? 1))));
  child.on('error', () => {});
  child.stderr.on('data', (b) => {
    if (s.stderr.length < 20_000) s.stderr += b;
  });
  createInterface({ input: child.stdout }).on('line', (raw) => {
    let e;
    try {
      e = JSON.parse(raw);
    } catch {
      return;
    }
    if (e.type === 'system' && e.subtype === 'init') {
      s.id ??= e.session_id ?? null;
      s.version = e.claude_code_version ?? s.version;
    }
    if (!turn) return;
    for (const c of e.type === 'assistant' ? (e.message?.content ?? []) : []) {
      if (c.type === 'tool_use') {
        const call = { name: c.name, input: c.input ?? {}, ok: null, text: '' };
        turn.calls.push(call);
        byId.set(c.id, call);
        turn.onCall?.(call);
      } else if (c.type === 'text' && c.text?.trim()) turn.said.push(c.text);
    }
    for (const c of e.type === 'user' ? (e.message?.content ?? []) : []) {
      const call = c.type === 'tool_result' ? byId.get(c.tool_use_id) : undefined;
      if (call) {
        call.ok = c.is_error !== true;
        call.text = typeof c.content === 'string' ? c.content : (c.content ?? []).map((x) => x.text ?? '').join('\n');
      }
    }
    if (e.type === 'result') {
      s.id ??= e.session_id ?? null;
      const t = turn;
      turn = null;
      t.result = e;
      t.resolve(t);
    }
  });
  const prompt = (text, { onCall } = {}) =>
    new Promise((resolve, reject) => {
      if (closed !== null) return reject(new Error(`Claude Code had already exited: ${lastLine(s.stderr) || `exit ${closed}`}`));
      const timer = setTimeout(() => reject(new Error(`Claude Code did not finish a turn in ${TURN_MS / 60_000} minutes`)), TURN_MS);
      turn = { calls: [], said: [], result: null, onCall, resolve: (t) => (clearTimeout(timer), resolve(t)) };
      done.then((code) => {
        if (turn) {
          clearTimeout(timer);
          reject(new Error(`Claude Code exited mid-turn: ${lastLine(s.stderr) || `exit ${code}`}`));
        }
      });
      child.stdin.write(`${JSON.stringify({ type: 'user', message: { role: 'user', content: text } })}\n`);
    });
  return Object.assign(s, {
    prompt: async (text, opts) => {
      const t = await prompt(text, opts);
      if (!s.id) throw new Error(`Claude Code started no session: ${lastLine(s.stderr) || 'no first event'}`);
      return t;
    },
    close: async () => {
      child.stdin.end();
      return done;
    },
  });
}

/**
 * Why the check cannot run here, or `null`. NEVER ON BRAIN.DOG: only a person tells a run, and the person there is him,
 * so the check would be telling his own agents things on his record. It runs against a seed host.
 */
export function notRun({ host, env = process.env }) {
  if (host === 'https://app.brain.dog' || host === 'https://brain.dog') return 'only he tells a run on app.brain.dog, so this runs against a seed host (seed-host.mjs)';
  if (!env.DOOR_SEED_KEY) return 'no key for the seed, DOOR_SEED_KEY: start it with seed-host.mjs';
  if (!env.ANTHROPIC_API_KEY && !env.DOOR_CLAUDE_PROFILE) return 'no key for the model, and no signed-in profile named by DOOR_CLAUDE_PROFILE';
  return null;
}

/**
 * The profile the session runs in and the flags that keep it to what setup wrote: the check's own fresh profile with
 * the model's key, or a borrowed signed-in one with its own settings and servers left out and setup's handed in.
 */
function profileFor(home, env) {
  const own = join(home, '.claude');
  if (env.ANTHROPIC_API_KEY || !env.DOOR_CLAUDE_PROFILE) return { config: own, flags: [] };
  const settings = readJson(join(own, 'settings.json')) ?? {};
  /* THE DEFAULT PROFILE'S SERVERS ARE KEPT BESIDE IT, in `~/.claude.json` (`serversFileOf` in `apps/cli/src/install.ts`). */
  const servers = (readJson(join(home, '.claude.json')) ?? readJson(join(own, '.claude.json')))?.mcpServers ?? {};
  if (!servers.braindog) throw new Error("braindog setup registered no braindog server in the check's profile");
  const mcp = join(home, 'door-mcp.json');
  writeFileSync(mcp, JSON.stringify({ mcpServers: { braindog: servers.braindog } }));
  const hooks = join(home, 'door-settings.json');
  writeFileSync(hooks, JSON.stringify({ hooks: settings.hooks ?? {} }));
  /* THE SIGN-IN IS IN THE LOGIN KEYCHAIN, which macOS finds under the home's Library: lent by a link, nothing copied. */
  const lib = join(homedir(), 'Library');
  if (process.platform === 'darwin' && existsSync(lib) && !existsSync(join(home, 'Library'))) symlinkSync(lib, join(home, 'Library'));
  return { config: env.DOOR_CLAUDE_PROFILE, flags: ['--setting-sources', 'project', '--settings', hooks, '--strict-mcp-config', '--mcp-config', mcp] };
}

export default async function instructions({ host, home, signal }) {
  const why = notRun({ host });
  if (why) return { app: APP, version: '', ok: null, saw: `${why}, for what he tells a run` };
  const origin = new URL(host).origin;
  /* THE SEED'S OWNER SPEAKS WITH ITS KEY: to make the agent's token, and to tell the run things. */
  const owner = poster(origin, process.env.DOOR_SEED_KEY, signal);
  const made = await owner('createToken', { scope: 'write', label: 'Door check agent' });
  if (made?.ok !== true || typeof made.value?.bearer !== 'string') throw new Error(`the seed made no key for the agent: ${made?.refusal?.fix ?? 'no answer'}`);

  await installCli(host, home, signal);
  const one = await signIn(home, host, [join(home, '.braindog', 'bin')], made.value.bearer, signal);
  const word = `door${Array.from({ length: 8 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('')}`;
  const folder = await scratchRepo(join(home, 'work', word), one.env, signal);
  const profile = profileFor(home, process.env);
  const env = { ...one.env, CLAUDE_CONFIG_DIR: profile.config, ...(process.env.ANTHROPIC_API_KEY ? { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY } : {}) };
  const allowed = [`${PREFIX}context`, `${PREFIX}instructions`, `${PREFIX}create`, `${PREFIX}schema`, 'Bash(ping -c 40 127.0.0.1)', 'Bash(echo door-check)'];
  /* `DOOR_DEBUG_FILE` KEEPS CLAUDE CODE'S OWN LOG of hooks and servers, for a person reading why a line failed. */
  const debug = process.env.DOOR_DEBUG_FILE ? ['--debug-file', process.env.DOOR_DEBUG_FILE] : [];
  const bin = process.env.DOOR_CLAUDE_BIN || 'claude';
  const session = streamSession(bin, ['--model', process.env.DOOR_MODEL || 'haiku', '--allowedTools', allowed.join(','), ...profile.flags, ...debug], { env, cwd: folder, signal });
  /* THE SESSION'S FILES BY ITS ID, which is known once its first event is read. */
  const config = join(home, '.config');
  const files = {
    get inbox() {
      return sessionFiles(config, session.id ?? '').inbox;
    },
    get state() {
      return sessionFiles(config, session.id ?? '').state;
    },
  };
  let rows;
  try {
    rows = await instructionsScenario({ session, owner, ask: (name, args) => tool(origin, one.bearer, name, args, { signal }), files, word, signal });
  } finally {
    await session.close().catch(() => {});
  }
  /* AND THE PATHS EVERY CLIENT GETS, as an agent with no hooks, through the same key: Codex is not driven here. */
  const call = (s, name, args) => asSession(origin, one.bearer, s, name, args, { signal });
  return [...rows, ...(await pathsScenario({ call, owner, word }))];
}
