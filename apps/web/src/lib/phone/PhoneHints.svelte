<!--
  The phone's two asks, one card at a time over the tab bar, each made once (`hints.ts` says when and why):

  - PUT BRAINDOG ON THE HOME SCREEN, on the second day this phone opens it. An iPhone is told where Safari keeps the
    step, since it has no install button a page can press; Android's own install prompt is opened by the card.
  - TURN NOTIFICATIONS ON, the first time Needs you holds something, where a push can arrive (the Home Screen app on an
    iPhone, or Android), and only when the host can send one. The press is the browser's permission question, which an
    iPhone allows only inside a press, and the same subscription Settings' switch makes (`push-ports.ts`).

  A CARD AND NOT A DIALOG: nothing behind it is blocked, and it can be ignored. It sits over the tab bar, clear of the
  home indicator, and leaves when answered; an unanswered one leaves with the screen it was shown on.
-->
<script lang="ts">
  import { onMount } from 'svelte';

  import { apiBase } from '$lib/at.ts';
  import { arrive } from '$lib/motion/index.ts';
  import Button from '$lib/ui/Button.svelte';
  import { hostKey, offerOf, turnOn } from '$lib/ui/push.ts';
  import { pushCan, pushPorts } from '$lib/ui/push-ports.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { haptic, isAndroid, isIOS, onPhone, standalone } from './device.ts';
  import { asked, markAsked, openedToday, words } from './hints.ts';

  /* `host`: only the Worker sends pushes, so a self-host is never asked for a key it does not have (as `PushToggle`). */
  let { waiting = 0, path = '', host }: { waiting?: number; path?: string; host?: 'cloud' | 'self-host' | undefined } = $props();

  type Prompted = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };

  let shown = $state<null | 'ios' | 'android' | 'push'>(null);
  let busy = $state(false);
  let days = 0;
  let offered: Prompted | null = null;
  let pushKey: Uint8Array<ArrayBuffer> | null = null;
  let pushAsked = false;

  /* THE INSTALL CARD, a few seconds into the second day's first screen, so it never lands on top of a page drawing. */
  function maybeInstall(): void {
    if (shown !== null || asked('install') || days < 2 || standalone() || !onPhone()) return;
    const which = isIOS() ? 'ios' : offered ? 'android' : null;
    if (which === null || !markAsked('install')) return;
    shown = which;
  }

  /* THE PUSH CARD, once something waits on him, where a push can arrive at all. */
  async function maybePush(): Promise<void> {
    if (pushAsked || shown !== null || waiting < 1 || host === 'self-host' || asked('push') || !onPhone()) return;
    if (!(standalone() || isAndroid())) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'default') return;
    pushAsked = true;
    const offer = offerOf(await hostKey(apiBase()), pushCan());
    if (offer?.can !== true || shown !== null || !markAsked('push')) return;
    pushKey = offer.key;
    shown = 'push';
  }

  onMount(() => {
    days = openedToday();
    /* ANDROID'S OWN PROMPT IS HELD, so it is offered by the card at the right moment and not by the browser at once. */
    const hold = (e: Event) => {
      e.preventDefault();
      offered = e as Prompted;
    };
    const installed = () => {
      offered = null;
      if (shown === 'android') shown = null;
    };
    window.addEventListener('beforeinstallprompt', hold);
    window.addEventListener('appinstalled', installed);
    const later = setTimeout(maybeInstall, 6_000);
    return () => {
      clearTimeout(later);
      window.removeEventListener('beforeinstallprompt', hold);
      window.removeEventListener('appinstalled', installed);
    };
  });

  /* WHEN SOMETHING FIRST WAITS, a moment after it is drawn. */
  $effect(() => {
    if (waiting < 1) return;
    const t = setTimeout(() => void maybePush(), 3_000);
    return () => clearTimeout(t);
  });

  /* AN UNANSWERED CARD LEAVES WITH ITS SCREEN: it was asked once, and moving on is an answer. */
  let from = '';
  $effect(() => {
    if (from !== '' && path !== from && shown !== null) shown = null;
    from = path;
  });

  async function install(): Promise<void> {
    const ask = offered;
    shown = null;
    if (!ask) return;
    offered = null;
    await ask.prompt().catch(() => {});
  }

  async function pushOn(): Promise<void> {
    if (busy || pushKey === null) return;
    busy = true;
    const said = await turnOn(pushPorts(), pushKey);
    busy = false;
    shown = null;
    if (said.kind === 'on') {
      haptic('done');
      toasts.push(words.pushDone, { intent: 'good' });
    } else toasts.push('line' in said ? said.line : 'fix' in said ? said.fix : '', { intent: 'warn' });
  }
</script>

{#if shown !== null}
  <aside class="hint" aria-label={shown === 'push' ? words.pushTitle : words.installTitle} in:arrive>
    {#if shown === 'push'}
      <p class="hint-title">{words.pushTitle}</p>
      <p class="hint-why">{words.pushWhy}</p>
      <div class="hint-acts">
        <Button weight="primary" disabled={busy} onclick={() => void pushOn()}>{words.pushOn}</Button>
        <Button weight="quiet" onclick={() => (shown = null)}>{words.notNow}</Button>
      </div>
    {:else}
      <p class="hint-title">{words.installTitle}</p>
      <p class="hint-why">{words.installWhy}</p>
      {#if shown === 'ios'}
        <p class="hint-step">
          {words.iosBefore}
          <!-- SAFARI'S OWN SHARE GLYPH, a box with an arrow out of its top, so the step points at what is on screen. -->
          <svg class="share" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4M7 10H5.5A1.5 1.5 0 0 0 4 11.5v8A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 18.5 10H17" /></svg>
          {words.iosAfter}
        </p>
        <div class="hint-acts"><Button weight="quiet" onclick={() => (shown = null)}>{words.gotIt}</Button></div>
      {:else}
        <div class="hint-acts">
          <Button weight="primary" onclick={() => void install()}>{words.install}</Button>
          <Button weight="quiet" onclick={() => (shown = null)}>{words.notNow}</Button>
        </div>
      {/if}
    {/if}
  </aside>
{/if}

<style>
  /* OVER THE TAB BAR AND CLEAR OF ITS EDGES, on the tile with the sheet's shadow, as wide as the phone less its gutter. */
  .hint {
    position: fixed;
    inset-block-end: calc(var(--tabbar) + var(--sp-3));
    inset-inline: calc(var(--sp-3) + env(safe-area-inset-left)) calc(var(--sp-3) + env(safe-area-inset-right));
    z-index: var(--z-toast);
    box-sizing: border-box;
    padding: var(--sp-4);
    border: 1px solid var(--rule);
    border-radius: var(--r-tile);
    background: var(--tile);
    box-shadow: var(--elev-popover);
  }

  /* THE KEYBOARD TAKES THE BOTTOM OF THE SCREEN, and a card over the keys would cover what is being typed. */
  :global(html[data-kb]) .hint {
    display: none;
  }

  .hint-title {
    margin: 0 0 var(--sp-1);
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: var(--fw-semi);
  }

  .hint-why,
  .hint-step {
    margin: 0 0 var(--sp-3);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lh-body);
  }

  .hint-step {
    color: var(--ink);
  }

  .share {
    inline-size: 18px;
    block-size: 18px;
    margin-inline: 2px;
    vertical-align: -3px;
    fill: none;
    stroke: var(--info, currentColor);
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .hint-acts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  /* FROM 900px THERE IS NO TAB BAR, and the card is not drawn at all: these are a phone's asks. */
  @media (width >= 900px) {
    .hint {
      display: none;
    }
  }
</style>
