/**
 * The voice a record speaks in: which lines of the house voice a use case replaces (`loop/research-spark.md` §2.2).
 *
 * THE HOUSE VOICE IS `copy.ts`, AND IT STAYS THE ONLY PLACE A SENTENCE IS TYPED. A voice is data a record
 * holds, as the settings of its use-case pack (`voice_home`, `voice_needs_you`, ...), and each key replaces
 * exactly one `copy.ts` line below. A key a voice leaves out reads the house line, so the sample and
 * any record without a use case read exactly what they read before.
 *
 * NO PACKAGE IMPORT, because the shell reads this on every screen and `@braindog/declare` brings the
 * kernel with it. `voice.test.ts` holds the keys here to `VOICE_KEYS` there.
 */

import { copy } from './copy.ts';

/** Each voice key, and the house line it replaces. The lines are read from `copy.ts`, never typed here. */
export const VOICE_LINES = {
  home: copy.home,
  decide: copy.decide,
  inbox: copy.inbox,
  lists: copy.lists,
  right_now: copy.rightNow,
  needs_you: copy.needsYou,
  nothing_needs_you: copy.nothingNeedsYou,
  since_away: copy.sinceAway,
  nothing_new: copy.nothingNew,
} as const;

export type VoiceKey = keyof typeof VOICE_LINES;
export type Voice = Partial<Record<VoiceKey, string>>;

/** A use case's pack is `usecase-<id>`. */
export const USE_CASE_PACK = /^usecase-[a-z][a-z0-9-]*$/;

/** The voice held in a use-case pack's settings: each `voice_<key>` that is a line of text. */
export function voiceOf(values: Readonly<Record<string, unknown>>): Voice {
  const out: Voice = {};
  for (const key of Object.keys(VOICE_LINES) as VoiceKey[]) {
    const line = values[`voice_${key}`];
    if (typeof line === 'string' && line.trim() !== '') out[key] = line;
  }
  return out;
}

/** The line to draw: the voice's, or the house voice's. */
export const lineOf = (voice: Voice, key: VoiceKey): string => voice[key] ?? VOICE_LINES[key];

/** The use-case pack whose voice a record speaks in: the first one switched on, in the order the record lists them. */
export const speaking = (packs: readonly { id: string; disabled_at: string | null }[]): string | null =>
  packs.find((p) => USE_CASE_PACK.test(p.id) && p.disabled_at === null)?.id ?? null;
