/**
 * The installed scripts, and how their runs went: what the record's `scripts` read answers, and the rows a page's
 * `scripts` block draws (`sources/scripts.ts`), so `/scripts`, the command line and an agent read one answer.
 *
 * MOVED FROM `@braindog/record` (24 October), word for word, when `/scripts` became a declared page: the page source
 * runs inside the kernel, which cannot import the record, and two copies of the streak that pauses a script would part.
 */

import type { Sql } from '@braindog/ports';

import { REFUSED_IN_A_ROW } from './script-run.ts';

type Body = Record<string, unknown>;

const isObject = (x: unknown): x is Body => x !== null && typeof x === 'object' && !Array.isArray(x);

type Declared = { id: string; version: number; body: string; pack_id: string | null };

/**
 * One installed script as the `scripts` read answers it: what it may touch, whether it is paused, its last run and how
 * close it is to being paused.
 *
 * NOTHING SEALED AND NO LOG. A key is its keychain label, which the declaration already names. A run's log quotes what the
 * script read, so it stays on the run's event, where `lineOf` holds it to an owner who reads every list the version
 * touched; the `say` here is the event's note, which is the record's own sentence and which every whole-record reader
 * already sees in `recentHistory`.
 */
export type ScriptRow = {
  /** `script.<id>`, the declaration's own id. */
  id: string;
  /** The bare id, as `resumeScript` takes it. */
  script: string;
  /** Its `title`, or the id when it has none. */
  title: string;
  version: number;
  pack: string | null;
  /** `at` is the time of day its clock is pinned to, `HH:MM` in the record's zone, or `null` for a clock that repeats from its last run. */
  runs: { every: string | null; at: string | null; door: string | null; rule: boolean };
  reads: string[];
  writes: string[];
  /** The origins it may fetch from. */
  egress: string[];
  /** The keys it may have opened for a request, by label. */
  keys: string[];
  /** `paused` after three refused runs in a row, until somebody resumes it; `on` otherwise. */
  status: 'on' | 'paused';
  /** When its clock next starts it, while one is armed. */
  next: string | null;
  last: { at: string; version: number | null; outcome: string; say: string } | null;
  /** Refused runs of the version now installed since its last good run or resume, and how many pause it. */
  refused: { in_a_row: number; pauses_at: number };
  /** This calendar month so far, UTC. `runs` counts only runs that ran the source: `ok` and `refused`. */
  month: { runs: number; ok: number; refused: number };
};

const strings = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : []);

/**
 * Every live script, by id.
 *
 * FROM THE RECORD'S OWN ROWS, as `listActions` is: the declaration, the `schedule` row of kind `script` that every
 * installed script has (one only a door or a rule starts has one too, which pausing reads), and the `pull` events
 * `meter` wrote for its runs, signed `script:<id>@v<n>`. The streak is read the way `pauseAfterRefusals` reads it: only
 * the installed version's `ok` and `refused` runs, a resume (an event with no `to_v`) ending it, so the number here is
 * the one that pauses it.
 */
export function scriptRows(sql: Sql, nowMs: number): ScriptRow[] {
  const month = `${new Date(nowMs).toISOString().slice(0, 7)}-01T00:00:00.000Z`;
  return sql
    .all<Declared>("SELECT id, version, body, pack_id FROM declaration WHERE kind = 'script' AND superseded_at IS NULL AND retired = 0 ORDER BY id")
    .map((d): ScriptRow => {
      const body = JSON.parse(d.body) as Body;
      const bare = d.id.slice('script.'.length);
      const target = `declaration:${d.id}`;
      const runs = isObject(body.runs) ? body.runs : {};
      const row = sql.one<{ state: string; due_at: string }>("SELECT state, due_at FROM schedule WHERE kind = 'script' AND key = ?", bare);
      const every = typeof runs.every === 'string' ? runs.every : null;

      const lastEvent = sql.one<{ ts: string; actor: string; outcome: string; note: string | null }>(
        `SELECT ts, actor, json_extract(to_v, '$.outcome') AS outcome, note FROM event
          WHERE kind = 'pull' AND target = ? AND to_v IS NOT NULL AND json_valid(to_v) AND json_extract(to_v, '$.outcome') IS NOT NULL
          ORDER BY rowid DESC LIMIT 1`,
        target,
      );
      const version = lastEvent ? /@v(\d+)$/.exec(lastEvent.actor) : null;

      let inARow = 0;
      for (const e of sql.all<{ outcome: string | null }>(
        `SELECT json_extract(to_v, '$.outcome') AS outcome FROM event
          WHERE kind = 'pull' AND target = ?
            AND (to_v IS NULL OR (actor = ? AND CASE WHEN json_valid(to_v) THEN json_extract(to_v, '$.outcome') END IN ('ok', 'refused')))
          ORDER BY rowid DESC LIMIT 50`,
        target,
        `script:${bare}@v${String(d.version)}`,
      )) {
        if (e.outcome !== 'refused') break;
        inARow += 1;
      }

      const counts = { runs: 0, ok: 0, refused: 0 };
      for (const r of sql.all<{ outcome: string; n: number }>(
        `SELECT json_extract(to_v, '$.outcome') AS outcome, count(*) AS n FROM event
          WHERE kind = 'pull' AND target = ? AND ts >= ? AND to_v IS NOT NULL AND json_valid(to_v) GROUP BY outcome`,
        target,
        month,
      )) {
        if (r.outcome !== 'ok' && r.outcome !== 'refused') continue;
        counts[r.outcome] += r.n;
        counts.runs += r.n;
      }

      return {
        id: d.id,
        script: bare,
        title: typeof body.title === 'string' && body.title.trim() !== '' ? body.title : bare,
        version: d.version,
        pack: d.pack_id ?? (typeof body.pack === 'string' ? body.pack : null),
        runs: { every, at: every !== null && typeof runs.at === 'string' ? runs.at : null, door: typeof runs.door === 'string' ? runs.door : null, rule: runs.rule === true },
        reads: strings(body.reads),
        writes: strings(body.writes),
        egress: strings(body.egress),
        keys: strings(body.keys),
        status: row?.state === 'paused' ? 'paused' : 'on',
        next: every !== null && (row?.state === 'pending' || row?.state === 'firing') ? row.due_at : null,
        last: lastEvent ? { at: lastEvent.ts, version: version ? Number(version[1]) : null, outcome: lastEvent.outcome, say: lastEvent.note ?? '' } : null,
        refused: { in_a_row: inARow, pauses_at: REFUSED_IN_A_ROW },
        month: counts,
      };
    });
}
