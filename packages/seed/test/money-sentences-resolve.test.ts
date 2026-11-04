/**
 * Every `{{name}}` in a sentence, note or heading of Money's pages is a figure Money declares or a built-in one (REC-B01
 * build 4).
 *
 * WHY. A sentence that names a figure nobody declared prints its braces: "Cash is {{cash-nwo}} across 2 accounts" on the
 * first screen a person reads (the braces his pages printed). The record fills a name only where
 * it can read one, and says nothing when it cannot, so the only place the mistake can be caught is here, before a pack
 * ships. Figures added later (the signs, `rates-age-days`) are covered the day they are declared, since the names are read
 * from the built document and the built-in list, never from a list kept in this file.
 *
 * WHAT IS READ, AS THE RECORD READS IT (`pathsOf` in `packages/kernel/src/pages.ts`): a block's heading, body, empty
 * sentence and each sentence of its `says`, the cells a person wrote, the note under a figure and a column's label, with
 * code spans lifted out. A typed form (`{{money:amount}}`) is read by its argument. What a name may be (`pathOf` there):
 * a figure, `<figure>.change` or the rows it counts (`.first`, `.names`, `.more`, `.since`, and `.first_<field>`, a field
 * of the first of them), where a walk to zero goes under (`.on`, `.because`, `.because_amount`), or a count of one of Money's own lists, whole or by a state its list declares. ON A PAGE OF EACH ROW (`for:`), a field of that row and `spoken` are filled first, everywhere on the
 * page (`fill`), so `{{name}}` there is the book's name and not a figure. A name anywhere else on a page is never filled,
 * and printed as written, so it is a fault wherever it is.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { builtInFigure } from '../../kernel/src/built-in-figures.ts';

import { firstPartyDocument } from '../src/index.ts';

type Decl = Record<string, unknown>;
type Field = { id: string; type?: string; values?: string[] };

/** The typed forms of `05 §7.2`, whose argument may be a name. */
const TYPED = new Set(['date', 'day', 'until', 'ago', 'money', 'quantity', 'pct', 'ref']);
/** What `<figure>.<part>` may ask besides the figure itself. */
const FIGURE_PARTS = new Set(['change', 'moved', 'first', 'names', 'more', 'since']);
/** What `<figure>.<part>` may ask of a walk to zero: where it goes under (`crossingValue`), since money-core 3.27.0. */
const CROSSING_PARTS = new Set(['on', 'because', 'because_amount', 'low', 'low_on']);
/** And of a money figure, its currencies apart, the sum converted and the rates' day (`convertedValue`), since 3.27.0. */
const CONVERTED_PARTS = new Set(['apart', 'converted', 'rate_on', 'rate_age', 'groups']);
/** Where on a page the record fills a name from the figures: the places `pathsOf` reads. */
const SAID = [/\.blocks\[\d+\]\.(?:heading|body|empty)$/, /\.blocks\[\d+\]\.says\[\d+\]\.body$/, /\.cells\[\d+\]\.note$/, /\.columns\[\d+\]\.label$/, /\.authored\[\d+\]\.cells\[\d+\]$/];

/** Every string under `value`, with where it is. */
function* strings(value: unknown, at: string): Generator<[string, string]> {
  if (typeof value === 'string') yield [at, value];
  else if (Array.isArray(value)) for (const [i, v] of value.entries()) yield* strings(v, `${at}[${i}]`);
  else if (value !== null && typeof value === 'object') for (const [k, v] of Object.entries(value)) yield* strings(v, `${at}.${k}`);
}

/** Every name a page says that the record will not fill, each as a sentence naming where. Nothing, for a page that has none. */
export function unresolved(doc: { declarations: Decl[] }): string[] {
  const figures = new Set(doc.declarations.flatMap((d) => (typeof d.metric === 'string' ? [d.metric] : [])));
  const lists = new Map(
    doc.declarations.flatMap((d) => (typeof d.register === 'string' && Array.isArray(d.fields) ? [[d.register, d] as const] : [])),
  );
  const isFigure = (id: string): boolean => figures.has(id) || builtInFigure(id) !== null;
  const statesOf = (list: string): string[] => {
    const decl = lists.get(list);
    const state = decl && typeof decl.state === 'string' ? (decl.fields as Field[]).find((f) => f.id === decl.state) : undefined;
    return state?.values ?? [];
  };
  /** Whether `path` is a name the record answers from Money's own figures and lists. */
  const answers = (path: string): boolean => {
    const parts = path.split('.');
    if (parts.length === 1) return isFigure(path);
    if (parts.length !== 2) return false;
    const [head, tail] = parts as [string, string];
    if (FIGURE_PARTS.has(tail) && isFigure(head)) return true;
    if (CONVERTED_PARTS.has(tail)) return doc.declarations.some((d) => d.metric === head && typeof d.format === 'string' && d.format.startsWith('money'));
    if (CROSSING_PARTS.has(tail)) {
      const walked = doc.declarations.find((d) => d.metric === head);
      const walk = (walked?.value as { walk?: unknown } | undefined)?.walk;
      return walked?.source === 'forecast.runway' && (walk === 'days_to_zero' || walk === 'zero_on');
    }
    /* `first_<field>` IS ONE FIELD OF THE FIRST ROW A FIGURE COUNTS, a field its list declares (`rowsValue`). */
    if (tail.startsWith('first_')) {
      const source = doc.declarations.find((d) => d.metric === head)?.source;
      const list = typeof source === 'string' && source.startsWith('register.') ? lists.get(source.slice('register.'.length)) : undefined;
      return ((list?.fields as Field[] | undefined) ?? []).some((f) => f.id === tail.slice('first_'.length));
    }
    return lists.has(head) && (tail === 'count' || statesOf(head).includes(tail));
  };
  const out: string[] = [];
  for (const page of doc.declarations.filter((d) => typeof d.page === 'string')) {
    /* `for: { register: 'books' }`, the list the page is made once a row of. */
    const over = (page.for as { register?: unknown } | undefined)?.register;
    const each = typeof over === 'string' ? lists.get(over) : undefined;
    /* `{{seq}}` IS THE ROW'S OWN NUMBER, filled as `{{spoken}}` is (`fill` in the kernel), since money-core 3.19.0. */
    const rowHoles = new Set(['spoken', 'seq', ...((each?.fields as Field[] | undefined) ?? []).map((f) => f.id)]);
    for (const [at, text] of strings(page, `page.${String(page.page)}`)) {
      const said = SAID.some((re) => re.test(at));
      for (const m of text.replace(/`[^`]*`/g, ' ').matchAll(/\{\{([^{}]*)\}\}/g)) {
        const body = (m[1] ?? '').trim();
        if (each !== undefined && rowHoles.has(body)) continue;
        const colon = body.indexOf(':');
        const form = colon > 0 ? body.slice(0, colon).trim() : '';
        /* A `{{bad:words}}` PHRASE IS WORDS IN THE DANGER COLOUR AND NOT A NAME (bad-phrase-59). A token inside one is
           still matched on its own by the same pattern. */
        if (form === 'bad') continue;
        const path = TYPED.has(form) ? body.slice(colon + 1).trim() : body;
        /* A TYPED FORM'S LITERAL IS THE AUTHOR'S VALUE, `{{money:GBP 40}}`, and not a name. */
        if (TYPED.has(form) && !/^[A-Za-z]/.test(path)) continue;
        if (!said) out.push(`${at} says ${m[0]} where nothing fills it`);
        else if (!answers(path)) out.push(`${at} says ${m[0]}, and Money declares no figure ${path} and none is built in`);
      }
    }
  }
  return out;
}

const money = (): { declarations: Decl[] } => {
  const doc = firstPartyDocument('money-core') as { declarations: Decl[] } | null;
  assert.ok(doc, 'money-core has no document');
  return doc;
};

test("EVERY NAME IN A SENTENCE, NOTE OR HEADING OF MONEY'S PAGES IS A FIGURE MONEY DECLARES OR A BUILT-IN ONE", () => {
  const doc = money();
  const pages = doc.declarations.filter((d) => typeof d.page === 'string');
  assert.ok(pages.length >= 2, `only ${pages.length} pages were read, so the document was not`);
  /* AND THE TEST READS NAMES AT ALL: Money's opening line names three figures today. */
  const named = pages.flatMap((p) => [...strings(p, '')].filter(([, t]) => t.includes('{{'))).length;
  assert.ok(named >= 5, `only ${named} strings with a name were found, so the pages were not read`);
  assert.deepEqual(unresolved(doc), []);
});

test('THE GUARD BITES: a sentence that names {{cash-nwo}}, a row field off a page of rows, and a name nothing fills are each named', () => {
  const doc = money();
  const money0 = doc.declarations.find((d) => d.page === 'money')!;
  const planted = {
    declarations: doc.declarations.map((d) =>
      d !== money0
        ? d
        : {
            ...d,
            blocks: [
              ...(d.blocks as Decl[]),
              { kind: 'text', body: 'Cash is {{cash-nwo}} today.' },
              { kind: 'text', heading: 'Kept in {{name}}', body: '{{cash-now.change}} on a month ago, `{{literal}}` in code.' },
              { kind: 'stat', unset: 'Nothing yet in {{cash-now}}', cells: [{ metric: 'cash-now', note: 'In {{money:totals}}' }] },
            ],
          },
    ),
  };
  const found = unresolved(planted);
  for (const expected of [
    /\.body says \{\{cash-nwo\}\}, and Money declares no figure cash-nwo/,
    /\.heading says \{\{name\}\}, and Money declares no figure name/,
    /\.unset says \{\{cash-now\}\} where nothing fills it/,
    /\.note says \{\{money:totals\}\}, and Money declares no figure totals/,
  ])
    assert.ok(found.some((why) => expected.test(why)), `nothing matched ${expected}; found:\n${found.join('\n')}`);
  assert.equal(found.length, 4, `the change and the code span were named too:\n${found.join('\n')}`);
});
