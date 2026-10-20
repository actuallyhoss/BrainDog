/**
 * The MCP read paths of the leak matrix (sharing plan §4.3): all 17 tools and the resources, through `serveMcp` in
 * process, so what is checked is the JSON-RPC reply a model is handed, its text and its structured half both.
 *
 * THE WRITE TOOLS ARE ASKED TOO, about rows outside the caller's sight, and only on a record built for them
 * (`WRITES`), so what they change never reaches the reads. A write tool's answer is held to the same canaries, less
 * whatever the caller sent in its own arguments.
 */

import { serveMcp } from '../../../mcp/src/http.ts';
import { TOOLS } from '../../../mcp/src/index.ts';
import type { CallContext } from '../../src/index.ts';
import type { Fixture } from './fixture.ts';
import type { Args } from './routes.ts';

export const TOOL_NAMES: readonly string[] = TOOLS.map((t) => t.name);
export const WRITES: ReadonlySet<string> = new Set(TOOLS.filter((t) => t.writes).map((t) => t.name));

let n = 0;

/** One JSON-RPC message through `serveMcp`, answered as the transport answers it. */
export async function rpc(f: Fixture, method: string, params: Record<string, unknown>, ctx: CallContext): Promise<unknown> {
  const request = new Request('https://brain.dog/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'mcp-protocol-version': '2025-11-25' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++n, method, params }),
  });
  try {
    const res = await serveMcp(request, f.api as never, ctx);
    const raw = await res.text();
    return raw ? JSON.parse(raw) : { status: res.status };
  } catch (cause) {
    return { threw: String((cause as Error)?.message ?? cause) };
  }
}

export const callTool = (f: Fixture, name: string, args: Args, ctx: CallContext) => rpc(f, 'tools/call', { name, arguments: args }, ctx);
export const readResource = (f: Fixture, uri: string, ctx: CallContext) => rpc(f, 'resources/read', { uri }, ctx);
export const listResources = (f: Fixture, ctx: CallContext) => rpc(f, 'resources/list', {}, ctx);

/** The arguments each tool is asked with: every row by its spoken id, every list, the canary words. */
export function toolArgs(name: string, f: Fixture): Args[] {
  const rows = [...f.rows.values()];
  const spoken = rows.map((r) => f.spoken(r));
  const lists = ['things', 'people', 'tasks', 'money', 'credentials', 'notes'];
  switch (name) {
    case 'record_index':
    case 'context':
      return [{}, { format: 'json' }];
    case 'schema':
      return lists.map((register) => ({ register }));
    case 'get':
    case 'history':
      return spoken.map((s) => ({ spoken: s, format: 'json' }));
    case 'list':
      return [
        ...lists.map((register) => ({ register, format: 'json' })),
        ...lists.map((register) => ({ register })),
        { register: 'tasks', where: { field: 'thing', is: f.built.ids.loom }, format: 'json' },
      ];
    case 'search':
      return [...rows.map((r) => ({ q: r.canary.word, format: 'json' })), ...f.extras.map((e) => ({ q: e.canary.word })), { q: 'Kiln' }];
    case 'activity':
      return [{}, { everything: true, format: 'json' }, { limit: 100 }];
    case 'governance':
      return [{}, { register: 'suggestion', status: 'all', format: 'json' }, { register: 'decision', status: 'all' }];
    /* THE WRITES, each about a row out of most callers' sight. */
    case 'update':
      return rows.map((r) => ({ spoken: f.spoken(r), patch: {} }));
    case 'log':
      return rows.map((r) => ({ spoken: f.spoken(r), note: 'Looked at this.' }));
    case 'propose':
      return rows.slice(4, 8).map((r) => ({ question: 'Close this?', body_kind: 'rowset', body: { rows: [{ at: `${r.list}#${r.seq}`, version: 1, patch: {} }] } }));
    case 'create':
      return [{ register: 'tasks', fields: { name: 'A new task', thing: f.built.ids.loom } }, { register: 'notes', fields: { what: 'A new note' } }];
    case 'handoff':
      return [{ doing: 'checking the kiln', next: 'Fire the kiln.' }];
    case 'meet':
      return [{ name: 'Priya', email: 'priya@example.com', where: 'session in braindog' }];
    case 'triage':
      return [{}];
    case 'undo':
      return [{}];
    default:
      return [{}];
  }
}
