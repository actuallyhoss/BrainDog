/**
 * The changelog's entries, and the rule that decides which ones exist.
 *
 * THEY LEFT `+page.svelte` SO SOMETHING OTHER THAN A READER COULD CHECK THEM. Every entry was a
 * literal inside a Svelte component, which meant the only thing that could tell whether this page
 * was still true was a person opening it. That is exactly the check that failed: the page said
 * *nothing has shipped yet* for six days after something had, and it went on saying it because no
 * run of anything looked. `../../../scripts/changelog.mjs` imports this file and holds it against
 * `git log`, so the page is checked rather than remembered.
 *
 * ── WHAT EARNS AN ENTRY ──────────────────────────────────────────────────────────────────────
 *
 * One entry per thing somebody outside this repository could point at: a capability that did not
 * exist, a surface that behaves differently, or a defect that made one of those wrong. Forty
 * commits toward one capability are one entry, and the entry is named after the capability rather
 * than after the commit that finished it.
 *
 * NOTHING IS EARNED BY SIZE. Tests, gates, specifications, design documents, status reports,
 * backlogs, comment repairs, bookkeeping and refactors nobody outside meets earn no entry however
 * large the diff, because this page is read by somebody deciding whether the product is alive and
 * a gate is not a thing he can open. That rule is why the log was 1,288 commits on 2026-09-21 and
 * this list is 88 entries: read over the whole history, most of those commits are the repository's own
 * paperwork. The 1,288 moves every hour and the 88 does not, which is the point of the rule.
 *
 * AND NOTHING IS INVENTED. Every entry names the commits it is drawn from, its body says only what
 * those commits' own messages and diffs support, and where the state was less finished than a
 * subject line sounded, the body says the smaller thing. If a commit cannot be read for what
 * shipped, it gets no entry rather than a guess.
 *
 * ── WHY `commits` IS NOT DECORATION ──────────────────────────────────────────────────────────
 *
 * It is the field the checker works from, and it turns three of the promises above into arithmetic:
 *
 *   - `date` IS NOT TYPED, IT IS DERIVED. The checker requires `date` to equal the author date of
 *     the FIRST commit in `commits`, so a date cannot drift, be guessed, or be carried over from
 *     the entry above while somebody edits around it. Later hashes are supporting evidence and may
 *     be any day, which is how a thing that shipped over two days keeps one date.
 *   - AN INVENTED ENTRY HAS NOWHERE TO POINT. Each hash must resolve, unambiguously, to one commit
 *     in the log the checker was pointed at.
 *   - THE FIRST HASH IS AN ANCHOR AND SO IT IS UNIQUE. Two entries anchored to one commit is the
 *     shape of a day written up twice, which is how a changelog grows entries the history does not
 *     have. Supporting hashes may repeat.
 *
 * ── HOW THE THIN DAYS WERE FOUND, AND WHAT IT COST ───────────────────────────────────────────
 *
 * The page had 57 entries over the 17 days this repository has committed on, so nothing was
 * MISSING a day. What it was missing was proportion. Counted against `git log --format=%ad`:
 * 2026-09-05 was 90 commits behind one entry, 2026-09-06 another 90 behind one, 2026-09-07 44
 * behind one, and 2026-09-15 25 behind one. The single 09-05 entry named nine things in one
 * sentence ("the schema, the ledger, the sixteen types, the write path, who may ask what, search,
 * the vault, rules and the export") and a reader would call at least six of those separate shipped
 * things, because each is a capability he could go and use.
 *
 * So 31 entries were added, all of them on days that already existed, and the page got longer
 * rather than shorter. That is a deliberate reversal of the pass recorded at the top of
 * `+page.svelte`, which cut this page from 4,458 words to 1,893 for good measured reasons. The
 * trade it makes: a page a stranger can skim and that under-reports four of its seventeen days is
 * worse than a slightly longer page that does not, because a skimmable page with holes in it is
 * still the artefact whose only job is proof of life. The day headings are what keeps it skimmable,
 * and none of the new bodies is longer than the bodies beside them.
 *
 * ── THE WRITING RULES, WHICH THE CHECKER NOW ALSO HOLDS ──────────────────────────────────────
 *
 * The title is the entry and the body is the evidence: at most three sentences, no sentence over
 * 25 words, and no URL, because the one link a changelog usually carries is to a releases page and
 * this repository tags without publishing GitHub Releases.
 */

export type Entry = {
  date: string;
  title: string;
  body: string;
  kind: 'shipped' | 'changed' | 'fixed';
  /**
   * The commits this entry is drawn from, newest-relevant first. The FIRST one sets the date and
   * must be unique across the list; the rest are evidence. Short hashes are fine and are resolved
   * by prefix, so an ambiguous one is a finding rather than a coin toss.
   */
  commits: string[];
};

/**
 * Newest first, and inside a day the order is EDITORIAL rather than chronological: the thing a
 * reader would care about most goes at the top of its day. `+page.svelte` groups consecutive
 * entries that share a date and does not sort, so this order is the order on the page, and the
 * checker only requires that a day never reappears after it has ended.
 */
export const ENTRIES: Entry[] = [
  {
    date: '2026-11-02',
    kind: 'shipped',
    title: 'Invite people by email, in roles with plain names',
    body:
      'An invitation is mailed as it is made, naming who sent it and what the role lets them do. The roles are Owner, Can decide, Can edit, Can add and Can view.',
    commits: ['689417173', '0377eb343'],
  },
  {
    date: '2026-11-02',
    kind: 'shipped',
    title: 'Hand your BrainDog over with Make owner',
    body:
      'An owner can make somebody already on it the owner in one confirmed press, and stays on as Can decide. No agent can do it.',
    commits: ['bd9cac8f8'],
  },
  {
    date: '2026-11-02',
    kind: 'shipped',
    title: 'Mention someone with @, and their phone rings',
    body:
      'Typing @ in a comment offers the people who can see that row. A colleague is rung when they are mentioned, handed a row or someone joins from their invitation.',
    commits: ['05e13ce26', '33fdaf968', 'c4a43627a'],
  },
  {
    date: '2026-11-02',
    kind: 'shipped',
    title: 'See who else is on the same page',
    body:
      'Faces of the people on the same row, list or page show beside the bell. Nobody learns where you are unless they can open that page too.',
    commits: ['81a3dc240'],
  },
  {
    date: '2026-11-02',
    kind: 'changed',
    title: 'Read-only links to a project, with or without money',
    body:
      'A link to a project page shows where it stands, its next step and its work. With money left off, every amount stays out, including ones typed in notes.',
    commits: ['d99d63001', 'd66038238'],
  },
  {
    date: '2026-11-02',
    kind: 'shipped',
    title: 'Import contacts and bank statements',
    body:
      'People takes a contacts CSV or vCard and skips anyone already there. Money takes a bank statement as CSV, and each filing choice becomes a rule for the next one.',
    commits: ['599d519f7', '784f82134', '2ce57c16d'],
  },
  {
    date: '2026-11-02',
    kind: 'changed',
    title: 'The sign-up chat asks better questions',
    body:
      'The first chat offers taps for who you work with, like an accountant or contractors, and says each answer back as a sentence. It no longer invents tasks.',
    commits: ['a2e903c28', 'cfb414c68'],
  },
  {
    date: '2026-11-02',
    kind: 'shipped',
    title: 'Sentry in the plugin store, and Stripe and Mercury read only',
    body:
      'The Sentry plugin links Sentry projects to yours, with their open issues and error numbers. Stripe and Mercury say which read-only key to make. Weather and Calendar draw better on Today.',
    commits: ['dd1bf3944', '6230e27d6', '31787f040', '265db20f8', 'd42666e55'],
  },
  {
    date: '2026-11-02',
    kind: 'changed',
    title: 'One switch lets your own agents act without asking',
    body:
      'Settings, Agents has a switch for the owner. It never covers keys, inviting or removing people, handing over, exporting everything or paying. Agents also read scripts and automations by name.',
    commits: ['d94234cce', '887ea6f66', 'ece5e2361'],
  },
  {
    date: '2026-11-02',
    kind: 'changed',
    title: 'Dark mode is grey, and pages stop jumping',
    body:
      'Dark mode lost its red tint and reads grey. Today, Search, Needs you, Keychain, Plugins and project pages now draw in place without shifting as they load.',
    commits: ['fa3f844df', '77a128882', '750d4cb53', '2eda61853'],
  },
  {
    date: '2026-11-02',
    kind: 'shipped',
    title: 'A self-host can invite people without mail',
    body:
      'The operator runs invite with an email on the server, and it prints a join link in that terminal only. Activity names the operator as the one who sent it.',
    commits: ['c0fcca8f4'],
  },
  {
    date: '2026-10-26',
    kind: 'changed',
    title: 'The Vault is now the Keychain',
    body:
      'The place that holds your keys is called the Keychain, and a machine allowed to open them has keychain access. The CLI takes --keychain, and --vault still works. Not released yet.',
    commits: ['37e4fe388'],
  },
  {
    date: '2026-10-20',
    kind: 'shipped',
    title: 'Every agent write gets a receipt and an undo',
    body:
      'Each write by an agent ends in a receipt that names the change and the batch to undo it with. An agent can take back its own write by that batch, and every tool now says whether it only reads. Not released yet.',
    commits: ['54eadd45', 'f493a133'],
  },
  {
    date: '2026-10-20',
    kind: 'shipped',
    title: 'Handled today: what BrainDog settled by itself, with an Undo',
    body:
      'BrainDog files a sure bill or card text by itself when the move is reversible, and marks it. Today lists each one with its reason and an Undo. Not released yet.',
    commits: ['37a3f50d', 'c5cbab74', '0c921914', 'e8a6c281'],
  },
  {
    date: '2026-10-20',
    kind: 'shipped',
    title: 'To review: doubtful arrivals wait with a suggested filing',
    body:
      'An arrival BrainDog is not sure of waits under To review with the list it would use. Nothing is written until you file it, pick another list or ignore it. Not released yet.',
    commits: ['de9a71a2'],
  },
  {
    date: '2026-10-20',
    kind: 'shipped',
    title: 'Write an automation as a sentence and press parts of it to change them',
    body:
      'Describe an automation in one line and BrainDog reads it back in your words, with what it would have done over the last 30 days. Steps can be reordered, and a reminder puts its line on Today. Not released yet.',
    commits: ['deb7b270', 'e6fb5156'],
  },
  {
    date: '2026-10-20',
    kind: 'shipped',
    title: 'Change this on a block, Make a component, and a shelf',
    body:
      "Type one line about a block to change how it is drawn, written into the page's own source. Make a component draws a new block from a line, and the shelf keeps components to place on any page. Not released yet.",
    commits: ['11263e6c', 'c5f40a0e', '6c22a67f'],
  },
  {
    date: '2026-10-20',
    kind: 'shipped',
    title: 'The design book, in Settings and for agents',
    body:
      'The design book shows every kind of block, the colours, type and spacing in Settings, beside the look. Agents read the same book at braindog:design before they design anything. Not released yet.',
    commits: ['ce979a1e', '83ee2338'],
  },
  {
    date: '2026-10-20',
    kind: 'shipped',
    title: 'Teams: an Admin role and rows kept private to their maker',
    body:
      'A record can hold a team with four roles: Viewer, Member, Admin and Owner. A row can be kept private to its maker, and private rows stay out of lists, figures, exports and search. The team gate waits for billing, so it is not switched on yet.',
    commits: ['85894f66', '7d5a163e', 'c7005455', '3c33b88d'],
  },
  {
    date: '2026-10-20',
    kind: 'shipped',
    title: 'Cards for agents, and a five line brief',
    body:
      "Project, decision and rule cards draw inside an agent's app that supports them, and the tool's text lines carry the same facts elsewhere. The agent brief is now five short lines in names, never ids. Not released yet.",
    commits: ['226e4939', 'ccdd511f', '25d7ba26', 'c124f075'],
  },
  {
    date: '2026-10-20',
    kind: 'shipped',
    title: 'A better first run: connect an agent, and a first project formed for you',
    body:
      "After sign-up BrainDog offers Connect your agent, and an agent's first session forms a draft first project on Today, kept with one press. The first brief is drawn from that session. Not released yet.",
    commits: ['504df523', '447eb0c9', 'ad9cbec4', '5892b065'],
  },
  {
    date: '2026-10-20',
    kind: 'shipped',
    title: 'Read forwarded mail for who and what it is about',
    body:
      'Forwarded mail is read for the people and things in it, and sure bills and renewals are filed by themselves with a mark and an Undo. Not released yet.',
    commits: ['f828b612'],
  },
  {
    date: '2026-10-20',
    kind: 'shipped',
    title: 'Publish your own plugin to the store',
    body:
      'You can publish a plugin of your own to the store, where it is reviewed on admin and can be unpublished later. Publishers see their submissions and are offered updates and skills. Not released yet.',
    commits: ['cd045eb3', '4b8db9bf'],
  },
  {
    date: '2026-10-20',
    kind: 'shipped',
    title: 'A stranger can start a self-host, back it up and restore it',
    body:
      'A first self-host start now goes from clone to a working record with a one-time passkey link. Backup and restore are written out in the self-host guide. Not released yet.',
    commits: ['c0e280c8'],
  },
  {
    date: '2026-10-20',
    kind: 'shipped',
    title: 'The Mac app: dock badge, notifications, Google sign-in and updates',
    body:
      'BrainDog has a Mac window with a Dock badge, notifications, open at login, Option+Space for Slash and Google sign-in. Its download page is held until launch. Not released yet.',
    commits: ['26daa94c', 'e74105de', 'f0a5aac2'],
  },
  {
    date: '2026-10-20',
    kind: 'shipped',
    title: 'Offline reading catches up from a local copy',
    body:
      'The app keeps a local copy of read lists, caught up from the change log, and draws more screens from it with no signal. Not released yet.',
    commits: ['c5b6099c', '0f745994', '69ef27e7'],
  },
  {
    date: '2026-10-20',
    kind: 'changed',
    title: 'Decide is now called Needs you',
    body:
      'Everything a person reads now says Needs you where it said Decide, and its empty states say what will land there. Not released yet.',
    commits: ['28fe85c7', 'e13fd0e1'],
  },
  {
    date: '2026-10-20',
    kind: 'changed',
    title: 'Plain limits and plain errors',
    body:
      'Every door has one table of limits and answers a limit in one plain line saying when to try again. Failed writes and expired links now say what to do next. Not released yet.',
    commits: ['16fcac95', '9fd1f6be', '3b648b0e'],
  },
  /* FREE LEADS, WRITTEN BEFORE ITS COMMIT: the work was not committed when this was written, and an
     anchor is never guessed. The commit that lands sign-up's free path goes first in `commits`, and the checker
     reports this entry as unanchored until it does. */
  {
    date: '2026-10-02',
    kind: 'shipped',
    title: 'Free leads: one record for one person, with no card',
    body:
      'Free is one record for one person, with the whole app and a monthly allowance of Slash, at no charge. ' +
      'Sign-up makes a free record at once, with no payment step. ' +
      'Cloud and Cloud Plus are the plans for pros, and credit packs and extra usage are coming later.',
    commits: [],
  },
  /* THE LAST WORK LANDED AS A FEW LARGE COMMITS, NOT ONE PER THING. Each batch was committed whole
     (`c651475b`, `daba3453`, `4c204b5c`, `bfe14e39`), and an anchor must be unique, so each of those commits
     carries one entry naming what a person notices most, and the rest of that work is not written up
     here. The last especially: one commit, so one entry, until its work has commits of its own to anchor to. */
  {
    date: '2026-09-28',
    kind: 'shipped',
    title: 'Your phone keeps a copy to read offline, and a Cloud account can be closed',
    body:
      'A phone keeps a read copy of the record for a week, so it opens without a signal and refreshes when you pull down. ' +
      'An owner can close their Cloud account from Settings, and a webhook can require a signature before anything it sends is matched. ' +
      'This site gained documentation for using the app, connecting agents and building packs.',
    commits: ['bfe14e39'],
  },
  {
    date: '2026-09-28',
    kind: 'fixed',
    title: 'The command line installed as one file starts again',
    body:
      'The single-file command line failed as soon as it was run, because a library bundled inside it asked for something the bundle did not provide. ' +
      'It starts now.',
    commits: ['21c13d03'],
  },
  {
    date: '2026-09-28',
    kind: 'shipped',
    title: 'Plugins, people and comments in the app, and pages you change by describing them',
    body:
      'Plugins can be browsed, searched, installed and updated from inside the app. ' +
      'You can invite people from Settings and comment on a row. ' +
      'Describe a change to a page and Slash draws it beside the page as it is, for you to keep or drop.',
    commits: ['4c204b5c', 'df828225'],
  },
  {
    date: '2026-09-28',
    kind: 'shipped',
    title: 'Connecting an agent is rebuilt, and one command sets a machine up',
    body:
      'Connecting an agent is one flow that ends on a consent screen before it gets any access. ' +
      'One command sets a machine up from the record’s address, and every item shows which scope it belongs to. ' +
      'History says what happened in words, and bank merchants get clean names and a category.',
    commits: ['daba3453'],
  },
  {
    date: '2026-09-27',
    kind: 'changed',
    title: 'A calmer look, a layout made for the phone, and agents that connect by address',
    body:
      'The app has a cool ground, a light scheme, quieter controls, and a layout built for the phone as well as the desk. ' +
      'Any MCP client can connect with the record’s address and a sign-in. ' +
      'The command line installs as a single file.',
    commits: ['c651475b', 'a4a4a008', '684d58f1', '8a67667d', 'b8753a5a'],
  },
  {
    date: '2026-09-27',
    kind: 'shipped',
    title: 'Card alerts joins the catalogue, and more packs show a preview first',
    body:
      'A card alert naming the card’s last four digits, forwarded by mail or sent as a text, is read into Money as a transaction. ' +
      'The roadmap and project brief packs show a preview before you install them.',
    commits: ['a65709a9'],
  },
  {
    date: '2026-09-26',
    kind: 'changed',
    title: 'This site describes the finished product, with a page for Slash and the Cloud plans',
    body:
      'Every section under the home page’s opening is rebuilt: Slash, agents deciding, the inbox, pages, and why the record is yours. ' +
      'Slash has a page of its own. ' +
      'Pricing shows the two Cloud plans, with Slash counted in credits and extra usage off unless you turn it on.',
    commits: ['72ec4007', '6db58337'],
  },
  {
    date: '2026-09-25',
    kind: 'changed',
    title: 'No sample record and no demo: every screen reads your own record',
    body:
      'Screens that used to fall back to sample rows now read the live record, or say why they cannot. ' +
      'The first run, the palette, packs and automations start from what the record holds.',
    commits: ['1cde2795', 'c777e8f8', '1af90b95', '59aef3d4', 'b2b90d09'],
  },
  {
    date: '2026-09-25',
    kind: 'shipped',
    title: 'A page can have a side rail, lead cards, steps, tiles and inputs',
    body:
      'A page lays out a main column and a side rail. ' +
      'It draws lead cards, a path of steps, tiles, ranges against spend, and inputs that write as you type.',
    commits: ['352e928f', 'fc9f9323', '2313d8d1'],
  },
  {
    date: '2026-09-25',
    kind: 'shipped',
    title: 'Payouts, bank transactions, counting cash and a roadmap, as packs you install',
    body:
      'A pack is published to the catalogue and installs from the app or the command line. ' +
      'Stripe payouts, bank transactions, counting cash, a live feed and a roadmap page are packs now. ' +
      'Roadmap bars drag to a new start, with undo.',
    commits: ['3d65e48a', 'e6d73bbd', 'c01cda50', '5c332af4', 'e54bc0fb'],
  },
  {
    date: '2026-09-25',
    kind: 'shipped',
    title: 'An agent can be allowed to read the money inbox',
    body:
      'Settings can create access for an agent that reads the money inbox, off unless you ask for it. ' +
      'Every other agent is still refused the inbox.',
    commits: ['f487bf78', 'd41ec831', 'eb9169a3'],
  },
  {
    date: '2026-09-25',
    kind: 'shipped',
    title: 'The forecast can sell on a set day, leave a line out, or let a figure drift',
    body:
      'Forecast steps carry their own currency and group, and can sell on a given day. ' +
      'The money page groups installments by the plan they belong to.',
    commits: ['94b799fb', 'cc7dc9b6', '4ab05e35'],
  },
  {
    date: '2026-09-25',
    kind: 'shipped',
    title: 'An automation on a clock or a button can create a row each time',
    body:
      'A clock or a button that creates makes its row on each turn, within a limit. ' +
      'The canvas offers monthly and yearly clocks with a day, a time and a month.',
    commits: ['30f2d191', 'fb39de12', '0384af07', 'de44c368'],
  },
  {
    date: '2026-09-25',
    kind: 'fixed',
    title: 'Money inputs never guess a currency',
    body:
      'A bare figure in an empty money box asks for its currency instead of assuming one. ' +
      'A comma is read the app’s way, a range’s total is summed exactly, and a range mixing units is refused.',
    commits: ['96c9ae9b', 'cce1734e', 'f62b2ee0'],
  },
  {
    date: '2026-09-25',
    kind: 'fixed',
    title: 'Slash drafts only from what the person asking can read',
    body:
      'What Slash is told about a record is held to what the person asking can read. ' +
      'A draft cannot give away rows, counts or gaps they could not see.',
    commits: ['fa2f11eb'],
  },
  {
    date: '2026-09-25',
    kind: 'fixed',
    title: 'The check that keeps keys out of the record is harder to fool',
    body:
      'It sees through invisible characters, reads link, email and structured fields, and runs in linear time. ' +
      'A word shaped like a key is refused as a list option.',
    commits: ['1a094625'],
  },
  {
    date: '2026-09-25',
    kind: 'changed',
    /* THE ONE ENTRY THAT NAMES SPARK, AND IT HAS TO. The two entries below that said Spark were
       renamed with everything else, because the page describes the product as it is. An environment
       that still sets `SPARK_ENDPOINT` would get no model after the rename and no error either, since
       only `SLASH_*` is read, so this entry is the only place its owner is told. It names no way of
       running BrainDog (the site does not advertise one).
       `test/slash.test.ts` fails if any other sentence on any page names Spark.

       ANCHORED ON THE DECISION, BECAUSE THE RENAME HAD NOT BEEN COMMITTED WHEN THIS WAS WRITTEN: it
       was committed after. `bb960c22` is the decision, the owner's word and the list of what moves, and
       `62fabc69` is the survey that mapped it. The rename's own commits belong after them as evidence. */
    title: 'Spark is now called Slash, and its settings are renamed with it',
    body:
      'The assistant is called Slash in the app, the command line and the documents. ' +
      'Its model is read from SLASH_ENDPOINT, SLASH_MODEL and SLASH_KEY, and the SPARK_ names read before are ignored. ' +
      'Rename them by hand, or Slash runs as if no model were configured.',
    commits: ['bb960c22', '62fabc69'],
  },
  {
    date: '2026-09-24',
    kind: 'shipped',
    title: 'Notifications on your phone, turned on per device',
    body:
      'Settings turns on notifications for one device, and a phone can add BrainDog to its Home Screen. ' +
      'A notification says only that something needs you. ' +
      'The record tells you what once it is open.',
    commits: ['77436a14', '4a5a2135', 'a4111719', '317ae743'],
  },
  {
    date: '2026-09-24',
    kind: 'shipped',
    title: 'Slash answers with an included model on the Cloud',
    body:
      'Slash’s included model is switched on, and each record gets a monthly allowance the Cloud enforces over any owner’s own cap. ' +
      'When a record is too large for it, Slash says so plainly.',
    commits: ['4e701b15', '1cdc6721', '70e45882', '250e0f41', '60f7c15b'],
  },
  {
    date: '2026-09-24',
    kind: 'shipped',
    title: 'Put back after every change you make on a list',
    body:
      'Every live write on a list offers Put back, and a done task keeps its finished day when it is put back. ' +
      'A ticked task stays where it was until you leave the page, and the grid edits every type the row page edits.',
    commits: ['b935a4df', 'efb1c10a', '6fa38569', 'dd209664', '131189a4', '2ceb3be9'],
  },
  {
    date: '2026-09-24',
    kind: 'shipped',
    title: 'Filters say more than, at least, between, and or',
    body:
      'A filter can compare a figure: more than, at least, less than, at most and between. ' +
      'Conditions can be joined with or, and the filter chips say so.',
    commits: ['3187be5a', '19973508', 'b1ee1b43', '2ba9a9b2'],
  },
  {
    date: '2026-09-24',
    kind: 'shipped',
    title: 'Ring, heat and roadmap blocks, and a block made from a saved view',
    body:
      'A page can draw a ring, a heat map or a roadmap. ' +
      'A block can be made from a list or a saved view, and a filtered list can be saved as a view.',
    commits: ['4657589b', 'e19fdabc', '80411b3a', '387e4d1a'],
  },
  {
    date: '2026-09-24',
    kind: 'shipped',
    title: 'A page an agent proposes is drawn in Decide before anyone accepts it',
    body:
      'Decide shows the page an agent proposes, drawn, before anybody accepts it. ' +
      'An agent can see the drawing through MCP too, and retiring a field always waits in Decide.',
    commits: ['511ef8f9', 'f9a5e778', '6822aab5'],
  },
  {
    date: '2026-09-24',
    kind: 'shipped',
    title: 'The inbox is read by state, and an arrival can go back to it',
    body:
      'The inbox shows its arrivals by state, with a count for each. ' +
      'A filed or archived arrival can be sent back to the inbox.',
    commits: ['9815021f', 'add7d97b'],
  },
  {
    date: '2026-09-24',
    kind: 'shipped',
    title: 'An automation step can read one of the record’s figures',
    body:
      'A step can fill in any figure the record declares at the moment it runs. ' +
      'A rule naming a figure it cannot read is refused at install.',
    commits: ['b251eb7f', 'd2c77fb3'],
  },
  {
    date: '2026-09-24',
    kind: 'fixed',
    title: 'A move between your own accounts is no longer counted as spending',
    body:
      'The two cleared legs of a transfer are paired, so Spent stops counting money moved between your own accounts. ' +
      'A client’s payment is never hidden as half of a move.',
    commits: ['baf7048a', '57bf4ff7', '974319fb', '5dc5a7c6', '56b35c41'],
  },
  {
    date: '2026-09-24',
    kind: 'fixed',
    title: 'The forecast walks month ends and ending lines correctly',
    body:
      'A yearly bill on 28 February stays on the 28th, and only a real month end walks to the last day. ' +
      'A repeating line whose end is still ahead stops walking on its last day.',
    commits: ['befd5f44', '48eeaf4c', '5d4bbf8b', 'f91fc4d3'],
  },
  {
    date: '2026-09-24',
    kind: 'fixed',
    title: 'A damaged search index no longer stops a record opening',
    body:
      'The index is rebuilt when the record opens, or the record opens without search. ' +
      'A restore that never finished no longer leaves the record down.',
    commits: ['151295ca', 'd529c68d', '7c6c8634'],
  },
  {
    date: '2026-09-24',
    kind: 'changed',
    title: 'A crash answers with a reference, and an oversized request is refused',
    body:
      'A request that crashes answers with a reference and logs the reason. ' +
      'A body over one megabyte is refused as it arrives.',
    commits: ['fbb45373'],
  },
  {
    date: '2026-09-23',
    kind: 'changed',
    title: 'This site draws the app instead of photographing it',
    body:
      'The screenshots on the home page are gone, and so are the numbers that opened each band. ' +
      'The app window is drawn in HTML and CSS across the foot of the hero. Its lists, rows, ' +
      'Decide and an automation open when pressed.',
    commits: ['1cffbb7a', '6e5f4e73', 'ba1cac19'],
  },
  {
    date: '2026-09-23',
    kind: 'changed',
    /* THE SMALLER THING, ON PURPOSE. The commit moves the app and runs dark; the push after it sends
       app.brain.dog's page loads to /app; brain.dog itself serves nothing of the app until the two
       pushes `fe14e8be` leaves waiting in the config. An entry saying "one domain" would be ahead of
       the product by exactly those two pushes. */
    title: 'The app moves under /app, the first step to living on one domain',
    body:
      'The record app builds under /app, and its links, sign-in links, device links and the command ' +
      'line all follow. A page load on app.brain.dog outside /app goes to /app. Serving the app ' +
      'from brain.dog itself is the next step and has not happened yet.',
    commits: ['f88eb95b', 'fe14e8be', '0cfee8c6'],
  },
  {
    date: '2026-09-23',
    kind: 'shipped',
    /* THE SWITCH IS THE HOST'S, whatever `82eae966`'s subject says about the record's: the kernel's
       `answersSlash` is off unless the host says it serves the question, and each host says so only
       where a model stands behind Slash (`apps/worker/src/index.ts` and its sibling host,
       from `eb1a131b` and `6d78d936` later the same day). */
    title: 'An automation can put a question to Slash, where a model is there to answer it',
    body:
      'A step can ask Slash a question, and a host with no model behind Slash refuses it at install. ' +
      'The Cloud answers with the owner’s key from the vault and refuses at once where there is ' +
      'none. A question never carries a secret or a file field.',
    commits: ['82eae966', 'ee317fa3', 'eb1a131b', '6d78d936', '3d299358', 'eae8aff6'],
  },
  {
    date: '2026-09-23',
    kind: 'fixed',
    title: 'A key sealed on the Cloud can be opened, where every read had failed',
    body:
      'The Cloud’s database hands a stored value back in a form the unseal read as empty. ' +
      'Every key read there answered WRONG_KEY. The value is read whole now.',
    commits: ['973f2ecc'],
  },
  {
    date: '2026-09-22',
    kind: 'shipped',
    title: 'A script can be part of a record, and it runs in a sandbox',
    body:
      'A script is proposed like any other change, and Decide shows its source and the host each ' +
      'key goes to. It runs in a sandbox of its own, under ceilings on time, memory, fetches and ' +
      'writes. A key reaches only the host its vault entry opens.',
    commits: ['94ba1ad8', 'bc82bae5', 'f5c02b73', 'eafe8c20', '7adc7d0c', 'd23ac77d', '1f252e34'],
  },
  {
    date: '2026-09-22',
    kind: 'shipped',
    title: 'Automations: a trigger and its steps, built on a canvas or by an agent',
    body:
      'A rule can carry a trigger and steps, and a step can wait for a person to answer through ' +
      'Decide. The canvas edits one by pointer, keyboard or touch and saves the same definition an ' +
      'agent proposes. The terminal lists, runs, cancels and resumes them.',
    commits: ['20be80ac', '6ec8011d', '151ac7a2', '309e3dad', 'f6529ce9'],
  },
  {
    date: '2026-09-22',
    kind: 'shipped',
    title: 'The Cloud sends sign-in links, from hello@brain.dog',
    body:
      'The sender was empty, so the Cloud mailed no sign-in link at all. A link now brings you back ' +
      'to the page you were sent from, and Open BrainDog opens your record rather than the sample. ' +
      'A hosted record is still made by the operator, and sign-up is not open.',
    commits: ['54a16ffb', '6959cf06', 'bb8c7393', 'ae348358', '1db7dd1e', '9df8ded7'],
  },
  {
    date: '2026-09-22',
    kind: 'shipped',
    title: 'A field added from a row appears on every row, form and list',
    body:
      'A field can be added while looking at a row, and it stays after you move away. A field that ' +
      'rows still hold cannot be dropped, and every schema change is kept in history. A pack update ' +
      'keeps the fields an owner added.',
    commits: ['50a6874a', '545c95f6'],
  },
  {
    date: '2026-09-21',
    kind: 'shipped',
    title: 'A forwarded message can reach a hosted record, on an address you mint',
    body:
      'The Cloud had a mail door and no way to get an address for it. Minting one stores only ' +
      'the hash of the token and hands you the token once. Rotating it is minting again, and ' +
      'revoking it is writing nothing in its place.',
    commits: ['f96fc499', 'e9539e83', '95e1055f'],
  },
  {
    date: '2026-09-21',
    kind: 'changed',
    /* THE ENTRY THAT WAS MISSING, and the absence had a measurable effect: with no line after it, the
       newest thing this changelog said about colour was the 10 September entry below, "Indigo controls",
       which has not been true since the 16th. The entry for the 10th is left exactly as it stands. It
       was true on the day, and a changelog edited to agree with today is not a changelog. */
    title: 'The accent is the mark\u2019s own red again, and the indigo is gone',
    body:
      'The product wore an indigo accent from the 10th of September. It is the red the mark has ' +
      'always been, solved against every surface in both schemes. A figure drawn in it clears ' +
      'the contrast floor rather than only looking right on one ground.',
    commits: ['411272a7', '938175fb'],
  },
  {
    date: '2026-09-21',
    kind: 'changed',
    title: 'This site was rebuilt around what fills a page rather than around its colour',
    body:
      'Four reference sites were measured in a browser and this one beside them. Almost half of ' +
      'the home page held nothing but a one pixel rule. It has five bands now, four changes ' +
      'of ground, and the record photographed at the width of the screen.',
    commits: ['8d6bcc9c', '164ad664'],
  },
  {
    date: '2026-09-21',
    kind: 'fixed',
    title: 'A project with no invoices stops being told that none of them are overdue',
    body:
      'A figure can tell an empty register from an empty match. One narrowed to a single ' +
      'project could not, so the emptiest screen in the product drew the one sentence that ' +
      'field exists to prevent. The count is taken where the narrowing happens now.',
    commits: ['72751ef6'],
  },
  {
    date: '2026-09-20',
    kind: 'shipped',
    title: 'Money moves: a ledger, categories, rules, recurring items and instalments',
    body:
      'Money declared accounts and bills and nothing else. It carries transactions, categories, ' +
      'recurring items, instalments and periodic snapshots now, with the rules and figures over ' +
      'them. A check found one figure adding what you are owed to what you owe.',
    commits: ['a015a9f3', '4da40586'],
  },
  {
    date: '2026-09-20',
    kind: 'shipped',
    title: 'A message sent in from outside reaches the record',
    body:
      'An arrival lands on a route of its own and is read for what it holds. One that nothing ' +
      'understands is kept whole rather than dropped. A sender can no longer talk the check out ' +
      'of its verdict by writing its own headers.',
    commits: ['a94764dd', '77f82ccb', '5d0468f3'],
  },
  {
    date: '2026-09-20',
    kind: 'shipped',
    title: 'Slash asks a model, accounts for what it spent, and cites what it read',
    body:
      'The engine behind it is a package of its own: the triage shapes, the pattern draft and ' +
      'the proposal door. Every ask is written down as a row, the refused ones included. A ' +
      "stranger's message goes to the model inside its own fence.",
    commits: ['2435d947'],
  },
  {
    date: '2026-09-20',
    kind: 'changed',
    title: 'Every command takes --json, which the specification has promised since it was written',
    body:
      'Not one command accepted the flag, so four written that week had to refuse it. It is ' +
      'decided in one place now: the answer goes to one stream and everything else to the ' +
      'other. A refusal is as readable by a machine as a success is.',
    commits: ['f6d64d8a', '5252ca3d'],
  },
  {
    date: '2026-09-20',
    kind: 'shipped',
    title: 'The Cloud keeps a nightly copy of every record',
    body:
      'A nightly job walks the directory, and each record signs its whole file into object ' +
      'storage. Thirty nights are kept. The copy refuses to write until an operator sets a ' +
      'real key to seal it.',
    commits: ['c64eb36c', 'e85bd55c'],
  },
  {
    date: '2026-09-20',
    kind: 'fixed',
    title: 'Two currencies were added together in the two places nothing was looking',
    body:
      'A connector took the amount off a money row and left its currency behind. A hundred ' +
      'Egyptian pounds and two and a half dollars were written down as one number. A reading ' +
      'like that is refused whole now, because a total that is quietly short is worse than none.',
    commits: ['d76cd016'],
  },
  {
    date: '2026-09-19',
    kind: 'shipped',
    title: 'A connector fetches from a provider on a schedule and writes back what it gets',
    body:
      'A connector could be declared and nothing could run one. Eight kinds of credential open ' +
      'from a sealed grant and are never logged. Paging stops on its own terms, and a resumed ' +
      'run reads back what it left rather than starting again.',
    commits: ['9b7be06a', '74d4c8cb', 'fb96f41d'],
  },
  {
    date: '2026-09-19',
    kind: 'shipped',
    title: "Reading a stranger's message: the anchors, the extractors, money and dates",
    body:
      'The package for this had a long specification and no code. It has eighty-one tests now, ' +
      'one for each row of that document. The currency is found before the number is read, ' +
      'because 1.250 is one amount in Cairo and a different one in London.',
    commits: ['799849f4'],
  },
  {
    date: '2026-09-19',
    kind: 'fixed',
    title: 'A hosted run counts what it may spend before it spends it',
    body:
      'Cloudflare allows eight hundred outward requests to one invocation, and a connector at ' +
      'forty pages can make eighty-six. Passing that ceiling ends the work of every other ' +
      'record in the same run. Each job reserves its worst case now, and one run always goes.',
    commits: ['9fc671fa'],
  },
  {
    date: '2026-09-17',
    kind: 'shipped',
    title: 'Money in more than one currency stops refusing to answer',
    body:
      'A figure over two currencies used to refuse outright. With no home currency it answers ' +
      'one amount for each and names the pair it lacks. With one set, it converts at the rate ' +
      "for each row's own day and says as of when.",
    commits: ['a33c44b1', '5edb45af'],
  },
  {
    date: '2026-09-17',
    kind: 'shipped',
    title: 'A use case can be shared as a signed file, and a later version is offered',
    body:
      'A catalogue holds versions that never change, a bump it works out for itself, and a ' +
      'checksum. The web lists plugins beside use cases and says which key signed each one. A ' +
      'newer version of what a record holds is filed as a proposal and installed only if it is ' +
      'accepted.',
    commits: ['b027b418', 'c0cc921c', '858aa3fd'],
  },
  {
    date: '2026-09-17',
    kind: 'changed',
    title: 'Work, Projects and Team lead with what is waiting on you',
    body:
      'A task gains an owner, an agent, a part it belongs to and a day it was done. Work draws ' +
      'the queue waiting on you, what is due soon, and what agents hold. It was tested on a ' +
      'real record, with an agent taking work and handing it back.',
    commits: ['a960c968', 'e7fa8abb', '8f18de1c'],
  },
  {
    date: '2026-09-17',
    kind: 'fixed',
    title: 'A report key is held to six hundred rows a minute',
    body:
      'A key with no ceiling on it can fill a record with text. It is refused with how long to ' +
      'wait now, and the answer carries that time in its own header.',
    commits: ['d0e1ab53', 'c697dc3a'],
  },
  {
    date: '2026-09-17',
    kind: 'fixed',
    title: 'Every control a thumb reaches is 44 pixels on a phone',
    body:
      "A question's link was 43 pixels tall and a folded field was 21. Decide drew its box in a " +
      'way the layout gate cannot read, so it is drawn the way every other hit area is. A ' +
      'checkbox inside its own label is measured through that label now.',
    commits: ['96671762'],
  },
  {
    date: '2026-09-16',
    kind: 'shipped',
    title: 'Signing in works, and there is still nothing to sign in to',
    body:
      'The one secret sessions are built on is set on production, so passkeys and first run ' +
      'work. No record can be made yet, and a record is made by the operator rather than by a ' +
      'visitor.',
    commits: ['a78b44c8', '746d6fc2'],
  },
  {
    date: '2026-09-16',
    kind: 'changed',
    title: 'The status report said the writing had not started, and six modules of it had landed',
    body:
      'The row for the app writing anything down read nothing started. Six write ' +
      'modules and their tests were already in the tree. The row is a count now: of 52 ' +
      'gestures that say nothing was saved, 15 still want a write path.',
    commits: ['c8ebfbf1'],
  },
  {
    date: '2026-09-16',
    kind: 'shipped',
    title: 'A page is a file you can pull, edit and push back',
    body:
      "A .dog file is one page's source, and a .brain holds the whole record. The command " +
      'line pulls a page, checks it against the grammar and pushes it back. A file carrying ' +
      'typed rows is refused, because the printed form keeps only how many there were.',
    commits: ['9384ebe7', '1dd8c7a8'],
  },
  {
    date: '2026-09-16',
    kind: 'changed',
    title: 'The rail collapses to its glyphs instead of being taken away',
    body:
      'Collapsing used to remove every row and leave one button in an empty gutter. The rail ' +
      'narrows to its glyphs now, and each glyph hands its name back on hover and on focus. A ' +
      'top bar and a menu are shapes you can ask for.',
    commits: ['714c393e', '3702f40e', '419095b2'],
  },
  {
    date: '2026-09-16',
    kind: 'shipped',
    title: 'The record switcher lists every record you can reach',
    body:
      'It held the one record you were already inside. The directory is asked which records ' +
      'are open to you, then each of those records is asked about itself. A row is kept only ' +
      'where the record itself answers with a level.',
    commits: ['f76d68c6', '142653f6', '69e5f2a1'],
  },
  {
    date: '2026-09-16',
    kind: 'shipped',
    title: 'A row is edited a field at a time, and what points at it is read from the record',
    body:
      'Each field writes through on its own, rather than the whole row or nothing. What points ' +
      'at a row is read from the record too. A key goes into the vault from the browser now.',
    commits: ['49caaac6'],
  },
  {
    date: '2026-09-16',
    kind: 'changed',
    title: 'A saved view is a row the record holds, not a URL',
    body:
      'A view was a filter sitting in an address, lost when the tab closed. It is a row on a ' +
      'list now, with its filter, search, order, columns and who saved it. Saving one is an ' +
      'owner-level act, because everyone sees the list.',
    commits: ['475e7b88', '1bc91a70'],
  },
  {
    date: '2026-09-16',
    kind: 'fixed',
    title: 'The first row you type is written down, instead of being told it went nowhere',
    body:
      'The button that commits your first row had no live path at all: it printed that nothing ' +
      'was saved. On a record the row is written now, and pressing again corrects it rather ' +
      'than leaving a second one behind.',
    commits: ['a1efab09', 'aa929f32'],
  },
  {
    date: '2026-09-16',
    kind: 'shipped',
    title: 'The app deploys itself, and a gate checks that the deploy landed',
    body:
      'A pipeline deploys the commit the checks measured, once they finish, and queues rather ' +
      'than cancels. A gate then asks the running server which version it believes it is. This ' +
      'site is meant to follow in the same run and can be a day behind.',
    commits: ['37163f41', '5f01aa2d'],
  },
  {
    date: '2026-09-16',
    kind: 'fixed',
    title: 'Three screens drew invented rows under your own heading',
    body:
      'All three drew the built-in demo whatever record was open, with nothing saying so. The ' +
      'thread view asks the record now. The other two have no way to read at all, and each ' +
      'says so rather than inventing rows.',
    commits: ['9efa49e3', '51d3836a'],
  },
  {
    date: '2026-09-15',
    kind: 'shipped',
    title: 'The app writes to a real record, and most of its screens read one',
    body:
      'Until this week every screen drew a made-up business. Nine screens read the record now, ' +
      'and the app writes to it: rows, cells, states, decisions, arrivals, cards, levels, ' +
      'tokens and packs. Archiving offers an undo rather than a confirmation.',
    commits: ['a95f127f', '8aa26631'],
  },
  {
    date: '2026-09-15',
    kind: 'shipped',
    title: 'The record calls other services on a schedule, and counts what that costs',
    body:
      'A call or a poll can run on a schedule, and a private address is refused. Usage is ' +
      'counted per account against a plan limit. An install says what it will call before ' +
      'anybody approves it.',
    commits: ['37ccbb3f', '47b15455', '0fea83ef'],
  },
  {
    date: '2026-09-15',
    kind: 'shipped',
    title: 'A machine signs itself in from the command line, and Settings approves it',
    body:
      'braindog login signs a machine in, and onboarding opens by asking who you are. Settings ' +
      'approves the machine and opens the key doors.',
    commits: ['f0c9af3f', '301843d1', '72befe0b'],
  },
  {
    date: '2026-09-15',
    kind: 'shipped',
    title: 'A pack can be switched off, and a proposal says what it would change',
    body:
      'Every pack has a switch, and a page can inherit from another. A proposal names the rows ' +
      'it would change before anybody accepts it. A pack pointing at a list that does not ' +
      'exist is refused.',
    commits: ['24836773', 'a6b3cb15', 'c0c04b67'],
  },
  {
    date: '2026-09-14',
    kind: 'changed',
    title: 'Everything is a module, and the first question is who are you',
    body:
      "On the owner's instruction: every module can be turned off and on again, People " +
      'included. Setting up a record asks who you are first, and fills the first person in ' +
      'People with the answer.',
    commits: ['118baee5'],
  },
  {
    date: '2026-09-11',
    kind: 'shipped',
    title: 'Agents reach the record, and a session can ask where it stands',
    body:
      'An agent gets the same typed surface a person does, over MCP and from the command line. ' +
      'One call returns its run, its project, the last handoff and what is ' +
      'waiting on the owner.',
    commits: ['b291dcf0', 'd92523ec'],
  },
  {
    date: '2026-09-11',
    kind: 'shipped',
    title: 'Signing in works end to end',
    body:
      'Sign-in worked in halves, so nobody could get all the way in. It works ' +
      'end to end now, and its page was rebuilt around it. The landing page dropped its ' +
      'screenshots and reads its first list from a record.',
    commits: ['d7459d26', '4464966e'],
  },
  {
    date: '2026-09-10',
    kind: 'changed',
    title: 'Seventeen renames, and not one of them an id',
    body:
      'The product says the word a reader would say and the API keeps its own. Track became ' +
      'Thread, Estate became Services, Thing became Project, State became Status. Nothing ' +
      'renamed is an id, a document or a format.',
    commits: ['66fda93a'],
  },
  {
    date: '2026-09-10',
    kind: 'fixed',
    title: 'A page made of figures named no register, and was handed to everybody',
    body:
      'A table block names the list it draws and a block of figures does not, so a page of ' +
      'figures was treated as prose. It was handed to every caller, including a read token ' +
      'whose reach is one list. Fifty-two requests on six routes answered 500 rather than a ' +
      'refusal.',
    commits: ['08bbafcf'],
  },
  {
    date: '2026-09-10',
    kind: 'fixed',
    title: 'A sheet destroyed while open took the keyboard with it',
    body:
      'A sheet destroyed while open never gave the keyboard lock back, so every bare key in ' +
      'the product died for the rest of the session. Two clicks from the front page reach it. ' +
      'The audit log can be narrowed by when as well now.',
    commits: ['cad41358'],
  },
  {
    date: '2026-09-10',
    kind: 'fixed',
    title: 'The two engines were asked the same questions and disagreed sixteen times',
    body:
      'Both engines were driven over the same record: 336 measurements, 3,563 filter ' +
      'sentences, 38 searches, 16 cash walks. Sixteen live disagreements, twelve of which the ' +
      'browser had right. A sum of sterling invoices declared in dollars was printed rather ' +
      'than refused.',
    commits: ['384e097e'],
  },
  {
    date: '2026-09-10',
    kind: 'fixed',
    title: 'A money average was stored ten thousand times too large',
    body:
      'Two rows at 101 and 102 pounds averaged to 101.5 and were written as 1,015,000, which ' +
      'every surface renders as ten thousand pounds. The value and the currency are decided ' +
      'together now. Twenty-two findings in the same pass.',
    commits: ['c27c5015'],
  },
  {
    date: '2026-09-10',
    kind: 'fixed',
    title: 'Eight controls that drew, announced themselves and did nothing',
    body:
      'Every segmented control dropped the value you chose: the form held it in one place and ' +
      'read it from another. The drawer added the row twice on one press. A second edit of a ' +
      'cell opened on the original value, and the rail folded nothing.',
    commits: ['160b3e8c', '06bdbd92'],
  },
  {
    date: '2026-09-10',
    kind: 'changed',
    title: 'The record got a face somebody opens rather than a wireframe',
    body:
      'Indigo controls, a near-black ground, Geist, and lists without boxes. The rows carry the ' +
      'colour the record already held. The list went back above the fold on a phone.',
    commits: ['1cfea41b', '6d93ad92', '275f5d5a'],
  },
  {
    date: '2026-09-09',
    kind: 'shipped',
    title: 'The app is deployed, from two hostnames and one build',
    body:
      'Every push to the main branch builds and deploys the record app. A second hostname ' +
      'takes the same build from a branch that only moves forward, and wears its own accent, ' +
      'badge and word in the tab.',
    commits: ['4e6f0eb3', '413d90e1', 'f0a54383'],
  },
  {
    date: '2026-09-09',
    kind: 'fixed',
    title: 'Four gates were asked what input would make them fire',
    body:
      'A gate that has never failed may not work. Each source gate was asked what input would ' +
      'make it fire. The answers were 1 of 7, 3 of 10, a check blind to its own file, and 2 ' +
      'of 16.',
    commits: ['471c5ba9', 'b209da0b', '8c7600ef', '1fa00fbe'],
  },
  {
    date: '2026-09-09',
    kind: 'fixed',
    title: 'Seven surfaces said something untrue, and one navigated away from its own outcome',
    body:
      'A palette nobody could turn on, and a screen that left before showing what it had done. ' +
      'The app stopped claiming writes that had not happened. The live marketing site had its ' +
      'dead links and its untrue sentences taken off.',
    commits: ['c573a825', '098c7533', '2af68035'],
  },
  {
    date: '2026-09-09',
    kind: 'shipped',
    title: 'The palette became a panel you reach objects through',
    body:
      'It ran commands and could not reach a row. A changed row stays where it was and carries ' +
      "its verbs on it. The capture line adds an incomplete row, and the register's own states " +
      'sit on the row menu.',
    commits: ['315b34dc', '040e692f', '26f4ccce'],
  },
  {
    date: '2026-09-09',
    kind: 'fixed',
    title: 'Six dependency advisories to zero',
    body:
      'Three packages moved off version ranges with known holes, and the audit reports ' +
      'nothing. Nothing published inside the last twenty-four hours installs here.',
    commits: ['87734420'],
  },
  {
    date: '2026-09-08',
    kind: 'shipped',
    title: 'The empty record, which nothing had ever looked at',
    body:
      'The screen somebody sees the hour they install went six audits unmeasured. It called ' +
      'their finances healthy, four green ticks over four zeroes, under 996 pixels of the same ' +
      'three sentences repeated four times.',
    commits: ['41ae2d41'],
  },
  {
    date: '2026-09-08',
    kind: 'fixed',
    title: 'No list renders more than it admits to',
    body:
      'On 2,614 rows the first paint was 4,001 rows and 102,681 nodes, and eight seconds to ' +
      'settle. It is 201 rows and 3,137 nodes now, paging to the cap as you scroll.',
    commits: ['2ad19bf8'],
  },
  {
    date: '2026-09-08',
    kind: 'shipped',
    title: 'Search, and a list that pages by key instead of by counting',
    body:
      'A list paged by offset, which shifts under any row somebody adds while you read it. It ' +
      'pages by key now, and /search exists. A review of the day-old paging found six defects ' +
      'in it.',
    commits: ['fe3538af', 'ddca3517'],
  },
  {
    date: '2026-09-08',
    kind: 'fixed',
    title: 'The module that decides who can see your business had no test',
    body:
      'Nothing anywhere exercised the module every call checks, and it had already shipped two ' +
      'authorisation defects. Twenty-five mutations are caught now, and one found a last-owner ' +
      'guard that could never fire.',
    commits: ['a75ec720'],
  },
  {
    date: '2026-09-08',
    kind: 'fixed',
    title: 'Eleven settings areas were measured by nothing, and the permission check failed open',
    body:
      'The check answered yes where it could not answer at all. Eleven settings areas had ' +
      'nothing measuring them and the screens were wrong. Three of them now carry what the ' +
      'documents place on them.',
    commits: ['c4de8942', 'b03b63b2', '57744904'],
  },
  {
    date: '2026-09-08',
    kind: 'shipped',
    title: 'Somewhere to type the code every machine prints',
    body:
      'The settings area a signing-in machine sends you to had no input in it at all. Its ' +
      'Approve button asked for a six-digit code no control on the page could take.',
    commits: ['160b4af1'],
  },
  {
    date: '2026-09-07',
    kind: 'changed',
    title: 'Usability is a lens every iteration, not a phase',
    body:
      'Twelve settings screens called themselves a mock-up, and a phone read a money page ' +
      'through a 356-pixel window onto a 450-pixel table. A gate measures every route on a ' +
      'phone now: no clipping, no sideways scroll, no target under 44 pixels.',
    commits: ['791978ed', '0ddd1591', '9c018494'],
  },
  {
    date: '2026-09-07',
    kind: 'shipped',
    title: 'Day one, which was the one state this product could not show',
    body:
      'Seven settings areas said the same sentence and it was about the build. Two areas an ' +
      'earlier draft had dropped are back. The first day of a record is a state the product ' +
      'draws now.',
    commits: ['c1d692b3', 'd03dba77', 'dcb55c5e'],
  },
  {
    date: '2026-09-07',
    kind: 'fixed',
    title: 'The root key survived every boot, in a pool Node hands to the next caller',
    body:
      'Node hands a reused buffer to whoever asks for one next, and the root key was sitting ' +
      'in it. It is wiped now.',
    commits: ['430e7b78'],
  },
  {
    date: '2026-09-07',
    kind: 'fixed',
    title: 'The words this product is built out of were defined in a file nothing imported',
    body:
      'Row, page and block were each defined once, in a module no screen read. The audit log ' +
      'was printed in assignment notation and the inbox in a small language. Both read as ' +
      'English now.',
    commits: ['f1245e98', '96d059d1'],
  },
  {
    date: '2026-09-06',
    kind: 'shipped',
    title: 'A record can create itself, and says who wrote it',
    body:
      'Nothing in this repository could make a new record until this week. A record file ' +
      'records which build wrote it, and refuses to open if it does not say.',
    commits: ['56bd93c5', '0445f5b0'],
  },
  {
    date: '2026-09-06',
    kind: 'shipped',
    title: 'Packs: a plan somebody wrote is a thing you install',
    body:
      'A pack is a file holding lists, pages, rules and figures. Installing one adds and never ' +
      "replaces. The product's own modules are written in that format, so the format carries " +
      'the shape of the product.',
    commits: ['f0efcae9', 'f019c6c1', '0da56912'],
  },
  {
    date: '2026-09-06',
    kind: 'shipped',
    title: 'A level per register, so a bookkeeper sees the books and nothing else',
    body:
      'One level over a whole record cannot invite a bookkeeper in. A level is per register ' +
      'now, and an agent carries a token of its own. Four more permission holes closed, and ' +
      'the central act says what it would write.',
    commits: ['759026c4', 'be9918a8', 'ee18fd99'],
  },
  {
    date: '2026-09-06',
    kind: 'shipped',
    title: 'Signing in reaches the record, and a record is created with the keys it needs',
    body:
      "Nothing did the record's half of signing somebody in. It is done now. A record was " +
      'being created without its key-encrypting key and two others, so its vault could hold ' +
      'nothing.',
    commits: ['885d23ff', 'be4a04a2'],
  },
  {
    date: '2026-09-06',
    kind: 'shipped',
    title: 'The record notices things, and what it noticed reaches a person',
    body:
      'The loop that watches a record reached nobody at all. Its output arrives now, it grades ' +
      'itself, and it remembers what it asked. A prediction it got wrong comes back to the ' +
      'person who set it.',
    commits: ['24c3cab7', '678a7923', '6c8b492e'],
  },
  {
    date: '2026-09-06',
    kind: 'fixed',
    title: 'Removal did not revoke, and a revoked token was a promotion',
    body:
      'Taking somebody off a record left their token working. Revoking one widened what it ' +
      "could reach rather than closing it. Six holes in this product's central promise closed " +
      'in the same pass.',
    commits: ['df447e1b', 'f671b982'],
  },
  {
    date: '2026-09-06',
    kind: 'fixed',
    title: 'A pack could put SQL in a query, and money was read a thousand times too small',
    body:
      'A field id out of a pack reached the query instead of being refused at install. The ' +
      'record stored one minor unit and drew another. Both are refused at the door now.',
    commits: ['8ddbed06', '00acb8a6', '428c9ec3'],
  },
  {
    date: '2026-09-05',
    kind: 'shipped',
    title: 'The backend, from the schema up',
    body:
      'Fourteen iterations: the schema, the ledger, the sixteen types, the write path, who may ' +
      'ask what, search, the vault, rules and the export.',
    commits: ['fd3a41c7', '8fbdb65d', '546d8f48', '6b935f33'],
  },
  {
    date: '2026-09-05',
    kind: 'shipped',
    title: 'Rules: a declaration that says what happens when a row looks a certain way',
    body:
      'A rule reads the shape of a row and says what to do about it. It can make a matrix of ' +
      'rows, or ask rather than act. You can see what one would do before anybody turns it on.',
    commits: ['5cda46fd', 'f932a01b', 'f2c5a1a5'],
  },
  {
    date: '2026-09-05',
    kind: 'shipped',
    title: 'The vault: what a key opens, never the key',
    body:
      'A record needs credentials and must never hold one in the open. The vault indexes what ' +
      'each key opens and keeps the key sealed. Four tools an agent can ask were added, and ' +
      'none of them reads a credential.',
    commits: ['309be377', '17183da0'],
  },
  {
    date: '2026-09-05',
    kind: 'shipped',
    title: 'The Directory, the doorbell, and the first thing that goes all the way out',
    body:
      'The Directory answers which record a name belongs to, and the doorbell is the other end ' +
      'of it. The outbox has an alarm driving it. The digest is the first thing this product ' +
      'sends to somebody outside it.',
    commits: ['9405a142', '82228a7b', '8c8920cb'],
  },
  {
    date: '2026-09-05',
    kind: 'shipped',
    title: 'A figure is a question, and a series is its answers',
    body:
      'A metric declares the question and the record answers it over time. The nine it ships ' +
      'with are read two ways and the readings compared. One number is drawn over the same ' +
      'rows the page behind it lists.',
    commits: ['8d956d41', 'e7fb105b', 'a02f3ccd'],
  },
  {
    date: '2026-09-05',
    kind: 'shipped',
    title: 'A payload arrives from outside and the record fills itself',
    body:
      'Ingest takes what arrives and writes rows out of it. The pull command exists, and all ' +
      'ten kinds of schedule are handled.',
    commits: ['b5934c99', '9abaac2c'],
  },
  {
    date: '2026-09-05',
    kind: 'shipped',
    title: 'The pages are documents the record holds, and it reads its own',
    body:
      'A page was markup in the app. It is a document in the record now, and the record reads ' +
      'its own pages like any other.',
    commits: ['1612cd17', '0ea90d5a'],
  },
  {
    date: '2026-09-05',
    kind: 'fixed',
    title: 'Five ways scheduled work stopped and reported that it was fine',
    body:
      'Testing drove the scheduler, the rules and the figures over a day of work. It found five ' +
      'ways the scheduler stopped while reporting success. It also found four rules acting wrongly ' +
      'unobserved, and four numbers that came out plausible and wrong.',
    commits: ['7f9a53e7', '0b2a00f1', 'cb82e087'],
  },
  {
    date: '2026-09-04',
    kind: 'shipped',
    title: 'Order and span, and a page that is about one project',
    body:
      'Arranging a page is two operations and no more. The money page walks the runway to the ' +
      'first day the balance goes under, and names the row that crosses it.',
    commits: ['93b07862', '99a6c460', 'e59d74bf'],
  },
  {
    date: '2026-09-04',
    kind: 'shipped',
    title: 'brain.dog, which is this site',
    body:
      'Prerendered, every page finished HTML on disk, and readable with scripting off. It ' +
      "imports the record app's design system rather than resembling it.",
    commits: ['615520e0', '3ea59462'],
  },
  {
    date: '2026-09-04',
    kind: 'shipped',
    title: 'Every key the keymap advertised is bound to something',
    body:
      'Five keys were advertised and bound to nothing, and a guard was eating four of the nine ' +
      'grid keys. Every registered key is live now. The row menu and the phone came in the ' +
      'same pass.',
    commits: ['3ec8d944', 'c92f1622', 'b7c57461'],
  },
  {
    date: '2026-09-04',
    kind: 'shipped',
    title: 'The block picker, and binding a block without promising more than it does',
    body:
      'Every tile in the picker is drawn rather than named. Binding a block is the smallest ' +
      'wizard that does not lie about what it did. The page shows where the block is going to ' +
      'land.',
    commits: ['46960c9b', '6d78967c', '99c40090'],
  },
  {
    date: '2026-09-04',
    kind: 'shipped',
    title: 'Tracks: the line of work a session can be pinned to',
    body:
      'A session had no way to say which line of work it belonged to. A track is a row you pin ' +
      'it to, and the track page is what the pin was for.',
    commits: ['cc91805f', '233e1b20'],
  },
  {
    date: '2026-09-04',
    kind: 'fixed',
    title: 'Ten controls that did nothing at all, and a gate that found five more',
    body:
      'Ten controls drew, announced themselves and acted on nothing. An accessibility gate ' +
      'reads both apps and every state now, and it found five real defects on its first run. ' +
      'A layout gate takes its widths from the stylesheets rather than from a list.',
    commits: ['6d007e5f', 'c394b6df', '2e2126a4'],
  },
  {
    date: '2026-09-03',
    kind: 'changed',
    title: 'One skin, because there are two apps now',
    body:
      'Tokens, element defaults, the accessibility layer, the palette and the mark moved into ' +
      'one package both apps import. A second copy of a type scale is a type scale that ' +
      'drifts.',
    commits: ['4b0fa4b4'],
  },
  {
    date: '2026-09-03',
    kind: 'shipped',
    title: 'Nineteen screens: the spine, the gate, the grid, and a page that is a row',
    body:
      'The app was a shell, a renderer and Home. It has nineteen screens now, including the ' +
      'grid and a page that is one row. The renderer is components rather than one function.',
    commits: ['b74e381e', '63b5e894'],
  },
  {
    date: '2026-09-03',
    kind: 'shipped',
    title: 'The new-row form is generated from the declaration',
    body:
      'A register declares its fields, so the field type picks the control. A pack that adds a ' +
      'field gets a form field, and a secret field is absent rather than disabled.',
    commits: ['64ec9e2c'],
  },
  {
    date: '2026-09-03',
    kind: 'shipped',
    title: 'The toast stack, and the undo that is the reason for it',
    body:
      'A destructive action here is undone, not confirmed. A confirmation asks its question ' +
      'when the reader knows the least they ever will. Ten seconds, paused under the pointer.',
    commits: ['f6722c4c'],
  },
  {
    date: '2026-09-03',
    kind: 'changed',
    title: 'The red is a third quieter, and it is the accent again',
    body:
      'The first house red read as an alarm going off on a screen where nothing was wrong. ' +
      'Same hue, a third less chroma. The old value is the band the overdue chip is struck ' +
      'from.',
    commits: ['59ebd308', 'fa06766b'],
  },
  {
    date: '2026-09-03',
    kind: 'fixed',
    title: 'A link and an overdue figure were the same colour',
    body:
      'The accent and the overdue red share a hue, and in the light scheme they landed one ' +
      'value apart. The generator walks the link until it is eight L* clear of body ink and of ' +
      'the overdue red.',
    commits: ['dadc7045'],
  },
  {
    date: '2026-09-03',
    kind: 'fixed',
    title: 'A record switcher that switched nothing, and three hover states you could not see',
    body:
      'The switcher in the rail drew a list of records and changed nothing. Three hover states ' +
      'rendered at an ink nobody could tell from rest. A shared page drew two headings with ' +
      'nothing under them.',
    commits: ['1df8affb', 'fedd2140', '9dee446e'],
  },
  {
    date: '2026-09-03',
    kind: 'shipped',
    title: 'The theme generator, and a palette that had to argue for itself',
    body:
      'Themes are generated by solving for contrast rather than picking lightness, so most of ' +
      'the sixteen accessibility checks become tautologies. A theme that fails is refused, ' +
      'naming the pair and what to move.',
    commits: ['fceeda06'],
  },
  {
    date: '2026-09-02',
    kind: 'shipped',
    title: 'The design set closed, after an adversarial review changed it',
    body:
      'Four reviewers audited consistency, feasibility, usability and the thesis. The roadmap ' +
      'was roughly three times optimistic, and the index model would have failed at the ' +
      'twelfth installed pack.',
    commits: ['7b2cda95', '46cd6e48'],
  },
];
