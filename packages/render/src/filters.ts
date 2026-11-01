/**
 * What a page's filter strip decides, as functions both drawers call (`svelte/Filters.svelte`, `filtersHTML`).
 *
 * WHAT IT IS FOR. A declared page that names `filters:` is answered with the values each field holds and how many open
 * things each has (the kernel's `readPage`), and a host draws them above the page as one strip: a segmented control
 * where a field has a few values, chips where it has more. Pressing one narrows every block on the page to it; the
 * choice is the host's to keep (in the address, `?f.project=12`) and to read the page again with.
 *
 * CALM BEFORE COMPLETE. A strip of every project is a chip cloud, so at most `FILTER_CHIPS` values are
 * drawn and the rest wait behind one control that says how many there are. The value chosen is always drawn, wherever
 * it sits in the order, so the strip never hides what the page is narrowed to. A field with nothing to choose between
 * (one value and none chosen) is not drawn at all. Counts are the quiet part (`data-calm`), shown on hover or focus.
 *
 * THE ORDER IS THE RECORD'S, as a queue's is: the kernel sends the values most-used first, and this never re-sorts.
 */

import { plainName } from './widgets.ts';

/** One value a field holds: what is matched, what it is called, and how many open things hold it. */
export type FilterValue = { value: string; label: string; count?: number | undefined; hue?: number | undefined };

/** One field a page may be narrowed by, as the record answers it. `control` is the declaration's, where it said one. */
export type Filter = { field: string; label: string; control?: 'chips' | 'segmented' | undefined; values: readonly FilterValue[] };

/** Where the host hears a choice: the field, and the value, or null for all of them. */
export type OnFilter = (field: string, value: string | null) => void;

/** The strip's own words. The rest are the record's labels. */
export const FILTERS_ALL = 'All';
/** What the control holding the values past the first few says, as a queue's count of what is left does. */
export const filtersMore = (n: number): string => `${n} more`;

/** The most values drawn before the rest fold into one control. */
export const FILTER_CHIPS = 5;
/** The most values a field may have to be drawn as a segmented control where its declaration names none. */
export const SEGMENTED_MOST = 4;

/** `hue` is the colour of the row a value points at (a project's), drawn as a dot before its name; `null` for none. */
export type FilterChoice = { value: string; label: string; count: number | null; on: boolean; hue: number | null };

export type FilterPlan = {
  field: string;
  label: string;
  control: 'chips' | 'segmented';
  /** Whether nothing is chosen, which is the "All" choice pressed. */
  all: boolean;
  shown: FilterChoice[];
  rest: FilterChoice[];
};

/**
 * Each field as the strip draws it, in the record's order, leaving out a field with nothing to choose between.
 *
 * A CHOSEN VALUE THE ANSWER NO LONGER HOLDS (its last open thing was closed) is still drawn, at the end of the ones
 * shown with a count of nothing, so a person can see what the page is narrowed to and let it go.
 */
export function filtersPlan(filters: readonly Filter[], chosen: Readonly<Record<string, string>> = {}): FilterPlan[] {
  const plans: FilterPlan[] = [];
  for (const f of filters) {
    const picked = Object.hasOwn(chosen, f.field) ? chosen[f.field] : undefined;
    const values: FilterChoice[] = f.values.map((v) => ({
      value: v.value,
      /* SAID AS A NAME, NOT AS THE BANK SHOUTED IT (UI pass, 1 Nov): Payees' strip read "BLUE BOTTLE COFFEE 20" and
         "SHELL 0442 8" beside rows that said "Blue Bottle Coffee"; the value matched is untouched. */
      label: plainName(v.label || v.value) ?? v.value,
      count: typeof v.count === 'number' && Number.isFinite(v.count) ? v.count : null,
      on: v.value === picked,
      hue: typeof v.hue === 'number' && Number.isInteger(v.hue) && v.hue >= 0 && v.hue < 360 ? v.hue : null,
    }));
    if (picked !== undefined && !values.some((v) => v.on)) values.push({ value: picked, label: picked, count: 0, on: true, hue: null });
    /* A FIELD WITH ONE VALUE SAYS NOTHING ON ITS OWN, so it is left out; BUT NOT WHILE THE PAGE IS NARROWED BY ANOTHER
       (skills pass 2 Nov): picking "Coffee" on the Ledger left every line in one account, so the Account row went and
       the whole page jumped up a row under the reader's pointer, and came back down on "All". Its row stays while any
       choice is in force, "All" and its one value, which is also the fact that every line shown is in that account. */
    const narrowed = Object.values(chosen).some((v) => v !== undefined);
    if (values.length === 0 || (values.length < 2 && picked === undefined && !narrowed)) continue;
    const control = f.control ?? (values.length <= SEGMENTED_MOST ? 'segmented' : 'chips');
    let shown = values.slice(0, FILTER_CHIPS);
    let rest = values.slice(FILTER_CHIPS);
    const hidden = rest.find((v) => v.on);
    if (hidden) {
      shown = [...shown.slice(0, FILTER_CHIPS - 1), hidden];
      rest = values.filter((v) => !shown.includes(v));
    }
    plans.push({ field: f.field, label: f.label || f.field, control, all: picked === undefined, shown, rest });
  }
  return plans;
}
