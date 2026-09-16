<!--
  `forecast`: the cash walk as a line, the remembered balance solid and the walk dashed, stems for
  the movements worth seeing, the day it goes under, and every movement in a fold. `src/forecast.ts`
  decides the paths and the words; `forecast` in `src/html.ts` is this file's twin.

  THE KNOBS AND THE SCRUB EXIST ONLY WHERE THE HOST ASKS FOR THEM (`opts.scenario`). They live in
  this component's memory and never in the address, and without them the drawing is the walk the
  host made, which is exactly what `toHTML` draws, so the parity tests hold the two equal.
-->
<script lang="ts">
  import { inline, text, TONES, type Block, type RenderOptions } from '../src/index.ts';
  import { figureLike } from '../src/figure.ts';
  import { day } from '../src/format.ts';
  import {
    FORECAST_BALANCE,
    FORECAST_HORIZON,
    FORECAST_LATE,
    FORECAST_LEAVE,
    FORECAST_MOVE,
    FORECAST_NONE,
    FORECAST_NUMBERS,
    FORECAST_RESET,
    FORECAST_SPEND,
    FORECAST_SPEND_NOTE,
    FORECAST_WHAT,
    FORECAST_WHEN,
    against,
    baseKnobs,
    forecastAverage,
    forecastDays,
    forecastModel,
    forecastMonths,
    forecastPerMonth,
    forecastPlan,
    horizonChoices,
    knobsMoved,
    largest,
    readoutAt,
    scenario,
    underNote,
  } from '../src/forecast.ts';

  let { block, opts = {} }: { block: Block; opts?: RenderOptions } = $props();

  const model = $derived(forecastModel(block.rows.map((r) => r.cells.map((c) => text(inline(c, opts))))));

  let horizon = $state<number | null>(null);
  let late = $state(0);
  let spend = $state(0);
  let leave = $state<string[]>([]);
  let scrub = $state<number | null>(null);

  const knobs = $derived(model ? { horizon: horizon ?? model.horizon, late, spend, leave } : null);
  const base = $derived(model ? scenario(model, baseKnobs(model)) : null);
  const shown = $derived(model && knobs ? scenario(model, knobs) : null);
  const moved = $derived(model && knobs ? knobsMoved(model, knobs) : false);
  const plan = $derived(model && shown && base ? forecastPlan(model, shown, moved ? base : null) : null);
  const knobbed = $derived(Boolean(opts.scenario) && (model?.knobs.length ?? 0) > 0);
  const choices = $derived(model ? horizonChoices(model) : []);
  const heavy = $derived(model ? largest(model) : []);
  const soon = $derived(model && shown ? underNote(model, shown) : '');
  const readout = $derived(model && shown && plan && scrub !== null ? readoutAt(model, shown, plan, scrub) : null);

  const reset = () => {
    horizon = null;
    late = 0;
    spend = 0;
    leave = [];
  };
  const toggle = (label: string) => {
    leave = leave.includes(label) ? leave.filter((l) => l !== label) : [...leave, label];
  };
  const track = (e: PointerEvent) => {
    if (!knobbed) return;
    const el = e.currentTarget as HTMLElement;
    const box = el.getBoundingClientRect();
    if (box.width > 0) scrub = (e.clientX - box.left) / box.width;
  };
  const grab = (e: PointerEvent) => {
    if (!knobbed) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    track(e);
  };
</script>

<div class="prop forecast">
  {#if !model || !shown || !plan}
    <p class="forecast-empty">{FORECAST_NONE}</p>
  {:else}
    <p class="forecast-said" data-intent={plan.warn ? 'warn' : undefined}>{#if plan.warn}<span class="glyph" role="img" aria-label={TONES.warn.label}>{TONES.warn.glyph}</span>{/if}{plan.said}</p>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="forecast-plot"
      onpointerdown={grab}
      onpointermove={track}
      onpointerleave={() => (scrub = null)}
      onpointercancel={() => (scrub = null)}
    >
      <span class="forecast-top num" aria-hidden="true">{plan.top}</span>
      <span class="forecast-bottom num" aria-hidden="true">{plan.bottom}</span>
      <svg class="forecast-chart" viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label={plan.sentence}>
        <path class="forecast-zero" d="M0 {plan.zero}H1000" vector-effect="non-scaling-stroke"></path>
        {#if plan.base}<path class="forecast-base" d={plan.base} vector-effect="non-scaling-stroke"></path>{/if}
        {#if plan.up}<path class="forecast-stem" data-move="up" d={plan.up} vector-effect="non-scaling-stroke"></path>{/if}
        {#if plan.down}<path class="forecast-stem" data-move="down" d={plan.down} vector-effect="non-scaling-stroke"></path>{/if}
        {#if plan.past}<path class="forecast-past" d={plan.past} vector-effect="non-scaling-stroke"></path>{/if}
        <path class="forecast-future" d={plan.future} vector-effect="non-scaling-stroke"></path>
        <path class="forecast-low" d={plan.low} vector-effect="non-scaling-stroke"></path>
        {#if plan.cross}<path class="forecast-cross" d={plan.cross.d} vector-effect="non-scaling-stroke"></path>{/if}
      </svg>
      {#if plan.cross}<span class="forecast-pin" style="--at:{plan.cross.at}" aria-hidden="true">{TONES.warn.glyph}{plan.cross.day}</span>{/if}
      {#if readout}
        <div class="forecast-readout" style="--at:{readout.at}" data-flip={readout.flip ? '' : undefined} aria-hidden="true">
          <span class="forecast-readout-day">{readout.day}</span>
          <span class="forecast-readout-balance num">{readout.balance}</span>
          {#each readout.moves as m}
            <span class="forecast-readout-move"><span class="forecast-readout-label">{m.label}</span><span class="num">{m.amount}</span></span>
          {/each}
        </div>
      {/if}
    </div>
    <ol class="forecast-ticks" aria-hidden="true">
      {#each plan.ticks as t}<li class="forecast-tick" style="--at:{t.at}">{t.label}</li>{/each}
    </ol>
    {#if soon}
      <p class="forecast-soon">{soon}</p>
    {/if}
    <!-- THE KNOBS COME AFTER THE CHART, so the answer is read before the questions a reader may ask of it. -->
    {#if knobbed}
      <div class="forecast-knobs">
        {#if model.knobs.includes('horizon') && choices.length > 1}
          <div class="forecast-knob" role="group" aria-label={FORECAST_HORIZON}>
            <span class="forecast-knob-name" aria-hidden="true">{FORECAST_HORIZON}</span>
            <div class="forecast-segs">
              {#each choices as [months, days]}
                <button type="button" class="forecast-seg" aria-pressed={shown.horizon === days} onclick={() => (horizon = days)}>{forecastMonths(months)}</button>
              {/each}
            </div>
          </div>
        {/if}
        {#if model.knobs.includes('late')}
          <label class="forecast-knob">
            <span class="forecast-knob-name">{FORECAST_LATE}</span>
            <input class="forecast-range" type="range" min="0" max="60" step="5" bind:value={late} />
            <span class="forecast-knob-value num">{forecastDays(late)}</span>
            {#if model.late !== null}<span class="forecast-knob-note">{forecastAverage(model.late)}</span>{/if}
          </label>
        {/if}
        {#if model.knobs.includes('spend')}
          <label class="forecast-knob">
            <span class="forecast-knob-name">{FORECAST_SPEND}</span>
            <input class="forecast-range" type="range" min="0" max="5000" step="100" bind:value={spend} />
            <span class="forecast-knob-value num">{forecastPerMonth(figureLike(model.template, spend))}</span>
            <span class="forecast-knob-note">{FORECAST_SPEND_NOTE}</span>
          </label>
        {/if}
        {#if model.knobs.includes('leave') && heavy.length}
          <div class="forecast-knob" role="group" aria-label={FORECAST_LEAVE}>
            <span class="forecast-knob-name" aria-hidden="true">{FORECAST_LEAVE}</span>
            <div class="forecast-chips">
              {#each heavy as h}
                <button type="button" class="forecast-chip" aria-pressed={leave.includes(h.label)} onclick={() => toggle(h.label)}
                  ><span class="forecast-chip-label">{h.label}</span><span class="forecast-chip-amount num">{h.amount}</span></button
                >
              {/each}
            </div>
          </div>
        {/if}
        {#if moved}
          <button type="button" class="forecast-reset" onclick={reset}>{FORECAST_RESET}</button>
        {/if}
      </div>
      {#if moved && base}
        <p class="forecast-against" role="status">{against(base, shown, moved)}</p>
      {/if}
    {/if}
    <details class="forecast-numbers">
      <summary class="forecast-toggle">{FORECAST_NUMBERS}</summary>
      <table class="forecast-table">
        <thead>
          <tr>
            <th scope="col">{FORECAST_WHEN}</th>
            <th scope="col">{FORECAST_WHAT}</th>
            <th scope="col">{FORECAST_MOVE}</th>
            <th scope="col">{FORECAST_BALANCE}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">{day(model.today)}</th>
            <td>{model.label}</td>
            <td class="num"></td>
            <td class="num">{model.template}</td>
          </tr>
          {#each shown.steps as s}
            <tr>
              <th scope="row">{day(s.day)}</th>
              <td>{s.label}</td>
              <td class="num">{figureLike(model.template, s.delta)}</td>
              <td class="num">{figureLike(model.template, s.balance)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </details>
  {/if}
</div>
