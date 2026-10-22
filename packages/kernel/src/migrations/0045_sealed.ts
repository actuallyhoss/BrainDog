/**
 * The kernel schema, migration 45: sealed files, bytes the owner's own machines seal and only they can open.
 *
 * THE BYTES ARE NOT HERE. A sealed file is kept where a host keeps its large bytes, beside the record and never in it
 * (R2 under the record's id on the Cloud, `blobs/sealed/` beside the record file on a self-host), in parts of at most
 * four mebibytes, because one Durable Object value holds two. These two tables are the index: what each file is called,
 * how many parts it has, how long it is and its SHA-256, and which parts this host holds.
 *
 * `sealed_file` TRAVELS, IN `data`: an export names every sealed file the record holds, with its hash, so a copy says
 * what was kept and a reader can check bytes carried beside it against a signed line. `sealed_part` IS `local`: which
 * parts this host's store holds is a fact about this installation, as a token is, so an import keeps the parts it found
 * here and the kernel counts each file whole again from them (`settleSealed`). A file whose bytes are not on this host
 * imports as not whole, and the machine that sealed it puts it again.
 *
 * `complete` IS KEPT AND NOT ONLY COUNTED, because a listing answers it for every file and a count per row is a
 * statement per row. It is written in the transaction that writes the last part, and again by every import.
 *
 * NO CHECK HOLDS A LIMIT. Eight parts, four mebibytes a part and twenty-five a file are the record's to refuse with a
 * sentence (`methods/sealed.ts`), and a limit in a CHECK is a table rebuild the day it moves.
 *
 * ADDITIVE ONLY, nothing is rebuilt. An older reader skips a table it has no shape for, so the format is still 1.
 * `IF NOT EXISTS` and `OR IGNORE`, so it can run twice, as `migrate.test.ts` runs every migration over itself.
 */
export default `
CREATE TABLE IF NOT EXISTS sealed_file (
  key TEXT PRIMARY KEY,
  parts INTEGER NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  complete INTEGER NOT NULL DEFAULT 0 CHECK (complete IN (0,1)),
  made_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  made_by TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sealed_part (
  key TEXT NOT NULL,
  part INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  at TEXT NOT NULL,
  PRIMARY KEY (key, part)
) WITHOUT ROWID;
INSERT OR IGNORE INTO dog_section (table_name, section) VALUES ('sealed_file', 'data'), ('sealed_part', 'local');
`;
