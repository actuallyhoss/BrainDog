<!--
  Calendar's second way in, beside Connect Google: the calendar's private (ICS) link, kept in the keys under the name
  the add-on's setting says (`Calendar link` unless changed).

  BOTH WAYS ARE ON THE PAGE, AND NEITHER IS ASKED AT INSTALL (Calendar 2.1.1, `optional` on the setting): with Google
  connected the link is not needed, and this tile goes quiet and says so, so Connect Google stays the one primary.
  Without a link in the keys the hourly reader skips quietly. The button opens the keychain on that name: Add when it
  is not there, Replace when it is.
-->
<script lang="ts">
  import { at } from '$lib/at.ts';
  import Tile from '$lib/ui/Tile.svelte';
  import Button from '$lib/ui/Button.svelte';

  let { label = 'Calendar link', google = false }: { label?: string; google?: boolean } = $props();
  const name = $derived(label.trim() || 'Calendar link');
</script>

<Tile icon="calendar" class="section" data-surface="tile" title="Or paste your calendar's private link">
  <div class="section-body link">
    {#if google}
      <p class="hint">Not needed while Google is connected. If a link is in your keys too, both keep working and no event is written twice.</p>
    {:else}
      <p class="hint">For Outlook, or Google without connecting it. BrainDog reads the link every hour and never writes to the calendar.</p>
    {/if}
    <ol class="steps">
      <li>Google Calendar: Settings, your calendar, Secret address in iCal format. Outlook: Settings, Shared calendars, Publish a calendar, ICS.</li>
      <li>Copy that link and add it to your keys as <strong>{name}</strong>.</li>
    </ol>
    <div class="row-actions">
      <Button size="sm" weight={google ? 'bare' : 'quiet'} href={at(`/keychain?reconnect=${encodeURIComponent(name)}`)}>Add the link to your keys</Button>
    </div>
  </div>
</Tile>

<style>
  .link {
    display: grid;
    gap: var(--sp-3);
  }
  .steps {
    margin: 0;
    padding-inline-start: var(--sp-5);
    display: grid;
    gap: var(--sp-2);
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }
  .hint {
    margin: 0;
  }
  .row-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
</style>
