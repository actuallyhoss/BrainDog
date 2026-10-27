/**
 * What a `form` block decides, as functions both drawers call: which fields are shown, which control each is,
 * what is missing, and the typed values a new row is created with.
 *
 * THE FORM IS THE RECORD'S ANSWER, checked by the kernel before it reaches here (`packages/kernel/src/kinds/form.ts`):
 *
 *   { verb: 'row.create', register, fields: [{ id, label, type, required?, options?, show_when? }], submit, after }
 *
 * It rides on the drawn block as `form_spec` (the app's `lib/page/kinds/form.ts` puts it there), because a parsed
 * block's `form` is the word after its kind in the fence and `Block.svelte` writes that word into an attribute. A form
 * is never typed into a fence: it is bound to a list, so it is drawn from a record's answer or not at all.
 *
 * THE ANSWER MAY BE A RECORD ON ANOTHER BUILD, so `readForm` narrows every value before anything is drawn from it: a
 * field with no id or no label is left out, and a form left with no fields is no form.
 *
 * WHAT A PERSON TYPES IS TEXT until the press. `formValues` turns it into what the record stores: money as an integer
 * in minor units beside its currency (`12.50` in GBP is `{ amount: 1250, currency: 'GBP' }`), a day as `YYYY-MM-DD`, a
 * number as a number, a yes or no as a boolean. `formRefusal` says, before anything is sent, the first field that
 * cannot be sent as typed, in a sentence that names the field by its label.
 *
 * Pure: no DOM, no clock.
 */

import { exponentOf } from './format.ts';

/** The field types a form draws. A list's own type, where the form gave none, is read as one of these (`typeOf`). */
export const FORM_TYPES = ['text', 'long', 'number', 'money', 'date', 'choice', 'bool'] as const;

export type FormType = (typeof FORM_TYPES)[number];

export type FormField = {
  id: string;
  label: string;
  type: FormType;
  required?: boolean;
  /** A choice's few, in the order the page wrote them. */
  options?: readonly string[];
  /** Shown only while an earlier field holds `is`. */
  show_when?: { field: string; is: string };
};

export type FormSpec = { verb: string; register: string; fields: readonly FormField[]; submit: string; after: string };

/** An amount as it is typed: the figure's text and the currency's code. */
export type MoneyTyped = { amount: string; currency: string };

/** One field's value as the form holds it: text, a tick, or an amount with its currency. */
export type FormValue = string | boolean | MoneyTyped;

export type FormValues = Readonly<Record<string, FormValue | undefined>>;

/** Which control a field is drawn as. A choice with no options is a text box. */
export type FormControl = 'text' | 'textarea' | 'number' | 'money' | 'date' | 'select' | 'checkbox';

export type PlannedField = { id: string; label: string; type: FormType; control: FormControl; required: boolean; options: readonly string[]; missing: boolean };

export type FormPlan = { fields: PlannedField[]; submit: string; missing: string[] };

/** A refusal about one field, by its id, or about the whole form where `at` names none. */
export type FormRefused = { fix: string; at?: string | undefined };

/** A field id, as the kernel's declarations spell one. It is written into `name`, so it is checked rather than trusted. */
const FIELD = /^[a-z][a-z0-9_]*$/u;

/* A LIST'S OWN TYPE, where the form named none and the record answered the field's: the nearest control a form has. A
   type with no box of its own (a reference, an instant) is typed as text, and the record says what it takes. */
const LIST_TYPES: Readonly<Record<string, FormType>> = Object.freeze({
  day: 'date',
  enum: 'choice',
  int: 'number',
  decimal: 'number',
  pct: 'number',
  boolean: 'bool',
});

const typeOf = (t: unknown): FormType => {
  if (typeof t !== 'string') return 'text';
  if ((FORM_TYPES as readonly string[]).includes(t)) return t as FormType;
  return Object.hasOwn(LIST_TYPES, t) ? LIST_TYPES[t]! : 'text';
};

const words = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** A field as the answer sent it, or null for one that cannot be drawn. */
function fieldOf(v: unknown, earlier: ReadonlySet<string>): FormField | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null;
  const f = v as Record<string, unknown>;
  const id = words(f.id);
  const label = words(f.label);
  if (!FIELD.test(id) || label === '') return null;
  const type = typeOf(f.type);
  const options = Array.isArray(f.options) ? f.options.map(words).filter((o) => o !== '') : [];
  const when = f.show_when !== null && typeof f.show_when === 'object' ? (f.show_when as Record<string, unknown>) : null;
  const on = when ? words(when.field) : '';
  const is = when && (typeof when.is === 'string' || typeof when.is === 'number' || typeof when.is === 'boolean') ? String(when.is) : null;
  return {
    id,
    label,
    type,
    ...(f.required === true ? { required: true } : {}),
    ...(options.length ? { options } : {}),
    /* A CONDITION ON A FIELD THAT IS NOT ABOVE IT is no condition: the kernel refuses one, and a record on another
       build that sent one draws the field rather than a field nobody can ever reach. */
    ...(on !== '' && is !== null && earlier.has(on) ? { show_when: { field: on, is } } : {}),
  };
}

/** The form a record answered, narrowed, or null where it holds no field that can be drawn. */
export function readForm(v: unknown): FormSpec | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null;
  const f = v as Record<string, unknown>;
  const register = words(f.register);
  const submit = words(f.submit);
  const verb = words(f.verb) || 'row.create';
  if (!Array.isArray(f.fields) || (verb === 'row.create' && register === '') || submit === '') return null;
  const seen = new Set<string>();
  const fields: FormField[] = [];
  for (const raw of f.fields) {
    const field = fieldOf(raw, seen);
    if (!field || seen.has(field.id)) continue;
    seen.add(field.id);
    fields.push(field);
  }
  if (fields.length === 0) return null;
  return { verb, register, fields, submit, after: words(f.after) || 'stay' };
}

/** The form a drawn block carries, or null. */
export const formOf = (block: object): FormSpec | null => readForm((block as { form_spec?: unknown }).form_spec);

const control = (f: FormField): FormControl =>
  f.type === 'long' ? 'textarea' : f.type === 'choice' ? (f.options?.length ? 'select' : 'text') : f.type === 'bool' ? 'checkbox' : f.type;

/** A value as `show_when` compares it: a tick as `true` or `false`, an amount as its figure, nothing as empty. */
const said = (v: FormValue | undefined): string =>
  v === undefined ? '' : typeof v === 'boolean' ? String(v) : typeof v === 'string' ? v.trim() : v.amount.trim();

const empty = (f: FormField, v: FormValue | undefined): boolean => f.type !== 'bool' && said(v) === '';

/**
 * The fields shown for `values`, in order, each with its control and whether it is missing.
 *
 * A FIELD SHOWN ONLY WHEN ANOTHER HOLDS A VALUE is hidden while its field is hidden too, so a chain of them folds away
 * from the top. A yes or no is never missing: an unticked box is the answer no.
 */
export function formPlan(form: FormSpec, values: FormValues): FormPlan {
  const shown = new Set<string>();
  const fields: PlannedField[] = [];
  for (const f of form.fields) {
    const when = f.show_when;
    if (when && !(shown.has(when.field) && said(values[when.field]) === when.is)) continue;
    shown.add(f.id);
    const required = f.required === true;
    fields.push({ id: f.id, label: f.label, type: f.type, control: control(f), required, options: f.options ?? [], missing: required && empty(f, values[f.id]) });
  }
  return { fields, submit: form.submit, missing: fields.filter((f) => f.missing).map((f) => f.id) };
}

/* ---- The values a create takes ------------------------------------------------------------------------------ */

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/u;
const CODE = /^[A-Za-z]{3}$/u;
/* A FIGURE AS A PERSON TYPES ONE: a true minus or a hyphen, digits in groups or not, and a point. */
const FIGURE = /^[-−]?(\d+(?:,\d{3})*|\d*)(?:\.(\d+))?$/u;

/** A day that is on the calendar, as `YYYY-MM-DD`, or null. */
function dayOf(text: string): string | null {
  const m = ISO_DAY.exec(text);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) ? text : null;
}

/** A typed number, or null. Commas between groups are read, a stray letter is not. */
function numberOf(text: string): number | null {
  const t = text.replace(/\s/gu, '');
  const m = FIGURE.exec(t);
  if (!m || (m[1] === '' && m[2] === undefined)) return null;
  const n = Number(t.replace(/,/gu, '').replace('−', '-'));
  return Number.isFinite(n) ? n : null;
}

/**
 * An amount in minor units, or why not. EXACT, never through a float: `0.29` in GBP is 29, and a figure with more
 * places than its currency has is refused rather than rounded, since rounding is how a record goes a penny out.
 */
function minorOf(text: string, currency: string): number | 'places' | null {
  const t = text.replace(/\s/gu, '');
  const m = FIGURE.exec(t);
  if (!m || (m[1] === '' && m[2] === undefined)) return null;
  const exp = exponentOf(currency);
  const fraction = m[2] ?? '';
  if (fraction.length > exp) return 'places';
  const minor = BigInt(`${m[1]!.replace(/,/gu, '') || '0'}${fraction.padEnd(exp, '0')}`);
  const n = Number(/^[-−]/u.test(t) ? -minor : minor);
  return Number.isSafeInteger(n) ? n : null;
}

const moneyIn = (v: FormValue | undefined, home: string | null): MoneyTyped =>
  v !== null && typeof v === 'object' ? v : { amount: typeof v === 'string' ? v : '', currency: home ?? '' };

/**
 * The first field of `plan` that cannot be sent as it stands, in a sentence naming it by its label, or null. Missing
 * comes first, in the order the fields are drawn, so the sentence a person reads is about the field they reach first.
 * `home` is the currency an amount typed with none is in.
 */
export function formRefusal(plan: FormPlan, values: FormValues, home: string | null = null): FormRefused | null {
  for (const f of plan.fields) if (f.missing) return { at: f.id, fix: `Fill in ${f.label}.` };
  for (const f of plan.fields) {
    const v = values[f.id];
    if (f.type === 'bool' || said(v) === '') continue;
    const text = said(v);
    if (f.type === 'number' && numberOf(text) === null) return { at: f.id, fix: `${f.label} takes a number, like 12 or 4.5.` };
    if (f.type === 'date' && dayOf(text) === null) return { at: f.id, fix: `${f.label} takes a day on the calendar.` };
    if (f.control === 'select' && !f.options.includes(text)) return { at: f.id, fix: `Pick one of the choices for ${f.label}.` };
    if (f.type === 'money') {
      const { currency } = moneyIn(v, home);
      if (!CODE.test(currency.trim())) return { at: f.id, fix: `${f.label} needs a three-letter currency, like USD.` };
      const code = currency.trim().toUpperCase();
      const minor = minorOf(text, code);
      if (minor === 'places') return { at: f.id, fix: `${f.label} takes at most ${exponentOf(code)} places after the point in ${code}.` };
      if (minor === null) return { at: f.id, fix: `${f.label} takes an amount, like 12.50.` };
    }
  }
  return null;
}

/**
 * The values a new row is created with, by field id: only the fields shown, each typed as the record stores it. A
 * field left empty is left out, so the record keeps its own default; a yes or no is always sent, unticked as `false`.
 * A value `formRefusal` would refuse is left out too: a caller asks that first.
 */
export function formValues(values: FormValues, fields: readonly PlannedField[], home: string | null = null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = values[f.id];
    if (f.type === 'bool') {
      out[f.id] = v === true;
      continue;
    }
    const text = said(v);
    if (text === '') continue;
    if (f.type === 'number') {
      const n = numberOf(text);
      if (n !== null) out[f.id] = n;
    } else if (f.type === 'date') {
      const day = dayOf(text);
      if (day !== null) out[f.id] = day;
    } else if (f.type === 'money') {
      const code = moneyIn(v, home).currency.trim().toUpperCase();
      const minor = CODE.test(code) ? minorOf(text, code) : null;
      if (typeof minor === 'number') out[f.id] = { amount: minor, currency: code };
    } else if (f.control !== 'select' || f.options.includes(text)) out[f.id] = text;
  }
  return out;
}

/* ---- What a refusal says, and where ------------------------------------------------------------------------- */

/**
 * The field a refusal's `at` names, in the spelling a form keys its fields by, or null. The record's row write says the
 * field id, or `amount[2]`, `amount.amount`, `fields.amount` or `<list>.fields.amount`: every one is the field `amount`.
 * The same reading as the app's one-field rule (`apps/web/src/lib/ui/field.ts` `fieldNamed`), which this package
 * cannot import.
 */
export function refusedField(at: string | null | undefined): string | null {
  const where = typeof at === 'string' ? at.trim() : '';
  if (where === '') return null;
  const marker = where.lastIndexOf('fields.');
  const tail = marker === 0 || (marker > 0 && where[marker - 1] === '.') ? where.slice(marker + 'fields.'.length) : where;
  return /^[^.[\]]+/u.exec(tail)?.[0] ?? null;
}

/**
 * Where a refusal is said: under the field it names, when the form draws that field, and otherwise once, above the
 * button. `under` is keyed by field id.
 */
export function refusalPlaced(refusal: FormRefused | null | undefined, plan: FormPlan): { under: Record<string, string>; above: string | null } {
  const fix = refusal && typeof refusal.fix === 'string' ? refusal.fix.trim() : '';
  if (fix === '') return { under: {}, above: null };
  const named = refusedField(refusal?.at);
  return named !== null && plan.fields.some((f) => f.id === named) ? { under: { [named]: fix }, above: null } : { under: {}, above: fix };
}

/* ---- What the string drawer prints -------------------------------------------------------------------------- */

const yesNo = (is: string): string => (is === 'true' ? 'yes' : is === 'false' ? 'no' : is);

/**
 * The form as text, for `toHTML` and every place nothing can be pressed: each field's label, with "required" where it
 * is and the field it waits on where it is shown only sometimes, then the submit's words. Nothing in it is a control.
 */
export function formLines(form: FormSpec): string[] {
  const labelOf = new Map(form.fields.map((f) => [f.id, f.label]));
  const lines = form.fields.map((f) => {
    const when = f.show_when ? `, when ${labelOf.get(f.show_when.field) ?? ''} is ${yesNo(f.show_when.is)}` : '';
    return `${f.label}${f.required ? ' (required)' : ''}${when}`;
  });
  return [...lines, form.submit];
}

/* ---- After the press ---------------------------------------------------------------------------------------- */

/**
 * What the host's `act` answered for a press, narrowed: landed, refused with the record's sentence and the field it
 * names when it names one, or null for a host that answers nothing (the receipt and any refusal are then its own to
 * say, and the form keeps what was typed, since nothing says it landed).
 */
export function formOutcome(out: unknown): { ok: true } | { ok: false; refusal: FormRefused | null } | null {
  if (out === null || typeof out !== 'object' || typeof (out as { ok?: unknown }).ok !== 'boolean') return null;
  const o = out as { ok: boolean; fix?: unknown; at?: unknown };
  if (o.ok) return { ok: true };
  const fix = typeof o.fix === 'string' && o.fix.trim() !== '' ? o.fix.trim() : null;
  return { ok: false, refusal: fix ? { fix, ...(typeof o.at === 'string' ? { at: o.at } : {}) } : null };
}

/**
 * Where a form goes once its row has landed: `stay` clears it and says what was added, by the first words typed into
 * it; a page goes there, record-relative as every address this package draws (`RenderOptions.href` places it).
 */
export function formLanded(form: FormSpec, values: FormValues): { stay: true; said: string } | { stay: false; href: string } {
  if (form.after !== 'stay') return { stay: false, href: `/p/${encodeURIComponent(form.after)}` };
  const named = form.fields.find((f) => (f.type === 'text' || f.type === 'long') && said(values[f.id]) !== '');
  return { stay: true, said: named ? `Added “${said(values[named.id])}”.` : 'Added.' };
}

/**
 * What one press of the submit sends, or the refusal it stops at first: the action the host's `act` takes, a
 * `row.create` worded by the submit and naming the list and the fields drawn, and the typed values of those fields.
 */
export function formPress(
  form: FormSpec,
  values: FormValues,
  home: string | null = null,
): { refused: FormRefused } | { action: { verb: string; label: string; args: { register: string; fields: string[] } }; values: Record<string, unknown> } {
  const plan = formPlan(form, values);
  const refused = formRefusal(plan, values, home);
  if (refused) return { refused };
  return {
    action: { verb: form.verb, label: form.submit, args: { register: form.register, fields: plan.fields.map((f) => f.id) } },
    values: formValues(values, plan.fields, home),
  };
}
