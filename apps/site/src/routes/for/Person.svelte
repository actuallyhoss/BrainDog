<!--
  One page written for one kind of person, `/for/<who>`: what they would say, their example record drawn large
  enough to use, three things it does for them, and the close (LAUNCH 103, job 7; DIRECTION §47).

  THE LOOK IS THE SITE DESIGN'S. The page opens on the night ground (`PageHead`): the page's name, the person's own
  question under it, the sentence that answers it, and "Start free" (`Start`) beside the quiet way to the pricing.
  Then the record itself in one wide paper card, then one card per thing it does for them, each carrying its drawing,
  the other pages written for someone else, and the close (`Close`).

  THE RECORD IS AN EXAMPLE, DRAWN AS A RECORD IS. The pages drawn here are `lib/examples/<id>.ts`, dialect text
  drawn through `Page.svelte` by the renderer a record uses. Each card's drawing is one segment of one of those
  pages (`copy/for.ts` names which), cut from the page's text by its span in the parse, so no figure on this page is
  written twice.

  NOTHING SCROLLS INSIDE THE RECORD. The drawn record is the page, so a page takes the height it needs. A row of the
  record's pages sits over it at every width.

  WITH SCRIPTING OFF THE RECORD SHOWS ITS HOME, drawn. The row of pages does nothing without a script, so the
  `<noscript>` rule below takes it away rather than leave controls that cannot act.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { parse } from 'braindog-render';
  import Icon from '$lib/Icon.svelte';
  import { isIconName } from '$lib/icons.ts';
  import Page from '$lib/app/Page.svelte';
  import { questionsIn } from '$lib/app/page.ts';
  import { cases } from '$lib/copy/cases.ts';
  import { forPages } from '$lib/copy/for.ts';
  import { DRAWN_ON, EXAMPLES } from '$lib/examples/index.ts';
  import type { Example, ExamplePage } from '$lib/examples/types.ts';
  import { plan } from '$lib/plans.ts';
  import Close from '$lib/site/Close.svelte';
  import PageHead from '$lib/site/PageHead.svelte';
  import Start from '$lib/site/Start.svelte';

  let { id }: { id: Example['id'] } = $props();

  const f = forPages.person;
  const w = cases.drawn;
  const person = $derived(f.who[id]);
  const example = $derived(EXAMPLES.find((c) => c.id === id));
  const here = $derived(w.moreFor[id].href);
  const others = $derived(EXAMPLES.filter((c) => c.id !== id));
  const cloud = plan('cloud');

  /** The page on show, by id. Absent, the record's Home, which is its first page. */
  let shown = $state<string | null>(null);
  /** The questions answered here, so the count on Needs you and the Home's queue both follow an answer. */
  let answered = $state<string[]>([]);
  let heading: HTMLElement | null = $state(null);

  const page = $derived<ExamplePage | undefined>(example?.pages.find((p) => p.id === shown) ?? example?.pages[0]);
  const asked = $derived(questionsIn(example?.pages.find((p) => p.id === 'needs')?.src ?? ''));
  const waiting = $derived(asked.filter((q) => !answered.includes(q)).length);

  /**
   * OPEN A PAGE. From the row of pages, focus stays on the control pressed, which is still there; from a figure
   * inside the page, that control is about to be replaced, so focus goes to the new page's title.
   */
  async function open(to: string, from: 'nav' | 'page') {
    shown = to;
    if (from === 'page') {
      await tick();
      heading?.focus();
    }
  }

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

<svelte:head>
  <title>{person.title}</title>
  <meta name="description" content={person.description} />
  <link rel="canonical" href="https://brain.dog{here}" />
  <meta property="og:url" content="https://brain.dog{here}" />
  <meta property="og:title" content={person.title} />
  <meta property="og:description" content={person.description} />
  <!-- Three classes a rule, over the two a scoped `.x.svelte-HASH` carries, so these win whatever order the head is in. -->
  <noscript>
    <style>
      .story .record .pages { display: none; }
    </style>
  </noscript>
</svelte:head>

<PageHead title={person.tag} lead={person.said}>
  <p class="sub">{person.sub}</p>
  <div class="actions">
    <Start />
    <a class="btn ghost" href="/pricing">{f.pricing}</a>
  </div>
</PageHead>

<section class="wrap story">
  <!-- ── The record, drawn large ──────────────────────────────────────────── -->
  {#if example && page}
    <article class="card paper record" aria-labelledby="page-title">
      <div class="pages" role="group" aria-label={f.pages}>
        {#each example.pages as p (p.id)}
          <button type="button" class="pick" aria-current={p.id === page.id ? 'page' : undefined} onclick={() => void open(p.id, 'nav')}>
            {#if isIconName(p.glyph)}<span class="pick-well"><Icon name={p.glyph} size="m" /></span>{/if}
            <span>{p.title}</span>
            {#if p.id === 'needs' && waiting > 0}<span class="count num" aria-hidden="true">{waiting}</span><span class="sr">{w.needYou(waiting)}</span>{/if}
          </button>
        {/each}
      </div>
      <h2 class="page-title" id="page-title" tabindex="-1" bind:this={heading}>{page.title}</h2>
      <div class="drawn" role="group" aria-label={w.window}>
        <Page
          src={page.src}
          layout={page.layout ?? []}
          links={page.links}
          interactive
          source
          now={DRAWN_ON}
          canvas={page.id === 'automations'}
          settled={answered}
          go={(to) => void open(to, 'page')}
          onanswer={(question) => (answered = [...answered, question])}
        />
      </div>
      <p class="caption">{w.caption}</p>
    </article>
  {/if}

  <!-- ── What it does for you, one card a thing ─────────────────────────── -->
  {#each person.rows as row (row.head)}
    <article class="card paper does reveal">
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

  <!-- ── The pages written for someone else ──────────────────────────────── -->
  <nav class="others" aria-labelledby="others-title">
    <h2 class="others-title" id="others-title">{f.others}</h2>
    <ul>
      {#each others as c (c.id)}
        <li><a class="more" href={w.moreFor[c.id].href}>{f.who[c.id].nav}<Icon name="arrow" size="m" /></a></li>
      {/each}
    </ul>
  </nav>
</section>

<Close title={f.close} body={f.price(cloud.price, cloud.unit)} />

<style>
  /* ── The head: the answer under the question, and the two actions ──────── */

  .sub {
    max-inline-size: 34em;
    margin: 18px 0 0;
    color: var(--on-night-2);
    font-size: var(--t-site-18);
    line-height: 1.5;
    text-wrap: pretty;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    margin-block-start: 34px;
  }

  /* ── The cards, one under another ────────────────────────────────────── */

  .story {
    display: grid;
    gap: 20px;
    padding-block-start: 112px;
  }

  /* ── The record, drawn large ─────────────────────────────────────────── */

  .record {
    display: grid;
    gap: 20px;
  }

  /* THE RECORD'S PAGES, as the rail names them: an icon well and the name, the chosen one on the tile's fill with its
     well in the ink. They wrap rather than scroll sideways, so every one is in view and none hides past an edge. */
  .pages {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .pick {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-block-size: var(--ctl-h);
    padding-inline: 6px 14px;
    background: transparent;
    border: 0;
    border-radius: 8px;
    color: var(--ink2);
    font: inherit;
    font-size: var(--t-site-15);
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
  }

  .pick:hover {
    background: var(--rule2);
    color: var(--ink);
  }

  .pick[aria-current='page'] {
    background: var(--tile);
    color: var(--ink);
    font-weight: 600;
  }

  .pick-well {
    display: inline-grid;
    place-items: center;
    inline-size: 28px;
    block-size: 28px;
    border-radius: 6px;
    background: var(--rule2);
  }

  .pick[aria-current='page'] .pick-well {
    background: var(--ink);
    color: var(--page);
  }

  /* THE COUNT ON NEEDS YOU, the one pill on the page: the deeper red on its tint, beside the screen's own name. */
  .count {
    padding: 2px 8px;
    border-radius: var(--r-pill);
    background: var(--red-tint);
    color: var(--red-ink);
    font-size: var(--t-site-small);
    font-weight: 600;
  }

  /* `.card h2` is the big cards' huge title; the record's page name is a page's name in the app, at 28. */
  .page-title {
    max-inline-size: none;
    margin: 4px 0 0;
    color: var(--ink);
    font-size: var(--t-title);
    font-weight: 600;
    line-height: 1.214;
    letter-spacing: -0.02em;
  }

  .drawn {
    min-inline-size: 0;
  }

  .caption {
    margin: 0;
    color: var(--muted);
    font-size: var(--t-site-15);
  }

  /* ── What it does for you ────────────────────────────────────────────── */

  .split {
    display: grid;
    grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
    gap: 56px;
    align-items: center;
  }

  .head h2 {
    margin: 0;
  }

  .drawing {
    min-inline-size: 0;
  }

  .drawing :global(.block) {
    margin-block-end: 0;
  }

  /* ── The pages written for someone else ──────────────────────────────── */

  .others {
    padding-block-start: 52px;
  }

  .others-title {
    margin: 0;
    font-size: var(--t-title);
    line-height: 1.1;
    letter-spacing: -0.035em;
  }

  .others ul {
    display: flex;
    flex-wrap: wrap;
    gap: 0 32px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* 44 on both axes under a thumb, the layout gate's coarse-pointer target. */
  @media (pointer: coarse) {
    .pick {
      min-block-size: var(--tap);
    }
  }

  @media (max-width: 1060px) {
    .split {
      grid-template-columns: minmax(0, 1fr);
      gap: 32px;
    }
  }

  @media (max-width: 760px) {
    .story {
      gap: 14px;
      padding-block-start: 72px;
    }

    .actions .btn {
      flex: 1 1 auto;
    }
  }
</style>
