/**
 * THE SEEDED VIOLATION: a writer that does not call the guard.
 *
 * `packages/kernel/src/slash.ts` says there are five calls to `slashMayWrite` and that "a sixth
 * would be a sixth call". This kernel has four writers and only three of them call it. `create`
 * appends the event itself, which is exactly the bypass the gate exists to catch and exactly what
 * the guard cannot: the guard is not on that path any more.
 *
 * Everything else here is the smallest thing that is still a record: an `entry` table, an `event`
 * table, and writers whose kinds are the ones the real kernel's are.
 */

export const SLASH = 'slash';
export const SLASH_KINDS = new Set(['suggest', 'propose', 'predict']);

export function slashMayWrite(actor, kind) {
  if (actor === SLASH && !SLASH_KINDS.has(kind))
    throw new Error(`slash wrote ${kind}. A model suggests, proposes and predicts; everything else is a person's or the record's own (30 §3).`);
}

export async function openRecord(sql, clock) {
  sql.exec('CREATE TABLE entry (id TEXT PRIMARY KEY, register TEXT, seq INTEGER, fields TEXT)');
  sql.exec('CREATE TABLE event (id TEXT PRIMARY KEY, ts TEXT, actor TEXT, kind TEXT, target TEXT, note TEXT)');

  const registers = new Map();
  let n = 0;
  const mint = () => `ev${++n}`;
  const at = () => new Date(clock.now()).toISOString();

  const append = (actor, kind, target, note) => {
    slashMayWrite(actor, kind);
    sql.exec('INSERT INTO event (id, ts, actor, kind, target, note) VALUES (?, ?, ?, ?, ?, ?)', mint(), at(), actor, kind, target, note ?? null);
  };

  return {
    registers: () => registers,
    declare: (id) => registers.set(id, { id }),

    list: ({ register, limit }) => ({
      ok: true,
      value: { rows: sql.all('SELECT id, register, seq, fields FROM entry WHERE register = ? LIMIT ?', register, limit).map((r) => ({ ...r, fields: JSON.parse(r.fields) })) },
    }),

    /* THE BYPASS. No `slashMayWrite`, and the INSERT is right here rather than through `append`. */
    create: (register, fields, w) => {
      const id = mint();
      const seq = sql.all('SELECT count(*) AS c FROM entry WHERE register = ?', register)[0].c + 1;
      sql.exec('INSERT INTO entry (id, register, seq, fields) VALUES (?, ?, ?, ?)', id, register, seq, JSON.stringify(fields ?? {}));
      sql.exec('INSERT INTO event (id, ts, actor, kind, target, note) VALUES (?, ?, ?, ?, ?, ?)', mint(), at(), w.actor, 'create', `entry:${id}`, null);
      return { ok: true, value: { id, register, seq } };
    },

    update: (register, ref, patch, w) => {
      append(w.actor, 'edit', `entry:${ref}`);
      return { ok: true, value: { id: ref } };
    },

    /* A WRITE CONTEXT, NOT A BARE ACTOR, because that is what the real kernel's `log` takes and what
       the gate passes. `d92523ec` (September 11th) changed the gate to pass `{ actor }` and left this
       taking a string, so the object reached SQLite and the offer died with "cannot be bound to
       SQLite parameter 3" before the guard: a second finding on every run, a crash wearing the
       seeded violation's colour, and the note offer proving nothing. Measured on September 25th:
       two findings before this change, one after. */
    log: (register, seq, w, note) => {
      append(w.actor, 'note', `entry:${register}#${seq}`, note);
      return { ok: true, value: { id: `${register}#${seq}` } };
    },

    propose: (p, actor) => {
      const id = `SG${++n}`;
      append(actor, 'suggest', `suggestion:${id}`, p.question);
      return { ok: true, value: { id } };
    },

    decide: (id, verdict, actor) => {
      append(actor, 'decide', `suggestion:${id}`);
      return { ok: true, value: { decision: 'D1', suggestion: id } };
    },
  };
}
