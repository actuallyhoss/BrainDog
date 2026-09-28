<!--
  An agent's run, as a face: the glyph for the kind of agent inside a disc washed in the run's own hue, and a ring in
  that hue while the run is open (agents C11).

  THE GLYPH SAYS WHAT, THE HUE SAYS WHICH. Two Claude runs at once share a glyph, so the colour comes from the run's
  number and not from the agent (`runHue` in `face.ts`): side by side they are two faces, and a log line from either
  can be told apart from the other at a glance. The disc keeps the hue after the run stops, so an old line in the
  history still says which run wrote it; only the ring goes.

  THE RING IS WHERE THE RUN IS: solid while it works, dashed once it has gone quiet but is still open, and absent when
  it has stopped. A shape and not a colour, so the three read the same in both schemes and to a reader who does not
  see the hue.

  A DOOR TO THE RUN. A face that names a run is a link to the run's own page, which reads as a handoff (`r/[register]/
  [seq]`, the session header). Its name is what it does and where the run is, since the ring is not read out; a face
  that names no run is decoration, and hidden, because the agent's name sits beside it.

  TWO SIZES (AGT-13): `m` is 32px, a list's or a card's, and `s` is 24px, a line of text's. The ring is two pixels at
  both, with a hair of the ground inside it, so at 390px it is still a ring and not a heavier disc.
-->
<script lang="ts">
  import { at } from '../at.ts';
  import { AGENT_GLYPHS, agentKindOf, faceWords, runHue, runSeq, type RunLive } from './face.ts';
  import Icon from './Icon.svelte';

  let {
    agent,
    run,
    live,
    project = null,
    size = 'm',
  }: {
    /** The kind of agent, as its id (`claude`), signature (`agent:claude`) or name (`Claude`); null when nobody said. */
    agent: string | null;
    /** The run, as it signs (`S42`); a run that is not one draws the face with no hue and no door. */
    run: string;
    live: RunLive;
    /** The project the run was placed in, as its mark and hue, worn as a badge on the list size. */
    project?: { mark: string | null; hue: number | null } | null | undefined;
    size?: 's' | 'm' | undefined;
  } = $props();

  const kind = $derived(agentKindOf(agent));
  const seq = $derived(runSeq(run));
  const hue = $derived(seq === null ? null : runHue(seq));
  /* THE BADGE ONLY ON THE LIST SIZE: at 24px a second mark in the corner is a smudge, and the line beside it names the
     project in words anyway. */
  const badge = $derived(size === 'm' && project?.mark ? project : null);
</script>

{#snippet inside()}{#if kind === 'slash'}<svg class="agent-face-slash" viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 4.5 8.5 19.5" /></svg
  >{:else}<Icon name={AGENT_GLYPHS[kind]} size="s" />{/if}{#if badge}<span
      class="agent-face-project"
      data-hued={badge.hue === null ? undefined : ''}
      style={badge.hue === null ? undefined : `--project-hue:${badge.hue}`}
      aria-hidden="true">{badge.mark}</span
    >{/if}{/snippet}

{#if seq !== null}
  <!-- `.tap`: the disc is 24 or 32px, and a door a thumb presses is 44 either way (design 6.6), so the hit box grows
       round it and the drawing stays the size the line needs. -->
  <a
    class="face agent-face tap"
    href={at(`/r/session/${seq}`)}
    data-agent={kind}
    data-live={live}
    data-size={size}
    data-hued=""
    style="--run-hue:{hue}"
    aria-label="{faceWords.openRun}, {faceWords.live[live]}">{@render inside()}</a
  >
{:else}
  <span class="face agent-face" data-agent={kind} data-live={live} data-size={size} aria-hidden="true">{@render inside()}</span>
{/if}

<style>
  .agent-face {
    position: relative;
    display: grid;
    flex: none;
    place-items: center;
    box-sizing: border-box;
    inline-size: 32px;
    block-size: 32px;
    background: var(--hold-wash);
    border: 2px solid transparent;
    border-radius: var(--r-pill);
    color: var(--ink);
    text-decoration: none;
  }

  .agent-face[data-size='s'] {
    inline-size: 24px;
    block-size: 24px;
  }

  /* THE RUN'S HUE, WASHED INTO THE GROUND as a person's is (`Face.svelte`), so the glyph stays in ink and reads the
     same on every hue and in both schemes. */
  .agent-face[data-hued] {
    background: color-mix(in srgb, oklch(var(--mark-l) var(--mark-c) var(--run-hue)) 30%, var(--bg));
  }

  /* THE RING, with a hair of the ground inside it so it reads as a ring around the disc and not as a darker disc. */
  .agent-face[data-hued][data-live='working'],
  .agent-face[data-hued][data-live='quiet'] {
    border-color: oklch(var(--mark-l) var(--mark-c) var(--run-hue));
    box-shadow: inset 0 0 0 1px var(--bg);
  }

  .agent-face[data-live='quiet'] {
    border-style: dashed;
  }

  .agent-face:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }

  .agent-face-slash {
    inline-size: 60%;
    block-size: 60%;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.5;
    stroke-linecap: round;
  }

  /* THE PROJECT'S MARK IN ITS CORNER, square as a project's mark always is, so it is not read as a second face. */
  .agent-face-project {
    position: absolute;
    inset-block-end: -4px;
    inset-inline-end: -4px;
    display: grid;
    place-items: center;
    min-inline-size: 14px;
    block-size: 14px;
    padding-inline: 2px;
    background: var(--s2);
    border: 1px solid var(--bg);
    border-radius: var(--r-sm);
    color: var(--ink);
    font-size: var(--t-xs);
    font-weight: 600;
    line-height: 1;
  }

  .agent-face-project[data-hued] {
    background: color-mix(in srgb, oklch(var(--mark-l) var(--mark-c) var(--project-hue)) 36%, var(--bg));
  }
</style>
