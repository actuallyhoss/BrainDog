<!--
  `kpis`: a project's numbers, or Today's (2.4 and 2.8). `src/kpis.ts` decides every
  figure, word and path; this file lays them out and `packages/skin/kinds/kpis.css` paints them.

  TWO FORMS.
    project  the lead KPI (marked `headline`, else the first) large, its chart across the tile, then up to five more as
             a grid: name, value, change, the chart its shape picks, the target or the stale line with its fix.
    today    one row a KPI, ranked by the source: the project's colour and name, the KPI, the value, why it is here,
             and a small chart at the end.

  THE PROJECT'S COLOUR IS `--chart-1`, which the page sets inside a project; a Today row sets its own from `slot`.
  Change is coloured by which way is good and always carries its word; off target is amber with its word, never red. Under three points
  there is no chart, only the number, its date and its target.

  The fix a stale KPI offers is the `fix` snippet, or a plain button calling `onfix` when no snippet is given; with
  neither, the stale line is said and nothing is pressed. `add` is the foot ("Add a number").

  A TODAY ROW OPENS WHERE ITS NUMBER LIVES when the host says where (`href`): the row's words are one link, grown over the
  row, so the whole row is the target and a fix button on it still takes its own press. A row whose KPI stopped arriving
  says so in the warn colour, under its figure, whatever line it was ranked for.

  `lead={false}` DRAWS NO LEAD: every KPI is a tile, the one marked `headline` first with `leads` said under its name.
  A project page whose hero already says the headline large hands it, so one place says that figure big.

  A HOST THAT OPENS A KPI ITSELF hands `onopen`, which wins over `href`: the name is then a button whose press covers
  the tile or the row, and opens whatever the host opens (the app's sheet). `menu` is drawn at the end of the name's
  line, a KPI's own few verbs. With neither the markup is as it was, a name in a paragraph.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { kpisPlan, type KpiInput, type KpiView, type KpisOptions } from '../src/kpis.ts';

  let {
    kpis,
    form = 'project',
    home = null,
    now,
    fix,
    onfix,
    add,
    href,
    onopen,
    menu,
    lead = true,
    leads,
  }: {
    kpis: readonly KpiInput[];
    form?: 'project' | 'today';
    home?: string | null;
    now?: KpisOptions['now'];
    fix?: Snippet<[KpiView]>;
    onfix?: (kpi: KpiInput) => void;
    add?: Snippet | undefined;
    /** Where a Today row opens: the KPI's project page, or `null` for a row that opens nothing. */
    href?: ((kpi: KpiInput) => string | null | undefined) | undefined;
    /** Opens the KPI where the host keeps it (the app's sheet); a row then opens this and not `href`. */
    onopen?: ((kpi: KpiInput) => void) | undefined;
    /** A KPI's own verbs, drawn at the end of its name's line. */
    menu?: Snippet<[KpiView]> | undefined;
    /** Whether the project form draws its lead KPI large; with `false` it is the first tile. */
    lead?: boolean | undefined;
    /** Said under the headline's name where no lead draws it large. */
    leads?: string | undefined;
  } = $props();

  const plan = $derived(kpisPlan(kpis, { home, ...(now !== undefined ? { now } : {}) }));
  /* WITH NO LEAD, the lead is the first tile. */
  const tiles = $derived(lead || !plan.lead ? plan.rest : [plan.lead, ...plan.rest]);
  const hue = (k: KpiView): string | undefined => (k.slot ? `--chart-1:var(--cat-${k.slot})` : undefined);
  const state = (k: KpiView): string | undefined => (k.target?.state === 'off' ? 'off' : k.stale ? 'stale' : undefined);

  /* A CHART DRAWS IN ONLY WHEN IT ARRIVES AFTER THE BLOCK'S FIRST DRAW (the recompose step), and that is decided once,
     as its element is made (`data-draw`, by an attachment that reads no state). The draw-in starts fully clipped, so a
     chart drawn with the page and caught at the start of its draw-in was an empty band between the change line and the
     target line. A chart already drawn never gains it, not even when a re-read hands the same numbers again. */
  const drawn = { yet: false };
  $effect(() => {
    drawn.yet = true;
  });
  const drawIn = (el: Element): void => {
    if (drawn.yet) el.setAttribute('data-draw', '');
  };

  /** Where a share's target sits on its ring, as a short tick across the track. */
  const notch = (mark: string): { x1: string; y1: string; x2: string; y2: string } => {
    const a = (Number(mark) / 100) * 2 * Math.PI;
    const p = (r: number) => [(18 + r * Math.sin(a)).toFixed(2), (18 - r * Math.cos(a)).toFixed(2)];
    const [x1, y1] = p(13);
    const [x2, y2] = p(21);
    return { x1: x1!, y1: y1!, x2: x2!, y2: y2! };
  };
</script>

{#snippet named(k: KpiView)}
  {#if onopen}<button type="button" class="kpi-name kpi-press" onclick={() => onopen(k.input)}>{k.name}</button>{:else}<span class="kpi-name">{k.name}</span>{/if}
{/snippet}

{#snippet title(k: KpiView)}
  {#if menu}
    <div class="kpi-title">{@render named(k)}<span class="kpi-menu">{@render menu(k)}</span></div>
  {:else if onopen}
    <p class="kpi-title">{@render named(k)}</p>
  {:else}
    <p class="kpi-name">{k.name}</p>
  {/if}
{/snippet}

{#snippet figure(k: KpiView)}
  {#if k.figure}
    <p class="kpi-figure num">
      <!-- A PERCENT OR A DEGREE HUGS ITS FIGURE (coordinator's live check, 1 Nov): "1.8 %" stood with the unit a step away. -->
      {#if k.figure.before}<span class="kpi-code">{k.figure.before}</span>{/if}<span class="kpi-main">{k.figure.main}{#if k.figure.after === '%' || k.figure.after === '°'}{k.figure.after}{/if}</span>{#if k.figure.after && k.figure.after !== '%' && k.figure.after !== '°'}<span
          class={/^[A-Z]{3}$/u.test(k.figure.after) ? 'kpi-code' : 'kpi-unit'}>{k.figure.after}</span
        >{/if}
    </p>
  {:else}
    <p class="kpi-figure kpi-none num" aria-label={k.stale?.said}>—</p>
  {/if}
{/snippet}

{#snippet change(k: KpiView, row = false)}
  {#if k.change || k.when || k.aged}
    <p class="kpi-meta">
      {#if k.change}
        <span class="kpi-change" data-tone={k.change.tone} data-dir={k.change.dir}
          >{#if k.change.dir !== 'flat'}<svg class="kpi-arrow" viewBox="0 0 12 12" aria-hidden="true"
              ><path d={k.change.dir === 'up' ? 'M6 10V2M2.5 5.5 6 2l3.5 3.5' : 'M6 2v8M2.5 6.5 6 10l3.5-3.5'}></path></svg
            >{/if}{k.change.said}</span
        >
        <!-- A TODAY ROW SAYS WHICH PERIOD A FLOW'S FIGURE IS OF ("in the week of 24 Aug") in place of the one its change is
             on: its last whole week is not the newest reading Numbers lists (audit 2, B2), and a row has room for one. -->
        {#if row && k.kind === 'flow' && k.when}<span class="kpi-when">{k.when}</span>{:else}<span class="kpi-against">{k.change.against}</span>{/if}
      {:else if k.when && !k.aged.endsWith(k.when)}
        <span class="kpi-against">{k.when}</span>
      {/if}
      <!-- AN OLD READING SAYS ITS DAY, beside the change it is read against or alone (`aged`, more than a week): a figure
           with no change line (a target a year out) said nothing of its age. -->
      {#if k.aged}<span class="kpi-against" data-old="">{k.aged}</span>{/if}
    </p>
  {/if}
{/snippet}

{#snippet foot(k: KpiView)}
  {#if k.stale}
    <div class="kpi-stale">
      <p class="kpi-stale-said">
        <svg class="kpi-clock" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.25"></circle><path d="M8 4.75V8l2.25 1.5"></path></svg>{k.stale.said}
      </p>
      {#if fix}{@render fix(k)}{:else if onfix}<button type="button" class="kpi-fix" onclick={() => onfix(k.input)}>{k.stale.fix}</button>{/if}
    </div>
  {/if}
  {#if k.target && !(k.chart?.bar)}
    <p class="kpi-target" data-state={k.target.state}>
      {#if k.target.state === 'met'}<svg class="kpi-tick" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.25 5 8.75l4.5-5.5"></path></svg>{/if}{k.target.said}
    </p>
  {/if}
  {#if k.sofar}<p class="kpi-sofar">{k.sofar}</p>{/if}
  {#if k.left}<p class="kpi-left">{k.left}</p>{/if}
{/snippet}

{#snippet chart(k: KpiView, size: 'lead' | 'tile' | 'row')}
  {@const c = k.chart}
  {#if c && c.form === 'ring' && c.ring}
    <svg class="kpi-ring" viewBox="0 0 36 36" role="img" aria-label={k.sentence}>
      <circle class="kpi-ring-track" cx="18" cy="18" r="16" pathLength="100"></circle>
      <circle class="kpi-ring-arc" cx="18" cy="18" r="16" pathLength="100" stroke-dasharray={c.ring.dash} {@attach drawIn}></circle>
      {#if c.ring.mark !== null}{@const n = notch(c.ring.mark)}<line class="kpi-ring-mark" x1={n.x1} y1={n.y1} x2={n.x2} y2={n.y2}></line>{/if}
    </svg>
  {:else if c && c.form === 'bar' && c.bar}
    <div class="kpi-bar">
      <span class="kpi-track" role="img" aria-label={k.sentence} style="--fill:{c.bar.fill}"
        ><span class="kpi-fill" {@attach drawIn}></span>{#if c.bar.mark !== null}<span class="kpi-mark" style="--at:{c.bar.mark}"></span>{/if}</span
      >
      {#if k.target}
        <p class="kpi-bar-said num">
          <span class="kpi-share">{c.bar.share}</span><span class="kpi-of">of {k.target.value}</span>{#if k.target.by}<span class="kpi-by">{k.target.by}</span>{/if}
        </p>
      {/if}
    </div>
  {:else if c}
    <div class="kpi-plot" data-size={size}>
      <svg class="kpi-chart" viewBox="0 0 1000 100" preserveAspectRatio="none" role="img" aria-label={k.sentence} {@attach drawIn}>
        {#if c.area}<path class="kpi-area" d={c.area}></path>{/if}
        {#if c.target}<line class="kpi-target-line" x1="0" x2="1000" y1={c.target.y} y2={c.target.y} vector-effect="non-scaling-stroke"></line>{/if}
        <path class="kpi-line" d={c.line} vector-effect="non-scaling-stroke"></path>
        {#if c.partial}<path class="kpi-partial" d={c.partial} vector-effect="non-scaling-stroke"></path>{/if}
        {#if c.end}<path class="kpi-end" d={c.end} vector-effect="non-scaling-stroke"></path>{/if}
      </svg>
      {#if size === 'lead' && c.target}<span class="kpi-target-label num" style="--y:{c.target.y}" aria-hidden="true">{c.target.label}</span>{/if}
    </div>
    {#if size === 'lead' && c.ticks.length}
      <ol class="kpi-ticks" aria-hidden="true">
        {#each c.ticks as t}<li class="kpi-tick-label" style="--at:{t.at}" data-align={t.align}>{t.label}</li>{/each}
      </ol>
    {/if}
  {/if}
{/snippet}

{#if form === 'today'}
  <div class="kpis" data-form="today">
    <ul class="kpi-rows">
      {#each plan.rows as k (k.key)}
        {@const to = onopen ? null : (href?.(k.input) ?? null)}
        <li class="kpi kpi-row" data-menu-host={menu ? '' : undefined} style={hue(k)} data-state={state(k)} data-kind={k.kind}>
          <div class="kpi-row-text">
            <p class="kpi-who">
              {#if to}<a class="kpi-open" href={to}
                  >{#if k.project}<span class="kpi-swatch" aria-hidden="true"></span><span class="kpi-project">{k.project}</span>{/if}<span class="kpi-name">{k.name}</span></a
                >{:else}{#if k.project}<span class="kpi-swatch" aria-hidden="true"></span><span class="kpi-project">{k.project}</span>{/if}{@render named(k)}{/if}
            </p>
            {@render figure(k)}
            {#if k.why}
              <p class="kpi-why" data-state={state(k)}>{k.why}</p>
              {#if k.aged}<p class="kpi-meta"><span class="kpi-against" data-old="">{k.aged}</span></p>{/if}
            {:else}
              {@render change(k, true)}
            {/if}
            {#if k.stale && !(k.why && state(k) === 'stale')}
              <p class="kpi-stale-said">
                <svg class="kpi-clock" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.25"></circle><path d="M8 4.75V8l2.25 1.5"></path></svg>{k.stale.said}
              </p>
            {/if}
            {#if k.stale && (fix || onfix)}
              <div class="kpi-stale">
                {#if fix}{@render fix(k)}{:else if onfix}<button type="button" class="kpi-fix" onclick={() => onfix(k.input)}>{k.stale.fix}</button>{/if}
              </div>
            {/if}
          </div>
          {#if k.chart}<div class="kpi-row-chart">{@render chart(k, 'row')}</div>{/if}
          {#if menu}<span class="kpi-menu">{@render menu(k)}</span>{/if}
        </li>
      {/each}
    </ul>
    {#if add}<div class="kpis-foot">{@render add()}</div>{/if}
  </div>
{:else}
  <div class="kpis" data-form="project" data-lead={lead ? undefined : 'none'}>
    {#if lead && plan.lead}
      {@const k = plan.lead}
      <div class="kpi kpi-lead" style={hue(k)} data-state={state(k)} data-kind={k.kind} data-chart={k.chart?.form}>
        <div class="kpi-head">
          {@render title(k)}
          {@render figure(k)}
          {@render change(k)}
          {@render foot(k)}
        </div>
        {#if k.chart}<div class="kpi-body">{@render chart(k, 'lead')}</div>{/if}
      </div>
    {/if}
    {#if tiles.length}
      <ul class="kpi-grid">
        {#each tiles as k (k.key)}
          <li class="kpi kpi-tile" data-menu-host={menu ? '' : undefined} style={hue(k)} data-state={state(k)} data-kind={k.kind} data-chart={k.chart?.form}>
            {@render title(k)}
            {#if !lead && leads && k.headline}<p class="kpi-leads">{leads}</p>{/if}
            <div class="kpi-tile-figure">
              {@render figure(k)}
              {#if k.chart?.form === 'ring'}{@render chart(k, 'tile')}{/if}
            </div>
            {@render change(k)}
            {#if k.chart && k.chart.form !== 'ring'}<div class="kpi-body">{@render chart(k, 'tile')}</div>{/if}
            {@render foot(k)}
          </li>
        {/each}
      </ul>
    {/if}
    {#if add}<div class="kpis-foot">{@render add()}</div>{/if}
  </div>
{/if}
