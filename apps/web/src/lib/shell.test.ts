/** The shell door: in a browser it does the web thing, with a shell it hands over. */
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';

const g = globalThis as Record<string, unknown>;
afterEach(() => {
  delete g.__BRAINDOG_SHELL__;
  delete g.open;
});

test('a link opens in a new tab with noopener when there is no shell', async () => {
  const calls: unknown[][] = [];
  g.open = (...a: unknown[]) => calls.push(a);
  const { openOutside } = await import('./shell.ts');
  openOutside('https://brain.dog');
  assert.deepEqual(calls, [['https://brain.dog', '_blank', 'noopener,noreferrer']]);
});

test('a shell takes the link instead, and a browser hears nothing', async () => {
  const seen: string[] = [];
  g.__BRAINDOG_SHELL__ = { open: (u: string) => seen.push(u) };
  const { openOutside, onShell } = await import('./shell.ts');
  openOutside('https://brain.dog');
  assert.deepEqual(seen, ['https://brain.dog']);
  delete g.__BRAINDOG_SHELL__;
  assert.equal(typeof onShell('slash', () => {}), 'function');
});

test('notify and badge do nothing without permission or support', async () => {
  const { notify, setBadge, isApp } = await import('./shell.ts');
  notify('a', 'b');
  setBadge(3);
  assert.equal(isApp, false);
});

test('a payment page leaves this tab in a browser and goes to the shell in the app', async () => {
  const went: string[] = [];
  g.location = { assign: (u: string) => went.push(u) };
  const { openOutside } = await import('./shell.ts');
  openOutside('https://checkout.stripe.com/c/pay/x', { here: true });
  assert.deepEqual(went, ['https://checkout.stripe.com/c/pay/x']);
  const seen: string[] = [];
  g.__BRAINDOG_SHELL__ = { open: (u: string) => seen.push(u) };
  openOutside('https://billing.stripe.com/p/session/y', { here: true });
  assert.deepEqual(seen, ['https://billing.stripe.com/p/session/y']);
  assert.equal(went.length, 1);
  delete g.location;
});

test('goto takes only an address under /app', async () => {
  const { appPath } = await import('./shell.ts');
  assert.equal(appPath('/app'), '/app');
  assert.equal(appPath('/app/decide'), '/app/decide');
  assert.equal(appPath('/app?x=1'), '/app?x=1');
  for (const bad of [undefined, '', '/', '/apple', 'https://evil.example/app/x', '//evil.example', '/app/../etc', '/app\\evil', 'javascript:alert(1)'])
    assert.equal(appPath(bad), null, String(bad));
});
