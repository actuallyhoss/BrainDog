/**
 * The site Worker's one function, held to handing the app the request it received and giving back the app's answer.
 *
 * THE SCRIPT HANDS THE REQUEST OVER WHOLE AND GIVES BACK THE APP'S ANSWER WHOLE. The app reads its host from the URL
 * (`legacyRedirect`, the device flow's `reached`), its CSRF check from `Origin`, its session from `Cookie`, and a
 * webhook's body is the thing being delivered, so a copy that dropped any of them would be a quiet fault in a door.
 * Measured on 23 September through `wrangler dev -c site -c app`:
 * the app saw the URL, method, body, `Cookie`, `Origin`, `Host` and `cf-connecting-ip` the site script saw, and two
 * `Set-Cookie` headers and a 308 came back untouched.
 *
 * IDENTITY IS THE ASSERTION, NOT A FIELD-BY-FIELD COMPARISON, because a comparison only covers the fields somebody
 * thought to list. Measured: a forwarder that passed `new Request(request)` failed the first assertion here, and a copy
 * like that is where a header list starts.
 *
 * A WIDENED SPECIFIER, AS `apps/worker/test/wrangler-routes.test.ts` DOES IT, so the file fails as a red test with
 * `ERR_MODULE_NOT_FOUND` while the script does not exist, rather than as a typecheck error nobody runs first.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

const script = '../src/worker.ts' as string;

test('the site script passes the request itself to the app and returns what the app answered', async () => {
  const { default: worker } = (await import(script)) as { default: { fetch: (r: Request, env: unknown) => Promise<Response> } };
  const request = new Request('https://brain.dog/app/acme/api/propose?x=1', { method: 'POST', headers: { origin: 'https://brain.dog', cookie: '__Host-bd_s=abc' }, body: '{}' });
  const answer = new Response(null, { status: 308, headers: { location: 'https://app.brain.dog/acme/' } });
  let seen: Request | null = null;
  const out = await worker.fetch(request, { APP: { fetch: async (r: Request) => ((seen = r), answer) } });
  assert.equal(seen, request, 'the app was handed a different request from the one the site received');
  assert.equal(out, answer, "the site answered something other than the app's own response");
});

test('the site script no longer carries the watchdog, which is apps/watchdog', async () => {
  const mod = (await import(script)) as { watch?: unknown; default: { scheduled?: unknown } };
  assert.equal(mod.watch, undefined);
  assert.equal(mod.default.scheduled, undefined);
});
