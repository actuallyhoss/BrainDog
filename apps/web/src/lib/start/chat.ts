/**
 * THE FIRST RUN AS A CONVERSATION (1 Nov, the owner: "i need the who are you to be a conversation with questions. not
 * just a field"). BrainDog says hello and asks "What do you do?", then asks the follow-ups that matter for building this
 * person's BrainDog, one at a time, chosen from what they said: what they work on, the money side, which currency, who
 * they work with, which AI tools they use, and what to keep track of first. A topic the answers already settled is
 * skipped. Usually three to five questions; never more than `ASKS_MOST`; every one skippable; "That's enough" ends it.
 *
 * EVERY ANSWER IS ONE MORE SENTENCE OF WHAT WAS SAID (`saidOf`), joined to the rest (`joinTurns`), so the reading, the
 * build beside the conversation and the one press that makes it (`accept.ts`, sign-up's `accepting`) stay what they
 * were: a sentence read into a proposal. A currency or a use case answered is a value laid on instead (`valueOf`).
 *
 * THE NEXT QUESTION IS THE MODEL'S where its reading of the conversation carried one (`Proposal.ask`, read with
 * `askedLines`), held to a topic not yet asked; else the rules', in `ORDER`. One model read per answer, `READS_MOST` in
 * a conversation, and the rules answer once those are spent, where there is no model, or where it was slow.
 *
 * A plain `.ts` with relative imports, so it can be held by `node`; `Chat.svelte` draws what it answers.
 */

import { USE_CASES } from '@braindog/seed/usecases';

import { currencyChoices, type CurrencyEnv } from '../../routes/start/building.ts';
import { closeOver } from '../shape.ts';
import { PEOPLE } from '../who.ts';
import type { ModelAsk } from '../signup.ts';
import { placesOf, YOU, type HeardLine, type Proposal } from './propose.ts';

/** What a question is about: the first question (`what`), the rules' own, and every topic the model may ask about. */
export type Topic = 'what' | 'closest' | 'work' | 'money' | 'currency' | 'people' | 'tools' | 'name' | 'first' | 'kind' | 'things' | 'who_for';

/** One answer to tap: what it fills, and what it says on the button. */
export type Choice = { value: string; label: string };

export type ChatAsk = {
  topic: Topic;
  question: string;
  /** Two to four answers to tap; none for a name, which is typed. */
  choices: Choice[];
  /** Several may be chosen (tools, what to keep first): a tap adds to the answer being typed instead of sending it. */
  many?: boolean;
  /** The one suggested, by value, where a fact points at one (the currency this device keeps). */
  suggested?: string | null;
  by: 'rules' | 'model';
};

/** One question asked and how it was answered: its words, `null` for skipped, and BrainDog's line back. */
export type ChatTurn = { ask: ChatAsk; answer: string | null; at: number; ack: string | null };

/** The most questions in a conversation, the first included (the brief: "never more than 6"). */
export const ASKS_MOST = 6;
/** The most model reads in one conversation (the brief: "cap total calls per sign-up"). */
export const READS_MOST = 6;
/** How long an answer waits on the model before the rules answer it: the person is watching the dots. */
export const QUICK_MS = 3_500;
/** The least the dots show for, so a reading by the rules on this device does not flash. */
export const TYPING_MS = 520;

/** The words the conversation says. */
export const chatWords = {
  title: "Let's make your BrainDog",
  tellMore: 'What else should it know?',
  hello: "Hi, I'm BrainDog. I'll ask a few quick questions and build yours as we talk.",
  what: 'What do you do?',
  whatChoices: ['I freelance', 'I run a small business', "I'm a student", "We're a startup"],
  placeholder: 'Type your answer',
  placeholderFirst: 'A sentence or two is plenty',
  send: 'Send',
  skip: 'Skip',
  enough: "That's enough, build it",
  typing: 'BrainDog is reading what you said',
  you: 'You',
  dog: 'BrainDog',
  skipped: 'Skipped',
  /** BrainDog's line back to an answer: what it added, or a plain thanks. */
  adds: (items: readonly string[]) => `That adds ${and(items)}.`,
  thanks: ['Got it.', 'Thanks.', 'Noted.', 'Good to know.'] as const,
  currencyIs: (name: string) => `Money will be kept in ${name}.`,
  caseIs: (title: string) => `I'll set it up as ${title}.`,
  callYou: (name: string) => `Nice to meet you, ${name}.`,
  /** The end, before the summary. */
  done: "That's enough to start. Here is what I'll make. Take out anything you don't want.",
  doneShort: 'Here is what I will make. Take out anything you do not want.',
  /** Said after the person typed nothing to send. */
  empty: 'Type an answer, tap one, or skip.',
  /** For a screen reader: how many questions are left at most. */
  more: 'Skip this question',
} as const;

const and = (items: readonly string[]): string => (items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

const tap = (label: string, value = label): Choice => ({ value, label });

/** The first question, with the four ways people most often start. */
export function firstAsk(): ChatAsk {
  return { topic: 'what', question: chatWords.what, choices: chatWords.whatChoices.map((c) => tap(c)), by: 'rules' };
}

/* ── what the words already say ─────────────────────────────────────────── */

/** What kind of person the words say, for the rules' wording and their taps. */
export type Kind = 'freelance' | 'founder' | 'student' | 'shop' | 'team' | 'business' | 'personal' | null;

export function kindOf(said: string, usecase: string | null): Kind {
  const s = said.toLowerCase();
  if (/\b(freelanc\w*|consult\w*|contractor|self-employed|my clients|a client)\b/u.test(s)) return 'freelance';
  if (usecase === 'founder' || /\b(start-?up|saas|founder|co-?founder|our product|my product|an app|our app)\b/u.test(s)) return 'founder';
  if (usecase === 'student' || /\b(student|studying|study|university|uni|college|school|degree|thesis|course(work|s)?)\b/u.test(s)) return 'student';
  if (usecase === 'shop' || /\b(shop|store|etsy|orders|sell)\b/u.test(s)) return 'shop';
  if (usecase === 'team' || /\b(our team|my team|the team)\b/u.test(s)) return 'team';
  if (usecase === 'business' || /\b(business|agency|studio|company)\b/u.test(s)) return 'business';
  if (usecase === 'personal') return 'personal';
  return null;
}

const MONEY_WORDS = /\b(paid|pay|pays|payment|invoice\w*|bill\w*|revenue|income|salary|wage\w*|rent|budget\w*|expense\w*|costs?|subscription\w*|money|price\w*|charge\w*|mrr|arr|sales|retainer|fees?|loan|grant)\b|[£$€¥₹₦]/iu;
const PEOPLE_WORDS = /\b(alone|solo|by myself|just me|on my own|clients?|customers?|partner\w*|co-?founder\w*|team\w*|colleague\w*|classmates?|supervisor|cofounder|we|our|us|employees?|staff|contractors?)\b/iu;
const TOOL_WORDS = /\b(claude|chatgpt|gpt|cursor|codex|copilot|gemini|windsurf|perplexity|ai tools?|no ai|none yet)\b/iu;
/* A thing they work on, said by name: "clients Fenwick and Acme", "an app called Tidepool", "for Fenwick". */
const NAMED_WORK = /\b(?:clients?|customers?|projects?|products?|apps?|called|named|for|with|on|building)\b[^.?!\n]{0,40}?\b\p{Lu}[\p{L}\p{N}'’-]+/u;

/** The ISO codes a sentence names outright ("USD", "in EUR"). */
function codesIn(said: string): string[] {
  return [...new Set((said.match(/\b[A-Z]{3}\b/gu) ?? []).filter((c) => knownCode(c)))];
}

/** A currency's name as this runtime says it in English ("US Dollar"), or its code. */
function displayName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'currency' }).of(code) ?? code;
  } catch {
    return code;
  }
}

function knownCode(code: string): boolean {
  const list = (Intl as { supportedValuesOf?: (key: 'currency') => string[] }).supportedValuesOf;
  return /^[A-Z]{3}$/u.test(code) && (typeof list !== 'function' || list('currency').includes(code));
}

/**
 * THE CURRENCY THE WORDS NAME, where they name exactly one: a code ("USD") or a word the device's facts settle
 * ("dollars" on a device in New York). `null` where they name none or several.
 */
export function namedCurrency(said: string, env: CurrencyEnv | null): string | null {
  const codes = codesIn(said);
  if (codes.length === 1) return codes[0] ?? null;
  if (codes.length > 1 || env === null) return null;
  const c = currencyChoices(said, env);
  return c.said.length > 0 && c.suggested !== null && c.find === null ? c.suggested : null;
}

/* THE EVERYDAY WORDS FOR THE CURRENCIES PEOPLE NAME MOST, and the codes each may mean: "pounds" is sterling, or the
   Egyptian pound on a device in Cairo (`currencyChoices` weighs that), so each word offers all it may be. */
const SAID_AS: Readonly<Record<string, readonly string[]>> = {
  dollar: ['USD'],
  buck: ['USD'],
  pound: ['GBP', 'EGP'],
  quid: ['GBP'],
  sterling: ['GBP'],
  euro: ['EUR'],
  dirham: ['AED', 'MAD'],
  riyal: ['SAR', 'QAR'],
  rupee: ['INR', 'PKR'],
  yen: ['JPY'],
  naira: ['NGN'],
  franc: ['CHF'],
};

/** The currency words a sentence says, each with the codes it may be. */
function wordsSaid(said: string): { word: string; codes: readonly string[] }[] {
  const out: { word: string; codes: readonly string[] }[] = [];
  for (const t of said.toLowerCase().match(/\p{L}+/gu) ?? []) {
    const base = SAID_AS[t] ? t : t.endsWith('s') && SAID_AS[t.slice(0, -1)] ? t.slice(0, -1) : null;
    if (base !== null && !out.some((x) => x.word === base)) out.push({ word: base, codes: SAID_AS[base] ?? [] });
  }
  return out;
}

/**
 * WHETHER THE WORDS LEAVE THE CURRENCY OPEN (1 Nov, a live sign-up said "dollars and pounds" and was given Egyptian
 * pounds unasked): two currencies named, as codes or words, or one word that is several ("pounds" with no device to
 * settle it). Then the conversation asks, offering each.
 */
export function currencyUnclear(said: string, env: CurrencyEnv | null): boolean {
  const codes = codesIn(said);
  const named = wordsSaid(said).filter((w) => !w.codes.some((c) => codes.includes(c)));
  return codes.length + named.length >= 2 || (codes.length === 0 && named.length === 1 && namedCurrency(said, env) === null);
}

/** The codes the words point at, in the order said, and the device's beside them: what the currency question offers. */
function codesOffered(said: string, env: CurrencyEnv | null): string[] {
  const device = env?.zone ? currencyChoices('', env, 1).suggested : null;
  const out = [...codesIn(said)];
  for (const w of wordsSaid(said)) {
    /* A WORD THAT IS SEVERAL IS THE DEVICE'S WHERE THE DEVICE KEEPS ONE OF THEM, else the first. */
    const pick = w.codes.length > 1 && device !== null && w.codes.includes(device) ? [device, ...w.codes.filter((c) => c !== device)] : w.codes;
    for (const c of pick.slice(0, w.codes.length > 1 ? 2 : 1)) if (!out.includes(c)) out.push(c);
  }
  return out.filter((c) => knownCode(c));
}

/** Whether the build keeps money: a part that keeps a currency is on. */
export type Money = { kept: boolean; currency: string | null; guessed: boolean };

/* ── the next question ──────────────────────────────────────────────────── */

/** What the next question is chosen from: the conversation so far and the reading of it. */
export type Where = {
  /** Every answer so far, joined as one sentence. */
  said: string;
  turns: readonly ChatTurn[];
  proposal: Proposal | null;
  /** The use case as it stands (chosen by hand, or read). */
  usecase: string | null;
  /** Whether anything is placed at all: a use case, a draft, or a part on. */
  placed: boolean;
  money: Money;
  /** The person's name, heard or answered. */
  name: string | null;
  /** The device's currencies, for the currency's taps. */
  env: CurrencyEnv | null;
  /** The names of the places the build will make, for "what first". */
  places: readonly string[];
  /** The model's question from the latest reading, where it carried one. */
  model?: ModelAsk | null;
};

/** The order the rules ask in, after "What do you do?". */
export const ORDER: readonly Topic[] = ['closest', 'work', 'money', 'currency', 'people', 'tools', 'name', 'first'];

const QUESTION_MOST = 120;
const CHOICE_MOST = 24;
const fits = (s: string, most: number): boolean => s !== '' && !/[\r\n]/u.test(s) && [...s].length <= most;

/** The topics asked so far. */
const askedOf = (turns: readonly ChatTurn[]): Set<Topic> => new Set(turns.map((t) => t.ask.topic));

/** Whether a topic is already settled by what was said or answered, so asking it would be asking twice. */
export function settled(topic: Topic, w: Where): boolean {
  const s = w.said;
  switch (topic) {
    case 'closest':
      return w.placed;
    case 'work':
      return NAMED_WORK.test(s.replace(w.name ?? '\u0000', '')) || (w.proposal?.rows.length ?? 0) >= 2;
    case 'money':
      return MONEY_WORDS.test(s);
    case 'currency':
      return !w.money.kept || (w.money.currency !== null && !w.money.guessed);
    case 'people':
      return PEOPLE_WORDS.test(s);
    case 'tools':
      return TOOL_WORDS.test(s);
    case 'name':
      return w.name !== null && w.name.trim() !== '';
    case 'first':
      return w.places.length === 0;
    default:
      return false;
  }
}

/** The rules' question for a topic, in words that fit what kind of person they are. */
export function rulesAsk(topic: Topic, w: Where): ChatAsk | null {
  const kind = kindOf(w.said, w.usecase);
  const ask = (question: string, choices: string[], extra: Partial<ChatAsk> = {}): ChatAsk => ({ topic, question, choices: choices.map((c) => tap(c)), by: 'rules', ...extra });
  switch (topic) {
    case 'closest':
      return {
        topic,
        question: 'Which of these is closest to you?',
        choices: ['business', 'founder', 'student', 'personal'].flatMap((id) => {
          const u = USE_CASES.find((x) => x.usecase === id);
          return u ? [tap(u.title, u.usecase)] : [];
        }),
        by: 'rules',
      };
    case 'work':
      if (kind === 'freelance') return ask('Which clients or projects are you working on right now?', ['Two or three clients', 'One big client', 'My own projects']);
      if (kind === 'founder') return ask('What are you building, and what is on this month?', ['Our first launch', 'Finding customers', 'Raising money', 'Hiring']);
      if (kind === 'student') return ask('Which courses or side projects are you on right now?', ['My courses', 'A side project', 'A thesis', 'Job hunting']);
      if (kind === 'shop') return ask('What do you sell?', ['Things I make', 'Products I stock', 'Digital things']);
      return ask('What are you working on right now?', ['A few projects', 'One big project', 'Day-to-day running']);
    case 'money':
      if (kind === 'freelance') return ask('How do you get paid, and what goes out each month?', ['Invoices to clients', 'A monthly retainer', 'Bills and subscriptions', 'Not now']);
      if (kind === 'founder') return ask('Is money coming in yet, and what goes out?', ['Customer subscriptions', 'Not yet', 'Investor money', 'Hosting and tools']);
      if (kind === 'student') return ask('Any money to keep an eye on?', ['Rent and bills', 'A part-time job', 'A loan or grant', 'Not really']);
      if (kind === 'shop') return ask('What money comes in and goes out?', ['Sales', 'Supplier bills', 'Shipping costs', 'Not now']);
      return ask('What money comes in and goes out?', ['Invoices I send', 'Bills I pay', 'Subscriptions', 'Not now']);
    case 'currency': {
      const c = w.env ? currencyChoices(w.said, w.env, 3) : null;
      const nameOf = (code: string): string => c?.choices.find((x) => x.code === code)?.name ?? displayName(code);
      /* WHAT THEIR WORDS NAMED FIRST, every one of them, then what this device points at. */
      const said = codesOffered(w.said, w.env);
      const codes = [...new Set([...said, ...(c?.choices ?? []).map((x) => x.code)])];
      const choices = codes.map((code) => tap(fits(nameOf(code), CHOICE_MOST) ? nameOf(code) : code, code));
      const unclear = currencyUnclear(w.said, w.env);
      const guess = unclear ? null : (w.money.currency ?? c?.suggested ?? null);
      const guessName = choices.find((x) => x.value === guess)?.label ?? guess;
      /* THE ONE THIS DEVICE KEEPS FIRST, asked as a yes, and the others beside it. */
      const ordered = guess === null ? choices : [...choices.filter((x) => x.value === guess), ...choices.filter((x) => x.value !== guess)];
      if (guess !== null && !ordered.some((x) => x.value === guess)) ordered.unshift(tap(guessName ?? guess, guess));
      return {
        topic,
        question: unclear && said.length > 1 ? 'You mentioned more than one currency. Which is your main one?' : guessName ? `I'll keep money in ${guessName}. Is that right?` : 'Which currency is your money in?',
        choices: ordered.slice(0, 4),
        suggested: guess,
        by: 'rules',
      };
    }
    case 'people':
      if (kind === 'freelance') return ask('Who do you work with, besides clients?', ['Just me', 'Other freelancers', 'An accountant', 'An agency']);
      if (kind === 'founder') return ask('Who are you building it with?', ['My co-founder', 'A small team', 'Contractors', 'Just me']);
      if (kind === 'student') return ask('Who do you work with?', ['Just me', 'Classmates', 'A supervisor', 'A study group']);
      return ask('Who do you work with?', ['Just me', 'A partner', 'A small team', 'Clients']);
    case 'tools':
      return ask('Do you use AI tools? I can work with them.', ['Claude', 'ChatGPT', 'Cursor', 'None yet'], { many: true });
    case 'name':
      return { topic, question: 'And what should I call you?', choices: [], by: 'rules' };
    case 'first': {
      const choices = w.places.filter((p) => fits(p, CHOICE_MOST)).slice(0, 4);
      return choices.length < 2 ? null : ask('What should I keep track of first?', choices, { many: true });
    }
    default:
      return null;
  }
}

/** The model's question, held to what the screen can say and to a topic not yet asked, or `null`. */
function modelAsk(m: ModelAsk | null | undefined, w: Where, asked: Set<Topic>): ChatAsk | null {
  if (!m) return null;
  const topic = m.about as Topic;
  if (asked.has(topic) || settled(topic, w)) return null;
  const question = m.question.trim();
  if (!fits(question, QUESTION_MOST)) return null;
  /* A CURRENCY IS A CODE THIS DEVICE KNOWS: the model's words, the rules' taps. */
  if (topic === 'currency') {
    const r = rulesAsk('currency', w);
    return r === null ? null : { ...r, question, by: 'model' };
  }
  const choices: Choice[] = [];
  for (const c of m.choices) if (fits(c.trim(), CHOICE_MOST) && !choices.some((x) => x.value === c.trim())) choices.push(tap(c.trim()));
  return { topic, question, choices: choices.slice(0, 4), many: topic === 'tools' || topic === 'first', by: 'model' };
}

/**
 * THE NEXT QUESTION, or `null` when the conversation has enough. Never more than `ASKS_MOST`, never a topic asked or
 * settled; "which is closest" before anything else when nothing could be placed; then the model's question where it
 * asked one; then the rules', in `ORDER`.
 */
export function nextAsk(w: Where): ChatAsk | null {
  if (w.turns.length >= ASKS_MOST) return null;
  const asked = askedOf(w.turns);
  const open = ORDER.filter((t) => !asked.has(t) && !settled(t, w));
  /* THE LAST QUESTION LEFT IS "WHAT FIRST", so the conversation ends on what it will keep. */
  const room = ASKS_MOST - w.turns.length;
  if (open.includes('closest')) return rulesAsk('closest', w);
  const m = modelAsk(w.model, w, asked);
  if (m !== null && (room > 1 || m.topic === 'first')) return m;
  for (const t of open) {
    if (room === 1 && t !== 'first' && open.includes('first')) continue;
    const r = rulesAsk(t, w);
    if (r !== null) return r;
  }
  return null;
}

/* ── an answer, as words ────────────────────────────────────────────────── */

/**
 * THE PART AN ANSWER TURNS ON WHEREVER THE READING DID NOT: a money answer that is not a no keeps Money, who they work
 * with keeps People, the AI tools keep Agents. The question was about that part, so the answer is its reason.
 */
export const TURNS_ON: Partial<Record<Topic, string>> = { money: 'money-core', people: 'people', tools: 'agents' };

/** The answer is a no ("Not now", "None yet", "Just me" to money): it adds nothing to build from. */
const NO = /^(?:no|nope|none|none yet|not now|not yet|not really|nothing|n\/a|-)\.?$/iu;

const plain = (s: string): string => s.replace(/\s+/gu, ' ').trim().replace(/[.!,;:]+$/u, '');
const sentence = (s: string): string => {
  const p = plain(s);
  return p === '' ? '' : `${p.charAt(0).toUpperCase()}${p.slice(1)}.`;
};
/** Whether an answer reads as a sentence of its own, which is kept as typed. */
const whole = (s: string): boolean => plain(s).split(' ').length >= 5 || /^(?:i|i'm|i’m|we|we're|my|our|it|they)\b/iu.test(plain(s));

/**
 * WHAT AN ANSWER ADDS TO WHAT WAS SAID, as a sentence of its own, or `''` for nothing. Typed at length, it is kept as
 * typed; a short tap is put in a sentence that says what it answers, so the reading knows ("I use Claude and Cursor.").
 * A currency, a use case and a name are values laid on (`valueOf`), and add no words.
 */
export function saidOf(ask: ChatAsk, answer: string): string {
  const a = plain(answer);
  if (a === '' || NO.test(a)) return '';
  if (ask.topic === 'currency' || ask.topic === 'closest' || ask.topic === 'name') return '';
  if (ask.topic === 'what' || whole(a)) return sentence(a);
  const low = a.charAt(0).toLowerCase() + a.slice(1);
  switch (ask.topic) {
    case 'work':
      return `I'm working on ${low}.`;
    case 'money':
      return sentence(a);
    case 'people':
      return /^just me$/iu.test(a) ? 'I work on my own.' : `I work with ${low}.`;
    case 'tools':
      return `I use ${a}.`;
    case 'first':
      return `First I want to keep track of ${low}.`;
    default:
      return sentence(a);
  }
}

/**
 * WHAT AN ANSWER LAYS ON THE READING: a currency's code, a use case's id, or a name, or `null` for nothing. A tap or a
 * typed word naming a choice is that choice's value; a currency is a code this runtime knows or nothing.
 */
export function valueOf(ask: ChatAsk, answer: string): string | null {
  const a = plain(answer);
  if (a === '') return null;
  const low = a.toLocaleLowerCase();
  const c = ask.choices.find((x) => x.value.toLocaleLowerCase() === low || x.label.toLocaleLowerCase() === low);
  if (ask.topic === 'currency') {
    if (/^(?:yes|yep|yeah|right|correct|that's right|ok|okay)\b/iu.test(a)) return ask.suggested ?? null;
    const code = (c?.value ?? (codesIn(a.toUpperCase())[0] ?? a)).toUpperCase();
    return knownCode(code) ? code : null;
  }
  if (ask.topic === 'closest') return c?.value ?? USE_CASES.find((u) => u.title.toLocaleLowerCase() === low)?.usecase ?? null;
  if (ask.topic === 'name') return fits(a, 60) ? a.replace(/^(?:call me|i'm|i am|it's|its)\s+/iu, '') : null;
  return null;
}

/* ── the model's view of the conversation ──────────────────────────────── */

/** The model's word for a topic: "What do you do?" is about what kind of person they are. */
const aboutOf = (t: Topic): string => (t === 'what' ? 'kind' : t === 'closest' ? 'kind' : t);

/**
 * WHAT WAS ASKED, AS THE MODEL READS IT (`asked` at the reading door): one line a question, `about: question`. A
 * question whose answer added no words to what was said is marked, so the answers below line up with the rest.
 */
export function askedLines(turns: readonly ChatTurn[], next: ChatAsk | null = null): string {
  const lines = turns.map((t) => {
    const added = t.answer !== null && saidOf(t.ask, t.answer) !== '';
    const mark = t.answer === null ? ' [skipped]' : added ? '' : ` [answered: ${plain(t.answer).slice(0, 40)}]`;
    return `${aboutOf(t.ask.topic)}: ${t.ask.question}${mark}`;
  });
  if (next !== null) lines.push(`${aboutOf(next.topic)}: ${next.question}`);
  return lines.join('\n');
}

/* ── BrainDog's line back ───────────────────────────────────────────────── */

/**
 * WHAT BRAINDOG SAYS TO AN ANSWER before it asks the next: the places it added ("That adds Money and Clients."), the
 * currency or use case or name laid on, or a plain thanks. One short line.
 */
export function ackOf(ask: ChatAsk, answer: string | null, before: readonly string[], after: readonly string[], i: number, laid: { currency?: string | null; usecase?: string | null; name?: string | null } = {}): string | null {
  if (answer === null) return null;
  if (laid.currency) return chatWords.currencyIs(laid.currency);
  if (laid.usecase) return chatWords.caseIs(laid.usecase);
  if (laid.name) return chatWords.callYou(laid.name);
  const came = after.filter((p) => !before.includes(p));
  if (came.length > 0) return chatWords.adds(came);
  return chatWords.thanks[i % chatWords.thanks.length] ?? 'Got it.';
}

/* ── a name answered ───────────────────────────────────────────────────── */

/**
 * THE READING WITH A NAME ANSWERED LAID ON: the person, the first entry in People, as the one question once laid it
 * (`question.ts` `answer`). The name stands over a name heard, since it was asked for.
 */
export function withName(p: Proposal, name: string | null): Proposal {
  const v = name?.trim() ?? '';
  if (v === '' || v.length > 60) return p;
  const you: HeardLine = { phrase: v, became: YOU, you: true };
  const out = { ...p, name: v, modules: closeOver([...p.modules, PEOPLE]), heard: [you, ...p.heard.filter((h) => h.you !== true)] };
  return { ...out, title: p.title ?? `${v.split(' ')[0]}'s BrainDog`, places: placesOf(out) };
}

/* ── the part of what was said a thing came from ──────────────────────── */

/**
 * THE CLAUSE A PHRASE SITS IN, for "from" under a part ("from: a freelance designer in Cairo"): the words around the
 * phrase up to the nearest stop or comma, at most `most` characters, cut at a word.
 */
export function clauseOf(said: string, phrase: string, most = 48): string {
  const i = said.toLocaleLowerCase().indexOf(phrase.toLocaleLowerCase());
  if (i < 0) return phrase;
  const stops = /[.!?;,\n]/u;
  let a = i;
  while (a > 0 && !stops.test(said.charAt(a - 1))) a -= 1;
  let b = i + phrase.length;
  while (b < said.length && !stops.test(said.charAt(b))) b += 1;
  const clause = said.slice(a, b).trim().replace(/^(?:and|but|so)\s+/iu, '');
  if (clause.length <= most) return clause;
  /* A LONG CLAUSE IS SAID AROUND THE PHRASE, a few whole words either side, with "…" where it was cut. */
  const before = said.slice(a, i).trim().split(/\s+/u).filter((x) => x !== '');
  const after = said.slice(i + phrase.length, b).trim().split(/\s+/u).filter((x) => x !== '');
  let l = Math.min(3, before.length);
  let r = Math.min(4, after.length);
  const text = (): string => [...before.slice(before.length - l), said.slice(i, i + phrase.length), ...after.slice(0, r)].join(' ');
  while (text().length > most && (l > 0 || r > 0)) if (r >= l && r > 0) r -= 1; else l -= 1;
  return `${l < before.length ? '…' : ''}${text()}${r < after.length ? '…' : ''}`;
}

/* ── waiting on the model, but not for long ───────────────────────────── */

/** `p`, or `null` once `ms` have passed: the caller goes on with the rules and lets `p` land when it does. */
export function within<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((done) => setTimeout(() => done(null), ms))]);
}

/** At least `ms` from `since`, so the dots never flash. */
export function atLeast(since: number, ms = TYPING_MS): Promise<void> {
  const left = since + ms - Date.now();
  return left <= 0 ? Promise.resolve() : new Promise((done) => setTimeout(done, left));
}
