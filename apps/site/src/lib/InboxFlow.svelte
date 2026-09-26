<!--
  Three messages arrive, Slash learns their shape once, and every one is filed: `docs/07` §4, drawn.
-->
<script lang="ts">
  import Icon from './Icon.svelte';

  type Flow = {
    steps: readonly string[];
    arrivals: readonly { from: string; text: string }[];
    pattern: { name: string; fields: readonly (readonly string[])[]; tested: string; writes: string };
    list: string;
    columns: readonly string[];
    rows: readonly (readonly string[])[];
  };

  let { flow }: { flow: Flow } = $props();
</script>

<div class="flow" role="img" aria-label="{flow.steps.join(', then ')}: {flow.pattern.name}, into {flow.list}">
  <div class="stage">
    <p class="step"><span class="n">1</span>{flow.steps[0]}</p>
    <ul class="msgs">
      {#each flow.arrivals as a, i (a.text)}
        <li class="msg" style="--i: {i}">
          <span class="from"><Icon name="mail" size="s" />{a.from}</span>
          <span class="text">{a.text}</span>
        </li>
      {/each}
    </ul>
  </div>

  <span class="arrow" aria-hidden="true"><Icon name="arrow" /></span>

  <div class="stage">
    <p class="step"><span class="n">2</span>{flow.steps[1]}</p>
    <div class="pattern">
      <p class="p-name"><span class="slash" aria-hidden="true">/</span>{flow.pattern.name}</p>
      <dl>
        {#each flow.pattern.fields as [k, v] (k)}
          <div><dt>{k}</dt><dd>{v}</dd></div>
        {/each}
      </dl>
      <p class="tested"><Icon name="check" size="s" />{flow.pattern.tested}</p>
      <p class="writes">{flow.pattern.writes}</p>
    </div>
  </div>

  <span class="arrow" aria-hidden="true"><Icon name="arrow" /></span>

  <div class="stage">
    <p class="step"><span class="n">3</span>{flow.steps[2]}</p>
    <div class="table">
      <p class="t-name">{flow.list}</p>
      <div class="t-row t-head">
        {#each flow.columns as c (c)}<span>{c}</span>{/each}
      </div>
      {#each flow.rows as r (r[0])}
        <div class="t-row">
          <span class="t-what">{r[0]}</span><span class="num">{r[1]}</span><span class="t-dim">{r[2]}</span>
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .flow {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: start;
    gap: var(--sp-4);
  }

  .stage {
    display: grid;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .step {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 600;
  }

  .n {
    display: grid;
    place-items: center;
    inline-size: 20px;
    block-size: 20px;
    border: 1px solid var(--line);
    border-radius: 50%;
    font-size: 11px;
  }

  .arrow {
    display: grid;
    place-items: center;
    align-self: center;
    color: var(--dim);
  }

  .msgs {
    display: grid;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .msg {
    display: grid;
    gap: 4px;
    padding: 10px 12px;
    background: var(--s3);
    border: 1px solid var(--line);
    border-radius: 12px 12px 12px 4px;
    box-shadow: var(--e1);
  }

  @media (prefers-color-scheme: dark) {
    .msg,
    .pattern,
    .table {
      background: var(--s1);
    }
  }

  .from {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--dim);
    font-size: 11.5px;
    font-weight: 600;
  }

  .text {
    color: var(--ink);
    font-size: var(--t-sm);
    line-height: 1.4;
  }

  .pattern,
  .table {
    padding: var(--sp-4);
    background: var(--s3);
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: var(--e2);
  }

  .pattern {
    border-color: color-mix(in srgb, var(--accent) 45%, var(--line));
  }

  .p-name,
  .t-name {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0 0 var(--sp-3);
    color: var(--ink);
    font-weight: 600;
  }

  .slash {
    display: grid;
    place-items: center;
    inline-size: 20px;
    block-size: 20px;
    background: var(--accent);
    border-radius: 6px;
    color: var(--accent-ink);
    font-family: var(--font-display);
    font-size: 12px;
  }

  dl {
    display: grid;
    gap: 6px;
    margin: 0;
  }

  dl div {
    display: grid;
    grid-template-columns: 4.5rem minmax(0, 1fr);
    gap: var(--sp-2);
    font-size: var(--t-sm);
  }

  dt {
    color: var(--dim);
  }

  dd {
    margin: 0;
    color: var(--ink);
  }

  .tested {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: var(--sp-3) 0 0;
    color: var(--earn);
    font-size: var(--t-sm);
    font-weight: 600;
  }

  .writes {
    margin: 4px 0 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .t-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto 3.5rem;
    gap: var(--sp-3);
    padding-block: 8px;
    font-size: var(--t-sm);
  }

  .t-row + .t-row {
    border-block-start: 1px solid var(--line);
  }

  .t-head {
    padding-block-start: 0;
    color: var(--dim);
    font-size: 11.5px;
  }

  .t-what {
    overflow: hidden;
    color: var(--ink);
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .t-dim {
    color: var(--dim);
    text-align: end;
  }

  @media (width < 1000px) {
    .flow {
      grid-template-columns: minmax(0, 1fr);
    }

    .arrow {
      transform: rotate(90deg);
    }
  }
</style>
