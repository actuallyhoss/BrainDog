/**
 * A LINE TYPED INTO AN ORDERS LIST'S OWN ADD BOX, READ AS TELL READS AN ORDER (audit 31 Oct m, AM11).
 *
 * Tell's "Salma ordered 20 lavender candles for Friday" made an order of "lavender candles", Who Salma, How many 20, and
 * the box's "20 candles for Salma by Friday" made one called "20 candles for Salma" with only a day: two shapes of one
 * order, and the second said nobody it was for. The box now asks the one order reader (`tellRead`) for its line, against
 * the order list and People alone, and takes what it read when it read exactly one order and nothing else.
 *
 * WHO IT IS FOR: somebody already in People is linked; somebody new comes back as the person to make first, and the
 * field to put them in once made. A name two people share is left off, never guessed, as Tell leaves it.
 *
 * PURE, so a test reads the answer; the list page only calls it.
 */

import { tellRead, type Known, type TellList } from './read.ts';

export type OrderLine = {
  /** The order's fields as the record takes them, with nobody new in them. */
  fields: Record<string, unknown>;
  /** Somebody new the order is for, to be made in People first. */
  person: { register: string; fields: Record<string, unknown> } | null;
  /** The field the new person goes into once made. */
  whoField: string | null;
};

/** Whether a list is one an order goes into, as Tell finds it: it calls one of its entries an order. */
export const takesOrders = (l: Pick<TellList, 'name' | 'one'>): boolean => /\border/iu.test(l.one ?? '') || /\border/iu.test(l.name);

/** The order a line typed into `order`'s add box says, or `null` for a line that is not one order alone. */
export function orderLine(said: string, order: TellList, people: TellList | undefined, known: readonly Known[], today: string): OrderLine | null {
  /* WITHOUT PEOPLE LEARNT, a name in the line would be dropped, so the box reads it as it always has. */
  if (!takesOrders(order) || said.trim() === '' || !people) return null;
  const told = tellRead(said, { lists: [order, people], today, currency: null, home: null, held: [], people: known });
  const at = told.rows.findIndex((r) => r.register === order.id);
  if (at === -1 || told.why !== undefined) return null;
  if (told.rows.some((r, i) => i !== at && r.register !== people.id)) return null;
  if (told.left.some((w) => !/^which\s/iu.test(w))) return null;
  const fields: Record<string, unknown> = {};
  let person: OrderLine['person'] = null;
  let whoField: string | null = null;
  for (const [k, v] of Object.entries(told.rows[at]!.fields)) {
    if (v !== null && typeof v === 'object' && '$row' in v) {
      const made = told.rows[v.$row];
      if (made) {
        person = { register: made.register, fields: { ...made.fields } };
        whoField = k;
      }
      continue;
    }
    fields[k] = v;
  }
  return { fields, person, whoField };
}
