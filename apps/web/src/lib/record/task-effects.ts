/**
 * WHAT A TASK CHANGED, OR WILL: pure pickers, no DOM and no client.
 *
 * DONE: the log lines between the task's start and the line that finished it, by the same hand (the actor, or the run
 * that signed them), on other rows, as before -> after. OPEN: a field change its own description names ("set status
 * to paid"). Nothing found is `[]`, and the card then draws nothing at all.
 */

import { money } from 'braindog-render';

/** A log line as `history` and `recentHistory` send it, and only the keys read here. */
export type Ev = {
  ts: string;
  actor: string;
  kind: string;
  field?: string | null;
  from?: unknown;
  to?: unknown;
  register?: string | null;
  seq?: number | null;
  title?: string | null;
  run_by?: { run: string } | null;
};

/** `before` is null for a change not made yet, whose old value is whatever the row holds then. */
export type Effect = { what: string; before: string | null; after: string };

/** The most effects a task shows. */
export const EFFECTS_MOST = 4;

/** A value said plainly, or null for one that has no short words (an object that is no money, a long text). */
export function said(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return 'empty';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : null;
  /* AN ID IS NO WORDS (collab pass 2): a task's page said "owner empty → 01M6D38XZH5CNVAXF7DX31PSWJ" for a row handed on. */
  if (typeof v === 'string') return /^(?:[a-z]+_)?[0-9A-HJKMNP-TV-Z]{26}$/u.test(v) ? null : v.length <= 40 ? v.replace(/_/gu, ' ') : null;
  if (typeof v === 'object' && !Array.isArray(v)) {
    const { amount, currency } = v as { amount?: unknown; currency?: unknown };
    if (typeof amount === 'number' && Number.isSafeInteger(amount) && typeof currency === 'string' && /^[A-Za-z]{3}$/u.test(currency)) return money(amount, currency.toUpperCase());
  }
  return null;
}

const at = (e: Ev): number => Date.parse(e.ts);

/** When the task started and finished, and who finished it: from its own log, newest or oldest in any order. */
export function windowOf(task: readonly Ev[], stateField: string | null, done: readonly string[]): { from: number; to: number; actor: string; run: string | null } | null {
  if (!stateField || done.length === 0) return null;
  const all = task.filter((e) => Number.isFinite(at(e))).sort((a, b) => at(a) - at(b));
  const end = [...all].reverse().find((e) => e.field === stateField && typeof e.to === 'string' && done.includes(e.to));
  if (!end) return null;
  const start = all.find((e) => e.kind === 'create') ?? all[0]!;
  return { from: at(start), to: at(end), actor: end.actor, run: end.run_by?.run ?? null };
}

/** The changes the finisher made to other rows inside the window, net per row and field, before -> after. */
export function doneEffects(task: { register: string; seq: number }, win: ReturnType<typeof windowOf>, recent: readonly Ev[]): Effect[] {
  /* AN AGENT'S RUN, NOT A PERSON (collab pass 2): a run is one piece of work, so what it changed while the task was open
     is what doing the task changed. A person's hand across the same days is everything they did that week: the owner handing
     Mira another task was said as what finishing this one changed. */
  if (!win || win.run === null) return [];
  const mine = recent
    .filter((e) => {
      const t = at(e);
      const same = win.run !== null && e.run_by?.run ? e.run_by.run === win.run : e.actor === win.actor;
      return Number.isFinite(t) && t >= win.from && t <= win.to && same && e.field && e.register && e.seq != null && !(e.register === task.register && e.seq === task.seq);
    })
    .sort((a, b) => at(a) - at(b));
  const by = new Map<string, { what: string; first: unknown; last: unknown }>();
  for (const e of mine) {
    const key = `${e.register}#${e.seq}.${e.field}`;
    const field = e.field!.replace(/_/gu, ' ');
    const title = e.title?.trim() ? e.title.trim() : `${e.register}#${e.seq}`;
    const was = by.get(key);
    by.set(key, { what: `${title}: ${field}`, first: was ? was.first : e.from, last: e.to });
  }
  const out: Effect[] = [];
  for (const { what, first, last } of by.values()) {
    const [b, a] = [said(first), said(last)];
    if (b !== null && a !== null && b !== a) out.push({ what, before: b, after: a });
  }
  return out.slice(0, EFFECTS_MOST);
}

const NAMES = /\b(?:set|change|update|mark)\s+(?:the\s+)?([a-z][a-z _-]{1,30}?)(?:\s+(?:of|on|for)\s+[^,.;]{1,40}?)?\s+(?:to|as)\s+["“']?([^"”',.;\n]{1,40})/iu;

/** The field change an open task's description names ("set status to paid"), or none. */
export function plannedEffects(description: unknown): Effect[] {
  const m = typeof description === 'string' ? NAMES.exec(description) : null;
  if (!m) return [];
  const [what, after] = [m[1]!.trim().toLowerCase(), m[2]!.trim()];
  return what && after ? [{ what, before: null, after }] : [];
}
