<!--
  Every write, by whom, against which version.

  Of four comparable products surveyed, three ship a MUTABLE history: one has a "Clear revision
  history" button whose result cannot be retrieved, one lets authors delete published updates, and
  one never claims append-only. This one is append-only BY CONSTRUCTION, because there is one write
  path — not because a policy says so (20 §9).

  Which is why there is no delete control on this screen and no filter that can hide a row. A
  history you can edit is a history, and a history you cannot is a record.
-->
<script lang="ts">
  import { titleOf } from '$lib/title.ts';
  import { goto } from '$app/navigation';
  import { page as route } from '$app/state';
  import Button from '$lib/ui/Button.svelte';
  import { since } from 'braindog-render';
  import { copy } from '$lib/copy.ts';
  import { AUDIT, DOM_CAP, NOW, PAGES, actorOf } from '$lib/record/api.ts';
  import { CapLine } from 'braindog-render/svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import type { IconName } from '$lib/ui/icons.ts';

  /**
   * What an event kind is called, and what it looks like.
   *
   * `entry.create` and `declaration.set` are the write path's own vocabulary. They are precise and
   * they are not English, and this is the one screen a person opens to answer "what happened",
   * which is a question in English. The id stays the thing the log is keyed on; the word beside it
   * is what the reader came for.
   */
  const KIND: Record<string, { word: string; icon: IconName }> = {
    'entry.create': { word: 'Created', icon: 'plus' },
    'entry.update': { word: 'Changed', icon: 'edit' },
    'entry.archive': { word: 'Archived', icon: 'archive' },
    'question.open': { word: 'Asked', icon: 'decide' },
    'question.decide': { word: 'Decided', icon: 'check' },
    /* `Page changed` READ AS A VERB PHRASE ONCE THE TARGET BECAME A TITLE: "Page changed Overview".
       Every sibling row is "Created services#6" or "Changed obligations#1" — verb first, then what
       it was done to. */
    'declaration.set': { word: 'Changed the page', icon: 'doc' },
    'pack.install': { word: 'Installed', icon: 'packs' },
  };

  const kindOf = (k: string) => KIND[k] ?? { word: k.replace(/[.]/g, ' '), icon: 'doc' as IconName };

  /**
   * WHAT IT WAS DONE TO. A spoken id stays a spoken id — `services#6` is the product's own way of
   * naming a row out loud, and `19 §2` is explicit that a row has a number you can say. What does
   * not stay is `page.money`, which is a DECLARATION id: the page has a title, every other screen
   * uses it, and this was the one place printing the key instead.
   */
  const targetOf = (target: string): string => {
    const page = /^page\.([a-z0-9_-]+)$/.exec(target);
    return page ? (PAGES[page[1]!]?.title ?? target) : target;
  };

  /**
   * Where a target goes when you click it.
   *
   * Every `target` in this log is already a SPOKEN ID — `services#6`, `SG31`, `page.money` — which
   * is the whole point of having them, so the resolver at `/[id]` takes almost all of them without
   * a table here. `page.x` is the exception: a declaration is not a row, and it has its own route.
   *
   * `encodeURIComponent`, and not because of spaces. `#` in a URL starts the FRAGMENT, so
   * `/services#6` navigates to `/services` and scrolls to an anchor that does not exist. The
   * resolver decodes it on the other side.
   */
  const href = (target: string): string => {
    const page = /^page\.([a-z0-9_]+)$/.exec(target);
    return page ? `/p/${page[1]}` : `/${encodeURIComponent(target)}`;
  };

  /**
   * WHO, AND WHAT KIND OF CHANGE. The two questions this screen exists to answer.
   *
   * IT HAD NO CONTROLS AT ALL. Eight rows, a footer saying the record is at version 4,192, and
   * nothing on the page to reach any of the other four thousand — no search, no actor, no kind, no
   * range, no pagination. So the surface stated a number and then refused to let anybody use it,
   * which is worse than not stating it: "who changed obligations#1 last month" is the whole job of
   * an audit log and it could not be done.
   *
   * IN THE URL, LIKE EVERY OTHER FILTER IN THIS PRODUCT. `19 §5`: what defines which rows you are
   * looking at must be shareable, and "what did the renewal rule do" is exactly the thing somebody
   * pastes into a message.
   *
   * AND THEY APPEAR WHEN THERE IS SOMETHING TO CHOOSE BETWEEN. One actor is not a filter; it is a
   * fact, and a control offering it is a control that cannot change anything.
   */
  const actors = $derived([...new Set(AUDIT.map((e) => e.by))]);
  const kinds = $derived([...new Set(AUDIT.map((e) => e.kind))]);

  const who = $derived(route.url.searchParams.get('by') ?? '');
  const what = $derived(route.url.searchParams.get('kind') ?? '');

  const matched = $derived(AUDIT.filter((e) => (!who || e.by === who) && (!what || e.kind === what)));
  /* THE LOG GROWS WITH WRITES, NOT WITH ROWS, so on a record of any size this is the longest list in
     the product — and it was the one rendering every entry it held. `13 §4.3`'s cap, and the line
     that admits it. */
  const shown = $derived(matched.slice(0, DOM_CAP));

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(route.url.searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    void goto(`?${next}`, { replaceState: false, noScroll: true, keepFocus: true });
  };
</script>

<svelte:head><title>{titleOf(copy.audit)}</title></svelte:head>

<PageHead icon="history" title={copy.audit} count={matched.length} total={AUDIT.length} />

<div class="page">
  <!-- A CHOICE APPEARS WHEN THERE IS ONE TO MAKE. Two actors and two kinds is a filter; one of
       either is a fact about the record, and a segmented control over it changes nothing. -->
  {#if actors.length > 1 || kinds.length > 1}
    <div class="bar">
      {#if actors.length > 1}
        <div class="segmented" role="group" aria-label={copy.auditWho}>
          {#each actors as a}
            <button
              type="button"
              class="segment"
              data-on={who === a ? '' : undefined}
              aria-pressed={who === a ? 'true' : 'false'}
              onclick={() => setParam('by', who === a ? '' : a)}
            >
              {actorOf(a)}
            </button>
          {/each}
        </div>
      {/if}

      {#if kinds.length > 1}
        <div class="segmented" role="group" aria-label={copy.auditWhat}>
          {#each kinds as k}
            <button
              type="button"
              class="segment"
              data-on={what === k ? '' : undefined}
              aria-pressed={what === k ? 'true' : 'false'}
              onclick={() => setParam('kind', what === k ? '' : k)}
            >
              {kindOf(k).word}
            </button>
          {/each}
        </div>
      {/if}

      {#if who || what}
        <Button weight="bare" href="/audit"><Icon name="close" size="s" />{copy.clearFilters}</Button>
      {/if}
    </div>
  {/if}

  <!--
    THE SAME FIVE STATES EVERY OTHER LIST DRAWS, and this drew a grey sentence.

    `/audit?by=codex&kind=entry.create` gave a header reading `0 of 8` and one line — "Nothing in
    the log matches that." — which names neither the actor nor the kind. `19 §6` for `no-results`
    says quote the query verbatim, and the register gets it exactly right on the same record:
    `38 rows, none matching: zzzzz`, the term in a code chip, Clear filters inside the state.

    AND THE OTHER HALF WAS UNREACHABLE. `grep -c "<Empty"` on this file was 0, so a log with nothing
    in it — which is every record for about a minute — had the same sentence as a filter that missed:
    `no-data-yet` and `no-results` collapsed, which `19 §6` calls the failure.
  -->
  {#if matched.length === 0}
    <Empty
      kind={AUDIT.length === 0 ? 'no-data-yet' : 'no-results'}
      title={AUDIT.length === 0 ? copy.auditNone : copy.noneMatching(AUDIT.length, 'entries')}
      query={AUDIT.length === 0
        ? undefined
        : [who ? actorOf(who) : '', what ? kindOf(what).word : ''].filter(Boolean).join(' · ')}
      body={AUDIT.length === 0 ? copy.auditHolds : undefined}
    >
      {#snippet actions()}
        {#if who || what}<Button href="/audit">{copy.clearFilters}</Button>{/if}
      {/snippet}
    </Empty>
  {/if}

  <ul class="ledger">
    {#each shown as e}
      <li>
        <div class="line line-short">
          <!-- ITS OWN COLUMN, NOT `.seq`. That one is 12ch of monospace for spoken ids, and
               `rows.css` says in as many words that anything longer needs a span of its own — so
               "renewal rule" arrived as `the renewal r…`. An actor is a name. -->
          <span class="who">{actorOf(e.by)}</span>
          <span class="line-main">
            <!-- The target is a LINK, and that is not decoration. This page was a list of spans:
                 nothing in it could be reached by Tab, so the one scrolling container in the app
                 had no focusable descendant and a keyboard user could not scroll the log at all
                 (WCAG 2.1.1). Making the row's subject reachable is the fix that a reader also
                 wanted anyway — an audit line names a row, and the next question is always what
                 that row says now. -->
            <span class="line-title"><span class="kind"><Icon name={kindOf(e.kind).icon} size="s" />{kindOf(e.kind).word}</span>
              <a class="target tap" href={href(e.target)}>{targetOf(e.target)}</a></span>
          </span>
          <span class="line-amount note">{e.note}</span>
          <span class="line-when">{since(e.at, NOW)}</span>
        </div>
      </li>
    {/each}
  </ul>
  <CapLine shown={shown.length} total={matched.length} />
  <!-- IT EXPLAINED THE DATA MODEL TO SOMEBODY WHO CAME TO SEE WHO CHANGED WHAT. "The log and the
       version are the same fact, so a version number is a place in this list" is true, and it is a
       sentence about how the record is built. What a reader needs from the number is what it is
       FOR: it is how you name a moment when you talk to somebody about it. -->
  <p class="foot">
    {copy.auditVersion(AUDIT[0]?.version.toLocaleString('en') ?? '—')}
  </p>
</div>

<style>
  /* WIDE ENOUGH FOR A NAME, in the reading face rather than the id face. It sits in the grid slot
     `.seq` would have taken, so the ledger's columns still line up down the page. */
  /* A NAME WRAPS ON A CARD TOO. `reply rule` and `renewal rule` are two words and the card's first
     column is 94px; truncating a four-actor filter's own labels leaves `reply r…` as the only thing
     saying who did it. */
  .who {
    min-inline-size: 0;
    overflow: hidden;
    color: var(--ink2);
    font-size: var(--t-sm);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* The same shape the register's toolbar has, because it is the same act: narrowing a list. */
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    margin-block-end: var(--sp-4);
  }

  /* THE TRACK WRAPS HERE AND NOWHERE ELSE. A register's segmented groups hold two to four short
     enum values and fit on any phone; this one holds every actor the log has ever carried, and
     "renewal rule" is not "open". Five of those in one unwrapping track reached 335px inside a
     320px screen — the layout gate caught it. Two rows of track still read as one control. */
  .bar :global(.segmented) {
    flex-wrap: wrap;
  }

  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--sp-5) var(--sp-6) var(--sp-9);
    max-inline-size: 1100px;
  }

  /* 16ch FOR THE ACTOR, because it is a name and not a spoken id. The ledger's default first column
     is 10ch of monospace, which "renewal rule" does not fit in — and once `rule.renewal` became
     English, every rule in the log truncated. */
  /**
   * A DESKTOP TRACK LIST IS A DESKTOP RULE, AND HAS TO SAY SO.
   *
   * `rows.css` turns a row into a two-line card below 640px. This override said nothing about width,
   * and it is more specific than the card rule — Svelte compiles `.ledger :global(.line)` to
   * `.ledger.svelte-xxx .line`, three classes against one — so it won at every size. The children
   * took their card placements and the parent kept four desktop tracks underneath them: computed at
   * 390, `144px 63px 0px 81px`, a zero-width track with a nowrap note in it.
   *
   * The cost is measurable. The longest note in the audit log was 19% visible — `added a n…` — and
   * `/decide` lost 227px of a 551px sentence. Eight entries, none readable, on the two screens whose
   * whole job is to say what changed and why. Every desktop screenshot looked correct.
   *
   * `@layer components` alone does NOT fix it: within one layer the more specific rule still wins.
   * The width query is what makes the two rules describe two different screens instead of arguing
   * about one.
   */
  @media (width >= 640px) {
    .ledger :global(.line) {
      grid-template-columns: 16ch minmax(0, 22ch) minmax(0, 1fr) 9ch;
    }
  }

  /* A word and a glyph, not an identifier. It is still the quiet half of the line, because the
     interesting part is what changed rather than the verb that changed it. */
  .kind {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .note {
    color: var(--dim);
    font-size: var(--t-xs);
    text-align: start;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* AND ON A CARD IT WRAPS, because a card has a line to spare and a truncated note is the one
     thing this screen must not do: the note IS what changed. */
  @media (width < 640px) {
    .note,
    .who {
      overflow: visible;
      text-overflow: clip;
      white-space: normal;
    }

    /* THE ACTOR GETS A LINE. On a card the row is two tracks, and `.who` is not one of the four
       cells the card layout places — so it fell into whatever was left, which was nothing: measured
       `clientWidth: 0` against 29px of text. Who did it is half of what this log says. */
    .who {
      grid-column: 1 / -1;
      grid-row: 1;
    }
  }

  /* It is a link, so it says so on hover and on focus — but not with a permanent underline, which
     at eight rows of monospace turns the column into a ladder. */
  .target {
    color: inherit;
    text-decoration: none;
    border-block-end: 1px solid transparent;
  }

  .target:hover,
  .target:focus-visible {
    border-block-end-color: currentColor;
  }

  .foot {
    color: var(--dim);
    font-size: var(--t-xs);
  }


  @media (width < 900px) {
    .page {
      padding: var(--sp-4) var(--sp-4) var(--sp-8);
    }
  }
</style>
