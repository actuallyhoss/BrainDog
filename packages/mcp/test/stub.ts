/**
 * A surface that records what it was asked, for the tests that are about the tool layer and the wire
 * rather than about the record. Every method answers `ok`; a test overrides the one it is about.
 */

import type { Result } from '@braindog/ports';

import type { McpSurface } from '../src/index.ts';

export type Ctx = { who: string };
export type Call = { method: string; args: unknown; ctx: unknown };

export function stub(over: Partial<McpSurface<Ctx>> = {}) {
  const calls: Call[] = [];
  const said =
    <T>(method: string, value: T) =>
    async (...a: unknown[]): Promise<Result<T>> => {
      calls.push({ method, args: a.length > 1 ? a[0] : undefined, ctx: a.at(-1) });
      return { ok: true, value };
    };
  const surface: McpSurface<Ctx> = {
    boot: said('boot', { registers: [{ id: 'obligations', name: 'Obligations' }] }),
    version: said('version', { version: 41 }),
    whoami: said('whoami', { kind: 'token' }),
    schema: said('schema', { fields: [] }),
    get: said('get', { seq: 41 }),
    list: said('list', { rows: [] as { fields: Record<string, unknown> }[] }),
    search: said('search', []),
    history: said('history', []),
    governance: said('governance', []),
    propose: said('propose', { id: 'SG1' }),
    create: said('create', { seq: 1 }),
    update: said('update', { seq: 41 }),
    pages: said('pages', [] as { slug: string; title: string }[]),
    page: said('page', { blocks: [] }),
    metric: said('metric', { value: 1 }),
    digestToday: said('digestToday', []),
    context: said('context', { session: null }),
    handoff: said('handoff', { spoken: 'S1' }),
    meet: said('meet', { created: true }),
    sessionsLive: said('sessionsLive', []),
    recentHistory: said('recentHistory', { events: [] as unknown[], cursor: null }),
    actions: said('actions', [] as unknown[]),
    ...over,
  };
  return { surface, calls };
}
