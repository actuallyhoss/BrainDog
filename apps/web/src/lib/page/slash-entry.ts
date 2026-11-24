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
  page: (title: string) => `Make a page: ${title}`,
  which: 'Which block? Open its menu and pick Change this. Your words are kept for it.',
};

/** The window event a block's menu listens for, carrying the block's key and the line. */
export const CHANGE_EVENT = 'braindog:change-block';

/**
 * A LINE THAT ASKS FOR A NEW PAGE, "make a page that shows my late invoices", with the page's name read out of it and the
 * whole line kept for its describe sheet. MEASURED 24 NOVEMBER (the Slash audit, finding 9): from the bar it went to the
 * conversation, which read the figures and drafted nothing, or to "Make:", which composes a block on the page you are on.
 * A new page is made under the name and opens on its describe sheet with the line in it, drafted at once, with Keep, Try
 * again and Throw away as any page's own Make (`palette/new-page.ts`, `page/change-open.ts`).
 */
export type PageLine = { title: string; line: string };

const PAGE_LINE = /^\s*(?:please\s+)?(?:make|build|create|draft|design|set\s+up|start)\s+(?:me\s+)?(?:a|an|one)?\s*(?:new\s+)?(?:page|dashboard|screen)\b\s*(.*?)\s*[.!?]*$/iu;
/** The words between "a page" and what it shows, which are no part of its name. */
const PAGE_LEAD = /^(?:(?:that|which|to|for|of|showing|shows|show|with|about|listing|lists|list|tracking|tracks|track|where|so|i can see)\s+)+/iu;
const NAMED = /\b(?:called|named|titled)\s+["“']?([^"”']+?)["”']?\s*$/iu;
/** The longest a page's name is made from a line, cut at a word. */
const TITLE_MOST = 40;

export function pageLine(text: string): PageLine | null {
  const m = PAGE_LINE.exec(text);
  if (!m) return null;
  const rest = (m[1] ?? '').trim();
  const named = NAMED.exec(rest)?.[1]?.trim();
  let title = named ?? rest.replace(PAGE_LEAD, '').replace(/^(?:all\s+)?(?:my|our|the)\s+/iu, '').replace(/\s+/gu, ' ').trim();
  if (title.length > TITLE_MOST) title = title.slice(0, TITLE_MOST).replace(/\s+\S*$/u, '');
  if (title === '') return null;
  return { title: `${title.charAt(0).toUpperCase()}${title.slice(1)}`, line: text.trim() };
}

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

/** The window event that opens a page's Change this page sheet with nothing typed: the bar's "Customise this page". */
export const OPEN_CHANGE_EVENT = 'braindog:open-change-page';

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
