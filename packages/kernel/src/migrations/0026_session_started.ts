/**
 * The kernel schema, migration 26: the `session` register keeps when a run started.
 *
 * A RUN HELD ONE INSTANT, `last_seen`, so nothing could draw it as a span of time: a page reads a row's fields, and the
 * only start a run had was its row's `created_at`, which no declaration names and no block can ask for. `started` is
 * that instant as a field, labelled Started.
 *
 * THE RECORD WRITES IT, ONCE. It is stamped as the run's row is made (`begun` in `session.ts`) and it is one of
 * `KERNEL_WRITTEN`, so no agent and no person sets it and nothing moves it after: a run that goes quiet, is written off
 * and re-attaches the next morning is the same run, started when it first was.
 *
 * EVERY RUN ALREADY HERE IS GIVEN ITS OWN, from its row's `created_at`, which is the instant a run opened now is stamped
 * with. In place, as the heartbeat is written: no version, no `updated_at` and no event, because the record noting when
 * a run began is not an edit anybody made. Only where a run has none, so it changes nothing the second time.
 *
 * A NEW VERSION OF THE SAME DECLARATION, seated as migration 22 seats its own: the live row is stamped superseded and
 * this body is the next version, at one instant. No field is taken away or retyped, so every run is kept as it stands.
 *
 * NOT INDEXED, AND NO INDEX CHANGES. A list may index eight fields (`02 §5`, `INDEXES_OVER_CAP`) and this one already
 * does, each of them read by the ladder or the sweep, so a ninth would be a body `installDeclarations` refuses. A page
 * that bounds runs in time still has an index to do it with, `last_seen`, the other end of the same span. So the eight
 * migration 2 built are the set this body implies. `session-register.test.ts` checks that, and that these bytes are
 * canonical and this checksum is theirs.
 *
 * THE BODY IS WRITTEN OUT AS ITS CANONICAL BYTES, for migration 2's reason: a migration's checksum is over its text.
 */

/** The declaration body, as JCS: migration 22's, with `started` after `last_seen`. */
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
  '{"default":"active","id":"state","index":true,"transitions":{"abandoned":{"to":["active"]},' +
  '"active":{"to":["idle","handoff","done","abandoned"]},"done":{"to":["active"]},"handoff":{"to":["active","done"]},' +
  '"idle":{"to":["active","handoff","done","abandoned"]}},"type":"enum","values":["active","idle","handoff","done","abandoned"]},' +
  '{"id":"next","label":"Next step","type":"text"},' +
  '{"id":"tried","label":"Already tried","of":"text","type":"list"},' +
  '{"id":"notes","of":"text","type":"list"},' +
  '{"id":"last_seen","index":true,"label":"Last seen","type":"instant"},' +
  '{"id":"started","label":"Started","type":"instant"}' +
  '],"icon":"session","id":"session","mobile":["doing","agent","state"],"name":"Agent runs","one":"run",' +
  '"seq_prefix":"S","state":"state","title":"doing"}';

/** SHA-256 of `SESSION_BODY`, which is the `declaration.checksum` of any declaration with this body. */
const CHECKSUM = 'ca8d985ebb93d4638a79f950d160b6fd7b0c3631529580482de4637e955b5670';

/** A fixed instant, because a migration's text cannot read the record's clock. */
const DECLARED = '2026-10-07T00:00:00.000Z';

/**
 * Makes this body the active `register.session`, as the next version of that id, unless it already is, and gives every
 * run that has no `started` its own.
 *
 * KEYED ON THE CHECKSUM AND ON THE MISSING FIELD, so it changes nothing the second time and an import can run it after
 * every file, as it ran migration 22's: a `.brain` written before this migration carries an older body as its live
 * kernel row and runs with no `started`, and the ledger of the record it lands in says migration 26 has run, so nothing
 * else would put either right. A file with no `register.session` gets this body as its first version.
 */
export const SEAT_SESSION = `
UPDATE declaration SET superseded_at = '${DECLARED}' WHERE id = 'register.session' AND superseded_at IS NULL AND checksum <> '${CHECKSUM}';
INSERT INTO declaration (id, version, kind, pack_id, body, checksum, retired, superseded_at, created_at)
  SELECT 'register.session', coalesce((SELECT max(version) FROM declaration WHERE id = 'register.session'), 0) + 1, 'register', 'kernel', '${SESSION_BODY}', '${CHECKSUM}', 0, NULL, '${DECLARED}'
  WHERE NOT EXISTS (SELECT 1 FROM declaration WHERE id = 'register.session' AND superseded_at IS NULL);
UPDATE entry SET fields = json_set(fields, '$.started', created_at) WHERE register = 'session' AND json_extract(fields, '$.started') IS NULL;
`;

export default SEAT_SESSION;
