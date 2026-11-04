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
  import { BASE, apiBase } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { hostKey, offerOf, startOf, turnOff, turnOn, type Offer, type Said } from '$lib/ui/push.ts';
  import { pushCan, pushPorts as ports } from '$lib/ui/push-ports.ts';
  import Tile from '$lib/ui/Tile.svelte';
  import Button from '$lib/ui/Button.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';

  /* THE HOST `boot` NAMED, when it named one. Only the Worker serves the key, so a self-host is not asked: the GET was a
     404 in the console of every self-host that opened Notifications. Absent is a host older than the field, asked. */
  /* `row` (finish 3 Nov): one row of a card that groups others (Settings > Notifications): the glyph, "Notifications on
     this device", whether it is told, and Turn on or off at the row's end; without it, the tile it always was. */
  let {
    host,
    onchange,
    row = false,
  }: { host?: 'cloud' | 'self-host' | undefined; onchange?: ((on: boolean) => void) | undefined; row?: boolean | undefined } = $props();

  let offer = $state<Offer>(null);
  let on = $state(false);
  let line = $state('');
  let bad = $state(false);
  let busy = $state(false);

  /* EVERY ARM BUT `on` AND `off` IS ONE SENTENCE: the browser's, which `push.ts` words, or the record's own `fix`. */
  const lineOf = (s: Said): string => (s.kind === 'on' || s.kind === 'off' ? '' : 'line' in s ? s.line : s.fix);

  /* THE WORKER AND THE SUBSCRIPTION ARE `push-ports.ts`'s, shared with the phone's one ask (`lib/phone/PhoneHints.svelte`). */

  /* `hostKey` AND `startOf` NEVER REJECT, which is why nothing below catches: each turns every refusal into a value. */
  async function begin() {
    if (host === 'self-host') return;
    const made = offerOf(await hostKey(apiBase()), pushCan());
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

{#if offer && row}
  <div class="push-row">
    <span class="push-icon"><IconWell name="phone" /></span>
    <span class="push-words">
      <span class="push-title">{copy.pushTitle}</span>
      <span class="push-line">{!offer.can ? offer.line : on ? copy.pushIsOn : copy.pushIsOff}</span>
    </span>
    {#if offer.can}
      <span class="push-act">
        <Button weight={on ? 'quiet' : 'primary'} disabled={busy} onclick={() => void press()}>{busy ? copy.pushAsking : on ? copy.pushTurnOff : copy.pushTurnOn}</Button>
      </span>
    {/if}
  </div>
  {#if offer.can}<p class="said" role="status" data-intent={bad ? 'bad' : undefined}>{line}</p>{/if}
{:else if offer}
  <Tile class="section" data-surface="tile" title={copy.pushTitle}>
    <div class="section-body">
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
    </div>
  </Tile>
{/if}

<style>
  /* THE SETTINGS PAGE'S OWN RULES, REPEATED, as `WebhookDoors.svelte` repeats them: its styles are scoped to it and do
     not reach inside a component, and this row has to read as part of the same screen. */
  .hint {
    margin: 0 0 var(--sp-3);
    max-inline-size: var(--measure);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lh-body);
  }

  .said {
    margin: 0;
    color: var(--tone, var(--ink-2));
    font-size: var(--fs-meta);
  }

  /* AS A ROW OF A GROUPED CARD, `StateRow`'s anatomy (Settings). */
  .push-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    column-gap: var(--sp-3);
    min-block-size: var(--row-h-2);
    padding-block: var(--sp-2);
  }

  .push-words {
    display: grid;
    gap: 2px;
    min-inline-size: 0;
  }

  .push-title {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: calc(20px * var(--type, 1));
  }

  .push-line {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .said:empty {
    display: none;
  }

  @media (width < 520px) {
    .push-row {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .push-act {
      grid-column: 2;
      margin-block-start: var(--sp-2);
    }
  }

  .row-actions {
    flex-wrap: wrap;
    display: flex;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
  }
</style>
