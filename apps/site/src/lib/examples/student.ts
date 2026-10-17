/**
 * The Student example: a term of deadlines, coursework and reading.
 *
 * EVERY FIGURE IS FICTIONAL AND AGREES WITH EVERY OTHER, dated as the drawing is (Monday 28 September
 * 2026). The essay's 1,400 of 2,000 words and its Friday deadline are the same on Home, on
 * Assignments and in the question in Needs you, and the two deadlines this week are the two marked on
 * Home's timeline.
 */
import type { Example } from './types.ts';

export const student: Example = {
  id: 'student',
  label: 'Student',
  glyph: 'graduation-cap',
  pages: [
    {
      id: 'home',
      title: 'This term',
      glyph: 'home',
      src: `~~~note lead
Two deadlines this week. The history essay is at 1,400 of 2,000 words and due on Friday.
~~~

~~~stat | This week
Studied last week | 17.5 hours | of 20 planned | 12 15 16 14 17.5
Next class | Statistics | today at 10:00, room 2.14
Reading list | 7 of 12 | chapters read
~~~

~~~timeline | Deadlines
Wed 30 Sep | Statistics problem set 3 | Questions 1 to 8 | warn
Fri 2 Oct | History essay | 2,000 words, a draft to your tutor | warn
Mon 12 Oct | Chemistry lab report | The titration practical
Thu 5 Nov | Statistics mid-term | Weeks 1 to 5
~~~

~~~progress | Coursework
History essay | 1400 | 2000 | words written
Reading list | 7 | 12 | chapters
Revision cards | 45 | 120 | cards made
~~~`,
      layout: [
        { at: 0, cols: 12 },
        { at: 1, cols: 12 },
        { at: 2, cols: 6 },
        { at: 3, cols: 6 },
      ],
      links: { 1: [null, null, 'assignments'] },
      reads: {
        3: 'The essay is 600 words from done. Revision cards are furthest behind, at 45 of 120.',
      },
    },
    {
      id: 'needs',
      title: 'Needs you',
      glyph: 'decide',
      src: `~~~queue | Waiting on you
q | s1 | Study planner | 1h ago | Move Thursday's reading to Saturday morning? | Thursday has the lab and two lectures, and the essay is due on Friday. | call
opt | s1 | accept | Accept | Two hours of reading move to Saturday at 10:00 | true
opt | s1 | reject | Reject | The reading stays on Thursday evening |
~~~`,
    },
    {
      id: 'inbox',
      title: 'Inbox',
      glyph: 'inbox',
      src: `~~~timeline | Arrived and filed
Today 09:40 | Lecture slides, Statistics week 2 | Filed to Statistics
Today 07:55 | Feedback on problem set 2, 16 of 20 | Filed to Assignments | good
Sun 27 Sep | Library notice, 2 books due | Filed to Reading list, due 3 Oct
~~~`,
    },
    {
      id: 'assignments',
      title: 'Assignments',
      glyph: 'task',
      src: `~~~todo | Assignments
[ ] Statistics problem set 3 | Questions 1 to 8 | Due Wed 30 Sep | Statistics
[ ] History essay | A draft to your tutor, 1,400 of 2,000 words | Due Fri 2 Oct | History
[ ] Chemistry lab report | The titration practical | Due Mon 12 Oct | Chemistry
[x] Statistics problem set 2 | Questions 1 to 6 | Handed in 23 Sep | Statistics
[x] Reading response, week 1 | 500 words | Handed in 21 Sep | History
~~~`,
    },
    {
      id: 'automations',
      title: 'Automations',
      glyph: 'refresh',
      src: `~~~steps | Plan time for a new assignment
Starts when | An assignment is added | trigger
Only if | It is due within seven days | condition
Then | Put two study blocks in your week before it | step
Then | Remind you the evening before it is due | action
~~~`,
    },
    {
      id: 'agents',
      title: 'Agents',
      glyph: 'people',
      src: `~~~cards | Working now
who | fact: Doing | when
Study planner | Planning this week around the essay | now
Reading helper | Summarising chapter 8 of the reading list | 5 min ago
~~~

~~~agents | What they did
Study planner | 1 | proposed Move Thursday's reading to Saturday | 1h ago
Reading helper | 3 | added Notes on chapter 7 | yesterday
~~~`,
      layout: [
        { at: 0, cols: 12 },
        { at: 1, cols: 12 },
      ],
    },
  ],
};
