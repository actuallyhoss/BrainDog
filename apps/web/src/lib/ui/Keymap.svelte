<!--
  What `?` draws, read FROM THE REGISTRY.

  Which is the whole point: the sheet cannot drift from what is bound, because it is not a second
  list. A cheat sheet maintained by hand is a cheat sheet that is wrong by the second release.

  AND IT NOW READS THE ONE COLUMN OF THE REGISTRY THAT NOTHING READ. `Binding.bare` is written on
  all forty-five rows and, until this, its only consumer was the test that recomputes it from
  `binding.key` and asserts the two agree: a hand-maintained duplicate of a value the test derives,
  justified by a sentence claiming the switch reads it. The switch reads `e.key.length === 1` and
  the cookie. So the flag was true of nothing.

  The switch it describes is the app's WCAG 2.1.4 conformance, and a reader who turns it off loses
  nine of the rows below including `?`, `/` and `g`. A sheet that goes on printing them as though
  they work is the same defect as the flag: complete-looking, and saying nothing.
-->
<script lang="ts">
  import Icon from './Icon.svelte';
  import { BINDINGS, SCOPE_ORDER, type Scope } from '../a11y/keys.svelte.ts';
  import { copy } from '../copy.ts';
  import * as pref from '../pref.ts';
  import Kbd from './Kbd.svelte';

  /* THE SWITCH'S STATE, AND THE CALLER MAY OWN IT. `/settings/keyboard` draws this sheet directly
     under the control, where the reader is pressing On and Off: reading the cookie there would show
     the previous answer until the page reloaded. The sheet in `?` has no such control beside it, so
     the cookie is the right default. */
  /* `only` NARROWS THE SHEET TO THE KEYS NAMED, and `query` TO THE KEYS WHOSE WORDS, KEY, PLACE OR ID HOLD IT: the
     Keyboard area draws the twenty used most and finds the rest by typing. A query wins over `only`. */
  /* `columns` (G7, additive): each place its own table, the tables in two columns where the space holds two, so the
     Keyboard area is half as tall. Without it the sheet is the one table it was, which `?` draws. */
  let {
    silenced = pref.read().chars === false,
    only,
    query = '',
    columns = false,
  }: { silenced?: boolean; only?: readonly string[] | undefined; query?: string; columns?: boolean } = $props();

  const TITLE: Record<Scope, string> = {
    document: copy.scopeDocument,
    today: copy.scopeToday,
    workscreen: copy.scopeWork,
    grid: copy.scopeGrid,
    board: copy.scopeBoard,
    page: copy.scopePage,
    decide: copy.scopeDecide,
    inbox: copy.scopeInbox,
    gate: copy.scopeGate,
    palette: copy.scopePalette,
    nav: copy.scopeNav,
  };

  /* One glyph per scope, so the groups read as places rather than as paragraphs. */
  const GLYPH = {
    document: 'home',
    today: 'today',
    workscreen: 'task',
    grid: 'rows',
    board: 'board',
    page: 'doc',
    decide: 'decide',
    inbox: 'inbox',
    gate: 'decide',
    palette: 'search',
    nav: 'settings',
  } as const;

  const asked = $derived(query.trim().toLowerCase());
  const shown = (b: { id: string; scope: Scope; key: string; label: string }): boolean =>
    asked !== ''
      ? `${b.id} ${b.label} ${b.key} ${TITLE[b.scope]}`.toLowerCase().includes(asked)
      : only === undefined || only.includes(b.id);
  const groups = $derived(SCOPE_ORDER.map((scope) => [scope, BINDINGS.filter((b) => b.scope === scope && shown(b))] as const).filter(([, bs]) => bs.length > 0));

  /**
   * ONE ROW PER PLACE FOR THE `g` CHORD (UI pass 20 Oct, agents F27). "g then h d i s v p ," was one key cap beside
   * seven names, so which letter went where was left to counting. Split into "g then h" Today, "g then d" Needs you, and
   * so on, when the letters and the names come out the same in number; anything else stays the one row it was.
   */
  function rowsOf(b: { id: string; key: string; label: string }): { key: string; label: string }[] {
    const head = 'g then ';
    if (b.id !== 'goto' || !b.key.startsWith(head) || !b.label.startsWith('Go to ')) return [b];
    const letters = b.key.slice(head.length).split(' ').filter(Boolean);
    const names = b.label.slice('Go to '.length).split(', ');
    if (letters.length !== names.length) return [b];
    return letters.map((l, i) => ({ key: `${head}${l}`, label: `Go to ${names[i]}` }));
  }
</script>

{#if silenced}
  <p class="silenced">{copy.keymapSilenced}</p>
{/if}

<!--
  ONE TABLE, SO ONE EDGE. Each scope was its own grid whose key column was
  as wide as that scope's longest chord, so the words started at a different x in every group and the sheet read as
  several tables set one under another. One table shares one key column across every scope, and the words start at
  one x from the first row to the last. A scope's name is a header row over its rows (`scope="rowgroup"`), so a screen
  reader still hears which place a key belongs to.
-->
{#snippet scopeRows(scope: Scope, bindings: (typeof BINDINGS)[number][])}
  <tbody class="scope">
    <tr>
      <th class="scope-title" colspan="2" scope="rowgroup"><span class="scope-name"><Icon name={GLYPH[scope]} size="s" />{TITLE[scope]}</span></th>
    </tr>
    {#each bindings as binding}
      {#each rowsOf(binding) as row}
        <tr>
          <td class="key" class:off={silenced && binding.bare}><Kbd keys={row.key} /></td>
          <td class="does">
            {row.label}{#if silenced && binding.bare}<span class="tag">{copy.keymapRowOff}</span>{/if}
          </td>
        </tr>
      {/each}
    {/each}
  </tbody>
{/snippet}

{#if columns}
  <!-- A TABLE A PLACE, IN TWO COLUMNS THAT FILL DOWN: the key column keeps one width (`--key-w`) so the words in a
       column still start at one x. -->
  <div class="key-cols" role="group" aria-label={copy.keymap}>
    {#each groups as [scope, bindings]}
      <table class="keys">{@render scopeRows(scope, [...bindings])}</table>
    {/each}
  </div>
{:else}
  <table class="keys" aria-label={copy.keymap}>
    {#each groups as [scope, bindings]}
      {@render scopeRows(scope, [...bindings])}
    {/each}
  </table>
{/if}

<style>
  .keys {
    inline-size: 100%;
    border-collapse: collapse;
  }

  .key-cols {
    columns: 2 22rem;
    column-gap: var(--sp-7);
  }

  .key-cols > .keys {
    break-inside: avoid;
    margin-block-end: var(--sp-5);
  }

  .key-cols > .keys .scope-title {
    padding-block-start: 0;
  }

  .key-cols .key {
    min-inline-size: 5.5rem;
  }

  /* The space between scopes is the header row's own, above its name, so the first scope starts at the table's top. */
  /* A META HEADING over each scope, as the palette's are. */
  .scope-title {
    padding-block: var(--sp-5) var(--sp-2);
    color: var(--ink-3);
    font-family: var(--font-ui);
    font-size: var(--fs-meta);
    font-weight: 500;
    text-align: start;
  }

  .scope:first-child .scope-title {
    padding-block-start: 0;
  }

  .scope-name {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  /* THE KEY COLUMN IS AS WIDE AS THE LONGEST CHORD IN THE WHOLE SHEET and no wider, so the words beside it start at one
     x and take the rest. */
  .key {
    inline-size: 1%;
    padding-block: var(--sp-1);
    padding-inline-end: var(--sp-3);
    white-space: nowrap;
    vertical-align: baseline;
  }

  .does {
    padding-block: var(--sp-1);
    color: var(--ink);
    font-size: var(--fs-body);
    vertical-align: baseline;
  }

  /* ON A PHONE A ROW WRAPS: the longest chord ("g then h d i s v p ,") made the shared key column wider than the screen
     had left for the words, and the table stood past the page. Below 640 each row is its chord and then its words,
     which move under the chord when they do not fit beside it. */
  @media (width < 640px) {
    .keys,
    .scope,
    .scope-title {
      display: block;
    }

    .keys tr {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      column-gap: var(--sp-3);
    }

    .scope-title {
      flex: 1 1 100%;
    }

    .key {
      inline-size: auto;
      padding-inline-end: 0;
    }

    .does {
      flex: 1 1 12rem;
      min-inline-size: 0;
    }
  }

  /* THE MARK IS NOT COLOUR ALONE. A silenced row is dimmed AND carries the word, because
     `19 §4` is an accessibility control and the one reader most likely to have turned it on is the
     one least served by a change in opacity. */
  .silenced {
    margin: 0 0 var(--sp-4);
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  .key.off {
    opacity: 0.45;
  }

  .tag {
    margin-inline-start: var(--sp-2);
    padding: 0 var(--sp-1);
    border: 1px solid var(--rule);
    border-radius: var(--r-xs);
    color: var(--ink-3);
    font-family: var(--font-ui);
    font-size: var(--fs-meta);
  }
</style>
