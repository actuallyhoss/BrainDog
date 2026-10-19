<!--
  "CHANGE THIS" ON ONE BLOCK: a line typed about the block, turned into an edit of the page's own source, drawn in place
  at once, and kept or undone. Opened from the block's menu (`BlockMenu.svelte`).

  THE RULES READ IT FIRST (`change-this.ts`): sort, filter, limit, a kind, a column. Only a line they cannot read goes to
  the model, through the page sheet's own Ask (`AskPage.svelte`), which has its own plan cap and files a draft rather
  than writing. So the model is never behind a change the rules could make.

  THE WRITE IS THE EDITOR'S: the stored block with a patch laid over it, the body set whole at the version read, and Undo
  is the body before. A BLOCK HE PINNED IS ASKED ABOUT FIRST: his pins always win, so nothing is changed behind one.
  Closing the sheet on a change not yet answered keeps it, with the same Undo in a toast.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { apiBase } from '../at.ts';
  import { copy } from '$lib/copy.ts';
  import { authoredOf, blockAt, changeWords, schemaOf, setBody, withPatch } from '$lib/record/page-write.ts';
  import type { LiveBlock } from '$lib/record/page-live.ts';
  import type { PageBody } from '$lib/record/pages-live.ts';
  import Button from '$lib/ui/Button.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import AskPage from './AskPage.svelte';
  import { askedOf, changeThisWords as words, pinnedIn, unchanged, type AskField } from './change-this.ts';

  let {
    open = $bindable(false),
    block,
    slug,
    name,
    kinds,
    kindNames,
    pinned,
    reread,
  }: {
    open?: boolean | undefined;
    block: LiveBlock & { key: string };
    slug: string;
    name: string;
    /** What the block may become (`kindsFor`). */
    kinds: readonly string[];
    kindNames: Readonly<Record<string, string>>;
    /** The keys he pinned on this page. */
    pinned: readonly string[];
    reread: () => Promise<void>;
  } = $props();

  type Phase = 'ask' | 'pinned' | 'preview' | 'model';
  let phase = $state<Phase>('ask');
  let text = $state('');
  let said = $state('');
  let fix = $state('');
  let busy = $state(false);
  /* THE PAGE BEFORE THE CHANGE AND THE VERSION THE CHANGE MADE, which Undo sets again. */
  let back: { body: PageBody; version: number | null } | null = null;

  const model = $derived(page.data.slash === true);

  async function run(confirmed: boolean) {
    const line = text.trim();
    if (busy || line === '') return;
    busy = true;
    fix = '';
    try {
      const base = apiBase();
      const read = await authoredOf(base, slug);
      if ('from' in read) return void (fix = read.fix);
      if (!read.mine) return void (fix = changeWords.notYours);
      const which = { key: block.key, kind: block.kind, source: block.source, heading: block.heading ?? name };
      const at = blockAt(read.body, which);
      if (at === null) return void (fix = copy.arrangeMoved);
      if (!confirmed && pinnedIn(block.key, pinned)) return void (phase = 'pinned');
      const stored = read.body.blocks[at]!;
      const register = block.register ?? null;
      const decl = register ? await schemaOf(base, register) : null;
      const labels = new Map(
        (Array.isArray(stored.columns) ? (stored.columns as { field?: unknown; label?: unknown }[]) : []).flatMap((c) =>
          typeof c.field === 'string' && typeof c.label === 'string' && c.label !== '' ? [[c.field, c.label] as const] : [],
        ),
      );
      const fields: AskField[] = (decl?.fields ?? []).map((f) => ({ id: f.id, type: f.type, values: f.values, label: labels.get(f.id) }));
      const got = askedOf({ text: line, block: stored, register, fields, kinds, kindNames, now: Date.now() });
      if (!got) {
        if (model) phase = 'model';
        else fix = words.cannot;
        return;
      }
      if (unchanged(stored, got.patch)) return void (fix = words.nothing);
      const body: PageBody = { ...read.body, blocks: read.body.blocks.map((b, i) => (i === at ? withPatch(b, got.patch, kinds) : b)) };
      const out = await setBody(base, body, undefined, read.version);
      if (out.from !== 'written') return void (fix = out.fix);
      back = { body: read.body, version: out.version };
      said = got.said;
      phase = 'preview';
      await reread();
    } finally {
      busy = false;
    }
  }

  async function undo() {
    if (!back || busy) return;
    busy = true;
    const was = back;
    back = null;
    try {
      const out = await setBody(apiBase(), was.body, undefined, was.version);
      if (out.from !== 'written') return void toasts.push(out.fix, { intent: 'warn' });
      await reread();
      toasts.push(words.undone);
    } finally {
      busy = false;
      open = false;
    }
  }

  function keep() {
    back = null;
    open = false;
  }

  /* EACH OPENING STARTS BLANK. */
  $effect(() => {
    if (!open) return;
    phase = 'ask';
    text = '';
    fix = '';
  });

  /* CLOSED WITH THE CHANGE STILL UNANSWERED KEEPS IT, and leaves the way back in a toast. */
  $effect(() => {
    if (open || !back) return;
    const was = back;
    back = null;
    toasts.push(said, {
      undo: () => {
        void setBody(apiBase(), was.body, undefined, was.version).then(reread);
      },
    });
  });
</script>

<Sheet bind:open title={words.title(name)}>
  <div class="ct">
    {#if phase === 'preview'}
      <p class="ct-said" role="status">{said}</p>
      <p class="ct-note">{words.preview}</p>
      <div class="ct-row">
        <Button weight="primary" onclick={keep}>{words.keep}</Button>
        <Button onclick={() => void undo()} disabled={busy}>{words.undo}</Button>
      </div>
    {:else if phase === 'pinned'}
      <p class="ct-said">{words.pinned}</p>
      <div class="ct-row">
        <Button weight="primary" onclick={() => void run(true)} disabled={busy}>{words.pinnedGo}</Button>
        <Button onclick={() => (open = false)}>{words.leave}</Button>
      </div>
    {:else if phase === 'model'}
      <!-- THE RULES COULD NOT READ IT, so the page sheet's own Ask drafts it, as it would have had it been typed there. -->
      <p class="ct-note">{words.asking}</p>
      <AskPage page={slug} {model} ask={text} onkept={reread} />
    {:else}
      <form
        class="ct-form"
        onsubmit={(e) => {
          e.preventDefault();
          void run(false);
        }}
      >
        <label class="ct-note" for="change-this-line">{words.hint}</label>
        <input id="change-this-line" class="ct-field" type="text" autocomplete="off" placeholder={words.field} bind:value={text} />
        {#if fix !== ''}<p class="ct-note" role="alert">{fix}</p>{/if}
        <div class="ct-row">
          <Button weight="primary" type="submit" disabled={busy || text.trim() === ''}>{words.go}</Button>
        </div>
      </form>
    {/if}
  </div>
</Sheet>

<style>
  .ct,
  .ct-form {
    display: grid;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .ct-said,
  .ct-note {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-ui);
  }

  .ct-said {
    color: var(--ink);
  }

  .ct-row {
    display: flex;
    gap: var(--sp-2);
    flex-wrap: wrap;
  }

  .ct-field {
    inline-size: 100%;
    padding: var(--sp-3);
    background: var(--s1);
    border: 1px solid transparent;
    border-radius: var(--r-md);
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--t-ui);
  }
</style>
