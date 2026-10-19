/**
 * `todayReminders`: the reminder lines automations have put on Today ("remind me on Today").
 *
 * A REMINDER IS A NOTICE WITH THE TONE `today` (`TODAY_TONE` in the kernel), and a notice is a `note` line signed
 * `rule:<id>` in the log, so this reads the log for the rules that carry that tone and nothing else: no table of its
 * own, and a rule turned off or retired stops showing at once. Held to the lists the caller reads, since a line is
 * worded from a row.
 */

import type { Result } from '@braindog/ports';
import { ok } from '@braindog/ports';

import { subjectOf } from '../automations.ts';
import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

type Body = Record<string, unknown>;

/** How far back a reminder stays on Today, and how many are shown. */
const STAYS_MS = 2 * 86_400_000;
const MOST = 8;

export type Reminder = { text: string; at: string; rule: string };

const isObject = (x: unknown): x is Body => x !== null && typeof x === 'object' && !Array.isArray(x);

/** Whether any step in a body, at any depth, is a notice with the Today tone. */
export function remindsToday(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(remindsToday);
  if (!isObject(node)) return false;
  if (isObject(node.notify) && node.notify.tone === 'today') return true;
  return Object.values(node).some(remindsToday);
}

export function methods(deps: RecordDeps) {
  const { sql, scoped, readable, clock } = deps;
  return {
    /** The reminders on Today, newest first. READ, held to the lists the caller may read. */
    async todayReminders(_args: unknown, ctx: CallContext): Promise<Result<{ lines: Reminder[] }>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const since = new Date(clock.now() - STAYS_MS).toISOString();
      const lines: Reminder[] = [];
      for (const d of sql.all<{ id: string; body: string }>("SELECT id, body FROM declaration WHERE kind = 'rule' AND superseded_at IS NULL AND retired = 0")) {
        const body: unknown = JSON.parse(d.body);
        if (!isObject(body) || body.enabled === false || !remindsToday(body)) continue;
        const list = subjectOf(body);
        if (list !== null && readable(ctx, list) !== null) continue;
        const bare = d.id.slice('rule.'.length);
        const actor = `rule:${typeof body.rule === 'string' && body.rule !== '' ? body.rule : bare}`;
        for (const e of sql.all<{ ts: string; note: string | null }>("SELECT ts, note FROM event WHERE actor = ? AND kind = 'note' AND ts >= ? ORDER BY ts DESC LIMIT ?", actor, since, MOST))
          if (e.note !== null && e.note !== '') lines.push({ text: e.note, at: e.ts, rule: bare });
      }
      lines.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
      return ok({ lines: lines.slice(0, MOST) });
    },
  };
}
