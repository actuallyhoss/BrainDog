/**
 * `most`: HOW MANY OF A REPEATING BLOCK ARE DRAWN BEFORE THE REST WAIT BEHIND "Show all N" (a page
 * shows less rather than more). A block of fourteen cards drew all fourteen down a page; it draws six now, and the app opens
 * the rest in place while the export says how many it left out. One answer for both drawers, so `Cards.svelte` and
 * `html.ts` cut at the same card and the parity test holds them to one tree.
 *
 * SIX BY DEFAULT FOR CARDS, the block's own `most` (1 to 24) where it carries one, and NEVER for grouped cards, which
 * fold group by group already (`CARD_FOLD` in the kernel), or for a block drawn in a panel, which is opened to read all
 * of it. A kind with no default (`series`) is cut only where its block says `most`.
 *
 * THE KEYS ARE THE PAGE READ'S, laid on the drawn block beside its rows as `weeks` is: a fence an author typed has none,
 * so a typed block of cards takes the default.
 */

/** What a block may carry that decides its cut: its own `most`, the field it is grouped by, and whether a panel draws it. */
export type MostKeys = { most?: number | undefined; group?: string | boolean | undefined; panel?: boolean | undefined };

/** The cards drawn before the rest wait, where a block says nothing. */
export const MOST_CARDS = 6;
/** The least and the most a block's own `most` may say: one card, and four rows of six. */
export const MOST_LEAST = 1;
export const MOST_MOST = 24;

/** The kinds a default cut applies to, and the kinds a block's own `most` is read on. */
const DEFAULTS: Readonly<Record<string, number>> = { cards: MOST_CARDS };
const READS: ReadonlySet<string> = new Set(['cards', 'series']);

/** Whether `n` is a `most` a block may say: a whole number from `MOST_LEAST` to `MOST_MOST`. */
export const isMost = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= MOST_LEAST && n <= MOST_MOST;

/**
 * Of `count` drawn things, how many are `shown` and how many wait (`more`). A block that is not cut shows all of them.
 * A `most` outside 1 to 24 is not the block's to say (the declaration refuses it), so the default stands.
 */
export function mostOf(block: { kind: string } & MostKeys, count: number): { shown: number; more: number } {
  const all = { shown: Math.max(0, count), more: 0 };
  if (!READS.has(block.kind) || block.panel === true || (block.group !== undefined && block.group !== false && block.group !== '')) return all;
  const most = isMost(block.most) ? block.most : DEFAULTS[block.kind];
  /* ONE MORE IS SHOWN, NOT HELD BACK (the lists review, L29): People's seven drew six and "Show all 7", a button for
     one card in the room the card takes. */
  if (most === undefined || count <= most + 1) return all;
  return { shown: most, more: count - most };
}

/** The app's button, which opens the rest in place: "Show all 14". */
export const showAllSaid = (total: number): string => `Show all ${total}`;
/** The export's line, which has nothing to press: "and 8 more". */
export const moreSaid = (more: number): string => `and ${more} more`;
