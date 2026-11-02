<!--
  Slash's answer to one of the made-up record's questions, the prototype's answers (site.html ~:1154-1226), drawn
  from `demo/maya.ts` and typing nothing of its own:

    ask    the lead sentence with its figures, then the bills as bars or the project's spark, then what Slash read
           and its buttons;
    find   how many matched and "no questions spent", then each hit with the search word marked;
    make   the draft (a page or list with its table, or a rule in one sentence), then "From Slash · reads ..." with
           its yes button and Not now. Yes says "Added to <where>." with Undo; Not now says "Nothing changed." with
           Back. Both go back to the draft, and a new question starts fresh.

  IT DRAWS ON ITS CALLER'S TILE (the redo of 2 November): its parts stacked, a hairline between them, nothing filled
  but the bars' track, and no answer in red: a suggested answer is ink, because the page's one red is its own main
  action. Server-side it renders whole, so a reader with scripting off has the finished answer.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import Glyph from './Glyph.svelte';
  import { spark } from '../desk/draw.ts';
  import { ASKS, FINDS, MAKES, PROJECTS, slotVars, usd, type Parts, type ProjectId } from '../demo/maya.ts';
  import { slashDrawing as w, type Mode } from '../copy/slash.ts';

  let { mode, at }: { mode: Mode; at: number } = $props();

  const ask = $derived(mode === 'ask' ? ASKS[at] : undefined);
  const find = $derived(mode === 'find' ? FINDS[at] : undefined);
  const make = $derived(mode === 'make' ? MAKES[at] : undefined);

  /* THE BILLS ON ONE SCALE, the largest full, the smallest still a sliver (the prototype's 4%). */
  const most = $derived(Math.max(1, ...(ask?.bars ?? []).map((b) => b.cents)));
  const width = (cents: number): number => Math.max(4, Math.round((cents / most) * 100));

  /* THE SEARCH WORD MARKED in a hit's title, at its first place and in the title's own case. */
  const marked = (title: string, q: string): [string, string, string] => {
    const i = title.toLowerCase().indexOf(q.toLowerCase());
    return i < 0 ? [title, '', ''] : [title.slice(0, i), title.slice(i, i + q.length), title.slice(i + q.length)];
  };

  /* A MAKE ANSWERED FOR THIS QUESTION ONLY: picking another one, or another mode, draws its draft fresh. */
  const key = $derived(`${mode}:${at}`);
  let said = $state<{ key: string; yes: boolean } | null>(null);
  const answered = $derived(said !== null && said.key === key ? said : null);
  let box: HTMLDivElement | undefined = $state();

  async function answer(yes: boolean | null) {
    said = yes === null ? null : { key, yes };
    await tick();
    box?.querySelector('button')?.focus();
  }
</script>

{#snippet lead(parts: Parts)}
  {#each parts as p, i (i)}{#if typeof p === 'string'}{p}{:else}<span class="fig" class:late={p.late}>{p.text}</span>{/if}{/each}
{/snippet}

{#snippet face(id: ProjectId)}
  <span class="pface" style={slotVars(PROJECTS[id].slot)}><Glyph name={PROJECTS[id].icon} size={16} /></span>
{/snippet}

{#if ask}
  <div class="t">
    {#if ask.project}<div class="who">{@render face(ask.project)}<b>{PROJECTS[ask.project].name}</b></div>{/if}
    <p class="brief">{@render lead(ask.lead)}</p>
  </div>
  {#if ask.bars}
    <div class="t">
      {#each ask.bars as b (b.label)}
        <div class="hbar">
          <span>{b.label}</span>
          <span class="meter" aria-hidden="true"><i style:width="{width(b.cents)}%"></i></span>
          <span class="num">{usd(b.cents)} <span class="when2">{b.when}</span></span>
        </div>
      {/each}
    </div>
  {/if}
  {#if ask.spark}
    {@const line = spark(ask.spark.series, 140, 44)}
    <div class="t spark-t" style={slotVars(ask.project ? PROJECTS[ask.project].slot : 'slate')}>
      <div><div class="sub">{ask.spark.head}</div><div class="big">{ask.spark.big}</div></div>
      <svg class="spark" viewBox="0 0 140 44" aria-hidden="true"><path class="a" d={line.fill} /><path class="l" d={line.line} /></svg>
    </div>
  {/if}
  <div class="t read">
    <span class="sub">{ask.read}</span>
    {#each ask.actions as a (a.label)}<button type="button" class="btn sm {a.tone === 'tint' ? 'ink' : ''}">{a.label}</button>{/each}
  </div>
{:else if find}
  <p class="thd">{w.found(find.count)}<span class="r">{find.aside}</span></p>
  {#each find.hits as h (h.title)}
    {@const [before, hit, after] = marked(h.title, find.q)}
    <div class="hit">
      <span class="agent"><Glyph name={h.icon} size={15} /></span>
      <div class="grow"><b>{before}{#if hit}<mark>{hit}</mark>{/if}{after}</b><span>{h.sub}</span></div>
      <span class="tag">{h.kind}</span>
    </div>
  {/each}
{:else if make}
  {#if make.draft}
    <div class="draft">
      <div class="draft-top">
        {#if make.project}{@render face(make.project)}{/if}
        <div><b>{make.draft.title}</b><span>{make.draft.sub}</span></div>
      </div>
      <!-- The table scrolls sideways on a phone, so the box is a region the keyboard can reach and scroll. -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div class="dtbox" role="region" aria-label={make.draft.title} tabindex="0">
        <table class="dt">
          <thead><tr>{#each make.draft.head as h (h.text)}<th class:n={h.numeric}>{h.text}</th>{/each}</tr></thead>
          <tbody>
            {#each make.draft.cells as cells, r (r)}
              <tr>
                {#each cells as c, k (k)}
                  <td class:n={make.draft.head[k]?.numeric}>{#if typeof c === 'string'}{c}{:else}<span class="late">{c.text}</span>{/if}</td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <div class="draft-foot">{make.draft.foot}</div>
    </div>
  {:else if make.rule}
    <div class="t">
      <p class="thd"><Glyph name="bell" size={15} />{make.rule.head}</p>
      <p class="rule-s">{#each make.rule.parts as p, i (i)}{#if typeof p === 'string'}{p}{:else}<b>{p.text}</b>{/if}{/each}</p>
      <p class="sub rule-sub">{make.rule.sub}</p>
    </div>
  {/if}
  <div class="propose" class:done={answered !== null} bind:this={box} aria-live="polite">
    {#if answered === null}
      <span class="sub">{make.from}</span>
      <button type="button" class="btn ink sm" onclick={() => answer(true)}>{make.yes}</button>
      <button type="button" class="btn sm" onclick={() => answer(false)}>{w.notNow}</button>
    {:else if answered.yes}
      <span class="ok"><Glyph name="check" size={16} /></span>
      <span class="said">{w.added(make.where)}</span>
      <button type="button" class="btn bare sm" onclick={() => answer(null)}>{w.undo}</button>
    {:else}
      <span class="said sub">{w.nothing}</span>
      <button type="button" class="btn bare sm" onclick={() => answer(null)}>{w.back}</button>
    {/if}
  </div>
{/if}

<style>
  /* ONE PART OF THE ANSWER: the parts read top to bottom, a hairline between them. */
  .t {
    min-inline-size: 0;
    padding-block: 12px;
  }

  .t + .t,
  .t + .read,
  .draft + .propose,
  .t + .propose {
    border-block-start: 1px solid var(--rule);
  }

  .t:first-child {
    padding-block-start: 4px;
  }

  .who {
    display: flex;
    align-items: center;
    gap: 9px;
    margin-block-end: 8px;
  }

  .who b {
    font-size: var(--t-site-small);
    font-weight: 600;
  }

  .pface {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: 28px;
    block-size: 28px;
    border-radius: var(--r-ctl);
    background: var(--ph-tint);
    color: var(--ph);
  }

  .brief {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-site-17);
    line-height: 1.5;
    text-wrap: pretty;
  }

  .fig {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .late {
    color: var(--red);
    font-weight: 600;
  }

  .hbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 88px auto;
    align-items: center;
    gap: 12px;
    padding: 6px 0;
    color: var(--ink);
    font-size: var(--t-site-small);
  }

  .meter {
    display: block;
    block-size: 6px;
    overflow: hidden;
    border-radius: var(--r-xs);
    background: var(--chart-track);
  }

  .meter i {
    display: block;
    block-size: 100%;
    border-radius: var(--r-xs);
    background: var(--chart-1);
  }

  .num {
    font-variant-numeric: tabular-nums;
  }

  .when2 {
    color: var(--ink-3);
    font-size: var(--t-site-12);
  }

  .spark-t {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .sub {
    display: block;
    margin: 0;
    color: var(--ink-3);
    font-size: var(--t-site-13);
  }

  .big {
    font: 600 var(--fs-figure) / 1.1 var(--font-display);
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }

  .spark {
    --pf-line: var(--ph);

    flex: none;
    inline-size: 140px;
    block-size: 44px;
    overflow: visible;
  }

  .spark .l {
    fill: none;
    stroke: var(--pf-line);
    stroke-width: 1.75;
    stroke-linejoin: round;
    stroke-linecap: round;
  }

  .spark .a {
    fill: color-mix(in srgb, var(--pf-line) 8%, transparent);
    stroke: none;
  }

  .read {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding-block: 12px 0;
  }

  .read .sub {
    flex: 1;
    min-inline-size: 10em;
  }

  .thd {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 8px;
    color: var(--ink-3);
    font: 500 var(--t-site-13) / 1.2 var(--font-ui);
  }

  .r {
    margin-inline-start: auto;
  }

  .hit {
    display: flex;
    align-items: center;
    gap: 12px;
    min-inline-size: 0;
    padding: 9px 0;
  }

  .hit + .hit {
    border-block-start: 1px solid var(--rule);
  }

  .agent {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: 28px;
    block-size: 28px;
    border-radius: var(--r-ctl);
    background: var(--tile-2);
    color: var(--ink-2);
  }

  .grow {
    flex: 1;
    min-inline-size: 0;
  }

  .grow b {
    display: block;
    overflow: hidden;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .grow span {
    display: block;
    color: var(--ink-3);
    font-size: var(--t-site-13);
  }

  /* THE MATCHED LETTERS in a category tint, never red: red is kept for the start button and for late. */
  mark {
    padding: 0 1px;
    border-radius: 3px;
    background: var(--cat-yellow-tint);
    color: inherit;
  }

  .tag {
    color: var(--ink-3);
    font-size: var(--t-site-12);
    white-space: nowrap;
  }

  .draft {
    min-inline-size: 0;
  }

  .draft-top {
    display: flex;
    align-items: center;
    gap: 10px;
    padding-block: 4px 12px;
  }

  .draft-top b {
    display: block;
    font: 600 var(--fs-body) / 1.3 var(--font-ui);
  }

  .draft-top span {
    display: block;
    color: var(--ink-3);
    font-size: var(--t-site-12);
  }

  .dtbox {
    overflow-x: auto;
  }

  .dtbox:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  .dt {
    inline-size: 100%;
    border-collapse: collapse;
    font-size: var(--t-site-13-5);
  }

  .dt th {
    padding: 6px 12px 6px 0;
    border-block-start: 1px solid var(--rule);
    color: var(--ink-3);
    font-size: var(--t-site-12);
    font-weight: 500;
    text-align: start;
  }

  .dt td {
    padding: 8px 12px 8px 0;
    border-block-start: 1px solid var(--rule);
    white-space: nowrap;
  }

  .dt .n {
    text-align: end;
    font-variant-numeric: tabular-nums;
  }

  .draft-foot {
    padding-block: 10px;
    border-block-start: 1px solid var(--rule);
    color: var(--ink-3);
    font-size: var(--t-site-12-5);
  }

  .rule-s {
    margin: 0;
    font-size: var(--t-site-17);
    line-height: 1.55;
    text-wrap: pretty;
  }

  .rule-s b {
    font-weight: 600;
    border-block-end: 2px solid var(--rule-strong);
  }

  .rule-sub {
    margin-block-start: 10px;
  }

  .propose {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding-block: 12px 0;
    font-size: var(--t-site-13-5);
  }

  .propose .sub {
    flex: 1;
    min-inline-size: 11em;
  }

  .propose .said {
    flex: 1;
  }

  .ok {
    display: inline-flex;
    color: var(--good);
  }

  @media (max-width: 760px) {
    .grow b {
      white-space: normal;
    }

    .tag {
      display: none;
    }

    .hbar {
      grid-template-columns: minmax(0, 1fr) 56px auto;
    }
  }
</style>
