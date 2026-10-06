/**
 * Settings > Words and money: which add-on keeps the record's home currency, and which of the speaking use case's
 * settings are its lists' names, their singulars and its house lines, read off what that pack declares.
 *
 * THE SAME SETTINGS `/packs/<id>` DRAWS, AS A PERSON READS THEM. That page draws every setting a use case declares in
 * schema order under titles like "Label: one of tickets", which is a developer's surface (`research-customise-35.md`
 * gap 4). This reads the same `packConfig` answer and sorts it into what a person changes: each list's name and what
 * one of it is called, the tab names, and the rest of the lines. It writes through the same `setPackConfig`, so the
 * record keeps one copy of each word and a share of the use case carries what was typed here.
 *
 * ONLY WHAT THE PACK DECLARES IS DRAWN. The record refuses a setting the pack does not declare (`writePackConfig`,
 * FIELD_UNKNOWN), so a list the use case gives no word for has no box here rather than a box that is refused.
 *
 * PLAIN TYPESCRIPT, SO A TEST CAN LOAD IT IN NODE.
 */

import { VOICE_LINES, labelsOf, type VoiceKey } from '../../../lib/voice.ts';
import { labelOf, type ConfigDecl, type PackConfig, type PackState } from '../../../lib/record/packs.ts';

/** The setting a home currency is kept under, the kernel's `HOME_CURRENCY_SETTING`, spelt as `packs.ts` spells it. */
export const HOME_CURRENCY = 'home_currency';

/**
 * THE VOICE KEYS THAT NAME A TAB, and the most characters each may have: `@braindog/declare` `VOICE_TAB_KEYS`, which
 * the shell may not import (`voice.ts` says why). The phone's tab bar cuts a longer one mid-word.
 */
export const TAB_KEYS: readonly VoiceKey[] = ['home', 'decide', 'inbox', 'lists'];
export const TAB_MOST = 12;

/** One word or line the pack declares: the setting it is kept under, what it is called, what it holds and its default. */
export type Word = { setting: string; title: string; value: string; fallback: string };

/** One list's words: its name and what one of it is called, either absent where the pack gives no word for it. */
export type ListWords = { list: string; name: Word | null; one: Word | null };

/** What the speaking use case lets a person change, sorted the way the area draws it. */
export type Spoken = { lists: ListWords[]; tabs: Word[]; lines: Word[] };

const text = (v: unknown): string => (typeof v === 'string' ? v : '');

/** A text setting as a `Word`, its fallback the declared default or, for a house line, the house voice's own. */
function wordOf(s: PackConfig, setting: string, title: string, house = ''): Word {
  const decl = s.config[setting] as ConfigDecl;
  const fallback = text(decl.default) || house;
  return { setting, title, value: text(s.values[setting]) || fallback, fallback };
}

/**
 * The lists, tabs and lines a use case's settings hold. A list setting is read back to its label key through the same
 * reader the shell uses (`labelsOf`), so a long one kept by its hash lands on its list as a short one does. Field and
 * value labels and a list's "holds" line stay at `/packs/<id>`: this area is the words a person reads on every screen.
 */
export function wordsOf(s: PackConfig): Spoken {
  const lists = new Map<string, ListWords>();
  const voiced = new Map<VoiceKey, Word>();
  for (const [setting, decl] of Object.entries(s.config)) {
    if (decl.type !== 'text') continue;
    if (setting.startsWith('voice_')) {
      const key = setting.slice('voice_'.length) as VoiceKey;
      if (Object.hasOwn(VOICE_LINES, key)) voiced.set(key, wordOf(s, setting, decl.label ?? VOICE_LINES[key], VOICE_LINES[key]));
      continue;
    }
    const key = Object.keys(labelsOf({ [setting]: '-' }, s.config))[0];
    if (key === undefined || key.includes('.') || key.endsWith(':holds')) continue;
    const list = key.replace(/:one$/u, '');
    const held = lists.get(list) ?? { list, name: null, one: null };
    if (key.endsWith(':one')) held.one = wordOf(s, setting, list);
    else held.name = wordOf(s, setting, list);
    lists.set(list, held);
  }
  const ordered = (Object.keys(VOICE_LINES) as VoiceKey[]).flatMap((k) => {
    const w = voiced.get(k);
    return w ? [[k, w] as const] : [];
  });
  return {
    lists: [...lists.values()],
    tabs: ordered.filter(([k]) => TAB_KEYS.includes(k)).map(([, w]) => w),
    lines: ordered.filter(([k]) => !TAB_KEYS.includes(k)).map(([, w]) => w),
  };
}

/**
 * What Save sends: only the words that moved. A box cleared, or typed back to the use case's own word, sends `null`,
 * which the record reads as the default, so nothing is kept that only repeats it.
 */
export function changesOf(words: readonly Word[], typed: Readonly<Record<string, string>>): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const w of words) {
    const now = (typed[w.setting] ?? w.value).trim();
    if (now === w.value.trim()) continue;
    out[w.setting] = now === '' || now === w.fallback ? null : now;
  }
  return out;
}

/** What puts the words a save changed back: each as it was held, or `null` where it held its default. */
export const undoOf = (words: readonly Word[], sent: Readonly<Record<string, unknown>>): Record<string, string | null> =>
  Object.fromEntries(words.filter((w) => Object.hasOwn(sent, w.setting)).map((w) => [w.setting, w.value === w.fallback ? null : w.value]));

/* WORDS WHOSE PLURAL IS NOT THE RULE'S, by the last word of a name, lower case. A business names its lists with these
   often enough that "Person" under "People" and "Series" under "Series" are worth a line each. */
const IRREGULAR: Readonly<Record<string, string>> = {
  people: 'person',
  children: 'child',
  men: 'man',
  women: 'woman',
  series: 'series',
  species: 'species',
  news: 'news',
  data: 'data',
  media: 'media',
  staff: 'staff',
  feet: 'foot',
  teeth: 'tooth',
  mice: 'mouse',
};
/* -IES WORDS THAT ARE NOT -Y WORDS: "Movies" is one movie, not one movy. */
const IE = new Set(['movies', 'cookies', 'calories', 'zombies', 'rookies', 'selfies', 'smoothies', 'hoodies', 'freebies', 'goalies', 'brownies', 'pies', 'ties', 'lies', 'dies']);

/** `to` written in the case of `like`: capitals where it is all capitals, a capital first where it starts with one. */
function cased(to: string, like: string): string {
  if (like.length > 1 && like === like.toUpperCase() && like !== like.toLowerCase()) return to.toUpperCase();
  if (/^\p{Lu}/u.test(like)) return to.charAt(0).toUpperCase() + to.slice(1);
  return to;
}

/** One word made singular, keeping its own case: the ending is cut, and anything added is written in the word's case. */
function singular(word: string): string {
  const low = word.toLowerCase();
  const irregular = IRREGULAR[low];
  if (irregular !== undefined) return cased(irregular, word);
  const cut = (n: number, add = ''): string => word.slice(0, word.length - n) + cased(add, word.slice(-n) || word);
  if (low.endsWith('ies') && low.length > 4 && !IE.has(low)) return cut(3, 'y');
  /* NOT -ZES: "Sizes", "Prizes" and "Mazes" lose only the -s, and a "Quizzes" list is rarer than any of them. */
  if (/(?:ss|x|ch|sh)es$/u.test(low)) return cut(2);
  /* -USES: "Statuses" and "Bonuses" lose -es, "Houses", "Causes" and "Excuses" only the -s. */
  if (/[^aeiouc]uses$/u.test(low)) return cut(2);
  /* ALREADY ONE: "Status", "Address", "Analysis" end in an -s that is no plural. */
  if (/(?:ss|us|is)$/u.test(low)) return word;
  if (low.endsWith('s') && low.length > 1) return cut(1);
  return word;
}

/**
 * The singular a renamed list is offered while nobody has typed one: "Bakes" offers "bake", "HSBC cards" "HSBC card",
 * "Boxes" "box", "Deliveries" "delivery", "Series" "series".
 *
 * THE CASE IS THE PERSON'S, AND IT WAS LOST. This took the record's rule (`voice.ts` `singularOf`), which lowercases the
 * whole name and knows only -ies and -s, so "HSBC cards" offered "hsbc card", "Boxes" "boxe" and "Series" "sery". Only
 * the last word is made singular, and every word keeps the case it was typed in, with one exception: a name that is one
 * capitalised word ("Bakes") is a list's title, and its singular is said mid-sentence ("New bake"), as the use cases'
 * own singulars are. "Acme orders" keeps its capital, because there is no telling a name from a title in two words.
 */
export function oneFor(name: string): string {
  const words = name.trim().split(/\s+/u);
  const last = words.pop() ?? '';
  if (last === '') return '';
  const one = [...words, singular(last)].join(' ');
  return words.length === 0 && /^\p{Lu}\p{Ll}+$/u.test(last) ? one.charAt(0).toLowerCase() + one.slice(1) : one;
}

/**
 * THE LIMITS A NEW HOME CURRENCY MOVES, by the names their add-ons give them (the audit's finding 13).
 *
 * A limit typed as money is held in the currency it was typed in. The record counts it against a figure in that figure's
 * own currency or the home one, and one typed in the home currency as it was is converted at the day's rate where there
 * is one (`declare.ts` `liveTarget`). With no home currency it has nothing to convert into, and the typed limit stops
 * counting. Either way the bound the person typed changes under them, so these are named before the change.
 */
export function strandedBy(packs: readonly Read[], from: string, to: string): string[] {
  if (from === '' || from === to) return [];
  const out: string[] = [];
  for (const p of packs) {
    const s = p.settings;
    if (p.state.disabled_at !== null || s === null) continue;
    for (const [key, decl] of Object.entries(s.config)) {
      if (decl.type !== 'money') continue;
      const v = s.values[key] as { amount?: unknown; currency?: unknown } | null | undefined;
      if (v === null || typeof v !== 'object' || typeof v.amount !== 'number' || v.currency !== from) continue;
      out.push(labelOf(key, decl));
    }
  }
  return out;
}

/** "A", "A and B", "A, B, C and D", and past four, "A, B, C and 2 more". */
export function listed(names: readonly string[]): string {
  const shown = names.length > 4 ? [...names.slice(0, 3), `${names.length - 3} more`] : [...names];
  return shown.length <= 1 ? (shown[0] ?? '') : `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
}

/** A pack as read for this area: its state and, where the record answered, its settings. */
export type Read = { state: PackState; settings: PackConfig | null };

/**
 * THE PACK THAT KEEPS THE HOME CURRENCY, by the kernel's own rule (`declare.ts` `homeCurrency`): of the packs switched
 * on, by id, the first whose settings hold a code, else the first that declares the setting at all, which is where
 * first run writes it (`start/accept.ts`). Writing anywhere else would leave the kernel reading an earlier one.
 */
export function currencyPackOf(packs: readonly Read[]): PackConfig | null {
  const keeping = packs
    .filter((p) => p.state.disabled_at === null && p.settings !== null && Object.hasOwn(p.settings.config, HOME_CURRENCY))
    .sort((a, b) => (a.state.id < b.state.id ? -1 : a.state.id > b.state.id ? 1 : 0))
    .map((p) => p.settings as PackConfig);
  return keeping.find((s) => /^[A-Z]{3}$/u.test(text(s.values[HOME_CURRENCY]).trim().toUpperCase())) ?? keeping[0] ?? null;
}

/** The home currency a pack holds, as the kernel reads it: three letters in capitals, else none. */
export const currencyIn = (s: PackConfig | null): string => {
  const code = text(s?.values[HOME_CURRENCY]).trim().toUpperCase();
  return /^[A-Z]{3}$/u.test(code) ? code : '';
};
