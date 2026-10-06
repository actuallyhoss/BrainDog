<!--
  A MERGE, AS ONE QUESTION ABOUT WHO IS WHO (DIRECTION §38, `merge.ts`): each name the record thinks may be one, where
  each was seen, and the answers, Merge all, Keep apart and, where the record offers it, Pick on a name. One press each.

  THE ONE DECISION CARD'S LOOK, inside the gate's tile: the names as a list without boxes, each a line with its well,
  and the answers as the gate's pills under them. Nothing is marked: the record suggests no answer to who is who, and
  no key gives one, since a merge is hard to undo (`press.ts` `acceptKey`).

  THE PRESS IS HELD FOR ITS UNDO, NOT SENT. The gate keeps it for six seconds with Undo on the line it leaves, and only
  then sends it (`press.ts` `hold`), because a merge folds a person away and a pair kept apart is never asked about
  again. While one is held the answers wait, so a second press cannot race the first.
-->
<script lang="ts">
  import Button from '$lib/ui/Button.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import { iconFor } from '$lib/record/api.ts';
  import { REGISTERS } from '$lib/record/held.ts';
  import { keptName, mergeListOf, words, type Merge, type Press } from './merge.ts';

  let {
    merge,
    answerable,
    holding = null,
    titleOf = () => undefined,
    onpress,
  }: {
    merge: Merge;
    /** Whether this reader may answer; when not, the answers are off and point at the sentence that says why. */
    answerable: boolean;
    /** The option of the press being held for its Undo, or `null`. */
    holding?: string | null;
    /** The record's own words for an option, which a Pick says in place of this card's. */
    titleOf?: (option: string) => string | undefined;
    /** A press, with the line it leaves once it is in. */
    onpress: (press: Press, line: string) => void;
  } = $props();

  const into = $derived(keptName(merge));
  /* EACH NAME'S WELL IS ITS LIST'S OWN ICON, as the record declares it: the list is read off the names' handles or the
     people role (`mergeListOf`), never named here. The one kept is marked as kept. */
  const listIcon = $derived.by(() => {
    const list = mergeListOf(merge, REGISTERS);
    return iconFor(list === null ? undefined : REGISTERS[list]?.icon, 'rows');
  });
  const off = $derived(!answerable || holding !== null);
  const why = $derived(answerable ? undefined : 'cannot-decide');
</script>

<section class="merge" aria-label={words.heading}>
  <p class="merge-lead">{words.lead(merge.candidates.length)}</p>
  <ul class="names">
    {#each merge.candidates as c (c.key)}
      {@const name = c.name || words.unnamed}
      <li class="name">
        <IconWell name={c.kept ? 'user-check' : listIcon} />
        <span class="name-main">
          <span class="name-title"
            ><span dir="auto">{name}</span>{#if c.kept && merge.candidates.length > 1}<span class="name-kept">{words.kept}</span>{/if}</span
          >
          {#if c.seen.length > 0}<span class="name-seen" dir="auto">{words.seen(c.seen)}</span>{/if}
        </span>
        {#if c.pick}
          {@const press = c.pick}
          <Button
            size="sm"
            id="opt-{press.option}"
            data-answer={press.option}
            data-on={holding === press.option ? '' : undefined}
            disabled={off}
            aria-describedby={why}
            aria-label={titleOf(press.option) || words.pickNamed(name)}
            onclick={() => onpress(press, words.picked(c.name))}>{titleOf(press.option) || words.pick}</Button
          >
        {/if}
      </li>
    {/each}
  </ul>
  <div class="merge-answers">
    <Button
      id="opt-{merge.all.option}"
      data-answer={merge.all.option}
      data-on={holding === merge.all.option ? '' : undefined}
      disabled={off}
      aria-describedby={why}
      onclick={() => onpress(merge.all, words.mergedAll(into))}>{words.mergeAll}</Button
    >
    <Button
      id="opt-{merge.apart.option}"
      data-answer={merge.apart.option}
      data-on={holding === merge.apart.option ? '' : undefined}
      disabled={off}
      aria-describedby={why}
      onclick={() => onpress(merge.apart, words.keptApart)}>{words.apart}</Button
    >
  </div>
</section>

<style>
  .merge {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  .merge-lead {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: var(--lh-body);
  }

  /* THE NAMES SIT ON THE TILE WITHOUT BOXES, a line each, as every list in the app does. */
  .names {
    display: grid;
    gap: var(--sp-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .name {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: var(--row-h, 44px);
    padding-block: var(--sp-1);
  }

  .name-main {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-inline-size: 0;
  }

  .name-title {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-2);
    color: var(--ink);
    font-size: var(--t-base);
    font-weight: 500;
    line-height: var(--lh-body);
    overflow-wrap: anywhere;
  }

  .name-kept {
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 400;
  }

  .name-seen {
    color: var(--ink2);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
    overflow-wrap: anywhere;
  }

  .merge-answers {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-3);
  }

  /* UNDER A THUMB, a name's Pick goes under its words rather than squeezing them. */
  @media (width < 600px) {
    .name {
      flex-wrap: wrap;
    }

    .name > :global(.btn) {
      margin-inline-start: calc(var(--well) + var(--sp-3));
    }
  }
</style>
