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
  import Icon from './Icon.svelte';

  let {
    name,
    you = false,
    size = 'm',
  }: { name: string; you?: boolean | undefined; size?: 's' | 'm' | undefined } = $props();

  const glyph = $derived(/(^|\s)rule$/i.test(name.trim()) ? 'filter' : /^the record/i.test(name.trim()) ? 'rows' : /^the assistant$/i.test(name.trim()) ? 'ask' : null);
</script>

<!-- A RULE, THE RECORD AND THE ASSISTANT ARE NOT PEOPLE, SO THEY DO NOT WEAR AN INITIAL (DESIGN-SYSTEM
     APPENDIX C6). `R` stood for a reply rule, a renewal rule and the record itself on one screen. A
     rule takes the glyph the inbox gives rules, the record its own list glyph, the assistant the ask. -->
<span class="face" data-you={you ? '' : undefined} data-size={size} data-kind={glyph ? '' : undefined} aria-hidden="true"
  >{#if glyph}<Icon name={glyph} size="s" />{:else}{initialOf(name)}{/if}</span
>

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
    font-weight: 600;
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
