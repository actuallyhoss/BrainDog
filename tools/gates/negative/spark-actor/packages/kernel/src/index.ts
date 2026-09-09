/**
 * THE SEEDED VIOLATION: a writer that does not call the guard.
 *
 * `packages/kernel/src/spark.ts` says there are five calls to `sparkMayWrite` and that "a sixth
 * would be a sixth call". This kernel has four writers and only three of them call it. `create`
 * appends the event itself, which is exactly the bypass the gate exists to catch and exactly what
 * the guard cannot: the guard is not on that path any more.
 *
 * Everything else here is the smallest thing that is still a record: an `entry` table, an `event`
 * table, and writers whose kinds are the ones the real kernel's are.
 */

export const SPARK = 'spark';
export const SPARK_KINDS = new Set(['suggest', 'propose', 'predict']);

export function sparkMayWrite(actor, kind) {
  if (actor === SPARK && !SPARK_KINDS.has(kind))
    throw new Error(`spark wrote ${kind}. A model suggests, proposes and predicts; everything else is a person's or the record's own (30 §3).`);
}

export async function openRecord(sql, clock) {
  sql.exec('CREATE TABLE entry (id TEXT PRIMARY KEY, register TEXT, seq INTEGER, fields TEXT)');
  sql.exec('CREATE TABLE event (id TEXT PRIMARY KEY, ts TEXT, actor TEXT, kind TEXT, target TEXT, note TEXT)');

  const registers = new Map();
  let n = 0;
  const mint = () => `ev${++n}`;
  const at = () => new Date(clock.now()).toISOString();

  const append = (actor, kind, target, note) => {
    sparkMayWrite(actor, kind);
    sql.exec('INSERT INTO event (id, ts, actor, kind, target, note) VALUES (?, ?, ?, ?, ?, ?)', mint(), at(), actor, kind, target, note ?? null);
  };

  return {
    registers: () => registers,
    declare: (id) => registers.set(id, { id }),

    list: ({ register, limit }) => ({
      ok: true,
      value: { rows: sql.all('SELECT id, register, seq, fields FROM entry WHERE register = ? LIMIT ?', register, limit).map((r) => ({ ...r, fields: JSON.parse(r.fields) })) },
    }),

    /* THE BYPASS. No `sparkMayWrite`, and the INSERT is right here rather than through `append`. */
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

    log: (register, seq, actor, note) => {
      append(actor, 'note', `entry:${register}#${seq}`, note);
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
