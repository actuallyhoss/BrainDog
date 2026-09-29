<!--
  `/search?q=`: the structured fallback when the palette's ranked list was not enough.

  `19 §2` NAMES THIS A SPINE SCREEN AND THE ROUTE DIRECTORY HAD NONE. The palette caps its record
  hits and, with a round-robin handing one per source per round, a small cap across nine sources is
  often one row per list. Without somewhere to overflow to, that cap had to be silent, and it was:
  eight hits, no count, no "and N more", on the surface `19 §4` makes the primary way to reach a row.

  IT IS THE SAME QUERY, GROUPED RATHER THAN RANKED. The palette interleaves so the first screenful
  spans the record; this keeps each list whole with its own count, because a person who has come here
  has already decided the ranked answer was not the one they wanted.

  GROUPED UNDER META HEADINGS, AS THE PALETTE GROUPS THEM. Each list that matched is a
  quiet heading in the meta step with its count, and its rows sit on the ground under it: a 32px well
  with the glyph of what it is, the title, and one line saying where it sits or why it matched. The
  row is drawn here and not through the palette's `Result`, which is an option inside glass; here it
  is a link on the ground. When the matches span two lists or more, one tile says where they are, as
  bars, with the line that reads them.

  THE ANSWER IS THE RECORD'S, through `search-live.ts`, and a record that turns the search away says why.

  THE QUERY IS IN THE URL because it is what you are looking at (`19 §5`), which also makes a result
  page a thing you can send somebody. The field writes it back with `replaceState`, throttled, for
  the reason the register's search box does: seven characters is not seven places you have been.
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import { onDestroy, untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { page as route } from '$app/state';
  import { titleOf } from '$lib/title.ts';
  import { copy } from '$lib/copy.ts';
  import type { SearchResult } from '$lib/record/api.ts';
  import { searcher, type Found, type Searcher } from '$lib/record/search-live.ts';
  import { shownState } from './shown.ts';
  import { sentenceOf, topOf, whereSaid } from './shown.ts';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import Bars from '$lib/viz/Bars.svelte';
  import { closed, drew, opened } from '../../lib/ui/screen.svelte.ts';

  /* THIS SCREEN'S OWN WORDS, beside it rather than in the copy aggregate, which this unit does not hold. */
  const words = {
    showAll: (n: number) => `Show all ${n.toLocaleString('en')}`,
    where: 'Where it matched',
    whereSubject: 'Matches by list',
  } as const;

  const q = $derived(route.url.searchParams.get('q') ?? '');

  /* ONE READ PER ADDRESS, and the address is written at most every 150 ms below, so typing is not a
     request per key. An answer to a query that has since changed is dropped. The PAGE caps what it
     draws per list and says where the rest is; the record caps its own answer at a hundred. */
  let finder: Searcher | null = null;
  let answer = $state<Found | null>(null);
  /* WHICH QUERY `answer` WAS COMPUTED FOR. Without it a verdict computed for the last query is
     printed under the words in the box now: `copy.searchNone(q)` interpolates what is being typed
     into a conclusion about something else, and then tells the reader to check their spelling. */
  let answeredFor = $state<string | null>(null);
  let asked = 0;

  async function ask(want: string) {
    const mine = ++asked;
    const at = opened();
    finder ??= searcher(apiBase());
    const out = await finder.find(want);
    closed(mine !== asked || out.from !== 'refused', at);
    if (mine === asked) {
      answer = out;
      answeredFor = want;
    }
  }

  $effect(() => {
    const want = q;
    untrack(() => void ask(want));
  });

  const NOTHING: SearchResult = { hits: [], total: 0, groups: [] };
  const found = $derived(answer && answer.from !== 'refused' ? answer.value : NOTHING);
  /* THE FIVE ARMS, DECIDED IN ONE PLACE. A list of hits is content and a reader can see it is about
     something, so hits from the last query stay while the next answer is out; a verdict is a claim
     about the words in the box, so it waits. `shown.ts` says which arm, and is where the rule is
     held to a test. */
  const shown = $derived(shownState(q, answer, answeredFor));

  /* THE SENTENCE AND THE TILE ARE THE ANSWER'S, and only once the answer on screen has hits: a verdict or a wait says
     nothing about where anything matched. `top` is the list with strictly the most, and no list on a tie. */
  const sentence = $derived(shown === 'hits' ? (sentenceOf(q, found) ?? undefined) : undefined);
  const top = $derived(topOf(found.groups));
  const bars = $derived(found.groups.map((g) => ({ label: g.kind, value: g.total, tone: g === top ? 'ink' : undefined })));

  /* TEN A LIST. Enough to recognise the one you meant, few enough that nine matching lists is a page
     rather than a scroll, and every list carries the way to its own remainder. */
  const PER_LIST = 10;

  /* THE GROUPS OPENED IN PLACE, by their heading. A list's remainder is its own screen, filtered by
     what was typed; the decisions and the pages have no such screen, and every one of them that
     matched is already in hand (`search-live.ts` matches both in full), so "Show all" draws the rest
     here instead.

     HELD WITH THE QUERY IT WAS OPENED FOR, because a group opened for one search is not a request to
     draw every decision the next search finds: typing a new word folds every group back to ten. */
  let whole = $state<{ q: string; kinds: ReadonlySet<string> }>({ q: '', kinds: new Set() });
  const isWhole = (kind: string): boolean => whole.q === q && whole.kinds.has(kind);
  function openGroup(kind: string) {
    whole = { q, kinds: new Set([...(whole.q === q ? whole.kinds : []), kind]) };
  }

  /* THROTTLED `replaceState`, which `19 §5` asks for by name: *"pushState for discrete intent so
     Back undoes a filter, throttled replaceState for typing"*. A history entry per keystroke makes
     Back a character-by-character rewind of something nobody thinks of as navigation.

     AND IT IS CANCELLED WHEN THE PAGE GOES. Typing here and clicking Home inside the 150 ms landed
     on `/?q=…`, the home screen wearing a query it has no box for. A pending write to a URL
     belongs to the page that scheduled it and to no other. */
  let pending: ReturnType<typeof setTimeout> | undefined;
  onDestroy(() => clearTimeout(pending));

  let box = $state<HTMLInputElement | null>(null);

  /* Empties the box and the address, and leaves the caret in the box for the next try. */
  function clearSearch() {
    if (box) box.value = '';
    typed('');
    box?.focus();
  }

  function typed(value: string) {
    clearTimeout(pending);
    pending = setTimeout(() => {
      const next = new URLSearchParams(route.url.searchParams);
      if (value) next.set('q', value);
      else next.delete('q');
      void goto(`?${next}`, { replaceState: true, noScroll: true, keepFocus: true });
    }, 150);
  }

  /**
   * DRAWN ONCE AN ANSWER HAS COME BACK, the record's or the sample's.
   *
   * `data-screen` on `<main id="main">` is what lets anything outside the page tell a drawn screen
   * from a shell that has fetched nothing. Four browser gates waited on `#main` having a child,
   * with the wait swallowed by a `catch`, which is satisfied by a page heading and means nothing
   * the day a screen fetches. `Empty` says `empty` or `refused` for the states it draws; this is
   * the other claim. The read is bracketed by `opened()` and `closed()`, so a call still out takes
   * the attribute away whatever this line says.
   */
  $effect(() => {
    if (answer && answer.from !== 'refused') drew('ready');
  });
</script>

<svelte:head><title>{titleOf(q || copy.search)}</title></svelte:head>

<PageHead title={copy.search} count={q ? found.total : undefined} {sentence} />

<div class="page">
  <!-- THE FIELD ON THE GROUND, first under the sentence: 44 tall on the soft well, the glyph inside the label and the
       input taking the rest. It is the fallback when the rail's Ask was not enough, so it is here on every visit. -->
  <label class="field field-lg search-field">
    <Icon name="search" size="m" />
    <!-- A NAME, NOT A PLACEHOLDER: the placeholder disappears the moment somebody types, taking the
         accessible name with it. Every search box in the product has the same shape. -->
    <input
      bind:this={box}
      class="field-input"
      type="search"
      aria-label={copy.searchRecord}
      placeholder={copy.searchRecord}
      value={q}
      oninput={(e) => typed((e.currentTarget as HTMLInputElement).value)}
    />
  </label>

  {#if shown === 'idle'}
    <!-- NOT AN ERROR AND NOT A RESULT. Arriving here with no query is the ordinary way in from the
         nav, and `19 §6`'s `no-data-yet` is the state for a surface waiting on you rather than on
         the record. -->
    <Empty kind="no-data-yet" glyph="search" title={copy.searchWaiting} body={copy.searchWhere} />
  {:else if shown === 'waiting'}
    <!-- Bars until the first answer, holding the shape the results will take. -->
    <Waiting />
  {:else if shown === 'refused' && answer?.from === 'refused'}
    <Empty kind="error" title={answer.fix}>
      {#snippet actions()}<Button onclick={() => location.reload()}>{copy.tryAgain}</Button>{/snippet}
    </Empty>
  {:else if shown === 'none'}
    <Empty kind="no-results" title={copy.searchNone(q)} body={copy.searchNoneNext}>
      {#snippet actions()}
        <Button weight="primary" onclick={clearSearch}>{copy.searchClear}</Button>
        <Button weight="bare" href="/audit">{copy.searchInHistory}</Button>
      {/snippet}
    </Empty>
  {:else}
    <div class="results" data-split={found.groups.length >= 2 ? '' : undefined}>
      <!-- WHERE IT MATCHED, ONLY WHEN THERE IS A WHERE: a single list is its own heading already. The list holding
           most is the ink bar and the rest are greys; a tie at the top highlights none. First in the order a phone
           reads, and beside the lists from a desk's width. -->
      {#if found.groups.length >= 2}
        <div class="side">
          <Tile icon="search" title={words.where} count={found.total.toLocaleString('en')}>
            <Bars items={bars} subject={words.whereSubject} />
            <p class="reading">{whereSaid(found)}</p>
          </Tile>
        </div>
      {/if}

      <div class="groups">
        {#each found.groups as group, gi (group.kind)}
          {@const all = isWhole(group.kind)}
          <section class="group" aria-labelledby="search-group-{gi}">
            <div class="group-head">
              <h2 class="group-title" id="search-group-{gi}">
                {group.kind}<span class="group-count num">{group.total.toLocaleString('en')}</span>
              </h2>
              <!--
                EVERY CAPPED GROUP OFFERS THE REST, whether or not it has a screen of its own.

                This was `group.href && group.total > PER_LIST`, and the questions group's `href` is `null`
                by construction, because `/decide` is not a filtered list. So with fourteen matching
                decisions the page drew *Decide 14*, ten rows, and nothing: four rows dropped in silence, on
                the screen built because the palette dropped rows in silence.

                A list's rest is that list, filtered by what was typed, which also holds the rows past the
                record's ceiling on a search. The decisions and the pages are all in hand, so theirs opens
                here, and the count on the button is what it will draw.
              -->
              {#if group.href && group.total > PER_LIST}
                <Button weight="bare" size="sm" href={group.href}>{words.showAll(group.total)}</Button>
              {:else if !group.href && !all && group.hits.length > PER_LIST}
                <Button weight="bare" size="sm" onclick={() => openGroup(group.kind)}>{words.showAll(group.hits.length)}</Button>
              {/if}
            </div>
            <ul class="ledger ledger-lead hits">
              {#each all ? group.hits : group.hits.slice(0, PER_LIST) as hit (hit.href)}
                <li>
                  <!-- THE ROW SAYS WHY IT IS HERE. `nordhaven` draws four services named after none of it, because
                       `services.provider` is declared searchable, and the reason is what makes that readable. A row
                       the record sends with nothing beside its title says the list it is in, which is what a person
                       calls it. -->
                  <a class="line line-tall hit" href={at(hit.href)}>
                    <IconWell name={hit.icon} size="l" />
                    <span class="line-main">
                      <span class="line-title" dir="auto">{hit.title}</span>
                      <span class="line-detail" dir="auto">{hit.why ?? (hit.detail || hit.kind)}</span>
                    </span>
                  </a>
                </li>
              {/each}
            </ul>
          </section>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .page {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    padding: var(--sp-5) var(--gutter) var(--sp-9);
    max-inline-size: var(--page-max);
  }

  /* THE FIELD IS `controls.css`'s: the soft well with no border, 44 tall at `field-lg`, radius 12, and the ink ring on
     the wrapper while the input inside it has focus. As wide as the palette, since it is the palette's question asked
     again. */
  .search-field {
    max-inline-size: 640px;
  }

  /* SIXTEEN PIXELS AT EVERY WIDTH, as every input in the product is, so a phone does not zoom the page
     when the field is pressed. */
  .search-field .field-input {
    font-size: var(--t-md);
  }

  /* The ring is not deleted, it MOVES to the box that looks like the field (`controls.css`, `.field:focus-within`). */
  .field-input:focus-visible {
    /* focus-ok: the caret indicates focus, and `.field:focus-within` carries the state change for
       the box the reader actually sees. */
    outline: none;
    box-shadow: none;
  }

  /* ONE COLUMN, the tile first and the lists under it. From a desk's width the lists take the room and the tile stands
     beside them, held in view while they scroll. Measured on the page's own width, so a docked panel narrows it too. */
  .results {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-5);
    align-items: start;
  }

  @container (inline-size >= 820px) {
    .results[data-split] {
      grid-template-columns: minmax(0, 1fr) minmax(280px, 340px);
      column-gap: var(--sp-6);
    }

    .results[data-split] .side {
      position: sticky;
      inset-block-start: calc(var(--inset) + 56px);
      grid-column: 2;
      grid-row: 1;
    }

    .results[data-split] .groups {
      grid-column: 1;
      grid-row: 1;
    }
  }

  /* THE ONE LINE THAT READS THE CHART, under it. */
  .reading {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 20px;
  }

  .groups {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    min-inline-size: 0;
  }

  /* A META HEADING OVER EACH LIST, AS THE PALETTE HEADS ITS GROUPS: the meta step at 500 in the lowest text
     ink, its count beside it, and the way to the rest at the far end. */
  .group-head {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: var(--ctl-h-sm);
    margin-block-end: var(--sp-1);
  }

  .group-title {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    min-inline-size: 0;
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 500;
    line-height: 18px;
  }

  .group-count {
    font-variant-numeric: tabular-nums;
  }

  .group-head :global(.btn) {
    margin-inline-start: auto;
  }

  /* A HIT IS A ROW ON THE GROUND: its well, its title over its line, and the rounded wash under the pointer. The shared
     card layout under 640 puts the words under the lead; a hit keeps its well beside both lines at every width. */
  .hit {
    grid-template-columns: var(--well-l) minmax(0, 1fr);
  }

  @media (width < 640px) {
    .hit .line-main {
      grid-column: 2;
      grid-row: 1;
    }
  }
</style>
