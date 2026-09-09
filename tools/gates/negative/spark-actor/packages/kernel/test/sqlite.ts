/**
 * The `Sql` port over `node:sqlite`, cut down to what the gate uses.
 *
 * The real one is `packages/kernel/test/sqlite.ts`. A fixture carries its own so the tree is
 * self-contained: this one has no `@braindog/ports` to resolve and no transaction depth to keep,
 * because nothing in the seeded kernel below opens one.
 */

import { DatabaseSync } from 'node:sqlite';

export function openSqlite(path = ':memory:') {
  const db = new DatabaseSync(path);
  return {
    db,
    close: () => db.close(),
    exec: (text, ...params) => {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...params);
    },
    all: (text, ...params) => db.prepare(text).all(...params),
    one: (text, ...params) => db.prepare(text).get(...params),
    transactionSync: (fn) => fn(),
  };
}

export const fixedClock = (ms) => ({ now: () => ms, set: () => {}, advance: () => {} });
