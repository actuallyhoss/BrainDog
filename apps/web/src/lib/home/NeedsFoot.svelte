<!--
  THE FOOT OF TODAY'S NEEDS YOU TILE (today F3, F6, F13): what the questions over it leave out, in one or two plain lines.

  - The late bills with no question about them, as one line in red with its money: "4 payments are late, £10,593 in all",
    opening the late work (`/?work&late`). The questions about money owed to you lead the tile above it.
  - What BrainDog did by itself today: "BrainDog handled 15 itself today. Review", opening Needs you's Handled.

  DRAWN AS THE TILE'S LOWER PART, under the queue the page's reader draws (Home lays the two together on the board), so
  the tile reads as one. WITH NOTHING TO ASK (`alone`) it is the whole tile: the heading, a calm mark, "Nothing needs
  you", and the same lines under it, so Today never drops the place where questions land.
-->
<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import { at } from '$lib/at.ts';
  import { WORK } from '$lib/nav.ts';

  let {
    alone = false,
    heading,
    late = null,
    handled = 0,
    calm,
  }: {
    /** Nothing waits: the foot is the whole tile. */
    alone?: boolean;
    /** The tile's heading, as Today's body words it. */
    heading: string;
    /** The late bills with no question about them: how many, and their money as a display figure says it. */
    late?: { count: number; said: string } | null;
    /** How many things BrainDog did by itself today. */
    handled?: number;
    /** The calm line drawn alone ("Nothing needs you"). */
    calm: string;
  } = $props();

  const words = {
    late: (n: number, said: string) => `${n.toLocaleString('en-GB')} ${n === 1 ? 'payment is' : 'payments are'} late, ${said} in all`,
    handled: (n: number) => `BrainDog handled ${n.toLocaleString('en-GB')} itself today.`,
    review: 'Review',
  } as const;

  const any = $derived((late !== null && late.count > 0) || handled > 0);
</script>

{#if alone || any}
  <section class="needs-foot" data-needs-foot data-alone={alone ? '' : undefined} aria-label={alone ? undefined : heading}>
    {#if alone}
      <header class="nf-head">
        <IconWell name="inbox" size="m" />
        <h2 class="nf-title">{heading}</h2>
      </header>
      <p class="nf-calm"><IconWell name="check" size="l" tone="good" /><span>{calm}</span></p>
    {/if}
    {#if any}
      <ul class="nf-lines">
        {#if late && late.count > 0}
          <li>
            <a class="nf-line nf-late" href={at(`${WORK}&late`)}>
              <Icon name="clock" size="s" /><span class="nf-words">{words.late(late.count, late.said)}</span><Icon name="chevron" size="s" />
            </a>
          </li>
        {/if}
        {#if handled > 0}
          <li>
            <a class="nf-line nf-handled" href={at('/decide?show=handled')}>
              <Icon name="check" size="s" /><span class="nf-words">{words.handled(handled)}</span><span class="nf-go">{words.review}</span>
            </a>
          </li>
        {/if}
      </ul>
    {/if}
  </section>
{/if}

<style>
  .needs-foot {
    display: grid;
    gap: var(--sp-3);
    min-inline-size: 0;
    padding: 0 var(--tile-pad) var(--sp-4);
    background: var(--tile);
    border-radius: 0 0 var(--r-tile) var(--r-tile);
  }

  .needs-foot[data-alone] {
    gap: var(--sp-4);
    padding: var(--tile-pad);
    border-radius: var(--r-tile);
  }

  .nf-head {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: 28px;
  }

  .nf-title {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 600;
    line-height: 1.3;
  }

  .nf-calm {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-head);
    font-weight: 600;
  }

  .nf-lines {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .nf-lines > li {
    border-block-start: 1px solid var(--rule);
  }

  .nf-line {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: 44px;
    color: var(--ink-2);
    font-size: var(--fs-body);
    text-decoration: none;
    transition: color var(--d-state) var(--ease-out);
  }

  .nf-words {
    flex: 1 1 auto;
    min-inline-size: 0;
  }

  .nf-late {
    color: var(--red);
    font-weight: 600;
  }

  .nf-handled > :global(.icon) {
    color: var(--ink-3);
  }

  .nf-go {
    flex: none;
    color: var(--red);
    font-weight: 500;
  }

  @media (hover: hover) and (pointer: fine) {
    .nf-line:hover .nf-words,
    .nf-handled:hover .nf-go {
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  }

  .nf-line:focus-visible {
    outline-offset: -2px;
  }
</style>
