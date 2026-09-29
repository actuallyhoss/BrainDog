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

<section class="band" aria-labelledby="text-title">
  <div class="in">
    <div class="tiles">
      <article class="tile lead doc">
        <h1 class="h2" id="text-title">{text.title}</h1>
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
      </article>
    </div>
  </div>
</section>

<style>
  /* ONE READING TILE: a legal text is read line by line, so the whole of it keeps the 68ch measure at 17/28, its
     sections headed at the title step and their parts at the group step. */
  .doc {
    gap: var(--sp-4);
  }

  .doc > * {
    max-inline-size: 68ch;
  }

  .doc-h2 {
    margin: var(--sp-5) 0 0;
    color: var(--ink);
    font-size: var(--t-title);
    font-weight: 600;
    line-height: 1.214;
    letter-spacing: -0.02em;
  }

  .doc-h3 {
    margin: var(--sp-2) 0 0;
    color: var(--ink);
    font-size: var(--t-group);
    font-weight: 600;
    line-height: 24px;
  }

  .doc-p,
  .doc-ul {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-site-body);
    line-height: var(--lh-site-body);
    overflow-wrap: anywhere;
    text-wrap: pretty;
  }

  .doc-ul {
    padding-inline-start: var(--sp-5);
  }
</style>
