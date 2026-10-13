<!--
  `ring`: a small dial with its figure in the centre, beside the rows as words. One row is progress toward a target;
  two to five are parts, said as a legend of dots in the arcs' steps. `src/ring.ts` decides every arc, share and word;
  `ring` in `src/html.ts` is this file's twin, and `ring.test.ts` holds the two to one tree.

  IT IS ON `proportional` AND HAD NO ARM THERE, so until this file the app drew a ring as the generic bar: one track
  per row scaled off the value, and the target printed as a note (measured by the parity shapes, which failed on
  every one before this file, while `toHTML` drew the dial).
-->
<script lang="ts">
  import { headlineFigure, inline, TONES, MISSING, text, type Block, type Row, type RenderOptions } from '../../src/index.ts';
  import { RING_NONE, RING_OF, RING_PAINT, RING_STEP_OPACITY, ringPlan } from '../../src/ring.ts';
  import Text from '../Text.svelte';

  let { block, opts = {} }: { block: Block; opts?: RenderOptions } = $props();

  const said = (r: Row, i: number): string => text(inline(r.cells[i] ?? '', opts));
  const plan = $derived(ringPlan(block.rows.map((r) => ({ label: said(r, 0), value: said(r, 1), third: said(r, 2), ...(r.tone ? { tone: r.tone } : {}) })), opts.home));
  /* The glyph only for a word `TONES` owns, as `toneGlyph` in the mirror checks. */
  /* A late arc is striped as well as red (DIRECTION §42). Its dashes already draw its length, so the mark is a pattern
     of its own, and `$props.id()` keeps two dials on one page from painting from one another's (`lateId` in the mirror). */
  const uid = $props.id();
  const late = $derived(plan.arcs.some((a) => a.tone === 'bad') ? `${uid}-late` : '');
  const glyph = (tone?: string) => (tone && Object.hasOwn(TONES, tone) ? TONES[tone as keyof typeof TONES] : null);
</script>

{#snippet mark(tone?: string)}{@const g = glyph(tone)}{#if g}<span class="glyph" role="img" aria-label={g.label}>{g.glyph}</span>{/if}{/snippet}

{#if plan.empty}
  <div class="prop ring"><p class="ring-empty">{RING_NONE}</p></div>
{:else}
  <div class="prop ring" data-form={plan.form}>
    {#if plan.ring}
      <div class="ring-dial">
        <svg class="ring-mark" viewBox="0 0 36 36" role="img" aria-label={plan.name}>
          {#if late}
            <defs
              ><pattern class="late-hatch" id={late} patternUnits="userSpaceOnUse" width="4" height="4"
                ><rect class="late-ground" width="4" height="4" fill="currentColor" fill-opacity="0.3"></rect><path
                  class="late-stripe"
                  d="M0 0H2L0 2ZM4 0V2L2 4H0Z"
                  fill="currentColor"
                ></path></pattern
              ></defs
            >
          {/if}
          <circle class="ring-track" {...RING_PAINT.track} cx="18" cy="18" r="16" pathLength="100"></circle>
          {#each plan.arcs as a}
            <circle
              class="ring-arc"
              data-step={a.step}
              data-intent={a.tone}
              {...RING_PAINT.arc}
              style={a.tone === 'bad' ? `stroke:url(#${late}) var(--chart-late, currentColor)` : undefined}
              stroke-opacity={RING_STEP_OPACITY[a.step]}
              stroke-dasharray={a.dash}
              stroke-dashoffset={a.offset}
              transform="rotate(-90 18 18)"
              cx="18"
              cy="18"
              r="16"
              pathLength="100"
            ></circle>
          {/each}
        </svg>
        <!-- Hidden, because the dial's name says it and the words beside it say every figure again. -->
        {#if plan.centre}<span class="ring-figure num" aria-hidden="true">{plan.centre}</span>{/if}
      </div>
    {/if}
    {#if plan.form === 'progress'}
      {@const r = block.rows[0]!}
      <div class="ring-row" data-intent={plan.intent}>
        <span class="ring-label"><Text nodes={inline(r.cells[0] ?? '', opts)} {opts} /></span>
        <span class="ring-figures num"
          ><span class="ring-value"><Text nodes={inline(headlineFigure(r.cells[1] || MISSING, opts.home), opts)} {opts} /></span>{#if r.cells[2]}<span class="ring-of">{RING_OF}</span><span
              class="ring-target"><Text nodes={inline(headlineFigure(r.cells[2], opts.home), opts)} {opts} /></span
            >{/if}</span
        >
        {#if plan.left}<span class="ring-left num">{plan.left}</span>{/if}
        {@render mark(plan.intent)}
      </div>
    {:else}
      <ul class="ring-legend">
        {#each block.rows as r, i}
          {@const arc = plan.arcs.find((a) => a.row === i)}
          <li class="ring-item" data-intent={r.tone}>
            <span class="ring-dot" data-step={arc?.step} aria-hidden="true"></span>
            <span class="ring-label"><Text nodes={inline(r.cells[0] ?? '', opts)} {opts} /></span>
            <span class="ring-value num"><Text nodes={inline(headlineFigure(r.cells[1] || MISSING, opts.home), opts)} {opts} /></span>
            {#if plan.shares[i]}<span class="ring-share num">{plan.shares[i]}</span>{/if}
            {#if r.cells[2]}<span class="ring-note"><Text nodes={inline(r.cells[2], opts)} {opts} /></span>{/if}
            {@render mark(r.tone)}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}
