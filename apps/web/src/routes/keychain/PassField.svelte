<!--
  One passphrase field: its label above, the field the full width of whatever holds it, and a show or hide button
  inside its trailing edge.

  THE BUTTON IS 44 BY 44 AT EVERY WIDTH, not only under a coarse pointer, because a passphrase is the one field on this
  screen a person most needs to check before pressing, and on a phone the eye is the thumb's target.

  A PASSWORD FIELD UNTIL ASKED, so the passphrase is not drawn while it is typed. `autocomplete` is the caller's: a new
  passphrase is `new-password`, so a password manager may offer to keep it, and one typed to open is `current-password`.
-->
<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import { words } from '$lib/record/keychain.ts';

  let {
    id,
    label,
    value = $bindable(''),
    hint,
    autocomplete,
    invalid = false,
  }: {
    id: string;
    label: string;
    value?: string;
    hint?: string | undefined;
    autocomplete: 'new-password' | 'current-password';
    invalid?: boolean;
  } = $props();

  let shown = $state(false);
</script>

<label class="field-label pass-label" for={id}>{label}</label>
<div class="field field-lg pass-field">
  <input
    class="field-input pass-input"
    {id}
    type={shown ? 'text' : 'password'}
    {autocomplete}
    autocapitalize="off"
    spellcheck="false"
    bind:value
    aria-describedby={hint ? `${id}-hint` : undefined}
    aria-invalid={invalid ? 'true' : undefined}
  />
  <button
    type="button"
    class="pass-show"
    aria-pressed={shown}
    aria-label={shown ? words.hidePass : words.showPass}
    aria-controls={id}
    onclick={() => (shown = !shown)}
  >
    <Icon name="eye" size="m" />
  </button>
</div>
{#if hint}<p class="pass-hint" id={`${id}-hint`}>{hint}</p>{/if}

<style>
  /* THE LABEL IS THE HOUSE FIELD LABEL (`controls.css` `.field-label`): meta size, the second ink, above the field. */
  .pass-label {
    margin-block-start: var(--sp-1);
  }

  /* THE FIELD TAKES THE WHOLE WIDTH it is given, and the button sits flush with its trailing edge. */
  .pass-field {
    inline-size: 100%;
    padding-inline-end: 0;
  }

  .pass-input {
    flex: 1 1 auto;
    min-inline-size: 0;
    font-size: var(--fs-body);
  }

  /* THE EYE SITS IN THE FIELD'S OWN FILL, a round target flush with its trailing edge. */
  .pass-show {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    inline-size: var(--tap);
    block-size: var(--tap);
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: var(--r-ctl);
    background: transparent;
    color: var(--ink-3);
    cursor: pointer;
    transition: color var(--d-state) var(--ease-out);
  }

  /* SHOWN IS INK, hidden is dim: the one glyph, and `aria-pressed` says which to a screen reader. */
  .pass-show[aria-pressed='true'] {
    color: var(--ink);
  }

  .pass-show:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: -2px;
  }

  @media (hover: hover) and (pointer: fine) {
    .pass-show:hover {
      color: var(--ink);
    }
  }

  .pass-hint {
    margin: 0 0 var(--sp-2);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: calc(18px * var(--type, 1));
  }
</style>
