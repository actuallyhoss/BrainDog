# Money

Money is a section of its own, for a business, for you, or both. It leads with the money you have, then how long it lasts, then what comes in and goes out, and it keeps the past so you can see where the money went. Agents and rules do the filing and the chasing in view, and every question they raise waits for you in Needs you.

## Money's pages

Money opens on its home: Cash now, with its last twelve weeks as a line, how long it lasts, what is coming in and going out over the next thirty days, and anything that waits on you. Its other pages sit under it in the sidebar:

```comparison | The pages under Money
Page | What it shows
Accounts | Each bank account and card, with its balance and the day it was set. Open one for its own ledger
Ledger | Every payment in and out, newest first
Budgets | This month against each budget, and budgets offered from last month's pace. Nothing is set for you
Forecast | Cash walked forward through every bill, invoice, repeat and instalment
Coming up | What is due this week and after, what repeats every month, and what is paused
Payees | Who you pay most and how often, and who pays you
Reports | In and out by month, spending by category, and this month against last
```

## Add a payment from anywhere

Press **+** anywhere in BrainDog to add money out, money in or a move between your own accounts. It suggests the payee and the category you used last time, and writes the line to the ledger. A move between your accounts is written as two lines, one out and one in, so neither counts as spending.

## Plugins for the rest

Money keeps accounts, bills, budgets and the forecast. Add the rest from Plugins when you need it: Investments and gold, Certificates, Property, Insurance, Debts, Goals, Trips and Zakat. Each adds its own pages beside Money's.

Cash now is read from your accounts, rolled forward from each account's newest balance through what has moved since. Every figure after it reads the same walk, so no two of them disagree.

## Ask the forecast what if

On Cash ahead, press **Adjust** to ask "what if". Nothing you change here is saved.

```comparison | What you can change in Cash ahead
Control | What it does
Horizon | How far ahead the forecast walks
Money in arrives late by | Pushes every expected payment to you back by that many days
Spending grows by | Raises what goes out
Money in grows by | Raises what comes in
What counts | Which money in and money out the forecast includes
```

The forecast says whether cash goes under, and in how many days. When you move a control, it says what changed: it no longer goes under, it goes under on the same day as before, or it still stays above zero. **Open full screen** gives it the whole screen.

## The lists behind it

Everything on Money lives in its lists, and you can open any of them from the sidebar:

```comparison | Money's lists
List | What it holds
Accounts | Each bank account and card, with its balance and the day it was set
Ledger | Money that moved: every payment in and out
Bills and invoices | What is due, to you or from you, and when
Repeating | Money that comes round without anybody deciding again
Instalments | What is being paid off in parts
Categories | What money is for, with a budget where you set one
Books | Separate sets of money, such as yours and a company's
Exchange rates | What one currency is worth in another
```

## Books: yours and a company's apart

If you keep your own money and a company's in one BrainDog, put each in its own book. Every list that holds money can say which book a row is in, and each book has its own page under Money, with its own Cash now. The main page shows what you have by book, so one Cash now never mixes two people's money.

## More than one currency

Money works in the currency you chose at your first run. Amounts in other currencies are kept in their own currency. To add them up, choose a home currency in Money's settings, and keep Exchange rates up to date. A figure converted at old rates says as of which day. A figure with no rate for a currency says which rate is missing, rather than adding up the wrong thing.

## What the rules do for you

Money comes with rules that ask before they act:

- An invoice past its due date asks **Chase it?** Answer Chase it, and the day is stamped on the invoice, so Being chased can say how long it has been.
- A repeating payment that did not arrive asks **Did it go through?** Answer It stopped, and the repeat ends.
- An instalment due within a week tells you.
- An account whose balance was last set more than a week ago tells you, because a stale balance makes Cash now wrong.
- A cleared payment with no category is matched to a category by the words its bank line carries, where a category names them.

## Import a bank statement

Most banks let you download a statement as a CSV file. **Import a statement** puts its lines into the Ledger of the account it came from. Find it in the ⋯ menu on Money, on an account's own page, or by searching for it. When you set up Money and add a bank or card account, its last step offers **Finish and import a statement**.

```steps
Pick the account | A statement goes into the account it came from. With no account yet, the page says so and offers Add an account | On Import a statement
Drop the CSV | Or paste its lines, with the headings first | On the same page
Check the columns | The date, description and amount columns are guessed from the headings, and you can change any of them | Under Columns
Check the preview | New lines, in the Ledger's own money and days, with lines already in the Ledger marked and skipped | Under Preview
Press Add | The new lines go into the Ledger | Then the account opens with them in it
```

Whether money out has a minus is read from the file itself where it can be, from a balance column or from a mix of minus and plain figures, and the page says what it read with **Not right?** beside it. Only when the file cannot settle it are you asked. Lines in another currency, or missing a date, amount or description, are left out and counted.

## File what came in

After an import, BrainDog offers a category for each new line by who it was paid to or from, such as Subscriptions for a streaming service or Pay for a salary: **File these lines?**, with each payee and the category beside it. Nothing is filed until you press **File**. A category you do not have yet is made when you press, and is marked new. A line no word points at is left as it is, and the page says how many: open one in the Ledger to file it by hand. In the Ledger, a line with no category shows a ? until it has one.

## Bringing money in

- Type it: press **+** for a payment, or add an account on Accounts.
- Import a bank statement as a CSV, as above.
- Connect Stripe or Mercury from Plugins, and balances and transactions arrive on their own. See [The inbox and doors](/docs/use/inbox-and-doors).
- Forward card alerts or bank texts, and teach a rule to file them.
- **Count the cash**, a plugin, writes down what is actually in a cash box or account and puts the difference from what BrainDog expected into the ledger.

## Ask about it

Press Ctrl+J (⌘J on a Mac) and ask what you owe this month, or what went on travel in August. Slash answers from these lists and shows the rows it read.
