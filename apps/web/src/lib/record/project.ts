/**
 * What a project's page is made of, and in what order, so every project reads the same way.
 *
 * ONE SHAPE, SAME PLACES: the brief, the next step, money, people, agents, then what it runs on. A block with nothing
 * to say is left out, never drawn with a placeholder, and each block that has rows behind it can show them. Pure and
 * relative-imported so `project.test.ts` can hold the rules without a component.
 */

import { briefFromNote } from './brief.ts';

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

type Declared = { kind: string; drawn?: boolean | undefined; why?: string | undefined; source?: unknown; area?: unknown; panel?: unknown };

/**
 * THE PAGE'S DECLARED BLOCKS WITHOUT WHAT THE SHAPE SAYS (`drew` is the shape's blocks): a block that repeats one is left
 * out, and so is a section left heading only such blocks, unless it holds the scheduled actions the host counted, or has
 * not yet counted them. Each stays at its place, marked as left out for being empty, so arranging draws it again.
 */
export function withoutRepeats<T extends Declared>(blocks: readonly T[], drew: readonly Block[], actions: number | null): T[] {
  const gone = blocks.map((b) => {
    const again = repeatOf(b.source);
    return b.drawn !== false && again !== null && drew.includes(again);
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
        under.push(at);
      }
      out = under.length > 0 && under.every((at) => gone[at] === true || blocks[at]!.drawn === false);
    }
    return out ? ({ ...b, drawn: false, why: 'empty' } as T) : b;
  });
}

/** One row behind a block: a name, one quiet detail, and where it opens. Never a secret, never an id. */
export type DataRow = { key: string; title: string; detail: string; href: string | null };

type Pointing = { block: Pointed | null; rows: readonly { key: string; cells: readonly unknown[]; href?: string | null | undefined }[] };

const said = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** The rows of the lists a block draws, as names. The title is the first cell; a detail is the second only. */
export function rowsOf(block: Pointed, groups: readonly Pointing[]): DataRow[] {
  const out: DataRow[] = [];
  for (const g of groups) {
    if (g.block !== block) continue;
    for (const r of g.rows) {
      const title = said(r.cells[0]);
      if (title === '') continue;
      /* BY NAME ONLY on what a project runs on: the detail of a key or a tool could be where it is kept. */
      out.push({ key: `${block}#${r.key}`, title, detail: block === 'runs-on' ? '' : said(r.cells[1]), href: r.href ?? null });
    }
  }
  return out;
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

export type Working = { agent: string; project: string | null; doing: string | null };

/** The agents on this project, working now first, then the runs the record holds for it. */
export function agentsOf(name: string, working: readonly Working[], runs: readonly DataRow[]): { now: Working[]; runs: DataRow[] } {
  return { now: name === '' ? [] : working.filter((w) => w.project === name), runs: [...runs] };
}

export type Facts = {
  brief: readonly string[];
  next: string | null;
  money: readonly MoneyLine[];
  people: readonly DataRow[];
  agents: { now: readonly Working[]; runs: readonly DataRow[] };
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

/** What a project's shape is made from, as the row's page and a declared page scoped to the row both hold it. */
export type Source = {
  /** The project row's fields, and the title field its list declares. */
  fields: Readonly<Record<string, unknown>>;
  title: string;
  /** Each list that points at the row: its declaration and its rows. */
  incoming: readonly { decl: Decl | undefined; rows: Pointing['rows'] }[];
  history: readonly { note: string; by: string; at: string }[];
  money: { in?: Figure | null; out?: Figure | null; owed?: Figure | null };
  working: readonly Working[];
};

/** The facts, the rows behind each block and where the next step opens: one place both routes work them out. */
export function shapeOf(s: Source): { facts: Facts; data: Partial<Record<Block, readonly DataRow[]>>; nextHref: string | null } {
  const name = String(s.fields[s.title] ?? '').trim();
  const placed = s.incoming.map((g) => ({ block: blockOf(g.decl), rows: g.rows }));
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
