<!--
  THE WAY IN: six steps across the top of Admin, each its total, what it kept of the step before, its place in one funnel
  shape and its own eight weeks as small bars. On a phone each step is a row, with the same shape as a tint behind it.

  IT DRAWS BEFORE ITS ANSWER. The door asks every record, so it can be the slowest read on the page: the steps and the
  empty shape are there from the first frame at the height they will keep, and nothing under them moves when it lands.

  COUNTS AND NOTHING ELSE, as the door answers. The week table stays one press away, for the numbers the bars only hint at.
-->
<script lang="ts">
  import { STEPS, stepsOf, type Funnel, type Step } from '$lib/admin/ops.ts';

  let { funnel, weeksOpen = false }: { funnel: Funnel | null; weeksOpen?: boolean } = $props();

  const words = {
    label: 'Each week of the way in',
    weekOf: 'Week of',
    thisWeek: 'This week',
    noVisits: 'Nothing has come through yet. This fills in as people arrive.',
    short: (n: string) => `Only the first ${n} records were asked, so the last two steps are short.`,
    missed: (n: number) => (n === 1 ? '1 record could not be asked.' : `${n.toLocaleString('en-GB')} records could not be asked.`),
  } as const;

  const n = (v: number): string => v.toLocaleString('en-GB');
  const steps = $derived(stepsOf(funnel));
  const weeks = $derived(funnel?.weeks ?? []);
  const blank = $derived(steps.every((s) => s.total === 0));
  /** Visits do not lead yet, so the steps stand apart rather than as one shape (`stepsOf`). */
  const apart = $derived(!blank && (steps[0]?.share ?? 1) < 1);

  const weekSaid = (name: string, last: boolean): string => {
    if (last) return words.thisWeek;
    const at = new Date(`${name}T00:00:00Z`);
    return Number.isNaN(at.getTime()) ? name : at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  };

  /** The step's slice of the one shape: flat for most of its column, then narrowing to the next step's height. */
  function clipOf(s: Step): string {
    const edge = (share: number): [string, string] => [`${String((1 - share) * 50)}%`, `${String(100 - (1 - share) * 50)}%`];
    const [t, b] = edge(s.share);
    const [tn, bn] = edge(s.next);
    return `polygon(0 ${t}, 45% ${t}, 100% ${tn}, 100% ${bn}, 45% ${b}, 0 ${b})`;
  }

  const sparkSaid = (s: Step): string => `${s.label} by week: ${s.weeks.map((w) => n(w.n)).join(', ')}`;

  const notes = $derived.by(() => {
    if (funnel === null) return [];
    const out: string[] = [];
    if (blank) out.push(words.noVisits);
    if (funnel.more === true) out.push(words.short(n(funnel.asked ?? 0)));
    if ((funnel.missed ?? 0) > 0) out.push(words.missed(funnel.missed ?? 0));
    return out;
  });
</script>

<ol class="way" data-blank={blank ? '' : undefined} data-apart={apart ? '' : undefined} aria-busy={funnel === null}>
  {#each steps as s (s.key)}
    <li class="step" style:--share={s.share} style:--clip={clipOf(s)}>
      <span class="name">{s.label}</span>
      <span class="figure num" data-waiting={funnel === null ? '' : undefined}>{funnel === null ? '' : n(s.total)}</span>
      <span class="rate num">{#if s.rate}{s.rate}<span class="of">{` of ${s.of ?? ''}`}</span>{/if}</span>
      <span class="band" aria-hidden="true"></span>
      {#if s.weeks.length > 0}
        <span class="spark" role="img" aria-label={sparkSaid(s)}>
          {#each s.weeks as w, i (w.week)}
            <span class="week" title={`${weekSaid(w.week, i === s.weeks.length - 1)}: ${n(w.n)}`}><i style:block-size={`${s.peak > 0 ? Math.max(8, (w.n / s.peak) * 100) : 8}%`} data-none={w.n === 0 ? '' : undefined}></i></span>
          {/each}
        </span>
      {:else}
        <span class="spark" aria-hidden="true">{#each { length: 8 } as _, i (i)}<span class="week"><i data-none="" style:block-size="8%"></i></span>{/each}</span>
      {/if}
    </li>
  {/each}
</ol>

{#each notes as line, i (i)}<p class="note">{line}</p>{/each}

{#if weeksOpen && weeks.length > 0}
  <div class="scroll" role="region" aria-label={words.label} tabindex="-1">
    <table class="weeks num">
      <thead>
        <tr><th scope="col">{words.weekOf}</th>{#each STEPS as s (s.key)}<th scope="col">{s.label}</th>{/each}</tr>
      </thead>
      <tbody>
        {#each weeks as w, i (w.week)}
          <tr>
            <th scope="row">{weekSaid(w.week, i === weeks.length - 1)}</th>
            {#each STEPS as s (s.key)}<td class:zero={!w[s.key]}>{n(w[s.key] ?? 0)}</td>{/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<style>
  .way {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .step {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }

  .name {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
    line-height: var(--lead-meta);
  }

  .figure {
    min-block-size: var(--lead-figure, 26px);
    margin-block-start: 2px;
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--fs-figure);
    font-weight: 600;
    line-height: var(--lead-figure, 26px);
    letter-spacing: var(--track-figure, -0.02em);
  }

  /* A FIGURE ON ITS WAY: a soft bar where it will stand, and the same height, so nothing moves when it lands. */
  .figure[data-waiting]::before {
    content: '';
    display: block;
    inline-size: 56px;
    block-size: 18px;
    margin-block-start: 4px;
    background: var(--tile-2);
    border-radius: var(--r-xs);
  }

  .rate {
    min-block-size: var(--lead-meta);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ONE SHAPE ACROSS THE SIX: the columns have no gap, so each step's slice meets the next. */
  .band {
    block-size: 44px;
    margin-block: var(--sp-3);
    background: color-mix(in oklab, var(--ink) 18%, var(--tile));
    clip-path: var(--clip);
  }

  /* OPAQUE AND A PIXEL OVER, so two slices meet with no seam. */
  .step:not(:last-child) .band {
    margin-inline-end: -1px;
  }

  .way[data-apart] .band {
    margin-inline-end: var(--sp-5);
  }

  .way[data-blank] .band,
  .way[aria-busy='true'] .band {
    background: var(--tile-2);
  }

  .spark {
    display: flex;
    gap: 2px;
    block-size: 24px;
    margin-inline-end: var(--sp-5);
  }

  .week {
    display: flex;
    flex: 1 1 0;
    align-items: flex-end;
    min-inline-size: 0;
  }

  .week i {
    display: block;
    inline-size: 100%;
    background: var(--ink-3);
    border-radius: 2px 2px 0 0;
  }

  .week i[data-none] {
    background: var(--tile-2);
  }

  /* THIS WEEK, STILL RUNNING, in the stronger ink. */
  .week:last-child i:not([data-none]) {
    background: var(--ink-2);
  }

  .note {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .scroll {
    overflow-x: auto;
    outline: none;
  }

  .weeks {
    border-collapse: collapse;
    inline-size: 100%;
    min-inline-size: 560px;
    font-size: var(--fs-meta);
  }

  .weeks th,
  .weeks td {
    padding: var(--sp-2) 0 var(--sp-2) var(--sp-3);
    font-weight: 400;
    text-align: end;
    white-space: nowrap;
  }

  .weeks th:first-child {
    padding-inline-start: 0;
    text-align: start;
  }

  .weeks thead th {
    color: var(--ink-3);
  }

  .weeks tbody tr {
    border-block-start: 1px solid var(--rule);
  }

  .weeks tbody th {
    color: var(--ink-2);
  }

  .weeks td {
    color: var(--ink);
  }

  .weeks td.zero {
    color: var(--ink-3);
  }

  /* A PHONE: each step a row, the shape a tint behind it, its bars and its figure at the end. */
  @container (inline-size < 640px) {
    .way {
      grid-template-columns: minmax(0, 1fr);
      row-gap: 2px;
    }

    .step {
      position: relative;
      display: grid;
      grid-template-columns: 92px minmax(0, 1fr) 56px 56px;
      align-items: center;
      column-gap: var(--sp-2);
      min-block-size: 44px;
      padding-block-end: var(--sp-1);
    }

    .name,
    .rate,
    .spark,
    .figure {
      position: relative;
      grid-row: 1;
    }

    .name {
      grid-column: 1;
      color: var(--ink);
      font-size: var(--fs-body);
    }

    .rate {
      grid-column: 2;
    }

    .of {
      display: none;
    }

    .spark {
      grid-column: 3;
      block-size: 20px;
      margin: 0;
      gap: 1px;
    }

    .figure {
      grid-column: 4;
      margin: 0;
      font-size: var(--fs-body);
      line-height: var(--lead-ui);
      letter-spacing: 0;
      min-block-size: 0;
      text-align: end;
    }

    .figure[data-waiting]::before {
      inline-size: 32px;
      block-size: 14px;
      margin: 0 0 0 auto;
    }

    /* THE SAME SHAPE, AS A THIN BAR UNDER EACH ROW: behind the words it read as a highlight on the name. */
    .step:not(:last-child) .band,
    .way[data-apart] .band,
    .band {
      position: absolute;
      inset-block-end: 2px;
      inset-inline-start: 0;
      inline-size: calc(var(--share) * 100%);
      block-size: 4px;
      margin: 0;
      border-radius: 2px;
      clip-path: none;
    }
  }
</style>
