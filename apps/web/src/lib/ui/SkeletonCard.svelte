<!--
  ONE CARD OF BARS, SHAPED LIKE THE CARD IT STANDS FOR (finish 3 Nov, from Today's `TodaySkeleton.svelte`): the card's
  surface, its 28 head row with an 18 glyph and a name bar, and its body's bars where its lines will be: a question with
  its answers (`ask`), late lines with their amounts (`late`), faces (`faces`), the cash figure and its pairs (`cash`), a
  feed (`feed`), key figures side by side (`figures`, `figure`), dates (`dates`), project cards (`projects`), or a list
  (`list`, anything else). The one look for a card that is loading: Today's board stands one in each cell it last drew
  (`TodaySkeleton.svelte`), and a Today card still arriving draws one in its own cell (`PageBody.svelte`).

  NO SHIMMER AND NO WORDS: ink at a fixed strength, fading up once; nothing of any record. Hidden from a screen reader:
  the box around it says it is busy.

    <SkeletonCard kind="ask" rows={2} h={168} area="1 / 1 / 2 / 3" />
-->
<script lang="ts">
  let {
    kind = 'list',
    rows = 3,
    h = undefined,
    area = undefined,
    cols = 4,
    seed = 0,
    fill = false,
  }: {
    /** What the card holds (Today's kinds, `today-shape.ts`); anything else is a list. */
    kind?: string | undefined;
    /** How many lines it held. */
    rows?: number | undefined;
    /** Its height when it was last drawn, in px. */
    h?: number | undefined;
    /** Its cell on a board's grid. */
    area?: string | undefined;
    /** The board's columns (4 or 2): how many figures or project cards fit across. */
    cols?: number | undefined;
    /** Varies the name bar's width from card to card. */
    seed?: number | undefined;
    /** Fills the box it is in (a cell already sized), with no surface of its own. */
    fill?: boolean | undefined;
  } = $props();

  /* Widths that read as lines of different lengths, never a barcode of equal ones. */
  const W = ['58%', '42%', '66%', '36%', '52%', '47%', '61%', '39%'];
  const w = (i: number) => W[i % W.length];
  const NAME = ['84px', '108px', '72px', '96px', '120px', '64px'];
  const nameW = $derived(NAME[seed % NAME.length]);
  /* As many lines as the card held, never more than its height can show (the card clips the rest). */
  /* A PLUGIN'S CARDS (`routes/addons/PluginSkeleton.svelte`): the store's card, and a plugin page's lead, side, wide and third. */
  const PLUGIN: ReadonlySet<string> = new Set(['store', 'lead', 'side', 'wide', 'third']);
  const lines = $derived(Array.from({ length: Math.max(1, Math.min(rows ?? 1, 8)) }, (_, i) => i));
</script>

{#if PLUGIN.has(kind)}
  <!-- A PLUGIN'S CARDS (the store's, a plugin's page): no head row, a title bar and lines, a press at the foot. -->
  <div class="sk sk-plug surface-card" data-kind={kind} style="{area ? `grid-area:${area};` : ''}{h ? `block-size:${h}px` : ''}" aria-hidden="true">
    {#if kind === 'store'}
      <span class="o w28"></span><span class="b" style:inline-size="60%"></span><span class="b" style:inline-size="90%"></span><span class="b" style:inline-size="70%"></span>
    {:else if kind === 'side'}
      <span class="b t" style:inline-size="50%"></span>
      {#each [0, 1, 2] as r (r)}<span class="sk-row tight"><span class="o w28"></span><span class="b" style:inline-size="60%"></span></span>{/each}
    {:else if kind === 'lead'}
      <span class="b t" style:inline-size="40%"></span><span class="b" style:inline-size="90%"></span><span class="b" style:inline-size="80%"></span><span class="b" style:inline-size="30%"></span><span class="cap press"></span>
    {:else if kind === 'wide'}
      <span class="b t" style:inline-size="30%"></span><span class="b" style:inline-size="70%"></span><span class="b" style:inline-size="50%"></span><span class="cap press"></span>
    {:else}
      <span class="b t" style:inline-size="40%"></span><span class="b" style:inline-size="80%"></span><span class="b" style:inline-size="60%"></span>
    {/if}
  </div>
{:else if kind === 'projects'}
  <!-- THE PROJECTS ARE CARDS UNDER A HEAD OF THEIR OWN, on the ground, as they draw. -->
  <div class="sk-group" style="{area ? `grid-area:${area};` : ''}{h ? `block-size:${h}px` : ''}" aria-hidden="true">
    <span class="sk-head"><span class="g"></span><span class="b" style:inline-size="72px"></span></span>
    <span class="sk-cards">
      {#each { length: Math.max(1, Math.min(rows ?? 1, cols === 2 ? 1 : 3)) } as _, n (n)}
        <span class="sk-card surface-card"><span class="sk-row"><span class="o w32"></span><span class="st"><span class="b" style:inline-size="56%"></span><span class="b s" style:inline-size="34%"></span></span></span><span class="b fig" style:inline-size="44%"></span></span>
      {/each}
    </span>
  </div>
{:else}
  <div class="sk" class:surface-card={!fill} class:fill data-kind={kind} style="{area ? `grid-area:${area};` : ''}{h ? `block-size:${h}px` : ''}" aria-hidden="true">
    <span class="sk-head"><span class="g"></span><span class="b" style:inline-size={nameW}></span></span>
    {#if kind === 'ask'}
      {#each lines as n (n)}
        <span class="sk-row ask"><span class="o w32"></span><span class="st"><span class="b" style:inline-size={w(n)}></span><span class="b s" style:inline-size="30%"></span></span><span class="caps"><span class="cap"></span><span class="cap"></span></span></span>
      {/each}
    {:else if kind === 'late'}
      {#each lines as n (n)}
        <span class="sk-row"><span class="st"><span class="b" style:inline-size={w(n + 2)}></span><span class="b s" style:inline-size="28%"></span></span><span class="end"><span class="b" style:inline-size="56px"></span><span class="cap"></span></span></span>
      {/each}
    {:else if kind === 'faces'}
      {#each lines as n (n)}
        <span class="sk-row"><span class="o w28"></span><span class="st"><span class="b" style:inline-size={w(n + 1)}></span><span class="b s" style:inline-size={w(n + 4)}></span></span></span>
      {/each}
    {:else if kind === 'feed'}
      {#each lines as n (n)}
        <span class="sk-row"><span class="b s" style:inline-size="48px"></span><span class="o w20"></span><span class="st"><span class="b" style:inline-size={w(n + 3)}></span><span class="b s" style:inline-size="24%"></span></span></span>
      {/each}
    {:else if kind === 'cash'}
      <span class="sk-cash">
        <span class="st"><span class="b s" style:inline-size="64px"></span><span class="b hero" style:inline-size="148px"></span><span class="b s" style:inline-size="58%"></span></span>
        <span class="sk-pairs">
          {#each { length: Math.max(1, Math.min((rows ?? 1) - 1, 3)) } as _, n (n)}<span class="sk-pair"><span class="b s" style:inline-size="72px"></span><span class="b" style:inline-size="64px"></span></span>{/each}
        </span>
      </span>
    {:else if kind === 'figures'}
      <span class="sk-cols" style="--n:{Math.max(1, Math.min(rows ?? 1, cols === 2 ? 2 : 4))}">
        {#each { length: Math.max(1, Math.min(rows ?? 1, cols === 2 ? 2 : 4)) } as _, n (n)}
          <span class="st"><span class="b s" style:inline-size={w(n + 1)}></span><span class="b fig" style:inline-size="48%"></span><span class="b s" style:inline-size="36%"></span></span>
        {/each}
      </span>
    {:else if kind === 'figure'}
      <span class="sk-cols" style="--n:{Math.max(1, Math.min(rows ?? 1, 2))}">
        {#each { length: Math.max(1, Math.min(rows ?? 1, 2)) } as _, n (n)}
          <span class="st"><span class="b s" style:inline-size={w(n + 3)}></span><span class="b fig" style:inline-size="52%"></span></span>
        {/each}
      </span>
    {:else if kind === 'dates'}
      {#each lines as n (n)}
        <span class="sk-row"><span class="date"><span class="b xs"></span><span class="b day"></span></span><span class="st"><span class="b" style:inline-size={w(n + 5)}></span></span><span class="b" style:inline-size="52px"></span></span>
      {/each}
    {:else}
      {#each lines as n (n)}
        <span class="sk-row"><span class="o w20 ring"></span><span class="st"><span class="b" style:inline-size={w(n)}></span><span class="b s" style:inline-size="22%"></span></span></span>
      {/each}
    {/if}
  </div>
{/if}

<style>




  /* A CARD AS THE BOARD DRAWS ONE: the tile's padding, its head row and 12 under it, and what does not fit is cut. */
  .sk {
    display: flex;
    flex-direction: column;
    gap: var(--card-head-gap);
    min-inline-size: 0;
    align-self: start;
    padding: var(--tile-pad);
    overflow: hidden;
    container-type: inline-size;
    animation: sk-in var(--d-state) var(--ease-out) backwards;
  }

  .sk-group {
    display: flex;
    flex-direction: column;
    gap: var(--card-head-gap);
    min-inline-size: 0;
    align-self: start;
    overflow: hidden;
    animation: sk-in var(--d-state) var(--ease-out) backwards;
  }

  .sk-group > .sk-head {
    padding-inline: var(--title-inset, 12px);
  }

  .sk-cards {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(0, 1fr);
    gap: var(--tile-gap);
    flex: 1;
    min-block-size: 0;
  }

  .sk-card {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: var(--sp-3);
    padding: var(--tile-pad);
  }

  /* THE ONE CARD HEAD (RHYTHM.md §5): a 28 row, an 18 glyph, the name beside it. */
  .sk-head {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: 28px;
  }

  .sk-head > .b {
    block-size: 12px;
  }

  .sk-row {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: 44px;
    min-inline-size: 0;
  }

  /* NEEDS YOU'S QUESTION: its well, its two lines and its answers on the second line at the right. */
  .sk-row.ask {
    align-items: start;
    padding-block: var(--sp-1);
  }

  .st {
    display: grid;
    gap: var(--sp-2);
    flex: 1;
    min-inline-size: 0;
  }

  .end {
    display: grid;
    justify-items: end;
    gap: var(--sp-2);
  }

  .caps {
    display: flex;
    gap: var(--sp-2);
    align-self: end;
  }

  /* INK AT A FIXED STRENGTH (as `Waiting.svelte`): the bars read on a card in light and in dark alike. */
  .b {
    display: block;
    block-size: 10px;
    max-inline-size: 100%;
    background: color-mix(in oklab, var(--ink) 9%, transparent);
    border-radius: var(--r-xs);
  }

  .b.s {
    block-size: 8px;
    background: color-mix(in oklab, var(--ink) 6%, transparent);
  }

  .b.xs {
    inline-size: 22px;
    block-size: 6px;
    background: color-mix(in oklab, var(--ink) 6%, transparent);
  }

  .b.day {
    inline-size: 18px;
    block-size: 16px;
  }

  .b.fig {
    block-size: 20px;
    border-radius: var(--r-ctl);
  }

  .b.hero {
    block-size: 26px;
    border-radius: var(--r-ctl);
  }

  .g,
  .o {
    flex: none;
    display: block;
    border-radius: var(--r-round, 999px);
    background: color-mix(in oklab, var(--ink) 6%, transparent);
  }

  .g {
    inline-size: var(--head-glyph, 18px);
    block-size: var(--head-glyph, 18px);
  }

  .o.w32 {
    inline-size: 32px;
    block-size: 32px;
  }

  .o.w28 {
    inline-size: 28px;
    block-size: 28px;
  }

  .o.w20 {
    inline-size: 20px;
    block-size: 20px;
  }

  /* A TASK'S TICK IS A RING, as it is drawn. */
  .o.ring {
    background: none;
    box-shadow: inset 0 0 0 1.5px color-mix(in oklab, var(--ink) 12%, transparent);
  }

  .cap {
    display: block;
    inline-size: 60px;
    block-size: 28px;
    border-radius: var(--r-pill, 999px);
    background: color-mix(in oklab, var(--ink) 6%, transparent);
  }

  .date {
    display: grid;
    justify-items: center;
    gap: var(--sp-1);
    inline-size: 32px;
  }

  .sk-cash {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
    gap: var(--sp-3) var(--sp-5);
    align-items: start;
  }

  .sk-pairs {
    display: grid;
    gap: var(--sp-3);
    padding-block-start: var(--sp-1);
  }

  .sk-pair {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--sp-3);
  }

  /* A NARROW CARD STACKS ITS CASH: the figure over the two beside it, as the card does under 480. And a question's
     answers take their own line under it, at its text's edge, as they do on a phone. */
  @container (inline-size < 30rem) {
    .sk-cash {
      grid-template-columns: minmax(0, 1fr);
    }

    .sk-row.ask {
      flex-wrap: wrap;
    }

    .sk-row.ask > .caps {
      flex-basis: 100%;
      padding-inline-start: 44px;
    }
  }

  .sk-cols {
    display: grid;
    grid-template-columns: repeat(var(--n, 1), minmax(0, 1fr));
    gap: var(--sp-5);
  }

  @keyframes sk-in {
    from {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .sk,
    .sk-group {
      animation: none;
    }
  }

  .sk-plug {
    gap: var(--sp-3);
    align-self: stretch;
  }

  .sk-plug > .b {
    block-size: 12px;
  }

  .sk-plug > .b.t {
    block-size: 14px;
  }

  .sk-row.tight {
    min-block-size: 0;
  }

  .cap.press {
    inline-size: 112px;
    margin-block-start: auto;
  }

  /* IN A CELL ALREADY SIZED (a Today card still arriving): the cell is the card. */
  .sk.fill {
    block-size: 100%;
    padding: 0;
    align-self: stretch;
  }
</style>
