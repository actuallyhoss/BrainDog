/**
 * One ordered list of pages, grouped by the section each declares.
 *
 * ONE FUNCTION FOR BOTH NAVS. The rail and the phone's More sheet are the same query over `page`
 * rows and were two different shapes — which is how the sheet came to render the declared pages and
 * not the registers under them, leaving a phone with no route to any list at all. Two copies of a
 * grouping is two places for the shapes to drift again.
 *
 * IT IS ITS OWN MODULE because the shell imports it, and the shell's entry chunk is what every
 * screen waits for: `record/api.ts` carries the whole synthetic record and pulling it in here is the
 * mistake `+layout.ts` already has a paragraph about.
 */
/* NOT EXPORTED. Both callers want the ORDER as well as the grouping, and a bare `group` beside an
   `arrange` is an invitation to reach for the one that skips the reader's arrangement — which is
   exactly the mistake that left the phone's More sheet ignoring an order the rail honoured. */
function group<T extends { section: string }>(entries: readonly T[]): [string, T[]][] {
  const out = new Map<string, T[]>();
  for (const e of entries) {
    const at = out.get(e.section);
    if (at) at.push(e);
    else out.set(e.section, [e]);
  }
  return [...out];
}

/**
 * The nav in the order it is drawn: declared order inside each section, then the reader's own.
 *
 * TWO BUGS MET HERE AND EACH HID THE OTHER.
 *
 * `order` IS SCOPED TO A SECTION, and the rail sorted the flat list by it globally. Measured on the
 * seeded record: the declared list runs `Money:10 Estate:10 Work:10 Projects:10 Projects:11
 * Projects:12 Tracks:10 Tracks:11 Tracks:12`, and a global sort turns that into `… Projects:10
 * Tracks:10 Projects:11 Tracks:11 …` — two sections interleaved. Nothing on screen showed it,
 * because the sorted list was never rendered; it was only ever the list a MOVE was computed against,
 * so pressing Move up stored a sequence the reader had never seen.
 *
 * AND THE ARRANGEMENT NEVER REACHED THE DOM. The rail rendered `group(nav)` — the raw list — while
 * the ordering lived in a `$derived` read by nothing but the two move functions. So the preference
 * was written, survived a reload, and moved nothing, on a component whose own header says
 * *"position lives in a per-user store and wins"*.
 *
 * WITHIN A SECTION, NEVER ACROSS ONE. A section is a heading a page declares; moving an item out of
 * it would put a page under a title that is not its own. Sorting per bucket is also what makes the
 * flat list section-contiguous, which is what lets a move find its neighbour by walking one step.
 */
export function arrange<T extends { section: string; href: string; order: number }>(
  entries: readonly T[],
  arrangement: readonly string[],
): [string, T[]][] {
  const rank = new Map(arrangement.map((href, i) => [href, i]));
  return group(entries).map(([section, list]) => [
    section,
    list
      .map((e, i) => ({ e, at: rank.get(e.href) ?? Number.MAX_SAFE_INTEGER, i }))
      /* The reader's order first, then the declaration's, then arrival — so an entry the
         arrangement does not name keeps the place the record gave it rather than falling to the
         end, and a page a pack adds tomorrow appears where its declaration asked. */
      .sort((a, b) => a.at - b.at || a.e.order - b.e.order || a.i - b.i)
      .map((x) => x.e),
  ]);
}
