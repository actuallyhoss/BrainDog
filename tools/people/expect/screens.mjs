/**
 * The first screens of one walk, drawn and read into the snapshots `first-screen.mjs` judges (audit 71, finding 8).
 * `first-run.mjs` hands its `shot` the record at two moments, just kept and just told; this draws each as the app's
 * shell would at 1440: the rail (`Sidebar.svelte`, fed as `routes/+layout.svelte` feeds it) and Today inside `main`
 * (the head and the body, `PageHead.svelte` and `PageView.svelte`, fed as `Home.svelte` feeds them), and as a phone
 * would at 390: the same Today over the tab bar (`shell/TabBar.svelte`).
 *
 * THREE SCREENS A MOMENT. Today, where the rail's lists are folded as they are at rest, so the rail is its places and
 * the Pages heading. The first list's own screen, rail only, where the rail opens its lists, so each list in it can be
 * held against how much it holds. And Today on a phone, where the first places are the tabs under it.
 *
 * BESIDE THE MARKUP each screen carries what the record holds behind it, read from the host and not from the screen:
 * the lists (`counts`), what each row of the rail stands on (`behind`), and how many vital signs read red (`signs`).
 *
 * WHAT IS NOT DRAWN, and so not judged here. Today's card for one real thing and its next steps: `Home.svelte` decides
 * them in effects, and `first-run.mjs` step 6 judges them by Home's own readers. The model's line over the head. What
 * waits (`waits`), which the poll feeds. The phone's More sheet, which is opened by a press and is written inside the
 * shell itself. And nothing was measured: 1440 and 390 are the shapes drawn (the rail, the tab bar), not widths
 * anything was laid out at.
 */

import { hooks, markupOf } from './draw.mjs';
import { readMarkup } from './markup.mjs';

const web = (path) => import(new URL(`../../../apps/web/src/${path}`, import.meta.url).href);

/** The widths whose shapes are drawn here: the rail beside the page, and the phone's tab bar under it. */
export const WIDTH = 1440;
export const PHONE = 390;

/** The rail's props, read off the shell as `routes/+layout.svelte` reads them for a reader who has arranged nothing. */
async function railProps(shell) {
  const [{ arrange, flatNav, WORK }, { railOf }, { spineOf }, { navPrefs }, { said }, { copy }, { TASKS }] = await Promise.all([
    web('lib/nav.ts'),
    web('lib/nav/rail.ts'),
    web('lib/spine.ts'),
    web('lib/nav-prefs.svelte.ts'),
    web('lib/voice.svelte.ts'),
    web('lib/copy.ts'),
    web('lib/work/list.ts'),
  ]);
  const placed = new Set(shell.index.registers.flatMap((r) => (r.views ?? []).map((v) => v.href)));
  const railNav = navPrefs.relabel(shell.nav.filter((n) => !n.cut && !placed.has(n.href)));
  const grouped = arrange(railNav.filter((e) => !navPrefs.hidden.includes(e.href)), navPrefs.order);
  const holdsTasks = shell.index.registers.some((r) => r.id === TASKS && r.count > 0);
  const flat = flatNav(grouped, shell.open, { today: copy.today, activity: copy.audit, decide: said('decide') }, { work: holdsTasks ? WORK : null });
  const rail = railOf(flat, said('decide'));
  return {
    places: rail.places,
    things: rail.things,
    more: rail.more,
    views: rail.views,
    hidden: railNav.filter((e) => navPrefs.hidden.includes(e.href)).length,
    pen: shell.pen,
    record: shell.index.name,
    registers: shell.index.registers,
    spine: spineOf(shell.counts ? { ...shell.counts, decide: shell.open, inbox: shell.inbox } : { decide: shell.open, inbox: shell.inbox }),
    inbox: shell.inbox,
    working: shell.working ?? [],
  };
}

/** Today's head and body, as `Home.svelte` reads them for a record with no page of its own for Today. */
async function todayMarkup({ t, base }, shell, path) {
  const [{ learn }, { holdsOf, voiceOf, weekHeld }, { homeDrawn, todayHome }, { drawnOf }, { said }, { words }, { VOICE_LINES }, { copy }] = await Promise.all([
    web('lib/record/remote.ts'),
    web('lib/page/home-arrange.ts'),
    web('lib/home/default-home.ts'),
    web('routes/decide/[id]/proposed.ts'),
    web('lib/voice.svelte.ts'),
    web('lib/home/words.ts'),
    web('lib/voice.ts'),
    web('lib/copy.ts'),
  ]);
  /* The name and the calm line, by Home's own two rules: the voice's word where a use case says one, else Home's. */
  const voiced = (key, plain) => (said(key) !== VOICE_LINES[key] ? said(key) : plain);
  const asked = new Map();
  await Promise.all(shell.lists.map((l) => learn(t.client(base).schema, l.id, asked)));
  const week = await weekHeld(shell);
  const holds = holdsOf(shell, undefined, week);
  const voice = voiceOf(said);
  const body = todayHome(holds, voice);
  const drawn = await drawnOf(body, base, t.io);
  const signs = await signsOf({ t, base }, shell, body);
  if (drawn.from !== 'live') return { markup: '', signs, why: drawn.from === 'refused' ? `Today was refused: ${drawn.fix}` : 'the host did not draw Today' };
  const shaped = homeDrawn(drawn.blocks, drawn.now, voice, holds.one, null, week);
  const at = { data: shell, path };
  const head = await markupOf('lib/ui/PageHead.svelte', { title: voiced('home', copy.today), icon: 'today', sentence: shaped.sentence?.text ?? shaped.lead ?? voiced('nothing_needs_you', words.nothingNow) }, at);
  const got = { from: 'live', page: { page: { page: body.page, title: body.title, layout: body.layout }, blocks: shaped.blocks }, now: drawn.now };
  const view = await markupOf('lib/page/PageView.svelte', { slug: 'today', got, mode: 'home', reread: async () => {} }, at);
  return { markup: `${head}${view}`, signs, why: null };
}

/**
 * HOW MANY VITAL SIGNS READ RED, asked of the host by the figure Today's own line is drawn from (`SIGNS_RED`), in a
 * body of one note that is never shown: `signs-line` holds Today's words against it. `null` where the record holds no
 * page its vital signs are shown on, so Today has nothing to open and says nothing; `undefined` where the host did not
 * answer, which the check says as not seen. Read for anybody, whoever owns the record: who is told is the check's.
 */
async function signsOf({ t, base }, shell, body) {
  const [{ SIGNS_PAGE, SIGNS_RED }, { drawnOf }] = await Promise.all([web('lib/home/default-home.ts'), web('routes/decide/[id]/proposed.ts')]);
  if (!(shell.pages ?? []).includes(SIGNS_PAGE)) return null;
  const drawn = await drawnOf({ ...body, blocks: [{ kind: 'note', body: `{{${SIGNS_RED}}}` }] }, base, t.io);
  const n = drawn.from === 'live' ? drawn.blocks[0]?.values?.[SIGNS_RED] : undefined;
  return Number.isFinite(n) ? n : undefined;
}

/** Every list a drawn page's blocks read, by id: a block's own list, the list it adds to and each list it folds in. */
const listsIn = (blocks) => [
  ...new Set(
    (blocks ?? [])
      .flatMap((b) => [typeof b?.source === 'string' && b.source.startsWith('register.') ? b.source.slice('register.'.length) : null, b?.register, ...(Array.isArray(b?.from) ? b.from.map((f) => f?.register) : [])])
      .filter((id) => typeof id === 'string' && id !== ''),
  ),
];

/**
 * The lists one page stands on, as the shell reads them to decide whether the page is in the rail (`waiting` in
 * `lib/record/boot-live.ts`): the ids the record's own answer says the page reads (`lists` on its entry in `boot`),
 * kept to the lists this reader was sent. The record leaves out a list a pack fills on the first day, so rows nobody
 * wrote never count as the person's own, and so they are not counted here either. `null` where the record said
 * nothing of the page's lists (an older host), which is read from the drawn page instead.
 */
export const saidLists = (page, held) => (Array.isArray(page?.lists) ? [...new Set(page.lists.filter((id) => typeof id === 'string' && held.has(id)))] : null);

/**
 * WHAT STANDS BEHIND EACH ROW OF THE RAIL, keyed by where the row goes as the markup writes it: for a list, itself and
 * how much it holds; for a page, every list it reads and how much each holds (a page that reads no list has `{}`
 * behind it, and nothing to be empty). `rail-has-rows` holds the drawn rows against this, so a place is judged on the
 * first minute too, when no list of its name is in the rail.
 *
 * A PAGE'S LISTS ARE THE ONES THE SHELL COUNTS (`saidLists`), each with the count `boot` sent, so the check and the rail
 * read one answer and cannot disagree about a page: Money over seven empty lists and one a pack filled is empty to
 * both. Only where the record says nothing of a page's lists is the page drawn and its blocks read, as before; there a
 * page or a list the host would not read is left out, and the check says it was not seen.
 */
async function behindOf({ t, base, boot }, shell, root) {
  const client = t.client(base);
  const named = new Map((shell.lists ?? []).map((l) => [l.id, l.name]));
  /* THE COUNTS `boot` SENT, which hold every list the reader has, empty or not; the rail's own (`index.registers`) are
     only the lists it draws. */
  const sent = new Map((boot?.registers ?? []).map((r) => [r.id, r]));
  const said = new Map((boot?.pages ?? []).map((p) => [p.slug, saidLists(p, sent)]));
  const held = new Map((shell.index.registers ?? []).map((r) => [r.id, r.count]));
  const holds = async (id) => {
    if (!held.has(id)) {
      const page = await client.list({ register: id, limit: 1 });
      held.set(id, page.ok ? (page.value.rows ?? []).length : undefined);
    }
    return held.get(id);
  };
  const out = {};
  for (const r of shell.index.registers ?? []) out[`${root}/r/${r.id}`] = { [r.name]: r.count };
  for (const n of shell.nav ?? []) {
    const slug = /^\/p\/([^/?#]+)$/u.exec(n.href ?? '')?.[1];
    if (slug === undefined) continue;
    const lists = said.get(slug);
    if (lists) {
      out[`${root}${n.href}`] = Object.fromEntries(lists.map((id) => [sent.get(id).name ?? named.get(id) ?? 'a list with no name', sent.get(id).count]));
      continue;
    }
    const page = await client.page(slug);
    if (!page.ok) continue;
    const reads = {};
    for (const id of listsIn(page.value.blocks)) {
      const count = await holds(id);
      if (count !== undefined) reads[named.get(id) ?? 'a list with no name'] = count;
    }
    out[`${root}${n.href}`] = reads;
  }
  return out;
}

/**
 * The lists as the person reads them, for `counts`, each under its name: the entries themselves where a list holds any
 * (by name, with their tags, so whose they are and whether one is an example can be read), else nought.
 */
async function countsOf({ t, base }, boot) {
  const out = {};
  for (const r of boot.registers ?? []) {
    out[r.name] = r.count;
    if (!(r.count > 0)) continue;
    const page = await t.client(base).list({ register: r.id, limit: 200 });
    /* A list longer than one read is left as its count: half its entries would say less than the number does. */
    if (page.ok && (page.value.rows ?? []).length === r.count) out[r.name] = page.value.rows.map((row) => ({ name: String(row.fields?.name ?? row.fields?.what ?? row.fields?.title ?? ''), tags: [...(row.fields?.tags ?? row.tags ?? [])].map(String) }));
  }
  return out;
}

/**
 * The screens of one moment of the walk (`shot` as `first-run.mjs` hands it): Today with its rail, the first list's
 * screen for its rail, then Today as a phone holds it, over the tab bar. Each is `{ path, width, text, roles, counts,
 * behind, signs, owner, drew }`, `drew` saying in plain words which parts were drawn, for the report's heading.
 */
export async function screensOf(shot) {
  await hooks();
  const { layoutOf } = await web('lib/record/boot-live.ts');
  const { BASE } = await web('lib/at.ts');
  const shell = layoutOf(shot.boot);
  const props = await railProps(shell);
  const counts = await countsOf(shot, shot.boot);
  const behind = await behindOf(shot, shell, BASE);
  const owner = shell.me?.owner === true;
  const out = [];

  const home = `${BASE}/`;
  const rail = await markupOf('lib/ui/Sidebar.svelte', props, { data: shell, path: home });
  const today = await todayMarkup(shot, shell, home);
  const signs = today.signs === undefined ? {} : { signs: today.signs };
  out.push({ path: home, width: WIDTH, ...readMarkup(`${rail}<main>${today.markup}</main>`), counts, behind, ...signs, owner, drew: today.why === null ? 'the rail and Today' : `the rail (${today.why})` });

  const first = (shell.index.registers ?? [])[0];
  if (first) {
    const path = `${BASE}/r/${first.id}`;
    out.push({ path, width: WIDTH, ...readMarkup(await markupOf('lib/ui/Sidebar.svelte', props, { data: shell, path })), counts, behind, owner, drew: `the rail on ${first.name}, its lists open` });
  }

  /* THE PHONE: Today over the tab bar, which holds the rail's first places (`tabsOf`, as the shell feeds `TabBar`). */
  const { tabsOf } = await web('lib/nav.ts');
  const bar = await markupOf('lib/shell/TabBar.svelte', { tabs: tabsOf(props.places), more: false }, { data: shell, path: home });
  out.push({ path: home, width: PHONE, ...readMarkup(`<main>${today.markup}</main>${bar}`), counts, behind, ...signs, owner, drew: today.why === null ? 'Today and the tab bar' : `the tab bar (${today.why})` });
  return out;
}
