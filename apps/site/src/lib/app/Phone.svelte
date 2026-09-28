<!--
  The drawn app's phone, below 900px: the product's phone layout round one page of an example record.

  THE PRODUCT'S SHAPE, AS `apps/web/src/lib/ui/TabBar.svelte` DRAWS IT: a head with the page's large
  title, the page, and a bar at the foot with Home, Decide, Inbox and More, Decide carrying its count.
  More opens the record's other pages as a list, where the product opens its navigation sheet, because
  the declared pages are never a fifth tab.

  NOTHING SCROLLS INSIDE THE PHONE. A page shows its first screen and fades at its foot, and a tab or a
  case changes it. A scroll inside a scroll is a trap for a thumb on a page that is itself scrolling,
  and the first screen is the one a person meets in the product.

  AT 900PX AND WIDER THE FRAME STEPS ASIDE. The phone's box is `display: contents`, so its head and its
  page become the window's page area (the `head` and `body` areas `Window.svelte` lays out), the bar
  goes, and the page scrolls inside the window instead, as a page scrolls inside the product's shell.
-->
<script lang="ts">
  import { tick, type Snippet } from 'svelte';
  import Icon from '../Icon.svelte';
  import { isIconName } from '../icons.ts';
  import { cases } from '../copy/cases.ts';

  type Entry = { id: string; title: string; glyph: string };

  let {
    title,
    pages,
    current,
    open = 0,
    pick,
    heading = $bindable(null),
    children,
  }: {
    title: string;
    pages: readonly Entry[];
    current: string;
    /** How many questions wait on Decide. */
    open?: number;
    pick: (id: string) => void;
    /** The page's title, which the window focuses after a press inside the page takes the pressed control away. */
    heading?: HTMLElement | null | undefined;
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
    <h2 class="title" tabindex="-1" bind:this={heading}>{more ? w.morePages : title}</h2>
  </header>

  <div class="body" role="region" aria-label={more ? w.morePages : title} tabindex="0">
    {#if more}
      <ul class="rest">
        {#each rest as p (p.id)}
          <li>
            <button type="button" class="row" aria-current={p.id === current ? 'page' : undefined} onclick={() => void fromList(p.id)}>
              <span class="row-glyph">{#if isIconName(p.glyph)}<Icon name={p.glyph} size="m" />{/if}</span>
              <span>{p.title}</span>
            </button>
          </li>
        {/each}
      </ul>
    {:else}
      {@render children()}
    {/if}
  </div>

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
  .phone {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    inline-size: 100%;
    max-inline-size: 400px;
    block-size: 600px;
    margin-inline: auto;
    overflow: clip;
    border: 1px solid var(--edge);
    border-radius: var(--r-lg);
    background: var(--bg);
    box-shadow: var(--e2);
  }

  /* The phone's large title, `--t-xl` at 600, as the design brief sets the phone's head. */
  .head {
    padding: var(--sp-5) var(--sp-4) var(--sp-3);
  }

  .title {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-xl);
    font-weight: 600;
    line-height: var(--lh-tight);
  }

  .body {
    position: relative;
    min-block-size: 0;
    overflow: clip;
    padding: 0 var(--sp-4);
  }

  /* THE FADE AT THE FOOT says the page goes on past its first screen, where a hard edge says it ends. */
  .body::after {
    content: '';
    position: absolute;
    inset-inline: 0;
    inset-block-end: 0;
    block-size: var(--sp-8);
    background: linear-gradient(transparent, var(--bg));
    pointer-events: none;
  }

  .rest {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .row {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    inline-size: 100%;
    min-block-size: var(--row-h-2);
    padding: 0;
    border: 0;
    border-block-end: 1px solid var(--line-soft);
    background: none;
    color: var(--ink);
    font: inherit;
    font-size: var(--t-md);
    text-align: start;
    cursor: pointer;
  }

  .row-glyph {
    display: grid;
    place-items: center;
    color: var(--dim);
  }

  /* The bar as `TabBar.svelte` draws it: even columns on the sunk ground, and the current tab in ink
     with an ink bar above it, so where you are is a shape as well as a shade. */
  .bar {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    border-block-start: 1px solid var(--line);
    background: var(--sunk);
  }

  .tab {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    min-block-size: var(--tab-h);
    padding: var(--sp-1);
    border: 0;
    background: none;
    color: var(--dim);
    font: inherit;
    font-size: var(--t-xs);
    cursor: pointer;
  }

  .tab[aria-current='page'] {
    color: var(--ink);
    box-shadow: inset 0 2px 0 0 var(--ink);
  }

  .badge-slot {
    position: relative;
  }

  .badge {
    position: absolute;
    inset-block-start: -5px;
    inset-inline-start: 11px;
    min-inline-size: 16px;
    padding: 0 4px;
    border-radius: var(--r-pill);
    background: var(--sunk);
    color: var(--warn);
    font-size: var(--t-xs);
    font-weight: 500;
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

  @media (width >= 900px) {
    .phone {
      display: contents;
    }

    .head {
      grid-area: head;
      padding: var(--sp-4) var(--sp-5) 0;
    }

    .title {
      font-size: var(--t-lg);
    }

    .body {
      grid-area: body;
      overflow: auto;
      padding: var(--sp-3) var(--sp-5) var(--sp-5);
    }

    .body::after {
      content: none;
    }

    .bar {
      display: none;
    }
  }
</style>
