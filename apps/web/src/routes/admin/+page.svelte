<!--
  Admin: `/admin`, the operator's page, which was admin.brain.dog. Shown only to the operator (`+page.ts`, and the
  Worker's `operator.ts` behind every door it calls), with no key and no second sign-in.

  THE FIRST SCREEN IS HOW THINGS STAND. The way in across the top; under it who signed up and whether they use it
  (`People.svelte`); then what needs the owner, applications and plugins side by side as short rows; then one line to
  invite someone and the codes already out. The head has no count line (the owner, 3 Nov: no briefs); each tile says its
  own count.

  A ROW IS ONE LINE UNTIL IT IS PRESSED. An application opens where it stands. A plugin opens in the sheet, with every
  fact and warning it has and Approve and Decline, and pressing Decline is what asks for the reason. Red is one press at
  a time: rows are quiet, and only the sheet's verdict and the invite line's Send wear the primary.

  LISTS STOP AT EIGHT with Show all, as on Usage. What is finished, an application decided or a code ended or used, folds
  under one line. With nothing waiting a tile says so in a line and is no taller than that.

  EACH TILE READS ON ITS OWN (`Tile`'s `ready`), so a slow funnel never holds the applications back, and a tile whose
  door failed says so inside itself with Retry, never as a page of its own.

  A STRANGER'S WORDS ARE TEXT. An application's name, use and link were typed by whoever applied, and a report's words by
  whoever sent it: Svelte draws them as text, and a link is a link only when it is http(s).
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { titleOf } from '$lib/title.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Chip from '$lib/ui/Chip.svelte';
  import ChipList from '$lib/ui/ChipList.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Field from '$lib/ui/Field.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { put } from '$lib/clipboard.ts';
  import Menu from '$lib/ui/Menu.svelte';
  import { ownMenu, type MenuAt } from '$lib/ui/context-menu.ts';
  import type { IconName } from '$lib/ui/icons.ts';
  import WayIn from './WayIn.svelte';
  import People from './People.svelte';
  import {
    REVIEW,
    counted,
    day,
    door,
    linkSaid,
    plural,
    readApplications,
    readCodes,
    readFunnel,
    readPeople,
    readReview,
    useSaid,
    webLink,
    type Answer,
    type Application,
    type Code,
    type Funnel,
    type People as PeopleAnswer,
    type Report,
    type Review,
    type Waiting,
  } from '$lib/admin/ops.ts';

  const words = {
    rowMenu: { app: 'This application', plugin: 'This plugin', report: 'This report', code: 'This code' },
    showDetails: 'Show details',
    hideDetails: 'Hide details',
    reviewOne: 'Review',
    copyEmail: 'Copy the address',
    copyName: 'Copy the name',
    copyLabel: 'Copy the label',
    title: 'Admin',
    way: 'The way in',
    eightWeeks: 'Last eight weeks',
    weeks: 'Weeks',
    applications: 'Applications',
    noApplications: 'No applications waiting.',
    invite: 'Invite',
    decline: 'Decline',
    declineSure: (name: string) => `Decline ${name}? They are not told.`,
    keep: 'Keep',
    applied: (d: string) => `Applied ${d}`,
    decided: (n: number) => `${n.toLocaleString('en-GB')} decided`,
    invitedMailed: (name: string) => `${name} is invited. The link is mailed.`,
    declined: (name: string) => `${name} is declined.`,
    review: 'Plugins to review',
    noReview: 'No plugins waiting.',
    by: (who: string) => `By ${who}`,
    versionBy: (v: string | undefined, who: string) => (v ? `Version ${v}, by ${who}` : `By ${who}`),
    why: 'Why? Its maker is told.',
    whyNeeded: 'Say why in a line first.',
    back: 'Back',
    approve: 'Approve',
    approved: (name: string) => `${name} is listed for everybody.`,
    refused: (name: string) => `${name} is declined. Its maker is told why.`,
    adds: 'Adds',
    uses: 'Uses of theirs',
    calls: 'Reaches outside',
    nothingOwn: 'Nothing of its own',
    onlyOwn: 'Only its own lists',
    noCalls: 'Nothing outside the record',
    look: 'Look twice',
    isNew: 'New in this version',
    model: 'Model note',
    reports: 'Reported',
    inviteTitle: 'Invite someone',
    email: 'Their email',
    note: 'Note for you, optional',
    send: 'Send invite',
    sending: 'Sending',
    noAddress: 'Add the address the link goes to.',
    noMail: 'The mail could not go. Send this link to that address yourself.',
    copy: 'Copy',
    copied: 'Link copied.',
    linkLabel: 'Invite link',
    codes: 'Sign-up codes',
    noCodes: 'No codes out.',
    noneOpen: 'No codes open.',
    label: 'Label',
    made: 'Made',
    ends: 'Ends',
    status: 'Status',
    never: 'Never',
    noNote: 'No note',
    end: 'End',
    ended: 'The code is ended.',
    finished: (n: number) => `${n.toLocaleString('en-GB')} used or ended`,
    stateMadeEnds: (state: string, made: string, ends: string) => `${state}, made ${made}, ends ${ends}`,
    all: (n: number) => `Show all ${n.toLocaleString('en-GB')}`,
    fewer: 'Show fewer',
    retry: 'Try again',
  } as const;

  const TOP = 8;

  const APPLIED: Record<string, { label: string; tone: 'good' | 'warn' | undefined }> = {
    waiting: { label: 'Waiting', tone: 'warn' },
    invited: { label: 'Invited', tone: 'good' },
    declined: { label: 'Declined', tone: undefined },
  };
  const CODE: Record<string, { label: string; tone: 'good' | 'warn' | undefined }> = {
    open: { label: 'Open', tone: 'good' },
    held: { label: 'Being used', tone: 'warn' },
    spent: { label: 'Used', tone: undefined },
    ended: { label: 'Ended', tone: undefined },
  };

  /* ── the five reads, each its own tile's ──────────────────────────────────── */

  type Card<T> = { at: 'waiting' } | { at: 'done'; value: T } | { at: 'failed'; fix: string };
  let applications = $state<Card<Application[]>>({ at: 'waiting' });
  let codes = $state<Card<Code[]>>({ at: 'waiting' });
  let review = $state<Card<Review>>({ at: 'waiting' });
  let funnel = $state<Card<Funnel>>({ at: 'waiting' });
  let people = $state<Card<PeopleAnswer>>({ at: 'waiting' });

  const landed = <T,>(out: Answer<T>): Card<T> => (out.ok ? { at: 'done', value: out.value } : { at: 'failed', fix: out.fix });
  const newest = <T extends { made_at?: number }>(items: T[]): T[] => items.slice().sort((a, b) => (b.made_at ?? 0) - (a.made_at ?? 0));

  async function loadApplications(): Promise<void> {
    const out = await readApplications();
    applications = landed(out.ok ? { ok: true, value: newest(out.value) } : out);
  }
  async function loadCodes(): Promise<void> {
    const out = await readCodes();
    codes = landed(out.ok ? { ok: true, value: newest(out.value) } : out);
  }
  async function loadReview(): Promise<void> {
    review = landed(await readReview());
  }
  async function loadFunnel(): Promise<void> {
    funnel = landed(await readFunnel());
  }
  async function loadPeople(): Promise<void> {
    people = landed(await readPeople());
  }
  onMount(() => {
    void loadApplications();
    void loadCodes();
    void loadReview();
    void loadFunnel();
    void loadPeople();
  });

  /* ── what waits ───────────────────────────────────────────────────────────── */

  type Pointed = { kind: 'app'; app: Application } | { kind: 'plugin'; plugin: Waiting } | { kind: 'report'; key: string; report: Report } | { kind: 'code'; code: Code };
  let pointed = $state.raw<Pointed | null>(null);
  let pointedAt = $state.raw<MenuAt | null>(null);
  const pointAt = (what: Pointed, p: MenuAt): void => {
    pointed = what;
    pointedAt = p;
  };

  const waitingApps = $derived(applications.at === 'done' ? applications.value.filter((a) => a.state === 'waiting') : []);
  const decidedApps = $derived(applications.at === 'done' ? applications.value.filter((a) => a.state !== 'waiting') : []);
  const pending = $derived(review.at === 'done' ? review.value.pending : []);
  const reports = $derived(review.at === 'done' ? review.value.reports : []);
  const liveCodes = $derived(codes.at === 'done' ? codes.value.filter((c) => c.state === 'open' || c.state === 'held') : []);
  const doneCodes = $derived(codes.at === 'done' ? codes.value.filter((c) => c.state !== 'open' && c.state !== 'held') : []);

  let allApps = $state(false);
  let allPlugins = $state(false);
  let allReports = $state(false);
  let allCodes = $state(false);
  let showDecided = $state(false);
  let showDone = $state(false);
  let showWeeks = $state(false);

  /** The one row open in place: an application's id, or a report's place in its list. */
  let opened = $state<string | null>(null);
  const toggle = (key: string): void => {
    opened = opened === key ? null : key;
  };

  /* ── applications ─────────────────────────────────────────────────────────── */

  let busy = $state<string | null>(null);
  let declining = $state<string | null>(null);
  /** The invite link to send by hand when the mail could not go, by where it came from: the invite line, or an application. */
  let unsent = $state<{ from: 'form' | 'application'; link: string } | null>(null);

  async function inviteApplication(a: Application): Promise<void> {
    busy = a.id;
    const out = await door<{ link?: string; mailed?: boolean }>('/account/ops/applications', { invite: a.id });
    busy = null;
    if (!out.ok) {
      toasts.push(out.fix, { intent: 'warn' });
      return;
    }
    if (out.value.mailed === true) toasts.push(words.invitedMailed(a.name), { intent: 'good' });
    else unsent = { from: 'application', link: out.value.link ?? '' };
    void loadApplications();
    void loadCodes();
  }

  async function declineApplication(a: Application): Promise<void> {
    busy = a.id;
    const out = await door('/account/ops/applications', { decline: a.id });
    busy = null;
    declining = null;
    toasts.push(out.ok ? words.declined(a.name) : out.fix, { intent: out.ok ? 'good' : 'warn' });
    if (out.ok) void loadApplications();
  }

  /* ── invite anyone ───────────────────────────────────────────────────────── */

  let inviteEmail = $state('');
  let inviteNote = $state('');
  let inviteError = $state<string | null>(null);
  let inviting = $state(false);

  async function sendInvite(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    const email = inviteEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
      inviteError = words.noAddress;
      return;
    }
    inviteError = null;
    inviting = true;
    const note = inviteNote.trim();
    const out = await door<{ links?: string[]; mailed?: boolean }>('/account/ops/invite', note === '' ? { email } : { email, note });
    inviting = false;
    if (!out.ok) {
      inviteError = out.fix;
      return;
    }
    inviteEmail = '';
    inviteNote = '';
    if (out.value.mailed === true) toasts.push(words.invitedMailed(email), { intent: 'good' });
    else unsent = { from: 'form', link: out.value.links?.[0] ?? '' };
    void loadCodes();
    void loadApplications();
  }

  const copyLink = (link: string): Promise<void> => put(link, words.linkLabel, words.copied);

  /* ── sign-up codes ───────────────────────────────────────────────────────── */

  async function endCode(c: Code): Promise<void> {
    busy = c.ref;
    const out = await door('/account/ops/invite', { end: c.ref });
    busy = null;
    toasts.push(out.ok ? words.ended : out.fix, { intent: out.ok ? 'good' : 'warn' });
    if (out.ok) void loadCodes();
  }

  /** A code's note, with the two the Worker writes itself said as words: `invite: <email>`, `application: <email>`. */
  function noteSaid(note: string | null | undefined): string {
    const n = (note ?? '').trim();
    if (n === '') return words.noNote;
    const mailed = /^invite:\s*(.+)$/i.exec(n);
    if (mailed) return `Mailed to ${mailed[1]}`;
    const applied = /^application:\s*(.+)$/i.exec(n);
    return applied ? `Applied as ${applied[1]}` : n;
  }

  /* ── plugin review ───────────────────────────────────────────────────────── */

  /** The plugin in the sheet. It stays set as the sheet closes, so the sheet does not go blank on its way out. */
  let panel = $state<Waiting | null>(null);
  let panelOpen = $state(false);
  /** Whether the sheet has been asked to decline, which is what brings up the reason. */
  let refusing = $state(false);
  let panelFail = $state<string | null>(null);
  let reasons = $state<Record<string, string>>({});
  let reasonError = $state<string | null>(null);

  const keyOf = (w: Waiting): string => `${w.entry?.kind ?? ''}:${w.entry?.id ?? ''}@${w.version?.version ?? ''}`;
  const nameOf = (w: Waiting): string => String(w.entry?.title || w.entry?.id || 'This plugin');
  const reportsOf = (w: Waiting): Report[] => reports.filter((r) => r.id === w.entry?.id);
  const reportName = (r: Report): string => {
    const w = pending.find((p) => p.entry?.id === r.id);
    return w ? nameOf(w) : r.id;
  };

  function openPanel(w: Waiting): void {
    panel = w;
    refusing = false;
    panelFail = null;
    reasonError = null;
    panelOpen = true;
  }

  function addsOf(w: Waiting): { label: string; icon: IconName }[] {
    const r = w.version?.reach ?? {};
    const out: { label: string; icon: IconName }[] = [];
    const count = (list: unknown[] | undefined, one: string, many: string, icon: IconName): void => {
      if (Array.isArray(list) && list.length > 0) out.push({ label: plural(list.length, one, many), icon });
    };
    count(r.lists, 'list', 'lists', 'rows');
    count(r.pages, 'page', 'pages', 'doc');
    count(r.rules, 'automation', 'automations', 'refresh');
    count(r.skills, 'skill', 'skills', 'skill');
    return out;
  }
  function usesOf(w: Waiting): { label: string; icon: IconName; tone?: 'warn' }[] {
    return (w.version?.reach?.uses ?? []).map((u) => {
      const s = useSaid(u);
      const icon: IconName = s.what === 'figure' ? 'observe' : s.what === 'page' ? 'doc' : s.what === 'record' ? 'board' : 'rows';
      return s.writes || s.what === 'record' ? { label: s.writes ? `${s.label}, changes it` : `${s.label}, whole record`, icon, tone: 'warn' as const } : { label: s.label, icon };
    });
  }
  const callsOf = (w: Waiting): { label: string; icon: IconName }[] =>
    (w.version?.reach?.calls_out ?? []).map((c) => ({ label: String(c.host || c.line || 'Somewhere'), icon: 'globe' as IconName }));

  async function decide(w: Waiting, verdict: 'list' | 'refuse'): Promise<void> {
    const key = keyOf(w);
    const reason = verdict === 'refuse' ? (reasons[key] ?? '').trim() : '';
    if (verdict === 'refuse' && reason === '') {
      reasonError = words.whyNeeded;
      return;
    }
    reasonError = null;
    panelFail = null;
    busy = key;
    const out = await door(REVIEW, { kind: w.entry?.kind, id: w.entry?.id, version: w.version?.version, verdict, reason });
    busy = null;
    /* SAID IN THE SHEET: a toast waits for a sheet to close, and this one is still open for another try. */
    if (!out.ok) {
      panelFail = out.fix;
      return;
    }
    panelOpen = false;
    toasts.push(verdict === 'list' ? words.approved(nameOf(w)) : words.refused(nameOf(w)), { intent: 'good' });
    void loadReview();
  }

  const focusNow = (el: HTMLInputElement): void => el.focus();
</script>

<svelte:head><title>{titleOf(words.title)}</title></svelte:head>

<PageHead icon="lock" title={words.title} silent />

{#snippet failed(fix: string, retry: () => void)}
  <div class="a-failed" role="status">
    <Icon name="alert" size="m" />
    <span class="a-failed-said">{fix}</span>
    <Button weight="quiet" size="sm" onclick={retry}>{words.retry}</Button>
  </div>
{/snippet}

{#snippet peopleFailed(fix: string)}
  {@render failed(fix, () => void loadPeople())}
{/snippet}

{#snippet sendYourself(link: string)}
  <div class="a-unsent" role="status">
    <p class="a-unsent-said">{words.noMail}</p>
    <div class="a-copy">
      <div class="field a-link"><input class="field-input num" type="text" readonly value={link} aria-label={words.linkLabel} onfocus={(e) => e.currentTarget.select()} /></div>
      <Button weight="quiet" onclick={() => void copyLink(link)}><Icon name="copy" size="s" />{words.copy}</Button>
    </div>
  </div>
{/snippet}

{#snippet calm(said: string)}
  <p class="a-calm"><Icon name="check" size="s" />{said}</p>
{/snippet}

{#snippet more(open: boolean, total: number, flip: () => void)}
  <button type="button" class="a-more tap" aria-expanded={open} onclick={flip}><Icon name="chevronDown" size="s" />{open ? words.fewer : words.all(total)}</button>
{/snippet}

{#snippet fold(open: boolean, said: string, flip: () => void)}
  <button type="button" class="a-more tap" aria-expanded={open} onclick={flip}><Icon name="chevronDown" size="s" />{said}</button>
{/snippet}

{#snippet reportRows(list: Report[], names: boolean)}
  <ul class="a-rows">
    {#each list as r, i (`${r.id} ${r.at} ${i}`)}
      {@const key = `report:${names ? '' : 'sheet:'}${r.id}:${r.at}:${i}`}
      <li class="a-report" data-open={opened === key ? '' : undefined} {@attach ownMenu((p) => pointAt({ kind: 'report', key, report: r }, p))}>
        <button type="button" class="a-press" aria-expanded={opened === key} onclick={() => toggle(key)}>
          <span class="a-top">
            {#if names}<span class="a-name">{reportName(r)}</span>{/if}
            {#if r.version}<span class="a-meta num">{r.version}</span>{/if}
            <span class="a-meta a-who">{words.by(r.by)}</span>
            <span class="a-when num">{day(Date.parse(r.at))}</span>
          </span>
          <span class="a-use">{r.why}</span>
        </button>
      </li>
    {/each}
  </ul>
{/snippet}

{#snippet codeRow(c: Code)}
  {@const state = CODE[c.state] ?? { label: c.state, tone: undefined }}
  {@const said = noteSaid(c.note)}
  {@const ends = c.ends_at ? day(c.ends_at) : words.never}
  <tr {@attach ownMenu((p) => pointAt({ kind: 'code', code: c }, p))}>
    <td class="c-label">
      <span class="c-said" title={said}>{said}</span>
      <span class="c-sub num">{words.stateMadeEnds(state.label, day(c.made_at), c.ends_at ? ends : ends.toLowerCase())}</span>
      {#if c.state === 'spent' && c.made}<span class="a-meta c-by">{c.made}</span>{/if}
    </td>
    <td class="c-made num">{day(c.made_at)}</td>
    <td class="c-ends num">{ends}</td>
    <td class="c-state">{#if state.tone}<Chip label={state.label} tone={state.tone} />{:else}<span class="a-meta">{state.label}</span>{/if}</td>
    <td class="c-act">{#if c.state === 'open' || c.state === 'held'}<Button weight="bare" size="sm" disabled={busy === c.ref} onclick={() => void endCode(c)}>{words.end}</Button>{/if}</td>
  </tr>
{/snippet}

<!-- A ROW'S VERBS AT THE POINTER: what its buttons do, one menu for the page's kinds of row. -->
<Menu label={pointed ? words.rowMenu[pointed.kind] : words.way} open={pointed !== null} at={pointedAt} onclose={() => (pointed = null)}>
  {#if pointed?.kind === 'app'}
    {@const a = pointed.app}
    <button type="button" role="menuitem" onclick={() => toggle(a.id)}><Icon name="eye" size="s" />{opened === a.id ? words.hideDetails : words.showDetails}</button>
    {#if a.state === 'waiting'}
      <button type="button" role="menuitem" disabled={busy === a.id} onclick={() => void inviteApplication(a)}><Icon name="user-plus" size="s" />{words.invite}</button>
    {/if}
    <button type="button" role="menuitem" onclick={() => void put(a.email)}><Icon name="copy" size="s" />{words.copyEmail}</button>
    {#if a.state === 'waiting'}
      <hr />
      <button type="button" role="menuitem" data-tone="bad" disabled={busy === a.id} onclick={() => (declining = a.id)}><Icon name="ban" size="s" />{words.decline}</button>
    {/if}
  {:else if pointed?.kind === 'plugin'}
    {@const w = pointed.plugin}
    <button type="button" role="menuitem" onclick={() => openPanel(w)}><Icon name="arrow" size="s" />{words.reviewOne}</button>
    <button type="button" role="menuitem" onclick={() => void put(nameOf(w))}><Icon name="copy" size="s" />{words.copyName}</button>
  {:else if pointed?.kind === 'report'}
    {@const p = pointed}
    <button type="button" role="menuitem" onclick={() => toggle(p.key)}><Icon name="eye" size="s" />{opened === p.key ? words.hideDetails : words.showDetails}</button>
    <button type="button" role="menuitem" onclick={() => void put(reportName(p.report))}><Icon name="copy" size="s" />{words.copyName}</button>
  {:else if pointed?.kind === 'code'}
    {@const c = pointed.code}
    <button type="button" role="menuitem" onclick={() => void put(noteSaid(c.note))}><Icon name="copy" size="s" />{words.copyLabel}</button>
    {#if c.state === 'open' || c.state === 'held'}
      <hr />
      <button type="button" role="menuitem" data-tone="bad" disabled={busy === c.ref} onclick={() => void endCode(c)}><Icon name="ban" size="s" />{words.end}</button>
    {/if}
  {/if}
</Menu>

<div class="page a-page">
  <!-- THE WAY IN. It draws its steps at once and fills them when the door answers, so a slow funnel moves nothing. -->
  <Tile class="a-way" icon="observe" title={words.way}>
    {#snippet actions()}
      <span class="a-meta">{words.eightWeeks}</span>
      {#if funnel.at === 'done' && counted(funnel.value)}
        <button type="button" class="a-weeks tap" aria-expanded={showWeeks} onclick={() => (showWeeks = !showWeeks)}>{words.weeks}<Icon name="chevronDown" size="s" /></button>
      {/if}
    {/snippet}
    {#if funnel.at === 'failed'}
      {@render failed(funnel.fix, () => void loadFunnel())}
    {:else}
      <WayIn funnel={funnel.at === 'done' ? funnel.value : null} weeksOpen={showWeeks} />
    {/if}
  </Tile>

  <People answer={people} failed={peopleFailed} />

  <div class="a-need">
    <!-- APPLICATIONS, WAITING FIRST. A row says who and why in two short lines; pressing it opens the rest where it stands. -->
    <Tile icon="user-check" title={words.applications} count={waitingApps.length || undefined} ready={applications.at !== 'waiting'} rows={3} shape="applications">
      {#if applications.at === 'failed'}
        {@render failed(applications.fix, () => void loadApplications())}
      {:else if applications.at === 'done'}
        {#if unsent?.from === 'application'}{@render sendYourself(unsent.link)}{/if}
        {#if waitingApps.length === 0}
          {@render calm(words.noApplications)}
        {:else}
          <ul class="a-rows">
            {#each allApps ? waitingApps : waitingApps.slice(0, TOP) as a (a.id)}
              {@const link = webLink(a.link)}
              {@const open = opened === a.id}
              <li class="a-app" data-open={open ? '' : undefined} {@attach ownMenu((p) => pointAt({ kind: 'app', app: a }, p))}>
                <button type="button" class="a-press" aria-expanded={open} onclick={() => toggle(a.id)}>
                  <span class="a-top">
                    <span class="a-name">{a.name}</span>
                    <span class="a-meta a-mail">{a.email}</span>
                    <span class="a-when num">{day(a.made_at)}</span>
                    <span class="a-caret" aria-hidden="true"><Icon name="chevronDown" size="s" /></span>
                  </span>
                  {#if a.use}<span class="a-use">{a.use}</span>{/if}
                </button>
                {#if declining !== a.id}
                  <div class="a-acts">
                    <Button weight="bare" size="sm" disabled={busy === a.id} onclick={() => (declining = a.id)}>{words.decline}</Button>
                    <Button weight="quiet" size="sm" disabled={busy === a.id} onclick={() => void inviteApplication(a)}>{words.invite}</Button>
                  </div>
                {/if}
                {#if open}
                  <p class="a-opened a-meta">
                    <span>{words.applied(day(a.made_at))}</span>
                    {#if link}<a class="a-out" href={link} target="_blank" rel="noopener noreferrer"><Icon name="external" size="s" />{linkSaid(link)}</a>{:else if a.link}<span>{a.link}</span>{/if}
                  </p>
                {/if}
                {#if declining === a.id}
                  <div class="a-ask">
                    <span class="a-ask-said">{words.declineSure(a.name)}</span>
                    <Button weight="bare" size="sm" onclick={() => (declining = null)}>{words.keep}</Button>
                    <Button weight="quiet" tone="bad" size="sm" disabled={busy === a.id} onclick={() => void declineApplication(a)}>{words.decline}</Button>
                  </div>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
        {#if waitingApps.length > TOP || decidedApps.length > 0}
          <div class="a-foot">
            {#if waitingApps.length > TOP}{@render more(allApps, waitingApps.length, () => (allApps = !allApps))}{/if}
            {#if decidedApps.length > 0}{@render fold(showDecided, words.decided(decidedApps.length), () => (showDecided = !showDecided))}{/if}
          </div>
        {/if}
        {#if showDecided}
          <ul class="a-rows a-decided">
            {#each decidedApps as a (a.id)}
              {@const state = APPLIED[a.state] ?? { label: a.state, tone: undefined }}
              <li class="a-done" {@attach ownMenu((p) => pointAt({ kind: 'app', app: a }, p))}>
                <span class="a-top"><span class="a-name">{a.name}</span><span class="a-meta a-mail">{a.email}</span></span>
                <span class="a-when num">{day(a.made_at)}</span>
                {#if state.tone}<Chip label={state.label} tone={state.tone} />{:else}<span class="a-meta">{state.label}</span>{/if}
              </li>
            {/each}
          </ul>
        {/if}
      {/if}
    </Tile>

    <!-- THE REVIEW QUEUE: one row a plugin, its detail and its verdict in the sheet. What people reported stays in sight. -->
    <Tile icon="plug" title={words.review} count={pending.length || undefined} ready={review.at !== 'waiting'} rows={3} shape="review">
      {#if review.at === 'failed'}
        {@render failed(review.fix, () => void loadReview())}
      {:else if review.at === 'done'}
        {#if pending.length === 0}
          {@render calm(words.noReview)}
        {:else}
          <ul class="a-rows">
            {#each allPlugins ? pending : pending.slice(0, TOP) as w (keyOf(w))}
              <li {@attach ownMenu((p) => pointAt({ kind: 'plugin', plugin: w }, p))}>
                <button type="button" class="a-plugin" onclick={() => openPanel(w)}>
                  <span class="a-name">{nameOf(w)}</span>
                  {#if w.version?.version}<span class="a-meta num a-ver">{w.version.version}</span>{/if}
                  <span class="a-meta a-maker">{words.by(w.entry?.publisher?.name || 'someone')}</span>
                  {#if (w.flags ?? []).length > 0}<span class="a-twice"><Icon name="alert" size="s" /><span class="a-twice-word">{words.look}</span></span>{/if}
                  <span class="a-go" aria-hidden="true"><Icon name="chevron" size="s" /></span>
                </button>
              </li>
            {/each}
          </ul>
          {#if pending.length > TOP}<div class="a-foot">{@render more(allPlugins, pending.length, () => (allPlugins = !allPlugins))}</div>{/if}
        {/if}
        {#if reports.length > 0}
          <h3 class="a-sub">{words.reports}<span class="a-sub-count num">{reports.length}</span></h3>
          {@render reportRows(allReports ? reports : reports.slice(0, TOP), true)}
          {#if reports.length > TOP}<div class="a-foot">{@render more(allReports, reports.length, () => (allReports = !allReports))}</div>{/if}
        {/if}
      {/if}
    </Tile>
  </div>

  <!-- INVITE ANYONE: one line, one address, one code, mailed. -->
  <Tile class="a-invite" icon="user-plus" title={words.inviteTitle}>
    <form class="a-line" onsubmit={(e) => void sendInvite(e)} novalidate>
      <div class="field a-line-mail" data-bad={inviteError ? '' : undefined}>
        <input class="field-input" type="email" placeholder={words.email} aria-label={words.email} autocomplete="off" autocapitalize="off" spellcheck="false" bind:value={inviteEmail} aria-invalid={inviteError !== null} aria-describedby={inviteError ? 'invite-said' : undefined} disabled={inviting} />
      </div>
      <div class="field a-line-note">
        <input class="field-input" type="text" placeholder={words.note} aria-label={words.note} autocomplete="off" maxlength="200" bind:value={inviteNote} disabled={inviting} />
      </div>
      <Button weight="primary" type="submit" disabled={inviting}>{inviting ? words.sending : words.send}</Button>
    </form>
    {#if inviteError}<p class="a-said" id="invite-said" role="alert"><Icon name="alert" size="s" /><span>{inviteError}</span></p>{/if}
    {#if unsent?.from === 'form'}<div class="a-whole">{@render sendYourself(unsent.link)}</div>{/if}
  </Tile>

  <!-- THE CODES ALREADY OUT, NEWEST FIRST. Never the code itself: it was shown once, when it was made. -->
  <Tile icon="key" title={words.codes} count={liveCodes.length || undefined} ready={codes.at !== 'waiting'} rows={3} shape="codes">
    {#if codes.at === 'failed'}
      {@render failed(codes.fix, () => void loadCodes())}
    {:else if codes.at === 'done'}
      {#if codes.value.length === 0}
        {@render calm(words.noCodes)}
      {:else}
        {#if liveCodes.length === 0}{@render calm(words.noneOpen)}{/if}
        {#if liveCodes.length > 0 || showDone}
          <table class="a-codes">
            <thead>
              <tr><th scope="col" class="c-label">{words.label}</th><th scope="col" class="c-made">{words.made}</th><th scope="col" class="c-ends">{words.ends}</th><th scope="col" class="c-state">{words.status}</th><th scope="col" class="c-act"><span class="a-hidden">{words.end}</span></th></tr>
            </thead>
            <tbody>
              {#each allCodes ? liveCodes : liveCodes.slice(0, TOP) as c (c.ref)}{@render codeRow(c)}{/each}
              {#if showDone}{#each doneCodes as c (c.ref)}{@render codeRow(c)}{/each}{/if}
            </tbody>
          </table>
        {/if}
        {#if liveCodes.length > TOP || doneCodes.length > 0}
          <div class="a-foot">
            {#if liveCodes.length > TOP}{@render more(allCodes, liveCodes.length, () => (allCodes = !allCodes))}{/if}
            {#if doneCodes.length > 0}{@render fold(showDone, words.finished(doneCodes.length), () => (showDone = !showDone))}{/if}
          </div>
        {/if}
      {/if}
    {/if}
  </Tile>
</div>

<!-- ONE PLUGIN, IN THE SHEET: everything the row left out. The warnings lead, because they are why it was opened. -->
<Sheet bind:open={panelOpen} title={panel ? nameOf(panel) : words.review} subtitle={panel ? words.versionBy(panel.version?.version, panel.entry?.publisher?.name || 'someone') : undefined} caret={false}>
  {#if panel}
    {@const adds = addsOf(panel)}
    {@const uses = usesOf(panel)}
    {@const calls = callsOf(panel)}
    {@const said = reportsOf(panel)}
    <div class="p-body">
      {#if panel.entry?.summary}<p class="p-summary">{panel.entry.summary}</p>{/if}
      {#if (panel.flags ?? []).length > 0}
        <ul class="a-notes">
          {#each panel.flags ?? [] as f, i (i)}<li class="a-note warn"><Icon name="alert" size="s" /><span><b>{words.look}.</b> {f}</span></li>{/each}
        </ul>
      {/if}
      <dl class="a-facts">
        <dt>{words.adds}</dt>
        <dd>{#if adds.length > 0}<ChipList items={adds} label={words.adds} />{:else}<span class="a-meta">{words.nothingOwn}</span>{/if}</dd>
        <dt>{words.uses}</dt>
        <dd>{#if uses.length > 0}<ChipList items={uses} label={words.uses} most={8} />{:else}<span class="a-meta">{words.onlyOwn}</span>{/if}</dd>
        <dt>{words.calls}</dt>
        <dd>{#if calls.length > 0}<ChipList items={calls} label={words.calls} most={6} />{:else}<span class="a-meta">{words.noCalls}</span>{/if}</dd>
      </dl>
      {#if (panel.added ?? []).length > 0 || panel.note?.text}
        <ul class="a-notes">
          {#each panel.added ?? [] as n, i (i)}<li class="a-note"><Icon name="plus" size="s" /><span><b>{words.isNew}.</b> {n}</span></li>{/each}
          {#if panel.note?.text}<li class="a-note"><Icon name="slash" size="s" /><span><b>{words.model}.</b> {panel.note.text}</span></li>{/if}
        </ul>
      {/if}
      {#if said.length > 0}
        <div>
          <h3 class="a-sub">{words.reports}<span class="a-sub-count num">{said.length}</span></h3>
          {@render reportRows(said, false)}
        </div>
      {/if}
    </div>
  {/if}
  {#snippet footer()}
    {#if panel}
      {@const key = keyOf(panel)}
      {#if panelFail}<p class="a-said a-whole" role="alert"><Icon name="alert" size="s" /><span>{panelFail}</span></p>{/if}
      {#if refusing}
        <div class="a-whole">
          <Field id="plugin-why" label={words.why} error={reasonError}>
            {#snippet children({ describedBy, invalid })}
              <div class="field"><input id="plugin-why" class="field-input" type="text" maxlength="300" autocomplete="off" use:focusNow value={reasons[key] ?? ''} oninput={(e) => (reasons = { ...reasons, [key]: e.currentTarget.value })} aria-describedby={describedBy} aria-invalid={invalid} /></div>
            {/snippet}
          </Field>
        </div>
        <Button weight="quiet" disabled={busy === key} onclick={() => { refusing = false; reasonError = null; panelFail = null; }}>{words.back}</Button>
        <Button weight="primary" disabled={busy === key} onclick={() => void (panel && decide(panel, 'refuse'))}>{words.decline}</Button>
      {:else}
        <Button weight="quiet" disabled={busy === key} onclick={() => { refusing = true; panelFail = null; }}>{words.decline}</Button>
        <Button weight="primary" disabled={busy === key} onclick={() => void (panel && decide(panel, 'list'))}>{words.approve}</Button>
      {/if}
    {/if}
  {/snippet}
</Sheet>

<style>
  .a-page {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: var(--tile-gap);
    padding: var(--page-head-gap, 24px) var(--gutter) var(--page-bottom, 64px);
    max-inline-size: var(--page-max);
  }

  /* WHAT NEEDS THE OWNER, SIDE BY SIDE, one height; one column once they cannot both hold a row. */
  .a-need {
    display: flex;
    flex-wrap: wrap;
    align-items: stretch;
    gap: var(--tile-gap);
  }

  .a-need > :global(.tile) {
    flex: 1 1 400px;
  }

  /* NOTHING WAITING: one line with a tick, in the tile's quiet words. */
  .a-calm {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: var(--lead-ui);
  }

  .a-calm :global(svg) {
    flex: none;
    color: var(--good);
  }

  .a-rows {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* ── a row, pressed to open ─────────────────────────────────────────────── */

  .a-app {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    column-gap: var(--sp-3);
  }

  .a-press {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 1px;
    min-block-size: 44px;
    inline-size: calc(100% + var(--sp-4));
    min-inline-size: 0;
    margin-inline: calc(-1 * var(--sp-2));
    padding: calc(5px * var(--dense, 1)) var(--sp-2);
    background: none;
    border: 0;
    border-radius: var(--r-xs);
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  .a-app .a-press {
    inline-size: calc(100% + var(--sp-2));
    margin-inline-end: 0;
  }

  .a-top {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .a-name {
    flex: 0 0 auto;
    max-inline-size: 70%;
    min-inline-size: 0;
    overflow: hidden;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: var(--fw-medium);
    line-height: var(--lead-ui);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .a-meta {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .a-mail,
  .a-who {
    flex: 0 1 auto;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .a-when {
    flex: none;
    margin-inline-start: auto;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
    white-space: nowrap;
  }

  .a-use {
    display: block;
    overflow: hidden;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  [data-open] > .a-press .a-use {
    overflow-wrap: anywhere;
    white-space: normal;
  }

  [data-open] > .a-press .a-name,
  [data-open] > .a-press .a-mail {
    overflow-wrap: anywhere;
    white-space: normal;
  }

  .a-caret {
    display: none;
    flex: none;
    align-self: center;
    color: var(--ink-3);
  }

  [data-open] .a-caret {
    rotate: 180deg;
  }

  .a-acts {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
  }

  .a-opened {
    grid-column: 1 / -1;
    display: flex;
    flex-wrap: wrap;
    gap: 2px var(--sp-3);
    margin: 0;
    padding-block-end: var(--sp-2);
    overflow-wrap: anywhere;
  }

  .a-out {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    color: var(--ink-2);
    text-decoration: none;
    overflow-wrap: anywhere;
  }

  .a-ask {
    grid-column: 1 / -1;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--sp-1) var(--sp-2);
    padding-block-end: var(--sp-2);
  }

  .a-ask-said {
    flex: 1 1 200px;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
    overflow-wrap: anywhere;
  }

  /* ── a plugin, one row ───────────────────────────────────────────────────── */

  .a-plugin .a-name {
    flex: 0 1 auto;
    max-inline-size: none;
  }

  .a-plugin {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    inline-size: calc(100% + var(--sp-4));
    min-block-size: 44px;
    margin-inline: calc(-1 * var(--sp-2));
    padding: 0 var(--sp-2);
    background: none;
    border: 0;
    border-radius: var(--r-xs);
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  .a-ver {
    flex: none;
  }

  .a-maker {
    flex: 1 1 0;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .a-twice {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: var(--sp-1);
    color: var(--warn);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
    line-height: var(--lead-meta);
  }

  .a-go {
    display: inline-flex;
    flex: none;
    color: var(--ink-3);
  }

  @media (hover: hover) and (pointer: fine) {
    .a-press:hover,
    .a-plugin:hover {
      background: var(--soft-fill);
    }

    .a-out:hover {
      color: var(--ink);
      text-decoration: underline;
    }
  }

  .a-press:active,
  .a-plugin:active {
    background: var(--soft-fill-hover);
  }

  .a-sub {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
    margin: var(--sp-4) 0 var(--sp-1);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: var(--fw-semi);
    line-height: var(--lead-meta);
  }

  .a-sub-count {
    color: var(--ink-3);
    font-weight: var(--fw-medium);
  }

  /* ── what folds, and Show all ────────────────────────────────────────────── */

  .a-foot {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin-block-start: var(--sp-2);
  }

  .a-more,
  .a-weeks {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    min-block-size: var(--ctl-panel);
    background: var(--soft-fill);
    border: 0;
    border-radius: var(--r-pill);
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    line-height: var(--lead-ctl, 20px);
    cursor: pointer;
  }

  .a-more {
    padding-inline: var(--sp-3);
  }

  .a-weeks {
    padding-inline: var(--sp-3) var(--sp-2);
  }

  .a-more :global(svg),
  .a-weeks :global(svg) {
    transition: rotate var(--d-state, 120ms) var(--ease-out, ease-out);
  }

  .a-more[aria-expanded='true'] :global(svg),
  .a-weeks[aria-expanded='true'] :global(svg) {
    rotate: 180deg;
  }

  @media (hover: hover) and (pointer: fine) {
    .a-more:hover,
    .a-weeks:hover {
      background: var(--soft-fill-hover);
      color: var(--ink);
    }
  }

  .a-decided {
    margin-block-start: var(--sp-2);
  }

  .a-done {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: 36px;
  }

  .a-done .a-top {
    flex: 1 1 0;
  }

  .a-done .a-name {
    font-weight: var(--fw-regular);
    color: var(--ink-2);
  }

  /* ── the sheet ───────────────────────────────────────────────────────────── */

  .p-body {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
  }

  .p-summary {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
    overflow-wrap: anywhere;
  }

  .a-facts {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-1) var(--sp-4);
    margin: 0;
  }

  .a-facts dt {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .a-facts dd {
    min-inline-size: 0;
    margin: 0 0 var(--sp-2);
  }

  @media (width >= 900px) {
    .a-facts {
      grid-template-columns: 112px minmax(0, 1fr);
      align-items: baseline;
      row-gap: var(--sp-2);
    }

    .a-facts dd {
      margin: 0;
    }
  }

  .a-notes {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .a-note {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-2);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
    overflow-wrap: anywhere;
  }

  .a-note :global(svg) {
    flex: none;
    margin-block-start: 1px;
  }

  .a-note.warn {
    color: var(--ink);
  }

  .a-note.warn :global(svg) {
    color: var(--warn);
  }

  .a-note b {
    font-weight: var(--fw-semi);
  }

  .a-whole {
    flex: 1 1 100%;
    min-inline-size: 0;
  }

  /* ── the invite line ─────────────────────────────────────────────────────── */

  :global(.tile.a-invite) {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-5);
  }

  :global(.tile.a-invite > .tile-head) {
    flex: none;
    margin: 0;
  }

  .a-line {
    display: flex;
    flex: 1 1 480px;
    align-items: center;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .a-line-mail {
    flex: 3 1 0;
    min-inline-size: 0;
  }

  .a-line-note {
    flex: 4 1 0;
    min-inline-size: 0;
  }

  .field[data-bad] {
    box-shadow: inset 0 0 0 1px var(--red);
  }

  .a-said {
    display: flex;
    flex: 1 1 100%;
    align-items: flex-start;
    gap: var(--sp-2);
    margin: 0;
    color: var(--red);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .a-said :global(svg) {
    flex: none;
    margin-block-start: 1px;
  }

  .a-unsent {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin-block-end: var(--sp-2);
    padding: var(--sp-3);
    background: var(--warn-tint);
    border-radius: var(--r-field, 10px);
  }

  .a-unsent-said {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .a-copy {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .a-link {
    flex: 1 1 auto;
    min-inline-size: 0;
    font-size: var(--fs-meta);
  }

  /* ── a failed door ───────────────────────────────────────────────────────── */

  .a-failed {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-3);
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: var(--lead-ui);
  }

  .a-failed :global(svg) {
    flex: none;
    color: var(--warn);
  }

  .a-failed-said {
    flex: 1 1 200px;
  }

  /* ── the codes ───────────────────────────────────────────────────────────── */

  .a-codes {
    inline-size: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    font-size: var(--fs-body);
  }

  .a-codes th {
    padding: 0 var(--sp-3) var(--sp-2) 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: var(--fw-regular);
    line-height: var(--lead-meta);
    text-align: start;
  }

  .a-codes :global(td) {
    padding: 0 var(--sp-3) 0 0;
    block-size: 36px;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
    vertical-align: middle;
  }

  .a-codes :global(tbody tr) {
    border-block-start: 1px solid var(--rule);
  }

  .a-codes th.c-made,
  .a-codes th.c-ends {
    inline-size: 112px;
  }

  .a-codes th.c-state {
    inline-size: 128px;
  }

  .a-codes th.c-act {
    inline-size: 64px;
    padding-inline-end: 0;
  }

  .a-codes :global(td.c-act) {
    padding-inline-end: 0;
    text-align: end;
  }

  .c-said {
    display: block;
    overflow: hidden;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: var(--lead-ui);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .c-sub {
    display: none;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .c-by {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .a-hidden {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* ── a phone ─────────────────────────────────────────────────────────────── */

  @container (inline-size < 640px) {
    .a-app {
      grid-template-columns: minmax(0, 1fr);
    }

    .a-app .a-press {
      inline-size: calc(100% + var(--sp-4));
      margin-inline-end: calc(-1 * var(--sp-2));
    }

    /* A ROW'S PRESSES WAIT UNTIL IT IS OPEN: eight rows of two buttons each is the page this replaced. */
    .a-app:not([data-open]) .a-acts {
      display: none;
    }

    .a-acts {
      justify-content: flex-end;
      padding-block: var(--sp-1) var(--sp-2);
    }

    .a-caret {
      display: inline-flex;
    }

    .a-when {
      margin-inline-start: auto;
    }

    .a-mail {
      display: none;
    }

    /* OPEN, THE ADDRESS TAKES A LINE OF ITS OWN under the name, its date and its caret. */
    [data-open] > .a-press .a-mail {
      display: block;
      flex: 1 1 100%;
      order: 1;
    }

    [data-open] > .a-press .a-top {
      flex-wrap: wrap;
    }

    .a-ask-said {
      flex-basis: 100%;
    }

    .a-twice-word,
    .a-maker {
      display: none;
    }

    .a-ver {
      margin-inline-start: auto;
      order: 1;
    }

    .a-twice {
      order: 0;
    }

    .a-go {
      order: 2;
    }

    .a-line {
      flex-wrap: wrap;
      flex-basis: 100%;
    }

    .a-line-mail {
      flex: 1 1 100%;
    }

    .a-line-note {
      flex: 1 1 0;
    }

    /* THE LABEL TAKES THE ROW, with what the columns said in a line under it. The head is still there to be heard. */
    .a-codes {
      table-layout: auto;
    }

    .a-codes :global(td.c-label) {
      inline-size: 100%;
    }

    .a-codes thead {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }

    .a-codes th.c-made,
    .a-codes th.c-ends,
    .a-codes th.c-state,
    .a-codes :global(td.c-made),
    .a-codes :global(td.c-ends),
    .a-codes :global(td.c-state) {
      display: none;
    }

    .a-codes th.c-act {
      inline-size: 60px;
    }

    .a-codes :global(tbody tr:first-child) {
      border-block-start: 0;
    }

    .c-said {
      overflow-wrap: anywhere;
      white-space: normal;
    }

    .c-sub {
      display: block;
    }

    .a-codes :global(td) {
      block-size: 52px;
      padding-block: var(--sp-1);
    }
  }

  /* 44 UNDER A THUMB, in full and not only by the hit box: this page's presses sit close together. */
  @media (width < 640px) {
    .a-more,
    .a-weeks,
    .a-page :global(.btn) {
      min-block-size: var(--tap);
    }

    .a-acts :global(.btn),
    .a-ask :global(.btn) {
      min-inline-size: var(--tap);
    }

    /* THE HEAD KEEPS WEEKS' ROOM before Weeks is there, so nothing moves when a slow funnel lands. */
    :global(.tile.a-way > .tile-head) {
      min-block-size: var(--tap);
    }
  }
</style>
