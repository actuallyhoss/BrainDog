# 30-BLUEPRINT, cut down to the two things `event-kinds` reads.

## 1

```sql
CREATE TABLE event (
  id      TEXT PRIMARY KEY,
  ts      TEXT NOT NULL,
  actor   TEXT NOT NULL,                     -- §3
  kind    TEXT NOT NULL,                     -- §2 — closed
  target      TEXT,                          -- 'entry:01J…'
  target_kind TEXT,                          -- 'entry' | 'decision' | 'pack' | …  (20 §8 requires it)
  field   TEXT,                              -- NULL on a `create` row: to_v is then the whole `fields`, as JCS
  from_v  TEXT,                              -- '--redacted--' when the redaction list withheld it at write (20 §8);
  to_v    TEXT,                              --   '--erased--' after an erasure (02 §10); NULL ONLY when there was
                                             --   no prior value. One rule, three values — never NULL for two of them
  note    TEXT,                              -- mandatory, ≤ 280 chars, on a `note` row; '--erased--' after an erasure
  batch   TEXT,                              -- the ULID of the TRIGGERING write, shared by everything it caused —
                                             --   rule sets, generated rows — so "undo this expansion" is one query
  op_id   TEXT,                              -- client-generated; a replayed op_id returns the original result
  CHECK (kind IN (                           -- the 40 in §2. A new kind is a migration.
    'create','edit','state','link','tag','untag','delete','restore','purge','note',
    'decide','supersede','suggest','resolve','predict','score',
    'install','uninstall','upgrade','declare','retire',
    'grant.add','grant.read','grant.rotate','grant.revoke','grant.bind',
    'arrive','match','extract','propose','pull',
    'access.grant','access.revoke','share.open','share.close',
    'export','import','erase','migrate','restore.pitr'))   -- 40, and a test counts them
);
```

## 2

| Group | Kinds |
|---|---|
| Rows | `create` · `edit` · `state` · `link` · `tag` · `untag` · `delete` · `restore` · `purge` · `note` |
| Governance | `decide` · `supersede` · `suggest` · `resolve` · `predict` · `score` |
| Declarations | `install` · `uninstall` · `upgrade` · `declare` · `retire` |
| Credentials | `grant.add` · `grant.read` · `grant.rotate` · `grant.revoke` · `grant.bind` |
| Ingest | `arrive` · `match` · `extract` · `propose` · `pull` |
| Access | `access.grant` · `access.revoke` · `share.open` · `share.close` |
| Lifecycle | `export` · `import` · `erase` · `migrate` · `restore.pitr` |

**Forty, counted — 10 row · 6 governance · 5 declaration · 5 credential · 5 ingest · 4 access · 5 lifecycle — and the list is closed by a `CHECK`.**
