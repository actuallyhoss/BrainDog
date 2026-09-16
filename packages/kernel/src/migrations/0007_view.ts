/**
 * The kernel schema, migration 7: `view`, a register's saved way of looking at itself.
 *
 * `02 §5` says a saved view IS a named predicate on the register it belongs to, and until now the
 * kernel had nowhere to keep one, so the app saved a page declaration instead and the register that
 * the view is about was only implied by the page's single block. A view belongs to a register here,
 * by the primary key, and carries the four things a person actually adjusted: the filter, the text
 * they searched for, the order they sorted by and the columns they kept.
 *
 * `sort` AND NOT `order`, because `order` is a reserved word in SQLite and a column named it has to
 * be quoted at every site that reads it. The method takes `order`, which is what the caller means
 * and what `list` already calls the same thing; this is the one place the two names differ, and it
 * is spelled out rather than left for somebody to find in a syntax error.
 *
 * `filter` AND `search` ARE NULLABLE AND THAT IS A DISTINCTION, not a default. A view with no filter
 * shows the whole register, and a view whose filter is an empty predicate shows nothing; writing
 * `'{}'` for the first would make the two the same row.
 *
 * `local`, like `token`, `device_grant` and `invitation`: the format stays 1, because a `.brain` file
 * written by this build carries no line an older reader cannot place. A view therefore does not
 * survive an export and an import today, which is a real gap and is named as one in `45 §10` rather
 * than hidden here — carrying it means a travelling table and a format revision, which is a change
 * to `03-DOG-FORMAT` and to every reader of it, and not a line in this file.
 */
export default `
CREATE TABLE IF NOT EXISTS view (
  register TEXT NOT NULL,                   -- the register this view is a way of looking at
  id TEXT NOT NULL,                         -- 'overdue' — lower-case, unique within its register
  name TEXT NOT NULL,                       -- what a person calls it
  filter TEXT,                              -- JCS of the where predicate, or NULL for no filter
  search TEXT,                              -- the text that was in the search box, or NULL
  sort TEXT NOT NULL DEFAULT '[]',          -- [{ field, dir }] — 'order' is reserved in SQLite
  columns TEXT NOT NULL DEFAULT '[]',       -- [field] — the columns kept, in the order they were kept
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (register, id)
);
CREATE INDEX IF NOT EXISTS view_register ON view(register, name);
INSERT OR IGNORE INTO dog_section (table_name, section) VALUES ('view', 'local');
`;
