<!--
  An automation's condition: the trigger's "Only when" and a branch's "If". It is GAP-2's query builder
  (`lib/query/QueryBuilder.svelte`) over the `where` tree the record stores (`packages/where`), with AND, OR and NONE
  groups nested as the record nests them, and a sentence kept as a sentence.

  ONE EDITOR OF ONE TREE (`docs/21 §4.1`). This was going to be an AND/OR builder of its own; the list, a saved view and
  a page block already edit the same tree with `QueryBuilder`, and a fourth editor would be a fourth reading of it. So
  this file only decides which of two forms is on the screen and hands the builder the fields a condition may name.

  A SENTENCE IS KEPT AS A SENTENCE UNTIL THE PERSON ASKS. `when: due before today` is what an agent writes, and the
  record reads it again each day; parsed into rows it would become one fixed date (`resolveDay` in
  `packages/where/src/sentence.ts` resolves a day as it reads). So a stored sentence opens in words, "Edit as
  conditions" turns it into rows only where it names no day relative to today, and "Write it in words" turns rows back
  into the sentence they are (`sentenceOf`), where they have one.

  WITH NO FIELDS TO OFFER, WORDS. An arrival's body has no declared fields, and a list the record will not describe has
  none either; the sentence box still takes anything the record reads, and the record checks it (`checkAutomation`).
-->
<script lang="ts">
  import type { Predicate } from '@braindog/where';
  import Button from '$lib/ui/Button.svelte';
  import QueryBuilder from '$lib/query/QueryBuilder.svelte';
  import { fromWhere, readSentence, sentenceOf, toWhere, type QueryField } from '$lib/query/tree.ts';
  import { sayCondition, words } from './flow.ts';

  let {
    id,
    labelledby,
    value,
    fields,
    register,
    hint,
    now = Date.now,
    onchange,
  }: {
    id: string;
    labelledby: string;
    /** The stored condition: a sentence, a tree, or null for none. */
    value: unknown;
    fields: readonly QueryField[];
    /** The list the fields are on, which the builder parses and compiles against; `vars` for a run's answers alone. */
    register: string;
    hint?: string | undefined;
    /** The clock a sentence's days are read against when it becomes rows; the tab's by default. */
    now?: () => number;
    onchange: (next: string | Predicate | null) => void;
  } = $props();

  /** A day relative to today, which a sentence keeps and a tree would freeze. `flow-lint.ts` `RELATIVE_DAY`. */
  const RELATIVE_DAY = /\b(?:today|yesterday|tomorrow)\b|[+-]\d+[dwmy]\b|\b(?:ago|from now)\b/iu;

  const isTree = (v: unknown): v is Predicate => v !== null && typeof v === 'object' && !Array.isArray(v);
  const text = $derived(typeof value === 'string' ? value : '');
  const tree = $derived(isTree(value) ? value : undefined);

  /* WHICH FORM IS ON THE SCREEN. Words for a stored sentence and wherever there are no fields; rows otherwise. Chosen
     again whenever the value changes kind from outside (another card opened), and by the two buttons in between. */
  let asked = $state<'rows' | 'words' | null>(null);
  /* NOT STATE: it only remembers what the effect last saw, and reading it must not make the effect run again. */
  let was = '';
  $effect(() => {
    const kind = typeof value === 'string' && value.trim() !== '' ? 'sentence' : isTree(value) ? 'tree' : 'none';
    if (kind !== was) {
      was = kind;
      if (kind !== 'none') asked = null;
    }
  });
  const mode = $derived<'rows' | 'words'>(
    fields.length === 0 && tree === undefined ? 'words' : (asked ?? (text.trim() !== '' ? 'words' : 'rows')),
  );

  let fix = $state<string | null>(null);

  /** The sentence as rows, filed as the tree they are. Refused where it names a relative day, or the record cannot read it. */
  function toRows() {
    fix = null;
    if (text.trim() === '') {
      asked = 'rows';
      return;
    }
    if (RELATIVE_DAY.test(text)) {
      fix = words.inspect.relativeDay;
      return;
    }
    const read = readSentence(text, register, fields, now());
    if (!read.ok) {
      fix = read.fix === '' ? words.inspect.notRows : read.fix;
      return;
    }
    asked = 'rows';
    onchange(toWhere(read.root, register, fields) ?? null);
  }

  /** The rows as their sentence, where they have one; an empty box where they do not, which files nothing until typed. */
  function toWords() {
    fix = null;
    const root = tree === undefined ? null : fromWhere(tree, fields);
    const said = root === null ? null : sentenceOf(root, fields);
    asked = 'words';
    onchange(said === null || said === '' ? null : said);
  }
</script>

<div class="cond">
  {#if mode === 'words'}
    <div class="field">
      <input
        {id}
        class="field-input"
        aria-labelledby={labelledby}
        value={text}
        placeholder={hint}
        spellcheck="false"
        oninput={(e) => onchange(e.currentTarget.value === '' ? null : e.currentTarget.value)}
      />
    </div>
    {#if tree !== undefined && text === ''}<p class="help">{sayCondition(tree)}</p>{/if}
    {#if fields.length > 0}
      <div class="swap"><Button weight="quiet" onclick={toRows}>{words.inspect.asRows}</Button></div>
    {/if}
  {:else}
    <div {id} role="group" aria-labelledby={labelledby}>
      <QueryBuilder value={tree} {fields} {register} onchange={(next) => onchange(next ?? null)} />
    </div>
    <div class="swap"><Button weight="quiet" onclick={toWords}>{words.inspect.asWords}</Button></div>
  {/if}
  {#if fix !== null}<p class="help">{fix}</p>{/if}
</div>

<style>
  .cond {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .help {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .swap {
    display: flex;
    justify-content: flex-start;
  }
</style>
