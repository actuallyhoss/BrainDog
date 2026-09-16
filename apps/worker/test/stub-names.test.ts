/**
 * A Durable Object's RPC methods, and the names a stub already answers to.
 *
 * `src/index.ts` imports `cloudflare:workers` and cannot be loaded by `node --test`, so its classes are read as
 * text. A method named like one of the stub's own properties is unreachable over RPC: the Directory's `name` was,
 * and every `/auth/provision` answered 500 after making the record.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SOURCE = readFileSync(fileURLToPath(new URL('../src/index.ts', import.meta.url)), 'utf8');

/* What `DurableObjectStub` carries itself. `fetch` is meant to be overridden and is left out. */
const STUB_OWN = ['id', 'name', 'connect', 'then', 'dup', 'constructor'];

function methodsOf(klass: string): string[] {
  const start = SOURCE.indexOf(`export class ${klass} extends DurableObject`);
  assert.ok(start >= 0, `${klass} is not in src/index.ts`);
  const next = SOURCE.indexOf('\nexport ', start + 1);
  const body = SOURCE.slice(start, next < 0 ? undefined : next);
  return [...body.matchAll(/^ {2}(?:override )?(?:async )?([A-Za-z_$][\w$]*)\(/gm)].map((m) => m[1]!);
}

test('NO DURABLE OBJECT METHOD SHARES A NAME WITH THE STUB IT IS CALLED THROUGH', () => {
  for (const klass of ['Record$', 'Directory$']) {
    const methods = methodsOf(klass);
    assert.ok(methods.length > 3, `${klass} read as having ${methods.length} methods`);
    for (const name of methods.filter((m) => m !== 'constructor'))
      assert.ok(!STUB_OWN.includes(name), `${klass}.${name} is the stub's own property, so RPC never reaches it`);
  }
  assert.doesNotMatch(SOURCE, /directory\.name\(/);
});
