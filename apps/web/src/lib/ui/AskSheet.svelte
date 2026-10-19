<!--
  Ask yourself a question: the owner writes down a choice they mean to make, with its options and what each one looks
  like, and it waits on Decide to be answered with a reason like any other question.

  IT FILES AND DOES NOT ANSWER. The sheet writes an `options` question through `propose` (`askYourself` in
  `lib/record/decide-write.ts`), and the gate is where it is decided, so the reason is written when the choice is made
  and not in the moment it was asked.

  WHAT AN OPTION SHOWS IS PART OF THE OPTION: up to four colours, a figure, or a file the record already holds. The
  gate and the queue's tiles draw it inside that option's box, so a colour chosen here is never a colour the page is
  drawn in (`govern.ts` `showsOf`). A colour is picked with the platform's own picker, one 44px input a swatch, because
  a colour is judged by eye and a typed code would be a developer's word on a person's screen.

  MOUNTED BY DECIDE'S HEAD (`routes/decide/+page.svelte`), with `about` set when a page opens it.
-->
<script lang="ts">
  import Sheet from './Sheet.svelte';
  import Button from './Button.svelte';
  import Segmented from './Segmented.svelte';
  import { apiBase } from '../at.ts';
  import { ASK_MOST, askWords, askYourself, fileOf, type AskOption, type AskShows } from '../record/decide-write.ts';

  let {
    open,
    about = null,
    onclose,
    onfiled,
  }: {
    open: boolean;
    about?: string | null | undefined;
    onclose: () => void;
    onfiled: (id: string) => void;
  } = $props();

  type Kind = 'none' | 'swatch' | 'figure' | 'file';
  type Draft = { label: string; because: string; kind: Kind; swatch: string[]; figure: string; file: string };

  const KINDS: readonly Kind[] = ['none', 'swatch', 'figure', 'file'];
  /** The most colours a person picks for one option; the kernel keeps more for an agent, and four still read as one set. */
  const SWATCH_MOST = 4;

  const words = {
    title: 'Ask yourself a question',
    subtitle: 'It waits in Needs you until you answer it with a reason.',
    question: 'The question',
    questionHint: 'Which lining for the autumn coat?',
    why: 'Why it is asked',
    whyHelp: 'What makes it worth deciding, in a sentence or two.',
    options: 'The options',
    option: (n: number) => `Option ${n}`,
    label: 'Its name',
    because: 'Why you would pick it',
    shows: 'What it shows',
    kinds: { none: 'Nothing', swatch: 'Colours', figure: 'A figure', file: 'A file' } satisfies Record<Kind, string>,
    colour: (n: number) => `Colour ${n}`,
    addColour: 'Add a colour',
    removeColour: (n: number) => `Remove colour ${n}`,
    figure: 'The figure',
    figureHint: '4 weeks',
    file: 'The file',
    fileHelp: 'The row that holds it, then its field.',
    remove: (n: number) => `Remove option ${n}`,
    add: 'Add an option',
    suggest: 'Which do you suggest?',
    suggestNone: 'None of them',
    send: 'Ask the question',
    cancel: 'Cancel',
  } as const;

  const blank = (): Draft => ({ label: '', because: '', kind: 'none', swatch: [], figure: '', file: '' });

  let question = $state('');
  let why = $state('');
  let drafts = $state<Draft[]>([blank(), blank()]);
  let suggested = $state<number | null>(null);
  let busy = $state(false);
  let fault = $state<{ fix: string; at?: string } | null>(null);

  /**
   * A NEW COLOUR TAKES THE PICKER'S OWN FIRST VALUE. An empty colour input shows the platform's default and reports it
   * only once somebody changes it, so a swatch nobody touched would be filed as nothing. Reading the value the input
   * settled on keeps what is drawn and what is sent the same, and keeps a colour literal out of this file.
   */
  function settle(node: HTMLInputElement, keep: (value: string) => void) {
    keep(node.value);
  }

  function pickKind(i: number, kind: Kind) {
    const d = drafts[i];
    if (!d) return;
    d.kind = kind;
    if (kind === 'swatch' && d.swatch.length === 0) d.swatch = [''];
  }

  function removeOption(i: number) {
    drafts = drafts.filter((_, j) => j !== i);
    /* THE SUGGESTION FOLLOWS ITS OPTION, not its place: removing one above it moves it up with the rest. */
    if (suggested === i) suggested = null;
    else if (suggested !== null && suggested > i) suggested -= 1;
  }

  /** What one draft shows, in the shape the kernel reads, or a fault naming the option. */
  function shownBy(d: Draft, n: number): { shows?: AskShows } | { fault: string } {
    if (d.kind === 'swatch') {
      const colours = d.swatch.filter((c) => c !== '');
      return colours.length > 0 ? { shows: { swatch: colours } } : {};
    }
    if (d.kind === 'figure') return { shows: { figure: d.figure } };
    if (d.kind === 'file') {
      const file = fileOf(d.file);
      return file ? { shows: { file } } : { fault: askWords.noFile(n) };
    }
    return {};
  }

  function close() {
    fault = null;
    onclose();
  }

  async function send(e?: SubmitEvent) {
    e?.preventDefault();
    if (busy) return;
    const options: AskOption[] = [];
    for (const [i, d] of drafts.entries()) {
      const read = shownBy(d, i + 1);
      if ('fault' in read) {
        fault = { fix: read.fault, at: `option-${i + 1}` };
        return;
      }
      options.push({ label: d.label, because: d.because, ...read });
    }
    busy = true;
    const out = await askYourself(apiBase(), { question, why, options, recommended: suggested, ...(about ? { about } : {}) });
    busy = false;
    if (out.from === 'refused') {
      fault = { fix: out.fix, ...(out.at ? { at: out.at } : {}) };
      return;
    }
    question = '';
    why = '';
    drafts = [blank(), blank()];
    suggested = null;
    fault = null;
    onfiled(out.id);
  }
</script>

<Sheet {open} title={words.title} subtitle={words.subtitle} onclose={close}>
  <form id="ask-form" class="ask" onsubmit={(e) => void send(e)} novalidate>
    <div class="ask-part">
      <label class="ask-label" for="ask-question">{words.question}</label>
      <div class="field">
        <input
          id="ask-question"
          class="field-input"
          type="text"
          autocomplete="off"
          placeholder={words.questionHint}
          bind:value={question}
          aria-invalid={fault?.at === 'question' ? 'true' : undefined}
          aria-describedby={fault?.at === 'question' ? 'ask-fault' : undefined}
        />
      </div>
    </div>

    <div class="ask-part">
      <label class="ask-label" for="ask-why">{words.why}</label>
      <textarea id="ask-why" class="ask-text" rows="2" spellcheck="true" bind:value={why} aria-describedby="ask-why-help"></textarea>
      <p class="ask-help" id="ask-why-help">{words.whyHelp}</p>
    </div>

    <fieldset class="ask-options">
      <legend class="ask-label">{words.options}</legend>
      {#each drafts as d, i (i)}
        {@const n = i + 1}
        {@const wrong = fault?.at === `option-${n}`}
        <!-- ONE CARD AN OPTION, stacked at every width: the sheet is one column already, and an option is read top to
             bottom, its name, why, and what it looks like. -->
        <section class="ask-option" aria-labelledby="ask-option-{n}" data-wrong={wrong ? '' : undefined}>
          <header class="ask-option-head">
            <h3 class="ask-option-title" id="ask-option-{n}">{words.option(n)}</h3>
            {#if drafts.length > 2}
              <Button weight="bare" onclick={() => removeOption(i)}>{words.remove(n)}</Button>
            {/if}
          </header>

          <label class="ask-label" for="ask-label-{n}">{words.label}</label>
          <div class="field">
            <input
              id="ask-label-{n}"
              class="field-input"
              type="text"
              autocomplete="off"
              bind:value={d.label}
              aria-invalid={wrong ? 'true' : undefined}
              aria-describedby={wrong ? 'ask-fault' : undefined}
            />
          </div>

          <label class="ask-label" for="ask-because-{n}">{words.because}</label>
          <textarea id="ask-because-{n}" class="ask-text" rows="2" spellcheck="true" bind:value={d.because}></textarea>

          <p class="ask-label" id="ask-shows-{n}">{words.shows}</p>
          <Segmented role="group" aria-labelledby="ask-shows-{n}">
            {#each KINDS as k (k)}
              <button type="button" class="segment" aria-pressed={d.kind === k} data-on={d.kind === k ? '' : undefined} onclick={() => pickKind(i, k)}>
                {words.kinds[k]}
              </button>
            {/each}
          </Segmented>

          {#if d.kind === 'swatch'}
            <div class="ask-swatches">
              {#each d.swatch as colour, j (j)}
                <span class="ask-swatch">
                  <input
                    class="ask-colour"
                    type="color"
                    aria-label="{words.option(n)}, {words.colour(j + 1)}"
                    value={colour}
                    use:settle={(v) => {
                      if (d.swatch[j] === '') d.swatch[j] = v;
                    }}
                    oninput={(e) => (d.swatch[j] = e.currentTarget.value)}
                  />
                  {#if d.swatch.length > 1}
                    <Button weight="bare" aria-label="{words.option(n)}, {words.removeColour(j + 1)}" onclick={() => (d.swatch = d.swatch.filter((_, k) => k !== j))}>
                      {words.removeColour(j + 1)}
                    </Button>
                  {/if}
                </span>
              {/each}
              {#if d.swatch.length < SWATCH_MOST}
                <Button weight="bare" onclick={() => (d.swatch = [...d.swatch, ''])}>{words.addColour}</Button>
              {/if}
            </div>
          {:else if d.kind === 'figure'}
            <label class="ask-label" for="ask-figure-{n}">{words.figure}</label>
            <div class="field">
              <input id="ask-figure-{n}" class="field-input num" type="text" autocomplete="off" maxlength="80" placeholder={words.figureHint} bind:value={d.figure} />
            </div>
          {:else if d.kind === 'file'}
            <label class="ask-label" for="ask-file-{n}">{words.file}</label>
            <div class="field">
              <input
                id="ask-file-{n}"
                class="field-input"
                type="text"
                autocomplete="off"
                spellcheck="false"
                bind:value={d.file}
                aria-describedby="ask-file-help-{n}"
              />
            </div>
            <p class="ask-help" id="ask-file-help-{n}">{words.fileHelp}</p>
          {/if}
        </section>
      {/each}
      {#if drafts.length < ASK_MOST}
        <div class="ask-more">
          <Button weight="bare" onclick={() => (drafts = [...drafts, blank()])}>{words.add}</Button>
        </div>
      {/if}
    </fieldset>

    <fieldset class="ask-suggest">
      <legend class="ask-label">{words.suggest}</legend>
      <label class="ask-pick">
        <input type="radio" name="ask-suggest" checked={suggested === null} onchange={() => (suggested = null)} />
        {words.suggestNone}
      </label>
      {#each drafts as d, i (i)}
        <label class="ask-pick">
          <input type="radio" name="ask-suggest" checked={suggested === i} onchange={() => (suggested = i)} />
          {d.label.trim() || words.option(i + 1)}
        </label>
      {/each}
    </fieldset>

    {#if fault}<p class="ask-fault" id="ask-fault" role="alert">{fault.fix}</p>{/if}
  </form>

  {#snippet footer()}
    <Button weight="bare" onclick={close}>{words.cancel}</Button>
    <Button weight="primary" disabled={busy} onclick={() => void send()}>{words.send}</Button>
  {/snippet}
</Sheet>

<style>
  .ask {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
  }

  .ask-part {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  /* THE LABEL SITS ABOVE ITS FIELD in the meta step and the second ink. */
  .ask-label {
    padding: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  .ask-help {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* A FIELD: the `--s1` fill with no border, radius `--r-md`, as `controls.css` draws `.field`. */
  .ask-text {
    inline-size: 100%;
    min-block-size: 40px;
    padding: var(--sp-2) var(--sp-3);
    background: var(--s1);
    border: 0;
    border-radius: var(--r-md);
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--t-ui);
    resize: vertical;
  }

  .ask-options,
  .ask-suggest {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    margin: 0;
    padding: 0;
    border: 0;
    min-inline-size: 0;
  }

  /* AN OPTION IS A GROUP ON THE SHEET, NOT A CARD IN IT (a tile never holds a tile), and its fields take the
     `--s1` fill a card would have hidden them in. A hairline over each, one below the next. The one that is wrong says so
     in its rule, its fields' `aria-invalid` and the alert under the form. */
  .ask-option {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding-block-start: var(--sp-4);
    border-block-start: 1px solid var(--line);
  }

  .ask-option[data-wrong] {
    border-block-start: 2px solid var(--danger);
  }

  .ask-option-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2);
  }

  .ask-option-title {
    margin: 0;
    font-family: var(--font-ui);
    font-size: var(--t-row);
    font-weight: 600;
  }

  .ask-swatches {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-3);
  }

  .ask-swatch {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
  }

  /* ONE PICKER A SWATCH, 44px at every width: the chip is the target, and a thumb has to land on it. */
  .ask-colour {
    inline-size: 44px;
    block-size: 44px;
    padding: 0;
    background: none;
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    cursor: pointer;
  }

  .ask-more {
    display: flex;
  }

  .ask-pick {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--ctl-h);
    color: var(--ink);
    font-size: var(--t-ui);
  }

  .ask-fault {
    margin: 0;
    color: var(--danger-text);
    font-size: var(--t-ui);
  }

  /* FULL SCREEN ON A PHONE. The bottom sheet is as tall as what it holds, so the form asks for the whole screen and
     the sheet stops at its own cap, with the form scrolling inside it and the footer's press above the keyboard. */
  @media (width < 900px) {
    .ask {
      min-block-size: 100dvh;
    }

    .ask-text {
      font-size: var(--t-md);
    }
  }
</style>
