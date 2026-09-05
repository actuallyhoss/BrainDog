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

import { REGISTERS, ROWS } from './data.ts';
import type { FieldDecl, PageBlock, RegisterDecl } from './schema.ts';

/** What each cell of a kind wants, in order. `any` takes the first field left. */
type Want = 'title' | 'number' | 'date' | 'enum' | 'ref' | 'text' | 'any';

/**
 * Cell wants per kind. Only the kinds a register can fill are here — `note`, `quote`, `code` and
 * `tree` are authored rather than bound, and `stat` takes metrics rather than fields.
 */
const WANTS: Record<string, Want[]> = {
  bar: ['ref', 'number'],
  /* A gauge groups nothing and projects nothing: it sums one column against a target. The first
     column only names the figure, so it wants the title and the second wants the number. */
  gauge: ['title', 'number'],
  /* An ENUM FIRST, because chips group and count by their first column. Bound to the title, every
     chip is a count of one wearing a whole row's name in small caps — which is what it did. */
  chips: ['enum'],
  spec: ['title', 'number', 'date'],
  params: ['title', 'text', 'text'],
  todo: ['title', 'date'],
  steps: ['title', 'text', 'enum'],
  timeline: ['date', 'title', 'ref'],
  board: ['enum', 'title', 'ref'],
  comparison: ['title', 'number', 'date'],
  table: ['title', 'number', 'date'],
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
function fill(decl: RegisterDecl, wants: Want[]): { field: string }[] {
  const spent = new Set<string>();
  return wants.map((want) => {
    const hit =
      decl.fields.find((f) => !spent.has(f.id) && f.type !== 'secret' && matches(f, want, decl)) ??
      decl.fields.find((f) => !spent.has(f.id) && f.type !== 'secret');
    if (hit) spent.add(hit.id);
    return { field: hit?.id ?? decl.title };
  });
}

/** Kinds the picker offers for a register-bound page. The rest are authored, not bound. */
export const BINDABLE = Object.keys(WANTS);

/**
 * A block, bound and drawing, at the width its kind is happiest at.
 *
 * The seed span is the kind's own floor rather than 12: a `todo` inserted at full width is a
 * shopping list across a 1180px page, and the first thing anybody would do is narrow it. Starting
 * narrow makes the common correction "make it wider", which is the direction the control is
 * better at.
 */
export function seedBlock(kind: string, register: string): PageBlock | null {
  const decl = REGISTERS[register];
  const wants = WANTS[kind];
  if (!decl || !wants || !isKind(kind)) return null;
  const spec = KINDS[kind];

  const columns = fill(decl, wants).slice(0, Math.max(spec.cells, wants.length));

  /* A GAUGE WITHOUT A TARGET DRAWS NOTHING, and a preview that draws nothing teaches somebody that
     the kind is broken. There is no target in the record — a budget is a decision, not a column —
     so the seed proposes one from the rows it is about to show: double the current sum, rounded, so
     the bar lands near half and the shape reads as a gauge rather than as full or empty. It is a
     starting number to be edited, which is what everything else in a seeded block is too. */
  const target =
    kind === 'gauge'
      ? (() => {
          const of = columns[1]?.field;
          if (!of) return undefined;
          const sum = (ROWS[register] ?? []).reduce((a, e) => a + Number(e.fields[of] ?? 0), 0);
          return sum > 0 ? Math.round(sum * 2) : undefined;
        })()
      : undefined;

  return {
    kind,
    heading: decl.name,
    span: spec.minSpan,
    source: `register.${register}`,
    columns,
    ...(target === undefined ? {} : { target }),
    limit: 6,
    /* Mandatory on every source-bound block (06 §1.1), and it renders on day one — which is exactly
       when a register is empty, so it is written for that day rather than for a full one. */
    empty: `Nothing in ${decl.name.toLowerCase()} yet.`,
  };
}
