<!--
  What went stale, as one quiet tile under the page: "4 things went stale" as its heading, then a line
  a kind with how many, each of them the record's own sentence.

  THE RECORD COUNTED WHAT WENT STALE AND NO SCREEN SAID IT. An agent was told when it started work; the person whose
  record it is was told nowhere. Here it is on the first screen: what went stale, how many, and where each is cleared.

  A LINE WITH A PLACE IS A LINK TO IT: steps nobody took open where the agents' work is read, a question that waited
  opens Needs you. A kind with no place of its own is words, and the record's tidy looks at those again by itself.

  NOTHING HERE IS A CALL. The record says how an agent clears each line; none of that is read by `stale.ts`, so none
  can be drawn.

  AND WHAT THE LESSONS SAY, under the record's lines: a skill whose lessons its text does not take in yet, a link to
  the skill, and a lesson two projects learned, with "Keep it once". That press puts the question to the person and
  opens Decide; while it waits it cannot be pressed again, and a refusal is said under its line in plain words.

  AND WHAT THE TIDY FOUND, finder by finder, in a fold under the list: "Empty runs: 41 stale, 3 cleared this
  week". It is read only once this part is drawn, by `import()` of `tidy-week.ts`, so Home's own read is never held for
  it. It is words alone: nothing in the fold tidies, asks or files, and a finder the record refused is not in it.

  AND WHAT IS HERE TWICE, IN A TILE OF ITS OWN: a list's twins are not things gone stale, so they
  are never counted in the stale heading. Their heading says what they are, "32 things are here twice", and each list is
  a line that opens where its twins fold.

  NOTHING IS DRAWN FOR NOTHING: not a heading, not an empty state. Six lines are listed and the rest are counted.

  QUIET: no red and no accent. Stale is not late, and nothing here waits on a day. The count is a pill, said aloud by
  the sentence beside it, so the pill itself is kept from a screen reader. A link is 44 tall under a thumb.
-->
<script lang="ts">
  import { idle } from '$lib/ui/idle.ts';
  import { goto } from '$app/navigation';
  import { apiBase, at } from '$lib/at.ts';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import { staleLine, staleShown, twiceHeading, twiceOf, type StaleRow } from './stale.ts';
  import { page } from '$app/state';
  import { heldHref } from '$lib/nav/rail.ts';

  let { rows: told }: { rows: readonly StaleRow[] } = $props();

  /* A LINE CLEARED ON A PAGE THE RECORD DOES NOT HOLD (the steps, on the agents page) IS WORDS, NOT A LINK (`heldHref`). */
  const pages = $derived((page.data as { pages?: readonly string[] } | undefined)?.pages);
  const rows = $derived(told.map((r) => (r.href === null ? r : { ...r, href: heldHref(pages, r.href) })));

  const words = {
    more: (n: number) => (n === 1 ? 'And one more of another kind.' : `And ${String(n)} more of other kinds.`),
    keep: 'Keep it once',
    tidy: 'What the tidy found',
  } as const;

  const line = $derived(staleLine(rows));
  const list = $derived(staleShown(rows));
  const twice = $derived(twiceOf(rows));
  const twiceSaid = $derived(twiceHeading(rows));

  /* THE LINE WHOSE PRESS IS ON ITS WAY, what each refusal said, and the presses a host cannot answer at all. */
  let waiting = $state<string | null>(null);
  let refused = $state.raw<Readonly<Record<string, string>>>({});
  let gone = $state.raw<ReadonlySet<string>>(new Set());

  /* WHAT THE TIDY FOUND, asked once this part draws and again when Home rereads; `null` until it answers, and for none. */
  let tidy = $state.raw<readonly { id: string; said: string }[] | null>(null);

  $effect(() => {
    if (!line) return;
    void rows;
    let here = true;
    /* AFTER THE TAB IS IDLE: two figures a finder are a dozen calls, each a place in the record's queue ahead of the next screen. */
    void Promise.all([import('./tidy-week.ts'), idle()]).then(async ([m]) => {
      if (!here) return;
      const found = await m.loadTidyWeek(apiBase());
      if (here) tidy = m.tidyWeekLines(found);
    }, () => {});
    return () => {
      here = false;
    };
  });

  async function keep(row: StaleRow): Promise<void> {
    if (!row.keep || waiting !== null) return;
    waiting = row.key;
    refused = Object.fromEntries(Object.entries(refused).filter(([key]) => key !== row.key));
    const out = await row.keep();
    waiting = null;
    if (out.ok) {
      void goto(at(out.href));
      return;
    }
    refused = { ...refused, [row.key]: out.said };
    if (out.gone) gone = new Set([...gone, row.key]);
  }
</script>

{#if line}
  <section class="stale" aria-labelledby="stale-h" data-stale>
    <div class="s-head">
      <IconWell name="clock" />
      <h2 class="s-said" id="stale-h">{line}</h2>
    </div>
    <ul class="s-list">
      {#each list.shown as row (row.key)}
        <li>
          {#if row.href}
            <a class="s-line" href={at(row.href)} data-stale-kind={row.key}>
              <span class="s-text" dir="auto">{row.said}</span>
              <span class="s-count" aria-hidden="true">{row.count}</span>
              <span class="s-go" aria-hidden="true"><Icon name="chevron" size="s" /></span>
            </a>
          {:else if row.keep}
            <div class="s-line s-pair" data-stale-kind="twice">
              <span class="s-text" dir="auto">{row.said}</span>
              {#if !gone.has(row.key)}
                <Button weight="quiet" size="sm" disabled={waiting !== null} aria-busy={waiting === row.key} onclick={() => void keep(row)}>
                  {words.keep}
                </Button>
              {/if}
            </div>
            {#if refused[row.key]}<p class="s-no" role="status">{refused[row.key]}</p>{/if}
          {:else}
            <p class="s-line" data-stale-kind={row.key}>
              <span class="s-text" dir="auto">{row.said}</span>
              <span class="s-count" aria-hidden="true">{row.count}</span>
            </p>
          {/if}
        </li>
      {/each}
    </ul>
    {#if list.more > 0}<p class="s-more">{words.more(list.more)}</p>{/if}
    {#if tidy}
      <details class="s-tidy" data-stale-tidy>
        <summary class="s-tidy-said">{words.tidy}</summary>
        <ul class="s-tidy-list">
          {#each tidy as found (found.id)}<li class="s-tidy-line" dir="auto">{found.said}</li>{/each}
        </ul>
      </details>
    {/if}
  </section>
{/if}

{#if twiceSaid}
  <section class="stale" aria-labelledby="twice-h" data-stale-twice>
    <div class="s-head">
      <IconWell name="copy" />
      <h2 class="s-said" id="twice-h">{twiceSaid}</h2>
    </div>
    <ul class="s-list">
      {#each twice as row (row.key)}
        <li>
          {#if row.href}
            <a class="s-line" href={at(row.href)}>
              <span class="s-text" dir="auto">{row.said}</span>
              <span class="s-count" aria-hidden="true">{row.count}</span>
              <span class="s-go" aria-hidden="true"><Icon name="chevron" size="s" /></span>
            </a>
          {:else}
            <p class="s-line">
              <span class="s-text" dir="auto">{row.said}</span>
              <span class="s-count" aria-hidden="true">{row.count}</span>
            </p>
          {/if}
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  /* A TILE OF ITS OWN, the whole row of the board: flat, no border, no shadow, the board's own radius. */
  .stale {
    grid-column: 1 / -1;
    min-inline-size: 0;
    padding: var(--tile-pad, 20px);
    background: var(--tile);
    border-radius: var(--r-tile, 16px);
  }

  .s-head {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .s-said {
    flex: 1;
    min-inline-size: 0;
    margin: 0;
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: 1.4;
  }

  .s-list {
    display: flex;
    flex-direction: column;
    margin: var(--sp-3) calc(-1 * var(--sp-3)) 0;
    padding: 0;
    list-style: none;
  }

  /* THE HAIRLINE BETWEEN TWO, as between two rows of any list here (`ui/rows.css`). */
  .s-list > li + li {
    border-block-start: 1px solid var(--rule);
  }

  .s-line {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    box-sizing: border-box;
    min-block-size: var(--row-h);
    margin: 0;
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--r-pop);
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: calc(22px * var(--type, 1));
    text-decoration: none;
  }

  a.s-line {
    transition: background var(--d-state) var(--ease-out);
  }

  a.s-line:hover {
    background: var(--hover);
  }

  .s-text {
    flex: 1;
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }

  /* THE COUNT, a pill as every count is, in the tile's own quiet ink. */
  .s-count {
    flex: none;
    min-inline-size: 24px;
    padding: 0 var(--sp-2);
    background: var(--hover);
    border-radius: var(--r-ctl);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-variant-numeric: tabular-nums;
    line-height: calc(24px * var(--type, 1));
    text-align: center;
  }

  .s-go {
    display: grid;
    flex: none;
    place-items: center;
    color: var(--ink-3);
  }

  /* A REFUSAL, under the line it answers, in the tile's quiet ink: it is not late and needs no red. */
  .s-no {
    margin: 0;
    padding: 0 var(--sp-3) var(--sp-2);
    color: var(--ink-2, var(--ink-3));
    font-size: var(--fs-meta);
    line-height: calc(20px * var(--type, 1));
  }

  .s-more {
    margin: var(--sp-3) 0 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: calc(20px * var(--type, 1));
  }

  /* THE FOLD: its summary a quiet line under the list, its lines plain words, none of them a press. */
  .s-tidy {
    margin: var(--sp-3) 0 0;
  }

  .s-tidy-said {
    inline-size: fit-content;
    min-block-size: var(--row-h);
    color: var(--ink-3);
    font-size: var(--fs-body);
    line-height: var(--row-h);
    cursor: pointer;
  }

  .s-tidy-list {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin: var(--sp-2) 0 0;
    padding: 0;
    list-style: none;
  }

  .s-tidy-line {
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: calc(22px * var(--type, 1));
    overflow-wrap: anywhere;
  }

  /* UNDER A THUMB A LINK IS 44 (13 §7): the pointer and not the width, as every row is. */
  @media (pointer: coarse) {
    a.s-line {
      min-block-size: var(--tap);
    }

    .s-tidy-said {
      min-block-size: var(--tap);
      line-height: var(--tap);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    a.s-line {
      transition: none;
    }
  }

  @media (forced-colors: active) {
    .stale {
      border: 1px solid CanvasText;
    }
  }
</style>
