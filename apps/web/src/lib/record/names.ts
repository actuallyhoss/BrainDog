/**
 * What a person reads where the record holds an id: a list's name, a declaration's title, and who did something.
 *
 * A SCREEN NEVER PRINTS AN ID, A SLUG OR A LIST ID. The record signs a write `p_01M2PAZ…`, `rule:cash-stale`,
 * `agent:claude`, `S42` or `system` (`30 §3`), keeps a list as `obligations` and a rule as `invoice-late`, and every one of
 * those reached a screen at some point: `P_seed` under Added, "rule:cash-stale" down History, "When a row in things" on an
 * automation, a "#" column opening every list. Each surface had grown its own small rule for turning
 * one into words, and each rule covered the shapes its own screen had seen. This file is the one rule, so a new screen
 * asks here instead of writing another.
 *
 * NO READING OF ITS OWN. It words what a caller already holds: the declarations `held.ts` has learnt from the record,
 * and the names of the people a caller was handed (`boot.names`). A person the caller has no name for is Someone on
 * this record, never their id, because inventing a name is worse than admitting the record does not know one.
 */

import { RULE_NAMES, SCRIPT_NAMES } from '@braindog/seed/usecases/names';
import { handleName, timelineTitle } from 'braindog-render';

import { copy } from '../copy/frame.ts';
import { REGISTERS } from './held.ts';
import { labels } from '../voice.ts';
import { mergedFieldOf } from './folk.ts';

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
  helping: 'helping',
  automation: 'An automation',
  number: 'Number',
  /* A RULE FROM HIS OLD NOTES, numbered by the import and never named. */
  importedRule: 'One of your imported rules',
  /* A RUN THAT STOPPED AT THE DAY'S CEILING, and one whose script is paused (`keysSaid`). */
  dayCeiling: (rule: string, script: string, n: number) =>
    `“${rule}” stopped: “${script}” already ran ${n} times today, the most in a day. It runs again tomorrow.`,
  scriptPaused: (rule: string, script: string) => `“${rule}” stopped: “${script}” is paused. Switch it back on in Automations.`,
} as const;

/**
 * THE AGENTS A PERSON KNOWS BY A PROPER NAME. A token is named at creation (`agent:claude`) and the sample signs with the
 * bare word; either way a person reads the product's own spelling, "Claude" and not "claude". An agent missing from here
 * is its name in words, which is still a name.
 */
export const AGENT_NAMES: Readonly<Record<string, string>> = {
  claude: 'Claude',
  chatgpt: 'ChatGPT',
  codex: 'Codex',
  cursor: 'Cursor',
  gemini: 'Gemini',
  copilot: 'Copilot',
  windsurf: 'Windsurf',
};

/** The person the seed signs its own rows with (`packages/seed/src/index.ts`, `installSeed`): the sample, not somebody. */
const SEED = 'p_seed';

/** The rules BrainDog answers for itself with, which a person reads as BrainDog (kernel `OWN_RULES`, less the ladder). */
const OWN_RULE = /^rule[.:](?:handled|additive|update)$/u;

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
 * A SENTENCE THE RECORD WROTE WITH ITS KEYS IN IT, IN WORDS (leftovers 2 Nov, 3): a run that stopped notes why as
 * "rule.payment-matches-again starts script.match_payment at step 1, and rules have started script.match_payment 100
 * times today, the most a day. …", and the bell said it as "Rule.payment-matches-again starts script…". Two shapes the
 * record writes often are said whole; anything else keeps its sentence with each key said by its name, a rule's and a
 * script's as the product names them and a list by its own name. Only for drawing: the record's note is untouched.
 */
export function keysSaid(text: string): string {
  if (!/\b(?:rule|script|register)\.[a-z]/u.test(text)) return text;
  const rule = (id: string): string => shipped(id) ?? humanize(id);
  const script = (id: string): string => (Object.hasOwn(SCRIPT_NAMES, id) ? SCRIPT_NAMES[id]! : humanize(id));
  /* THE DAY'S CEILING: the rule, the script, and the most it may start. */
  const most = /^rule\.([a-z0-9][a-z0-9_-]*) starts script\.([a-z0-9_]+) at step \d+, and rules have started script\.[a-z0-9_]+ (\d+) times today, the most a day\b/u.exec(text);
  if (most) return nameWords.dayCeiling(rule(most[1]!), script(most[2]!), Number(most[3]));
  /* A SCRIPT THAT IS PAUSED. */
  const paused = /^rule\.([a-z0-9][a-z0-9_-]*) starts script\.([a-z0-9_]+) at step \d+, and script\.[a-z0-9_]+ is paused\b/u.exec(text);
  if (paused) return nameWords.scriptPaused(rule(paused[1]!), script(paused[2]!));
  const out = text
    .replace(/\brule\.([a-z0-9][a-z0-9_-]*)(?:'s)?/gu, (all, id: string) => `“${rule(id)}”${all.endsWith("'s") ? "'s" : ''}`)
    .replace(/\bscript\.([a-z0-9_]+)/gu, (_, id: string) => `“${script(id)}”`)
    .replace(/\bregister\.([a-z][a-z0-9_-]*)/gu, (_, id: string) => listName(id));
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/** The lists whose rows are named by the handle an agent types them as: a tool (`fenwick`) and a skill (`review-pr`). */
const HANDLED: ReadonlySet<string> = new Set(['tools', 'skills']);

/**
 * A ROW'S NAME AS A PERSON READS IT: a tool or a skill by its name ("Fenwick", "Review PR", "Nordhaven DNS") rather than
 * the handle it is filed under (audit of 31 October, A19), a Ledger line's bank capitals as words (B4: its page was titled
 * "HALDEN TYPE CO INV 2026-035"), and every other row by its title as written. Only for drawing:
 * a field being edited, a search and a merge keep the title as it is stored.
 */
export const rowNameSaid = (register: string, title: string): string =>
  HANDLED.has(register) ? handleName(title) : register === 'transactions' ? timelineTitle(title) || title : title;

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
 * A LIST'S OWN WORD IN A RECEIPT (PK2): the record's label for it where its use case gives one, else the name it was
 * read with, else `listName`. A team's add box said "Added … to Tasks" where the rail says Tickets, because the
 * declaration it was handed had been read before the labels were laid over it.
 */
export function listWord(id: string, declared?: string): string {
  const label = Object.hasOwn(labels(), id) ? labels()[id] : undefined;
  if (label !== undefined && label.trim() !== '') return label;
  return declared !== undefined && declared.trim() !== '' ? declared : listName(id);
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

/**
 * A FILING RULE NAMED BY ITS MATCH, AS A SENTENCE (Q15 of 29 October): a rule his old notes named "Gifts: holds AMAZON"
 * reads "File Amazon under Gifts", and its run "Filed Amazon under Gifts". A bank's capitals are put in a name's case.
 * Any other name is kept as it was written. Only what is shown: the rule keeps its name.
 */
export function ruleNameSaid(name: string, past = false): string {
  const m = /^\s*([^:]{1,60}):\s*(?:holds|contains|has|starts with|starts|is)\s+(.+?)\s*$/iu.exec(name);
  if (!m) return name;
  const what = m[2]!.replace(/^["“']|["”']$/gu, '');
  const cased = /\p{Ll}/u.test(what) ? what : what.toLowerCase().replace(/(^|[\s&/-])(\p{L})/gu, (_, a: string, b: string) => `${a}${b.toUpperCase()}`);
  return `${past ? 'Filed' : 'File'} ${cased} under ${m[1]!.trim()}`;
}

/**
 * A RULE OF HIS OWN WHOSE TITLE THE CALLER DOES NOT HOLD: its id in words, except one numbered by an import ("hb-rule-27"),
 * which is no name at all and is said as what it is.
 */
function ownRule(id: string): string {
  if (/^hb[-_]/iu.test(id) || /(?:^|[-_])rule[-_]?\d+$/iu.test(id)) return nameWords.importedRule;
  return humanize(id);
}

/** An agent's name: the product's spelling for one a person knows, else the name it was given in words. */
const agentName = (id: string): string => (Object.hasOwn(AGENT_NAMES, id) ? (AGENT_NAMES[id] ?? humanize(id)) : humanize(id));

/* ── a run, by the agent it is ──────────────────────────────────────────── */

/**
 * Who a run is, as the record answers it beside a line that run signed (`RunBy` in the kernel's `pages.ts`): the kind
 * of agent (`claude`, or `other` where it said none), the app it ran in as the run holds it (`claude-code`, sometimes
 * with its version after it), and the run it helps. `run` is the handle, read only to tell which run this is about.
 */
export type RunBy = { run?: string | null; agent: string; client: string | null; parent: string | null };

/**
 * THE APPS A RUN SAYS IT RAN IN, as a person names them. The app says more than the kind of agent does, since a person
 * who reads "Claude Code" knows which window did it, so it is read first. One missing from here is its name in words.
 */
export const APP_NAMES: Readonly<Record<string, string>> = {
  'claude-code': 'Claude Code',
  'claude-ai': 'Claude',
  'codex-mcp-client': 'Codex',
  'cursor-vscode': 'Cursor',
};

/** A word an app or an agent may be called by: letters first, then letters, digits, dashes and underscores. */
const WORD = /^[a-z][a-z0-9_-]{0,39}$/iu;

/**
 * What a run's `client` or `agent` says, as a name, or `null` where it says nothing a person could read.
 *
 * ONLY ITS FIRST WORD, because an app sends its version after its name (`claude-code 2.1.4`, `claude-code/2.1.4`).
 * NEVER AN ID, A HANDLE, AN ADDRESS OR A PATH: the text is what an app sent about itself, so one with an `@`, a `#` or
 * a colon in it, a ULID, a run's own handle (`S42`), or anything that does not open with a letter is no name at all.
 * `other` is the record's word for an agent that said no kind, which is nobody in particular.
 */
function runWord(text: unknown, apps: boolean): string | null {
  if (typeof text !== 'string') return null;
  const bare = text.trim().replace(/^agent:/u, '');
  if (/[@#:]/u.test(bare)) return null;
  const word = bare.split(/[\s/]/u)[0] ?? '';
  if (!WORD.test(word) || /^s\d+$/iu.test(word) || ULID.test(word)) return null;
  const key = word.toLowerCase();
  if (key === 'other') return null;
  if (apps && Object.hasOwn(APP_NAMES, key)) return APP_NAMES[key] ?? null;
  return agentName(Object.hasOwn(AGENT_NAMES, key) ? key : word);
}

/**
 * A RUN, AS A PERSON READS IT: the app it ran in ("Claude Code", "Codex", "Cursor"), else the kind of agent it is
 * ("Claude"), and "Claude Code, helping" where it helps another run. Never its handle.
 *
 * `null` OR NOTHING IS An agent, because that is what the record answers for a run it does not hold, and what a caller
 * has before the record answers `run_by` at all. A run that said neither an app nor a kind is An agent too.
 */
export function runByName(by?: RunBy | null): string {
  if (typeof by !== 'object' || by === null) return nameWords.agent;
  const name = runWord(by.client, true) ?? runWord(by.agent, false) ?? nameWords.agent;
  return typeof by.parent === 'string' && by.parent.trim() !== '' ? `${name}, ${nameWords.helping}` : name;
}

/**
 * A `run_by` as it came off the wire, as `actor` may read it, or `null` for anything that is not one. A feed and a row's
 * change are checked only in the keys their screens file them by, so this one is narrowed where it is read.
 */
export function runByIn(v: unknown): RunBy | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const by = v as Record<string, unknown>;
  const said = (t: unknown): string | null => (typeof t === 'string' ? t : null);
  return { run: said(by.run), agent: said(by.agent) ?? '', client: said(by.client), parent: said(by.parent) };
}

/* ── a run or an instruction named inside a note ────────────────────────── */

/**
 * THE WORDS A NOTE SAYS IN PLACE OF A RUN'S OR AN INSTRUCTION'S HANDLE. The record keeps "Taken by S42." on the
 * instruction a run took and on the run whose step it took, and "Stopped by IN4." on a run an instruction stopped.
 */
export const handleWords = {
  tookThis: 'Took this.',
  takenBy: (who: string) => `Taken by ${who}.`,
  anAgent: 'an agent',
  anotherAgent: 'another agent',
  endedBefore: (onward: boolean) => `The agent it was sent to ended before it saw this${onward ? '; it goes to the next one' : ''}.`,
  passedOver: (who: string) => `Passed over: ${who} worked here after this step was left.`,
  replaced: 'Replaced by a newer instruction.',
  byInstruction: (did: string) => `${did} by an instruction.`,
  lifted: 'Lifted by a later instruction.',
} as const;

/** A run's handle, `S42`, alone as a word. */
const RUN_HANDLE = /^S[1-9]\d{0,14}$/u;

/** A run's or an instruction's handle standing alone as a word in a sentence, as `spoken-names.ts` finds one. */
const HANDLE_IN = /(?<![\w#/.-])(?:S|IN)[1-9]\d{0,14}(?![\w#-])/gu;

/**
 * A NOTE AS A PERSON READS IT, with the handles the record wrote into it said in words, at the point it is drawn and
 * never by rewriting what the record keeps (Z1, finish loop of 30 October): Activity read "Taken by S42.".
 *
 * `by` IS WHO SIGNED THE LINE, and `run_by` who that run is where the record says. A run that took a thing signs the
 * note naming itself, so "Taken by S42." signed by S42 is "Took this." under its own name. A handle that is not the
 * line's own is a run or an instruction the caller holds nothing about, so it is said by what it is ("an agent", "an
 * instruction"), and only in the sentences the record writes, so a note that happens to hold "S3" is left as written.
 */
export function handlesSaid(note: string, by: string | null = null, run_by: RunBy | null = null): string {
  if (!/(?:S|IN)[1-9]/u.test(note)) return note;
  const said = note.trim();
  const own = by?.trim() ?? '';
  const self = (handle: string): boolean => RUN_HANDLE.test(handle) && handle === own;
  /* THE LINE'S OWN RUN BY WHAT IT IS, without "helping", since it is said inside a sentence. */
  const named = run_by !== null && (run_by.run ?? own) === own ? (runWord(run_by.client, true) ?? runWord(run_by.agent, false)) : null;
  const taken = /^Taken by (S[1-9]\d*)\.$/u.exec(said);
  if (taken) return self(taken[1]!) ? handleWords.tookThis : handleWords.takenBy(handleWords.anAgent);
  const ended = /^S[1-9]\d* ended before it saw this(; it goes to the next run)?\.$/u.exec(said);
  if (ended) return handleWords.endedBefore(ended[1] !== undefined);
  const passed = /^Passed over: (S[1-9]\d*) worked here after this step was left\.$/u.exec(said);
  if (passed) return handleWords.passedOver(self(passed[1]!) ? (named ?? handleWords.anAgent) : handleWords.anotherAgent);
  if (/^Redirected: IN[1-9]\d*\.$/u.test(said)) return handleWords.replaced;
  const held = /^(Stopped|Paused|Resumed) by IN[1-9]\d*\.$/u.exec(said);
  if (held) return handleWords.byInstruction(held[1]!);
  if (/^Lifted by IN[1-9]\d*\.$/u.test(said)) return handleWords.lifted;
  /* ANY OTHER SENTENCE NAMES ONLY THE LINE'S OWN RUN, which is the one handle known to be a run here. */
  if (!RUN_HANDLE.test(own)) return note;
  return note.replace(HANDLE_IN, (h: string, at: number) => {
    if (h !== own) return h;
    if (named !== null) return named;
    const opens = at === 0 || /[.!?:]\s+$/u.test(note.slice(0, at));
    return opens ? nameWords.agent : handleWords.anAgent;
  });
}

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
 * is its proper name. A run (`S42`) is named from `run_by`, what the record answers beside a line that run signed
 * (`runByName`: "Claude Code", and "Claude Code, helping" for a helper); a caller that holds none, or one about some
 * other run, reads An agent, never the handle.
 *
 * A STRING IN NONE OF THOSE SHAPES IS ALREADY A NAME. Home's feed hands over the name the record gave a person, and
 * that is kept as it was written ("de Vries" stays lower case). Anything left that still looks like an id, with an
 * underscore, a colon or a ULID in it, is Someone on this record rather than itself, and so is anything with an `@`,
 * since that is an address and not a name.
 */
export function actor(by: string, me: string | null = null, names: ReadonlyMap<string, string> = new Map(), run_by: RunBy | null = null): Actor {
  const who = by.trim();
  if (who === 'you' || (me !== null && me !== '' && who === me)) return { name: copy.feedYou, kind: 'you' };
  /* A RULE THE CALLER HOLDS THE TITLE OF IS SAID BY IT, keyed `rule:<id>` whichever way the rule signs (`rule.reply` in
     the sample), before any person is looked up, since no person is keyed like a rule. */
  const ruled = /^rule[.:](.+)$/u.exec(who)?.[1];
  const titled = ruled === undefined ? undefined : names.get(`rule:${ruled}`)?.trim();
  if (ruled !== undefined && titled) return said(ruleNameSaid(titled), 'rule');
  const named = names.get(who);
  if (named !== undefined && named.trim() !== '') return { name: named, kind: 'person' };
  /* AN ADDRESS IS NEVER A NAME, in whatever shape it came (`jo@kiln.example`, `Jo <jo@kiln.example>`, `@jo`): a `who`
     with an `@` the caller holds no name for is Someone on this record, never the address itself. */
  /* A SCRIPT IS SIGNED `script:<name>@v<n>`: it is said by its title when the caller holds one, else its name in words, never its version. */
  const script = /^script:([^@]+)@v\d+$/u.exec(who)?.[1];
  if (script !== undefined) return said(names.get(`script:${script}`) ?? (Object.hasOwn(SCRIPT_NAMES, script) ? SCRIPT_NAMES[script]! : `${humanize(script)} script`), 'automation');
  if (who.includes('@')) return { name: copy.feedSomeone, kind: 'person' };
  if (who === 'slash') return said(nameWords.slash, 'slash');
  if (who === 'system') return said(nameWords.brainDog, 'system');
  if (who === SEED) return said(nameWords.brainDog, 'sample');
  /* BRAINDOG'S OWN ANSWERS ARE SIGNED AS RULES (`rule:handled` when it settles his own arranging, `rule:additive` and
     `rule:update` for its own updates), and the kernel says them as BrainDog (`whoOf` in undo.ts): Activity read
     "A rule: Handled · closed" (recheck of 30 October). The trust ladder keeps its own name. */
  if (OWN_RULE.test(who)) return said(nameWords.brainDog, 'system');
  const rule = /^rule[.:](.+)$/u.exec(who)?.[1];
  if (rule !== undefined) return said(shipped(rule) ?? ownRule(rule), 'rule');
  const agent = /^agent:(.+)$/u.exec(who)?.[1] ?? (Object.hasOwn(AGENT_NAMES, who) ? who : undefined);
  /* AN AGENT NAMED BY AN ID IS STILL AN AGENT, said by its kind's word rather than the ULID it was minted under. */
  if (agent !== undefined) return said(ULID.test(agent) ? nameWords.agent : agentName(agent), 'agent');
  /* A RUN IS NAMED ONLY BY ITS OWN `run_by`: one that names another run is about a different line, so it is not read. */
  if (/^S\d+$/u.test(who)) return said(run_by !== null && (run_by.run ?? who) === who ? runByName(run_by) : nameWords.agent, 'agent');
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

/* ── a row folded into another ──────────────────────────────────────────── */

/**
 * WHO EACH FOLDED ROW WAS FOLDED INTO, by id, followed to the end: a person merged into one who was merged in turn is
 * said as the last of them. Read off the rows a caller walked, by the field the list declares for it (`meets:` or
 * `org:`'s `merged_into`), so a list that declares none folds nothing, whoever's record it is.
 *
 * A FOLDED ROW NEVER SHOWS. The record moves what pointed at a row when it folds it and takes the row out, but a row
 * folded before that, or a pointer written past it, still names the row that went; every reader of a ref resolves it
 * through this (`remote.ts` `refMapOf`), so it is drawn, named and opened as the row it was folded into. The pointer
 * may name its row by id, by number (`7`, `people#7`) or by its name, as the record's merge writes it. One that names
 * nobody walked here, or that runs in a circle, is left as it is rather than guessed.
 */
export function survivorsOf(register: string, rows: readonly { id: string; seq: number | null; fields?: Record<string, unknown> | undefined }[]): Map<string, string> {
  const out = new Map<string, string>();
  const field = mergedFieldOf(Object.hasOwn(REGISTERS, register) ? REGISTERS[register] : undefined);
  if (!field) return out;
  const title = REGISTERS[register]?.title;
  const byId = new Map(rows.map((r) => [r.id, r]));
  const bySeq = new Map(rows.flatMap((r) => (r.seq === null ? [] : [[r.seq, r.id] as const])));
  const byName = new Map<string, string>();
  for (const r of rows) {
    const n = title ? r.fields?.[title] : undefined;
    if (typeof n === 'string' && n.trim() !== '' && !byName.has(n.trim().toLowerCase())) byName.set(n.trim().toLowerCase(), r.id);
  }
  const into = (id: string): string | undefined => {
    const v = byId.get(id)?.fields?.[field];
    if (typeof v === 'number') return bySeq.get(v);
    if (typeof v !== 'string' || v.trim() === '') return undefined;
    const said = v.trim();
    if (byId.has(said)) return said;
    const seq = /^(?:[a-z][a-z0-9_]*#)?(\d+)$/u.exec(said)?.[1];
    if (seq !== undefined) return bySeq.get(Number(seq));
    return byName.get(said.toLowerCase());
  };
  for (const r of rows) {
    let at = into(r.id);
    const seen = new Set([r.id]);
    while (at !== undefined) {
      /* A CIRCLE NAMES NO ROW THAT STAYS, so the row is left as it is. */
      if (seen.has(at)) {
        at = undefined;
        break;
      }
      seen.add(at);
      const next = into(at);
      if (next === undefined) break;
      at = next;
    }
    if (at !== undefined) out.set(r.id, at);
  }
  return out;
}

/* ── a person or an organisation, as their own row says them ─────────────── */

/**
 * THE WORDS A PERSON'S OR AN ORGANISATION'S ROW SAYS ABOUT WHO THEY ARE, beside the only code that composes them. `self`
 * is the marker on the row of the person whose record it is, and `identities` the heading over the addresses and
 * handles that row is known by, said to that person; anyone else reads them under the row's own name.
 */
export const personWords = {
  self: 'Self',
  identities: 'Your identities',
  identitiesOf: (name: string) => `What ${name} is known by`,
  seen: 'Seen in',
  org: 'Organisation',
} as const;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `27 Aug`, with the year only when it is not this one: how a person says a day. */
function daySaid(day: string, nowMs: number): string {
  const said = `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1] ?? ''}`;
  return day.slice(0, 4) === new Date(nowMs).toISOString().slice(0, 4) ? said : `${said} ${day.slice(0, 4)}`;
}

/** A domain as the organisation a person reads it as: `brightwell.example` is Brightwell, and `mail.acme.co.uk` Acme. */
function domainSaid(domain: string): string {
  const parts = domain.toLowerCase().replace(/^@/u, '').split('.').filter(Boolean);
  /* THE LABEL BEFORE THE SUFFIX, where a two-letter country sits under a short second level (`co.uk`, `com.eg`). */
  const cut = parts.length >= 3 && parts.at(-1)!.length === 2 && parts.at(-2)!.length <= 3 ? 3 : 2;
  const name = parts.at(-cut) ?? parts[0] ?? domain;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** A word a met line carries that must not reach a person as it is: a ULID, a commit's hash, a path or a run's number. */
const UNSAID = /[0-9A-HJKMNP-TV-Z]{26}|\b(?=[a-f]*\d)[0-9a-f]{7,40}\b|(?:^|\s)(?:~|\.{0,2})\/\S*|\b[A-Z]{1,4}\d+\b/gu;

/** One meeting, read: what kind of place it was, where, and on which day. */
type Seen = { kind: 'commit' | 'mail' | 'mail-from' | 'bank' | 'import' | 'agent' | 'other'; place: string; day: string };

/**
 * A met line as `meet` writes it (`2026-08-27 · commit 3f2a91c in portage`, `2026-09-28 · mail: Renewal quote`,
 * `2026-10-02 · mail from brightwell.example`, `bank text`, `import`, `agent run S740`), read into its parts, or `null` for a
 * line with no day in front.
 */
function seenOf(line: string): Seen | null {
  const m = /^(\d{4}-\d{2}-\d{2})\s*·\s*(.*)$/u.exec(line.trim());
  if (!m) return null;
  const [, day = '', where = ''] = m;
  const commit = /^commits?\b(?:\s+\S+)?\s+in\s+(.+)$/iu.exec(where);
  /* A REPOSITORY NAMED BY ITS FOLDER OR ITS ADDRESS IS SAID BY ITS LAST PART: `~/Developer/portage` is portage. */
  if (commit) return { kind: 'commit', place: commit[1]!.trim().replace(/\.git$/u, '').split(/[/\\:]/u).filter(Boolean).at(-1) ?? '', day };
  const from = /^mail from\s+(\S+)$/iu.exec(where);
  if (from) return { kind: 'mail-from', place: domainSaid(from[1]!), day };
  const mail = /^mail\s*:\s*(.*)$/iu.exec(where);
  if (mail) return { kind: 'mail', place: mail[1]!.trim(), day };
  if (/^bank\b/iu.test(where)) return { kind: 'bank', place: '', day };
  if (/^import\b/iu.test(where)) return { kind: 'import', place: '', day };
  if (/^agent\b/iu.test(where)) return { kind: 'agent', place: '', day };
  /* AND A WORD LEFT HANGING WHERE THE ID WAS: "note <id> in <path>" is "note", not "note in". */
  const said = where.replace(UNSAID, ' ').replace(/\s+/gu, ' ').trim().replace(/(?:\s+(?:in|at|on|from|to|of|by))+$/iu, '');
  return { kind: 'other', place: said, day };
}

/** What `n` meetings of one kind in one place are, in words, without the day. */
function seenSaid(kind: Seen['kind'], place: string, n: number): string {
  const many = n > 1;
  switch (kind) {
    case 'commit':
      if (place === '') return many ? `${n} commits` : 'A commit';
      return many ? `${n} commits in ${place}` : `A commit in ${place}`;
    case 'mail':
      return place === '' ? (many ? `${n} mails` : 'A mail') : many ? `${n} mails about “${place}”` : `A mail about “${place}”`;
    case 'mail-from':
      return many ? `${n} mails from ${place}` : `A mail from ${place}`;
    case 'bank':
      return many ? `${n} bank texts` : 'A bank text';
    case 'import':
      return many ? `${n} imports` : 'An import';
    case 'agent':
      return many ? `${n} agent runs` : 'An agent run';
    default:
      return place === '' ? (many ? `${n} times in the work` : 'In the work') : place.charAt(0).toUpperCase() + place.slice(1);
  }
}

/**
 * WHERE A PERSON OR AN ORGANISATION WAS MET, in plain words, newest first: "3 commits in portage, last on 2 Sep",
 * "A mail about “Renewal quote”, 28 Sep", "A bank text, 3 Oct".
 *
 * THE EVIDENCE IS KEPT AND SAID, NEVER THE MECHANISM. `meet` keeps one dated line a meeting in an agent's words
 * ("2026-08-27 · commit 8b1e4d0 in portage"), and a commit's hash, a run's number or a folder is an id a person
 * does not read. Meetings of one kind in one place are one line with their count and the last day, so 47 commits in
 * one repository is one line and not 47. A mail keeps its subject, which is the one thing that tells two apart. A
 * line in no shape `meet` writes is said as written, less anything that looks like an id or a path.
 */
export function seenIn(lines: readonly unknown[], nowMs: number = Date.now()): string[] {
  const groups = new Map<string, { kind: Seen['kind']; place: string; n: number; last: string }>();
  for (const raw of lines) {
    if (typeof raw !== 'string') continue;
    const s = seenOf(raw);
    if (s === null) continue;
    const key = `${s.kind}\u0000${s.place.toLowerCase()}`;
    const held = groups.get(key);
    if (held) {
      held.n += 1;
      if (s.day > held.last) held.last = s.day;
    } else groups.set(key, { kind: s.kind, place: s.place, n: 1, last: s.day });
  }
  return [...groups.values()]
    .sort((a, b) => (a.last < b.last ? 1 : a.last > b.last ? -1 : 0))
    .map((g) => `${seenSaid(g.kind, g.place, g.n)}, ${g.n > 1 ? `last on ${daySaid(g.last, nowMs)}` : daySaid(g.last, nowMs)}`);
}

/** The services a key may name, as a person writes them. */
const SERVICES: Readonly<Record<string, string>> = {
  github: 'GitHub',
  git: 'Git',
  gitlab: 'GitLab',
  discord: 'Discord',
  slack: 'Slack',
  x: 'X',
  twitter: 'X',
  linkedin: 'LinkedIn',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  bank: 'Bank payee',
};

/**
 * ONE ADDRESS OR HANDLE A PERSON IS KNOWN BY, as they read it: `email:mara@lindqvist.example` is "mara@lindqvist.example",
 * `github:mara` "GitHub · mara", `phone:+201…` the number. `null` for a key that is a place rather than a name (a
 * folder, a repository's address, a domain), which is a path or a hostname and never said on a person's row.
 */
export function identitySaid(key: string): string | null {
  const m = /^([a-z][a-z0-9-]*):@?(.+)$/u.exec(key.trim());
  if (!m) return key.includes('@') && !key.includes('/') ? key.trim() : null;
  const [, kind = '', value = ''] = m;
  if (kind === 'email' || kind === 'phone') return value;
  if (kind === 'folder' || kind === 'remote' || kind === 'domain' || kind === 'url') return null;
  return `${SERVICES[kind] ?? humanize(kind)} · ${value}`;
}

/**
 * Every address and handle a row is known by, each once, as `identitySaid` says them: its email, then its keys, its
 * handles and its other names, in the order the row holds them.
 */
export function identitiesOf(fields: { email?: unknown; keys?: unknown; handles?: unknown; aliases?: unknown }): string[] {
  const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : typeof v === 'string' && v !== '' ? [v] : []);
  const said = [...list(fields.email).map((e) => `email:${e}`), ...list(fields.keys), ...list(fields.handles)].map(identitySaid);
  const aliases = list(fields.aliases).filter((a) => !ULID.test(a));
  const out: string[] = [];
  for (const s of [...said, ...aliases]) if (s !== null && s.trim() !== '' && !out.some((o) => o.toLowerCase() === s.toLowerCase())) out.push(s);
  return out;
}
