<!--
  `forecast`: the cash walk as a line, the remembered balance solid and the walk dashed, stems for
  the movements worth seeing, the day it goes under, and every movement in a fold. `src/forecast.ts`
  decides the paths and the words; `forecast` in `src/html.ts` is this file's twin.

  THE KNOBS AND THE SCRUB EXIST ONLY WHERE THE HOST ASKS FOR THEM (`opts.scenario`). They live in
  this component's memory and never in the address, and without them the drawing is the walk the
  host made, which is exactly what `toHTML` draws, so the parity tests hold the two equal.

  A KNOB WITH NOTHING TO MOVE IS NOT DRAWN: drift with no converted step, What counts with nothing to
  count, the sell day with no holdings figure in this walk's money, and Show in with no rate into another
  currency. A slider that changes nothing reads as a forecast that ignored it.

  ON A PHONE THE KNOBS LIVE IN A SHEET behind one "Adjust" control, and the chart keeps the screen. Both
  the knobs under the chart and the button that opens the sheet are drawn, and the block's own width
  (`blocks-charts.css`, a container query) shows one of them, so the choice follows the space the block
  has and not the width of the window. The sheet and the full-screen view are native `<dialog>`s, because
  this package draws for hosts that have no sheet of their own; a key pressed inside one stays inside it,
  so a host's shortcuts do not act on the page behind a sheet it does not know is open.
-->
<script lang="ts">
  import { inline, text, TONES, type Block, type RenderOptions } from '../src/index.ts';
  import { figureLike } from '../src/figure.ts';
  import { day } from '../src/format.ts';
  import {
    FORECAST_ADJUST,
    FORECAST_BALANCE,
    FORECAST_CLOSE,
    FORECAST_COUNT,
    FORECAST_COUNT_IN,
    FORECAST_COUNT_OUT,
    FORECAST_FULL,
    FORECAST_GROW_IN,
    FORECAST_GROW_OUT,
    FORECAST_HORIZON,
    FORECAST_LATE,
    FORECAST_MOVE,
    FORECAST_NONE,
    FORECAST_NUMBERS,
    FORECAST_RESET,
    FORECAST_SELL_NOTE,
    FORECAST_SHOW_IN,
    FORECAST_SPEND,
    FORECAST_SPEND_NOTE,
    FORECAST_WHAT,
    FORECAST_WHEN,
    addDays,
    against,
    baseKnobs,
    countsOf,
    currencyName,
    forecastAverage,
    forecastDays,
    forecastDrift,
    forecastDriftNote,
    forecastModel,
    forecastPerMonth,
    forecastPerYear,
    forecastPlan,
    forecastRateOf,
    forecastSold,
    forecastSpendIn,
    horizonChoices,
    inCurrency,
    knobsIn,
    knobsMoved,
    pairsOf,
    readoutAt,
    scenario,
    spendRange,
    underNote,
    type Counted,
    type ForecastModel,
    type ForecastPlan,
    type GroupKnobs,
    type Growth,
    type Scenario,
    type SpendRange,
  } from '../src/forecast.ts';
  import { groupNamed, leaveGroup, type Group, type GroupMember } from './forecast-group.svelte.ts';

  let { block, opts = {} }: { block: Block; opts?: RenderOptions } = $props();

  const model = $derived(forecastModel(block.rows.map((r) => r.cells.map((c) => text(inline(c, opts))))));

  /**
   * What a walk tells its group beyond `GroupMember`: what it may count in or out, by side, and its spend slider's reach
   * in its own money. Every member is written by this component, so every member carries both.
   */
  type Member = GroupMember & { counts: { in: Counted[]; out: Counted[] }; range: SpendRange };

  /* A WALK ON ITS OWN HOLDS ITS KNOBS HERE; A WALK OF A GROUP (one a currency) READS THE GROUP'S, so one set of controls,
     under the walk that names `knobs`, moves every walk of the declaration at once. Spending is held by currency. */
  const own: GroupKnobs = $state({ horizon: null, late: 0, spend: {}, leave: [], grow: { in: 0, out: 0 }, drift: {}, sell: null });
  let group = $state.raw<Group | null>(null);
  /* THE GROUP'S NAME AND THIS WALK'S KEY AS WORDS, so a walk redrawn with new rows stays in the group it was in. */
  const groupId = $derived(opts.scenario ? model?.group?.id : undefined);
  const key = $derived(model?.group?.key ?? '');
  const held = $derived(group ? group.knobs : own);
  let scrub = $state<number | null>(null);

  /* SHOW IN IS A VIEW AND NOT A WHAT-IF: it moves no money, so Reset leaves it and the sentence against the baseline does
     not count it. A walk of a group has none, because a group is one walk a currency the record could not convert.
     Spending is still held in the walk's own money and converted on the way in and out of its slider. */
  let showIn = $state<string | null>(null);
  const shows = $derived(opts.scenario && model && model.group === null ? model.shows : []);
  const picked = $derived(shows.find((s) => s.to === showIn) ?? null);
  const rate = $derived(picked ? picked.rate : 1);
  const drawn = $derived(model && picked ? inCurrency(model, picked) : model);
  const showChoices = $derived<{ code: string | null; label: string }[]>(
    shows.length ? [{ code: null, label: currencyName(shows[0]!.from) }, ...shows.map((s) => ({ code: s.to, label: currencyName(s.to) }))] : [],
  );

  const spendOf = (k: string): number => held.spend[k] ?? 0;
  const knobs = $derived(drawn ? { ...knobsIn(drawn, held, key), spend: spendOf(key) * rate } : null);
  const base = $derived(drawn ? scenario(drawn, baseKnobs(drawn)) : null);
  const shown = $derived(drawn && knobs ? scenario(drawn, knobs) : null);
  const moved = $derived(drawn && knobs ? knobsMoved(drawn, knobs) : false);
  const plan = $derived(drawn && shown && base ? forecastPlan(drawn, shown, moved ? base : null) : null);
  const knobbed = $derived(Boolean(opts.scenario) && (model?.knobs.length ?? 0) > 0);
  /* WHETHER ANYTHING IS DRAWN UNDER THE CHART TO MOVE: a knob, or another currency to show it in. */
  const controls = $derived(knobbed || shows.length > 0);
  const choices = $derived(drawn ? horizonChoices(drawn) : []);
  /* THE CONTROLS OF A GROUP OFFER WHAT EVERY WALK MAY COUNT, and spending in each walk's currency. */
  const members = $derived(group ? (Object.entries(group.members) as [string, Member][]).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)) : []);
  const counts = $derived.by((): { in: Counted[]; out: Counted[] } => {
    if (!group) return drawn ? countsOf(drawn) : { in: [], out: [] };
    const side = (s: 'in' | 'out'): Counted[] => [...new Map(members.flatMap(([, m]) => m.counts[s]).map((h) => [h.label, h] as const)).values()];
    return { in: side('in'), out: side('out') };
  });
  /* "LEAVE OUT" IS FOLDED INTO WHAT COUNTS: a block that still names `leave` gets the one control, with the same list. */
  const countable = $derived(
    Boolean(model && (model.knobs.includes('count') || model.knobs.includes('leave'))) && counts.in.length + counts.out.length > 0,
  );
  const spends = $derived<[string, string, SpendRange][]>(
    group ? members.map(([k, m]) => [k, m.template, m.range]) : drawn ? [['', drawn.template, spendRange(drawn)]] : [],
  );
  const pairs = $derived(drawn ? pairsOf(drawn) : []);
  const sellEnd = $derived(drawn && shown ? addDays(drawn.today, shown.horizon) : '');
  const soon = $derived(drawn && shown ? underNote(drawn, shown) : '');
  const readout = $derived(drawn && shown && plan && scrub !== null ? readoutAt(drawn, shown, plan, scrub) : null);
  const title = $derived(text(inline(block.heading ?? '', opts)) || FORECAST_BALANCE);

  /* A WALK JOINS ITS GROUP FOR AS LONG AS IT IS DRAWN, and tells the controls how it writes money and what it could count. */
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
    if (!group || !model) return;
    const mine = countsOf(model);
    const member: Member = { template: model.template, heavy: [...mine.in, ...mine.out], counts: mine, range: spendRange(model) };
    group.members[key] = member;
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
  /* THE SLIDER SPEAKS THE MONEY SHOWN AND THE KNOB HOLDS THE WALK'S OWN, so a spend set in pounds is the same spend when
     the walk is shown in dollars, and choosing a currency never moves the answer. */
  const setSpend = (k: string, e: Event) => {
    held.spend = { ...held.spend, [k]: Number((e.currentTarget as HTMLInputElement).value) / rate };
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

  /* ── the sheet the knobs open in on a phone, and the chart full screen ─────── */

  let sheet = $state<HTMLDialogElement>();
  let full = $state<HTMLDialogElement>();
  /* WHAT EACH DIALOG HOLDS IS DRAWN ONLY WHILE IT IS OPEN, so the knobs are not in the page twice behind a closed one. */
  let adjusting = $state(false);
  let enlarged = $state(false);
  const openSheet = () => {
    adjusting = true;
    sheet?.showModal();
  };
  const openFull = () => {
    enlarged = true;
    full?.showModal();
  };
  /**
   * A PRESS ON THE DIMMED PAGE AROUND A DIALOG CLOSES IT, as the host's own sheets close. The press lands on the dialog
   * itself outside its box; `detail` is 0 for the click a key makes, which lands at no point on the screen.
   */
  const outside = (e: MouseEvent) => {
    const el = e.currentTarget as HTMLDialogElement;
    if (e.detail === 0 || e.target !== el) return;
    const r = el.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) el.close();
  };
  /* A KEY PRESSED INSIDE A DIALOG STAYS INSIDE IT. The host cannot see a dialog this package opened, so a letter typed in
     the sell day would otherwise reach the host's shortcuts and act on the page behind. Escape still closes the dialog:
     that is the browser's, and stopping the key on its way out does not stop it. */
  const within = (e: KeyboardEvent) => e.stopPropagation();

  /**
   * THE GRAB HANDLE PULLS, as the house sheet's does (`apps/web/src/lib/ui/Sheet.svelte`): a phone sheet shows a handle
   * at its top edge, and the first thing a thumb does with it is pull it down. A pull moves the sheet with the finger, and
   * letting go past `LET_GO` closes the dialog it is in; short of it, the sheet goes back. Only the handle's strip takes
   * the pull, so the head's Close keeps its own click, and the strip is drawn only under 640px (`blocks-charts.css`).
   */
  const LET_GO = 80;
  let pulled = $state(0);
  let from: number | null = null;
  const pullFrom = (e: PointerEvent) => {
    from = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const pull = (e: PointerEvent) => {
    if (from !== null) pulled = Math.max(0, e.clientY - from);
  };
  const letGo = (e: PointerEvent) => {
    if (from === null) return;
    from = null;
    if (pulled > LET_GO) (e.currentTarget as HTMLElement).closest('dialog')?.close();
    pulled = 0;
  };
</script>

<!-- THE SENTENCE AND THE CHART ARE DRAWN IN TWO PLACES, under the block and in the full-screen view, from one plan. -->
{#snippet said(p: ForecastPlan)}
  <p class="forecast-said" data-intent={p.warn ? 'warn' : undefined}>{#if p.warn}<span class="glyph" role="img" aria-label={TONES.warn.label}>{TONES.warn.glyph}</span>{/if}{p.said}</p>
{/snippet}

{#snippet chart(p: ForecastPlan)}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="forecast-plot"
    data-rises={p.rises ? '' : undefined}
    onpointerdown={grab}
    onpointermove={track}
    onpointerleave={() => (scrub = null)}
    onpointercancel={() => (scrub = null)}
  >
    <span class="forecast-top num" aria-hidden="true">{p.top}</span>
    <span class="forecast-bottom num" aria-hidden="true">{p.bottom}</span>
    <svg class="forecast-chart" viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label={p.sentence}>
      <path class="forecast-zero" d="M0 {p.zero}H1000" vector-effect="non-scaling-stroke"></path>
      {#if p.base}<path class="forecast-base" d={p.base} vector-effect="non-scaling-stroke"></path>{/if}
      {#if p.up}<path class="forecast-stem" data-move="up" d={p.up} vector-effect="non-scaling-stroke"></path>{/if}
      {#if p.down}<path class="forecast-stem" data-move="down" d={p.down} vector-effect="non-scaling-stroke"></path>{/if}
      {#if p.past}<path class="forecast-past" d={p.past} vector-effect="non-scaling-stroke"></path>{/if}
      <path class="forecast-future" d={p.future} vector-effect="non-scaling-stroke"></path>
      <path class="forecast-low" d={p.low} vector-effect="non-scaling-stroke"></path>
      {#if p.cross}<path class="forecast-cross" d={p.cross.d} vector-effect="non-scaling-stroke"></path>{/if}
    </svg>
    {#if p.cross}<span class="forecast-pin" style="--at:{p.cross.at}" aria-hidden="true">{TONES.warn.glyph} {p.cross.day}</span>{/if}
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
    {#each p.ticks as t}<li class="forecast-tick" style="--at:{t.at}">{t.label}</li>{/each}
  </ol>
{/snippet}

<!-- THE HANDLE AT THE TOP OF A SHEET, which a thumb pulls down to close it. It holds nothing a person presses. -->
{#snippet handle()}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="forecast-sheet-grab" aria-hidden="true" onpointerdown={pullFrom} onpointermove={pull} onpointerup={letGo} onpointercancel={letGo}>
    <span class="forecast-sheet-grab-bar"></span>
  </div>
{/snippet}

<!-- EVERY KNOB, drawn under the chart where the block has the room and in the Adjust sheet where it does not. -->
{#snippet adjust(m: ForecastModel, s: Scenario)}
  {#if showChoices.length}
    <div class="forecast-knob" role="group" aria-label={FORECAST_SHOW_IN}>
      <span class="forecast-knob-name" aria-hidden="true">{FORECAST_SHOW_IN}</span>
      <div class="segmented forecast-segs">
        {#each showChoices as c (c.code ?? '')}
          <button type="button" class="segment" data-on={showIn === c.code ? '' : undefined} aria-pressed={showIn === c.code} onclick={() => (showIn = c.code)}>{c.label}</button>
        {/each}
      </div>
      {#if picked}<span class="forecast-knob-note">{forecastRateOf(picked.day)}</span>{/if}
    </div>
  {/if}
  {#if knobbed}
    <!-- ONE SEGMENTED CONTROL, the house's, from a quarter to the block's longest choice and "To the end". -->
    {#if m.knobs.includes('horizon') && choices.length > 1}
      <div class="forecast-knob" role="group" aria-label={FORECAST_HORIZON}>
        <span class="forecast-knob-name" aria-hidden="true">{FORECAST_HORIZON}</span>
        <div class="segmented forecast-segs">
          {#each choices as c (c.days)}
            <button type="button" class="segment" data-on={s.horizon === c.days ? '' : undefined} aria-pressed={s.horizon === c.days} onclick={() => (held.horizon = c.days)}>{c.label}</button>
          {/each}
        </div>
      </div>
    {/if}
    {#if m.knobs.includes('late')}
      <label class="forecast-knob">
        <span class="forecast-knob-name">{m.lateName ?? FORECAST_LATE}</span>
        <input class="forecast-range" type="range" min="0" max="60" step="5" bind:value={held.late} />
        <span class="forecast-knob-value num">{forecastDays(held.late)}</span>
        {#if m.late !== null}<span class="forecast-knob-note">{forecastAverage(m.late)}</span>{/if}
      </label>
    {/if}
    {#if m.knobs.includes('spend')}
      {#each spends as [k, template, range] (k)}
        <label class="forecast-knob">
          <span class="forecast-knob-name">{k ? forecastSpendIn(k) : FORECAST_SPEND}</span>
          <input class="forecast-range" type="range" min="0" max={range.max} step={range.step} value={spendOf(k) * rate} oninput={(e) => setSpend(k, e)} />
          <span class="forecast-knob-value num">{forecastPerMonth(figureLike(template, spendOf(k) * rate))}</span>
          <span class="forecast-knob-note">{FORECAST_SPEND_NOTE}</span>
        </label>
      {/each}
    {/if}
    <!-- ON IS COUNTED, and that is the only meaning a press has here: a switch per stream, plan and heavy one-off, and
         what is off is struck through and left out of the walk. -->
    {#if countable}
      <div class="forecast-knob" role="group" aria-label={FORECAST_COUNT}>
        <span class="forecast-knob-name" aria-hidden="true">{FORECAST_COUNT}</span>
        {#each [[FORECAST_COUNT_IN, counts.in], [FORECAST_COUNT_OUT, counts.out]] as const as [side, list] (side)}
          {#if list.length}
            <div class="forecast-counts" role="group" aria-label={side}>
              <span class="forecast-counts-side" aria-hidden="true">{side}</span>
              {#each list as h (h.label)}
                <button type="button" class="forecast-chip" role="switch" aria-checked={!held.leave.includes(h.label)} onclick={() => toggle(h.label)}
                  ><span class="switch-track" aria-hidden="true"></span><span class="forecast-chip-label">{h.label}</span><span class="forecast-chip-amount num"
                    >{h.amount}</span
                  ></button
                >
              {/each}
            </div>
          {/if}
        {/each}
      </div>
    {/if}
    {#if m.knobs.includes('grow')}
      {#each [['out', FORECAST_GROW_OUT], ['in', FORECAST_GROW_IN]] as const as [side, name] (side)}
        <label class="forecast-knob">
          <span class="forecast-knob-name">{name}</span>
          <input class="forecast-range" type="range" min="-50" max="50" step="1" value={growOf(side)} oninput={(e) => setGrow(side, e)} />
          <span class="forecast-knob-value num">{forecastPerYear(growOf(side))}</span>
        </label>
      {/each}
    {/if}
    {#if m.knobs.includes('drift')}
      {#each pairs as pair (pair)}
        <label class="forecast-knob">
          <span class="forecast-knob-name">{forecastDrift(pair)}</span>
          <input class="forecast-range" type="range" min="-50" max="50" step="1" value={driftOf(pair)} oninput={(e) => setDrift(pair, e)} />
          <span class="forecast-knob-value num">{forecastPerYear(driftOf(pair))}</span>
          <span class="forecast-knob-note">{forecastDriftNote(pair)}</span>
        </label>
      {/each}
    {/if}
    {#if m.knobs.includes('sell') && m.sells.length}
      <label class="forecast-knob">
        <span class="forecast-knob-name">{forecastSold(m.sells.map((x) => x.label))}</span>
        <input class="forecast-date" type="date" min={m.today} max={sellEnd} value={held.sell ?? ''} onchange={setSell} />
        <span class="forecast-knob-note">{FORECAST_SELL_NOTE}</span>
      </label>
    {/if}
    {#if moved}
      <button type="button" class="forecast-reset" onclick={reset}>{FORECAST_RESET}</button>
    {/if}
  {/if}
{/snippet}

<div class="prop forecast">
  {#if !drawn || !shown || !plan}
    <p class="forecast-empty">{FORECAST_NONE}</p>
  {:else}
    {@render said(plan)}
    {@render chart(plan)}
    {#if soon}
      <p class="forecast-soon">{soon}</p>
    {/if}
    {#if opts.scenario}
      <div class="forecast-tools">
        {#if controls}<button type="button" class="forecast-tool forecast-adjust" onclick={openSheet}>{FORECAST_ADJUST}</button>{/if}
        <button type="button" class="forecast-tool" onclick={openFull}>{FORECAST_FULL}</button>
      </div>
    {/if}
    <!-- THE KNOBS COME AFTER THE CHART, so the answer is read before the questions a reader may ask of it. -->
    {#if controls}
      <div class="forecast-knobs" data-inline="">{@render adjust(drawn, shown)}</div>
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
            <th scope="row">{day(drawn.today)}</th>
            <td>{drawn.label}</td>
            <td class="num"></td>
            <td class="num">{drawn.template}</td>
          </tr>
          {#each shown.steps as s}
            <tr>
              <th scope="row">{day(s.day)}</th>
              <td>{s.label}</td>
              <td class="num">{figureLike(drawn.template, s.delta)}</td>
              <td class="num">{figureLike(drawn.template, s.balance)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </details>
    {#if opts.scenario}
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <dialog
        class="forecast-sheet"
        style="--pulled: {pulled}px"
        bind:this={sheet}
        aria-label={FORECAST_ADJUST}
        onclick={outside}
        onkeydown={within}
        onclose={() => (adjusting = false)}
      >
        {@render handle()}
        <div class="forecast-sheet-head">
          <h2 class="forecast-sheet-title">{FORECAST_ADJUST}</h2>
          <button type="button" class="forecast-tool" onclick={() => sheet?.close()}>{FORECAST_CLOSE}</button>
        </div>
        {#if adjusting && controls}
          <div class="forecast-sheet-body"><div class="forecast-knobs">{@render adjust(drawn, shown)}</div></div>
        {/if}
      </dialog>
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <dialog
        class="forecast-sheet"
        data-full=""
        style="--pulled: {pulled}px"
        bind:this={full}
        aria-label={title}
        onclick={outside}
        onkeydown={within}
        onclose={() => (enlarged = false)}
      >
        {@render handle()}
        <div class="forecast-sheet-head">
          <h2 class="forecast-sheet-title">{title}</h2>
          <button type="button" class="forecast-tool" onclick={() => full?.close()}>{FORECAST_CLOSE}</button>
        </div>
        {#if enlarged}
          <div class="forecast-sheet-body">
            {@render said(plan)}
            {@render chart(plan)}
            {#if moved && base}<p class="forecast-against">{against(base, shown, moved)}</p>{/if}
          </div>
        {/if}
      </dialog>
    {/if}
  {/if}
</div>
