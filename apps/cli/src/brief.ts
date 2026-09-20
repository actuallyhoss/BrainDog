/**
 * The briefing the start hook prints, which Claude Code adds to the model's context before its first turn.
 *
 * BUILT FROM `context` ALONE, in the order the owner asked for (`loop/research-agent-path.md` §4.3): who
 * this run is and where, the last handoff, who else is live here, what waits on him, then what applies
 * here. Every module can be switched off (`loop/DIRECTION.md` §9), so a register the record does not have
 * is a line that is not printed, never an error.
 *
 * NAMES ONLY. A row is shown by its spoken id and its own words, and only string fields are ever read, so
 * a key's sealed-state projection cannot reach the model. A key is named by its label and nothing else.
 */

import type { Attached, Brief, Context } from '@braindog/client';

export const MAX_LINES = 40;
export const MAX_CHARS = 3_000;

/** Said word for word whenever another run is live in the same repository (`docs/32-PARITY.md:118`). */
export const TWO_SESSIONS = 'Two sessions in one working tree overwrite each other. Coordinate or stop.';

export type Where = { repo: string | null; host: string };

/** Commits HEAD moved since the handoff; `null` when it moved and git cannot count it; `undefined` when it did not. */
export type Moved = number | null | undefined;

/* A line the cap may drop, or one it keeps: who this is, the handoff, the warning, the questions, the next step. */
type Line = { text: string; keep: boolean };

/** One line of someone else's words: control characters and runs of space collapsed, and long text cut. */
export const clip = (said: string, max: number): string => {
  const one = said.replace(/[\x00-\u001f\s]+/g, ' ').trim();
  return one.length > max ? `${one.slice(0, max - 3)}...` : one;
};

export function ago(seconds: number): string {
  if (seconds < 60) return 'just now';
  const [n, unit] = seconds < 3_600 ? [Math.floor(seconds / 60), 'minute'] : seconds < 86_400 ? [Math.floor(seconds / 3_600), 'hour'] : [Math.floor(seconds / 86_400), 'day'];
  return `${String(n)} ${unit}${n === 1 ? '' : 's'} ago`;
}

const NOT_WORDS = new Set(['spoken', 'scope', 'state', 'version']);

/* A row's words: the named field when there is one, else its first string field. A value that is not a string is never read. */
const wordsOf = (row: Brief, field?: string): string => {
  const named = field === undefined ? undefined : row[field];
  if (typeof named === 'string' && named.trim()) return named;
  for (const [key, value] of Object.entries(row)) if (!NOT_WORDS.has(key) && typeof value === 'string' && value.trim()) return value;
  return '';
};

const item = (row: Brief, max: number, field?: string): string => {
  const words = clip(wordsOf(row, field), max);
  return words ? `${row.spoken} ${words}` : row.spoken;
};

const where = (row: Brief): string => (row.scope === 'project' ? 'this project' : 'everywhere');

/* The three registers the agents pack declares get their own lines; any other scoped register is "open here". */
const OWN = new Set(['learnings', 'credentials', 'skills']);
const PER_LINE = 5;

/** The folder's project, the projects it could belong to, or neither. The tail of every first line. */
export function placeOf(c: Context | undefined): string {
  return c?.project
    ? `Project: ${clip(c.project.name, 60)}.`
    : c && c.ambiguous.length > 0
      ? `This folder matches ${c.ambiguous.join(' and ')}. Global until one of them lists it.`
      : 'No project here, so only what applies everywhere is shown.';
}

/** The repository as a first line names it. */
export const repoOf = (at: Where): string => at.repo ?? 'a folder outside any repository';

/** The start hook's briefing: the line saying which run this is and where, then everything the context holds. */
export function briefing(attached: Attached, at: Where, moved: Moved): string {
  const c: Context | undefined = attached.context;
  const head = `BrainDog: ${attached.spoken} ${attached.resumed ? 'resumed' : 'started'} in ${repoOf(at)} on ${at.host}. ${placeOf(c)}`;
  if (!c)
    return fit([
      { text: head, keep: true },
      { text: 'This host sends no briefing. Call context for one, and call handoff with the one next step before you stop.', keep: true },
    ]);
  return briefingOf(head, c, moved);
}

/**
 * The briefing under a first line the caller writes: the handoff, who else is live, what waits, what applies.
 *
 * THE FIRST LINE IS PART OF IT, so the caps of `fit` count it, and a caller that has not attached can say what
 * `attach` cannot say for it. `braindog context` starts nothing and resumes nothing, so it writes its own.
 */
export function briefingOf(head: string, c: Context, moved: Moved): string {
  const lines: Line[] = [{ text: head, keep: true }];
  const keep = (text: string) => lines.push({ text, keep: true });
  const add = (text: string) => lines.push({ text, keep: false });

  if (c.handoff) {
    keep(`Last handoff (${c.handoff.from}, ${ago(c.handoff.age_s)}): ${clip(c.handoff.next, 200)}`);
    for (const tried of c.handoff.tried.slice(-3)) keep(`  Already tried: ${clip(tried, 160)}`);
    if (moved !== undefined)
      keep(
        moved === null
          ? '  HEAD is not where it was then. Re-read before trusting it.'
          : `  HEAD has moved ${String(moved)} commit${moved === 1 ? '' : 's'} since then. Re-read before trusting it.`,
      );
  }

  /* ONLY A RUN STILL WORKING IS A COLLISION. The end hook leaves a run idle, and a handoff waits for a pickup, so
     the session after an ordinary exit was told to coordinate with one that had already stopped. A stale run is a
     crash nobody reported, and is not working either. */
  const working = c.live.same_repo.filter((r) => r.state === 'active' && !r.stale);
  if (working.length > 0) {
    const runs = working.slice(0, PER_LINE).map((r) => `${r.spoken}${r.doing ? ` "${clip(r.doing, 60)}"` : ''}, seen ${ago(r.age_s)}`);
    keep(`Also live in this repo: ${runs.join('; ')}.`);
    keep(`  ${TWO_SESSIONS}`);
  }

  if (c.waiting.length > 0) {
    keep(`Waiting on the owner (${String(c.waiting.length)}):`);
    for (const w of c.waiting) keep(`  ${w.id} ${clip(w.question, 100)}`);
    keep('  The owner answers these in the app. Do not decide for them.');
  }

  for (const r of c.registers) {
    if (OWN.has(r.id)) continue;
    const rows = [...r.rows, ...r.inherited];
    if (rows.length === 0) continue;
    const shown = rows.slice(0, PER_LINE).map((row) => `${item(row, 60)}${row.scope === 'global' ? ' (everywhere)' : ''}`);
    add(`Open in ${clip(r.name, 40)} (${String(shown.length)} of ${String(rows.length)}${r.truncated ? ' or more' : ''}): ${shown.join('; ')}.`);
  }

  if (c.people.length > 0) add(`People on this project: ${c.people.slice(0, 10).map((p) => item(p, 40)).join('; ')}.`);

  const own = (id: string) => c.registers.find((r) => r.id === id);
  const learnings = own('learnings');
  if (learnings && learnings.rows.length + learnings.inherited.length > 0) {
    const rows = [...learnings.rows, ...learnings.inherited];
    add(`Learnings here (${String(Math.min(rows.length, PER_LINE))} shown${c.faded > 0 ? `, ${String(c.faded)} faded` : ''}):`);
    for (const row of rows.slice(0, PER_LINE)) add(`  ${item(row, 160, 'lesson')}`);
  }
  const keys = own('credentials');
  if (keys && keys.rows.length + keys.inherited.length > 0) {
    const named = [...keys.rows, ...keys.inherited].slice(0, 10).map((row) => `${clip(typeof row.label === 'string' ? row.label : row.spoken, 60)} (${where(row)})`);
    /* Semicolons, because a label may hold a comma: "Object storage, write" is one key. */
    add(`Keys you may use here, by name: ${named.join('; ')}. A value is never shown here.`);
  }
  const skills = own('skills');
  if (skills && skills.rows.length + skills.inherited.length > 0) {
    const named = [...skills.rows, ...skills.inherited].slice(0, 10).map((row) => `${clip(wordsOf(row, 'name') || row.spoken, 60)} (${where(row)})`);
    add(`Skills: ${named.join('; ')}.`);
  }

  keep(clip(c.next, 240));
  return fit(lines);
}

/**
 * At most forty lines and three thousand characters, the last line always the next step.
 *
 * WHAT GOES FIRST IS WHAT MATTERS LEAST: the rows of what applies here, from the bottom up, with one line
 * saying how many were left out. Only when the lines that are always kept are still too long is the tail
 * of them cut.
 */
function fit(lines: Line[]): string {
  const out = lines.map((l) => ({ ...l, text: l.text.length > 400 ? `${l.text.slice(0, 397)}...` : l.text }));
  const size = (list: Line[], extra: number) => list.reduce((n, l) => n + l.text.length + 1, 0) + extra;
  const NOTE = 60;
  let dropped = 0;
  while (out.length + (dropped > 0 ? 1 : 0) > MAX_LINES || size(out, dropped > 0 ? NOTE : 0) > MAX_CHARS) {
    let at = out.length - 1;
    while (at >= 0 && out[at]!.keep) at--;
    if (at < 0) break;
    out.splice(at, 1);
    dropped++;
  }
  const last = out.pop();
  if (dropped > 0) out.push({ text: `${String(dropped)} more line${dropped === 1 ? '' : 's'} left out. Call context for all of it.`, keep: true });
  /* Still too long means the kept lines alone are, so the earliest of them win and the next step stays. */
  const kept: string[] = [];
  let budget = MAX_CHARS - (last ? last.text.length + 1 : 0);
  for (const l of out) {
    if (kept.length >= MAX_LINES - 1 || l.text.length + 1 > budget) break;
    kept.push(l.text);
    budget -= l.text.length + 1;
  }
  if (last) kept.push(last.text);
  return kept.join('\n');
}
