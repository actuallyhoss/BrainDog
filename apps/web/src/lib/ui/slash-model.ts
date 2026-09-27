/**
 * How Slash is run, chosen by the owner in Settings: against a monthly limit (tier `a`), or on the host's own endpoint with no
 * limit and a model the owner names (tier `byo`). `loop/research-spark-routes.md` §4 offers exactly these two; Brief W1 built
 * the row beside it (`SlashAsks.svelte`) and left this choice out, which its own header says is a gap and not a decision.
 *
 * PURE, SO `node --test` CAN IMPORT IT, and the words live here because `copy.ts` belongs to other work this run.
 *
 * NOT TIER `b`. F6 of the same file: on both hosts as built tier `a` already spends the owner's own key, so a *Use your own
 * key* switch would switch between two ways of spending one key. On a record that is somehow on `b` already, this row offers
 * nothing (`startOf` is `null`) rather than a choice that cannot say what it switches from.
 *
 * WHAT `byo` DOES NOT SET IS THE ADDRESS. The endpoint is `SLASH_ENDPOINT` on the host, read at start and never a setting
 * (`slashFromEnv` in `packages/host/src/slash.ts`); what the owner names is the model that endpoint is asked for. Since
 * `aa763cdf` a name that is not one of the package's four routing names reaches the endpoint as typed, even where
 * `SLASH_MODEL` is set, which is the only reason a field for it is worth drawing.
 *
 * AND ON THE CLOUD THERE IS NO SUCH ENDPOINT, so `byo` is not offered there (`kindsOn`). The Worker answers Slash on the
 * included model, and a name typed for `byo` went to that model's own table and failed every answer; the Worker now
 * refuses to store `byo` and reads a record already saved on it as the included model (`CLOUD_TIERS` in
 * `apps/worker/src/slash.ts`). Until a key of the owner's own is offered, the included model is the one choice there.
 */

import type { SlashSettings, SlashSettingsPatch, SlashStatus } from '@braindog/client';

export type Kind = 'a' | 'byo';

/**
 * The choices this host offers, from the `host` its `boot` named: only the included model on the Cloud, both elsewhere.
 *
 * ONE CHOICE IS NO CHOICE, so where this answers one kind the row is not drawn at all: the monthly limit beside it
 * (`SlashAsks`) already names the model that answers and the limit it answers under.
 */
export const kindsOn = (host: unknown): readonly Kind[] => (host === 'cloud' ? ['a'] : ['a', 'byo']);

/** Where the choice starts, from what the host said: the tier, and the name already in use on `byo`. */
export type Start = { kind: Kind; typed: string };

/* THE NAME STARTS EMPTY ON TIER `a`. The status there names the model the routing table would use, `glm-5.3-flash` or the
   host's `SLASH_MODEL`, and that is the host's answer to "what answers now", not a name the owner chose for an endpoint.
   Prefilling it would put the engine's word in the owner's field and make `byo` one press away from a name nobody typed. */
/** The choice as it stands, or `null` on tier `b`, which this row does not offer. */
export const startOf = (s: SlashStatus): Start | null => {
  if (s.tier === 'a') return { kind: 'a', typed: '' };
  if (s.tier === 'byo') return { kind: 'byo', typed: s.model };
  return null;
};

/* THE NAME IS SENT TRIMMED, AND THIS IS THE ONLY PLACE IT CAN BE. `configure` in `packages/slash/src/index.ts` refuses a
   name that trims to nothing and then stores the one it was given: measured on 22 September from a scratch script against
   the real package, `configure({ tier: 'byo', model: '  llama3:8b \n' })` answered ok and `status().model` came back
   `"  llama3:8b \n"`, which the host then posts to the endpoint as the model. A pasted trailing space was a save that
   worked and an ask that failed. A blank name sends nothing rather than drawing the engine's refusal, the same line
   `capOf` in `slash-asks.ts` draws for a blank limit. */
/** The patch to send for what the owner has chosen, or `null` when there is nothing to send. */
export const patchOf = (start: Start, kind: Kind, typed: string): SlashSettingsPatch | null => {
  if (kind === 'a') return start.kind === 'a' ? null : { tier: 'a' };
  const model = typed.trim();
  if (model === '') return null;
  if (start.kind === 'byo' && model === start.typed) return null;
  return { tier: 'byo', model };
};

/** The toast after a saved choice, built from what the engine stored rather than from what was sent. */
export const modelSaid = (s: SlashSettings): string => {
  if (s.tier === 'byo') return `Slash asks ${s.model ?? ''} on your own endpoint, with no monthly limit.`;
  const again = 'Slash counts its asks against the monthly limit again';
  return s.ask_cap === 0 ? `${again}, and the limit is zero, so it is off.` : `${again}, up to ${s.ask_cap} a month.`;
};

export const words = {
  legend: 'How Slash is run',
  kinds: {
    a: { label: 'A monthly limit', hint: 'Slash counts every ask and stops at the limit until the first of the month.' },
    byo: { label: 'No limit, it is my endpoint', hint: 'Slash asks the endpoint this host is set up with for the model you name, and counts nothing.' },
  },
  modelLabel: 'Model name',
  modelHint: 'The name your endpoint serves it under, exactly as it expects it, for example llama3:8b.',
  go: 'Save how Slash is run',
} as const;
