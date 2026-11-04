<!--
  What somebody said to Slash, in its bubble: the sentence, each row they mentioned highlighted as it was in the field, one
  press to the row. A mark the words do not bear out is left as words.
-->
<script lang="ts">
  import { at } from '../at.ts';
  import { hrefOfRef } from '../send/send.ts';
  import { sentPieces, tokenOf, type SentMention } from './mention.ts';

  let { text, mentions }: { text: string; mentions?: readonly SentMention[] | undefined } = $props();
  const pieces = $derived(sentPieces(text, mentions));
</script>

{#each pieces as p}{#if p.kind === 'text'}{p.text}{:else if hrefOfRef(p.ref)}<a class="spoken tap" href={at(hrefOfRef(p.ref) ?? '')} dir="auto">{tokenOf(p.text)}</a>{:else}<span class="spoken" dir="auto">{tokenOf(p.text)}</span>{/if}{/each}

<style>
  /* THE FIELD'S FILL, now with room of its own since nothing has to line up with a textarea. */
  .spoken {
    padding: 1px 3px;
    border-radius: 4px;
    background: color-mix(in oklab, var(--info) 18%, transparent);
    color: inherit;
    font-weight: var(--fw-medium);
    text-decoration: none;
    -webkit-box-decoration-break: clone;
    box-decoration-break: clone;
  }

  @media (hover: hover) {
    a.spoken:hover {
      text-decoration: underline;
      text-decoration-color: color-mix(in srgb, currentColor 40%, transparent);
      text-underline-offset: 3px;
    }
  }
</style>
