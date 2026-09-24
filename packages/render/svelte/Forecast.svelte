<!--
  `forecast`: the cash walk as a line, the remembered balance solid and the walk dashed, stems for
  the movements worth seeing, the day it goes under, and every movement in a fold. `src/forecast.ts`
  decides the paths and the words; `forecast` in `src/html.ts` is this file's twin.

  THE KNOBS AND THE SCRUB EXIST ONLY WHERE THE HOST ASKS FOR THEM (`opts.scenario`). They live in
  this component's memory and never in the address, and without them the drawing is the walk the
  host made, which is exactly what `toHTML` draws, so the parity tests hold the two equal.

  A KNOB WITH NOTHING TO MOVE IS NOT DRAWN: drift with no converted step, What counts with no stream or
  plan, and the sell day with no holdings figure in this walk's money. A slider that changes nothing
  reads as a forecast that ignored it.
-->
<script lang="ts">
  import { inline, text, TONES, type Block, type RenderOptions } from '../src/index.ts';
  import { figureLike } from '../src/figure.ts';
  import { day } from '../src/format.ts';
  import {
    FORECAST_BALANCE,
    FORECAST_COUNT,
    FORECAST_COUNT_IN,
    FORECAST_COUNT_OUT,
    FORECAST_GROW_IN,
    FORECAST_GROW_OUT,
    FORECAST_HORIZON,
    FORECAST_SELL_NOTE,
    addDays,
    forecastDrift,
    forecastDriftNote,
    forecastPerYear,
    forecastSold,
    pairsOf,
    streamsOf,
    type Growth,
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
    forecastSpendIn,
    knobsIn,
    type GroupKnobs,
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
  import { groupNamed, leaveGroup, type Group } from './forecast-group.svelte.ts';

  let { block, opts = {} }: { block: Block; opts?: RenderOptions } = $props();

  const model = $derived(forecastModel(block.rows.map((r) => r.cells.map((c) => text(inline(c, opts))))));

  /* A WALK ON ITS OWN HOLDS ITS KNOBS HERE; A WALK OF A GROUP (one a currency) READS THE GROUP'S, so one set of controls,
     under the walk that names `knobs`, moves every walk of the declaration at once. Spending is held by currency. */
  const own: GroupKnobs = $state({ horizon: null, late: 0, spend: {}, leave: [], grow: { in: 0, out: 0 }, drift: {}, sell: null });
  let group = $state.raw<Group | null>(null);
  /* THE GROUP'S NAME AND THIS WALK'S KEY AS WORDS, so a walk redrawn with new rows stays in the group it was in. */
  const groupId = $derived(opts.scenario ? model?.group?.id : undefined);
  const key = $derived(model?.group?.key ?? '');
  const held = $derived(group ? group.knobs : own);
  let scrub = $state<number | null>(null);

  const knobs = $derived(model ? knobsIn(model, held, key) : null);
  const base = $derived(model ? scenario(model, baseKnobs(model)) : null);
  const shown = $derived(model && knobs ? scenario(model, knobs) : null);
  const moved = $derived(model && knobs ? knobsMoved(model, knobs) : false);
  const plan = $derived(model && shown && base ? forecastPlan(model, shown, moved ? base : null) : null);
  const knobbed = $derived(Boolean(opts.scenario) && (model?.knobs.length ?? 0) > 0);
  const choices = $derived(model ? horizonChoices(model) : []);
  const heavy = $derived(model ? largest(model) : []);
  /* THE CONTROLS OF A GROUP OFFER EVERY WALK'S LARGE MOVEMENTS, and spending in each walk's currency. */
  const members = $derived(group ? Object.entries(group.members).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)) : []);
  const offered = $derived(
    group ? [...new Map(members.flatMap(([, m]) => m.heavy).map((h) => [h.label, h] as const)).values()] : heavy,
  );
  const spends = $derived<[string, string][]>(group ? members.map(([k, m]) => [k, m.template]) : [['', model?.template ?? '']]);
  const pairs = $derived(model ? pairsOf(model) : []);
  const streams = $derived(model ? streamsOf(model) : { in: [], out: [] });
  const sellEnd = $derived(model && shown ? addDays(model.today, shown.horizon) : '');
  const soon = $derived(model && shown ? underNote(model, shown) : '');
  const readout = $derived(model && shown && plan && scrub !== null ? readoutAt(model, shown, plan, scrub) : null);

  /* A WALK JOINS ITS GROUP FOR AS LONG AS IT IS DRAWN, and tells the controls how it writes money and what it could leave out. */
  $effect(() => {
    const id = groupId;
    const me = key;
    if (id === undefined) {
      group = null;
      return;
    }
    group = groupNamed(id);
    return () => leaveGroup(id, me);
  });
  $effect(() => {
    if (group && model) group.members[key] = { template: model.template, heavy };
  });

  const reset = () => {
    held.horizon = null;
    held.late = 0;
    held.spend = {};
    held.leave = [];
    held.grow = { in: 0, out: 0 };
    held.drift = {};
    held.sell = null;
  };
  /* THE LATER KNOBS ARE SET BY REPLACING THE WHOLE VALUE, because a group made before them holds none of them and a
     `bind:` on a field of nothing has nowhere to write. */
  const growOf = (side: keyof Growth): number => held.grow?.[side] ?? 0;
  const setGrow = (side: keyof Growth, e: Event) => {
    held.grow = { in: 0, out: 0, ...held.grow, [side]: Number((e.currentTarget as HTMLInputElement).value) };
  };
  const driftOf = (pair: string): number => held.drift?.[pair] ?? 0;
  const setDrift = (pair: string, e: Event) => {
    held.drift = { ...held.drift, [pair]: Number((e.currentTarget as HTMLInputElement).value) };
  };
  const setSell = (e: Event) => {
    const v = (e.currentTarget as HTMLInputElement).value;
    held.sell = v === '' ? null : v;
  };
  const toggle = (label: string) => {
    held.leave = held.leave.includes(label) ? held.leave.filter((l) => l !== label) : [...held.leave, label];
  };
  const spendOf = (k: string): number => held.spend[k] ?? 0;
  const setSpend = (k: string, e: Event) => {
    held.spend = { ...held.spend, [k]: Number((e.currentTarget as HTMLInputElement).value) };
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
      data-rises={plan.rises ? '' : undefined}
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
      {#if plan.cross}<span class="forecast-pin" style="--at:{plan.cross.at}" aria-hidden="true">{TONES.warn.glyph} {plan.cross.day}</span>{/if}
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
                <button type="button" class="forecast-seg" aria-pressed={shown.horizon === days} onclick={() => (held.horizon = days)}>{forecastMonths(months)}</button>
              {/each}
            </div>
          </div>
        {/if}
        {#if model.knobs.includes('late')}
          <label class="forecast-knob">
            <span class="forecast-knob-name">{model.lateName ?? FORECAST_LATE}</span>
            <input class="forecast-range" type="range" min="0" max="60" step="5" bind:value={held.late} />
            <span class="forecast-knob-value num">{forecastDays(held.late)}</span>
            {#if model.late !== null}<span class="forecast-knob-note">{forecastAverage(model.late)}</span>{/if}
          </label>
        {/if}
        {#if model.knobs.includes('spend')}
          {#each spends as [k, template] (k)}
            <label class="forecast-knob">
              <span class="forecast-knob-name">{k ? forecastSpendIn(k) : FORECAST_SPEND}</span>
              <input class="forecast-range" type="range" min="0" max="5000" step="100" value={spendOf(k)} oninput={(e) => setSpend(k, e)} />
              <span class="forecast-knob-value num">{forecastPerMonth(figureLike(template, spendOf(k)))}</span>
              <span class="forecast-knob-note">{FORECAST_SPEND_NOTE}</span>
            </label>
          {/each}
        {/if}
        {#if model.knobs.includes('leave') && offered.length}
          <div class="forecast-knob" role="group" aria-label={FORECAST_LEAVE}>
            <span class="forecast-knob-name" aria-hidden="true">{FORECAST_LEAVE}</span>
            <div class="forecast-chips">
              {#each offered as h}
                <button type="button" class="forecast-chip" aria-pressed={held.leave.includes(h.label)} onclick={() => toggle(h.label)}
                  ><span class="forecast-chip-label">{h.label}</span><span class="forecast-chip-amount num">{h.amount}</span></button
                >
              {/each}
            </div>
          </div>
        {/if}
        {#if model.knobs.includes('grow')}
          {#each [['out', FORECAST_GROW_OUT], ['in', FORECAST_GROW_IN]] as const as [side, name] (side)}
            <label class="forecast-knob">
              <span class="forecast-knob-name">{name}</span>
              <input class="forecast-range" type="range" min="-50" max="50" step="1" value={growOf(side)} oninput={(e) => setGrow(side, e)} />
              <span class="forecast-knob-value num">{forecastPerYear(growOf(side))}</span>
            </label>
          {/each}
        {/if}
        {#if model.knobs.includes('drift')}
          {#each pairs as pair (pair)}
            <label class="forecast-knob">
              <span class="forecast-knob-name">{forecastDrift(pair)}</span>
              <input class="forecast-range" type="range" min="-50" max="50" step="1" value={driftOf(pair)} oninput={(e) => setDrift(pair, e)} />
              <span class="forecast-knob-value num">{forecastPerYear(driftOf(pair))}</span>
              <span class="forecast-knob-note">{forecastDriftNote(pair)}</span>
            </label>
          {/each}
        {/if}
        <!-- PRESSED IS COUNTED, the opposite of Leave out, because the question here is "what counts". Both write one list. -->
        {#if model.knobs.includes('count') && (streams.in.length || streams.out.length)}
          <div class="forecast-knob" role="group" aria-label={FORECAST_COUNT}>
            <span class="forecast-knob-name" aria-hidden="true">{FORECAST_COUNT}</span>
            {#each [[FORECAST_COUNT_IN, streams.in], [FORECAST_COUNT_OUT, streams.out]] as const as [side, list] (side)}
              {#if list.length}
                <div class="forecast-chips" role="group" aria-label={side}>
                  {#each list as h (h.label)}
                    <button type="button" class="forecast-chip" aria-pressed={!held.leave.includes(h.label)} onclick={() => toggle(h.label)}
                      ><span class="forecast-chip-label">{h.label}</span><span class="forecast-chip-amount num">{h.amount}</span></button
                    >
                  {/each}
                </div>
              {/if}
            {/each}
          </div>
        {/if}
        {#if model.knobs.includes('sell') && model.sells.length}
          <label class="forecast-knob">
            <span class="forecast-knob-name">{forecastSold(model.sells.map((s) => s.label))}</span>
            <input class="forecast-date" type="date" min={model.today} max={sellEnd} value={held.sell ?? ''} onchange={setSell} />
            <span class="forecast-knob-note">{FORECAST_SELL_NOTE}</span>
          </label>
        {/if}
        {#if moved}
          <button type="button" class="forecast-reset" onclick={reset}>{FORECAST_RESET}</button>
        {/if}
      </div>
    {/if}
    <!-- WHAT THE KNOBS CHANGED, under every walk they move: the one with the controls, and each other walk of its group. -->
    {#if (knobbed || group) && moved && base}
      <p class="forecast-against" role="status">{against(base, shown, moved)}</p>
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
