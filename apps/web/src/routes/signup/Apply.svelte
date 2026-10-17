<!--
  @component
  Sign-up by invitation, reached with no code: the page says so and offers a way in (LAUNCH 103, item 10). The site says
  nothing about invites and keeps "Start free"; only here, when the host is in invite mode and nobody is signed in, is
  a person told, and asked to apply. A code in the address (`#code=`) never reaches this screen: the page goes straight
  to sign-up with it.

  ONE FORM, FOUR QUESTIONS, two of them optional, and Cloudflare's check when the host gave a site key, drawn as the
  sign-up form draws it (`turnstile.ts`, `widgetWords`). Once the host has the application the form goes and one line
  says what happens next. Under it, always, the way to sign in.
-->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { at } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import Button from '$lib/ui/Button.svelte';
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

  const ready = $derived(!busy && name.trim() !== '' && email.trim() !== '' && (siteKey === null || human !== null));
  const waitsForCheck = $derived(!busy && name.trim() !== '' && email.trim() !== '' && siteKey !== null && human === null);

  const refusal = (out: Exclude<Applied, { ok: true }>): string =>
    out.why === 'limit' ? words.applyLimit(out.retryAfter ?? 900) : out.why === 'check' ? words.applyCheck : words.applyFailed;

  async function send(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    if (!ready) return;
    busy = true;
    said = null;
    const out = await sendApplication(liveIo, { name, email, use, link, ...(human !== null ? { turnstile: human } : {}) });
    busy = false;
    if (out.ok) {
      dropCheck();
      sent = true;
      return;
    }
    said = refusal(out);
    if (siteKey !== null) resetCheck();
  }
</script>

<div class="apply">
  <h1 class="title">{words.inviteTitle}</h1>
  {#if sent}
    <p class="lede" role="status">{words.applied}</p>
  {:else}
    <p class="lede">{words.inviteWhy}</p>
    <form class="form" onsubmit={send}>
      <div class="ask">
        <label class="field-label" for="apply-name">{words.applyName}</label>
        <span class="field field-lg">
          <input id="apply-name" class="field-input" type="text" autocomplete="name" required maxlength="120" bind:value={name} />
        </span>
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
            bind:value={email}
          />
        </span>
      </div>
      <div class="ask">
        <label class="field-label" for="apply-use">{words.applyUse} <span class="optional">{words.optional}</span></label>
        <span class="field field-lg">
          <input id="apply-use" class="field-input" type="text" maxlength="280" bind:value={use} />
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
            <div class="human-failed">
              <p class="human-line" role="alert">{checkWords.line}</p>
              <span class="human-again"><Button onclick={retryCheck}>{checkWords.again}</Button></span>
            </div>
          {/if}
        </div>
      {/if}
      {#if said}<p class="bad" role="alert">{said}</p>{/if}
      <div class="go">
        <Button weight="primary" type="submit" disabled={!ready} aria-busy={busy}>
          {busy ? words.applySending : waitsForCheck ? checkWords.send : words.applySend}
        </Button>
      </div>
    </form>
  {/if}
  <a class="link" href={at('/signin')}>{words.haveOne}</a>
</div>

<style>
  .apply {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  /* THE PAGE'S NAME AT 28 AND ONE HEADLINE SENTENCE AT 17, as every entry screen opens (DIRECTION §39). */
  .title {
    margin: 0;
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--t-title);
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 34px;
    text-wrap: balance;
    overflow-wrap: anywhere;
  }

  .lede {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-md);
    line-height: var(--lh-body);
    text-wrap: pretty;
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

  .optional {
    margin-inline-start: var(--sp-2);
    color: var(--dim);
    font-weight: 400;
  }

  .human {
    min-block-size: 65px;
    inline-size: 100%;
  }

  /* THE FAILED LINE AND ITS BUTTON IN ONE ROW, so the box keeps the 65px it held for the widget. */
  .human-failed {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: 65px;
  }

  .human-line,
  .bad {
    flex: 1;
    min-inline-size: 0;
    margin: 0;
    color: var(--danger-text);
    font-size: var(--t-base);
    line-height: var(--lh-body);
  }

  .human-again :global(.btn) {
    min-block-size: 44px;
  }

  .go {
    display: flex;
  }

  .go :global(.btn) {
    min-block-size: var(--tap);
  }

  @media (width < 900px) {
    .go :global(.btn) {
      inline-size: 100%;
    }
  }

  .link {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    min-block-size: var(--tap);
    margin-block-start: var(--sp-3);
    color: var(--link);
    font-size: var(--t-base);
    font-weight: 500;
  }
</style>
