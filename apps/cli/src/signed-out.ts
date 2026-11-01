/**
 * `braindog mcp` on a machine with no login: a server that starts, and answers every call with how to sign in.
 *
 * BEFORE THIS THE SERVER EXITED 1 BEFORE `initialize`. Measured with Claude Code 2.1.280 on a copy of a real
 * profile: with no host set, or a login past its expiry, `target` threw in `mcp`,
 * `/mcp` showed `braindog failed`, and the model had no BrainDog tool and so nothing to tell the person. The start hook's
 * one line reached a session's start and no further, and a session open since before the lapse got nothing at all.
 *
 * SO IT REFUSES THE WAY `UNREACHABLE` DOES (`surface.ts`): every tool stays listed, and each call answers a refusal the
 * model reads and passes on. `UNAUTHORIZED` is the code a host answers a missing or lapsed bearer with, so an agent
 * branching on the code does the same thing whichever of the two said it.
 *
 * ONLY FOR NO HOST AND A LAPSED LOGIN. An `http` host off this machine, a hosts file that is not JSON and an address
 * that does not parse are mistakes in a setup, not a machine waiting to be signed in, and they still stop the server
 * with their own sentence.
 */

import { CALL_TABLE } from '@braindog/client';
import type { McpSurface } from '@braindog/mcp';
import type { Result } from '@braindog/ports';

import { ANY_HOST, heldLogin, loginCommand } from './login.ts';
import type { Ctx } from './surface.ts';
import { saidDay } from './said-day.ts';

/**
 * The refusal's sentence when this machine is not signed in for the host `mcp` would reach, or `null` when it is (or
 * when the reason it cannot start is something else). Read the way `target` reads the file, through `heldLogin`.
 */
export function signedOutFix(flag: string | undefined, env: Record<string, string | undefined>, file: string, now: number = Date.now()): string | null {
  let held: { host: string | null; expires: string | null };
  try {
    held = heldLogin(flag, env, file);
  } catch {
    return null;
  }
  const after = 'in a terminal, then start a new session. Until then do not answer from memory, and say that BrainDog is not signed in.';
  if (held.host === null)
    return `This machine is not signed in to BrainDog, so nothing was read or written. Tell the person to run ${loginCommand(ANY_HOST)} with their own BrainDog's address in place of that one, ${after}`;
  if (held.expires !== null && Date.parse(held.expires) <= now)
    return `The login to ${held.host} expired on ${saidDay(held.expires)}, so nothing was read or written. Tell the person to run ${loginCommand(held.host)} ${after}`;
  return null;
}

/**
 * A surface whose every member refuses with `fix`.
 *
 * `Required`, SO THE COMPILER NAMES A MEMBER LEFT OUT. An optional method missing here would not refuse with the
 * sign-in sentence: its tool would answer its own "not in this build", which is a different instruction to the model
 * and the wrong one. `surface.ts` learned that about `recentHistory` and `actions` by shipping it.
 */
export function signedOutSurface(fix: string): McpSurface<Ctx> {
  const no = (): Promise<Result<never>> => Promise.resolve({ ok: false, refusal: { code: 'UNAUTHORIZED', fix, at: 'authorization' } });
  const surface: Required<McpSurface<Ctx>> = {
    boot: no,
    version: no,
    whoami: no,
    schema: no,
    get: no,
    list: no,
    search: no,
    history: no,
    governance: no,
    propose: no,
    create: no,
    update: no,
    pages: no,
    page: no,
    metric: no,
    digestToday: no,
    context: no,
    instructionsMine: no,
    handoff: no,
    meet: no,
    sessionsLive: no,
    recentHistory: no,
    actions: no,
    arrangement: no,
    automations: no,
    dryRun: no,
    scriptTry: no,
    previewPage: no,
    inbox: no,
    inboxPatterns: no,
    figures: no,
    offered: no,
    beat: no,
    triage: no,
    tryAutomation: no,
    previewChange: no,
    undoOwn: no,
    call: no,
    calls: () => CALL_TABLE,
    attachVisual: no,
    understandPlan: no,
    about: no,
    briefing: no,
    widgetGallery: no,
    exceptions: no,
    stale: no,
    learnings: no,
    withdraw: no,
    heard: no,
    doorHeard: no,
    /* ANSWERED ON THE MACHINE: its tool list asks nobody's settings. */
    moneyHidden: () => false,
    onMachine: true,
    /* THE DOOR'S OWN HOOKS, not tools: nothing is read signed out, so there is nothing to wall, name or count. */
    firewalled: () => undefined,
    listOf: () => null,
    toolSeen: () => undefined,
  };
  return surface;
}
