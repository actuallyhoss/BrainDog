/**
 * Changing one field of a live list over the rows it holds: what the Fields sheet asks, the preview it shows, and the one
 * call that files it (`21 §5`).
 *
 * THE OTHER HALF OF THE REGISTER EDITOR. `field-write.ts` adds and renames and `field-retire.ts` retires; neither can
 * change what a field holds, because the record refuses a type change over held values (`FIELD_TYPE_CHANGED`) and a new
 * required field over empty ones (`REQUIRED_ON_POPULATED`). This path answers every row first: the record reads the
 * list's live rows (`previewRetype`), says how many convert and which do not, and the sheet asks Clear or Keep as text
 * for each that does not, or Fill and Change to when the field is narrowed. Only when every row has its answer is the
 * change filed (`retypeField`), as one governed change the kernel lands with every row in one transaction.
 *
 * READ FROM THE RECORD, NEVER FROM THIS TAB'S COPY. `REGISTERS` is the relabelled copy the screens draw from and carries
 * no transitions, so the field is read fresh through `schema`, as `renameField` reads a list.
 *
 * AN OWNER'S LANDS AT ONCE AND ANYBODY ELSE'S WAITS ON DECIDE, the record decides which. The words say
 * which before the press, so nobody is surprised afterwards.
 */

import { createClient } from '@braindog/client';

import { forget, type Fetch } from './boot-live.ts';
import { choicesOf, DURATION_UNITS, SHEET_KINDS, type SheetKind } from './field-write.ts';
import { learn } from './remote.ts';

/**
 * The words for changing a field, kept beside the calls they describe, as `retireWords` is.
 */
export const retypeWords = {
  open: 'Change type',
  title: (label: string) => `Change ${label}`,
  subtitle: 'See what happens to everything in the list before anything changes.',
  kind: 'Holds',
  required: 'Every item must have one',
  choices: 'Choices',
  choiceLabel: (value: string) => `Words shown for ${value}`,
  up: (value: string) => `Move ${value} up`,
  down: (value: string) => `Move ${value} down`,
  takeOut: (value: string) => `Take ${value} out`,
  takeOutShort: 'Take out',
  empty: 'Empty',
  another: 'Another choice',
  addChoice: 'Add',
  flow: 'Limit which choice may follow which',
  follows: (value: string) => `After ${value}`,
  preview: 'Show what this changes',
  previewing: 'Reading the list',
  stale: 'Something changed above. Show what this changes again.',
  summary: (converts: number, failing: number, rows: number) =>
    failing === 0
      ? `${said(converts)} of ${said(rows)} change, and every one carries over.`
      : `${said(converts)} carry over. ${said(failing)} ${failing === 1 ? 'does' : 'do'} not, and each needs an answer.`,
  widens: 'Every value already reads this way, so nothing is rewritten.',
  sample: 'How some would read',
  failing: 'What needs an answer',
  clear: 'Clear',
  keep: 'Keep as text',
  keepNote: (id: string) => `Kept values go in a new text field, ${id}.`,
  fill: 'Fill',
  changeTo: 'Change to',
  pick: 'Pick one',
  left: (n: number) => `${said(n)} still ${n === 1 ? 'needs' : 'need'} an answer.`,
  convert: (n: number) => (n === 0 ? 'Save the change' : `Convert ${said(n)}`),
  converting: 'Converting',
  ownerNote: 'This lands at once, and History can put it back as one change.',
  memberNote: 'The owner is asked first, on Decide. Nothing changes until it is accepted there.',
  landed: (label: string, n: number) => (n === 0 ? `${label} is changed.` : `${label} is changed, and ${said(n)} were rewritten.`),
  filed: (label: string) => `Changing ${label} is waiting on Decide.`,
  question: (label: string, list: string) => `Change what ${label} holds on ${list}?`,
  noSchema: 'BrainDog could not read this just now. Try again.',
  noValues: 'A choice list needs at least one choice.',
  valueTwice: (value: string) => `${value} is in the choices twice.`,
  pickList: 'Pick what it links to.',
  changed: 'Something here changed while this was being sent. Try again.',
} as const;

/** A count said in words a person reads: `1 item`, `1,204 items`. */
function said(n: number): string {
  return n === 1 ? '1 item' : `${n.toLocaleString('en-GB')} items`;
}

/** One stored field, as the record's own body holds it. */
export type RawField = Record<string, unknown> & { id: string; type: string };

/** One choice as the sheet edits it: the value the rows keep, and the words a person reads for it. */
export type Choice = { value: string; label: string };

/** What the sheet has asked so far. `flow` is `null` while the field says nothing about which choice may follow which. */
export type RetypeDraft = {
  kind: SheetKind;
  choices: Choice[];
  to: string;
  unit: string;
  required: boolean;
  flow: Record<string, string[]> | null;
};

/** The answer for one row that would not carry over, as the sheet holds it before it is sent. */
export type RowAnswer = 'clear' | 'keep' | { to: string };

/** One row that would not carry over, as `previewRetype` answers it. */
export type Failing = { id: string; at: string; title: string; value: unknown; why: string; takes: ('clear' | 'keep' | 'to')[] };

/** What `previewRetype` answers (`packages/kernel/src/api/retype.ts`, `RetypePlan`). */
export type Plan = {
  op: 'retype' | 'narrow';
  register: string;
  field: string;
  from: string;
  to: string;
  widens: boolean;
  rows: number;
  converts: number;
  failing: Failing[];
  sample: { at: string; title: string; from: unknown; to: unknown }[];
  unanswered: number;
  keep: string | null;
};

const isMap = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);
/* ONE SPELLING FOR COMPARING, as `field-write.ts` folds a value: case, and the underscore a value is read aloud without. */
const fold = (s: string): string => s.normalize('NFKC').toLowerCase().replace(/[_\s]+/gu, ' ').trim();

/** The kind the sheet offers for a stored field: a `list<text>` is Tags, and a kind it does not offer reads as text. */
export function kindOf(f: RawField): SheetKind {
  if (f.type === 'list' && f.of === 'text') return 'tags';
  return (SHEET_KINDS as readonly string[]).includes(f.type) ? (f.type as SheetKind) : 'text';
}

/** The sheet's first draft of a field: what it holds now, so pressing nothing asks for nothing. */
export function draftOf(f: RawField): RetypeDraft {
  const values = Array.isArray(f.values) ? f.values.map(String) : [];
  const labels = isMap(f.labels) ? f.labels : {};
  const moves = isMap(f.transitions) ? f.transitions : null;
  const next = (v: string): string[] => {
    const move = moves?.[v];
    return isMap(move) && Array.isArray(move.to) ? move.to.map(String) : [];
  };
  const flow = moves === null ? null : Object.fromEntries(values.map((v) => [v, next(v)]));
  return {
    kind: kindOf(f),
    choices: values.map((v) => ({ value: v, label: typeof labels[v] === 'string' ? (labels[v] as string) : '' })),
    to: typeof f.to === 'string' ? f.to : '',
    unit: typeof f.unit === 'string' ? f.unit : '',
    required: f.required === true,
    flow,
  };
}

/**
 * What the field is asked to become, as the record's `as`, or the sentence saying why it is not one yet.
 *
 * ONLY THE KEYS THE KIND CARRIES, and a choice's words only where they differ from the value, so a field sent back as it
 * stands reads as no change at all. A transition keeps what it asked of a move (`requires`, `by`) when its targets change.
 */
export function asOf(f: RawField, d: RetypeDraft, lists: readonly string[]): { ok: true; as: Record<string, unknown> } | { ok: false; fix: string } {
  const as: Record<string, unknown> = {};
  if (d.kind === 'tags') Object.assign(as, { type: 'list', of: 'text' });
  else as.type = d.kind;
  if (d.kind === 'enum') {
    const values = d.choices.map((c) => c.value.trim()).filter((v) => v !== '');
    if (values.length === 0) return { ok: false, fix: retypeWords.noValues };
    const seen = new Set<string>();
    for (const v of values) {
      if (seen.has(fold(v))) return { ok: false, fix: retypeWords.valueTwice(v) };
      seen.add(fold(v));
    }
    as.values = values;
    const labels = Object.fromEntries(d.choices.filter((c) => c.label.trim() !== '' && c.label.trim() !== c.value).map((c) => [c.value, c.label.trim()]));
    if (Object.keys(labels).length > 0 || isMap(f.labels)) as.labels = labels;
    if (d.flow !== null) {
      const held = isMap(f.transitions) ? f.transitions : {};
      as.transitions = Object.fromEntries(
        values.map((v) => {
          const was = isMap(held[v]) ? (held[v] as Record<string, unknown>) : {};
          return [v, { ...was, to: (d.flow![v] ?? []).filter((x) => x !== v && values.includes(x)) }];
        }),
      );
    }
  }
  if (d.kind === 'ref') {
    if (!lists.includes(d.to)) return { ok: false, fix: retypeWords.pickList };
    as.to = d.to;
  }
  if (d.kind === 'duration') as.unit = DURATION_UNITS.find((u) => u === d.unit) ?? 'h';
  if (d.kind === 'quantity' && d.unit.trim() !== '') as.unit = d.unit.trim();
  as.required = d.required;
  return { ok: true, as };
}

/** New choices typed into the box, added after the ones the field keeps and never twice. */
export function withChoices(choices: readonly Choice[], typed: string): Choice[] {
  const out = [...choices];
  for (const v of choicesOf(typed)) if (!out.some((c) => fold(c.value) === fold(v))) out.push({ value: v, label: '' });
  return out;
}

/** The answers the record is sent: `{ to }` carries the typed text, which the record reads as the new type reads it. */
export function answersOf(answers: Readonly<Record<string, RowAnswer>>, plan: Plan): Record<string, unknown> {
  const ids = new Set(plan.failing.map((r) => r.id));
  return Object.fromEntries(
    Object.entries(answers).filter(([id, a]) => ids.has(id) && (typeof a === 'string' || a.to.trim() !== '')).map(([id, a]) => [id, typeof a === 'string' ? a : { to: a.to.trim() }]),
  );
}

/** How many failing rows the answers do not yet cover: the button enables at zero. */
export function unansweredOf(answers: Readonly<Record<string, RowAnswer>>, plan: Plan): number {
  const sent = answersOf(answers, plan);
  return plan.failing.filter((r) => sent[r.id] === undefined).length;
}

/** How many rows pressing rewrites: every row that converts, and every failing row. */
export const rewrites = (plan: Plan): number => plan.converts + plan.failing.length;

/** A stored value as a row shows it in the preview: text as it is, anything else as its JSON. */
export function shown(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(shown).join(', ');
  return JSON.stringify(value);
}

/** The field as the record holds it now, read fresh, or the sentence saying why it could not be read. */
export async function readField(base: string, register: string, field: string, io?: Fetch): Promise<{ ok: true; field: RawField } | { ok: false; fix: string }> {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const read = await client.schema(register);
  if (!read.ok) return { ok: false, fix: 'refusal' in read ? read.refusal.fix : retypeWords.noSchema };
  const body = read.value as { fields?: unknown } | null;
  const f = Array.isArray(body?.fields) ? (body.fields as unknown[]).find((x) => isMap(x) && x.id === field) : undefined;
  if (!isMap(f) || typeof f.type !== 'string') return { ok: false, fix: retypeWords.noSchema };
  return { ok: true, field: f as RawField };
}

/** What changing the field would do over the list's live rows. It writes nothing. */
export async function previewRetype(
  base: string,
  register: string,
  field: string,
  as: Record<string, unknown>,
  io?: Fetch,
): Promise<{ ok: true; plan: Plan } | { ok: false; fix: string }> {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const out = await client.call<Plan>('previewRetype', { register, field, as });
  if (!out.ok) return { ok: false, fix: 'refusal' in out ? out.refusal.fix : retypeWords.changed };
  return { ok: true, plan: out.value };
}

export type Retyped = { from: 'landed'; wrote: number } | { from: 'filed'; id: string } | { from: 'refused'; fix: string };

/**
 * File the change with every row's answer. The record lands an owner's at once and files anybody else's on Decide.
 *
 * THE LIST IS ASKED AGAIN AFTER IT LANDS, as an addition's is, because every reader keeps its own copy of the list and
 * has already answered this tab.
 */
export async function retypeField(
  base: string,
  plan: Plan,
  as: Record<string, unknown>,
  answers: Readonly<Record<string, RowAnswer>>,
  question: string,
  io?: Fetch,
): Promise<Retyped> {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const out = await client.call<{ from?: unknown; suggestion?: unknown; wrote?: unknown }>('retypeField', {
    register: plan.register,
    field: plan.field,
    as,
    answers: answersOf(answers, plan),
    question,
  });
  if (!out.ok) return { from: 'refused', fix: 'refusal' in out ? out.refusal.fix : retypeWords.changed };
  /* THE RAIL'S DECIDE COUNT IS THE KEPT BOOT'S, and the queue moved whoever filed. */
  forget();
  if (out.value?.from !== 'landed') return { from: 'filed', id: String(out.value?.suggestion ?? '') };
  await learn(client.schema, plan.register, new Map());
  return { from: 'landed', wrote: typeof out.value.wrote === 'number' ? out.value.wrote : 0 };
}
