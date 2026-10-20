<!--
  THE SIX-DIGIT FIELD (AGT-A07), one component, drawn by Settings, Agents (first on the screen while a machine waits,
  and under the connect sheet's setup line otherwise) and by Home's connect sheet, so a first run from Home connects a
  machine start to finish without leaving it. The owner's only: approving is `owner` (`deviceApprove`), and each page
  that draws this draws it on its owner's arm alone.

  A `<form>`, so Enter sends it. Paste is never blocked and there is no `maxlength`: the CLI prints the code in two
  groups, and seven digits is refused out loud rather than trimmed to a different code (`code-form.ts`).

  ITS STYLES ARE ITS OWN, because Home's sheet has no `settings.css`: the field row is laid out here, and inside
  Settings the same class names take `settings.css`'s rules as they always did. It is loaded with the sheet, never with
  what every screen loads.
-->
<script lang="ts">
  import { TONES } from 'braindog-render';
  import { copy } from '$lib/copy.ts';
  import { methods, passkeySignIn, support } from '$lib/auth.ts';
  import { reprove } from '$lib/record/vault.ts';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';
  import Button from '$lib/ui/Button.svelte';
  import { CODE_PLACEHOLDER, retyped, saidOf, sent, type Approve } from './code-form.ts';
  import type { Answer } from '$lib/record/device.ts';

  let {
    approve,
    onchanged,
    id = 'user-code',
  }: {
    /** One approval of what was typed (`code-form.ts` `approverOf`). */
    approve: Approve;
    /** A machine was approved, so the connected list changed; awaited before the form is ready again. */
    onchanged?: (() => unknown) | undefined;
    /** The field's id, which its label and its sentence are tied to. */
    id?: string;
  } = $props();

  let typed = $state('');
  let answer = $state<Answer | null>(null);
  let approving = $state(false);

  function retype(value: string) {
    ({ typed, answer } = retyped(value));
  }

  async function tryCode(e?: SubmitEvent) {
    e?.preventDefault();
    if (approving) return;
    approving = true;
    const busy = opened();
    const out = await sent(typed, approve);
    closed(true, busy);
    approving = false;
    ({ typed, answer } = out);
    if (out.changed) await onchanged?.();
  }

  /* What the status line under the field says, or nothing. */
  const said = $derived(saidOf(answer));

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

<form class="code-form field-row" onsubmit={tryCode} novalidate>
  <label class="field-row-label" for={id}>{copy.codeLabel}</label>
  <div class="field-row-controls">
    <div class="field field-lg">
      <input
        class="field-input code-input"
        {id}
        type="text"
        inputmode="numeric"
        autocomplete="one-time-code"
        autocapitalize="off"
        spellcheck="false"
        placeholder={CODE_PLACEHOLDER}
        value={typed}
        oninput={(e) => retype((e.currentTarget as HTMLInputElement).value)}
        aria-describedby="{id}-said"
        aria-invalid={said?.invalid ? 'true' : undefined}
      />
    </div>
    <Button weight="primary" type="submit" disabled={approving}>{copy.codeGo}</Button>
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

<style>
  /* THE FIELD ROW, laid out here as `settings.css` lays it out under `.settings-place`, with the same values, so the
     form reads the same in Settings and in Home's sheet: the label above, then the field and its button at one height,
     wrapping to two lines where they stop fitting side by side. Nothing here sets a colour: the ring is `controls.css`'s,
     on the wrapper, and the answer's tone comes from `[data-intent]`. */
  .code-form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
    max-inline-size: var(--measure);
  }

  .field-row-label {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  .field-row-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-2);
  }

  /* THE SIX-DIGIT FIELD KEEPS ITS OWN WIDTH rather than taking the row as a field row's field does, for the reason
     `.code-input` gives below. A `.field-lg` is 44px at every width (`controls.css`), the thumb's target. */
  .field-row-controls .field {
    flex: 0 1 auto;
    min-block-size: var(--ctl-h);
  }

  .field-row-controls :global(.btn) {
    flex: none;
    min-block-size: var(--ctl-h);
  }

  /* UNDER A THUMB THE BUTTON MEETS THE FIELD: the input keeps the whole 44, and the field around it is the input plus
     its two border pixels, so the button takes the same height. */
  @media (pointer: coarse) {
    .field-row-controls :global(.btn) {
      min-block-size: calc(var(--ctl-h) + 2px);
    }
  }

  /* SIX DIGITS AND NO MORE ROOM THAN SIX DIGITS NEED. A field stretched across the panel invites a sentence; one sized
     to its content says what belongs in it without a word. `ch` on a tabular face is the honest unit, and
     `font-variant-numeric` keeps the six from jumping about as they are typed. */
  .code-input {
    flex: 0 1 12ch;
    font-size: var(--fs-body);
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.18em;
  }

  .code-said {
    margin: 0;
    color: var(--tone, var(--ink-2));
    font-size: var(--fs-meta);
  }

  .row-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
  }
</style>
