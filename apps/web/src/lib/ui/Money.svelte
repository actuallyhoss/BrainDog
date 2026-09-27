<!--
  An amount.

  The record's home currency is written the way a person writes it, `£28,320.00`, at the size and in
  the ink of the figure. Any other currency keeps its symbol and puts its ISO code after the figure,
  small and quiet, `$4,800.00 USD`, so two currencies never read alike in one column; a currency with
  no symbol of its own keeps its code in front, `EGP 58,185.54`. A negative has a true minus in front
  of the symbol, `−£39.00`. The text `money()` writes is unchanged; only the drawing is.

  ONE PIECE, NEVER BROKEN. Sign, symbol, figure and code sit on one line, so a narrow column never
  leaves a minus or a `£` at the end of one line and the digits on the next.

  A FIGURE THAT DOES NOT FIT SHRINKS ONE TYPE STEP BEFORE IT IS CUT, AND IS NEVER CUT INSIDE ITSELF
  (design DSN-4). When the block it sits in is narrower than the figure, it is drawn a step smaller; if
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
    const seer = (watcher ??= new ResizeObserver((seen) => {
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
   * step is relative: `--t-md` is four fifths of `--t-lg`, and `--t-2xl` of `--t-3xl`.
   */
  const STEP = 0.8;
</script>

<script lang="ts">
  import { integer, money } from 'braindog-render';
  import { homeCurrency } from '$lib/record/api.ts';
  import { drawn } from '$lib/record/money.ts';

  let {
    minor,
    currency,
    weight = 'normal',
    home = homeCurrency(),
  }: { minor: number; currency: string; weight?: 'normal' | 'strong'; home?: string | null } = $props();

  /* A VALUE WITH NO CODE PRINTS ITS DIGITS AND NO CODE, which is the honest state of a money field
     with no currency. A figure `money()` could not state (`drawn` is null) prints as it was written. */
  const text = $derived(currency ? money(minor, currency) : integer(minor));
  const parts = $derived(currency ? drawn(text, home) : null);
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

<span class="money num" data-weight={weight} data-fit={fit} bind:this={node} title={fit === 'cut' ? whole : undefined}>{#if parts}<span class="amount">{parts.lead}{parts.whole}{parts.fraction}</span>{#if parts.iso}<span class="code">{parts.iso}</span>{/if}{:else}<span class="amount">{text}</span>{/if}</span>

<style>
  .money {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
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
    color: var(--dim);
    font-size: 0.85em;
    letter-spacing: 0;
  }

  .amount {
    color: inherit;
  }

  .money[data-weight='strong'] .amount {
    font-weight: 500;
  }
</style>
