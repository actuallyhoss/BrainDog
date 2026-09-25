<!--
  `Bind as a block` — a saved view, put on a page.

  THIS IS THE WHOLE WIZARD, and it is deliberately small.

  The research said the smallest genuinely useful generator is not a page generator at all: it is a
  ONE-BLOCK generator with a page-shaped destination. Three reasons, and they are not preferences:

    1. A whole-page proposal cannot be FILED. 24 §4.4 enumerates the twelve things an assistant may
       propose, and "generate a page" is on none of the three lists; 46 §5.3 enforces that closure as
       a diff-path whitelist. A `change` body needs a falsifiable prediction with a frozen integer
       baseline, and "is this page good?" has no measure that is not `page.render` count — which is
       Goodhart and refused by name.
    2. So the generator must be USER-INITIATED. Pressing this button is the consent; there is
       nothing to predict, and nothing lands in a queue somebody has to grade.
    3. And the elicitation is already designed. 21 §3.4's binding sentence is `Show me [source] /
       that is [named predicate] / as [kind]`. A saved view has already answered the first two. All
       that is left is the kind and the destination, which is what this sheet asks.

  It also never places anything in nav. 29 §8 refuses that outright, on twenty years of evidence:
  Findlater & McGrenere measured static menus faster than adaptive ones, Microsoft shipped
  Personalized Menus and withdrew them, and WCAG 3.2.3 is normative against it. A block joins a page
  you already have; the page's own position is yours.

  THE PRESS WRITES THE BLOCK. The sheet asks `boot` whether the record answered when it opens (`readBoot` keeps its
  answer per base, so this costs no request), offers the record's own pages that require the list, adds the block
  through `bind-write.ts`, and the toast's Put back sets the page body the write read. A record that refused is its
  sentence in the sheet. It used to offer the sample's pages whatever record was behind it, so a real list was offered
  the fictional studio's pages and the press put the block on none of them; after that it kept a sample side, which
  offered them only when no record answered and toasted "nothing was saved". DIRECTION 26 removed that side.
-->
<script lang="ts">
  import { KINDS, isKind } from 'braindog-render';

  import { apiBase } from '../at.ts';
  import { copy } from '../copy.ts';
  import type { Destination, ListDecl } from '../record/bind-write.ts';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';
  import { toasts } from './toast.svelte.ts';

  let {
    open = $bindable(false),
    register,
    predicate,
    says,
  }: {
    open?: boolean;
    register: string;
    /**
     * What the view filters by, which on a live record becomes the block's `where`: a sentence about the list, the search
     * text when there is no filter, or `copy.everything`, which writes none.
     */
    predicate: string;
    /** The same filter in the words a person reads, which the block's heading carries after the list's name. */
    says: string;
  } = $props();

  /** What the record offers, or its refusal. Nothing until `boot` has answered. */
  type Side =
    | { from: 'live'; name: string; destinations: Destination[]; kinds: string[]; declared: ListDecl | null; unkept: string | null }
    | { from: 'refused'; fix: string };

  /* A PRESS OR AN OPENING THAT THREW, said here and not in `bind-write.ts`, because the throw that happens is that module
     failing to load (a deploy after the tab opened replaces every hashed chunk), and a sentence kept in it cannot be
     reached on the one press that needs it. */
  const failed = 'Nothing was added, because part of this screen could not be loaded. Reload the page and try again.';

  let side = $state<Side | null>(null);
  let toPage = $state('');
  let kind = $state('table');
  let busy = $state(false);
  /* THE RECORD'S SENTENCE FOR A PRESS IT REFUSED, said in the sheet and not in a toast, because the sheet is still open
     on the choice that was refused: a search text that is not a filter, or a page that moved. */
  let problem = $state<string | null>(null);

  /**
   * Ask `boot` whether the record answered, then what it offers. Asked on every opening, so a page added since is there.
   *
   * `predicate` and `says` are passed in rather than read after the first `await`, so the effect that calls this tracks
   * them and a filter changed under an open sheet is asked about again.
   */
  async function look(list: string, predicate: string, says: string) {
    let next: Side;
    try {
      const { readBoot } = await import('../record/boot-live.ts');
      const booted = await readBoot(apiBase());
      if (booted.from === 'refused') next = { from: 'refused', fix: booted.fix };
      else {
        const m = await import('../record/bind-write.ts');
        const sheet = await m.liveSheet(apiBase(), list);
        next = sheet.from === 'live' ? { ...sheet, kinds: [...m.LIVE_KINDS], unkept: m.unkept(predicate, says, sheet.name) } : sheet;
      }
    } catch {
      /* The same chunk failure as a press, one step earlier: the sheet sat empty with a disabled button and no reason. */
      next = { from: 'refused', fix: failed };
    }
    side = next;
    if (next.from === 'refused') return;
    if (!next.destinations.some((d) => d.slug === toPage)) toPage = next.destinations[0]?.slug ?? '';
    if (!next.kinds.includes(kind)) kind = next.kinds[0] ?? 'table';
  }

  $effect(() => {
    if (!open) return;
    problem = null;
    void look(register, predicate, says);
  });

  /* THE SEARCH THE ROUTE HANDED OVER AS A FILTER, said before the press and in place of it (`unkept`). */
  const unkept = $derived(side?.from === 'live' ? side.unkept : null);

  const destinations = $derived(side && side.from !== 'refused' ? side.destinations : []);
  const kinds = $derived(side && side.from !== 'refused' ? side.kinds : []);

  /* The list by the name a person gave it, never its id. */
  const listName = $derived(side && side.from !== 'refused' ? side.name : '');

  const kindName = $derived(copy.kindNames[kind] ?? kind);

  /* THE BLOCK'S HEADING IS THE LIST, AND THE FILTER WHEN THERE IS ONE, in the shape a seeded block's is (`seed.ts`,
     "Obligations: owed to me"), so two blocks bound from one list onto one page are told apart by what they hold. */
  const heading = $derived(predicate === copy.everything || says === '' ? listName : `${listName}: ${says}`);

  async function bind() {
    if (!side || side.from === 'refused' || busy) return;
    const to = side.destinations.find((d) => d.slug === toPage);
    if (!to || side.unkept) return;
    const declared = side.declared;
    busy = true;
    problem = null;
    const base = apiBase();
    /* `busy` IS CLEARED IN A `finally` because it was cleared on the line after two awaits, and a chunk that failed to
       load threw past it: the button stayed disabled until the sheet was remounted, and nothing said why. */
    let m: typeof import('../record/bind-write.ts');
    let out: Awaited<ReturnType<typeof m.bindTo>>;
    try {
      m = await import('../record/bind-write.ts');
      out = await m.bindTo(base, to, m.boundBlock(register, predicate, kind, heading, declared));
    } catch {
      problem = failed;
      return;
    } finally {
      busy = false;
    }
    if (out.from !== 'written') {
      problem = out.fix;
      return;
    }
    open = false;
    const { before, version } = out;
    /* PUT BACK SETS THE BODY THE WRITE READ, at the version the write made, as arrange mode's undo does. A page somebody
       changed in between is refused rather than overwritten, and that refusal is said. */
    toasts.push(m.words.bound(kindName, to.title), {
      intent: 'good',
      undo: () =>
        void import('../record/page-write.ts')
          .then((w) => w.setBody(base, before, undefined, version))
          .then((back) => {
            if (back.from !== 'written') toasts.push(back.fix, { intent: 'warn' });
          }),
    });
  }
</script>

<Sheet bind:open title={copy.bindBlock}>
  <div class="form">
    <!-- The sentence, with the two halves the view already answered stated rather than asked. 21
         §3.4: the middle control never contains an expression, it contains NAMES, so the list is
         named as the rail names it and no id appears, in the sentence or in the sheet's title. -->
    <p class="sentence">
      <span class="said">{copy.showMe}</span> <span class="fixed" dir="auto">{listName}</span><span class="said">:</span>
      <span class="fixed" dir="auto">{predicate}</span>
    </p>
    <p class="says">{says}</p>

    <!-- A SEARCH ASKS NOTHING. The kind and the page are choices about a block, and there is no block to make, so the
         sheet says why and what can be kept instead, where the two choices and the press would have been. -->
    {#if unkept}
      <p class="none" role="status">{unkept}</p>
    {:else}
      <label class="row">
        <span class="row-label">{copy.asA}</span>
        <select class="row-input" bind:value={kind}>
          {#each kinds as k}
            <option value={k}>{copy.kindNames[k] ?? k}</option>
          {/each}
        </select>
      </label>

      <label class="row">
        <span class="row-label">{copy.onPage}</span>
        <select class="row-input" bind:value={toPage}>
          {#each destinations as d}<option value={d.slug}>{d.title}</option>{/each}
        </select>
      </label>

      {#if side?.from === 'refused'}
        <p class="none">{side.fix}</p>
      {:else if side && destinations.length === 0}
        <p class="none">{copy.noDestination(listName)}</p>
      {:else if side}
        <!-- What will exist afterwards, spelled out. A2: nothing applies without a diff, and the
             smallest honest diff for one added block is the sentence describing it. -->
        <p class="preview">
          <Icon name="plus" size="s" />
          {copy.willAdd(kindName, isKind(kind) ? KINDS[kind].minSpan : 4)}
        </p>
      {/if}
    {/if}
    {#if problem}<p class="none" role="status">{problem}</p>{/if}
  </div>

  {#snippet footer()}
    {#if !unkept}
      <Button weight="primary" disabled={destinations.length === 0 || busy} onclick={() => void bind()}>
        {copy.bindBlock}
      </Button>
    {/if}
    <Button weight="bare" onclick={() => (open = false)}>{copy.close}</Button>
  {/snippet}
</Sheet>

<style>
  .form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
  }

  /* Plain text in the body face: the product's own words dim, the names the view brought ink. No
     chips, because a name somebody gave a list is not code. */
  .sentence {
    font-size: var(--t-md);
    overflow-wrap: anywhere;
  }

  .said {
    color: var(--dim);
  }

  .fixed {
    color: var(--ink);
    font-weight: 600;
  }

  .says {
    margin-block-start: calc(var(--sp-3) * -1);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .row {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .row-label {
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 600;
  }

  /* Both selects the same width. A form whose controls are sized by the length of their longest
     option is a form with a ragged right edge, and the eye reads the ragged edge as a hierarchy
     that is not there. */
  .row-input {
    inline-size: 100%;
    min-block-size: var(--ctl-h);
    padding: 0 var(--sp-3);
    background: var(--s3);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-ui);
  }

  .preview,
  .none {
    display: flex;
    align-items: start;
    gap: var(--sp-2);
    padding: var(--sp-3);
    background: var(--sunk);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    color: var(--dim);
    font-size: var(--t-sm);
  }
</style>
