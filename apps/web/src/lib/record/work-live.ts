/**
 * The Work screen, read from the record: the tasks list's declaration, every task still in play, what was finished in
 * the last week, and the names of the projects and people the tasks point at.
 *
 * THROUGH THE RECORD'S OWN READS AND NOTHING ELSE: `schema` for the list as it is declared now, `list` for the rows,
 * each ref turned into the number a person says by the same `entryOf` the list screen reads with, so a task written
 * here is drawn exactly like one read here. Writes go through `rows-write.ts`, as the list screen's do.
 *
 * A ROUTE-ONLY MODULE, like `today-live.ts`: the client carries the route table as a value, so only the screens that
 * import this carry it. The fetch is handed in, so a test drives it without a socket.
 */

import { createClient } from '@braindog/client';

import { REGISTERS } from './held.ts';
import { entryOf, learn, refMapOf, type RecordRow, type RefMap } from './remote.ts';
import type { Fetch } from './row-live.ts';
import type { Entry, RegisterDecl } from './schema.ts';
import type { Result } from '../data/read.ts';
import { shapeOf, type Shape } from '../work/board.ts';

/** The list the screen works on. */
export const TASKS = 'tasks';

/** A project or a person a task points at: its number and its name. */
export type Named = { seq: number; name: string };

export type Work = {
  /** When this was read, on this browser's clock: "today" and "late" are the reader's own day. */
  now: number;
  decl: RegisterDecl;
  shape: Shape;
  /** Every task still in play, and those finished in the last week. */
  rows: Entry[];
  /** Every project a task can be filed under, and every person one can be held by, by name. */
  projects: Named[];
  people: Named[];
};

/* A SENTENCE `where` GOES OUT AS THE JSON TEXT OF THE SENTENCE (`carried` in `lib/data/record.ts` says why). */
const carried = (where: string): unknown => ({ toJSON: () => where });

type Client = ReturnType<typeof createClient>;
type Refused = { ok: false; refusal: { code: string; fix: string } };

/** Every row a question answers, page after page, up to `most`. `null` when the record refused it. */
async function walk(client: Client, register: string, where: string | null, order: { field: string; dir: 'asc' | 'desc' } | null, most: number): Promise<RecordRow[] | Refused> {
  const out: RecordRow[] = [];
  let cursor: string | null = null;
  do {
    const got = await client.list({
      register,
      limit: Math.min(500, most - out.length),
      ...(where ? { where: carried(where) } : {}),
      ...(order ? { order: [order] } : {}),
      ...(cursor === null ? {} : { cursor }),
    });
    if (!got.ok) return 'refusal' in got ? { ok: false, refusal: got.refusal } : { ok: false, refusal: { code: 'VERSION_STALE', fix: 'The list changed while it was being read.' } };
    out.push(...(got.value.rows as RecordRow[]));
    cursor = got.value.cursor;
  } while (cursor !== null && out.length < most);
  return out;
}

/** The rows of a list a ref points at, as a map, and by name. A list this reader may not read is no names, not a failure. */
async function namesIn(client: Client, register: string, asked: Map<string, Promise<void>>): Promise<{ map: RefMap; named: Named[] } | null> {
  await learn((r) => client.schema(r), register, asked);
  const rows = await walk(client, register, null, null, 2000);
  if (!Array.isArray(rows)) return null;
  const map = refMapOf(register, rows);
  const named = [...map.titleOf].map(([seq, name]) => ({ seq, name })).sort((a, b) => a.name.localeCompare(b.name));
  return { map, named };
}

/** The tasks list's declaration, as the record declares it now, kept where the writer reads it (`learn`). */
async function declared(client: Client, asked: Map<string, Promise<void>>): Promise<RegisterDecl | Refused> {
  const said = client.schema(TASKS);
  await learn(() => said, TASKS, asked);
  const out = await said;
  if (!out.ok) return 'refusal' in out ? { ok: false, refusal: out.refusal } : { ok: false, refusal: { code: 'VERSION_STALE', fix: 'The list changed while it was being read.' } };
  const decl = REGISTERS[TASKS];
  return decl ?? { ok: false, refusal: { code: 'REGISTER_UNKNOWN', fix: 'This record holds no tasks list.' } };
}

/**
 * The screen's whole read. Only the declaration and the tasks themselves can refuse the screen; names that cannot be
 * read leave the tasks drawn by number.
 */
export async function readWork(base: string, io?: Fetch, now: number = Date.now()): Promise<Result<Work>> {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  const asked = new Map<string, Promise<void>>();
  const decl = await declared(client, asked);
  if ('ok' in decl) return decl;
  const shape = shapeOf(decl);

  const live = shape.state && shape.done.length > 0 ? `${shape.state} is not ${shape.done.join(' or ')}` : null;
  const finished = shape.state && shape.done.length > 0 ? `${shape.state} is ${shape.done.join(' or ')}${shape.finished ? `, ${shape.finished} after -8d` : ''}` : null;

  const [open, done, projects, people] = await Promise.all([
    walk(client, TASKS, live, null, 3000),
    finished ? walk(client, TASKS, finished, shape.finished ? { field: shape.finished, dir: 'desc' } : null, 60) : Promise.resolve([] as RecordRow[]),
    shape.project ? namesIn(client, shape.project.to, asked).catch(() => null) : Promise.resolve(null),
    shape.owner ? namesIn(client, shape.owner.to, asked).catch(() => null) : Promise.resolve(null),
  ]);
  if (!Array.isArray(open)) return open;

  const refs = new Map<string, RefMap>();
  if (shape.project && projects) refs.set(shape.project.to, projects.map);
  if (shape.owner && people) refs.set(shape.owner.to, people.map);
  const seen = new Set<number>();
  const rows: Entry[] = [];
  for (const r of [...open, ...(Array.isArray(done) ? done : [])]) {
    if (r.seq === null || seen.has(r.seq)) continue;
    seen.add(r.seq);
    rows.push(entryOf(TASKS, r, refs));
  }
  return { ok: true, value: { now, decl, shape, rows, projects: projects?.named ?? [], people: people?.named ?? [] } };
}

/**
 * What a line typed on Today is read against: the list's shape and its projects, kept for the tab once read, so the
 * ask bar asks once however many tasks it adds. `null` when the record holds no tasks list.
 */
let context: { base: string; said: Promise<{ shape: Shape; projects: Named[] } | null> } | null = null;
export function captureContext(base: string, io?: Fetch): Promise<{ shape: Shape; projects: Named[] } | null> {
  if (context?.base !== base) {
    const said = (async () => {
      const client = createClient({ base, ...(io ? { fetch: io } : {}) });
      const asked = new Map<string, Promise<void>>();
      const decl = await declared(client, asked);
      if ('ok' in decl) return null;
      const shape = shapeOf(decl);
      const projects = shape.project ? await namesIn(client, shape.project.to, asked).catch(() => null) : null;
      return { shape, projects: projects?.named ?? [] };
    })();
    context = { base, said };
    /* A REFUSAL IS NOT KEPT, so the next line asks again. */
    void said.then((c) => {
      if (c === null && context?.said === said) context = null;
    });
  }
  return context.said;
}
