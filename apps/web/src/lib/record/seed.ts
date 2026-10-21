/**
 * Seeding a new block, so the picker never shows an empty rectangle.
 *
 * 21 A5 is one line — *"Seeds, not blanks. Every new declaration is created as a working shape with
 * example rows"* — and §3.3 says exactly what it buys:
 *
 *   > Selecting inserts the block **already bound and already drawing**: source = the page's
 *   > primary register, predicate = `everything`, slots auto-filled with the first type-compatible
 *   > field. **The user's first act is narrowing, never starting.**
 *
 * That sentence is the whole design of this file. A picker that inserts an unbound block hands the
 * author a blank and a form; a picker that inserts a bound one hands them something to correct,
 * which is a far easier thing for a person to do and a far easier thing to be right about.
 *
 * THE SLOTS ARE FILLED BY TYPE, NOT BY NAME. A kind's cells want particular kinds of value — a
 * `bar`'s magnitude is a number, a `timeline`'s marker is a date — and 21 §3.4's rule is that a
 * non-programmer cannot put text in a number slot BECAUSE IT IS NOT OFFERED. There is no validation
 * message because there is no invalid state. Filling by type is the same rule applied one step
 * earlier: the seed is right for the same reason a wrong choice is unavailable.
 */

import { KINDS, isKind } from 'braindog-render';

import { REGISTERS, ROWS } from './held.ts';
import { amountOf } from './money.ts';

/**
 * The kinds that REDUCE rather than project.
 *
 * A kind that draws one row per row cannot add two opposite things together; a kind that sums can,
 * and did. `bar` groups and sums, `gauge` sums against a target, `stat` reads a figure. A `split` cuts one total
 * into its parts and a `ring` draws up to five parts of a whole, so each is a sum too, and money owed to you and money
 * you owe in one ring is the same wrong figure a bar was.
 */
const AGGREGATES = new Set(['bar', 'gauge', 'stat', 'split', 'ring']);
import type { Entry, FieldDecl, PageBlock, RegisterDecl } from './schema.ts';

/** What each cell of a kind wants, in order. `any` takes the first field left. */
type Want = 'title' | 'number' | 'date' | 'enum' | 'ref' | 'text' | 'url' | 'file' | 'any';

/**
 * Cell wants per kind. Only the kinds a register can fill are here — `note`, `quote`, `code`, `tree`
 * and `comparison` are authored rather than bound, and `stat` takes metrics rather than fields.
 *
 * `comparison` left this table because 05 §2 says `table` is "the one kind bound to a `source:`
 * register" and defines `comparison` as "a small table you write yourself". Bound, it drew nothing
 * at all — `KINDS.comparison.cells` is 0, because its width comes from its header row, so the
 * projection produced zero cells per row and the block was an empty rectangle with no refusal. It
 * is offered as an authored seed instead, which is the shape it was always meant to have.
 */
const WANTS: Record<string, Slot[]> = {
  bar: [{ want: 'ref' }, { want: 'number', hard: true }],
  /* A gauge groups nothing and projects nothing: it sums one column against a target. The first
     column only names the figure, so it wants the title and the second wants the number. */
  gauge: [{ want: 'title' }, { want: 'number', hard: true }],
  /* An ENUM FIRST, because chips group and count by their first column. Bound to the title, every
     chip is a count of one wearing a whole row's name in small caps — which is what it did. */
  chips: [{ want: 'enum', hard: true }],
  spec: [{ want: 'title' }, { want: 'number' }, { want: 'date' }],
  params: [{ want: 'title' }, { want: 'text' }, { want: 'text' }],
  todo: [{ want: 'title' }, { want: 'date' }],
  steps: [{ want: 'title' }, { want: 'text' }, { want: 'enum' }],
  timeline: [{ want: 'date', hard: true }, { want: 'title' }, { want: 'ref' }],
  board: [{ want: 'enum', hard: true }, { want: 'title' }, { want: 'ref' }],
  table: [{ want: 'title' }, { want: 'number' }, { want: 'date' }],
  /* THE NEW KINDS EACH READ ONE COLUMN BY WHAT IT IS (`packages/kernel/src/kinds/`), so that slot is hard: a calendar
     places its rows by their day, a gallery draws its file and a link goes to its address. Without such a field the
     kind is not offered over that list, or, for links, is offered written out (`UNBOUND`). */
  calendar: [{ want: 'title' }, { want: 'date', hard: true }],
  gallery: [{ want: 'title' }, { want: 'file', hard: true }],
  link: [{ want: 'title' }, { want: 'url', hard: true }],
  /* THE KINDS THE MENU NEVER OFFERED (PGS-A22), each over the field it reads. A heat washes each day by how busy it was,
     so its day is hard and its value is a number or nothing: a row with no value is one of something. A ring and a
     split each SUM a number, so it is hard; the split cuts it by a choice where the list has one. Lanes lay each item
     between its start and its end, and an end left off is a span still going, so the second date is taken or left. */
  heat: [{ want: 'date', hard: true }, { want: 'number', only: true }],
  ring: [{ want: 'title' }, { want: 'number', hard: true }],
  split: [{ want: 'enum' }, { want: 'number', hard: true }],
  lanes: [{ want: 'title' }, { want: 'date', hard: true }, { want: 'date', only: true }],
  /* A CARD IS ITS NAME AND UP TO THREE FACTS (`cards.ts`), each column saying which it is. The facts are taken where the
     list has them, a choice, a day and a link, and a card with none of them is not offered (`LEAST`): a card that is
     only a name is a list of names. */
  cards: [
    { want: 'title', as: 'title' },
    { want: 'enum', as: 'fact', only: true },
    { want: 'date', as: 'fact', only: true },
    { want: 'ref', as: 'fact', only: true },
  ],
};

/** The fewest columns a kind's seed must fill to be offered, where that is more than its hard slots say. */
const LEAST: Readonly<Record<string, number>> = { cards: 2 };

/** A kind's row cap where the renderer has one under the seed's six: a seventh part of a ring degrades. */
const ROW_CAP: Readonly<Record<string, number>> = { ring: 5 };

/**
 * A cell's want, and whether a fallback may cover it.
 *
 * `fill` used to fall back to any unspent field for every want, which is how a `bar` over a register
 * with no numeric column came out as `NaN` per group — a chart of nothing, drawn, offered by the
 * picker. A number slot filled with text is precisely what 21 §3.4 says cannot happen, and the
 * reason it gives is the one that applies here: it is not offered.
 *
 * HARD IS PER SLOT, NOT PER TYPE. `bar` and `gauge` SUM their number and `table` and `spec` PRINT
 * theirs, so the same want is load-bearing in one kind and a nicety in another — making `number`
 * hard everywhere took `table` away from every register with no money in it, which is most of them.
 * A slot is hard when the kind READS it: summed, grouped into columns, or laid on a time axis.
 *
 * ONLY IS A THIRD ANSWER: the exact field or no cell at all. A heat's value and a lane's end may be left off, and a
 * fallback there would put words where the kind reads a number or a day. A slot is `only` at the end of a kind's cells,
 * so leaving it off moves no other cell, or on a column that says what it is with `as`, as a card's facts do.
 */
type Slot = { want: Want; hard?: boolean; only?: true; as?: 'title' | 'fact' };

/**
 * The five kinds that are not projections of anything, seeded with rows somebody can edit.
 *
 * 21 A5 is "seeds, not blanks", and it does not say "seeds for the bindable ones". These were
 * unreachable from the picker entirely: it lists what a register can fill, so five of the sixteen
 * kinds could not be added to a page at all.
 */
const AUTHORED: Record<string, { cells: string[] }[]> = {
  note: [{ cells: ['What this page is for, in a sentence somebody else could act on.'] }],
  quote: [{ cells: ['The sentence worth keeping, as it was said.', 'Who said it, and when'] }],
  comparison: [
    { cells: ['Option', 'Cost', 'What it gives up'] },
    { cells: ['Stay as we are', 'Nothing', 'The problem'] },
    { cells: ['Move', 'Two weeks', 'The next two weeks'] },
  ],
  code: [{ cells: ['npx braindog pull --register obligations'] }],
  tree: [{ cells: ['the-studio'] }, { cells: ['  obligations'] }, { cells: ['  services'] }],
  /* AN EMBED IS WRITTEN OUT AND NEVER READ (`kinds/embed.ts`): one row of an address from a player the record names, and
     a title. The seed is a real player's address, because one from anywhere else is refused at install. */
  embed: [{ cells: ['https://vimeo.com/76979871', 'The video this page is about'] }],
};

/**
 * The written-out seed a BOUND kind falls back to over a list with no field it can read.
 *
 * A LIST OF LINKS IS OFTEN WRITTEN BY HAND: a team's handbook, its bank, its shared drive. So a list with no address
 * field is still offered links, as rows to correct, rather than having the kind vanish from the picker.
 */
const UNBOUND: Record<string, { cells: string[] }[]> = {
  link: [
    { cells: ['Handbook', 'https://example.com/handbook', 'How the work is done here'] },
    { cells: ['This page', '#', 'Back to the top'] },
  ],
};

const NUMERIC = new Set(['money', 'int', 'decimal', 'duration']);
const DATED = new Set(['day', 'instant']);

function matches(field: FieldDecl, want: Want, decl: RegisterDecl): boolean {
  switch (want) {
    case 'title':
      return field.id === decl.title;
    case 'number':
      return NUMERIC.has(field.type);
    case 'date':
      return DATED.has(field.type);
    case 'enum':
      return field.type === 'enum';
    case 'ref':
      return field.type === 'ref';
    case 'text':
      return field.type === 'text' || field.type === 'document';
    case 'url':
      return field.type === 'url';
    case 'file':
      /* `FieldType` EXCLUDES 'file' ON PURPOSE (`schema.ts`'s own note: no register this app draws declares one), the
         same reason `isFile` in `field-draft.ts` casts to compare against it. */
      return (field.type as string) === 'file';
    default:
      return true;
  }
}

/**
 * The first type-compatible field for each cell, never reusing one.
 *
 * A `spec` over obligations that put `amount` in both the value and the note column would be a
 * block that says the same thing twice, and the author would have to notice and fix it — which is
 * exactly the correction a seed exists to avoid.
 */
function fill(decl: RegisterDecl, slots: Slot[]): { field: string; as?: 'title' | 'fact' }[] | null {
  const spent = new Set<string>();
  const out: { field: string; as?: 'title' | 'fact' }[] = [];
  for (const { want, hard, only, as } of slots) {
    const exact = decl.fields.find((f) => !spent.has(f.id) && f.type !== 'secret' && matches(f, want, decl));
    if (only) {
      if (exact) {
        spent.add(exact.id);
        out.push({ field: exact.id, ...(as ? { as } : {}) });
      }
      continue;
    }
    /* NO FALLBACK ON A HARD SLOT. The whole kind is unavailable for this register instead, which is
       the only honest answer: there is no field here that can be the number a bar adds up. */
    const hit = exact ?? (hard ? undefined : decl.fields.find((f) => !spent.has(f.id) && f.type !== 'secret'));
    if (!hit) {
      if (hard) return null;
      /* A soft want with nothing left falls to the title, and the loop CONTINUES: returning here
         would hand back a short column list, and a kind drawn with fewer cells than its arity is a
         row whose values are one column to the left of their headings. */
      out.push({ field: decl.title, ...(as ? { as } : {}) });
      continue;
    }
    spent.add(hit.id);
    out.push({ field: hit.id, ...(as ? { as } : {}) });
  }
  return out;
}

/**
 * A block of a kind one of the record's packs declares (`block.<id>`), bound to the list and drawing.
 *
 * THE SPEC SAYS HOW MANY CELLS A ROW HAS AND NOTHING ABOUT WHAT EACH ONE WANTS, so the first is the list's title and the
 * rest are the next fields in the order the list declares them: a seed to narrow, as every other is. A list this build
 * does not describe, or one with too few fields to fill the cells, is not offered the kind.
 */
export function seedPackBlock(kind: string, spec: { cells: number; minSpan: number; title: string }, register: string): PageBlock | null {
  const decl = REGISTERS[register];
  if (!decl || spec.cells < 1) return null;
  if (decl.fields.filter((f) => f.type !== 'secret').length < spec.cells) return null;
  const wants: Slot[] = [{ want: 'title' }, ...Array.from({ length: spec.cells - 1 }, (): Slot => ({ want: 'any' }))];
  const filled = fill(decl, wants);
  if (!filled) return null;
  return {
    kind,
    heading: decl.name,
    span: spec.minSpan,
    source: `register.${register}`,
    columns: filled,
    limit: 6,
    empty: `Nothing in ${decl.name.toLowerCase()} yet.`,
  };
}

/**
 * The form type each of a list's field types is asked as, the kernel's `formTypeOf` (`packages/kernel/src/kinds/form.ts`)
 * over this build's field types. A type it leaves out is one a form does not write yet: a secret, a list of values.
 */
const FORM_TYPE: Readonly<Partial<Record<FieldDecl['type'], string>>> = {
  text: 'text',
  url: 'text',
  email: 'text',
  ref: 'text',
  document: 'long',
  int: 'number',
  decimal: 'number',
  duration: 'number',
  money: 'money',
  day: 'date',
  instant: 'date',
  enum: 'choice',
  bool: 'bool',
};

/** How many of a list's fields a seeded form asks: its name and three more, a question a line on a phone. */
const FORM_FIELDS = 4;
/** A form's label and its button, in bytes, as the kernel holds them (`LABEL_MOST`). */
const LABEL_MOST = 40;

/** A field's question as a person reads it: its own label, or its id said as words. */
const labelOf = (f: FieldDecl): string => {
  const said = (f.label ?? f.id.replace(/[_-]+/g, ' ')).trim();
  const words = said.charAt(0).toUpperCase() + said.slice(1);
  return new TextEncoder().encode(words).length <= LABEL_MOST ? words : words.slice(0, LABEL_MOST).trim();
};

/**
 * A FORM OVER THE LIST'S OWN FIELDS (PGS-A15's kind, `{ kind: 'form', verb, register, fields, submit }`): its name first
 * and required, then the next fields the list declares that a form can write, each asked by its own label and typed as
 * the list types it. Null where the list holds no field a form can ask, which a list with a name never is.
 */
function seedForm(decl: RegisterDecl, register: string, span: number): PageBlock | null {
  const title = decl.fields.find((f) => f.id === decl.title);
  const rest = decl.fields.filter((f) => f.id !== decl.title);
  const asked = [...(title ? [title] : []), ...rest].filter((f) => FORM_TYPE[f.type] !== undefined).slice(0, FORM_FIELDS);
  if (asked.length === 0) return null;
  const fields = asked.map((f) => ({ id: f.id, label: labelOf(f), type: FORM_TYPE[f.type]!, ...(f.id === decl.title ? { required: true } : {}) }));
  const form: PageBlock & { verb: string; register: string; fields: typeof fields; submit: string } = {
    kind: 'form',
    heading: `Add to ${decl.name.toLowerCase()}`,
    span,
    verb: 'row.create',
    register,
    fields,
    submit: 'Add',
  };
  return form;
}

/**
 * WHAT CHANGED IN THE LIST, from the record's own log: a `feed` over `activity` narrowed to this list (`list is …`, the
 * narrowing the kernel's activity source reads), newest first, the first five drawn.
 */
function seedFeed(decl: RegisterDecl, register: string, span: number): PageBlock {
  return {
    kind: 'feed',
    heading: `What changed in ${decl.name.toLowerCase()}`,
    span,
    source: 'activity',
    where: `list is ${register}`,
    first: 5,
    empty: `Nothing has changed in ${decl.name.toLowerCase()} yet.`,
  };
}

/** The kinds seeded from the list itself rather than from cells a field fills: what it asks, and what changed in it. */
const LISTED: Readonly<Record<string, (decl: RegisterDecl, register: string, span: number) => PageBlock | null>> = {
  form: seedForm,
  feed: seedFeed,
};

/** Every kind the picker can seed: bound to a register, seeded from the list, or authored with example rows. */
export const BINDABLE = [...Object.keys(WANTS), ...Object.keys(LISTED), ...Object.keys(AUTHORED)];

/**
 * The kinds THIS register can actually fill, which is not the same list for every register.
 *
 * The picker used to offer all of them and hand back nothing for the ones that could not be filled:
 * `seedBlock` returned null, the tile rendered its description, and clicking it did nothing at all.
 * A control that cannot work should not be on the screen — 21 §3.4 again.
 */
export const bindableFor = (register: string): string[] =>
  BINDABLE.filter((kind) => seedBlock(kind, register) !== null);

/**
 * A block, bound and drawing, at the width its kind is happiest at.
 *
 * The seed span is the kind's own floor rather than 12: a `todo` inserted at full width is a
 * shopping list across a 1180px page, and the first thing anybody would do is narrow it. Starting
 * narrow makes the common correction "make it wider", which is the direction the control is
 * better at.
 *
 * `rows` ARE THE ROWS THE PREVIEW WILL DRAW, and the first filter and a gauge's target are proposed from them. They were
 * the sample's rows of the list whatever the record held, so the Add a block sheet proposed a gauge's target from the
 * sample's sum on any record. The sheet hands in the rows its page's own block of that list drew, and a page with none
 * is proposed no filter and no target. The default is `held.ts`'s table, which only a test fills.
 */
export function seedBlock(kind: string, register: string, rows: readonly Entry[] = ROWS[register] ?? []): PageBlock | null {
  if (!isKind(kind)) return null;
  const spec = KINDS[kind];

  /* An authored kind takes no register and asks the fields nothing. It still arrives drawing. */
  const authored = AUTHORED[kind];
  if (authored)
    return {
      kind,
      heading: REGISTERS[register]?.name ?? 'Untitled',
      span: spec.minSpan,
      authored,
    };

  const decl = REGISTERS[register];
  const listed = LISTED[kind];
  if (decl && listed) return listed(decl, register, spec.minSpan);
  const wants = WANTS[kind];
  if (!decl || !wants) return null;

  const fit = fill(decl, wants);
  const filled = fit && fit.length >= (LEAST[kind] ?? 0) ? fit : null;
  if (!filled) {
    const unbound = UNBOUND[kind];
    return unbound ? { kind, heading: decl.name, span: spec.minSpan, authored: unbound } : null;
  }
  const columns = filled.slice(0, Math.max(spec.cells, wants.length));

  /**
   * AN AGGREGATE OVER A REGISTER WITH TWO SIDES ADDS THEM TOGETHER, and the preview reads as a fact.
   *
   * A seeded `bar` over obligations grouped every row by counterparty and summed the money — so
   * "Halden Type Co GBP 42,490.00" was every obligation regardless of direction: money owed TO you
   * and money you OWE, in one bar. `21 §3.3` says the preview is a shape problem and the config is
   * "synthesised from the user's real data"; a figure made of two opposite things is neither shape
   * nor data, it is a wrong number in a tile somebody chooses a block from.
   *
   * THE FIRST ENUM'S COMMONEST VALUE, because that is a real subset the reader can check: the bar
   * says one side of the register and the heading says which. It is a starting predicate to be
   * edited, which is what everything else in a seeded block is too.
   */
  const partition = ((): { field: string; value: string } | null => {
    if (!AGGREGATES.has(kind)) return null;
    for (const f of decl.fields)
      if (f.type === 'enum' && (f.values?.length ?? 0) > 1 && !columns.some((c) => c.field === f.id)) {
        const counted = new Map<string, number>();
        for (const e of rows) {
          const v = String(e.fields[f.id] ?? '');
          if (v) counted.set(v, (counted.get(v) ?? 0) + 1);
        }
        const top = [...counted].sort((a, b) => b[1] - a[1])[0];
        if (top) return { field: f.id, value: top[0] };
      }
    return null;
  })();

  /* A GAUGE WITHOUT A TARGET DRAWS NOTHING, and a preview that draws nothing teaches somebody that
     the kind is broken — which is what it did: `Number({ amount, currency })` is `NaN`, so a money
     column summed to `NaN`, the target was dropped, and the tile read `— of —` in the one place the
     picker is meant to show a shape. Money is an object with its own currency, and reading it as a
     number is the mistake minor units exist to make impossible everywhere else.

     There is no target in the record — a budget is a decision, not a column — so the seed proposes
     one from the rows it is about to show: double the current sum, rounded, so the bar lands near
     half and the shape reads as a gauge rather than as full or empty. */
  const target =
    kind === 'gauge'
      ? (() => {
          const of = columns[1]?.field;
          if (!of) return undefined;
          const sum = rows
            .filter((e) => !partition || String(e.fields[partition.field] ?? '') === partition.value)
            .reduce((a, e) => a + (amountOf(e.fields[of]) ?? (Number(e.fields[of]) || 0)), 0);
          return sum > 0 ? Math.round(sum * 2) : undefined;
        })()
      : undefined;

  return {
    kind,
    heading: partition ? `${decl.name}: ${partition.value.replace(/_/g, ' ')}` : decl.name,
    span: spec.minSpan,
    source: `register.${register}`,
    columns,
    ...(partition ? { where: `${partition.field} is ${partition.value.replace(/_/g, ' ')}` } : {}),
    ...(target === undefined ? {} : { target }),
    limit: ROW_CAP[kind] ?? 6,
    /**
     * Mandatory on every source-bound block (06 §1.1), and it is a sentence about A FILTER.
     *
     * It said `Nothing in <name> yet.` under a comment claiming it was written for day one. Day one
     * is not this sentence's job any more and never should have been: an empty LIST is `no-data-yet`
     * and `blocks.ts` writes that state's own words, with the register's `holds:` under them and a
     * button to add the first row. `empty:` is what shows when the list has rows and this block's
     * `where:` admitted none of them — where "Nothing in tasks yet" is false in front of fourteen
     * tasks.
     *
     * SO IT IS ONLY A FILTER SENTENCE WHEN THERE IS A FILTER. Without a partition this block draws
     * the whole list, cannot be empty unless the list is, and its `empty:` is the day-one sentence
     * `blocks.ts` will use verbatim.
     */
    empty: partition
      ? `No ${decl.one.toLowerCase()} is ${partition.value.replace(/_/g, ' ')}.`
      : `Nothing in ${decl.name.toLowerCase()} yet.`,
  };
}

/** The weeks a seeded strip shows: this one and the four after it, what a person plans across. */
export const STRIP_WEEKS = 5;

/**
 * A CALENDAR AS A STRIP OF WEEKS, "Next five weeks" (`weeks:`, `packages/kernel/src/kinds/calendar.ts`): the calendar's
 * own seed with the strip's one key, so it is offered exactly where a calendar is, over a list with a date. `weeks` is
 * a key `PageBlock` does not name yet, so it rides beside it as the kernel reads it.
 */
export function seedStrip(register: string, rows: readonly Entry[] = ROWS[register] ?? []): (PageBlock & { weeks: number }) | null {
  const calendar = seedBlock('calendar', register, rows);
  return calendar ? { ...calendar, heading: 'Next five weeks', weeks: STRIP_WEEKS } : null;
}

/**
 * THE REASON EACH KIND THE RENDERER DRAWS IS NOT IN THE MENU, in plain words. Every kind of `KINDS` is offered
 * (`BINDABLE`) or is here, and a test holds the two to the renderer's table (`add-menu.test.ts`), so a kind added to the
 * renderer and to neither fails a test instead of going missing from the menu without a word.
 */
export const NOT_OFFERED: Readonly<Record<string, string>> = {
  stat: 'Figures are measures the record keeps across lists, not fields of one list.',
  sparkline: 'A small trend line draws a measure over time, which the record keeps and a list does not.',
  bridge: 'From start to end walks the money ahead, which only the record works out.',
  series: 'Bars by month draw a measure month by month, which the record keeps and a list does not.',
  lines: 'A line over time draws a measure the record keeps, not a field of one list.',
  progress: 'A progress bar needs a target for each item, which a list does not hold. A gauge adds one number up against a target.',
  forecast: 'Cash ahead is the record working out the money to come, drawn where the record does that.',
  roadmap: 'A roadmap needs how many days each item takes. Timeline and Lanes show what falls when.',
  section: 'A section heading shows nothing of its own: it names the blocks after it on the page.',
  diff: 'Before and after shows how one text changed, so it belongs where a change is read, not over a list.',
  agents: 'What agents did is the record’s own account of its agents, not something a list holds.',
  queue: 'The questions waiting on you are the record’s, and they wait in Needs you.',
  capture: 'A form adds to this list from the page, with a question for each of its fields.',
  inputs: 'Boxes to type into change one item, so they belong on that item’s own page.',
  kpis: 'Key numbers are each project’s own, drawn on its page and on Today, not fields of one list.',
};

/** What a hard slot wants, said as the thing a list lacks. */
const WANT_WORDS: Readonly<Record<Want, string>> = {
  title: 'a name',
  number: 'a number',
  date: 'a date',
  enum: 'a choice',
  ref: 'a link to another list',
  text: 'words',
  url: 'an address',
  file: 'a picture or a file',
  any: 'one more field',
};

/**
 * The bound kinds THIS list cannot fill, each with what it lacks: the first hard slot no field of the list can be, or,
 * for a kind that needs more columns than its hard slots say, one more field. A kind with a written-out fallback is
 * offered written out and is not here.
 */
export function notOfferedFor(register: string): { kind: string; lacks: string }[] {
  const decl = REGISTERS[register];
  if (!decl) return [];
  return Object.entries(WANTS).flatMap(([kind, wants]) => {
    if (UNBOUND[kind] || seedBlock(kind, register, []) !== null) return [];
    const missing = wants.find((s) => s.hard && !decl.fields.some((f) => f.type !== 'secret' && matches(f, s.want, decl)));
    return [{ kind, lacks: WANT_WORDS[missing?.want ?? 'any'] }];
  });
}

/** "A, B and C", as a sentence lists things. */
const andList = (names: readonly string[]): string =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/**
 * THE ONE LINE THE MENU SAYS for what this list cannot fill, or null where it fills them all: "Not offered for Notes:
 * Heat map and Lanes need a date; Ring needs a number." `nameOf` is the menu's own name for a kind.
 */
export function notOfferedLine(register: string, nameOf: (kind: string) => string): string | null {
  const decl = REGISTERS[register];
  const missing = notOfferedFor(register);
  if (!decl || missing.length === 0) return null;
  const byLack = new Map<string, string[]>();
  for (const { kind, lacks } of missing) byLack.set(lacks, [...(byLack.get(lacks) ?? []), nameOf(kind)]);
  const parts = [...byLack].map(([lacks, names]) => `${andList(names)} ${names.length === 1 ? 'needs' : 'need'} ${lacks}`);
  /* A SEMICOLON BETWEEN THE LACKS, since each part is already a list of names joined by "and". */
  return `Not offered for ${decl.name}: ${parts.join('; ')}.`;
}
