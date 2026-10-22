/**
 * Sealed files, the kernel's half: which of them are whole on this host (`migrations/0045_sealed.ts`).
 *
 * THE RECORD WRITES THEM AND THE KERNEL ONLY COUNTS. A file's bytes are in the host's store and never in the record, and
 * `packages/record/src/methods/sealed.ts` puts, checks and hands them back. What is left here is the one question a file
 * of the record raises: `sealed_file` travels and `sealed_part` does not, so a record put back from a copy holds the
 * names of its sealed files with whatever parts this host already had, and `complete` must be counted again from those.
 *
 * WHOLE MEANS EVERY PART, ZERO TO `parts - 1`, HELD HERE UNDER THE FILE'S OWN HASH, AND THEIR LENGTHS ADDING UP TO ITS
 * SIZE. A part held under another hash is a part of an older file under the same key, and counts for nothing.
 */

import type { Sql } from '@braindog/ports';

/**
 * Every sealed file's `complete`, counted again from the parts this host holds. Run after an import, in its own
 * transaction, so a file whose bytes were never put on this host imports as not whole and the machine that sealed it
 * puts it again.
 */
export function settleSealed(sql: Sql): void {
  sql.exec(
    `UPDATE sealed_file SET complete = CASE WHEN
       (SELECT count(*) FROM sealed_part p WHERE p.key = sealed_file.key AND p.sha256 = sealed_file.sha256 AND p.part < sealed_file.parts) = sealed_file.parts
       AND (SELECT coalesce(sum(p.bytes), 0) FROM sealed_part p WHERE p.key = sealed_file.key AND p.sha256 = sealed_file.sha256 AND p.part < sealed_file.parts) = sealed_file.size
     THEN 1 ELSE 0 END`,
  );
}
