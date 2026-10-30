/**
 * Today as a phone asks it: without the widgets its board hides (F13, 30 Oct).
 *
 * THE PHONE ASKED FOR WHAT IT NEVER DRAWS. Today's body declares every widget, and the phone's arrangement hides four of
 * them (the key numbers, the projects, the people, what arrived: `phoneOf` in `default-home.ts`). The record drew all
 * four anyway, and the projects' cards brought their late work, runs and key numbers beside them: on his record that
 * was 225 KB of the 247 KB answer and about a third of the record's time, on the one read a cold phone open waits for.
 *
 * SO A PHONE ASKS THE BODY WITHOUT THEM, and each comes back as a widget with nothing drawn (`leftBlock`), so the board
 * still knows it is there (its place on the laptop, the phone's tray of hidden widgets). Whatever needs them drawn (the
 * board on a wider screen, the editor) reads Today again whole (`Home.svelte`, `phoneOnly`).
 *
 * PURE, AND NODE LOADS IT. No rune, no `$lib`.
 */

/** A block as the body declares it: what this module reads of one. */
type Declared = { kind: string; key?: string | undefined; size?: unknown };
/** A body as Today declares it: its blocks and the phone's arrangement. */
type Body<B extends Declared> = { blocks: B[]; phone?: { order?: string[]; sizes?: Record<string, unknown>; hidden?: string[] } | undefined };

/**
 * The body a phone asks for, and the blocks it leaves out: every widget its arrangement hides, and the phone's arrangement
 * held to the widgets still asked for (the record refuses one that names a widget the body does not hold).
 */
export function phoneAsk<T extends Body<Declared>>(body: T): { asked: T; left: T['blocks'][number][] } {
  type B = T['blocks'][number];
  const hidden = new Set(body.phone?.hidden ?? []);
  const isLeft = (b: B): boolean => typeof b.key === 'string' && b.key !== '' && b.size !== undefined && hidden.has(b.key);
  const left = body.blocks.filter(isLeft);
  if (left.length === 0 || !body.phone) return { asked: body, left: [] };
  const gone = new Set(left.map((b) => b.key as string));
  const keep = (k: string): boolean => !gone.has(k);
  const phone = body.phone;
  const asked = {
    ...body,
    blocks: body.blocks.filter((b) => !isLeft(b)),
    phone: {
      ...phone,
      ...(phone.order ? { order: phone.order.filter(keep) } : {}),
      ...(phone.sizes ? { sizes: Object.fromEntries(Object.entries(phone.sizes).filter(([k]) => keep(k))) } : {}),
      hidden: (phone.hidden ?? []).filter(keep),
    },
  };
  return { asked, left };
}

/** A block left out of the ask, as the board reads it: declared, with nothing drawn. */
export function leftBlock<B extends Declared>(b: B, now: number) {
  return { ...b, rows: [], columns: [], entries: [], matched: [], refusals: [], shown: 0, total: 0, drawn: false, stale_at: new Date(now).toISOString() };
}

/**
 * The record's blocks for the body it was asked, with each block left out put back where the body declares it. The
 * record answers one block for each block asked, in order; an answer of another length has the left ones put at its end.
 */
export function withLeft<D, B extends Declared>(drawn: readonly D[], body: readonly B[], left: readonly B[], made: (b: B) => D): D[] {
  if (left.length === 0) return [...drawn];
  const out: D[] = [];
  if (drawn.length !== body.length - left.length) return [...drawn, ...left.map(made)];
  let i = 0;
  for (const b of body) out.push(left.includes(b) ? made(b) : drawn[i++]!);
  return out;
}
