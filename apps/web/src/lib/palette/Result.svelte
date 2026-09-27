<!--
  One result, as the palette and `/search` both draw it: the glyph of what it is, its title, and one line saying which
  one it is (the list it is in, why it matched, where a page sits), with a figure's reading at the trailing edge.

  ONE ROW IN TWO PLACES (design SYS-13). `/search` is where somebody goes when the palette's ranked list was not
  enough, and a result drawn differently there would be a second thing to learn about the same object. The box around
  it stays each caller's own, because in the palette it is an option the arrow keys walk and on `/search` it is a link:
  this file draws what sits inside that box, and nothing about how it is pressed.

  NO NUMBER AND NO KEY. A row's number or a question's id is not what a person calls it (design SYS-3), and a key
  printed on a result is advice nobody is looking at; the keymap is where keys are taught.

  ON A PHONE IT IS TWO LINES, the title over its line, because at 390 a title and its line side by side cut both at an
  ellipsis. From 640 up the line follows the title on the same row, where the room is.
-->
<script lang="ts">
  import { TONES } from 'braindog-render';
  import Icon from '../ui/Icon.svelte';
  import type { IconName } from '../ui/Icon.svelte';

  let {
    icon,
    title,
    line,
    value,
    tone,
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
  } = $props();
</script>

<span class="result">
  {#if icon}<span class="result-glyph"><Icon name={icon} size="m" /></span>{/if}
  <span class="result-title">{title}</span>
  {#if line}<span class="result-line">{line}</span>{/if}
  <!-- THE GLYPH TRAVELS WITH THE TONE, always (`13 §5.1`): colour never carries a verdict alone, and under simulated
       dichromacy the intent hues collapse into one another, so a figure off its target and one on it would look alike. -->
  {#if value}
    <span class="result-value num" data-intent={tone}>
      {#if tone}<span class="result-tone" role="img" aria-label={TONES[tone].label}>{TONES[tone].glyph}</span>{/if}{value}
    </span>
  {/if}
</span>

<style>
  .result {
    display: flex;
    flex: 1;
    align-items: center;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .result-glyph {
    display: flex;
    flex: none;
    color: var(--dim);
  }

  /* A CAP, NOT A `flex: none`. A question's title is a whole sentence; what it must not do is push its own line and the
     reading off the end of the row. */
  .result-title {
    flex: 0 1 auto;
    min-inline-size: 0;
    overflow: hidden;
    color: var(--ink);
    font-size: var(--t-base);
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .result-line {
    flex: 1 1 0;
    min-inline-size: 0;
    overflow: hidden;
    color: var(--dim);
    font-size: var(--t-sm);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* THE READING IN THE INTENT IT WAS MEASURED AGAINST. `data-intent` is `blocks.css`'s map and the only place an intent
     becomes a colour; with no tone declared the figure is ordinary ink, because a number with no verdict is not news. */
  .result-value {
    flex: none;
    margin-inline-start: auto;
    color: var(--tone, var(--ink));
    white-space: nowrap;
  }

  /* Sized in `em` so it is a quieter mark on the reading's own size rather than a size of its own. */
  .result-tone {
    margin-inline-end: var(--sp-1);
    font-size: 0.9em;
  }

  /* THE PHONE'S TWO LINES: the glyph beside both, the title and the reading on the first, the line under the title. */
  @media (width < 640px) {
    .result {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      column-gap: var(--sp-3);
      row-gap: var(--sp-1);
    }

    .result-glyph {
      grid-row: 1 / span 2;
      grid-column: 1;
      align-self: center;
    }

    .result-title {
      grid-row: 1;
      grid-column: 2;
      font-size: var(--t-md);
    }

    .result-line {
      grid-row: 2;
      grid-column: 2;
    }

    .result-value {
      grid-row: 1;
      grid-column: 3;
    }
  }
</style>
