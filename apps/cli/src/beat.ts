/**
 * `braindog hook beat`, which Claude Code runs after every tool call (AGT-B10 job 5, AGT-C03 step 5).
 *
 * LAST SEEN MOVED ONLY WHEN A RUN WROTE, so a session that read, thought or edited files for forty minutes read Quiet
 * on the Agents page while it worked. The record now takes a beat (`beat`, AGT-C03): one statement that moves the run's
 * last seen, opens nothing, revives nothing and adds no line to its history. This sends it, for the session this hook
 * runs in, the way the end hook sends `end` (`hookEnd`).
 *
 * CHEAP FIRST, BECAUSE IT RUNS AFTER EVERY TOOL CALL. Its first act is to read the age of one file under
 * `~/.braindog/beats/`, the session's own, and it stops there unless five minutes have passed. The hook scripts read the
 * same file before Node starts at all (`hooks/braindog-hook.sh`, `.ps1`), so a tool call inside the five minutes costs a
 * shell and no Node. Five minutes against the fifteen a run reads Working for (`WORKING_MS`) is three beats a window.
 *
 * ONE REQUEST, TWO SECONDS, AND NOTHING EVER THROWN: a hook's non-zero exit is how a hook stops a session, and a beat
 * that did not land costs one stale minute, never a tool call. Nothing is printed: after a tool call, Claude Code shows
 * a hook's output to nobody who needs it.
 *
 * THE EVENT'S `transcript_path` IS NEVER READ. The event is read for its session and folder alone (`eventOf`), and
 * `tools/gates/no-transcript.mjs` is red on any line here that names it.
 */

import { mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import { join } from 'node:path';

import { refused } from '@braindog/ports';

import { eventOf, readSession, REMEMBER_MS, sessionPath, type Io } from './hooks.ts';
import { budgetOf, clientFor, hostsPath, target } from './http.ts';
import { sessionHeaders, type Position } from './position.ts';

/** How often a session's beat reaches the record at most. The scripts' `find -mmin -5` and `AddMinutes(-5)` say the same. */
export const BEAT_EVERY_MS = 5 * 60_000;
/** The whole of one beat's time on the network. */
export const BEAT_MS = 2_000;

/** What one run of the hook did, for its tests: nothing at all is printed. `refused` is the host's no, `failed` no answer. */
export type Beat = 'fresh' | 'signed out' | 'no run' | 'sent' | 'refused' | 'failed';

/**
 * The session's stamp: its id with every character but a letter, digit, `_` and `-` made `_`, so no id names a path, and
 * `-` for an event with none. The scripts make the same name from the same id.
 */
export const beatStamp = (home: string, id: string | undefined): string =>
  join(home, '.braindog', 'beats', id === undefined ? '-' : id.replace(/[^A-Za-z0-9_-]/gu, '_'));

/** Whether the stamp was written inside the last five minutes. A stamp that cannot be read is an old one. */
export function beatFresh(stamp: string, now: number = Date.now()): boolean {
  try {
    return now - statSync(stamp).mtimeMs < BEAT_EVERY_MS;
  } catch {
    return false;
  }
}

/* Stamps of sessions not heard from in twelve hours, the time a session file is remembered, so the folder stays small. */
function prune(dir: string, now: number): void {
  try {
    for (const name of readdirSync(dir)) {
      const file = join(dir, name);
      if (now - statSync(file).mtimeMs > REMEMBER_MS) unlinkSync(file);
    }
  } catch {
    /* A stamp left behind is a few bytes. */
  }
}

export async function hookBeat(io: Io, now: number = Date.now()): Promise<Beat> {
  try {
    const event = eventOf(io.stdin, io.cwd);
    const stamp = beatStamp(io.home ?? homedir(), event.client_id);
    if (beatFresh(stamp, now)) return 'fresh';

    /* THE STAMP BEFORE ANYTHING ELSE, so the tool calls made while a request is in flight stop at the stamp, a host that
       is down is asked again in five minutes rather than on every call, and a machine signed out or a session with no
       run starts Node once in five minutes, not after every tool call. */
    const beats = join(io.home ?? homedir(), '.braindog', 'beats');
    try {
      mkdirSync(beats, { recursive: true, mode: 0o700 });
      writeFileSync(stamp, new Date(now).toISOString());
    } catch {
      /* A folder that cannot be written costs a Node start per tool call while it stays so, and nothing else. */
    }
    prune(beats, now);

    const hosts = hostsPath(io.env);
    let to;
    try {
      to = target(undefined, io.env, hosts);
    } catch {
      return 'signed out';
    }
    if (!to.token) return 'signed out';

    /* THE RUN THE START HOOK ATTACHED, from the session's own file or the folder's, as the end hook finds it. */
    const id = event.client_id ?? null;
    const held = readSession(sessionPath(io.env, event.cwd, id)) ?? readSession(sessionPath(io.env, event.cwd));
    if (!held || held.host !== to.key) return 'no run';
    if (event.client_id !== undefined && held.client_id !== undefined && event.client_id !== held.client_id) return 'no run';

    /* NO GIT: a beat names its run by the spoken id the start hook kept, and the record places nothing on a beat. */
    const at: Position = { cwd: event.cwd, repo: held.repo ?? null, remote: held.remote ?? null, host: hostname(), branch: null, head: null };
    const run = { spoken: held.spoken, client_id: event.client_id ?? held.client_id };
    const client = clientFor(to, async () => sessionHeaders(at, 'claude', run, { env: io.env }), AbortSignal.timeout(Math.min(BEAT_MS, budgetOf(io.env))));
    const out = await client.call('beat');
    /* `UNREACHABLE` is the client's word for no answer at all, the two seconds spent or the host down. */
    return out.ok ? 'sent' : refused(out) && out.refusal.code !== 'UNREACHABLE' ? 'refused' : 'failed';
  } catch {
    return 'failed';
  }
}
