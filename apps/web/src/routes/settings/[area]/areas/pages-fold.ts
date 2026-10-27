/**
 * Settings > Navigation's fold under Add a page, and the order its pages are listed in.
 *
 * THE FOLD SAYS WHAT IT HOLDS BY KIND. A record with a page for every project, person and agent run read "1047 more
 * pages", as if each were a page to add. The pages a row made are said by their list ("Pages of 30 projects, 8 people
 * and every agent run"), and only the pages somebody wrote are counted.
 *
 * NEEDS YOU IS SECOND, as the bar draws it (`tabsOf` in `lib/nav.ts`): the list read Today, the sections, Activity, then
 * Needs you ninth.
 *
 * PLAIN TYPESCRIPT, SO A TEST CAN LOAD IT IN NODE.
 */

import { inSentence, oneOf } from '../../../../lib/voice.ts';

/** One page the fold hides: whether a row made it, and the list that row is in, where the record says. */
export type Folded = { row: boolean; register: string | null };

const pagesOf = (n: number): string => (n === 1 ? '1 more page' : `${n} more pages`);

/** The words for `folded`, against the lists the index names and counts; `''` when nothing is folded. */
export function foldSaid(folded: readonly Folded[], lists: readonly { id: string; name: string; count: number }[]): string {
  const written = folded.filter((f) => !f.row).length;
  const known = new Map(lists.map((l) => [l.id, l] as const));
  const by = new Map<string, number>();
  let others = 0;
  for (const f of folded) {
    if (!f.row) continue;
    if (f.register !== null && known.has(f.register)) by.set(f.register, (by.get(f.register) ?? 0) + 1);
    else others += 1;
  }
  const kinds = [...by.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => {
      const list = known.get(id)!;
      const one = oneOf(list.name) ?? inSentence(list.name.trim());
      if (list.count > 1 && n >= list.count) return `every ${one}`;
      return n === 1 ? `1 ${one}` : `${n} ${inSentence(list.name.trim())}`;
    });
  if (others > 0) kinds.push(others === 1 ? '1 other row' : `${others} other rows`);
  const said = kinds.length === 0 ? '' : kinds.length === 1 ? kinds[0]! : `${kinds.slice(0, -1).join(', ')} and ${kinds.at(-1)!}`;
  if (written > 0 && said !== '') return `${pagesOf(written)}, and pages of ${said}`;
  if (written > 0) return pagesOf(written);
  return said === '' ? '' : `Pages of ${said}`;
}

/** The nav's items with Needs you moved to second, after Today, where the bar draws it. */
export function decideSecond<T extends { key: string }>(main: readonly T[]): T[] {
  const decide = main.find((i) => i.key === 'decide');
  if (!decide || main.length < 2) return [...main];
  const rest = main.filter((i) => i !== decide);
  return [rest[0]!, decide, ...rest.slice(1)];
}
