/**
 * What a writer's face shows: the letter in a disc, what kind of face to draw for a name, and a person's hue.
 *
 * PLAIN `.ts` BESIDE `Face.svelte`, so `node --test` can read what the component decides without mounting it.
 */

import { RULE_NAMES } from '@braindog/seed/usecases/names';

import { AGENT_NAMES, nameWords, saidKind, type ActorKind } from '../record/names.ts';
import type { IconName } from './icons.ts';

/**
 * The letter in a writer's disc.
 *
 * A LEADING ARTICLE IS NOT THE NAME. A first-letter rule gave "the assistant" and "the record itself" the same "T", which
 * is two different writers wearing one face, so an article is passed over. An email is a person nobody has named yet,
 * so the part before the @ stands in for the name.
 */
export const initialOf = (name: string): string => {
  const bare = name.trim().replace(/^the\s+/i, '');
  const first = [...(bare.split('@')[0] ?? '')][0];
  /* A disc with nothing in it reads as a rendering fault, so an empty name still draws a mark. */
  return first ? first.toUpperCase() : '?';
};

/**
 * A project's or a record's initials, for its rounded square ("Faces are a rounded square with the project's
 * initials").
 *
 * TWO LETTERS AT MOST, the first of the first two words, so "Marlow & Co" is "MC" and "Portage" is "P". A word that is
 * not a word (an ampersand, a dash) is passed over, and a leading article is not the name, as it is not for a person.
 */
export const initialsOf = (name: string): string => {
  const words = name
    .trim()
    .replace(/^the\s+/i, '')
    .split(/\s+/u)
    .filter((w) => /[\p{L}\p{N}]/u.test(w));
  const letters = words.slice(0, 2).map((w) => [...w].find((ch) => /[\p{L}\p{N}]/u.test(ch)) ?? '');
  const said = letters.join('').toUpperCase();
  return said === '' ? '?' : said;
};

/** The names `names.ts` gives an agent, so a face handed only a name still knows one. */
const AGENT_SAID = new Set<string>([...Object.values(AGENT_NAMES), nameWords.agent]);

/** The names the product gives its own rules, so a face handed only a name still draws the automations glyph for one. */
const RULE_SAID = new Set<string>(Object.values(RULE_NAMES));

/**
 * The kind of face to draw for a name, where the caller did not say.
 *
 * `Face` TAKES `kind` FROM `actor()` AND THIS IS ONLY ITS FALLBACK, for a caller that still hands over a name alone. It
 * knows the words `names.ts` says for an actor that is not a person: first the ones `actor` has said on this tab
 * (`saidKind`), which is how a rule the product does not ship, "Reply", still draws as a rule, then Slash, BrainDog, An
 * automation, the agents and the first-party rules, which are known before anything has been said. It guesses nothing
 * from the shape of a name, because that would draw a person whose name happens to end in "rule" as an automation.
 * Anything it does not know is a person.
 */
export const faceKindOf = (name: string): ActorKind => {
  const said = name.trim();
  const kept = saidKind(said);
  if (kept !== undefined) return kept;
  if (said === nameWords.slash) return 'slash';
  if (said === nameWords.brainDog) return 'system';
  if (said === nameWords.automation) return 'automation';
  if (AGENT_SAID.has(said)) return 'agent';
  if (RULE_SAID.has(said)) return 'rule';
  return 'person';
};

/** How many hues a person's face is drawn from, thirty degrees apart round the wheel. */
const HUES = 12;

/**
 * A person's hue, from something that stays the same for them (their id where the caller has it, else their name).
 *
 * TWELVE STEPS, NOT 360. Two hues a few degrees apart read as the same colour, so a face that should tell two people
 * apart would not; twelve steps at the theme's mark lightness and chroma are each their own colour, and past twelve
 * people the name beside the face is what carries who it is anyway. The hash is FNV-1a over the code points, so the
 * same person is the same hue on every screen and every visit.
 */
export const hueFor = (key: string): number => {
  let hash = 0x811c9dc5;
  for (const ch of key) {
    hash ^= ch.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash % HUES) * (360 / HUES);
};

/* ── an agent's run ─────────────────────────────────────────────────────────── */

/** The kinds of agent a run face tells apart: each named one by its maker's mark (`agent-marks.ts`), the rest by a glyph. */
export type AgentKind = 'claude' | 'codex' | 'cursor' | 'gemini' | 'copilot' | 'windsurf' | 'slash' | 'runner' | 'other';

/** Where a run is: working, gone quiet while still open, or stopped. The ring says which. */
export type RunLive = 'working' | 'quiet' | 'stopped';

/**
 * The glyph each kind of agent falls back to, from the app's own set, where there is no mark to draw.
 *
 * A NAMED AGENT WEARS ITS MAKER'S MARK NOW, not this. An earlier rule said "a glyph and never a vendor logo"; the
 * owner overruled it and asked for the real logos, so `AgentMark`
 * draws Claude, Codex, Cursor, Gemini, Copilot and Windsurf as their makers do, and these glyphs are what a runner and
 * an agent nobody names wear, and what a surface too small for a mark falls back to. Slash is not here, because it
 * wears its own mark, the slash `Face` draws.
 */
export const AGENT_GLYPHS = {
  claude: 'bot',
  codex: 'code',
  cursor: 'keyboard',
  gemini: 'bot',
  copilot: 'code',
  windsurf: 'code',
  runner: 'play',
  other: 'session',
} as const satisfies Record<Exclude<AgentKind, 'slash'>, IconName>;

/** The kinds a word can name outright, as an id or a name. */
const KNOWN = ['claude', 'codex', 'cursor', 'gemini', 'copilot', 'windsurf'] as const satisfies readonly AgentKind[];

/** The other words the same agents sign with: a tool's name, its command, its maker. */
const ALIASES: Readonly<Record<string, AgentKind>> = {
  'claude-code': 'claude',
  'claude code': 'claude',
  anthropic: 'claude',
  'codex-cli': 'codex',
  openai: 'codex',
  'gemini-cli': 'gemini',
  'github-copilot': 'copilot',
  'github copilot': 'copilot',
};

/** An agent's kind from its display name, back through `AGENT_NAMES`, so a face handed "Claude" knows it is claude. */
const AGENT_BY_NAME = new Map<string, string>(Object.entries(AGENT_NAMES).map(([id, said]) => [said.toLowerCase(), id]));

/**
 * The kind of agent a word names: its id (`claude`), its signature (`agent:claude`, `runner:<id>`), or the name
 * `names.ts` says for it (`Claude`). Anything else, a run's number included, is `other`.
 */
export const agentKindOf = (agent: string | null | undefined): AgentKind => {
  const said = (agent ?? '').trim().toLowerCase();
  if (said === '') return 'other';
  if (said === 'slash' || said === nameWords.slash.toLowerCase()) return 'slash';
  if (said === 'runner' || said.startsWith('runner:')) return 'runner';
  const bare = said.replace(/^agent:/u, '');
  const id = AGENT_BY_NAME.get(bare) ?? ALIASES[bare] ?? bare;
  return (KNOWN as readonly string[]).includes(id) ? (id as AgentKind) : 'other';
};

/** A run as a writer signs with it: `S` and its number (`30 §3`). */
const RUN = /^S([1-9][0-9]*)$/u;

/**
 * The run a signature names, as `S42`, or null when it names none.
 *
 * AN AGENT SIGNS A WRITE WITH ITS RUN when the write came through a session (`packages/record/src/slash.ts` `isAgent`
 * reads the same shape), so this is how a log line knows which run to draw and to link. `agent:claude` names the kind
 * and no run, so it is null here and the face is drawn without a ring or a door.
 */
export const runOf = (by: string | null | undefined): string | null => {
  const said = (by ?? '').trim();
  return RUN.test(said) ? said : null;
};

/** A run's number, from `S42` or a bare `42`, or null for anything that is not one. */
export const runSeq = (run: string): number | null => {
  const m = /^S?([1-9][0-9]*)$/u.exec(run.trim());
  return m?.[1] ? Number(m[1]) : null;
};

/**
 * A run's hue: its number in twelve steps of thirty degrees round the wheel, drawn at the theme's mark lightness and
 * chroma as every identity hue is.
 *
 * FROM THE RUN, NOT THE AGENT, so two Claude runs at once wear two colours: the glyph says what kind of worker it is,
 * and the ring says which one. Consecutive runs land thirty degrees apart, which is as far apart as two hues on this
 * wheel get, and the twelfth run after this one wears the same colour, by when the first has long stopped.
 */
export const runHue = (seq: number): number => (((seq % HUES) + HUES) % HUES) * (360 / HUES);

/**
 * Where a run is, from its `state` and whether it has gone quiet (`isStale` in `@braindog/kernel`, which the caller
 * asks against the record's clock).
 *
 * ONLY AN ACTIVE RUN HAS A RING. An idle run, a handoff waiting for a pickup and a finished one have all stopped
 * working, and a ring on any of them would say somebody is at it.
 */
export const liveOf = (state: unknown, quiet: boolean): RunLive => (state === 'active' ? (quiet ? 'quiet' : 'working') : 'stopped');

/** The words a run face and a run's handoff say. The face's own name is for a screen reader, which the ring is not. */
export const faceWords = {
  openRun: 'Open this run',
  live: { working: 'Working now', quiet: 'Gone quiet', stopped: 'Stopped' } satisfies Record<RunLive, string>,
  handoff: 'Handoff',
  doing: 'Doing',
  project: 'Project',
  next: 'Next step',
  tried: 'Already tried',
  notes: 'Notes',
  nothingYet: 'This run has not said what it is doing yet.',
};
