<!--
  The record's room for attached files, on `/usage`: one small tile, a ring of how much is used against what the plan keeps
  and the record's own sentence beside it ("Files take 120 MB of 1 GB (12%)."). Amber from 80%, red when full, as every meter here.

  ITS OWN READ, AND NOTHING WHEN IT FAILS: the page's own read above already says when the record cannot be reached, and a
  build with no attachments has no room to show.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { apiBase } from '$lib/at.ts';
  import Tile from '$lib/ui/Tile.svelte';
  import Ring from '$lib/viz/Ring.svelte';
  import { bytes } from 'braindog-render';
  import { readRoom, type Room } from './attached.ts';

  let room = $state<Room | null>(null);
  onMount(() => {
    void readRoom(apiBase()).then((r) => (room = r));
  });

  /* THE RING SAYS THE SHARE: at 72 "182 MB" does not sit inside it, and the sentence says the bytes. Rounded as the record's sentence rounds it, so the two agree. */
  const share = (used: number, most: number): string => `${Math.min(100, Math.round((used / most) * 100))}%`;
  const tone = (used: number, most: number): 'ink' | 'warn' | 'danger' => (used >= most ? 'danger' : used >= most * 0.8 ? 'warn' : 'ink');
</script>

{#if room}
  <Tile class="section" data-surface="tile" icon="link" title="Attached files">
    <div class="room">
      <Ring value={room.used} max={room.most} tone={tone(room.used, room.most)} size={72} format={() => share(room?.used ?? 0, room?.most ?? 1)} summary={room.said} />
      <p class="room-line">{room.said || `${bytes(room.used)} of ${bytes(room.most)}`}</p>
    </div>
  </Tile>
{/if}

<style>
  .room {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
  }
  .room :global(.viz-ring) {
    flex: 0 0 72px;
  }
  .room-line {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta, 18px);
    max-inline-size: 44ch;
  }
</style>
