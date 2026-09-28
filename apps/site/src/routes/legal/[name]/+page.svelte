<!--
  One legal text: the Terms of Service, the Privacy Policy or the processors.

  UNTIL THE TEXT IS IN FORCE the page says one sentence, carries `noindex`, and nothing links to it:
  it exists so the address is fixed and a strict prerender passes. Once `LAUNCH.legal` is on and the
  file is in `apps/site/legal/`, it draws the owner's words as they are written there, a document in a
  page, so its headings sit under the page's own title and a `#` title in the file is not drawn twice.
-->
<script lang="ts">
  import { trust } from '$lib/copy/trust.ts';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const l = trust.legal;
  const text = $derived(l.texts[data.name]);
  const address = $derived(`https://brain.dog/legal/${data.name}`);
</script>

<svelte:head>
  <title>{text.title} · BrainDog</title>
  <meta name="description" content={text.description} />
  {#if data.text === null}
    <meta name="robots" content="noindex" />
  {:else}
    <link rel="canonical" href={address} />
    <meta property="og:url" content={address} />
    <meta property="og:title" content="{text.title} · BrainDog" />
    <meta property="og:description" content={text.description} />
  {/if}
</svelte:head>

<section class="band head" data-ground="sunk">
  <div class="in">
    <h1 class="title">{text.title}</h1>
  </div>
</section>

<section class="band" data-ground="page">
  <div class="in doc">
    {#if data.text === null}
      <p class="doc-p">{l.pending}</p>
    {:else}
      {#each data.text as block}
        {#if block.kind === 'h2'}
          <h2 class="doc-h2">{block.text}</h2>
        {:else if block.kind === 'h3'}
          <h3 class="doc-h3">{block.text}</h3>
        {:else if block.kind === 'ul'}
          <ul class="doc-ul">
            {#each block.items as item}
              <li>{item}</li>
            {/each}
          </ul>
        {:else}
          <p class="doc-p">{block.text}</p>
        {/if}
      {/each}
    {/if}
  </div>
</section>

<style>
  .band {
    padding-block: var(--sp-8);
  }

  .band + .band {
    border-block-start: 1px solid var(--line);
  }

  .head {
    padding-block: var(--sp-7) var(--sp-8);
  }

  .title {
    font-family: var(--font-display);
    font-size: clamp(2.375rem, 4.7vw, 4.25rem);
    font-weight: 600;
    line-height: 1.04;
    letter-spacing: -0.04em;
    text-wrap: balance;
  }

  /* A legal text is read line by line, so the whole of it keeps the 68ch measure. */
  .doc {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  .doc > * {
    max-inline-size: 68ch;
  }

  .doc-h2 {
    margin-block-start: var(--sp-5);
    font-size: var(--t-md);
    font-weight: 600;
    line-height: var(--lh-tight);
  }

  .doc-h3 {
    margin-block-start: var(--sp-3);
    font-size: var(--t-base);
    font-weight: 600;
  }

  .doc-p,
  .doc-ul {
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 1.6;
    overflow-wrap: anywhere;
    text-wrap: pretty;
  }

  .doc-ul {
    margin: 0;
    padding-inline-start: var(--sp-5);
  }

  @media (width < 640px) {
    .band {
      padding-block: var(--sp-7);
    }
  }
</style>
