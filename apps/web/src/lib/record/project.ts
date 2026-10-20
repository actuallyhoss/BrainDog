/**
 * What a project's page is made of, and in what order, so every project reads the same way.
 *
 * ONE SHAPE, SAME PLACES: the brief, the next step, money, people, agents, then what it runs on. A block with nothing
 * to say is left out, never drawn with a placeholder, and each block that has rows behind it can show them. Pure and
 * relative-imported so `project.test.ts` can hold the rules without a component.
 */

import { briefFromNote } from './brief.ts';
import { actor, humanize } from './names.ts';

/** What of a list's declaration decides its part; the record says all of it, so no list is named here. */
export type Decl = {
  seq_prefix?: unknown;
  meets?: unknown;
  org?: unknown;
  hand?: unknown;
  scopes?: unknown;
  state?: string | undefined;
  fields: readonly { id: string; type: string }[];
};

/** A projects list is the one that declares `scopes`, the places its runs are placed by. Only its rows take this shape. */
export const isProject = (decl: Decl | undefined): boolean => decl?.scopes !== undefined;

export const BLOCKS = ['brief', 'next', 'money', 'crew', 'workers', 'runs-on'] as const;
export type Block = (typeof BLOCKS)[number];
export type Pointed = Exclude<Block, 'brief'>;

/**
 * WHICH BLOCK A LIST THAT POINTS AT A PROJECT FILLS, read off what it declares: it keeps people or organisations
 * (`meets`, `org`), its rows are agent runs (`seq_prefix`), it says who holds its rows and has a state (`hand`), it
 * names a provider (a service, a tool, a key), or it holds an amount. A list that declares none keeps its own tile.
 */
export function blockOf(decl: Decl | undefined): Pointed | null {
  if (!decl) return null;
  if (decl.meets !== undefined || decl.org !== undefined) return 'crew';
  if (decl.seq_prefix !== undefined) return 'workers';
  if (decl.hand !== undefined && decl.state) return 'next';
  if (decl.fields.some((f) => f.id === 'provider')) return 'runs-on';
  if (decl.fields.some((f) => f.type === 'money')) return 'money';
  return null;
}

/**
 * WHICH SHAPE BLOCK A DECLARED BLOCK SAYS AGAIN, read off the source it declares and never its title: what a project
 * runs on (`runs_on`: its keys, tools and skills) is the shape's runs-on block. `null` for a block that says its own thing.
 */
export const repeatOf = (source: unknown): Pointed | null => (source === 'runs_on' ? 'runs-on' : null);

type Declared = { kind: string; drawn?: boolean | undefined; why?: string | undefined; source?: unknown; area?: unknown; panel?: unknown; columns?: unknown };

/* A number or a flag is a value too; only nothing, a blank and an empty list are not. */
const unset = (v: unknown): boolean => v === null || v === undefined || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);

/**
 * WHETHER A DECLARED BLOCK SAYS THE ROW'S NEXT STEP AND NOTHING ELSE, read off the row field it declares (`next`), never
 * its title: every other column it declares is empty on the row, so what it would draw is the line the shape already says.
 */
export function saysNext(b: Declared, row: Readonly<Record<string, unknown>>): boolean {
  const cols = Array.isArray(b.columns) ? (b.columns as { field?: unknown }[]) : [];
  if (said(row.next) === '' || !cols.some((c) => c.field === 'next')) return false;
  return cols.every((c) => typeof c.field !== 'string' || c.field === 'next' || unset(row[c.field]));
}

/**
 * THE PAGE'S DECLARED BLOCKS WITHOUT WHAT THE SHAPE SAYS (`drew` is the shape's blocks): a block that repeats one is left
 * out, and so is a section left heading only such blocks, unless it holds the scheduled actions the host counted, or has
 * not yet counted them. Each stays at its place, marked as left out for being empty, so arranging draws it again.
 */
export function withoutRepeats<T extends Declared>(
  blocks: readonly T[],
  drew: readonly Block[],
  actions: number | null,
  row: Readonly<Record<string, unknown>> | null = null,
): T[] {
  const gone = blocks.map((b) => {
    const again = repeatOf(b.source);
    if (b.drawn === false) return false;
    if (again !== null && drew.includes(again)) return true;
    return row !== null && drew.includes('next') && b.kind !== 'section' && saysNext(b, row);
  });
  return blocks.map((b, n) => {
    let out = gone[n]!;
    if (!out && b.kind === 'section' && b.drawn !== false && (b.panel === undefined || (b.panel === 'actions' && actions === 0))) {
      const area = b.area === 'rail' ? 'rail' : 'main';
      const under: number[] = [];
      for (let at = n + 1; at < blocks.length; at++) {
        const next = blocks[at]!;
        if ((next.area === 'rail' ? 'rail' : 'main') !== area) continue;
        if (next.kind === 'section') break;
        /* ITS BLOCKS END WHERE AN UNRELATED TILE STARTS: once a block that repeats the shape has been seen under the
           heading, the first block still drawn that repeats nothing is no part of the section, so it cannot keep the
           heading on the page by standing after it. Decided by the blocks' sources, never their titles. */
        if (under.some((u) => gone[u] === true) && gone[at] !== true && next.drawn !== false && repeatOf(next.source) === null) break;
        under.push(at);
      }
      out = under.length > 0 && under.every((at) => gone[at] === true || blocks[at]!.drawn === false);
    }
    return out ? ({ ...b, drawn: false, why: 'empty' } as T) : b;
  });
}

/** One row behind a block: a name, one quiet detail, and where it opens. Never a secret, never an id. */
export type DataRow = { key: string; title: string; detail: string; href: string | null; kind?: string };

type Pointing = { block: Pointed | null; name?: string | undefined; rows: readonly { key: string; cells: readonly unknown[]; href?: string | null | undefined }[] };

const said = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/* A HANDLE, NOT A NAME: lowercase, one word or words joined by hyphens, underscores or dots, as a key or a tool is filed. */
const HANDLE = /^[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/u;

/**
 * THE NAME A THING IT RUNS ON IS SAID BY: its own words, and where they are a handle ("sketchpad-metrics") the same words
 * spaced and capitalised ("Sketchpad metrics"), so no key or tool is drawn in the record's own spelling (the audit of
 * 20 October: five raw key handles on his Sketchpad). Words a person wrote with a capital or a space stay as written.
 */
export const thingName = (title: string): string => (HANDLE.test(title) ? humanize(title) : title);

/** The rows of the lists a block draws, as names. The title is the first cell; a detail is the second only. */
export function rowsOf(block: Pointed, groups: readonly Pointing[]): DataRow[] {
  const out: DataRow[] = [];
  for (const g of groups) {
    if (g.block !== block) continue;
    for (const r of g.rows) {
      const title = said(r.cells[0]);
      if (title === '') continue;
      /* BY NAME ONLY on what a project runs on: the detail of a key or a tool could be where it is kept. */
      const row: DataRow = { key: `${block}#${r.key}`, title: block === 'runs-on' ? thingName(title) : title, detail: block === 'runs-on' ? '' : said(r.cells[1]), href: r.href ?? null };
      /* THE KIND IS THE SOURCE LIST'S OWN NAME, as its declaration says it, so what it runs on can be grouped without naming a list. */
      if (block === 'runs-on' && g.name) row.kind = g.name;
      out.push(row);
    }
  }
  return out;
}

/** What it runs on at a glance: the first few names grouped by their list's name, then how many more are behind. */
export function runsOnSet(rows: readonly DataRow[], max = 8): { groups: { kind: string; names: string[] }[]; more: number } {
  const groups: { kind: string; names: string[] }[] = [];
  for (const r of rows) {
    const kind = r.kind ?? '';
    let g = groups.find((x) => x.kind === kind);
    if (!g) groups.push((g = { kind, names: [] }));
    g.names.push(r.title);
  }
  /* ONE FROM EACH KIND IN TURN, so a long list of keys does not push the services and tools out of the few shown. */
  const shown = groups.map((g) => ({ kind: g.kind, names: [] as string[] }));
  for (let taken = 0, round = 0; taken < Math.min(max, rows.length); round++) {
    for (const [i, g] of groups.entries()) {
      const name = g.names[round];
      if (name !== undefined && taken < max) {
        shown[i]!.names.push(name);
        taken++;
      }
    }
  }
  return { groups: shown.filter((g) => g.names.length > 0), more: Math.max(0, rows.length - max) };
}

/** A figure the record answered for this project, in minor units. */
export type Figure = { value: number; currency: string };
export type MoneyLine = { key: 'in' | 'out' | 'owed'; value: number; currency: string; share: number };

/**
 * The figures that are worth a line: more than nothing, and in one currency, since two currencies are never drawn on
 * one scale. `share` is each line's part of the largest, for the small bar.
 */
export function moneyLines(f: { in?: Figure | null; out?: Figure | null; owed?: Figure | null }): MoneyLine[] {
  const held = (['in', 'out', 'owed'] as const).flatMap((key) => {
    const x = f[key];
    return x && Number.isFinite(x.value) && x.value > 0 ? [{ key, value: x.value, currency: x.currency }] : [];
  });
  const first = held[0];
  if (!first) return [];
  const same = held.filter((h) => h.currency === first.currency);
  const top = Math.max(...same.map((h) => h.value));
  return same.map((h) => ({ ...h, share: h.value / top }));
}

/** The brief: what the row says it is, or failing that the first lines of what changed. */
export function briefOf(fields: Readonly<Record<string, unknown>>, changes: readonly { note: string }[], name = ''): string[] {
  const about = said(fields.about);
  if (about !== '') return [about];
  /* The note is cleaned of what an import left in it; nothing real left falls through to what changed. */
  const first = briefFromNote(said(fields.note), name);
  if (first.length > 0) return first;
  return changes
    .map((c) => said(c.note))
    .filter(Boolean)
    .slice(0, 2);
}

export type Working = { agent: string; project: string | null; doing: string | null; seq?: number | null | undefined; quiet?: boolean | undefined };

/**
 * One agent at work on the project, as the line under Who is working draws it: its maker's mark from `agent`, the name a
 * person reads ("Claude", never the handle `claude`), the run its face opens, and whether it has gone quiet.
 */
export type AtWork = Working & { key: string; name: string; run: string; live: 'working' | 'quiet' };

/** The agents on this project, working now first, then the runs the record holds for it. */
export function agentsOf(name: string, working: readonly Working[], runs: readonly DataRow[]): { now: AtWork[]; runs: DataRow[] } {
  const now = name === '' ? [] : working.filter((w) => w.project === name);
  return {
    now: now.map((w, i) => ({
      ...w,
      key: typeof w.seq === 'number' ? `S${w.seq}` : `w${i}`,
      name: actor(w.agent).name,
      run: typeof w.seq === 'number' ? `S${w.seq}` : '',
      live: w.quiet ? 'quiet' : 'working',
      doing: said(w.doing) || null,
    })),
    runs: [...runs],
  };
}

export type Facts = {
  brief: readonly string[];
  next: string | null;
  money: readonly MoneyLine[];
  people: readonly DataRow[];
  agents: { now: readonly AtWork[]; runs: readonly DataRow[] };
  runsOn: readonly DataRow[];
};

/** The blocks that have something to say, always in the order of `BLOCKS`. */
export function blocksOf(f: Facts): Block[] {
  const has: Record<Block, boolean> = {
    brief: f.brief.length > 0,
    next: !!f.next,
    money: f.money.length > 0,
    crew: f.people.length > 0,
    workers: f.agents.now.length > 0 || f.agents.runs.length > 0,
    'runs-on': f.runsOn.length > 0,
  };
  return BLOCKS.filter((b) => has[b]);
}

/**
 * How many of the two desktop columns each block takes: the brief and the next step the whole row, the rest in pairs
 * (money with people, agents with what it runs on), and one whose partner is left out takes the whole row.
 */
export function spans(blocks: readonly Block[]): Record<string, 1 | 2> {
  const out: Record<string, 1 | 2> = {};
  for (const b of blocks) {
    const partner: Block | null = b === 'money' ? 'crew' : b === 'crew' ? 'money' : b === 'workers' ? 'runs-on' : b === 'runs-on' ? 'workers' : null;
    out[b] = partner && blocks.includes(partner) ? 1 : 2;
  }
  return out;
}

/* ── the hero band ─────────────────────────────────────────────────────── */

/** One run of a hero sentence: words, a figure drawn a step heavier, or the late phrase drawn in the red. */
export type HeroPart = { text: string; figure?: true; late?: true };

/** One of the hero's three figures: what it pays, its open work as a ring, and who is on it now. */
export type HeroFigure =
  | { key: 'money'; label: string; minor: number; currency: string }
  | { key: 'open'; label: string; total: number; agents: number; late: number; atLeast: boolean }
  | { key: 'working'; label: string; now: readonly AtWork[]; note: string | null };

export type Hero = { sentences: HeroPart[][]; figures: HeroFigure[] };

/** What the hero is worked out from, besides the shape's facts. */
export type HeroSource = {
  facts: Facts;
  /** The figure the project's card leads with (`figureOf`), with its field's label. */
  figure: { minor: number; currency: string; label: string } | null;
  /** Its open work, and how much of it an agent holds (`openWorkOf`). */
  open: { total: number; agents: number; late: number; atLeast: boolean } | null;
  /** What the open work is called, in the plural and lower case: "tasks". */
  noun: string;
  format: (minor: number, currency: string) => string;
};

export const HERO_WORDS = {
  money: { in: 'came in this month', out: 'went out this month', owed: 'is still to come in' },
  figure: { in: 'In this month', out: 'Out this month', owed: 'Still to come in' },
  open: 'Open',
  working: 'Working now',
  on: (name: string, doing: string | null): string => (doing ? `${name} is on ${doing}` : `${name} is working on it`),
  both: (names: readonly string[]): string => `${names.slice(0, -1).join(', ')} and ${names.at(-1)} are working on it`,
  late: (late: number, total: number, noun: string): string => `${late} of ${total} open${noun ? ` ${noun}` : ''} ${late === 1 ? 'is' : 'are'} late`,
  split: (you: number, agents: number): string => `${you} you, ${agents} agent${agents === 1 ? '' : 's'}`,
  runs: (n: number): string => (n === 1 ? '1 run on it' : `${n} runs on it`),
  nobody: 'Nobody right now',
} as const;

/* A sentence ends on a stop, and keeps the one it was written with. */
const stopped = (s: string): string => (/[.!?…]$/u.test(s) ? s : `${s}.`);

/**
 * THE HERO BAND (the plan of 20 October, batch 3a): two or three plain sentences and three figures, from what the page
 * already read. The brief first, as the project says what it is; then its money, each amount a figure; then who is on it
 * and what is late. Never the next step, which the page's own sentence says once. A sentence or a figure with nothing to
 * say is left out, so a project with nothing written and no money draws only what it has.
 */
export function heroOf(s: HeroSource): Hero {
  const { facts } = s;
  const sentences: HeroPart[][] = [];
  const brief = facts.brief.join(' ').trim();
  if (brief !== '') sentences.push([{ text: stopped(brief) }]);
  const money = facts.money.map((m): HeroPart[] => [{ text: s.format(m.value, m.currency), figure: true }, { text: ` ${HERO_WORDS.money[m.key]}` }]);
  if (money.length > 0) {
    const parts: HeroPart[] = [];
    money.forEach((m, i) => {
      if (i > 0) parts.push({ text: i === money.length - 1 ? ' and ' : ', ' });
      parts.push(...m);
    });
    parts.push({ text: '.' });
    sentences.push(parts);
  }
  const now = facts.agents.now;
  const who = now.length === 0 ? null : now.length === 1 ? HERO_WORDS.on(now[0]!.name, now[0]!.doing) : HERO_WORDS.both([...new Set(now.map((w) => w.name))]);
  const late = s.open && s.open.late > 0 ? HERO_WORDS.late(s.open.late, s.open.total, s.noun) : null;
  if (who && late) sentences.push([{ text: `${who}, and ` }, { text: late, late: true }, { text: '.' }]);
  else if (who) sentences.push([{ text: `${who}.` }]);
  else if (late) sentences.push([{ text: late.charAt(0).toUpperCase() + late.slice(1), late: true }, { text: '.' }]);

  const figures: HeroFigure[] = [];
  const lead = s.figure ?? (() => {
    const m = facts.money.find((x) => x.key === 'in') ?? facts.money.find((x) => x.key === 'owed');
    return m ? { minor: m.value, currency: m.currency, label: HERO_WORDS.figure[m.key] } : null;
  })();
  if (lead) figures.push({ key: 'money', label: lead.label, minor: lead.minor, currency: lead.currency });
  if (s.open && s.open.total > 0) figures.push({ key: 'open', label: HERO_WORDS.open, ...s.open });
  if (now.length > 0 || facts.agents.runs.length > 0) {
    const first = now[0];
    const note = first ? (first.doing ?? null) : HERO_WORDS.runs(facts.agents.runs.length);
    figures.push({ key: 'working', label: HERO_WORDS.working, now, note });
  }
  return { sentences: sentences.slice(0, 3), figures };
}

/** What a project's shape is made from, as the row's page and a declared page scoped to the row both hold it. */
export type Source = {
  /** The project row's fields, and the title field its list declares. */
  fields: Readonly<Record<string, unknown>>;
  title: string;
  /** Each list that points at the row: its declaration and its rows. */
  incoming: readonly { decl: Decl | undefined; name?: string | undefined; rows: Pointing['rows'] }[];
  history: readonly { note: string; by: string; at: string }[];
  money: { in?: Figure | null; out?: Figure | null; owed?: Figure | null };
  working: readonly Working[];
};

/** The facts, the rows behind each block and where the next step opens: one place both routes work them out. */
export function shapeOf(s: Source): { facts: Facts; data: Partial<Record<Block, readonly DataRow[]>>; nextHref: string | null } {
  const name = String(s.fields[s.title] ?? '').trim();
  const placed = s.incoming.map((g) => ({ block: blockOf(g.decl), name: g.name, rows: g.rows }));
  const rows = (b: Pointed) => rowsOf(b, placed);
  const tasks = rows('next');
  const text = String(s.fields.next ?? '').trim();
  const facts: Facts = {
    brief: briefOf(s.fields, s.history, name),
    next: text || tasks[0]?.title || null,
    money: moneyLines(s.money),
    people: rows('crew'),
    agents: agentsOf(name, s.working, rows('workers')),
    runsOn: rows('runs-on'),
  };
  const changed: DataRow[] = s.history.map((l, i) => ({ key: `h${i}`, title: l.note, detail: `${l.by}, ${l.at}`, href: null }));
  const data: Partial<Record<Block, readonly DataRow[]>> = {
    brief: facts.brief.length > 0 ? changed : [],
    next: tasks,
    money: rows('money'),
    crew: facts.people,
    workers: facts.agents.runs,
    'runs-on': facts.runsOn,
  };
  return { facts, data, nextHref: text ? null : (tasks[0]?.href ?? null) };
}
