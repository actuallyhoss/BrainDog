<!--
  Settings > Backups: the copies this record keeps, the key that opens them, and going back to one.
-->
<script lang="ts">
  import { apiBase } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  /* Lane F: backups and putting a copy back. */
  import { backUpNow, downloadSnapshot, readSnapshots, restoreSnapshot } from '$lib/record/settings-write.ts';
  import { readBoot, rereadBoot } from '$lib/record/boot-live.ts';
  import { copiesOf, copyLine, drillLine, readDrill, type CopyFacts, type DrillFacts } from './copies.ts';
  import type { Snapshot as KeptCopy } from '@braindog/client';
  /* Bytes as a person reads them: `braindog-render`'s, and it is imported rather than written here
     because it was written here, as `(bytes / 1e6).toFixed(1)`, and printed **"0.2 MB"** for all four
     snapshots of a ninety-three-row record. Four distinct copies, four identical strings, on the one
     screen whose entire job is to say which copy is which. */
  import { TONES, bytes, relative } from 'braindog-render';
  import { untrack } from 'svelte';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import Waffle from '$lib/viz/Waffle.svelte';
  import { nightParts, nightsLine, nightsOf, nightsSaid, nightWords, tileWords } from '../../billing.ts';
  import { settingsState, type AreaProps } from '../settings-state.svelte.ts';
  import StateRow from './StateRow.svelte';

  let { shell }: AreaProps = $props();

  /**
   * THE TITLES OF THIS AREA'S ROWS. What a host does not do was three paragraphs, identical on
   * both hosts; each is a row now, titled by the state it is in, and the paragraph's one sentence that
   * matters is the row's line. The sentences stay in `copy`.
   */
  const words = {
    notHereYet: 'Not on this host yet',
    keyOutside: 'Kept outside BrainDog',
    askForIt: 'Asked for, not pressed',
  };

  /* THE OWNER QUESTION IS SHARED with every area that has an owner's control (`settings-state.svelte.ts`).
     `shared` and not the `s` the other areas use, because `s` is each copy in the Kept count below. */
  const shared = settingsState(() => shell);
  const anOwner = $derived(shared.anOwner);

  /**
   * Where the backups list came from. `refused` is a host that keeps no copies, or no record at all, and its sentence
   * is drawn instead. There was a `sample` state here too, which drew thirty nights nobody backed up.
   */
  let copiesFrom = $state<'reading' | 'live' | 'refused'>('reading');
  let copiesSaid = $state('');
  let liveCopies = $state<KeptCopy[]>([]);
  let backingUp = $state(false);
  /* THE COPY WAITING ON A CONFIRM, and nothing is put back until it is pressed a second time. Leaving
     the area unmounts this component, so a confirm left open does not wait for the next visit. */
  let restoring = $state<string | null>(null);
  let restoreBusy = $state(false);

  type CopyLine = { id: string; at: string; bytes: number; rows: number | null; failed: string | null };
  /* A RECORD IS DRAWN ITS OWN COPIES OR NONE: a host that keeps none shows its sentence over an empty list. NEWEST
     FIRST, whatever order the host answered in, so the months below read down from this one. Instants the host wrote
     compare as text. */
  const copyLines = $derived<CopyLine[]>(
    copiesFrom === 'live'
      ? liveCopies.map((c) => ({ ...c, rows: null, failed: null })).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
      : [],
  );
  /**
   * HOW MANY NIGHTS A HOST KEEPS, which the answer to `snapshots` does not say.
   *
   * IT WAS `SNAPSHOTS_KEPT` FROM `data.ts`, the sample's constant. The number is the hosts' own:
   * `apps/selfhost/src/snapshots.ts` and `apps/worker/src/snapshots.ts` each export `KEEP = 30`,
   * and neither is a package this app may import. So it is written once here, beside the one
   * sentence that says it, and it is the line to change the day either host keeps a different number.
   */
  const KEPT_NIGHTS = 30;

  /**
   * THE LAST THIRTY NIGHTS, ONE SQUARE EACH, from the copies the record answered with and nothing
   * else. `null` until it answered with at least one: a strip of thirty quiet squares over a record that has never
   * been copied would be a chart of nothing, and the list below already says there is no backup yet.
   *
   * A NIGHT IS MISSED ONLY AFTER THE FIRST COPY KEPT (`nightsOf` says why), so a record made last week is shown the
   * nights it has had, not three weeks of failures from before it existed.
   */
  const nights = $derived(copyLines.length > 0 ? nightsOf(copyLines, Date.now(), KEPT_NIGHTS) : null);

  /** The copies by the month they were taken in, newest first: one group on the ground each. */
  const MONTH_NAME = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const months = $derived.by(() => {
    const out: { key: string; label: string; lines: CopyLine[] }[] = [];
    for (const line of copyLines) {
      const ms = Date.parse(line.at);
      const key = Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 7) : '';
      const last = out[out.length - 1];
      if (last && last.key === key) last.lines.push(line);
      else out.push({ key, label: Number.isFinite(ms) ? MONTH_NAME.format(ms) : copy.kept, lines: [line] });
    }
    return out;
  });

  /* A COPY IS NAMED BY ITS DAY, AND A DAY READS AS THE REST OF THE PRODUCT WRITES ONE: `3 Sep 2026`,
     not `2026-09-03`. An id that is not a day is shown as it is. */
  const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const copyDay = (id: string): string => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(id);
    return m ? `${Number(m[3])} ${SHORT_MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}` : id;
  };

  /* READ ON ARRIVING AT THE AREA. `untrack` for the reason the Ingest area gives: `opened()` reads
     and writes the same state, so an effect that called it tracked would loop. */
  $effect(() => {
    untrack(() => void readCopies());
  });

  /**
   * THE NIGHT'S COPY IN ONE LINE OVER THE LIST (LCH-C03), from `boot`'s `copies`: its age and size, "First copy
   * tonight" on a record with none yet, and past 26 hours the deeper red with the word Late, never the colour alone.
   * `boot` is the one the layout already asked, so arriving here asks nothing more; a host older than the field draws
   * no line.
   */
  let facts = $state<CopyFacts | null>(null);
  const lastCopy = $derived(facts ? copyLine(facts, Date.now()) : null);
  $effect(() => {
    untrack(() => void readBoot(apiBase()).then((b) => (facts = b.from === 'live' ? copiesOf(b.boot) : null)));
  });

  /**
   * THIS HOST'S LAST RESTORE TEST BESIDE IT (LCH-C04), from `GET /account/drill`: "passed 12 days ago", or "Never
   * tested" in the deeper red with the words, never the colour alone. The host's fact, so the same on every record. A
   * self-host has no such door and answers 404, and that draws no line, as does a host that could not be read. A host
   * whose `boot` says it is a self-host is not asked at all, so its console carries no 404 for a door it never had.
   */
  let drill = $state<DrillFacts | null>(null);
  const drillSaid = $derived(drill ? drillLine(drill, Date.now()) : null);
  $effect(() => {
    if (shell.host === 'self-host') return;
    untrack(() => void readDrill(fetch).then((d) => (drill = d)));
  });

  async function readCopies() {
    const at = opened();
    const out = await readSnapshots(apiBase());
    if (out.from === 'live') liveCopies = out.snapshots;
    copiesSaid = out.from === 'refused' ? out.fix : '';
    copiesFrom = out.from;
    closed(true, at);
  }

  async function backUp() {
    if (backingUp) return;
    backingUp = true;
    const at = opened();
    const out = await backUpNow(apiBase());
    closed(true, at);
    backingUp = false;
    if (out.ok) {
      toasts.push(copy.backedUp(out.value.id), { intent: 'good' });
      await readCopies();
      /* A COPY TAKEN BY HAND IS A COPY, so the line over the list reads it, from the record's own `boot`. */
      void rereadBoot(apiBase()).then((b) => (facts = b.from === 'live' ? copiesOf(b.boot) : facts));
    } else toasts.push(out.fix, { intent: 'warn' });
  }

  async function downloadCopy(id: string) {
    const at = opened();
    const out = await downloadSnapshot(apiBase(), id);
    closed(true, at);
    if (!out.ok) {
      toasts.push(out.fix, { intent: 'warn' });
      return;
    }
    const url = URL.createObjectURL(out.value.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = out.value.name;
    a.click();
    URL.revokeObjectURL(url);
    toasts.push(copy.exported(out.value.name), { intent: 'good' });
  }

  /** The confirmed copy put back. The record keeps what it held as a copy first, so this is undoable from the list. */
  async function restoreCopy() {
    if (!restoring || restoreBusy) return;
    restoreBusy = true;
    const at = opened();
    const out = await restoreSnapshot(apiBase(), restoring);
    closed(true, at);
    restoreBusy = false;
    if (out.ok) {
      restoring = null;
      toasts.push(copy.restoredTo(out.value.bookmark, out.value.kept ?? ''), { intent: 'good' });
      await readCopies();
    } else toasts.push(out.fix, { intent: 'warn' });
  }
</script>

<!-- WHERE THIS HOST KEEPS NO COPY A PERSON CAN REACH, THE ONE THING THEY CAN TAKE IS AN EXPORT, and it
     is the owner's, as the export itself is. -->
{#snippet exportInstead()}
  <Button href="/settings/export">{copy.export}</Button>
{/snippet}

<!--
  AND TAKING ONE IS THE OWNER'S. `snapshot` needs `owner`, and a `read` colleague was offered this button over a list
  already drawing the record's refusal: pressing it answered with three toasts at once, one of them about restoring,
  which was not pressed. The refusal is the record's own sentence, so nothing is said twice.

  AND ONLY WHERE THE RECORD ANSWERED WITH ITS COPIES. On the Worker `snapshots` answers `NOT_IN_THIS_BUILD`, and the
  button sat under that sentence and answered its press with the same refusal as a toast.
  `reading` is not an answer either, or the button flashes before the refusal lands.

  AT THE RIGHT OF THE FIRST GROUP'S HEADING, where a group's own verb goes, so it stays one press away
  whether the record has kept thirty copies or none.
-->
{#snippet lastCopyLine()}
  {#if lastCopy}
    <p class="last-copy" data-late={lastCopy.late ? '' : undefined}>
      {#if lastCopy.late}<span class="late-word">{copy.copiesLate}</span>{/if}
      <span>{lastCopy.text}</span>
    </p>
  {/if}
  {@render drillLineOf()}
{/snippet}

{#snippet drillLineOf()}
  {#if drillSaid}
    <p class="last-copy drill" data-late={drillSaid.fault ? '' : undefined}>
      {#if drillSaid.mark}<span class="late-word">{drillSaid.mark}</span>{/if}
      <span>{drillSaid.text}</span>
    </p>
  {/if}
{/snippet}

{#snippet backUpButton()}
  {#if anOwner && copiesFrom === 'live'}
    <Button weight="primary" disabled={backingUp} aria-busy={backingUp} onclick={backUp}>{copy.snapshotNow}</Button>
  {/if}
{/snippet}

<!--
  `53 §5.4`: "Three mechanisms, one contract: nightly, sealed, thirty kept, restorable." And
  `03 §6` on why this is not the Export area: "A snapshot is not an export: it is a full copy
  ... disaster recovery, not portability."
-->
<!--
  THE NIGHTLY COPIES AS A STRIP OF THIRTY: one square a night, oldest at the left, the newest copy in
  ink and a night with none in red where it fell, then one line saying what the strip means. The policy under it is the
  host's own: `53 §4` has the Cloud keep "the 30 newest dated keys plus `latest`" and run at `17 3 * * *` UTC, and
  `49 §5.13` a self-host keep 30 files and run at 02:00 UTC plus `hash(slug) mod 60` minutes, so no one time is printed.
-->
{#if nights && nights.length > 0}
  <Tile icon="archive" title={tileWords.copiesTitle} meta={tileWords.copiesMeta(KEPT_NIGHTS)}>
    <div class="strip">
      <Waffle parts={nightParts(nights)} columns={KEPT_NIGHTS} summary={nightsSaid(nights)} />
      <!-- THE STRIP'S TWO ENDS, so the squares read as dates. Secondary labels, dropped on a phone. -->
      <div class="strip-ends" aria-hidden="true">
        <span>{nightWords(nights[0]?.day ?? '')}</span>
        <span class="strip-now">{tileWords.stripTo}</span>
      </div>
    </div>
    <p class="reading">{nightsLine(nights)}</p>
    <p class="policy">{shell.host === 'cloud' ? copy.keptCloud(KEPT_NIGHTS) : copy.keptSelfHost(KEPT_NIGHTS)}</p>
  </Tile>
{/if}

<!-- THE COUNT IS WHAT IS KEPT, and a night that kept nothing is not one. It read "What is kept
     · 4" over three copies and a row saying *nothing kept*, counting the failure as a backup,
     which is the same class of error as hiding it. -->
{#if copiesFrom === 'refused'}
  <Section title={copy.kept}>
    <!-- NOT ON THIS HOST YET, AS A ROW, with the record's own sentence as its line and the one way
         out that does exist on every host, the export, as its action. NO LINE OVER IT: "First copy tonight" over a
         host that keeps no copies is a promise the next row takes back. -->
    <!-- THE RESTORE TEST IS THE HOST'S, and true whether or not this record's copies can be listed here. -->
    {@render drillLineOf()}
    <div role="status">
      <StateRow icon="archive" title={words.notHereYet} line={copiesSaid} action={anOwner ? exportInstead : undefined} />
    </div>
  </Section>
{:else if copiesFrom === 'reading'}
  <!-- NOTHING UNTIL THE RECORD ANSWERS: "No backup yet" drawn while the list is read is a sentence the answer may take
       straight back. -->
  <Section title={copy.kept}>{''}</Section>
{:else if copyLines.length === 0}
  <!-- "The 30 newest are kept" IS A SENTENCE ABOUT A LIST THAT HAS SOME. On a record whose
       first backup has not run it describes a policy over nothing, above nothing. -->
  <Section title={copy.kept} aside={backUpButton}>
    {@render lastCopyLine()}
    <Empty kind="no-data-yet" title={copy.noSnapshots} body={copy.noSnapshotsWhy} />
  </Section>
{:else}
  <!-- ONE GROUP ON THE GROUND PER MONTH, each counting what it kept, with the rows sitting straight on the ground. The
       newest month's heading carries Back up now, and only that one. -->
  {#snippet monthRows(lines: CopyLine[])}
    <ul class="ledger ledger-glyph">
      {#each lines as snap (snap.id)}
        <li data-intent={snap.failed ? 'bad' : undefined}>
          <div class="line">
            <span class="seq">
              {#if snap.failed}
                <span class="glyph" role="img" aria-label={TONES.bad.label}>{TONES.bad.glyph}</span>
              {:else}<Icon name="archive" size="s" />{/if}
            </span>
            <span class="line-main">
              <span class="line-title">{copyDay(snap.id)}</span>
              <!-- THE REASON BESIDE ITS DATE. It sat at the far end of the row, 900px from the night it
                   explains, where it read as a note about some other line. -->
              <span class="line-detail">{relative(snap.at, Date.now())}{#if snap.failed}{' · '}<span class="why-failed">{snap.failed}</span>{/if}</span>
            </span>
            <!-- A NIGHT THAT PRODUCED NOTHING SAYS SO, AND SAYS WHY. `12 §8`: "A backup that
                 silently gave up is worse than none", which is the argument for these two
                 routes existing, and the list drew four identical successes. `13 §6`: the
                 record's own `note` is rendered, not a sentence written here. -->
            <span class="line-amount">
              <span class="means">{snap.failed ? copy.snapshotFailed : snap.bytes === 0 ? copy.snapshotEmpty : snap.rows === null ? copy.sizeOnDisk(bytes(snap.bytes)) : copy.rowsAndSize(snap.rows, bytes(snap.bytes))}</span>
            </span>
            <span class="line-when">
              {#if !snap.failed}
                <!-- `49 §5.13`: `GET /api/snapshots/:id` streams the file with
                     `Content-Disposition: attachment`. A self-host's only way back is putting a
                     copy back by hand, so the copy has to be reachable. Cloud's prefix is not
                     served to a browser, so there is nothing to offer. -->
                {#if copiesFrom === 'live'}
                  <Button weight="bare" size="sm" onclick={() => downloadCopy(snap.id)}>{copy.download}</Button>
                  <Button weight="bare" size="sm" onclick={() => (restoring = snap.id)}>{copy.restoreThis}</Button>
                {/if}
              {/if}
            </span>
          </div>
        </li>
      {/each}
    </ul>
  {/snippet}
  {#each months as month, i (`${month.key}:${i}`)}
    {@const kept = month.lines.filter((line) => line.failed === null).length}
    {#if i === 0}
      <Section title={month.label} count={kept} aside={backUpButton}>{@render lastCopyLine()}{@render monthRows(month.lines)}</Section>
    {:else}
      <Section title={month.label} count={kept}>{@render monthRows(month.lines)}</Section>
    {/if}
  {/each}
{/if}

<!-- `49 §8`, and it asks for exactly this: the key "is what a self-hoster must back up
     SEPARATELY; Settings > backups says so in one line." A snapshot sealed with a key that
     is only inside the snapshot is a snapshot nobody can open. -->
<Section title={copy.theKey}>
  <!-- IT GAVE AN INSTRUCTION AND WITHHELD THE ONE THING NEEDED TO FOLLOW IT. This section had
       no button, no link and no value: "Back that key up somewhere else, or the copies cannot
       be opened" over an empty box. `12 §8` keeps the age identity outside the product on
       purpose, so the fix is not to print it here; it is to say where it already is. -->
  <!-- ONE ROW, AND THE HOST'S HALF OF THE ANSWER AS ITS LINE. The two sentences were two paragraphs on
       both hosts, and the second is only true on a self-host, where the key is a file its owner made. -->
  <StateRow icon="key" title={words.keyOutside} line={shell.host === 'cloud' ? copy.theKeyIs : copy.theKeyWhere} />
</Section>

<!--
  ONE COPY OF THIS PARAGRAPH. It was here twice, one copy indented and one not, which is the defect
  `deleteWhat` has its own comment about: three lines, two of them the same sentence. The copy kept
  is the one that carries the Cloud half.

  `03 §6`: "PITR is Cloud-only and this is DOCUMENTED, NOT HIDDEN." `33 §9`: a self-host "has no
  PITR and does not serve `restore`". So the fact is stated where somebody would go looking for
  the control, rather than the control being drawn and then refusing.

  AND ON CLOUD IT IS A CONTROL. `53 §5.5(a)` puts it here by name (*"The owner, Settings >
  backups > restore to a time: `POST /api/restore { at }`"*), and this area held the sentence
  and not the button, which is the one thing a person comes to a backups screen to do.

  AND ON A HOSTED RECORD THE BUTTON WAS AN APOLOGY. `apps/worker/src/index.ts` then passed the
  record no `snapshots` port, so `restore` answered `NOT_IN_THIS_BUILD` and the button's whole
  act was that refusal as a toast, under a sentence promising any point in thirty days, four
  lines below the Kept section drawing the same refusal instead of a list. It then followed the
  record's own answer and was drawn only for the sample, and with the sample gone it is not
  drawn at all: a restore is to one of the copies listed above, or it is asked for.
-->
<Section title={copy.restore}>
  <!-- THE RECORD'S OWN ANSWER, AND NOTHING UNTIL IT ARRIVES. There were four answers, and the
       two that were not the record's came from the sample's `DEPLOYMENT.kind`: which host the
       build thought it was on, drawn for as long as the read took and for the sample always. -->
  {#if copiesFrom === 'refused'}
    <StateRow icon="history" title={words.askForIt} line={copy.restoreNotHere} />
  {:else if copiesFrom === 'live'}
    <p class="hint">{copy.restoreLive}</p>
  {/if}
  {#if restoring}
    <!-- THE CONFIRM IS WORDS AND TWO VERBS ON THE GROUND: a destructive verb is its words in ink asking to
         be pressed again, never a red box. What it replaces is said in the sentence, which is the part to read. -->
    <div class="confirm" role="group" aria-label={copy.restoreThis}>
      <p class="confirm-said">{copy.restoreConfirm(restoring)}</p>
      <div class="row-actions">
        <Button tone="bad" disabled={restoreBusy} aria-busy={restoreBusy} onclick={restoreCopy}>{copy.restoreThis}</Button>
        <Button weight="bare" disabled={restoreBusy} onclick={() => (restoring = null)}>{copy.keepAsIs}</Button>
      </div>
    </div>
  {/if}
  <!-- AND NO "RESTORE TO A TIME". It was drawn only over the sample's copies on the Cloud
       build, because every record that answered, on either host, either listed its copies above
       or refused, and no host serves a restore to an instant: `apps/worker/src/copies.ts` goes
       back to a copy by the bookmark that copy recorded and leaves `getBookmarkForTime` out on
       purpose. Going back is `Restore this` on one of the copies listed above. -->
</Section>

<style>
  /* THE NIGHT'S COPY, the first line in the tile over the copies, at body size. */
  .last-copy {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin: 0 0 var(--sp-3);
    color: var(--ink);
    font-size: var(--t-row);
    line-height: var(--lh-body);
  }

  /* LATE IS A WORD AS WELL AS A COLOUR: the deeper red of late, and the word Late before the sentence. */
  .last-copy[data-late] {
    color: var(--danger-text);
  }

  .late-word {
    font-weight: 600;
  }

  /* A FAILED NIGHT'S REASON IS A SENTENCE, and beside the date on a phone it squeezed the date onto
     two lines. It takes its own line under the facts there instead. */
  @media (width < 640px) {
    li[data-intent='bad'] :global(.line-when) {
      grid-column: 2 / -1;
      grid-row: 3;
      justify-content: flex-start;
      text-align: start;
    }
  }

  .means {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  /* What failed is read, not skimmed past, so it takes the second ink rather than the date's dim. */
  .why-failed {
    color: var(--ink2);
  }

  .hint {
    margin: 0 0 var(--sp-3);
    max-inline-size: var(--measure);
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  /* WRAPPING, for the reason `/audit`'s segmented bar already wraps: two buttons that do not fit
     are two buttons off the edge. */
  .row-actions {
    flex-wrap: wrap;
    display: flex;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
  }

  /* THE CONFIRM, UNBOXED: a sentence at the row's weight and its two verbs under it, with a hairline above so it reads
     as the next step of the group rather than a note. */
  .confirm {
    padding-block-start: var(--sp-3);
    border-block-start: 1px solid var(--line);
  }

  .confirm-said {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink);
    font-size: var(--t-row);
    font-weight: 500;
    line-height: 20px;
  }

  /* THE STRIP HOLDS ITS SQUARES AT UP TO 16PX (`waffle.ts`), so it is no wider than thirty of them and the two dates
     under it sit at its two ends. */
  .strip {
    display: grid;
    gap: var(--sp-2);
    max-inline-size: calc(30 * 16px + 29 * 3px);
  }

  .strip-ends {
    display: flex;
    justify-content: space-between;
    gap: var(--sp-3);
    color: var(--dim);
    font-size: var(--t-xs);
    line-height: 16px;
    font-variant-numeric: tabular-nums;
  }

  .strip-now {
    color: var(--ink);
    font-weight: 500;
  }

  /* THE ONE WRITTEN LINE under the chart, and the host's policy under it in the quiet ink. */
  .reading {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink);
    font-size: var(--t-base);
    line-height: 20px;
  }

  .policy {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: 18px;
  }

  @media (width < 640px) {
    .strip-ends {
      display: none;
    }
  }
</style>
