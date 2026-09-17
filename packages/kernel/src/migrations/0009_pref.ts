/**
 * The kernel schema, migration 9: `pref`, what one person arranged for themselves, and `pack_removed`, what an
 * uninstall took with it.
 *
 * `pref` IS PER PERSON AND NOT PER DEVICE. `19 §3`: nav order, hidden pages, pins and dismissals must survive a change
 * of device, so none of them is a cookie. `50 §10` named the move: a `setPref` method and a place in the record to keep
 * what it writes. One row per person per key, the value JSON. Not an event: arranging your own rail is not the
 * record's history, as a read mark is not.
 *
 * `pack_removed` IS WHAT A REINSTALL PUTS BACK. Uninstalling an add-on deletes its `pack` row, which holds the settings
 * somebody chose, and its pending schedule rows, which hold when each action runs next and whether it is paused. One
 * row per pack, the latest removal, kept for a window (`declare.ts`, `REMOVED_WINDOW_DAYS`) and spent by the install
 * that restores it.
 *
 * Both `local`: neither is a fact a `.brain` file carries, so the format stays 1.
 */
export default `
CREATE TABLE IF NOT EXISTS pref (
  person_id TEXT NOT NULL,                  -- the person who arranged it
  key TEXT NOT NULL,                        -- 'nav.order' or 'nav.hidden'; the kernel checks the list
  value TEXT NOT NULL,                      -- JSON
  updated_at TEXT NOT NULL,
  PRIMARY KEY (person_id, key)
);
CREATE TABLE IF NOT EXISTS pack_removed (
  pack TEXT PRIMARY KEY,                    -- the pack id, as the pack row had it
  version TEXT NOT NULL,                    -- the version that was removed
  removed_at TEXT NOT NULL,
  settings TEXT NOT NULL DEFAULT '{}',      -- the settings chosen for it, as config_values held them
  schedules TEXT NOT NULL DEFAULT '[]'      -- [{ kind, key, due_at, payload, state, attempts }], pending or paused
);
INSERT OR IGNORE INTO dog_section (table_name, section) VALUES ('pref', 'local');
INSERT OR IGNORE INTO dog_section (table_name, section) VALUES ('pack_removed', 'local');
`;
