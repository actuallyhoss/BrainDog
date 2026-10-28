/**
 * The kernel schema, migration 35: the repeats held before their mark was kept get it now.
 *
 * A TEXT SKIPPED AS A REPEAT IS MARKED BY ITS `match` LINE: `field: 'repeats'`, the row it repeats as `from_v`, by the
 * pattern that read it as `ingest:<pattern>` (`ingest.ts`'s skip). Before that line was written, a skip kept only its
 * reason, "<list>#<n> already says this." (or the row's id, for a list with no numbers), so on a record that took texts
 * then, "Held as repeats" in the Inbox is empty and "It is a second one" (`fileAsSecond`) refuses every one of them.
 *
 * NO SCHEMA: the text below changes nothing, and the work is `repeatMarks`, run once after it applies (`migrate.ts`),
 * because a mark's line has an id that is minted and a reason is read by a pattern SQL has no clean way to say.
 */
import type { Sql } from '@braindog/ports';

export default `
SELECT 0;
`;

/** The reason an old repeat was skipped with: a list and its number, or a row's own id. */
const SAID = /^(?:([a-z][a-z0-9_]{0,31})#([1-9]\d*)|([0-9A-HJKMNP-TV-Z]{26})) already says this\.$/u;

/**
 * Migration 35's data step: one `match` line marked `repeats` for each skipped text whose reason names the row it
 * repeats in the old words, when that row is still in the record.
 *
 * THE PATTERN THAT READ IT IS WORKED OUT, never guessed: the one live pattern with a repeat check that files into the
 * row's list. A list two such patterns file into is left as it is, since the wrong pattern would file the second one
 * by the wrong reading, and a text with no mark is only a text "Held as repeats" does not show.
 *
 * ONE STATEMENT, binding the texts as one JSON array and the patterns as one JSON object, never a parameter each: a
 * Durable Object refuses more than a hundred. Keyed on a `repeats` mark already there, so a second run changes nothing,
 * and nothing is taken away: the text, its state and its reason stay as they were. Answers how many it marked.
 */
export function repeatMarks(sql: Sql, mint: () => string, at: string): { marked: number } {
  const writers = new Map<string, Set<string>>();
  for (const { body } of sql.all<{ body: string }>(
    "SELECT body FROM declaration WHERE kind = 'ingest' AND superseded_at IS NULL AND retired = 0 AND json_valid(body)",
  )) {
    const d = parsed(body);
    if (d === null || typeof d.ingest !== 'string' || !checksRepeats(d)) continue;
    for (const register of filesInto(d.writes)) {
      const set = writers.get(register) ?? new Set<string>();
      set.add(d.ingest);
      writers.set(register, set);
    }
  }
  const only: Record<string, string> = {};
  for (const [register, set] of writers) if (set.size === 1) only[register] = [...set][0]!;
  if (Object.keys(only).length === 0) return { marked: 0 };

  const texts: { id: string; raw: string; register: string | null; seq: number | null; entry: string | null }[] = [];
  for (const r of sql.all<{ id: string; reason: string }>(
    "SELECT id, reason FROM inbox_raw WHERE state = 'skipped' AND reason LIKE '% already says this.' ORDER BY rowid",
  )) {
    const m = SAID.exec(r.reason);
    if (m === null) continue;
    texts.push({ id: mint(), raw: r.id, register: m[1] ?? null, seq: m[2] === undefined ? null : Number(m[2]), entry: m[3] ?? null });
  }
  if (texts.length === 0) return { marked: 0 };

  const before = sql.one<{ n: number }>("SELECT count(*) AS n FROM event WHERE kind = 'match' AND field = 'repeats'")?.n ?? 0;
  sql.exec(
    `INSERT INTO event (id, ts, actor, kind, target, target_kind, field, from_v, to_v)
     SELECT x.id, ?, 'ingest:' || x.pattern, 'match', 'inbox_raw:' || x.raw, 'inbox_raw', 'repeats', x.entry, 'skipped'
     FROM (
       SELECT t.k, t.id, t.raw, e.id AS entry, json_extract(?, '$."' || e.register || '"') AS pattern
       FROM (
         SELECT j.key AS k, json_extract(j.value, '$.id') AS id, json_extract(j.value, '$.raw') AS raw,
           coalesce(
             (SELECT o.rowid FROM entry o WHERE o.id = json_extract(j.value, '$.entry')),
             (SELECT o.rowid FROM entry o WHERE o.register = json_extract(j.value, '$.register') AND o.seq = json_extract(j.value, '$.seq'))
           ) AS at_row
         FROM json_each(?) j
       ) t JOIN entry e ON e.rowid = t.at_row
     ) x
     WHERE x.pattern IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM event m WHERE m.target = 'inbox_raw:' || x.raw AND m.kind = 'match' AND m.field = 'repeats')
     ORDER BY x.k`,
    at,
    JSON.stringify(only),
    JSON.stringify(texts),
  );
  const after = sql.one<{ n: number }>("SELECT count(*) AS n FROM event WHERE kind = 'match' AND field = 'repeats'")?.n ?? 0;
  return { marked: after - before };
}

/** A pattern that skips a text its list already holds: a repeat check (`dedupe`), and `skip` when one is found. */
function checksRepeats(d: Record<string, unknown>): boolean {
  if (d.on_conflict !== undefined && d.on_conflict !== 'skip') return false;
  const key = d.dedupe;
  if (Array.isArray(key)) return key.length > 0;
  return typeof key === 'object' && key !== null;
}

/** Every list a pattern files into: its one list, or each list its routing table names. */
function filesInto(writes: unknown): string[] {
  if (typeof writes !== 'object' || writes === null) return [];
  const register = (writes as { register?: unknown }).register;
  if (typeof register === 'string') return [register];
  const to = typeof register === 'object' && register !== null ? (register as { to?: unknown }).to : undefined;
  if (!Array.isArray(to)) return [];
  return [...new Set(to.flatMap((row) => (typeof row === 'object' && row !== null && typeof (row as { register?: unknown }).register === 'string' ? [(row as { register: string }).register] : [])))];
}

function parsed(text: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(text) as unknown;
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
