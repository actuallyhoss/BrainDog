/**
 * The kernel schema, migration 13: `infer.ask`, an automation's question to Slash, on the outbox's `CHECK`.
 *
 * `loop/research-shell-automations.md` section 4.3, Brief C. A run that reaches `ask_slash` queues one `infer.ask` row,
 * `{ run, step, question, shape, choices?, about? }`, and the ack's `result.text` is the answer (`flow.ts`,
 * `outbox.ts`). Without this the insert failed on SQLite's own CHECK text, which listed every outbox kind to the owner
 * as the reason the run stopped.
 *
 * ONE REBUILD, THE OUTBOX'S, the way `0012` rebuilt it for `script.run`: every row copied across unchanged and its one
 * index made again. Section 4.5 also planned `flow` on the `schedule` CHECK, and a run's wake is still a `rule` row told
 * apart by its payload, so nothing writes `flow` and it is not added here.
 *
 * NOT A FORMAT REVISION, FOR `0012`'S REASON. The outbox travels, and an older `.brain` file has no `infer.ask` rows
 * and imports unchanged. A newer file carrying one fails the CHECK of an older build, which is the refusal an older
 * build should give for a job it cannot serve.
 */
export default `
CREATE TABLE outbox_next (
  id TEXT PRIMARY KEY, created TEXT NOT NULL, kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','leased','done','failed','dead')),
  leased_until TEXT, attempts INTEGER NOT NULL DEFAULT 0,
  CHECK (kind IN ('notify.email','notify.push','notify.webhook','pull.fetch','export.r2','erase.r2',
                  'infer.embed','infer.prose','infer.draft','script.run','infer.ask'))
);
INSERT INTO outbox_next (id, created, kind, payload, state, leased_until, attempts)
  SELECT id, created, kind, payload, state, leased_until, attempts FROM outbox;
DROP TABLE outbox;
ALTER TABLE outbox_next RENAME TO outbox;
CREATE INDEX outbox_ready ON outbox(state, created);
`;
