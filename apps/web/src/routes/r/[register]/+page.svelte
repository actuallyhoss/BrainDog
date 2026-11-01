<!--
  A register: one typed collection, all of it.

  No virtualisation at any size. Rows arrive in keyset pages into chunks, the DOM caps at 2,000 with
  a visible cap line, and the way past it is a filter or an export. Virtualisation breaks
  find-in-page, breaks the scrollbar as a position cue, and only HIDES the measured wall, which is
  DOM construction (13 §4.3).

  THIS FILE HOLDS THE ADDRESS, THE READ, THE STATE AND EVERY WRITE, AND `parts/` DRAWS THEM. The list
  screen was one file of four thousand lines, and every change to how the bar or the grid looks was
  made in the same file as the paging and the writes, beside them. Each part now takes props and
  callbacks and keeps nothing a write depends on, so a write is found in this file and nowhere else,
  and a part can be redrawn without reading one. What turns on nothing but its arguments is
  `parts/list.ts`, where plain Node can reach it.
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import { titleOf } from '$lib/title.ts';
  import { onDestroy, tick, untrack } from 'svelte';
  import { afterNavigate, goto } from '$app/navigation';
  import { page } from '$app/state';
  import { copy } from '$lib/copy.ts';
  import { said } from '$lib/voice.svelte.ts';
  import { listWord } from '$lib/record/names.ts';
  import * as clipboard from '$lib/clipboard.ts';
  import * as pref from '$lib/pref.ts';
  import { covered, overlays, silenced, typing as isTyping } from '$lib/a11y/keys.svelte.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { chipsOf, columnsFor, currencyFor, display, DOM_CAP, heldTwiceOn, iconFor, isRows, joinOf, labelOf, PAGE, sortRows, toRows, TWICE, twiceOf, twiceWords, type Filter, type Join, whereOf } from '$lib/record/api.ts';
  import { createClient } from '@braindog/client';
  /* Type only, so the client's route table stays out of this chunk. */
  import { joinNames, rowsHeldTwice, treeOf, type Names } from '$lib/record/remote.ts';
  import type { Predicate } from '@braindog/where';
  import { open, read, tally, type Boot, type Refusal, type Tally } from '$lib/data/record.ts';
  import { live } from '$lib/data/live.svelte.ts';
  import { keepLocal, localTicket, nearLocal } from '$lib/data/local-tab.ts';
  import { holdCopyMark } from '$lib/data/copy-mark.svelte.ts';
  import { countsOf, keepShown, keptOf, listsOf, namesOf, searchKept, servedWhole, shownFor, spotOf, walkWhole, type KeptList, type Paged } from './kept-list.ts';
  import { painted } from '$lib/data/timing.ts';
  import { LIST_ROWS_MOST, type Near } from '$lib/data/local.ts';
  import { searchable } from '$lib/record/find.ts';
  import type { Entry, Fields, RegisterDecl } from '$lib/record/schema.ts';
  import { saidPlainly } from '$lib/record/blocks.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { REGISTERS } from '$lib/record/held.ts';
  import { handFor, readHolders } from '$lib/record/hand.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import KeyViews from '../../keychain/KeyViews.svelte';
  import { KEYS_REGISTER } from '$lib/record/keychain.ts';
  import Tile from '$lib/ui/Tile.svelte';
  import Menu from '$lib/ui/Menu.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import { rowsAsCards } from '$lib/ui/body.svelte.ts';
  import { CapLine } from 'braindog-render/svelte';
  import BindBlock from '$lib/ui/BindBlock.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Kbd from '$lib/ui/Kbd.svelte';
  import { closed, drew, opened } from '../../../lib/ui/screen.svelte.ts';
  import { capturedFields, holdInPlace, inverseOf, rowWriter, type Held, type RowWriter, type Wrote } from '$lib/record/rows-write.ts';
  import { lineFigures, lineValues, whichCurrency } from '$lib/record/line-figures.ts';
  import { newFor, orderFor, orderWrite } from '$lib/tell/order-box.ts';
  import { sameAsked, samePerson, type Twin } from '$lib/record/same-person.ts';
  import { recordToday } from '$lib/record/zone.ts';
  import { draftOf, editable, patchOf, runFact, runFactWhy, unchanged, wrongValue } from '$lib/record/field-draft.ts';
  import { spentPutBacks, type Change } from './put-back.ts';
  import { foldAsk, sameOf, thingWords, twiceLine } from './twice-fold.ts';
  import {
    arrivedAt,
    chipOn,
    chipText,
    quickOf,
    quickOn,
    setQuickIn,
    type Quick,
    deadlineOf,
    defaultFrom,
    defaultKey,
    defaultParams,
    dropChip,
    filterableOf,
    laneChoicesOf,
    laneFieldOf,
    nextSort,
    readDefault,
    readingOf,
    headCount,
    shownSaid,
    sameDefault,
    toggleChip,
    viewOf,
    homeViewOf,
    groupsOf,
    isLate,
    lateFirst,
    weighed,
    wholeMoney,
    withPrivate,
    writeDefault,
    type Keep,
    type ListDefault,
    type Receipt,
    type View,
  } from './parts/list.ts';
  import CaptureLine from './parts/CaptureLine.svelte';
  import CapturePlus from './parts/CapturePlus.svelte';
  import ChipsBar from './parts/ChipsBar.svelte';
  import ListEmpty from './parts/ListEmpty.svelte';
  import BulkBar from './parts/BulkBar.svelte';
  import ListCards from './parts/ListCards.svelte';
  import ListPeople from './parts/ListPeople.svelte';
  import ListOrgs from './parts/ListOrgs.svelte';
  import { meetsOf, mergedAway, orgRoleOf } from './folk.ts';
  import { readingOf as readingsOf, valueSaid } from '$lib/record/reading.ts';
  import { amountField, signedSaid, wayField, wayOf } from '$lib/record/money-way.ts';
  import ListBoard from './parts/ListBoard.svelte';
  import ListSummary from './parts/ListSummary.svelte';
  import ViewSwitch from './parts/ViewSwitch.svelte';
  import ListTable from './parts/ListTable.svelte';
  import ListRowMenu from './parts/ListRowMenu.svelte';
  import ShareLazy from '$lib/sharing/ShareLazy.svelte';
  import { canShare } from '$lib/sharing/may-share.ts';
  import type { Subject } from '$lib/sharing/share-state.ts';
  import { seeingAs } from '$lib/sharing/see-as.svelte.ts';
  import { keepPrivate } from '$lib/record/privacy-write.ts';
  import { listHost, type Walked } from '$lib/page/row-host.svelte.ts';
  import RowPanel from '$lib/page/RowPanel.svelte';
  import RowVerbMenu from '$lib/page/RowVerbMenu.svelte';
  import DisplayMenu from './parts/DisplayMenu.svelte';
  import FieldAdd from './parts/FieldAdd.svelte';
  import ListEditor from '$lib/ui/ListEditor.svelte';
  import { listWords, MAKE_ID, MAKE_PARAM, nameFromId, offered } from '$lib/record/list-write.ts';
  import { nearest } from '$lib/record/nearest.ts';
  import NearLinks from '$lib/ui/NearLinks.svelte';
  import { sheetWords } from '$lib/record/field-words.ts';
  import { ownsRecord, type Me } from '../../settings/levels.ts';
  import { may } from '$lib/record/may.ts';
  import { reachWords, writeWords } from './reach.ts';
  import { wantsDeclared } from './declared.ts';
  import { liveOverlay, run, UNDO_MS, type Sent } from '$lib/data/optimistic.svelte.ts';
  import { ARRIVED_MS } from '$lib/data/optimistic.ts';
  import { swapInPlace } from '$lib/ui/motion.ts';
  import OfferCard from '$lib/design/OfferCard.svelte';
  import { offerActs, offerFor } from '$lib/design/pen.ts';
  import { penWords } from '$lib/design/words.ts';
  import { navPrefs } from '$lib/nav-prefs.svelte.ts';
  import { forget } from '$lib/record/boot-live.ts';
  import { openSheet } from '$lib/send/open.ts';


  const id = $derived(page.params.register ?? '');

  /**
   * WHAT THE RECORD SAID: `boot` for the whole record, `schema` for this register, and a refusal
   * when it said no.
   *
   * THE DECLARATION IS HELD WITH THE REGISTER IT IS FOR. The component is reused across the
   * `[register]` parameter, so the address moves before the answer does; a declaration kept beside
   * its own register id is how the screen tells "the new list has not arrived" from "this is the
   * list", and draws the first as loading rather than as the old list under the new name.
   */
  let booted = $state<Boot | null>(null);
  let declared = $state<{ register: string; decl: RegisterDecl } | null>(null);
  let refusal = $state<Refusal | null>(null);
  const decl = $derived(declared?.register === id ? declared.decl : undefined);

  /**
   * WHETHER THIS VISIT DRAWS THE LIST AS A PAGE THE RECORD COMPOSES (`DeclaredList.svelte`), which the address
   * asks for by one key and nothing on this screen links to until the list board is signed off. While it does, nothing
   * below is drawn, and this screen's keys and its panel's host stand down: its rows are not on screen to act on.
   */
  const composed = $derived(wantsDeclared(page.url));

  /**
   * THE RECORD'S INSTANT, which every tone and date band on this screen is measured from. It is the
   * record's and not the reader's: the seed is dated relative to one day, and a reader dating it
   * against their own clock would put every band some number of days out with nothing saying so.
   */
  const now = $derived(booted ? Date.parse(booted.now) : Date.now());

  /* URL state: filters and the query define WHICH ROWS YOU ARE LOOKING AT, so they must be
     shareable. View options are about your eyes rather than the data and live in the cookie. */
  const q = $derived(page.url.searchParams.get('q') ?? '');
  const sortParam = $derived(page.url.searchParams.get('sort'));
  const sort = $derived.by(() => {
    const [field, dir] = (sortParam ?? '').split(':');
    return field ? { field, dir: (dir === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc' } : undefined;
  });
  /* THE CHIP PARSER IS `api.ts`'S NOW. It was these four lines and a copy of them in six tests, so
     the thing every test of a chip drove was a copy of the route rather than the route: the colon
     inside `git:jokonkwo` fell off the end of a value here and in none of them. See `chipsOf`. */
  const filters = $derived(chipsOf(page.url.searchParams));
  /* AND THE WORD THAT JOINS THEM, `join=any`: the chips as "or" where a tile or a block said its filter with "or"
     (`registerHref`). It was not read here, so such a link could only open the whole list. It rides in the question,
     so the list, the next page, the recheck and the sentence above the list all ask the one set of entries. */
  const join = $derived(joinOf(page.url.searchParams));
  /** The chips really are an "or": the word, and more than one chip for it to join. */
  const either = $derived(join === 'any' && filters.length > 1);
  /* AND THE WORD THAT NARROWS A LIST OF PEOPLE TO THE ONES WHO MAY BE HELD TWICE, `twice=1` (`twiceOf`). The record says
     who they are, once a question (`ask`), and `twiceHeld` keeps its answer for the list it was asked of: the numbers as a
     filter that rides beside the chips to the list, its next page and its recheck, and is never drawn as a chip. On a
     list that is not the people one the word is ignored, so nothing is asked and `twiceHeld` stays empty. */
  const twiceAsked = $derived(twiceOf(page.url.searchParams));
  let twiceHeld = $state<{ register: string; rows: Filter } | null>(null);
  const twice = $derived(twiceAsked && twiceHeld?.register === id ? twiceHeld.rows : null);
  /** The chips as the list is asked them: with the people held twice, while the word is on. */
  const asking = $derived(twice ? [...filters, twice] : filters);
  /** Something narrows the list: a chip, or the word. The search box is asked beside it where it matters. */
  const narrowed = $derived(filters.length > 0 || twice !== null);
  const clearTwice = () => setParam((p) => p.delete(TWICE));
  /* AND A LIST OF THINGS THAT SAYS WHAT MAKES TWO OF THEM THE SAME (`same:`, `twice-fold.ts`): its own words, never the
     people's, and how many the record names, asked beside the list while the word is off (`twiceMany`). The line says
     so and links to the word; under the word, one button files the question that folds them, which Decide asks. A host
     that cannot answer draws none of it. */
  const thing = $derived(sameOf(decl));
  const thingSaid = $derived(thing && decl ? thingWords(decl, thing.keep) : null);
  let twiceMany = $state<{ register: string; n: number } | null>(null);
  const twiceSaid = $derived(!twiceAsked && twiceMany?.register === id ? twiceLine(decl, twiceMany.n) : null);
  const twiceHref = $derived.by(() => {
    const p = new URLSearchParams(page.url.searchParams);
    p.set(TWICE, '1');
    return `?${p}`;
  });
  let folding = $state(false);
  /** The list whose host has no fold, so the button goes rather than answering every press with the same refusal. */
  let foldGone = $state<string | null>(null);
  async function fold(): Promise<void> {
    if (folding || !thing) return;
    folding = true;
    const out = await foldAsk((name, args) => createClient({ base: apiBase() }).call(name, args), id);
    folding = false;
    if (!out.ok) {
      toasts.push(out.said, { intent: 'warn' });
      if (out.gone) foldGone = id;
      return;
    }
    void goto(at(out.href));
  }
  /* A VIEW KEEPS CHIPS, A SEARCH AND AN ORDER, AND HAS NO WORD FOR THE PEOPLE HELD TWICE. Saved from this list it would
     open on everyone the chips let through, under a title that never said so. So nothing is saved while the word narrows
     the list, and this says why, naming the button that leads out (`twiceWords.unsaved`). */

  /* The columns actually drawn: the register's projection minus whatever the reader has hidden. */
  let createOpen = $state(false);

  /**
   * A LINK CAN ASK FOR THE FORM: `/r/obligations?new=1`.
   *
   * `19 §6` gives `no-data-yet` one action and it is **Add one**, and the surface where that state
   * is most often true is not this one — it is a declared page whose block draws a list nobody has
   * put anything in yet. A block cannot open a sheet that lives in another route, so the address
   * carries the intent and this reads it.
   *
   * IT IS IN THE URL AND NOT IN COMPONENT STATE because it arrives from outside the component;
   * `19 §5`'s rule is about where a fact belongs, and "somebody asked for the form" is a fact about
   * the request. Closing clears it, or the effect would reopen the sheet the moment it shut.
   */
  $effect(() => {
    if (page.url.searchParams.get('new') === '1' && adds) createOpen = true;
  });

  const closeCreate = () => {
    createOpen = false;
    addRefused = null;
    createValues = {};
    if (page.url.searchParams.has('new')) setParam((p) => p.delete('new'));
  };

  /* THE FIELDS SHEET (`ListEditor.svelte`), opened from the list's head, and the new-list sheet, which is the same sheet
     for a list the record does not have yet. Whether the person owns the record decides whether what they do lands at
     once or waits on Decide, and the sheet says which before the press. */
  const owner = $derived(page.data.me ? ownsRecord(page.data.me as Me) : false);
  let fieldsOpen = $state(false);
  /** The list's name, changed in place from the overflow. */
  let renameOpen = $state(false);
  let makeOpen = $state(false);

  /**
   * "HANDED TO ME": a list that says who holds its rows (`hand:`) offers a view onto the ones handed to you,
   * found the same way `HandSheet.svelte` finds every holder, `readHolders`, filtered to the one with `you: true`. The
   * seq is asked again each time the list itself does, since who you are handed does not change inside one visit and a
   * second read would only cost the record another round trip for nothing that could have changed.
   */
  const hand = $derived(decl ? handFor(decl) : null);
  const shell = $derived(page.data as unknown as Shell);

  /**
   * THE ONE OFFER FOR THIS LIST, drawn above its entries: the page the record would make of it, most often the
   * week Slash saw her read it by (offer-pattern-45). The pen's switch and her dismissals are hers on every device
   * (`navPrefs`), and what she made or put away in this visit is gone at once, before `boot` is read again.
   *
   * Make it is the pen's own keep (`keep.ts`), the write Settings, Navigation makes, then the rail is read again and she
   * is taken to the page; Not now is the dismissal, terminal.
   */
  let offerTick = $state(0);
  const offerActions = offerActs({
    keep: async (item) => (await import('$lib/design/keep.ts')).keepOffer(apiBase(), item),
    dismiss: (offerId) => navPrefs.dismiss(offerId),
    go: async (slug) => {
      forget();
      await goto(at(`/p/${slug}`), { invalidateAll: true });
    },
    say: (text, warn) => void toasts.push(text, warn ? { intent: 'warn' } : undefined),
    changed: () => (offerTick += 1),
    words: { made: copy.promoted, dismissed: penWords.dismissed, notReached: copy.recordNotReached },
  });
  /* `offerTick` IS READ so each press redraws: what the actions hold is plain, and the tick is their one signal. */
  const offer = $derived.by(() => {
    void offerTick;
    return offerFor(shell.pen ?? [], id, { suggest: navPrefs.suggest, gone: (o) => navPrefs.isDismissed(o) || offerActions.hidden(o) });
  });
  const offerBusy = $derived.by(() => {
    void offerTick;
    return offerActions.busy();
  });

  /**
   * WHAT THE CALLER'S LEVEL ON THIS LIST REACHES, asked of `may()` and never worked out here.
   *
   * A CONTROL THE RECORD WOULD REFUSE IS NOT DRAWN. A colleague given Reads on Tasks met the capture line, the New
   * button, a pencil in every cell and Archive on every row, and each press came back refused: `create` asks `append`
   * of the list, and a change or an archive is an `update`, which asks `write`. `proposes` is the Fields sheet's rung,
   * which files a proposal for anyone but the owner, and a `propose` names no list.
   */
  /* SHARING IS AN OWNER'S OR AN ADMIN'S: the view's and a row's ways in are offered to nobody else. */
  const shares = $derived(seeingAs() === null && canShare(shell.me));
  let sharing = $state<Subject | null>(null);
  let sharingOpen = $state(false);
  function shareRow(seq: number) {
    const row = rowAt(seq);
    if (!decl || !row) return;
    menuAt = null;
    sharing = { kind: 'row', list: id, seq, id: row.id ?? null, name: String(row.fields[decl.title] ?? '') || `${decl.one} ${seq}` };
    sharingOpen = true;
  }
  /* THE LIST AS A WHOLE, from the head's "⋯". */
  function shareList() {
    if (!decl) return;
    sharing = { kind: 'list', list: id, name: decl.name };
    sharingOpen = true;
  }
    /* THE VIEW IS ITS CHIPS, as the record's tree: a search reads the text index, which a share may not (§2.3). */
  function shareView() {
    if (!decl || filters.length === 0) return;
    const where = treeOf(id, filters, '', new Map(), either ? 'any' : undefined);
    if (where === undefined) return;
    sharing = { kind: 'list', list: id, name: decl.name, view: { where: where as never } };
    sharingOpen = true;
  }

  /* NO ADD ON THE LIST OF RUNS: a run is what an agent's session is, opened by the agent and never typed in by hand,
     and the list says nothing in the add's place, since nobody may add one. */
  const madeByAgents = $derived(id === 'session');
  const adds = $derived(!madeByAgents && may(shell, 'append', id));
  const changes = $derived(may(shell, 'write', id));
  const proposes = $derived(owner || may(shell, 'append'));
  /* A BOUND KEY DOES NOT ANSWER WITH SILENCE (`openEditor`), so `n`, `e` and `⌫` say to a Reads colleague why. */
  const readOnlySaid = () => void toasts.push(reachWords.readOnly(decl?.name ?? nameFromId(id)), { intent: 'warn' });
  /* THE LIST `hand.person` LINKS TO, as `HandSheet` reads it: the record refuses a person part that is not a link. */
  const peopleList = $derived.by(() => {
    const to = decl?.fields.find((f) => f.id === hand?.person)?.to ?? '';
    return { register: to, title: REGISTERS[to]?.title ?? 'name' };
  });
  let handedSeq = $state<number | null>(null);
  $effect(() => {
    const h = hand;
    if (!h?.person) {
      handedSeq = null;
      return;
    }
    const me = String(shell.me?.person ?? '');
    void readHolders(apiBase(), h, me, shell.names ?? {}, peopleList).then((got) => {
      const you = got.from === 'live' ? got.holders.find((o) => o.kind === 'person' && o.you) : undefined;
      handedSeq = you && you.kind === 'person' ? you.seq : null;
    });
  });
  /* The address in the app, not yet under the record: `at()` is called where it is drawn, as every link is. */
  const handedToMe = $derived(hand?.person && handedSeq !== null ? `/r/${id}?f=${hand.person}:is:${handedSeq}` : null);

  /**
   * A LINK CAN ASK FOR THE NEW-LIST SHEET: `/r/_new?make` from the "New list" entry, or `?make` on the address of a list
   * that is not there. It opens once as the parameter arrives and not again while it stays, so closing the sheet needs
   * no write to the address.
   */
  let makeAsked = false;
  $effect(() => {
    const asked = page.url.searchParams.has(MAKE_PARAM);
    if (asked && !makeAsked) makeOpen = true;
    makeAsked = asked;
  });

  /* A LIST MADE UNDER THIS ADDRESS IS ASKED FOR AGAIN, and one made under another name is opened. */
  function made(list: string) {
    if (list === id) refresh();
    else void goto(at(`/r/${list}`));
  }
  /* WHAT THE FORM WOULD REFUSE, held here so the BUTTON can be disabled by it. Asking the form on
     click could only ever answer after the press. */
  let problems = $state<string[]>([]);
  /** What the sheet's form holds, so the submit can put the row somewhere rather than describing it. */
  let taken = $state<Fields>({});
  /** What the new-row form opens holding: the add line's words when "Fill in the rest" opened it, else nothing. */
  let createValues = $state.raw<Record<string, string>>({});
  /** Why the add line's last row was refused, said under the field inside its sheet, until the next press. */
  let captureFault = $state<string | null>(null);
  let displayOpen = $state(false);
  let bindOpen = $state(false);

  /**
   * Which columns this register shows, and it is PER REGISTER and PER READER.
   *
   * 50 §5.2 names it `prefs.columns[register]` — a view preference, not a declaration. The
   * difference matters: `columns:` on a page block is what everyone sees and travels in a pack;
   * this is what YOU see on the grid, and it never leaves your device. Two people looking at the
   * same register may want different columns and neither is editing the record.
   *
   * The title column is not offerable. A register whose title is hidden is a list of ids.
   */
  let hidden = $state(new Set<string>());

  /* SEEDED FROM THE COOKIE AND WRITTEN BACK TO IT. This was client state with no store behind it,
     so unticking a column and reloading put it back — on a screen whose search, filters and sort all
     survive in the URL, which is precisely why a reader expects this to. The effect is keyed on the
     register, so walking between two registers loads each one's own answer. */
  $effect(() => {
    hidden = new Set(pref.read().columns?.[id] ?? []);
  });

  /** Every column back, and the register's entry out of the cookie rather than emptied in it. The number the reader
      turned on stays on: it is in the set because it is drawn (`projected`), so emptying the set would take it away. */
  function showAll() {
    const kept = hidden.has('seq') ? ['seq'] : [];
    hidden = new Set(kept);
    const all = { ...pref.read().columns };
    if (kept.length > 0) all[id] = kept;
    else delete all[id];
    pref.write({ columns: all });
  }

  /** The columns a kept default hides, taken as this list's answer in the cookie too. */
  function setColumns(off: readonly string[]) {
    hidden = new Set(off);
    const all = { ...pref.read().columns };
    if (off.length === 0) delete all[id];
    else all[id] = [...off];
    pref.write({ columns: all });
  }

  function hide(field: string, off: boolean) {
    const next = new Set(hidden);
    if (off) next.add(field);
    else next.delete(field);
    hidden = next;
    const all = { ...pref.read().columns };
    if (next.size === 0) delete all[id];
    else all[id] = [...next];
    pref.write({ columns: all });
  }

  /**
   * WHAT JUST HAPPENED TO EACH ROW ON THIS SCREEN, by number: the chip it wears and the way back.
   * `Receipt` (`parts/list.ts`) is why a row keeps its place and says what happened instead of leaving.
   */
  let receipts = $state(new Map<number, Receipt>());

  /**
   * What has been changed on this screen and not written.
   *
   * ONE PATCH PER ROW, applied over the answer. The record is not behind this screen yet, so an
   * edit that vanished on the next keystroke would be a control that does nothing; an edit that
   * claimed to be saved would be worse. The value the reader typed is what the row shows, the row
   * wears `Not saved`, and `Put back` drops the patch: the same receipt every other verb on this
   * screen leaves, because it is the same promise.
   */
  let edits = $state(new Map<number, Fields>());

  /**
   * WHERE A ROW WAS WHEN SOMEBODY ACTED ON IT, so that is where it stays.
   *
   * THE RECEIPT IS HALF THE PROMISE AND THIS IS THE OTHER HALF. A chip saying `Archived` is worth nothing on a row
   * that has jumped three screens away by the time it is drawn: the record answers in its own order, newest write
   * first, so every write this screen makes is a write that moves its row. `holdInPlace` pins it, and `rows-write.ts`
   * carries the argument and the tests.
   *
   * THE FIRST HOLD WINS. Two writes to one row are one row held once, at the place the reader found it, not walked
   * one index further each time somebody touches it.
   */
  let held = $state(new Map<number, Held>());

  /**
   * THE ROWS ADDED ON THIS SCREEN, by number, which stay at the head of a list that opens late first (`ordered`): a row
   * somebody has just typed has no day yet, and filed among the undated it would land below the fold as it was made.
   * They go with the question, as the receipts do.
   */
  let added = $state(new Set<number>());

  const hold = (seq: number) => {
    if (held.has(seq)) return;
    const at = result.entries.findIndex((e) => e.seq === seq);
    const entry = result.entries[at];
    if (at < 0 || !entry) return;
    held = new Map(held).set(seq, { at, entry });
  };

  /**
   * LINES TYPED AND NOT YET WRITTEN, drawn at the head of the list the moment Enter is pressed (`lib/data/optimistic.ts`).
   * Each is a row under a number below zero, which no row the record holds has, wearing `Saving`; it goes when the
   * record's row takes its place, or when the record refuses it and the typing goes back into the box.
   */
  const typedRows = liveOverlay<Entry>((e) => String(e.seq));
  let typedSeq = 0;

  const receipt = (seq: number, r: Receipt) => {
    receipts = new Map(receipts).set(seq, r);
  };
  /**
   * What this row is wearing, which is something that happened on this screen.
   *
   * IT ALSO ANSWERED FOR A ROW NOBODY HAD PRESSED HERE: a row typed against the sample waited in
   * `pending` under a negative number and wore `Not saved` on every screen for the life of the tab.
   * The sample went, and `pending` with it, so every
   * row on this list is one the record holds and the receipts are the only marks there are.
   */
  const receiptFor = (seq: number): Receipt | undefined => receipts.get(seq);

  const clearReceipt = (seq: number) => {
    const next = new Map(receipts);
    next.delete(seq);
    receipts = next;
  };

  /**
   * THE ANSWER, ONE PAGE AT A TIME — `13 §4.3`, and the mechanism that was missing.
   *
   * The spec's three parts are rowgroups of 100, **200-row keyset pages**, and a 2,000-row cap with
   * a visible line. Two were built. The pages were not, so `DOM_CAP` was not the end of a sequence,
   * it was a substitute for one: every row was materialised, filtered, sorted and then thrown away
   * past two thousand.
   *
   * `pages` IS AN ACCUMULATOR AND `cursor` IS WHERE THE NEXT ONE STARTS. Both reset when the
   * QUESTION changes — the register, the filters, the search, the order — because a cursor is a
   * position in one answer and means nothing in another. `50 §5.2` step 5 says exactly that: with a
   * non-null cursor, changing the order refetches page 1.
   *
   * THE EFFECT READS ITS OWN DEPENDENCIES DELIBERATELY. `id`, `filters`, `q` and `sort` are touched
   * before anything else so Svelte re-runs this when any of them moves, and nothing else in the body
   * can quietly add a dependency that resets the list mid-scroll.
   */
  let pages = $state<Entry[][]>([]);
  let cursor = $state<string | null>(null);
  /** The whole answer's size, as the record counted it. The rows in hand are `pages`. */
  let matched = $state(0);
  /**
   * WHAT THIS RECORD CALLS THE ROWS THESE ONES POINT AT, and `null` until the first answer lands.
   *
   * A `ref` is stored as another row's id and drawn as that row's NAME, and the only names this
   * screen had were the built-in sample's — so a live list printed the sample's row for every
   * number, which is a different record's name under this record's column. The walk that turns the
   * stored id into a number already reads every row of the target list, so the name comes with it.
   */
  let named = $state<Names | null>(null);
  /* The answer this page set belongs to. A cursor from a different question is not a cursor. */
  let asked = $state('');
  /** A question is out, the first page or the next one. `aria-busy` reads it. */
  let busy = $state(false);
  /** A next page is out. `more()` asks once however often the sentinel comes into view. */
  let fetching = false;
  /** How many rows hold each pill's value, as the record counted them. `facets` adds this tab's. */
  let counted = $state(new Map<string, Map<string, number>>());
  /** Why some pills carry no number: the record's refusal to count them, said in one line under the bar. */
  let uncounted = $state<Refusal | null>(null);

  /** The rows the record returned, by number: what a cell, the editor and the menu look a row up in. */
  const bySeq = $derived(new Map(pages.flat().map((e) => [e.seq, e] as const)));
  const rowAt = (seq: number): Entry | undefined => bySeq.get(seq);

  const question = $derived(JSON.stringify([id, filters, q, sort ?? null, join ?? null, twiceAsked]));

  $effect(() => {
    const said = question;
    if (said === asked) return;
    asked = said;
    /* A DIFFERENT REGISTER IS A DIFFERENT SCREEN, so what the last one drew goes now rather than when
       the answer lands, and the screen draws loading in between. The same register keeps its rows
       until the new answer replaces them, so a pressed chip does not blank the list under it. */
    if (declared?.register !== id) {
      pages = [];
      cursor = null;
      matched = 0;
      named = null;
      counted = new Map();
      uncounted = null;
      foundRoom = false;
    }
    refusal = null;
    stale = false;
    searchedHere = false;
    void ask(said, id, filters, q, sort, join, twiceAsked);
    /* AND THE RECEIPTS GO WITH THE ANSWER THEY WERE ABOUT. A chip saying `archived` beside a row
       the reader has just filtered TO is a chip about a different screen: the receipt exists to
       hold a row in place through one action, not to follow it around the product.

       AND SO DOES EVERYTHING ELSE THIS SCREEN HOLDS ABOUT ONE ROW. SvelteKit reuses this component
       across the `[register]` parameter, so `edits` was keyed on a bare sequence and survived a
       walk from one register to another: an unwritten change to `obligations#3` was drawn over
       `tasks#3`, on a row it was never about, wearing no receipt because the receipts had been
       cleared. `capture` kept a half-typed row in the box of a different list, and `editing`
       pointed at a cell that no longer exists. The question changing is the moment all four stop
       being about anything. */
    receipts = new Map();
    edits = new Map();
    /* AND THE HOLDS GO WITH THE RECEIPTS THEY BELONG TO. A hold is a position in ONE answer: keeping it across a
       new question would pin a row to an index in a list it is not in, which is the receipt's own argument one
       layer down. The flash goes for the same reason — a row marked as just added, on a screen somebody has
       just filtered to, is a mark about a different screen. */
    held = new Map();
    fresh = new Map();
    added = new Set();
    lateSeen = false;
    untrack(() => typedRows.clear());
    arrived = new Set();
    owed = false;
    capture = '';
    editing = null;
  });

  /**
   * The next page, or nothing.
   *
   * IT STOPS AT THE CAP, WHICH IS WHAT MAKES THE CAP THE END OF A SEQUENCE rather than a slice. The
   * guard is here rather than in `Table`: an earlier version relied on `Table` swapping its sentinel
   * for the cap line, which is a count of the rows it was HANDED and therefore wrong the moment a
   * row is archived — the sentinel stayed, advertising more that this function then refused.
   *
   * THE RECORD'S CURSOR IS A POSITION IN ITS OWN ORDER, `updated_at` and `id`, so a row changed after
   * page one was fetched moves to the head of the list rather than breaking the walk: it is missed by
   * the walk, not repeated in it, and there is no stale cursor to recover from. The mock's `stale`
   * answer, and the branch here that started over on it, went with the mock.
   *
   * AN ANSWER FOR A QUESTION THAT HAS MOVED ON IS DROPPED. The reader filtered while this page was
   * out, and appending it would put rows from one answer under the head of another.
   */
  async function more() {
    if (cursor === null || fetching) return;
    if (loaded >= DOM_CAP) return;
    const said = asked;
    const from = cursor;
    const register = id;
    const chips = asking;
    const text = q;
    const order = sort;
    const joined = join;
    fetching = true;
    busy = true;
    await read(async () => {
      const next = await (await open()).page(register, { filters: chips, q: text, sort: order, join: joined }, from);
      if (asked !== said) return true;
      if (!next.ok) return refuse(next.refusal);
      pages = [...pages, next.value.entries];
      /* A LATER PAGE MAY NAME ROWS THE FIRST ONE DID NOT, and it must not take away the names the
         rows already on screen are drawn with. The two are added together, newest last. */
      named = joinNames(named, next.value.names);
      cursor = next.value.cursor;
      return true;
    });
    fetching = false;
    if (asked === said) busy = false;
  }

  /**
   * Ask the record this screen's question, and draw the answer whole.
   *
   * ONE BRACKET ROUND ALL OF IT: the declaration, the first page and the pills' counts land
   * together or the screen has not settled. `data-screen` appears the moment nothing is out, and a
   * screen that closed one call before it opened the next would say `ready` for a frame over a list
   * with nothing in it, which is the frame a gate measures.
   *
   * THE PILLS ARE COUNTED ONLY WHILE THE BAR IS DRAWN, one question for each indexed enum field
   * (`countAll`), because a count nobody can see is a request nobody needed. The bar's own test is
   * repeated here from the answer, because the screen has not got the answer yet.
   *
   * AND AN ANSWER FOR A QUESTION THAT HAS MOVED ON IS DROPPED, whole, which is why the state is
   * written at the end rather than as each part arrives.
   */
  /** A list's answer as this tab last drew it (`keepShown`). */
  type Shown = { decl: RegisterDecl; booted: Boot; entries: Entry[]; names: Names; matched: number; counted: Map<string, Map<string, number>>; uncounted: Refusal | null };

  async function ask(said: string, register: string, typed: Filter[], text: string, order: typeof sort, joined: Join, wantsTwice = false): Promise<void> {
    busy = true;
    const mark = localTicket();
    /* The record has answered this asking: a copy landing later than the wait is not drawn over it. */
    let done = false;
    /* THE BRACKET, held open by hand as `read` holds it, so that a return drawn from what this tab kept can close it. */
    const at = opened();
    let released = false;
    const release = (ok: boolean): void => {
      if (released) return ok ? undefined : closed(false, opened());
      released = true;
      closed(ok, at);
    };
    /* WHAT THIS TAB LAST DREW FOR THIS QUESTION is drawn at once on a return, held to read like the copy's, and the
       screen is the screen from that frame (`keepShown`); the record's read lands over it. Not for the people held twice,
       whose answer is asked again each time. */
    const remembered = pages.length === 0 && !wantsTwice ? shownFor<Shown>(apiBase(), said) : null;
    if (remembered !== null) {
      /* AND THE BOOT IT WAS DRAWN WITH, whose count says whether the list is long enough to pick from: drawn without it,
         the table came up with no select column and took one a frame later, laying every row out twice. */
      booted ??= remembered.booted;
      declared = { register, decl: remembered.decl };
      pages = [remembered.entries];
      named = remembered.names;
      cursor = null;
      matched = remembered.matched;
      counted = remembered.counted;
      uncounted = remembered.uncounted;
      fromCopy = true;
      painted('list', 'memory');
      /* AND IT IS NOT BUSY: what it drew is the whole screen, and the read behind it only brings it up to date. */
      busy = false;
      release(true);
    }
    const work = async (): Promise<boolean> => {
      /* NOTHING DRAWN YET: THE LOCAL COPY'S FIRST PAGE AT ONCE, marked `fromCopy` and with no cursor to page from, and
         the record is asked behind it as ever (`lib/data/local.ts`). One later than the wait is drawn when it lands, if
         the record has still not answered: the same rows in the same place the record's answer would put them. */
      let near: Near<KeptList> | null = null;
      if (pages.length === 0) {
        const draw = (got: Near<KeptList>): boolean => {
          if (done || asked !== said || pages.length !== 0 || refusal !== null) return false;
          declared = { register, decl: got.value.decl };
          pages = [got.value.entries];
          named = namesOf(got.value);
          cursor = null;
          matched = got.value.matched;
          fromCopy = true;
          painted('list', 'copy');
          return true;
        };
        const timely = await nearLocal<KeptList>(LIST_COPY, said, apiBase(), (got) => void draw(got));
        if (timely !== null && draw(timely)) near = timely;
      }
      /* A SEARCH OR A FILTER OVER A LIST THIS DEVICE KEEPS WHOLE is answered from it at once, marked as this device's, and
         the record's own answer replaces it when it lands (`searchKept`). Chips the browser asks as the record would (no
         ref, no relative day); the people held twice are the record's to answer. */
      if (near === null && remembered === null && (text !== '' || typed.length > 0) && !wantsTwice) {
        const whole = await nearLocal<KeptList>(LIST_WHOLE, wholeKey(register, order), apiBase());
        const where = typed.length === 0 ? null : ((treeOf(register, typed, '', new Map(), joined) as Predicate | undefined) ?? null);
        const found = whole === null ? null : searchKept(whole.value, text, where);
        if (whole !== null && found !== null && asked === said && !done) {
          const names = namesOf(whole.value);
          /* ONE PAGE OF IT, ordered as the record's answer will be (`ask` in `data/record.ts`), so it lands where it stood. */
          const head = found.entries.slice(0, PAGE);
          declared = { register, decl: whole.value.decl };
          pages = [order && found.matched <= PAGE ? sortRows(register, head, order.field, order.dir, names) : head];
          named = names;
          cursor = null;
          matched = found.matched;
          fromCopy = true;
          searchedHere = true;
          foundRoom = true;
        }
      }
      const src = await open();
      const [b, s] = await Promise.all([src.boot(), src.schema(register)]);
      if (asked !== said) return true;
      /* OFFLINE OVER THE COPY, THE COPY STAYS: a host nobody reached refuses nothing the copy drew. */
      if (!b.ok) return fromCopy && b.refusal.code === 'UNREACHABLE' ? true : refuse(b.refusal);
      booted = b.value;
      if (!s.ok) return fromCopy && s.refusal.code === 'UNREACHABLE' ? true : refuse(s.refusal);
      /* CURRENT AND WHOLE, NOTHING IS ASKED, as Work does: the copy has caught up to every change heard and holds the
         page's cursor and the pills' counts. Not for the people held twice or a list that says `same:`, whose own
         reads are not kept. Boot and the declaration above are the tab's kept answers, and cost no call. */
      if (near?.current && !wantsTwice && sameOf(s.value) === null) {
        const size = b.value.registers.find((r) => r.id === register)?.count ?? 0;
        const counts = size >= ENOUGH_TO_SIFT || text !== '' || typed.length > 0;
        if (servedWhole(near.value, counts)) {
          declared = { register, decl: s.value };
          twiceHeld = null;
          twiceMany = null;
          cursor = near.value.cursor ?? null;
          counted = counts && near.value.pills ? countsOf(near.value.pills) : new Map();
          uncounted = null;
          fromCopy = false;
          keepWhole(register, s.value, order, null, localTicket());
          return true;
        }
      }
      /* WHO MAY BE HELD TWICE, ASKED ONCE A QUESTION and only of a list of people (`heldTwiceOn` reads the role the
         list declares). The answer narrows the list, its counts and every later page of it. A refusal is drawn as one:
         everyone, under a line saying these are the people held twice, is the one wrong answer nobody could see. */
      let rows: Filter | null = null;
      const held = () => {
        const client = createClient({ base: apiBase() });
        return rowsHeldTwice((name, args) => client.call(name, args), register);
      };
      if (wantsTwice && heldTwiceOn(page.url.searchParams, s.value)) {
        const who = await held();
        if (asked !== said) return true;
        if (!who.ok) return refuse(who.refusal);
        rows = who.value;
      }
      /* HOW MANY THINGS ARE HERE TWICE, for the line over a list that says `same:` while the word is off. Asked beside
         the page, and a refusal is nought: the line is a pointer, and a host that cannot answer draws none. */
      const thingsTwice = sameOf(s.value) === null ? null : rows ? Promise.resolve(rows.values.length) : held().then((h) => (h.ok ? h.value.values.length : 0), () => 0);
      const chips = rows ? [...typed, rows] : typed;
      const size = b.value.registers.find((r) => r.id === register)?.count ?? 0;
      const bar = size >= ENOUGH_TO_SIFT || text !== '' || chips.length > 0;
      const [answer, facets, many] = await Promise.all([
        src.page(register, { filters: chips, q: text, sort: order, join: joined }, null),
        bar ? countAll(register, s.value, chips, text, joined) : Promise.resolve<Tally>({ counts: new Map(), withheld: null }),
        thingsTwice,
      ]);
      if (asked !== said) return true;
      if (!answer.ok) return fromCopy && answer.refusal.code === 'UNREACHABLE' ? true : refuse(answer.refusal);
      painted('list', 'network');
      declared = { register, decl: s.value };
      twiceHeld = rows ? { register, rows } : null;
      twiceMany = many === null ? null : { register, n: many };
      pages = [answer.value.entries];
      named = answer.value.names;
      cursor = answer.value.cursor;
      matched = answer.value.matched;
      counted = facets.counts;
      uncounted = facets.withheld;
      fromCopy = false;
      searchedHere = false;
      keepList(said, register, s.value, answer.value, { filters: chips, q: text, sort: order, twice: rows !== null, join: joined }, bar ? facets : null, mark);
      /* AND THE REST OF THE LIST, WHEN IDLE: the whole of it kept beside this page (`keepWhole`). */
      keepWhole(register, s.value, order, chips.length === 0 && text === '' ? answer.value : null, mark);
      if (!wantsTwice) keepShown(apiBase(), said, { decl: s.value, booted: b.value, entries: answer.value.entries, names: answer.value.names, matched: answer.value.matched, counted: facets.counts, uncounted: facets.withheld } satisfies Shown);
      return true;
    };
    let ok = false;
    try {
      ok = await work();
    } finally {
      release(ok);
    }
    done = true;
    if (asked === said) busy = false;
  }

  /**
   * THE PAGE AS THE LOCAL COPY KEEPS IT: its rows, cursor and counts, and where its rows are so a change can be placed
   * on them (`kept-list.ts`). Counts the record withheld are kept as none, so that copy is always asked behind.
   */
  function keepList(
    said: string,
    register: string,
    d: RegisterDecl,
    got: { entries: Entry[]; matched: number; names: Names; cursor: string | null },
    ask: { filters: Filter[]; q: string; sort: typeof sort; twice: boolean; join: Join },
    facets: Tally | null,
    mark: number,
  ) {
    const counts = facets === null ? null : facets.withheld ? null : facets.counts;
    const pills = facets === null ? [] : filterableOf(d.fields).filter((f) => f.type === 'enum').map((f) => f.id);
    /* THE CHIPS AS THE RECORD'S TREE, so a create can be asked the same question here (`local.ts` `Lands`). No refs are
       handed over: a chip over a ref stays a number, which the copy refuses to answer and drops the page instead. */
    const where = ask.filters.length === 0 ? null : ((treeOf(register, ask.filters, '', new Map(), ask.join) as Predicate | undefined) ?? null);
    keepLocal(LIST_COPY, said, listsOf(register, d), keptOf(d, got.entries, got.matched, got.names, { cursor: got.cursor, pills: counts }), mark, { [register]: d }, {
      spots: [spotOf(register, ask, pills, where)],
    });
  }

  /** The walks out now, by the whole copy's key: a list opened twice walks once. */
  const walking = new Set<string>();
  /* THE SCREEN WENT: a walk still out stops at its next page. */
  let left = false;
  $effect(() => () => {
    left = true;
  });

  /** Once the browser is idle, or a second has gone by: a walk never takes a frame the reader is using. */
  const idle = (): Promise<void> =>
    new Promise((resolve) => {
      const ric = (globalThis as { requestIdleCallback?: (fn: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      if (ric) ric(() => resolve(), { timeout: 1_000 });
      else setTimeout(resolve, 50);
    });

  /**
   * THE WHOLE LIST, KEPT BESIDE ITS FIRST PAGE so a search, a filter and a create reach every row here (`walkWhole` in
   * `kept-list.ts`): the unfiltered list in this order, its pages walked one at a time when idle, up to
   * `LIST_ROWS_MOST`. `first` is this opening's own unfiltered first page when it had one, and `mark` the ticket it was
   * asked under, so a change heard during the walk keeps none of it. A whole copy kept today is the log's to keep right.
   */
  function keepWhole(register: string, d: RegisterDecl, order: typeof sort, first: Paged | null, mark: number) {
    const key = wholeKey(register, order);
    if (walking.has(key) || (first !== null && first.matched > LIST_ROWS_MOST)) return;
    walking.add(key);
    void (async () => {
      try {
        const held = await nearLocal<KeptList>(LIST_WHOLE, key, apiBase());
        if (held !== null && new Date(held.kept).toDateString() === new Date().toDateString()) return;
        const src = await open();
        const pageAt = (from: string | null): Promise<Paged | null> =>
          src.page(register, { filters: [], q: '', sort: order }, from).then((got) => (got.ok ? got.value : null), () => null);
        const start = first ?? (await idle().then(() => (left || id !== register ? null : pageAt(null))));
        if (start === null) return;
        const whole = await walkWhole(start, (c) => pageAt(c), { most: LIST_ROWS_MOST, idle, gone: () => left || id !== register });
        if (whole === null) return;
        keepLocal(LIST_WHOLE, key, listsOf(register, d), { ...keptOf(d, whole.entries, whole.matched, whole.names, { cursor: null, pills: null }), whole: true }, mark, { [register]: d }, {
          spots: [spotOf(register, { filters: [], q: '', sort: order, twice: false }, [], null)],
        });
      } finally {
        walking.delete(key);
      }
    })();
  }

  /** A refusal, drawn instead of the list. `false`, because that is what `read` records. */
  const refuse = (said: Refusal): false => {
    refusal = said;
    return false;
  };

  /**
   * THE RECORD CHANGED UNDER THIS LIST, AND THE LIST ONCE NEVER HEARD. It asked again only when its own question
   * changed, and an agent writing into the list he has open changes none of the four parts of it, so the row appeared
   * on his next navigation and not before. The shell's poll publishes the
   * record's version (`lib/data/live.svelte.ts`), and a change is this screen's cue to ask its current question again.
   *
   * ONE PAGE IS REPLACED WHERE IT STANDS. MORE THAN ONE IS MARKED STALE, and that is `50 §5.4` step 2. Page 1 asked again
   * is page 1 of the answer as it is now, and pages two to eleven were cut from the answer as it was: splicing a fresh
   * head onto them would drop or repeat whatever moved across the seam. So the list says it is stale and offers to
   * start again from the top, which is a decision about the reader's scroll position that is theirs to take.
   *
   * WHAT THE READER HAS TYPED IS NOT TOUCHED. `edits` is a patch drawn over `pages` in `result`, and the cell editor
   * holds its own `editValue`, so replacing the rows leaves both where they were (`50 §5.4` step 5). The receipts and
   * the holds are keyed by number and survive too, because the question has not changed.
   *
   * AND IT IS NOT A `read`. `read` brackets the screen's readiness counters, and a refused call latches `refused` on
   * `screen.svelte.ts` until the next navigation: a background re-ask that failed would turn a drawn list into
   * `data-screen="refused"` under the reader, over rows that are all still correct. A failed poll is already the
   * hairline's to say, so a failed re-ask here says nothing and the next change tries again.
   */
  let stale = $state(false);
  /** The rows on screen came from the local copy and the record has not answered yet. */
  let fromCopy = $state(false);
  /** And they are a search this device answered over the list it keeps whole (`searchKept`), said in a line. */
  let searchedHere = $state(false);
  /**
   * THE LINE'S ROOM, HELD ONCE IT HAS BEEN SAID for this search, so the record's answer replacing it does not pull the
   * rows up a line and the next word typed push them down again. Given back when the search and the chips are.
   */
  let foundRoom = $state(false);
  $effect(() => {
    if (q === '' && filters.length === 0) foundRoom = false;
  });
  /* The quiet mark over the work while they are (`copy-mark.svelte.ts`). */
  $effect(() => {
    if (!fromCopy) return;
    return untrack(() => holdCopyMark());
  });
  /* The version this list was drawn at. A plain `let`, because it is compared and never drawn. */
  let drawnAt = untrack(() => live.version);

  $effect(() => {
    const now = live.version;
    if (now === null || now === drawnAt) return;
    drawnAt = now;
    untrack(() => void recheck());
  });

  /**
   * A CHANGE HEARD WHILE A CELL IS OPEN IS READ WHEN IT CLOSES. The poll asks every 1.5 s while somebody is looking, and
   * a row an agent added at the head of the list moves every row under it down one: the cell being typed in would be
   * rebuilt a row lower, and the caret would go with the old one. So the list waits for the editor, once, however many
   * changes land meanwhile, and reads as soon as it closes.
   */
  let owed = $state(false);
  $effect(() => {
    if (editing === null && owed) untrack(() => void recheck());
  });

  /* THE LATEST RE-ASK STARTED IS THE ONE DRAWN, so an answer that took longer than the next poll never lands over it. */
  let rechecks = 0;

  /**
   * THE ROWS THAT ARRIVED WHILE THE READER LOOKED, by the key the table speaks in, tinted for a moment
   * (`[data-arrived]` in `blocks.css`). Only a re-ask marks them: a page the reader scrolled to is rows they asked for,
   * and a row they typed wears its own mark (`fresh`).
   */
  let arrived = $state(new Set<string>());
  function arrive(keys: readonly string[]) {
    if (keys.length === 0) return;
    arrived = new Set([...arrived, ...keys]);
    setTimeout(() => {
      const next = new Set(arrived);
      for (const k of keys) next.delete(k);
      arrived = next;
    }, ARRIVED_MS + 20);
  }

  async function recheck() {
    if (declared?.register !== id) return;
    if (editing !== null) {
      owed = true;
      return;
    }
    owed = false;
    if (pages.length > 1) {
      stale = true;
      return;
    }
    const mine = ++rechecks;
    const mark = localTicket();
    const said = asked;
    const register = id;
    const chips = asking;
    const text = q;
    const order = sort;
    const joined = join;
    const decl = declared.decl;
    const src = await open();
    const [answer, facets] = await Promise.all([
      src.page(register, { filters: chips, q: text, sort: order, join: joined }, null),
      counted.size > 0 || uncounted ? countAll(register, decl, chips, text, joined) : Promise.resolve<Tally>({ counts: counted, withheld: null }),
    ]);
    if (asked !== said || !answer.ok || mine !== rechecks) return;
    /* THE READER SCROLLED WHILE THIS WAS OUT, and page 2 is now under page 1: the same seam as above. */
    if (pages.length > 1) {
      stale = true;
      return;
    }
    /* THE HEAD'S TOTAL IS `boot`'s COUNT, AND `boot` IS KEPT FOR THE TAB, so a row an agent added would be drawn under a
       head still counting one fewer. Unfiltered, the answer's size moving is the register's size moving, which is the
       arithmetic `addLanded` already does by one. Filtered, it says nothing about the rows outside the filter. */
    if (booted && chips.length === 0 && text === '') {
      const by = answer.value.matched - matched;
      if (by !== 0) booted = { ...booted, registers: booted.registers.map((r) => (r.id === register ? { ...r, count: r.count + by } : r)) };
    }
    const had = new Set(pages.flat().map((e) => e.seq));
    arrive(answer.value.entries.filter((e) => !had.has(e.seq) && !fresh.has(e.seq)).map((e) => `${register}#${e.seq}`));
    pages = [answer.value.entries];
    named = answer.value.names;
    cursor = answer.value.cursor;
    matched = answer.value.matched;
    counted = facets.counts;
    uncounted = facets.withheld;
    fromCopy = false;
    searchedHere = false;
    /* AND KEPT AGAIN, so the next open draws the list as it now is. */
    keepList(said, register, decl, answer.value, { filters: chips, q: text, sort: order, twice: chips.some(isRows), join: joined }, counted.size > 0 || uncounted ? facets : null, mark);
  }

  /** The stale mark's control: the question asked again from the top, as a question the reader chose to ask. */
  function refresh() {
    stale = false;
    void ask(asked, id, filters, q, sort, join, twiceAsked);
  }

  /**
   * How many entries hold each value of each pill, under every other chip and the search: the list's
   * own question, without that one field's chip, counted by that field.
   *
   * ONE REQUEST A FIELD, WHERE IT WAS ONE A VALUE (`counts` in `data/record.ts`, the record's `countBy`).
   *
   * UNDER "or" THE CHIPS WIDEN THE LIST AND NARROW NOTHING, so a pill is counted under the search alone: how many
   * entries hold its value, which is what pressing it adds to the list.
   *
   * A FIELD THE RECORD WOULD NOT COUNT HAS NO NUMBERS, NEVER NOUGHTS (`tally`): it was filled with a 0 a value, which
   * read "Open 0, Paid 0" over a list that opened full. The refusal comes back beside the counts as `withheld`, and
   * the screen says it in a line under the bar.
   */
  async function countAll(register: string, d: RegisterDecl, chips: Filter[], text: string, joined: Join): Promise<Tally> {
    const src = await open();
    return tally(
      await Promise.all(
        filterableOf(d.fields)
          .filter((f) => f.type === 'enum')
          .map(async (f) => {
            /* "or" ONLY WITH MORE THAN ONE CHIP, as `either` reads it: one chip joined by "or" still narrows the list. */
            /* THE PEOPLE HELD TWICE ARE KEPT WHATEVER JOINS THE CHIPS: they say whose counts these are. */
            const typed = chips.filter((x) => !isRows(x));
            const others = [...chips.filter(isRows), ...(joined === 'any' && typed.length > 1 ? [] : typed.filter((x) => x.field !== f.id))];
            return [f.id, await src.counts(register, { filters: others, q: text }, f.id, f.values ?? [])] as const;
          }),
      ),
    );
  }


  /**
   * The whole answer's SIZE, which is not the same as the rows in hand.
   *
   * THE RECORD ANSWERS BOTH COUNTS WITHOUT HANDING OVER THE ROWS: `matched` comes back with every
   * page, and what the register holds comes from `boot`. The mock walked the whole filter a second
   * time to learn them, which is what the two numbers every surface on this screen reads cost.
   */
  const total = $derived(booted?.registers.find((r) => r.id === id)?.count ?? 0);
  /**
   * `total` IS WHAT THE LIST HOLDS, AND ARCHIVING HERE HOLDS NOTHING.
   *
   * I made this `found.total - archived.size` one iteration ago, to settle a sweep's finding that
   * the header read "37 of 38" while the empty state read "38 rows, none matching". Both were
   * true and the change was wrong twice over: the rail kept reading 38 from the record, so the two
   * numbers for one list disagreed across the screen; and once `count === total` the head drops its
   * "of N" span entirely, so the header stopped admitting it was showing a subset at all.
   *
   * Archive is page-local state that writes nothing — the record does still hold 38 — so `total` is
   * 38 and says so. What the sweep actually found is one level down and is in the backlog: a
   * destructive control in a mock-up that hides rows the record still has.
   *
   * A FILTER IS A DIFFERENT MATTER, and it is what `asked` below is for. `50 §5.2` step 6 makes the
   * head's denominator the ANSWER's size while filtering — *"`Matches n of N` is exact when
   * `cursor === null`, else `200+ of N`"* — and the head was counting against the register's size in
   * every state. At the cap under `?q=a` it read *2,000 of 2,614* three inches above a cap line
   * reading *Showing 2,000 of 2,545*, which is two answers to one question on one screen. Each
   * number was defensible alone and the pair was not.
   */
  /**
   * THE ORDER THE LIST OPENS IN: late first where it has a deadline (`lateFirst` in `parts/list.ts`), and the record's
   * own order everywhere else. The head said "4 late" over a list in the order its rows were last touched, so the four
   * were wherever they fell among thirty-eight.
   *
   * ONLY WHILE THE WHOLE ANSWER IS IN HAND AND NOBODY HAS ASKED FOR AN ORDER. A sort in the address is the reader's, and
   * it wins. A list still being paged keeps the record's order, because putting page one in a new order and page two
   * under it in the old one is an order nobody chose; and once a second page has been walked to, the rows stay where
   * the reader scrolled past them.
   */
  const lateOwn = $derived(cursor === null && pages.length <= 1 && deadlineOf(decl) !== undefined);
  const lateLeads = $derived(!sort && lateOwn);
  const ordered = $derived(lateLeads ? lateFirst(decl, pages.flat(), now, added) : pages.flat());

  const result = $derived({
    total,
    /* THE ROWS IN HAND, not the whole answer. `matched` is the answer's SIZE — what the head counts
       against, and what "38 rows, none matching" is about. What the head PRINTS while paging is
       `drawn`, the rows actually on screen; the two were conflated and the head over-reported. */
    /* AND A ROW THAT JUST CHANGED IS STILL HERE. This filtered archived rows OUT, so the row left
       the screen the instant it was touched and the reader's only way to check they had hit the
       right one was to do the opposite and look. `receipts` is what keeps it: the row is drawn
       where it was, wearing what happened to it, until the question changes. */
    /* AND WHAT HAS BEEN EDITED HERE IS WHAT THE ROW SHOWS. A cell that took a value and then drew
       the old one is a control that reports success and does nothing, which is the shape this
       repository hunts. The patch is over the answer rather than in it: `pages` still holds what
       the record returned, so `Put back` is dropping a key rather than reversing an arithmetic. */
    /* AND A ROW SOMEBODY HAS JUST ACTED ON IS WHERE THEY LEFT IT. `holdInPlace` pins each held row to the index it
       was read at and brings back one the answer has since dropped — the reopened row that no longer matches the
       chip it was found under. The hold is released when the question changes, with the receipt it belongs to. */
    /* AND A LINE TYPED INTO THE CAPTURE IS AT THE HEAD BEFORE THE RECORD HAS IT (`typedRows`), until it lands. */
    entries: typedRows.draw(holdInPlace(ordered, held)).map((e) => {
      const patch = edits.get(e.seq);
      return patch ? { ...e, fields: { ...e.fields, ...patch } } : e;
    }),
    matched,
    names: named,
  });

  /**
   * THE ROW THE READER JUST MADE, MARKED FOR A MOMENT SO THE EYE CAN FIND IT.
   *
   * IT IS CLEARED IN `$effect.pre` AND THAT IS THE WHOLE TRICK. A mark cleared in an ordinary `$effect` is cleared
   * AFTER the list has drawn, which marks the list dirty and draws it a second time — and the second draw rebuilds
   * the marked cell, cancelling the animation it had just started. The row flashed for a frame and settled, which
   * reads as a rendering fault rather than as an answer. Cleared before the draw, each pass either has the mark or
   * does not, and the one that has it keeps it for the whole of its animation.
   *
   * IT SITS BELOW `result` BECAUSE IT READS IT. `$effect.pre` runs during the first render pass, and `const` in the
   * same scope is not hoisted, so declared any higher this reads `result` before it exists and every register screen
   * throws on first paint. Neither the typechecker nor the tests can see that; only the compiled output can.
   *
   * A MARK FOR A ROW THAT IS NO LONGER IN THE ANSWER GOES WITH IT, so nothing accumulates across a question.
   */
  const FRESH_MS = 2_000;
  let fresh = $state(new Map<number, number>());

  $effect.pre(() => {
    const drawn = result.entries;
    untrack(() => {
      if (fresh.size === 0) return;
      const at = Date.now();
      const keep = new Map([...fresh].filter(([seq, put]) => at - put < FRESH_MS && drawn.some((e) => e.seq === seq)));
      if (keep.size !== fresh.size) fresh = keep;
    });
  });

  /* THE PHONE'S CARDS WEAR THE SAME WASH AS THE TABLE'S ROWS (VERIFY H24): a row typed here (`fresh`) and a row that
     landed from elsewhere (`arrived`), by `seq`. */
  const cardsArrived = $derived(
    new Set([...fresh.keys(), ...[...arrived].flatMap((k) => (k.startsWith(`${id}#`) ? [Number(k.slice(id.length + 1))] : []))]),
  );

  /**
   * THE ROWS IN HAND, WHICH IS NOT THE ROWS FETCHED.
   *
   * This summed the raw pages, archived rows included, while `Table` counts what it actually draws —
   * so archiving three rows on page one left `more()` stopping at 2,000 fetched while the grid held
   * 1,997. `Table`'s cap never fired, the cap line vanished, the head over-reported by three, and
   * the sentinel went on advertising more that `more()` refused to fetch. One number, counted the
   * way the screen counts it.
   */
  const loaded = $derived(result.entries.length);

  /**
   * HOW MANY ROWS MAKE SIFTING WORTH OFFERING.
   *
   * A CONTROL THAT ACTS ON A SET IS NOISE UNTIL THE SET IS BIGGER THAN THE SCREEN. Measured on this
   * page at 390px with one row: the row's top was 445px into an 844px viewport — the row 5% of the
   * screen, the chrome 53% — and 45 of the 71 focusable controls in `<main>` were there whether the
   * list held one row or thirty-eight. Searching a list you can see all of is slower than reading
   * it, and filtering it is slower still.
   *
   * EIGHT, BECAUSE THAT IS WHAT FITS. A phone shows about eight card rows at once, so below it
   * everything the person owns is already in front of them and there is nothing to find. It is the
   * one number here and it is tied to a screen rather than to a taste.
   *
   * IT IS DECLARED HERE, ABOVE THE COLUMNS, BECAUSE THE COLUMNS ASK IT. It used to sit four hundred
   * lines further down beside the bar it gates, which was fine while the bar was the only thing that
   * asked: the picker column and the select-all were unconditional, so half of the answer to "is
   * this list big enough to act on in bulk" was drawn and half was not.
   */
  const ENOUGH_TO_SIFT = 8;

  /** The name this screen's answers are kept under in the local copy, keyed by the question (`asked`). */
  const LIST_COPY = 'RegisterList';
  /** And the whole list, every row in one order, keyed by the list and the order (`keepWhole`). */
  const LIST_WHOLE = 'RegisterWhole';
  const wholeKey = (register: string, order: typeof sort): string => JSON.stringify([register, order ?? null]);

  /** The moment `19 §6` describes: the register, with their one row in it. */
  const arriving = $derived(page.url.searchParams.has('first'));

  const siftable = $derived(!arriving && result.total >= ENOUGH_TO_SIFT);

  /**
   * AND THE PICKER IS NOT ON THE SCREEN UNTIL THERE IS A SET TO BUILD.
   *
   * The product should grow as the record grows, and the
   * example is exactly this: *"a control that is meaningless at n=1 should not be on the screen at
   * n=1"*. Everything the bulk bar offers over one row (copy the id, set the state, archive it)
   * is already on that row's own menu, so at one row the picker is a column of chrome whose only
   * outcome is a toolbar that says `1 selected` above a list of one.
   *
   * THE SAME THRESHOLD THE BAR ABOVE IT USES, because they are one feature. `siftable` was already
   * gating the search and filter bar; the picker
   * and the select-all were left unconditional, so half of the answer to "is this list big enough
   * to act on in bulk" was drawn and half was not.
   */
  /* The register's own projection. Which column carries the row's tone is `ListTable`'s (`deadlineOf` in `parts/list.ts`): the deadline, beside the date it is about. */
  /* A LATE ROW SAYS HOW LATE BEFORE ITS DAY ("38 days late · 27 Jul 2026"), so the deadline's column takes the room for
     both while any row in hand is late, and its fifteen characters otherwise. */
  const anyLate = $derived(result.entries.some((e) => isLate(decl, e, now)));
  /* AND IT KEEPS THAT ROOM FOR AS LONG AS THE QUESTION STANDS. Marking the last late bill paid would otherwise narrow
     the column under the pointer that pressed it, and every column after it would move. */
  let lateSeen = $state(false);
  $effect(() => {
    /* Read with the question, which puts the latch down above, so a new question over a list still late sets it again. */
    void question;
    if (anyLate) lateSeen = true;
  });
  const projected = $derived(
    /* THE NUMBER IS THE ONE COLUMN OFF BY DEFAULT (no list has an id column until Display adds "Number"), so for
       it the stored set means the reverse: in the set, drawn. */
    columnsFor(id, decl, hidden.has('seq'))
      .filter((c) => c.field === 'seq' || !hidden.has(c.field))
      .map((c) => weighed(c, c.field === decl?.title, result.entries))
      .map((c) => ((anyLate || lateSeen) && c.field === deadlineOf(decl) ? { ...c, width: '27ch' } : c)),
  );

  /* THE MONEY COLUMNS WHERE EVERY AMOUNT IN HAND IS WHOLE, which the table draws without their ".00" (`wholeMoney`). */
  const wholeColumns = $derived(wholeMoney(decl, result.entries));

  /* THE PICKER LEADS THE ROW, in a 32px column of its own (money F7): a box at the far end,
     drawn only under the pointer, was found by nobody, and the select-all box has nowhere to stand but over it. The box
     shows under the pointer and stays on every row once one is ticked (`ListTable`). Only on a list long enough to
     pick from. */
  const columns = $derived([
    ...(siftable ? [{ field: 'select', label: copy.select, hideLabel: true, width: '32px', truncate: 'never' as const }] : []),
    ...projected.filter((c) => c.field !== 'seq'),
    /* THE SPOKEN ID ENDS THE ROW, quiet, where a list keeps what you look up rather than read. It
       led the row, so every line opened on a number; the project's mark that shared its cell now
       sits in front of the title, where colour saying which project is read. */
    ...projected.filter((c) => c.field === 'seq'),
    /**
     * THE VERBS, AND THE RECEIPT, IN THE ROW.
     *
     * EVERY FREQUENT VERB WAS BEHIND A MODAL. The editing path was `Sheet` wrapping `RowForm`,
     * opened from the register page, and in the record this product is modelled on **61% of what a
     * person does to a row could not be done where the row is drawn** before the equivalent change
     * was made there. That one choice is most of what makes this screen read as enterprise
     * software: the list is a place you look things up from and go somewhere else to act.
     *
     * ONE COLUMN, TWO STATES. A row that has just been acted on shows what happened and the way
     * back; every other row shows the verbs. They cannot both be true of one row, so they share a
     * cell rather than competing for the width of two.
     *
     * `hideLabel`, because the header of a column of controls is not a heading, and `truncate:
     * 'never'`, because a truncated verb is a different verb.
     */
    /* 176 WHERE A ROW CAN CHANGE, so a receipt's "Archived" and its "Put back" fit beside each other and the way back is
       never cut (motion F7.3). Fixed, so a receipt arriving moves no column. */
    { field: 'act', label: copy.rowActions, hideLabel: true, width: changes ? '176px' : '11ch', align: 'end' as const, truncate: 'never' as const },
  ]);

  /**
   * WHAT THE HEAD COUNTS AGAINST: the answer while filtering, the list otherwise.
   *
   * Unfiltered the two are the same number, so this changes nothing on the ordinary screen. Filtered
   * they are not, and the head and the cap line have to be talking about the same denominator or one
   * of them is wrong wherever they are both visible, which is exactly at the cap, the one place the
   * cap line exists for.
   */
  /* NO COUNT OF PEOPLE INCLUDES YOU, NOR ANYBODY FOLDED INTO ANOTHER (29 October: "sidebar 11, list header 12"). You
     stay on the list, its first row, marked You; the head, the line under it and the sidebar say the people you know. */
  const notCounted = $derived.by(() => {
    const m = meetsOf(decl);
    if (!m) return 0;
    return result.entries.filter((e) => (m.self && e.fields[m.self] === true) || mergedAway(e.fields, decl)).length;
  });
  /** You are a row of this list, drawn and not counted, so its line says "besides you" (AM17). */
  const youListed = $derived.by(() => {
    const m = meetsOf(decl);
    return m?.self !== undefined && result.entries.some((e) => e.seq > 0 && e.fields[m.self!] === true);
  });
  const denominator = $derived(Math.max(0, (narrowed || q ? result.matched : result.total) - notCounted));

  /**
   * AND WHAT IS ACTUALLY DRAWN, WHICH IS NEITHER OF THE OTHER TWO.
   *
   * `more()` stops once `loaded` reaches the cap, and a page is two hundred rows, so it overshoots:
   * eleven pages minus three archived rows is 2,197 loaded while the grid slices to 2,000. Reporting
   * `loaded` put "2,197" in the head and "Showing 2,197 of 2,611" in the cap line over two thousand
   * rows — two numbers describing rows nobody can see. The head and the line both count the grid.
   */
  const drawn = $derived(Math.min(loaded, DOM_CAP));

  /* THE HEAD SAYS THE LIST'S COUNT, which the record answered with the first page, and never "200+ of 2,527": what
     is drawn so far is the foot's to say (`shownSaid`). */
  const head = $derived(Math.max(0, headCount({ matched: result.matched, drawn }) - notCounted));

  /**
   * A SORTED LIST THE RECORD STOPPED, which is the one list with no next page that is not whole.
   * The record will not page an `order`, so a sorted answer is its first page with `cursor: null`,
   * and fewer rows in hand than it matched is how the screen knows the list stopped rather than
   * ended. It is drawn like the cap: the count is exact and the cap line says what is missing.
   */
  const fetched = $derived(pages.reduce((n, p) => n + p.length, 0));
  const truncated = $derived(cursor === null && fetched < matched);

  /** Whether the reader is looking at all of it. Everything honest on this screen turns on it. */
  const whole = $derived(cursor === null && !truncated);

  /**
   * HOW THE LIST IS DRAWN FROM 640PX UP: the table, the board or the cards (`parts/list.ts` `viewOf`), and it is the
   * address's, `?view=board`, so a link to a board opens on the board and Back undoes a switch. It is not part of the
   * question (`question` above), because the rows are the same rows whichever way they are laid out, so switching
   * asks the record nothing. A phone draws cards whatever it says.
   */
  const view = $derived(viewOf(page.url.searchParams.get('view'), decl));
  const boardable = $derived(laneFieldOf(decl) !== undefined);
  /* A LIST OF PEOPLE THAT SAYS WHICH ORGANISATION EACH IS WITH opens grouped by it (`homeViewOf`), so its bare address is
     the groups and its table is `?view=table`. */
  const groupable = $derived(groupsOf(decl));
  const setView = (v: View) =>
    setParam((p) => {
      if (v === homeViewOf(decl)) p.delete('view');
      else p.set('view', v);
    });

  /**
   * THE FIELD THE BOARD'S LANES ARE (`laneFieldOf`): the state unless Display chose another choice field, which the
   * address carries as `?lane=` so a link to a board by priority opens by priority. Choosing the one the board takes by
   * itself writes nothing.
   */
  const lane = $derived(laneFieldOf(decl, page.url.searchParams.get('lane')));
  const lanes = $derived(laneChoicesOf(decl));
  const setLane = (field: string) =>
    setParam((p) => {
      if (field === laneFieldOf(decl)?.id) p.delete('lane');
      else p.set('lane', field);
    });

  /**
   * THE WAY THIS PERSON KEEPS THIS LIST: "Keep as my default" in Display saves its order, view, lanes and hidden columns
   * (`ListDefault`), and a list opened with nothing in its address opens that way. On this device for now, under the
   * record, the person and the list, and the sheet says so.
   *
   * OPENED, NOT EVERY TIME THE ADDRESS IS EMPTY. Clear goes to the bare address of the list it is on, and Clear means
   * the list's declared order; so a default applies only on arriving at the list from somewhere else, or on a first
   * load, and once its declaration is in hand, since a default is held up against the fields the list has now. It
   * replaces the address rather than pushing one, so Back does not walk into the bare list and out again.
   */
  const store = (): Keep | null => {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
      return null;
    }
  };
  const keepKey = $derived(defaultKey(shell.index?.slug ?? '', String(shell.me?.person ?? ''), id));
  let kept = $state<ListDefault | null>(null);
  $effect(() => {
    kept = readDefault(store(), keepKey);
  });
  const current = $derived(defaultFrom(page.url.searchParams, hidden));
  const isDefault = $derived(kept !== null && sameDefault(kept, current));

  let opening = $state<string | null>(null);
  /* A FIRST LOAD ARRIVES FROM A `from` WITH NO ADDRESS, which `arrivedAt` reads without throwing. */
  afterNavigate(({ from, to }) => {
    const at = arrivedAt(from, to);
    if (at !== null) opening = at;
  });
  $effect(() => {
    if (opening === null || opening !== id || !decl) return;
    opening = null;
    if (page.url.search !== '') return;
    const d = untrack(() => readDefault(store(), keepKey));
    if (!d) return;
    const { params, hidden: off } = defaultParams(d, decl);
    untrack(() => setColumns(off));
    if (params.size > 0) void goto(`?${params}`, { replaceState: true, noScroll: true, keepFocus: true });
  });

  /* The page's own words for a device that would not keep the default. */
  const keepWords = { notKept: 'This browser would not keep your default. A private window keeps nothing.' } as const;

  function keepDefault() {
    const d = defaultFrom(page.url.searchParams, hidden);
    if (writeDefault(store(), keepKey, d)) kept = d;
    else void toasts.push(keepWords.notKept, { intent: 'warn' });
  }

  function forgetDefault() {
    if (writeDefault(store(), keepKey, null)) kept = null;
  }

  /**
   * THE ROWS THE LIST'S OWN FIGURES ARE OVER: the rows the record holds, without a line still being typed in and
   * without a row archived on this screen, which the list keeps in its place wearing its receipt but no longer holds.
   */
  const standing = $derived.by(() => {
    const m = meetsOf(decl);
    return result.entries.filter(
      (e) => e.seq > 0 && receipts.get(e.seq)?.mark !== copy.markArchived && !(m && ((m.self && e.fields[m.self] === true) || mergedAway(e.fields, decl))),
    );
  });

  /**
   * THE SENTENCE UNDER THE TITLE: what is open, what is late in red, and when the next thing falls due
   * (`readingOf`). It counts the rows in hand, so it says nothing while the list is still being paged.
   */
  const reading = $derived(
    readingOf(decl, standing, now, { whole, filtered: narrowed || q !== '', matched: Math.max(0, result.matched - notCounted), total: Math.max(0, result.total - notCounted), besides: youListed }),
  );

  /** A row's title as the list says it, for the summary tile's largest rows. */
  const titleSaid = (e: Entry): string => (decl ? display(id, decl.title, e.fields[decl.title], now, result.names ?? undefined) : null) ?? copy.thisRow;

  /**
   * `aria-rowcount`, which `50 §5.2` step 4 gives three states and this screen gave one.
   *
   * *"`N` from `index` when unfiltered, `-1` while filtered and paging, the exact count once
   * `cursor` is null."* `-1` is the ARIA spelling of *I do not know yet*, and it is the honest
   * answer for a filtered list still being paged: the total is knowable only by finishing the walk,
   * and a screen reader told "row 12 of 38" while the grid is still fetching has been told a number
   * that may move under it.
   */
  /**
   * `-1` MEANS *STILL FETCHING*, WHICH THE CAP IS NOT.
   *
   * `50 §5.2` step 4 scopes it precisely: *"`-1` while filtered **and paging**"*. At the cap the
   * walk has stopped and the count is known, so `-1` there tells a screen reader the total is
   * unknowable when the line beside it prints the number. `settled` is the honest test: the answer
   * is whole, or the grid has reached the cap and will not grow.
   *
   * And `matched` rather than `total` on the other branch: archiving here is page-local and the
   * record still holds every row, but `aria-rowcount` describes THIS GRID, which has stopped drawing
   * the archived ones. It read 2,614 over 2,611 rows.
   */
  const settled = $derived(whole || truncated || drawn >= DOM_CAP);
  const rowCount = $derived(settled ? result.matched : narrowed || q ? -1 : result.matched);

  /**
   * THE SENTINEL, AND THE OBSERVER `50 §5.2` STEP 4 SPECIFIES.
   *
   * `Table` has declared an `onmore` prop and rendered a `<div class="sentinel">` since it was
   * written, and across `apps` and `packages` there was not one call site and not one
   * `IntersectionObserver` — a mechanism with its middle removed. This is the middle.
   *
   * IT WATCHES WHATEVER BODY IS ON THE SCREEN. The grid and the card list are one at a time now, so
   * the observer re-attaches when the body changes rather than holding a node that has been
   * unmounted; `body` is the element that wraps both, and the effect re-runs when it moves.
   *
   * `rootMargin` FETCHES BEFORE THE READER ARRIVES. A page that starts loading when the sentinel is
   * already visible is a page that stutters at every boundary; 600px is about two screens of rows at
   * this row height.
   */
  let body = $state<HTMLElement | undefined>(undefined);

  $effect(() => {
    /**
     * EVERY REASON THE SENTINEL COULD HAVE MOVED, READ ON PURPOSE.
     *
     * The only reactive read here was `body`, which is bound to the wrapper holding BOTH bodies and
     * therefore never changes — so this effect ran exactly once, for the life of the page, holding
     * whichever node existed at mount.
     *
     * Two ways that broke, both measured and both permanent. Navigating `/r/obligations` →
     * `/r/services` (16 rows, no sentinel) → back reuses the component across the `[register]` param:
     * the observed node left the document, a new sentinel was built, nobody watched it, and the
     * reader sat on 200 of 2,614 under a head reading `200+` with a sentinel that did nothing.
     * Crossing 640px did the same thing, in both directions, because the two bodies are separate
     * elements now.
     *
     * `id`, `whole`, `loaded` and `rowsAsCards()` are the four facts that decide whether a sentinel
     * exists and which element it is. Reading them makes the subscription follow it.
     */
    void id;
    void whole;
    void loaded;
    void rowsAsCards();
    /* AND WHICH OF THE THREE LAYOUTS IS DRAWN, since the board and the cards end in a sentinel of their own. */
    void view;
    const el = body?.querySelector('.sentinel');
    if (!el) return;
    /* THE ROOT IS THE APP'S SCROLLER, NOT THE VIEWPORT. `+layout.svelte` makes `#main` "the ONE
       scroll container" so the rail never moves and the window shows one scrollbar — which means
       the window never scrolls, the sentinel never enters the viewport, and an observer with the
       default root fires exactly once, at load, and never again. Measured: page one drew and eight
       scrolls to the bottom added nothing. */
    const io = new IntersectionObserver((entries) => entries[0]?.isIntersecting && more(), {
      root: body?.closest('#main') ?? null,
      rootMargin: '600px',
    });
    io.observe(el);
    return () => io.disconnect();
  });
  /* NAMED BY THE RECORD THAT DREW THEM. `result.names` is the record's own title for every row a
     ref on this list points at, and `null` only before the first answer has landed. */
  /* AND A READING'S VALUE CARRIES ITS UNIT: "16.4%", where the "%" sat in a field no column drew. AND AN AMOUNT
     SAYS WHICH WAY IT WENT, "−EGP 279.03" and "+EGP 600.00", as Money's page says it. */
  const readings = $derived(readingsOf(decl));
  const amountAt = $derived.by(() => {
    const f = wayField(decl) ? amountField(decl) : undefined;
    return f ? columns.findIndex((c) => c.field === f.id) : -1;
  });
  const rows = $derived.by(() => {
    const drawn = toRows(id, result.entries.slice(0, DOM_CAP), columns, now, result.names ?? undefined);
    const shown = result.entries;
    const at = readings ? columns.findIndex((c) => c.field === readings.value) : -1;
    if (at < 0 && amountAt < 0) return drawn;
    return drawn.map((r, n) => {
      const e = shown[n];
      if (!e) return r;
      const said = readings && at >= 0 ? valueSaid(e.fields, readings) : null;
      const way = amountAt >= 0 ? wayOf(decl, e.fields) : null;
      if (said === null && way === null) return r;
      return {
        ...r,
        cells: r.cells.map((c, i) => (i === at && said !== null ? said : i === amountAt && typeof c === 'string' ? signedSaid(c, way) : c)),
      };
    });
  });

  /**
   * WHAT A READER CAN ORDER THE LIST BY. What each direction is called is `wayOf` (`parts/list.ts`).
   *
   * THE SELECTION BOX IS NOT A FIELD and orders nothing, so it is not in the list. It offered
   * "Select" as a sort key for exactly as long as it took to look.
   *
   * BY NAME AND NOT BY INDEX. This was `columns.slice(1)`, which is the picker's position rather
   * than the picker, and the picker is drawn only once the list is long enough to act on in bulk:
   * below that, `slice(1)` silently dropped the spoken id from the sort list instead.
   */
  /* `act` IS A COLUMN OF CONTROLS, NOT OF VALUES, and Display on a phone offered to sort by it:
     "Sorted by" listed seven options and the last was `What you can do here`, which is the label of
     the row-actions column. There is nothing in it to put in an order. */
  const sortable = $derived(columns.filter((c) => c.field !== 'act' && c.field !== 'select'));

  /** A header pressed, or a row of Display's "Sorted by": the same toggle, into the same parameter. */
  const sortBy = (field: string) => setParam((p) => p.set('sort', nextSort(sort, field)));

  /** Display's way back to the register's own order, which Clear filters also gave at the cost of every chip. */
  const unsort = () => setParam((p) => p.delete('sort'));

  /**
   * Archive one row: no dialog, and the row does not move.
   *
   * THE TOAST IS NOT THE RECEIPT. It was, and a toast is at the wrong end of the screen from the
   * thing it is about, gone in ten seconds, and stacked three deep after three archives. The chip
   * is ON THE ROW, next to what the row says, for as long as the reader is looking at this answer.
   * The toast stays for the archive done from the keyboard with the row off screen.
   */
  function archive(seq: number) {
    void archiveOnRecord([seq], `“${nameOf(seq)}”`);
  }

  /**
   * Keep a row to its maker, or share it again, from the row's menu. The record refuses anybody but the maker (the same
   * write the row's own page sends), so a refusal is said and the row is left as it was; a good answer flips its mark here.
   */
  async function setRowPrivate(seq: number, on: boolean) {
    const out = await keepPrivate(apiBase(), `${id}#${seq}`, on);
    if (!out.ok) {
      toasts.push(out.fix, { intent: 'warn' });
      return;
    }
    pages = withPrivate(pages, seq, on);
  }

  /* ── capture: one line, first on the page, with no decisions attached ────── */

  /**
   * ADD A ROW BY TYPING ITS NAME AND PRESSING ENTER.
   *
   * THE ONLY WAY IN WAS A MODAL ASKING FOR EVERY DECLARED FIELD, up front. In the record this
   * product is modelled on, twenty-five of eighty-five writes over thirteen days were adds, and the
   * add used to be the fifth thing down the page at roughly y=1400 of a 3416px document. Moving it
   * to one line at the top, with the submit control inside the field and only present once there is
   * something to add, is the change that made those twenty-five cheap.
   *
   * WHAT IT DOES NOT ASK. Everything the filter already says. Looking at `?f=state:is:open` means
   * the answer to "what state" is on screen, and asking again is asking a person to repeat
   * themselves to a machine that heard them. Everything else is left unset for an agent or a person
   * to fill in later, which is what a record with a shape is for.
   */
  let capture = $state('');
  /* THE PHONE'S CAPTURE SHEET, which the head's "+" opens (`parts/CapturePlus.svelte`) and `CaptureLine` draws below 640px. */
  let captureOpen = $state(false);
  /* AND A LINK CAN ASK FOR IT, `/r/people?add=1` (AG9): a page's "Add a person" opens the name line, not every field. */
  $effect(() => {
    if (page.url.searchParams.get('add') !== '1' || !adds) return;
    captureOpen = true;
    untrack(() => {
      const next = new URLSearchParams(page.url.searchParams);
      next.delete('add');
      void goto(next.size ? `?${next}` : page.url.pathname, { replaceState: true, noScroll: true, keepFocus: true });
    });
  });

  /* ── writes ───────────────────────────────────────────────────────────────── */

  /**
   * EVERY GESTURE BELOW WRITES. On the sample each said `notWritten` instead, and the sample is gone,
   * so there is one path and it is the record's.
   *
   * THE ROW THE RECORD HANDS BACK IS DRAWN WHERE THE OLD ONE WAS. A changed row that jumped to where
   * its new state sorts is the row the reader has to go and find again; a new row goes at the top.
   * An answer for a question the screen has left is not drawn, and a refusal is still said.
   */
  let writer: RowWriter | null = null;
  const writes = (): RowWriter => (writer ??= rowWriter(apiBase()));
  /** The sheet's add is out, so a second press does not send a second row. */
  let writing = $state(false);
  let addRefused = $state<{ fix: string; at?: string | undefined } | null>(null);

  /* A ROW WRITE'S ANSWER AS THE OPTIMISTIC LAYER READS IT. A conflict draws the row as it now stands first, so the
     retry is against the latest version, as `missed` does; the layer says the sentence. */
  const sent = (was: string, out: Wrote): Sent<Entry> => {
    if (out.ok) return { ok: true, value: out.entry };
    if (asked === was && out.why === 'conflict' && out.entry) landRow(out.entry);
    return { ok: false, fix: out.fix };
  };

  /** A row's name in a receipt: its title as the list says it, and "this one" where it has none. Never its id. */
  const nameOf = (seq: number): string => {
    const e = rowAt(seq);
    return e ? titleSaid(e) : copy.thisRow;
  };

  function landRow(entry: Entry) {
    pages = pages.map((p) => p.map((e) => (e.seq === entry.seq ? entry : e)));
  }

  /**
   * THE NEW ROW, AT THE TOP, WEARING A MARK, AND ON THE SCREEN.
   *
   * CLOSING THE LOOP IS THREE THINGS AND THE LINE DID ONE. A row was appended to the answer and the reader was left
   * to find it: on a filtered list, or one scrolled down, the only evidence that the most common write in the
   * product had worked was a count changing somewhere above the fold. The mark says which row is new, the receipt
   * says what happened to it, and the scroll happens ONLY when the row is not already in front of them.
   *
   * THE CHIP SAYS "Added" AND NO MORE (VERIFY H23): what the line filled in is in the row's own cells, where it can be
   * changed, and "Added, with which way Money out, amount £0 ... filled in" read like a form dump.
   */
  function addLanded(entry: Entry, mark?: string) {
    /* THE POLL MAY HAVE BROUGHT IT ALREADY. The record commits before this tab hears back, so a re-ask landing in that
       gap draws the row, and prepending it again would draw it twice and count it twice. */
    const already = pages.some((p) => p.some((e) => e.seq === entry.seq));
    pages = [[entry, ...(pages[0] ?? []).filter((e) => e.seq !== entry.seq)], ...pages.slice(1).map((p) => p.filter((e) => e.seq !== entry.seq))];
    if (!already) matched += 1;
    if (booted && !already) booted = { ...booted, registers: booted.registers.map((r) => (r.id === id ? { ...r, count: r.count + 1 } : r)) };
    receipt(entry.seq, {
      mark: mark ?? copy.writeMarkAdded,
      short: copy.writeMarkAdded,
      intent: 'good',
      undo: takeBack(entry),
    });
    fresh = new Map(fresh).set(entry.seq, Date.now());
    added = new Set(added).add(entry.seq);
    void showRow(entry.seq);
  }

  /**
   * THE WAY BACK FROM A NEW ROW IS AN ARCHIVE, through the path the row's own Archive takes.
   *
   * NOT A DELETE, because the record has none: an added row that is put back is a row with `deleted_at` set, which
   * every list leaves out and `restore` brings back. `archiveOnRecord` holds the row where it is, swaps this chip for
   * `Archived` and its own `Put back`, and says so in a toast, so a row added by mistake is one press from gone and
   * one more from here again. Before this, the only way to take back a typed row was to find Archive in its menu.
   */
  const takeBack = (entry: Entry) => () => void archiveOnRecord([entry.seq], `“${nameOf(entry.seq)}”`, madeFor.get(entry.seq));
  /* THE PERSON AN ORDER MADE GOES AND COMES BACK WITH IT (RN5): "20 candles for Salma by Friday" makes Salma in the
     same write as the order, and its Undo and Put back take her too, unless something else now links to her (RO9). By
     the order's number, for this tab's life. */
  const madeFor = new Map<number, { register: string; seq: number }>();

  /**
   * BRING THE ROW INTO VIEW, AND ONLY IF IT IS NOT ALREADY THERE.
   *
   * AN UNCONDITIONAL `scrollIntoView` MOVES THE PAGE UNDER SOMEBODY WHO CAN ALREADY SEE THE ROW, which is the
   * gesture every list that does it is disliked for: the reader typed one line, the row appeared where they were
   * looking, and the screen jumped anyway. `block: 'nearest'` does nothing when the element is inside the
   * scroller, so the test is whether it is inside `#main`'s box at all.
   *
   * THE ROW IS FOUND BY ITS OWN MARK rather than by an index into the body, because the two bodies number their
   * rows differently and the mark is on whichever one is drawn.
   */
  async function showRow(seq: number) {
    await tick();
    const el = body?.querySelector(`[data-fresh="${seq}"]`)?.closest('.tr, .card-line, .bcard');
    const scroller = body?.closest('#main');
    if (!el || !scroller) return;
    const row = el.getBoundingClientRect();
    const box = scroller.getBoundingClientRect();
    if (row.top >= box.top && row.bottom <= box.bottom) return;
    el.scrollIntoView({ block: 'nearest' });
  }

  /** A write that did not land: the row as it now stands, when there is one, and the record's sentence. */
  function missed(was: string, out: Exclude<Wrote, { ok: true }>) {
    if (asked === was && out.why === 'conflict' && out.entry) landRow(out.entry);
    toasts.push(out.fix, { intent: 'warn' });
  }

  function setPatch(seq: number, field: string, value: Fields[string]) {
    edits = new Map(edits).set(seq, { ...(edits.get(seq) ?? {}), [field]: value });
  }

  function dropPatch(seq: number, field: string) {
    const next = new Map(edits);
    const left = { ...(next.get(seq) ?? {}) };
    delete left[field];
    if (Object.keys(left).length === 0) next.delete(seq);
    else next.set(seq, left);
    edits = next;
  }

  function addTypedRow() {
    if (problems.length > 0 || !decl) return;
    /* THE SHEET STAYS OPEN UNTIL THE RECORD HAS THE ROW, so a refusal leaves everything typed where it was. */
    if (writing) return;
    writing = true;
    const was = asked;
    addRefused = null;
    void writes()
      .create(id, taken)
      .then((out) => {
        writing = false;
        if (!out.ok && out.why === 'refused') {
          addRefused = out;
          return;
        }
        if (!out.ok) return missed(was, out);
        if (asked === was) addLanded(out.entry);
        closeCreate();
      });
  }

  /* SOMEBODY ADDED BY A NAME A PERSON HERE ANSWERS TO IS ASKED ABOUT FIRST (AM18): "Is this Salma, the client already
     here?", with the same person and someone new to press. The line stays as typed until one is. */
  let twin = $state<(Twin & { said: string; asked: string }) | null>(null);
  /* A line typed again since is a new line, and the question goes with the old one. */
  $effect(() => {
    if (twin && capture.trim() !== twin.said) twin = null;
  });

  function twinOf(said: string): (Twin & { said: string; asked: string }) | null {
    if (captureNamed !== 'person' || !decl?.title) return null;
    const title = decl.title;
    const people = result.entries.flatMap((e) => (typeof e.fields[title] === 'string' && !e.fields.merged_into ? [{ seq: e.seq, name: String(e.fields[title]) }] : []));
    const found = samePerson(said, people);
    if (!found) return null;
    const role = result.entries.find((e) => e.seq === found.seq)?.fields.role;
    return { ...found, said, asked: sameAsked(found.name, typeof role === 'string' && role !== '' ? saidInLine('role', role) : null) };
  }

  /** The same person: their fuller name kept where the line said more, and nothing added. */
  function twinSame() {
    const t = twin;
    twin = null;
    if (!t || !decl?.title) return;
    capture = '';
    if (t.longer) setRowValue(t.seq, decl.title, t.said, t.said);
    else toasts.push(`${t.name} is already here.`);
  }

  /** Someone new: added as the line said. */
  function twinNew() {
    const t = twin;
    twin = null;
    if (t) captureRow(t.said);
  }

  function captureRow(asNew?: string) {
    const said = (asNew ?? capture).trim();
    if (!said) return;
    if (!decl?.title) return;
    if (asNew === undefined) {
      const asked = twinOf(said);
      if (asked) {
        twin = asked;
        captureFault = null;
        return;
      }
    }
    twin = null;
    /* THE LINE EMPTIES AT ONCE, and what was typed goes back into it if the record says no. */
    /* A FIGURE AND NO CURRENCY ANYBODY CHOSE: asked in the sheet, and nothing is sent (AH5). */
    const bare = lineFigures(id, said, now).bare;
    if (bare !== undefined) {
      captureFault = whichCurrency(bare);
      return;
    }
    capture = '';
    captureFault = null;
    void createRow(said, (back, fix) => {
      /* WHAT WAS TYPED GOES BACK IN THE BOX, and only if nothing else has been typed since. Overwriting a
         second line somebody has already started would lose the newer one to report the older. */
      if (capture === '') capture = back;
      /* AND WHY IS SAID IN THE SHEET, under the field (AH5): at 390 the toast sat behind the sheet, and Add looked dead. */
      captureFault = fix;
    });
  }

  /**
   * ONE TYPED LINE, WRITTEN AS A ROW THE RECORD WILL TAKE.
   *
   * THE INFERENCE IS `capturedFields` AND IT IS NOT HERE. What the address already answers and what the
   * declaration still requires are the piece of this screen that can write a WRONG value rather than an ugly one,
   * so it lives in a module with tests rather than in a component nothing can reach.
   *
   * A REFUSAL PUTS THE TYPING BACK. The record's own sentence says what it wanted, and the words are in the box
   * again rather than gone — which is the difference between a control that failed and a control that ate
   * something. `onBack` is the caller's, because the capture line and the example button put it in different
   * places.
   */
  async function createRow(said: string, onBack: (back: string, fix: string) => void, mark?: string): Promise<Entry | null> {
    const was = asked;
    /* UNDER "or" NO CHIP IS SOMETHING EVERY ENTRY HERE HOLDS, so none of them is written onto a new one. */
    /* THE AMOUNT AND DAY THE LINE CARRIES ARE READ OFF IT FIRST (audit 31 Oct h, AH5): "Electricity bill 850 due 5 Nov"
       was a bill called the whole line, refused for its amount. The words left are the title. */
    /* AN ORDER IS READ AS TELL READS ONE (AM11): "20 candles for Salma by Friday" is candles, 20 of them, for Salma, by
       Friday, where the box made one called the whole line with only a day. Somebody new it is for is made first. */
    const order = decl ? orderFor(said, id, recordToday(now)) : null;
    const figures = order && decl?.title && typeof order.fields[decl.title] === 'string' ? { text: String(order.fields[decl.title]), fields: order.fields as Fields } : lineFigures(id, said, now);
    const captured = capturedFields(id, figures.text, either ? [] : filters, now, result.entries);
    const fields: Fields = { ...captured.fields, ...figures.fields };
    /* SOMEBODY NEW THE ORDER IS FOR GOES WITH IT, IN ONE WRITE (RN5): the person and the order land together or not at
       all, under the one batch Tell's box writes a person and a row in. Their name is on this screen once it lands (AN18). */
    const person = newFor(order);
    /* THE ROW IS ON THE LIST BEFORE IT IS SENT, at the head, wearing `Saving`, and the record's row takes its place. */
    const seq = -++typedSeq;
    /* A LINK SAID AS `people#4` IS DRAWN AS THE ROW IT NAMES, by its number, as every row on the list holds one. */
    const shown: Fields = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, typeof v === 'string' && /^[a-z_]+#\d+$/u.test(v) ? Number(v.split('#')[1]) : v]));
    const line = typedRows.add({ seq, fields: shown, version: 0, created: new Date(now).toISOString(), by: '' });
    receipt(seq, { mark: copy.writeMarkSaving, intent: 'warn' });
    const unline = () => {
      typedRows.drop(line);
      if (asked === was) clearReceipt(seq);
    };
    const { out, made: madePerson } = await orderWrite(writes(), id, fields, person);
    if (madePerson && madePerson.name !== '') named = joinNames(named, new Map([[`${madePerson.register}#${madePerson.seq}`, madePerson.name]]));
    /* THE TYPED LINE AND THE RECORD'S ROW ARE ONE ROW: the swap is drawn where it stands, with neither leaving nor arriving. */
    if (out.ok && asked === was) swapInPlace();
    unline();
    if (!out.ok) {
      /* A refused order made nobody: the one write took neither. */
      missed(was, out);
      onBack(said, out.fix);
      return null;
    }
    if (madePerson) madeFor.set(out.entry.seq, { register: madePerson.register, seq: madePerson.seq });
    if (asked !== was) return null;
    /* THE PERSON IT IS FOR IS HELD BY NUMBER on the landed row (`orderWrite`), so its Who is their name. */
    const entry = out.entry;
    addLanded(entry, mark);
    /* AND WHAT WAS ADDED IS SAID ONCE, BY NAME (motion F12, F20, VERIFY H23): "Added “Motion test bill” to Bills and
       invoices." The fields it filled in are each in their own cell on the row, so they are not read out here. The
       row's chip carries Put back, so the toast offers no second Undo; ⌘Z still takes it back. */
    if (decl) toasts.push(copy.captureAdded(titleSaid(entry), listWord(id, decl.name)), { undo: takeBack(entry), offer: false });
    return entry;
  }

  /**
   * Move one row's state, from the row.
   *
   * IT TOOK THREE PRESSES AND A BULK BAR. The only way to change one row's state was to select it,
   * reach the bar that appears when something is selected, and use the menu there. The state is the
   * verb a person reaches for most on a list of obligations, and it was the one the row menu did
   * not carry.
   *
   * THE RECEIPT IS THE ANSWER: the chip is on the row, beside what the row says, reads `Saving` while
   * the write is out and the state it landed on after, with the way back on it.
   */
  function setRowState(seq: number, state: string) {
    const said = saidInLine(decl?.state ?? '', state);
    if (decl?.state) setRowValue(seq, decl.state, state, said);
  }

  /**
   * A CARD DROPPED IN A LANE OF A BOARD LAID OUT BY ANOTHER CHOICE FIELD (Display's "Lanes by"): the same move, the same
   * receipt and the same way back, on that field.
   */
  function moveOnBoard(seq: number, value: string, field?: string) {
    if (!field || field === decl?.state) setRowState(seq, value);
    else setRowValue(seq, field, value, saidInLine(field, value));
  }

  function setRowValue(seq: number, field: string, state: string, said: string) {
    const was = asked;
    const list = id;
    const before = rowAt(seq);
    const patch = { [field]: state };
    const name = nameOf(seq);
    /* THE ROW SHOWS ITS NEW STATE THE MOMENT IT IS CHOSEN (`lib/data/optimistic.ts`), wearing `Saving` until the record
       answers; a refusal puts the state it had back and says why. The receipt on the row keeps its Put back, and the
       toast offers the same way back for six seconds for the reader whose eye has left the row. */
    void run<Entry>({
      apply: () => {
        hold(seq);
        setPatch(seq, field, state);
        receipt(seq, { mark: copy.writeMarkSaving, intent: 'warn' });
      },
      revert: () => {
        if (asked !== was) return;
        dropPatch(seq, field);
        clearReceipt(seq);
      },
      send: () => writes().update(list, seq, patch, before?.version).then((out) => sent(was, out)),
      settle: (entry) => {
        if (asked !== was) return;
        dropPatch(seq, field);
        landRow(entry);
        receipt(seq, { mark: said, intent: 'good', undo: putBackOf(before, patch, entry) });
      },
      said: writeWords.state(name, said),
      undo: (entry) => (before ? () => void putBack([{ before, patch, answered: entry }], list) : null),
    });
  }

  /* ── editing a value where it is drawn ───────────────────────────────────── */

  /**
   * CHANGING A VALUE YOU ARE LOOKING AT COST A FULL ROUTE CHANGE.
   *
   * The path was measured: click a cell, land on a read-only detail page, press *Edit
   * the row*, get a toast. In-place editing was advertised on the `?` sheet as `e`, was reachable
   * only from the keyboard, was announced nowhere on screen, and answered the press with a sentence
   * saying what it would have done. It is eighth of the ten things that cost a person the most,
   * and it is the one a person does most often after reading.
   *
   * THE CELL IS THE EDITOR. Not a drawer over the list, not a form on another screen: the value is
   * already drawn in a box of exactly the right width, and the cheapest possible edit is that box
   * becoming writable where it sits. Enter commits, Escape cancels, and the caret is put in it.
   *
   * EVERY TYPE BUT `secret` AND `file`, WHICH IS WHAT THE ROW PAGE EDITS. This said four types and argued that a money
   * and a ref were two decisions each, so a cell that took one of them would write half a value. The row page had
   * already answered both: a money box is the amount alone and goes back in the currency the row held, and a ref is
   * typed as the number a person says. Its three closures could not be called from here, so the grid refused twelve
   * types for a problem solved one screen away. They are `field-draft.ts` now, and a cell save goes through the same
   * three, so a money cell refuses a third decimal on EGP where it was typed, exactly as the row page does. A quantity
   * opens as its number and its unit and structured data written out (`draftOf`), and the same `wrongValue` refuses
   * what does not read before any write.
   *
   * WHICH IS WHICH IS DRAWN AND NOT EXPLAINED. The pencil appears on an editable cell and on no
   * other, so the answer is in front of the reader at the moment they are looking at that cell. A
   * sentence under the grid listing type names would be a legend about a mechanism, read once
   * and never again, for a question the cell can answer itself.
   */

  let editing = $state<{ seq: number; field: string } | null>(null);
  let editValue = $state('');
  /* A YES OR NO IS TICKED, NOT TYPED: the cell's toggle holds this, and a box holding the word `true` would be a
     second spelling of a value the record keeps as a boolean. */
  let editTicked = $state(false);

  /**
   * ESCAPE HAPPENED, SO THE BLUR THAT FOLLOWS IT IS NOT A COMMIT.
   *
   * It is a plain `let` and not `$state`, deliberately: nothing draws it, it is written and read inside one pair
   * of events, and a reactive read would be a dependency on a value that is always false by the time anything
   * could look at it. `commitEdit` puts it down as it reads it.
   */
  let cancelled = false;



  const fieldOf = (field: string) => decl?.fields.find((f) => f.id === field);
  /**
   * A declared value inside a sentence or a state menu: the label the field carries, else the value in lower case, which
   * is what `display` says for a saved row's.
   *
   * THESE SITES SPELT THE STORED VALUE AND READ NO LABEL, so a household's row menu on Things offered "Set to building"
   * where the list's own rows read Active (Personal's label for `things.lane.building`), and a saved view's title named a value the list never shows (`ui/enum-label-sites.test.ts`). It is
   * lower case where there is no label because these are the words inside "Set to …" and "rows set to …"; a pill, a
   * segment or an option says its value alone and draws through `valueSaid`. A title with a label in it still reads
   * back: `where.ts` `declaredValue` takes a value by its label.
   */
  const saidInLine = (field: string, value: string): string => fieldOf(field)?.labels?.[value] ?? value.replace(/_/g, ' ');
  /* AND ONLY FOR SOMEBODY WHO MAY CHANGE THE LIST, so a Reads colleague is drawn no pencil. */
  const editableHere = (field: string) => {
    const f = fieldOf(field);
    return changes && f !== undefined && editable(f, id);
  };
  /* THE CURRENCY A MONEY CELL IS TYPED IN WHEN ITS ROW SAYS NONE, the fallback the row page passes too. */
  const listCurrency = (field: string): string | null => currencyFor(id, field);

  /** Why a cell is not the editor, in the reader's words rather than as a type name. */
  const notEditableBecause = (field: string): string =>
    runFact(fieldOf(field), id) ? runFactWhy : (copy.cellWhy[fieldOf(field)?.type ?? ''] ?? copy.cellWhyElse);

  /**
   * THE VALUE THE READER IS LOOKING AT, which is not always the value the record holds.
   *
   * The grid draws the record's rows with `edits` patched over the top while a write is out, and the
   * editor read `entry()` alone. A SECOND EDIT OF THE SAME CELL OPENED ON THE ORIGINAL: change a title,
   * press `e` on it again, and the box held what the record still said rather than what the row on
   * screen said. Anybody who then pressed Enter without retyping had quietly reverted their own change.
   */
  const shownValue = (seq: number, field: string): unknown => {
    const patch = edits.get(seq);
    if (patch && Object.hasOwn(patch, field)) return patch[field];
    return rowAt(seq)?.fields[field];
  };

  function openEditor(seq: number, field: string) {
    /* `e` STILL ANSWERS A READS COLLEAGUE, with why the list will not change for them rather than a reason about the
       field's type, which would be true of the field and not the reason. */
    if (!changes) {
      readOnlySaid();
      return;
    }
    if (!editableHere(field)) {
      /* A BOUND KEY DOES NOT ANSWER WITH SILENCE. `19 §4`'s sheet advertises `e` for the grid with
         no condition on it, and when this refused money and refs the press did nothing, drew nothing
         and reported nothing, on the two types where a person was most likely to try. A file and a
         secret are refused now, on this screen and the row's alike, and the sentence says why without
         sending the reader to the row, which would refuse them too. */
      const f = fieldOf(field);
      /* AND A COLUMN THAT IS NOT A FIELD STILL ANSWERS. The picker and the row's verbs carry no
         declaration, so `fieldOf` is undefined for them and this returned in silence: a printed key
         doing nothing, which is the drift `19 §4` exists to prevent. It became reachable the day
         clicking a cell started moving the caret to that cell. */
      toasts.push(f ? copy.cellNotEdited(labelOf(f), notEditableBecause(field)) : copy.cellNoValue, { intent: 'warn' });
      return;
    }
    /* THE BOX OPENS ON WHAT THE ROW PAGE'S BOX WOULD HOLD: a money in major units rather than `[object Object]`,
       which is what `String` made of it, and a list as its tags with commas. */
    const f = fieldOf(field)!;
    const shown = shownValue(seq, field);
    editing = { seq, field };
    editValue = draftOf(f, shown, listCurrency(field));
    editTicked = shown === true;
    /* THE CARET GOES INTO THE BOX. `autofocus` on an element drawn into a cell that already holds focus did not take, so
       F2 opened a box the keyboard was still outside of; the cell hands it on once the box is drawn. */
    void tick().then(() => {
      const cell = document.activeElement instanceof HTMLElement ? document.activeElement.closest('[role="gridcell"]') : null;
      const box = cell?.querySelector<HTMLElement>('input, select, textarea');
      if (box && !box.contains(document.activeElement)) box.focus();
    });
  }

  /**
   * FOCUS LEFT THE FIELD — AND THE EDITOR CLOSES ONLY IF IT LEFT THE ROW.
   *
   * `relatedTarget` IS WHERE FOCUS WENT, and it is the whole of the test. A row carries the cell being edited, the
   * pencil of every other editable cell, the picker and two or three verbs, and every one of them is inside the
   * thing the reader is working on: treating a move between them as "finished" is the editor closing under the
   * gesture that was reaching for it.
   *
   * A NULL `relatedTarget` IS A COMMIT, not an exception. Focus going nowhere at all — the window losing it, a
   * click on the page's own background — is a person who has stopped editing, and holding the cell open in that
   * state is a control the reader has walked away from and cannot see.
   */
  function leftTheRow(e: FocusEvent) {
    const to = e.relatedTarget;
    const row = (e.currentTarget as HTMLElement).closest('.tr, .card-line');
    if (row && to instanceof Node && row.contains(to)) return;
    commitEdit();
  }

  /**
   * The editor's keys. Escape cancels; Enter commits where Enter is not a new line, and ⌘Enter commits everywhere. EITHER
   * WAY THE KEYBOARD GOES BACK TO THE CELL (motion F5.3), so the arrows carry on from where the edit was rather than
   * from the top of the page, which is where focus lands when the element holding it leaves the document.
   */
  function cellKeys(e: KeyboardEvent, enterCommits: boolean) {
    e.stopPropagation();
    const cell = e.currentTarget instanceof HTMLElement ? e.currentTarget.closest<HTMLElement>('[role="gridcell"]') : null;
    const back = () => void tick().then(() => cell?.isConnected && cell.focus());
    if (e.key === 'Enter' && (enterCommits || e.metaKey || e.ctrlKey)) {
      commitEdit();
      back();
    } else if (e.key === 'Escape') {
      cancelEdit();
      back();
    }
  }

  /** Escape in a cell: the editor closes, and `cancelled` tells the blur that follows that it is not a commit. */
  function cancelEdit() {
    cancelled = true;
    editing = null;
  }

  function commitEdit() {
    const at = editing;
    if (!at) return;
    /**
     * ESCAPE CANCELS, AND THE BLUR THAT FOLLOWS IT MUST NOT COMMIT.
     *
     * THIS IS A BUG NO SCREENSHOT CAN HOLD. Closing the editor takes the element out of the document, which fires
     * `focusout` on the way — so a cancel and a commit arrive in that order, one gesture, and the value somebody
     * pressed Escape to throw away was written by the event that clearing it caused. The flag is read once and
     * put down, so it cancels exactly the blur its own Escape produced and never the next edit's.
     */
    if (cancelled) {
      cancelled = false;
      editing = null;
      return;
    }
    editing = null;
    const f = fieldOf(at.field);
    if (!f) return;
    const typed = f.type === 'bool' ? editTicked : editValue;
    const currency = listCurrency(at.field);
    const shown = shownValue(at.seq, at.field);
    /* NOTHING CHANGED IS NOT AN EDIT. A receipt for a value somebody looked at and left alone is a
       row wearing `Not saved` for no reason, and after three of those the chip stops being read. */
    if (unchanged(f, typed, shown, currency)) return;
    /* WHAT THE ROW PAGE REFUSES UNDER ITS BOX IS REFUSED HERE BEFORE ANY WRITE, and the typing goes back into the cell
       so it is corrected rather than typed again. `EGP 1.234` sent to the record would be rounded by `patchOf` into an
       amount nobody typed, which is worse than the record refusing it, and structured data that does not read would
       be stored as the text typed, which the record's `json` coercion takes as it comes. */
    const bad = wrongValue(f, String(typed), shown, currency);
    if (bad) {
      toasts.push(bad, { intent: 'warn' });
      editing = at;
      editValue = String(typed);
      return;
    }
    /* THE ROW PAGE'S PATCH: a money back with its currency, a list with the record's own tags kept, a toggle as a
       boolean. An emptied box is `null` here as it always was, so the cell draws nothing rather than an empty string. */
    const made = patchOf(f, typed, shown, currency)[at.field] ?? null;
    const value = made === '' ? null : made;

    /* THE CELL SHOWS WHAT WAS TYPED WHILE IT SAVES. A refused value goes back into the cell's editor, so
       it is corrected rather than typed again; a conflict draws the row as it now stands first, so the
       retry is against the latest version. The branch that held the value unsaved and toasted what it
       would have written was the sample's, and went with it. */
    const was = asked;
    const list = id;
    /* THE ROW AS THE RECORD HELD IT, read before the patch goes over it, since the patch is what `Put back` undoes. */
    const before = rowAt(at.seq);
    const patch = { [at.field]: value };
    const name = nameOf(at.seq);
    /* THROUGH THE OPTIMISTIC LAYER (`lib/data/optimistic.ts`): drawn now, and on a refusal the cell opens again on what
       was typed, so it is corrected rather than typed again. A landed edit offers its way back in a toast for six
       seconds as well as on the row. */
    void run<Entry>({
      apply: () => {
        hold(at.seq);
        setPatch(at.seq, at.field, value);
        receipt(at.seq, { mark: copy.writeMarkSaving, intent: 'warn' });
      },
      revert: () => {
        if (asked !== was) return;
        dropPatch(at.seq, at.field);
        clearReceipt(at.seq);
        if (editing === null) {
          editing = at;
          editValue = String(typed);
          editTicked = typed === true;
        }
      },
      send: () => writes().update(list, at.seq, patch, before?.version).then((out) => sent(was, out)),
      settle: (entry) => {
        if (asked !== was) return;
        dropPatch(at.seq, at.field);
        landRow(entry);
        receipt(at.seq, { mark: copy.writeMarkSaved, intent: 'good', undo: putBackOf(before, patch, entry) });
      },
      said: writeWords.edited(labelOf(f), name),
      undo: (entry) => (before ? () => void putBack([{ before, patch, answered: entry }], list) : null),
    });
  }

  const copyId = (seq: number) => clipboard.putSpoken(id, seq);

  /**
   * The LINK, not the id. `⇧Y` has been on the `?` sheet since the registry was written and was
   * bound nowhere: `e.key` for shift-Y is `'Y'`, so the `'y'` branch never saw it and the sheet was
   * advertising a key that did nothing. A cheat sheet is only a cheat sheet if it is true.
   *
   * Two outcomes, same as `copyId`, and the toast says which — the clipboard is absent over plain
   * HTTP and in a sandboxed frame.
   */
  const copyLink = (seq: number) => clipboard.putLink(id, seq);

  /* THE CARET STARTS ON THE FIRST CELL, which says what the row IS: nothing leads the title now that the picker is among
     the row's verbs. `columns` is the list on screen, and the effect below keeps the caret inside it. */
  let focus = $state({ row: 0, col: 0 });

  /* THE CARET IS KEPT INSIDE THE COLUMNS THERE ARE. Arrowing already clamps, and the starting
     column did not: a register with two columns and no picker put the caret past the end of every
     row, where `columns[focus.col]` is `undefined` and `e` and `Enter` both did nothing. It moves
     only when it has to, so a reader who has arrowed somewhere keeps their place. */
  $effect(() => {
    const last = columns.length - 1;
    if (focus.col > last) focus = { ...focus, col: Math.max(0, last) };
  });
  /**
   * THE OPEN ROW IS IN THE ADDRESS (`?row=7`), and the panel it opens in is the one every declared page opens
   * (`RowPanel`, through `listHost` in `lib/page/row-host.svelte.ts`): every field the list declares, saved in one
   * write with one Undo. The peek that stood here drew the fields and could change none.
   *
   * WHY THE ADDRESS. Copying it out of an open row sends a colleague the row being discussed and not the whole list,
   * and Back, the gesture every person uses to close a thing that opened over what they were reading, closes the panel
   * and stays on the list. The key is the row's number, which is the same under every sort and filter this list has;
   * `focus.row` is an index into whatever is on screen. A sort or a chip changes the address through `setParam`, which
   * starts from the address as it is, so the open row is carried along; a row the new answer no longer holds closes the
   * panel, and the host takes it out of the address.
   */
  const host = listHost({
    register: () => id,
    /* THE ROWS AS DRAWN: the order on screen, with what was edited here over them. */
    rows: () => result.entries,
    address: {
      read: () => page.url,
      /* OPENING AND CLOSING ARE STEPS BACK CAN UNDO; walking from one open row to the next is not one a step each. */
      write: (to) =>
        void goto(at(`${to.pathname}${to.search}${to.hash}`), {
          replaceState: page.url.searchParams.has('row') && to.searchParams.has('row'),
          noScroll: true,
          keepFocus: true,
        }),
    },
    base: () => apiBase(),
    now: () => now,
    reread: () => rereadRows(),
    toasts,
    may: (register) => may(shell, 'write', register),
    who: () => ({ me: shell.me?.person ?? null, names: new Map(Object.entries(shell.names ?? {})) }),
  });

  /* THE PANEL IS KEPT IN STEP WITH THE LIST AND THE ADDRESS (`sync`): a row that left the list closes it, a link or Back
     moves it, and a row the address names is opened once the list has read it.

     AND A PANEL THAT CLOSED ITSELF (its own close, Escape) IS CLOSED ON THE HOST TOO, which is what takes the row out of
     the address: the panel only sets its own open, and `?row=7` would otherwise outlive the panel it named. Closing a
     closed host writes nothing. */
  $effect(() => {
    void result.entries;
    void page.url.href;
    if (composed) return;
    const shut = host.opened === null;
    untrack(() => {
      if (shut) host.close();
      host.sync();
    });
  });

  /**
   * A WRITE FROM THE PANEL READS THE LIST'S ROWS AGAIN, in place (`recheck`), so the changed day shows at once. A list
   * walked past its first page is only marked stale by that, so there the rows the host holds newer are put where they
   * stand.
   */
  async function rereadRows() {
    await recheck();
    if (pages.length <= 1) return;
    for (const e of pages.flat()) {
      const got = host.host.entry({ register: id, seq: e.seq });
      if (got && got.version > e.version) landRow(got);
    }
  }

  /** Said when a key would move the panel off a row that holds something typed and not saved. */
  const UNSAVED = copy.rowUnsaved;

  /** Whether the panel holds something typed for another row than `seq`, said when it does: nothing typed is thrown away. */
  function keeps(seq: number): boolean {
    const typed = host.host.dirty && host.opened !== null && host.opened !== seq;
    if (typed) toasts.push(UNSAVED, { intent: 'warn' });
    return typed;
  }

  /** After `j` or `k` walked the open row: the list's own cursor goes with the panel, or the reader is told why not. */
  function walked(out: Walked) {
    if (out === 'unsaved') return void toasts.push(UNSAVED, { intent: 'warn' });
    const at = result.entries.findIndex((e) => e.seq === host.opened);
    if (out !== 'moved' || at < 0) return;
    focus = { ...focus, row: at };
    carry();
  }

  /** Only INDEXED fields are offered, in declaration order, at most eight (`filterableOf`). */
  const filterable = $derived(filterableOf(decl?.fields ?? []));
  /* The fields the bar filters by: every declared enum a reader can sift on. */
  const enums = $derived(filterable.filter((f) => f.type === 'enum'));
  /** The refusal to count, while there are pills on screen to miss their numbers. The bar's own test, as `ChipsBar` is handed it. */
  const unsaid = $derived(uncounted && enums.length > 0 && (siftable || q !== '' || filters.length > 0) ? uncounted : null);

  /**
   * HOW MANY ROWS HOLD EACH PILL'S VALUE, printed quietly beside its word.
   *
   * A facet count: the rows holding the value under every OTHER filter and the search, so a pill
   * says what it holds whether or not its own field is filtered yet. The record counts them, one
   * question a field, while the bar is on screen (`ask`, `countAll`). Edits made here are added on top
   * while they are out, because the list below draws them and the record has not answered yet.
   *
   * AN EDIT MOVES ITS ROW FROM ONE PILL TO ANOTHER, and only a row in hand can have been edited.
   * Every row in hand answers the whole question, so it answers the pill's question too, and moving
   * its count from the value the record holds to the one typed here is exact.
   */
  const facets = $derived.by(() => {
    const out = new Map<string, Map<string, number>>();
    const bump = (n: Map<string, number>, v: unknown, by: number) => {
      const key = String(v ?? '');
      n.set(key, (n.get(key) ?? 0) + by);
    };
    for (const [field, held] of counted) {
      const n = new Map(held);
      for (const e of pages.flat()) {
        const patch = edits.get(e.seq);
        if (!patch || !Object.hasOwn(patch, field)) continue;
        bump(n, e.fields[field], -1);
        bump(n, patch[field], 1);
      }
      out.set(field, n);
    }
    return out;
  });


  /**
   * WHETHER THIS LIST IS BIG ENOUGH TO NEED SIFTING THROUGH.
   *
   * `result.total` AND NOT `result.matched`, because the question is about the list and not about
   * what is on screen: filtering thirty-eight rows down to one must not remove the control that got
   * you there. The two differ exactly when somebody is already sifting.
   */

  /**
   * THE FIELDS THE BOX ACTUALLY MATCHES, READ FROM THE DECLARATION.
   *
   * This derived them from `filterable` — indexed, non-enum, non-numeric — which is a different set
   * from `search: true`, and after the box became the `matches` operator it was a set with almost
   * nothing in common. Measured on the shipped seed, the note under the box read *"Party and Project
   * are matched by the search box"* on `obligations`, where the only searchable field is `what`, and
   * *"Project and Track"* on `tasks`, where it is also `what` alone. Typing a project name found
   * nothing under a sentence promising it would.
   *
   * A sentence explaining the interface is against the house rule to begin with; one that explains
   * it wrongly teaches somebody the product is smaller than it is — which is the argument its own
   * sibling was deleted for.
   */
  const searched = $derived(searchable(id).map(labelOf));

  function setParam(mutate: (p: URLSearchParams) => void) {
    const next = new URLSearchParams(page.url.searchParams);
    mutate(next);
    goto(`?${next}`, { replaceState: false, noScroll: true, keepFocus: true });
  }

  /**
   * TYPING IS NOT NAVIGATING, and this box was pushing a history entry per keystroke.
   *
   * `19 §5` says it in as many words: *"`pushState` for discrete intent so Back undoes a filter,
   * **throttled `replaceState` for typing**"*. Pressing a chip is intent — you decided to narrow
   * the list and Back should undo that decision. Typing `overdue` is one decision spelled over seven
   * keystrokes, and it left seven entries, so Back became a character-by-character rewind of
   * something nobody thinks of as navigation.
   *
   * THE THROTTLE ALSO PAYS FOR ITSELF ON THE OTHER SIDE. Every keystroke re-ran `applyFilters`,
   * which formatted every field of every row through `display()`; at five thousand rows that was
   * seven full scans for one word. The scan is the register's declared `search:` fields now
   * (`find.ts`) — one or two per row instead of every one — which is both the faster answer and the
   * one `34 §6` says the box gives.
   *
   * AND THE TIMER IS CANCELLED WHEN THE PAGE GOES. It was not, so a `goto` fired 150 ms after you
   * had already clicked away, on whatever route you had arrived at: typing `rent` and clicking a nav
   * link inside the throttle landed you on **`/inbox?q=rent`**, and clicking on from there gave
   * `/r/services?q=rent` — a list filtered by a word typed into a different one, showing its empty
   * state. A pending write to a URL is only ever about the page that scheduled it.
   */
  let typing: ReturnType<typeof setTimeout> | undefined;
  onDestroy(() => clearTimeout(typing));

  function setQuery(value: string) {
    clearTimeout(typing);
    typing = setTimeout(() => {
      const next = new URLSearchParams(page.url.searchParams);
      if (value) next.set('q', value);
      else next.delete('q');
      goto(`?${next}`, { replaceState: true, noScroll: true, keepFocus: true });
    }, 150);
  }

  /** Whether a pill is on, read as the field declares it and by its operator (`chipOn`). */
  const isOn = (field: string, value: string): boolean => chipOn(id, filters, field, value);

  /** A pill pressed, as a history entry, keeping the filter's operator (`toggleChip`). */
  const toggleFilter = (field: string, value: string) => setParam((p) => toggleChip(p, filters, field, value));

  /**
   * A LIST CLAUSE, WHICH THE PILLS CANNOT DRAW AND THE BAR THEREFORE DREW NOTHING FOR AT ALL.
   *
   * Every control in the bar comes from a field's `values ?? []`, and `isOn` answers a question
   * about an enum's declared set. A list has no declared set: `things.repos` holds whatever
   * repositories that thing has, so there is no row of pills to light and never will be. Arriving
   * at `?f=repos:has:portage` therefore narrowed four rows to one with nothing above the grid
   * saying so, and the bar's own rule, written on `data-on`, is that which filters are on is the
   * whole of what the grid underneath is showing.
   *
   * CLEAR FILTERS WAS DRAWN AND IT IS NOT A WAY OFF THIS ONE CLAUSE. It keys off `filters.length`,
   * so it was there; it is a link to `/r/<register>`, so pressing it drops the search box and every
   * other chip along with the clause somebody meant. An earlier draft of this comment said there
   * was no way back but the address bar, which was wrong: there was a way back to the whole
   * register, and none to this list without this one narrowing.
   *
   * AND THIS IS THE LIST HALF ONLY. A `before` or `after` chip has no pill either, and
   * `registerHref` in `where.ts` mints `due:before:today` for the money tiles, so arriving from one
   * still narrows the grid with nothing above it naming the narrowing. Held to `list` here because
   * a date clause wants a date control rather than a word with a cross on it.
   *
   * THE CLAUSE ITSELF IS THE CONTROL, because it is the only honest one: its field's name, the
   * operator, and the element it is looking for. Pressing it takes it off, which is what
   * `aria-pressed` on every segment in the bar already promises. `listedOf` keeps each clause's
   * place in the address, so taking one off is exact.
   */

  /**
   * THE QUICK SLICES OVER THE ROWS (money F7), with their counts: from the rows in hand while they are the whole list
   * and nothing narrows it, which is exact and live; otherwise the record's own count of each slice, asked once a list.
   */
  const quickPlain = $derived(quickOf(decl, standing, now, whole && !narrowed && q === '' && !arriving));
  let quickCounts = $state<{ list: string; n: Partial<Record<Quick['key'], number>> } | null>(null);
  $effect(() => {
    const counted = quickPlain.every((x) => x.count !== null);
    if (quickPlain.length === 0) return;
    const list = id;
    if (counted) {
      quickCounts = { list, n: Object.fromEntries(quickPlain.map((x) => [x.key, x.count!])) };
      return;
    }
    if (untrack(() => quickCounts?.list) === list) return;
    const slices = quickPlain;
    void open().then(async (src) => {
      const n: Partial<Record<Quick['key'], number>> = {};
      for (const x of slices) {
        const got = await src.count(list, { filters: chipsOf(new URLSearchParams(x.chips.map((c) => ['f', c]))), q: '' });
        if (got.ok) n[x.key] = got.value;
      }
      if (list === id) quickCounts = { list, n };
    });
  });
  const quick = $derived(quickPlain.map((x) => ({ ...x, count: x.count ?? (quickCounts?.list === id ? (quickCounts.n[x.key] ?? null) : null) })));
  const quickAt = $derived(quickOn(quick, filters, decl));
  const setQuick = (key: Quick['key']) => setParam((p) => setQuickIn(p, quick, key, decl ?? undefined));

  /**
   * EACH FILTER THAT IS ON, AS THE RECTANGLE THAT TAKES IT OFF: its field's name, how it compares and what, in the list's
   * own words. The quick slice's own chips are its segment, and are not drawn twice.
   */
  const chipRects = $derived.by(() => {
    const own = new Set(quickAt && quickAt !== 'all' ? (quick.find((x) => x.key === quickAt)?.chips ?? []) : []);
    return filters
      .map((f, at) => ({ f, at }))
      .filter(({ f }) => !own.has(chipText(f)))
      .map(({ f, at }) => {
        const field = decl?.fields.find((d) => d.id === f.field);
        return { at, said: copy.filterClause(field ? labelOf(field) : f.field, f.values.map((v) => saidInLine(f.field, v)), f.op) };
      });
  });

  const dropFilter = (at: number) => setParam((p) => dropChip(p, at));

  /**
   * THE KEYBOARD'S FOCUS GOES WITH THE CARET. `j` and `k` moved the caret line and left focus on the cell it came
   * from, where an arrow moved both: the next Tab left from a row the reader was no longer on, and a screen reader
   * heard nothing. Only from inside the grid, so a key pressed with focus elsewhere does not pull it in.
   */
  function carry() {
    const grid = document.activeElement?.closest('[role="grid"]');
    const cell = grid?.querySelector(`.tr[aria-rowindex="${focus.row + 2}"]`)?.children[focus.col];
    if (cell instanceof HTMLElement) cell.focus();
  }

  /**
   * `s`: SEND WHAT IS PICKED, ELSE THE ROW OPEN BESIDE THE LIST, ELSE THE ROW THE CURSOR IS ON (`$lib/send`). The sheet
   * hangs from the open row's own send button, or from the row in the list.
   */
  function sendRows(): boolean {
    if (!decl) return false;
    const seqs = selected.size > 0 ? [...selected] : [host.opened ?? result.entries[focus.row]?.seq].filter((s): s is number => typeof s === 'number');
    const rows = seqs.flatMap((seq) => result.entries.find((e) => e.seq === seq) ?? []);
    if (rows.length === 0) return false;
    const first = rows[0]!.seq;
    const anchor =
      host.opened !== null && selected.size === 0
        ? document.querySelector('dialog.dock[open] .sb')
        : (document.querySelector(`[data-row-seq="${first}"]`) ?? document.querySelectorAll('.rowgroup .tr')[focus.row] ?? null);
    void openSheet({ kind: id, attach: rows.map((e) => ({ ref: `${id}#${e.seq}`, label: titleSaid(e) })), anchor });
    return true;
  }

  function onkeydown(e: KeyboardEvent) {
    if (composed) return;
    /* AND NOT WHILE SOMETHING IS OPEN OVER THE PAGE. See `covered`: this handler is one of six on
       the routes under the shell, and none of them read the overlay depth, so a sheet made of
       buttons left the page behind it holding its own keyboard.

       BUT `j` AND `k` STILL WALK WHILE THE ONLY THING OPEN IS THIS LIST'S OWN PANEL AS A SHEET, which it is below
       1,280: walking the open row is what the two keys are for, and a field being typed in still stops them below. */
    if (covered() && !(host.opened !== null && overlays.depth === 1 && ['j', 'k'].includes(e.key))) return;
    /* THE ONE TEST FOR WHETHER SOMEBODY IS TYPING, rather than a narrower copy of it. This read
       INPUT and TEXTAREA only, so a bare key fired over an open select and inside a contenteditable
       block, both of which `keys.svelte.ts` has always covered.

       IMPORTED UNDER A SECOND NAME BECAUSE THIS FILE ALREADY HAS A `typing`, and it is a debounce
       handle for the query field rather than anything about fields being focused. Aliasing here is
       smaller than renaming a local in a file this size that other work may be sitting in. */
    if (isTyping()) return;

    /* THE CHORDS COME FIRST, and the blanket `if (modifier) return` above them was eating four of
       them: `⌘Home`, `⌘End`, `⌘a`, `⌥V` and `⌥B` were all registered in the keymap, printed on `?`,
       and dropped one line into the handler. A guard written to protect the BARE letters was
       protecting them from keys that are not bare. */
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === 'Home') {
      e.preventDefault();
      focus = { row: 0, col: focus.col };
      return;
    }
    if (mod && e.key === 'End') {
      e.preventDefault();
      focus = { row: rows.length - 1, col: focus.col };
      return;
    }
    if (mod && e.key.toLowerCase() === 'a' && siftable) {
      /* All LOADED, never all matching. A select-all reaching rows the DOM has never held is a
         count you cannot verify by looking — the same argument as 13 §4.3's 2,000-row cap, from the
         other side. */
      e.preventDefault();
      selected = new Set(result.entries.slice(0, DOM_CAP).map((r) => r.seq));
      return;
    }
    if (e.altKey && e.key.toLowerCase() === 'v') {
      e.preventDefault();
      void saveView();
      return;
    }
    if (e.altKey && e.key.toLowerCase() === 'b') {
      /* IT OPENS THE BINDER, which is 204 lines that nothing could reach. The chord already holds
         the register and the filters — which is everything the binder needs — and it answered with
         a toast describing what it would do instead of doing the readable half of it. The sentence
         it builds, its destination picker and its "a page cannot read a register it did not
         declare" rule were all written and none of them had ever been on a screen. */
      e.preventDefault();
      bindOpen = true;
      return;
    }
    if (e.shiftKey && e.key === 'Y') {
      const row = result.entries[focus.row];
      if (row) {
        e.preventDefault();
        void copyLink(row.seq);
      }
      return;
    }
    /* A ROW WITH ITS OWN "…" HAS HAD ITS MENU OPENED BY THE SHELL (`context-menu.ts`) when the focus is in it. */
    if (e.defaultPrevented) return;
    if (e.shiftKey && e.key === 'F10') {
      e.preventDefault();
      openRowMenu();
      return;
    }
    if (e.key === 'ContextMenu') {
      e.preventDefault();
      openRowMenu();
      return;
    }
    if (mod || e.altKey) return;
    /* THE BARE NAMESPACE, AND THE SWITCH THAT TURNS IT OFF. Everything above this line is a chord or
       a named key and keeps working; everything below is a single character and does not. The arrows
       are below it and survive, because an arrow is not a character shortcut. */
    if (silenced(e)) return;

    if (e.key === 'j' || e.key === 'ArrowDown') {
      e.preventDefault();
      /* WHILE A ROW IS OPEN THE WALK IS THE PANEL'S, and the cursor goes with it (`walked`). */
      if (host.opened !== null) walked(host.next());
      else {
        focus = { ...focus, row: Math.min(focus.row + 1, rows.length - 1) };
        carry();
      }
    } else if (e.key === 'k' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (host.opened !== null) walked(host.previous());
      else {
        focus = { ...focus, row: Math.max(focus.row - 1, 0) };
        carry();
      }
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      focus = { ...focus, col: Math.min(focus.col + 1, columns.length - 1) };
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focus = { ...focus, col: Math.max(focus.col - 1, 0) };
    } else if (e.key === 's') {
      if (sendRows()) e.preventDefault();
    } else if (e.key === 'p') {
      e.preventDefault();
      const seq = result.entries[focus.row]?.seq;
      if (seq !== undefined && !keeps(seq)) host.open(seq);
    } else if (e.key === 'Enter') {
      /* ENTER ON A CONTROL IS THAT CONTROL'S. It pressed Display, opened a filter menu or chose a
         value in it, and then took the page to the cursor's row as well, so the choice was made on a
         screen that had already gone. */
      if ((e.target as Element | null)?.closest?.('button, a, [role^="menuitem"]')) return;
      const row = result.entries[focus.row];
      if (row) goto(at(`/r/${id}/${row.seq}`));
    } else if (e.key === 'v') {
      e.preventDefault();
      displayOpen = true;
    } else if (e.key === 'y') {
      const row = result.entries[focus.row];
      if (row) {
        e.preventDefault();
        void copyId(row.seq);
      }
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && !changes) {
      e.preventDefault();
      readOnlySaid();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      const row = result.entries[focus.row];
      if (row) {
        e.preventDefault();
        /* AND THE CARET STAYS ON THE ROW, which is where the person is looking. This walked it up
           one with `Math.min(focus.row, length - 2)`, left over from when archiving took the row off
           the screen and something had to happen to a caret pointing past the end. `archive()`
           writes a receipt and removes nothing, on purpose: the row is drawn where it was, wearing
           what happened to it, so the reader can check they hit the right one. The only press the
           old line could ever change was one on the LAST row, which jumped the caret to the
           second-to-last for no reason a person could see. */
        archive(row.seq);
      }
    } else if (e.key === 'Home') {
      /* Bare `Home`/`End` are ROW ends; with the modifier they are REGISTER ends. The distinction is
         the whole reason both exist — a grid where Home jumps to row one is a grid where you cannot
         get back to the first column without arrowing across it. */
      e.preventDefault();
      focus = { ...focus, col: 0 };
    } else if (e.key === 'End') {
      e.preventDefault();
      focus = { ...focus, col: columns.length - 1 };
    } else if (e.key === 'n') {
      e.preventDefault();
      if (adds) createOpen = true;
      else readOnlySaid();
    } else if (e.key === 'o') {
      /* The RELATED register: the one the focused cell points at. A `ref` cell knows its target, so
         `o` follows it; on any other cell there is nothing related and nothing happens. */
      const field = columns[focus.col]?.field;
      const to = field ? decl?.fields.find((f) => f.id === field)?.to : undefined;
      if (to) {
        e.preventDefault();
        void goto(at(`/r/${to}`));
      }
    } else if ((e.key === 'x' || e.key === 'X') && siftable) {
      /* `X` and not `x` when shift is down — `e.key` carries the SHIFTED character, so a check for
         the lowercase letter alone silently drops every `⇧x`. */
      const row = result.entries[focus.row];
      if (row) {
        e.preventDefault();
        toggleSelect(row.seq, e.shiftKey);
      }
    } else if (e.key === 'Escape' && host.opened !== null) {
      /* ESC IN THE LIST CLOSES AN OPEN PEEK FIRST, as the key that opened it does in Linear and Quick Look;
         the next Esc clears a selection. */
      e.preventDefault();
      host.close();
    } else if (e.key === 'Escape' && selected.size > 0) {
      e.preventDefault();
      selected = new Set();
    } else if (e.key === 'e' || e.key === 'F2') {
      /* THE KEY WAS ON THE `?` SHEET AND ANSWERED WITH A SENTENCE about what it would have done.
         The cell under the caret is the one that opens: `focus.col` is where the grid's own caret
         is, which is what the reader is looking at, and going to any other cell would be the
         product choosing for them. */
      e.preventDefault();
      const row = result.entries[focus.row];
      const field = columns[focus.col]?.field;
      /* A CARD HAS NO CELL TO BECOME THE EDITOR, on the board, the cards or a phone, so `e` opens the row, where every
         value is edited. An editor opened here would be drawn nowhere and hold the list's re-ask until it closed. */
      if (row && (view !== 'table' || rowsAsCards())) void goto(at(`/r/${id}/${row.seq}`));
      else if (row && field) openEditor(row.seq, field);
    }
  }

  /**
   * Selection, and it is CLIENT STATE that never leaves.
   *
   * `x` toggles, `⇧x` extends from the last one touched, `⌘a` takes everything loaded, `Esc` clears.
   * The anchor is the last SIMPLE toggle rather than the last change, which is what makes a run of
   * `⇧x` presses extend the same range instead of walking it.
   */
  let selected = $state(new Set<number>());
  let anchor = 0;

  /**
   * ⇧F10 and the context-menu key — AND, ON A PHONE, THE ⋯ ON A CARD.
   *
   * The rect is taken at open and not tracked: a menu that follows a scrolling row is a menu that
   * walks away from the pointer.
   *
   * `menuRow` READ `result.entries[focus.row]`, which is the row the KEYBOARD is on. That is the
   * same row on a keyboard and no row at all on a phone, where `focus.row` is 0 and nothing has
   * moved it — so a card menu would have offered Peek, Copy and Archive for whichever row happened
   * to be first. The menu is about a row, so it holds the row.
   */
  let menuAt = $state<{ x: number; y: number; height: number } | null>(null);
  let menuSeq = $state<number | null>(null);
  const menuOpen = $derived(menuAt !== null);
  const menuRow = $derived(result.entries.find((e) => e.seq === menuSeq));

  function openRowMenu() {
    /* WHICHEVER BODY IS ON THE SCREEN. This looked for `.tr` alone, and once the card list and the
       grid stopped both being built, `⇧F10` found nothing below 640px and the row menu stopped
       opening at all — the a11y gate's own scenario caught it. It had never really worked there
       either: a `display: none` row still matches a selector and reports a zero rect, so the menu
       used to open in the top-left corner of the window rather than beside the row. */
    /* AND ON THE BOARD AND THE CARDS, WHERE A ROW'S PLACE ON THE SCREEN IS NOT ITS PLACE IN THE ANSWER, the card
       is found by its number. */
    const seq = result.entries[focus.row]?.seq;
    const el =
      document.querySelectorAll('.rowgroup .tr')[focus.row] ??
      document.querySelectorAll('.cards > li')[focus.row] ??
      (seq === undefined ? undefined : document.querySelector(`[data-row-seq="${seq}"]`));
    if (!el) return;
    const r = el.getBoundingClientRect();
    menuAt = { x: r.x + 24, y: r.y, height: r.height };
    menuSeq = result.entries[focus.row]?.seq ?? null;
  }

  /** The same menu, opened by touch from the card's own trailing control. */
  function openCardMenu(seq: number, el: HTMLElement, point?: { x: number; y: number; height: number }) {
    const r = el.getBoundingClientRect();
    menuAt = point ? { x: point.x, y: point.y, height: point.height } : { x: r.x, y: r.y, height: r.height };
    menuSeq = seq;
    /* THE "…" SAYS IT IS OPEN, as the shared Menu's trigger does (audit 31 Oct i, AI4). */
    menuFrom?.setAttribute('aria-expanded', 'false');
    menuFrom = el.hasAttribute('aria-haspopup') ? el : null;
    menuFrom?.setAttribute('aria-expanded', 'true');
  }
  let menuFrom: HTMLElement | null = null;
  $effect(() => {
    if (menuAt !== null || menuFrom === null) return;
    menuFrom.setAttribute('aria-expanded', 'false');
    menuFrom = null;
  });

  /** The Table speaks in row KEYS (`register#seq`), which is the id a row is addressed by. */
  const selectedKeys = $derived(new Set([...selected].map((seq) => `${id}#${seq}`)));

  function toggleSelect(seq: number, extend: boolean) {
    const at = result.entries.findIndex((r) => r.seq === seq);
    if (extend) {
      const [from, to] = anchor <= at ? [anchor, at] : [at, anchor];
      const next = new Set(selected);
      for (const row of result.entries.slice(from, to + 1)) next.add(row.seq);
      selected = next;
      return;
    }
    anchor = at;
    const next = new Set(selected);
    if (next.has(seq)) next.delete(seq);
    else next.add(seq);
    selected = next;
  }

  /** The select-all box: every row on screen picked, or none. */
  function selectAll(on: boolean) {
    selected = on ? new Set(result.entries.slice(0, DOM_CAP).map((e) => e.seq)) : new Set();
  }

  /* ── the verbs a selection is FOR ──────────────────────────────────────────
     Copy the numbers, move the state, archive: three verbs, drawn by `parts/BulkBar.svelte` and
     each done here, on the rows the reader is looking at. */

  /**
   * THE SELECTION, CUT TO THE ANSWER ON SCREEN.
   *
   * `selected` is a set of numbers and nothing pruned it when the filter or the query changed, so a
   * reader could tick five rows, search, see two ticks and a toolbar saying five, press Archive, and
   * archive three rows they could not see. Every verb and every count reads this, not the set: what
   * a bulk action acts on is what the reader is looking at.
   */
  const picked = $derived(result.entries.filter((e) => selected.has(e.seq)));

  async function copyIds() {
    const text = picked.map((e) => `${id}#${e.seq}`).join(' ');
    try {
      await navigator.clipboard.writeText(text);
      toasts.push(copy.copied(`${picked.length} ${picked.length === 1 ? 'reference' : 'references'}`));
    } catch {
      toasts.push(copy.copyRefused, { intent: 'warn' });
    }
  }

  /**
   * Move every selected row's state: one change per row, then one sentence for all of them.
   *
   * ONE AT A TIME, so a refusal on the third row is the record's answer about that row and not one of
   * eight racing answers. The toast says how many landed and, when one did not, the first reason.
   */
  async function setPickedState(state: string) {
    const said = saidInLine(decl?.state ?? '', state);
    const field = decl?.state;
    if (!field) return;
    const was = asked;
    const rows = [...picked];
    const total = rows.length;
    let landedCount = 0;
    let first: string | null = null;
    const patch = { [field]: state };
    /* EVERY ROW THAT LANDED, WITH WHAT IT HELD BEFORE, so the toast can put back the whole gesture at once. */
    const changed: Change[] = [];
    for (const e of rows) receipt(e.seq, { mark: copy.writeMarkSaving, intent: 'warn' });
    for (const e of rows) {
      const out = await writes().update(id, e.seq, patch, e.version);
      if (out.ok) {
        landedCount += 1;
        changed.push({ before: e, patch, answered: out.entry });
      } else first ??= out.fix;
      if (asked !== was) continue;
      clearReceipt(e.seq);
      if (out.ok) {
        landRow(out.entry);
        receipt(e.seq, { mark: said, intent: 'good', undo: putBackOf(e, patch, out.entry) });
      } else if (out.why === 'conflict' && out.entry) landRow(out.entry);
    }
    const line = copy.writeBulk(landedCount, total, said);
    /* THE TOAST PUTS BACK THE ROWS THAT MOVED AND NO OTHERS. A row the record refused never changed, and writing
       its old state over it again would be a write with nothing to undo. */
    toasts.push(first ? `${line} ${first}` : line, {
      ...(changed.length > 0 ? { undo: () => void putBack(changed) } : {}),
      ...(landedCount === total ? {} : { intent: 'warn' as const }),
    });
  }

  /**
   * Archive rows on the record, one at a time, and give each one back from where it is drawn.
   *
   * THE ROW STAYS WHERE IT WAS, wearing `Archived` and `Put back`, the receipt the sample drew before this wrote; the
   * record leaves it out of the next read. Put back and the toast's undo are the same write the other way: `deleted_at` null,
   * at the version the archive answered with. No dialog, because an undo says what happened and a dialog asks first.
   */
  async function archiveOnRecord(seqs: readonly number[], named: string, along?: { register: string; seq: number }) {
    const was = asked;
    const list = id;
    const landed: Entry[] = [];
    let first: string | null = null;
    /* The entry made with this one (RN5), archived after it and put back with it. */
    let alongGone: Entry | null = null;
    const alongBack = (): void => {
      const a = along;
      const e = alongGone;
      if (!a || !e) return;
      alongGone = null;
      void writes().restore(a.register, a.seq, e.version);
    };
    /* ARCHIVED THE MOMENT IT IS PRESSED (`lib/data/optimistic.ts`): the row wears `Archived` before the record has
       answered, and the chip's Put back arrives with the answer, since a way back needs the version the archive made. A
       row the record refused goes back to its verbs, and the toast says why. */
    for (const seq of seqs) hold(seq);
    for (const seq of seqs) receipt(seq, { mark: copy.markArchived });
    for (const seq of seqs) {
      const out = await writes().archive(list, seq, rowAt(seq)?.version);
      if (out.ok) landed.push(out.entry);
      else first ??= out.fix;
      if (asked !== was) continue;
      clearReceipt(seq);
      if (out.ok) {
        const row = out.entry;
        landRow(row);
        receipt(seq, {
          mark: copy.markArchived,
          undo: () => {
            void restoreOnRecord([row], list);
            alongBack();
          },
        });
      } else if (out.why === 'conflict' && out.entry) landRow(out.entry);
    }
    if (landed.length === 0) {
      toasts.push(first ?? copy.writeNotReached, { intent: 'warn' });
      return;
    }
    /* ONLY WHILE NOTHING ELSE LINKS TO THEM (RO9): the person stays where a later order, a meeting or a note now points
       at them, and Put back then has nobody to bring back but the order. */
    if (along && landed.length === seqs.length) {
      const gone = await writes().archiveAlone(along.register, along.seq);
      if (gone?.ok) alongGone = gone.entry;
    }
    const line = landed.length === seqs.length ? copy.writeArchived(named) : copy.writeArchivedSome(landed.length, seqs.length);
    /* THE TOAST SAYS WHAT HAPPENED AND NOTHING MORE (motion F20): each row wears its own "Put back", so the toast draws no
       second Undo for the same change, and ⌘Z still reaches it. */
    toasts.push(first ? `${line} ${first}` : line, {
      undo: () => {
        void restoreOnRecord(landed, list);
        alongBack();
      },
      offer: false,
      ...(first ? { intent: 'warn' as const } : { life: UNDO_MS }),
    });
    /* AND WHEN THE WAY BACK RUNS OUT THE ROW LEAVES (motion F7.2), with the list's motion, rather than waiting for the
       next read. A row put back in the meantime wears another chip, and stays. */
    const gone = landed.map((e) => e.seq);
    setTimeout(() => {
      if (list !== id) return;
      const leaving = new Set(gone.filter((seq) => receipts.get(seq)?.mark === copy.markArchived));
      if (leaving.size === 0) return;
      /* THE HOLD GOES WITH THE RECEIPT, in the same tick. `holdInPlace` brings back a held row the answer has dropped,
         so a row taken out of `pages` while still held came straight back, as it was read: "Open", until a reload. */
      pages = pages.map((p) => p.filter((e) => !leaving.has(e.seq)));
      matched = Math.max(0, matched - leaving.size);
      const kept = new Map(held);
      for (const seq of leaving) kept.delete(seq);
      held = kept;
      for (const seq of leaving) clearReceipt(seq);
    }, UNDO_MS);
  }

  /**
   * `⌥V`, and the two buttons that say it: what is on screen, saved as a page under Views, and that page opened.
   *
   * NO NAMING DIALOG. The address already says which rows these are, so the name is the list and its filter in the
   * list's own words, and the toast's undo retires the page and comes back here. See `viewPage` for why it is a page.
   */
  /* ONE SAVE AT A TIME. A second press of Save as view, or a second Alt+V, while the first write was still out made a
     second page over the same filter. Not `$state`, because nothing draws it. */
  let saving = false;

  async function saveView() {
    if (!decl || saving) return;
    /* THE WORD FIRST: "filter or search first" would be the wrong advice, since a chip beside the word saves no more. */
    if (twice) {
      toasts.push(thingSaid?.unsaved ?? twiceWords.unsaved, { intent: 'warn' });
      return;
    }
    if (filters.length === 0 && q === '') {
      toasts.push(copy.viewNeedsFilter, { intent: 'warn' });
      return;
    }
    const clauses = filters.map((f) => {
      const field = decl.fields.find((d) => d.id === f.field);
      return copy.filterClause(field ? labelOf(field) : f.field, f.values.map((v) => saidInLine(f.field, v)), f.op);
    });
    /* A SEARCH IS ALWAYS "and" BESIDE THE CHIPS (`treeOf`), so the title says "or" only when the chips are all there is. */
    const title = copy.viewTitle(decl.name, either && !q ? copy.filterReads(clauses, 'or') : copy.filterReads(q ? [...clauses, `"${q}"`] : clauses));
    const back = `${page.url.pathname}${page.url.search}`;
    const drawn = columns.map((c) => c.field).filter((f) => f !== 'select' && f !== 'act' && f !== 'seq');
    saving = true;
    try {
      const out = await writes().saveView(id, title, { filters, q, sort, ...(either ? { join: 'any' as const } : {}) }, drawn);
      if (!out.ok) {
        toasts.push(out.fix, { intent: 'warn' });
        return;
      }
      await goto(at(`/p/${out.slug}`));
      toasts.push(copy.viewSaved(title), {
        undo: () =>
          void writes()
            .dropView(out.id)
            .then((gone) => {
              if (gone.ok) void goto(at(back));
              else toasts.push(gone.fix, { intent: 'warn' });
            }),
      });
    } finally {
      saving = false;
    }
  }

  /* EVERY PUT BACK PRESSED ON THIS SCREEN, so a row's chip and the toast over the same rows write each change once
     (`put-back.ts`). One for the life of the screen and not `$state`: nothing draws it. */
  const spent = spentPutBacks();

  /**
   * THE WAY BACK FROM A STATE OR A CELL, which is the same write the other way: each field the change wrote, set back
   * to what the row held, built by `inverseOf`.
   *
   * AT THE VERSION THE WRITE ANSWERED WITH, not the version the screen holds now. If anybody has moved the row since,
   * the record says so and the row is drawn as it now stands; sending the newer version instead would put back this
   * screen's change by writing over theirs, which is an undo that loses somebody else's edit to recover one's own.
   *
   * PUSHED ONLY ONCE THE WRITE HAS LANDED, because the inverse of a write that never happened is a second write
   * nobody asked for. A row the screen was not holding has no values to go back to, so it gets none.
   */
  const putBackOf = (before: Entry | undefined, patch: Fields, answered: Entry): (() => void) | undefined =>
    before ? () => void putBack([{ before, patch, answered }]) : undefined;

  /**
   * WHAT A ROW WEARS WHEN ITS PUT BACK ANSWERS. `putBack` and `restoreOnRecord` mark the row `Saving` before they
   * write, and this is what replaces that mark: `Restored`, or the chip the row wore before the press.
   *
   * A SECOND PRESS WAS A SECOND WRITE. The chip kept `Put back` until the answer came, so pressing it twice sent the
   * inverse twice, the second at a version the first had already spent. `Saving` carries no undo, so the button goes
   * with the first press, as archive's does.
   *
   * A MISS THAT WAS NOT A CONFLICT GETS ITS PUT BACK AGAIN, because the row did not move and the way back is still
   * true: a dropped connection must not cost the reader the only button that undoes their change. A conflict clears the
   * chip instead, since somebody else has moved the row and the inverse would now write over them.
   */
  function backAnswered(seq: number, out: Wrote, wore: Receipt | undefined) {
    if (out.ok) {
      landRow(out.entry);
      receipt(seq, { mark: copy.writeMarkRestored, intent: 'good' });
    } else if (out.why !== 'conflict' && wore) receipt(seq, wore);
    else {
      clearReceipt(seq);
      if (out.why === 'conflict' && out.entry) landRow(out.entry);
    }
  }

  /**
   * Put changed rows back, one at a time, and mark each one that landed `Restored`, the mark Put back leaves.
   *
   * A ROW ALREADY PUT BACK IS LEFT OUT, whichever of its two buttons did it. The bulk toast holds every row it moved,
   * and a row whose own chip had been pressed first was sent again at the spent version, answered conflict, and lost
   * its `Restored` to a sentence about somebody else's change that was in fact the reader's own press.
   */
  async function putBack(changes: readonly Change[], list = id) {
    const owed = spent.take(changes);
    if (owed.length === 0) return;
    const was = asked;
    /* A TOAST OUTLIVES ITS SCREEN, so its Put back names the list it was raised on and draws nothing on another one. */
    const here = list === id;
    const shape = decl;
    let first: string | null = null;
    const wore = new Map(owed.map((c) => [c.before.seq, receipts.get(c.before.seq)] as const));
    /* THE ROW SHOWS WHAT IT HELD AT ONCE, over the answer, until the record has it back (`lib/data/optimistic.ts`). */
    const back = owed.map((c) => inverseOf(c.before, c.patch, shape));
    if (here)
      owed.forEach(({ before }, i) => {
        receipt(before.seq, { mark: copy.writeMarkSaving, intent: 'warn' });
        for (const [field, value] of Object.entries(back[i]!)) setPatch(before.seq, field, value as Fields[string]);
      });
    for (const [i, change] of owed.entries()) {
      const { before, answered } = change;
      const out = await writes().update(list, before.seq, back[i]!, answered.version);
      spent.answered(change, out);
      if (!out.ok) first ??= out.fix;
      if (!here || asked !== was) continue;
      for (const field of Object.keys(back[i]!)) dropPatch(before.seq, field);
      backAnswered(before.seq, out, wore.get(before.seq));
    }
    if (first) toasts.push(first, { intent: 'warn' });
  }

  /** Put archived rows back. A row this screen has read since is sent at the version it now holds. */
  async function restoreOnRecord(rows: readonly Entry[], list = id) {
    const was = asked;
    const here = list === id;
    let first: string | null = null;
    const wore = new Map(rows.map((e) => [e.seq, receipts.get(e.seq)] as const));
    /* `Saving` AT ONCE, which carries no Put back, so a second press has nothing to press; the archive chip comes back if
       the record refuses. */
    if (here) for (const e of rows) receipt(e.seq, { mark: copy.writeMarkSaving, intent: 'warn' });
    for (const e of rows) {
      const out = await writes().restore(list, e.seq, (here ? rowAt(e.seq)?.version : undefined) ?? e.version);
      if (!out.ok) first ??= out.fix;
      if (!here || asked !== was) continue;
      backAnswered(e.seq, out, wore.get(e.seq));
    }
    if (first) toasts.push(first, { intent: 'warn' });
  }

  function archiveSelected() {
    const seqs = picked.map((e) => e.seq);
    selected = new Set();
    /* ONE ROW IS NOT "1 obligations". The register declares both spellings, `name` for the list and
       `one` for a row of it, and the bulk archive read only the first, so every single-row bulk archive
       said the plural. The keyboard path next door has always said `obligations#1`. */
    void archiveOnRecord(seqs, seqs.length === 1 ? `“${nameOf(seqs[0]!)}”` : `${seqs.length} ${decl?.name.toLowerCase() ?? copy.rowsWord(seqs.length)}`);
  }

  /** The register's own states, so the menu is the vocabulary rather than a list typed here. */
  const states = $derived(decl?.fields.find((f) => f.id === decl.state)?.values ?? []);
  /* AND ITS OWN NAME FOR THE COLUMN, so the verb over the menu says what the header says. */
  const stateLabel = $derived.by(() => {
    const f = decl?.fields.find((x) => x.id === decl.state);
    return f ? labelOf(f) : 'state';
  });

  const emptyKind = $derived(
    result.total === 0 ? 'no-data-yet' : q || narrowed ? 'no-results' : 'cleared',
  );

  /**
   * THIS SCREEN FETCHES, AND SAYS WHAT IT DREW ONCE IT HAS.
   *
   * `data-screen` on `<main id="main">` is what lets anything outside the page tell a drawn screen
   * from a shell that has fetched nothing. `ask` and `more` bracket their reads with the screen's
   * counters, so while a question is out there is no attribute whatever this line says. `Empty` says
   * `empty` or `refused` for the states it draws, and this is the claim for the rest.
   */
  $effect(() => drew('ready'));

  /**
   * WHETHER THE ROWS STAND INSIDE THE LIST'S TILE: the table, the groups, a phone's cards and an empty list do; the board
   * and the cards on a laptop are tiles of their own, so they stand on the board under it, since a tile never holds one.
   */
  const tiled = $derived(view === 'table' || view === 'groups' || rowsAsCards() || rows.length === 0);

  /* This screen's own words: the head's overflow, named with the list it is about. */
  const headWords = { more: (list: string) => `More for ${list}`, whole: 'Add one with all its fields' } as const;
  /* The toolbar's own "⋯": how the list is shown, and keeping what is on screen. */
  const toolWords = { more: 'Display and views' } as const;

  /* THE ADD SHEET'S EXAMPLE, from the list itself: the newest row's name, so the line shows what a name here looks like. */
  const captureExample = $derived.by(() => {
    /* NEVER SOMEBODY ALREADY HERE (AG9): "What is it? e.g. S. Marchetti" asked for a person the list already held. A
       list of people or organisations asks for a name, with its own made-up example. */
    if (captureNamed !== null) return null;
    const e = standing.find((x) => x.seq > 0 && !added.has(x.seq));
    return e ? titleSaid(e) : null;
  });
  /* WHO A LIST OF PEOPLE OR ORGANISATIONS ASKS FOR, by name ("Who?"), and not "What is it?". */
  const captureNamed = $derived<'person' | 'org' | null>(meetsOf(decl) ? 'person' : orgRoleOf(decl) ? 'org' : null);

  /** The toolbar's primary: the add line opens, or takes the caret again where it is already open. */
  function openCapture() {
    captureOpen = true;
    void tick().then(() => document.getElementById('capture')?.focus());
  }
</script>

<svelte:head><title>{titleOf(decl?.name)}</title></svelte:head>

<svelte:window {onkeydown} />

{#if composed}
  <!-- THE LIST AS A PAGE THE RECORD COMPOSES, fetched when the address asks for it and never otherwise. -->
  {#await import('./DeclaredList.svelte') then loaded}
    <loaded.default register={id} {decl} count={booted?.registers.find((r) => r.id === id)?.count ?? null} refused={refusal?.fix ?? null} />
  {/await}
{:else if refusal && refusal.code !== 'REGISTER_UNKNOWN'}
  <!-- THE RECORD SAID NO, AND ITS SENTENCE IS THE BODY, verbatim (`13 §6`). What the record wrote
       is the most specific thing anybody can say about why this list is not here, and a sentence
       rewritten here would be a guess about it. -->
  <div class="page">
    <Empty kind="error" heading title={copy.screenFailed} body={refusal.fix}>
      {#snippet actions()}<Button href="/">{copy.today}</Button>{/snippet}
    </Empty>
  </div>
{:else if !decl && !refusal}
  <!-- LOADING. The answer is a round trip away, and a placeholder list would be rows that are not
       there, so it is bars with no words in them, after 300ms (`Waiting.svelte`). `aria-busy` says
       the region is on its way, and `data-screen` stays off until it has arrived. -->
  <div aria-busy="true"><Waiting head rows={8} /></div>
{:else if !decl}
  {@const have = offered(booted?.registers ?? [])}
  <div class="page">
    <!-- A URL NAMING SOMETHING THIS RECORD DOES NOT HAVE IS A REFUSAL, and the record already has
         the sentence for it. Nothing failed, so there is no request id to quote (`50 §13 D11`), and
         no filter ran, so "nothing matched" is about something that did not happen. It names the
         thing, says it is not here, and lists what is — `10 §7`'s fourth rule: the refusal is the
         teacher. WHAT IS HERE IS OFFERED AS LISTS TO OPEN, and the list asked for as one to make: a sentence of ids
         ("Lists on this record: session") was the record's machinery read aloud, and nothing in it could be pressed.
         The "New list" entry lands here under `_new`, which no list can be called, and reads as a place to start. -->
    <Empty
      kind={id === MAKE_ID ? 'no-data-yet' : 'error'}
      heading
      title={id === MAKE_ID ? listWords.title : listWords.missingTitle(nameFromId(id))}
      body={id === MAKE_ID ? listWords.makeBody : have.length > 0 ? listWords.missing : listWords.missingNone(nameFromId(id))}
    >
      {#snippet actions()}
        {#if id !== MAKE_ID}
          <NearLinks places={nearest(id, have.map((r) => ({ title: r.name, href: `/r/${r.id}`, address: r.id })))} said={listWords.nearLists} />
        {/if}
        {#if proposes}<Button weight="primary" onclick={() => (makeOpen = true)}>{listWords.make}</Button>{/if}
      {/snippet}
    </Empty>
  </div>
  <ListEditor bind:open={makeOpen} register={null} {owner} name={nameFromId(id)} onmade={made} />
{:else}
  <!-- THE SENTENCE, cut round the phrase that needs him, which `PageHead` draws in red (`data-needs`). -->
  {#snippet readingSaid()}{reading?.before}{#if reading?.needs}<span data-needs>{reading.needs}</span>{/if}{reading?.after}{/snippet}

  <!-- THE SCREEN NARROWS BESIDE THE DOCKED PANEL, AND NEVER GOES UNDER IT. `--dock-w` is what an open docked
       panel takes from the window's end edge, and nothing otherwise; the head's and the list's own gutter already
       stand inside it, so what is added is the rest. -->
  <div class="list-screen">
  <!-- THE KEYS LIST IS THE KEYCHAIN'S TABLE VIEW (AG16): titled as the one place, with the switch back to its keys. -->
  <PageHead icon={id === KEYS_REGISTER ? 'vault' : iconFor(decl.icon, 'rows')}
    title={id === KEYS_REGISTER ? copy.keychain : decl.name}
    count={head}
    total={denominator}
    sentence={reading ? readingSaid : undefined}
  >
    {#snippet actions()}
      {#if id === KEYS_REGISTER}<KeyViews on="table" />{/if}
      <!-- THE HEAD HOLDS ONE PRIMARY AND AN OVERFLOW. How the list is drawn, its search and its filters
           are about the rows, so they moved down into the list's own tile, where the rows are. -->
      <!-- ONE WAY TO ADD, AND IT IS THE LIST'S FIRST LINE. The head said "New item" over a line saying "Add an item",
           two controls for one act a hand's width apart. The line stays, since a name and Enter is the cheapest add
           there is; the whole form is `n` and the first entry of the overflow. On a phone the "+" opens the line as a
           sheet. New stays only on the arrival (`?first`), where neither the line nor the "+" is drawn. -->
      {#if adds && arriving}
        <span class="new-row">
          <Button weight="primary" kbd="n" onclick={() => (createOpen = true)}><Icon name="plus" size="s" />{said('new_row')} {decl.one}</Button>
        </span>
      {:else if adds}
        <CapturePlus one={decl.one} onclick={() => (captureOpen = true)} />
      {/if}
      <!-- THE REST OF WHAT A LIST OFFERS, IN THE OVERFLOW: a row started with every field in front of you, the view over
           what is handed to you, on a list that says who holds its rows, and the list's fields (`ListEditor.svelte`). -->
      {#if handedToMe || proposes || (adds && !arriving) || rowsAsCards() || shares || (owner && id !== KEYS_REGISTER)}
        <Menu label={headWords.more(decl.name)} align="end">
          <!-- NAMED, as every "⋯" is (motion F11): the name is text inside the trigger, never a `title` on a child. On a
               phone it also holds Display, which the toolbar's own "⋯" holds from 640. -->
          {#snippet trigger()}<span class="head-more" data-list-more={rowsAsCards() ? '' : undefined}><Icon name="more" size="m" /><span class="sr-only">{headWords.more(decl.name)}</span></span>{/snippet}
          {#if rowsAsCards()}<button type="button" role="menuitem" onclick={() => (displayOpen = true)}><Icon name="settings" size="s" />{copy.display}</button>{/if}
          {#if adds && !arriving}<button type="button" role="menuitem" data-new-row onclick={() => (createOpen = true)}>{headWords.whole}</button>{/if}
          {#if handedToMe}<a role="menuitem" href={at(handedToMe)}>{copy.handedToMe}</a>{/if}
          <!-- SHARE THE LIST, with somebody here, a group or an email, an owner's or an Admin's. -->
          {#if shares}<button type="button" role="menuitem" data-share-list onclick={shareList}><Icon name="user-plus" size="s" />{copy.shareSheetTitle(decl.name)}</button>{/if}
          {#if proposes}<button type="button" role="menuitem" data-fields-open onclick={() => (fieldsOpen = true)}>{sheetWords.open}</button>{/if}
          <!-- ITS NAME, CHANGED HERE (`SettingHere.svelte`): the record's `renameList`, with an Undo, no trip to Settings. -->
          {#if owner && id !== KEYS_REGISTER}<button type="button" role="menuitem" onclick={() => (renameOpen = true)}><Icon name="edit" size="s" />Rename this list</button>{/if}
        </Menu>
      {/if}
    {/snippet}
  </PageHead>
  {#if proposes}<ListEditor bind:open={fieldsOpen} register={id} {owner} onchanged={refresh} />{/if}
  {#if renameOpen}{#await import('$lib/page/SettingHere.svelte') then { default: SettingHere }}<SettingHere bind:open={renameOpen} what={{ kind: 'list', id, name: decl.name }} onchanged={refresh} />{/await}{/if}

  <div class="page" aria-busy={busy ? 'true' : undefined} data-from-copy={fromCopy ? '' : undefined} data-picking={picked.length > 0 ? '' : undefined}>
    <!-- THE LIST HAS MOVED ON AND MORE THAN ONE PAGE OF IT IS IN HAND, so it says so rather than splicing a new head
         onto old pages (`recheck` above). `role="status"` because it arrives without the reader doing anything, and a
         screen reader should hear it once, politely. -->
    {#if stale}
      <p class="stale" data-stale role="status">
        <span>{copy.stale}</span>
        <Button onclick={refresh}>{copy.tryAgain}</Button>
      </p>
    {:else if foundRoom}
      <!-- A SEARCH THIS DEVICE ANSWERED, said as that until the record's own answer replaces it, in room held for it. -->
      <p class="stale found-here" data-from-device={searchedHere && fromCopy ? '' : undefined} role="status">
        <span class:unsaid={!(searchedHere && fromCopy)}>{copy.foundHere}</span>
      </p>
    {/if}

    <!-- THE OFFER, WHERE SHE IS: one at most, above the list's figures and its entries, and none while the list is
         still arriving, since an offer is drawn from use and a list being made has none yet. FOLDED TO ONE LINE
         (`compact`): she opened the list to read it, so the offer is a sentence over it and a press
         opens the card whole, with Make it and Not now where they were. -->
    {#if offer && !arriving}
      <OfferCard item={offer} acts={offerActions} busy={offerBusy} compact />
    {/if}

    <!-- THE LIST'S FIGURES, over the whole list only (`ListSummary` says why): one tile above the list's own, 12 from it.
         And only on a list long enough to sift: five rows are read faster than a chart of them, and the tile would be
         the figure of what the eye already has. -->
    {#if whole && !arriving && siftable && standing.length > 0}
      <ListSummary {decl} entries={standing} {now} byState={!narrowed && q === ''} headSaid={reading !== null} titleOf={titleSaid} />
    {/if}

    <!--
      THE LIST IS ONE TILE ON THE BOARD: its toolbar across the top (the search and the filters at the
      start, how it is drawn and Display at the end), the line that adds a row, then the rows. The board and the cards
      are tiles of their own, so on those two views the tile holds the toolbar and the cards stand on the board under it,
      since a tile never holds a tile.
    -->
    <Tile class="list-tile" data-view={view}>
      <!-- THE PEOPLE WHO MAY BE HELD TWICE, AND ONLY THEM (`twice=1`): what is being shown, in words, and the way back
           to everyone beside it. The list's first line, since it changes what every line under it means. The button
           takes the word out of the address and leaves the chips, the search and the order as they are. -->
      {#if twice}
        <p class="held-twice" data-held-twice role="status">
          <span>{thingSaid?.showing ?? twiceWords.showing}</span>
          <span class="held-acts">
            <!-- THE ONE PRESS THAT FOLDS THEM, on a list of things that says `same:`: it files the question and opens it
                 on Decide, where the fold is the answer and one Undo brings every one back. Not for people, whose fold
                 is chosen two at a time from the picked bar. -->
            {#if thingSaid && twice.values.length > 0 && foldGone !== id}
              <Button weight="primary" data-held-twice-fold disabled={folding} onclick={() => void fold()}>{thingSaid.keep}</Button>
            {/if}
            <Button data-held-twice-clear onclick={clearTwice}>{thingSaid?.clear ?? twiceWords.clear}</Button>
          </span>
        </p>
      {:else if twiceSaid}
        <!-- HOW MANY ARE HERE TWICE, on a list of things that says what makes two the same, and the link that shows them. -->
        <p class="held-twice" data-held-twice-count role="status">
          <span>{twiceSaid}</span>
          <Button data-held-twice-show href={twiceHref}>Show them</Button>
        </p>
      {/if}
      {#if picked.length > 0 && rows.length > 0}
        <!-- THE VERBS BELONG TO THE LIST, NOT TO ONE OF ITS BODIES, so the bar is drawn here for every view. While anything
             is picked it takes the toolbar's place, in the tile, and gives it back when nothing is (money F7). -->
        <BulkBar
          count={picked.length}
          {decl}
          states={changes ? states : []}
          {stateLabel}
          {saidInLine}
          {copyIds}
          {setPickedState}
          archiveSelected={changes ? archiveSelected : undefined}
          onclear={() => (selected = new Set())}
          picked={changes ? picked.map((e) => ({ seq: e.seq, version: e.version, fields: e.fields, name: titleSaid(e) })) : undefined}
          send={picked.map((e) => ({ ref: `${id}#${e.seq}`, label: titleSaid(e) }))}
          onmoved={refresh}
        />
      {:else}
      <div class="list-tools" data-uncounted={unsaid ? '' : undefined}>
        <!-- THE SEARCH AND THE FILTERS, which draw themselves only while there is something to sift, and the phone's
             filter sheet behind its one button. Which filters are on is the address, read and written here. -->
        <ChipsBar
          shown={siftable || q !== '' || filters.length > 0}
          register={id}
          name={decl.name}
          {q}
          filtered={q !== '' || filters.length > 0}
          savable={twice === null}
          {enums}
          chips={chipRects}
          {quick}
          {quickAt}
          {setQuick}
          {facets}
          {isOn}
          {toggleFilter}
          {dropFilter}
          {setQuery}
          saveView={() => void saveView()}
          shareView={shares && filters.length > 0 ? shareView : undefined}
        />
        <!-- THE TOOLBAR'S END (money F7): how the list is drawn, then its "⋯" with Display (`v`) and Save as a view, then
             the one way to add, the list's primary, named with what it adds. Below 640 the head holds the "+" and the
             "⋯", so this end is not drawn. -->
        <div class="list-views">
          {#if result.total > 0}<ViewSwitch {view} board={boardable} groups={groupable ? iconFor(decl.icon, 'rows') : null} onview={setView} />{/if}
          <Menu label={toolWords.more} align="end">
            {#snippet trigger()}<span class="tool-more" data-list-more><Icon name="more" size="m" /><span class="sr-only">{toolWords.more}</span></span>{/snippet}
            <button type="button" role="menuitem" onclick={() => (displayOpen = true)}><Icon name="settings" size="s" /><span class="mi-name">{copy.display}</span><Kbd keys="v" /></button>
            {#if (q !== '' || filters.length > 0) && twice === null}
              <button type="button" role="menuitem" onclick={() => void saveView()}><Icon name="plus" size="s" />{copy.saveAsView}</button>
            {/if}
            <!-- "SHARE THIS VIEW": the rows the filters pick, shared as their condition. -->
            {#if shares && filters.length > 0}
              <button type="button" role="menuitem" data-share-view onclick={shareView}><Icon name="user-plus" size="s" />{copy.shareThisView}</button>
            {/if}
          </Menu>
          {#if adds && !arriving}
            <span class="tool-add"><Button weight="primary" data-capture-open onclick={openCapture}><Icon name="plus" size="s" />{copy.captureIn(decl.one)}</Button></span>
          {/if}
        </div>
      </div>
      {/if}

      <!-- THE FILTERS CARRY NO NUMBERS, AND THIS SAYS SO: the record would not count the list for this person, or the
           count did not come back. One plain line under the bar, where the numbers would have been read. -->
      {#if unsaid}
        <p class="uncounted" data-uncounted-note role="status">{unsaid.code === 'FORBIDDEN' ? copy.countsWithheld : copy.countsUnread}</p>
      {/if}

      <!-- CAPTURE IS A SHEET NOW, behind the toolbar's primary and the phone's "+": a name and Enter, and it stays open for
           the next (motion F7.4). Where nobody may add, why not, in the add's place. -->
      {#if !adds && !madeByAgents}
        <p class="reach">{reachWords.readOnly(decl.name)}</p>
      {:else if !arriving}
        <CaptureLine one={decl.one} example={captureExample} named={captureNamed} bind:value={capture} bind:open={captureOpen} fault={captureFault} captureRow={() => captureRow()} asked={twin?.asked ?? null} onsame={twinSame} onnew={twinNew} allFields={() => {
          createValues = lineValues(id, capture, now);
          createOpen = true;
        }} />
      {/if}

      {#if rows.length === 0 && twice && filters.length === 0 && q === '' && result.total > 0}
        <!-- NOBODY IS HELD TWICE, said as that and not as a search that found nothing. -->
        <p class="held-none" data-held-twice-none>{thingSaid?.none ?? twiceWords.none}</p>
      {:else if rows.length === 0}
        <ListEmpty kind={emptyKind} register={id} {decl} size={result.total} {q} {filters} {searched} {adds} />
      {/if}

      {#if tiled && rows.length > 0}
        {@render listBody()}
      {/if}
    </Tile>

    {#if !tiled && rows.length > 0}
      {@render listBody()}
    {/if}
    <!-- NO SECOND SCREEN UNDER THE LIST. A list with nothing in it draws its own empty state. -->
  </div>

  </div>

  <!--
    ONE BODY AT A TIME, IN THE DOM: cards below 640px (`ListCards` says why), and above it the view the address asks
    for, the table, the groups, the board or the cards. `body` wraps them all, so the observer finds whichever sentinel
    is drawn and `showRow` finds whichever row is new.
  -->
  {#snippet listBody()}
    <div class="body-slot" bind:this={body}>
    <!-- PEOPLE BY ORGANISATION, at every width: a phone reads the groups as a laptop does, since a group is one line. -->
    {#if view === 'groups' && orgRoleOf(decl)}
      <ListOrgs
        register={id}
        {decl}
        entries={result.entries.slice(0, DOM_CAP)}
        {now}
        more={cursor !== null && loaded < DOM_CAP}
        {openCardMenu}
      />
    {:else if view === 'groups'}
      <ListPeople
        register={id}
        {decl}
        entries={result.entries.slice(0, DOM_CAP)}
        {now}
        names={result.names ?? undefined}
        more={cursor !== null && loaded < DOM_CAP}
        {openCardMenu}
      />
    {:else if rowsAsCards()}
      <ListCards
        register={id}
        entries={result.entries.slice(0, DOM_CAP)}
        {now}
        names={result.names ?? undefined}
        {selected}
        arrived={cardsArrived}
        {decl}
        more={cursor !== null && loaded < DOM_CAP}
        {receiptFor}
        {openCardMenu}
      />
    {:else if view === 'table'}
      <ListTable
        register={id}
        {decl}
        {columns}
        rows={arrived.size === 0 ? rows : rows.map((r) => (arrived.has(r.key) ? { ...r, arrived: true } : r))}
        total={rowCount}
        {sort}
        {now}
        whole={wholeColumns}
        pickable={siftable}
        {selected}
        {selectedKeys}
        bind:focus
        {editing}
        bind:editValue
        bind:editTicked
        {fresh}
        names={result.names ?? undefined}
        onmore={cursor === null ? undefined : more}
        onsort={result.entries.length < 2 ? undefined : sortBy}
        onactivate={(row) => goto(at(`/r/${id}/${row.key.split('#')[1]}`))}
        {rowAt}
        {fieldOf}
        {editableHere}
        {shownValue}
        {listCurrency}
        {receiptFor}
        {toggleSelect}
        {selectAll}
        {openEditor}
        {commitEdit}
        {cancelEdit}
        {leftTheRow}
        {cellKeys}
        archive={changes ? archive : undefined}
        {openCardMenu}
      />
    {:else}
      <!-- THE BOARD AND THE CARDS: the same rows as cards on the board, in lanes or in one grid. A card moves lanes by
           being dragged, through the same `setRowState` its menu's "Set to" presses. -->
      <ListBoard
        register={id}
        {decl}
        mode={view === 'board' ? 'board' : 'cards'}
        entries={result.entries.slice(0, DOM_CAP)}
        {now}
        names={result.names ?? undefined}
        {selected}
        cursor={result.entries[focus.row]?.seq ?? null}
        {fresh}
        {arrived}
        more={cursor !== null && loaded < DOM_CAP}
        {receiptFor}
        {openCardMenu}
        lane={lane?.id}
        setRowState={changes && lane ? moveOnBoard : undefined}
      />
    {/if}

    <!--
      ONE CAP LINE, FOR WHICHEVER BODY IS DRAWING. It belongs to the LIST rather than to a body, and it reads the one
      number that is always the answer's size: `Table`'s own `total` is `aria-rowcount`, which is `-1` while a filtered
      list is still paging, so a line drawn from it vanished in exactly the state it was written for. A sorted list the
      record stopped says so the same way.
    -->
    {#if loaded >= DOM_CAP || truncated}
      <CapLine shown={drawn} total={result.matched} />
    {:else if cursor !== null && drawn < result.matched}
      <p class="cap-line" role="status">{shownSaid(drawn, result.matched)}</p>
    {/if}
    </div>
  {/snippet}

  <!-- The open row: the docked panel every declared page opens, with the list still visible beside it, and the menu
       its More opens. `?row=7` is which row. -->
  <RowPanel host={host.host} />
  <RowVerbMenu host={host.host} reread={rereadRows} />

  <!-- Put this filter on a page as a block. `⌥B`, and it was a toast until now.

       `predicate` is written into a declaration and `says` is read by a person, so they are the same
       filter in two spellings — `direction is owed_to_me` and "direction is owed to me". This handed
       the machine's to both. -->
  <BindBlock
    bind:open={bindOpen}
    register={id}
    predicate={whereOf(filters, join) || q || copy.everything}
    says={saidPlainly(id, whereOf(filters, join)) || (q ? `matching “${q}”` : copy.everything)}
  />

  <!-- Display options: what YOU see, never what the record says. `v`, and Display in the bar. -->
  <DisplayMenu
    bind:open={displayOpen}
    register={id}
    {decl}
    {sortable}
    canSort={result.entries.length > 1}
    {sort}
    {hidden}
    {sortBy}
    {unsort}
    lateFirst={lateOwn}
    {hide}
    {showAll}
    board={view === 'board'}
    {lanes}
    lane={lane?.id}
    {setLane}
    {kept}
    {isDefault}
    keep={keepDefault}
    forget={forgetDefault}
  />

  <!-- One row's verbs: `⇧F10`, the context-menu key, and the ⋯ on a grid row or a card. -->
  <ListRowMenu
    open={menuOpen}
    rect={menuAt}
    row={menuRow}
    register={id}
    {decl}
    states={changes ? states : []}
    {selected}
    {rowAt}
    {saidInLine}
    onclose={() => (menuAt = null)}
    {setRowState}
    peek={(seq) => void (keeps(seq) || host.open(seq))}
    {toggleSelect}
    {copyId}
    {copyLink}
    archive={changes ? archive : undefined}
    keepPrivate={changes ? setRowPrivate : undefined}
    onhanded={landRow}
    share={shares ? shareRow : undefined}
  />
  <!-- ONE SHEET FOR A ROW'S "Share" AND THE VIEW'S, opened on whichever was pressed. -->
  {#if sharing}<ShareLazy bind:open={sharingOpen} subject={sharing} />{/if}

  <!-- The new-row drawer, every declared field in front of the reader. `n`, and New in the head. -->
  {#if adds}
    <FieldAdd
      bind:open={createOpen}
      register={id}
      one={decl.one}
      bind:problems
      bind:taken
      {writing}
      refused={addRefused}
      {addTypedRow}
      {closeCreate}
      values={createValues}
    />
  {/if}

{/if}

<style>
  /* EVERY OTHER RULE THIS SCREEN DRAWS IS IN THE PART THAT DRAWS ITS MARKUP (`parts/`), because a
     `<style>` block styles only what its own file writes. What is left here is the page's frame. */

  /* THE ROOM THE DOCKED PANEL TAKES, less the gutter the head and the list already keep at their end, so the list's
     edge stands 12 from the panel. It moves with the panel's own slide, over `--d-panel` on the sheet curve. */
  .list-screen {
    padding-inline-end: max(0px, calc(var(--dock-w) - var(--gutter)));
    transition: padding-inline-end var(--d-panel) var(--ease-sheet);
  }

  /* THE BOARD UNDER THE HEAD: the figures' tiles, the list's tile and, on the board and cards views, the cards, 12
     apart. The page is as wide as the window; the gutter keeps it off the edges. */
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--tile-gap);
    padding: var(--sp-2) var(--gutter) var(--sp-9);
  }

  /* THE LIST'S TILE: its toolbar, the capture line and the rows, a step apart rather than a section apart, so they
     read as one block. */
  .page :global(.list-tile) {
    gap: var(--sp-3);
  }

  /* THE TOOLBAR, ONE ROW: the search and the filters from the start, and how the list is drawn at the end. It wraps
     rather than running past a narrow tile. */
  .list-tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .list-tools > :global(.bar) {
    flex: 1 1 auto;
    min-inline-size: 0;
  }

  .list-views {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--sp-2);
    margin-inline-start: auto;
  }

  /* A NAME FOR A SCREEN READER AND NOTHING ON SCREEN: the "⋯" buttons' words. */
  .sr-only {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* THE TOOLBAR'S "⋯": a 36px square in the quiet fill, the toolbar's height, its glyph in the second ink. */
  .tool-more {
    display: inline-grid;
    place-items: center;
    inline-size: 36px;
    block-size: 36px;
    background: var(--tile-2);
    border-radius: var(--r-ctl);
    color: var(--ink-2);
    transition: background var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    :global(.menu-trigger):hover > .tool-more {
      background: var(--hover);
      color: var(--ink);
    }
  }

  @media (pointer: coarse) {
    .tool-more {
      inline-size: var(--tap);
      block-size: var(--tap);
    }
  }

  .tool-add {
    display: contents;
  }

  /* BELOW 640 THE HEAD HOLDS THE "+" AND THE "⋯", so the toolbar's end is not drawn: the bar is search and Filter. */
  @media (width < 640px) {
    .list-views {
      display: none;
    }
  }

  /* THE KEY IS PRINTED WHEN ASKED FOR: `n` on New shows under the pointer or with keyboard focus. */
  .new-row :global(.btn:not(:hover, :focus-visible) > .btn-kbd) {
    display: none;
  }

  /* THE ROOM STAYS AND THE WORDS GO: hidden, not removed, so the line keeps its height (`foundRoom`). */
  .found-here .unsaid {
    visibility: hidden;
  }

  /* A DIM NOTE, WITH ITS ONE CONTROL BESIDE IT. It wraps, because at 320px a word and a button on one line is the button
     leaving the window. */
  .stale {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-3);
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  /* WHY THE FILTERS HAVE NO NUMBERS, one plain line at the body size under the bar. */
  .uncounted {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 1.4;
    overflow-wrap: anywhere;
  }

  /* THE LINE THAT SAYS THE LIST IS OF THE PEOPLE HELD TWICE: the sentence in ink, its way out at the end, wrapping under
     it on a phone. The button is the shared one, which keeps its own height on a coarse pointer. */
  .held-twice {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px 16px;
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: 1.4;
  }

  /* THE LINE'S BUTTONS, kept together at its end and wrapping as one under the sentence on a phone. */
  .held-acts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  /* NOBODY IS HELD TWICE: one plain sentence where the people would be. */
  .held-none {
    margin: 0;
    padding: 24px 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
  }

  /* WHY THERE IS NO CAPTURE LINE, one dim sentence where the line would stand. */
  .reach {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  /* THE HEAD'S NEW BUTTON, drawn only on the arrival, where neither the line that adds a row nor the "+" is. */
  .new-row {
    display: contents;
  }

  @media (width < 640px) {
    /* THE PHONE'S BOARD: one column, 12 from the edges, and the list's tile a step tighter inside. */
    .page {
      padding: var(--sp-2) var(--sp-3) var(--sp-8);
    }

    .page :global(.list-tile) {
      padding: var(--sp-3);
    }
  }

  @media (640px <= width < 900px) {
    .page {
      padding-block-end: var(--sp-8);
    }
  }

  /* THE PHONE'S PICKED STRIP SITS OVER THE FOOT OF THE LIST, so the list keeps 72px under its last row while it shows. */
  @media (width < 640px) {
    .page[data-picking] {
      padding-block-end: calc(var(--sp-8) + 72px);
    }
  }
</style>
