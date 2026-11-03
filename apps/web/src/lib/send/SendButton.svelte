<!--
  "Send to Slash ▾": one control in two halves. The main half sends at once to the last target this kind of thing went to
  on this device (Slash, quick, the first time); the arrow opens the send sheet hung from the button. Both halves are the
  quiet rectangle every secondary button is, 1px apart, the outer corners rounded and the inner ones square.

  WHAT COMES BACK IS DRAWN BY THE HOST, on the row's strip (`SendStrip`), so the button says only where it sent.
  `openHere` is the sheet from the keyboard (`s`), hung from this button.
-->
<script lang="ts">
  import Icon from '../ui/Icon.svelte';
  import { toasts } from '../ui/toast.svelte.ts';
  import { deliver, sends } from './convos.svelte.ts';
  import { openSheet, type Preset } from './open.ts';
  import { lastFor, sendWords, type Attached } from './send.ts';

  let {
    kind,
    attach,
    project = null,
    size = 'm',
    fallback,
  }: {
    /** The kind of thing it sends (a row's list, `decide`, `run`, `sign`), which keeps its own last target. */
    kind: string;
    /** What goes with it, the thing itself first. */
    attach: Attached[];
    /** The project it is on, by its ref, for what Auto says. */
    project?: string | null | undefined;
    size?: 'm' | 'sm' | undefined;
    /** The question Slash is asked when nothing else is said. */
    fallback?: string | undefined;
  } = $props();

  let root = $state<HTMLElement>();
  let sending = $state(false);
  /* READ WHEN DRAWN AND AFTER EACH SEND, from here or the sheet, so the main half names where the next press goes. */
  const last = $derived((sends.n, lastFor(kind)));

  const ask = (preset?: Preset) => ({ kind, attach, anchor: root, project, ...(fallback ? { fallback } : {}), ...(preset ? { preset } : {}) });

  /** The sheet, hung from this button. */
  export function openHere(preset?: Preset): void {
    void openSheet(ask(preset));
  }

  async function now() {
    if (sending || attach.length === 0) return;
    sending = true;
    const l = last;
    const out = await deliver({
      kind,
      target: l.target,
      ...('kind' in l ? { label: l.label, targetKind: l.kind } : {}),
      mode: 'mode' in l ? l.mode : 'quick',
      note: '',
      fallback: fallback ?? sendWords.firstAsk(attach[0]?.label ?? ''),
      attach: attach.map((a) => a.ref),
      mayChange: false,
    });
    sending = false;
    if (!out.ok) {
      toasts.push(out.text, { intent: 'warn' });
      /* A TARGET GONE SINCE IT WAS LAST USED: the sheet, so another can be chosen. */
      openHere();
      return;
    }
    toasts.push(sendWords.sent(out.label));
  }
</script>

<span class="sb" data-size={size === 'sm' ? 'sm' : undefined} bind:this={root} role="group" aria-label={sendWords.sheet}>
  <!-- BUSY, NEVER DISABLED, WHILE IT SENDS (domains lane, 2 Nov): a disabled button drops the focus it holds to the page,
       so a keyboard that pressed Send to Slash started again from the top. `now()` ignores a second press. -->
  <button type="button" class="sb-main tap" aria-disabled={sending ? 'true' : undefined} aria-busy={sending} aria-label={sendWords.sendToFull(last.label)} title={sendWords.sendToFull(last.label)} onclick={() => void now()}>
    <Icon name="slash" size="s" /><span class="sb-words">{sendWords.sendToFull(last.label)}</span><span class="sb-short" aria-hidden="true">{sendWords.short}</span>
  </button>
  <button type="button" class="sb-more tap" aria-label={sendWords.more} aria-haspopup="dialog" title={sendWords.more} onclick={() => openHere()}>
    <Icon name="chevronDown" size="s" />
  </button>
</span>

<style>
  .sb {
    display: inline-flex;
    flex: none;
    gap: 1px;
    --sb-fill: var(--tile);
    --sb-h: var(--ctl-h);
  }

  :global(:is(.tile, .surface-card, .sheet, dialog, .menu, [data-surface='tile'], .block-slot)) .sb {
    --sb-fill: var(--soft-fill);
  }

  .sb[data-size='sm'] {
    --sb-h: var(--btn-h-sm);
  }

  .sb-main,
  .sb-more {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-2);
    min-block-size: var(--sb-h);
    background: var(--sb-fill);
    border: 0;
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    white-space: nowrap;
    cursor: pointer;
    transition: background var(--d-press) var(--ease-out);
  }

  .sb-main {
    padding-inline: var(--sp-3) var(--sp-2);
    /* ONE CAPSULE IN TWO HALVES (ops 4.8, 3 Nov). */
    border-start-start-radius: var(--r-pill);
    border-end-start-radius: var(--r-pill);
  }

  .sb-more {
    padding-inline: var(--sp-2) 10px;
    border-start-end-radius: var(--r-pill);
    border-end-end-radius: var(--r-pill);
    color: var(--ink-2);
  }

  .sb-main :global(.icon) {
    color: var(--ink-3);
  }

  .sb-words {
    overflow: hidden;
    max-inline-size: 220px;
    text-overflow: ellipsis;
  }

  .sb-main:active:not([aria-disabled='true']),
  .sb-more:active {
    background: color-mix(in oklab, var(--ink) 8%, var(--sb-fill));
  }

  .sb-main[aria-disabled='true'] {
    color: var(--ink-3);
    cursor: progress;
  }

  @media (hover: hover) and (pointer: fine) {
    .sb-main:hover:not([aria-disabled='true']):not(:active),
    .sb-more:hover:not(:active) {
      background: var(--hover);
    }
  }

  @media (pointer: coarse) {
    .sb {
      --sb-h: var(--tap);
    }
  }

  /* ON A PHONE THE MAIN HALF IS ITS GLYPH AND ONE WORD (Q46 of 29 October: the bare slash told nothing), so a head with
     its primary and its "…" still fits at 320; its full name is said to a reader and on a long press. */
  .sb-short {
    display: none;
  }

  @media (width < 640px) {
    .sb-words {
      display: none;
    }

    .sb-short {
      display: inline;
    }

    .sb-main {
      min-inline-size: var(--tap);
      padding-inline: var(--sp-2);
    }
  }

  @media (forced-colors: active) {
    .sb-main,
    .sb-more {
      border: 1px solid ButtonText;
    }
  }
</style>
