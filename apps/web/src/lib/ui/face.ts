/**
 * What a writer's face shows: the letter in a disc, what kind of face to draw for a name, and a person's hue.
 *
 * PLAIN `.ts` BESIDE `Face.svelte`, so `node --test` can read what the component decides without mounting it.
 */

import { RULE_NAMES } from '@braindog/seed/usecases/names';

import { AGENT_NAMES, nameWords, saidKind, type ActorKind } from '../record/names.ts';
import type { AgentKind } from './agent-glyphs.ts';
import { HUES, hueFor } from './hue.ts';

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

/* THE HUE IS `hue.ts`'s, so the rail can draw one without the names above. */
export { hueFor };

/* ── the category slots ─────────────────────────────────────────────────── */

/**
 * The eight category slots (the UI pass of 20 October, 1.3): a project, a person, an agent with no maker's colour, a
 * chart series that is one of those. Each is two tokens, `--cat-<slot>` (the strong colour: a glyph, a letter, a dot)
 * and `--cat-<slot>-tint` (the soft fill: a well, a disc), solved to clear 4.5:1 on the tile and on each other in light
 * and in dark. No slot is red or orange, so nothing in a category reads as late or as the accent.
 */
export type Slot = 'blue' | 'violet' | 'pink' | 'teal' | 'sky' | 'yellow' | 'lime' | 'slate';

/**
 * Where each slot sits on the OKLCH wheel, measured from its light colour. `slate` is not on it: it is the neutral, the
 * slot of a thing with no hue at all (a retired project, "other" in a chart).
 */
export const SLOT_HUES: Readonly<Record<Exclude<Slot, 'slate'>, number>> = {
  blue: 265,
  violet: 287,
  pink: 352,
  teal: 185,
  sky: 233,
  yellow: 90,
  lime: 133,
};

/**
 * A stored hue as its slot: the slot nearest round the wheel, ties to the earlier slot in `SLOT_HUES`. The continuous
 * `oklch(--mark-l --mark-c hue)` a project used to wear is gone from cards, wells and dots; its hue only picks the slot.
 * No hue is `slate`.
 */
export function slotOf(hue: number | null | undefined): Slot {
  if (hue === null || hue === undefined || !Number.isFinite(hue)) return 'slate';
  const h = ((hue % 360) + 360) % 360;
  let best: Slot = 'blue';
  let far = Infinity;
  for (const [slot, at] of Object.entries(SLOT_HUES) as [Exclude<Slot, 'slate'>, number][]) {
    const d = Math.abs(h - at);
    const round = Math.min(d, 360 - d);
    if (round < far) {
      far = round;
      best = slot;
    }
  }
  return best;
}

/* ── an agent's run ─────────────────────────────────────────────────────────── */

/* THE KINDS AND THEIR GLYPHS ARE `agent-glyphs.ts`'s, so the rail's mark draws without the names above. */
export { AGENT_GLYPHS, type AgentKind } from './agent-glyphs.ts';

/** Where a run is: working, gone quiet while still open, or stopped. The ring says which. */
export type RunLive = 'working' | 'quiet' | 'stopped';


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
 * Where a run is, from its `state` and whether it has gone quiet (`isQuiet` in `@braindog/kernel`, which the caller
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
