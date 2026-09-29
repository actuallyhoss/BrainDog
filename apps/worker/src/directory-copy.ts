/**
 * The Directory's nightly copy, in R2: sealed to `AGE_RECIPIENT`, under `directory/snapshots/`, thirty kept.
 *
 * WHY THE DIRECTORY NEEDS ONE AT ALL. Every record is copied nightly and nothing copied the Directory, which is the
 * only place that knows which person is which, which name reaches which record, who may reach it and their passkeys.
 * Lose it and every record survives with nobody able to reach one: `idFromName(rec_id)` still opens the object, and no
 * slug, session or passkey leads there. The lines are `createDirectory(...).dump()`, which carries the durable tables
 * and leaves out sessions, links, challenges and strikes; `load` puts them into an empty Directory.
 *
 * SEALED FOR THE SAME REASON A RECORD'S COPY IS, AND BY THE SAME RULE. Nothing in the lines opens anything (every id,
 * link and challenge is an HMAC, passkeys are public halves, inbound tokens are digests), but they hold every address
 * on the deployment. So a real recipient seals, an empty one is an operator who chose plaintext and knows it, and the
 * placeholder `wrangler.jsonc` ships with is a throw naming the variable, as `snapshots.ts` decides for records.
 *
 * ITS OWN PUT AND PRUNE, AND NOT `r2Snapshots` WITH `directory` FOR A RECORD ID. That would have been fewer lines and
 * the wrong file: `r2Snapshots` names what it writes `.brainl`, and these lines are not a `.brainl` (`checkBrainl`
 * refuses them at the first line), so a drill or `braindog verify` pointed at one would report a damaged record rather
 * than a Directory. `.dirl` is this file's own name for them, and it is also why a `verify` never mistakes one.
 *
 * ONE BUFFER, NOT A STREAM. A record's copy streams because a record may be 40 MiB and the isolate holds 128. The
 * Directory is rows per person: one person with one record dumps to 739 bytes in 15 lines (measured with this build's
 * `dump`), so ten thousand customers are around seven MiB. The table that grows on its own is `dir_usage_day`, one row
 * per record, action and UTC day for as long as the record lives, and it is what reaches the ceiling first. `CEILING`
 * refuses above 40 MiB with a sentence, and that is the day to stream it or to stop carrying old usage days.
 */

import { recipientOf, sealTo } from './seal.ts';
import { CEILING, KEEP, type Blobs } from './snapshots.ts';

/** Where the Directory's copies live. Not under any `rec_…/` prefix, so no record's deletion can sweep them. */
export const DIRECTORY_COPIES = 'directory/snapshots/';

const PLAIN = '.dirl';
const SEALED = '.dirl.age';

/** A dated copy: `nightly-2026-09-23.dirl` or `.dirl.age`. */
const DATED = /^nightly-(\d{4}-\d{2}-\d{2})\.dirl(?:\.age)?$/u;

/** What one night's copy of the Directory came to. `rows` counts row lines, not the `#` lines that describe the file. */
export type DirectoryKept = { key: string; bytes: number; rows: number; at: string };

/**
 * The Directory's copies in one bucket.
 *
 * BUILDING IT THROWS on a recipient that is named and is not an `age1` X25519 recipient, before anything is dumped, so
 * the night's line says `AGE_RECIPIENT` once rather than the copy failing with a sentence about something else.
 */
export function directoryCopies(blobs: Blobs, o: { recipient?: string | undefined } = {}) {
  let seal: ((file: Uint8Array) => Promise<Uint8Array>) | undefined;
  if (o.recipient) {
    const key = recipientOf(o.recipient);
    if (typeof key === 'string') throw new Error(`The Directory's nightly copy did not run: ${key}`);
    seal = sealTo(key);
  }
  const ext = seal ? SEALED : PLAIN;
  const latest = `${DIRECTORY_COPIES}latest${ext}`;

  /** Every key under the prefix, paged. The keys are carried, never rebuilt, for the reason `snapshots.ts` measured. */
  const held = async (): Promise<string[]> => {
    const keys: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await blobs.list({ prefix: DIRECTORY_COPIES, ...(cursor === undefined ? {} : { cursor }) });
      for (const object of page.objects) keys.push(object.key);
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor !== undefined);
    return keys;
  };

  /* THE THIRTY NEWEST DATED COPIES, WHATEVER THEIR EXTENSION, AND ONLY THE POINTER THIS BUILD WRITES. A `latest` under
     the other extension is a leftover and not a pointer: an unsealed one outlives the day sealing was turned on, with
     every address in it, because nothing would ever write that exact key again. */
  const prune = async (): Promise<void> => {
    const keys = await held();
    const dated = keys
      .map((key) => ({ key, day: DATED.exec(key.slice(DIRECTORY_COPIES.length))?.[1] }))
      .filter((k): k is { key: string; day: string } => k.day !== undefined)
      .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
    const doomed = [
      ...dated.slice(KEEP).map((k) => k.key),
      ...keys.filter((key) => (key === `${DIRECTORY_COPIES}latest${PLAIN}` || key === `${DIRECTORY_COPIES}latest${SEALED}`) && key !== latest),
    ];
    if (doomed.length > 0) await blobs.delete(doomed);
  };

  return {
    /**
     * One night's copy: sealed, put under tonight's date and then as `latest`, then pruned to thirty.
     *
     * EVERY FAILURE THROWS, as a record's `take` does. The caller says so in the night's lines; a copy that returned
     * after a refused put would leave last night's `latest` looking like tonight's.
     */
    async take(lines: readonly string[], at: string): Promise<DirectoryKept> {
      const file = new TextEncoder().encode(lines.join('\n'));
      if (file.length > CEILING)
        throw new Error(`The Directory dumped ${String(file.length)} bytes, over the 40 MiB a copy is put in one piece. It is time to stream it.`);
      const rows = lines.reduce((n, line) => (line.startsWith('#') ? n : n + 1), 0);
      const body = seal ? await seal(file) : file;
      const key = `${DIRECTORY_COPIES}nightly-${at.slice(0, 10)}${ext}`;
      const meta = { rows: String(rows), bytes: String(file.length), at };
      /* THE DATED KEY FIRST AND `latest` SECOND, so a failed second put leaves `latest` naming a copy that opens. */
      await blobs.put(key, body, { customMetadata: meta });
      await blobs.put(latest, body, { customMetadata: meta });
      await prune();
      return { key, bytes: file.length, rows, at };
    },
  };
}
