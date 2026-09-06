/** Cut down to the one table, with a tenth kind the document has never heard of. */
export const SQL = `
CREATE TABLE outbox (
  id TEXT PRIMARY KEY, created TEXT NOT NULL, kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','leased','done','failed','dead')),
  leased_until TEXT, attempts INTEGER NOT NULL DEFAULT 0,   -- mirrors the retry row; \`dead\` when that row fails at 8 — §8
  CHECK (kind IN ('notify.email','notify.push','notify.webhook','pull.fetch','export.r2','erase.r2',
                  'infer.embed','infer.prose','infer.draft','notify.sms'))   -- nine
);
`;
