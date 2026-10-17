<!--
  One legal text: the Terms of Service, the Privacy Policy or the processors.

  UNTIL THE TEXT IS IN FORCE the page says one sentence, carries `noindex`, and nothing links to it:
  it exists so the address is fixed and a strict prerender passes. Once `LAUNCH.legal` is on and the
  file is in `apps/site/legal/`, it draws the owner's words as they are written there, a document in a
  page, so its headings sit under the page's own title and a `#` title in the file is not drawn twice.

  THE NIGHT HEAD, THEN ONE SHEET (DIRECTION §47, Look B): the text's name and its one line in `PageHead`, then the
  words on one flat paper tile at a 68ch reading measure, its sections headed in Lexend like every title on the site.
-->
<script lang="ts">
  import { trust } from '$lib/copy/trust.ts';
  import PageHead from '$lib/site/PageHead.svelte';
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

<PageHead title={text.title} lead={text.description} />

<section class="wrap sheet-band">
  <article class="sheet" aria-label={text.title}>
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
</section>

<style>
  .sheet-band {
    padding-block: 56px 96px;
  }

  /* ONE SHEET: a legal text is read line by line, so the whole of it keeps the 68ch measure at 17/28 on one flat paper
     tile, radius 16, no edge and no shadow; its sections headed in Lexend at the title step (28), their parts at 19. */
  .sheet {
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-inline-size: calc(68ch + 2 * clamp(20px, 3vw + 8px, 56px));
    padding: clamp(24px, 3vw + 8px, 56px);
    background: var(--paper);
    border-radius: 16px;
    color: var(--ink);
  }

  .sheet > * {
    max-inline-size: 68ch;
  }

  .doc-h2 {
    margin: 24px 0 0;
    color: var(--ink);
    font-size: var(--t-title);
    line-height: 1.2;
    letter-spacing: -0.035em;
  }

  .doc-h2:first-child {
    margin-block-start: 0;
  }

  .doc-h3 {
    margin: 8px 0 0;
    color: var(--ink);
    font-size: var(--t-site-19);
    line-height: 1.3;
    letter-spacing: -0.03em;
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
    padding-inline-start: 24px;
  }

  .doc-ul li + li {
    margin-block-start: 6px;
  }

  @media (width < 640px) {
    .sheet-band {
      padding-block: 24px 64px;
    }
  }
</style>
