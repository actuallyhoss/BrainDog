<!--
  Clear the example rows setting up planted (`$lib/record/examples.ts`).

  ONE SENTENCE AND ONE BUTTON, on Home, for the owner of a live record that still holds an example nobody has touched. On a
  new record it is quiet; once rows of the owner's own sit beside the examples (after an import) it says they are in the
  way. Pressing asks once more with the count, because clearing deletes rows. On the sample, or for anyone but the owner,
  nothing is drawn.

  ITS ROOM IS KEPT (finish 3 Nov): it is drawn after its own read, and drawn then it pushed Today down. Its height is
  kept per record, page and width (`shape.ts`, 0 when it said nothing), and while the read is out a card of that height
  stands where it will be (`SkeletonCard`), or nothing where it said nothing last time. Home holds the same room while
  this code comes (`examplesRoom`).
-->
<script lang="ts" module>
  /** The name its room is kept under on its page (`shape.ts`). */
  export const EXAMPLES_CARD = 'clear-examples';
</script>

<script lang="ts">
  import { apiBase } from '../at.ts';
  import { onMount, untrack } from 'svelte';
  import SkeletonCard from './SkeletonCard.svelte';
  import { cardShape, keepCard, shapeKey } from './shape.ts';
  import { page } from '$app/state';
  import { invalidateAll } from '$app/navigation';
  import { createClient } from '@braindog/client';
  import { clearExamples, offerOf, readExamples, type Examples, type ExamplesClient } from '$lib/record/examples.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import Tile from '$lib/ui/Tile.svelte';
  import Button from '$lib/ui/Button.svelte';

  let client: ExamplesClient | null = null;
  let read = $state<Examples | null>(null);
  let asking = $state(false);
  let busy = $state(false);
  const offer = $derived(offerOf(read));
  /* THE ROOM IT TOOK LAST TIME HERE, held while its read is out. */
  const key = shapeKey();
  const kept = untrack(() => cardShape(key, EXAMPLES_CARD));
  let mine = $state(false);
  /* WHAT IT SAID IS KEPT AS ITS HEIGHT: nothing said is 0, so the next open holds no room. */
  $effect(() => {
    if (read !== null && !offer) keepCard(key, EXAMPLES_CARD, { h: 0 });
  });
  function measure(el: HTMLElement): () => void {
    const seen = new ResizeObserver(() => {
      const h = Math.round(el.offsetHeight);
      if (h > 0) keepCard(key, EXAMPLES_CARD, { h, kind: 'lines', rows: 1 });
    });
    seen.observe(el);
    return () => seen.disconnect();
  }

  onMount(() => {
    if (!page.data.live || !page.data.me?.owner) return;
    mine = true;
    client = createClient({ base: apiBase() }) as unknown as ExamplesClient;
    void readExamples(client).then((e) => (read = e));
  });

  async function clear() {
    if (!client || busy) return;
    busy = true;
    try {
      const out = await clearExamples(client);
      if (!out.ok) {
        toasts.push(out.fix, { intent: 'bad' });
        return;
      }
      toasts.push(out.said);
      read = await readExamples(client);
      asking = false;
      /* THE RAIL IS DRAWN FROM `boot`, WHICH IS KEPT FOR THE TAB, so `invalidateAll` alone re-ran
         the layout's load against the answer from before the clear, and asked the record nothing.
         Measured on a self-host set up through `/start` as New project guide, pressing this and
         watching every call: `clearExamples`, `examples`, `page`, `list`, `whatsNew`, and no
         `boot`. The rail still read `Guide · Say what it is and who it is for · Milestones 6 ·
         Choices 1 · Resources 1 · Steps 3` over a record holding none of it, and the entry named
         after a deleted example row was a live link to `/p/say-what-it-is-and-who-it-is-for`,
         which answers "There is no page called say-what-it-is-and-who-it-is-for." Only a reload
         put it right. `/start` calls this for the same reason. */
      (await import('$lib/record/boot-live.ts')).forget();
      await invalidateAll();
    } finally {
      busy = false;
    }
  }
</script>

{#if offer}
  <div class="examples-box" {@attach measure}><Tile class="section" data-surface="tile" title={offer.title}>
    <div class="section-body">
      <div class="examples" data-loud={offer.loud ? '' : undefined}>
        <p class="examples-said">{offer.body}</p>
        <div class="examples-do">
          {#if asking}
            <Button weight="primary" tone="bad" disabled={busy} onclick={clear}>{offer.confirm}</Button>
            <Button weight="bare" disabled={busy} onclick={() => (asking = false)}>{offer.keep}</Button>
          {:else}
            <Button weight={offer.loud ? 'primary' : 'quiet'} onclick={() => (asking = true)}>{offer.button}</Button>
          {/if}
        </div>
      </div>
    </div>
  </Tile></div>
{:else if mine && read === null && kept !== null && kept.h > 0}
  <div class="examples-room surface-card" style:block-size={`${kept.h}px`} aria-busy="true"><SkeletonCard fill kind="lines" rows={1} /></div>
{/if}

<style>
  .examples-room {
    box-sizing: border-box;
    padding: var(--tile-pad);
    overflow: clip;
  }

  .examples {
    display: grid;
    grid-template-columns: minmax(0, var(--measure)) auto;
    align-items: center;
    justify-content: start;
    gap: var(--sp-3) var(--sp-6);
  }

  .examples-said {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lh-body);
  }

  .examples[data-loud] .examples-said {
    color: var(--ink-2);
  }

  .examples-do {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  @media (max-width: 40rem) {
    .examples {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
