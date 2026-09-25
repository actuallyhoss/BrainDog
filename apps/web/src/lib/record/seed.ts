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

import { ROWS } from './data.ts';
import { REGISTERS } from './held.ts';
import { amountOf } from './money.ts';

/**
 * The kinds that REDUCE rather than project.
 *
 * A kind that draws one row per row cannot add two opposite things together; a kind that sums can,
 * and did. `bar` groups and sums, `gauge` sums against a target, `stat` reads a figure.
 */
const AGGREGATES = new Set(['bar', 'gauge', 'stat']);
import type { FieldDecl, PageBlock, RegisterDecl } from './schema.ts';

/** What each cell of a kind wants, in order. `any` takes the first field left. */
type Want = 'title' | 'number' | 'date' | 'enum' | 'ref' | 'text' | 'any';

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
};

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
 */
type Slot = { want: Want; hard?: boolean };

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
function fill(decl: RegisterDecl, slots: Slot[]): { field: string }[] | null {
  const spent = new Set<string>();
  const out: { field: string }[] = [];
  for (const { want, hard } of slots) {
    const exact = decl.fields.find((f) => !spent.has(f.id) && f.type !== 'secret' && matches(f, want, decl));
    /* NO FALLBACK ON A HARD SLOT. The whole kind is unavailable for this register instead, which is
       the only honest answer: there is no field here that can be the number a bar adds up. */
    const hit = exact ?? (hard ? undefined : decl.fields.find((f) => !spent.has(f.id) && f.type !== 'secret'));
    if (!hit) {
      if (hard) return null;
      /* A soft want with nothing left falls to the title, and the loop CONTINUES: returning here
         would hand back a short column list, and a kind drawn with fewer cells than its arity is a
         row whose values are one column to the left of their headings. */
      out.push({ field: decl.title });
      continue;
    }
    spent.add(hit.id);
    out.push({ field: hit.id });
  }
  return out;
}

/** Every kind the picker can seed: bound to a register, or authored with example rows. */
export const BINDABLE = [...Object.keys(WANTS), ...Object.keys(AUTHORED)];

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
 */
export function seedBlock(kind: string, register: string): PageBlock | null {
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
  const wants = WANTS[kind];
  if (!decl || !wants) return null;

  const filled = fill(decl, wants);
  if (!filled) return null;
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
    const rows = ROWS[register] ?? [];
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
          const sum = (ROWS[register] ?? [])
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
    limit: 6,
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
