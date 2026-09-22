<!--
  One list of steps: the column under the trigger, or one arm of a branch. A branch draws its two arms as two columns
  under its card, each of them this component again, so the whole canvas is this file and `FlowCard` and nothing else.

  THE JOINS ARE A BORDER, NOT A DRAWING. §1.8 of the research found nothing in the app that draws connectors between
  nodes, and nothing needs to: a vertical flow's hairline is the list's own inline-start border, and an "Add a step"
  circle sits on it between every two cards, which is where Zapier puts its plus and where a thumb looks for one.

  AN EMPTY ARM IS A DROP TARGET, `data-flow-empty`, because a list with no cards has no card for the pointer to be over,
  and a branch whose `then` was emptied by a drag could otherwise never be filled by one.

  SIDE BY SIDE ABOVE 640px, STACKED UNDER IT. Two arms of a nested branch at phone width are two columns of about 150px,
  and a sentence does not survive that; stacked, each arm keeps the column's width and says which arm it is.
-->
<script lang="ts">
  import FlowCard from './FlowCard.svelte';
  import FlowList from './FlowList.svelte';
  import StepMenu from './StepMenu.svelte';
  import { armOf, words, type Fault, type ListId, type Node } from './flow.ts';
  import type { FlowDraft } from './flow.svelte.ts';

  let { flow, list, nodes, faults }: { flow: FlowDraft; list: ListId; nodes: Node[]; faults: Fault[] } = $props();

  const faultsFor = (key: string): string[] => faults.filter((f) => f.key === key).map((f) => f.say);
  const isBranch = (n: Node): boolean => 'if' in n.step;
</script>

<ol class="flow-list" data-list={list}>
  <li class="gap">
    <StepMenu compact label={words.addHere} onpick={(verb) => flow.add(list, 0, verb)} />
  </li>
  {#if nodes.length === 0}
    <li class="empty" data-flow-empty data-list={list} data-drop={flow.over?.list === list ? '' : undefined}>{words.emptyArm}</li>
  {/if}
  {#each nodes as node, at (node.key)}
    <li class="step">
      <FlowCard {flow} {node} {list} {at} count={nodes.length} faults={faultsFor(node.key)} />
      {#if isBranch(node)}
        <div class="arms">
          <section class="arm" aria-label={words.then}>
            <p class="arm-head">{words.then}</p>
            <FlowList {flow} list={armOf(node.key, 'then')} nodes={node.then ?? []} {faults} />
          </section>
          <section class="arm" aria-label={words.otherwise}>
            <p class="arm-head">{words.otherwise}</p>
            <FlowList {flow} list={armOf(node.key, 'else')} nodes={node.else ?? []} {faults} />
          </section>
        </div>
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

  .step {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  /* THE CONNECTOR: a hairline down the middle of the gap, with the plus sitting on it. */
  .gap {
    position: relative;
    display: flex;
    justify-content: center;
    padding-block: var(--sp-2);
  }

  .gap::before {
    content: '';
    position: absolute;
    inset-block: 0;
    inset-inline-start: 50%;
    border-inline-start: 1px solid var(--line);
  }

  .gap > :global(*) {
    position: relative;
  }

  .empty {
    padding: var(--sp-3);
    border: 1px dashed var(--line);
    border-radius: var(--r-md);
    color: var(--dim);
    font-size: var(--t-sm);
    text-align: center;
  }

  .empty[data-drop] {
    border-color: var(--accent);
    color: var(--ink2);
  }

  .arms {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--sp-3);
    padding-inline-start: var(--sp-4);
    border-inline-start: 1px solid var(--line);
    margin-inline-start: var(--sp-4);
  }

  .arm {
    min-inline-size: 0;
  }

  .arm-head {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-xs);
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  @media (width < 640px) {
    .arms {
      grid-template-columns: minmax(0, 1fr);
      padding-inline-start: var(--sp-3);
      margin-inline-start: var(--sp-2);
    }
  }
</style>
