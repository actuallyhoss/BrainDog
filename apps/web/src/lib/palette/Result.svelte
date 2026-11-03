<!--
  One result, as the palette and `/search` both draw it: the glyph of what it is in a 28px neutral well, its title at
  15/400, and one line saying which one it is (why it matched, where it sits, when it changed), with a figure's reading
  at the trailing edge.

  ONE ROW IN TWO PLACES. `/search` is where somebody goes when the palette's ranked list was not
  enough, and a result drawn differently there would be a second thing to learn about the same object. The box around
  it stays each caller's own, because in the palette it is an option the arrow keys walk and on `/search` it is a link:
  this file draws what sits inside that box, and nothing about how it is pressed.

  A STATUS IS A WORD, NOT A GLYPH IN A COLOUR (`status`): "Over limit" at 13/500 in the red under the title, where a "⚠"
  in brown beside the figure was colour and a mark with no word. A row standing for several of one title says how many
  (`folded`), and "Show all" is a red word with no glyph (`more`).

  NO NUMBER AND NO KEY. A row's number or a question's id is not what a person calls it, and a key
  printed on a result is advice nobody is looking at; the keymap is where keys are taught.

  ON A PHONE IT IS TWO LINES, the title over its line, because at 390 a title and its line side by side cut both at an
  ellipsis. From 640 up the line follows the title on the same row, where the room is.
-->
<script lang="ts">
  import IconWell from '../ui/IconWell.svelte';
  import type { IconName } from '../ui/Icon.svelte';

  let {
    icon,
    title,
    line,
    value,
    tone,
    status,
    folded,
    foldedSaid,
    more = false,
  }: {
    icon?: IconName | undefined;
    title: string;
    /**
     * Where the result sits or why it matched. A register hit's is only its list's name, because the record's search
     * answers a register, a number and a title and nothing else, so two rows of one list with one title still read
     * alike here until it sends a money row's amount and date. Absent, or empty, draws no second line.
     */
    line?: string | undefined;
    /** A figure's reading, printed so the result answers without being opened. */
    value?: string | undefined;
    tone?: 'good' | 'warn' | 'bad' | 'info' | undefined;
    /** Where a reading stands, said as words under the title: "Over limit". */
    status?: string | undefined;
    /** How many rows of this one title the line stands for. */
    folded?: number | undefined;
    /** The count in words, "2 tools", when the caller knows what the rows are; else "2 times". */
    foldedSaid?: string | undefined;
    /** The row that opens the rest of its group. */
    more?: boolean | undefined;
  } = $props();
</script>

<span class="result" data-more={more ? '' : undefined}>
  {#if icon}<span class="result-glyph"><IconWell name={icon} /></span>{/if}
  <span class="result-words">
    <span class="result-head">
      <!-- THE TITLE AND ITS COUNT ARE ONE LINE at every width (VERIFY P9): on a phone the count dropped to a line of its own. -->
      <span class="result-name"><span class="result-title">{title}</span>{#if folded && folded > 1}<span class="result-folded num">{foldedSaid ?? `${folded.toLocaleString('en-GB')} times`}</span>{/if}</span>
      {#if line}<span class="result-line">{line}</span>{/if}
    </span>
    {#if status}<span class="result-status" data-tone={tone}>{status.charAt(0).toUpperCase()}{status.slice(1)}</span>{/if}
  </span>
  {#if value}<span class="result-value num">{value}</span>{/if}
</span>

<style>
  .result {
    display: flex;
    flex: 1;
    align-items: center;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  /* THE GLYPH BARE, AS A MENU ROW'S IS (ops 4.10): 16 in a 24px slot, in the second ink, no well behind it on the glass. */
  .result-glyph {
    display: flex;
    flex: none;
  }

  .result-glyph :global(.well) {
    inline-size: 24px;
    block-size: 24px;
    background: none;
    box-shadow: none;
    color: var(--ink-2);
  }

  .result-glyph :global(.well .icon[data-size]) {
    inline-size: var(--icon-m);
    block-size: var(--icon-m);
  }

  .result-words {
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    min-inline-size: 0;
  }

  .result-head {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  /* A CAP, NOT A `flex: none`. A question's title is a whole sentence; what it must not do is push its own line and the
     reading off the end of the row. */
  .result-title {
    flex: 0 1 auto;
    min-inline-size: 0;
    overflow: hidden;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: var(--fw-regular);
    line-height: var(--lead-ui, 20px);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .result-name {
    display: flex;
    flex: 0 1 auto;
    align-items: baseline;
    gap: var(--sp-2);
    min-inline-size: 0;
    white-space: nowrap;
  }

  .result-folded {
    flex: none;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
    line-height: var(--lead-meta, 18px);
  }

  .result-line {
    flex: 1 1 0;
    min-inline-size: 0;
    overflow: hidden;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta, 18px);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* THE STATUS AS A WORD: the red for what is wrong, the warning ink for what to watch. */
  .result-status {
    overflow: hidden;
    color: var(--red);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
    line-height: var(--lead-meta, 18px);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .result-status[data-tone='warn'] {
    color: var(--warn);
  }

  /* THE READING IN INK, whole: a verdict is the status word, never the figure's colour. */
  .result-value {
    flex: none;
    margin-inline-start: auto;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  /* "SHOW ALL 13": a red word, the one link look in the list, on the glyphs' and group labels' edge (4 into the row's
     24px glyph slot) rather than 4 short of it. */
  .result[data-more] {
    padding-inline-start: var(--sp-1);
  }

  .result[data-more] .result-title {
    color: var(--red);
    font-weight: var(--fw-medium);
  }

  /* THE PHONE'S TWO LINES: the glyph beside both, the title and the reading on the first, the line under the title. */
  @media (width < 640px) {
    .result-head {
      flex-direction: column;
      align-items: stretch;
      gap: var(--row-stack, 2px);
    }

    .result-title {
      font-size: var(--fs-body);
    }

    /* ITS OWN HEIGHT IN THE COLUMN: `flex: 1 1 0` is the row's share of the width beside the title, and in a column it
       was a share of no height at all, so every line under a title was drawn 0px tall and clipped (skills pass, 2 Nov):
       Tell's three "Add both things it heard" lost "from Company card", "from Tax reserve", … and read as one row three
       times. */
    .result-line {
      flex: none;
    }
  }
</style>
