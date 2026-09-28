/**
 * A use case: what one kind of person needs a BrainDog to be, as a file (`loop/research-spark.md` §2.1).
 *
 * IT IS A PACK WITH A FRONT. The registers, pages and example rows a use case adds are an ordinary pack
 * document named `usecase-<id>`, installed through `plan` and `install` like a stranger's add-on. What
 * the front adds is what a pack cannot say: the first-party modules to install first, the words the
 * arranger listens for, and the voice the display speaks in.
 *
 * THE VOICE IS STORED AS THE PACK'S SETTINGS. `useCasePack` writes each voice line as a text setting,
 * `voice_<key>`, with the line as its default, so the record holds its own voice, a person can change a
 * line at `/packs/<id>`, and switching the pack off puts the house voice back. No new declaration kind
 * and no kernel change: the display reads `packConfig` and falls back to `copy.ts` for a key left out.
 *
 * LABELS ARE SETTINGS TOO (S8). A use case may rename a list, a field or one value of a field, its own or a
 * first-party module's, and each word is a text setting, `label_<list>[__<field>[__<value>]]`, which the
 * display reads in place of the declaration's word and a person can change like a voice line. A list's singular and
 * the line saying what it holds are words too, `list:one` and `list:holds`, kept as `one_<list>` and `holds_<list>`,
 * because a field may be called `one` and a label key names fields after the dot.
 *
 * A NAME TOO LONG FOR A SETTING IS KEPT BY ITS HASH. A setting name is at most 32 characters, and
 * `label_obligations__category__client_work` is 40, so a use case could not rename a value of Money's categories. Such a
 * label is kept as `lk_<hash>`, and the setting's own title (`Label: obligations, category, client work`) says the key
 * again, exactly, so a reader holding the pack's declared settings reads it back; the hash is checked against it. Every
 * name that fits keeps the form it always had, so no setting a record already holds is renamed.
 *
 * THE KEYS ARE CLOSED. A voice key is a slot the display promises to read, so a use case cannot put a
 * sentence anywhere on screen; it can only replace one the house voice already says.
 *
 * Refusals use codes the registry already holds: `PACK_MALFORMED` for the shape, `FIELD_UNKNOWN` for a key
 * the format does not have, `VALUE_MALFORMED` for a value of the wrong kind.
 */

import type { Result } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

/**
 * The lines a voice may replace, in the order the display meets them: the spine's four names, Home's headings and its
 * empty lines, Decide's and the Inbox's empty lines, the add verb, and the pen's empty line.
 *
 * WIDER THAN THE HEADINGS, BECAUSE A TONE IS MORE THAN ITS HEADINGS (`loop/DIRECTION.md` §11: a student's record should not
 * talk like an accounts department). The first keys named only the rail and Home's bands, so every empty line, the verb on a
 * list's add button and the pen's line still spoke the house voice on a record set up for a student. Each key here is a
 * sentence the house voice already says, read through `said()` in the web with that sentence as the fallback.
 */
export const VOICE_KEYS = [
  'home', 'decide', 'inbox', 'lists',
  'right_now', 'needs_you', 'nothing_needs_you', 'working_now', 'coming_up', 'overdue', 'since_away', 'nothing_new',
  'nothing_now', 'fills_with', 'nothing_waiting', 'nothing_due', 'record_empty', 'start_here',
  'no_questions', 'inbox_clear',
  'new_row', 'add_row', 'add_first',
  'pen_nothing', 'pen_waits',
] as const;
export type VoiceKey = (typeof VOICE_KEYS)[number];

/**
 * THE KEYS THAT NAME A TAB, and the most characters such a line may have. The phone's tab bar draws Home, Decide and the
 * Inbox side by side at 390, and the More sheet draws the lists' name as one row, so a line longer than the tab's label
 * would be cut off mid-word. A use case's file is refused at the key that is too long.
 */
export const VOICE_TAB_KEYS: readonly VoiceKey[] = ['home', 'decide', 'inbox', 'lists'];
export const VOICE_TAB_CHARS = 12;

/**
 * The audiences a form suggests for who a use case is for. Said on the proposal and used to group a catalogue.
 *
 * SUGGESTIONS AND NOT A CLOSED LIST (shell.md USE-3). A shared use case is written by somebody we have not met, for
 * people we did not think of: "a choir", "an allotment society". The starters use these five words, and `alongside` in the
 * seed reads `individual` to know which use cases may sit beside each other, so an audience outside them is only ever
 * said and grouped by, never refused.
 */
export const AUDIENCES = ['individual', 'founder', 'team', 'starter', 'other'] as const;
export type Audience = string;

/**
 * The first-party packs this build ships, which own the lists in `MODULE_LISTS`. The seed's test holds this to its own list.
 *
 * NOT THE PACKS A USE CASE MAY NAME (shell.md USE-3). A use case may stand on any pack in the catalogue, a shared add-on
 * as much as Money, so `modules` is checked for the shape of a pack id and nothing else, and a pack the host cannot find
 * is refused at install by name, where the person can do something about it.
 */
export const MODULES = ['portfolio', 'people', 'money-core', 'estate', 'work', 'agents'] as const;
export type ModuleId = (typeof MODULES)[number];

/**
 * The lists each first-party module provides, by id, and the name a person knows it by. A shared use case may not declare
 * one of these unless it installs that module (`readShared`), because the record reads some of them as the module's own:
 * `boot` names members to whoever may read People. Held equal to the modules' manifests by `packages/seed`'s tests.
 *
 * THE ONE TABLE OF WHICH MODULE OWNS WHICH LIST (`loop/research-shell-seed-next.md` N4). There was a second, written out by
 * hand in `index.ts` as `FIRST_PARTY_LISTS`, and it had left Agents out: an add-on declaring `skills` or `credentials` was
 * read as fine by `readPackFile` while a use case declaring the same list was refused by `readShared`, and the add-on then
 * collided at install on any record with Agents. Moving a list between modules is an edit here and nowhere else.
 *
 * `holdings` IS NOT MONEY'S SINCE money-core 2.0.0, and it is in no module here, because the pack that declares it now
 * (`packs/holdings/holdings.pack.json`) is not a module a use case names. So an add-on or a shared use case declaring a
 * list called `holdings` is read as its own list, as `gold_lots` always was, and meets the holdings pack, if the record
 * has it, as the `PROVIDES_CONFLICT` two packs owning one declaration always get at install.
 */
export const MODULE_LISTS: Readonly<Record<ModuleId, { name: string; lists: readonly string[] }>> = {
  portfolio: { name: 'Portfolio', lists: ['things'] },
  people: { name: 'People', lists: ['people'] },
  'money-core': {
    name: 'Money',
    lists: ['accounts', 'balances', 'categories', 'fx', 'installments', 'obligations', 'recurring', 'snapshots', 'transactions'],
  },
  estate: { name: 'Estate', lists: ['services'] },
  work: { name: 'Work', lists: ['tasks', 'tracks', 'updates'] },
  agents: { name: 'Agents', lists: ['credentials', 'learnings', 'skills', 'tools'] },
};

/**
 * The module that owns each list, read off `MODULE_LISTS`: what a refusal names when a file declares a module's list, and
 * what "Install X first" names when a pack points at one nothing holds.
 */
export const FIRST_PARTY_LISTS: ReadonlyMap<string, ModuleId> = new Map(MODULES.flatMap((m) => MODULE_LISTS[m].lists.map((l): [string, ModuleId] => [l, m])));

export type UseCase = {
  usecase: string;
  version: string;
  title: string;
  summary: string;
  author: string;
  license: string;
  audience: Audience;
  /** How the voice reads, in a few words: "plain and encouraging". */
  tone: string;
  /** Lower-case words and short phrases the arranger listens for. */
  signals: string[];
  /** First-party packs installed before the use case's own, in dependency order. */
  modules: string[];
  voice: Partial<Record<VoiceKey, string>>;
  /**
   * The words this use case gives lists, fields and states, by label key: `tickets`, `people.role`,
   * `people.role.collaborator`. Each is kept as a setting of the carried pack, so a person can change it.
   */
  labels: Record<string, string>;
  /** The pack document the use case carries, or `null` for one that only arranges first-party modules. */
  pack: Record<string, unknown> | null;
  /** What an agent should know here. Offered to the agents pack as proposals, never installed directly. */
  skills: { name: string; trigger: string }[];
  /**
   * The rail's order as the person who shared it arranged it: addresses of the pages and lists this use case carries,
   * `/p/<page>` and `/r/<list>`, in the order they were drawn. A record keeps no install order, so without this a
   * second record draws the lists in id order. Applied as the reader's own nav order, which they can change.
   */
  nav: string[];
  /**
   * How its example rows point at each other, which a seed cannot say (a seed carries no link): the example titled `title`
   * in `register` points its `field` at the example titled `target` in `to`. Made after the install through the ordinary
   * write path, and only between rows that are still examples, so a file that shares its own lists shares their links too.
   */
  links: ExampleLink[];
};

/** One link between two example rows, by their titles. `list` when the field holds a list of refs. */
export type ExampleLink = { register: string; title: string; field: string; to: string; target: string; list?: true };

const KEYS = ['usecase', 'version', 'title', 'summary', 'author', 'license', 'audience', 'tone', 'signals', 'modules', 'voice', 'labels', 'pack', 'skills', 'nav', 'links'];
const LINK_KEYS = ['register', 'title', 'field', 'to', 'target', 'list'];
const LINK_NAME = /^[a-z][a-z0-9_]{0,63}$/;
const LINKS_CEILING = 256;
const LINK_TITLE_BYTES = 200;
const ID = /^[a-z][a-z0-9-]{1,40}$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?$/;
const SIGNAL = /^[a-z0-9][a-z0-9 '-]{0,39}$/;
const SKILL = /^[a-z][a-z0-9-]{1,63}$/;
const VOICE_BYTES = 80;
/**
 * A VOICE LINE MAY BE A SENTENCE, where a label is a word or a few. Home's line saying what fills it is longer than a
 * label's limit in the house voice itself, so a use case could not say it its own way. Still one line, well under the
 * kernel's own ceiling for a text setting.
 */
const VOICE_LINE_BYTES = 200;
const NAV_ADDRESS = /^\/(p|r)\/[a-z0-9][a-z0-9_-]{0,63}$/;
const NAV_CEILING = 64;
const SIGNALS_CEILING = 64;
/** A pack id, as `index.ts` reads one in a pack file, for a module a use case stands on. */
const PACK_ID = /^[a-z][a-z0-9-]{1,63}$/;
const AUDIENCE_BYTES = 40;
const MODULES_CEILING = 32;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const bytes = (s: string): number => new TextEncoder().encode(s).length;
const malformed = <T>(fix: string, at: string): Result<T> => no<T>('PACK_MALFORMED', fix, { at });
const text = (v: unknown, most: number): v is string => typeof v === 'string' && v.trim() !== '' && bytes(v) <= most;

/** The pack id a use case carries. */
export const packIdOf = (usecase: string): string => `usecase-${usecase}`;

/**
 * THE VOICE RULE, ONE PLACE FOR EVERY DOOR A SECOND USE CASE COMES IN BY (onboarding, browse, a shared file, an agent's
 * arrangement, switching):
 *
 * 1. EXACTLY ONE USE CASE SPEAKS while any is on: `speakingPack`, the first by id set to speak, else the first not set
 *    against it, else the first.
 * 2. ADDING ONE BESIDE NEVER CHANGES WHO SPEAKS. Taking the voice over, or switching, is the only way it moves.
 * 3. EVERY DOOR THAT ADDS OR SWITCHES WRITES THE ANSWER DOWN once two or more are on (`voiceWrites`): the one speaking
 *    set to speak and every other set not to. So who speaks never rests on how ids sort, on a third use case arriving,
 *    or on which one was read first.
 *
 * This answers what happens UNASKED: `speaks` when the use case added would speak by the rule once it is on, or when none
 * speaks yet; `beside` when the one speaking now would keep it.
 */
export function voiceWhenAdding(packs: readonly SpeakingState[], adding: string): 'speaks' | 'beside' {
  const pack = adding.startsWith(packIdOf('')) ? adding : packIdOf(adding);
  return speakingPack([...packs.filter((p) => p.id !== pack), { id: pack, disabled_at: null }]) === pack ? 'speaks' : 'beside';
}

/**
 * The `speaks` settings that make `speaker` the one use case speaking, and every other one on not: only those that differ
 * from what `packs` say they hold. None while fewer than two are on, because one alone speaks whatever it holds.
 */
export function voiceWrites(packs: readonly SpeakingState[], speaker: string): { id: string; speaks: boolean }[] {
  const on = packs.filter((p) => p.id.startsWith(packIdOf('')) && p.disabled_at === null);
  if (on.length < 2 || !on.some((p) => p.id === speaker)) return [];
  return on.flatMap((p) => (p.speaks === (p.id === speaker) ? [] : [{ id: p.id, speaks: p.id === speaker }]));
}

/**
 * A use-case pack as the voice rule reads it: on or off, and its `speaks` setting when it was read. `true` when the person
 * chose this one to speak, `false` when they chose to keep another's voice, and absent or `null` when nobody chose.
 */
export type SpeakingState = { id: string; disabled_at: string | null; speaks?: boolean | null };

/**
 * THE SETTING A PERSON CHOOSES THE VOICE WITH, when a second use case comes in. The rule by id is only the default: a pack
 * set to speak speaks, and one set not to is passed over, so either use case can keep the voice whichever id sorts first.
 */
export const SPEAKS = 'speaks';

/**
 * The use-case pack a record speaks in, or `null` for the house voice: of those switched on, by id, the first set to speak,
 * else the first not set against it, else the first.
 */
export const speakingPack = (packs: readonly SpeakingState[]): string | null => {
  const on = packs.filter((p) => p.id.startsWith(packIdOf('')) && p.disabled_at === null).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return (on.find((p) => p.speaks === true) ?? on.find((p) => p.speaks !== false) ?? on[0])?.id ?? null;
};

/** The setting a voice line is stored under. */
export const voiceSetting = (key: VoiceKey): string => `voice_${key}`;

/**
 * A label key: a list, a list's field, or one value of a field, as `list`, `list.field` or `list.field.value`.
 *
 * LABELS ARE WORDS, NOT SENTENCES. A label renames something a declaration already names (Tickets for a
 * list, Teammate for a role), so it is read where the declaration's own word was read and nowhere else.
 */
const SEGMENT = '[a-z][a-z0-9]*(?:_[a-z0-9]+)*';
export const LABEL_KEY = new RegExp(`^${SEGMENT}(?:\\.${SEGMENT}){0,2}$`);
const LABEL_PREFIX = 'label_';
/** Settings are named in lower case with underscores, at most 32; the dots of a label key are written `__`. */
const SETTING_NAME = /^[a-z][a-z0-9_]{0,31}$/;
/** The most settings a pack declares (`readConfig`'s ceiling), which voice and labels share with `shared_version` and `speaks`. */
const SETTINGS_CEILING = 64;
const HELD_SETTINGS = 2;

/**
 * THE VERSION THIS ARRANGEMENT WAS LAST SHARED AS, kept as a setting of the pack a use case carries, so a second share
 * from the same record offers the version after it rather than the one after the installed version again.
 */
export const SHARED_VERSION = 'shared_version';

/**
 * A LIST'S OWN WORDS BESIDE ITS NAME: `tickets:one` is what one ticket is called ("New issue"), `tickets:holds` the line
 * saying what the list holds. Stored as `one_tickets` and `holds_tickets`.
 */
export const LIST_WORDS = ['one', 'holds'] as const;
export type ListWord = (typeof LIST_WORDS)[number];
export const LIST_WORD_KEY = new RegExp(`^(${SEGMENT}):(${LIST_WORDS.join('|')})$`);
/** A description line is a sentence's worth, where every other label is a word or a few. */
const HOLDS_BYTES = 280;

/** A long label's setting: `lk_` and eight hex digits of the key's FNV-1a hash. */
const HASHED_PREFIX = 'lk_';
const HASHED = /^lk_[0-9a-f]{8}$/;
const fnv = (s: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
};

/**
 * The setting a label is stored under: `label_people__role__collaborator`, or `one_tickets` for `tickets:one`, or
 * `lk_<hash>` for a key whose name would be longer than a setting's.
 */
export const labelSetting = (key: string): string => {
  const word = LIST_WORD_KEY.exec(key);
  const name = word ? `${word[2]}_${word[1]}` : `${LABEL_PREFIX}${key.split('.').join('__')}`;
  return SETTING_NAME.test(name) ? name : `${HASHED_PREFIX}${fnv(key)}`;
};

/**
 * The label key a long label's setting holds, read from the title `labelTitle` gave it (`Label: obligations, category,
 * client work`) and checked against the setting's hash, or `null`.
 */
export const labelKeyOf = (setting: string, title: unknown): string | null => {
  if (!HASHED.test(setting) || typeof title !== 'string') return null;
  const under = (s: string): string => s.replace(/ /g, '_');
  const one = /^Label: one of (.+)$/.exec(title);
  const holds = /^Label: what (.+) holds$/.exec(title);
  const plain = /^Label: (.+)$/.exec(title);
  const candidates = [
    one ? `${under(one[1] ?? '')}:one` : null,
    holds ? `${under(holds[1] ?? '')}:holds` : null,
    plain ? (plain[1] ?? '').split(', ').map(under).join('.') : null,
  ];
  return candidates.find((k): k is string => k !== null && (LABEL_KEY.test(k) || LIST_WORD_KEY.test(k)) && labelSetting(k) === setting) ?? null;
};

/**
 * A use case, checked. Everything but the carried pack's declarations, which `normalise` checks when the
 * pack is planned, because that is the check a stranger's pack gets and there must not be a second one.
 */
export function normaliseUseCase(doc: unknown): Result<UseCase> {
  if (!isObject(doc)) return malformed('A use case is a document with a `usecase` and a `version` in it.', 'usecase');
  const stray = Object.keys(doc).find((k) => !KEYS.includes(k));
  if (stray !== undefined)
    return no('FIELD_UNKNOWN', `A use case has no ${stray}. It says ${KEYS.join(', ')}.`, { at: stray, allowed: KEYS });

  const id = doc.usecase;
  if (typeof id !== 'string' || !ID.test(id)) return malformed(`${String(id)} is not a use case id: lower-case letters, digits and hyphens.`, 'usecase');
  if (typeof doc.version !== 'string' || !SEMVER.test(doc.version)) return malformed(`${String(doc.version)} is not a version. Write 1.0.0.`, 'version');
  for (const key of ['title', 'summary', 'author', 'license', 'tone'] as const)
    if (!text(doc[key], key === 'summary' ? 280 : 80)) return malformed(`A use case says its ${key}, in a line of text.`, key);

  /* FREE TEXT ON ONE LINE, with the five suggestions offered in the refusal so a writer sees what the starters say. */
  if (!text(doc.audience, AUDIENCE_BYTES) || /[\r\n]/u.test(doc.audience))
    return no('VALUE_MALFORMED', `Say who this is for in a few words on one line, such as ${AUDIENCES.join(', ')}.`, { at: 'audience', allowed: [...AUDIENCES] });

  const signals = doc.signals ?? [];
  if (!Array.isArray(signals) || signals.length > SIGNALS_CEILING || signals.some((s) => typeof s !== 'string' || !SIGNAL.test(s)))
    return no('VALUE_MALFORMED', `Signals are up to ${SIGNALS_CEILING} lower-case words or short phrases.`, { at: 'signals' });
  if (new Set(signals).size !== signals.length) return no('VALUE_MALFORMED', 'A signal is listed twice.', { at: 'signals' });

  const modules = doc.modules ?? [];
  if (!Array.isArray(modules) || modules.length > MODULES_CEILING || modules.some((m) => typeof m !== 'string' || !PACK_ID.test(m)))
    return no('VALUE_MALFORMED', `Modules are the ids of up to ${MODULES_CEILING} packs in the catalogue, such as ${MODULES.join(', ')}.`, { at: 'modules', allowed: [...MODULES] });
  if (new Set(modules).size !== modules.length) return no('VALUE_MALFORMED', 'A module is listed twice.', { at: 'modules' });
  if (modules.includes(packIdOf(id))) return no('VALUE_MALFORMED', 'A use case does not stand on its own pack.', { at: 'modules' });

  const voice: Partial<Record<VoiceKey, string>> = {};
  if (doc.voice !== undefined) {
    if (!isObject(doc.voice)) return malformed('A voice is a line per key.', 'voice');
    for (const [key, line] of Object.entries(doc.voice)) {
      if (!(VOICE_KEYS as readonly string[]).includes(key))
        return no('FIELD_UNKNOWN', `A voice has no ${key}. It may replace ${VOICE_KEYS.join(', ')}.`, { at: `voice.${key}`, allowed: [...VOICE_KEYS] });
      if (!text(line, VOICE_LINE_BYTES) || /[\r\n]/u.test(line))
        return no('VALUE_MALFORMED', `voice.${key} is one line of text of at most ${VOICE_LINE_BYTES} bytes.`, { at: `voice.${key}` });
      if (VOICE_TAB_KEYS.includes(key as VoiceKey) && [...line].length > VOICE_TAB_CHARS)
        return no('VALUE_MALFORMED', `voice.${key} names a tab on a phone, so it is at most ${VOICE_TAB_CHARS} characters.`, { at: `voice.${key}` });
      voice[key as VoiceKey] = line;
    }
  }

  const labels: Record<string, string> = {};
  if (doc.labels !== undefined) {
    if (!isObject(doc.labels)) return malformed('Labels are a word per list, field or value.', 'labels');
    for (const [key, word] of Object.entries(doc.labels)) {
      const at = `labels.${key}`;
      const listWord = LIST_WORD_KEY.exec(key);
      if (!LABEL_KEY.test(key) && !listWord)
        return no('VALUE_MALFORMED', `${key} is not a label key: a list, list.field, list.field.value, list:one or list:holds.`, { at });
      const most = listWord?.[2] === 'holds' ? HOLDS_BYTES : VOICE_BYTES;
      if (!text(word, most)) return no('VALUE_MALFORMED', `${at} is ${most === VOICE_BYTES ? 'a word or a few' : 'a line'}, of at most ${most} bytes.`, { at });
      labels[key] = word;
    }
  }
  if (Object.keys(voice).length + Object.keys(labels).length > SETTINGS_CEILING - HELD_SETTINGS)
    return no('VALUE_MALFORMED', `A use case's voice and labels are its pack's settings, and a pack has at most ${SETTINGS_CEILING}.`, { at: 'labels' });

  const nav = doc.nav ?? [];
  if (!Array.isArray(nav) || nav.length > NAV_CEILING || nav.some((a) => typeof a !== 'string' || !NAV_ADDRESS.test(a)))
    return no('VALUE_MALFORMED', `nav is up to ${NAV_CEILING} addresses of pages and lists, such as /p/studies and /r/courses.`, { at: 'nav' });
  if (new Set(nav).size !== nav.length) return no('VALUE_MALFORMED', 'An address is listed twice in nav.', { at: 'nav' });

  let pack: Record<string, unknown> | null = null;
  if (doc.pack !== undefined && doc.pack !== null) {
    if (!isObject(doc.pack)) return malformed('The pack a use case carries is a pack document.', 'pack');
    if (doc.pack.pack !== packIdOf(id)) return malformed(`The pack ${id} carries is called ${packIdOf(id)}, so it is found again as this use case's.`, 'pack.pack');
    if (doc.pack.config !== undefined) return malformed(`${packIdOf(id)}'s settings are its voice, and the use case writes them.`, 'pack.config');
    pack = doc.pack;
  }
  if (pack === null && Object.keys(voice).length > 0)
    return malformed('A voice is kept as the settings of the pack a use case carries, so a use case with a voice carries a pack.', 'voice');
  if (pack === null && Object.keys(labels).length > 0)
    return malformed('Labels are kept as the settings of the pack a use case carries, so a use case with labels carries a pack.', 'labels');

  const links = doc.links ?? [];
  if (!Array.isArray(links) || links.length > LINKS_CEILING)
    return no('VALUE_MALFORMED', `links is a list of up to ${LINKS_CEILING} links between example rows.`, { at: 'links' });
  for (const [i, link] of links.entries()) {
    const at = `links[${i}]`;
    if (!isObject(link)) return malformed('A link says register, title, field, to and target.', at);
    const stray = Object.keys(link).find((k) => !LINK_KEYS.includes(k));
    if (stray !== undefined) return no('FIELD_UNKNOWN', `A link has no ${stray}. It says ${LINK_KEYS.join(', ')}.`, { at: `${at}.${stray}`, allowed: LINK_KEYS });
    for (const key of ['register', 'field', 'to'] as const)
      if (typeof link[key] !== 'string' || !LINK_NAME.test(link[key]))
        return no('VALUE_MALFORMED', `${at}.${key} is the id of a ${key === 'field' ? 'field' : 'list'}, such as ${key === 'field' ? 'course' : 'courses'}.`, { at: `${at}.${key}` });
    for (const key of ['title', 'target'] as const)
      if (!text(link[key], LINK_TITLE_BYTES))
        return no('VALUE_MALFORMED', `${at}.${key} is the title of an example row, a line of at most ${LINK_TITLE_BYTES} bytes.`, { at: `${at}.${key}` });
    /* A FIELD THAT HOLDS A LIST OF REFS says so, and only that way: the linker writes a list of one where it is set. */
    if (link.list !== undefined && link.list !== true) return no('VALUE_MALFORMED', `${at}.list is true where the field holds a list of refs, and is left out otherwise.`, { at: `${at}.list` });
  }

  const skills = doc.skills ?? [];
  if (!Array.isArray(skills) || skills.some((s) => !isObject(s) || typeof s.name !== 'string' || !SKILL.test(s.name) || !text(s.trigger, 400)))
    return no('VALUE_MALFORMED', 'A skill is a name in lower case with hyphens and the moment to reach for it.', { at: 'skills' });

  return ok({
    usecase: id,
    version: doc.version,
    title: doc.title as string,
    summary: doc.summary as string,
    author: doc.author as string,
    license: doc.license as string,
    audience: doc.audience as Audience,
    tone: doc.tone as string,
    signals: [...(signals as string[])],
    modules: [...(modules as string[])],
    voice,
    labels,
    pack,
    skills: (skills as { name: string; trigger: string }[]).map((s) => ({ name: s.name, trigger: s.trigger })),
    nav: [...(nav as string[])],
    links: (links as ExampleLink[]).map((l) => ({ register: l.register, title: l.title, field: l.field, to: l.to, target: l.target, ...(l.list ? { list: true as const } : {}) })),
  });
}

/**
 * The pack document to plan and install for a use case, with its voice as settings, or `null` when it
 * carries none. The pack's version is the use case's, so a new voice is a new version.
 */
export function useCasePack(u: UseCase): Record<string, unknown> | null {
  if (u.pack === null) return null;
  const config: Record<string, { type: 'text'; label: string; default: string }> = {};
  for (const key of VOICE_KEYS) {
    const line = u.voice[key];
    if (line !== undefined) config[voiceSetting(key)] = { type: 'text', label: VOICE_TITLES[key], default: line };
  }
  for (const [key, word] of Object.entries(u.labels))
    config[labelSetting(key)] = { type: 'text', label: labelTitle(key), default: word };
  const settings: Record<string, { type: 'text' | 'bool'; label: string; default?: string }> = {
    ...config,
    [SHARED_VERSION]: { type: 'text', label: 'Last shared as' },
    [SPEAKS]: { type: 'bool', label: 'Speaks for this BrainDog' },
  };
  return {
    ...u.pack,
    pack: packIdOf(u.usecase),
    version: u.version,
    ...(u.pack.summary === undefined ? { summary: u.summary } : {}),
    ...(u.pack.author === undefined ? { author: u.author } : {}),
    ...(u.pack.license === undefined ? { license: u.license } : {}),
    config: settings,
  };
}

/**
 * What each voice setting is called at `/packs/<id>`: what the line does, not the key it is stored under. It read
 * "Voice: home" and "Voice: nothing needs you", which are the schema's spelling of a box holding the word "Overview".
 */
const VOICE_TITLES: Readonly<Record<VoiceKey, string>> = {
  home: 'What Home is called',
  decide: 'What Decide is called',
  inbox: 'What the Inbox is called',
  lists: 'What the lists are called together',
  right_now: 'The heading over what is happening now',
  needs_you: 'The heading over what needs you',
  nothing_needs_you: 'The line when nothing needs you',
  working_now: 'The heading over who is working now',
  coming_up: 'The heading over what falls due soon',
  overdue: 'The heading over what is late',
  since_away: 'The heading over what changed while you were away',
  nothing_new: 'The line when nothing has changed',
  nothing_now: 'The line on Home when nothing needs you',
  fills_with: 'The line on Home saying what fills it',
  nothing_waiting: 'The line when no question waits on you',
  nothing_due: 'The line when nothing falls due soon',
  record_empty: 'The line when the record holds nothing yet',
  start_here: 'The button that starts an empty record',
  no_questions: 'The line when Decide is empty',
  inbox_clear: 'The line when the Inbox is empty',
  new_row: 'The word on the button that adds one to a list',
  add_row: 'The word on the button that saves a new one',
  add_first: 'The button on a list with nothing in it',
  pen_nothing: 'The heading when there is nothing to suggest',
  pen_waits: 'The line saying where suggestions wait',
};

/** What a label's setting is called at `/packs/<id>`: "Label: people, role", "Label: one of tickets", "Label: what tickets holds". */
function labelTitle(key: string): string {
  const word = LIST_WORD_KEY.exec(key);
  const spaced = (s: string): string => s.replace(/_/g, ' ');
  if (word) return word[2] === 'one' ? `Label: one of ${spaced(word[1] ?? '')}` : `Label: what ${spaced(word[1] ?? '')} holds`;
  return `Label: ${key.split('.').map(spaced).join(', ')}`;
}

/** The voice held in a use-case pack's settings: each `voice_<key>` value that is a non-empty line. */
export function voiceOf(values: Readonly<Record<string, unknown>>): Partial<Record<VoiceKey, string>> {
  const out: Partial<Record<VoiceKey, string>> = {};
  for (const key of VOICE_KEYS) {
    const line = values[voiceSetting(key)];
    if (typeof line === 'string' && line.trim() !== '') out[key] = line;
  }
  return out;
}

/**
 * The labels held in a use-case pack's settings, by label key: each `label_<list>[__<field>[__<value>]]`, `one_<list>`
 * and `holds_<list>` whose value is a non-empty line. The display reads a list's, a field's or a value's word from here and
 * falls back to the declaration's own. A long label's `lk_<hash>` is read back through `config`, the pack's declared
 * settings, whose title says the key; without them it is left out.
 */
export function labelsOf(values: Readonly<Record<string, unknown>>, config: Readonly<Record<string, { label?: unknown } | undefined>> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [setting, word] of Object.entries(values)) {
    if (typeof word !== 'string' || word.trim() === '') continue;
    if (HASHED.test(setting)) {
      const key = labelKeyOf(setting, config[setting]?.label);
      if (key !== null) out[key] = word;
      continue;
    }
    const listWord = LIST_WORDS.find((w) => setting.startsWith(`${w}_`));
    if (listWord) {
      const key = `${setting.slice(listWord.length + 1)}:${listWord}`;
      if (LIST_WORD_KEY.test(key)) out[key] = word;
      continue;
    }
    if (!setting.startsWith(LABEL_PREFIX)) continue;
    const key = setting.slice(LABEL_PREFIX.length).split('__').join('.');
    if (LABEL_KEY.test(key)) out[key] = word;
  }
  return out;
}
