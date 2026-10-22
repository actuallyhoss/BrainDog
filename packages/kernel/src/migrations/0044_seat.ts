/**
 * The kernel schema, migration 44: which Claude Code profile a run is under, and an instruction or a job aimed at a
 * machine or a profile (sync and seats scope §4, §9).
 *
 * THREE THINGS, ALL ADDITIVE:
 *
 *   1. The next version of `register.session`, with one field only the record writes (`KERNEL_WRITTEN` in
 *      `session.ts`): `seat`, the name of the profile the run's agent works under, `quartz` for `~/.claude-quartz` and
 *      `default` for `~/.claude`, as the agent's own headers say it (`x-braindog-profile`). A NAME AND NEVER A PATH, so a
 *      folder on his machine never reaches the record. Not called `profile`, which since migration 42 is the settings
 *      row a run works under. No field is taken away or retyped, so every run is kept as it stands, and it takes no
 *      index: the runs list's eight are spent (migration 26's reason).
 *   2. The next version of `register.instructions`, with two fields beside `project` and `repo`: `machine`, the machine
 *      a run must be on to take it, and `seat`, the profile it must be under. Each narrows who it reaches, as the project
 *      does; neither is a new kind of `to`, so an older reader of an instruction reads one aimed more widely.
 *   3. `job_place`, one row per job started for a machine or a profile, and the machine that ran it: a side table, not
 *      columns on `job`, so this can run twice, and `local` with the job it describes.
 *
 * THE BODIES ARE SPLICED FROM MIGRATION 42'S BYTES, for its reason: the two can never disagree about a field they
 * share, and 42's file is locked (`LOCK.json`), so this text is as fixed as if it were written out. `IF NOT EXISTS`,
 * `OR IGNORE` and the seats keyed on their checksums, so it can run twice, and an import runs the seat after every file.
 */

import { INSTRUCTIONS_BODY as INSTRUCTIONS_42, SESSION_BODY as SESSION_42 } from './0042_agents.ts';

/** Where migration 42's runs list of fields ends, and the rest of its body begins. */
const FIELDS_END = '],"icon":"session"';

/** The field of migration 42's instructions list the two new fields follow. */
const AFTER_REPO = '{"id":"repo","label":"Repository","type":"text"},';

/** The runs list's next version: migration 42's body with `seat` after its last field, `worktree`. */
export const SESSION_BODY =
  SESSION_42.slice(0, SESSION_42.indexOf(FIELDS_END)) +
  ',' +
  '{"id":"seat","label":"Profile","type":"text"}' +
  SESSION_42.slice(SESSION_42.indexOf(FIELDS_END));

/** SHA-256 of `SESSION_BODY`, which is the `declaration.checksum` of any declaration with this body. */
const SESSION_CHECKSUM = '05245daa25630eda31d501d931a801017b8f8a3093eef19bcab984aed8093f64';

/** The instructions list's next version: migration 42's body with `machine` and `seat` after `repo`. */
export const INSTRUCTIONS_BODY = INSTRUCTIONS_42.replace(
  AFTER_REPO,
  AFTER_REPO + '{"id":"machine","label":"Machine","type":"text"},' + '{"id":"seat","label":"Profile","type":"text"},',
);

/** SHA-256 of `INSTRUCTIONS_BODY`. */
const INSTRUCTIONS_CHECKSUM = '92b1107f89fb0d8e17e1657d460e9f0fa0f3f79e302eb713f0f239c065553a20';

/** A fixed instant, because a migration's text cannot read the record's clock. */
const DECLARED = '2026-10-22T00:00:00.000Z';

/**
 * Makes this migration's bodies the active `register.session` and `register.instructions`, unless they already are, and
 * gives every run that has no `started` its own: migration 42's seat, carried forward.
 *
 * WHAT AN IMPORT RUNS AFTER EVERY FILE (`brainl.ts`), in place of migration 42's: a file written before this migration
 * carries 42's lists or older ones, and the file's declarations replace the table. Keyed on the checksums, so it
 * changes nothing the second time.
 */
export const SEAT_KERNEL_REGISTERS = `
UPDATE declaration SET superseded_at = '${DECLARED}' WHERE id = 'register.session' AND superseded_at IS NULL AND checksum <> '${SESSION_CHECKSUM}';
INSERT INTO declaration (id, version, kind, pack_id, body, checksum, retired, superseded_at, created_at)
  SELECT 'register.session', coalesce((SELECT max(version) FROM declaration WHERE id = 'register.session'), 0) + 1, 'register', 'kernel', '${SESSION_BODY}', '${SESSION_CHECKSUM}', 0, NULL, '${DECLARED}'
  WHERE NOT EXISTS (SELECT 1 FROM declaration WHERE id = 'register.session' AND superseded_at IS NULL);
UPDATE declaration SET superseded_at = '${DECLARED}' WHERE id = 'register.instructions' AND superseded_at IS NULL AND checksum <> '${INSTRUCTIONS_CHECKSUM}';
INSERT INTO declaration (id, version, kind, pack_id, body, checksum, retired, superseded_at, created_at)
  SELECT 'register.instructions', coalesce((SELECT max(version) FROM declaration WHERE id = 'register.instructions'), 0) + 1, 'register', 'kernel', '${INSTRUCTIONS_BODY}', '${INSTRUCTIONS_CHECKSUM}', 0, NULL, '${DECLARED}'
  WHERE NOT EXISTS (SELECT 1 FROM declaration WHERE id = 'register.instructions' AND superseded_at IS NULL);
UPDATE entry SET fields = json_set(fields, '$.started', created_at) WHERE register = 'session' AND json_extract(fields, '$.started') IS NULL;
`;

export default `${SEAT_KERNEL_REGISTERS}
CREATE TABLE IF NOT EXISTS job_place (
  job_id  TEXT PRIMARY KEY,
  machine TEXT,
  seat    TEXT,
  ran_on  TEXT
) WITHOUT ROWID;
INSERT OR IGNORE INTO dog_section (table_name, section) VALUES ('job_place', 'local');
`;
