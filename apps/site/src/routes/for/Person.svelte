<!--
  One page written for one kind of person, `/for/<who>`: what they would say, three things BrainDog does for them, each
  one of the app's tiles with its drawing from their example record on the board beside its words (the redo of
  2 November), the link to the other page shown today, and the early access strip.

  THE UI PASS OF 20 OCTOBER took the drawn record window off these pages: it showed an older app (its tabs,
  a Page and Source switch) and drew the first row's chart twice. The home page's desk is the app as it is; each row
  here keeps its own drawing, one segment of the example's page (`copy/for.ts` names which), cut from the page's
  text by its span in the parse and drawn by the renderer a record uses, so no figure here is written twice.
-->
<script lang="ts">
  import Seo from '$lib/site/Seo.svelte';
  import { parse } from 'braindog-render';
  import Icon from '$lib/Icon.svelte';
  import Page from '$lib/app/Page.svelte';
  import { cases } from '$lib/copy/cases.ts';
  import { forPages } from '$lib/copy/for.ts';
  import { DRAWN_ON, EXAMPLES } from '$lib/examples/index.ts';
  import type { Example } from '$lib/examples/types.ts';
  import { FOR_SHOWN } from '$lib/launch.ts';
  import EarlyStrip from '$lib/site/EarlyStrip.svelte';
  import PageHead from '$lib/site/PageHead.svelte';
  import Start from '$lib/site/Start.svelte';

  let { id }: { id: Example['id'] } = $props();

  const f = forPages.person;
  const w = cases.drawn;
  const person = $derived(f.who[id]);
  const example = $derived(EXAMPLES.find((c) => c.id === id));
  const here = $derived(w.moreFor[id].href);
  /* Only the pages a visitor can reach: the others are held, and a link to one would land on the 404. */
  const others = $derived(EXAMPLES.filter((c) => c.id !== id && FOR_SHOWN.includes(w.moreFor[c.id].href)));

  /**
   * ONE SEGMENT OF ONE OF THE EXAMPLE'S PAGES, as its author wrote it: the text between the segment's `start` and
   * `end` in the parse, which `Page.svelte` then draws as a page of one.
   */
  function fence(pageId: string, at: number): string {
    const src = example?.pages.find((p) => p.id === pageId)?.src ?? '';
    const seg = parse(src, { page: true })[at];
    return seg ? src.slice(seg.start, seg.end) : '';
  }
</script>

<Seo title={person.title} description={person.description} path={here} />
<PageHead title={person.tag} lead={person.said}>
  <p class="sub">{person.sub}</p>
  <div class="actions">
    <Start size="lg" />
  </div>
</PageHead>

<section class="section" aria-label={person.tag}>
  <div class="wrap">
    <div class="tiles">
      <!-- ── What it does for you, one tile a thing ─────────────────────── -->
      {#each person.rows as row (row.head)}
        <article class="tile lead does reveal">
          <div class="words">
            <h2>{row.head}</h2>
            <p class="tile-say">{row.said}</p>
          </div>
          <div class="drawing">
            <Page src={fence(row.draw.page, row.draw.at)} layout={[{ at: 0, cols: 12 }]} now={DRAWN_ON} canvas />
          </div>
        </article>
      {/each}
    </div>

    <!-- ── The other page written for someone else: only its link, the words its name (site 2b) ── -->
    {#if others.length}
      <nav class="others" aria-label={f.others}>
        <ul>
          {#each others as c (c.id)}
            <li><a class="onward" href={w.moreFor[c.id].href}>{f.who[c.id].nav}<Icon name="arrow-right" size="s" /></a></li>
          {/each}
        </ul>
      </nav>
    {/if}
  </div>
</section>

<EarlyStrip />

<style>
  /* ── The head: the answer under the question, and the start button ──── */

  .sub {
    max-inline-size: 40rem;
    margin: 0;
    color: var(--ink-2);
    font-size: var(--t-site-16);
    line-height: 1.6;
    text-wrap: pretty;
  }

  .actions {
    margin-block-start: var(--sp-3);
  }

  /* ── What it does for you: the words, and the record's own page drawn on the board ── */

  .does {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-5);
  }

  .words {
    display: grid;
    align-content: center;
    gap: var(--sp-3);
  }

  .words h2 {
    color: var(--ink);
    font-size: clamp(22px, 0.6vw + 19px, 28px);
    line-height: 1.15;
    letter-spacing: -0.02em;
  }

  /* THE DRAWING SITS ON THE BOARD, as a page's blocks do in the app, in a well of the tile. */
  .drawing {
    min-inline-size: 0;
    padding: var(--sp-4);
    border-radius: var(--r-pop);
    background: var(--board);
  }

  .drawing :global(.block) {
    margin-block-end: 0;
  }

  @media (width >= 1060px) {
    .does {
      grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
      gap: var(--sp-7);
      align-items: center;
    }
  }

  /* ── The pages written for someone else ──────────────────────────────── */

  .others {
    padding-block-start: var(--sp-4);
  }

  .others ul {
    display: flex;
    flex-wrap: wrap;
    gap: 0 var(--sp-6);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  @media (max-width: 640px) {
    .actions,
    .actions :global(.btn) {
      inline-size: 100%;
    }
  }
</style>
