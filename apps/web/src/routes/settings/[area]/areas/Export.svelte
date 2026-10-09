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
  import Section from '$lib/ui/Section.svelte';
  import Button from '$lib/ui/Button.svelte';
  import { settingsState, type AreaProps } from '../settings-state.svelte.ts';
  import StateRow from './StateRow.svelte';

  let { shell }: AreaProps = $props();

  /* THE OWNER QUESTION IS SHARED with every area that has an owner's control (`settings-state.svelte.ts`). */
  const s = settingsState(() => shell);
  const anOwner = $derived(s.anOwner);
  const SLUG = $derived(shell.index.slug);

  /* ── the record as a file, where there is a record to take it from ── */
  let exporting = $state<ExportKind | null>(null);

  /**
   * WHEN THE RECORD WAS LAST TAKEN AWAY, from `boot`'s `copies` (LCH-C03): "Last exported: 3 days ago" or "Never
   * exported". The layout's `boot`, so arriving asks nothing; a host older than the field draws no line.
   */
  let facts = $state<CopyFacts | null>(null);
  const lastExport = $derived(facts ? exportLine(facts, Date.now()) : null);
  $effect(() => {
    untrack(() => void readBoot(apiBase()).then((b) => (facts = b.from === 'live' ? copiesOf(b.boot) : null)));
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
    checkLine: 'Checked in this browser against its own manifest and signature. The file is sent nowhere.',
    checkGo: 'Check a file',
    wayTitle: 'The way you work',
    wayLine: (things: string) => `How ${things} are set up, with your pages, figures and rules, and nothing you wrote in them.`,
    rowsTitle: 'What you wrote',
    rowsLine: (things: string) => `Everything you have written in ${things}, without the pages around it.`,
    setupTitle: 'A setup somebody else can install',
    setupLine: 'Published as an add-on, with what you wrote left out.',
    notHereYet: 'Not on this host yet',
    /** What the record keeps, when it keeps nothing it can name yet. */
    yourThings: 'your things',
    /** The rest past the names said, "and 4 more". */
    more: (n: number) => `${n} more`,
  };

  /**
   * WHAT THIS RECORD KEEPS, IN ITS OWN NAMES: "Tasks, Clients and Invoices", or the first three and how many more. The
   * two slices name the person's own things rather than the system's word for them (DIRECTION §35).
   */
  const NAMED_MOST = 3;
  const things = $derived.by(() => {
    const names = shell.lists.map((l) => l.name.trim()).filter((n) => n !== '');
    if (names.length === 0) return words.yourThings;
    const said = names.length > NAMED_MOST ? [...names.slice(0, NAMED_MOST), words.more(names.length - NAMED_MOST)] : names;
    return new Intl.ListFormat('en-GB', { type: 'conjunction' }).format(said);
  });
</script>

<!-- THE ONE ACTION EACH ROW OFFERS, declared here so a row whose action is the owner's is handed
     none at all for a colleague, rather than an empty slot at the end of the row. -->
{#snippet exportWhole()}
  <Button disabled={exporting !== null} aria-busy={exporting === 'record'} onclick={() => takeCopy('record')}>{copy.export}</Button>
{/snippet}
{#snippet exportPack()}
  <Button disabled={exporting !== null} aria-busy={exporting === 'pack'} onclick={() => takeCopy('pack')}>{copy.exportPack}</Button>
{/snippet}
{#snippet exportRows()}
  <Button disabled={exporting !== null} aria-busy={exporting === 'rows'} onclick={() => takeCopy('rows')}>{copy.exportRows}</Button>
{/snippet}
{#snippet checkOne()}
  <Button disabled={checking} aria-busy={checking} onclick={() => checkInput?.click()}>{words.checkGo}</Button>
{/snippet}
{#snippet shareOne()}
  <Button href="/packs/share">{copy.shareSetup}</Button>
{/snippet}

<Section title={copy.yourData}>
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
  {#if lastExport}<p class="last-export">{lastExport}</p>{/if}
  <p class="hint">{copy.exportWhat}</p>
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
</Section>

<!-- AND THE SLICE, WHICH IS A DIFFERENT FILE FOR A DIFFERENT JOB.

     `03 §1`: the three layers are addressable independently, and that is what makes the useful
     operations cheap: "export data without origin (a clean handover), export origin without
     data (an audit), export governance alone (share a way of working: THAT IS A PACK)."

     The screen offered one button for the whole record and nothing for the other three, so the
     only exit this product appeared to have was all-or-nothing. A pack is the readable-text
     half: your lists, pages, metrics and rules without a single row of your business in it. -->
<Section title={copy.takeAway}>
  <p class="hint">{copy.takeAwayWhat}</p>
  <!-- THE SAME LADDER AS THE WHOLE COPY ABOVE: a slice of the record is still the record, so a
       colleague is shown both rows and handed neither button. `Share this setup` stays for everybody,
       because it is a link to a screen that explains itself. -->
  <StateRow icon="skill" title={words.wayTitle} line={words.wayLine(things)} action={anOwner ? exportPack : undefined} />
  <StateRow icon="rows" title={words.rowsTitle} line={words.rowsLine(things)} action={anOwner ? exportRows : undefined} />
  <!-- THE ARRANGEMENT, NOT WHAT IS WRITTEN IN IT: a use case somebody else can install. -->
  <StateRow icon="packs" title={words.setupTitle} line={words.setupLine} action={shareOne} />
</Section>
<!--
  THE KEY THAT MAKES A YEAR-OLD BACKUP CHECKABLE, and this screen is where four documents put
  it. `53 §4`: *"the public half in Settings > export and at the well-known URL 03 §4 names"*.
  `53 §5.4` step 3 has the operator paste it into
  `braindog verify latest.brainl --key <the record's public key, Settings > export>`, and
  `48 §5.6` says the answer without it reads **`unpinned`**: the file's own key proves
  integrity, and origin is `--key`'s job.

  THE ONE KEY THAT BELONGS ON A SCREEN. This product's first promise is that the record indexes
  what a key opens and never the key, and that rule is about SECRETS; the whole mechanism here
  is publication.

  AND THE ONLY KEY THIS BLOCK EVER DREW WAS THE SAMPLE'S. `SIGNING_KEY` sat in `data.ts` with the
  rest of the synthetic record: no keypair ever produced it, and its two halves were made to
  agree, so `key_id` really was `sha256(raw)[0:16]` of the value beside it. It was drawn where
  `shell.live` was false, the public demo, and there is no demo now, so the arm
  went with it: a shell with no record is not handed an invented key either.

  SO EVERY SHELL IS TOLD THE SAME TRUE THING. Its exports and its backups are signed, and this
  screen has nowhere to get the public half from: `boot` does not carry it, and `03 §4`'s
  well-known URL is served by none of the three apps. The value, a copy button and advice on
  verifying come back together, the day there is a real key to stand beside them.
-->
<Section title={copy.theSignature}>
  <StateRow icon="key" title={words.notHereYet} line={copy.theSignatureNotHere} />
</Section>

<style>
  /* WHEN IT WAS LAST TAKEN, the first line in the tile, at body size. */
  .last-export {
    margin: 0 0 var(--sp-2);
    color: var(--ink);
    font-size: var(--t-row);
    line-height: var(--lh-body);
  }

  .file-pick {
    display: none;
  }

  .hint.checked {
    margin-block-start: var(--sp-3);
    color: var(--ink2);
  }

  .hint.checked .glyph {
    margin-inline-end: var(--sp-1);
  }

  .hint {
    margin: 0 0 var(--sp-3);
    max-inline-size: var(--measure);
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }
</style>
