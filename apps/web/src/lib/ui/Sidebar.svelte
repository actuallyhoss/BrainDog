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

  EVERY ROW WEARS A GLYPH, and it is declared rather than guessed. The first build gave icons to the
  spine and the footer and left the middle — the declared pages and the registers, which is most of
  the rail and all of the part that varies — as bare words. A list where the top three and the
  bottom four are icon rows and the eight between them are not does not read as two kinds of thing.
  It reads as unfinished. So `icon` is a field on the declaration, resolved against the shipped set,
  and a register with nothing declared gets the glyph for "a register" rather than a hole.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { copy } from '../copy.ts';
  import type { NavEntry } from '../record/api.ts';
  import type { PageDecl, RegisterDecl } from '../record/schema.ts';
  import Icon, { type IconName } from './Icon.svelte';
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
    registers: { id: string; name: string; count: number; icon: IconName }[];
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
      <Mark height={26} />
      <span class="wordmark">{copy.product}</span>
    </a>

    <button type="button" class="record tap">
      <span class="record-avatar" aria-hidden="true">{record.slice(0, 1)}</span>
      <span class="record-name">{record}</span>
      <Icon name="chevronDown" size="s" />
    </button>
  </div>

  <!-- The spine. Home, Decide and Inbox are the three surfaces whose absence would make this a
       different product, so no pack may add to it, reorder it or badge it. -->
  <ul class="group spine">
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
              <Icon name={entry.icon} size="m" />
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
            <Icon name={r.icon} size="m" />
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
  /* The rail is the darker ground. Navigation is how you get to the work; the work is what should
     be bright. */
  .rail {
    display: flex;
    flex-direction: column;
    inline-size: var(--rail);
    block-size: 100dvh;
    padding: var(--sp-4) var(--sp-3) var(--sp-3);
    background: var(--sunk);
  }

  .top {
    padding-inline: var(--sp-2);
  }

  /* The lockup. The mark is 26px tall because below about 24 the dog stops being a dog: the negative
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

  /* A CONTROL, not a caption. This opens a record switcher, and the first build drew it as
     letterspaced grey small caps with a chevron floating after it — which is the shape of a label,
     so nobody would ever click it. It is a button now: a surface, a border on hover, and the
     record's initial in a tile, which is the affordance every product with more than one workspace
     has taught people to look for in exactly this corner. */
  .record {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    inline-size: 100%;
    min-block-size: 32px;
    margin-block-start: var(--sp-3);
    padding: 0 var(--sp-2);
    background: none;
    border: 1px solid transparent;
    border-radius: var(--r-md);
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 500;
    text-align: start;
    cursor: pointer;
    transition:
      background var(--d-state) var(--ease-out),
      border-color var(--d-state) var(--ease-out);
  }

  .record:hover {
    background: color-mix(in srgb, var(--ink) 5%, transparent);
    border-color: var(--line);
    color: var(--ink);
  }

  .record-avatar {
    display: grid;
    place-items: center;
    inline-size: 20px;
    block-size: 20px;
    flex: none;
    background: color-mix(in srgb, var(--accent) 16%, transparent);
    border-radius: var(--r-sm);
    color: var(--accent-text);
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
  }

  .record-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .record :global(.icon) {
    color: var(--dim);
  }

  .group {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .spine {
    margin-block-start: var(--sp-4);
  }

  .scroll {
    flex: 1;
    min-block-size: 0;
    margin-block-start: var(--sp-2);
    padding-block-end: var(--sp-4);
    overflow-y: auto;
  }

  /* Small caps here and nowhere else in the product. A section header is not read — it is a RULER
     the eye uses to find the group it wants, and at that job the boxy silhouette of caps at 11px
     beats sentence case. Column headers and field labels are the opposite case and are set the
     opposite way; see blocks.css. */
  .section {
    margin: var(--sp-5) 0 var(--sp-1);
    padding-inline: var(--sp-3);
    color: var(--dim);
    font-family: var(--font-ui);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  .scroll .section:first-child {
    margin-block-start: var(--sp-2);
  }

  .item {
    display: flex;
    align-items: center;
    gap: 10px;
    min-block-size: 32px;
    padding: 0 var(--sp-3);
    border-radius: var(--r-md);
    color: var(--ink2);
    font-size: var(--t-ui);
    font-weight: 500;
    text-decoration: none;
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  .item :global(.icon) {
    color: var(--dim);
    transition: color var(--d-state) var(--ease-out);
  }

  .item:hover {
    background: color-mix(in srgb, var(--ink) 6%, transparent);
    color: var(--ink);
  }

  .item:hover :global(.icon) {
    color: var(--ink2);
  }

  /* "Here" is the mark's colour. It is the one place in the rail that is allowed to be loud, and it
     is the cheapest way for a product to look like itself on every screen. */
  .item[aria-current='page'] {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    color: var(--accent-text);
    font-weight: 600;
  }

  .item[aria-current='page'] :global(.icon) {
    color: var(--accent-text);
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

  /* A count, not a badge: it says how many rows the register holds, which is a fact and not an
     alert. Tabular so the column of them lines up down the rail. */
  .tally {
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
    font-variant-numeric: tabular-nums;
  }

  .item[aria-current='page'] .tally {
    color: inherit;
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
    margin-block-start: var(--sp-5);
    padding: var(--sp-2) var(--sp-3);
    background: color-mix(in srgb, var(--ink) 4%, transparent);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    color: var(--dim);
    font-size: var(--t-xs);
    text-decoration: none;
  }

  .pen:hover {
    border-color: var(--edge);
  }

  .pen-text {
    flex: 1;
  }

  .pen-action {
    color: var(--accent-text);
    font-weight: 600;
  }

  .foot {
    padding-block-start: var(--sp-2);
    border-block-start: 1px solid var(--line);
  }
</style>
