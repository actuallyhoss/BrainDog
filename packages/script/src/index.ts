/**
 * `@braindog/script`: a person's script, run in a sandbox that holds nothing but `ctx`.
 *
 * This package is the sandbox half of scripts: the contract
 * types, the ceilings, the prelude that builds `ctx` inside the sandbox, and the QuickJS runner the
 * self-host binds. It knows no kernel, no host and no network. Everything a script can reach is
 * a function the caller hands in as a `CtxHost`, and every sandbox rule is
 * enforced on THIS side of the boundary, before the host function is called, so a script that
 * rewrites its own `ctx` has rewritten nothing that decides anything.
 *
 * BOTH HOSTS RUN IT, AND ONLY THE HOSTS IMPORT IT. The self-host evaluates the prelude and the
 * source in QuickJS (`./quickjs`, `apps/selfhost/src/script.ts`); the Cloud loads the same prelude
 * into a Worker (`apps/worker/src/script.ts`); `@braindog/host` takes its types for the runner both
 * build. The record never imports it: the kernel is rank 7 to this package's 12 (`31-STACK`), so it
 * holds the answer's shape structurally (`kernel/src/script-run.ts`) and its own ceilings.
 *
 * NO NEW REFUSAL CODE. The existing ones cover a script, and for every
 * rule this package enforces one does. A script that throws its own error is not a rule of ours
 * being broken, so it carries `code: null` rather than a code invented for it, which is the same line
 * `packages/ports` draws around `INTERNAL`: a crash report is not a refusal.
 */

/* ── The ceilings ─────────────────────────────────────────────────────────────────────────────── */

/**
 * What a declaration may ask for at most. A declaration over one is
 * refused before anything runs rather than clamped, because a clamped limit is a script that
 * behaves differently from what its author read in the install diff.
 *
 * THE KERNEL REFUSES THE SAME AT INSTALL (`SCRIPT_CEILINGS` in `kernel/src/script.ts`), so this
 * check is the second one, for a script installed before the kernel checked and for a host handed a
 * declaration from anywhere. The two are copies, because the kernel may not import this package and
 * this package depends on nothing, and `packages/mcp/test/script.test.ts` holds them equal.
 */
export const CEILINGS = {
  cpu_ms: 1_000,
  fetches: 20,
  wall_ms: 30_000,
  writes: 1_000,
} as const;

/** What a declaration gets when it names no limit, section 5's defaults. */
export const DEFAULT_LIMITS = {
  cpu_ms: 200,
  fetches: 5,
  wall_ms: 15_000,
  writes: 200,
} as const;

/** 64 KB of source. A script is a few lines that fetch and reshape; a bundle is not one. */
export const SOURCE_BYTES = 64 * 1024;

/**
 * THE SANDBOX'S WHOLE MEMORY, AND IT IS A WASM MAXIMUM BECAUSE THE QUICKJS LIMIT IS NOT A CAP.
 *
 * The design read `runtime.setMemoryLimit` as hard. Measured on quickjs-ng 0.32.0:
 * a single 100 MB `Uint8Array` or string is refused under a 32 MB limit, and a hundred 1 MB strings
 * or arrays pushed one at a time are not. `computeMemoryUsage` reported 104,956,678 bytes used
 * against a `malloc_limit` of 33,554,432, and the run finished. So the QuickJS limit is kept for the
 * fast refusal it does give, and the real bound is the `WebAssembly.Memory` each run is instantiated
 * into, whose `maximum` the engine cannot grow past whatever it allocates through.
 */
export const HEAP_BYTES = 32 * 1024 * 1024;

/** 8 KB of `ctx.log` per run, kept on the run's event. Past it the text is cut, never the run. */
export const LOG_BYTES = 8 * 1024;

export type ScriptLimits = {
  cpu_ms: number;
  fetches: number;
  wall_ms: number;
  writes: number;
};

/* ── The declaration ──────────────────────────────────────────────────────────────────────────── */

/**
 * The part of a `script` declaration the sandbox enforces. `runs:` (the trigger) is the host's and is
 * not here, because a sandbox that knew why it was started could start behaving differently for it.
 */
export type ScriptDecl = {
  id: string;
  version: number;
  /** Literal `https://` origins. Compared with `URL.origin`, never as a prefix. */
  egress: readonly string[];
  /** Vault labels. The sandbox sees the label only; the host opens the key outside it. */
  keys: readonly string[];
  /** Registers `ctx.record.list/get` may read. Empty is none. */
  reads: readonly string[];
  /** Registers `ctx.write` and `ctx.update` may queue for. */
  writes: readonly string[];
  limits?: Partial<ScriptLimits>;
  source: string;
};

/* ── What crosses the boundary ────────────────────────────────────────────────────────────────── */

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** A request as the host function receives it, after this package has checked it. */
export type HostRequest = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  /** A vault label from `keys`, or `null`. The host opens it; the sandbox never holds its bytes. */
  key: string | null;
  /**
   * A vault label from `keys` WHOSE SECRET IS THE ADDRESS, or absent (round 1030): `ctx.fetch(null, { address: label })`.
   * `url` is then empty. The host opens the key, reads it as an https URL (`webcal://` as `https://`), holds its origin
   * to the script's egress, refuses user info, and sends it with no key; the sandbox never sees the address, and a
   * refusal names its host and never the rest (`addressed` in `@braindog/host/script`).
   */
  address?: string | null;
};

export type HostResponse = {
  status: number;
  headers: Record<string, string>;
  body: string;
};

/**
 * The host functions `ctx` is built from. On the self-host `fetch` is `sendAction` behind `pin`;
 * in a test it is a double. `list` and `get` are only ever called for a register in `reads`.
 */
export interface CtxHost {
  fetch(request: HostRequest): Promise<HostResponse>;
  /**
   * THE HOST READS `options`, NOT THIS PACKAGE: it is `ctx.record.list`'s third argument as the script wrote it, or
   * `null` when it wrote none. So both hosts take the one option, `includeDeleted` as true or false, and refuse anything
   * else in the same words (`scriptReads` in `@braindog/host/script`). A deleted row comes back with `deleted_at` set.
   */
  list?(register: string, where: Json, options: Json): Promise<Json[]>;
  /**
   * THE HOST CHECKS `reads` FOR A `get`, AND IT IS HANDED THE LIST SO IT CANNOT FORGET TO. A spoken
   * id (`S42`) names its register through a prefix only the record can resolve, so this package
   * cannot tell which register a `get` is for. It refuses a `get` from a script that reads nothing.
   */
  get?(spoken: string, reads: readonly string[]): Promise<Json>;
  /**
   * `ctx.fold`: a payee as a bank wrote it, to the kernel's key for it, or `null` (`scriptFold` in
   * `@braindog/host/script`). Absent, the script is handed no `ctx.fold`.
   */
  fold?(text: string): Promise<string | null>;
  /**
   * `ctx.cycle`: the next day (YYYY-MM-DD) a repeating line's money moves on after `day`, or `null` (`scriptCycle` in
   * `@braindog/host/script`, over the kernel's `cycleAfter`). `line` is the script's `{ leg, fields, rest?, anchorDay? }`
   * as it wrote it, and the host reads it. Absent, the script is handed no `ctx.cycle`.
   */
  cycle?(day: string, line: Json): Promise<string | null>;
  /**
   * `ctx.propose`: one question with a body of rows or options, as the MCP `propose` files one, `proposal` as the script
   * wrote it. The host checks it against the run's `writes:`, tries it against the record's gate and answers the gate's
   * words, `{ ok, value }` or `{ ok: false, refusal }`; it is filed only when the run is applied, with its writes
   * (`scriptProposals` in `@braindog/host/script`). Absent, the script is handed no `ctx.propose`.
   */
  propose?(proposal: Json): Promise<Json>;
  /** The run's instant, from the host clock. The sandbox's own `Date` is not what a row is stamped with. */
  now(): string;
  /**
   * THE CLOCK BOTH METERS READ, wall_ms AND cpu_ms, in milliseconds from any fixed start. Absent, wall_ms reads the
   * machine's (`performance.now()`) and cpu_ms the thread's own CPU where the runtime can say (`threadCpu` in
   * `quickjs.ts`), and that is what a real run gets. A NAME OF ITS OWN BECAUSE `now` IS TAKEN: that is the
   * instant a row is stamped with, an ISO string, and this is a meter's reading.
   *
   * A test that is not about limits hands a clock that does not move, so a busy machine cannot trip a limit the test
   * is not about: one run of the bands add-on's tests on a loaded machine failed three of them at ten times the usual
   * duration. A test of the limits keeps the machine's clock, or holds one it moves itself
   * (`packages/script/test/clock.test.ts`).
   */
  clock?(): number;
  /**
   * The record's zone by name. `ctx.tz` is this, and `ctx.today()` is the day it is there at `now` (`dayIn`), worked
   * out on the host because the sandbox cannot.
   */
  tz: string;
  /** A door's body and headers, a rule's copied fields, or `null` on a schedule. */
  input: Json;
  /**
   * `ctx.config`: the owning pack's settings, defaults filled (`Scripted`'s `config` in the kernel). Absent, or anything
   * but a plain object, the script reads `{}`, so a host that knows no pack cannot hand it something else by mistake.
   */
  config?: Json;
}

/**
 * The day it is in `tz` at `instant`, as `YYYY-MM-DD`: what `ctx.today()` answers.
 *
 * WORKED OUT ON THE HOST, BECAUSE THE SANDBOX CANNOT. QuickJS in this build has no `Intl`, so a script handed the
 * instant and the zone's name could only read the UTC day, and a date that rolls once a day moved some hours early or
 * late on a record far from UTC. Node and the Cloud's Worker both have `Intl`, so one sum here speaks for both hosts.
 *
 * A STRING AND NEVER A `Date`: a day has no hour, and a `Date` made from one is midnight UTC, which is the day before
 * for anyone behind it. No zone, or a name the host does not know, is read as UTC and never thrown: a schedule should
 * not stop because a record's zone was mistyped. An instant that is no instant answers its own first ten characters.
 */
export function dayIn(instant: string, tz: string | null | undefined): string {
  const utc = (): string => {
    const at = new Date(instant);
    return Number.isNaN(at.getTime()) ? String(instant).slice(0, 10) : at.toISOString().slice(0, 10);
  };
  if (typeof tz !== 'string' || tz === '') return utc();
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      calendar: 'gregory',
      numberingSystem: 'latn',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(instant));
    const of = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
    const day = `${of('year').padStart(4, '0')}-${of('month')}-${of('day')}`;
    return /^\d{4}-\d{2}-\d{2}$/u.test(day) ? day : utc();
  } catch {
    return utc();
  }
}

/** What both hosts hand the prelude's `build`: the run's input, its instant, the record's zone, and the day there. */
export type ScriptMeta = { input: Json; now: string; tz: string; today: string };

/**
 * `meta` for a run, with the record's local day beside the instant it was read from. ONE FUNCTION FOR BOTH HOSTS, so
 * the self-host and the Cloud cannot disagree on what day it is. A host adds what else it hands over (`config`).
 */
export const scriptMeta = (run: { input: Json; now: string; tz: string }): ScriptMeta => ({
  input: run.input,
  now: run.now,
  tz: run.tz,
  today: dayIn(run.now, run.tz),
});

/**
 * The function that puts `config` on the `ctx` the prelude built, frozen all the way down, run inside the sandbox.
 *
 * A SECOND FUNCTION AND NOT A LINE IN THE PRELUDE, because both hosts already hand `PRELUDE`'s `build` the same `meta`
 * and freeze what it returns: this takes that frozen `ctx` and answers a frozen copy with `config` beside the rest, so
 * the self-host (`runInQuickJs`) and the Cloud's loaded module wrap it the same way and one text speaks for both.
 *
 * FROZEN BECAUSE IT IS THE OWNER'S, NOT THE SCRIPT'S. A setting is changed on the settings screen, and a script that
 * could write `ctx.config.limit = 0` would read its own edit for the rest of the run as if the owner had made it. Like
 * the prelude it is a courtesy and not a check: what a script does to its own copy changes nothing the host reads.
 */
export const WITH_CONFIG = `(function (ctx, config) {
  const deep = (v) => {
    if (v !== null && typeof v === 'object' && !Object.isFrozen(v)) {
      Object.freeze(v);
      for (const k of Object.keys(v)) deep(v[k]);
    }
    return v;
  };
  const settings = config !== null && typeof config === 'object' && !Array.isArray(config) ? config : {};
  return Object.freeze({ ...ctx, config: deep(settings) });
})`;

/**
 * `__name`, set on the sandbox's `globalThis` before the source is read, on both hosts.
 *
 * A BUNDLER'S HELPER INSIDE A SCRIPT'S OWN TEXT. A first-party script's source is its functions' `toString()`
 * (`MATCH_PAYMENT_SCRIPT` and the rest in `packages/seed`), taken inside whatever bundle runs. `wrangler` bundles the
 * Worker with esbuild's `keepNames`, which wraps every named arrow as `__name(fn, "fn")` and defines `__name` once at
 * the top of the bundle, outside any function. So the text the record installed calls a helper the sandbox never had:
 * measured on the production bundle, `matchPayment` holds 13 such calls, and book_from_account, match_payment,
 * settle_matched_line and the rest were refused in 13 to 16 ms with no fetch, three times each, and paused. The
 * helper is esbuild's own, a name and nothing else.
 */
export const NAMES = `if (typeof globalThis.__name !== 'function')
  Object.defineProperty(globalThis, '__name', {
    value: (target, value) => Object.defineProperty(target, 'name', { value, configurable: true }),
    configurable: true,
    writable: true,
  });
`;

/** A write the run asked for. Nothing is applied here; the host applies them after the run, together. */
export type ScriptWrite =
  | { op: 'create'; register: string; fields: Json }
  | { op: 'update'; spoken: string; patch: Json; version: number };

export type ScriptUsage = {
  fetches: number;
  /** Response body bytes, as UTF-8. */
  bytes: number;
  wall_ms: number;
  /** Time spent inside the interpreter, which is the CPU the script itself spent. */
  cpu_ms: number;
};

/** The existing codes this package can answer. */
export type ScriptRefusalCode =
  | 'DECLARATION_INVALID'
  | 'OUT_OF_BOUNDS'
  | 'PULL_ORIGIN_REFUSED'
  | 'FORBIDDEN';

export type ScriptRefusal = {
  /** `null` when the script threw its own error rather than breaking a rule of ours. */
  code: ScriptRefusalCode | null;
  why: string;
};

/**
 * WHAT A RUN ANSWERS. A refused run carries its usage and log as well, which is wider than a
 * bare `{ refused }`: a refused run is metered as a run, because it did spend
 * the sandbox's time, and a refusal with no usage would leave the host nothing to meter it by.
 * It carries NO writes, ever. A half-run that left half a ledger is the thing this shape prevents.
 */
export type ScriptAnswer =
  | { writes: ScriptWrite[]; log: string; usage: ScriptUsage; ask?: unknown; answer?: unknown }
  | { refused: ScriptRefusal; log: string; usage: ScriptUsage };

/* ── The header, checked before the sandbox starts ────────────────────────────────────────────── */

/**
 * The limits a run will hold, or the refusal that stops it before it starts. Over a ceiling is
 * `OUT_OF_BOUNDS`; an egress that is not a bare `https://` origin is `DECLARATION_INVALID`, the code
 * the kernel already answers for a malformed declaration.
 */
export function checkDecl(decl: ScriptDecl): ScriptLimits | ScriptRefusal {
  const limits: ScriptLimits = { ...DEFAULT_LIMITS, ...decl.limits };
  for (const name of Object.keys(CEILINGS) as (keyof ScriptLimits)[]) {
    const value = limits[name];
    if (!Number.isInteger(value) || value < 1)
      return { code: 'DECLARATION_INVALID', why: `${decl.id}'s limits.${name} must be a whole number above zero.` };
    if (value > CEILINGS[name])
      return { code: 'OUT_OF_BOUNDS', why: `${decl.id}'s limits.${name} is ${value}; the most a script may ask for is ${CEILINGS[name]}.` };
  }
  if (new TextEncoder().encode(decl.source).length > SOURCE_BYTES)
    return { code: 'OUT_OF_BOUNDS', why: `${decl.id}'s source is over ${SOURCE_BYTES / 1024} KB.` };
  for (const origin of decl.egress) {
    let parsed: URL | null = null;
    try {
      parsed = new URL(origin);
    } catch {
      /* answered below */
    }
    /* THE ORIGIN AND NOTHING ELSE. `https://api.example.com/v1` as an egress line would read, in the
       install diff, like a promise about a path that the origin comparison never keeps. */
    if (parsed === null || parsed.protocol !== 'https:' || parsed.origin !== origin)
      return { code: 'DECLARATION_INVALID', why: `${decl.id}'s egress ${JSON.stringify(origin)} is not a bare https:// origin.` };
  }
  return limits;
}

export const isRefusal = (x: ScriptLimits | ScriptRefusal): x is ScriptRefusal => 'why' in x;

export { PRELUDE } from './prelude.ts';
