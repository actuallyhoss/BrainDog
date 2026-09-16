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
 * THE KEYS ARE CLOSED. A voice key is a slot the display promises to read, so a use case cannot put a
 * sentence anywhere on screen; it can only replace one the house voice already says.
 *
 * Refusals use codes the registry already holds: `PACK_MALFORMED` for the shape, `FIELD_UNKNOWN` for a key
 * the format does not have, `VALUE_MALFORMED` for a value of the wrong kind.
 */

import type { Result } from '@braindog/ports';
import { no, ok } from '@braindog/ports';

/** The lines a voice may replace, in the order the display meets them. */
export const VOICE_KEYS = ['home', 'decide', 'inbox', 'lists', 'right_now', 'needs_you', 'nothing_needs_you', 'since_away', 'nothing_new'] as const;
export type VoiceKey = (typeof VOICE_KEYS)[number];

/** Who a use case is for. Said on the proposal and used to group a catalogue. */
export const AUDIENCES = ['individual', 'founder', 'team', 'starter', 'other'] as const;
export type Audience = (typeof AUDIENCES)[number];

/** The first-party packs a use case may name as modules. The seed's test holds this to its own list. */
export const MODULES = ['portfolio', 'people', 'money-core', 'estate', 'work', 'agents'] as const;

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
  /** The pack document the use case carries, or `null` for one that only arranges first-party modules. */
  pack: Record<string, unknown> | null;
  /** What an agent should know here. Offered to the agents pack as proposals, never installed directly. */
  skills: { name: string; trigger: string }[];
};

const KEYS = ['usecase', 'version', 'title', 'summary', 'author', 'license', 'audience', 'tone', 'signals', 'modules', 'voice', 'pack', 'skills'];
const ID = /^[a-z][a-z0-9-]{1,40}$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?$/;
const SIGNAL = /^[a-z0-9][a-z0-9 '-]{0,39}$/;
const SKILL = /^[a-z][a-z0-9-]{1,63}$/;
const VOICE_BYTES = 80;
const SIGNALS_CEILING = 64;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const bytes = (s: string): number => new TextEncoder().encode(s).length;
const malformed = <T>(fix: string, at: string): Result<T> => no<T>('PACK_MALFORMED', fix, { at });
const text = (v: unknown, most: number): v is string => typeof v === 'string' && v.trim() !== '' && bytes(v) <= most;

/** The pack id a use case carries. */
export const packIdOf = (usecase: string): string => `usecase-${usecase}`;

/** The setting a voice line is stored under. */
export const voiceSetting = (key: VoiceKey): string => `voice_${key}`;

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

  if (typeof doc.audience !== 'string' || !(AUDIENCES as readonly string[]).includes(doc.audience))
    return no('VALUE_MALFORMED', `${String(doc.audience)} is not an audience. A use case is for one of ${AUDIENCES.join(', ')}.`, { at: 'audience', allowed: [...AUDIENCES] });

  const signals = doc.signals ?? [];
  if (!Array.isArray(signals) || signals.length > SIGNALS_CEILING || signals.some((s) => typeof s !== 'string' || !SIGNAL.test(s)))
    return no('VALUE_MALFORMED', `Signals are up to ${SIGNALS_CEILING} lower-case words or short phrases.`, { at: 'signals' });
  if (new Set(signals).size !== signals.length) return no('VALUE_MALFORMED', 'A signal is listed twice.', { at: 'signals' });

  const modules = doc.modules ?? [];
  if (!Array.isArray(modules) || modules.some((m) => typeof m !== 'string' || !(MODULES as readonly string[]).includes(m)))
    return no('VALUE_MALFORMED', `Modules are first-party packs: ${MODULES.join(', ')}.`, { at: 'modules', allowed: [...MODULES] });

  const voice: Partial<Record<VoiceKey, string>> = {};
  if (doc.voice !== undefined) {
    if (!isObject(doc.voice)) return malformed('A voice is a line per key.', 'voice');
    for (const [key, line] of Object.entries(doc.voice)) {
      if (!(VOICE_KEYS as readonly string[]).includes(key))
        return no('FIELD_UNKNOWN', `A voice has no ${key}. It may replace ${VOICE_KEYS.join(', ')}.`, { at: `voice.${key}`, allowed: [...VOICE_KEYS] });
      if (!text(line, VOICE_BYTES)) return no('VALUE_MALFORMED', `voice.${key} is a line of text of at most ${VOICE_BYTES} bytes.`, { at: `voice.${key}` });
      voice[key as VoiceKey] = line;
    }
  }

  let pack: Record<string, unknown> | null = null;
  if (doc.pack !== undefined && doc.pack !== null) {
    if (!isObject(doc.pack)) return malformed('The pack a use case carries is a pack document.', 'pack');
    if (doc.pack.pack !== packIdOf(id)) return malformed(`The pack ${id} carries is called ${packIdOf(id)}, so it is found again as this use case's.`, 'pack.pack');
    if (doc.pack.config !== undefined) return malformed(`${packIdOf(id)}'s settings are its voice, and the use case writes them.`, 'pack.config');
    pack = doc.pack;
  }
  if (pack === null && Object.keys(voice).length > 0)
    return malformed('A voice is kept as the settings of the pack a use case carries, so a use case with a voice carries a pack.', 'voice');

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
    pack,
    skills: (skills as { name: string; trigger: string }[]).map((s) => ({ name: s.name, trigger: s.trigger })),
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
    if (line !== undefined) config[voiceSetting(key)] = { type: 'text', label: `Voice: ${key.replace(/_/g, ' ')}`, default: line };
  }
  return {
    ...u.pack,
    pack: packIdOf(u.usecase),
    version: u.version,
    ...(u.pack.summary === undefined ? { summary: u.summary } : {}),
    ...(u.pack.author === undefined ? { author: u.author } : {}),
    ...(u.pack.license === undefined ? { license: u.license } : {}),
    ...(Object.keys(config).length > 0 ? { config } : {}),
  };
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
