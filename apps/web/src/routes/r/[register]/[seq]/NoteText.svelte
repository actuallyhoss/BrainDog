<!--
  A LONG NOTE AS A NOTE (the audit of 25 October, Y13): headings, bold, lists and tables drawn, never the marks they were
  written in, and past eight lines it opens folded with Show all. Every part is drawn as text (`note-text.ts`).

  THE BUTTON SITS ABOVE THE PHONE'S EDIT OVERLAY, as a link in a fact does, so a thumb on Show all opens the note and a
  thumb anywhere else on the fact edits it.
-->
<script lang="ts">
  import { folds, noteWords, partsOf, type Span } from './note-text.ts';

  let { text }: { text: string } = $props();

  const parts = $derived(partsOf(text));
  const long = $derived(folds(text));
  let open = $state(false);
  const uid = $props.id();
</script>

{#snippet spans(list: Span[])}{#each list as s}{#if s.t === 'b'}<strong>{s.text}</strong>{:else if s.t === 'code'}<code>{s.text}</code>{:else}{s.text}{/if}{/each}{/snippet}

<div class="note">
  <div class="note-body" id="{uid}-note" data-folded={long && !open ? '' : undefined}>
    {#each parts as part}
      {#if part.t === 'h'}
        <p class="note-h" data-level={part.level}>{@render spans(part.spans)}</p>
      {:else if part.t === 'p'}
        <p class="note-p">{#each part.lines as line, i}{#if i > 0}<br />{/if}{@render spans(line)}{/each}</p>
      {:else if part.t === 'ul'}
        <ul class="note-ul">{#each part.items as item}<li>{@render spans(item)}</li>{/each}</ul>
      {:else if part.t === 'table'}
        <div class="note-table">
          <table>
            {#if part.head.length > 0}
              <thead><tr>{#each part.head as cell}<th scope="col">{@render spans(cell)}</th>{/each}</tr></thead>
            {/if}
            <tbody>{#each part.rows as row}<tr>{#each row as cell}<td>{@render spans(cell)}</td>{/each}</tr>{/each}</tbody>
          </table>
        </div>
      {:else}
        <hr class="note-hr" />
      {/if}
    {/each}
  </div>
  {#if long}
    <button type="button" class="note-more" aria-expanded={open} aria-controls="{uid}-note" onclick={() => (open = !open)}>
      {open ? noteWords.less : noteWords.more}
    </button>
  {/if}
</div>

<style>
  .note {
    display: grid;
    gap: var(--sp-1);
    inline-size: 100%;
    min-inline-size: 0;
  }

  .note-body {
    display: grid;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  /* EIGHT LINES, then a fade into the page, so the fold reads as more and not as a cut. */
  .note-body[data-folded] {
    max-block-size: calc(8 * 1.55em);
    overflow: hidden;
    mask-image: linear-gradient(to bottom, var(--ink) 70%, transparent);
  }

  .note-h,
  .note-p,
  .note-ul {
    margin: 0;
  }

  .note-h {
    font-weight: 600;
  }

  .note-ul {
    padding-inline-start: 1.2em;
  }

  .note code {
    font-family: var(--font-mono);
    font-size: 0.9em;
  }

  /* A WIDE TABLE SCROLLS IN ITS OWN BOX, so the page never scrolls sideways at 390. */
  .note-table {
    overflow-x: auto;
    min-inline-size: 0;
  }

  .note-table table {
    border-collapse: collapse;
    font-size: var(--fs-meta);
    font-variant-numeric: tabular-nums;
  }

  .note-table th,
  .note-table td {
    padding: 4px var(--sp-2) 4px 0;
    border-block-end: 1px solid var(--rule);
    text-align: start;
    vertical-align: top;
  }

  .note-table th {
    color: var(--ink-3);
    font-weight: 500;
  }

  .note-hr {
    inline-size: 100%;
    margin: 0;
    border: 0;
    border-block-start: 1px solid var(--rule);
  }

  .note-more {
    position: relative;
    z-index: var(--z-raise);
    justify-self: start;
    min-block-size: var(--tap);
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    text-decoration: underline;
    text-decoration-color: var(--rule);
    font: inherit;
    font-size: var(--fs-meta);
    font-weight: 500;
    cursor: pointer;
  }
</style>
