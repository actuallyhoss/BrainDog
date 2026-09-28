<!--
  The drawn app's rail, 900px and wider: the product's `apps/web/src/lib/ui/Sidebar.svelte`, cut down to
  what an example record shows.

  THE SAME ORDER AS THE PRODUCT'S. The record at the top, then the spine (Home, Decide and Inbox, with
  Decide's count), then the record's own pages in the order they were declared. The product's search,
  Slash, the lists and the foot's More are left out, because an example record has nothing behind
  them and a row that opens nothing is a broken control, whatever it looks like.

  EACH ROW IS A BUTTON THAT OPENS ITS PAGE in the drawn app's page area, and the row for the page on
  show carries `aria-current`. Focus stays on the row pressed, which is still there.
-->
<script lang="ts">
  import Icon from '../Icon.svelte';
  import { isIconName } from '../icons.ts';
  import { cases } from '../copy/cases.ts';

  type Entry = { id: string; title: string; glyph: string };

  let {
    name,
    glyph,
    pages,
    current,
    open = 0,
    pick,
  }: {
    /** The record's name, which is the example's label. */
    name: string;
    glyph: string;
    pages: readonly Entry[];
    current: string;
    /** How many questions wait on Decide. */
    open?: number;
    pick: (id: string) => void;
  } = $props();

  /* THE SPINE, as `apps/web/src/lib/spine.ts` draws it on a record that has used Decide and Inbox. */
  const SPINE = new Set(['home', 'decide', 'inbox']);
  const spine = $derived(pages.filter((p) => SPINE.has(p.id)));
  const rest = $derived(pages.filter((p) => !SPINE.has(p.id)));
  const w = cases.drawn;
</script>

{#snippet row(p: Entry)}
  <li>
    <button type="button" class="item tap" aria-current={p.id === current ? 'page' : undefined} onclick={() => pick(p.id)}>
      <span class="glyph">{#if isIconName(p.glyph)}<Icon name={p.glyph} size="m" />{/if}</span>
      <span class="item-name">{p.title}</span>
      {#if p.id === 'decide' && open > 0}<span class="count num" aria-hidden="true">{open}</span><span class="hide">{w.toDecide(open)}</span>{/if}
    </button>
  </li>
{/snippet}

<div class="rail" role="group" aria-label={w.rail}>
  <p class="record">
    <span class="avatar" aria-hidden="true">{#if isIconName(glyph)}<Icon name={glyph} size="s" />{/if}</span>
    <span class="record-name">{name}</span>
  </p>
  <ul class="group">
    {#each spine as p (p.id)}{@render row(p)}{/each}
  </ul>
  <ul class="group">
    {#each rest as p (p.id)}{@render row(p)}{/each}
  </ul>
</div>

<style>
  .rail {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    min-block-size: 0;
    padding: var(--sp-3) var(--sp-2);
    background: var(--sunk);
    border-inline-end: 1px solid var(--line);
  }

  /* The record, where the product puts its switcher: a small mark and the record's name. */
  .record {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    padding-inline: var(--sp-2);
    min-block-size: var(--ctl-h);
    color: var(--ink);
    font-size: var(--t-sm);
    font-weight: 600;
  }

  .avatar {
    display: grid;
    place-items: center;
    inline-size: 22px;
    block-size: 22px;
    border-radius: var(--r-sm);
    background: var(--s2);
    color: var(--ink2);
  }

  .record-name {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .group + .group {
    padding-block-start: var(--sp-3);
    border-block-start: 1px solid var(--line-soft);
  }

  /* A row as the product's rail draws one: the glyph, the name, and a count at the end. */
  .item {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    inline-size: 100%;
    min-block-size: var(--rail-item-h);
    padding: 0 var(--sp-2);
    border: 0;
    border-radius: var(--r-md);
    background: none;
    color: var(--ink2);
    font: inherit;
    font-size: var(--t-sm);
    text-align: start;
    cursor: pointer;
  }

  .item[aria-current='page'] {
    background: var(--selected);
    color: var(--ink);
    font-weight: 500;
  }

  @media (hover: hover) and (pointer: fine) {
    .item:hover {
      background: var(--hover-wash);
    }
  }

  .glyph {
    display: grid;
    place-items: center;
    color: var(--dim);
  }

  .item-name {
    flex: 1;
    min-inline-size: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .count {
    color: var(--warn);
    font-size: var(--t-xs);
    font-weight: 500;
  }

  /* Read by a screen reader and not drawn: the count said as words, where the figure alone says nothing. */
  .hide {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
