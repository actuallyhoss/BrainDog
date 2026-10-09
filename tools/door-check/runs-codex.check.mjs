/**
 * CODEX ON RUNS, EVERY LINE READ BACK FROM THE RECORD (AGT-C01 job c, `loop/scope/area-agents-c.md`).
 *
 * Claude Code has hooks and says its session's id; Codex and Cursor say neither. Each starts the command as its MCP
 * server, `braindog mcp --agent codex` (the docs' "As a process"), which tells the record the agent's kind, the app's
 * own name from its hello, and the folder it works in, and nothing else. So the run rules they lean on are the ladder's
 * fourth rung (`packages/kernel/src/session.ts`, `findSession`), and this check holds them with the real app:
 *
 *   first    a run opens at the first write, and that run signs it;
 *   agent    the run reads as that agent, Codex here and Cursor in `runs-cursor.check.mjs`, never as "other";
 *   again    a second session in the same folder inside 45 minutes is found again: its write is signed by the same run;
 *   after    after 45 quiet minutes a new run opens. A night allows a check twenty minutes, so on a real record this
 *            line reads "not run" and says why; the tests age the run on a local record and hold the rule there.
 *
 * Each step is one fresh process of the app, told to call `log` once with a note only this night writes. The note is
 * found on the project's history, and the line's run is the one that signed it: the record says, never the app.
 *
 * WHAT IT NEEDS, as the Claude Code checks: the app's own key (`OPENAI_API_KEY` here, `CURSOR_API_KEY` for Cursor),
 * else the row reads "not run: no key" and the night exits 0. A sign-in for the record, `DOOR_TOKEN`, else six digits a
 * person approves (in CI, "not run"). No key is written into any file: the app's config names the command, and the
 * record's key reaches it through the environment the app hands its server.
 *
 * HELD APART FROM THE APP so `runs-cursor.check.mjs` is the same scenario with another client, and the tests drive it
 * with a fake one: `clientRuns` (the scenario) and `clientCheck` (a check from an app's pin and its two moves).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { addressOf, cutter, envOf, freshWord, lastLine, poster, projectFor, reader, run, scratchRepo, signIn, spokenOf, tool } from './runs-claude-code.check.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const PIN = JSON.parse(readFileSync(join(HERE, 'versions', 'codex.json'), 'utf8'));
/** How long one session of the app may take: start, connect, two calls and a sentence. */
export const SESSION_MS = 4 * 60_000;
const INSTALL_MS = 5 * 60_000;

/* ── THE SCENARIO, one fresh process of the app a step ─────────────────────── */

/** The run that signed a note on a row's history, by its spoken id, or `''` when nobody did. */
const signerOf = async (r, spoken, note) => (await r.history(spoken)).find((e) => String(e.note ?? '').includes(note))?.actor ?? '';
/** When the record made a run, by the record's own clock, so a machine's clock never decides which run is new. */
const madeOf = (row) => String(row?.fields?.started ?? row?.created_at ?? '');

/**
 * The scenario. `client.write(spoken, note)` runs one fresh session of the app that logs `note` on `spoken` and answers
 * `{ version, failed }`. `kind` is the record's word for the agent (`codex`), `called` what a person calls it (`Codex`).
 * `project` is what `projectFor` answered. `age(spoken)`, when there is one, makes the run 46 minutes quiet; without it
 * the last line reads "not run". Answers one row a line, `ok: null` for a line that could not run.
 */
export async function clientRuns({ client, r, project, kind, called, app, version: said = '', age }) {
  const rows = [];
  let version = said;
  const line = (step, ok, saw) => rows.push({ app, version, ok, saw: `${step}: ${saw}` });
  if (project.refused) {
    line('first write', project.asked ? null : false, project.refused);
    return rows;
  }
  const where = project.spoken;
  const floor = madeOf(await r.get(where));
  const step = async (n) => {
    const note = `Door check: ${called} write ${n} ${freshWord()}`;
    const s = await client.write(where, note);
    version = s.version || version;
    const signer = await signerOf(r, where, note);
    const run = signer ? await r.get(signer).catch(() => null) : null;
    return { s, signer, run };
  };
  const why = (s) => (s.failed ? `, ${called} said: ${s.failed}` : '');

  /* FIRST: one run, made after the folder's project, signs the first write. */
  const one = await step(1);
  if (!one.run) {
    line('first write', false, `no run signed the note${one.signer ? ` (signed "${one.signer}")` : ''}${why(one.s)}`);
    line('the rest', false, 'not reached, because the first write was signed by no run');
    return rows;
  }
  const spoken = spokenOf(one.run) || one.signer;
  const fresh = madeOf(one.run) >= floor;
  line('first write', fresh, fresh ? `${spoken} opened and signed it` : `signed by ${spoken}, a run older than the night's project`);

  /* AGENT: the kind the record holds, never "other", and the name a person reads. */
  const f = one.run.fields ?? {};
  const doing = String(f.doing ?? '');
  const ok = f.agent === kind;
  line('agent', ok, `${spoken} reads as ${f.agent ? `"${f.agent}"` : 'no agent'}${ok ? '' : `, not "${kind}"`}, called "${doing}"${f.client ? `, app "${f.client}${f.client_version ? ` ${f.client_version}` : ''}"` : ''}`);

  /* AGAIN: a second session inside 45 minutes is the same run. */
  const two = await step(2);
  const twoAs = two.run ? spokenOf(two.run) || two.signer : '';
  line('found again', twoAs === spoken, twoAs === spoken ? `the second session's write is signed by ${spoken}` : twoAs ? `the second session opened ${twoAs}, where ${spoken} was not 45 minutes quiet` : `no run signed the second note${why(two.s)}`);

  /* AFTER: 45 quiet minutes, then a run of its own. */
  if (!age) {
    line('after 45 minutes', null, 'a night gives a check twenty minutes, so the run cannot go 45 minutes quiet here; the tests hold it on a local record');
    return rows;
  }
  await age(spoken);
  const three = await step(3);
  const threeAs = three.run ? spokenOf(three.run) || three.signer : '';
  const opened = threeAs !== '' && threeAs !== spoken && madeOf(three.run) >= madeOf(two.run ?? one.run);
  line('after 45 minutes', opened, opened ? `a new run, ${threeAs}, signs the write` : threeAs === spoken ? `${spoken} was found again after 45 quiet minutes` : `no run signed the third note${why(three.s)}`);
  return rows;
}

/* ── THE REAL APP, the same plumbing for Codex and Cursor ──────────────────── */

/** Why a client's check cannot run here, or `null`: no key for the app, no record, or in CI no key for the record. */
export function notRunFor(key, { record, env = process.env }) {
  if (!env[key]) return 'no key';
  if (!record) return 'no record, pass --record';
  if (env.CI && !env.DOOR_TOKEN) return 'no key for the record, and no one here to approve six digits';
  return null;
}

/** An environment with no key in it: no model's, no app's and no record's. */
export function keyless(env) {
  const out = {};
  for (const [name, value] of Object.entries(env)) if (!/^(ANTHROPIC_API_KEY|OPENAI_API_KEY|CODEX_API_KEY|CURSOR_API_KEY|BRAINDOG_TOKEN|BRAINDOG_HOST|DOOR_TOKEN.*)$/.test(name)) out[name] = value;
  return out;
}

/**
 * The command, as a stranger installs it, with no key in the script's environment: the runs check's own `installCli` leaves
 * Codex's and Cursor's keys in, and the script is the host's.
 */
async function installCli(host, home, signal) {
  const plain = keyless(envOf(home, host, [], undefined));
  const got = await run('sh', ['-c', 'curl -fsSL "$DOOR_INSTALL" | sh'], { env: { ...plain, DOOR_INSTALL: `${host}/cli/install.sh` }, cwd: home, signal, ms: INSTALL_MS });
  if (got.code !== 0 || !existsSync(join(home, '.braindog', 'bin', 'braindog'))) throw new Error(`install failed: ${lastLine(got.err || got.out)}`);
}

/** The words an app printed that say why it stopped, its last line or its exit code. */
export const stopped = (got) => (got.code === 0 ? '' : lastLine(got.err || got.out).slice(0, 160) || `exit ${got.code}`);

/**
 * A check from an app: its pin (`versions/<app>.json`), the name of its key, the record's word for it and what a person
 * calls it, and four moves: `install(pin, root, env, signal)` answers the folder its command is in; `configure(home,
 * braindog)` registers `braindog mcp --agent <kind>` the way the app's own config does; `write(bin, env, folder,
 * prompt, signal)` runs one session and answers `{ version, failed }`; `version(bin, env, signal)` reads its version.
 */
export function clientCheck({ pin, key, kind, called, install, configure, write, version: versionOf }) {
  return async (ctx) => {
    const homes = [ctx.home];
    const cut = cutter(homes);
    try {
      return JSON.parse(cut(JSON.stringify(await real(ctx))));
    } catch (error) {
      throw new Error(cut(error instanceof Error ? error.message : error));
    }
  };

  async function real({ host, record, home, signal }) {
    const why = notRunFor(key, { record });
    if (why) return { app: pin.app, version: pin.pinned, ok: null, saw: why };
    const address = addressOf(host, record);
    const origin = new URL(address).origin;

    await installCli(host, home, signal);
    const braindog = join(home, '.braindog', 'bin', 'braindog');
    const plain = keyless(envOf(home, address, [], undefined));
    mkdirSync(join(home, 'apps'), { recursive: true });
    const bin = await install(pin, join(home, 'apps'), plain, signal);
    const one = await signIn(home, address, [join(home, '.braindog', 'bin'), bin], process.env.DOOR_TOKEN, signal);
    configure(home, braindog);
    /* THE APP'S KEY GOES TO THE APP'S OWN PROCESS AND NO OTHER, and no other app's key goes with it. The record's key is
       the sign-in's, `BRAINDOG_TOKEN`, which the app hands its server. */
    const env = { ...keyless(one.env), BRAINDOG_TOKEN: one.env.BRAINDOG_TOKEN, BRAINDOG_HOST: one.env.BRAINDOG_HOST, [key]: process.env[key] };
    for (const name of ['BRAINDOG_TOKEN', 'BRAINDOG_HOST']) if (env[name] === undefined) delete env[name];

    const word = freshWord();
    const folder = await scratchRepo(join(home, 'work', word), plain, signal);
    const r = reader((name, args, at) => tool(origin, one.bearer, name, args, { session: at, signal }), poster(origin, one.bearer, signal));
    const project = await projectFor(r, folder, `Door check ${called} ${word}`, `door-check-${word}`);
    const client = { write: (spoken, note) => write(bin, env, folder, `Call the log tool of braindog once, with spoken "${spoken}" and the note "${note}". Then stop.`, signal) };
    const version = (await versionOf(bin, env, signal)) || pin.pinned;
    return clientRuns({ client, r, project, kind, called, app: pin.app, version });
  }
}

/* ── CODEX ─────────────────────────────────────────────────────────────────── */

/** What `codex exec --json` printed: each MCP call it made, by tool, and whether it ended well, and the error it said. */
export function readCodex(out) {
  const calls = [];
  let error = '';
  for (const text of String(out).split('\n')) {
    let e;
    try {
      e = JSON.parse(text);
    } catch {
      continue;
    }
    const item = e?.item;
    if (e?.type === 'item.completed' && item?.type === 'mcp_tool_call') calls.push({ server: item.server, tool: item.tool, ok: item.status === 'completed' && !item.error });
    if (e?.type === 'error' || e?.type === 'turn.failed') error = String(e.message ?? e.error?.message ?? 'failed');
  }
  return { calls, error };
}

/** One `codex exec` in the folder, with the config the check wrote and the key in its environment. */
async function codexWrite(bin, env, folder, prompt, signal) {
  const got = await run(join(bin, 'codex'), [...PIN.exec, prompt], { env: { ...env, CODEX_HOME: join(env.HOME, '.codex'), CODEX_API_KEY: env.OPENAI_API_KEY }, cwd: folder, signal, ms: SESSION_MS });
  const s = readCodex(got.out);
  const logged = s.calls.some((c) => c.server === 'braindog' && c.tool === 'log' && c.ok);
  return { version: '', failed: logged ? '' : s.error || stopped(got) || `it made ${s.calls.length} calls to braindog and no log` };
}

/** Codex at its pin, from npm, under `root`. */
async function codexInstall(pin, root, env, signal) {
  const prefix = join(root, `codex-${pin.pinned}`);
  const got = await run('npm', ['install', '--prefix', prefix, '--no-save', '--no-audit', '--no-fund', `${pin.package}@${pin.pinned}`], { env, cwd: root, signal, ms: INSTALL_MS });
  const bin = join(prefix, 'node_modules', '.bin');
  if (got.code !== 0) throw new Error(`Codex ${pin.pinned} did not install: ${lastLine(got.err || got.out)}`);
  return bin;
}

/**
 * Codex's own config, `$CODEX_HOME/config.toml`, naming the command as its server, as `codex mcp add braindog --
 * braindog mcp --agent codex` writes it, and `env_vars`, which lets the record's key through from Codex's environment
 * by name. Codex hands a server only a short list of its variables otherwise.
 */
function codexConfigure(home, braindog) {
  const dir = join(home, '.codex');
  mkdirSync(dir, { recursive: true });
  const toml = ['[mcp_servers.braindog]', `command = ${JSON.stringify(braindog)}`, 'args = ["mcp", "--agent", "codex"]', 'env_vars = ["BRAINDOG_TOKEN", "BRAINDOG_HOST", "XDG_CONFIG_HOME"]', ''];
  writeFileSync(join(dir, 'config.toml'), toml.join('\n'));
}

const codexVersion = async (bin, env, signal) => (await run(join(bin, 'codex'), ['--version'], { env, signal, ms: 30_000 })).out.trim().split(/\s+/).pop() || '';

export default clientCheck({
  pin: PIN,
  key: 'OPENAI_API_KEY',
  kind: 'codex',
  called: 'Codex',
  install: codexInstall,
  configure: codexConfigure,
  write: codexWrite,
  version: (bin, env, signal) => codexVersion(bin, { ...env, CODEX_HOME: join(env.HOME, '.codex') }, signal),
});
