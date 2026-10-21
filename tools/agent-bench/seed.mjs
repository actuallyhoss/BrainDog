/**
 * The seed, in process: a record with the seed installed, and a `call(name, args)` that goes through the same router
 * the host uses. No network, no bridge. Used by `run.mjs` and by the bench test.
 */
import { handle } from '../../packages/mcp/src/rpc.ts';
import { createRecordApi } from '../../packages/record/src/index.ts';
import { installSeed } from '../../packages/seed/src/index.ts';
import { fixedClock, openSqlite } from '../../packages/kernel/test/sqlite.ts';

const SESSION = { client_id: 'bench-1', cwd: '/Users/studio/Code/kiln-type', repo: 'kiln-type', host: 'bench.local', agent: 'claude', client: 'claude-code' };

/** A record, seeded or opened from a file (a restored copy), and a caller on it. */
export async function openBench({ file, seed = true, scope = 'propose' } = {}) {
  const sql = openSqlite(file ?? ':memory:');
  const api = await createRecordApi({ sql, clock: fixedClock(Date.now()) });
  if (seed) await installSeed(api.kernel);
  const who = { principal: { kind: 'token', id: 't_bench', scope, person: 'p_seed', level: 'owner' }, session: SESSION };
  let id = 0;
  const rpc = async (method, params) => {
    const t = performance.now();
    const r = await handle({ jsonrpc: '2.0', id: ++id, method, params }, api, who);
    const ms = performance.now() - t;
    const text = r.result?.content?.map((c) => c.text).join('\n') ?? JSON.stringify(r.error ?? r.result);
    return { ms, bytes: Buffer.byteLength(text), refused: Boolean(r.result?.isError || r.error), result: r.result };
  };
  return { api, rpc, close: () => sql.close?.() };
}
