/**
 * `project`: parts of a project's own shape on the page about its row (C28, C29, 24 October): its hero, its path and
 * its money, its work and who is on it, what it runs on and the agents on it.
 *
 * THE PAGE DECLARES THE PARTS, the host draws them. They were drawn by hand above the declared blocks of every
 * project's page, so a page pulled as text did not say they were there, and nobody could move, hide or change one. They
 * are blocks now, `{ kind: project, parts: [path, money] }`, each its parts in the order they are drawn, laid where the
 * page puts it and hidden as any block is.
 *
 * PARTS AND NOT A PART A BLOCK, because a page holds at most 24 blocks (`06 §1.1`) and shows six tiles before it folds,
 * and a founder's project page was already at the ceiling: one part, or several side by side, the way the shape laid
 * them.
 *
 * THE KIND READS NOTHING. What a part draws is answered for the row the page is about by the record, beside the
 * page's blocks, when the page is asked with `shape` (`packages/record/src/project-shape.ts`): the project's row, its
 * history, its links, its work, its runs, its key number and its money. The block's answer is the block and its
 * `when:`. A host that does not draw the parts draws nothing for them.
 *
 * A BARE BLOCK INSTALLS AND IS REFUSED WHEN IT IS READ, as every kind is (`kinds/listed.ts`): whether a key is required
 * is not decided at install. A part the shape does not have is refused at both.
 *
 * A LEAF: nothing of the kernel is imported at run time, for the reason `kinds/listed.ts` gives.
 */

import type { Refusal } from '@braindog/ports';

import type { KindModule } from './index.ts';
import { KIND_KEYS } from './keys.ts';
import { invalid } from './listed.ts';

/** The parts of a project's shape, in the order its page lays them. */
export const PROJECT_PARTS = ['hero', 'path', 'money', 'what-is-open', 'who-is-on-it', 'runs-on', 'agents-here'] as const;
export type ProjectPart = (typeof PROJECT_PARTS)[number];

/* WHAT A PROJECT BLOCK DOES NOTHING WITH: it reads no list and writes no rows out, so a source, rows or columns would be drawn
   without. */
const UNREAD = ['source', 'authored', 'columns', 'where', 'order', 'limit', 'body'] as const;

const SAID = `parts: is what of the project's shape the block draws, one or more of ${PROJECT_PARTS.join(', ')}, such as parts: [path, money].`;

function partsFault(parts: unknown): Refusal | null {
  if (!Array.isArray(parts) || parts.length === 0) return invalid(SAID, 'parts', PROJECT_PARTS);
  const seen = new Set<string>();
  for (const part of parts) {
    if (typeof part !== 'string' || !(PROJECT_PARTS as readonly string[]).includes(part)) return invalid(SAID, 'parts', PROJECT_PARTS);
    if (seen.has(part)) return invalid(`${part} is named twice in parts:, and a part of the shape is drawn once.`, 'parts');
    seen.add(part);
  }
  return null;
}

export const project: KindModule = {
  keys: KIND_KEYS.project,

  validate(block, ctx) {
    for (const key of UNREAD)
      if (Object.hasOwn(block, key) && block[key] !== undefined)
        return invalid(`A project block is parts of the project's shape, read for the row its page is about, and does nothing with ${key}:. Take it off.`, key);
    if (block.parts === undefined) return ctx.stage === 'read' ? invalid(SAID, 'parts', PROJECT_PARTS) : null;
    return partsFault(block.parts);
  },

  read(_deps, _block, base) {
    return base;
  },
};
