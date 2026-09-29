<!--
  One page written for one kind of person, `/for/<who>`: what they would say, their example record drawn large
  enough to use, three things it does for them, the price and the one action.

  THE LOOK IS THE DESIGN SYSTEM'S: every band is tiles on the ground. The first tile
  holds the person's own question, the sentence under it and the action, and beside it the example record's answer:
  its Home's figures and the sentence its Home opens with. Then the record itself in one wide tile, then one tile per
  thing it does for them, each carrying its drawing, and the close.

  THE RECORD IS THE HOME PAGE'S EXAMPLE, NOT A NEW ONE. The pages drawn here are `lib/examples/<id>.ts`, the same
  dialect text the window across the home page's hero draws, through the same `Page.svelte`, so a reader who pressed
  "More for founders" there meets the record they were looking at, larger. Each drawing is one segment of one of
  those pages (`copy/for.ts` names which), cut from the page's text by its span in the parse, so no figure on this
  page is written twice.

  NOTHING SCROLLS INSIDE THE RECORD. The home page's window holds its size while its pages change; here the drawn
  record is the page, so a page takes the height it needs. A row of the record's pages sits over it at every width.

  WITH SCRIPTING OFF THE RECORD SHOWS ITS HOME, drawn. The row of pages does nothing without a script, so the
  `<noscript>` rule below takes it away rather than leave controls that cannot act.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { parse } from 'braindog-render';
  import Icon from '$lib/Icon.svelte';
  import { isIconName, type IconName } from '$lib/icons.ts';
  import Page from '$lib/app/Page.svelte';
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

  const segmentsOf = (pageId: string) => parse(example?.pages.find((p) => p.id === pageId)?.src ?? '', { page: true });

  /**
   * ONE SEGMENT OF ONE OF THE EXAMPLE'S PAGES, as its author wrote it: the text between the segment's `start` and
   * `end` in the parse, which `Page.svelte` then draws as a page of one.
   */
  function fence(pageId: string, at: number): string {
    const src = example?.pages.find((p) => p.id === pageId)?.src ?? '';
    const seg = parse(src, { page: true })[at];
    return seg ? src.slice(seg.start, seg.end) : '';
  }

  /* THE HOME'S ANSWER, for the opening tile: the figures its Home leads with, and the sentence it opens with. */
  const home = $derived(segmentsOf(example?.pages[0]?.id ?? 'home'));
  const figuresAt = $derived(home.findIndex((s) => s.type === 'block' && s.kind === 'stat'));
  const opening = $derived.by(() => {
    const lead = home.find((s) => s.type === 'block' && s.kind === 'note' && s.form === 'lead');
    return lead?.type === 'block' ? lead.rows.map((r) => r.cells.join(' ')).join(' ').trim() : '';
  });

  /* THE GLYPH ON A TILE'S HEADING says what its drawing is, from the icon set's own idea for it. */
  const KIND_GLYPH: Record<string, IconName> = {
    series: 'bars',
    progress: 'gauge',
    ring: 'target',
    heat: 'activity',
    timeline: 'calendar',
    steps: 'zap',
    todo: 'work',
    checklist: 'work',
    cards: 'agent',
    agents: 'agent',
    queue: 'decide',
    comparison: 'receipt',
    board: 'projects',
    stat: 'bars',
  };

  function glyphFor(pageId: string, at: number): IconName {
    const seg = segmentsOf(pageId)[at];
    const byKind = seg?.type === 'block' ? KIND_GLYPH[seg.kind] : undefined;
    if (byKind) return byKind;
    const g = example?.pages.find((p) => p.id === pageId)?.glyph ?? '';
    return isIconName(g) ? g : 'file';
  }

  /* Three rows beside the close: wide, narrow, wide, and the close takes the narrow place beside the last. */
  const SPANS = ['span-7', 'span-5', 'span-7'] as const;
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
      .for .drawn .pages { display: none; }
    </style>
  </noscript>
</svelte:head>

<div class="for">
  <!-- ── The person's question, and the record's answer ─────────────────── -->
  <section class="band" aria-labelledby="for-title">
    <div class="in">
      <div class="tiles">
        <div class="tile lead opening">
          <div class="words">
            <p class="tag">
              <span class="well">{#if example && isIconName(example.glyph)}<Icon name={example.glyph} />{/if}</span>
              <span>{person.tag}</span>
            </p>
            <h1 class="h2 said" id="for-title">{person.said}</h1>
            <p class="lede">{person.sub}</p>
            <div class="actions">
              <a class="btn btn-primary btn-lg" href={SIGNUP} rel="external">{f.start}<Icon name="arrow" size="m" /></a>
              <a class="btn btn-lg" href="/pricing">{f.pricing}</a>
            </div>
          </div>

          {#if example && (figuresAt >= 0 || opening !== '')}
            <div class="answer" role="group" aria-label={w.window}>
              <p class="answer-head meta">{example.label}</p>
              {#if figuresAt >= 0}
                <Page src={fence(example.pages[0]?.id ?? 'home', figuresAt)} layout={[{ at: 0, cols: 12 }]} now={DRAWN_ON} />
              {/if}
              {#if opening !== ''}<p class="reading">{opening}</p>{/if}
            </div>
          {/if}
        </div>
      </div>
    </div>
  </section>

  <!-- ── The record, drawn large ──────────────────────────────────────────── -->
  {#if example && page}
    <section class="band" aria-labelledby="page-title">
      <div class="in">
        <div class="tiles">
          <div class="tile drawn" role="group" aria-label={w.window}>
            <div class="pages" role="group" aria-label={f.pages}>
              {#each example.pages as p (p.id)}
                <button type="button" class="pick" aria-current={p.id === page.id ? 'page' : undefined} onclick={() => void open(p.id, 'nav')}>
                  {#if isIconName(p.glyph)}<span class="pick-well"><Icon name={p.glyph} size="m" /></span>{/if}
                  <span>{p.title}</span>
                  {#if p.id === 'decide' && waiting > 0}<span class="count num" aria-hidden="true">{waiting}</span><span class="sr">{w.toDecide(waiting)}</span>{/if}
                </button>
              {/each}
            </div>
            <h2 class="page-title" id="page-title" tabindex="-1" bind:this={heading}>{page.title}</h2>
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
            <p class="caption meta">{w.caption}</p>
          </div>
        </div>
      </div>
    </section>
  {/if}

  <!-- ── What it does for you, one tile a thing, and the close beside the last ── -->
  <section class="band" aria-labelledby="rows-title">
    <div class="in">
      <h2 class="sr" id="rows-title">{f.rowsTitle}</h2>
      <div class="tiles">
        {#each person.rows as row, i (row.head)}
          <article class="tile lead does reveal {SPANS[i] ?? 'span-6'}">
            <header class="tile-head">
              <span class="well"><Icon name={glyphFor(row.draw.page, row.draw.at)} /></span>
              <h3 class="h3">{row.head}</h3>
            </header>
            <p class="lede">{row.said}</p>
            <div class="drawing">
              <Page src={fence(row.draw.page, row.draw.at)} layout={[{ at: 0, cols: 12 }]} now={DRAWN_ON} canvas />
            </div>
          </article>
        {/each}

        <div class="tile lead close span-5 reveal">
          <h2 class="h2" id="close-title">{f.start}</h2>
          <p class="lede">{f.price(cloud.price, cloud.unit)}</p>
          <div class="actions">
            <a class="btn btn-primary btn-lg" href={SIGNUP} rel="external">{f.start}<Icon name="arrow" size="m" /></a>
            <a class="btn btn-lg" href="/pricing">{f.pricing}</a>
          </div>

          <nav class="others" aria-labelledby="others-title">
            <h3 class="others-title meta" id="others-title">{f.others}</h3>
            <ul>
              {#each others as c (c.id)}
                <li><a class="onward" href={w.moreFor[c.id].href}>{f.who[c.id].nav}<Icon name="arrow" size="m" /></a></li>
              {/each}
            </ul>
          </nav>
        </div>
      </div>
    </div>
  </section>
</div>

<style>
  /* ── The opening tile: the question on one side, the record's answer on the other ── */

  .opening {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-6);
  }

  .words {
    display: grid;
    align-content: start;
    justify-items: start;
    gap: var(--sp-4);
  }

  .tag {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-site-small);
    font-weight: 500;
  }

  .said {
    max-inline-size: 22ch;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    margin-block-start: var(--sp-2);
  }

  /* THE ANSWER sits on the tile's second fill: the Home's figures drawn by the renderer, and its opening sentence. */
  .answer {
    display: grid;
    align-content: start;
    gap: var(--sp-3);
    min-inline-size: 0;
    padding: 20px;
    background: var(--s1);
    border-radius: var(--r-md);
  }

  .answer-head {
    margin: 0;
  }

  .answer :global(.block) {
    margin: 0;
  }

  /* ── The record, drawn large ─────────────────────────────────────────── */

  .drawn {
    gap: var(--sp-4);
  }

  /* THE RECORD'S PAGES, as the rail names them: an icon well and the name, the chosen one in the ink well. They wrap
     rather than scroll sideways, so every one is in view and none hides past an edge. */
  .pages {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-1);
    padding: 4px;
    background: var(--s1);
    border-radius: var(--r-md);
  }

  .pick {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--ctl-h);
    padding-inline: 5px 12px;
    background: transparent;
    border: 0;
    border-radius: var(--r-md);
    color: var(--ink2);
    font: inherit;
    font-size: var(--t-site-small);
    font-weight: 500;
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  .pick:hover {
    background: var(--hover-wash);
    color: var(--ink);
  }

  .pick[aria-current='page'] {
    background: var(--bg);
    box-shadow: var(--e1);
    color: var(--ink);
    font-weight: 600;
  }

  .pick-well {
    display: inline-grid;
    place-items: center;
    inline-size: 26px;
    block-size: 26px;
    border-radius: var(--r-well);
    background: var(--hover-wash);
  }

  .pick[aria-current='page'] .pick-well {
    background: var(--ink);
    color: var(--on-ink);
  }

  .count {
    color: var(--dim);
    font-size: var(--t-site-small);
    font-weight: 400;
  }

  .page-title {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-title);
    font-weight: 600;
    line-height: 1.214;
    letter-spacing: -0.02em;
  }

  .caption {
    margin: 0;
  }

  /* ── What it does for you ────────────────────────────────────────────── */

  .does {
    gap: var(--sp-4);
  }

  .drawing {
    min-inline-size: 0;
    margin-block-start: auto;
  }

  .drawing :global(.block) {
    margin-block-end: 0;
  }

  .close {
    justify-content: flex-start;
  }

  .others {
    display: grid;
    gap: var(--sp-1);
    margin-block-start: auto;
    padding-block-start: var(--sp-4);
    border-block-start: 1px solid var(--line);
  }

  .others-title {
    margin: 0;
    font-weight: 500;
  }

  .others ul {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 var(--sp-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  @media (width >= 900px) {
    .opening {
      grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
      align-items: start;
      gap: var(--sp-7);
    }
  }

  @media (width < 640px) {
    .pick {
      min-block-size: var(--tap);
    }

    .others ul {
      grid-template-columns: minmax(0, 1fr);
    }

    .actions .btn {
      flex: 1 1 auto;
    }
  }
</style>
