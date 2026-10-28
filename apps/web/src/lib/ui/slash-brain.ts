/**
 * Slash's two depths, as Settings › Agents draws them: Quick, the model Slash answers with today; Deep, the owner's own
 * Anthropic key, with Sonnet and Opus for "Think harder" and a monthly cap; and Claude on the owner's Mac while a runner
 * there is live. PURE, SO `node --test` CAN IMPORT IT; the component only draws what these answer.
 *
 * THE KEY IS PICKED, NEVER TYPED, from the API tokens in the Keychain, as his own key for Slash is (`slash-model.ts`).
 * The cap is typed in dollars and sent in cents, the unit the engine keeps.
 */

import type { SlashSettings, SlashSettingsPatch, SlashStatus } from '@braindog/client';

/** Deep's form as saved: the grant picked for it (`null`: his own key for Slash, where that is Anthropic's) and the cap. */
export type DeepStart = { grant_id: string | null; cap: string };

/** Cents as the cap field shows them: `10`, `12.50`. */
export const dollarsOf = (cents: number): string => (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2));

/** The cap a person typed, in cents, or `null` for anything that is not an amount of dollars. */
export const centsOf = (typed: string): number | null => {
  const t = typed.trim().replace(/^\$/u, '');
  if (!/^\d{1,5}(\.\d{1,2})?$/u.test(t)) return null;
  return Math.round(Number(t) * 100);
};

export const deepStartOf = (s: SlashSettings): DeepStart => ({ grant_id: s.deep?.grant_id ?? null, cap: dollarsOf(s.deep?.cap_cents ?? 1_000) });

/** What to send for Deep's form, or `null` when nothing changed or the cap is not an amount. */
export const deepPatchOf = (start: DeepStart, draft: DeepStart): SlashSettingsPatch | null => {
  const cents = centsOf(draft.cap);
  if (cents === null) return null;
  const patch: SlashSettingsPatch = {};
  if (draft.grant_id !== start.grant_id) patch.deep_grant_id = draft.grant_id;
  if (cents !== centsOf(start.cap)) patch.deep_cap_cents = cents;
  return Object.keys(patch).length === 0 ? null : patch;
};

/** The short name a person knows a model by: `claude-sonnet-5-5` is Sonnet. */
export const modelName = (id: string): string => (/opus/iu.test(id) ? 'Opus' : /sonnet/iu.test(id) ? 'Sonnet' : /haiku/iu.test(id) ? 'Haiku' : id);

/** The line under Quick: what answers a question today. */
export const quickSaid = (s: SlashStatus | null): string => {
  if (s === null) return words.quickHint;
  const own = (s.source ?? (s.tier === 'b' ? 'key' : 'included')) === 'key';
  return own ? `Your own key, ${s.model}. ${words.quickHint}` : `The included model. ${words.quickHint}`;
};

/** The line under Deep: its key, its two models, and the month against the cap. */
export const deepSaid = (s: SlashStatus | null): string => {
  const d = s?.deep;
  if (d === undefined) return words.deepNone;
  if (!d.key) return words.deepNone;
  const month = d.cap_cents === 0 ? 'Off: the cap is $0.' : `$${dollarsOf(d.spent_cents)} of $${dollarsOf(d.cap_cents)} this month.`;
  return `Your Anthropic key · ${modelName(d.model)}, ${modelName(d.harder)} for Think harder · ${month}`;
};

export const words = {
  title: 'Slash brain',
  sub: 'How hard Slash thinks. Quick answers most questions; Deep reads more, plans and makes changes in steps.',
  quick: 'Quick',
  quickHint: 'Answers most questions in a moment.',
  deep: 'Deep',
  deepNone: 'Add your Anthropic key to give Slash a deeper answer when you ask: Sonnet, and Opus when you press Think harder.',
  mac: 'Claude on your Mac',
  macLive: 'Your runner is on, so a question can go to Claude on your Mac when you send it there.',
  keyLabel: 'Anthropic key',
  keyOwn: 'The key Slash already uses',
  keyOwnHint: "Uses your own key for Slash, where that key is Anthropic's.",
  keyPick: 'Pick a key',
  keyChange: 'Change the key',
  keyNone: 'Your Keychain holds no API token yet. Put your Anthropic key in the Keychain, then pick it here.',
  keyGone: 'The key picked before is no longer in the Keychain. Pick another.',
  keySheet: 'Pick the key Deep answers with',
  keySheetSub: 'API tokens in your Keychain. The key itself stays there.',
  capLabel: 'Monthly cap, in dollars',
  capHint: 'Deep stops for the month when your key has spent this much on it. $0 turns Deep off.',
  capBad: 'Write the cap as dollars, such as 10 or 12.50.',
  go: 'Save Deep',
  saved: 'Deep is saved.',
} as const;
