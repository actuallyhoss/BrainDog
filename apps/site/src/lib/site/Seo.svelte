<!--
  A page's head for search and sharing, in one place: the title, the description, the canonical address, the Open
  Graph and Twitter cards with the page's own picture (its alt is the words the card shows), and its structured data. `seo.ts` says what each part is.

  `path` is the page's address on brain.dog, with no trailing slash ("/" for home). `noindex` keeps a page out of search
  and drops its canonical, as the 404 and an unwritten legal text want.
-->
<script lang="ts">
  import { ORIGIN, cardAlt, cardOf, ldOf } from './seo.ts';

  let {
    title,
    description,
    path,
    ld = [],
    noindex = false,
    type = 'website',
  }: { title: string; description: string; path: string; ld?: readonly object[]; noindex?: boolean; type?: string } =
    $props();

  const url = $derived(`${ORIGIN}${path}`);
  const card = $derived(cardOf(path));
  const alt = $derived(cardAlt(path));
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
  {#if noindex}
    <meta name="robots" content="noindex" />
  {:else}
    <link rel="canonical" href={url} />
  {/if}
  <meta property="og:type" content={type} />
  <meta property="og:url" content={url} />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:image" content={card} />
  <meta property="og:image:type" content="image/png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content={alt} />
  <meta name="twitter:title" content={title} />
  <meta name="twitter:description" content={description} />
  <meta name="twitter:image" content={card} />
  <meta name="twitter:image:alt" content={alt} />
  {#if ld.length > 0}{@html ldOf(ld)}{/if}
</svelte:head>
