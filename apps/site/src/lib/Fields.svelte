<!--
  The typed row, drawn. The first picture on this site that is not a photograph.

  WHY IT IS NOT AN SVG. The obvious way to draw a diagram is an inline `<svg>` with a viewBox, and
  a viewBox scales UNIFORMLY: a 900-wide drawing in a 358px box on a phone renders its 13px labels
  at five pixels. That is the exact defect the product screenshots were fixed for this week, and
  reintroducing it in a hand-drawn figure would be worse, because a screenshot at least has a
  narrow capture to swap to. This is laid out rather than scaled, so the type is the size the type
  is at every width, it reflows to two lines on a phone, it answers the reader's own Text setting,
  and a screen reader gets a definition list instead of a picture with no accessible name.

  WHY IT EARNS ITS PLACE. Every other picture on the page is a photograph of a surface, and a
  surface shows VALUES. The claim this section makes is about TYPES, and a type is not a thing any
  screenshot has ever contained: the grid below shows `GBP 19,100.00` and cannot show that the
  field is money and that money is an integer in minor units with a currency welded to it. So the
  one argument on the page with no evidence beside it now has some.

  Nothing here is invented. The labels and the types are the seed's own `obligations` declaration
  and the values are read off the screenshot underneath, which is a photograph of the same row.
-->
<script lang="ts">
  import Icon from './Icon.svelte';

  let {
    register,
    row,
    fields,
    caption,
  }: {
    register: string;
    row: string;
    fields: readonly { label: string; type: string; value: string }[];
    caption?: string;
  } = $props();
</script>

<figure class="fig">
  <div class="panel">
    <div class="head">
      <span class="reg">{register}</span>
      <span class="row">{row}</span>
    </div>

    <dl class="grid">
      <div class="cols" aria-hidden="true">
        <span>Field</span>
        <span>Type</span>
        <span>This row</span>
      </div>
      {#each fields as field, i}
        <div class="line" style="--i: {i}">
          <dt class="label">{field.label}</dt>
          <dd class="type">{field.type}</dd>
          <!-- Tabular figures only where there ARE figures. `.num` also turns on `ss02`, which is
               an alternate letterform set, so putting it on a sentence changes the sentence. -->
          <dd class="value" class:num={/\d/.test(field.value)}>{field.value}<span class="ok" aria-hidden="true"><Icon name="check" size="s" /></span></dd>
        </div>
      {/each}
    </dl>
  </div>
  {#if caption}<figcaption>{caption}</figcaption>{/if}
</figure>

<style>
  .fig {
    margin: 0;
    min-inline-size: 0;
  }

  .panel {
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    box-shadow: var(--e1);
    overflow: hidden;
  }

  /* The register's own name and the row's spoken number, on the sunk strip the panel sits on, so
     the figure announces what it is a figure OF before the first field. */
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-2) var(--sp-3);
    padding: var(--sp-3) var(--sp-4);
    background: var(--sunk);
    border-block-end: 1px solid var(--line);
  }

  .reg {
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--t-md);
    font-weight: 600;
    letter-spacing: -0.014em;
  }

  /* A spoken id is set in the identifier face. That is a ROLE in this system rather than a
     decoration: mono is what makes #4 read as something you can say out loud. */
  .row {
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-sm);
  }

  .grid {
    margin: 0;
  }

  .cols,
  .line {
    display: grid;
    grid-template-columns: minmax(9ch, 14ch) minmax(9ch, 13ch) minmax(0, 1fr);
    align-items: baseline;
    gap: var(--sp-2) var(--sp-4);
    padding: var(--sp-3) var(--sp-4);
  }

  .cols {
    padding-block: var(--sp-2);
    border-block-end: 1px solid var(--line);
    color: var(--dim);
    font-size: var(--t-xs);
    font-weight: 600;
  }

  .line + .line {
    border-block-start: 1px solid color-mix(in srgb, var(--line) 60%, transparent);
  }

  .label {
    color: var(--ink2);
    font-size: var(--t-base);
  }

  /**
   * THE ONE COLOURED COLUMN, AND IT IS THE SUBJECT OF THE SECTION.
   *
   * `--info` is the note role: this is what the record knows about the field, as opposed to what
   * the row happens to hold. The identifier face for the same reason the row number takes it, and
   * because a type is a word the machine reads.
   */
  .type {
    margin: 0;
    color: var(--info);
    font-family: var(--font-id);
    font-size: var(--t-sm);
  }

  .value {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink);
    font-size: var(--t-base);
    overflow-wrap: anywhere;
  }

  /* CHECKED ON THE WAY IN, drawn: each value takes a tick in turn, which is the sentence beside it. */
  .ok {
    display: flex;
    align-self: center;
    color: var(--earn);
  }

  @media (prefers-reduced-motion: no-preference) {
    .ok {
      animation: checked 8s var(--ease-spring) calc(0.5s * var(--i) + 0.6s) infinite both;
    }
  }

  @keyframes checked {
    0% {
      opacity: 0;
      transform: scale(0.5);
    }

    6%,
    84% {
      opacity: 1;
      transform: none;
    }

    92%,
    100% {
      opacity: 0;
    }
  }

  figcaption {
    margin-block-start: var(--sp-3);
    color: var(--dim);
    font-size: var(--t-sm);
    text-wrap: pretty;
  }

  /**
   * TWO LINES PER FIELD ON A PHONE, AND THE COLUMN HEADS GO.
   *
   * Three columns inside 358px gives the value about eleven characters, so
   * `Corporation tax, payment on account` sets as four ragged lines beside two words. The label
   * and the type stay on one line, which is the pair that has to be read together, and the value
   * takes the whole width under them. The heads are dropped rather than shrunk: with the type
   * sitting beside its own label, a column head naming a column that no longer exists is noise.
   */
  @media (width < 560px) {
    .cols {
      display: none;
    }

    .line {
      grid-template-columns: minmax(0, auto) minmax(0, 1fr);
      gap: var(--sp-1) var(--sp-3);
    }

    .value {
      grid-column: 1 / -1;
    }

    .type {
      justify-self: start;
    }
  }
</style>
