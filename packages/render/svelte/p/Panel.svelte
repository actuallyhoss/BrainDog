<!--
  `panel` — a bounded region with a tone, an optional glyph, and a nested document. Kinds: `note`,
  `quote`, `section` and `capture`, the last two drawn by their own components.

  `note` is the ONLY drawn kind in the `measure` class, because it is the only one that may contain
  a paragraph. That rule was learned expensively: a callout carrying a comparison was capped near a
  reading measure on the theory that a callout is a sentence, which turned a wide block into a
  narrow column of thirty short lines. The cap came back off the next day (05 §4).
-->
<script lang="ts">
  import { TONES, inline, type Block, type RenderOptions } from '../../src/index.ts';
  import Text from '../Text.svelte';
  import Section from '../Section.svelte';
  import Capture from '../Capture.svelte';
  import type { OnCapture } from '../types.ts';

  let {
    block,
    opts = {},
    oncapture,
  }: {
    block: Block;
    opts?: RenderOptions;
    /** The panel's one write: a `capture`'s line, handed to the host. The other panel kinds take nothing. */
    oncapture?: OnCapture | undefined;
  } = $props();

  /**
   * THE GLYPH THIS FILE'S OWN HEADER HAS PROMISED SINCE IT WAS WRITTEN — "a bounded region with a
   * tone, AN OPTIONAL GLYPH, and a nested document" — and never drew.
   *
   * A toned panel got a three-pixel `--tone` border down its leading edge and nothing else, which is
   * `13 §5.1`'s "colour never carries meaning alone" broken in the one block kind whose entire job
   * is to say something is wrong. `/p/money`'s note reads "Something went past its terms 5w ago",
   * red-edged; `/p/estate`'s reads "Something here renews and points at nothing", amber-edged. To
   * anybody who does not see those two apart, and to every screen reader, they were the same note.
   *
   * ONLY WHEN THE BLOCK HAS NO HEADING. With one, `Block` already draws the glyph in the figcaption,
   * and the rule is that a block's tone is marked once, on its first line — whichever line that is.
   */
  const mark = $derived(block.heading ? null : (block.tone ?? null));

  /** A blank line is where one paragraph ends. */
  const paragraphs = $derived.by(() => {
    const out: string[][] = [[]];
    for (const row of block.rows) {
      const line = row.cells[0] ?? '';
      if (line.trim() === '') out.push([]);
      else out[out.length - 1]!.push(line);
    }
    return out.filter((p) => p.length).map((p) => p.join(' '));
  });
</script>

{#if block.kind === 'section'}
  <Section {block} {opts} />
{:else if block.kind === 'capture'}
  <Capture {block} {opts} {oncapture} />
{:else if block.kind === 'quote'}
  {@const row = block.rows[0] ?? { cells: [] }}
  <blockquote class="panel">
    <span class="quote-text"><Text nodes={inline(row.cells[0] ?? '', opts)} {opts} /></span>
    {#if row.cells[1]}<cite class="quote-by">{row.cells[1]}</cite>{/if}
  </blockquote>
{:else}
  <div class="panel measure" data-marked={mark ? '' : undefined}>
    {#if mark}
      <span class="panel-glyph" role="img" aria-label={TONES[mark].label}>{TONES[mark].glyph}</span>
    {/if}
    {#each paragraphs as paragraph}
      <p><Text nodes={inline(paragraph, opts)} {opts} /></p>
    {/each}
  </div>
{/if}
