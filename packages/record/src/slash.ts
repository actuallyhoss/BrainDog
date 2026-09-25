/**
 * Slash reading how a BrainDog is used, and what it proposes about it (`loop/research-spark.md` S15, `loop/DIRECTION.md` §11).
 *
 * TIER A READ A SENTENCE; THIS READS THE RECORD. Which lists grow, which pages are opened, what nothing has touched in a
 * quarter, and what agents write. From that it says what it noticed, in plain sentences, and drafts at most a few
 * proposals in the kinds an agent already files (`pack`, `settings`, `arrange`, and a `rowset` for a skill a use case names),
 * each with its reason as the question. The words it may change are only those the speaking use case declares (S8). A
 * model may also draft a `change` that builds a register, an ingest, a rule or a page (`fromModel`, Brief D).
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

import type { FigureTest, Grows } from './arrange.ts';
import type { Sql } from '@braindog/ports';
import type { Kernel } from '@braindog/kernel';
import { labelSetting, voiceSetting } from '@braindog/declare';

const DAY_MS = 86_400_000;

/** A list gains this many rows, on this many separate days, in thirty days before it is said to grow. */
const GROWS = { rows: 5, days: 3 };
/** Agents write this many times, on this many separate days, in thirty days before Slash says they work here. */
const AGENTS = { writes: 10, days: 3 };
/** Ninety days of silence, from the same rule of three `observe.ts` uses for a dormant declaration. */
const QUIET_DAYS = 90;
/** A record younger than this is watched and not advised: a fortnight of use is not a habit (`observe.ts` governors). */
const YOUNG_DAYS = 14;
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
 * One of a list, from its name: Issues, issue.
 *
 * THE RULE THE APP ALREADY APPLIES, from `apps/web/src/lib/voice.ts`. A list renamed with no singular given is already
 * SHOWN in the singular this makes, so drafting it writes down the word the reader is seeing rather than guessing a new
 * one. It is deliberately two cases and no more: anything it cannot turn comes back as the name in lower case, which is
 * the right answer for a list whose name is already singular and is left undrafted below when it says nothing new.
 */
const singularOf = (name: string): string => name.toLowerCase().replace(/ies$/u, 'y').replace(/([^s])s$/u, '$1');

/** One word of a line, matched whole and in any case, so renaming a list does not rewrite the middle of another word. */
const wordIn = (word: string): RegExp => new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\b`, 'giu');

/** How Home heads its recent changes when agents do most of the work, and when no agent has worked in a quarter. */
export const AGENTS_LINE = 'What you and your agents did since you last looked';
export const QUIET_LINE = 'Since you last looked';
/** At most this many arrangement questions open at once (ADR-051). */
export const SLASH_OPEN_CAP = 3;

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
};

/** One of the speaking use case's words: a voice line or a label, as declared and as it reads now. */
export type ToneSetting = { title: string | null; default: string | null; value: string | null };

/** The speaking use case's words by setting name (`voice_home`, `label_tickets`): only the text settings it declares. */
export type Tone = { pack: string; settings: Record<string, ToneSetting> };

export type AgentUse = { actor: string; writes30: number; days30: number; lists: string[] };

export type PackUse = { id: string; title: string; on: boolean; usecase: boolean; since: string | null };

export type Usage = {
  at: string;
  /** The first write this record holds, and how many days ago that was. */
  firstWrite: string | null;
  ageDays: number;
  /** Whether pages being opened and lists being read are recorded at all here, in ninety days (two subjects on three days). */
  listening: { pages: boolean; lists: boolean };
  lists: ListUse[];
  pages: PageUse[];
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
};

/** A thing Slash noticed, said in one sentence. */
export type Noticed = { kind: 'grows' | 'agents' | 'unopened' | 'untouched' | 'voice' | 'young' | 'label' | 'skills'; subject: string; text: string };

/** A proposal Slash would file: the question is its reason, and the body is what `propose` takes. */
export type SlashDraft = {
  /** What it is about, stable across readings, so the same draft is recognised once it has been asked. */
  key: string;
  question: string;
  body_kind: 'pack' | 'settings' | 'arrange' | 'rowset' | 'change';
  body: Record<string, unknown>;
  /** Who drafted it: the rules, or the model named. */
  by: string;
};

export type Offered = {
  id: string;
  kind: 'pack' | 'usecase';
  title: string;
  modules: readonly string[];
  /** Whether the pack's own pages show what agents are doing, so it is worth offering when agents write here. */
  showsAgents: boolean;
  /** The skills a use case names for agents working in it (`research-spark.md` S9), offered once it is on. */
  skills?: readonly { name: string; trigger: string }[] | undefined;
};

const isAgent = (actor: string): boolean => /^S\d+$/u.test(actor) || actor.startsWith('agent:') || actor === 'slash';

const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const instantOf = (ms: number): string => new Date(ms).toISOString();

/** A page body's block sources and kinds, to tell whether it shows what agents do. */
export function pageShowsAgents(body: unknown): boolean {
  const blocks = (body as { blocks?: unknown })?.blocks;
  if (!Array.isArray(blocks)) return false;
  return blocks.some((b) => {
    const x = b as { kind?: unknown; source?: unknown };
    return x?.kind === 'agents' || x?.source === 'activity' || x?.source === 'sessions.live';
  });
}

/**
 * How this record is used, read from its own tables: the log, the rows, the observations and the declarations.
 *
 * READ ONLY, and bounded to ninety days of the log, so it is one pass over a quarter rather than over a record's life.
 */
export function readUsage(sql: Sql, kernel: Kernel, nowMs: number, titles: ReadonlyMap<string, string> = new Map(), speaking: string | null = null): Usage {
  const since30 = instantOf(nowMs - 30 * DAY_MS);
  const since90 = instantOf(nowMs - QUIET_DAYS * DAY_MS);
  const day30 = dayOf(nowMs - 30 * DAY_MS);
  const day90 = dayOf(nowMs - QUIET_DAYS * DAY_MS);

  const firstWrite = sql.one<{ ts: string }>('SELECT ts FROM event ORDER BY rowid LIMIT 1')?.ts ?? null;
  const ageDays = firstWrite === null ? 0 : Math.floor((nowMs - Date.parse(firstWrite)) / DAY_MS);

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
  for (const d of declared) {
    const bare = d.id.slice(d.id.indexOf('.') + 1);
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(d.body) as Record<string, unknown>;
    } catch {
      /* a body that will not parse is nothing Slash can say anything about */
    }
    if (d.kind === 'register') {
      if (bare === 'session') continue;
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
      pages.push({
        slug: bare,
        title: titled ? String(body.title) : bare,
        titled,
        pack: d.pack,
        registers: registersIn(body),
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

  const packs: PackUse[] = kernel.packStates().map((p) => {
    const mine = declared.filter((d) => d.pack === p.id).map((d) => d.created_at).sort();
    return { id: p.id, title: titles.get(p.id) ?? p.id, on: p.disabled_at === null, usecase: p.id.startsWith('usecase-'), since: mine[0] ?? null };
  });

  return {
    at: instantOf(nowMs),
    firstWrite,
    ageDays,
    listening: { pages: alive('page.render'), lists: alive('register.read') },
    lists,
    pages,
    agents: [...agents.entries()]
      .map(([actor, a]) => ({ actor, writes30: a.writes30, days30: a.days.size, lists: [...a.lists.entries()].sort((x, y) => y[1] - x[1]).map(([id]) => id) }))
      .sort((a, b) => b.writes30 - a.writes30),
    packs,
    speaking,
    writes,
    tone,
    skills: kernel.register('skills')
      ? sql
          .all<{ name: string | null }>("SELECT json_extract(fields, '$.name') AS name FROM entry WHERE register = 'skills' AND deleted_at IS NULL")
          .flatMap((r) => (typeof r.name === 'string' ? [r.name] : []))
      : null,
  };
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

/** A slug no page holds, for a page over `list`. */
function freeSlug(list: string, pages: readonly PageUse[]): string {
  const taken = new Set(pages.map((p) => p.slug));
  for (const slug of [list.replaceAll('_', '-'), `${list.replaceAll('_', '-')}-list`]) if (!taken.has(slug)) return slug;
  let i = 2;
  while (taken.has(`${list.replaceAll('_', '-')}-${i}`)) i++;
  return `${list.replaceAll('_', '-')}-${i}`;
}

/**
 * What Slash noticed and what it would propose, from a reading. PURE: the same reading always says the same thing.
 *
 * `nowMs` is the reading's own moment; `offered` is the host's catalogue as Slash needs it.
 */
export function noticeUsage(usage: Usage, offered: readonly Offered[]): { noticed: Noticed[]; drafts: SlashDraft[]; quiet: string | null } {
  const nowMs = Date.parse(usage.at);
  const noticed: Noticed[] = [];
  const drafts: SlashDraft[] = [];
  const listName = (id: string): string => usage.lists.find((l) => l.id === id)?.name ?? id;
  const packTitle = (id: string): string => offered.find((o) => o.id === id)?.title ?? usage.packs.find((p) => p.id === id)?.title ?? id;

  /* WHAT GROWS, most first. */
  const growing = usage.lists.filter((l) => l.added30 >= GROWS.rows && l.addedDays30 >= GROWS.days).sort((a, b) => b.added30 - a.added30);
  for (const l of growing) {
    noticed.push({ kind: 'grows', subject: l.id, text: `${l.name} gained ${plural(l.added30, 'row')} in the last thirty days, on ${l.addedDays30} separate days.` });
    /* A LIST THAT GROWS AND NO PAGE SHOWS gets a page of its own, filed beside its pack's pages in the rail. */
    if (!usage.pages.some((p) => p.registers.includes(l.id))) {
      const slug = freeSlug(l.id, usage.pages);
      const section = usage.pages.find((p) => p.pack !== null && p.pack === l.pack)?.title ?? l.name;
      drafts.push({
        key: `page:${l.id}`,
        question: `Give ${l.name} a page of its own? It gained ${plural(l.added30, 'row')} in the last thirty days, and no page shows it yet.`,
        body_kind: 'arrange',
        body: {
          why: [`${l.name} gained ${plural(l.added30, 'row')} in thirty days, and no page shows it.`],
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
        },
        by: 'rules',
      });
    }
  }

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
        question: `Turn off ${title}? Nothing in it has been opened or changed in ninety days. Its rows stay, and you can turn it back on.`,
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
        text: `Most of what you added this month went into ${title} (${plural(other.n, 'row')}), while ${packTitle(usage.speaking)} gained ${now}.`,
      });
      drafts.push({
        key: `voice:${other.p.id}`,
        question: `Let ${title} set the tone? Most of what you added in the last thirty days went there, and BrainDog still speaks as ${packTitle(usage.speaking)}.`,
        body_kind: 'arrange',
        /* THE SETTING IS WHAT MAKES IT A CHANGE; accepting an arrangement led by a use case then writes the voice rule down with it speaking. */
        body: { usecase: other.p.id.slice('usecase-'.length), settings: [{ pack: other.p.id, values: { speaks: true } }], why: [`${plural(other.n, 'row')} added to ${title} in thirty days, and ${now} to ${packTitle(usage.speaking)}.`] },
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
      if (!held) continue;
      const word = held.value ?? list.name;
      const title = p.title.trim();
      if (title.length > LABEL_MOST || title.toLowerCase() === word.toLowerCase()) continue;
      worded.add(list.id);
      const seen = `You opened the ${title} page, which shows ${word}, ${plural(p.opens30, 'time')} on ${p.openDays30} separate days in the last thirty days.`;
      noticed.push({ kind: 'label', subject: list.id, text: `You opened ${title}, a page of ${word}, ${plural(p.opens30, 'time')} in the last thirty days.` });
      drafts.push({
        key: '',
        question: `Call ${word} ${title} everywhere? ${seen}`,
        body_kind: 'settings',
        body: { pack: tone.pack, values: { [setting]: title } },
        by: 'rules',
      });

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
      const one = singularOf(title);
      if (oneHeld && one !== '' && one !== (oneHeld.value ?? oneHeld.default ?? '').toLowerCase())
        drafts.push({
          key: '',
          question: `Call one of them ${one}? ${seen}`,
          body_kind: 'settings',
          body: { pack: tone.pack, values: { [oneSetting]: one } },
          by: 'rules',
        });

      /* WHAT IT HOLDS, IN THE NEW WORD. Only the old word is swapped, so the sentence stays the one its author wrote; a
         line that never named the old word has nothing here to draft and is left alone. */
      const holdsSetting = labelSetting(`${list.id}:holds`);
      const holdsHeld = tone.settings[holdsSetting];
      const line = holdsHeld ? (holdsHeld.value ?? holdsHeld.default ?? '') : '';
      const said = line.replace(wordIn(word), title.toLowerCase()).replace(wordIn(singularOf(word)), one);
      if (line !== '' && said !== line && said.length <= HOLDS_MOST)
        drafts.push({
          key: '',
          question: `Say ${title} holds ${said}? The line reads "${line}" now, in the word this list was called before.`,
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
      } else if (namesAgents && usage.writes.agents90 === 0 && usage.ageDays >= QUIET_DAYS) {
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

  /* THE SKILLS A USE CASE NAMES (S9), once it is on and the record keeps skills: each one it does not hold yet is a row for
     the owner to accept, never one written for them. */
  if (usage.skills !== null) {
    const held = new Set(usage.skills);
    const missing = offered
      .filter((o) => o.kind === 'usecase' && usage.packs.some((p) => p.id === o.id && p.on))
      .flatMap((o) => (o.skills ?? []).filter((s) => !held.has(s.name)).map((s) => ({ o, s })));
    const naming = [...new Set(missing.map(({ o }) => o.title))];
    if (missing.length > 0)
      noticed.push({
        kind: 'skills',
        subject: missing.map(({ s }) => s.name).join(','),
        text: `${joinNames(naming)} ${naming.length === 1 ? 'names' : 'name'} ${missing.length === 1 ? 'a skill' : 'skills'} for agents that your Skills list does not hold: ${joinNames(missing.map(({ s }) => s.name))}.`,
      });
    for (const { o, s } of missing)
      drafts.push({
        key: '',
        question: `Give your agents the skill ${s.name}? ${o.title} names it for ${momentOf(s.trigger)}, and your Skills list has none by that name.`,
        body_kind: 'rowset',
        body: {
          register: 'skills',
          rows: [{ name: s.name, trigger: s.trigger, what: `A skill ${o.title} names for agents working here.`, kind: 'skill', body: `Use this skill ${s.trigger}.\n\n${o.title} names it. Its steps are not written yet.\n` }],
        },
        by: 'rules',
      });
  }

  /* A YOUNG RECORD IS WATCHED, NOT ADVISED. What was noticed is still said; nothing is proposed yet. */
  if (usage.firstWrite === null || usage.ageDays < YOUNG_DAYS)
    return {
      noticed,
      drafts: [],
      quiet:
        usage.firstWrite === null
          ? 'Nothing has been added yet, so there is nothing to go on.'
          : `${usage.ageDays < 1 ? 'This BrainDog started today' : usage.ageDays === 1 ? 'This BrainDog started yesterday' : `This BrainDog is ${plural(usage.ageDays, 'day')} old`}. Slash waits for two weeks of use before it suggests changes.`,
    };
  return { noticed, drafts: keyed(drafts), quiet: null };
}

/** A skill's moment without what it then does: "when a ticket is opened, to set its priority" is "when a ticket is opened". */
const momentOf = (trigger: string): string => trigger.split(', to ')[0]!.trim();

/** Each draft keyed by what its body is about, the key a filed question is recognised by. */
const keyed = (drafts: readonly SlashDraft[]): SlashDraft[] => drafts.map((d) => ({ ...d, key: stableKey(d.body) }));

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
}

export type SlashModelInput = {
  usage: Usage;
  noticed: readonly Noticed[];
  rules: readonly { question: string; body_kind: string; body: Record<string, unknown> }[];
  offered: readonly { id: string; kind: string; title: string }[];
  /** The kinds it may answer, and how many at most. */
  kinds: readonly SlashKind[];
  most: number;
};

/** What a model may draft: the three that arrange what is installed, and a `change` that builds one declaration. */
export type SlashKind = 'pack' | 'settings' | 'arrange' | 'change';

const QUESTION_MAX = 280;

/**
 * THE DECLARATIONS A MODEL MAY BUILD WITH A `change` (`loop/research-shell-mcp.md` §4 Brief D, `DIRECTION.md` §22): a list,
 * a door in or out, a rule, a page. A gold rate on a schedule is an `ingest` into a register, and before this Slash dropped
 * it with "Slash files only pack, settings and arrange", so the one use case the owner named could not be built by Slash.
 * A theme, a metric, a digest or a block is left to a person or an agent, because nothing Slash reads says what one should be.
 */
const BUILDS: ReadonlySet<string> = new Set(['register', 'ingest', 'rule', 'page']);

/** "a register", "an ingest": the article a kind takes when a dropped line names it. */
const aKind = (kind: string): string => `${/^[aeiou]/u.test(kind) ? 'an' : 'a'} ${kind}`;

/**
 * A model's `change` body as the kernel takes it, or why it is dropped. `to` is one declaration or `{ declarations }` of
 * them, and every one must be a kind in `BUILDS`. `declaration_id` is filled from `to` when the model left it out, as the
 * kernel's `namesFault` would otherwise refuse it; a wrong one is left for the kernel to refuse with its own sentence.
 *
 * WHAT IT SENDS OUT IS LEFT TO THE KERNEL, WHICH IS THE GUARD. `kernel.propose` drops whatever `egress` and `approve` a
 * proposer wrote and stores its own review of the declarations (`kernel/src/govern.ts`). A second strip here was measured
 * to change nothing: with it removed the gold-rate test still found no trace of the model's host in the filed row, and
 * `stableKey` never reads either field, so a model that varies the egress it writes is still asked once.
 */
function changeBody(
  body: Record<string, unknown>,
  n: number,
  drawn?: (id: string) => number,
): { ok: true; body: Record<string, unknown> } | { ok: false; why: string } {
  const to = body.to;
  if (to === null || typeof to !== 'object' || Array.isArray(to)) return { ok: false, why: `Proposal ${n} was a change with no declaration in it.` };
  const bundle = (to as { declarations?: unknown }).declarations;
  const listed = (Array.isArray(bundle) ? bundle : [to]) as { id?: unknown; kind?: unknown }[];
  if (listed.length === 0) return { ok: false, why: `Proposal ${n} was a change with no declaration in it.` };
  const stray = listed.find((d) => typeof d?.kind !== 'string' || !BUILDS.has(d.kind));
  if (stray !== undefined)
    return { ok: false, why: `Proposal ${n} was a change to ${aKind(String(stray?.kind ?? 'unnamed kind')).slice(0, 40)}, and Slash changes only a register, an ingest, a rule or a page.` };
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
  return { ok: true, body: { ...body, declaration_id: named, ...versions } };
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
 */
export function fromModel(
  raw: unknown,
  name: string,
  most = SLASH_OPEN_CAP,
  drawn?: (id: string) => number,
): { drafts: SlashDraft[]; dropped: string[] } {
  const list = Array.isArray(raw) ? raw : Array.isArray((raw as { drafts?: unknown })?.drafts) ? (raw as { drafts: unknown[] }).drafts : null;
  if (list === null) return { drafts: [], dropped: ['The model did not answer a list of proposals.'] };
  const drafts: SlashDraft[] = [];
  const dropped: string[] = [];
  for (const [i, x] of list.entries()) {
    const d = x as { question?: unknown; body_kind?: unknown; body?: unknown };
    if (typeof d?.question !== 'string' || !d.question.trim() || d.question.length > QUESTION_MAX) {
      dropped.push(`Proposal ${i + 1} had no question, or one over ${QUESTION_MAX} characters.`);
      continue;
    }
    if (d.body_kind !== 'pack' && d.body_kind !== 'settings' && d.body_kind !== 'arrange' && d.body_kind !== 'change') {
      dropped.push(`Proposal ${i + 1} was a ${String(d.body_kind)} proposal, and Slash files only pack, settings, arrange and change.`);
      continue;
    }
    if (d.body === null || typeof d.body !== 'object' || Array.isArray(d.body)) {
      dropped.push(`Proposal ${i + 1} had no body.`);
      continue;
    }
    let body = d.body as Record<string, unknown>;
    if (d.body_kind === 'change') {
      const built = changeBody(body, i + 1, drawn);
      if (!built.ok) {
        dropped.push(built.why);
        continue;
      }
      body = built.body;
    }
    if (drafts.length >= most) {
      dropped.push(`Proposal ${i + 1} was past the ${most} Slash files at once.`);
      continue;
    }
    drafts.push({ key: stableKey(body), question: d.question.trim(), body_kind: d.body_kind, body, by: name });
  }
  return { drafts, dropped };
}

/** What a body is about, for recognising it once asked: the pack it names, the use case, or the pages it adds. */
export function stableKey(body: Record<string, unknown>): string {
  /* AN INSTALL CARRYING ITS OWN DOCUMENT is that version, so a newer version from a catalogue is a new question. */
  const carried = body.doc !== null && typeof body.doc === 'object' ? (body.doc as { version?: unknown }).version : undefined;
  if (typeof body.install === 'string' && typeof carried === 'string') return `install:${body.install}@${carried}`;
  for (const k of ['install', 'enable', 'disable', 'usecase'] as const) if (typeof body[k] === 'string') return `${k}:${body[k]}`;
  /* A CHANGE IS THE DECLARATION IT INSTALLS, whole, so a gold rate declined is not asked again and a different one is a new
     question. The egress the kernel adds is left out, so the key is the same on the draft and on the row it was filed as. */
  if (typeof body.declaration_id === 'string' && body.to !== null && typeof body.to === 'object')
    return `change:${body.declaration_id}:${JSON.stringify(body.to)}`;
  /* A SETTINGS CHANGE IS WHAT IT SETS, so turning a line one way and back again are two questions, and each is asked once. */
  if (typeof body.pack === 'string')
    return `settings:${body.pack}:${Object.entries((body.values as Record<string, unknown>) ?? {})
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${k}=${JSON.stringify(v ?? null)}`)
      .join(',')}`;
  /* A PLAN'S ROWS are what it is about by the lists it fills, so a first plan is asked once. */
  if (body.register === undefined && Array.isArray(body.rows))
    return `plan:${[...new Set(body.rows.map((r) => String((r as { register?: unknown })?.register)))].sort().join(',')}`;
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
};

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
