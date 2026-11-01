/**
 * SLASH'S TWO LINES ABOUT A PAGE: "Make ..." goes to the composer, "Change ..." to Change this.
 *
 * THE PALETTE ONLY CARRIES THE LINE. It goes to the page in the address (`?make=` or `?change=`), the way a new page's
 * `?describe=1` does, so the page that owns the draft or the block does the work and a reload or Back never repeats it.
 * PURE, so `slash-entry.test.ts` holds it in Node.
 */

export type SlashLine = { verb: 'make' | 'change'; line: string };

export const slashEntryWords = {
  make: (line: string) => `Make: ${line}`,
  change: (line: string) => `Change: ${line}`,
  which: 'Which block? Open its menu and pick Change this. Your words are kept for it.',
};

/** The window event a block's menu listens for, carrying the block's key and the line. */
export const CHANGE_EVENT = 'braindog:change-block';

/** A line that opens with Make or Change and says something after it; anything else is an ordinary query. */
export function slashLine(text: string): SlashLine | null {
  const m = /^(make|change)\s+(\S.*)$/iu.exec(text.trim());
  if (!m) return null;
  return { verb: m[1]!.toLowerCase() === 'make' ? 'make' : 'change', line: m[2]!.trim() };
}

/**
 * A LINE THAT CHANGES THE PAGE WITHOUT SAYING "CHANGE" (`say-page.ts`): "move Bills up", "hide the forecast", "add a chart
 * of spend by month", "rename this list to Clients", "show only open ones", "newest first", "top 5". Read as a change of
 * the page the person is on; the palette offers it only where no other row (a nav hide, a rename of a place) took it.
 */
const SAYS = /^(?:move|put .+ (?:first|last|up|down|above|below)|bring|hide|unhide|take .+ off|remove|drop|rename|retitle|call this|show (?:only|just|me only)|only|just the|newest first|oldest first|latest first|biggest first|top \d|first \d|sort by|order by|add (?:a|an|the|some)\s+(?:[\w-]+\s+){0,3}?(?:chart|graph|bars?|line|ring|pie|calendar|board|timeline|table|figure|breakdown|heat ?map)|show .+ again|bring back)\b/iu;

export function sayLine(text: string): SlashLine | null {
  const t = text.trim();
  return t.length > 3 && SAYS.test(t) ? { verb: 'change', line: t } : null;
}

/** The window event a page's ⋯ menu listens for, carrying a line about the whole page: no block was in focus. */
export const CHANGE_PAGE_EVENT = 'braindog:change-page';

/** Where the line goes: the page the person is on, or Today (`/`) for a make with none. A change needs a page. */
export function entryHref(entry: SlashLine, here: string | null): string | null {
  if (entry.verb === 'change' && here === null) return null;
  return `${here ?? '/'}?${entry.verb}=${encodeURIComponent(entry.line)}`;
}

/** What an address asks for, or null. */
export function askedIn(search: string): SlashLine | null {
  const q = new URLSearchParams(search);
  for (const verb of ['make', 'change'] as const) {
    const line = q.get(verb)?.trim();
    if (line) return { verb, line };
  }
  return null;
}

/** The same address with the line taken out, every other part kept. */
export function withoutEntry(url: { pathname: string; search: string; hash: string }): string {
  const q = new URLSearchParams(url.search);
  q.delete('make');
  q.delete('change');
  const rest = q.toString();
  return `${url.pathname}${rest === '' ? '' : `?${rest}`}${url.hash}`;
}

/** The key of the block that holds `el`, as a block's slot carries it. */
export function keyInFocus(el: { closest(selector: string): { getAttribute(name: string): string | null } | null } | null): string | null {
  const slot = el?.closest('.block-slot[data-key]');
  return slot?.getAttribute('data-key') ?? null;
}

/* A "Change ..." line with no block in focus waits here for the next Change this a person opens. */
let held = '';
export const holdLine = (line: string): void => void (held = line);
export function takeLine(): string {
  const was = held;
  held = '';
  return was;
}
