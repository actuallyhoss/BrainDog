/**
 * THE CONTEXT PLAN (agents and MCP plan §3, W2-B): ranked, budgeted at about 700 tokens, led by what he told the agent.
 *
 * The fixtures have the shape of his record: 888 runs of which three others are live in worktrees of the same repo,
 * 176 keys, ninety open tasks, three hundred lessons, fifteen rules, a queue of decisions and an instruction. And one
 * test draws the plan from the seed's own `context`, through `factsFromContext`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FULL_BUDGET, KPI_HOW, PLAN_BUDGET, PLAN_CARD_LINES, PLAN_CARD_WORDS, factsFromContext, kpiLine, planContext, planText, tokensOf, valueWords, durationWords, type ContextFacts, type LessonFact, type ToldFact } from '../src/context-plan.ts';
import { decidedLately, lessonsHeld } from '../src/context-caps.ts';
import { TWO_SESSIONS, wordCount, type CardParts } from '../src/card.ts';
import { createRecordApi, type CallContext, type Context } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';
import { NOW, installSeed } from '../../seed/src/index.ts';

const AT = Date.UTC(2026, 9, 21, 12);
const DAY = 86_400_000;
const iso = (ms: number): string => new Date(ms).toISOString();

const who = (over: Partial<CardParts> = {}): CardParts => ({
  who: 'Claude Code on MacBook, working on BrainDog',
  placed: true,
  also: null,
  next: 'Next     Build wave 2 of the agents plan. (Claude Code, 2h ago, check before acting)',
  signs: 'Signs    1 read red here: Agent runs end cleanly',
  waiting: 'Waiting  1 on Mara, first: Add 12 tools for use everywhere?',
  learned: 'Learned  Money is minor units plus currency.',
  update: null,
  step: null,
  ...over,
});

const IN4: ToldFact = { id: 'IN4', said: 'Merge wave 1, then stop', by: 'Mara', at: iso(AT - 5 * 60_000), kind: 'tell', when: 'now', to: 'run', state: 'sent', taken_by: null };

/** A lesson, `days` old, confirmed `confirmed` days ago or never. */
const lesson = (n: number, days: number, over: Partial<LessonFact> = {}): LessonFact => ({
  spoken: `LN${String(n)}`,
  said: `Lesson ${String(n)}: check part ${String(n % 13)} first.`,
  kind: n % 3 === 0 ? 'method' : 'fact',
  here: n % 2 === 0,
  made: iso(AT - days * DAY),
  confirmed: null,
  ...over,
});

/** Facts the size of his record. */
function his(over: Partial<ContextFacts> = {}): ContextFacts {
  return {
    stop: null,
    told: [IN4],
    who: who(),
    may: { ceiling: 'write', lists: ['Tasks', 'Learnings'], on: 'BrainDog' },
    rules: [
      { said: 'Never add Claude or AI attribution to commits, PRs or files.', here: false },
      { said: 'Write plain and short, like a person; no AI scaffolding.', here: false },
      { said: 'No glass, gradients or pills in the UI.', here: false },
      ...Array.from({ length: 12 }, (_, i) => ({ said: `Rule ${String(i)} for the BrainDog repo: keep the gates green.`, here: true })),
    ],
    brief: 'You build BrainDog. Keep to the plan in docs/plans, one builder per worktree.',
    others: [
      { spoken: 'S884', agent: 'claude', doing: 'W2-A record methods and guard', branch: 'worktree-agent-a613', worktree: 'agent-a613', for_s: 32 * 60 },
      { spoken: 'S885', agent: 'claude', doing: 'W2-C MCP tools', branch: 'worktree-agent-ab33', worktree: 'agent-ab33', for_s: 20 * 60 },
      { spoken: 'S886', agent: 'codex', doing: 'W0-A agent bench', branch: 'worktree-agent-a97f', worktree: 'agent-a97f', for_s: 3 * 3_600 },
    ],
    lane: Array.from({ length: 90 }, (_, i) => ({ name: `Task ${String(i)} on part ${String(i % 23)}`, spoken: `tasks#${String(300 + i)}`, version: 2, state: 'open', mine: i % 7 === 0 })),
    decided: Array.from({ length: 10 }, (_, i) => ({ said: `Ship choice ${String(i)}: after the UI pass`, at: iso(AT - i * 3 * DAY), mine: i === 4 })),
    learned: Array.from({ length: 300 }, (_, i) => lesson(i, i % 120)),
    run: 'S883',
    agent: 'claude',
    branch: 'worktree-agent-a21c',
    now: AT,
    stamp: 'v1234',
    extra: { keys: Array.from({ length: 176 }, (_, i) => `KEY_${String(i)}`), tools: ['granola', 'xcode'], people: ['Teodor', 'Priya'], signs: ['68 of 73 runs this week did not end normally'] },
    ...over,
  };
}

const lines = (text: string): string[] => text.split('\n');

test('ON A RECORD THE SIZE OF HIS, the default answer is 700 tokens or less, and tokens is the text it prints', () => {
  const plan = planContext(his());
  const text = planText(plan);
  assert.ok(plan.tokens <= PLAN_BUDGET, `${String(plan.tokens)} tokens:\n${text}`);
  assert.equal(plan.tokens, tokensOf(text));
  assert.equal(plan.stamp, 'v1234');
});

test('IT LEADS WITH WHAT HE TOLD IT, in his voice, with the call that takes it, then the card', () => {
  const text = planText(planContext(his()));
  const first = lines(text)[0]!;
  assert.match(first, /^Told {5}Mara said in BrainDog \(IN4\): "Merge wave 1, then stop", 5m ago\. Take it: instructions \{take:"IN4"\}\.$/u);
  assert.equal(lines(text)[1], 'Claude Code on MacBook, working on BrainDog');
});

test('THE SECTIONS COME IN RANK ORDER: card, may, rules and brief, here now, lane, decided, lessons', () => {
  const plan = planContext(his(), { budget: 1_200 });
  assert.deepEqual(plan.sections.map((s) => s.id), ['told', 'may', 'rules', 'here', 'lane', 'decided', 'learned']);
  const text = planText(plan);
  assert.ok(text.includes('May      You write Tasks and Learnings on BrainDog; money, keys and deletes are asked.'), text);
  assert.ok(text.includes('Rules    Brief: You build BrainDog.'), text);
});

test('THE CARD IS FIVE LINES AND 120 WORDS AT MOST, with no More line and no signs', () => {
  const long = 'word '.repeat(80);
  const plan = planContext(his({ who: who({ next: `Next     ${long}`, waiting: `Waiting  ${long}`, update: 'Update   This command is older than this BrainDog. Run braindog update, or switch on updates by itself in Settings > Agents.' }) }));
  const card = lines(plan.card);
  assert.ok(card.length <= PLAN_CARD_LINES, plan.card);
  assert.ok(wordCount(plan.card) <= PLAN_CARD_WORDS, `${String(wordCount(plan.card))} words`);
  assert.ok(card.at(-1)!.startsWith('Update'), 'the Update line is kept');
  const text = planText(planContext(his()));
  assert.ok(!text.includes('call context for the full picture'), text);
  assert.ok(!text.includes('Signs'), text);
});

test('TOLD YOU IS NEVER CUT, past any budget: a long instruction is said whole', () => {
  const said = 'Do this. '.repeat(200).trim();
  const plan = planContext(his({ told: [{ ...IN4, said }] }), { budget: 400 });
  const text = planText(plan);
  assert.ok(text.includes(said), 'the instruction was cut');
  assert.ok(plan.card.length > 0);
});

test('A STOP IS THE FIRST LINE, in his voice, and what still works', () => {
  const plan = planContext(his({ stop: { kind: 'pause', id: 'IN7', said: 'Hold until I check the deploy' }, owner: 'Mara' }));
  const first = lines(planText(plan))[0]!;
  assert.match(first, /^Stop {5}Mara paused you in BrainDog \(IN7\): "Hold until I check the deploy"\. Wait: only instructions, handoff and log/u);
});

test('A CUT SECTION SAYS HOW MANY IT LEFT AND THE EXACT CALL', () => {
  const plan = planContext(his());
  const lane = plan.sections.find((s) => s.id === 'lane');
  assert.ok(lane?.more, JSON.stringify(plan.sections.map((s) => s.id)));
  assert.equal(lane.more.n + lane.lines.length, 90);
  assert.equal(lane.more.call, 'list {"register":"tasks","where":{"field":"agent","is":"claude"}}');
  assert.match(planText(plan), new RegExp(`and ${String(lane.more.n)} more: list \\{`, 'u'));
});

test('THE LANE: tasks handed to this kind of agent lead, each with its handle and version', () => {
  const plan = planContext(his(), { budget: 1_200 });
  const lane = plan.sections.find((s) => s.id === 'lane')!;
  assert.match(lane.lines[0]!, /^Lane {5}Task 0 on part 0 \(tasks#300 v2\) · open · yours$/u);
  assert.ok(lane.lines.slice(0, 5).every((l) => l.endsWith('yours')), lane.lines.join('\n'));
});

test('WORKING HERE NOW: worktree builders of the same repo are said, with branch and how long; no warning across worktrees', () => {
  const text = planText(planContext(his(), { budget: 1_200 }));
  assert.ok(text.includes('Here now S884 Claude Code, W2-A record methods and guard (branch worktree-agent-a613, for 32m)'), text);
  assert.ok(text.includes('S886 Codex, W0-A agent bench (branch worktree-agent-a97f, for 3h)'), text);
  assert.ok(!text.includes(TWO_SESSIONS), text);
});

test('ANOTHER RUN ON YOUR BRANCH IS WARNED OF, and the warning is never cut', () => {
  const others = [...his().others, { spoken: 'S887', agent: 'claude', doing: 'Same branch', branch: 'worktree-agent-a21c', for_s: 60 }];
  const plan = planContext(his({ others }), { budget: 200 });
  const text = planText(plan);
  assert.ok(text.includes(`S887 is on your branch worktree-agent-a21c. ${TWO_SESSIONS}`), text);
  /* ON THE CARD, which is all the start hook prints, and said once in the whole text. */
  assert.ok(plan.card.includes(`Also     S887 is on your branch worktree-agent-a21c. ${TWO_SESSIONS}`), plan.card);
  assert.equal(text.split(TWO_SESSIONS).length, 2, text);
});

test('A RUN IN YOUR WORKING TREE IS WARNED OF ON THE CARD: Learned gives way, Next and Update stay, five lines', () => {
  const others = [...his().others, { spoken: 'S888', agent: 'claude', doing: 'Same folder', branch: 'other', same_tree: true, for_s: 60 }];
  const update = 'Update   This command is older than this BrainDog. Run braindog update, or switch on updates by itself in Settings > Agents.';
  const plan = planContext(his({ others, told: [], who: who({ update }) }));
  const card = lines(plan.card);
  assert.equal(card.length, PLAN_CARD_LINES, plan.card);
  assert.match(card[1]!, /^Next\s/u, plan.card);
  assert.equal(card[2], `Also     S888 is in your working tree. ${TWO_SESSIONS}`);
  assert.ok(card.at(-1)!.startsWith('Update'), plan.card);
  assert.ok(!plan.card.includes('Learned'), 'Learned gave way');
  assert.ok(wordCount(plan.card) <= PLAN_CARD_WORDS, plan.card);
  assert.equal(planText(plan).split(TWO_SESSIONS).length, 2, planText(plan));
  /* AND NOBODY ELSE IN THE TREE, NO WARNING: Learned is back. */
  const alone = planContext(his({ told: [] }));
  assert.ok(!alone.card.includes(TWO_SESSIONS) && alone.card.includes('Learned'), alone.card);
});

test('THE RECORD’S OWN SAME-TREE LINE IS THE CARD’S WARNING when it sent one, by name and what each is doing, said once', () => {
  const also = `Also     ${TWO_SESSIONS} Also here: Claude (S9), Kerning the pairs.`;
  const others = [...his().others, { spoken: 'S9', agent: 'claude', doing: 'Kerning the pairs', branch: 'other', same_tree: true, for_s: 60 }];
  const plan = planContext(his({ others, who: who({ also }) }));
  assert.ok(lines(plan.card).includes(also), plan.card);
  assert.equal(planText(plan).split(TWO_SESSIONS).length, 2, planText(plan));
});

test('DECIDED LATELY: the last 14 days, the answer to this run’s own question first', () => {
  const plan = planContext(his(), { budget: 1_200 });
  const decided = plan.sections.find((s) => s.id === 'decided')!;
  assert.match(decided.lines[0]!, /^Decided {2}9 Oct: Ship choice 4: after the UI pass \(you asked\)$/u);
  assert.equal(decided.lines.length, 3);
  assert.equal(decided.more?.n, 2, 'five of the ten are within 14 days');
});

test('LESSONS THAT HELD: confirmed lately first; never confirmed and older than 60 days left out and returned to retire', () => {
  const learned = [lesson(1, 90), lesson(2, 10), lesson(3, 100, { confirmed: iso(AT - 2 * DAY) }), lesson(4, 5, { kind: 'rule' })];
  const held = lessonsHeld(learned, AT);
  assert.deepEqual(held.rows.map((l) => l.spoken), ['LN3', 'LN2']);
  assert.deepEqual(held.retire, ['LN1']);
  const plan = planContext(his({ learned }));
  assert.deepEqual(plan.retire, ['LN1']);
  assert.ok(plan.card.includes('Learned  Lesson 3: check part 3 first.'), plan.card);
  assert.ok(!planText(plan).includes('Lesson 1:'));
});

test('THE TEACHING LINES ARE SAID ONCE A RUN, on its first call only', () => {
  const teach = ['A note about nothing in particular goes on your own session: log it with no spoken.'];
  assert.ok(planText(planContext(his({ first: true, teach }), { budget: 1_200 })).includes(teach[0]!));
  assert.ok(!planText(planContext(his({ first: false, teach }), { budget: 1_200 })).includes(teach[0]!));
  assert.ok(!planText(planContext(his({ teach }), { budget: 1_200 })).includes(teach[0]!));
});

test('KEYS, TOOLS, PEOPLE AND SIGNS ONLY ON REQUEST: none of the 176 keys in the default answer, all at depth full', () => {
  assert.ok(!planText(planContext(his())).includes('KEY_'));
  const full = planContext(his(), { depth: 'full' });
  assert.ok(full.tokens <= FULL_BUDGET);
  assert.ok(planText(full).includes('Keys: KEY_0, KEY_1'), planText(full));
});

test('AN INSTRUCTION IN HAND is the card’s Next, and Told says how to reply', () => {
  const told = [{ ...IN4, state: 'working' as const, taken_by: 'S883' }];
  const plan = planContext(his({ told }));
  assert.ok(plan.card.includes('Next     IN4, in hand: do it, then reply with instructions.'), plan.card);
  assert.ok(planText(plan).includes('You have it: when done, instructions {reply:"IN4", said:"…", state:"done"}.'));
  const theirs = planText(planContext(his({ told: [{ ...IN4, taken_by: 'S884' }] })));
  assert.ok(theirs.includes('S884 has it.'), theirs);
});

test('A WORKTREE BUILDER: its lead first, with what the lead was told, and not the owner’s queue', () => {
  const others = [{ spoken: 'S880', agent: 'claude', doing: 'Running wave 2', role: 'lead' as const, told: 'Build wave 2', for_s: 3_600 }, ...his().others.map((o) => ({ ...o, role: 'sibling' as const }))];
  const plan = planContext(his({ others }), { budget: 1_200 });
  const here = plan.sections.find((s) => s.id === 'here')!;
  assert.match(here.lines[0]!, /^Here now Your lead S880 Claude Code, Running wave 2 \(for 1h\); told "Build wave 2"$/u);
  assert.ok(!plan.card.includes('Waiting'), plan.card);
});

test('NO PROJECT HERE: the card says so and names the projects worked on last', () => {
  const plan = planContext(his({ who: who({ who: 'Claude Code on MacBook, no project yet: name it to context as project', placed: false, next: null }), recent: ['Lanternfish', 'Copperleaf', 'Quietcart'], lane: [] }));
  assert.equal(lines(plan.card)[0], 'Claude Code on MacBook. No project here. Lately: Lanternfish, Copperleaf and Quietcart; name one to context as project.');
});

test('A SCRIPT KEY is told only what it was told and what it may do', () => {
  const plan = planContext(his({ who: null, may: { ceiling: 'propose' } }));
  assert.deepEqual(plan.sections.map((s) => s.id), ['told', 'may']);
  assert.equal(plan.card, '');
});

test('SINCE A STAMP, only what changed, and "nothing new" is one line', () => {
  const none = planContext(his({ since: { stamp: 'v1240' } }));
  assert.equal(planText(none), 'Since    Nothing new since you last looked.');
  assert.equal(none.stamp, 'v1234');
  const one = planText(planContext(his({ since: { stamp: 'v1240', told: [IN4], runs: ['S889 Claude Code started: W2-D hooks'] } })));
  assert.equal(one.split('\n').length, 2, one);
  assert.ok(one.startsWith('Told     Mara said in BrainDog (IN4)'), one);
});

test('WITH A TASK, the task whole with its version, then its needs; no lane', () => {
  const task = { name: 'Send the refund email', spoken: 'tasks#396', version: 4, state: 'open', fields: { Due: '24 Oct' }, note: 'Ines asked twice.', history: ['21 Oct: moved to open', '20 Oct: made'], keys: ['STRIPE_KEY'], people: ['Ines'] };
  const plan = planContext(his({ task }));
  const text = planText(plan);
  assert.ok(text.includes('Task     Send the refund email (tasks#396 v4) · open'), text);
  assert.ok(text.includes('Note: Ines asked twice.'));
  assert.ok(text.includes('Needs    People: Ines'), text);
  assert.ok(!plan.sections.some((s) => s.id === 'lane'));
});

test('A SMALLER BUDGET IS KEPT TO, and the lower sections give way first', () => {
  const plan = planContext(his(), { budget: 400 });
  assert.ok(plan.tokens <= 400, `${String(plan.tokens)}`);
  assert.ok(plan.sections.some((s) => s.id === 'may'));
});

test('decidedLately and the rule card: a decision older than 14 days is not lately', () => {
  assert.deepEqual(decidedLately([{ said: 'Old', at: iso(AT - 15 * DAY) }, { said: 'Decided 2 Oct: New', at: iso(AT - DAY) }], AT), ['20 Oct: New']);
});

test('FROM THE SEED’S OWN CONTEXT: the plan is under budget, leads with the card, and teaches nothing twice', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  const seeded = await installSeed(api.kernel);
  assert.ok(seeded.ok);
  const agent: CallContext = { principal: { kind: 'token', id: 'tok_1', scope: 'write', person: 'p_1', level: 'owner' }, session: { host: 'Studio-MacBook-Pro.local', cwd: '/Users/studio/Code/kiln-type', repo: 'kiln-type', agent: 'claude', client_id: 'c-plan' } };
  const attached = await api.attach({ source: 'startup', client_id: 'c-plan', doing: 'Planning context' }, agent);
  assert.ok(attached.ok);
  const got = (await api.context({}, agent)) as { ok: boolean; value: Context };
  assert.ok(got.ok);
  const facts = factsFromContext(got.value, { agent: 'claude', host: 'Studio-MacBook-Pro.local', now: clock.now(), told: [IN4] });
  const plan = planContext(facts);
  const text = planText(plan);
  assert.ok(plan.tokens <= PLAN_BUDGET, text);
  assert.ok(text.startsWith('Told     Mara said in BrainDog (IN4)'), text);
  assert.match(lines(text)[1]!, /^Claude Code on MacBook, working on Kiln$/u);
  assert.ok(plan.sections.some((s) => s.id === 'lane'), text);
  assert.ok(!text.includes('call context for the full picture'), text);
  assert.ok(!text.includes('log it with no spoken'), text);
  sql.close();
});

/* ── the key numbers it keeps (the KPI plan of 21 October, K4-A) ── */

const KPIS = [
  { name: 'Players', every: '1d', last: iso(AT - 2 * DAY), stale: false },
  { name: 'Revenue a month', every: '1m', last: null, stale: false },
  { name: 'Servers', every: '1d', last: iso(AT - 23 * DAY), stale: true },
];

test('NUMBERS: the key numbers it keeps here, stale first, each with when it was last reported, then how to report one', () => {
  const plan = planContext(his({ kpis: KPIS }), { budget: 1_200 });
  assert.deepEqual(plan.sections.map((s) => s.id), ['told', 'may', 'rules', 'here', 'lane', 'kpis', 'decided', 'learned']);
  const text = lines(planText(plan));
  const at = text.findIndex((l) => l.startsWith('Numbers'));
  assert.deepEqual(text.slice(at, at + 4), [
    'Numbers  Servers, daily: reported 23d ago, stale',
    '         Players, daily: reported 2d ago',
    '         Revenue a month, monthly: never reported',
    `         ${KPI_HOW}`,
  ]);
  assert.equal(kpiLine({ name: 'Players', last: iso(AT - 3_600_000), stale: false }, AT), 'Players: reported 1h ago');
});

test('NUMBERS KEEPS TO THE BUDGET: on a record the size of his it is said within 700 tokens, and lower sections give way', () => {
  const plan = planContext(his({ kpis: KPIS }));
  const text = planText(plan);
  assert.ok(plan.tokens <= PLAN_BUDGET, `${String(plan.tokens)} tokens:\n${text}`);
  assert.ok(text.includes('Numbers  Servers, daily: reported 23d ago, stale'), text);
  assert.ok(text.includes(KPI_HOW), text);
  /* MORE THAN FOUR: the more line, then the foot. */
  const many = Array.from({ length: 6 }, (_, i) => ({ name: `Number ${String(i)}`, every: '1w', last: iso(AT - DAY), stale: false }));
  const cut = lines(planText(planContext(his({ kpis: many }), { budget: 1_200 })));
  const at = cut.findIndex((l) => l.startsWith('Numbers'));
  assert.match(cut[at + 4]!, /^ {9}and 2 more: list \{"register":"kpis"/u);
  assert.equal(cut[at + 5], `         ${KPI_HOW}`);
  /* NONE KEPT, NO SECTION. */
  assert.ok(!planContext(his(), { budget: 1_200 }).sections.some((s) => s.id === 'kpis'));
});

test('FROM THE SEED: Claude on Kiln is told the three numbers it keeps there, the stale one first, and Codex none', async () => {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  const api = await createRecordApi({ sql, clock });
  assert.ok((await installSeed(api.kernel)).ok);
  const as = (agent: string, id: string): CallContext => ({
    principal: { kind: 'token', id, scope: 'write', person: 'p_1', level: 'owner' },
    session: { host: 'Studio-MacBook-Pro.local', cwd: '/Users/studio/Code/kiln-type', repo: 'kiln-type', agent, client_id: `c-${agent}` },
  });
  const plan = async (ctx: CallContext): Promise<string> => {
    assert.ok((await api.attach({ source: 'startup', client_id: `c-${String(ctx.session?.agent)}`, doing: 'Numbers' }, ctx)).ok);
    const got = (await api.context({}, ctx)) as { ok: boolean; value: Context & { plan?: string; plan_tokens?: number } };
    assert.ok(got.ok);
    assert.ok((got.value.plan_tokens ?? 0) <= PLAN_BUDGET);
    return got.value.plan ?? '';
  };
  const claude = await plan(as('claude', 'tok_1'));
  /* SPECIMEN DOWNLOADS IS CLAUDE'S SINCE 21 OCTOBER (the sample's stale number with an owner, so its fix can ask), and a
     stale number leads the section. */
  assert.match(claude, /^Numbers {2}Specimen downloads, weekly: reported \d+d ago, stale$/mu);
  assert.match(claude, /^ {9}Studios licensed, weekly: reported 1d ago$/mu);
  assert.match(claude, /^ {9}Revenue a month, monthly: reported \d+d ago$/mu);
  assert.ok(claude.includes(KPI_HOW), claude);
  const codex = await plan(as('codex', 'tok_2'));
  assert.ok(!codex.includes('Numbers  '), codex);
  sql.close();
});

test('A TASK’S VALUES ARE SAID AS A PERSON READS THEM, and every more line is a call an agent sends as it reads it', () => {
  const now = Date.UTC(2026, 9, 30, 12);
  assert.equal(valueWords({ type: 'day' }, '2026-09-09', now), '9 Sep');
  assert.equal(valueWords({ type: 'day' }, '2027-01-13', now), '13 Jan 2027');
  assert.equal(valueWords({ type: 'instant' }, '2026-10-30T19:33:00.000Z', now), '30 Oct 19:33');
  assert.equal(valueWords({ type: 'duration' }, 86_400, now), '1 day');
  assert.equal(durationWords(9_000), '2.5 hours');
  assert.equal(valueWords({ type: 'enum', labels: { backlog: 'Later' } }, 'backlog', now), 'Later');
  assert.equal(valueWords({ type: 'enum' }, 'in_progress', now), 'in progress');
  assert.equal(valueWords({ type: 'bool' }, true, now), 'yes');
  /* NO MORE LINE IS WRITTEN AS JAVASCRIPT. */
  const text = planText(planContext(his({ kpis: Array.from({ length: 9 }, (_, i) => ({ name: `N${String(i)}`, every: '1w', last: null, stale: true })) }), { depth: 'full' }));
  assert.doesNotMatch(text, /\b[a-z_]+\(\{/u, text);
});

test('TODAY IS HIS, NEVER THE AGENT’S NEXT: said as his own line with no step here, left out with a lane, asked once (RK8)', () => {
  let asked = 0;
  const today = (): string => {
    asked += 1;
    return 'Dentist is 3 days late';
  };
  const bare = { told: [], lane: [], owner: 'Mara', who: who({ next: 'Next     Nothing was handed over. Last here: Claude Code, 2h ago.' }), today };
  const plan = planContext(his(bare));
  assert.ok(!/Next .*Dentist/u.test(plan.card), plan.card);
  assert.ok(plan.card.includes("Today    Dentist is 3 days late (Mara's, not a step for you)"), plan.card);
  assert.ok(asked >= 1);
  /* WITH A LANE THE AGENT HAS WORK OF ITS OWN, so his late item is not said at all. */
  asked = 0;
  const laned = planContext(his({ ...bare, lane: [{ name: 'Fix the importer', spoken: 'tasks#7', mine: false }] }));
  assert.ok(!laned.card.includes('Dentist'), laned.card);
  assert.equal(asked, 0, 'Today is not even read');
});
