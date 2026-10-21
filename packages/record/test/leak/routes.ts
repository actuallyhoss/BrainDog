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
import { firewall } from '../../src/sight.ts';
import { PAGES, type Fixture } from './fixture.ts';

/**
 * Every answer the doors' firewall would have taken a hidden field off (`firewall`, sharing plan §2.5 item 6), by
 * method: the matrix asks the handlers as `serveApi` does and the MCP server through `serveMcp`, and holds this empty.
 */
export const FIREWALLED: string[] = [];

export type Args = Record<string, unknown>;

/** The twelve routes §4.4 holds to P2 to P4 as well as P1. */
export const CORE = ['list', 'get', 'search', 'history', 'recentHistory', 'whatsNew', 'page', 'previewPage', 'context', 'backlinks', 'metric', 'boot'] as const;

/**
 * Every route a reader reaches: READ+ and DATA, and none that writes. `previewPage` is READ+ and carried as a POST
 * because it takes a body, and it writes nothing, so it is read here too.
 */
export const READ_ROUTES: readonly string[] = ROUTES.filter((r) => (r.group === 'READ+' || r.group === 'DATA') && (!r.writes || r.name === 'previewPage')).map((r) => r.name);

const FIELDS: Record<string, string[]> = {
  things: ['name', 'notes', 'earned'],
  people: ['name', 'email'],
  tasks: ['name', 'thing', 'stage', 'rate', 'notes', 'assignee'],
  money: ['payee', 'amount', 'thing', 'notes'],
  credentials: ['label', 'opens'],
  notes: ['what', 'thing'],
};
export const LIST_IDS = Object.keys(FIELDS);

/**
 * The kernel's own lists, the owner's (the runs, and what he told them), asked by name on every path that takes a list
 * or a row, with the fields their words are in. They are not in `LIST_IDS`, since the fixture's truth counts no row of
 * theirs; their words are the fixture's `extras`.
 */
export const KERNEL_FIELDS: Record<string, string[]> = { session: ['doing', 'head', 'state'], instructions: ['said', 'reply', 'state'] };
const KERNEL_SPOKEN = ['S1', 'IN1'];

/**
 * The arguments one route is asked with on this fixture. `lean` is the set P2 asks twice per round: every list and a
 * filter that reaches past each grant, rather than every field against every row's word, which P1 asks once.
 */
export function argsFor(name: string, f: Fixture, lean = false): Args[] {
  const rows = [...f.rows.values()];
  const words = [...rows.map((r) => r.canary.word), ...rows.flatMap((r) => r.held.flatMap((h) => (h.word ? [h.word] : []))), ...f.extras.map((e) => e.canary.word), 'Kiln', 'Loom', 'Sam'];
  const lists = LIST_IDS.map((register) => ({ register }));
  const route = ROUTES.find((r) => r.name === name);
  const takes = Object.keys((route as { takes?: Record<string, unknown> } | undefined)?.takes ?? {});
  const kernelLists = Object.keys(KERNEL_FIELDS).map((register) => ({ register }));
  const kernelRows = [...Object.keys(KERNEL_FIELDS).map((register) => ({ register, seq: 1 })), ...KERNEL_SPOKEN.map((spoken) => ({ spoken }))];
  switch (name) {
    case 'get':
      return [...rows.map((r) => ({ register: r.list, seq: r.seq })), ...rows.map((r) => ({ spoken: f.spoken(r) })), { register: 'tasks', seq: 9_999 }, ...kernelRows];
    case 'list':
      if (lean)
        return [
          ...lists,
          { register: 'tasks', includeDeleted: true },
          { register: 'tasks', order: [{ field: 'rate', dir: 'desc' }] },
          { register: 'tasks', where: { field: 'thing', is: f.built.ids.loom } },
          { register: 'tasks', where: { field: 'notes', contains: 'private' } },
          ...kernelLists,
        ];
      return [
        ...lists,
        ...kernelLists,
        ...kernelLists.map((l) => ({ ...l, includeDeleted: true })),
        ...Object.entries(KERNEL_FIELDS).flatMap(([register, fields]) => fields.map((field) => ({ register, order: [{ field, dir: 'desc' }] }))),
        ...lists.map((l) => ({ ...l, includeDeleted: true })),
        ...LIST_IDS.flatMap((register) =>
          FIELDS[register]!.flatMap((field) => [
            { register, order: [{ field, dir: 'desc' }] },
            { register, where: { field, present: true } },
            ...rows.filter((r) => r.list === register).map((r) => ({ register, where: { field, contains: r.canary.word } })),
            ...rows.filter((r) => r.list === register).flatMap((r) => r.held.filter((h) => h.field === field && h.word).map((h) => ({ register, where: { field, contains: h.word } }))),
          ]),
        ),
        { register: 'tasks', where: { field: 'thing', is: f.built.ids.loom } },
        { register: 'tasks', where: { field: 'stage', is: 'todo' } },
        { register: 'money', where: { field: 'thing', is: f.built.ids.loom } },
      ];
    case 'countBy':
      return [...LIST_IDS.flatMap((register) => FIELDS[register]!.map((by) => ({ register, by }))), ...Object.entries(KERNEL_FIELDS).flatMap(([register, fields]) => fields.map((by) => ({ register, by })))];
    case 'search':
      return words.map((q) => ({ q }));
    case 'history':
    case 'backlinks':
      return [...rows.map((r) => ({ register: r.list, seq: r.seq })), { register: 'tasks', seq: 9_999 }, ...Object.keys(KERNEL_FIELDS).map((register) => ({ register, seq: 1 }))];
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
        /* A TILE OVER ONE PROJECT'S MONEY, and the projects with what each earned, as a project page draws them. */
        {
          body: {
            page: 'probe-money',
            title: 'Probe',
            requires: ['register.things', 'register.money'],
            blocks: [
              { kind: 'stat', key: 'spent-on', cells: (['kiln', 'loom'] as const).map((k) => ({ metric: `money-on:${f.spoken(f.rows.get(k)!)}` })) },
              { kind: 'table', key: 'earned', heading: 'Earned', source: 'register.things', columns: [{ field: 'name' }, { field: 'earned' }] },
            ],
          },
        },
        /* A PAGE OVER THE KERNEL'S LISTS, the runs and what he told them, as a person could draft one. */
        ...Object.entries(KERNEL_FIELDS).map(([register, fields]) => ({
          body: { page: `probe-${register}`, title: 'Probe', requires: [`register.${register}`], blocks: [{ kind: 'table', key: register, heading: 'Probe', source: `register.${register}`, columns: fields.map((field) => ({ field })) }] },
        })),
      ];
    case 'metric':
      return [{ metric: 'tasks-count' }, { metric: 'tasks-rate' }, { metric: 'money-sum' }, ...(['kiln', 'loom'] as const).map((k) => ({ metric: `money-on:${f.spoken(f.rows.get(k)!)}` }))];
    case 'comments':
      return [...rows.map((r) => ({ on: f.spoken(r) })), ...KERNEL_SPOKEN.map((on) => ({ on }))];
    case 'usedBy':
      return [...rows.map((r) => ({ spoken: f.spoken(r) })), ...KERNEL_SPOKEN.map((spoken) => ({ spoken }))];
    case 'instructionList':
      return [{}, { state: 'done' }, { run: 'S1' }];
    case 'presence':
    case 'sessionsLive':
      return [{}, { repo: 'kiln' }];
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
    const answer = await handler(args, ctx);
    const held = firewall(ctx, answer);
    if (held.stripped.length > 0) FIREWALLED.push(`${name} ${held.stripped.join(', ')}`);
    return answer;
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
