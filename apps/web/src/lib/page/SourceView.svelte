<!--
  How a page is built: the text the record holds for it, in the `.dog` dialect, as a file somebody can keep.

  THE STORED DECLARATION, NOT THE ANSWER DRAWN FROM IT. This printed the page as the record answered it, so a page drawn
  for each row of a list printed that row's page with every `{{field}}` filled in, and a key the dialect did not carry
  was lost on the way to the screen. It prints `dogText` of the body the record stores, read through `sourceOf`
  (`lib/dog/read.ts`), which is the same text `braindog page pull` writes: what is on the screen, in the file and in the
  record are one text (`loop/finish/pages.md` R2).

  READ ONLY. Changing the text and applying it is its own screen (PGS-11); this one shows it and hands it over.

  THE SOURCE IS A FILE, not a box to read. A format nobody can hold is a viewer: the file is named as the declaration's
  own first line names it, and it is the same bytes the text below shows.
-->
<script lang="ts">
  import { apiBase } from '../at.ts';
  import { read } from '$lib/data/read.svelte.ts';
  import { sourceOf } from '$lib/dog/read.ts';
  import { dogName, dogText, saveDog } from '$lib/dog/source.ts';
  import { copy } from '$lib/copy.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import ReadState from '$lib/ui/ReadState.svelte';
  import { words } from './words.ts';

  let {
    slug,
    title,
  }: {
    /** The page's address, which the stored text is read for. */
    slug: string;
    /** The page's title, which names the text for a screen reader. */
    title: string;
  } = $props();

  type Source = Exclude<Awaited<ReturnType<typeof sourceOf>>, { fix: string }>;

  /* ONE READ, AS EVERY SCREEN READS (`lib/data/read.svelte.ts`), so waiting, a refusal and a record that could not be
     reached look here as they look everywhere. The reader reads a refusal's code only to tell an unreached record
     (`UNREACHABLE`) apart, which it draws as "could not reach" with Retry and the transport's reason under Details.
     `sourceOf` carries the record's code beside its sentence, and passes it on as it came. An answer with no code is
     one the record never refused (a body this build cannot read as a page's source, or a read that met a change), so
     the code given is the registry's for a page this reader cannot have, which is what such a source is to it. */
  const codeOf = (got: { fix: string; code?: string }): string => got.code ?? 'PAGE_UNKNOWN';

  const source = read<Source>(
    () => slug,
    async () => {
      const got = await sourceOf(apiBase(), slug);
      return 'fix' in got ? { ok: false, refusal: { code: codeOf(got), fix: got.fix } } : { ok: true, value: got };
    },
  );

  /** The file's name, from the page id the stored text opens with, or the address where it names none. */
  const fileOf = (body: Source['body']): string => dogName(typeof body.page === 'string' ? body.page : slug);

  /** The same bytes the screen is showing, as a file somebody can keep, diff, send and edit. */
  function save(file: string, text: string) {
    saveDog(file, text);
    toasts.push(copy.exported(file), { intent: 'good' });
  }
</script>

<div class="source-view">
  {#if source.state === 'ready' && source.value}
    {@const text = dogText(source.value.body)}
    {@const file = fileOf(source.value.body)}
    <!-- The file sits above its own text, so it reads as an action ON the source rather than as part of the page the
         source describes. -->
    <div class="source-file">
      <Button weight="quiet" onclick={() => save(file, text)}>
        <Icon name="download" size="s" />
        {copy.pageSourceSave(file)}
      </Button>
    </div>
    {#if source.value.template}
      <!-- A PAGE DRAWN FOR EACH ROW OF A LIST IS ONE TEXT, and this is that text: a reader who changes it changes every
           page drawn from it, and is told so before they do. -->
      <p class="source-note">{words.fromTemplate}</p>
    {/if}
    <!-- `tabindex="0"`: it is a long block of text, and a box a keyboard cannot focus is a box a keyboard cannot read.
         Named, so tabbing into it says what it is. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <pre class="source" tabindex="0" aria-label={copy.declarationOf(title)}><code>{text}</code></pre>
  {:else if source.state !== 'ready'}
    <ReadState state={source.state} refusal={source.refusal} onretry={() => void source.reread()} />
  {/if}
</div>

<style>
  /* THE PAGE'S OWN FRAME, as the blocks are drawn in: the same gutter and the same cap, so switching to the source does
     not move the page's edges. */
  .source-view {
    display: grid;
    gap: var(--sp-7) var(--sp-6);
    padding: var(--sp-5) var(--gutter) var(--sp-9);
    max-inline-size: var(--page-max);
  }

  .source-file {
    display: flex;
    justify-content: flex-end;
    min-inline-size: 0;
  }

  .source-note {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  /* THE TEXT WRAPS, AND NOTHING SCROLLS SIDEWAYS. It was a scrolling box, and a declaration's longest line drawn in a
     phone's 358px was dragged sideways to be read, line by line, with lines cut mid-word. `anywhere`, because a long
     address or a sentence written as one JSON string has no space to break at. */
  .source {
    min-inline-size: 0;
    margin: 0;
    padding: var(--sp-4);
    background: var(--s1);
    border-radius: var(--r-md);
    color: var(--ink2);
    font-family: var(--font-id);
    font-size: var(--t-sm);
    line-height: 1.7;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  @media (width < 900px) {
    .source-view {
      padding: var(--sp-4) var(--gutter) var(--sp-8);
    }
  }
</style>
