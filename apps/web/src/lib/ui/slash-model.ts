/**
 * How Slash is run, chosen by the owner in Settings: "Included" or "Your own key", the same two on every host (ENG-A07,
 * "tiers a/b/byo become included or own key"). On a self-host "Included" is the host's own endpoint, so it shows that
 * endpoint and a field for the model it serves; the Cloud's included model has no name to type.
 *
 * PURE, SO `node --test` CAN IMPORT IT, and the words live here because `copy.ts` belongs to other work this run.
 *
 * HIS OWN KEY IS FOUR THINGS AND THE KEY IS NEVER TYPED HERE. A provider (Anthropic Messages, or any endpoint that speaks
 * OpenAI's chat completions), an address (empty for the provider's own), a model name, and a key PICKED from the API
 * tokens in his Keychain, by its id. The key's value never reaches this page: the Keychain holds
 * it, and the host opens it on each ask. The address is checked by the host, which is the only place that can say what a
 * public address is (`slashBaseUrlOf` in `packages/host/src/slash.ts`), and its refusal is drawn as it came.
 *
 * THE MODEL NAME UNDER "INCLUDED" IS A SELF-HOST'S ALONE (`modelOn`). A Worker has no endpoint of its own but the included
 * model, so a name typed there went to that model's own table and failed every answer; the engine drops a name on the
 * included model where the host runs none (`modelKept` in `packages/slash/src/index.ts`). "Included" is offered on every
 * Cloud record because the page is not told whether the operator switched that model on; a Worker where it is off
 * refuses the save in its own sentence (`keyOnly` there), and the form draws that refusal as it came.
 *
 * A RECORD A SELF-HOST KEPT ON THE OLD THIRD FORM READS AS "INCLUDED" WITH ITS MODEL NAME, because the engine answers it
 * so (`source`), and the name stands in the field until he changes it.
 */

import type { SlashProvider, SlashSettings, SlashSettingsPatch } from '@braindog/client';

export type Kind = 'included' | 'key';

const KINDS: readonly Kind[] = ['included', 'key'];

/** The choices a host offers: the same two on every host, whatever `boot` named. */
export const kindsOn = (_host: unknown): readonly Kind[] => KINDS;

/** Whether "Included" takes a model name here: on a self-host, whose own endpoint serves the name typed. */
export const modelOn = (host: unknown): boolean => host !== 'cloud';

/**
 * The endpoint "Included" is on, as the `boot` named it, or "This host's own model" where it named none.
 *
 * A NAME AND NEVER AN ADDRESS: a person is not shown a hostname, so anything that reads as one is the plain words instead.
 */
export const endpointSaid = (named: unknown): string => {
  const name = typeof named === 'string' ? named.trim() : '';
  return name === '' || ADDRESS.test(name) ? "This host's own model" : `This host's endpoint: ${name}`;
};

/* A PATH, A PORT, A SIGN-IN, OR A DOTTED NAME WITH NO SPACE IN IT (`10.0.0.5`, `gpu-box.local`): each reads as an address. */
const ADDRESS = /[/:@\\]|^[^\s.]+(?:\.[^\s.]+)+$/u;

export const PROVIDERS: readonly SlashProvider[] = ['anthropic', 'openai'];

/** A key the owner may pick: a live API token in his Keychain, by its id and the label he gave it. */
export type KeyChoice = { id: string; label: string };

/**
 * The keys to offer, from what `listGrants` answered: live API tokens only, in the order of their labels.
 *
 * A PASSWORD IS NEVER OFFERED. The host refuses a save naming one (`slashGuardedEngine`), and a picker that offered it
 * would be a list of mistakes. A revoked key is gone from the Keychain screen, so it is gone here too.
 */
export const keysOf = (grants: readonly unknown[]): KeyChoice[] =>
  grants
    .flatMap((g) => {
      const row = g as { id?: unknown; label?: unknown; kind?: unknown; revoked_at?: unknown };
      return typeof row.id === 'string' && typeof row.label === 'string' && row.kind === 'api_token' && (row.revoked_at === null || row.revoked_at === undefined)
        ? [{ id: row.id, label: row.label }]
        : [];
    })
    .sort((a, b) => a.label.localeCompare(b.label));

/** The choice as it is saved: the settings door's own answer to a save of nothing, which writes nothing. */
export type Start = { kind: Kind; provider: SlashProvider; base_url: string; model: string; grant_id: string | null };

/* A PROVIDER NOBODY SAVED IS ANTHROPIC'S, the first of the two, except on a record already on its own key, which was set up
   when chat completions was the only shape and reads as that (`slashOwnKeyOf`). */
export const startOf = (s: SlashSettings): Start => ({
  kind: (s.source ?? (s.tier === 'b' ? 'key' : 'included')) === 'key' ? 'key' : 'included',
  provider: s.provider ?? (s.tier === 'b' ? 'openai' : 'anthropic'),
  base_url: s.base_url ?? '',
  model: s.model ?? '',
  grant_id: s.grant_id,
});

/** What the owner has on the form now. */
export type Draft = Start;

/**
 * The form after the owner picks a kind: the model field holds that kind's own saved name, or nothing.
 *
 * ONE FIELD, TWO NAMES. Without this, going from his own key to "Included" on a self-host left the key's model id in the
 * box, and saving sent it to the host's endpoint, which does not serve it.
 */
export const chosen = (start: Start, draft: Draft, kind: Kind): Draft =>
  kind === draft.kind ? draft : { ...draft, kind, model: start.kind === kind ? start.model : '' };

/* THE NAME AND THE ADDRESS ARE SENT TRIMMED. `configure` refuses a name that trims to nothing, and a pasted trailing space
   in a model name once saved ok and failed every ask (measured against the real package). A blank name or
   no key picked sends nothing rather than drawing the engine's refusal, the line `capOf` in `slash-asks.ts` draws for a
   blank limit. An empty address is sent as `null`: the provider's own, and never the address saved before it. */
/* "INCLUDED" WITH A NAME IS SENT AS THE SOURCE AND THE NAME, never the old `tier`, so a save never asks for the third form.
   An emptied name on a self-host is sent as `null`, the host's own model again; on the Cloud the source goes alone. */
/** The patch to send for what the owner has chosen, or `null` when there is nothing to send. `named` is `modelOn(host)`. */
export const patchOf = (start: Start, draft: Draft, named = false): SlashSettingsPatch | null => {
  const model = draft.model.trim();
  if (draft.kind === 'included') {
    if (!named) return start.kind === 'included' ? null : { source: 'included' };
    if (start.kind === 'included' && model === start.model) return null;
    return model === '' ? (start.kind === 'included' ? { source: 'included', model: null } : { source: 'included' }) : { source: 'included', model };
  }
  if (model === '') return null;
  if (draft.grant_id === null) return null;
  const base = draft.base_url.trim();
  const same =
    start.kind === 'key' &&
    start.provider === draft.provider &&
    start.base_url === base &&
    start.model === model &&
    start.grant_id === draft.grant_id;
  if (same) return null;
  return { source: 'key', provider: draft.provider, base_url: base === '' ? null : base, model, grant_id: draft.grant_id };
};

/** How a provider is named on the form and in the toast. */
export const providerName = (p: SlashProvider): string => (p === 'anthropic' ? 'Anthropic Messages' : 'OpenAI-compatible');

/** The key a draft names, by its label, or `null` where it is no longer a key he may pick. */
export const keyNamed = (keys: readonly KeyChoice[], id: string | null): KeyChoice | null => keys.find((k) => k.id === id) ?? null;

/** The toast after a saved choice, built from what the engine stored rather than from what was sent. */
export const modelSaid = (s: SlashSettings): string => {
  if (startOf(s).kind === 'key') return `Slash answers on your own key now: ${s.model ?? ''}, through ${providerName(s.provider ?? 'openai')}.`;
  const on = s.model === null || s.model === '' ? 'the included model' : `the included model, ${s.model}`;
  const again = `Slash answers on ${on}, counted against the monthly limit`;
  return s.ask_cap === 0 ? `${again}, and the limit is zero, so it is off.` : `${again}, up to ${s.ask_cap} a month.`;
};

/** The one line that says what answers now, drawn above the form. It wraps: a model id is one long word. */
export const nowSaid = (s: Start): string => {
  if (s.kind === 'key') return `Now: your own key, ${s.model} through ${providerName(s.provider)}.`;
  return s.model === '' ? 'Now: the included model.' : `Now: the included model, ${s.model}.`;
};

export const words = {
  legend: 'How Slash is run',
  kinds: {
    included: { label: 'Included', hint: 'The model this host runs. Slash counts every question and stops at the monthly limit.' },
    key: { label: 'Your own key', hint: 'Your provider answers on your key and your bill. Slash lists the asks and sets no limit.' },
  },
  providerLabel: 'Provider',
  baseLabel: 'Address',
  baseHint: "Leave it empty for your provider's own. Slash sends your key only over https, to a provider on the public internet.",
  modelLabel: 'Model name',
  modelHint: "The name this host's endpoint serves it under, exactly as it expects it, for example llama3:8b. Leave it empty for the one the host is set up with.",
  keyModelHint: 'The model id exactly as your provider lists it.',
  keyLabel: 'Key',
  keyPick: 'Pick a key',
  keyChange: 'Change the key',
  keyNone: "Your Keychain holds no API token yet. Put your provider's key in the Keychain, then pick it here.",
  keyGone: 'The key picked before is no longer in the Keychain. Pick another.',
  keySheet: 'Pick the key Slash answers with',
  keySheetSub: 'API tokens in your Keychain. The key itself stays there.',
  go: 'Save how Slash is run',
} as const;
