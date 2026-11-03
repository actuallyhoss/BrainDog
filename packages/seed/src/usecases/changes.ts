/**
 * What each version of a built-in use case changed, in the words a person reads where an update is offered
 * (`apps/web/src/lib/market/listing.ts`, the update sheet on Decide).
 *
 * THE SAME SHAPE AS `MODULE_CHANGES` in `../changelog.ts`: newest first, one entry for each version a record could have
 * been given, at most 500 characters each, as an add-on's `changes` is. The long record of why each step was taken and
 * why it was the size it was stays in the comment above each use case's `version`; these are the same steps said
 * plainly, with no ids in them.
 *
 * FROM THE VERSIONS ON `origin/master` ONWARD, since a record can hold nothing older than what was deployed when these
 * were first written. `test/usecase-changes.test.ts` holds every use case's current version to a note, so a version
 * raised without one fails rather than drawing an update that says nothing.
 */

export type UseCaseChange = { version: string; notes: string };

/** The notes a person reads on settings that name each list, said once for the four use cases that took it. */
const NAMED = (list: string): string =>
  `Each setting now names the list it is for, such as the ${list} list, and your own lists come first.`;

/** The note for the patch that says each starter in one short line on its card. Nothing in a record changes. */
const SUMMARY = 'Its card says what it is for in one short line. Nothing in your record changes.';

export const USE_CASE_CHANGES: Readonly<Record<string, readonly UseCaseChange[]>> = {
  personal: [
    { version: '2.11.1', notes: 'Bring your money in says plugin, as the app now calls them. Nothing you hold changes.' },
    { version: '2.10.0', notes: 'Goals says only the counts you have: "1 goal on the go", not "and 0 habits". Nothing you hold changes.' },
    { version: '2.9.1', notes: 'The Log is called Progress and Put by is called Money saved. Nothing you hold changes.' },
    { version: '2.9.0', notes: 'Goals is in your sidebar from the start, and opens on a box to add a goal or a habit. Nothing you hold changes.' },
    { version: '2.8.0', notes: 'Personal no longer counts how many days running you logged something. What you logged this week still shows against each habit. Nothing you hold changes.' },
    { version: '2.7.0', notes: 'Personal counts your streak: how many days running you logged something. Nothing you hold changes.' },
    { version: '2.6.1', notes: SUMMARY },
    { version: '2.6.0', notes: 'A new Personal record starts with Money and the Projects it points at. People comes when you name someone, and anything else when you add it. A record you already have keeps everything it holds, and nothing on its pages changes.' },
    { version: '2.5.0', notes: 'A new Home has something to press. Until an account counts as cash, Bring your money in links to adding one, forwarding a bank message and add-ons for your bank. Until you keep a savings goal or have a project on the go, a line names the first one. Each goes once you have it.' },
    { version: '2.4.0', notes: 'The count of the budgets you have set is kept by Money now, so Home and Money read the same one. Nothing you see on Home changes.' },
    { version: '2.3.1', notes: NAMED('Ledger') },
  ],
  student: [
    { version: '1.7.0', notes: 'Studies is in your sidebar from the start, and opens on boxes to add a piece of work and a course. Nothing you hold changes.' },
    { version: '1.6.2', notes: 'Home calls your study by day Study done. It counts no streak. Nothing you hold changes.' },
    { version: '1.6.1', notes: SUMMARY },
    { version: '1.6.0', notes: 'Studies is part of Student now: a piece of work can carry a mark as a number, and a reading list of books and papers sits beside your courses.' },
    { version: '1.5.1', notes: NAMED('Courses') },
  ],
  founder: [
    { version: '3.9.3', notes: 'Bring your numbers in says plugins, as the app now calls them. Nothing you hold changes.' },
    { version: '3.9.2', notes: 'The Dashboard says where a project sends its numbers in a plain sentence: to its own address, shown on its page.' },
    { version: '3.9.1', notes: 'The Dashboard comes after Agents in your sidebar, so nothing already there moves. When the sidebar is full, it is under More.' },
    { version: '3.9.0', notes: 'The Dashboard is in your sidebar from the start. Before your first project it asks you to add one; it talks about fixing a numbers feed only once a feed has sent a number. Nothing you hold changes.' },
    { version: '3.8.2', notes: 'A project\'s services are headed Services.' },
    { version: '3.8.1', notes: 'A project\'s And from everywhere cards say what each thing is, not its kind.' },
    { version: '3.8.0', notes: 'The founder page is called Founder overview, not Today. While no numbers came in thirty days, the Dashboard says so in one line, shows what went quiet and links to fixing the feed.' },
    { version: '3.7.1', notes: SUMMARY },
    { version: '3.7.0', notes: "A project page leads with what is true of the project, not its next step, and draws that step once as a list with its dates. Beside it is a tile by lane: what it brings in, its dated path, or what it costs to keep. Its numbers have lines and say their age, and its dates, what it runs on and renews, its agents and what happened sit under them. Projects opens on what needs you and one sorted list." },
    { version: '3.6.0', notes: 'A record with no project in play opens Projects on a box to add one, under one line.' },
    {
      version: '3.5.0',
      notes: 'The Dashboard draws the two numbers that moved most and lists the rest, as Numbers does, so both pages count the same. Its Organisations table leaves out the ones you put away.',
    },
    {
      version: '3.4.0',
      notes: "A project page says when it was last worked on from its tasks and its agents' runs together, the time Projects and Today say. Where the newest number is more than a week old, the Dashboard says how long ago it came in, in place of thirty days, and a project page heads its numbers Numbers.",
    },
    {
      version: '3.3.0',
      notes: "A project page says what its own picture is made of: its overview with its path and money, and its work, who is on it, what it runs on and the agents on it, each a part of the page that can be moved or hidden like any other. Two tiles that only repeated it went.",
    },
    {
      version: '3.2.0',
      notes: "A project page draws the project's stages as its road, each with the line that says when it is done and the next one marked. A project with both stages and dated work can keep its plan as its stages alone or as a roadmap alone.",
    },
    { version: '3.1.0', notes: 'Every project has its page now, parked and finished ones too, and a parked one says quietly since when it has been parked.' },
    {
      version: '3.0.0',
      notes: 'Numbers, the readings your projects report, moves to Projects, which keeps them from now on along with each project\'s key numbers. Every number you hold stays where it is, and the Dashboard, Today and each project page draw them as before. A new founder record no longer starts with an example number.',
    },
    {
      version: '2.7.0',
      notes: 'A new founder record starts with Projects and Money. Services comes when you mention domains or renewals, People when you name someone, and Work when you mention tasks, or any of them when you add it. A record you already have keeps everything it holds, and nothing on its pages changes.',
    },
    {
      version: '2.6.0',
      notes: "Home is called Today. It says the money lasts the year if nothing due ends it, and what stopped reporting. Working now folds under Agents at work. Late has a table above Due this week. Lapsing drops Cost. A number can name its service; one dated after today is left out. A project page has a card per agent run that wrote something, six keys, tools and skills under Runs on with who used each, and money due in as Still to come in. A project, person or organisation page ends with where it was seen.",
    },
    {
      version: '2.5.0',
      notes:
        'Numbers can hold money. A reading can carry an amount in its own currency where a plain value was required, and Latest numbers shows it beside Value. A project that reports a number is set up through the live feed add-on.',
    },
    {
      version: '2.4.0',
      notes:
        'Home says in one line how many agents are working now. Working now lists only the agents heard from in the last fifteen minutes, where it listed any run from today, even one quiet for hours.',
    },
  ],
  team: [
    { version: '2.30.5', notes: 'Sprints has its own icon, so it no longer looks like Menu on a phone. Nothing you hold changes.' },
    { version: '2.30.4', notes: 'Teammates is called People, as your sidebar and Today say it. Nothing you hold changes.' },
    { version: '2.30.3', notes: 'Open each morning is called Sprint days. Nothing you hold changes.' },
    { version: '2.30.2', notes: 'Sprints has its own place in your sidebar, and Agent work sits under Agents. Nothing you hold changes.' },
    { version: '2.30.1', notes: 'Cycles are called Sprints, the Cycle plan is the Sprint plan, and Cycle days is called Open each morning. Nothing you hold changes.' },
    { version: '2.30.0', notes: 'Cycles is in your sidebar from the start, and opens on a box to add a cycle. Nothing you hold changes.' },
    { version: '2.29.2', notes: 'A project\'s And from everywhere cards say what each thing is, not its kind.' },
    { version: '2.29.1', notes: SUMMARY },
    { version: '2.29.0', notes: 'Team task list is part of Team board now: a cycle can carry a write-up of how it went.' },
    { version: '2.28.0', notes: "A product's page leads with what is true of it, not its next step, and draws that step once as a list with its dates. Beside it is a tile by lane, and its numbers, dates, what it runs on, its agents and what happened sit under it. Projects opens on what needs you and one sorted list." },
    { version: '2.27.0', notes: 'A record with no project in play opens Projects on a box to add one, under one line.' },
    {
      version: '2.26.0',
      notes: "A project page says when it was last worked on from its tasks and its agents' runs together, the time Projects and Today say.",
    },
    {
      version: '2.25.0',
      notes: "A project page says what its own picture is made of: its overview with its path and money, and its work, who is on it, what it runs on and the agents on it, each a part of the page that can be moved or hidden like any other. Two tiles that only repeated it went.",
    },
    {
      version: '2.24.0',
      notes: "A project page draws the project's stages as its road, each with the line that says when it is done and the next one marked. A project with both stages and dated work can keep its plan as its stages alone or as a roadmap alone.",
    },
    { version: '2.23.0', notes: 'Every project has its page now, parked and finished ones too, and a parked one says quietly since when it has been parked.' },
    {
      version: '2.22.0',
      notes: 'Bring the team in says that a team of agents works on any record, and no longer that a team of people needs Cloud.',
    },
    {
      version: '2.21.0',
      notes: "A project page shows one card for each agent run, not one for every helper it started, and leaves out a run that changed nothing. Each card says which agent it was and what it said it was doing. Runs on lists the project's own keys, tools and skills, six of each with who used each and when, then up to five shared by every project. Home says what stopped reporting, under Gone quiet. The burn-down on Home fills itself each morning, with no agent needed.",
    },
    {
      version: '2.20.0',
      notes: 'A project page says where the project stands from what happened on it this week until somebody says how it is going.',
    },
    {
      version: '2.19.0',
      notes:
        'Working now on Agent work lists only the runs heard from in the last fifteen minutes, with a helper folded under the run it helps, where it listed any run from today, even one quiet for hours.',
    },
  ],
  guide: [
    { version: '1.7.1', notes: SUMMARY },
    { version: '1.7.0', notes: 'Starting a project is part of the New project guide now: a step can say why it is worth doing.' },
    { version: '1.6.1', notes: NAMED('Steps') },
  ],
  shop: [
    { version: '1.5.0', notes: 'Products has a page of its own in your sidebar, beside Orders, with a box to add a product. Nothing you hold changes.' },
    { version: '1.4.1', notes: SUMMARY },
    { version: '1.4.0', notes: 'The Orders page opens on a box to add an order, so a new shop has something to press on its first tab.' },
    { version: '1.3.0', notes: 'Orders sits second in the menu, after Work and before Projects, Money and People.' },
    {
      version: '1.2.0',
      notes: 'The Orders line now counts every other order nobody has paid anything on, beside the one it names. It used to name the oldest and leave the rest out. The tile of orders not yet paid in full is called Still to come in, the same words Today uses.',
    },
    {
      version: '1.1.0',
      notes: 'This week now starts today, and an order past its day is counted as late on its own. An order with a deposit stays in Owed to you, and the Orders line names whoever has owed longest.',
    },
    { version: '1.0.0', notes: 'The first version: Orders and Products, and an Orders page that says the month\'s orders, what ships this week and who still owes you.' },
  ],
  business: [
    { version: '1.7.2', notes: SUMMARY },
    { version: '1.7.1', notes: 'Home is called Today on the page too, as it already was in the menu. It says what stopped reporting: Gone quiet lists what this record was taking and no longer is, with the day each was last seen.' },
    {
      version: '1.7.0',
      notes:
        'Shop is a use case of its own now, with Orders and Products. Saying you run a shop or a store proposes Shop, and a business that also sells is still Small business, with Shop beside it.',
    },
    {
      version: '1.6.0',
      notes: 'Working now lists only the agents heard from in the last fifteen minutes, where it listed any run from today, even one quiet for hours.',
    },
  ],
};
