<!--
  The name for a new record, checked as it is typed (`loop/finish/ops.md` OPS-17).

  ONE FIELD FOR BOTH PLACES A NAME IS ASKED: the first step of sign-up and the no-record state on `/start`, so the two
  cannot come to disagree about what a name may be. The text is turned into an address as it is typed (`nameOf`), and
  the Directory's own answer (`checkName`) says whether it can be had, a moment after the typing stops.

  `free` IS TRUE ONLY FOR THE NAME ON SCREEN NOW. Every keystroke sets it false before the check goes out, and an
  answer for a name that is no longer typed is dropped, so a press can never pay for a name that was checked a moment
  ago and then changed.
-->
<script lang="ts">
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
</script>

<div class="name">
  <label class="lbl" for={id}>{copy.signupNameLabel}</label>
  <span class="field field-lg" data-bad={why !== null ? '' : undefined}>
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
  <p class="help" class:bad={why !== null} class:good={free && !checking} id={`${id}-help`} aria-live="polite">{help}</p>
</div>

<style>
  .name {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .lbl {
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  /* A label to its field is 8, a field to its help 4 (design-brief §3), so the help pulls back half the gap. */
  .help {
    margin-block-start: calc(var(--sp-1) - var(--sp-2));
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
    overflow-wrap: anywhere;
  }

  .help.bad {
    color: var(--danger);
  }

  .help.good {
    color: var(--earn);
  }

  .field[data-bad] {
    border-color: var(--danger);
  }
</style>
