<!--
  Settings.

  The theme control is a THREE-WAY SEGMENT, not a toggle offering the opposite. The predecessor's
  had three states and a one-way UI: once a person chose light or dark, only clearing local storage
  restored "match the system". "Match the system" must stay reachable (19 §4).

  Density switches on POINTER, never on width — a small laptop window is not a phone. Width may
  change layout; only the pointer may change size (05 §6).

  And `Character keys: off` disables the entire bare-letter namespace while leaving every modifier
  chord working. It is GitHub's checkbox, and the only shipped WCAG 2.1.4 conformance mechanism
  found across eleven precedents (19 §4).
-->
<script lang="ts">
  import { titleOf } from '$lib/title.ts';
  import { page } from '$app/state';
  import * as pref from '$lib/pref.ts';
  import { ACCENTS, apply as accentApply } from '$lib/accent.ts';
  import { copy } from '$lib/copy.ts';
  import * as clipboard from '$lib/clipboard.ts';
  import type { PageDecl } from '$lib/record/schema.ts';
  import { dismiss as dismissNavRec, dismissedFor, signatureOf } from '$lib/design/dismissed.ts';
  import { navShapeSignals, recommendNavShape, type NavShape, type NavShapeRecommendation } from '$lib/design/nav-shape.ts';
  /* Type only, so the client's route table stays out of this chunk. */
  import type { Shell } from '$lib/record/boot-live.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import {
    AUTH_METHODS, DEPLOYMENT, DEVICES, NOW, PACKS, PAGES, PASSKEYS, PEOPLE_ACCESS,
    REGISTERS, SIGNING_KEY, SNAPSHOTS, SNAPSHOTS_KEPT, SOURCES, TOKENS, pages,
  } from '$lib/record/api.ts';
  import { LEVELS, type Level, type Person } from '$lib/record/schema.ts';
  import {
    CODE_DIGITS, LABEL_MAX, TOKEN_DAYS, connectLines, noRecord, reachKey, revocable, sampleMachines,
    reportKeyOf, sampleTokens, standing, type Answer, type DeviceRow, type TokenRow,
  } from '$lib/record/device.ts';
  /* THE APPROVAL `/vault` SENDS TOO, from one module, so the two screens cannot drift apart. */
  import { answerLine as lineOf, approve, planOf, reprove, revoke, words as vaultWords, type Plan } from '$lib/record/vault.ts';
  import { callsOutOf, words as actionWords, type CallOut } from '$lib/record/actions.ts';
  /* THE WRITES THIS SCREEN MAKES, and the one reading of what the record answered to each. */
  import {
    addException, dropException, exportFile, moveLevel, readPeople, removeAccess, wrote,
    type ExportKind, type Wrote,
  } from '$lib/record/settings-write.ts';
  import CallsOut from '$lib/ui/CallsOut.svelte';
  /* Lane F: backups, putting a copy back, erasing a person and deleting the record. */
  import { backUpNow, deleteRecordNow, downloadSnapshot, erasePerson, readSnapshots, restoreSnapshot } from '$lib/record/settings-write.ts';
  import type { Snapshot as KeptCopy } from '@braindog/client';
  /* Lane G: inviting somebody by address, with a link the owner sends and nobody mails. */
  import { inviteEmail, inviteLink, readInvites, withdrawInvite } from '$lib/record/settings-write.ts';
  import type { Invitation } from '@braindog/client';
  import { AGENTS_PACK, agentsPackDocument } from '@braindog/seed';
  /* Imported here and nowhere in the layout, so the client stays out of the entry chunk. */
  import { createClient } from '@braindog/client';
  import { checkBrainl } from '@braindog/kernel';
  import { TONES, bytes, relative, since } from 'braindog-render';
  import { untrack } from 'svelte';
  import { methods, passkeyRegister, passkeySignIn, passkeys, removePasskey, signOut, support, type Methods, type PasskeyInfo } from '$lib/auth.ts';

  /* THE RECORD'S OWN NAME. The Danger section named it two ways in three lines — `this record` and
     `the studio` — and one of the two was a literal. */
  /**
   * AND IT IS THE SHELL'S NAME, NOT THE SAMPLE'S.
   *
   * This whole screen read `boot()` — the in-browser sample — for who you are, what you hold and
   * what the record is called, on every record. So on a live record it said the sample's level
   * beside your address, counted the sample's records under "Records you can open", decided whose
   * row was yours in People by a sample id, and asked somebody to type the SAMPLE's slug to delete
   * a record that is not it. The layout already asked `boot` once and kept the answer: it is the
   * record's on a record and the sample's where there is none, which is exactly the one source
   * every other screen reads.
   */
  const shell = $derived(page.data as unknown as Shell);
  const RECORD = $derived(shell.index.name);
  const SLUG = $derived(shell.index.slug);
  const me = $derived(shell.me);

  /* Bytes as a person reads them — `braindog-render`'s, and it is imported rather than written here
     because it was written here, as `(bytes / 1e6).toFixed(1)`, and printed **"0.2 MB"** for all four
     snapshots of a ninety-three-row record. Four distinct copies, four identical strings, on the one
     screen whose entire job is to say which copy is which. */

  /* The slug, typed to confirm (`02 §9`); the button is disabled until it matches. */
  let typedSlug = $state('');

  /* ── agents: the live record's machines and tokens, or the sample's where there is no record ── */

  /**
   * WHERE THIS AREA'S ROWS CAME FROM. `sample` is a host with no record behind it, the public demo,
   * where nothing can be approved; `refused` is a record that answered no, and its sentence is shown.
   */
  let agentsFrom = $state<'reading' | 'live' | 'sample' | 'refused'>('reading');
  let agentsRefusal = $state('');
  let machines = $state<DeviceRow[]>([]);
  let tokens = $state<TokenRow[]>([]);
  let agentClient: ReturnType<typeof createClient> | null = null;
  const agentsNow = () => (agentsFrom === 'sample' ? NOW : Date.now());

  let typed = $state('');
  let approving = $state(false);
  let answer = $state<Answer | null>(null);
  /* THE BEARER LIVES HERE AND NOWHERE ELSE, and only until Done or leaving the area. */
  let minted = $state<{ label: string; bearer: string } | null>(null);
  let mintLabel = $state('');
  let minting = $state(false);
  let mintRefusal = $state('');
  let origin = $state('');

  /** A mark for the states that need one; `13 §5.1`, so the glyph and the tone come from one map. */
  const DEVICE_TONE: Record<string, 'good' | 'warn' | 'bad' | undefined> = {
    pending: 'warn',
    approved: 'good',
    expired: 'warn',
    denied: 'bad',
  };

  $effect(() => {
    if (area !== 'agents') {
      minted = null;
      offer = null;
      return;
    }
    untrack(() => void readAgents());
  });

  async function readAgents() {
    const at = opened();
    origin = location.origin;
    agentClient ??= createClient({ base: origin });
    const listed = await agentClient.listDevices();
    if (!listed.ok) {
      const refusal = 'refusal' in listed ? listed.refusal : { code: 'VERSION_STALE', fix: '' };
      if (noRecord(refusal.code)) {
        machines = sampleMachines(DEVICES);
        tokens = sampleTokens(TOKENS);
        agentsFrom = 'sample';
      } else {
        agentsRefusal = refusal.fix;
        agentsFrom = 'refused';
      }
      closed(true, at);
      return;
    }
    machines = listed.value;
    const held = await agentClient.listTokens();
    tokens = held.ok ? standing(held.value as TokenRow[]) : [];
    agentsFrom = 'live';
    closed(true, at);
  }

  /* A new keystroke clears the last answer, so the field is never marked wrong for a value it no longer holds. */
  function retype(value: string) {
    typed = value;
    answer = null;
  }

  async function tryCode(e?: SubmitEvent) {
    e?.preventDefault();
    if (approving) return;
    approving = true;
    const at = opened();
    answer = await approve(typed, agentsFrom === 'sample' ? null : agentClient);
    closed(true, at);
    approving = false;
    /* THE CODE STAYS IN THE FIELD ON A REFUSAL: six digits with one wrong is a thing to correct. */
    if (answer.kind === 'approved' && agentClient) {
      typed = '';
      const again = await agentClient.listDevices();
      if (again.ok) machines = again.value;
    }
  }

  /* What the status line under the field says, or nothing. */
  const answerLine = $derived(lineOf(answer));

  /* SIGNING IN AGAIN WITHOUT LEAVING, where a passkey can do it: the code stays typed and is sent again. */
  let reproving = $state(false);
  async function signInAgain() {
    if (reproving) return;
    reproving = true;
    const back = await reprove({ support, methods, passkeySignIn }, (href) => location.assign(href));
    reproving = false;
    if (back) await tryCode();
  }

  async function revokeMachine(row: DeviceRow) {
    if (agentsFrom !== 'live' || !agentClient) {
      toasts.push(copy.notOnDemo, { intent: 'warn' });
      return;
    }
    const at = opened();
    const out = await revoke(agentClient, machines, row.handle);
    closed(true, at);
    if (out.ok) machines = out.rows;
    else toasts.push(out.fix, { intent: 'warn' });
  }

  async function revokeTokenRow(row: TokenRow) {
    if (agentsFrom !== 'live' || !agentClient) {
      toasts.push(copy.notOnDemo, { intent: 'warn' });
      return;
    }
    const at = opened();
    const out = wrote(await agentClient.revokeToken({ id: row.id }));
    closed(true, at);
    if (out.ok) tokens = tokens.filter((t) => t.id !== row.id);
    else {
      toasts.push(out.fix, { intent: 'warn' });
      const held = await agentClient.listTokens();
      if (held.ok) tokens = standing(held.value as TokenRow[]);
    }
  }

  async function connectAgent(e: SubmitEvent) {
    e.preventDefault();
    const label = mintLabel.trim().slice(0, LABEL_MAX);
    if (!label || minting) return;
    if (agentsFrom !== 'live' || !agentClient) {
      mintRefusal = copy.notOnDemo;
      return;
    }
    minting = true;
    mintRefusal = '';
    const at = opened();
    /* THE BEARER IS SHOWN ONCE, from this answer, and never stored, logged or written anywhere else. */
    const out = wrote(await agentClient.createToken({ scope: 'write', label, days: TOKEN_DAYS }));
    closed(true, at);
    minting = false;
    if (!out.ok) {
      mintRefusal = out.fix;
      return;
    }
    minted = { label, bearer: out.value.bearer };
    mintLabel = '';
    const held = await agentClient.listTokens();
    if (held.ok) tokens = standing(held.value as TokenRow[]);
    await offerPack(agentClient);
  }

  /*
   * THE AGENTS ADD-ON, OFFERED ONCE A TOKEN IS SHOWN, when this record does not have it. The plan is
   * the record's own `planPack` answer in the Packs screen's words, and Install sends its `planHash`
   * back, so what installs is what was shown. Not now changes nothing.
   */
  let offer = $state<Plan | null>(null);
  /* THE PLAN'S `calls_out`, beside the plan rather than in it, so `vault.ts` does not pull in `actions.ts`. */
  let offerCalls = $state<CallOut[]>([]);
  let installing = $state(false);
  let offerSaid = $state('');

  const packName = (kind: 'register' | 'page', id: string): string => {
    const named = kind === 'register' ? AGENTS_PACK.registers[id]?.name : AGENTS_PACK.pages[id]?.title;
    return typeof named === 'string' && !named.includes('{{') ? named : id.charAt(0).toUpperCase() + id.slice(1);
  };

  /* THE LINES THE OFFER DRAWS ARE THE LINES INSTALL APPROVES. The record refuses an install that adds a
     call without them, and this screen shows every one through `CallsOut` before Install is pressed. */
  let offerApprove: string[] = [];

  async function offerPack(client: ReturnType<typeof createClient>) {
    const at = opened();
    const held = await client.packs();
    if (!held.ok || held.value.some((p) => p.id === AGENTS_PACK.manifest.id)) {
      closed(true, at);
      return;
    }
    const planned = await client.planPack({ doc: agentsPackDocument(), source: { kind: 'local' } });
    closed(true, at);
    offerSaid = '';
    const diff = planned.ok ? (planned.value as { diff?: { calls_out?: unknown; approve?: unknown } }).diff : undefined;
    offer = planned.ok ? planOf(diff, packName) : null;
    offerCalls = callsOutOf(diff?.calls_out);
    offerApprove = Array.isArray(diff?.approve) ? diff.approve.filter((l): l is string => typeof l === 'string') : [];
  }

  async function installOffer() {
    if (!offer || installing || !agentClient) return;
    installing = true;
    const at = opened();
    const out = wrote(await agentClient.installPack({ doc: agentsPackDocument(), source: { kind: 'local' }, planHash: offer.planHash, ...(offerApprove.length > 0 ? { approve: offerApprove } : {}) }));
    closed(true, at);
    installing = false;
    if (out.ok) {
      offer = null;
      toasts.push(vaultWords.packInstalled, { intent: 'good' });
    } else if (!out.ok && out.from === 'refused' && out.code === 'PLAN_STALE') {
      /* THE PLAN MOVED UNDER IT, so it is read again and shown again: what installs is what was shown.
         The sentence says the plan moved only when a fresh plan is on screen to approve. */
      await offerPack(agentClient);
      offerSaid = offer ? out.fix : '';
    } else offerSaid = out.fix;
  }

  const lines = $derived(connectLines(origin));
  import PageHead from '$lib/ui/PageHead.svelte';
  import Section from '$lib/ui/Section.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Chip from '$lib/ui/Chip.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Face from '$lib/ui/Face.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Keymap from '$lib/ui/Keymap.svelte';
  import Actions from '../../p/[slug]/Actions.svelte';
  import { closed, drew, opened } from '../../../lib/ui/screen.svelte.ts';

  /* Twelve rows with a glyph each, because this rail's own CSS says it "IS the same thing" as the
     app's rail, and the app's rail has never had a row without one. A list of twelve bare words is
     the hardest kind of nav to scan: nothing tells you where you are except reading all of them. */
  const AREAS = [
    { id: 'appearance', label: 'Appearance', icon: 'sun' },
    { id: 'identity', label: 'Identity', icon: 'people' },
    { id: 'recovery', label: 'Recovery', icon: 'key' },
    { id: 'people', label: 'People & sharing', icon: 'people' },
    { id: 'agents', label: 'Agents', icon: 'session' },
    { id: 'ingest', label: 'Ingest', icon: 'inbox' },
    { id: 'keyboard', label: 'Keyboard', icon: 'keyboard' },
    { id: 'navigation', label: 'Navigation', icon: 'rows' },
    { id: 'notifications', label: 'Notifications', icon: 'bell' },
    { id: 'backups', label: 'Backups', icon: 'archive' },
    { id: 'billing', label: 'Billing', icon: 'money' },
    { id: 'export', label: 'Export', icon: 'download' },
    /* ITS OWN ROW, AND IT WAS THE LAST SECTION OF `Export`. A person who wants a copy of their data
       clicks the row labelled Export with a download icon beside it, scrolls past the file, the
       signing key and the public key, and arrives at the one irreversible act in the product.
       `53 §5.9` says there is no rollback after step 2 of it. A destructive act reached by somebody
       looking for a backup is reached by the person least expecting it, which is the opposite of
       what the typed slug is there for. */
    { id: 'delete', label: 'Delete this record', icon: 'trash' },
  ] as const;

  const area = $derived(page.params.area ?? 'appearance');

  /**
   * WHETHER THIS IS AN AREA AT ALL, which nothing asked.
   *
   * `area` came straight off the param with no membership test, and every screen downstream believed
   * it: `/settings/banana` gave `<title>Banana · Settings</title>`, an `<h1>Banana</h1>`, and a
   * `no-data-yet` state reading "This area is part of the shell and is not wired in the mock-up" —
   * a page answering a nonexistent address by asserting the feature exists and is merely
   * unconfigured.
   *
   * `/r/nope`, `/v/nope` and `/p/nope` all refuse this correctly and helpfully, naming the thing,
   * saying it is not here, and listing what is. Three route families got it right and the fourth
   * invented an area. `10 §7`'s fourth rule holds on a URL as much as on a write: the refusal is
   * the teacher.
   */
  const known = $derived(AREAS.find((a) => a.id === area));

  /**
   * NINE OF TWELVE AREAS WERE UNREACHABLE ON A PHONE.
   *
   * Below 900px the rail becomes a horizontal scroller — `scrollWidth 1294` inside `clientWidth
   * 358` — and nothing ever scrolled it. `scrollLeft` was 0 on every area, so the strip always read
   * "Appearance · Identity · Recovery" and a sliver of the fourth. On `/settings/billing` the
   * heading said Billing, the strip highlighted nothing, and no partial item peeked to suggest there
   * were nine more.
   *
   * `nearest` rather than `center`: on the first three areas the current one is already in view and
   * centring would scroll the list for no reason, which reads as the page moving under you.
   * `block: 'nearest'` keeps it from scrolling the PAGE to reach a strip that is already on screen.
   */
  /**
   * The areas whose controls are actually kept — measured, not assumed.
   *
   * A LIST AND NOT A PREDICATE, because there is nothing on an area to ask. `pref.ts` knows which
   * KEYS persist and this file knows which area draws which control; the join between them lives
   * nowhere, so it is written here, next to the sentence it decides. Three today. The day a fourth
   * area writes a preference this is the line that has to change, and the sentence going stale is
   * a sentence a reader can see is wrong, which is the failure that produced it.
   */
  const KEEPS = new Set(['appearance', 'keyboard', 'navigation']);

  /**
   * THE AREAS WITH NOTHING TO CHANGE, and the notice at the foot of this page is not about them.
   *
   * "Nothing you do here is saved yet." rendered on all twelve, three of which offer nothing to do.
   * `notifications` is four stated facts and two hints and `copy.muteAtSource` says out loud that
   * there is no switch on it; `billing` is one sentence and a link to Export; `identity` reports
   * who you are and which records you hold, and `33 §10` is why it cannot do more than report:
   * login is account-level, so identity lives outside the record.
   *
   * A DISCLAIMER ON A SCREEN WITH NO CONTROL IS NOT CAUTIOUS, IT IS NOISE. It teaches a reader to
   * skip the sentence on the nine screens where it is the difference between a mock and a promise,
   * which is the same failure `06 §1` names about a warning that does not apply.
   *
   * A LIST AND NOT A PREDICATE, for the reason `KEEPS` above gives: there is nothing on an area
   * object to ask, and the join between an area and what it draws lives in this file's markup and
   * nowhere else. The day one of these three grows a control, this is the line that changes.
   */
  const REPORTS = new Set(['identity', 'notifications', 'billing']);

  let rail = $state<HTMLElement | undefined>(undefined);

  /**
   * AND IT RAN ONCE, WHICH IS THE BUG THE PARAGRAPH ABOVE SAYS IT FIXED.
   *
   * The effect read `rail` and nothing else. `rail` is a stable element reference, and SvelteKit
   * does not remount `[area]/+page.svelte` when only the parameter changes — so this fired at mount
   * and never again. Measured on the deployed build, phone width, tapping Billing → Export →
   * Appearance → Ingest: `scrollLeft` 0, 0, 0, 0. Calling the same body by hand on the same page
   * moved it 0 → 497, so `scrollIntoView` was never the problem; being called was. A direct load of
   * `/settings/billing` scrolled correctly, which is exactly why this survived review — the one
   * path a person tests by hand is the one path that was a mount.
   *
   * READING `area` IS THE FIX, and it has to be read INSIDE the effect: an effect tracks what it
   * touches while it runs, and a value referenced only in the comment above it is not touched. It
   * is otherwise unused here, which is why `void` says so out loud rather than leaving the next
   * reader to delete a line that looks like nothing.
   */
  $effect(() => {
    void area;
    rail
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  });

  /* SET IT AND REMEMBER IT, in one call. These were two things and the second was never written:
     every preference in this product was lost on refresh, and a setting that does not survive a
     reload is a setting somebody changes once and then stops trusting. */
  const set = (key: 'scheme' | 'text' | 'density', value: string) => pref.apply(key, value);

  /* SEEDED FROM WHAT IS REMEMBERED, so the controls show the state the page is already in rather
     than the default the state happens to start at. */
  const held = pref.read();
  let scheme = $state<'light' | 'system' | 'dark'>(held.scheme ?? 'system');
  let text = $state<'sm' | 'base' | 'md'>(held.text ?? 'base');
  let density = $state<'compact' | 'comfortable' | 'roomy'>(held.density ?? 'comfortable');
  /* THE HIGH-CONTRAST PALETTE, WHICH SHIPPED AND HAD NO CONTROL. Off unless somebody said
     otherwise: it is a second palette solved against a higher floor, not a correction to a broken
     one, so the default is the palette everything else is drawn against. */
  let moreContrast = $state(held.contrast ?? false);
  let chars = $state(held.chars ?? true);
  /* ON UNLESS SOMEBODY SAID OTHERWISE. No document states the default; `29 §3`'s triggers are
     described as firing, so on is the only reading consistent with the section. */
  let suggestPages = $state(held.suggestPages ?? true);
  /* THE RAIL UNLESS SOMEBODY SAID OTHERWISE. `19 §3` keeps the sidebar as the default in bold, and
     the other two shapes are offered rather than defaulted. */
  let navShape = $state<'rail' | 'bar' | 'menu'>(held.navShape ?? 'rail');

  /**
   * THE DESIGN AGENT'S OWN RECOMMENDATION, read from the record rather than typed here.
   *
   * `19 §3`: it reads how many declared pages and lists are placed, how many sections they fall
   * into, whether the nav has been arranged by hand, and answers with one shape and one sentence of
   * why. `navShape` above is what it is compared against, not `held.navShape`, so picking the
   * recommended shape by hand in the segmented control above makes the recommendation disappear on
   * its own rather than nagging about a choice just made.
   */
  const navRec = $derived(
    recommendNavShape(
      navShapeSignals(
        shell.nav,
        shell.index.registers.length,
        { nav: held.nav, navShape },
        typeof window === 'undefined' ? undefined : window.innerWidth,
      ),
    ),
  );
  /* DISMISS IS TERMINAL, `19 §3`'s own word. `dismissed.ts` explains why that lives in
     `localStorage` keyed by the record rather than in `Pref`: there is no table to hold it and no
     `setPref` yet, the same deviation `navShape` itself already carries. */
  let navRecDismissed = $state<string | null>(null);
  $effect(() => {
    navRecDismissed = dismissedFor(shell.index.slug);
  });
  const navRecShown = $derived(navRec !== null && signatureOf(navRec) !== navRecDismissed);

  const navShapeLabel = (s: NavShape): string => (s === 'rail' ? copy.navShapeRail : s === 'bar' ? copy.navShapeBar : copy.navShapeMenu);

  /** Accepting is the one click `19 §3` allows: it sets the shape, exactly as picking it by hand would. */
  function acceptNavRec(rec: NavShapeRecommendation) {
    navShape = rec.shape;
  }

  function dismissNavRecommendation(rec: NavShapeRecommendation) {
    const sig = signatureOf(rec);
    dismissNavRec(shell.index.slug, sig);
    navRecDismissed = sig;
  }

  let accent = $state<string | null>(held.theme ?? null);
  let accentWrong = $state<string | null>(null);

  function pickAccent(hex: string | null) {
    const out = accentApply(hex);
    if (!out.ok) {
      /* THE FLOOR IT MISSED, NOT "THAT DID NOT WORK" — AND IN THE TERMS OF THIS SCREEN. `out.refusals`
         are the theme AUTHOR's sentences: "the pair (faint on s3) is 3.61:1 in dark, it needs 4.5:1,
         move faint further from the ground". There is no control here that moves a hue, lowers a
         chroma or knows what `s3` is, so every one of them instructed an action this person cannot
         take — which is the failure `checks.ts` names in its own comment two lines above the string.
         The code is what survives the trip; the sentence is built here, where the swatch is. */
      accentWrong = copy.accentRefused(ACCENTS.find((a) => a.hex === hex)?.name ?? String(hex), out.codes);
      return;
    }
    accentWrong = null;
    accent = hex;
    toasts.push(hex ? copy.accentSet(ACCENTS.find((a) => a.hex === hex)?.name ?? hex) : copy.accentReset);
  }

  /* THE ONE PREFERENCE WHOSE ATTRIBUTE IS NOT ITS VALUE: the switch is a boolean and the attribute
     is the literal `hc`, so it has its own writer rather than a fourth key in `apply`. */
  function pickContrast(on: boolean) {
    moreContrast = on;
    pref.contrast(on);
  }

  function pickScheme(v: 'light' | 'system' | 'dark') {
    scheme = v;
    /* `system` IS AN ANSWER AND NOT AN ABSENCE, so it is written down: removing the attribute
       without recording the choice would make the next visit read a stale `dark` from the cookie. */
    pref.apply('scheme', v === 'system' ? null : v);
  }

  const pen = $derived(Object.values(pages()).filter((p) => p.placed === false));

  /**
   * Put a suggested page in the rail.
   *
   * 29 §2's three tiers are derived → proposed → placed, and *"Movement is forward-only and needs a
   * user action."* This is the user action, and two rules from §4 govern what it would write: the
   * page appends AT THE END OF ITS SECTION rather than being inserted mid-list — Microsoft's
   * Personalized Menus put items at different distances down the menu each time, and Jensen Harris
   * announced the reversal in 2006 with that as the first reason — and nothing is ever placed
   * without it, because the system never writes nav order after first install (06 §3).
   *
   * IT SAID SO IN THE COMPLETED PAST TENSE AND WROTE NOTHING. The row vanished from the pen because
   * this filtered a local array; the rail reads `boot()`, which filters on the declaration's own
   * `placed` and `nav`, neither of which this could touch. So the page was back in the pen on
   * reload and had never once been in the nav. A sentence in the past tense about a thing that did
   * not happen is the worst kind of mock, because it is the kind somebody believes — and the undo
   * on the toast made it worse, by offering to reverse it.
   */
  /* AND THE CHARACTER KEYS TOO. It is the one preference that changes what the keyboard DOES, so
     forgetting it is the one somebody notices within a minute. And *Suggest new pages*, which is the
     other switch on this surface and would otherwise be the third control in this product to move a
     tick, write nothing, and come back on. */
  /* AND THE SHAPE OF THE NAVIGATION, which the shell picks up from the write itself rather than on
     the next reload: it is the one preference on this screen that changes the thing this screen is
     drawn inside. */
  $effect(() => {
    pref.write({ chars, suggestPages, navShape });
  });

  /**
   * Put a suggested page in the rail.
   *
   * IT SAID `${title} is in your nav` IN THE COMPLETED PAST TENSE and nothing of the kind happened.
   * The row vanished from this list because `promote` filtered a local array; the rail reads
   * `boot()`, which filters on the declaration's own `placed` and `nav` — neither of which this
   * could touch — so the page was back in the pen on reload and never once in the nav. A sentence
   * in the past tense about a thing that did not happen is the worst kind of mock, because it is the
   * kind somebody believes.
   */
  /* THE LADDER IN THE WORDS YOU WOULD USE ABOUT A COLLEAGUE. `member.level` keeps the schema's five
     and every value written is still one of them; only what the screen prints changes. */
  const LEVEL_SAID: Record<string, string> = {
    owner: 'Owner',
    decide: 'Decides',
    write: 'Edits',
    append: 'Adds only',
    read: 'Reads',
  };
  const levelSaid = (level: string | null) => (level === null ? copy.noRecordLevel : (LEVEL_SAID[level] ?? level));

  /**
   * WHAT `invite({ person, levels, why })` WOULD WRITE, said in the words it would write it in.
   *
   * `45 §5.6`: one method does all three. It reads the old rows, deletes every `member` row for the
   * person, re-inserts from `levels`, and appends an `access.grant` per register raised or added and
   * an `access.revoke` per register lowered or removed — each carrying `why` as its note. So
   * invitation, level change and removal are not three operations with three confirmations; they are
   * one call, and `levels: []` is the removal.
   *
   * THE MOCK SAYS THE SENTENCE THAT WOULD BE WRITTEN rather than "saved". A toast reading "Saved"
   * over a call that also revokes eleven registers is the shape of thing somebody trusts once.
   */
  const levelChange = (who: Person, to: Level | null) => {
    /**
     * A SEGMENT THAT IS ALREADY PRESSED IS INERT, and this answered one with a warning toast.
     *
     * The branch read `${who.name} already reaches ${to}`, written for a third person, and the
     * seed's name for the signed-in human is the literal `You` — so the sentence came out as **"You
     * already reaches owner, but nothing was saved yet."** On your own row every other position is
     * disabled and, with one owner, so is Remove, which made this the ONE pressable control in the
     * whole People area: the single thing the screen let you do was report a change that was not
     * one, ungrammatically, about yourself.
     *
     * Pressing the level somebody already holds changes nothing, so nothing is what it says.
     */
    if (to === who.level) return;
    if (peopleFrom === 'live') {
      void settle(() => moveLevel(location.origin, who, to), copy.levelMoved(who.name, levelSaid(to)));
      return;
    }
    /**
     * THE DIRECTION IS THE EVENT'S, AND IT IS NO LONGER THE SENTENCE'S.
     *
     * This line ended `with one access.grant per list` or `with one access.revoke per list`,
     * chosen by comparing the two levels' places in `LEVELS`, with `null` held at `-1` so that
     * taking the record level away read as a revoke rather than as a grant — which it does: it is
     * `access.revoke` on `'*'`, and it leaves whatever exceptions they hold.
     *
     * All of that is still true of what the record would write, and none of it belonged in the
     * toast. Those are two of `30 §2`'s closed forty kinds, read out to somebody deciding what a
     * colleague may see, and the half of the sentence naming where the level moves FROM and TO has
     * already said which way it goes. What the second half is for is how much would happen, and
     * that is one per list in either direction. The kinds are untouched in the log and the API.
     */
    toasts.push(copy.notWritten(copy.levelWouldMove(who.name, levelSaid(who.level), levelSaid(to))), { intent: 'warn' });
  };

  /* A RECORD KEEPS AT LEAST ONE OWNER — `LEVEL_REQUIRED`, and its fix sentence verbatim (45 §5.6).
     The check is here rather than in the control because it is a fact about the whole list. */
  /**
   * THE PEOPLE AREA'S ROWS: the record's members, or the sample's where there is no record.
   *
   * `reading` draws no list, so a live record never flashes somebody else's colleagues. A record that says no, or a
   * host with no such read, draws its sentence in place of the list.
   */
  let people = $state<Person[]>([...PEOPLE_ACCESS]);
  let peopleFrom = $state<'reading' | 'live' | 'sample' | 'unrouted' | 'refused'>('reading');
  let peopleRefusal = $state('');
  let peopleBusy = $state(false);
  const peopleNow = () => (peopleFrom === 'live' ? Date.now() : NOW);

  /* ON A RECORD EVERY OWNER COUNTS: `members` has no acceptance date, so `since` says nothing there. */
  const owners = $derived(people.filter((p) => p.level === 'owner' && (peopleFrom === 'live' || p.since)).length);
  const lastOwner = (who: Person) => who.level === 'owner' && owners <= 1;

  /* IDENTITY READS THE SAME LIST, because it draws a person too: the address it prints beside
     "Signed in as" is a fact about a member of this record, and it was being read out of the
     sample while the record sat one call away. */
  $effect(() => {
    if (area !== 'people' && area !== 'identity') return;
    untrack(() => void readPeopleNow());
  });

  async function readPeopleNow() {
    const at = opened();
    const out = await readPeople(location.origin);
    if (out.from === 'live') people = out.people;
    else if (out.from === 'sample') people = [...PEOPLE_ACCESS];
    else people = [];
    peopleRefusal = out.from === 'refused' ? out.fix : out.from === 'unrouted' ? copy.peopleUnrouted : '';
    peopleFrom = out.from;
    closed(true, at);
  }

  /**
   * One write to who may see the record, then the list read again, so what is drawn is what the record holds.
   * A refusal is the record's sentence; a race reads again too, before anybody presses twice.
   */
  async function settle(write: () => Promise<Wrote<unknown>>, done: string): Promise<boolean> {
    if (peopleBusy) return false;
    peopleBusy = true;
    const at = opened();
    const out = await write();
    closed(true, at);
    peopleBusy = false;
    toasts.push(out.ok ? done : out.fix, { intent: out.ok ? 'good' : 'warn' });
    if (out.ok || (out.from === 'refused' && out.raced)) await readPeopleNow();
    return out.ok;
  }

  /* THE LISTS AN EXCEPTION CAN BE ON: the shell's, which are the record's on a record and the sample's otherwise. */
  const lists = $derived(
    ((page.data as { lists?: readonly { id: string; name: string }[] }).lists ??
      Object.entries(REGISTERS).map(([id, r]) => ({ id, name: r.name }))),
  );
  let picking = $state<string | null>(null);
  let pickList = $state('');
  let pickLevel = $state<Level>('read');

  function startException(p: Person) {
    if (peopleFrom !== 'live') {
      toasts.push(copy.notWritten(copy.exceptionWouldBeAdded(p.name)), { intent: 'warn' });
      return;
    }
    picking = p.id;
    pickList = lists.find((l) => !p.scoped.some((s) => s.register === l.id))?.id ?? lists[0]?.id ?? '';
    pickLevel = 'read';
  }

  async function saveException(e: SubmitEvent, p: Person) {
    e.preventDefault();
    if (!pickList) return;
    const name = lists.find((l) => l.id === pickList)?.name ?? pickList;
    const ok = await settle(() => addException(location.origin, p, pickList, pickLevel), copy.exceptionAdded(p.name, name, levelSaid(pickLevel)));
    if (ok) picking = null;
  }

  function takeAway(p: Person) {
    if (peopleFrom !== 'live') toasts.push(copy.notWritten(copy.accessWouldGo(p.name)), { intent: 'warn' });
    else void settle(() => removeAccess(location.origin, p), copy.accessRemoved(p.name));
  }

  function backToLevel(p: Person, register: string) {
    const list = REGISTERS[register]?.name ?? lists.find((l) => l.id === register)?.name ?? register;
    if (peopleFrom !== 'live') toasts.push(copy.notWritten(copy.exceptionWouldGo(list, levelSaid(p.level))), { intent: 'warn' });
    else void settle(() => dropException(location.origin, p, register), copy.exceptionRemoved(list, levelSaid(p.level)));
  }

  /* ── inviting somebody: the link the owner sends, and the ones still waiting ── */

  /**
   * THE LINK IS SHOWN ONCE AND KEPT NOWHERE. The record answers the mint with the only copy of the token and keeps
   * its hash, so this is the one moment it can be copied; `madeLink` is the screen holding it until the person is
   * done with it, and nothing writes it anywhere else.
   */
  let inviteTo = $state('');
  let inviteLevel = $state<Level>('read');
  let inviting = $state(false);
  let madeLink = $state<{ email: string; link: string } | null>(null);
  let waitingInvites = $state<Invitation[]>([]);

  $effect(() => {
    if (area !== 'people') return;
    untrack(() => void readInvitesNow());
  });

  /** Every invitation still waiting. A host older than invitations, or one with no record, lists none. */
  async function readInvitesNow() {
    const out = await readInvites(location.origin);
    waitingInvites = out.from === 'live' ? out.invites : [];
  }

  /** One link, for one address, at the level chosen. Nothing is mailed: the owner sends it themselves. */
  async function makeInvite(e: SubmitEvent) {
    e.preventDefault();
    const email = inviteTo.trim();
    if (!email || inviting) return;
    if (peopleFrom !== 'live') {
      toasts.push(copy.notWritten('A single-use link would be made, bound to that one address and good for 24 hours'), { intent: 'warn' });
      return;
    }
    inviting = true;
    const at = opened();
    const out = await inviteEmail(location.origin, email, inviteLevel);
    closed(true, at);
    inviting = false;
    if (!out.ok) {
      toasts.push(out.fix, { intent: 'warn' });
      return;
    }
    madeLink = { email: out.value.invitation.email, link: inviteLink(location.origin, out.value.token) };
    inviteTo = '';
    await readInvitesNow();
  }

  /** The one copy, to the clipboard, with the toast that says whether it got there. */
  function copyLink() {
    if (madeLink) void clipboard.put(madeLink.link, copy.inviteLinkLabel);
  }

  /** Withdraw one. Its link stops working at once, and the list is read again. */
  async function withdraw(inv: Invitation) {
    if (peopleFrom !== 'live') {
      toasts.push(copy.notWritten(copy.inviteWithdrawn(inv.email)), { intent: 'warn' });
      return;
    }
    const done = await settle(() => withdrawInvite(location.origin, inv.id), copy.inviteWithdrawn(inv.email));
    if (done) await readInvitesNow();
  }

  /* ── export: the record as a file, where there is a record to take it from ── */
  let exporting = $state<ExportKind | null>(null);

  /** The sample keeps the sentence it always said; a record hands the browser a `.brainl` file. */
  async function takeCopy(kind: ExportKind, sampleSaid: string) {
    if (exporting) return;
    exporting = kind;
    const at = opened();
    const out = await exportFile(location.origin, kind, SLUG);
    closed(true, at);
    exporting = null;
    if (!out.ok) {
      if (out.from === 'sample') toasts.push(copy.notWritten(sampleSaid));
      else toasts.push(out.fix, { intent: 'warn' });
      return;
    }
    const url = URL.createObjectURL(new Blob([out.value.text], { type: 'application/x-ndjson' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = out.value.name;
    a.click();
    URL.revokeObjectURL(url);
    toasts.push(copy.exported(out.value.name), { intent: 'good' });
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

  /* ── backups, erasure and deletion: the live record's answer, and the sample's toast where there is no record ── */

  /** Where the backups list came from. `refused` is a host that keeps no copies, and its sentence is drawn instead. */
  let copiesFrom = $state<'reading' | 'live' | 'sample' | 'refused'>('reading');
  let copiesSaid = $state('');
  let liveCopies = $state<KeptCopy[]>([]);
  let backingUp = $state(false);
  /* THE COPY WAITING ON A CONFIRM, and nothing is put back until it is pressed a second time. */
  let restoring = $state<string | null>(null);
  let restoreBusy = $state(false);
  let deleting = $state(false);
  let deletedSaid = $state('');

  type CopyLine = { id: string; at: string; bytes: number; rows: number | null; failed: string | null };
  /* A LIVE RECORD IS NEVER DRAWN THE SAMPLE'S COPIES: a host that keeps none shows its sentence over an empty list. */
  const copyLines = $derived<CopyLine[]>(
    copiesFrom === 'live' ? liveCopies.map((c) => ({ ...c, rows: null, failed: null })) : copiesFrom === 'refused' ? [] : SNAPSHOTS,
  );
  const copiesNow = () => (copiesFrom === 'live' ? Date.now() : NOW);

  /* A COPY IS NAMED BY ITS DAY, AND A DAY READS AS THE REST OF THE PRODUCT WRITES ONE: `3 Sep 2026`,
     not `2026-09-03` (DESIGN-SYSTEM APPENDIX C14). An id that is not a day is shown as it is. */
  const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const copyDay = (id: string): string => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(id);
    return m ? `${Number(m[3])} ${SHORT_MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}` : id;
  };

  $effect(() => {
    if (area !== 'backups') {
      restoring = null;
      return;
    }
    untrack(() => void readCopies());
  });

  async function readCopies() {
    const at = opened();
    const out = await readSnapshots(location.origin);
    if (out.from === 'live') liveCopies = out.snapshots;
    copiesSaid = out.from === 'refused' ? out.fix : '';
    copiesFrom = out.from;
    closed(true, at);
  }

  async function backUp() {
    if (backingUp) return;
    backingUp = true;
    const at = opened();
    const out = await backUpNow(location.origin);
    closed(true, at);
    backingUp = false;
    if (out.ok) {
      toasts.push(copy.backedUp(out.value.id), { intent: 'good' });
      await readCopies();
    } else if (out.from === 'sample')
      toasts.push(copy.notWritten('A backup of the whole record would be written now, and counted against the thirty'), { intent: 'warn' });
    else toasts.push(out.fix, { intent: 'warn' });
  }

  async function downloadCopy(id: string) {
    const at = opened();
    const out = await downloadSnapshot(location.origin, id);
    closed(true, at);
    if (!out.ok) {
      if (out.from === 'sample') toasts.push(copy.notWritten(`${id} would be downloaded exactly as it sits on disk, signed`), { intent: 'warn' });
      else toasts.push(out.fix, { intent: 'warn' });
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
    const out = await restoreSnapshot(location.origin, restoring);
    closed(true, at);
    restoreBusy = false;
    if (out.ok) {
      restoring = null;
      toasts.push(copy.restoredTo(out.value.bookmark, out.value.kept ?? ''), { intent: 'good' });
      await readCopies();
    } else toasts.push(out.fix, { intent: 'warn' });
  }

  /** Cloud's "restore to a time": the sample's toast, or the record's own answer, which on Cloud today says it cannot yet. */
  async function restoreToTime() {
    const at = opened();
    const out = await restoreSnapshot(location.origin, '');
    closed(true, at);
    if (out.ok) await readCopies();
    else if (out.from === 'sample')
      toasts.push(
        copy.notWritten('A time would be picked, and the record put back to it, with every write after it gone, and the history ends there, with one line saying you went back'),
        { intent: 'warn' },
      );
    else toasts.push(out.fix, { intent: 'warn' });
  }

  let eraseOpen = $state(false);
  let eraseWho = $state('');
  let eraseBasis = $state('');
  let erasePersonId = $state('');
  let eraseBusy = $state(false);

  /* THE FORM OPENS ONLY ON A RECORD. The sample keeps the sentence it always said. */
  function startErase() {
    if (peopleFrom !== 'live') toasts.push(copy.notWritten('Erasing asks which person, and on what basis, before anything is removed'), { intent: 'warn' });
    else eraseOpen = true;
  }

  async function eraseNow() {
    if (eraseBusy) return;
    eraseBusy = true;
    const at = opened();
    const who = eraseWho.trim();
    const out = await erasePerson(location.origin, { subjects: who ? [who] : [], ...(erasePersonId ? { personId: erasePersonId } : {}), basis: eraseBasis.trim() });
    closed(true, at);
    eraseBusy = false;
    if (out.ok) {
      toasts.push(copy.erasedRows(out.value.rows), { intent: 'good' });
      eraseOpen = false;
      eraseWho = '';
      eraseBasis = '';
      erasePersonId = '';
      await readPeopleNow();
    } else if (out.from === 'sample') toasts.push(copy.notWritten('Erasing asks which person, and on what basis, before anything is removed'), { intent: 'warn' });
    else toasts.push(out.fix, { intent: 'warn' });
  }

  async function deleteNow() {
    if (deleting) return;
    deleting = true;
    const at = opened();
    const out = await deleteRecordNow(location.origin, typedSlug.trim());
    closed(true, at);
    deleting = false;
    if (out.ok) {
      deletedSaid = copy.recordDeleted(RECORD);
      toasts.push(deletedSaid, { intent: 'good' });
    } else if (out.from === 'sample')
      toasts.push(copy.notWritten(`You would be asked to sign in again, and then ${RECORD} and every copy of it would be gone`), { intent: 'warn' });
    else toasts.push(out.fix, { intent: 'warn' });
  }

  /**
   * WHETHER THERE IS ANYBODY TO COMPARE YOURSELF WITH, which is what most of this area is about.
   *
   * A level, an exception, a removal and an erasure are all facts about one person MEASURED
   * AGAINST another, and on a record whose only person is you there is no other. `USABILITY.md`'s
   * second question asks that the product be smaller at one row than at four hundred and grow by
   * itself; this is the line that lets the People area do it.
   */
  const alone = $derived(people.length < 2);

  /**
   * AND YOU CANNOT TAKE YOUR OWN OWNERSHIP AWAY FROM THIS SCREEN.
   *
   * `lastOwner` is a fact about the RECORD — how many owners exist — and never about *you*, so with
   * a second owner present every control on your own row went live, `read` included, with no
   * confirmation. The toast would have read "You would move from owner to read across this record",
   * after which you cannot reach this screen to undo it: the one action on the surface that removes
   * your own way back.
   *
   * It is a REFUSAL WITH A ROUTE, not a wall. `45 §5.6` has one method for every level change, and
   * another owner can still do this to you — which is the point of there being more than one. What
   * is refused is doing it to yourself, alone, by pressing a segment.
   */
  const self = (who: Person) => who.id === me.person;
  /**
   * The signed-in person's own row, which is where their name and address live.
   *
   * FROM WHICHEVER LIST WAS DRAWN, AND NEVER THE SAMPLE'S OVER A LIVE RECORD. It read
   * `PEOPLE_ACCESS` directly, so a live record printed a sample address beside your name if the two
   * happened to share an id, and nothing at all if they did not. On a record the answer is the
   * record's members or it is nothing yet.
   */
  const mine = $derived(shell.live && peopleFrom !== 'live' ? undefined : people.find((p) => p.id === me.person));

  /**
   * WHAT THE HOST SAYS ABOUT SIGNING IN, read only on the two areas that draw it.
   *
   * `null` until it answers, and where there is no host at all, which is the public demo: those two
   * areas then draw the sample, and no control that would need a session.
   */
  const webauthnHere = support();
  let hostAuth = $state<Methods | null>(null);
  let liveKeys = $state<PasskeyInfo[] | null>(null);
  let addingKey = $state(false);
  let addSaid = $state<string | null>(null);
  let signingOutNow = $state(false);
  let outSaid = $state<string | null>(null);
  const signedInEmail = $derived(hostAuth?.me?.email ?? null);
  /** Somebody is signed in to a host that offers passkeys, so the list and its button are real. */
  const livePasskeys = $derived(hostAuth?.me && hostAuth.passkey ? hostAuth : null);
  const canAddPasskey = $derived(livePasskeys !== null && webauthnHere.webauthn && webauthnHere.secure);

  /* The area changes without the page remounting, so this reads `area` and runs again for each. */
  $effect(() => {
    if (area !== 'identity' && area !== 'recovery') return;
    untrack(() => void readSignIn());
  });

  async function readSignIn() {
    const at = opened();
    const answer = await methods();
    hostAuth = answer.ok ? answer.value : null;
    if (hostAuth?.me && hostAuth.passkey) {
      const listed = await passkeys();
      liveKeys = listed.ok ? listed.value : null;
    }
    /* A host without sign-in means the sample, drawn, and not a refusal of this screen. */
    closed(true, at);
  }

  async function addLivePasskey() {
    if (addingKey) return;
    addingKey = true;
    addSaid = null;
    const at = opened();
    const out = await passkeyRegister();
    closed(true, at);
    addingKey = false;
    if (out.ok) liveKeys = [...(liveKeys ?? []), out.value];
    addSaid = out.ok
      ? copy.passkeyAdded
      : out.kind === 'cancelled'
        ? copy.passkeyNotAdded
        : out.kind === 'exists'
          ? copy.passkeyExists
          : copy.passkeyFailed;
  }

  async function dropPasskey(id: string) {
    const at = opened();
    const out = await removePasskey(id);
    closed(true, at);
    if (out.ok) liveKeys = liveKeys?.filter((k) => k.id !== id) ?? null;
    else toasts.push(copy.passkeyNotRemoved, { intent: 'warn' });
  }

  async function signOutHere() {
    if (signingOutNow) return;
    signingOutNow = true;
    const at = opened();
    const out = await signOut();
    closed(true, at);
    signingOutNow = false;
    if (out.ok && hostAuth) {
      hostAuth = { ...hostAuth, me: null };
      liveKeys = null;
    }
    outSaid = out.ok ? copy.signedOut : copy.signOutFailed;
  }

  function promote(decl: PageDecl) {
    toasts.push(copy.notWritten(`${decl.title} would be placed at the end of its section in your nav`), { intent: 'warn' });
  }

  /**
   * THIS SCREEN COMPUTES ITS CONTENT SYNCHRONOUSLY, and says so.
   *
   * `data-screen` on `<main id="main">` is what lets anything outside the page tell a drawn screen
   * from a shell that has fetched nothing. Four browser gates waited on `#main` having a child,
   * with the wait swallowed by a `catch`, which is satisfied by a page heading and means nothing
   * the day a screen fetches. `Empty` says `empty` or `refused` for the states it draws; this is
   * the other claim, and it is true of this screen today.
   *
   * IT STOPS BEING AVAILABLE WHEN IT STOPS BEING TRUE. A screen that starts fetching brackets its
   * reads with `opened()` and `closed()`, and a call still out takes the attribute away whatever
   * this line says.
   */
  $effect(() => drew('ready'));
</script>

<svelte:head><title>{titleOf(known?.label, copy.settings)}</title></svelte:head>

{#if !known}
  <div class="gone">
    <Empty
      kind="error"
      heading
      title={copy.noSuch('settings area', area)}
      body={copy.theseExist('Settings areas', AREAS.map((a) => a.label))}
    >
      {#snippet actions()}<Button href="/settings/appearance">{copy.settings}</Button>{/snippet}
    </Empty>
  </div>
{:else}
<PageHead icon="settings" kicker={copy.settings} title={known.label} />

<div class="shell">
  <nav class="areas" bind:this={rail} aria-label={copy.settings}>
    {#each AREAS as a}
      <a class="area" href="/settings/{a.id}" aria-current={a.id === area ? 'page' : undefined}>
        <Icon name={a.icon} size="s" />
        {a.label}
      </a>
    {/each}
  </nav>

  <div class="body">
    {#if area === 'appearance'}
      <!--
        THE RECORD'S OWN COLOUR. `@braindog/theme` solves an entire coherent palette from one seed
        against every floor it defines, and until now nothing called it with anything but the house
        red — so a bakery and a type foundry looked identical. The swatches are suggestions, not the
        set: any colour that passes goes in, and one that does not says which floor it missed rather
        than being quietly approximated.
      -->
      <!--
        AND EVERY ONE OF THESE SAYS WHICH IS ON, to something that is not a stylesheet.

        Fifteen buttons on this screen — six swatches and nine segments — carried `data-on` and no
        `aria-pressed`. Measured on the deployed build: `aria-pressed` was `null` on all fifteen,
        so a screen reader heard "Light button, System button, Dark button" and could not tell
        which one the record was in. `13 §5.1` is that the meaning cannot live in the styling
        alone, and the People matrix four hundred lines down cites that rule and gets it right —
        which is the tell: the fix was known here, written down here, and applied to one group.
      -->
      <Section title={copy.accentTitle}>
        <p class="hint">{copy.accentHint}</p>
        <div class="swatches" role="group" aria-label={copy.accentTitle}>
          {#each ACCENTS as a}
            <button
              type="button"
              class="swatch"
              aria-pressed={accent === a.hex}
              data-on={accent === a.hex ? '' : undefined}
              style="--swatch:{a.hex}"
              aria-label={a.name}
              onclick={() => pickAccent(a.hex)}
            >
              {#if accent === a.hex}<Icon name="check" size="s" />{/if}
            </button>
          {/each}
          <button
            type="button"
            class="swatch swatch-off"
            aria-pressed={accent === null}
            data-on={accent === null ? '' : undefined}
            onclick={() => pickAccent(null)}
          >
            {copy.accentHouse}
          </button>
        </div>
        {#if accentWrong}<p class="wrong">{accentWrong}</p>{/if}
      </Section>

      <Section title={copy.scheme}>
        <div class="segmented" role="group" aria-label={copy.scheme}>
          {#each [['light', copy.schemeLight, 'sun'], ['system', copy.schemeSystem, 'monitor'], ['dark', copy.schemeDark, 'moon']] as const as [v, label, icon]}
            <button type="button" class="segment" aria-pressed={scheme === v} data-on={scheme === v ? '' : undefined} onclick={() => pickScheme(v)}>
              <Icon name={icon} size="s" />
              {label}
            </button>
          {/each}
        </div>
      </Section>

      <!--
        THE PALETTE THAT COULD NOT BE TURNED ON.

        `packages/theme` solves a second palette against a higher contrast floor, `theme.mjs` writes
        it into `house.css` behind `html[data-theme='hc']`, and `theme.mjs --check` byte-compares it
        on every build. Nothing in `apps/web/src` ever set that attribute, so sixteen checks' worth
        of generated work was unreachable by the reader it exists for.

        WHAT WAS IN ITS WAY WAS THE ACCENT. `data-theme` carried two meanings and only one of them
        was ever read: `house.css` has four `data-theme` selectors and all four say `hc`, while
        `accent.ts` builds its palette into an adopted stylesheet and needs no attribute at all. The
        one being written was the one nothing read.

        A SWITCH AND NOT A SEGMENT, because it is one thing that is on or off, and `13 §5.1` wants
        the state said in something other than styling: `aria-pressed` carries it.
      -->
      <Section title={copy.contrast}>
        <!-- ONE THING ON OR OFF IS A SWITCH beside the sentence that says what it does. It was two
             segments reading On and Off, which is a choice between two things. -->
        <div class="switch-row">
          <p class="hint">{copy.contrastHint}</p>
          <button
            type="button"
            class="switch"
            role="switch"
            aria-checked={moreContrast}
            aria-label={copy.contrast}
            onclick={() => pickContrast(!moreContrast)}><span class="switch-track"></span></button
          >
        </div>
      </Section>

      <Section title={copy.textSize}>
        <div class="segmented" role="group" aria-label={copy.textSize}>
          {#each [['sm', copy.textSmall], ['base', copy.textNormal], ['md', copy.textLarge]] as const as [v, label]}
            <button
              type="button"
              class="segment"
              aria-pressed={text === v}
              data-on={text === v ? '' : undefined}
              onclick={() => ((text = v), set('text', v))}>{label}</button
            >
          {/each}
        </div>
      </Section>

      <Section title={copy.density}>
        <div class="segmented" role="group" aria-label={copy.density}>
          {#each [['compact', copy.densityCompact], ['comfortable', copy.densityComfortable], ['roomy', copy.densityRoomy]] as const as [v, label]}
            <button
              type="button"
              class="segment"
              aria-pressed={density === v}
              data-on={density === v ? '' : undefined}
              onclick={() => ((density = v), set('density', v))}>{label}</button
            >
          {/each}
        </div>
      </Section>

      <!-- DENSITY AND TEXT SHOW THEIR EFFECT WHERE THEY ARE SET. Their whole effect is `--row-h` and
           `--text`, which only lists read, so pressing Roomy here changed nothing on this screen and a
           person had to leave to find out what they had chosen. Three rows drawn the way a list draws
           them answer it in place, with no toast. -->
      <Section title={copy.densityPreview}>
        <ul class="density-preview" aria-hidden="true">
          {#each copy.densityPreviewRows as row}<li>{row}</li>{/each}
        </ul>
      </Section>
    {:else if area === 'keyboard'}
      <Section title={copy.characterKeys}>
        <!-- THE SENTENCE THAT SAYS WHAT THE SWITCH DOES. It was written, and allow-listed in
             `dead-copy` as *"UNBUILT — `/settings/keyboard` is a heading and two unexplained
             buttons"* — the gate knowing, in those words, that a compound noun and two buttons were
             all a reader got. `19 §4` calls this the app's WCAG 2.1.4 conformance; a switch whose
             effect nobody states is a switch nobody turns on deliberately. -->
        <div class="switch-row">
          <p class="hint">{copy.characterKeysHint}</p>
          <button
            type="button"
            class="switch"
            role="switch"
            aria-checked={chars}
            aria-label={copy.characterKeys}
            onclick={() => (chars = !chars)}><span class="switch-track"></span></button
          >
        </div>
      </Section>
      <!--
        THE SHEET, ON THE ONE SCREEN THAT CAN STILL REACH IT.

        `keymapOpen` is set in exactly one place, `+layout.svelte`'s `?` branch, and `?` is a single
        character, so the moment the switch above is pressed Off the app's entire keyboard
        documentation becomes unreachable. Permanently, and for the reader who used the
        accessibility control. The palette's nearest row, `c-keys`, lands here on the switch, and
        there was no menu item and no button anywhere else.

        Silencing `?` is correct under 2.1.4. Having only one opener was not. So the document lives
        here as well, under the control that governs it, where the marks it now draws on the
        silenced rows answer the reader's actual question: what did I just turn off.

        `silenced={!chars}` and not the cookie, because `chars` is this page's own state and the
        cookie is written by the effect below: reading the cookie would show the previous answer
        until the page reloaded.
      -->
      <Section title={copy.keymap}>
        <Keymap silenced={!chars} />
      </Section>
    {:else if area === 'navigation'}
      <!--
        THE SWITCH THIS AREA WAS ADDED TO HOLD, and the area shipped without it.

        `19 §2`: *"`navigation` was missing too: it holds the *Suggest new pages* switch that `29 §4`
        places there."* `29 §4` gives its shape exactly — *"one global switch, the same shape as
        `Character keys: off`"* — so it is the same control, not a new one.

        WHAT IT TURNS OFF IS THE PROPOSING, NOT THE PAGES. `29 §2`: movement is forward-only and needs
        a user action, and *"the system never writes nav order after first install"*. So off empties
        the holding pen and stops it refilling; nothing already placed moves, and nothing is lost.
        Saying that is the whole difference between a switch somebody turns off once and a switch
        somebody is afraid of.
      -->
      <!--
        WHERE THE NAVIGATION LIVES, which is this area's own subject and was not on it.

        `19 §3` carries five shapes and three conditions. Two of the five are not choices: the tab
        bar is what a narrow screen gets whatever is picked here, and the collapsed rail is a width
        rather than a shape, set by `⌘\` and by the control at the head of the rail because a wide
        monitor and a laptop honestly want different answers. The three that are choices are here.

        AND THE PHONE SENTENCE IS NOT A DISCLAIMER. A reader who picks a top bar and then opens the
        same record on a phone should have been told what they will find, rather than discovering
        that the setting they chose is one this product quietly overrules.
      -->
      <Section title={copy.navShape}>
        <p class="hint">{copy.navShapeHint}</p>
        <div class="segmented" role="group" aria-label={copy.navShape}>
          {#each [['rail', copy.navShapeRail, 'rows'], ['bar', copy.navShapeBar, 'grid'], ['menu', copy.navShapeMenu, 'more']] as const as [v, label, icon]}
            <button type="button" class="segment" aria-pressed={navShape === v} data-on={navShape === v ? '' : undefined} onclick={() => (navShape = v)}>
              <Icon name={icon} size="s" />
              {label}
            </button>
          {/each}
        </div>
        <p class="hint">{copy.navShapeOnPhone}</p>
        <p class="hint">{copy.perDevice}</p>
      </Section>

      {#if navRecShown && navRec}
        <!--
          THE DESIGN AGENT'S RECOMMENDATION, drawn the same way `settings/navigation` already draws
          a proposed page below: one row in a `.ledger`, a plain sentence, and a button that acts
          rather than a switch that silently rearranges anything (`19 §3`).

          NEVER APPLIED. `acceptNavRec` only sets the value the segmented control above already
          writes through; there is no second path into `navShape`, so the recommendation can never
          take effect without this click.
        -->
        <Section title={copy.navShapeRecommend}>
          <ul class="ledger ledger-glyph">
            <li>
              <div class="line">
                <span class="seq"><Icon name="learning" size="s" /></span>
                <span class="line-main">
                  <span class="line-title">{navShapeLabel(navRec.shape)}</span>
                  <span class="line-detail">{navRec.reason}</span>
                </span>
                <span class="line-amount"></span>
                <span class="line-when">
                  <Button weight="quiet" onclick={() => acceptNavRec(navRec)}>{copy.navShapeRecommendAccept(navShapeLabel(navRec.shape))}</Button>
                  <Button weight="bare" onclick={() => dismissNavRecommendation(navRec)}>{copy.navShapeRecommendDismiss}</Button>
                </span>
              </div>
            </li>
          </ul>
        </Section>
      {/if}

      <Section title={copy.suggestPages}>
        <div class="switch-row">
          <p class="hint">{copy.suggestPagesHint}</p>
          <button
            type="button"
            class="switch"
            role="switch"
            aria-checked={suggestPages}
            aria-label={copy.suggestPages}
            onclick={() => (suggestPages = !suggestPages)}><span class="switch-track"></span></button
          >
        </div>
        <!-- `19 §3` and `29 §4` both say this belongs to the record and not to the device, and there
             is no table in `30 §1` that could hold it — `50 §10` owns the deviation. The screen says
             which it is rather than letting somebody assume the durable one. -->
        <p class="hint">{copy.perDevice}</p>
      </Section>

      <Section title={copy.suggested} count={suggestPages ? pen.length : 0}>
        {#if !suggestPages}
          <!-- NOT `no-data-yet`, WHICH WOULD BE A LIE ABOUT THE RECORD. `19 §6` separates the five
               empty states precisely so that "nothing has happened yet" and "you turned this off"
               cannot read the same. -->
          <Empty kind="cleared" title={copy.suggestOff} body={copy.suggestOffWhy} />
        {:else if pen.length === 0}
          <Empty kind="cleared" title="Nothing waiting." />
        {:else}
          <ul class="ledger ledger-glyph">
            {#each pen as p}
              <li>
                <div class="line">
                  <span class="seq"><Icon name="doc" size="s" /></span>
                  <span class="line-main">
                    <span class="line-title">{p.title}</span>
                    <!-- `register.people` is the requirement's own qualified id. What a reader
                         wants is which of their lists it was built from. -->
                    <span class="line-detail">
                      {copy.holdingPen} Built from your {REGISTERS[String(p.requires[0] ?? '').replace('register.', '')]?.name ?? 'rows'}.
                    </span>
                  </span>
                  <span class="line-amount"></span>
                  <span class="line-when">
                    <Button weight="quiet" onclick={() => promote(p)}>Place in nav</Button>
                  </span>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </Section>
    {:else if area === 'people'}
      <!--
        IT WAS A LIST WITH NO CONTROLS, on the screen called People & sharing.

        You could see who had access and could not change it, could not invite anybody, and could
        not take it away — one of the five areas that were "real", and the one whose whole subject
        is a thing you do. `19 §2` names it beside `recovery` as an area an earlier draft dropped.

        `45 §5.6` HAS ONE METHOD FOR ALL THREE, which is why this is one control and not three:
        `invite({ person, levels, why })` deletes the person's `member` rows and re-inserts from
        `levels`, so a level change and a removal are the same call with a different argument.
      -->
      <!--
        ONE PERSON IS NOT A COMPARISON, AND THIS AREA DREW THE WHOLE APPARATUS OF ONE.

        On a record whose only person is you: a six-position level segment with five positions
        greyed, two standing hints explaining the greyness, an exceptions control for exceptions to
        a level nobody else holds, a mock invitation, and a red erasure whose only candidate is the
        reader. Every one of those is a fact about a comparison with nothing to compare, and the
        heading counted the reader as a person on their own record.

        `USABILITY.md`'s second question is that the product should be SMALLER at one row than at
        four hundred and get bigger by itself. So at one person this area is one sentence and one
        control, and the segments, the exceptions, the two hints and the erasure appear on the day
        a second person exists, which is the day each of them means something.
      -->
      {#if peopleFrom === 'reading'}
        <Section title={copy.whoCanSee}>{''}</Section>
      {:else if peopleFrom === 'refused' || peopleFrom === 'unrouted'}
        <Section title={copy.whoCanSee}>
          <Empty kind="error" title={peopleRefusal} />
        </Section>
      {:else if alone}
        <Section title={copy.whoCanSee}>
          <p class="hint">{copy.onlyPerson}</p>
        </Section>
      {:else}
        <Section title={copy.whoCanSee} count={people.length}>
          <p class="hint">{copy.accessScope}</p>
          <!-- TWO LINES PER PERSON, and not the five-column `.line` every other ledger uses.

               The control is five buttons wide and the sentence beside it is a full clause, so in one
               row of that grid the email clipped mid-address and the sentence saying what the person
               can DO was squeezed out of existence — leaving five bare ladder words as the only
               answer to the question this screen exists for. Who they are on the first line, what they
               can do on the second, and the sentence directly under the control that sets it. -->
          <ul class="whos">
            {#each people as p (p.id)}
              <li class="who">
                <div class="who-head">
                  <Face name={p.name} you={self(p)} />
                  <span class="who-name">{p.name}</span>
                  <!-- THE EMAIL, because that is what the invitation is bound to (12 §3) and what
                       tells two people with one name apart. And WHEN, because access with no date is
                       a list you cannot audit. -->
                  <!-- AND WHETHER THEY HAVE LOOKED. `20 §6` — *"Read marks on decisions: who has
                       seen the thing that binds them"* — is the one row of its table this screen
                       could not draw: `member.seen_at` has been in the DDL since migration 0001 and
                       `members()` returns it per person, and the browser's mirror stopped one column
                       short. So the screen said what four people MAY do and nothing about whether any
                       of them had been.

                       ONLY FOR SOMEBODY WHO HAS ACCEPTED. An invitation still out has also never been
                       looked at, and saying so twice in one line is saying nothing. -->
                  <span class="who-detail">
                    {#if peopleFrom === 'live'}
                      <!-- A RECORD KEEPS NO ACCEPTANCE DATE, so it says when they last looked and nothing it cannot know. -->
                      {p.email || p.id} · {p.seen ? copy.lastLooked(since(p.seen, peopleNow())) : copy.neverLooked}{#if p.suspended}{' · '}{copy.suspendedSince(relative(p.suspended, peopleNow()))}{/if}
                    {:else}
                    {p.email} · {p.since ? copy.sinceWhen(relative(p.since, NOW)) : copy.inviteOut}{#if p.since}{' · '}{p.seen ? copy.lastLooked(since(p.seen, NOW)) : copy.neverLooked}{/if}{#if p.suspended}{' · '}{copy.suspendedSince(relative(p.suspended, NOW))}{/if}
                    {/if}
                  </span>
                  <span class="who-do">
                  <Button
                    weight="bare"
                    tone="bad"
                    disabled={lastOwner(p) || self(p) || peopleBusy}
                    aria-describedby={lastOwner(p) ? 'last-owner' : self(p) ? 'own-level' : undefined}
                    onclick={() => takeAway(p)}
                  >{copy.removeAccess}</Button>
                  </span>
                </div>
                <div class="who-level">
                  <!--
                    SIX OPTIONS, AND THE SIXTH IS NOT A LEVEL.

                    `member.level` is five words and `member` is a ROW that may not exist — and
                    `members.ts` records what it cost to conflate the two. `access()` first promoted a
                    scoped level to the record-wide one, so somebody invited to one list as its owner
                    owned the record; the fix then gave a scoped-only member `read`, which hands an
                    APPENDER a record-wide read, and `append`'s point is that it does not read. `null`
                    is the answer both versions were reaching for, and a control offering five words
                    could not say it.

                    It is first, not last: it is the state somebody is in before you decide anything,
                    and reading left to right the row now says *nothing on the record, then these
                    lists* — which is the sentence "invite the bookkeeper" makes.
                  -->
                  <div class="segmented levels" role="group" aria-label={copy.levelFor(p.name)}>
                    <!-- THE SIXTH OPTION IS NOT A LEVEL, AND ONLY THE COMMENT SAID SO. It rendered as
                         the first of six identical chips with the same `aria-pressed`, inside a group
                         labelled "What <name> can do" — so a screen reader heard six equivalent levels
                         and the screen showed six equivalent chips. `13 §5.1`: the meaning cannot live
                         in the styling alone. The accessible name says what it is, and the chip is set
                         apart from the ladder beside it. -->
                    {#each [null, ...LEVELS] as level}
                      <button
                        type="button"
                        class="segment"
                        class:level-none={level === null}
                        data-on={p.level === level ? '' : undefined}
                        aria-pressed={p.level === level ? 'true' : 'false'}
                        aria-label={level === null ? copy.noRecordLevelMeans : undefined}
                        disabled={(lastOwner(p) && level !== 'owner') || (self(p) && level !== p.level) || peopleBusy}
                        aria-describedby={lastOwner(p) && level !== 'owner'
                          ? 'last-owner'
                          : self(p) && level !== p.level
                            ? 'own-level'
                            : undefined}
                        onclick={() => levelChange(p, level)}
                      >{levelSaid(level)}</button>
                    {/each}
                  </div>
                  <!-- WHAT THE SELECTED ONE MEANS, said once, in a sentence, under the control that
                       sets it. Five ladder words with nothing explaining them is the schema's
                       vocabulary on the screen that decides who can change somebody's business. -->
                  <p class="means">{p.level === null ? copy.noRecordLevelMeans : (copy.levelMeans[p.level] ?? p.level)}</p>

                  <!--
                    THE EXCEPTIONS, WHICH ARE THE MATRIX.

                    `20 §1` materialises person × register × level and `19 §2` names the absence of a
                    screen for it as the reason this area was added back. Drawing the whole grid — five
                    people down, fourteen lists across — is the shape that makes a person close the
                    page: most cells are the same value, and the same value is the record level one
                    line up.

                    So the record level is the answer and these are the EXCEPTIONS to it. Somebody with
                    none has one line and nothing else, which is almost everybody; somebody with two
                    has two, named, with what they hold on each. It is the same information and it is
                    the difference between a table nobody reads and a sentence anybody can.
                  -->
                  {#if p.scoped.length > 0}
                    <ul class="exceptions">
                      {#each p.scoped as ex}
                        <li>
                          <span class="ex-list">{lists.find((l) => l.id === ex.register)?.name ?? REGISTERS[ex.register]?.name ?? ex.register}</span>
                          <!-- THE LEVEL, AND THEN WHAT IT MEANS. The cell showed the sentence alone — the
                               same sentence the record level one line up already shows — so you could
                               not see at a glance whether an exception was above or below it, which is
                               the one thing a matrix is for. The word is the comparison; the sentence
                               is what the word means. -->
                          <span class="ex-word">{levelSaid(ex.level)}</span>
                          <span class="ex-level">{copy.levelMeans[ex.level] ?? ex.level}</span>
                          <!-- NOT THE DANGER TONE. Going back to their level undoes an exception, which is
                               the safe direction, and red on it said the opposite. -->
                          <Button
                            weight="bare"
                            disabled={peopleBusy}
                            onclick={() => backToLevel(p, ex.register)}
                          >{copy.removeException}</Button>
                        </li>
                      {/each}
                    </ul>
                  {/if}
                  <!-- `45 §5.6` HAS ONE METHOD FOR ALL OF IT: `invite` takes the record level and the
                       register map together, so adding an exception is the same call as changing a
                       level. One control, because one call.

                       IN ITS OWN ROW, because as the next sibling after the `<ul>` it floated up beside
                       the list on a wide screen and read as belonging to the first exception. -->
                  <div class="ex-add">
                  {#if picking === p.id}
                    <!-- ONE LIST AND ONE LEVEL, then Add. It is the same `invite` as a level change, carrying the
                         exceptions that stay, so nothing else they hold moves. -->
                    <form class="ex-pick" onsubmit={(e) => saveException(e, p)}>
                      <label class="ex-field">
                        <span class="ex-label">{copy.exceptionList}</span>
                        <select class="ex-select" bind:value={pickList}>
                          {#each lists as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
                        </select>
                      </label>
                      <label class="ex-field">
                        <span class="ex-label">{copy.exceptionLevel}</span>
                        <select class="ex-select" bind:value={pickLevel}>
                          {#each LEVELS as level}<option value={level}>{levelSaid(level)}</option>{/each}
                        </select>
                      </label>
                      <Button weight="primary" type="submit" disabled={peopleBusy || !pickList}>{copy.exceptionAdd}</Button>
                      <Button weight="bare" onclick={() => (picking = null)}>{copy.exceptionCancel}</Button>
                    </form>
                  {:else}
                  <Button
                    weight="bare"
                    disabled={peopleBusy}
                    onclick={() => startException(p)}
                  ><Icon name="plus" size="s" />{copy.addException}</Button>
                  {/if}
                  </div>
                </div>
              </li>
            {/each}
          </ul>
          <!-- `LEVEL_REQUIRED`'s own fix sentence, and it is always on screen rather than inside the
               refusal — a disabled control whose reason arrives only after you press it is a control
               that has already wasted the press. -->
          <p class="hint" id="last-owner">{copy.lastOwner}</p>
          <!-- BESIDE THE CONTROL, NOT AFTER THE PRESS, for the reason the line above it gives. -->
          <p class="hint" id="own-level">{copy.ownLevel}</p>
        </Section>
      {/if}

      <Section title={copy.inviteTitle}>
        <p class="hint">{copy.inviteHow}</p>
        <!-- NO MAIL LEAVES THIS HOST, and the sentence says so beside the control rather than after the press:
             the owner sends the link themselves, and somebody expecting an email would wait for one that never comes. -->
        <p class="hint">{copy.inviteNoMail}</p>
        <form class="code-form" onsubmit={makeInvite}>
          <label class="code-label" for="invite-email">{copy.inviteEmailLabel}</label>
          <div class="code-row">
            <div class="field field-lg">
              <input
                class="field-input"
                id="invite-email"
                type="email"
                autocomplete="off"
                autocapitalize="off"
                spellcheck="false"
                bind:value={inviteTo}
              />
            </div>
            <label class="ex-field">
              <span class="ex-label">{copy.inviteLevelLabel}</span>
              <select class="ex-select" bind:value={inviteLevel}>
                {#each LEVELS as level}<option value={level}>{levelSaid(level)}</option>{/each}
              </select>
            </label>
            <Button weight="primary" type="submit" disabled={inviting || !inviteTo.trim()} aria-busy={inviting}>
              <Icon name="plus" size="s" />{inviting ? copy.inviteMaking : copy.invitePerson}
            </Button>
          </div>
        </form>

        {#if madeLink}
          <!-- ONCE. The record keeps the hash and hands back the only copy of the link, so leaving this screen is
               the last of it; Done takes it off the screen deliberately rather than by navigation. -->
          <div class="invite-made">
            <p class="hint">{copy.inviteLinkReady(madeLink.email)}</p>
            <div class="code-row">
              <div class="field field-lg">
                <input class="field-input" id="invite-link" type="text" readonly aria-label={copy.inviteLinkLabel} value={madeLink.link} />
              </div>
              <Button weight="primary" onclick={copyLink}>{copy.inviteCopyLink}</Button>
              <Button weight="quiet" onclick={() => (madeLink = null)}>{copy.inviteDone}</Button>
            </div>
          </div>
        {/if}

        {#if waitingInvites.length > 0}
          <p class="invites-head">{copy.invitesWaiting}</p>
          <ul class="invites">
            {#each waitingInvites as inv (inv.id)}
              <li class="invite">
                <span class="invite-who">{inv.email}</span>
                <span class="invite-when">{copy.inviteWaitingRow(levelSaid(inv.level ?? 'read'), inv.expires_at.slice(0, 10))}</span>
                <Button weight="bare" tone="bad" disabled={peopleBusy} onclick={() => void withdraw(inv)}>{copy.inviteWithdraw}</Button>
              </li>
            {/each}
          </ul>
        {/if}
      </Section>

      <!-- AND ERASE ARRIVES WITH THE SECOND PERSON. On a record whose only person is you, the one
           candidate for a red, irreversible "Erase a person" is the person reading it. -->
      {#if !alone}
        <!-- `53 §5.8`: the owner erases a person from here, and it is the one control on this screen
             that is not about access at all — it is `02 §10`'s cascade over sixteen stores, in one
             transaction. It says which, because "erase" without a subject is a word nobody can act on. -->
        <Section title={copy.erasePerson}>
          <div class="danger">
            <p class="danger-title">{copy.eraseWhat}</p>
            {#if eraseOpen}
              <label class="code-label" for="erase-person">{copy.eraseWhichPerson}</label>
              <div class="field field-lg">
                <select class="field-input" id="erase-person" bind:value={erasePersonId}>
                  <option value="">{copy.eraseNobody}</option>
                  {#each people.filter((p) => p.level !== 'owner') as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
                </select>
              </div>
              <label class="code-label" for="erase-who">{copy.eraseWho}</label>
              <div class="field field-lg">
                <input class="field-input" id="erase-who" type="text" autocomplete="off" spellcheck="false" bind:value={eraseWho} />
              </div>
              <label class="code-label" for="erase-basis">{copy.eraseBasis}</label>
              <div class="field field-lg">
                <input class="field-input" id="erase-basis" type="text" autocomplete="off" bind:value={eraseBasis} />
              </div>
              <div class="row-actions">
                <Button
                  tone="bad"
                  disabled={eraseBusy || (!eraseWho.trim() && !erasePersonId) || !eraseBasis.trim()}
                  aria-busy={eraseBusy}
                  onclick={eraseNow}
                >{copy.eraseNow}</Button>
                <Button weight="bare" disabled={eraseBusy} onclick={() => (eraseOpen = false)}>{copy.keepAsIs}</Button>
              </div>
            {:else}
              <Button tone="bad" onclick={startErase}>{copy.erasePerson}</Button>
            {/if}
          </div>
        </Section>
      {/if}
    {:else if area === 'recovery'}
      <!--
        THE WAY BACK IN, and until now a dead end that said nothing about recovery.

        `19 §2`, verbatim: "`recovery` and `people & sharing` were missing from an earlier draft —
        the first left a passkey-primary product with NO DESIGNED WAY BACK IN." This build shipped
        the area and then left it saying "This area is part of the shell and is not wired in the
        mock-up", which is the same hole with a sentence in it.

        THERE IS NO ACCOUNT-RECOVERY FLOW AND THIS SCREEN DOES NOT INVENT ONE. `grep -rn "recovery
        code"` over all fifty-four documents returns nothing: the mechanism is a second passkey, and
        the fallback is the email link. Anything else here would be a control with nothing behind it
        on the one screen where that costs somebody their record.
      -->
      {#if livePasskeys}
        <!-- THE HOST'S OWN PASSKEYS, for somebody signed in to a host that offers them. Adding one is
             real only here, because only a live session can say whose passkey it is. -->
        <Section title={copy.passkeys} count={liveKeys?.length ?? 0}>
          <p class="hint">{copy.passkeyHow}</p>
          {#if liveKeys === null}
            <p class="hint">{copy.passkeysUnread}</p>
          {:else if liveKeys.length === 0}
            <Empty kind="no-data-yet" title={copy.noPasskeys} body={copy.noPasskeysWhy(livePasskeys.magic)} />
          {:else}
            <ul class="ledger ledger-glyph">
              {#each liveKeys as k (k.id)}
                <li>
                  <div class="line">
                    <span class="seq"><Icon name="key" size="s" /></span>
                    <span class="line-main">
                      <span class="line-title">{k.label ?? copy.passkeyUnnamed}</span>
                      <span class="line-detail">{copy.addedWhen(since(new Date(k.createdAt).toISOString()))}</span>
                    </span>
                    <span class="line-amount"></span>
                    <span class="line-when">
                      {k.lastUsed ? copy.usedWhen(since(new Date(k.lastUsed).toISOString())) : copy.neverUsed}
                      <Button
                        weight="bare"
                        tone="bad"
                        disabled={liveKeys.length <= 1}
                        aria-describedby={liveKeys.length <= 1 ? 'last-key' : undefined}
                        onclick={() => dropPasskey(k.id)}
                      >{copy.remove}</Button>
                    </span>
                  </div>
                </li>
              {/each}
            </ul>
            {#if liveKeys.length <= 1}<p class="hint" id="last-key">{copy.lastPasskey}</p>{/if}
          {/if}
          {#if canAddPasskey}
            <div class="row-actions">
              <Button weight="primary" onclick={addLivePasskey} aria-busy={addingKey}
                ><Icon name="plus" size="s" />{addingKey ? copy.addingPasskey : copy.addPasskey}</Button
              >
            </div>
          {/if}
          {#if addSaid}<p class="hint" role="status">{addSaid}</p>{/if}
        </Section>
      {:else}
      <!-- THE SAMPLE'S PASSKEYS, where nobody is signed in or the host offers none. There is no
           "Add a passkey" here: without a session there is nobody to add one for. -->
      <Section title={copy.passkeys} count={PASSKEYS.length}>
        <p class="hint">{copy.passkeyHow}</p>
        {#if PASSKEYS.length === 0}
          <Empty kind="no-data-yet" title={copy.noPasskeys} body={copy.noPasskeysWhy(AUTH_METHODS.magic)} />
        {:else}
          <ul class="ledger ledger-glyph">
            {#each PASSKEYS as k}
              <li>
                <div class="line">
                  <span class="seq"><Icon name="key" size="s" /></span>
                  <span class="line-main">
                    <span class="line-title">{k.label}</span>
                    <span class="line-detail">{copy.addedWhen(relative(k.added, NOW))}</span>
                  </span>
                  <span class="line-amount"></span>
                  <span class="line-when">
                    <!-- LAST USED IS THE COLUMN THAT MATTERS. A key you have not used in a year is
                         the one on the laptop you sold. -->
                    {k.lastUsed ? copy.usedWhen(relative(k.lastUsed, NOW)) : copy.neverUsed}
                    <Button
                      weight="bare"
                      tone="bad"
                      disabled={PASSKEYS.length <= 1}
                      aria-describedby={PASSKEYS.length <= 1 ? 'last-key' : undefined}
                      onclick={() => toasts.push(copy.notWritten(`${k.label} would stop being a way into this record`), { intent: 'warn' })}
                    >{copy.remove}</Button>
                  </span>
                </div>
              </li>
            {/each}
          </ul>
          {#if PASSKEYS.length <= 1}<p class="hint" id="last-key">{copy.lastPasskey}</p>{/if}
        {/if}
      </Section>
      {/if}

      <!-- AND THE ONE THAT IS OFFERED ONLY WHERE IT EXISTS. `49 §5.6`: on a self-host with no SMTP
           `GET /auth/methods` answers `magic: false` "so the screen never offers it". A recovery
           screen offering a link that cannot be sent is worse than one offering nothing. -->
      {#if (hostAuth ?? AUTH_METHODS).magic}
        <Section title={copy.magicLink}>
          <p class="hint">{copy.magicHow}</p>
        </Section>
      {/if}

      <Section title={copy.lockout}>
        <p class="hint">{copy.lockoutHow}</p>
      </Section>
    {:else if area === 'identity'}
      <!--
        THE DOCUMENTS SPECIFY NO SCREEN HERE, and this says what the record knows rather than
        inventing controls. `identity` is named once in `19 §2`'s inventory and elaborated nowhere —
        the only one of the twelve with no downstream section — and no route in the whole surface
        changes any `person` field, so a name or email editor would be a form with nothing behind it.

        `33 §10` is the fact that makes the area make sense at all: "Login is account-level — a
        person may hold several records — so identity lives OUTSIDE the record."
      -->
      <Section title={copy.you}>
        <ul class="facts">
          <!-- THE EMAIL, NOT THE PERSON ID. It printed `you` — the schema's own id for the signed-in
               human — while `/settings/people` one click away renders the same person as "You" with
               an address and a join date. `19 §9` bans a word the schema uses about itself, and an
               address is what an invitation binds to and what identifies you across the records
               listed below. -->
          <li><span class="fact-key">{copy.signedInAs}</span><span class="fact-value">{signedInEmail ?? mine?.email ?? mine?.name ?? me.person}</span></li>
          <li><span class="fact-key">{copy.onThisRecord}</span><span class="fact-value">{copy.levelMeans[me.level] ?? me.level}</span></li>
        </ul>
        <p class="hint">{copy.identityOutside}</p>
        <!-- AND THE WAY TO REACH ANOTHER RECORD, from the area that is about who this one
             thinks you are. The palette carries the same row; this is the one a person finds
             without knowing the palette exists. -->
        <!-- SIGNING OUT LIVES HERE, beside who you are signed in as, and it takes the place of the way
             in only while there is a session to end. -->
        <div class="row-actions">
          {#if signedInEmail}
            <Button onclick={signOutHere} aria-busy={signingOutNow}>{signingOutNow ? copy.signingOut : copy.signOut}</Button>
          {:else}
            <Button href="/signin">{copy.signIn}</Button>
          {/if}
        </div>
        {#if outSaid}<p class="hint" role="status">{outSaid}</p>{/if}
      </Section>

      <!-- "RECORDS YOU CAN OPEN" OVER TWO ROWS YOU COULD NOT OPEN. A heading that names an action
           above a list that does not offer it is the plainest kind of lie a screen can tell, and
           this one told it about the one thing the section exists for.

           THE ROW IS THE CONTROL, AND IT REPORTS THE SAME THING THE RAIL'S SWITCHER DOES. That menu
           had already solved this honestly: `href="/"` so it is a real link with a real address for
           the keyboard and the middle button, and a handler that says what would happen rather than
           silently doing nothing, because the record this build draws is a fixture. Two surfaces
           offering one act must not answer it two ways, so this is that answer and not a second
           one. The record you are already in is not a link at all: you are in it. -->
      <Section title={copy.yourRecords} count={me.records.length}>
        <ul class="ledger ledger-glyph">
          {#each me.records as r}
            {@const here = r.slug === SLUG}
            <li>
              <svelte:element
                this={here ? 'div' : 'a'}
                class="line"
                href={here ? undefined : '/'}
                role={here ? undefined : 'link'}
                onclick={here
                  ? undefined
                  : (e: MouseEvent) => {
                      e.preventDefault();
                      toasts.push(copy.notWritten(copy.otherRecord(r.name)));
                    }}
              >
                <span class="seq"><Icon name="rows" size="s" /></span>
                <span class="line-main"><span class="line-title">{r.name}</span></span>
                <span class="line-amount"><span class="means">{copy.levelMeans[r.level] ?? r.level}</span></span>
                <span class="line-when">{#if here}{copy.thisOne}{/if}</span>
              </svelte:element>
            </li>
          {/each}
        </ul>
        <!-- AND THE HEADING SAYS WHAT IT COULD NOT COUNT. The rows are the account's answer, so when
             that read is refused this section holds the record you are inside and nothing else. A
             section called "Records you can open" that quietly holds one row reads as a product with
             one record in it, which is a different claim from the true one. The rail's switcher
             reports the same sentence, because two surfaces offering one fact must not answer it
             two ways. -->
        {#if shell.recordsRefused}<p class="hint">{shell.recordsRefused}</p>{/if}
      </Section>
    {:else if area === 'agents'}
      <!--
        THE FIELD COMES FIRST, because a machine prints this address: the person arriving is holding six
        digits and looking for the box. A `<form>`, so Enter sends it.
      -->
      <Section title={copy.approveTitle}>
        <form class="code-form" onsubmit={tryCode} novalidate>
          <label class="code-label" for="user-code">{copy.codeLabel}</label>
          <div class="code-row">
            <div class="field field-lg">
              <!-- Paste is never blocked and there is no `maxlength`: the CLI prints the code in two
                   groups, and seven digits is refused out loud rather than trimmed to a different code. -->
              <input
                class="field-input code-input"
                id="user-code"
                type="text"
                inputmode="numeric"
                autocomplete="one-time-code"
                autocapitalize="off"
                spellcheck="false"
                placeholder={'0'.repeat(CODE_DIGITS)}
                value={typed}
                oninput={(e) => retype((e.currentTarget as HTMLInputElement).value)}
                aria-describedby="user-code-said"
                aria-invalid={answerLine?.tone === 'bad' ? 'true' : undefined}
              />
            </div>
            <Button weight="primary" type="submit" disabled={approving}>{copy.codeGo}</Button>
          </div>
          <!-- Always in the document: a live region inserted with its first sentence is not reliably announced. -->
          <p class="code-said" id="user-code-said" role="status" data-intent={answerLine?.tone}>{answerLine?.line ?? ''}</p>
          {#if answer?.kind === 'signin'}
            <div class="row-actions">
              <Button weight="quiet" disabled={reproving} onclick={() => void signInAgain()}>{copy.signInAgain}</Button>
            </div>
          {/if}
        </form>
      </Section>

      <!-- Every row the record keeps, denied ones included: "I said no to a request I did not make" (`12 §6.1`). -->
      <Section title={copy.machines} count={machines.length}>
        {#if agentsFrom === 'refused'}
          <Empty kind="error" title={agentsRefusal} />
        {:else if agentsFrom !== 'reading' && machines.length === 0}
          <Empty kind="no-data-yet" title={copy.noDevices} agentPrompt={copy.enrollPrompt} />
        {/if}
        <ul class="whos">
          {#each machines as d (d.handle)}
            {@const tone = DEVICE_TONE[d.status]}
            <li class="who" data-intent={tone}>
              <div class="who-head">
                {#if tone}
                  <span class="glyph" role="img" aria-label={TONES[tone].label}>{TONES[tone].glyph}</span>
                {:else}<Icon name="session" size="s" />{/if}
                <!-- The label the machine sent. The handle is how the record names the row, and it means nothing to a person. -->
                <span class="who-name">{d.label ?? copy.unnamedMachine}</span>
                <!-- `since`, because `last_used` is an instant and `relative` takes a day. -->
                <span class="who-detail">
                  {copy.deviceState[d.status] ?? d.status} · {d.last_used ? copy.usedWhen(since(d.last_used, agentsNow())) : copy.neverUsed}
                </span>
                <span class="who-detail who-reach">{copy.reachMeans[reachKey(d.reach, d.scope)] ?? d.reach}</span>
                <span class="who-do">
                  {#if revocable(d)}
                    <Button weight="bare" tone="bad" onclick={() => void revokeMachine(d)}>{copy.revokeKey}</Button>
                  {/if}
                </span>
              </div>
            </li>
          {/each}
        </ul>
      </Section>

      <!-- `12 §3`: what can act as you, with a revoke button, and never the secret itself. -->
      <Section title={copy.tokens} count={tokens.length}>
        {#if agentsFrom === 'live' || agentsFrom === 'sample'}
          {#if tokens.length === 0}
            <Empty kind="no-data-yet" title={copy.noKeys} />
          {/if}
        {/if}
        <ul class="whos">
          {#each tokens as t (t.id)}
            {@const report = reportKeyOf(t.label)}
            <!-- The one nobody has used is the one to look at, so it carries a mark as well as the words. -->
            <li class="who" data-intent={t.last_used_at === null ? 'warn' : undefined}>
              <div class="who-head">
                {#if t.last_used_at === null}
                  <span class="glyph" role="img" aria-label={TONES.warn.label}>{TONES.warn.glyph}</span>
                {:else}<Icon name="key" size="s" />{/if}
                <span class="who-name">{report ? copy.reportKeyNamed(report.name) : (t.label ?? copy.unnamedToken)}</span>
                <span class="who-detail">{report ? copy.reportKeyCan(report.register ? (REGISTERS[report.register]?.name ?? report.register) : '') : (copy.keyCan[t.scope] ?? t.scope)}</span>
                <span class="who-detail">
                  {t.last_used_at ? copy.usedWhen(since(t.last_used_at, agentsNow())) : copy.neverUsed}{#if t.expires_at}{' · '}{copy.endsWhen(relative(t.expires_at.slice(0, 10), agentsNow()))}{/if}
                </span>
                <span class="who-do">
                  <Button weight="bare" tone="bad" onclick={() => void revokeTokenRow(t)}>{copy.revokeKey}</Button>
                </span>
              </div>
            </li>
          {/each}
        </ul>

        <!--
          CONNECT AN AGENT. The bearer is drawn once, from `minted`, which Done and leaving the area both
          empty; nothing else on this screen holds it. The two lines carry no token (`48 §2`).
        -->
        {#if minted}
          {@const bearer = minted.bearer}
          <div class="code-form" role="status">
            <p class="code-label">{copy.tokenOnce}</p>
            <p class="mono wrap">{bearer}</p>
            <div class="row-actions">
              <Button weight="primary" onclick={() => void clipboard.put(bearer, copy.tokenCopied)}>{copy.copyToken}</Button>
            </div>
            <p class="code-label">{copy.onNewMachine}</p>
            <p class="mono wrap">{lines.login}</p>
            <div class="row-actions">
              <Button weight="quiet" onclick={() => void clipboard.put(lines.login, copy.lineCopied)}>{copy.copyLine}</Button>
            </div>
            <p class="code-label">{copy.inClaudeCode}</p>
            <p class="mono wrap">{lines.mcp}</p>
            <div class="row-actions">
              <Button weight="quiet" onclick={() => void clipboard.put(lines.mcp, copy.lineCopied)}>{copy.copyLine}</Button>
              <Button weight="bare" onclick={() => ((minted = null), (offer = null))}>{copy.connectDone}</Button>
            </div>
          </div>
          {#if offer}
            <div class="code-form">
              <p class="code-label">{copy.installDiff}</p>
              {#if offer.summary}<p class="who-why">{offer.summary}</p>{/if}
              <dl class="plan">
                <dt>{copy.diffAdds}</dt>
                <dd>
                  <ul class="plan-adds">
                    {#each offer.adds as add (add.kind + add.name)}
                      <li>
                        <Icon name={add.kind === 'list' ? 'rows' : 'doc'} size="s" />
                        <span class="plan-name">{add.name}</span>
                        <span class="plan-detail">{add.detail}</span>
                      </li>
                    {/each}
                  </ul>
                </dd>
                {#if offer.conflicts.length}
                  <dt>{copy.diffConflicts}</dt>
                  <dd>{#each offer.conflicts as c (c)}<p>{c}</p>{/each}</dd>
                {/if}
                <CallsOut calls={offerCalls} hosted={DEPLOYMENT.kind !== 'self-host'} />
                {#if offer.seeds}
                  <dt>{copy.diffSeeds}</dt>
                  <dd>{offer.seeds}</dd>
                {/if}
                <dt>{copy.diffTouches}</dt>
                <dd>{offer.touches}</dd>
              </dl>
              <div class="row-actions">
                <Button weight="primary" disabled={installing || offer.conflicts.length > 0} onclick={() => void installOffer()}>{copy.install}</Button>
                <Button weight="bare" onclick={() => (offer = null)}>{vaultWords.notNow}</Button>
              </div>
              <p class="code-said" role="status" data-intent={offerSaid ? 'bad' : undefined}>{offerSaid}</p>
            </div>
          {/if}
        {:else}
          <form class="code-form" onsubmit={connectAgent}>
            <label class="code-label" for="agent-label">{copy.connectTitle}</label>
            <div class="code-row">
              <div class="field">
                <input
                  class="field-input"
                  id="agent-label"
                  type="text"
                  maxlength={LABEL_MAX}
                  placeholder={copy.connectLabel}
                  aria-label={copy.connectLabel}
                  bind:value={mintLabel}
                  aria-describedby="agent-label-said"
                />
              </div>
              <Button weight="primary" type="submit" disabled={minting || mintLabel.trim() === ''}>{copy.connectGo}</Button>
            </div>
            <p class="code-said" id="agent-label-said" role="status" data-intent={mintRefusal ? 'bad' : undefined}>{mintRefusal}</p>
          </form>
        {/if}
      </Section>
    {:else if area === 'ingest'}
      <!--
        `25 §9` DRAWS THIS SCREEN, which makes it the one settings area where inventing a control is
        least excusable. Three status words, a last-run line, a next-run line, a failure line naming
        the credential by its VAULT LABEL rather than its value, and two buttons on the paused row
        only. `47 §12` gives the composition: one row per connector, from `PullResult` via the
        receipts and the schedule row.
      -->
      <Section title={copy.sources} {...shell.live ? {} : { count: SOURCES.length }}>
        <p class="hint">{copy.sourcesHow}</p>
        <!-- A LIVE RECORD LISTS ITS OWN SCHEDULED ACTIONS, with Resume and Reconnect that write. The
             connectors below are the sample's, and their buttons only say what would happen. -->
        {#if shell.live}
          <Actions project={null} />
        {:else}
        <!-- AND THE HINT ABOVE IS ABOUT MEMBERS OF THIS SET. "A figure fed by one of these shows a
             gap…" is a sentence about connectors, on a screen with none — so the state has to say
             there are none before that line makes sense. -->
        {#if SOURCES.length === 0}
          <Empty kind="no-data-yet" title={copy.noSources} body={copy.noSourcesWhy} agentPrompt={copy.ingestPrompt} />
        {/if}
<ul class="whos">
          {#each SOURCES as src}
            <li class="who" data-intent={src.state === 'ok' ? undefined : src.state === 'paused' ? 'bad' : 'warn'}>
              <div class="who-head">
                {#if src.state === 'ok'}<Icon name="inbox" size="s" />
                {:else}
                  {@const t = src.state === 'paused' ? 'bad' : 'warn'}
                  <span class="glyph" role="img" aria-label={TONES[t].label}>{TONES[t].glyph}</span>
                {/if}
                <span class="who-name">{src.name}</span>
                <span class="who-detail">
                  {copy.sourceState[src.state]} · {copy.lastRan(relative(src.lastAt, NOW))} ·
                  {src.nextAt ? copy.nextRun(relative(src.nextAt, NOW)) : copy.noNextRun} ·
                  {copy.pointsIn(src.points)}
                </span>
                <span class="who-do">
                  <!-- THE FAILING ROW HAD NO CONTROL AT ALL, and it is the row with the warning
                       glyph on it. Only `paused` got Reconnect and Retry now, so a source flagged
                       `failing` with zero rows in offered the reader nothing to do about it. The
                       two states want different things and neither wants nothing: a paused
                       connector needs its credential back, and a failing one needs to be asked
                       again, which is the whole of what "it retries on its own" leaves a person
                       able to hurry. -->
                  {#if src.state === 'paused'}
                    <Button
                      weight="primary"
                      onclick={() => toasts.push(copy.notWritten(`${src.error?.credential ?? src.name} would be reconnected, and the schedule started again`), { intent: 'warn' })}
                    >{copy.reconnect}</Button>
                  {/if}
                  {#if src.state !== 'ok'}
                    <Button
                      weight="bare"
                      onclick={() => toasts.push(copy.notWritten(`${src.name} would run once, now`), { intent: 'warn' })}
                    >{copy.retryNow}</Button>
                  {/if}
                </span>
              </div>
              <!-- THE SERVER'S `fix` SENTENCE, VERBATIM (13 §6), ON ITS OWN LINE SO IT WRAPS.
                   In the five-column ledger it was a `.line-detail` — one line, `overflow: hidden`,
                   ellipsis — so the sentence that says what to DO about a broken connector read
                   "Reconnect the credential — the provider rejected it; the connector is…". A `fix`
                   rendered verbatim and then cut is not rendered verbatim.

                   And the credential by the LABEL the vault indexes it under. A pull failure names
                   what to reconnect; naming the value would put a secret on a settings screen. -->
              <!-- THE CREDENTIAL NAMES WHAT TO RECONNECT, WHICH ONLY AN AUTH FAILURE HAS. The
                   suffix was unconditional, so a 429 read "The provider answered 429 three times.
                   It retries on its own. — Kestrel ingest" and pointed the reader at a credential
                   that is fine. `25 §9`'s own drawn mock names one on exactly one row — the 401 —
                   and gives the failing row its try count instead. It is right for
                   `PULL_AUTH_REJECTED` and wrong for the other six codes in the family. -->
              {#if src.error}
                <p class="who-why">
                  {src.error.fix}{#if src.error.code === 'PULL_AUTH_REJECTED'}{' · '}{src.error.credential}{/if}
                </p>
              {/if}
            </li>
          {/each}
        </ul>
        <!-- `25 §9`'s own blockquote, and it outranks the screen: "every chart fed by a stale series
             shows a gap and a stale badge. A dashboard that keeps yesterday's number on screen as if
             it were today's is the failure that actually costs somebody money." -->
        {/if}
        <p class="hint">{copy.staleShows}</p>
      <!-- THERE WAS NO WAY TO ADD ONE, and inventing a button would be worse: `25 §9` draws this
             screen without one, because a source is a declaration and arrives the way every
             declaration does (`04 §1`: `ingest` is one of the kinds an add-on carries). So the screen
             says where a new one comes from and links there. -->
        <p class="hint sources-add">{copy.sourcesAdd} <a class="tap" href="/packs">{copy.sourcesAddGo}</a></p>
      </Section>
    {:else if area === 'notifications'}
      <!--
        `09` SPECIFIES A COMPLETE MECHANISM WITH ZERO USER-CONFIGURABLE SETTINGS. Every constant is
        hard-coded, digests are pack declarations, no kernel table holds a preference and none of the
        sixty-four methods writes one. So this screen REPORTS rather than offers — and a row of
        toggles here would be four controls that write nothing, which is the failure this whole
        session has been removing.

        Muting is turned off at the source: edit or retire the rule that raises it.
      -->
      <Section title={copy.whenWeInterrupt}>
        <p class="hint">{copy.batchByDefault}</p>
        <ul class="facts">
          <li><span class="fact-key">{copy.quietHours}</span><span class="fact-value">{copy.quietHoursAre}</span></li>
          <li><span class="fact-key">{copy.urgentKinds}</span><span class="fact-value">{copy.urgentKindsAre}</span></li>
          <li><span class="fact-key">{copy.interruptCap}</span><span class="fact-value">{copy.interruptCapIs}</span></li>
          <li><span class="fact-key">{copy.unreadCount}</span><span class="fact-value">{copy.unreadCountIs}</span></li>
        </ul>
        <p class="hint">{copy.muteAtSource}</p>
      </Section>
    {:else if area === 'backups'}
      <!--
        `53 §5.4`: "Three mechanisms, one contract: nightly, sealed, thirty kept, restorable." And
        `03 §6` on why this is not the Export area: "A snapshot is not an export: it is a full copy
        … disaster recovery, not portability."
      -->
      <!-- THE COUNT IS WHAT IS KEPT, and a night that kept nothing is not one. It read "What is kept
           · 4" over three copies and a row saying *nothing kept* — counting the failure as a backup,
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
        <p class="hint">{DEPLOYMENT.kind === 'self-host' ? copy.keptSelfHost(SNAPSHOTS_KEPT) : copy.keptCloud(SNAPSHOTS_KEPT)}</p>
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
                  <span class="line-detail">{relative(snap.at, copiesNow())}{#if snap.failed}{' · '}<span class="why-failed">{snap.failed}</span>{/if}</span>
                </span>
                <!-- A NIGHT THAT PRODUCED NOTHING SAYS SO, AND SAYS WHY. `12 §8`: "A backup that
                     silently gave up is worse than none" — which is the argument for these two
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
                    {#if copiesFrom === 'live' || (copiesFrom !== 'refused' && DEPLOYMENT.kind === 'self-host')}
                      <Button weight="bare" onclick={() => downloadCopy(snap.id)}>{copy.download}</Button>
                    {/if}
                    {#if copiesFrom === 'live'}
                      <Button weight="bare" onclick={() => (restoring = snap.id)}>{copy.restoreThis}</Button>
                    {/if}
                  {/if}
                </span>
              </div>
            </li>
          {/each}
        </ul>
        <div class="row-actions">
          <Button weight="primary" disabled={backingUp} aria-busy={backingUp} onclick={backUp}>{copy.snapshotNow}</Button>
        </div>
      </Section>

      <!-- `49 §8`, and it asks for exactly this: the key "is what a self-hoster must back up
           SEPARATELY — Settings → backups says so in one line." A snapshot sealed with a key that
           is only inside the snapshot is a snapshot nobody can open. -->
      <Section title={copy.theKey}>
        <!-- IT GAVE AN INSTRUCTION AND WITHHELD THE ONE THING NEEDED TO FOLLOW IT. This section had
             no button, no link and no value: "Back that key up somewhere else, or the copies cannot
             be opened" over an empty box. `12 §8` keeps the age identity outside the product on
             purpose, so the fix is not to print it here; it is to say where it already is. -->
        <p class="hint">{copy.theKeyIs}</p>
        <p class="hint">{copy.theKeyWhere}</p>
      </Section>

      <!-- `03 §6`: "PITR is Cloud-only and this is DOCUMENTED, NOT HIDDEN." `33 §9`: a self-host
           "has no PITR and does not serve `restore`". So the fact is stated where somebody would go
           looking for the control, rather than the control being drawn and then refusing. -->
      <!--
        `03 §6`: "PITR is Cloud-only and this is DOCUMENTED, NOT HIDDEN." `33 §9`: a self-host "has no
        PITR and does not serve `restore`". So the fact is stated where somebody would go looking for
        the control, rather than the control being drawn and then refusing.

        AND ON CLOUD IT IS A CONTROL. `53 §5.5(a)` puts it here by name — *"The owner, Settings →
        backups → restore to a time — `POST /api/restore { at }`"* — and this area held the sentence
        and not the button, which is the one thing a person comes to a backups screen to do.
      -->
      <Section title={copy.restore}>
        <p class="hint">{copiesFrom === 'live' ? copy.restoreLive : DEPLOYMENT.kind === 'self-host' ? copy.restoreSelfHost : copy.restoreCloud}</p>
        {#if restoring}
          <div class="danger">
            <p class="danger-title">{copy.restoreConfirm(restoring)}</p>
            <div class="row-actions">
              <Button tone="bad" disabled={restoreBusy} aria-busy={restoreBusy} onclick={restoreCopy}>{copy.restoreThis}</Button>
              <Button weight="bare" disabled={restoreBusy} onclick={() => (restoring = null)}>{copy.keepAsIs}</Button>
            </div>
          </div>
        {/if}
        {#if DEPLOYMENT.kind !== 'self-host' && copiesFrom !== 'live'}
          <ul class="facts">
            <!-- WHAT IT COSTS, BEFORE THE PRESS. `53 §5.5`: a bookmark restore rewinds the database,
                 so every write after the chosen instant is gone — and its own rollback is another
                 point in time, valid for thirty days. `45 §5.6` makes it two phases for exactly that
                 reason. A control this destructive that says nothing until afterwards is a control
                 nobody should press. -->
            <li><span class="fact-key">{copy.restoreLoses}</span><span class="fact-value">{copy.restoreLosesWhat}</span></li>
            <li><span class="fact-key">{copy.restoreBack}</span><span class="fact-value">{copy.restoreBackHow}</span></li>
          </ul>
          <div class="row-actions">
            <Button onclick={restoreToTime}>{copy.restoreTo}</Button>
            <!-- `53 §5.5`'s precondition: *"the owner knows the last good instant — `/audit` shows
                 every write with its time"*. The control that answers it is one link away. -->
            <Button weight="bare" href="/audit">{copy.findTheMoment}</Button>
          </div>
        {/if}
      </Section>
    {:else if area === 'billing'}
      <!--
        THERE IS NOTHING TO BILL ON A SELF-HOST, and `23 §8`'s precedent for exactly this shape is
        "one line in Settings". `53 §5.10` puts the whole ladder "in the Worker and nothing in the
        record, so the record package stays billing-agnostic"; `33 §10` holds the state in the Cloud
        Directory. The area cannot simply be removed — `50 §2.2` admits the twelve of `19 §2` with
        no per-deployment conditional and `50 §13 D2` builds one artefact for both hosts — so it
        says which deployment this is and what that means.

        `ADR-059`'s line is here because it is the promise the whole product rests on and it is TRUE
        on a self-host in the strongest possible way: "At no point is export withheld."
      -->
      <Section title={copy.billing}>
        <p class="hint">{DEPLOYMENT.kind === 'self-host' ? copy.billingSelfHost : copy.billingCloud}</p>
        <div class="row-actions">
          <Button weight="quiet" href="/usage"><Icon name="history" size="s" />{actionWords.seeUsage}</Button>
          <Button weight="quiet" href="/settings/export"><Icon name="download" size="s" />{copy.export}</Button>
        </div>
      </Section>
    {:else if area === 'delete'}
      <!-- ITS OWN AREA, AND IT WAS THE LAST SECTION OF `Export`. See `AREAS`: a person looking for
           a copy of their data found the one act with no rollback. -->
      <!-- `Danger` IS A ONE-WORD HEADING THAT STATES NO FACT, over a line saying `Delete this
           record` over a button saying `Delete the studio` — three lines, two of them the same
           sentence, and the two disagreeing about what the record is called. One sentence saying
           what happens, and the button that does it. -->
      <!--
        AND THE CONFIRMATION IS THE CONTROL, not a sentence about one.

        Four documents give the same flow — `02 §9` (*"an ADMIN method, browser session,
        re-authenticated, **the slug typed**"*), `33 §4`, `33 §10`, `19 §2` — and the screen was one
        button whose toast said *"Deleting a record asks you to type its name first"*. A control that
        DESCRIBES its own safeguard has not got one: the description is exactly as far as the product
        went, on the one action `53 §5.9` says has no rollback after step 2.

        The field is the gate. The button is disabled until the slug is typed, so the safeguard is a
        thing you do rather than a thing you are told about. Re-authentication is the half nothing
        specifies HOW to do — `49 §4.2`'s `authed_at` is the only lever the documents give — so the
        screen says it will be asked for rather than inventing a mechanism.
      -->
      <Section title={copy.deleteRecord(RECORD)}>
        <div class="danger">
          <p class="danger-title">{copy.deleteWhat(RECORD)}</p>
          <!-- WHAT IT COSTS, BEFORE THE FIELD. `53 §5.9`: *"Rollback: none after step 2 … by day +30
               nothing of the record remains anywhere"*, and a final snapshot exists only so that a
               same-day "wait" is answerable. -->
          <p class="danger-why">{copy.deleteCosts}</p>
          <label class="code-label" for="delete-slug">{copy.typeSlug(SLUG)}</label>
          <div class="code-row">
            <div class="field field-lg">
              <input
                class="field-input"
                id="delete-slug"
                type="text"
                autocapitalize="off"
                spellcheck="false"
                autocomplete="off"
                bind:value={typedSlug}
              />
            </div>
          <Button
            tone="bad"
            disabled={typedSlug.trim() !== SLUG}
            aria-busy={deleting}
            onclick={deleteNow}
            >{copy.deleteRecord(RECORD)}</Button
          >
          </div>
          {#if deletedSaid}<p class="hint" role="status">{deletedSaid}</p>{/if}
        </div>
      </Section>

    {:else if area === 'export'}
      <Section title={copy.yourData}>
        <!-- THE WHOLE CONTENT OF THIS SCREEN WAS TWO DEAD BUTTONS, on the page that carries the
             product's central promise: take your record and go. They say what they would do.

             AND ONE OF THEM DESCRIBED THE WRONG FILE. It read "written to a .dog file, LINE PER
             ROW", which welds together the two containers `03 §2.1` keeps in separate columns: a
             `.brain` is a SQLite database you open with `sqlite3` and no SDK, and a `.brainl` is
             the canonical logical dump — one JSON row per line — that the record streams out of a
             Durable Object in pages. Both are signed over the same manifest, which is why `verify`
             and `import` take either; they are not the same artefact and the sentence made the
             database sound like a text format.

             THE EXTENSIONS MOVED, AND THE REASON IS WORTH KEEPING. These two were `.dog` and
             `.dogl` until the record gave the name up: `.dog` is a PAGE's source now, one page to
             a file, which is what somebody means when they open the source of a page. The three
             layers are unchanged — only the name on the container moved. -->
        <p class="hint">{copy.exportWhat}</p>
        <div class="row-actions">
          <Button
            disabled={exporting !== null}
            aria-busy={exporting === 'record'}
            onclick={() => takeCopy('record', 'The whole record would be written to one .brain file, a SQLite database you can open with sqlite3')}
          >{copy.export}</Button>
          <!-- A REAL CHECK, IN THIS BROWSER. It said what it would do, on a record as on the sample; it runs the
               import's own `checkBrainl` now: the format line, every table against its manifest, then the signature. -->
          <Button weight="bare" disabled={checking} aria-busy={checking} onclick={() => checkInput?.click()}>{copy.verifyFile}</Button>
          <input
            bind:this={checkInput}
            class="file-pick"
            type="file"
            accept=".brainl"
            tabindex="-1"
            aria-hidden="true"
            onchange={(e) => void checkFile(e.currentTarget.files?.[0])}
          />
        </div>
        {#if checkSaid}
          <p class="hint checked" data-intent={checkSaid.tone} role="status">
            <span class="glyph" role="img" aria-label={TONES[checkSaid.tone].label}>{TONES[checkSaid.tone].glyph}</span>
            {checkSaid.text}
          </p>
        {/if}
      </Section>

      <!-- AND THE SLICE, WHICH IS A DIFFERENT FILE FOR A DIFFERENT JOB.

           `03 §1`: the three layers are addressable independently, and that is what makes the useful
           operations cheap — "export data without origin (a clean handover), export origin without
           data (an audit), export governance alone (share a way of working — THAT IS A PACK)."

           The screen offered one button for the whole record and nothing for the other three, so the
           only exit this product appeared to have was all-or-nothing. A pack is the readable-text
           half: your lists, pages, metrics and rules without a single row of your business in it. -->
      <Section title={copy.takeAway}>
        <p class="hint">{copy.takeAwayWhat}</p>
        <div class="row-actions">
          <Button
            weight="quiet"
            disabled={exporting !== null}
            aria-busy={exporting === 'pack'}
            onclick={() => takeCopy('pack', 'Your lists, pages, metrics and rules would be written as one readable pack, with none of your rows in it')}
          >{copy.exportPack}</Button>
          <Button
            weight="bare"
            disabled={exporting !== null}
            aria-busy={exporting === 'rows'}
            onclick={() => takeCopy('rows', 'The rows would be written without where each one came from, which is a clean handover')}
          >{copy.exportRows}</Button>
          <!-- THE ARRANGEMENT, NOT THE ROWS: a use case somebody else can install (`loop/research-spark.md` S14). -->
          <Button weight="bare" href="/packs/share">{copy.shareSetup}</Button>
        </div>
      </Section>
      <!--
        THE KEY THAT MAKES A YEAR-OLD BACKUP CHECKABLE, and this screen is where four documents put
        it. `53 §4`: *"the public half in Settings → export and at the well-known URL 03 §4 names"*.
        `53 §5.4` step 3 has the operator paste it into
        `braindog verify latest.brainl --key <the record's public key, Settings → export>`, and
        `48 §5.6` says the answer without it reads **`unpinned`**: the file's own key proves
        integrity, and origin is `--key`'s job.

        THE ONE KEY THAT BELONGS ON A SCREEN. This product's first promise is that the record indexes
        what a key opens and never the key, and that rule is about SECRETS; the whole mechanism here
        is publication.

        AND THE KEY BELOW IS THE SAMPLE'S, WHICH WAS BEING SHOWN TO EVERY RECORD. `SIGNING_KEY` sits
        in `data.ts` with the rest of the synthetic record: no keypair ever produced it, and its two
        halves were made to agree, so `key_id` really is `sha256(raw)[0:16]` of the value beside it.
        That is the right shape for an illustration and the wrong thing to print under "How anybody
        checks a copy is yours" on a record that has a key of its own. A reader cannot tell by
        looking, and the only caveat near it is `mockNotice`, which is about controls that save
        nothing rather than about the value above them: invented data, presented as a fact about
        their data, on the one screen whose job is proving a file is theirs.

        SO IT IS DRAWN WHERE IT IS TRUE AND NOWHERE ELSE. `shell.live` is the question this block
        needs and the rest of the screen already asks: `false` is the public demo with no record
        behind it, and a record that refused `boot` is still a record, so it is never handed the
        sample's key by accident. `agentsFrom`, `peopleFrom` and `copiesFrom` are each one area's own
        read of its own rows, and this block has no rows to read.

        AND A RECORD IS NOT SHOWN A BLANK. What is true on a record today is that its exports and its
        backups are signed and that this screen has nowhere to get the public half from: `boot` does
        not carry it, and `03 §4`'s well-known URL is served by none of the three apps. The sentence
        says that much, and the value, the copy button and `verifyHow`'s advice go with the key they
        depend on rather than standing over nothing.
      -->
      <Section title={copy.theSignature}>
        {#if shell.live}
          <p class="hint">{copy.theSignatureNotHere}</p>
        {:else}
          <p class="hint">{copy.theSignatureIs}</p>
          <ul class="facts">
            <li>
              <span class="fact-key">{copy.keyFingerprint}</span>
              <span class="fact-value mono">{SIGNING_KEY.keyId}</span>
            </li>
            <li>
              <span class="fact-key">{copy.keyPublic}</span>
              <span class="fact-value mono wrap">{SIGNING_KEY.publicKey}</span>
            </li>
          </ul>
          <div class="row-actions">
            <Button weight="bare" onclick={() => void clipboard.put(SIGNING_KEY.publicKey, copy.keyPublic, copy.keyCopied)}>{copy.copyKey}</Button>
          </div>
          <p class="hint">{copy.verifyHow}</p>
        {/if}
      </Section>

    {/if}

    <!-- AND WITHOUT THE TALLY. "8 packs, 8 lists" welded a count nobody can act on to a sentence
         about the build, on all twelve areas. Both numbers are on the screens that own them.

         AND NOT THE SAME SENTENCE ON ALL TWELVE. Three areas have controls that really do persist —
         appearance writes four preferences, keyboard one, navigation one, and every one of them
         survives a reload — and this told their readers otherwise, four lines under a line saying
         the opposite. A disclaimer that is false where it matters most does not protect the mock;
         it teaches people to discount the half that works.

         AND NOT ON AN AREA WITH NOTHING TO PRESS. Notifications, Billing and Identity report and
         offer nothing, so a sentence telling their reader that their changes are not saved is
         about changes they cannot make. It is the last thing on three screens where it means
         nothing, which is how a reader learns to skip it on the nine where it means something. -->
    <!-- Not under the live passkeys: adding and removing one there is really kept, by the host. -->
    <!-- Nor on Agents: a live record keeps what is done there, and the demo says in its own sentence that nothing can be. -->
    <!-- Nor anywhere on a live record: People, Backups, Ingest, Export and Delete write to it, and the one
         control that still only says what it would do (checking a file on Export) says so in its own toast.
         Recovery keeps it where the host offers no passkeys, because that screen is still the sample's. -->
    {#if shell.live && !(area === 'recovery' && !livePasskeys)}
      {#if KEEPS.has(area)}<p class="mock">{copy.keptOnDevice}</p>{/if}
    {:else if !REPORTS.has(area) && area !== 'agents' && !(area === 'recovery' && livePasskeys)}
      <p class="mock">{KEEPS.has(area) ? copy.mockNoticeSome : copy.mockNotice}</p>
    {/if}
  </div>
</div>
{/if}

<style>
  /* The refusal stands alone, with the area rail gone: there is no area to be in. */
  .gone {
    padding: var(--sp-6) var(--sp-5);
  }

  /* A short list of stated facts, for the three areas that REPORT rather than offer. Two columns so
     the label and the value line up down the page; it wraps to one below 520px. */
  .facts {
    display: grid;
    grid-template-columns: minmax(12ch, max-content) minmax(0, 1fr);
    gap: var(--sp-2) var(--sp-4);
    margin: 0 0 var(--sp-3);
    padding: 0;
    list-style: none;
  }

  .facts li {
    display: contents;
  }

  .fact-key {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .fact-value {
    color: var(--ink2);
  }

  @media (width < 520px) {
    .facts {
      grid-template-columns: minmax(0, 1fr);
      gap: 0 0;
    }

    /* The label over its value. As a block the two spans ran together into one line, "Signed in
       asada@studio.example". */
    .facts li {
      display: flex;
      flex-direction: column;
      gap: var(--sp-1);
      margin-block-end: var(--sp-2);
    }
  }

  /* UNBOXED, AND EVERY ONE OF THESE WAS A CARD. A person, a machine, a key and a source are rows on
     the page with a hairline between them, the way every other list in the product is drawn. */
  .whos {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .who {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding-block: var(--sp-3);
  }

  .who + .who {
    border-block-start: 1px solid var(--line);
  }

  /* THE NAME, WHAT IS KNOWN ABOUT IT UNDER THE NAME, AND THE CONTROL AT THE END OF BOTH. The head was
     a wrapping line, so the facts and the button landed wherever the name's length left room, and a
     row with a reach sentence pushed its Revoke onto a line of its own. */
  .who-head {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 2px var(--sp-2);
  }

  .who-head > :first-child {
    grid-column: 1;
    grid-row: 1;
  }

  .who-head > .who-name {
    grid-column: 2;
    grid-row: 1;
  }

  .who-head > .who-detail {
    grid-column: 2;
  }

  .who-head > .who-do {
    grid-column: 3;
    grid-row: 1 / span 2;
    margin-inline-start: var(--sp-2);
  }

  .who-name {
    color: var(--ink);
    font-weight: 600;
  }

  /* IT TAKES THE SLACK AND GIVES IT BACK. `1 1 24ch` rather than a fixed width: on a wide screen the
     address and the date sit on the name's line, and below about 520px the whole clause wraps
     instead of truncating an email address in the middle, which is where they stop being
     recognisable. */
  .who-detail {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* WHAT IT WOULD BE ALLOWED TO DO GETS ITS OWN LINE, at full width.

     It is the sentence the decision is made from, and as a third `1 1 24ch` clause it would have
     landed wherever the name's length happened to leave room — sometimes beside the state, sometimes
     under it, never twice the same across five rows. `100%` puts it on one line of its own, under
     the name, which is where the eye goes after reading who is asking.

     `--ink2` rather than `--dim`: the row's other clauses are context and this one is the question. */
  .who-reach {
    color: var(--ink2);
  }

  /* The controls sit at the end of the head line and never shrink: a button that wraps its own
     label is a button somebody reads twice. */
  .who-do {
    display: flex;
    flex: none;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  /* A whole sentence, wrapping, under the row it is about. */
  .who-why {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .who-level {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-3);
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

  /* The ladder is five levels and a sixth answer, so its segments take the least padding in the
     product, and the track wraps rather than scrolling, which `controls.css` decided for this reason:
     five 44px segments measured 342px inside a 320px screen. */
  .levels .segment {
    padding-inline: var(--sp-2);
  }

  /* Rows the height a list's rows are, at the body size a list uses, with the list's hairline. */
  .density-preview {
    margin: 0;
    padding: 0;
    list-style: none;
    max-inline-size: 36rem;
  }

  .density-preview li {
    display: flex;
    align-items: center;
    min-block-size: calc(var(--row-h) + 10px);
    border-block-end: 1px solid var(--line);
    color: var(--ink2);
    font-size: var(--text);
  }

  /* THE EXCEPTIONS. Indented under the level they are exceptions to, because that relationship is
     the whole content of the line — a flat list beside the level reads as a second, unrelated
     answer. One row each: which list, what they hold there, and the way back. */
  .exceptions {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    margin: 0;
    padding: 0 0 0 var(--sp-3);
    border-inline-start: 2px solid var(--line);
    list-style: none;
  }

  /* ONE LAYOUT FOR EVERY ROW. `flex-wrap` made the shape depend on how long the register's name is,
     so one person's two exceptions rendered two different ways — one 64px tall with the control
     wrapped, the next 36px with the control nine pixels ABOVE its own label. A grid gives every row
     the same three columns and the same height. */
  .exceptions li {
    display: grid;
    grid-template-columns: minmax(6ch, max-content) minmax(6ch, max-content) 1fr auto;
    align-items: baseline;
    gap: var(--sp-2);
  }

  /* AND THE CONTROL DROPS TO ITS OWN LINE ON A PHONE. Two `max-content` columns, a sentence and a
     44px button do not fit in 320px — the list ran 391px wide and the row 376 — and the column that
     cannot shrink is the one holding a register's name. `13 §10`: below 640 a row becomes a card, and
     a card puts its verb underneath. */
  @media (width < 640px) {
    .exceptions li {
      grid-template-columns: minmax(0, max-content) minmax(0, max-content) 1fr;
    }

    .exceptions li :global(.btn) {
      grid-column: 1 / -1;
      justify-self: start;
    }
  }

  .ex-list {
    color: var(--ink);
    font-weight: 600;
    font-size: var(--t-sm);
  }

  /* AND IT IS SET APART FROM THE LADDER. Five rungs and a sixth thing that is not one of them,
     rendered identically, is a control whose own comment insists on a distinction the screen does
     not make. A separator rather than a colour: `13 §5.1` again. It stands beside the pill rather
     than being its border, because a pill's own edge is what marks the chosen one. */
  .level-none {
    position: relative;
    margin-inline-end: var(--sp-3);
  }

  .level-none::after {
    content: '';
    position: absolute;
    inset-block: var(--sp-2);
    inset-inline-end: calc(-0.5 * var(--sp-3) - 1px);
    border-inline-end: 1px solid var(--line);
    pointer-events: none;
  }

  /* The ladder word, which is what one exception is compared against another by. */
  .ex-word {
    color: var(--ink);
    font-size: var(--t-sm);
  }

  .ex-add {
    margin-block-start: var(--sp-1);
  }

  /* THE PICKER WRAPS ON A PHONE rather than running off the side, and every control in it is a full control height. */
  .ex-pick {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: var(--sp-2);
  }

  .ex-field {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    min-inline-size: 0;
  }

  .ex-label {
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  /* The invitations still waiting: a row per address, the control at the end of the line. */
  .invites-head {
    margin: var(--sp-3) 0 0;
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .invites {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .invite {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    padding-block: var(--sp-2);
  }

  .invite + .invite {
    border-block-start: 1px solid var(--line);
  }

  .invite-who {
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .invite-when {
    flex: 1 1 20ch;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .ex-select {
    min-block-size: var(--ctl-h);
    min-inline-size: var(--tap);
    max-inline-size: 100%;
    padding: 0 var(--sp-3);
    background: var(--s3);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    color: var(--ink);
    font: inherit;
    font-size: var(--t-ui);
  }

  .ex-level {
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .shell {
    display: grid;
    grid-template-columns: 200px minmax(0, 1fr);
    gap: var(--sp-5);
    padding: var(--sp-5) var(--gutter) var(--sp-9);
    max-inline-size: 1100px;
  }

  .areas {
    display: flex;
    flex-direction: column;
    position: sticky;
    inset-block-start: calc(var(--sticky) + var(--sp-4));
  }

  /* The same row as the rail's, because it IS the same thing: a vertical list of places, one of
     which you are in. It read as a different control entirely — a grey box where the rail uses the
     accent — which teaches that "here" looks like two things. */
  /* AND THE ROWS ARE TARGETS. `min-block-size: 32px` with no pointer query — they measured 67px
     only because "People & sharing" wraps to two lines and stretches its siblings. */
  .area {
    min-block-size: var(--ctl-h);
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: 0 var(--sp-3);
    border-radius: var(--r-sm);
    color: var(--ink2);
    font-size: var(--t-sm);
    font-weight: 500;
    white-space: nowrap;
    text-decoration: none;
    transition: background var(--d-state) var(--ease-out);
  }

  .area:hover {
    background: var(--hover-wash);
    color: var(--ink);
  }

  /* The rail's own "here": a lifted neutral row, an ink label, and the accent on the glyph only
     (DESIGN-SYSTEM 1.3, 4.7). An accent wash behind an accent word was the brand colour spent as a
     row background, which is the one place the owner ruled it out. */
  .area[aria-current='page'] {
    background: var(--s2);
    color: var(--ink);
  }

  .area :global(.icon) {
    color: var(--dim);
  }

  .area[aria-current='page'] :global(.icon) {
    color: var(--accent-text);
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
  }

  /* The hint sits above the control it explains, not beside it: a sentence in a column beside a
     row of swatches is read after the choice has been made. */
  /* THE CODE-ENTRY CONTROL.

     The field and its button sit on one line and wrap to two below about 420px, where a 44px button
     beside a field wide enough for six digits stops fitting. Nothing here sets a colour: the ring is
     `controls.css`'s, on the wrapper, and the answer's tone comes from `[data-intent]`. */
  .code-form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
  }

  .code-label {
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .code-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  /* THE BUTTON IS THE FIELD'S HEIGHT, so the two read as one control and not a tall box beside a
     short one. */
  .code-row :global(.btn) {
    min-block-size: var(--tap);
  }

  /* SIX DIGITS AND NO MORE ROOM THAN SIX DIGITS NEED. A field stretched across the panel invites a
     sentence; one sized to its content says what belongs in it without a word. `ch` on a tabular
     face is the honest unit, and `font-variant-numeric` keeps the six from jumping about as they
     are typed — proportional digits reflow the whole field on every keystroke. */
  .code-input {
    flex: 0 1 12ch;
    font-size: var(--t-md);
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.18em;
  }

  /* A BASE64 KEY HAS NO SPACES IN IT, so it is one 43-character word and it reached 432px inside a
     400px screen. `13 §10` and the layout gate's first rule: the page body never scrolls sideways. */
  .wrap {
    overflow-wrap: anywhere;
  }

  /* THE PACKS SCREEN'S PLAN, drawn the same way where an agent is connected. */
  .plan {
    display: grid;
    grid-template-columns: minmax(6ch, max-content) minmax(0, 1fr);
    gap: var(--sp-1) var(--sp-4);
    margin: 0;
    padding: var(--sp-3);
    background: var(--sunk);
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    color: var(--ink2);
    font-size: var(--t-sm);
    line-height: 1.6;
  }

  .plan dt {
    color: var(--dim);
    font-weight: 600;
  }

  .plan dd,
  .plan dd p {
    margin: 0;
  }

  /* ONE COLUMN ON A PHONE, for the reason the Packs screen's diff gives. */
  @media (width < 640px) {
    .plan {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .plan-adds {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .plan-adds li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--sp-2);
  }

  .plan-name {
    color: var(--ink);
  }

  .plan-detail {
    color: var(--dim);
    font-size: var(--t-xs);
  }

  /* THE ONE PLACE A MONOSPACE FACE IS RIGHT. `Money.svelte` argues against it for figures — a mono
     face gives the thousands separator a full character width — and a key is not a figure: it is a
     string somebody compares character by character against another screen. */
  .mono {
    font-family: ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, Consolas, monospace;
    font-size: var(--t-sm);
    letter-spacing: 0;
  }

  .code-said {
    margin: 0;
    color: var(--tone, var(--ink2));
    font-size: var(--t-sm);
  }

  /* THE SENTENCE AND ITS SWITCH ON ONE LINE, the switch at the end of the sentence's measure rather
     than across a wide page from it, and lined up with the sentence's first line. */
  .switch-row {
    display: grid;
    grid-template-columns: minmax(0, var(--measure)) auto;
    align-items: start;
    justify-content: start;
    gap: var(--sp-6);
  }

  .switch-row .hint {
    margin: 0;
  }

  .switch-row :global(.switch) {
    margin-block-start: calc((1em * var(--lh-body) - var(--ctl-h)) / 2);
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

  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  /* A SWATCH IS THE COLOUR, and the tick is drawn ON it rather than beside it: a selected state
     that lives outside the thing selected is a state people read as belonging to the next one. */
  .swatch {
    display: grid;
    place-items: center;
    min-inline-size: var(--tap);
    block-size: var(--tap);
    padding: 0 var(--sp-2);
    background: var(--swatch, var(--s1));
    /* THE LABEL ON A FILL, which is the token the theme solves for exactly this: a tick drawn in
       white on an ochre swatch is the one place a literal would be wrong twice over. */
    color: var(--accent-ink);
    border: 1px solid var(--line);
    border-radius: var(--r-sm);
    cursor: pointer;
  }

  .swatch[data-on] {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }

  .swatch-off {
    background: var(--s1);
    color: var(--ink);
    font-size: var(--t-sm);
  }

  /* A refusal a person cannot act on teaches them the control is broken, so the floor it missed is
     printed rather than a shrug. */
  .wrong {
    margin: var(--sp-3) 0 0;
    padding-inline-start: var(--sp-4);
    color: var(--danger);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  /* THE SHARED PILLS FROM `controls.css`, with two things this screen needs on top.

     The track hugs its options: a settings choice is two to six short words, and a sunk track run
     to the far edge of the panel reads as a field with the words bunched at one end.

     And a segment is 44 on BOTH axes under a thumb. `a11y.css` names the failure, *"a control grown
     only in height measures 38x44 and fails"*, and `On` and `Off` are those labels: the shared
     segment sets a height and its width is the word. The icon beside Light, System and Dark sits on
     the label's line rather than above it. */
  .segmented {
    margin-block-end: var(--sp-3);
    inline-size: fit-content;
    max-inline-size: 100%;
  }

  .segment {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-inline-size: var(--ctl-h);
  }

  /* WRAPPING, for the reason `/audit`'s segmented bar already wraps: two buttons that do not fit
     are two buttons off the edge. At 320 "Export the rows only" ended at x=406 in a 320px screen. */
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

  .mock {
    color: var(--dim);
    font-size: var(--t-xs);
  }

  @media (width < 900px) {
    .shell {
      grid-template-columns: minmax(0, 1fr);
      padding: var(--sp-4) var(--gutter) var(--sp-8);
    }

    /* A strip that runs to the panel's edges and scrolls under a thumb, with no scrollbar and no
       label ever wrapping onto a second line: "People & sharing" was three lines tall and set the
       height of every item beside it. */
    .areas {
      position: static;
      flex-direction: row;
      gap: var(--sp-1);
      margin-inline: calc(var(--gutter) * -1);
      padding-inline: var(--gutter);
      overflow-x: auto;
      scrollbar-width: none;
    }
  }
</style>
