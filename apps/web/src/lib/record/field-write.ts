/**
 * Adding one field to a live list from the app: the body the record is sent, and the one or two calls that send it.
 *
 * THE METADATA HALF: a field on a thing is not a column the core declares for everyone. A person adds a
 * project's domain at run time, and every row of the list has it from then on. Nothing in this build names the field.
 *
 * AN ADDITION AND NEVER A WHOLE LIST. The record takes a field-level change, `to: { add: { register, fields } }`, which
 * it merges onto the list AS IT IS WHEN THE CHANGE IS ACCEPTED (`packages/kernel/src/govern.ts` `addTo`). A whole body
 * built here would be built from this tab's copy of the list, and that copy is the relabelled, `declOf`-filled one the
 * screens draw from: sent back through `setDeclaration`, it would write the record's display labels into the
 * declaration, and with no version to hold it to (`schema` answers none) it would drop any field somebody else added
 * after this tab read the list. `packages/record/test/schema-add.test.ts` B1 measured exactly that loss on the record's
 * own accept path. So an owner files the addition and accepts it in the next call, which lands through the same lint
 * `setDeclaration` runs, leaves the change in the list's history like any other, and cannot race.
 *
 * ANYBODY ELSE FILES IT AND STOPS THERE. The question lands on Decide, which is how every other change reaches an owner.
 * A member who may decide questions could accept their own here too; that is not done, because a field on everybody's
 * rows is the owner's call and the record's decide gate does not say so for a `change`.
 *
 * EACH KIND WITH THE ONE MORE THING IT NEEDS. Measured by filing `{ id, label, type }` for each of `schema.ts`'s fifteen
 * against a real kernel: `enum` is refused (no values) and `list` is refused (no element type). `ref` with no `to` and
 * `money` with no currency were both ACCEPTED, which is worse: a link to no list, and an amount nobody said the
 * currency of. So a choice is sent with its values, a link with the list it points at (picked from the record's own,
 * never typed), money only once the record has a currency of its own, and `list` is always a list of text; `fieldOf` refuses each missing piece in
 * one sentence before anything is sent, and the record is to refuse the same at lint. `secret` is never
 * a field on a row. `instant` and `duration` are left for the Fields sheet, which asks more: its kinds are
 * `SHEET_KINDS` below, and `drafted` asks each the one more thing it needs by the same rules.
 */

import { createClient } from '@braindog/client';

import { valueSaid } from '../voice.ts';
import { homeCurrency, labelOf } from './api.ts';
import { forget, type Fetch } from './boot-live.ts';
import { REGISTERS } from './held.ts';
import { fieldWords, sheetWords } from './field-words.ts';
import { learn } from './remote.ts';
import { inverseOf } from './rows-write.ts';
import type { FieldType, Fields, RegisterDecl } from './schema.ts';

export const ADDABLE = [
  'text',
  'document',
  'enum',
  'ref',
  'money',
  'list',
  'day',
  'int',
  'decimal',
  'bool',
  'url',
  'email',
] as const satisfies readonly FieldType[];
export type Addable = (typeof ADDABLE)[number];

/**
 * One field somebody asked for: the id the record keeps, the name they typed, its kind, and the one more thing the kind
 * needs. `to` is the list a link points at; `values` a choice's choices, cut and said once each; `currency` money's,
 * `'record'` for the record's own, the only one a new field takes until the kernel says a field's currency. A `list` is a list of text, which is all this form offers.
 */
export type NewField = { id: string; label: string; type: Addable; to?: string; values?: string[]; currency?: string };

/** The one more thing as typed or picked: the choices one a line, the list picked, the currency picked. */
export type FieldMore = { to?: string; values?: string; currency?: string };

/* THE CAPS ON A CHOICE, said in `fieldWords`: a choice of one is a fact and not a choice, and past forty nobody picks. */
export const CHOICES_MIN = 2;
export const CHOICES_MAX = 40;
export const CHOICE_CHARS = 40;

/* THE CURRENCIES THE RUNTIME KNOWS, as the kernel's `coerce.ts` reads them, so the form and the record agree. */
const TENDER: ReadonlySet<string> = new Set(Intl.supportedValuesOf('currency'));

/**
 * The lists a link may point at: every list the record holds, less the kernel's own machinery, as `list-write.ts`
 * `offered` reads them (not imported, because that module imports this one). Names for the picker, ids for the body.
 */
export function linkable(): { id: string; name: string }[] {
  return Object.values(REGISTERS)
    .filter((d) => !(d.seq_prefix !== undefined && !d.holds))
    .map((d) => ({ id: d.id, name: d.name }));
}

/**
 * The choices typed, cut and said once each, or the sentence saying why they are not a choice yet.
 *
 * CUT AND DE-DUPLICATED, NOT REFUSED FOR IT. Each line is trimmed and its spaces closed up, an empty one is dropped,
 * and a second spelling of one already typed ("won" under "Won") is dropped with the first kept, because both mean the
 * one choice and the person typing meant it once. What is still short, long or too many is refused in one sentence.
 */
export function choicesSaid(typed: string): { ok: true; values: string[] } | { ok: false; fix: string } {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const v of choicesOf(typed)) {
    if (seen.has(fold(v))) continue;
    seen.add(fold(v));
    values.push(v);
  }
  if (values.length < CHOICES_MIN) return { ok: false, fix: fieldWords.fewChoices };
  if (values.length > CHOICES_MAX) return { ok: false, fix: fieldWords.manyChoices };
  const long = values.find((v) => [...v].length > CHOICE_CHARS);
  if (long !== undefined) return { ok: false, fix: fieldWords.longChoice(long) };
  return { ok: true, values };
}

/**
 * The currency money is kept in, or the sentence saying why it is not one: `'record'`, the record's own, picked by that
 * word or by its code. `home` is the record's own (`homeCurrency()`).
 *
 * ONLY THE RECORD'S OWN, UNTIL THE KERNEL TAKES A FIELD'S CURRENCY (`FIELD_KEYS` has no `currency`). The
 * one other place a field says a currency is its default, and a default is written into every row made after it: a
 * Fee declared as nought in yen read 0 JPY on each new project, a figure nobody typed. So another code is refused in
 * one sentence rather than sent that way, and a code the runtime does not know is refused as not a currency.
 */
export function currencySaid(picked: string | undefined, home: string | null): { ok: true; currency: 'record' } | { ok: false; fix: string } {
  const c = (picked ?? '').trim();
  if (c === '') return { ok: false, fix: fieldWords.pickCurrency };
  if (c !== 'record' && !TENDER.has(c.toUpperCase())) return { ok: false, fix: fieldWords.currencyUnknown(c) };
  if (home === null) return { ok: false, fix: fieldWords.noHome };
  return c === 'record' || c.toUpperCase() === home.toUpperCase() ? { ok: true, currency: 'record' } : { ok: false, fix: fieldWords.otherCurrency(home) };
}

/**
 * The declaration body a field is sent as: the id, the name and the kernel's type, and what that type needs.
 *
 * MONEY CARRIES NO KEY AND NO DEFAULT: it is in the record's own currency (`currencySaid`), which every money box falls
 * back to (`money-typed.ts`), and a default would put an amount into every new row.
 */
export function bodyOf(field: NewField): FieldBody {
  const base = { id: field.id, label: field.label };
  if (field.type === 'enum') return { ...base, type: 'enum', values: [...(field.values ?? [])] };
  if (field.type === 'ref') return { ...base, type: 'ref', to: field.to ?? '' };
  if (field.type === 'list') return { ...base, type: 'list', of: 'text' };
  return { ...base, type: field.type };
}

/* THE KERNEL'S OWN IDENT (`packages/kernel/src/declare.ts`): a letter first, 32 at most, and no doubled underscore. */
const IDENT = /^(?!.*__)[a-z][a-z0-9_]{0,31}$/u;

/**
 * The id a typed name is kept under: `Next review` is `next_review`.
 *
 * A NAME WITH NO LATIN LETTER IN IT HAS NO ID, and `null` says so rather than inventing `field_1`, which is a column
 * nobody would recognise in a filter or an agent's call. The name itself is kept whole as the label.
 */
export function idOf(label: string): string | null {
  const id = label
    .normalize('NFKD')
    /* THE ACCENTS NFKD SPLITS OFF GO BEFORE ANYTHING ELSE, or the next line reads each one as a gap between words. */
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '_')
    .replace(/^_+|_+$/gu, '')
    .slice(0, 32)
    .replace(/_+$/u, '');
  return IDENT.test(id) ? id : null;
}

/**
 * The field a press asks for, or the sentence saying why it is not one.
 *
 * A FIELD THE LIST ALREADY HAS IS REFUSED HERE, retired ones included, because the record refuses it too and a
 * sentence under the box beats a round trip. It compares ids, so `Web site` over a list holding `web_site` is caught.
 *
 * THE ONE MORE THING IS ASKED OF THE KINDS THAT NEED IT, each missing piece refused in one sentence the form draws at
 * that piece: the list a link points at must be one the record holds (`linkable`), a choice needs two to forty
 * choices, and money the record's own currency (`currencySaid`). A piece given for a kind that does not take it is left off.
 */
export function fieldOf(
  register: string,
  label: string,
  type: string,
  more: FieldMore = {},
  home: string | null = homeCurrency(),
): { ok: true; field: NewField } | { ok: false; fix: string } {
  const named = label.trim();
  if (named === '') return { ok: false, fix: fieldWords.noName };
  if (!(ADDABLE as readonly string[]).includes(type)) return { ok: false, fix: fieldWords.kindUnknown };
  const id = idOf(named);
  if (id === null) return { ok: false, fix: fieldWords.badName };
  if (RESERVED.has(id)) return { ok: false, fix: fieldWords.reserved(named) };
  const decl = REGISTERS[register];
  if (decl?.fields.some((f) => f.id === id)) return { ok: false, fix: fieldWords.taken(named, decl.name) };
  const field: NewField = { id, label: named, type: type as Addable };
  if (type === 'ref') {
    const to = (more.to ?? '').trim();
    const lists = linkable();
    if (to === '') return { ok: false, fix: lists.length === 0 ? sheetWords.noLists : fieldWords.pickLink };
    if (!lists.some((l) => l.id === to)) return { ok: false, fix: fieldWords.linkGone };
    return { ok: true, field: { ...field, to } };
  }
  if (type === 'enum') {
    const said = choicesSaid(more.values ?? '');
    return said.ok ? { ok: true, field: { ...field, values: said.values } } : said;
  }
  if (type === 'money') {
    const said = currencySaid(more.currency, home);
    return said.ok ? { ok: true, field: { ...field, currency: said.currency } } : said;
  }
  return { ok: true, field };
}

/** The change `propose` files: filed under the list it adds to, and adding this one field and nothing else. */
export const additionOf = (register: string, field: NewField) => ({
  declaration_id: `register.${register}`,
  to: { add: { register, fields: [bodyOf(field)] } },
});

export type Added =
  /** On the list now; `REGISTERS` has been asked again, so every screen drawn after this has the field. */
  | { from: 'added' }
  /** On Decide, waiting on an owner. `fix` is set when an owner's own accept did not land, and says why. */
  | { from: 'filed'; id: string; fix?: string }
  | { from: 'refused'; fix: string };

/**
 * File one field, and accept it at once when the person filing owns the record.
 *
 * THE LIST IS ASKED AGAIN AFTER IT LANDS, with a fresh `asked`, because the readers each keep their own and have
 * already answered this list for this tab: without it the field was on the record and on no screen until a reload.
 */
export async function addField(base: string, register: string, field: NewField, owner: boolean, io?: Fetch): Promise<Added> {
  const list = REGISTERS[register]?.name ?? register;
  return fileAddition(base, register, fieldWords.question(field.label, list), additionOf(register, field), owner, io);
}

/**
 * The one path every addition to a list takes from the app: filed, then accepted at once when the person owns the
 * record. A field and a value go the same way because the record reads them as one kind of change (`govern.ts`
 * `addTo`), and two copies of the accept would be two places for the list's re-read to be forgotten.
 */
function fileAddition(base: string, register: string, question: string, body: object, owner: boolean, io?: Fetch): Promise<Added> {
  return fileChange(base, register, question, body, owner, fieldWords.reason, io);
}

/**
 * Any change to one list, filed and, for the owner, accepted at once with `reason` as the answer's words.
 *
 * EXPORTED FOR THE FIELDS SHEET AND FOR A NEW LIST (`list-write.ts`), which land the same way an addition does: a rename
 * and a whole new list are not additions, so a member's waits on Decide, and the owner's is his own answer given in the
 * next call. `register` is the list to read again once it lands, which for a new list is the list just made.
 */
export async function fileChange(base: string, register: string, question: string, body: object, owner: boolean, reason: string, io?: Fetch): Promise<Added> {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const filed = await client.call<{ id?: unknown }>('propose', { question, body_kind: 'change', body });
  if (!filed.ok) {
    if ('refusal' in filed) return { from: 'refused', fix: filed.refusal.fix };
    return { from: 'refused', fix: fieldWords.changed };
  }
  const id = String(filed.value?.id ?? '');
  /* THE RAIL'S DECIDE COUNT IS THE KEPT BOOT'S, and it is one higher now whoever filed. */
  forget();
  if (!owner) return { from: 'filed', id };

  const accepted = await client.call('decide', { id, decide: { option: 'accept', reason } });
  if (!accepted.ok) return { from: 'filed', id, ...('refusal' in accepted ? { fix: accepted.refusal.fix } : {}) };
  forget();
  await learn(client.schema, register, new Map());
  return { from: 'added' };
}

/* ── every kind, from the Fields sheet ── */

/**
 * The kinds the Fields sheet offers, in the order it offers them.
 *
 * EACH ONE INSTALLS BECAUSE THE SHEET ASKS WHAT IT NEEDS, which is the gap `ADDABLE` above stops at: a choice list is
 * sent with its values, a link with the list it points at, and a duration with the unit it is said in. `tags` is not a
 * kernel type but a list whose every value is text (`{ type: 'list', of: 'text' }`), named for what a person picks.
 * `quantity` is the kernel's (`coerce.ts`) and not in the app's `FieldType`, which is why a field here is typed by
 * string: its value carries its own unit, so the field's `unit` is only the one a new value starts in. Money is offered
 * with no currency for the same reason, each amount the record holds carrying its own, unless the sheet asks one
 * (`FieldAsk.currency`, held by `currencySaid` to the record's own, as the row page's form is). `secret`, `file` and `json` are
 * never offered, because a secret is never a field on a row and nobody types the other two.
 */
export const SHEET_KINDS = [
  'text',
  'document',
  'enum',
  'ref',
  'money',
  'tags',
  'int',
  'decimal',
  'quantity',
  'duration',
  'day',
  'instant',
  'bool',
  'url',
  'email',
] as const;
export type SheetKind = (typeof SHEET_KINDS)[number];

/** The units a duration is said in, as `api.ts` `SECONDS` reads them. The record keeps seconds whichever is picked. */
export const DURATION_UNITS = ['m', 'h', 'd'] as const;
export type DurationUnit = (typeof DURATION_UNITS)[number];

/** What the sheet asks for one field, as typed: a name and a kind, and the one more thing some kinds need. */
export type FieldAsk = { label: string; kind: string; values?: string; to?: string; unit?: string; currency?: string };

/** One field as the record is sent it: the id it keeps, the name typed, the kernel's type and what that type needs. */
export type FieldBody = { id: string; label: string; type: string; of?: string; values?: string[]; to?: string; unit?: string };

/* THE KERNEL'S `RESERVED_FIELD_IDS` (`packages/kernel/src/declare.ts`). A field under one of these is refused at install,
   and `Title` is the name a person is likeliest to type for a list's first field, so it is said here before the trip. */
const RESERVED = new Set(['id', 'seq', 'register', 'created_at', 'updated_at', 'deleted_at', 'version', 'spoken', 'title']);

/** The choices typed into the box: one per line or per comma, each trimmed, empty ones dropped. */
export const choicesOf = (typed: string): string[] =>
  typed
    .split(/[\n,]/u)
    .map((v) => v.trim().replace(/\s+/gu, ' '))
    .filter((v) => v !== '');

type Drafted = { ok: true; field: FieldBody } | { ok: false; fix: string };

/**
 * The field the sheet's form asks for, or the sentence saying why it is not one yet.
 *
 * `held` IS WHAT THE NAME MAY NOT COLLIDE WITH: a live list's fields, retired ones included, or the fields a new list has
 * been given so far. `lists` is the ids a link may point at. Neither is read from `REGISTERS` here, so the same check
 * serves a list that does not exist yet (`list-write.ts`).
 */
export function drafted(ask: FieldAsk, held: readonly { id: string }[], list: string, lists: readonly string[], home: string | null = homeCurrency()): Drafted {
  const no = (fix: string): Drafted => ({ ok: false, fix });
  const named = ask.label.trim();
  if (named === '') return no(fieldWords.noName);
  if (!(SHEET_KINDS as readonly string[]).includes(ask.kind)) return no(fieldWords.kindUnknown);
  const id = idOf(named);
  if (id === null) return no(fieldWords.badName);
  if (RESERVED.has(id)) return no(fieldWords.reserved(named));
  if (held.some((f) => f.id === id)) return no(fieldWords.taken(named, list));
  const base = { id, label: named };
  const kind = ask.kind as SheetKind;
  if (kind === 'enum') {
    /* THE SAME RULES AS THE ROW PAGE'S FORM (`choicesSaid`): two to forty, each said once, so the two cannot disagree. */
    const said = choicesSaid(ask.values ?? '');
    return said.ok ? { ok: true, field: { ...base, type: 'enum', values: said.values } } : said;
  }
  /* MONEY WITH NO CURRENCY ASKED IS SENT AS IT WAS, each amount carrying its own; one picked is held to the same rule. */
  if (kind === 'money' && ask.currency !== undefined) {
    const said = currencySaid(ask.currency, home);
    if (!said.ok) return said;
  }
  if (kind === 'ref') {
    const to = ask.to ?? '';
    if (!lists.includes(to)) return no(lists.length === 0 ? sheetWords.noLists : sheetWords.pickList);
    return { ok: true, field: { ...base, type: 'ref', to } };
  }
  if (kind === 'tags') return { ok: true, field: { ...base, type: 'list', of: 'text' } };
  if (kind === 'duration') {
    const unit = DURATION_UNITS.find((u) => u === ask.unit) ?? 'h';
    return { ok: true, field: { ...base, type: 'duration', unit } };
  }
  if (kind === 'quantity') {
    const unit = (ask.unit ?? '').trim();
    return { ok: true, field: { ...base, type: 'quantity', ...(unit === '' ? {} : { unit }) } };
  }
  return { ok: true, field: { ...base, type: kind } };
}

/** The change `propose` files for a drafted field: an addition like `additionOf`'s, carrying what its kind needs. */
export const draftAdditionOf = (register: string, field: FieldBody) => ({
  declaration_id: `register.${register}`,
  to: { add: { register, fields: [field] } },
});

/** File a drafted field, and accept it at once when the person filing owns the record. */
export async function addDrafted(base: string, register: string, field: FieldBody, owner: boolean, io?: Fetch): Promise<Added> {
  const list = REGISTERS[register]?.name ?? register;
  return fileChange(base, register, fieldWords.question(field.label, list), draftAdditionOf(register, field), owner, sheetWords.addReason, io);
}

/**
 * The name a rename asks for, or the sentence saying why not.
 *
 * ONLY THE LABEL MOVES. The id the rows are kept under stays, so every filter, saved view and agent's call that named the
 * field still does; a person reads the new name everywhere the label is drawn.
 */
export function renameOf(register: string, field: string, typed: string): { ok: true; label: string } | { ok: false; fix: string } {
  const label = typed.trim().replace(/\s+/gu, ' ');
  if (label === '') return { ok: false, fix: fieldWords.noName };
  const fields = REGISTERS[register]?.fields ?? [];
  const f = fields.find((x) => x.id === field);
  if (f && labelOf(f) === label) return { ok: false, fix: sheetWords.sameName };
  if (fields.some((x) => x.id !== field && x.retired !== true && fold(labelOf(x)) === fold(label))) return { ok: false, fix: sheetWords.nameTaken(label) };
  return { ok: true, label };
}

/**
 * Rename one field's label, filed as a change to the whole list and accepted at once when the person owns the record.
 *
 * READ FRESH FROM THE RECORD, NEVER FROM THIS TAB'S COPY. There is no field-level rename in the kernel (`addTo` only adds
 * and `retireIn` only retires), so a rename is the whole list with one label changed. `field-write.ts` says why a whole
 * body built from `REGISTERS` is wrong: it is the relabelled copy, and it would write display labels into the declaration.
 * `schema` answers the record's own body, and the change is stamped with the version live when it is filed
 * (`govern.ts`, `from_version`), so a field somebody adds between the read and the owner's answer is a clash he sees
 * rather than a field this quietly drops.
 */
export async function renameField(base: string, register: string, field: string, label: string, owner: boolean, io?: Fetch): Promise<Added> {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const read = await client.schema(register);
  if (!read.ok) return { from: 'refused', fix: 'refusal' in read ? read.refusal.fix : sheetWords.noSchema };
  const body = read.value as { fields?: unknown } | null;
  if (!body || !Array.isArray(body.fields)) return { from: 'refused', fix: sheetWords.noSchema };
  const fields = (body.fields as Record<string, unknown>[]).map((f) => (f.id === field ? { ...f, label } : f));
  const shown = REGISTERS[register]?.fields.find((f) => f.id === field);
  const was = shown ? labelOf(shown) : field;
  const change = { declaration_id: `register.${register}`, to: { id: `register.${register}`, kind: 'register', body: { ...body, fields } } };
  return fileChange(base, register, sheetWords.renameQuestion(was, label, REGISTERS[register]?.name ?? register), change, owner, sheetWords.renameReason, io);
}

/* ── a new value for a closed list ── */

/**
 * The words for adding a value to a closed list and for putting an edit back, kept here beside the calls they describe,
 * as `fieldWords` is, so this module owns them rather than `copy.ts`.
 */
export const valueWords = {
  add: 'Another value',
  label: 'New value',
  save: 'Add',
  saving: 'Adding',
  cancel: 'Cancel',
  ownerNote: 'Everything in the list can hold it from now on.',
  memberNote: 'The owner is asked first, in Needs you.',
  empty: 'Type the value to add.',
  held: (said: string, field: string) => `${field} already has ${said}. Pick it from the list.`,
  notClosed: (field: string) => `${field} is not a closed list, so it takes any value.`,
  question: (value: string, field: string, list: string) => `Add ${value} to ${field} on ${list}?`,
  added: (value: string, field: string) => `${value} is one of ${field}'s values now.`,
  filed: (value: string) => `${value} is waiting in Needs you for the owner.`,
  putBack: (field: string) => `${field} is back to what it was.`,
} as const;

/* ONE SPELLING FOR COMPARING: case, and the underscore a stored value is read aloud without (`copy.valueWord`). */
const fold = (s: string): string => s.normalize('NFKC').toLowerCase().replace(/[_\s]+/gu, ' ').trim();

/**
 * The value a press asks for, or the sentence saying why it is not a new one.
 *
 * A VALUE THE LIST HOLDS BY ANOTHER SPELLING IS REFUSED, and so is one typed as the words a person reads for a held value.
 * `health` stores `on_track` and every screen says "On track", so somebody who types what they read means the value that
 * is there. The kernel would take `On track` as a fifth value beside `on_track`, since it compares exact strings
 * (`addTo`), and the list would then offer the same word twice.
 */
export function valueOf(register: string, field: string, typed: string): { ok: true; value: string } | { ok: false; fix: string } {
  const f = REGISTERS[register]?.fields.find((x) => x.id === field);
  const name = f ? labelOf(f) : field;
  if (f?.type !== 'enum') return { ok: false, fix: valueWords.notClosed(name) };
  const value = typed.trim().replace(/\s+/gu, ' ');
  if (value === '') return { ok: false, fix: valueWords.empty };
  const held = (f.values ?? []).find((v) => fold(v) === fold(value) || fold(valueSaid(f, v)) === fold(value));
  if (held !== undefined) return { ok: false, fix: valueWords.held(valueSaid(f, held), name) };
  return { ok: true, value };
}

/** The change `propose` files: one value appended to one closed list, and nothing else on it. */
export const valueAdditionOf = (register: string, field: string, value: string) => ({
  declaration_id: `register.${register}`,
  to: { add: { register, values: { [field]: [value] } } },
});

/**
 * File one value for a closed list, and accept it at once when the person filing owns the record.
 *
 * ADDITIVE AND NOTHING MORE. Retiring a value or reordering them is a whole-list change, which `addTo` refuses to read
 * as an addition, so it is not offered here.
 */
export async function addValue(base: string, register: string, field: string, value: string, owner: boolean, io?: Fetch): Promise<Added> {
  const decl = REGISTERS[register];
  const f = decl?.fields.find((x) => x.id === field);
  const question = valueWords.question(value, f ? labelOf(f) : field, decl?.name ?? register);
  return fileAddition(base, register, question, valueAdditionOf(register, field, value), owner, io);
}

/* ── Put back after an edit ── */

/**
 * The patch that undoes `patch` on a row that held `before`: each field it touched, as it was.
 *
 * A FIELD THE ROW DID NOT CARRY GOES BACK AS `null`, which is how the record is told to drop it. Left `undefined`, it
 * vanishes from the JSON, the patch is empty for that key, and the edit stands while the toast says it was put back.
 * It is sent at the version the edit answered with, so a write from somebody else in between is a conflict rather
 * than something this quietly reverts.
 *
 * IT IS THE LIST'S `inverseOf` NOW, and not a copy of it, because the copy missed the finished day. A state edit moves
 * that day in the same write (the kernel's `finished.ts`), and a put back that named the state alone was a move into
 * `done` with no day, which the record dates today. Measured against a kernel whose clock read 24 September: a
 * task done on 1 September, edited to `open` and put back, read `done on 2026-09-24`.
 * `finished-day-rest.test.ts` holds it. `decl` is the list's declaration, which names the state and the day; without
 * it nothing here knows which key is the state, and the put back is the fields the edit touched and nothing else.
 */
export function putBackOf(before: Fields, patch: Fields, decl?: Pick<RegisterDecl, 'state' | 'finished'>): Fields {
  /* `inverseOf` READS ONLY THE ROW'S FIELDS, so the rest of the entry it is typed over is left empty. */
  return inverseOf({ seq: 0, version: 0, created: '', by: '', fields: before }, patch, decl);
}
