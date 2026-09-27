<!--
  Settings > Backups: the copies this record keeps, the key that opens them, and going back to one.
-->
<script lang="ts">
  import { apiBase } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  /* Lane F: backups and putting a copy back. */
  import { backUpNow, downloadSnapshot, readSnapshots, restoreSnapshot } from '$lib/record/settings-write.ts';
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
  import { settingsState, type AreaProps } from '../settings-state.svelte.ts';

  let { shell }: AreaProps = $props();

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
  /* A RECORD IS DRAWN ITS OWN COPIES OR NONE: a host that keeps none shows its sentence over an empty list. */
  const copyLines = $derived<CopyLine[]>(copiesFrom === 'live' ? liveCopies.map((c) => ({ ...c, rows: null, failed: null })) : []);
  /**
   * HOW MANY NIGHTS A HOST KEEPS, which the answer to `snapshots` does not say.
   *
   * IT WAS `SNAPSHOTS_KEPT` FROM `data.ts`, the sample's constant. The number is the hosts' own:
   * `apps/selfhost/src/snapshots.ts` and `apps/worker/src/snapshots.ts` each export `KEEP = 30`,
   * and neither is a package this app may import. So it is written once here, beside the one
   * sentence that says it, and it is the line to change the day either host keeps a different number.
   */
  const KEPT_NIGHTS = 30;

  /* A COPY IS NAMED BY ITS DAY, AND A DAY READS AS THE REST OF THE PRODUCT WRITES ONE: `3 Sep 2026`,
     not `2026-09-03` (DESIGN-SYSTEM APPENDIX C14). An id that is not a day is shown as it is. */
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

<!--
  `53 §5.4`: "Three mechanisms, one contract: nightly, sealed, thirty kept, restorable." And
  `03 §6` on why this is not the Export area: "A snapshot is not an export: it is a full copy
  ... disaster recovery, not portability."
-->
<!-- THE COUNT IS WHAT IS KEPT, and a night that kept nothing is not one. It read "What is kept
     · 4" over three copies and a row saying *nothing kept*, counting the failure as a backup,
     which is the same class of error as hiding it. -->
<Section title={copy.kept} count={copyLines.filter((s) => s.failed === null).length}>
  <!-- "The 30 newest are kept" IS A SENTENCE ABOUT A LIST THAT HAS SOME. On a record whose
       first backup has not run it describes a policy over nothing, above nothing. -->
  {#if copiesFrom === 'refused'}
    <p class="hint" role="status">{copiesSaid}</p>
  {:else if copyLines.length === 0}
    <Empty kind="no-data-yet" title={copy.noSnapshots} body={copy.noSnapshotsWhy} />
  {:else}
  <!-- THE POLICY IS THE HOST'S, and this sentence was Cloud's schedule and the self-host's
       retention at the same time. `53 §4`: Cloud keeps *"the 30 newest dated keys plus
       `latest`"* and runs at `17 3 * * *` UTC; `49 §5.13`: a self-host keeps 30 files and runs
       at 02:00 UTC plus `hash(slug) mod 60` minutes. It said "nightly, at 03:00. The 30 newest
       are kept" on both, which is right on neither. -->
  <p class="hint">{shell.host === 'cloud' ? copy.keptCloud(KEPT_NIGHTS) : copy.keptSelfHost(KEPT_NIGHTS)}</p>
  {/if}
  <ul class="ledger ledger-glyph">
    {#each copyLines as snap (snap.id)}
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
            <span class="means">{snap.failed ? copy.snapshotFailed : snap.rows === null ? copy.sizeOnDisk(bytes(snap.bytes)) : copy.rowsAndSize(snap.rows, bytes(snap.bytes))}</span>
          </span>
          <span class="line-when">
            {#if !snap.failed}
              <!-- `49 §5.13`: `GET /api/snapshots/:id` streams the file with
                   `Content-Disposition: attachment`. A self-host's only way back is putting a
                   copy back by hand, so the copy has to be reachable. Cloud's prefix is not
                   served to a browser, so there is nothing to offer. -->
              {#if copiesFrom === 'live'}
                <Button weight="bare" onclick={() => downloadCopy(snap.id)}>{copy.download}</Button>
                <Button weight="bare" onclick={() => (restoring = snap.id)}>{copy.restoreThis}</Button>
              {/if}
            {/if}
          </span>
        </div>
      </li>
    {/each}
  </ul>
  <!-- AND TAKING ONE IS THE OWNER'S. `snapshot` needs `owner`, and a `read` colleague was
       offered this button over a list already drawing the record's refusal: pressing it
       answered with three toasts at once, one of them about restoring, which was not pressed.
       The refusal above this is the record's own sentence, so nothing is said twice. -->
  <!-- AND ONLY WHERE THE RECORD ANSWERED WITH ITS COPIES. On the Worker `snapshots` answers
       `NOT_IN_THIS_BUILD`, and the button sat under that sentence and answered its press with
       the same refusal as a toast (`research-first-sign-in.md` friction 11). `reading` is not
       an answer either, or the button flashes before the refusal lands. -->
  {#if anOwner && copiesFrom === 'live'}
  <div class="row-actions">
    <Button weight="primary" disabled={backingUp} aria-busy={backingUp} onclick={backUp}>{copy.snapshotNow}</Button>
  </div>
  {/if}
</Section>

<!-- `49 §8`, and it asks for exactly this: the key "is what a self-hoster must back up
     SEPARATELY; Settings > backups says so in one line." A snapshot sealed with a key that
     is only inside the snapshot is a snapshot nobody can open. -->
<Section title={copy.theKey}>
  <!-- IT GAVE AN INSTRUCTION AND WITHHELD THE ONE THING NEEDED TO FOLLOW IT. This section had
       no button, no link and no value: "Back that key up somewhere else, or the copies cannot
       be opened" over an empty box. `12 §8` keeps the age identity outside the product on
       purpose, so the fix is not to print it here; it is to say where it already is. -->
  <p class="hint">{copy.theKeyIs}</p>
  <p class="hint">{copy.theKeyWhere}</p>
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
  {#if copiesFrom !== 'reading'}
    <p class="hint" role={copiesFrom === 'refused' ? 'status' : undefined}>
      {copiesFrom === 'refused' ? copy.restoreNotHere : copy.restoreLive}
    </p>
  {/if}
  {#if restoring}
    <div class="danger">
      <p class="danger-title">{copy.restoreConfirm(restoring)}</p>
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

  .danger {
    padding: var(--sp-4);
    background: var(--s1);
    border: 1px solid color-mix(in srgb, var(--danger) 40%, var(--line));
    border-radius: var(--r-md);
  }

  .danger-title {
    color: var(--danger);
    font-weight: 500;
  }

  .danger :global(.btn) {
    margin-block-start: var(--sp-3);
  }
</style>
