/**
 * The read paths of the leak matrix (sharing plan §4.3): every READ+ and DATA route in `ROUTES` that changes nothing,
 * called through the host's own handler table (`handlersFor`), so a route is asked exactly as `/api/<name>` asks it.
 *
 * THE ARGUMENTS ARE GENERATED FROM THE FIXTURE: every list; every row number, hidden ones included, and every spoken id;
 * search words taken from the canaries; filters and sorts on every field; and cursors walked to the end. A route this
 * file knows nothing particular about is asked with no arguments, and with each list when it takes `register`.
 */

import { ROUTES, handlersFor, type Handler } from '../../../host/src/index.ts';
import type { CallContext } from '../../src/index.ts';
import { PAGES, type Fixture } from './fixture.ts';

export type Args = Record<string, unknown>;

/** The twelve routes §4.4 holds to P2 to P4 as well as P1. */
export const CORE = ['list', 'get', 'search', 'history', 'recentHistory', 'whatsNew', 'page', 'previewPage', 'context', 'backlinks', 'metric', 'boot'] as const;

/**
 * Every route a reader reaches: READ+ and DATA, and none that writes. `previewPage` is READ+ and carried as a POST
 * because it takes a body, and it writes nothing, so it is read here too.
 */
export const READ_ROUTES: readonly string[] = ROUTES.filter((r) => (r.group === 'READ+' || r.group === 'DATA') && (!r.writes || r.name === 'previewPage')).map((r) => r.name);

const FIELDS: Record<string, string[]> = {
  things: ['name', 'notes'],
  people: ['name', 'email'],
  tasks: ['name', 'thing', 'stage', 'rate', 'notes', 'assignee'],
  money: ['payee', 'amount', 'thing', 'notes'],
  credentials: ['label', 'opens'],
  notes: ['what', 'thing'],
};
export const LIST_IDS = Object.keys(FIELDS);

/**
 * The arguments one route is asked with on this fixture. `lean` is the set P2 asks twice per round: every list and a
 * filter that reaches past each grant, rather than every field against every row's word, which P1 asks once.
 */
export function argsFor(name: string, f: Fixture, lean = false): Args[] {
  const rows = [...f.rows.values()];
  const words = [...rows.map((r) => r.canary.word), ...f.extras.map((e) => e.canary.word), 'Kiln', 'Loom', 'Sam'];
  const lists = LIST_IDS.map((register) => ({ register }));
  const route = ROUTES.find((r) => r.name === name);
  const takes = Object.keys((route as { takes?: Record<string, unknown> } | undefined)?.takes ?? {});
  switch (name) {
    case 'get':
      return [...rows.map((r) => ({ register: r.list, seq: r.seq })), ...rows.map((r) => ({ spoken: f.spoken(r) })), { register: 'tasks', seq: 9_999 }];
    case 'list':
      if (lean)
        return [
          ...lists,
          { register: 'tasks', includeDeleted: true },
          { register: 'tasks', order: [{ field: 'rate', dir: 'desc' }] },
          { register: 'tasks', where: { field: 'thing', is: f.built.ids.loom } },
          { register: 'tasks', where: { field: 'notes', contains: 'private' } },
        ];
      return [
        ...lists,
        ...lists.map((l) => ({ ...l, includeDeleted: true })),
        ...LIST_IDS.flatMap((register) =>
          FIELDS[register]!.flatMap((field) => [
            { register, order: [{ field, dir: 'desc' }] },
            { register, where: { field, present: true } },
            ...rows.filter((r) => r.list === register).map((r) => ({ register, where: { field, contains: r.canary.word } })),
          ]),
        ),
        { register: 'tasks', where: { field: 'thing', is: f.built.ids.loom } },
        { register: 'tasks', where: { field: 'stage', is: 'todo' } },
        { register: 'money', where: { field: 'thing', is: f.built.ids.loom } },
      ];
    case 'countBy':
      return LIST_IDS.flatMap((register) => FIELDS[register]!.map((by) => ({ register, by })));
    case 'search':
      return words.map((q) => ({ q }));
    case 'history':
    case 'backlinks':
      return [...rows.map((r) => ({ register: r.list, seq: r.seq })), { register: 'tasks', seq: 9_999 }];
    case 'recentHistory':
      return [{}, { limit: 200 }, { everything: true }];
    case 'whatsNew':
      return [{}, { everything: true }];
    case 'page':
      return [{ slug: 'kiln' }, { slug: 'spend' }, { slug: 'kiln', filter: { stage: 'todo' } }, { slug: 'kiln', filter: { stage: 'review' } }];
    case 'previewPage':
      return [
        ...PAGES.map((body) => ({ body })),
        { body: { ...PAGES[0], blocks: [{ kind: 'table', key: 'loom', heading: 'Loom', source: 'register.tasks', where: { field: 'thing', is: f.built.ids.loom }, columns: [{ field: 'name' }] }] } },
      ];
    case 'metric':
      return [{ metric: 'tasks-count' }, { metric: 'tasks-rate' }, { metric: 'money-sum' }];
    case 'comments':
      return rows.map((r) => ({ on: f.spoken(r) }));
    case 'usedBy':
      return rows.map((r) => ({ spoken: f.spoken(r) }));
    case 'governance':
      return [{}, ...f.asked.map((id) => ({ register: 'suggestion', id })), { status: 'decided' }];
    case 'about':
      return [{}, { name: 'Kiln' }, ...rows.slice(0, 4).map((r) => ({ row: { register: r.list, seq: r.seq } }))];
    case 'inboxHints':
      return [{}];
    case 'checkPaths':
      return [{ register: 'tasks', document: 'notes' }];
    default:
      return takes.includes('register') ? [{}, ...lists] : [{}];
  }
}

/** One route's answer, or what it threw, as the host would see either. */
export async function ask(handlers: Record<string, Handler>, name: string, args: Args, ctx: CallContext): Promise<unknown> {
  const handler = handlers[name];
  if (!handler) return { threw: `no handler for ${name}` };
  try {
    return await handler(args, ctx);
  } catch (cause) {
    return { threw: String((cause as Error)?.message ?? cause) };
  }
}

/** The host's handler table over the fixture's record. */
export const handlers = (f: Fixture): Record<string, Handler> => handlersFor(f.api as never);

/** Walk a paged answer to its end, by the cursor it answers (`list`, `recentHistory`, `backlinks`). */
export async function walked(h: Record<string, Handler>, name: string, args: Args, ctx: CallContext, most = 50): Promise<unknown[]> {
  const pages: unknown[] = [];
  let cursor: unknown;
  for (let i = 0; i < most; i++) {
    const answer = (await ask(h, name, cursor === undefined ? { ...args, limit: 2 } : { ...args, limit: 2, cursor }, ctx)) as { ok?: boolean; value?: { cursor?: unknown; next?: unknown } };
    pages.push(answer);
    const next = answer?.ok ? (answer.value?.cursor ?? answer.value?.next) : undefined;
    if (next === undefined || next === null || next === cursor) break;
    cursor = next;
  }
  return pages;
}
