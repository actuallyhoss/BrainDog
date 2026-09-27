<!--
  `/search?q=`: the structured fallback when the palette's ranked list was not enough.

  `19 §2` NAMES THIS A SPINE SCREEN AND THE ROUTE DIRECTORY HAD NONE. The palette caps its record
  hits and, with a round-robin handing one per source per round, a small cap across nine sources is
  often one row per list. Without somewhere to overflow to, that cap had to be silent, and it was:
  eight hits, no count, no "and N more", on the surface `19 §4` makes the primary way to reach a row.

  IT IS THE SAME QUERY, GROUPED RATHER THAN RANKED. The palette interleaves so the first screenful
  spans the record; this keeps each list whole with its own count, because a person who has come here
  has already decided the ranked answer was not the one they wanted.

  AND THE SAME RESULT (design SYS-13). A hit is the palette's `Result`: its glyph, its title and one
  line saying where it sits. It was a title with a row number a column away from it, which is an id
  where a person reads and a thousand pixels between two halves of one thing at 1440.

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
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Section from '$lib/ui/Section.svelte';
  import Result from '$lib/palette/Result.svelte';
  import { closed, drew, opened } from '../../lib/ui/screen.svelte.ts';

  /* THIS SCREEN'S OWN WORDS, beside it rather than in the copy aggregate, which this unit does not hold. */
  const words = {
    showAll: (n: number) => `Show all ${n.toLocaleString('en')}`,
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

<PageHead icon="search" title={copy.search} count={q ? found.total : undefined} />

<div class="page">
  <label class="field">
    <Icon name="search" size="s" />
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
    {#each found.groups as group}
      {@const all = isWhole(group.kind)}
      <Section title={group.kind} count={group.total}>
        <!--
          EVERY CAPPED GROUP OFFERS THE REST, whether or not it has a screen of its own (design DSN-10).

          This was `group.href && group.total > PER_LIST`, and the questions group's `href` is `null`
          by construction, because `/decide` is not a filtered list. So with fourteen matching
          decisions the page drew *Decide 14*, ten rows, and nothing: four rows dropped in silence, on
          the screen built because the palette dropped rows in silence.

          A list's rest is that list, filtered by what was typed, which also holds the rows past the
          record's ceiling on a search. The decisions and the pages are all in hand, so theirs opens
          here, and the count on the button is what it will draw.
        -->
        {#snippet aside()}
          {#if group.href && group.total > PER_LIST}
            <Button weight="bare" href={group.href}>{words.showAll(group.total)}</Button>
          {:else if !group.href && !all && group.hits.length > PER_LIST}
            <Button weight="bare" onclick={() => openGroup(group.kind)}>{words.showAll(group.hits.length)}</Button>
          {/if}
        {/snippet}
        <ul class="hits">
          {#each all ? group.hits : group.hits.slice(0, PER_LIST) as hit (hit.href)}
            <li>
              <!-- THE PALETTE'S RESULT, AND WHY IT IS HERE AS ITS LINE. `nordhaven` draws four services
                   named after none of it, because `services.provider` is declared searchable, and the
                   reason is what makes that readable. A row the record sends with nothing beside its
                   title says the list it is in, which is what a person calls it (design SYS-3). -->
              <a class="hit" href={at(hit.href)}>
                <Result icon={hit.icon} title={hit.title} line={hit.why ?? (hit.detail || hit.kind)} />
              </a>
            </li>
          {/each}
        </ul>
      </Section>
    {/each}
  {/if}
</div>

<style>
  /**
   * ROWS ON THE PAGE WITH A HAIRLINE BETWEEN THEM AND NOTHING AROUND THEM (design brief §5).
   *
   * At desktop width the rows reach a step past the text column on both sides, so a title lines up
   * with the heading above it and the hover wash has somewhere to be. On a phone they do not: that
   * step put every divider 4px from the screen's edge while the field and the words sat on the 16px
   * gutter, and a phone has no hover for the step to make room for.
   */
  .hits {
    margin: 0 calc(-1 * var(--sp-3));
    padding: 0;
    list-style: none;
  }

  .hits > li + li {
    border-block-start: 1px solid var(--line-soft);
  }

  /* A TABLE ROW WITH A FINE POINTER, 44px WITH A COARSE ONE, AND 56px ON A PHONE, where `Result`
     draws the title over its line. What the row shows is `Result`'s; this is only the link around it. */
  .hit {
    display: flex;
    align-items: center;
    min-block-size: var(--table-row-h);
    padding: var(--sp-1) var(--sp-3);
    color: var(--ink);
    text-decoration: none;
    transition: background var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .hit:hover {
      background: var(--hover-wash);
    }
  }

  @media (pointer: coarse) {
    .hit {
      min-block-size: var(--tap);
    }
  }

  @media (width < 640px) {
    .hits {
      margin-inline: 0;
    }

    .hit {
      min-block-size: var(--row-h-2);
      padding-inline: 0;
    }
  }

  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    padding: var(--sp-5) var(--gutter) var(--sp-9);
    max-inline-size: var(--page-max);
  }

  /* The register's own search field, which is where this shape comes from: one box, one icon
     inside the label, and the input taking the rest. */
  .field {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    max-inline-size: 44ch;
    padding: 0 var(--sp-3);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    color: var(--dim);
  }

  .field-input {
    flex: 1;
    min-inline-size: 0;
    min-block-size: var(--ctl-h);
    padding: 0;
    background: none;
    border: 0;
    color: var(--ink);
    font: inherit;
    /* SIXTEEN PIXELS AT EVERY WIDTH, as every input in the product is (design brief §5), so a phone
       does not zoom the page when the field is pressed. */
    font-size: var(--t-md);
  }

  /* The ring is not deleted, it MOVES to the box that looks like the field: `.field:focus-within`
     below tints the border, so the state change is still visible and belongs to the right element.
     `css-rules` caught this the moment the route existed, which is the gate doing its job: the
     first version stripped the outline with no reason beside it. */
  .field-input:focus-visible {
    /* focus-ok: the caret indicates focus, and `.field:focus-within` carries the state change for
       the box the reader actually sees. */
    outline: none;
    box-shadow: none;
  }

  /* `.field:focus-within` is `controls.css`'s, shared with every field. */
</style>
