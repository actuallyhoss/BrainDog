/**
 * `script`: the ninth kind of declaration, checked where it is written and fired into one outbox row.
 *
 * `loop/research-shell-scripts.md` Brief 2, and DIRECTION section 22: a person's or an agent's code, run on a clock,
 * from a door or from a rule, writing through the record's own create and update path.
 *
 * THE RECORD NEVER RUNS IT. A fire writes ONE `script.run` outbox row carrying the script's id, the version it fired
 * under and its input, and nothing else. A host leases the row, runs the source in a sandbox that holds nothing but
 * `ctx`, and hands back the writes it wants made. That is `pull`'s shape (`pull.ts`) for the same reason: a Durable
 * Object holding one customer's SQLite on one thread cannot sit inside somebody's code waiting for it to finish.
 *
 * THE VERSION IS PINNED AT FIRE TIME. A new version is a new declaration row, and a run queued at ten and leased at
 * ten past must run the source whose egress and keys the owner approved at ten, not whatever was accepted between.
 *
 * WHAT THIS FILE DOES NOT CHECK, AND WHY. `@braindog/script` holds the ceilings (`CEILINGS`, `SOURCE_BYTES`) and
 * `checkDecl`, and `31-STACK` section 2 puts it at rank 12 with the kernel at 7, so the kernel may not import it. The
 * numbers are not copied here either: two copies of a ceiling is how one of them becomes wrong. So this file refuses
 * every SHAPE a header can get wrong, and a limit over its ceiling installs and is refused by `checkDecl` when the run
 * starts. Closing that gap is moving the constants below the kernel, which is a change to the package order.
 */

import type { Refusal, Sql } from '@braindog/ports';

import { enqueue } from './outbox.ts';
import { originOf, type Egress } from './actions.ts';
import { checkInterval, FLOOR_MS, intervalMs, jitterMs } from './pull.ts';

/** What a `script` declaration's body holds. Every key is one the sandbox or the record enforces; there is no other. */
export type ScriptBody = {
  script: string;
  title?: string;
  /** At least one. `every` is a schedule row; `door` is an ingest whose `then:` names this script; `rule` lets a rule `run:` it. */
  runs: { every?: string; door?: string; rule?: true };
  /** Literal `https://` origins, compared as origins. Printed in the install diff, one line per script. */
  egress: string[];
  /** Vault labels. The host opens each for one request; the sandbox never holds a key's bytes. */
  keys: string[];
  reads: string[];
  writes: string[];
  limits?: { cpu_ms?: number; fetches?: number; wall_ms?: number; writes?: number };
  source: string;
  /** The pack that owns it, when no `pack` row does. Read by the record, as a register's `pack:` is. */
  pack?: string;
};

/* `pack` IS HERE BECAUSE THE RECORD READS IT. The seed installs first-party packs with no `pack` row, owned only by
   `pack:` in each body (`packStates`), and a script in one of them was refused as a key nothing reads. */
const HEADER = ['script', 'title', 'runs', 'egress', 'keys', 'reads', 'writes', 'limits', 'source', 'pack'] as const;
const RUNS = ['every', 'door', 'rule'] as const;
const LIMITS = ['cpu_ms', 'fetches', 'wall_ms', 'writes'] as const;

/** A script's own id, and a door's: the ingest grammar, which is the register grammar with a hyphen allowed. */
const NAME = /^[a-z][a-z0-9_-]{0,31}$/u;
/** A register a script reads or writes. `series.<id>` is the design's own example of a write target. */
const TARGET = /^(?:series\.)?[a-z][a-z0-9_-]{0,31}$/u;
/** A vault label's length, as `ingestBody` holds a `grant:` to it. */
const LABEL_BYTES = 40;
/** The vault label of the included model's key, `SLASH_KEY_LABEL` in `@braindog/host/slash`, which no script may name. */
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
  if (runs === null || typeof runs !== 'object' || Array.isArray(runs) || !RUNS.some((k) => runs[k] !== undefined))
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

  if (!strings(body.keys)) return bad('DECLARATION_INVALID', `${id}'s keys is a list of vault labels, empty when it sends none.`, 'keys');
  for (const [i, label] of body.keys.entries())
    if (label.trim() === '' || label.length > LABEL_BYTES)
      return bad('DECLARATION_INVALID', `${id}'s key ${i + 1} is the label of a key in the vault, at most ${LABEL_BYTES} characters.`, `keys[${i}]`);
  if (body.keys.length > 0 && body.egress.length === 0)
    return bad('DECLARATION_INVALID', `${id} names a key and fetches from nowhere, so the key would be opened for nothing. Write the origin it is for.`, 'keys');
  /* THE VAULT'S `slash` KEY, REFUSED HERE AND NOT ONLY AT RUN TIME. Both hosts refuse a run that declares it
     (`slashDeclared` in `@braindog/host/script`), because on a host with no `SLASH_KEY` it is the key the included model
     answers everybody with. Refused only there, the owner was still asked in Decide to approve a script that could never
     run, and accepting it installed a clock that failed every hour. The label is the host's `SLASH_KEY_LABEL`, written
     out because the kernel may not import the host; install, a proposal's check and a trial all come through here. */
  const slashed = body.keys.indexOf(SLASH_KEY);
  if (slashed >= 0)
    return bad(
      'FORBIDDEN',
      `${id} names the vault's "${SLASH_KEY}" key, which is the key this host's included model answers with, and a script may not send it anywhere. Put the provider's own key in the vault under another label.`,
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
    }
  }

  if (typeof body.source !== 'string' || body.source.trim() === '')
    return bad('DECLARATION_INVALID', `${id} has no source. A script is the code in source: and the header above it.`, 'source');
  return null;
}

/* ── armed and fired ─────────────────────────────────────────────────────────────────────────── */

/** The one thing a fire needs from the declaration: which version is active, and how often it runs. */
export type ArmedScript = { script: string; version: number; every: string | null };

export type ScriptDeps = {
  sql: Sql;
  recordId: string;
  nowMs: number;
  mint: () => string;
  outbox: (payload: ScriptRun) => string;
};

/** The `script.run` payload. The input is `null` on a schedule; a door's arrival and a rule's copied fields are Brief 3's. */
export type ScriptRun = { script: string; version: number; input: unknown };

export const scriptDeps = (sql: Sql, at: { recordId: string; nowMs: number; mint: () => string }): ScriptDeps => ({
  sql,
  ...at,
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
  return { script: bare, version: row.version, every: typeof body.runs?.every === 'string' ? body.runs.every : null };
}

/**
 * When a newly installed script is first due: now plus its jitter.
 *
 * NOT `now` AS A CONNECTOR IS. A connector's first fetch is the one that says the credential is right, and nothing
 * else can say it. A script has `script_try` for that before it is ever proposed (design section 7), so its first
 * scheduled run can take its place in the spread like every later one, and twenty scripts accepted from one pack
 * do not all start in the same wake.
 */
export const firstDueMs = (recordId: string, bare: string, every: string | null, nowMs: number): number => {
  const ms = every === null ? null : intervalMs(every);
  return ms === null ? nowMs : nowMs + jitterMs(recordId, `script:${bare}`, ms);
};

/**
 * A `script` row fires: queue one run, and say when the next one is due.
 *
 * `null` ENDS THE ROW, and that is the answer for a script that is gone and for one with no clock. A door or a rule
 * starts a script without this row, and the row still exists because it is what pausing, resuming and the list read,
 * exactly as for a `call` only a rule runs.
 */
export function fireScript(deps: ScriptDeps, row: { id: string; key: string }, script: ArmedScript | null): number | null {
  if (script === null || script.every === null) return null;
  const every = intervalMs(script.every) ?? FLOOR_MS;
  const next = deps.nowMs + every + jitterMs(deps.recordId, `script:${script.script}`, every);

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
 * Whether what `e` sends differs from what the owner approved when `before` was installed.
 *
 * A SCRIPT IS COMPARED BY ITS WHOLE LINE, because `host` is only its first origin: a second origin, another key, a new
 * trigger or a read added to it is a promise the owner has not seen. An action keeps its host, key and fields comparison.
 */
export const egressChanged = (before: Egress, e: Egress): boolean =>
  e.channel === 'script' || before.channel === 'script'
    ? before.line !== e.line || before.key_line !== e.key_line
    : before.host !== e.host || before.key !== e.key || before.sends.join(',') !== e.sends.join(',');
