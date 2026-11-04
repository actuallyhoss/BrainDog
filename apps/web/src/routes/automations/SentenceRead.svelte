<!--
  The sentence BrainDog read, drawn with each part a thing to press: the thing, the list, the condition, the timing and
  each action. Pressing one opens a short list of what the record's own declarations allow in its place (its lists, the
  fields and closed words of a list, its doors), and picking one asks the record to read the new sentence again, which
  is also what makes the 30-day look follow the change.

  NOTHING IS DECIDED HERE. A pick only returns the sentence it makes; the box above reads it and shows the answer.
  A part with nothing else to offer is plain words, so the sentence is not a row of buttons that do nothing.
-->
<script lang="ts">
  import Icon from '$lib/ui/Icon.svelte';
  import Menu from '$lib/ui/Menu.svelte';
  import type { SentenceParts } from '$lib/flow/source.ts';
  import { applyOption, composeSentence, isCurrent, sentenceWords as w, swapStep } from './sentence.ts';

  let {
    parts,
    disabled = false,
    onchange,
  }: {
    parts: SentenceParts;
    disabled?: boolean;
    /** The sentence a pick makes, to be read again. */
    onchange: (sentence: string) => void;
  } = $props();

  const texts = $derived(parts.trigger.map((p) => p.text));
</script>

<div class="said" role="group" aria-label={w.asRead}>
  <span>When </span>
  {#each parts.trigger as part, at (at)}
    {#if part.text === ''}
      <!-- A PART TAKEN AWAY LEAVES NO MARK. -->
    {:else if part.options && part.options.length > 0 && !disabled}
      <Menu label={w.pick(part.text)}>
        {#snippet trigger()}<span class="part">{part.text}</span>{/snippet}
        {#each part.options as option, i (i)}
          <button type="button" class="mi" role="menuitem" aria-current={isCurrent(parts.trigger, option) ? 'true' : undefined} onclick={() => onchange(composeSentence(applyOption(parts.trigger, option), parts.actions))}><Icon name="clock" size="s" />{option.label}</button>
        {/each}
      </Menu>
    {:else}
      <span class={part.kind === 'text' ? undefined : 'part'}>{part.text}</span>
    {/if}
  {/each}
  <span>, </span>
  {#each parts.actions as action, at (at)}
    {#if at > 0}<span> and </span>{/if}
    {#if parts.options.length > 0 && !disabled}
      <Menu label={w.pick(action)}>
        {#snippet trigger()}<span class="part">{action}</span>{/snippet}
        {#each parts.options as option, i (i)}
          <button type="button" class="mi" role="menuitem" aria-current={option.text === action ? 'true' : undefined} onclick={() => onchange(composeSentence(texts, swapStep(parts.actions, at, option.text)))}><Icon name="play" size="s" />{option.label}</button>
        {/each}
      </Menu>
    {:else}
      <span class="part">{action}</span>
    {/if}
  {/each}
  <span>.</span>
</div>

<style>
  /* THE SENTENCE RUNS AS TEXT, its menus inline, so it wraps as a line does. A part is underlined and nothing else:
     the page has no chip fill to spend on every word of a sentence. */
  .said {
    margin: 0;
    font-size: var(--fs-body);
    font-weight: 600;
    line-height: calc(26px * var(--type, 1));
    color: var(--ink);
  }

  .said :global(.menu-root) {
    display: inline-block;
  }

  .part {
    text-decoration: underline;
    text-decoration-style: dotted;
    text-underline-offset: 4px;
  }
</style>
