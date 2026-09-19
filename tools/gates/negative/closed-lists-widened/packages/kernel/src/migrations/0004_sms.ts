/**
 * A tenth outbox kind, the only way SQLite allows: rebuild the table, copy, drop, rename.
 *
 * The document this fixture carries never says "kernel migration 4", so the tenth kind is a rule the
 * database enforces and nothing a person reads mentions — which is what the gate must name.
 */
export default `
CREATE TABLE outbox_next (
  id TEXT PRIMARY KEY, created TEXT NOT NULL, kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','leased','done','failed','dead')),
  leased_until TEXT, attempts INTEGER NOT NULL DEFAULT 0,
  CHECK (kind IN ('notify.email','notify.push','notify.webhook','pull.fetch','export.r2','erase.r2',
                  'infer.embed','infer.prose','infer.draft','notify.sms'))
);
INSERT INTO outbox_next SELECT * FROM outbox;
DROP TABLE outbox;
ALTER TABLE outbox_next RENAME TO outbox;
`;
