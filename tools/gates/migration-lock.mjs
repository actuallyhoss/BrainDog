/**
 * `migration-lock`: an applied migration is never edited, and a new one ships with its rehearsal (LCH-C06).
 *
 *   node tools/gates/migration-lock.mjs [root]
 *
 * THE RUNNER ALREADY KEEPS A CHECKSUM FOR EACH APPLIED MIGRATION (`packages/kernel/src/migrate.ts`), and it compares
 * them when a record opens. That is the refusal on a live record, which is the break itself: the edit has shipped, and
 * every record that ran the old text answers `SCHEMA_MISMATCH` until a deploy puts it back. This is the same comparison
 * made before anything ships, against `packages/kernel/src/migrations/LOCK.json`, one line per migration file.
 *
 * WHAT IS RED, each a line naming its file:
 *   - a locked file whose checksum moved: the text a record already ran is not the text on disk.
 *   - a number skipped or held twice: the number is the version a record keeps, so a gap or a pair is a defect.
 *   - a file that is not in the lock, and a locked file that is gone.
 *   - a file the lock does not mark `applied` with no passing receipt: a new migration is rehearsed on a copy of a real
 *     record (`apps/cli/scripts/migration-rehearsal.mjs`) before it ships, and the rehearsal writes the receipt.
 *
 * THE CHECKSUM IS THE RUNNER'S OWN, IMPORTED AND NEVER REWRITTEN: `checksum` over the file's default export, which is
 * what `MIGRATIONS` holds and what a record's ledger was written from. So a trailing space or a CRLF moves nothing, as
 * `canon` says, and a change to the SQL moves it, whatever editor made it.
 *
 * IT RETURNS 1 AND FALLS OFF THE END FOR A PASS, which is what `self-test`'s `silent-pass` grep rests on.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { checksum } from '../../packages/kernel/src/migrate.ts';

/** Where the migrations are, and the lock beside them, repo-relative. */
export const MIGRATIONS_DIR = 'packages/kernel/src/migrations';
export const LOCK = `${MIGRATIONS_DIR}/LOCK.json`;

/** A migration file: four digits, an underscore, a slug, `.ts`. */
export const FILE = /^(\d{4})_([a-z0-9_]+)\.ts$/u;

const HEX64 = /^[0-9a-f]{64}$/u;

/** A migration's number as its file writes it, four digits. */
const DIGITS = '0000';

/** A receipt that lets a migration ship: a date, at least one record, a count of rows, and PASS. Never a name. */
export const passed = (r) =>
  r !== null && typeof r === 'object' && typeof r.at === 'string' && Number.isInteger(r.records) && r.records > 0 && Number.isInteger(r.rows) && r.rows >= 0 && r.pass === true;

/**
 * THE OWNER'S WAIVER, the one other way a new migration ships: a date, the word `owner`, and why, written when the
 * owner chooses to ship without a rehearsal because no copy of a real record could be had. It is the owner's choice
 * (LCH-C06), so the gate takes it only in that shape, and a rehearsal that later passes writes its receipt beside it.
 */
export const waived = (w) =>
  w !== null && typeof w === 'object' && typeof w.at === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(w.at) && w.by === 'owner' && typeof w.why === 'string' && w.why.trim().length > 0;

/**
 * The lock as it is written: one line per file, in file order, so a diff of it is one line per migration.
 */
export function lockText(lock) {
  const lines = Object.keys(lock)
    .sort()
    .map((file) => {
      const { checksum: sum, applied, rehearsed, waived: w } = lock[file];
      return `  ${JSON.stringify(file)}: ${JSON.stringify({ checksum: sum, applied: applied === true, rehearsed: rehearsed ?? null, ...(w ? { waived: w } : {}) })}`;
    });
  return `{\n${lines.join(',\n')}\n}\n`;
}

/**
 * Every `.ts` file in the migrations folder under `root`, with its number and the runner's checksum of its text.
 * A file that does not import, or whose default export is not text, comes back with `error` and no sum.
 */
export async function sumsOf(root) {
  const dir = join(root, MIGRATIONS_DIR);
  if (!existsSync(dir)) return null;
  const out = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts')).sort()) {
    const m = FILE.exec(file);
    if (!m) {
      out.push({ file, number: null, error: 'is not named as a migration is, four digits, an underscore and a slug' });
      continue;
    }
    try {
      const text = (await import(pathToFileURL(join(dir, file)).href)).default;
      if (typeof text !== 'string') out.push({ file, number: Number(m[1]), error: 'has no SQL text as its default export' });
      else out.push({ file, number: Number(m[1]), sum: await checksum(text) });
    } catch (e) {
      out.push({ file, number: Number(m[1]), error: `could not be read: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}` });
    }
  }
  return out;
}

const pad = (n) => String(n).padStart(DIGITS.length, '0');

/**
 * The findings for the files on disk against the lock, each a line naming one file (or one number). Pure, so the test
 * holds each rule to a tree it plants.
 */
export function verdict(files, lock) {
  const findings = [];
  const at = (file) => `${MIGRATIONS_DIR}/${file}`;
  const byNumber = new Map();
  for (const f of files) {
    if (f.error) {
      findings.push(`  ${at(f.file)} ${f.error}.`);
      if (f.number === null) continue;
    }
    byNumber.set(f.number, [...(byNumber.get(f.number) ?? []), f.file]);
  }
  for (const [n, held] of [...byNumber].sort((a, b) => a[0] - b[0]))
    if (held.length > 1)
      findings.push(`  ${MIGRATIONS_DIR}: number ${pad(n)} is held twice, by ${held.join(' and ')}. The number is the version a record keeps, so one of them takes the next free number.`);
  const highest = Math.max(0, ...byNumber.keys());
  for (let n = 1; n <= highest; n++)
    if (!byNumber.has(n)) findings.push(`  ${MIGRATIONS_DIR}: number ${pad(n)} is skipped. Migrations are numbered from 0001 with no gap, because the runner reads the number as the place.`);

  for (const f of files) {
    if (f.error) continue;
    const entry = lock[f.file];
    const line = `"${f.file}": {"checksum": "${f.sum}", "applied": false, "rehearsed": null}`;
    if (entry === undefined) {
      findings.push(
        `  ${at(f.file)} is not in the lock. Add ${line} to ${LOCK}, then rehearse it on a copy of a record (apps/cli/scripts/migration-rehearsal.mjs --record <a copy>), which writes its receipt.`,
      );
      continue;
    }
    if (entry === null || typeof entry !== 'object' || !HEX64.test(String(entry.checksum))) {
      findings.push(`  ${at(f.file)} has a line in the lock with no checksum the runner could have written.`);
      continue;
    }
    if (entry.checksum !== f.sum) {
      findings.push(
        `  ${at(f.file)} is not the text the lock holds: its checksum is ${f.sum} and the lock says ${entry.checksum}. A migration a record has run is never edited. Put its text back and write the change as the next migration.`,
      );
      continue;
    }
    if (entry.applied !== true && !passed(entry.rehearsed) && !waived(entry.waived))
      findings.push(
        `  ${at(f.file)} has no passing rehearsal in the lock. Run apps/cli/scripts/migration-rehearsal.mjs --record <a copy of a record> before it ships; a PASS writes the receipt.`,
      );
  }
  const onDisk = new Set(files.map((f) => f.file));
  for (const file of Object.keys(lock).sort())
    if (!onDisk.has(file)) findings.push(`  ${at(file)} is in the lock and not on disk. A record that ran it still holds its version, so it is never removed.`);
  return findings;
}

export default async function migrationLock(
  root = process.env.BRAINDOG_GATE_ROOT ?? join(fileURLToPath(new URL('.', import.meta.url)), '..', '..'),
) {
  const ROOT = resolve(root);
  const files = await sumsOf(ROOT);
  /* A GATE THAT READ NOTHING HAS NOT PASSED, AND HERE IT IS RED: this repository always holds its migrations, so a root
     with none is a root named wrong, never a checkout to skip. */
  if (files === null || files.length === 0) {
    console.error(`  migration-lock: no migration to read under ${ROOT}, so nothing was held to the lock.`);
    return 1;
  }
  let lock;
  try {
    lock = JSON.parse(readFileSync(join(ROOT, LOCK), 'utf8'));
    if (lock === null || typeof lock !== 'object' || Array.isArray(lock)) throw new Error('it is not one object of files');
  } catch (e) {
    console.error(`  ${LOCK} could not be read: ${e instanceof Error ? e.message : String(e)}`);
    console.error('\n  migration-lock: 1 finding(s).');
    return 1;
  }
  const findings = verdict(files, lock);
  if (findings.length === 0) {
    console.log(`  migration-lock: ${files.length} migration(s), each the text the lock holds, 0 finding(s)`);
    return;
  }
  for (const f of findings) console.error(f);
  console.error(
    `\n  migration-lock: ${files.length} migration(s), ${findings.length} finding(s).\n` +
      '  The runner refuses a record whose applied migration changed, and that refusal is on a live record. This is the\n' +
      '  same check before anything ships.',
  );
  return 1;
}

/* AND IT IS STILL A SCRIPT, because `self-test` spawns each gate at its seeded fixture. `?? 0` because a pass returns
   nothing. */
if (import.meta.main) process.exitCode = (await migrationLock(process.argv[2])) ?? 0;
