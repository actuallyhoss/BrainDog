/**
 * The share templates (sharing plan §2.11): data only. Each writes its rows as one bundle, and the Share sheet fills
 * what it asks for, in place of the `$` words: `$project` a project row id, `$list` a list id, `$where` a condition,
 * `$row` a row id. `days` is how long it lasts from the day it is made, and none means until it is revoked.
 *
 * A custom template ("Save as a template") lives in the owner's prefs under `share.templates`, in this same shape.
 */

import type { Caps, Rung } from './lens.ts';

export type TemplateAsk = 'project' | 'list' | 'where' | 'row';

export type TemplateRow = {
  effect: 'allow' | 'deny';
  /** A target, with `$` words where the sheet fills in what it asked. */
  what: Record<string, unknown>;
  can: Rung;
  caps?: Caps;
};

export type ShareTemplate = { id: string; name: string; asks: readonly TemplateAsk[]; days: number | null; rows: readonly TemplateRow[] };

export const SHARE_TEMPLATES: readonly ShareTemplate[] = [
  {
    id: 'accountant',
    name: 'Accountant',
    asks: [],
    days: 90,
    rows: [
      { effect: 'allow', what: { lists: { has: 'money' } }, can: 'view' },
      { effect: 'deny', what: { lists: { role: 'keys' } }, can: 'view' },
    ],
  },
  {
    id: 'contractor',
    name: 'Contractor on a project',
    asks: ['project'],
    days: 30,
    /* THE LISTS ARE THE PROJECT'S OWN, read off the declarations (every list its scope field reaches), less the lists
       with a money field, so the template names no list of anybody's. */
    rows: [
      { effect: 'allow', what: { project: '$project' }, can: 'edit', caps: { delete: false } },
      { effect: 'deny', what: { lists: { has: 'money' } }, can: 'view' },
    ],
  },
  {
    id: 'assistant',
    name: 'Assistant',
    asks: [],
    days: null,
    rows: [
      { effect: 'allow', what: { record: true }, can: 'edit' },
      { effect: 'deny', what: { lists: { has: 'money' } }, can: 'view' },
      { effect: 'deny', what: { lists: { role: 'keys' } }, can: 'view' },
    ],
  },
  {
    id: 'reviewer',
    name: 'Reviewer',
    asks: ['list', 'where'],
    days: 14,
    rows: [{ effect: 'allow', what: { list: '$list', where: '$where' }, can: 'comment' }],
  },
  {
    id: 'one-row',
    name: 'One row',
    asks: ['list', 'row'],
    days: 7,
    rows: [{ effect: 'allow', what: { list: '$list', rows: ['$row'] }, can: 'view' }],
  },
];
