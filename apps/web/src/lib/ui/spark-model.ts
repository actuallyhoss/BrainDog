/**
 * How Spark is run, chosen by the owner in Settings: against a monthly limit (tier `a`), or on the host's own endpoint with no
 * limit and a model the owner names (tier `byo`). `loop/research-spark-routes.md` §4 offers exactly these two; Brief W1 built
 * the row beside it (`SparkAsks.svelte`) and left this choice out, which its own header says is a gap and not a decision.
 *
 * PURE, SO `node --test` CAN IMPORT IT, and the words live here because `copy.ts` belongs to other work this run.
 *
 * NOT TIER `b`. F6 of the same file: on both hosts as built tier `a` already spends the owner's own key, so a *Use your own
 * key* switch would switch between two ways of spending one key. On a record that is somehow on `b` already, this row offers
 * nothing (`startOf` is `null`) rather than a choice that cannot say what it switches from.
 *
 * WHAT `byo` DOES NOT SET IS THE ADDRESS. The endpoint is `SPARK_ENDPOINT` on the host, read at start and never a setting
 * (`sparkFromEnv` in `packages/host/src/spark.ts`); what the owner names is the model that endpoint is asked for. Since
 * `aa763cdf` a name that is not one of the package's four routing names reaches the endpoint as typed, even where
 * `SPARK_MODEL` is set, which is the only reason a field for it is worth drawing.
 */

import type { SparkSettings, SparkSettingsPatch, SparkStatus } from '@braindog/client';

export type Kind = 'a' | 'byo';

/** Where the choice starts, from what the host said: the tier, and the name already in use on `byo`. */
export type Start = { kind: Kind; typed: string };

/* THE NAME STARTS EMPTY ON TIER `a`. The status there names the model the routing table would use, `glm-5.3-flash` or the
   host's `SPARK_MODEL`, and that is the host's answer to "what answers now", not a name the owner chose for an endpoint.
   Prefilling it would put the engine's word in the owner's field and make `byo` one press away from a name nobody typed. */
/** The choice as it stands, or `null` on tier `b`, which this row does not offer. */
export const startOf = (s: SparkStatus): Start | null => {
  if (s.tier === 'a') return { kind: 'a', typed: '' };
  if (s.tier === 'byo') return { kind: 'byo', typed: s.model };
  return null;
};

/* THE NAME IS SENT TRIMMED, AND THIS IS THE ONLY PLACE IT CAN BE. `configure` in `packages/spark/src/index.ts` refuses a
   name that trims to nothing and then stores the one it was given: measured on 22 September from a scratch script against
   the real package, `configure({ tier: 'byo', model: '  llama3:8b \n' })` answered ok and `status().model` came back
   `"  llama3:8b \n"`, which the host then posts to the endpoint as the model. A pasted trailing space was a save that
   worked and an ask that failed. A blank name sends nothing rather than drawing the engine's refusal, the same line
   `capOf` in `spark-asks.ts` draws for a blank limit. */
/** The patch to send for what the owner has chosen, or `null` when there is nothing to send. */
export const patchOf = (start: Start, kind: Kind, typed: string): SparkSettingsPatch | null => {
  if (kind === 'a') return start.kind === 'a' ? null : { tier: 'a' };
  const model = typed.trim();
  if (model === '') return null;
  if (start.kind === 'byo' && model === start.typed) return null;
  return { tier: 'byo', model };
};

/** The toast after a saved choice, built from what the engine stored rather than from what was sent. */
export const modelSaid = (s: SparkSettings): string => {
  if (s.tier === 'byo') return `Spark asks ${s.model ?? ''} on your own endpoint, with no monthly limit.`;
  const again = 'Spark counts its asks against the monthly limit again';
  return s.ask_cap === 0 ? `${again}, and the limit is zero, so it is off.` : `${again}, up to ${s.ask_cap} a month.`;
};

export const words = {
  legend: 'How Spark is run',
  kinds: {
    a: { label: 'A monthly limit', hint: 'Spark counts every ask and stops at the limit until the first of the month.' },
    byo: { label: 'No limit, it is my endpoint', hint: 'Spark asks the endpoint this host is set up with for the model you name, and counts nothing.' },
  },
  modelLabel: 'Model name',
  modelHint: 'The name your endpoint serves it under, exactly as it expects it, for example llama3:8b.',
  go: 'Save how Spark is run',
} as const;
