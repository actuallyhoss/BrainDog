/**
 * `form`: a few fields a person fills in and one button that writes them, declared by a page and checked by the record
 * (PGS-A15, `loop/scope/area-pages-a.md`, "generated forms", "by a person, without code").
 *
 * UNTIL THIS KIND EVERY FORM THAT WROTE WAS A SCREEN WRITTEN BY HAND. A row's add form is generated from its list, and
 * `inputs` edits one row, but a page could not say "these four questions, then Add it". A form names its verb, the
 * list it writes into, its fields, the words on its button and where the reader goes after.
 *
 * ONE VERB IN THIS BUILD, `row.create`: a new row in the list `register:` names, its fields the form's. The other verbs
 * the scope names (`question.ask`, `pref.set`, `pack.configure`, `record.configure`) and a field's `repeat:` and
 * `file:` are refused in words that say they are not built yet, so an author hears it at install rather than a reader
 * at the first press.
 *
 * THE LIST IS RIGHT ABOUT ITS FIELDS. At read each field id is checked against the list (`deps.schemaOf`), a field that
 * says no `type:` takes the list's own, and a field that says one is held to it, so a form never offers a number box
 * over a day. A choice's options are the list's values when the form names none, and inside them when it does.
 *
 * A READER WHO MAY NOT WRITE IS NOT SENT THE FORM. The level is the reader's (`PageDeps.level`, absent is `read`), cut
 * by the verb table's own `cutActions`, so a form and a button over the same verb are sent to the same readers. The
 * block comes back not drawn, its why `level`, and carries no fields to draw.
 *
 * A LEAF, for the reason `kinds/index.ts` gives. Its one run-time import from outside this folder is `row-actions.ts`,
 * which is a table and two pure functions that import nothing of the kernel, so loading it here loads no registry.
 */

import type { Refusal } from '@braindog/ports';
import type { FieldSpec } from '@braindog/where';

import type { Why } from '../drawn.ts';
import type { BlockResult, PageDeps } from '../pages.ts';
import { cutActions } from '../row-actions.ts';
import type { KindModule } from './index.ts';
import { invalid } from './listed.ts';

/** The one verb a form writes with in this build. */
export const FORM_VERB = 'row.create';

/** What a field of a form may be. */
export const FORM_TYPES = ['text', 'long', 'number', 'money', 'date', 'choice', 'bool'] as const;
export type FormType = (typeof FORM_TYPES)[number];

/** How many fields a form holds, fewest and most: past twelve it is two forms. */
export const FIELDS_MOST = 12;
/** A field's label and the button's words, in bytes: what a narrow screen holds on one line. */
export const LABEL_MOST = 40;
/** The most options a choice offers: past twenty it is a search, not a choice. */
export const OPTIONS_MOST = 20;

/**
 * The keys one field may carry, and the two the scope names that are later.
 *
 * WRITTEN AS AN OBJECT'S KEYS AND NOT AS STRINGS, and each read back by its name (`KEY.options`), because `core-names`
 * reads the core's strings for the names add-ons declare and one add-on declares a field called `options`. These are
 * the form's own grammar and branch on nobody's list: a kernel identifier names nothing of anybody's, as the gate says.
 */
const FIELD_SHAPE = { id: 0, label: 0, type: 0, required: 0, options: 0, show_when: 0 } as const;
type FieldKey = keyof typeof FIELD_SHAPE;
const KEY = Object.fromEntries(Object.keys(FIELD_SHAPE).map((k) => [k, k])) as { readonly [K in FieldKey]: K };
const FIELD_KEYS: ReadonlySet<string> = new Set(Object.keys(FIELD_SHAPE));
const LATER_KEYS: readonly string[] = ['repeat', 'file'];

/**
 * The keys every block may carry that a form does nothing with. A form reads no row, so a source, columns or a
 * sentence over rows would install and be read by nothing; `where:` included, since a form fills its row from its
 * fields and not from equalities, as a `capture` does.
 */
const UNREAD_HERE = ['source', 'columns', 'cells', 'order', 'limit', 'authored', 'where', 'inherit', 'working', 'opening', 'from', 'horizon', 'target'] as const;

/** A verb as the record names one: a thing and what is done to it, such as `row.create`. */
const VERB = /^[a-z][a-z_]{0,31}\.[a-z][a-z_]{0,31}$/u;

/** A field id or a list id as a page writes one; a page id the same. */
const ID = /^[a-z][a-z0-9_-]{0,63}$/u;

/** One field as the read sends it: its type always said, the list's own where the form gave none. */
export type FormField = {
  id: string;
  label: string;
  type: FormType;
  required: boolean;
  options?: string[];
  show_when?: { field: string; is: string | number | boolean };
};

/** The form as the read sends it. */
export type FormRead = { verb: typeof FORM_VERB; register: string; fields: FormField[]; submit: string; after: string };

/** A form block's answer: the block, and its form where the reader may write. */
export type FormAnswer = BlockResult & { form?: FormRead };

/** The block is not drawn because the reader's level does not reach the verb (`drawn.ts` `Why`). */
const LEVEL: Why = 'level';

const bytes = (s: string): number => new TextEncoder().encode(s).length;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isIs = (v: unknown): v is string | number | boolean => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
const notBuilt = (fix: string, at: string, allowed?: readonly string[]): Refusal => ({
  code: 'NOT_IN_THIS_BUILD',
  fix,
  at,
  ...(allowed === undefined ? {} : { allowed }),
});

/**
 * The form type a field of the list is written with, or `null` for one a form does not write yet: a file, a secret, a
 * list of values or a document of JSON each need a control of their own, and a quantity a unit beside its number.
 */
export function formTypeOf(spec: FieldSpec): FormType | null {
  switch (spec.type) {
    case 'text':
    case 'url':
    case 'email':
    case 'ref':
      return 'text';
    case 'document':
      return 'long';
    case 'int':
    case 'decimal':
    case 'duration':
      return 'number';
    case 'money':
      return 'money';
    case 'day':
    case 'instant':
      return 'date';
    case 'enum':
      return 'choice';
    case 'bool':
      return 'bool';
    default:
      return null;
  }
}

/** The types a form may say over a field of the list: its own, and a short or a long box over words either way. */
const sayable = (own: FormType, spec: FieldSpec): readonly FormType[] =>
  own === 'text' && spec.type !== 'ref' ? ['text', 'long'] : own === 'long' ? ['long', 'text'] : [own];

/**
 * What is wrong with one field, or `null`. `earlier` is the ids of the fields before it, which is all a `show_when:`
 * may name: a field shown by one below it would appear above the answer that shows it.
 */
function fieldFault(raw: unknown, i: number, earlier: ReadonlySet<string>): Refusal | null {
  const at = `fields[${i}]`;
  if (!isRecord(raw)) return invalid(`${at} is a field: { id, label }, and a type when the list's own will not do.`, at);
  const named = typeof raw.label === 'string' && raw.label.trim() ? `${at} (${raw.label.trim()})` : at;
  for (const later of LATER_KEYS)
    if (raw[later] !== undefined)
      return notBuilt(`${named} has ${later}:, which a form does not take yet. Take it off, and ask for it as its own field of the list.`, `${at}.${later}`);
  const stray = Object.keys(raw).find((k) => !FIELD_KEYS.has(k));
  if (stray !== undefined) return invalid(`${named} has ${stray}:, which a form's field does not read. Take it off.`, `${at}.${stray}`, [...FIELD_KEYS]);
  if (typeof raw.id !== 'string' || !ID.test(raw.id))
    return invalid(`${named}'s id is the field of the list it fills in, such as id: what.`, `${at}.id`);
  if (earlier.has(raw.id)) return invalid(`${named} fills in ${raw.id}, and a field above it already does. Each field of a form fills in a different one.`, `${at}.id`);
  const label = typeof raw.label === 'string' ? raw.label.trim() : '';
  if (!label || bytes(label) > LABEL_MOST)
    return invalid(`${named}'s label is the question a person reads above the box, 1 to ${LABEL_MOST} bytes. Write a short one, such as "What is it?".`, `${at}.label`);
  if (raw.type !== undefined && !(FORM_TYPES as readonly unknown[]).includes(raw.type))
    return invalid(`${named}'s type is ${JSON.stringify(raw.type)}, and a form's field is one of ${FORM_TYPES.join(', ')}. Or leave it off, and the list's own is used.`, `${at}.type`, FORM_TYPES);
  if (raw.required !== undefined && typeof raw.required !== 'boolean') return invalid(`${named}'s required is true or false.`, `${at}.required`, ['true', 'false']);
  if (raw.options !== undefined) {
    if (raw.type !== undefined && raw.type !== 'choice') return invalid(`${named} offers options:, which only a choice does. Make its type choice, or take the options off.`, `${at}.${KEY.options}`);
    const options = raw.options;
    if (!Array.isArray(options) || options.length === 0 || !options.every((o) => typeof o === 'string' && o.trim() !== ''))
      return invalid(`${named}'s options are the words a person picks from, such as options: [small, large].`, `${at}.${KEY.options}`);
    if (options.length > OPTIONS_MOST)
      return invalid(`${named} offers ${options.length} options, and a choice offers at most ${OPTIONS_MOST}. Keep the ones picked most.`, `${at}.${KEY.options}`);
    if (new Set(options).size !== options.length) return invalid(`${named} offers one option twice. Take the second off.`, `${at}.${KEY.options}`);
  }
  if (raw.show_when !== undefined) {
    const when = raw.show_when;
    if (!isRecord(when) || typeof when.field !== 'string' || !isIs(when.is) || Object.keys(when).some((k) => k !== 'field' && k !== 'is'))
      return invalid(`${named}'s show_when names a field above it and the answer that shows this one, such as show_when: { field: kind, is: other }.`, `${at}.show_when`);
    if (!earlier.has(when.field))
      return invalid(
        `${named} is shown when ${when.field} is ${String(when.is)}, and no field above it fills in ${when.field}. A field is shown by an answer above it, so move it below, or name one of those listed with this refusal.`,
        `${at}.show_when.field`,
        [...earlier],
      );
  }
  return null;
}

/**
 * What is wrong with the form, or `null`. At install a key left off is not refused, as every kind installs bare
 * (`listed.ts` `listedFault` says why); at read a form that names no verb, list, field or button cannot be drawn.
 */
function formFault(block: Readonly<Record<string, unknown>>, stage: 'install' | 'read'): Refusal | null {
  for (const key of UNREAD_HERE)
    if (Object.hasOwn(block, key) && block[key] !== undefined)
      return invalid(`A form writes into register: and reads nothing, so it does nothing with ${key}:. Take it off.`, key);
  if (stage === 'read')
    for (const [key, said] of [
      ['verb', `verb: ${FORM_VERB}`],
      ['register', 'register: and the list it adds to'],
      ['fields', 'fields: and what each asks'],
      ['submit', 'submit: and the words on its button'],
    ] as const)
      if (block[key] === undefined) return invalid(`A form says what it writes and how, and this one has no ${key}:. Write ${said}.`, key);
  const verb = block.verb;
  /* ANY OTHER VERB IS LATER, said in the record's code for a thing not built yet, and the one verb there is offered. A
     value that is no verb at all is told so, since "not built yet" would promise it. */
  if (verb !== undefined && verb !== FORM_VERB)
    return typeof verb === 'string' && VERB.test(verb)
      ? notBuilt(`A form over ${verb} is not built yet. A form writes a new row of a list today, with verb: ${FORM_VERB}.`, 'verb', [FORM_VERB])
      : invalid(`A form's verb is what its button does, and ${JSON.stringify(verb)} is not a verb. Write verb: ${FORM_VERB}.`, 'verb', [FORM_VERB]);
  if (block.register !== undefined && (typeof block.register !== 'string' || !ID.test(block.register)))
    return invalid(`A form's register is the list it adds a row to, by its id, such as register: tasks.`, 'register');
  if (block.fields !== undefined) {
    const fields = block.fields;
    if (!Array.isArray(fields) || fields.length === 0) return invalid('A form asks at least one thing: fields: [{ id: what, label: What is it? }].', 'fields');
    if (fields.length > FIELDS_MOST)
      return invalid(`A form holds ${fields.length} fields, and one holds at most ${FIELDS_MOST}. Keep the ones a person must answer, or make it two forms.`, 'fields');
    const earlier = new Set<string>();
    for (const [i, raw] of fields.entries()) {
      const fault = fieldFault(raw, i, earlier);
      if (fault) return fault;
      earlier.add((raw as { id: string }).id);
    }
  }
  if (block.submit !== undefined) {
    const submit = typeof block.submit === 'string' ? block.submit.trim() : '';
    if (!submit || bytes(submit) > LABEL_MOST)
      return invalid(`A form's submit is the words on its button, 1 to ${LABEL_MOST} bytes, and this one is ${submit ? `${bytes(submit)}` : 'empty'}. Write a short one, such as "Add it".`, 'submit');
  }
  const after = block.after;
  if (after !== undefined && after !== 'stay' && !(typeof after === 'string' && ID.test(after)))
    return invalid(`A form's after is stay, to stay on the page, or the id of the page the reader goes to, such as after: tasks.`, 'after');
  return null;
}

/** The form read against its list, or the refusal that names the field and the fix. */
function readForm(deps: PageDeps, block: Readonly<Record<string, unknown>>): FormRead | Refusal {
  const register = block.register as string;
  const schema = deps.schemaOf(register);
  if (!schema) return { code: 'SOURCE_UNKNOWN', fix: `A form adds a row to ${register}, and this record holds no list called ${register}.`, at: 'register' };
  const fields: FormField[] = [];
  for (const [i, raw] of (block.fields as Record<string, unknown>[]).entries()) {
    const at = `fields[${i}]`;
    const id = raw.id as string;
    const label = (raw.label as string).trim();
    const spec = Object.hasOwn(schema.fields, id) ? schema.fields[id] : undefined;
    if (!spec)
      return { code: 'FIELD_UNKNOWN', fix: `${at} (${label}) fills in ${id}, and ${register} has no field called ${id}. Pick one listed with this refusal.`, at: `${at}.id`, allowed: Object.keys(schema.fields) };
    const own = formTypeOf(spec);
    if (own === null) return notBuilt(`${at} (${label}) fills in ${id}, which is ${spec.type}, and a form does not write a ${spec.type} yet. Take the field off.`, `${at}.id`);
    const said = raw.type as FormType | undefined;
    const may = sayable(own, spec);
    if (said !== undefined && !may.includes(said))
      return invalid(`${at} (${label}) is ${said}, and ${register}'s ${id} is ${spec.type}, so it is asked as ${may.join(' or ')}. Take the type off, and the list's own is used.`, `${at}.type`, may);
    const type = said ?? own;
    const field: FormField = { id, label, type, required: raw.required === true };
    if (type === 'choice') {
      const values = [...(spec.values ?? [])];
      const options = raw.options === undefined ? values : (raw.options as string[]);
      const outside = options.filter((o) => !values.includes(o));
      if (outside.length)
        return invalid(`${at} (${label}) offers ${outside.join(', ')}, which ${register}'s ${id} does not hold. Offer only its own, listed with this refusal.`, `${at}.${KEY.options}`, values);
      if (options.length === 0) return invalid(`${at} (${label}) is a choice, and ${register}'s ${id} holds no values to pick from.`, `${at}.${KEY.options}`);
      field.options = options;
    }
    if (isRecord(raw.show_when)) field.show_when = { field: raw.show_when.field as string, is: raw.show_when.is as string | number | boolean };
    fields.push(field);
  }
  const after = typeof block.after === 'string' ? block.after : 'stay';
  if (after !== 'stay' && !deps.pages().some((p) => p.page === after))
    return invalid(`A form's after is the page the reader goes to, and this record has no page called ${after}. Write stay, or a page it has.`, 'after');
  return { verb: FORM_VERB, register, fields, submit: (block.submit as string).trim(), after };
}

export const form: KindModule = {
  /* SHARED: `register` is the list a `capture` adds to and an `inputs` block edits (`block-keys.ts` `KEY_KINDS`), and a
     form names the list it adds to by the same key. */
  keys: ['verb', 'register', 'fields', 'submit', 'after'],

  validate(block, ctx) {
    return formFault(block, ctx.stage);
  },

  read(deps, block, base) {
    /* THE LEVEL FIRST, BEFORE THE LIST IS ASKED, so a reader who may not write is told nothing of its fields, not even
       which of them the list lacks. `cutActions` drops a verb the host does not run as well, and either way there is
       nothing this reader could press. */
    const raw = block as unknown as Readonly<Record<string, unknown>>;
    const submit = typeof raw.submit === 'string' ? raw.submit.trim() : FORM_VERB;
    if (cutActions([{ verb: FORM_VERB, label: submit }], deps.level ?? 'read', deps.runs).length === 0) return { ...base, drawn: false, why: LEVEL };
    const read = readForm(deps, raw);
    if ('code' in read) return { ...base, refusals: [...base.refusals, read] };
    const answer: FormAnswer = { ...base, form: read };
    return answer;
  },
};
