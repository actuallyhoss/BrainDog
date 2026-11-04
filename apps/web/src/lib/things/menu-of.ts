/**
 * EACH KIND OF THING'S MENU, ONCE. What a project, a row, a list, a page, a question, a run or a rule offers, keyed by the
 * thing (`thing.ts`), so a right-click on anything that stands for it, wherever it is drawn, has the same items as its
 * page's "…". Nothing here needs that page loaded: what a menu has to know (the row's state, the list's fields, the page's
 * layout) is read as it opens, and a read that fails says so in the menu rather than offering what might be wrong.
 *
 * A VERB THAT WORKS ON THE PAGE as drawn goes there and asks it (`askPage`). A verb that writes goes through the record's
 * own writer, and says what it did with the way back, as its page's does. A verb the person may not use is left out, by the
 * same questions the page asks (`may`, `canShare`, `owner`).
 */

import { apiBase } from '../at.ts';
import { copy } from '../copy.ts';
import { changeWords } from '../record/slash.ts';
import { words as pageWords } from '../page/words.ts';
import { isPinned } from '../page/look.ts';
import { isProject, opensOnPage } from '../record/project.ts';
import { may } from '../record/may.ts';
import { ownsRecord, type Me } from '../../routes/settings/levels.ts';
import { REGISTERS } from '../record/held.ts';
import { learn } from '../record/remote.ts';
import { rowReader } from '../record/row-live.ts';
import { rowScreen, saidRowPages } from '../record/row-href.ts';
import { rowWriter, inverseOf } from '../record/rows-write.ts';
import { keepPrivate } from '../record/privacy-write.ts';
import { display } from '../record/api.ts';
import { valueSaid } from '../voice.ts';
import type { Shell } from '../record/boot-live.ts';
import type { Entry, RegisterDecl } from '../record/schema.ts';
import { navPrefs } from '../nav-prefs.svelte.ts';
import { isPinnedAt, pinHref, pinWords, togglePin } from '../shell/pin-project.ts';
import { putHref, putSpoken } from '../clipboard.ts';
import { canShare } from '../sharing/may-share.ts';
import { seeingAs } from '../sharing/see-as.svelte.ts';
import { openSheet } from '../send/open.ts';
import { refs, sendWords } from '../send/send.ts';
import { addonActions, runAddon } from '../market/addon-actions.ts';
import { pageBoards } from '../page/page-boards.svelte.ts';
import { handFor } from '../record/hand.ts';
import { sheetWords } from '../record/field-words.ts';
import { toasts } from '../ui/toast.svelte.ts';
import type { IconName } from '../ui/icons.ts';
import { createClient } from '@braindog/client';
import { editWords, openAutomations } from '../flow/source.ts';
import { live } from '../data/live.svelte.ts';
import { askPage } from './page-verbs.ts';
import { askSheet } from './asks.svelte.ts';
import { dotOf } from './state-dot.ts';
import { thingOf, type Thing } from './thing.ts';
import { VERB_ICONS, linkWords, thingWords, type VerbId } from './verbs.ts';

export type ThingItem = {
  /** Unique in its menu, and what a caller leaves out by (`omit`). */
  id: string;
  label: string;
  icon: IconName;
  /** Which group of the menu, drawn in order with a hairline between. */
  group: number;
  href?: string | undefined;
  newTab?: boolean | undefined;
  run?: (() => void) | undefined;
  tone?: 'bad' | undefined;
  /** A dot in the state's tone, in the glyph's slot, for a state. */
  state?: string | undefined;
  /** The one it is in now: drawn ticked, and pressing it does nothing. */
  now?: boolean | undefined;
  /** Says who it belongs to at the row's end ("Reading" for an add-on's). */
  from?: string | undefined;
  /** Hidden when the menu already leads with its link's three. */
  linkVerb?: boolean | undefined;
};

/** Where the press was, for what only makes sense there. */
export type ThingFrom = { sidebar: boolean; wide: boolean; oneWindow: boolean; pathname: string };

const G = { link: 0, keep: 1, change: 2, who: 3, page: 4, more: 5, sidebar: 6, going: 9 } as const;

const item = (id: string, verb: VerbId, label: string, group: number, what: { href?: string; run?: () => void; tone?: 'bad'; icon?: IconName } = {}): ThingItem => ({
  id,
  label,
  icon: what.icon ?? VERB_ICONS[verb],
  group,
  ...(what.href === undefined ? {} : { href: what.href }),
  ...(what.run === undefined ? {} : { run: what.run }),
  ...(what.tone === undefined ? {} : { tone: what.tone }),
});

/** The link's own three, what the browser's menu would have given. */
export function linkItems(href: string, from: ThingFrom): ThingItem[] {
  const here = from.pathname === href.split('?')[0];
  return [
    ...(here ? [] : [{ ...item('open', 'open', linkWords.open, G.link, { href }), linkVerb: true }]),
    ...(from.oneWindow ? [] : [{ ...item('newTab', 'newTab', linkWords.newTab, G.link, { href }), newTab: true, linkVerb: true }]),
    { ...item('copyLink', 'copyLink', linkWords.copyLink, G.link, { run: () => void putHref(href) }), linkVerb: true },
  ];
}

const client = () => createClient({ base: apiBase() });
const asked = new Map<string, Promise<void>>();

/** A list's declaration, read if this tab has not yet. */
async function declOf(list: string): Promise<RegisterDecl | undefined> {
  if (REGISTERS[list] === undefined) await learn(client().schema, list, asked).catch(() => undefined);
  return REGISTERS[list] as RegisterDecl | undefined;
}

/**
 * WHAT A ROW OFFERS, by what it is and who is asking. The row's own page draws its "…" from this list and the shell's menu
 * draws every link to the row from it, so the two cannot drift.
 */
export type RowFacts = { list: string; decl: RegisterDecl; changes: boolean; archived: boolean; mine: boolean; sharable: boolean; live: boolean };
export type RowVerb = 'rename' | 'hand' | 'copyLink' | 'share' | 'private' | 'merge' | 'archive';
export const rowVerbs = (f: RowFacts): readonly RowVerb[] => [
  ...(f.changes && !f.archived ? (['rename'] as const) : []),
  ...(f.changes && !f.archived && handFor(f.decl) !== null ? (['hand'] as const) : []),
  'copyLink' as const,
  ...(f.live && !f.archived && f.sharable ? (['share'] as const) : []),
  ...(f.mine && !f.archived ? (['private'] as const) : []),
  ...(f.changes && !f.archived && f.decl.meets !== undefined ? (['merge'] as const) : []),
  ...(f.changes && !f.archived ? (['archive'] as const) : []),
];

/* The row's words for the state's field, as the list's own row menu says it. */
function rowName(list: string, decl: RegisterDecl, row: Entry): string {
  return display(list, decl.title, row.fields[decl.title]) ?? `${decl.one} ${row.seq}`;
}

/** Read one row and draw what it offers. Throws when the record does not answer. */
async function rowItems(list: string, seq: number, shell: Shell): Promise<ThingItem[]> {
  const decl = await declOf(list);
  if (!decl) throw new Error('no list');
  const got = await rowReader(apiBase()).read(list, seq);
  if (got.from !== 'live' || !got.entry) throw new Error('no row');
  const row = got.entry;
  const name = rowName(list, decl, row);
  const write = rowWriter(apiBase());
  const facts: RowFacts = {
    list,
    decl,
    changes: may(shell, 'write', list),
    archived: (row as { deleted_at?: unknown }).deleted_at != null,
    mine: row.mine === true,
    sharable: seeingAs() === null && canShare(shell.me),
    live: true,
  };
  const verbs = rowVerbs(facts);
  const out: ThingItem[] = [];
  const key = `${list}#${seq}`;
  if (seq && !facts.archived) out.push(item('send', 'send', sendWords.sheet, G.keep, { run: () => void openSheet({ kind: list, attach: [{ ref: key, label: name }] }) }));
  if (verbs.includes('rename'))
    out.push(
      item('rename', 'rename', thingWords.rename, G.change, {
        run: () =>
          askSheet({
            kind: 'rename',
            title: thingWords.renameThis(decl.one),
            label: thingWords.nameField,
            value: String(row.fields[decl.title] ?? ''),
            save: async (value) => {
              const wrote = await write.update(list, seq, { [decl.title]: value }, row.version);
              return wrote.ok ? null : wrote.fix;
            },
          }),
      }),
    );
  /* ITS STATES, THE LIST'S OWN, the one it is in ticked. A list's state is what a person moves a row between. */
  const field = decl.state ? decl.fields.find((f) => f.id === decl.state) : undefined;
  if (facts.changes && !facts.archived && field && (field.values?.length ?? 0) > 0) {
    const now = String(row.fields[field.id] ?? '');
    for (const v of field.values ?? []) {
      const word = valueSaid(field as Parameters<typeof valueSaid>[0], v);
      out.push({
        ...item(`state:${v}`, 'state', v === now ? `${field.label ?? field.id.charAt(0).toUpperCase() + field.id.slice(1)}: ${word}` : copy.setTo(word), G.change, {
          run: () => {
            if (v === now) return;
            void write.update(list, seq, { [field.id]: v }, row.version).then((wrote) => {
              if (!wrote.ok) return void toasts.push(wrote.fix, { intent: 'warn' });
              const back = inverseOf(row, { [field.id]: v }, decl);
              toasts.push(word, { undo: () => void write.update(list, seq, back) });
            });
          },
        }),
        state: dotOf(decl, v),
        now: v === now,
      });
    }
  }
  if (verbs.includes('hand')) out.push(item('hand', 'hand', copy.handTo, G.who, { run: () => askSheet({ kind: 'hand', register: list, row, decl }) }));
  if (verbs.includes('share')) out.push(item('share', 'share', copy.shareOpen, G.who, { run: () => askSheet({ kind: 'share', subject: { kind: 'row', list, seq, id: row.id ?? null, name } }) }));
  if (verbs.includes('private')) {
    const on = row.private === true;
    out.push(
      item('private', 'private', on ? copy.rowShareAgain : copy.rowKeepPrivate, G.who, {
        run: () =>
          void keepPrivate(apiBase(), key, !on).then((kept) => {
            if (!kept.ok) toasts.push(kept.fix, { intent: 'warn' });
          }),
      }),
    );
  }
  if (verbs.includes('merge'))
    out.push(item('merge', 'merge', copy.mergeWith, G.who, { run: () => askSheet({ kind: 'merge', register: list, seq, name: String(row.fields[decl.title] ?? ''), title: decl.title, mergedInto: decl.meets?.merged_into }) }));
  if (row.id && !facts.archived) {
    const actions = await addonActions().catch(() => ({ row_actions: [] as Awaited<ReturnType<typeof addonActions>>['row_actions'] }));
    for (const a of actions.row_actions.filter((x) => x.list === list)) {
      out.push({
        ...item(`addon:${a.addon}:${a.script}`, 'addon', a.title, G.more, {
          run: () =>
            void runAddon({ addon: a.addon, action: a.script, row: row.id! }).then((ran) => toasts.push(ran.say, ran.ok ? {} : { intent: 'warn' })),
        }),
        from: a.addon_title,
      });
    }
  }
  out.push(item('copyId', 'copy', copy.copyId, G.more, { run: () => void putSpoken(list, seq) }));
  if (verbs.includes('archive'))
    out.push(
      item('archive', 'archive', copy.rowArchive, G.going, {
        tone: 'bad',
        run: () =>
          void write.archive(list, seq, row.version).then((wrote) => {
            if (!wrote.ok) return void toasts.push(wrote.fix, { intent: 'warn' });
            toasts.push(copy.writeArchived(name), { undo: () => void write.restore(list, seq) });
          }),
      }),
    );
  return out;
}

/** The page's own verbs: the same as `ChangePage.svelte` draws, asked of the page. */
function pageItems(href: string, shell: Shell, from: ThingFrom, look: unknown, home = false): ThingItem[] {
  const owner = shell.me?.owner === true;
  const out: ThingItem[] = [];
  if (shell.me?.owner !== false) out.push(item('change', 'ask', changeWords.change, G.page, { run: () => askPage(href, 'change') }));
  /* A HOME THE RECORD BUILDS HOLDS NO DECLARATION YET: no layout to keep, nothing to read the build of, as its "…" says. */
  if (owner && !home) {
    const held = isPinned(look as Parameters<typeof isPinned>[0]);
    out.push(item('keepLayout', 'keepLayout', held ? pageWords.unpin : pageWords.pin, G.page, { run: () => askPage(href, 'keepLayout'), icon: held ? 'lock-open' : 'lock' }));
  }
  if (!home) out.push(item('source', 'source', copy.pageSource, G.page, { href: `${href.split('?')[0]}?src=1` }));
  if (shell.me?.owner !== false && from.wide) out.push(item('arrange', 'layout', copy.arrange, G.page, { run: () => askPage(href, 'arrange') }));
  return out;
}

/** Where a page is about a row, which row. */
function aboutOf(slug: string): { list: string; seq: number } | null {
  const p = saidRowPages().pages.find((x) => x.slug === slug);
  if (p?.about && typeof p.about.seq === 'number') return { list: p.about.register, seq: p.about.seq };
  const spoken = /^([a-z][a-z0-9_]*)#([1-9]\d*)$/u.exec(slug);
  return spoken ? { list: spoken[1]!, seq: Number(spoken[2]) } : null;
}

/** A page as the record answers it, as far as a menu reads it. */
type PageBody = { look?: unknown; page?: string; pack?: unknown; requires?: readonly string[]; nav?: { section?: string | null } | null };

/* A PAGE'S READ IS THE RECORD'S WHOLE ANSWER FOR IT, so it is asked once for each version of the record: a person going down a list
   of links with the right button does not ask for each again. */
const bodies = new Map<string, { at: number | null; body: Promise<PageBody | null> }>();
function pageBody(slug: string): Promise<PageBody | null> {
  const had = bodies.get(slug);
  if (had && had.at === live.version) return had.body;
  const body = client()
    .page(slug)
    .then((read) => (read.ok ? (read.value as PageBody) : null))
    .catch(() => null);
  bodies.set(slug, { at: live.version, body });
  return body;
}

/** What a page of money offers: where a statement comes in, and what its figures are counted in. */
function moneyItems(t: Extract<Thing, { kind: 'page' }>, shell: Shell, body: PageBody | null): ThingItem[] {
  if (!body) return [];
  const out: ThingItem[] = [];
  const drawsLedger = (body.requires ?? []).includes('register.transactions');
  if (drawsLedger && may(shell, 'append', 'transactions')) out.push(item('statement', 'add', thingWords.statement, G.page, { href: '/add/statement', icon: 'upload' }));
  const money = body.nav?.section?.toLowerCase() === 'money' || /^money(-|$)/u.test(body.page ?? '') || body.pack === 'money-core';
  const currency = shell.index?.currency ?? null;
  if (money && shell.me?.owner === true) out.push(item('currency', 'money', currency ? `Counted in ${currency}` : 'Money’s currency', G.page, { run: () => askPage(t.href, 'currency') }));
  return out;
}

/** A project's page, or the row of a list whose rows have one: its own verbs and its row's. */
async function pageThing(t: Extract<Thing, { kind: 'page' }>, shell: Shell, from: ThingFrom): Promise<ThingItem[]> {
  const about = aboutOf(t.slug);
  const out: ThingItem[] = [];
  const body = await pageBody(t.slug);
  if (about) {
    const decl = await declOf(about.list);
    const project = decl !== undefined && isProject(decl);
    const row = await rowItems(about.list, about.seq, shell);
    const name = (saidRowPages().pages.find((x) => x.slug === t.slug) as { title?: string } | undefined)?.title ?? t.slug;
    if (project) {
      const on = isPinnedAt(pinHref(t.slug), `${about.list}#${about.seq}`);
      out.push(item('pin', 'pin', on ? pinWords.unpin : pinWords.pin, G.keep, { run: () => void togglePin(pinHref(t.slug), name, `${about.list}#${about.seq}`) }));
    }
    out.push(item('details', 'edit', project ? thingWords.details : pageWords.showData, G.change, { href: rowScreen(about.list, about.seq) }));
    out.push(...row);
    out.push(...moneyItems(t, shell, body));
    out.push(...pageItems(t.href, shell, from, body?.look ?? null));
    if (project && shell.me?.owner === true) {
      const on = pageBoards.of(t.slug) !== null;
      out.push(item('board', on ? 'fields' : 'board', on ? thingWords.boardOff : thingWords.boardOn, G.page, { run: () => askPage(t.href, 'board') }));
    }
    return out;
  }
  out.push(...moneyItems(t, shell, body));
  out.push(...pageItems(t.href, shell, from, body?.look ?? null));
  if (t.slug === 'money' && shell.me?.owner === true) {
    const on = pageBoards.of(t.slug) !== null;
    out.push(item('board', on ? 'fields' : 'board', on ? thingWords.boardOff : thingWords.boardOn, G.page, { run: () => askPage(t.href, 'board') }));
  }
  if (body?.requires?.includes('register.people') && may(shell, 'append', 'people'))
    out.push(item('contacts', 'add', thingWords.contacts, G.page, { href: '/add/contacts', icon: 'upload' }));
  return out;
}

/** A list: what its head's "…" offers, asked of its page. */
async function listThing(t: Extract<Thing, { kind: 'list' }>, shell: Shell): Promise<ThingItem[]> {
  const decl = await declOf(t.list);
  if (!decl) throw new Error('no list');
  const me = shell.me as (Me & { owner?: boolean }) | undefined;
  const owner = me ? ownsRecord(me) : false;
  const madeByAgents = t.list === 'session';
  const adds = !madeByAgents && may(shell, 'append', t.list);
  const shares = seeingAs() === null && canShare(shell.me);
  const proposes = owner || may(shell, 'append');
  const out: ThingItem[] = [item('display', 'display', copy.display, G.page, { run: () => askPage(t.href, 'display') })];
  if (adds) out.push(item('whole', 'add', thingWords.whole, G.page, { run: () => askPage(t.href, 'whole') }));
  if (shares) out.push(item('share', 'share', copy.shareSheetTitle(decl.name), G.who, { run: () => askPage(t.href, 'share') }));
  if (proposes) out.push(item('fields', 'fields', sheetWords.open, G.page, { run: () => askPage(t.href, 'fields') }));
  if (owner && t.list !== 'keys') out.push(item('rename', 'rename', thingWords.renameList, G.change, { run: () => askPage(t.href, 'rename') }));
  return out;
}

/** The sidebar's own, on a row of it: the person's arrangement, as Settings › Navigation and the palette change it. */
function sidebarItems(href: string): ThingItem[] {
  const path = href.split('?')[0]!;
  if (path === '/settings') return [item('customise', 'settings', thingWords.customise, G.sidebar, { href: '/settings/navigation' })];
  const home = navPrefs.home === path;
  return [
    item('hide', 'hide', thingWords.hide, G.sidebar, {
      run: () => {
        const name = navPrefs.labelOf(path, path);
        void navPrefs.hide(path).then((out) => {
          if (out.from === 'refused') return void toasts.push(out.fix, { intent: 'warn' });
          toasts.push(thingWords.hidden(name), { undo: () => void navPrefs.show(path) });
        });
      },
    }),
    item('home', 'open', home ? thingWords.startHereOff : thingWords.startHere, G.sidebar, { icon: 'home', run: () => void navPrefs.setHome(home ? null : path) }),
    item('customise', 'settings', thingWords.customise, G.sidebar, { href: '/settings/navigation' }),
  ];
}

/** Whether a thing needs a read before its menu can be drawn. */
export const needsRead = (t: Thing): boolean => t.kind === 'row' || t.kind === 'page' || t.kind === 'list' || t.kind === 'question' || t.kind === 'automation';

/**
 * THE MENU OF AN ADDRESS: everything past its link's three. Rejects when a read it needs is not answered, and the menu says
 * that plainly and keeps the three, which need nothing.
 */
export async function itemsOf(address: string, shell: Shell, from: ThingFrom, name = ''): Promise<ThingItem[]> {
  const t = thingOf(address);
  let out: ThingItem[] = [];
  switch (t.kind) {
    case 'row': {
      const decl = await declOf(t.list);
      /* A ROW WHOSE LIST MAKES IT A PAGE (a project) IS READ AS THAT PAGE, wherever a link to its row is drawn. */
      const said = saidRowPages();
      const own = said.pages.find((p) => p.about?.register === t.list && p.about?.seq === t.seq)?.slug ?? (said.byRow.includes(t.list) ? `${t.list}#${t.seq}` : null);
      if (own !== null && decl && (t.list === 'session' || opensOnPage(decl) || isProject(decl)) && !t.href.includes('fields=')) out = await pageThing({ kind: 'page', href: `/p/${encodeURIComponent(own)}`, slug: own }, shell, from);
      else out = await rowItems(t.list, t.seq, shell);
      break;
    }
    case 'page':
      out = await pageThing(t, shell, from);
      break;
    case 'list':
      out = await listThing(t, shell);
      break;
    case 'home':
      out = pageItems('/', shell, from, null, true);
      break;
    case 'decide':
      out = [
        ...(shell.me?.owner !== false ? [item('ask', 'ask', thingWords.ask, G.page, { run: () => askPage('/decide', 'ask') }), item('select', 'select', copy.select, G.page, { run: () => askPage('/decide', 'select') })] : []),
        ...pageItems('/decide', shell, from, null, true),
      ];
      break;
    case 'automation': {
      const opened = await openAutomations((url, init) => fetch(url, init), apiBase(), {});
      const rule = opened.first.ok ? opened.first.value.find((r) => r.id === t.id) : null;
      if (!rule) throw new Error('no rule');
      const owns = shell.me?.owner === true;
      out = [
        item('rename', 'rename', editWords.rename, G.change, { run: () => askPage(t.href, 'rename') }),
        ...(owns ? [item('toggle', rule.enabled ? 'stop' : 'run', rule.enabled ? editWords.turnOff : editWords.turnOn, G.change, { icon: rule.enabled ? 'pause' : 'play', run: () => askPage(t.href, 'toggle') })] : []),
        item('duplicate', 'copy', editWords.duplicate, G.more, { href: `/automations/new?${new URLSearchParams({ from: rule.id }).toString()}` }),
        ...(owns ? [item('remove', 'delete', editWords.remove, G.going, { tone: 'bad', run: () => askPage(t.href, 'remove') })] : []),
      ];
      break;
    }
    case 'place': {
      /* THE PLACES WITH A "…" OF THEIR OWN. Settings' index, for who may arrange it. */
      if (t.href === '/settings' && shell.me?.owner === true) out = [item('reorder', 'move', thingWords.reorder, G.page, { icon: 'edit', run: () => askPage('/settings', 'reorder') })];
      break;
    }
    case 'question':
      out = [item('send', 'send', sendWords.sheet, G.keep, { run: () => void openSheet({ kind: 'decide', attach: [{ ref: refs.question(t.id), label: name || t.id }] }) })];
      break;
    case 'run':
      out = [item('send', 'send', sendWords.sheet, G.keep, { run: () => void openSheet({ kind: 'run', attach: [{ ref: refs.run(t.id), label: name || t.id }] }) })];
      break;
    default:
      break;
  }
  if (from.sidebar) out = [...out, ...sidebarItems(t.href)];
  return out;
}

