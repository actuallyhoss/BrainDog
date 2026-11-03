<!--
  Settings > Export: the record as a file, a slice of it, checking a file, and the signature.
-->
<script lang="ts">
  import { apiBase } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { words as levelWords } from '../../levels.ts';
  import { exportFile, type ExportKind } from '$lib/record/settings-write.ts';
  import { readBoot, rereadBoot } from '$lib/record/boot-live.ts';
  import { untrack } from 'svelte';
  import { copiesOf, exportLine, type CopyFacts } from './copies.ts';
  import { checkBrainl } from '@braindog/kernel';
  import { TONES } from 'braindog-render';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';
  import Tile from '$lib/ui/Tile.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { settingsState, type AreaProps } from '../settings-state.svelte.ts';
  import StateRow from './StateRow.svelte';
  import { biggestNames } from './export-names.ts';

  let { shell }: AreaProps = $props();

  /* THE OWNER QUESTION IS SHARED with every area that has an owner's control (`settings-state.svelte.ts`). */
  const s = settingsState(() => shell);
  const anOwner = $derived(s.anOwner);
  const SLUG = $derived(shell.index.slug);

  /* ── the record as a file, where there is a record to take it from ── */
  let exporting = $state<ExportKind | null>(null);

  /**
   * WHEN THE RECORD WAS LAST TAKEN AWAY, from `boot`'s `copies`: "Last exported: 3 days ago" or "Never
   * exported". The layout's `boot`, so arriving asks nothing; a host older than the field draws no line.
   */
  let facts = $state<CopyFacts | null>(null);
  /* WHILE IT IS READ the tile waits out of sight (`settings.css` `data-hold`): the line landed at the tile's top and
     pushed its rows down. `boot` is kept for the tab, so this is a moment. */
  let factsRead = $state(false);
  const lastExport = $derived(facts ? exportLine(facts, Date.now()) : null);
  $effect(() => {
    untrack(
      () =>
        void readBoot(apiBase())
          .then((b) => (facts = b.from === 'live' ? copiesOf(b.boot) : null))
          .catch(() => undefined)
          .finally(() => (factsRead = true)),
    );
  });

  /** A record hands the browser a `.brainl` file, and a host that refuses says why in its own words. */
  async function takeCopy(kind: ExportKind) {
    if (exporting) return;
    exporting = kind;
    const at = opened();
    const out = await exportFile(apiBase(), kind, SLUG);
    closed(true, at);
    exporting = null;
    if (!out.ok) {
      toasts.push(out.fix, { intent: 'warn' });
      return;
    }
    const url = URL.createObjectURL(new Blob([out.value.text], { type: 'application/x-ndjson' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = out.value.name;
    a.click();
    URL.revokeObjectURL(url);
    toasts.push(copy.exported(out.value.name), { intent: 'good' });
    /* AN EXPORT TAKEN IS THE LAST ONE, so the line reads it from the record's own `boot`. */
    void rereadBoot(apiBase()).then((b) => (facts = b.from === 'live' ? copiesOf(b.boot) : facts));
  }

  /* ── checking a file: the import's own check, run here, and nothing sent anywhere ── */
  let checkInput = $state<HTMLInputElement | null>(null);
  let checking = $state(false);
  let checkSaid = $state<{ tone: 'good' | 'bad'; text: string } | null>(null);

  async function checkFile(file: File | undefined) {
    if (!file || checking) return;
    checking = true;
    checkSaid = null;
    try {
      let text: string;
      try {
        text = await file.text();
      } catch {
        checkSaid = { tone: 'bad', text: copy.fileUnread(file.name) };
        return;
      }
      const out = await checkBrainl(text.split(/\r?\n/));
      checkSaid = out.ok ? { tone: 'good', text: copy.fileChecked(file.name) } : { tone: 'bad', text: copy.fileFailed(file.name, out.refusal.fix) };
    } finally {
      checking = false;
      /* The same file picked again is a new check, so the input forgets it. */
      if (checkInput) checkInput.value = '';
    }
  }

  /**
   * THE WORDS THIS AREA'S ROWS ADD. Each way out of the record is a row now, titled by what
   * leaves, with the one sentence that tells it apart and the button that takes it; the sentences the
   * area already had stay in `copy` and are read where they were.
   */
  const words = {
    oneFile: 'Everything, in one file',
    checkLine: 'Checked in this browser. Sent nowhere.',
    checkGo: 'Check a file',
    /* THE BUTTON SAYS THE ACT, THE ROW SAYS WHAT LEAVES (ui pass, 3 Nov): "The way you work" beside "Export the way you
       work" said the row's title twice; the full words stay the button's name for a screen reader. */
    download: 'Download',
    exportGo: 'Export',
    shareGo: 'Share',
    wayTitle: 'The way you work',
    wayLine: (things: string) => `How ${things} are set up, without their entries.`,
    rowsTitle: 'What you wrote',
    rowsLine: (things: string) => `Your entries in ${things}, without the pages.`,
    setupTitle: 'A starter for someone else',
    setupLine: 'A plugin without your entries.',
    /** What the record keeps, when it keeps nothing it can name yet. */
    yourThings: 'your things',
  };

  /**
   * WHAT THIS RECORD KEEPS, IN ITS OWN NAMES: the three lists that hold the most, then how many more. The two
   * slices name the person's own things rather than the system's word for them.
   */
  const things = $derived.by(() => {
    const said = biggestNames(shell.lists, shell.index.registers);
    if (said.length === 0) return words.yourThings;
    return new Intl.ListFormat('en-GB', { type: 'conjunction' }).format(said);
  });
</script>

<!-- THE ONE ACTION EACH ROW OFFERS, declared here so a row whose action is the owner's is handed
     none at all for a colleague, rather than an empty slot at the end of the row. -->
{#snippet exportWhole()}
  <Button weight="primary" disabled={exporting !== null} aria-busy={exporting === 'record'} onclick={() => takeCopy('record')}>{words.download}</Button>
{/snippet}
{#snippet exportPack()}
  <Button disabled={exporting !== null} aria-busy={exporting === 'pack'} aria-label={copy.exportPack} onclick={() => takeCopy('pack')}>{words.exportGo}</Button>
{/snippet}
{#snippet exportRows()}
  <Button disabled={exporting !== null} aria-busy={exporting === 'rows'} aria-label={copy.exportRows} onclick={() => takeCopy('rows')}>{words.exportGo}</Button>
{/snippet}
{#snippet checkOne()}
  <Button disabled={checking} aria-busy={checking} onclick={() => checkInput?.click()}>{words.checkGo}</Button>
{/snippet}
{#snippet shareOne()}
  <Button href="/plugins/share" aria-label={copy.shareSetup}>{words.shareGo}</Button>
{/snippet}

{#if !factsRead}<span data-hold hidden></span>{/if}
<!-- WHEN IT WAS LAST TAKEN, AT THE HEAD'S END (ui pass, 3 Nov): "Never exported" stood alone between the head and the
     first row. -->
<Tile icon="download" class="section" data-surface="tile" title={copy.yourData} meta={lastExport || undefined}>
  <div class="section-body">
    <!-- THE WHOLE CONTENT OF THIS SCREEN WAS TWO DEAD BUTTONS, on the page that carries the
         product's central promise: take your record and go. They say what they would do.

         AND ONE OF THEM DESCRIBED THE WRONG FILE. It read "written to a .dog file, LINE PER
         ROW", which welds together the two containers `03 §2.1` keeps in separate columns: a
         `.brain` is a SQLite database you open with `sqlite3` and no SDK, and a `.brainl` is
         the canonical logical dump (one JSON row per line) that the record streams out of a
         Durable Object in pages. Both are signed over the same manifest, which is why `verify`
         and `import` take either; they are not the same artefact and the sentence made the
         database sound like a text format.

         THE EXTENSIONS MOVED, AND THE REASON IS WORTH KEEPING. These two were `.dog` and
         `.dogl` until the record gave the name up: `.dog` is a PAGE's source now, one page to
         a file, which is what somebody means when they open the source of a page. The three
         layers are unchanged; only the name on the container moved. -->
    <!-- WHAT THE FILE IS, ONCE: the row under says it, so the line that repeated it over the row is gone (agents F27). -->
    <!--
      AND THE COPY IS THE OWNER'S TO TAKE, WHILE THE CHECK IS ANYBODY'S.

      `export` needs `owner`, so all four export buttons refused a colleague at the press. What
      does not need the record at all is `Check a file`: `checkBrainl` runs in this browser over
      a file the person already holds, sends nothing anywhere and asks the record nothing, so it
      stays exactly as it is for every reader. That split is the whole point of asking per
      control rather than per screen.
    -->
    {#if !anOwner}
      <p class="hint">{levelWords.ownersOnly}</p>
    {/if}
    <StateRow icon="download" title={words.oneFile} line={copy.exportWhat} action={anOwner ? exportWhole : undefined} />
    <!-- A REAL CHECK, IN THIS BROWSER. It said what it would do, on a record as on the sample; it runs the
         import's own `checkBrainl` now: the format line, every table against its manifest, then the signature. -->
    <StateRow icon="check" title={copy.verifyFile} line={words.checkLine} action={checkOne} />
    <input
      bind:this={checkInput}
      class="file-pick"
      type="file"
      accept=".brainl"
      tabindex="-1"
      aria-hidden="true"
      onchange={(e) => void checkFile(e.currentTarget.files?.[0])}
    />
    {#if checkSaid}
      <p class="hint checked" data-intent={checkSaid.tone} role="status">
        <span class="glyph" role="img" aria-label={TONES[checkSaid.tone].label}>{TONES[checkSaid.tone].glyph}</span>
        {checkSaid.text}
      </p>
    {/if}
  </div>
</Tile>

<!-- AND THE SLICE, WHICH IS A DIFFERENT FILE FOR A DIFFERENT JOB.

     `03 §1`: the three layers are addressable independently, and that is what makes the useful
     operations cheap: "export data without origin (a clean handover), export origin without
     data (an audit), export governance alone (share a way of working: THAT IS A PACK)."

     The screen offered one button for the whole record and nothing for the other three, so the
     only exit this product appeared to have was all-or-nothing. A pack is the readable-text
     half: your lists, pages, metrics and rules without a single row of your business in it. -->
<Tile icon="download" class="section" data-surface="tile" title={copy.takeAway}>
  <div class="section-body">
    <!-- THE SAME LADDER AS THE WHOLE COPY ABOVE: a slice of the record is still the record, so a
         colleague is shown both rows and handed neither button. `Share this setup` stays for everybody,
         because it is a link to a screen that explains itself. -->
    <StateRow icon="skill" title={words.wayTitle} line={words.wayLine(things)} action={anOwner ? exportPack : undefined} />
    <StateRow icon="rows" title={words.rowsTitle} line={words.rowsLine(things)} action={anOwner ? exportRows : undefined} />
    <!-- THE ARRANGEMENT, NOT WHAT IS WRITTEN IN IT: a use case somebody else can install. -->
    <StateRow icon="packs" title={words.setupTitle} line={words.setupLine} action={shareOne} />
  </div>
</Tile>

<style>
  .file-pick {
    display: none;
  }

  .hint.checked {
    margin-block-start: var(--sp-3);
    color: var(--ink-2);
  }

  .hint.checked .glyph {
    margin-inline-end: var(--sp-1);
  }

  .hint {
    margin: 0 0 var(--sp-3);
    max-inline-size: var(--measure);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }
</style>
