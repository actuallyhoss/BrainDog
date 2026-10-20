<!--
  "MAKE A COMPONENT": a line about something to be drawn ("payroll as a calendar", "cash for the next 90 days as a
  line chart"), composed from BrainDog's own blocks (`compose.ts`) into one block of the page's declaration.

  THE RULES COMPOSE IT FIRST, and the block is handed back to arranging (`Arrange.svelte`), which draws it on the page
  as an unsaved draft with Keep, Put on shelf and Throw away. Nothing is written until Done, so a draft thrown away
  leaves no trace. Only a line the rules cannot read goes to the model, through the page sheet's own Ask
  (`AskPage.svelte`), which has its own plan cap and files a draft rather than writing.

  THE LISTS COME FROM WHAT THE RECORD DECLARES (`REGISTERS`), never from a name written here.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { REGISTERS } from '$lib/record/held.ts';
  import Button from '$lib/ui/Button.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import AskPage from './AskPage.svelte';
  import { composeOf, composeWords as words, type Composed, type ComposeList } from './compose.ts';

  let {
    open = $bindable(false),
    slug,
    current,
    start = '',
    ondraft,
    onmodel,
  }: {
    open?: boolean | undefined;
    slug: string;
    /** The list the page is about, for a line that names none. */
    current: string | null;
    /** A line to draw on opening, from Slash; empty opens blank. */
    start?: string | undefined;
    /** A composed block, to be drawn on the page as a draft. */
    ondraft: (composed: Composed) => void;
    /** The model's draft was kept, so the page behind reads itself again. */
    onmodel: () => void | Promise<void>;
  } = $props();

  let text = $state('');
  let fix = $state('');
  let phase = $state<'ask' | 'model'>('ask');
  const model = $derived(page.data.slash === true);

  const lists = $derived<ComposeList[]>(
    Object.values(REGISTERS).map((r) => ({
      id: r.id,
      name: r.name,
      one: r.one,
      title: r.title,
      fields: r.fields.map((f) => ({ id: f.id, type: f.type, label: f.label, values: f.values })),
    })),
  );

  function run() {
    const line = text.trim();
    if (line === '') return;
    fix = '';
    if (lists.length === 0) return void (fix = words.noLists);
    const got = composeOf({ text: line, lists, current, now: page.data.now ?? Date.now() });
    if (got) {
      ondraft(got);
      open = false;
    } else if (model) phase = 'model';
    else fix = words.cannot;
  }

  /* EACH OPENING STARTS BLANK. */
  $effect(() => {
    if (!open) return;
    text = start;
    fix = '';
    phase = 'ask';
    if (start.trim() !== '') queueMicrotask(run);
  });
</script>

<Sheet bind:open title={words.title}>
  <div class="mc">
    {#if phase === 'model'}
      <p class="mc-note">{words.asking}</p>
      <AskPage page={slug} {model} ask={`Add a block to this page: ${text}`} onkept={onmodel} />
    {:else}
      <form
        class="mc"
        onsubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <label class="mc-note" for="make-component-line">{words.hint}</label>
        <input id="make-component-line" class="mc-field" type="text" autocomplete="off" placeholder={words.field} bind:value={text} />
        {#if fix !== ''}<p class="mc-note" role="alert">{fix}</p>{/if}
        <div class="mc-row">
          <Button weight="primary" type="submit" disabled={text.trim() === ''}>{words.go}</Button>
        </div>
      </form>
    {/if}
  </div>
</Sheet>

<style>
  .mc {
    display: grid;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .mc-note {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
  }

  .mc-row {
    display: flex;
    gap: var(--sp-2);
    flex-wrap: wrap;
  }

  .mc-field {
    inline-size: 100%;
    padding: var(--sp-3);
    background: var(--tile-2);
    border: 1px solid transparent;
    border-radius: var(--r-pop);
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--fs-body);
  }
</style>
