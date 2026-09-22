/**
 * The self-host's sandbox for scripts: `@braindog/script`'s QuickJS runner, with this host's socket, name service and
 * keys (`loop/research-shell-scripts.md` Brief 4, DIRECTION 22).
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
import { grantNamed, scriptRunner } from '@braindog/host/script';
import type { RecordApi } from '@braindog/record';
import { runInQuickJs } from '@braindog/script/quickjs';

import { pinFor, pinnedSend, systemResolve, type OpenKey, type Pinned, type Resolve, type Send } from './actions.ts';

/**
 * The runner `runActions` is handed as its `script` option on this host. `send` and `resolve` are for tests; the
 * defaults are the pinned socket and the system's name service, as for the executor.
 */
export function scriptSandbox(
  api: Pick<RecordApi, 'kernel'>,
  options: { openKey: OpenKey; send?: Send | undefined; resolve?: Resolve | undefined; now?: (() => number) | undefined },
): ScriptRunner {
  return scriptRunner<Pinned>({
    run: runInQuickJs,
    send: options.send ?? pinnedSend,
    pin: pinFor(options.resolve ?? systemResolve),
    openKey: options.openKey,
    grantOf: grantNamed(() => api.kernel.grants()),
    now: options.now,
  });
}
