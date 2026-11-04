<!--
  THE PROMPT, ONE PART FOR /start AND /signup: the box and its chips while the person types, the line of what
  was said once it is read, and the questions under it (`questionsOf`, `$lib/start/questions.ts`), at most two.

  MOVED AS IT IS from the two pages, so no look changes: the field at the size of a sentence in the well, the chips as
  `Button`'s pills, the said line a press that opens the words for editing, the question set off by a hairline. Where
  the sign-up page lights the words heard under the field, it hands the cut sentence in as `lit`.

  AN ANSWER IS A SENTENCE OF ITS OWN (`answerAsSaid`), typed or tapped, and handed up as `onmore(sentence, answered)`:
  the page joins it to what was said and reads it again (`more()`), and may lay the rules' answer on the reading at
  once (a name, a currency, a use case) with `answered`. Skip is a press, `onskip(about)`, and the page keeps it among
  what was asked, so it is never asked again.

  Its own CSS, in this route's chunk: nothing here is loaded by every screen.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { answerAsSaid, valueOf, words, type About, type Ask, type Tap } from '$lib/start/questions.ts';
  import Button from '$lib/ui/Button.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';

  type Cut = { text: string; became: string | null };

  let {
    id,
    value = $bindable(''),
    field = $bindable(),
    labelledby,
    placeholder,
    rows = 3,
    maxlength,
    lit = null,
    chips = [],
    chipsLabel,
    chipsHint,
    onchip,
    onsubmit,
    onkeydown,
    below,
    said = null,
    marks = null,
    editLabel,
    onedit,
    questions = [],
    busy = false,
    onmore,
    onskip,
  }: {
    /** What this prompt's ids start with, so two on a page never share one. */
    id: string;
    /** What is being typed. */
    value?: string;
    field?: HTMLTextAreaElement | undefined;
    /** The heading that names the field. */
    labelledby: string;
    placeholder: string;
    rows?: number;
    maxlength?: number | undefined;
    /** The words cut where each phrase heard sits, to light them under the field; none on /start. */
    lit?: readonly Cut[] | null;
    /** The starting points, added to the words by a tap; none to show none. */
    chips?: readonly string[];
    chipsLabel: string;
    /** A line said above the chips, which then names them. */
    chipsHint?: string | undefined;
    onchip: (chip: string) => void;
    onsubmit: () => void;
    onkeydown?: ((e: KeyboardEvent) => void) | undefined;
    /** The page's own row under the field: the other way in, and the press. */
    below?: Snippet | undefined;
    /** What was said, once it is read; until then, the box. */
    said?: string | null;
    /** The said words cut where each phrase heard sits, to mark them on the line. */
    marks?: readonly Cut[] | null;
    editLabel: string;
    onedit: () => void;
    /** The questions to ask now (`questionsOf`). */
    questions?: readonly Ask[];
    busy?: boolean;
    /** The answer as a sentence, and what it lays on the reading (`valueOf`), `null` for nothing to lay on. */
    onmore: (sentence: string, answered: { about: About; value: string | null }) => void;
    onskip: (about: About) => void;
  } = $props();

  /* WHAT IS TYPED UNDER EACH QUESTION, by what it is about. */
  let typed = $state<Record<string, string>>({});
  let litBox = $state<HTMLElement | undefined>(undefined);

  /* THE MARKS SCROLL WITH THE WORDS, since they sit under the field rather than in it. */
  function scrolled() {
    if (litBox && field) litBox.scrollTop = field.scrollTop;
  }

  /* WHAT IS LAID ON THE READING IS `valueOf`'s: a currency only as a code and a use case only as one of the taps, so a
     typed "my shop" or "dollars" goes as words to read again and never as a broken value. */
  function tap(q: Ask, c: Tap) {
    if (busy) return;
    onmore(answerAsSaid(q, c.label), { about: q.about, value: valueOf(q, c.value) });
  }

  function send(q: Ask) {
    const v = (typed[q.about] ?? '').trim();
    if (v === '' || busy) return;
    typed[q.about] = '';
    onmore(answerAsSaid(q, v), { about: q.about, value: valueOf(q, v) });
  }
</script>

{#if said === null}
  <form
    class="prompt"
    onsubmit={(e) => {
      e.preventDefault();
      onsubmit();
    }}
  >
    {#if lit}
      <!-- HER WORDS LIGHT UP AS SHE TYPES: the marks sit under the field, cut where each line heard says it is. -->
      <div class="lit-field">
        <!-- ONE LINE OF MARKUP: any space between these tags would be drawn, and the marks would drift off the words. -->
        <div class="lit" aria-hidden="true" bind:this={litBox}>{#each lit as r, i (i)}{#if r.became}<mark>{r.text}</mark>{:else}{r.text}{/if}{/each}{'\n'}</div>
        <textarea class="prompt-field over" {rows} {maxlength} autocomplete="off" aria-labelledby={labelledby} {placeholder} bind:this={field} bind:value {onkeydown} onscroll={scrolled}></textarea>
      </div>
    {:else}
      <textarea class="prompt-field" {rows} {maxlength} autocomplete="off" aria-labelledby={labelledby} {placeholder} bind:this={field} bind:value {onkeydown}></textarea>
    {/if}
    {#if chips.length > 0}
      {#if chipsHint}<p class="quiet" id="{id}-chips-h">{chipsHint}</p>{/if}
      <div class="chips" role="group" aria-label={chipsHint ? undefined : chipsLabel} aria-labelledby={chipsHint ? `${id}-chips-h` : undefined}>
        {#each chips as c (c)}
          <!-- A mouse press keeps focus in the field, so the caret stays where the words are going. -->
          <Button size="sm" onmousedown={(e: MouseEvent) => e.preventDefault()} onclick={() => onchip(c)}>{c}</Button>
        {/each}
      </div>
    {/if}
    {#if below}{@render below()}{/if}
  </form>
{:else}
  <!-- THE WORDS, MARKED WITH WHAT EACH PHRASE BECAME, and pressing them opens the whole of what was said for editing. -->
  <button type="button" class="said-line" disabled={busy} onclick={onedit}>
    <span class="said-text"
      >{#if marks}{#each marks as r, j (j)}{#if r.became}<mark class="said-mark" title={r.became}>{r.text}</mark>{:else}{r.text}{/if}{/each}{:else}{said}{/if}</span
    >
    <span class="said-edit">{editLabel}</span>
  </button>
{/if}

{#if questions.length > 0}
  <!-- ── THE QUESTIONS, two at most, each answered by a tap or by typing, and Skip a press ────────────── -->
  <div class="asks">
    <p class="ask-label">
      <IconWell name="ask" size="m" tone="danger" /><span class="ask-word">{questions.length === 1 ? words.one : words.two}</span><span class="ask-meta"
        >{questions.length === 1 ? words.cannotTell : words.cannotTellTwo}</span
      >
    </p>
    {#each questions as q (q.about)}
      <section class="ask" aria-labelledby="{id}-q-{q.about}">
        <h3 class="ask-q" id="{id}-q-{q.about}">{q.question}</h3>
        {#if q.choices.length > 0}
          <div class="chips" role="group" aria-labelledby="{id}-q-{q.about}">
            {#each q.choices as c (c.value)}
              <Button size="sm" disabled={busy} onclick={() => tap(q, c)}>{c.label}</Button>
            {/each}
          </div>
        {/if}
        <form
          class="ask-form"
          onsubmit={(e) => {
            e.preventDefault();
            send(q);
          }}
        >
          <div class="field ask-field">
            <input
              class="field-input"
              type="text"
              autocomplete={q.about === 'name' ? 'name' : 'off'}
              maxlength="60"
              aria-label="{words.answer}: {q.question}"
              placeholder={words.answer}
              disabled={busy}
              bind:value={typed[q.about]}
            />
            <Button size="sm" type="submit" disabled={busy || (typed[q.about] ?? '').trim() === ''}>{words.add}</Button>
          </div>
          <Button weight="bare" disabled={busy} onclick={() => onskip(q.about)}>{words.skip}</Button>
        </form>
      </section>
    {/each}
  </div>
{/if}

<style>
  .prompt {
    display: grid;
    gap: var(--sp-3);
  }

  /* THE ONE FIELD, drawn at the size of a sentence rather than a form row, in the well, and 16px so a phone does not
     zoom it. Its focus is the a11y layer's 2px ink ring. */
  .prompt-field {
    inline-size: 100%;
    box-sizing: border-box;
    padding: var(--sp-3) var(--sp-4);
    background: var(--tile-2);
    border: 0;
    border-radius: var(--r-pop);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
    line-height: calc(24px * var(--type, 1));
    resize: vertical;
    /* IT SCROLLS CLEAR OF THE PHONE'S KEYBOARD with the chips and the press under it still in view. */
    scroll-margin-block: var(--sp-6) var(--sp-9);
  }

  .prompt-field::placeholder {
    color: var(--ink-3);
  }

  /* THE FIELD AND ITS MARKS: the marks are the same words in the same box under a clear field, so the words heard
     light up where they are typed. Same padding, size, line and wrapping as the field, or the marks drift. */
  .lit-field {
    position: relative;
    background: var(--tile-2);
    border-radius: var(--r-pop);
  }

  /* A field takes the browser's own tracking, not the body's, and the marks under it take the body's: the same here,
     or every word drifts a little further from its mark. The gutter is kept on both, so a scrollbar wraps neither. */
  .prompt-field.over {
    position: relative;
    display: block;
    background: transparent;
    line-height: var(--lh-body);
    letter-spacing: inherit;
    scrollbar-gutter: stable;
  }

  .lit {
    position: absolute;
    inset: 0;
    overflow: hidden;
    padding: var(--sp-3) var(--sp-4);
    color: transparent;
    font-size: var(--fs-body);
    line-height: var(--lh-body);
    white-space: pre-wrap;
    overflow-wrap: break-word;
    scrollbar-gutter: stable;
    pointer-events: none;
  }

  .lit mark {
    border-radius: 4px;
    background: var(--chosen);
    color: transparent;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  /* THE CHOICES ARE `Button`'S QUIET PILLS, as every other choice on the screen is; the chosen one on the selected fill. */
  .chips :global(.btn[aria-pressed='true']) {
    background: var(--chosen);
    color: var(--ink);
    font-weight: 600;
  }

  /* A SENTENCE IN THE QUIET INK IS STILL A SENTENCE, read at the body size. */
  .quiet {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }

  .said-line {
    display: grid;
    gap: var(--sp-2);
    inline-size: 100%;
    min-block-size: var(--tap);
    padding: var(--sp-3) var(--sp-4);
    background: var(--tile-2);
    border: 0;
    border-radius: var(--r-pop);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
    line-height: var(--lh-body);
    text-align: start;
    cursor: text;
    transition: background var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .said-line:hover:not(:disabled) {
      background: var(--tile-2);
    }
  }

  .said-text {
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }

  /* THE LIFT REACHES PAST THE WORD AND THE WORD DOES NOT MOVE: a padding and the same margin back, so a phrase before
     a comma keeps its comma against it. */
  .said-mark {
    margin-inline: -3px;
    padding: 1px 3px;
    background: var(--tile);
    border-radius: var(--r-xs);
    color: var(--ink);
    font-weight: 500;
    box-decoration-break: clone;
  }

  .said-edit {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  /* ── the questions ─────────────────────────────────────────────────────── */

  /* THE QUESTIONS, set off from the conversation by a hairline above them, not a box. */
  .asks {
    display: grid;
    gap: var(--sp-4);
    padding-block-start: var(--sp-4);
    border-block-start: 1px solid var(--rule);
  }

  .ask {
    display: grid;
    gap: var(--sp-3);
  }

  .ask-label {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-3);
    margin: 0;
  }

  /* WAITING ON THE PERSON IS THE DEEPER RED, and always the word with it, never the colour alone. */
  .ask-word {
    color: var(--red);
    font-size: var(--fs-body);
    font-weight: 600;
  }

  .ask-meta {
    margin-inline-start: auto;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .ask-q {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 600;
  }

  .ask-form {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  .ask-field {
    flex: 1 1 16rem;
    min-inline-size: 0;
    padding-inline-end: var(--sp-1);
  }

  .ask-field .field-input {
    font-size: var(--fs-body);
  }

  /* EVERY PRESS HERE MEETS A THUMB: 44px on a coarse pointer. */
  @media (pointer: coarse) {
    .ask :global(.btn),
    .prompt .chips :global(.btn) {
      min-block-size: var(--tap);
    }
  }
</style>
