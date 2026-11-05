/**
 * The log floor holds on the runtime the Worker runs on.
 *
 * `log-floor.ts` works by replacing the console's methods, and Node letting that happen says nothing about workerd. So
 * this loads it in a real workerd, at module scope as `index.ts` does, and throws a sentence holding a key. No key here
 * is real, and each is put together at run time.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

/* MINIFLARE IS WRANGLER'S, as `script.test.ts` reaches it. */
const fromWrangler = createRequire(createRequire(import.meta.url).resolve('wrangler/package.json'));
const { Miniflare, convertV4MiniflareOptions } = (await import(pathToFileURL(fromWrangler.resolve('miniflare')).href)) as {
  Miniflare: new (o: object) => { dispatchFetch(url: string, init?: object): Promise<Response>; dispose(): Promise<void> };
  convertV4MiniflareOptions(o: object): object;
};

const FLOOR = fileURLToPath(new URL('../../../packages/host/src/log-floor.ts', import.meta.url));

test('ON WORKERD the console takes the floor at module scope, and a thrown message is written with the key gone', async () => {
  const key = `sk_${'live'}_Q7d9Xk2Lm4Zp8Rt6Vb3Nc1Hs5Jf0Gw2Y`;
  const floor = stripTypeScriptTypes(readFileSync(FLOOR, 'utf8'));
  /* THE COLLECTOR GOES IN FIRST AND THE FLOOR WRAPS IT, so what the collector holds is what the runtime would have written. */
  const script = `
    import { installLogFloor } from './floor.js';
    const seen = [];
    console.error = (...said) => void seen.push(said);
    console.warn = (...said) => void seen.push(said);
    installLogFloor();
    export default {
      async fetch() {
        console.error('slash:', 'refused ${key}');
        try { throw new Error('Invalid regular expression: /${key}/gu: Stack overflow'); } catch (e) { console.warn(e); }
        return Response.json(seen);
      },
    };`;
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      port: 0,
      modules: [
        { type: 'ESModule', path: 'main.js', contents: script },
        { type: 'ESModule', path: 'floor.js', contents: floor },
      ],
      compatibilityDate: '2026-09-01',
    }),
  );
  try {
    const res = await mf.dispatchFetch('http://floor.example/');
    const seen = await res.text();
    assert.ok(seen.includes('slash:'), `no line came through: ${seen.slice(0, 120)}`);
    assert.ok(seen.includes('Invalid regular expression'), 'the thrown line did not come through');
    assert.ok(!seen.includes(key), 'a line held the key');
  } finally {
    await mf.dispose();
  }
});
