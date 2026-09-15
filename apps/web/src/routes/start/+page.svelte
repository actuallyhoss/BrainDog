<!--
  The first run. ONE ROW, TYPED BY HAND.

  Not pack selection, not a capture box, not a dashboard. Three properties matter and each was
  arrived at by deleting something (19 §6):

    - No pack vocabulary on screen one. The word "pack" does not appear until the user goes looking
      for a second register.
    - No model, no agent, no MCP required. Everything here works on a fresh self-host with nothing
      configured — an earlier draft made the core loop a capture field whose rows come from a model,
      which v1 does not ship and self-host does not have. A first run that depends on an absent
      component is not a first run.
    - Nothing to approve. Selecting a PACK means reading an install diff written in the language of
      metrics and nav order, and asking a brand-new user to approve four schema reviews before they
      have seen one of their own rows is worse than a tour.

  And there is no skip, because a record with zero registers has no legal screen.

  AHEAD OF ALL OF IT, "Who are you?" (`loop/research-modular.md` §2): a sentence, read without a
  model, said back, and written as the person's own People row when the first row is added.
-->
<script lang="ts">
  import { onDestroy, tick, untrack } from 'svelte';
  import { createClient } from '@braindog/client';
  import { titleOf } from '$lib/title.ts';
  import { copy } from '$lib/copy.ts';
  import { firstRun } from '$lib/first-run.ts';
  import { REGISTERS } from '$lib/record/api.ts';
  import { choose as recordOrSample } from '$lib/record/packs.ts';
  import { methods } from '$lib/auth.ts';
  import { addKey } from '$lib/start.ts';
  import { hear, introduce, personRow, withChip, type Heard } from '$lib/who.ts';
  import { covered, silenced, typing } from '$lib/a11y/keys.svelte.ts';
  import Define from '$lib/ui/Define.svelte';
  import Mark from '$lib/ui/Mark.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import RowForm from '$lib/ui/RowForm.svelte';
  import type { IconName } from '$lib/ui/icons.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { drew } from '../../lib/ui/screen.svelte.ts';
  import * as pending from '$lib/record/pending.svelte.ts';
  import type { Fields } from '$lib/record/schema.ts';

  /* The five live in `copy.ts` with every other sentence in the product, so the scope this screen
     claims can be checked against the rest of it in one pass rather than found in a component. */
  const CHOICES = firstRun.firstChoices;

  let picked = $state<string | null>(null);
  /* What the generated form would refuse, bound out of it so the button can be dead while it is
     true rather than answering a press with a toast. */
  let problems = $state<string[]>([]);
  /** What the form holds, so the submit can put the row somewhere rather than describing it. */
  let taken = $state<Fields>({});
  /**
   * The sequence the pending row was given.
   *
   * IT WAS WRITTEN AND READ NOWHERE, and what that cost is one row per press. This screen does not
   * navigate away from its own outcome, so the form is still on screen with everything still in it
   * and the button still live: correcting a typo and pressing again is the ordinary thing to do,
   * and it left a second row rather than a corrected one. Holding the sequence is what lets the
   * second press mean what somebody meant by it.
   */
  let made = $state<number | null>(null);

  /**
   * The number under each choice, and it did nothing.
   *
   * THE KEYBOARD SHEET DOCUMENTS IT — "AT THE GATE · `1–9` Highlight an option. It does not choose
   * it" — and `/decide` obeys. This screen DRAWS the badges and had no handler, so the one place the
   * hint is printed on the control it describes was the one place pressing it did nothing.
   *
   * HIGHLIGHT AND NOT CHOOSE, exactly as the sheet says. A number that committed would make a
   * mis-keyed digit the first irreversible act somebody performs, on the screen 19 §6 says has no
   * skip; a number that moves focus lets them read what they landed on and press Enter.
   */
  let lit = $state(-1);

  function key(e: KeyboardEvent) {
    if (picked !== null || e.metaKey || e.ctrlKey || e.altKey) return;
    /* A DIGIT TYPED INTO "Who are you?" is part of the answer, not a jump to a choice. */
    if (typing()) return;
    /* AND NOT WHILE SOMETHING IS OPEN OVER THE PAGE. This screen draws no sheet of its own, and
       the shell's palette opens over every route: `1` to `5` moved the highlight behind it. See
       `covered`, which six route handlers needed and none of them had. */
    if (covered()) return;
    /* AND THE SWITCH, WHICH THIS SCREEN ALONE DID NOT HONOUR. `Character keys: off` is the app's
       stated WCAG 2.1.4 mechanism (`19 §4`) and `1`–`5` here are bare letters by any reading. Every
       other bare-key handler in the product asks; the first screen anybody sees did not. */
    if (silenced(e)) return;
    const n = Number(e.key);
    if (!Number.isInteger(n) || n < 1 || n > CHOICES.length) return;
    e.preventDefault();
    lit = n - 1;
    queueMicrotask(() => choices?.querySelectorAll('button')[lit]?.focus());
  }

  let choices = $state<HTMLDivElement | undefined>(undefined);

  /* ── turn 1: who are you ─────────────────────────────────────────────── */

  /* The sentence stays in memory and never in the address (`research-modules.md` §5). Component
     state survives `?add=` because that is the same route, so going Back finds the answer kept. */
  let who = $state('');
  let heard = $state<Heard | null>(null);
  /* Said back with an edit button once focus leaves the answer or Enter is pressed. While the
     field has focus it stays a field, so the screen never takes it from under somebody typing. */
  let settled = $state(false);
  let field = $state<HTMLInputElement | undefined>(undefined);
  let question = $state<HTMLHeadingElement | undefined>(undefined);
  let hearing: ReturnType<typeof setTimeout> | undefined;
  onDestroy(() => clearTimeout(hearing));

  function listen() {
    clearTimeout(hearing);
    heard = who.trim() ? hear(who) : null;
  }

  /* 250 ms, the palette's debounce for its own live region: a reader is told once per pause. */
  function typed() {
    clearTimeout(hearing);
    hearing = setTimeout(listen, 250);
  }

  function chip(words: string) {
    who = withChip(who, words);
    settled = false;
    listen();
    void tick().then(() => {
      field?.focus();
      field?.setSelectionRange(who.length, who.length);
    });
  }

  function enter(e: KeyboardEvent) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    listen();
    if (!heard) return;
    settled = true;
    void tick().then(() => question?.focus());
  }

  /* DECIDED AFTER THE DOM SETTLES, not from `relatedTarget`: pressing Edit removes the focused button,
     and judging that focusout on the spot would settle the answer straight back. */
  function leave(e: FocusEvent) {
    const box = e.currentTarget as HTMLElement;
    void tick().then(() => {
      if (box.contains(document.activeElement)) return;
      listen();
      if (heard) settled = true;
    });
  }

  /* THE CARET GOES IN ON ARRIVAL AND ON EDIT, at the end of what is there. `who` is read untracked,
     or every keystroke would put the caret back at the end. */
  $effect(() => {
    if (!field) return;
    field.focus();
    const end = untrack(() => who.length);
    field.setSelectionRange(end, end);
  });

  /* ── turn 3: the person's own People row ─────────────────────────────── */

  let known = $state<{ name: string; waiting: boolean } | null>(null);
  /** The demo's waiting People row, so a second press corrects it rather than adding another. */
  let me: number | null = null;
  /** Who a live record has already met from this screen, so a second press does not meet them twice. */
  let met: string | null = null;

  /**
   * Meet the person who answered turn 1.
   *
   * THE SAME SOURCE `/packs` READS: the record when there is one, which also says whether People is
   * on, and the sample when there is not. A refusal is not drawn. The row they typed is this
   * screen's outcome, and a People row that could not be made is not a failure of it.
   */
  async function remember() {
    const now = heard;
    if (!now?.name) return;
    const client = createClient({ base: location.origin });
    const chosen = await recordOrSample(client);
    const packs = chosen.first.ok ? chosen.first.value : null;
    if (chosen.source.sample) {
      const asked = introduce(now, null, packs);
      if (!asked) return;
      const row = personRow(asked, now.bio);
      if (me === null || !pending.replace('people', me, row)) me = pending.add('people', row);
      known = { name: asked.name, waiting: true };
      return;
    }
    const signed = await methods();
    const asked = introduce(now, signed.ok ? (signed.value.me?.email ?? null) : null, packs);
    if (!asked || met === asked.name) return;
    const out = await client.meet(asked);
    if (!out.ok) return;
    met = asked.name;
    known = { name: asked.name, waiting: false };
  }

  /* THE FORM PUTS ITS OWN CARET IN. This screen used to hold a `field` binding nothing ever bound —
     the form below is generated from the declaration, so the page cannot reach its first input — and
     the `focus()` was a no-op for its whole life. `RowForm`'s `autofocus` does it from inside, where
     the first control is. */

  /**
   * CHOOSING A CARD IS A NAVIGATION, and it was a variable.
   *
   * Both first-run screens lived at `/start` with the choice in component state, so the FIRST screen
   * of the product broke the browser two ways at once. Back from the form left `/start` entirely and
   * landed on `/` — a stranger's fully populated record, nineteen controls, on somebody's first
   * thirty seconds. Reload went to screen one and threw away the row they had typed.
   *
   * THE ADDRESS ALREADY EXISTED. `?add=<register>` is read below, honoured once per value, and
   * accepts the word on the tile as well as the register id — screen two's own cards navigate to it.
   * The five cards on screen one were the only thing that reached the form without it.
   *
   * `19 §5`'s rule decides it: what defines WHICH SCREEN YOU ARE LOOKING AT belongs in the URL. The
   * caret, the typed values and the validation stay where they are, because those are about the
   * moment rather than the place.
   */
  const choose = (key: string) => void goto(`/start?add=${key}`, { keepFocus: true });

  /**
   * `/start?add=<register>` LANDS ON THAT REGISTER'S FORM.
   *
   * Screen two's cards send people here to add a second kind of thing, and this screen ignored the
   * parameter — so every card dropped them back on the choice list they had already answered, one
   * step further back than where they pressed. A deep link that lands somewhere else is worse than
   * no deep link: they have to work out that they are in the right place and just earlier.
   *
   * ONLY A KEY THIS SCREEN OFFERS. The parameter comes from a URL, and a register the choice list
   * does not carry has no question written for it.
   */
  /**
   * AND IT TAKES THE WORD ON THE TILE, not only the register id behind it.
   *
   * THE FIVE TILES SAY *Money*, *Services*, *People*, *Projects*, *Work* and the five keys are
   * `obligations`, `services`, `people`, `things`, `tasks` — so three of the five words a person can
   * read on this screen fell through to the choice list. Nothing on the page writes the parameter,
   * so nothing was broken; it is a link somebody types or shares from what is in front of them, and
   * it worked two times in five.
   *
   * NORMALISED TO LETTERS AND DIGITS, and `the` dropped from the front, so `the-services`, `The
   * Services` and `services` are one thing. Not a fuzzy match: an exact comparison against two
   * names the screen already publishes. The second tile said *The estate* when that rule was
   * written, which is what the dropped `the` was for; `start.ts` records what the rename cost it.
   */
  /**
   * AND IT IS HONOURED ONCE PER VALUE, WHICH IS WHAT MAKES *Back* WORK.
   *
   * THE GUARD WAS `picked === null`, AND `picked` IS READ INSIDE THE EFFECT — so pressing Back set it
   * to null, the effect re-ran, saw null, and put the person straight back on the form they had just
   * left. Arriving by `?add=` meant there was no way out of that screen except the browser's own
   * back button.
   *
   * REMEMBERING THE PARAMETER instead of the state fixes both halves: the effect no longer depends
   * on `picked` at all, and a genuinely different `?add=` — an in-app navigation to another one —
   * still lands where it says.
   */
  /**
   * WHETHER THIS SCREEN HAS ALREADY ANSWERED. Reset by the effect below whenever the choice changes,
   * so going Back and picking a different list does not arrive pre-answered.
   */
  let said = $state(false);

  let honoured: string | null = null;

  /* AND IT MIRRORS THE ADDRESS BOTH WAYS, which is the half that makes Back mean anything.
     
     It only ever SET the choice, so leaving `?add=` behind — the browser's Back, or this screen's
     own — changed the URL and left the form on screen: you were at `/start`, looking at the second
     screen, with no way to the first except pressing Back again into whatever came before the
     product. An unknown key resets too, because a register the choice list does not carry has no
     question written for it and screen one is the honest landing. */
  $effect(() => {
    const asked = page.url.searchParams.get('add');
    if (asked === honoured) return;
    honoured = asked;
    picked = (asked ? addKey(asked, CHOICES) : undefined) ?? null;
    /* AND THE ANSWER GOES WITH THE QUESTION. Going Back and choosing a different list must not land
       on somebody else's outcome, which is the same bug the `picked === null` guard above had in a
       different place. */
    said = false;
    /* AND THE ROW GOES WITH IT. `made` is a sequence inside ONE register's waiting list, so carrying
       it across a change of choice would point the next press's `replace` at a row in a list nobody
       is looking at. The row already added stays where it is and keeps its own `Put back`. */
    made = null;
  });

  const choice = $derived(CHOICES.find((c) => c.key === picked));

  /**
   * What the row is called, and the list it went to, for the sentences that say where it is.
   *
   * THE LIST IS NAMED BY THE REGISTER AND NOT BY THE TILE. Four of the five are one word either way.
   * The fifth tile says *Work* and opens a list whose head says *Tasks*, so "See Work as it comes"
   * was a button naming a place it did not go. The outcome names what the reader will see.
   */
  const thing = $derived(choice ? (firstRun.firstThing[choice.key] ?? choice.label) : '');
  const list = $derived(choice ? (REGISTERS[choice.key]?.name ?? choice.label) : '');

  /**
   * The first row.
   *
   * IT SAYS WHAT IT WOULD HAVE WRITTEN AND GOES WHERE THE ROW WOULD BE. This app is a mock-up of
   * the record and has no write path; the rule it keeps everywhere else is that an action which
   * cannot happen says so once, in the toast, rather than doing nothing — because a control that
   * does nothing is indistinguishable from a broken one. This is the highest-stakes control in the
   * product and it was the one that broke that rule.
   */
  function commit(event: SubmitEvent) {
    event.preventDefault();
    if (!choice) return;
    /* THE BUTTON IS ALREADY DISABLED WHEN THIS IS TRUE. Kept as the second door, because Enter in a
       text field submits a form whatever its button looks like. */
    if (problems.length > 0) return;
    /**
     * AND THE ROW IS THE ROW THEY THEN SEE, which it was not.
     *
     * A friction pass ranked this first of the ten things costing a person the most, and the
     * measurement is the whole argument: four clicks, twenty-five keystrokes, six decisions, three
     * screens, **zero rows**. The list this screen offers to open holds thirty-eight rows belonging
     * to a fictional studio and the one thing the person typed is nowhere in it, with nothing on
     * either screen saying why.
     *
     * IT IS NOT A WRITE AND IT DOES NOT CLAIM TO BE. `pending` holds it for the life of the tab,
     * the list draws it where it will be, and it wears `Not saved` on the row: the same receipt
     * every other verb in this product leaves, so a person meets one product rather than one
     * product and one exception. The sentence under this form already says nothing was saved; what
     * changes is that the row exists to be looked at while that is true.
     */
    /* PRESSING AGAIN CORRECTS THE ROW, it does not add another. `replace` answers `false` when the
       row is no longer waiting, which is what happens after `Put back` on the list, and then this
       adds one as it did the first time rather than quietly restoring a row somebody removed. */
    /* THE FIRST PRESS DOES NOT TOAST ANY MORE, AND THE SECOND ONE DOES. Both used to, and the first
       read "the first row in Money would be written, but nothing was saved yet.": lower case, and
       drawn at y 713 to 776 on a 390px phone straight across the outcome below, whose first line
       said the same thing. That outcome IS this screen's answer, for the reason written over it, so
       a toast on top was one fact twice with one copy hiding the other. A second press moves
       nothing on the screen, because the outcome is already there, so it keeps a toast, and the
       toast says what happened: the row was changed. */
    if (made !== null && pending.replace(choice.key, made, taken)) {
      toasts.push(copy.notWritten(firstRun.rowChanged(thing, list)));
    } else {
      made = pending.add(choice.key, taken);
    }
    said = true;
    void remember();
  }

  /**
   * THE COPY BUTTON WENT WITH THE COMMAND IT COPIED.
   *
   * It was worth keeping the argument that killed its predecessor, because the next person to add a
   * copy button here will need it: `navigator.clipboard?.writeText(…).catch(…)` short-circuits the
   * WHOLE chain including the `.catch`, so with no Clipboard API the expression is `undefined` and
   * the success toast fires anyway. `navigator.clipboard` is absent over plain HTTP, which is how a
   * self-host is first opened, so the environment where that lies is the one this screen exists
   * for. `clipboard.ts` exists for exactly this and reports the failure.
   */

  /**
   * THIS SCREEN COMPUTES ITS CONTENT SYNCHRONOUSLY, and says so.
   *
   * `data-screen` on `<main id="main">` is what lets anything outside the page tell a drawn screen
   * from a shell that has fetched nothing. Four browser gates waited on `#main` having a child,
   * with the wait swallowed by a `catch`, which is satisfied by a page heading and means nothing
   * the day a screen fetches. `Empty` says `empty` or `refused` for the states it draws; this is
   * the other claim, and it is true of this screen today.
   *
   * IT STOPS BEING AVAILABLE WHEN IT STOPS BEING TRUE. A screen that starts fetching brackets its
   * reads with `opened()` and `closed()`, and a call still out takes the attribute away whatever
   * this line says.
   */
  $effect(() => drew('ready'));
</script>

<svelte:window onkeydown={key} />

<svelte:head><title>{titleOf('Start')}</title></svelte:head>

<div class="start">
  <div class="frame">
    <header class="head">
      <Mark height={34} />
      <span class="wordmark">{copy.product}</span>
    </header>

    {#if !choice}
      <div class="who" role="group" aria-labelledby="who-h" onfocusout={leave}>
        <h1 class="question step" id="who-h">{firstRun.whoQuestion}</h1>
        {#if settled && heard}
          <div class="heard">
            <p class="heard-said">{heard.name ? firstRun.gotYou(heard.name) : firstRun.gotIt}</p>
            <Button weight="bare" onclick={() => (settled = false)}>{firstRun.whoEdit}</Button>
          </div>
        {:else}
          <input
            class="who-field"
            type="text"
            autocomplete="off"
            aria-labelledby="who-h"
            placeholder={firstRun.whoPlaceholder}
            bind:this={field}
            bind:value={who}
            oninput={typed}
            onkeydown={enter}
          />
          <div class="who-chips" role="group" aria-label={firstRun.whoChipsLabel}>
            {#each firstRun.whoChips as c}
              <!-- A mouse press keeps focus in the field, so appending words never settles the answer. -->
              <button type="button" class="who-chip" onmousedown={(e) => e.preventDefault()} onclick={() => chip(c)}>{c}</button>
            {/each}
          </div>
        {/if}
        <!-- ALWAYS IN THE DOCUMENT, so a screen reader hears the change rather than a region arriving.
             Empty once settled, where the same sentence is drawn as the line above. -->
        <p class="heard-now" role="status">{#if heard && !settled}{heard.name ? firstRun.gotYou(heard.name) : firstRun.gotIt}{/if}</p>
      </div>

      {#if heard}
      <div class="turn">
      <!-- SAY WHAT THIS IS BEFORE ASKING WHAT THEY WANT. The question on its own let the three
           examples under it define the product, and three examples always define it downward. -->
      <!-- A paragraph and not the `h1` it was: "Who are you?" is the page's heading now. -->
      <p class="lede">{firstRun.firstLede}</p>
      <p class="body">{firstRun.firstBody}</p>

      <h2 class="question" tabindex="-1" bind:this={question}>{firstRun.firstQuestion}</h2>

      <div class="choices" role="group" aria-label={firstRun.firstQuestion} bind:this={choices}>
        {#each CHOICES as c, i}
          <!-- The register id used to sit on the right of every row. It is the app's own vocabulary
               explained to somebody who has not agreed to learn it yet, on the one screen where
               they have the least reason to care, and it made five plain choices look like a
               schema review. The glyph does the work the id was pretending to do. -->
          <button type="button" class="choice" data-lit={lit === i ? '' : undefined} onclick={() => choose(c.key)}>
            <span class="choice-icon"><Icon name={c.icon as IconName} size="m" /></span>
            <span class="choice-main">
              <span class="choice-label">{c.label}</span>
              <span class="choice-body">{c.body}</span>
            </span>
          </button>
        {/each}
      </div>

      <!-- `row` is defined in the one sentence that already uses it, on the screen where somebody
           is about to make their first one. `19 §6`: one clause, in the sentence that needs it. -->
      <!-- THE CLAUSE GOES BESIDE THE WORD. It rendered after the whole hint, so the definition of
           *row* trailed two sentences behind the only place the word appears — `19 §6` asks for it
           "in the sentence that needs it", and the sentence that needs it is the first one. -->
      <p class="hint">{firstRun.firstRowIs} <Define noun="row" /> {firstRun.firstHint}</p>

      <section class="agent" aria-labelledby="agent-h">
        <h2 class="agent-h" id="agent-h"><Icon name="session" size="m" />{firstRun.agentTitle}</h2>
        <p class="agent-body">{firstRun.agentBody}</p>
        <!-- AND NOT THE COMMAND, because the address in it does not answer. `mcp.brain.dog` returns
             525: the transport is not built and the hostname is deliberately unclaimed, since
             pointing it at the Worker would answer an MCP address with the app's shell. `23 §3.1`
             is the rule, and it is the one `askBrainDog` already obeys: a capability with no model
             behind it is not there, not greyed out. A command that cannot be run is worse than an
             absent one, because somebody spends their first minute pasting it into a terminal. -->
        <p class="agent-note">{firstRun.agentNotYet}</p>
      </section>
      </div>
      {/if}
    {:else}
      <h1 class="question step">{choice.field}</h1>

      <!--
        THE ONE CONTROL THAT MATTERS COMMITS. It had no handler at all — no toast, no route, no row,
        and the input was not even bound — which is this app's own rule broken at the highest-stakes
        moment: a control that does nothing is indistinguishable from a broken one, so every action
        that cannot happen here says what it WOULD have done, once, in the toast. Sixteen other
        controls obey that; the first-run commit did not.
      -->
      <!--
        THE REGISTER'S OWN FIELDS, and not a form typed out by hand. This was one hard-coded shape
        for five different questions: a text box and a `Due` date, whatever had been chosen. So
        "What is it, and how much?" stood over a form with no amount in it — on the first screen of a
        product about money — and a person was asked when they are due.

        `first` NARROWS IT TO THE TITLE AND THE REQUIRED ONES, because 19 §6 wants "one true fact
        about their own business" in under thirty seconds and a register has eight fields. Which
        three that is comes from the declaration, so a money register asks for an amount because it
        DECLARES one, and nobody writes a second copy of the schema in markup.

        AND THEN TO THE REQUIRED ONES THE CHOICE HAS NOT ALREADY ANSWERED. `given` is
        `firstRun.firstGiven`: an invoice is owed to you and a new one is open, so Money went from
        five fields to three, and the two it dropped were the two a stranger had to read in order
        to accept them.
      -->
      <form class="form" onsubmit={commit}>
        <!-- KEYED ON THE CHOICE. Going Back and picking another register reused the component, so
             an amount typed into Money was still in the field on Projects — and now would count as
             a required field already filled. -->
        {#key choice.key}
          <RowForm
            register={choice.key}
            first
            autofocus
            label={firstRun.firstField[choice.key]}
            given={firstRun.firstGiven[choice.key]}
            bind:problems
            bind:taken
          />
        {/key}

        <!-- The same treatment as the register drawer and `/decide`: the sentence, then the dead
             button that points at it. -->
        {#if problems.length > 0}<p class="first-why" id="first-why">{problems[0]}</p>{/if}

        <div class="actions">
          <Button
            weight="primary"
            type="submit"
            disabled={problems.length > 0}
            aria-describedby={problems.length > 0 ? 'first-why' : undefined}>{copy.addTheRow}</Button
          >
          <!-- BACK IS A NAVIGATION TOO, so the browser's own Back and this button end up in the
               same place instead of disagreeing about where "back" is. -->
          <Button weight="bare" onclick={() => void goto('/start')}>{copy.goBack}</Button>
        </div>

        <!--
          WHAT HAPPENED, UNDER THE BUTTON THAT DID IT.

          This screen used to navigate to `/r/<key>?first=1` in the same tick as the toast, and the
          toast did not survive: measured on the deployed build, the sentence is in the DOM at 700ms
          with the URL still `/start`, and gone at 2,200ms with the URL changed. So the one control
          `19 §6` is written around reported nothing, and what it reported nothing about was landing
          on thirty-eight rows of a fictional studio.

          A SCREEN DOES NOT NAVIGATE AWAY FROM ITS OWN OUTCOME. The form stays where it is with
          everything still in it, which is the receipt a person can actually check, and the answer
          is a sentence they are already looking at. `role="status"` rather than `alert`: they
          pressed the button, so nothing here needs to interrupt what they were reading (13 §7).
        -->
        {#if said}
          <div class="kept" role="status">
            <!-- WHAT HAPPENED FIRST, THEN WHY. This opened on "Nothing was saved yet." and said it
                 twice more before it said where the row was, so the one thing that had happened
                 came last. That it is not saved is now said once as a sentence and once as the name
                 of the mark the reader will find on the row. -->
            <p class="kept-what">{firstRun.rowIsThere(thing, list, copy.markNotWritten)}</p>
            {#if known}
              <p class="kept-what">{known.waiting ? firstRun.youArePending(known.name, copy.markNotWritten) : firstRun.youAreKnown(known.name)}</p>
            {/if}
            <p class="kept-why">{firstRun.keptNothing} {firstRun.keptNothingWhy}</p>
            <p class="kept-why">{firstRun.keptExamples}</p>
            <div class="actions">
              <Button href={`/r/${choice.key}?first=1`}>{firstRun.seeTheList(list)}</Button>
            </div>
          </div>
        {/if}
      </form>

    {/if}
  </div>
</div>

<style>
  /**
   * The outcome, set apart from the form without being an alarm.
   *
   * A HAIRLINE ABOVE IT AND NOTHING ELSE. A tinted panel would make "nothing was saved" read as a
   * failure, and it is not one: the person did the thing correctly and the build cannot keep it
   * yet. `--edge` and the ordinary ground say "this is a different part of the screen" and stop
   * there.
   */
  .kept {
    display: grid;
    gap: var(--sp-2);
    margin-block-start: var(--sp-5);
    padding-block-start: var(--sp-5);
    border-block-start: 1px solid var(--edge);
  }

  .kept-what {
    font-weight: 600;
  }

  /* ── turn 1 ───────────────────────────────────────────────────────────── */

  .who {
    display: grid;
    gap: var(--sp-3);
  }

  .who .question.step {
    margin-block-end: var(--sp-1);
  }

  /* The one control on the screen, so it is drawn at the size of a sentence rather than a form row. */
  .who-field {
    inline-size: 100%;
    padding: var(--sp-3) var(--sp-4);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-md);
  }

  .who-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .who-chip {
    min-block-size: 36px;
    padding-inline: var(--sp-3);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-pill);
    color: var(--ink2);
    font: inherit;
    font-size: var(--t-sm);
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  /* A FINGER NEEDS 44PX, where a mouse is fine at 36. */
  @media (pointer: coarse) {
    .who-chip {
      min-block-size: 44px;
    }
  }

  @media (hover: hover) and (pointer: fine) {
    .who-chip:hover {
      background: var(--s2);
      border-color: var(--edge);
    }
  }

  .heard {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  .heard-said {
    color: var(--ink);
    font-size: var(--t-md);
    font-weight: 600;
  }

  .heard-now {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .turn {
    margin-block-start: var(--sp-7);
  }

  .kept-why {
    color: var(--ink2);
    font-size: var(--t-sm);
    line-height: 1.5;
    max-inline-size: 52ch;
  }

  /* The register's own rule, said where the refusal is. Ink rather than the warn hue: nobody has
     done anything wrong yet. */
  .first-why {
    color: var(--ink2);
    font-size: var(--t-xs);
    line-height: 1.5;
  }

  /* `minmax(0, …)` and not `place-items: center`. A centred grid item sizes its track to
     `max-content`, and the one line of `nowrap` monospace in the agent card is wider than a phone —
     so the track grew to fit it and took the whole page sideways at 320 and 360. The gate caught it
     the same minute I wrote it, which is what the gate is for. */
  .start {
    display: grid;
    grid-template-columns: minmax(0, min(560px, 100%));
    justify-content: center;
    align-content: center;
    min-block-size: 100dvh;
    padding: var(--sp-5);
  }

  .frame {
    min-inline-size: 0;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-block-end: var(--sp-7);
  }

  .wordmark {
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--t-xl);
    font-weight: 600;
    letter-spacing: -0.026em;
  }

  /* The question is the SECOND thing on the screen, under the claim, so it is a heading for the
     cards rather than the headline of the page. It was a letterspaced eyebrow in capitals, which is
     how a form labels a section; it is a sentence at a section's size now, which is how a person
     asks one. On the step after a choice it is the headline again, and `.step` puts the size back. */
  .question {
    margin-block: var(--sp-7) var(--sp-4);
    color: var(--ink);
    font-size: var(--t-lg);
    font-weight: 600;
    letter-spacing: -0.018em;
  }

  .question.step {
    margin-block: 0 var(--sp-5);
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--t-2xl);
    font-weight: 600;
    letter-spacing: -0.028em;
    text-transform: none;
  }

  /* CARDS, AND IT WAS ONE BOXED LIST. Five rows inside a frame read as a settings panel; five cards
     you can pick up read as five ways in. Two across where there is room, one on a phone. */
  .choices {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr));
    gap: var(--sp-3);
  }

  /* The claim, at the top, in the display face — the same sentence the marketing site leads with,
     because the first screen of the product and the first screen of the site should not describe
     two different things. */
  .lede {
    text-wrap: balance;
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--t-2xl);
    font-weight: 600;
    letter-spacing: -0.022em;
    line-height: var(--lh-tight);
  }

  .body {
    margin-block-start: var(--sp-3);
    max-inline-size: 54ch;
    color: var(--dim);
    font-size: var(--t-base);
    line-height: var(--lh-body);
  }

  .choice {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: var(--sp-3);
    min-block-size: 76px;
    padding: var(--sp-4);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-lg);
    color: var(--ink);
    font: inherit;
    text-align: start;
    cursor: pointer;
    transition:
      background var(--d-state) var(--ease-out),
      border-color var(--d-state) var(--ease-out),
      transform var(--d-press) var(--ease-out);
  }

  /* HIGHLIGHTED BY A NUMBER, and focus does the rest — so the ring somebody sees is the one the
     browser draws for the thing Enter would press, rather than a second convention to learn. */
  .choice[data-lit] {
    border-color: var(--accent);
  }

  @media (hover: hover) and (pointer: fine) {
    .choice:hover {
      background: var(--s2);
      border-color: var(--edge);
    }
  }

  .choice:active {
    transform: scale(var(--press-scale));
  }

  /* The number is a KEY, so it is drawn as one. A bare circled digit reads as a step in a sequence
     you have to do in order; these are five alternatives and only one gets picked. */
  /* THE FIVE NUMBER KEYS STILL WORK AND ARE NO LONGER ADVERTISED. Boxed digits beside the five
     choices were an accelerator printed on the first screen a stranger sees, and the verdict on the
     product as it stood was "as if it's some nerdy tool". They went on a phone first; they are gone
     everywhere now. The binding is untouched. */

  /* The glyph, in the accent, because it was the only colour on the screen that was missing and
     five rows of grey text is most of what made this look like a form. */
  .choice-icon {
    display: grid;
    place-items: center;
    inline-size: 40px;
    block-size: 40px;
    border-radius: var(--r-pill);
    background: var(--accent-wash);
    color: var(--accent-text);
  }

  .choice-main {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-inline-size: 0;
  }

  /* The name carries the weight and the sentence under it does the explaining. One line each was
     what made the old three read as a list of chores rather than as the parts of a business. */
  .choice-label {
    color: var(--ink);
    font-size: var(--t-md);
    font-weight: 600;
    letter-spacing: -0.012em;
  }

  .choice-body {
    color: var(--dim);
    font-size: var(--t-sm);
  }


  .form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  /* The label and input styles that were here are `RowForm`'s now, which is the point: one control
     per declared type, drawn one way, wherever a row is written. */

  .actions {
    display: flex;
    gap: var(--sp-2);
    margin-block-start: var(--sp-2);
  }

  /* No rule above it any more. It belongs to the list it follows, and the card below now does the
     separating — a divider plus a card is two dividers. */
  .hint {
    margin-block-start: var(--sp-3);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* ── the agent path ──────────────────────────────────────────────────── */

  /* A CARD, not a rule with text under it. Below a divider reads as a footnote — the thing you put
     after the real content — and this is the path somebody with an agent already open should take
     first. Tinted with the accent rather than the surface ladder, because it is an alternative to
     the list above it and not the next step down from it.

     AND THE TINT IS THE WASH NOW, at the one strength the product draws an accent tint at. This
     read `color-mix(in srgb, var(--accent) 7%, var(--s1))`: seven, beside `--accent-wash`'s twelve
     and the board column's ten, three strengths of one tint that nobody chose against each other.
     Measured against the `--s1` it sits on, seven per cent came out at 1.10:1 in light and 1.06 in
     dark, which is a card the eye has to be told is there; the wash is 1.18 and 1.11.

     `--accent-ground` IS THE OTHER TOKEN FOR THIS AND IT IS NOT THIS ONE. It mixes into `--bg`,
     which is the page, and this is a card standing off the page on `--s1`. Using it would have
     dropped the card back onto the ground it is meant to sit above. The base stays `--s1` and the
     wash is painted over it, so the surface behind the tint is a declared one rather than half of
     a value written here. */
  .agent {
    margin-block-start: var(--sp-6);
    padding: var(--sp-4) var(--sp-4) var(--sp-5);
    background-color: var(--s1);
    background-image: linear-gradient(var(--accent-wash), var(--accent-wash));
    border: 1px solid color-mix(in srgb, var(--accent) 22%, transparent);
    border-radius: var(--r-md);
  }

  .agent-h {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .agent-h :global(svg) {
    color: var(--accent-text);
  }

  .agent-h {
    color: var(--ink);
    font-size: var(--t-md);
    font-weight: 600;
    letter-spacing: -0.012em;
  }

  .agent-body {
    margin-block-start: var(--sp-2);
    max-inline-size: 56ch;
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }


  .agent-note {
    margin-block-start: var(--sp-2);
    color: var(--dim);
    font-size: var(--t-xs);
  }
</style>
