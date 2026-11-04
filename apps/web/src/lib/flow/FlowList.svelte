<!--
  One list of steps: the column under the trigger, or one arm of a branch. A branch draws its two arms as two columns
  under its card, each of them this component again, so the whole canvas is this file and `FlowCard` and nothing else.

  THE JOINS ARE A BORDER, NOT A DRAWING. There is nothing in the app that draws connectors between
  nodes, and nothing needs to: a vertical flow's hairline is each gap's own border, and an "Add a step" circle sits on
  it between every two cards, which is where Zapier puts its plus and where a thumb looks for one.

  A BRANCH FORKS AND JOINS, AND BOTH ARE BORDERS TOO. Before this, the arms hung from a second hairline 16px in from the
  left and each arm drew its own spine at its own centre: three vertical lines at three x positions, nothing leaving
  the branch card and nothing coming back to the column. Now a stem leaves the
  card's centre, one box drawn with a top and a bottom border spans the two arms' centres (the fork above them, the
  join under them), and "Then, either way" hangs from the join's centre where the column carries on. The runner does
  carry on there whichever arm it took (`packages/kernel/src/flow.ts` `plan`), and a stranger who cannot see that
  believes a step placed under the branch is guarded by it (1.3).

  THE SHORTER ARM'S LAST GAP GROWS TO THE JOIN. The arms are grid items, so both are as tall as the taller one; the
  list inside an arm fills its arm and its last gap takes the rest, so its hairline reaches the join instead of stopping
  8px under its plus and leaving the join hanging in the air under one arm.

  AN EMPTY LIST IS ITS "ADD A STEP" PILL AND NOTHING ELSE, and the pill's row is the drop target, `data-flow-empty`,
  because a list with no cards has no card for the pointer to be over, and a branch whose `then` was emptied by a drag
  could otherwise never be filled by one. It used to be a 28px circle over a dashed "Nothing yet" box, two things to
  read where one pill says both what is missing and what to press (1.10).

  THE CONNECTORS ARE `--rule` LINES (the line that reads on the ground): the cards are tiles on the ground,
  and the wires between them are drawn in the ground's own hairline, never a box or a colour.

  SIDE BY SIDE WHERE THERE IS ROOM, STACKED WHERE THERE IS NOT, and the room is the column's, not the window's. The
  step a branch sits in is a size container, so a branch inside a branch, or a canvas narrowed by the docked panel,
  stacks its arms once they would be under 280px each, whatever the window is. Two arms of about 150px are two columns
  a sentence does not survive; stacked, each arm keeps the column's width and says which arm it is. The fork
  cannot span two centres that sit one above the other, so there it is a single spine down the left, hanging from the
  branch card, with a short line into the top of each arm and the join running back to the centre under the last one.
-->
<script lang="ts">
  import FlowCard from './FlowCard.svelte';
  import FlowList from './FlowList.svelte';
  import StepMenu from './StepMenu.svelte';
  import { ROOT, armOf, words, type Fault, type ListId, type Node } from './flow.ts';
  import type { FlowDraft } from './flow.svelte.ts';

  let { flow, list, nodes, faults }: { flow: FlowDraft; list: ListId; nodes: Node[]; faults: Fault[] } = $props();

  const faultsFor = (key: string): string[] => faults.filter((f) => f.key === key).map((f) => f.say);
  const isBranch = (n: Node): boolean => 'if' in n.step;
  /* WHICH ARM HOLDS STEPS WHEN THE OTHER HOLDS NONE: that arm takes the width and the empty one keeps only its pill. */
  const leanOf = (n: Node): 'then' | 'else' | undefined => {
    const then = (n.then ?? []).length;
    const otherwise = (n.else ?? []).length;
    return then > 0 && otherwise === 0 ? 'then' : otherwise > 0 && then === 0 ? 'else' : undefined;
  };
</script>

<ol class="flow-list" data-list={list} data-arm={list === ROOT ? undefined : ''}>
  {#if nodes.length === 0}
    <li class="gap" data-flow-empty data-list={list}>
      <StepMenu label={words.addStep} landing={flow.over?.list === list} onpick={(verb) => flow.add(list, 0, verb)} />
    </li>
  {:else}
    <li class="gap">
      <StepMenu compact label={words.addHere} onpick={(verb) => flow.add(list, 0, verb)} />
    </li>
  {/if}
  {#each nodes as node, at (node.key)}
    <li class="step">
      <FlowCard {flow} {node} {list} {at} count={nodes.length} faults={faultsFor(node.key)} />
      {#if isBranch(node)}
        <div class="arms" data-lean={leanOf(node)}>
          <section class="arm" aria-label={words.then}>
            <p class="arm-head">{words.then}</p>
            <FlowList {flow} list={armOf(node.key, 'then')} nodes={node.then ?? []} {faults} />
          </section>
          <section class="arm" aria-label={words.otherwise}>
            <p class="arm-head">{words.otherwise}</p>
            <FlowList {flow} list={armOf(node.key, 'else')} nodes={node.else ?? []} {faults} />
          </section>
        </div>
        <p class="either">{words.eitherWay}</p>
      {/if}
    </li>
    <li class="gap">
      <StepMenu compact label={words.addHere} onpick={(verb) => flow.add(list, at + 1, verb)} />
    </li>
  {/each}
</ol>

<style>
  .flow-list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* EACH STEP IS A SIZE CONTAINER, so a branch decides its arms by the width of the column it sits in, and the lines
     inside those arms read the same width when they draw the stacked form: the fork, the spine and an arm's last gap
     all answer one container, the branch's own step. */
  .step {
    display: flex;
    flex-direction: column;
    container-type: inline-size;
  }

  /* A CONTAINER IS ALSO A STACKING CONTEXT, so a card's open menu would be painted under the next step. The step that
     holds an open menu, and every step round it, rises over its siblings while the menu is open. */
  .step:has(:global([aria-expanded='true'])) {
    z-index: var(--z-raise);
  }

  /* THE CONNECTOR: a `--rule` line down the middle of the gap, with the plus sitting on it. The plus sits at the top of
     the gap, so that a gap grown to meet a join keeps its plus where every other plus is and draws the rest as line. */
  .gap {
    position: relative;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-block: var(--sp-2);
  }

  .gap::before {
    content: '';
    position: absolute;
    inset-block: 0;
    inset-inline-start: 50%;
    border-inline-start: 1px solid var(--rule);
  }

  .gap > :global(*) {
    position: relative;
  }

  /* An arm's list fills its arm, and its last row (a gap, or the pill of an empty arm) takes what is left. */
  .flow-list[data-arm] {
    flex: 1;
  }

  .flow-list[data-arm] > li:last-child {
    flex-grow: 1;
  }

  /* THE FORK. `.arms` is as wide as the branch card above it, so its 50% is the card's centre, and with two equal
     columns and a gap G each arm's centre is 25% - G/4 in from its own side. The stem is `::after`, from the card down
     to the fork; the fork and the join are one box, `::before`, drawn by its top and bottom borders only. The extra
     1px at the end is the width of the far arm's own line, which starts at its centre and is drawn to the right of it,
     so without it the fork stops one pixel short of that arm. */
  .arms {
    position: relative;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: var(--sp-3);
    padding-block-start: var(--sp-3);
  }

  .arms::before {
    content: '';
    position: absolute;
    inset-block: var(--sp-3) 0;
    inset-inline: calc(25% - var(--sp-3) / 4) calc(25% - var(--sp-3) / 4 - 1px);
    border-block: 1px solid var(--rule);
  }

  .arms::after {
    content: '';
    position: absolute;
    inset-block-start: 0;
    block-size: var(--sp-3);
    inset-inline-start: 50%;
    border-inline-start: 1px solid var(--rule);
  }

  /* ONE ARM WITH STEPS AND ONE WITHOUT (leftovers 7, 2 Nov): the empty arm is only its "Add a step" pill, so it keeps a
     slim column and the arm with the steps takes the rest, rather than a card squeezed into half the canvas beside an
     empty half. The fork and the join are drawn to the two new centres: the wide arm's is half of what is left once the
     gap and the slim column are taken, and the slim arm's is half of its own width, plus the far arm's 1px as above. */
  @container (width >= 560px) {
    .arms[data-lean] {
      --arm-slim: 10rem;
    }

    .arms[data-lean='then'] {
      grid-template-columns: minmax(0, 1fr) var(--arm-slim);
    }

    .arms[data-lean='then']::before {
      inset-inline: calc((100% - var(--sp-3) - var(--arm-slim)) / 2) calc(var(--arm-slim) / 2 - 1px);
    }

    .arms[data-lean='else'] {
      grid-template-columns: var(--arm-slim) minmax(0, 1fr);
    }

    .arms[data-lean='else']::before {
      inset-inline: calc(var(--arm-slim) / 2) calc((100% - var(--sp-3) - var(--arm-slim)) / 2 - 1px);
    }
  }

  .arm {
    position: relative;
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }

  /* A LABEL ON THE LINE, as n8n writes true and false on its two outputs: a short run of line from the fork, the word,
     and then the arm's first gap carries the line on. Sentence case at 500 in the meta size, no tracking. */
  .arm-head,
  .either {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 500;
    line-height: calc(18px * var(--type, 1));
    text-align: center;
  }

  .arm-head::before,
  .either::before {
    content: '';
    block-size: var(--sp-2);
    border-inline-start: 1px solid var(--rule);
  }

  @container (width < 560px) {
    .arms {
      grid-template-columns: minmax(0, 1fr);
      row-gap: var(--sp-3);
      padding-block-end: var(--sp-3);
      padding-inline-start: var(--sp-3);
    }

    /* ONE SPINE DOWN THE LEFT, 12px in from the card's edge, and the join from it back to the centre under the last
       arm. The box ends on the column's centre plus the width of the centre line, the same 1px as above. */
    .arms::before {
      inset-block: 0;
      inset-inline: var(--sp-3) calc(50% - 1px);
      border-block: 0;
      border-inline-start: 1px solid var(--rule);
      border-block-end: 1px solid var(--rule);
    }

    /* The spine hangs from the card itself, so there is no stem from its centre. */
    .arms::after {
      content: none;
    }

    /* The short line from the spine into the top of each arm, ending on that arm's own centre. */
    .arm::after {
      content: '';
      position: absolute;
      inset-block-start: 0;
      inset-inline: 0 calc(50% - 1px);
      border-block-start: 1px solid var(--rule);
    }

    /* STACKED, AN ARM ENDS ON ITS LAST PLUS. Its centre is not the column's centre any more, so a line carried on
       below the plus would stop in the air beside the join instead of on it. */
    .flow-list[data-arm] > .gap:last-child::before {
      inset-block-end: 50%;
    }
  }
</style>
