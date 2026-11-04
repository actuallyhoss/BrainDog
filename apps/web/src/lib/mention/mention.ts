/**
 * @ in a sentence, as Slack and Discord have it: the arithmetic, with no page in it.
 *
 * THE FIELD HOLDS ONE STRING AND A LIST OF SPANS. A mention is `@Name` in the text itself and a span saying which row
 * those letters are, so the browser keeps doing everything a text field does (IME, undo, spellcheck, selection, right to
 * left) and nothing here has to. Every edit moves the spans after it; an edit that lands inside one lets it go, and
 * whatever letters are left are plain words. Deleting a mention's text is what drops its row.
 *
 * WHAT IS SENT drops the @: the sentence reads as a sentence to the model and in a conversation's title, and each
 * mention is an offset into that sentence (`sentOf`), so the bubble can draw it again.
 */

/** A mention in the field: which letters of the text, and the row they are. */
export type Mention = { start: number; end: number; ref: string; label: string };

/** A mention in a sent sentence: `len` letters at `at` name `ref`. No @ in those letters. */
export type SentMention = { at: number; len: number; ref: string };

/** The @ word under the caret: where its @ is, and the letters between it and the caret. */
export type Trigger = { start: number; q: string };

/** One edit to the text: `from` to `oldTo` in the old string became `from` to `newTo` in the new one. */
export type Edit = { from: number; oldTo: number; newTo: number };

export type Piece = { kind: 'text' | 'token' | 'at'; text: string };

/** The longest name drawn in a sentence. A row's whole title can be a paragraph. */
const LABEL_MOST = 80;
/** How far back from the caret an @ is looked for, and how many words a name being typed may run to. */
const REACH = 48;
const WORDS_MOST = 4;

const blank = (ch: string | undefined): boolean => ch !== undefined && /\s/u.test(ch);

/** A row's name as a mention says it: one line, and not a paragraph. */
export function labelOf(title: string): string {
  const one = title.replace(/\s+/gu, ' ').trim();
  return one.length <= LABEL_MOST ? one : `${one.slice(0, LABEL_MOST - 1).trimEnd()}…`;
}

export const tokenOf = (label: string): string => `@${label}`;

/**
 * THE @ WORD UNDER THE CARET. An @ counts at the start of the text or after a space, so an address typed in a sentence
 * opens nothing. Letters may hold a space, since names do ("@ada vi"), and a second @ ("@ada@vine.co"). An @ that is
 * already a mention is not one to answer.
 */
export function triggerAt(text: string, caret: number, spans: readonly Mention[]): Trigger | null {
  for (let i = caret - 1; i >= 0 && caret - i <= REACH; i--) {
    const ch = text[i];
    if (ch === '\n') return null;
    if (spans.some((s) => s.start < caret && s.end > i)) return null;
    if (ch === '@' && (i === 0 || blank(text[i - 1]))) {
      const q = text.slice(i + 1, caret);
      if (blank(q[0]) || q.split(' ').length > WORDS_MOST) return null;
      return { start: i, q };
    }
  }
  return null;
}

/**
 * WHAT ONE EDIT CHANGED, anchored on the caret and not guessed from the letters: typing an @ just before "@Ann" gives
 * "@@Ann", where a plain prefix would call it a letter inside the mention. All that follows the caret came through the
 * edit whole, and of what comes before it only the part that still matches.
 */
export function editOf(was: string, now: string, caret: number): Edit {
  let tail = Math.max(0, now.length - caret);
  const most = Math.min(tail, was.length);
  let same = 0;
  while (same < most && was[was.length - 1 - same] === now[now.length - 1 - same]) same++;
  tail = same;
  const room = Math.min(was.length - tail, now.length - tail);
  let from = 0;
  while (from < room && was[from] === now[from]) from++;
  return { from, oldTo: was.length - tail, newTo: now.length - tail };
}

/** The spans after an edit: those before it stay, those after it move, and any it touched inside are let go. */
export function shifted(spans: readonly Mention[], e: Edit): Mention[] {
  const by = e.newTo - e.oldTo;
  return spans.flatMap((s) => {
    if (s.end <= e.from) return [s];
    if (s.start >= e.oldTo) return [{ ...s, start: s.start + by, end: s.end + by }];
    return [];
  });
}

/** The spans whose letters are still in the text where they say. A text changed from outside keeps only those. */
export function stillThere(text: string, spans: readonly Mention[]): Mention[] {
  return spans.filter((s) => text.slice(s.start, s.end) === tokenOf(s.label));
}

/**
 * THE MENTIONS THIS DRAFT HAS HAD, FOUND AGAIN IN ITS TEXT. Undo brings back a mention's letters and paste can too,
 * neither of which says what they were, so those are read by what this draft has already called them. A whole word only:
 * "@Kiln" does not catch "@Kilnworks".
 */
export function foundAgain(text: string, known: Iterable<Mention>, spans: readonly Mention[]): Mention[] {
  const out = [...spans];
  const byLength = [...known].sort((a, b) => b.label.length - a.label.length);
  for (const k of byLength) {
    const token = tokenOf(k.label);
    for (let i = text.indexOf(token); i !== -1; i = text.indexOf(token, i + 1)) {
      const end = i + token.length;
      const opens = i === 0 || blank(text[i - 1]);
      const closes = end === text.length || !/[\p{L}\p{N}]/u.test(text[end]!);
      if (opens && closes && !out.some((s) => s.start < end && s.end > i)) out.push({ ...k, start: i, end });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

export const endingAt = (spans: readonly Mention[], at: number): Mention | undefined => spans.find((s) => s.end === at);
export const startingAt = (spans: readonly Mention[], at: number): Mention | undefined => spans.find((s) => s.start === at);

/**
 * A MENTION IS ONE THING TO THE CARET. A caret set inside one goes to the end it came from the far side of, or the nearer
 * end when it did not come from either (a click), and a selection with an edge inside one takes in all of it. `null`
 * when the selection is already fine.
 */
export function snapped(spans: readonly Mention[], start: number, end: number, cameFrom: number): { start: number; end: number } | null {
  const inside = (at: number): Mention | undefined => spans.find((s) => s.start < at && s.end > at);
  if (start === end) {
    const s = inside(start);
    if (!s) return null;
    let to: number;
    if (cameFrom <= s.start) to = s.end;
    else if (cameFrom >= s.end) to = s.start;
    else to = start - s.start < s.end - start ? s.start : s.end;
    return { start: to, end: to };
  }
  const a = inside(start);
  const b = inside(end);
  if (!a && !b) return null;
  return { start: a ? a.start : start, end: b ? b.end : end };
}

/** The text as the mirror draws it: plain words, each mention, and the @ the list hangs from. */
export function piecesOf(text: string, spans: readonly Mention[], at: number | null): Piece[] {
  const out: Piece[] = [];
  const plain = (from: number, to: number): void => {
    if (to <= from) return;
    if (at !== null && at >= from && at < to) {
      if (at > from) out.push({ kind: 'text', text: text.slice(from, at) });
      out.push({ kind: 'at', text: '@' });
      if (to > at + 1) out.push({ kind: 'text', text: text.slice(at + 1, to) });
      return;
    }
    out.push({ kind: 'text', text: text.slice(from, to) });
  };
  let from = 0;
  for (const s of spans) {
    plain(from, s.start);
    out.push({ kind: 'token', text: text.slice(s.start, s.end) });
    from = s.end;
  }
  plain(from, text.length);
  return out;
}

/** The sentence as it is sent: each mention's name in place with no @, the spaces at its ends gone, and where each one is. */
export function sentOf(text: string, spans: readonly Mention[]): { text: string; mentions: SentMention[] } {
  let out = '';
  let from = 0;
  const marks: SentMention[] = [];
  for (const s of spans) {
    out += text.slice(from, s.start);
    marks.push({ at: out.length, len: s.label.length, ref: s.ref });
    out += s.label;
    from = s.end;
  }
  out += text.slice(from);
  const lead = out.length - out.trimStart().length;
  const said = out.trim();
  return { text: said, mentions: marks.map((m) => ({ ...m, at: m.at - lead })).filter((m) => m.at >= 0 && m.at + m.len <= said.length) };
}

/** A sent sentence in pieces for its bubble. A mark that does not fit the words is no mark: the words are still right. */
export function sentPieces(text: string, mentions: readonly SentMention[] | undefined): ({ kind: 'text'; text: string } | { kind: 'mention'; text: string; ref: string })[] {
  const out: ({ kind: 'text'; text: string } | { kind: 'mention'; text: string; ref: string })[] = [];
  let from = 0;
  for (const m of [...(mentions ?? [])].sort((a, b) => a.at - b.at)) {
    if (m.at < from || m.len <= 0 || m.at + m.len > text.length) continue;
    if (m.at > from) out.push({ kind: 'text', text: text.slice(from, m.at) });
    out.push({ kind: 'mention', text: text.slice(m.at, m.at + m.len), ref: m.ref });
    from = m.at + m.len;
  }
  if (from < text.length) out.push({ kind: 'text', text: text.slice(from) });
  return out;
}
