<!--
  One page written for one kind of person, `/for/<who>`: what they would say, three things BrainDog does for them, each
  drawn from their example record, the link to the other page shown today, and the early access strip.

  THE UI PASS OF 20 OCTOBER took the drawn record window off these pages: it showed an older app (its tabs,
  a Page and Source switch) and drew the first row's chart twice. The home page's desk is the app as it is; each row
  here keeps its own drawing, one segment of the example's page (`copy/for.ts` names which), cut from the page's
  text by its span in the parse and drawn by the renderer a record uses, so no figure here is written twice.
-->
<script lang="ts">
  import Seo from '$lib/site/Seo.svelte';
  import { crumbsOf } from '$lib/site/seo.ts';
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

<Seo title={person.title} description={person.description} path={here} ld={[crumbsOf([{ name: 'BrainDog', path: '/' }, { name: person.tag, path: here }])]} />
<PageHead title={person.tag} lead={person.said}>
  <p class="sub">{person.sub}</p>
  <div class="actions">
    <Start />
  </div>
</PageHead>

<section class="wrap story">
  <!-- ── What it does for you, one card a thing ─────────────────────────── -->
  {#each person.rows as row (row.head)}
    <article class="card paper does">
      <div class="split">
        <div class="head">
          <h2>{row.head}</h2>
          <p class="say">{row.said}</p>
        </div>
        <div class="drawing">
          <Page src={fence(row.draw.page, row.draw.at)} layout={[{ at: 0, cols: 12 }]} now={DRAWN_ON} canvas />
        </div>
      </div>
    </article>
  {/each}

  <!-- ── The other page written for someone else: only its link, the words its name (site 2b) ── -->
  <nav class="others" aria-label={f.others}>
    <ul class="onwards">
      {#each others as c (c.id)}
        <li><a class="onward" href={w.moreFor[c.id].href}>{f.who[c.id].nav}<Icon name="arrow-right" size="s" /></a></li>
      {/each}
    </ul>
  </nav>
</section>

<EarlyStrip />

<style>
  /* ── The head: the answer under the question, and the two actions ──────── */

  .sub {
    max-inline-size: 34em;
    margin: 16px 0 0;
    color: var(--on-night-2);
    font-size: var(--t-say);
    line-height: 1.55;
    text-wrap: pretty;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-block-start: 32px;
  }

  /* ── The cards, one under another ────────────────────────────────────── */

  /* THE CARDS AT THE PAGE'S STEPS: the first step under the night head, a band step before the strip, 16 apart. */
  .story {
    display: grid;
    gap: 16px;
    padding-block: var(--first-pad) var(--band-pad);
  }

  /* ── What it does for you ────────────────────────────────────────────── */

  .split {
    display: grid;
    grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
    gap: 48px;
    align-items: center;
  }

  .head h2 {
    margin: 0;
  }

  /* The drawing sits on the paper tile, so its own raised surfaces (a rule's steps) take the page's ground, or they
     vanish into the tile. */
  .drawing {
    --tile-2: var(--page);
    min-inline-size: 0;
  }

  .drawing :global(.block) {
    margin-block-end: 0;
  }

  /* ── The pages written for someone else ──────────────────────────────── */

  /* THE OTHER PAGE, the site's one way on (`.onward`), in the ink: it was the only red link on the page. */
  .others {
    padding-block-start: var(--head-gap);
  }

  @media (max-width: 1060px) {
    .split {
      grid-template-columns: minmax(0, 1fr);
      gap: 32px;
    }
  }

  @media (max-width: 760px) {
    .actions :global(.btn) {
      flex: 1 1 auto;
    }
  }
</style>
