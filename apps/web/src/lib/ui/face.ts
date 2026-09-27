/**
 * What a writer's face shows: the letter in a disc, what kind of face to draw for a name, and a person's hue.
 *
 * PLAIN `.ts` BESIDE `Face.svelte`, so `node --test` can read what the component decides without mounting it.
 */

import { RULE_NAMES } from '@braindog/seed/usecases/names';

import { AGENT_NAMES, nameWords, saidKind, type ActorKind } from '../record/names.ts';

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
