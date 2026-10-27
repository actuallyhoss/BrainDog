/**
 * The kernel schema, migration 22: the `session` register keeps the app a run is in, and three more kinds of agent.
 *
 * WHAT A RUN'S APP SAYS OF ITSELF WAS DROPPED. MCP's `clientInfo` names the app and its version on every request
 * (`claude-code`, `2.1.4`), the host reads the same two from `x-braindog-client-name` and `x-braindog-client-version`,
 * and the ladder writes a hint only where the live declaration has a field for it (`opening` and `learned` in
 * `session.ts`). Migration 2's had none, so every run opened without its app. `client` is the app's name, labelled App
 * because that is the word a person reads; `client_version` is its version, kept beside it.
 *
 * `gemini`, `copilot` AND `windsurf` JOIN THE `agent` FIELD, the three the app draws with their makers' marks
 * beside Claude, Codex and Cursor. A kind the register has no value for stays `other`, so until now a Gemini run wore the
 * app's glyph. `other` stays last, and stays the default.
 *
 * A NEW VERSION OF THE SAME DECLARATION, seated as `installDeclarations` seats one: the live row is stamped superseded
 * and this body is the next version, at one instant. Every run is kept as it stands, as any new version keeps its rows:
 * no field is taken away or retyped, and a run written before this simply has no app, because none was kept.
 *
 * NO INDEX CHANGES. Neither new field is indexed, so the eight migration 2 built are the set this body implies, and
 * `state` is still the state field, so `entry.state` already mirrors it. `session-register.test.ts` checks both, and that
 * these bytes are canonical and this checksum is theirs.
 *
 * THE BODY IS WRITTEN OUT AS ITS CANONICAL BYTES, for migration 2's reason: a migration's checksum is over its text.
 */

/** The declaration body, as JCS: migration 2's, with `client` and `client_version` after `agent`, and three more kinds. */
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
  '{"id":"last_seen","index":true,"label":"Last seen","type":"instant"}' +
  '],"icon":"session","id":"session","mobile":["doing","agent","state"],"name":"Agent runs","one":"run",' +
  '"seq_prefix":"S","state":"state","title":"doing"}';

/** SHA-256 of `SESSION_BODY`, which is the `declaration.checksum` of any declaration with this body. */
const CHECKSUM = '3fc408ddb827ec5587a1ff2a2e9e95b5127c865a3dd757f825a0b9a86d6e7f4f';

/** A fixed instant, because a migration's text cannot read the record's clock. */
const DECLARED = '2026-10-02T00:00:00.000Z';

/**
 * Makes this body the active `register.session`, as the next version of that id, unless it already is.
 *
 * KEYED ON THE CHECKSUM, so it changes nothing the second time and an import can run it after every file: a `.brain`
 * written before this migration carries migration 2's body as its live kernel row, and the ledger of the record it
 * lands in says migration 22 has run, so nothing else would seat this one. That is the reason `brainl.ts` seats the
 * register after an import at all. A file with no `register.session` gets this body as its first version, and one
 * whose own `register.session` was a person's has it superseded, as migration 2 supersedes it.
 */
export const SEAT_SESSION = `
UPDATE declaration SET superseded_at = '${DECLARED}' WHERE id = 'register.session' AND superseded_at IS NULL AND checksum <> '${CHECKSUM}';
INSERT INTO declaration (id, version, kind, pack_id, body, checksum, retired, superseded_at, created_at)
  SELECT 'register.session', coalesce((SELECT max(version) FROM declaration WHERE id = 'register.session'), 0) + 1, 'register', 'kernel', '${SESSION_BODY}', '${CHECKSUM}', 0, NULL, '${DECLARED}'
  WHERE NOT EXISTS (SELECT 1 FROM declaration WHERE id = 'register.session' AND superseded_at IS NULL);
`;

export default SEAT_SESSION;
