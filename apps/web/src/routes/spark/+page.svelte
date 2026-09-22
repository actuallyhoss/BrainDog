<!--
  Spark: `/spark` (`loop/research-spark.md` S15, `loop/DIRECTION.md` §11).

  WHAT SPARK NOTICED, THEN WHAT IT SUGGESTS, THEN ONE PRESS. The sentences are the record's own reading of how this
  BrainDog is used. Each suggestion says whether it is new, waiting on Decide or answered, and links there once asked. The
  press puts the new ones on Decide and changes nothing else: accepting is Decide's, and only the owner's.

  THE SAMPLE HAS NO USE TO READ, so it says what Spark would do on a real record rather than inventing a reading.
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { createClient } from '@braindog/client';
  import { titleOf } from '$lib/title.ts';
  import { read } from '$lib/data/record.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { askSpark, canAsk, draftedBy, nothingYet, readSpark, suggestionsOf, words, type Asked, type Reading, type SparkClient } from '$lib/record/spark.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Section from '$lib/ui/Section.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import SparkDaily from '$lib/ui/SparkDaily.svelte';
  import { drew } from '../../lib/ui/screen.svelte.ts';

  let client: SparkClient | null = null;
  let phase = $state<'reading' | 'ready' | 'sample' | 'refused'>('reading');
  let reading = $state<Reading | null>(null);
  let fix = $state('');
  let busy = $state(false);
  let asked = $state<Asked | null>(null);

  const suggestions = $derived(reading ? suggestionsOf(reading) : []);

  async function load(): Promise<boolean> {
    if (!client) return false;
    const out = await readSpark(client);
    if (out.ok) {
      reading = out.reading;
      phase = 'ready';
      return true;
    }
    fix = out.fix;
    phase = 'refused';
    return false;
  }

  onMount(() => {
    if (!page.data.live) {
      phase = 'sample';
      return;
    }
    client = createClient({ base: apiBase() }) as unknown as SparkClient;
    void read(load);
  });

  $effect(() => {
    if (phase === 'ready' || phase === 'sample') drew('ready');
  });

  async function ask() {
    if (!client || busy) return;
    busy = true;
    try {
      const out = await askSpark(client);
      if (!out.ok) {
        toasts.push(out.fix, { intent: 'bad' });
        return;
      }
      asked = out.asked;
      toasts.push(out.said, out.asked.filed.length > 0 ? { intent: 'good' } : {});
      await load();
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>{titleOf(words.title)}</title></svelte:head>

<PageHead icon="star" title={words.title} />
<div class="page">
  {#if phase === 'sample'}
    <Empty kind="no-data-yet" title={words.sample} body={words.sampleBody} />
  {:else if phase === 'refused'}
    <Empty kind="no-permission" title={fix} />
  {:else if phase === 'ready' && reading}
    <div class="spark-intro">
      <p class="spark-lede">{words.lede}</p>
      <p class="spark-by">{draftedBy(reading)}</p>
    </div>

    {#if nothingYet(reading)}
      <!-- A NEW RECORD HAS NOTHING UNDER EITHER HEADING, so it gets one sentence of what Spark will do, and the reason it is
           quiet when the record is young. -->
      <Empty kind="no-data-yet" title={words.emptyTitle} body={reading.quiet === null ? words.emptyBody : `${reading.quiet} ${words.emptyBody}`} />
    {:else}
    <Section title={words.noticed}>
      {#if reading.noticed.length === 0}
        <p class="spark-said">{words.noticedNone}</p>
      {:else}
        <ul class="spark-list">
          {#each reading.noticed as n (`${n.kind}:${n.subject}`)}
            <li class="spark-noticed">{n.text}</li>
          {/each}
        </ul>
      {/if}
    </Section>

    <Section title={words.suggests}>
      {#if reading.quiet !== null}
        <p class="spark-said">{reading.quiet}</p>
      {:else if suggestions.length === 0}
        <p class="spark-said">{words.suggestsNone}</p>
      {:else}
        <ul class="spark-list">
          {#each suggestions as s (s.question)}
            <li class="spark-suggestion" data-state={s.state}>
              <span class="spark-question">{s.question}</span>
              {#if s.href}
                <a class="spark-link" href={at(s.href)}>{s.said}. {words.open}</a>
              {:else}
                <span class="spark-state">{s.said}</span>
              {/if}
            </li>
          {/each}
        </ul>
        {#if canAsk(reading)}
          <div class="spark-actions">
            <Button weight="primary" disabled={busy} onclick={ask}>{busy ? words.asking : words.ask}</Button>
          </div>
        {/if}
      {/if}
    </Section>
    {/if}

    {#if reading.daily}<SparkDaily daily={reading.daily} />{/if}

    {#if asked && (asked.skipped.length > 0 || asked.dropped.length > 0)}
      <Section title={words.skipped}>
        <ul class="spark-list">
          {#each asked.skipped as s (s.question)}
            <li class="spark-said"><span class="spark-question">{s.question}</span> {s.why}</li>
          {/each}
          {#each asked.dropped as d (d)}
            <li class="spark-said">{d}</li>
          {/each}
        </ul>
      </Section>
    {/if}
  {/if}
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-6);
    padding: var(--sp-5) var(--gutter) var(--sp-9);
    max-inline-size: 820px;
  }

  .spark-intro {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .spark-lede {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-ui);
    line-height: 1.5;
  }

  .spark-by,
  .spark-said,
  .spark-state {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .spark-list {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .spark-noticed {
    color: var(--ink2);
    font-size: var(--t-ui);
    line-height: 1.5;
  }

  /* A SUGGESTION IS ITS QUESTION, and under it where it stands. No boxes: space between them. */
  .spark-suggestion {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  .spark-question {
    color: var(--ink);
    font-size: var(--t-ui);
    font-weight: 500;
    line-height: 1.45;
  }

  .spark-suggestion[data-state='answered'] .spark-question {
    color: var(--dim);
  }

  .spark-link {
    color: var(--ink2);
    font-size: var(--t-sm);
    text-underline-offset: 3px;
  }

  .spark-actions {
    margin-block-start: var(--sp-4);
  }

  @media (width < 900px) {
    .page {
      padding: var(--sp-4) var(--gutter) var(--sp-8);
    }
  }
</style>
