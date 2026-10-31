/**
 * EVERY ORDERS ADD BOX READS ITS LINE THE ONE WAY (audit 31 Oct n, AN5, AN18).
 *
 * The list's own box asked `orderLine` and the box on the Orders page (the page the rail opens) did not, so "20 candles
 * for Salma by Friday" there was an order called the whole line, for nobody, with no count. Both now ask here: the line
 * read against the order list and People as this tab knows them, and somebody new it is for made in People with it.
 *
 * THE NEW PERSON'S NAME IS LEARNT AT ONCE (`TITLES`), so the row drawn before the page reads again says who it is for,
 * where it said "Unnamed person", and a second line naming them links the same person rather than making another.
 */

import { REGISTERS, TITLES } from '../record/held.ts';
import type { MadeWith } from '../record/rows-write.ts';
import type { Fields } from '../record/schema.ts';
import { PEOPLE } from '../who.ts';
import { orderLine, type OrderLine } from './order-line.ts';

/** What a line typed into `register`'s add box says as an order, or `null` for a line that is not one. */
export function orderFor(said: string, register: string, today: string): OrderLine | null {
  const decl = REGISTERS[register];
  if (!decl?.title) return null;
  const people = REGISTERS[PEOPLE];
  const known = [...(TITLES.get(PEOPLE) ?? [])].filter(([, name]) => name !== '').map(([seq, name]) => ({ seq, name }));
  return orderLine(said, { ...decl, id: register }, people ? { ...people, id: PEOPLE } : undefined, known, today);
}

/** The person an order's line made, by number and name. */
export type Made = { register: string; seq: number; name: string };

/** Somebody new an order's line names, to be made with it: their list, fields and name, and the order's field for them. */
export type NewFor = { register: string; fields: Record<string, unknown>; link: string; name: string };

/** Somebody new the line names, or `null` when it names nobody new. */
export function newFor(line: OrderLine | null): NewFor | null {
  if (!line?.person || !line.whoField) return null;
  const title = REGISTERS[line.person.register]?.title;
  const name = title && typeof line.person.fields[title] === 'string' ? (line.person.fields[title] as string) : '';
  return { register: line.person.register, fields: line.person.fields, link: line.whoField, name };
}

/**
 * THE ORDER AND SOMEBODY NEW IT IS FOR GO IN ONE WRITE (RN5), Tell's capture, under one batch: both land or neither
 * does, so a refused order leaves nobody in People and the next try makes one person, not two. With nobody new it is
 * the order alone. The person's name is learnt at once (`TITLES`), and the landed row holds them by number, so its Who
 * draws their name before the page reads again (AN18).
 */
export async function orderWrite<E extends { seq: number; fields: Fields }, F extends { ok: false }>(
  writer: {
    create(register: string, fields: Fields): Promise<{ ok: true; entry: E } | F>;
    createFor(register: string, fields: Fields, person: MadeWith): Promise<{ ok: true; entry: E; person: { register: string; seq: number } } | F>;
  },
  register: string,
  fields: Fields,
  person: NewFor | null,
): Promise<{ out: { ok: true; entry: E } | F; made: Made | null }> {
  if (!person) return { out: await writer.create(register, fields), made: null };
  const out = await writer.createFor(register, fields, { register: person.register, fields: person.fields as Fields, link: person.link });
  if (!out.ok) return { out, made: null };
  const seq = out.person.seq;
  if (person.name !== '') TITLES.set(person.register, new Map([...(TITLES.get(person.register) ?? []), [seq, person.name]]));
  return { out: { ok: true, entry: { ...out.entry, fields: { ...out.entry.fields, [person.link]: seq } } }, made: { register: person.register, seq, name: person.name } };
}

/**
 * Who an order is for, said in its receipt beside its name ("For Salma"), as a line's day is: the person made for it,
 * or the one it links whose name this tab knows. Nothing when it is for nobody.
 */
export function orderSaid(fields: Readonly<Record<string, unknown>>, made: { name: string } | null): string[] {
  if (made && made.name !== '') return [`For ${made.name}`];
  for (const v of Object.values(fields)) {
    const m = typeof v === 'string' ? /^([a-z][a-z0-9_]*)#([1-9]\d*)$/u.exec(v) : null;
    const name = m ? TITLES.get(m[1]!)?.get(Number(m[2])) : undefined;
    if (name) return [`For ${name}`];
  }
  return [];
}

/** An order's line as a page's add box writes it: its name, the rest of what was read with who it is for, and that said. */
export function orderRead(fields: Readonly<Record<string, unknown>>, title: string, made: { name: string } | null): { text: string; parsed: Record<string, unknown>; said: string[] } {
  const { [title]: name, ...rest } = fields;
  return { text: String(name), parsed: rest, said: orderSaid(fields, made) };
}
