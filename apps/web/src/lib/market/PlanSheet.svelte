<!--
  The one plan sheet. Every install and every update draws this: an add-on or a
  module from its record's `Diff`, a use case pack by pack, and "Update all" as every plan at once before the one press.

  THE WHOLE PLAN, READ BY `plan.ts`: what stops it first, in the danger colour and with its glyph, then each pack's part
  with a section per thing it does (adds, changes, takes away with the rows each keeps, hands on, the owner's edits it
  carries over, settings kept or reset, example rows, rules that make rows), every line it calls out with, and what it
  touches. Anything that stops it keeps Approve from being pressed, because the record would refuse it anyway.

  A `Sheet`: a drawer from 640px up, and below it a bottom sheet with its sections as rows and the buttons pinned in its
  footer. `extra` is a question the install asks beside the plan, a use case's voice, drawn above the buttons.

  THE LOOK: the sheet is a tile's surface, so nothing in it is a box. Each thing the plan does is a group
  with an icon well, its title and its count, and its rows under it with hairlines between them, the way a list sits on
  the ground. What stops it leads, with the danger well and its title in the danger ink: it is the one thing on the
  sheet that needs him before anything else can happen.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { estimateOf } from '../record/actions.ts';
  import Sheet from '../ui/Sheet.svelte';
  import Button from '../ui/Button.svelte';
  import IconWell from '../ui/IconWell.svelte';
  import type { IconName } from '../ui/icons.ts';
  import { sheetOf, words } from './plan.ts';
  import { REGISTERS } from '../record/held.ts';

  let {
    diff,
    nameOf,
    hosted,
    busy,
    onapprove,
    oncancel,
    extra,
    fieldOf,
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
    /** A field by its label where the plan's own document knows it (a field an add-on lays on a list), before the record's. */
    fieldOf?: ((list: string, field: string) => string | null) | undefined;
  } = $props();

  /* A FIELD BY THE LABEL THE RECORD SHOWS, where the browser holds its list; `sheetOf` reads the id as words otherwise. */
  const sheet = $derived(sheetOf(diff, nameOf, (list, field) => fieldOf?.(list, field) ?? REGISTERS[list]?.fields.find((f) => f.id === field)?.label ?? null));
  const estimate = $derived(sheet ? estimateOf(sheet.callOuts, hosted) : null);
  const calls = $derived(sheet ? sheet.parts.flatMap((p) => p.calls.map((c) => ({ ...c, from: p.title }))) : []);
  const several = $derived((sheet?.parts.length ?? 0) > 1);

  let open = $state(true);

  /** The glyph each thing a plan does is drawn with, so the sheet reads by its pictures before its words. */
  const GLYPHS: Readonly<Record<string, IconName>> = {
    adds: 'plus',
    changes: 'edit',
    retires: 'archive',
    moves: 'arrow',
    kept: 'check',
    stays: 'lock',
    extends: 'rows',
    'page-adds': 'doc',
    settings: 'settings',
    examples: 'rows',
    skills: 'skill',
    spawns: 'skill',
    interrupts: 'bell',
    worth: 'info',
    'turns-on': 'play',
  };
  const glyphOf = (key: string): IconName => GLYPHS[key] ?? 'info';
</script>

{#if sheet}
  <Sheet bind:open title={sheet.title} onclose={oncancel}>
    <div class="plan">
      {#if sheet.summary}<p class="plan-summary">{sheet.summary}</p>{/if}

      {#if sheet.stops.length > 0}
        <section class="plan-group plan-stops" role="alert" aria-labelledby="plan-stops-h">
          <h3 class="plan-h" id="plan-stops-h"><IconWell name="alert" tone="danger" /><span class="plan-title">{words.stops}</span></h3>
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
            <div class="plan-group">
              <h4 class="plan-h"><IconWell name={glyphOf(s.key)} /><span class="plan-title">{s.title}</span><span class="plan-count num">{s.n ?? s.rows.length}</span></h4>
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
        <section class="plan-group" aria-labelledby="plan-calls-h">
          <h3 class="plan-h" id="plan-calls-h"><IconWell name="globe" /><span class="plan-title">{words.calls}</span><span class="plan-count num">{calls.length}</span></h3>
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
    gap: var(--sp-5);
    font-size: var(--fs-body);
    line-height: 20px;
  }

  .plan-summary {
    margin: 0;
    color: var(--ink-2);
  }

  /* ONE PACK'S PART OF A PLAN THAT HAS SEVERAL: its name over its groups, a hairline above every part after the first. */
  .plan-part {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
  }

  .plan-part + .plan-part {
    padding-block-start: var(--sp-4);
    border-block-start: 1px solid var(--rule);
  }

  .plan-part-h {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--fs-head);
    font-weight: 600;
    line-height: 24px;
  }

  .plan-move {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }

  /* A GROUP: its heading row (a well, the title at the row size and 600, the count in the quiet ink), then its rows. */
  .plan-group {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  .plan-h {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    margin: 0 0 var(--sp-1);
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--fs-body);
    font-weight: 600;
    line-height: 20px;
  }

  .plan-title {
    min-inline-size: 0;
  }

  .plan-count {
    color: var(--ink-3);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  /* WHAT STOPS IT: the danger well and the danger ink on its title. The rows stay ink, so a long refusal is read at full
     contrast rather than as a block of red. */
  .plan-stops .plan-title {
    color: var(--red);
  }

  /* THE ROWS UNDER A HEADING, set in from its edge by the well and its gap, a hairline between two. */
  .plan-rows {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    padding-inline-start: calc(var(--well) + var(--sp-3));
    list-style: none;
  }

  .plan-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-inline-size: 0;
    padding-block: var(--sp-2);
  }

  .plan-row + .plan-row {
    border-block-start: 1px solid var(--rule);
  }

  .plan-text {
    color: var(--ink);
    overflow-wrap: anywhere;
  }

  .plan-detail {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
    overflow-wrap: anywhere;
  }

  .plan-change {
    margin-inline-start: var(--sp-2);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  .plan-note {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .plan-group .plan-note {
    padding-inline-start: calc(var(--well) + var(--sp-3));
  }

  .plan-extra {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding-block-start: var(--sp-4);
    border-block-start: 1px solid var(--rule);
  }

  /* ON A PHONE THE ROWS TAKE THE WHOLE WIDTH: the well stays at the heading, and the words under it keep the room. */
  @media (width < 640px) {
    .plan-rows,
    .plan-group .plan-note {
      padding-inline-start: 0;
    }
  }
</style>
