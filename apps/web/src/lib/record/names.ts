/**
 * What a person reads where the record holds an id: a list's name, a declaration's title, and who did something.
 *
 * A SCREEN NEVER PRINTS AN ID, A SLUG OR A LIST ID. The record signs a write `p_01M2PAZ…`, `rule:cash-stale`,
 * `agent:claude`, `S42` or `system` (`30 §3`), keeps a list as `obligations` and a rule as `invoice-late`, and every one of
 * those reached a screen at some point: `P_seed` under Added, "rule:cash-stale" down History, "When a row in things" on an
 * automation, a "#" column opening every list (design.md SYS-3). Each surface had grown its own small rule for turning
 * one into words, and each rule covered the shapes its own screen had seen. This file is the one rule, so a new screen
 * asks here instead of writing another.
 *
 * NO READING OF ITS OWN. It words what a caller already holds: the declarations `held.ts` has learnt from the record,
 * and the names of the people a caller was handed (`boot.names`). A person the caller has no name for is Someone on
 * this record, never their id, because inventing a name is worse than admitting the record does not know one.
 */

import { RULE_NAMES } from '@braindog/seed/usecases/names';

import { copy } from '../copy.ts';
import { REGISTERS } from './held.ts';

/**
 * What kind of actor signed a write, which is what `Face` draws: a person and you as a monogram, an automation or a rule
 * as the automations glyph, Slash as its mark, BrainDog (the record's own work, and the sample's) as the mark in ink, and
 * an agent as its own face once the agents area draws one.
 */
export type ActorKind = 'you' | 'person' | 'agent' | 'automation' | 'rule' | 'slash' | 'system' | 'sample';

/** An actor as a person reads it: a name to print and the kind of thing that name belongs to. */
export type Actor = { name: string; kind: ActorKind };

/**
 * THE WORDS THIS FILE SAYS ITSELF, kept here rather than in the copy aggregate because they are names, not sentences:
 * Slash and BrainDog are what the product is called, and the rest are what an actor without a name of its own is said as.
 * `number` is the heading of the row's number, which a list shows only when somebody asks for it.
 */
export const nameWords = {
  slash: 'Slash',
  brainDog: 'BrainDog',
  agent: 'An agent',
  automation: 'An automation',
  number: 'Number',
} as const;

/**
 * THE AGENTS A PERSON KNOWS BY A PROPER NAME. A token is named at creation (`agent:claude`) and the sample signs with the
 * bare word; either way a person reads the product's own spelling, "Claude" and not "claude". An agent missing from here
 * is its name in words, which is still a name.
 */
export const AGENT_NAMES: Readonly<Record<string, string>> = {
  claude: 'Claude',
  codex: 'Codex',
  cursor: 'Cursor',
  gemini: 'Gemini',
  copilot: 'Copilot',
  windsurf: 'Windsurf',
};

/** The person the seed signs its own rows with (`packages/seed/src/index.ts`, `installSeed`): the sample, not somebody. */
const SEED = 'p_seed';

/** A ULID anywhere in a string: never part of a name, always a row, a person or a declaration somebody forgot to word. */
const ULID = /[0-9A-HJKMNP-TV-Z]{26}/u;

/**
 * An id in words: "cash-stale" is "Cash stale", "money_core" is "Money core", "rule:late-reply" is "Late reply".
 *
 * ONLY THE PART AFTER THE LAST COLON, because what comes before one is always a mechanism (`rule:`, `ingest:`,
 * `pack:`) and never a word anybody chose. The first letter is raised and the rest kept as written, so an id that
 * already carries a capital ("SMS") keeps it.
 */
export function humanize(id: string): string {
  const tail = id.slice(id.lastIndexOf(':') + 1);
  const words = tail
    .replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
    .replace(/[-_.\s]+/gu, ' ')
    .trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * What a list is called, by its id: the name its declaration gives, else its id in words.
 *
 * `Object.hasOwn`, NOT A BARE INDEX, because a list id is text a pack or a person chose, and `constructor` would
 * otherwise be found on the prototype and read as a declaration.
 */
export function listName(id: string): string {
  const declared = Object.hasOwn(REGISTERS, id) ? REGISTERS[id]?.name : undefined;
  return declared !== undefined && declared.trim() !== '' ? declared : humanize(id);
}

/**
 * What a declaration is called: its declared title or name, a first-party rule's name, else its id in words.
 *
 * A RULE DECLARES NO NAME, so the ones the product ships are named in `RULE_NAMES` (`@braindog/seed/usecases/names`),
 * and History, the automations list and a plan all read that one table rather than three spellings of `invoice-late`.
 */
export function titleOf(decl: { id: string; kind?: string | undefined; title?: string | null | undefined; name?: string | null | undefined }): string {
  const title = decl.title?.trim();
  if (title) return title;
  const name = decl.name?.trim();
  if (name) return name;
  if (decl.kind === 'rule') return shipped(decl.id) ?? humanize(decl.id);
  return humanize(decl.id);
}

/**
 * A first-party rule's name, with or without `rule.` or `rule:` in front, or `undefined` for one the product does not ship.
 *
 * `Object.hasOwn`, NOT `ruleName`'S BARE INDEX, because a rule id is text a pack or a person chose, and `rule:constructor`
 * would otherwise be said as the function every object keeps under that key.
 */
function shipped(id: string): string | undefined {
  const bare = id.replace(/^rule[.:]/u, '');
  return Object.hasOwn(RULE_NAMES, bare) ? RULE_NAMES[bare] : undefined;
}

/** An agent's name: the product's spelling for one a person knows, else the name it was given in words. */
const agentName = (id: string): string => (Object.hasOwn(AGENT_NAMES, id) ? (AGENT_NAMES[id] ?? humanize(id)) : humanize(id));

/**
 * THE WORDS `actor` HAS SAID FOR SOMETHING THAT IS NOT A PERSON, on this tab, and the kind each belonged to.
 *
 * A face handed a name alone cannot tell "Reply", a rule the sample signs `rule.reply`, from a person called Reply, and
 * the name-only fallback drew every rule the product does not ship as a monogram on a hue. The caller that has the name
 * made it here a moment before, so the kind is kept beside the words and `saidKind` answers from it. A person is never
 * kept: a name that is not in here is a person's, which is what the fallback assumed before.
 *
 * THE APP RENDERS ONLY IN THE BROWSER (`routes/+layout.ts`, `ssr = false`), so this is one reader's tab and never a
 * table shared between two people's records on a server.
 */
const SAID = new Map<string, ActorKind>();

/**
 * HOW MANY SUCH WORDS ONE TAB KEEPS. There is one per rule, automation and agent the tab has drawn, so this bounds only a
 * tab left open for a long time; past it a new name is still said, and only its face falls back to a monogram.
 */
const SAID_CAP = 1000;

/** An actor as `actor` answers it, with its words kept for `saidKind` when it is not a person. */
const said = (name: string, kind: ActorKind): Actor => {
  if (kind !== 'person' && kind !== 'you' && (SAID.has(name) || SAID.size < SAID_CAP)) SAID.set(name, kind);
  return { name, kind };
};

/**
 * The kind of actor `actor` last said these words for, or `undefined` when it has said them for no automation, rule,
 * agent, Slash or BrainDog on this tab. `Face` reads it for a caller that hands over a name and no `kind`.
 */
export const saidKind = (name: string): ActorKind | undefined => SAID.get(name.trim());

/**
 * WHO DID IT, AS A PERSON READS IT, from the `actor` a write was signed with (`30 §3`).
 *
 * The reader is You, whichever spelling the ledger used (their own id on a live record, `you` in the sample). A person
 * the caller holds a name for is that name; any other person is Someone on this record. Slash is Slash, and `system`
 * and the seed are BrainDog, because a person asking who backed up their record is answered by the product's name and
 * not by a principal. A rule is its name (`rule:` on the record, `rule.` in the sample); any other mechanism
 * (`ingest:`, `runner:`) is an automation, named by its id in words, or An automation where that id is a ULID. An agent
 * is its proper name, and a run (`S42`) whose agent the caller does not hold is An agent, until the agents area draws a
 * run by its own face.
 *
 * A STRING IN NONE OF THOSE SHAPES IS ALREADY A NAME. Home's feed hands over the name the record gave a person, and
 * that is kept as it was written ("de Vries" stays lower case). Anything left that still looks like an id, with an
 * underscore, a colon or a ULID in it, is Someone on this record rather than itself.
 */
export function actor(by: string, me: string | null = null, names: ReadonlyMap<string, string> = new Map()): Actor {
  const who = by.trim();
  if (who === 'you' || (me !== null && me !== '' && who === me)) return { name: copy.feedYou, kind: 'you' };
  const named = names.get(who);
  if (named !== undefined && named.trim() !== '') return { name: named, kind: 'person' };
  if (who === 'slash') return said(nameWords.slash, 'slash');
  if (who === 'system') return said(nameWords.brainDog, 'system');
  if (who === SEED) return said(nameWords.brainDog, 'sample');
  const rule = /^rule[.:](.+)$/u.exec(who)?.[1];
  if (rule !== undefined) return said(shipped(rule) ?? humanize(rule), 'rule');
  const agent = /^agent:(.+)$/u.exec(who)?.[1] ?? (Object.hasOwn(AGENT_NAMES, who) ? who : undefined);
  /* AN AGENT NAMED BY AN ID IS STILL AN AGENT, said by its kind's word rather than the ULID it was minted under. */
  if (agent !== undefined) return said(ULID.test(agent) ? nameWords.agent : agentName(agent), 'agent');
  if (/^S\d+$/u.test(who)) return said(nameWords.agent, 'agent');
  const mechanism = /^[a-z][a-z0-9-]*:(.+)$/u.exec(who)?.[1];
  /*
   * A MECHANISM NAMED BY A MINTED ID is an automation all the same, said by its kind's word rather than the ULID.
   * BEFORE THE PERSON CHECK, because `ULID` finds an id anywhere in the string, so `runner:<ULID>` was a person.
   */
  if (mechanism !== undefined) return said(ULID.test(mechanism) ? nameWords.automation : humanize(mechanism), 'automation');
  if (who.startsWith('p_') || ULID.test(who)) return { name: copy.feedSomeone, kind: 'person' };
  if (who === '' || who.includes('_') || who.includes(':')) return { name: copy.feedSomeone, kind: 'person' };
  return { name: who, kind: 'person' };
}
