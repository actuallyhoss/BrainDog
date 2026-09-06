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
-->
<script lang="ts">
  import { KINDS, isKind } from 'braindog-render';

  import { copy } from '../copy.ts';
  import { pages } from '../record/api.ts';
  import { BINDABLE, seedBlock } from '../record/seed.ts';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';

  let {
    open = $bindable(false),
    register,
    predicate,
    says,
    onbind,
  }: {
    open?: boolean;
    register: string;
    /** The saved view's name — becomes the block's heading, because it is what you called it. */
    predicate: string;
    says: string;
    onbind: (page: string, kind: string) => void;
  } = $props();

  /**
   * The pages this could go on: the ones that already require this register.
   *
   * 06 §7 — *"a page cannot read a register it did not declare"*. A page that does not require the
   * register is not a page this block can live on, so it is not offered. That is the same rule as
   * the query builder's: there is no invalid state because the invalid choice is absent.
   */
  const destinations = $derived(
    /* `pages()`, not `PAGES`: the declared set holds TEMPLATES, so this offered a destination
       called `{{name}}` — a page that does not exist, while the three that do sat in the rail
       beside it. A template is not somewhere you can put a block; the pages it resolves to are. */
    Object.values(pages()).filter((p) => p.requires.includes(`register.${register}`) && p.nav),
  );

  let toPage = $state('');
  let kind = $state('table');

  const kinds = $derived(BINDABLE.filter((k) => isKind(k)));

  $effect(() => {
    if (open && !toPage) toPage = destinations[0]?.page ?? '';
  });
</script>

<Sheet bind:open title={copy.bindBlock} id="{register}.{predicate}">
  <div class="form">
    <!-- The sentence, with the two halves the view already answered stated rather than asked. 21
         §3.4: the middle control never contains an expression, it contains NAMES. -->
    <p class="sentence">
      <span class="said">{copy.showMe}</span>
      <code class="fixed">{register}</code>
      <span class="said">{copy.thatIs}</span>
      <code class="fixed">{predicate}</code>
    </p>
    <p class="says">{says}</p>

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
        {#each destinations as d}<option value={d.page}>{d.title}</option>{/each}
      </select>
    </label>

    {#if destinations.length === 0}
      <p class="none">{copy.noDestination(register)}</p>
    {:else}
      <!-- What will exist afterwards, spelled out. A2: nothing applies without a diff, and the
           smallest honest diff for one added block is the sentence describing it. -->
      <p class="preview">
        <Icon name="plus" size="s" />
        {copy.willAdd(copy.kindNames[kind] ?? kind, isKind(kind) ? KINDS[kind].minSpan : 4)}
      </p>
    {/if}
  </div>

  {#snippet footer()}
    <Button
      weight="primary"
      disabled={destinations.length === 0}
      onclick={() => {
        onbind(toPage, kind);
        open = false;
      }}
    >
      {copy.bindBlock}
    </Button>
    <Button weight="bare" onclick={() => (open = false)}>{copy.close}</Button>
  {/snippet}
</Sheet>

<style>
  .form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
  }

  .sentence {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-2);
    font-size: var(--t-md);
  }

  .said {
    color: var(--dim);
  }

  .fixed {
    padding: 2px 7px;
    background: var(--sunk);
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    color: var(--ink);
    font-family: var(--font-id);
    font-size: var(--t-sm);
  }

  .says {
    margin-block-start: calc(var(--sp-3) * -1);
    color: var(--dim);
    font-family: var(--font-id);
    font-size: var(--t-xs);
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
