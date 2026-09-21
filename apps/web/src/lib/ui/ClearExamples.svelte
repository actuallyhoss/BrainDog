<!--
  Clear the example rows setting up planted (`$lib/record/examples.ts`).

  ONE SENTENCE AND ONE BUTTON, on Home, for the owner of a live record that still holds an example nobody has touched. On a
  new record it is quiet; once rows of the owner's own sit beside the examples (after an import) it says they are in the
  way. Pressing asks once more with the count, because clearing deletes rows. On the sample, or for anyone but the owner,
  nothing is drawn.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { invalidateAll } from '$app/navigation';
  import { createClient } from '@braindog/client';
  import { clearExamples, offerOf, readExamples, type Examples, type ExamplesClient } from '$lib/record/examples.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import Button from '$lib/ui/Button.svelte';

  let client: ExamplesClient | null = null;
  let read = $state<Examples | null>(null);
  let asking = $state(false);
  let busy = $state(false);
  const offer = $derived(offerOf(read));

  onMount(() => {
    if (!page.data.live || !page.data.me?.owner) return;
    client = createClient({ base: location.origin }) as unknown as ExamplesClient;
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
  <Section title={offer.title}>
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
  </Section>
{/if}

<style>
  .examples {
    display: grid;
    grid-template-columns: minmax(0, var(--measure)) auto;
    align-items: center;
    justify-content: start;
    gap: var(--sp-3) var(--sp-6);
  }

  .examples-said {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  .examples[data-loud] .examples-said {
    color: var(--ink2);
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
