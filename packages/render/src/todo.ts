/**
 * Which of a `todo` row's cells are the quiet line under its title, decided once for both renderers.
 *
 * ONE PLACE, because the two drawers disagreeing about a blank cell is a difference on every task the
 * product shows: a page's projection pads a two-column todo to the kind's four cells with empty
 * strings, so a drawer that kept a blank would draw an empty line, or a lone dot, under all of them.
 */

/** What sits between the two facts. The same dot a figure in several currencies is written with. */
export const TODO_META_JOIN = ' · ';

/** The most characters a task's title says before the rest of it is drawn quiet (E23). */
export const TITLE_HEAD_MOST = 80;

/**
 * A TASK'S TITLE AS A SHORT NAME AND THE REST QUIET (E23), for both renderers. Work drew whole paragraphs as titles, six
 * lines a task: the first clause is the name, up to the first full stop, colon, semicolon or dash, and at most
 * `TITLE_HEAD_MOST` characters, cut at a space; what follows is drawn after it in the quiet colour. A title holding a
 * link or a marked phrase is left whole, since cutting it could split the mark. `rest` is `''` when there is none.
 */
export function todoTitle(title: string): { head: string; rest: string } {
  const said = title.trim();
  if (said.includes('{{') || said.includes('](') || said.length <= TITLE_HEAD_MOST) return { head: title, rest: '' };
  const clause = /[.:;!?](?=\s)|\s[\u2013\u2014-]\s|\n/u.exec(said);
  let at = clause ? clause.index + (/^[.:;!?]/u.test(clause[0]) ? 1 : 0) : said.length;
  if (at > TITLE_HEAD_MOST) {
    const space = said.lastIndexOf(' ', TITLE_HEAD_MOST);
    at = space > 0 ? space : TITLE_HEAD_MOST;
  }
  const head = said.slice(0, at).trim();
  const rest = said.slice(at).trim();
  return rest === '' || head === '' ? { head: title, rest: '' } : { head, rest };
}

/** The third and fourth cells, the blank ones left out, in the order they were written. */
export const todoMeta = (cells: readonly string[]): string[] => cells.slice(2, 4).filter((c) => c.trim() !== '');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** A day as `format.ts`'s `day` says it, `1 Jul 2026`, standing alone in a cell. */
const SAID_DAY = new RegExp(`^(\\d{1,2}) (${MONTHS.join('|')}) (\\d{4})$`, 'u');
const DAY_MS = 86_400_000;

/**
 * WHEN A TASK FALLS DUE, AS A PERSON SAYS IT (the verifier's H10): "4 days late" in the red phrase, "Today", "Tomorrow",
 * the weekday within six days, and past that the day, without its year in the reader's own year. Work read "30 Aug 2026"
 * in grey for a task Kiln called four days late. A task that is done is never late, so its day is only said. Anything
 * that is not a day standing alone in the cell is left as written. UTC, as `day` writes it.
 */
export function todoDay(text: string, now: number = Date.now(), done = false): string {
  const m = SAID_DAY.exec(text.trim());
  if (!m) return text;
  const at = Date.UTC(Number(m[3]), MONTHS.indexOf(m[2]!), Number(m[1]));
  const n = new Date(now);
  const today = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
  const ahead = Math.round((at - today) / DAY_MS);
  const year = Number(m[3]) === n.getUTCFullYear() ? `${m[1]} ${m[2]}` : text.trim();
  if (done) return year;
  if (ahead < 0) return `{{bad:${-ahead} ${ahead === -1 ? 'day' : 'days'} late}}`;
  if (ahead === 0) return 'Today';
  if (ahead === 1) return 'Tomorrow';
  if (ahead <= 6) return WEEKDAYS[new Date(at).getUTCDay()]!;
  return year;
}

/**
 * A todo row's line under its title, for both renderers: the detail (the second cell) and the quiet line after it.
 *
 * A DAY IN THE SECOND CELL JOINS THE QUIET LINE, first, so a task reads "4 days late · Kiln" on one line where it read
 * "30 Aug 2026" and then "Kiln" under it. Every day is said by `todoDay`.
 */
export function todoLines(cells: readonly string[], now?: number, done = false): { detail: string; meta: string[] } {
  const said = (c: string) => todoDay(c, now, done);
  const second = cells[1] ?? '';
  const meta = todoMeta(cells).map(said);
  if (SAID_DAY.test(second.trim())) return { detail: '', meta: [said(second), ...meta] };
  return { detail: second, meta };
}
