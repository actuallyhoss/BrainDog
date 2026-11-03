<!--
  Slash's answer to one of the made-up record's questions, the prototype's answers (site.html ~:1154-1226), drawn
  from `demo/maya.ts` and typing nothing of its own:

    ask    the lead sentence with its figures, then the bills as bars or the project's spark, then what Slash read
           and its buttons;
    find   how many matched and "no questions spent", then each hit with the search word marked;
    make   the draft (a page or list with its table, or a rule in one sentence), then "From Slash · reads ..." with
           its yes button and Not now. Yes says "Added to <where>." with Undo; Not now says "Nothing changed." with
           Back. Both go back to the draft, and a new question starts fresh.

  It draws the tiles side by side in its caller's grid: the scene's drop, the desk's bar and the page's Mini each
  give the gap. Server-side it renders whole, so a reader with scripting off has the finished answer.
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
    {#each ask.actions as a (a.label)}<button type="button" class="btn sm {a.tone === 'tint' ? 'ink' : 'quiet'}">{a.label}</button>{/each}
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
      <span class="acts">
        <button type="button" class="btn ink sm" onclick={() => answer(true)}>{make.yes}</button>
        <button type="button" class="btn quiet sm" onclick={() => answer(false)}>{w.notNow}</button>
      </span>
    {:else if answered.yes}
      <span class="ok"><Glyph name="check" size={16} /></span>
      <span class="said">{w.added(make.where)}</span>
      <button type="button" class="undo" onclick={() => answer(null)}>{w.undo}</button>
    {:else}
      <span class="said sub">{w.nothing}</span>
      <button type="button" class="undo" onclick={() => answer(null)}>{w.back}</button>
    {/if}
  </div>
{/if}

<style>
  .t { background: var(--tile); border-radius: 16px; padding: 16px; min-width: 0; border: 1px solid var(--card-edge); box-shadow: var(--shadow-card); }
  .who { display: flex; align-items: center; gap: 9px; margin-block-end: 8px; }
  .who b { font-weight: 600; font-size: var(--t-site-small); }
  .pface {
    width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; flex: none;
    background: var(--ph-tint); color: var(--ph);
  }
  .brief { font-size: var(--t-site-18); line-height: 1.5; margin: 0; text-wrap: pretty; }
  .fig { font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .late { color: var(--red); font-weight: 600; }
  .hbar { display: grid; grid-template-columns: minmax(0, 1fr) 90px auto; gap: 12px; align-items: center; padding: 7px 0; font-size: var(--t-site-small); }
  .meter { display: block; height: 6px; border-radius: 4px; background: var(--bar); overflow: hidden; }
  .meter i { display: block; height: 100%; border-radius: 4px; background: var(--ink2); }
  .num { font-variant-numeric: tabular-nums; }
  .when2 { color: var(--muted); font-size: var(--t-site-12); }
  .spark-t { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .sub { display: block; color: var(--muted); font-size: var(--t-site-12-5); margin: 0; }
  .big { font: 600 27px/1.05 var(--head); letter-spacing: -0.021em; font-variant-numeric: tabular-nums; }
  .spark { width: 140px; height: 44px; overflow: visible; flex: none; }
  .spark { --pf-line: var(--ph); }
  .spark .l { fill: none; stroke: var(--pf-line); stroke-width: 1.8; stroke-linejoin: round; stroke-linecap: round; }
  .spark .a { fill: color-mix(in srgb, var(--pf-line) 12%, transparent); stroke: none; }
  .read { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 12px 14px; }
  .read .sub { flex: 1; min-width: 10em; }
  .thd { display: flex; align-items: center; gap: 8px; margin: 2px 4px 0; font: 500 12.5px/1.2 var(--ui); color: var(--muted); }
  .t .thd { margin: 0 0 10px; }
  .r { margin-inline-start: auto; }
  .hit { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 14px; background: var(--tile); min-width: 0; border: 1px solid var(--card-edge); box-shadow: var(--shadow-card); }
  .agent { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; flex: none; background: var(--soft); color: var(--ink); box-shadow: inset 0 0 0 1px var(--rule); }
  .grow { flex: 1; min-width: 0; }
  .grow b { font-weight: 500; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .grow span { display: block; color: var(--muted); font-size: var(--t-site-12-5); }
  mark { background: var(--red-tint); color: inherit; border-radius: 3px; padding: 0 1px; }
  .tag { font-size: var(--t-site-11-5); color: var(--muted); white-space: nowrap; }
  .draft { background: var(--tile); border-radius: 16px; overflow: hidden; min-width: 0; border: 1px solid var(--card-edge); box-shadow: var(--shadow-card); }
  .draft-top { display: flex; align-items: center; gap: 10px; padding: 14px 16px; }
  .draft-top b { display: block; font: 600 16px/1.2 var(--head); letter-spacing: -0.02em; }
  .draft-top span { display: block; color: var(--muted); font-size: var(--t-site-12); }
  .dtbox { overflow-x: auto; }
  .dtbox:focus-visible { outline: 2px solid var(--ink); outline-offset: -2px; }
  .dt { width: 100%; border-collapse: collapse; font-size: var(--t-site-13-5); }
  .dt th { text-align: start; font-weight: 500; color: var(--muted); font-size: var(--t-site-12); padding: 6px 16px; }
  .dt td { padding: 8px 16px; white-space: nowrap; }
  .dt thead th { background: linear-gradient(var(--sep), var(--sep)) no-repeat center bottom / calc(100% - 24px) 1px; }
  .dt .n { text-align: end; font-variant-numeric: tabular-nums; }
  .draft-foot { padding: 10px 16px; color: var(--muted); font-size: var(--t-site-12-5); border-block-start: 1px solid var(--sep); }
  .rule-s { margin: 0; font-size: var(--t-site-18); line-height: 1.55; text-wrap: pretty; }
  .rule-s b { font-weight: 600; border-block-end: 2px solid var(--faint); }
  .rule-sub { margin-block-start: 10px; }
  .propose { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 10px 12px; border-radius: 16px; background: var(--tile); border: 1px solid var(--card-edge); box-shadow: var(--shadow-card); font-size: var(--t-site-13-5); }
  .propose .sub { flex: 1; min-width: 11em; }
  /* THE TWO ANSWERS STAY TOGETHER: in a narrow drawing they go under the line as a pair, never one on each row. */
  .propose .acts { display: flex; gap: 8px; margin-inline-start: auto; }
  .propose .said { flex: 1; }
  .ok { display: inline-flex; color: var(--good); }
  .undo { all: unset; cursor: pointer; font-size: var(--t-site-13); font-weight: 500; color: var(--red); }
  .undo:hover { text-decoration: underline; }
  .undo:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; border-radius: 4px; }
  @media (pointer: coarse) {
    .undo { min-height: 44px; display: inline-flex; align-items: center; padding: 0 6px; }
  }
  @media (max-width: 760px) {
    .grow b { white-space: normal; }
    .tag { display: none; }
    .hbar { grid-template-columns: minmax(0, 1fr) 56px auto; }
    .hbar:nth-child(n + 4) { display: none; }
    /* The table fits a phone without scrolling: 10px between columns, the box's own 16 at its edges. */
    .dt th, .dt td { padding-inline: 5px; }
    .dt :is(th, td):first-child { padding-inline-start: 16px; }
    .dt :is(th, td):last-child { padding-inline-end: 16px; }
  }
</style>
