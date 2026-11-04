/**
 * Scheduled actions: the runner that drains `pull`, `call` and `poll`.
 *
 * `call` is an outbound POST a schedule fires. `poll` fetches an endpoint on a schedule and acts through a
 * rule when the answer changes. `pull` is `25-CONNECTORS`'s fetch of something you already own. All three
 * are declared inside an `ingest`, armed as a schedule row of their own kind, and fired into ONE outbox
 * kind, `pull.fetch`.
 *
 * THE RECORD NEVER MAKES THE CALL. This file builds the request, and the host's executor sends it, so there
 * is no network here: `runActions` takes the executor as an argument. The request names the key by its id
 * and label and never carries it, and the answer that comes back carries no key either. The host resolves
 * the key by reference, outside the record, and nothing here can be handed one.
 *
 * FIVE RULES THE OWNER SET, AND WHERE EACH ONE HOLDS.
 *
 *   1 · Fifteen minutes, or a provider's own higher floor, refused at declaration: `declare.ts`.
 *   2 · Jitter is arithmetic over the record, the pack and the action, never random: `actionJitterMs`. A paged pull's
 *       runner spreads its next run by the same arithmetic (`@braindog/connect`'s `jitterMs`), and every next run is
 *       counted from its slot, not from when the alarm rang (`slot.ts`).
 *   3 · The install diff names every host and how often: `@braindog/declare`'s `calls_out`.
 *   4 · A 401 or a 403 is never retried, and neither is a key the host could not open (`WRONG_KEY`). The row
 *       pauses, an event says so, the owner is told through the one notification path, and only `resumeAction`
 *       starts it again: `finishAction`.
 *   5 · Every run is metered from the first: one `pull` event per run, carrying runs, requests, bytes, run
 *       time and failures, and the project it ran for or `global`: `meter`. The pass hands each run back in
 *       `usage`, for the host to add to the Directory's ledger. A host that finds the plan's limit reached
 *       answers `held` instead of sending, and the action waits for the next month with an event that says so.
 */

import type { Result, Sql } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

import { looksLikeCredential, parseSpoken, spoken as spokenId } from './coerce.ts';
import { instant } from './migrate.ts';
import type { Ack, OutboxRow } from './outbox.ts';
import { FLOOR_MS, cursorOf, intervalMs, jitterMs, keyNameOf, type PullCursor } from './pull.ts';
import type { Drained } from './schedule.ts';
import { clockOf, nextSlotMs } from './slot.ts';
import type { LeasedSeal } from './keychain.ts';
/* TYPES ONLY, so there is no cycle at run time: `script-run.ts` imports `meter` and `pause` from this file. */
import type { ScriptAnswer, ScriptRunner, ScriptUnrun, Scripted } from './script-run.ts';

/** The three kinds this runner claims. */
export const ACTION_KINDS = ['pull', 'call', 'poll'] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

/** How long one request may take, and how much of an answer is read. `42 §4.7`'s defaults for a fetch. */
export const ACTION_TIMEOUT_MS = 10_000;
export const ACTION_MAX_BYTES = 2_000_000;

/**
 * The ways a `call` or a `poll` sends its key: as a bearer, in a header it names, in a query parameter it names, or as
 * a basic user name and password.
 *
 * FOUR OF CONNECT'S EIGHT, the four that are built from the key alone. The other four fetch a token first or sign the
 * whole request, which is a connector's run (`pull` with `fetch:`), not one request.
 */
export const ACTION_AUTH_KINDS = ['bearer', 'header', 'query', 'basic'] as const;
/** How the executor is told to send a key that is not a bearer. A bearer is the absence of one. */
export type ActionAuth = { kind: 'basic' } | { kind: 'header' | 'query'; name: string };

/**
 * Headers an action may not put its key in: `@braindog/connect`'s `RESERVED_HEADERS`, and any `x-forwarded-` one.
 *
 * A COPY, BECAUSE THE KERNEL SITS BELOW CONNECT (`31 §2`) and cannot import it. The copy is here so the install refuses
 * the name with a sentence; connect's auth builder refuses it again at run time, so a copy that fell behind would stop
 * the run with `PULL_REQUEST_REFUSED` and never send the key there.
 */
export const RESERVED_KEY_HEADERS: readonly string[] = ['authorization', 'cookie', 'host', 'content-length', 'referer', 'origin'];

/** Whether a header is one the key may not go in. */
export const reservedKeyHeader = (name: string): boolean => {
  const lower = name.toLowerCase();
  return RESERVED_KEY_HEADERS.includes(lower) || lower.startsWith('x-forwarded-');
};

/**
 * How a `call` or a `poll` sends its key, as the executor is told it, or `undefined` for a bearer.
 *
 * READ, NOT TRUSTED. The install refused anything else (`declare.ts`), so what does not read here is a declaration from
 * before the check, and a bearer is what it meant then.
 */
export function authOf(decl: Pick<ActionDecl, 'auth'>): ActionAuth | undefined {
  const kind = decl.auth?.kind;
  const name = typeof decl.auth?.name === 'string' && decl.auth.name !== '' ? decl.auth.name : undefined;
  if (kind === 'basic') return { kind };
  if ((kind === 'header' || kind === 'query') && name !== undefined) return { kind, name };
  return undefined;
}

/** A declaration this runner reads: the keys of an ingest that a scheduled action uses. */
export type ActionDecl = {
  ingest: string;
  channel: string;
  /** A literal `https://` address. `{since}` and `{until}` may stand in its path and query. */
  url?: string;
  /** `call` and `poll`: the key's keychain label. `pull`: the grant's id, as `25 §9` has it. */
  grant?: string;
  /** Absent only on a `call` whose `trigger` is `rule`, which runs when a rule says so and on no clock. */
  every?: string;
  floor?: string;
  /** `HH:MM`: the time of day each run belongs to, with an `every` of whole days. Read in `tz` (`slot.ts`). */
  at?: string;
  /** The zone `at` is read in, and a pull's window. Absent is the record's own. */
  tz?: string;
  /** `call` and `poll`: how the key is sent (`ACTION_AUTH_KINDS`). Absent is a bearer, which is what a bare `grant` meant. */
  auth?: { kind?: unknown; name?: unknown };
  /** `call` only: what starts it. `schedule`, the default, runs on `every`; `rule` runs when a rule says `run:`; `both` does both. */
  trigger?: 'schedule' | 'rule' | 'both';
  /** `call` only, with a rule trigger: the fields of the rule's row it sends, each `<register>.<field>`. Never a secret or a file. */
  sends?: string[];
  /** The project this action runs for. Absent is the whole record, which the meter calls `global`. */
  project?: string;
  /** `pull` only: the declaration's own ceilings. Read here for `max_pages`, which is what a run may cost. */
  limits?: { max_pages?: number };
  /** `call` only: the JSON it posts, string leaves substituted and nothing evaluated. */
  body?: Record<string, unknown>;
  /**
   * `pull` only, `42 §4.7`: where it fetches when it does not say `url:`.
   *
   * `page` AND `read` ARE WHAT MAKE IT A CONNECTOR rather than one request. This runner cannot page
   * and cannot find rows in an answer; `@braindog/connect` does both. So the two keys are carried
   * here opaquely — the kernel never looks inside them — purely so that `prepareAction` can tell
   * which of the two runners a job belongs to, and hand the whole declaration on untouched.
   */
  fetch?: { base?: string; path?: string; page?: unknown; read?: unknown; auth?: unknown; schedule?: unknown };
  extract?: Record<string, unknown>;
  /** A JSON answer read by paths, in place of `extract` (`map.ts`). A poll's may be a list, one row a map, from one answer. */
  map?: Record<string, unknown> | Record<string, unknown>[];
  writes?: { register?: string };
};

/** One request, as the host's executor receives it. There is no key in it, only the name of one. */
export type ActionRequest = {
  job: string;
  channel: ActionKind;
  ingest: string;
  method: 'GET' | 'POST';
  url: string;
  /** The origin the declaration names. The executor refuses any other, including one a redirect names. */
  origin: string;
  headers: Record<string, string>;
  body?: string;
  /** Which key to send, by reference. The executor opens it outside the record, or sends nothing. */
  grant: { id: string; label: string } | null;
  /**
   * What `grant`'s keychain entry says it opens, the words and never the value, so the executor can refuse a request whose
   * host is not the one the key opens BEFORE it opens the key (`hostOpened`). Absent with no key, and on a request built
   * before it was carried, which is held to nothing new.
   */
  opens?: string;
  /**
   * How the executor sends the key, when it is not a bearer: in a header or a query parameter of this `name`, or as a
   * basic pair. Absent is a bearer. The executor builds it with `@braindog/connect`'s auth builder, the one place a
   * credential meets a request.
   */
  auth?: ActionAuth;
  /**
   * Texts the executor strikes out of what it hands back, beside the spellings of a key it opens itself: a key used as
   * the address (a script's `address`), which is opened before the executor and sent with no key, so the executor never
   * learns it is a secret. A provider that echoes its URL (a 404 page, some calendar feeds) would otherwise hand the link
   * to the script.
   */
  scrub?: readonly string[];
  timeoutMs: number;
  maxBytes: number;
};

/** What the executor answers: the provider's status and body, or why it sent nothing or stopped. */
export type ActionAnswer =
  | {
      status: number;
      body: string;
      bytes: number;
      ms: number;
      requests: number;
      /**
       * Set when the host sent nothing because the account is at its plan's monthly limit: `status` is 0 and
       * every count is 0. THE HOST ASKS BEFORE THE RUN STARTS, because the allowance is the Directory's and the
       * record cannot see it. `until` is when the action may run again, and `say` is the one sentence its event
       * carries.
       */
      held?: { until: number; say: string };
      /**
       * The instant the provider's `Retry-After` names, on a 429 or a 5xx that sent one. The retry is armed no sooner
       * (`outbox.ts`'s ladder, which holds a provider's instant to its own six-hour bound).
       */
      notBefore?: number;
    }
  | {
      refused: { code: 'PULL_ORIGIN_REFUSED' | 'PULL_PROVIDER_UNAVAILABLE' | 'PULL_REQUEST_REFUSED' | 'WRONG_KEY'; fix: string };
      bytes: number;
      ms: number;
      requests: number;
    };

export type Execute = (request: ActionRequest) => Promise<ActionAnswer>;

/**
 * One run's usage, as its `pull` event wrote it. What a host hands the Directory's ledger.
 *
 * `event` is the event's id, which is what makes counting it twice count it once.
 */
export type Metered = {
  event: string;
  at: string;
  ingest: string;
  channel: string;
  scope: string;
  outcome: 'ok' | 'changed' | 'unchanged' | 'paused' | 'failed' | 'refused' | 'dropped' | 'held';
  usage: { runs: number; requests: number; bytes: number; ms: number; failures: number; held: number; cpu_ms: number };
};

/** What one pass did, counted. */
export type ActionsRun = {
  /** Schedule rows claimed and fired into the outbox. */
  fired: number;
  /** Requests handed to the executor. */
  ran: number;
  ok: number;
  /** A `poll` whose answer changed, which is the only kind of answer that reaches a rule. */
  changed: number;
  paused: number;
  /** Failures that walk the outbox's ladder: a 429, a 5xx, a timeout, the network. */
  failed: number;
  /** Failures that do not: an origin refused, an answer over the cap, any other 4xx. */
  refused: number;
  /** Jobs whose declaration had gone by the time they ran. */
  dropped: number;
  /** Runs the host held because the account reached its plan's limit. Nothing was sent for these. */
  held: number;
  /** Every run this pass metered, in order. The host adds each to the Directory's ledger. */
  usage: Metered[];
  /**
   * Rows were due and this pass handed them back unrun, because the invocation ran out of budget.
   *
   * THE HOST HAS TO RING AGAIN. Nothing reschedules on its own here: the rows are released and
   * waiting, and a host that ignored this would leave them for whenever the schedule next fires.
   */
  more: boolean;
};

export type ActionDeps = {
  sql: Sql;
  recordId: string;
  nowMs: number;
  mint: () => string;
  /** The one insertion path to the outbox, for `pull.fetch`. */
  enqueue: (payload: unknown) => string;
  /** The existing notification path, urgent: a `note` event, one push an hour, and the email. */
  notify: (said: { actor: string; say: string; because?: string }) => void;
  /** Finish a leased job. `failed` walks the ladder. */
  ack: (args: Ack) => Result<null>;
  /** The active declaration of this action, and the pack it came from, or `null` when it is gone or turned off. */
  lookup: (ingest: string) => { decl: ActionDecl; pack: string | null } | null;
  /** Hand an answer to the ingest pipeline as this one declaration's arrival, so a write fires its rules. */
  arrive: (decl: ActionDecl, body: string, sha256: string) => Result<unknown>;
  /**
   * Open a credential for a job this runner is holding the lease on. `keychain.ts`'s `sealedGrant`.
   *
   * INJECTED RATHER THAN IMPORTED for the same reason every other write here is: this file decides
   * what a run needs, and the keychain decides whether a lease is good enough to get it. Keeping the
   * second decision in the keychain is what keeps it in one place.
   */
  seal: (args: { outbox: string; leasedUntil: string; grant: string; actor: string }) => Result<LeasedSeal>;
  /** The record's timezone, which a connector's window is measured in. */
  tz: string;
};

/* ── the jitter ─────────────────────────────────────────────────────────── */

/**
 * A stable offset, from the record, the pack and the action.
 *
 * THE SAME ARITHMETIC AS A CONNECTOR'S, over one more name. Two packs that both declare an action called
 * `balance` land on different offsets, and the same action in the same pack on the same record lands on
 * the same one every time, which is what makes a gap somebody asks about a gap with a reason.
 */
export function actionJitterMs(recordId: string, pack: string | null, action: string, everyMs: number): number {
  return jitterMs(recordId, `\x1f${pack ?? ''}\x1f${action}`, everyMs);
}

/* ── firing a row ───────────────────────────────────────────────────────── */

type Key = { id: string; label: string; sealed_under: 'record' | 'connector'; opens?: string };

/** A key as a request names it: the reference and which data key sealed it, without what it opens. */
const referenceOf = ({ opens: _opens, ...reference }: Key): Omit<Key, 'opens'> => reference;

/**
 * A keychain row as far as choosing among several needs it: `kernel.grants()` hands every one of these columns.
 *
 * `created_at` IS OPTIONAL HERE AND NEVER ABSENT ON A REAL ROW, for the reason `SlashKeychainRow` gives in `@braindog/host`:
 * a test's double that only needed a label would otherwise be a compile error. A row that states none sorts as oldest.
 */
export type GrantChoosable = { id: string; label: string; revoked_at: string | null; created_at?: string | undefined };

/**
 * The live keychain entry a name opens, by label or id: the NEWEST, `created_at` and then `id`, both descending.
 *
 * ONE ORDER, WRITTEN ONCE, BECAUSE FOUR COPIES OF IT HAD ALREADY LET A FIFTH GO WRONG. The keychain admits two live grants
 * under one label, and at `afb3b1b2` the newest-first clause was spelled out in `keyNamed` and `opensNamed` here, in
 * `grantNamed` (`@braindog/host/script`) and in `slashOwnKeyFor` (`@braindog/host/slash`). Slash's own path was found
 * taking `grants().find(...)`, which is `listGrants` order and so the OLDEST key, while every action named `slash` sent
 * the newest. The four that agreed agreed because each author copied the same words; measured, no state
 * `test/grant-chooser.test.ts` or `packages/host/test/grant-named.test.ts` builds made two of them disagree, so nothing
 * about which key wins moved here. It lives in the kernel beside `opensNamed` for the reason `hostOpened` below does:
 * the host imports the rule rather than keeping a copy that can drift.
 *
 * `fits` IS THE CALLER'S OWN RULE ABOUT WHAT IT CAN SEND, and the order is applied to what it keeps. Slash's key goes out
 * as a bearer, so it passes over a password or a note; an action and a script take the newest entry of any kind, as they
 * did before this function existed. The rows are not reordered, and a name that is absent or empty opens nothing.
 */
export function grantChosen<G extends GrantChoosable>(grants: readonly G[], name: string | undefined, fits: (grant: G) => boolean = () => true): G | undefined {
  if (name === undefined || name === '') return undefined;
  let best: G | undefined;
  for (const g of grants) {
    if ((g.label !== name && g.id !== name) || g.revoked_at !== null || !fits(g)) continue;
    const at = g.created_at ?? '';
    const was = best?.created_at ?? '';
    if (best === undefined || at > was || (at === was && g.id > best.id)) best = g;
  }
  return best;
}

/**
 * The live rows a name could mean, in no order: `grantChosen` orders them. `revoked_at` and `created_at` are read for it.
 *
 * THE FILTER STAYS IN SQL, so a keychain of many labels hands the chooser the one or two rows under this name and not the lot.
 */
const liveNamed = <R>(sql: Sql, columns: string, name: string): (R & GrantChoosable)[] =>
  sql.all<R & GrantChoosable>(`SELECT ${columns}, id, label, revoked_at, created_at FROM grant WHERE (label = ? OR id = ?) AND revoked_at IS NULL`, name, name);

/** The key a scheduled action names, by label or id, and never one that was revoked. The row, never its bytes. */
export function keyNamed(sql: Sql, name: string | undefined): Key | null {
  if (name === undefined || name === '') return null;
  const found = grantChosen(liveNamed<Key & { opens: string | null }>(sql, 'sealed_under, opens', name), name);
  if (found === undefined) return null;
  /* WHAT IT OPENS RIDES WITH IT, the words a person typed, so the host holds the key to its own host. Never a value. */
  return { id: found.id, label: found.label, sealed_under: found.sealed_under, ...(typeof found.opens === 'string' ? { opens: found.opens } : {}) };
}

/**
 * What the live keychain entry a label names says it opens, found as `keyNamed` finds the key, or `null` when none is live.
 * The words as the entry holds them: the host reads a host out of them at run time, and this is what a person reads.
 */
export function opensNamed(sql: Sql, name: string): string | null {
  if (name === '') return null;
  return grantChosen(liveNamed<{ opens: string }>(sql, 'opens', name), name)?.opens ?? null;
}

/**
 * The host a grant's `opens` names, or `null` when it names none.
 *
 * `opens` IS WHAT A PERSON TYPED, "a host, an account, a machine" as the keychain's own refusal puts it, so it is read as a
 * host only when it parses as one: `api.gold.test`, `api.gold.test:8443` or `https://api.gold.test/v1` all name
 * `api.gold.test`, and "the Oxbow test account" names nothing. Not a string at all names nothing either, so a lookup that
 * forgot to carry `opens` sends no key rather than every key.
 *
 * IT LIVES HERE, BESIDE `opensNamed`, AND NOT IN `@braindog/host`, because two readers of `opens` disagreed. The host
 * sent a key where this parse said and the approval line printed the words raw, so
 * `https://api.goldapi.io@collector.test` was printed as the key's destination while the key went to `collector.test`,
 * the host after the user-info. The line (`scriptEgress`) asks this now, and so does `keyRefused` in `packages/host`,
 * which imports it from the index and holds no copy of its own.
 */
export function hostOpened(opens: unknown): string | null {
  if (typeof opens !== 'string') return null;
  const text = opens.trim().toLowerCase();
  if (text === '') return null;
  try {
    return new URL(text.includes('://') ? text : `https://${text}`).hostname.replace(/\.$/, '');
  } catch {
    return null;
  }
}

/**
 * The host a key is held to: `hostOpened`, and only a name with a dot or a colon in it.
 *
 * ONE WORD IS A NAME, NOT A HOST. An entry that says "Stripe" or "Oxbow" parses as the host `stripe`, which no action
 * can call, so holding the key to it would refuse every send of it; it names no host, and its first approval pins one.
 * The host's executor reads `opens` the same way.
 */
export function heldHost(opens: unknown): string | null {
  const host = hostOpened(opens);
  return host !== null && /[.:]/.test(host) ? host : null;
}

/**
 * Whether a scheduled run could ever open this key, said at the moment somebody approves it.
 *
 * THE CHECK BELONGS BEFORE THE PRESS AND NOT AT THE FIRST RUN. `sealedGrant` refuses a key sealed
 * under the record key, which is right, but a refusal that arrives on the first run arrives after
 * somebody has already approved the action: it reads as approved, it is armed, and it does nothing
 * — the exact shape `govern.ts` already refuses a MISSING key to avoid. A key that exists and
 * cannot be opened by the thing being approved is the same failure with a longer fuse.
 *
 * `null` MEANS FINE, and the string is the sentence to show. It says what to do rather than what
 * went wrong, because the person reading it deposited this key themselves and the fix is theirs.
 */
export const runnerCannotOpen = (key: Key): string | null =>
  key.sealed_under === 'connector'
    ? null
    : `The key "${key.label}" was added for you to use, not for a connector. Add it again under the connector before accepting, or this action will be approved and never run.`;

/**
 * The sentence an approval list used to end with when any line sent a key.
 *
 * NO LONGER SAID. A key is held to its own project or to every project at declaration (`keyOutOfScope`) and
 * to its own host when it is sent, so "any action can send any key" stopped being true. KEPT EXPORTED, UNUSED, until the
 * index stops re-exporting it, so a reader that filtered it out (`arrange.ts`) filters nothing rather than failing.
 */
export const KEYS_REACH_ALL = 'Keys are not kept per project yet, so any action here can send any key it names.';

/**
 * Who else can open a key a scheduled action sends, said once at the end of an approval list.
 *
 * ONCE, AT THE END, AND NOT UNDER EVERY LINE, for the reason the old sentence was: it is the same fact however many
 * actions are approved. It is the true one now. A scheduled run opens its key with nobody there, so whatever server runs
 * it can open it as well, and that is the honest edge of "we cannot read your record".
 */
export const KEY_OPENED_UNATTENDED = 'A scheduled action opens this key with nobody present, so the server that runs it can open it too.';

/** The same sentence on a record whose keychain has a passphrase on: the passphrase guards a person's own keys, not this one. */
export const KEY_OPENED_UNATTENDED_PASSPHRASE =
  'A scheduled action opens this key with nobody present, so the server that runs it can open it too, and your keychain password does not cover it.';

/**
 * An approval list, ending with who else can open a key when anything in it sends one.
 *
 * `passphrase` IS THE CALLER'S TO SAY, because whether the record's key is wrapped by a passphrase is the keychain's fact
 * (`recordWrapping`), and this function reads nothing. Left out, the sentence says nothing about one.
 */
export const approvalLines = (
  egress: readonly Pick<Egress, 'key' | 'line' | 'key_line'>[],
  opts: { passphrase?: boolean } = {},
): string[] => {
  const lines = egress.flatMap((e) => (e.key_line === null ? [e.line] : [e.line, e.key_line]));
  if (!egress.some((e) => e.key !== null)) return lines;
  return [...lines, opts.passphrase === true ? KEY_OPENED_UNATTENDED_PASSPHRASE : KEY_OPENED_UNATTENDED];
};

/**
 * The projects a key is kept for, read from the row that holds its keychain entry: `null` is every project, and `undefined`
 * is that no row says, which a caller reads as every project too (`§2.7`, a key with no scope counts as global).
 *
 * `holders` IS THE CALLER'S: each register with a secret field and a scope field, and that scope field's id. The kernel's
 * registers are the index's to know, and naming them keeps the read to those lists and not the whole record. A key is a
 * row's secret field holding the grant's id (`depositGrant`), so the row whose fields hold that id is the key's.
 *
 * NOTHING SECRET IS READ: the grant's id, by its label, and the row's fields, where the secret field holds only the id.
 */
export function keyScopeOf(sql: Sql, label: string, holders: ReadonlyMap<string, string>): readonly string[] | null | undefined {
  if (label === '' || holders.size === 0) return undefined;
  const grant = grantChosen(liveNamed<{ kind: string }>(sql, 'kind', label), label);
  if (grant === undefined) return undefined;
  const lists = [...holders.keys()];
  const rows = sql.all<{ register: string; fields: string }>(
    `SELECT e.register, e.fields FROM entry e WHERE e.deleted_at IS NULL AND e.register IN (SELECT value FROM json_each(?))
       AND EXISTS (SELECT 1 FROM json_each(e.fields) j WHERE j.value = ?)`,
    JSON.stringify(lists),
    grant.id,
  );
  if (rows.length === 0) return undefined;
  const kept = new Set<string>();
  for (const row of rows) {
    let fields: Record<string, unknown>;
    try {
      fields = JSON.parse(row.fields) as Record<string, unknown>;
    } catch {
      continue;
    }
    const held = fields[holders.get(row.register) ?? ''];
    for (const p of Array.isArray(held) ? held : [held]) if (typeof p === 'string' && p !== '') kept.add(p);
  }
  return kept.size === 0 ? null : [...kept];
}

/** Why an action may not name the key it names: the code, the sentence with the fix, and the field. */
export type KeyOutOfScope = { code: 'FORBIDDEN'; fix: string; at: 'grant' };

/**
 * Whether an action names a key kept for another project, said at declaration: `null` is fine.
 *
 * AN ACTION IN PROJECT P MAY NAME A KEY KEPT FOR P OR FOR EVERY PROJECT, and nothing else ("within that key's scope",
 * D0b.23). An action for every project may name only a key for every project, since a key kept for one project is
 * offered only there. A key no row places counts as every project's, as the keychain list says it.
 *
 * `FORBIDDEN` FOR NOW, the nearest code the registry holds: `KEY_OUT_OF_SCOPE` is the code this is, and it waits on the
 * registry (`packages/ports`). Names, never ids: `nameOf` says a project, and one it cannot name is "another project".
 */
export function keyOutOfScope(
  egress: Pick<Egress, 'ingest' | 'key' | 'project'>,
  scopeOf: (label: string) => readonly string[] | null | undefined,
  nameOf?: (project: string) => string | null,
): KeyOutOfScope | null {
  if (egress.key === null) return null;
  const kept = scopeOf(egress.key);
  if (kept === undefined || kept === null || kept.length === 0) return null;
  if (egress.project !== null && kept.includes(egress.project)) return null;
  const named = (p: string): string => {
    const name = nameOf?.(p);
    return name ? `the project ${name}` : 'another project';
  };
  const where = joinedList([...new Set(kept.map(named))]);
  const runs = egress.project === null ? 'runs for every project' : `runs for ${named(egress.project)}`;
  const instead = egress.project === null ? 'a key kept for every project' : `a key kept for ${named(egress.project)} or for every project`;
  return {
    code: 'FORBIDDEN',
    fix: `${egress.ingest || 'This action'} ${runs} and names the key "${egress.key}", which is kept for ${where} only. Name ${instead}, or move the key.`,
    at: 'grant',
  };
}

/** Why a key cannot carry an approval, and what to do: the code and the sentence, or `null` for fine. */
export type KeyNotReady = { code: 'REQUIRED_MISSING' | 'OUT_OF_BOUNDS'; fix: string };

/**
 * Both questions a screen has to ask about a key before somebody approves what sends it: is it
 * there, and could a run open it. `null` means yes to both.
 *
 * ONE ANSWER AND NOT TWO, because the two failures have one consequence — an action approved that
 * cannot run — and a caller holding two booleans is a caller that will eventually check one. They
 * keep separate CODES because they do not have the same fix: one is a key to add, the other is a
 * key to add again, under the connector.
 */
export const keyReady = (sql: Sql, name: string | undefined, paged = false): KeyNotReady | null => {
  const key = keyNamed(sql, name);
  if (key === null)
    return { code: 'REQUIRED_MISSING', fix: `Add the key called "${name ?? ''}" to the keychain, then install.` };
  /* AND ONLY A CONNECTOR IS HELD TO THE CONNECTOR KEY. A `call`, a `poll` and a single-request
     `pull` open theirs through `openGrant`, which unwraps the RECORD key, so requiring the other
     one of them would refuse every action in the record that is not a connector. */
  if (!paged) return null;
  const cannot = runnerCannotOpen(key);
  return cannot === null ? null : { code: 'OUT_OF_BOUNDS', fix: cannot };
};

/**
 * Pause the row an action runs from, and say so once through the notification path.
 *
 * `who` IS FOR A SCRIPT, which pauses for a different reason (three refused runs, `script-run.ts`) and is not an
 * ingest. Without it the owner was told an ingest called `gold-rate` had a key refused, which is neither.
 */
export function pause(
  deps: Pick<ActionDeps, 'sql' | 'notify'>,
  kind: string,
  ingest: string,
  say: string,
  who: { actor: string; because: string } = {
    actor: `ingest:${ingest}`,
    because: 'A scheduled action whose key is refused or gone is never retried. It runs again when somebody resumes it.',
  },
): void {
  deps.sql.exec("UPDATE schedule SET state = 'paused' WHERE kind = ? AND key = ?", kind, ingest);
  deps.notify({ actor: who.actor, say, because: who.because });
}

/**
 * A `call` or `poll` row fires: queue one request, and say when the next one is due.
 *
 * A DECLARATION THAT IS GONE ENDS THE ROW. Retiring it, uninstalling its pack and turning its pack off all retire the
 * declaration, so the row goes `done` here and nothing re-arms it; turning the pack back on arms it again.
 *
 * ONE REQUEST IN FLIGHT PER ACTION. A job still pending, leased or waiting on its retry is the run that
 * this fire would duplicate, so the fire queues nothing and only re-arms. That is what keeps a provider
 * that is down for a day from receiving a second request every interval on top of the ladder's.
 *
 * THE NEXT RUN IS COUNTED FROM THIS ONE'S SLOT, and not from now (`slot.ts`). It was `now + every`, so every alarm that
 * rang late moved the action for good.
 */
export function fireAction(deps: ActionDeps, row: { id: string; kind: string; key: string; due_at?: string; payload?: string }): number | null | 'kept' {
  const found = deps.lookup(row.key);
  if (!found || found.decl.channel !== row.kind) return null;
  const { decl, pack } = found;
  /* A CALL ONLY A RULE RUNS HAS NO CLOCK. Its row exists so it can pause and be resumed, and firing it ends it. */
  if (decl.trigger === 'rule') return null;
  const every = Math.max(intervalMs(decl.every ?? '') ?? FLOOR_MS, FLOOR_MS);

  /* A POLL THAT NAMES NO KEY SENDS NONE, so there is nothing in the keychain to miss. */
  const keyless = decl.channel === 'poll' && (decl.grant === undefined || decl.grant === '');
  const key = keyless ? null : keyNamed(deps.sql, decl.grant);
  if (!keyless && !key) {
    deps.sql.exec("UPDATE schedule SET state = 'paused' WHERE id = ?", row.id);
    deps.notify({
      actor: `ingest:${row.key}`,
      say: `${row.key} is paused: the key "${decl.grant ?? ''}" it sends is not in the keychain.`,
      because: 'Bind the key, then resume the action.',
    });
    return 'kept';
  }

  const busy = deps.sql.one(
    `SELECT 1 AS x FROM outbox WHERE kind = 'pull.fetch' AND state IN ('pending', 'leased', 'failed')
     AND json_extract(payload, '$.channel') = ? AND json_extract(payload, '$.ingest') = ?
     AND json_extract(payload, '$.entry') IS NULL LIMIT 1`,
    row.kind,
    row.key,
  );
  if (!busy) deps.enqueue({ channel: row.kind, ingest: row.key, ...(key ? { grant: key.id } : {}) });

  /* THE SLOT IS KEPT ON THE ROW, as a paged pull's is (`finishPull`), and only here. The first fire has none, and its
     slot is the instant it was armed for, which carries no jitter; every fire after reads the one before wrote. A due
     instant moved by a held month or a resume leaves the slot where the schedule put it. */
  let kept: Record<string, unknown> = {};
  try {
    const said: unknown = JSON.parse(row.payload ?? '{}');
    if (said !== null && typeof said === 'object' && !Array.isArray(said)) kept = said as Record<string, unknown>;
  } catch {
    kept = {};
  }
  const stored = typeof kept.slot === 'string' ? Date.parse(kept.slot) : Number.NaN;
  const due = row.due_at === undefined ? Number.NaN : Date.parse(row.due_at);
  const slot = Number.isFinite(stored) ? stored : Number.isFinite(due) ? due : deps.nowMs;
  const next = nextSlotMs({ slotMs: slot, nowMs: deps.nowMs, everyMs: every, clock: clockOf(decl, deps.tz) });
  deps.sql.exec('UPDATE schedule SET payload = ? WHERE id = ?', JSON.stringify({ ...kept, slot: instant(next) }), row.id);
  return next + actionJitterMs(deps.recordId, pack, row.key, every);
}

/* ── building the request ───────────────────────────────────────────────── */

const TIME = /\{(since|until)(?::(date|instant|epoch_s|epoch_ms))?\}/g;

/** `{since}` and `{until}`, substituted. Nothing else in the text is read. */
function fill(text: string, edges: { since: number; until: number }, encode: boolean): string {
  return text.replace(TIME, (_all, name: 'since' | 'until', format: string | undefined) => {
    const ms = edges[name];
    const said =
      format === 'date' ? instant(ms).slice(0, 10) : format === 'epoch_s' ? String(Math.floor(ms / 1000)) : format === 'epoch_ms' ? String(ms) : instant(ms);
    return encode ? encodeURIComponent(said) : said;
  });
}

const ROW = /\{row\.([A-Za-z0-9_]+)\}/g;
const WHOLE_ROW = /^\{row\.([A-Za-z0-9_]+)\}$/;

/**
 * A call's body, substituted: `{since}` and `{until}`, and `{row.<field>}` from the fields a rule sent.
 *
 * A LEAF THAT IS ONE ROW FIELD AND NOTHING ELSE KEEPS ITS VALUE, so an amount stays a number. Inside other text it is
 * written as text. A scheduled run has no row, so it substitutes nothing there.
 */
function fillBody(node: unknown, edges: { since: number; until: number }, row?: Record<string, unknown>): unknown {
  if (typeof node === 'string') {
    const whole = WHOLE_ROW.exec(node);
    if (whole) return row?.[whole[1]!] ?? null;
    return fill(node, edges, false).replace(ROW, (_all, field: string) => {
      const value = row?.[field];
      return value === undefined || value === null ? '' : typeof value === 'string' ? value : JSON.stringify(value);
    });
  }
  if (Array.isArray(node)) return node.map((v) => fillBody(v, edges, row));
  if (node !== null && typeof node === 'object')
    return Object.fromEntries(Object.entries(node as Record<string, unknown>).map(([k, v]) => [k, fillBody(v, edges, row)]));
  return node;
}

/** The address an action calls, or `null` when it declares none this runner can call. */
export function addressOf(decl: ActionDecl): string | null {
  if (typeof decl.url === 'string') return decl.url;
  if (typeof decl.fetch?.base === 'string' && typeof decl.fetch.path === 'string') return `${decl.fetch.base.replace(/\/$/, '')}${decl.fetch.path}`;
  return null;
}

/** The origin of an address, or `null` when it is not an https one. */
export function originOf(address: string): string | null {
  try {
    const url = new URL(address);
    return url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

/** A job the runner can send, with what it needs to finish it. */
export type Ready = { job: OutboxRow; decl: ActionDecl; request: ActionRequest; host: string };

/**
 * What a connector run is handed. Structurally `@braindog/connect`'s `PullPayload`, and typed here
 * rather than imported.
 *
 * WHY NOT IMPORT THE TYPE. `31 §2` puts the kernel below the connector, and a kernel that imported
 * `@braindog/connect` would point the arrow the wrong way up the stack: the record would depend on
 * something that depends on the record. The same reasoning already shaped `extract.ts`. The cost is
 * that the two shapes can drift; the test that stops them is `apps/selfhost/test/connector.test.ts`,
 * which builds one of these and hands it to the real `runPull`, so a drift fails there rather than
 * at a customer's provider.
 */
export type PullHandoff = {
  ingest: string;
  decl: ActionDecl;
  declaration_version: number;
  /** Sealed, from `sealedGrant`. `null` when the connector declares no auth. */
  grant: { ciphertext: string; nonce: string; kek_id: string; grant_id: string; version: number } | null;
  dek: { wrapped: string; nonce: string; kek_id: string } | null;
  record: { id: string; tz: string };
  cursor: PullCursor;
  slot: string;
};

/** A leased job whose declaration pages, and so belongs to the connector runner rather than to this one. */
export type Paged = { job: OutboxRow; decl: ActionDecl; host: string; paged: PullHandoff };

/**
 * Whether a declaration pages.
 *
 * ONE PREDICATE, USED ONCE, and named anyway, because "which runner owns this row" is the question
 * a second copy of would eventually answer differently — and two runners that both believe they own
 * a row is the double charge against a provider that a lease exists to prevent.
 */
const pages = (decl: ActionDecl): boolean =>
  decl.channel === 'pull' && decl.fetch !== undefined && (decl.fetch.page !== undefined || decl.fetch.read !== undefined);

/**
 * A leased job becomes a request, or is finished here because it cannot become one.
 *
 * THE KEY IS LOOKED UP BY ITS ID AND ITS LABEL AND NOTHING ELSE. `grant` in the request is a reference the
 * host resolves, and the columns this reads are the two a person already sees on the keychain screen.
 */
export function prepareAction(deps: ActionDeps, job: OutboxRow): Ready | Paged | Metered {
  let payload: { channel?: string; ingest?: string; grant?: string; row?: unknown };
  try {
    payload = JSON.parse(job.payload) as typeof payload;
  } catch {
    payload = {};
  }
  const ingest = payload.ingest ?? '';
  const channel = (payload.channel ?? 'pull') as ActionKind;
  const found = ingest ? deps.lookup(ingest) : null;
  const address = found ? addressOf(found.decl) : null;
  const origin = address ? originOf(address) : null;

  if (!found || found.decl.channel !== channel || !address || !origin) {
    const why = !found || found.decl.channel !== channel
      ? `${ingest} is no longer declared, or its pack is off, so nothing was sent.`
      : `${ingest} declares no https address this runner can call, so nothing was sent.`;
    /* THE SENTENCE GOES WITH THE ACK, so a run waiting on this call stops on it rather than on "no answer". */
    deps.ack({ id: job.id, state: 'done', leasedUntil: job.leasedUntil, result: { failed: why } });
    return meter(deps, { ingest, channel, host: null, project: found?.decl.project, status: null, outcome: 'dropped', requests: 0, bytes: 0, ms: 0, failures: 0 }, why);
  }

  const { decl } = found;
  const host = new URL(address).host;
  /* THE KEY THE FIRE NAMED, BY ID. A key revoked between the fire and the run is a key that is gone, and
     sending the request without it would be a request the provider answers 401 to anyway.

     AND WITHOUT ONE, THE DECLARATION'S, by label or id: a connector's `fetch.auth.grant` before its top-level
     `grant` (`keyNameOf`). A connector that named its key in its auth block, as its grammar says, was handed
     no credential here and refused by the provider on every run. */
  const named = payload.grant ?? keyNameOf(decl);
  const key = named === undefined ? null : keyNamed(deps.sql, named);
  if (named !== undefined && !key) {
    deps.ack({ id: job.id, state: 'done', leasedUntil: job.leasedUntil, result: { failed: `${ingest} did not run: the key it sends to ${host} is gone.` } });
    pause(deps, channel, ingest, `${ingest} is paused: the key it sends to ${host} is gone.`);
    return meter(deps, { ingest, channel, host, project: decl.project, status: null, outcome: 'paused', requests: 0, bytes: 0, ms: 0, failures: 1 }, `${ingest} did not run: the key it sends to ${host} is gone.`);
  }

  const row = deps.sql.one<{ payload: string }>('SELECT payload FROM schedule WHERE kind = ? AND key = ?', channel, ingest);
  let since: number | null = null;
  let watermark: string | null = null;
  /* A CONNECTOR'S CURSOR AND SLOT, as its pages and its last finish wrote them (`keepCursor`, `finishPull`). This read
     `since` alone, which only the single-request path writes, so every paged run was handed a watermark of nothing
     and fetched its first window again. */
  let held: PullCursor | null = null;
  let slot: string | null = null;
  try {
    type Kept = { since?: unknown; cursor?: unknown; slot?: unknown };
    const kept: Kept = row ? (JSON.parse(row.payload) as Kept) : {};
    const said = kept.since;
    since = typeof said === 'string' ? Date.parse(said) : null;
    watermark = typeof said === 'string' ? said : null;
    held = cursorOf(kept.cursor);
    slot = typeof kept.slot === 'string' && !Number.isNaN(Date.parse(kept.slot)) ? kept.slot : null;
  } catch {
    since = null;
  }

  /* ── the fork: one request, or a connector that pages ──────────────────────────────────────────
     EVERYTHING ABOVE IS SHARED ON PURPOSE. The declaration, the key, the pause when the key is gone
     and the window all mean the same thing for both runners, and a second copy of any of them is a
     second answer to a question with one. What differs starts here, and only here. */
  if (pages(decl)) {
    /* THE CREDENTIAL IS OPENED UNDER THIS JOB'S OWN LEASE, which is the whole of the authorisation:
       the keychain checks that the lease is live, that it is still ours, and that this job is the one
       that sends this key. A refusal is the run not happening, never the run happening unsigned. */
    let seal: LeasedSeal | null = null;
    if (key) {
      const got = deps.seal({ outbox: job.id, leasedUntil: job.leasedUntil, grant: key.id, actor: `ingest:${ingest}` });
      if (!got.ok) {
        /* A CONFLICT CANNOT COME BACK FROM HERE — the keychain only refuses — but `Result` allows one,
           and reading `.refusal` off a conflict is how a type assertion becomes a crash in a queue
           consumer. Name it rather than cast it. */
        const refused = 'refusal' in got ? got.refusal : { code: 'PULL_LEASE_EDGE', fix: 'Another write moved this job.' };
        deps.ack({ id: job.id, state: 'done', leasedUntil: job.leasedUntil });
        /* A LAPSED LEASE IS NOT A PAUSE. The row is simply not ours any more, and the schedule will
           fire it again; pausing the connector over it would stop a working connector because one
           run was slow. A revoked or unopenable key IS a pause, because nothing will fix itself. */
        const lapsed = refused.code === 'PULL_LEASE_EDGE';
        if (!lapsed) pause(deps, channel, ingest, `${ingest} is paused: ${refused.fix}`);
        return meter(
          deps,
          {
            ingest,
            channel,
            host,
            project: decl.project,
            status: null,
            outcome: lapsed ? 'dropped' : 'paused',
            requests: 0,
            bytes: 0,
            ms: 0,
            failures: lapsed ? 0 : 1,
          },
          `${ingest} did not run: ${refused.fix}`,
        );
      }
      seal = got.value;
    }

    const version =
      deps.sql.one<{ version: number }>(
        'SELECT version FROM declaration WHERE id = ? AND superseded_at IS NULL AND retired = 0 ORDER BY version DESC LIMIT 1',
        `ingest.${ingest}`,
      )?.version ?? 1;

    /* ONE INTERVAL, THE DECLARATION'S `every`, handed to the runner as its `fetch.schedule`. The runner counts the next
       slot from `fetch.schedule.every` and this record fires from `every`, and while the two were written separately a
       connector could say one thing to each. The install refuses a `fetch.schedule` that disagrees (`declare.ts`), and
       this is what makes the one the record floor-checked the one the runner reads. `at` goes with it, and the zone
       both are read in is the action's own `tz` where it names one. */
    const clock = clockOf(decl, deps.tz);
    const schedule = { every: decl.every ?? '', ...(typeof decl.at === 'string' && clock.at !== null ? { at: decl.at } : {}) };
    const handed: ActionDecl = { ...decl, fetch: { ...decl.fetch, schedule } };

    return {
      job,
      decl,
      host,
      paged: {
        ingest,
        decl: handed,
        declaration_version: version,
        grant: seal?.grant ?? null,
        dek: seal?.dek ?? null,
        record: { id: deps.recordId, tz: clock.tz },
        /* THE CURSOR IS WHERE THE LAST RUN GOT TO, as the schedule row holds it. A resumed run reads
           back exactly what it left, a half-read window included, rather than recomputing one from the
           clock. A row with no cursor yet is a first run, or one the single-request path wrote. */
        cursor: held ?? { watermark },
        /* AND THE SLOT THE LAST FINISH COUNTED TO, so the next is counted from the slot and not from
           whenever this alarm happened to ring. A first run has none, and its slot is now. */
        slot: slot ?? instant(deps.nowMs),
      },
    };
  }
  const every = Math.max(intervalMs(decl.every ?? '') ?? FLOOR_MS, FLOOR_MS);
  const edges = { since: since !== null && Number.isFinite(since) ? since : deps.nowMs - every, until: deps.nowMs };

  /* SUBSTITUTED AFTER THE ORIGIN, so a value can never become part of the host. The declaration check
     already refused a host with a brace in it; this is the same rule held at run time. */
  const rest = address.slice(origin.length);
  const url = `${origin}${fill(rest, edges, true)}`;
  const method = channel === 'call' ? 'POST' : 'GET';
  /* THE FIELDS A RULE SENT, AND ONLY THOSE. The record copied them when the rule fired; nothing here reads the record. A
     call that declares no body sends them as they are. */
  const sent = payload.row !== null && typeof payload.row === 'object' && !Array.isArray(payload.row) ? (payload.row as Record<string, unknown>) : undefined;
  /* HOW THE KEY GOES, for a call and a poll, which is what the four kinds are for (`contracts.md`). A single-request
     pull keeps the bearer it always sent; a pull that needs another way pages through connect, which reads its
     `fetch.auth` whole. */
  const auth = key !== null && channel !== 'pull' ? authOf(decl) : undefined;
  const body =
    channel !== 'call'
      ? undefined
      : decl.body !== undefined
        ? JSON.stringify(fillBody(decl.body, edges, sent))
        : sent !== undefined
          ? JSON.stringify(sent)
          : undefined;

  return {
    job,
    decl,
    host,
    request: {
      job: job.id,
      channel,
      ingest,
      method,
      url,
      origin,
      headers: { accept: 'application/json', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body }),
      /* THE KEY BY REFERENCE, and what its entry opens beside it rather than in it, so `grant` stays the reference it was. */
      grant: key === null ? null : referenceOf(key),
      ...(key?.opens === undefined ? {} : { opens: key.opens }),
      ...(auth === undefined ? {} : { auth }),
      timeoutMs: ACTION_TIMEOUT_MS,
      maxBytes: ACTION_MAX_BYTES,
    },
  };
}

/* ── finishing a run ────────────────────────────────────────────────────── */

type Usage = {
  ingest: string;
  channel: string;
  host: string | null;
  project: string | undefined;
  status: number | null;
  outcome: Metered['outcome'];
  requests: number;
  bytes: number;
  ms: number;
  failures: number;
  /**
   * Time the sandbox spent inside the interpreter (`ScriptUsage.cpu_ms`), for a script's run; absent for every other
   * channel, which spends no CPU of its own to meter. Free wherever the run itself is (`free` below).
   */
  cpu_ms?: number;
  /** Who the event names. Absent is `ingest:<ingest>`; a script's run names the version that ran, `script:<id>@v<n>`. */
  actor?: string;
  /** A `call`'s answer, as the provider sent it, for the run to keep (`keptAnswer`). Absent on every other run. */
  answer?: { status: number; body: string } | undefined;
  /**
   * A script's run that wrote, asked and stopped nothing (last-day-48), written on the line as `quiet: 1` when it is
   * made, so a feed leaves it out (`bookkeeping` in index.ts) and the log is never rewritten to say so.
   */
  quiet?: true;
  /** The ids of the questions a script's run opened, for the read that words its line by each one's state now. */
  questions?: { asked?: string; proposed?: string[] };
};

/**
 * The most of a call's answer its run keeps, in bytes of UTF-8: `42 §4.7`'s ceiling on a fetch body, which is the
 * ceiling a call's own body is held to at install (`BODY_BYTES` in `declare.ts`).
 *
 * NOT THE FETCH'S TWO MEGABYTES. The run is a row of the event log, which a Durable Object holds to two megabytes a row,
 * so an answer at the fetch's cap could never be written; and every run of the month is read back to count it
 * (`listActions`), so what one run keeps is paid for by every read of the action.
 */
export const ANSWER_KEPT_BYTES = 8_192;

/** What a run keeps of a call's answer: the status, and the body to its ceiling, `null` when it is withheld. */
export type KeptAnswer = { status: number; body: string | null; cut: boolean };

/**
 * A call's answer, as its run keeps it: a call's answer is recorded.
 *
 * THE KEY IS ALREADY OUT OF IT. The executor strikes every spelling of the key it sent from the body before the record
 * sees it (`sendAction`). WHAT STILL LOOKS LIKE A KEY IS WITHHELD WHOLE, because the event log is exported, shown to
 * agents and never rewritten: a provider that answers with a token of its own (a session, a signed link) would
 * otherwise put that token in every copy of the record for good. The status is kept either way, so the run still says
 * what the provider answered.
 */
export function keptAnswer(answer: { status: number; body: string }): KeptAnswer {
  const bytes = new TextEncoder().encode(answer.body);
  const cut = bytes.length > ANSWER_KEPT_BYTES;
  /* CUT ON A CHARACTER, so the kept text is text: a cut through a character decodes as a replacement mark, which goes. */
  const head = cut ? new TextDecoder().decode(bytes.subarray(0, ANSWER_KEPT_BYTES)) : answer.body;
  const body = cut && head.endsWith(String.fromCharCode(0xfffd)) ? head.slice(0, -1) : head;
  return { status: answer.status, body: looksLikeCredential(body) ? null : body, cut };
}

/**
 * The run, metered: one `pull` event, whatever happened.
 *
 * FROM THE FIRST RUN, because a meter that starts when billing starts has no history to bill against.
 * `to_v` carries `runs · requests · bytes · ms · cpu_ms · failures` and the scope, which is the action's project or
 * `global`, so a per-account ledger in the Directory can sum these without reading anything else. No key and
 * no header is in it: a host, a status and five numbers, and a `call`'s answer (`keptAnswer`), which is what the
 * action's runs show of what the provider said.
 */
export function meter(deps: Pick<ActionDeps, 'sql' | 'mint' | 'nowMs'>, usage: Usage, say: string): Metered {
  const event = deps.mint();
  const at = instant(deps.nowMs);
  const scope = usage.project ?? 'global';
  /* A RUN THAT NEVER STARTED IS NOT A RUN, AND A RUN THAT FAILED IS NOT ONE EITHER. A job whose pack was turned
     off, or one the plan's limit held, sent nothing, so it counts nothing against the allowance. It is still an
     event, so it is never silent.

     A FAILURE IS FREE, and rule 5 above is why: the account is metered for the work it got. A 429, a 502, a timeout and
     a dropped connection gave it none, and the run is going to be tried again, so charging for it bills somebody up to
     eight times for one provider's outage. `failed` is the ladder's outcome and only the ladder's: a 401 pauses
     (`paused`), an origin the host would not call is `refused`, and both of those are answers the record asked for and
     got. `failures` still counts, so a free run is never an invisible one; its `bytes` and `ms` count nothing either,
     because the allowance limits both and a run that is not owed must not spend them. */
  const free = usage.outcome === 'dropped' || usage.outcome === 'held' || usage.outcome === 'failed';
  const counted = {
    runs: free ? 0 : 1,
    requests: free ? 0 : usage.requests,
    bytes: free ? 0 : usage.bytes,
    ms: free ? 0 : usage.ms,
    failures: usage.failures,
    held: usage.outcome === 'held' ? 1 : 0,
    cpu_ms: free ? 0 : (usage.cpu_ms ?? 0),
  };
  /* A SCRIPT'S RUN IS ON THE SCRIPT'S DECLARATION. The channel alone decides it, so the Directory's ledger, which keys
     on the name, needs nothing new, and the run history of `script.gold-rate` is not filed under an ingest that
     does not exist. */
  deps.sql.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, to_v, note) VALUES (?, ?, ?, 'pull', ?, 'declaration', ?, ?)",
    event,
    at,
    usage.actor ?? `ingest:${usage.ingest}`,
    `declaration:${usage.channel === 'script' ? 'script' : 'ingest'}.${usage.ingest}`,
    JSON.stringify({
      channel: usage.channel,
      host: usage.host,
      status: usage.status,
      outcome: usage.outcome,
      scope,
      usage: counted,
      ...(usage.answer === undefined ? {} : { answer: keptAnswer(usage.answer) }),
      ...(usage.quiet ? { quiet: 1 } : {}),
      ...(usage.questions === undefined ? {} : { questions: usage.questions }),
    }),
    say.slice(0, 280),
  );
  return { event, at, ingest: usage.ingest, channel: usage.channel, scope, outcome: usage.outcome, usage: counted };
}

/** Whether a job names no row: a clock's fire, or a `call` step's in a run with none. A payload that is not JSON names none. */
function aboutNoRow(payload: string): boolean {
  try {
    const said = JSON.parse(payload) as { entry?: unknown } | null;
    return said === null || typeof said !== 'object' || said.entry === undefined;
  } catch {
    return true;
  }
}

/**
 * An answer comes back, and the run is finished in one transaction.
 *
 * 401 AND 403 PAUSE. They are facts about the key, and eight exponential retries against somebody's auth
 * endpoint is how an account gets locked. The row pauses, the key is marked stale, the event says so, the
 * owner is told, and the job is `done` so the ladder never sees it.
 *
 * 2XX IS A RUN. A `poll` compares the hash of the answer with the last one it kept and hands the answer to
 * the ingest pipeline only when it differs, so its rule fires on a change and on nothing else; the first
 * answer is a change. A `pull` hands every answer on. A `call` about no row hands it on too, where it declares `writes`
 * and an `extract` or a `map`; a call about a row keeps nothing of it. Either way the answer goes with the ack to the
 * run a `call` step parked on it, if one did, and every other ack of a job carries the sentence it stopped on, for the
 * same run.
 *
 * 429, 5XX, A TIMEOUT AND THE NETWORK WALK THE LADDER, by acking the job `failed`: the outbox's backoff,
 * doubling minutes, and at the eighth failure a dead letter a person sees. Every rung is an event.
 *
 * `WRONG_KEY` PAUSES TOO. The host holds no key store, or the key did not open on it, so nothing was sent and
 * nothing would be sent next time. The row pauses with the executor's sentence; the key is not marked stale.
 *
 * ANYTHING ELSE IS REFUSED AND NOT RETRIED: an origin the host would not call, an answer over the cap, any
 * other 4xx. Retrying those sends the same wrong request again.
 */
export function finishAction(deps: ActionDeps, ready: Ready, answer: ActionAnswer, hash: string): Metered {
  const { job, decl, request, host } = ready;
  const { ingest, channel } = request;

  /* HELD AT THE PLAN'S LIMIT: nothing was sent. The job is finished, the action waits until `until` (or later,
     if it was already due later), and the event carries the host's one sentence. It is not paused, so nobody
     has to resume it: it runs again on its own when the month turns. */
  if ('held' in answer && answer.held !== undefined) {
    deps.ack({ id: job.id, state: 'done', leasedUntil: job.leasedUntil, result: { failed: answer.held.say } });
    deps.sql.exec(
      "UPDATE schedule SET due_at = MAX(due_at, ?) WHERE kind = ? AND key = ? AND state = 'pending'",
      instant(answer.held.until),
      channel,
      ingest,
    );
    return meter(deps, { ingest, channel, host, project: decl.project, status: null, outcome: 'held', requests: 0, bytes: 0, ms: 0, failures: 0 }, answer.held.say);
  }

  /* A CALL'S ANSWER IS KEPT ON ITS RUN, whatever the status, so the action's runs say what the provider said and not only
     that it answered (`keptAnswer`). A call about a row sent a post whose reply nothing else keeps; one a clock fired
     may write its answer somewhere, and the run still shows what came back when it could not. */
  const answered = channel === 'call' && 'body' in answer ? { answer: { status: answer.status, body: answer.body } } : {};
  const base = { ingest, channel, host, project: decl.project, requests: answer.requests, bytes: answer.bytes, ms: answer.ms, ...answered };
  const status = 'status' in answer ? answer.status : null;

  if (status === 401 || status === 403) {
    const said = `${ingest} stopped: ${host} answered ${status} to the key "${request.grant?.label ?? 'none'}". It will not retry until somebody resumes it.`;
    deps.ack({ id: job.id, state: 'done', leasedUntil: job.leasedUntil, result: { failed: said } });
    if (request.grant) deps.sql.exec('UPDATE grant SET stale_at = ? WHERE id = ?', instant(deps.nowMs), request.grant.id);
    pause(deps, channel, ingest, `${ingest} is paused: ${host} refused the key "${request.grant?.label ?? 'none'}" with ${status}.`);
    return meter(deps, { ...base, status, outcome: 'paused', failures: 1 }, said);
  }

  /* THE HOST COULD NOT OPEN THE KEY: it holds no key store yet, or the key does not open on it. Nothing was sent,
     and the next interval would send nothing again, so the action pauses the way a refused key does, with the
     executor's sentence. The key is NOT marked stale, because no provider ever saw it. */
  if ('refused' in answer && answer.refused.code === 'WRONG_KEY') {
    const said = `${ingest} stopped. ${answer.refused.fix} It will not retry until somebody resumes it.`;
    deps.ack({ id: job.id, state: 'done', leasedUntil: job.leasedUntil, result: { failed: said } });
    pause(deps, channel, ingest, `${ingest} is paused. ${answer.refused.fix}`);
    return meter(deps, { ...base, status: null, outcome: 'paused', failures: 1 }, said);
  }

  if (status !== null && status >= 200 && status < 300 && 'body' in answer) {
    const row = deps.sql.one<{ id: string; payload: string }>('SELECT id, payload FROM schedule WHERE kind = ? AND key = ?', channel, ingest);
    let kept: Record<string, unknown> = {};
    try {
      kept = row ? (JSON.parse(row.payload) as Record<string, unknown>) : {};
    } catch {
      kept = {};
    }
    /* A CALL ABOUT NO ROW KEEPS ITS ANSWER WHERE ITS DECLARATION SAYS: one its clock fired, or one a `call` step made
       in a run that has no row. Such a call is a read of somebody's service, a rate or a balance, and with `writes` and
       a `map` it lands as a pull's answer does. A call about a row is a post of that row, and its answer lands nowhere
       but in the run that waits on it. */
    const changed = channel === 'poll' ? kept.seen !== hash : channel === 'pull' || (channel === 'call' && aboutNoRow(job.payload));
    let outcome: Usage['outcome'] = channel === 'poll' ? (changed ? 'changed' : 'unchanged') : 'ok';
    let say = channel === 'poll'
      ? changed ? `${ingest} polled ${host}, and the answer changed.` : `${ingest} polled ${host}, and the answer is the same.`
      : channel === 'call' ? `${ingest} called ${host}, and it answered ${status}.` : `${ingest} fetched from ${host}.`;

    if (changed && decl.writes?.register !== undefined && (decl.extract !== undefined || decl.map !== undefined)) {
      /* A POLL'S ARRIVALS ARE KEYED BY RUN, so an answer that goes A, B and back to A is three changes and
         not a redelivery of the first. A PULL'S ARE KEYED BY CONTENT, so the same page twice is one row. A CALL'S BY RUN,
         as a poll's: the same rate on two days is two readings. */
      const sha = channel === 'poll' || channel === 'call' ? `${ingest}:${hash}:${job.id}` : `${ingest}:${hash}`;
      /* ONE ANSWER, SEVERAL ROWS: a poll whose map is a list hands the same answer in once a map, so three numbers at
         one address cost one request. Each arrival is its own, keyed by its place in the list. */
      const arrivals = Array.isArray(decl.map)
        ? decl.map.map((map, i) => deps.arrive({ ...decl, map }, answer.body, `${sha}:${i}`))
        : [deps.arrive(decl, answer.body, sha)];
      const failed = arrivals.find((a) => !a.ok);
      if (failed) {
        outcome = 'refused';
        say = `${ingest} ran, and its answer could not be written: ${'refusal' in failed ? failed.refusal.fix : 'BrainDog refused it'}`;
      }
    }

    if (row)
      deps.sql.exec(
        'UPDATE schedule SET payload = ? WHERE id = ?',
        JSON.stringify({ ...kept, since: instant(deps.nowMs), ...(channel === 'poll' ? { seen: hash } : {}) }),
        row.id,
      );
    /* A CALL'S ANSWER GOES BACK WITH ITS ACK, whole, and the outbox hands it to a run that waits on it (`outbox.ts`'s
       `ack`); the run holds it to `VAR_BYTES` there. A call no step waits on keeps nothing of it, as it always has. */
    deps.ack({ id: job.id, state: 'done', leasedUntil: job.leasedUntil, ...(channel === 'call' ? { result: { answer: answer.body } } : {}) });
    return meter(deps, { ...base, status, outcome, failures: outcome === 'refused' ? 1 : 0 }, say);
  }

  const transient =
    status === 429 || (status !== null && status >= 500) || ('refused' in answer && answer.refused.code === 'PULL_PROVIDER_UNAVAILABLE');
  const why =
    'refused' in answer
      ? `${answer.refused.code}: ${answer.refused.fix}`
      : transient
        ? `PULL_PROVIDER_UNAVAILABLE: ${host} answered ${String(status)}.`
        : `PULL_REQUEST_REFUSED: ${host} answered ${String(status)}, which this action does not expect.`;

  if (transient) {
    /* NO SOONER THAN THE PROVIDER SAID. A 429 or a 503 that names a `Retry-After` has said when it will answer, and a
       rung of the ladder that came round first is a request it has already said it will refuse. The instant goes on
       the ack in the shape a paged pull's finish carries it (`pullFinishOf`), which is where `ack()` reads it when it
       arms the retry; nothing else in that shape applies to one request, and `finishPull` writes nothing for a
       `failed` run beyond the cursor this one does not carry. */
    const notBefore = 'notBefore' in answer && typeof answer.notBefore === 'number' && Number.isFinite(answer.notBefore) ? answer.notBefore : null;
    deps.ack({
      id: job.id,
      state: 'failed',
      error: why,
      leasedUntil: job.leasedUntil,
      ...(notBefore === null ? {} : { result: { outcome: 'failed', error: { notBefore } } }),
    });
    const later = notBefore === null ? '' : ` ${host} asked for nothing before ${instant(notBefore)}.`;
    return meter(deps, { ...base, status, outcome: 'failed', failures: 1 }, `${ingest} failed and will try again later.${later} ${why}`);
  }

  const said = `${ingest} was not retried. ${why}`;
  deps.ack({ id: job.id, state: 'done', leasedUntil: job.leasedUntil, result: { failed: said } });
  return meter(deps, { ...base, status, outcome: 'refused', failures: 1 }, said);
}

/* ── the pass ───────────────────────────────────────────────────────────── */

/** What one pass needs, each step in its own transaction. */
export type RunnerSteps = {
  drain: () => Drained;
  lease: (n: number) => OutboxRow[];
  prepare: (job: OutboxRow) => Ready | Paged | Scripted | Metered;
  /**
   * Apply what a script's run handed back, or say why no sandbox answered (`script-run.ts`'s `finishScript`).
   *
   * OPTIONAL BECAUSE THE WIRING IS ANOTHER FILE'S. A pass whose steps cannot finish a script hands the row back
   * unrun, and a step list written before scripts existed still compiles.
   */
  finishScript?: (scripted: Scripted, answer: ScriptAnswer | ScriptUnrun) => Metered;
  finish: (ready: Ready, answer: ActionAnswer, hash: string) => Metered;
  /** Finish a connector job this host cannot run, so the schedule can offer it to one that can. */
  release: (paged: Paged) => void;
  /** Meter that non-run, so a connector nobody can run is visible rather than silently absent. */
  dropPaged: (paged: Paged, why: string) => Metered;
  /** Meter a connector run the host carried out, on the record's terms rather than the host's. */
  meterPaged: (paged: Paged, report: PagedReport) => Metered;
  /** Hand back a leased row this pass will not run, so the next invocation finds it waiting. */
  releaseJob: (job: OutboxRow) => void;
};

/**
 * WHAT ONE INVOCATION MAY SPEND, SHARED ACROSS EVERY RECORD IT DRAINS (`47 §2.3`).
 *
 * The Worker's ceiling is per invocation and not per record, and one invocation drains every
 * record that rang. So a cap inside a single pass would not bound it: five records at five runs
 * each is twenty-five runs under a limit meant for the lot. The host makes one of these per
 * invocation and hands the same object to every pass.
 *
 * `left` GOES DOWN AND NEVER UP. A run that was reserved and then failed still spent the
 * subrequests it made, and giving them back would let a failing connector retry inside one
 * invocation until the real ceiling stopped it, which is the outage this exists to prevent.
 */
export type Budget = {
  /** What is still unspent. Goes down and never up. */
  left: number;
  /** What it started at, so a pass can tell "nothing has run yet" from "there is no room left". */
  total: number;
  /**
   * AND WHEN THE PASS STOPS STARTING RUNS, as the clock reads it (`now`), or absent for never (F35, perf2). A run that
   * started goes to its end, held to its own `wall_ms`; what is leased behind it once this has passed goes back for the
   * next pass, as a run the subrequests had no room for does (`more`). A host's alarm hands it, so a script that spends
   * its whole thirty seconds is the one run that alarm waits on, and the look and the lint after it still get their share.
   */
  until?: number;
  /** The clock `until` is read on. A Worker's moves across awaits, which is where a run spends its wall time. */
  now?: () => number;
};

/**
 * What one run may cost, in subrequests, reserved before it starts.
 *
 * A CONNECTOR IS RESERVED FOR ITS WHOLE PAGE RUN because that is what it may spend: two per page,
 * the fetch and the write-back, plus the token step, the probe, the credential, the ack and the
 * meter. Anything else is one request and the same tail.
 */
const PAGES_UNSAID = 40;
/* A SCRIPT THAT NAMES NO `fetches` IS RESERVED FOR THE MOST ANY SCRIPT MAY ASK, design section 5's ceiling of 20, and
   not for the sandbox's default of 5. The ceiling is `SCRIPT_CEILINGS.fetches` in `script.ts`, which imports this file,
   so it is written out here rather than imported into a cycle; copying the ceiling means that if the default is raised this over-reserves, where copying the
   default would under-reserve, and an under-reservation is the one that takes a Cloudflare invocation down. */
const FETCHES_UNSAID = 20;
const TAIL = 6;
export const reserveFor = (ready: Ready | Paged | Scripted | Metered): number =>
  'paged' in ready
    ? 2 * (ready.decl.limits?.max_pages ?? PAGES_UNSAID) + TAIL
    : 'scripted' in ready
      ? (ready.scripted.decl.limits?.fetches ?? FETCHES_UNSAID) + TAIL
      : /* A JOB WHOSE DECLARATION HAD GONE COSTS NOTHING: it is already finished and sends nothing. */
        'request' in ready
        ? TAIL
        : 0;

/**
 * The connector runner, wired by the host because it is the host that has the network and the KEK.
 *
 * IT ACKS THE JOB ITSELF. `@braindog/connect`'s `runPull` writes each page and finishes the outbox
 * row through the record's own API as it goes, so this pass must not ack it a second time — an ack
 * on a row another writer already finished is the `PULL_LEASE_EDGE` that would make every healthy
 * run look like a lost lease.
 */
export type PagedRun = (paged: Paged) => Promise<PagedReport>;

/**
 * What a connector run reports back, which is what it SPENT and not what it is owed.
 *
 * THE HOST DOES NOT METER ITS OWN RUN, and that is the whole reason this type exists rather than
 * `Metered`. Metering writes a `pull` event, mints its id and applies one billing rule — a run that
 * failed is free, because a 429 or a timeout gave the account nothing and will be tried again. A
 * host that built its own `Metered` would bypass all three: no event, no rule, and an id minted by
 * the one party with a reason to want it different. So the host says what happened and the record
 * decides what it costs.
 *
 * `say` is the sentence the event carries. It names the connector and the outcome and nothing else:
 * no URL, no header, no field of the credential.
 */
export type PagedReport = {
  outcome: Metered['outcome'];
  requests: number;
  bytes: number;
  ms: number;
  failures: number;
  status?: number | null;
  say: string;
};

/** The SHA-256 of an answer, hex. What a `poll` compares. */
export async function answerHash(body: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * One pass: claim the due rows of the three kinds, lease their jobs, send each through the executor, finish
 * each.
 *
 * THE EXECUTOR RUNS OUTSIDE EVERY TRANSACTION. A request can take ten seconds, and a write lock held across
 * somebody else's API is a record nobody can write to for those ten seconds. The claim and the lease are
 * each one statement, so two passes arriving together find different work or none.
 *
 * AN EXECUTOR THAT THROWS IS THE NETWORK. It is caught, and the run is a transient failure with a sentence
 * that names nothing the executor was holding.
 */
export async function runActions(
  steps: RunnerSteps,
  execute: Execute,
  n = 5,
  page?: PagedRun,
  budget?: Budget,
  script?: ScriptRunner,
): Promise<ActionsRun> {
  const drained = steps.drain();
  const out: ActionsRun = { fired: drained.done, ran: 0, ok: 0, changed: 0, paused: 0, failed: 0, refused: 0, dropped: 0, held: 0, usage: [], more: false };

  const leased = steps.lease(n);
  for (let at = 0; at < leased.length; at++) {
    const job = leased[at]!;
    const ready = steps.prepare(job);

    /* ── what is left of the invocation ────────────────────────────────────────────────────────
       RESERVED BEFORE THE RUN AND NOT COUNTED AFTER IT. A ceiling checked afterwards is a ceiling
       already through: the run that broke it has made its requests, and on Cloudflare the next one
       does not fail politely, it takes the whole invocation down with every other record in it.

       AND ONE RUN ALWAYS GOES, however dear it is. A connector declaring more pages than a whole
       invocation's budget would otherwise be released on every pass for ever, which is a connector
       that never runs and never says why. It runs, it spends what it spends, and the budget is
       over afterwards — which stops everything AFTER it rather than it. */
    const spentAlready = budget !== undefined && budget.left < budget.total;
    /* AND THE PASS'S TIME, once one run has gone: past `until`, the rest waits for the next pass in the same way. */
    const late = budget?.until !== undefined && spentAlready && (budget.now ?? Date.now)() >= budget.until;
    if (budget !== undefined && spentAlready && (late || budget.left < reserveFor(ready))) {
      /* `releaseJob` AND NOT `release`, INCLUDING FOR A CONNECTOR. `release` acks the row done,
         which is right when no host here can ever run it and wrong when the only thing missing is
         room in this invocation: that row is still due, and finishing it would skip the window it
         was going to fetch. Everything still leased behind it goes back the same way. */
      steps.releaseJob(job);
      for (const rest of leased.slice(at + 1)) steps.releaseJob(rest);
      out.more = true;
      break;
    }
    if (budget !== undefined) budget.left -= reserveFor(ready);

    /* ── a script goes to the host's sandbox, leased by the same one leaser ─────────────────────
       THE SANDBOX RUNS OUTSIDE EVERY TRANSACTION, for the executor's reason: a script may take its
       whole `wall_ms`, and a write lock held across somebody's code is a record nobody can write to
       for that long. What it hands back is applied afterwards, in `finishScript`'s one transaction. */
    if ('scripted' in ready) {
      if (!steps.finishScript) {
        /* NOBODY HERE CAN FINISH IT, so it goes back on the shelf untouched rather than being acked
           as run. A pass wired before scripts existed must not quietly swallow their runs. */
        steps.releaseJob(ready.job);
        continue;
      }
      const started = Date.now();
      let answer: ScriptAnswer | ScriptUnrun;
      if (!script)
        answer = { unrun: 'dropped', say: `${ready.scripted.script} is a script, and this host has no sandbox to run it in, so it did not run.`, ms: 0 };
      else
        try {
          answer = await script(ready);
        } catch {
          /* A HOST ADAPTER THAT THROWS IS NOT THE SCRIPT FAILING. It walks the ladder as the network does, and it is
             not one of the three refused runs that pause a script, because the owner cannot fix our host. */
          answer = { unrun: 'failed', say: `${ready.scripted.script} could not be started on this host, and will be tried again.`, ms: Date.now() - started };
        }
      const metered = steps.finishScript(ready, answer);
      out.usage.push(metered);
      if (metered.outcome === 'held') out.held++;
      else if (metered.outcome === 'dropped') out.dropped++;
      else {
        out.ran++;
        if (metered.outcome === 'ok') out.ok++;
        else if (metered.outcome === 'paused') out.paused++;
        else if (metered.outcome === 'failed') out.failed++;
        else out.refused++;
      }
      continue;
    }

    /* ── a connector goes to the other runner, and one pass still leases every row ──────────────
       THE LEASE IS TAKEN IN ONE PLACE, which is the only reason this is safe. A second runner with
       its own `lease` call would be a second claimant on the same rows, and two hosts fetching one
       window from one provider is the double charge the whole lease design exists to prevent. So
       there is one leaser and two executors, and `prepare` decides which executor a row belongs to. */
    if ('paged' in ready) {
      if (!page) {
        /* NO CONNECTOR RUNNER ON THIS HOST. Finish the row rather than leave it leased: the
           schedule fires again on its own interval, and a host that does have one will take it.
           Holding it here would stop the connector on every host, not just this one. */
        steps.release(ready);
        out.usage.push(
          steps.dropPaged(ready, `${ready.paged.ingest} pages, and this host has no connector runner, so nothing was fetched.`),
        );
        out.dropped++;
        continue;
      }
      /* A CONNECTOR RUNNER THAT THROWS IS THE NETWORK, exactly as the executor below is. `runPull`
         is written not to throw, but the host's adapter around it is the host's, and one bad page
         must not take down a pass that is draining four other rows. The row stays acked by whoever
         got that far; what is recorded here is that this pass got nothing. */
      const started = Date.now();
      let report: PagedReport;
      try {
        report = await page(ready);
      } catch {
        report = {
          outcome: 'failed',
          requests: 0,
          bytes: 0,
          ms: Date.now() - started,
          failures: 1,
          say: `${ready.paged.ingest} stopped part way through and fetched nothing.`,
        };
      }
      /* A HELD OR DROPPED CONNECTOR NEVER RAN, SO IT NEVER ACKED, so the row is still leased and
         this pass has to let it go. Leaving it would keep the connector claimed on every host
         until the lease lapsed, which turns "you are at your allowance" into "this connector
         stopped" for as long as the lease lasts. */
      if (report.outcome === 'held' || report.outcome === 'dropped') steps.release(ready);
      const metered = steps.meterPaged(ready, report);
      out.usage.push(metered);
      out.ran++;
      if (metered.outcome === 'ok' || metered.outcome === 'unchanged' || metered.outcome === 'changed') out.ok++;
      else if (metered.outcome === 'paused') out.paused++;
      else if (metered.outcome === 'failed') out.failed++;
      else if (metered.outcome === 'dropped') (out.ran--, out.dropped++);
      else if (metered.outcome === 'held') (out.ran--, out.held++);
      else out.refused++;
      continue;
    }

    if (!('request' in ready)) {
      out.usage.push(ready);
      out.dropped++;
      continue;
    }
    const started = Date.now();
    let answer: ActionAnswer;
    try {
      answer = await execute(ready.request);
    } catch {
      answer = {
        refused: { code: 'PULL_PROVIDER_UNAVAILABLE', fix: `${ready.host} could not be reached.` },
        bytes: 0,
        ms: Date.now() - started,
        requests: 1,
      };
    }
    const hash = 'body' in answer ? await answerHash(answer.body) : '';
    const metered = steps.finish(ready, answer, hash);
    out.usage.push(metered);
    const { outcome } = metered;
    if (outcome === 'held') {
      out.held++;
      continue;
    }
    out.ran++;
    if (outcome === 'ok' || outcome === 'unchanged') out.ok++;
    else if (outcome === 'changed') (out.ok++, out.changed++);
    else if (outcome === 'paused') out.paused++;
    else if (outcome === 'failed') out.failed++;
    else if (outcome === 'dropped') out.dropped++;
    else out.refused++;
  }
  /* A FULL LEASE MAY HAVE LEFT MORE BEHIND IT, so the host goes again now (recheck of 30 October, live 1). A sweep that
     queued sixty scripts at once ran five an alarm, and nothing woke the record for the rest: a script's job is no row
     of the schedule and no queue delivers it, so the fifty-five waited for the next hour's alarm, five at a time, and
     his newest payment, last in the line, waited most of a day to be matched. Only when something here ran, so a pass
     whose jobs were all held at the allowance does not spin. */
  if (leased.length >= n && out.ran > 0) out.more = true;
  return out;
}

/**
 * Start a paused action again, now. The only way one starts again.
 *
 * NOT A REBIND. A key that was refused is still marked stale until somebody binds a new one; resuming says
 * "try again", and if the provider refuses again the action pauses again and the owner is told again.
 */
export function resumeAction(deps: Pick<ActionDeps, 'sql' | 'mint' | 'nowMs'>, ingest: string, actor: string): Result<{ ingest: string; kind: ActionKind }> {
  const row = deps.sql.one<{ id: string; kind: ActionKind }>(
    "SELECT id, kind FROM schedule WHERE kind IN ('pull', 'call', 'poll') AND key = ? AND state = 'paused' ORDER BY kind LIMIT 1",
    ingest,
  );
  if (!row) return no('OUT_OF_BOUNDS', `${ingest} is not paused, so there is nothing to resume.`, { at: 'ingest' });
  deps.sql.exec("UPDATE schedule SET state = 'pending', due_at = ?, attempts = 0 WHERE id = ?", instant(deps.nowMs), row.id);
  deps.sql.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, note) VALUES (?, ?, ?, 'pull', ?, 'declaration', ?)",
    deps.mint(),
    instant(deps.nowMs),
    actor,
    `declaration:ingest.${ingest}`,
    `${ingest} was resumed, and runs now.`,
  );
  return ok({ ingest, kind: row.kind });
}

/* ── the list a person reads ────────────────────────────────────────────── */

type Totals = { runs: number; requests: number; bytes: number; ms: number; failures: number };

/**
 * One scheduled action, as the record's `actions` read answers it.
 *
 * THE KEY IS ITS LABEL, from the keychain's index. Nothing sealed is read to build this, and the run sentences are the
 * `pull` events' own notes, which carry a host, a status and a label and never a value.
 */
export type ActionRow = {
  ingest: string;
  channel: ActionKind;
  /** The project it runs for, as its declaration holds it, or `null` for every project. */
  project: string | null;
  /**
   * The row `project` names, found in the record: its id, its spoken id and its title, or `null` when the action is for
   * every project or names no row. OPTIONAL IN THE TYPE ONLY, so a row built by hand for a test or an older host still
   * reads; `listActions` always answers it.
   */
  project_row?: ProjectRow | null;
  host: string | null;
  every: string;
  key: string | null;
  /**
   * The list the action files what it fetched in (`writes.register`), or `null` when it files nothing. OPTIONAL IN THE
   * TYPE ONLY, as `project_row` is; `listActions` always answers it. A reader finds a hand-drafted action by what it
   * writes where its name is not the one a preset would have given it.
   */
  writes?: string | null;
  state: 'pending' | 'firing' | 'paused' | 'done';
  /** When it runs next, while it is pending or firing. A paused or finished action has none. */
  next: string | null;
  /**
   * The last run. `answer` is what a `call`'s provider answered, as the run kept it (`keptAnswer`); absent on a poll, a
   * pull, and a call's run that got no answer.
   */
  last: { at: string; outcome: Metered['outcome']; status: number | null; note: string; answer?: KeptAnswer } | null;
  /** This calendar month so far, UTC. `held` is how many runs the plan's limit held, which count no run. */
  month: Totals & { held: number };
  /** This month by UTC day, from the first to today, oldest first. */
  days: ({ day: string } & Totals)[];
};

const ROW_STATES: readonly string[] = ['pending', 'firing', 'paused', 'done'];

/** A project an action runs for, as the record holds it: the row's id, the id a person says, and its title. */
export type ProjectRow = { id: string; spoken: string; title: string | null };

/**
 * The project row an action's declaration names, by its row id or its spoken id (`things#1`), or `null` when there is
 * no such live row.
 *
 * WHY THE HOST IS HANDED THE ROW AND NOT THE WORDS: a declaration holds the project as a row id, which no page and no
 * person reads, and "Runs on" matched it against the project's NAME, so an action declared with `project: things#1` or
 * with the row's id showed on no project page at all. Resolved here, once, the page matches the row it is drawn for and
 * says the project's title where it names one.
 */
function projectRowOf(sql: Sql, ref: string): ProjectRow | null {
  const said = parseSpoken(ref);
  const cols = 'SELECT id, register, seq, fields FROM entry WHERE deleted_at IS NULL AND ';
  type Found = { id: string; register: string; seq: number | null; fields: string };
  const row = said ? sql.one<Found>(`${cols}register = ? AND seq = ?`, said.register, said.seq) : sql.one<Found>(`${cols}id = ?`, ref);
  if (!row) return null;
  const declared = sql.one<{ body: string }>(
    "SELECT body FROM declaration WHERE id = ? AND kind = 'register' AND superseded_at IS NULL AND retired = 0",
    `register.${row.register}`,
  )?.body;
  const field = declared === undefined ? undefined : (JSON.parse(declared) as { title?: unknown }).title;
  const title = typeof field === 'string' ? (JSON.parse(row.fields) as Record<string, unknown>)[field] : undefined;
  return {
    id: row.id,
    spoken: row.seq === null ? row.id : spokenId(row.register, row.seq),
    title: typeof title === 'string' && title.trim() !== '' ? title.trim() : null,
  };
}

type Run = { status: number | null; outcome: Metered['outcome']; usage: Metered['usage']; answer?: unknown };

/** A kept answer as a run's `to_v` holds it, read back, or `undefined` when there is none or it is not one. */
function answerOf(value: unknown): KeptAnswer | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const a = value as { status?: unknown; body?: unknown; cut?: unknown };
  if (typeof a.status !== 'number' || (a.body !== null && typeof a.body !== 'string')) return undefined;
  return { status: a.status, body: a.body, cut: a.cut === true };
}

/** A `pull` event's `to_v`, when `meter` wrote it. Anything else on the same target is not a run. */
function runOf(to_v: string): Run | null {
  try {
    const v = JSON.parse(to_v) as Partial<Run>;
    return typeof v.usage === 'object' && v.usage !== null && typeof v.outcome === 'string' ? (v as Run) : null;
  } catch {
    return null;
  }
}

/**
 * Every active `pull`, `call` and `poll`, with its schedule, its last run and this month's counts.
 *
 * FROM THE RECORD'S OWN ROWS: the declaration, the schedule row it runs from, the key's label, and the `pull` events
 * `meter` wrote. A pack that is off has retired its declarations, so its actions are not in the list.
 */
export function listActions(sql: Sql, nowMs: number): ActionRow[] {
  const today = instant(nowMs);
  const month = today.slice(0, 7);
  const upTo = Number(today.slice(8, 10));

  return sql
    .all<{ body: string }>("SELECT body FROM declaration WHERE kind = 'ingest' AND superseded_at IS NULL AND retired = 0 ORDER BY id")
    .map((r) => JSON.parse(r.body) as ActionDecl & { ingest: string })
    .filter((decl) => (ACTION_KINDS as readonly string[]).includes(decl.channel))
    .map((decl): ActionRow => {
      const channel = decl.channel as ActionKind;
      const target = `declaration:ingest.${decl.ingest}`;
      const row = sql.one<{ state: string; due_at: string }>('SELECT state, due_at FROM schedule WHERE kind = ? AND key = ?', channel, decl.ingest);
      const state = row && ROW_STATES.includes(row.state) ? (row.state as ActionRow['state']) : 'done';
      const address = addressOf(decl);

      let last: ActionRow['last'] = null;
      for (const e of sql.all<{ ts: string; to_v: string; note: string | null }>(
        "SELECT ts, to_v, note FROM event WHERE kind = 'pull' AND target = ? AND to_v IS NOT NULL ORDER BY rowid DESC LIMIT 20",
        target,
      )) {
        const run = runOf(e.to_v);
        if (run) {
          const answer = answerOf(run.answer);
          last = { at: e.ts, outcome: run.outcome, status: run.status ?? null, note: e.note ?? '', ...(answer === undefined ? {} : { answer }) };
          break;
        }
      }

      const totals = { runs: 0, requests: 0, bytes: 0, ms: 0, failures: 0, held: 0 };
      const days = Array.from({ length: upTo }, (_, i) => ({ day: `${month}-${String(i + 1).padStart(2, '0')}`, runs: 0, requests: 0, bytes: 0, ms: 0, failures: 0 }));
      /* THE COUNTS ONLY, TAKEN OUT IN SQL. A call's run carries its answer (`ANSWER_KEPT_BYTES`), and a month of a call
         every fifteen minutes is three thousand of them; the sum needs the outcome and the six numbers, so that is all
         that leaves the database. A `to_v` that is not JSON was never a run (`runOf`), and `json_valid` skips it before
         `json_extract` could throw on it. */
      for (const e of sql.all<{ ts: string; to_v: string }>(
        `SELECT ts, json_object(
             'outcome', json_extract(to_v, '$.outcome'),
             'usage', CASE WHEN json_type(to_v, '$.usage') = 'object' THEN json(json_extract(to_v, '$.usage')) END
           ) AS to_v
           FROM event WHERE kind = 'pull' AND target = ? AND to_v IS NOT NULL AND json_valid(to_v) AND ts >= ? ORDER BY rowid`,
        target,
        `${month}-01`,
      )) {
        const run = runOf(e.to_v);
        if (!run || e.ts.slice(0, 7) !== month) continue;
        const u = run.usage;
        totals.runs += u.runs ?? 0;
        totals.requests += u.requests ?? 0;
        totals.bytes += u.bytes ?? 0;
        totals.ms += u.ms ?? 0;
        totals.failures += u.failures ?? 0;
        totals.held += u.held ?? 0;
        const day = days[Number(e.ts.slice(8, 10)) - 1];
        if (day) {
          day.runs += u.runs ?? 0;
          day.requests += u.requests ?? 0;
          day.bytes += u.bytes ?? 0;
          day.ms += u.ms ?? 0;
          day.failures += u.failures ?? 0;
        }
      }

      const project = typeof decl.project === 'string' && decl.project !== '' && decl.project !== 'global' ? decl.project : null;
      return {
        ingest: decl.ingest,
        channel,
        project: typeof decl.project === 'string' && decl.project !== '' ? decl.project : null,
        project_row: project === null ? null : projectRowOf(sql, project),
        host: address && originOf(address) ? new URL(address).host : null,
        every: decl.every ?? '',
        key: decl.grant === undefined || decl.grant === '' ? null : (keyNamed(sql, decl.grant)?.label ?? decl.grant),
        writes: typeof decl.writes?.register === 'string' && decl.writes.register !== '' ? decl.writes.register : null,
        state,
        next: row && (state === 'pending' || state === 'firing') ? row.due_at : null,
        last,
        month: totals,
        days,
      };
    });
}

/* ── what an action sends out, as the owner approves it ─────────────────── */

/** How many calls one action makes from rules in one UTC day. The next one is held, with one sentence, and counts as held. */
export const RULE_CALLS_PER_DAY = 100;

/**
 * One action's egress: where it calls, how often, which key by label, and which fields leave with it.
 *
 * WHAT THE OWNER READS BEFORE THE ONE PRESS. The plan diff prints it as `calls_out`, and a proposal that adds or
 * changes an action carries it as the lines approving it would arm.
 */
export type Egress = {
  /** The action's ingest id, or a script's or a digest's own id: the name the line is about. */
  ingest: string;
  channel: ActionKind | 'script' | 'digest';
  method: 'GET' | 'POST';
  host: string | null;
  /** The interval it runs on, or `null` for a call only a rule runs. */
  every: string | null;
  trigger: 'schedule' | 'rule' | 'both';
  /** The most rule-fired calls in a day, or `null` when no rule runs it. */
  per_day: number | null;
  /** The key by its label, or by a grant id for a `pull`. Never a value. */
  key: string | null;
  /**
   * Whether this action PAGES, which decides which of the record's two data keys has to open its credential.
   *
   * A CONNECTOR GOES THROUGH `sealedGrant` AND THE CONNECTOR KEY; everything else goes through `openGrant` and the
   * record key (`12 §6`). So "the key must be sealed for a connector" is true of exactly these and false of the
   * rest, and a check that did not know the difference would refuse every `call` and `poll` in the record.
   */
  paged: boolean;
  sends: string[];
  project: string | null;
  /** The diff's own sentence: `CALLS OUT <host> · every <n> · grant "<label>"`, and the trigger and fields when there are any. */
  line: string;
  /**
   * An action sending a key gets a line of its own (question 8). A project's action names the project and the key, and
   * says when the key is kept for every project; a key whose keychain entry names no host says the host this
   * approval pins it to. `null` when there is neither.
   */
  key_line: string | null;
};

/** The host an address names: the parsed host, or the authority as written when it will not parse, so a bad one still says where. */
function hostOf(address: string | null): string | null {
  if (address === null || address === '') return null;
  try {
    return new URL(address).host;
  } catch {
    return address.replace(/^[a-z]+:\/\//i, '').split(/[/?#]/)[0] || null;
  }
}

const joinedList = (items: readonly string[]): string =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

/**
 * The egress of one ingest body, or `null` when it calls nothing out.
 *
 * STATIC, FROM THE DECLARATION ALONE. A `pull` and a `poll` run on their interval; a `call` runs on its interval, when a
 * rule says so, or both. Nothing here reads the record, so a pack's plan and a proposal print the same lines. The one
 * exception is a project's name: `nameOf` turns the row id a declaration holds into the words its owner gave it, so the
 * key line says "the project Lanternly", not a row id. Without one, or for a row it cannot find, the id is said as written.
 * The other is `opensOf`, what a keychain label's live entry opens, which a script's line names beside each key
 * (`scriptEgress`); an action has one host and says it already.
 */
export function egressOf(
  body: unknown,
  nameOf?: (project: string) => string | null,
  opensOf?: (label: string) => string | null,
  scopeOf?: (label: string) => readonly string[] | null | undefined,
): Egress | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
  if (typeof (body as { script?: unknown }).script === 'string') return scriptEgress(body as ScriptHeader, opensOf);
  if (typeof (body as { digest?: unknown }).digest === 'string') return digestEgress(body as DigestHeader);
  const d = body as Partial<ActionDecl> & { ingest?: unknown; channel?: unknown; every?: unknown; project?: unknown };
  const channel = d.channel;
  if (typeof channel !== 'string' || !(ACTION_KINDS as readonly string[]).includes(channel)) return null;
  const trigger = channel === 'call' && (d.trigger === 'rule' || d.trigger === 'both') ? d.trigger : 'schedule';
  const every = typeof d.every === 'string' ? d.every : null;
  if (every === null && trigger === 'schedule') return null;

  const host = hostOf(addressOf(d as ActionDecl));
  /* A PULL'S KEY IS THE ONE `fetch.auth` NAMES, when it names one, because that is the key the requests are actually
     signed with (`keyNameOf`, `pull.ts`), not always `grant`, which a paged pull's own approval line and `install`'s
     `PLAN_STALE` check both read through this one function, so the fix lands for both at once. Every other channel
     keeps reading its top-level `grant`, as it always did. */
  const key = (channel === 'pull' ? keyNameOf(d) : typeof d.grant === 'string' && d.grant !== '' ? d.grant : undefined) ?? null;
  const sends = trigger === 'schedule' || !Array.isArray(d.sends) ? [] : d.sends.filter((s): s is string => typeof s === 'string');
  const project = typeof d.project === 'string' && d.project !== '' ? d.project : null;
  const ingest = typeof d.ingest === 'string' ? d.ingest : '';
  const perDay = trigger === 'schedule' ? null : RULE_CALLS_PER_DAY;

  const when =
    trigger === 'schedule'
      ? `every ${every ?? ''}`
      : `${trigger === 'both' ? `every ${every ?? ''} and ` : ''}when a rule runs it, at most ${RULE_CALLS_PER_DAY} a day`;
  const line = `CALLS OUT ${host ?? 'no host declared'} · ${when} · grant "${key ?? 'none'}"${sends.length ? ` · sends ${sends.join(', ')}` : ''}`;
  /* A PROJECT'S ACTION GETS A LINE OF ITS OWN, and a global one does not, unless its key is being pinned to a host.
     The line names the project and the key, which is the fact somebody would otherwise have to go and look up. A key
     kept for another project never gets this far: `keyOutOfScope` refuses it at declaration. */
  const said: string[] = [];
  /* A GLOBAL KEY IN A PROJECT'S ACTION KEEPS ITS OWN LINE, and says it is kept for every project, because that
     is the one thing a reader approving a project's action would otherwise assume the other way. `scopeOf` reads the
     key's row; without one, or for a key no row places, the line says what it always did. */
  if (project !== null && key !== null)
    said.push(
      `${ingest} runs for the project ${nameOf?.(project) ?? project} and sends the key "${key}"${scopeOf?.(key) === null ? ', which is kept for every project' : ''}.`,
    );
  /* A KEY WHOSE ENTRY NAMES NO HOST IS PINNED BY THIS APPROVAL to the host this action calls (`pinHost`), so the line
     says so: from then on the host refuses to send it anywhere else. Only when the keychain was asked and holds an entry. */
  const pinTo = key !== null && host !== null ? hostOpened(host) : null;
  const opens = pinTo === null || key === null ? null : (opensOf?.(key) ?? null);
  if (pinTo !== null && opens !== null && heldHost(opens) === null) said.push(`This key will be sent to ${pinTo} only from now on.`);
  const key_line = said.length === 0 ? null : said.join(' ');

  return { ingest, channel: channel as ActionKind, method: channel === 'call' ? 'POST' : 'GET', host, every, trigger, per_day: perDay, key, paged: pages(d as ActionDecl), sends, project, line, key_line };
}

/** The part of a `script` body its egress is read from. The whole shape is `ScriptBody` in `script.ts`, which imports this file. */
type ScriptHeader = { script: string; title?: unknown; runs?: { every?: unknown; door?: unknown; rule?: unknown }; egress?: unknown; keys?: unknown; reads?: unknown };

/**
 * A script's egress, from its header, or `null` when it fetches from nowhere.
 *
 * ONE LINE FOR EVERY ORIGIN, NOT ONE PER ORIGIN, because the thing approved is the script: its origins, its keys and its
 * clock are one decision, and splitting them would let a reader approve two lines of three. `host` is the first origin,
 * because `Egress` holds one and the plan diff compares by it; the line carries them all.
 *
 * AND A SCRIPT THAT READS AND FETCHES SAYS SO IN ITS OWN SENTENCE (design section 2). Reading and fetching
 * together is the one exfiltration path a script has, and the sentence is the owner's only chance to see it.
 *
 * `trigger` HAS NO WORD FOR A DOOR. It is the plan diff's closed union, owned by `@braindog/declare`, and a door-started
 * script is reported as rule-started there. The line says `when <door> receives an arrival`, which is the truth.
 *
 * EACH KEY IS SAID WITH THE HOST IT GOES TO, because the host sends a key only where its keychain entry opens
 * (`keyRefused` in `@braindog/host`) and the line named the origins and the keys as two lists. A script with two
 * origins and one key was approved without anybody being told which origin gets the key, which is the pairing that was
 * found broken at run time. `opensOf` reads the keychain by label, as the host resolves it; a caller that cannot reach the
 * keychain, or a label it holds no live entry for, says "to the host its keychain entry opens", which is where the answer is.
 */
function scriptEgress(d: ScriptHeader, opensOf?: (label: string) => string | null): Egress | null {
  const origins = Array.isArray(d.egress) ? d.egress.filter((o): o is string => typeof o === 'string') : [];
  if (origins.length === 0) return null;
  const hosts = origins.map((o) => hostOf(o) ?? o);
  const keys = Array.isArray(d.keys) ? d.keys.filter((k): k is string => typeof k === 'string') : [];
  const reads = Array.isArray(d.reads) ? d.reads.filter((r): r is string => typeof r === 'string') : [];
  const every = typeof d.runs?.every === 'string' ? d.runs.every : null;
  const door = typeof d.runs?.door === 'string' ? d.runs.door : null;
  const rule = d.runs?.rule === true;

  const when = [
    ...(every === null ? [] : [`every ${every}`]),
    ...(door === null ? [] : [`when ${door} receives an arrival, at most ${RULE_CALLS_PER_DAY} a day`]),
    ...(rule ? [`when a rule runs it, at most ${RULE_CALLS_PER_DAY} a day`] : []),
  ];
  /* THE HOST THE KEY IS SENT TO, NOT THE WORDS IT WAS PUT IN WITH. Both are `hostOpened`'s reading, the one `keyRefused`
     runs, and the host is compared without its port as `keyRefused` compares it. Where the words name no host, or one
     this script never calls, every fetch with the key is refused at run time and the script pauses after its third, so
     the line says that instead of printing the words as though they were a destination. */
  const called = new Set(origins.map((o) => hostOpened(o)).filter((h): h is string => h !== null));
  const to = (label: string): string => {
    const opens = opensOf?.(label)?.trim();
    if (!opens) return 'the host its keychain entry opens';
    const host = hostOpened(opens);
    return host !== null && called.has(host) ? host : `no host it calls (its keychain entry opens ${JSON.stringify(opens)}), so every fetch with it is refused`;
  };
  const line = `CALLS OUT ${joinedList(hosts)} · ${when.join(' and ') || 'never'} · ${keys.length === 0 ? 'no key' : `key ${joinedList(keys.map((k) => `"${k}" to ${to(k)}`))}`}`;
  /* SAID BY ITS TITLE, the words its install sheet names it by ("Read the next events from your calendar"), and its
     lists as words: `calendar_poll reads events` was a line of code on the sheet. A script with no title is "This script". */
  const title = typeof d.title === 'string' && d.title.trim() !== '' ? `“${d.title.trim()}”` : 'This script';
  const key_line = reads.length > 0 ? `${title} reads ${joinedList(reads.map((r) => r.replace(/_/gu, ' ')))} and may send what it reads to ${joinedList(hosts)}.` : null;

  return {
    ingest: d.script,
    channel: 'script',
    /* A SCRIPT'S FETCH TAKES ANY METHOD, and the wider of the two is the honest one to approve. */
    method: 'POST',
    host: hosts[0] ?? null,
    every,
    trigger: every !== null && (door !== null || rule) ? 'both' : every !== null ? 'schedule' : 'rule',
    per_day: rule ? RULE_CALLS_PER_DAY : null,
    key: keys.length === 0 ? null : keys.join(', '),
    paged: false,
    sends: [],
    project: null,
    line,
    key_line,
  };
}

/** The part of a `digest` body its egress is read from. The whole shape is `DigestDecl` in `digest.ts`. */
type DigestHeader = {
  digest: string;
  schedule?: { day?: unknown; at?: unknown; tz?: unknown };
  channels?: unknown;
  sections?: unknown;
  webhook?: { url?: unknown; grant?: unknown };
};

/**
 * A digest's egress, from its `webhook` channel, or `null` when everything it assembles stays with the owner.
 *
 * ONLY THE WEBHOOK, because it is the one channel a digest has that posts to an address the declaration chose. In-app,
 * email and push go to the record's own owners, and `mcp` sends nothing. Measured: a digest filed posting a table of
 * Notes to `https://collector.example.com/in` and read `approve: null` on the stored proposal: the owner was asked
 * about a title, and when its clock came `digest.ts` posted the owner's row to that address.
 *
 * WHAT IT CARRIES IS SAID AS THE SECTIONS' SOURCES, in `sends`, so a digest that starts posting another list is a change
 * the owner is asked about again, as a call that sends another field is. `grant` is said when it is declared, as an
 * action's is, and `digest.ts` names it on the `notify.webhook` it queues as the key that signs the post (09 §6).
 */
function digestEgress(d: DigestHeader): Egress | null {
  const channels = Array.isArray(d.channels) ? d.channels : [];
  const url = typeof d.webhook?.url === 'string' ? d.webhook.url : null;
  if (!channels.includes('webhook') || url === null) return null;
  const host = hostOf(url);
  const key = typeof d.webhook?.grant === 'string' && d.webhook.grant !== '' ? d.webhook.grant : null;
  const at = typeof d.schedule?.at === 'string' ? d.schedule.at : '';
  const day = typeof d.schedule?.day === 'string' ? d.schedule.day : null;
  const tz = typeof d.schedule?.tz === 'string' && d.schedule.tz !== '' ? ` ${d.schedule.tz}` : '';
  const when = `${day === null ? 'daily' : `weekly on ${day}`} at ${at}${tz}`;
  const sections = (Array.isArray(d.sections) ? d.sections : []).filter(
    (s): s is { source: string; as?: unknown } => s !== null && typeof s === 'object' && typeof (s as { source?: unknown }).source === 'string',
  );
  /* `table` IS WHAT A SECTION WITH NO `as` IS DRAWN AS, `digest.ts`'s default, so it is what the post carries too. */
  const carried = sections.map((s) => {
    const as = typeof s.as === 'string' && s.as !== '' ? s.as : 'table';
    return `${/^[aeiou]/u.test(as) ? 'an' : 'a'} ${as} of ${s.source}`;
  });
  const line = `CALLS OUT ${host ?? 'no host declared'} · ${when} · ${carried.length ? joinedList(carried) : 'no sections'}${key === null ? '' : ` · grant "${key}"`}`;

  return {
    ingest: d.digest,
    channel: 'digest',
    method: 'POST',
    host,
    every: when,
    trigger: 'schedule',
    per_day: null,
    key,
    paged: false,
    sends: sections.map((s) => s.source),
    project: null,
    line,
    key_line: null,
  };
}

/* ── a call a rule runs ─────────────────────────────────────────────────── */

export type CallQueued = {
  ingest: string;
  /** `unknown` is an action a rule may not run; `paused` is one waiting on somebody to resume it. */
  outcome: 'queued' | 'held' | 'paused' | 'unknown';
  say: string;
  /** The outbox job queued, where one was: what a `call` step's run waits on (`flow.ts`). */
  job?: string;
};

/**
 * A rule fired on a row and says `run: <ingest>`, or a run reached a `call` step: queue one call, carrying only the
 * fields its `sends:` names.
 *
 * THE RECORD COPIES THE FIELDS HERE, when the rule fires, so the runner never reads the record. A field whose type is a
 * secret or a file is never copied, whatever the declaration says, because the install lint is one check and this is
 * the second.
 *
 * AT MOST `RULE_CALLS_PER_DAY` A DAY PER ACTION, counted over both doors in: a `run:` about a row and a run's `call`
 * step alike. A bulk change, such as five thousand invoices marked paid, becomes a hundred calls and a held sentence,
 * not five thousand posts. A held call is metered as held, which is not a failure, and the owner is told once that day.
 *
 * A `call` STEP HANDS `run` (`flow.ts`), AND THE JOB CARRIES IT, so the answer finds its way back: `finishAction` acks the
 * job with the answer or the sentence it stopped on, and the outbox's `ack` hands either to the run waiting on it. Such
 * a step may have no row, when the call sends none (the price GET of `07 §6.2`), and then nothing of any row goes.
 */
export function queueCall(
  deps: ActionDeps,
  fired: {
    ingest: string;
    rule: string;
    entry: { id: string; register: string; seq: number | null; fields: Record<string, unknown> } | null;
    typeOf: (field: string) => string | undefined;
    run?: { run: string; step: number } | undefined;
  },
): CallQueued {
  const { ingest, rule, entry } = fired;
  const spoken = entry === null ? 'this run' : entry.seq === null ? entry.id : `${entry.register}#${entry.seq}`;
  const found = deps.lookup(ingest);
  if (!found || found.decl.channel !== 'call' || (found.decl.trigger !== 'rule' && found.decl.trigger !== 'both'))
    return { ingest, outcome: 'unknown', say: `${rule} runs ${ingest}, which is not a call a rule may run, so nothing was sent for ${spoken}.` };
  const { decl } = found;
  const address = addressOf(decl);
  const host = address && originOf(address) ? new URL(address).host : null;
  /* A CALL THAT SENDS FIELDS OF A ROW IS NOT SENT FROM A RUN THAT HAS NONE. The lint refuses such a step on a clock, a
     button or a figure at install (`flow-lint.ts`); this is the second line, for an arrival that wrote no row. */
  if (entry === null && (decl.sends ?? []).length > 0)
    return { ingest, outcome: 'unknown', say: `rule.${rule} calls ${ingest}, which sends fields of a row, and this run has no row, so nothing was sent.` };

  const state = deps.sql.one<{ state: string }>("SELECT state FROM schedule WHERE kind = 'call' AND key = ?", ingest)?.state;
  if (state === 'paused')
    return { ingest, outcome: 'paused', say: `${ingest} is paused, so nothing was sent for ${spoken}. It sends again once somebody resumes it.` };

  const key = keyNamed(deps.sql, decl.grant);
  if (!key) {
    pause(deps, 'call', ingest, `${ingest} is paused: the key "${decl.grant ?? ''}" it sends is not in the keychain.`);
    return { ingest, outcome: 'paused', say: `${ingest} is paused, because the key "${decl.grant ?? ''}" it sends is not in the keychain.` };
  }

  const day = instant(deps.nowMs).slice(0, 10);
  /* A RULE'S CALL IS ONE THAT NAMES A ROW OR A RUN. A scheduled fire carries neither, so the clock's own turns are never
     counted against what rules may start. */
  const today =
    deps.sql.one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM outbox WHERE kind = 'pull.fetch' AND created >= ?
       AND json_extract(payload, '$.ingest') = ? AND (json_extract(payload, '$.entry') IS NOT NULL OR json_extract(payload, '$.run') IS NOT NULL)`,
      day,
      ingest,
    )?.n ?? 0;
  if (today >= RULE_CALLS_PER_DAY) {
    const target = `declaration:ingest.${ingest}`;
    const told = deps.sql.one(
      "SELECT 1 AS x FROM event WHERE kind = 'pull' AND target = ? AND ts >= ? AND json_extract(to_v, '$.outcome') = 'held' LIMIT 1",
      target,
      day,
    );
    const say =
      entry === null
        ? `${ingest} was not called for rule.${rule}: it has made its ${RULE_CALLS_PER_DAY} calls from rules today. This run's call will not be made later; rules can start it again tomorrow.`
        : `${ingest} did not send ${spoken}: it has made its ${RULE_CALLS_PER_DAY} calls from rules today. That row will not be sent later; rules can start it again tomorrow.`;
    meter(deps, { ingest, channel: 'call', host, project: decl.project, status: null, outcome: 'held', requests: 0, bytes: 0, ms: 0, failures: 0 }, say);
    if (!told)
      deps.notify({
        actor: `ingest:${ingest}`,
        say,
        because: `A call a rule runs is sent at most ${RULE_CALLS_PER_DAY} times a day, so a change to many rows cannot become that many posts.`,
      });
    return { ingest, outcome: 'held', say };
  }

  /* THE RUN WAITING ON THE ANSWER, WHERE A STEP ASKED FOR ONE. Nothing else of the run goes in the job: the answer is
     handed back by id (`outbox.ts`'s `ack`), and what the run holds stays in its row. */
  const waiting = fired.run === undefined ? {} : { run: fired.run.run, step: fired.run.step };
  if (entry === null) {
    const job = deps.enqueue({ channel: 'call', ingest, grant: key.id, rule, ...waiting });
    return { ingest, outcome: 'queued', say: `rule.${rule} queued ${ingest}.`, job };
  }

  /* AND A FIELD HOLDING WHAT A SECRET OR A FILE FIELD OF THE SAME ROW HOLDS IS LEFT OUT THE SAME WAY, whatever its own
     type. A rule's `set` writes a secret into a text field before the call is queued, and the type alone let it
     through: measured, `set: { field: party, to: '{{token}}' }` beside `run: paid_hook` queued `party: 'hunter2'`,
     inline and as a run, through `set_var`, another field, `tags` and a branch, and so did two rules that each install
     clean, one writing `party` and one running the call, which no lint of one body can see. The lint now refuses the
     single body at install (`flow-lint.ts`, `sentFrom`); this is the second line, and the only one for the pair. It
     reads the row's values rather than the steps that wrote them, because the pass hands this function the row and
     nothing of the rule, so a field holding the secret's words for another reason is left out too, which costs a call a
     value and sends nothing that should stay.

     RETIRED FIELDS COUNT, SO THE DECLARATION IS READ AND NOT ONLY `typeOf`. The live schema `typeOf` reads drops a
     retired field, and the rows written before it was retired keep the value, which `fill` still reads: measured, with
     `token` retired, the pair above queueing `party: 'hunter2'` while the lint refused the single body, since
     `hiddenOf` there reads the declaration too. */
  const declared = deps.sql.one<{ body: string }>(
    "SELECT body FROM declaration WHERE id = ? AND kind = 'register' AND superseded_at IS NULL AND retired = 0",
    `register.${entry.register}`,
  )?.body;
  const fields = ((declared === undefined ? {} : JSON.parse(declared)) as { fields?: { id?: unknown; type?: unknown }[] }).fields ?? [];
  const declaredAs = (type: string): Set<string> => new Set(fields.filter((f) => f?.type === type).map((f) => String(f.id)));
  const secrets = declaredAs('secret');
  const files = declaredAs('file');
  for (const field of Object.keys(entry.fields)) {
    const type = fired.typeOf(field);
    if (type === 'secret') secrets.add(field);
    if (type === 'file') files.add(field);
  }

  /* A FILE FIELD HOLDS AN OBJECT, AND ITS NAME AND HASH ARE WHAT A COPY OF IT CARRIES. This collected strings only, so
     a file held nothing back: measured, a stored `set: { field: party, to: '{{trigger.row.doc.name}}' }` beside a clean
     `run: paid_hook` and the call queued `party: 'contract-signed.pdf'`, and the same with `.sha256` queued the hash.
     The mime and the size are not held, because `application/pdf` or `1200` in a sent field is what a hundred ordinary
     rows say. */
  const held: string[] = [];
  const hold = (v: unknown): void => {
    for (const one of Array.isArray(v) ? v : [v]) {
      if (typeof one === 'string') {
        if (one !== '') held.push(one);
      } else if (one !== null && typeof one === 'object') {
        const { name, sha256 } = one as { name?: unknown; sha256?: unknown };
        for (const part of [name, sha256]) if (typeof part === 'string' && part !== '') held.push(part);
      }
    }
  };
  for (const [field, v] of Object.entries(entry.fields)) if (secrets.has(field) || files.has(field)) hold(v);

  /* AND EVERY VALUE THE FIELD HAS HELD, NOT ONLY TODAY'S. A copy made before the key changed was sent: with `party`
     copied from `token` on create and a clean rule posting on paid, a grant revoked and deposited again between the
     two, and a token cleared from the row, each queued `party: '<the old grant id>'` (measured in `secret-out.test.ts`,
     2 of 2). A SECRET FIELD'S HISTORY IS THE KEYCHAIN'S IDS. `coerce.ts` takes a grant id and nothing else and only the
     keychain door writes the field, so whatever it ever held is a row of `grant`, and no row of `grant` is deleted; the
     ledger cannot say which, because it writes `--redacted--` for a secret. Holding every id the keychain has issued is
     wider than this field's own, and a grant id in a field that leaves is the thing the rule says never leaves,
     whichever key it names. What this cannot reach is a plaintext an earlier build left in the field and then replaced:
     nothing kept it. A FILE FIELD'S HISTORY IS IN THE LEDGER, which keeps a file's value on the `create` row and on
     every edit of it, so a file replaced after the copy is held back by the name it had. */
  for (const g of deps.sql.all<{ id: string }>('SELECT id FROM grant')) held.push(g.id);
  if (files.size > 0)
    for (const e of deps.sql.all<{ field: string | null; from_v: string | null; to_v: string | null }>(
      "SELECT field, from_v, to_v FROM event WHERE target = ? AND kind IN ('create', 'edit')",
      `entry:${entry.id}`,
    ))
      for (const raw of [e.from_v, e.to_v]) {
        let was: unknown;
        try {
          was = raw === null ? null : JSON.parse(raw);
        } catch {
          continue;
        }
        if (e.field === null && was !== null && typeof was === 'object') for (const f of files) hold((was as Record<string, unknown>)[f]);
        else if (e.field !== null && files.has(e.field)) hold(was);
      }

  /* AND WHAT THE RUN WROTE FROM ONE, BY FIELD. A run that set `party` from `{{trigger.row.token}}`, parked on a wait,
     and ran the call after `token` changed sent the old value, because the value was all this compared (measured 23
     September with plaintext, which no grant id can match). The run already knew: `flow.ts` keeps the fields a step
     wrote from a secret or a file under `-unsent`, and saves it after every step, so the run taking this `run` step
     holds it in its column now. The pass hands this function the rule's name and the row and not the run, and a run is
     advanced only inside one drain turn, so the running run of this rule on this row is that run. `-unsent` is
     `flow.ts`'s `UNSENT`, spelled again here because `flow.ts` imports this file. */
  const carried = new Set<string>();
  for (const r of deps.sql.all<{ vars: string }>(
    "SELECT vars FROM automation_run WHERE state = 'running' AND rule = ? AND json_extract(trigger, '$.entry') = ?",
    rule,
    entry.id,
  )) {
    let unsent: unknown;
    try {
      unsent = (JSON.parse(r.vars) as Record<string, unknown>)['-unsent'];
    } catch {
      unsent = undefined;
    }
    if (Array.isArray(unsent)) for (const f of unsent) if (typeof f === 'string') carried.add(f);
  }

  const holds = (v: unknown): boolean => held.length > 0 && (Array.isArray(v) ? v : [v]).some((one) => held.some((s) => (typeof one === 'string' ? one : JSON.stringify(one) ?? '').includes(s)));

  const row: Record<string, unknown> = {};
  for (const said of decl.sends ?? []) {
    const dot = said.indexOf('.');
    const register = said.slice(0, dot);
    const field = said.slice(dot + 1);
    if (dot < 1 || register !== entry.register) continue;
    const type = fired.typeOf(field);
    if (type === undefined || secrets.has(field) || files.has(field)) continue;
    if (carried.has(field) || holds(entry.fields[field])) continue;
    row[field] = entry.fields[field] ?? null;
  }
  const job = deps.enqueue({ channel: 'call', ingest, grant: key.id, rule, entry: entry.id, row, ...waiting });
  return { ingest, outcome: 'queued', say: `${rule} queued ${ingest} for ${spoken}.`, job };
}

/** Every origin the active scheduled actions name. The self-host sends to these and to nothing else. */
export function originsOf(decls: readonly ActionDecl[]): string[] {
  const seen = new Set<string>();
  for (const decl of decls) {
    if (!(ACTION_KINDS as readonly string[]).includes(decl.channel)) continue;
    const address = addressOf(decl);
    const origin = address ? originOf(address) : null;
    if (origin) seen.add(origin);
  }
  return [...seen].sort();
}
