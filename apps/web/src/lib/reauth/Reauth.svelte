<!--
  "Confirm it's you": the modal the step-up asks in (`ask.ts`), over whatever screen pressed.

  TWO WAYS, NEITHER LEAVES THE SCREEN. A passkey (the same assertion `/signin` uses, which makes the session's proof
  fresh) is the main action wherever this device can give one. Emailing a link is the other: it is sent to the address
  the session is for, and the modal waits, asking the account every few seconds, when the tab comes back into view, and
  when the sign-in page in another tab says it has just signed in, until the session's proof is newer than it was. The
  passkey needs no check that you are a person; the link does where the host asks for one, so the check is drawn here.

  WHEN IT PASSES, the call that asked is sent again by the client and the screen updates as though it had worked the
  first time. Cancel, Escape or the scrim leave it undone, and the screen says one plain line.

  A `<dialog>` opened with `showModal`, so the page under it is inert and the focus stays inside; centred from 900 up,
  and a bottom sheet on a phone, as every confirm is there.
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { overlays } from '$lib/a11y/keys.svelte.ts';
  import { signinFor } from '$lib/at.ts';
  import { scrims } from '$lib/ui/panel.ts';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Human from '../../routes/signin/Human.svelte';
  import { answered, type Ask } from './ask.ts';

  let { ask }: { ask: Ask } = $props();

  type Auth = typeof import('$lib/auth.ts');
  type Me = { person: string; email: string; provedAt: number };

  const uid = $props.id();
  let el = $state<HTMLDialogElement>();
  /** The caret goes to the step's main button, so Enter does the obvious thing and Escape still cancels. */
  const focusMain = (): void => void tick().then(() => el?.querySelector<HTMLElement>('[data-main]')?.focus());

  let auth: Auth | null = null;
  /** Who the session is for, and when it last proved it, as the account said on opening. */
  let me = $state<Me | null>(null);
  let passkeyHere = $state(true);
  let linkHere = $state(true);
  let siteKey = $state<string | null>(null);

  /** `choose` the way; `mail` the check before the link goes; `sent` waiting for the link to be opened. */
  let step = $state<'choose' | 'mail' | 'sent'>('choose');
  let busy = $state<'passkey' | 'send' | null>(null);
  let line = $state('');
  let human = $state<string | null>(null);
  let humanBox = $state<{ reset: () => void } | null>(null);
  let done = false;

  const words = {
    title: "Confirm it's you",
    why: 'It has been a while since you signed in here.',
    passkey: 'Use your passkey',
    passkeyBusy: 'Waiting for your passkey',
    mail: 'Email me a link',
    send: 'Send the link',
    sending: 'Sending',
    again: 'Send it again',
    cancel: 'Cancel',
    sent: (email: string) => `We sent a link to ${email}. Open it on this device and this will carry on by itself.`,
    waiting: 'Waiting for you to open the link',
    check: 'Finish the check above first.',
    other: (email: string) => `That passkey belongs to another account. Use the one for ${email}.`,
    failed: 'That did not work. Try again, or email yourself a link.',
    locked: 'Too many tries. Wait a few minutes, or email yourself a link.',
    unreached: 'BrainDog could not be reached. Check your connection, then try again.',
    noLink: 'The link could not be sent. Try again in a moment.',
    nothing: 'Neither a passkey nor an email link works here. Sign in again from the sign-in page.',
    signin: 'Open the sign-in page',
  } as const;

  const loadAuth = async (): Promise<Auth> => (auth ??= await import('$lib/auth.ts'));

  /** The session as the account says it now, or `null` when it could not say. */
  async function whoNow(): Promise<Me | null> {
    const a = await loadAuth();
    const said = await a.methods();
    if (!said.ok || said.value.me === null) return null;
    const m = said.value.me;
    return { person: m.person, email: m.email, provedAt: m.provedAt };
  }

  onMount(() => {
    const dialog = el;
    if (!dialog) return;
    dialog.showModal();
    overlays.open();
    const lift = scrims.lay();
    focusMain();
    void (async () => {
      const a = await loadAuth();
      const here = a.support();
      const said = await a.methods();
      if (said.ok) {
        const m = said.value.me;
        me = m === null ? null : { person: m.person, email: m.email, provedAt: m.provedAt };
        passkeyHere = here.webauthn && here.secure && said.value.passkey;
        linkHere = said.value.magic === true && me !== null;
        siteKey = said.value.turnstile ?? null;
      } else {
        passkeyHere = here.webauthn && here.secure;
        linkHere = false;
      }
      focusMain();
    })();
    return () => {
      if (dialog.open) dialog.close();
      overlays.close();
      lift();
      stopWatching();
    };
  });

  function finish(proved: boolean): void {
    if (done) return;
    done = true;
    answered(proved);
  }

  async function usePasskey(): Promise<void> {
    if (busy) return;
    busy = 'passkey';
    line = '';
    const a = await loadAuth();
    const out = await a.passkeySignIn();
    busy = null;
    if (out.ok) {
      if (me !== null && out.value.person !== me.person) {
        line = words.other(me.email);
        return;
      }
      finish(true);
      return;
    }
    if (out.kind === 'cancelled') return;
    line = out.kind === 'locked' ? words.locked : out.kind === 'unreachable' ? words.unreached : words.failed;
  }

  function chooseMail(): void {
    line = '';
    if (siteKey === null) void sendLink();
    else {
      step = 'mail';
      focusMain();
    }
  }

  async function sendLink(): Promise<void> {
    if (busy || me === null) return;
    if (siteKey !== null && human === null) {
      line = words.check;
      return;
    }
    busy = 'send';
    line = '';
    const a = await loadAuth();
    const next = `${location.pathname}${location.search}`;
    const out = await a.requestLink(me.email, next, undefined, human);
    busy = null;
    /* THE CHECK'S ANSWER IS GOOD ONCE, so it is asked again whatever came back. */
    humanBox?.reset();
    human = null;
    if (!out.ok) {
      line = out.kind === 'locked' ? words.locked : out.kind === 'unreachable' ? words.unreached : out.kind === 'refused' && out.fix ? out.fix : words.noLink;
      return;
    }
    step = 'sent';
    watch();
    focusMain();
  }

  /* ── waiting for the link ──────────────────────────────────────────────────────────────────────────────── */

  let timer: ReturnType<typeof setInterval> | null = null;
  let channel: BroadcastChannel | null = null;
  let looking = false;

  /** Ask the account whether the session is proved now, newer than it was when this opened. */
  async function look(): Promise<void> {
    if (looking || done || me === null) return;
    looking = true;
    const now = await whoNow().catch(() => null);
    looking = false;
    if (now !== null && now.person === me.person && now.provedAt > me.provedAt) finish(true);
  }

  const seen = (): void => {
    if (document.visibilityState === 'visible') void look();
  };

  function watch(): void {
    if (timer !== null) return;
    timer = setInterval(() => void look(), 3_000);
    document.addEventListener('visibilitychange', seen);
    addEventListener('focus', seen);
    try {
      channel = new BroadcastChannel('braindog.signin');
      channel.onmessage = () => void look();
    } catch {
      channel = null;
    }
  }

  function stopWatching(): void {
    if (timer !== null) clearInterval(timer);
    timer = null;
    document.removeEventListener('visibilitychange', seen);
    removeEventListener('focus', seen);
    channel?.close();
    channel = null;
  }

  /* ── leaving ───────────────────────────────────────────────────────────────────────────────────────────── */

  /** Escape: the dialog's own `cancel`, kept from closing it so the answer goes through `finish`. */
  function oncancel(e: Event): void {
    e.preventDefault();
    finish(false);
  }

  /** Closed by the browser without a `cancel` (a second Escape in a row may do that): still a Cancel, said once. */
  function onclose(): void {
    finish(false);
  }

  /** A press on the scrim, told by geometry as `Sheet.svelte` tells it; a keyboard click has no position. */
  function onclick(e: MouseEvent): void {
    if (!el || e.detail === 0 || e.target !== el) return;
    const r = el.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) finish(false);
  }
</script>

<dialog
  bind:this={el}
  class="reauth"
  aria-modal="true"
  aria-labelledby="{uid}-title"
  aria-describedby="{uid}-why"
  {oncancel}
  {onclose}
  {onclick}
>
  <div class="reauth-body">
    <span class="reauth-well" aria-hidden="true"><Icon name="key" size="m" /></span>
    <h2 class="reauth-title" id="{uid}-title">{words.title}</h2>
    <p class="reauth-why" id="{uid}-why">{ask.why ?? words.why}</p>

    {#if step === 'sent' && me !== null}
      <p class="reauth-line">{words.sent(me.email)}</p>
      <p class="reauth-wait" role="status"><span class="reauth-dot" aria-hidden="true"></span>{words.waiting}</p>
    {:else if step === 'mail' && siteKey !== null}
      <Human {siteKey} bind:answer={human} bind:this={humanBox} />
    {/if}

    {#if !passkeyHere && !linkHere && step === 'choose'}
      <p class="reauth-line">{words.nothing}</p>
    {/if}
    {#if line}<p class="reauth-problem" role="alert">{line}</p>{/if}
  </div>

  <div class="reauth-foot">
    {#if step === 'choose'}
      {#if passkeyHere}
        <Button weight="primary" data-main aria-busy={busy === 'passkey'} onclick={() => void usePasskey()}>{busy === 'passkey' ? words.passkeyBusy : words.passkey}</Button>
        {#if linkHere}<Button onclick={chooseMail} aria-busy={busy === 'send'}>{busy === 'send' ? words.sending : words.mail}</Button>{/if}
      {:else if linkHere}
        <Button weight="primary" data-main aria-busy={busy === 'send'} onclick={chooseMail}>{busy === 'send' ? words.sending : words.mail}</Button>
      {:else}
        <Button weight="primary" data-main href={signinFor(location)}>{words.signin}</Button>
      {/if}
    {:else if step === 'mail'}
      <Button weight="primary" data-main aria-busy={busy === 'send'} onclick={() => void sendLink()}>{busy === 'send' ? words.sending : words.send}</Button>
    {:else}
      <Button data-main aria-busy={busy === 'send'} onclick={() => (siteKey === null ? void sendLink() : (step = 'mail'))}>{busy === 'send' ? words.sending : words.again}</Button>
      {#if passkeyHere}<Button onclick={() => void usePasskey()}>{words.passkey}</Button>{/if}
    {/if}
    <Button weight="bare" onclick={() => finish(false)}>{words.cancel}</Button>
  </div>
</dialog>

<style>
  /* A TILE'S SURFACE OVER THE SCRIM, centred: no border, no shadow, no blur, radius 16. */
  .reauth {
    position: fixed;
    inset: 0;
    z-index: var(--z-sheet);
    box-sizing: border-box;
    inline-size: min(420px, calc(100vw - 2 * var(--gutter, 16px)));
    max-block-size: calc(100dvh - 2 * var(--sp-5) - var(--kb, 0px));
    margin: auto;
    padding: 0;
    overflow: auto;
    background: var(--tile);
    border: 0;
    border-radius: var(--r-tile);
    color: var(--ink);
  }

  .reauth::backdrop {
    background: var(--scrim);
  }

  .reauth-body {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--sp-5) var(--sp-5) var(--sp-4);
  }

  .reauth-well {
    display: grid;
    place-items: center;
    inline-size: 40px;
    block-size: 40px;
    background: var(--tile-2);
    border-radius: var(--r-ctl);
    color: var(--ink-2);
  }

  .reauth-title {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--fs-figure);
    font-weight: var(--fw-semi, 600);
    line-height: 1.2;
  }

  .reauth-why,
  .reauth-line {
    margin: 0;
    color: var(--ink-2);
    font-family: var(--font-ui);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }

  .reauth-why {
    color: var(--ink);
  }

  .reauth-wait {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  /* A QUIET DOT THAT BREATHES while it waits; reduced motion holds it still. */
  .reauth-dot {
    inline-size: 8px;
    block-size: 8px;
    background: var(--ink-3);
    border-radius: var(--r-round);
    animation: reauth-wait 1.6s ease-in-out infinite;
  }

  @keyframes reauth-wait {
    50% {
      opacity: 0.3;
    }
  }

  .reauth-problem {
    margin: 0;
    color: var(--red);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }

  /* THE PRIMARY LAST AT THE END EDGE from 900 up, as every sheet's foot. */
  .reauth-foot {
    display: flex;
    flex-direction: row-reverse;
    flex-wrap: wrap;
    justify-content: flex-start;
    gap: var(--sp-2);
    padding: 0 var(--sp-5) var(--sp-5);
  }

  /* ON A PHONE, A BOTTOM SHEET: full width, its top corners round, buttons stacked 44 tall, the main one on top. */
  @media (width < 900px) {
    .reauth {
      inset-block-start: auto;
      inset-block-end: var(--kb, 0px);
      inline-size: 100vw;
      max-inline-size: 100vw;
      margin-block-end: 0;
      border-end-start-radius: 0;
      border-end-end-radius: 0;
      padding-block-end: max(0px, calc(env(safe-area-inset-bottom) - var(--kb, 0px)));
    }

    .reauth-body {
      padding: var(--sp-5) var(--sp-4) var(--sp-4);
    }

    .reauth-foot {
      flex-direction: column;
      padding: 0 var(--sp-4) var(--sp-4);
    }

    .reauth-foot :global(.btn) {
      inline-size: 100%;
      min-block-size: 44px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .reauth-dot {
      animation: none;
    }
  }
</style>
