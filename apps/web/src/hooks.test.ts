/**
 * The `reroute` hook: `/<slug>/…` is drawn by the same route as `/…`.
 *
 * THE ROUTE TREE DOES NOT MOVE. The slug cannot be `paths.base`, which is static, so SvelteKit is handed the address
 * with the slug taken out, and `routes/r/[register]` answers `/acme/r/tasks` as it answers `/r/tasks`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { reroute } from './hooks.ts';

const asked = async (path: string) => (await reroute({ url: new URL(path, 'https://brain.dog'), fetch })) as string | void;

test('reroute maps a slugged address onto the route that draws it', async () => {
  assert.equal(await asked('/acme/r/tasks'), '/r/tasks');
  assert.equal(await asked('/acme/settings/agents?x=1'), '/settings/agents');
  assert.equal(await asked('/r/tasks'), undefined);
});
