/**
 * MAKING A WIDGET BY SAYING IT, BY RULES FIRST (widgets plan §5.7, batch W4): "my Talabat spending this month", "how many
 * Lanternfish tasks are late", "gold price". The words are matched to the record's own things (its projects, categories,
 * payees and currencies, handed in) and to the catalogue, and the answer is a block the record then draws to check it.
 * A line the rules cannot read is `null`, and only then is the model asked (`widgetCompose` in the record).
 *
 * WHAT A RULE MAKES IS ALWAYS A BLOCK IN THE PAGE GRAMMAR, over a list the record keeps, so it is drawn, checked and kept
 * as any block is; no rule invents a figure. PURE, so a test holds it in Node.
 */

import { askedWidget, widgetBlock, widgetById, widgetMatches, WIDGETS, type WidgetSize } from './widgets.ts';

/** The record's own things a sentence may name, each by the name a person uses. */
export type ComposeChoices = {
  projects?: readonly string[];
  categories?: readonly string[];
  payees?: readonly string[];
  currencies?: readonly string[];
  /** The lists the record keeps, by id: a rule over a list it does not keep is not offered. */
  lists: ReadonlySet<string>;
  figures?: ReadonlySet<string>;
};

/** What the rules made: the block, the size it starts at, the catalogue widget it came from if any, and its name. */
export type Composed = { block: Record<string, unknown>; size: WidgetSize; widget: string | null; title: string };

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
/** The first of `names` the sentence says as a whole word, longest first, so "Crumb.gg" wins over "Bake". */
const named = (said: string, names: readonly string[] | undefined): string | null =>
  [...(names ?? [])].filter((n) => n.trim().length > 1).sort((a, b) => b.length - a.length).find((n) => new RegExp(`(^|[^\\p{L}\\p{N}])${esc(n)}($|[^\\p{L}\\p{N}])`, 'iu').test(said)) ?? null;

/** The window a sentence names, as a clause on a day field, and how it is said. */
export function windowOf(said: string, field: string): { where: string; say: string } | null {
  if (/\b(this|current) week\b/iu.test(said)) return { where: `${field} at least bow`, say: 'this week' };
  if (/\b(this|current) month\b/iu.test(said)) return { where: `${field} at least bom`, say: 'this month' };
  if (/\blast month\b/iu.test(said)) return { where: `${field} at least bom-1m, ${field} before bom`, say: 'last month' };
  if (/\b(30|thirty) days\b/iu.test(said)) return { where: `${field} after -30d`, say: 'in the last 30 days' };
  if (/\b(7|seven) days\b|\bthis past week\b/iu.test(said)) return { where: `${field} after -7d`, say: 'in the last 7 days' };
  return null;
}

/** Whether the sentence is about money going out. */
const SPENT = /\b(spen[dt]|spending|paid|expenses?|went (on|to)|cost)\b/iu;
/** Whether the sentence is about money coming in. */
const EARNED = /\b(earn(ed|ing)?|income|came in|received|revenue)\b/iu;
const TASKS = /\b(tasks?|to ?dos?|work|jobs?)\b/iu;
const LATE = /\b(late|overdue)\b/iu;
/** A sentence that asks for the money summed by week: "my food spending by week", "weekly". */
const BY_WEEK = /\b(by|each|per|every|a) week\b|\bweekly\b|\bweek by week\b/iu;

const DUE = /\b(due|next|this week|coming)\b/iu;

/** A sentence a person typed, with the start words taken off: "show me", "my", "a widget of". */
const plain = (said: string): string =>
  said
    .trim()
    .replace(/^(please\s+)?(show( me)?|add|make( me)?|give me|i want( to see)?|put)\s+/iu, '')
    .replace(/^(a|an|the)\s+(widget|tile)\s+(of|for|with|showing)\s+/iu, '')
    .replace(/\s+/gu, ' ');

/** The name a composed widget is given: the sentence as said, its first letter raised, at most 48 characters. */
const titled = (said: string): string => {
  const p = plain(said).replace(/[?.!]+$/u, '').replace(/^my\s+/iu, '');
  const t = p.charAt(0).toUpperCase() + p.slice(1);
  return t.length > 48 ? `${t.slice(0, 47).trimEnd()}…` : t;
};

/**
 * THE RULES, in order: money in one category or to one payee, a project's tasks, a catalogue widget its words name (with
 * its blank filled where the sentence names a project or a currency), and the catalogue widget whose words match best.
 */
export function composeWidget(said: string, c: ComposeChoices): Composed | null {
  const text = plain(said);
  if (text === '') return null;
  const title = titled(said);

  /* MONEY IN ONE CATEGORY, OR TO OR FROM ONE PAYEE: the ledger's lines, newest first, over the window said. */
  const category = named(text, c.categories);
  const payee = category === null ? named(text, c.payees) : null;
  const out = SPENT.test(text);
  const into = !out && EARNED.test(text);
  if (c.lists.has('transactions') && (category !== null || payee !== null) && (out || into || category !== null || BY_WEEK.test(text))) {
    /* SUMMED BY WEEK, when the sentence asks for it: a bar a week of the totals, never the single payments (the
       validator's audit of 30 October, 13), from Money's own weekly figure for one category or one payee. A record
       whose Money is older than those figures gets the payments, newest first, as before. */
    const weekly = category !== null ? 'spent-in-category-by-week' : 'paid-to-by-week';
    if (BY_WEEK.test(text) && (c.figures === undefined || c.figures.has(weekly)))
      return {
        block: {
          kind: 'series',
          heading: title,
          icon: 'chart-column',
          series: [{ metric: `${weekly}:${category ?? payee}`, label: 'Spent', dir: 'out' }],
          back: 12,
          empty: 'Nothing went out in these weeks.',
        },
        size: 'wide',
        widget: null,
        title,
      };
    const when = windowOf(text, 'on');
    const where = [
      'state is cleared, transfer is false',
      ...(out ? ['direction is out'] : into ? ['direction is in'] : []),
      ...(category !== null ? [`category is ${category}`] : [`party is ${payee}`]),
      ...(when ? [when.where] : []),
    ].join(', ');
    return {
      block: {
        kind: 'table',
        heading: title,
        icon: out ? 'trending-down' : into ? 'trending-up' : 'wallet',
        source: 'register.transactions',
        where,
        columns: [{ field: 'on' }, { field: 'what' }, { field: 'amount' }],
        order: [{ field: 'on', dir: 'desc' }],
        limit: 6,
        empty: `Nothing ${when ? when.say : 'yet'}.`,
      },
      size: 'tall',
      widget: null,
      title,
    };
  }

  /* A PROJECT'S TASKS: late, due soon, or open. */
  const project = named(text, c.projects);
  if (project !== null && c.lists.has('tasks') && (TASKS.test(text) || LATE.test(text))) {
    const late = LATE.test(text);
    const due = !late && DUE.test(text);
    const where = ['state is not done or dropped', `thing is ${project}`, ...(late ? ['by before today'] : due ? ['by before +8d'] : [])].join(', ');
    return {
      block: {
        kind: 'todo',
        heading: title,
        icon: late ? 'clock' : 'check',
        source: 'register.tasks',
        where,
        columns: [{ field: 'what' }, { field: 'by' }],
        order: [{ field: 'by', dir: 'asc' }],
        limit: 6,
        empty: late ? `Nothing on ${project} is late.` : `Nothing open on ${project}.`,
      },
      size: 'tall',
      widget: null,
      title,
    };
  }

  /* A CATALOGUE WIDGET ITS WORDS NAME, with what the sentence fills. */
  const values: Record<string, string> = {};
  if (project !== null) values.project = project;
  const currency = named(text, c.currencies);
  if (currency !== null) values.currency = currency;
  const asked = project !== null && !askedWidget(text) ? 'project-pulse' : askedWidget(text);
  const fits = (id: string): boolean => {
    const t = widgetById(id);
    return t !== undefined && (t.needs.lists ?? []).every((l) => c.lists.has(l)) && (t.needs.figures ?? []).every((f) => c.figures === undefined || c.figures.has(f));
  };
  const best = asked !== null && fits(asked) ? asked : (WIDGETS.find((t) => fits(t.id) && widgetMatches(t, text))?.id ?? null);
  if (best === null) return null;
  const t = widgetById(best)!;
  if ((t.blanks ?? []).some((b) => values[b.id] === undefined)) return null;
  const block = widgetBlock(t, t.size, values);
  return { block: { ...block, heading: t.blanks?.length ? title : t.title }, size: t.size, widget: t.id, title: t.blanks?.length ? title : t.title };
}

/** What a draft carries until it is kept (§7.1): who made it, the words it was made from, and what asking cost. */
export type DraftMark = { by: string; why: string; cost?: string };

/** Whether a block is a draft, and its mark. */
export function draftOf(block: Readonly<Record<string, unknown>>): DraftMark | null {
  const d = block.draft;
  if (d === null || typeof d !== 'object' || Array.isArray(d)) return null;
  const m = d as Record<string, unknown>;
  return typeof m.by === 'string' && typeof m.why === 'string' ? { by: m.by, why: m.why, ...(typeof m.cost === 'string' ? { cost: m.cost } : {}) } : null;
}

/** Why a draft mark cannot be kept, or `null`: `by` and `why` are words, `cost` a sentence, nothing else. */
export function draftFault(d: unknown): string | null {
  if (d === null || typeof d !== 'object' || Array.isArray(d)) return 'draft is { by, why, cost }: who made it, the words it was made from, and what asking cost.';
  const m = d as Record<string, unknown>;
  if (Object.keys(m).some((k) => k !== 'by' && k !== 'why' && k !== 'cost')) return 'draft takes by, why and cost, and nothing else.';
  if (typeof m.by !== 'string' || m.by.trim() === '' || m.by.length > 80) return "draft's by names who made it, 1 to 80 characters.";
  if (typeof m.why !== 'string' || m.why.length > 300) return "draft's why is the words it was made from, at most 300 characters.";
  if (m.cost !== undefined && (typeof m.cost !== 'string' || m.cost.length > 200)) return "draft's cost is a sentence, at most 200 characters.";
  return null;
}

/** A block kept: its draft mark taken off. */
export const kept = (block: Readonly<Record<string, unknown>>): Record<string, unknown> => {
  const { draft: _d, ...rest } = block;
  return rest;
};
