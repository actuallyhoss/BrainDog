<!--
  The mark an agent wears: its maker's own logo for a named agent (`@braindog/skin/agent-marks.ts`), and the app's glyph for a runner,
  Slash and an agent nobody names.

  THE OWNER ASKED FOR THE REAL ONES, so Claude is its clay starburst, Codex is OpenAI's, Cursor its cube, and so on, each at the size the glyph it replaces had.
  Claude and Gemini wear their makers' colours (`--agent-claude`, `--agent-gemini`); the marks drawn in black or white
  are `currentColor`, the ink of whatever holds them, so they turn over with the scheme.

  ALWAYS DECORATION. Every place that draws a mark names the agent in words beside it or in its label, so the drawing
  is hidden from a screen reader and never the only way to tell who did a thing.
-->
<script lang="ts">
  import { AGENT_GLYPHS, type AgentKind } from './agent-glyphs.ts';
  import { AGENT_MARKS, isMarked } from '@braindog/skin/agent-marks.ts';
  import Icon from './Icon.svelte';

  let { kind, size = 's' }: { kind: AgentKind; size?: 's' | 'm' | 'l' } = $props();

  const mark = $derived(isMarked(kind) ? AGENT_MARKS[kind] : null);
</script>

{#if mark}
  <svg class="agent-mark" data-size={size} data-tone={mark.tone} viewBox="0 0 24 24" aria-hidden="true" focusable="false"
    ><path d={mark.d} fill-rule={mark.rule} clip-rule={mark.rule} /></svg
  >
{:else if kind === 'slash'}
  <Icon name="slash" {size} />
{:else}
  <Icon name={AGENT_GLYPHS[kind]} {size} />
{/if}

<style>
  .agent-mark {
    display: block;
    flex: none;
    fill: currentColor;
  }

  .agent-mark[data-size='s'] {
    inline-size: var(--icon-s);
    block-size: var(--icon-s);
  }

  .agent-mark[data-size='m'] {
    inline-size: var(--icon-m);
    block-size: var(--icon-m);
  }

  .agent-mark[data-size='l'] {
    inline-size: var(--icon-l);
    block-size: var(--icon-l);
  }

  .agent-mark[data-tone='claude'] {
    fill: var(--agent-claude);
  }

  .agent-mark[data-tone='gemini'] {
    fill: var(--agent-gemini);
  }

  /* FORCED COLOURS: the system's text colour, as every other glyph in that mode, so a mark never vanishes into it. */
  @media (forced-colors: active) {
    .agent-mark {
      fill: CanvasText;
    }
  }
</style>
