<!--
  The week's changes on this page, in the docked panel: what the line at the foot of the board opens (`Changed.svelte`,
  DIRECTION §39). Each row an agent, a rule or Slash changed this week, newest first: its words, which open the row in
  the same panel; who changed it and when, the agent's name the door to the run that did it; and Undo, which reads the
  plan first and says what else it takes back when the change touched more than the row (`UndoAsk.svelte`).

  A ROW THE READER HAS NOT SEEN YET leads with a small dot in ink, and its tint on the page goes once it is opened.

  A LIST WITHOUT A BOX, in the panel's own column: no tile inside the panel.
-->
<script lang="ts">
  import { at as inApp } from '$lib/at.ts';
  import Panel from '$lib/ui/Panel.svelte';
  import type { RowHost } from './row-host.svelte.ts';
  import { bylineWords } from './byline.ts';
  import UndoAsk from './UndoAsk.svelte';
  import { keyOf, rowOfKey, titleOf, type RowAt } from './row-verbs.ts';

  let { host }: { host: RowHost } = $props();

  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  /** Every change of the week the page draws, the newest first. */
  const lines = $derived(
    [...host.bylines]
      .filter(([, b]) => host.readAt() - Date.parse(b.at) <= WEEK_MS)
      .sort((a, b) => Date.parse(b[1].at) - Date.parse(a[1].at))
      .flatMap(([key, b]) => {
        const row = rowOfKey(key);
        const e = row ? host.entry(row) : undefined;
        return row && e ? [{ key, row, byline: b, title: titleOf(e, host.shapeOf(row.register)) }] : [];
      }),
  );

  /** The run's own page, where the name is pressed: its row in the list of runs, record-relative until it is drawn. */
  const runPath = (run: string): string => `/r/session/${run.slice(1)}`;

  const undo = (row: RowAt) => void host.undoBy(row);

  /* THE LAST ONE UNDONE CLOSES THE PANEL, as the line at the foot of the board goes with it: an empty panel says nothing. */
  $effect(() => {
    if (host.changesOpen && lines.length === 0) host.changesOpen = false;
  });
</script>

<Panel bind:open={host.changesOpen} title={bylineWords.panelTitle} shows="changes">
  <ul class="ch-lines">
    {#each lines as l (l.key)}
      <li class="ch-line" data-new={l.byline.unseen ? '' : undefined}>
        <button type="button" class="ch-what" onclick={() => host.open(l.row)}
          >{#if l.byline.unseen}<span class="ch-dot" aria-hidden="true"></span>{/if}{l.title}</button
        >
        <p class="ch-by">
          <span
            >{#if l.byline.run && l.byline.said.startsWith(l.byline.name)}<a class="ch-who" href={inApp(runPath(l.byline.run))}>{l.byline.name}</a
              >{l.byline.said.slice(l.byline.name.length)}{:else}{l.byline.said}{/if}</span
          >
          {#if l.byline.batch && host.writable(l.row)}
            <button
              type="button"
              class="ch-undo tap"
              aria-label={bylineWords.undoNamed(l.title)}
              disabled={host.undoing.has(keyOf(l.row)) || host.asked?.key === l.key}
              onclick={() => undo(l.row)}>{bylineWords.undo}</button
            >
          {/if}
        </p>
        <UndoAsk {host} row={l.row} />
      </li>
    {/each}
  </ul>
</Panel>

<style>
  .ch-lines {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .ch-line {
    display: grid;
    gap: 2px;
    padding-block: var(--sp-3);
    border-block-start: 1px solid var(--rule);
  }

  .ch-line:first-child {
    padding-block-start: 0;
    border-block-start: 0;
  }

  .ch-what {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-inline-size: 0;
    padding: 0;
    background: none;
    border: 0;
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: 1.55;
    text-align: start;
    cursor: pointer;
  }

  .ch-what:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  @media (pointer: coarse) {
    .ch-what {
      min-block-size: var(--tap);
    }
  }

  .ch-dot {
    flex: none;
    inline-size: var(--dot);
    block-size: var(--dot);
    background: var(--ink);
    border-radius: var(--r-round);
  }

  .ch-by {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-1) var(--sp-3);
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .ch-who {
    color: inherit;
    text-decoration: none;
  }

  .ch-who:hover {
    color: var(--ink);
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  /* UNDO IS WORDS IN INK, a hairline under them, as every quiet verb in the panel is. */
  .ch-undo {
    padding: 0;
    background: none;
    border: 0;
    color: var(--ink);
    font: inherit;
    font-weight: 500;
    text-decoration: underline;
    text-decoration-color: var(--rule-strong);
    text-underline-offset: 3px;
    cursor: pointer;
  }

  .ch-undo:hover {
    text-decoration-color: currentColor;
  }

  .ch-undo:disabled {
    color: var(--ink-3);
    cursor: default;
  }
</style>
