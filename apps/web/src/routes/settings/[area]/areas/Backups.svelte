<!--
  Settings > Backups: the copies this record keeps, the key that opens them, and going back to one.
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  /* Lane F: backups and putting a copy back. */
  import { backUpNow, downloadSnapshot, readSnapshots, restoreSnapshot } from '$lib/record/settings-write.ts';
  import { readBoot, rereadBoot } from '$lib/record/boot-live.ts';
  import { copiesOf, copyLine, drillLine, exportLine, readDrill, readExports, type CopyFacts, type DrillFacts } from './copies.ts';
  import type { Cursor, Snapshot as KeptCopy } from '@braindog/client';
  /* Bytes as a person reads them: `braindog-render`'s, and it is imported rather than written here
     because it was written here, as `(bytes / 1e6).toFixed(1)`, and printed **"0.2 MB"** for all four
     snapshots of a ninety-three-row record. Four distinct copies, four identical strings, on the one
     screen whose entire job is to say which copy is which. */
  import { TONES, bytes, relative } from 'braindog-render';
  import { untrack } from 'svelte';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import Waffle from '$lib/viz/Waffle.svelte';
  import CodeLine from '$lib/ui/CodeLine.svelte';
  import { nightParts, nightsLine, nightsOf, nightsSaid, nightWords, tileWords } from '../../billing.ts';
  import { settingsState, type AreaProps } from '../settings-state.svelte.ts';
  import { aboutCopies, nightFailed, type Fault } from '../health.ts';
  import { createClient } from '@braindog/client';
  import StateRow from './StateRow.svelte';

  let { shell }: AreaProps = $props();

  /* THIS AREA'S OWN WORDS (ui pass, 3 Nov): the key's one line and the disclosure under it. */
  const backupWords = {
    keyLine: 'Keep a copy of the key file somewhere other than this machine.',
    how: 'Why and how',
  } as const;

  /**
   * THE TITLES OF THIS AREA'S ROWS. What a host does not do was three paragraphs, identical on
   * both hosts; each is a row now, titled by the state it is in, and the paragraph's one sentence that
   * matters is the row's line. The sentences stay in `copy`.
   */
  const words = {
    /* THE REWRITES OF THE UI PASS OF 20 OCTOBER (agents F27): what a person can do, not what a deployment lacks. */
    /* NEEDS YOU, AS THE BAR CALLS IT: the page said Decide, a name nothing else on screen uses. */
    missedLine: 'Tries again tonight.',
    answer: 'Answer it',
    /* THE NIGHT'S COPY AND HIS EXPORTS, AS ROWS: a host whose copies a browser cannot list
       still copies the record each night, and the exports he took are his backups too. "No backups here yet" stood
       over both. */
    nightly: 'Copied every night',
    nightlyLate: 'The nightly copy is late',
    noNightly: 'No nightly copies here yet',
    exports: 'Your exports',
    exportNow: 'Export now',
    everyExport: 'Every export in Activity',
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
  /* THE STRIP STARTS AT THE FIRST COPY (AI22): a BrainDog made minutes ago drew thirty filled squares from a month before
     it existed. The nights before it are not drawn; the line under the strip still says since when. */
  const strip = $derived(nights ? nights.slice(Math.max(0, nights.findIndex((x) => x.state !== 'before'))) : null);
  /* AND ITS RIGHT END IS THE NEWEST COPY'S REAL AGE, not "last night" under a copy taken a minute ago. */
  const newestAt = $derived(copyLines.find((c) => c.failed === null)?.at ?? null);

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
    return m ? `${Number(m[3])} ${SHORT_MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}` : copyName(id);
  };
  /* A SELF-HOST'S COPY IS NAMED BY ITS TIME AND WHO TOOK IT, IN LOCAL WORDS (AI23): `2026-10-31T00-38-42Z-now` is
     "Today 02:38, taken by you". The stamp in the name is UTC, so it is read as an instant and said where the person is. */
  const STAMP = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z-([a-z][a-z-]*?)(?:-\d+)?$/u;
  const dayOf = (d: Date): string => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  function copyName(id: string): string {
    const m = STAMP.exec(id);
    if (!m) return id;
    const when = new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}Z`);
    if (Number.isNaN(when.getTime())) return id;
    const now = new Date();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const time = `${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`;
    const day =
      dayOf(when) === dayOf(now)
        ? copy.copyToday
        : dayOf(when) === dayOf(yesterday)
          ? copy.copyYesterday
          : `${when.getDate()} ${SHORT_MONTHS[when.getMonth()]}${when.getFullYear() === now.getFullYear() ? '' : ` ${when.getFullYear()}`}`;
    const by = copy.copyBy[m[5] ?? ''];
    return by ? `${day} ${time}, ${by}` : `${day} ${time}`;
  }

  /* READ ON ARRIVING AT THE AREA. `untrack` for the reason the Ingest area gives: `opened()` reads
     and writes the same state, so an effect that called it tracked would loop. */
  $effect(() => {
    untrack(() => void readCopies());
  });

  /**
   * THE NIGHT'S COPY IN ONE LINE OVER THE LIST, from `boot`'s `copies`: its age and size, "First copy
   * tonight" on a record with none yet, and past 26 hours the deeper red with the word Late, never the colour alone.
   * `boot` is the one the layout already asked, so arriving here asks nothing more; a host older than the field draws
   * no line.
   */
  let facts = $state<CopyFacts | null>(null);
  const lastCopy = $derived(facts ? copyLine(facts, Date.now()) : null);
  /* NO COPY KEPT YET: "First copy tonight" is then the empty state's title, and not a line over "No backup yet". */
  const firstTonight = $derived(facts !== null && facts.last_copy_at === null);
  $effect(() => {
    untrack(() => void readBoot(apiBase()).then((b) => (facts = b.from === 'live' ? copiesOf(b.boot) : null)));
  });

  /**
   * THIS HOST'S LAST RESTORE TEST BESIDE IT, from `GET /account/drill`: "passed 12 days ago", or "Never
   * tested" in the deeper red with the words, never the colour alone. The host's fact, so the same on every record. A
   * self-host has no such door and answers 404, and that draws no line, as does a host that could not be read. A host
   * whose `boot` says it is a self-host is not asked at all, so its console carries no 404 for a door it never had.
   */
  let drill = $state<DrillFacts | null>(null);
  /* NO RESTORE TEST IS SAID BEFORE THERE IS A COPY: "Never tested" over a record with no copy yet read as a fault. */
  const drillSaid = $derived(drill && facts?.last_copy_at ? drillLine(drill, Date.now()) : null);
  $effect(() => {
    if (shell.host === 'self-host') return;
    untrack(() => void readDrill(fetch).then((d) => (drill = d)));
  });

  /**
   * A NIGHT THAT DID NOT RUN, AS THE RECORD ASKED ABOUT IT: the open question the record opened itself when a copy
   * failed ("The backup on 3 Sep did not run"). The Settings index leads with it, and this area said "No backups here
   * yet" under it, so the two read as a contradiction. It is said here first, with the one way to act on it. A record
   * that cannot be asked draws nothing.
   */
  let missed = $state<{ id: string; said: string } | null>(null);
  $effect(() => {
    untrack(() => void readMissed());
  });

  /**
   * A NIGHT THAT FAILED, AS THE RECORD KEEPS IT NOW: a fault, never a question (`kernel/src/copies.ts`), so the read above
   * finds none for a night that failed since. Only the owner reads faults (`faults` refuses anyone else), so nobody else
   * is asked. Said with its reason in plain words (`nightFailed` in `health.ts`); a read that fails says nothing.
   */
  let nightFaults = $state.raw<Fault[] | null>(null);
  const failedNight = $derived(nightFailed(nightFaults, Date.now()));
  $effect(() => {
    if (!anOwner) return;
    untrack(() => void readNightFaults());
  });

  async function readNightFaults() {
    const out = await createClient({ base: apiBase() })
      .call<{ faults: Fault[] }>('faults')
      .catch(() => null);
    if (out?.ok && Array.isArray(out.value?.faults)) nightFaults = out.value.faults;
  }

  /**
   * THE EXPORTS HE TOOK, from the newest pages of the log (`readExports`): the instants, newest first, five drawn.
   * `null` is a log that could not be read, and then the row says the one line `boot` gave it.
   */
  let exportsAt = $state.raw<string[] | null>(null);
  const exportsShown = $derived((exportsAt ?? []).slice(0, 5));
  $effect(() => {
    untrack(() => void readExportsNow());
  });

  async function readExportsNow() {
    const client = createClient({ base: apiBase() });
    exportsAt = await readExports(async (cursor) => {
      const out = await client.recentHistory({ limit: 200, ...(cursor === null ? {} : { cursor: cursor as Cursor }) });
      return out.ok ? { events: out.value.events, cursor: out.value.cursor } : null;
    });
  }

  async function readMissed() {
    const out = await createClient({ base: apiBase() })
      .governance({ status: 'open' })
      .catch(() => null);
    if (!out?.ok || !Array.isArray(out.value)) return;
    const row = (out.value as Record<string, unknown>[]).find(
      (r) => typeof r === 'object' && r !== null && r.opened_by === 'system' && typeof r.question === 'string' && aboutCopies(r.question),
    );
    if (row) missed = { id: String(row.id), said: String(row.question).trim().replace(/([^.!?])$/u, '$1.') };
  }

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
      toasts.push(copy.backedUp, { intent: 'good' });
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
      toasts.push(copy.restoredTo(copyDay(out.value.bookmark), out.value.kept ? copyDay(out.value.kept) : ''), { intent: 'good' });
      await readCopies();
    } else toasts.push(out.fix, { intent: 'warn' });
  }
</script>

<!-- WHERE THIS HOST KEEPS NO COPY A PERSON CAN REACH, THE ONE THING THEY CAN TAKE IS AN EXPORT, and it
     is the owner's, as the export itself is. -->
{#snippet exportNow()}
  <Button href="/settings/export">{words.exportNow}</Button>
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

{#snippet answerButton()}
  {#if missed}<Button href={`/decide/${missed.id}`}>{words.answer}</Button>{/if}
{/snippet}

<!-- THE NIGHT THAT DID NOT RUN, FIRST IN WHAT IS KEPT, in the warn well: the same sentence the index leads with. -->
{#snippet missedRow()}
  {#if failedNight}
    <!-- A NIGHT THAT FAILED, AND WHY (`nightFailed`): the fault's sentence and its reason in plain words. -->
    <div role="status" data-night-failed><StateRow icon="alert" tone="warn" title={failedNight.said} line={failedNight.why} action={missed ? answerButton : undefined} /></div>
  {:else if missed}
    <div role="status"><StateRow icon="alert" tone="warn" title={missed.said} line={words.missedLine} action={answerButton} /></div>
  {/if}
{/snippet}

{#snippet backUpButton()}
  {#if anOwner && copiesFrom === 'live'}
    <Button weight="primary" size="sm" disabled={backingUp} aria-busy={backingUp} onclick={backUp}>{copy.snapshotNow}</Button>
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
{#if nights && strip && strip.length > 0}
  <Tile icon="archive" title={tileWords.copiesTitle} meta={tileWords.copiesMeta(KEPT_NIGHTS)}>
    <div class="strip">
      <Waffle parts={nightParts(strip)} columns={KEPT_NIGHTS} summary={nightsSaid(strip)} />
      <!-- THE STRIP'S TWO ENDS, so the squares read as dates. Secondary labels, dropped on a phone. -->
      <div class="strip-ends" aria-hidden="true">
        <span>{nightWords(strip[0]?.day ?? '')}</span>
        <span class="strip-now">{strip[strip.length - 1]?.state === 'copied' && newestAt ? relative(newestAt, Date.now()) : tileWords.stripTo}</span>
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
  <Tile icon="history" class="section" data-surface="tile" title={copy.kept}>
    <div class="section-body">
      <!-- NOT ON THIS HOST YET, AS A ROW, with the record's own sentence as its line and the one way
           out that does exist on every host, the export, as its action. NO LINE OVER IT: "First copy tonight" over a
           host that keeps no copies is a promise the next row takes back. -->
      <!-- THE RESTORE TEST IS THE HOST'S, and true whether or not this record's copies can be listed here. -->
      {@render missedRow()}
      <!-- THE NIGHT'S COPY FIRST, as `boot` says it: its age and size, late past 26 hours.
           A host that sends no such fact, or a record never copied, keeps the row that says there is none. -->
      {#if lastCopy && facts?.last_copy_at}
        <div role="status">
          <StateRow icon="archive" tone={lastCopy.late ? 'warn' : undefined} title={lastCopy.late ? words.nightlyLate : words.nightly} line={lastCopy.text} />
        </div>
      {:else if !failedNight && !missed}
        <!-- A NIGHT THAT DID NOT RUN IS SAID ABOVE, so this row is drawn only where nothing was said of the nights. -->
        <div role="status"><StateRow icon="archive" title={words.noNightly} /></div>
      {/if}
      <!-- AND THE EXPORTS HE TOOK, the newest five by day, with the one press that takes another. -->
      <StateRow icon="download" title={words.exports} line={facts ? exportLine(facts, Date.now()) : undefined} action={anOwner ? exportNow : undefined} />
      {#if exportsShown.length > 0}
        <ul class="ledger ledger-glyph exports">
          {#each exportsShown as when (when)}
            <li>
              <div class="line">
                <span class="seq"><Icon name="download" size="s" /></span>
                <span class="line-main">
                  <span class="line-title">{copyDay(when.slice(0, 10))}</span>
                  <span class="line-detail">{relative(when, Date.now())}</span>
                </span>
              </div>
            </li>
          {/each}
        </ul>
        <p class="every-export"><a href={at('/audit?kind=export')}>{words.everyExport}</a></p>
      {/if}
      {@render drillLineOf()}
    </div>
  </Tile>
{:else if copiesFrom === 'reading'}
  <!-- NOTHING UNTIL THE RECORD ANSWERS: "No backup yet" drawn while the list is read is a sentence the answer may take
       straight back. AND NO TILE AT ALL (verify6, 2 Nov): an empty Kept tile, The key and Restore drawn while the copies
       were read were pushed down by the strip of nights landing over them, 0.24 of a phone's screen. The area draws
       whole once the record answers, into empty room. -->
{:else if copyLines.length === 0}
  <!-- "The 30 newest are kept" IS A SENTENCE ABOUT A LIST THAT HAS SOME. On a record whose
       first backup has not run it describes a policy over nothing, above nothing. -->
  <Tile icon="history" class="section" data-surface="tile" title={copy.kept} actions={backUpButton}>
    <div class="section-body">
      {@render missedRow()}
      {#if firstTonight}{@render drillLineOf()}{:else}{@render lastCopyLine()}{/if}
      <Empty kind="no-data-yet" title={firstTonight ? copy.copiesFirst : copy.noSnapshots} body={copy.noSnapshotsWhy} />
    </div>
  </Tile>
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
      <Tile icon="history" class="section" data-surface="tile" title={month.label} count={kept || undefined} actions={backUpButton}><div class="section-body">{@render missedRow()}{@render lastCopyLine()}{@render monthRows(month.lines)}</div></Tile>
    {:else}
      <Tile icon="history" class="section" data-surface="tile" title={month.label} count={kept || undefined}><div class="section-body">{@render monthRows(month.lines)}</div></Tile>
    {/if}
  {/each}
{/if}

<!-- `49 §8`, and it asks for exactly this: the key "is what a self-hoster must back up
     SEPARATELY; Settings > backups says so in one line." A snapshot sealed with a key that
     is only inside the snapshot is a snapshot nobody can open. -->
{#if copiesFrom !== 'reading'}
<Tile icon="key" class="section" data-surface="tile" title={copy.theKey}>
  <div class="section-body">
    <!-- IT GAVE AN INSTRUCTION AND WITHHELD THE ONE THING NEEDED TO FOLLOW IT. This section had
         no button, no link and no value: "Back that key up somewhere else, or the copies cannot
         be opened" over an empty box. `12 §8` keeps the age identity outside the product on
         purpose, so the fix is not to print it here; it is to say where it already is. -->
    <!-- ONE ROW, AND THE HOST'S HALF OF THE ANSWER AS ITS LINE. The two sentences were two paragraphs on
         both hosts, and the second is only true on a self-host, where the key is a file its owner made. -->
    <!-- ONE LINE, AND THE WHY UNDER "HOW" (ui pass, 3 Nov): two paragraphs of grey stood here on every visit, though
         what they ask is done once. -->
    {#if shell.host === 'cloud'}
      <p class="hint">{copy.theKeyIs}</p>
    {:else}
      <p class="key-line">{backupWords.keyLine}</p>
      <details class="how">
        <summary class="how-head tap"><Icon name="chevron" size="s" />{backupWords.how}</summary>
        <p>{copy.theKeyWhere}</p>
        <!-- THE DOCKER WAY OFF THE VOLUME ONLY IN THE IMAGE (PK5), and from a host older than the flag, which did not say. -->
        {#if shell.image || shell.host !== 'self-host'}
          <p>{copy.downloadNeedsKey} {copy.theKeyDocker}</p>
          <CodeLine text={copy.theKeyDockerCommand} />
        {:else}
          <p>{copy.downloadNeedsKey}</p>
        {/if}
      </details>
    {/if}
  </div>
</Tile>

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
<Tile icon="refresh" class="section" data-surface="tile" title={copy.restore}>
  <div class="section-body">
    <!-- THE RECORD'S OWN ANSWER, AND NOTHING UNTIL IT ARRIVES. There were four answers, and the
         two that were not the record's came from the sample's `DEPLOYMENT.kind`: which host the
         build thought it was on, drawn for as long as the read took and for the sample always. -->
    <!-- EACH GOING BACK SAYS HOW: on the Cloud by writing to us, on a self-host by the command on
         its machine, and over a list with no copy yet, what Restore this will do once there is one. -->
    {#if copiesFrom === 'refused'}
      <p class="hint">{shell.host === 'cloud' ? copy.restoreNotHere : copy.restoreSelfHost}</p>
      {#if shell.host !== 'cloud'}
        <div class="restore-lines"><CodeLine text={copy.restoreSelfHostBackup} /><CodeLine text={copy.restoreSelfHostRestore} /></div>
      {/if}
    {:else if copiesFrom === 'live'}
      <p class="hint">{copyLines.length > 0 ? copy.restoreLive : copy.restoreFirst}</p>
    {/if}
    {#if restoring}
      <!-- THE CONFIRM IS WORDS AND TWO VERBS ON THE GROUND: a destructive verb is its words in ink asking to
           be pressed again, never a red box. What it replaces is said in the sentence, which is the part to read. -->
      <div class="confirm" role="group" aria-label={copy.restoreThis}>
        <p class="confirm-said">{copy.restoreConfirm(copyDay(restoring))}</p>
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
  </div>
</Tile>
{/if}

<style>
  /* A LIST WHOSE LEAD COLUMN IS ONLY A GLYPH: no id, so the glyph sits against the title and the trailing column may
     wrap. Moved out of the entry stylesheet (`rows.css`), kept in the same layer so the cascade is as it was. */
  @layer components {
    .ledger-glyph :global(.line) {
      grid-template-columns: var(--icon-m) minmax(0, 1fr) auto auto;
      gap: var(--sp-3);
    }

    .ledger-glyph :global(.line-when) {
      flex-wrap: wrap;
      max-inline-size: 44ch;
      white-space: normal;
      text-align: end;
    }

    @media (width < 900px) {
      .ledger-glyph :global(.line) {
        grid-template-columns: var(--icon-m) minmax(0, 1fr) auto;
        align-items: start;
        align-content: center;
        gap: 2px var(--sp-3);
      }

      .ledger-glyph :global(.seq) {
        grid-column: 1;
        grid-row: 1;
        min-inline-size: 0;
        min-block-size: 1lh;
      }

      .ledger-glyph :global(.line-main) {
        grid-column: 2;
        grid-row: 1;
      }

      .ledger-glyph :global(.line-amount) {
        grid-column: 2 / -1;
        grid-row: 2;
        text-align: start;
      }

      .ledger-glyph :global(.line-when) {
        grid-column: 3;
        grid-row: 1 / span 2;
        align-self: center;
      }
    }
  }

  /* THE NIGHT'S COPY, the first line in the tile over the copies, at body size. */
  /* THE EXPORTS' LIST SITS UNDER ITS ROW, and the way to every one of them under that, in the quiet meta line. */
  .every-export {
    margin: var(--sp-2) 0 0;
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .every-export a {
    color: var(--ink-2);
  }

  .last-copy {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin: 0 0 var(--sp-3);
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }

  /* LATE IS A WORD AS WELL AS A COLOUR: the deeper red of late, and the word Late before the sentence. */
  .last-copy[data-late] {
    color: var(--red);
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
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  /* What failed is read, not skimmed past, so it takes the second ink rather than the date's dim. */
  .why-failed {
    color: var(--ink-2);
  }

  .hint {
    margin: 0 0 var(--sp-3);
    max-inline-size: var(--measure);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  /* THE KEY'S ONE LINE, read, so the body ink; "Why and how" under it. */
  .key-line {
    margin: 0 0 var(--sp-1);
    max-inline-size: var(--measure);
    color: var(--ink);
    font-size: var(--fs-body);
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
    border-block-start: 1px solid var(--rule);
  }

  .confirm-said {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: var(--lead-ui);
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
    color: var(--ink-3);
    font-size: var(--fs-cap);
    line-height: var(--lead-cap);
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
    font-size: var(--fs-body);
    line-height: var(--lead-ui);
  }

  .policy {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  @media (width < 640px) {
    .strip-ends {
      display: none;
    }
  }

  .restore-lines {
    display: grid;
    gap: var(--sp-2);
    margin-block-end: var(--sp-3);
  }
</style>
