<!--
  An agent's run, as a face: the agent's own mark (`AgentMark`) inside a disc, and a dot while the run is working.

  ONE DISC FOR EVERY AGENT: `--tile-2`, the mark 16px inside it. A named agent wears its maker's mark: Claude's clay
  starburst in `--agent-claude`, Gemini's in `--agent-gemini`, and the marks drawn in black or white (Codex, Cursor) in
  `--ink`, so they keep their shape and only the ink turns over with the scheme. An agent with no maker's colour (a
  runner, one nobody names) wears the app's glyph in a category slot, picked by its run (`runHue` in `face.ts`), so two
  runners at once are told apart.

  WORKING IS A DOT, NOT A RING: an 8px `--live` dot at the disc's bottom end corner, cut out of the disc by a 2px ring of
  the ground it stands on (`--face-ground`, the tile unless a caller says). Gone quiet but still open is the same dot
  hollow. Stopped is no dot. A shape and not a colour alone, so the three read apart in both schemes.

  A DOOR TO THE RUN. A face that names a run is a link to the run's own page; its name is what it does and where the
  run is, since the dot is not read out. A face that names no run is decoration, and hidden, because the agent's name
  sits beside it.

  THREE SIZES: `s` is 28px, the face on a card, Today and a list; `m` is 32px, a row's leading mark; `xs` is 24px, for a
  line of text beside a person's face.
-->
<script lang="ts">
  import { at } from '../at.ts';
  import { agentKindOf, faceWords, runHue, runSeq, slotOf, type RunLive } from './face.ts';
  import { isMarked } from '@braindog/skin/agent-marks.ts';
  import AgentMark from './AgentMark.svelte';
  import Icon from './Icon.svelte';
  import { isGlyph, type IconName } from './icons.ts';

  let {
    agent,
    run,
    live,
    project = null,
    size = 's',
  }: {
    /** The kind of agent, as its id (`claude`), signature (`agent:claude`) or name (`Claude`); null when nobody said. */
    agent: string | null;
    /** The run, as it signs (`S42`); a run that is not one draws the face with no slot and no door. */
    run: string;
    live: RunLive;
    /** The project the run was placed in, as its mark and hue, worn as a badge at the top corner on the larger sizes. */
    project?: { mark: string | null; hue: number | null } | null | undefined;
    size?: 'xs' | 's' | 'm' | undefined;
  } = $props();

  const kind = $derived(agentKindOf(agent));
  const seq = $derived(runSeq(run));
  const marked = $derived(isMarked(kind));
  /* A SLOT ONLY FOR A FACE WITH NO MAKER'S MARK IN IT, so a maker's logo never sits on a second colour. */
  const slot = $derived(seq === null || marked ? undefined : slotOf(runHue(seq)));
  /* THE BADGE ONLY FROM 28 UP: at 24 a second mark in the corner is a smudge, and the line beside it names the
     project in words anyway. */
  /* THE MARK A PROJECT NAMES IS A GLYPH, DRAWN AS ONE: "tag" printed as the word sat over the face like a label. A mark
     that is no glyph is drawn only while it is a letter or two; a longer word is no mark, and nothing is drawn. */
  const glyph = $derived(project?.mark && isGlyph(project.mark) ? (project.mark as IconName) : null);
  const short = $derived(project?.mark && !glyph && [...project.mark.trim()].length <= 2 ? project.mark.trim() : null);
  const badge = $derived(size !== 'xs' && project && (glyph || short) ? project : null);
  const badgeSlot = $derived(badge ? slotOf(badge.hue) : undefined);
</script>

{#snippet inside()}{#if kind === 'slash'}<svg class="agent-face-slash" viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 4.5 8.5 19.5" /></svg
  >{:else}<AgentMark {kind} size={size === 'xs' ? 's' : 'm'} />{/if}{#if badge}<span class="agent-face-project" data-slot={badgeSlot} aria-hidden="true"
      >{#if glyph}<Icon name={glyph} size="s" />{:else}{short}{/if}</span
    >{/if}{#if live !== 'stopped'}<span class="agent-face-live" data-live={live} aria-hidden="true"></span>{/if}{/snippet}

{#if seq !== null}
  <!-- `.tap`: the disc is 24 to 32px, and a door a thumb presses is 44 either way (design 6.6), so the hit box grows
       round it and the drawing stays the size the line needs. -->
  <a
    class="face agent-face tap"
    href={at(`/r/session/${seq}`)}
    data-agent={kind}
    data-live={live}
    data-size={size}
    data-slot={slot}
    data-marked={marked ? '' : undefined}
    aria-label="{faceWords.openRun}, {faceWords.live[live]}">{@render inside()}</a
  >
{:else}
  <span class="face agent-face" data-agent={kind} data-live={live} data-size={size} data-marked={marked ? '' : undefined} aria-hidden="true"
    >{@render inside()}</span
  >
{/if}

<style>
  .agent-face {
    /* THE GROUND THE FACE STANDS ON, which the working dot is cut out of: the tile, unless a caller says otherwise. */
    --face-ground: var(--tile);

    position: relative;
    display: grid;
    flex: none;
    place-items: center;
    box-sizing: border-box;
    inline-size: 28px;
    block-size: 28px;
    background: var(--tile-2);
    border-radius: var(--r-round);
    box-shadow: inset 0 0 0 1px var(--sep);
    color: var(--ink);
    font-weight: var(--fw-semi);
    text-decoration: none;
    transition: opacity var(--d-state) var(--ease-out);
  }

  .agent-face[data-size='xs'] {
    inline-size: 24px;
    block-size: 24px;
  }

  .agent-face[data-size='m'] {
    inline-size: 32px;
    block-size: 32px;
  }

  /* A DOOR ANSWERS THE POINTER, quietly: the face dims a step, and nothing moves. */
  @media (hover: hover) and (pointer: fine) {
    a.agent-face:hover {
      opacity: 0.8;
    }
  }

  .agent-face:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  /* AN AGENT WITH NO MAKER'S COLOUR, IN ITS RUN'S SLOT: the slot's tint under its colour. */
  .agent-face[data-slot] {
    background: var(--ph-tint);
    color: var(--ph);
  }

  .agent-face-live {
    position: absolute;
    inset-block-end: -1px;
    inset-inline-end: -1px;
    inline-size: 8px;
    block-size: 8px;
    background: var(--live);
    border-radius: var(--r-round);
    /* THE CUT-OUT: a ring of the ground the face stands on, so the dot reads as set into the disc's corner. */
    box-shadow: 0 0 0 2px var(--face-ground);
  }

  /* GONE QUIET, STILL OPEN: the same dot, hollow. */
  .agent-face-live[data-live='quiet'] {
    background: var(--face-ground);
    box-shadow:
      inset 0 0 0 2px var(--live),
      0 0 0 2px var(--face-ground);
  }

  .agent-face-slash {
    inline-size: 60%;
    block-size: 60%;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.5;
    stroke-linecap: round;
  }

  /* THE PROJECT'S MARK AT THE TOP CORNER, square as a project's mark always is, in its slot, so it is not read as a
     second face and never sits where the working dot does. */
  .agent-face-project {
    position: absolute;
    inset-block-start: -4px;
    inset-inline-end: -4px;
    display: grid;
    place-items: center;
    min-inline-size: 14px;
    block-size: 14px;
    padding-inline: 2px;
    background: var(--ph-tint, var(--tile-2));
    border-radius: var(--r-xs);
    box-shadow: 0 0 0 1px var(--face-ground);
    color: var(--ph, var(--ink));
    font-size: var(--fs-cap);
    font-weight: var(--fw-semi);
    line-height: 1;
  }

  .agent-face-project :global(svg) {
    inline-size: 10px;
    block-size: 10px;
  }

  [data-slot='blue'] {
    --ph: var(--cat-blue, var(--ink));
    --ph-tint: var(--cat-blue-tint, var(--tile-2));
  }

  [data-slot='violet'] {
    --ph: var(--cat-violet, var(--ink));
    --ph-tint: var(--cat-violet-tint, var(--tile-2));
  }

  [data-slot='pink'] {
    --ph: var(--cat-pink, var(--ink));
    --ph-tint: var(--cat-pink-tint, var(--tile-2));
  }

  [data-slot='teal'] {
    --ph: var(--cat-teal, var(--ink));
    --ph-tint: var(--cat-teal-tint, var(--tile-2));
  }

  [data-slot='sky'] {
    --ph: var(--cat-sky, var(--ink));
    --ph-tint: var(--cat-sky-tint, var(--tile-2));
  }

  [data-slot='yellow'] {
    --ph: var(--cat-yellow, var(--ink));
    --ph-tint: var(--cat-yellow-tint, var(--tile-2));
  }

  [data-slot='lime'] {
    --ph: var(--cat-lime, var(--ink));
    --ph-tint: var(--cat-lime-tint, var(--tile-2));
  }

  [data-slot='slate'] {
    --ph: var(--cat-slate, var(--ink));
    --ph-tint: var(--cat-slate-tint, var(--tile-2));
  }

  @media (forced-colors: active) {
    .agent-face {
      border: 1px solid CanvasText;
    }

    .agent-face-live {
      background: CanvasText;
    }
  }
</style>
