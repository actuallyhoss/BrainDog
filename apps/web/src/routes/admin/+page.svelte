<!--
  Admin: `/admin`, the operator's page, which was admin.brain.dog. Shown only to the operator (`+page.ts`, and the
  Worker's `operator.ts` behind every door it calls), with no key and no second sign-in.

  FIVE CARDS, EACH ONE JOB. Applications to invite or decline; the plugins waiting for review, to approve or decline
  with a reason, and what people reported; inviting anyone by email; the sign-up codes already out, to end; and the
  last eight weeks of the way in. Each card says its own count; the head has no count line (the owner, 3 Nov: no briefs).

  EACH CARD READS ON ITS OWN (`Tile`'s `ready`), so a slow funnel never holds the applications back, and a card whose
  door failed says so inside itself with Retry, never as a page of its own.

  A STRANGER'S WORDS ARE TEXT. An application's name, use and link were typed by whoever applied: Svelte draws them as
  text, and a link is a link only when it is http(s).
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
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { put } from '$lib/clipboard.ts';
  import type { IconName } from '$lib/ui/icons.ts';
  import {
    REVIEW,
    day,
    door,
    linkSaid,
    plural,
    readApplications,
    readCodes,
    readFunnel,
    readReview,
    useSaid,
    webLink,
    type Answer,
    type Application,
    type Code,
    type Funnel,
    type Review,
    type Waiting,
  } from '$lib/admin/ops.ts';

  const words = {
    title: 'Admin',
    nothing: 'Nothing waits for you.',
    applications: 'Applications',
    noApplications: 'Nobody has applied yet.',
    invite: 'Invite',
    decline: 'Decline',
    declineSure: (name: string) => `Decline ${name}? They are not told.`,
    keep: 'Keep',
    applied: (d: string) => `Applied ${d}`,
    decided: (n: number) => `${n.toLocaleString('en-GB')} decided`,
    invitedMailed: (name: string) => `${name} is invited. The link is mailed.`,
    declined: (name: string) => `${name} is declined.`,
    review: 'Plugins to review',
    noReview: 'No plugin is waiting.',
    by: (who: string) => `By ${who}`,
    why: 'Reason, if you decline',
    whyNeeded: 'Say why in a line first.',
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
    note: 'Note for you',
    noteHelp: 'Only you see it, beside the code.',
    send: 'Send the invite',
    sending: 'Sending',
    noMail: 'The mail could not go. Send this link to that address yourself.',
    copy: 'Copy',
    copied: 'Link copied.',
    linkLabel: 'Invite link',
    codes: 'Sign-up codes',
    noCodes: 'No codes yet.',
    noNote: 'No note',
    end: 'End',
    ended: 'The code is ended.',
    made: (d: string) => `Made ${d}`,
    ends: (d: string) => `ends ${d}`,
    never: 'never ends',
    funnel: 'Last eight weeks',
    noWeeks: 'Nothing to count yet.',
    weekOf: 'Week of',
    thisWeek: 'This week',
    total: 'Total',
    noVisits: 'No visits were counted in these weeks.',
    short: (n: number) => `Only the first ${n.toLocaleString('en-GB')} records were asked, so the last two steps are short.`,
    missed: (n: number) => `${plural(n, 'record', 'records')} could not be asked.`,
    retry: 'Try again',
  } as const;

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
  const STEPS = [
    { key: 'seen', label: 'Visits' },
    { key: 'applied', label: 'Applied' },
    { key: 'invites_used', label: 'Invites used' },
    { key: 'signed_up', label: 'Signed up' },
    { key: 'agent', label: 'First agent' },
    { key: 'brief', label: 'First brief' },
  ] as const;

  /* ── the four reads, each its own card's ──────────────────────────────────── */

  type Card<T> = { at: 'waiting' } | { at: 'done'; value: T } | { at: 'failed'; fix: string };
  let applications = $state<Card<Application[]>>({ at: 'waiting' });
  let codes = $state<Card<Code[]>>({ at: 'waiting' });
  let review = $state<Card<Review>>({ at: 'waiting' });
  let funnel = $state<Card<Funnel>>({ at: 'waiting' });

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
  onMount(() => {
    void loadApplications();
    void loadCodes();
    void loadReview();
    void loadFunnel();
  });

  /* ── what waits (each card says its own count) ────────────────────────────────────── */

  const waitingApps = $derived(applications.at === 'done' ? applications.value.filter((a) => a.state === 'waiting') : []);
  const decidedApps = $derived(applications.at === 'done' ? applications.value.filter((a) => a.state !== 'waiting') : []);
  const pending = $derived(review.at === 'done' ? review.value.pending : []);

  /* ── applications ─────────────────────────────────────────────────────────── */

  let busy = $state<string | null>(null);
  let declining = $state<string | null>(null);
  let showDecided = $state(false);
  /** The invite link to send by hand when the mail could not go, by the application or form it came from. */
  let unsent = $state<{ from: string; link: string } | null>(null);

  async function inviteApplication(a: Application): Promise<void> {
    busy = a.id;
    const out = await door<{ link?: string; mailed?: boolean }>('/account/ops/applications', { invite: a.id });
    busy = null;
    if (!out.ok) {
      toasts.push(out.fix, { intent: 'warn' });
      return;
    }
    if (out.value.mailed === true) toasts.push(words.invitedMailed(a.name), { intent: 'good' });
    else unsent = { from: a.id, link: out.value.link ?? '' };
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
      inviteError = 'Add the address the link goes to.';
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

  let reasons = $state<Record<string, string>>({});
  let reasonError = $state<Record<string, string>>({});
  const keyOf = (w: Waiting): string => `${w.entry?.kind ?? ''}:${w.entry?.id ?? ''}@${w.version?.version ?? ''}`;
  const nameOf = (w: Waiting): string => String(w.entry?.title || w.entry?.id || 'This plugin');

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
    const reason = (reasons[key] ?? '').trim();
    if (verdict === 'refuse' && reason === '') {
      reasonError = { ...reasonError, [key]: words.whyNeeded };
      return;
    }
    reasonError = { ...reasonError, [key]: '' };
    busy = key;
    const out = await door(REVIEW, { kind: w.entry?.kind, id: w.entry?.id, version: w.version?.version, verdict, reason });
    busy = null;
    if (!out.ok) {
      toasts.push(out.fix, { intent: 'warn' });
      return;
    }
    toasts.push(verdict === 'list' ? words.approved(nameOf(w)) : words.refused(nameOf(w)), { intent: 'good' });
    void loadReview();
  }

  /* ── the funnel ──────────────────────────────────────────────────────────── */

  const weekSaid = (name: string, last: boolean): string => {
    if (last) return words.thisWeek;
    const at = new Date(`${name}T00:00:00Z`);
    return Number.isNaN(at.getTime()) ? name : at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  };
  const num = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? n : 0);
  const totals = $derived(funnel.at === 'done' ? STEPS.map((s) => funnel.at === 'done' ? funnel.value.weeks.reduce((t, w) => t + num(w[s.key]), 0) : 0) : []);
  const funnelNotes = $derived.by(() => {
    if (funnel.at !== 'done') return [];
    const f = funnel.value;
    const notes: string[] = [];
    if (f.weeks.length > 0 && (totals[0] ?? 0) === 0) notes.push(words.noVisits);
    if (f.more === true) notes.push(words.short(num(f.asked)));
    if (num(f.missed) > 0) notes.push(words.missed(num(f.missed)));
    return notes;
  });
</script>

<svelte:head><title>{titleOf(words.title)}</title></svelte:head>

<PageHead icon="lock" title={words.title} />

{#snippet failed(fix: string, retry: () => void)}
  <div class="a-failed" role="status">
    <Icon name="alert" size="m" />
    <span class="a-failed-said">{fix}</span>
    <Button weight="quiet" size="sm" onclick={retry}>{words.retry}</Button>
  </div>
{/snippet}

{#snippet sendYourself(link: string)}
  <div class="a-unsent" role="status">
    <p class="a-unsent-said">{words.noMail}</p>
    <div class="a-copy">
      <input class="input a-link num" type="text" readonly value={link} aria-label={words.linkLabel} onfocus={(e) => e.currentTarget.select()} />
      <Button weight="quiet" onclick={() => void copyLink(link)}><Icon name="copy" size="s" />{words.copy}</Button>
    </div>
  </div>
{/snippet}

<div class="page a-page">
  <div class="a-tiles">
    <!-- APPLICATIONS, WAITING FIRST. The decided ones fold under one line, so the card is about what needs him. -->
    <Tile data-wide="" lead icon="user-check" title={words.applications} count={waitingApps.length || undefined} ready={applications.at !== 'waiting'} rows={2} shape="applications">
      {#if applications.at === 'failed'}
        {@render failed(applications.fix, () => void loadApplications())}
      {:else if applications.at === 'done'}
        {#if applications.value.length === 0}
          <p class="a-none">{words.noApplications}</p>
        {:else}
          {#if waitingApps.length === 0}<p class="a-none">{words.nothing}</p>{/if}
          <ul class="a-rows">
            {#each waitingApps as a (a.id)}
              {@const link = webLink(a.link)}
              <li class="a-row">
                <div class="a-main">
                  <div class="a-line">
                    <span class="a-name">{a.name}</span>
                    <span class="a-meta a-email">{a.email}</span>
                  </div>
                  {#if a.use}<p class="a-use">{a.use}</p>{/if}
                  <div class="a-line a-meta">
                    <span>{words.applied(day(a.made_at))}</span>
                    {#if link}<a class="a-out" href={link} target="_blank" rel="noopener noreferrer"><Icon name="external" size="s" />{linkSaid(link)}</a>{:else if a.link}<span class="a-out-text">{a.link}</span>{/if}
                  </div>
                  {#if unsent?.from === a.id}{@render sendYourself(unsent.link)}{/if}
                </div>
                <div class="a-acts">
                  {#if declining === a.id}
                    <span class="a-ask">{words.declineSure(a.name)}</span>
                    <Button weight="quiet" size="sm" onclick={() => (declining = null)}>{words.keep}</Button>
                    <Button weight="quiet" tone="bad" size="sm" disabled={busy === a.id} onclick={() => void declineApplication(a)}>{words.decline}</Button>
                  {:else}
                    <Button weight="quiet" size="sm" disabled={busy === a.id} onclick={() => (declining = a.id)}>{words.decline}</Button>
                    <Button weight="primary" size="sm" disabled={busy === a.id} onclick={() => void inviteApplication(a)}>{words.invite}</Button>
                  {/if}
                </div>
              </li>
            {/each}
          </ul>
          {#if decidedApps.length > 0}
            <button type="button" class="a-fold tap" aria-expanded={showDecided} onclick={() => (showDecided = !showDecided)}>
              <span>{words.decided(decidedApps.length)}</span>
              <span class="a-caret" class:open={showDecided} aria-hidden="true"><Icon name="chevronDown" size="s" /></span>
            </button>
            {#if showDecided}
              <ul class="a-rows a-quiet">
                {#each decidedApps as a (a.id)}
                  {@const state = APPLIED[a.state] ?? { label: a.state, tone: undefined }}
                  <li class="a-row a-row-tight">
                    <div class="a-main">
                      <div class="a-line"><span class="a-name">{a.name}</span><span class="a-meta a-email">{a.email}</span></div>
                      {#if unsent?.from === a.id}{@render sendYourself(unsent.link)}{/if}
                    </div>
                    <div class="a-acts"><span class="a-meta">{day(a.made_at)}</span><Chip label={state.label} tone={state.tone} /></div>
                  </li>
                {/each}
              </ul>
            {/if}
          {/if}
        {/if}
      {/if}
    </Tile>

    <!-- THE REVIEW QUEUE: what each plugin adds, what of theirs it uses and what it reaches outside, as chips, so it is
         read before Approve. A reason is asked only for Decline. -->
    <Tile data-wide="" icon="plug" title={words.review} count={pending.length || undefined} ready={review.at !== 'waiting'} rows={2} shape="review">
      {#if review.at === 'failed'}
        {@render failed(review.fix, () => void loadReview())}
      {:else if review.at === 'done'}
        {#if pending.length === 0}<p class="a-none">{words.noReview}</p>{/if}
        <ul class="a-rows">
          {#each pending as w (keyOf(w))}
            {@const key = keyOf(w)}
            {@const adds = addsOf(w)}
            {@const uses = usesOf(w)}
            {@const calls = callsOf(w)}
            <li class="a-row a-plugin">
              <div class="a-main">
                <div class="a-line">
                  <span class="a-name">{nameOf(w)}</span>
                  {#if w.version?.version}<span class="a-meta num">{w.version.version}</span>{/if}
                  <span class="a-meta">{words.by(w.entry?.publisher?.name || 'someone')}</span>
                </div>
                {#if w.entry?.summary}<p class="a-use">{w.entry.summary}</p>{/if}
                <dl class="a-facts">
                  <dt>{words.adds}</dt>
                  <dd>{#if adds.length > 0}<ChipList items={adds} label={words.adds} />{:else}<span class="a-meta">{words.nothingOwn}</span>{/if}</dd>
                  <dt>{words.uses}</dt>
                  <dd>{#if uses.length > 0}<ChipList items={uses} label={words.uses} most={8} />{:else}<span class="a-meta">{words.onlyOwn}</span>{/if}</dd>
                  <dt>{words.calls}</dt>
                  <dd>{#if calls.length > 0}<ChipList items={calls} label={words.calls} most={6} />{:else}<span class="a-meta">{words.noCalls}</span>{/if}</dd>
                </dl>
                {#if (w.flags ?? []).length > 0 || (w.added ?? []).length > 0 || w.note?.text}
                  <ul class="a-notes">
                    {#each w.flags ?? [] as f, i (i)}<li class="a-note warn"><Icon name="alert" size="s" /><span><b>{words.look}.</b> {f}</span></li>{/each}
                    {#each w.added ?? [] as n, i (i)}<li class="a-note"><Icon name="plus" size="s" /><span><b>{words.isNew}.</b> {n}</span></li>{/each}
                    {#if w.note?.text}<li class="a-note"><Icon name="slash" size="s" /><span><b>{words.model}.</b> {w.note.text}</span></li>{/if}
                  </ul>
                {/if}
                <div class="a-decide">
                  <div class="a-why">
                    <Field id={`why-${key}`} label={words.why} error={reasonError[key] || null}>
                      {#snippet children({ describedBy, invalid })}
                        <input id={`why-${key}`} class="input" type="text" maxlength="300" autocomplete="off" value={reasons[key] ?? ''} oninput={(e) => (reasons = { ...reasons, [key]: e.currentTarget.value })} aria-describedby={describedBy} aria-invalid={invalid} />
                      {/snippet}
                    </Field>
                  </div>
                  <div class="a-acts a-acts-end">
                    <Button weight="quiet" size="sm" disabled={busy === key} onclick={() => void decide(w, 'refuse')}>{words.decline}</Button>
                    <Button weight="primary" size="sm" disabled={busy === key} onclick={() => void decide(w, 'list')}>{words.approve}</Button>
                  </div>
                </div>
              </div>
            </li>
          {/each}
        </ul>
        {#if review.value.reports.length > 0}
          <h3 class="a-sub">{words.reports}</h3>
          <ul class="a-rows a-quiet">
            {#each review.value.reports.slice(0, 20) as r, i (i)}
              <li class="a-row a-row-tight">
                <div class="a-main">
                  <div class="a-line"><span class="a-name">{r.id}</span>{#if r.version}<span class="a-meta num">{r.version}</span>{/if}</div>
                  <p class="a-use">{r.why}</p>
                </div>
                <div class="a-acts"><span class="a-meta">{words.by(r.by)}, {day(Date.parse(r.at))}</span></div>
              </li>
            {/each}
          </ul>
        {/if}
      {/if}
    </Tile>

    <!-- INVITE ANYONE: one address, one code, mailed. -->
    <Tile icon="user-plus" title={words.inviteTitle}>
      <form class="a-form" onsubmit={(e) => void sendInvite(e)} novalidate>
        <Field id="invite-email" label={words.email} error={inviteError}>
          {#snippet children({ describedBy, invalid })}
            <input id="invite-email" class="input" type="email" autocomplete="off" autocapitalize="off" spellcheck="false" bind:value={inviteEmail} aria-describedby={describedBy} aria-invalid={invalid} disabled={inviting} />
          {/snippet}
        </Field>
        <Field id="invite-note" label={words.note} help={words.noteHelp}>
          {#snippet children({ describedBy })}
            <input id="invite-note" class="input" type="text" autocomplete="off" maxlength="200" bind:value={inviteNote} aria-describedby={describedBy} disabled={inviting} />
          {/snippet}
        </Field>
        <div class="a-acts"><Button weight="primary" type="submit" disabled={inviting}>{inviting ? words.sending : words.send}</Button></div>
        {#if unsent?.from === 'form'}{@render sendYourself(unsent.link)}{/if}
      </form>
    </Tile>

    <!-- THE CODES ALREADY OUT, NEWEST FIRST. Never the code itself: it was shown once, when it was made. -->
    <Tile icon="key" title={words.codes} count={codes.at === 'done' ? codes.value.filter((c) => c.state === 'open' || c.state === 'held').length || undefined : undefined} ready={codes.at !== 'waiting'} rows={3} shape="codes">
      {#if codes.at === 'failed'}
        {@render failed(codes.fix, () => void loadCodes())}
      {:else if codes.at === 'done'}
        {#if codes.value.length === 0}
          <p class="a-none">{words.noCodes}</p>
        {:else}
          <ul class="a-rows a-codes">
            {#each codes.value as c (c.ref)}
              {@const state = CODE[c.state] ?? { label: c.state, tone: undefined }}
              <li class="a-row a-row-tight">
                <div class="a-main">
                  <div class="a-line"><span class="a-name a-clip">{noteSaid(c.note)}</span></div>
                  <div class="a-line a-meta">
                    <span>{words.made(day(c.made_at))}, {c.ends_at ? words.ends(day(c.ends_at)) : words.never}</span>
                    {#if c.state === 'spent' && c.made}<span>{c.made}</span>{/if}
                  </div>
                </div>
                <div class="a-acts">
                  <Chip label={state.label} tone={state.tone} />
                  {#if c.state === 'open' || c.state === 'held'}<Button weight="quiet" size="sm" disabled={busy === c.ref} onclick={() => void endCode(c)}>{words.end}</Button>{/if}
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      {/if}
    </Tile>

    <!-- THE WAY IN, A WEEK A ROW: the totals lead as figures, the weeks sit under them. -->
    <Tile data-wide="" icon="observe" title={words.funnel} ready={funnel.at !== 'waiting'} skeleton="table" rows={8} shape="funnel">
      {#if funnel.at === 'failed'}
        {@render failed(funnel.fix, () => void loadFunnel())}
      {:else if funnel.at === 'done'}
        {#if funnel.value.weeks.length === 0}
          <p class="a-none">{words.noWeeks}</p>
        {:else}
          <ul class="a-figures">
            {#each STEPS as s, i (s.key)}
              <li class="a-figure"><span class="a-figure-n num">{(totals[i] ?? 0).toLocaleString('en-GB')}</span><span class="a-figure-l">{s.label}</span></li>
            {/each}
          </ul>
          <div class="a-scroll" role="region" aria-label={words.funnel} tabindex="-1">
            <table class="a-weeks num">
              <thead>
                <tr><th scope="col">{words.weekOf}</th>{#each STEPS as s (s.key)}<th scope="col">{s.label}</th>{/each}</tr>
              </thead>
              <tbody>
                {#each funnel.value.weeks as w, i (w.week)}
                  <tr>
                    <th scope="row">{weekSaid(w.week, i === funnel.value.weeks.length - 1)}</th>
                    {#each STEPS as s (s.key)}<td class:zero={num(w[s.key]) === 0}>{num(w[s.key]).toLocaleString('en-GB')}</td>{/each}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          {#each funnelNotes as n, i (i)}<p class="a-meta a-foot">{n}</p>{/each}
        {/if}
      {/if}
    </Tile>
  </div>
</div>

<style>
  .a-page {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: var(--tile-gap);
    padding: var(--page-head-gap, 24px) var(--gutter) var(--page-bottom, 64px);
    max-inline-size: var(--page-max);
  }
  .a-tiles {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--tile-gap);
    align-items: start;
  }
  @container (inline-size >= 760px) {
    .a-tiles {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .a-tiles > :global([data-wide]) {
      grid-column: span 2;
    }
  }

  .a-none {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-body);
  }

  .a-rows {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .a-row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--sp-2) var(--sp-4);
    padding-block: var(--sp-3);
    border-block-start: 1px solid var(--rule);
    min-inline-size: 0;
  }
  .a-row:first-child {
    border-block-start: 0;
    padding-block-start: 0;
  }
  .a-row:last-child {
    padding-block-end: 0;
  }
  .a-row-tight {
    flex-wrap: nowrap;
    align-items: center;
  }
  .a-row-tight .a-main {
    flex: 1 1 0;
  }
  .a-row-tight .a-acts {
    flex: none;
  }
  .a-main {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    flex: 1 1 320px;
    min-inline-size: 0;
  }
  .a-line {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px var(--sp-2);
    min-inline-size: 0;
  }
  .a-name {
    font-size: var(--fs-body);
    font-weight: 500;
    color: var(--ink);
    overflow-wrap: anywhere;
  }
  .a-clip {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-inline-size: 100%;
  }
  .a-meta {
    font-size: var(--fs-meta);
    color: var(--ink-3);
    overflow-wrap: anywhere;
  }
  .a-line.a-meta {
    gap: 2px var(--sp-3);
  }
  .a-use {
    margin: 0;
    font-size: var(--fs-body);
    color: var(--ink-2);
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .a-out {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    color: var(--ink-2);
    text-decoration: none;
    overflow-wrap: anywhere;
  }
  .a-out:hover {
    color: var(--ink);
    text-decoration: underline;
  }
  .a-acts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--sp-2);
  }
  .a-ask {
    font-size: var(--fs-meta);
    color: var(--ink-2);
  }

  .a-fold {
    display: flex;
    align-items: center;
    gap: calc(6px * var(--dense, 1));
    margin-block-start: var(--sp-3);
    padding: calc(6px * var(--dense, 1)) 0;
    border: 0;
    background: none;
    color: var(--ink-3);
    font: inherit;
    font-size: var(--fs-meta);
    cursor: pointer;
  }
  .a-fold:hover {
    color: var(--ink);
  }
  .a-caret {
    display: inline-flex;
    transition: rotate var(--d-swap, 160ms) ease;
  }
  .a-caret.open {
    rotate: 180deg;
  }
  .a-quiet .a-name {
    font-weight: 400;
  }

  .a-sub {
    margin: calc(20px * var(--dense, 1)) 0 var(--sp-2);
    font-size: var(--fs-meta);
    font-weight: 600;
    color: var(--ink-2);
  }

  .a-facts {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-1) var(--sp-4);
    margin: var(--sp-2) 0 0;
  }
  .a-facts dt {
    font-size: var(--fs-meta);
    color: var(--ink-3);
  }
  .a-facts dd {
    margin: 0 0 calc(6px * var(--dense, 1));
    min-inline-size: 0;
  }
  @container (inline-size >= 600px) {
    .a-facts {
      grid-template-columns: 128px minmax(0, 1fr);
      align-items: baseline;
    }
    .a-facts dd {
      margin: 0;
    }
  }

  .a-notes {
    list-style: none;
    margin: var(--sp-2) 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: calc(6px * var(--dense, 1));
  }
  .a-note {
    display: flex;
    gap: var(--sp-2);
    align-items: flex-start;
    font-size: var(--fs-meta);
    color: var(--ink-2);
    overflow-wrap: anywhere;
  }
  .a-note :global(svg) {
    flex: none;
    margin-block-start: 2px;
  }
  .a-note.warn {
    color: var(--ink);
  }
  .a-note.warn :global(svg) {
    color: var(--warn);
  }
  .a-note b {
    font-weight: 600;
  }

  .a-decide {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: var(--sp-3) var(--sp-4);
    margin-block-start: var(--sp-3);
  }
  .a-why {
    flex: 1 1 280px;
    min-inline-size: 0;
  }
  .a-acts-end {
    margin-inline-start: auto;
  }

  .a-form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }
  .a-form .a-acts {
    justify-content: flex-start;
  }

  .a-unsent {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin-block-start: var(--sp-2);
    padding: var(--sp-3);
    border-radius: var(--r-field, 10px);
    background: var(--warn-tint);
  }
  .a-unsent-said {
    margin: 0;
    font-size: var(--fs-meta);
    color: var(--ink);
  }
  .a-copy {
    display: flex;
    gap: var(--sp-2);
    min-inline-size: 0;
  }
  .a-link {
    flex: 1 1 auto;
    min-inline-size: 0;
    font-size: var(--fs-meta);
  }

  .a-failed {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-3);
    color: var(--ink-2);
    font-size: var(--fs-body);
  }
  .a-failed :global(svg) {
    color: var(--warn);
  }
  .a-failed-said {
    flex: 1 1 200px;
  }

  .a-figures {
    list-style: none;
    margin: 0 0 var(--sp-4);
    padding: 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--sp-4);
  }
  @container (inline-size >= 760px) {
    .a-figures {
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }
  }
  .a-figure {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-inline-size: 0;
  }
  .a-figure-n {
    font-size: var(--fs-figure);
    font-weight: 600;
    line-height: 1.1;
    color: var(--ink);
  }
  .a-figure-l {
    font-size: var(--fs-meta);
    color: var(--ink-3);
  }

  .a-scroll {
    overflow-x: auto;
    margin-inline: calc(-1 * var(--tile-pad, 16px));
    padding-inline: var(--tile-pad, 16px);
    outline: none;
  }
  .a-weeks {
    border-collapse: collapse;
    inline-size: 100%;
    min-inline-size: 560px;
    font-size: var(--fs-meta);
  }
  .a-weeks th,
  .a-weeks td {
    padding: var(--sp-2) 0 var(--sp-2) var(--sp-3);
    text-align: end;
    white-space: nowrap;
    font-weight: 400;
  }
  .a-weeks th:first-child {
    text-align: start;
    padding-inline-start: 0;
  }
  .a-weeks thead th {
    color: var(--ink-3);
  }
  .a-weeks tbody tr {
    border-block-start: 1px solid var(--rule);
  }
  .a-weeks tbody th {
    color: var(--ink-2);
  }
  .a-weeks td {
    color: var(--ink);
  }
  .a-weeks td.zero {
    color: var(--ink-3);
  }
  .a-foot {
    margin: var(--sp-2) 0 0;
  }
</style>
