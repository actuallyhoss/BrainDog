<!--
  One page written for one kind of person, `/for/<who>`: what they would say, their example record drawn
  large enough to use, three things it does for them, the price and the one action.

  THE RECORD IS THE HOME PAGE'S EXAMPLE, NOT A NEW ONE. The pages drawn here are `lib/examples/<id>.ts`,
  the same dialect text the window across the home page's hero draws, through the same `Page.svelte`,
  so a reader who pressed "More for founders" there meets the record they were looking at, larger. Each
  row's drawing is one segment of one of those pages (`copy/for.ts` names which), cut from the page's
  text by its span in the parse, so no figure on this page is written twice.

  LARGER THAN THE WINDOW, AND NOTHING SCROLLS INSIDE IT. The home page's window holds its size while its
  pages change, because the hero under it must not move. Here the drawn record is the page, so a page
  takes the height it needs. At 900px and wider the product's rail (`lib/app/Rail.svelte`) picks the
  page; below it a row of the same pages wraps above it, because a rail is a desk's shape and a phone
  has no room beside the page.

  WITH SCRIPTING OFF THE RECORD SHOWS ITS HOME, drawn. The rail and the row of pages do nothing without a
  script, so the `<noscript>` rule below takes them away rather than leave controls that cannot act.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { parse } from 'braindog-render';
  import Icon from '$lib/Icon.svelte';
  import { isIconName } from '$lib/icons.ts';
  import Page from '$lib/app/Page.svelte';
  import Rail from '$lib/app/Rail.svelte';
  import { questionsIn } from '$lib/app/page.ts';
  import { SIGNUP } from '$lib/copy.ts';
  import { cases } from '$lib/copy/cases.ts';
  import { forPages } from '$lib/copy/for.ts';
  import { DRAWN_ON, EXAMPLES } from '$lib/examples/index.ts';
  import type { Example, ExamplePage } from '$lib/examples/types.ts';
  import { plan } from '$lib/plans.ts';

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
  /** The questions answered here, so Decide's count and the Home's queue both follow an answer. */
  let answered = $state<string[]>([]);
  let heading: HTMLElement | null = $state(null);

  const page = $derived<ExamplePage | undefined>(example?.pages.find((p) => p.id === shown) ?? example?.pages[0]);
  const asked = $derived(questionsIn(example?.pages.find((p) => p.id === 'decide')?.src ?? ''));
  const waiting = $derived(asked.filter((q) => !answered.includes(q)).length);

  /**
   * OPEN A PAGE. From the rail or the row, focus stays on the control pressed, which is still there; from
   * a figure inside the page, that control is about to be replaced, so focus goes to the new page's title.
   */
  async function open(to: string, from: 'nav' | 'page') {
    shown = to;
    if (from === 'page') {
      await tick();
      heading?.focus();
    }
  }

  /**
   * ONE SEGMENT OF ONE OF THE EXAMPLE'S PAGES, as its author wrote it: the text between the segment's
   * `start` and `end` in the parse, which `Page.svelte` then draws as a page of one.
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
      .for .drawn .side { display: none; }
      .for .drawn .chips { display: none; }
      .for .drawn.drawn { grid-template-columns: minmax(0, 1fr); }
    </style>
  </noscript>
</svelte:head>

<div class="for">
  <section class="hero" aria-labelledby="for-title">
    <div class="in">
      <p class="band-tag tag">
        {#if example && isIconName(example.glyph)}<Icon name={example.glyph} size="s" />{/if}
        <span>{person.tag}</span>
      </p>
      <h1 class="display said" id="for-title">{person.said}</h1>
      <div class="hero-row">
        <p class="lede">{person.sub}</p>
        <div class="actions">
          <a class="btn btn-primary btn-lg" href={SIGNUP} rel="external">{f.start}<Icon name="arrow" size="s" /></a>
          <a class="quiet" href="/pricing">{f.pricing}</a>
        </div>
      </div>
    </div>

    {#if example && page}
      <div class="in stage">
        <div class="drawn frame" role="group" aria-label={w.window}>
          <div class="side">
            <Rail name={example.label} glyph={example.glyph} pages={example.pages} current={page.id} open={waiting} pick={(to) => void open(to, 'nav')} />
          </div>
          <div class="body">
            <div class="chips" role="group" aria-label={f.pages}>
              {#each example.pages as p (p.id)}
                <button type="button" class="pick" aria-current={p.id === page.id ? 'page' : undefined} onclick={() => void open(p.id, 'nav')}>
                  {#if isIconName(p.glyph)}<Icon name={p.glyph} size="s" />{/if}
                  <span>{p.title}</span>
                </button>
              {/each}
            </div>
            <h2 class="page-title" tabindex="-1" bind:this={heading}>{page.title}</h2>
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
        </div>
        <p class="caption">{w.caption}</p>
      </div>
    {/if}
  </section>

  <section class="sec" aria-labelledby="rows-title">
    <div class="in">
      <h2 class="h2" id="rows-title">{f.rowsTitle}</h2>
      <ul class="rows">
        {#each person.rows as row (row.head)}
          <li class="row reveal">
            <div class="words">
              <h3 class="row-head">{row.head}</h3>
              <p class="row-said">{row.said}</p>
            </div>
            <div class="drawing frame">
              <Page src={fence(row.draw.page, row.draw.at)} layout={[{ at: 0, cols: 12 }]} now={DRAWN_ON} canvas />
            </div>
          </li>
        {/each}
      </ul>
    </div>
  </section>

  <section class="sec" aria-labelledby="close-title">
    <div class="in">
      <h2 class="h2" id="close-title">{f.start}</h2>
      <div class="close-row">
        <p class="lede">{f.price(cloud.price, cloud.unit)}</p>
        <div class="actions">
          <a class="btn btn-primary btn-lg" href={SIGNUP} rel="external">{f.start}<Icon name="arrow" size="s" /></a>
          <a class="quiet" href="/pricing">{f.pricing}</a>
        </div>
      </div>

      <nav class="others" aria-labelledby="others-title">
        <h3 class="others-title" id="others-title">{f.others}</h3>
        <ul>
          {#each others as c (c.id)}
            <li><a class="onward" href={w.moreFor[c.id].href}>{f.who[c.id].nav}<Icon name="arrow" size="s" /></a></li>
          {/each}
        </ul>
      </nav>
    </div>
  </section>
</div>

<style>
  .hero {
    padding-block: var(--sp-7) clamp(72px, 9vw, 136px);
    background: var(--sunk);
  }

  .tag {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0 0 var(--sp-4);
  }

  .said {
    max-inline-size: 18ch;
  }

  .hero-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--sp-6) var(--sp-8);
    align-items: end;
    margin-block-start: var(--sp-6);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-4);
  }

  .quiet {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--tap);
    color: var(--ink2);
    font-size: var(--t-base);
  }

  /* ── The record, drawn large ─────────────────────────────────────────── */

  .stage {
    display: grid;
    gap: var(--sp-4);
    margin-block-start: var(--sp-8);
  }

  .drawn {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }

  /* The rail is a desk's shape, so below 900px the row of pages stands in for it. */
  .side {
    display: none;
  }

  .body {
    display: grid;
    align-content: start;
    gap: var(--sp-4);
    min-inline-size: 0;
    padding: clamp(var(--sp-4), 3vw, var(--sp-7));
    background: var(--bg);
  }

  /* THE PAGES WRAP rather than scroll sideways, so every one is in view and none hides past an edge. */
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .pick {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-block-size: var(--tap);
    padding-inline: var(--sp-3);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-pill);
    color: var(--ink2);
    font: inherit;
    font-size: var(--t-sm);
    font-weight: 500;
    cursor: pointer;
  }

  .pick[aria-current='page'] {
    background: var(--bg);
    border-color: var(--ink2);
    color: var(--ink);
  }

  .page-title {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-lg);
    font-weight: 600;
  }

  .page-title:focus-visible {
    outline: 2px solid var(--focus-out, currentColor);
    outline-offset: 2px;
  }

  .caption {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
    text-align: center;
  }

  /* ── What it does for you: the words on one side, the drawing on the other ── */

  .rows {
    display: grid;
    gap: clamp(var(--sp-7), 6vw, var(--sp-8));
    margin: var(--sp-7) 0 0;
    padding: 0;
    list-style: none;
  }

  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-5);
    align-items: center;
  }

  .words {
    display: grid;
    gap: var(--sp-3);
    max-inline-size: 44ch;
  }

  .row-head {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-lg);
    font-weight: 600;
    text-wrap: balance;
  }

  .row-said {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-md);
    line-height: var(--lh-body);
    text-wrap: pretty;
  }

  .drawing {
    min-inline-size: 0;
    padding: clamp(var(--sp-4), 3vw, var(--sp-6));
    background: var(--bg);
  }

  /* ── The price, the action, and the other four pages ─────────────────── */

  .close-row {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    justify-content: space-between;
    gap: var(--sp-6);
    margin-block-start: var(--sp-5);
  }

  .others {
    margin-block-start: var(--sp-8);
    padding-block-start: var(--sp-5);
    border-block-start: 1px solid var(--line);
  }

  .others-title {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  .others ul {
    display: flex;
    flex-wrap: wrap;
    gap: 0 var(--sp-6);
    margin: var(--sp-2) 0 0;
    padding: 0;
    list-style: none;
  }

  @media (width >= 900px) {
    .drawn {
      grid-template-columns: 232px minmax(0, 1fr);
    }

    .side {
      display: grid;
    }

    .chips {
      display: none;
    }

    .row {
      grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
      gap: var(--sp-8);
    }

    /* The drawings alternate sides, so three rows read as three and not as one long column. */
    .row:nth-child(even) .words {
      order: 2;
    }
  }

  @media (width < 900px) {
    .hero-row {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
