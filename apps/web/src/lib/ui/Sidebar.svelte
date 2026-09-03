<!--
  The sidebar, and the spine/body split.

  A LEFT SIDEBAR, not a top nav and not palette-first, and both refusals are structural.

  A top nav cannot hold a variable-length, sectioned, reorderable list — and this nav is a query over
  `page` rows. A freelancer has four entries; a studio with five packs has eighteen across six
  sections. The moment a horizontal strip needs a "More" dropdown, the thing that varies per customer
  is the thing that is hidden.

  Palette-first is a documented failure, not a style: it inverts recognition over recall, and the
  same heuristic set says the quiet part out loud — shortcuts are hidden from novice users. A palette
  is an accelerator OVER visible navigation, never a substitute (19 §3).

  Three rules stop an ecosystem rearranging it: the spine is not extensible; a pack declares content
  and identity, never position or visibility; and position lives in a per-user store and wins.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { copy } from '../copy.ts';
  import type { NavEntry } from '../record/api.ts';
  import type { PageDecl, RegisterDecl } from '../record/schema.ts';
  import Icon from './Icon.svelte';
  import Mark from './Mark.svelte';

  let {
    nav,
    pen,
    record,
    registers,
    open = 0,
    inbox = 0,
  }: {
    nav: NavEntry[];
    pen: PageDecl[];
    record: string;
    registers: { id: string; name: string; count: number }[];
    open?: number | undefined;
    inbox?: number | undefined;
  } = $props();

  const sections = $derived.by(() => {
    const out = new Map<string, NavEntry[]>();
    for (const e of [...nav].sort((a, b) => a.order - b.order)) {
      if (!out.has(e.section)) out.set(e.section, []);
      out.get(e.section)!.push(e);
    }
    return [...out];
  });

  /** `g 1`–`g 9` address a POSITION the user controls, not a name the pack chose — so a pack cannot
      steal muscle memory. The digit is printed beside the item, so the chord is discoverable by
      looking at the thing it operates. */
  const digits = $derived(new Map(nav.map((e, i) => [e.id, i < 9 ? String(i + 1) : ''])));

  const here = (href: string) => page.url.pathname === href;
  const under = (href: string) => page.url.pathname.startsWith(href);

  void ({} as RegisterDecl);
</script>

<nav class="rail" aria-label="Record">
  <div class="top">
    <a class="brand" href="/">
      <Mark height={27} />
      <span class="wordmark">{copy.product}</span>
    </a>

    <button type="button" class="record tap">
      <span class="record-name">{record}</span>
      <Icon name="chevronDown" size="s" />
    </button>
  </div>

  <!-- The spine. Home, Decide and Inbox are the three surfaces whose absence would make this a
       different product, so no pack may add to it, reorder it or badge it. -->
  <ul class="group">
    <li>
      <a class="item tap" href="/" aria-current={here('/') ? 'page' : undefined}>
        <Icon name="home" size="m" /><span class="item-name">{copy.home}</span><kbd class="hint">g h</kbd>
      </a>
    </li>
    <li>
      <a class="item tap" href="/decide" aria-current={under('/decide') ? 'page' : undefined}>
        <Icon name="decide" size="m" /><span class="item-name">{copy.decide}</span>
        {#if open}<span class="count" data-intent="warn">{open}</span>{/if}
        <kbd class="hint">g d</kbd>
      </a>
    </li>
    <li>
      <a class="item tap" href="/inbox" aria-current={under('/inbox') ? 'page' : undefined}>
        <Icon name="inbox" size="m" /><span class="item-name">{copy.inbox}</span>
        {#if inbox}<span class="count">{inbox}</span>{/if}
        <kbd class="hint">g i</kbd>
      </a>
    </li>
  </ul>

  <div class="scroll">
    <!-- Declared. Sections and order come from `page` rows, and the user's arrangement wins. -->
    {#each sections as [section, entries]}
      <h2 class="section">{section}</h2>
      <ul class="group">
        {#each entries as entry}
          <li>
            <a class="item tap" href={entry.href} aria-current={here(entry.href) ? 'page' : undefined}>
              <span class="item-name">{entry.title}</span>
              <kbd class="hint">{digits.get(entry.id)}</kbd>
            </a>
          </li>
        {/each}
      </ul>
    {/each}

    <!-- The registers themselves. Native, never pack-positioned: a page can be uninstalled with the
         pack that declared it, and the collections underneath it still have to be reachable. -->
    <h2 class="section">Registers</h2>
    <ul class="group">
      {#each registers as r}
        <li>
          <a class="item tap" href="/r/{r.id}" aria-current={under(`/r/${r.id}`) ? 'page' : undefined}>
            <span class="item-name">{r.name}</span>
            <span class="tally num">{r.count}</span>
          </a>
        </li>
      {/each}
    </ul>

    {#if pen.length}
      <!-- A holding pen. An update that adds a page lands HIDDEN and nothing moves; re-showing one
           returns it to its stored order, never to the end of the list (19 §3). -->
      <a class="pen" href="/settings/navigation">
        <span class="pen-text">{pen.length === 1 ? copy.suggestedPage : `${pen.length} suggested pages.`}</span>
        <span class="pen-action">{copy.review}</span>
      </a>
    {/if}
  </div>

  <ul class="group foot">
    <li>
      <a class="item tap" href="/search" aria-current={under('/search') ? 'page' : undefined}>
        <Icon name="search" size="m" /><span class="item-name">{copy.search}</span>
      </a>
    </li>
    <li>
      <a class="item tap" href="/packs" aria-current={under('/packs') ? 'page' : undefined}>
        <Icon name="packs" size="m" /><span class="item-name">{copy.packs}</span>
      </a>
    </li>
    <li>
      <a class="item tap" href="/vault" aria-current={under('/vault') ? 'page' : undefined}>
        <Icon name="vault" size="m" /><span class="item-name">{copy.vault}</span>
      </a>
    </li>
    <li>
      <a class="item tap" href="/settings/appearance" aria-current={under('/settings') ? 'page' : undefined}>
        <Icon name="settings" size="m" /><span class="item-name">{copy.settings}</span>
      </a>
    </li>
  </ul>
</nav>

<style>
  /* Chrome sinks. The rail is the one surface below the page, so the body reads as a sheet lifted
     off the desk — depth from the luminance ladder, never from a blur (13 §2.1). */
  .rail {
    position: sticky;
    inset-block-start: 0;
    display: flex;
    flex-direction: column;
    inline-size: var(--rail);
    block-size: 100dvh;
    padding: var(--sp-4) var(--sp-2) var(--sp-2);
    background: var(--sunk);
    border-inline-end: 1px solid var(--line);
  }

  .top {
    padding-inline: var(--sp-2);
  }

  /* The lockup. The mark is 27px tall because below about 24 the dog stops being a dog: the negative
     space that IS the drawing collapses to a notch, and what is left reads as a red blob. A mark
     that has to be explained at its working size is the wrong size, not the wrong mark. */
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    text-decoration: none;
  }

  .wordmark {
    color: var(--ink);
    font-family: var(--font-display);
    font-size: 19px;
    font-weight: 600;
    letter-spacing: -0.022em;
  }

  .record {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    inline-size: 100%;
    min-block-size: 28px;
    margin-block-start: var(--sp-1);
    padding: 0;
    background: none;
    border: 0;
    color: var(--dim);
    font-size: var(--t-xs);
    letter-spacing: 0.04em;
    text-align: start;
    text-transform: uppercase;
    cursor: pointer;
  }

  .record:hover {
    color: var(--ink2);
  }

  .record-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .group {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .scroll {
    flex: 1;
    min-block-size: 0;
    margin-block-start: var(--sp-4);
    padding-block-end: var(--sp-4);
    overflow-y: auto;
  }

  .section {
    margin: var(--sp-4) 0 var(--sp-1);
    padding-inline: var(--sp-2);
    color: var(--dim);
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    font-weight: 500;
    letter-spacing: 0.05em;
  }

  .scroll .section:first-child {
    margin-block-start: 0;
  }

  .item {
    display: flex;
    align-items: center;
    gap: 9px;
    min-block-size: 30px;
    padding: 0 var(--sp-2);
    border-radius: var(--r-sm);
    color: var(--ink2);
    font-size: var(--t-ui);
    text-decoration: none;
    transition: background var(--d-state) var(--ease-out);
  }

  .item:hover {
    background: color-mix(in srgb, var(--ink) 6%, transparent);
    color: var(--ink);
  }

  /* The current item is a filled pill with a raised top edge — the same depth cue every other
     raised surface uses, so "here" reads as one of the app's own materials. */
  .item[aria-current='page'] {
    background: var(--s2);
    box-shadow: var(--raise);
    color: var(--ink);
    font-weight: 500;
  }

  .item-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .count {
    min-inline-size: 18px;
    padding: 0 5px;
    border: 1px solid color-mix(in srgb, var(--tone, var(--line)) 55%, var(--line));
    border-radius: 999px;
    color: var(--tone, var(--dim));
    font-size: 10px;
    font-variant-numeric: tabular-nums;
    line-height: 15px;
    text-align: center;
  }

  .tally {
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
  }

  .hint {
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
    opacity: 0;
    transition: opacity var(--d-state) var(--ease-out);
  }

  .rail:hover .hint,
  .item:focus-visible .hint {
    opacity: 1;
  }

  /* Under a coarse pointer the chord hint is noise: there is no keyboard to press it with. */
  @media (pointer: coarse) {
    .hint {
      display: none;
    }
  }

  .pen {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin-block-start: var(--sp-4);
    padding: var(--sp-2);
    border-block: 1px solid var(--line);
    color: var(--dim);
    font-size: var(--t-xs);
    text-decoration: none;
  }

  .pen-text {
    flex: 1;
  }

  .pen-action {
    color: var(--accent-text);
  }

  .foot {
    padding-block-start: var(--sp-2);
    border-block-start: 1px solid var(--line);
  }
</style>
