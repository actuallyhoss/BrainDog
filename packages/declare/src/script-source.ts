/**
 * What each script an install would put in or change runs: its source, its size, and on an update the lines that
 * changed (SHL-D09, "source shown in review", HD.361).
 *
 * THE REVIEW IS WHERE A STRANGER'S CODE IS READ. A pack's script runs with the keys and the reads its header names, and
 * the header's `CALLS OUT` line says where it may send what it reads; the source says what it actually does. So the plan
 * every install screen and every agent reads carries the source itself, whole, and the screen decides how much to draw.
 *
 * WHOLE, EVEN PAST 64 KB. A source cut short in the plan is a source nobody could finish reading anywhere, so `bytes`
 * says how big it is and the screen draws the first `SHOWN_LINES` with a "show all" (the risk SHL-D09 names: a 64 KB
 * source on a phone).
 *
 * AN UNCHANGED SCRIPT IS NOT ANSWERED. Approving an update asks about what moves, and a script whose body is the one
 * installed was read at the install before. A script whose header moved and whose source did not is answered with no
 * changed lines, so the review still shows it beside the header's new line.
 *
 * PURE: no record, no clock. The plan hands in the pack's declarations and what is installed.
 */

import { jcs, type Json } from '@braindog/kernel';

/** One changed line: where it stands in the new source, what it was and what it is now. */
export type ChangedLine = {
  /**
   * The line's number in the new source, from 1. A removed line has no number of its own, so it carries the number of
   * the line that now stands where it stood (one past the end when it was the last).
   */
  at: number;
  /** The installed line, or `null` for a line the update adds. */
  was: string | null;
  /** The new line, or `null` for a line the update removes. */
  now: string | null;
};

export type ScriptSource = {
  script: string;
  /** The script's own title, or its name when it gives none. */
  title: string;
  source: string;
  /** The source's size in UTF-8 bytes. */
  bytes: number;
  /** `null` for a script the record does not hold yet; on an update, only the lines that changed. */
  changed: ChangedLine[] | null;
};

/** Past this many bytes a source is large: the screen draws `SHOWN_LINES` of it and a "show all". */
export const LARGE_SOURCE_BYTES = 64 * 1024;
/** How many lines of a large source a review draws before "show all". */
export const SHOWN_LINES = 200;

/**
 * The most cells the line diff fills. Past it the differing middle of two sources is said as replaced whole: still
 * every changed line, only paired less closely. 4M cells is 16 MB of table and well under a second.
 */
const MOST_CELLS = 4_000_000;

type PackDecl = { id: string; kind: string; body: unknown };
type HeldDecl = { id: string; kind: string; body: string };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const linesOf = (source: string): string[] => source.split(/\r?\n/u);
const bytesOf = (source: string): number => new TextEncoder().encode(source).length;

/**
 * The longest common run of lines, as the ops that turn `was` into `now`: `=` kept, `-` removed, `+` added.
 * A suffix table, so the walk goes forwards and the ops come out in reading order.
 */
function lineOps(was: readonly string[], now: readonly string[]): ('=' | '-' | '+')[] {
  const n = was.length;
  const m = now.length;
  if (n * m > MOST_CELLS) return [...was.map(() => '-' as const), ...now.map(() => '+' as const)];
  const w = m + 1;
  const table = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      table[i * w + j] = was[i] === now[j] ? table[(i + 1) * w + j + 1]! + 1 : Math.max(table[(i + 1) * w + j]!, table[i * w + j + 1]!);
  const ops: ('=' | '-' | '+')[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (was[i] === now[j]) {
      ops.push('=');
      i++;
      j++;
    } else if (table[(i + 1) * w + j]! >= table[i * w + j + 1]!) {
      ops.push('-');
      i++;
    } else {
      ops.push('+');
      j++;
    }
  }
  while (i++ < n) ops.push('-');
  while (j++ < m) ops.push('+');
  return ops;
}

/**
 * The lines that differ between two sources, a plain line diff.
 *
 * A RUN OF REMOVED LINES BESIDE A RUN OF ADDED ONES IS SAID AS LINES CHANGED, paired in order, so an edit to one line
 * reads as that line before and after, not as a removal and an addition the reader has to match up.
 */
export function changedLines(was: string, now: string): ChangedLine[] {
  const a = linesOf(was);
  const b = linesOf(now);
  /* THE SAME HEAD AND TAIL ARE TAKEN OFF FIRST, so the table is only as big as the part that moved. */
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const ops = lineOps(a.slice(head, a.length - tail), b.slice(head, b.length - tail));

  const out: ChangedLine[] = [];
  let i = head;
  let j = head;
  let k = 0;
  while (k < ops.length) {
    if (ops[k] === '=') {
      i++;
      j++;
      k++;
      continue;
    }
    const removed: string[] = [];
    const added: string[] = [];
    for (; k < ops.length && ops[k] !== '='; k++) {
      if (ops[k] === '-') removed.push(a[i++]!);
      else added.push(b[j++]!);
    }
    const first = j - added.length;
    for (let p = 0; p < Math.max(removed.length, added.length); p++)
      out.push(
        p < added.length
          ? { at: first + p + 1, was: removed[p] ?? null, now: added[p]! }
          : { at: first + added.length + 1, was: removed[p]!, now: null },
      );
  }
  return out;
}

/**
 * Each script these declarations would install or change, in the order the pack writes them, against what is held.
 * A declaration that is not a script, or a script with no source, is not answered: the install refuses it elsewhere.
 */
export function scriptSources(declarations: readonly PackDecl[], installed: { declarations: readonly HeldDecl[] }): ScriptSource[] {
  return declarations.flatMap((d): ScriptSource[] => {
    if (d.kind !== 'script' || !isObject(d.body)) return [];
    const { script, title, source } = d.body;
    if (typeof script !== 'string' || typeof source !== 'string') return [];
    const held = installed.declarations.find((i) => i.id === d.id && i.kind === 'script');
    let before: Record<string, unknown> | null = null;
    if (held !== undefined)
      try {
        const parsed = JSON.parse(held.body) as unknown;
        before = isObject(parsed) ? parsed : null;
      } catch {
        before = null;
      }
    /* WHAT IS HELD UNREADABLE IS SAID AS NEW: the whole source is shown, which asks more of the reader and hides nothing. */
    if (before !== null && jcs(before as Json) === jcs(d.body as Json)) return [];
    const was = before !== null && typeof before.source === 'string' ? before.source : null;
    return [
      {
        script,
        title: typeof title === 'string' && title.trim() !== '' ? title : script,
        source,
        bytes: bytesOf(source),
        changed: was === null ? null : changedLines(was, source),
      },
    ];
  });
}
