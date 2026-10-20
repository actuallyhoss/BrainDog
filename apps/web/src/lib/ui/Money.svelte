<!--
  An amount (2.A.7).

  THE HOME CURRENCY NEVER PRINTS ITS CODE: `£28,320`. Any other currency keeps its symbol and puts its ISO code after
  the figure, 13px and quiet, `$4,800 USD`, so two currencies never read alike in one column; a currency with no symbol of
  its own keeps its code in front, `EGP 58,185.54`. A negative has a true minus in front of everything, `−£39`. Every
  figure is written by the one writer (`braindog-render`'s `money.ts`), so a cell, a tile and the palette agree.

  HOW MANY PLACES IS WHERE IT STANDS (`form`). `auto`, the default, is one amount standing alone: pence only when they
  are not `.00`. A list, a table or a row's page hands the set's answer (`moneySet`): `exact` when any amount in the
  column has pence, so every one shows two places, `auto` when none has. `whole` is a display figure (a tile, a hero, a
  card, Today, the palette, a sentence), rounded to the unit: "£33,850". A ledger amount is never rounded.

  UNTIL THE RECORD'S CURRENCY IS KNOWN it draws a quiet bar the figure's width and no text, rather than guessing: the
  first paint printed "£9,190.00" and the next "£9,190.00 GBP" for one amount.

  ONE PIECE, NEVER BROKEN. Sign, symbol, figure and code sit on one line, so a narrow column never
  leaves a minus or a `£` at the end of one line and the digits on the next.

  A FIGURE THAT DOES NOT FIT SHRINKS ONE TYPE STEP BEFORE IT IS CUT, AND IS NEVER CUT INSIDE ITSELF.
  When the block it sits in is narrower than the figure, it is drawn a step smaller; if
  that still does not fit, the code goes first and then the whole amount, behind an ellipsis, because
  `£4,8…` is a different number and a cut figure is worse than a missing one. The full figure stays in
  the text a screen reader reads, and in the title on a pointer.

  Tabular figures on the PROPORTIONAL face, never mono. A monospace face gives the thousands
  separator a full cell, and the comma floats in the middle of the number (13 §3.2).
-->
<script module lang="ts">
  /**
   * ONE OBSERVER FOR EVERY AMOUNT ON A SCREEN, keyed by the block each one sits in. A list draws a figure on every row,
   * and an observer per figure would be one callback per row on every resize; this is one observer, told which figures
   * share a block, and a block's figures are measured again only when that block changes size.
   */
  const inBlock = new Map<Element, Set<() => void>>();
  let watcher: ResizeObserver | null = null;

  function watch(block: Element, check: () => void): () => void {
    const seer = (watcher ??= frameResizeObserver((seen) => {
      for (const entry of seen) for (const again of inBlock.get(entry.target) ?? []) again();
    }));
    const checks = inBlock.get(block) ?? new Set<() => void>();
    if (!inBlock.has(block)) {
      inBlock.set(block, checks);
      seer.observe(block);
    }
    checks.add(check);
    return () => {
      checks.delete(check);
      if (checks.size > 0) return;
      inBlock.delete(block);
      watcher?.unobserve(block);
    };
  }

  /** What a box does not lay out itself: an inline run and a box with no box of its own. */
  const FLOWS = new Set(['inline', 'contents']);

  /** The block an amount is laid out in, which is the width it has: its nearest ancestor that is not a run of text. */
  function blockOf(node: Element): HTMLElement | null {
    let at = node.parentElement;
    while (at && FLOWS.has(getComputedStyle(at).display)) at = at.parentElement;
    return at;
  }

  /**
   * ONE TYPE STEP DOWN, as a share of the size the caller set. `Money` is drawn at whatever step its caller chose, so the
   * step is relative: `--fs-body` is four fifths of `--fs-head`, and `--fs-page` of `--fs-hero`.
   */
  const STEP = 0.8;
</script>

<script lang="ts">
  import { AMOUNT_SPACE, integer, moneySet, moneyWhole, writeAmount, type WrittenAmount } from 'braindog-render';
  import { page } from '$app/state';
  import { homeCurrency } from '$lib/record/api.ts';
  import { frameResizeObserver } from './resize.ts';

  let {
    minor,
    currency,
    weight = 'normal',
    form = 'auto',
    home,
  }: {
    minor: number;
    currency: string;
    weight?: 'normal' | 'strong';
    /** `auto`: pence only when not `.00`. `exact`: every minor unit (a set with pence). `whole`: a display figure. */
    form?: 'auto' | 'exact' | 'whole';
    /** The record's home currency, when the caller holds it; else the shell's. */
    home?: string | null | undefined;
  } = $props();

  /* THE SHELL SAYS THE RECORD'S CURRENCY ONCE `boot` HAS ANSWERED (`index.currency`, `null` for a record with none). Before
     then nothing is known, and a guess is the code appearing and going between two paints. */
  const told = $derived.by((): { known: boolean; home: string | null } => {
    if (home !== undefined) return { known: true, home };
    const index = (page.data as { index?: { currency?: string | null } } | undefined)?.index;
    if (index && Object.hasOwn(index, 'currency')) return { known: true, home: index.currency ?? null };
    const learnt = homeCurrency();
    return { known: learnt !== null, home: learnt };
  });

  /* A VALUE WITH NO CODE PRINTS ITS DIGITS AND NO CODE, which is the honest state of a money field with no currency. */
  const w = $derived.by((): WrittenAmount | null => {
    if (!currency) return null;
    const h = told.home;
    if (form === 'whole') return moneyWhole(minor, currency, h);
    if (form === 'exact') return writeAmount({ minor, currency }, h, 'exact');
    return moneySet([minor], currency, h).written[0] ?? null;
  });
  const parts = $derived(
    w ? { lead: `${w.minus}${w.codePlace === 'before' ? `${w.code}${AMOUNT_SPACE}` : w.sign}`, whole: w.whole, fraction: w.fraction, iso: w.codePlace === 'after' ? w.code : null } : null,
  );
  const text = $derived(w ? w.text : Number.isInteger(minor) ? integer(minor) : '');
  const whole = $derived(parts ? `${parts.lead}${parts.whole}${parts.fraction}${parts.iso ? ` ${parts.iso}` : ''}` : text);

  let node = $state<HTMLSpanElement | null>(null);
  /** `whole` at the caller's size, `step` one type step down, `cut` a step down and cut at the block's edge. */
  let fit = $state<'whole' | 'step' | 'cut'>('whole');

  /* MEASURED AGAINST THE BLOCK, AGAIN WHEN THE BLOCK OR THE FIGURE CHANGES. The width the figure needs is read at the
     size it is drawn now and scaled back to the caller's size, so the answer never depends on the one before it: a
     figure drawn a step down that would fit whole goes back to whole when its block widens. A cut figure is a box as
     wide as its block, so what it needs is its scroll width and not its own. */
  $effect(() => {
    const el = node;
    void whole;
    void weight;
    if (!el) return;
    const block = blockOf(el);
    if (!block) return;
    const check = () => {
      const style = getComputedStyle(block);
      const room = block.clientWidth - Number.parseFloat(style.paddingInlineStart) - Number.parseFloat(style.paddingInlineEnd);
      const now = el.dataset.fit;
      const drawnAt = now === 'cut' ? el.scrollWidth : el.getBoundingClientRect().width;
      const need = now === 'whole' ? drawnAt : drawnAt / STEP;
      /* A PIXEL OF SLACK, because a box's width is read in whole pixels and the figure's in fractions of one. */
      fit = need <= room + 1 ? 'whole' : need * STEP <= room + 1 ? 'step' : 'cut';
    };
    check();
    return watch(block, check);
  });
</script>

{#if currency && !told.known}<span class="money num money-held" aria-hidden="true" style={`inline-size: ${Math.max(3, whole.length - 3)}ch`}></span>{:else}<span class="money num" data-weight={weight} data-fit={fit} bind:this={node} title={fit === 'cut' ? whole : undefined}>{#if parts}<span class="amount">{parts.lead}{parts.whole}{parts.fraction}</span>{#if parts.iso}<span class="code">{parts.iso}</span>{/if}{:else}<span class="amount">{text}</span>{/if}</span>{/if}

<style>
  .money {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  /* THE CURRENCY NOT YET KNOWN: a quiet bar the figure's width, on the line where the figure will stand. */
  .money-held {
    display: inline-block;
    block-size: 0.9em;
    vertical-align: -0.1em;
    background: var(--tile-2);
    border-radius: var(--r-xs);
  }

  .money[data-fit='step'] {
    font-size: 0.8em;
  }

  /* CUT AT THE BLOCK'S EDGE, AND ONLY BETWEEN PIECES. The amount and the code are each one box, and an ellipsis hides a
     box whole rather than cutting through it, so what is lost is the code first and then the amount, never digits.
     A box that clips takes its bottom edge as its baseline, which would lift the figure above the words beside it, so
     it is set on the bottom of the line instead. */
  .money[data-fit='cut'] {
    display: inline-block;
    max-inline-size: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    vertical-align: bottom;
    font-size: 0.8em;
  }

  .money[data-fit='cut'] .amount,
  .money[data-fit='cut'] .code {
    display: inline-block;
  }

  /* `em` on purpose: `<Money>` renders at whatever size its caller sets, and the code stays a step
     smaller than the figure at every one of them. */
  .code {
    margin-inline-start: 0.3em;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    letter-spacing: 0;
  }

  .amount {
    color: inherit;
  }

  /* A STRONG FIGURE IS SET AT THE FIGURE'S WEIGHT, 600, the weight of titles and figures. It was 500, and
     because this rule sits on `.amount` it won over the caller: a row page's hero figure asks for 600 on `.lead-figure`
     and was drawn at 500 inside it. */
  .money[data-weight='strong'] .amount {
    font-weight: 600;
  }
</style>
