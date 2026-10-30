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

test('goto takes only an address of the app, and reads one from before the move as the one it names now', async () => {
  const { appPath } = await import('./shell.ts');
  assert.equal(appPath('/'), '/');
  assert.equal(appPath('/decide'), '/decide');
  assert.equal(appPath('/acme/r/tasks?x=1'), '/acme/r/tasks?x=1');
  assert.equal(appPath('/app'), '/');
  assert.equal(appPath('/app/decide'), '/decide');
  assert.equal(appPath('/app?x=1'), '/?x=1');
  for (const bad of [undefined, '', 'decide', 'https://evil.example/x', '//evil.example', '/../etc', '/app/../etc', '/x\\evil', 'javascript:alert(1)', '/api/export', '/auth/logout', '/oauth/authorize', '/app/api/boot'])
    assert.equal(appPath(bad), null, String(bad));
  /* SEC4: `/app` comes off with every slash behind it, so what is left is never another host. */
  for (const odd of ['/app//evil.example', '/app///evil.example/x', '/app/%2F%2Fevil.example']) {
    const to = appPath(odd);
    assert.ok(to === null || (to.startsWith('/') && !to.startsWith('//')), `${odd} went to ${to}`);
  }
});

test('the Mac notifications switch defaults off in a browser and keeps what is set', async () => {
  const kept = new Map<string, string>();
  g.localStorage = { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v) };
  const { macNotifications, setMacNotifications } = await import('./shell.ts');
  assert.equal(macNotifications(), false);
  setMacNotifications(true);
  assert.equal(macNotifications(), true);
  setMacNotifications(false);
  assert.equal(macNotifications(), false);
  delete g.localStorage;
});

test('a browser with no shell still hears goto locally', async () => {
  const { onShell } = await import('./shell.ts');
  const stop = onShell('goto', () => {});
  assert.equal(typeof stop, 'function');
  stop();
});
