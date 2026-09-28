<!--
  Slash: `/slash` (`loop/research-spark.md` S15, `loop/DIRECTION.md` §11).

  A HOME FOR ASKING FIRST (`loop/finish/agents.md` AGT-24). Where the host has a model the page opens with an Ask field, which
  runs the palette's two passes and draws the answer with `Cited`, and under it what was asked lately, each line reopening
  its proposal on Decide or asking its question again. What Slash noticed and suggests follows, as it was.

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
  import { page } from '$app/state';
  import { createClient } from '@braindog/client';
  import { copy } from '$lib/copy.ts';
  import { drawProposal, drawReading, pass2Refused, secondPass, slashWords, type Drawn, type DrawnProposal } from '$lib/palette/slash.ts';
  import { askedLately, askWords, ASKS_FETCHED, type AskedLine } from '$lib/palette/slash-ask.ts';
  import Cited from '$lib/ui/Cited.svelte';
  import { titleOf } from '$lib/title.ts';
  import { read } from '$lib/data/record.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { askSlash, canAsk, draftedBy, nothingYet, readSlash, suggestionsOf, words, type Asked, type Reading, type SlashClient } from '$lib/record/slash.ts';
  import { changeWords } from '$lib/record/slash.ts';
  import AskPage from '$lib/page/AskPage.svelte';
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
   * THE DESCRIBE FIELD (`loop/research-dynamic-layouts.md` §6 brief D2, `loop/finish/pages.md` PGS-12) is `AskPage`, the
   * same sheet a page's "Change this page" opens. It drafts with the record's `slashDraft`, which files nothing, and
   * draws each draft as the pages it would make before a press keeps it or puts it on Decide.
   *
   * SHOWN ONLY WHEN A MODEL DRAFTS, because Slash's own rules read use and cannot read a sentence: with no model the record
   * says so in a line of its own and files nothing, which a field that could never work would only lead the owner into.
   * NOT HELD BACK ON A YOUNG RECORD, as the plain press is: a description is the owner asking, and the record reaches the
   * model for it on any day, held to the month's asks like every other press.
   *
   * THE FIELD HAS NO LENGTH OF ITS OWN (defects G2). The record is the one that counts: past its bound it refuses `asked`
   * at `VALUE_MALFORMED` with a sentence naming the bound, and that sentence is what the owner reads, with the
   * description still in the field to shorten.
   */

  /** The plain press: Slash's own suggestions put on Decide. */
  async function press() {
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

  /**
   * THE ASK FIELD AT THE TOP (`loop/finish/agents.md` AGT-24): a question about what the record holds, asked the way the
   * palette asks it. Pass 1 reads the rows, drawn by code as links before any sentence; pass 2, only when a row or a
   * figure was read (`secondPass`), is Slash's sentence about them, drawn through `Cited` so no brace reaches the page.
   * The ask id goes back with pass 2 so the engine re-runs the predicate it drafted rather than drafting a second.
   *
   * SHOWN ONLY WHERE THE HOST HAS A MODEL, the same fact the palette's Slash row stands on: without one the field is
   * absent, not disabled (`23 §8`).
   */
  type Second = { drawn: DrawnProposal | null; refused: { fix: string; without: string | null } | null };
  type Answered = { question: string; drawn: Drawn | null; fix: string | null; second: Second | null };

  let door: ReturnType<typeof createClient> | null = null;
  const modelHere = $derived(page.data.slash === true);
  let question = $state('');
  let asking = $state(false);
  let answer = $state<Answered | null>(null);
  let lately = $state<AskedLine[] | null>(null);
  let answerAt = $state<HTMLElement | null>(null);

  async function askQuestion(text: string) {
    const q = text.trim();
    if (!door || asking || q.length < 2) return;
    asking = true;
    question = q;
    let shown: Answered = { question: q, drawn: null, fix: null, second: null };
    answer = shown;
    try {
      const out = await door.slashRead(q);
      if (!out.ok) {
        answer = { ...shown, fix: 'refusal' in out ? out.refusal.fix : copy.slashNothing };
        return;
      }
      const more = secondPass(out.value);
      shown = { question: q, drawn: drawReading(out.value), fix: null, second: more ? { drawn: null, refused: null } : null };
      answer = shown;
      if (!more) return;
      const said = await door.slashAnswer(q, out.value.ask_id);
      answer = {
        ...shown,
        second: said.ok
          ? { drawn: drawProposal(said.value), refused: null }
          : { drawn: null, refused: pass2Refused('refusal' in said ? said.refusal : { code: 'VALUE_MALFORMED', fix: copy.slashNothing }) },
      };
    } catch {
      /* A DROPPED CONNECTION IS NOT AN ANSWER. The rows already drawn stay; only what never arrived says so. */
      answer = shown.drawn === null ? { ...shown, fix: askWords.unreached } : { ...shown, second: { drawn: null, refused: { fix: askWords.unreached, without: null } } };
    } finally {
      asking = false;
      void loadAsks();
    }
  }

  /** Asking a listed question again: the answer is drawn at the top, so the page is taken there first. */
  function askAgain(text: string) {
    answerAt?.scrollIntoView({ block: 'start' });
    void askQuestion(text);
  }

  /**
   * "Asked lately", C15's `asks` door (owner only, as this whole screen is). A refused or unreached list is left out
   * rather than drawn as a sentence: the ask field above it still works, and the answer it draws says any refusal itself.
   */
  async function loadAsks() {
    if (!door || !modelHere) return;
    try {
      const out = await door.slashAsks(ASKS_FETCHED);
      if (out.ok) lately = askedLately(out.value.asks);
    } catch {
      /* Nothing to draw; the next ask tries again. */
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
    door = createClient({ base: apiBase() });
    client = door as unknown as SlashClient;
    void read(load);
    void loadAsks();
  });

  $effect(() => {
    if (phase === 'ready') drew('ready');
  });

</script>

<svelte:head><title>{titleOf(words.title)}</title></svelte:head>

<PageHead icon="star" title={words.title} />
<div class="page">
  {#if phase === 'refused'}
    <Empty kind="no-permission" title={fix} />
  {:else if phase === 'ready' && reading}
    {#if modelHere}
      <Section title={askWords.title}>
        <form
          class="slash-ask"
          onsubmit={(e) => {
            e.preventDefault();
            void askQuestion(question);
          }}
        >
          <label class="slash-said" for="slash-question">{askWords.label}</label>
          <!-- `field-lg` IS THE 16 PX FIELD, which is also what keeps a phone from zooming into it on focus. -->
          <div class="field field-lg">
            <input
              id="slash-question"
              class="field-input"
              type="text"
              enterkeyhint="send"
              autocomplete="off"
              spellcheck="true"
              placeholder={askWords.placeholder}
              bind:value={question}
            />
          </div>
          <div class="slash-ask-go">
            <Button weight="primary" type="submit" disabled={asking || question.trim().length < 2}>{asking ? askWords.asking : askWords.ask}</Button>
          </div>
        </form>

        <div class="slash-answer" bind:this={answerAt}>
          {#if answer}
            <p class="slash-asked">{answer.question}</p>
            {#if answer.fix !== null}
              <p class="slash-said" role="status">{answer.fix}</p>
            {:else if answer.drawn === null}
              <p class="slash-said" role="status">{copy.slashAsking}</p>
            {:else}
              {#if answer.drawn.where !== null}
                <p class="slash-said">{copy.slashWhere} {answer.drawn.where}</p>
              {:else if answer.drawn.q !== null}
                <p class="slash-said">{copy.slashSearched(answer.drawn.q)}</p>
              {/if}
              <!-- THE ROWS FIRST, DRAWN BY CODE (`23 §7`), and the sentence under them, never instead of them. -->
              {#if answer.drawn.rows.length > 0}
                <ul class="slash-rows">
                  {#each answer.drawn.rows as row (row.id)}
                    <li><a class="slash-row tap" href={at(row.href)}>{row.title}</a></li>
                  {/each}
                </ul>
              {:else if answer.second === null}
                <p class="slash-said">{copy.slashNothing}</p>
              {/if}
              {#if answer.second}
                <section class="slash-second" aria-label={slashWords.proposed}>
                  {#if answer.second.refused}
                    <p class="slash-said">{answer.second.refused.fix}</p>
                    {#if answer.second.refused.without}<p class="slash-said">{answer.second.refused.without}</p>{/if}
                  {:else if answer.second.drawn}
                    {#if answer.second.drawn.text}
                      <p class="slash-text"><Cited text={answer.second.drawn.text} figures={answer.second.drawn.figures} /></p>
                    {/if}
                    {#if answer.second.drawn.decide}
                      <a class="slash-link tap" href={at(answer.second.drawn.decide)}>{slashWords.decide}</a>
                    {/if}
                    <!-- `23 §8`: every answer names its model in the footer. `drawProposal` never leaves it empty. -->
                    <p class="slash-model">{answer.second.drawn.footer}</p>
                  {:else}
                    <p class="slash-said" role="status">{slashWords.proposing}</p>
                  {/if}
                </section>
              {/if}
              <details class="slash-fold">
                <summary class="slash-summary tap">{copy.slashFold}</summary>
                <ul>
                  {#each answer.drawn.fold as line}<li>{line}</li>{/each}
                </ul>
              </details>
            {/if}
          {/if}
        </div>
      </Section>

      {#if lately}
        <Section title={askWords.lately}>
          {#if lately.length === 0}
            <p class="slash-said">{askWords.latelyNone}</p>
          {:else}
            <ul class="slash-list">
              {#each lately as line (line.id)}
                <li class="slash-lately">
                  <span class="slash-question">{line.question}</span>
                  <span class="slash-lately-meta">
                    <span class="slash-state">{line.when}{line.refused ? `, ${askWords.refused}` : ''}</span>
                    {#if line.href}
                      <a class="slash-link tap" href={at(line.href)}>{askWords.open}</a>
                    {:else}
                      <button type="button" class="slash-again tap" disabled={asking} onclick={() => askAgain(line.question)}>{askWords.again}</button>
                    {/if}
                  </span>
                </li>
              {/each}
            </ul>
          {/if}
        </Section>
      {/if}
    {/if}

    <div class="slash-intro">
      <p class="slash-lede">{words.lede}</p>
      <p class="slash-by">{draftedBy(reading, asked)}</p>
    </div>

    {#if reading.model !== null}
      <!-- THE DESCRIPTION'S DRAFTS ARE DRAWN HERE, as a page's own "Change this page" draws them (PGS-12): each as the
           pages it would make, beside the pages as they are, kept, asked on Decide or dropped from here. -->
      <Section title={changeWords.describeTitle}>
        <AskPage
          model={true}
          onkept={async () => {
            await load();
          }}
        />
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
            <Button weight="primary" disabled={busy} onclick={() => void press()}>{busy ? words.asking : words.ask}</Button>
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

  /* THE ASK SECTION: a label, the field full width, and the press under it. */
  .slash-ask {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  .slash-ask .field {
    inline-size: 100%;
  }

  /* ONE COLUMN, TOP TO BOTTOM: what was asked, where Slash looked, the rows, the sentence, the model, the fold. */
  .slash-answer {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    margin-block-start: var(--sp-4);
    min-inline-size: 0;
  }

  .slash-asked {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-ui);
    font-weight: 500;
    overflow-wrap: anywhere;
  }

  .slash-rows {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .slash-row {
    color: var(--ink);
    font-size: var(--t-ui);
    text-underline-offset: 3px;
    overflow-wrap: anywhere;
  }

  .slash-second {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .slash-text {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-ui);
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  /* `23 §8`'s footer: receded and small, but always there. */
  .slash-model {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-xs);
    overflow-wrap: anywhere;
  }

  .slash-fold {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .slash-fold ul {
    margin: var(--sp-2) 0 0;
    padding-inline-start: var(--sp-4);
    overflow-wrap: anywhere;
  }

  .slash-summary {
    cursor: pointer;
  }

  .slash-lately {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  .slash-lately .slash-question {
    overflow-wrap: anywhere;
  }

  .slash-lately-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-1) var(--sp-3);
  }

  /* ASKING AGAIN IS A LINK'S EQUAL on the line, so it looks like one, beside "Open the proposal" on the lines that filed. */
  .slash-again {
    padding: 0;
    background: none;
    border: 0;
    color: var(--ink2);
    font: inherit;
    font-size: var(--t-sm);
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }

  .slash-again:disabled {
    color: var(--dim);
    cursor: default;
  }

  @media (width < 900px) {
    .page {
      padding: var(--sp-4) var(--gutter) var(--sp-8);
    }
  }

  /* AT PHONE WIDTH THE PRESS IS FULL WIDTH UNDER THE FIELD, so a thumb reaches it from either side of the screen. A grid
     stretches its one child across, which the button's own styles cannot be asked to do from here. */
  @media (width < 640px) {
    .slash-ask-go {
      display: grid;
    }
  }
</style>
