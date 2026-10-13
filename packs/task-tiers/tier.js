/**
 * Task tiers: a task's four judgements added up, and the tier they come to written on the task with its reason.
 *
 * STARTED BY THE PACK'S AUTOMATION WHEN A TASK IS CREATED OR ONE OF THE FOUR CHANGES, which hands it the task's id.
 * The four are whole numbers from 0 to 25 that a person or an agent gives: Brings money, Unblocks other work, Has a
 * clock on it, and Cheap to do. Together they come to at most 100.
 *
 * THE BANDS. Under 40 is Low, 40 to 59 is Normal, 60 to 79 is High, and 80 or more is Urgent. These are the values
 * Work's own Priority already takes, so every page and filter that reads Priority reads the tier.
 *
 * THE REASON IS THE SUM, SAID IN A LINE: "Money 20, unblocks 15, clock 25, cheap 5: 65 of 100." It is written into
 * Work's Why this tier, so a list ordered by tier can be argued with by the person reading it.
 *
 * WORDS A PERSON WROTE ARE KEPT. Whatever Why this tier already says stays after the line. A line this script wrote
 * before is replaced by the new one, so the words are not doubled and an old sum is not left standing.
 *
 * WHAT IT LEAVES ALONE. A task with none of the four is not touched, so a tier somebody typed stands. A number
 * nobody gave counts as nothing. A task already at its tier with its line is not written again.
 *
 * IT WRITES TWO FIELDS, Priority and Why this tier, in one update, and the automation watches neither, so this script
 * does not start itself again.
 */

const FOUR = ['rev', 'unblock', 'clock', 'cheap'];
/** The most one judgement counts for, which is what the field itself takes. */
const MOST = 25;

/** The line a run of this script wrote, at the start of a reason, with the space after it. */
const WRITTEN = /^Money \d+, unblocks \d+, clock \d+, cheap \d+: \d+ of 100\.\s*/;

const given = (v) => typeof v === 'number' && Number.isFinite(v);
/** One judgement as a whole number from 0 to 25. The field refuses anything else, and a row written before it did not. */
const counted = (v) => (given(v) ? Math.min(MOST, Math.max(0, Math.round(v))) : 0);

const tierOf = (sum) => (sum >= 80 ? 'urgent' : sum >= 60 ? 'high' : sum >= 40 ? 'normal' : 'low');

export default async function run(ctx) {
  const task = await ctx.record.get(String(ctx.input.id));
  if (task === null) {
    ctx.log('The task that started this run is gone, so nothing was written.');
    return;
  }
  const f = task.fields;
  if (!FOUR.some((id) => given(f[id]))) {
    ctx.log('This task has none of the four numbers, so its tier was left as it is.');
    return;
  }

  const [rev, unblock, clock, cheap] = FOUR.map((id) => counted(f[id]));
  const sum = rev + unblock + clock + cheap;
  const line = `Money ${rev}, unblocks ${unblock}, clock ${clock}, cheap ${cheap}: ${sum} of 100.`;
  const words = (typeof f.why === 'string' ? f.why : '').replace(WRITTEN, '').trim();
  const why = words === '' ? line : `${line} ${words}`;
  const priority = tierOf(sum);

  if (f.priority === priority && f.why === why) return;
  ctx.update(`tasks#${task.seq}`, { priority, why }, task.version);
}
