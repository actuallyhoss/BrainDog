<!--
  LATE AND HANDED BACK'S ROOM, HELD WHILE ITS CODE IS ON ITS WAY (nojump, 2 Nov).

  Today's reader waits for the tiles' code at most 250ms (`tile-code.ts` `tilesLanded`) and then draws the page. On a
  slow phone Late's code could miss that, and its slot drew nothing until it came: every tile under it then moved down
  157px (verify4, a layout shift of 0.25). So the slot draws this in its place: the same tile, its heading, count and the
  same lines in the same type and the same grid, with nothing to press. The tile that lands takes the same room, so
  nothing under it moves. It is static: no reads, no writes, inert and hidden from a screen reader, which hears the tile
  once it lands.

  Its rules copy `LateNow.svelte`'s for size only (the grid, the paddings, the line heights, the tap heights). A change
  to one that moves a line's height belongs in both.
-->
<script lang="ts">
  import { writeAmount } from 'braindog-render';
  import { homeCurrency } from '$lib/record/api.ts';
  import Button from '$lib/ui/Button.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import type { HomeLine } from './home-rows.ts';
  import { asideToday, isBill, lateWords, verbOf } from './late-verb.ts';

  let { lines, heading, more = 0, most, writes }: { lines: readonly HomeLine[]; heading: string; more?: number; most: number; writes: (list: string) => boolean } = $props();

  const kept = $derived.by(() => {
    const aside = asideToday();
    return lines.filter((l) => !aside.has(l.key));
  });
  const shown = $derived(kept.slice(0, most));
  const hidden = $derived(kept.length - shown.length);

  function amountSaid(line: HomeLine): string | null {
    const sign = /^[−-]/u.test(line.amount?.text ?? '') ? '−' : line.amount?.text.startsWith('+') ? '+' : '';
    if (!line.money) return line.amount ? line.amount.text : null;
    const { minor, currency } = line.money;
    const said = writeAmount({ minor: Math.abs(minor), currency }, homeCurrency(), 'read')?.text ?? null;
    return said === null ? null : `${sign}${said}`;
  }
</script>

<div class="late-hold" aria-hidden="true" inert data-late-hold>
  <Tile icon="clock" title={heading} count={kept.length + more}>
    <ul class="late">
      {#each shown as line (line.key)}
        {@const verb = verbOf(line, writes)}
        {@const bill = isBill(line)}
        {@const amount = amountSaid(line)}
        <li class="ln" data-bill={bill ? '' : undefined}>
          {#if !bill && verb}<span class="ln-tick"></span>{/if}
          <span class="ln-title">{line.title}</span>
          {#if amount}<span class="ln-amount num">{amount}</span>{/if}
          <p class="ln-when">{line.when ?? ''}{#if line.day && line.late}{line.when ? ' · ' : ''}due {line.day}{/if}</p>
          {#if bill && (verb || line.href)}
            <span class="ln-acts"><Button size="sm" disabled>{verb ? lateWords.paid : 'Open'}</Button>{#if verb}<Button size="sm" disabled>{lateWords.notYet}</Button>{/if}</span>
          {/if}
        </li>
      {/each}
    </ul>
    {#if hidden > 0}<p class="late-more">{hidden} more</p>{/if}
    {#if more > 0 && hidden === 0}<p class="late-past">and {more} more, past these</p>{/if}
  </Tile>
</div>

<style>
  .late-hold {
    display: contents;
  }

  .late {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .ln {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-areas:
      'tick title amount'
      'tick when acts';
    align-items: center;
    gap: var(--sp-1) var(--sp-4);
    padding-block: var(--sp-3);
  }

  .ln:first-child {
    padding-block-start: 0;
  }

  .ln + .ln {
    border-block-start: 1px solid var(--rule);
  }

  .ln:not(:has(> .ln-tick)) {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'title amount'
      'when acts';
  }

  .ln-title {
    grid-area: title;
    min-inline-size: 0;
    color: var(--ink-3);
    font-size: var(--fs-body);
    font-weight: var(--fw-semi);
    line-height: calc(22px * var(--type, 1));
    overflow-wrap: anywhere;
  }

  .ln-amount {
    grid-area: amount;
    color: var(--ink-3);
    font-size: var(--fs-body);
    font-weight: var(--fw-semi);
    font-variant-numeric: tabular-nums;
  }

  .ln-when {
    grid-area: when;
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: calc(18px * var(--type, 1));
  }

  .ln-acts {
    display: flex;
    grid-area: acts;
    justify-content: flex-end;
    gap: var(--sp-2);
  }

  .ln-tick {
    grid-area: tick;
    inline-size: 24px;
    block-size: 24px;
    border: 1.5px solid var(--rule-strong);
    border-radius: 50%;
  }

  @media (pointer: coarse) {
    .ln-tick {
      inline-size: var(--tap, 44px);
      block-size: var(--tap, 44px);
      border: 0;
    }

    .ln-title {
      display: flex;
      align-items: center;
      min-block-size: var(--tap, 44px);
    }
  }

  @media (width < 640px) {
    .ln[data-bill] {
      grid-template-areas:
        'tick title amount'
        'tick when when'
        'tick acts acts';
    }

    .ln[data-bill]:not(:has(> .ln-tick)) {
      grid-template-areas:
        'title amount'
        'when when'
        'acts acts';
    }

    .ln-acts {
      justify-content: flex-start;
      padding-block-start: var(--sp-1);
    }
  }

  .late-more,
  .late-past {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .late-more {
    align-self: flex-start;
    font-weight: var(--fw-medium);
  }
</style>
