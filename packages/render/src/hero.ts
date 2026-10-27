/**
 * What the lead figure of a `stat lead` says beside itself, decided once for both drawers: the change its note opens
 * with, drawn as a chip.
 *
 * THE LEAD FIGURE IS THE ANSWER AND ITS CHANGE IS THE FIRST THING ASKED OF IT: "up or down, and by how much". A note
 * that opens with a signed change (`+6.5%`, `−£1,240`, `▲ 6%`) or a share and its way (`6% down`) has that part drawn
 * as a chip in front of the rest of its words, so it is read before them. Up wears the good tint; down stays ink,
 * because less money is a thing to know and not the danger colour. Any other note is drawn as it was written.
 */

export type StatChange = { change: string; dir: 'up' | 'down'; rest: string };

/** A sign or an arrow, then a figure: `+6.5%`, `−£1,240.00`, `+EGP 70,596`, `▲ +6%`. */
const SIGNED = /^([+−▲▼]|-(?=\S*\d))\s?[+−]?((?:[A-Z]{3}[\s\u00a0])?[^\s\d]*\d[\d,.]*%?)(.*)$/su;
/** A share, then the way it went: `6% down`, `12% up`. */
const WORDED = /^(\d[\d.,]*%)\s+(up|down)\b(.*)$/su;

export function statChange(note: string): StatChange | null {
  const said = note.trim();
  const signed = SIGNED.exec(said);
  if (signed) {
    const mark = signed[1]!;
    const dir = mark === '+' || mark === '▲' ? 'up' : 'down';
    const sign = mark === '▲' ? '+' : mark === '▼' || mark === '-' ? '−' : mark;
    /* A full stop or a comma after the figure ends the sentence's clause, and is no part of the figure. */
    const figure = signed[2]!.replace(/[.,]+$/u, '');
    const rest = `${signed[2]!.slice(figure.length)}${signed[3]!}`.replace(/^[.,]\s*/u, '').trim();
    return { change: `${sign}${figure}`, dir, rest };
  }
  const worded = WORDED.exec(said);
  if (worded) {
    const dir = worded[2] === 'up' ? 'up' : 'down';
    return { change: `${dir === 'up' ? '+' : '−'}${worded[1]!}`, dir, rest: worded[3]!.trim() };
  }
  return null;
}
