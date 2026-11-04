/**
 * WHAT SLASH SAID, AS BLOCKS, so an answer's lists are lists and never a column of typed dashes. Every answer goes through
 * this, whoever wrote it: the model, or the reads that answer with no model at all.
 *
 *   A line starting "- ", "* " or "• " is an item, and "1. " or "1) " an item of a numbered list.
 *   A line indented under an item is that item's own, drawn quieter under it.
 *   A short line directly above a list names the list.
 *   Anything else is words, and a blank line ends them.
 *
 * Read again as the words stream, so it takes any prefix of an answer and never throws. PURE.
 */

export type AnswerItem = { text: string; under: string[] };
export type AnswerBlock =
  | { kind: 'words'; text: string }
  | { kind: 'label'; text: string }
  | { kind: 'list'; ordered: boolean; start: number; items: AnswerItem[] };

const BULLET = /^[ \t]*[-*•][ \t]+(.*)$/u;
const NUMBERED = /^[ \t]*(\d{1,3})[.)][ \t]+(.*)$/u;
const UNDER = /^[ \t]+(\S.*)$/u;
/** A line this short with no sentence's end, directly above a list, names it rather than says something. */
const LABEL_MOST = 48;
const SENTENCE_END = /[.?!,;]$/u;

export function blocksOf(said: string): AnswerBlock[] {
  const out: AnswerBlock[] = [];
  /* WHAT THE NEXT LINE CAN JOIN. A blank line leaves nothing open, though a list can still go on past one. */
  let open: 'words' | 'list' | null = null;
  const item = (ordered: boolean, start: number, text: string): 'list' => {
    const last = out.at(-1);
    if (last?.kind === 'list' && last.ordered === ordered) {
      last.items.push({ text, under: [] });
    } else {
      if (open === 'words' && last?.kind === 'words' && !last.text.includes('\n') && last.text.length <= LABEL_MOST && !SENTENCE_END.test(last.text)) {
        out[out.length - 1] = { kind: 'label', text: last.text.replace(/:$/u, '') };
      }
      out.push({ kind: 'list', ordered, start, items: [{ text, under: [] }] });
    }
    return 'list';
  };
  for (const line of said.split('\n')) {
    const bullet = BULLET.exec(line);
    const numbered = bullet === null ? NUMBERED.exec(line) : null;
    if (line.trim() === '') {
      open = null;
    } else if (bullet !== null) {
      open = item(false, 1, bullet[1]!.trim());
    } else if (numbered !== null) {
      open = item(true, Number(numbered[1]), numbered[2]!.trim());
    } else {
      const last = out.at(-1);
      const under = open === 'list' && last?.kind === 'list' ? UNDER.exec(line) : null;
      if (under !== null && last?.kind === 'list') {
        last.items.at(-1)!.under.push(under[1]!.trim());
      } else if (open === 'words' && last?.kind === 'words') {
        last.text += `\n${line.trim()}`;
      } else {
        out.push({ kind: 'words', text: line.trim() });
        open = 'words';
      }
    }
  }
  return out;
}
