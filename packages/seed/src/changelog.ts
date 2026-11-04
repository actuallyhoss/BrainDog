/**
 * What each version of a module this build ships changed, in the words a person reads on its detail page
 * (`apps/web/src/lib/market/listing.ts`).
 *
 * A MODULE HAS NO CATALOGUE FILE, so nothing publishes its `changes` line the way the Kennel publishes an add-on's. The
 * notes live here instead, newest first, one entry for each version a record could have been given. The long record of
 * why each step was taken, and why it was the size it was, stays beside `FIRST_PARTY_VERSIONS` in `packs/first-party.ts`;
 * these are the same steps said plainly, at most 500 characters each, as an add-on's `changes` is.
 *
 * THE NEWEST ENTRY IS THE VERSION THIS BUILD SHIPS. `test/pack-versions.test.ts` fingerprints the versions; a version
 * bumped there and not named here draws on the page with no notes, which says less than it should and nothing false.
 *
 * NOT UNDER `packs/`, because that folder holds only what a record is built from (`agents.ts`, `first-party.ts`), and
 * this is words for a screen (the directory test in `packs/rates-poll/rates-poll.test.ts`).
 */

import type { FirstPartyId } from './packs/first-party.ts';

export type ModuleChange = { version: string; notes: string };

export const MODULE_CHANGES: Readonly<Record<FirstPartyId | 'agents', readonly ModuleChange[]>> = {
  portfolio: [
    { version: '1.31.2', notes: 'Projects opens on your projects. The bar of how they are going is gone; each project says it if it is at risk or off track.' },
    { version: '1.31.1', notes: 'Numbers no longer opens on a line saying what it lists. It still says how to add a key number while it has none.' },
    { version: '1.31.0', notes: 'Numbers with no reading yet says what it will list and how to add a key number, rather than a line about readings over none.' },
    {
      version: '1.30.2',
      notes: 'A card\'s key number is ticked as "Shown first".',
    },
    {
      version: '1.30.1',
      notes: 'A project that leaves the board reads Closed, where it read Finished: its status, the fold in the sidebar and the figures that count them.',
    },
    {
      version: '1.30.0',
      notes: 'Projects opens on today: what is late, due this week, gone quiet or renewing. One list follows, earning first.',
    },
    {
      version: '1.29.0',
      notes: "A project's mark, hue and whether it is kept yet are the list's own bookkeeping, so an agent's short answers about a project no longer say them. The app and the full read still hold them.",
    },
    {
      version: '1.28.0',
      notes: 'Numbers opens on a plain line, and its link says it opens every reading as a table. Where they are counts the projects Projects shows, so Finished is no longer in its total.',
    },
    {
      version: '1.27.0',
      notes: 'A record with no project in play opens Projects on a box to add one, under one line, and says how to set a parked one building only when one is parked.',
    },
    {
      version: '1.26.0',
      notes: "A project's card on Projects says when it was last worked on from its tasks and its agents' runs together, the same time its card on Today says.",
    },
    {
      version: '1.25.0',
      notes: 'Numbers has a page of its own: each kind of number once, under the project it is for, with its newest value and how old it is, and the two that moved most this year as lines. A number opens its chart from its own page.',
    },
    {
      version: '1.24.0',
      notes: 'Setting what kind a project is offers the key numbers that kind is usually judged by, four of them as suggestions you keep or drop, unless the project already has key numbers of its own.',
    },
    {
      version: '1.23.0',
      notes:
        "A project can keep its stages, each with the line that says when it is done, and its page draws them as its road with the next one marked. A project with both can keep its plan as its stages alone or as a roadmap alone, and BrainDog offers the one it drew for it.",
    },
    {
      version: '1.22.0',
      notes: 'Projects offers each project its key numbers from what you already keep in Numbers, once a project, as a question on Decide. Nothing is added until you say yes.',
    },
    {
      version: '1.21.0',
      notes: 'Projects draws a card for every project in play or parked, where it drew the first twelve by name, so In play over the cards says the same number as Today and the sidebar.',
    },
    {
      version: '1.20.0',
      notes: "Each project's card on Projects draws the line of the number it leads with, where it keeps one, in place of the work finished each week.",
    },
    {
      version: '1.19.0',
      notes:
        "Each project can keep its key numbers: what it is judged by, where each one's values come from, which way is good, a target and by when, and how often a new value should arrive. Numbers, the readings your projects report, is part of Projects now, so any record with projects can hold them. A project can say what kind it is: a business, client work, a product or content.",
    },
    {
      version: '1.18.0',
      notes: "A project the record formed from an agent's first session is marked as a draft until you keep it. The line under What each one earns is drawn only once a project in play says what it earned in a year. A project's one line is typed on its card in In play. Each project in play on Projects says how long since anybody worked on it. That line and the line of the work finished on it each week wait until Work is there. Projects counts and answers the questions about your projects.",
    },
    {
      version: '1.17.0',
      notes: 'Projects says how many of those in play say what they earned in a year only once one of them does. With none saying, the line is not drawn. A project page lists up to six of its own keys, tools and skills under Runs on, and says which agents used each one. On Projects, the one line under each name can be typed straight on its card. Each project in play on Projects says how long since anybody worked on it. Projects says where each one stands by lane, and how many are in play and earning, with the line of each over the nights. How they are going waits until a project says how it is going.',
    },
    {
      version: '1.16.0',
      notes:
        'A project that tasks, bills, services or people still point at can no longer be deleted: you are told which lists and how many, so you can move them first, or mark it Finished. Projects says how many of those in play say what they earned in a year. A project page says where it stands from what was worked on this week until somebody says how it is going.',
    },
    {
      version: '1.15.0',
      notes:
        'Projects no longer ends on folded headings over an empty page. With four projects or fewer, what each earns, what agents hold and what is coming up are open in one tile, and the parked and finished ones in another. Past four, each folds away as before.',
    },
    {
      version: '1.14.0',
      notes: 'A project keeps the domains it lives at, so mail and renewals about one are read as about the project. Repositories take a remote as git prints it.',
    },
    {
      version: '1.13.0',
      notes:
        'Projects says in its first line when nothing is in play and how to start, and no part of the page says it is empty. Parked and finished counts what is folded under it without loading every project.',
    },
    {
      version: '1.12.0',
      notes:
        'Projects opens on which projects need a push and which are on track, by name. The cards drop their Health and How far along labels, and the bar of how they are going shows once more than four are in play. A project page opens on its next step, leads Where it stands with how it is going, and lists what is handed back as a to-do.',
    },
    {
      version: '1.11.0',
      notes: 'Projects says each thing once: the line, one track of how the projects in play are going, and the projects themselves. The Needs you table is gone, since every card says its health and next step.',
    },
    {
      version: '1.10.0',
      notes:
        'Projects opens on how many are in play and how many are at risk, with where they are and how they are going side by side under it. A project page keeps where it stands and what is handed back in a column beside its chart, and lists its open work once, on the plan.',
    },
    {
      version: '1.9.0',
      notes:
        'The page is called Projects, as the top bar calls it. Right now sits beside where the projects are and how they are going, and statuses read Earning, Building, Parked and Finished. A project page opens on one line: the work handed back for you to check, or else its next step.',
    },
    {
      version: '1.8.0',
      notes:
        'The Overview is calmer: one line of what needs you, where the projects are and how they are going, then the projects in play, with what each earns, what agents hold and what is coming up folded away. A project page shows six things and folds its history, money and what it runs on.',
    },
    { version: '1.7.0', notes: 'Each project in play shows a small line of the work finished on it each week, when you use Work.' },
    {
      version: '1.5.0',
      notes:
        'A project page leads with the questions waiting on it, shows what changed, draws its plan on a time axis when its tasks have days and its money month by month. Every money figure is in your own currency, and its target is a setting.',
    },
  ],
  core: [
    { version: '1.3.1', notes: 'Health, Scripts, Calendar and Activity open straight on what they hold, without a line over it saying how many need a look or what the page is.' },
    { version: '1.3.0', notes: 'Health folds the checks not run yet at six, as All good does, and the checks nothing was filed for are one card titled by how many, naming them in its line.' },
    { version: '1.2.1', notes: 'Health shows every check that has not run yet, so the cards add up to the count above them.' },
    { version: '1.2.0', notes: 'Health says what it found more plainly and links to Tidy up.' },
    { version: '1.1.0', notes: "Scripts calls the column that says how each script is doing Status." },
    {
      version: '1.0.0',
      notes: 'Health, Scripts, Calendar and Activity now come with BrainDog itself. Your sidebar stays as it was.',
    },
  ],
  people: [
    {
      version: '4.7.1',
      notes:
        "A person's note no longer repeats what their fields say: BrainDog offers to take out their name as a heading and a one-line deal the Deal field already holds, and to keep a short first line as their About. Lines it reads nothing from stay exactly as written.",
    },
    {
      version: '4.7.0',
      notes:
        "A person's details are fields of their own: legal name, the name they go by, what they are to you, their roles, nationality, country, city, time zone, birthday, languages, phones, Discord, GitHub, X, Instagram, LinkedIn, Telegram, WhatsApp, the deal and the paperwork still to do. BrainDog offers to move what each note already says into them, one question a person. People no longer opens on a line of counts.",
    },
    { version: '4.6.0', notes: 'A person can be one of your staff, not only someone you work with.' },
    { version: '4.5.0', notes: 'A person can be your co-founder or business partner, not only a collaborator.' },
    { version: '4.4.1', notes: 'People says how many organisations you deal with once, and the line under it is the way to them.' },
    { version: '4.4.0', notes: 'People on a new BrainDog says it holds only you so far, and who to add, rather than that it holds nothing.' },
    { version: '4.3.0', notes: 'People\'s first line counts people and organisations apart, and names your clients while there are a few: "Fenwick and Acme, 2 clients".' },
    { version: '4.2.2', notes: 'People says who may be listed twice in plainer words.' },
    { version: '4.2.1', notes: 'People says how many organisations and shops you deal with in one count, the one their list shows.' },
    { version: '4.2.0', notes: 'People says how many organisations you work with, apart from the shops your card texts named.' },
    {
      version: '4.0.0',
      notes: 'Health, Scripts, Calendar and Activity moved to BrainDog itself. Your sidebar stays as it was.',
    },
    {
      version: '3.9.0',
      notes:
        'People counts a question that adds or changes somebody as a question about them. Each person is one line: what they are to you, the projects they are on and when you last spoke. Shops named on card texts are one line under Organisations instead of a list of half names.',
    },
    {
      version: '3.8.0',
      notes:
        'An organisation can be retired: it keeps its payments and is no longer listed on People. A shop met by a name a card text cut short is asked about once in Needs you, to fold it into the shop whose whole name it is, or retire it.',
    },
    { version: '3.7.0', notes: 'Scripts is a page like any other: every script, what starts it and where it stands, which you can change by saying how.' },
    {
      version: '3.6.0',
      notes: 'People shows everyone with a face, what they are to you, who they are with and when you last spoke, and you are no longer in your own list. The count of contacts is the people it shows.',
    },
    { version: '3.5.0', notes: 'Health is said in plain words: how many checks have not run yet, Needs a look, All good and Not checked yet, and how many days every check has passed.' },
    { version: '3.4.0', notes: 'People says when somebody may be on your record twice, with a link that opens the list at those people. Calendar is a new page: this month and the next two, with everything that has a day it is due, from every list. Activity is a page of its own: everything that changed, a day at a time, with one line for each run, and who worked, what changed, the busy hours and what an agent asked beside it. What is asked about somebody here waits on the People page to be answered, and its first line says how many. People shows how many you were in touch with in the last 30 days, with a line of the month, and what agents did to the people and organisations here. Activity can be narrowed by who, what kind of change and which list.' },
    { version: '3.3.0', notes: 'Health is a page of its own: each check this record runs on itself, by name, with what it last found. Anything that needs a look comes first, said in words and marked, and a check with nothing to go on yet says Not read yet. Under the first line it says how many checks have not been read yet.' },
    {
      version: '3.2.0',
      notes:
        'People shows each person once. Gone quiet and Last in touch listed the same people who are on the cards under them, so both lists are gone and the cards stay, each with the day you were last in touch. Who has gone quiet is still said first, by name.',
    },
    {
      version: '3.1.0',
      notes:
        'People shows who has gone quiet and who you were last in touch with as two short lists, the one quiet longest first, each with the day. They take the place of In touch, 12 weeks, a grid of dots that said when and little else.',
    },
    {
      version: '3.0.0',
      notes:
        'Organisations live here now, each with a page of its people, projects and money. People are grouped by the organisation they are with. A person keeps every address and handle they are known by and where they were seen. Mail a pattern reads meets the company behind it, unless it came from a free mail service; other mail only notes who wrote, so a stranger never becomes a contact. The payee on a bank text is one shop however the bank spells it.',
    },
    { version: '2.7.0', notes: 'People opens on who has gone quiet and since when, by name, and otherwise on who you have been in touch with lately.' },
    { version: '2.6.0', notes: 'Nothing changes on screen: In touch, 12 weeks is written the way the app now reads it.' },
    { version: '2.5.0', notes: 'In touch, 12 weeks names each person beside the weeks they were in touch, the latest first.' },
    {
      version: '2.4.0',
      notes:
        'Each person carries the last day they were in touch. People opens on one line of who you have been in touch with lately and who has gone quiet, draws it as a chart and lists everyone, the latest first.',
    },
    { version: '2.3.1', notes: 'People now links each person to the projects you met them in on a BrainDog set up before this fix.' },
    {
      version: '2.3.0',
      notes:
        'Meeting someone by email now happens on its own, the way it already does from a commit. What you were met about moves off their card, which was getting crowded, and onto its own note on their page.',
    },
    { version: '2.2.0', notes: 'One page per person: who they are, the projects you met them in and what is written about them. A person other rows still name cannot be deleted.' },
    { version: '2.1.0', notes: 'People is the list meetings write to, so a meeting finds the right person without the list having to be called People.' },
    { version: '2.0.0', notes: 'Role no longer offers registrar. A row that holds it keeps it as its own word.' },
  ],
  'money-core': [
    { version: '3.38.6', notes: 'A category or line marked as a correction reads "A correction and not spending", so a filter on it can be typed back.' },
    { version: '3.38.5', notes: 'Filing rules no longer opens on a count of what the rules filed in 30 days. Each rule still says it.' },
    {
      version: '3.38.4',
      notes:
        'Money says each thing once and shows figures as figures. Coming up is one list of what falls due, with the next 30 days as two figures over it. Accounts opens on its cards, each with its balance and how old it is. Reports shows what came in, went out and was left as figures, and what repeating bills and instalments take each month as a tile. Money\'s first line is what is late, and the Ledger no longer counts the lines to file twice.',
    },
    { version: '3.38.2', notes: 'Reports draws the six largest categories and everything else, where it drew five.' },
    { version: '3.38.1', notes: 'The Ledger table opens on date, payee, account, category and amount.' },
    { version: '3.38.0', notes: 'Forecast says what is left on one plan as a figure, not a chart of one bar. A bill says which way it is owed, a book asks when its money runs out, and Reports draws the six largest categories and everything else.' },
    { version: '3.37.1', notes: 'Reports says a stretch with nothing in as what went out and nothing in yet, not the same amount twice.' },
    { version: '3.37.0', notes: 'Reports says a stretch that spent more than came in as how much more went out, not as a minus left over.' },
    { version: '3.36.0', notes: 'A book with no account draws no Cash ahead of nothing, and its Accounts says what adding one brings. The Ledger, Coming up, Forecast and Reports each say what will be there and how to start while they are empty, and the Ledger draws its month only once something moved.' },
    { version: '3.35.0', notes: 'Putting an account in a book takes what it already holds with it, so a book counts the money the account spent before. A book says This month only while money came in or went out, and its accounts and Add an account each take the whole row.' },
    {
      version: '3.34.0',
      notes: 'Money opens on what is late both ways, an invoice owed to you as well as a bill, and says what needs a look straight under your cash rather than at the foot of the page. Coming up is one table in four stretches, late first, with what repeats each month at the foot. Accounts shows one card an account with its balance. An account shows its balance once while the lines match the bank, with the box for today\'s balance under it. Budgets lists the budgets you set, with Set another for the rest. Forecast shows one row a plan. Reports keeps how long your money lasts and what you kept, in red below nought. Payees can give a name to what the bank writes, such as Google Workspace for GOOGLE *WORKSPACE, and every line takes it. Filing rules has Add a rule at the top. A book opens on its Cash ahead, and a plan says what is paid once.',
    },
    {
      version: '3.33.0',
      notes: 'A category can be marked as a correction, not spending, such as Discrepancy, and BrainDog asks once for one whose name says so; once marked, its lines stay out of every spending and income figure. Reports says the range you picked. Paid most adds up every payment to a payee, and bank digits read as the account they end in. The next 30 days reads "Bills and usual spending", Coming up says "Repeating bills", and the lowest point reads the same on Money, Today and Forecast, which now opens on 12 weeks. Lines that look imported twice are offered to be archived, one of each kept. Snapshots, which BrainDog keeps by itself, is no longer offered a page of its own. Payees shows one bar a payee, most paid first, and Filing rules shows each rule with how many lines it filed. Money says how long your cash lasts in one line under it, Coming up lists what is late once, at the top, and Accounts shows your balances in one tile.',
    },
    {
      version: '3.32.2',
      notes: 'A payment that pays a bill and was filed under a category whose money stays yours, such as Transfers, is filed under the bill\'s category and counts as spending: the Northwind premium paid by bank transfer goes under Insurance. A category you file by hand is left as it is.',
    },
    {
      version: '3.32.1',
      notes: 'Net worth takes away what a plan still has to pay only where what it buys is counted, so two flats paid in parts no longer read as millions owed with nothing owned, and Over time says so under its line. The filing rules count the lines they filed, one or several. An account says what to type in its balance box.',
    },
    {
      version: '3.32.0',
      notes: 'Reports says how much of what comes in repeating bills and instalments take against the money that actually came in over the last three months, and only once there are three months to read. Budgets opens on its bars, all budgets together first, and every budget says what is left or how far over. An account page lists what moved as the Ledger does, and Coming up counts the same next two weeks on Money, Today and its own page, where what is late is listed first. Money\'s Accounts lists every open account, the card too. Budgets says whether each budget is for a week, a month or a year, and you set the most to spend and its period at the foot of the page. A line still waiting to clear counts in no spending figure until it clears: the Ledger lists it apart, and Budgets says how much is waiting. Accounts counts the accounts it lists, says how many balances are out of date, and a card says which digits it ends in. Over time draws Cash\'s line until net worth has a week of nights kept, then net worth\'s. Snapshots heads its list with the newest night, not thirty nights added up, and calls cash and bills together Cash after bills. Money\'s month of budgets says what every budget comes to as a month. An account\'s page opens on its name and what it holds. Payees no longer says nobody was paid over payments that name nobody, and Last paid lists only money out. Bills and invoices show their amounts signed.',
    },
    {
      version: '3.31.0',
      notes:
        'Net worth counts what you hold beyond the bank (investments and gold, property, certificates, policy funds) less what you owe over time, and keeps it each night, in dollars and grams of gold too. A budget can be for a week or a year, and what carries over is shown. A repeating line can post itself on its day on an account no bank feeds, and a real charge later takes its place. Money\'s numbers agree with each other. A payment whose bank words name nothing pays a bill of the exact same money within ten days, or Money asks once whether it was that bill. A category that holds moves between your accounts asks once whether to leave it out of spending. Lines to file are counted the way the list shows them. Spending is called Spent with its period everywhere, repeating money is Repeating, a month, and what is still ahead is To come in and To go out. Reports says how much of what comes in each month repeating bills and instalments take. Each account is read in its own currency, every account drawn is counted, and Accounts says why a Ledger total can differ from the balance. Payees never shows a bank code as a name and asks once to name what names nobody. An empty plan offers no Mark paid, and a plan read paid while parts are left is open again.',
    },
    {
      version: '3.29.1',
      notes: 'Money says less and shows more: each page opens on one line with a number in it, figures lose the notes that explained them, and an empty list says one short line.',
    },
    {
      version: '3.29.0',
      notes: "A page for each job: Accounts, Ledger, Budgets, Coming up, Forecast, Reports and Payees. Budgets are offered from last month, never set for you.",
    },
    {
      version: '3.28.0',
      notes: 'Answering "It went through" about a repeating line marks its open bill for the same money paid as well, where the bill stayed open and read late on Today.',
    },
    {
      version: '3.27.1',
      notes: 'Nothing is skipped now when Money files lines in the book of their account or counts the parts of a plan, however many there are.',
    },
    {
      version: '3.27.0',
      notes: 'The months ahead of In and out, by month are what Cash ahead walks, every part of a plan in the month it falls due, and Cash ahead opens on twelve weeks. Lasts says how long the money lasts with nothing coming in, the day that ends on and what falls due then. The first line keeps each currency apart, with about what they come to at the rate, and counts the accounts the Accounts tile lists. Every month says what goes out in the next thirty days as Today does, parts of plans with it.',
    },
    {
      version: '3.26.0',
      notes: 'Entries in no book on an account that is in one are asked about two hundred at a time, and the rest the night after, where a record with more than two hundred was asked nothing.',
    },
    {
      version: '3.25.0',
      notes: 'A payment that paid a repeating line moves the line on to its next day again, where the step stopped with an error.',
    },
    {
      version: '3.24.0',
      notes: 'Accounts lists every account the first line counts, where it stopped at six and the line said seven.',
    },
    {
      version: '3.23.0',
      notes: 'Money says what its Lasts figures assume: one is with what is due and expected, the other is if nothing more comes in.',
    },
    {
      version: '3.22.0',
      notes:
        'A plan is found by its name however it is written, so parts that say "desk" join the plan called Desk and no second plan is made beside it. Two plans already here under one name are asked about once in Needs you: make them one, which closes the second and keeps it, linked to the first, or keep them apart. Nothing is moved before you answer. Cash ahead counts a plan written two ways as one.',
    },
    {
      version: '3.21.0',
      notes:
        'Coming and going on Money opens on its calendar of the next 30 days, with no second heading over it. The calendar now holds everything with money on it that falls due, repeating lines and parts of a plan as well as bills, the same things Today names under Due soon, and a bill that repeats once.',
    },
    {
      version: '3.20.0',
      notes: 'When a bill is paid and a repeating line carries the same money, Money asks once whether to move the line on to its next day, so it is not read late. A payment that fits a bill and a repeating line of the same name pays the bill. A card can say its credit limit, and then what is to pay on it is worked out from the bank\'s texts and said in Money\'s first line with the day of the newest text. Filing rules says how many entries have no category, with File old entries to file them in one change you can undo.',
    },
    {
      version: '3.19.0',
      notes: 'Each account and each bill or invoice has a page of its own. An account opens on what it holds, when that was last confirmed and the last things that moved through it; a bill on what it is for, how much, who and when, what is still to pay and the parts paid.',
    },
    {
      version: '3.18.0',
      notes: 'A part of something paid in parts is late once its day has gone. Money\'s first line says how much you have, then names the part that is late longest, what it is and how long ago it was due. With more than one book it says the money there is, where it said only how many books and accounts. On Heads up, a late part comes first, with the bills that are late after it.',
    },
    {
      version: '3.17.0',
      notes: 'Money works out your cash a second way, entry by entry from the last statement, so a cash figure that is wrong can be caught. If the two ever disagree, Money says so in one red tile under Cash ahead. Filing rules are a list of their own: a text, how it matches, which way the money goes and the category it files under, and the Ledger says which rule filed an entry. An account can be closed, and a closed account is left out of today\'s cash. A payment an instalment names cannot be deleted. With more than one book, Money opens on how many books and accounts your money is kept in. The six newest Ledger entries stand open on Money in a tile of their own, each opening its entry, and are no longer folded under History. On Heads up, lateness is in the danger colour and the words stay. A payment marks the bill it pays: once a Ledger entry that names a bill has cleared, the bill is part paid with the sum so far, or paid with the day. Money sent from one account to another in a different currency is counted as one move, not as spending and income, when the two amounts agree within 2% at the rate of the day it left, and that rate is no more than two days old. The Ledger tile shows as soon as an entry is written, cleared or not. A payment made void, or put back to pending, reopens the bill it had paid: the bill goes back to open or part paid with what its other payments come to. A bill marked paid by hand is left as it is, and so is a Paid so far you typed when a payment that has not cleared is logged against the bill. Money can say what you spent last month, and this month so far against it, by category. Something paid in parts is a thing of its own: Plans holds one plan for each name your instalments share, made for you, and each instalment says which plan it is part of and what is left after it. Money counts the repeating lines you have matched a payment to before whose next day has passed by more than three days with none matched since. A plan you close stays closed, and the first part of a new plan is linked to it straight away. Money can say this month\'s spending against last month by category, and what is left of each budget. Being chased is no longer on Money. Instalments shows each plan\'s parts paid of its total. A plan\'s page opens on one sentence: how many parts are paid, what is left and the day of the last part. A filing rule\'s Reads choice now says As the bank wrote it, the same words the Ledger uses for that text. The days your money lasts now count everyday spending: what went out over the last three full months, less what is already written down as a bill, a repeating payment, a plan or a subscription. A Ledger entry, a repeating line or an instalment written on an account that is in a book is filed in that book, and you are asked once about what the account already held. A book\'s page says what came in, what went out and what is left this month. A plan with every part paid says nothing is left and the day it ended. A bill or invoice on an account is filed in that account\'s book. A book\'s page says what is due to come in and go out, and draws its months. The Ledger on Money now says who was paid, and the bank\'s own line only where nobody is known. A project\'s money on its way is named Still to come in, where it said Owed to you. Matched repeating lines past their day says 0 when every line you matched is on time, and says nothing only when no line was ever matched. Answering Chase it on a late invoice now leaves a draft to send on it, with the amount and the day it was due, and never writes over words you changed. A book\'s page says the day that book\'s money runs out, under Money lasts until. Chase it drafts what is left to pay on an invoice paid in part. Money\'s first line says when your money lasts the year on what is due, and a book\'s page says so of that book. Heads up on Money no longer names a category marked one way that holds money going the other. A cleared payment that names no bill finds the one open bill or instalment it paid, by who was paid, the amount and the day, and marks it paid; where more than one bill or instalment fits, Decide asks which. A payment that fits one repeating line says so and leaves the line as it is: its next day is still yours to move. A new or changed filing rule files the Ledger entries of the last 400 days that it matches and that have no category, as one change you can undo. Set a category on an entry by hand and Money asks once whether every entry from that payee goes there, and says how many more it would file; Yes makes the rule, and Only this one is not asked again. Money has a page of its filing rules: each rule, how many entries it filed and what it filed lately. Coming and going no longer walks the next thirty days, which Cash ahead already says, and ends on Every month: what comes in and what goes out every month. In and out, by month, reads six months back. Deleting a payment reopens the bill it paid, as making it void does. Money\'s line says how long the cash lasts with no income. Every month shows what the repeating costs are for, by category, and questions are answered in Decide. A book\'s page opens on one line saying how many categories are marked the other way from how the Ledger books them, with a link to Categories. Money ends on Where it went, folded: this month by category with No category yet last, and who was paid, in what went out with no category, over the last 91 days. Each account\'s last confirmed day is on its book\'s page and no longer on Money. Instalments says what is next under each plan, such as Next £1,875 on 3 Sep, and the calendar of what falls due in the next 30 days shows each amount. Heads up sits beside the Ledger, and each of its lines ends on what to do: See them, or Update balances. Money\'s first line says how far your cash moved in words, such as 6% down on a month ago, and Runs out shows in place of Lasts when the cash is below nought. One of Bills and invoices is called a bill or invoice, so its button says Add a bill or invoice.',
    },
    {
      version: '3.16.0',
      notes:
        "Money says how old the newest Ledger money and oldest balance are, the currencies held, money out with no category, and nights the cash line missed. A balance is as old as the bank's last word, and Heads up shows each account's last confirmed day once one is a week old, in place of the weekly note. A repeating payment can land on set days of the month and move off rest days, and Decide asks about one on a month's last day. An amount keeps its account's currency. It says what came in this week. Heads up names any category marked one way that holds money going the other. The Ledger opens on its newest day.",
    },
    {
      version: '3.15.0',
      notes: 'Money says how alive it is, starting with how much was kept on the Ledger in the last seven days.',
    },
    {
      version: '3.14.0',
      notes: 'An account asks for the digits the bank prints, where it asked for the last four digits.',
    },
    {
      version: '3.13.0',
      notes: 'Coming and going opens on one heading. The next 30 days under it no longer has a second heading of its own.',
    },
    {
      version: '3.12.0',
      notes: 'Runs out names the day your money runs out, with the days left under it, where it showed only a count of days.',
    },
    {
      version: '3.11.0',
      notes:
        'Money opens on Cash ahead, with when your money runs out, your accounts and any questions in a column beside it. What is coming up is open under it, and what already moved is folded under History.',
    },
    {
      version: '3.10.0',
      notes:
        'A payment says which organisation it was with, a shop, a supplier or a client, where it could only name a person, and keeps the payee as the bank wrote it, so the same shop is known however it is spelled. Cash ahead offers five years and To the end again, worked out when you pick them, so Money still opens fast.',
    },
    {
      version: '3.9.0',
      notes: 'Cash ahead goes as far as two years, so Money opens faster. Five years and To the end are no longer offered.',
    },
    {
      version: '3.8.0',
      notes: "Accounts shows only when there is cash to split, and a book's Where this month's money went only when something left the book this month.",
    },
    {
      version: '3.7.0',
      notes: 'Cash ahead opens on the next three months. Six months, a year and two years are still a press away.',
    },
    {
      version: '3.6.0',
      notes: 'Cash ahead no longer says again when the money runs out, since the line at the top does. The flag on the day stays.',
    },
    {
      version: '3.5.0',
      notes: 'An old balance, money late coming in and money late going out are one Heads up under your accounts, each line there only while it is true.',
    },
    {
      version: '3.4.0',
      notes:
        'Money is calmer: the line at the top says your cash and how long it lasts, with no tile repeating it, the month is drawn once as a chart, and everything after Accounts is folded away until you open it.',
    },
    {
      version: '3.3.0',
      notes:
        'Money is calmer: one line of what your money is doing and how far cash moved on a month ago, cash by account, the month ahead as a calendar and what moved as a list. A balance older than a week is flagged, and questions show only when something is asked.',
    },
    {
      version: '3.1.0',
      notes:
        'Books keep money that is not one person\'s apart, each with its own page and its own cash walk. A late invoice you chase is marked chased, a repeating line that stopped is ended, and an account or book that rows point at cannot be deleted.',
    },
    {
      version: '3.0.0',
      notes:
        'One page called Money in place of Overview and Ledger. Cash now rolls forward from each account\'s newest balance, a new Balances list holds the checks it restarts from, and Obligations is called Bills and invoices. Card alert wordings moved to their own add-on.',
    },
  ],
  estate: [
    { version: '2.8.1', notes: 'Services opens on what it costs a month, without counting the questions Waiting on you shows.' },
    { version: '2.8.0', notes: 'Services says what it holds in plainer words, without naming a month.' },
    { version: '2.7.0', notes: 'Services names each domain that points at nothing, with who it is with, when it renews and what it costs, and Next ninety days says what each renewal costs where it said the name twice. A service\'s own page leads with what its next renewal takes, and one with no cost written shows no empty figure.' },
    { version: '2.6.1', notes: 'A service that costs nothing is no longer asked about before it renews, and the answers to that question say what each one does.' },
    { version: '2.6.0', notes: 'The Services page is called Services, as the menu says, and Lapsing says when each service lapses and why, from its own note.' },
    { version: '2.5.0', notes: 'The Vault is now the Keychain. Nothing you keep moved.' },
    { version: '2.4.0', notes: 'Services names what is lapsing: each one by its name, who it is with and the day it was due to renew, where At a glance was, while anything is. How many renew in 30 days is still on Today.' },
    {
      version: '2.3.0',
      notes: 'Each service has a page of its own: what it costs, who it is with, what it points at and when it renews, with its keys one press away in the Vault.',
    },
    { version: '2.2.0', notes: 'A service can be a Server, a Database, Storage or a Network, each with its name. Types you added yourself stay as they are. A project page no longer says Costs a year 0 when nothing it runs on has a cost recorded; the figure is left out until one is. Services shows what is asked about a service and says how many in its first line, and Virtual machine, Edge network and Object storage are types with names. Services shows what agents did to your services, under everything you keep.' },
    {
      version: '2.1.0',
      notes:
        'Services is calmer: a new record reads one note of what belongs here, each part shows only when it has something, and what each domain points at and every service are folded away until you open them.',
    },
    {
      version: '2.0.0',
      notes:
        'Services keeps subscriptions, memberships, insurance and utilities, opens with what it costs a month, asks before a renewal and marks a passed one lapsing. Every target is a setting with no default.',
    },
    { version: '1.3.0', notes: 'Services says who a row is with, where it said a registrar.' },
  ],
  work: [
    { version: '1.26.1', notes: 'Work, the Board and the Timeline no longer open on a line of counts. What is late, waiting on you or due soon is in the lists under them, as before.' },
    { version: '1.26.0', notes: 'The Board\'s first line says what is to check or blocked and what is with an agent before what is kept for later.' },
    { version: '1.25.0', notes: 'A list of tasks heads its names Task, not Description.' },
    { version: '1.24.0', notes: 'Work says nothing of late tasks while none is open, and the Timeline says what will stand on it while no task has a due day.' },
    { version: '1.23.0', notes: 'A task can say which client it is for. A task with a client and no project is filed under its client, not under Needs a project, and Work\'s lists say the client beside the task.' },
    { version: '1.22.0', notes: 'Timeline with no dated task says what will stand on it and how a task gets there.' },
    { version: '1.21.0', notes: 'On a BrainDog more than one person shares, Yours is the tasks assigned to you or to nobody, and a task assigned to a colleague is theirs. The field reads Assigned to, where it read Owner.' },
    { version: '1.20.1', notes: 'No due day lists the newest tasks first, and Later lists tasks by their due day, then the newest first. Work\'s band reads "Your work this week" and Timeline\'s lane "Tasks by due day". The Next up widget lists the same tasks as Your work this week.' },
    {
      version: '1.20.0',
      notes: "Work's project chips, and Yours and Agents, count the same open tasks as Open, kept for later left out, and its first line says none of your tasks is late rather than nothing is late.",
    },
    {
      version: '1.19.0',
      notes: "Threads can be ideas or planned, with a day they aim for. Work leads with Late, Waiting on you, This week and With an agent, and Board lists every open task.",
    },
    {
      version: '1.18.0',
      notes: 'Counts the tasks on a project that changed this week, so a project page can say whether it is moving before anybody describes it. It also says how many days since a task on a project was last written, as Last worked under Where it stands.',
    },
    {
      version: '1.17.0',
      notes: 'A card on the Board says the day its task is due and who holds it, where it named the project. The project is still in the list under the board.',
    },
    {
      version: '1.16.0',
      notes: 'The Board no longer says By status over its columns, since each column is headed by its status already.',
    },
    {
      version: '1.15.0',
      notes:
        'Work opens on how many tasks are late and how many wait on you. Late runs the whole width, a strip shows what is open, due and done this week, and This week, With an agent and Waiting on you sit side by side. Today is the top of This week.',
    },
    {
      version: '1.14.0',
      notes: 'An empty Work page says Nothing is open right now, under the line to capture a task, instead of a tile for every band saying it is empty.',
    },
    {
      version: '1.13.0',
      notes: 'Work opens on the task that has been late longest, by name, and how many more are late with it.',
    },
    {
      version: '1.12.0',
      notes: 'Today runs the whole width, with what is late and what is due this week side by side under it.',
    },
    {
      version: '1.11.0',
      notes: 'Work shows what is still to do, folds what is further off and what was done, and has a strip of your projects to look at one at a time.',
    },
    {
      version: '1.10.0',
      notes:
        'Work opens on one line of what is open, late and waiting on you, then the capture line. Late, Today, This week, With an agent, Waiting on you and Done recently each show only when they hold something, and what is further off is folded away. Late counts only your own tasks, as its list does. A project page shows what got done on it each week.',
    },
    { version: '1.9.1', notes: 'Tasks and threads now say which project they are for and who holds them on a BrainDog set up before this fix.' },
    {
      version: '1.9.0',
      notes:
        'Work leads with a line to capture what is on your mind, and your tasks and the Board sort by tier then due day. It adds a queue of what agents ask about tasks, a two-week timeline and a twelve-week heat of what got done, and a task can carry why it matters.',
    },
    { version: '1.8.0', notes: 'Finishing a task closes the steps still open under it, and a step added under a task starts in its project.' },
    { version: '1.7.0', notes: 'An update can be written by anybody, not only one of four agent vendors.' },
    { version: '1.6.0', notes: 'Work\'s own page lists tasks as checklists cut so that each task sits under exactly one: Today, This week, Waiting on you, With an agent, After this week, Later and No due day.' },
  ],
  agents: [
    { version: '1.34.0', notes: 'Agents and What changed no longer open on a line of counts. Who is at work, what is up next and what changed are in the lists under them, as before.' },
    {
      version: '1.33.0',
      notes: "A skill's page says when to use it at the size of the rest of the page, and shows the skill's text even while it has only one version.",
    },
    {
      version: '1.32.0',
      notes: 'Agents no longer needs Projects. Without Projects, a learning, skill, key or tool applies everywhere, and once Projects is on it can say which project.',
    },
    {
      version: '1.31.0',
      notes: 'What changed shows each learning once, on its timeline, where cards of the same learnings stood over it.',
    },
    {
      version: '1.30.0',
      notes: 'How the brain changed is now called What changed, on its page and at the foot of Agents.',
    },
    {
      version: '1.29.0',
      notes: 'Keys at the foot of Agents opens the Keychain, the one place for keys.',
    },
    {
      version: '1.28.0',
      notes: 'A tool says how it runs, Runs on your machine or Reached over the web, and whether it is an MCP server or a command line. A key says its kind as the Keychain does, such as API token or SSH key.',
    },
    {
      version: '1.27.0',
      notes: 'The runs on Agents are headed Working now, as Today heads them, with the quiet ones under Quiet, where they were headed Open now.',
    },
    {
      version: '1.26.0',
      notes: 'Keys past their day are said in a plain sentence, and How the brain changed says how many learnings are in use beside how many arrived.',
    },
    {
      version: '1.25.0',
      notes: "Agents' first line counts the runs that are open and quiet as well as the ones working, so it agrees with Open now under it.",
    },
    {
      version: '1.24.0',
      notes: "Shows how much of each agent's suggestions you accept unchanged, and a timeline of how the brain changed.",
    },
    { version: '1.23.0', notes: 'A key says which account it is for, such as a user name or an address, as a keychain item does. It is never the key itself.' },
    {
      version: '1.22.0',
      notes: 'The Vault is now the Keychain. Keys and the notes about a key with no value or one written in plain text say Keychain, and their links go to it. Nothing you keep is moved or changed.',
    },
    {
      version: '1.21.0',
      notes: 'How the brain changed counts a learning as arriving this month by its own date, so learnings brought in this month from August are not counted. Each learning there shows its one line, and what taught it is on its own page.',
    },
    {
      version: '1.20.0',
      notes: 'The runs open now on Agents are headed Open now, with the ones working first and the quiet ones under Quiet, where they were all headed At work.',
    },
    {
      version: '1.19.0',
      notes: 'With nobody working, the first line on Agents says Nobody working right now, where it said Nobody at work over runs that are open and quiet.',
    },
    {
      version: '1.18.0',
      notes: 'A key kept in the vault says Locked value over what it holds, where it said Sealed value.',
    },
    {
      version: '1.17.0',
      notes: 'Agents reads like a list of runs now. One line says how many are at work and how many steps are up next. At work, Up next and Recent runs each take the whole width, one line a run or a step, and a run quiet for hours is no longer at work. The questions your agents asked live in Needs you only, and the folded tiles at the foot are one line of links.',
    },
    {
      version: '1.16.0',
      notes: 'Agents opens on who is at work and on what, such as Claude on Lanternfish, where it counted the machines they were on. Under it, how many runs are waiting for your reply.',
    },
    {
      version: '1.15.0',
      notes: 'On Agents, the questions your agents asked are headed Your agents asked, so the count beside them is no longer read as everything that needs you.',
    },
    {
      version: '1.14.0',
      notes:
        'Agents opens on how many are at work, on how many machines and how many wait on you, the same number as the top bar. At work lists one line a run by machine, with Tell, Pause and Stop behind its menu. Tell an agent is one line, with what you told beside it. Left for the next run shows each step once, with Take and Drop. Today’s runs draws the day a lane an agent and names each run by what it did. Machines and profiles sit at the foot.',
    },
    {
      version: '1.13.0',
      notes:
        'Agents has a new page, How the brain changed, opened from What the brain learned. It says how many learnings arrived this month, how many skills changed and how many have faded, draws both week by week once there are three weeks, and lists what changed with the failure that taught it. Faded lists what nobody confirmed in ninety days. A learning can be a rule, and a skill, tool or key added twice is one. Needs a look says what is here twice, what was tidied this week and what is still stale.',
    },
    {
      version: '1.12.0',
      notes:
        'A Working card on Agents is titled by the agent, with what it said it is doing under its name, or nothing when it has not said. It no longer shows a next step, which is under Left for the next run. Today and Earlier now list a run that finished, so a run that ended properly is no longer missing from the page. They leave out helpers and runs that wrote nothing, and each card says the agent, what it said it was doing, its project and when it was last heard from.',
    },
    {
      version: '1.11.0',
      notes:
        'Agents shows Left for the next run under Working: each step a run left that nobody has taken, with who left it and when. A step more than a week old, or one a later run passed over, says it was left earlier. The line at the top counts the same steps, so it no longer counts a step that was already picked up. Runs from before today are folded under Earlier, with how many there are, until you open it.',
    },
    {
      version: '1.10.0',
      notes:
        'Agents shows Needs a look under the runs when a key holds no value and says nowhere it is kept, a key is past its day, a tool was not seen in a month, or a key is written in plain text where a key should not be. Each line names what it counts, then the number, then what to do. What the brain learned is folded until you open it, and Agents counts how the agent door is used.',
    },
    { version: '1.9.0', notes: 'Agents counts an agent as working only when it was heard from in the last 15 minutes.' },
    {
      version: '1.8.0',
      notes:
        'Agents opens on Today: the last 24 hours as one lane for each run, from when it started to when it was last heard from, with the runs still working in colour. It shows while a run was heard from today.',
    },
    { version: '1.7.0', notes: 'A run has a page of its own, named by what it was doing, with what it did and Undo this run.' },
    {
      version: '1.6.0',
      notes: 'Agents groups the runs: what a run asked you first, then the runs working, the ones that stopped today and the ones from earlier, each with the next step it left. A run opens beside the page.',
    },
    {
      version: '1.5.0',
      notes: 'Agents shows the runs: who is working now, where the stopped runs left off and what they added. A run quiet since yesterday is no longer listed as working. Questions are on Decide, and lessons and skills on their own pages.',
    },
    {
      version: '1.4.0',
      notes: 'Agents opens on one line of who is working and what waits on you, shows where runs left off, and folds how the brain grew, its lessons and its skills until you open them.',
    },
    { version: '1.3.0', notes: 'The version this build ships.' },
  ],
};
