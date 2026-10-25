/**
 * WHAT THE ADD-ONS THIS BUILD SHIPS ARE CALLED AND ARE FOR, by the id a record holds them under: the last words for an
 * installed add-on that neither the build's modules nor the store's catalogue name, so it is never drawn as its id
 * ("Bank hsbc eg") or as the names of its lists. Taken from each `packs/<id>/<id>.pack.json`.
 */
export const SHIPPED_ADDONS: Readonly<Record<string, readonly [title: string, summary: string]>> = {
  "agent-notes": ["Agent notes", "Two short notes a day, at 08:00 and 17:00 your time, of what your agents ask you, what they did and what is stuck. Nothing when there is nothing to say, and never by mail."],
  "bank-hsbc-eg": ["HSBC Egypt alerts", "Reads HSBC Egypt alert mails and text messages into Money as transactions, each with the balance it prints, and a message that only prints a balance as a balance check."],
  "card-alerts": ["Card alerts", "Reads a card alert that names the card's last four digits into Money as a transaction, forwarded by mail or posted as a text message."],
  "count-cash": ["Count the cash", "Write down what is actually in a cash box or an account, and the record keeps it as a balance check and writes the difference from what it thought was there into the ledger."],
  "dates": ["Dates", "The days somebody else fixed: a deadline, a window with a last day, and a date that comes round each week, month or year."],
  "estate": ["Services", "Domains, hosting, subscriptions, memberships, insurance and bills, and when each one renews."],
  "flow-check": ["Flow check", "A test bench for automations: one automation for each way one can start, the order rules run in, a wait on a question, and the limit on rules starting rules. Each one writes a note that says what started it, so a check can read back what ran."],
  "harbour-look": ["Harbour look", "A sea blue-green in place of the house red, on a cooler grey, in light and in dark."],
  "hello": ["Hello", "A list of things to do and a page showing what is still open: the smallest useful add-on, in the shape braindog pack new starts every one."],
  "holdings": ["Holdings", "What you hold rather than spend: certificates, policies and commodities, with what each one cost, what each is worth now when you have a price for it, and what they come to together."],
  "job-starter": ["Starter jobs", "Three kinds of job to run on your own machine: a review of your week, a sort of what arrived, and where a repository stands. Each one only reads and proposes, and you approve each kind once before it can run."],
  "landlord": ["Landlord", "The flats and houses you rent out, each tenancy with its rent, deposit and end day, the rent that came in and the repairs. Says what is due this month, what arrived, who has not paid, what is empty and which tenancy ends next."],
  "launch-desk": ["Launch desk", "A desk for launching a thing in parts: where it stands in one sentence, each part in its own colour and picture with its next step, the steps on a calendar by the day they are due, the calls waiting on you, a pad beside it, and a price check."],
  "live-feed": ["Live feed", "Polls stats.example.com every 1h, one request each time, for Monthly recurring revenue, Active users."],
  "mercury": ["Mercury", "Reads the balance of every Mercury account from api.mercury.com, once an hour or as often as its setting says, into Money's accounts, and its last thirty days of transactions into the ledger."],
  "money-watch": ["Money watch", "Reads the Ledger for a charge made twice and a payment that repeats, and asks you once about each. Charged twice stops asking about a payee whose last three answers were Both real, and Looks like it repeats switches itself off after three No's in a row."],
  "new-project": ["Starting a project", "A guide for something new: three stages (idea, first users, first money), the next steps at each as a checklist an agent can tick, the decisions you made with reasons, and a weekly page on where it stands."],
  "pad": ["Pad", "Notes beside the work, each with room for a reply under it. It asks no model, so it keeps on any record."],
  "pad-second-opinion": ["Pad second opinion", "A second opinion written under each note on the pad. It asks your record's model about every note with no reply, so each note spends some of its allowance."],
  "people": ["People", "Clients, contractors and accountants, the organisations they are with, and where each one was seen."],
  "photographer": ["Photographer", "Shoots from the first enquiry to the fee paid, what each one still owes the client and by when, and the gear with the day its cover ends."],
  "portfolio": ["Projects", "The things you run, and the plan for each."],
  "portfolio-bands": ["Revenue bands", "What your projects take a month now, and the room left in their forecasts next and later, worked out every day and drawn as one bar."],
  "profiles": ["Profiles", "Each setup your agents run under: the app, the account it signs in as, how it is paid for and the projects it serves, with every machine it is on and whether each copy still matches. Kept for you alone, so nobody you share with sees it."],
  "project-brief": ["Project brief", "What each project is in a line, the stage it is at, what is in the way, and a plan made of steps you can tick."],
  "reading-list": ["Reading list", "Books and articles to read, what you are reading now, and a line on each one you finish."],
  "retainer-hours": ["Agency", "Retainers and timesheets for a small agency: each client's hours used this month against the hours it bought, what was billed of what was worked, and what the retainers bring in a month."],
  "roadmap": ["Roadmap", "Your dated tasks on one time axis: work with an effort as a window, a due day as a line, and either dragged to a new date."],
  "rule-sheet": ["Rule sheet", "Fourteen pages that draw every rule of a value, a block and a layout on your own record, so a check can read each rule where a person sees it."],
  "setup-sync": ["Setup sync", "What each of your machines carries to the next: settings files, your own programs, tool sign-ins and work not yet pushed, locked on the machine before it leaves, so BrainDog keeps only what it cannot open. A new machine joins with your sync passphrase and is set up again in under an hour. Kept for you alone."],
  "slash-desk": ["Slash on your machine", "Hands the heavy thinking of composing a page to your own machine. You press it on Slash, one job runs on a machine you enrolled, and what it would change waits for you in Decide. It writes nothing itself."],
  "standup": ["Standup", "One message every morning about the work: what moved since yesterday, what is blocked, and what agents finished. A morning with none of the three sends nothing."],
  "stripe": ["Stripe", "Reads the Stripe balance, available and pending, and the payouts on their way to the bank from api.stripe.com every hour, into Money's accounts."],
  "studies": ["Studies", "Your courses, assignments with due dates, marks as numbers with a trend for each course, a reading list and study sessions. Says what is due this week first."],
  "task-tiers": ["Task tiers", "Give a task four numbers, what it brings in, what it unblocks, whether it has a clock on it and how cheap it is, and the record works out its priority and writes the sum as the reason."],
  "team-board": ["Team task list", "Tasks with an owner, a person or an agent, a status and a priority, a board to move them across, and a page that says who is doing what right now, fed by agent sessions."],
  "week-in-money": ["Week in money", "One message every Monday morning: cash now, what fell due in the week in both directions, and what money arrived, opened by two sentences from Slash where the host has Slash."],
  "work": ["Work", "Tasks, the threads of work they belong to, and how each thread is going."],
  "worked-numbers": ["Worked numbers", "Numbers worked out from your other numbers every day: a change over a week, a ratio, a share, a sum or a difference, written beside the readings they came from."],
};

export const shippedTitle = (id: string): string | undefined => (Object.hasOwn(SHIPPED_ADDONS, id) ? SHIPPED_ADDONS[id]![0] : undefined);
export const shippedLine = (id: string): string | undefined => (Object.hasOwn(SHIPPED_ADDONS, id) ? SHIPPED_ADDONS[id]![1] : undefined);
