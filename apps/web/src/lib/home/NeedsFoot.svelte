<!--
  THE FOOT OF TODAY'S NEEDS YOU TILE (today F3): what the questions over it leave out, in one or two plain lines.

  - The late bills with no question about them, as one line in red with its money: "4 payments are late, £10,540 in all",
    opening the late work (`/?work&late`). The questions about money owed to you lead the tile above it.
  - What BrainDog did by itself today: "BrainDog handled 15 itself today. Review", opening Needs you's Handled.
  - What an agent asked him back, of what he told it (agents and MCP plan §7.2): "Claude needs you on “Merge wave 1”",
    its question under it, and Answer, which opens the agents and the run's thread; these count in Needs you's number.
  - What agents finished of what he told them today: "Claude finished what you told it. Review", opening Handled.
  - What he has shared out, as one quiet line opening People & sharing: a share made today
    by its own words, "You shared Kiln with priya@studio.co. Not you? Stop it", and otherwise how many it is with,
    "Shared with Priya and Accountants. See who". In red only when it needs him: a wide share made today on an account with no
    passkey to have confirmed it (`Boot.shared.needs`).

  DRAWN AS THE TILE'S LOWER PART, under the queue the page's reader draws (Home lays the two together on the board), so
  the tile reads as one. WITH NOTHING TO ASK (`alone`) it is the whole tile: the heading, a calm mark, "Nothing needs
  you", and the same lines under it, so Today never drops the place where questions land.
-->
<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import { at } from '$lib/at.ts';
  import { WORK } from '$lib/nav.ts';
  import type { ToldNeed } from '$lib/record/told-live.ts';
  import { sharedLine, type SharedOut } from './shared-line.ts';

  let {
    alone = false,
    heading,
    late = null,
    handled = 0,
    told = [],
    finished = [],
    shared,
    calm,
    calmWhy = null,
    line = false,
  }: {
    /** Nothing waits: the foot is the whole tile. */
    alone?: boolean;
    /** The tile's heading, as Today's body words it. */
    heading: string;
    /** The late bills with no question about them: how many, and their money as a display figure says it. */
    late?: { count: number; said: string } | null;
    /** How many things BrainDog did by itself today. */
    handled?: number;
    /** What agents asked him back, of what he told them. */
    told?: readonly ToldNeed[];
    /** Who finished what he told them today, by agent name, one per instruction. */
    finished?: readonly string[];
    /** What he has shared out, as `boot` says it: an owner's alone. */
    shared?: SharedOut | undefined;
    /** The calm line drawn alone ("Nothing needs you"). */
    calm: string;
    /** What will be here, under the calm line on a tile with nothing in it, so the tile says how it fills (Look B Empty). */
    calmWhy?: string | null;
    /** A first Today's (T8): with nothing to ask, one line under Tell instead of a whole tile, until something waits. */
    line?: boolean;
  } = $props();

  const words = {
    late: (n: number, said: string) => `${n.toLocaleString('en-GB')} ${n === 1 ? 'payment is' : 'payments are'} late, ${said} in all`,
    handled: (n: number) => `BrainDog handled ${n.toLocaleString('en-GB')} today`,
    review: 'Review',
    waits: 'When a bill is late or an agent asks, it waits here.',
    answer: 'Answer',
    finished: (who: readonly string[]) =>
      who.length === 1 ? `${who[0]!} finished what you asked` : `Agents finished ${who.length.toLocaleString('en-GB')} asks today`,
  } as const;

  const sharedSaid = $derived(shared === undefined ? null : sharedLine(shared));
  const any = $derived((late !== null && late.count > 0) || handled > 0 || told.length > 0 || finished.length > 0 || sharedSaid !== null);
  /* WHAT WAITS ON HIM IS NOT CALM: with only an agent's question, the tile holds that and not "Nothing needs you". */
  const calmNow = $derived(alone && told.length === 0);
</script>

{#if line && alone && !any && told.length === 0}
  <!-- ONE LINE ON A FIRST TODAY (T8): the tile was a full row for two lines of nothing. Named for a reader, as the tile is. -->
  <section class="needs-foot" data-needs-foot data-line aria-label={heading}>
    <p class="nf-one"><Icon name="inbox" size="s" /><span><span class="nf-one-calm">{calm}.</span> {words.waits}</span></p>
  </section>
{:else if alone || any}
  <!-- NOT A LANDMARK OF ITS OWN UNDER THE QUEUE: there it is the lower part of the Needs you tile, which is already the
       region named Needs you, and a second region of the same name gave a landmark list two alike with no way to tell
       which is which. Unnamed, a section is no landmark, and its lines read as the tile's. -->
  <section class="needs-foot" data-needs-foot data-alone={alone ? '' : undefined}>
    {#if alone}
      <header class="nf-head">
        <IconWell name="inbox" size="m" />
        <h2 class="nf-title">{heading}{#if told.length > 0}<span class="nf-count num">{told.length}</span>{/if}</h2>
      </header>
      {#if calmNow}<p class="nf-calm"><IconWell name="check" size="l" tone="good" /><span>{calm}</span></p>{#if calmWhy && !any}<p class="nf-why">{calmWhy}</p>{/if}{/if}
    {/if}
    {#if any}
      <ul class="nf-lines">
        {#each told as t (t.key)}
          <li>
            <a class="nf-line nf-told" href={at('/p/agents')} data-told>
              <Icon name="session" size="s" /><span class="nf-words"
                ><span class="nf-what" dir="auto">{t.line}</span>{#if t.reply}<span class="nf-reply" dir="auto">{t.reply}</span>{/if}</span
              ><span class="nf-go" data-needs>{words.answer}</span>
            </a>
          </li>
        {/each}
        {#if late && late.count > 0}
          <li>
            <a class="nf-line nf-late" href={at(`${WORK}&late`)}>
              <Icon name="clock" size="s" /><span class="nf-words">{words.late(late.count, late.said)}</span><Icon name="chevron" size="s" />
            </a>
          </li>
        {/if}
        {#if finished.length > 0}
          <li>
            <a class="nf-line nf-handled" href={at('/decide?show=handled')} data-finished>
              <Icon name="session" size="s" /><span class="nf-words">{words.finished(finished)}</span><span class="nf-go">{words.review}</span>
            </a>
          </li>
        {/if}
        {#if sharedSaid}
          <li>
            <a class="nf-line nf-shared" href={at('/settings/sharing')} data-shared data-needs={sharedSaid.needs ? '' : undefined}>
              <Icon name="user-plus" size="s" /><span class="nf-words">{sharedSaid.words}</span><span class="nf-go">{sharedSaid.go}</span>
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

  .needs-foot[data-line] {
    padding: var(--sp-3) var(--tile-pad);
    border-radius: var(--r-tile);
  }

  .nf-one {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 20px;
  }

  .nf-one > :global(svg) {
    flex: none;
    align-self: center;
  }

  .nf-one-calm {
    color: var(--ink);
    font-weight: 500;
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

  /* UNDER THE CALM LINE, IN LINE WITH ITS WORDS (AP22): what will be here, so a first Today's empty tile is not a heading
     over a band of nothing. */
  .nf-why {
    max-inline-size: var(--measure);
    margin: calc(-1 * var(--sp-2)) 0 0 calc(32px + var(--sp-3));
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: 18px;
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

  .nf-handled > :global(.icon),
  .nf-told > :global(.icon),
  .nf-shared > :global(.icon) {
    color: var(--ink-3);
  }

  /* A SHARE THAT NEEDS HIM IS THE ONE RED LINE OF ITS KIND: the words in red at 600, as a late bill's are. */
  .nf-shared[data-needs] {
    color: var(--red);
    font-weight: 600;
  }

  .nf-shared[data-needs] > :global(.icon) {
    color: var(--red);
  }

  /* AND QUIET OTHERWISE, its way in too: what is shared out is not something late. */
  .nf-shared:not([data-needs]) .nf-go {
    color: var(--ink);
  }

  /* AN AGENT'S QUESTION: what it is on in the ink, its question under it in the second ink, two lines at most. */
  .nf-told {
    align-items: start;
    padding-block: var(--sp-3);
  }

  .nf-told > :global(.icon) {
    margin-block-start: 3px;
  }

  .nf-what,
  .nf-reply {
    display: block;
  }

  .nf-what {
    color: var(--ink);
    font-weight: 500;
  }

  .nf-reply {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .nf-go[data-needs],
  .nf-shared[data-needs] .nf-go {
    color: var(--red);
  }

  .nf-count {
    margin-inline-start: var(--sp-2);
    color: var(--red);
    font-weight: 600;
  }

  /* THE WORD AT A LINE'S END IS A LINK IN INK; red only where it answers something that needs him. */
  .nf-go {
    flex: none;
    color: var(--ink);
    font-weight: 500;
  }

  @media (hover: hover) and (pointer: fine) {
    .nf-line:hover .nf-words,
    .nf-handled:hover .nf-go,
    .nf-told:hover .nf-go,
    .nf-shared:hover .nf-go {
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  }

  .nf-line:focus-visible {
    outline-offset: -2px;
  }
</style>
