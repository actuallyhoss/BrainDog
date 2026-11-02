<!--
  One legal text: the Terms of Service, the Privacy Policy or the processors.

  UNTIL THE TEXT IS IN FORCE the page says one sentence, carries `noindex`, and nothing links to it:
  it exists so the address is fixed and a strict prerender passes. Once `LAUNCH.legal` is on and the
  file is in `apps/site/legal/`, it draws the text as it is written there, a document in a
  page, so its headings sit under the page's own title and a `#` title in the file is not drawn twice.

  THE HEAD, THEN ONE SHEET (the redo of 2 November): the text's name and its one line in `PageHead`, then the words on
  one of the app's tiles at a 68ch reading measure, its sections headed in Lexend like every title on the site. Only the
  layout changed; the words are the owner's, untouched.

  A CONTENTS LIST AT ITS TOP (plan F26): the Terms run to ten screens at 1512 and sixteen on a phone, so each section is
  a link from the top, two columns on a desk, and a section's heading is a step smaller on a phone so it keeps to one or
  two lines.
-->
<script lang="ts">
  import Seo from '$lib/site/Seo.svelte';
  import { trust } from '$lib/copy/trust.ts';
  import PageHead from '$lib/site/PageHead.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  const l = trust.legal;
  const text = $derived(l.texts[data.name]);
  const address = $derived(`https://brain.dog/legal/${data.name}`);

  /** A section's anchor, from its heading: "Who can use BrainDog" is `who-can-use-braindog`, numbered where two match. */
  const sections = $derived.by(() => {
    const seen = new Map<string, number>();
    const out: { at: number; id: string; text: string }[] = [];
    (data.text ?? []).forEach((block, at) => {
      if (block.kind !== 'h2') return;
      const base = block.text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'part';
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      out.push({ at, id: n === 1 ? base : `${base}-${n}`, text: block.text });
    });
    return out;
  });
  const idAt = (at: number): string | undefined => sections.find((s) => s.at === at)?.id;
</script>

<Seo title="{text.title} · BrainDog" description={text.description} path="/legal/{data.name}" noindex={data.text === null} />
<PageHead title={text.title} lead={text.description} />

<section class="wrap sheet-band">
  <article class="sheet" aria-label={text.title}>
    {#if data.text === null}
      <p class="doc-p">{l.pending}</p>
    {:else}
      {#if sections.length > 2}
        <nav class="toc" aria-labelledby="toc-title">
          <h2 class="toc-title" id="toc-title">{l.contents}</h2>
          <ol>
            {#each sections as s (s.id)}<li><a href="#{s.id}">{s.text}</a></li>{/each}
          </ol>
        </nav>
      {/if}
      {#each data.text as block, at}
        {#if block.kind === 'h2'}
          <h2 class="doc-h2" id={idAt(at)}>{block.text}</h2>
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
    padding-block: clamp(32px, 2vw + 24px, 48px) clamp(48px, 4vw + 32px, 96px);
  }

  /* ONE SHEET: a legal text is read line by line, so the whole of it keeps the 68ch measure at 17/28 on one flat paper
     tile, radius 16, no edge and no shadow; its sections headed in Lexend at the title step (28), their parts at 19. */
  .sheet {
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-inline-size: calc(68ch + 2 * clamp(20px, 3vw + 8px, 56px));
    padding: clamp(24px, 3vw + 8px, 56px);
    background: var(--tile);
    border-radius: var(--r-tile);
    color: var(--ink);
  }

  .sheet > * {
    max-inline-size: 68ch;
  }

  .doc-h2 {
    margin: 24px 0 0;
    color: var(--ink);
    font-size: var(--fs-page);
    line-height: 1.2;
    letter-spacing: -0.035em;
  }

  .doc-h2:first-child {
    margin-block-start: 0;
  }

  .doc-h2 {
    scroll-margin-block-start: 24px;
    text-wrap: balance;
  }

  /* THE CONTENTS: a quiet heading and the sections as plain links, two columns from 760, a hairline under them. */
  .toc {
    padding-block-end: 20px;
    border-block-end: 1px solid var(--rule);
  }

  .toc-title {
    margin: 0 0 10px;
    color: var(--ink-3);
    font-family: var(--font-ui);
    font-size: var(--t-site-15);
    font-weight: 600;
    letter-spacing: 0;
  }

  .toc ol {
    margin: 0;
    padding-inline-start: 24px;
    columns: 2;
    column-gap: 32px;
    color: var(--ink-3);
    font-size: var(--t-site-15);
    line-height: 1.5;
  }

  .toc li {
    break-inside: avoid;
    padding-block: 3px;
  }

  .toc a {
    color: var(--ink);
    text-decoration: none;
  }

  .toc a:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  @media (pointer: coarse) {
    .toc li {
      padding-block: 0;
    }

    .toc a {
      display: inline-block;
      padding-block: 11px;
    }
  }

  @media (width < 760px) {
    .toc ol {
      columns: 1;
    }
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
    color: var(--ink-2);
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
    /* A STEP SMALLER ON A PHONE, so a section's name keeps to one or two lines. */
    .doc-h2 {
      font-size: var(--t-site-22);
      line-height: 1.2;
    }
  }
</style>
