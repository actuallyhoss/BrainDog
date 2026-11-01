<!--
  `forecast`: the cash walk as a line over a soft wash split at zero, solid as far as the record knows it and dashed
  beyond, today's dot with its balance, a value axis of round steps that holds zero, the day it goes under tied to the
  line by a thin rule, and every movement in a fold (inside Adjust where there is one). `src/forecast.ts` decides the
  paths and the words; `forecast` in `src/html.ts` is this file's twin.

  THE KNOBS AND THE SCRUB EXIST ONLY WHERE THE HOST ASKS FOR THEM (`opts.scenario`). They live in
  this component's memory and never in the address or the browser's storage, so a page left and come back to draws
  the host's walk again (HD.241: they reset on each visit; a group goes with its last walk, `forecast-group.svelte.ts`).
  Without them the drawing is the walk the host made, which is exactly what `toHTML` draws, so the parity tests hold
  the two equal. The scrub follows a thumb as it follows a mouse, and the page still scrolls under a vertical swipe.

  A KNOB WITH NOTHING TO MOVE IS NOT DRAWN: drift with no converted step, What counts with nothing to
  count, the sell day with no holdings figure in a walk's own money, and Show in with no rate into another
  currency. A slider that changes nothing reads as a forecast that ignored it.

  THE KNOBS ARE CLOSED BEHIND ONE QUIET "Adjust" AT EVERY WIDTH, a disclosure (`aria-expanded`, `aria-controls`).
  They stood open under the chart wherever the block had the room, and at 1440 that was a wall: twenty-seven What
  counts switches, six sliders and an orphan "Every movement" under a chart that should have been the answer (the
  money review). Adjust opens them under the chart at every width, so the line moves in view while a slider does; a
  phone used to get a sheet instead, which hid the chart the slider was moving. Closed, the knobs are `hidden`, so the
  control Adjust names is always in the page. The full-screen view is a native `<dialog>`, because this package draws
  for hosts that have no sheet of their own; a key pressed inside it stays inside it, so a host's shortcuts do not act
  on the page behind a view it does not know is open.
-->
<script lang="ts">
  import { inline, text, TONES, type Block, type RenderOptions } from '../src/index.ts';
  import { day } from '../src/format.ts';
  import {
    FORECAST_ADJUST,
    FORECAST_AXIS_BREAK_STYLE,
    FORECAST_BALANCE,
    FORECAST_CLOSE,
    FORECAST_COUNT,
    FORECAST_COUNT_IN,
    FORECAST_COUNT_OUT,
    FORECAST_COUNTS_SHOWN,
    FORECAST_FULL,
    FORECAST_GROW_IN,
    FORECAST_GROW_OUT,
    FORECAST_HORIZON,
    FORECAST_LATE,
    FORECAST_LOWEST,
    FORECAST_MOVE,
    FORECAST_NEXT,
    FORECAST_NO_INCOME,
    FORECAST_NONE,
    FORECAST_NOW,
    FORECAST_NUMBERS,
    FORECAST_PAINT,
    FORECAST_RESET,
    FORECAST_SELL_NOTE,
    FORECAST_SHOW_IN,
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
    forecastMore,
    forecastModel,
    forecastNext,
    forecastNextMore,
    forecastSummary,
    hasIncome,
    forecastPerYear,
    forecastPlan,
    forecastRateOf,
    forecastEveryday,
    horizonChoices,
    forecastFigure,
    inCurrency,
    knobsIn,
    knobsMoved,
    pairsOf,
    readoutAt,
    scenario,
    spendRange,
    spendSaid,
    listedSteps,
    nowPlaced,
    underNote,
    type Counted,
    type ForecastModel,
    type ForecastPlan,
    type GroupKnobs,
    type Growth,
    type HorizonChoice,
    type Scenario,
    type SpendRange,
  } from '../src/forecast.ts';
  import { groupNamed, leaveGroup, pairsAcross, sellRows, soldName, walkKnobs, type Group, type GroupMember, type SellRow } from './forecast-group.svelte.ts';

  let { block, opts = {} }: { block: Block; opts?: RenderOptions } = $props();

  const model = $derived(forecastModel(block.rows.map((r) => r.cells.map((c) => text(inline(c, opts))))));

  /**
   * What a walk tells its group beyond `GroupMember`: what it may count in or out, by side, and its spend slider's reach
   * in its own money. Every member is written by this component, so every member carries both.
   */
  type Member = GroupMember & { counts: { in: Counted[]; out: Counted[] }; range: SpendRange; money: Money };
  /** What `forecastFigure` writes an amount of a walk from: its currency and the record's own. */
  type Money = Pick<ForecastModel, 'currency' | 'home' | 'template'>;

  /* A WALK ON ITS OWN HOLDS ITS KNOBS HERE; A WALK OF A GROUP (one a currency) READS THE GROUP'S, so one set of controls,
     under the walk that names `knobs`, moves every walk of the declaration at once. Spending is held by currency. */
  const own: GroupKnobs = $state({ horizon: null, late: 0, spend: {}, leave: [], grow: { in: 0, out: 0 }, drift: {}, sell: null, noIncome: false });
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
  /* A WALK OF A GROUP READS THE SELL DAY OF ITS OWN KEY (`walkKnobs`), so selling one walk's holdings moves that walk only. */
  const knobs = $derived(drawn ? { ...(group ? walkKnobs(drawn, group, key) : knobsIn(drawn, held, key)), spend: spendOf(key) * rate } : null);
  const base = $derived(drawn ? scenario(drawn, baseKnobs(drawn)) : null);
  const shown = $derived(drawn && knobs ? scenario(drawn, knobs) : null);
  const moved = $derived(drawn && knobs ? knobsMoved(drawn, knobs) : false);
  const plan = $derived(drawn && shown && base ? forecastPlan(drawn, shown, moved ? base : null) : null);
  const knobbed = $derived(Boolean(opts.scenario) && (model?.knobs.length ?? 0) > 0);
  /* WHETHER ANYTHING IS DRAWN UNDER THE CHART TO MOVE: a knob, or another currency to show it in. */
  /* THE HORIZON IS UP FRONT NOW, so a block whose only knob is the horizon has nothing for Adjust to open. */
  const controls = $derived((knobbed && Boolean(model?.knobs.some((k) => k !== 'horizon'))) || shows.length > 0);
  /* EVERY MOVEMENT SITS INSIDE ADJUST WHERE ADJUST IS DRAWN, and stood alone under the chart as an orphan line of grey
     (the money review). Without Adjust it stays under the chart, as `toHTML` draws it, so a reader can still open it. */
  const inside = $derived(Boolean(opts.scenario) && controls);
  const choices = $derived(drawn ? horizonChoices(drawn, Boolean(opts.walk)) : []);

  /* A LENGTH PAST THE WALK IS ASKED FOR AND HELD (`opts.walk`): the chart keeps drawing as far as the walk reaches until
     the longer walk lands, then draws the length picked. Each length is asked for once while the chart is drawn, since
     the host keeps asking for it on every read after. "To the end" has no length until the walk lands, so the reach it
     was asked from is kept, and once the walk the host sends reaches elsewhere the knob moves to its new end. */
  const asked = new Set<number | 'last'>();
  let ending = $state<number | null>(null);
  const pick = (c: HorizonChoice) => {
    held.horizon = c.days;
    ending = c.walk === 'last' && drawn ? drawn.reach : null;
    if (c.walk === undefined || !opts.walk || asked.has(c.walk)) return;
    asked.add(c.walk);
    opts.walk(c.walk);
  };
  $effect(() => {
    if (ending === null || !drawn || drawn.reach === ending) return;
    const end = choices.find((c) => c.end);
    if (end) held.horizon = end.days;
    ending = null;
  });
  /* THE LENGTH PRESSED: the one held, while a longer walk is on its way, when the knob offers it, else the one drawn. */
  const pressed = (s: Scenario): number => (held.horizon !== null && choices.some((c) => c.days === held.horizon) ? held.horizon : s.horizon);
  /* THE CONTROLS OF A GROUP OFFER WHAT EVERY WALK MAY COUNT, and spending in each walk's currency. */
  const members = $derived(group ? (Object.entries(group.members) as [string, Member][]).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)) : []);
  const counts = $derived.by((): { in: Counted[]; out: Counted[] } => {
    /* OVER THE LENGTH ON SCREEN, not the whole walk the host sent, which reaches past it so a longer one is a press away. */
    if (!group) return drawn && knobs ? countsOf(drawn, knobs.horizon) : { in: [], out: [] };
    const side = (s: 'in' | 'out'): Counted[] => [...new Map(members.flatMap(([, m]) => m.counts[s]).map((h) => [h.label, h] as const)).values()];
    return { in: side('in'), out: side('out') };
  });
  /* "LEAVE OUT" IS FOLDED INTO WHAT COUNTS: a block that still names `leave` gets the one control, with the same list. */
  const countable = $derived(
    Boolean(model && (model.knobs.includes('count') || model.knobs.includes('leave'))) && counts.in.length + counts.out.length > 0,
  );
  const spends = $derived<[string, Money, SpendRange][]>(
    group ? members.map(([k, m]) => [k, m.money, m.range]) : drawn ? [['', drawn, spendRange(drawn)]] : [],
  );
  /* THE PAIRS TO DRIFT AND THE HOLDINGS TO SELL ARE EVERY WALK'S, as the streams are: the controls sit under one walk
     and move them all. A pair is one slider wherever it was converted; what is sold is a control for each walk. */
  const pairs = $derived(group ? pairsAcross(members) : drawn ? pairsOf(drawn) : []);
  const selling = $derived<SellRow[]>(group ? sellRows(members) : sellRows([['', { pairs: [], sells: (drawn?.sells ?? []).map((x) => x.label) }]]));
  const soldOn = (k: string): string => (group ? group.sold[k] : held.sell) ?? '';
  /* A SELL DAY SET FOR ANOTHER WALK IS STILL SOMETHING TO RESET, though it leaves the walk these controls sit under alone. */
  const resettable = $derived(moved || selling.some((r) => soldOn(r.key) !== ''));
  const sellEnd = $derived(drawn && shown ? addDays(drawn.today, shown.horizon) : '');
  const soon = $derived(drawn && shown ? underNote(drawn, shown) : '');
  const readout = $derived(drawn && shown && plan && scrub !== null ? readoutAt(drawn, shown, plan, scrub) : null);
  /* THE ANSWER OVER THE CHART AND THE LIST UNDER IT, from the walk on screen, as `toHTML` draws them from the host's. */
  const summary = $derived(drawn && shown ? forecastSummary(drawn, shown) : []);
  const next = $derived(drawn && shown && plan ? forecastNext(drawn, shown, plan) : { rows: [], more: 0 });
  /* THE TWO QUESTIONS ASKED MOST, UP FRONT AND NOT INSIDE ADJUST (money-core 3.29.0): how far to look, and what if no
     money came in. Each is drawn only where it can move the line: a horizon of more than one length, and a walk that
     has money coming in to take away. */
  const horizonUp = $derived(knobbed && Boolean(model?.knobs.includes('horizon')) && choices.length > 1);
  const incomeUp = $derived(knobbed && drawn !== null && model?.group === null && hasIncome(drawn, held.horizon ?? drawn.horizon));
  /* THE INCOME QUESTION IS SET BY REPLACING THE VALUE, as the later knobs are, for a group made without it. */
  const toggleIncome = () => {
    held.noIncome = !held.noIncome;
  };
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
    const mine = countsOf(model, held.horizon ?? model.horizon);
    const member: Member = { money: { currency: model.currency, home: model.home, template: model.template }, heavy: [...mine.in, ...mine.out], pairs: pairsOf(model), sells: model.sells.map((x) => x.label), counts: mine, range: spendRange(model, key) };
    group.members[key] = member;
  });

  const reset = () => {
    held.horizon = null;
    ending = null;
    held.late = 0;
    held.spend = {};
    held.leave = [];
    held.grow = { in: 0, out: 0 };
    held.drift = {};
    held.sell = null;
    held.noIncome = false;
    if (group) group.sold = {};
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
  const setSell = (k: string, e: Event) => {
    const v = (e.currentTarget as HTMLInputElement).value;
    if (!group) held.sell = v === '' ? null : v;
    else if (v === '') delete group.sold[k];
    else group.sold[k] = v;
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
  /* A THUMB LIFTED LEAVES THE DAY IT READ, because the thumb was over the line while it moved and the reading is what it
     came for; a mouse that leaves takes the reading with it. A page scroll that takes the touch (`touch-action: pan-y`,
     so an upward swipe on the chart still scrolls) cancels it, and the readout goes. */
  const leave = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') scrub = null;
  };

  /* ── Adjust: a disclosure over the knobs, under the chart at every width ── */

  /** Names the knobs for Adjust's `aria-controls`, one id a drawn forecast, the same on the server and in the page. */
  const uid = $props.id();
  let knobsOpen = $state(false);

  /* WHAT COUNTS SHOWS ITS HEAVIEST FEW A SIDE, and the rest wait behind one "N more". A switch already turned off
     stays in view wherever it ranks, so what was left out can always be counted back in. */
  let everyCount = $state(false);
  const shownOf = (list: readonly Counted[]): Counted[] =>
    everyCount ? [...list] : list.filter((h, i) => i < FORECAST_COUNTS_SHOWN || held.leave.includes(h.label));
  const countsHidden = $derived(everyCount ? 0 : counts.in.length + counts.out.length - shownOf(counts.in).length - shownOf(counts.out).length);

  /* ── the chart full screen ─────── */

  let full = $state<HTMLDialogElement>();
  /* WHAT THE DIALOG HOLDS IS DRAWN ONLY WHILE IT IS OPEN, so the chart is not in the page twice behind a closed one. It
     goes once the close has ENDED, not when it starts: dropped on `close`, the sheet went out as its head alone, and
     `blocks-charts.css` cut that short rather than show it. Not if the dialog was opened again while it went. */
  let enlarged = $state(false);
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
    onpointerdown={grab}
    onpointermove={track}
    onpointerleave={leave}
    onpointercancel={() => (scrub = null)}
  >
    <svg class="forecast-chart" viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label={p.sentence}>
      <!-- THE LINE IS INK ABOVE £0 AND RED UNDER IT, one stroke cut at the zero rule by a hard stop, so the part a person
           must act on is the only red on the chart (the money review). Drawn only where the walk goes under. -->
      {#if p.below}<defs
          ><linearGradient class="forecast-split" id="{uid}-under" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="100"
            ><stop class="forecast-above" offset="{p.zero}%"></stop><stop class="forecast-under" offset="{p.zero}%"></stop></linearGradient
          ></defs
        >{/if}
      {#if p.grid}<path class="forecast-grid" {...FORECAST_PAINT.grid} d={p.grid} vector-effect="non-scaling-stroke"></path>{/if}
      {#if p.area}<path class="forecast-area" {...FORECAST_PAINT.area} d={p.area} vector-effect="non-scaling-stroke"></path>{/if}
      {#if p.below}<path class="forecast-area" data-below="" {...FORECAST_PAINT.area} d={p.below} vector-effect="non-scaling-stroke"></path>{/if}
      <path class="forecast-zero" d="M0 {p.zero}H1000" vector-effect="non-scaling-stroke"></path>
      {#if p.cross}<path class="forecast-cross-rule" {...FORECAST_PAINT.rule} d={p.cross.rule} vector-effect="non-scaling-stroke"></path>{/if}
      <path class="forecast-today" d={p.now.rule} vector-effect="non-scaling-stroke"></path>
      {#if p.base}<path class="forecast-base" d={p.base} vector-effect="non-scaling-stroke"></path>{/if}
      {#if p.past}<path class="forecast-past" style={p.below ? `stroke:url(#${uid}-under)` : undefined} d={p.past} vector-effect="non-scaling-stroke"></path>{/if}
      {#if p.walk}<path class="forecast-walk" style={p.below ? `stroke:url(#${uid}-under)` : undefined} {...FORECAST_PAINT.walk} d={p.walk} vector-effect="non-scaling-stroke"></path>{/if}
      {#if p.future}<path class="forecast-future" style={p.below ? `stroke:url(#${uid}-under)` : undefined} d={p.future} vector-effect="non-scaling-stroke"></path>{/if}
      <path class="forecast-low" d={p.low} vector-effect="non-scaling-stroke"></path>
      {#if p.marks.in}<path class="forecast-mark" data-dir="in" {...FORECAST_PAINT.mark} d={p.marks.in} vector-effect="non-scaling-stroke"></path>{/if}
      {#if p.marks.out}<path class="forecast-mark" data-dir="out" {...FORECAST_PAINT.mark} d={p.marks.out} vector-effect="non-scaling-stroke"></path>{/if}
      <path class="forecast-now" {...FORECAST_PAINT.now} d={p.now.d} vector-effect="non-scaling-stroke"></path>
      {#if p.cross}<path class="forecast-cross" d={p.cross.d} vector-effect="non-scaling-stroke"></path>{/if}
      <!-- THE DAY BEING READ, a hairline down the chart, so a thumb sees which point the readout names. -->
      {#if readout}<path class="forecast-scrub" {...FORECAST_PAINT.rule} d="M{Number(readout.at) * 1000} 0V100" vector-effect="non-scaling-stroke"></path>{/if}
    </svg>
    <!-- TODAY'S BALANCE BESIDE TODAY'S DOT, where the line starts, hidden like the axis: the chart's name says it. -->
    <!-- A CROSSING NEAR TODAY SETS THE TWO LABELS APART: the balance under its dot, the flag's day after its rule. -->
    <span class="forecast-now-label num" data-near-flag={p.cross?.near ? '' : undefined} data-place={nowPlaced(p) ?? undefined} data-over={p.now.over ? '' : undefined} style="--at:{p.now.at};--y:{p.now.y}" aria-hidden="true"
      ><span class="forecast-now-word">{FORECAST_NOW}</span><span class="forecast-now-figure">{p.now.label}</span></span
    >
    <!-- THE VALUE AXIS, its round steps down one side, zero among them; hidden, because the chart's name says the walk.
         Where zero is off it, its end nearest zero carries a break beside the real amount, and the name says where it starts.
         The break is `FORECAST_AXIS_BREAK` written out and not drawn from a string, whose helper grew the entry script's shared runtime. -->
    <ol class="forecast-axis" aria-hidden="true">
      {#each p.axis as a}<li class="forecast-axis-tick" data-zero={a.zero ? '' : undefined} data-cut={a.cut ? '' : undefined} style="--at:{a.at}"
          >{#if a.cut}<span class="forecast-axis-break" style={FORECAST_AXIS_BREAK_STYLE}><svg viewBox="0 0 10 10" width="0.8em" height="0.8em" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M1 8L4 2M6 8L9 2" /></svg></span>{/if}{a.label}</li
        >{/each}
    </ol>
    {#if p.cross}<span class="forecast-pin" data-side={p.cross.near ? 'end' : undefined} style="--at:{p.cross.at}" aria-hidden="true">{TONES.warn.glyph} {p.cross.day}</span>{/if}
    <!-- EACH PART OF A PLAN THE LINE DROPS BY, numbered on the line and in the list under the chart (`drops`). -->
    {#each p.drops as d (d.n)}<span class="forecast-drop num" style="--at:{d.at};--y:{d.y}" aria-hidden="true">{d.n}</span>{/each}
    <!-- THE LOWEST POINT SAID BESIDE ITS DOT, where it is not today (`lowLabel`). -->
    {#if p.lowLabel}<span
        class="forecast-low-label num"
        data-side={p.lowLabel.side}
        data-drop={p.lowLabel.drop ? '' : undefined}
        data-foot={p.lowLabel.foot ? '' : undefined}
        style="--at:{p.lowLabel.at};--y:{p.lowLabel.y}"
        aria-hidden="true"><span class="forecast-low-word">{FORECAST_LOWEST}</span><span class="forecast-low-figure">{p.lowLabel.figure}</span></span
      >{/if}
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
    {#each p.ticks as t}<li class="forecast-tick" data-edge={t.edge ? '' : undefined} style="--at:{t.at}">{t.label}</li>{/each}
  </ol>
{/snippet}

<!-- EVERY MOVEMENT IN ORDER UNDER THE CHART, each part of a plan numbered as its mark on the line is (`forecastNext`). -->
{#snippet listed()}
  {#if next.rows.length}
    <div class="forecast-next">
      <p class="forecast-next-head">{FORECAST_NEXT}</p>
      <ol class="forecast-next-list">
        {#each next.rows as r, i (i)}
          {#if r.everyday}
            <li class="forecast-next-item" data-everyday="">{r.said}</li>
          {:else}
            <li class="forecast-next-item" data-dir={r.dir}
              >{#if r.n === null}<span class="forecast-next-dot" aria-hidden="true"></span>{:else}<span class="forecast-next-n num" aria-hidden="true">{r.n}</span>{/if}<span
                class="forecast-next-day">{r.day}</span
              ><span class="forecast-next-label">{r.label}</span><span class="forecast-next-amount num">{r.amount}</span></li
            >
          {/if}
        {/each}
      </ol>
      {#if next.more > 0}<p class="forecast-next-more">{forecastNextMore(next.more)}</p>{/if}
    </div>
  {/if}
{/snippet}

<!-- EVERY MOVEMENT, the walk's numbers in a fold: under the chart, or inside Adjust where there is one. -->
{#snippet numbers(m: ForecastModel, s: Scenario)}
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
          <th scope="row">{day(m.today)}</th>
          <td>{m.label}</td>
          <td class="num"></td>
          <td class="num">{m.template}</td>
        </tr>
        <!-- EVERYDAY SPENDING IS ONE LINE, not a row a week (`forecastEveryday`), as toHTML draws it. -->
        {#if forecastEveryday(m, s)}
          <tr data-everyday="">
            <td colspan="4">{forecastEveryday(m, s)}</td>
          </tr>
        {/if}
        {#each listedSteps(s.steps) as step}
          <tr>
            <th scope="row">{day(step.day)}</th>
            <td>{step.label}</td>
            <td class="num">{forecastFigure(m, step.delta)}</td>
            <td class="num">{forecastFigure(m, step.balance)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </details>
{/snippet}

<!-- THE HANDLE AT THE TOP OF A SHEET, which a thumb pulls down to close it. It holds nothing a person presses. -->
{#snippet handle()}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="forecast-sheet-grab" aria-hidden="true" onpointerdown={pullFrom} onpointermove={pull} onpointerup={letGo} onpointercancel={letGo}>
    <span class="forecast-sheet-grab-bar"></span>
  </div>
{/snippet}

<!-- EVERY KNOB, opened by Adjust under the chart. -->
{#snippet knobsOf(m: ForecastModel, s: Scenario)}
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
    {#if m.knobs.includes('late')}
      <label class="forecast-knob">
        <span class="forecast-knob-name">{m.lateName ?? FORECAST_LATE}</span>
        <input class="forecast-range" type="range" min="0" max="60" step="5" bind:value={held.late} />
        <span class="forecast-knob-value num">{forecastDays(held.late)}</span>
        {#if m.late !== null}<span class="forecast-knob-note">{forecastAverage(m.late)}</span>{/if}
      </label>
    {/if}
    {#if m.knobs.includes('spend')}
      {#each spends as [k, money, range] (k)}
        <label class="forecast-knob">
          <span class="forecast-knob-name">{range.name}</span>
          <input class="forecast-range" type="range" min={range.min} max={range.max} step={range.step} value={spendOf(k) * rate} oninput={(e) => setSpend(k, e)} />
          <span class="forecast-knob-value num">{spendSaid(range, spendOf(k) * rate, forecastFigure(money, Math.abs(spendOf(k) * rate), 'read'))}</span>
          <span class="forecast-knob-note">{range.note}</span>
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
              {#each shownOf(list) as h (h.label)}
                <button type="button" class="forecast-chip" role="switch" aria-checked={!held.leave.includes(h.label)} onclick={() => toggle(h.label)}
                  ><span class="switch-track" aria-hidden="true"></span><span class="forecast-chip-label">{h.label}</span><span class="forecast-chip-amount num"
                    >{h.amount}</span
                  ></button
                >
              {/each}
            </div>
          {/if}
        {/each}
        {#if countsHidden > 0}<button type="button" class="forecast-tool forecast-more" onclick={() => (everyCount = true)}>{forecastMore(countsHidden)}</button>{/if}
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
    {#if m.knobs.includes('sell')}
      {#each selling as row (row.key)}
        <label class="forecast-knob">
          <span class="forecast-knob-name">{soldName(row, selling.length > 1)}</span>
          <input class="forecast-date" type="date" min={m.today} max={sellEnd} value={soldOn(row.key)} onchange={(e) => setSell(row.key, e)} />
          <span class="forecast-knob-note">{FORECAST_SELL_NOTE}</span>
        </label>
      {/each}
    {/if}
    {#if resettable}
      <button type="button" class="forecast-reset" onclick={reset}>{FORECAST_RESET}</button>
    {/if}
  {/if}
{/snippet}

<div class="prop forecast">
  {#if !drawn || !shown || !plan}
    <p class="forecast-empty">{FORECAST_NONE}</p>
  {:else}
    <!-- HOW FAR TO LOOK AND WHAT IF NOTHING CAME IN, the two questions up front: one segmented control, the house's, from a
         quarter to the block's longest choice and "To the end", and one switch. -->
    {#if horizonUp || incomeUp}
      <div class="forecast-ask">
        {#if horizonUp}
          <div class="segmented forecast-segs" role="group" aria-label={FORECAST_HORIZON}>
            {#each choices as c (c.days)}
              <button type="button" class="segment" data-on={pressed(shown) === c.days ? '' : undefined} aria-pressed={pressed(shown) === c.days} onclick={() => pick(c)}>{c.label}</button>
            {/each}
          </div>
        {/if}
        {#if incomeUp}
          <button type="button" class="forecast-chip forecast-income" role="switch" aria-checked={Boolean(held.noIncome)} onclick={toggleIncome}
            ><span class="switch-track" aria-hidden="true"></span><span class="forecast-chip-label">{FORECAST_NO_INCOME}</span></button
          >
        {/if}
      </div>
    {/if}
    <dl class="forecast-summary">
      {#each summary as c (c.key)}
        <div class="forecast-sum" data-key={c.key} data-below={c.below ? '' : undefined}>
          <dt class="forecast-sum-label">{c.label}</dt>
          <dd class="forecast-sum-figure num">{c.figure}</dd>
          <dd class="forecast-sum-note" data-dir={c.dir}>{c.note}</dd>
        </div>
      {/each}
    </dl>
    <!-- NO SENTENCE WHERE THE PAGE'S HEADLINE SAYS IT (`legend`), until a knob moves the walk off the one it read. -->
    {#if plan.legend}{@render said(plan)}{/if}
    {@render chart(plan)}
    {#if soon}
      <p class="forecast-soon">{soon}</p>
    {/if}
    <!-- WHAT THE KNOBS CHANGED, right under the line they moved: the walk with the controls, and each other walk of its group. -->
    {#if (knobbed || group) && moved && base}
      <p class="forecast-against" role="status">{against(base, shown, moved)}</p>
    {/if}
    {#if opts.scenario}
      <!-- ADJUST IS A DISCLOSURE, the same quiet pill as full screen, pressed while the knobs under it are open. -->
      <div class="forecast-tools">
        {#if controls}<button
            type="button"
            class="forecast-tool forecast-adjust"
            data-adjust=""
            aria-expanded={knobsOpen}
            aria-controls="{uid}-knobs"
            onclick={() => (knobsOpen = !knobsOpen)}>{FORECAST_ADJUST}</button
          >{/if}
        <!-- FULL SCREEN IS AN ICON, named for a screen reader, beside Adjust in the tile's head (the money review). -->
        <button type="button" class="forecast-tool" data-full="" aria-label={FORECAST_FULL} onclick={openFull}
          ><svg class="forecast-tool-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
            ><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"></path></svg
          ></button
        >
      </div>
    {/if}
    <!-- THE KNOBS COME AFTER THE CHART, and only once asked for, so the answer is read before the questions a reader may ask of it. -->
    {#if controls}
      <div class="forecast-knobs" data-inline="" id="{uid}-knobs" hidden={!knobsOpen}>
        {@render knobsOf(drawn, shown)}
        {#if inside}{@render numbers(drawn, shown)}{/if}
      </div>
    {/if}
    {@render listed()}
    <!-- EVERY MOVEMENT IS A QUESTION ASKED OF THE ANSWER, so where there is an Adjust it is the last thing inside it. -->
    {#if !inside}{@render numbers(drawn, shown)}{/if}
    {#if opts.scenario}
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <dialog
        class="forecast-sheet"
        data-full=""
        style="--pulled: {pulled}px"
        bind:this={full}
        aria-label={title}
        onclick={outside}
        onkeydown={within}
        onclose={(e) => {
          const d = e.currentTarget as HTMLDialogElement;
          void Promise.allSettled(d.getAnimations().map((a) => a.finished)).then(() => {
            if (!d.open) enlarged = false;
          });
        }}
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

<!--
  WHAT THE CHART SHEET (`packages/skin/blocks-charts.css`) LEAVES TO THE COMPONENT: the readout as a thumb reads it in a
  narrow tile, and the controls a thumb presses. The sheet sets the rest.

  GLOBAL, UNDER `.forecast`, and not scoped: a scoped rule puts the component's own class on every element it names,
  and the parity tests hold this drawing equal to `toHTML`'s, tag for tag and class for class. The rules ride the
  component's own stylesheet, so they arrive with the first forecast drawn and add nothing to what every screen loads.
-->
<style>
  /* THE PLOT IS ITS OWN MEASURE, so the readout is laid out for the tile it sits in and not for the window: a forecast
     in a narrow column of a wide page is a phone's width too. */
  :global(.forecast .forecast-plot) {
    container: forecast-plot / inline-size;
  }

  /* ONE FLAT TILE, as every block is: no glass behind the readout and no shadow under it. */
  :global(.forecast .forecast-readout) {
    background: var(--well);
    backdrop-filter: none;
    box-shadow: none;
  }

  /* SAFARI'S SPELLING, as the sheet writes it beside the standard one. */
  @supports (-webkit-backdrop-filter: none) {
    :global(.forecast .forecast-readout) {
      -webkit-backdrop-filter: none;
      backdrop-filter: none;
    }
  }

  /* NARROW, THE READOUT IS A BAND ACROSS THE TOP OF THE CHART, the day at its start and the balance at its end, so it
     never runs past the tile's edge and is never under the thumb that moves it. Beside the day it floated, and from
     the middle of a 390 chart it ran out of the tile. */
  @container forecast-plot (max-width: 600px) {
    :global(.forecast .forecast-readout),
    :global(.forecast .forecast-readout[data-flip]) {
      inset-inline: 0;
      grid-template-columns: 1fr auto;
      align-items: baseline;
      max-inline-size: none;
      margin-inline-start: 0;
      translate: none;
    }

    :global(.forecast .forecast-readout-move) {
      grid-column: 1 / -1;
    }
  }

  /* EVERY CONTROL UNDER THE CHART TAKES A THUMB. The sheet sizes the chips, the tools, the sliders and Reset; these are
     the rest a thumb presses. */
  @media (pointer: coarse) {
    :global(.forecast .forecast-segs .segment),
    :global(.forecast .forecast-date),
    :global(.forecast .forecast-toggle) {
      min-block-size: var(--tap);
    }
  }
</style>
