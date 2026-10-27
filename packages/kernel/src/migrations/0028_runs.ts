/**
 * The kernel schema, migration 28: a run keeps how its work went and how the step it left closed.
 *
 * A RUN HELD ITS STATE AND NOTHING ABOUT HOW IT GOT THERE, so nothing could tell a session that closed from one that
 * crashed, a step left this morning from one left last week, or a subagent from the session it worked for. Nine fields,
 * every one written by the record and none by a person (`KERNEL_WRITTEN` in `session.ts`), none indexed:
 *
 *   - `stretch_at`, when its current stretch of work began: its first write since it opened or came back.
 *   - `next_at`, when its next step was last written. A step written before the stretch began is not fresh.
 *   - `closed_as`, `closed_at`, `taken_by` and `took`: how a step it left closed, and whose step it took.
 *   - `parent`, the run that started it, so a helper ends with its session and leaves no step of its own.
 *   - `wrote`, how many writes it signed, the lines of its opening and attaching left out.
 *   - `seen_before`, when it was last seen in the system it was imported from.
 *
 * AND `abandoned` MAY MOVE TO `done` OR `handoff`: a run the sweep wrote off whose session then says it closed ends as
 * a closed session does (`endRun`), and the data steps below end the runs the sweep took by mistake.
 *
 * A NEW VERSION OF THE SAME DECLARATION, seated as migration 26 seats its own: the live row is stamped superseded and
 * this body is the next version, at one instant. No field is taken away or retyped, so every run is kept as it stands.
 * No index changes, for migration 26's reason: the list's eight are spent, and none of these is read to find a run.
 *
 * THE BODY IS WRITTEN OUT AS ITS CANONICAL BYTES, for migration 2's reason: a migration's checksum is over its text.
 */

import type { Sql } from '@braindog/ports';

/** The declaration body, as JCS: migration 26's, with the nine fields after `started` and `abandoned`'s two moves. */
export const SESSION_BODY =
  '{"done":["done","abandoned"],"fields":[' +
  '{"id":"client_id","type":"text","unique":true},' +
  '{"id":"token_id","index":true,"type":"text"},' +
  '{"default":"other","id":"agent","index":true,"label":"Agent","type":"enum","values":["claude","codex","cursor","gemini","copilot","windsurf","other"]},' +
  '{"id":"client","label":"App","type":"text"},' +
  '{"id":"client_version","label":"App version","type":"text"},' +
  '{"id":"doing","label":"Doing","search":true,"type":"text"},' +
  '{"id":"project","index":true,"label":"Project","type":"text"},' +
  '{"id":"repo","index":true,"type":"text"},' +
  '{"id":"remote","type":"text"},' +
  '{"id":"cwd","type":"text"},' +
  '{"id":"host","index":true,"type":"text"},' +
  '{"id":"branch","type":"text"},' +
  '{"id":"head","type":"text"},' +
  '{"default":"active","id":"state","index":true,"transitions":{"abandoned":{"to":["active","done","handoff"]},' +
  '"active":{"to":["idle","handoff","done","abandoned"]},"done":{"to":["active"]},"handoff":{"to":["active","done"]},' +
  '"idle":{"to":["active","handoff","done","abandoned"]}},"type":"enum","values":["active","idle","handoff","done","abandoned"]},' +
  '{"id":"next","label":"Next step","type":"text"},' +
  '{"id":"tried","label":"Already tried","of":"text","type":"list"},' +
  '{"id":"notes","of":"text","type":"list"},' +
  '{"id":"last_seen","index":true,"label":"Last seen","type":"instant"},' +
  '{"id":"started","label":"Started","type":"instant"},' +
  '{"id":"stretch_at","label":"Working since","type":"instant"},' +
  '{"id":"next_at","label":"Step left","type":"instant"},' +
  '{"id":"closed_as","label":"Step closed as","type":"enum","values":["taken","dropped","expired"]},' +
  '{"id":"closed_at","label":"Step closed","type":"instant"},' +
  '{"id":"taken_by","label":"Taken by","type":"text"},' +
  '{"id":"took","label":"Took the step of","type":"text"},' +
  '{"id":"parent","label":"Helper of","type":"text"},' +
  '{"id":"wrote","label":"Writes","type":"int"},' +
  '{"id":"seen_before","label":"Last seen before","type":"instant"}' +
  '],"icon":"session","id":"session","mobile":["doing","agent","state"],"name":"Agent runs","one":"run","seq_prefix":"S","state":"state","title":"doing"}';

/** SHA-256 of `SESSION_BODY`, which is the `declaration.checksum` of any declaration with this body. */
const CHECKSUM = '77958335353b5dbd913ec066f45fbed3342ba508c77d99cfbc4b26671fbf5f6e';

/** A fixed instant, because a migration's text cannot read the record's clock. */
const DECLARED = '2026-10-08T00:00:00.000Z';

/**
 * Makes this body the active `register.session`, as the next version of that id, unless it already is, and gives every
 * run that has no `started` its own: migration 26's work too, for a file written before it.
 *
 * KEYED ON THE CHECKSUM AND ON THE MISSING FIELD, so it changes nothing the second time and an import can run it after
 * every file, as it ran migration 26's (`brainl.ts`). A file with no `register.session` gets this body as its first
 * version.
 */
export const SEAT_SESSION = `
UPDATE declaration SET superseded_at = '${DECLARED}' WHERE id = 'register.session' AND superseded_at IS NULL AND checksum <> '${CHECKSUM}';
INSERT INTO declaration (id, version, kind, pack_id, body, checksum, retired, superseded_at, created_at)
  SELECT 'register.session', coalesce((SELECT max(version) FROM declaration WHERE id = 'register.session'), 0) + 1, 'register', 'kernel', '${SESSION_BODY}', '${CHECKSUM}', 0, NULL, '${DECLARED}'
  WHERE NOT EXISTS (SELECT 1 FROM declaration WHERE id = 'register.session' AND superseded_at IS NULL);
UPDATE entry SET fields = json_set(fields, '$.started', created_at) WHERE register = 'session' AND json_extract(fields, '$.started') IS NULL;
`;

export default SEAT_SESSION;

/* ── the three data steps, from the hourly tick ─────────────────────────── */

/** How many runs one tick takes through the data steps, so the hour's sweep stays short on a record of thousands. */
export const RUNS_PAGE = 200;

/**
 * The three data steps of migration 28, for the next `limit` runs that have not had them, oldest first. Answers how
 * many runs it took, so the tick knows when the record is through.
 *
 * NOT IN THE MIGRATION ITSELF, because the migration runs as a record opens and these read the log: on the owner's
 * record 752 runs over every line of the event table. The hourly sweep runs them a page at a time instead, and a run
 * is through once it has `wrote`, which every run opened from now on is given as it opens. So the steps run once a run,
 * and a run that writes before its turn waits for it (`attribute` counts only a run that has `wrote`), counted then
 * from the log with its newest writes in it.
 *
 *   1. ENDED, NOT ABANDONED. A run whose newest state line is the sweep's own move from idle to abandoned was a
 *      session that closed normally and wrote idle as it went (the end hook before `endRun`), so it is done. About 740
 *      of the owner's 752 runs read abandoned this way. A run the sweep took while active went silent mid-work, and
 *      stays abandoned.
 *   2. `wrote`, counted from the log: the writes signed by its spoken name, one a write however many fields it
 *      touched, leaving out its opening and attaching (notes `opened:` and `attached:`) and the ladder bringing it back.
 *   3. `next_at`, from the newest line that set `next`.
 *
 * IN PLACE, as migration 26 gives a run its `started`: no version, no `updated_at` and no event, because the record
 * putting its own books right is not an edit anybody made, and 740 runs moved to the top of every list by
 * `updated_at` would bury the runs that are working.
 */
export function runsDataSteps(sql: Sql, limit = RUNS_PAGE): number {
  const runs = sql.all<{ id: string; seq: number; state: string | null }>(
    "SELECT id, seq, state FROM entry WHERE register = 'session' AND json_extract(fields, '$.wrote') IS NULL ORDER BY seq LIMIT ?",
    Math.max(0, Math.floor(limit)),
  );
  if (runs.length === 0) return 0;
  /* ONE WALK OF THE LOG FOR THE PAGE, grouped by who signed, rather than a walk per run: the log has no index on the
     actor, and a list of 200 names bound one by one is past what some databases bind. A write is its lines' `batch`,
     which its first line leaves empty and names the rest by, so a write of three fields counts once. */
  const counted = new Map(
    sql
      .all<{ actor: string; n: number }>(
        `SELECT actor, COUNT(DISTINCT coalesce(batch, id)) AS n FROM event
         WHERE actor GLOB 'S[1-9]*'
           AND (note IS NULL OR (note NOT LIKE 'opened:%' AND note NOT LIKE 'attached:%'))
           AND NOT (kind = 'state' AND to_v = '"active"' AND from_v IN ('"idle"', '"handoff"', '"done"', '"abandoned"'))
         GROUP BY actor`,
      )
      .map((r) => [r.actor, Number(r.n)]),
  );
  for (const run of runs) {
    const target = `entry:${run.id}`;
    const last = sql.one<{ actor: string; from_v: string | null; to_v: string | null }>(
      "SELECT actor, from_v, to_v FROM event WHERE target = ? AND kind = 'state' ORDER BY ts DESC, id DESC LIMIT 1",
      target,
    );
    const ended = run.state === 'abandoned' && last?.actor === 'system' && last.from_v === '"idle"' && last.to_v === '"abandoned"';
    const step = sql.one<{ ts: string }>(
      `SELECT ts FROM event WHERE target = ?
         AND ((kind = 'edit' AND field = 'next') OR (kind = 'create' AND json_valid(to_v) AND json_extract(to_v, '$.next') IS NOT NULL))
       ORDER BY ts DESC, id DESC LIMIT 1`,
      target,
    );
    const wrote = counted.get(`S${String(run.seq)}`) ?? 0;
    if (ended) sql.exec("UPDATE entry SET state = 'done', fields = json_set(fields, '$.state', 'done') WHERE id = ?", run.id);
    if (step) sql.exec("UPDATE entry SET fields = json_set(fields, '$.wrote', ?, '$.next_at', ?) WHERE id = ?", wrote, step.ts, run.id);
    else sql.exec("UPDATE entry SET fields = json_set(fields, '$.wrote', ?) WHERE id = ?", wrote, run.id);
  }
  return runs.length;
}
