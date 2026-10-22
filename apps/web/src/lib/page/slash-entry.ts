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
