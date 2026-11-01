<!--
  The look sheet called "Charts and marks": every chart form the renderer draws, at every size it has to survive, and
  every face and mark the product puts beside a name (decision 2 of the experience area).

  THE RECORD IT IS OPENED ON COMES FIRST. Its pages are read as any page is (`pageReader`), and the first block of each
  chart kind is drawn by the page's own reader (`BlockSlot`), under the name of the page it is on. Reading stops when
  every kind is found, and never goes past the first pages of a long record.

  THEN THE SPECIMENS, ALWAYS, because no record holds a chart of exactly two points or a stale one on the day somebody
  looks: each form at 0, 1, 2, 3 and 30 points, fresh and stale, the plan with work in hand, late and done, and the
  forms that hold parts of a whole. They are the renderer's (`sheet.ts`), drawn by the renderer's own `Block` on the
  specimens' own day, so the picture does not move from one photograph to the next. Each says "specimen" over it and
  in its own heading. A kind the record holds none of is named, and its specimen is the one below.

  A STALE SPECIMEN IS STALE DATA: its newest point is days or months old. What a stale chart looks like is the
  renderer's to draw, and this sheet shows whatever it draws.

  THE THIRD OPEN CALL IS DRAWN TWICE HERE, the default labelled: a failed run in red, or in words alone.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { Block, Degraded } from 'braindog-render/svelte';
  import { AGENT_MARKS, type MarkedAgent } from '@braindog/skin/agent-marks.ts';

  import { apiBase } from '$lib/at.ts';
  import BlockSlot from '$lib/page/BlockSlot.svelte';
  import type { Shell } from '$lib/record/boot-live.ts';
  import type { LiveBlock } from '$lib/record/page-live.ts';
  import AgentMark from '$lib/ui/AgentMark.svelte';
  import Face from '$lib/ui/Face.svelte';
  import IdentityMark from '$lib/ui/IdentityMark.svelte';
  import Mark from '$lib/ui/Mark.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import Fold from './Fold.svelte';
  import {
    FAILED_RUN,
    SHEET_FORMS,
    SHEET_KINDS,
    SHEET_NOW,
    chartSpecimens,
    partSpecimens,
    planSpecimens,
    sheetKey,
    specimenSegments,
    type SheetKind,
    type Specimen,
  } from 'braindog-render';

  let { shell }: { shell: Shell } = $props();

  /* THE CHART KINDS A RECORD MAY HOLD, in the order the sheet names them: the renderer's own list of its kinds. */
  const KINDS = SHEET_KINDS;
  type ChartKind = SheetKind;

  const FAILED = ['red', 'plain'] as const;
  /* THE DEFAULT OF THE CALL ("Needs him"): a failed run is red. */
  const FAILED_DEFAULT = 'red';

  /** How many pages are read looking for the record's own charts, at most. */
  const PAGES_MOST = 24;

  const words = {
    yours: 'From your BrainDog',
    reading: 'Reading your BrainDog.',
    from: (page: string) => `On ${page}`,
    none: (kinds: string) => `Nothing in your BrainDog draws ${kinds}. The specimen below stands in.`,
    nothing: 'Your BrainDog draws no chart yet. Every specimen is below.',
    sizes: 'Every size',
    sizesLine: 'Each chart with no points, one, two, three and thirty. Fresh ends today. Stale ends days or months ago.',
    plan: 'The plan',
    parts: 'Parts of a whole',
    kind: {
      lines: 'a line chart',
      series: 'bars by month',
      sparkline: 'a small line',
      heat: 'busy days',
      forecast: 'a forecast',
      roadmap: 'a plan',
      progress: 'progress',
      ring: 'a ring',
      split: 'a split',
      bridge: 'a bridge',
      bar: 'bars',
      gauge: 'a gauge',
    },
    form: { lines: 'Line chart', series: 'Bars by month', 'series net': 'Money in and out', sparkline: 'Small line', heat: 'Busy days', forecast: 'Forecast' },
    faces: 'Faces and marks',
    person: 'A person',
    you: 'You',
    project: 'A project',
    retired: 'A retired project',
    specimen: 'specimen',
    specimenPerson: 'Amara Okafor',
    specimenProject: 'Autumn catalogue',
    specimenRetired: 'Spring catalogue',
    makers: 'Each maker’s mark',
    app: 'BrainDog',
    failed: 'A failed run',
    failedWay: { red: 'In red, with its mark', plain: 'In words alone, red kept for late and over' },
    byDefault: 'Default',
    other: 'The other way',
  } as const;

  /* ── the record's own ───────────────────────────────────────────────────── */
  type Own = { block: LiveBlock; now: number; page: string };
  let own = $state.raw(new Map<ChartKind, Own>());
  let projects = $state.raw<{ name: string; mark: string; hue: number }[]>([]);
  let read = $state(false);

  const isChart = (kind: string): kind is ChartKind => (KINDS as readonly string[]).includes(kind);

  onMount(() => {
    let gone = false;
    void (async () => {
      const found = new Map<ChartKind, Own>();
      const marks = new Map<string, { name: string; mark: string; hue: number }>();
      try {
        const { pageReader } = await import('$lib/record/page-live.ts');
        const reader = pageReader(apiBase());
        for (const slug of shell.pages.slice(0, PAGES_MOST)) {
          if (gone || found.size === KINDS.length) break;
          /* A PAGE THAT WILL NOT READ IS PASSED OVER: the sheet draws what it can and the specimens cover the rest. */
          const got = await reader.read(slug).catch(() => null);
          if (got?.from !== 'live') continue;
          for (const block of got.page.blocks) {
            if (isChart(block.kind) && !found.has(block.kind) && !block.cannot) found.set(block.kind, { block, now: got.now, page: got.page.page.title ?? '' });
            for (const [name, m] of block.scopeCells?.marks ?? []) if (m.mark !== null && m.hue !== null && !marks.has(name)) marks.set(name, { name, mark: m.mark, hue: m.hue });
          }
        }
      } catch {
        /* The record could not be read at all: the specimens are the sheet. */
      }
      if (gone) return;
      own = found;
      projects = [...marks.values()].slice(0, 3);
      read = true;
    })();
    return () => (gone = true);
  });

  const missing = $derived(KINDS.filter((k) => !own.has(k)).map((k) => words.kind[k]));
  const listed = (items: readonly string[]): string => (items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} or ${items.at(-1)}`);

  /* ── the specimens ──────────────────────────────────────────────────────── */
  const charts = chartSpecimens();
  const byForm = SHEET_FORMS.map((form) => ({ form, specimens: charts.filter((s) => sheetKey(s.kind, s.form) === form) }));
  const plans = planSpecimens();
  const parts = partSpecimens();
  /* ON THE SPECIMENS' OWN DAY, so "today", "late" and a chart's last day are the same in every photograph. */
  const opts = { now: SHEET_NOW };

  /* ── faces ──────────────────────────────────────────────────────────────── */
  const me = $derived((shell.names[shell.me.person] ?? '').trim());
  const makers = Object.keys(AGENT_MARKS) as MarkedAgent[];
  const makerName = (kind: MarkedAgent): string => kind.charAt(0).toUpperCase() + kind.slice(1);
</script>

{#snippet drawn(s: Specimen)}
  <figure class="spec" data-sheet="chart {s.key}">
    <figcaption class="said">{s.label}</figcaption>
    {#each specimenSegments(s) as segment}
      {#if segment.type === 'block'}<Block block={segment} {opts} />{:else if segment.type === 'degraded'}<Degraded {segment} />{/if}
    {/each}
  </figure>
{/snippet}

<div class="sheet" data-sheet-name="charts">

  <Fold id="sheet-yours" name={words.yours}>
    {#if !read}
      <p class="band-line" role="status">{words.reading}</p>
    {:else}
      {#if own.size === 0}
        <p class="band-line">{words.nothing}</p>
      {:else if missing.length > 0}
        <p class="band-line">{words.none(listed(missing))}</p>
      {/if}
      <div class="tiles">
        {#each KINDS as kind, i (kind)}
          {@const mine = own.get(kind)}
          {#if mine}
            <Tile data-sheet="own {kind}">
              <p class="said">{words.from(mine.page)}</p>
              <BlockSlot block={mine.block} {i} ids="sheet-own-" writes={null} param={undefined} now={mine.now} level={3} />
            </Tile>
          {/if}
        {/each}
      </div>
    {/if}
  </Fold>

  <Fold id="sheet-sizes" name={words.sizes}>
    <p class="band-line">{words.sizesLine}</p>
    <div class="tiles">
      {#each byForm as { form, specimens } (form)}
        <Tile title={words.form[form]} class="sheet-wide">
          <div class="specs">
            {#each specimens as s (s.key)}{@render drawn(s)}{/each}
          </div>
        </Tile>
      {/each}
    </div>
  </Fold>

  <Fold id="sheet-plan" name={words.plan}>
    <div class="tiles">
      {#each plans as s, n (s.key)}
        <Tile class={n === 0 ? 'sheet-wide' : undefined}>{@render drawn(s)}</Tile>
      {/each}
    </div>
  </Fold>

  <Fold id="sheet-parts" name={words.parts}>
    <div class="tiles">
      {#each parts as s (s.key)}
        <Tile>{@render drawn(s)}</Tile>
      {/each}
    </div>
  </Fold>

  <Fold id="sheet-faces" name={words.faces}>
    <div class="tiles">
      <Tile title={words.person}>
        <ul class="faces">
          {#if me}<li class="face"><Face name={me} you kind="person" /><span class="face-name">{me}</span><span class="how">{words.you}</span></li>{/if}
          <li class="face"><Face name={words.specimenPerson} kind="person" /><span class="face-name">{words.specimenPerson}</span><span class="how">{words.specimen}</span></li>
        </ul>
      </Tile>
      <Tile title={words.project}>
        <ul class="faces">
          {#each projects as p (p.name)}
            <li class="face"><IdentityMark identity={{ ...p, retired: false }} size="md" /></li>
          {/each}
          <li class="face">
            <Face name={words.specimenProject} of="project" /><span class="face-name">{words.specimenProject}</span><span class="how">{words.specimen}</span>
          </li>
        </ul>
      </Tile>
      <Tile title={words.retired}>
        <ul class="faces">
          <!-- ALWAYS A SPECIMEN: nothing a page answers says a project is retired, so the sheet has none of the record's to draw. -->
          <li class="face">
            <IdentityMark identity={{ name: words.specimenRetired, mark: 'S', hue: 210, retired: true }} size="md" /><span class="how">{words.specimen}</span>
          </li>
        </ul>
      </Tile>
      <Tile title={words.makers} class="sheet-wide">
        <ul class="faces faces-across">
          {#each makers as kind (kind)}
            <li class="face"><AgentMark {kind} size="l" /><span class="face-name">{makerName(kind)}</span><span class="how">{AGENT_MARKS[kind].maker}</span></li>
          {/each}
          <li class="face"><Mark height={22} /><span class="face-name">{words.app}</span></li>
        </ul>
      </Tile>
    </div>
  </Fold>

  <Fold id="sheet-failed" name={words.failed}>
    <div class="tiles">
      {#each FAILED as failed (failed)}
        <Tile data-sheet="call failed {failed}">
          <p class="said">
            {words.failedWay[failed]}
            <span class="how">{failed === FAILED_DEFAULT ? words.byDefault : words.other}</span>
          </p>
          {@render drawn(FAILED_RUN[failed])}
        </Tile>
      {/each}
    </div>
  </Fold>
</div>

<style>
  /* BANDS OF TILES, the whole width: a band's name on the board, and under it as many tiles as fit, one on a phone. */
  /* THE BANDS ARE SECTIONS THAT OPEN (L50), one over the other, each closed when the sheet is drawn. */
  .sheet {
    display: grid;
    min-inline-size: 0;
  }

  .band-line {
    margin: 0 0 var(--sp-4);
    color: var(--ink-2);
    font-size: var(--fs-body);
  }

  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
    gap: var(--tile-gap);
  }

  .tiles :global(.sheet-wide) {
    grid-column: 1 / -1;
  }

  /* THE SIZES OF ONE FORM, side by side so a chart of two points is read beside the one of thirty. */
  .specs {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
    gap: var(--sp-6) var(--sp-5);
  }

  .spec {
    margin: 0;
    min-inline-size: 0;
  }

  .said {
    display: flex;
    flex-wrap: wrap;
    gap: 0 var(--sp-2);
    margin: 0 0 var(--sp-2);
    color: var(--ink-2);
    font-size: var(--fs-body);
  }

  .how {
    color: var(--ink-3);
    font-size: var(--fs-body);
  }

  .faces {
    display: grid;
    gap: var(--sp-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .faces-across {
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  }

  .face {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: var(--row-h);
  }

  .face-name {
    font-size: var(--fs-body);
    font-weight: 500;
  }
</style>
