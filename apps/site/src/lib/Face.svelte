<!--
  A writer, as a face: a disc with the initial, the way the record app draws one.

  AN INITIAL, NOT A PHOTO, for the app's reason (`apps/web/src/lib/ui/Face.svelte`): a letter in a
  disc is a face without inventing one, and the name always sits beside it, so it is `aria-hidden`.

  THE TINT IS THE SITE'S, and the only thing here the app does not do. The demo has two agents whose
  names start with C, and on a page a stranger reads for ten seconds two identical grey discs read as
  one writer twice. So each kind of writer takes one of the four glyph hues: you in the accent, as in
  the app, Claude and Codex in two others, and a rule in a third. The word beside it is the meaning.
-->
<script lang="ts">
  import type { Hue } from './icons.ts';

  let { name, size = 'm' }: { name: string; size?: 's' | 'm' } = $props();

  const HUES: Record<string, Hue> = { you: 'accent', claude: 'warn', codex: 'info' };

  const key = $derived(name.trim().toLowerCase());
  const hue = $derived(HUES[key] ?? (key.endsWith(' rule') ? 'earn' : undefined));
  const initial = $derived(name.trim().replace(/^the\s+/i, '').charAt(0).toUpperCase() || '?');
</script>

<span class="face" data-size={size} data-hue={hue} aria-hidden="true">{initial}</span>

<style>
  .face {
    display: inline-grid;
    flex: none;
    place-items: center;
    inline-size: 26px;
    block-size: 26px;
    background: var(--hue-wash, var(--hold-wash));
    border-radius: var(--r-pill);
    color: var(--hue, var(--ink2));
    font-size: var(--t-xs);
    font-weight: 650;
    line-height: 1;
  }

  .face[data-size='s'] {
    inline-size: 22px;
    block-size: 22px;
  }
</style>
