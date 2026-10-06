<!--
  Changed for you: the rows on this page an agent, a rule or Slash changed since the reader last looked, newest first,
  each with who did it and when, and its Undo (DIRECTION §37, trust). "Fix the login · Claude for Sam · 2h ago · Undo".

  THE ROWS THEMSELVES WEAR A FAINT TINT (`PageBody.svelte`), and this is where the words and the way back are: the
  renderer draws a row and nothing beside it, so one quiet list over the page says the bylines once, rather than a chip
  squeezed onto every row. Not drawn while nothing is new, and a row leaves it once it is opened or the page is left.

  A LIST WITHOUT A BOX under a quiet heading, as the page's other lists are. The row's words open it in the docked panel,
  where the same line and Undo stay for the rest of the week; the agent's name opens the run that made the change.
-->
<script lang="ts">
  import { at as inApp } from '$lib/at.ts';
  import type { RowHost } from './row-host.svelte.ts';
  import { bylineWords } from './byline.ts';
  import { keyOf, rowOfKey, titleOf, type RowAt } from './row-verbs.ts';

  let { host }: { host: RowHost } = $props();

  /** At most five lines, the newest first: a way to what changed, not a second list of the page. */
  const lines = $derived(
    [...host.bylines]
      .filter(([, b]) => b.unseen)
      .sort((a, b) => Date.parse(b[1].at) - Date.parse(a[1].at))
      .flatMap(([key, b]) => {
        const row = rowOfKey(key);
        const e = row ? host.entry(row) : undefined;
        return row && e ? [{ key, row, byline: b, title: titleOf(e, host.shapeOf(row.register)) }] : [];
      })
      .slice(0, 5),
  );

  /** The run's own page, where the name is pressed: its row in the list of runs. */
  const runHref = (run: string): string => inApp(`/r/session/${run.slice(1)}`);

  const undo = (row: RowAt) => void host.undoBy(row);
</script>

{#if lines.length > 0}
  <section class="changed" aria-labelledby="changed-h">
    <h2 class="changed-h" id="changed-h">{bylineWords.heading}</h2>
    <ul class="changed-lines">
      {#each lines as l (l.key)}
        <li class="changed-line">
          <button type="button" class="changed-what" onclick={() => host.open(l.row)}>{l.title}</button>
          <span class="changed-by">
            {#if l.byline.run && l.byline.said.startsWith(l.byline.name)}<a class="changed-who" href={runHref(l.byline.run)}>{l.byline.name}</a>{l.byline.said.slice(l.byline.name.length)}
            {:else}{l.byline.said}{/if}
          </span>
          {#if l.byline.batch && host.writable(l.row)}
            <button
              type="button"
              class="changed-undo tap"
              aria-label={bylineWords.undoNamed(l.title)}
              disabled={host.undoing.has(keyOf(l.row))}
              onclick={() => undo(l.row)}>{bylineWords.undo}</button
            >
          {/if}
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  /* THE PAGE'S FIRST ROW, full width, beside Just changed: what was done for you before what the page holds. */
  .changed {
    grid-column: 1 / -1;
    min-inline-size: 0;
  }

  /* A QUIET HEADING, the size of a meta line: it names the group and does not compete with the blocks' own names. */
  .changed-h {
    margin: 0 0 var(--sp-2);
    color: var(--dim);
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  .changed-lines {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .changed-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    column-gap: var(--sp-3);
    min-block-size: var(--ctl-h);
    padding-block: var(--sp-1);
    border-block-start: 1px solid var(--line-soft);
  }

  .changed-line:first-child {
    border-block-start: 0;
  }

  .changed-what {
    flex: 1 1 16rem;
    min-inline-size: 0;
    overflow: hidden;
    padding: 0;
    background: none;
    border: 0;
    color: var(--ink);
    font: inherit;
    font-size: var(--t-base);
    line-height: 1.55;
    text-align: start;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }

  .changed-what:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .changed-by {
    flex: none;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .changed-who {
    color: inherit;
    text-decoration: none;
  }

  .changed-who:hover {
    color: var(--ink);
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  /* UNDO IS WORDS IN INK, a hairline under them, as every quiet verb on a page is. */
  .changed-undo {
    flex: none;
    padding: 0 var(--sp-2);
    background: none;
    border: 0;
    color: var(--ink);
    font: inherit;
    font-size: var(--t-sm);
    font-weight: 500;
    text-decoration: underline;
    text-decoration-color: var(--edge);
    text-underline-offset: 3px;
    cursor: pointer;
  }

  .changed-undo:hover {
    text-decoration-color: currentColor;
  }

  .changed-undo:disabled {
    color: var(--dim);
    cursor: default;
  }

  /* ON A PHONE the line wraps under the row's words: the words first, then who and Undo, never cut to fit beside it. */
  @media (width < 600px) {
    .changed-what {
      flex-basis: 100%;
    }
  }
</style>
