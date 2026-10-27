import { CASH_LEGS } from './money/legs.ts';
import { MODULE_LISTS } from './lists.ts';
import { MONEY_REGISTERS } from './money/lists/index.ts';

/**
 * A DECLARATION WITH EVERY FORECAST LEG OVER A LIST THE RECORD DOES NOT HOLD TAKEN OFF, as `firstPartyDocument` does for
 * a pack and `legsKept` does for an install. The cash walk names the lists an add-on holds (Certificates), and a record
 * without the add-on would refuse a figure over the walk, `REGISTER_UNKNOWN`, and the whole install with it.
 *
 * A LEG IS AN OBJECT WITH A `register` IN AN ARRAY CALLED `legs` (a figure) OR `from` (a block), wherever that array is.
 */
export function withoutLegs<T>(body: T, keep: (register: string) => boolean): T {
  const walk = (value: unknown, key: string | null): unknown => {
    if (Array.isArray(value)) {
      const legs = key === 'legs' || key === 'from';
      return value
        .filter((item) => !legs || typeof item !== 'object' || item === null || typeof (item as { register?: unknown }).register !== 'string' || keep((item as { register: string }).register))
        .map((item) => walk(item, null));
    }
    if (typeof value === 'object' && value !== null) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v, k)]));
    return value;
  };
  return walk(body, null) as T;
}

/** THE LISTS ONLY AN ADD-ON HOLDS THAT THE CASH WALK NAMES, which the sample and the light figures table leave out. */
export const ADDON_LEG_LISTS: ReadonlySet<string> = new Set(CASH_LEGS.map((leg) => leg.register).filter((register) => !Object.hasOwn(MONEY_REGISTERS, register) && !Object.values(MODULE_LISTS).some((held) => held.includes(register))));
