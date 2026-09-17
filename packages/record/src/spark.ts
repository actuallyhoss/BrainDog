/**
 * Spark reading how a BrainDog is used, and what it proposes about it (`loop/research-spark.md` S15, `loop/DIRECTION.md` §11).
 *
 * TIER A READ A SENTENCE; THIS READS THE RECORD. Which lists grow, which pages are opened, what nothing has touched in a
 * quarter, and what agents write. From that it says what it noticed, in plain sentences, and drafts at most a few
 * proposals in the three kinds an agent already files (`pack`, `settings`, `arrange`), each with its reason as the question.
 *
 * IT RECOMMENDS AND NEVER REARRANGES (§5c, `docs/29` §1). Nothing here writes a row, a pack or a setting. A draft becomes a
 * question only through `arranger().prepare`, the same door and the same validation a token's proposal goes through, and
 * only an owner's press on Decide applies it. A draft the owner dismissed is never drafted again.
 *
 * DETERMINISTIC FIRST, A MODEL OPTIONALLY. `readUsage` and `noticeUsage` need nothing configured, so a fresh self-host runs
 * them. A model, when one is configured (`SparkModel`), is handed the same reading and may draft instead; what it answers is
 * checked here for shape and then goes through the same door, and when it fails or says nothing valid the rules speak.
 *
 * THE LAWS ARE `kernel/observe.ts`'S: a burst is not a pattern (a count AND a number of separate days), and a silence is only
 * evidence where presence is being recorded (a page nobody opens counts only on a record where other pages are opened).
 */

import type { Sql } from '@braindog/ports';
import type { Kernel } from '@braindog/kernel';

const DAY_MS = 86_400_000;

/** A list gains this many rows, on this many separate days, in thirty days before it is said to grow. */
const GROWS = { rows: 5, days: 3 };
/** Agents write this many times, on this many separate days, in thirty days before Spark says they work here. */
const AGENTS = { writes: 10, days: 3 };
/** Ninety days of silence, from the same rule of three `observe.ts` uses for a dormant declaration. */
const QUIET_DAYS = 90;
/** A record younger than this is watched and not advised: a fortnight of use is not a habit (`observe.ts` governors). */
const YOUNG_DAYS = 14;
/** Another use case's lists take this many times the speaking one's new rows, and at least `VOICE.rows`, before the voice is questioned. */
const VOICE = { ratio: 3, rows: 10 };
/** At most this many arrangement questions open at once (ADR-051). */
export const SPARK_OPEN_CAP = 3;

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

export type PageUse = { slug: string; title: string; pack: string | null; registers: string[]; opens30: number; opens90: number; lastOpened: string | null; declaredAt: string };

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
};

/** A thing Spark noticed, said in one sentence. */
export type Noticed = { kind: 'grows' | 'agents' | 'unopened' | 'untouched' | 'voice' | 'young'; subject: string; text: string };

/** A proposal Spark would file: the question is its reason, and the body is what `propose` takes. */
export type SparkDraft = {
  /** What it is about, stable across readings, so the same draft is recognised once it has been asked. */
  key: string;
  question: string;
  body_kind: 'pack' | 'settings' | 'arrange';
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
};

const isAgent = (actor: string): boolean => /^S\d+$/u.test(actor) || actor.startsWith('agent:') || actor === 'spark';

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

  /* WRITES IN NINETY DAYS, by actor, list and day: one pass over the log for both "untouched" and "what agents write". */
  const writes90 = new Map<string, number>();
  const agentWrites30 = new Map<string, number>();
  const agents = new Map<string, { writes30: number; days: Set<string>; lists: Map<string, number> }>();
  for (const r of sql.all<{ actor: string; register: string; day: string; n: number }>(
    `SELECT e.actor AS actor, en.register AS register, substr(e.ts, 1, 10) AS day, count(*) AS n
       FROM event e JOIN entry en ON en.id = substr(e.target, 7)
      WHERE e.ts >= ? AND e.target_kind = 'entry' AND e.kind IN ${WRITES}
      GROUP BY e.actor, en.register, day`,
    since90,
  )) {
    const n = Number(r.n);
    writes90.set(r.register, (writes90.get(r.register) ?? 0) + n);
    if (r.day >= day30 && isAgent(r.actor)) {
      agentWrites30.set(r.register, (agentWrites30.get(r.register) ?? 0) + n);
      const a = agents.get(r.actor) ?? { writes30: 0, days: new Set<string>(), lists: new Map<string, number>() };
      a.writes30 += n;
      a.days.add(r.day);
      a.lists.set(r.register, (a.lists.get(r.register) ?? 0) + n);
      agents.set(r.actor, a);
    }
  }

  const observed = (kind: string, from: string) =>
    new Map(
      sql
        .all<{ subject: string; n: number; last: string }>('SELECT subject, sum(n) AS n, max(day) AS last FROM observation WHERE kind = ? AND day >= ? GROUP BY subject', kind, from)
        .map((r) => [r.subject, { n: Number(r.n), last: r.last }]),
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
      /* a body that will not parse is nothing Spark can say anything about */
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
      pages.push({
        slug: bare,
        title: typeof body.title === 'string' && !body.title.includes('{{') ? body.title : bare,
        pack: d.pack,
        registers: registersIn(body),
        opens30: opens30.get(bare)?.n ?? 0,
        opens90: opens90.get(bare)?.n ?? 0,
        lastOpened: opens90.get(bare)?.last ?? null,
        declaredAt: d.created_at,
      });
    }
  }

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
  };
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
 * What Spark noticed and what it would propose, from a reading. PURE: the same reading always says the same thing.
 *
 * `nowMs` is the reading's own moment; `offered` is the host's catalogue as Spark needs it.
 */
export function noticeUsage(usage: Usage, offered: readonly Offered[]): { noticed: Noticed[]; drafts: SparkDraft[]; quiet: string | null } {
  const nowMs = Date.parse(usage.at);
  const noticed: Noticed[] = [];
  const drafts: SparkDraft[] = [];
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

  /* PAGES NOBODY OPENS, only where opening pages is recorded at all. */
  if (usage.listening.pages)
    for (const p of usage.pages)
      if (p.opens90 === 0 && olderThan(p.declaredAt, QUIET_DAYS, nowMs))
        noticed.push({ kind: 'unopened', subject: p.slug, text: `Nobody has opened ${p.title} in ninety days.` });

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

  /* A YOUNG RECORD IS WATCHED, NOT ADVISED. What was noticed is still said; nothing is proposed yet. */
  if (usage.firstWrite === null || usage.ageDays < YOUNG_DAYS)
    return {
      noticed,
      drafts: [],
      quiet:
        usage.firstWrite === null
          ? 'Nothing has been added yet, so there is nothing to go on.'
          : `This BrainDog is ${plural(usage.ageDays, 'day')} old. Spark waits for two weeks of use before it suggests changes.`,
    };
  return { noticed, drafts: keyed(drafts), quiet: null };
}

/** Each draft keyed by what its body is about, the key a filed question is recognised by. */
const keyed = (drafts: readonly SparkDraft[]): SparkDraft[] => drafts.map((d) => ({ ...d, key: stableKey(d.body) }));

/* ── a model, when one is configured ───────────────────────────────────── */

/**
 * A model Spark may ask to draft proposals. THE PORT, NOT A PROVIDER: the host builds one from a person's own key or a self-host's
 * endpoint, and this package never sees either. It is handed the reading, what was noticed, the rules' drafts and what is on
 * offer, and answers raw drafts. It writes nothing: what it answers is checked by `fromModel` and filed, if at all, through
 * the same `prepare` a token's proposal goes through.
 */
export interface SparkModel {
  /** A short name to say who drafted, such as `endpoint` or `own key`. Never a key or an address. */
  readonly name: string;
  draft(input: SparkModelInput): Promise<unknown>;
}

export type SparkModelInput = {
  usage: Usage;
  noticed: readonly Noticed[];
  rules: readonly { question: string; body_kind: string; body: Record<string, unknown> }[];
  offered: readonly { id: string; kind: string; title: string }[];
  /** The kinds it may answer, and how many at most. */
  kinds: readonly ['pack', 'settings', 'arrange'];
  most: number;
};

const QUESTION_MAX = 280;

/**
 * A model's answer as drafts: `{ drafts: [{ question, body_kind, body }] }` or the bare list. Anything else is dropped, and
 * why is said, so a model that answers nonsense is a line on the Spark page rather than a question on Decide.
 */
export function fromModel(raw: unknown, name: string, most = SPARK_OPEN_CAP): { drafts: SparkDraft[]; dropped: string[] } {
  const list = Array.isArray(raw) ? raw : Array.isArray((raw as { drafts?: unknown })?.drafts) ? (raw as { drafts: unknown[] }).drafts : null;
  if (list === null) return { drafts: [], dropped: ['The model did not answer a list of proposals.'] };
  const drafts: SparkDraft[] = [];
  const dropped: string[] = [];
  for (const [i, x] of list.entries()) {
    const d = x as { question?: unknown; body_kind?: unknown; body?: unknown };
    if (typeof d?.question !== 'string' || !d.question.trim() || d.question.length > QUESTION_MAX) {
      dropped.push(`Proposal ${i + 1} had no question, or one over ${QUESTION_MAX} characters.`);
      continue;
    }
    if (d.body_kind !== 'pack' && d.body_kind !== 'settings' && d.body_kind !== 'arrange') {
      dropped.push(`Proposal ${i + 1} was a ${String(d.body_kind)} proposal, and Spark files only pack, settings and arrange.`);
      continue;
    }
    if (d.body === null || typeof d.body !== 'object' || Array.isArray(d.body)) {
      dropped.push(`Proposal ${i + 1} had no body.`);
      continue;
    }
    if (drafts.length >= most) {
      dropped.push(`Proposal ${i + 1} was past the ${most} Spark files at once.`);
      continue;
    }
    drafts.push({ key: stableKey(d.body as Record<string, unknown>), question: d.question.trim(), body_kind: d.body_kind, body: d.body as Record<string, unknown>, by: name });
  }
  return { drafts, dropped };
}

/** What a body is about, for recognising it once asked: the pack it names, the use case, or the pages it adds. */
export function stableKey(body: Record<string, unknown>): string {
  for (const k of ['install', 'enable', 'disable', 'usecase'] as const) if (typeof body[k] === 'string') return `${k}:${body[k]}`;
  if (typeof body.pack === 'string') return `settings:${body.pack}:${Object.keys((body.values as object) ?? {}).sort().join(',')}`;
  if (body.voice && typeof body.voice === 'object') return `voice:${Object.keys(body.voice).sort().join(',')}`;
  if (Array.isArray(body.pages)) return `pages:${body.pages.map((p) => String((p as { id?: unknown })?.id)).sort().join(',')}`;
  return JSON.stringify(body).slice(0, 120);
}
