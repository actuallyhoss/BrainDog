/**
 * `script`: the ninth kind of declaration, checked where it is written and fired into one outbox row.
 *
 * A person's or an agent's code, run on a clock, from a door or from a rule, writing through the record's own create
 * and update path.
 *
 * THE RECORD NEVER RUNS IT. A fire writes ONE `script.run` outbox row carrying the script's id, the version it fired
 * under and its input, and nothing else. A host leases the row, runs the source in a sandbox that holds nothing but
 * `ctx`, and hands back the writes it wants made. That is `pull`'s shape (`pull.ts`) for the same reason: a Durable
 * Object holding one customer's SQLite on one thread cannot sit inside somebody's code waiting for it to finish.
 *
 * THE VERSION IS PINNED AT FIRE TIME. A new version is a new declaration row, and a run queued at ten and leased at
 * ten past must run the source whose egress and keys the owner approved at ten, not whatever was accepted between.
 *
 * THE CEILINGS LIVE HERE, BELOW THE SANDBOX, SO INSTALL CAN REFUSE WHAT A RUN WOULD. `@braindog/script` is rank 12 and
 * the kernel rank 7 (`31-STACK` section 2), so the kernel may not import the sandbox's numbers, and this file used to
 * check only a header's shape: a script asking for more than a ceiling installed, was put in front of the owner to
 * approve, and was then refused `OUT_OF_BOUNDS` by `checkDecl` at every run. So `SCRIPT_CEILINGS` and
 * `SCRIPT_SOURCE_BYTES` are the record's, and a header over one is refused before anybody is asked to approve it. The
 * sandbox keeps its own `CEILINGS` because it depends on no package, and `packages/mcp/test/script.test.ts` holds its
 * numbers, the grammar's and these to one another.
 */

import type { Refusal, Sql } from '@braindog/ports';

import { enqueue } from './outbox.ts';
import { meter, originOf, RULE_CALLS_PER_DAY, type Egress } from './actions.ts';
import { checkInterval, FLOOR_MS, intervalMs, jitterMs } from './pull.ts';
import { timeOf } from './clock.ts';
import { clockOf, firstSlotMs, nextSlotMs } from './slot.ts';
import { instant } from './migrate.ts';

/**
 * The most a declaration's `limits` may ask for: design section 5.
 *
 * A LIMIT OVER ITS CEILING IS REFUSED, NOT CLAMPED, as the sandbox refuses it: a clamped limit is a script that behaves
 * differently from what its author read in the install diff.
 */
export const SCRIPT_CEILINGS = { cpu_ms: 1_000, fetches: 20, wall_ms: 30_000, writes: 1_000 } as const;

/** 64 KB of source, as UTF-8. A script is a few lines that fetch and reshape; a bundle is not one. */
export const SCRIPT_SOURCE_BYTES = 64 * 1024;

/** What a `script` declaration's body holds. Every key is one the sandbox or the record enforces; there is no other. */
export type ScriptBody = {
  script: string;
  title?: string;
  /**
   * At least one. `every` is a schedule row; `door` is an ingest whose verified arrivals start it (`startAtDoor`); `rule`
   * lets a rule's `script` step start it. `at` pins `every` to a time of day, `HH:MM` in the record's zone, and needs an
   * `every` of whole days (`every: 1d, at: 09:00` is every day at nine).
   */
  runs: { every?: string; at?: string; door?: string; rule?: true };
  /** Literal `https://` origins, compared as origins. Printed in the install diff, one line per script. */
  egress: string[];
  /** Keychain labels. The host opens each for one request; the sandbox never holds a key's bytes. */
  keys: string[];
  reads: string[];
  writes: string[];
  limits?: { cpu_ms?: number; fetches?: number; wall_ms?: number; writes?: number };
  source: string;
  /** The pack that owns it, when no `pack` row does. Read by the record, as a register's `pack:` is. */
  pack?: string;
  /**
   * `true` when it may send the owner a notice (`ctx.notify`): at most `SCRIPT_NOTICES_PER_DAY` a day for its add-on, held by
   * quiet hours, on the plan as a line the owner approves. Absent, `ctx.notify` stops the run.
   */
  notifies?: true;
  /**
   * How many times one run may ask Slash's model (`ctx.ask`), on the record's own allowance, at most
   * `SCRIPT_MODEL_ASKS_MOST`. On the plan as a line the owner approves. Absent, `ctx.ask` stops the run.
   */
  model?: { most_per_run: number };
  /** `true` when it keeps a little state of its own (`ctx.store`): per add-on, JSON values, `SCRIPT_STORE_BYTES` in all. */
  store?: true;
};

/** The most notices one add-on's scripts send in a day (`ctx.notify`). Past it a notice is refused as a value the script reads. */
export const SCRIPT_NOTICES_PER_DAY = 20;
/** The most a script may ask Slash's model in one run (`model: { most_per_run }`). */
export const SCRIPT_MODEL_ASKS_MOST = 10;
/** What one add-on keeps in `ctx.store`, all keys and values together, as UTF-8 JSON. */
export const SCRIPT_STORE_BYTES = 1024 * 1024;

/* `pack` IS HERE BECAUSE THE RECORD READS IT. The seed installs first-party packs with no `pack` row, owned only by
   `pack:` in each body (`packStates`), and a script in one of them was refused as a key nothing reads. */
const HEADER = ['script', 'title', 'runs', 'egress', 'keys', 'reads', 'writes', 'limits', 'source', 'pack', 'notifies', 'model', 'store'] as const;
const RUNS = ['every', 'at', 'door', 'rule'] as const;
/** A day, in the milliseconds `intervalMs` answers: a time of day repeats only on whole ones. */
const DAY_MS = 86_400_000;
const LIMITS = ['cpu_ms', 'fetches', 'wall_ms', 'writes'] as const;

/** A script's own id, and a door's: the ingest grammar, which is the register grammar with a hyphen allowed. */
const NAME = /^[a-z][a-z0-9_-]{0,31}$/u;
/** A register a script reads or writes. `series.<id>` is the design's own example of a write target. */
const TARGET = /^(?:series\.)?[a-z][a-z0-9_-]{0,31}$/u;
/** A keychain label's length, as `ingestBody` holds a `grant:` to it. */
const LABEL_BYTES = 40;
/** The keychain label of the included model's key, `SLASH_KEY_LABEL` in `@braindog/host/slash`, which no script may name. */
const SLASH_KEY = 'slash';

const bad = (code: string, fix: string, at: string): Refusal => ({ code, fix, at });

const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every((v) => typeof v === 'string');

/**
 * A `script` declaration's body, checked before it is stored.
 *
 * A HEADER KEY NOTHING READS IS REFUSED, which is stricter than the other kinds and on purpose. Everything in a
 * script's header is a promise about what the sandbox will enforce, and `network: none` or `timeout: 5s` would install,
 * print nothing, and be enforced by nobody. A reader of the install diff would believe it.
 */
export function scriptBody(decl: { id: string; body: Record<string, unknown> }): Refusal | null {
  const id = decl.id;
  const body = decl.body;

  const stray = Object.keys(body).find((k) => !(HEADER as readonly string[]).includes(k));
  if (stray !== undefined)
    return bad('DECLARATION_INVALID', `${id} says ${stray}, and a script's header is ${HEADER.join(', ')}. Nothing else is read, so nothing else would be enforced.`, stray);

  if (typeof body.script !== 'string' || !NAME.test(body.script))
    return bad('DECLARATION_INVALID', `${id}'s name is lower case letters, digits, - and _, starting with a letter, at most 32.`, 'script');
  if (body.title !== undefined && typeof body.title !== 'string') return bad('DECLARATION_INVALID', `${id}'s title is text.`, 'title');
  if (body.pack !== undefined && typeof body.pack !== 'string') return bad('DECLARATION_INVALID', `${id}'s pack is the id of the pack that owns it.`, 'pack');

  const runs = body.runs as Record<string, unknown> | undefined;
  if (runs === null || typeof runs !== 'object' || Array.isArray(runs) || !RUNS.some((k) => k !== 'at' && runs[k] !== undefined))
    return bad('DECLARATION_INVALID', `${id} says nothing about when it runs. Write runs: with every:, door: or rule: true.`, 'runs');
  const odd = Object.keys(runs).find((k) => !(RUNS as readonly string[]).includes(k));
  if (odd !== undefined) return bad('DECLARATION_INVALID', `${id} runs on ${odd}, and a script runs on every:, door: or rule: true.`, `runs.${odd}`);
  if (runs.every !== undefined && typeof runs.every !== 'string')
    return bad('DECLARATION_INVALID', `${id}'s every: is how often it runs, written like 1h or 1d.`, 'runs.every');
  if (runs.every !== undefined) {
    /* THE FLOOR `pull` HOLDS, BY THE SAME FUNCTION. A script every five minutes is twelve sandbox starts and sixty
       fetches an hour against somebody's API, and the owner's rule is one sentence for every kind of clock. */
    const every = checkInterval({ ingest: id, every: runs.every as string });
    if (!every.ok && 'refusal' in every)
      return every.refusal.code === 'OUT_OF_BOUNDS'
        ? bad('ACTION_INTERVAL_TOO_SHORT', `${id} may run no more often than every fifteen minutes.`, 'runs.every')
        : bad('DECLARATION_INVALID', every.refusal.fix, 'runs.every');
  }
  /* A TIME OF DAY IS READ ON THE CLOCK THE CONNECTORS KEEP (`slot.ts`), in the record's zone, and repeats only on whole
     days, as theirs does (`clockFault` in `declare.ts`): `every: 6h, at: 09:00` names a time the next run cannot keep. */
  if (runs.at !== undefined) {
    if (runs.every === undefined)
      return bad('DECLARATION_INVALID', `${id} runs at ${String(runs.at)} and says no clock. Write every: 1d beside it.`, 'runs.at');
    if (timeOf(runs.at) === null) return bad('DECLARATION_INVALID', `${id}'s at: is a time of day from 00:00 to 23:59, such as 09:00.`, 'runs.at');
    const ms = intervalMs(runs.every as string);
    if (ms === null || ms % DAY_MS !== 0)
      return bad('DECLARATION_INVALID', `${id} runs at ${String(runs.at)} every ${String(runs.every)}, and a time of day repeats only on whole days. Write every: 1d, 2d or 1w.`, 'runs.every');
  }
  if (runs.door !== undefined && (typeof runs.door !== 'string' || !NAME.test(runs.door)))
    return bad('DECLARATION_INVALID', `${id}'s door is the id of the ingest whose arrivals start it.`, 'runs.door');
  if (runs.rule !== undefined && runs.rule !== true)
    return bad('DECLARATION_INVALID', `${id}'s rule: is true when a rule may run it, and absent when none may.`, 'runs.rule');

  if (!strings(body.egress)) return bad('DECLARATION_INVALID', `${id}'s egress is a list of https:// origins, empty when it fetches nothing.`, 'egress');
  for (const [i, origin] of body.egress.entries()) {
    const at = `egress[${i}]`;
    if (!/^https:\/\//iu.test(origin))
      return bad('ACTION_NOT_HTTPS', `${id} may fetch from ${JSON.stringify(origin.slice(0, 80))}, and a script fetches from https:// origins only.`, at);
    /* `originOf` IS THE ONE THE RUNNER COMPARES WITH, so an origin this accepts is one a fetch can match. Written out
       in full means the parsed origin is the text as written: no path, no port the parser would drop, no placeholder
       the parser would percent-encode into a host nobody meant. */
    if (/[{}$@%\s]/u.test(origin) || originOf(origin) !== origin)
      return bad(
        'ACTION_HOST_COMPUTED',
        `${id}'s egress ${JSON.stringify(origin.slice(0, 80))} must be an origin written out in full: https:// and a host, with no path, no placeholder and nothing computed, so the install diff can print it.`,
        at,
      );
  }

  if (!strings(body.keys)) return bad('DECLARATION_INVALID', `${id}'s keys is a list of keychain labels, empty when it sends none.`, 'keys');
  for (const [i, label] of body.keys.entries())
    if (label.trim() === '' || label.length > LABEL_BYTES)
      return bad('DECLARATION_INVALID', `${id}'s key ${i + 1} is the label of a key in the keychain, at most ${LABEL_BYTES} characters.`, `keys[${i}]`);
  if (body.keys.length > 0 && body.egress.length === 0)
    return bad('DECLARATION_INVALID', `${id} names a key and fetches from nowhere, so the key would be opened for nothing. Write the origin it is for.`, 'keys');
  /* THE KEYCHAIN'S `slash` KEY, REFUSED HERE AND NOT ONLY AT RUN TIME. Both hosts refuse a run that declares it
     (`slashDeclared` in `@braindog/host/script`), because on a host with no `SLASH_KEY` it is the key the included model
     answers everybody with. Refused only there, the owner was still asked in Decide to approve a script that could never
     run, and accepting it installed a clock that failed every hour. The label is the host's `SLASH_KEY_LABEL`, written
     out because the kernel may not import the host; install, a proposal's check and a trial all come through here. */
  const slashed = body.keys.indexOf(SLASH_KEY);
  if (slashed >= 0)
    return bad(
      'FORBIDDEN',
      `${id} names the keychain's "${SLASH_KEY}" key, which is the key this host's included model answers with, and a script may not send it anywhere. Put the provider's own key in the keychain under another label.`,
      `keys[${slashed}]`,
    );

  for (const side of ['reads', 'writes'] as const) {
    const list = body[side];
    if (!strings(list)) return bad('DECLARATION_INVALID', `${id}'s ${side} is a list of registers, empty for none.`, side);
    const wrong = list.findIndex((r) => !TARGET.test(r));
    if (wrong >= 0) return bad('DECLARATION_INVALID', `${id}'s ${side} names ${JSON.stringify(list[wrong])}, which is not a register id.`, `${side}[${wrong}]`);
  }

  if (body.limits !== undefined) {
    const limits = body.limits as Record<string, unknown>;
    if (limits === null || typeof limits !== 'object' || Array.isArray(limits))
      return bad('DECLARATION_INVALID', `${id}'s limits is ${LIMITS.join(', ')}, each a whole number.`, 'limits');
    for (const [name, value] of Object.entries(limits)) {
      if (!(LIMITS as readonly string[]).includes(name))
        return bad('DECLARATION_INVALID', `${id} limits ${name}, and a script's limits are ${LIMITS.join(', ')}.`, `limits.${name}`);
      if (!Number.isInteger(value) || (value as number) < 1)
        return bad('DECLARATION_INVALID', `${id}'s limits.${name} is a whole number above zero.`, `limits.${name}`);
      /* THE SANDBOX'S OWN WORDS AND CODE, so a header refused here reads as the run would have been refused. */
      const most = SCRIPT_CEILINGS[name as (typeof LIMITS)[number]];
      if ((value as number) > most)
        return bad('OUT_OF_BOUNDS', `${id}'s limits.${name} is ${String(value)}; the most a script may ask for is ${most}.`, `limits.${name}`);
    }
  }

  /* WHAT IT MAY DO BEYOND ROWS, each a promise the host keeps and the plan prints as a line the owner approves. */
  if (body.notifies !== undefined && body.notifies !== true)
    return bad('DECLARATION_INVALID', `${id}'s notifies: is true when it may send you a notice, and absent when it may not.`, 'notifies');
  if (body.store !== undefined && body.store !== true)
    return bad('DECLARATION_INVALID', `${id}'s store: is true when it keeps a little state of its own, and absent when it keeps none.`, 'store');
  if (body.model !== undefined) {
    const model = body.model as Record<string, unknown> | null;
    const most = model !== null && typeof model === 'object' && !Array.isArray(model) ? model.most_per_run : undefined;
    const stray = model !== null && typeof model === 'object' && !Array.isArray(model) ? Object.keys(model).find((k) => k !== 'most_per_run') : undefined;
    if (stray !== undefined) return bad('DECLARATION_INVALID', `${id}'s model: says ${stray}, and it says most_per_run only.`, `model.${stray}`);
    if (!Number.isInteger(most) || (most as number) < 1)
      return bad('DECLARATION_INVALID', `${id}'s model: is { most_per_run: N }, how many times one run may ask Slash's model, a whole number from 1.`, 'model');
    if ((most as number) > SCRIPT_MODEL_ASKS_MOST)
      return bad('OUT_OF_BOUNDS', `${id}'s model.most_per_run is ${String(most)}; the most a script may ask in one run is ${SCRIPT_MODEL_ASKS_MOST}.`, 'model.most_per_run');
  }

  if (typeof body.source !== 'string' || body.source.trim() === '')
    return bad('DECLARATION_INVALID', `${id} has no source. A script is the code in source: and the header above it.`, 'source');
  if (new TextEncoder().encode(body.source).length > SCRIPT_SOURCE_BYTES)
    return bad('OUT_OF_BOUNDS', `${id}'s source is over ${SCRIPT_SOURCE_BYTES / 1024} KB.`, 'source');
  return null;
}

/* ── armed and fired ─────────────────────────────────────────────────────────────────────────── */

/** The one thing a fire needs from the declaration: which version is active, how often it runs, and at what time of day. */
export type ArmedScript = { script: string; version: number; every: string | null; at: string | null };

export type ScriptDeps = {
  sql: Sql;
  recordId: string;
  nowMs: number;
  /** The record's zone, which a script's `runs.at` is read in. */
  tz: string;
  mint: () => string;
  outbox: (payload: ScriptRun) => string;
};

/**
 * The `script.run` payload. The input is `null` on a schedule, a rule's copied fields from a rule (`startScript` in
 * `flow.ts`), and the arrival's `{ body, headers }` from a door, whose id rides beside it as `door` so a day's starts
 * can be counted (`startAtDoor`). The run reads `script`, `version` and `input` only (`prepareScript`).
 */
export type ScriptRun = { script: string; version: number; input: unknown; door?: string };

export const scriptDeps = (sql: Sql, at: { recordId: string; nowMs: number; tz?: string; mint: () => string }): ScriptDeps => ({
  sql,
  ...at,
  tz: at.tz ?? 'UTC',
  outbox: (payload) => enqueue(sql, at.mint, at.nowMs, 'script.run', payload),
});

/** The active version of `script.<bare>`, or `null` when it is retired or was never installed. */
export function activeScript(sql: Sql, bare: string): ArmedScript | null {
  const row = sql.one<{ version: number; body: string }>(
    "SELECT version, body FROM declaration WHERE id = ? AND kind = 'script' AND superseded_at IS NULL AND retired = 0",
    `script.${bare}`,
  );
  if (!row) return null;
  const body = JSON.parse(row.body) as Partial<ScriptBody>;
  return { script: bare, version: row.version, ...clockOfScript(body) };
}

/** A script body's clock: how often, and the time of day when it names one. */
export function clockOfScript(body: Partial<ScriptBody> | Record<string, unknown>): { every: string | null; at: string | null } {
  const runs = (body as { runs?: unknown }).runs;
  const r = runs !== null && typeof runs === 'object' && !Array.isArray(runs) ? (runs as Record<string, unknown>) : {};
  const every = typeof r.every === 'string' ? r.every : null;
  return { every, at: every !== null && typeof r.at === 'string' && timeOf(r.at) !== null ? r.at : null };
}

/**
 * When a newly installed script is first due: now plus its jitter.
 *
 * NOT `now` AS A CONNECTOR IS. A connector's first fetch is the one that says the credential is right, and nothing
 * else can say it. A script has `script_try` for that before it is ever proposed (design section 7), so its first
 * scheduled run can take its place in the spread like every later one, and twenty scripts accepted from one pack
 * do not all start in the same wake.
 */
export const firstDueMs = (recordId: string, bare: string, every: string | null, nowMs: number, clock?: { at: string | null; tz: string }): number => {
  const ms = every === null ? null : intervalMs(every);
  /* ON A TIME OF DAY, THE FIRST RUN IS THE NEXT TIME THE RECORD'S WALL CLOCK READS IT, with no jitter: a script the owner
     pinned to nine runs at nine, and the spread is for clocks nobody pinned. */
  if (ms !== null && clock !== undefined && clock.at !== null) return firstSlotMs({ at: clock.at }, clock.tz, nowMs);
  return ms === null ? nowMs : nowMs + jitterMs(recordId, `script:${bare}`, ms);
};

/**
 * A `script` row fires: queue one run, and say when the next one is due.
 *
 * `null` ENDS THE ROW, and that is the answer for a script that is gone and for one with no clock. A door or a rule
 * starts a script without this row, and the row still exists because it is what pausing, resuming and the list read,
 * exactly as for a `call` only a rule runs.
 */
export function fireScript(deps: ScriptDeps, row: { id: string; key: string; payload?: string; due_at?: string }, script: ArmedScript | null): number | null {
  if (script === null || script.every === null) return null;
  const every = intervalMs(script.every) ?? FLOOR_MS;
  const next = script.at === null ? deps.nowMs + every + jitterMs(deps.recordId, `script:${script.script}`, every) : nextOnClock(deps, row, every, script.at);

  /* A RUN THAT HAS NOT FINISHED IS NOT QUEUED AGAIN, which `pull` learned by paying for two runs of one window. A
     script that overruns its hour must not have a second copy racing it to write the same series point. `failed` is
     unfinished because the retry ladder will put it back; only `done` and `dead` mean the script is idle. The next
     occurrence is still armed: skipping a run is not stopping the schedule. */
  const busy = deps.sql.one(
    `SELECT 1 AS x FROM outbox WHERE kind = 'script.run' AND state IN ('pending', 'leased', 'failed')
     AND json_extract(payload, '$.script') = ? LIMIT 1`,
    script.script,
  );
  if (!busy) deps.outbox({ script: script.script, version: script.version, input: null });
  return next;
}

/**
 * The next run of a script pinned to a time of day, counted from its slot and kept on the row, as a connector's is
 * (`fireAction` in `actions.ts`).
 *
 * FROM THE SLOT AND NOT FROM NOW, AND READ BACK ONTO THE WALL CLOCK EACH TIME (`nextSlotMs`), so a script at 09:00 stays
 * at 09:00 across the night the clocks change, whichever way they go, and a drain that rings late does not walk it off
 * its hour. The first fire has no slot kept and reads the instant it was armed for; slots that went by while the host
 * was away are skipped, not run, as a connector's are: a script fetches now what it would have fetched then.
 */
function nextOnClock(deps: ScriptDeps, row: { id: string; payload?: string; due_at?: string }, everyMs: number, at: string): number {
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
  const next = nextSlotMs({ slotMs: slot, nowMs: deps.nowMs, everyMs, clock: clockOf({ at }, deps.tz) });
  deps.sql.exec('UPDATE schedule SET payload = ? WHERE id = ?', JSON.stringify({ ...kept, slot: instant(next) }), row.id);
  return next;
}

/**
 * How many runs one script's door may start in a rolling day: the bound a rule-started script is approved under.
 *
 * A DOOR IS A STRANGER'S WAY IN, AND EVERY RUN IS SANDBOX TIME AND FETCHES AGAINST SOMEBODY'S API. The host's door holds
 * its own rate and size (`@braindog/host/ingest`), and that bounds what is stored; this bounds what is spent after it.
 * Past it the arrival is still stored and matched as ever, the script is not started, and the day's first arrival
 * turned away says so on the script, once.
 *
 * A FUNCTION AND NOT A CONSTANT, because this module is first loaded inside `actions.ts`'s own load (`actions.ts` to
 * `migrate.ts` to migration 16 to `declare.ts` to here), where `RULE_CALLS_PER_DAY` is not yet defined: a constant read
 * of it here threw at import. It is read when a door is walked, by which time both modules have loaded.
 */
export const doorRunsPerDay = (): number => RULE_CALLS_PER_DAY;

/** What a verified arrival hands the scripts on its door: the door, and the body and headers the host stored. */
export type DoorArrival = { door: string; body: string; headers: Record<string, string> };

/**
 * Queue one `script.run` for every active script whose `runs.door` is this arrival's door, and answer the jobs queued.
 *
 * THE CALLER HAS DECIDED THE ARRIVAL IS VERIFIED AND NEW (`arrive` in `ingest.ts`): an unverified arrival starts
 * nothing, and a redelivery of bytes already seen started its scripts the first time. Called inside the arrival's own
 * transaction, so a stored arrival and its queued runs land together or not at all.
 *
 * THE VERSION IS THE ONE ACTIVE NOW, pinned into the payload as a clock's fire pins it. A PAUSED SCRIPT IS NOT STARTED
 * (its pause is already said on it, and `startScript` in `flow.ts` holds a rule to the same), and neither is one whose
 * arrival, with its headers, is over `bodyMost` bytes, the size an arrival is extracted from at all, which it says.
 *
 * THE WALK IS BOUNDED BY THE SCRIPTS INSTALLED ON THIS DOOR, one SELECT, and each start by `doorRunsPerDay()`.
 */
export function startAtDoor(sql: Sql, at: { mint: () => string; nowMs: number }, arrival: DoorArrival, bodyMost: number): string[] {
  const scripts = sql.all<{ version: number; body: string }>(
    `SELECT version, body FROM declaration WHERE kind = 'script' AND superseded_at IS NULL AND retired = 0
       AND json_extract(body, '$.runs.door') = ? ORDER BY id`,
    arrival.door,
  );
  if (scripts.length === 0) return [];

  const since = new Date(at.nowMs - DAY_MS).toISOString();
  /* A START TURNED AWAY IS A `held` RUN ON THE SCRIPT, metered as an action's own daily cap is (`meter` in `actions.ts`):
     free, counted as held, and the script's last outcome with its sentence. A plain note would not do, because a `pull`
     event with no `to_v` is how a resume breaks a script's refused streak (`pauseAfterRefusals`), so each arrival turned
     away would have reset the count that pauses a script that keeps failing. */
  const say = (script: string, note: string): void => {
    meter(
      { sql, mint: at.mint, nowMs: at.nowMs },
      { ingest: script, channel: 'script', host: null, project: undefined, status: null, outcome: 'held', requests: 0, bytes: 0, ms: 0, failures: 0, actor: `ingest:${arrival.door}` },
      note,
    );
  };
  /* MEASURED AS THE QUEUED ROW HOLDS IT, the body and headers written out as JSON, which is longer than the body alone:
     a body of line breaks doubles once each is escaped. The row is written inside the arrival's transaction, so a run
     too big to queue must be turned away here and not by a failed insert that would take the stored arrival with it. */
  const input = { body: arrival.body, headers: arrival.headers };
  const tooBig = new TextEncoder().encode(JSON.stringify(input)).length > bodyMost;

  const queued: string[] = [];
  for (const row of scripts) {
    let body: Partial<ScriptBody>;
    try {
      body = JSON.parse(row.body) as Partial<ScriptBody>;
    } catch {
      continue;
    }
    const name = typeof body.script === 'string' ? body.script : null;
    if (name === null) continue;
    if (sql.one<{ state: string }>("SELECT state FROM schedule WHERE kind = 'script' AND key = ?", name)?.state === 'paused') continue;
    if (tooBig) {
      say(name, `An arrival at ${arrival.door} was over ${bodyMost} bytes with its headers, so it did not start ${name}. It is stored in the inbox.`);
      continue;
    }
    const today =
      sql.one<{ n: number }>(
        `SELECT count(*) AS n FROM outbox WHERE kind = 'script.run' AND created >= ?
           AND json_extract(payload, '$.script') = ? AND json_extract(payload, '$.door') IS NOT NULL`,
        since,
        name,
      )?.n ?? 0;
    const most = doorRunsPerDay();
    if (today >= most) {
      const full = `${arrival.door} has started ${name} ${most} times in the past day, the most it may, so later arrivals are stored without starting it until fewer have.`;
      const told = sql.one("SELECT 1 AS x FROM event WHERE kind = 'pull' AND target = ? AND note = ? AND ts >= ? LIMIT 1", `declaration:script.${name}`, full, since);
      if (!told) say(name, full);
      continue;
    }
    const run: ScriptRun = { script: name, version: row.version, input, door: arrival.door };
    queued.push(enqueue(sql, at.mint, at.nowMs, 'script.run', run));
  }
  return queued;
}

/**
 * Whether what `e` sends differs from what the owner approved when `before` was installed.
 *
 * A SCRIPT IS COMPARED BY ITS WHOLE LINE, because `host` is only its first origin: a second origin, another key, a new
 * trigger or a read added to it is a promise the owner has not seen. An action keeps its host, key and fields comparison.
 */
export const egressChanged = (before: Egress, e: Egress): boolean =>
  e.channel === 'script' || before.channel === 'script'
    ? before.line !== e.line || before.key_line !== e.key_line
    : before.host !== e.host || before.key !== e.key || before.sends.join(',') !== e.sends.join(',');
