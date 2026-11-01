/**
 * A KEPT TODAY SAYS CASH AHEAD IN TODAY'S WORDS (A5, 1 Nov). A board he arranged was saved with the words Today used then,
 * so his Cash ahead still read "Money", "To come in, next 30 days" and "Bills and usual spending, next 30 days", which
 * wrapped beside their figures, while a Today never arranged read "Cash ahead", "In, 30 days" and "Out, 30 days".
 *
 * ONLY WORDS TODAY ITSELF ONCE WROTE are changed, and only on the cash widget, so a name he gave a widget is his and
 * stays. Only for drawing: the kept page is not written.
 */

import { words } from './words.ts';

/** Each label Today's Cash ahead once wrote, to the one it writes now. */
const WAS: Readonly<Record<string, string>> = {
  'To come in, next 30 days': words.comingIn,
  'Coming in, 30 days': words.comingIn,
  'Bills and usual spending, next 30 days': words.goingOut,
  'Going out, 30 days': words.goingOut,
};

type Loose = Record<string, unknown>;

const isObject = (v: unknown): v is Loose => v !== null && typeof v === 'object' && !Array.isArray(v);

const relabel = (parts: unknown): unknown =>
  Array.isArray(parts)
    ? parts.map((p) => (isObject(p) && typeof p.label === 'string' && WAS[p.label] !== undefined ? { ...p, label: WAS[p.label] } : p))
    : parts;

/** One block as Today now words it, where it is the cash widget. */
export function cashWordsNow<B>(block: B): B {
  if (!isObject(block) || block.key !== 'cash') return block;
  const out: Loose = { ...block };
  if (out.heading === 'Money') out.heading = words.money;
  if ('cells' in out) out.cells = relabel(out.cells);
  if ('readings' in out) out.readings = relabel(out.readings);
  return out as B;
}

/** A kept page's answer (`blocks`, and `declared.blocks` where it is said) with its cash widget in today's words. */
export function keptWordsNow<V>(value: V): V {
  if (!isObject(value)) return value;
  const out: Loose = { ...value };
  if (Array.isArray(out.blocks)) out.blocks = out.blocks.map(cashWordsNow);
  if (isObject(out.declared) && Array.isArray(out.declared.blocks)) out.declared = { ...out.declared, blocks: out.declared.blocks.map(cashWordsNow) };
  return out as V;
}
