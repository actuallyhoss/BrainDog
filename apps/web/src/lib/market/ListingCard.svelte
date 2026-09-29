<!--
  One listing as a tile on browse (`listing.ts`): its category's glyph and its title, a small drawing when there is one,
  two lines of what it does, what it adds counted beside each glyph, what it calls out to when it calls anywhere, and at
  its foot the one cue that says what its page will offer beside who made it. Who made it is not on the heading, where
  the heading's one line would cut the title short to make room for it.

  A TILE, AS EVERYTHING THAT HOLDS A FIGURE IS, and the catalogue the site's board draws: a white tile with
  its icon on the heading, and "1 list, 1 page, 1 rule" under what it is for. The drawing sits in a well of the ground's
  colour inside it, so a Home in miniature or a page at half size is a picture of the product and never a tile in a
  tile.

  THE DRAWING IS THE BEST ONE THERE IS. A built-in use case's rail and Home are the caller's (`drawing`, today's
  `Preview.svelte`, which reads the use case's own declarations); an add-on whose version has a trusted preview draws its
  first page through the real renderer (`PreviewPage.svelte`); anything else has no drawing, and its counts say what it
  adds.

  THE CUE IS THE CARD'S ONE LINK, stretched over the whole tile, so a thumb can press anywhere and a screen reader hears
  the press and the listing's name together. It names what the detail page's button will say and never installs: the
  plan is read on that page first.

  WHAT A CARD SAYS ABOUT TRUST IS THE INDEX'S CLAIM. The detail page verifies the signature before anything can be
  pressed; a card only reads what the catalogue computed when the version was listed. Nothing on a card is the author's
  own words about itself but the title and summary.
-->
<script lang="ts" module>
  import type { Category } from '@braindog/declare/catalogue';
  import type { IconName } from '../ui/icons.ts';
  import type { Listing } from './listing.ts';

  /** The glyph each category is drawn with on a tile's heading. */
  const CATEGORY_GLYPHS: Readonly<Record<Category, IconName>> = {
    'made-by-braindog': 'packs',
    'ways-of-working': 'projects',
    modules: 'rows',
    templates: 'doc',
    connectors: 'plug',
    doors: 'inbox',
    automations: 'clock',
    blocks: 'grid',
    themes: 'sun',
  };

  /**
   * A listing's glyph: a use case is a whole way of working, a module brings lists, and an add-on is drawn by the first
   * category it is in that is not one of the two that lead browse.
   */
  export function glyphOf(l: { kind: Listing['kind']; categories: readonly Category[] }): IconName {
    if (l.kind === 'usecase') return CATEGORY_GLYPHS['ways-of-working'];
    if (l.kind === 'module') return CATEGORY_GLYPHS.modules;
    const own = l.categories.find((c) => c !== 'made-by-braindog' && c !== 'ways-of-working');
    return own ? CATEGORY_GLYPHS[own] : 'packs';
  }
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { firstPartyModules } from '@braindog/seed/packs/modules';
  import { at } from '$lib/at.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import PreviewPage from './PreviewPage.svelte';
  import { hostsOf, latestOf, listingHref, verifiedOf, type Action } from './listing.ts';
  import { readVersionPreview, type PreviewRead } from './preview.ts';
  import { words } from './words.ts';

  let { listing, action = null, drawing }: { listing: Listing; action?: Action | null; drawing?: Snippet | undefined } = $props();

  const latest = $derived(latestOf(listing));
  const reach = $derived(latest?.reach ?? null);
  const hosts = $derived(hostsOf(listing));
  const verified = $derived(verifiedOf(listing));
  const href = $derived(at(listingHref(listing)));

  /* WHAT IT ADDS, COUNTED: each kind it brings beside its glyph, and nothing for a kind it brings none of. A module's
     rules are its page's to say, read from its document there, so a card never claims a count it did not read. */
  const counts = $derived(
    reach
      ? [
          { glyph: 'rows' as const, said: words.countLists(reach.lists.length), n: reach.lists.length },
          { glyph: 'doc' as const, said: words.countPages(reach.pages.length), n: reach.pages.length },
          { glyph: 'skill' as const, said: words.countRules(reach.rules.length), n: reach.rules.length },
        ].filter((c) => c.n > 0)
      : [],
  );

  /* WHAT A USE CASE TURNS ON BESIDE ITS OWN, by the names the modules go by: a use case that keeps its lists in them
     brings nothing of its own, and "Nothing of its own" alone would read as nothing at all. */
  const brings = $derived(
    listing.kind === 'usecase' && reach && reach.modules.length > 0
      ? words.brings(reach.modules.map((id) => firstPartyModules().find((m) => m.id === id)?.name ?? id))
      : null,
  );

  const cue = $derived(
    action?.kind === 'installed'
      ? words.installed
      : action?.kind === 'update'
        ? words.update(action.to)
        : action?.kind === 'turn-on'
          ? words.turnOn(listing.title)
          : words.installCue,
  );

  /* A PREVIEW IS ASKED FOR ONLY WHERE THE INDEX SAYS ONE EXISTS, so a card with none costs no request. */
  let read = $state.raw<PreviewRead>({ state: 'none' });
  $effect(() => {
    const l = listing;
    const v = latest;
    read = { state: 'none' };
    if (drawing || l.kind === 'module' || l.source !== 'kennel' || !v?.preview) return;
    void readVersionPreview(fetch, l.kind, l.id, v.version).then((got) => {
      if (listing === l) read = got;
    });
  });

  const drawn = $derived(Boolean(drawing) || (read.state === 'ready' && read.preview.pages.length > 0));
</script>

<li class="card">
  <Tile icon={glyphOf(listing)} title={listing.title}>
    {#if drawn}
      <div class="drawing">
        {#if drawing}
          {@render drawing()}
        {:else if read.state === 'ready'}
          <PreviewPage preview={read.preview} />
        {/if}
      </div>
    {/if}

    <p class="summary">{listing.summary}</p>

    <!-- WHAT IT ADDS, THEN WHAT IT CALLS OUT TO when it calls anywhere. A built-in's calls are said on its detail page,
         read from its file there; the index computed a catalogue entry's when it was listed, so only that one is said. -->
    <ul class="adds" aria-label={words.adds}>
      {#each counts as c (c.glyph)}<li><Icon name={c.glyph} size="s" />{c.said}</li>{:else}{#if !brings}<li>{words.addsNothing}</li>{/if}{/each}
      {#if brings}<li><Icon name="packs" size="s" />{brings}</li>{/if}
      {#if listing.source === 'kennel' && hosts.length > 0}<li class="calls" title={words.callsOut(hosts)}><Icon name="globe" size="s" />{words.countHosts(hosts.length)}</li>{/if}
    </ul>

    <div class="foot">
      <p class="meta">
        <span>{words.by(listing.publisher?.name ?? listing.author)}</span>
        <span>{words.kinds[listing.kind]}</span>
        {#if verified && verified !== 'braindog'}<span class="with-icon"><Icon name="check" size="s" />{verified === 'reviewed' ? words.reviewed : words.verified}</span>{/if}
        {#if listing.count !== null}<span class="num">{words.installs(listing.count)}</span>{/if}
      </p>
      <!-- THE ONE CUE, AT THE FOOT'S END: what the detail page's button will say, as a quiet pill. "Installed" is words
           and no pill: it is what the record holds, not a press. -->
      <a class="cue" {href} data-held={action?.kind === 'installed' ? '' : undefined}>
        {#if action?.kind === 'installed'}<Icon name="check" size="s" />{/if}{cue}<span class="vh">, {listing.title}</span>
      </a>
    </div>
  </Tile>
</li>

<style>
  /* THE CARD IS THE LINK'S BOX: the cue's hit area is stretched over it, and the focus ring is drawn round it. */
  .card {
    position: relative;
    display: flex;
    min-inline-size: 0;
    border-radius: var(--r-lg);
  }

  .card > :global(.tile) {
    flex: 1;
  }

  /* THE DRAWING'S WELL: the ground's colour inside the tile, radius `--r-md`, no edge. */
  .drawing {
    min-inline-size: 0;
    padding: var(--sp-3);
    border-radius: var(--r-md);
    background: var(--sunk);
  }

  /* WHAT IT DOES, IN TWO LINES, because one cut most summaries off before their verb. */
  .summary {
    display: -webkit-box;
    overflow: hidden;
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 20px;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  /* THE COUNTS, EACH BESIDE ITS GLYPH, wrapping as whole items with no separator glyph to lead a wrapped line. */
  .adds {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-1) var(--sp-4);
    margin: 0;
    padding: 0;
    list-style: none;
    color: var(--ink2);
    font-size: var(--t-sm);
    font-variant-numeric: tabular-nums;
    line-height: 18px;
  }

  .adds li {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .adds :global(.icon) {
    color: var(--dim);
  }

  /* CALLING OUT IS WORTH SEEING BEFORE THE PAGE IS OPENED, so it is ink where the counts are the second ink. */
  .calls {
    color: var(--ink);
  }

  /* THE FOOT SITS AT THE BOTTOM OF THE TILE, so a row of tiles lines its cues up whatever each one says above. */
  .foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-3);
    margin-block-start: auto;
  }

  /* A QUIET PILL: the `--s1` pill inside a tile, ink words. Its hit box is the whole card. */
  .cue {
    display: inline-flex;
    flex: none;
    margin-inline-start: auto;
    align-items: center;
    gap: var(--sp-1);
    min-block-size: var(--ctl-h);
    padding-inline: var(--sp-4);
    background: var(--s1);
    border-radius: var(--r-pill);
    color: var(--ink);
    font-size: var(--t-base);
    font-weight: 500;
    text-decoration: none;
    white-space: nowrap;
    transition: background var(--d-state) var(--ease-out);
  }

  .cue::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: var(--r-lg);
  }

  .cue:focus-visible {
    /* focus-ok: the card carries the ring instead (`.card:has(.cue:focus-visible)` below), because the link is stretched
       over the whole card and a ring round the pill alone would mark a smaller target than the press. */
    outline: none;
  }

  .card:has(.cue:focus-visible) {
    outline: 2px solid var(--focus-in);
    outline-offset: 2px;
  }

  .cue[data-held] {
    padding-inline: 0;
    background: none;
    color: var(--dim);
  }

  .meta {
    display: flex;
    flex: 1 1 12rem;
    flex-wrap: wrap;
    column-gap: var(--sp-3);
    min-inline-size: 0;
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: 18px;
  }

  .with-icon {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
  }

  .vh {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @media (hover: hover) and (pointer: fine) {
    .card:hover .cue:not([data-held]) {
      background: var(--s2);
    }
  }

  @media (pointer: coarse) {
    .cue {
      min-block-size: var(--tap);
      font-size: var(--t-md);
    }
  }
</style>
