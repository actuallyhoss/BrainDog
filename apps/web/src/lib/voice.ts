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

/**
 * THE WORDS A RECORD GIVES ITS LISTS, FIELDS AND STATES (`loop/research-spark.md` S8), by label key: `tickets`,
 * `people.role`, `people.role.collaborator`. Held as the use-case pack's `label_*` settings, where a person can
 * change them, and read in place of the declaration's own word. A key left out reads the declaration's word.
 */
export type Labels = Readonly<Record<string, string>>;

const LABEL_KEY = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:_[a-z0-9]+)*){0,2}$/;

/** The labels held in a use-case pack's settings: each `label_<list>[__<field>[__<value>]]` that is a line of text. */
export function labelsOf(values: Readonly<Record<string, unknown>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [setting, word] of Object.entries(values)) {
    if (!setting.startsWith('label_') || typeof word !== 'string' || word.trim() === '') continue;
    const key = setting.slice('label_'.length).split('__').join('.');
    if (LABEL_KEY.test(key)) out[key] = word;
  }
  return out;
}

/** A list's name: the record's label for it, or the name its declaration gives. */
export const listNamed = (labels: Labels, list: string, declared: string): string => labels[list] ?? declared;

type Relabellable = { id: string; name?: string; fields?: readonly { id: string; label?: string; labels?: Readonly<Record<string, string>>; values?: readonly string[] }[] };

/**
 * A declaration with the record's labels drawn over its own words: the list's name, each field's label and each
 * enum value's label. The same object when no label names this list, so a record without labels costs nothing.
 */
export function relabel<T extends Relabellable>(decl: T, labels: Labels): T {
  const prefix = `${decl.id}.`;
  if (labels[decl.id] === undefined && !Object.keys(labels).some((k) => k.startsWith(prefix))) return decl;
  const fields = decl.fields?.map((f) => {
    const own = labels[`${decl.id}.${f.id}`];
    const valuePrefix = `${decl.id}.${f.id}.`;
    const values = Object.entries(labels).filter(([k]) => k.startsWith(valuePrefix));
    if (own === undefined && values.length === 0) return f;
    return {
      ...f,
      ...(own === undefined ? {} : { label: own }),
      ...(values.length === 0 ? {} : { labels: { ...f.labels, ...Object.fromEntries(values.map(([k, w]) => [k.slice(valuePrefix.length), w])) } }),
    };
  });
  return { ...decl, ...(labels[decl.id] === undefined ? {} : { name: labels[decl.id] }), ...(fields ? { fields } : {}) };
}

/* THE LABELS THIS TAB'S RECORD HOLDS, set once per `boot` by `voice.svelte.ts` and read by the list reader and the
   shell. A plain holder and not a rune, because the readers are plain modules that run after the layout has listened. */
let held: Labels = {};
export const heardLabels = (labels: Labels): void => {
  held = labels;
};
export const labels = (): Labels => held;
