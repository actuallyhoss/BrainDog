<!--
  How a page is built: the text the record holds for it, in the `.dog` dialect, as a file somebody can keep, and as a
  text somebody can change and apply.

  THE STORED DECLARATION, NOT THE ANSWER DRAWN FROM IT. This printed the page as the record answered it, so a page drawn
  for each row of a list printed that row's page with every `{{field}}` filled in, and a key the dialect did not carry
  was lost on the way to the screen. It prints `dogText` of the body the record stores, read through `sourceOf`
  (`lib/dog/read.ts`), which is the same text `braindog page pull` writes: what is on the screen, in the file and in the
  record are one text.

  THE TEXT IS A TEXTAREA, AND ONLY THAT. 22 §8: "Ship the textarea. Load CodeMirror on demand. Never in the main
  bundle." An editor is a later, separate load; the box that ships reads and writes the same bytes.

  EVERY PAUSE DRAWS THE PAGE AS IT WILL BE. 400 ms after the last key the text is parsed and handed to the record's
  `previewPage`, which draws it as `page` would once installed and keeps nothing, beside the text on a wide screen and
  under it below 900px. Apply writes it whole through `setDeclaration` against the version it was read at, and a
  refusal is put beside the line it is about, with every typed character kept. Put back writes the body from before the
  last Apply, so a change that turned out wrong is one press from undone. The writes live in
  `lib/record/source-write.ts`.

  THE SOURCE IS A FILE, not a box to read. A format nobody can hold is a viewer: the file is named as the declaration's
  own first line names it, and it is the bytes the box holds now, typed changes included.

  AND A FILE COMES BACK. "Open a file" reads a `.dog` somebody kept, edited elsewhere or was sent into the box
  (`lib/dog/open.ts`). It writes nothing: the page is drawn from it, what differs from the record's text is listed under
  the box by the `diff` kind's drawer, and Apply is still the one write. A file that does not read as this page is
  refused in a sentence and the box is left as it was.

  AND A READER WHO MAY NOT APPLY PROPOSES. `setDeclaration` is the owner's, so for anybody else the primary button reads
  "Propose this change" and files the whole declaration as one change in Needs you (`lib/dog/propose.ts`). After the press
  it is a link to that question, reading "In Needs you", until the text is changed again; a refusal is the record's own
  sentence, said where Apply's would be.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { page } from '$app/state';
  import { createClient } from '@braindog/client';
  import { apiBase } from '../at.ts';
  import { read } from '$lib/data/read.svelte.ts';
  import { sourceOf } from '$lib/dog/read.ts';
  /* `Diff` is drawn here outside a declared page, so its kind's sheet comes with it (`kinds/diff.css`). */
  import '@braindog/skin/kinds/diff.css';
  import { Diff } from 'braindog-render/svelte';
  import { OPEN_ACCEPT, diffBlock, diffLines, openText, openWords } from '$lib/dog/open.ts';
  import { proposePage, proposeWords, type Call } from '$lib/dog/propose.ts';
  import { dogName, dogText, saveDog, type PageBody as Body } from '$lib/dog/source.ts';
  import { copy } from '$lib/copy.ts';
  import type { Opened } from '$lib/record/page-live.ts';
  import {
    checkSource,
    lineOf,
    sourceWords,
    sourceWriter,
    spanOf,
    templateList,
    type Applied,
    type Previewed,
    type SourceWriter,
  } from '$lib/record/source-write.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import ReadState from '$lib/ui/ReadState.svelte';
  import PageBody from './PageBody.svelte';
  import SourceHistory from './SourceHistory.svelte';
  import { historyWords, pageVersionsOf, partFile, type PageVersion } from './source-history.ts';
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

  /* ONE WRITER FOR THE VIEW, made on first use, so the lists a preview learns are learnt once while the text is open. */
  let writer: SourceWriter | null = null;
  const w = (): SourceWriter => (writer ??= sourceWriter(apiBase()));

  /** How long typing pauses before the page is drawn again: long enough not to draw every key, short enough to follow. */
  const PAUSE = 400;

  /* ── the text, and what the record holds ─────────────────────────────── */

  /** What the record holds now: the body, the version a write goes against, and that body printed. */
  type Held = { body: Body; version: number | null; text: string };

  let held = $state<Held | null>(null);
  let text = $state('');
  /** The body before the last Apply, which Put back writes. `null` when nothing has been applied here. */
  let before = $state<Body | null>(null);
  /** Why the text was not written, and the line it is about where it names one. */
  let fault = $state<{ fix: string; line: number | null } | null>(null);
  /** The write in flight, so a second press writes nothing and the pressed button says what it is doing. */
  let busy = $state<'apply' | 'back' | 'propose' | null>(null);
  /** The question a press filed, and the text it filed, so the link stands only while the box still says that. */
  let filed = $state<{ question: string; text: string } | null>(null);
  /** The versions the record keeps of this page, newest first, which History draws. None where the record lists none. */
  let versions = $state<PageVersion[]>([]);
  /** The version History is putting back now, which says so on its own button. */
  let backing = $state<number | null>(null);
  let box = $state<HTMLTextAreaElement>();

  /** The file input the button presses. A browser opens its file window only from an input. */
  let picker = $state<HTMLInputElement>();
  /** The file whose text is in the box, said until the text is typed over, applied or discarded. */
  let opened = $state<{ name: string; text: string } | null>(null);
  /** The file that was not opened, and why. The line is the file's own, which the box does not hold. */
  let unopened = $state<{ name: string; fix: string; line: number | null } | null>(null);

  /* A NEW READ STARTS THE TEXT AGAIN from what the record holds. Only a read does: an Apply or a Put back sets `held`
     itself, and neither must throw away what is in the box. */
  $effect(() => {
    const got = source.state === 'ready' ? source.value : null;
    if (!got) return;
    untrack(() => {
      const printed = dogText(got.body);
      held = { body: got.body, version: got.version, text: printed };
      text = printed;
      before = null;
      fault = null;
      opened = null;
      unopened = null;
      filed = null;
      void readVersions();
    });
  });

  /* THE HISTORY IS READ WITH THE TEXT AND AGAIN AFTER EVERY WRITE, since each Apply and each Put back is a new version.
     An answer for a page the view has since left is dropped. */
  async function readVersions() {
    const of = slug;
    const got = await pageVersionsOf(apiBase(), of);
    if (of === slug) versions = got;
  }

  const changed = $derived(held !== null && text !== held.text);
  /* WHO MAY APPLY: the owner, whom the shell says is one (`me.owner`, or `me.level` spelt out, as `ownsRecord` reads
     them). A tab with no shell to say asks the record, which refuses Apply in its own words, as it always has. */
  const me = $derived(page.data.me as { owner?: boolean; level?: string } | undefined);
  const mayApply = $derived(me === undefined || me.owner === true || me.level === 'owner');
  /** The question this text waits as on Decide, or `null` once the text says anything else. */
  const onDecide = $derived(filed !== null && filed.text === text ? filed.question : null);
  const list = $derived(held ? templateList(held.body) : null);
  /** The rows the box opens with: the whole text up to a screenful, so a short page is not a short box with a scrollbar. */
  const rows = $derived(Math.min(Math.max(text.split('\n').length + 1, 12), 40));
  const uid = $derived(`source-${slug}`);

  /** The file's name, from the page id the text opens with, or the address where it names none. */
  const fileOf = (body: Body): string => dogName(typeof body.page === 'string' ? body.page : slug);

  /** The bytes the box holds now, as a file somebody can keep, diff, send and edit. */
  function save() {
    const checked = checkSource(text);
    const file = fileOf(checked.ok ? checked.body : (held?.body ?? {}));
    saveDog(file, text);
    toasts.push(copy.exported(file), { intent: 'good' });
  }

  /* ── a file, opened into the box ─────────────────────────────────────── */

  /* THE BOX IS FILLED ONLY BY A FILE THAT READS AS THIS PAGE. A refused file changes nothing but the sentence under the
     buttons, so what was typed is still there. The input is emptied either way, or choosing the same file again after
     mending it would not be a change and nothing would happen. */
  async function open(e: Event & { currentTarget: HTMLInputElement }) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !held) return;
    const page = typeof held.body.page === 'string' ? held.body.page : undefined;
    const got = await openText(file, page);
    if (!got.ok) {
      opened = null;
      unopened = { name: got.name, fix: got.fix, line: got.line };
      return;
    }
    unopened = null;
    fault = null;
    text = got.text;
    opened = { name: got.name, text: got.text };
    box?.focus();
  }

  /* WHAT DIFFERS FROM THE RECORD'S TEXT, line by line, whether it was typed or opened. A text that differs only by the
     line break at its end differs in no line, and draws nothing. */
  const differs = $derived(held !== null && changed && diffLines(held.text, text).length > 0);
  const difference = $derived(held !== null && differs ? diffBlock(held.text, text) : null);

  /* ── the page as it will be ──────────────────────────────────────────── */

  let drawn = $state<Opened | null>(null);
  /** The preview's own refusal: the parser's while the text does not read, else the record's lint. */
  let said = $state<{ fix: string; line: number | null } | null>(null);
  /** The record cannot draw a body before it is installed (no `previewPage`, or no record behind the tab). */
  let none = $state(false);
  let drawing = $state(false);
  /** Each draw's turn, so an answer that lands after a newer question is dropped rather than drawn over it. */
  let asked = 0;

  $effect(() => {
    const now = text;
    if (!held) return;
    const timer = setTimeout(() => void draw(now), PAUSE);
    return () => clearTimeout(timer);
  });

  async function draw(typed: string) {
    const mine = ++asked;
    const checked = checkSource(typed);
    if (!checked.ok) {
      said = { fix: checked.fix, line: checked.line };
      drawing = false;
      return;
    }
    drawing = true;
    let out: Previewed;
    try {
      out = await w().preview(checked.body);
    } catch {
      out = { from: 'none' };
    }
    if (mine !== asked) return;
    drawing = false;
    if (out.from === 'live') {
      drawn = out.opened;
      said = null;
      none = false;
    } else if (out.from === 'refused') {
      said = { fix: out.fix, line: lineOf(typed, out.at) };
    } else {
      drawn = null;
      said = null;
      none = true;
    }
  }

  /* ── writing it ──────────────────────────────────────────────────────── */

  /** Say why, and select the line it is about, so the sentence and the words it is about are one glance. */
  function point(f: { fix: string; line: number | null }) {
    fault = f;
    if (f.line !== null) goTo(f.line);
  }

  function goTo(line: number) {
    if (!box) return;
    const { start, end } = spanOf(text, line);
    box.focus();
    box.setSelectionRange(start, end);
  }

  const unreached = (): Applied => ({ from: 'unreachable', fix: sourceWords.unreached });

  async function apply() {
    if (busy || !held) return;
    const checked = checkSource(text);
    if (!checked.ok) return point({ fix: checked.fix, line: checked.line });
    const was = held;
    const typed = text;
    busy = 'apply';
    const out = await w().apply(checked.body, was.version).catch(unreached);
    busy = null;
    if (out.from === 'written') {
      before = was.body;
      held = { body: checked.body, version: out.version, text: typed };
      fault = null;
      toasts.push(sourceWords.applied, { intent: 'good', undo: () => void putBack() });
      void readVersions();
      return;
    }
    point({ fix: out.fix, line: out.from === 'refused' ? lineOf(typed, out.at) : null });
  }

  /* PROPOSING WRITES NOTHING ON THE PAGE: it files the text, read as Apply reads it, as one question, against the version
     it was read at. The box keeps what was typed, so the reader sees what they sent beside the link to it. */
  async function propose() {
    if (busy || !held) return;
    const checked = checkSource(text);
    if (!checked.ok) return point({ fix: checked.fix, line: checked.line });
    const typed = text;
    const name = typeof checked.body.page === 'string' ? checked.body.page : slug;
    const call = createClient({ base: apiBase() }).call as unknown as Call;
    busy = 'propose';
    const out = await proposePage(call, { id: `page.${name}`, kind: 'page', body: checked.body }, undefined, held.version);
    busy = null;
    if (!out.ok) return point({ fix: out.fix, line: null });
    fault = null;
    filed = { question: out.question, text: typed };
  }

  /* PUT BACK IS A WRITE LIKE APPLY, against the version Apply made, so a page somebody changed again meanwhile is
     refused rather than written over. It puts the text back too: what is in the box is what the record holds. */
  async function putBack() {
    if (busy || !held || !before) return;
    const body = before;
    busy = 'back';
    const out = await w().apply(body, held.version).catch(unreached);
    busy = null;
    if (out.from === 'written') {
      const printed = dogText(body);
      held = { body, version: out.version, text: printed };
      text = printed;
      before = null;
      fault = null;
      toasts.push(sourceWords.putBackDone, { intent: 'good' });
      void readVersions();
      return;
    }
    point({ fix: out.fix, line: null });
  }

  /* PUT BACK TO A VERSION HISTORY NAMES is the same write, with that version's own text: a new version that says what
     the old one said, against the version the box was read at, so nothing in between is lost and a page changed
     meanwhile is refused. What it replaced becomes what the button above puts back. */
  async function putBackTo(version: number) {
    const picked = versions.find((v) => v.version === version);
    const body = picked?.body as Body | undefined;
    /* A VERSION THE RECORD CUT FOR THIS READER IS NEVER APPLIED: its body lacks the blocks over lists they may not open,
       and writing it would take those off the page for everybody. The History offers no Put back on it either. */
    if (busy || !held || !body || (picked?.cut ?? 0) > 0) return;
    const was = held;
    busy = 'back';
    backing = version;
    const out = await w().apply(body, was.version).catch(unreached);
    busy = null;
    backing = null;
    if (out.from === 'written') {
      const printed = dogText(body);
      before = was.body;
      held = { body, version: out.version, text: printed };
      text = printed;
      fault = null;
      toasts.push(sourceWords.putBackDone, { intent: 'good' });
      void readVersions();
      return;
    }
    point({ fix: out.fix, line: null });
  }

  /**
   * One version's text as a file, named as the declaration's own first line names it. A VERSION THE RECORD CUT FOR THIS
   * READER IS SAVED AS A PART (`money-part.dog`) and said as one: its body is less than the page.
   */
  function saveVersion(version: number) {
    const picked = versions.find((v) => v.version === version);
    const body = picked?.body as Body | undefined;
    if (!body) return;
    const part = (picked?.cut ?? 0) > 0;
    const file = part ? partFile(fileOf(body)) : fileOf(body);
    saveDog(file, dogText(body));
    toasts.push(part ? historyWords.savedPart(file) : copy.exported(file), { intent: 'good' });
  }

  function discard() {
    if (!held) return;
    text = held.text;
    fault = null;
    opened = null;
    unopened = null;
  }
</script>

<div class="source-view">
  {#if source.state === 'ready' && source.value && held}
    <!-- The file sits above its own text, so it reads as an action ON the source rather than as part of the page the
         source describes. -->
    <div class="source-file">
      <input type="file" accept={OPEN_ACCEPT} hidden tabindex="-1" bind:this={picker} onchange={open} />
      <Button weight="quiet" disabled={busy !== null} onclick={() => picker?.click()}>
        <Icon name="doc" size="s" />
        {openWords.open}
      </Button>
      <Button weight="quiet" onclick={save}>
        <Icon name="download" size="s" />
        {copy.pageSourceSave(fileOf(held.body))}
      </Button>
    </div>
    {#if unopened}
      <!-- WHY THE FILE WAS NOT OPENED, in the reader's own sentence, with the box untouched. -->
      <p class="source-unopened" role="alert">
        <strong>{openWords.refused(unopened.name)}</strong>
        {#if unopened.line !== null}<span>{openWords.lineOfFile(unopened.line)}</span>{/if}
        <span>{unopened.fix}</span>
      </p>
    {:else if opened && text === opened.text && changed}
      <p class="source-note" role="status">{openWords.opened(opened.name)}</p>
    {/if}
    {#if source.value.template || list}
      <!-- A PAGE DRAWN FOR EACH ROW OF A LIST IS ONE TEXT, and this is that text: a reader who changes it changes every
           page drawn from it, and is told so before they do. -->
      <p class="source-note">{words.fromTemplate}</p>
    {/if}
    <div class="source-work">
      <div class="source-edit">
        <label class="source-label" for="{uid}-text">{copy.declarationOf(title)}</label>
        <!-- No spellcheck and no capitals: the keys are words the record reads exactly as typed. `dir="ltr"` because the
             text is keys and punctuation whatever the language around it. -->
        <textarea
          id="{uid}-text"
          class="source"
          data-fault={fault ? '' : undefined}
          aria-invalid={fault !== null}
          aria-describedby={fault ? `${uid}-fault` : undefined}
          {rows}
          dir="ltr"
          spellcheck="false"
          autocapitalize="off"
          autocomplete="off"
          bind:value={text}
          bind:this={box}
        ></textarea>
        {#if fault}
          <p class="source-fault" id="{uid}-fault" role="alert">
            {#if fault.line !== null}
              {@const at = fault.line}
              <button type="button" class="source-line" aria-label={sourceWords.goToLine(at)} onclick={() => goTo(at)}>{sourceWords.line(at)}</button>
            {/if}
            <span>{fault.fix}</span>
          </p>
        {/if}
        <div class="source-actions">
          {#if before}
            <Button weight="quiet" disabled={busy !== null} onclick={() => void putBack()}>
              {busy === 'back' ? sourceWords.puttingBack : sourceWords.putBack}
            </Button>
          {/if}
          {#if changed}
            <Button weight="quiet" disabled={busy !== null} onclick={discard}>{sourceWords.discard}</Button>
          {/if}
          {#if mayApply}
            <Button weight="primary" disabled={busy !== null || !changed} onclick={() => void apply()}>
              {busy === 'apply' ? sourceWords.applying : list ? sourceWords.applyTemplate(list) : sourceWords.apply}
            </Button>
          {:else if onDecide}
            <!-- THE QUESTION IT FILED, one press away, and what waiting means said beside it. -->
            <span class="source-note" id="{uid}-filed">{proposeWords.onDecideNote}</span>
            <Button weight="primary" href="/decide/{encodeURIComponent(onDecide)}" aria-describedby="{uid}-filed">{proposeWords.onDecide}</Button>
          {:else}
            <Button weight="primary" disabled={busy !== null || !changed} onclick={() => void propose()}>
              {busy === 'propose' ? proposeWords.proposing : proposeWords.propose}
            </Button>
          {/if}
        </div>
        {#if difference}
          <!-- UNDER THE BOX AND ITS BUTTONS, QUIET: the lines taken out and put in against what the record holds, each
               with its mark and its word, the long shared runs folded. -->
          <section class="source-diff" aria-labelledby="{uid}-diff">
            <h2 class="source-label" id="{uid}-diff">{openWords.differs}</h2>
            <Diff block={difference} />
          </section>
        {/if}
      </div>

      <section class="source-preview" aria-labelledby="{uid}-preview" aria-busy={drawing}>
        <h2 class="source-preview-title" id="{uid}-preview">{sourceWords.preview}</h2>
        {#if said}
          <!-- The same refusal the box would meet on Apply, said here as it is typed, and the line it is about. -->
          <p class="source-said">
            {#if said.line !== null}
              {@const at = said.line}
              <button type="button" class="source-line" aria-label={sourceWords.goToLine(at)} onclick={() => goTo(at)}>{sourceWords.line(at)}</button>
            {/if}
            <span>{said.fix}</span>
          </p>
        {:else if none}
          <p class="source-said">{sourceWords.noPreview}</p>
        {/if}
        {#if drawn?.from === 'live' && !none}
          <!-- THE LAST PAGE THAT DREW stays while the text does not read, dimmed, so a half-typed line does not blank the
               page somebody is watching change. -->
          <div class="source-drawn" data-stale={said ? '' : undefined}>
            <PageBody mode="preview" page={drawn.page.page} blocks={drawn.page.blocks} now={drawn.now} writes={null} ids="{uid}-" level={3} />
          </div>
        {:else if !said && !none}
          <p class="source-said">{sourceWords.previewing}</p>
        {/if}
      </section>
    </div>
    <!-- UNDER THE TEXT AND ITS PAGE: every version the record keeps, each with Put back and Save as a file. It draws
         nothing where the record lists none. -->
    <SourceHistory {versions} busy={busy === 'back' ? backing : null} disabled={busy !== null} onputback={(n) => void putBackTo(n)} onsave={saveVersion} />
  {:else if source.state !== 'ready'}
    <ReadState state={source.state} refusal={source.refusal} onretry={() => void source.reread()} />
  {/if}
</div>

<style>
  /* THE PAGE'S OWN FRAME, as the blocks are drawn in: the same gutter and the same cap, so switching to the source does
     not move the page's edges. */
  .source-view {
    display: grid;
    gap: var(--sp-3);
    padding: var(--sp-3) var(--gutter) var(--sp-9);
    max-inline-size: var(--page-max);
  }

  .source-file {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .source-unopened {
    display: flex;
    flex-wrap: wrap;
    column-gap: var(--sp-2);
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--red);
    font-size: var(--fs-meta);
  }

  .source-note {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  /* THE TEXT AND THE PAGE IT MAKES SIDE BY SIDE on a wide screen, so a change and what it does are one glance; one
     column under 900px, the text first and the page under it. */
  .source-work {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--sp-3);
    align-items: start;
  }

  /* THE TEXT IS A TILE ON THE GROUND, as the page's blocks are, and its box the tile's second surface. */
  .source-edit {
    display: grid;
    gap: var(--sp-3);
    min-inline-size: 0;
    padding: calc(20px * var(--dense, 1));
    background: var(--tile);
    border-radius: var(--r-tile);
  }

  .source-label {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: 600;
  }

  /* THE TEXT WRAPS, AND NOTHING SCROLLS SIDEWAYS. A declaration's longest line drawn in a phone's 358px would otherwise
     be dragged sideways to be read. `anywhere`, because a long address or a sentence written as one JSON string has no
     space to break at. */
  .source {
    inline-size: 100%;
    min-inline-size: 0;
    margin: 0;
    padding: var(--sp-4);
    background-color: var(--tile-2);
    border: 1px solid transparent;
    border-radius: var(--r-pop);
    color: var(--ink);
    font-family: var(--font-mono);
    font-size: var(--fs-meta);
    line-height: 1.7;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    tab-size: 2;
    resize: vertical;
  }

  .source[data-fault] {
    border-color: var(--red);
  }

  .source-fault,
  .source-said {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: var(--sp-3);
    margin: 0;
    max-inline-size: var(--measure);
    font-size: var(--fs-meta);
  }

  .source-fault {
    color: var(--red);
  }

  .source-said {
    color: var(--ink-2);
  }

  /* THE LINE IS A BUTTON, which selects it in the box: the sentence says what, the button takes you where. */
  .source-line {
    min-block-size: var(--tap);
    padding: 0;
    background: none;
    border: 0;
    color: inherit;
    font: inherit;
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }

  .source-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    align-items: center;
    gap: var(--sp-3);
  }

  /* THE DIFFERENCE IS THE TEXT'S, so its lines are in the text's face and run the box's width, where the kind's own
     sheet sets prose at a reading measure. */
  .source-diff {
    display: grid;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .source-diff .source-label {
    margin: 0;
  }

  .source-diff :global(.diff-text) {
    max-inline-size: none;
    font-family: var(--font-mono);
  }

  .source-preview {
    display: grid;
    gap: var(--sp-4);
    min-inline-size: 0;
  }

  .source-preview-title {
    margin: 0;
    font-size: var(--fs-body);
    font-weight: 600;
  }

  /* A GRID ITEM SHRINKS ONLY TO ITS CONTENT unless told otherwise, and a wide table in the preview would push the column
     past the page's edge. */
  .source-drawn {
    min-inline-size: 0;
  }

  .source-drawn[data-stale] {
    opacity: 0.5;
  }

  @media (width < 900px) {
    .source-view {
      padding: var(--sp-3) var(--gutter) var(--sp-8);
    }

    .source-work {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  /* 16px TEXT IN A BOX UNDER A FINGER, or a phone zooms the page to read what is being typed. */
  @media (pointer: coarse) {
    .source {
      font-size: var(--fs-body);
    }
  }
</style>
