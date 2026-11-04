/**
 * Who is running now, for the panel's quiet line and for @: `presence`, read when the panel asks and again when the
 * record's version moves, and no timer of its own that asks anything. How long since one was heard ticks on from what
 * the read said, in the tab, with no read at all.
 *
 * THE RECORD'S OWN WORDS. Working is a call in the last 15 minutes with the window open; past that the row reads quiet,
 * with no ask, by the same mark the record uses (`THINKING_MS` in the kernel). A person who may not read the runs has no
 * rows, and the panel is as it was.
 */

import { machineNamed, type LiveRun } from '../record/instruct.ts';

export type RunNow = {
  run: string;
  seq: number;
  /** Who it is: "Claude Code on Mac Studio". */
  who: string;
  project: string | null;
  doing: string | null;
  /** When it last did something, by this tab's clock, as far as the read said. */
  heardAt: number;
  /** When the read said it was already quiet or waiting on the person. */
  quietWhenRead: boolean;
  asked: string | null;
};

/** Open with no call for this long is quiet (`THINKING_MS`): said here for the tab to tick on with, and never asked of a server. */
const QUIET_AFTER_MS = 15 * 60_000;

export const agentsNow = $state<{ rows: RunNow[]; read: boolean }>({ rows: [], read: false });

let asking: { base: string; at: number; out: Promise<RunNow[]> } | null = null;
let later: ReturnType<typeof setTimeout> | null = null;
/**
 * ONE READ THIS OFTEN AT MOST. A version that moves all the time, with agents writing, is still one read in this long,
 * and the last move is always read, a beat late, so what is drawn ends up true.
 */
const FRESH_MS = 4000;

const WHO: Readonly<Record<string, string>> = { claude: 'Claude Code', codex: 'Codex', cursor: 'Cursor', gemini: 'Gemini', copilot: 'Copilot', windsurf: 'Windsurf' };

const titleOf = (p: unknown): string | null => (typeof p === 'string' ? p : typeof p === 'object' && p !== null && typeof (p as { title?: unknown }).title === 'string' ? (p as { title: string }).title : typeof p === 'object' && p !== null && typeof (p as { name?: unknown }).name === 'string' ? (p as { name: string }).name : null);

export function readAgents(base: string): Promise<RunNow[]> {
  if (asking && asking.base === base && Date.now() - asking.at < FRESH_MS) {
    later ??= setTimeout(() => {
      later = null;
      void readAgents(base);
    }, FRESH_MS);
    return asking.out;
  }
  const out = (async (): Promise<RunNow[]> => {
    try {
      const { control } = await import('../record/instruct.ts');
      const io = control(base);
      const got = await io.presence();
      if (!got.ok) {
        agentsNow.read = true;
        agentsNow.rows = [];
        return [];
      }
      const open = got.value.filter((r: LiveRun) => r.parent === null && /^S[1-9][0-9]*$/u.test(r.run) && r.stopped === null);
      const titles = await io.projects(open).catch(() => new Map());
      const at = Date.now();
      const rows = open.map((r): RunNow => {
        const app = r.app ?? WHO[r.agent ?? ''] ?? 'An agent';
        const machine = r.machine ? machineNamed(r.machine, open, []) : null;
        return {
          run: r.run,
          seq: Number(r.run.slice(1)),
          who: machine ? `${app} on ${machine}` : app,
          project: r.project === null ? r.repo : (titleOf(titles.get(r.project)) ?? r.repo),
          doing: r.doing,
          heardAt: at - (r.state === 'waiting' && typeof r.quiet_s === 'number' ? r.quiet_s : r.heard_s) * 1000,
          quietWhenRead: r.state === 'waiting',
          asked: r.asked ?? null,
        };
      });
      agentsNow.rows = rows;
      agentsNow.read = true;
      return rows;
    } catch {
      return agentsNow.rows;
    }
  })();
  asking = { base, at: Date.now(), out };
  return out;
}

/** Whether a run reads quiet now: it did when read, or it has been silent past the mark since. */
export const isQuietNow = (r: RunNow, now: number): boolean => r.quietWhenRead || now - r.heardAt > QUIET_AFTER_MS;

/** What is said of how long since: "now", "4 min", "2 h". */
export function sinceSaid(r: RunNow, now: number): string {
  const s = Math.max(0, Math.round((now - r.heardAt) / 1000));
  if (s < 90) return 'now';
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${Math.round(m / 60)} h`;
}

/** Those at work first, then the quiet ones, the freshest first in each. */
export function ordered(rows: readonly RunNow[], now: number): RunNow[] {
  return [...rows].sort((a, z) => Number(isQuietNow(a, now)) - Number(isQuietNow(z, now)) || z.heardAt - a.heardAt);
}
