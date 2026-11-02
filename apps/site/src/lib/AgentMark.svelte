<!--
  An agent's mark on the site: its maker's own logo, the owner's "use real ones" of 30 September 2026. The marks are
  the app's too, one copy in `packages/skin/agent-marks.ts`, so a path changed there changes on both.
  `id` names either an agent the record knows or one of the apps a person connects (ChatGPT, VS Code), and `markOf`
  draws both. `agent` is the older name for the same thing, kept for the pages that still pass it.
  Claude wears its clay, VS Code its blue and Gemini its own; the marks drawn in black or white take the ink of what
  holds them. Always decoration: the agent's name is in words beside every one.
-->
<script lang="ts">
  import { markOf, type AppMark, type MarkedAgent } from '@braindog/skin/agent-marks.ts';

  let { id, agent, size }: { id?: MarkedAgent | AppMark; agent?: MarkedAgent; size?: number } = $props();

  const mark = $derived(markOf((id ?? agent) as MarkedAgent | AppMark));
</script>

<svg
  class="agent-mark"
  data-tone={mark.tone}
  data-sized={size ? '' : undefined}
  width={size}
  height={size}
  viewBox="0 0 24 24"
  aria-hidden="true"
  focusable="false"><path d={mark.d} fill-rule={mark.rule} clip-rule={mark.rule} /></svg
>

<style>
  .agent-mark {
    display: block;
    flex: none;
    inline-size: 60%;
    block-size: 60%;
    fill: currentColor;
  }

  /* Given a size, the mark keeps it, whatever holds it. */
  .agent-mark[data-sized] {
    inline-size: auto;
    block-size: auto;
  }

  .agent-mark[data-tone='claude'] {
    fill: var(--agent-claude);
  }

  .agent-mark[data-tone='vscode'] {
    fill: var(--agent-vscode);
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
