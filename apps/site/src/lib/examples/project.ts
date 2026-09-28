/**
 * The New project example: somebody three weeks into starting something, with no template for it.
 *
 * ITS HOME IS THE PAGE `loop/DIRECTION.md` §28 SETS AS THE BAR, in its order: a sentence about where
 * things stand, the areas as cards with their progress, a decision with its options shown, the path
 * of steps, a note with a second opinion under it, and the budget drawn as a range. Nothing on it
 * names the model that drafted it.
 *
 * EVERY FIGURE IS FICTIONAL AND AGREES WITH EVERY OTHER, dated as the drawing is (Monday 28 September
 * 2026). The Website area's 3 of 6 is the path's "three of six sections drafted"; the hosting range
 * is the two options on the decision over a year (GBP 6.00 and GBP 19.00 a month); and 26 October,
 * the planned launch, is a Monday, which is what the note and its second opinion are about.
 */
import type { Example } from './types.ts';

export const project: Example = {
  id: 'project',
  label: 'New project',
  glyph: 'rocket',
  pages: [
    {
      id: 'home',
      title: 'Your project',
      glyph: 'home',
      src: `~~~note lead
Three weeks in. The name is chosen, the landing page is half built, and nothing has gone over budget.
~~~

~~~cards | Areas
title | ring: Done | next | fact: Owner
Brand | 4/5 | Order business cards | You
Website | 3/6 | Write the pricing section | You
Launch | 1/5 | Open the waitlist | Planner
~~~

~~~queue | A decision
q | h1 | Planner | yesterday | Where should the landing page live? | Both fit the budget. They differ in how much you look after yourself. | call
opt | h1 | managed | A managed host | Updates and backups are done for you | true | figure:GBP 19.00 a month
opt | h1 | own | Your own server | Cheaper, and you keep it patched yourself | | figure:GBP 6.00 a month
~~~

~~~steps path | The path
Pick a name | Done 14 Sep | done
Buy the domain | Done 16 Sep | done
Build the landing page | Three of six sections drafted | next
Open the waitlist | |
Launch | Planned for Monday 26 Oct |
~~~

~~~cards | A note, and a second opinion
title | reply
Launch on the Monday, so the whole week is there to fix what launch shows | Second opinion from the Researcher: the newsletter goes out on Tuesdays, so a Tuesday launch reaches twice the readers.
~~~

~~~progress range | Budget
Name and domain | GBP 64.00 | GBP 50.00 | GBP 120.00
Design | GBP 350.00 | GBP 300.00 | GBP 600.00
Hosting, the first year | GBP 0.00 | GBP 72.00 | GBP 228.00
Launch ads | GBP 0.00 | GBP 200.00 | GBP 400.00
~~~`,
      layout: [
        { at: 0, cols: 12 },
        { at: 1, cols: 12 },
        { at: 2, cols: 6 },
        { at: 3, cols: 6 },
        { at: 4, cols: 6 },
        { at: 5, cols: 6 },
      ],
    },
    {
      id: 'decide',
      title: 'Decide',
      glyph: 'decide',
      src: `~~~queue | Waiting on you
q | h1 | Planner | yesterday | Where should the landing page live? | Both fit the budget. They differ in how much you look after yourself. | call
opt | h1 | managed | A managed host | Updates and backups are done for you | true | figure:GBP 19.00 a month
opt | h1 | own | Your own server | Cheaper, and you keep it patched yourself | | figure:GBP 6.00 a month
q | h2 | Researcher | 2h ago | Move the launch to Tuesday 27 Oct? | The newsletter goes out on Tuesdays, and a launch the same morning reaches twice the readers. | call
opt | h2 | accept | Accept | Launch moves to Tuesday 27 Oct, and the path follows | true
opt | h2 | reject | Reject | Launch stays on Monday 26 Oct |
~~~`,
    },
    {
      id: 'inbox',
      title: 'Inbox',
      glyph: 'inbox',
      src: `~~~timeline | Arrived and filed
Today 11:20 | Invoice from the designer, GBP 350.00 | Filed to Budget, Design | good
Sat 26 Sep | Domain renewal reminder | Filed to Tasks, due next September
Fri 25 Sep | Three name ideas from a friend | Filed to Brand
~~~`,
    },
    {
      id: 'tasks',
      title: 'Tasks',
      glyph: 'task',
      src: `~~~todo | Tasks
[x] Pick a name | A shortlist of three, and one chosen | Done 14 Sep | Brand
[x] Buy the domain | | Done 16 Sep | Website
[ ] Write the pricing section | Two plans, a paragraph each | Due 2 Oct | Website
[ ] Order business cards | The proof is approved | Due 5 Oct | Brand
[ ] Open the waitlist | A form and a thank-you email | Due 12 Oct | Launch
[ ] Book a newsletter slot for launch week | | Due 19 Oct | Launch
~~~`,
    },
    {
      id: 'automations',
      title: 'Automations',
      glyph: 'refresh',
      src: `~~~steps | Keep the path moving
Starts when | A task is marked done | trigger
Only if | It is a step on the path | condition
Then | Mark the step after it as next | step
Then | Move its area's progress on Home | action
~~~`,
    },
    {
      id: 'agents',
      title: 'Agents',
      glyph: 'people',
      src: `~~~cards | Working now
who | fact: Doing | when
Planner | Drafting the waitlist email | now
Researcher | Comparing newsletter slots for launch week | 3 min ago
~~~

~~~agents | What they did
Planner | 1 | proposed Where should the landing page live | yesterday
Researcher | 1 | proposed Move the launch to Tuesday | 2h ago
Planner | 4 | added Tasks for the Launch area | yesterday
~~~`,
      layout: [
        { at: 0, cols: 12 },
        { at: 1, cols: 12 },
      ],
    },
  ],
};
