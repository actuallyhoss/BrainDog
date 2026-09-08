<!--
  One clause, in the sentence that needs it, and never again — `19 §6`.

  IT IS NOT A TOOLTIP AND NOT A DISCLOSURE. Both were tried in the drafts this replaces and both are
  named in the rule as the wrong answer: a tooltip is invisible on a phone and to a keyboard, and a
  disclosure asks somebody who does not yet know the word to decide whether they want to know it.
  The clause is simply in the line, the first time, and then it is gone for good.

  IT RENDERS NOTHING AT ALL AFTER THE FIRST TIME, including the element. A `<span>` that is empty is
  still a node in the accessibility tree and still a gap in the flex row that holds it.

  IT SPENDS THE NOUN AT CONSTRUCTION, so it must only be constructed where it will be SEEN. A
  `<dialog>` renders its children whether or not it is showing; so does any branch of a component
  that is mounted and hidden with CSS. Put this behind the same condition that decides whether the
  reader is looking at it, or the one chance the word gets is spent off screen.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import { teach, type Noun } from '$lib/define.svelte.ts';

  let { noun }: { noun: Noun } = $props();

  /**
   * ASKED ONCE, AT CONSTRUCTION, and never re-evaluated.
   *
   * A `$derived` would re-run when anything it touched changed and could flip the clause off
   * mid-read — the definition disappearing out from under somebody's eyes as they navigate a
   * neighbouring control. The answer for this instance is fixed the moment it exists.
   */
  /* AND SVELTE IS RIGHT THAT IT ONLY CAPTURES THE INITIAL VALUE — that is the requirement. Each of
     these is written with a literal noun at its call site, so the prop cannot change; and if it
     could, re-running would spend a second word without anybody having read the first. */
  // svelte-ignore state_referenced_locally
  const say = teach(noun) ? copy.defines[noun] : null;
</script>

<!-- A CLAUSE IS PART OF A SENTENCE AND ENDS LIKE ONE. Every call site puts this at the end of a
     line, and the line already ended with a full stop before the dash arrived — so `/start` read
     "One real row is enough. You can delete it later. — one thing in a list. It has a number you can
     say", a fragment trailing off a finished paragraph. The clause closes itself. -->
{#if say}<span class="define">— {say}.</span>{/if}

<style>
  /* Dimmer and smaller than the sentence it joins: it is an aside inside a line, and a clause that
     competes with the noun it explains has made the line harder to read rather than easier. */
  .define {
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 400;
    letter-spacing: normal;
    text-transform: none;
  }
</style>
