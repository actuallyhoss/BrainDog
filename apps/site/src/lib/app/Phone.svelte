<!--
  The drawn app's page area: below 900px the new app's phone round one page of an example record, and at 900px and
  wider the title row and the page beside the rail.

  THE PHONE IS THE DESIGN SYSTEM'S: the ground and its light, a large title with the ask field as a 44px glass circle at the
  top right, the page's sentence under the title, the tiles full width, and a glass tab bar floating one inset from
  the bottom with Home, Decide, Inbox and More, Decide carrying its count. More opens the record's other pages as a
  list, where the product opens its navigation sheet, because the declared pages are never a fifth tab.

  NOTHING SCROLLS INSIDE THE PHONE. A page shows its first screen and fades at its foot, and a tab or a case changes
  it. A scroll inside a scroll is a trap for a thumb on a page that is itself scrolling.

  AT 900PX AND WIDER THE FRAME STEPS ASIDE. The phone's box is `display: contents`, so its head and its page become the
  window's page area (the `head` and `body` areas `Window.svelte` lays out): the title row with the toolbar at its
  right and the sentence under it, and the page, which scrolls inside the window as a page scrolls in the product.
-->
<script lang="ts">
  import { tick, type Snippet } from 'svelte';
  import Icon from '../Icon.svelte';
  import { isIconName } from '../icons.ts';
  import { cases } from '../copy/cases.ts';

  type Entry = { id: string; title: string; glyph: string };

  let {
    title,
    sentence = '',
    pages,
    current,
    open = 0,
    pick,
    heading = $bindable(null),
    tools,
    children,
  }: {
    title: string;
    /** The page's opening sentence, said under the title (the design system). */
    sentence?: string;
    pages: readonly Entry[];
    current: string;
    /** How many questions wait on Decide. */
    open?: number;
    pick: (id: string) => void;
    /** The page's title, which the window focuses after a press inside the page takes the pressed control away. */
    heading?: HTMLElement | null | undefined;
    /** The toolbar at the title row's end. */
    tools?: Snippet;
    children: Snippet;
  } = $props();

  const w = cases.drawn;
  /* The bar's three places, as `BAR_SPINE` in `apps/web/src/lib/spine.ts` names them. */
  const BAR = new Set(['home', 'decide', 'inbox']);
  const tabs = $derived(pages.filter((p) => BAR.has(p.id)));
  const rest = $derived(pages.filter((p) => !BAR.has(p.id)));

  let more = $state(false);

  function choose(id: string) {
    more = false;
    pick(id);
  }

  /* A ROW OF THE MORE LIST LEAVES WITH THE LIST, so focus goes to the title of the page it opened. */
  async function fromList(id: string) {
    choose(id);
    await tick();
    heading?.focus();
  }
</script>

<div class="phone">
  <header class="head">
    <div class="title-row">
      <h2 class="title" tabindex="-1" bind:this={heading}>{more ? w.morePages : title}</h2>
      <span class="find" aria-hidden="true"><Icon name="search" size="l" /></span>
      {#if tools && !more}<div class="tools">{@render tools()}</div>{/if}
    </div>
    {#if sentence && !more}<p class="sentence">{sentence}</p>{/if}
  </header>

  <!-- A REGION WITH A NAME, which a keyboard can reach and scroll at a desk, where the page scrolls inside the window. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <section class="body" aria-label={more ? w.morePages : title} tabindex="0">
    {#if more}
      <ul class="rest">
        {#each rest as p (p.id)}
          <li>
            <button type="button" class="row" aria-current={p.id === current ? 'page' : undefined} onclick={() => void fromList(p.id)}>
              <span class="row-well">{#if isIconName(p.glyph)}<Icon name={p.glyph} size="m" />{/if}</span>
              <span class="row-name">{p.title}</span>
              <Icon name="chevron-right" size="m" />
            </button>
          </li>
        {/each}
      </ul>
    {:else}
      {@render children()}
    {/if}
  </section>

  <div class="bar" role="group" aria-label={w.bar}>
    {#each tabs as p (p.id)}
      <button type="button" class="tab" aria-current={!more && p.id === current ? 'page' : undefined} onclick={() => choose(p.id)}>
        <span class="badge-slot">
          {#if isIconName(p.glyph)}<Icon name={p.glyph} size="l" />{/if}
          {#if p.id === 'decide' && open > 0}<span class="badge num" aria-hidden="true">{open}</span>{/if}
        </span>
        <span>{p.title}</span>
        {#if p.id === 'decide' && open > 0}<span class="hide">{w.toDecide(open)}</span>{/if}
      </button>
    {/each}
    <button type="button" class="tab" aria-expanded={more} onclick={() => (more = !more)}>
      <Icon name="more" size="l" /><span>{w.more}</span>
    </button>
  </div>
</div>

<style>
  /* ── The phone ───────────────────────────────────────────────────────── */

  .phone {
    position: relative;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    inline-size: 100%;
    max-inline-size: 400px;
    block-size: 640px;
    margin-inline: auto;
    overflow: clip;
    border-radius: 36px;
    background-color: var(--sunk);
    background-image: var(--ground-light);
    box-shadow: var(--e3);
  }

  /* The large title, 30/36, with the ask field as a glass circle at its end (the design system). */
  .head {
    display: grid;
    gap: var(--sp-2);
    padding: var(--sp-5) var(--sp-4) var(--sp-3);
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
  }

  .title {
    flex: 1;
    min-inline-size: 0;
    margin: 0;
    color: var(--ink);
    font-size: var(--t-title);
    font-weight: 600;
    line-height: 1.2;
    letter-spacing: -0.02em;
  }

  .find {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: var(--tap);
    block-size: var(--tap);
    border-radius: var(--r-pill);
    background: var(--glass);
    box-shadow: var(--glass-edge), var(--e2);
    backdrop-filter: var(--glass-blur);
    color: var(--ink);
  }

  .tools {
    display: none;
  }

  /* THE SENTENCE: what the page's figures say, in one line under the title. */
  .sentence {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-md);
    line-height: 1.5;
    text-wrap: pretty;
  }

  .body {
    position: relative;
    min-block-size: 0;
    overflow: clip;
    padding: 0 var(--sp-3) calc(var(--tab-h) + var(--sp-6));
    /* THE FADE AT THE FOOT says the page goes on past its first screen, where a hard edge says it ends. The mask
       reads only alpha, so the colour in it is any opaque token and never shows. */
    mask-image: linear-gradient(to bottom, var(--ink) calc(100% - var(--sp-9)), transparent calc(100% - var(--sp-5)));
  }

  .rest {
    display: grid;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* The other pages as rows on the ground: a well, the name and a chevron, 60 tall under a thumb. */
  .row {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    inline-size: 100%;
    min-block-size: 60px;
    padding: 0 var(--sp-2);
    border: 0;
    border-radius: var(--r-md);
    background: none;
    color: var(--ink);
    font: inherit;
    font-size: var(--t-md);
    text-align: start;
    cursor: pointer;
  }

  .row[aria-current='page'] {
    background: var(--hover-wash);
  }

  .row-well {
    display: grid;
    place-items: center;
    inline-size: var(--well-l);
    block-size: var(--well-l);
    border-radius: var(--r-well);
    background: var(--bg);
    color: var(--ink2);
  }

  .row-name {
    flex: 1;
  }

  /* THE TAB BAR: glass, floating one inset from the bottom and the sides, each place a 44px target with its label. */
  .bar {
    position: absolute;
    inset-inline: var(--inset);
    inset-block-end: var(--inset);
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    padding: 4px;
    border-radius: var(--r-lg);
    background: var(--glass);
    box-shadow: var(--glass-edge), var(--e2);
    backdrop-filter: var(--glass-blur);
  }

  .tab {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-block-size: 52px;
    padding: var(--sp-1);
    border: 0;
    border-radius: 18px;
    background: none;
    color: var(--ink2);
    font: inherit;
    font-size: var(--t-xs);
    font-weight: 500;
    cursor: pointer;
  }

  .tab[aria-current='page'] {
    background: var(--bg);
    color: var(--ink);
    font-weight: 600;
  }

  .badge-slot {
    position: relative;
  }

  /* THE SQUARE COUNT, in ink on the site, where red is the mark's alone. */
  .badge {
    position: absolute;
    inset-block-start: -6px;
    inset-inline-start: 13px;
    min-inline-size: 16px;
    padding: 0 4px;
    border-radius: var(--r-sm);
    background: var(--ink);
    color: var(--on-ink);
    font-size: var(--t-xs);
    font-weight: 600;
    line-height: 16px;
    text-align: center;
  }

  .hide {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* ── 900px and wider: the title row and the page beside the rail ────────── */

  @media (width >= 900px) {
    .phone {
      display: contents;
    }

    /* THE TITLE ROW (the design system): the title at 28, the toolbar at the right, and the sentence under it. */
    .head {
      grid-area: head;
      gap: 2px;
      padding: var(--sp-4) 28px var(--sp-3) 20px;
    }

    .title-row {
      min-block-size: var(--tap);
    }

    .find {
      display: none;
    }

    .tools {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .body {
      grid-area: body;
      overflow: auto;
      padding: var(--sp-1) 28px 20px 20px;
      mask-image: none;
    }

    .bar {
      display: none;
    }
  }
</style>
