/**
 * `ctx.fold` across the sandbox's boundary: a text out to the host, its answer back, and nothing where no host hands one.
 *
 * WHY A SCRIPT IS HANDED IT. Folding a bank's spelling of a payee is the kernel's tables, and a sandbox runs its
 * script's text alone, so the host answers (`scriptFold` in `@braindog/host/script`). This package only carries the
 * call: the host here is a double that records what reached it.
 *
 * MISSING, NOT A STUB. Money's `match_payment` asks `typeof ctx.fold === 'function'` and compares names plainly when it
 * is not, so a host that hands none must leave the script with no `ctx.fold` at all.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { CtxHost, ScriptAnswer, ScriptDecl } from '../src/index.ts';
import { runInQuickJs } from '../src/quickjs.ts';

/* THE THREAD'S OWN CPU, in milliseconds, which is what cpu_ms meters (`threadCpu` in `quickjs.ts`): a refusal at cpu_ms
   is held to the CPU spent before it came, since on a loaded machine the wall it took is mostly waiting for a core. */
const cpuNow = (): number => {
  const u = process.threadCpuUsage();
  return (u.user + u.system) / 1_000;
};

const decl = (source: string, over: Partial<ScriptDecl> = {}): ScriptDecl => ({ id: 'folds', version: 1, egress: [], keys: [], reads: [], writes: ['seen'], source, ...over });

const host = (fold?: (text: string) => Promise<string | null>): CtxHost & { folded: string[] } => {
  const folded: string[] = [];
  return {
    folded,
    fetch: async () => ({ status: 200, headers: {}, body: '' }),
    ...(fold === undefined
      ? {}
      : {
          fold: (text: string) => {
            folded.push(text);
            return fold(text);
          },
        }),
    now: () => '2026-10-14T10:00:00Z',
    tz: 'Africa/Cairo',
    input: null,
  };
};

const writesOf = (a: ScriptAnswer) => {
  assert.ok('writes' in a, JSON.stringify(a));
  return a.writes;
};

const SAYS = `export default async function run(ctx) {
  ctx.write('seen', { has: typeof ctx.fold, key: typeof ctx.fold === 'function' ? await ctx.fold('GEIDEA*CHILLOUT 0423 CAIRO EG') : 'none' });
}`;

test('a host that hands a fold is asked with the text as written, and its answer is what the script reads', async () => {
  const h = host(async () => 'bank:chillout');
  assert.deepEqual(writesOf(await runInQuickJs(decl(SAYS), h)), [{ op: 'create', register: 'seen', fields: { has: 'function', key: 'bank:chillout' } }]);
  assert.deepEqual(h.folded, ['GEIDEA*CHILLOUT 0423 CAIRO EG']);
});

test('a host that hands none leaves the script with no ctx.fold, not one that answers nothing', async () => {
  const h = host();
  assert.deepEqual(writesOf(await runInQuickJs(decl(SAYS), h)), [{ op: 'create', register: 'seen', fields: { has: 'undefined', key: 'none' } }]);
  assert.deepEqual(h.folded, []);
});

test('no payee is null on the script side, and what is not a text crosses as its words', async () => {
  const h = host(async (text) => (text === '42' ? 'bank:42' : null));
  const a = await runInQuickJs(decl(`export default async function run(ctx) { ctx.write('seen', { none: await ctx.fold(''), number: await ctx.fold(42) }); }`), h);
  assert.deepEqual(writesOf(a), [{ op: 'create', register: 'seen', fields: { none: null, number: 'bank:42' } }]);
  assert.deepEqual(h.folded, ['', '42']);
});

test('it reads nothing of the record, so a script that declares no reads may fold', async () => {
  const a = await runInQuickJs(decl(SAYS, { reads: [] }), host(async () => 'bank:chillout'));
  assert.ok('writes' in a, JSON.stringify(a));
});

test('a fold the host refuses is an error the script may catch, and no rule is broken', async () => {
  const h = host(async () => {
    throw new Error('folds asked for more than 1000 payee keys in one run, so no more were answered.');
  });
  const a = await runInQuickJs(
    decl(`export default async function run(ctx) { try { await ctx.fold('Chill Out'); } catch (e) { ctx.write('seen', { said: String(e.message) }); } }`),
    h,
  );
  assert.deepEqual(writesOf(a), [{ op: 'create', register: 'seen', fields: { said: 'folds asked for more than 1000 payee keys in one run, so no more were answered.' } }]);
});

/* THE SAME SHAPE AS `ctx.write` AND `ctx.log` IN `quickjs.test.ts`: nearly all of this loop's time is the copy of an
   8 MB text across the boundary, where the interpreter's own interrupt is never asked, so only the charge at the top
   of the host function and after the decode can end it. */
test('time spent handing ctx.fold its text is the script\'s CPU and is refused at cpu_ms', async () => {
  const h = host(async () => null);
  const t = cpuNow();
  const a = await runInQuickJs(
    decl(`export default async function run(ctx) { const s = 'x'.repeat(8 * 1024 * 1024); for (let i = 0; i < 100; i++) await ctx.fold(s); }`, { limits: { cpu_ms: 200 } }),
    h,
  );
  const took = cpuNow() - t;
  assert.ok('refused' in a, `expected a refusal, got ${JSON.stringify(a).slice(0, 200)}`);
  assert.equal(a.refused.code, 'OUT_OF_BOUNDS');
  assert.match(a.refused.why, /cpu_ms of 200/u);
  assert.ok(h.folded.length < 100, `${h.folded.length} folds reached the host`);
  assert.ok(took < 2 * 200 + 400, `took ${Math.round(took)} ms of CPU`);
});
