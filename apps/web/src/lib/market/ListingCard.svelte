<!--
  One use case as a card on browse (`listing.ts`): its Home drawn small, its name, two lines of what it is for, the lists
  it brings by name, and at its foot the one cue that says what its page will offer.

  A PICTURE FIRST, THEN THE WORDS (agents F9). The cards were a grid of the same glyph, the
  same grey box of text lines and "By BrainDog" thirteen times. Each card now leads with what is its own: a miniature of
  the Home it installs (`drawing`, which browse no longer passes since its grey bars read as loading), or, for a use case from outside with a trusted
  preview, its first page through the real renderer (`PreviewPage.svelte`). Its glyph is its own (the Home's or its first
  list's), its lists are named, and who made it is said only when it is not BrainDog, which is the one case it tells
  apart.

  A CARD IS AS TALL AS WHAT IT HOLDS: the grid starts each card at the top and never stretches one to its row.

  THE CUE IS THE CARD'S ONE LINK, stretched over the whole card, so a thumb can press anywhere and a screen reader hears
  the press and the listing's name together. It names what the detail page's button will say and never installs: the
  plan is read on that page first.
-->
<script lang="ts" module>
  import type { Category } from '@braindog/declare/catalogue';
  import { isGlyph, type IconName } from '../ui/icons.ts';
  import type { Listing } from './listing.ts';

  /** The glyph each category is drawn with, for a listing that brings no page of its own to take one from. */
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

  /** The icon the add-on names for itself, when it is one the app draws. */
  export function ownIcon(l: { icon?: string | undefined }): IconName | null {
    return l.icon !== undefined && isGlyph(l.icon) ? l.icon : null;
  }

  /**
   * A listing's glyph by what it is: a use case is a whole way of working, a module brings lists, and an add-on is drawn
   * by the first category it is in that is not one of the two that lead browse.
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
  import { partName } from '$lib/start/propose.ts';
  import Icon from '$lib/ui/Icon.svelte';
  import PreviewPage from './PreviewPage.svelte';
  import { hostsOf, latestOf, listingHref, verifiedOf, type Action } from './listing.ts';
  import { readVersionPreview, type PreviewRead } from './preview.ts';
  import { words } from './words.ts';

  let {
    listing,
    action = null,
    glyph = null,
    drawing,
  }: { listing: Listing; action?: Action | null; glyph?: IconName | null; drawing?: Snippet | undefined } = $props();

  const broughtBy = (names: string[]): string | null => (names.length > 0 ? words.brings(names) : null);
  const latest = $derived(latestOf(listing));
  const reach = $derived(latest?.reach ?? null);
  const hosts = $derived(hostsOf(listing));
  const verified = $derived(verifiedOf(listing));
  const href = $derived(at(listingHref(listing)));

  /* ITS OWN LISTS BY NAME, and what it turns on beside them by the names the modules go by. */
  const lists = $derived(reach?.lists ?? []);
  const brings = $derived(
    /* BY NAME OR NOT AT ALL: a module this build does not know was said by its id. */
    reach && reach.modules.length > 0 ? broughtBy(reach.modules.flatMap((id) => firstPartyModules().find((m) => m.id === id) ? partName(id) : [])) : null,
  );

  /* WHO MADE IT, ONLY WHEN IT IS NOT BRAINDOG: every built-in is BrainDog's, and saying so on each said nothing. */
  const maker = $derived(listing.publisher?.kind === 'braindog' ? null : words.by(listing.publisher?.name ?? listing.author));
  const held = $derived(words.held(listing.count, listing.source));

  const cue = $derived(
    action?.kind === 'installed'
      ? words.installed
      : action?.kind === 'taken'
        ? words.taken
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
  {#if drawn}
    <div class="drawing">
      {#if drawing}
        {@render drawing()}
      {:else if read.state === 'ready'}
        <div class="page-well"><PreviewPage preview={read.preview} /></div>
      {/if}
    </div>
  {/if}

  <h3 class="name"><Icon name={ownIcon(listing) ?? glyph ?? glyphOf(listing)} size="m" /><span>{listing.title}</span></h3>
  <p class="summary">{listing.summary}</p>

  {#if lists.length > 0 || brings}
    <p class="brings">
      {#if lists.length > 0}<span class="lists">{lists.join(', ')}</span>{/if}
      {#if brings}<span>{brings}</span>{/if}
    </p>
  {/if}

  <div class="foot">
    {#if maker || (verified && verified !== 'braindog') || held || (listing.source === 'kennel' && hosts.length > 0)}
      <p class="meta">
        {#if maker}<span>{maker}</span>{/if}
        {#if verified && verified !== 'braindog'}<span class="with-icon"><Icon name="check" size="s" />{verified === 'reviewed' ? words.reviewed : words.verified}</span>{/if}
        {#if held}<span class="num">{held}</span>{/if}
        {#if listing.source === 'kennel' && hosts.length > 0}<span class="calls" title={words.callsOut(hosts)}>{words.countHosts(hosts.length)}</span>{/if}
      </p>
    {/if}
    <!-- THE ONE CUE, AT THE FOOT'S END: what the detail page's button will say. "Installed" is words and no button: it is
         what the record holds, not a press. -->
    <a class="cue" {href} data-held={action?.kind === 'installed' ? '' : undefined}>
      {#if action?.kind === 'installed'}<Icon name="check" size="s" />{/if}{cue}<span class="vh">, {listing.title}</span>
    </a>
  </div>
</li>

<style>
  /* THE CARD IS THE LINK'S BOX: the cue's hit area is stretched over it, and the focus ring is drawn round it. */
  .card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    min-inline-size: 0;
    padding: var(--sp-4);
    background: var(--tile);
    border-radius: var(--r-tile);
    transition: background var(--d-state) var(--ease-out);
  }

  .drawing {
    min-inline-size: 0;
    margin-block-end: var(--sp-1);
  }

  /* A PAGE DRAWN BY THE RENDERER sits on the same well a miniature does. */
  .page-well {
    padding: var(--sp-3);
    border-radius: var(--r-pop);
    background: var(--tile-2);
  }

  .name {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-inline-size: 0;
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-head);
    font-weight: var(--fw-semi);
    line-height: 24px;
  }

  .name :global(.icon) {
    flex: none;
    color: var(--ink-2);
  }

  .name span {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* WHAT IT IS FOR, IN TWO LINES, because one cut most summaries off before their verb. */
  .summary {
    display: -webkit-box;
    overflow: hidden;
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 22px;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .brings {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .lists {
    color: var(--ink-2);
  }

  .foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-3);
    margin-block-start: var(--sp-1);
  }

  /* THE CUE: a quiet button, `--tile-2` on the tile, its hit box the whole card. */
  .cue {
    display: inline-flex;
    flex: none;
    margin-inline-start: auto;
    align-items: center;
    gap: var(--sp-1);
    min-block-size: var(--ctl-h);
    padding-inline: var(--sp-3);
    background: var(--tile-2);
    border-radius: var(--r-ctl);
    color: var(--ink);
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    text-decoration: none;
    white-space: nowrap;
    transition: background var(--d-state) var(--ease-out);
  }

  .cue::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: var(--r-tile);
  }

  .cue:focus-visible {
    /* focus-ok: the card carries the ring instead (`.card:has(.cue:focus-visible)` below), because the link is stretched
       over the whole card and a ring round the button alone would mark a smaller target than the press. */
    outline: none;
  }

  .card:has(.cue:focus-visible) {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  .cue[data-held] {
    padding-inline: 0;
    background: none;
    color: var(--ink-3);
  }

  .meta {
    display: flex;
    flex: 1 1 10rem;
    flex-wrap: wrap;
    column-gap: var(--sp-3);
    min-inline-size: 0;
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .calls {
    color: var(--ink);
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

  /* UNDER THE POINTER THE CARD'S FILL CHANGES, and nothing moves. */
  @media (hover: hover) and (pointer: fine) {
    .card:hover .cue:not([data-held]) {
      background: var(--hover);
    }
  }

  @media (pointer: coarse) {
    .cue {
      min-block-size: var(--tap);
    }
  }
</style>
