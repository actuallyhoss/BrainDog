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
