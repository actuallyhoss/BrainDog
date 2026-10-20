<!--
  One sample's words, selectable, reporting where the selection starts and ends in the message as it arrived.

  THE TEXT IS ONE TEXT NODE, drawn as plain text and never through the renderer or {@html}, so an offset counted from
  the start of the element is an offset into the body the record holds, which is what `anchorsFor` is asked with.

  SELECTION WORKS BY TOUCH AS BY MOUSE, because it is the platform's own: a long press and the handles on a phone, a
  drag or a double click at a desk. The document's `selectionchange` is what both end in, so neither needs its own path.
-->
<script lang="ts">
  import { onMount } from 'svelte';

  let {
    body,
    label,
    onselect,
  }: {
    body: string;
    label: string;
    /**
     * A new selection in this sample, as offsets into `body` and its text.
     *
     * A SELECTION THAT GOES AWAY IS NOT REPORTED, because pressing the button that acts on it is what clears it on a
     * phone: reported, the press would find nothing selected by the time it landed.
     */
    onselect: (picked: { start: number; end: number; text: string }) => void;
  } = $props();

  let el = $state<HTMLElement | null>(null);

  function read() {
    const sel = typeof window === 'undefined' ? null : window.getSelection();
    if (!el || !sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.startContainer) || !el.contains(range.endContainer)) return;
    const before = document.createRange();
    before.selectNodeContents(el);
    before.setEnd(range.startContainer, range.startOffset);
    const start = before.toString().length;
    const text = range.toString();
    if (text.trim() === '') return;
    onselect({ start, end: start + text.length, text });
  }

  onMount(() => {
    document.addEventListener('selectionchange', read);
    return () => document.removeEventListener('selectionchange', read);
  });
</script>

<!-- A region a keyboard can reach, so the words can be selected with the keyboard's own selection keys too. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<p class="sample-text" bind:this={el} tabindex="0" aria-label={label}>{body}</p>

<style>
  .sample-text {
    margin: 0;
    padding: var(--sp-3);
    border: 1px solid var(--rule);
    border-radius: var(--r-pop);
    background: var(--board);
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    user-select: text;
    -webkit-user-select: text;
    -webkit-touch-callout: default;
    max-block-size: 50dvh;
    overflow-y: auto;
  }
</style>
