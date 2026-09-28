/**
 * The record the evaluation asks about: five lists of an ordinary small business and its owner, and a `project` that
 * answers a predicate the way the record's own does, over these rows.
 *
 * THE PREDICATE IS APPLIED, WHICH THE TEST DOUBLE DOES NOT DO. `test/double.ts` filters by register alone, because the
 * suite is about what this package sent. Here the question is whether a model's predicate finds the right rows, so a
 * `where` is resolved against the fixed clock (`resolveDay`, for `today` and `+30d`) and evaluated with the grammar's own
 * `evaluate`, the same function the record's rules run. A predicate the grammar refuses is refused here too and counted,
 * so a model that writes one is scored on it rather than rescued by a fallback.
 *
 * THE CLOCK STANDS STILL ON SATURDAY 14 NOVEMBER 2026, so "overdue" and "this month" name the same rows on every run and
 * each question's rows in `questions.ts` can be read off this file by a person.
 *
 * Money is in minor units with its own currency, as everywhere in the record. Two currencies are here on purpose, so a
 * question that would add them has a wrong answer to give.
 */

import { compile, evaluate, resolveDay, type Predicate, type Schema } from '@braindog/where';

import type { Projection, ProjectionRegister, ProjectionRow, ProjectQuery, RecordApi } from '../src/index.ts';

/** 2026-11-14T09:00:00Z. */
export const NOW = Date.UTC(2026, 10, 14, 9);

type Field = { id: string; type: string; values?: readonly string[] };
type List = { id: string; fields: Field[]; done: readonly string[]; rows: Record<string, unknown>[] };

const gbp = (amount: number) => ({ amount, currency: 'GBP' });
const usd = (amount: number) => ({ amount, currency: 'USD' });

/**
 * THE ROWS, BY LIST, IN `seq` ORDER. A row's spoken id is its list and its place here counted from one, so `bills#3` is
 * the third bill below. Change a row and read `questions.ts` for every question that cites it.
 */
const LISTS: List[] = [
  {
    id: 'bills',
    done: ['paid'],
    fields: [
      { id: 'what', type: 'text' },
      { id: 'amount', type: 'money' },
      { id: 'due', type: 'day' },
      { id: 'state', type: 'enum', values: ['open', 'paid'] },
    ],
    rows: [
      { what: 'Office rent', amount: gbp(185000), due: '2026-12-01', state: 'open' },
      { what: 'Accountant', amount: gbp(42000), due: '2026-11-20', state: 'open' },
      { what: 'Electricity', amount: gbp(9640), due: '2026-11-10', state: 'open' },
      { what: 'Insurance', amount: gbp(121000), due: '2027-01-15', state: 'open' },
      { what: 'Water', amount: gbp(3875), due: '2026-10-28', state: 'paid' },
      { what: 'Contractor invoice', amount: usd(360000), due: '2026-11-30', state: 'open' },
      { what: 'Broadband', amount: gbp(4500), due: '2026-11-02', state: 'paid' },
    ],
  },
  {
    id: 'subscriptions',
    done: ['cancelled'],
    fields: [
      { id: 'what', type: 'text' },
      { id: 'amount', type: 'money' },
      { id: 'cycle', type: 'enum', values: ['monthly', 'yearly'] },
      { id: 'renews', type: 'day' },
      { id: 'category', type: 'enum', values: ['software', 'design', 'personal'] },
      { id: 'state', type: 'enum', values: ['active', 'cancelled'] },
    ],
    rows: [
      { what: 'Figma', amount: usd(4500), cycle: 'monthly', renews: '2026-11-22', category: 'design', state: 'active' },
      { what: 'GitHub', amount: usd(2100), cycle: 'monthly', renews: '2026-11-18', category: 'software', state: 'active' },
      { what: 'Notion', amount: usd(9600), cycle: 'yearly', renews: '2027-03-02', category: 'software', state: 'active' },
      { what: 'Adobe', amount: gbp(5999), cycle: 'monthly', renews: '2026-11-25', category: 'design', state: 'cancelled' },
      { what: 'Cloudflare', amount: usd(2500), cycle: 'monthly', renews: '2026-12-01', category: 'software', state: 'active' },
      { what: 'Spotify', amount: gbp(1199), cycle: 'monthly', renews: '2026-11-16', category: 'personal', state: 'active' },
    ],
  },
  {
    id: 'people',
    done: [],
    fields: [
      { id: 'name', type: 'text' },
      { id: 'company', type: 'text' },
      { id: 'role', type: 'text' },
      { id: 'last_contact', type: 'day' },
    ],
    rows: [
      { name: 'Maya Chen', company: 'Northwind', role: 'designer', last_contact: '2026-11-10' },
      { name: 'Tom Alder', company: 'Acme Labs', role: 'accountant', last_contact: '2026-09-02' },
      { name: 'Priya Rao', company: 'Acme Labs', role: 'engineer', last_contact: '2026-11-12' },
      { name: 'Luca Bianchi', company: 'Riverstone', role: 'lawyer', last_contact: '2026-06-20' },
      { name: 'Sara Kim', company: 'Northwind', role: 'product manager', last_contact: '2026-10-30' },
    ],
  },
  {
    id: 'tasks',
    done: ['done'],
    fields: [
      { id: 'what', type: 'text' },
      { id: 'due', type: 'day' },
      { id: 'project', type: 'enum', values: ['Finance', 'Personal', 'Work'] },
      { id: 'state', type: 'enum', values: ['todo', 'done'] },
    ],
    rows: [
      { what: 'Send VAT return', due: '2026-11-30', project: 'Finance', state: 'todo' },
      { what: 'Renew passport', due: '2026-12-20', project: 'Personal', state: 'todo' },
      { what: 'Draft onboarding guide', due: '2026-11-12', project: 'Work', state: 'todo' },
      { what: 'Book dentist', due: '2026-11-05', project: 'Personal', state: 'done' },
      { what: 'Review contractor contract', due: '2026-11-17', project: 'Work', state: 'todo' },
      { what: 'Plan team offsite', due: '2027-01-10', project: 'Work', state: 'todo' },
    ],
  },
  {
    id: 'domains',
    done: [],
    fields: [
      { id: 'what', type: 'text' },
      { id: 'renews', type: 'day' },
      { id: 'host', type: 'text' },
    ],
    rows: [
      { what: 'brain.dog', renews: '2026-12-01', host: 'Cloudflare' },
      { what: 'example.org', renews: '2027-05-14', host: 'Gandi' },
      { what: 'oldsite.net', renews: '2026-11-19', host: 'Gandi' },
    ],
  },
];

const summaryOf = (fields: Record<string, unknown>): string => String(fields['what'] ?? fields['name'] ?? '');

/** Every row as the projection prints it. The id is the spoken one, because nothing here needs the record's ULID. */
export const ROWS: ProjectionRow[] = LISTS.flatMap((list) =>
  list.rows.map((fields, i) => ({
    id: `${list.id}-${i + 1}`,
    register: list.id,
    seq: i + 1,
    spoken: `${list.id}#${i + 1}`,
    summary: summaryOf(fields),
    fields,
  })),
);

export const INDEX: ProjectionRegister[] = LISTS.map((list) => ({
  id: list.id,
  rows: list.rows.length,
  open: list.rows.filter((r) => !list.done.includes(String(r['state']))).length,
  fields: list.fields.map((f) => ({ id: f.id, type: f.type })),
}));

const SCHEMAS: Record<string, Schema> = Object.fromEntries(
  LISTS.map((list) => [
    list.id,
    {
      register: list.id,
      fields: Object.fromEntries(list.fields.map((f) => [f.id, f.values === undefined ? { type: f.type } : { type: f.type, values: f.values }])),
    },
  ]),
);

/**
 * Every temporal word in a predicate's values, as the day it names at `NOW`. `field` and `via` are names, not values, and
 * a word that is no temporal literal is left as it was typed.
 */
const resolved = (node: unknown): unknown => {
  if (typeof node === 'string') return resolveDay(node, NOW) ?? node;
  if (Array.isArray(node)) return node.map(resolved);
  if (node === null || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) out[k] = k === 'field' || k === 'via' ? v : resolved(v);
  return out;
};

/** Whether every word of a keyword search is somewhere in the row, which is what the record's search asks of a row. */
const holdsWords = (row: ProjectionRow, q: string): boolean => {
  const text = `${row.summary} ${JSON.stringify(row.fields)}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/u)
    .filter((w) => w !== '')
    .every((w) => text.includes(w));
};

export type EvalRecord = RecordApi & {
  /** Predicates the grammar refused, since the record was built. Each ended its ask with the grammar's refusal. */
  unevaluable: number;
  /** What `propose` filed, by kind, since the record was built. */
  filed: string[];
};

export const evalRecord = (): EvalRecord => {
  const self: EvalRecord = {
    unevaluable: 0,
    filed: [],
    project(args: ProjectQuery & { budget: { tokens: number } }) {
      const index = args.registers.length === 0 ? INDEX : INDEX.filter((r) => args.registers.includes(r.id));
      if (args.registers.length === 0) {
        const value: Projection = { rows: [], index: { registers: index, open_questions: [] }, budget: { used: 40, limit: args.budget.tokens } };
        return Promise.resolve({ ok: true as const, value });
      }
      const where = args.where === undefined ? undefined : (resolved(args.where) as Predicate);
      /* A PREDICATE THE GRAMMAR REFUSES IS THE RECORD'S REFUSAL, as the record's own `project` answers it, so the ask ends
         there with the grammar's code and the model is scored on the predicate it wrote. */
      for (const register of args.registers) {
        const schema = SCHEMAS[register];
        const bad = schema === undefined || where === undefined ? [] : compile(where, schema).bad;
        if (bad[0] !== undefined) {
          self.unevaluable++;
          return Promise.resolve({ ok: false as const, refusal: bad[0] });
        }
      }
      const rows = ROWS.filter((row) => {
        const schema = SCHEMAS[row.register];
        if (!args.registers.includes(row.register) || schema === undefined) return false;
        if (args.q !== undefined && args.q.trim() !== '' && !holdsWords(row, args.q)) return false;
        return evaluate(where, row.fields, schema, { id: row.id, seq: row.seq, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', version: 1 });
      });
      const limited = args.limit === undefined ? rows : rows.slice(0, args.limit);
      const value: Projection = { rows: limited, index: { registers: index, open_questions: [] }, budget: { used: 900, limit: args.budget.tokens } };
      return Promise.resolve({ ok: true as const, value });
    },
    propose(args) {
      self.filed.push(args.body_kind);
      return Promise.resolve({ ok: true as const, value: { id: `SG${self.filed.length}` } });
    },
  };
  return self;
};
