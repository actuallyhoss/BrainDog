<!--
  A file the person pointed at, as its tile in the build: where it goes, in one line, and which column fills what.

  EVERY LINE IS THE MAPPING'S (`lib/start/export.ts`): the line is the model's own summary where it gave one and the plain
  "go into" sentence otherwise, the same line the conversation says, and the columns are the ones that fill a field, each
  with the field's own name. Its entries are drawn on the pages below, in the page they will live on, so this tile does
  not draw them twice.

  ONE OF MANY: a zip brings one of these for each table inside, drawn under the page's own key for each, so its
  heading is the table's own file name and its "Leave it out" names that file too, or a screen reader would hear the
  same button twice.

  NOTHING HERE IS SAVED. "Leave it out" takes the file off the build; the one press is what writes it.
-->
<script lang="ts">
  import { firstRun } from '$lib/first-run.ts';
  import Tile from '$lib/ui/Tile.svelte';
  import Button from '$lib/ui/Button.svelte';
  import type { Export, Mapping } from '$lib/start/export.ts';

  let {
    file,
    mapping,
    line,
    pairs,
    going,
    held,
    reading = false,
    busy = false,
    onremove,
  }: {
    file: Export;
    /** `null` while it is being read. */
    mapping: Mapping | null;
    /** Where it goes, in one line: the model's summary, or the plain sentence (`fileSaid` on the screen). */
    line: string;
    /** Each column that fills a field, with the field's name as a person reads it. */
    pairs: readonly { column: string; label: string }[];
    /** How many entries go in as the build stands. */
    going: number;
    /** Entries held back until a question is answered (the currency), or that do not fit at all. */
    held: number;
    reading?: boolean;
    busy?: boolean;
    onremove: () => void;
  } = $props();

  const shown = $derived(pairs.slice(0, 6));
</script>

<Tile icon="upload" title={file.file} count={mapping ? going : undefined} aria-busy={reading}>
  {#snippet actions()}
    <Button weight="quiet" size="sm" disabled={busy} aria-label={`${firstRun.exportLeave}: ${file.file}`} onclick={onremove}>{firstRun.exportLeave}</Button>
  {/snippet}
  <p class="file-line" role={reading ? 'status' : undefined}>{line}</p>
  {#if mapping && shown.length > 0}
    <dl class="pairs" aria-label={firstRun.exportColumns}>
      {#each shown as p (p.column)}
        <div class="pair"><dt class="col">{p.column}</dt><dd class="to">{p.label}</dd></div>
      {/each}
    </dl>
    {#if pairs.length > shown.length || file.columns.length > pairs.length}
      <p class="file-quiet">{firstRun.exportRest(pairs.length - shown.length, file.columns.length - pairs.length)}</p>
    {/if}
  {/if}
  {#if mapping && held > 0}<p class="file-quiet" data-needs>{firstRun.exportHeld(held)}</p>{/if}
  {#if file.more > 0}<p class="file-quiet">{firstRun.exportMore(file.entries.length, file.more)}</p>{/if}
</Tile>

<style>
  .file-line {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: var(--lead-ui);
    overflow-wrap: anywhere;
  }

  /* THE COLUMNS, TWO TO A LINE ON A WIDE TILE: the file's heading, and the field it fills in the second ink. */
  .pairs {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 200px), 1fr));
    gap: var(--sp-1) var(--sp-4);
    margin: 0;
  }

  .pair {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .col {
    overflow: hidden;
    color: var(--ink);
    font-size: var(--fs-meta);
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .to {
    margin: 0;
    overflow: hidden;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .to::before {
    content: '→ ';
  }

  .file-quiet {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .file-quiet[data-needs] {
    color: var(--red);
  }
</style>
