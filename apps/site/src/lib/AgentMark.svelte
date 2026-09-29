<!--
  An agent's mark on the site: its maker's own logo (`agent-marks.ts`), the owner's "use real ones" of 30 September 2026.
  Claude and Gemini wear their makers' colours; the marks drawn in black or white take the ink of what holds them.
  Always decoration: the agent's name is in words beside every one.
-->
<script lang="ts">
  import { AGENT_MARKS, type MarkedAgent } from './agent-marks.ts';

  let { agent }: { agent: MarkedAgent } = $props();

  const mark = $derived(AGENT_MARKS[agent]);
</script>

<svg class="agent-mark" data-tone={mark.tone} viewBox="0 0 24 24" aria-hidden="true" focusable="false"
  ><path d={mark.d} fill-rule={mark.rule} clip-rule={mark.rule} /></svg
>

<style>
  .agent-mark {
    display: block;
    inline-size: 60%;
    block-size: 60%;
    fill: currentColor;
  }

  .agent-mark[data-tone='claude'] {
    fill: var(--agent-claude);
  }

  .agent-mark[data-tone='gemini'] {
    fill: var(--agent-gemini);
  }

  @media (forced-colors: active) {
    .agent-mark {
      fill: CanvasText;
    }
  }
</style>
