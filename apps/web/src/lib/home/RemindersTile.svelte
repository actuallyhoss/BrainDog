<!--
  Reminders on Today: the lines automations were told to put here ("remind me on Today"). A small tile that is not drawn
  at all when there are none, as no tile on Today says it is empty (DIRECTION §35).
-->
<script lang="ts">
  import Tile from '$lib/ui/Tile.svelte';
  import type { ReminderLine } from '$lib/record/today-live.ts';

  let { lines }: { lines: readonly ReminderLine[] } = $props();

  const words = { title: 'Reminders' };

  /* THE HOUR A LINE LANDED, on this browser's clock, since "9:00" is what tells a morning's line from yesterday's. */
  const hour = (iso: string): string => {
    const t = Date.parse(iso);
    return Number.isFinite(t) ? new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
  };
</script>

{#if lines.length > 0}
  <Tile class="t-reminders" icon="bell" title={words.title} count={lines.length}>
    <ul class="lines">
      {#each lines as line, i (i)}
        <li>
          <span class="when num">{hour(line.at)}</span>
          <span class="text" dir="auto">{line.text}</span>
        </li>
      {/each}
    </ul>
  </Tile>
{/if}

<style>
  .lines {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    gap: var(--sp-2);
    align-items: baseline;
    font-size: var(--fs-body);
    line-height: 20px;
    color: var(--ink);
  }

  .when {
    flex: none;
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  .text {
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }
</style>
