<!--
  `/search?q=` — the structured fallback when the palette's ranked list was not enough.

  `19 §2` NAMES THIS A SPINE SCREEN AND THE ROUTE DIRECTORY HAD NONE. The palette caps its record
  hits and, with a round-robin handing one per source per round, a small cap across nine sources is
  often one row per list. Without somewhere to overflow to, that cap had to be silent — and it was:
  eight hits, no count, no "and N more", on the surface `19 §4` makes the primary way to reach a row.

  IT IS THE SAME QUERY, GROUPED RATHER THAN RANKED. The palette interleaves so the first screenful
  spans the record; this keeps each list whole with its own count, because a person who has come here
  has already decided the ranked answer was not the one they wanted.

  THE ANSWER IS THE RECORD'S, through `search-live.ts`, and the sample's when there is no record here.

  THE QUERY IS IN THE URL because it is what you are looking at (`19 §5`), which also makes a result
  page a thing you can send somebody. The field writes it back with `replaceState`, throttled, for
  the reason the register's search box does: seven characters is not seven places you have been.
-->
<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { page as route } from '$app/state';
  import { titleOf } from '$lib/title.ts';
  import { copy } from '$lib/copy.ts';
  import type { SearchResult } from '$lib/record/api.ts';
  import { searcher, type Found, type Searcher } from '$lib/record/search-live.ts';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Section from '$lib/ui/Section.svelte';
  import { closed, drew, opened } from '../../lib/ui/screen.svelte.ts';

  const q = $derived(route.url.searchParams.get('q') ?? '');

  /* ONE READ PER ADDRESS, and the address is written at most every 150 ms below, so typing is not a
     request per key. An answer to a query that has since changed is dropped. The PAGE caps what it
     draws per list and says where the rest is; the record caps its own answer at a hundred. */
  let finder: Searcher | null = null;
  let answer = $state<Found | null>(null);
  let asked = 0;

  async function ask(want: string) {
    const mine = ++asked;
    const at = opened();
    finder ??= searcher(location.origin);
    const out = await finder.find(want);
    closed(mine !== asked || out.from !== 'refused', at);
    if (mine === asked) answer = out;
  }

  $effect(() => {
    const want = q;
    untrack(() => void ask(want));
  });

  const NOTHING: SearchResult = { hits: [], total: 0, groups: [] };
  const found = $derived(answer && answer.from !== 'refused' ? answer.value : NOTHING);

  /* TEN A LIST. Enough to recognise the one you meant, few enough that nine matching lists is a page
     rather than a scroll — and every list carries the door to its own remainder. */
  const PER_LIST = 10;

  /* THROTTLED `replaceState`, which `19 §5` asks for by name: *"pushState for discrete intent so
     Back undoes a filter, throttled replaceState for typing"*. A history entry per keystroke makes
     Back a character-by-character rewind of something nobody thinks of as navigation.

     AND IT IS CANCELLED WHEN THE PAGE GOES. Typing here and clicking Home inside the 150 ms landed
     on `/?q=…` — the home screen wearing a query it has no box for. A pending write to a URL
     belongs to the page that scheduled it and to no other. */
  let pending: ReturnType<typeof setTimeout> | undefined;
  onDestroy(() => clearTimeout(pending));

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
      class="field-input"
      type="search"
      aria-label={copy.searchRecord}
      placeholder={copy.searchRecord}
      value={q}
      oninput={(e) => typed((e.currentTarget as HTMLInputElement).value)}
    />
  </label>

  {#if !q}
    <!-- NOT AN ERROR AND NOT A RESULT. Arriving here with no query is the ordinary way in from the
         nav, and `19 §6`'s `no-data-yet` is the state for a surface waiting on you rather than on
         the record. -->
    <Empty kind="no-data-yet" glyph="search" title={copy.searchWaiting} body={copy.searchWhere} />
  {:else if !answer}
    <!-- Bars until the first answer, so the sample never shows over a live record. -->
    <Waiting />
  {:else if answer.from === 'refused'}
    <Empty kind="error" title={answer.fix} />
  {:else if found.total === 0}
    <Empty kind="no-results" title={copy.searchNone} query={q}>
      {#snippet actions()}<Button href="/">{copy.home}</Button>{/snippet}
    </Empty>
  {:else}
    {#each found.groups as group}
      <Section title={group.kind} count={group.total}>
        <!--
          A CAPPED GROUP SAYS SO WHETHER OR NOT IT HAS A DOOR.

          This was `group.href && group.total > PER_LIST`, and the questions group's `href` is `null`
          by construction — `/decide` is not a filtered list. So with fourteen matching decisions the
          page drew *Decide 14*, ten rows, and nothing: four rows dropped in silence, on the screen
          built because the palette dropped rows in silence. Latent on the shipped seed and live from
          the eleventh decision.

          The door is still a link where there is one. Where there is not, the same fact is a
          sentence — which is all the reader needed: not *where the rest is*, but *that there is a
          rest*.
        -->
        {#snippet aside()}
          {#if group.total > PER_LIST}
            {#if group.href}
              <a class="all" href={group.href}>{copy.allIn(group.total, group.kind)}<Icon name="arrow" size="s" /></a>
            {:else}
              <span class="all all-noway">{copy.showingOf(PER_LIST, group.total)}</span>
            {/if}
          {/if}
        {/snippet}
        <ul class="ledger">
          {#each group.hits.slice(0, PER_LIST) as hit (hit.href)}
            <li>
              <a class="line hit" href={hit.href}>
                <span class="line-main">
                  <span class="line-title">{hit.title}</span>
                </span>
                {#if hit.spoken}<span class="hit-id">{hit.spoken}</span>{/if}
                <!-- WHY IT IS HERE, and this page needed it more than the palette did. `nordhaven`
                     draws four services named after none of it, because `services.provider` is
                     declared searchable — and this column showed the state instead. The palette got
                     the fix and the results page, which is where somebody goes when the palette's
                     ranked list was not enough, did not. -->
                <span class="line-when">{hit.why ?? hit.detail}</span>
              </a>
            </li>
          {/each}
        </ul>
      </Section>
    {/each}
  {/if}
</div>

<style>
  /* THE SAME PLACE AND NOT THE SAME AFFORDANCE. A count that is not a link must not be underlined,
     coloured as one, or take the pointer — `13 §5.2`: a control is a control, and the corollary is
     that a thing which is not one may not dress as one. */
  .all-noway {
    color: var(--dim);
    text-decoration: none;
    cursor: default;
  }

  /* A RESULT LEADS WITH WHAT IT IS CALLED. The group heading already names the kind, so the type
     glyph and a fixed id column down the left only pushed every title a sixth of the way across. The
     id follows as a quiet column, and why it matched closes the row. */
  .hit {
    grid-template-columns: minmax(0, 1fr) auto minmax(8ch, auto);
  }

  .hit-id {
    color: var(--dim);
    font-size: var(--t-sm);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  /* A BLOCK, SO THE ELLIPSIS IS AT THE END. `rows.css` makes this cell a flex row packed to the end,
     and a sentence longer than the column overflowed out of its START: a skill's trigger read
     ". It adds the outline and kerning checks", with its first half cut off and no mark that it was. */
  .hit :global(.line-when) {
    display: block;
    max-inline-size: 36ch;
    overflow: hidden;
    text-align: end;
    text-overflow: ellipsis;
  }

  /* ON A PHONE, ONE LINE OF TITLE AND A SECOND OF FACTS, rather than the three-line spine card. */
  @media (width < 640px) {
    .hit {
      grid-template-columns: auto minmax(0, 1fr);
      gap: var(--sp-1) var(--sp-3);
    }

    .hit .line-main {
      grid-column: 1 / -1;
      grid-row: 1;
    }

    .hit-id {
      grid-column: 1;
      grid-row: 2;
    }

    .hit :global(.line-when) {
      grid-column: 2;
      grid-row: 2;
      text-align: start;
    }
  }

  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    padding: var(--sp-5) var(--gutter) var(--sp-9);
    max-inline-size: 1360px;
  }

  /* The register's own search field, which is where this shape comes from — one box, one icon
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
    font-size: var(--t-ui);
  }

  /* The ring is not deleted, it MOVES to the box that looks like the field: `.field:focus-within`
     below tints the border, so the state change is still visible and belongs to the right element.
     `css-rules` caught this the moment the route existed, which is the gate doing its job — the
     first version stripped the outline with no reason beside it. */
  .field-input:focus-visible {
    /* focus-ok: the caret indicates focus, and `.field:focus-within` carries the state change for
       the box the reader actually sees. */
    outline: none;
  }

  .field:focus-within {
    border-color: var(--accent);
  }

  /* The same shape a capped backlink list uses on a row page: a count and an arrow, at the end of
     the heading it belongs to. */
  .all {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    color: var(--dim);
    font-size: var(--t-xs);
    text-decoration: none;
  }

  .all:hover {
    color: var(--ink);
  }
</style>
