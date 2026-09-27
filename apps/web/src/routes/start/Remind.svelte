<!--
  "Remind me on this phone": offered by the first run's preview when what the BrainDog keeps has due dates that ring
  (`preview.ts` `reminds`), and only where the host holds a key to ring this phone with (Web Push, `lib/ui/push.ts`).

  THE SAME RULES AS SETTINGS' OWN SWITCH (`PushToggle.svelte`), read from `push.ts`, which the tests hold: nothing at all
  without the host's key, one sentence where this browser cannot be told, and the press as the only thing that installs
  the service worker. A subscription is the person's, not the record's, so it can be made before the lists exist.

  ITS OWN PRESS, NOT PART OF "Make it mine". The browser asks its permission question only in answer to a press, and the
  accept runs for seconds of record calls before it could ask; asked there, the question would be refused unseen.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { dev } from '$app/environment';
  import { createClient } from '@braindog/client';
  import { BASE, apiBase } from '$lib/at.ts';
  import { firstRun } from '$lib/first-run.ts';
  import { hostKey, offerOf, turnOn, type Manager, type Offer, type Ports } from '$lib/ui/push.ts';
  import type { Call } from '$lib/ui/webhook-doors.ts';
  import Button from '$lib/ui/Button.svelte';

  let offer = $state<Offer>(null);
  let on = $state(false);
  let line = $state('');
  let busy = $state(false);

  async function manager(): Promise<Manager> {
    await navigator.serviceWorker.register(`${BASE}/service-worker.js`, { scope: `${BASE}/`, type: dev ? 'module' : 'classic' });
    return (await navigator.serviceWorker.ready).pushManager as unknown as Manager;
  }

  const ports = (): Ports => ({
    permission: () => Notification.requestPermission(),
    manager,
    call: createClient({ base: apiBase() }).call as unknown as Call,
  });

  onMount(() => {
    void hostKey(apiBase()).then((key) => {
      offer = offerOf(key, { worker: 'serviceWorker' in navigator, push: 'PushManager' in window, notify: 'Notification' in window });
    });
  });

  async function press() {
    if (busy || offer?.can !== true) return;
    busy = true;
    try {
      const said = await turnOn(ports(), offer.key);
      on = said.kind === 'on';
      line = said.kind === 'on' || said.kind === 'off' ? '' : 'line' in said ? said.line : said.fix;
    } finally {
      busy = false;
    }
  }
</script>

{#if offer?.can === true}
  <div class="remind">
    <p class="remind-why">{on ? firstRun.remindIsOn : firstRun.remindWhy}</p>
    {#if !on}
      <Button disabled={busy} onclick={() => void press()}>{firstRun.remindOn}</Button>
    {/if}
    <!-- Always in the document: a live region inserted with its first sentence is not reliably announced. -->
    <p class="remind-said" role="status">{line}</p>
  </div>
{:else if offer}
  <!-- A PHONE THAT COULD BE TOLD ONCE THE SITE IS ON ITS HOME SCREEN IS TOLD THAT STEP, in `push.ts`'s words. -->
  <p class="remind-why">{offer.line}</p>
{/if}

<style>
  .remind {
    display: grid;
    justify-items: start;
    gap: var(--sp-2);
  }

  .remind-why,
  .remind-said {
    color: var(--dim);
    font-size: var(--t-sm);
  }
</style>
