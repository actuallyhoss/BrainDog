<!--
  A writer, as a face: a disc with the initial, and you in ink.

  A FACE, NOT A NAME TAG in the identifier font, so a list of agents and people reads as somebody
  passing through rather than as a log file. One component, so a person is drawn one way wherever
  they turn up.

  AN INITIAL, NOT A PHOTO. `20 §6` refuses avatar stacks on a business record, and a letter in a
  disc is a face without inventing one. It is `aria-hidden` because the name always sits beside it.

  `s` is for an entry that is one line and not two (the log, a row's history), where the full disc
  would set the line's height.
-->
<script lang="ts">
  import { initialOf } from './face.ts';

  let {
    name,
    you = false,
    size = 'm',
  }: { name: string; you?: boolean | undefined; size?: 's' | 'm' | undefined } = $props();
</script>

<span class="face" data-you={you ? '' : undefined} data-size={size} aria-hidden="true">{initialOf(name)}</span>

<style>
  .face {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: 28px;
    block-size: 28px;
    background: var(--hold-wash);
    border-radius: var(--r-pill);
    color: var(--ink2);
    font-size: var(--t-xs);
    font-weight: 650;
  }

  .face[data-size='s'] {
    inline-size: 22px;
    block-size: 22px;
  }

  /* YOU ARE THE INK DISC, NOT THE ACCENT ONE. The brand colour is kept for a short list of places
     (DESIGN-SYSTEM 1.3), and a face repeated down a log is a badge, which is not one of them. */
  .face[data-you] {
    background: var(--ink2);
    color: var(--bg);
  }
</style>
