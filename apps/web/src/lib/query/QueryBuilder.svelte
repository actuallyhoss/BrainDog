<!--
  The query builder: the one editor of a `where` tree in this app (`docs/21 §4.1`).

  EVERY PLACE A FILTER IS WRITTEN MOUNTS THIS: the list's filter (its menu from 640 and its sheet below), a saved view's
  narrowing, a page block's filter and an automation's condition. Each hands it the tree it stores and takes the tree
  back through `onchange`; none keeps an editor of its own, because three editors of one tree are three readings of it.

  THE SURFACES OVER THE ONE TREE (`docs/21 §4.1`), top to bottom. "Describe it" asks Slash for a first draft, where Slash answers on this
  host (`describe` is absent where it does not, and so is the control). The rows: one condition is one sentence row, two
  or more a stack, and "all", "any" and "none of" groups nest to `depth`. The text lens, folded under "As text", shows
  the sentence the record parses and reads typed text back through the record's own parser. And the foot, pinned: the
  record's count for this filter ("Matches n of N"), debounced, and Done.

  THE PROPS ARE THE CONTRACT, and a consumer is built against them:
    value     the stored tree, or undefined for none
    fields    the fields a condition may name, as a register declares them (`QueryField`)
    register  the list the fields are on, which the text lens parses against
    onchange  the tree after each change that changes it, proposals left out
    depth     how deep groups nest: 3 by default, 1 for a flat "and" (the list's address)
    ops       the operators the surface can store, when narrower than every one (`ADDRESS_OPS`)
    count     the record's count for a tree, with proposals in, or null when it cannot say
    describe  Slash's draft for a description, or null when it drafted nothing that is a filter
    ondone    Done, pinned at the foot beside the count; absent where the surface has its own
    now       the clock the text lens resolves a day against; absent is the tab's

  A PROPOSAL IS NEVER PART OF THE FILTER UNTIL IT IS KEPT. Slash's rows are drawn marked, the count is asked with them
  in so the person sees what keeping them would do, and they are kept top to bottom, one press each; "Approve all" is
  one quiet button and never the default.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { Predicate } from '@braindog/where';
  import { copy } from '$lib/copy.ts';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import QueryGroup from './QueryGroup.svelte';
  import {
    added,
    approved,
    approvedAll,
    condCount,
    COUNT_WAIT_MS,
    depthOf,
    emptyRoot,
    fits,
    fromWhere,
    MAX_DEPTH,
    newCond,
    patched,
    proposing,
    readSentence,
    removed,
    sentenceOf,
    toWhere,
    topProposed,
    withoutProposed,
    type Counted,
    type Edits,
    type Grp,
    type OpId,
    type QueryField,
  } from './tree.ts';

  let {
    value,
    fields,
    register,
    onchange,
    depth = MAX_DEPTH,
    ops,
    count,
    describe,
    ondone,
    now,
  }: {
    value: Predicate | undefined;
    fields: readonly QueryField[];
    register: string;
    onchange: (next: Predicate | undefined) => void;
    depth?: number | undefined;
    ops?: readonly OpId[] | undefined;
    count?: ((where: Predicate | undefined) => Promise<Counted | null>) | undefined;
    describe?: ((words: string) => Promise<Predicate | null>) | undefined;
    ondone?: (() => void) | undefined;
    now?: number | undefined;
  } = $props();

  const cap = $derived(Math.max(1, Math.min(MAX_DEPTH, depth)));

  /* ── the rows, and the tree they came from ───────────────────────────────── */

  let root = $state<Grp>(emptyRoot());
  /** The stored tree has a part the rows cannot draw, so it is left exactly as it is. */
  let undrawn = $state(false);
  /**
   * THE TREE LAST EMITTED, AS TEXT, so the surface handing it straight back does not rebuild the rows. Without it a
   * condition being typed (which emits nothing, being incomplete) would be wiped by the next `value` from above.
   */
  let emitted: string | null = null;

  $effect(() => {
    const said = JSON.stringify(value ?? null);
    if (said === emitted) return;
    emitted = said;
    const drawn = untrack(() => fromWhere(value, fields));
    root = drawn ?? emptyRoot();
    undrawn = drawn === null;
    misread = null;
  });

  /** The rows changed: draw them, and hand the surface the tree when the tree it stores is different. */
  function commit(next: Grp) {
    root = next;
    const where = toWhere(withoutProposed(next), register, fields);
    const said = JSON.stringify(where ?? null);
    if (said === emitted) return;
    emitted = said;
    onchange(where);
  }

  const edits: Edits = $derived({
    fields,
    ops,
    depth: cap,
    deepest: depthOf(root),
    next: topProposed(root),
    set: (key, patch) => commit(patched(root, key, patch, fields, ops)),
    remove: (key) => commit(removed(root, key)),
    addCond: (group) => commit(added(root, group, newCond(fields, ops))),
    addGroup: (group) => commit(added(root, group, { ...emptyRoot(root.join === 'any' ? 'all' : 'any'), items: [newCond(fields, ops)] })),
    keep: (key) => commit(approved(root, key)),
  });

  /* ── the count ────────────────────────────────────────────────────────────── */

  let counted = $state<Counted | null>(null);
  let counting = $state(false);
  /** Answers from an older tree are dropped: only the newest question's count is drawn. */
  let ticket = 0;
  /** The tree the count is asked about, proposals in, as text so an unchanged tree asks nothing. */
  const asked = $derived(count ? JSON.stringify(toWhere(root, register, fields) ?? null) : '');

  $effect(() => {
    const key = asked;
    const counter = count;
    if (!counter) return;
    counting = true;
    const mine = ++ticket;
    const wait = setTimeout(() => {
      counter(key === 'null' ? undefined : (JSON.parse(key) as Predicate))
        .then((out) => {
          if (mine !== ticket) return;
          counted = out;
          counting = false;
        })
        .catch(() => {
          if (mine === ticket) counting = false;
        });
    }, COUNT_WAIT_MS);
    return () => clearTimeout(wait);
  });

  /* ── the text lens ────────────────────────────────────────────────────────── */

  const sentence = $derived(sentenceOf(withoutProposed(root), fields));
  /** The words in the box while somebody is writing them; `null` is the sentence the rows say. */
  let text = $state<string | null>(null);
  /** Where the last read stopped. The rows it last read stay drawn, greyed, and nothing clears them. */
  let misread = $state<{ after: string | null; fix: string } | null>(null);

  /** The box left: its words read by the record's parser, and the rows replaced only when every word was read. */
  function readText() {
    if (text === null) return;
    const read = readSentence(text, register, fields, now ?? Date.now());
    if (!read.ok) {
      misread = { after: read.after, fix: read.fix };
      return;
    }
    misread = null;
    text = null;
    commit(read.root);
  }

  /* ── Describe it ──────────────────────────────────────────────────────────── */

  let words = $state('');
  let asking = $state(false);
  let slashSaid = $state<string | null>(null);

  async function ask() {
    const said = words.trim();
    if (asking || !describe || !said) return;
    asking = true;
    slashSaid = null;
    try {
      const where = await describe(said);
      const drawn = where ? fromWhere(where, fields) : null;
      const next = drawn && condCount(drawn) > 0 ? proposing(root, drawn) : null;
      if (next && fits(next, cap, ops)) commit(next);
      else slashSaid = copy.queryDescribeNone;
    } catch {
      slashSaid = copy.queryDescribeNone;
    } finally {
      asking = false;
    }
  }
</script>

<div class="qb">
  {#if describe}
    <form
      class="qb-describe"
      onsubmit={(e) => {
        e.preventDefault();
        void ask();
      }}
    >
      <label class="qb-label" for="qb-words-{register}">{copy.queryDescribe}</label>
      <div class="qb-ask">
        <input id="qb-words-{register}" class="qb-box" type="text" bind:value={words} disabled={asking} />
        <Button weight="quiet" type="submit" disabled={asking || !words.trim()}><Icon name="ask" size="s" />{copy.queryDescribeGo}</Button>
      </div>
      {#if slashSaid}<p class="qb-note" role="status">{slashSaid}</p>{/if}
    </form>
  {/if}

  {#if undrawn}
    <p class="qb-note">{copy.queryUndrawn}</p>
  {:else}
    <div class="qb-rows" data-stale={misread ? '' : undefined}>
      {#if root.items.length === 0}<p class="qb-note">{copy.queryEverything}</p>{/if}
      <QueryGroup group={root} level={1} {edits} />
    </div>

    {#if edits.next !== null}
      <div class="qb-approve">
        <Button weight="quiet" onclick={() => commit(approvedAll(root))}>{copy.queryApproveAll}</Button>
      </div>
    {/if}

    <details class="qb-lens">
      <summary class="qb-summary">{copy.queryAsText}</summary>
      {#if sentence === null}
        <p class="qb-note">{copy.queryNoSentence}</p>
      {:else}
        <textarea
          class="qb-box qb-text"
          aria-label={copy.queryTextName}
          rows="3"
          value={text ?? sentence}
          oninput={(e) => (text = e.currentTarget.value)}
          onchange={readText}
        ></textarea>
        {#if misread}<p class="qb-misread" role="status" title={misread.fix}>{copy.queryCouldNotRead(misread.after)}</p>{/if}
      {/if}
    </details>
  {/if}

  {#if count || ondone}
    <div class="qb-foot">
      {#if count}
        <span class="qb-count num" role="status" data-counting={counting ? '' : undefined}>
          {counted ? copy.queryMatches(counted.n, counted.of) : copy.queryCounting}
        </span>
      {/if}
      {#if ondone}
        <Button weight="primary" onclick={ondone}><Icon name="check" size="s" />{copy.done}</Button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .qb {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    min-inline-size: 0;
  }

  .qb-describe {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .qb-label {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
    font-weight: 500;
  }

  .qb-ask {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .qb-box {
    flex: 1 1 12rem;
    min-inline-size: 0;
    min-block-size: var(--ctl-h);
    padding: var(--sp-1) var(--sp-3);
    background: var(--tile);
    border: 1px solid var(--switch-off);
    border-radius: var(--r-pop);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
  }

  .qb-note {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  /* A MISREAD LEAVES THE LAST GOOD ROWS WHERE THEY ARE, greyed, so what still applies is visible under the line. */
  .qb-rows[data-stale] {
    opacity: 0.55;
  }

  .qb-approve {
    display: flex;
  }

  .qb-summary {
    min-block-size: var(--ctl-h);
    color: var(--ink-2);
    font-weight: 500;
    line-height: var(--ctl-h);
    cursor: pointer;
  }

  .qb-text {
    inline-size: 100%;
    resize: vertical;
    font-family: inherit;
  }

  .qb-misread {
    margin: var(--sp-1) 0 0;
    color: var(--red);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  /* THE COUNT AND DONE STAY AT THE FOOT, pinned to the bottom of whatever scrolls the builder, so the answer to the
     filter is in view while it is written (the primary stays visible). */
  .qb-foot {
    position: sticky;
    inset-block-end: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    padding-block: var(--sp-3);
    background: var(--tile-2);
    border-block-start: 1px solid var(--rule);
  }

  .qb-count {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .qb-count[data-counting] {
    color: var(--ink-3);
  }
</style>
