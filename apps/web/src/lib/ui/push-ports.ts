/**
 * The browser's half of turning push on, shared by Settings' switch (`PushToggle.svelte`) and the phone's one ask
 * (`lib/phone/PhoneHints.svelte`), so both register the same worker at the same scope and subscribe the same way.
 */

import { dev } from '$app/environment';
import { createClient } from '@braindog/client';

import { BASE, apiBase } from '$lib/at.ts';
import type { Manager, Ports } from './push.ts';
import type { Call } from './webhook-doors.ts';

/** Register the worker and wait for it to be active: `subscribe` on one still installing fails in Chrome. */
export async function pushManager(): Promise<Manager> {
  /* DEVELOPMENT SERVES THE WORKER UNBUNDLED, AS A MODULE. Kit's dev server answers `service-worker.js` with one
     `import` of the source file, whatever `register` says, and only a module worker can run an `import`. */
  await navigator.serviceWorker.register(`${BASE}/service-worker.js`, { scope: `${BASE}/`, type: dev ? 'module' : 'classic' });
  return (await navigator.serviceWorker.ready).pushManager as unknown as Manager;
}

/** What a press reaches the browser and the record through. */
export const pushPorts = (): Ports => ({
  permission: () => Notification.requestPermission(),
  manager: pushManager,
  call: createClient({ base: apiBase() }).call as unknown as Call,
});

/** What this browser has for push, as `offerOf` reads it. */
export const pushCan = () => ({
  worker: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
  push: typeof window !== 'undefined' && 'PushManager' in window,
  notify: typeof window !== 'undefined' && 'Notification' in window,
});
