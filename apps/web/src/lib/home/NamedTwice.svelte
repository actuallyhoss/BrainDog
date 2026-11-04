<!--
  May be one, as one tile at the end of the board: two of his things the record may hold twice, by
  name, with the record's own reason under them, at most three and a count of the rest.

  A DOUBTFUL PAIR WAS NEVER SEEN. The record could find two organisations or two projects with one name, and no screen
  said so. Here it does, and a doubtful merge goes to Decide as one question.

  AN OFFER AND NEVER A FOLD. "Ask me in Needs you" only files the question; his yes there folds the pair, with one Undo.
  After the press the line reads "In Needs you", a link to that question. A press the record refuses says the record's
  own sentence beside the line, and the button stays for another try.

  NO BUTTON WHERE THE RECORD CANNOT ASK (`can` false): the pair is still said. Nothing at nought.

  The button and the link are rectangles, 40 tall with the 44 hit box under a thumb (`ui/Button.svelte`, `.tap`).
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import Button from '$lib/ui/Button.svelte';
  import { askSameAt, PEOPLE_TWICE_HREF, peopleTwiceSaid, type NamedTile } from './named-twice.ts';

  let { found }: { found: NamedTile } = $props();

  const words = {
    ask: 'Ask me in Needs you',
    on: 'In Needs you',
    show: 'Show them',
  } as const;

  /* WHAT EACH PRESS ANSWERED, by the pair's handle: the question it filed, or the record's sentence for why not. */
  let asked = $state.raw<Readonly<Record<string, string>>>({});
  let refused = $state.raw<Readonly<Record<string, string>>>({});
  let busy = $state<string | null>(null);

  async function ask(pair: string) {
    if (busy !== null) return;
    busy = pair;
    try {
      const out = await askSameAt(apiBase(), pair);
      if (out.ok) {
        asked = { ...asked, [pair]: out.question };
        refused = Object.fromEntries(Object.entries(refused).filter(([k]) => k !== pair));
      } else refused = { ...refused, [pair]: out.fix };
    } finally {
      busy = null;
    }
  }
</script>

{#if found.lines.length > 0 || found.people > 0}
  <section class="named" aria-labelledby="named-h" data-named-twice>
    <h2 class="n-head" id="named-h">{found.heading}</h2>
    {#if found.lines.length > 0}
      <ul class="n-list">
        {#each found.lines as line (line.pair)}
          {@const question = asked[line.pair]}
          <li class="n-row">
            <div class="n-main">
              <div class="n-text">
                <p class="n-line" dir="auto">{line.text}</p>
                {#if line.why}<p class="n-why" dir="auto">{line.why}</p>{/if}
              </div>
              {#if question}
                <a class="n-on tap" href={at(`/decide/${encodeURIComponent(question)}`)} data-named-on>{words.on}</a>
              {:else if line.can}
                <Button size="sm" aria-label="{words.ask}: {line.text}" disabled={busy !== null} aria-busy={busy === line.pair} data-named-ask onclick={() => void ask(line.pair)}>
                  {words.ask}
                </Button>
              {/if}
            </div>
            {#if refused[line.pair]}<p class="n-no" role="status" dir="auto">{refused[line.pair]}</p>{/if}
          </li>
        {/each}
      </ul>
    {/if}
    {#if found.more}<p class="n-more">{found.more[0]!.toUpperCase() + found.more.slice(1)}.</p>{/if}
    <!-- PEOPLE LISTED TWICE: the kernel's count, with the way to the People list narrowed to them. The fold is asked there. -->
    {#if found.people > 0}
      <div class="n-people" data-named-people>
        <p class="n-line" dir="auto">{peopleTwiceSaid(found.people)}</p>
        <a class="n-on tap" href={at(PEOPLE_TWICE_HREF)}>{words.show}</a>
      </div>
    {/if}
  </section>
{/if}

<style>
  /* A TILE OF ITS OWN, the whole row of the board: flat, no border, no shadow, the board's own radius. */
  .named {
    grid-column: 1 / -1;
    min-inline-size: 0;
    padding: var(--tile-pad, 20px);
    background: var(--tile);
    border-radius: var(--r-tile, 16px);
  }

  .n-head {
    margin: 0;
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: 1.4;
  }

  .n-people {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2) var(--sp-3);
    margin-block-start: var(--sp-3);
    min-inline-size: 0;
  }

  .n-list {
    display: flex;
    flex-direction: column;
    margin: var(--sp-3) 0 0;
    padding: 0;
    list-style: none;
  }

  .n-row {
    padding-block: var(--sp-3);
  }

  /* THE HAIRLINE BETWEEN TWO, as between two rows of any list here (`ui/rows.css`). */
  .n-row + .n-row {
    border-block-start: 1px solid var(--rule);
  }

  .n-row:last-child {
    padding-block-end: 0;
  }

  /* THE NAMES AND THEIR PRESS ON ONE LINE, the press at the end; it drops under the names on a phone (390). */
  .n-main {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-3);
    min-inline-size: 0;
  }

  .n-text {
    flex: 1 1 16rem;
    min-inline-size: 0;
  }

  .n-line {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body, 15px);
    line-height: calc(22px * var(--type, 1));
    overflow-wrap: anywhere;
  }

  /* THE REASON UNDER THE NAMES, in the quieter colour at the row's own size. */
  .n-why,
  .n-no,
  .n-more {
    margin: var(--sp-1) 0 0;
    color: var(--ink-3);
    font-size: var(--fs-body, 15px);
    line-height: calc(22px * var(--type, 1));
    overflow-wrap: anywhere;
  }

  .n-no {
    margin-block-start: var(--sp-2);
    color: var(--ink);
  }

  .n-more {
    margin-block-start: var(--sp-3);
  }

  /* ON DECIDE: a link in the working accent, as tall as the button it replaced, its 44 hit box from `.tap`. */
  .n-on {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--btn-h-sm, 28px);
    border-radius: var(--r-ctl, 8px);
    color: var(--red);
    font-size: var(--fs-body, 15px);
    font-weight: 500;
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  @media (forced-colors: active) {
    .named {
      border: 1px solid CanvasText;
    }
  }
</style>
