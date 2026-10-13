/**
 * The ledger Slash's press and first plan are held and settled in on the Worker: `@braindog/host`'s `slashRecordMeter`
 * over the engine `workerSlashAnswers` and the door are built from, in this object's own storage.
 *
 * THE RECORD ASKED FOR THIS AND NO HOST GAVE IT. `d16d9d35` made the record hold both asks through `deps.slashMeter` and
 * ask its model unmetered where none is passed. `Record$.#open` passed
 * none, so measured through the bundle (`test/slash-press-metered.test.ts`): 5 presses and the daily look
 * under a ceiling of three asks made 6 binding calls and no `call` row, while a person's read at the palette was held to
 * both the owner's `ask_cap` and the operator's `SLASH_INCLUDED_MONTH_NEURONS` (`1cdc6721`).
 *
 * THE ENGINE IS `workerSlashEngine`, SO THE OPERATOR'S CEILING IS WHAT `status()` READS. On the included model that engine
 * is wrapped in `operatorCeiling`, whose `status()` names the ceiling's count and cap wherever the ceiling binds, and whose
 * count is every `call` row this month with a model's name: the meter's hold row carries `glm-5.3-flash`, so a press
 * spends the same asks a read and an automation's question do. One more engine over the same two tables, as the door and
 * `workerSlashAnswers` already are; it holds nothing of its own between asks.
 *
 * PRICED ONLY WHERE THE OPERATOR PAYS. On the included model every call is Workers AI on his account, so the row is
 * priced at the package's own rate for it (`MODELS['glm-5.3-flash']`). On the owner's own key the model is his provider on
 * his own bill: the engine's `status()` says `capped: false` there, and `slashRecordMeter` lists the press under his model's
 * name, priced 0 and held to no cap, as every other ask on his key is.
 *
 * LAZY, AND THE PACKAGE IS IMPORTED ONLY WHEN A PRESS ASKS, which is `46 §5.1`: a keyless deployment never evaluates
 * `@braindog/slash`, and the rate is read off it rather than copied a third time beside `src/inference.ts` and the package.
 * A build that throws is let go, as `workerSlashAnswers` lets it go, and the hold that asked is refused: the record reads a
 * meter that threw as a ledger it could not read, and its own rules draft.
 */

import { slashRecordMeter, type SlashRecordMeter } from '@braindog/host';
import type { UnderstandLedger } from '@braindog/host/understand';
import { METER_TRIES } from '@braindog/host/actions';
import type { Result, Sql } from '@braindog/ports';
import type { RecordApi, SlashMeter } from '@braindog/record';
import { SLASH_DAYS, type SlashDay, type SlashTally } from '@braindog/record/directory';

import { includedCeilingReached, includedInference, workerSlashEngine, type SlashEngineDeps, type SlashEnv } from './slash.ts';

/** The routing name the package's own tier `a` rows carry, and so the one the ceiling and `status()` count under. */
const INCLUDED_MODEL = 'glm-5.3-flash';

/** The ledger over this object's engine, built once on the first ask. */
function meterBuilder(env: SlashEnv, api: () => RecordApi, deps: SlashEngineDeps): () => Promise<SlashRecordMeter> {
  let built: Promise<SlashRecordMeter> | null = null;
  return () =>
    (built ??= (async () => {
      const engine = await workerSlashEngine(env, api, deps);
      const included = includedInference(env) !== undefined;
      const rate = engine !== undefined && included ? (await import('@braindog/slash')).MODELS[INCLUDED_MODEL] : undefined;
      return slashRecordMeter({ sql: deps.sql, clock: deps.clock, engine: async () => engine, model: INCLUDED_MODEL, rate });
    })().catch((e: unknown) => {
      built = null;
      throw e;
    }));
}

/**
 * The day the month `ms` falls in resets, and the refusal a background ask is turned away with at the operator's ceiling:
 * the ceiling's own sentence (`operatorCeiling`), ended with what waits.
 */
const ceilingSpent = (ms: number, waits: string): { ok: false; refusal: { code: string; fix: string } } => {
  const at = new Date(ms);
  const resets = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
  return { ok: false, refusal: { code: 'SLASH_BUDGET_SPENT', fix: `Slash has asked this host's model as often as one record may in a month, so ${waits} until ${resets}.` } };
};

/** What waits while the ceiling holds, by what the background ask was for: the end of the sentence a person reads. */
const WAITS = {
  look: 'its daily look keeps to its own rules',
  skill: 'no skill is drafted',
  headline: 'each page keeps its own line',
} as const;

/**
 * THE PRESS, THE FIRST PLAN, AND THE RECORD'S OWN BACKGROUND ASKS: the daily look's draft, a skill's next version and the
 * pages' headlines, each one ask of the background's month (`slashRecordMeter.background`) and never one of his.
 *
 * AND UNDER THE OPERATOR'S CEILING FIRST, which that `background` does not read: it counts the month's own allowance, so
 * handed to the record bare it let the daily look reach the binding at a ceiling of 0 (`test/slash-ceiling-all.test.ts`),
 * and for that the meter once had no `background` at all and the record answered that this host could not count one, on
 * every Cloud record. Where the ceiling has turned the month's calls on the included model away, nothing is held and
 * nothing is asked, as `workerUnderstandLedger` does for its own kind. On his own key there is no ceiling of the
 * operator's, and only the share binds. A call it lets through is still held to the worst ask the ceiling counts it at (`slash.ts` `recordAskMost`).
 */
export function workerSlashMeter(env: SlashEnv, api: () => RecordApi, deps: SlashEngineDeps): SlashMeter {
  const built = meterBuilder(env, api, deps);
  return {
    hold: async (kind) => (await built()).hold(kind),
    background: async (kind = 'skill') => {
      const meter = await built();
      if (await includedCeilingReached(env, deps)) return ceilingSpent(deps.clock.now(), WAITS[kind] ?? WAITS.skill);
      return meter.background(kind);
    },
  };
}

/**
 * The ledger the model-jobs pass's reading of who is who is held in (`slash-jobs.ts`, `understandingOver`): one
 * background ask under `UNDERSTAND_ASK`, from the understanding share of the month.
 *
 * AND UNDER THE OPERATOR'S CEILING TOO, which `background` alone does not read. Where it has turned the month's calls on
 * the included model away, nothing is held and nothing is asked. His own `ask_cap` does not bind it, as it binds no
 * background ask: on his own key there is no ceiling of the operator's, and only the share binds.
 */
export function workerUnderstandLedger(env: SlashEnv, api: () => RecordApi, deps: SlashEngineDeps): UnderstandLedger {
  const built = meterBuilder(env, api, deps);
  return {
    background: async (kind) => {
      const meter = await built();
      if (await includedCeilingReached(env, deps)) return ceilingSpent(deps.clock.now(), 'the doubtful names wait');
      return meter.background(kind);
    },
  };
}

/* ── the account's copy of the asks ───────────────────────────────────────────────────────────────────────────────── */

const DAY_MS = 86_400_000;
const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/**
 * This record's Slash asks by UTC day, over the last `SLASH_DAYS` days up to today, from its own `slash_call`: the rows
 * the Directory's `meterSlash` takes.
 *
 * AN ASK IS A CALL SLASH MADE TO A MODEL, of any kind and on any tier, as the record's own ledger counts it, and not an
 * embedding, which answers nothing anybody asked. `model <> '-'` passes over the rows that reached no model, as the
 * package's `asksUsed` does, and a hold still `SLASH_PENDING` waits for the night after it settles. The neurons are what
 * each row was priced at, which is 0 on the owner's own key, where nothing of the operator's is spent.
 *
 * NO `slash_call` IS NO ASKS. A record whose Slash never ran has no table, and that is an empty list, not a failure; any
 * other error is thrown for the caller to say. One read, walking this record's rows since the window began.
 */
export function slashDays(sql: Pick<Sql, 'all'>, now: number): SlashDay[] {
  const from = dayOf(now - (SLASH_DAYS - 1) * DAY_MS);
  const to = dayOf(now);
  try {
    return sql
      .all<{ day: string; asks: number | null; neurons: number | null }>(
        `SELECT substr(ts, 1, 10) AS day, SUM(CASE WHEN kind <> 'embed' THEN 1 ELSE 0 END) AS asks, SUM(neurons) AS neurons
         FROM slash_call
         WHERE ts >= ? AND substr(ts, 1, 10) <= ? AND model <> '-' AND (code IS NULL OR code <> 'SLASH_PENDING')
         GROUP BY substr(ts, 1, 10) ORDER BY day`,
        from,
        to,
      )
      .map((r) => ({ day: r.day, asks: Number(r.asks ?? 0), neurons: Number(r.neurons ?? 0) }));
  } catch (e) {
    if (/no such table/iu.test(e instanceof Error ? e.message : String(e))) return [];
    throw e;
  }
}

/** The Directory's `meterSlash`, as the record object reaches it over RPC. */
export type SlashLedger = (record: string, days: readonly SlashDay[]) => Result<SlashTally> | Promise<Result<SlashTally>>;

/**
 * This record's Slash asks, handed to the account's ledger: the nightly walk's call for each record, beside the runs it
 * hands again (`Record$.meterReplay`). `null` when they did not reach it, and the reason is logged here.
 *
 * THE WHOLE WINDOW EVERY NIGHT, BECAUSE A DAY IS A TOTAL. The Directory keeps the larger of what it held and what it is
 * told, so handing forty days again moves only the days that grew, and a night that failed is made whole by the next.
 * Tried `METER_TRIES` times, as a run's write is (`meterPass`), and never thrown: a count that waits a night is still a
 * count, and the walk's other records are not this one's to stop.
 *
 * THE CEILING IS NOT HERE. Each ask was held against the record's `ask_cap` and the operator's neurons before its model was
 * asked (`workerSlashMeter`, `workerSlashAnswers`); this only tells the account what was spent.
 */
export async function slashReplay(sql: Pick<Sql, 'all'>, record: string, meterSlash: SlashLedger, now: number, log = warn): Promise<SlashTally | null> {
  let days: SlashDay[];
  try {
    days = slashDays(sql, now);
  } catch (e) {
    log(`slash ledger: ${record}'s asks could not be read: ${said(e)}`);
    return null;
  }
  if (days.length === 0) return { taken: 0, old: 0, malformed: 0 };
  let why = '';
  for (let n = 0; n < METER_TRIES; n++) {
    try {
      const answer = await meterSlash(record, days);
      if (answer.ok) return answer.value;
      why = 'refusal' in answer ? answer.refusal.fix : 'the ledger answered a conflict';
    } catch (e) {
      /* A THROW IS THE NETWORK OR A DIRECTORY RESTARTING, and the next try is the whole of the answer to it. */
      why = said(e);
    }
  }
  log(`slash ledger: ${record}'s asks were not counted tonight: ${why}`);
  return null;
}

const said = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/* The default log, named so a test can pass its own and read what was said. */
const warn = (line: string): void => console.error(line);
