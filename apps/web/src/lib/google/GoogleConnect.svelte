<!--
  Connect Google, as one tile: on the Gmail and Calendar add-on pages and in Settings, What comes in.

  ONE GOOGLE ACCOUNT A RECORD, READ ONLY. Not connected, it says what is read and offers Connect Google, which goes to
  Google's own page and back here. Connected, it says the address and the last sync, with Sync now and Disconnect, which
  revokes the access at Google and forgets it here. Only an owner sees the buttons; anybody else sees the line.

  `onstatus` tells the page it sits on, so the Gmail page can put this in place of the script's paste steps.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { sinceWords } from 'braindog-render';
  import { recordNow } from '$lib/record/boot-live.ts';
  import Tile from '$lib/ui/Tile.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { backLine, connectUrl, googleDisconnect, googleStatus, googleSyncNow, type GoogleStatus } from './google.ts';

  let {
    place,
    onstatus,
  }: {
    /** Which page it sits on, so the words fit: an add-on's page names what that add-on gets. */
    place: 'gmail' | 'calendar' | 'settings';
    onstatus?: ((status: GoogleStatus | null) => void) | undefined;
  } = $props();

  let status = $state<GoogleStatus | null>(null);
  let read = $state(false);
  let busy = $state(false);
  let asking = $state(false);
  let said = $state<{ line: string; bad: boolean } | null>(null);

  $effect(() => {
    untrack(() => {
      said = backLine(new URLSearchParams(location.search).get('google'));
      void load();
    });
  });

  async function load() {
    status = await googleStatus();
    read = true;
    onstatus?.(status);
  }

  async function disconnect() {
    if (!asking) {
      asking = true;
      return;
    }
    busy = true;
    asking = false;
    const next = await googleDisconnect();
    busy = false;
    if (next) {
      status = next;
      said = { line: 'Google is disconnected. BrainDog can no longer read it, and what came in stays.', bad: false };
      onstatus?.(status);
    } else said = { line: 'That did not go through. Try again.', bad: true };
  }

  async function syncNow() {
    busy = true;
    const next = await googleSyncNow();
    busy = false;
    if (next) {
      status = next;
      said = { line: 'Syncing now. New mail, events and contacts arrive within a minute.', bad: false };
    } else said = { line: 'That did not go through. Try again.', bad: true };
  }

  const reads = $derived(
    place === 'gmail'
      ? 'Connect Google and BrainDog reads your Gmail every 15 minutes, with your calendar and contacts too. Nothing to paste, and nothing is ever sent, changed or deleted in Google.'
      : place === 'calendar'
        ? 'Connect Google and BrainDog reads your calendar every 15 minutes, invitations and your answers included, with your Gmail and contacts too. Nothing is ever changed in Google.'
        : 'One Google account, read only: Gmail into the Gmail add-on, Calendar with invitations into Events, and contacts to fill in People, every 15 minutes. A contact is only added when you write to each other, meet, or they are already in BrainDog. Nothing is ever sent, changed or deleted in Google.',
  );
  const last = $derived(status?.last ? `Last sync ${sinceWords(status.last.at, recordNow())}: ${status.last.said}.` : 'The first sync runs within a few minutes.');
  const missing = $derived(
    status?.connected
      ? [!status.mail ? 'Install the Gmail add-on to bring mail in.' : '', !status.events ? 'Install the Calendar add-on to bring events in.' : ''].filter(Boolean).join(' ')
      : '',
  );
</script>

{#if read && status}
  <Tile icon="plug" class="section" data-surface="tile" title={status.connected ? 'Google' : 'Connect Google'}>
    <div class="section-body google">
      {#if status.connected}
        <p class="who"><span class="dot" data-tone={status.broken ? 'bad' : 'good'} aria-hidden="true"></span>{status.broken ? 'Stopped' : 'Connected'} as <strong>{status.email || 'your Google account'}</strong></p>
        {#if status.broken}
          <p class="line" data-tone="bad">{status.broken}</p>
        {:else}
          <p class="hint">{last}</p>
        {/if}
        {#if place === 'gmail'}
          <p class="hint">Your Gmail comes in through Google now, so the script in your Google account is not needed. You can stop it: run stop in its project at script.google.com, or delete the project.</p>
        {:else if place === 'calendar'}
          <p class="hint">Events come in through Google now, so the ICS link is not needed. If it is still in your keys both keep working, and an event is never written twice.</p>
        {/if}
        {#if missing}<p class="hint">{missing}</p>{/if}
        {#if status.owner}
          {#if asking}
            <p class="line">Disconnect Google? BrainDog stops reading it and Google forgets the access. What already came in stays.</p>
            <div class="row-actions">
              <Button weight="primary" tone="bad" disabled={busy} onclick={() => void disconnect()}>Disconnect</Button>
              <Button weight="bare" disabled={busy} onclick={() => (asking = false)}>Keep it</Button>
            </div>
          {:else}
            <div class="row-actions">
              {#if status.broken}
                <Button weight="primary" disabled={busy} onclick={() => location.assign(connectUrl())}>Connect Google again</Button>
              {:else}
                <Button size="sm" disabled={busy} onclick={() => void syncNow()}>Sync now</Button>
              {/if}
              <Button size="sm" weight="bare" disabled={busy} onclick={() => void disconnect()}>Disconnect</Button>
            </div>
          {/if}
        {/if}
      {:else}
        <p class="hint">{reads}</p>
        {#if !status.on}
          <p class="hint">Connect Google is not set up on this BrainDog yet.</p>
        {:else if status.owner}
          <div class="row-actions">
            <Button weight="primary" disabled={busy} onclick={() => location.assign(connectUrl())}>Connect Google</Button>
          </div>
        {:else}
          <p class="hint">The owner of this BrainDog can connect it.</p>
        {/if}
      {/if}
      {#if said}
        <p class="line" role="status" data-tone={said.bad ? 'bad' : undefined}>{#if said.bad}<span class="glyph" aria-hidden="true"><Icon name="alert" /></span>{/if}{said.line}</p>
      {/if}
    </div>
  </Tile>
{/if}

<style>
  .google {
    display: grid;
    gap: var(--sp-3);
  }
  .who,
  .hint,
  .line {
    margin: 0;
  }
  .who {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    color: var(--ink);
    font-size: var(--fs-body);
    overflow-wrap: anywhere;
  }
  .who strong {
    font-weight: var(--fw-semi);
  }
  .hint {
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }
  .line {
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }
  .line[data-tone='bad'] {
    color: var(--red);
  }
  .glyph {
    display: inline-flex;
    margin-inline-end: var(--sp-1);
    vertical-align: -2px;
  }
  .dot {
    inline-size: 6px;
    block-size: 6px;
    border-radius: var(--r-round);
    background: var(--good);
    flex: none;
  }
  .dot[data-tone='bad'] {
    background: var(--red);
  }
  .row-actions {
    display: flex;
    gap: var(--sp-2);
    flex-wrap: wrap;
  }
</style>
