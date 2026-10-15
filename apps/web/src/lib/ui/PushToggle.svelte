<!--
  Notifications on this device: one toggle that subscribes this browser to the record's pushes, with the host's public
  key, and is drawn only where the host has one. The rules are `push.ts`, which
  the tests hold, and the words are `copy.ts`'s `push*` keys; this file fills in the browser's half and draws the answer.

  NOTHING AT ALL WITHOUT A KEY. The key is asked of `<apiBase>/api/push/key` when the row mounts, and until the owner has set
  the keys the Worker delivers no `notify.push`, so a switch here would turn on and never ring. A host that
  answers `null`, a 404, the static shell or nothing at all draws nothing, and `hostKey` holds all four.

  EVERYBODY'S OWN, NOT THE OWNER'S. `subscribePush` is READ and above, and each person's subscription is theirs alone,
  so this row is drawn for anyone signed in, unlike the owner-only rows beside it.

  THE PRESS IS THE ONLY THING THAT REGISTERS THE WORKER. `svelte.config.js` sets `serviceWorker.register: false`: at the
  default, `@sveltejs/kit` 2.70.3's `render.js` put a `register` call in the shell's inline boot script for every visitor
  on every page, measured as `service_worker: true` in the generated `internal.js`. So a person who never presses this
  never has a worker installed, and opening this screen only reads a registration that already exists.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { dev } from '$app/environment';
  import { createClient } from '@braindog/client';
  import { BASE, apiBase } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { hostKey, offerOf, startOf, turnOff, turnOn, type Manager, type Offer, type Ports, type Said } from '$lib/ui/push.ts';
  import type { Call } from '$lib/ui/webhook-doors.ts';
  import Section from '$lib/ui/Section.svelte';
  import Button from '$lib/ui/Button.svelte';

  /* THE HOST `boot` NAMED, when it named one. Only the Worker serves the key, so a self-host is not asked: the GET was a
     404 in the console of every self-host that opened Notifications. Absent is a host older than the field, asked. */
  let { host, onchange }: { host?: 'cloud' | 'self-host' | undefined; onchange?: ((on: boolean) => void) | undefined } = $props();

  let offer = $state<Offer>(null);
  let on = $state(false);
  let line = $state('');
  let bad = $state(false);
  let busy = $state(false);

  /* EVERY ARM BUT `on` AND `off` IS ONE SENTENCE: the browser's, which `push.ts` words, or the record's own `fix`. */
  const lineOf = (s: Said): string => (s.kind === 'on' || s.kind === 'off' ? '' : 'line' in s ? s.line : s.fix);

  async function manager(): Promise<Manager> {
    /* DEVELOPMENT SERVES THE WORKER UNBUNDLED, AS A MODULE. Kit's dev server answers `service-worker.js` with one
       `import` of the source file, whatever `register` says, and only a module worker can run an `import`. */
    await navigator.serviceWorker.register(`${BASE}/service-worker.js`, { scope: `${BASE}/`, type: dev ? 'module' : 'classic' });
    /* `subscribe` ON A WORKER STILL INSTALLING FAILS in Chrome with "no active Service Worker", so this waits for one. */
    return (await navigator.serviceWorker.ready).pushManager as unknown as Manager;
  }

  const ports = (): Ports => ({
    permission: () => Notification.requestPermission(),
    manager,
    call: createClient({ base: apiBase() }).call as unknown as Call,
  });

  /* `hostKey` AND `startOf` NEVER REJECT, which is why nothing below catches: each turns every refusal into a value. */
  async function begin() {
    if (host === 'self-host') return;
    const made = offerOf(await hostKey(apiBase()), {
      worker: 'serviceWorker' in navigator,
      push: 'PushManager' in window,
      notify: 'Notification' in window,
    });
    offer = made;
    if (made?.can !== true) return;
    /* WHETHER THIS BROWSER IS ALREADY TOLD, read from the registration that already exists and never by making one:
       opening Settings must not install a worker for somebody who has not pressed anything. */
    const start = await startOf(Notification.permission, async () => {
      const r = await navigator.serviceWorker.getRegistration(`${BASE}/`);
      return r ? (await r.pushManager.getSubscription()) !== null : false;
    });
    on = start.on;
    onchange?.(on);
    line = start.line;
    bad = start.line !== '';
  }

  onMount(() => void begin());

  async function press() {
    if (busy || offer?.can !== true) return;
    busy = true;
    const said = on ? await turnOff(ports()) : await turnOn(ports(), offer.key);
    if (said.kind === 'on') on = true;
    if (said.kind === 'off') on = false;
    onchange?.(on);
    line = lineOf(said);
    bad = line !== '';
    busy = false;
  }
</script>

{#if offer}
  <Section title={copy.pushTitle}>
    <p class="hint">{copy.pushHow}</p>
    {#if !offer.can}
      <p class="hint">{offer.line}</p>
    {:else}
      <p class="hint">{on ? copy.pushIsOn : copy.pushIsOff}</p>
      <div class="row-actions">
        <Button weight={on ? 'quiet' : 'primary'} disabled={busy} onclick={() => void press()}>
          {busy ? copy.pushAsking : on ? copy.pushTurnOff : copy.pushTurnOn}
        </Button>
      </div>
      <!-- Always in the document: a live region inserted with its first sentence is not reliably announced. -->
      <p class="said" role="status" data-intent={bad ? 'bad' : undefined}>{line}</p>
    {/if}
  </Section>
{/if}

<style>
  /* THE SETTINGS PAGE'S OWN RULES, REPEATED, as `WebhookDoors.svelte` repeats them: its styles are scoped to it and do
     not reach inside a component, and this row has to read as part of the same screen. */
  .hint {
    margin: 0 0 var(--sp-3);
    max-inline-size: var(--measure);
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  .said {
    margin: 0;
    color: var(--tone, var(--ink2));
    font-size: var(--t-sm);
  }

  .row-actions {
    flex-wrap: wrap;
    display: flex;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
  }
</style>
