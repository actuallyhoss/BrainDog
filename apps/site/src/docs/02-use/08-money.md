# Money

Money is a finance page, not a ledger of who owes whom. It leads with the money you have, then how long it lasts, then what comes in and goes out, and it keeps the past so you can see where the money went. Agents and rules do the filing and the chasing in view, and every question they raise waits for you on Decide.

## The Money page

Money is one page, read from the same lists from top to bottom:

- **What you have**: Cash now, with its last twelve weeks as a line, then when the money lasts until, what is coming in over the next thirty days, and what is going out.
- **Accounts**: each one with its type and the day its balance was last set, and a line to add another.
- **Waiting on you**: the questions Money's rules have asked.
- **Cash ahead**: a forecast walked forward from Cash now through every bill, invoice and repeating payment you have.
- **Coming and going**: how Cash now becomes the balance thirty days from now, step by step.
- **Where this month's money went**: this month's spending, cut by category.
- **Coming up**, **Being chased**, and what is late to you and late to pay.
- **In and out, by month**: money in and money out, what has moved and what is due.
- **Every month**: what repeats, in and out.
- **What moved**: the ledger's latest lines, with account, category and date.
- **What agents and rules did**: every change they made to your money, with who made it.

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

If you keep your own money and a company's in one record, put each in its own book. Every list that holds money can say which book a row is in, and each book has its own page under Money, with its own Cash now. The main page shows what you have by book, so one Cash now never mixes two people's money.

## More than one currency

Money works in the currency you chose at your first run. Amounts in other currencies are kept in their own currency. To add them up, choose a home currency in Money's settings, and keep Exchange rates up to date. A figure converted at old rates says as of which day. A figure with no rate for a currency says which rate is missing, rather than adding up the wrong thing.

## What the rules do for you

Money comes with rules that ask before they act:

- An invoice past its due date asks **Chase it?** Answer Chase it, and the day is stamped on the invoice, so Being chased can say how long it has been.
- A repeating payment that did not arrive asks **Did it go through?** Answer It stopped, and the repeat ends.
- An instalment due within a week tells you.
- An account whose balance was last set more than a week ago tells you, because a stale balance makes Cash now wrong.
- A cleared payment with no category is matched to a category by the words its bank line carries, where a category names them.

## Bringing money in

- Type it: add a payment to the Ledger, or an account on the Money page.
- Connect Stripe or Mercury from Add-ons, and balances and transactions arrive on their own. See [The inbox and doors](/docs/use/inbox-and-doors).
- Forward card alerts or bank texts, and teach a rule to file them.
- **Count the cash**, an add-on, writes down what is actually in a cash box or account and puts the difference from what the record expected into the ledger.

## Ask about it

Press / and ask what you owe this month, or what went on travel in August. Slash answers from these lists and shows the rows it read.
