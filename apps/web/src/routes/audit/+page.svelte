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
  import { relative } from 'braindog-render';
  import { copy } from '$lib/copy.ts';
  import { AUDIT, NOW } from '$lib/record/api.ts';
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
    'declaration.set': { word: 'Page changed', icon: 'doc' },
    'pack.install': { word: 'Installed', icon: 'packs' },
  };

  const kindOf = (k: string) => KIND[k] ?? { word: k.replace(/[.]/g, ' '), icon: 'doc' as IconName };

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
</script>

<svelte:head><title>{titleOf(copy.audit)}</title></svelte:head>

<PageHead icon="history"
  title={copy.audit}
  count={AUDIT.length}
/>

<div class="page">
  <ul class="ledger">
    {#each AUDIT as e}
      <li>
        <div class="line line-short">
          <span class="seq">{e.by}</span>
          <span class="line-main">
            <!-- The target is a LINK, and that is not decoration. This page was a list of spans:
                 nothing in it could be reached by Tab, so the one scrolling container in the app
                 had no focusable descendant and a keyboard user could not scroll the log at all
                 (WCAG 2.1.1). Making the row's subject reachable is the fix that a reader also
                 wanted anyway — an audit line names a row, and the next question is always what
                 that row says now. -->
            <span class="line-title"><span class="kind"><Icon name={kindOf(e.kind).icon} size="s" />{kindOf(e.kind).word}</span>
              <a class="target" href={href(e.target)}>{e.target}</a></span>
          </span>
          <span class="line-amount note">{e.note}</span>
          <span class="line-when">{relative(e.at.slice(0, 10), NOW)}</span>
        </div>
      </li>
    {/each}
  </ul>
  <p class="foot">
    Version {AUDIT[0]?.version.toLocaleString('en')}. The log and the version are the same fact, so
    a version number is a place in this list.
  </p>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--sp-5) var(--sp-6) var(--sp-9);
    max-inline-size: 1100px;
  }

  .ledger :global(.line) {
    grid-template-columns: 10ch minmax(0, 22ch) minmax(0, 1fr) 9ch;
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
