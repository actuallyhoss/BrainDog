/**
 * THE ORDER TODAY'S DESK IS SEEN IN IS THE ORDER IT IS TABBED IN. The desk's rows are laid on one board (Home's CSS puts
 * each tile in its row), and a keyboard walks the document and not the picture, so the document holds the tiles in the
 * order the picture shows them: what is late, what needs you, who is working, cash; the few key numbers; the record's
 * week; the projects; what landed, what is coming up and a few people.
 *
 * The page's tiles are the reader's (what is late, who is working and the projects among them since C27), and Home's
 * own parts (the foot of Needs you, what landed) are anchored before the first drawn block that comes after them. A part
 * with no block after it follows the reader.
 *
 * PURE, AND NO SVELTE, so `node --test` reads the order as it is written.
 */

/** The rank of each block the desk shows at rest, in the picture's order. Everything else is `REST` and keeps its order. */
const RANKS: Readonly<Record<string, number>> = {
  'needs-you': 1,
  working: 2,
  cash: 3,
  /* THE FEW KEY NUMBERS THAT LEAD, a row of their own under the first: after cash, before the record's week and the
     projects (2.8). */
  numbers: 4,
  'week-due': 5,
  'week-money': 6,
  projects: 7,
  'coming-up': 9,
  faces: 10,
};

/** What a block the desk folds is ranked: after the rest, in the order it was declared. */
export const REST = 30;

/** Home's own parts, with the place each holds among the blocks. */
export type Placed = 'needs' | 'landed';
const PLACES: readonly (readonly [Placed, number])[] = [
  /* THE FOOT OF NEEDS YOU, right under its questions (or the whole tile with none to ask). */
  ['needs', 1],
  ['landed', 8],
];

/** What is late leads the desk, whatever key the page declares it under: it is the late tile (`desk-part.ts`). */
const LATE = 0;

/** A block's place in the picture, by the key it is declared under. */
export const rankOf = (b: { key?: string | undefined; desk?: { kind: string } | undefined }): number =>
  b.desk?.kind === 'late' ? LATE : b.key !== undefined ? (RANKS[b.key] ?? REST) : REST;

/** The blocks in the picture's order. A stable sort: blocks of one rank keep the order they were declared in. */
export function inPicture<B extends { key?: string | undefined }>(blocks: readonly B[]): B[] {
  return blocks
    .map((b, i) => ({ b, i, r: rankOf(b) }))
    .sort((x, y) => x.r - y.r || x.i - y.i)
    .map((x) => x.b);
}

/** Where Home's parts stand: before the block at an index, or (`tail`) after the reader. Each in the picture's order. */
export type Anchors = { at: ReadonlyMap<number, readonly Placed[]>; tail: readonly Placed[] };

/**
 * Each part goes before the first DRAWN block ranked after it; one with none follows the reader, and so does every part
 * where the reader is not drawn (`reader` false). Undrawn blocks are never anchors: they leave no element to stand
 * before.
 */
export function anchorsFor(blocks: readonly { key?: string | undefined; drawn: boolean }[], reader: boolean): Anchors {
  const at = new Map<number, Placed[]>();
  const tail: Placed[] = [];
  for (const [name, rank] of PLACES) {
    const i = reader ? blocks.findIndex((b) => b.drawn && rankOf(b) > rank) : -1;
    if (i < 0) tail.push(name);
    else at.set(i, [...(at.get(i) ?? []), name]);
  }
  return { at, tail };
}
