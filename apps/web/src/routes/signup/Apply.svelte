<!--
  @component
  Sign-up by invitation, reached with no code: the page says so and offers a way in. The site says
  nothing about invites and keeps "Start free"; only here, when the host is in invite mode and nobody is signed in, is
  a person told, and asked to apply. A code in the address (`#code=`) never reaches this screen: the page goes straight
  to sign-up with it.

  ONE FORM, FOUR QUESTIONS, two of them optional, and Cloudflare's check when the host gave a site key, drawn as the
  sign-up form draws it (`turnstile.ts`, `widgetWords`). Once the host has the application the form goes and one line
  says the invite will come, with the address under it in ink. Under it, always, the way to sign in.

  THE BUTTON IS NEVER GREYED FOR WHAT IS NOT TYPED YET (first F16): a greyed primary explains nothing. Pressed with a
  question left empty, the field takes focus and one line under it says why it is needed.
-->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { at } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import Button from '$lib/ui/Button.svelte';
  import Notice from '../signin/Notice.svelte';
  import { words as entryWords } from '../signin/words.ts';
  import { liveIo, sendApplication, type Applied } from './apply.ts';
  import { loadWidget, widgetWords, type WidgetState } from './turnstile.ts';
  import { words } from './words.ts';

  let { siteKey }: { siteKey: string | null } = $props();

  let name = $state('');
  let email = $state('');
  let use = $state('');
  let link = $state('');
  let busy = $state(false);
  let sent = $state(false);
  /** The address the application went from, said back under the thanks. */
  let sentFrom = $state('');
  /** Which needed answer was empty when the button was pressed, so its field says why, until it is typed. */
  let missing = $state<'name' | 'email' | null>(null);
  let nameField = $state<HTMLInputElement | undefined>(undefined);
  let emailField = $state<HTMLInputElement | undefined>(undefined);
  let said = $state<string | null>(null);

  /* ── Cloudflare's check, as the sign-up form draws it ────────────────────── */

  type Turnstile = { render: (el: HTMLElement, options: Record<string, unknown>) => string; reset: (id: string) => void; remove: (id: string) => void };
  const turnstileOf = (): Turnstile | null => (globalThis as { turnstile?: Turnstile }).turnstile ?? null;

  let widget = $state<HTMLElement | null>(null);
  let widgetId: string | null = null;
  let human = $state<string | null>(null);
  let widgetState = $state<WidgetState>('loading');
  const checkWords = $derived(widgetWords(widgetState));

  /* `size: 'flexible'` FILLS THE COLUMN, so the box stays inside the 16px gutter at 320 rather than a fixed 300px. */
  async function drawCheck(key: string, el: HTMLElement): Promise<void> {
    widgetState = 'loading';
    const state = await loadWidget({ doc: document });
    const t = turnstileOf();
    if (state === 'ready' && t && widgetId === null && el.isConnected) {
      widgetId = t.render(el, {
        sitekey: key,
        size: 'flexible',
        callback: (answer: string) => (human = answer),
        'expired-callback': () => (human = null),
        'error-callback': () => (human = null),
      });
    }
    widgetState = state === 'ready' && t ? 'ready' : 'failed';
  }

  $effect(() => {
    if (siteKey !== null && widget !== null && !sent) void drawCheck(siteKey, widget);
  });

  /* TRY AGAIN, after the script failed: a fresh tag, in the same held box. */
  function retryCheck(): void {
    if (siteKey !== null && widget !== null) void drawCheck(siteKey, widget);
  }

  /* THE ANSWER IS GOOD ONCE, so a refused send asks the check again. */
  function resetCheck(): void {
    human = null;
    const t = turnstileOf();
    if (t && widgetId !== null) t.reset(widgetId);
  }

  /* THE BOX LEAVES WITH THE FORM, and its widget with it. */
  function dropCheck(): void {
    try {
      if (widgetId !== null) turnstileOf()?.remove(widgetId);
    } catch {
      /* A widget Cloudflare already dropped has nothing to remove. */
    }
    widgetId = null;
    human = null;
  }
  onDestroy(dropCheck);

  /* ── sending ─────────────────────────────────────────────────────────────── */

  const waitsForCheck = $derived(!busy && name.trim() !== '' && email.trim() !== '' && siteKey !== null && human === null);

  const refusal = (out: Exclude<Applied, { ok: true }>): string =>
    out.why === 'limit' ? words.applyLimit(out.retryAfter ?? 900) : out.why === 'check' ? words.applyCheck : words.applyFailed;

  async function send(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    if (busy) return;
    if (name.trim() === '') return need('name');
    if (email.trim() === '' || emailField?.validity.valid === false) return need('email');
    missing = null;
    /* THE CHECK NOT DONE YET IS SAID ON THE BUTTON ITSELF (`checkWords.send`), so a press waits for it. */
    if (siteKey !== null && human === null) return;
    busy = true;
    said = null;
    const out = await sendApplication(liveIo, { name, email, use, link, ...(human !== null ? { turnstile: human } : {}) });
    busy = false;
    if (out.ok) {
      dropCheck();
      sentFrom = email.trim();
      sent = true;
      return;
    }
    said = refusal(out);
    if (siteKey !== null) resetCheck();
  }

  /** Point at the one empty answer: its field takes focus and its line says why. */
  function need(which: 'name' | 'email'): void {
    missing = which;
    (which === 'name' ? nameField : emailField)?.focus();
  }

  /* THE LINE GOES ONCE THE ANSWER IS TYPED. */
  $effect(() => {
    if ((missing === 'name' && name.trim() !== '') || (missing === 'email' && email.trim() !== '')) missing = null;
  });
</script>

<div class="apply">
  <h1 class="entry-title">{words.inviteTitle}</h1>
  {#if sent}
    <div class="thanks" role="status">
      <p class="entry-lede">{words.applied}</p>
      <p class="to">{sentFrom}</p>
    </div>
  {:else}
    <p class="entry-lede">{words.inviteWhy}</p>
    <form class="form" novalidate onsubmit={send}>
      <div class="ask">
        <label class="field-label" for="apply-name">{words.applyName}</label>
        <span class="field field-lg">
          <input
            id="apply-name"
            class="field-input"
            type="text"
            autocomplete="name"
            required
            maxlength="120"
            aria-invalid={missing === 'name' ? 'true' : undefined}
            aria-describedby={missing === 'name' ? 'apply-name-need' : undefined}
            bind:value={name}
            bind:this={nameField}
          />
        </span>
        {#if missing === 'name'}<p class="need" id="apply-name-need">{words.applyNeedsName}</p>{/if}
      </div>
      <div class="ask">
        <label class="field-label" for="apply-email">{words.applyEmail}</label>
        <span class="field field-lg">
          <input
            id="apply-email"
            class="field-input"
            type="email"
            inputmode="email"
            autocomplete="email"
            spellcheck="false"
            autocapitalize="none"
            required
            maxlength="254"
            placeholder={copy.emailLike}
            aria-invalid={missing === 'email' ? 'true' : undefined}
            aria-describedby={missing === 'email' ? 'apply-email-need' : undefined}
            bind:value={email}
            bind:this={emailField}
          />
        </span>
        {#if missing === 'email'}<p class="need" id="apply-email-need">{words.applyNeedsEmail}</p>{/if}
      </div>
      <div class="ask">
        <label class="field-label" for="apply-use">{words.applyUse} <span class="optional">{words.optional}</span></label>
        <span class="field field-lg">
          <textarea id="apply-use" class="field-input use-input" rows="2" maxlength="280" placeholder={words.applyUseLike} bind:value={use}></textarea>
        </span>
      </div>
      <div class="ask">
        <label class="field-label" for="apply-link">{words.applyLink} <span class="optional">{words.optional}</span></label>
        <span class="field field-lg">
          <input id="apply-link" class="field-input" type="text" autocomplete="url" spellcheck="false" autocapitalize="none" maxlength="200" bind:value={link} />
        </span>
      </div>
      {#if siteKey !== null}
        <!-- THE HELD BOX STAYS WHEN THE SCRIPT FAILS: its line and Try again sit in it, at its height. -->
        <div class="human" role="group" aria-label={copy.signupHuman} bind:this={widget}>
          {#if widgetState === 'failed'}
            <!-- ONE NOTICE, Try again at its end (UI pass, 3 Nov): the line said "Try again." beside a button that said it. -->
            <Notice tone="bad" role="alert">
              {entryWords.checkFailed}
              {#snippet action()}<Button size="sm" onclick={retryCheck}>{checkWords.again}</Button>{/snippet}
            </Notice>
          {/if}
        </div>
      {/if}
      {#if said}<p class="bad" role="alert">{said}</p>{/if}
      <div class="go">
        <Button weight="primary" type="submit" aria-busy={busy}>
          {busy ? words.applySending : waitsForCheck ? checkWords.send : words.applySend}
        </Button>
      </div>
      <p class="agree">
        {words.agree} <a class="link" href="https://brain.dog/legal/terms" target="_blank" rel="noopener">{words.terms}</a>
        {words.agreeAnd} <a class="link" href="https://brain.dog/legal/privacy" target="_blank" rel="noopener">{words.privacy}</a>.
      </p>
    </form>
  {/if}
  <p class="have">{words.haveAsk} <a class="link" href={at('/signin')}>{copy.signIn}</a></p>
</div>

<style>
  /* THE TITLE AND THE LINE UNDER IT ARE THE ENTRY SCREENS' OWN (`../signin/Entry.svelte`); this is the column. */
  .apply {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .thanks {
    display: grid;
    gap: var(--sp-1);
  }

  /* THE ADDRESS THE INVITE WILL COME TO, in ink on its own line, so a mistyped one is seen at once. */
  .to {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: calc(22px * var(--type, 1));
    overflow-wrap: anywhere;
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    margin-block-start: var(--sp-3);
    min-inline-size: 0;
  }

  .ask {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }

  .ask .field {
    inline-size: 100%;
  }

  /* TWO LINES FOR WHAT IT IS FOR, so the example in it is read whole and not cut at the field's edge. */
  .use-input {
    inline-size: 100%;
    padding-block: var(--sp-2);
    border: 0;
    background: none;
    color: var(--ink);
    font: inherit;
    line-height: calc(22px * var(--type, 1));
    resize: none;
  }

  .optional {
    margin-inline-start: var(--sp-2);
    color: var(--ink-3);
    font-weight: 400;
  }

  /* WHY A NEEDED ANSWER IS NEEDED, 8 under its field, in the second ink: a missing name is not an alarm. */
  .need {
    margin: var(--sp-2) 0 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .human {
    min-block-size: 65px;
    inline-size: 100%;
  }

  .bad {
    flex: 1;
    min-inline-size: 0;
    margin: 0;
    color: var(--red);
    font-size: var(--fs-body);
    line-height: calc(22px * var(--type, 1));
  }

  .go {
    display: flex;
  }

  .agree {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: calc(20px * var(--type, 1));
  }

  /* THE ONE PRESS IS THE COLUMN'S WIDTH, as every way in on sign in is. */
  .go :global(.btn) {
    inline-size: 100%;
    min-block-size: max(40px, var(--ctl-h));
  }

  /* THE WAY TO SIGN IN: the question in the second ink, and only "Sign in" the link, on a 44px line. */
  .have {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    column-gap: 0.3em;
    min-block-size: var(--tap);
    margin: var(--sp-2) 0 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: calc(22px * var(--type, 1));
  }

  .link {
    color: var(--red);
    font-weight: 500;
  }

  /* UNDER A THUMB EVERY FIELD READS AT 16, the size below which a phone's browser zooms the page in on focus. */
  @media (pointer: coarse) {
    .ask .field-input {
      font-size: var(--fs-body);
    }
  }
</style>
