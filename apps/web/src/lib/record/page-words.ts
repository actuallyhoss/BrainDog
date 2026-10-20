/**
 * The words for making a page (PGS-C30), apart from the call that makes one (`page-new.ts`).
 *
 * A FILE OF ITS OWN, because the rail draws the line and its heading on every screen and the call carries the client:
 * the rail imports these words, and `page-new.ts` only when somebody presses Enter in the box.
 */

import { copy } from '../copy/frame.ts';
import { changeWords } from './slash.ts';

/**
 * The words for making a page, kept beside the call they describe, as `retireWords` is, so this module owns them
 * rather than `copy.ts`.
 */
export const pageWords = {
  /** The rail's heading a made page sits under. */
  section: 'Pages',
  newPage: 'New page',
  suggestPage: 'Suggest a page',
  /**
   * The one block a new page holds, until something is added to it.
   *
   * IT NAMES THE WAY THAT IS THERE AT EVERY WIDTH. The note is stored in the page, so it is one sentence for a phone
   * and a wide screen alike, and arranging is drawn from 900px only: it sends the person to the page's menu and the
   * entry there that takes a description, by the name that entry is drawn with.
   */
  empty: `This page is empty. To fill it, open the menu at the top of the page, choose ${changeWords.change}, and say what you want on it.`,
  /**
   * The same block on a page somebody suggested.
   *
   * ITS MAKER HAS NO SUCH ENTRY: the menu offers it to the owner alone (`ChangePage.svelte`), so the note says who can
   * fill the page and where, and reads true to the owner who accepted it as well.
   */
  emptySuggested: `This page is empty. The owner of this BrainDog can fill it from the menu at the top of the page, with ${changeWords.change}.`,
  blank: 'Give the page a name first.',
  long: 'That name is too long for a page. Keep it to 80 characters or fewer.',
  made: (title: string) => `${title} is ready.`,
  suggested: (title: string) => `${title} is waiting in Needs you. It appears once it is accepted there.`,
  question: (title: string) => `Add a page called ${title}?`,
  undone: (title: string) => `${title} was taken back out.`,
  raced: 'A page of that name was made a moment ago. Try again.',
  notReached: copy.writeNotReached,
} as const;
