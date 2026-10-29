/**
 * HOW A CATEGORY OR AN ACCOUNT IS DRAWN ON MONEY: a glyph and a colour slot, the same chip on a ledger line, a bar of
 * the month's spending, a budget and the quick add.
 *
 * A CATEGORY'S OWN `icon` AND `colour` WIN. Most categories hold neither (his fifteen were typed before the fields
 * existed), so a category named for a common kind of spending takes a sensible glyph by its name, and its colour is the
 * steady slot its name hashes to (`wordSlot`), the one the ledger already gives it. A name nothing here knows keeps the
 * tag glyph. Nothing is written back: this is how it is drawn, never what it holds.

 *
 * AN ACCOUNT IS DRAWN BY ITS TYPE (bank, cash, card) where the record says it, else by its name.
 */

import { wordSlot } from 'braindog-render';

export type Look = { glyph: string; slot: string | null };

/** Words in a category's name, each with the glyph it is drawn with. First match wins, so the narrow words go first. */
const BY_NAME: readonly (readonly [RegExp, string])[] = [
  [/grocer|supermarket|market|food shop|بقال/iu, 'shopping-cart'],
  [/coffee|cafe|café/iu, 'coffee'],
  [/outing|eat|dining|restaurant|food|lunch|dinner|takeaway|delivery/iu, 'utensils'],
  [/fuel|petrol|gas station|car|auto|parking|uber|taxi|ride/iu, 'car'],
  [/flight|travel|trip|holiday|hotel|vacation/iu, 'plane'],
  [/train|metro|transit|bus|transport/iu, 'train-front'],
  [/rent|mortgage|home|house|household|furniture/iu, 'house'],
  [/util|electric|power|water|internet|bill/iu, 'zap'],
  [/phone|mobile|telecom/iu, 'phone'],
  [/health|medical|doctor|pharma|clinic|hospital/iu, 'heart-pulse'],
  [/gift|present/iu, 'gift'],
  [/entertain|fun|movie|cinema|game|stream|subscription/iu, 'ticket'],
  [/music|concert/iu, 'music'],
  [/school|educat|course|tuition|study|studies|learn/iu, 'graduation-cap'],
  [/gym|sport|fitness/iu, 'dumbbell'],
  [/wage|income|client|freelance|work|business|office/iu, 'briefcase'],
  [/saving/iu, 'piggy-bank'],
  [/invest|stock|fund|certificate/iu, 'landmark'],
  [/card|credit|loan|debt|instal/iu, 'credit-card'],
  [/charity|donat|zakat|sadaqa/iu, 'hand-coins'],
  [/transfer|move/iu, 'repeat'],
  [/discrepan|adjust|correction|reconcil/iu, 'scale'],
  [/family|kids|child|partner|wife|husband|personal/iu, 'heart'],
  [/shop|cloth|amazon|order|purchase/iu, 'shopping-bag'],
  [/fee|tax|bank/iu, 'banknote'],
];

/**
 * The glyph a category's name suggests, or the tag glyph. MONEY THAT COMES IN, where the category says so by its own way
 * (`ledger.ts`'s `way`), and that no word here names, is drawn as earnings with the briefcase: what a person is paid is
 * theirs to call it, and the app spells no kind of pay of its own.
 */
export function glyphByName(name: string, income = false): string {
  for (const [re, g] of BY_NAME) if (re.test(name)) return g;
  return income ? 'briefcase' : 'tag';
}

const SLOTS = new Set(['pink', 'violet', 'blue', 'teal', 'yellow', 'lime', 'sky', 'slate']);

/** A category's chip: its own glyph and colour where it holds them, else the ones its name suggests. */
export function categoryLook(name: string, held?: { icon?: string | null; colour?: string | null; income?: boolean } | null): Look {
  const icon = held?.icon && /^[a-z]+(?:-[a-z]+)*$/u.test(held.icon) ? held.icon : glyphByName(name, held?.income === true);
  const colour = held?.colour && SLOTS.has(held.colour) ? held.colour : wordSlot(name);
  return { glyph: icon, slot: colour };
}

/** An account's chip, by its type where the record says it, else by its name. Accounts wear the quiet fill. */
export function accountLook(name: string, kind?: string | null): Look {
  const k = (kind ?? '').toLowerCase();
  const n = name.toLowerCase();
  if (k === 'card' || /card|visa|master|amex/u.test(n)) return { glyph: 'credit-card', slot: 'violet' };
  if (k === 'cash' || /\bcash\b|wallet/u.test(n)) return { glyph: 'wallet', slot: 'lime' };
  if (/saving/u.test(n)) return { glyph: 'piggy-bank', slot: 'teal' };
  if (/stripe|paypal|wise|payout|available/u.test(n)) return { glyph: 'banknote', slot: 'sky' };
  return { glyph: 'landmark', slot: 'blue' };
}
