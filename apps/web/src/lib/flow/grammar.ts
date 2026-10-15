/**
 * The automation grammar, as the record answers it: which triggers and steps there are, what each takes, and the
 * ceilings a body is held to.
 *
 * ONE DEFINITION, TWO EDITORS (D22.51). The canvas copied the kernel's tables by hand, and the copy drifted: it had no
 * `meet` and no `run_job`, so a rule an agent wrote with either opened with a card that said nothing. The kernel builds
 * `flowGrammar()` from `flow-lint.ts`'s own tables, the record answers it as a read, and this file holds that answer
 * for the tab. `flow.ts` works over what is held here; nothing under `lib/flow` lists the steps again.
 *
 * READ ONCE PER TAB. The grammar is the build's, not the record's rows, so it does not change while a tab is open, and
 * every card, the menu and the inspector read the one answer.
 *
 * NO COMPILED FALLBACK. A record older than the app answers no such method; the editor then says so in one line and
 * offers no steps, because a second list kept for that case is the copy that drifted.
 *
 * PURE APART FROM THE ONE SLOT, so `node --test` imports it: the components subscribe to `grammarState`, which keeps
 * Svelte's store contract without importing Svelte.
 */

import { apiBase } from '../at.ts';

/** What a picked argument is picked from. A stored id of one of these is never printed: its name is. */
export type ArgFrom = 'list' | 'field' | 'person' | 'call' | 'script' | 'door' | 'figure' | 'job';

/**
 * One argument of a trigger or a step. `name` IS ITS PATH UNDER THE VERB'S KEY, dotted (`to.register` for `link`), and
 * the verb's own name for a step whose value is the argument itself (`{ tag: 'paid' }`, `{ wait: '2h' }`).
 */
export type GrammarArg = { name: string; type: string; required: boolean; from?: ArgFrom | string };
export type GrammarTrigger = { id: string; args: readonly GrammarArg[] };
/** `group` is the kernel's: an action a rule had before steps, or a verb only a step has. `once` needs `once_per` on a row's trigger. */
export type GrammarStep = { verb: string; group: 'action' | 'flow' | string; row: boolean; once: boolean; args: readonly GrammarArg[] };
export type Ceilings = { steps: number; depth: number; runsPerDay: number; vars: number };
export type FlowGrammar = { triggers: readonly GrammarTrigger[]; steps: readonly GrammarStep[]; ceilings: Ceilings };

/** The one line an editor reads over a record that has no `flowGrammar`. */
export const OLDER = 'This record is older than the app, so its automations open read only.';
/** The line when the read could not be made at all, which is not the same fact and is asked again on the next open. */
export const UNREAD = 'BrainDog could not read how automations are written on this record, so this one opens read only.';

export type GrammarState =
  | { state: 'loading' }
  | { state: 'ready'; grammar: FlowGrammar }
  /* `older` IS FOR GOOD IN THIS TAB: the build answered that it has no such method. `unread` is a failed read. */
  | { state: 'older'; say: string }
  | { state: 'unread'; say: string };

/** The client's generic door, as `@braindog/client` exposes it. Only `call` is needed, so a test hands in a fake. */
export type GrammarCall = (name: string, args?: Record<string, unknown>) => Promise<unknown>;

const isObject = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);
const isCount = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0;

function argOf(x: unknown): GrammarArg | null {
  if (!isObject(x) || typeof x.name !== 'string' || typeof x.type !== 'string') return null;
  return { name: x.name, type: x.type, required: x.required === true, ...(typeof x.from === 'string' ? { from: x.from } : {}) };
}

const argsOf = (x: unknown): GrammarArg[] => (Array.isArray(x) ? x.map(argOf).filter((a): a is GrammarArg => a !== null) : []);

/**
 * The record's answer read as a grammar, or `null` when it is not one. THE SHAPE IS CHECKED, as the client checks a
 * body: a grammar with no steps or no ceilings would draw an empty menu with no sentence saying why.
 */
export function grammarOf(value: unknown): FlowGrammar | null {
  if (!isObject(value) || !Array.isArray(value.steps) || !Array.isArray(value.triggers) || !isObject(value.ceilings)) return null;
  const c = value.ceilings;
  if (!isCount(c.steps) || !isCount(c.depth) || !isCount(c.runsPerDay) || !isCount(c.vars)) return null;
  const steps = value.steps.flatMap((s): GrammarStep[] =>
    isObject(s) && typeof s.verb === 'string' && s.verb !== ''
      ? [{ verb: s.verb, group: typeof s.group === 'string' ? s.group : 'flow', row: s.row === true, once: s.once === true, args: argsOf(s.args) }]
      : [],
  );
  const triggers = value.triggers.flatMap((t): GrammarTrigger[] => (isObject(t) && typeof t.id === 'string' && t.id !== '' ? [{ id: t.id, args: argsOf(t.args) }] : []));
  if (steps.length === 0) return null;
  return { triggers, steps, ceilings: { steps: c.steps, depth: c.depth, runsPerDay: c.runsPerDay, vars: c.vars } };
}

/** The codes by which a host says it has no such call: an older host, and one built over a record without the method. */
const MISSING = new Set(['ROUTE_UNKNOWN', 'NOT_IN_THIS_BUILD', 'METHOD_UNKNOWN', 'NO_SUCH_CALL']);

/**
 * One answer of `call('flowGrammar')` as a state. A refusal at another place (`NOT_IN_THIS_BUILD` at a field) is a
 * failed read like any other, not an older record.
 */
export function stateOf(out: unknown): GrammarState {
  if (isObject(out) && out.ok === true) {
    const grammar = grammarOf(out.value);
    return grammar ? { state: 'ready', grammar } : { state: 'unread', say: UNREAD };
  }
  const refusal = isObject(out) && isObject(out.refusal) ? out.refusal : null;
  const code = typeof refusal?.code === 'string' ? refusal.code : '';
  const at = typeof refusal?.at === 'string' ? refusal.at : undefined;
  if (MISSING.has(code) && (at === undefined || at === 'flowGrammar')) return { state: 'older', say: OLDER };
  return { state: 'unread', say: UNREAD };
}

/* ── the one slot, for the tab ──────────────────────────────────────────────── */

let current: GrammarState = { state: 'loading' };
let asked: Promise<GrammarState> | null = null;
const listeners = new Set<(s: GrammarState) => void>();

function put(next: GrammarState): GrammarState {
  current = next;
  for (const fn of listeners) fn(next);
  return next;
}

/** The grammar this tab holds, or `null` while it is read, and for good over an older record. */
export const held = (): FlowGrammar | null => (current.state === 'ready' ? current.grammar : null);

/** Where the tab's read stands. */
export const grammarNow = (): GrammarState => current;

/** The state as a store a component reads with `$grammarState`, by Svelte's contract: called at once, then on each change. */
export const grammarState = {
  subscribe(fn: (s: GrammarState) => void): () => void {
    listeners.add(fn);
    fn(current);
    return () => listeners.delete(fn);
  },
};

/* THE CLIENT IS FETCHED WITH THE FIRST READ, not imported, so this file stays one a test imports without the host's
   routes, and the editor's chunk pays for it only when a card or the menu first asks. */
const defaultCall: GrammarCall = async (name, args) => {
  const { createClient } = await import('@braindog/client');
  return createClient({ base: apiBase() }).call(name, args ?? {});
};

/** The client's `NoSuchCall`, known by its name as `isNoSuchCall` knows it, so two copies of the package agree. */
const isNoSuchCall = (e: unknown): boolean => e instanceof Error && e.name === 'NO_SUCH_CALL';

/**
 * Read the grammar, once for the tab. A second caller is handed the first one's answer, in flight or done. A failed
 * read is forgotten so the next open asks again; an older record is not, since asking again cannot change the build.
 */
export function loadGrammar(call?: GrammarCall): Promise<GrammarState> {
  if (current.state === 'ready' || current.state === 'older') return Promise.resolve(current);
  if (asked) return asked;
  const door = call ?? defaultCall;
  asked = (async () => {
    let out: unknown;
    try {
      out = await door('flowGrammar', {});
    } catch (e) {
      out = isNoSuchCall(e) ? { ok: false, refusal: { code: 'ROUTE_UNKNOWN' } } : { ok: false, refusal: { code: 'UNREACHABLE' } };
    }
    const next = put(stateOf(out));
    asked = null;
    return next;
  })();
  return asked;
}

/** Hold a grammar handed in, as a page that read it itself does, and as a test does. */
export const holdGrammar = (grammar: FlowGrammar): GrammarState => put({ state: 'ready', grammar });

/** Forget what the tab holds. For tests: a tab never forgets a grammar it read. */
export function forgetGrammar(): void {
  asked = null;
  put({ state: 'loading' });
}
