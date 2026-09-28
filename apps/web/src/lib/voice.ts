/**
 * The voice a record speaks in: which lines of the house voice a use case replaces (`loop/research-spark.md` §2.2).
 *
 * THE HOUSE VOICE IS `copy.ts` AND THE `words` OBJECTS BESIDE THE SCREENS, AND THEY STAY THE ONLY PLACES A SENTENCE
 * IS TYPED. A voice is data a record holds, as the settings of its use-case pack (`voice_home`, `voice_needs_you`,
 * ...), and each key replaces exactly one house line below. A key a voice leaves out reads the house line, so the sample and
 * any record without a use case read exactly what they read before.
 *
 * NO PACKAGE IMPORT, because the shell reads this on every screen and `@braindog/declare` brings the
 * kernel with it. `voice.test.ts` holds the keys here to `VOICE_KEYS` there.
 */

import { copy } from './copy.ts';
import { penWords } from './design/words.ts';
import { words as homeWords } from './home/words.ts';

/**
 * Each voice key, and the house line it replaces. The lines are read from `copy.ts` and from the `words` objects of the
 * modules that draw them (Home's, the pen's), never typed here.
 *
 * THIS IS ALSO THE LIST OF SENTENCES A SCREEN READS THROUGH `said(key)` IN PLACE OF THE LINE ITSELF, and the comment
 * over each group names the screen that draws it. A line drawn straight from `copy` or a `words` object is the house
 * voice on every record, so a key is only heard once its screen asks `said()` for it.
 */
export const VOICE_LINES = {
  /* THE SPINE'S NAMES: the rail, the top bar, the phone's tab bar and its More sheet. */
  home: copy.home,
  decide: copy.decide,
  inbox: copy.inbox,
  lists: copy.lists,
  /* HOME'S HEADINGS, over the bands of the house Home (`home/default-home.ts`) and a use case's own. */
  right_now: copy.rightNow,
  needs_you: copy.needsYou,
  nothing_needs_you: copy.nothingNeedsYou,
  working_now: homeWords.workingNow,
  coming_up: homeWords.comingUp,
  overdue: homeWords.overdue,
  since_away: copy.sinceAway,
  nothing_new: copy.nothingNew,
  /* HOME'S EMPTY LINES (`routes/+page.svelte`, `home/default-home.ts`): nothing needing you, what fills the page, a
     block with nothing in it, and a record with nothing in it yet with its one button. */
  nothing_now: homeWords.nothingNow,
  fills_with: homeWords.fillsWith,
  nothing_waiting: homeWords.nothingWaiting,
  nothing_due: homeWords.nothingDue,
  record_empty: copy.recordEmpty,
  start_here: copy.startHere,
  /* DECIDE'S AND THE INBOX'S EMPTY LINES (`routes/decide/+page.svelte`, `routes/inbox/+page.svelte`). */
  no_questions: copy.noQuestions,
  inbox_clear: copy.inboxClear,
  /* THE ADD VERB: the word before a list's singular on its button and on the form's save (`routes/r/[register]`), and a
     list's first-row button (`page/BlockSlot.svelte`, `routes/v/[view]`). */
  new_row: copy.newRow,
  add_row: copy.addRow,
  add_first: copy.addOne,
  /* THE PEN'S EMPTY STATE, its title and its line (`routes/settings/[area]/areas/Navigation.svelte`). */
  pen_nothing: penWords.nothing,
  pen_waits: penWords.nothingWhy,
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

/** The page a use case declares as its Home: `usecase-student` answers `home-student`. The seed's `homePageOf` agrees. */
export const homePageOf = (pack: string): string => `home-${pack.replace(/^usecase-/u, '')}`;

/**
 * The page Home draws on a live record: the use case's own Home page when the record holds it, else the house one, `home`,
 * when that is held, else `null`. Only a page the record names is ever asked for, so a use case with no Home page is not
 * refused on every load. `null` is not an empty Home: Home then draws the house page, `DEFAULT_HOME`
 * (`lib/home/default-home.ts`), through the same reader (modules C8).
 */
export const homeSlugOf = (useCasePage: string | null, pages: readonly string[]): string | null =>
  [useCasePage, 'home'].find((slug): slug is string => slug !== null && pages.includes(slug)) ?? null;

/** A use-case pack as the voice rule reads it, with its `speaks` setting when that was read (`@braindog/declare` `SpeakingState`). */
export type SpeakingState = { id: string; disabled_at: string | null; speaks?: boolean | null };

/** The setting a person chooses which use case speaks with. */
export const SPEAKS = 'speaks';

/**
 * The use-case pack whose voice a record speaks in, by the rule `@braindog/declare` `speakingPack` keeps: of those switched
 * on, by id, the first set to speak, else the first not set against it, else the first.
 */
export const speaking = (packs: readonly SpeakingState[]): string | null => {
  const on = packs.filter((p) => USE_CASE_PACK.test(p.id) && p.disabled_at === null).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return (on.find((p) => p.speaks === true) ?? on.find((p) => p.speaks !== false) ?? on[0])?.id ?? null;
};

/**
 * The use-case packs with each one's `speaks` setting read, so the rule sees what the person chose. Only asked for when two
 * or more are on, because one alone speaks whatever it holds. A setting that cannot be read counts as not chosen.
 */
export async function withSpeaks(packs: readonly SpeakingState[], valuesOf: (id: string) => Promise<Readonly<Record<string, unknown>> | null>): Promise<SpeakingState[]> {
  const on = packs.filter((p) => USE_CASE_PACK.test(p.id) && p.disabled_at === null);
  if (on.length < 2) return [...packs];
  return Promise.all(
    packs.map(async (p) => {
      if (!on.includes(p)) return p;
      const said = (await valuesOf(p.id).catch(() => null))?.[SPEAKS];
      return { ...p, speaks: typeof said === 'boolean' ? said : null };
    }),
  );
}

/**
 * WHAT INSTALLING ANOTHER USE CASE DOES TO THE VOICE, by the rule `@braindog/declare` `voiceWhenAdding` keeps: `beside`
 * when the use case speaking now keeps its voice and Home, `speaks` when the one added would take them, or none speaks.
 * Browse and a shared file say which before Install, as onboarding says "Adds Student as well".
 */
export function voiceWhenAdding(packs: readonly SpeakingState[], adding: string): 'speaks' | 'beside' {
  const pack = USE_CASE_PACK.test(adding) ? adding : `usecase-${adding}`;
  return speaking([...packs.filter((p) => p.id !== pack), { id: pack, disabled_at: null }]) === pack ? 'speaks' : 'beside';
}

/**
 * The `speaks` settings that make `speaker` the one use case speaking and every other one on not, by the rule
 * `@braindog/declare` `voiceWrites` keeps: exactly one speaks, adding one beside never moves it, and every door that adds
 * or switches writes the answer down once two are on. Only what differs; none while fewer than two are on.
 */
export function voiceWrites(packs: readonly SpeakingState[], speaker: string): { id: string; speaks: boolean }[] {
  const on = packs.filter((p) => USE_CASE_PACK.test(p.id) && p.disabled_at === null);
  if (on.length < 2 || !on.some((p) => p.id === speaker)) return [];
  return on.flatMap((p) => (p.speaks === (p.id === speaker) ? [] : [{ id: p.id, speaks: p.id === speaker }]));
}

/**
 * ONE CHANGE'S BATCH, a ULID: the voice is written down one pack at a time, and every call of one answer carries the same
 * batch so the log (Home's feed) reads them as one change and never pairs them with another write's by where they sit.
 */
export function voiceBatch(now: number = Date.now()): string {
  const crockford = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let time = '';
  for (let t = now, i = 0; i < 10; i++, t = Math.floor(t / 32)) time = crockford[t % 32] + time;
  const random = crypto.getRandomValues(new Uint8Array(16));
  return time + [...random].map((b) => crockford[b % 32]).join('');
}

/**
 * THE WORDS A RECORD GIVES ITS LISTS, FIELDS AND STATES (`loop/research-spark.md` S8), by label key: `tickets`,
 * `people.role`, `people.role.collaborator`. Held as the use-case pack's `label_*` settings, where a person can
 * change them, and read in place of the declaration's own word. A key left out reads the declaration's word.
 */
export type Labels = Readonly<Record<string, string>>;

const SEGMENT = '[a-z][a-z0-9]*(?:_[a-z0-9]+)*';
const LABEL_KEY = new RegExp(`^${SEGMENT}(?:[.]${SEGMENT}){0,2}$`);
/** A list's singular and its description line, `tickets:one` and `tickets:holds`, kept as `one_tickets` and `holds_tickets`. */
const LIST_WORDS = ['one', 'holds'] as const;
const LIST_WORD_KEY = new RegExp(`^${SEGMENT}:(?:${LIST_WORDS.join('|')})$`);

/** A setting name, at most 32 characters; a label whose name would be longer is kept as `lk_` and its key's hash. */
const SETTING_NAME = /^[a-z][a-z0-9_]{0,31}$/;
const HASHED = /^lk_[0-9a-f]{8}$/;
const fnv = (s: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
};

/** The setting a label key is kept under, as `@braindog/declare` `labelSetting` names it. */
export const labelSetting = (key: string): string => {
  const word = /^(.+):(one|holds)$/.exec(key);
  const name = word ? `${word[2]}_${word[1]}` : `label_${key.split('.').join('__')}`;
  return SETTING_NAME.test(name) ? name : `lk_${fnv(key)}`;
};

/** A long label's key, from the title its setting was declared with and checked against the hash, or `null`. */
function hashedKey(setting: string, title: unknown): string | null {
  if (typeof title !== 'string') return null;
  const under = (s: string): string => s.replace(/ /g, '_');
  const one = /^Label: one of (.+)$/.exec(title);
  const holds = /^Label: what (.+) holds$/.exec(title);
  const plain = /^Label: (.+)$/.exec(title);
  const candidates = [one ? `${under(one[1] ?? '')}:one` : null, holds ? `${under(holds[1] ?? '')}:holds` : null, plain ? (plain[1] ?? '').split(', ').map(under).join('.') : null];
  return candidates.find((k): k is string => k !== null && (LABEL_KEY.test(k) || LIST_WORD_KEY.test(k)) && labelSetting(k) === setting) ?? null;
}

/**
 * The labels held in a use-case pack's settings: each `label_<list>[__<field>[__<value>]]`, `one_<list>` and
 * `holds_<list>` that is a line of text, and each long label's `lk_<hash>`, read back through the pack's declared
 * settings in `config`.
 */
export function labelsOf(values: Readonly<Record<string, unknown>>, config: Readonly<Record<string, { label?: unknown } | undefined>> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [setting, word] of Object.entries(values)) {
    if (typeof word !== 'string' || word.trim() === '') continue;
    if (HASHED.test(setting)) {
      const key = hashedKey(setting, config[setting]?.label);
      if (key !== null) out[key] = word;
      continue;
    }
    const listWord = LIST_WORDS.find((w) => setting.startsWith(`${w}_`));
    if (listWord) {
      const key = `${setting.slice(listWord.length + 1)}:${listWord}`;
      if (LIST_WORD_KEY.test(key)) out[key] = word;
      continue;
    }
    if (!setting.startsWith('label_')) continue;
    const key = setting.slice('label_'.length).split('__').join('.');
    if (LABEL_KEY.test(key)) out[key] = word;
  }
  return out;
}

/** One of a list, from its name, the way `remote.ts` `declOf` says it when a declaration does not: Issues, issue. */
export const singularOf = (name: string): string => name.toLowerCase().replace(/ies$/u, 'y').replace(/([^s])s$/u, '$1');

/** A list's name: the record's label for it, or the name its declaration gives. */
export const listNamed = (labels: Labels, list: string, declared: string): string => labels[list] ?? declared;

type Relabellable = { id: string; name?: string; one?: string; holds?: string; fields?: readonly { id: string; label?: string; labels?: Readonly<Record<string, string>>; values?: readonly string[] }[] };

/**
 * A declaration with the record's labels drawn over its own words: the list's name, its singular, the line saying what
 * it holds, each field's label and each enum value's label. The same object when no label names this list, so a record
 * without labels costs nothing.
 *
 * A LIST RENAMED WITH NO SINGULAR GIVEN SAYS ONE OF THE NEW NAME. "Issues" over "New ticket" was two words for one list,
 * so a name that differs from the declaration's makes the singular from itself, unless `tickets:one` says otherwise.
 */
export function relabel<T extends Relabellable>(decl: T, labels: Labels): T {
  const prefix = `${decl.id}.`;
  if (labels[decl.id] === undefined && !Object.keys(labels).some((k) => k.startsWith(prefix) || k.startsWith(`${decl.id}:`))) return decl;
  const renamed = labels[decl.id] !== undefined && labels[decl.id] !== decl.name ? labels[decl.id] : undefined;
  const one = labels[`${decl.id}:one`] ?? (renamed === undefined ? undefined : singularOf(renamed));
  const holds = labels[`${decl.id}:holds`];
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
  return {
    ...decl,
    ...(labels[decl.id] === undefined ? {} : { name: labels[decl.id] }),
    ...(one === undefined ? {} : { one }),
    ...(holds === undefined ? {} : { holds }),
    ...(fields ? { fields } : {}),
  };
}

/**
 * THE BUILD'S OWN LISTS, RELABELLED IN PLACE. A page, Home and the palette read first-party lists (People, Projects) from
 * the declarations this build ships, which no label reached, so a team's People list was "Teammates" on the rail and
 * "People" on its Board. Each list is drawn from the words it had before any label, so a label taken away puts the
 * declaration's word back.
 *
 * A LIST PUT IN THE TABLE SINCE IS THE NEW BARE ONE. This kept each list's first body for good, which for a list the
 * build ships is the bundle's, so a field added at run time (`remote.ts` `learn`) was drawn over by the bundle on the
 * next boot, and every navigation after an add is one (`data/field-added.test.ts`). An entry that is not the object
 * this last wrote is taken as the list's own words; `relabelInto` hands over the bare copy with the relabelled one.
 */
type Kept = { bare: Relabellable; wrote: Relabellable };
const unlabelled = new WeakMap<object, Map<string, Kept>>();
const keptFor = (table: object): Map<string, Kept> => {
  let kept = unlabelled.get(table);
  if (!kept) unlabelled.set(table, (kept = new Map()));
  return kept;
};
export function relabelAll<T extends Relabellable>(table: Record<string, T>, labels: Labels): void {
  const kept = keptFor(table);
  for (const [id, decl] of Object.entries(table)) {
    const was = kept.get(id);
    const bare = was && was.wrote === decl ? (was.bare as T) : decl;
    table[id] = relabel(bare, labels);
    kept.set(id, { bare, wrote: table[id] });
  }
}

/** One list put in the table as the record now declares it, bare, and drawn over with the labels; later boots redraw it. */
export function relabelInto<T extends Relabellable>(table: Record<string, T>, id: string, bare: T, labels: Labels): void {
  table[id] = relabel(bare, labels);
  keptFor(table).set(id, { bare, wrote: table[id] });
}

/* THE LABELS THIS TAB'S RECORD HOLDS, set once per `boot` by `voice.svelte.ts` and read by the list reader and the
   shell. A plain holder and not a rune, because the readers are plain modules that run after the layout has listened. */
let held: Labels = {};
export const heardLabels = (labels: Labels): void => {
  held = labels;
};
export const labels = (): Labels => held;

/**
 * A declared value as a control offers it: the record's label for it (`relabel` lays it in `f.labels`), else the value
 * spelt as a word. THE FORM READ NO LABEL, so a household's picker offered Client where its saved row read Work contact
 * (`ui/value-said.test.ts`).
 */
export const valueSaid = (f: { labels?: Readonly<Record<string, string>> }, value: string): string => f.labels?.[value] ?? copy.valueWord(value);
