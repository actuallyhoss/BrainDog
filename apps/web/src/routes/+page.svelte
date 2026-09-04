<!--
  Home. Two questions, answered without a filter: WHAT NEEDS YOU, and WHAT HAPPENED WHILE YOU WERE
  NOT LOOKING.

  The second half depends on one small piece of design that is easy to get wrong: the read mark is
  one value per person, written with MAX() only, and it advances when the person LEAVES the screen,
  never when it opens. The predecessor shipped it the other way round and found its own bug — For
  You had never once drawn its second half, because the screen advanced the mark on open and then
  asked for everything since it (19 §6).

  And the first screen is deliberately NOT a dashboard of dashes. A dashboard of — and flat charts
  teaches, in one glance, that the app is empty and none of it is for you.
-->
<script lang="ts">
  import { titleOf } from '$lib/title.ts';
  import { parse, relative, TONES } from 'braindog-render';
  import { Block } from 'braindog-render/svelte';
  import { copy } from '$lib/copy.ts';
  import { CURRENCY, NOW, ROWS, metric } from '$lib/record/api.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Section from '$lib/ui/Section.svelte';
  import Money from '$lib/ui/Money.svelte';
  import Icon from '$lib/ui/Icon.svelte';

  let { data } = $props();

  const today = new Date(NOW).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });

  const days = (iso: unknown) =>
    typeof iso === 'string' ? (Date.parse(`${iso}T12:00:00Z`) - NOW) / 86_400_000 : Infinity;

  const NEEDS_CAP = 6;

  const dueSoon = $derived(
    (ROWS.obligations ?? [])
      .filter((e) => (e.fields.state === 'open' || e.fields.state === 'part') && days(e.fields.due) <= 7)
      .sort((a, b) => String(a.fields.due).localeCompare(String(b.fields.due))),
  );

  const lapsing = $derived((ROWS.services ?? []).filter((e) => e.fields.state === 'lapsing'));
  const shown = $derived(dueSoon.slice(0, NEEDS_CAP));
  const hidden = $derived(dueSoon.length - shown.length);

  /* Home writes the dialect and the renderer draws it, exactly as an agent would — one code path
     from the first `<figure>` down, and no bespoke chart component to keep in step. */
  const strip = $derived.by(() => {
    const cells = ['owed-to-you', 'due-30d', 'overdue'].map((id) => metric(id));
    const rows = cells.map((m) => `${m.label} | ${m.value} | ${m.note}${m.tone ? ` | ${m.tone}` : ''}`);
    // No heading in the fence: the section above it already names the band, and a block that
    // repeats its own section title is the same sentence twice.
    return parse(['```stat', ...rows, '```'].join('\n'));
  });
</script>

<svelte:head><title>{titleOf(copy.home)}</title></svelte:head>

<PageHead kicker={data.index.name} title={today}>
  {#snippet actions()}
    <a class="to-decide" href="/decide">
      <span class="to-decide-n num">{data.questions.length}</span>
      <span>to decide</span>
    </a>
  {/snippet}
</PageHead>

<!-- Two columns, not three stacked lists. What needs you is the reason the screen exists and gets
     the width; the figures and the activity are context and sit beside it. A single column of
     full-bleed groups gives every group the same weight, which is the same as giving none. -->
<div class="page">
  <div class="primary">
    <Section title={copy.needsYou}>
    {#if data.questions.length === 0 && shown.length === 0 && lapsing.length === 0}
      <p class="cleared">{copy.nothingNeedsYou}</p>
    {:else}
      <ul class="ledger">
        {#each data.questions as q}
          <li>
            <a class="line line-tall" href="/decide/{q.id}">
              <span class="seq">{q.id}</span>
              <span class="line-main">
                <span class="line-title">{q.title}</span>
                <span class="line-detail">{q.cost}</span>
              </span>
              <span class="line-amount"></span>
              <span class="line-when">{relative(q.opened.slice(0, 10), NOW)}</span>
            </a>
          </li>
        {/each}

        {#each lapsing as s}
          <li>
            <a class="line" href="/r/services/{s.seq}">
              <span class="seq">services#{s.seq}</span>
              <span class="line-main">
                <span class="line-title">{s.fields.name} is lapsing</span>
              </span>
              <span class="line-amount"><Money minor={Number(s.fields.cost)} currency={CURRENCY} /></span>
              <span class="line-when" data-intent="bad">
                <span class="glyph" role="img" aria-label={TONES.bad.label}>{TONES.bad.glyph}</span>
                {relative(String(s.fields.renews), NOW)}
              </span>
            </a>
          </li>
        {/each}

        {#each shown as e}
          {@const late = days(e.fields.due) < 0}
          {@const owed = e.fields.direction === 'owed_to_me'}
          <li>
            <a class="line" href="/r/obligations/{e.seq}">
              <span class="seq">#{e.seq}</span>
              <span class="line-main">
                <span class="line-title">{e.fields.what}</span>
              </span>
              <span class="line-amount">
                <Money minor={Number(e.fields.amount)} currency={CURRENCY} weight={owed ? 'strong' : 'normal'} />
              </span>
              <span class="line-when" data-intent={late ? 'bad' : undefined}>
                <!-- Colour never carries meaning alone, so the date that is red is also the date
                     that is glyphed. There is no API here that lets it be otherwise (13 §2.3). -->
                {#if late}<span class="glyph" role="img" aria-label={TONES.bad.label}>{TONES.bad.glyph}</span>{/if}
                {relative(String(e.fields.due), NOW)}
              </span>
            </a>
          </li>
        {/each}
      </ul>

      {#if hidden > 0}
        <a class="more" href="/r/obligations?f=state:in:open,part&f=due:before:today">
          {hidden} more past their date
          <Icon name="arrow" size="s" />
        </a>
      {/if}
      {/if}
    </Section>
  </div>

  <aside class="secondary">
    <Section title="Right now">
      {#each strip as segment}
        {#if segment.type === 'block'}<Block block={segment} />{/if}
      {/each}
    </Section>

    <Section title={copy.sinceAway} count={data.whatsNew.length}>
      <ul class="feed">
        {#each data.whatsNew as item}
          <li>
            <a class="event" href={item.href}>
              <!-- The agent that wrote it, named. Never a sparkle badge: across thirteen experiments
                   participants trusted people and organisations LESS when their use of AI was
                   disclosed, so the badge imposes the cost without buying anything (19 §6). -->
              <span class="event-by">{item.by}</span>
              <span class="event-text">{item.text}</span>
              <span class="event-when">{relative(item.at.slice(0, 10), NOW)}</span>
            </a>
          </li>
        {/each}
      </ul>
      {#if data.sinceCapped}<p class="more">{copy.andMore}</p>{/if}
    </Section>
  </aside>
</div>

<style>
  .page {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 340px;
    gap: var(--sp-8);
    padding: var(--sp-5) var(--sp-6) var(--sp-9);
    max-inline-size: 1360px;
  }

  .primary,
  .secondary {
    display: flex;
    flex-direction: column;
    gap: var(--sp-8);
    min-inline-size: 0;
  }

  /* Three figures side by side in a 340px column is three 100px figures. The block is still TOLD how
     many cells it has — this stacks them at a breakpoint, which is not the same as `auto-fit`
     inferring a count from the space available (05 §4). */
  .secondary :global(.grid) {
    grid-template-columns: minmax(0, 1fr);
  }

  .secondary :global(.cell + .cell) {
    border-inline-start: 0;
    border-block-start: 1px solid var(--line);
  }

  .secondary :global(.cell) {
    padding: var(--sp-4);
  }

  /* The activity feed is not a table. It has no columns worth aligning, so it gets a reading shape:
     who, what, when, on one line, with nothing drawn around it. */
  .feed {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .event {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 2px var(--sp-3);
    padding: var(--sp-3) 0;
    border-block-end: 1px solid var(--line);
    color: var(--ink2);
    font-size: var(--t-ui);
    text-decoration: none;
  }

  .feed li:last-child .event {
    border-block-end: 0;
  }

  .event:hover .event-text {
    color: var(--ink);
  }

  .event-by {
    grid-column: 1;
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
  }

  .event-when {
    grid-column: 2;
    grid-row: 1;
    color: var(--dim);
    font-size: var(--t-xs);
    text-align: end;
    white-space: nowrap;
  }

  .event-text {
    grid-column: 1 / -1;
    grid-row: 2;
  }

  /* The row shape is `$lib/ui/rows.css` — one contract, one file. Only what is Home's own is here.

     No margin rule per row, and that is a reversal: a leading edge is right when a FEW rows are
     marked and wrong when most of them are — eleven marked rows merge into one continuous stripe
     down the card, which reads as a rendering fault rather than as eleven warnings. The state lives
     in the date column instead: one place, one column, aligned. */

  .more {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
    color: var(--accent-text);
    font-size: var(--t-sm);
    text-decoration: none;
  }

  .cleared {
    color: var(--earn);
  }

  .to-decide {
    display: inline-flex;
    align-items: baseline;
    gap: var(--sp-2);
    color: var(--ink2);
    font-size: var(--t-sm);
    text-decoration: none;
  }

  .to-decide-n {
    color: var(--warn);
    font-size: var(--t-lg);
    font-variant-numeric: tabular-nums;
    font-weight: 500;
  }

  @media (width < 1180px) {
    .page {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--sp-7);
    }
  }

  @media (width < 900px) {
    .page {
      padding: var(--sp-4) var(--sp-4) var(--sp-8);
    }
  }
</style>
