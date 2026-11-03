<!--
  Slash: `/slash`.

  CALM AT REST. The screen answers one question first, in the line under the title: what waits for him
  on Decide, in red, else what is new, else that there is nothing yet. Under it are the Ask field, where the host has a
  model, and one tile: what Slash suggests, what waits on Decide first, or with nothing yet one sentence and one thing to
  try. That is all that is drawn at rest, two tiles and the line. Who drafts is one dim line at the foot, linked to the
  setting that adds a model: it is about the host, and never the headline.

  EVERYTHING ELSE IS ONE PRESS AWAY, in one quiet fold under the list, a `<details>` so a key and a thumb both open it:
  what Slash noticed, what you answered, what you asked lately, where each suggestion stands, the daily look and the
  describe field. The fold's own line names what is inside, so pressing it is never a guess, and with nothing inside it
  is not drawn.

  EACH SUGGESTION SAYS WHO DRAFTED IT (`lines.ts` `suggestedOf`, `byLine`): "From how you use BrainDog" for Slash's own
  rules, the model by its name for the model's, and nothing where the record does not say. A rule's draft never carries
  the model's name.

  WHAT SLASH SUGGESTS, THEN ONE PRESS. Each suggestion says whether it is new, waiting on Decide or answered, and links
  there once asked. The press puts the new ones in Needs you and changes nothing else: accepting is for the owner in Needs you, and nobody else can do it. What the press left off Needs you is said under the list it pressed.

  THE ASK TILE: the field, and under it the answer with its sources, what it read drawn by code, then Slash's sentence
  beside its face with the model named. An answer that proposes a change draws the one decision card under it, where he
  asked (`in-place.ts`): Enter accepts, a six-second Undo follows, and Needs you is only its second action. Left
  unanswered, it waits on Decide, where the record filed it.

  A MODEL THAT DOES NOT ANSWER IS SAID ABOVE THE ASK TILE: the record's `engineHealth` sentence, "Slash's
  model has not answered since 6 October. That is ours to fix. Until it is back, BrainDog works from its rules." Its
  first sentence in the deeper red, in words. Answering, or a build without the read, says nothing here.

  THE RECORD IS ASKED WHATEVER THE SHELL SAYS. This screen used to look at `page.data.live` first and, on a shell that was
  not live, say "This is the sample" without asking anything. With no sample a shell that is not live is a
  record that refused or could not be reached, and `readSlash` hands back that refusal in the record's own words, which
  is the sentence this screen already draws for any other refusal.
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import { type Component } from 'svelte';
  import { page } from '$app/state';
  import { createClient, type EngineHealth, type SlashStatus } from '@braindog/client';
  import { engineLine } from '$lib/ui/engine-line.ts';
  import { copy } from '$lib/copy.ts';
  import { drawProposal, drawReading, pass2Refused, secondPass, slashWords, type Drawn, type DrawnProposal } from '$lib/palette/slash.ts';
  import { askedLately, askWords, ASKS_FETCHED, type AskedLine } from '$lib/palette/slash-ask.ts';
  import Cited from '$lib/ui/Cited.svelte';
  import SlashOut from '$lib/ui/SlashOut.svelte';
  import { titleOf } from '$lib/title.ts';
  import { read } from '$lib/data/record.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { askSlash, canAsk, draftedBy, nothingYet, readSlash, words, type Asked, type Reading, type SlashClient } from '$lib/record/slash.ts';
  import { outOfAsks } from '$lib/ui/slash-asks.ts';
  import { changeWords } from '$lib/record/slash.ts';
  import AskPage from '$lib/page/AskPage.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import SlashDaily from '$lib/ui/SlashDaily.svelte';
  import SlashMark from './SlashMark.svelte';
  import SlashThreads from './SlashThreads.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Stacked from '$lib/viz/Stacked.svelte';
  import { listName } from '$lib/record/names.ts';
  import { byLine, foldOf, sentenceOf, suggestedOf, tallyOf, words as lineWords } from './lines.ts';
  import { cardInPlace, enterOn, leftUnanswered, words as inPlaceWords, type InPlace } from './in-place.ts';
  import { outcomeLines, readOutcomes, type OutcomeLine } from '$lib/record/slash-outcomes.ts';
  import { beforeNavigate } from '$app/navigation';
  /* A TYPE ONLY: the card itself is fetched when an answer first needs it (`loadCard`), so no screen loads it for this one. */
  import type DecisionCardType from '$lib/decide/DecisionCard.svelte';
  import { drew } from '../../lib/ui/screen.svelte.ts';

  let client: SlashClient | null = null;
  let phase = $state<'reading' | 'ready' | 'refused'>('reading');
  let reading = $state<Reading | null>(null);
  let fix = $state('');
  let busy = $state(false);
  let asked = $state<Asked | null>(null);

  /* EVERY SUGGESTION AND WHO DRAFTED IT, with what the last press filed naming its own drafter (`suggestedOf`). */
  const suggestions = $derived(reading ? suggestedOf(reading, asked?.filed ?? []) : []);
  /* WHAT SLASH SUGGESTED AND WHAT YOU ANSWERED, drawn apart: the first is still to act on, the second is done. */
  const stillOpen = $derived(suggestions.filter((s) => s.state !== 'answered'));
  const settled = $derived(suggestions.filter((s) => s.state === 'answered'));

  /* THE WORDS THIS SCREEN ADDS for the answered list and its tile are `lines.ts`'s; the rest are `slash.ts`'s. */
  const pageWords = lineWords;

  /** How many of Slash's suggestions wait for his answer on Decide: the title row's red phrase. */
  const waitingOn = $derived(suggestions.filter((s) => s.state === 'waiting').length);
  /** The line under the title: what waits on him, else what is new, else nothing yet. Nothing until the record has answered. */
  const sentence = $derived(
    phase === 'ready' && reading ? sentenceOf(waitingOn, stillOpen.length - waitingOn, suggestions.length, words.emptyTitle) : null,
  );
  /** Who drafts, said once at the foot of the screen. */
  const drafts = $derived(phase === 'ready' && reading ? draftedBy(reading, asked) : null);
  /** "Suggestions": the one figure on this screen, where each suggestion stands, or nothing with none. */
  const tally = $derived(reading && !nothingYet(reading) ? tallyOf(suggestions, reading.waiting.length, reading.cap) : null);

  /**
   * THE DESCRIBE FIELD is `AskPage`, the
   * same sheet a page's "Change this page" opens. It drafts with the record's `slashDraft`, which files nothing, and
   * draws each draft as the pages it would make before a press keeps it or puts it on Decide.
   *
   * SHOWN ONLY WHEN A MODEL DRAFTS, because Slash's own rules read use and cannot read a sentence: with no model the record
   * says so in a line of its own and files nothing, which a field that could never work would only lead the owner into.
   * NOT HELD BACK ON A YOUNG RECORD, as the plain press is: a description is the owner asking, and the record reaches the
   * model for it on any day, held to the month's asks like every other press.
   *
   * THE FIELD HAS NO LENGTH OF ITS OWN. The record is the one that counts: past its bound it refuses `asked`
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
   * THE ASK FIELD AT THE TOP: a question about what the record holds, asked the way the
   * palette asks it. Pass 1 reads the rows, drawn by code as links before any sentence; pass 2, only when a row or a
   * figure was read (`secondPass`), is Slash's sentence about them, drawn through `Cited` so no brace reaches the page.
   * The ask id goes back with pass 2 so the engine re-runs the predicate it drafted rather than drafting a second.
   *
   * SHOWN ONLY WHERE THE HOST HAS A MODEL, the same fact the palette's Slash row stands on: without one the field is
   * absent, not disabled (`23 §8`).
   */
  type Second = { drawn: DrawnProposal | null; refused: { fix: string; without: string | null; spent?: boolean } | null };
  type Answered = { question: string; drawn: Drawn | null; fix: string | null; second: Second | null; busy?: boolean };

  let door: ReturnType<typeof createClient> | null = null;
  const modelHere = $derived(page.data.slash === true);
  let question = $state('');
  let asking = $state(false);
  let answer = $state<Answered | null>(null);
  let lately = $state<AskedLine[] | null>(null);
  let answerAt = $state<HTMLElement | null>(null);
  let engine = $state<EngineHealth | null>(null);
  let engineMonth = $state<SlashStatus | null>(null);

  /** The one line Today says too: not answering, his key closed, or the month spent (`engine-line.ts`). Healthy is nothing. */
  const engineDown = $derived(engineLine(engine, engineMonth));

  /** Whether the engine answers, from its own ledger, and what the month has left. A refusal or an old build is nothing said. */
  async function loadEngine() {
    if (!door || !modelHere) return;
    try {
      const [out, month] = await Promise.all([door.engineHealth(), door.slashStatus().catch(() => null)]);
      const v = out.ok ? (out.value as EngineHealth | null) : null;
      engine = v !== null && typeof v === 'object' && 'health' in v ? v : null;
      engineMonth = month?.ok ? month.value : null;
    } catch {
      /* Nothing to say. */
    }
  }

  /**
   * WHAT CAME OF ITS SUGGESTIONS (ENG-A16 seen): read from `engineReadings`, the record asked whatever the shell says, and the tile
   * (`SlashOutcomes.svelte`) fetched by `import()` only once the read has lines, so a record with nothing to say, an old
   * host and a refusal load nothing more.
   */
  let Outcomes = $state<Component<{ lines: OutcomeLine[] }> | null>(null);
  let outcomes = $state<OutcomeLine[]>([]);

  async function loadOutcomes() {
    if (!client) return;
    const lines = outcomeLines(await readOutcomes(client));
    if (lines.length === 0) return;
    try {
      const m = await import('./SlashOutcomes.svelte');
      outcomes = lines;
      Outcomes = m.default;
    } catch {
      /* A CHUNK THAT DID NOT ARRIVE leaves Slash as it is, without the tile. */
    }
  }

  /** The fold's line: what it holds, named, or `null` and no fold with nothing in it. */
  const folded = $derived(
    reading
      ? foldOf({
          tally: tally !== null,
          noticed: reading.noticed.length > 0,
          answered: settled.length > 0,
          lately: modelHere && (lately?.length ?? 0) > 0,
          daily: reading.daily !== undefined,
          describe: reading.model !== null,
        })
      : null,
  );

  /**
   * THE ONE DECISION CARD, WHERE HE ASKED: an answer that proposes a change draws the
   * palette's own card (`in-place.ts` `cardInPlace`, through `filedCard`) under the Ask field. Enter in the field accepts
   * it while the field still holds its question, a six-second Undo follows on its line, and once answered it reads
   * "Slash suggested · Mara accepted". The record filed it when it answered, so a card left unanswered, by asking again or
   * by leaving the page, already waits on Decide, and the page says so in one line. Nothing here files a question.
   *
   * LOADED WHEN FIRST NEEDED, held in state and drawn through `{#if}` (an `{#await}` is a runtime of its own), so the card
   * costs the screens that never show one nothing.
   */
  let inPlace = $state<InPlace | null>(null);
  let Card = $state<typeof DecisionCardType | null>(null);
  let cardRef = $state<ReturnType<typeof DecisionCardType> | null>(null);
  let cardAt = $state<HTMLElement | null>(null);
  /** Whether Enter in the field is the card's: drawn, unanswered, and the field still holding the question it answers. */
  const enterAccepts = $derived(Card !== null && enterOn(inPlace, question, answer?.question ?? '') === 'accept');

  async function loadCard() {
    if (Card) return;
    try {
      Card = (await import('$lib/decide/DecisionCard.svelte')).default;
    } catch {
      /* A CHUNK THAT DID NOT ARRIVE leaves the card's second action, the same question on Decide. */
    }
  }

  /** Whether he answered the card, held for its Undo or sent: the card knows before the record does. */
  const settledInPlace = (c: InPlace): InPlace => ({ ...c, answered: c.answered || cardRef?.answered() === true });

  /** The card put away for a new ask: what it leaves on Decide, said once. Answered, it leaves nothing. */
  function letGo() {
    if (inPlace === null) return;
    const left = leftUnanswered(settledInPlace(inPlace));
    inPlace = null;
    if (left) toasts.push(left.said);
  }

  /** Enter on the card: its answer, or, where no key may give one (money moves), the focus on its first choice. */
  function acceptInPlace() {
    if (cardRef?.accept()) return;
    if (!cardRef?.answered()) cardAt?.querySelector<HTMLElement>('button, a[href]')?.focus();
  }

  /** Answered and written: the card's line stays, the second action goes, and the suggestions tile reads again. */
  function answeredInPlace() {
    if (inPlace) inPlace.answered = true;
    void load();
  }

  /* LEAVING THE PAGE with the card unanswered: it waits on Decide, said on the screen he goes to, unless that is its own. */
  beforeNavigate(({ to, type }) => {
    if (inPlace === null || type === 'leave') return;
    const left = leftUnanswered(settledInPlace(inPlace));
    if (left && !(to?.url.pathname.endsWith(left.decide) ?? false)) toasts.push(left.said);
  });

  async function askQuestion(text: string) {
    const q = text.trim();
    if (!door || asking || q.length < 2) return;
    letGo();
    asking = true;
    question = q;
    let shown: Answered = { question: q, drawn: null, fix: null, second: null };
    answer = shown;
    try {
      const out = await door.slashRead(q, {
        busy: () => {
          if (answer?.question === q && answer.drawn === null) answer = { ...answer, busy: true };
        },
      });
      if (!out.ok) {
        answer = { ...shown, fix: 'refusal' in out ? out.refusal.fix : copy.slashNothing };
        return;
      }
      const more = secondPass(out.value);
      shown = { question: q, drawn: drawReading(out.value), fix: null, second: more ? { drawn: null, refused: null } : null };
      answer = shown;
      if (!more) return;
      const said = await door.slashAnswer(q, out.value.ask_id);
      if (said.ok) {
        inPlace = cardInPlace(said.value, q, Date.now());
        if (inPlace) void loadCard();
      }
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

  /** Asking a listed question again: the answer is drawn in the Ask tile, so the page is taken to its field first. */
  function askAgain(text: string) {
    answerAt?.scrollIntoView({ block: 'start' });
    void askQuestion(text);
  }

  /**
   * "Asked lately", the record's `asks` door (owner only, as this whole screen is). A refused or unreached list is left out
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

  /**
   * A PAGE COMPOSED ON THE OWNER'S OWN MACHINE (`PageJobs.svelte`, `page-jobs.ts`): fetched by `import()` for the owner only,
   * so a member and every other screen load none of it. It asks the record itself, as this screen does, and draws
   * nothing at all where the record does not answer or no add-on ships a kind that takes a page.
   */
  let PageJobs = $state<Component | null>(null);

  /* THE CONVERSATIONS ARE THE PAGE (`SlashThreads.svelte`); THE HISTORY IS `?history`, and only it reads all of this. */
  const history = $derived(page.url.searchParams.has('history'));
  let started = false;
  $effect(() => {
    if (!history || started) return;
    started = true;
    door = createClient({ base: apiBase() });
    client = door as unknown as SlashClient;
    void read(load);
    void loadAsks();
    void loadEngine();
    void loadOutcomes();
    if (page.data.me?.owner === true)
      void import('./PageJobs.svelte').then(
        (m) => (PageJobs = m.default),
        () => {
          /* A CHUNK THAT DID NOT ARRIVE leaves Slash as it is, without the press. */
        },
      );
  });

  $effect(() => {
    if (phase === 'ready') drew('ready');
  });

</script>


<svelte:head><title>{titleOf(words.title)}</title></svelte:head>

{#if !history}
<SlashThreads />
{:else}
<PageHead icon="star" title={words.title} sentence={sentence?.text} needs={sentence?.needs} />
<div class="page">
  {#if phase === 'refused'}
    <Empty kind="no-permission" title={fix} />
  {:else if phase === 'ready' && reading}
    {#if modelHere}
      <!--
        THE ASK TILE LEADS: a question about what the record holds, and its answer in the same tile. The rows it
        read come first, drawn by code as rows with the list each came from (`23 §7`); Slash's sentence about them follows
        beside its face, drawn through `Cited` so a figure opens its rows; the model is named under it (`23 §8`); and what
        Slash read folds away at the foot. No chart here: the tile holds no figure of its own, the answer carries its own.
      -->
      {#if engineDown}
        <p class="slash-engine" role="status"><span data-needs>{engineDown.lead}</span>{engineDown.rest}</p>
      {/if}
      <Tile icon="slash" title={askWords.title} lead data-part="ask">
        <form
          class="slash-ask"
          bind:this={answerAt}
          onsubmit={(e) => {
            e.preventDefault();
            void askQuestion(question);
          }}
        >
          <label class="field-label slash-ask-label" for="slash-question">{askWords.label}</label>
          <div class="slash-ask-row">
            <!-- `field-lg` IS THE 16 PX FIELD, which is also what keeps a phone from zooming into it on focus. -->
            <div class="field field-lg">
              <Icon name="search" size="m" />
              <input
                id="slash-question"
                class="field-input"
                type="text"
                enterkeyhint="send"
                autocomplete="off"
                spellcheck="true"
                placeholder={askWords.placeholder}
                bind:value={question}
                onkeydown={(e) => {
                  /* ENTER IS THE CARD'S while the field still holds the question it answers; a new question is asked. */
                  if (e.key !== 'Enter' || e.isComposing || !enterAccepts) return;
                  e.preventDefault();
                  acceptInPlace();
                }}
              />
            </div>
            <div class="slash-ask-go">
              <Button type="submit" kbd={enterAccepts ? undefined : '↵'} disabled={asking || question.trim().length < 2}>{asking ? askWords.asking : askWords.ask}</Button>
            </div>
          </div>
        </form>

        {#if answer}
          <div class="slash-answer">
            <p class="slash-asked"><span class="slash-asked-said">{pageWords.asked}</span> <span class="slash-asked-q">{answer.question}</span></p>
            {#if answer.fix !== null}
              <p class="slash-said" role="status">{answer.fix}</p>
            {:else if answer.drawn === null}
              <p class="slash-said" role="status">{answer.busy ? copy.slashBusy : copy.slashAsking}</p>
            {:else}
              <!-- THE SOURCE, BEFORE ANY SENTENCE: where Slash looked, and how many rows came back. -->
              {#if answer.drawn.where !== null || answer.drawn.q !== null}
                <p class="slash-source">
                  <Icon name="rows" size="s" />
                  <span
                    >{answer.drawn.where !== null ? `${copy.slashWhere} ${answer.drawn.where}` : copy.slashSearched(answer.drawn.q ?? '')}{#if answer.drawn.rows.length > 0}<span
                        class="slash-source-n num"
                        >, {pageWords.rowsRead(answer.drawn.rows.length)}</span
                      >{/if}</span
                  >
                </p>
              {/if}
              <!-- THE ROWS FIRST, DRAWN BY CODE (`23 §7`), and the sentence under them, never instead of them. -->
              {#if answer.drawn.rows.length > 0}
                <ul class="ledger ledger-lead slash-rows">
                  {#each answer.drawn.rows as row (row.id)}
                    <li>
                      <a class="line slash-row" href={at(row.href)}>
                        <span class="line-mark"><IconWell name="rows" size="l" /></span>
                        <span class="line-main">
                          <span class="line-title">{row.title}</span>
                          <span class="line-detail">{listName(row.register)}</span>
                        </span>
                        <span class="slash-row-go" aria-hidden="true"><Icon name="chevron" size="s" /></span>
                      </a>
                    </li>
                  {/each}
                </ul>
              {:else if answer.second === null}
                <p class="slash-said">{copy.slashNothing}</p>
              {/if}
              {#if answer.second}
                <section class="slash-second" aria-label={slashWords.proposed}>
                  <SlashMark />
                  <div class="slash-second-words">
                    {#if answer.second.refused}
                      <p class="slash-said">{answer.second.refused.fix}</p>
                      {#if answer.second.refused.without}<p class="slash-said">{answer.second.refused.without}</p>{/if}
                      {#if answer.second.refused.spent}<SlashOut />{/if}
                    {:else if answer.second.drawn}
                      {#if answer.second.drawn.text}
                        <p class="slash-text"><Cited text={answer.second.drawn.text} figures={answer.second.drawn.figures} /></p>
                      {/if}
                      {#if inPlace}
                        <!-- THE ONE DECISION CARD, where he asked: Enter accepts, a six-second Undo follows. Decide is its second action. -->
                        <div class="slash-card" bind:this={cardAt} data-armed={enterAccepts ? '' : undefined}>
                          {#if Card}<Card bind:this={cardRef} question={inPlace.question} whole={false} onanswered={answeredInPlace} />{/if}
                        </div>
                        {#if !inPlace.answered}
                          <div class="slash-second-do"><Button size="sm" href={inPlace.decide}>{inPlaceWords.open}</Button></div>
                        {/if}
                      {:else if answer.second.drawn.decide}
                        <!-- FILED, BUT NOTHING THE CARD CAN DRAW (options with none to choose): the question is on Decide. -->
                        <div class="slash-second-do"><Button size="sm" href={answer.second.drawn.decide}>{slashWords.decide}</Button></div>
                      {/if}
                      <!-- `23 §8`: every answer names its model in the footer. `drawProposal` never leaves it empty. -->
                      <p class="slash-model">{answer.second.drawn.footer}</p>
                    {:else}
                      <p class="slash-said" role="status">{slashWords.proposing}</p>
                    {/if}
                  </div>
                </section>
              {/if}
              <details class="slash-fold">
                <summary class="slash-summary tap">{copy.slashFold}</summary>
                <ul>
                  {#each answer.drawn.fold as line}<li>{line}</li>{/each}
                </ul>
              </details>
            {/if}
          </div>
        {/if}
      </Tile>
    {/if}

    <!-- THE ONE TILE: what Slash suggests, what waits on Decide first, each saying who drafted it, WITH THE SCREEN'S ONE
         PRIMARY in its heading. The press puts the new ones on Decide and changes nothing else. With nothing suggested yet
         it is the same tile, holding one sentence and, where a model can answer, one thing to try. -->
    <Tile icon="decide" title={words.suggests} count={nothingYet(reading) ? undefined : stillOpen.length || undefined} data-part="suggests">
      {#snippet actions()}
        {#if reading && !nothingYet(reading) && reading.quiet === null && stillOpen.length > 0 && canAsk(reading)}
          <Button weight="primary" disabled={busy} onclick={() => void press()}>{busy ? words.asking : words.ask}</Button>
        {/if}
      {/snippet}
      {#if nothingYet(reading)}
        <p class="slash-empty">{reading.quiet === null ? words.emptyBody : `${reading.quiet} ${words.emptyBody}`}</p>
        {#if modelHere}
          <!-- ONE THING TO DO: the Ask field's own example, asked in the tile above. -->
          <button type="button" class="slash-try tap" disabled={asking} onclick={() => askAgain(askWords.placeholder)}
            ><Icon name="slash" size="s" /><span>{pageWords.tryAsk(askWords.placeholder)}</span></button
          >
        {/if}
      {:else if reading.quiet !== null && stillOpen.length === 0}
        <p class="slash-said">{reading.quiet}</p>
      {:else if stillOpen.length === 0}
        <p class="slash-said">{suggestions.length === 0 ? words.suggestsNone : pageWords.allAnswered}</p>
      {:else}
        {#if canAsk(reading)}<p class="slash-hint">{pageWords.press}</p>{:else if reading.quiet !== null}<p class="slash-hint">{reading.quiet}</p>{/if}
        <ul class="ledger ledger-lead slash-list">
          {#each stillOpen as s (s.href ?? s.question)}
            {@const by = byLine(s.by)}
            <!-- A SUGGESTION WAITING ON DECIDE NEEDS HIM, so its verb always shows; a new one is his to put there. -->
            <li class="slash-suggestion" data-state={s.state} data-needs={s.state === 'waiting' ? '' : undefined}>
              <div class="line line-tall">
                <span class="line-mark"><IconWell name="decide" size="l" /></span>
                <span class="line-main">
                  <span class="line-title slash-question">{s.question}</span>
                  <span class="line-detail slash-state"
                    ><span class="dot" data-state={s.state} aria-hidden="true"></span>{s.said}{#if by}<span class="slash-by">{by}</span>{/if}{#if s.waits}<span class="slash-by">{s.waits}</span>{/if}</span
                  >
                </span>
                {#if s.href}
                  <span class="line-verbs"><Button size="sm" href={s.href}>{words.open}</Button></span>
                {/if}
              </div>
            </li>
          {/each}
        </ul>
      {/if}

      {#if asked && (asked.skipped.length > 0 || asked.dropped.length > 0)}
        <!-- WHAT THE LAST PRESS LEFT OFF DECIDE, and why, right under the press that left it, in the same tile. -->
        <h3 class="slash-sub">{words.skipped}</h3>
        <ul class="ledger ledger-lead slash-list">
          {#each asked.skipped as s (s.question)}
            <li>
              <div class="line line-tall">
                <span class="line-mark"><IconWell name="info" size="l" /></span>
                <span class="line-main">
                  <span class="line-title slash-question">{s.question}</span>
                  <span class="line-detail slash-wrap">{s.why}</span>
                </span>
              </div>
            </li>
          {/each}
          {#each asked.dropped as d (d)}
            <li>
              <div class="line">
                <span class="line-mark"><IconWell name="info" size="l" /></span>
                <span class="line-main"><span class="line-title slash-wrap slash-sentence">{d}</span></span>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </Tile>

    <!-- HOW ITS SUGGESTIONS ENDED, under the ones still open: the third tile before the fold, drawn only with something to say. -->
    {#if Outcomes}<Outcomes lines={outcomes} />{/if}

    {#if folded}
      <!--
        THE ONE FOLD: everything this screen drew before §35 that is not the Ask field or the list, one press away. A
        `<details>`, so Enter or Space on the focused line and a tap both open it, and its line names what is inside.
      -->
      <details class="more">
        <summary class="more-summary">
          <span class="more-icon" aria-hidden="true"><Icon name="chevron" size="s" /></span>
          <span class="more-title">{pageWords.more}</span>
          <span class="more-said">{folded}</span>
        </summary>
        <div class="more-body">
          {#if reading.noticed.length > 0}
            <!-- WHAT SLASH NOTICED, in the one hue that means Slash's own lines (`live`). Each is the record's own
                 reading of how this BrainDog is used, a sentence a person reads whole. With nothing noticed it is not
                 drawn, and the fold's line does not name it. -->
            <Tile class="section" data-surface="tile" title={words.noticed} count={reading.noticed.length || undefined}>
              <div class="section-body">
                <ul class="ledger ledger-lead slash-list">
                  {#each reading.noticed as n (`${n.kind}:${n.subject}`)}
                    <li class="slash-noticed">
                      <div class="line line-tall">
                        <span class="line-mark"><IconWell name="slash" size="l" tone="live" /></span>
                        <span class="line-main"><span class="line-title slash-wrap slash-sentence">{n.text}</span></span>
                      </div>
                    </li>
                  {/each}
                </ul>
              </div>
            </Tile>
          {/if}

          <!-- WHAT YOU ANSWERED, UNDER ITS OWN HEADING: each still opens its question on Decide, where the answer is. -->
          {#if settled.length > 0}
            <Tile class="section" data-surface="tile" title={pageWords.answeredTitle} count={settled.length || undefined}>
              <div class="section-body">
                <ul class="ledger ledger-lead slash-list">
                  {#each settled as s (s.href ?? s.question)}
                    {@const by = byLine(s.by)}
                    <li class="slash-suggestion" data-state={s.state}>
                      {#snippet body()}
                        <span class="line-mark"><IconWell name="check" size="l" tone="earn" /></span>
                        <span class="line-main">
                          <span class="line-title slash-question">{s.question}</span>
                          {#if s.taken}<span class="line-detail">{s.taken}</span>{/if}
                          {#if by}<span class="line-detail">{by}</span>{/if}
                        </span>
                      {/snippet}
                      {#if s.href}
                        <a class="line" href={at(s.href)}>{@render body()}<span class="line-when">{words.open}</span></a>
                      {:else}
                        <div class="line">{@render body()}</div>
                      {/if}
                    </li>
                  {/each}
                </ul>
              </div>
            </Tile>
          {/if}

          {#if modelHere && lately && lately.length > 0}
            <!-- WHAT YOU ASKED LATELY, each line reopening its proposal on Decide or asking its question again at the top.
                 Nothing asked yet is not drawn, as the fold's line does not name it. -->
            <Tile class="section" data-surface="tile" title={askWords.lately} count={lately.length || undefined}>
              <div class="section-body">
                <ul class="ledger ledger-lead slash-list">
                  {#each lately as line (line.id)}
                    <li class="slash-lately">
                      <div class="line">
                        <span class="line-mark"><IconWell name="history" size="l" /></span>
                        <span class="line-main"><span class="line-title slash-question">{line.question}</span></span>
                        <span class="line-when">{line.when}{line.refused ? `, ${askWords.refused}` : ''}</span>
                        <span class="line-verbs">
                          {#if line.href}
                            <Button size="sm" href={line.href}>{askWords.open}</Button>
                          {:else}
                            <Button size="sm" disabled={asking} onclick={() => askAgain(line.question)}>{askWords.again}</Button>
                          {/if}
                        </span>
                      </div>
                    </li>
                  {/each}
                </ul>
              </div>
            </Tile>
          {/if}

          {#if tally || reading.daily}
            <div class="tiles">
              {#if tally}
                <!-- THE ONE FIGURE: every suggestion by where it stands, one bar, and the line that reads it. -->
                <Tile icon="decide" title={pageWords.tileTitle} meta={pageWords.tileMeta}>
                  <p class="figure num">{tally.total}<span class="figure-unit">{pageWords.unit(tally.total)}</span></p>
                  <Stacked parts={tally.parts} subject={pageWords.tileTitle} />
                  <p class="reading">{tally.reading}</p>
                </Tile>
              {/if}
              {#if reading.daily}<SlashDaily daily={reading.daily} />{/if}
            </div>
          {/if}

          {#if reading.model !== null}
            <!-- THE DESCRIPTION'S DRAFTS ARE DRAWN HERE, as a page's own "Change this page" draws them: each as the
                 pages it would make, beside the pages as they are, kept, asked on Decide or dropped from here. -->
            <Tile class="section" data-surface="tile" title={changeWords.describeTitle}>
              <div class="section-body">
                <AskPage
                  model={true}
                  onkept={async () => {
                    await load();
                  }}
                />
              </div>
            </Tile>
          {/if}
        </div>
      </details>
    {/if}

    {#if PageJobs}<PageJobs />{/if}

    {#if drafts}
      <!-- WHO DRAFTS, ONCE, AT THE FOOT: a fact about the host, linked to where a model is set up or changed. -->
      <p class="slash-drafts"><a class="slash-drafts-link" href={at(outOfAsks.settings)}>{drafts}</a></p>
    {/if}
  {/if}
</div>
{/if}

<style>
  /* ONE COLUMN, NARROWER THAN A LIST SCREEN'S: what is here is sentences and questions, and a line that runs the width of
     the window is a line nobody reads. */
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-6);
    padding: var(--sp-5) var(--gutter) var(--sp-9);
    max-inline-size: 60rem;
  }

  /* THE MODEL NOT ANSWERING, ABOVE THE ASK TILE: a sentence at the body size, its fault in the deeper red and in words. */
  .slash-engine {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }

  .slash-engine [data-needs] {
    color: var(--red);
    font-weight: var(--fw-medium);
  }

  /* TWO TILES SIDE BY SIDE AT A DESK, 12 apart, one over the other where two will not fit. */
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr));
    align-items: start;
    gap: var(--sp-3);
  }

  .figure {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--fs-figure);
    font-weight: 600;
    line-height: 34px;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }

  .figure-unit {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 500;
    letter-spacing: 0;
  }

  /* THE ONE LINE THAT READS THE CHART. */
  .reading {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: 20px;
  }

  .slash-said,
  .slash-hint {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
  }

  .slash-hint {
    margin-block-end: var(--sp-2);
  }

  /* THE EMPTY TILE'S SENTENCE, in the ink at the reading measure: it is what this screen says, not a footnote. */
  .slash-empty {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 20px;
  }

  /* ONE THING TO TRY, a quiet line that asks the example in the Ask tile: a press, drawn as words and not as a button. */
  .slash-try {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    align-self: flex-start;
    padding: 0;
    border: 0;
    background: none;
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-meta);
    font-weight: 500;
    text-align: start;
    cursor: pointer;
  }

  .slash-try:hover:not(:disabled) span {
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  /* WHO DRAFTS, at the foot of the screen in the quietest ink, a link to the setting that changes it. */
  .slash-drafts {
    margin: 0;
    max-inline-size: var(--measure);
    font-size: var(--fs-cap);
    line-height: 16px;
  }

  .slash-drafts-link {
    color: var(--ink-3);
    text-decoration: none;
  }

  /* A THUMB'S TARGET, like every other link on a phone, without growing the line at rest on a mouse. */
  @media (pointer: coarse) {
    .slash-drafts-link {
      display: inline-flex;
      align-items: center;
      min-block-size: var(--tap);
    }
  }

  .slash-drafts-link:hover,
  .slash-drafts-link:focus-visible {
    color: var(--ink-2);
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  /* WHAT THE LAST PRESS LEFT OFF, under the list it pressed: a quiet heading, not a tile of its own. */
  .slash-sub {
    margin: var(--sp-4) 0 var(--sp-1);
    padding-inline: var(--sp-2);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: 600;
  }

  /* ── the fold ─────────────────────────────────────────────────────────── */

  /* ONE QUIET LINE AT REST: a chevron, "More from Slash", and what is inside in the dim ink. No tile, no box. */
  .more-summary {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px var(--sp-2);
    inline-size: fit-content;
    max-inline-size: 100%;
    padding: var(--sp-2);
    border-radius: var(--r-pop);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: 18px;
    list-style: none;
    cursor: pointer;
  }

  .more-summary::-webkit-details-marker {
    display: none;
  }

  @media (hover: hover) and (pointer: fine) {
    .more-summary:hover {
      background: var(--row-wash, var(--hover));
    }
  }

  @media (pointer: coarse) {
    .more-summary {
      min-block-size: var(--tap);
      align-items: center;
    }
  }

  .more-icon {
    display: grid;
    align-self: center;
    color: var(--ink-3);
    transition: rotate 120ms ease;
  }

  .more[open] .more-icon {
    rotate: 90deg;
  }

  @media (prefers-reduced-motion: reduce) {
    .more-icon {
      transition: none;
    }
  }

  .more-title {
    color: var(--ink);
    font-weight: 600;
  }

  .more-said {
    min-inline-size: 0;
    color: var(--ink-3);
  }

  .more-body {
    display: flex;
    flex-direction: column;
    gap: var(--sp-6);
    margin-block-start: var(--sp-4);
  }

  /* ── the Ask tile ─────────────────────────────────────────────────────── */

  .slash-ask {
    display: flex;
    flex-direction: column;
  }

  .slash-ask-label {
    max-inline-size: var(--measure);
    font-weight: 400;
  }

  /* THE FIELD AND ITS PRESS ON ONE LINE: the field takes the room, the pill with its key cap at the end. */
  .slash-ask-row {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .slash-ask-row .field {
    flex: 1 1 auto;
    min-inline-size: 0;
  }

  .slash-ask-go {
    flex: none;
  }

  /* THE ANSWER, UNDER A HAIRLINE ONCE THERE IS ONE: what was asked, where Slash looked, the rows, then Slash's sentence
     beside its face, the model, and the fold. One column, top to bottom. */
  .slash-answer {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .slash-answer {
    padding-block-start: var(--sp-4);
    border-block-start: 1px solid var(--sep, var(--rule));
  }

  .slash-asked {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-2);
    margin: 0;
  }

  .slash-asked-said {
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .slash-asked-q {
    min-inline-size: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 600;
    line-height: 20px;
    overflow-wrap: anywhere;
  }

  /* THE SOURCE LINE: where what it read came from and how many, in meta with the rows glyph, before any of Slash's words. */
  .slash-source {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: 18px;
    overflow-wrap: anywhere;
  }

  .slash-source :global(.icon) {
    flex: none;
    color: var(--ink-3);
  }

  .slash-source-n {
    color: var(--ink-3);
    font-variant-numeric: tabular-nums;
  }

  .slash-rows {
    margin-block: calc(-1 * var(--sp-1));
  }

  .slash-row-go {
    display: grid;
    place-items: center;
    color: var(--ink-3);
  }

  /* SLASH'S SENTENCE, BESIDE ITS FACE: an answer is somebody's, and the model that drew it is named under it. */
  .slash-second {
    display: grid;
    grid-template-columns: var(--well) minmax(0, 1fr);
    align-items: start;
    gap: var(--sp-3);
  }

  .slash-second-words {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-inline-size: 0;
    padding-block-start: 4px;
  }

  .slash-text {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: 22px;
    overflow-wrap: anywhere;
  }

  .slash-second-do {
    display: flex;
  }

  /* THE CARD IN PLACE, its own container as in the palette, washed while Enter in the field is its answer. */
  .slash-card {
    container-type: inline-size;
    padding: var(--sp-3);
    border-radius: var(--r-pop);
  }

  .slash-card:empty {
    display: none;
  }

  .slash-card[data-armed] {
    background: var(--hover);
  }

  .slash-card > :global(.queue-card) {
    padding-block: 0;
    border-block-start: 0;
  }

  /* `23 §8`'s footer: receded and small, but always there. */
  .slash-model {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
    overflow-wrap: anywhere;
  }

  .slash-fold {
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .slash-fold ul {
    margin: var(--sp-2) 0 0;
    padding-inline-start: var(--sp-4);
    overflow-wrap: anywhere;
  }

  .slash-summary {
    inline-size: fit-content;
    color: var(--ink-2);
    font-weight: 500;
    cursor: pointer;
  }

  /* ── the lists ────────────────────────────────────────────────────────── */

  /* A ROW THAT IS NOT A LINK STILL TAKES THE WASH under the pointer, and the hairlines either side step
     aside so the fill is one shape. */
  @media (hover: hover) and (pointer: fine) {
    .slash-list > li:hover > div.line {
      background: var(--row-wash, var(--hover));
    }

    .slash-list > li:hover > .line::after,
    .slash-list > li:hover + li > .line::after {
      opacity: 0;
    }
  }

  /* A SENTENCE IS READ WHOLE: what Slash noticed and why a suggestion was left off wrap, rather than end in an ellipsis. */
  .slash-wrap {
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
  }

  .slash-sentence {
    font-weight: 400;
    line-height: 22px;
  }

  .slash-noticed .line,
  .slash-list .line-tall {
    padding-block: var(--sp-2);
  }

  /* A STATE IS A 6PX DOT AND ITS WORD: ink for new, which is his to put on Decide, and amber for one
     waiting there on him. */
  /* WRAPS ON A PHONE: the state and who drafted it are one line at 1440 and two beside a button at 390, never clipped. */
  .slash-state {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0 6px;
  }

  .dot {
    flex: none;
    inline-size: 6px;
    block-size: 6px;
    border-radius: var(--r-ctl);
    background: var(--ink);
  }

  .dot[data-state='waiting'] {
    background: var(--warn-fill);
  }

  /* WHO DRAFTED IT, after the state and a middle dot, in the same quiet line. */
  .slash-by::before {
    content: '·';
    margin-inline-end: 6px;
    color: var(--ink-3);
  }

  .slash-suggestion[data-state='answered'] .slash-question {
    color: var(--ink-2);
  }

  @media (width < 900px) {
    .page,
    .more-body {
      gap: var(--sp-5);
    }

    .page {
      padding: var(--sp-4) var(--gutter) var(--sp-8);
    }
  }

  /**
   * AT PHONE WIDTH THE PRESS IS FULL WIDTH UNDER THE FIELD, so a thumb reaches it from either side of the screen; and a
   * row keeps its well beside two lines rather than taking `rows.css`'s card, whose main column moves under an id these
   * rows do not have.
   */
  @media (width < 640px) {
    .slash-ask-row {
      flex-direction: column;
      align-items: stretch;
    }

    .slash-ask-go {
      display: grid;
    }

    .slash-list .line,
    .slash-rows .line {
      grid-template-columns: var(--well-l) minmax(0, 1fr) auto;
      gap: 2px var(--sp-3);
    }

    .slash-list .line-mark,
    .slash-rows .line-mark {
      grid-column: 1;
      grid-row: 1 / span 2;
      align-self: start;
    }

    .slash-list .line-main,
    .slash-rows .line-main {
      grid-column: 2;
      grid-row: 1;
    }

    .slash-list .line-when {
      grid-column: 2;
      grid-row: 2;
      justify-content: flex-start;
    }

    .slash-list .line-verbs,
    .slash-row-go {
      grid-column: 3;
      grid-row: 1 / span 2;
      align-self: center;
    }
  }
</style>
