/**
 * `.dog` — Data, Origin, Governance. The file a customer can take with them.
 *
 * THIS IS THE PRODUCT'S STRONGEST PROMISE and the reason it is a format rather than an export
 * button: a record is a thing you have, not a thing you rent. So the file has to be readable by
 * something other than us, checkable by somebody who does not trust us, and complete enough to open
 * somewhere else — which is three requirements, and each one shows up in the design.
 *
 * READABLE: one line per row, JCS arrays under a `#table` header. `sed`, `sha256sum` and nothing
 * else can verify a table, because a table's row lines joined by LF are exactly what its manifest
 * entry hashes. A zip of JSON would have needed a tool.
 *
 * THREE SECTIONS, ADDRESSABLE SEPARATELY, which is what makes the useful operations cheap: data
 * without origin is a clean handover, origin without data is an audit, governance alone is a pack.
 * `local` never travels — a lockout counter and a device grant are facts about one machine.
 *
 * THE SHAPE IS READ FROM THE SCHEMA, not listed here. `PRAGMA table_info` gives the columns in DDL
 * order and the primary key; `dog_section` says where each table belongs. A list in this file would
 * be a second copy of the schema, and the copy that drifted would be the one that decides what a
 * customer's file contains.
 */

import type { Sql } from '@braindog/ports';

export type Section = 'header' | 'data' | 'origin' | 'governance' | 'local';

/** The header first, then the three that travel. `local` is absent on purpose. */
export const TRAVELS: readonly Section[] = ['header', 'data', 'origin', 'governance'];

export type TableShape = { name: string; section: Section; columns: string[]; pk: string[] };

/**
 * Every table, in the order it is written: header, data, origin, governance — and within a section,
 * the order the schema declares them, which is the order of the DDL.
 */
export function tables(sql: Sql): TableShape[] {
  const sections = new Map(
    sql.all<{ table_name: string; section: Section }>('SELECT table_name, section FROM dog_section').map((r) => [
      r.table_name,
      r.section,
    ]),
  );

  const real = sql
    .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY rootpage")
    .map((r) => r.name)
    .filter((n) => !n.startsWith('sqlite_') && !n.startsWith('entry_fts_'));

  const out: TableShape[] = [];
  for (const section of TRAVELS)
    for (const name of real) {
      if (sections.get(name) !== section) continue;
      const info = sql.all<{ name: string; pk: number }>(`PRAGMA table_info(${name})`);
      const columns = info.map((c) => c.name);
      const pk = info.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk).map((c) => c.name);
      out.push({ name, section, columns, pk: pk.length ? pk : columns.slice(0, 1) });
    }
  return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** RFC 4648 §4, padded. A blob is the one value JSON has no word for. */
function base64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += B64[a >> 2];
    out += B64[((a & 3) << 4) | ((b ?? 0) >> 4)];
    out += b === undefined ? '=' : B64[((b & 15) << 2) | ((c ?? 0) >> 6)];
    out += c === undefined ? '=' : B64[c & 63];
  }
  return out;
}

function unbase64(text: string): Uint8Array {
  const clean = text.replace(/=+$/, '');
  const out = new Uint8Array((clean.length * 3) >> 2);
  let bits = 0;
  let acc = 0;
  let at = 0;
  for (const c of clean) {
    acc = (acc << 6) | B64.indexOf(c);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[at++] = (acc >> bits) & 255;
    }
  }
  return out;
}

/** One value, as the format writes it. */
export function encode(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Uint8Array) return { b64: base64(value) };
  return value;
}

export function decode(value: unknown): string | number | null | Uint8Array {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && 'b64' in (value as Record<string, unknown>))
    return unbase64(String((value as { b64: string }).b64));
  return value as string | number;
}

/** One table's rows, as lines. Joined by LF, these are exactly what its manifest entry hashes. */
export function projection(sql: Sql, table: TableShape): string[] {
  const cols = table.columns.join(', ');
  const order = table.pk.join(', ');
  return sql
    .all<Record<string, unknown>>(`SELECT ${cols} FROM ${table.name} ORDER BY ${order}`)
    .map((row) => JSON.stringify(table.columns.map((c) => encode(row[c]))));
}

const HEX = Array.from({ length: 256 }, (_, n) => n.toString(16).padStart(2, '0'));

async function sha256(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  let out = '';
  for (const byte of new Uint8Array(bytes)) out += HEX[byte];
  return out;
}

/**
 * Write the manifest, then the file.
 *
 * THERE IS NO `exported_at`. A timestamp in the file would mean two exports of an unchanged record
 * produce different bytes, and then "has this changed since I last took a copy" needs a tool instead
 * of `diff`. When the file is signed, the time lives in the signature, which is where a time that is
 * about the ACT rather than the CONTENT belongs.
 */
export async function exportDogl(
  sql: Sql,
  transaction: <T>(fn: () => T) => T,
  opts: { sections?: readonly Section[] } = {},
): Promise<string[]> {
  const wanted = new Set<Section>(opts.sections ?? TRAVELS);
  wanted.add('header');

  const all = tables(sql);
  const body = all.filter((t) => wanted.has(t.section) && t.name !== 'dog_manifest' && t.name !== 'dog_sig');

  const rows = new Map<string, string[]>();
  for (const table of body) rows.set(table.name, projection(sql, table));

  const sums = await Promise.all(body.map(async (t) => [t.name, await sha256((rows.get(t.name) ?? []).join('\n'))] as const));

  transaction(() => {
    sql.exec('DELETE FROM dog_manifest');
    for (const [name, sha] of sums)
      sql.exec('INSERT INTO dog_manifest (table_name, rows, sha256) VALUES (?, ?, ?)', name, (rows.get(name) ?? []).length, sha);
    sql.exec('DELETE FROM dog_sig');
  });

  /* `dog_sig` LAST, whatever section it sits in — so a signer appends one line to the end of the
     file rather than splicing into the middle of it. That is the whole reason its position is fixed
     rather than following the section order. */
  const ordered = [...all.filter((t) => t.name !== 'dog_sig'), ...all.filter((t) => t.name === 'dog_sig')];

  const lines: string[] = ['#dogl 1'];
  for (const table of ordered) {
    if (!wanted.has(table.section)) continue;
    lines.push(`#table ${table.name} ${table.columns.join(',')}`);
    /* The kernel writes no row under `dog_sig`: signing needs a private key it must never see. The
       manifest is projected AFTER it was written, so the file describes itself. */
    if (table.name === 'dog_sig') continue;
    for (const line of table.name === 'dog_manifest' ? projection(sql, table) : (rows.get(table.name) ?? []))
      lines.push(line);
  }
  return lines;
}

export type ImportReport = { tables: number; rows: number };

/**
 * Read a file into an EMPTY record, and refuse otherwise.
 *
 * Merging two records is not an import, it is a decision about which of two facts is true, made per
 * row, by somebody who knows. A tool that guessed would be wrong quietly, which for a record of what
 * somebody is owed is the worst failure available.
 *
 * The rows are copied, not replayed: the events keep their original actors and ids, because a copy
 * of a record that says every fact was written by whoever imported it is not a copy.
 */
export function importDogl(
  sql: Sql,
  transaction: <T>(fn: () => T) => T,
  lines: Iterable<string>,
): { ok: true; value: ImportReport } | { ok: false; refusal: { code: string; fix: string } } {
  const shapes = new Map(tables(sql).map((t) => [t.name, t]));

  /* EMPTY MEANS EVERY TABLE THE FILE WOULD TOUCH, not just `entry`.
     Counting entries alone let a record that held registers, decisions and grants but no rows call
     itself empty — and then the first `declaration` line cleared `declaration` while the target's
     own decisions and grants survived beside the file's. That is exactly the per-row merge the
     refusal below says nobody should make, performed silently and half-way. */
  const held = notEmpty(sql, shapes);
  if (held)
    return {
      ok: false,
      refusal: {
        code: 'RECORD_NOT_EMPTY',
        fix: `An import opens a file into an empty record, and this one already holds ${held}. Merging two records is a decision per row, and it is not this tool’s to make.`,
      },
    };

  let table: TableShape | null = null;
  let header: string[] = [];
  let rows = 0;
  const touched = new Set<string>();

  let out: ImportReport;
  try {
    out = read();
  } catch (e) {
    /* A FILE IS UNTRUSTED INPUT. A truncated line, a row that violates a constraint, a column whose
       value is the wrong type — all of them arrived here as a thrown Error, which a caller reading
       `Result` never sees coming. The transaction had already rolled back; the only thing missing
       was a sentence saying so. */
    return {
      ok: false,
      refusal: {
        code: e instanceof BadLine ? 'MALFORMED_FILE' : 'IMPORT_FAILED',
        fix:
          e instanceof BadLine
            ? `${e.message} The file is damaged; re-export it from the record it came from.`
            : `The file could not be read into this record: ${e instanceof Error ? e.message : String(e)}. Nothing was written.`,
      },
    };
  }

  return { ok: true, value: out };

  function read(): ImportReport {
  return transaction(() => {
    for (const raw of lines) {
      const line = raw.trimEnd();
      if (!line) continue;

      if (line.startsWith('#dogl')) continue;
      if (line.startsWith('#table ')) {
        const [name, columns] = line.slice('#table '.length).split(' ');
        table = shapes.get(name ?? '') ?? null;
        header = (columns ?? '').split(',').filter(Boolean);
        continue;
      }
      if (line.startsWith('#')) continue;
      if (!table || header.length === 0) continue;
      /* The header travels with the file and is rebuilt on open, so importing it would write the
         manifest of the FILE over the manifest of the record being built from it.

         `migration` travels too and is not imported, for a different reason: the ledger is a fact
         about the database it is in — which migrations were applied to THESE bytes, and when. The
         target applied its own before it could read a file at all. It is in the file so a reader can
         see which schema wrote it, and adopting somebody else's would be claiming a history that
         did not happen here. */
      if (table.section === 'header' || table.name === 'migration') continue;

      /* AN EMPTY RECORD IS NOT AN EMPTY DATABASE. The migration seeds rows — the two counters, the
         section map — and the file supersedes them: a `counter` from the seed would restart the
         numbering the file is carrying, and #7 would be issued twice. So the first line for a table
         clears it. `entry` is already empty by the check above; this is about the seed. */
      if (!touched.has(table.name)) sql.exec(`DELETE FROM ${table.name}`);

      const values = parseRow(line, table.name);
      /* THE FILE'S COLUMNS, not this build's. A file written by an older version has fewer, and
         reading it positionally against today's list would put a value in the wrong column —
         silently, and in a record of what somebody is owed. */
      const known = header.filter((c) => table!.columns.includes(c));
      const placeholders = known.map(() => '?').join(', ');
      sql.exec(
        `INSERT INTO ${table.name} (${known.join(', ')}) VALUES (${placeholders})`,
        ...known.map((c) => decode(values[header.indexOf(c)]) as never),
      );
      touched.add(table.name);
      rows++;
    }
    return { tables: touched.size, rows };
  });
  }
}

/** Thrown when a row line is not a JSON array, so the transaction rolls back and the caller gets a sentence. */
class BadLine extends Error {}

function parseRow(line: string, table: string): unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    throw new BadLine(`A row under #table ${table} is not JSON.`);
  }
  if (!Array.isArray(parsed)) throw new BadLine(`A row under #table ${table} is not an array of values.`);
  return parsed;
}

/**
 * What this record already holds, in the words a person would use — or `null` when it holds nothing.
 *
 * The seed is not content: the migration writes `dog_section`, `dog_meta` and two counters at 1, and
 * a record that has only those has never been written to.
 */
const SEEDED = new Set(['migration', 'record', 'entry_fts', 'entry_vec']);

function notEmpty(sql: Sql, shapes: Map<string, TableShape>): string | null {
  const found: string[] = [];
  for (const [name, shape] of shapes) {
    /* `record` is identity rather than content — one row saying what this record is called. Opening
       a file into an empty record adopts the file's identity, which is the point; the seeded
       counters are likewise not content. `migration` is a fact about this database and never
       imported at all, and the two shadow tables are derived from `entry`. */
    if (shape.section === 'header' || SEEDED.has(name)) continue;
    const n = Number(
      sql.one<{ n: number }>(
        name === 'counter'
          ? "SELECT count(*) AS n FROM counter WHERE next > 1 OR name NOT IN ('decision', 'suggestion')"
          : `SELECT count(*) AS n FROM ${name}`,
      )?.n ?? 0,
    );
    if (n > 0) found.push(`${n} ${name}`);
  }
  return found.length ? found.join(', ') : null;
}
