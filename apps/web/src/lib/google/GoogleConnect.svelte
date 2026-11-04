<!--
  Connect Google, as one card: on the Gmail and Calendar plugin pages and in Settings, What comes in.

  ONE GOOGLE ACCOUNT A RECORD, READ ONLY. Not connected, it names what comes in (mail, calendar, contacts) and offers
  Connect Google, which goes to Google's own page and back here. Connected, it is the account and its state as a chip in
  the card's head, what the last sync brought as three figures, and Sync now and Disconnect. Only an owner sees the
  buttons; anybody else sees the state.

  EACH FACT ONCE (3 Nov, the owner: "Connected as" above a sentence that said the counts, and a status line under the
  buttons that said "connected" again, squeezed into a 100px column). The state is the head's chip; the counts are
  figures; what an action did is a toast, which goes away; only a failure stays, as a full-width line at the top of the
  card. The old Apps Script's stop steps are behind one disclosure, for the few who still run it.

  THE WAY BACK FROM GOOGLE (`?google=`) IS SAID ONCE AND TAKEN OFF THE ADDRESS, so a reload does not say it again.

  `onstatus` tells the page it sits on, so the Gmail page can put this in place of the script's paste steps.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { sinceWords } from 'braindog-render';
  import { at } from '$lib/at.ts';
  import { recordNow } from '$lib/record/boot-live.ts';
  import Tile from '$lib/ui/Tile.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Notice from '$lib/ui/Notice.svelte';
  import type { IconName } from '$lib/ui/icons.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { backLine, connectUrl, figuresOf, googleDisconnect, googleStatus, googleSyncNow, googleWords as w, type GoogleStatus } from './google.ts';

  let {
    place,
    onstatus,
  }: {
    /** Which page it sits on, so the words fit: a plugin's page names what that plugin gets. */
    place: 'gmail' | 'calendar' | 'settings';
    onstatus?: ((status: GoogleStatus | null) => void) | undefined;
  } = $props();

  let status = $state<GoogleStatus | null>(null);
  let read = $state(false);
  let busy = $state(false);
  let asking = $state(false);
  /** A failure that stays until the next press: Google refused, or a press did not go through. */
  let fault = $state<string | null>(null);

  $effect(() => {
    untrack(() => {
      const url = new URL(location.href);
      const back = backLine(url.searchParams.get('google'));
      if (back) {
        if (back.bad) fault = back.line;
        else toasts.push(back.line, { intent: 'good' });
        url.searchParams.delete('google');
        history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
      }
      void load();
    });
  });

  async function load() {
    status = await googleStatus();
    read = true;
    onstatus?.(status);
  }

  async function disconnect() {
    busy = true;
    asking = false;
    fault = null;
    const next = await googleDisconnect();
    busy = false;
    if (next) {
      status = next;
      toasts.push(w.disconnected, { intent: 'good' });
      onstatus?.(status);
    } else fault = w.failed;
  }

  async function syncNow() {
    busy = true;
    fault = null;
    const next = await googleSyncNow();
    busy = false;
    if (next) {
      status = next;
      toasts.push(w.syncing, { intent: 'good' });
    } else fault = w.failed;
  }

  const figures = $derived(status?.last ? figuresOf(status.last.said) : null);
  const synced = $derived(status?.last ? w.lastSync(sinceWords(status.last.at, recordNow())) : w.firstSync);
  /* WHAT WAITS FOR A PLUGIN THAT IS NOT IN, each with the way to it. */
  const missing = $derived(
    status?.connected && !status.broken
      ? [...(!status.mail ? [{ id: 'gmail', said: w.needsGmail }] : []), ...(!status.events ? [{ id: 'calendar', said: w.needsCalendar }] : [])]
      : [],
  );
  const brings: readonly { glyph: IconName; said: string }[] = [
    { glyph: 'mail', said: 'Gmail' },
    { glyph: 'calendar', said: 'Calendar' },
    { glyph: 'people', said: 'Contacts' },
  ];
</script>

{#if read && status}
  <Tile icon="plug" class="section google-card" data-surface="tile" title={status.connected ? w.title : w.connectTitle}>
    {#snippet actions()}
      {#if status?.connected}
        <span class="pill-badge" data-tone={status.broken ? 'bad' : 'good'}>{status.broken ? w.stopped : w.connected}</span>
      {/if}
    {/snippet}
    <div class="section-body google">
      {#if fault}
        <Notice tone="bad">{fault}</Notice>
      {/if}

      {#if status.connected}
        <!-- THE ACCOUNT AND WHEN IT LAST SYNCED, ONE LINE; then what that sync brought, as figures. -->
        <p class="account">
          <Icon name="mail" size="s" />
          <span class="who">
            <span class="address">{status.email || w.yourAccount}</span>
            {#if !status.broken}<span class="synced">{figures || !status.last ? synced : `${synced}: ${status.last.said}`}</span>{/if}
          </span>
        </p>
        {#if status.broken}
          <Notice tone="warn">{status.broken}</Notice>
        {:else if figures}
          <div class="figures" role="group" aria-label={synced}>
            {#each figures as f (f.label)}
              <p class="figure"><span class="figure-n num">{f.n}</span><span class="figure-l">{f.label}</span></p>
            {/each}
          </div>
        {/if}
        {#each missing as m (m.id)}
          <p class="wait">{m.said} <a class="tap" href={at(`/plugins/${m.id}?kind=pack`)}>{w.get}</a></p>
        {/each}

        {#if status.owner}
          {#if asking}
            <div class="ask" role="group" aria-label={w.disconnectAsk}>
              <p class="ask-said">{w.disconnectAsk}</p>
              <div class="row-actions">
                <Button size="sm" weight="primary" tone="bad" disabled={busy} onclick={() => void disconnect()}>{w.disconnect}</Button>
                <Button size="sm" weight="bare" disabled={busy} onclick={() => (asking = false)}>{w.keep}</Button>
              </div>
            </div>
          {:else}
            <div class="row-actions">
              {#if status.broken}
                <Button size="sm" weight="primary" disabled={busy} onclick={() => location.assign(connectUrl())}>{w.again}</Button>
              {:else}
                <Button size="sm" disabled={busy} onclick={() => void syncNow()}><Icon name="refresh" size="s" />{w.syncNow}</Button>
              {/if}
              <Button size="sm" weight="bare" disabled={busy} onclick={() => (asking = true)}>{w.disconnect}</Button>
            </div>
          {/if}
        {/if}

        {#if place === 'gmail' && !status.broken}
          <details class="how">
            <summary class="tap">{w.scriptAsk}</summary>
            <p>{w.scriptStop}</p>
          </details>
        {/if}
      {:else}
        <p class="lede">{place === 'settings' ? w.leadSettings : w.lead}</p>
        <ul class="brings" aria-label={w.bringsLabel}>
          {#each brings as b (b.said)}<li><Icon name={b.glyph} size="s" />{b.said}</li>{/each}
        </ul>
        {#if !status.on}
          <p class="wait">{w.notSetUp}</p>
        {:else if status.owner}
          <div class="row-actions">
            <Button weight="primary" disabled={busy} onclick={() => location.assign(connectUrl())}>{w.connect}</Button>
          </div>
        {:else}
          <p class="wait">{w.ownerOnly}</p>
        {/if}
      {/if}
    </div>
  </Tile>
{/if}

<style>
  .google {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    min-inline-size: 0;
  }

  .google > p,
  .how p {
    margin: 0;
  }

  /* THE ACCOUNT, ONE LINE: its glyph and its address, which may be long and breaks anywhere rather than past the card. */
  .account {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-2);
    min-inline-size: 0;
    color: var(--ink);
    font: var(--t-ui, 400 14px/20px var(--font-ui));
    font-weight: var(--fw-medium);
  }

  .account :global(.icon) {
    flex: none;
    margin-block-start: 2px;
    color: var(--ink-3);
  }

  .address {
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }

  /* WHAT THE LAST SYNC BROUGHT, AS FIGURES: each count over its word, and when it was, at the row's end. */
  .figures {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: var(--sp-3) var(--sp-6);
    min-inline-size: 0;
  }

  .figure {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
  }

  .figure-n {
    color: var(--ink);
    font-size: var(--fs-figure);
    font-weight: var(--fw-semi);
    line-height: var(--lead-figure);
    letter-spacing: var(--track-figure);
    font-variant-numeric: tabular-nums;
  }

  .figure-l,
  .synced,
  .wait,
  .lede {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  /* WHEN IT LAST SYNCED, AFTER THE ADDRESS, set apart by air and the quiet ink, and on its own line where the two do not
     fit: no separator glyph to lead a wrapped line. */
  .who {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 var(--sp-3);
    min-inline-size: 0;
  }

  .synced {
    font-weight: var(--fw-regular);
  }

  .lede {
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
    max-inline-size: 60ch;
    text-wrap: pretty;
  }

  .wait a {
    color: var(--link, var(--ink));
    font-weight: var(--fw-medium);
  }

  /* WHAT COMES IN, AS CHIPS: three things, each its glyph and its word. */
  .brings {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .brings li {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    block-size: 28px;
    padding-inline: var(--sp-3);
    border-radius: var(--r-pill);
    background: var(--soft-fill, var(--tile-2));
    color: var(--ink-2);
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
  }

  .brings li :global(.icon) {
    color: var(--ink-3);
  }

  .ask {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--sp-3);
    border-radius: var(--r-ctl);
    background: var(--tile-2);
  }

  .ask-said {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }

  .row-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  /* THE OLD SCRIPT, FOR THE FEW WHO RUN IT: one quiet disclosure at the card's foot. */
  .how {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .how summary {
    inline-size: fit-content;
    cursor: pointer;
    color: var(--ink-2);
    font-weight: var(--fw-medium);
  }

  .how p {
    margin-block-start: var(--sp-2);
    max-inline-size: 60ch;
  }
</style>
