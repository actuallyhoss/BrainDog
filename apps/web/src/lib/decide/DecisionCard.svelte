<!--
  ONE DECISION CARD, EVERYWHERE A QUESTION IS ANSWERED (DIRECTION §37): Home, Money, Work, a project's page, the Agents
  page and Decide (through `QueueAnswer.svelte`), Today's classic list (`home/Question.svelte`), Decide's classic screen
  (`Classic.svelte`) and Slash's palette. What it says is `card.ts`'s; this draws it and answers it.

  WHY FIRST. The question, then at once why it is asked, on every card. Then who asked, by face and name, with the app it
  ran in and the run, then what it moves: the money accepting writes and what changes from what to what, where the
  record says. The ways to answer come last, in the renderer's own classes (`kinds/queue.css`), so the suggested one is
  an outline with a small dot (his pick), on every card; where the choice is hard to undo or money moves, Enter alone
  is taken away and the button that names the amount is the answer.

  ONE PRESS ANSWERS, WITH UNDO. The card becomes its answered line at once ("Per seat · you, just now", or "Slash
  suggested · Sam accepted" for what Slash drafted), with Undo on it for six seconds, and only then is the answer sent
  (`press.ts` `hold`). Leaving the page, or the card leaving it, sends what was held at once. A record on an older build
  that still wants a reason opens one line under the card when the answer reaches it; nothing here asks for one first.

  A MERGE IS THE SAME CARD with `MergeCard` for its answers (Merge all, Keep apart, Pick), read off the record's own
  options question (`merge.ts`), and held for its Undo the same way.

  A HOST THAT ANSWERS FOR ITSELF hands `onpress` (Decide's classic screen, which keeps its own reason flow), and the
  card then only draws the press. A READER WHO MAY NOT ANSWER reads the options as words: a control that cannot act is
  absent, not greyed (`19 §6`).
-->
<script module lang="ts">
  /* EVERY CARD'S IDS ARE ITS OWN, so two queues on one page holding the same question never share a field's id. */
  let made = 0;
</script>

<script lang="ts">
  import '@braindog/skin/kinds/queue.css';
  import { tick, untrack } from 'svelte';
  import { page as route } from '$app/state';
  import { invalidateAll } from '$app/navigation';
  import { QUEUE_REASONS, queueReasoned, since } from 'braindog-render';
  import type { QueueQuestion } from '@braindog/kernel';
  import { apiBase, at } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { COMMENT_MOST, sayComment } from '$lib/record/comments.ts';
  import { answerQuestion } from '$lib/record/decide-write.ts';
  import { may as mayOf } from '$lib/record/may.ts';
  import Button from '$lib/ui/Button.svelte';
  import Face from '$lib/ui/Face.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { queueWords, type Way } from '$lib/page/queue-answer.ts';
  import LeadPreview from '$lib/page/LeadPreview.svelte';
  import type { Picked } from '$lib/page/picked.svelte.ts';
  import { words as pageWords } from '$lib/page/words.ts';
  import { words as decide } from '../../routes/decide/words.ts';
  import type { Press } from '../../routes/decide/merge.ts';
  import { hold, type Held } from '../../routes/decide/press.ts';
  import MergeCard from '../../routes/decide/MergeCard.svelte';
  import { answeredLine, cardOf, cardWords } from './card.ts';

  let {
    question,
    onanswered = () => {},
    pick = null,
    lead = false,
    n = 0,
    keys = false,
    link = false,
    whole = true,
    may,
    onpress,
    idOf,
  }: {
    question: QueueQuestion;
    /** Once the answer is written: the host lowers its count. */
    onanswered?: () => void;
    /** The page's choice of questions to answer at once: the card leads with its box only where a page holds one. */
    pick?: Picked | null;
    /** The queue's lead question, drawn whole: what accepting it does, and what it would put on the screen. */
    lead?: boolean;
    /** Where the card sits in its queue: only the first says each option's reason in the open (`queueReasoned`). */
    n?: number;
    /** Whether each option carries the number key that presses it, on a host whose keys do. */
    keys?: boolean;
    /** Whether the question is a link to its own page, where the host has no other door to it. */
    link?: boolean;
    /** Whether the card offers "See what it changes"; a host with its own door to the question says no. */
    whole?: boolean;
    /** Whether this reader may answer, where the host knows better than the shell. */
    may?: boolean | undefined;
    /** A host that answers for itself: the press is handed over and the card writes nothing. */
    onpress?: ((key: string) => void) | undefined;
    /** The id an option's button carries, where a host's keys find it by one. */
    idOf?: ((key: string) => string) | undefined;
  } = $props();

  const uid = `dc-${(made += 1)}`;

  /* THE SHELL THE LAYOUT DREW, read as partial because a page drawn outside the signed-in shell carries no `me`. */
  const shell = $derived(route.data as unknown as Partial<Shell>);
  const me = $derived(shell.me ?? null);
  const names = $derived(new Map(Object.entries(shell.names ?? {})));
  const answerable = $derived(may ?? (me !== null && (me.owner || mayOf({ me }, 'decide'))));
  /* THE READER BY THE NAME THE RECORD GIVES THEM, for the line a Slash proposal leaves ("Slash suggested · Sam accepted"). */
  const person = $derived((me?.person ? names.get(me.person) : undefined)?.trim() || copy.feedYou);

  const card = $derived(cardOf(question, { me: me?.person ?? null, names, now: Date.now(), lead }));
  const from = $derived([card.by.app, card.by.run].filter((s): s is string => s !== null));
  const reasoned = $derived(queueReasoned(n));
  const reasons = $derived(reasoned ? [] : card.ways.filter((w) => w.because !== ''));
  const chosenForAll = $derived(pick?.has(question.id) ?? false);
  const bulkFix = $derived(pick?.fixes.get(question.id) ?? '');
  const optId = (key: string): string => idOf?.(key) ?? `${uid}-opt-${key}`;

  /**
   * WHERE THE CARD IS. `open` offers the options; `asking` has one chosen and the reason line open under it, for a record
   * that still keeps one; `answered` is the one line the card becomes, with Undo on it while the answer is held.
   */
  let phase = $state<'open' | 'asking' | 'answered'>('open');
  let chosen = $state<Way | null>(null);
  let reason = $state('');
  let fix = $state('');
  let answeredAt = $state('');
  /* THE LINE A MERGE LEAVES ("Merged into Ana"), in place of the option's own words. */
  let mergeLine = $state('');
  /* ONE WRITE IN FLIGHT, so a double press answers once. The options are not disabled for it: a pressed
     button that turns disabled drops the focus it holds to the page. */
  let busy = $state(false);
  /** The answer held for its Undo, or `null` once it has gone or was taken back. */
  let holding = $state<Held | null>(null);

  let field = $state<HTMLInputElement | null>(null);
  let done = $state<HTMLParagraphElement | null>(null);

  const line = $derived(
    chosen === null ? '' : mergeLine || answeredLine(card, chosen, person, since(answeredAt || new Date().toISOString(), Date.now())),
  );

  /* A NOTE, AFTER A DECLINE: offered in the line the card became, opened only by its press, and kept with the question as
     a comment on it, in Decide's own words. */
  let note = $state<'shut' | 'open' | 'kept'>('shut');
  let noteBody = $state('');
  let noteFix = $state('');
  let noteBusy = $state(false);
  let noteField = $state<HTMLInputElement | null>(null);

  async function openNote() {
    note = 'open';
    await tick();
    noteField?.focus();
  }

  async function sendNote(e: SubmitEvent) {
    e.preventDefault();
    const body = noteBody.trim();
    if (noteBusy) return;
    if (body === '') return void noteField?.focus();
    noteBusy = true;
    noteFix = '';
    try {
      const out = await sayComment(apiBase(), { on: `suggestion:${question.id}`, body });
      if (out.ok) note = 'kept';
      else noteFix = out.fix;
    } finally {
      noteBusy = false;
    }
  }

  /**
   * The answer, sent. `said` is the reason, or nothing when nobody has been asked for one.
   *
   * A REFUSAL THAT WANTS A REASON OPENS THE LINE and says nothing else, because the line is the whole answer to it. Any
   * other refusal puts the card back with the record's own sentence under it, and a row that moved since the question
   * was filed is said as that, with nothing written and the whole change one link away.
   */
  async function send(way: Way, said?: string) {
    if (busy) return;
    busy = true;
    fix = '';
    try {
      const out = await answerQuestion(apiBase(), question.id, way.key, said);
      if (out.from === 'written') {
        phase = 'answered';
        onanswered();
        /* AND THE RAIL'S COUNT FOLLOWS: the write dropped the kept `boot` (`decide-write.ts`), and the layout reads it
           again. `/p/<slug>` reads its body by its slug and not from the layout, so there this does not read the card away. */
        void invalidateAll();
        return;
      }
      mergeLine = '';
      if (out.from === 'refused' && out.wants === 'reason') {
        phase = 'asking';
        await tick();
        reveal();
        return;
      }
      phase = 'open';
      fix = out.from === 'conflict' ? queueWords.moved : out.fix;
    } finally {
      busy = false;
    }
  }

  /**
   * ONE PRESS: the card becomes its answered line at once, focused, with Undo on it, and the answer waits six seconds
   * before it goes. A second press while one is held does nothing.
   */
  async function answer(way: Way, said = '') {
    if (busy || holding !== null) return;
    chosen = way;
    mergeLine = said;
    answeredAt = new Date().toISOString();
    phase = 'answered';
    holding = hold(() => {
      holding = null;
      void send(way);
    });
    await tick();
    done?.focus();
  }

  /** Undo, while the answer is held: the card comes back as it was, focus on the answer that was pressed. */
  async function undo() {
    const was = holding;
    if (!was?.undo()) return;
    holding = null;
    phase = 'open';
    mergeLine = '';
    const key = chosen?.key;
    await tick();
    if (key) document.getElementById(optId(key))?.focus();
  }

  /** An option pressed. With the reason line open it changes the choice and keeps the words already typed. */
  function press(way: Way) {
    if (busy || holding !== null) return;
    if (onpress) return onpress(way.key);
    if (phase === 'asking') {
      chosen = way;
      return reveal();
    }
    void answer(way);
  }

  /** A merge's press, with the line it leaves (`MergeCard`). */
  function pressMerge(p: Press, said: string) {
    const way = card.ways.find((w) => w.key === p.option);
    if (!way) return;
    if (onpress) return onpress(way.key);
    void answer(way, said);
  }

  /** The option at `i` (from 0), as its number key presses it; a reader who may not answer presses nothing. */
  export function choose(i: number): boolean {
    const way = card.ways[i];
    if (!way || !answerable || phase === 'answered' || card.merge !== null) return false;
    press(way);
    return true;
  }

  /**
   * The answer Enter gives (`card.ts` `enter`): the suggested one, or Accept, and none where it is hard to undo or money
   * moves. `false` when there is none to give.
   */
  export function accept(): boolean {
    const way = card.ways.find((w) => w.key === card.enter);
    if (!way || !answerable || phase === 'answered') return false;
    press(way);
    return true;
  }

  /** Whether the card is answered, held for its Undo or sent. */
  export function answered(): boolean {
    return phase === 'answered';
  }

  /**
   * A BLANK LINE IS NOT SENT. `writeDecision` would refuse it in Decide's sentence, which promises a button that turns on,
   * and this Send is never off; so the field keeps the focus instead, and `required` lets the browser say why.
   */
  function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!chosen) return;
    if (reason.trim() === '') return reveal();
    phase = 'answered';
    answeredAt = new Date().toISOString();
    void send(chosen, reason);
  }

  /* ESC PUTS THE LINE AWAY and hands focus back to the option it was opened for, as nothing was sent. */
  function onkeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    phase = 'open';
    fix = '';
    const key = chosen?.key;
    void tick().then(() => key && document.getElementById(optId(key))?.focus());
  }

  /**
   * THE LINE IS FOCUSED AND KEPT ABOVE THE KEYBOARD. Its scroll margins clear the sticky bar and `--kb`, the keyboard's
   * height written at run time (`lib/a11y/keyboard.ts`), so on a phone the field and Send stay in sight while typing.
   */
  function reveal() {
    field?.focus({ preventScroll: true });
    field?.scrollIntoView({ block: 'nearest' });
  }

  /* A CARD THAT LEAVES THE PAGE SENDS WHAT IT HELD, and so does a tab that is closed: the answer given is still the
     reader's. */
  $effect(() => {
    const leave = () => untrack(() => holding)?.flush();
    window.addEventListener('pagehide', leave);
    return () => {
      window.removeEventListener('pagehide', leave);
      leave();
    };
  });

  /* AND AGAIN ONCE THE KEYBOARD HAS OPENED, because it arrives after the focus that summoned it and `--kb` grows then. */
  $effect(() => {
    if (phase !== 'asking') return;
    const viewport = globalThis.visualViewport;
    if (!viewport) return;
    const again = () => {
      if (document.activeElement === field) field?.scrollIntoView({ block: 'nearest' });
    };
    viewport.addEventListener('resize', again);
    return () => viewport.removeEventListener('resize', again);
  });
</script>

{#if phase === 'answered' && chosen}
  <!-- ONE LINE, QUIET: what was chosen, by whom and when, where the card was, with Undo while the answer waits. -->
  <p class="qa-done" role="status" tabindex="-1" bind:this={done} data-held={holding ? '' : undefined}>
    <Face name={copy.feedYou} you size="s" /><span class="qa-done-words">{line}</span>
    {#if holding}
      <button type="button" class="qa-see qa-undo tap" onclick={undo}>{cardWords.undo}</button>
    {:else if chosen.key === 'reject' && note === 'shut' && !busy}
      <button type="button" class="qa-see qa-offer tap" onclick={openNote}>{decide.noteOffer}</button>
    {/if}
    {#if note === 'kept'}<span class="qa-done-words">{decide.noteKept}</span>{/if}
  </p>
  {#if note === 'open'}
    <form class="qa-reason" onsubmit={sendNote} aria-busy={noteBusy}>
      <label class="qa-label" for="{uid}-note">{decide.noteLabel}</label>
      <div class="qa-line">
        <span class="field field-lg qa-field">
          <input id="{uid}-note" class="field-input qa-input" type="text" autocomplete="off" enterkeyhint="send" maxlength={COMMENT_MOST} bind:value={noteBody} bind:this={noteField} />
        </span>
        <Button type="submit">{decide.noteSend}</Button>
      </div>
      {#if noteFix}<p class="qa-fix" role="status">{noteFix}</p>{/if}
    </form>
  {/if}
{:else}
  <article class={lead ? 'queue-card queue-lead dc' : 'queue-card dc'} aria-busy={busy} data-selected={chosenForAll ? '' : undefined}>
    {#if pick && answerable}
      <!-- THE BOX THE RENDERER'S QUEUE DRAWS FOR A BULK ANSWER, named for the question alone. `x` presses it from the
           keyboard (`PageBody.svelte`). -->
      <button
        type="button"
        role="checkbox"
        class="queue-select qa-select tap"
        aria-checked={chosenForAll}
        aria-label={pageWords.pick(card.question)}
        onclick={() => pick?.toggle(question)}><span aria-hidden="true">{chosenForAll ? '✓' : ''}</span></button
      >
    {/if}
    <!-- WHO ASKED, WHERE AND WHEN: the face and name, the app it ran in and the run, each only where it has a name. -->
    <p class="queue-by">
      <Face name={card.by.name} kind={card.by.kind} size="s" /><span class="queue-who">{card.by.name}</span>
      {#each from as part, i (i)}<span class="dc-from" dir="auto">{part}</span>{/each}
      <span class="queue-when">{card.when}</span>
    </p>
    <h3 class="queue-question" dir="auto">
      {#if link}<a class="dc-open" href={at(card.href)}>{card.question}</a>{:else}{card.question}{/if}{#if card.joined}{' '}<span
          class="qa-joined num">{queueWords.joined(card.joined)}</span
        >{/if}
    </h3>
    <!-- WHY, FIRST: under the question on every card, before what it moves and the ways to answer. -->
    {#if card.why}<p class="queue-why" dir="auto">{card.why}</p>{/if}
    {#if card.later}<p class="qa-later" dir="auto">{card.later}</p>{/if}
    {#if card.does}<ul class="queue-does"><li class="queue-does-line" dir="auto">{card.does}</li></ul>{/if}
    <!-- WHAT IT MOVES: the money accepting writes, and what changes from what to what. -->
    {#if card.money || card.shifts.length > 0}
      <ul class="dc-moves">
        {#if card.money}<li class="dc-money num">{card.money}</li>{/if}
        {#each card.shifts as s, i (i)}
          <li class="dc-shift">
            {#if s.what}<span class="dc-what">{s.what}</span>{/if}
            <span class="dc-before" dir="auto">{s.before}</span><span class="dc-to"><Icon name="arrow" size="s" /><span class="dc-said">{cardWords.to}</span></span><span dir="auto">{s.after}</span>
          </li>
        {/each}
      </ul>
    {/if}
    {#if card.seeWhole && whole && !link}
      <a class="qa-see tap" href={at(card.href)}>{queueWords.seeWhole}</a>
    {/if}
    {#if card.merge}
      <MergeCard merge={card.merge} {answerable} holding={busy ? '' : null} titleOf={(key) => card.ways.find((w) => w.key === key)?.label} onpress={pressMerge} />
    {:else}
      <ul class="queue-options">
        {#each card.ways as way, i (way.key)}
          {@const marked = way.recommended}
          <!-- THE SUGGESTION IS MARKED ON EVERY CARD, a hard one too: there only Enter is taken away (`card.ts`). -->
          <li class="queue-option" data-recommended={marked ? '' : undefined}>
            <!-- WHAT THE OPTION IS, in the renderer's own box and classes: a swatch writes its colour into `--swatch` on
                 its chip and nowhere else (`05 §5`), after `visualOf` held it to the renderer's reading. -->
            {#if way.shows && 'swatch' in way.shows}<span class="queue-visual" data-shows="swatch" aria-hidden="true"
                >{#each way.shows.swatch as colour}<span class="queue-swatch" style="--swatch:{colour}"></span>{/each}</span
              >{:else if way.shows}<span class="queue-visual" data-shows="figure"><span class="queue-figure num">{way.shows.figure}</span></span>{/if}
            <!-- THE SUGGESTION IS THE OUTLINE AND ITS DOT (`kinds/queue.css`); its word stays in the button's name for a
                 screen reader. The space keeps the label and the word two words. -->
            {#if answerable}
              <button
                type="button"
                class="queue-act"
                id={optId(way.key)}
                data-enter={way.key === card.enter ? '' : undefined}
                data-on={chosen?.key === way.key && phase === 'asking' ? '' : undefined}
                aria-pressed={phase === 'asking' ? chosen?.key === way.key : undefined}
                onclick={() => press(way)}
                >{#if keys && i < 9}<span class="queue-key dc-key" aria-hidden="true">{i + 1}</span>{/if}<span dir="auto">{way.label}</span
                >{#if marked}{' '}<span class="queue-rec">{queueWords.suggested}</span>{/if}</button
              >
            {:else}
              <span class="queue-label">{way.label}</span>
              {#if marked}<span class="queue-rec">{queueWords.suggested}</span>{/if}
            {/if}
            {#if reasoned && way.because}<span class="queue-because" dir="auto">{way.because}</span>{/if}
          </li>
        {/each}
      </ul>
    {/if}
    <!-- WHAT THE ANSWER COSTS SITS AFTER THE OPTIONS, at the end of their row, as the renderer draws it. -->
    {#if card.band}<span class="queue-cost" data-cost={card.cost}>{card.band}</span>{/if}
    {#if reasons.length > 0}
      <!-- EACH OPTION'S REASON, ON EVERY CARD BUT THE FIRST, folded one press away in the renderer's own fold. The
           question's own why is never in here: it is said first, above. -->
      <details class="queue-ways queue-reasons">
        <summary class="queue-ways-toggle">{QUEUE_REASONS}</summary>
        <ul class="queue-reasons-list">
          {#each reasons as way (way.key)}<li class="queue-reason" dir="auto"><span class="queue-reason-label">{way.label}</span> {way.because}</li>{/each}
        </ul>
      </details>
    {/if}
    {#if phase === 'asking' && chosen}
      <form class="qa-reason" onsubmit={submit}>
        <label class="qa-label" for="{uid}-why">{queueWords.why}</label>
        <div class="qa-line">
          <span class="field field-lg qa-field">
            <input id="{uid}-why" class="field-input qa-input" type="text" autocomplete="off" enterkeyhint="send" required bind:value={reason} bind:this={field} {onkeydown} />
          </span>
          <Button type="submit">{queueWords.send}</Button>
        </div>
      </form>
    {/if}
    {#if fix || bulkFix}<p class="qa-fix" role="status">{fix || bulkFix}</p>{/if}
  </article>
  {#if lead}<LeadPreview id={question.id} kind={card.filed} />{/if}
{/if}

<style>
  /* A FACE IN THE BY-LINE sits on the line's middle, not its baseline, or the disc rides above the words. */
  .queue-by {
    align-items: center;
    flex-wrap: wrap;
    column-gap: var(--sp-2);
  }

  /* THE APP AND THE RUN, after the name and quieter than it, each giving way in an ellipsis before the time does. */
  .dc-from {
    min-inline-size: 0;
    max-inline-size: 24ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dc-from::before {
    content: '·';
    margin-inline-end: var(--sp-2);
    color: var(--dim);
  }

  /* The question as the door to its own page, where the host has no other: ink, underlined only under the pointer. */
  .dc-open {
    color: inherit;
    text-decoration: none;
  }

  @media (hover: hover) and (pointer: fine) {
    .dc-open:hover {
      text-decoration: underline;
      text-decoration-color: color-mix(in srgb, var(--ink) 40%, transparent);
      text-underline-offset: 3px;
    }
  }

  /* WHY IS READ, NOT SKIMMED: body size and air, in the second ink, at a measure. */
  .dc > .queue-why {
    font-size: var(--t-base);
    line-height: var(--lh-body);
  }

  /* WHAT IT MOVES, a short list without a box: the amount in figures, then each change from what to what. */
  .dc-moves {
    display: grid;
    gap: var(--sp-1);
    max-inline-size: var(--measure);
    margin: 0;
    padding: 0;
    list-style: none;
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .dc-money {
    color: var(--ink);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  .dc-shift {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-1) var(--sp-2);
    min-inline-size: 0;
  }

  .dc-what {
    color: var(--dim);
  }

  .dc-what::first-letter {
    text-transform: uppercase;
  }

  .dc-before {
    text-decoration: line-through;
    text-decoration-color: color-mix(in srgb, var(--ink2) 50%, transparent);
  }

  .dc-to {
    display: inline-flex;
    color: var(--dim);
  }

  /* "to", for a screen reader: the arrow says it to the eye. */
  .dc-said {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* AN ANSWER IS A PILL, and a long one wraps inside it rather than pushing the card sideways. */
  .queue-act {
    border-radius: var(--r-pill);
    padding-inline: var(--sp-4);
    white-space: normal;
    text-align: start;
    overflow-wrap: anywhere;
  }

  /* THE OPTION THE REASON IS FOR, while the line is open: the selected surface and an ink edge, a shape and not a shade. */
  .queue-act[data-on] {
    background: var(--selected);
    border-color: var(--ink2);
  }

  /* NO KEY CAPS UNDER A THUMB: there is no keyboard to press them with. */
  @media (pointer: coarse) {
    .dc-key {
      display: none;
    }
  }

  /* THE BULK BOX IS A SECONDARY CONTROL, drawn on hover or focus of its card (DIRECTION §35), and on every card once one
     is chosen so the choice can be widened; under a thumb, where nothing hovers, it is always there. */
  @media (hover: hover) and (pointer: fine) {
    .qa-select {
      opacity: 0;
      transition: opacity var(--d-state) var(--ease-out);
    }

    .queue-card:hover > .qa-select,
    .queue-card:focus-within > .qa-select,
    :global([data-picking]) .qa-select,
    :global([data-row-cursor]) .qa-select,
    .qa-select[aria-checked='true'] {
      opacity: 1;
    }
  }

  /* A CARD CHOSEN FOR A BULK ANSWER keeps an ink edge, a shape and not a shade. */
  .queue-card[data-selected] {
    box-shadow: inset 0 0 0 1.5px var(--ink2);
  }

  /* HOW MANY THINGS A JOINED QUESTION CHANGES, quiet beside its words. */
  .qa-joined {
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 400;
    white-space: nowrap;
  }

  /* QUIET: the day a put-off question comes back is a note under it, in the second ink and the small size. */
  .qa-later {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .qa-see {
    justify-self: start;
    padding: 0;
    background: none;
    border: 0;
    font: inherit;
    color: var(--link);
    font-size: var(--t-sm);
    text-decoration: underline;
    text-decoration-color: color-mix(in srgb, var(--ink) 40%, transparent);
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
    cursor: pointer;
  }

  .qa-reason {
    display: grid;
    gap: var(--sp-2);
    margin-block-start: var(--sp-1);
  }

  .qa-label {
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .qa-line {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    align-items: center;
  }

  .qa-field {
    flex: 1 1 16ch;
    min-inline-size: 0;
  }

  /* CLEAR OF THE STICKY BAR ABOVE AND THE KEYBOARD BELOW, whichever way the field is scrolled to. */
  .qa-input {
    scroll-margin-block-start: calc(var(--sticky) + var(--sp-4));
    scroll-margin-block-end: calc(var(--kb) + var(--sp-4));
  }

  .qa-fix {
    max-inline-size: var(--measure);
    margin: 0;
    color: var(--danger-text);
    font-size: var(--t-sm);
  }

  /* ONE LINE, QUIET: what was chosen, by whom and when, where the card was. */
  .qa-done {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    align-items: center;
    min-block-size: var(--ctl-h);
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-base);
  }

  .qa-done-words {
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }

  /* UNDO IS THE LINE'S ONE CONTROL while the answer waits, in the ink a person presses. */
  .qa-undo {
    color: var(--ink);
    font-weight: 500;
  }

  @media (pointer: coarse) {
    .qa-see {
      min-block-size: var(--tap);
    }
  }

  /* ON A NARROW SLOT Send takes the line's whole width under the field, so it is never pushed off the edge. */
  @container (inline-size < 30rem) {
    .qa-line > :global(.btn) {
      flex: 1 1 100%;
    }
  }
</style>
