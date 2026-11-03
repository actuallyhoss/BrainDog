/**
 * What an add-on may do beyond lists and calls out (phase 4), as the lines its plan asks the owner to approve: a script
 * that may send notices (`notifies: true`), one that asks Slash's model (`model: { most_per_run }`), and a drawn view
 * that may add or change rows (`actions:` on a `drawn` block). Read off the file, never taken from its author.
 *
 * ON THE PLAN AS `approve` LINES, beside the calls out, so `install` arms nothing unless the same lines come back with
 * it, and an update that keeps what was approved before asks for nothing again (`change: 'same'`), as a call out does.
 * A script's own store (`store: true`) is not a line: what it keeps is its own and reaches nothing of the person's.
 */

import { drawnWrites, SCRIPT_NOTICES_PER_DAY } from '@braindog/kernel';

/** One line of what an add-on may do, and whether it is new against what is installed. */
export type MayLine = { id: string; line: string; change: 'new' | 'same' };

type Decl = { id: string; kind: string; body: unknown };

const isMap = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const titled = (body: Record<string, unknown>, id: string): string => (typeof body.title === 'string' && body.title.trim() !== '' ? body.title.trim() : id);

/** A list's words: `register.money_goals` read as "money goals". */
const listWords = (id: string): string => id.replace(/[_-]+/gu, ' ');

const and = (xs: readonly string[]): string => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** The lines one declaration says, in the order a person reads them. */
export function mayLinesOfDecl(d: Decl): string[] {
  const body = isMap(d.body) ? d.body : {};
  if (d.kind === 'script') {
    const name = titled(body, String(body.script ?? d.id));
    const out: string[] = [];
    if (body.notifies === true) out.push(`${name} may send you notifications, at most ${SCRIPT_NOTICES_PER_DAY} a day.`);
    const model = isMap(body.model) ? body.model.most_per_run : undefined;
    if (typeof model === 'number') out.push(`${name} asks Slash's model on your allowance, at most ${model} ${model === 1 ? 'time' : 'times'} a run.`);
    return out;
  }
  if (d.kind === 'page') {
    const blocks = Array.isArray(body.blocks) ? body.blocks : [];
    const name = titled(body, String(body.page ?? d.id));
    const out: string[] = [];
    for (const b of blocks) {
      if (!isMap(b) || b.kind !== 'drawn' || b.actions === undefined) continue;
      const { creates, updates } = drawnWrites(b.actions);
      const parts = [
        creates.length > 0 ? `add rows to ${and(creates.map(listWords))}` : '',
        updates.length > 0 ? `change rows in ${and(updates.map(listWords))}` : '',
      ].filter((p) => p !== '');
      if (parts.length > 0) out.push(`Its view on ${name} can ${parts.join(' and ')}, as whoever is looking.`);
    }
    return [...new Set(out)];
  }
  return [];
}

/**
 * Every line this pack's declarations say, each `new` unless the installed declaration under its id says the same line.
 * `installed` bodies are JSON text, as the record holds them.
 */
export function mayLinesOf(decls: readonly Decl[], installed: readonly { id: string; kind: string; body: string }[]): MayLine[] {
  return decls.flatMap((d) => {
    const lines = mayLinesOfDecl(d);
    if (lines.length === 0) return [];
    const was = installed.find((i) => i.id === d.id);
    let before: string[] = [];
    if (was !== undefined)
      try {
        before = mayLinesOfDecl({ id: was.id, kind: was.kind, body: JSON.parse(was.body) as unknown });
      } catch {
        before = [];
      }
    return lines.map((line) => ({ id: d.id, line, change: before.includes(line) ? ('same' as const) : ('new' as const) }));
  });
}
