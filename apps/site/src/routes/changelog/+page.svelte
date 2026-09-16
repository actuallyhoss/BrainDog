<!--
  The changelog, and it opens with the state of the product.

  14 §5 calls this "the single highest-leverage community artefact for a solo product: proof of
  life". Proof of life is only proof if it is true, so the first thing on the page is the status.

  IT SAID "NOTHING HAS SHIPPED YET" FOR SIX DAYS AFTER SOMETHING DID. The app has been deployed from
  this repository on every push since 2026-09-08, from two hostnames, and the newest entry under that
  sentence was dated 2026-09-03. A changelog that is stale is worse than no changelog: the artefact
  whose entire job is to prove the thing is alive was the best evidence on the site that it was not.

  Entries are the repository's own, dated, in its own words, and drawn from its commit subjects,
  which are already written as release notes. Each says what changed and, where the change was a
  reversal, what the earlier answer was and why it was wrong. That is the same rule the design
  documents follow and the reason they are worth reading.

  NO LINK TO A RELEASES PAGE. This repository tags and does not publish GitHub Releases, so a link
  to one would be a 404 with a promise attached.
-->
<script lang="ts">
  import Icon from '$lib/Icon.svelte';
  import type { Hue } from '$lib/icons.ts';
  import { APP, SOURCE, site } from '$lib/copy.ts';

  type Entry = { date: string; title: string; body: string; kind: 'shipped' | 'changed' | 'fixed' };

  const STATUS = {
    title: 'The app is live. Nothing is for sale yet.',
    /* THREE SENTENCES, AND IT WAS NINE. At the top of the page it was a 120-word block over the
       first entry, and the entries below already say, day by day, what it summarised. */
    body:
      'The record app deploys from this repository on every green build, and you can open it. ' +
      'For now it draws a made-up record: there is no sign-up, no billing and no release to install. ' +
      'This page says what is built, what is not, and what is wrong with what is.',
  };

  const ENTRIES: Entry[] = [
    {
      date: '2026-09-16',
      kind: 'shipped',
      title: 'Signing in works, and there is still nothing to sign in to',
      body:
        'The hosted app answered every question about signing in with the word off until this ' +
        'morning, because the one secret its sessions are built on had never been set on the ' +
        'production server. It is set, and the app now offers a passkey and a first-run path. ' +
        'That is one half of a door. The other half is a record to open, and none can be made ' +
        'yet, because the key the making of a record needs is still unset. There is no ' +
        'self-service sign-up either: a record is made by the operator, not by a visitor. So ' +
        'signing in works and has nothing behind it, which is a smaller thing than it sounds and ' +
        'the only honest way to say it.',
    },
    {
      date: '2026-09-16',
      kind: 'changed',
      title: 'The status report said the writing had not started, and six modules of it had landed',
      body:
        'The report kept a table of how far along each part of the product is, and the row for ' +
        'the app writing anything down read nothing started. Six write modules and their tests ' +
        'were already in the tree, for rows, the decision queue, the inbox, declared pages, ' +
        'settings and packs, and both list screens were writing through them. The row above it ' +
        'had been revised every time a screen learned to read, so the table was current ' +
        'everywhere except the line somebody would most want to trust. The figure is a count now ' +
        'rather than an estimate: of fifty-two gestures that tell you nothing was saved, ' +
        'thirty-seven are the demo being honest about being a demo, and fifteen are reachable on ' +
        'a real record and each want a write path that does not exist yet.',
    },
    {
      date: '2026-09-16',
      kind: 'shipped',
      title: 'A page is a file you can pull, edit and push back',
      body:
        'The name was on the wrong thing. A .dog file is a page\'s source now, one page to one ' +
        'file, which is what somebody means when they open the source of a page; the file holding ' +
        'a whole record is a .brain, and its readable dump a .brainl. The app could already print ' +
        'that source and could do nothing else with it, so the text was a box to look at: it ' +
        'could not be saved, sent to anybody, or edited and applied. It is a file you can keep ' +
        'now, and the command line pulls one, checks it against the grammar without sending ' +
        'anything, and pushes it back. Pushing needed a reader, because the old code only ever ' +
        'wrote. A file carrying rows somebody typed is refused rather than pushed, because the ' +
        'printed form keeps only how many there were, and the alternative is a push that quietly ' +
        'replaces real rows with nothing. One part does not work yet. The earlier answer here was ' +
        'that pushing needed a new door built beside the one the key store got, and that was ' +
        'wrong: that door is safe precisely because it admits only a credential the record ' +
        'already accepts, and a command line holds exactly the kind the record refuses, so there ' +
        'is no narrow version of it. What stands in the way is a written decision, and changing ' +
        'it belongs to the owner rather than to the code.',
    },
    {
      date: '2026-09-16',
      kind: 'changed',
      title: 'The rail collapses to its glyphs instead of being taken away',
      body:
        'Collapsing the sidebar removed every row of navigation and left one button in an empty ' +
        'gutter. The setting survives a reload, so a keyboard shortcut pressed by accident stayed ' +
        'pressed, and one screen swept in that state offered six controls of which all six were ' +
        'the same Reveal button. Nobody means that by collapsed. They mean the rail that keeps ' +
        'its glyphs, so the same setting narrows it now, every row survives, and each glyph hands ' +
        'its name back on hover and on focus. The design documents said flatly not a top nav, and ' +
        'the argument under it is good about the default: the navigation is a query over the ' +
        'pages a record holds, so it varies in length from one business to the next, and a ' +
        'horizontal strip hides the part that varies the moment it overflows. It is not a good ' +
        'argument about somebody with four entries and a wide screen, so the sentence says not by ' +
        'default now, and a top bar and a menu are shapes a person can ask for, with the top bar ' +
        'stating how many pages sit behind More rather than swallowing them. A design agent reads ' +
        'the record and recommends one of the shapes with the numbers it counted, and never ' +
        'applies one.',
    },
    {
      date: '2026-09-16',
      kind: 'shipped',
      title: 'The record switcher lists every record you can reach',
      body:
        'It held the one record you were already inside, under a sentence explaining that it ' +
        'could not do better, because nothing anywhere answered the question of which records an ' +
        'account holds. A record cannot answer that about itself without reaching across every ' +
        'other customer record, which is the one shape the boundary between customers forbids, so ' +
        'it is a read at the level of the account instead. The directory is asked which records ' +
        'are open to a person, and then every one of those records is asked about itself, and a ' +
        'row is kept only where the record itself answers with a level. That second half is the ' +
        'whole security of it: the two lists of who belongs cannot be written in one transaction, ' +
        'so they drift, and somebody removed from a record can still be sitting in the directory. ' +
        'A read that is refused keeps the record you are standing in and says why the rest are ' +
        'missing, in the words the server used.',
    },
    {
      date: '2026-09-16',
      kind: 'shipped',
      title: 'A row is edited a field at a time, and what points at it is read from the record',
      body:
        'A row\'s page takes one field at a time and writes each change through, rather than ' +
        'offering the whole row or nothing. What points at that row is read from the record as ' +
        'well, so following a reference back arrives at real rows rather than at the demo\'s copy ' +
        'of them. A key can be put into the vault from the browser now, through the key doors ' +
        'both the self-hosted server and the hosted one serve, which leaves the rule about ' +
        'credentials where it was: the host seals the key and the record only ever says what it ' +
        'opens.',
    },
    {
      date: '2026-09-16',
      kind: 'changed',
      title: 'A saved view is a row the record holds, not a URL',
      body:
        'A view was page state: a filter sitting in an address, lost when the tab closed and ' +
        'impossible for a colleague to open. It is a row on a list now, carrying its filter, its ' +
        'search, its order and its columns, and who first saved it and when. It lives in the part ' +
        'of the record that does not travel in an export, because a view is how this record looks ' +
        'at its own rows rather than a fact about the business. Saving one and retiring one are ' +
        'owner-level acts rather than bookmarks, because a saved view goes onto the list everyone ' +
        'sees, which makes it a change to what the record offers.',
    },
    {
      date: '2026-09-16',
      kind: 'fixed',
      title: 'The first row you type is written down, instead of being told it went nowhere',
      body:
        'The button that commits the first row somebody types had no live path at all. It put the ' +
        'row aside and printed that nothing had been saved, whatever it was looking at, so a ' +
        'person with a record of their own pressed the most consequential button in the product ' +
        'and was told the one true fact they had typed had gone nowhere. It had, and they had to ' +
        'type it again somewhere else. On a record the row is written now, and the outcome names ' +
        'it and the list it is at the top of; pressing a second time corrects the row it wrote ' +
        'rather than leaving another one behind, because the form stays on screen and fixing a ' +
        'typo is the ordinary next thing to do. On the demo nothing changes, and the row still ' +
        'waits, which is the truth about a tab with no record behind it. Rows that are waiting ' +
        'are counted above every screen now rather than only on the one list the person has ' +
        'already walked away from.',
    },
    {
      date: '2026-09-16',
      kind: 'shipped',
      title: 'The app deploys itself, and a gate checks that the deploy landed',
      body:
        'The operations document has said since it was written that a forward deploy comes from ' +
        'the pipeline and never from somebody\'s laptop, and there was no pipeline, so the ' +
        'procedure written down was not the procedure being followed, which is the one thing a ' +
        'written procedure is for. There is one now. It runs after the checks finish rather than ' +
        'on the push, because only that can say the main branch is green; it builds the commit ' +
        'the checks measured rather than the newest one, so it never ships something nothing has ' +
        'looked at; and it queues rather than cancels, because a cancelled deploy is one killed ' +
        'between uploading a version and turning it on. The deploy tool reports success while the ' +
        'host is still serving the previous version, which is recorded three times, so a gate ' +
        'compares the live app against the bytes just built and asks the running server which ' +
        'version it believes it is. The app deploys to app.brain.dog this way. This site is meant ' +
        'to follow in the same run and does not today: its step sits after that gate, and the ' +
        'gate has been stopping first, which is why this page can be a day behind the app it ' +
        'describes.',
    },
    {
      date: '2026-09-16',
      kind: 'fixed',
      title: 'Three screens drew invented rows under your own heading',
      body:
        'Three screens could be reached on a real record and all three drew the built-in demo ' +
        'whatever record was open, so somebody signed into their own business was shown made-up ' +
        'rows under their own heading with nothing saying which they were. The thread view simply ' +
        'never asked the record, and it asks now, through the same working-out the demo goes ' +
        'through, so one piece of code serves both and the two cannot drift apart. The other two ' +
        'have no way to read at all: nothing answers with what an agent run called, and a share ' +
        'link resolves against a list written into the page, so both drew the same rows for every ' +
        'reader. Neither invents one now. Each says what it is instead, once, where the demo ' +
        'already says so.',
    },
    {
      date: '2026-09-15',
      kind: 'shipped',
      title: 'The app writes to a real record, and most of its screens read one',
      body:
        'Until this week every screen drew a made-up business. The list, search, a row\'s page, ' +
        'the decision queue, declared pages, the layout, home, history and the inbox read the ' +
        'record now, and each says so where a block cannot be drawn live rather than quietly ' +
        'showing the demo instead. Then they began writing to it: rows added, cells edited, a ' +
        'state set on one row or on a selection, a decision answered or put off, an arrival filed ' +
        'into a list or archived, cards moved and tasks ticked on a declared page, levels ' +
        'changed, tokens made and revoked, packs installed and removed. Rows archive and restore ' +
        'with an undo rather than a confirmation. A self-hosted record can be copied, put back ' +
        'and deleted; the hosted one says plainly that it cannot and points at the export.',
    },
    {
      date: '2026-09-14',
      kind: 'changed',
      title: 'Everything is a module, and the first question is who are you',
      body:
        'The direction changed on the owner\'s instruction. Every module can be turned off and on ' +
        'again, People included, and the first thing setting up a record asks is who you are, ' +
        'filling the first person in People with the answer. The record is the data and ' +
        'visualisation layer for AI agents, and when a choice trades that against something else, ' +
        'that wins. The documents the next pass had to revisit are listed beside the decision, ' +
        'because a change of direction that does not say what it invalidates is one nobody can ' +
        'act on.',
    },
    {
      date: '2026-09-11',
      kind: 'shipped',
      title: 'Agents reach the record, and a session can ask where it stands',
      body:
        'An agent gets the same typed surface a person does, over the protocol agent tools ' +
        'already speak, offered both by the command line and over the network by both hosts, with ' +
        'the caller\'s token checked before the body is read. Every agent gets a run, a run ' +
        'carries the project it belongs to, and a session can ask the record where it stands in ' +
        'one call: its run, its project, the last handoff, who else is working, what is waiting ' +
        'on the owner and the question each of those asks, with keys shown only as sealed. ' +
        'Signing in works end to end on a self-hosted record from the same week, with passkeys, ' +
        'sessions, and a lockout reserved before the comparison rather than after it. The hosted ' +
        'half shipped switched off, waiting on a secret nobody had set.',
    },
    {
      date: '2026-09-10',
      kind: 'changed',
      title: 'Seventeen renames, and not one of them an id',
      body:
        'The product says the word a reader would say and the API keeps its own, which is the rule ' +
        'Slack follows: a channel is a channel for life while the API says conversations. Track ' +
        'became Thread, Estate became Services, Thing became Project, State became Status on five ' +
        'lists and on the board, and the word register itself came out of four places a reader ' +
        'meets it, three of them messages typed into routes rather than into the copy file, which ' +
        'is why a sweep of visible text could not see them. Nothing renamed is an id, a document ' +
        'or a format. The plan was wrong about seven of the seventeen, every time in the same ' +
        'direction: an occurrence it had missed rather than one it invented.',
    },
    {
      date: '2026-09-10',
      kind: 'fixed',
      title: 'A page made of figures named no register, and was handed to everybody',
      body:
        'A table block names the list it draws; a block of figures does not, because each of its ' +
        'cells names a measurement whose own declaration carries the list. Both the listing filter ' +
        'and the per-block blanking read the block alone, so a page of figures was treated as ' +
        'prose, offered to every caller and handed its readings over, including to a read token ' +
        'whose reach is one list. The money page the synthetic record ships is exactly that shape. ' +
        'Fifty-two requests on six routes answered 500 rather than a refusal, because every query ' +
        'value is JSON-decoded and the caller therefore chooses its shape as well as its contents.',
    },
    {
      date: '2026-09-10',
      kind: 'fixed',
      title: 'A sheet destroyed while open took the keyboard with it',
      body:
        'Overlays are a depth, and the shell only answers an unmodified key while that depth is ' +
        'zero. The count went up when a sheet opened and came back down in the same effect, which ' +
        'needs the component to still be alive, so a sheet that was destroyed while open never ' +
        'gave the lock back and every bare key in the product died for the rest of the session. ' +
        'Two clicks from the front page reach it. The audit log answers the question it is sent ' +
        'for now as well: the restore setting links to it with the words find the moment, and what ' +
        'arrived was a list filtered by person and by kind with no way to narrow by when at all.',
    },
    {
      date: '2026-09-10',
      kind: 'fixed',
      title: 'The two engines were asked the same questions and disagreed sixteen times',
      body:
        'A differential pass drove the typed kernel and the browser copy of it over the same ' +
        'shipped record: 336 measurements, 3,563 filter sentences, 38 searches, 16 cash walks and ' +
        '8 block declarations, comparing answers rather than reading source. Sixteen live ' +
        'disagreements, twelve of which the browser had right. A sum of sterling invoices declared ' +
        'in dollars was printed rather than refused. A stored moment compared against a date ' +
        'matched nothing while its negation matched everything. Seven of the eleven filters the ' +
        'shipped pages print were refused by the record that printed them, because a page prints ' +
        'its filter back using each column heading rather than each field id.',
    },
    {
      date: '2026-09-10',
      kind: 'fixed',
      title: 'A money average was stored ten thousand times too large',
      body:
        'One function took a value and nothing else, so any fractional figure became hundredths of ' +
        'a percent, while each of its three callers wrote the currency from a separate expression ' +
        'that correctly kept a real one. Two rows at 101 and 102 pounds read 101.5 and were ' +
        'written as 1,015,000, which every surface in this product renders as ten thousand pounds. ' +
        'The value and the currency are decided together now. Twenty-two findings in the same ' +
        'pass: a record twelve hours ahead of UTC stamped today on yesterday, a cash walk added a ' +
        'string as though it were money, and a caller allowed only to append to one list could ' +
        'read its rows through search.',
    },
    {
      date: '2026-09-10',
      kind: 'fixed',
      title: 'Eight controls that drew, announced themselves and did nothing',
      body:
        'Every segmented control dropped the value somebody chose: the form held it in one place ' +
        'and read it from another, so on nearly every form in the product a press was a drawing of ' +
        'a press, and a row added from the money list arrived with two required fields empty under ' +
        'a live submit button. The drawer added the row twice on one press. Opening a row you had ' +
        'just typed said it did not exist. The cell editor read the record rather than the screen, ' +
        'so a second edit of one cell opened on the original value and Enter reverted your own ' +
        'change. And the rail folded nothing, because hidden is a browser default and every ' +
        'section in it sets a display of its own.',
    },
    {
      date: '2026-09-09',
      kind: 'shipped',
      title: 'The app is deployed, from two hostnames and one build',
      body:
        'Every push to the main branch builds and deploys the record app; a second hostname takes ' +
        'the same two packages from a branch that only moves forward from a green build. The ' +
        'staging one wears its own accent, its own badge and its own word in the tab, because two ' +
        'windows of the same product open beside each other is the confusion the whole mechanism ' +
        'exists to prevent. All four halves of that mechanism had a paragraph beside them asserting ' +
        'they were whole, and none of them was connected: nothing defined the variable the accent ' +
        'hung on, one component was imported by no file but its own, and the stylesheet loaded the ' +
        'other deployment\'s palette on everybody\'s behalf.',
    },
    {
      date: '2026-09-09',
      kind: 'fixed',
      title: 'Four gates were asked what input would make them fire',
      body:
        'A gate that has never failed may not work. Each source gate was asked what input would ' +
        'produce its report and whether such an input reaches it, and the answers were 1 of 7, 3 of ' +
        '10, a check that could not see the file it was about, and the worst at 2 of 16. That last ' +
        'one could not see the function every refusal in the codebase is built by, and could not see ' +
        'a ternary, which was hiding a code that appears nowhere else in the tree.',
    },
    {
      date: '2026-09-09',
      kind: 'fixed',
      title: 'Six dependency advisories to zero',
      body:
        'Three packages moved off version ranges with known holes in them, and the audit reports ' +
        'nothing. Nothing published inside the last twenty-four hours installs here, because the ' +
        'newest version of anything is exactly what an attacker who has just taken a maintainer\'s ' +
        'account publishes. Taking the newest release that satisfies that policy is a decision. ' +
        'Taking the newest release is the absence of one.',
    },
    {
      date: '2026-09-08',
      kind: 'shipped',
      title: 'The empty record, which nothing had ever looked at',
      body:
        'The screen somebody sees the hour they install went six audits unmeasured, because two ' +
        'usability passes could not reach it in a browser and a verification pass recorded it as ' +
        'unreachable. It was telling them their finances were healthy, four green ticks over four ' +
        'zeroes, because zero is under every target. That was under 996 pixels of the same three ' +
        'sentences repeated four times, on a home screen reading "Nothing needs you today", which is ' +
        'the sentence for a record you have worked through.',
    },
    {
      date: '2026-09-08',
      kind: 'fixed',
      title: 'No list renders more than it admits to',
      body:
        'On 2,614 rows the first paint was 4,001 rows and 102,681 nodes, and eight seconds to ' +
        'settle. Every list drew every row it held, and "one body at a time" was enforced with a ' +
        'display rule, which hides one body and builds both. It is 201 rows and 3,137 nodes now, ' +
        'paging to the cap as you scroll, with the head reading 200+ of 2,614 while it does.',
    },
    {
      date: '2026-09-08',
      kind: 'fixed',
      title: 'The module that decides who can see your business had no test',
      body:
        'One function is what every call checks, one method is behind grant, raise, lower and ' +
        'remove, and a last-owner check in three places prevents a state nobody inside the product ' +
        'can get out of. Nothing anywhere exercised any of it, on a module that has already shipped ' +
        'two authorisation defects in opposite directions. Twenty-five mutations are caught now, and ' +
        'one of them found a last-owner guard that could never fire, because the check above it had ' +
        'already refused every case that reached it.',
    },
    {
      date: '2026-09-08',
      kind: 'shipped',
      title: 'Somewhere to type the code every machine prints',
      body:
        'Four documents make one settings area the address a signing-in machine sends you to, and ' +
        'that area had a read-only list with no input in it at all, under an Approve button whose ' +
        'own message mentioned a six-digit code no control on the page could accept. Two of the six ' +
        'states the schema defines had no word either, including the one a request sits in between ' +
        'your click and the machine noticing.',
    },
    {
      date: '2026-09-07',
      kind: 'changed',
      title: 'Usability is a lens every iteration, not a phase',
      body:
        'Twelve settings screens called themselves a mock-up, and seven of them said the same ' +
        'sentence, which was about the build rather than about the setting. A phone read a money ' +
        'page through a 356-pixel window onto a 450-pixel table. Every route is measured on a phone ' +
        'by a gate now rather than by hand: no clipping, no sideways scroll, and no target under 44 ' +
        'pixels under a thumb.',
    },
    {
      date: '2026-09-06',
      kind: 'shipped',
      title: 'A record can create itself, and says who wrote it',
      body:
        'Nothing in this repository could make a new record until this week. It can now, with the ' +
        'key hierarchy a record was previously created without, and a record file records which ' +
        'build wrote it and refuses to open if it does not say.',
    },
    {
      date: '2026-09-05',
      kind: 'shipped',
      title: 'The backend, from the schema up',
      body:
        'Fourteen iterations: the schema and the ledger that keeps it honest, then the sixteen types ' +
        'in and out, then the write path, which is the only thing that changes a record. Then who ' +
        'may ask what, in one place. Then search, the vault, rules, the outbox, and the file a ' +
        'customer can take with them.',
    },
    {
      date: '2026-09-04',
      kind: 'shipped',
      title: 'Order and span, and a page that is about one project',
      body:
        'Arranging a page is two operations and no more. The block picker draws every tile rather ' +
        'than naming it. A page can be pointed at one project, a session can be pinned to a track, ' +
        'and the money page walks the runway to the first day the balance goes under and names the ' +
        'row that crosses it.',
    },
    {
      date: '2026-09-04',
      kind: 'shipped',
      title: 'brain.dog, which is this site',
      body:
        'Prerendered, every page finished HTML on disk, and readable with scripting off. It imports ' +
        'the record app\'s design system rather than resembling it, so a token that changes there ' +
        'changes here.',
    },
    {
      date: '2026-09-03',
      kind: 'changed',
      title: 'One skin, because there are two apps now',
      body:
        'The token layer, the element defaults, the accessibility layer, the generated palette and the mark ' +
        'moved into a package both apps import. A second copy of a type scale is a type scale that drifts, ' +
        'and this site is not a different brand with a similar palette. It is the same system with fewer ' +
        'screens. The mark became data at the same time: it lived in three files, and a brand in three files ' +
        'is a brand two files behind.',
    },
    {
      date: '2026-09-03',
      kind: 'shipped',
      title: 'The new-row form is generated from the declaration',
      body:
        'A register declares its fields and their types, so the field type picks the control. One table, ' +
        'no hand-written form for any register. A pack that adds a field gets a form field. A secret ' +
        'field is absent rather than disabled: a credential never goes in a row.',
    },
    {
      date: '2026-09-03',
      kind: 'shipped',
      title: 'The toast stack, and the undo that is the reason for it',
      body:
        'A destructive action here is undone, not confirmed. A confirmation dialog asks its question before ' +
        'anything has happened, when the reader knows the least they ever will, and the answer is always ' +
        'yes, which is why people stop reading them. Ten seconds, paused while the pointer is over it.',
    },
    {
      date: '2026-09-03',
      kind: 'changed',
      title: 'The red is a third quieter, and it is the accent again',
      body:
        'The first house red was the most saturated red sRGB has at that lightness. Across a rail, a primary ' +
        'button, every link and every selected row it did not read as a brand; it read as an alarm going off ' +
        'on a screen where nothing was wrong. Same hue, a third less chroma. The old value did not go away. ' +
        'It is the band the overdue chip is struck from, so the alarm is always a step louder than the brand.',
    },
    {
      date: '2026-09-03',
      kind: 'fixed',
      title: 'A link and an overdue figure were the same colour',
      body:
        'The accent and the overdue red share a hue by construction and were being solved against the same ' +
        'ground, so in the light scheme they landed one value apart. The generator now solves the link last ' +
        'and walks until it is eight L* clear of body ink AND of the overdue red; the validator measures ' +
        'both pairs.',
    },
    {
      date: '2026-09-03',
      kind: 'shipped',
      title: 'The theme generator, and a palette that had to argue for itself',
      body:
        'Themes are generated by solving for contrast rather than picking lightness, so most of the sixteen ' +
        'accessibility checks become tautologies and only the ones arithmetic cannot drive can fail: separability ' +
        'under simulated colour blindness, ladder monotonicity. A theme that fails is refused, ' +
        'naming the pair and what to move.',
    },
    {
      date: '2026-09-02',
      kind: 'shipped',
      title: 'The design set closed, after an adversarial review changed it',
      body:
        'Four reviewers audited internal consistency, feasibility, usability and the thesis. The two largest ' +
        'findings are in the documents where they landed: the roadmap was roughly three times optimistic, and ' +
        'the index model would have failed at the twelfth installed pack. Every correction says what an ' +
        'earlier draft claimed and why it was wrong, because a design document that quietly fixes itself ' +
        'teaches nobody.',
    },
  ];

  const LABEL = { shipped: 'shipped', changed: 'changed', fixed: 'fixed' } as const;

  /* The word is the meaning and the hue agrees with it: green for new work, blue for a repair, amber
     for a change of course. Three kinds and three hues, so the colour a reader learns from the first
     two is never contradicted by a grey third. */
  const HUE: Record<Entry['kind'], Hue> = { shipped: 'earn', fixed: 'info', changed: 'warn' };

  /**
   * GROUPED BY DAY, because twenty-two identical rows are not a list a person reads.
   *
   * Every entry carried its own date in its own 14ch gutter, and six of them say 2026-09-10. So
   * the column that exists to tell you WHEN was printing the same string six times in a row down
   * the left edge, and the page had no unit larger than one paragraph: no way to see that a day
   * happened, no way to skim to a day, nothing between the heading and five thousand words.
   *
   * The entries are already in date order in the array above and this preserves that order
   * exactly rather than sorting: the order is editorial, most-important-first inside a day, and a
   * sort by date would silently reshuffle it.
   */
  const DAYS: { date: string; entries: Entry[] }[] = [];
  for (const entry of ENTRIES) {
    const last = DAYS.at(-1);
    if (last?.date === entry.date) last.entries.push(entry);
    else DAYS.push({ date: entry.date, entries: [entry] });
  }

  /** How many of each kind, counted from the list above so the numbers cannot drift from it. */
  const KINDS = ['shipped', 'fixed', 'changed'] as const;
  const COUNT: Record<Entry['kind'], number> = { shipped: 0, changed: 0, fixed: 0 };
  for (const entry of ENTRIES) COUNT[entry.kind] += 1;
</script>

<svelte:head>
  <!-- ITS OWN SENTENCE, in copy.ts. The description was STATUS.body at 522 characters, which a
       search result and a shared card both cut mid-paragraph. -->
  <title>{site.meta.changelog.title}</title>
  <meta name="description" content={site.meta.changelog.description} />
  <link rel="canonical" href="https://brain.dog/changelog" />
  <meta property="og:url" content="https://brain.dog/changelog" />
  <meta property="og:title" content={site.meta.changelog.title} />
  <meta property="og:description" content={site.meta.changelog.description} />
</svelte:head>

<section class="head">
  <h1 class="title">{site.nav.changelog}</h1>
  <p class="lede">{site.changelog.lede}</p>
  <!-- THE COUNTS ARE COUNTED, from the list below, so they cannot drift from it. -->
  <p class="counts">
    <span class="count-all">{site.changelog.count(ENTRIES.length, DAYS.length)}</span>
    {#each KINDS as kind}
      <span class="kind" data-hue={HUE[kind]}><span class="dot"></span>{COUNT[kind]} {LABEL[kind]}</span>
    {/each}
  </p>

  <div class="status">
    <div class="status-copy">
      <h2 class="status-title"><span class="live" aria-hidden="true"></span>{STATUS.title}</h2>
      <p class="status-body">{STATUS.body}</p>
      <!-- ONE ACTION WHILE THE REPOSITORY IS PRIVATE, and it is this page's filled primary: the
           status says the app is live, and this is how you see that it is. -->
      <p class="status-links">
        <a class="btn btn-primary" href={APP}>{site.nav.open}<Icon name="arrow" size="s" /></a>
        {#if SOURCE}<a class="btn" href={SOURCE}>{site.nav.source}</a>{/if}
      </p>
    </div>
  </div>
</section>

<div class="log">
  {#each DAYS as day}
    <section class="day">
      <!-- A machine-readable date beside a human one, as a heading, because it is what the entries
           under it belong to, and it holds its place while they scroll past. -->
      <h2 class="day-date"><time class="num" datetime={day.date}>{day.date}</time></h2>
      <ol class="entries">
        {#each day.entries as entry}
          <li class="entry" data-hue={HUE[entry.kind]}>
            <h3 class="entry-title">
              <span class="kind" data-hue={HUE[entry.kind]}><span class="dot"></span>{LABEL[entry.kind]}</span>{entry.title}
            </h3>
            <p class="entry-body">{entry.body}</p>
          </li>
        {/each}
      </ol>
    </section>
  {/each}
</div>

<style>
  .head,
  .log {
    max-inline-size: 960px;
    margin-inline: auto;
    padding-inline: var(--sp-6);
  }

  .head {
    padding-block: clamp(56px, 7vw, 104px) var(--sp-6);
  }

  .title {
    font-size: clamp(36px, 2.4vw + 22px, 56px);
    font-weight: 600;
    line-height: 1.04;
    letter-spacing: -0.04em;
  }

  .lede {
    max-inline-size: 46ch;
    margin-block-start: var(--sp-3);
    color: var(--ink2);
    font-size: clamp(17px, 0.4vw + 15px, 20px);
    line-height: 1.5;
    text-wrap: pretty;
  }

  .counts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    margin-block-start: var(--sp-5);
  }

  .count-all {
    margin-inline-end: var(--sp-2);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* The state of the product, as a plain block between two hairlines with one dot of state on
     it: it is the only thing here that is about now rather than a day in the past. */
  .status {
    margin-block-start: var(--sp-6);
    padding-block: var(--sp-5);
    border-block-start: 1px solid var(--line);
  }

  .live {
    flex: none;
    inline-size: var(--dot);
    block-size: var(--dot);
    background: var(--earn);
    border-radius: var(--r-pill);
  }

  .status-copy {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .status-title {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    font-size: var(--t-base);
    font-weight: 600;
    letter-spacing: 0;
  }

  .status-body {
    max-inline-size: 66ch;
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 1.6;
    text-wrap: pretty;
  }

  .status-links {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-3);
    margin-block-start: var(--sp-1);
  }

  .log {
    padding-block-end: var(--sp-8);
  }

  .day {
    display: grid;
    grid-template-columns: 14ch minmax(0, 1fr);
    gap: var(--sp-5);
    padding-block: var(--sp-6);
    border-block-start: 1px solid var(--line);
  }

  .day-date {
    position: sticky;
    inset-block-start: calc(var(--sticky) + var(--sp-4));
    align-self: start;
    color: var(--dim);
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0;
  }

  /* A RAIL DOWN THE DAY, and a quiet mark on it for each entry, so a day reads as a short run of
     things that happened rather than a stack of paragraphs. The kind's colour is on its label. */
  .entries {
    display: flex;
    flex-direction: column;
    gap: var(--sp-6);
    margin: 0;
    padding-inline: var(--sp-5) 0;
    border-inline-start: 1px solid var(--line);
    list-style: none;
  }

  .entry {
    position: relative;
  }

  .entry::before {
    content: '';
    position: absolute;
    inset-block-start: 0.6em;
    inset-inline-start: calc(var(--sp-5) * -1 - 3px);
    inline-size: 6px;
    block-size: 6px;
    /* THE KIND'S HUE ON THE RAIL, AND NOT A SECOND DOT BESIDE THE WORD. An entry drew a grey mark
       on the rail and a coloured dot sixty pixels right of it on the same line: two dots for one
       entry. The word still carries the kind for a reader who does not see the colour. */
    background: var(--hue);
    border-radius: var(--r-pill);
    box-shadow: 0 0 0 3px var(--bg);
  }

  .entry .dot {
    display: none;
  }

  /* A label on the title's own line: the word is in the ink and the hue is only a dot, so the kind
     reads the same to somebody who does not see green. */
  .kind {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-inline-end: var(--sp-3);
    color: var(--dim);
    font-family: var(--font-ui);
    font-size: var(--t-xs);
    font-weight: 500;
    letter-spacing: 0;
    vertical-align: 0.1em;
  }

  .dot {
    inline-size: 6px;
    block-size: 6px;
    background: var(--hue);
    border-radius: var(--r-pill);
  }

  .entry-title {
    font-size: var(--t-md);
    font-weight: 600;
    line-height: 1.4;
    letter-spacing: -0.01em;
    text-wrap: pretty;
  }

  .entry-body {
    max-inline-size: 74ch;
    margin-block-start: var(--sp-2);
    color: var(--ink2);
    font-size: var(--t-base);
    line-height: 1.65;
    text-wrap: pretty;
  }

  @media (width < 760px) {
    .day {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--sp-4);
      padding-block: var(--sp-5);
    }

    /* Not sticky on a phone: a pinned date on a 390px screen is a line of reading area spent on a
       string the reader can scroll back four inches to find. */
    .day-date {
      position: static;
    }
  }

  @media (width < 640px) {
    .head,
    .log {
      padding-inline: var(--sp-4);
    }

    .lede {
      font-size: var(--t-md);
    }

    .status-links {
      align-self: stretch;
      flex-direction: column;
    }

    .entries {
      padding-inline-start: var(--sp-4);
    }

    .entry::before {
      inset-inline-start: calc(var(--sp-4) * -1 - 3px);
    }
  }
</style>
