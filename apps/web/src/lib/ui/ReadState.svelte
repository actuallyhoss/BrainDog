<!--
  The four ways a read is not a screen yet, drawn the same way on every screen that reads.

  A SCREEN DRAWS `ready` AND HANDS THIS THE REST. `read()` in `lib/data/read.svelte.ts` says which state a read is in;
  this draws the other four through `Empty`'s compact form, so waiting, empty, refused and offline look and behave alike
  from one screen to the next, which is the whole reason there is one read.

  WAITING IS `Waiting`, NOT AN `Empty`. Loading holds the final geometry in bars after 300ms and says no visible word,
  and an `Empty` mounted while a read is out would claim `empty` for a screen that has not answered
  yet: the readiness count would then settle a screen whose question has no key as blank.

  OFFLINE SAYS THE UNREACHABLE SENTENCE WITH RETRY, and the technical reason goes under Details, never in the sentence: a person
  told a socket error has been told nothing they can act on, and the one thing they can do is try again.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';

  import Button from './Button.svelte';
  import Empty from './Empty.svelte';
  import Waiting from './Waiting.svelte';

  let {
    state,
    refusal = null,
    onretry,
  }: {
    state: 'waiting' | 'empty' | 'refused' | 'offline';
    /** The record's sentence for a refusal, or the technical reason for an offline read. */
    refusal?: string | null | undefined;
    /** Ask again. Without it the offline state offers no action, rather than a button that does nothing. */
    onretry?: (() => void) | undefined;
  } = $props();
</script>

{#snippet retry()}
  <Button weight="primary" onclick={() => onretry?.()}>{copy.readRetry}</Button>
{/snippet}

{#if state === 'waiting'}
  <Waiting rows={3} />
{:else if state === 'empty'}
  <Empty kind="no-data-yet" compact title={copy.readEmpty} />
{:else if state === 'refused'}
  <!-- THE RECORD'S OWN SENTENCE, when it gave one: it says what was wrong and what to do, which a general line cannot. -->
  <Empty kind="error" compact title={refusal ?? copy.readRefused} />
{:else}
  <div class="read-offline">
    <Empty kind="error" compact title={copy.readOffline} actions={onretry ? retry : undefined} />
    {#if refusal}
      <details class="read-details">
        <summary class="read-summary tap">{copy.readDetails}</summary>
        <p class="read-reason">{refusal}</p>
      </details>
    {/if}
  </div>
{/if}

<style>
  .read-offline {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  /* THE REASON IS QUIET AND WRAPS. It is there for whoever reports the fault, so it reads below the sentence in the
     secondary ink, and an address or a path inside it breaks rather than pushing the page sideways at 320. */
  .read-details {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .read-summary {
    inline-size: fit-content;
    cursor: pointer;
  }

  .read-reason {
    margin-block: var(--sp-1) 0;
    margin-inline: 0;
    max-inline-size: var(--measure);
    overflow-wrap: anywhere;
  }
</style>
