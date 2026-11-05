/**
 * The router: every ask names a purpose, and the host tries its models in order.
 *
 * WHY THIS FILE EXISTS. Each template named one model and nothing tried a second: when the one model failed the rules
 * spoke, or a job asked the same model eight times. "Rules are the fallback, not the engine." So a caller says what the
 * ask is FOR, `routeFor` answers which models this host may try for it and in what order, and `infer` walks that list,
 * writing one ledger row an attempt and answering with the model that gave the reply.
 *
 * STRUCTURAL, AS `model-jobs.ts` IS: it imports neither `@braindog/slash` nor an app. The ledger is handed in as three
 * of the engine's own functions (`reserve`, `account`, `release`, `packages/slash/src/call.ts`) and one read of its last
 * rows, so the rows a router writes are the rows the meters and the engine's health already read.
 *
 * PURE OVER WHAT IT IS HANDED. No network, and no clock but the one passed: what a candidate IS (an id, a model, a wire)
 * is the host's, and this file only decides which is asked next and what the ledger is told.
 *
 * HIS OWN KEY IS A CHOICE AND NEVER A FALLBACK. It is alone on its route and on no other, and the walk never steps past
 * it: a question he sent to his provider is not sent on to the operator's model because his provider was slow.
 */

import { messageOf } from './log-floor.ts';
import { looksLikeCredential } from '@braindog/kernel';
import { no, ok, type Clock, type Refusal, type Result, type Sql } from '@braindog/ports';

/** Whose monthly allowance a row spends; `@braindog/slash`'s `Spends`, restated because this package imports no engine. */
export type InferSpends = 'person' | 'background' | 'none';

/** What kind of model an ask needs. `embed` is a class of its own because vectors of two models cannot be mixed. */
export type ModelClass = 'answer' | 'compose' | 'small' | 'embed';

/**
 * Every purpose an ask may name, who pays for it and the class of model it needs.
 *
 * SAID ONCE, HERE, so no caller works out from a row's kind or its question what the row was for.
 */
export const PURPOSES = {
  ask: { spends: 'person', class: 'answer' },
  plan: { spends: 'person', class: 'answer' },
  automation: { spends: 'person', class: 'answer' },
  look: { spends: 'background', class: 'compose' },
  headline: { spends: 'background', class: 'compose' },
  compose: { spends: 'background', class: 'compose' },
  skill: { spends: 'background', class: 'compose' },
  understand: { spends: 'background', class: 'small' },
  pattern: { spends: 'background', class: 'small' },
  prose: { spends: 'background', class: 'small' },
  embed: { spends: 'background', class: 'embed' },
  probe: { spends: 'none', class: 'answer' },
} as const satisfies Record<string, { spends: InferSpends; class: ModelClass }>;

export type InferPurpose = keyof typeof PURPOSES;

/* ── The consent rule ───────────────────────────────────────────────────────────────── */

/**
 * The one switch for all background reading, as the host hands it in: his own pref, `slash.reads`, read when it is asked
 * and never kept. ABSENT IS ON, which is the default he was told and the record's own.
 */
export type Reads = () => boolean | Promise<boolean>;

/** The pref the switch is, named on the refusal so a screen can point at it. */
export const READS_PREF = 'slash.reads';

/* IN THE SWITCH'S OWN WORDS (`apps/web/src/lib/record/slash-reads.ts`): Slash reads on its own, or it does not. */
const READS_OFF = 'Slash reading on its own is switched off, so nothing was sent to a model and its rules do the work. Turn it on in Settings, under Agents.';
const READS_UNREAD = 'Whether Slash may read on its own could not be read, so nothing was sent to a model and its rules do the work.';

/**
 * Whether an ask for `purpose` may be sent, asked BEFORE anything is held in the ledger or leased from the queue.
 *
 * HIS OWN ASK IS HIS OWN ACT. A purpose that spends `person`, or nobody's month, is answered yes without the switch being
 * read, so no fault in reading it can hold a question he pressed Enter on. Every purpose that spends `background` is his
 * to switch off, all of them by the one switch (a switch per job is this switch, listed).
 *
 * A SWITCH THAT CANNOT BE READ SENDS NOTHING. Consent that is not known is not consent, and the rules do the work until
 * the read mends.
 */
export const mayThink = async (purpose: InferPurpose, reads?: Reads): Promise<Result<true>> => {
  if (PURPOSES[purpose].spends !== 'background' || reads === undefined) return ok(true as const);
  let on: boolean;
  try {
    on = await reads();
  } catch {
    return no<true>('FORBIDDEN', READS_UNREAD, { at: READS_PREF });
  }
  return on ? ok(true as const) : no<true>('FORBIDDEN', READS_OFF, { at: READS_PREF });
};

/** What is never sent to a model, whoever asks and whatever the switch says. */
export type NeverSent = 'sealed' | 'key' | 'bytes';

/** A file's bytes written as text: a `data:` address in base64, alone or inside a longer text (a picture in a mail's body). */
const DATA_BYTES = /\bdata:[\w/+.;=-]{0,120};base64,[A-Za-z0-9+/]{16}/u;
/** How deep a payload is walked. A digest is three levels and a sample two; deeper than this is not a job's fields. */
const WALK_DEPTH = 12;

/**
 * The first thing in `what` that is never sent, or `null` when it holds none: the fields a job needs and nothing else.
 *
 * `sealed` IS A SECRET FIELD AS THE RECORD READS ONE (`{ sealed: true, opened, ... }`, what is known of its grant) or a
 * safe's `ciphertext`. `key` is a text the kernel would refuse to store as a key (`looksLikeCredential`), so the two can
 * never disagree about what one looks like. `bytes` is a buffer, a view of one, or a `data:` address.
 *
 * IT ANSWERS WHICH AND NEVER WHERE OR WHAT, so no caller can quote the value into a log by quoting the answer.
 */
export const neverSent = (what: unknown, depth = 0): NeverSent | null => {
  if (typeof what === 'string') return DATA_BYTES.test(what) ? 'bytes' : looksLikeCredential(what) ? 'key' : null;
  if (typeof what !== 'object' || what === null) return null;
  if (what instanceof ArrayBuffer || ArrayBuffer.isView(what)) return 'bytes';
  /* TOO DEEP TO BE READ IS NOT SENT: a payload this file cannot vouch for is treated as the worst it could hold. */
  if (depth >= WALK_DEPTH) return 'sealed';
  if (!Array.isArray(what) && ((what as { sealed?: unknown }).sealed === true || 'ciphertext' in what)) return 'sealed';
  for (const value of Array.isArray(what) ? what : Object.values(what)) {
    const found = neverSent(value, depth + 1);
    if (found !== null) return found;
  }
  /* A NAME IS READ AS A VALUE IS, as the kernel's own walk reads one (`coerce.ts` `holdsKey`): a key filed as a field's name. */
  if (!Array.isArray(what) && Object.keys(what).some(looksLikeCredential)) return 'key';
  return null;
};

const NEVER_SENT: Record<NeverSent, string> = {
  sealed: 'It holds a sealed field, and a sealed field is never sent to a model, so nothing was asked.',
  key: 'It holds what looks like a key, and a key is never sent to a model, so nothing was asked.',
  bytes: "It holds a file's bytes, and a file's bytes are never sent to a model, so nothing was asked.",
};

/** `what`, where all of it may be sent, and a refusal that says which rule held it where it may not. */
export const sendable = <T>(what: T): Result<T> => {
  const found = neverSent(what);
  return found === null ? ok(what) : no<T>('FORBIDDEN', NEVER_SENT[found], { at: found });
};

/** `@braindog/slash`'s `Tier`, as the ledger's CHECK spells it: `a` the included model, `b` his key, `byo` a self-host's endpoint. */
export type InferTier = 'a' | 'b' | 'byo';

/**
 * One model a host can ask, on one wire.
 *
 * `id` IS THE HOST'S HANDLE FOR IT, written on the row beside the model's name and never shown to a person. `large` marks
 * the larger model, which is on a route only where the record's owner allowed its cost (HD.463).
 */
export type Candidate = {
  id: string;
  model: string;
  tier: InferTier;
  source: 'included' | 'key' | 'machine';
  large?: boolean | undefined;
};

/** How this record's asks are answered: the model the host includes, his own key, or a self-host's own endpoint. */
export type RouteForm = 'included' | 'key' | 'selfhost';

/**
 * What a host knows when it routes: the owner's choice, the candidates it has, and the two things he may allow.
 *
 * A CANDIDATE THE HOST DOES NOT HAVE IS LEFT OUT, and its place on a route closes up: a Cloud with no second provider
 * set names none, and a self-host names `endpoint` and perhaps `fallback` and nothing else.
 */
export type RouteFacts = {
  form: RouteForm;
  models: {
    flash?: Candidate | undefined;
    second?: Candidate | undefined;
    small?: Candidate | undefined;
    large?: Candidate | undefined;
    /** The operator's second provider, set only when its variables and its secret are. */
    provider?: Candidate | undefined;
    /** His own machine, where a runner is enrolled. */
    machine?: Candidate | undefined;
    embed?: Candidate | undefined;
    key?: Candidate | undefined;
    endpoint?: Candidate | undefined;
    fallback?: Candidate | undefined;
  };
  /** The record's owner allowed the larger model's cost. */
  large: boolean;
  /** A runner is enrolled and the kind is allowed. */
  machine: boolean;
};

/** The ordered list for one purpose on one host, and the name the ledger keeps for the path. */
export type Route = { name: string; class: ModelClass; form: RouteForm; candidates: readonly Candidate[] };

/**
 * The candidates for a purpose, in the order they are tried.
 *
 * THE LARGER MODEL IS ON THE COMPOSING ROUTE ALONE, AND ONLY WHEN ITS COST IS ALLOWED. A candidate marked `large` is dropped from
 * every other place it is handed in at, so a host that names it as its flash model has not switched it on by doing so.
 */
export const routeFor = (purpose: InferPurpose, facts: RouteFacts): Route => {
  const cls: ModelClass = PURPOSES[purpose].class;
  const m = facts.models;
  const composing = cls === 'compose';
  const order = ((): readonly (Candidate | undefined)[] => {
    /* THE ONE EMBEDDING MODEL, WHATEVER THE FORM, and none where the host cannot embed: there is no second to fall to. */
    if (cls === 'embed') return [m.embed];
    if (facts.form === 'key') return [m.key];
    if (facts.form === 'selfhost') return [m.endpoint, m.fallback];
    if (cls === 'answer') return [m.flash, m.second, m.provider];
    if (composing) return [facts.machine ? m.machine : undefined, m.large, m.flash, m.second];
    /* PROSE ON THE FLASH MODEL: digest prose is asked for a JSON object, and the small model is not one Workers AI
       holds to a JSON schema, so a plain-text answer was set aside with nothing to fall to. */
    return [m.flash, m.second];
  })();
  const seen = new Set<string>();
  const candidates = order.filter((c): c is Candidate => {
    if (c === undefined || seen.has(c.id)) return false;
    if (c.large === true && !(composing && facts.large)) return false;
    seen.add(c.id);
    return true;
  });
  return { name: `${cls}.${facts.form}`, class: cls, form: facts.form, candidates };
};

/* ── The ledger, as the router needs it ───────────────────────────────────────────────────────── */

/** The row `account` settles, as `@braindog/slash`'s `AccountRow` spells the fields a router fills. */
export type InferRow = {
  id: string;
  kind: 'read' | 'propose' | 'triage' | 'pattern' | 'prose' | 'embed' | 'change';
  tier: InferTier;
  model: string;
  usage: { in: number; out: number };
  ms: number;
  status: 'ok' | 'nothing' | 'refused' | 'error';
  code?: string | undefined;
  question?: string | undefined;
  purpose: InferPurpose;
  spends: InferSpends;
  served?: boolean | undefined;
  route?: string | undefined;
  candidate?: string | undefined;
  raw?: string | undefined;
};

/** One of a candidate's last rows, newest first: when it was written and how it ended. */
export type LastRow = { ts: string; status: string; code: string | null; raw: string | null };

/**
 * The engine's own hold, settle and release (`Core`, `packages/slash/src/call.ts`), and a read of a candidate's last rows.
 *
 * THE LEDGER DECIDES WHAT AN ATTEMPT SPENDS, not this file: a row that says `UNREACHABLE` with no completion served, or
 * a model of `-`, is written as spending nothing there (`unspent`), so no two callers can decide it differently.
 */
export type InferLedger = {
  reserve(kind: 'read' | 'propose', tier: InferTier, model: string, charge: { purpose: InferPurpose; spends: InferSpends }): string;
  account(row: InferRow): void;
  release(id: string): void;
  last(candidate: string): readonly LastRow[];
};

/* ── The pause, restated ──────────────────────────────────────────────────────────────────────── */

/*
 * THE PAUSE IS `@braindog/slash`'S NOW (`packages/slash/src/paused.ts`), where the walk every ask takes reads it. This
 * package may not import that one (`docs/31-STACK.md` row 16, `46 §5.1`: only an app imports Slash), so the rule is
 * restated here line for line, as `sign-model.ts` restates `health.ts`'s clauses, and `test/infer.test.ts` holds the two
 * equal over every case. A change to one is a change to both.
 */

/** `@braindog/ports`'s `Missing` for a model the provider does not have, which is what marks a candidate down. */
export const NOT_SERVED = 'the provider does not serve it';
/** How long a model its provider does not serve is passed over: a day. */
export const NOT_SERVED_PAUSE = 86_400_000;
/** How long a model that failed `FAILS_TO_PAUSE` times inside this window is passed over. */
export const FAILED_PAUSE = 600_000;
/** Failures in a row, inside `FAILED_PAUSE`, that pause a candidate. */
export const FAILS_TO_PAUSE = 3;
/** How many of a candidate's rows a pause is read from: three failures make one, so a few more than three is enough. */
export const LAST_ROWS = 6;
/** The longest a provider's own words are kept on a row. */
export const RAW_MAX = 300;

/** A candidate's last rows from Slash's ledger, newest first, for a host whose ledger is the package's own store. */
export const lastRows = (sql: Sql, candidate: string): LastRow[] =>
  sql.all<LastRow>(`SELECT ts, status, code, raw FROM slash_call WHERE candidate = ? ORDER BY rowid DESC LIMIT ${LAST_ROWS}`, candidate);

const failed = (row: LastRow): boolean => row.status === 'error' && row.code === 'UNREACHABLE';

/** Why a candidate is passed over at `now`, or `null` when it is asked. */
export type PausedFor = 'failed' | 'not_served';

/**
 * Why a candidate is passed over at `now`, read from its own last rows and from nothing kept in memory: both hosts
 * build the engine per request, so a mark in memory would be one per request.
 *
 * NOT SERVED IS A DAY, because a model a provider has stopped serving does not come back in minutes. THREE FAILURES IN
 * TEN MINUTES ARE TEN MINUTES, counted from the newest and only while nothing since has answered.
 */
export const pausedFor = (rows: readonly LastRow[], now: number): PausedFor | null => {
  const fails: LastRow[] = [];
  for (const row of rows) {
    if (!failed(row)) break;
    fails.push(row);
  }
  const newest = fails[0];
  if (newest === undefined) return null;
  const at = Date.parse(newest.ts);
  if (newest.raw?.startsWith(NOT_SERVED) === true) return now < at + NOT_SERVED_PAUSE ? 'not_served' : null;
  const third = fails[FAILS_TO_PAUSE - 1];
  return third !== undefined && at - Date.parse(third.ts) <= FAILED_PAUSE && now < at + FAILED_PAUSE ? 'failed' : null;
};

/** Whether a candidate is passed over at `now`: `pausedFor`, as a yes or no. */
export const paused = (rows: readonly LastRow[], now: number): boolean => pausedFor(rows, now) !== null;

/* ── Falling through ──────────────────────────────────────────────────────────────────────────── */

/** How one attempt ended, as the walk reads it. */
type Ended = 'answered' | 'not_served' | 'no_answer' | 'late' | 'schema' | 'budget' | 'refused';

/** A refusal's `why` where the port carries one, and the sentence where it does not yet. */
const notServed = (refusal: Refusal): boolean => {
  const why = (refusal as { why?: unknown }).why;
  return typeof why === 'string' ? why === NOT_SERVED : refusal.fix.includes(NOT_SERVED);
};

const rawOf = (refusal: Refusal): string | undefined => {
  const raw = (refusal as { raw?: unknown }).raw;
  return typeof raw === 'string' && raw !== '' ? raw : undefined;
};

const endedBy = (refusal: Refusal): Ended => {
  if (refusal.code === 'SLASH_BUDGET_SPENT') return 'budget';
  if (refusal.code === 'PROPOSAL_SCHEMA') return 'schema';
  if (refusal.code === 'NOT_IN_THIS_BUILD' || refusal.code === 'UNREACHABLE') return notServed(refusal) ? 'not_served' : 'no_answer';
  return 'refused';
};

/* ── The walk ─────────────────────────────────────────────────────────────────────────────────── */

/** What a reply must say for the ledger: the model that gave it and what it read and wrote. A port's `Completion` does. */
export type Reply = { model: string; usage: { in: number; out: number } };

/**
 * One ask: what its hold and its row are called in the ledger, and the call itself.
 *
 * `run` IS HANDED THE CANDIDATE AND DOES THE ASKING, over whichever wire that candidate is on. It answers a refusal for a
 * model that is not there, a reply that breaks its schema and a call over its ceiling, and it may throw as the host's
 * wires do: a plain throw is a model that did not answer, and one marked `answered` came after the model ran.
 */
export type InferCall<T extends Reply> = {
  hold: 'read' | 'propose';
  kind: InferRow['kind'];
  question?: string | undefined;
  run(candidate: Candidate): Promise<Result<T>>;
};

export type InferDeps = {
  facts: RouteFacts;
  clock: Clock;
  ledger: InferLedger;
  /** Told once when a candidate is marked down for a day, so the host can mail its operator. Never awaited. */
  notServed?: ((candidate: Candidate, raw: string | undefined) => void) | undefined;
  /** His switch for background reading (`mayThink`). Absent is on. */
  reads?: Reads | undefined;
};

/** One attempt, in the order they were made. */
export type Try = { candidate: string; model: string; ended: Ended };

/**
 * What a walk came to.
 *
 * `model` IS THE MODEL THAT ANSWERED, as the reply named it, and `null` when none did. `whose` says whose it is to fix
 * when none did: the operator's on the included routes, the owner's when the route was his own key.
 */
export type Inferred<T> = {
  out: Result<T>;
  route: string;
  candidate: Candidate | null;
  model: string | null;
  tries: readonly Try[];
  whose: 'operator' | 'owner' | null;
};

/** The host's own error for a key that would not open (`SlashKeyClosedError`, `slash.ts`), read by its name: no import, no cycle. */
const keyClosed = (thrown: unknown): boolean => thrown instanceof Error && thrown.name === 'SlashKeyClosedError';

const said = (thrown: unknown): string => messageOf(thrown).slice(0, RAW_MAX);

const USED_UP = {
  operator:
    "Slash's model did not answer, so nothing was drafted. Nothing of yours is wrong: this is the host's to fix, and BrainDog works from its rules until then.",
  owner:
    'The provider behind your own key did not answer, and your question was sent to no other model. Try again in a few minutes, or choose the included model in Settings.',
} as const;

/**
 * Ask for one purpose: walk the route, one ledger row an attempt, and answer with the model that replied.
 *
 * AN ASK IS COUNTED ONCE. The first attempt a model served is charged to the purpose's allowance, and every attempt
 * after it says `none`; an attempt no model answered spends nothing by the ledger's own rule.
 *
 * A BACKGROUND ASK IS HIS TO SWITCH OFF (`mayThink`), and a refused one walks no route and writes no row.
 *
 * A KEY THAT WILL NOT OPEN IS THROWN ON AS THE HOST THREW IT, with the hold given back and no row: nothing was sent, and
 * the callers that already say so in their own words keep doing it (`engine-health.ts` reads that from the keychain).
 *
 * KEPT, THOUGH ONLY ITS TESTS CALL IT TODAY. The asks that go through `@braindog/slash` walk their route inside the engine
 * (`core.run`), and that walk now reads the same pause. This walk is for the asks that do not: the record's port and an
 * automation's answers (`slash.ts`, `slash-answers.ts`, ENG-A06 job 7's wiring), and `test/infer.test.ts`,
 * `may-think.test.ts` and `slash-own-key-route.test.ts` guard it as the scope's guard names it.
 */
export const infer = async <T extends Reply>(purpose: InferPurpose, call: InferCall<T>, deps: InferDeps): Promise<Inferred<T>> => {
  const { ledger, clock } = deps;
  const route = routeFor(purpose, deps.facts);
  const tries: Try[] = [];
  const end = (out: Result<T>, candidate: Candidate | null, model: string | null, whose: Inferred<T>['whose']): Inferred<T> => ({
    out,
    route: route.name,
    candidate,
    model,
    tries,
    whose,
  });
  /* THE CONSENT RULE FIRST: off, no candidate is asked and no row is held, and nobody has anything to fix. */
  const may = await mayThink(purpose, deps.reads);
  if (!may.ok) return end(may as Result<never>, null, null, null);
  if (route.candidates.length === 0)
    return end(
      no<T>('NOT_IN_THIS_BUILD', 'This host has no model for this, so nothing was asked. The repair is a deploy of a host that serves one, not an edit.', { at: 'model' }),
      null,
      null,
      'operator',
    );

  let counted = false;
  for (const candidate of route.candidates) {
    if (paused(ledger.last(candidate.id), clock.now())) continue;
    for (let turn = 0; turn < 2; turn++) {
      const spends: InferSpends = counted ? 'none' : PURPOSES[purpose].spends;
      const held = ledger.reserve(call.hold, candidate.tier, candidate.model, { purpose, spends });
      let ended: Ended;
      let out: Result<T> | undefined;
      try {
        const began = clock.now();
        const row = (rest: Pick<InferRow, 'status'> & Partial<InferRow>): InferRow => ({
          id: held,
          kind: call.kind,
          tier: candidate.tier,
          model: candidate.model,
          usage: { in: 0, out: 0 },
          ms: clock.now() - began,
          question: call.question,
          purpose,
          spends,
          route: route.name,
          candidate: candidate.id,
          ...rest,
        });
        try {
          out = await call.run(candidate);
        } catch (thrown) {
          if (keyClosed(thrown)) throw thrown;
          /* A THROW THE HOST MARKED `answered` CAME AFTER ITS MODEL RAN (a reply that broke off, a timeout): it counts once. */
          const late = thrown as { answered?: unknown; usage?: { in: number; out: number }; model?: string };
          const served = late.answered === true;
          ended = served ? 'late' : 'no_answer';
          ledger.account(
            row({ status: 'error', code: 'UNREACHABLE', served, raw: said(thrown), ...(served && late.usage ? { usage: late.usage } : {}), ...(served && late.model ? { model: late.model } : {}) }),
          );
          tries.push({ candidate: candidate.id, model: candidate.model, ended });
          counted ||= served;
          break;
        }
        if (out.ok) {
          ledger.account(row({ status: 'ok', model: out.value.model, usage: out.value.usage, served: true }));
          tries.push({ candidate: candidate.id, model: out.value.model, ended: 'answered' });
          return end(out, candidate, out.value.model, null);
        }
        ended = 'refusal' in out ? endedBy(out.refusal) : 'refused';
        const refusal = 'refusal' in out ? out.refusal : undefined;
        const raw = refusal === undefined ? undefined : rawOf(refusal);
        if (ended === 'not_served') ledger.account(row({ status: 'error', code: 'UNREACHABLE', served: false, raw: raw === undefined ? NOT_SERVED : `${NOT_SERVED}: ${raw}`.slice(0, RAW_MAX) }));
        else if (ended === 'no_answer') ledger.account(row({ status: 'error', code: 'UNREACHABLE', served: false, raw: raw?.slice(0, RAW_MAX) }));
        /* A CALL OVER ITS CEILING REACHED NO MODEL, so its row sits under `-` and spends nothing. */
        else if (ended === 'budget') ledger.account(row({ status: 'refused', code: 'SLASH_BUDGET_SPENT', model: '-' }));
        else ledger.account(row({ status: 'refused', code: refusal?.code ?? 'VERSION_STALE', served: true, raw: raw?.slice(0, RAW_MAX) }));
        tries.push({ candidate: candidate.id, model: candidate.model, ended });
      } finally {
        ledger.release(held);
      }
      if (ended === 'not_served') deps.notServed?.(candidate, 'refusal' in out ? rawOf(out.refusal) : undefined);
      /* STOP, WITH NO FALL: a budget refusal is true of the next candidate too, and any other refusal is the caller's to read. */
      if (ended === 'budget' || ended === 'refused') return end(out, null, null, null);
      if (ended !== 'schema') break;
      /* ONE MORE TURN ON THE SAME CANDIDATE for a reply that broke its schema, already counted, and then the next. */
      counted = true;
    }
    /* NEVER PAST HIS OWN KEY, whatever became of it. */
    if (candidate.source === 'key') break;
  }
  const whose = route.form === 'key' ? 'owner' : 'operator';
  return end(no<T>('UNREACHABLE', USED_UP[whose], { at: 'model' }), null, null, whose);
};
