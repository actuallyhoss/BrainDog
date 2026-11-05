<!--
  THE SIX-DIGIT FIELD, one component, drawn by the page the terminal prints (`routes/connect/approve`, at its
  `lead` size), by Settings, Agents (first on the screen while a machine waits, and under the connect sheet's setup line
  otherwise) and by Home's connect sheet, so a first run from Home connects a machine start to finish without leaving
  it. The owner's only: approving is `owner` (`deviceApprove`), and each page that draws this draws it on its owner's
  arm alone.

  SIX BOXES AND ONE FIELD. The boxes are a drawing of what the one real `<input>` holds, and the input lies over them,
  unseen, so a tap anywhere on the boxes is a tap in the field, a phone opens its number pad (`inputmode="numeric"`), a
  paste of `325 684` or `325684` lands whole, and a screen reader reads one field with one label. The box the next
  digit goes in carries the focus ring and a caret.

  THE SIXTH DIGIT LOOKS, AND LETS NOTHING IN. Reaching six from fewer asks what that code names; the same six held again
  after a refusal wait for Enter or the button, so a wrong code is never sent twice by itself. A refusal keeps the code and
  selects it, so the next keystroke starts over.

  THEN THE SHEET SAYS WHAT IS ASKING, and Approve on it is the only thing that lets it in: the machine, the client, what it
  will be able to do, and for a keychain request which keys. A phisher who starts a grant and talks somebody into typing
  six digits gets a page that says what they are about to hand over. The focus goes to the sheet's heading and not to
  Approve, so an Enter still held from the digits presses nothing, and the sheet is not in the `<form>`. Seven digits, or a letter, is refused out loud and not taken (`approve.ts` `enteredOf`):
  nothing is ever trimmed into a different code.

  A `<form>`, so Enter sends it. ITS STYLES ARE ITS OWN, because Home's sheet has no `settings.css`. It is loaded with
  the sheet or the page, never with what every screen loads.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { TONES } from 'braindog-render';
  import { copy } from '$lib/copy.ts';
  import { methods, passkeySignIn, support } from '$lib/auth.ts';
  import { codeOf, CODE_DIGITS, normalise, type Answer, type DeviceLooked } from '$lib/record/device.ts';
  import { reprove } from '$lib/record/keychain.ts';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';
  import Button from '$lib/ui/Button.svelte';
  import { canOf, cellsOf, clientOf, enteredOf, machineOf } from './approve.ts';
  import { saidOf, sent, type Approve } from './code-form.ts';

  type Approved = Extract<Answer, { kind: 'approved' }>;

  let {
    approve,
    onchanged,
    onapproved,
    id = 'user-code',
    size = 'inline',
    autofocus = false,
    looking = $bindable(false),
  }: {
    /** One send of what was typed, a look or a press of Approve (`code-form.ts` `approverOf`). */
    approve: Approve;
    /** A machine was approved, so the connected list changed; awaited before the form is ready again. */
    onchanged?: (() => unknown) | undefined;
    /** A machine was approved, and the page says so in its own words: the line under the boxes then stays quiet. */
    onapproved?: ((a: Approved) => void) | undefined;
    /** The field's id, which its label and its sentence are tied to. */
    id?: string;
    /** `lead` is the approve page's: bigger boxes, the label left to the page's own sentence, the button the full width. */
    size?: 'lead' | 'inline';
    /** Focus the field once drawn, where the field is the reason the page was opened. */
    autofocus?: boolean;
    /** True while the sheet is up, so the page around it can step back and leave the question alone on the screen. */
    looking?: boolean;
  } = $props();

  let typed = $state('');
  let answer = $state<Answer | null>(null);
  let approving = $state(false);
  let focused = $state(false);
  let input = $state<HTMLInputElement | undefined>();
  /* WHAT THE CODE NAMES, once it has been looked at: drawn in place of the boxes until Approve or Not this one. */
  let looked = $state<DeviceLooked | null>(null);
  let sheetHead = $state<HTMLHeadingElement | undefined>();

  $effect(() => {
    looking = looked !== null;
  });

  $effect(() => {
    if (looked !== null) sheetHead?.focus();
  });

  const cells = $derived(cellsOf(typed));
  /* THE BOX THE NEXT DIGIT GOES IN; six when the boxes are full, which marks none. */
  const next = $derived(Math.min(normalise(typed).length, CODE_DIGITS));

  /* FOCUSED ONCE DRAWN, and given again a moment later if the first navigation's own focus handling took it back to the
     page, unless the reader has put it somewhere since. */
  $effect(() => {
    if (!autofocus || !input) return;
    const el = input;
    el.focus();
    const again = setTimeout(() => {
      if (document.activeElement === null || document.activeElement === document.body) el.focus();
    }, 150);
    return () => clearTimeout(again);
  });

  function entered(e: Event & { currentTarget: HTMLInputElement }) {
    const el = e.currentTarget;
    const out = enteredOf(typed, el.value);
    if (out.refused) {
      /* SAID ABOUT WHAT WAS TYPED, and the field keeps what it held. */
      const entry = codeOf(el.value);
      answer = entry.ok ? null : { kind: 'malformed', why: entry.why, digits: entry.digits };
      el.value = typed;
      return;
    }
    typed = out.typed;
    answer = null;
    el.value = typed;
    if (out.send) void tryCode();
  }

  async function tryCode(e?: SubmitEvent) {
    e?.preventDefault();
    await send();
  }

  /** The press of Approve on the sheet: this code, and the row the sheet showed. */
  const pressed = () => send(looked?.handle);

  async function send(handle?: string) {
    if (approving) return;
    /* NOTHING TYPED YET: the press goes to the field and says why, as a primary does everywhere. */
    if (normalise(typed) === '') input?.focus();
    approving = true;
    const busy = opened();
    const out = await sent(typed, approve, handle);
    closed(true, busy);
    approving = false;
    ({ typed, answer } = out);
    if (out.answer?.kind === 'looked') {
      looked = out.answer.looked;
      return;
    }
    /* ANYTHING ELSE ENDS THE SHEET: approved, or a refusal said under the boxes with the code still in them. */
    looked = null;
    if (out.answer?.kind === 'approved') {
      if (input) input.value = typed;
      onapproved?.(out.answer);
      if (out.changed) await onchanged?.();
      return;
    }
    /* A REFUSAL SELECTS THE CODE, so the next keystroke or paste replaces it. The boxes were put away while the sheet was up. */
    await tick();
    if (input) {
      input.value = typed;
      if (handle !== undefined || document.activeElement === input) {
        input.focus();
        input.select();
      }
    }
  }

  /** Not this one: nothing was let in, and the field is empty for the code they meant. The machine's request lapses by itself. */
  async function notThis() {
    looked = null;
    typed = '';
    answer = null;
    await tick();
    if (input) input.value = '';
    input?.focus();
  }

  /* What the status line under the boxes says, or nothing. A page that says "Approved" itself takes that line. */
  const said = $derived(approving ? null : answer?.kind === 'approved' && onapproved ? null : saidOf(answer));
  const shape = $derived(approving ? 'checking' : said?.tone === 'bad' ? 'bad' : said?.tone === 'good' ? 'good' : 'idle');

  /* SIGNING IN AGAIN WITHOUT LEAVING, where a passkey can do it: the code stays typed and is sent again. */
  let reproving = $state(false);
  async function signInAgain() {
    if (reproving) return;
    reproving = true;
    const back = await reprove({ support, methods, passkeySignIn }, (href) => location.assign(href));
    reproving = false;
    if (back) await tryCode();
  }
</script>

<form class="code-form" data-size={size} data-shape={shape} data-looking={looked !== null ? '' : undefined} onsubmit={tryCode} novalidate>
  <label class="code-label" for={id}>{copy.codeLabel}</label>
  <div class="code-row">
    <div class="code-boxes" data-focused={focused ? '' : undefined}>
      {#each cells as digit, i (i)}
        <span class="code-box" data-filled={digit ? '' : undefined} data-next={focused && i === next && !approving ? '' : undefined} aria-hidden="true"
          >{digit}<span class="code-caret"></span></span
        >
      {/each}
      <input
        bind:this={input}
        class="code-input"
        {id}
        type="text"
        inputmode="numeric"
        autocomplete="one-time-code"
        autocapitalize="off"
        spellcheck="false"
        enterkeyhint="go"
        value={typed}
        oninput={entered}
        onfocus={() => (focused = true)}
        onblur={() => (focused = false)}
        aria-describedby="{id}-said"
        aria-invalid={said?.invalid ? 'true' : undefined}
        aria-busy={approving || undefined}
      />
    </div>
    <Button weight="primary" type="submit" disabled={approving} aria-busy={approving || undefined}>{approving ? copy.codeChecking : copy.codeContinue}</Button>
  </div>
  <!-- Always in the document: a live region inserted with its first sentence is not reliably announced. The mark
       beside the sentence carries its tone, so the tone is never colour alone. -->
  <p class="code-said" id="{id}-said" role="status" data-intent={said?.tone}>
    {#if said}<span role="img" aria-label={TONES[said.tone].label}>{TONES[said.tone].glyph}</span> {said.line}{/if}
  </p>
  {#if said?.signIn}
    <div class="row-actions">
      <Button weight="quiet" disabled={reproving} onclick={() => void signInAgain()}>{copy.signInAgain}</Button>
    </div>
  {/if}
</form>
{#if looked !== null}
  <section class="code-sheet" data-keys={looked.reach === 'vault' ? '' : undefined} aria-labelledby="{id}-sheet">
    <h2 class="code-sheet-title" id="{id}-sheet" tabindex="-1" bind:this={sheetHead}>{looked.reach === 'vault' ? copy.confirmKeysTitle : copy.confirmTitle}</h2>
    {#if looked.reach === 'vault'}<p class="code-warn">{copy.confirmKeysWarn}</p>{/if}
    <dl class="code-facts">
      <div class="code-fact">
        <dt>{copy.confirmMachine}</dt>
        <dd dir="auto">{machineOf(looked.label)}</dd>
      </div>
      <div class="code-fact">
        <dt>{copy.confirmClient}</dt>
        <dd dir="auto">{clientOf(looked.label, looked.reach)}</dd>
      </div>
      <div class="code-fact">
        <dt>{copy.confirmCan}</dt>
        <dd>{canOf(looked.reach, looked.scope)}</dd>
      </div>
      {#if looked.reach === 'vault'}
        <div class="code-fact">
          <dt>{copy.confirmProject}</dt>
          <dd dir="auto">{looked.project ?? copy.confirmNoProject}</dd>
        </div>
        <div class="code-fact">
          <dt>{copy.confirmKeys}</dt>
          <dd>
            {#if looked.keys.length === 0}
              {copy.confirmNoKeys}
            {:else}
              <ul class="code-keys">
                {#each looked.keys as key, i (i)}<li dir="auto">{key}</li>{/each}
                {#if looked.more > 0}<li>{copy.confirmMoreKeys(looked.more)}</li>{/if}
              </ul>
              {copy.confirmLaterKeys}
            {/if}
          </dd>
        </div>
      {/if}
    </dl>
    <p class="code-self">{copy.confirmSelf}</p>
    <div class="code-sheet-acts">
      <Button weight="primary" disabled={approving} aria-busy={approving || undefined} onclick={() => void pressed()}>{approving ? copy.codeChecking : looked.reach === 'vault' ? copy.confirmKeysApprove : copy.confirmApprove}</Button>
      <Button weight="quiet" disabled={approving} onclick={() => void notThis()}>{copy.confirmNot}</Button>
    </div>
  </section>
{/if}

<style>
  /* THE BOXES STAND ASIDE FOR THE SHEET. The form stays in the document, with its live region, so a refusal after a press
     of Approve is announced as any other. */
  .code-form[data-looking] {
    margin-block-start: 0;
  }

  .code-form[data-looking] .code-label,
  .code-form[data-looking] .code-row {
    display: none;
  }

  /* WHAT IS ASKING, ONE COLUMN: the question, the facts in a well, the warning, and the two presses. */
  .code-sheet {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    margin-block-start: var(--sp-3);
    max-inline-size: var(--measure);
    min-inline-size: 0;
  }

  .code-sheet-title {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 600;
    line-height: var(--lead-ui);
  }

  .code-sheet-title:focus {
    /* focus-ok: the heading takes focus only by script, so a reader is told and an Enter still held presses nothing; it is
       never in the tab order, and a ring there would read as a control. */
    outline: none;
  }

  /* A KEYCHAIN REQUEST SAYS SO FIRST: it hands over secrets, not a sign-in, so the sheet leads with the warm tint the app
     uses for a warning, in the body ink, and the heading above it is the question in the keys' own words. */
  .code-warn {
    margin: 0;
    padding: var(--sp-3) var(--sp-4);
    background: var(--warn-tint);
    border-radius: var(--r-pop);
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
    text-wrap: pretty;
  }

  .code-facts {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    margin: 0;
    padding: var(--sp-4);
    background: var(--tile-2);
    border-radius: var(--r-pop);
  }

  .code-fact {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-inline-size: 0;
  }

  .code-fact dt {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 500;
    line-height: var(--lead-meta);
  }

  .code-fact dd {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: calc(22px * var(--type, 1));
    overflow-wrap: anywhere;
  }

  .code-keys {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .code-self {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
    text-wrap: pretty;
  }

  .code-sheet-acts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  /* THE COLUMN: the label, the boxes with their button, and the sentence under them, 8 apart. */
  .code-form {
    --box-w: 40px;
    --box-h: var(--tap);
    --box-gap: var(--sp-2);
    --group: 10px;
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
    max-inline-size: var(--measure);
    min-inline-size: 0;
  }

  .code-label {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  /* THE BOXES AND THE BUTTON ON ONE LINE where they fit, wrapping to two where they do not. */
  .code-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-3);
  }

  /* SIX BOXES IN TWO GROUPS OF THREE, as the terminal prints the code, with a short rule between the groups. The field
     lies over all of them, so the whole row is one target. */
  .code-boxes {
    position: relative;
    display: flex;
    flex: 0 1 auto;
    align-items: center;
    gap: var(--box-gap);
    min-inline-size: 0;
    max-inline-size: 100%;
  }

  .code-box {
    position: relative;
    display: grid;
    flex: 0 1 var(--box-w);
    place-items: center;
    inline-size: var(--box-w);
    min-inline-size: 32px;
    block-size: var(--box-h);
    /* EACH DIGIT'S BOX IS THE OPS FIELD (3 Nov): the tile's fill, a 1px edge, radius 12, as every other field. */
    background: var(--tile);
    box-shadow: inset 0 0 0 1px var(--rule-strong);
    border-radius: var(--r-field);
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--fs-figure);
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    line-height: 1;
    transition: outline-color var(--d-state) var(--ease-standard);
  }

  /* THE RULE BETWEEN THE TWO GROUPS, drawn by the third box in the room its margin leaves. */
  .code-box:nth-child(3) {
    margin-inline-end: var(--group);
  }

  .code-box:nth-child(3)::after {
    position: absolute;
    inset-block-start: calc(50% - 1px);
    inset-inline-start: calc(100% + (var(--box-gap) + var(--group)) / 2 - 4px);
    inline-size: 8px;
    block-size: 2px;
    background: var(--rule-strong);
    border-radius: var(--r-round);
    content: '';
  }

  /* THE BOX THE NEXT DIGIT GOES IN wears the focus ring, and a caret blinks in it. */
  .code-box[data-next] {
    outline: 2px solid var(--focus-ring);
    outline-offset: 0;
  }

  .code-caret {
    position: absolute;
    inset-block: 30%;
    inset-inline-start: calc(50% - 1px);
    inline-size: 2px;
    background: var(--ink);
    border-radius: var(--r-round);
    opacity: 0;
  }

  .code-box[data-next]:not([data-filled]) .code-caret {
    animation: code-blink 1s steps(1) infinite;
  }

  @keyframes code-blink {
    0%,
    50% {
      opacity: 1;
    }
    51%,
    100% {
      opacity: 0;
    }
  }

  /* A REFUSAL RINGS THE DIGITS IN THE RED THE SENTENCE IS IN; an approval in the green. */
  [data-shape='bad'] .code-box[data-filled] {
    outline: 2px solid var(--red);
    outline-offset: -2px;
  }

  [data-shape='good'] .code-box {
    outline: 2px solid var(--good);
    outline-offset: -2px;
  }

  /* CHECKING: the six dim and breathe while the record answers, and nothing moves. */
  [data-shape='checking'] .code-box {
    animation: code-check 900ms var(--ease-standard) infinite alternate;
  }

  @keyframes code-check {
    from {
      opacity: 1;
    }
    to {
      opacity: 0.45;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .code-box[data-next]:not([data-filled]) .code-caret {
      animation: none;
      opacity: 1;
    }

    [data-shape='checking'] .code-box {
      animation: none;
      opacity: 0.6;
    }
  }

  /* THE ONE REAL FIELD, unseen, over the boxes. At least 16px so a phone does not zoom into it, and its own caret and
     text hidden, since the boxes draw both. */
  .code-input {
    position: absolute;
    inset: 0;
    inline-size: 100%;
    block-size: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: transparent;
    caret-color: transparent;
    font-size: var(--fs-head);
    opacity: 0;
    cursor: text;
  }

  .code-input:focus-visible {
    /* focus-ok: the box the next digit goes in draws the ring (`.code-box[data-next]`). */
    outline: none;
  }

  .code-row :global(.btn) {
    flex: none;
    min-block-size: var(--box-h);
  }

  .code-said {
    margin: 0;
    color: var(--tone, var(--ink-2));
    font-size: var(--fs-meta);
    line-height: calc(18px * var(--type, 1));
    overflow-wrap: anywhere;
  }

  .code-said:empty {
    display: none;
  }

  .row-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin-block-start: var(--sp-1);
  }

  /* ── the approve page's size ─────────────────────────────────────────── */

  /* THE LABEL IS THE PAGE'S OWN SENTENCE, so it is kept for a screen reader and not drawn twice. */
  [data-size='lead'] .code-label {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  [data-size='lead'] {
    --box-w: 56px;
    --box-h: 64px;
    --group: 14px;
    gap: var(--sp-3);
    margin-block-start: 0;
  }

  /* THE BOXES TAKE THE SHEET'S WIDTH, up to 56 each, and the button the full width under them. */
  [data-size='lead'] .code-row {
    flex-direction: column;
    align-items: stretch;
    gap: var(--sp-4);
  }

  [data-size='lead'] .code-boxes {
    flex: none;
  }

  [data-size='lead'] .code-box {
    flex: 1 1 0;
    inline-size: auto;
    max-inline-size: var(--box-w);
    border-radius: var(--r-pop);
    font-size: var(--fs-hero);
  }

  [data-size='lead'] .code-row :global(.btn) {
    inline-size: 100%;
    min-block-size: var(--tap);
    justify-content: center;
  }

  [data-size='lead'] .code-said {
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }

  @media (width < 640px) {
    [data-size='lead'] {
      --box-h: 56px;
      --box-gap: 6px;
      --group: 10px;
    }

    [data-size='lead'] .code-box {
      font-size: var(--fs-page);
    }
  }

  @media (forced-colors: active) {
    .code-box {
      outline: 1px solid CanvasText;
    }
  }
</style>
