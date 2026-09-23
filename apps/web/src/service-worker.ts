/**
 * The service worker, and all it does is ring (`loop/research-living-in-it.md` W58-4).
 *
 * ONE FIXED LINE, WHATEVER CAME WITH THE PUSH. `09 §3` is that a push carries no content, because it passes through a
 * push service nobody here runs and this record holds money and credentials. The Worker sends no body at all (W58-3),
 * and the kernel's `notify.push` job still writes `{ title, url }`, so this file is the place that guarantees it: the
 * payload is never read, and `push.test.ts` fires a push whose payload throws when touched.
 *
 * IT CACHES NOTHING AND ANSWERS NO REQUEST. There is no `fetch` listener, so every request the app makes goes to the
 * network exactly as it did before this file existed, and no stale shell can be served from here after a deploy. What
 * changed is read when the app opens, with the person's own session, which a service worker could not do more safely.
 *
 * A MODULE TO TYPESCRIPT, AND NOTHING EXPORTED TO THE BROWSER. With no import and no export the file was a script, and a
 * script's top-level names are globals of the whole program `svelte-check` reads, which includes this file by name.
 * Measured with the compiler: a second file in the same program typed `Scope` and read `sw` with no import and no error,
 * and with the marker it is told `Cannot find name`.
 *
 * THE EMPTY `export {}` AT THE FOOT EXPORTS NOTHING, so the bundle SvelteKit builds from this file carries no `export`
 * statement. That matters because `PushToggle.svelte` registers the result as a classic script outside development,
 * where an `export` is a syntax error and the worker never installs. Measured by bundling this file with Vite 8 as
 * `build_service_worker.js` configures it: the output holds the two listeners, no `export`, and parses as a script.
 *
 * The types below are the four members of `ServiceWorkerGlobalScope` it touches, declared here rather than by pulling
 * the `webworker` library into a program that is otherwise the DOM's, where the two declare `self` differently.
 */

type Waits = { waitUntil(p: Promise<unknown>): void };
type Opened = { url: string; focus(): Promise<unknown> };
type Scope = {
  registration: { scope: string; showNotification(title: string, options?: { tag?: string }): Promise<void> };
  clients: {
    matchAll(o: { type: 'window'; includeUncontrolled: boolean }): Promise<readonly Opened[]>;
    openWindow(url: string): Promise<unknown>;
  };
  addEventListener(type: 'push', fn: (e: Waits) => void): void;
  addEventListener(type: 'notificationclick', fn: (e: Waits & { notification: { close(): void } }) => void): void;
};

const sw = self as unknown as Scope;

/* THE TAG MAKES A SECOND PUSH REPLACE THE FIRST LINE. Two unread lines saying the same thing are one fact drawn twice,
   and the kernel already holds urgent ones to one an hour. */
sw.addEventListener('push', (e) => {
  e.waitUntil(sw.registration.showNotification('Something in your BrainDog needs you', { tag: 'braindog' }));
});

/* THE RECORD'S HOME IS THE ROOT OF THE SCOPE, `/app/`, which is the record the session is on. The push names no record,
   so this cannot open a slug; a Home already open is focused rather than opened twice, and a window on another screen
   is left where it is, because navigating it would throw away whatever was being typed there. */
sw.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const home = sw.registration.scope;
  e.waitUntil(
    (async () => {
      const open = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const there = open.find((w) => w.url === home);
      return there ? there.focus() : sw.clients.openWindow(home);
    })(),
  );
});

/* THE MODULE MARKER, AND ALL IT DOES IS KEEP THE NAMES ABOVE OUT OF THE GLOBAL SCOPE. The header says why it is empty. */
export {};
