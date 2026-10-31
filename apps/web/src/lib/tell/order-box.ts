/**
 * EVERY ORDERS ADD BOX READS ITS LINE THE ONE WAY (audit 31 Oct n, AN5, AN18).
 *
 * The list's own box asked `orderLine` and the box on the Orders page (the page the rail opens) did not, so "20 candles
 * for Salma by Friday" there was an order called the whole line, for nobody, with no count. Both now ask here: the line
 * read against the order list and People as this tab knows them, and somebody new it is for made in People first.
 *
 * THE NEW PERSON'S NAME IS LEARNT AT ONCE (`TITLES`), so the row drawn before the page reads again says who it is for,
 * where it said "Unnamed person", and a second line naming them links the same person rather than making another.
 */

import { REGISTERS, TITLES } from '../record/held.ts';
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

/**
 * The order's fields with somebody new it is for made first and linked, and that person; or the fields as read, and
 * `null`, when nobody new was named or People refused them (the order is still taken, for nobody).
 */
export async function orderFields(
  line: OrderLine,
  create: (register: string, fields: Record<string, unknown>) => Promise<{ ok: true; entry: { seq: number } } | { ok: false }>,
): Promise<{ fields: Record<string, unknown>; made: Made | null }> {
  const fields = { ...line.fields };
  if (!line.person || !line.whoField) return { fields, made: null };
  const out = await create(line.person.register, line.person.fields);
  if (!out.ok) return { fields, made: null };
  const seq = out.entry.seq;
  fields[line.whoField] = `${line.person.register}#${seq}`;
  const title = REGISTERS[line.person.register]?.title;
  const name = title && typeof line.person.fields[title] === 'string' ? (line.person.fields[title] as string) : '';
  if (name !== '') TITLES.set(line.person.register, new Map([...(TITLES.get(line.person.register) ?? []), [seq, name]]));
  return { fields, made: { register: line.person.register, seq, name } };
}
