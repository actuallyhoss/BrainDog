<!--
  Slash: `/slash` (`loop/research-spark.md` S15, `loop/DIRECTION.md` §11).

  WHAT SLASH NOTICED, THEN WHAT IT SUGGESTS, THEN ONE PRESS. The sentences are the record's own reading of how this
  BrainDog is used. Each suggestion says whether it is new, waiting on Decide or answered, and links there once asked. The
  press puts the new ones on Decide and changes nothing else: accepting is Decide's, and only the owner's.

  THE RECORD IS ASKED WHATEVER THE SHELL SAYS. This screen used to look at `page.data.live` first and, on a shell that was
  not live, say "This is the sample" without asking anything. With no sample (DIRECTION 26) a shell that is not live is a
  record that refused or could not be reached, and `readSlash` hands back that refusal in the record's own words, which
  is the sentence this screen already draws for any other refusal.
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import { onMount } from 'svelte';
  import { createClient } from '@braindog/client';
  import { titleOf } from '$lib/title.ts';
  import { read } from '$lib/data/record.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { askSlash, canAsk, draftedBy, nothingYet, readSlash, suggestionsOf, words, type Asked, type Reading, type SlashClient } from '$lib/record/slash.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Section from '$lib/ui/Section.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import SlashDaily from '$lib/ui/SlashDaily.svelte';
  import { drew } from '../../lib/ui/screen.svelte.ts';

  let client: SlashClient | null = null;
  let phase = $state<'reading' | 'ready' | 'refused'>('reading');
  let reading = $state<Reading | null>(null);
  let fix = $state('');
  let busy = $state(false);
  let asked = $state<Asked | null>(null);

  const suggestions = $derived(reading ? suggestionsOf(reading) : []);

  /**
   * THE ASK FIELD (`loop/research-dynamic-layouts.md` §6 brief D2): the owner says what they want built, and the press
   * hands it to Slash's model as `asked`. Only what the model drafts from it is filed, on Decide, where a page is drawn
   * before anybody accepts it.
   *
   * SHOWN ONLY WHEN A MODEL DRAFTS, because Slash's own rules read use and cannot read a sentence: with no model the record
   * says so in a line of its own and files nothing, which a field that could never work would only lead the owner into.
   * NOT HELD BACK ON A YOUNG RECORD, as the plain press is: a description is the owner asking, and the record reaches the
   * model for it on any day, held to the month's asks like every other press.
   *
   * `ASKED_MOST` IS THE RECORD'S `SLASH_ASKED_MOST`, WRITTEN OUT, because the record is server code and this is the
   * browser's bundle. The record refuses past it by name (`asked` at `VALUE_MALFORMED`), so a drift is a refusal the
   * owner reads, not a description cut short.
   */
  const ASKED_MOST = 1_000;
  const describe = {
    title: 'Describe what you want',
    hint: 'Say in your own words what you want this BrainDog to hold and show. Slash drafts the lists, figures and pages for it and puts them on Decide, where you see the page before anything is made.',
    placeholder: 'A desk for my launch, in five parts, with the next step on each and a sentence saying how far along I am',
    ask: 'Draft it',
    asking: 'Drafting',
  } as const;
  let described = $state('');

  async function draftDescribed() {
    const text = described.trim();
    if (!client || busy || text === '') return;
    busy = true;
    try {
      const out = await askSlash(client, text);
      if (!out.ok) {
        toasts.push(out.fix, { intent: 'bad' });
        return;
      }
      asked = out.asked;
      toasts.push(out.said, out.asked.filed.length > 0 ? { intent: 'good' } : {});
      if (out.asked.filed.length > 0) described = '';
      await load();
    } finally {
      busy = false;
    }
  }

  async function load(): Promise<boolean> {
    if (!client) return false;
    const out = await readSlash(client);
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
    client = createClient({ base: apiBase() }) as unknown as SlashClient;
    void read(load);
  });

  $effect(() => {
    if (phase === 'ready') drew('ready');
  });

  async function ask() {
    if (!client || busy) return;
    busy = true;
    try {
      const out = await askSlash(client);
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
  {#if phase === 'refused'}
    <Empty kind="no-permission" title={fix} />
  {:else if phase === 'ready' && reading}
    <div class="slash-intro">
      <p class="slash-lede">{words.lede}</p>
      <p class="slash-by">{draftedBy(reading, asked)}</p>
    </div>

    {#if reading.model !== null}
      <Section title={describe.title}>
        <form
          class="slash-describe"
          onsubmit={(e) => {
            e.preventDefault();
            void draftDescribed();
          }}
        >
          <label class="slash-said" for="slash-asked">{describe.hint}</label>
          <textarea
            id="slash-asked"
            class="slash-field"
            rows="3"
            maxlength={ASKED_MOST}
            placeholder={describe.placeholder}
            spellcheck="true"
            bind:value={described}
          ></textarea>
          <div>
            <Button weight="primary" type="submit" disabled={busy || described.trim() === ''}>{busy ? describe.asking : describe.ask}</Button>
          </div>
        </form>
      </Section>
    {/if}

    {#if nothingYet(reading)}
      <!-- A NEW RECORD HAS NOTHING UNDER EITHER HEADING, so it gets one sentence of what Slash will do, and the reason it is
           quiet when the record is young. -->
      <Empty kind="no-data-yet" title={words.emptyTitle} body={reading.quiet === null ? words.emptyBody : `${reading.quiet} ${words.emptyBody}`} />
    {:else}
    <Section title={words.noticed}>
      {#if reading.noticed.length === 0}
        <p class="slash-said">{words.noticedNone}</p>
      {:else}
        <ul class="slash-list">
          {#each reading.noticed as n (`${n.kind}:${n.subject}`)}
            <li class="slash-noticed">{n.text}</li>
          {/each}
        </ul>
      {/if}
    </Section>

    <Section title={words.suggests}>
      {#if reading.quiet !== null}
        <p class="slash-said">{reading.quiet}</p>
      {:else if suggestions.length === 0}
        <p class="slash-said">{words.suggestsNone}</p>
      {:else}
        <ul class="slash-list">
          {#each suggestions as s (s.question)}
            <li class="slash-suggestion" data-state={s.state}>
              <span class="slash-question">{s.question}</span>
              {#if s.href}
                <a class="slash-link" href={at(s.href)}>{s.said}. {words.open}</a>
              {:else}
                <span class="slash-state">{s.said}</span>
              {/if}
            </li>
          {/each}
        </ul>
        {#if canAsk(reading)}
          <div class="slash-actions">
            <Button weight="primary" disabled={busy} onclick={ask}>{busy ? words.asking : words.ask}</Button>
          </div>
        {/if}
      {/if}
    </Section>
    {/if}

    {#if reading.daily}<SlashDaily daily={reading.daily} />{/if}

    {#if asked && (asked.skipped.length > 0 || asked.dropped.length > 0)}
      <Section title={words.skipped}>
        <ul class="slash-list">
          {#each asked.skipped as s (s.question)}
            <li class="slash-said"><span class="slash-question">{s.question}</span> {s.why}</li>
          {/each}
          {#each asked.dropped as d (d)}
            <li class="slash-said">{d}</li>
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

  .slash-intro {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .slash-lede {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-ui);
    line-height: 1.5;
  }

  .slash-by,
  .slash-said,
  .slash-state {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .slash-list {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .slash-noticed {
    color: var(--ink2);
    font-size: var(--t-ui);
    line-height: 1.5;
  }

  /* A SUGGESTION IS ITS QUESTION, and under it where it stands. No boxes: space between them. */
  .slash-suggestion {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  .slash-question {
    color: var(--ink);
    font-size: var(--t-ui);
    font-weight: 500;
    line-height: 1.45;
  }

  .slash-suggestion[data-state='answered'] .slash-question {
    color: var(--dim);
  }

  .slash-link {
    color: var(--ink2);
    font-size: var(--t-sm);
    text-underline-offset: 3px;
  }

  .slash-actions {
    margin-block-start: var(--sp-4);
  }

  .slash-describe {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  /* DECIDE'S REASON FIELD, `.commit-field` in `decide/[id]`, where the owner goes next to answer what this drafted, so the
     sentence typed here and the reason typed there sit in the same kind of box. */
  .slash-field {
    inline-size: 100%;
    padding: var(--sp-3);
    background: var(--bg);
    border: 1px solid var(--edge);
    border-radius: var(--r-sm);
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--t-ui);
    resize: vertical;
  }

  @media (width < 900px) {
    .page {
      padding: var(--sp-4) var(--gutter) var(--sp-8);
    }
  }
</style>
