/**
 * The fault each seed plants on a page it has opened (`RULES` in `../layout.mjs` names them). The heading and the
 * short control live beside the rules they prove; the cap and the hidden panel are one style each and are written here.
 */

import { seedHeading } from './overflow.mjs';
import { seedTarget } from './target.mjs';

/* WHAT EACH SEED DOES TO A PAGE IT HAS OPENED. `layout-settle` is not here: its fault has to be in place before the
   page loads, so it is planted on the context (`takeMark`). */
const PLANT = {
  'layout-overflow': seedHeading,
  'layout-site': seedHeading,
  'layout-target': (page) => seedTarget(page, '30px', '30px'),
  'layout-target-edge': (page) => seedTarget(page, '43px', '44px'),
  'layout-full': (page) => page.addStyleTag({ content: '#main{max-inline-size:60% !important}' }),
  'layout-dock': (page) => page.addStyleTag({ content: 'dialog.dock{display:none !important}' }),
};
export const plant = async (page, s) => {
  if (s && Object.hasOwn(PLANT, s.id)) await PLANT[s.id](page);
};
