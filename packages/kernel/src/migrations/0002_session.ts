/**
 * The kernel schema, migration 2: the `session` register.
 *
 * The one register the kernel declares (`02 §1`, `32 §2.1`), because its rows are the agents: a
 * record without it cannot say which agent wrote what. It is an ordinary declaration row with
 * `pack_id = 'kernel'`, so `list`, `get` and `update` reach it with no new method, and its
 * `seq_prefix` makes its rows spoken `S1`, `S2`.
 *
 * THE BODY IS WRITTEN OUT AS ITS CANONICAL BYTES rather than built by `jcs` from an object. A
 * migration's checksum is over its text, so SQL assembled by a function would change whenever the
 * function did, and every record would then refuse to open with `SCHEMA_MISMATCH`.
 * `session-register.test.ts` checks that these bytes, this checksum and these indexes are what
 * `installDeclarations` writes for the same declaration.
 *
 * A RECORD MAY ALREADY HOLD A `register.session` of its own, declared before this build. Its row is
 * superseded rather than collided with, and its rows are kept, as any new version keeps them.
 *
 * NO `seq:session` COUNTER IS SEEDED. `allocate` creates a register's counter at its first row, and
 * a seeded one would make every new record look non-empty to an import.
 */

/** The declaration body, as JCS. The write path's `sessionDeclaration()` reads it from here. */
export const SESSION_BODY =
  '{"done":["done","abandoned"],"fields":[' +
  '{"id":"client_id","type":"text","unique":true},' +
  '{"id":"token_id","index":true,"type":"text"},' +
  '{"default":"other","id":"agent","index":true,"label":"Agent","type":"enum","values":["claude","codex","cursor","other"]},' +
  '{"id":"doing","label":"Doing","search":true,"type":"text"},' +
  '{"id":"project","index":true,"label":"Project","type":"text"},' +
  '{"id":"repo","index":true,"type":"text"},' +
  '{"id":"remote","type":"text"},' +
  '{"id":"cwd","type":"text"},' +
  '{"id":"host","index":true,"type":"text"},' +
  '{"id":"branch","type":"text"},' +
  '{"id":"head","type":"text"},' +
  '{"default":"active","id":"state","index":true,"transitions":{"abandoned":{"to":["active"]},' +
  '"active":{"to":["idle","handoff","done","abandoned"]},"done":{"to":["active"]},"handoff":{"to":["active","done"]},' +
  '"idle":{"to":["active","handoff","done","abandoned"]}},"type":"enum","values":["active","idle","handoff","done","abandoned"]},' +
  '{"id":"next","label":"Next step","type":"text"},' +
  '{"id":"tried","label":"Already tried","of":"text","type":"list"},' +
  '{"id":"notes","of":"text","type":"list"},' +
  '{"id":"last_seen","index":true,"label":"Last seen","type":"instant"}' +
  '],"icon":"session","id":"session","mobile":["doing","agent","state"],"name":"Agent runs","one":"run",' +
  '"seq_prefix":"S","state":"state","title":"doing"}';

/** SHA-256 of `SESSION_BODY`, which is the `declaration.checksum` of any declaration with this body. */
const CHECKSUM = 'cd09714918b0a86a7ae81adaeee71d703b787342ce10ade638f5d39488df122e';

/** A fixed instant, because a migration's text cannot read the record's clock. */
const DECLARED = '2026-09-11T00:00:00.000Z';

/**
 * Makes the kernel's declaration the active `register.session`, as the next version of that id.
 *
 * An import runs it too: a file written before this migration carries no kernel row, and the
 * ledger of the record it lands in says migration 2 has already run.
 */
export const SEAT_SESSION = `
UPDATE declaration SET superseded_at = '${DECLARED}' WHERE id = 'register.session' AND superseded_at IS NULL;
INSERT INTO declaration (id, version, kind, pack_id, body, checksum, retired, superseded_at, created_at)
  SELECT 'register.session', coalesce(max(version), 0) + 1, 'register', 'kernel', '${SESSION_BODY}', '${CHECKSUM}', 0, NULL, '${DECLARED}'
  FROM declaration WHERE id = 'register.session';
`;

export default `${SEAT_SESSION}
-- The index set installDeclarations builds for this body, in the order it builds them.
CREATE UNIQUE INDEX IF NOT EXISTS entry_u_session__client_id ON entry (json_extract(fields, '$.client_id')) WHERE register = 'session' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS entry_i_session__token_id ON entry (json_extract(fields, '$.token_id')) WHERE register = 'session' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS entry_i_session__agent ON entry (json_extract(fields, '$.agent')) WHERE register = 'session' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS entry_i_session__project ON entry (json_extract(fields, '$.project')) WHERE register = 'session' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS entry_i_session__repo ON entry (json_extract(fields, '$.repo')) WHERE register = 'session' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS entry_i_session__host ON entry (json_extract(fields, '$.host')) WHERE register = 'session' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS entry_i_session__state ON entry (json_extract(fields, '$.state')) WHERE register = 'session' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS entry_i_session__last_seen ON entry (json_extract(fields, '$.last_seen')) WHERE register = 'session' AND deleted_at IS NULL;
`;
