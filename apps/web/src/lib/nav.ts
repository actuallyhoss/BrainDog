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
export function group<T extends { section: string }>(entries: readonly T[]): [string, T[]][] {
  const out = new Map<string, T[]>();
  for (const e of entries) {
    const at = out.get(e.section);
    if (at) at.push(e);
    else out.set(e.section, [e]);
  }
  return [...out];
}
