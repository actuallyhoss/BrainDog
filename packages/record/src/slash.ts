/**
 * Slash reading how a BrainDog is used, and what it proposes about it.
 *
 * TIER A READ A SENTENCE; THIS READS THE RECORD. Which lists grow, which pages are opened, what nothing has touched in
 * a quarter, and what agents write. From that it says what it noticed, in plain sentences, and drafts at most a few
 * proposals in the kinds an agent already files (`pack`, `settings`, `arrange`, and a `rowset` for a skill a use case
 * names), each with its reason as the question. The words it may change are only those the speaking use case declares.
 * A model may also draft a `change` that builds a register, an ingest, a rule, a metric, a page or a script
 * (`fromModel`), and when the owner describes what they want (`asked`), that description is what it drafts from.
 *
 * IT RECOMMENDS AND NEVER REARRANGES (§5c, `docs/29` §1). Nothing here writes a row, a pack or a setting. A draft becomes a
 * question only through `arranger().prepare`, the same door and the same validation a token's proposal goes through, or
 * for a `change` through `kernel.propose`, whose review works out what it would send out exactly as for an agent's; and
 * only an owner's press on Decide applies it. A draft the owner dismissed is never drafted again.
 *
 * DETERMINISTIC FIRST, A MODEL OPTIONALLY. `readUsage` and `noticeUsage` need nothing configured, so a fresh self-host runs
 * them. A model, when one is configured (`SlashModel`), is handed the same reading and may draft instead; what it answers is
 * checked here for shape and then goes through the same door, and when it fails or says nothing valid the rules speak.
 *
 * THE LAWS ARE `kernel/observe.ts`'S: a burst is not a pattern (a count AND a number of separate days), and a silence is only
 * evidence where presence is being recorded (a page nobody opens counts only on a record where other pages are opened).
 */

import { PEN_USE_DAYS, PEN_YOUNG_DAYS, pageSpokenFor, signatureOf, usedOf, youngOf, type Used } from './emergent.ts';
import { GROWS, NAMED_PAGE, WAITING_MOST, filedRank, lapsesFrom, recommend, roomFor, type DrawnPage } from './design-agent.ts';
import type { FigureTest, Grows } from './arrange.ts';
import { subjectOf } from './automations.ts';
import type { Refusal, Result, Sql } from '@braindog/ports';
import type { Json, Kernel, MayPropose, Tried } from '@braindog/kernel';
import { BLOCK_KEY, SLASH, coerce, keyedBlocks, slugify } from '@braindog/kernel';
import { MODULE_WORDS, labelSetting, voiceSetting } from '@braindog/declare';
import { KINDS, designCheck, isKind, type DesignBlock } from 'braindog-render';
import type { BriefInput } from './briefing.ts';
import type { WrittenInput } from './written-brief.ts';
import type { HeadlineInput } from './headlines.ts';
import { clean, scrubbed } from './scrub.ts';
import { stepsFrom, type Handoff } from './skill-steps.ts';
import { SKILL_STEPS_KEPT, toneKept } from './reach.ts';
import { LOOK_THEME_HOUSE, lookThemeFault, type LookOffer } from './theme-pick.ts';

const DAY_MS = 86_400_000;

/** Agents write this many times, on this many separate days, in thirty days before Slash says they work here. */
const AGENTS = { writes: 10, days: 3 };
/** Ninety days of silence, from the same rule of three `observe.ts` uses for a dormant declaration. */
const QUIET_DAYS = 90;
/** A record used for fewer days than this is watched and not advised: a fortnight of use is not a habit. */
const YOUNG_DAYS = PEN_YOUNG_DAYS;
/** Another use case's lists take this many times the speaking one's new rows, and at least `VOICE.rows`, before the voice is questioned. */
const VOICE = { ratio: 3, rows: 10 };
/** A page opened this many times, on this many separate days, in thirty days names what it shows in the person's own word. */
const OPENED = { opens: 5, days: 3 };
/** Agents make at least this share of the changes to rows in thirty days before the voice is asked to say so. */
const AGENT_SHARE = 2 / 3;
/** A label a page title may lend a list is a word or a few, as a label is (`declare` `usecase.ts`). */
const LABEL_MOST = 40;
/** A description line is a sentence's worth, as `declare` `usecase.ts` holds one. */
const HOLDS_MOST = 280;
/**
 * A person, an organisation or a project earns a page of its own once it is met this often or this many things here name
 * it: so many dated `met` lines, or so many rows in other lists pointing at it. THE COUNTS ARE THE
 * RECOMMENDER'S OWN (`design-agent.ts` `NAMED_PAGE`), kept under the name the reading has always said them by, and a list
 * is said to grow by its `GROWS`: one place weighs an arrangement, so no count is written twice.
 */
export const ENTITY_PAGE = NAMED_PAGE;
/** At most this many of those are drafted in one look, the strongest first, so Decide is not a column of names. */
const ENTITY_DRAFTS_MOST = 2;
/** At most this many entities are carried in the reading, which the model is handed whole. */
const ENTITIES_READ_MOST = 6;
/** At most this many lists naming one entity are drawn on its page, under the card. */
const ENTITY_LINKS_MOST = 3;

/**
 * One of a list, from its name and in its case, or `null` where its ending does not say: Issues, Issue; HSBC cards,
 * HSBC card; Deliveries, Delivery; Boxes, Box; APIs, API; Series, nothing.
 *
 * ONLY THE LAST WORD TURNS, AND ONLY WHERE ENGLISH SAYS HOW. The rule this replaced lowercased the whole name and cut a
 * final s or turned ies into y, so "HSBC cards" was drafted as "hsbc card", Boxes as "boxe" and Series as "sery", on a
 * card that set it without saying so. What it cannot turn with confidence (a name already one, a word whose plural is
 * irregular, a mass noun) comes back `null`, and the card leaves the singular out rather than guess: the person still
 * types one in Settings › Words. `inSentence` then sets its case.
 */
const singularOf = (name: string): string | null => {
  const m = /^(.*?)(\p{L}+)$/u.exec(name.trim());
  if (!m) return null;
  const [, head = '', last = ''] = m;
  const low = last.toLowerCase();
  const turned = ((): string | null => {
    /* AN ACRONYM'S PLURAL IS ITS LETTERS AND A SMALL s: APIs, IDs, URLs. */
    if (/^\p{Lu}{2,}s$/u.test(last)) return last.slice(0, -1);
    if (low.length < 4 || !low.endsWith('s') || /(?:ss|us|is)$/u.test(low) || NOT_PLURAL.has(low)) return null;
    if (low.endsWith('ies')) return /[^aeiou]ies$/u.test(low) ? `${last.slice(0, -3)}${/\p{Lu}/u.test(last.at(-1)!) ? 'Y' : 'y'}` : null;
    if (/(?:sses|xes|ches|shes)$/u.test(low)) return last.slice(0, -2);
    if (/(?:zzes|oes)$/u.test(low)) return null;
    return last.slice(0, -1);
  })();
  return turned === null ? null : `${head}${turned}`;
};

/**
 * Words ending in s that `singularOf` must not cut: one already (Series, News, Canvas), a field rather than a count
 * (Analytics, Savings), or a plural it would turn wrong (Movies to movy, Caches to cach, Statuses to statuse, Shelves to
 * shelve, Analyses to analyse).
 */
const NOT_PLURAL: ReadonlySet<string> = new Set([
  'series', 'species', 'news', 'means', 'lens', 'thanks', 'canvas', 'atlas', 'alias', 'bias', 'chaos', 'christmas', 'gas',
  'analytics', 'logistics', 'economics', 'mathematics', 'physics', 'ethics', 'politics', 'athletics', 'aerobics',
  'movies', 'cookies', 'calories', 'zombies', 'rookies', 'selfies', 'smoothies', 'brownies', 'goalies', 'hippies', 'pies', 'ties', 'lies',
  'caches', 'niches', 'headaches', 'avalanches', 'cliches', 'moustaches', 'mustaches', 'quiches',
  'buses', 'statuses', 'bonuses', 'campuses', 'viruses', 'censuses', 'surpluses', 'choruses',
  'knives', 'wives', 'lives', 'halves', 'shelves', 'wolves', 'calves', 'loaves', 'thieves', 'scarves', 'hooves', 'elves', 'selves',
  'analyses', 'crises', 'theses', 'hypotheses', 'diagnoses', 'synopses', 'lenses', 'oases', 'premises',
  'clothes', 'goods', 'savings', 'earnings', 'belongings', 'headquarters', 'whereabouts', 'outskirts',
]);

/**
 * A name as it reads inside a sentence: each word that is only capitalised (Issues, Client) in lower case, and every
 * other word as it was typed (HSBC, iPhone), so "every HSBC card we know about" keeps the bank's name and Issues still
 * reads "every issue". The words a list carries by default are written that way (`MODULE_WORDS`: "task", "person").
 */
const inSentence = (name: string): string => name.replace(/\p{L}+/gu, (w) => (/^\p{Lu}\p{Ll}*$/u.test(w) ? w.toLowerCase() : w));

/** One word of a line, matched whole and in any case, so renaming a list does not rewrite the middle of another word. */
const wordIn = (word: string): RegExp => new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\b`, 'giu');

/** How Home heads its recent changes when agents do most of the work, and when no agent has worked in a quarter. */
export const AGENTS_LINE = 'What you and your agents did since you last looked';
export const QUIET_LINE = 'Since you last looked';
/**
 * At most this many of Slash's questions open at once (ADR-051), AND IT IS THE QUEUE'S OWN THREE (ENG-B14,
 * `design-agent.ts` `WAITING_MOST`): one number, never a second cap beside the pen's.
 */
export const SLASH_OPEN_CAP = WAITING_MOST;

/** The kinds of write that are somebody using a list. */
const WRITES = "('create','edit','state','link','tag','untag','delete','restore')";

export type ListUse = {
  id: string;
  name: string;
  pack: string | null;
  rows: number;
  /** Rows added in thirty days that are not example rows, and on how many separate days. */
  added30: number;
  addedDays30: number;
  /** Writes of any kind in ninety days, by anybody. */
  writes90: number;
  /** Times the list was read in ninety days. */
  reads90: number;
  /** Writes by agents in thirty days. */
  agentWrites30: number;
  declaredAt: string;
};

export type PageUse = {
  slug: string;
  title: string;
  /** Whether `title` is the page's own words, and not its slug standing in for a title filled per row. */
  titled: boolean;
  pack: string | null;
  registers: string[];
  opens30: number;
  /** On how many separate days it was opened in thirty days. */
  openDays30: number;
  opens90: number;
  lastOpened: string | null;
  declaredAt: string;
  /**
   * The entry a template made this page for. Absent on a page somebody wrote. With `registers`, the lists it reads, this
   * is what "has a page" is read from (`design-agent.ts` `namedHasPage`, `listHasPage`).
   */
  row?: { list: string; seq: number };
};

/** One of the speaking use case's words: a voice line or a label, as declared and as it reads now. */
export type ToneSetting = { title: string | null; default: string | null; value: string | null };

/** The speaking use case's words by setting name (`voice_home`, `label_tickets`): only the text settings it declares. */
export type Tone = { pack: string; settings: Record<string, ToneSetting> };

export type AgentUse = { actor: string; writes30: number; days30: number; lists: string[] };

export type PackUse = { id: string; title: string; on: boolean; usecase: boolean; since: string | null };

/**
 * A person, an organisation or a project that has crossed `ENTITY_PAGE`: who it is, in which list, how often it was met,
 * and the lists that name it. `facts` and `lead` are the list's own fields its page would draw: the card's, each with its
 * label, and the one its lead line says.
 */
export type EntityUse = {
  kind: 'person' | 'organisation' | 'project';
  list: string;
  listName: string;
  seq: number;
  name: string;
  /** The list's title field, which the card draws as the name and a page finds the row by. */
  title: string;
  met: number;
  linked: number;
  links: { list: string; name: string; field: string; many: boolean; rows: number }[];
  facts: { field: string; label: string; as: 'fact' | 'when' }[];
  lead: { field: string; label: string } | null;
};

export type Usage = {
  at: string;
  /** What the pen holds now and what the person dismissed (`emergent.ts` signatures). Absent, nothing is held. */
  pen?: {
    held: readonly string[];
    dismissed: readonly string[];
    /** How many of its offers wait now (`emergent.ts` `penQueued`'s `waiting`), the pen's part of the one count. Absent, none. */
    waiting?: number;
  };
  /**
   * The arrangements open on Decide now, whoever filed them, the other part of the one count (`waitingCount`). Read whole,
   * as the slots on Decide are, whatever the asker reads. Absent on a reading made by hand, and then none.
   */
  arranging?: number;
  /** The oldest event or row this record holds, and how many days ago that was. */
  firstWrite: string | null;
  ageDays: number;
  /**
   * How many days the record's own log goes back, which a line about what happened "in ninety days" is said over: a
   * record brought in today holding a payment from March is months old, and its log is not. Absent, `ageDays` is.
   */
  loggedDays?: number;
  /**
   * A person's own use: the first time a person wrote to the record and the different days one did (`usedOf`), never
   * an agent's, an import's or the system's. The young rule reads it, so a record brought in with a year of rows is as
   * young as its owner's use (HD.410). Absent, as on a reading made by hand, `firstWrite` and `ageDays` are.
   */
  used?: Used;
  /** Whether pages being opened and lists being read are recorded at all here, in ninety days (two subjects on three days). */
  listening: { pages: boolean; lists: boolean };
  lists: ListUse[];
  pages: PageUse[];
  /**
   * The pages a template made for the people, organisations and projects in `entities`, each carrying its `row`. KEPT
   * APART FROM `pages`, which every other rule judges as pages of the record (opened or not, quiet or not): a page per
   * entry is opened under its own address and is nobody's to retire. Only those of `entities` are read, so a template
   * over a thousand people adds at most `ENTITIES_READ_MOST` here.
   */
  made?: PageUse[];
  agents: AgentUse[];
  packs: PackUse[];
  /** The use case this record speaks in now, or `null` for the house voice. */
  speaking: string | null;
  /** Changes to rows in thirty days, by anybody and by agents, and by agents in ninety. */
  writes: { all30: number; agents30: number; agents90: number };
  /** The words the speaking use case declares and what each says now, or `null` when the house voice speaks. */
  tone: Tone | null;
  /** The skill names the record holds, or `null` when it has no Skills list. */
  skills: string[] | null;
  /**
   * The skills the record wrote and nobody has taken over (`managed`), each with the entry it is, the version it was read
   * at, and its text and its number, so a skill shipped again at a newer `rev` is offered to a record still holding an
   * older one exactly as shipped. Absent on a reading made before they were read, and then nothing is offered again.
   */
  held?: HeldSkill[];
  /**
   * What agents' runs wrote when they handed off, oldest first, for a skill a use case only names to be offered with
   * steps (`stepsFrom`). A reading made by hand may carry them here. `readUsage` keeps the ones it reads OFF the object
   * (`HANDOFFS_READ`), because the whole reading is handed to the model and to the Slash page, and a run's notes are
   * neither's to read. Absent, a skill with no text of its own is never offered.
   */
  handoffs?: readonly RunLeft[];
  /**
   * The people, organisations and projects met often enough or named by enough things to earn a page (`ENTITY_PAGE`),
   * strongest first, from the lists the caller reads. Absent on a reading made before they were read.
   */
  entities?: EntityUse[];
};

/** A skill the record wrote, as `held` reads it. */
export type HeldSkill = { at: string; version: number; name: string; rev: number; body: string };

/** A thing Slash noticed, said in one sentence. */
export type Noticed = { kind: 'grows' | 'agents' | 'unopened' | 'untouched' | 'voice' | 'young' | 'label' | 'skills'; subject: string; text: string };

/** A proposal Slash would file: the question is its reason, and the body is what `propose` takes. */
export type SlashDraft = {
  /** What it is about, stable across readings, so the same draft is recognised once it has been asked. */
  key: string;
  question: string;
  body_kind: 'pack' | 'settings' | 'arrange' | 'rowset' | 'change' | 'options';
  body: Record<string, unknown>;
  /** Who drafted it: the rules, or the model named. */
  by: string;
  /**
   * How strong an arrangement is, on the recommender's tiers (`design-agent.ts` `recommend`), and the last day it waits,
   * as `YYYY-MM-DD`. Set by the rule that drafted it from an offer; `queueFiling` gives any other arrangement the
   * weakest rank and the day from now. Filed on the body by `lapsing`, never part of what it is about (`stableKey`).
   */
  rank?: number;
  lapses?: string;
  /** What it is about as one key (`cause.ts`), filed with it so it is asked once: a drawing's `drew:` key (`drew.ts`). */
  cause?: string;
};

export type Offered = {
  id: string;
  kind: 'pack' | 'usecase';
  title: string;
  modules: readonly string[];
  /** Whether the pack's own pages show what agents are doing, so it is worth offering when agents write here. */
  showsAgents: boolean;
  /**
   * The skills a use case names for agents working in it, or an add-on ships, offered once it is on. One that ships its
   * text carries `body` and `rev`, and `was`, the texts of the versions before it, oldest first.
   */
  skills?: readonly { name: string; trigger: string; what?: string; body?: string; rev?: number; was?: readonly string[] }[] | undefined;
};

const isAgent = (actor: string): boolean => /^S\d+$/u.test(actor) || actor.startsWith('agent:') || actor === 'slash';

const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const instantOf = (ms: number): string => new Date(ms).toISOString();

/**
 * The oldest day any row says about itself, up to `today`: the earliest value of a day or instant field across the lists
 * the caller may read, or `null` when none holds one.
 *
 * WHAT A ROW SAYS, NOT WHEN IT WAS WRITTEN: a payment from March brought in today is a record kept since March. NOT AN
 * EXAMPLE'S, which a pack invented (`tags` holding `example`), so a use case installed today with dated examples is still
 * a record started today. A day ahead of today is a plan and not a past, and is left out.
 */
function heldSince(sql: Sql, kernel: Kernel, reads: (list: string) => boolean, today: string): string | null {
  let oldest: string | null = null;
  for (const [list, decl] of kernel.registers()) {
    if (!reads(list)) continue;
    for (const f of decl.fields) {
      if (f.type !== 'day' && f.type !== 'instant') continue;
      const path = `$.${f.id}`;
      const r = sql.one<{ d: string | null }>(
        `SELECT min(substr(json_extract(fields, ?), 1, 10)) AS d FROM entry
          WHERE register = ? AND deleted_at IS NULL AND json_type(fields, ?) = 'text'
            AND substr(json_extract(fields, ?), 1, 10) <= ? AND coalesce(json_extract(fields, '$.tags'), '') NOT LIKE '%"example"%'`,
        path,
        list,
        path,
        path,
        today,
      );
      const d = r?.d ?? null;
      if (d !== null && /^\d{4}-\d{2}-\d{2}$/u.test(d) && (oldest === null || d < oldest)) oldest = d;
    }
  }
  return oldest === null ? null : `${oldest}T00:00:00.000Z`;
}

/** A page body's block sources and kinds, to tell whether it shows what agents do. */
export function pageShowsAgents(body: unknown): boolean {
  const blocks = (body as { blocks?: unknown })?.blocks;
  if (!Array.isArray(blocks)) return false;
  return blocks.some((b) => {
    const x = b as { kind?: unknown; source?: unknown };
    return x?.kind === 'agents' || x?.source === 'activity' || x?.source === 'sessions.live' || x?.source === 'sessions.working';
  });
}

/**
 * How this record is used, read from its own tables: the log, the rows, the observations and the declarations.
 *
 * READ ONLY, and bounded to ninety days of the log, so it is one pass over a quarter rather than over a record's life.
 *
 * `reads` IS THE CALLER'S OWN READ, ASKED OF EACH LIST, and a list it refuses is not in the reading at all: not as a
 * list, not among what a page reads, not among what an agent writes, not in the counts of writes, not as a word the
 * speaking use case says for it, and Skills' names not when Skills is one of them. Measured: an owner held to `append`
 * on Skills and Payroll, whose own `list` refused both, pressed Slash with a description asking the model to repeat
 * what it was shown, and read back a question on Decide saying "Skills: acme-bank-reconcile (uses key BANK_PROD). Rows:
 * payroll=7". The reading was the whole record's whoever asked. Absent, the reading is the whole record's, which is
 * right for the daily look, where nobody asked (`test/slash-asked.test.ts`).
 */
export function readUsage(
  sql: Sql,
  kernel: Kernel,
  nowMs: number,
  titles: ReadonlyMap<string, string> = new Map(),
  speaking: string | null = null,
  reads: (list: string) => boolean = () => true,
): Usage {
  const since30 = instantOf(nowMs - 30 * DAY_MS);
  const since90 = instantOf(nowMs - QUIET_DAYS * DAY_MS);
  const day30 = dayOf(nowMs - 30 * DAY_MS);
  const day90 = dayOf(nowMs - QUIET_DAYS * DAY_MS);

  /* THE OLDEST THING THE RECORD HOLDS, NOT THE FIRST LINE ITS LOG WROTE. A record the seed wrote, or one brought in from
     somewhere else, writes every row on the day it arrives, so a record holding months of payments read "This BrainDog
     started today". Its age is the earliest of the first event, the first row written and the oldest day a row says
     about itself (`heldSince`). The first two BY ROWID, as it was, so each is one indexed step however long the log is. */
  const logged = sql.one<{ ts: string }>('SELECT ts FROM event ORDER BY rowid LIMIT 1')?.ts ?? null;
  const oldest = [
    logged,
    sql.one<{ ts: string }>('SELECT created_at AS ts FROM entry ORDER BY rowid LIMIT 1')?.ts ?? null,
    heldSince(sql, kernel, reads, dayOf(nowMs)),
  ].filter((t): t is string => typeof t === 'string' && Number.isFinite(Date.parse(t)));
  const firstWrite = oldest.length === 0 ? null : oldest.reduce((a, b) => (Date.parse(a) <= Date.parse(b) ? a : b));
  const ageDays = firstWrite === null ? 0 : Math.floor((nowMs - Date.parse(firstWrite)) / DAY_MS);
  const loggedDays = logged === null || !Number.isFinite(Date.parse(logged)) ? 0 : Math.floor((nowMs - Date.parse(logged)) / DAY_MS);

  const alive = (kind: string): boolean => {
    const r = sql.one<{ subjects: number; days: number }>(
      'SELECT count(DISTINCT subject) AS subjects, count(DISTINCT day) AS days FROM observation WHERE kind = ? AND day >= ?',
      kind,
      day90,
    );
    return Number(r?.subjects ?? 0) >= 2 && Number(r?.days ?? 0) >= 3;
  };

  const declared = sql.all<{ id: string; kind: string; pack: string | null; body: string; created_at: string }>(
    `SELECT id, kind, coalesce(pack_id, json_extract(body, '$.pack')) AS pack, body,
            (SELECT min(created_at) FROM declaration d2 WHERE d2.id = declaration.id) AS created_at
       FROM declaration WHERE kind IN ('register', 'page') AND superseded_at IS NULL AND retired = 0 ORDER BY id`,
  );

  /* ROWS ADDED, by list and day, leaving out the example rows a pack seeds, which nobody added. */
  const added = new Map<string, { n: number; days: Set<string> }>();
  for (const r of sql.all<{ register: string; day: string; n: number }>(
    `SELECT register, substr(created_at, 1, 10) AS day, count(*) AS n FROM entry
      WHERE deleted_at IS NULL AND created_at >= ? AND coalesce(json_extract(fields, '$.tags'), '') NOT LIKE '%"example"%'
      GROUP BY register, day`,
    since30,
  )) {
    const a = added.get(r.register) ?? { n: 0, days: new Set<string>() };
    a.n += Number(r.n);
    a.days.add(r.day);
    added.set(r.register, a);
  }
  const rows = new Map(
    sql.all<{ register: string; n: number }>('SELECT register, count(*) AS n FROM entry WHERE deleted_at IS NULL GROUP BY register').map((r) => [r.register, Number(r.n)]),
  );

  /* WRITES IN NINETY DAYS, by actor, list and day: one pass over the log for both "untouched" and "what agents write".
     FROM THE LOG, NOT THE ROWS LEFT: a row the hourly sweep purged names its list in its own `purge` event, so writes to
     it still count. */
  const writes90 = new Map<string, number>();
  const agentWrites30 = new Map<string, number>();
  const writes = { all30: 0, agents30: 0, agents90: 0 };
  const agents = new Map<string, { writes30: number; days: Set<string>; lists: Map<string, number> }>();
  for (const r of sql.all<{ actor: string; list: string; day: string; n: number }>(
    `SELECT e.actor AS actor, coalesce(en.register, json_extract(p.from_v, '$')) AS list, substr(e.ts, 1, 10) AS day, count(*) AS n
       FROM event e
       LEFT JOIN entry en ON en.id = substr(e.target, 7)
       LEFT JOIN event p ON en.id IS NULL AND p.target = e.target AND p.kind = 'purge' AND p.field = 'register'
      WHERE e.ts >= ? AND e.target_kind = 'entry' AND e.kind IN ${WRITES}
      GROUP BY e.actor, list, day
     HAVING list IS NOT NULL`,
    since90,
  )) {
    if (!reads(r.list)) continue;
    const n = Number(r.n);
    writes90.set(r.list, (writes90.get(r.list) ?? 0) + n);
    if (r.day >= day30) writes.all30 += n;
    if (isAgent(r.actor)) writes.agents90 += n;
    if (r.day >= day30 && isAgent(r.actor)) {
      writes.agents30 += n;
      agentWrites30.set(r.list, (agentWrites30.get(r.list) ?? 0) + n);
      const a = agents.get(r.actor) ?? { writes30: 0, days: new Set<string>(), lists: new Map<string, number>() };
      a.writes30 += n;
      a.days.add(r.day);
      a.lists.set(r.list, (a.lists.get(r.list) ?? 0) + n);
      agents.set(r.actor, a);
    }
  }

  const observed = (kind: string, from: string) =>
    new Map(
      sql
        .all<{ subject: string; n: number; last: string; days: number }>(
          'SELECT subject, sum(n) AS n, max(day) AS last, count(DISTINCT day) AS days FROM observation WHERE kind = ? AND day >= ? GROUP BY subject',
          kind,
          from,
        )
        .map((r) => [r.subject, { n: Number(r.n), last: r.last, days: Number(r.days) }]),
    );
  const reads90 = observed('register.read', day90);
  const opens90 = observed('page.render', day90);
  const opens30 = observed('page.render', day30);

  const lists: ListUse[] = [];
  const pages: PageUse[] = [];
  /** The lists that hold people, organisations and projects, as their declarations say (`entityRole`). */
  const roles: EntityRole[] = [];
  /** The lists `reads` refused, for the words below that name one. */
  const held = new Set<string>();
  for (const d of declared) {
    const bare = d.id.slice(d.id.indexOf('.') + 1);
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(d.body) as Record<string, unknown>;
    } catch {
      /* a body that will not parse is nothing Slash can say anything about */
    }
    if (d.kind === 'register') {
      /* The kernel's own two lists, runs and what he told them (migration 42), are not his lists to describe. */
      if (bare === 'session' || bare === 'instructions') continue;
      if (!reads(bare)) {
        held.add(bare);
        continue;
      }
      const role = entityRole(bare, body);
      if (role !== null) roles.push(role);
      const a = added.get(bare);
      lists.push({
        id: bare,
        name: kernel.register(bare)?.name ?? (typeof body.name === 'string' ? body.name : bare),
        pack: d.pack,
        rows: rows.get(bare) ?? 0,
        added30: a?.n ?? 0,
        addedDays30: a?.days.size ?? 0,
        writes90: writes90.get(bare) ?? 0,
        reads90: reads90.get(bare)?.n ?? 0,
        agentWrites30: agentWrites30.get(bare) ?? 0,
        declaredAt: d.created_at,
      });
    } else if (!('for' in body)) {
      /* A PAGE PER ROW is opened under each row's slug, so it is not judged by its template's. */
      const titled = typeof body.title === 'string' && body.title.trim() !== '' && !body.title.includes('{{');
      /* A PAGE IS IN THE READING WHEN THE CALLER COULD OPEN IT, which is `seesPage`'s rule in `index.ts`: some list it
         draws from is readable, or it draws from none. What it says it reads is only those she may read. */
      const drawsFrom = registersIn(body);
      const readable = drawsFrom.filter(reads);
      if (drawsFrom.length > 0 && readable.length === 0) continue;
      pages.push({
        slug: bare,
        title: titled ? String(body.title) : bare,
        titled,
        pack: d.pack,
        registers: readable,
        opens30: opens30.get(bare)?.n ?? 0,
        openDays30: opens30.get(bare)?.days ?? 0,
        opens90: opens90.get(bare)?.n ?? 0,
        lastOpened: opens90.get(bare)?.last ?? null,
        declaredAt: d.created_at,
      });
    }
  }

  /* A LIST IS SAID BY THE WORD THE RECORD SPEAKS FOR IT, where the speaking use case relabels it, so Slash's sentences agree
     with the rail. */
  const tone = speaking === null ? null : toneOf(kernel, speaking);
  for (const l of lists) l.name = tone?.settings[labelSetting(l.id)]?.value ?? l.name;
  /* A HELD LIST'S OWN WORDS ARE ITS NAME BY ANOTHER ROUTE, `label_payroll` saying "Salaries", so they go with it. A hashed
     `lk_` setting cannot say which list it is about without its key, and is left out whenever anything is held. */
  if (tone !== null && held.size > 0)
    for (const name of Object.keys(tone.settings)) {
      const about = /^(?:label|one|holds)_(.+)$/u.exec(name)?.[1]?.split('__')[0];
      if (name.startsWith('lk_') || (about !== undefined && held.has(about))) delete tone.settings[name];
    }

  const packs: PackUse[] = kernel.packStates().map((p) => {
    const mine = declared.filter((d) => d.pack === p.id).map((d) => d.created_at).sort();
    return { id: p.id, title: titles.get(p.id) ?? p.id, on: p.disabled_at === null, usecase: p.id.startsWith('usecase-'), since: mine[0] ?? null };
  });

  const entities = entitiesOf(sql, kernel, roles, reads, (id) => lists.find((l) => l.id === id)?.name ?? kernel.register(id)?.name ?? id);

  /* THE PAGES AS DRAWN FOR THEM. A page a template made for a row is that row's page, whatever the template is titled, and
     the declarations above cannot say which rows a template's `where` took: the kernel's own expansion can. Asked only
     when somebody crossed the line, and kept only for those who did. */
  const made: PageUse[] = [];
  if (entities.length > 0) {
    const crossed = new Set(entities.map((e) => `${e.list}#${e.seq}`));
    for (const p of kernel.pages()) {
      if (p.about === null || p.about.seq === null || !crossed.has(`${p.about.register}#${p.about.seq}`)) continue;
      const template = declared.find((d) => d.kind === 'page' && d.id.slice(d.id.indexOf('.') + 1) === p.template);
      /* ITS TITLE IS A TEMPLATE FILLED FROM THE ROW, and the reading goes to a model whole: one that says an address, a
         link or a key is not carried (`scrub.ts`), and the page stands under its address alone. */
      const titled = typeof p.title === 'string' && p.title.trim() !== '' && clean(p.title);
      made.push({
        slug: p.slug,
        title: titled ? String(p.title) : p.slug,
        titled,
        pack: template?.pack ?? null,
        registers: p.registers.filter(reads),
        opens30: opens30.get(p.slug)?.n ?? 0,
        openDays30: opens30.get(p.slug)?.days ?? 0,
        opens90: opens90.get(p.slug)?.n ?? 0,
        lastOpened: opens90.get(p.slug)?.last ?? null,
        declaredAt: template?.created_at ?? '',
        row: { list: p.about.register, seq: p.about.seq },
      });
    }
  }

  const usage: Usage = {
    at: instantOf(nowMs),
    arranging: Number(sql.one<{ n: number }>("SELECT count(*) AS n FROM suggestion WHERE body_kind = 'arrange' AND status = 'open'")?.n ?? 0),
    firstWrite,
    ageDays,
    loggedDays,
    used: usedOf(sql),
    listening: { pages: alive('page.render'), lists: alive('register.read') },
    lists,
    pages,
    ...(made.length > 0 ? { made } : {}),
    agents: [...agents.entries()]
      .map(([actor, a]) => ({ actor, writes30: a.writes30, days30: a.days.size, lists: [...a.lists.entries()].sort((x, y) => y[1] - x[1]).map(([id]) => id) }))
      .sort((a, b) => b.writes30 - a.writes30),
    packs,
    speaking,
    writes,
    tone,
    skills: kernel.register('skills') && reads('skills')
      ? sql
          .all<{ name: string | null }>("SELECT json_extract(fields, '$.name') AS name FROM entry WHERE register = 'skills' AND deleted_at IS NULL")
          .flatMap((r) => (typeof r.name === 'string' ? [r.name] : []))
      : null,
    held: kernel.register('skills') && reads('skills') ? heldSkills(sql, kernel.nameOf) : [],
    entities,
  };
  if (kernel.register('skills') && reads('skills') && kernel.register(RUNS) && reads(RUNS)) HANDOFFS_READ.set(usage, handoffsOf(sql, kernel, nowMs));
  return usage;
}

/** The kernel's register of agents' runs, whose `next`, `tried` and `notes` are what a run left when it handed off. */
const RUNS = 'session';
/** How far back, and how many, handoffs a skill's steps are read from. */
const HANDOFF_DAYS = 60;
const HANDOFFS_MOST = 200;

/**
 * THE HANDOFFS `readUsage` READ, kept beside the reading and not in it: the reading is handed whole to the model
 * (`SlashModelInput.usage`) and answered to the Slash page, and neither is owed what runs wrote. Read by `noticeUsage`
 * for the same object; a copy of the reading carries none, and then a skill with no text is not offered.
 */
const HANDOFFS_READ = new WeakMap<Usage, readonly RunLeft[]>();

/**
 * A run's handoff as Slash reads it: what it left (`text`, its step, what it tried and its notes, which steps are quoted
 * from) and what it was `doing`, which says what the work was about and is never a step itself.
 */
export type RunLeft = Handoff & { doing?: string };

/**
 * The last `HANDOFF_DAYS` days of handoffs, at most `HANDOFFS_MOST`, oldest first: each run that left a step, by its
 * spoken name, with the step, what it tried and its notes, one to a line, and what it was doing beside them.
 */
function handoffsOf(sql: Sql, kernel: Kernel, nowMs: number): RunLeft[] {
  const prefix = String((kernel.register(RUNS) as { seq_prefix?: unknown } | undefined)?.seq_prefix ?? 'S');
  const rows = sql.all<{ seq: number | null; fields: string }>(
    `SELECT seq, fields FROM entry WHERE register = ? AND deleted_at IS NULL
       AND trim(coalesce(json_extract(fields, '$.next'), '')) <> ''
       AND julianday(coalesce(json_extract(fields, '$.next_at'), updated_at)) >= julianday(?)
     ORDER BY seq DESC LIMIT ?`,
    RUNS,
    instantOf(nowMs - HANDOFF_DAYS * DAY_MS),
    HANDOFFS_MOST,
  );
  /* ONLY THE OWNER'S OWN AGENTS, AND ONLY RUNS THAT READ NOTHING FROM OUTSIDE: what Slash quotes becomes a skill "your
     agents" follow, so a colleague's run, or a run another person's or a feed's words reached, is not one it learns from. */
  const owners = new Set(
    sql
      .all<{ id: string }>("SELECT t.id FROM token t JOIN member m ON m.person_id = t.person_id WHERE m.register = '*' AND m.level = 'owner'")
      .map((t) => t.id),
  );
  const marked = new Set(sql.all<{ key: string }>("SELECT key FROM pref WHERE person_id = 'ladder:untrusted'").map((m) => m.key));
  const out: RunLeft[] = [];
  for (const row of rows.reverse()) {
    let f: Record<string, unknown>;
    try {
      f = JSON.parse(row.fields) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (typeof f.token_id !== 'string' || !owners.has(f.token_id) || (row.seq !== null && marked.has(`${prefix}${row.seq}`))) continue;
    const lines = [f.next, ...(Array.isArray(f.tried) ? f.tried : []), ...(Array.isArray(f.notes) ? f.notes : [])].filter(
      (x): x is string => typeof x === 'string' && x.trim() !== '',
    );
    if (row.seq !== null && lines.length > 0)
      out.push({ run: `${prefix}${row.seq}`, text: lines.join('\n'), ...(typeof f.doing === 'string' && f.doing.trim() !== '' ? { doing: f.doing } : {}) });
  }
  return out;
}

/**
 * The skills the record wrote and nobody took over: `managed` and active, with a whole-number `rev` and a text. One
 * somebody marked as their own (`managed` false) is never offered a newer text, whatever it holds. Each by its spoken
 * name (`skills#3`), as every other update Slash files names its entry, never by its id.
 */
function heldSkills(sql: Sql, nameOf: (id: string) => string): HeldSkill[] {
  const out: HeldSkill[] = [];
  for (const row of sql.all<{ id: string; version: number; fields: string }>(
    "SELECT id, version, fields FROM entry WHERE register = 'skills' AND deleted_at IS NULL AND json_extract(fields, '$.managed') = 1 ORDER BY seq LIMIT ?",
    SKILLS_WEIGHED_MOST,
  )) {
    let f: Record<string, unknown>;
    try {
      f = JSON.parse(row.fields) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (f.state !== undefined && f.state !== null && f.state !== 'active') continue;
    if (typeof f.name !== 'string' || typeof f.body !== 'string' || typeof f.rev !== 'number' || !Number.isInteger(f.rev)) continue;
    out.push({ at: nameOf(row.id), version: row.version, name: f.name, rev: f.rev, body: f.body });
  }
  return out;
}

/** A list that holds people, organisations or projects, and the fields its role names. */
type EntityRole = { list: string; kind: EntityUse['kind']; met: string | null; merged: string | null; self: string | null };

/**
 * Whether a list holds people (`meets:`), organisations (`org:`) or projects (`scopes:`), as its declaration says, or
 * by the name a record from before the keys still reads (`people`, `organisations`). A part the role does not name is
 * read by its own name, as `roles.ts` reads a keyless list.
 */
function entityRole(list: string, body: Record<string, unknown>): EntityRole | null {
  const parts = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
  const field = (said: Record<string, unknown> | null, part: string, fallback: string | null): string | null =>
    typeof said?.[part] === 'string' ? (said[part] as string) : fallback;
  const meets = parts(body.meets);
  if (meets !== null || (list === 'people' && body.meets === undefined && body.org === undefined))
    return { list, kind: 'person', met: field(meets, 'met', 'met'), merged: field(meets, 'merged_into', 'merged_into'), self: field(meets, 'self', 'self') };
  const org = parts(body.org);
  if (org !== null || list === 'organisations') return { list, kind: 'organisation', met: field(org, 'met', null), merged: field(org, 'merged_into', 'merged_into'), self: null };
  if (parts(body.scopes) !== null) return { list, kind: 'project', met: null, merged: null, self: null };
  return null;
}

/** The field types a card says as a fact about someone, and the one it says as when. Never money, notes or secrets. */
const FACT_TYPES: ReadonlySet<string> = new Set(['enum', 'ref', 'email', 'url']);
const WHEN_TYPES: ReadonlySet<string> = new Set(['day', 'instant']);

/** A list's field ids a role keeps to itself, which a card about the row does not draw. */
const KEPT_PARTS: ReadonlySet<string> = new Set(['merged_into', 'met', 'aliases', 'keys', 'handles']);

/**
 * The people, organisations and projects that have crossed `ENTITY_PAGE`, strongest first and at most
 * `ENTITIES_READ_MOST`: each live row of an entity list, not an example and not folded into another, with how many `met`
 * lines it holds and how many rows of the other lists the caller reads point at it.
 *
 * ONE PASS A LIST: a row's met lines from its own fields, and the rows naming it grouped by the field that points, so a
 * record of a thousand people is a few queries and not one a person.
 */
function entitiesOf(sql: Sql, kernel: Kernel, roles: readonly EntityRole[], reads: (list: string) => boolean, nameOf: (list: string) => string): EntityUse[] {
  const out: EntityUse[] = [];
  const registers = [...kernel.registers()];
  for (const role of roles) {
    const decl = kernel.register(role.list);
    if (!decl || !decl.title) continue;
    /* WHO NAMES IT: every ref, or list of refs, in another list the caller reads that points at this one. An example a
       pack seeded names nobody. */
    const pointing = registers.flatMap(([id, other]) =>
      id === role.list || !reads(id)
        ? []
        : other.fields
            .filter((f) => f.retired !== true && f.to === role.list && (f.type === 'ref' || (f.type === 'list' && f.of === 'ref')))
            .map((f) => ({ list: id, name: nameOf(id), field: f.id, many: f.type === 'list' })),
    );
    const counts = new Map<string, { list: string; name: string; field: string; many: boolean; rows: number }[]>();
    for (const p of pointing) {
      const path = `$.${p.field}`;
      const grouped = p.many
        ? sql.all<{ v: string; n: number }>(
            `SELECT j.value AS v, count(DISTINCT entry.id) AS n FROM entry, json_each(entry.fields, ?) j
              WHERE entry.register = ? AND entry.deleted_at IS NULL AND json_type(entry.fields, ?) = 'array'
                AND coalesce(json_extract(entry.fields, '$.tags'), '') NOT LIKE '%"example"%' GROUP BY j.value`,
            path,
            p.list,
            path,
          )
        : sql.all<{ v: string; n: number }>(
            `SELECT json_extract(fields, ?) AS v, count(*) AS n FROM entry
              WHERE register = ? AND deleted_at IS NULL AND json_type(fields, ?) = 'text'
                AND coalesce(json_extract(fields, '$.tags'), '') NOT LIKE '%"example"%' GROUP BY v`,
            path,
            p.list,
            path,
          );
      for (const g of grouped) {
        if (typeof g.v !== 'string') continue;
        const at = counts.get(g.v) ?? [];
        at.push({ ...p, rows: Number(g.n) });
        counts.set(g.v, at);
      }
    }
    const fields = decl.fields.filter((f) => f.retired !== true && f.id !== decl.title && !KEPT_PARTS.has(f.id) && f.id !== role.met && f.id !== role.merged);
    const facts: EntityUse['facts'] = fields.filter((f) => FACT_TYPES.has(f.type)).slice(0, 3).map((f) => ({ field: f.id, label: f.label ?? f.id, as: 'fact' as const }));
    const when = fields.find((f) => WHEN_TYPES.has(f.type));
    if (when) facts.push({ field: when.id, label: when.label ?? when.id, as: 'when' });
    /* WHAT A PAGE MAY LEAD ON: when it was last, else what it is. Each row leads on the first of these it holds, so a
       page never opens on a label with nothing after it. */
    const leads = [...(when ? [when] : []), ...fields.filter((f) => f.type === 'enum')];
    for (const r of sql.all<{ id: string; seq: number | null; fields: string }>(
      `SELECT id, seq, fields FROM entry WHERE register = ? AND deleted_at IS NULL
          AND coalesce(json_extract(fields, '$.tags'), '') NOT LIKE '%"example"%' ORDER BY seq LIMIT 5000`,
      role.list,
    )) {
      if (r.seq === null) continue;
      let row: Record<string, unknown>;
      try {
        row = JSON.parse(r.fields) as Record<string, unknown>;
      } catch {
        continue;
      }
      const name = typeof row[decl.title] === 'string' ? (row[decl.title] as string).trim() : '';
      if (name === '') continue;
      /* A NAME THAT IS AN ADDRESS, A LINK OR A KEY IS NOT READ, since the model is handed the reading whole (`scrub.ts`), and
         a page named after somebody's address is no page to offer them either. */
      if (!clean(name)) continue;
      /* A ROW FOLDED INTO ANOTHER IS THAT ONE, and earns nothing of its own. */
      if (role.merged !== null && typeof row[role.merged] === 'string' && row[role.merged] !== '') continue;
      /* THE RECORD'S OWN PERSON (`self`) IS MET IN EVERYTHING THEY DO, and "you have met them" is not said of them. */
      if (role.self !== null && row[role.self] === true) continue;
      const metLines = role.met !== null && Array.isArray(row[role.met]) ? (row[role.met] as unknown[]).length : 0;
      const links = (counts.get(r.id) ?? []).sort((a, b) => b.rows - a.rows);
      const linked = links.reduce((n, l) => n + l.rows, 0);
      if (metLines < ENTITY_PAGE.met && linked < ENTITY_PAGE.linked) continue;
      const leadField = leads.find((f) => row[f.id] !== undefined && row[f.id] !== null && row[f.id] !== '');
      const lead = leadField ? { field: leadField.id, label: leadField.label ?? leadField.id } : null;
      out.push({ kind: role.kind, list: role.list, listName: nameOf(role.list), seq: r.seq, name, title: decl.title, met: metLines, linked, links, facts, lead });
    }
  }
  return out.sort((a, b) => b.met + 2 * b.linked - (a.met + 2 * a.linked) || a.name.localeCompare(b.name)).slice(0, ENTITIES_READ_MOST);
}

/** A setting that is one of a use case's words: a voice line, a label, a list's singular or what it holds. */
const WORDS = /^(voice_|label_|one_|holds_|lk_)/u;

/** The speaking use case's words, as it declares them and as they read now. */
function toneOf(kernel: Kernel, pack: string): Tone | null {
  const read = kernel.packConfig(pack);
  if (!read.ok) return null;
  const settings: Record<string, ToneSetting> = {};
  const values = read.value.values as Record<string, unknown>;
  for (const [name, decl] of Object.entries(read.value.config as Record<string, { type?: unknown; label?: unknown; default?: unknown }>)) {
    if (!WORDS.test(name) || decl?.type !== 'text') continue;
    const now = values[name];
    settings[name] = {
      title: typeof decl.label === 'string' ? decl.label : null,
      default: typeof decl.default === 'string' ? decl.default : null,
      value: typeof now === 'string' && now.trim() !== '' ? now : null,
    };
  }
  return { pack, settings };
}

/** The lists a page body draws from, by its blocks' `source: register.<id>`. */
function registersIn(body: Record<string, unknown>): string[] {
  const out = new Set<string>();
  for (const b of Array.isArray(body.blocks) ? body.blocks : []) {
    const source = (b as { source?: unknown })?.source;
    if (typeof source === 'string' && source.startsWith('register.')) out.add(source.slice('register.'.length));
  }
  for (const r of Array.isArray(body.requires) ? body.requires : []) if (typeof r === 'string' && r.startsWith('register.')) out.add(r.slice('register.'.length));
  return [...out];
}

const olderThan = (at: string | null, days: number, nowMs: number): boolean => at !== null && nowMs - Date.parse(at) >= days * DAY_MS;

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

const joinNames = (names: readonly string[]): string =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/**
 * The reading's pages as the recommender reads them (`design-agent.ts` `DrawnPage`): those somebody wrote and those a
 * template made for somebody in the reading, each with the lists it reads and, where it has one, its row.
 */
const drawnOf = (usage: Usage): DrawnPage[] =>
  [...usage.pages, ...(usage.made ?? [])].map((p) => ({ slug: p.slug, title: p.title, lists: p.registers, ...(p.row === undefined ? {} : { row: p.row }) }));

/** The reading's own moment, for the recommender, which is told the time and never asks it. */
const readAt = (usage: Pick<Usage, 'at'>): number => {
  const ms = Date.parse(usage.at);
  return Number.isFinite(ms) ? ms : 0;
};

/** A slug no page holds, for a page over `list`. */
function freeSlug(list: string, pages: readonly PageUse[]): string {
  const taken = new Set(pages.map((p) => p.slug));
  for (const slug of [list.replaceAll('_', '-'), `${list.replaceAll('_', '-')}-list`]) if (!taken.has(slug)) return slug;
  let i = 2;
  while (taken.has(`${list.replaceAll('_', '-')}-${i}`)) i++;
  return `${list.replaceAll('_', '-')}-${i}`;
}

/**
 * What Slash noticed that is a conclusion about the whole record: a pack nothing touched (`untouched`), what agents did
 * across every list (`agents`), and where most of what was added went (`voice`). Each is true only of a reading that
 * leaves nothing out.
 */
const OF_THE_WHOLE: ReadonlySet<Noticed['kind']> = new Set(['untouched', 'agents', 'voice']);

/**
 * What Slash noticed and what it would propose, from a reading. PURE: the same reading always says the same thing.
 *
 * `nowMs` is the reading's own moment; `offered` is the host's catalogue as Slash needs it.
 *
 * `partial` IS A READING WITH LISTS LEFT OUT, the one an owner held from some list is handed (`readUsage`'s `reads`),
 * and then no rule drafts at all and nothing is said of the whole record. Every rule concludes from a count or an
 * absence, and over a partial reading the conclusion is false: an owner held to `append` on Tasks, which was written
 * eighteen times, pressed Slash and was filed "Turn off Work? Nothing in it has been opened or changed in ninety days",
 * since Tasks had left her reading and what was left of Work was untouched (`test/slash.test.ts`). What she reads whole
 * and is said of one list or page she can open stays.
 */
export function noticeUsage(usage: Usage, offered: readonly Offered[], partial = false): { noticed: Noticed[]; drafts: SlashDraft[]; quiet: string | null } {
  const read = noticeWhole(usage, offered);
  return partial ? { noticed: read.noticed.filter((n) => !OF_THE_WHOLE.has(n.kind)), drafts: [], quiet: read.quiet } : read;
}

/**
 * Whether the speaking use case named this list itself: one of its own lists, or a module's it relabelled. Only those
 * are offered a page's title as their name.
 *
 * EVERY LIST A USE CASE HOLDS DECLARES ITS WORDS NOW (`declare` `useCasePack`), so a module's list it never renamed has
 * a `label_<list>` setting too, starting from the module's own name. Read as a word the use case chose, that armed the
 * card for every module list, and a page called Renewals over Services asked "Call Services Renewals everywhere?". A
 * module's list whose setting starts from the module's own word (`MODULE_WORDS`) is one it left alone.
 */
const relabelled = (list: ListUse, held: ToneSetting, tone: Tone): boolean =>
  list.pack === tone.pack || !Object.hasOwn(MODULE_WORDS, list.id) || held.default !== MODULE_WORDS[list.id]!.name;

function noticeWhole(usage: Usage, offered: readonly Offered[]): { noticed: Noticed[]; drafts: SlashDraft[]; quiet: string | null } {
  /* ONE PLACE AN OFFER (offer-pen-50): a page the pen holds, or one the person dismissed there, is not asked again here. */
  const penHeld = new Set(usage.pen?.held ?? []);
  const penGone = new Set(usage.pen?.dismissed ?? []);
  const nowMs = Date.parse(usage.at);
  const noticed: Noticed[] = [];
  const drafts: SlashDraft[] = [];
  const listName = (id: string): string => usage.lists.find((l) => l.id === id)?.name ?? id;
  const packTitle = (id: string): string => offered.find((o) => o.id === id)?.title ?? usage.packs.find((p) => p.id === id)?.title ?? id;

  /* WHAT GROWS, most first. WHICH OF THEM IS OFFERED A PAGE IS THE RECOMMENDER'S ANSWER (`recommend`): it holds the
     counts and reads "no page draws it whole" off the pages as drawn, so this rule and the pen cannot disagree, and the
     draft carries the offer's rank and the day it lapses, so it waits in the one queue (`queueFiling`). */
  const pageOffered = new Map(
    recommend({ nowMs: readAt(usage), pages: drawnOf(usage), lists: usage.lists.map((l) => ({ id: l.id, name: l.name, rows: l.rows, added30: l.added30, addedDays30: l.addedDays30 })) }).map((o) => [o.key, o]),
  );
  const growing = usage.lists.filter((l) => l.added30 >= GROWS.rows && l.addedDays30 >= GROWS.days).sort((a, b) => b.added30 - a.added30);
  for (const l of growing) {
    noticed.push({ kind: 'grows', subject: l.id, text: `${l.name} grew by ${l.added30} in the last thirty days, on ${l.addedDays30} separate days.` });
    /* A LIST THAT GROWS AND NO PAGE SHOWS gets a page of its own, filed beside its pack's pages in the rail. */
    const offer = pageOffered.get(`page:${l.id}`);
    if (offer !== undefined && !pageSpokenFor(l.id, penHeld, penGone)) {
      const slug = freeSlug(l.id, usage.pages);
      const section = usage.pages.find((p) => p.pack !== null && p.pack === l.pack)?.title ?? l.name;
      drafts.push({
        key: signatureOf('page', l.id),
        question: `Give ${l.name} a page of its own? It grew by ${l.added30} in the last thirty days, and no page shows it yet.`,
        body_kind: 'arrange',
        body: {
          why: [`${l.name} grew by ${l.added30} in thirty days, and no page shows it.`],
          pages: [
            {
              id: `page.${slug}`,
              body: {
                page: slug,
                title: l.name,
                nav: { section, order: 50 },
                requires: [`register.${l.id}`],
                blocks: [{ kind: 'table', source: `register.${l.id}`, span: 12, order: [{ field: 'seq', dir: 'desc' }], empty: `Nothing in ${l.name} yet.` }],
              },
            },
          ],
          ...(offer.prediction === undefined ? {} : { prediction: offer.prediction }),
        },
        by: 'rules',
        rank: offer.rank,
        lapses: offer.lapses,
      });
    }
  }

  /* WHO AND WHAT COMES UP MOST: a person, an organisation or a project met often or named by many things, with no page
     of its own yet, gets one drafted, held to the same bar a model's page is (`entityDrafts`). */
  drafts.push(...entityDrafts(usage));

  /* WHAT AGENTS WRITE. */
  const working = usage.agents.filter((a) => a.writes30 >= AGENTS.writes && a.days30 >= AGENTS.days);
  if (working.length > 0) {
    const writes = working.reduce((n, a) => n + a.writes30, 0);
    const where = [...new Set(working.flatMap((a) => a.lists))].slice(0, 3).map(listName);
    noticed.push({
      kind: 'agents',
      subject: working.map((a) => a.actor).join(','),
      text: `${working.length === 1 ? 'An agent' : `${working.length} agents`} made ${plural(writes, 'change')} in the last thirty days, mostly in ${joinNames(where)}.`,
    });
    /* AND NOWHERE TO SEE THEM: a page that shows agents, on offer and not on. */
    const seen = usage.pages.some((p) => usage.packs.some((k) => k.id === p.pack && k.on) && offered.some((o) => o.id === p.pack && o.showsAgents));
    const home = offered.find((o) => o.showsAgents && !usage.packs.some((p) => p.id === o.id && p.on));
    if (!seen && home) {
      const off = usage.packs.find((p) => p.id === home.id && !p.on);
      drafts.push({
        key: `agents:${home.id}`,
        question: `${off ? 'Turn on' : 'Add'} ${home.title}, so you can see what agents do here? They made ${plural(writes, 'change')} in the last thirty days.`,
        body_kind: 'pack',
        body: off ? { enable: home.id } : { install: home.id },
        by: 'rules',
      });
    }
  }

  /* A PACK NOTHING HAS TOUCHED: its lists unwritten and unread, its pages unopened, for a quarter. Not the one speaking, and
     not one an on use case is built on. */
  const needed = new Set(offered.filter((o) => usage.packs.some((p) => p.id === o.id && p.on)).flatMap((o) => o.modules));
  if (usage.listening.pages && usage.listening.lists)
    for (const pack of usage.packs) {
      if (!pack.on || pack.id === usage.speaking || needed.has(pack.id) || !olderThan(pack.since, QUIET_DAYS, nowMs)) continue;
      const lists = usage.lists.filter((l) => l.pack === pack.id);
      const pages = usage.pages.filter((p) => p.pack === pack.id);
      if (lists.length + pages.length === 0) continue;
      if (lists.some((l) => l.writes90 > 0 || l.reads90 > 0 || l.added30 > 0) || pages.some((p) => p.opens90 > 0)) continue;
      const title = packTitle(pack.id);
      noticed.push({ kind: 'untouched', subject: pack.id, text: `Nothing in ${title} has been opened or changed in ninety days.` });
      drafts.push({
        key: `off:${pack.id}`,
        question: `Turn off ${title}? Nothing in it has been opened or changed in ninety days. What it holds stays, and you can turn it back on.`,
        body_kind: 'pack',
        body: { disable: pack.id },
        by: 'rules',
      });
    }

  /* PAGES NOBODY OPENS, only where opening pages is recorded at all, and not a page of a pack already said to be untouched. */
  const untouched = new Set(noticed.filter((n) => n.kind === 'untouched').map((n) => n.subject));
  if (usage.listening.pages)
    for (const p of usage.pages)
      if (p.opens90 === 0 && olderThan(p.declaredAt, QUIET_DAYS, nowMs) && !(p.pack !== null && untouched.has(p.pack)))
        noticed.push({ kind: 'unopened', subject: p.slug, text: `Nobody has opened ${p.title} in ninety days.` });

  /* THE VOICE: another use case on takes most of what is added, so it may be the one to speak. */
  if (usage.speaking !== null) {
    const addedBy = (pack: string) => usage.lists.filter((l) => l.pack === pack).reduce((n, l) => n + l.added30, 0);
    const now = addedBy(usage.speaking);
    const other = usage.packs
      .filter((p) => p.on && p.usecase && p.id !== usage.speaking)
      .map((p) => ({ p, n: addedBy(p.id) }))
      .sort((a, b) => b.n - a.n)[0];
    if (other && other.n >= VOICE.rows && other.n >= VOICE.ratio * Math.max(now, 1)) {
      const title = packTitle(other.p.id);
      noticed.push({
        kind: 'voice',
        subject: other.p.id,
        text: `Most of what you added this month went into ${title}: ${other.n}, against ${now} in ${packTitle(usage.speaking)}.`,
      });
      drafts.push({
        key: `voice:${other.p.id}`,
        question: `Let ${title} set the tone? Most of what you added in the last thirty days went there, and BrainDog still speaks as ${packTitle(usage.speaking)}.`,
        body_kind: 'arrange',
        /* THE SETTING IS WHAT MAKES IT A CHANGE; accepting an arrangement led by a use case then writes the voice rule down with it speaking. */
        body: { usecase: other.p.id.slice('usecase-'.length), settings: [{ pack: other.p.id, values: { speaks: true } }], why: [`${other.n} added to ${title} in thirty days, and ${now} to ${packTitle(usage.speaking)}.`] },
        by: 'rules',
      });
    }
  }

  /* THE WORDS FOLLOW USE, and only words the speaking use case declares, so every draft is a setting `prepare` can check.
     A page over one list that the person keeps opening names that list in their own word: the list is offered that word. */
  const tone = usage.tone;
  if (tone !== null) {
    const worded = new Set<string>();
    for (const p of [...usage.pages].sort((a, b) => b.opens30 - a.opens30)) {
      if (!p.titled || p.registers.length !== 1 || p.opens30 < OPENED.opens || p.openDays30 < OPENED.days) continue;
      const list = usage.lists.find((l) => l.id === p.registers[0]);
      if (!list || worded.has(list.id)) continue;
      const setting = labelSetting(list.id);
      const held = tone.settings[setting];
      if (!held || !relabelled(list, held, tone)) continue;
      const word = held.value ?? held.default ?? list.name;
      const title = p.title.trim();
      if (title.length > LABEL_MOST || title.toLowerCase() === word.toLowerCase()) continue;
      worded.add(list.id);
      const seen = `You opened the ${title} page, which shows ${word}, ${plural(p.opens30, 'time')} on ${p.openDays30} separate days in the last thirty days.`;
      noticed.push({ kind: 'label', subject: list.id, text: `You opened ${title}, a page of ${word}, ${plural(p.opens30, 'time')} in the last thirty days.` });

      /**
       * AND THE TWO WORDS THAT GO WITH THE NAME. A list carries three: what it is called, what ONE of it is called, and
       * the line saying what it holds (`declare` `usecase.ts` `LIST_WORDS`). The name alone left a list called Issues
       * saying "New ticket" on its own button and "every ticket we know about" under its empty state, which is two
       * words for one thing on the screen the rename was supposed to fix. Both come off the signal already read here,
       * so neither costs another reading; each is offered only where the use case declares the setting, as the name is,
       * and only where it would say something the record does not say already.
       */
      const oneSetting = labelSetting(`${list.id}:one`);
      const oneHeld = tone.settings[oneSetting];
      const turned = singularOf(title);
      const one = turned === null ? null : inSentence(turned);
      const oneNow = oneHeld ? (oneHeld.value ?? oneHeld.default) : null;
      /* ONE QUESTION FOR ONE RENAME: the singular rides on the name's own card, since every list declares it, and two
         cards on Decide for one word was the busy screen a calm page is meant to avoid. AND THE QUESTION SAYS SO. It set the singular
         without a word about it, so accepting "Call Tickets Issues everywhere?" also changed every "New ticket" button.
         The singular is named beside the name, in quotes as the name is, or left out of both the question and the change
         where it cannot be made with confidence (`singularOf`). */
      const values: Record<string, string> = { [setting]: title };
      const naming = oneHeld !== undefined && one !== null && one.toLowerCase() !== (oneNow ?? '').toLowerCase();
      if (naming) values[oneSetting] = one;
      drafts.push({
        key: '',
        question: naming ? `Call ${word} "${title}" everywhere, and one of them "${one}"? ${seen}` : `Call ${word} "${title}" everywhere? ${seen}`,
        body_kind: 'settings',
        body: { pack: tone.pack, values },
        by: 'rules',
      });

      /* WHAT IT HOLDS, IN THE NEW WORD. Only the old word is swapped, so the sentence stays the one its author wrote; a
         line that never named the old word has nothing here to draft and is left alone. The old singular is the one
         the list carries now, or the one its old name makes; a line naming it with no new singular to put in its place
         is left alone too, rather than read "every issue" beside "one ticket". */
      const holdsSetting = labelSetting(`${list.id}:holds`);
      const holdsHeld = tone.settings[holdsSetting];
      const line = holdsHeld ? (holdsHeld.value ?? holdsHeld.default ?? '') : '';
      const was = oneNow ?? singularOf(word);
      const named = line.replace(wordIn(word), inSentence(title));
      const said = was === null ? named : one === null ? (wordIn(was).test(named) ? line : named) : named.replace(wordIn(was), one);
      if (line !== '' && said !== line && said.length <= HOLDS_MOST)
        drafts.push({
          key: '',
          question: `Say ${title} holds ${said}? The line reads "${line}" now, in the old word.`,
          body_kind: 'settings',
          body: { pack: tone.pack, values: { [holdsSetting]: said } },
          by: 'rules',
        });
    }

    /* HOME SAYS WHO DID THE WORK. Agents making most of the changes are named in how Home heads them; a heading that names
       agents when none has worked in a quarter goes back to the use case's own line, or a plain one. */
    const awaySetting = voiceSetting('since_away');
    const away = tone.settings[awaySetting];
    if (away) {
      const line = away.value ?? away.default ?? '';
      const namesAgents = /agent/iu.test(line);
      const byAgents = working.length > 0 && usage.writes.agents30 >= AGENT_SHARE * usage.writes.all30;
      if (byAgents && !namesAgents) {
        drafts.push({
          key: '',
          question: `Head what changed on Home "${AGENTS_LINE}"? Agents made ${usage.writes.agents30} of the ${plural(usage.writes.all30, 'change')} here in the last thirty days, and "${line}" does not say so.`,
          body_kind: 'settings',
          body: { pack: tone.pack, values: { [awaySetting]: AGENTS_LINE } },
          by: 'rules',
        });
      } else if (namesAgents && usage.writes.agents90 === 0 && (usage.loggedDays ?? usage.ageDays) >= QUIET_DAYS) {
        /* OVER THE LOG'S OWN DAYS, NOT THE OLDEST DAY A ROW HOLDS: "No agent has changed anything here in ninety days" is a
           claim about the log, and a record brought in last week with a payment from March has not been watched that long. */
        const back = away.value !== null && away.default !== null && away.value !== away.default && !/agent/iu.test(away.default);
        const to = back ? away.default! : QUIET_LINE;
        drafts.push({
          key: '',
          question: `Head what changed on Home "${to}" instead of "${line}"? No agent has changed anything here in ninety days.`,
          body_kind: 'settings',
          body: { pack: tone.pack, values: { [awaySetting]: back ? null : QUIET_LINE } },
          by: 'rules',
        });
      }
    }
  }

  /* THE SKILLS A USE CASE NAMES OR AN ADD-ON SHIPS, once it is on and the record keeps skills: each one it does not hold
     yet is an entry for the owner to accept, never one written for them. ONE THAT SHIPS ITS TEXT is offered with it, and
     every such skill missing goes in one question, written by the record (`managed`), so a record with agents on is asked
     once and not once a skill. One a use case only names, with no text, is asked alone, and only once three runs left the
     same steps for it. */
  const shipped: SlashDraft[] = [];
  if (usage.skills !== null) {
    const held = new Set(usage.skills);
    const on = offered.filter((o) => usage.packs.some((p) => p.id === o.id && p.on));
    const missing = on.flatMap((o) => (o.skills ?? []).filter((s) => !held.has(s.name)).map((s) => ({ o, s })));
    /* ONE SKILL BY ONE NAME, the first offered, so two add-ons shipping one name are not asked for it twice. */
    const once = missing.filter(({ s }, i) => missing.findIndex((m) => m.s.name === s.name) === i);
    /* AN ADD-ON SHIPS what it offers, and is said as one ("The Agents add-on ships"); a use case names them. */
    const byPack = once.every(({ o }) => o.kind === 'pack');
    const naming = [...new Set(once.map(({ o }) => (byPack ? shipper(o) : o.title)))];
    if (once.length > 0)
      noticed.push({
        kind: 'skills',
        subject: once.map(({ s }) => s.name).join(','),
        text: `${capital(joinNames(naming))} ${byPack ? (naming.length === 1 ? 'ships' : 'ship') : naming.length === 1 ? 'names' : 'name'} ${once.length === 1 ? 'a skill' : 'skills'} for agents that you do not have in Skills yet: ${joinNames(once.map(({ s }) => s.name))}.`,
      });
    const written = once.filter(({ s }) => typeof s.body === 'string' && s.body.trim() !== '');
    /* ONE ONLY NAMED IS OFFERED ONLY WITH STEPS, quoted from what three or more runs that did it left (`stepsFrom`). The
       rule that filed a skill whose body said "Its steps are not written yet." is gone: what it offered was a name. */
    const handoffs = usage.handoffs ?? HANDOFFS_READ.get(usage) ?? [];
    for (const { o, s } of once.filter((m) => !written.includes(m))) {
      const steps = stepsFrom(handoffs.filter((h) => namesSkill(`${h.doing ?? ''}\n${h.text}`, s.name)));
      if (steps === null || steps.length < SKILL_STEPS_KEPT) continue;
      drafts.push({
        key: '',
        question: `Give your agents the skill ${s.name}? ${capital(shipper(o))} names it for ${momentOf(s.trigger)}, and its ${steps.length} steps are quoted from what your agents left when they handed off.`,
        body_kind: 'rowset',
        body: {
          register: 'skills',
          rows: [{ name: s.name, trigger: s.trigger, what: `A skill ${o.title} names for agents working here, in the steps they took.`, kind: 'skill', body: skillBody(s.trigger, steps) }],
        },
        by: 'rules',
      });
    }
    if (written.length > 0) {
      const from = [...new Set(written.map(({ o }) => shipper(o)))];
      const one = written.length === 1;
      shipped.push({
        key: '',
        question: `Give your agents ${one ? 'the skill' : 'the skills'} ${joinNames(written.map(({ s }) => s.name))}? ${capital(joinNames(from))} ${from.length === 1 ? 'ships' : 'ship'} ${one ? 'it' : 'them'}, and Skills has ${one ? 'none by that name' : written.length === 2 ? 'neither' : 'none of them'} yet.`,
        body_kind: 'rowset',
        body: {
          register: 'skills',
          rows: written.map(({ o, s }) => ({
            name: s.name,
            trigger: s.trigger,
            what: s.what ?? `A skill ${o.title} ships for agents working here.`,
            kind: 'skill',
            body: s.body!,
            rev: shippedRev(s.rev),
            managed: true,
          })),
        },
        by: 'rules',
      });
    }

    /* A NEWER TEXT OF A SKILL THE RECORD WROTE, one question each: offered only while the skill still holds a text that
       was shipped (an older `rev`, word for word), so a skill somebody edited, or took over, is never written over. */
    for (const h of usage.held ?? []) {
      const found = on.flatMap((o) => (o.skills ?? []).map((s) => ({ o, s }))).find(({ s }) => s.name === h.name && typeof s.body === 'string');
      if (!found || shippedRev(found.s.rev) <= h.rev || h.rev < 1 || (found.s.was ?? [])[h.rev - 1] !== h.body) continue;
      const { o, s } = found;
      const rev = shippedRev(s.rev);
      shipped.push({
        key: '',
        question: `Take version ${rev} of the skill ${h.name}? ${capital(shipper(o))} ships a newer text, and yours is still version ${h.rev} as it came.`,
        body_kind: 'rowset',
        body: { register: 'skills', rows: [{ at: h.at, version: h.version, patch: { body: s.body!, rev } }] },
        by: 'rules',
      });
    }
  }
  drafts.push(...shipped);

  /* A YOUNG RECORD IS WATCHED, NOT ADVISED. What was noticed is still said; nothing is proposed yet, BUT THE SKILLS AN
     ADD-ON SHIPS, which are the add-on's own and no advice about how the record is used, so a record with agents on is
     offered them the first night. Young is read from a person's own use (`youngSaid`), never the oldest row. */
  const young = youngSaid(usage);
  /* NONE OF THE RULES' DRAFTS REACHES SLASH'S OWN LOOP TODAY, and each is held as a model's is, so one that comes to is
     dropped here and not filed (`ownLoopFault`). */
  const mine = (list: readonly SlashDraft[]): SlashDraft[] => keyed(list.filter((d) => ownLoopFault(d) === null));
  if (young !== null) return { noticed, drafts: mine(shipped), quiet: young };
  return { noticed, drafts: mine(drafts), quiet: null };
}

/**
 * What the Slash page says while the record is too young to be advised, or `null` once it is not. FROM A PERSON'S OWN
 * USE (HD.410: "a fortnight of use is not a habit"): fewer than two weeks since a person first wrote to it, or writes
 * on fewer than five different days, and the sentence says which. A record brought in today with a year of rows has
 * none, and an agent's writes are never a person's. A reading made by hand without `used` is judged by its age.
 */
export function youngSaid(usage: Pick<Usage, 'at' | 'firstWrite' | 'ageDays' | 'used'>): string | null {
  const byAge = (): string | null => {
    if (usage.firstWrite === null) return 'Nothing has been added yet, so there is nothing to go on.';
    if (usage.ageDays >= YOUNG_DAYS) return null;
    const age = usage.ageDays < 1 ? 'This BrainDog started today' : usage.ageDays === 1 ? 'This BrainDog started yesterday' : `This BrainDog is ${plural(usage.ageDays, 'day')} old`;
    return `${age}. Slash waits for two weeks of use before it suggests changes.`;
  };
  const { used } = usage;
  if (used === undefined) return byAge();
  const nowMs = Date.parse(usage.at);
  const which = youngOf(used, nowMs);
  /* A record whose oldest row is younger than two weeks has no older use either; a reading that says so is believed. */
  if (which === null) return byAge();
  if (which === 'none')
    return usage.firstWrite === null
      ? 'Nothing has been added yet, so there is nothing to go on.'
      : 'Slash waits for two weeks of your own use. Nobody has added or changed anything here by hand yet.';
  if (which === 'days')
    return `Slash waits for your own use on ${PEN_USE_DAYS} different days. You have used BrainDog on ${plural(used.days, 'day')}.`;
  const age = Math.max(0, Math.floor((nowMs - Date.parse(used.first!)) / DAY_MS));
  const when = age < 1 ? 'today' : age === 1 ? 'yesterday' : `${plural(age, 'day')} ago`;
  return `Slash waits for two weeks of your own use. ${used.days <= 1 ? `You started using BrainDog ${when}.` : `You have used BrainDog on ${plural(used.days, 'day')} since you started ${when}.`}`;
}

/**
 * A name a `where:` can say as it is: one clause, so no comma, and no word the sentence reads as its own (`or` between
 * values, a hole, a quote). A name that cannot is not drafted a page, rather than one that finds the wrong row.
 */
const sayable = (name: string): boolean => !/[,{}"'\n]/u.test(name) && !/\s(?:or|and)\s/iu.test(name) && name.length <= 80;

/** The words each kind of entity is said in: a person is they, an organisation or a project it. */
const THEM: Readonly<Record<EntityUse['kind'], { them: string; own: string; has: string }>> = {
  person: { them: 'them', own: 'their own', has: 'they have' },
  organisation: { them: 'it', own: 'its own', has: 'it has' },
  project: { them: 'it', own: 'its own', has: 'it has' },
};

/**
 * A page for each person, organisation and project in the reading that has none: `ENTITY_DRAFTS_MOST` at most, the
 * strongest first. The page opens on one lead line with a figure from the row itself, its card under it, and up to
 * `ENTITY_LINKS_MOST` of the lists that name it, each filtered to it; it sits in the rail beside the pages of its list.
 *
 * HELD TO THE PAGE BAR BEFORE IT IS EVER FILED. Every draft is measured by `calmFaults`, the bar a model's page is
 * repaired to in `describe`, and one that would not pass (a heading in the system's words, a hole in a row) is not
 * drafted. And it goes to the model as one of the rules' drafts on the look, as every rule draft does, so a model may
 * improve it, through `fromModel` and `prepare` like anything it answers.
 *
 * A PAGE IS NOT DRAFTED FOR A THING THAT HAS ONE, AND THE RECOMMENDER SAYS WHICH HAVE (`design-agent.ts` `recommend`,
 * `namedHasPage`): a page a template made for its row, a page somebody wrote with that title, or one at that address. This
 * rule read titles and addresses for itself and so missed the first, and two projects with a page were each offered one.
 * What it keeps of its own is whether the address a draft would take is free, which is another question.
 *
 * AND IN THE RECOMMENDER'S ORDER, ONCE A THING: the drafts follow `recommend`'s offers, strongest first, one
 * for each key however often the reading carries the thing, and each carries its offer's rank and the day it lapses.
 */
export function entityDrafts(usage: Usage): SlashDraft[] {
  const out: SlashDraft[] = [];
  const entities = usage.entities ?? [];
  const drawn = drawnOf(usage);
  const byKey = new Map<string, EntityUse>();
  for (const e of entities) if (!byKey.has(`page:${e.list}#${e.seq}`)) byKey.set(`page:${e.list}#${e.seq}`, e);
  const offers = recommend({
    nowMs: readAt(usage),
    pages: drawn,
    named: [...byKey.values()].map((e) => ({ list: e.list, listName: e.listName, seq: e.seq, name: e.name, met: e.met, linked: e.linked })),
  });
  /* THE ADDRESSES SPOKEN FOR: every page drawn, and each page drafted in this look. */
  const taken = new Set(drawn.map((p) => p.slug));
  for (const offer of offers) {
    if (out.length >= ENTITY_DRAFTS_MOST) break;
    const e = byKey.get(offer.key);
    if (e === undefined || !sayable(e.name) || e.lead === null || !/^[a-z][a-z0-9_]*$/u.test(e.list)) continue;
    const base = slugify(e.name);
    if (base === '' || taken.has(base)) continue;
    const { them, own, has } = THEM[e.kind];
    const lead = `${e.lead.label.charAt(0).toUpperCase()}${e.lead.label.slice(1)}: {{${e.list}#${e.seq}.${e.lead.field}}}`;
    const links = e.links.filter((l) => usage.lists.some((x) => x.id === l.list)).slice(0, ENTITY_LINKS_MOST);
    const blocks: Record<string, unknown>[] = [
      { kind: 'note', lead: true, span: 12, body: lead },
      {
        kind: 'cards',
        source: `register.${e.list}`,
        where: `${e.title} is ${e.name}`,
        columns: [{ field: e.title, label: 'Name', as: 'title' }, ...e.facts.map((f) => ({ field: f.field, label: f.label, as: f.as }))],
        limit: 1,
        span: 12,
        empty: `Nothing is kept about ${e.name} yet.`,
      },
      ...links.map((l) => ({
        kind: 'table',
        heading: l.name,
        source: `register.${l.list}`,
        where: `${l.field} ${l.many ? 'has' : 'is'} ${e.name}`,
        order: [{ field: 'seq', dir: 'desc' }],
        limit: 10,
        span: 12,
        empty: `Nothing in ${l.name} names ${e.name} yet.`,
      })),
    ];
    const id = `page.${base}`;
    if (calmFaults([{ id, blocks }]).length > 0) continue;
    const section = usage.pages.find((p) => p.pack !== null && p.registers.includes(e.list))?.title ?? e.listName;
    const said = [
      ...(e.met >= ENTITY_PAGE.met ? [`you have met ${them} ${plural(e.met, 'time')}`] : []),
      ...(e.linked >= ENTITY_PAGE.linked ? [`${plural(e.linked, 'thing')} here ${e.linked === 1 ? 'names' : 'name'} ${them}`] : []),
    ];
    const why = `${opening(joinNames(said))}, and ${has} no page yet.`;
    taken.add(base);
    out.push({
      key: '',
      question: `Give ${e.name} a page of ${own}? ${why}`,
      body_kind: 'arrange',
      body: {
        why: [why],
        pages: [
          {
            id,
            body: {
              page: base,
              title: e.name,
              nav: { section, order: 60 },
              requires: [...new Set([e.list, ...links.map((l) => l.list)])].map((l) => `register.${l}`),
              blocks,
            },
          },
        ],
      },
      by: 'rules',
      rank: offer.rank,
      lapses: offer.lapses,
    });
  }
  return out;
}

/* ── the one queue ───────────────────────────────────────────── */

/**
 * THE ONE COUNT: every arrangement offer that waits on the person now, the pen's and every open one on Decide whoever
 * filed it. The cap reads this and nothing else, so Slash's questions and the pen's never sum past `WAITING_MOST`.
 */
export const waitingCount = (usage: Pick<Usage, 'pen' | 'arranging'>): number => Math.max(0, usage.pen?.waiting ?? 0) + Math.max(0, usage.arranging ?? 0);

/** Why an arrangement Slash drafted is not filed yet: the queue is full. It is held, never dropped, and asked again on a later look. */
export const QUEUE_FULL = `${WAITING_MOST} suggestions to arrange BrainDog already wait for you, so this one waits until one of them is answered.`;

/**
 * What a filed arrangement carries of the queue on its body: its rank on the kernel's scale (`filedRank`) and the last
 * day it waits. Nothing for a draft that is not an arrangement or carries no day.
 */
export const lapsing = (d: Pick<SlashDraft, 'body_kind' | 'rank' | 'lapses'>): { rank?: number; lapses?: string } =>
  d.body_kind !== 'arrange' || d.lapses === undefined ? {} : { rank: filedRank(d.rank ?? 0), lapses: d.lapses };

/**
 * Slash's drafts as they go to Decide through the one queue: every arrangement carries a rank and the day it lapses,
 * and only as many are filed as the one count leaves room for (`roomFor`), the strongest first; the rest are held, each
 * saying why. Anything that is not an arrangement passes as it came, in its place.
 *
 * `asked` IS WHAT DECIDE ALREADY HOLDS: a draft asked before takes no room here, since filing skips it, and so cannot
 * keep a new one out. NOTHING IS TAKEN BACK OR DISPLACED: a lapse stays a computed state (the batch 93 ruling).
 */
export function queueFiling(
  usage: Pick<Usage, 'at' | 'pen' | 'arranging'>,
  drafts: readonly SlashDraft[],
  asked: (d: SlashDraft) => boolean = () => false,
): { file: SlashDraft[]; held: { question: string; why: string }[] } {
  const lapses = lapsesFrom(readAt(usage));
  const dated = drafts.map((d) => (d.body_kind === 'arrange' ? { ...d, rank: d.rank ?? 0, lapses: d.lapses ?? lapses } : d));
  const asks = dated.filter((d) => d.body_kind === 'arrange' && !asked(d)) as (SlashDraft & { rank: number })[];
  const { wait } = roomFor(asks, waitingCount(usage));
  const waits = new Set<SlashDraft>(wait);
  return { file: dated.filter((d) => !waits.has(d)), held: wait.map((d) => ({ question: d.question, why: QUEUE_FULL })) };
}

/** A skill's moment without what it then does: "when a ticket is opened, to set its priority" is "when a ticket is opened". */
const momentOf = (trigger: string): string => trigger.split(', to ')[0]!.trim();

/**
 * Whether a handoff is about a skill: it says every word of the skill's name (`task-triage` is "task" and "triage"), as
 * a word or the start of one ("triaged"). A run that never says the skill's words did something else.
 */
const namesSkill = (text: string, name: string): boolean => {
  const words = name.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3);
  return words.length > 0 && words.every((w) => new RegExp(`(?<![\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}`, 'iu').test(text));
};

/** A skill's text: when to use it, then its steps, numbered, each as a run wrote it. */
const skillBody = (trigger: string, steps: readonly string[]): string =>
  `Use this skill ${trigger}.\n\n${steps.map((step, i) => `${i + 1}. ${step}`).join('\n')}\n`;

/** Who ships a skill, as a sentence says it: "the Agents add-on", or a use case by its title. */
const shipper = (o: Offered): string => (o.kind === 'pack' ? `the ${o.title} add-on` : o.title);
const capital = (said: string): string => said.charAt(0).toUpperCase() + said.slice(1);

/** The version a shipped skill is at: its `rev`, or 1 when it says none. */
const shippedRev = (rev: number | undefined): number => (typeof rev === 'number' && Number.isInteger(rev) && rev >= 1 ? rev : 1);

/** Each draft keyed by what its body is about, the key a filed question is recognised by. */
/* A PEN SIGNATURE IS KEPT (offer-pen-50): its body's why holds a count that changes, so keyed by the body a page Slash
   was told No about was asked again. */
const keyed = (drafts: readonly SlashDraft[]): SlashDraft[] => drafts.map((d) => (d.key.startsWith('page:') ? d : { ...d, key: stableKey(d.body) }));

/* ── a model, when one is configured ───────────────────────────────────── */

/**
 * A model Slash may ask to draft proposals. THE PORT, NOT A PROVIDER: the host builds one from a person's own key or a self-host's
 * endpoint, and this package never sees either. It is handed the reading, what was noticed, the rules' drafts and what is on
 * offer, and answers raw drafts. It writes nothing: what it answers is checked by `fromModel` and filed, if at all, through
 * the same `prepare` a token's proposal goes through, or for a `change` the same `kernel.propose` an agent's goes through.
 */
export interface SlashModel {
  /** A short name to say who drafted, such as `endpoint` or `own key`. Never a key or an address. */
  readonly name: string;
  draft(input: SlashModelInput): Promise<unknown>;
  /**
   * A first plan for what the person said, in the lists a use case forms (`formedRows` checks the answer). OPTIONAL: a model
   * without it forms nothing, and the use case's own plan stands.
   */
  form?(input: SlashFormInput): Promise<unknown>;
  /**
   * A skill's next version from the learnings that bear on it (`skillDraftOf` checks the answer). OPTIONAL: a model without
   * it drafts no skill, and the daily look's log says so. The host passes `@braindog/slash`'s `SKILL_DRAFT_INSTRUCTIONS`.
   */
  skill?(input: SkillDraftInput): Promise<unknown>;
  /**
   * One plain line a page saying what matters now, from its lead note's figures (`headlineFault` checks each line).
   * OPTIONAL: a model without it writes no headline, and each page's lead note says the rules' line as it always has. The
   * host answers `{"lines":{"<page>":"..."}}`, or for a page handed its blocks `{ headline, order, next }` in place of the
   * line (`compose-look.ts` checks the rest), and passes `@braindog/host`'s `SLASH_HEADLINE_INSTRUCTIONS`.
   */
  headline?(input: HeadlineInput): Promise<unknown>;
  /**
   * The day's briefing as cards (`briefing.ts`): `{ cards: [{ h, line }] }` over the facts handed in, by their
   * handles. OPTIONAL: a model that writes none is asked nothing and the rules' cards stand (`brief-write.ts`). A host
   * passes `@braindog/host`'s `SLASH_BRIEF_INSTRUCTIONS`.
   */
  brief?(input: BriefInput): Promise<unknown>;
  /**
   * The written brief (`written-brief.ts`): `{ sentences: ["..."] }` over the facts handed in, a figure said as a hole
   * `{{<handle>.<figure>}}`. OPTIONAL: a model without it writes none, and the cards above stand as before.
   */
  written?(input: WrittenInput): Promise<unknown>;
}

export type SlashModelInput = {
  usage: Usage;
  noticed: readonly Noticed[];
  rules: readonly { question: string; body_kind: string; body: Record<string, unknown> }[];
  offered: readonly { id: string; kind: string; title: string }[];
  /** The kinds it may answer, and how many at most. */
  kinds: readonly SlashKind[];
  most: number;
  /** The add-ons and skills the record found in what it holds (`reach.ts`), handed to the daily look to rank with the rest; it invents none. */
  reach?: readonly { key: string; title: string; why: string; change: Record<string, unknown> }[] | undefined;
  /**
   * What the owner typed on the Slash page, trimmed, when they described what they want: "a desk for my launch, in five
   * parts, with the next step on each". ABSENT ON THE DAILY LOOK AND A PLAIN PRESS, which draft from use alone.
   *
   * PRESENT, IT IS THE REQUEST AND USE IS ONLY THE SETTING. The instructions (`SLASH_INSTRUCTIONS` in `@braindog/host`) have
   * the model answer `change`s that build the lists, figures and pages described, and the record files only what it
   * drafted from it: a plain press's rules would otherwise fill Decide with questions nobody asked for, in the slots the
   * description needed (`test/slash-asked.test.ts`).
   */
  asked?: string;
  /**
   * PRESENT WHEN THE ONE ASKING IS HELD FROM SOME LIST, and `usage` leaves those lists out (`readUsage`'s `reads`). Then
   * `rules` is empty and `noticed` says nothing of the whole record (`noticeUsage`'s `partial`), and the instructions
   * have the model conclude nothing from a count or an absence, which over a partial reading would be false.
   */
  partial?: true;
  /**
   * THE GRAMMARS A DESCRIPTION IS DRAFTED IN, present whenever `asked` is (`describedGrammar` in `grammar.ts`). The
   * instructions named grammars and the record sent none of them, so a list's keys were learnt from the refusals Decide
   * showed the owner.
   */
  grammar?: { page: unknown; register: unknown; metric: unknown; rule: unknown; ingest?: unknown; design?: readonly string[] };
  /** The page a description is about, as it is declared (a page drawn per row is its template's declaration). */
  page?: { id: string; body: unknown };
  /**
   * PRESENT ON A REPAIR ASK ONLY: the drafts the record refused, as the model answered them, and every refusal with its
   * `at` path, so the model answers those drafts again, mended. At most `SLASH_REPAIRS_MOST` per press (`describe`).
   */
  repair?: { drafts: readonly unknown[]; refusals: readonly { at: string; fix: string }[] };
  /**
   * PRESENT ON A TRY AGAIN ONLY (§45 "Keep, Try again and Throw away"): the drafts he was shown for the same words and
   * turned down, as the model would answer them, so it drafts another way. At most `SLASH_DECLINED_MOST`, and a draft
   * that is one of them again is dropped (`describe`).
   */
  declined?: readonly { question: string; body_kind: 'change'; body: { to: unknown } }[];
  /**
   * THE LOOKS HE INSTALLED AND MAY TRY, by name with the id as its handle (`theme-pick.ts` `looksOf`, less the one he is
   * drawn in). A model may answer one as `{ body_kind: 'settings', body: { look: { theme: '<id>' } } }`, and only one of
   * these is kept (`lookDraft`): a theme is picked, never designed. Absent, no look is offered.
   */
  looks?: readonly { id: string; name: string }[];
};

/**
 * The longest description the owner may type. A sentence or a few, which is what the ask field is for: the owner's own
 * example of a launch desk is 124 characters, so a thousand leaves room for a page spelled out part by part. It goes
 * into the model's input whole and is billed with it, so the bound is on what one ask may spend as much as on what
 * reads well.
 */
export const SLASH_ASKED_MOST = 1_000;

/** The most drafts a Try again hands back as turned down: the ones shown for the same words, newest kept. */
export const SLASH_DECLINED_MOST = 3;

/** What a Try again said was turned down, as `slashDraft` takes it: each draft's question and the change it would make. */
export type SlashDeclined = { question: string; change: { to: unknown } };

/**
 * The refusal a Try again's `not` earns, or `null` when it is a list of drafts as `slashDraft` answered them. More than
 * `SLASH_DECLINED_MOST` are cut to the newest, never refused, since a sheet that tried many times still asks once more.
 */
export function declinedFault(v: unknown): string | null {
  if (!Array.isArray(v)) return 'not is the drafts you turned down, each with its question and change, as Slash answered them.';
  for (const d of v) {
    const x = d as { question?: unknown; change?: { to?: unknown } } | null;
    if (x === null || typeof x !== 'object' || typeof x.question !== 'string' || x.change === null || typeof x.change !== 'object' || x.change.to === null || typeof x.change.to !== 'object')
      return 'not is the drafts you turned down, each with its question and change, as Slash answered them.';
  }
  return null;
}

/** A Try again's turned-down drafts as the model is handed them: the newest `SLASH_DECLINED_MOST`, each as it answered one. */
export const declinedInput = (not: readonly SlashDeclined[]): NonNullable<SlashModelInput['declined']> =>
  not.slice(-SLASH_DECLINED_MOST).map((d) => ({ question: d.question.trim().slice(0, 280), body_kind: 'change' as const, body: { to: d.change.to } }));

/** How many descriptions `describedPresses` remembers what it filed from, oldest let go first. */
const DESCRIBED_KEPT = 50;

/**
 * What stops a description reaching the model before anything is spent, and one ask per description at a time.
 *
 * NOTHING WAS CHECKED BEFORE THE SPEND. Measured: twenty presses of one description made twenty model calls and twenty
 * ledger rows and filed one question, since every answer after the first was "asked before"; with three of Slash's
 * questions already waiting, eight presses made eight calls and filed `[1,1,1,0,0,0,0,0]`, the last five spent on
 * answers the cap then skipped. The ledger held the month's ceiling throughout, so this is about the asks under it,
 * which are shared with a person's reads at the palette and an automation's questions.
 *
 * `held` answers why this description is not sent now, or `null`: Decide full, or the same words already filed and still
 * waiting there. `waiting` IS THE ONE COUNT (`waitingCount`), or Slash's own open questions where those are
 * more, so the pen's three and Slash's are one three here too, and the sentence keeps its words. The words are compared as typed, less case and spacing. `once` makes presses of one description sent
 * together one ask whose answer they share, since each of them would otherwise pass `held` before the first had filed;
 * `who` keeps two callers held to different reads from sharing an answer drawn from the other's reading.
 *
 * A MAP IN MEMORY AND NOT A ROW, because it saves asks and guards nothing: the ledger is the cap, and a host that forgets
 * this on a restart spends at most one ask again per description.
 */
export function describedPresses<T>() {
  const said = (asked: string): string => asked.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
  const pending = new Map<string, Promise<T>>();
  const filedFrom = new Map<string, readonly string[]>();
  return {
    held(asked: string, waiting: number, stillWaiting: (key: string) => boolean): string | null {
      /* THE CAP IS THE QUEUE'S (`SLASH_OPEN_CAP` is `WAITING_MOST`), read over the count the caller hands. */
      if (waiting >= SLASH_OPEN_CAP)
        return `${SLASH_OPEN_CAP} of Slash's questions are already waiting on Decide, so nothing was drafted from what you described. Answer one of them, then ask again.`;
      const keys = filedFrom.get(said(asked));
      if (keys !== undefined && keys.length > 0 && keys.every(stillWaiting))
        return 'You described this already, and what Slash drafted from it is waiting on Decide, so the model was not asked again.';
      return null;
    },
    filed(asked: string, keys: readonly string[]): void {
      if (keys.length === 0) return;
      filedFrom.delete(said(asked));
      filedFrom.set(said(asked), keys);
      if (filedFrom.size > DESCRIBED_KEPT) filedFrom.delete(filedFrom.keys().next().value as string);
    },
    once(asked: string, who: string, press: () => Promise<T>): Promise<T> {
      const key = `${who}\n${said(asked)}`;
      const out = pending.get(key);
      if (out !== undefined) return out;
      const run = press().finally(() => pending.delete(key));
      pending.set(key, run);
      return run;
    },
  };
}

/** What a model may draft: the three that arrange what is installed, and a `change` that builds one declaration. */
export type SlashKind = 'pack' | 'settings' | 'arrange' | 'change';

const QUESTION_MAX = 280;

/**
 * THE DECLARATIONS A MODEL MAY BUILD WITH A `change`: a list, a door in or out, a rule, a figure, a page. A gold rate
 * on a schedule is an `ingest` into a register, and before this Slash dropped it with "Slash files only pack, settings
 * and arrange", so the one use case the owner named could not be built by Slash.
 *
 * A METRIC JOINED LATER. A page that opens on "1 of 2 steps are done" says a figure, and a figure is a metric: with
 * `metric` left out, a model that drafted the figure beside the page had it dropped as "Proposal 1 was a change to a
 * metric, and Slash changes only a register, an ingest, a rule or a page", while the page itself was filed and would
 * have answered nothing where the number goes (`test/slash-asked.test.ts`). The old reason for leaving it out, that
 * nothing Slash reads says what a figure should be, stopped holding once the owner can describe the page they want: the
 * description says it.
 *
 * A SCRIPT JOINED AFTER THAT. "Fetch the price hourly into Rates" is a script: a clock, the origin it fetches from, and
 * the list it writes. With `script` left out, Slash dropped that answer as a change to a script, so the owner's own
 * example could not be drafted at all. Its every reach beyond the record is in its header, `egress` and `keys`
 * (`scriptBody` in `kernel/src/script.ts`), which the kernel refuses when computed and prints as the outside calls line
 * Decide draws (`egressOf`), so where it sends is never the model's to leave unsaid. Filing it runs nothing: a clock is
 * armed only when the owner accepts, and a trial is `scriptTry`, which nothing here calls. Its `keys` stay empty: one
 * naming a key is dropped (`KEYED_SCRIPT`), and neither its own prefs nor its settings door is any draft's to reach
 * (`ownLoopFault`).
 *
 * A THEME IS PICKED, NEVER DESIGNED. A draft may offer one of the looks the record has installed (`lookDraft`), filed as
 * a `settings` question that sets the owner's own `look.theme` on his yes; a new theme is not a kind here, because
 * nothing Slash reads or hears says what one should look like. A digest and a block stay a person's or an agent's: a
 * digest would send notices, which only his word turns on, and `kernel.propose` reviews a metric exactly as it reviews
 * the page beside it.
 */
const BUILDS: ReadonlySet<string> = new Set(['register', 'ingest', 'rule', 'metric', 'page', 'script']);

/** "a register", "an ingest": the article a kind takes when a dropped line names it. */
const aKind = (kind: string): string => `${/^[aeiou]/u.test(kind) ? 'an' : 'a'} ${kind}`;

/**
 * WHAT A DESCRIPTION MAY BUILD: `BUILDS`, EACH HELD TO WHAT IT MAY REACH. Measured: the record filed an abused model's
 * answer to "A desk for my launch" as one change holding `ingest.launchsync`, a call to collector.evil.example sending
 * payroll's names and salaries, under the question "Build the launch desk you described?". `SLASH_INSTRUCTIONS` told
 * the model to answer only lists, figures, pages and rules here, and nothing in the record held it to that.
 *
 * A SCRIPT IS LET THROUGH, HELD TO WHAT `describedScript` ALLOWS. An owner asking for something fetched is asking for
 * exactly the call a script makes, its origins and keys are written in its header where the kernel checks them, and the
 * record says them in the question in its own words (`scriptSays`). What stays out is what that abused answer used:
 * rows handed to code that fetches.
 *
 * AND SO IS AN INGEST THAT ONLY READS. "Fetch the rate hourly" is a poll: one address read on a clock and written into
 * a list, which is a script's fetch with no code in it. Held to `describedIngest`, it sends no row and takes nothing
 * anybody posts, and the record says where it fetches from, which key goes with it and which list it writes
 * (`ingestSays`). A door others post to and a call that sends are still the abused answer's shape and are asked for on
 * their own, where the question is about the door.
 */
const DESCRIBED_BUILDS: ReadonlySet<string> = new Set(['register', 'ingest', 'rule', 'metric', 'page', 'script']);

/**
 * The channels of a door a description may open: `poll` reads one address on a clock and `pull` reads a service a page at
 * a time (`INGEST` in `grammar.ts`). Neither sends a row of the record, which a `call` does, and neither is an address the
 * outside posts into, which a `webhook` is.
 */
const READS_IN: ReadonlySet<string> = new Set(['poll', 'pull']);

/**
 * The verbs by which a rule reaches beyond the record, and what each would do, in a dropped line. `run` starts an
 * ingest or an action that calls out, `call` is a step's own request, and `ask_slash` sends rows to a model. A rule a
 * description builds acts inside the record or is not filed: the same abused answer's bundle paired its ingest with a
 * rule that ran it.
 *
 * AND `script`, WHICH WAS LEFT OFF: a script fetches from the origins its own `egress` names (`kernel/src/script.ts`) and
 * `input:` hands it the row, so a rule starting one on each new Payroll row was filed under a description until it was
 * added here (`test/slash-asked.test.ts`).
 */
export const REACHES_OUT: Readonly<Record<string, string>> = {
  run: 'run something beyond BrainDog',
  call: 'call out beyond BrainDog',
  ask_slash: "send rows to Slash's model",
  script: 'start a script that may fetch beyond BrainDog',
  run_job: "start a job on the owner's machine",
};

/** The first verb in `REACHES_OUT` anywhere in a declaration's body, its steps and branches included. */
function reachesOut(value: unknown, depth = 0): string | null {
  if (value === null || typeof value !== 'object' || depth > 32) return null;
  for (const [k, v] of Object.entries(value)) {
    /* `Object.hasOwn` AND NOT `in`, because the key is the model's: `in` finds `toString` on every object, so a step
       keyed `toString` would be read as a verb that reaches out, and its sentence would name a function. */
    if (!Array.isArray(value) && Object.hasOwn(REACHES_OUT, k)) return k;
    const inner = reachesOut(v, depth + 1);
    if (inner !== null) return inner;
  }
  return null;
}

/** What a draft that would reach Slash's own limits is dropped with. */
export const OWN_LIMITS = 'Slash does not change its own limits.';

/**
 * What names Slash's own loop in a key or a text: its prefs (`slash.reads`, `slash.daily`), the ladder's (`ladder:…`) and
 * the rule that answers for it, the settings door (`/api/slash/settings`, `slash_settings`, `ask_cap`, `think_cap`) and
 * the ladder's thresholds by name. NOT PRECEDED BY A DOT, A SLASH OR AN `@`, so an address at `slash.example` is a host.
 */
const OWN_LOOP = [
  /(?<![\w./@-])(?:slash|ladder)[.:][a-z_]+/iu,
  /\brule:ladder\b/iu,
  /\/slash\/(?:settings|setup)\b/iu,
  /\b(?:slash_settings|ask_cap|think_cap)\b/iu,
  /\b(?:offer_after|offer_days|declines_drop|anomaly_writes|anomaly_ms)\b/iu,
];
/** The parts of a `pack` or `settings` body that name a pack: Slash's own is never a draft's to arrange. */
const NAMES_PACK: ReadonlySet<string> = new Set(['pack', 'install', 'enable', 'disable']);

/**
 * Why a draft is dropped for reaching Slash's own loop, or `null` ("Slash never drafts a change to
 * its own loop, thresholds or budget"). Its budget was reached only by the owner's settings door, and nothing failed if a
 * draft named it: a settings line raising `ask_cap`, a rule writing `slash.reads`, a script fetching the settings door.
 * EVERY KEY AND EVERY TEXT of the body is read, its declarations, steps and settings included, as `reachesOut` reads a
 * rule, and run on every draft before it is filed: a model's (`modelDraft`) and the rules' (`noticeUsage`).
 */
export function ownLoopFault(draft: { body_kind?: unknown; body?: unknown }): string | null {
  const walk = (value: unknown, depth: number): boolean => {
    if (typeof value === 'string') return OWN_LOOP.some((re) => re.test(value));
    if (value === null || typeof value !== 'object' || depth > 32) return false;
    for (const [k, v] of Object.entries(value)) {
      if (!Array.isArray(value) && (OWN_LOOP.some((re) => re.test(k)) || (NAMES_PACK.has(k) && v === SLASH))) return true;
      if (walk(v, depth + 1)) return true;
    }
    return false;
  };
  return walk(draft.body, 0) ? OWN_LIMITS : null;
}

/** How the owner calls each kind a description builds, in the line the record writes about what exists. */
const OWNERS_WORD: Readonly<Record<string, string>> = { register: 'list', ingest: 'door', metric: 'figure', page: 'page', rule: 'rule', script: 'script' };

/**
 * A list a model's header names, AS A PERSON CALLS IT: `checks` is Checks and `card_alerts` Card alerts, which is the name
 * a list declared with none of its own goes by. Decide drew "read your list "checks"", the system's word for the thing
 * and the id in quotes; a question names the person's own things. Cut to a length, because the header is the model's.
 */
const listNamed = (id: string): string => {
  const words = id.slice(0, 40).replaceAll('_', ' ').trim();
  return words === '' ? words : `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
};

/** The strings of a header's list, such as a script's `egress` or `writes`, and nothing else in it. */
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);

/**
 * Whether any string in a change body and the declarations it carries, or any key of one of its objects, looks like a key.
 *
 * A KEY IS NAMED BY ITS LABEL AND NEVER WRITTEN OUT. A script's `keys` are keychain labels the host opens for one request, and
 * `scriptBody` checks only their length, so a model that wrote a provider's key into `source`, into a fetch's headers or
 * in place of a label would have filed it into the proposal's body, where Decide draws it and the record keeps it. Every
 * kind is read and not only a script, because an ingest's address and a page's note are text a model writes as freely.
 *
 * THE KERNEL'S OWN WALK, READ THROUGH `coerce` AS A `json` VALUE, because that arm refuses exactly a value holding a key
 * and nothing else. A second walk here would be a second answer to one question, and the kernel's keeps its own stack,
 * so a body nested deeper than a recursion reaches is read to the bottom rather than throwing `RangeError` out of Slash.
 */
const holdsKey = (value: unknown): boolean => !coerce({ id: 'change', type: 'json' }, value).ok;

/**
 * Why a script drafted from a description is dropped, or `null` when it may be filed.
 *
 * ON ITS CLOCK ONLY. `runs.door` hands it each arrival at a door and `runs.rule` lets a rule hand it a row, and a row
 * handed to code that fetches beyond the record is the abused answer's shape, where a rule sent each new row of a list
 * to a collector. Either is asked for on its own, as an ingest is.
 *
 * AND IT READS NO LIST, WHEN IT FETCHES. `reads` are the lists `ctx.record` may read while it runs, and read by code that
 * also fetches they are rows that can leave in the next request. The list it writes is no exception: writing grants no
 * read (`registers` is `reads` alone in `@braindog/host`'s `script.ts`), and the list a model names to write can be one
 * the owner already keeps, so a script reading Payroll, writing Payroll and fetching from a collector would have been
 * filed as "reads only what it writes". Fetching a figure into a list needs no read at all.
 */
function describedScript(d: { id?: unknown; body?: unknown }, n: number): string | null {
  const body = (d.body ?? {}) as { runs?: unknown; reads?: unknown; egress?: unknown };
  const id = String(d.id ?? 'a script').slice(0, 80);
  const runs = body.runs;
  const starts = runs !== null && typeof runs === 'object' && !Array.isArray(runs) ? Object.keys(runs) : [];
  if (starts.some((k) => k !== 'every'))
    return `Proposal ${n} has ${id}, which a door or a rule would start, and from a description Slash builds a script that runs only on its clock. Ask for it on its own.`;
  const read = strings(body.reads)[0];
  if (read !== undefined && strings(body.egress).length > 0)
    return `Proposal ${n} has ${id}, which would read ${listNamed(read)} and fetch beyond BrainDog, and Slash never sends what you keep out from a description. Ask for it on its own.`;
  return null;
}

/**
 * What a script would do on its own once accepted, in the record's words, added to the question Decide draws.
 *
 * THE MODEL'S QUESTION NAMES ONLY WHAT IT CHOOSES TO. The abused answer's was "Build the launch desk you described?"
 * over a change that called a collector, so which lists a script reads, where it fetches from and which lists it
 * writes are said here from its own header, on every path, beside the kernel's line under "Calls out" (`egressOf`).
 * Every start the header names is said, because a script with a clock and a door runs on both. The header is the
 * model's, so each name is cut to a length; a header the kernel then refuses is never filed, and neither is this line.
 * No key is said, because a script naming one is never filed (`KEYED_SCRIPT`).
 */
function scriptSays(d: { id?: unknown; body?: unknown }): string {
  const body = (d.body ?? {}) as { runs?: unknown; egress?: unknown; reads?: unknown; writes?: unknown };
  const id = String(d.id ?? '');
  const bare = id.slice(id.indexOf('.') + 1).slice(0, 40);
  const hosts = strings(body.egress).map((o) => o.replace(/^https:\/\//iu, '').slice(0, 80));
  const reads = strings(body.reads).map(listNamed);
  const writes = strings(body.writes).map(listNamed);
  const runs = (body.runs !== null && typeof body.runs === 'object' ? body.runs : {}) as { every?: unknown; at?: unknown; door?: unknown; rule?: unknown };
  const when = [
    ...(typeof runs.every === 'string' ? [`every ${runs.every.slice(0, 16)}${typeof runs.at === 'string' ? ` at ${runs.at.slice(0, 5)}` : ''}`] : []),
    ...(typeof runs.door === 'string' ? [`on each arrival at the door "${runs.door.slice(0, 40)}"`] : []),
    ...(runs.rule === true ? ['whenever a rule starts it'] : []),
  ];
  const does = [
    ...(reads.length > 0 ? [`read ${joinNames(reads)}`] : []),
    ...(hosts.length > 0 ? [`fetch from ${joinNames(hosts)}`] : []),
    ...(writes.length > 0 ? [`write to ${joinNames(writes)}`] : []),
  ];
  return `Accepting it lets the script "${bare}" ${does.length > 0 ? joinNames(does) : 'run'} ${joinNames(when)} on its own.`;
}

/** What a script that would send one of his keys is dropped with. Said as it is, never numbered. */
export const KEYED_SCRIPT = 'It would send one of your keys, and a script Slash writes uses none. Ask an agent, or write it yourself.';

/** Whether a script's `keys` names any: a list with an entry, or anything else written there but nothing. */
const namesKey = (keys: unknown): boolean => keys !== undefined && keys !== null && !(Array.isArray(keys) && keys.length === 0) && keys !== '';

/** An object's own keys, or none for anything else, so a header's nested part is read without a cast at every step. */
const partOf = (value: unknown): Record<string, unknown> => (value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

/**
 * Why a door drafted from a description is dropped, or `null` when it may be filed: it reads on a clock (`READS_IN`) or
 * it is not filed. WHAT A POLL MAY CARRY IS THE KERNEL'S TO SAY, and it refuses a `trigger` or a `sends` on one
 * (`ingestBody` in `kernel/src/declare.ts`), so a reading door can never be the call the abused answer filed.
 */
function describedIngest(d: { id?: unknown; body?: unknown }, n: number): string | null {
  const channel = partOf(d.body).channel;
  if (typeof channel === 'string' && READS_IN.has(channel)) return null;
  return `Proposal ${n} would open ${String(d.id ?? 'an ingest').slice(0, 80)}, a door that sends out or that others post to, and from a description Slash opens only one that fetches on a clock. Ask for it on its own.`;
}

/**
 * What a reading door would do on its own once accepted, in the record's words, added to the question Decide draws, as
 * `scriptSays` says a script's header. The model's question names only what it chooses to, so the host it fetches from,
 * how often, the key sent with each request and the list it writes are read from the body itself. Only a `poll` or a
 * `pull` is said here: every other door is either dropped from a description or said by the kernel's outside calls line.
 */
function ingestSays(d: { id?: unknown; body?: unknown }): string | null {
  const body = partOf(d.body);
  if (typeof body.channel !== 'string' || !READS_IN.has(body.channel)) return null;
  const pulled = partOf(body.fetch);
  const address = typeof body.url === 'string' ? body.url : typeof pulled.base === 'string' ? pulled.base : '';
  let host = '';
  try {
    host = new URL(address).host.slice(0, 80);
  } catch {
    /* AN ADDRESS THAT IS NOT ONE is the kernel's to refuse, and the line then says only what else the body names. */
  }
  const every = typeof body.every === 'string' ? body.every : partOf(pulled.schedule).every;
  const grant = typeof body.grant === 'string' ? body.grant : partOf(pulled.auth).grant;
  const list = partOf(body.writes).register;
  const id = String(d.id ?? '');
  const bare = id.slice(id.indexOf('.') + 1).slice(0, 40);
  const does = [
    `fetch${host === '' ? '' : ` from ${host}`}${typeof every === 'string' ? ` every ${every.slice(0, 16)}` : ''}`,
    ...(typeof list === 'string' ? [`write what it reads to ${listNamed(list)}`] : []),
  ];
  const sent = typeof grant === 'string' ? `, sending your key "${grant.slice(0, 40)}" with each request` : '';
  return `Accepting it lets the door "${bare}" ${joinNames(does)} on its own${sent}.`;
}

/**
 * A model's `change` body as the kernel takes it, or why it is dropped. `to` is one declaration or `{ declarations }` of
 * them, and every one must be a kind in `BUILDS`. `declaration_id` is filled from `to` when the model left it out, as the
 * kernel's `namesFault` would otherwise refuse it; a wrong one is left for the kernel to refuse with its own sentence.
 *
 * WHAT IT SENDS OUT IS LEFT TO THE KERNEL, WHICH IS THE GUARD. `kernel.propose` drops whatever `egress` and `approve` a
 * proposer wrote and stores its own review of the declarations (`kernel/src/govern.ts`). A second strip here was measured
 * to change nothing: with it removed the gold-rate test still found no trace of the model's host in the filed row, and
 * `stableKey` never reads either field, so a model that varies the egress it writes is still asked once.
 *
 * `described` IS A CHANGE DRAFTED FROM WHAT THE OWNER TYPED, held to `DESCRIBED_BUILDS`, to a rule that stays inside
 * the record and to a door that only reads, and `says` is what the record itself adds to the question about what
 * already exists: the declarations it would replace, and the existing list a rule would change rows of. The same abused
 * answer filed `page.home` at version 1, swapped to read Payroll, and Decide drew it as a new page; the question was
 * the model's own words and named nothing it replaced. A script adds its own line on every path, described or not
 * (`scriptSays`), a door drafted from a description adds its own (`ingestSays`), and no change body a model drafts is
 * filed with a key written out in it (`holdsKey`). A door from a plain press keeps the question it always had, with the
 * kernel's outside calls line beside it on Decide, since a press drafts from how the record is used and not from words
 * anybody typed.
 */
function changeBody(
  body: Record<string, unknown>,
  n: number,
  drawn?: (id: string) => number,
  described = false,
): { ok: true; body: Record<string, unknown>; says: string[] } | { ok: false; why: string } {
  const to = body.to;
  if (to === null || typeof to !== 'object' || Array.isArray(to)) return { ok: false, why: `Proposal ${n} was a change with no declaration in it.` };
  const bundle = (to as { declarations?: unknown }).declarations;
  const listed = (Array.isArray(bundle) ? bundle : [to]) as { id?: unknown; kind?: unknown; body?: unknown }[];
  if (listed.length === 0) return { ok: false, why: `Proposal ${n} was a change with no declaration in it.` };
  const stray = listed.find((d) => typeof d?.kind !== 'string' || !BUILDS.has(d.kind));
  if (stray !== undefined)
    return { ok: false, why: `Proposal ${n} was a change to ${aKind(String(stray?.kind ?? 'unnamed kind')).slice(0, 40)}, and Slash changes only a register, an ingest, a rule, a metric, a page or a script.` };
  /* A SCRIPT SLASH WRITES SENDS NONE OF HIS KEYS ("F8 Slash scripts proposal-only no keychain keys"). The question
     used to say "sending your key ..." and file it; on any path, pressed or described, one naming a key is dropped. */
  if (listed.some((d) => d.kind === 'script' && namesKey(partOf(d.body).keys))) return { ok: false, why: KEYED_SCRIPT };
  /* THE WHOLE BODY AND NOT ONLY ITS DECLARATIONS, because every key a model writes beside `to` is filed with it (the
     kernel drops only `egress`, `approve` and `from_version`). THE SENTENCE NAMES NO DECLARATION, because the id is the
     model's too, and an id that is the key would be the key said back on the Slash page. */
  if (holdsKey(body))
    return {
      ok: false,
      why: `Proposal ${n} holds something shaped like a key. A key stays in the keychain and a change names it by its label, so Slash files none written out.`,
    };
  const says: string[] = [];
  if (described) {
    /* THE SET IS ASKED AND NOT ASSUMED, though today it is `BUILDS` whole, so a kind that joins `BUILDS` for a press
       reaches a description only when somebody adds it here and says what holds it. */
    const other = listed.find((d) => !DESCRIBED_BUILDS.has(String(d.kind)));
    if (other !== undefined)
      return { ok: false, why: `Proposal ${n} was a change to ${aKind(String(other.kind)).slice(0, 40)}, which Slash does not build from a description. Ask for it on its own.` };
    for (const d of listed) {
      const verb = d.kind === 'rule' ? reachesOut(d.body) : null;
      if (verb !== null)
        return {
          ok: false,
          why: `Proposal ${n} has ${String(d.id ?? 'a rule').slice(0, 80)}, which would ${REACHES_OUT[verb]}, and Slash never opens a door to the outside from a description. Ask for it on its own.`,
        };
      const held = d.kind === 'script' ? describedScript(d, n) : d.kind === 'ingest' ? describedIngest(d, n) : null;
      if (held !== null) return { ok: false, why: held };
    }
    if (drawn !== undefined) {
      const bare = (id: unknown): string => String(id ?? '').slice(String(id ?? '').indexOf('.') + 1);
      const replaced = listed
        .filter((d) => drawn(String(d.id ?? '')) > 0)
        .map((d) => (d.kind === 'register' ? listNamed(bare(d.id)) : `your ${OWNERS_WORD[String(d.kind)]} "${bare(d.id)}"`));
      if (replaced.length > 0) says.push(`Accepting it replaces ${joinNames(replaced)} as ${replaced.length === 1 ? 'it is' : 'they are'} now.`);
      for (const d of listed) {
        const over = d.kind === 'rule' ? (d.body as { register?: unknown } | null)?.register : undefined;
        if (typeof over === 'string' && drawn(`register.${over}`) > 0)
          says.push(`Accepting it lets the rule "${bare(d.id)}" change what is in ${listNamed(over)} on its own.`);
      }
    }
  }
  for (const d of listed) {
    const said = d.kind === 'script' ? scriptSays(d) : described && d.kind === 'ingest' ? ingestSays(d) : null;
    if (said !== null) says.push(said);
  }
  const named = typeof body.declaration_id === 'string' ? body.declaration_id : String(listed[0]?.id ?? '');
  /* THE VERSION EACH DECLARATION WAS DRAWN FROM IS THE READING'S, AND WHATEVER THE MODEL WROTE IS REPLACED. The reading a
     model is handed names no version, so a number it writes is a guess, and the likeliest guess is the version live when
     it answers, which is exactly the stamp that let a stale body land (`drawnVersions`). A bundle names every member, as
     the kernel reads `{ declarations }` (`govern.ts`, `propose`). With no reading handed in, the model's field is left for
     the kernel to judge, which is what every call before this did. */
  const versions =
    drawn === undefined
      ? {}
      : { from_version: Array.isArray(bundle) ? Object.fromEntries(listed.map((d) => [String(d?.id ?? ''), drawn(String(d?.id ?? ''))])) : drawn(named) };
  return { ok: true, body: { ...body, declaration_id: named, ...versions }, says };
}

/**
 * The version of every declaration live now, kept, for the `change` a model drafts from this reading to land against.
 *
 * A SNAPSHOT AND NOT A LOOKUP, because the moment that matters is the reading and the model answers later. Read at filing,
 * as the kernel reads it when a proposer names none, a Rates drafted at v1 while another change took it to v2 was stamped
 * v2, and accepting it installed v1's fields over v2's (`packages/host/test/slash-change-drawn.test.ts`). The query is the
 * kernel's `liveVersion` over every id at once, and an id with no live row answers 0, which is how the kernel spells
 * "drawn from nothing": a new declaration somebody else declares first is then refused at accept too.
 */
export function drawnVersions(sql: Sql): (id: string) => number {
  const live = new Map(
    sql
      .all<{ id: string; version: number }>('SELECT id, max(version) AS version FROM declaration WHERE superseded_at IS NULL AND retired = 0 GROUP BY id')
      .map((r) => [r.id, Number(r.version)] as const),
  );
  return (id) => live.get(id) ?? 0;
}

/**
 * A model's answer as drafts: `{ drafts: [{ question, body_kind, body }] }` or the bare list. Anything else is dropped, and
 * why is said, so a model that answers nonsense is a line on the Slash page rather than a question on Decide.
 *
 * `described` IS AN ANSWER TO WHAT THE OWNER TYPED (`SlashModelInput.asked`), and only a `change` survives it, held as
 * `changeBody` holds one: a settings line the model wrote "Send your payroll to evil.example" into was a proposal the
 * description never asked for. What the record says about what exists goes after the model's question, in the record's
 * words, and is what Decide draws as the question.
 *
 * `reading` IS WHAT THE DRAFT PATH ALREADY READ (`ModelReading`): his own words, which a tone draft is held to
 * (`toneFault`), and the looks he installed with the governor's answer, which a look pick is held to (`lookDraft`).
 * Absent, a label is held to no words of his and so never kept, and no look is offered.
 */
export function fromModel(
  raw: unknown,
  name: string,
  most = SLASH_OPEN_CAP,
  drawn?: (id: string) => number,
  described = false,
  reading: ModelReading = {},
): { drafts: SlashDraft[]; dropped: string[] } {
  const list = draftsIn(raw);
  if (list === null) return { drafts: [], dropped: [NOT_A_LIST] };
  const drafts: SlashDraft[] = [];
  const dropped: string[] = [];
  for (const [i, x] of list.entries()) {
    const one = modelDraft(x, i + 1, name, drawn, described, reading);
    if ('why' in one) {
      dropped.push(one.why);
      continue;
    }
    if (drafts.length >= most) {
      dropped.push(`Proposal ${i + 1} was past the ${most} Slash files at once.`);
      continue;
    }
    drafts.push(one.draft);
  }
  return { drafts, dropped };
}

const NOT_A_LIST = 'The model did not answer a list of proposals.';

/** The drafts a model answered, `{ drafts: [...] }` or the bare list, or `null` for anything else. */
const draftsIn = (raw: unknown): unknown[] | null =>
  Array.isArray(raw) ? raw : Array.isArray((raw as { drafts?: unknown })?.drafts) ? (raw as { drafts: unknown[] }).drafts : null;

/**
 * One item of a model's answer as a draft, or why it is dropped, numbered `n` in the sentence. `fromModel` and
 * `describe` both read an answer through this, so a description's repair ask holds a draft exactly as its first ask.
 */
function modelDraft(
  x: unknown,
  n: number,
  name: string,
  drawn: ((id: string) => number) | undefined,
  described: boolean,
  reading: ModelReading = {},
): { draft: SlashDraft } | { why: string } {
  const d = x as { question?: unknown; body_kind?: unknown; body?: unknown };
  if (typeof d?.question !== 'string' || !d.question.trim() || d.question.length > QUESTION_MAX)
    return { why: `Proposal ${n} had no question, or one over ${QUESTION_MAX} characters.` };
  if (d.body_kind !== 'pack' && d.body_kind !== 'settings' && d.body_kind !== 'arrange' && d.body_kind !== 'change')
    return { why: `Proposal ${n} was a ${String(d.body_kind)} proposal, and Slash files only pack, settings, arrange and change.` };
  if (d.body === null || typeof d.body !== 'object' || Array.isArray(d.body)) return { why: `Proposal ${n} had no body.` };
  const own = ownLoopFault(d);
  if (own !== null) return { why: own };
  if (described && d.body_kind !== 'change')
    return { why: `Proposal ${n} was a ${d.body_kind} proposal, and from a description Slash files only a change that builds a list, a figure, a page, a rule, a script or a door that fetches on a clock.` };
  let body = d.body as Record<string, unknown>;
  let question = d.question.trim();
  if (d.body_kind === 'change') {
    const built = changeBody(body, n, drawn, described);
    if (!built.ok) return { why: built.why };
    body = built.body;
    if (built.says.length > 0) question = `${question} ${built.says.join(' ')}`;
  }
  /* A LOOK IS PICKED FROM WHAT IS INSTALLED, and its question is the record's, in the look's name (`lookDraft`). */
  if (d.body_kind === 'settings' && Object.hasOwn(body, 'look')) return lookDraft(body, n, name, reading);
  /* AND A WORD OF HIS IS ONLY EVER HIS: a label in words he never wrote, or a line holding a number, drops it whole. */
  if (d.body_kind === 'settings' || d.body_kind === 'pack') {
    const tone = toneFault(body, n, reading.usage === undefined ? [] : ownWords(reading.usage));
    if (tone !== null) return { why: tone };
  }
  return { draft: { key: stableKey(body), question, body_kind: d.body_kind, body, by: name } };
}

/* ── his own words, and the looks he installed ───────────────────────────────── */

/**
 * What the draft path already read, handed to `fromModel` beside the answer. `usage` is the reading the model
 * was handed, whose titles a tone draft is held to (`ownWords`) and whose age a look pick waits on (`youngSaid`). `looks`
 * is what `theme-pick.ts` `looksOf` answers for this record, less the one he is drawn in now. `may` is the kernel's
 * governor (`observe.ts` `mayPropose`), and a look pick waits while it says no.
 */
export type ModelReading = {
  usage?: OwnReading;
  looks?: readonly LookOffer[];
  may?: MayPropose;
};

/** The part of a reading his own words and his record's age are read from. */
export type OwnReading = Pick<Usage, 'at' | 'firstWrite' | 'ageDays' | 'lists' | 'pages' | 'tone'> & Partial<Pick<Usage, 'used' | 'entities' | 'skills'>>;

/** The most of his own titles and first lines a tone draft is held to. */
export const OWN_WORDS_MOST = 40;

/* A LINE HOME SAYS, and a word the record calls one of its things by: what `voiceSetting` and `labelSetting` name. */
const VOICE_NAME = /^voice_[a-z0-9_]+$/u;
const LABEL_NAME = /^(?:label|one|holds)_[a-z0-9_]+$|^lk_[0-9a-f]{8}$/u;
/** The longest of his lines kept as one of his own: a title or a first line, not a body. */
const OWN_LINE_MOST = 200;

/**
 * His own titles and first lines, at most `OWN_WORDS_MOST`, from what the reading already holds: the pages he titled,
 * most opened first, the names his lists go by, the words he set for the use case, the people, organisations and
 * projects met most, and his skills' names. NOTHING NEW IS READ: the reading is the asker's (`readUsage` `reads`), so a
 * list he may not read gives none of its words here.
 */
export function ownWords(usage: OwnReading): string[] {
  const set = Object.values(usage.tone?.settings ?? {})
    .filter((s) => s.value !== null && s.value !== s.default)
    .map((s) => s.value as string);
  const said = [
    ...[...usage.pages].filter((p) => p.titled).sort((a, b) => b.opens30 - a.opens30).map((p) => p.title),
    ...[...usage.lists].sort((a, b) => b.rows - a.rows).map((l) => l.name),
    ...set,
    ...(usage.entities ?? []).map((e) => e.name),
    ...(usage.skills ?? []),
  ];
  const out: string[] = [];
  for (const text of said) {
    const line = String(text).split(/\r?\n/u)[0]!.trim().slice(0, OWN_LINE_MOST);
    if (line !== '' && !out.includes(line)) out.push(line);
    if (out.length >= OWN_WORDS_MOST) break;
  }
  return out;
}

/** Why a tone draft goes, as the dropped line says it: a label in a word he never wrote. */
export const NEVER_WROTE = 'a label used a word you never wrote';
/** And a line Home would say holding a number, which goes stale the day after. */
export const LINE_NUMBERED = 'a line held a number, which would go stale';

/* WHAT THE MODEL PROPOSED, AS THE DROPPED LINE QUOTES IT: an address or a key said as `scrub.ts` says one, and short. */
const quoted = (v: unknown): string => {
  const text = typeof v === 'string' ? (scrubbed(v) ?? 'words that cannot be shown') : 'something that is not words';
  return `"${text.length > 60 ? `${text.slice(0, 59)}…` : text}"`;
};

/**
 * Why a model's `settings` or `pack` draft is dropped for its words, or `null` when every word it sets is his.
 *
 * `reach.ts` `toneKept` IS THE TEST, against `own`: a label (a `label_`, `one_`, `holds_` or `lk_` setting) only in
 * words of his, a voice line (a `voice_` setting, or `body.voice`) only with no digit. ONE WORD OF THE MODEL'S DROPS THE
 * WHOLE DRAFT, because its question was written about all of it; a value of `null` puts back the use case's own word,
 * which is nobody's new word. Any other setting is not tone and is left to `prepare`, as before.
 */
export function toneFault(body: Record<string, unknown>, n: number, own: readonly string[]): string | null {
  const labels: string[] = [];
  const lines: string[] = [];
  const read = (values: unknown, voiceOnly: boolean): void => {
    if (values === null || typeof values !== 'object' || Array.isArray(values)) return;
    for (const [key, v] of Object.entries(values)) {
      if (v === null) continue;
      const voice = voiceOnly || VOICE_NAME.test(key);
      if (!voice && !LABEL_NAME.test(key)) continue;
      const kept = voice ? toneKept({ voice: [v as string] }, own) : toneKept({ labels: { [key]: v as string } }, own);
      if (kept.dropped.length > 0) (voice ? lines : labels).push(quoted(v));
    }
  };
  read(body.values, false);
  if (Array.isArray(body.settings)) for (const s of body.settings) read((s as { values?: unknown } | null)?.values, false);
  read(body.voice, true);
  const why = [
    ...(labels.length === 0 ? [] : [`${NEVER_WROTE} (${labels.join(', ')})`]),
    ...(lines.length === 0 ? [] : [`${LINE_NUMBERED} (${lines.join(', ')})`]),
  ];
  return why.length === 0 ? null : `Proposal ${n} was dropped, because ${why.join(', and ')}.`;
}

/**
 * The theme a `settings` body picks, `{ look: { theme } }` or the model's shorter `{ look: '<id>' }`, or `undefined` when
 * it picks none. What is picked is not checked here: `lookDraft` holds it to what is installed, and `lookLanding` again.
 */
export function lookPicked(body: unknown): unknown {
  if (body === null || typeof body !== 'object' || !Object.hasOwn(body, 'look')) return undefined;
  const look = (body as { look?: unknown }).look;
  return look !== null && typeof look === 'object' ? (look as { theme?: unknown }).theme : look;
}

/** The question a look is offered in, by its name: an add-on's look is one he installed, the record's own is his. */
export const lookQuestion = (look: LookOffer): string =>
  `${look.from === 'own' ? (look.name === 'Your own look' ? 'Try your own look?' : `Try ${look.name}, your own look?`) : `Try the ${look.name} look you installed?`} It changes how BrainDog looks for you, and Settings, Appearance changes it back.`;

/* THE LOOKS A DROPPED LINE NAMES, by name, the first three and how many more. */
const looksSaid = (looks: readonly LookOffer[]): string =>
  looks.length <= 3 ? looks.map((l) => l.name).join(', ') : `${looks.slice(0, 3).map((l) => l.name).join(', ')} and ${looks.length - 3} more`;

/**
 * A model's look pick as a draft, or why it is dropped: A THEME IS PICKED, NEVER DESIGNED. Only an id `looksOf`
 * answers for this record is offered, and `lookThemeFault` must take it too, so `house` and a theme nobody installed
 * are dropped. The body is `{ look: { theme } }` and nothing else, filed as a `settings` question, which `prepare` passes
 * as it is; his yes sets his own `look.theme` (`lookLanding`). The question is the record's, in the look's name, never
 * its id. IT WAITS WHILE SLASH WAITS: the governor's no (`may`, the brake and the floor) and a young record
 * (`youngSaid`) hold it, and so does a reading that was not handed over, since then the record's age is unknown.
 */
export function lookDraft(body: Record<string, unknown>, n: number, name: string, reading: ModelReading = {}): { draft: SlashDraft } | { why: string } {
  if (Object.keys(body).some((k) => k !== 'look')) return { why: `Proposal ${n} picked a look and changed something else with it, and a look is asked on its own.` };
  if (reading.may !== undefined && !reading.may.may) return { why: `Proposal ${n}, a look to try, waits. ${reading.may.why}` };
  if (reading.usage === undefined) return { why: `Proposal ${n}, a look to try, waits until Slash has read how you use BrainDog.` };
  const young = youngSaid(reading.usage);
  if (young !== null) return { why: `Proposal ${n}, a look to try, waits. ${young}` };
  const looks = reading.looks ?? [];
  const picked = lookPicked(body);
  const look = looks.find((l) => l.id === picked);
  if (look === undefined || lookThemeFault(picked, looks.map((l) => l.id)) !== null)
    return {
      why:
        looks.length === 0
          ? `Proposal ${n} picked a look, and none is installed here to pick. A new look is yours or an agent's to design.`
          : `Proposal ${n} picked a look that is not installed here. Slash offers only one you installed: ${looksSaid(looks)}.`,
    };
  const filed = { look: { theme: look.id } };
  return { draft: { key: stableKey(filed), question: lookQuestion(look), body_kind: 'settings', body: filed, by: name } };
}

/**
 * What his yes to a look pick sets: `look.theme` on whoever said it, checked again by `lookThemeFault` against the themes
 * installed now, since one may have gone since the question was filed. `null` when the body picks no look, so every
 * other settings answer lands as before. The refusal says it plainly, with no id.
 */
export function lookLanding(body: unknown, installed: readonly string[]): Result<{ key: 'look.theme'; value: string }> | null {
  const picked = lookPicked(body);
  if (picked === undefined) return null;
  const fault = picked === LOOK_THEME_HOUSE || typeof picked !== 'string' ? lookThemeFault(undefined, installed) : lookThemeFault(picked, installed);
  if (fault !== null)
    return { ok: false, refusal: { ...fault, fix: 'That look is not installed any more, so nothing was changed. Pick another in Settings, Appearance.' } };
  return { ok: true, value: { key: 'look.theme', value: picked as string } };
}

/* ── a description, drafted, tried and repaired ──────────────────────────────── */

/**
 * The most repair asks one press makes, after the first ask, and every one is held and settled in Slash's ledger against
 * `ask_cap` like any other ask (`slashAsked` in `index.ts`).
 */
export const SLASH_REPAIRS_MOST = 2;

/** The most sample rows a draft may carry for one list, and the most lists: the preview draws them and nothing files them. */
export const SAMPLE_ROWS_MOST = 5;
const SAMPLE_LISTS_MOST = 20;

/** A list id as the kernel takes one, so a model's sample rows never name a key an object already has. */
const LIST_ID = /^[a-z][a-z0-9_]{0,31}$/u;

/** One declaration as a `change` carries it. */
export type SlashDecl = { id: string; kind: string; body: Record<string, unknown> };

/** Sample rows by list id, drawn in a preview and never filed. */
export type SlashRows = Record<string, Record<string, Json>[]>;

/**
 * A page `previewChange` drew (`PreviewedPage`), carried to the caller as it came. Read here only for its id and each
 * block's refusals, so nothing else of its shape is written twice.
 */
export type SlashPreviewedPage = { id: string; blocks: readonly { refusals?: readonly Refusal[] }[]; [key: string]: unknown };

/** A rule of the draft taken over its sample by `tryAutomation`, as the try answered it, beside the rule's id. */
export type SlashTried = Tried & { rule: string };

/** What a draft drew, and, for a change of rules alone, what each rule did when tried (`previewerOf`). */
export type SlashPreview = { pages: SlashPreviewedPage[]; tried?: SlashTried[] };

/** `previewChange` asked as the person pressing, and its rules tried: one change and its sample rows drawn inside a rehearsal, nothing kept. */
export type SlashPreviewer = (change: { to: unknown; rows?: SlashRows }) => Promise<Result<SlashPreview>>;

/** One ask of the model, as `slashAsked` makes it: its raw answer, or the meter's refusal. A model that failed throws. */
export type SlashAsk = (input: SlashModelInput) => Promise<{ raw: unknown } | { spent: string }>;

/** A draft from a description, with the rows it would be drawn over and what it drew. */
export type DescribedDraft = SlashDraft & { rows: SlashRows; preview: SlashPreview };

/** `slashDraft`'s answer. `SlashDraft` is the arranger's draft and is another type. */
export type SlashDrafted = {
  by: string;
  drafts: { question: string; change: { to: SlashDecl | { declarations: SlashDecl[] } }; rows: SlashRows; preview: SlashPreview }[];
  dropped: string[];
  /** What asking the model for these cost, said plainly (`costSaid`). Absent when the model was not asked. */
  cost?: DraftCost;
};

/**
 * WHAT A DRAFT COST (§45 "Thinking and cost": "each draft says what it cost"): the asks of the model it took, the first
 * and each repair, which is what the month's allowance counts, and the record's estimate of what was sent and came back
 * (bytes over three, as the ledger settles it). `said` is the line a person reads beside the draft.
 */
export type DraftCost = { asks: number; tokens: number; said: string };

/** The line a draft's cost is said in: the asks it took of the month's allowance, never the host's units. */
export const costSaid = (asks: number): string => `This cost about ${asks === 1 ? 'one' : asks.toLocaleString('en-GB')} of the month's asks of the model.`;

/** What `describe` answers: the drafts that drew clean, why each other one went, and whether the record was too large to send. */
export type SlashDescribed = { by: string; drafts: DescribedDraft[]; dropped: string[]; large: boolean; cost?: DraftCost };

/** What every sentence ends on when a description came to nothing. */
export const DESCRIBED_NOTHING = 'nothing was drafted from what you described.';

/** The sentence a description gets on a record with no model. */
export const DESCRIBED_NO_MODEL = 'Slash builds from a description only with a model, and this BrainDog has none set up, so nothing was drafted from it.';

/** The sentence a description gets on a record that cannot draw a change before it lands, where nothing is asked. */
export const DESCRIBED_NO_PREVIEW = 'This BrainDog cannot draw a change before it lands yet, so the model was not asked and nothing was drafted from what you described.';

/**
 * `asked`, checked: text of a sentence or a few, at most `SLASH_ASKED_MOST` characters once trimmed.
 *
 * CHARACTERS ARE CODE POINTS, as the contract counts them. `length` counts UTF-16 units, so a description written in an
 * alphabet outside the first plane was refused at half the bound.
 */
export function askedFault(asked: unknown): Refusal | null {
  const text = typeof asked === 'string' ? asked.trim() : '';
  if (text === '' || [...text].length > SLASH_ASKED_MOST)
    return { code: 'VALUE_MALFORMED', fix: `asked is what you want Slash to build, in a sentence or a few, at most ${SLASH_ASKED_MOST} characters.`, at: 'asked' };
  return null;
}

/** `page`, checked for being a slug at all; whether the caller may read it is the record's question. */
export function pageFault(page: unknown): Refusal | null {
  if (typeof page === 'string' && page.trim() !== '') return null;
  return { code: 'VALUE_MALFORMED', fix: 'page is the slug of the page the description is about, such as desk.', at: 'page' };
}

/**
 * `previewChange` on the record `api`, asked as `ctx`, and then `tryAutomation` for each rule of a change of rules alone
 * (`triedRules`), or `null` on a record that has not got `previewChange`.
 *
 * LOOKED UP WHEN IT IS CALLED, as the host looks up a row's method (`handlersFor`), because both are sibling methods under
 * `methods/` and neither `index.ts` nor a method file is handed the other's. `null` stops a description before the model
 * is asked: a draft nothing can try is a draft nothing can repair, and an ask spent on it is spent for nothing. A record
 * without `tryAutomation` draws its drafts as it did before the try, since the draw's lint still holds every rule.
 */
export function previewerOf(api: unknown, ctx: unknown): SlashPreviewer | null {
  const method = (api as Record<string, unknown> | null)?.previewChange;
  if (typeof method !== 'function') return null;
  const trial = (api as Record<string, unknown> | null)?.tryAutomation;
  return async (change) => {
    const seen = (await (method as (args: unknown, ctx: unknown) => Promise<unknown>).call(api, change, ctx)) as Result<SlashPreview>;
    if (!seen.ok || typeof trial !== 'function') return seen;
    const tried = await triedRules(change, async (args) => (await (trial as (args: unknown, ctx: unknown) => Promise<unknown>).call(api, args, ctx)) as Result<Tried>);
    if ('refusal' in tried) return { ok: false, refusal: tried.refusal };
    return tried.rules.length === 0 ? seen : { ...seen, value: { ...seen.value, tried: tried.rules } };
  };
}

/** The most rules one change drafted from a description may carry, each tried before it is filed. */
const RULES_TRIED_MOST = 5;

/**
 * Each rule of a change taken over its sample by `tryAutomation`, after `previewChange` drew it clean, or the refusal
 * that stops it: a drafted automation is tried first.
 *
 * THE DRAW LINTS A RULE AND THE TRY RUNS IT. `previewChange` holds every declaration to the install's lint, the change laid
 * over the record, and writes the sample rows through every rule a real row meets. A rule that starts on a clock meets no
 * row, so "every morning tell me what is due" was filed with nothing having taken its steps. The try is the real runner
 * in a rehearsal (`kernel/src/flow-try.ts`): a notice, a call or a question is said as what a live run would do and never
 * leaves the record, and a step that fails is handed back to the model to mend as a draw's refusal is.
 *
 * ONLY A CHANGE OF RULES ALONE, because `tryAutomation` lints the body against the record as it stands: a rule over a list
 * the same change builds would be refused for the list not being there yet, and the draft dropped for the order the record
 * was asked in. A change that brings its own lists is held by the draw, whose rehearsal installs them first.
 *
 * A TRY THAT NEEDS A SAMPLE THE DRAFT HAS NOT GOT IS NOT A FAULT OF THE RULE. A rule on a list's rows is started from the
 * draft's first sample row on that list; one on an arrival or a figure, with nothing to start it, is refused at `sample`,
 * and that rule is left as the draw left it. A rule with no `on:` runs inside the write that fires it, which the draw's
 * sample rows already took, and a try takes a run.
 */
async function triedRules(
  change: { to: unknown; rows?: SlashRows },
  tryAutomation: (args: { body: unknown; sample: Record<string, unknown> }) => Promise<Result<Tried>>,
): Promise<{ rules: SlashTried[] } | { refusal: Refusal }> {
  const to = partOf(change.to);
  const listed = (Array.isArray(to.declarations) ? to.declarations : [to]).map(partOf);
  if (listed.length === 0 || listed.some((d) => d.kind !== 'rule')) return { rules: [] };
  const runs = listed.filter((d) => Object.keys(partOf(partOf(d.body).on)).length > 0);
  if (runs.length > RULES_TRIED_MOST)
    return { refusal: { code: 'OUT_OF_BOUNDS', fix: `A change from a description carries at most ${RULES_TRIED_MOST} rules that run, so each is tried before it is filed. Split it.`, at: 'to' } };
  const rules: SlashTried[] = [];
  for (const d of runs) {
    const id = String(d.id ?? 'rule');
    const body = partOf(d.body);
    const list = subjectOf(body);
    const row = list === null ? undefined : change.rows?.[list]?.[0];
    let got: Result<Tried>;
    try {
      got = await tryAutomation({ body, sample: row === undefined ? {} : { row } });
    } catch {
      got = { ok: false, refusal: { code: 'RECORD_UNAVAILABLE', fix: 'BrainDog could not try this rule.' } };
    }
    if (got.ok) {
      rules.push({ ...got.value, rule: id });
      continue;
    }
    const refusal: Refusal = 'refusal' in got ? got.refusal : { code: 'RECORD_UNAVAILABLE', fix: 'BrainDog could not try this rule.' };
    if (refusal.at?.startsWith('sample') === true) continue;
    return { refusal: { ...refusal, at: refusal.at === undefined ? id : `${id}.${refusal.at}` } };
  }
  return { rules };
}

/**
 * A model's sample rows for one draft, kept to `SAMPLE_ROWS_MOST` a list and `SAMPLE_LISTS_MOST` lists, or none.
 *
 * `Object.fromEntries` AND A LIST ID, because the keys are the model's: assigning `out[list]` for a list called
 * `__proto__` would set the object's prototype rather than name a list.
 */
function sampleRows(raw: unknown): SlashRows {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const kept: [string, Record<string, Json>[]][] = [];
  for (const [list, rows] of Object.entries(raw as Record<string, unknown>)) {
    if (kept.length >= SAMPLE_LISTS_MOST) break;
    if (!LIST_ID.test(list) || !Array.isArray(rows)) continue;
    const plain = rows.filter((r): r is Record<string, Json> => r !== null && typeof r === 'object' && !Array.isArray(r)).slice(0, SAMPLE_ROWS_MOST);
    if (plain.length > 0) kept.push([list, plain]);
  }
  return Object.fromEntries(kept);
}

/**
 * Everything the record refused about one drawn draft: the lint's or the try's refusal, or each block that drew nothing and
 * each step a try failed, each with the path the model reads it by. An empty list is a draft that previews clean.
 */
function faultsOf(seen: Result<SlashPreview>, built?: { id: string; blocks: readonly unknown[] }): { at: string; fix: string }[] {
  if (!seen.ok) return [{ at: ('refusal' in seen ? seen.refusal.at : undefined) ?? 'to', fix: 'refusal' in seen ? seen.refusal.fix : 'The change could not be drawn.' }];
  const faults: { at: string; fix: string }[] = [];
  for (const page of seen.value.pages)
    for (const [i, block] of page.blocks.entries())
      for (const r of block.refusals ?? []) faults.push({ at: `${page.id}.blocks[${i}]${r.at === undefined ? '' : `.${r.at}`}`, fix: r.fix });
  /* A STEP THE TRY FAILED IS A FAULT AS A BLOCK THAT DREW NOTHING IS: the rule would install and then stop there on its
     first live run. `would`, `waiting` and `skipped` are what a live run does past the try, and are not faults. */
  for (const t of seen.value.tried ?? [])
    for (const s of t.steps) if (s.state === 'failed') faults.push({ at: `${t.rule}.${s.path}`, fix: s.say });
  /* AND WHAT DRAWS BUT IS NOT A GOOD PAGE, so the same repair that mends a refusal mends a page that opens on nothing,
     leaves a hole in a row, or calls the person's things rows. */
  /* A PAGE BUILT IN THE BROWSER AND NOT YET HELD (Today, Decide: C25) stood as that body, so it is held only to
     faults of a kind the body did not have already: the body is the person's screen, and a draft that adds one calendar
     to it is not asked to mend how many tiles Today opens on. By kind, since the body is measured as written and the
     draft as drawn, so the numbers and the block named in a fault differ between the two. */
  const kindOf = (fix: string): string => fix.replace(/"[^"]*"/gu, '').replace(/\d+/gu, '#');
  const stood = built === undefined ? new Set<string>() : new Set(calmFaults([{ id: built.id, blocks: built.blocks as SlashPreviewedPage['blocks'] }]).map((f) => kindOf(f.fix)));
  faults.push(...calmFaults(seen.value.pages).filter((f) => built === undefined || !f.at.startsWith(`${built.id}.`) || !stood.has(kindOf(f.fix))));
  /* AND THE DESIGN CHECK EVERY DRAFT PASSES BEFORE IT IS SHOWN (§45), so a drawn part that scrolls sideways on a phone or
     paints a colour of its own is mended by the model, or dropped, and never drawn for the owner to find. */
  /* A BUILT BODY'S OWN DESIGN FAULTS ARE ITS OWN, as its calm faults are: only what the draft added is this draft's. */
  const stoodDesign = built === undefined ? new Set<string>() : new Set(designFaults([{ id: built.id, blocks: built.blocks as SlashPreviewedPage['blocks'] }]).map((f) => f.fix));
  faults.push(...designFaults(seen.value.pages).filter((f) => built === undefined || !f.at.startsWith(`${built.id}.`) || !stoodDesign.has(f.fix)));
  return faults;
}

/**
 * The design check over every page a draft draws (`design-check.ts`), each fault with the path the model mends it by.
 * A PAGE THAT ALREADY STOOD IS HELD ONLY TO WHAT THE DRAFT MADE WORSE, as `calmFaults` holds it: a fault the page had
 * before (`was`) is not this draft's.
 */
export function designFaults(pages: readonly SlashPreviewedPage[]): { at: string; fix: string }[] {
  const faults: { at: string; fix: string }[] = [];
  for (const page of pages) {
    const sentence = (said: string): string => `This design is not shown, because ${said}`;
    const before = Array.isArray(page.was) ? new Set(designCheck({ blocks: page.was as DesignBlock[] }).map((f) => sentence(f.said))) : new Set<string>();
    for (const f of designCheck({ blocks: page.blocks as readonly DesignBlock[] })) {
      /* WHAT `calmFaults` ALREADY SAYS IS NOT SAID TWICE: a part with no empty words, and a heading in the system's word. */
      if (f.rule === 'empty' || (f.rule === 'words' && f.said.includes("the system's word"))) continue;
      const fix = sentence(f.said);
      if (!before.has(fix)) faults.push({ at: `${page.id}.blocks[${f.at}]`, fix });
    }
  }
  return faults;
}

/* ── the page quality bar ──────────────────────────────────────────────── */

/** A page's width in twelfths, which every row before its last fills. */
const COLUMNS = 12;

/** At most this many blocks are drawn before a page's first section; more go in a section, folded. */
export const PAGE_TILES_FIRST = 6;

/** The system's words, which a heading never says about the person's own things. */
const HEADING_WORDS = /\b(?:rows?|lists?|list items?|registers?|blocks?|entit(?:y|ies))\b/iu;

/** A block as a preview drew it, read here only for the keys the bar looks at. */
type DrawnBlock = {
  kind?: unknown;
  lead?: unknown;
  body?: unknown;
  heading?: unknown;
  span?: unknown;
  area?: unknown;
  columns?: unknown;
  source?: unknown;
  empty?: unknown;
  when?: unknown;
  drawn?: unknown;
  added?: unknown;
};

/**
 * The narrowest a block survives, as the app lays it out (`apps/web/src/lib/record/arrange.ts` `spanOf`): its kind's
 * own floor, and two twelfths a column for a kind that lays its cells side by side. A declared span below that is
 * widened by the page, so the row is measured as it is drawn and not as it is written.
 */
const spanOf = (b: DrawnBlock): number => {
  const kind = typeof b.kind === 'string' ? b.kind : '';
  const spec = isKind(kind) ? KINDS[kind] : undefined;
  const base = spec?.minSpan ?? 4;
  const columns = Array.isArray(b.columns) ? b.columns.length : 0;
  const floor = (spec?.primitive === 'table' || spec?.primitive === 'rows') && columns > 0 ? Math.min(COLUMNS, Math.max(base, columns * 2)) : base;
  const declared = typeof b.span === 'number' && Number.isInteger(b.span) ? b.span : COLUMNS;
  return Math.min(COLUMNS, Math.max(floor, declared));
};

/** Whether a block draws the person's things one under another: a kind that lists or plans, over a source. */
const drawsRows = (b: DrawnBlock): boolean => {
  const kind = typeof b.kind === 'string' ? b.kind : '';
  const purpose = isKind(kind) ? KINDS[kind].purpose : undefined;
  return typeof b.source === 'string' && (purpose === 'list' || purpose === 'plan');
};

/** What a heading is called in a fix, so the model knows which block it was. */
const named = (b: DrawnBlock, i: number): string => (typeof b.heading === 'string' && b.heading.trim() ? `"${b.heading.trim()}"` : `block ${i + 1}`);

/**
 * What keeps a drawn page from being a good one, each with the path the model mends it by. It is the same bar
 * that `SLASH_INSTRUCTIONS` describes to the model:
 *
 * - THE FIRST BLOCK IS A LEAD NOTE WITH A FIGURE IN IT, the one line that answers the page's question;
 * - ITS ROWS TILE TO TWELVE, every row before the last full, measured as the app lays them out (`layout.test.ts`);
 * - EVERY BLOCK THAT DRAWS ROWS SAYS `empty:` OR CARRIES `when:`, so a part with nothing in it is not a blank box;
 * - AT MOST `PAGE_TILES_FIRST` BLOCKS BEFORE THE FIRST SECTION, so the first screen is a few things, not all of them;
 * - NO HEADING SAYS row, list, register, block or entity.
 *
 * MEASURED ON WHAT THE PREVIEW DREW, NOT ON WHAT WAS WRITTEN, so a block whose `when:` said no is not counted in a row it
 * is not drawn in, and a block another pack lays on the page (`added`) is not the draft's to mend. A page that already
 * stood is held only to what the draft made worse: a fault the page had before it (`was`) is not this draft's.
 */
export function calmFaults(pages: readonly SlashPreviewedPage[]): { at: string; fix: string }[] {
  const faults: { at: string; fix: string }[] = [];
  for (const page of pages) {
    const before = Array.isArray(page.was) ? new Set(pageFaults(page.id, page.was as DrawnBlock[]).map((f) => f.fix)) : new Set<string>();
    for (const f of pageFaults(page.id, page.blocks as DrawnBlock[])) if (!before.has(f.fix)) faults.push(f);
  }
  return faults;
}

function pageFaults(id: string, all: readonly DrawnBlock[]): { at: string; fix: string }[] {
  const faults: { at: string; fix: string }[] = [];
  const blocks = all.map((b, i) => ({ b, i })).filter(({ b }) => b !== null && typeof b === 'object' && b.added === undefined);
  const first = blocks[0]?.b;
  if (first && !(first.kind === 'note' && first.lead === true && typeof first.body === 'string' && /\{\{[^{}]+\}\}/u.test(first.body)))
    faults.push({
      at: `${id}.blocks[${blocks[0]!.i}]`,
      fix: 'The page opens with one lead sentence: a note with "lead": true whose body says what matters now with at least one real {{figure}}.',
    });
  /* THE ROWS AS THE PAGE FILLS THEM: a block that does not fit starts a new row. Only what is drawn, in the main column. */
  let width = 0;
  let row: { b: DrawnBlock; i: number }[] = [];
  const shown = blocks.filter(({ b }) => b.drawn !== false && b.area !== 'rail');
  for (const one of shown) {
    const span = spanOf(one.b);
    if (width + span > COLUMNS) {
      if (width < COLUMNS)
        faults.push({
          at: `${id}.blocks[${row[0]!.i}]`,
          fix: `The row starting at ${named(row[0]!.b, row[0]!.i)} is ${width} of 12 wide, so it leaves a hole. Make its spans add up to 12, such as 8 and 4, or three of 4.`,
        });
      width = 0;
      row = [];
    }
    width += span;
    row.push(one);
  }
  for (const { b, i } of blocks) {
    if (drawsRows(b) && typeof b.empty !== 'string' && b.when === undefined)
      faults.push({ at: `${id}.blocks[${i}]`, fix: `${named(b, i)} says nothing when it has nothing to show. Give it "empty", the sentence shown then, or a "when" that leaves it out.` });
    if (typeof b.heading === 'string' && HEADING_WORDS.test(b.heading))
      faults.push({ at: `${id}.blocks[${i}].heading`, fix: `The heading ${named(b, i)} says the system's word. Name the person's own things instead, as this BrainDog calls them.` });
  }
  const opening = shown.findIndex(({ b }) => b.kind === 'section');
  const ahead = opening === -1 ? shown.length : opening;
  if (ahead > PAGE_TILES_FIRST)
    faults.push({
      at: `${id}.blocks[${shown[PAGE_TILES_FIRST]!.i}]`,
      fix: `The page draws ${ahead} blocks before its first section, and a calm page shows at most ${PAGE_TILES_FIRST}. Put the rest in a section with "fold": true.`,
    });
  return faults;
}

/**
 * A draft as the model answered it, handed back in a repair so it mends its own words.
 *
 * `said` IS THE MODEL'S OWN QUESTION, NOT THE DRAFT'S. The draft's carries the line the record adds about what it replaces
 * (`changeBody`'s `says`), and a model handed that back answers it again, so the record would add its line a second time.
 */
const answered = (d: SlashDraft & { rows: SlashRows }, said: string): unknown => ({
  question: said,
  body_kind: d.body_kind,
  body: { to: d.body.to },
  ...(Object.keys(d.rows).length === 0 ? {} : { rows: d.rows }),
});

const opening = (text: string): string => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

/**
 * A PAGE CHANGE THAT MOVED BLOCKS, GIVEN THE PINS THAT KEEP THEM THERE. The record lays its rules' look over every page
 * it reads and moves what is pressing up, so a kept body that put Cash ahead first drew with what is late above it again.
 * The blocks the change moved (those off the longest run that kept their order) are pinned in the owner's look, and the
 * look rides with the page as one change. `held` is the look the page already has, whose pins and hides stay.
 */
export function pinMoved(about: { id: string; body: unknown }, to: unknown, held: unknown): unknown {
  const one = to as { id?: unknown; kind?: unknown; body?: { blocks?: unknown } } | null;
  const before = (about.body as { blocks?: unknown } | null)?.blocks;
  if (one === null || typeof one !== 'object' || one.id !== about.id || one.kind !== 'page' || !about.id.startsWith('page.')) return to;
  const after = one.body?.blocks;
  if (!Array.isArray(before) || !Array.isArray(after)) return to;
  const was = keyedBlocks(before as object[]).map((b) => b.key);
  const now = keyedBlocks(after as object[]).map((b) => b.key);
  const seq = now.filter((k) => was.includes(k)).map((k) => was.indexOf(k));
  /* THE LONGEST RUN THAT KEPT ITS ORDER, by the plain quadratic walk: a page holds a few dozen blocks. */
  const run: number[] = seq.map(() => 1);
  const from: number[] = seq.map(() => -1);
  seq.forEach((v, i) => {
    for (let j = 0; j < i; j += 1) if (seq[j]! < v && run[j]! + 1 > run[i]!) (run[i] = run[j]! + 1), (from[i] = j);
  });
  const keep = new Set<number>();
  for (let at = run.indexOf(Math.max(0, ...run)); at !== -1 && seq.length > 0; at = from[at]!) keep.add(at);
  const common = now.filter((k) => was.includes(k));
  const moved = common.filter((_, i) => !keep.has(i) && BLOCK_KEY.test(common[i]!));
  if (moved.length === 0) return to;
  const slug = about.id.slice('page.'.length);
  const mine = held !== null && typeof held === 'object' && (held as { by?: unknown }).by === 'owner' ? (held as Record<string, unknown>) : null;
  const pinned = [...new Set([...(Array.isArray(mine?.pinned) ? (mine!.pinned as string[]) : []), ...moved])];
  const hide = (Array.isArray(mine?.hide) ? (mine!.hide as string[]) : []).filter((k) => !pinned.includes(k));
  const look = { ...(mine ?? {}), look: slug, basis: typeof mine?.basis === 'string' ? mine.basis : 'said', by: 'owner', pinned, ...(hide.length > 0 ? { hide } : {}) };
  return { declarations: [one, { id: `look.${slug}`, kind: 'look', body: look }] };
}

/**
 * A description drafted by the model, each draft tried with `previewChange` (and its rules with `tryAutomation`, through
 * `previewerOf`), and what it refused handed back to be mended.
 *
 * THE RECORD FILED WHATEVER PASSED `fromModel` FROM ONE ASK, WITH NO GRAMMAR IN IT, so a page naming a field its list
 * lacks reached Decide and was found wrong when the owner accepted it. Now every draft is drawn first, inside a
 * rehearsal that keeps nothing, and every refusal goes back once as `repair`: at most `SLASH_REPAIRS_MOST` repair asks,
 * each through `ask`, which holds and settles it in Slash's ledger. A draft still refused after the last is dropped
 * with the record's own sentence, and one that draws clean is kept as it drew.
 *
 * NOTHING HERE WRITES. `preview` rolls back everything it drew, and the caller files what is kept, or only shows it.
 */
export async function describe(deps: {
  name: string;
  ask: SlashAsk;
  input: SlashModelInput;
  drawn: (id: string) => number;
  preview: SlashPreviewer;
  most?: number;
  /** The body a page not yet held was built as, which the draft is measured against. */
  built?: { id: string; blocks: readonly unknown[] };
  /** Pins the blocks a page change moved, handed in by the record, which holds the page's look. */
  pin?: (to: unknown) => unknown;
}): Promise<SlashDescribed> {
  const most = deps.most ?? SLASH_OPEN_CAP;
  const dropped: string[] = [];
  const clean: DescribedDraft[] = [];
  let refused: { draft: SlashDraft & { rows: SlashRows }; said: string; faults: { at: string; fix: string }[] }[] = [];
  let large = false;
  let stopped = false;
  /* WHAT THE ASKING COST, counted as the ledger counts it: an ask that answered, and bytes over three each way. */
  let spentAsks = 0;
  let spentTokens = 0;
  const tokensOf = (v: unknown): number => Math.ceil(new TextEncoder().encode(JSON.stringify(v) ?? '').length / 3);
  const turnedDown = new Set((deps.input.declined ?? []).map((d) => JSON.stringify(d.body.to ?? null)));
  for (let asks = 0; asks <= SLASH_REPAIRS_MOST && (asks === 0 || refused.length > 0); asks++) {
    const input: SlashModelInput =
      asks === 0 ? deps.input : { ...deps.input, repair: { drafts: refused.map((r) => answered(r.draft, r.said)), refusals: refused.flatMap((r) => r.faults) } };
    let raw: unknown;
    try {
      const got = await deps.ask(input);
      if ('spent' in got) {
        dropped.push(asks === 0 ? `${got.spent} ${opening(DESCRIBED_NOTHING)}` : `${got.spent} So what BrainDog refused was not mended.`);
        stopped = asks === 0;
        break;
      }
      raw = got.raw;
      spentAsks += 1;
      spentTokens += tokensOf(input) + tokensOf(raw);
    } catch (e) {
      /* A PRESS THE INCLUDED MODEL'S CEILING TURNED AWAY WAS NEVER ASKED, and is said as a record too large, not as a model
         that might answer next time (`index.ts` `slashFile` keeps the full account of why). */
      large = asks === 0 && deps.name === 'included' && typeof e === 'object' && e !== null && (e as { sent?: unknown }).sent === false;
      dropped.push(
        asks > 0
          ? 'The model did not answer the repair, so what BrainDog refused was not mended.'
          : large
            ? `This BrainDog is too large for the included model to read, so ${DESCRIBED_NOTHING}`
            : `The model did not answer, so ${DESCRIBED_NOTHING}`,
      );
      stopped = asks === 0;
      break;
    }
    const list = draftsIn(raw);
    if (list === null) dropped.push(NOT_A_LIST);
    const next: typeof refused = [];
    const cleanBefore = clean.length;
    for (const [i, x] of (list ?? []).entries()) {
      const one = modelDraft(x, i + 1, deps.name, deps.drawn, true);
      if ('why' in one) {
        dropped.push(one.why);
        continue;
      }
      if (deps.pin !== undefined) one.draft.body = { ...one.draft.body, to: deps.pin(one.draft.body.to) };
      if (clean.some((c) => c.key === one.draft.key)) continue;
      /* A TRY AGAIN THAT ANSWERS WHAT HE TURNED DOWN HAS NOT TRIED AGAIN, so the same change is dropped, said, and never
         drawn: the first draft stays thrown away. */
      if (turnedDown.has(JSON.stringify(one.draft.body.to ?? null))) {
        dropped.push(`Proposal ${i + 1} was the draft you turned down again, so it was left out.`);
        continue;
      }
      /* NO MORE ARE TRIED THAN MAY BE FILED, because each try is a rehearsal that installs the change and draws its pages,
         and an answer is bounded only by the model's own length, so an answer of many small pages would be as many
         rehearsals in one ask. An ask tries at most `most` drafts, the ones already clean counted, as `fromModel` keeps. */
      if (clean.length + next.length >= most) {
        dropped.push(`Proposal ${i + 1} was past the ${most} Slash files at once.`);
        continue;
      }
      const draft = { ...one.draft, rows: sampleRows((x as { rows?: unknown }).rows) };
      let seen: Result<SlashPreview>;
      try {
        seen = await deps.preview({ to: draft.body.to, ...(Object.keys(draft.rows).length === 0 ? {} : { rows: draft.rows }) });
      } catch {
        seen = { ok: false, refusal: { code: 'INTERNAL', fix: 'BrainDog could not draw this change.', at: 'to' } };
      }
      const faults = faultsOf(seen, deps.built);
      if (seen.ok && faults.length === 0) clean.push({ ...draft, preview: seen.value });
      else next.push({ draft, said: (x as { question: string }).question.trim(), faults });
    }
    /* A REPAIR THAT MENDED NOTHING AND ANSWERED NOTHING keeps the drafts it was handed, so each is still dropped below with
       the record's own sentence rather than vanishing from what the owner is told. */
    if (asks > 0 && next.length === 0 && clean.length === cleanBefore) break;
    refused = next;
  }
  for (const r of refused) dropped.push(`"${r.draft.question}" was dropped, because BrainDog refused it: ${r.faults[0]?.fix ?? 'it would not draw.'}`);
  const drafts = clean;
  if (drafts.length === 0 && !stopped) dropped.push(`The model proposed nothing Slash could use, so ${DESCRIBED_NOTHING}`);
  return { by: drafts.length > 0 ? deps.name : 'rules', drafts, dropped, large, ...(spentAsks > 0 ? { cost: { asks: spentAsks, tokens: spentTokens, said: costSaid(spentAsks) } } : {}) };
}

/** What `describe` kept, as `slashDraft` answers it: the question, the change, the rows and what it drew. */
export const draftedOf = (d: SlashDescribed): SlashDrafted => ({
  by: d.by,
  drafts: d.drafts.map((x) => ({
    question: x.question,
    change: { to: x.body.to as SlashDecl | { declarations: SlashDecl[] } },
    rows: x.rows,
    preview: x.preview,
  })),
  dropped: d.dropped,
  ...(d.cost === undefined ? {} : { cost: d.cost }),
});

/** What a body is about, for recognising it once asked: the pack it names, the use case, or the pages it adds. */
export function stableKey(body: Record<string, unknown>): string {
  /* AN INSTALL CARRYING ITS OWN DOCUMENT is that version, so a newer version from a catalogue is a new question. */
  const carried = body.doc !== null && typeof body.doc === 'object' ? (body.doc as { version?: unknown }).version : undefined;
  if (typeof body.install === 'string' && typeof carried === 'string') return `install:${body.install}@${carried}`;
  for (const k of ['install', 'enable', 'disable', 'usecase'] as const) if (typeof body[k] === 'string') return `${k}:${body[k]}`;
  /* "START A PROJECT?" IS THE REPOSITORY IT IS ABOUT (`kernel` `projectSuggestions`), so a no holds whatever it is called. */
  if (typeof body.project_key === 'string') return `project:${body.project_key}`;
  /* WHAT THE NIGHTLY WALK OVER THE RECORD WOULD NOT DO ON ITS OWN (`kernel` `backfill`) IS THE KEY IT ASKED BY, so a no
     to "Is Amazon a company you pay?" holds however its payments are worded next. */
  if (typeof body.understand_key === 'string') return `understand:${body.understand_key}`;
  /* A CHANGE IS THE DECLARATION IT INSTALLS, whole, so a gold rate declined is not asked again and a different one is a new
     question. The egress the kernel adds is left out, so the key is the same on the draft and on the row it was filed as. */
  if (typeof body.declaration_id === 'string' && body.to !== null && typeof body.to === 'object')
    return `change:${body.declaration_id}:${JSON.stringify(body.to)}`;
  /* A LOOK PICKED IS THE LOOK, so a no to the Harbour look is not asked again, and another installed look is a new question. */
  const look = lookPicked(body);
  if (typeof look === 'string') return `look:${look}`;
  /* A SETTINGS CHANGE IS WHAT IT SETS, so turning a line one way and back again are two questions, and each is asked once. */
  if (typeof body.pack === 'string')
    return `settings:${body.pack}:${Object.entries((body.values as Record<string, unknown>) ?? {})
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${k}=${JSON.stringify(v ?? null)}`)
      .join(',')}`;
  /* A PLAN'S ROWS are what it is about by the lists it fills, so a first plan is asked once. */
  if (body.register === undefined && Array.isArray(body.rows))
    return `plan:${[...new Set(body.rows.map((r) => String((r as { register?: unknown })?.register)))].sort().join(',')}`;
  /* A SKILL'S NEXT VERSION IS THE ROW, THE VERSION IT MAKES AND THE LEARNINGS IT CARRIES (`skillDraftOf`). Keyed by the row
     alone, as a row Slash offers is below, every version after a skill's first draft would read as asked before, and the
     skill would grow once and never again. This way a dismissed version is not drafted again, and a new lesson is a new
     question. */
  const update = typeof body.register === 'string' && Array.isArray(body.rows) && body.rows.length === 1 ? (body.rows[0] as { at?: unknown; patch?: unknown }) : undefined;
  const patch = update?.patch !== null && typeof update?.patch === 'object' ? (update.patch as { rev?: unknown; because?: unknown }) : undefined;
  /* AND A SHIPPED SKILL'S NEXT TEXT, which carries no learnings (`noticeWhole`), by the version it makes, so version 3 is
     not taken for version 2 asked before. */
  if (typeof update?.at === 'string' && typeof patch?.rev === 'number' && (Array.isArray(patch.because) || patch.because === undefined))
    return `version:${String(body.register)}:${update.at}@${patch.rev}:${(Array.isArray(patch.because) ? patch.because : []).map(String).sort().join(',')}`;
  /* A ROW SLASH OFFERS is recognised by its list and its title, so a skill declined is not offered again. */
  if (typeof body.register === 'string' && Array.isArray(body.rows))
    return `rows:${body.register}:${body.rows.map((r) => String((r as { name?: unknown; what?: unknown; at?: unknown })?.name ?? (r as { what?: unknown })?.what ?? (r as { at?: unknown })?.at ?? '')).sort().join(',')}`;
  if (body.voice && typeof body.voice === 'object') return `voice:${Object.keys(body.voice).sort().join(',')}`;
  if (Array.isArray(body.pages)) return `pages:${body.pages.map((p) => String((p as { id?: unknown })?.id)).sort().join(',')}`;
  /* PACKS ADDED BY AN ARRANGEMENT are what it is about, so a guide asked once to add Projects and Work is not asked again. */
  const packs = body.packs as { install?: unknown } | undefined;
  if (packs && typeof packs === 'object' && Array.isArray(packs.install) && packs.install.length > 0 && Object.keys(body).every((k) => k === 'packs' || k === 'why' || k === 'plan' || k === 'approve' || k === 'names'))
    return `packs:install:${packs.install.map(String).sort().join(',')}`;
  return JSON.stringify(body).slice(0, 120);
}

/* ── what a use case grows into ─────────────────────────────────────────── */

/** Whether one figure passes its test. A figure that cannot be read passes none. */
function passes(test: FigureTest, value: number | null): boolean {
  if (value === null || !Number.isFinite(value)) return false;
  if (test.gt !== undefined) return value > test.gt;
  if (test.gte !== undefined) return value >= test.gte;
  if (test.lt !== undefined) return value < test.lt;
  if (test.lte !== undefined) return value <= test.lte;
  if (test.is !== undefined) return value === test.is;
  return false;
}

/**
 * Slash's question for each use case that is on and has reached what it grows into (`CatalogueEntry.grows`): every figure
 * test holds and a pack it names is not on yet. Filed like any draft, through `prepare`, as an arrangement that installs
 * only those packs, so accepting adds them and keeps every row.
 *
 * NOT HELD BACK ON A YOUNG RECORD. Slash waits a fortnight before reading habits into how a record is used; this is the
 * person reaching a point their use case names, which can happen on the second day.
 */
export function growsDrafts(
  entries: readonly { id: string; kind: string; grows?: Grows | undefined }[],
  on: (pack: string) => boolean,
  read: (metric: string) => number | null,
): SlashDraft[] {
  const out: SlashDraft[] = [];
  for (const e of entries) {
    const grows = e.grows;
    if (e.kind !== 'usecase' || !grows || !on(e.id)) continue;
    const missing = grows.install.filter((id) => !on(id));
    if (missing.length === 0 || grows.when.length === 0 || !grows.when.every((t) => passes(t, read(t.metric)))) continue;
    const body = { packs: { install: [...missing] }, why: [grows.why] };
    out.push({ key: stableKey(body), question: grows.question.slice(0, QUESTION_MAX), body_kind: 'arrange', body, by: 'rules' });
  }
  return out;
}

/* ── a first plan, formed on request ───────────────────────────────────── */

/**
 * One field of a formed row a model may fill: text of at most `text` characters, one of `one`, the position (from 0) of a
 * row of the list `link` earlier in the same plan, or a whole number of days from today up to `days`, written as that day.
 */
export type FormField = ({ text: number } | { one: readonly string[] } | { link: string } | { days: number }) & { required?: boolean };

/** One list a formed plan fills: how many rows, the fields a model may give, and what every row is given besides. */
export type FormList = {
  register: string;
  least: number;
  most: number;
  fields: Readonly<Record<string, FormField>>;
  /** Set on the first row, and on every other, under what the model gave. */
  first?: Readonly<Record<string, unknown>>;
  rest?: Readonly<Record<string, unknown>>;
  /** A field set to the row's position in its list, from 1. */
  position?: string;
};

/**
 * WHAT A USE CASE FORMS AROUND WHAT THE PERSON SAID (`CatalogueEntry.forms`): the lists in the order they are written, so a
 * link always points back; what the model is told the plan is; the question Decide asks and its reason. DATA, so the record
 * names no use case: the New project guide says it forms milestones, steps, choices and resources.
 */
export type FormSpec = { what: string; question: string; why: string; lists: readonly FormList[] };

/** What a model is handed to form a plan: the sentence, what the plan is, and the lists with their limits. Nothing of the record. */
export type SlashFormInput = { what: string; said: string; today: string; lists: readonly FormList[] };

/** The longest sentence a plan is formed from. What somebody says a project is fits in far less. */
export const FORM_SAID_MOST = 600;

/* A WEB ADDRESS OR AN EMAIL IN A FORMED ROW is refused: a plan points only at its own rows, and nobody checked a model's link. */
const ADDRESS = /(?:[a-z][a-z0-9+.-]*:\/\/|\bwww\.|\b[a-z0-9-]+\.(?:com|net|org|io|app|dev|co|ai|xyz|me)\b|[a-z0-9._%+-]+@[a-z0-9-]+\.)/iu;
/* A CHARACTER TEXT DOES NOT HOLD: a control character other than a tab or a line break. */
const CONTROL = /[\p{Cc}]/u;
const TEXT_BREAKS = /[\t\n\r]/gu;

type FormedRow = { register: string; fields: Record<string, unknown>; links?: Record<string, number> };

/**
 * A model's plan as the rows an arrangement carries, or why it is not one. ALL OR NOTHING: a list or a field the spec does
 * not name, a count outside its bounds, text past its length, a link to a row that is not earlier in the plan, an address,
 * or anything shaped like a credential, and the whole answer is refused, so the use case's own plan stands instead.
 *
 * The answer is `{ "plan": { "<list>": [ { "<field>": ... } ] } }`, or that object bare. PURE.
 */
export function formedRows(
  raw: unknown,
  spec: FormSpec,
  today: string,
  credential: (text: string) => boolean,
): { ok: true; rows: FormedRow[] } | { ok: false; why: string } {
  const isObject = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);
  const no = (why: string) => ({ ok: false as const, why });
  const plan = isObject(raw) && isObject(raw.plan) ? raw.plan : raw;
  if (!isObject(plan)) return no('The model did not answer a plan.');
  const named = new Set(spec.lists.map((l) => l.register));
  const stray = Object.keys(plan).find((k) => !named.has(k));
  if (stray !== undefined) return no(`The plan named a list it may not fill: ${stray.slice(0, 40)}.`);

  /* WHERE EACH LIST'S ROWS START in the rows written, so a link by position becomes a position in the whole plan. */
  const start = new Map<string, number>();
  let total = 0;
  for (const list of spec.lists) {
    const rows = plan[list.register] ?? [];
    if (!Array.isArray(rows) || rows.length < list.least || rows.length > list.most) return no(`The plan's ${list.register} were not a list of ${list.least} to ${list.most}.`);
    start.set(list.register, total);
    total += rows.length;
  }

  const [y, m, d] = today.split('-').map(Number);
  const out: FormedRow[] = [];
  for (const list of spec.lists) {
    const rows = (plan[list.register] ?? []) as unknown[];
    for (const [i, row] of rows.entries()) {
      const where = `${list.register} ${i + 1}`;
      if (!isObject(row)) return no(`The plan's ${where} was not a row.`);
      const extra = Object.keys(row).find((k) => !Object.hasOwn(list.fields, k));
      if (extra !== undefined) return no(`The plan's ${where} gave a field it may not: ${extra.slice(0, 40)}.`);
      const fields: Record<string, unknown> = { ...(i === 0 ? list.first : list.rest), ...(list.position ? { [list.position]: i + 1 } : {}) };
      const links: Record<string, number> = {};
      for (const [id, f] of Object.entries(list.fields)) {
        const v = row[id];
        if (v === undefined || v === null || v === '') {
          if (f.required) return no(`The plan's ${where} had no ${id}.`);
          continue;
        }
        if ('text' in f) {
          if (typeof v !== 'string') return no(`The plan's ${where} gave ${id} as something other than text.`);
          const text = v.trim();
          if (text === '' || text.length > f.text) return no(`The plan's ${where} gave ${id} longer than ${f.text} characters.`);
          if (CONTROL.test(text.replace(TEXT_BREAKS, ' '))) return no(`The plan's ${where} gave ${id} with characters text does not hold.`);
          if (ADDRESS.test(text)) return no(`The plan's ${where} gave an address in ${id}, and a plan points only at its own rows.`);
          if (credential(text)) return no(`The plan's ${where} gave something shaped like a credential in ${id}.`);
          fields[id] = text;
        } else if ('one' in f) {
          if (typeof v !== 'string' || !f.one.includes(v)) return no(`The plan's ${where} gave ${id} a value it does not take.`);
          fields[id] = v;
        } else if ('link' in f) {
          const base = start.get(f.link);
          const count = Array.isArray(plan[f.link]) ? (plan[f.link] as unknown[]).length : 0;
          const to = base === undefined || typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= count ? -1 : base + v;
          if (to < 0 || to >= out.length) return no(`The plan's ${where} linked ${id} to a row that is not earlier in the plan.`);
          links[id] = to;
        } else {
          if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > f.days) return no(`The plan's ${where} gave ${id} as a number of days that is not whole or is past ${f.days}.`);
          fields[id] = new Date(Date.UTC(y!, m! - 1, d! + v)).toISOString().slice(0, 10);
        }
      }
      out.push({ register: list.register, fields, ...(Object.keys(links).length === 0 ? {} : { links }) });
    }
  }
  if (out.length === 0) return no('The plan had no rows.');
  return { ok: true, rows: out };
}

/* ── the next milestone, once one is reached ───────────────────────────── */

/**
 * WHAT MOVES ON WHEN A STEP OF A USE CASE IS REACHED (`CatalogueEntry.next`), as data: in `register`, once a row is in a done
 * state and none is in `to`, the first row in `from` by `order` is the next. The pack setting `setting` set true marks it
 * `to` directly; otherwise it is asked once on Decide. `{reached}` and `{next}` in `question` are the two rows' titles.
 */
export type NextSpec = { register: string; field: string; from: string; to: string; order: string; setting: string; question: string; note: string };

/* ── a newer version in a catalogue ─────────────────────────────────────── */

/** A later version of something installed, as the host found it in its catalogue, checked and read (`@braindog/declare/catalogue`). */
export type CatalogueOffer = {
  /** The pack id the record holds it under. */
  id: string;
  title: string;
  from: string;
  to: string;
  /** What `propose` takes: `{ file }` for a use case, `{ install, doc }` for an add-on. */
  body: Record<string, unknown>;
  /** The key id that signed it, or `null` when nothing did. */
  signedBy: string | null;
  /** The key id that verifiably signed the version installed, as the catalogue lists it, or `null` when nothing did or it is not listed. */
  installedSignedBy: string | null;
  /** Whether a statement from `installedSignedBy` names `signedBy` as its successor. */
  rotated: boolean;
  /** Hosts it would newly call out to, and what it takes away, when the catalogue still holds the version installed. */
  hostsAdded: readonly string[];
  removed: readonly string[];
  /** `false` when the catalogue no longer holds the version installed, so `hostsAdded` and `removed` could not be read. */
  changesKnown: boolean;
  /** An add-on BrainDog publishes, listed or private, whose update may go in on its own (`quiet.ts` `addons`). */
  firstParty?: boolean;
};

/**
 * Whether the record's own update pass keeps this offer current (`firstPartyTick`): BrainDog's own, under the key that
 * signed the version installed or a successor it named. That pass puts it in or asks about it once and keeps a no, so
 * Slash leaves it alone: asking too, it asked again the day after a no.
 */
export const nightKeeps = (o: CatalogueOffer): boolean => o.firstParty === true && (o.installedSignedBy === null || o.signedBy === o.installedSignedBy || o.rotated);

/** The one line saying who signed a version, held to the key that signed the version installed. */
function keyNote(o: CatalogueOffer): { text: string; warning: boolean } {
  const was = o.installedSignedBy;
  if (o.signedBy === null) return was === null ? { text: 'It is unsigned.', warning: false } : { text: `Warning: it is unsigned, and the version installed was signed by key ${was}.`, warning: true };
  if (was === null) return { text: `It is signed by key ${o.signedBy}.`, warning: false };
  if (was === o.signedBy) return { text: `It is signed by key ${o.signedBy}, the key that signed the version installed.`, warning: false };
  if (o.rotated) return { text: `It is signed by key ${o.signedBy}, which key ${was} that signed the version installed named as its successor.`, warning: false };
  return { text: `Warning: it is signed by key ${o.signedBy}, not key ${was} that signed the version installed.`, warning: true };
}

/**
 * An update question within `QUESTION_MAX`: warnings come straight after the question and are never cut for length. What
 * gives way, in order, is the line naming the catalogue, a key note that is not a warning, and then the title.
 */
function fitQuestion(title: string, from: string, to: string, warnings: readonly string[], plain: readonly string[]): string {
  const say = (t: string, rest: readonly string[]) => [`Update ${t} from ${from} to ${to}?`, ...warnings, ...rest].join(' ');
  for (const rest of [plain, plain.slice(0, -1), []]) if (say(title, rest).length <= QUESTION_MAX) return say(title, rest);
  const room = Math.max(12, title.length - (say(title, []).length - QUESTION_MAX) - 3);
  return say(`${title.slice(0, room).trimEnd()}...`, []).slice(0, QUESTION_MAX);
}

/**
 * Slash's question for each newer version: filed like any other draft, through `prepare`, so the plan on Decide is the
 * record's own and nothing is installed until the owner accepts it.
 */
export function catalogueDrafts(offers: readonly CatalogueOffer[]): SlashDraft[] {
  return offers.map((o) => {
    const key = keyNote(o);
    const warnings = [
      key.warning ? key.text : '',
      o.hostsAdded.length > 0 ? `It would newly call out to ${joinNames(o.hostsAdded)}.` : '',
      o.removed.length > 0 ? `It takes away ${joinNames(o.removed)}.` : '',
      o.changesKnown ? '' : `This catalogue no longer holds ${o.from}, so what it adds, takes away or newly calls out to is not known here. The plan on Decide says.`,
    ].filter((n) => n !== '');
    return {
      key: `catalogue:${o.id}@${o.to}`,
      question: fitQuestion(o.title, o.from, o.to, warnings, [...(key.warning ? [] : [key.text]), "This BrainDog's catalogue has it."]),
      body_kind: 'pack',
      body: o.body,
      by: 'rules',
    };
  });
}

/* ── a skill's next version, from what its learnings taught ──────────────── */

/** The most skills one daily look drafts: the briefing's own three (`apps/cli/src/brief.ts` `MAX_BEARING`). */
export const SKILL_DRAFTS_A_DAY = 3;

/** The most learnings one draft is handed, as `@braindog/slash`'s `SKILL_LEARNINGS_MOST` says. */
const SKILL_LEARNINGS_MOST = 8;

/** The longest skill text a draft may carry, as `@braindog/slash`'s `SKILL_BODY_MOST` says. */
const SKILL_BODY_MOST = 20_000;

/** How many skill rows the daily look weighs at most, so a record of a thousand skills is not read whole every day. */
const SKILLS_WEIGHED_MOST = 200;

/** How many learnings the daily look reads at most, newest first, for the same reason. */
const LEARNINGS_READ_MOST = 2_000;

/**
 * What the model is handed for one skill: the skill as it stands and the lessons it does not carry yet, and nothing else
 * of the record. `@braindog/slash` restates it in `skill-draft.ts`, since neither package may import the other.
 */
export type SkillDraftInput = {
  skill: { name: string; trigger: string; rev: number; body: string };
  learnings: readonly { id: string; lesson: string; because: string }[];
};

/** A skill with active learnings bearing on it that its `because` does not carry yet, as the daily look reads it. */
export type SkillBearing = {
  /** The skill's row id, the `at` its rowset names. */
  at: string;
  /** The version its row was read at, which the rowset carries so a row changed since is not overwritten. */
  version: number;
  name: string;
  trigger: string;
  rev: number;
  body: string;
  /** The learnings its `because` already names, kept in the next version's. */
  carried: string[];
  /** The learnings that bear on it and are not carried: row id, spoken id, the lesson and the failure behind it. */
  learnings: { id: string; spoken: string; lesson: string; because: string }[];
};

const textOf = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * The skills whose next version is waiting to be written, oldest skill first, `SKILL_DRAFTS_A_DAY` at most unless the
 * caller says how many (`stale` counts every one behind; the nightly draft writes a few).
 *
 * THE BRIEFING'S RULE, READ OVER THE WHOLE RECORD (`bearing` in `apps/cli/src/brief.ts`, which reads one project's
 * context): a learning bears on a skill when its `topic` is the skill's name, whatever the case and the space around it,
 * only an active lesson bears on anything, and a lesson the skill's `because` already names is in the skill. A skill of
 * the same name as one weighed before it is left for the next look, so two rows are never drafted from one lesson at once.
 */
export function skillBearings(sql: Sql, kernel: Kernel, most = SKILL_DRAFTS_A_DAY): SkillBearing[] {
  if (!kernel.register('skills') || !kernel.register('learnings')) return [];
  const prefix = kernel.register('learnings')?.seq_prefix;
  const spoken = (seq: number) => (prefix && prefix !== '#' ? `${prefix}${seq}` : `learnings#${seq}`);
  const byTopic = new Map<string, SkillBearing['learnings']>();
  for (const row of sql.all<{ id: string; seq: number; fields: string }>(
    "SELECT id, seq, fields FROM entry WHERE register = 'learnings' AND deleted_at IS NULL ORDER BY seq DESC LIMIT ?",
    LEARNINGS_READ_MOST,
  )) {
    let f: Record<string, unknown>;
    try {
      f = JSON.parse(row.fields) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (f.state !== undefined && f.state !== null && f.state !== 'active') continue;
    const topic = textOf(f.topic).toLowerCase();
    const lesson = textOf(f.lesson);
    if (!topic || !lesson) continue;
    byTopic.set(topic, [...(byTopic.get(topic) ?? []), { id: row.id, spoken: spoken(row.seq), lesson, because: textOf(f.because) }]);
  }
  if (byTopic.size === 0) return [];

  const out: SkillBearing[] = [];
  const seen = new Set<string>();
  for (const row of sql.all<{ id: string; version: number; fields: string }>(
    "SELECT id, version, fields FROM entry WHERE register = 'skills' AND deleted_at IS NULL ORDER BY seq LIMIT ?",
    SKILLS_WEIGHED_MOST,
  )) {
    if (out.length >= most) break;
    let f: Record<string, unknown>;
    try {
      f = JSON.parse(row.fields) as Record<string, unknown>;
    } catch {
      continue;
    }
    const name = textOf(f.name);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    if (f.state !== undefined && f.state !== null && f.state !== 'active') continue;
    const carried = Array.isArray(f.because) ? f.because.filter((id): id is string => typeof id === 'string') : [];
    const held = new Set(carried);
    /* Oldest lesson first, so the text takes them in the order they were learned. */
    const fresh = (byTopic.get(name.toLowerCase()) ?? []).filter((l) => !held.has(l.id)).reverse().slice(0, SKILL_LEARNINGS_MOST);
    if (fresh.length === 0) continue;
    out.push({
      at: row.id,
      version: row.version,
      name,
      trigger: textOf(f.trigger),
      rev: typeof f.rev === 'number' && Number.isInteger(f.rev) && f.rev > 0 ? f.rev : 1,
      body: typeof f.body === 'string' ? f.body : '',
      carried,
      learnings: fresh,
    });
  }
  return out;
}

/** What one skill's model is handed: the lessons by spoken id, which is how a person and the diff name them. */
export const skillDraftInput = (b: SkillBearing): SkillDraftInput => ({
  skill: { name: b.name, trigger: b.trigger, rev: b.rev, body: b.body },
  learnings: b.learnings.map((l) => ({ id: l.spoken, lesson: l.lesson, because: l.because })),
});

/** Words said as a person lists them: "LN12", "LN12 and LN15", "LN12, LN15 and LN18". */
const listed = (words: readonly string[]): string => (words.length < 2 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]!}`);

/**
 * What the model answered for one skill, as the draft the daily look files: one `rowset` on `skills` in the shape an
 * agent's `propose` sends (`packages/mcp/src/index.ts` `rowset`), its one row `{ at, version, patch }` with the whole new
 * `body`, `rev + 1` and `because` carrying the lessons it took in after the ones it held. `unchanged` when the lessons
 * change nothing; `why` when the answer could not be shaped into that rowset, which is dropped whole and never filed.
 *
 * THE HOST'S CHECK IS `@braindog/slash`'s `skillDraftShaped`; this is the record's own, because a port's answer is not
 * trusted for being checked on the far side of it.
 */
export function skillDraftOf(raw: unknown, b: SkillBearing, by: string): { draft: SlashDraft } | { unchanged: string } | { why: string } {
  const said = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (said === null) return { why: `Slash could not shape a next version of ${b.name} from the model's answer, so nothing was filed for it.` };
  if (typeof said.unchanged === 'string' && said.body === undefined)
    return { unchanged: `${b.name}: ${said.unchanged.trim().slice(0, 280) || 'the lessons change nothing.'}` };
  const body = typeof said.body === 'string' ? said.body.replace(/\r\n?/gu, '\n') : '';
  if (body.trim() === '' || [...body].length > SKILL_BODY_MOST)
    return { why: `Slash could not shape a next version of ${b.name} from the model's answer, so nothing was filed for it.` };
  if (body.trim() === b.body.replace(/\r\n?/gu, '\n').trim()) return { unchanged: `${b.name}: the model wrote the same text back.` };
  const rev = b.rev + 1;
  const ids = b.learnings.map((l) => l.spoken);
  const rowset = {
    register: 'skills',
    rows: [{ at: b.at, version: b.version, patch: { body, rev, because: [...b.carried, ...b.learnings.map((l) => l.id)] } }],
  };
  const one = ids.length === 1;
  const question = `Take version ${rev} of the skill ${b.name}? It takes in what ${listed(ids)} ${one ? 'teaches' : 'teach'}.`;
  return { draft: { key: stableKey(rowset), question: question.length > 280 ? `${question.slice(0, 277)}...` : question, body_kind: 'rowset', body: rowset, by } };
}
