<!--
  What accepting a `change` or a `pattern` would put on the screen (`proposed.ts`): each page, list,
  rule or look by its name, with the facts that say where it lands and what it shows. The accent of a
  look is drawn as a swatch beside its code, because a colour is judged by eye and not by its number.

  A PAGE IS ALSO DRAWN, under its lines, by the record (`drawnOf`, the record's `previewPage`). The lines
  named its blocks and nothing filled them, so what an agent's page would hold was learnt by accepting it.
  The blocks go through the page's own drawing, `draw` and the renderer's primitives (A3: the preview is
  the real renderer), with no callback handed to any of them, so nothing on a page nobody has accepted
  can be ticked or moved. A block the record held back draws its sentence. A host older than the method
  draws nothing more than the lines, which is what this screen drew before.
-->
<script lang="ts">
  import { Block, Degraded, Markdown, Table } from 'braindog-render/svelte';

  import { apiBase, at as inApp } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { draw } from '$lib/record/blocks.ts';
  import { resolverOf, type LiveBlock } from '$lib/record/page-live.ts';
  import Empty from '$lib/ui/Empty.svelte';
  import { drawnOf, words, type Drawn, type Proposed } from './proposed.ts';

  let { proposed }: { proposed: Proposed } = $props();

  /* ONE ANSWER PER PAGE, BY ITS PLACE IN THE LIST, and a proposal changed under the screen drops the answers it was
     waiting on rather than drawing the last proposal's page under the next one's title. */
  let drawn = $state<(Drawn | null)[]>([]);
  $effect(() => {
    const bodies = proposed.appears.map((a) => a.page ?? null);
    let current = true;
    drawn = bodies.map(() => null);
    const base = apiBase();
    bodies.forEach((body, i) => {
      if (body)
        void drawnOf(body, base)
          .then((d) => {
            if (current) drawn[i] = d;
          })
          .catch(() => {
            if (current) drawn[i] = { from: 'none' };
          });
    });
    return () => {
      current = false;
    };
  });

  const optsFor = (block: LiveBlock, now: number) => ({
    resolve: (path: string) => resolverOf(block.values)(path) ?? '',
    now,
    href: inApp,
  });
</script>

<ul class="appears">
  {#each proposed.appears as a, i (i)}
    <li class="appear">
      <p class="appear-head">
        <span class="appear-kind">{a.kind}</span>
        <span class="appear-title">{a.title}</span>
      </p>
      {#if a.lines.length}
        <dl class="appear-lines">
          {#each a.lines as line (line.label)}
            <dt>{line.label}</dt>
            <dd>
              {#if a.accent && line.value === a.accent}<span class="swatch" style:background={a.accent} aria-hidden="true"></span>{/if}
              {line.value}
            </dd>
          {/each}
        </dl>
      {/if}
      {#if drawn[i]?.from === 'refused'}
        <p class="appear-note">{(drawn[i] as { fix: string }).fix}</p>
      {:else if drawn[i]?.from === 'live'}
        {@const live = drawn[i] as Extract<Drawn, { from: 'live' }>}
        <div class="appear-drawn" role="group" aria-label={words.drawn(a.title)}>
          <p class="appear-kind">{words.drawnHead}</p>
          {#each live.blocks as block, j (j)}
            {@const shown = draw(block)}
            <div class="appear-block">
              {#if block.heading}<p class="appear-block-head">{block.heading}</p>{/if}
              {#if block.cannot}
                <p class="appear-note">{block.cannot}</p>
              {:else if shown.refusal}
                <Empty compact kind={shown.refusal.kind} title={shown.refusal.title} body={shown.refusal.body} lines={shown.refusal.lines} />
              {:else if block.kind === 'table'}
                <Table columns={block.columns} rows={block.rows} total={block.total} label={block.heading} href={inApp} />
              {:else}
                {#each shown.segments as segment, k (k)}
                  {#if segment.type === 'block'}<Block block={segment} opts={optsFor(block, live.now)} />{:else if segment.type === 'degraded'}<Degraded {segment} />{:else if segment.type === 'markdown'}<div class="document"><Markdown {segment} opts={{ href: inApp }} /></div>{/if}
                {/each}
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </li>
  {/each}
</ul>
{#if proposed.samples !== null}<p class="appear-note">{copy.proposalSamples(proposed.samples)}</p>{/if}

<style>
  .appears {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .appear {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    min-inline-size: 0;
  }

  .appear-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-2);
    margin: 0;
    font-size: var(--t-ui);
  }

  .appear-kind {
    color: var(--dim);
    font-size: var(--t-xs);
  }

  .appear-title {
    color: var(--ink);
    font-weight: 500;
  }

  /* The same two tracks as a changed field: the fact's name as wide as a short label, then the fact. */
  .appear-lines {
    display: grid;
    grid-template-columns: minmax(8ch, max-content) minmax(0, 1fr);
    gap: var(--sp-1) var(--sp-3);
    margin: 0;
    font-size: var(--t-ui);
  }

  .appear-lines dt {
    color: var(--dim);
    font-size: var(--t-xs);
    line-height: var(--lh-body);
  }

  .appear-lines dd {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink2);
    overflow-wrap: anywhere;
  }

  .swatch {
    flex: none;
    inline-size: 12px;
    block-size: 12px;
    border-radius: var(--r-sm);
    box-shadow: inset 0 0 0 1px var(--line);
  }

  /* THE DRAWING SITS UNDER THE LINES, RULED OFF FROM THEM, because it is the page and not a fact about it. */
  .appear-drawn {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    margin-block-start: var(--sp-2);
    padding-block-start: var(--sp-3);
    border-block-start: 1px solid var(--line);
    min-inline-size: 0;
  }

  .appear-drawn .appear-kind {
    margin: 0;
  }

  .appear-block {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    min-inline-size: 0;
    overflow-x: auto;
  }

  .appear-block-head {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-ui);
    font-weight: 500;
  }

  .appear-note {
    margin: var(--sp-2) 0 0;
    color: var(--dim);
    font-size: var(--t-xs);
  }
</style>
