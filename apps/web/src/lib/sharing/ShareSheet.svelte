<!--
  The Share sheet: share a project, a list, the rows a view shows, or one row, with somebody here,
  a group or an email, in one sheet sized for a phone. A bottom sheet under a thumb and a drawer at the window's end
  edge from 900 up, as every `Sheet.svelte` is.

  SIX FIELDS AND A SENTENCE. With, Can, What, Hide, Until and More, then the share said back as one sentence and how
  much they would see now. ON A PHONE IT FOLDS TO THREE: With, Can and Until, and one "More choices" row under them that
  opens the templates, What, Hide and More in place. It opens by itself when one of them already holds a choice (a
  template, a view's rows, a hidden field, or a share being changed), so a choice is never folded out of sight; the
  sentence under them always says the whole share. The sentence is drawn from what the browser holds as the choices change, and the record's
  `sharePreview` replaces it and counts what it reaches when it lands (`share-state.ts`). Chips at the top fill the
  fields from the kernel's templates (`templates.ts`).

  AN EMAIL IS SHARED, THEN INVITED: the shares wait for the address, and the link that joins them is shown here once to
  be sent (`sheet-api.ts`). Nothing is mailed.

  NO SIGN-IN WALL. A share with no end, or Edit or Manage for somebody new, may be answered "confirm it's you" by the
  record (§6, default 1), and the confirm is a passkey asked for inside this sheet (`confirmInline`); nothing was kept
  until it passes, and the share is sent again when it does.

  ONLY WHERE IT CAN SHARE. Sharing is an owner's or an Admin's, so the trigger and the sheet are drawn for nobody else,
  and never while the record is seen as somebody.

  TWO WAYS IN, as `HandSheet.svelte` has: a menu binds `open`, and a header asks for `trigger`, which draws the button.
-->
<script lang="ts">
  import { RUNG_LINES } from './roles.ts';
  import { page } from '$app/state';
  import { untrack } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import { apiBase } from '$lib/at.ts';
  import { confirmInline } from '$lib/auth.ts';
  import { put } from '$lib/clipboard.ts';
  import { copy } from '$lib/copy.ts';
  import { labelOf } from '$lib/record/api.ts';
  import { recordNow, type Shell } from '$lib/record/boot-live.ts';
  import { REGISTERS } from '$lib/record/held.ts';
  import { inviteLink } from '$lib/record/settings-write.ts';
  import Button from '$lib/ui/Button.svelte';
  import Face from '$lib/ui/Face.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Segmented from '$lib/ui/Segmented.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import ConditionPicker from './ConditionPicker.svelte';
  import { enterSeeAs, seeingAs } from './see-as.svelte.ts';
  import { moneyInText } from '$lib/record/money.ts';
  import {
    amountsOffered,
    amountsPressed,
    canShare,
    chipPressed,
    isEmail,
    listsOf,
    offersOf,
    ready,
    seenSaid,
    sentenceOf,
    sharesOf,
    startOf,
    stateOfShare,
    UNTILS,
    withPicked,
    type Decls,
    type KeptShare,
    type SheetState,
    type Subject,
    type With,
  } from './share-state.ts';
  import { asksConfirm, sheetApi, type Got, type Group, type Here, type Preview } from './sheet-api.ts';
  import { chipsFor } from './templates.ts';
  import { SHARED_EVENT } from './sharing.ts';
  import DayBox from '../ui/DayBox.svelte';

  let {
    open = $bindable(false),
    subject,
    trigger,
    change,
    who,
  }: {
    open?: boolean | undefined;
    subject: Subject;
    /** The button's words, for a header that draws it; absent, a menu opens the sheet by binding `open`. */
    trigger?: string | undefined;
    /** A share kept, to change: the sheet opens on what it holds, who it is with stays, and Share saves it in place. */
    change?: (KeptShare & { id: string }) | undefined;
    /** Somebody to share with, already picked as the sheet opens, once the record has said who is here. */
    who?: { kind: string; id: string } | undefined;
  } = $props();

  const shell = $derived(page.data as unknown as Shell);
  const allowed = $derived(seeingAs() === null && canShare(shell.me));
  const decls = REGISTERS as unknown as Decls;
  const uid = $props.id();
  const RUNGS = ['view', 'comment', 'edit', 'manage'] as const;

  let api: ReturnType<typeof sheetApi> | null = null;
  const ask = () => (api ??= sheetApi(apiBase()));

  /* ── what the sheet holds ───────────────────────────────────────────────────────────────────────────────────── */

  let now = $state(recordNow());
  /* THE SUBJECT AS IT OPENED, its id filled in once the record says it; every opening takes it afresh (`opened`). */
  let held = $state<Subject>(untrack(() => subject));
  let s = $state<SheetState>(startOf(untrack(() => subject)));
  let typed = $state('');
  let people = $state<Here[]>([]);
  let groups = $state<Group[]>([]);
  let previewed = $state<{ key: string; got: Got<Preview> } | null>(null);
  let busy = $state(false);
  let problem = $state<string | null>(null);
  let confirming = $state(false);
  let link = $state<{ email: string; href: string; sent: boolean; unsent: string | null } | null>(null);

  /* ── the fold: three choices on a phone ── */
  const phone = new MediaQuery('(width < 640px)');
  let unfolded = $state(false);
  /* A CHOICE ALREADY MADE IN A FOLDED FIELD keeps the fold open, so nothing chosen is hidden. Amounts is never folded
     (it stands under Can wherever the share reaches money), so it is no reason to open the rest. */
  const chosen = $derived(s.template !== null || s.what.kind !== 'all' || Object.values(s.hide.fields).some((f) => f.length > 0) || change !== undefined);
  const folded = $derived(phone.current && !unfolded && !chosen);

  /* EVERY OPENING STARTS AFRESH, and reads who is here then, since that changes between two presses. */
  async function opened() {
    now = recordNow();
    held = subject;
    s = change ? stateOfShare(change, subject) : startOf(subject);
    typed = '';
    previewed = null;
    problem = null;
    confirming = false;
    link = null;
    unfolded = false;
    const me = String(shell.me?.person ?? '');
    const asked = who;
    void ask()
      .people(me)
      .then((got) => {
        people = got;
        const p = asked?.kind === 'person' ? got.find((x) => x.id === asked.id) : undefined;
        if (p && s.with === null) pick({ kind: 'person', id: p.id, name: p.name, team: p.team });
      });
    void ask()
      .groups()
      .then((got) => {
        groups = got;
        /* A GROUP'S SIZE, for the share being changed, or the group the ask named. */
        const w = s.with;
        if (w?.kind === 'group') {
          const g = got.find((x) => x.id === w.id);
          if (g) s = { ...s, with: { ...w, people: g.people } };
        }
        const g = asked?.kind === 'group' ? got.find((x) => x.id === asked.id) : undefined;
        if (g && s.with === null) pick({ kind: 'group', id: g.id, name: g.name, people: g.people });
      });
    if (asked?.kind === 'email' && !change && isEmail(asked.id)) pick({ kind: 'email', email: asked.id });
    if ((subject.kind === 'project' || subject.kind === 'row') && subject.id === null) {
      const id = await ask().idOf(subject.kind === 'project' ? subject.register : subject.list, subject.seq);
      if (id !== null) held = { ...subject, id } as Subject;
    }
  }
  let was = false;
  $effect(() => {
    if (open && !was) void opened();
    was = open;
  });

  /* ── With ───────────────────────────────────────────────────────────────────────────────────────────────── */

  const needle = $derived(typed.trim().toLowerCase());
  const peopleOffered = $derived(needle === '' ? people : people.filter((p) => p.name.toLowerCase().includes(needle) || (p.email ?? '').toLowerCase().includes(needle)));
  const groupsOffered = $derived(needle === '' ? groups : groups.filter((g) => g.name.toLowerCase().includes(needle)));
  /* AN ADDRESS SOMEBODY HERE ALREADY HAS is them, not a stranger: they are offered by name instead. */
  const emailOffered = $derived(isEmail(typed) && !people.some((p) => (p.email ?? '').toLowerCase() === needle) ? needle : null);

  function pick(w: With) {
    s = withPicked(s, w, now);
    typed = '';
    problem = null;
  }

  const whoName = (w: With): string => (w.kind === 'email' ? w.email : w.name);

  /* ── What ───────────────────────────────────────────────────────────────────────────────────────────────── */

  /** The lists a project reaches: every list with a project field, as the record reads it (`scopeField`). */
  const inProject = $derived(
    held.kind === 'project'
      ? Object.entries(decls)
          .filter(([id, d]) => id !== (held as { register: string }).register && d?.fields.some((f) => (f as { scope?: unknown }).scope !== undefined && !f.retired))
          .map(([id]) => id)
      : [],
  );
  const listName = (id: string): string => decls[id]?.name ?? id;

  /** The What picker's value: the template's, all, a view's, a condition, or one list of a project. */
  const whatPick = $derived.by(() => {
    if (s.template !== null) return 'template';
    if (s.what.kind === 'list') return `list:${s.what.list}`;
    if (s.what.kind === 'where') return held.kind === 'list' && held.view && s.what.where === held.view.where ? 'view' : 'where';
    return 'all';
  });
  let picking = $state(false);

  function whatChosen(v: string) {
    const base = { ...s, template: null };
    if (v === 'all') s = { ...base, what: { kind: 'all' } };
    else if (v === 'view' && held.kind === 'list' && held.view) s = { ...base, what: { kind: 'where', where: held.view.where } };
    else if (v === 'where') s = { ...base, what: { kind: 'where', where: null } };
    else if (v.startsWith('list:')) s = { ...base, what: { kind: 'list', list: v.slice(5) } };
    picking = v === 'where';
  }

  /* ── Hide ───────────────────────────────────────────────────────────────────────────────────────────────── */

  const reached = $derived(listsOf(s, held, decls, inProject));
  const hideable = $derived(
    reached.flatMap((l) =>
      (decls[l]?.fields ?? [])
        .filter((f) => !f.retired && f.id !== decls[l]?.title && !(s.hide.amounts && f.type === 'money'))
        .map((f) => ({ list: l, field: f.id, label: reached.length > 1 ? `${listName(l)}: ${labelOf(f as never)}` : labelOf(f as never) })),
    ),
  );
  const hidden = $derived(hideable.filter((h) => (s.hide.fields[h.list] ?? []).includes(h.field)));
  const hideMore = $derived(hideable.filter((h) => !(s.hide.fields[h.list] ?? []).includes(h.field)));

  function hideField(list: string, field: string, on: boolean) {
    const now = s.hide.fields[list] ?? [];
    const next = on ? [...now, field] : now.filter((f) => f !== field);
    s = { ...s, hide: { ...s.hide, fields: { ...s.hide.fields, [list]: next } } };
  }

  /* ── the share, said ────────────────────────────────────────────────────────────────────────────────────── */

  const shares = $derived(sharesOf(s, held, now, decls));
  const key = $derived(JSON.stringify(shares));
  const landed = $derived(previewed !== null && previewed.key === key ? previewed.got : null);
  const sentence = $derived(landed?.ok && shares.length === 1 ? landed.value.sentence : sentenceOf(shares, s, held, now, decls));
  /* WHAT THEY WILL SEE, MONEY INCLUDED: the lists it reaches, and the project's own figures or that amounts are hidden. */
  const counted = $derived(landed?.ok && s.with ? seenSaid(s.with, held, landed.value.lists, landed.value.money ?? null, s.hide, (x) => moneyInText(x)) : null);
  /* AMOUNTS IS OFFERED WHEREVER THE SHARE REACHES MONEY: what the browser knows of the lists, or what the record says it shows. */
  const moneyHere = $derived(amountsOffered(s, reached, decls) || (landed?.ok === true && (landed.value.money ?? null) !== null));
  const refusedSaid = $derived(landed && !landed.ok ? landed.fix : null);
  const canSend = $derived(ready(s, held, now) && !busy && refusedSaid === null);

  /* ASKED A BEAT AFTER THE LAST CHANGE, so typing a date or a value asks once, and an answer for an older choice is dropped. */
  $effect(() => {
    const asked = key;
    const first = shares[0];
    if (!open || first === undefined) return;
    const timer = setTimeout(() => {
      void ask()
        .preview(first)
        .then((got) => {
          if (asked === key) previewed = { key: asked, got };
        });
    }, 250);
    return () => clearTimeout(timer);
  });

  /* ── Share ──────────────────────────────────────────────────────────────────────────────────────────────── */

  async function send() {
    if (!canSend || s.with === null) return;
    busy = true;
    problem = null;
    const w = s.with;
    const out = await ask().send(shares, s.template, change?.id);
    if (!out.ok) {
      busy = false;
      if (asksConfirm(out)) confirming = true;
      else problem = out.fix;
      return;
    }
    confirming = false;
    toasts.push(out.value.sentence || sentence);
    /* SAID ON THE WINDOW, so a screen listing shares (Settings > Sharing) reads them again. */
    dispatchEvent(new CustomEvent(SHARED_EVENT, { detail: { ids: out.value.ids } }));
    if (w.kind === 'email') {
      const email = w.email.trim().toLowerCase();
      const made = await ask().invite(email);
      busy = false;
      if (made.ok) {
        /* MAILED TO THEM AT ONCE (collab pass, 2 Nov), the proof inside it for an address new here; the link stays to copy. */
        const sent = await import('$lib/auth.ts').then(({ sendInvite }) => sendInvite(made.value)).catch(() => null);
        /* NOT MAILED, the host's own sentence says why when it gave one (a self-host with no mail set up). */
        const unsent = sent && !sent.ok && sent.kind === 'refused' && sent.fix ? sent.fix : null;
        link = { email, href: inviteLink(location.origin, made.value), sent: sent?.ok === true, unsent };
        return;
      }
      toasts.push(copy.shareLinkMissed(email), { intent: 'warn' });
    }
    busy = false;
    open = false;
  }

  async function confirm() {
    busy = true;
    const proved = await confirmInline().catch(() => false);
    busy = false;
    if (!proved) {
      problem = copy.shareConfirmFailed;
      return;
    }
    confirming = false;
    await send();
  }

  function seeAs() {
    if (s.with?.kind !== 'person') return;
    enterSeeAs({ id: s.with.id, name: s.with.name });
  }

  /* ── More ───────────────────────────────────────────────────────────────────────────────────────────────── */

  const MORE = ['weekdays', 'once', 'withAgents', 'remove'] as const;
  const moreSaid = { weekdays: copy.shareWeekdays, once: copy.shareOnce, withAgents: copy.shareAgents, remove: copy.shareDelete } as const;
  function flip(k: (typeof MORE)[number]) {
    s = { ...s, [k]: !s[k] };
  }

  /* A SHARE BEING CHANGED KEEPS ITS TARGET, so no chip offers to write another. */
  const chips = $derived(held.kind === 'held' ? [] : chipsFor(offersOf(held)));
  const title = $derived(change ? copy.shareSheetChange : copy.shareSheetTitle(held.name));
  /* EVERY LIST, for a share of the record from the Sharing page: everything, or one list. The rail's lists, which the
     shell always holds, with any declaration the tab has read beside them. */
  const everyList = $derived.by(() => {
    if (held.kind !== 'record') return [];
    const names = new Map<string, string>((shell.lists ?? []).map((l) => [l.id, l.name]));
    for (const [id, d] of Object.entries(decls)) if (d !== undefined && !names.has(id)) names.set(id, d.name);
    return [...names].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  });
</script>

{#if allowed}
  {#if trigger}
    <Button onclick={() => (open = true)}><Icon name="external" size="s" />{trigger}</Button>
  {/if}

  <Sheet bind:open {title}>
    {#if link}
      <!-- THE LINK IS SHOWN ONCE: the record keeps only its hash, so closing the sheet forgets it. -->
      <div class="share-link">
        <p class="share-said">{link.sent ? copy.inviteEmailed(link.email) : link.unsent ? `${copy.shareLinkSaid(link.email)} ${link.unsent}` : copy.shareLinkSaid(link.email)}</p>
        <label class="field-label" for="{uid}-link">{copy.shareLinkLabel}</label>
        <span class="field"><input id="{uid}-link" class="field-input" readonly value={link.href} /></span>
        <div class="share-acts">
          <Button weight={link.sent ? 'quiet' : 'primary'} onclick={() => void put(link?.href ?? '', copy.shareLinkCopy, copy.shareLinkCopied)}><Icon name="copy" size="s" />{copy.shareLinkCopy}</Button>
          <Button weight={link.sent ? 'primary' : undefined} onclick={() => (open = false)}>{copy.done}</Button>
        </div>
      </div>
    {:else}
      <div class="share">
        {#if chips.length > 0 && !folded}
          <div class="share-chips" role="group" aria-label={copy.shareTemplatesLabel}>
            {#each chips as t (t.id)}
              <button
                type="button"
                class="share-chip tap"
                aria-pressed={s.template === t.id ? 'true' : 'false'}
                data-on={s.template === t.id ? '' : undefined}
                onclick={() => {
                  s = chipPressed(s, t.id, now);
                  picking = s.what.kind === 'where' && s.what.where === null;
                }}>{copy.shareTemplateNames[t.id] ?? t.name}</button
              >
            {/each}
          </div>
        {/if}

        <!-- WITH: somebody here, a group, or an email typed in. -->
        <div class="share-row">
          <span class="share-label" id="{uid}-with">{copy.shareWithLabel}</span>
          <div class="share-control">
            {#if s.with}
              <div class="share-who">
                <Face name={whoName(s.with)} size="s" kind="person" />
                <span class="share-who-name">{s.with.kind === 'group' ? copy.shareWithGroupSaid(s.with.name, s.with.people) : whoName(s.with)}</span>
                {#if !change}
                  <button type="button" class="share-x tap" aria-label={copy.shareWithChange(whoName(s.with))} title={copy.shareWithChange(whoName(s.with))} onclick={() => (s = { ...s, with: null })}
                    ><Icon name="close" size="s" /></button
                  >
                {/if}
              </div>
            {:else}
              <span class="field">
                <input
                  class="field-input"
                  type="text"
                  inputmode="email"
                  autocomplete="off"
                  aria-labelledby="{uid}-with"
                  placeholder={copy.shareWithHint}
                  bind:value={typed}
                  onkeydown={(e) => {
                    if (e.key === 'Enter' && emailOffered) {
                      e.preventDefault();
                      pick({ kind: 'email', email: emailOffered });
                    }
                  }}
                />
              </span>
              <ul class="share-offers" aria-labelledby="{uid}-with">
                {#if emailOffered}
                  <li><button type="button" class="share-offer" onclick={() => pick({ kind: 'email', email: emailOffered ?? '' })}><Icon name="plus" size="s" /><span>{copy.shareWithInvite(emailOffered)}</span></button></li>
                {/if}
                {#each peopleOffered.slice(0, 6) as p (p.id)}
                  <li><button type="button" class="share-offer" onclick={() => pick({ kind: 'person', id: p.id, name: p.name, team: p.team })}><Face name={p.name} size="s" kind="person" /><span>{p.name}</span></button></li>
                {/each}
                {#each groupsOffered.slice(0, 4) as g (g.id)}
                  <li>
                    <button type="button" class="share-offer" onclick={() => pick({ kind: 'group', id: g.id, name: g.name, people: g.people })}
                      ><Face name={g.name} size="s" kind="person" /><span>{copy.shareWithGroupSaid(g.name, g.people)}</span></button
                    >
                  </li>
                {/each}
                {#if needle !== '' && !emailOffered && peopleOffered.length === 0 && groupsOffered.length === 0}
                  <li class="share-none">{copy.shareWithNobody}</li>
                {/if}
              </ul>
            {/if}
          </div>
        </div>

        <!-- CAN: the four rungs. -->
        <div class="share-row">
          <span class="share-label" id="{uid}-can">{copy.shareCanLabel}</span>
          <div class="share-control">
            <Segmented role="group" aria-labelledby="{uid}-can">
              {#each RUNGS as r (r)}
                <button type="button" class="segment" data-on={s.can === r ? '' : undefined} aria-pressed={s.can === r ? 'true' : 'false'} onclick={() => (s = { ...s, can: r })}
                  >{copy.shareRungs[r]}</button
                >
              {/each}
            </Segmented>
            <!-- WHAT THE RUNG LETS THEM DO, one line under it (collab pass, 2 Nov), in the words Who can do what uses. -->
            <p class="share-rung-line">{RUNG_LINES[s.can] ?? ''}</p>
          </div>
        </div>

        <!-- WHAT: all of it, one list of a project, the rows a view shows, or a condition. One row is itself. -->
        {#if !folded}
        <div class="share-row">
          <label class="share-label" for="{uid}-what">{copy.shareWhatLabel}</label>
          <div class="share-control">
            {#if (held.kind === 'row' || held.kind === 'held') && s.template === null}
              <p class="share-fixed" id="{uid}-what">{held.name}</p>
            {:else}
              <select id="{uid}-what" class="share-select" value={whatPick} onchange={(e) => whatChosen(e.currentTarget.value)}>
                {#if s.template !== null}<option value="template">{copy.shareWhatTemplate}</option>{/if}
                {#if held.kind === 'row' || held.kind === 'held'}
                  <option value="all">{held.name}</option>
                {:else if held.kind === 'record'}
                  <option value="all">{copy.shareWhatEverything}</option>
                  {#each everyList as l (l.id)}<option value="list:{l.id}">{l.name}</option>{/each}
                {:else if held.kind === 'project'}
                  <option value="all">{copy.shareWhatAll(held.name)}</option>
                  {#each inProject as l (l)}<option value="list:{l}">{copy.shareWhatList(listName(l), held.name)}</option>{/each}
                {:else}
                  <option value="all">{copy.shareWhatAll(held.name)}</option>
                  {#if held.view}<option value="view">{copy.shareWhatView}</option>{/if}
                  <option value="where">{copy.shareWhatOnly(held.name.toLowerCase())}</option>
                {/if}
              </select>
              {#if held.kind === 'list' && s.what.kind === 'where' && (picking || whatPick === 'where')}
                <ConditionPicker
                  list={held.list}
                  bind:where={() => (s.what.kind === 'where' ? s.what.where : null), (w) => (s = { ...s, what: { kind: 'where', where: w ?? null } })}
                />
              {/if}
            {/if}
          </div>
        </div>

        {/if}

        <!-- HIDE: every amount, or named fields. A title is never hidden. AMOUNTS IS NEVER FOLDED: wherever the share
             reaches money it stands here on a phone too, on for anybody outside his team until he turns it off. -->
        {#if moneyHere || (!folded && hideable.length > 0)}
          <div class="share-row">
            <span class="share-label" id="{uid}-hide">{copy.shareHideLabel}</span>
            <div class="share-control share-wrap" role="group" aria-labelledby="{uid}-hide">
              {#if moneyHere}
                <button
                  type="button"
                  class="share-chip tap"
                  aria-pressed={s.hide.amounts ? 'true' : 'false'}
                  data-on={s.hide.amounts ? '' : undefined}
                  data-share-amounts
                  onclick={() => (s = amountsPressed(s))}>{copy.shareHideAmounts}</button
                >
              {/if}
              {#if !folded}
              {#each hidden as h (`${h.list}.${h.field}`)}
                <button type="button" class="share-chip tap" data-on="" aria-label={copy.shareHideShown(h.label)} onclick={() => hideField(h.list, h.field, false)}
                  >{h.label}<Icon name="close" size="s" /></button
                >
              {/each}
              {#if hideMore.length > 0}
                <select
                  class="share-select share-hide-more"
                  aria-label={copy.shareHideField}
                  value=""
                  onchange={(e) => {
                    const [l, f] = e.currentTarget.value.split('\u0000');
                    if (l && f) hideField(l, f, true);
                    e.currentTarget.value = '';
                  }}
                >
                  <option value="">{copy.shareHideField}</option>
                  {#each hideMore as h (`${h.list}.${h.field}`)}<option value="{h.list}{'\u0000'}{h.field}">{h.label}</option>{/each}
                </select>
              {/if}
              {/if}
            </div>
          </div>
        {/if}

        <!-- UNTIL: five lengths, a picked day among them. An email starts at 30 days. -->
        <div class="share-row">
          <span class="share-label" id="{uid}-until">{copy.shareUntilLabel}</span>
          <div class="share-control">
            <Segmented role="group" aria-labelledby="{uid}-until" class="share-until">
              {#each UNTILS as u (u)}
                <button
                  type="button"
                  class="segment"
                  data-on={s.until.kind === u ? '' : undefined}
                  aria-pressed={s.until.kind === u ? 'true' : 'false'}
                  onclick={() => (s = { ...s, until: u === 'day' ? { kind: 'day', day: s.until.kind === 'day' ? s.until.day : '' } : { kind: u } })}>{copy.shareUntil[u]}</button
                >
              {/each}
            </Segmented>
            {#if s.until.kind === 'day'}
              <label class="field-label share-day-label" for="{uid}-day">{copy.shareUntilDay}</label>
              <!-- THE RECORD'S WORDS FOR A DAY ("2 Dec 2026"), typed where it is drawn (`DayBox`), and never the browser's own
                   control, which said "02/12/2026" or "12/02/2026" by the machine's language (collab pass 2). A day that
                   does not read, or is not after today in the record's zone, keeps Share from sending (`canSend`). -->
              <span class="share-day">
                <DayBox
                  id="{uid}-day"
                  label={copy.shareUntilDay}
                  bind:value={() => (s.until.kind === 'day' ? s.until.day : ''), (v) => (s = { ...s, until: { kind: 'day', day: v ?? '' } })}
                />
              </span>
            {/if}
          </div>
        </div>

        <!-- THE FOLD'S ONE ROW, on a phone: the rest of the choices, opened in place. -->
        {#if folded}
          <button type="button" class="share-unfold tap" aria-expanded="false" data-share-unfold onclick={() => (unfolded = true)}>
            <span class="share-unfold-words"><span class="share-unfold-name">{copy.shareMoreChoices}</span><span class="share-unfold-said">{copy.shareMoreChoicesSaid}</span></span>
            <Icon name="chevronDown" size="s" />
          </button>
        {/if}

        <!-- MORE: hours, once, their agents, and delete where they can change things. -->
        {#if !folded}
        <div class="share-row">
          <span class="share-label" id="{uid}-more">{copy.shareMoreLabel}</span>
          <ul class="share-control share-switches" aria-labelledby="{uid}-more">
            {#each MORE.filter((k) => k !== 'remove' || s.can === 'edit' || s.can === 'manage') as k (k)}
              <li class="share-switch">
                <span id="{uid}-m-{k}">{moreSaid[k]}</span>
                <button
                  type="button"
                  class="switch"
                  role="switch"
                  aria-checked={s[k]}
                  aria-labelledby="{uid}-m-{k}"
                  onclick={() => flip(k)}><span class="switch-track"></span></button
                >
              </li>
            {/each}
          </ul>
        </div>
        {/if}

        <!-- THE SHARE SAID BACK, and how much they would see now. -->
        <div class="share-preview" aria-live="polite">
          {#if refusedSaid}
            <p class="share-said share-refused">{refusedSaid}</p>
          {:else if sentence}
            <p class="share-said">{sentence}</p>
            {#if counted}<p class="share-count">{counted}</p>{:else if held.kind !== 'row' && !landed}<p class="share-count">{copy.shareCounting}</p>{/if}
          {/if}
          <p class="share-copy">{copy.shareCopyLine}</p>
          {#if problem}<p class="share-said share-refused" role="alert">{problem}</p>{/if}
          {#if confirming}
            <div class="share-confirm">
              <p class="share-count">{copy.shareConfirmWhy}</p>
              <Button weight="primary" disabled={busy} onclick={() => void confirm()}><Icon name="key" size="s" />{copy.shareConfirm}</Button>
            </div>
          {/if}
        </div>
      </div>
    {/if}

    {#snippet footer()}
      {#if !link}
        {#if s.with?.kind === 'person'}
          <Button weight="bare" onclick={seeAs}><Icon name="eye" size="s" />{copy.shareSeeAs(s.with.name)}</Button>
        {/if}
        <Button weight="primary" disabled={!canSend || confirming} aria-busy={busy} onclick={() => void send()}>{busy ? copy.shareSending : change ? copy.shareSave : copy.shareSend}</Button>
      {/if}
    {/snippet}
  </Sheet>
{/if}

<style>
  .share {
    display: grid;
    gap: var(--sp-4);
  }

  /* A LABEL BESIDE ITS CONTROL from 640 up, and over it on a phone, so the controls get the whole width there. */
  .share-row {
    display: grid;
    grid-template-columns: 4.5rem minmax(0, 1fr);
    align-items: start;
    gap: var(--sp-3);
  }

  .share-label {
    padding-block-start: 10px;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  .share-control {
    display: grid;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .share-wrap {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
  }

  @media (width < 640px) {
    .share-row {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--sp-1);
    }

    .share-label {
      padding-block-start: 0;
    }
  }

  /* THE TEMPLATE CHIPS AND THE HIDDEN FIELDS: a square-cornered toggle on the field's fill, the tile's colour when on. */
  .share-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .share-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    min-block-size: 36px;
    padding: 0 var(--sp-3);
    background: var(--tile-2);
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-ctl);
    cursor: pointer;
  }

  .share-chip[data-on] {
    background: var(--tile);
    outline: 1px solid var(--rule-strong);
    outline-offset: -1px;
    color: var(--ink);
  }

  .share-who {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: 40px;
  }

  .share-who-name {
    flex: 1;
    min-inline-size: 0;
    overflow-wrap: anywhere;
    font-weight: 500;
  }

  .share-x {
    display: inline-grid;
    place-items: center;
    inline-size: var(--tap);
    block-size: var(--tap);
    padding: 0;
    background: none;
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink-3);
    cursor: pointer;
  }

  .share-offers {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .share-offer {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    inline-size: 100%;
    min-block-size: var(--tap);
    padding: 0 var(--sp-2);
    background: none;
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-ctl);
    text-align: start;
    cursor: pointer;
  }

  .share-offer:hover,
  .share-offer:focus-visible,
  .share-x:hover,
  .share-x:focus-visible,
  .share-chip:hover {
    background: var(--hover);
  }

  .share-none,
  .share-fixed {
    margin: 0;
    padding-block: 10px;
    color: var(--ink-2);
    font-size: var(--fs-ctl);
  }

  .share-select {
    inline-size: 100%;
    min-inline-size: 0;
  }

  .share-hide-more {
    inline-size: auto;
    flex: 1 1 10rem;
  }

  .share-day-label {
    margin: 0;
  }

  /* THE DAY BOX, ITS LINE'S WIDTH: 16px and 44 tall under a thumb, as every box in the sheet is. */
  .share-day {
    display: flex;
    min-inline-size: 0;
  }

  @media (width < 900px) {
    .share-day :global(.day) {
      min-block-size: var(--tap);
      max-block-size: var(--tap);
      font-size: 16px;
    }
  }

  /* THE FIVE LENGTHS ON ONE LINE, at 390 and in the drawer: each takes what its words need, with a little less room
     round them than a segment's own, and none wraps inside itself. */
  .share-control :global(.share-until) {
    flex-wrap: nowrap;
  }

  .share-control :global(.share-until > .segment) {
    flex: 1 1 auto;
    min-inline-size: 0;
    padding-inline: var(--sp-2);
    white-space: nowrap;
  }

  .share-switches {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .share-switch {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    min-block-size: var(--tap);
    color: var(--ink);
    font-size: var(--fs-ctl);
  }

  /* THE FOLD'S ROW: a 48px row the width of the sheet, its name in the ink and what it holds in the quiet ink under it,
     a chevron at the end. */
  .share-unfold {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    inline-size: 100%;
    min-block-size: 48px;
    padding: var(--sp-2) var(--sp-3);
    background: var(--tile-2);
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    font: inherit;
    text-align: start;
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  .share-unfold:hover {
    background: var(--hover);
  }

  .share-unfold-words {
    display: grid;
    min-inline-size: 0;
  }

  .share-unfold-name {
    color: var(--ink);
    font-size: var(--fs-ctl);
    font-weight: 500;
  }

  .share-unfold-said {
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  /* THE SENTENCE IS THE SHEET'S ANSWER, so it sits on a rule of its own above Share, in the body's own ink. */
  .share-preview {
    display: grid;
    gap: var(--sp-1);
    padding-block-start: var(--sp-3);
    border-block-start: 1px solid var(--rule);
  }

  .share-said {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: var(--lh-body);
  }

  .share-refused {
    color: var(--red);
  }

  .share-count,
  .share-copy {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-ctl);
    line-height: var(--lh-body);
  }

  .share-copy {
    color: var(--ink-3);
  }

  .share-confirm {
    display: grid;
    justify-items: start;
    gap: var(--sp-2);
    margin-block-start: var(--sp-2);
  }

  .share-link {
    display: grid;
    gap: var(--sp-2);
  }

  .share-acts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin-block-start: var(--sp-2);
  }

  @media (pointer: coarse) {
    .share-chip,
    .share-select {
      min-block-size: var(--tap);
    }
  }

  .share-rung-line {
    margin: var(--sp-2) 0 0;
    font-size: var(--fs-meta);
    color: var(--ink-2);
    text-wrap: pretty;
  }
</style>
