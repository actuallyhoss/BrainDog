<!--
  A declared page, drawn: the one reader every declared page goes through, wherever it is drawn.

  ONE READER, THREE MODES. `page` is `/p/<slug>`: the head, the source,
  Edit layout, the writes and the keys. `home` is Home's body: no head, no source and no Edit layout, and the writes stay
  on. `preview` is a page not yet installed, drawn as it would be: inert, with no writes, no arranging and no source,
  and with `was` it is drawn beside the page as it is now, one at a time on a phone. Home and Decide each drew a
  declared page a second and a third way, as a flat stack of blocks with no layout; they draw it through this now.

  THIS FILE IS THE FRAME. It was 1,752 lines holding six jobs, and every change to a page needed the one file, so it
  is split one job to a file: `PageBody.svelte` lays the blocks out, `BlockSlot.svelte` draws one, `Arrange.svelte` is
  Edit layout, `page-writes.ts` is every write a page makes, `SourceView.svelte` is how the page is built, and the host's
  panels are `panels/`. What stays here is what a page is before any of those: waiting, refused, missing, its head, and
  which of them to draw.

  THE CALLER READS AND THIS DRAWS. `/p/[slug]` owns the address, the record read and its `opened()` and `closed()`
  bracket, and hands this the answer as `got`, `null` while the read is out. `reread` is the caller's too, because only
  the caller knows whether the reader is still on the page the answer is for, and a write that lands here asks it for
  the page again without blanking it.
-->
<script lang="ts">
  /* `at` IS THE BLOCK INDEX WHERE THE PAGE BODY LAYS BLOCKS OUT, so the address helper goes by another name here too. */
  import { apiBase } from '../at.ts';
  import { titleOf } from '$lib/title.ts';
  /* THE KINDS ONLY A DECLARED PAGE DRAWS, with the screen that draws them rather than in the sheet every screen waits
     on (`blocks-kinds.css`). Before the charts, in the order the rules had when they were one sheet. */
  import '@braindog/skin/blocks-kinds.css';
  import '@braindog/skin/blocks-charts.css';
  /* EVERY REGISTERED KIND'S STYLESHEET, with the screen that draws its blocks (`kinds/styles.ts`). */
  import './kinds/styles.ts';
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { page as route } from '$app/state';
  import { Filters } from 'braindog-render/svelte';
  import { copy } from '$lib/copy.ts';
  import { covered, typing } from '$lib/a11y/keys.svelte.ts';
  import { hueOf, iconFor } from '$lib/record/api.ts';
  import { Arrangement } from '$lib/record/arrange.svelte.ts';
  import type { LiveBlock, Opened } from '$lib/record/page-live.ts';
  import type { PageBlock } from '$lib/record/schema.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import ShareMenu from '$lib/ui/ShareMenu.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import Arrange, { added } from './Arrange.svelte';
  import ChangePage from './ChangePage.svelte';
  import PageBody from './PageBody.svelte';
  import { layoutOf } from './layout.ts';
  import SourceView from './SourceView.svelte';
  import { heldNone, pageWrites, type Held } from './page-writes.ts';
  import { liveArrivals } from '$lib/data/optimistic.svelte.ts';
  import { openPaletteWith } from '$lib/palette/open.svelte.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { may } from '$lib/record/may.ts';
  import { words } from './words.ts';
  import BatchBar from './BatchBar.svelte';
  import { filterOf, filterQuery, filtersOf } from './filters.ts';
  import { Picked } from './picked.svelte.ts';
  import { RowHost } from './row-host.svelte.ts';
  import RowPanel from './RowPanel.svelte';
  import RowVerbMenu from './RowVerbMenu.svelte';

  let {
    slug,
    got,
    mode = 'page',
    showSource = false,
    reread = async () => {},
    was = null,
    select = false,
  }: {
    /** The page's address, which arranging writes against and a missing page names. */
    slug: string;
    /** The record's answer, a page it lacks or its refusal; `null` until it answers. */
    got: Opened | null;
    /** Where the page is drawn: its own address, Home's body, or a preview of a page not yet installed. */
    mode?: 'page' | 'home' | 'preview';
    /** Whether the declaration is drawn in place of the blocks (`?src=1`). Only a `page` has a source. */
    showSource?: boolean;
    /** Reads the page again after a write, without blanking it. The caller's, because the caller knows the address. */
    reread?: () => Promise<void>;
    /** A preview's page as it is now, drawn beside the page as the change would make it. */
    was?: LiveBlock[] | null;
    /** Whether a home's queues may be chosen several at a time and answered from one bar, as Decide's are. */
    select?: boolean;
  } = $props();

  /* A PAGE IS THE RECORD'S BLOCKS AND NOTHING ELSE; a record that does not answer is its refusal, drawn below. */
  const live = $derived(got?.from === 'live' ? got : null);

  /* ── the writes ────────────────────────────────────────────────────────────
     ONE OBJECT FOR THE WHOLE PAGE, handed to every block, and none at all on a preview, which is what makes a preview
     inert: a block handed no write draws no control. What the writes hold between gestures is kept here, in a rune, so a
     held row redraws where it was. */
  let held = $state.raw<Held>(heldNone());
  const writes = pageWrites({
    slug: () => slug,
    now: () => live?.now ?? null,
    blocks: () => all,
    base: () => apiBase(),
    reread: () => reread(),
    toasts,
    state: { get: () => held, set: (next) => (held = next) },
    arrivals: liveArrivals(),
    /* A QUESTION TYPED INTO A CAPTURE IS ASKED in the palette, where search and Slash answer it. */
    ask: openPaletteWith,
    /* WHAT THE BLOCKS' OWN WRITES DID IS KEPT IN JUST CHANGED, on a page at its own address. */
    touched: (ref, mark, title) => {
      if (mode === 'page') host.note(ref, mark, title);
    },
  });

  /* ── the rows a page hosts ─────────────────────────────────────────────────
     A PAGE AT ITS OWN ADDRESS HOSTS ITS ROWS AS WORK DID (`row-host.svelte.ts`): one open in the docked panel, one
     menu, and Just changed; and its questions, chosen several at a time and answered from one bar (`picked.svelte.ts`).
     Home and a preview draw neither: Home's keys are its own and a preview writes nothing. */
  const host = new RowHost({
    slug: () => slug,
    base: () => apiBase(),
    blocks: () => all,
    now: () => live?.now ?? Date.now(),
    reread: () => reread(),
    toasts,
    may: (register) => may(route.data as unknown as Shell, 'write', register),
  });
  const picked = new Picked({ base: () => apiBase(), reread: () => reread(), toasts });
  $effect.pre(() => {
    const on = slug;
    untrack(() => {
      host.forPage(on);
      picked.clear();
    });
  });

  /* ── the page's filters ────────────────────────────────────────────────────
     THE RECORD SAYS WHAT A PAGE MAY BE NARROWED BY (`filters`, beside its blocks), and the address holds the choice
     (`?f.thing=12`), so a filtered page is a link and Back undoes a choice. The route reads the page again with what
     the address says; this only draws the strip and moves the address. */
  const filters = $derived(live ? filtersOf(live.page.page) : []);
  const chosen = $derived(filterOf(route.url.searchParams));
  function onfilter(field: string, value: string | null) {
    void goto(`?${filterQuery(route.url.searchParams, field, value)}`, { keepFocus: true, noScroll: true });
  }


  /* THE WRITE MODULE IS FETCHED ONCE A WRITABLE PAGE HAS DRAWN, so its first tick is drawn the moment it is pressed. */
  $effect(() => {
    if (mode !== 'preview' && live) untrack(() => writes.warm());
  });

  /* THE HOLDS GO WHEN THE PAGE DOES: `/p/[slug]` keeps this component across slugs (`page-writes.ts` `forPage`). */
  $effect.pre(() => {
    const on = slug;
    untrack(() => writes.forPage(on));
  });

  /* ── arranging ─────────────────────────────────────────────────────────────
     Only a page at its own address is arranged. The arrangement is held here because two parts read it: the head's
     controls (`Arrange.svelte`) and the blocks being moved (`PageBody.svelte`). */
  const arrangement = new Arrangement();
  const arranging = $derived(arrangement.editing);
  /** Whether the page hosts its rows and questions now: at its own address, read, and not being arranged. */
  const hosting = $derived(mode === 'page' && !arranging && !showSource);
  /** Whether the filter strip is drawn: on a hosted page the record says may be narrowed. */
  const strip = $derived(hosting && filters.length > 0);

  /** Blocks added in this session. They live beside the declared ones and index past them. */
  let extra = $state<PageBlock[]>([]);

  /**
   * WHETHER THE PAGE OPENS ON ITS SENTENCE, read as a tile that holds the page's name and tools as well. On a wide screen
   * the head then rides inside that tile, over its top, and the sentence under it is the headline. Not while arranging,
   * where every block is a list item with a bar of its own, and not on a page with a rail, whose first block is the
   * main column's and not the page's.
   */
  const led = $derived.by(() => {
    if (!live || arranging || showSource || layoutOf(live.page.page) !== null) return false;
    /* NOR OVER A FILTER STRIP, which stands between the head and the first tile. */
    if (mode === 'page' && filtersOf(live.page.page).length > 0) return false;
    const first = live.page.blocks[0];
    return first !== undefined && first.drawn && first.kind === 'note' && first.lead === true;
  });

  /** Declared, then added. One list, so ordering and spans do not care which is which. */
  const all = $derived<LiveBlock[]>(live ? [...live.page.blocks, ...extra.map((b) => added(b, live.page.blocks))] : []);

  /**
   * ⇧E toggles the declaration, on a page at its own address. Shift, not a bare `e`, because bare `e` means
   * edit-in-place inside a grid and a key's meaning must be a function of the object in focus rather than of the page
   * you happen to be on. The block keys are the body's (`PageBody.svelte`).
   */
  /* THE SOURCE LINK KEEPS THE REST OF THE ADDRESS, as ⇧E does, so on /?work it stays on Work. */
  const srcHref = $derived.by(() => {
    const q = new URLSearchParams(route.url.searchParams);
    q.set('src', showSource ? '0' : '1');
    return `?${q}`;
  });

  function onkeydown(e: KeyboardEvent) {
    if (mode !== 'page') return;
    if (typing()) return;
    if (e.metaKey || e.ctrlKey) return;
    /* AND NOT WHILE SOMETHING IS OPEN OVER THE PAGE. See `covered`. */
    if (covered()) return;
    if (e.shiftKey && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      /* THE FILTERS IN THE ADDRESS STAY: the source of a narrowed page is the same page, narrowed. */
      const q = new URLSearchParams(route.url.searchParams);
      q.set('src', showSource ? '0' : '1');
      void goto(`?${q}`, { replaceState: true, noScroll: true });
    }
  }

  /* ── a preview beside the page as it is ─────────────────────────────────────
     Both are drawn from 900px up, side by side; below it one at a time, chosen with the switch, and the change first,
     because the change is what is being decided. */
  let showing = $state<'was' | 'after'>('after');

  /* EVERY ID A PREVIEW WRITES CARRIES ITS PAGE, because a change can touch several pages and a screen that previews
     them draws one reader for each: a bare `preview-` would give the second page the first one's ids. */
  const pre = $derived(`preview-${slug}-`);
</script>

<svelte:head>
  {#if mode === 'page'}<title>{titleOf(live?.page.page.title)}</title>{/if}
</svelte:head>

<svelte:window {onkeydown} />

{#if got === null}
  <!-- Bars until the record answers. -->
  <Waiting head={mode === 'page'} />
{:else if got.from === 'refused'}
  <div class="said">
    <Empty kind="error" heading title={got.fix}>
      {#snippet actions()}<Button href="/">{copy.home}</Button>{/snippet}
    </Empty>
  </div>
{:else if !live}
  <div class="said">
    <!-- A URL NAMING SOMETHING THIS RECORD DOES NOT HAVE IS A REFUSAL, and the record already has the sentence for it.
         Nothing failed, so there is no request id to quote (`50 §13 D11`), and no filter ran, so "nothing matched" is
         about something that did not happen. It names the thing, says it is not here, and lists what is: `10 §7`'s
         fourth rule, the refusal is the teacher. -->
    <Empty kind="error" heading title={copy.noSuch('page', slug)} body={copy.theseExist('Pages', got.from === 'missing' ? got.held : [])}>
      {#snippet actions()}<Button href="/">{copy.home}</Button>{/snippet}
    </Empty>
  </div>
{:else if mode === 'page'}
  <!-- THE PAGE GIVES UP WHAT THE DOCKED PANEL TAKES, past the gutter it already pads by (`ui/Panel.svelte`'s `--dock-w`,
       0px while no panel is docked), so a row open beside the page never sits over its head or its tiles. -->
  <div class="hosted">
  <!-- `define="page"`: the rail says "1 suggested page" on every screen and this is the first place somebody is looking
       at one. -->
  <PageHead
    icon={iconFor(live.page.page.icon, 'doc')}
    hue={hueOf(live.page.page.identity)}
    kicker={live.page.page.nav?.section}
    title={live.page.page.title}
    define="page"
    over={led}
  >
    {#snippet actions()}
      {#if !arranging}
        <!-- `How this page is built`, not `Source`, which a reader who does not write code reads as an origin or a
             supplier. AUTHORING IS A DESKTOP SURFACE (13 §10): the link is not drawn below 900px. -->
        <span class="source-slot">
          <Button weight="bare" href={srcHref}>
            <Icon name="code" size="s" />
            {showSource ? copy.pageBack : copy.pageSource}
          </Button>
        </span>
        <ShareMenu {slug} />
        <!-- "Change this page", and below 900px the page menu that holds it and the link above. -->
        <ChangePage {slug} title={live.page.page.title} {showSource} {reread} />
      {/if}
      <Arrange {arrangement} {slug} page={live.page.page} declared={live.page.blocks} {all} bind:extra {showSource} {reread} />
    {/snippet}
  </PageHead>

  {#if strip}
    <!-- THE RENDERER'S STRIP, one group a field, "All" first, the rest behind one select (`braindog-render` `Filters`). -->
    <div class="page-filters"><Filters {filters} {chosen} {onfilter} /></div>
  {/if}

  {#if showSource}
    <!-- The declaration as text. A page is a row, so this is the row (19 §2). -->
    <SourceView {slug} title={live.page.page.title} />
  {:else}
    <PageBody
      mode="page"
      page={live.page.page}
      blocks={all}
      now={live.now}
      {writes}
      {arrangement}
      headed={led}
      host={hosting ? host : null}
      pick={hosting ? picked : null}
    />
    {#if hosting}<BatchBar {picked} />{/if}
  {/if}
  </div>
  {#if hosting}
    <RowPanel {host} />
    <RowVerbMenu {host} {reread} />
  {/if}
{:else if mode === 'home'}
  <!-- HOME'S BODY: the use case's page with its layout, spans and boxes, under Home's own head. Writes stay on, so a
       task is ticked on Home as it is on its page. -->
  <PageBody mode="home" page={live.page.page} blocks={all} now={live.now} {writes} ids="home-" pick={select ? picked : null} />
  {#if select}<BatchBar {picked} />{/if}
{:else}
  <!-- A PREVIEW, INERT: the page as it will be drawn, with nothing on it that writes. Its title is a heading under the
       screen's own, and each block's name one step under that. -->
  <section class="preview" aria-labelledby="{pre}title">
    <h2 class="preview-title" id="{pre}title">{live.page.page.title}</h2>
    {#if was}
      <div class="compare" data-showing={showing}>
        <div class="segmented compare-switch" role="group" aria-label={words.compare}>
          <button
            type="button"
            class="segment"
            data-on={showing === 'was' ? '' : undefined}
            aria-pressed={showing === 'was'}
            onclick={() => (showing = 'was')}>{words.now}</button
          >
          <button
            type="button"
            class="segment"
            data-on={showing === 'after' ? '' : undefined}
            aria-pressed={showing === 'after'}
            onclick={() => (showing = 'after')}>{words.after}</button
          >
        </div>
        <div class="compare-side" data-side="was" role="group" aria-label={words.now}>
          <p class="compare-name" aria-hidden="true">{words.now}</p>
          <PageBody mode="preview" page={live.page.page} blocks={was} now={live.now} writes={null} ids="{pre}was-" level={3} />
        </div>
        <div class="compare-side" data-side="after" role="group" aria-label={words.after}>
          <p class="compare-name" aria-hidden="true">{words.after}</p>
          <PageBody mode="preview" page={live.page.page} blocks={all} now={live.now} writes={null} ids="{pre}after-" level={3} />
        </div>
      </div>
    {:else}
      <PageBody mode="preview" page={live.page.page} blocks={all} now={live.now} writes={null} ids={pre} level={3} />
    {/if}
  </section>
{/if}

<style>
  .hosted {
    min-inline-size: 0;
    padding-inline-end: max(0px, calc(var(--dock-w, 0px) - var(--gutter)));
    transition: padding-inline-end var(--d-enter) var(--ease-out);
  }

  /* THE STRIP SITS IN THE PAGE'S OWN GUTTER AND CAP, over the first tile, with the gap a row of tiles keeps. */
  .page-filters {
    padding: var(--sp-3) var(--gutter) 0;
    max-inline-size: var(--page-max);
  }

  /* A PAGE THAT CANNOT BE DRAWN IS ONE SENTENCE, NOT A GRID, inside the page's own gutter and cap, so it sits where the
     page would have. */
  .said {
    padding: var(--sp-5) var(--gutter) var(--sp-9);
    max-inline-size: var(--page-max);
  }

  .preview {
    display: grid;
    gap: var(--sp-4);
    min-inline-size: 0;
  }

  .preview-title {
    margin: 0;
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--t-md);
    font-weight: 600;
  }

  .compare {
    display: grid;
    gap: var(--sp-5) var(--sp-6);
    align-items: start;
    min-inline-size: 0;
  }

  .compare-switch {
    justify-self: start;
  }

  .compare-side {
    display: grid;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .compare-name {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  @media (width < 900px) {
    .said {
      padding: var(--sp-4) var(--gutter) var(--sp-8);
    }

    /* THE LINK TO THE SOURCE IS A DESKTOP AFFORDANCE, as Edit layout beside it is (13 §10). */
    .source-slot {
      display: none;
    }

    /* ONE AT A TIME ON A PHONE: the side the switch has not chosen is not drawn. */
    .compare[data-showing='was'] .compare-side[data-side='after'],
    .compare[data-showing='after'] .compare-side[data-side='was'] {
      display: none;
    }
  }

  /* SIDE BY SIDE FROM 900px, each half a twelve-column page of its own, and no switch, since both are in view. */
  @media (width >= 900px) {
    .compare {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .compare-switch {
      display: none;
    }
  }
</style>
