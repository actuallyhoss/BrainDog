/**
 * A FOLDED GROUP OPENS WHERE IT IS (`BlockSlot.svelte`). A card block that says `group:` and `fold:` (People on a page)
 * shows each organisation's most recent person under its name and folds the rest behind "Show all 5 people at Encore".
 * That line went to the organisation's page, so reading the fourth person meant leaving the page you were on. It is now
 * a press that opens the group in place, and the organisation's name over it is still the door to its page.
 *
 * TWO DRAWINGS OF ONE BLOCK, AND NO SECOND READING OF THE RECORD. `draw` (`record/blocks.ts`) answers the block folded,
 * and the same block with `fold: false` answers every group open; both come from the same rows in the same order, so a
 * group stands at the same place in each. This walks them side by side: whatever is the same in both is kept, and where
 * they part it is a group's cards, folded in one and whole in the other, then the folded one's line to the rest. A group
 * opened here takes its whole cards and drops that line; a group still folded keeps its cards and its line becomes the
 * press.
 *
 * A GROUP IS KNOWN BY WHERE ITS REST OPENED (`/r/organisations/3`), which names its organisation and not its place on
 * the page, so a group opened stays open while the page is read again and the people in it move. A walk that does not
 * line up (a build of `draw` that folds some other way) answers `null`, and the block is drawn as `draw` answered it,
 * with its links.
 *
 * PURE, AND NODE LOADS IT: no import at all.
 */

/** The two shapes of segment this reads, as `braindog-render`'s `parse` answers them. */
type Seg = { type: string; text?: string };

/** One thing to draw: a segment as it stands, or the press that opens one group, with the words its line said. */
export type Opening<S> = { kind: 'segment'; segment: S } | { kind: 'open'; group: string; label: string };

/* THE LINE TO A GROUP'S REST, as `groupedSegments` writes it: its words as a link, and nothing else on the line. */
const REST = /^\[([^\]]+)\]\((\/[^)\s]+)\)$/u;

/** A segment's line to the rest of a group, as its words and where it went, or `null` for any other segment. */
export function restOf(s: Seg): { label: string; group: string } | null {
  if (s.type !== 'markdown' || typeof s.text !== 'string') return null;
  const m = REST.exec(s.text.trim());
  return m ? { label: m[1]!.trim(), group: m[2]! } : null;
}

/* THE SAME SEGMENT IN BOTH DRAWINGS. Each is plain data the parser built from the same text, so their JSON is equal. */
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * THE BLOCK AS IT IS DRAWN, from its folded drawing, its open one and the groups opened (by `group`), or `null` where the
 * two do not line up.
 */
export function openInPlace<S extends Seg>(folded: readonly S[], open: readonly S[], opened: ReadonlySet<string>): Opening<S>[] | null {
  const out: Opening<S>[] = [];
  let j = 0;
  for (let i = 0; i < folded.length; i++) {
    const f = folded[i]!;
    const o = open[j];
    if (o !== undefined && same(f, o)) {
      out.push({ kind: 'segment', segment: f });
      j++;
      continue;
    }
    /* WHERE THEY PART: a group's cards, folded here and whole there, and then the folded one's line to its rest. */
    const next = folded[i + 1];
    const rest = next === undefined ? null : restOf(next);
    if (o === undefined || f.type !== 'block' || o.type !== 'block' || rest === null) return null;
    if (opened.has(rest.group)) out.push({ kind: 'segment', segment: o });
    else out.push({ kind: 'segment', segment: f }, { kind: 'open', group: rest.group, label: rest.label });
    i++;
    j++;
  }
  return j === open.length ? out : null;
}
