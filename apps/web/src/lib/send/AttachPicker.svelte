<!--
  Attach a row by search: a field, and under it the rows that answer, each one press. The send sheet's "+" opens it. Only rows are offered, since a row is what can be attached; a search the record refuses is nothing found.
-->
<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { apiBase } from '../at.ts';
  import Icon from '../ui/Icon.svelte';
  import { refOfHref, sendWords, type Attached } from './send.ts';

  let { onpick, onclose, taken = [], start = '' }: { onpick: (a: Attached) => void; onclose: () => void; taken?: readonly string[]; start?: string } = $props();

  let q = $state(untrack(() => start));
  let field = $state<HTMLInputElement>();
  let hits = $state<Attached[]>([]);
  let cursor = $state(0);
  let asked = 0;
  const reader = import('../record/palette-live.ts').then((m) => m.paletteReader(apiBase()));

  onMount(() => field?.focus());

  $effect(() => {
    const text = q.trim();
    const mine = ++asked;
    if (text === '') {
      hits = [];
      return;
    }
    const wait = setTimeout(() => {
      void reader
        .then((r) => r.find(text, 8))
        .then((out) => {
          if (mine !== asked) return;
          hits = out.value.hits.flatMap((h): Attached[] => {
            const ref = refOfHref(h.href);
            return ref && !taken.includes(ref) ? [{ ref, label: h.title }] : [];
          });
          cursor = 0;
        });
    }, 120);
    return () => clearTimeout(wait);
  });

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onclose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      cursor = Math.min(hits.length - 1, cursor + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      cursor = Math.max(0, cursor - 1);
    } else if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
      const h = hits[cursor];
      e.preventDefault();
      if (h) onpick(h);
    }
  }
</script>

<div class="ap">
  <span class="ap-field">
    <Icon name="search" size="s" />
    <input
      bind:this={field}
      bind:value={q}
      {onkeydown}
      type="text"
      role="combobox"
      aria-expanded={hits.length > 0}
      aria-controls="send-attach-hits"
      aria-label={sendWords.attachFind}
      placeholder={sendWords.attachFind}
      autocomplete="off"
      spellcheck="false"
    />
  </span>
  {#if hits.length > 0}
    <ul class="ap-hits" id="send-attach-hits" role="listbox" aria-label={sendWords.attachFind}>
      {#each hits as h, i (h.ref)}
        <li role="option" aria-selected={i === cursor}>
          <button type="button" class="ap-hit tap" data-cursor={i === cursor ? '' : undefined} tabindex="-1" onmouseenter={() => (cursor = i)} onclick={() => onpick(h)}>
            <span class="ap-name" dir="auto">{h.label}</span>
          </button>
        </li>
      {/each}
    </ul>
  {:else if q.trim() !== ''}
    <p class="ap-none">{sendWords.attachNone}</p>
  {/if}
</div>

<style>
  .ap {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  .ap-field {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--ctl-h);
    padding-inline: var(--sp-3);
    background: var(--tile-2);
    border-radius: var(--r-ctl);
    color: var(--ink-3);
  }

  .ap-field input {
    flex: 1;
    min-inline-size: 0;
    padding: 0;
    background: none;
    border: 0;
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-ctl);
  }

  .ap-hits {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .ap-hit {
    display: flex;
    align-items: center;
    inline-size: 100%;
    min-block-size: 36px;
    padding-inline: var(--sp-3);
    background: none;
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-ctl);
    text-align: start;
    cursor: pointer;
  }

  .ap-hit[data-cursor] {
    background: var(--hover);
  }

  .ap-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ap-none {
    margin: 0;
    padding-inline: var(--sp-3);
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }
</style>
