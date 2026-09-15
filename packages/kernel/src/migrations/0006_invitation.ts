/**
 * The kernel schema, migration 6: `invitation`, an owner's single-use link for one email address.
 *
 * `invite({ email, levels })` mints one and `acceptInvite` spends it (`30 §5`, `12 §3`). The link's secret is
 * stored as `sha256(secret)` in `hash` and nowhere else, as a token's is, so a copy of the database lets
 * nobody in. It dies 24 hours after it is minted, on its first use, or when the owner withdraws it.
 *
 * `local`, like `token` and `device_grant`: an invitation is a fact about this installation, and a `.dog`
 * file never carries one, so the format stays 1. No CHECK: `level` is one of `member`'s five, and
 * `registers` a JSON object of them, and the kernel checks both before a row is written.
 */
export default `
CREATE TABLE IF NOT EXISTS invitation (
  id TEXT PRIMARY KEY,                      -- 'i_01J…'
  hash TEXT NOT NULL UNIQUE,                -- sha256(secret), hex. The secret is never stored
  email TEXT NOT NULL,                      -- as typed; matched lower-cased
  level TEXT,                               -- on the record as a whole, or NULL for named registers only
  registers TEXT NOT NULL DEFAULT '{}',     -- { register: level }
  invited_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  accepted_by TEXT,
  revoked_at TEXT
);
INSERT OR IGNORE INTO dog_section (table_name, section) VALUES ('invitation', 'local');
`;
