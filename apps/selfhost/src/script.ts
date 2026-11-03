/**
 * The self-host's sandbox for scripts: `@braindog/script`'s QuickJS runner, with this host's socket, name service and
 * keys.
 *
 * EVERYTHING ELSE IS `@braindog/host/script`, which the Worker will build its runner from too. This file passes in what
 * only a Node host has, the same three things `actionExecutor` passes the send loop for a `call`: `pinFor`, so a name
 * that resolves somewhere private is refused before a key is opened; `pinnedSend`, so the socket connects to the
 * address that was checked and to no other; and the key opener over this host's key store.
 *
 * WHY QUICKJS HERE AND NOT `node:vm`. Section 4 of the design has the table; the short form is that `node:vm` is not a
 * boundary and `isolated-vm` is a native build on every customer's machine. The runner is WebAssembly, the same bytes on
 * every OS, and a run gets a fresh instance with a hard memory maximum.
 *
 * NO REHEARSAL YET. `rehearseOnThisMachine` wraps `pin` and `send` inside `actionExecutor` and is not exported, so a
 * script cannot be rehearsed against a local `.test` server the way a `call` can. Until it is, a script aimed at a
 * rehearsal name is resolved by the system and fails as the network, which is the safe way round.
 */

import type { ScriptRunner } from '@braindog/kernel';
import type { Ledger } from '@braindog/host/actions';
import { grantNamed, scriptAsks, scriptProposals, scriptReads, scriptRunner, scriptState } from '@braindog/host/script';
import type { RecordApi } from '@braindog/record';
import { runInQuickJs } from '@braindog/script/quickjs';

import { pinFor, pinnedSend, systemResolve, type OpenKey, type Pinned, type Resolve, type Send } from './actions.ts';

/* ── the operator's switch ─────────────────────────────────────────────── */

/**
 * `BRAINDOG_OUTBOUND`: whether this server sends requests to other servers on a record's behalf. `off` unless the
 * operator says `on`, because a self-host that was never asked to call out should not (HD.306).
 *
 * WHAT IT GOVERNS: a scheduled action (`pull`, `call`, `poll`, a connector) and a script's `ctx.fetch`, which are the
 * requests an installed add-on makes. WHAT IT DOES NOT: the read of the public add-on registry, which is
 * `BRAINDOG_KENNEL`'s (`kennel.ts`), a webhook or mail the owner set up, and a shared file read at an
 * address somebody pasted. The two switches are named apart in `49 §5.24` so an operator never reads one as the other.
 *
 * `null` IS A VALUE THAT IS NEITHER, and `main.ts` refuses to start on it rather than guess which was meant.
 */
export function outboundOf(said: string | undefined): 'on' | 'off' | null {
  const value = (said ?? '').trim().toLowerCase();
  if (value === '' || value === 'off') return 'off';
  if (value === 'on') return 'on';
  return null;
}

/** What a held action or script says while the switch is off. It names the switch and no key, address or file. */
export const OUTBOUND_OFF = 'This server does not send requests. Its operator can switch that on.';

/**
 * How long a held run waits before it is offered again: a day. A held run moves its schedule to `until` and writes one
 * event, so an hour would fill the record's history and its usage with a held run every hour for each add-on. The cost
 * is that an operator who switches it on sees each action run at its next turn, inside the day.
 */
export const OUTBOUND_HELD_MS = 86_400_000;

/**
 * The ledger's question, answered "held" for every action while the switch is off. `holding` and `holdingPaged` ask it
 * before anything is resolved, opened or sent, so a held run sends nothing and its event carries `OUTBOUND_OFF`.
 */
export const outboundHeld =
  (now: () => number = Date.now): Ledger['mayRun'] =>
  () => ({ until: now() + OUTBOUND_HELD_MS, say: OUTBOUND_OFF });

/**
 * The runner `runActions` is handed as its `script` option on this host. `send` and `resolve` are for tests; the
 * defaults are the pinned socket and the system's name service, as for the executor.
 *
 * `outbound: 'off'` HOLDS A RUN THAT FETCHES, AND ONLY ONE THAT FETCHES. A script that reads the record and writes back
 * needs no other server and runs as before. One that calls `ctx.fetch` is told `OUTBOUND_OFF` inside the sandbox, so it
 * stops where it would have sent, and the run comes back `held` with that sentence: nothing it wrote is applied, its
 * schedule moves on by `OUTBOUND_HELD_MS`, and the event says why. Nothing is resolved and nothing is sent.
 */
export function scriptSandbox(
  api: Pick<RecordApi, 'kernel' | 'list' | 'get'>,
  options: {
    openKey: OpenKey;
    send?: Send | undefined;
    resolve?: Resolve | undefined;
    now?: (() => number) | undefined;
    /** The sandbox's meter clock (`CtxHost.clock`). Absent is the machine's; a test that is not about limits hands one that stands still. */
    clock?: (() => number) | undefined;
    outbound?: 'on' | 'off' | undefined;
    /** Slash's answer to a question, where this host has a model (`slashAnswersFor`): what `ctx.ask` asks through. */
    answers?: ((ask: { run: string; rule: string; step: number; question: string; shape: 'text' }) => Promise<unknown>) | undefined;
  },
): ScriptRunner {
  const sandboxed: typeof runInQuickJs = (decl, host) => runInQuickJs(decl, options.clock === undefined ? host : { ...host, clock: options.clock });
  const runner = (run: typeof runInQuickJs): ScriptRunner =>
    scriptRunner<Pinned>({
      run,
      send: options.send ?? pinnedSend,
      pin: pinFor(options.resolve ?? systemResolve),
      openKey: options.openKey,
      grantOf: grantNamed(() => api.kernel.grants()),
      reads: scriptReads(api),
      /* `ctx.propose`: a question with rows, tried against the gate now and filed with the run's writes. */
      propose: scriptProposals(api),
      /* `ctx.notify` and `ctx.store`, queued and applied with the run's writes; `ctx.ask`, on the record's allowance. */
      state: scriptState(api),
      ask: scriptAsks(options.answers),
      now: options.now,
    });
  if (options.outbound !== 'off') return runner(sandboxed);
  const now = options.now ?? Date.now;
  return async (s) => {
    /* ONE FLAG A RUN, so a held fetch in one run never holds the next. */
    let asked = false;
    const answer = await runner((decl, host) =>
      sandboxed(decl, {
        ...host,
        fetch: async () => {
          asked = true;
          throw new Error(OUTBOUND_OFF);
        },
      }),
    )(s);
    return asked ? { held: { until: now() + OUTBOUND_HELD_MS, say: OUTBOUND_OFF } } : answer;
  };
}
