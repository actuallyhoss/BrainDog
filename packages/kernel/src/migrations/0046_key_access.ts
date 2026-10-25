/**
 * The kernel schema, migration 46: which machine may open which key, and the asks waiting on the owner.
 *
 * `key_access` IS ONE RULE PER KEY AND MACHINE: `always`, `ask` or `deny`. `machine` is a keychain grant's handle, the
 * one `listDevices` shows, and `*` is the key's own default for every machine with no row of its own. NO ROW IS
 * `always`, which is how every key opened before this migration, so a record that never sets a rule behaves exactly as
 * it did.
 *
 * `key_ask` IS ONE QUESTION TO THE OWNER: a machine asked to open a key whose rule is `ask`. It waits (`pending`) until
 * he answers or it runs out (`expires`); an answer of `once` is spent by the next open from that machine (`used`), `always`
 * writes the machine's rule as well, and `deny` refuses that open and is spent with it.
 *
 * IDS AND RULES ONLY. Neither table holds a value, a label or anything a key opens: a credential is named by its row id,
 * a machine by its handle and a run by its spoken id.
 *
 * BOTH `local`. A machine's handle is a fact about this installation, as a token is, so a copy carries neither and an
 * import keeps whatever rules this host had. The format is still 1.
 *
 * ADDITIVE ONLY, nothing is rebuilt, and `IF NOT EXISTS` and `OR IGNORE`, so it can run twice.
 */
export default `
CREATE TABLE IF NOT EXISTS key_access (
  credential TEXT NOT NULL,
  machine TEXT NOT NULL,
  rule TEXT NOT NULL CHECK (rule IN ('always','ask','deny')),
  set_by TEXT NOT NULL,
  set_at TEXT NOT NULL,
  PRIMARY KEY (credential, machine)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS key_ask (
  id TEXT PRIMARY KEY,
  credential TEXT NOT NULL,
  machine TEXT NOT NULL,
  run TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','once','always','denied','used')),
  asked_at TEXT NOT NULL,
  expires TEXT NOT NULL,
  answered_by TEXT,
  answered_at TEXT
);
CREATE INDEX IF NOT EXISTS key_ask_open ON key_ask(credential, machine, status);
INSERT OR IGNORE INTO dog_section (table_name, section) VALUES ('key_access', 'local'), ('key_ask', 'local');
`;
