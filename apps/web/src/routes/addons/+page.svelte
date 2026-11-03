<!--
  The store: everything a record can add, at `/addons`. What this record already holds is Settings › Add-ons.

  ONE LISTING MODEL. The starters this build ships and every entry the catalogue lists are read into `Listing`s by
  `listingsOf` (`$lib/market/listing.ts`), so they are searched and named the same way everywhere. Anything private,
  unlisted or withdrawn is in no listing.

  IN THE ORDER A PERSON SHOPS: one search over names, what each does and the lists it
  brings; then "Suggested for you", at most three, each with its reason from this record's own signs and questions
  (`$lib/market/suggest.ts`); then the starters, with the example setups behind one card; then every add-on on the shelf
  of what it is for (`$lib/market/shelves.ts`), four to a shelf with Show all. BrainDog's own parts (Projects, People,
  Work and Agents) are never offered, and a base add-on a starter turns on (Money, Services) only while it is off here.

  WHO MADE IT IS SAID ONCE A CARD: "By BrainDog" with a check, "Reviewed" for community work the operator listed, or its
  author.

  NOTHING HERE INSTALLS. A card opens the add-on's own page, where its plan is read before anything can be pressed.
-->
<script lang="ts">
  import { apiBase } from '$lib/at.ts';
  import { may } from '$lib/record/may.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import NotFound from '$lib/ui/NotFound.svelte';
  import { untrack } from 'svelte';
  import { page } from '$app/state';
  import { createClient } from '@braindog/client';
  import type { CatalogueIndex, Shelf } from '@braindog/declare/catalogue';
  import { MODULE_SHELVES, MODULES } from '@braindog/declare';
  import { useCase } from '@braindog/seed/usecases';
  import { firstPartyModules } from '@braindog/seed/packs/modules';
  import { moduleName } from '@braindog/seed/usecases/names';
  import { titleOf } from '$lib/title.ts';
  import { copy } from '$lib/copy.ts';
  import { read } from '$lib/data/record.ts';
  import { choose, type PackState } from '$lib/record/packs.ts';
  import { VOICE_LINES } from '$lib/voice.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import Segmented from '$lib/ui/Segmented.svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import { isGlyph, type IconName } from '$lib/ui/icons.ts';
  import { glyphOf, ownIcon } from '$lib/market/ListingCard.svelte';
  import StoreCard from '$lib/market/StoreCard.svelte';
  import { readCounts } from '$lib/market/counts.ts';
  import { actionOf, latestOf, listingHref, listingsOf, searchListings, verifiedOf, type Listing } from '$lib/market/listing.ts';
  import { categoryName } from '$lib/market/chips.ts';
  import { baseTurnedOn, SHELF_NAMES, SHELF_SLOTS, shelfOf, storeChips, storeOf } from '$lib/market/shelves.ts';
  import { suggestionsOf, type SignRead } from '$lib/market/suggest.ts';
  import { words } from '$lib/market/words.ts';
  import { drew } from '../../lib/ui/screen.svelte.ts';
  import { INSTALLED_AT } from './moved.ts';
  import { miniOf } from './mini.ts';
  import { readHostCatalogue } from './catalogue.ts';
  import { addonHref } from './share/addon-from.ts';
  import Swap from '$lib/motion/Swap.svelte';
  import { cardsIn } from './cards-in.ts';

  const store = words.store;

  let kennel = $state.raw<CatalogueIndex | null>(null);
  let kennelRefused = $state<string | null>(null);
  let counts = $state.raw<Record<string, number> | null>(null);
  /** This record's packs, `null` until it answers or when it does not. */
  let states = $state.raw<PackState[] | null>(null);
  /** The record's vital signs and its open questions, for what the store suggests; `null` until read, or refused. */
  let signs = $state.raw<SignRead[] | null>(null);
  let questions = $state.raw<string[] | null>(null);

  let query = $state(page.url.searchParams.get('q') ?? '');
  /** The chip picked: the starters, one shelf, or everything. */
  let picked = $state<'starters' | Shelf | null>(page.url.searchParams.get('chip') === 'starters' ? 'starters' : null);
  /** The shelves opened past their first four, and whether the example setups are shown. */
  let opened = $state<Partial<Record<Shelf, boolean>>>({});
  let examplesOpen = $state(false);

  const listings = $derived(listingsOf({ kennel, counts }));
  const searching = $derived(query.trim() !== '');
  const laid = $derived(storeOf(searchListings(listings, query, categoryName), states));
  const chips = $derived(storeChips(laid, store.starters));
  /* A CHIP A NEW SEARCH EMPTIED LETS GO, so the page never says nothing matches because of a chip no longer drawn. */
  const chip = $derived(picked !== null && chips.some((c) => c.id === picked) ? picked : null);
  const total = $derived(chips.reduce((n, c) => n + c.count, 0));

  /** Four to a shelf until Show all, a search or a chip. */
  const FOLDED_AT = 4;
  const phone = new MediaQuery('(width < 640px)', false);
  const folded = (shelf: Shelf, n: number): boolean => n > FOLDED_AT && !searching && chip === null && opened[shelf] !== true;

  /* ── what each card says ───────────────────────────────────────────────── */

  const modules = new Map(firstPartyModules().map((m) => [m.id, m]));
  const voiced = (u: NonNullable<ReturnType<typeof useCase>>) => (key: string): string | null =>
    (u.voice as Record<string, string | undefined>)[key] ?? (VOICE_LINES as Record<string, string | undefined>)[key] ?? null;
  const asGlyph = (name: string | null | undefined): IconName | null => (name && isGlyph(name) ? name : null);
  /* A STARTER'S OWN GLYPH WHERE TWO WOULD WEAR ONE, so no two starters wear the same one. */
  const KNOWN_BY: Readonly<Record<string, IconName>> = { guide: 'check', founder: 'projects' };

  const iconOf = (l: Listing): IconName => {
    const own = ownIcon(l) ?? (l.kind === 'module' ? asGlyph(modules.get(l.id)?.icon) : null);
    if (own) return own;
    if (l.kind === 'usecase') {
      const u = l.source === 'bundled' ? useCase(l.id) : undefined;
      return KNOWN_BY[l.id] ?? asGlyph(u ? miniOf(u, voiced(u)).glyph : null) ?? glyphOf(l);
    }
    return glyphOf(l);
  };

  /** Who made it, said once: BrainDog with a check, "Reviewed" for community work the operator listed, else its author. */
  const ours = (l: Listing): boolean => verifiedOf(l) === 'braindog' || l.publisher?.kind === 'braindog';
  const byOf = (l: Listing): string | null => (ours(l) ? null : latestOf(l)?.reviewed ? store.reviewed : store.community(l.publisher?.name ?? l.author));

  /** The cue: Add, Added, Turn on or Update, and "Your starter" for a starter this record runs on. */
  const cueOf = (l: Listing): { cue: string; held: boolean } => {
    const a = states ? actionOf(l, states) : null;
    if (a?.kind === 'installed') return { cue: l.kind === 'usecase' ? store.yourStarter : store.added, held: true };
    if (a?.kind === 'turn-on') return { cue: store.turnOn, held: false };
    if (a?.kind === 'update') return { cue: store.update, held: false };
    return { cue: store.add, held: false };
  };

  /** A starter's second line: the add-ons it turns on, else the first lists it brings. */
  const starterNote = (l: Listing): string | null => {
    const on = baseTurnedOn(l, moduleName);
    if (on.length > 0) return store.turnsOn(on);
    const lists = (latestOf(l)?.reach.lists ?? []).slice(0, 2);
    return lists.length > 0 ? store.adds(lists) : null;
  };

  /* ── what the record suggests ──────────────────────────────────────────── */

  /* MONEY IS ON when a module standing on the money shelf is held and on: the rates it keeps are Money's. */
  const moneyOn = $derived(
    (states ?? []).some((s) => s.disabled_at === null && (MODULES as readonly string[]).includes(s.id) && MODULE_SHELVES[s.id as (typeof MODULES)[number]] === 'money'),
  );
  const suggested = $derived(searching || chip !== null ? [] : suggestionsOf({ signs, questions, listings, states, moneyOn, href: listingHref }));

  /* FROM BRAINDOG: at most four add-ons BrainDog makes and keeps up, that this record does not hold yet and the
     suggestions above do not name, the most held first. Drawn only on the whole store, never over a search or a chip,
     and only once the record has said what it holds, so nothing it already has is offered. */
  const FEATURED_MOST = 4;
  const featured = $derived.by((): Listing[] => {
    if (searching || chip !== null || states === null) return [];
    const named = new Set(suggested.flatMap((s) => (s.listing ? [s.listing.key] : [])));
    /* NOR ONE ITS OWN SHELF ALREADY SHOWS (1 Nov): the four it picked were Money's first four, so Card alerts,
       Certificates, Count the cash and Debts stood twice on one screen. It offers what a folded shelf keeps out of
       sight, and says nothing when every shelf shows all it holds. */
    const shown = new Set(laid.shelves.flatMap((s) => s.items.slice(0, FOLDED_AT).map((l) => l.key)));
    return laid.shelves
      .flatMap((s) => s.items)
      .filter((l) => !shown.has(l.key))
      .filter((l) => l.kind === 'pack' && ours(l) && !named.has(l.key) && cueOf(l).cue === store.add)
      .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
      .slice(0, FEATURED_MOST);
  });

  /* ── reading ───────────────────────────────────────────────────────────── */

  /* A STORE THAT DID NOT ANSWER SAYS SO, WITH TRY AGAIN, and never as a store with nothing in it. */
  let retry = $state(false);
  /* THE SHELVES WAIT FOR THE STORE AND THE RECORD (verify6, 2 Nov): drawn from the starters first, a cold open then
     pushed them down twice, once for the chips row the store's shelves bring (0.36 of the phone's screen moved) and
     once for From BrainDog landing over them (0.08 at 1512). Until both have answered or refused, the chips row holds
     its place and the shelves are not drawn, so they arrive into empty room and nothing moves. */
  let recordRead = $state(false);
  const settled = $derived((kennel !== null || kennelRefused !== null) && recordRead);
  function readStore(): void {
    kennelRefused = null;
    void readHostCatalogue(fetch).then((got) => {
      if (got.ok) kennel = got.index;
      else {
        kennelRefused = got.fix;
        retry = got.retry === true;
      }
    });
  }

  /* SOMEBODY HELD TO PART OF THE RECORD (a contractor on one project) reaches this only by typing it, and every read of
     it is the whole record's: "This isn't shared with you", and nothing asked (collab pass 4). */
  const part = $derived(!!(page.data as { me?: unknown }).me && !may(page.data as unknown as Shell, 'read'));

  /* READ ONCE THE SHELL SAYS THE WHOLE RECORD IS THEIRS (verify5, 2 Nov): asked once on mount, a cold open met the shell
     before `boot` had said so, took the owner for somebody held to part of the record and never read the store, so a
     typed or reloaded Add-ons listed the starters alone. An effect starts the reads the first time `part` is false. */
  let reading = false;
  $effect(() => {
    if (part || reading) return;
    reading = true;
    untrack(start);
  });

  function start(): void {
    readStore();
    void readCounts(fetch).then((got) => (counts = got));
    void read(async () => {
      try {
        return await readRecord();
      } finally {
        recordRead = true;
      }
    });
  }

  async function readRecord(): Promise<boolean> {
    const client = createClient({ base: apiBase() });
    const chosen = await choose(client);
    if (!chosen.first.ok) return false;
    states = chosen.first.value;
    /* THE SIGNS AND THE OPEN QUESTIONS ARE ASKED AFTER, and a refusal of either is no suggestion, never an error here.
       AWAITED INSIDE THE READ, so the screen is drawn once with what it suggests: the phone was captured before they
       landed, and "Suggested for you" led on the laptop and was missing on the phone. */
    await Promise.allSettled([
      client
        .call<{ signs?: unknown }>('signs')
        .then((out) => (signs = out.ok && Array.isArray(out.value?.signs) ? (out.value.signs as SignRead[]) : null)),
      client.governance({ register: 'suggestion', status: 'open', limit: 50 }).then((out) => {
        const rows = out.ok && Array.isArray(out.value) ? (out.value as { question?: unknown }[]) : [];
        questions = rows.flatMap((r) => (typeof r.question === 'string' ? [r.question] : []));
      }),
    ]);
    return true;
  }
  $effect(() => drew('ready'));
</script>

<svelte:head><title>{titleOf(part ? copy.notShared.title : copy.packs)}</title></svelte:head>

<!-- ON A PHONE THE TWO WAYS ON SIT UNDER THE SENTENCE (1 Nov): beside it they squeezed "Each shows its plan before
     anything changes." into five lines of two words. -->
{#snippet ways()}
  <Button size="sm" href={INSTALLED_AT}>{words.yours}</Button>
  <!-- ANYBODY SIGNED IN MAY PUBLISH ONE: the form makes it from what they built, and it waits for review. -->
  <Button size="sm" weight="bare" href={addonHref}>{words.publish}</Button>
{/snippet}
{#if part}
  <PageHead title={copy.notShared.title} headless />
  <NotFound title={copy.notShared.title} body={copy.notShared.body} />
{:else}
<PageHead icon="packs" title={copy.packs} sentence={store.sentence} actions={phone.current ? undefined : ways}>
  {#snippet below()}{#if phone.current}<div class="ways">{@render ways()}</div>{/if}{/snippet}
</PageHead>

{#snippet card(l: Listing, hue: (typeof SHELF_SLOTS)[keyof typeof SHELF_SLOTS], note: string | null = null)}
  {@const c = cueOf(l)}
  <StoreCard title={l.title} line={l.summary} href={listingHref(l)} icon={iconOf(l)} {hue} ours={ours(l)} by={byOf(l)} cue={c.cue} held={c.held} {note} />
{/snippet}

<div class="page">
  <div class="tools">
    <div class="field find">
      <Icon name="search" size="s" />
      <input class="find-input" type="search" bind:value={query} aria-label={words.searchLabel} placeholder={words.searchHint} autocomplete="off" enterkeyhint="search" />
    </div>
    {#if !settled && !kennelRefused}
      <div class="chips-held" aria-hidden="true"></div>
    {:else if chips.length > 1}
      <Segmented class="chips" role="group" aria-label={words.categoriesLabel}>
        <button type="button" class="segment chip" aria-pressed={chip === null} data-on={chip === null ? '' : undefined} onclick={() => (picked = null)}>
          {store.all}<span class="n">{total}</span>
        </button>
        {#each chips as c (c.id)}
          <button type="button" class="segment chip" aria-pressed={chip === c.id} data-on={chip === c.id ? '' : undefined} onclick={() => (picked = chip === c.id ? null : c.id)}>
            {c.name}<span class="n">{c.count}</span>
          </button>
        {/each}
      </Segmented>
    {/if}
  </div>

  {#if kennelRefused}
    <Empty kind="error" title={kennelRefused}>
      {#snippet actions()}{#if retry}<Button onclick={readStore}>{copy.tryAgain}</Button>{/if}{/snippet}
    </Empty>
  {/if}

  <!-- A CHIP PRESSED CHANGES EVERY SHELF UNDER IT AT ONCE: the shelves shown fade out and the chosen one up in their place
       (`Swap`, skills pass 2 Nov), where they swapped in one frame. Keyed on the chip alone, so a search typed does not fade. -->
  {#if settled}
  <Swap key={chip}>
  <div class="shelves">
  {#if suggested.length > 0}
    <section class="part" aria-labelledby="store-suggested">
      <h2 class="part-h" id="store-suggested">{store.suggested}<span class="part-note">{store.suggestedNote}</span></h2>
      <ul class="cards three">
        {#each suggested as s (s.key)}
          <StoreCard
            title={s.title}
            line={s.line}
            href={s.href}
            icon={s.listing ? iconOf(s.listing) : 'trending-up'}
            hue={SHELF_SLOTS.money}
            ours={s.listing ? ours(s.listing) : true}
            by={s.listing ? byOf(s.listing) : null}
            cue={s.cue}
            why={s.why}
          />
        {/each}
      </ul>
    </section>
  {/if}

  {#if featured.length > 0}
    <section class="part" aria-labelledby="store-featured">
      <h2 class="part-h" id="store-featured">{store.featured}<span class="part-note">{store.featuredNote}</span></h2>
      <ul class="cards">
        {#each featured as l (l.key)}{@render card(l, SHELF_SLOTS[shelfOf(l)])}{/each}
      </ul>
    </section>
  {/if}

  {#if total === 0}
    <Empty kind="no-results" title={words.nothingFound} body={words.nothingFoundBody} />
  {/if}

  {#if (chip === null || chip === 'starters') && laid.starters.length + laid.examples.length > 0}
    <section class="part" aria-labelledby="store-starters">
      <h2 class="part-h" id="store-starters">{store.starters}<span class="part-note">{store.startersNote}</span></h2>
      <ul class="cards">
        {#each laid.starters as l (l.key)}{@render card(l, SHELF_SLOTS.starters, starterNote(l))}{/each}
        {#if laid.examples.length > 0 && !searching && chip === null}
          <li class="examples-card">
            <h3 class="ex-name"><IconWell name="grid" size="l" slot={SHELF_SLOTS.starters} /><span>{store.examples}</span></h3>
            <p class="ex-line">{store.examplesLine(laid.examples.map((l) => l.title))}</p>
            <div class="ex-foot">
              <Button size="sm" aria-expanded={examplesOpen} onclick={() => (examplesOpen = !examplesOpen)}>{examplesOpen ? store.hideExamples : store.seeExamples(laid.examples.length)}</Button>
            </div>
          </li>
        {/if}
        {#if examplesOpen || searching || chip === 'starters'}
          {#each laid.examples as l (l.key)}{@render card(l, SHELF_SLOTS.starters, store.examples)}{/each}
        {/if}
      </ul>
    </section>
  {/if}

  {#each laid.shelves as s (s.shelf)}
    {#if chip === null || chip === s.shelf}
      {@const fold = folded(s.shelf, s.items.length)}
      <section class="part" aria-labelledby="store-{s.shelf}">
        <h2 class="part-h" id="store-{s.shelf}">
          {SHELF_NAMES[s.shelf]}<span class="n num">{s.items.length}</span>
          {#if s.items.length > FOLDED_AT && !searching && chip === null}
            <span class="part-more"><Button weight="bare" size="sm" onclick={() => (opened = { ...opened, [s.shelf]: !opened[s.shelf] })}>{opened[s.shelf] ? store.showFewer : store.showAll}</Button></span>
          {/if}
        </h2>
        <ul class="cards" {@attach cardsIn(() => !searching)}>
          {#each fold ? s.items.slice(0, FOLDED_AT) : s.items as l (l.key)}{@render card(l, SHELF_SLOTS[shelfOf(l)])}{/each}
        </ul>
      </section>
    {/if}
  {/each}
  </div>
  </Swap>
  {/if}
</div>
{/if}

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    padding: var(--page-head-gap) var(--gutter) var(--page-bottom);
    min-inline-size: 0;
  }

  .shelves {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    min-inline-size: 0;
  }

  /* THE SEARCH AND THE SHELVES SHARE ONE ROW WHERE THEY FIT (L43), as a list's search and its slices do; where they do
     not (a laptop's 1280, a phone), the shelves wrap under the search. */
  .tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .tools > :global(.segmented) {
    flex-wrap: nowrap;
    max-inline-size: 100%;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
  }

  /* The chips row's room while the store is read: the Segmented's own height, and on a phone the whole row it wraps to. */
  .chips-held {
    min-block-size: 36px;
  }

  @media (width < 640px) {
    .chips-held {
      flex: 1 1 100%;
      min-block-size: 48px;
    }
  }

  .tools .chip {
    flex: none;
    white-space: nowrap;
  }

  /* ON A PHONE THE SHELVES ARE ONE STRIP THAT SCROLLS INSIDE ITSELF, fading at its end so a shelf past it reads as more
     to scroll to; they wrapped into three rows of chips over the first card. */
  @media (width < 640px) {
    .tools > :global(.segmented) {
      -webkit-mask-image: linear-gradient(to right, var(--ink) calc(100% - 28px), transparent);
      mask-image: linear-gradient(to right, var(--ink) calc(100% - 28px), transparent);
    }
  }

  .ways {
    display: flex;
    gap: var(--sp-2);
  }

  /* THE LIST SEARCH'S FIELD (L44): the shared `.field`, a fill with no edge; it was the only bordered field on a board.
     The store has no tile under it, so the fill is the tile's own, as a list's search fill reads against its tile. */
  /* A CAPSULE ON THE GROUND, as the category control beside it is (ops: controls are capsules): the tile's fill, a
     0.5px edge drawn inside, and the accent ring on focus. */
  .find {
    flex: 1 1 16rem;
    max-inline-size: 24rem;
    min-block-size: var(--ctl-page, 36px);
    padding-inline: 14px;
    background: var(--tile);
    border-radius: var(--r-pill, 999px);
    box-shadow: inset 0 0 0 0.5px var(--g-line, var(--rule)), var(--shadow-raised, none);
  }

  .find:focus-within {
    outline: none;
    box-shadow: 0 0 0 2px var(--focus-ring, var(--focus));
  }

  .find-input {
    flex: 1;
    align-self: stretch;
    min-inline-size: 0;
    min-block-size: var(--ctl-h);
    padding: 0;
    background: none;
    border: 0;
    appearance: none;
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-ctl);
  }

  .find-input:focus-visible {
    /* focus-ok: `.find:focus-within` above draws the ring on the wrapper, as a field's does. */
    outline: none;
  }

  .find-input::placeholder {
    color: var(--ink-3);
  }

  .find-input::-webkit-search-cancel-button {
    appearance: none;
    display: none;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    white-space: nowrap;
  }

  .n {
    color: var(--ink-3);
    font-weight: var(--fw-regular);
    font-variant-numeric: tabular-nums;
  }

  .part {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .part-h {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-head);
    font-weight: var(--fw-semi);
    line-height: var(--lead-head);
  }

  .part-note {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
    font-weight: var(--fw-regular);
  }

  .part-more {
    margin-inline-start: auto;
  }

  /* THE CARDS: one column on a phone, two from 640px, four from 1100px; the suggestions three. */
  .cards {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: stretch;
    gap: var(--tile-gap);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* THE EXAMPLE SETUPS: one card for the three, in the starters' grid. */
  .examples-card {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-inline-size: 0;
    padding: var(--sp-4);
    background: var(--tile);
    border-radius: var(--r-tile);
  }

  .ex-name {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: var(--fw-semi);
    line-height: 22px;
  }

  .ex-line {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .ex-foot {
    display: flex;
    justify-content: flex-end;
    margin-block-start: auto;
  }

  @media (pointer: coarse) {
    .find,
    .find-input {
      min-block-size: var(--tap);
    }

    .find-input {
      font-size: var(--fs-body);
    }
  }


  @media (width >= 640px) {
    .cards {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (width >= 1100px) {
    .cards {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .cards.three {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
</style>
