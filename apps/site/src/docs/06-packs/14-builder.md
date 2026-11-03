# A plugin from what you made

A list, a page or an automation you made on your own BrainDog can go to anybody else's as a plugin. You make it in the app from what you tick, or from the command line from a page you pulled. Either way the file carries how each thing is set up, and none of what you keep in it.

## In the app

Open Plugins and press Share this setup. At the top, choose A plugin from what you made. The page lists what you made yourself: your own lists, pages, figures and automations, and nothing an installed plugin brought.

1. Tick what goes in. What a ticked thing needs comes along by itself: the list a page shows, the figure a stat names, the script an automation runs. Each one is said under What it would add, with why it came.

2. Give the plugin a name under What the plugin is called.

3. Press Download the plugin. The file is saved as `<id>.pack.json`, and nothing has been sent anywhere.

Then check it and publish it from the command line, as [Publishing and review](/docs/packs/publishing) says.

## From the command line

Pull the page you made into a file, then start a plugin from it:

```code | In a terminal
braindog page pull bills
braindog addon new bills-kit --from-page bills.dog
braindog addon check bills-kit
```

`addon new` writes the same folder it always does, with the plugin file made from your page in place of the blank one. The test file and the README are the ones a blank plugin starts with, so change the test to rows of your own list before you run `braindog addon test`.

A page file holds the page and not what it reads. So the command line makes each list the page reads from what the page shows of it: the columns, the order and the filters. Read those fields before you publish, because a page does not name every field a list holds.

A figure, a script or an automation cannot be made from a page. When your page names one, the command stops and says which field names it. Make that plugin in the app, which brings them along, or take that part out of the file and try again.

## What never goes in

The file is scrubbed before you see it, in the app and on the command line alike, and each thing taken out is said.

- Nothing you keep in a list goes in. In the app, a row goes only when you tick it as an example.
- A name, a person, a project or a row a filter names becomes a setting. It goes out holding an example, and whoever installs the plugin picks their own on its page.
- A key, a token, a password and a door's address never go in. A script's key gets a name of the script's own, so whoever installs it puts their own key under that name.
- A note's words are yours, so on the command line a note says "What this page is for, in your own words." instead. Write the plugin's own.
- A skill's words stay in your BrainDog.

Headings, labels and what an automation says are kept as you wrote them. Read them before you publish.

## Before you publish

- Run `braindog addon check` and `braindog addon test`, as [your first pack](/docs/packs/first-pack) does.
- Give the plugin a summary in your own words. Both ways start it as a line for you to replace.
- [Settings](/docs/packs/settings) says how a setting reads on the page of whoever installs it.
