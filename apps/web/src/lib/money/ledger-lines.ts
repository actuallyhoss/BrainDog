/**
 * LEDGER LINES IN THE LEDGER VIEW SAY WHO WAS PAID AS WORDS, as the cards beside them and Money's Ledger do
 * (`timelineTitle`). Tax set aside's "Payments this year" and Receipts' tables, switched from Cards to Ledger, drew
 * "RAVENSWORTH LTD INV 2026-038" and "PAPERHAUS SUPPLIES" where the cards said "Ravensworth Ltd" and "Paperhaus
 * Supplies". Only the columns the cards take a line's name from (`LedgerCards.svelte` `cardsOf`, its `title`); every
 * other cell is as the record wrote it, and the entry's "As the bank wrote it" keeps the bank's own line.
 *
 * PURE, so `node --test` reads it.
 */

import { timelineTitle, type TableRow } from 'braindog-render';

/** A link's text and its address, when the whole cell is one link. */
const LINK = /^\[([^\]]*)\]\(([^)]*)\)$/u;

/** One title cell as words: a bank's capitals said as the Ledger says them, a link's text likewise and its address kept. */
export function titleSaid(cell: string | null): string | null {
  if (cell === null) return null;
  const text = cell.trim();
  if (text === '') return cell;
  const link = LINK.exec(text);
  if (link) {
    const said = timelineTitle(link[1]);
    return said === '' || /[[\]]/u.test(said) ? cell : `[${said}](${link[2]})`;
  }
  return timelineTitle(text) || cell;
}

/** The rows with the cells at `titles` said as words; a row whose cells say the same is handed back as it was. */
export function linesSaid(rows: readonly TableRow[], titles: readonly number[]): TableRow[] {
  return rows.map((r) => {
    let cells: (string | null)[] | null = null;
    for (const i of titles) {
      const was = r.cells[i];
      if (was === undefined) continue;
      const now = titleSaid(was);
      if (now === was) continue;
      cells ??= [...r.cells];
      cells[i] = now;
    }
    return cells === null ? r : { ...r, cells };
  });
}
