<!--
  `lanes`: one row a lane, its span placed in a window of time, with a line where now falls. `src/lanes.ts` decides
  every position and every word; `lanes` in `src/html.ts` is this file's twin, and `src/parity.test.ts` compiles this
  file and holds the two to one tree.

  THE AXIS IS HIDDEN AND THE LIST IS READ, as a roadmap's are: the names along the top and now's line are a picture's
  furniture, and each lane says its own title and its own time. `--at` and `--span` are percentages of the track's
  width, written inline, so the host places a bar with `left` and `width` and nothing else.

  The markup has no whitespace between tags that sit on one line, on purpose: a line break there is a space the other
  renderer does not draw.
-->
<script lang="ts">
  import { MISSING, TONES, WORKING_GLYPH, WORKING_LABEL, agentMarkFill, inline, takeWorking, text, type AgentMark, type Block, type RenderOptions, type Row } from '../src/index.ts';
  import { LANES_NONE, LANES_NOW, laneHue, laneWho, lanesOutside, lanesPlan, lanesSentence, lanesSkipped } from '../src/lanes.ts';
  import Text from './Text.svelte';

  let { block, opts = {} }: { block: Block; opts?: RenderOptions } = $props();

  const said = (r: Row): string => text(inline(r.cells[0] ?? '', opts)) || MISSING;
  const plan = $derived(lanesPlan(block.rows, opts.now));
  const outside = $derived(plan.outside.length ? lanesOutside(plan.outside.map((i) => said(block.rows[i]!))) : '');
  const skipped = $derived(plan.skipped.length ? lanesSkipped(plan.skipped.map((i) => said(block.rows[i]!))) : '');
  /** The mark the host draws for an agent's name, or `null`, as `markFor` in `src/html.ts`. */
  const markFor = (name: string): AgentMark | null => (name && opts.agentMark ? opts.agentMark(name) : null);
</script>

<!-- AN AGENT'S FACE AS ITS MAKER'S MARK, as `agentFaceHtml` in `src/html.ts` draws one, hidden: the name is beside it. -->
{#snippet agentFace(m: AgentMark)}{@const fill = agentMarkFill(m.tone)}<span class="lanes-face" data-agent="" aria-hidden="true"
    ><svg class="agent-mark" data-tone={m.tone} viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor" style={fill ?? undefined}
      ><path d={m.d} fill-rule={m.rule} clip-rule={m.rule}></path></svg
    ></span
  >{/snippet}

{#snippet under()}{#if outside}<p class="lanes-outside">{outside}</p>{/if}{#if skipped}<p class="lanes-skipped">{skipped}</p>{/if}{/snippet}

{#if plan.empty}
  <div class="lanes"><p class="lanes-empty">{LANES_NONE}</p>{@render under()}</div>
{:else}
  <div class="lanes" style="--rows:{plan.lanes.length}">
    <ol class="lanes-axis" aria-hidden="true">
      {#each plan.ticks as t}<li class="lanes-tick" style="--at:{t.at}">{t.label}</li>{/each}{#if plan.now !== null}<li class="lanes-now" style="--at:{plan.now}"><span class="lanes-now-word">{LANES_NOW}</span></li>{/if}
    </ol>
    <ol class="lanes-list" aria-label={lanesSentence(plan)}>
      {#each plan.lanes as l}
        {@const title = takeWorking(l.row.cells[0] || MISSING)}
        {@const who = laneWho(l.row.cells)}
        {@const mark = who ? markFor(who) : null}
        <li
          class="lanes-item"
          data-intent={l.row.tone}
          data-who={who ? '' : undefined}
          data-open={l.open ? '' : undefined}
          data-point={l.point ? '' : undefined}
          data-before={l.before ? '' : undefined}
          data-after={l.after ? '' : undefined}
          style="--at:{l.at};--span:{l.span}{laneHue(mark?.tone)}"
          >{#if who}<span class="lanes-who">{#if mark}{@render agentFace(mark)}{/if}<span class="lanes-agent">{who}</span></span>{/if}<span class="lanes-title"
            >{#if title.working}<span role="img" aria-label={WORKING_LABEL} title={WORKING_LABEL}>{WORKING_GLYPH}</span>{' '}{/if}<Text
              nodes={inline(title.text ?? '', opts)}
              {opts}
            /></span
          >{#if l.row.tone}<span class="glyph" role="img" aria-label={TONES[l.row.tone].label}>{TONES[l.row.tone].glyph}</span>{/if}<span class="lanes-when num"
            >{l.when}</span
          ><span class="lanes-track" aria-hidden="true"><span class="lanes-bar"></span></span></li
        >
      {/each}
    </ol>
    {@render under()}
  </div>
{/if}
