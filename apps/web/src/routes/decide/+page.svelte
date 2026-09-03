<!--
  Every open question, ranked by the COST OF BEING WRONG — never by age.

  Ranking by age is what turns a decision queue into a backlog: the oldest question is usually the
  one nobody has needed to answer. Ranking by what deciding late costs puts the expensive one first
  and makes the order arguable, which is the point (19 §2).
-->
<script lang="ts">
  import { relative } from 'braindog-render';
  import { copy } from '$lib/copy.ts';
  import { DECIDED, NOW, metric } from '$lib/record/api.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Section from '$lib/ui/Section.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Icon from '$lib/ui/Icon.svelte';

  let { data } = $props();

  const open = $derived([...data.questions].sort((a, b) => a.rank - b.rank));
  const target = metric('open-questions');
</script>

<PageHead
  kicker={copy.rankedBy}
  title={copy.decide}
  count={open.length}
  subtitle="An agent lays out the options and never chooses. You choose, and it becomes a numbered row with a reason attached to it."
/>

<div class="page">
  {#if open.length === 0}
    <Empty kind="cleared" title={copy.noQuestions} body="{copy.lastDecided} {relative(DECIDED[0]?.decided?.at.slice(0, 10) ?? '', NOW)}." />
  {:else}
    <Section title={copy.openQuestions} count={open.length}>
      {#snippet aside()}
        <span class="target">{target.note}</span>
      {/snippet}

      <ol class="queue">
        {#each open as q, i}
          <li>
            <a class="q" href="/decide/{q.id}">
              <span class="q-rank num">{i + 1}</span>
              <span class="q-body">
                <span class="q-head">
                  <span class="q-id">{q.id}</span>
                  {#if q.entity}<span class="q-entity">{q.entity}</span>{/if}
                  <span class="q-age">opened {relative(q.opened.slice(0, 10), NOW)}</span>
                </span>
                <span class="q-title">{q.title}</span>
                <span class="q-cost"><span class="q-cost-label">{copy.costOfDelay}</span>{q.cost}</span>
                <span class="q-options">
                  {#each q.options as o}<span class="q-option">{o.title}</span>{/each}
                </span>
              </span>
              <Icon name="chevron" size="m" />
            </a>
          </li>
        {/each}
      </ol>
    </Section>
  {/if}

  {#if DECIDED.length}
    <Section title="Decided" count={DECIDED.length}>
      <ul class="ledger">
        {#each DECIDED as q}
          <li>
            <a class="line" href="/decide/{q.id}">
              <span class="seq">{q.id}</span>
              <span class="line-main">
                <span class="line-title">{q.title}</span>
                <span class="line-detail">{q.decided?.reason}</span>
              </span>
              <span class="line-when">{relative(q.decided?.at.slice(0, 10) ?? '', NOW)}</span>
            </a>
          </li>
        {/each}
      </ul>
    </Section>
  {/if}
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    padding: var(--sp-4) var(--sp-5) var(--sp-7);
    max-inline-size: 980px;
  }

  .target {
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .queue {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .q {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: var(--sp-4);
    align-items: start;
    padding: var(--sp-4);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    box-shadow: var(--raise);
    color: var(--ink);
    text-decoration: none;
    transition: border-color var(--d-state) var(--ease-out);
  }

  .q:hover {
    border-color: var(--edge);
  }

  /* The rank is the argument, so it is drawn like one: big, quiet, and first. */
  .q-rank {
    inline-size: 2ch;
    color: var(--dim);
    font-size: var(--t-lg);
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    text-align: end;
  }

  .q-body {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    min-inline-size: 0;
  }

  .q-head {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .q-id {
    color: var(--ink2);
    font-family: var(--font-id);
    letter-spacing: -0.02em;
  }

  .q-entity::before,
  .q-age::before {
    content: '·';
    margin-inline-end: var(--sp-2);
  }

  .q-title {
    font-size: var(--t-md);
    letter-spacing: -0.008em;
  }

  .q-cost {
    max-inline-size: var(--measure);
    color: var(--dim);
    font-size: var(--t-ui);
  }

  .q-cost-label {
    margin-inline-end: var(--sp-2);
    color: var(--warn);
    font-size: var(--t-xs);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .q-options {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin-block-start: var(--sp-2);
  }

  .q-option {
    padding: 2px var(--sp-2);
    background: var(--sunk);
    border: 1px solid var(--line);
    border-radius: 999px;
    color: var(--ink2);
    font-size: var(--t-xs);
  }

  .q :global(.icon) {
    align-self: center;
    color: var(--dim);
  }

  /* The row shape is `$lib/ui/rows.css`; the decided list uses three of its four columns. */
  .ledger :global(.line) {
    grid-template-columns: 8ch minmax(0, 1fr) auto;
    min-block-size: 44px;
  }

  @media (width < 900px) {
    .page {
      padding: var(--sp-3) var(--sp-3) var(--sp-7);
    }
  }
</style>
