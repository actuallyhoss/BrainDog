/**
 * One field's value as a box holds it, what the record would refuse about what was typed, and the patch it goes back as.
 *
 * TWO SCREENS EDIT A VALUE AND ONLY ONE OF THEM COULD DO IT PROPERLY. The row page edited every type but `secret`
 * through three closures over its own state, and the grid kept a list of five types (`text enum day int decimal`) and
 * sent everything else to the row, saying a money was "an amount and a currency" as though that were unsolved. It was
 * solved, fifty lines away, where nothing else could call it. These are those closures with their state passed in:
 * the field, what was typed, the value the row held and the currency the list mostly holds. The row page calls them
 * unchanged in behaviour, and a cell save now goes through the same three, so a money cell keeps its currency and
 * refuses a third decimal on EGP exactly as the row page does (`field-draft.test.ts`).
 *
 * THE CURRENCY THE ROW HOLDS WINS, AND THE ONE PASSED IN IS THE FALLBACK. A list of pounds can hold one row in dinars,
 * and correcting that row's amount must not quietly move it into pounds. After the row come the currency the field's
 * default is in, the list's, and the record's own (`homeCurrency()`), each one somebody chose. There was a `GBP` after
 * them, so on a record in pounds of Egypt a box on a list with no money in it yet wrote sterling; with none of them
 * known a money is not written, and the box says why.
 */

import { day, exponentOf } from 'braindog-render';

import { copy } from '../copy.ts';
import { amountOf, currencyOf } from './money.ts';
/* No cycle: `api.ts` does not import this file, directly or through another. */
import { homeCurrency } from './api.ts';
import type { FieldDecl, Fields } from './schema.ts';
import { listFromDraft, listLine } from './tags.ts';

/**
 * Whether a field's value can be changed where it is drawn.
 *
 * EVERY TYPE BUT THOSE `UNBOXED` NAMES, ON BOTH SCREENS, and one predicate so the two cannot drift again. A secret is
 * never drawn and never edited: a credential does not go in a row, the Keychain is a different surface with different
 * rules, and `readableFields` has already left it out.
 *
 * A `file` WAS UNBOXED BESIDE IT until the file store existed: its bytes live outside the row, at
 * `/api/files/<sha256>`, and the row holds `{ sha256, mime, bytes, name }`. Its draft is that value written out
 * (`draftOf`), which `FileField.svelte` reads and writes, so the file goes through the same `patchOf` and `unchanged` as
 * every other field.
 *
 * `quantity` AND `json` WERE REFUSED BESIDE THEM, because `draftOf` handed the box `String` of the value: a `json`
 * cell holding `{ a: 1 }` opened as `[object Object]`, and one character typed after it went back as that string,
 * which the record's `json` coercion accepts as it comes (`field-draft.test.ts`). Each now opens as text that says
 * the whole value, a number and its unit or the structure written out, and goes back through `patchOf` as the object
 * the record stores, in the box drawn for it (`QuantityBox.svelte`, `JsonBox.svelte`).
 */
const UNBOXED: ReadonlySet<string> = new Set(['secret']);

/**
 * What a run says about itself on the list of runs: the app, its version and session id, the repository, its remote,
 * the folder, the machine, the branch and the commit.
 *
 * THE KERNEL'S `RUN_FACTS` (`session.ts`), HELD HERE AS A LITERAL because this app does not load the kernel at run time,
 * and kept equal to it by `field-draft.test.ts`. The agent's token writes them as its run opens, and they are how its
 * next write finds that run, so a person who rewrote the folder would move the run out of the place it works in. On
 * every other list a field called `cwd` or `head` is that list's own, and a person's to change.
 */
export const RUN_FACTS: readonly string[] = ['client_id', 'client', 'client_version', 'repo', 'remote', 'cwd', 'host', 'branch', 'head'];
const RUNS = 'session';

/** Whether a field on a list is one of the facts a run reported about itself. */
export const runFact = (f: { id?: string } | undefined, register: string | undefined): boolean =>
  register === RUNS && typeof f?.id === 'string' && RUN_FACTS.includes(f.id);

/** Why a run's own fact has no box, finishing `copy.cellNotEdited`'s "Folder is ..., so it cannot be changed here." */
export const runFactWhy = 'what the run reported about itself';

/**
 * `register` is the list the field is drawn on. Every screen passes it, so a run's folder is a fact and not a box,
 * while a type-only question (which types a box can hold at all) leaves it out.
 */
export const editable = (f: Pick<FieldDecl, 'type'> & { id?: string }, register?: string): boolean =>
  !UNBOXED.has(f.type) && !runFact(f, register);

/**
 * A `quantity` field, and a `json` one.
 *
 * COMPARED AS TEXT, because this app's `FieldType` lists only the types a register it ships declares (`schema.ts`), and
 * neither of these is on it, while a declaration the record serves can carry both. A plain `===` against the union
 * would be refused by the type checker as a comparison that is never true, and on a record that declares one it is.
 */
export const isQuantity = (f: Pick<FieldDecl, 'type'>): boolean => (f.type as string) === 'quantity';
export const isJson = (f: Pick<FieldDecl, 'type'>): boolean => (f.type as string) === 'json';
/** A `file` field, compared as text for the same reason: the app's `FieldType` does not list it. */
export const isFile = (f: Pick<FieldDecl, 'type'>): boolean => (f.type as string) === 'file';

/** A file as a row holds it (`kernel/src/coerce.ts` `file`): its bytes are at `/api/files/<sha256>`. */
export type FileValue = { sha256: string; mime: string; bytes: number; name: string };

/**
 * The file a draft names, or `null` for an empty draft or one that is not a file.
 *
 * THE SAME FOUR TESTS THE RECORD'S COERCION MAKES, so a draft this accepts is a value the record accepts: a hash of
 * sixty-four lower-case hex characters, a type, a whole number of bytes and a name.
 */
export function fileOf(draft: string): FileValue | null {
  const read = jsonOf(draft.trim());
  if (!read.ok || read.value === null || typeof read.value !== 'object' || Array.isArray(read.value)) return null;
  const v = read.value as Record<string, unknown>;
  if (typeof v.sha256 !== 'string' || !/^[0-9a-f]{64}$/u.test(v.sha256)) return null;
  if (typeof v.mime !== 'string' || v.mime === '' || typeof v.name !== 'string' || v.name === '') return null;
  if (typeof v.bytes !== 'number' || !Number.isInteger(v.bytes) || v.bytes < 0) return null;
  return { sha256: v.sha256, mime: v.mime, bytes: v.bytes, name: v.name };
}

/** A file as its draft: the value written out, which `fileOf` reads back. Empty for no file. */
export const fileDraft = (file: FileValue | null): string => (file === null ? '' : JSON.stringify(file));

/** A typed number, read as decimal digits and nothing else, so `0x10` is refused rather than written as 16. */
const DECIMAL = /^-?\d+(\.\d+)?$/u;

/** The unit a stored quantity carries, or `null` for anything that is not one. */
function unitHeld(value: unknown): string | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const unit = (value as { unit?: unknown }).unit;
  return typeof unit === 'string' && unit.trim() !== '' ? unit.trim() : null;
}

/**
 * The units a quantity box offers: the one the row holds, the one the field declares, then the one its default is in,
 * each once and in that order, which is also the order a number typed without a unit is written in.
 *
 * NEVER A UNIT NOBODY CHOSE. With none of the three known the box takes the unit as typing, and a number sent without
 * one is refused where it was typed (`wrongValue`), because `3` on its own is a number of something the row forgot.
 */
export function unitsOf(f: FieldDecl, held: unknown): string[] {
  const declared = typeof f.unit === 'string' && f.unit.trim() !== '' ? f.unit.trim() : null;
  return [...new Set([unitHeld(held), declared, unitHeld(f.default)].filter((u): u is string => u !== null))];
}

/**
 * A quantity as one line of text, the number and then its unit, which is how `draftOf` opens it and how the box writes
 * it back into the one string both screens keep for whatever is being typed.
 *
 * NO NUMBER IS NO QUANTITY: a box whose number was cleared is the field being emptied, whatever unit sits beside it,
 * so the line is empty and the save tells the record the row no longer carries the field.
 */
export const quantityLine = (number: string, unit: string): string =>
  number.trim() === '' ? '' : unit.trim() === '' ? number : `${number} ${unit.trim()}`;

/**
 * The two halves of a quantity's line: the run of figures it starts with, and the rest as its unit, so `2 kg` and
 * `2kg` typed by hand are both two kilograms.
 *
 * EVERY FIGURE STANDING ON ITS OWN STAYS IN THE NUMBER, the comma, the point and a space between digits with it, so
 * `1,5 kg` and `1 000 kg` are numbers `DECIMAL` refuses, and not the number `1` in a unit called `,5 kg` or `000 kg`:
 * that would be a value nobody typed, written without a word. A figure written against letters starts the unit, so a
 * row holding two of a unit called `100g` opens as `2 100g` and reads back as the same two.
 */
export function quantityParts(line: string): { number: string; unit: string } {
  const m = /^(-?[\d.,]+(?:\s+[\d.,]+(?=\s|$))*)?\s*(.*)$/su.exec(line.trim());
  return { number: m?.[1] ?? '', unit: (m?.[2] ?? '').trim() };
}

/** Structured data read from what was typed, or a note that it does not read. */
function jsonOf(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/**
 * A day as the record writes it on every screen, `3 Sep 2026`, which is what a day box opens on (`DayBox.svelte`).
 *
 * THE BROWSER'S DATE CONTROL SPOKE ITS OWN FORMAT, `mm/dd/yyyy` on a machine set to American English, in a record that
 * writes the same day as `3 Sep 2026` in the cell beside it. So the box is text, and it opens on the
 * record's own words for the day, from the formatter that draws the cell (`braindog-render` `day`).
 */
export const dayLine = (value: string): string => (value.trim() === '' ? '' : day(value.trim()));

/**
 * The day a person typed, as the record stores it (`YYYY-MM-DD`), or `null` when it is not one.
 *
 * TWO SPELLINGS ARE READ: the one the box opened on, a day, a month's name or the first three or more letters of it,
 * and a year (`3 Sep 2026`, `3 september 2026`), and the stored form itself, which is what a person pasting from
 * elsewhere most often has. Slashes are not read at all: `03/09/2026` is the third of September in one country and
 * the ninth of March in the next, and a guess between them is a date nobody typed.
 *
 * AND THE DAY HAS TO EXIST. `Date.UTC` rolls 30 February into March without a word, so the parts are compared after
 * the trip, as the record's own `day` coercion does.
 */
export function dayFrom(typed: string): string | null {
  const s = typed.trim();
  let y: number;
  let m: number;
  let d: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(s);
  if (iso) {
    [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else {
    const said = /^(\d{1,2})\s+([A-Za-z]{3,})\.?,?\s+(\d{4})$/u.exec(s);
    if (!said) return null;
    const word = (said[2] ?? '').toLowerCase();
    const at = MONTHS.findIndex((name) => name.startsWith(word));
    if (at < 0) return null;
    [y, m, d] = [Number(said[3]), at + 1, Number(said[1])];
  }
  const back = new Date(Date.UTC(y, m - 1, d, 12));
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return null;
  const two = (n: number): string => String(n).padStart(2, '0');
  return `${y}-${two(m)}-${two(d)}`;
}

/**
 * The currency a money box is typed in: the row's own, else the field's default's, else the list's, else the record's,
 * or `null` when nobody has chosen one. Never a literal.
 */
const currencyIn = (f: FieldDecl, held: unknown, currency: string | null | undefined): string | null =>
  currencyOf(held) ?? currencyOf(f.default) ?? currency ?? homeCurrency();

/**
 * WHAT A MONEY BOX SAYS WHEN NO CURRENCY IS KNOWN, this module's own words: the record would refuse an amount without a
 * currency, and the box takes digits alone, so the sentence says why nothing was written rather than guessing one.
 */
const words = {
  noCurrency: 'Nothing says which currency this amount is in yet, so it was not written: this row has none, and neither does the record.',
  /* AND THE SAME FOR THE BOXES THAT TAKE A VALUE APART: each says what it would have written, so the
     sentence under the box is a way to fix it rather than a refusal the record would give a second later. */
  quantityShape: 'Write the amount as a number, like 2.5, with its unit beside it.',
  noUnit: 'Nothing says what this number counts yet, so it was not written: choose its unit beside it.',
  unitUnknown: (units: string) => `This field counts in ${units}: write the number alone and choose its unit beside it.`,
  jsonShape: 'This does not read as structured data yet: check its brackets, quotes and commas.',
  dayShape: 'Write the day as the record does, like 3 Sep 2026.',
  /* A FILE IS CHOSEN AND NEVER TYPED, so a draft that names none came from somewhere other than the picker. */
  fileShape: 'This is not a file yet: choose one with Add a file.',
} as const;

/**
 * What a `duration`'s declared unit is worth in the seconds the record stores.
 *
 * THE SAME TABLE `api.ts` `display` DRAWS A DURATION WITH, and it has to be: the box opens on what the cell says, and
 * a cell that reads `2 h` and a box that opens on `7200` are two answers to one question. That was the first
 * refusal of this module (`field-draft.test.ts`). `display`'s copy is private to `api.ts`, so this one is a second copy of five numbers rather than an edit to it; an unknown unit is worth one
 * second in both, which is what `display` prints beside it.
 */
const SECONDS: Readonly<Record<string, number>> = { s: 1, m: 60, h: 3_600, d: 86_400, w: 604_800 };

/** The unit a duration is typed and said in: the field's own, else seconds, which is the unit the record stores. */
export const unitOf = (f: FieldDecl): string => f.unit ?? 's';
const secondsIn = (f: FieldDecl): number => SECONDS[unitOf(f)] ?? 1;

/**
 * A stored duration as the number a box holds, in the field's unit.
 *
 * THE SHORTEST DECIMAL THAT COMES BACK AS THE SAME SECONDS. `100` seconds in hours is `0.027777777777777776` as
 * `String` writes it; three places, which is what `display` shows, is `0.028`, and that goes back as 101 seconds, so
 * opening the box and saving it would move the value. The loop stops at the first number of places that survives the
 * trip through `patchOf`, which for every value in the test's sweep is twelve characters or fewer.
 */
function durationDraft(f: FieldDecl, held: unknown): string {
  const seconds = Number(held);
  const per = secondsIn(f);
  if (!Number.isFinite(seconds) || per === 1) return String(held);
  for (let places = 0; places <= 15; places++) {
    const said = String(Number((seconds / per).toFixed(places)));
    if (Math.round(Number(said) * per) === seconds) return said;
  }
  return String(seconds / per);
}

/**
 * The value as a box holds it: money in major units, a duration in its unit, a list as its tags, a quantity as its
 * number and unit, structured data written out, the rest as stored.
 *
 * STRUCTURED DATA IS ASKED BEFORE THE LIST, because a `json` field may hold an array, and an array opened as tags with
 * commas would go back as a list of words, its numbers and nesting gone. It is written out two spaces to a level, so
 * the box shows its shape; `unchanged` compares what it reads as rather than its spacing.
 */
export function draftOf(f: FieldDecl, held: unknown, currency: string | null | undefined): string {
  if (held === null || held === undefined) return '';
  if (isJson(f)) return JSON.stringify(held, null, 2) ?? '';
  /* A FILE IS ITS VALUE WRITTEN OUT, in one key order, so a draft `FileField` wrote and the held value compare as text. */
  if (isFile(f)) return fileDraft(fileOf(JSON.stringify(held) ?? ''));
  /* A LIST IS TYPED AS ITS TAGS WITH COMMAS, and the tags the record keeps for itself are not in the box (`tags.ts`). */
  if (Array.isArray(held)) return listLine(held) ?? '';
  if (isQuantity(f)) {
    const number = held !== null && typeof held === 'object' ? (held as { value?: unknown }).value : held;
    return quantityLine(number === undefined || number === null ? '' : String(number), unitHeld(held) ?? '');
  }
  if (f.type === 'duration') return durationDraft(f, held);
  if (f.type !== 'money') return String(held);
  const minor = amountOf(held);
  if (minor === null) return '';
  /* A MONEY IN NO KNOWN CURRENCY HAS NO EXPONENT TO SHIFT BY, so the box opens on the number as it is stored. */
  const code = currencyIn(f, held, currency);
  return code === null ? String(minor) : String(minor / 10 ** exponentOf(code));
}

/**
 * What the record would refuse about a money box, said where it was typed rather than at the save.
 *
 * THE EXPONENT IS THE CURRENCY'S: two decimals is most currencies and not all of them, and a field that assumed two
 * would refuse `KWD 1.250` and quietly mangle `JPY 1250`.
 */
export function wrongMoney(f: FieldDecl, typed: string, held: unknown, currency: string | null | undefined): string | null {
  if (f.type !== 'money') return null;
  const raw = typed.trim();
  if (raw === '') return null;
  if (!/^-?\d+(\.\d+)?$/u.test(raw)) return copy.moneyShape;
  const code = currencyIn(f, held, currency);
  if (code === null) return words.noCurrency;
  const exp = exponentOf(code);
  const places = raw.includes('.') ? raw.length - raw.indexOf('.') - 1 : 0;
  return places > exp ? copy.moneyPlaces(exp) : null;
}

/**
 * What the record would refuse about any box, said where it was typed: a money's places and currency (`wrongMoney`),
 * a quantity with no number or no unit, structured data that does not read, and a day that is not one.
 *
 * BOTH SCREENS ASK THIS BEFORE A WRITE, and for structured data it is the only thing standing between a slip and a
 * wrong value: the record's `json` coercion takes a string as readily as an object, so `{ "a": 1` sent as it was
 * typed would be stored as text rather than refused.
 */
export function wrongValue(f: FieldDecl, typed: string, held: unknown, currency: string | null | undefined): string | null {
  if (f.type === 'money') return wrongMoney(f, typed, held, currency);
  const raw = typed.trim();
  if (raw === '') return null;
  if (f.type === 'day') return dayFrom(raw) === null ? words.dayShape : null;
  if (isQuantity(f)) {
    const { number, unit } = quantityParts(raw);
    if (!DECIMAL.test(number)) return words.quantityShape;
    const known = unitsOf(f, held);
    if (unit === '') return known.length === 0 ? words.noUnit : null;
    /* A UNIT THE FIELD DOES NOT KNOW, WHERE IT KNOWS SOME, is most often a word typed into the number box beside a
       unit already chosen, as `3 lb` beside `kg` reads `lb kg`, and the box offers only the units it knows anyway. */
    return known.length > 0 && !known.includes(unit) ? words.unitUnknown(known.join(' or ')) : null;
  }
  if (isJson(f)) return jsonOf(raw).ok ? null : words.jsonShape;
  if (isFile(f)) return fileOf(raw) === null ? words.fileShape : null;
  return null;
}

/**
 * A quantity or structured data as a patch carries it.
 *
 * THE RECORD'S SHAPES, WHICH THIS APP'S `Fields` DOES NOT LIST: it types the values of the types a register this app
 * ships declares (`schema.ts`), and `{ value, unit }` and an arbitrary structure are not among them. The record's own
 * coercion is what checks them, on the write.
 */
const stored = (value: unknown): Fields[string] => value as Fields[string];

/**
 * The one field, in the shape the record stores.
 *
 * A YES OR NO IS TICKED, so `typed` is a boolean for a `bool` and the text in the box for everything else.
 *
 * A MONEY IS AN AMOUNT AND A CURRENCY and the box holds only the amount, so it is put back together here, beside the
 * exponent that took it apart. Everything else goes as it was typed and `outbound` converts it: an empty box is `null`,
 * which is how the record is told the row no longer carries that field.
 *
 * THE `Array.isArray` BESIDE THE `list` CHECK is about the ROW rather than the declaration: a list that has since
 * stopped declaring a field as a list still has rows holding an array in it, and the record's own tags are kept.
 *
 * A DURATION IS TYPED IN ITS UNIT AND STORED IN SECONDS, so `3` in a field said in hours is 10,800. It went as typed
 * before, and the record read `3` as three seconds. In any unit bigger than a second the product is rounded to a
 * whole second, a precision the unit never showed; in seconds it goes as typed, so `1.5` meets the record's sentence
 * about whole numbers instead of quietly becoming `2`. What is not a number goes as typed, for the same sentence.
 *
 * A QUANTITY IS A NUMBER AND A UNIT, `{ value, unit }`, and a number typed alone goes in the unit `unitsOf` puts
 * first. Structured data goes as what it reads as, and a day typed as the record writes it goes as the day it names.
 * What does not read goes as typed, and `wrongValue` has said so under the box before any caller gets here.
 */
export function patchOf(f: FieldDecl, typed: string | boolean, held: unknown, currency: string | null | undefined): Fields {
  if (f.type === 'bool') return { [f.id]: typed === true };
  const raw = String(typed).trim();
  if (isJson(f)) {
    if (raw === '') return { [f.id]: null };
    const read = jsonOf(raw);
    return { [f.id]: read.ok ? stored(read.value) : raw };
  }
  if (isFile(f)) {
    if (raw === '') return { [f.id]: null };
    const file = fileOf(raw);
    return { [f.id]: file === null ? raw : stored(file) };
  }
  if (isQuantity(f)) {
    if (raw === '') return { [f.id]: null };
    const { number, unit } = quantityParts(raw);
    const said = unit !== '' ? unit : unitsOf(f, held)[0];
    if (!DECIMAL.test(number) || said === undefined) return { [f.id]: raw };
    return { [f.id]: stored({ value: Number(number), unit: said }) };
  }
  if (f.type === 'day' && raw !== '') return { [f.id]: dayFrom(raw) ?? raw };
  if (f.type === 'list' || Array.isArray(held)) return { [f.id]: listFromDraft(raw, held) };
  if (f.type === 'duration') {
    if (!/^-?\d+(\.\d+)?$/u.test(raw)) return { [f.id]: raw };
    const per = secondsIn(f);
    return { [f.id]: per === 1 ? Number(raw) : Math.round(Number(raw) * per) };
  }
  if (f.type !== 'money') return { [f.id]: raw };
  if (raw === '') return { [f.id]: null };
  const code = currencyIn(f, held, currency);
  /* NO CURRENCY IS NO MONEY, and none is made up: `wrongMoney` has already said so beside the box, and a caller that
     did not ask it sends the text as typed, which the record refuses with its own sentence. */
  if (code === null) return { [f.id]: raw };
  return { [f.id]: { amount: Math.round(Number(raw) * 10 ** exponentOf(code)), currency: code } };
}

/**
 * Whether what was typed is what the row already holds, so that a save sends nothing.
 *
 * A SAVE THAT CHANGES NOTHING IS NOT A WRITE: it would put a line in the row's history saying a field went from a value
 * to the same value, which is a fact about a press. Compared as the box would draw the held value, which is the row
 * page's own test, and a toggle as a toggle.
 *
 * STRUCTURED DATA IS COMPARED AS WHAT IT READS AS, so a box whose spacing was tidied and whose values were not is not
 * a change; what does not read is a change, and `wrongValue` stops it before it is sent.
 */
export function unchanged(f: FieldDecl, typed: string | boolean, held: unknown, currency: string | null | undefined): boolean {
  if (f.type === 'bool') return typed === (held === true);
  if (isJson(f) && String(typed).trim() !== '') {
    const read = jsonOf(String(typed));
    return read.ok && JSON.stringify(read.value) === JSON.stringify(held ?? null);
  }
  return String(typed).trim() === draftOf(f, held, currency).trim();
}
