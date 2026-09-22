/**
 * A script's run, applied: what the record does with a `script.run` job before and after a host's sandbox runs it.
 *
 * `loop/research-shell-scripts.md` Brief 3, and DIRECTION section 22. `script.ts` fires one `script.run` outbox row.
 * The pass (`actions.ts` `runActions`) leases it with every other job, `prepareScript` turns it into a `Scripted` job
 * carrying the declaration at the version it fired under, the host runs the source, and `finishScript` applies what came
 * back. This file never runs anything, for the reason `script.ts` gives.
 *
 * THE SANDBOX'S ANSWER IS A REQUEST, NOT A WRITE. Each write it asks for is checked against the declaration's own
 * `writes:` here, on the record's side, and then goes through the ordinary write path as `script:<id>@v<n>`, so the
 * register's schema, coercion and rules apply exactly as they do to a person's write. The sandbox checks `writes:` too
 * (`@braindog/script`), and this is the second check on purpose: a host is code the record does not control, and a
 * register the owner never approved is the one thing a script must not reach whatever ran it.
 *
 * ALL OR NOTHING. The writes go in one savepoint (`tx.ts` `attempt`), so the third of three refused by its register
 * takes the first two back with it. A half-run that left half a ledger is what the design's point 4 exists to prevent,
 * and a refusal is a value here rather than a throw, which is exactly the case `attempt` was written for.
 *
 * WHY THE ANSWER TYPE IS COPIED AND NOT IMPORTED. `@braindog/script` is rank 12 and the kernel is rank 7 (`31-STACK`
 * section 2), so the shape is written out here structurally, as `PullHandoff` is for the connector. Brief 4's
 * self-host test hands a real `ScriptAnswer` to this file, and that is where a drift between the two goes red.
 */

import type { Result } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

import { meter, pause, type ActionDeps, type Metered } from './actions.ts';
import { instant } from './migrate.ts';
import type { OutboxRow } from './outbox.ts';
import { activeScript, type ScriptBody } from './script.ts';
import { attempt } from './tx.ts';

/**
 * A write the sandbox asked for. Structurally `@braindog/script`'s `ScriptWrite`.
 *
 * AN UPDATE'S `version` MAY BE NO NUMBER AT ALL, whatever the type says. `ctx.update(spoken, patch)` with no version
 * crosses from the prelude as `NaN`, and as `null` from any host that puts the answer through JSON, and `finishScript`
 * reads anything that is not a whole number as "none was given" (see the note at the write).
 */
export type ScriptWrite =
  | { op: 'create'; register: string; fields: unknown }
  | { op: 'update'; spoken: string; patch: unknown; version: number };

/** What the sandbox spent. Structurally `@braindog/script`'s `ScriptUsage`. */
export type ScriptUsage = { fetches: number; bytes: number; wall_ms: number; cpu_ms: number };

/**
 * What a host hands back for one run: `@braindog/script`'s answer, or `held` when the plan's allowance stopped it before
 * the sandbox started. `held` is the host's to say because the allowance is the Directory's, exactly as for a `call`.
 */
export type ScriptAnswer =
  | { writes: ScriptWrite[]; log: string; usage: ScriptUsage }
  | { refused: { code: string | null; why: string }; log: string; usage: ScriptUsage }
  | { held: { until: number; say: string } };

/** Why no sandbox answered: this host has none (`dropped`), or the host's own adapter threw (`failed`). The pass says it. */
export type ScriptUnrun = { unrun: 'dropped' | 'failed'; say: string; ms: number };

/** A leased `script.run`, ready for a host: everything its sandbox is allowed to know, and nothing else. */
export type Scripted = {
  job: OutboxRow;
  /** The first origin's host, which the meter names as a `call`'s host. `null` for a script that fetches nothing. */
  host: string | null;
  scripted: {
    script: string;
    /** The version it fired under, and the one whose source runs, even if a newer one was accepted since. */
    version: number;
    /** `script:<id>@v<n>`: what every row it writes says wrote it. */
    actor: string;
    input: unknown;
    decl: Pick<ScriptBody, 'egress' | 'keys' | 'reads' | 'writes' | 'limits' | 'source'>;
    record: { id: string; tz: string };
  };
};

/** The host's sandbox, handed to `runActions` as the connector runner is. */
export type ScriptRunner = (scripted: Scripted) => Promise<ScriptAnswer>;

export type ScriptRunDeps = Pick<ActionDeps, 'sql' | 'recordId' | 'nowMs' | 'mint' | 'ack' | 'notify' | 'tz'> & {
  /** The kernel's re-entrant transaction, which `attempt` opens its savepoint inside. */
  transaction: <R>(fn: () => R) => R;
  /** The ordinary write path: `ref` null creates, a spoken id or row id updates. */
  write: (register: string, ref: string | null, patch: Record<string, unknown>, w: { actor: string; batch: string; note: string; version?: number }) => Result<unknown>;
  /** The register a spoken id names, or `null` when it names no row. */
  registerOf: (spoken: string) => string | null;
};

/** How many refused runs in a row pause a script. Design section 2, point 8. */
export const REFUSED_IN_A_ROW = 3;

/**
 * How much of a run's `ctx.log` its event keeps: 8 KB, the design's `ctx` table. `@braindog/script`'s `LOG_BYTES` is the
 * same number, and it is written out again rather than imported for the rank reason in this file's header.
 */
export const LOG_BYTES = 8 * 1024;

/**
 * The most writes one run may hand back: `@braindog/script`'s `CEILINGS.writes`, written out again for the rank reason in
 * this file's header.
 *
 * THE CEILING AND NOT THE DEFAULT OF 200, for the reason `FETCHES_UNSAID` in `actions.ts` gives: both are copies, and
 * if the sandbox's default is ever raised a copied default would refuse every honest run above the old number, where a
 * copied ceiling still holds the line no declaration can move. It also caps a declared `limits.writes`, because the
 * kernel installs any whole number there and only the sandbox refuses one above 1,000. Audit thirty-four measured
 * 5,000 creates from a script with no limit applied in one transaction of 1.0 to 3.4 seconds, and on a Durable Object
 * that is the record's one thread.
 */
export const WRITES_CEILING = 1_000;

/**
 * The first `LOG_BYTES` of a log, cut on a character boundary.
 *
 * CUT HERE AS WELL AS IN THE SANDBOX, for the reason the writes are checked twice: a host is code the record does not
 * control, and a log is written into the record's own event table, so its size is the record's to hold. The cut backs
 * off any UTF-8 continuation byte, so a three-byte character straddling the line is dropped whole rather than kept as
 * a replacement character.
 */
function cutLog(log: string): string {
  const bytes = new TextEncoder().encode(log);
  if (bytes.length <= LOG_BYTES) return log;
  let end = LOG_BYTES;
  while (end > 0 && (bytes[end]! & 0xc0) === 0x80) end -= 1;
  return new TextDecoder().decode(bytes.subarray(0, end));
}

/**
 * Keep a run's log on the event `meter` just wrote for it, as `to_v.log`, and hand the metered run back unchanged.
 *
 * ON THE EVENT AND NOT IN `Metered`. `Metered` is the row `meterPass` hands the Directory, which holds counts for every
 * record it serves and never a customer's text, so the log goes beside the counts in the record's own log and nowhere
 * else. The owner reads it where every run is read, `recentHistory`, whose `to` is this `to_v`: that is where a refused
 * run's "why" was already one 280-character sentence, and the log is what explains the sentence.
 *
 * AN EMPTY LOG ADDS NOTHING, so a script that says nothing leaves the event exactly as a `call`'s.
 */
function keepLog(deps: Pick<ScriptRunDeps, 'sql'>, metered: Metered, log: string): Metered {
  if (typeof log === 'string' && log !== '')
    deps.sql.exec("UPDATE event SET to_v = json_set(to_v, '$.log', ?) WHERE id = ?", cutLog(log), metered.event);
  return metered;
}

const hostOf = (origin: string | undefined): string | null => {
  if (origin === undefined) return null;
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
};

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * A leased `script.run` becomes a job a host can run, or is finished here because it cannot.
 *
 * THE VERSION IS THE ONE IN THE PAYLOAD. `script.ts` pins it at fire time, and this reads that exact declaration row,
 * superseded or not, so a run queued before an edit runs the source the owner approved when it was queued. A script
 * with no active version at all (retired, uninstalled, its pack off) runs nothing: the owner took it away.
 */
export function prepareScript(deps: ScriptRunDeps, job: OutboxRow): Scripted | Metered {
  let payload: { script?: unknown; version?: unknown; input?: unknown };
  try {
    payload = JSON.parse(job.payload) as typeof payload;
  } catch {
    payload = {};
  }
  const script = typeof payload.script === 'string' ? payload.script : '';
  const version = typeof payload.version === 'number' && Number.isInteger(payload.version) ? payload.version : null;
  const found =
    script !== '' && version !== null && activeScript(deps.sql, script) !== null
      ? deps.sql.one<{ body: string }>("SELECT body FROM declaration WHERE id = ? AND kind = 'script' AND version = ?", `script.${script}`, version)
      : null;

  if (!found) {
    deps.ack({ id: job.id, state: 'done', leasedUntil: job.leasedUntil });
    return meter(
      deps,
      { ingest: script, channel: 'script', host: null, project: undefined, status: null, outcome: 'dropped', requests: 0, bytes: 0, ms: 0, failures: 0 },
      `${script || 'A script'} is no longer installed, or its pack is off, so it did not run.`,
    );
  }

  const body = JSON.parse(found.body) as ScriptBody;
  return {
    job,
    host: hostOf(body.egress[0]),
    scripted: {
      script,
      version: version!,
      actor: `script:${script}@v${version}`,
      input: payload.input ?? null,
      decl: {
        egress: body.egress,
        keys: body.keys,
        reads: body.reads,
        writes: body.writes,
        ...(body.limits === undefined ? {} : { limits: body.limits }),
        source: body.source,
      },
      record: { id: deps.recordId, tz: deps.tz },
    },
  };
}

/**
 * A run comes back, and is finished in one transaction: applied, refused, held or handed on.
 *
 * A REFUSED RUN IS A RUN. A throw, a timeout, a limit broken or a write the record refuses all spent the sandbox's time,
 * so `meter` counts them (it frees only `dropped`, `held` and `failed`), and none is retried by the ladder, because the
 * same source on the same input fails the same way. Three in a row pause the script's row and tell the owner once.
 *
 * HELD MOVES `due_at` AND PAUSES NOTHING, as a held `call` does in `finishAction`: the month turning is what starts it
 * again, so nobody has to.
 */
export function finishScript(deps: ScriptRunDeps, s: Scripted, answer: ScriptAnswer | ScriptUnrun): Metered {
  const { job, host } = s;
  const { script, actor, decl } = s.scripted;
  const done = () => deps.ack({ id: job.id, state: 'done', leasedUntil: job.leasedUntil });
  const base = { ingest: script, channel: 'script', host, project: undefined, status: null, actor };

  if ('held' in answer) {
    done();
    deps.sql.exec(
      "UPDATE schedule SET due_at = MAX(due_at, ?) WHERE kind = 'script' AND key = ? AND state = 'pending'",
      instant(answer.held.until),
      script,
    );
    return meter(deps, { ...base, outcome: 'held', requests: 0, bytes: 0, ms: 0, failures: 0 }, answer.held.say);
  }

  if ('unrun' in answer) {
    if (answer.unrun === 'failed') {
      deps.ack({ id: job.id, state: 'failed', error: answer.say, leasedUntil: job.leasedUntil });
      return meter(deps, { ...base, outcome: 'failed', requests: 0, bytes: 0, ms: answer.ms, failures: 1 }, answer.say);
    }
    done();
    return meter(deps, { ...base, outcome: 'dropped', requests: 0, bytes: 0, ms: 0, failures: 0 }, answer.say);
  }

  const spent = { requests: answer.usage.fetches, bytes: answer.usage.bytes, ms: answer.usage.wall_ms };
  const refuse = (say: string): Metered => {
    const metered = keepLog(deps, meter(deps, { ...base, ...spent, outcome: 'refused', failures: 1 }, say), answer.log);
    pauseAfterRefusals(deps, script);
    return metered;
  };

  if ('refused' in answer) {
    done();
    return refuse(`${script} did not finish, so it wrote nothing: ${answer.refused.why}`);
  }

  /* THE COUNT IS CHECKED HERE TOO, AND FIRST. The sandbox stops at `limits.writes`, but the count is what a host could
     get wrong in the way that costs the most: audit thirty-four handed back 500 creates from a script declaring 2 and
     all 500 landed. Refused before a single register is resolved, so an oversized answer costs one comparison. */
  const declared = decl.limits?.writes;
  if (answer.writes.length > Math.min(declared ?? WRITES_CEILING, WRITES_CEILING)) {
    done();
    const said =
      declared === undefined
        ? `no script may write more than ${WRITES_CEILING} rows in one run`
        : declared > WRITES_CEILING
          ? `its limits.writes of ${declared} is held to the ${WRITES_CEILING} any script may ask for`
          : `its limits.writes is ${declared}`;
    return refuse(`${script} wrote nothing: it handed back ${answer.writes.length} writes, and ${said}.`);
  }

  /* EVERY WRITE IS CHECKED BEFORE THE FIRST ONE IS MADE. An update names a row, not a register, so the register is the
     row's own: a spoken id cannot carry a write into a register the script does not declare. */
  const targets = answer.writes.map((w) => (w.op === 'create' ? w.register : deps.registerOf(w.spoken)));
  const outside = targets.findIndex((register) => register === null || !decl.writes.includes(register));
  if (outside >= 0) {
    done();
    const w = answer.writes[outside]!;
    const named = w.op === 'create' ? w.register : `${w.spoken}${targets[outside] === null ? ', which names no row' : ` in ${targets[outside]}`}`;
    return refuse(
      `${script} wrote nothing: it asked to write to ${named}, and it may write only to ${decl.writes.length ? decl.writes.join(', ') : 'nothing'}.`,
    );
  }
  const shapeless = answer.writes.findIndex((w) => !isObject(w.op === 'create' ? w.fields : w.patch));
  if (shapeless >= 0) {
    done();
    return refuse(`${script} wrote nothing: its write ${shapeless + 1} carries no fields.`);
  }

  /* ONE BATCH FOR THE RUN, so the history shows its rows as one change, and one note on each that says which run. */
  const batch = deps.mint();
  const note = `Written by ${actor}.`;
  let lost = false;
  let failedAt = -1;
  const applied = attempt<unknown>(deps.sql, deps.transaction, () => {
    /* THE ACK GOES FIRST AND INSIDE. A lease that lapsed while the sandbox ran belongs to whoever reclaimed it, and
       writing this run's rows as well would be the same run landing twice. */
    const acked = done();
    if (!acked.ok) {
      lost = true;
      return acked;
    }
    /* AN UPDATE WITH NO WHOLE-NUMBER VERSION IS WRITTEN WITHOUT COMPARING, which is what the write path offers any
       caller that leaves `version` out. Handed on as it came, `ctx.update(spoken, patch)` reached the write as `NaN`
       (or `null` over JSON) and was refused with "Leave it out to write without comparing", a fix no script can
       follow, so every such run was refused and the third paused the script (audit thirty-four, finding 6). Reading
       NaN as "none" gives a script nothing it could not already have by passing the row's current version, and the
       prelude refuses a version that was given but is not a whole number, so a typo is not silently read as "none". */
    for (const [i, w] of answer.writes.entries()) {
      const version = w.op === 'update' && Number.isSafeInteger(w.version) ? { version: w.version } : {};
      const out =
        w.op === 'create'
          ? deps.write(w.register, null, w.fields as Record<string, unknown>, { actor, batch, note })
          : deps.write(targets[i]!, w.spoken, w.patch as Record<string, unknown>, { actor, batch, note, ...version });
      if (!out.ok) {
        failedAt = i;
        return out;
      }
    }
    return ok(null);
  });

  if (lost)
    return keepLog(
      deps,
      meter(deps, { ...base, ...spent, outcome: 'dropped', failures: 0 }, `${script} ran, and another host holds its job now, so what it wrote was not applied here.`),
      answer.log,
    );
  if (!applied.ok) {
    /* THE ACK WAS ROLLED BACK WITH THE WRITES, so it is made again on its own. */
    done();
    const why = 'refusal' in applied ? applied.refusal.fix : 'a row it updates was changed by somebody else first.';
    return refuse(`${script} wrote nothing: write ${failedAt + 1} of ${answer.writes.length} was refused. ${why}`);
  }
  const n = answer.writes.length;
  return keepLog(
    deps,
    meter(deps, { ...base, ...spent, outcome: 'ok', failures: 0 }, `${script} ran and wrote ${n === 0 ? 'nothing' : n === 1 ? 'one row' : `${n} rows`}.`),
    answer.log,
  );
}

/**
 * Pause a script whose last three runs were refused, and tell the owner once.
 *
 * "IN A ROW" IS READ FROM THE SCRIPT'S OWN EVENTS, newest first, so a run that worked in between breaks the streak and
 * three refusals scattered over a week of good runs pause nothing. A resume is one of those events and carries no run,
 * so it breaks the streak too: without that, the first refusal after a resume found the three from before it and paused
 * the script again at once. ONCE: a row already paused is not paused again,
 * because a door or a rule can still queue runs the schedule row does not gate, and each of those would otherwise be
 * another notification about the same stop.
 *
 * ONLY RUNS OF THE SOURCE NOW INSTALLED ARE COUNTED (audit thirty-four, finding 9). The streak read the last three
 * events whatever wrote them, and two things were measured wrong. Two refusals under v1 and one under the owner's fixed
 * v2 paused v2 on its first failure, "its last 3 runs were refused", so only events signed `script:<id>@v<active>`
 * count, and installing a version starts the count again. And a `failed`, `held` or `dropped` between refusals broke
 * the streak, so six refusals interleaved with six host failures paused nothing, though none of those three ran the
 * source; they are skipped, so they neither break the streak nor count in it. A resume is written with no `to_v` and
 * is kept in the read, so it still breaks the streak.
 */
function pauseAfterRefusals(deps: ScriptRunDeps, script: string): void {
  const active = activeScript(deps.sql, script);
  if (!active) return;
  const last = deps.sql.all<{ outcome: string | null }>(
    `SELECT json_extract(to_v, '$.outcome') AS outcome FROM event
      WHERE kind = 'pull' AND target = ?
        AND (to_v IS NULL OR (actor = ? AND CASE WHEN json_valid(to_v) THEN json_extract(to_v, '$.outcome') END IN ('ok', 'refused')))
      ORDER BY rowid DESC LIMIT ?`,
    `declaration:script.${script}`,
    `script:${script}@v${active.version}`,
    REFUSED_IN_A_ROW,
  );
  if (last.filter((e) => e.outcome === 'refused').length < REFUSED_IN_A_ROW) return;
  const row = deps.sql.one<{ state: string }>("SELECT state FROM schedule WHERE kind = 'script' AND key = ?", script);
  if (!row || row.state === 'paused') return;
  pause(deps, 'script', script, `${script} is paused: its last ${REFUSED_IN_A_ROW} runs were refused, so it will not run again until somebody resumes it.`, {
    actor: `script:${script}`,
    because: `A script refused ${REFUSED_IN_A_ROW} times in a row would fail the same way on every run, so it stops and the latest run's event says why.`,
  });
}

/**
 * Start a paused script again, now. The only way one starts again, as `resumeAction` is for an action.
 *
 * NOT A FIX. If the source still fails, three more refused runs pause it again and the owner is told again.
 */
export function resumeScript(deps: Pick<ScriptRunDeps, 'sql' | 'mint' | 'nowMs'>, script: string, actor: string): Result<{ script: string }> {
  const row = deps.sql.one<{ id: string }>("SELECT id FROM schedule WHERE kind = 'script' AND key = ? AND state = 'paused'", script);
  if (!row) return no('OUT_OF_BOUNDS', `${script} is not paused, so there is nothing to resume.`, { at: 'script' });
  deps.sql.exec("UPDATE schedule SET state = 'pending', due_at = ?, attempts = 0 WHERE id = ?", instant(deps.nowMs), row.id);
  deps.sql.exec(
    "INSERT INTO event (id, ts, actor, kind, target, target_kind, note) VALUES (?, ?, ?, 'pull', ?, 'declaration', ?)",
    deps.mint(),
    instant(deps.nowMs),
    actor,
    `declaration:script.${script}`,
    `${script} was resumed, and runs now.`,
  );
  return ok({ script });
}
