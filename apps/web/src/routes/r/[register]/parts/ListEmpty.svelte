<!--
  The list with no rows to draw, in the one of three states it is in: nothing in it yet, nothing
  matching what the reader asked for, or nothing outstanding. The page decides which (`emptyKind`);
  this draws it, and the example row it offers is the page's write (`addExample`).

  THE QUERY IS QUOTED VERBATIM, in its own line and in the id face, rather than folded into
  the title as a curly-quoted fragment of a sentence. That is where a predicate stops being
  checkable: a reader cannot tell a filter they typed from one the app built. `Empty` has
  had the prop and the styling for it since it was written and no call site passed it.

  AND BOTH HALVES OF IT, because both narrowed the list. It read `q || whereOf(filters)`,
  which dropped every active chip the moment a search term existed: at `?q=zzz&f=state:in:paid`
  the `paid` chip reads `aria-pressed="true"` on screen and the sentence underneath said
  "38 rows, none matching: zzz". Half a query quoted verbatim is the same failure the
  paragraph above describes, committed by the line below it.

  VERBATIM IS THE READER'S WORDS, NOT THE COLUMN'S. `whereOf` builds the sentence the
  evaluator reads, so it spells the stored value, `direction is owed_to_me`, and the chip
  the reader actually pressed says "owed to me". Quoting the storage would show them a
  filter they never set. The typed search term passes through exactly as typed, because
  that one IS their words.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import { iconFor, whereOf, type Filter } from '$lib/record/api.ts';
  import { saidPlainly } from '$lib/record/blocks.ts';
  import type { RegisterDecl } from '$lib/record/schema.ts';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import NextStep from '$lib/ui/NextStep.svelte';

  let {
    kind,
    register,
    decl,
    size,
    q,
    filters,
    searched,
    adds = false,
  }: {
    kind: 'no-data-yet' | 'no-results' | 'cleared';
    register: string;
    decl: RegisterDecl;
    /**
     * What the list holds, which is what "none matching" is counted against. NOT `total`, because the head's
     * `total` is the answer while filtering (`denominator`), and `search.test.ts` holds the page to never handing
     * anything `total={result.total}`, so the two numbers are told apart by name.
     */
    size: number;
    q: string;
    filters: Filter[];
    /** The labels of the fields the search box matches. */
    searched: string[];
    /** Whether the reader may add to this list: an empty one then leads with its own Add (AH28). */
    adds?: boolean | undefined;
  } = $props();

  /* WHAT THE LIST IS FOR, UNDER "NOTHING IN IT YET" (next-money, M41): Exchange rates said "Nothing in Exchange rates
     yet." and nothing of what a rate does. Its own `holds:`, as a sentence. */
  const heldSaid = $derived(typeof decl.holds === 'string' && decl.holds.trim() !== '' ? `It holds ${decl.holds.trim().replace(/\.$/u, '')}.` : undefined);
  /* "Add a bill or invoice": the list's own word for one entry. */
  const addOne = $derived(`Add ${/^[aeiou]/iu.test(decl.one ?? '') ? 'an' : 'a'} ${(decl.one ?? 'entry').toLowerCase()}`);
</script>

<Empty
  {kind}
  glyph={kind === 'no-data-yet' ? iconFor(decl.icon, 'rows') : undefined}
  title={kind === 'no-results'
    ? `${size} in ${decl.name}, none matching:`
    : kind === 'cleared'
      ? 'Nothing outstanding.'
      : `Nothing in ${decl.name} yet.`}
  query={kind === 'no-results' ? [q, saidPlainly(register, whereOf(filters))].filter(Boolean).join(' · ') : undefined}
  body={kind === 'no-results' && q ? copy.searchesOnly(searched) : kind === 'no-data-yet' ? heldSaid : undefined}
>
  {#snippet actions()}
    <!-- NO "Add the first row" AND NO EXAMPLE ROW. The capture line sits directly above and the New button beside the
         title, so an empty list drew three ways to add a row; and no row nobody typed is written by any path,
         so the example offer went too. -->
    {#if kind === 'no-results'}
      <Button href="/r/{register}">{copy.clearFilters}</Button>
    {:else if kind === 'no-data-yet' && adds}
      <!-- AN EMPTY LIST LEADS WITH ITS OWN ADD (AH28), never "Connect your agent": it opens the list's add line. THE ONE
           ADD (empty states, 2 Nov): the head's red Add waits until the list holds something. Quiet, since the add line
           it opens carries the red Add. -->
      <Button href="/r/{register}?add=1">{addOne}</Button>
    {:else if kind === 'no-data-yet'}
      <NextStep />
    {/if}
  {/snippet}
</Empty>
