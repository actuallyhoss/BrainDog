<!--
  The one plan sheet (`loop/finish/platform.md` §4.0 P). Every install and every update draws this: an add-on or a
  module from its record's `Diff`, a use case pack by pack, and "Update all" as every plan at once before the one press.

  THE WHOLE PLAN, READ BY `plan.ts`: what stops it first, in the danger colour and with its glyph, then each pack's part
  with a section per thing it does (adds, changes, takes away with the rows each keeps, hands on, the owner's edits it
  carries over, settings kept or reset, example rows, rules that make rows), every line it calls out with, and what it
  touches. Anything that stops it keeps Approve from being pressed, because the record would refuse it anyway.

  A `Sheet`: a drawer from 640px up, and below it a bottom sheet with its sections as rows and the buttons pinned in its
  footer. `extra` is a question the install asks beside the plan, a use case's voice, drawn above the buttons.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { estimateOf } from '../record/actions.ts';
  import Sheet from '../ui/Sheet.svelte';
  import Button from '../ui/Button.svelte';
  import Icon from '../ui/Icon.svelte';
  import { sheetOf, words } from './plan.ts';

  let {
    diff,
    nameOf,
    hosted,
    busy,
    onapprove,
    oncancel,
    extra,
  }: {
    /** The record's `Diff`, a use case's `SharedPlan`, or an array of either for "Update all". */
    diff: unknown;
    /** A declaration id (`register.money`) or a pack id as the reader knows it. */
    nameOf: (id: string) => string;
    /** Whether this record counts runs against a monthly allowance (`hostedHere`). */
    hosted: boolean;
    busy: boolean;
    onapprove: () => void;
    oncancel: () => void;
    extra?: Snippet | undefined;
  } = $props();

  const sheet = $derived(sheetOf(diff, nameOf));
  const estimate = $derived(sheet ? estimateOf(sheet.callOuts, hosted) : null);
  const calls = $derived(sheet ? sheet.parts.flatMap((p) => p.calls.map((c) => ({ ...c, from: p.title }))) : []);
  const several = $derived((sheet?.parts.length ?? 0) > 1);

  let open = $state(true);
</script>

{#if sheet}
  <Sheet bind:open title={sheet.title} onclose={oncancel}>
    <div class="plan">
      {#if sheet.summary}<p class="plan-summary">{sheet.summary}</p>{/if}

      {#if sheet.stops.length > 0}
        <section class="plan-stops" role="alert" aria-labelledby="plan-stops-h">
          <h3 class="plan-h" id="plan-stops-h"><Icon name="alert" size="s" />{words.stops}</h3>
          <ul class="plan-rows">
            {#each sheet.stops as stop, i (i)}<li class="plan-row"><span class="plan-text">{stop}</span></li>{/each}
          </ul>
        </section>
      {/if}

      {#each sheet.parts as part (part.key)}
        <section class="plan-part" aria-label={part.title}>
          {#if several || part.move}
            <h3 class="plan-part-h">
              {#if several}<span class="plan-part-name">{part.title}</span>{/if}
              {#if part.move}<span class="plan-move">{part.move}</span>{/if}
            </h3>
          {/if}
          {#each part.sections as s (s.key)}
            <div class="plan-section">
              <h4 class="plan-h">{s.title}</h4>
              <ul class="plan-rows">
                {#each s.rows as r, i (i)}
                  <li class="plan-row">
                    <span class="plan-text">{r.text}</span>
                    {#if r.detail}<span class="plan-detail">{r.detail}</span>{/if}
                  </li>
                {/each}
              </ul>
            </div>
          {/each}
        </section>
      {/each}

      {#if calls.length > 0}
        <section class="plan-part" aria-labelledby="plan-calls-h">
          <h3 class="plan-h" id="plan-calls-h">{words.calls}</h3>
          <ul class="plan-rows">
            {#each calls as c, i (i)}
              <li class="plan-row">
                <span class="plan-text">{c.line}{#if c.change !== 'same'}<span class="plan-change">{c.change === 'changed' ? words.callChanged : words.callNew}</span>{/if}</span>
                {#if several}<span class="plan-detail">{c.from}</span>{/if}
                {#if c.note}<span class="plan-detail">{c.note}</span>{/if}
              </li>
            {/each}
          </ul>
          {#if estimate}<p class="plan-note">{estimate}</p>{/if}
          <p class="plan-note">{words.callsNote}</p>
        </section>
      {/if}

      <p class="plan-note">{words.touches}</p>

      {#if extra}<div class="plan-extra">{@render extra()}</div>{/if}
    </div>

    {#snippet footer()}
      <Button weight="primary" disabled={busy || (sheet?.stops.length ?? 1) > 0} onclick={onapprove}>{sheet?.approve ?? ''}</Button>
      <Button weight="bare" disabled={busy} onclick={() => (open = false)}>{words.notNow}</Button>
    {/snippet}
  </Sheet>
{/if}

<style>
  .plan {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    font-size: var(--t-sm);
    line-height: 1.5;
  }

  .plan-summary {
    margin: 0;
    color: var(--ink2);
  }

  /* WHAT STOPS IT IS READ FIRST, and it is the one red thing on the sheet: red means refused (design.md D-1). */
  .plan-stops {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding: var(--sp-3);
    border: 1px solid var(--danger);
    border-radius: var(--r-md);
    color: var(--danger);
  }

  .plan-part {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding-block-start: var(--sp-3);
    border-block-start: 1px solid var(--line-soft);
  }

  .plan-part-h {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-2);
    margin: 0;
    font-family: var(--font-ui);
    font-size: var(--t-ui);
    font-weight: 600;
    color: var(--ink);
  }

  .plan-move {
    color: var(--dim);
    font-size: var(--t-xs);
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }

  .plan-section {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  .plan-h {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    margin: 0;
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    font-weight: 600;
    color: var(--dim);
  }

  .plan-stops .plan-h {
    color: var(--danger);
  }

  .plan-rows {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .plan-row {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }

  .plan-text {
    color: var(--ink);
    overflow-wrap: anywhere;
  }

  .plan-stops .plan-text {
    color: var(--danger);
  }

  .plan-detail {
    color: var(--dim);
    font-size: var(--t-xs);
    overflow-wrap: anywhere;
  }

  .plan-change {
    margin-inline-start: var(--sp-2);
    color: var(--dim);
    font-size: var(--t-xs);
    font-weight: 600;
  }

  .plan-note {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .plan-extra {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }
</style>
