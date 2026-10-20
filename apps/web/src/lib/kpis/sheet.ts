/**
 * THE KEY NUMBER SHEET'S LOGIC, PURE (the KPI plan of 21 October, 2.1 and 2.8): what a new number starts as, what a
 * number already kept reads back as, what will not do, and the fields written to the `kpis` list.
 *
 * MOST PEOPLE TYPE A NAME AND PICK WHERE IT COMES FROM. Everything else has a default, and the defaults follow the
 * source until somebody sets them by hand: a number you type is yours and weekly, an agent's or a feed's is daily, and
 * one worked out from the lists is read live, so it has no cadence and nobody keeps it. A figure that is a cost or a
 * count of quiet days is good when it falls.
 *
 * THE FIELDS ARE `KPI_LIST`'s (`packages/seed/src/modules/portfolio.ts`) and go out through the app's one row writer
 * (`rowWriter` in `record/rows-write.ts`), which turns the project's number into its row's id. A target in a currency is
 * money (`target_amount`, minor units); any other target is a plain figure (`target`). `kind` is never written: the
 * engine works the shape out from the source and the unit (`kpiKind`), and a shape somebody set elsewhere is kept.
 *
 * PLAIN TYPESCRIPT, so `sheet.test.ts` loads it under `node --test`.
 */

import { exponentOf } from 'braindog-render';

import { kpis as words } from '../copy/kpis.ts';
import { OFFERED_CURRENCIES } from '../record/currencies.ts';
import { isMoney, type Fields } from '../record/schema.ts';

export type KpiSource = 'numbers' | 'figure' | 'feed' | 'agent' | 'typed';
export type KpiGood = 'up' | 'down';
export type KpiEvery = '1h' | '1d' | '1w' | '1m';
export type KpiToday = 'auto' | 'pinned' | 'hidden';

/** The four choices the sheet offers, in the order a person meets them. `numbers` is shown only to a number that has it. */
export const SOURCES: readonly KpiSource[] = ['typed', 'agent', 'feed', 'figure'];
export const EVERY: readonly KpiEvery[] = ['1h', '1d', '1w', '1m'];
export const TODAY: readonly KpiToday[] = ['auto', 'pinned', 'hidden'];

/** The longest name and unit the sheet takes. A name is a card's heading; a unit sits beside a figure. */
export const NAME_MOST = 80;
export const UNIT_MOST = 24;

/**
 * THE FIGURES A NUMBER CAN BE WORKED OUT AS: Portfolio's per-project figures (`{{it}}` is the project), each with what
 * it counts in and which way is good. `money` takes the record's own currency.
 */
export type FigureChoice = { id: string; label: string; unit: 'money' | 'days' | ''; good: KpiGood };
export const FIGURES: readonly FigureChoice[] = [
  { id: 'project-in-month', label: words.kpiFigureInMonth, unit: 'money', good: 'up' },
  { id: 'project-in-by-month', label: words.kpiFigureInByMonth, unit: 'money', good: 'up' },
  { id: 'project-kept-month', label: words.kpiFigureKeptMonth, unit: 'money', good: 'up' },
  { id: 'project-owed', label: words.kpiFigureOwed, unit: 'money', good: 'down' },
  { id: 'project-cost', label: words.kpiFigureCost, unit: 'money', good: 'down' },
  { id: 'project-open', label: words.kpiFigureOpen, unit: '', good: 'down' },
  { id: 'project-done-7d', label: words.kpiFigureDone, unit: '', good: 'up' },
  { id: 'project-last-worked', label: words.kpiFigureQuiet, unit: 'days', good: 'down' },
];

/** The figure's id as a KPI names it: `project-owed`, or `project-owed:{{it}}` as the plan writes it, read alike. */
export const figureOf = (id: string): FigureChoice | undefined => FIGURES.find((f) => f.id === id.replace(/:.*$/u, ''));

/** Everything the sheet holds while somebody fills it in, as typed. */
export type KpiDraft = {
  name: string;
  measures: string;
  source: KpiSource;
  /** The name readings are saved under in Numbers. Empty means the number's own name. */
  measure: string;
  figure: string;
  unit: string;
  good: KpiGood;
  target: string;
  target_by: string;
  every: KpiEvery | '';
  owner: string;
  today: KpiToday;
  headline: boolean;
};

/** The fields a person set by hand, which a change of source leaves alone. */
export type Touched = ReadonlySet<'unit' | 'good' | 'every' | 'owner'>;

/** Who is filling it in, and the record's own currency, for the defaults that need them. */
export type Context = { you?: string | null | undefined; home?: string | null | undefined };

const EVERY_FOR: Record<KpiSource, KpiEvery | ''> = { typed: '1w', numbers: '1w', agent: '1d', feed: '1d', figure: '' };

/** A currency code as the record knows one, in any case. */
export const isCurrency = (unit: string): boolean => OFFERED_CURRENCIES.includes(unit.trim().toUpperCase());

/** The unit as it is written: a currency in capitals, anything else as typed, trimmed. */
export const unitSaid = (unit: string): string => (isCurrency(unit) ? unit.trim().toUpperCase() : unit.trim());

/**
 * THE DEFAULTS A SOURCE BRINGS, laid over the draft for each field nobody set by hand. A figure brings its own unit and
 * the way it is good; the name in Numbers and the figure are kept as they are, so a source picked by mistake and picked
 * back loses nothing.
 */
export function withSource(draft: KpiDraft, source: KpiSource, touched: Touched, at: Context = {}): KpiDraft {
  const next: KpiDraft = { ...draft, source };
  if (!touched.has('every')) next.every = EVERY_FOR[source];
  if (!touched.has('owner')) next.owner = source === 'typed' ? (at.you?.trim() ?? '') : '';
  if (source === 'figure') return withFigure(next, next.figure, touched, at);
  return next;
}

/**
 * The figure picked, and the unit and the way it is good that come with it, where nobody set them by hand. A number
 * with no name yet takes the figure's, so picking "Still to come in" is enough to add it.
 */
export function withFigure(draft: KpiDraft, id: string, touched: Touched, at: Context = {}): KpiDraft {
  const next: KpiDraft = { ...draft, figure: id };
  const f = figureOf(id);
  if (!f) return next;
  if (next.name.trim() === '') next.name = f.label;
  if (!touched.has('good')) next.good = f.good;
  if (!touched.has('unit')) next.unit = f.unit === 'money' ? (at.home ?? '') : f.unit;
  return next;
}

/** A new number on a project: you type it, weekly, kept by you, up is good, shown on Today when it needs a look. */
export function newDraft(at: Context = {}): KpiDraft {
  return withSource(
    { name: '', measures: '', source: 'typed', measure: '', figure: '', unit: '', good: 'up', target: '', target_by: '', every: '', owner: '', today: 'auto', headline: false },
    'typed',
    new Set(),
    at,
  );
}

const text = (v: unknown): string => (typeof v === 'string' ? v : '');
const oneOf = <T extends string>(v: unknown, of: readonly T[], or: T): T => (typeof v === 'string' && (of as readonly string[]).includes(v) ? (v as T) : or);

/** A figure as a person reads it in a box and types it back: `10000` is "10,000", `0.5` is "0.5", never "5e-1". */
const typedOf = (n: number): string => n.toLocaleString('en-US', { maximumFractionDigits: 6, useGrouping: true });

/** What a number already kept reads back as. A name in Numbers that is its own name reads as empty, so it follows a rename. */
export function draftOf(fields: Fields): KpiDraft {
  const name = text(fields.name);
  const measure = text(fields.measure);
  const money = fields.target_amount;
  const unit = text(fields.unit) || (isMoney(money) ? money.currency : '');
  const target = isMoney(money)
    ? typedOf(money.amount / 10 ** exponentOf(money.currency))
    : typeof fields.target === 'number'
      ? typedOf(fields.target)
      : '';
  return {
    name,
    measures: text(fields.measures),
    source: oneOf(fields.source, ['numbers', 'figure', 'feed', 'agent', 'typed'], 'numbers'),
    measure: measure === name ? '' : measure,
    figure: text(fields.figure),
    unit,
    good: oneOf(fields.good, ['up', 'down'], 'up'),
    target,
    target_by: text(fields.target_by).slice(0, 10),
    every: oneOf(fields.every, EVERY, '' as KpiEvery),
    owner: text(fields.owner),
    today: oneOf(fields.today, TODAY, 'auto'),
    headline: fields.headline === true,
  };
}

/** The cadences a sheet offers: daily, weekly and monthly, and hourly too for a number that already has it. */
export const everyFor = (draft: Pick<KpiDraft, 'every'>): readonly KpiEvery[] => (draft.every === '1h' ? EVERY : EVERY.filter((e) => e !== '1h'));

/** The sources a sheet offers this draft: the four, and `numbers` too when the number already reads Numbers. */
export const sourcesFor = (draft: Pick<KpiDraft, 'source'>): readonly KpiSource[] => (draft.source === 'numbers' ? [...SOURCES, 'numbers'] : SOURCES);

/**
 * WHETHER "MORE" OPENS BY ITSELF: a number whose hidden fields say something other than the defaults its source would
 * give, so a change made earlier is in sight when the sheet is opened again.
 */
export function saysMore(draft: KpiDraft, at: Context = {}): boolean {
  const plain = withSource({ ...draft, measures: '', measure: '', today: 'auto', headline: false }, draft.source, new Set(), at);
  return (
    draft.measures.trim() !== '' ||
    draft.measure.trim() !== '' ||
    draft.today !== 'auto' ||
    draft.headline ||
    draft.good !== plain.good ||
    draft.every !== plain.every ||
    draft.owner.trim() !== plain.owner.trim()
  );
}

/* A NUMBER AS A PERSON TYPES IT, the row writer's own rule: digits, grouping commas in threes, one point, a minus. */
const DIGITS = /^[-−]?(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+)$/u;
const DAY = /^\d{4}-\d{2}-\d{2}$/u;

/** The target as a number, or `null` for an empty box or one that is not a number. */
export function targetOf(typed: string): number | null {
  const said = typed.trim();
  return DIGITS.test(said) ? Number(said.replace(/,/gu, '').replace('−', '-')) : null;
}

const realDay = (day: string): boolean => DAY.test(day) && !Number.isNaN(Date.parse(`${day}T00:00:00Z`)) && new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day;

export type Faults = Partial<Record<'name' | 'figure' | 'target' | 'unit' | 'target_by', string>>;

/** What will not do, field by field, in the order the sheet draws them. Empty when it can be saved. */
export function faultsOf(draft: KpiDraft): Faults {
  const out: Faults = {};
  const name = draft.name.trim();
  if (name === '') out.name = words.kpiNoName;
  else if (name.length > NAME_MOST) out.name = words.kpiLongName;
  if (draft.source === 'figure' && !figureOf(draft.figure)) out.figure = words.kpiNoFigure;
  const typed = draft.target.trim();
  const target = targetOf(typed);
  if (typed !== '' && target === null) out.target = words.kpiNotDigits(typed);
  else if (target !== null && draft.unit.trim() === '%' && (target < 0 || target > 100)) out.target = words.kpiShareOver;
  if (draft.unit.trim().length > UNIT_MOST) out.unit = words.kpiLongUnit;
  const by = draft.target_by.trim();
  if (by !== '' && !realDay(by)) out.target_by = words.kpiBadDay;
  else if (by !== '' && typed === '') out.target_by = words.kpiDayNoTarget;
  return out;
}

/** The first field that will not do, for the caret. */
export const firstFault = (faults: Faults): keyof Faults | null =>
  (['name', 'figure', 'target', 'unit', 'target_by'] as const).find((k) => faults[k] !== undefined) ?? null;

const orNull = (s: string): string | null => (s.trim() === '' ? null : s.trim());

/**
 * THE FIELDS WRITTEN FOR THIS DRAFT, every one the sheet owns, so a field cleared in the sheet is cleared on the number.
 * `thing` is the project's number, which the row writer turns into its id. Saving a suggested number keeps it.
 */
export function rowOf(draft: KpiDraft, project: number): Fields {
  const figure = draft.source === 'figure';
  const unit = unitSaid(draft.unit);
  const target = targetOf(draft.target);
  const money = target !== null && isCurrency(unit) ? { amount: Math.round(target * 10 ** exponentOf(unit)), currency: unit } : null;
  return {
    name: draft.name.trim(),
    thing: project,
    measures: orNull(draft.measures),
    source: draft.source,
    measure: figure ? null : (orNull(draft.measure) ?? draft.name.trim()),
    figure: figure ? (figureOf(draft.figure)?.id ?? null) : null,
    unit: orNull(unit),
    good: draft.good,
    target: money === null ? target : null,
    target_amount: money,
    target_by: target !== null ? orNull(draft.target_by) : null,
    every: figure ? null : draft.every === '' ? null : draft.every,
    owner: orNull(draft.owner),
    today: draft.today,
    headline: draft.headline,
    draft: false,
  };
}

const same = (a: unknown, b: unknown): boolean => {
  if (isMoney(a) && isMoney(b)) return a.amount === b.amount && a.currency === b.currency;
  return (a ?? null) === (b ?? null);
};

/**
 * THE CHANGE AN EDIT SENDS: only the fields that differ from what the number holds, so a save that changed nothing
 * sends nothing and an agent's edit to a field the sheet did not touch is not written back over. The project is the one
 * it is on, and a change of project is not this sheet's.
 */
export function patchOf(before: Fields, draft: KpiDraft): Fields {
  const after = rowOf(draft, 0);
  const out: Fields = {};
  for (const [key, value] of Object.entries(after)) {
    if (key === 'thing') continue;
    if (key === 'draft' ? before.draft === true : !same(before[key], value)) out[key] = value;
  }
  return out;
}

/** The patch that puts a number back as it was before `patch`: each field its old value, or empty. */
export function undoOf(before: Fields, patch: Fields): Fields {
  const out: Fields = {};
  for (const key of Object.keys(patch)) out[key] = before[key] ?? null;
  return out;
}
