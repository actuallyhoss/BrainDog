/**
 * `lists`: one row a list the reader may read, with how many live rows it holds and when it last changed (PGS-A11 job 3).
 * "Ledger 217, Agent runs 752, Numbers 2,527", read off the record's own counts, so a page or an agent can say what the
 * record holds without a figure declared for each list.
 *
 * A LIST THE READER IS HELD FROM IS LEFT OUT, as `boot` and `schema` leave it out: a list's name is itself something a
 * reader may not be told. A reader whose grant narrows a list to some rows is counted only those (`whereFor`), as the
 * rail's count is. Never a deleted row.
 *
 * ONE COUNT A LIST AND ONE NEWEST ROW, the two reads the rail already makes, never every row of every list.
 */

import { whereFor } from '@braindog/kernel';
import type { Schema } from '@braindog/where';

import { answerRows, sourceRow, type SourceMaker } from './index.ts';

/** The rows' fields: the list's handle, what a person calls it, its live rows, and its newest change. */
const SCHEMA: Schema = {
  register: 'lists',
  fields: {
    list: { type: 'text', label: 'List' },
    name: { type: 'text', label: 'Name' },
    count: { type: 'int', label: 'Holds' },
    changed: { type: 'instant', label: 'Changed' },
  },
};

export const lists: SourceMaker = ({ kernel, ctx, readable }) => {
  let held: ReturnType<typeof sourceRow>[] | null = null;
  const all = (): ReturnType<typeof sourceRow>[] => {
    if (held) return held;
    held = [];
    for (const [id, decl] of kernel.registers()) {
      if (readable(ctx, id) !== null) continue;
      const grant = whereFor(ctx.wheres, id);
      const newest = kernel.list({ register: id, limit: 1, order: [{ field: 'updated_at', dir: 'desc' }] }, grant);
      const changed = newest.ok ? (newest.value.rows[0]?.updated_at ?? null) : null;
      held.push(sourceRow('lists', id, { list: id, name: decl.name, count: kernel.count(id, grant), changed }, changed));
    }
    return held;
  };
  return {
    says: 'Every list you can open, with how many it holds and when it last changed.',
    schema: SCHEMA,
    rows: (q) => answerRows(all(), SCHEMA, q),
  };
};
