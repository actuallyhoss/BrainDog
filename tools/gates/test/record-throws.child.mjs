/**
 * One `startRecord()` whose seed step goes wrong, in a process of its own, for `record-throws.test.mjs`.
 *
 *   node --experimental-test-module-mocks --experimental-strip-types record-throws.child.mjs <throw|refuse>
 *
 * A PROCESS OF ITS OWN BECAUSE `mock.module` NEEDS A FLAG, and the flag is not one `node --test` over this directory
 * is run with. The seed module is replaced before `record.mjs` is imported, so the `installSeed` the record calls is
 * the stub and everything else it reads from the seed (`NOW` above all) is the real module's.
 *
 * THE QUESTION IS ASKED BY REBINDING THE PORT, NOT BY COUNTING HANDLES. The first version read
 * `process.getActiveResourcesInfo()` straight after the throw and saw a `TCPServerWrap` even on the refusal path,
 * where the close had been awaited; 200ms later the list was empty. A listing that lags the close cannot tell a leak
 * from a close in flight, and a second `listen` on the same port is the failure a gate run actually meets.
 *
 * WHAT IT PRINTS IS ONE LINE OF JSON: whether the port was taken while the stub ran, whether it could be bound again
 * after `startRecord()` threw, and the message it threw. It then exits on purpose, because a leaked record's server
 * is not `unref`ed and would otherwise hold this process open until the parent's timeout.
 */

import { createServer } from 'node:net';
import { mock } from 'node:test';

const mode = process.argv[2];
const SEED = new URL('../../../packages/seed/src/index.ts', import.meta.url).href;

/** `null` when `port` can be bound on the record's host and was given back, else the error code that refused it. */
const bind = (port) =>
  new Promise((resolve) => {
    const probe = createServer();
    probe.once('error', (e) => resolve(e.code ?? String(e)));
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(null)));
  });

/* A port that was free a moment ago, handed to the record so the probe knows which one to ask about. */
const port = await new Promise((resolve) => {
  const probe = createServer().listen(0, '127.0.0.1', () => {
    const { port: p } = probe.address();
    probe.close(() => resolve(p));
  });
});

const real = await import(SEED);
let during = null;
mock.module(SEED, {
  namedExports: {
    ...real,
    installSeed: async () => {
      during = await bind(port);
      if (mode === 'throw') throw new Error('the stub seed threw');
      return { ok: false, refusal: { code: 'VALUE_MALFORMED', fix: 'the stub seed refused (a registered code, so the refusals gate does not count a test double as a new one)' } };
    },
  },
});

const { startRecord } = await import('../record.mjs');
let threw = null;
try {
  await startRecord(port);
} catch (e) {
  threw = e instanceof Error ? e.message : String(e);
}
console.log(JSON.stringify({ during, after: await bind(port), threw }));
process.exit(0);
