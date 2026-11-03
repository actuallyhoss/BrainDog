<!--
  The name for a new record, checked as it is typed.

  ONE FIELD FOR BOTH PLACES A NAME IS ASKED: the first step of sign-up and the no-record state on `/start`, so the two
  cannot come to disagree about what a name may be. The text is turned into an address as it is typed (`nameOf`), and
  the Directory's own answer (`checkName`) says whether it can be had, a moment after the typing stops.

  `free` IS TRUE ONLY FOR THE NAME ON SCREEN NOW. Every keystroke sets it false before the check goes out, and an
  answer for a name that is no longer typed is dropped, so a press can never pay for a name that was checked a moment
  ago and then changed.

  THE ANSWER IS A STATUS, A 6PX DOT AND ITS WORD: green for a name that is free, the second ink for
  one that is taken or could not be checked. Never red: a taken name is a thing to change, not a thing that needs him.
  Under it, once something is typed, the address the name becomes, in the mono face, so the person reads what they get.
-->
<script lang="ts">
  import { BASE } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { checkName, nameOf } from '$lib/signup.ts';

  let {
    value = $bindable(''),
    free = $bindable(false),
    id = 'record-name',
  }: { value?: string; free?: boolean; id?: string } = $props();

  let why = $state<string | null>(null);
  let checking = $state(false);
  /* WHICH CHECK IS THE LATEST. Not state: nothing draws from it, and reading it inside the effect must not re-run it. */
  let asked = 0;

  $effect(() => {
    const slug = value;
    free = false;
    why = null;
    const n = ++asked;
    if (slug === '') {
      checking = false;
      return;
    }
    checking = true;
    /* A PAUSE IN TYPING, NOT EVERY KEY: the check is a request, and a name typed at speed would be a dozen of them. */
    const timer = setTimeout(() => {
      void checkName(slug).then((out) => {
        if (n !== asked) return;
        checking = false;
        if (!out.ok) {
          why = out.kind === 'refused' && out.fix ? out.fix : copy.signupNameUnreachable;
          return;
        }
        free = out.value.free && out.value.slug === slug;
        why = out.value.free ? null : out.value.why;
      });
    }, 300);
    return () => clearTimeout(timer);
  });

  const help = $derived(checking ? copy.signupNameChecking : why !== null ? why : free ? copy.signupNameFree : copy.signupNameHint);
  /** Which dot the line carries: a free name, a name that cannot be had, or none while checking or before typing. */
  const tone = $derived(checking ? undefined : why !== null ? 'no' : free ? 'free' : undefined);
  /** The record's address this name becomes: the app's own host, then `/<name>` (where sign-up lands it). */
  const address = $derived(value === '' ? null : `${globalThis.location?.host ?? ''}${BASE}/${value}`);
</script>

<div class="name">
  <label class="field-label" for={id}>{copy.signupNameLabel}</label>
  <span class="field" data-bad={why !== null ? '' : undefined}>
    <input
      {id}
      class="field-input"
      type="text"
      inputmode="url"
      autocomplete="off"
      spellcheck="false"
      autocapitalize="none"
      required
      maxlength="32"
      aria-describedby={`${id}-help`}
      aria-invalid={why !== null}
      {value}
      oninput={(e) => {
        const typed = nameOf(e.currentTarget.value);
        /* THE FIELD SHOWS WHAT WILL BE ASKED FOR, so a capital or a space turns into the address as it is typed. */
        e.currentTarget.value = typed;
        value = typed;
      }}
    />
  </span>
  <p class="help" data-tone={tone} id={`${id}-help`} aria-live="polite">
    {#if tone}<span class="dot" aria-hidden="true"></span>{/if}<span class="said">{help}</span>
  </p>
  {#if address}<p class="where">{address}</p>{/if}
</div>

<style>
  .name {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }

  /* 8 under the field, and the address 2 under the line (the board's spacing). */
  .help {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    margin: var(--sp-2) 0 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
    overflow-wrap: anywhere;
  }

  .help[data-tone] {
    color: var(--ink-2);
    font-weight: 500;
  }

  .help[data-tone='free'] {
    color: var(--ink);
  }

  /* THE DOT SITS ON THE BASELINE, so it stands level with the first line's lower-case letters however the line wraps. */
  .dot {
    flex: none;
    inline-size: var(--dot);
    block-size: var(--dot);
    border-radius: var(--r-ctl);
    background: var(--ink-2);
  }

  .said {
    min-inline-size: 0;
  }

  .help[data-tone='free'] .dot {
    background: var(--good);
  }

  .where {
    margin: 2px 0 0;
    color: var(--ink-2);
    font-family: var(--font-mono);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
    overflow-wrap: anywhere;
  }

  /* UNDER A THUMB THE FIELD READS AT 16, the phone's body size, below which a phone's browser zooms in on focus. */
  @media (pointer: coarse) {
    .field-input {
      font-size: var(--fs-body);
    }
  }

  @media (forced-colors: active) {
    .dot {
      background: CanvasText;
    }
  }
</style>
