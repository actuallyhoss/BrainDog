<!--
  Every open question, ranked by the COST OF BEING WRONG — never by age.

  Ranking by age is what turns a decision queue into a backlog: the oldest question is usually the
  one nobody has needed to answer. Ranking by what deciding late costs puts the expensive one first
  and makes the order arguable, which is the point (19 §2).
-->
<script lang="ts">
  import { titleOf } from '$lib/title.ts';
  import { relative } from 'braindog-render';
  import { copy } from '$lib/copy.ts';
  import { DECIDED, DOM_CAP, NOW, metric } from '$lib/record/api.ts';
  import { CapLine } from 'braindog-render/svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Section from '$lib/ui/Section.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Icon from '$lib/ui/Icon.svelte';

  let { data } = $props();

  const open = $derived([...data.questions].sort((a, b) => a.rank - b.rank));
  const target = metric('open-questions');
</script>

<svelte:head><title>{titleOf(copy.decide)}</title></svelte:head>

<PageHead icon="decide"
  title={copy.decide}
  count={open.length}
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
                <span class="q-cost">{q.cost}</span>
                <!-- WHAT THE CHOICES ARE, NOT THREE CONTROLS THAT MAKE THEM. These were pill-shaped,
                     boxed and bordered, inside the card's own link — so three targets that looked
                     like three choices were one: clicking "One studio price" landed on the question
                     with nothing preselected, byte-identical to clicking anywhere else on the card.
                     `13 §5.2`'s rule is that a control is a control; the inverse holds, and a thing
                     that is not one must not dress as one.

                     They stay, because knowing a decision has three options and what they are is
                     most of why this row is scannable. They read as the sentence they are. Picking
                     one from here is a real feature and it is filed as one: it needs the card to
                     stop being a single link, which is a change to a spine screen, not a style. -->
                <span class="q-options">{q.options.map((o) => o.title).join(' · ')}</span>
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
        {#each DECIDED.slice(0, DOM_CAP) as q}
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
      <CapLine shown={Math.min(DECIDED.length, DOM_CAP)} total={DECIDED.length} />
    </Section>
  {/if}
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    padding: var(--sp-5) var(--sp-6) var(--sp-9);
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


  .q-options {
    margin-block-start: var(--sp-2);
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .q :global(.icon) {
    align-self: center;
    color: var(--dim);
  }

  /* The row shape is `$lib/ui/rows.css`; the decided list uses three of its four columns. */
  /**
   * A DESKTOP TRACK LIST IS A DESKTOP RULE, AND HAS TO SAY SO.
   *
   * `rows.css` turns a row into a two-line card below 640px. This override said nothing about width,
   * and it is more specific than the card rule — Svelte compiles `.ledger :global(.line)` to
   * `.ledger.svelte-xxx .line`, three classes against one — so it won at every size. The children
   * took their card placements and the parent kept four desktop tracks underneath them: computed at
   * 390, `144px 63px 0px 81px`, a zero-width track with a nowrap note in it.
   *
   * The cost is measurable. The longest note in the audit log was 19% visible — `added a n…` — and
   * `/decide` lost 227px of a 551px sentence. Eight entries, none readable, on the two screens whose
   * whole job is to say what changed and why. Every desktop screenshot looked correct.
   *
   * `@layer components` alone does NOT fix it: within one layer the more specific rule still wins.
   * The width query is what makes the two rules describe two different screens instead of arguing
   * about one.
   */
  @media (width >= 640px) {
    .ledger :global(.line) {
      grid-template-columns: 8ch minmax(0, 1fr) auto;
      min-block-size: 44px;
    }
  }

  @media (width < 900px) {
    .page {
      padding: var(--sp-4) var(--sp-4) var(--sp-8);
    }
  }
</style>
