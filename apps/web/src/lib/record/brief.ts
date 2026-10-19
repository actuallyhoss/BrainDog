/**
 * A short, clean brief out of a row's note: what a person reads about a project must not show what an import left in
 * the note (the old tool's status line, chips fences, template slots, a heading repeating the name, section headings).
 * Pure; never writes a word of its own, so a note with nothing real left gives nothing and the block is left out.
 */

const FENCE = /^\s*(```|~~~)/u;
const SLOT = /\{\{|\}\}/u;
/* Imported words and ids that mean nothing to a reader: a "Status in <tool>" line, an import tag, a `register#12` pointer. */
const LEFTOVER = /^status in [^:]{1,40}:|\b[a-z]+:[a-z]+:[\w-]+|\b[a-z][\w-]*#\d+\b/iu;

/** Plain words out of a line of markdown: no list or quote mark, no emphasis, a link as its text. */
const plain = (line: string): string =>
  line
    .replace(/^\s*(?:[>*+-]|\d+[.)])\s+/u, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/gu, '$1')
    .replace(/[*_`]+/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();

/** The first `most` real sentences of a note, as lines; `name` is the row's own name, never repeated back to it. */
export function briefFromNote(note: string, name = '', most = 2): string[] {
  const own = name.trim().toLowerCase();
  const out: string[] = [];
  let fenced = false;
  for (const raw of note.split(/\r?\n/u)) {
    if (FENCE.test(raw)) {
      fenced = !fenced;
      continue;
    }
    if (fenced || /^\s*#{1,6}\s/u.test(raw) || SLOT.test(raw)) continue;
    const line = plain(raw);
    if (line === '' || line.toLowerCase() === own || LEFTOVER.test(line)) continue;
    for (const s of line.split(/(?<=[.!?])\s+/u)) {
      if (s !== '' && !SLOT.test(s) && !LEFTOVER.test(s)) out.push(s);
    }
    if (out.length >= most) break;
  }
  return out.slice(0, most);
}
