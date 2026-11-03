/**
 * The Team example: a small product team's week, its board and its release.
 *
 * EVERY FIGURE IS FICTIONAL AND AGREES WITH EVERY OTHER, dated as the drawing is (Monday 28 September
 * 2026). The nine open tickets on Home are the board's To do, Doing and Review columns (four, three
 * and two); the 17 closed last week is the series' bar for 21 September; and Search filters, which
 * the Planner asks to move in Needs you, is one of the four still in To do.
 */
import type { Example } from './types.ts';

export const team: Example = {
  id: 'team',
  label: 'Team',
  glyph: 'users',
  pages: [
    {
      id: 'home',
      title: 'This week',
      glyph: 'home',
      src: `~~~note lead
Nine tickets are open and two wait on a review. The release goes out on Thursday.
~~~

~~~board | This week
To do | Search filters | Omar
To do | Export to CSV | Lena
To do | Billing page copy | Maya
To do | Dark mode for charts | Jun
Doing | Onboarding emails | Maya
Doing | Faster sign in | Omar
Doing | Mobile menu fixes | Jun
Review | Invite links | Lena
Review | Weekly digest | Jun
Done | Team avatars | Maya
~~~

~~~series | Tickets closed each week
Week | in: Closed | state
3 Aug | 11
10 Aug | 14
17 Aug | 9
24 Aug | 13
31 Aug | 16
7 Sep | 12
14 Sep | 15
21 Sep | 17
28 Sep | 3 | partial
~~~

~~~stat
Open | 9 | 2 in review
Release | Thursday | 1 Oct
Closed last week | 17 | the most since August
~~~`,
      layout: [
        { at: 0, cols: 12 },
        { at: 1, cols: 12 },
        { at: 2, cols: 8 },
        { at: 3, cols: 4 },
      ],
      links: { 3: [null, 'release', null] },
      reads: {
        2: 'Seventeen closed last week, the most in the eight full weeks shown. This week has just begun.',
      },
    },
    {
      id: 'needs',
      title: 'Needs you',
      glyph: 'decide',
      src: `~~~queue | Waiting on you
q | t1 | Planner | 1h ago | Move Search filters to next week's release? | It has not started, and Omar is on Faster sign in until Wednesday. | call
opt | t1 | accept | Accept | Search filters moves to the release on 8 Oct | true
opt | t1 | reject | Reject | It stays in Thursday's release |
~~~`,
    },
    {
      id: 'inbox',
      title: 'Inbox',
      glyph: 'inbox',
      src: `~~~timeline | Arrived and filed
Today 10:05 | Email from Harbor Co, an invite link expired | Linked to Invite links, in review | warn
Today 09:12 | Bug report from the web form | Linked to Mobile menu fixes
Sun 27 Sep | Weekly usage summary | Filed to Reports
~~~`,
    },
    {
      id: 'release',
      title: 'Release',
      glyph: 'board',
      src: `~~~todo | Release checklist for Thursday
[x] Freeze the branch | Wednesday at 12:00 | Omar
[x] Write the release notes | A draft in Docs | Release notes writer
[ ] Review Invite links | Two comments open | Lena
[ ] Review Weekly digest | Waiting on the copy | Jun
[ ] Check the mobile menu on small phones | | Jun
[ ] Send the release email | Thursday at 09:00 | Maya
~~~`,
    },
    {
      id: 'automations',
      title: 'Automations',
      glyph: 'refresh',
      src: `~~~steps | Find a reviewer
Starts when | A ticket moves to Review | trigger
Only if | Nobody is reviewing it yet | condition
Then | Ask the person with the fewest open reviews | step
Then | Post it in the team's channel | action
~~~`,
    },
    {
      id: 'agents',
      title: 'Agents',
      glyph: 'people',
      src: `~~~cards | Working now
who | fact: Doing | when
Triage | Sorting new support emails | now
Release notes writer | Drafting Thursday's notes | 4 min ago
~~~

~~~agents | What they did
Planner | 1 | proposed Move Search filters to next week | 1h ago
Triage | 2 | linked Email from Harbor Co to Invite links | today
Release notes writer | 5 | changed Release notes | today
~~~`,
      layout: [
        { at: 0, cols: 12 },
        { at: 1, cols: 12 },
      ],
    },
  ],
};
