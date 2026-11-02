/**
 * The lists the first run can make, read off the modules this build ships, and the one check a value passes before the
 * first run shows it in one of them.
 *
 * READ OFF THE DECLARATIONS AND NEVER WRITTEN HERE. A list's name, its title field and every field's type and values are
 * the module's own (`moduleDocument`), so what the model is offered and what its answer is held to are the same lists the
 * press installs.
 *
 * A VALUE IS KEPT ONLY IN THE SHAPE THE RECORD STORES IT, and a field it does not fit is left empty rather than guessed:
 * money is whole minor units in a currency, a day is `YYYY-MM-DD`, an enum one of its values. A link to another list, a
 * list of values and a document are never filled from here, since nothing typed or exported names their target.
 *
 * A plain `.ts` with relative imports, so `node --test` can hold it; the screen only calls it.
 */

import { MODULE_ORDER, USE_CASES, useCaseDocument } from '@braindog/seed/usecases';
import { moduleDocument } from '@braindog/seed/usecases/install';
import { moduleName } from '@braindog/seed/usecases/names';
import { exponentOf } from 'braindog-render';
import { nameEnd } from './name-end.ts';

export type Field = { id: string; type: string; label: string; required: boolean; fallback: boolean; values: readonly string[] };
export type List = { id: string; name: string; module: string; title: string; fields: readonly Field[] };

type Body = Record<string, unknown>;
const isMap = (v: unknown): v is Body => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The field types a typed sentence or an exported cell can fill. */
export const FILLABLE: ReadonlySet<string> = new Set(['text', 'email', 'url', 'enum', 'money', 'day', 'int', 'decimal', 'number', 'bool']);

/** A field id as a person reads it: `as_of` is "As of". */
const spoken = (id: string): string => {
  const s = id.replace(/_/gu, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const cache = new Map<string, List[]>();

/** A use case's own pack, as a record names it (`usecase-shop`). */
const USECASE = /^usecase-(.+)$/u;

/**
 * THE DOCUMENT A MODULE OR A STARTER'S OWN PACK DECLARES ITS LISTS IN (1 Nov, audit AP1): a shop's Orders and Products
 * are its starter's, not a module's, and the drafts read after sign-up offered only the modules' lists, so a shop's
 * "Salma owes me 600" had nowhere to go.
 */
export function listDocument(id: string, today = '1970-01-01'): Body | null {
  const usecase = USECASE.exec(id)?.[1];
  return usecase !== undefined ? useCaseDocument(usecase, today) : moduleDocument(null, id, { today });
}

/** The starter's own pack (`usecase-shop`) that declares a list no module does, or `null`. */
export function useCaseOfList(register: string): string | null {
  for (const u of USE_CASES)
    for (const d of (u.pack?.declarations ?? []) as unknown[])
      if (isMap(d) && d.register === register && Array.isArray(d.fields) && d.page === undefined && d.rule === undefined) return `usecase-${u.usecase}`;
  return null;
}

/** The lists one module (or one starter's own pack) declares, each with its fields; one that only extends another list's fields is left out. */
export function listsOf(module: string): List[] {
  const held = cache.get(module);
  if (held) return held;
  const doc = listDocument(module);
  const out: List[] = [];
  for (const d of Array.isArray(doc?.declarations) ? (doc.declarations as unknown[]) : []) {
    if (!isMap(d) || typeof d.register !== 'string' || !Array.isArray(d.fields)) continue;
    const fields = (d.fields as unknown[]).filter(isMap).flatMap((f): Field[] =>
      typeof f.id === 'string' && typeof f.type === 'string'
        ? [
            {
              id: f.id,
              type: f.type,
              label: typeof f.label === 'string' ? f.label : spoken(f.id),
              required: f.required === true,
              fallback: f.default !== undefined,
              values: Array.isArray(f.values) ? f.values.filter((v): v is string => typeof v === 'string') : [],
            },
          ]
        : [],
    );
    out.push({ id: d.register, name: typeof d.name === 'string' ? d.name : spoken(d.register), module, title: typeof d.title === 'string' ? d.title : (fields[0]?.id ?? ''), fields });
  }
  cache.set(module, out);
  return out;
}

/** Every list the modules this build ships declare, in install order. */
export const allLists = (modules: readonly string[] = MODULE_ORDER): List[] => modules.flatMap(listsOf);

/** The list a module declares under one id, or `null`. */
export const listById = (id: string, modules: readonly string[] = MODULE_ORDER): List | null => allLists(modules).find((l) => l.id === id) ?? null;

/** A module as a person names it. */
export const nameOfModule = (id: string): string => moduleName(id);

/**
 * A currency's own decimals, from the one table the record and the renderer share (`exponentOf`): JPY 0, GBP 2, KWD 3.
 * Never the browser's: CLDR answers a different question (IQD 0 where ISO says 3), and an amount stored with one minor
 * unit and drawn with another is off by a thousand.
 */
export const decimalsOf = (currency: string): number => exponentOf(currency);

/** A currency code this browser knows. */
export function knownCurrency(code: string): boolean {
  if (!/^[A-Z]{3}$/u.test(code)) return false;
  try {
    return Intl.supportedValuesOf('currency').includes(code);
  } catch {
    return true;
  }
}

/** A real calendar day, `YYYY-MM-DD`. */
export function isDay(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/**
 * One value checked against one field, or `undefined` where it does not fit. `currency` is the one money may be in: an
 * amount in another is not added to anything and is not kept.
 */
export function fits(field: Field, value: unknown, currency: string | null): unknown {
  switch (field.type) {
    case 'text':
    case 'email':
    case 'url': {
      const s = typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
      return s === '' ? undefined : s.slice(0, 500);
    }
    case 'enum':
      return typeof value === 'string' && field.values.includes(value) ? value : undefined;
    case 'money': {
      const m = isMap(value) ? value : null;
      const amount = m?.amount;
      return typeof amount === 'number' && Number.isSafeInteger(amount) && currency !== null && m?.currency === currency ? { amount, currency } : undefined;
    }
    case 'day':
      return isDay(value) ? value : undefined;
    case 'int':
      return typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined;
    case 'decimal':
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
    case 'bool':
      return typeof value === 'boolean' ? value : undefined;
    default:
      return undefined;
  }
}

/**
 * An entry's fields, each checked against its list, or `null` when what is left would not be written: its title is
 * missing, or a field the list requires is, with no default to stand in.
 */
export function entryOf(list: List, fields: Readonly<Record<string, unknown>>, currency: string | null): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  for (const f of list.fields) {
    if (!Object.hasOwn(fields, f.id)) continue;
    const v = fits(f, fields[f.id], currency);
    if (v !== undefined) out[f.id] = v;
  }
  /* AN ENTRY'S TITLE IS A NAME, never the end of the sentence it came from ("Kettle & Co." is Kettle & Co, `nameEnd`). */
  const title = out[list.title];
  if (typeof title === 'string') {
    const t = nameEnd(title);
    if (t === '') return null;
    out[list.title] = t;
  }
  if (out[list.title] === undefined) return null;
  return list.fields.every((f) => !f.required || f.fallback || out[f.id] !== undefined) ? out : null;
}
