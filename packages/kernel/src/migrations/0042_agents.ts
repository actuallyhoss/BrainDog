/**
 * The kernel schema, migration 42: what he tells an agent, and the settings each kind of agent works under (agents and
 * MCP plan §8.1, §9).
 *
 * FOUR THINGS, ALL ADDITIVE:
 *
 *   1. `register.instructions`, a kernel register seated by SQL as migration 28 seats `session`: one row per thing he
 *      told an agent, `IN4`, from Sent through Seen and Working to Done, Needs you, Declined, Expired or Withdrawn.
 *      Its delivery fields and the agent's reply are written by the kernel alone (`INSTRUCTION_KERNEL_WRITTEN` in
 *      `instruction.ts`). The run, project, task and replaced instruction it names are text, as a run's own `taken_by`
 *      and `parent` are: a run is named `S883`, a project as a run names it, and the kernel's register leans on no
 *      add-on's list.
 *   2. The next version of `register.session`, with six fields every one of which only the record writes
 *      (`KERNEL_WRITTEN` in `session.ts`): the instruction and the task in hand, the settings row the run works under,
 *      when the bridge last said the session is open (`pulse_at`), whether he paused or stopped it, and the worktree
 *      folder kept apart from the repository. No field is taken away or retyped, so every run is kept as it stands.
 *   3. `instruction_seen`, one row per run shown an instruction and how, `local` because it is this installation's
 *      delivery record; and `agent_profile`, one settings row per kind of agent (or per token or machine), which
 *      travels with the record's governance. The row with id `default` is Defaults. A table and not a register, so no
 *      token's write path can reach it: only `setProfile` writes it, for a person in a browser.
 *   4. One index: open runs by `pulse_at`, for presence. Open instructions need none, `entry_state` already holds
 *      `(register, state)`. No index of the runs list changes: its eight are spent (migration 26's reason).
 *
 * THE ONE PROFILE PER AGENT KIND HIS RUNS HAVE USED is not written here, because it reads the runs and their tokens:
 * the hourly tick does it once (`agentsDataSteps` below), as migration 28's data steps run there.
 *
 * THE BODIES ARE WRITTEN OUT AS THEIR CANONICAL BYTES, for migration 2's reason: a migration's checksum is over its
 * text. `IF NOT EXISTS`, `OR IGNORE` and the seats keyed on their checksums, so it can run twice, as
 * `migrate.test.ts` runs every migration over itself, and an import can run the seat after every file.
 */

import type { Sql } from '@braindog/ports';

import { SESSION_BODY as SESSION_28 } from './0028_runs.ts';

/** Where migration 28's list of fields ends, and the rest of its body begins. */
const FIELDS_END = '],"icon":"session"';

/**
 * The runs list's next version: migration 28's body, byte for byte, with the six fields of this migration after its
 * last field, `seen_before`. Spliced from 28's bytes rather than copied, so the two can never disagree about a field
 * they share; 28's file is locked (`LOCK.json`), so this text is as fixed as if it were written out.
 */
export const SESSION_BODY =
  SESSION_28.slice(0, SESSION_28.indexOf(FIELDS_END)) +
  ',' +
  '{"id":"instruction","label":"Told","type":"text"},' +
  '{"id":"task","label":"Task in hand","type":"text"},' +
  '{"id":"profile","label":"Settings","type":"text"},' +
  '{"id":"pulse_at","label":"Open as of","type":"instant"},' +
  '{"id":"stopped","label":"Stopped by you","type":"enum","values":["pause","stop"]},' +
  '{"id":"worktree","label":"Worktree","type":"text"}' +
  SESSION_28.slice(SESSION_28.indexOf(FIELDS_END));

/** SHA-256 of `SESSION_BODY`, which is the `declaration.checksum` of any declaration with this body. */
const SESSION_CHECKSUM = '54b66a634cf676afe5f165cee5f29dca4e05401e89ff98aeb24e67c41ad4d0c3';

/**
 * The instructions list, as JCS. The terminal states move nowhere (`to: []`), so a closed instruction is never opened
 * again: a new word from him is a new instruction.
 */
export const INSTRUCTIONS_BODY =
  '{"done":["done","declined","expired","withdrawn"],"fields":[' +
  '{"id":"said","label":"Said","required":true,"search":true,"type":"text"},' +
  '{"default":"tell","id":"kind","label":"Kind","type":"enum","values":["tell","stop","pause","resume","redirect"]},' +
  '{"default":"next","id":"when","label":"When","type":"enum","values":["now","next"]},' +
  '{"default":"anyone","id":"to","label":"To","type":"enum","values":["run","agent","anyone","task"]},' +
  '{"id":"to_run","label":"Run","type":"text"},' +
  '{"id":"to_agent","label":"Agent","type":"text"},' +
  '{"id":"project","label":"Project","type":"text"},' +
  '{"id":"task","label":"Task","type":"text"},' +
  '{"id":"repo","label":"Repository","type":"text"},' +
  '{"id":"replaces","label":"Replaces","type":"text"},' +
  '{"id":"expires_at","label":"Waits until","type":"instant"},' +
  '{"default":"sent","id":"state","label":"State","transitions":{"declined":{"to":[]},"done":{"to":[]},"expired":{"to":[]},' +
  '"needs_you":{"to":["done","declined","withdrawn"]},"seen":{"to":["working","declined","expired","withdrawn"]},' +
  '"sent":{"to":["seen","working","declined","expired","withdrawn"]},"withdrawn":{"to":[]},"working":{"to":["done","needs_you","declined"]}},' +
  '"type":"enum","values":["sent","seen","working","done","needs_you","declined","expired","withdrawn"]},' +
  '{"id":"seen_by","label":"Seen by","type":"text"},' +
  '{"id":"seen_how","label":"Seen how","type":"enum","values":["start","prompt","tool","channel","job","asked"]},' +
  '{"id":"seen_at","label":"Seen","type":"instant"},' +
  '{"id":"taken_by","label":"Taken by","type":"text"},' +
  '{"id":"taken_at","label":"Taken","type":"instant"},' +
  '{"id":"reply","label":"Reply","search":true,"type":"text"},' +
  '{"id":"replied_at","label":"Replied","type":"instant"},' +
  '{"id":"job","label":"Job","type":"text"}' +
  '],"icon":"send","id":"instructions","mobile":["said","state","to"],"name":"Instructions","one":"instruction","seq_prefix":"IN","state":"state","title":"said"}';

/** SHA-256 of `INSTRUCTIONS_BODY`. */
const INSTRUCTIONS_CHECKSUM = '9bd534e3c1c5d4cd8ed1ad6cea34ba048eb9f79afdd79bddbda948979d28ccda';

/** A fixed instant, because a migration's text cannot read the record's clock. */
const DECLARED = '2026-10-21T00:00:00.000Z';

/**
 * Makes this migration's bodies the active `register.session` and `register.instructions`, unless they already are, and
 * gives every run that has no `started` its own: migration 28's seat, carried forward.
 *
 * WHAT AN IMPORT RUNS AFTER EVERY FILE (`brainl.ts`), in place of migration 28's: a file written before this migration
 * carries 28's runs list and no instructions list, and the file's declarations replace the table. Keyed on the
 * checksums, so it changes nothing the second time.
 */
export const SEAT_AGENTS = `
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

export default `${SEAT_AGENTS}
CREATE TABLE IF NOT EXISTS instruction_seen (
  instruction TEXT NOT NULL,
  run         TEXT NOT NULL,
  how         TEXT NOT NULL CHECK (how IN ('start','prompt','tool','channel','job','asked')),
  at          TEXT NOT NULL,
  PRIMARY KEY (instruction, run)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS agent_profile (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  match       TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(match)),
  ceiling     TEXT NOT NULL DEFAULT 'propose' CHECK (ceiling IN ('read','propose','write')),
  projects    TEXT CHECK (projects IS NULL OR json_valid(projects)),
  lists_write TEXT CHECK (lists_write IS NULL OR json_valid(lists_write)),
  tools       TEXT CHECK (tools IS NULL OR json_valid(tools)),
  brief       TEXT,
  model       TEXT,
  quiet       TEXT CHECK (quiet IS NULL OR json_valid(quiet)),
  caps        TEXT CHECK (caps IS NULL OR json_valid(caps)),
  notify      TEXT CHECK (notify IS NULL OR json_valid(notify)),
  context     TEXT CHECK (context IS NULL OR json_valid(context)),
  enforce     TEXT CHECK (enforce IS NULL OR json_valid(enforce)),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  retired_at  TEXT
);
INSERT OR IGNORE INTO dog_section (table_name, section) VALUES ('instruction_seen', 'local'), ('agent_profile', 'governance');
CREATE INDEX IF NOT EXISTS entry_session_pulse ON entry(json_extract(fields, '$.pulse_at')) WHERE register = 'session' AND deleted_at IS NULL AND state IN ('active', 'idle');
`;

/* ── the data step, from the hourly tick ────────────────────────────────── */

/** The agent kinds a settings row may match, the runs list's and the two that run with no person at a terminal. */
export const PROFILE_KINDS = ['claude', 'codex', 'cursor', 'gemini', 'copilot', 'windsurf', 'other', 'runner', 'script'] as const;

/** What each kind's row is called when the data step makes it. */
const KIND_NAMES: Readonly<Record<string, string>> = {
  claude: 'Claude Code',
  codex: 'Codex',
  cursor: 'Cursor',
  gemini: 'Gemini',
  copilot: 'Copilot',
  windsurf: 'Windsurf',
  other: 'Other agents',
};

/**
 * Migration 42's data step: one settings row per kind of agent the record's runs have used, each at the scope of the
 * token that kind's newest run was opened with, then `default` at `propose` (Suggest). Answers how many rows it wrote.
 *
 * HIS CURRENT AGENTS KEEP WHAT THEY HAVE (plan §5.2): Claude on his Mac, whose token writes, gets a row at `write`, and
 * only a kind no row matches starts at Suggest. A kind whose newest run carries no token, or a token since deleted,
 * starts at `propose` like a new one.
 *
 * ONCE PER RECORD, KEYED ON `default`: the step does nothing once the Defaults row exists, so a row he retires is never
 * made again by the next tick, and the tick costs one indexed read after the first hour.
 */
export function agentsDataSteps(sql: Sql, now: string): number {
  if (sql.one<{ id: string }>("SELECT id FROM agent_profile WHERE id = 'default'")) return 0;
  const kinds = sql.all<{ agent: string; scope: string | null }>(
    `SELECT k.agent AS agent,
       (SELECT t.scope FROM entry s JOIN token t ON t.id = json_extract(s.fields, '$.token_id')
          WHERE s.register = 'session' AND s.deleted_at IS NULL AND coalesce(json_extract(s.fields, '$.agent'), 'other') = k.agent
          ORDER BY s.seq DESC LIMIT 1) AS scope
     FROM (SELECT DISTINCT coalesce(json_extract(fields, '$.agent'), 'other') AS agent FROM entry
           WHERE register = 'session' AND deleted_at IS NULL) k
     ORDER BY k.agent`,
  );
  let n = 0;
  for (const { agent, scope } of kinds) {
    if (!(PROFILE_KINDS as readonly string[]).includes(agent)) continue;
    const ceiling = scope === 'read' || scope === 'write' ? scope : 'propose';
    sql.exec(
      `INSERT OR IGNORE INTO agent_profile (id, name, match, ceiling, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      `kind-${agent}`,
      KIND_NAMES[agent] ?? agent,
      JSON.stringify({ kind: agent }),
      ceiling,
      now,
      now,
    );
    n++;
  }
  sql.exec(
    "INSERT OR IGNORE INTO agent_profile (id, name, match, ceiling, created_at, updated_at) VALUES ('default', 'Defaults for new agents', '{}', 'propose', ?, ?)",
    now,
    now,
  );
  return n + 1;
}
