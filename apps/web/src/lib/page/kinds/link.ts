/**
 * A `link` block, written from the record's answer: `title | url | note` a row, drawn by `braindog-render` as a list
 * of links, each with the host it leaves for under its title (`packages/render/src/links.ts`).
 *
 * OVER A LIST, `columns: [title, url, note?]`: the title and the note are said as every cell says them, and the
 * address is written exactly as the record holds it. AN ADDRESS THAT IS NOT A LINK IS NOT MENDED HERE. The renderer
 * degrades the block with the sentence that says what a link may be, the one feedback an author gets; writing the row
 * as words instead would be this app deciding, on nobody's behalf, that a link which reads wrong is not a link.
 *
 * AUTHORED ROWS are written as they were typed. A link takes no tone, so an authored row's tone is not written.
 */

import { display } from '../../record/api.ts';
import type { KindDrawer } from './index.ts';
import { authoredOf, entriesOf, escapeCell, fenced, fieldsOf, listOf } from './dialect.ts';

export const link: KindDrawer = {
  draw(result, opts) {
    const authored = authoredOf(result);
    if (authored.length) return fenced('link', authored.map((r) => r.cells.slice(0, 3).map(escapeCell).join(' | ')), opts);
    const register = listOf(result);
    const [title = '', url = '', note = ''] = fieldsOf(result);
    if (!register || !title || !url) return fenced('link', [], opts);
    const said = (field: string, v: unknown): string => (field ? (display(register, field, v, opts.now) ?? '') : '');
    const rows = entriesOf(result).map((e) => {
      const address = e.fields[url];
      return [said(title, e.fields[title]), typeof address === 'string' ? address.trim() : '', said(note, e.fields[note])].map(escapeCell).join(' | ');
    });
    return fenced('link', rows, opts);
  },
};
