/**
 * THE FIRST RUN AS A CONVERSATION (1 Nov, the owner: "i need the who are you to be a conversation with questions. not
 * just a field"). BrainDog says hello and asks "What do you do?", then asks the follow-ups that matter for building this
 * person's BrainDog, one at a time, chosen from what they said: what they work on, the money side, which currency, who
 * they work with, their name, which AI tools they use, and what to keep track of first. A topic the answers already settled is
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
  /** Who a people question asks the name of ("co-founder"), so a bare name answered is said as theirs (`saidOf`). */
  role?: string;
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
  /** Asked once more where an answer to the name question held no name BrainDog could be sure of (`nameIn`). */
  nameAgain: "I didn't catch a name there. What's your first name?",
  /** The business use case as a freelancer hears it (`caseTitle`). */
  freelance: 'Freelance',
  /** The founder use case as founders who are more than one hear it (`caseTitle`). */
  startup: 'Startup',
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
  /* "Freelancers" are people they hire (2 Nov, an agency that pays freelancers was told "That adds Freelance"). */
  if (/\b(freelanc(?:e|er|ing)|consult\w*|contractor|self-employed|independent|my clients|a client|\d+ clients|clients in)\b/u.test(s)) return 'freelance';
  if (usecase === 'founder' || /\b(start-?up|saas|founder|co-?founder|our product|my product|an app|our app)\b/u.test(s)) return 'founder';
  if (usecase === 'student' || /\b(student|studying|study|university|uni|college|school|degree|thesis|course(work|s)?)\b/u.test(s)) return 'student';
  if (usecase === 'shop' || /\b(shop|store|etsy|orders|sell)\b/u.test(s)) return 'shop';
  if (usecase === 'team' || /\b(our team|my team|the team)\b/u.test(s)) return 'team';
  if (usecase === 'business' || /\b(business|agency|studio|company)\b/u.test(s)) return 'business';
  if (usecase === 'personal' || /\b(household|our home|family budget|my partner|my salary|personal (?:money|finances?))\b/u.test(s)) return 'personal';
  return null;
}

const MONEY_WORDS = /\b(paid|pay|pays|payment|invoice\w*|bill\w*|revenue|income|salary|wage\w*|rent|budget\w*|expense\w*|costs?|subscription\w*|money|price\w*|charge\w*|mrr|arr|sales|retainer|fees?|loan|grant)\b|[£$€¥₹₦]/iu;
const PEOPLE_WORDS = /\b(alone|solo|by myself|just me|on my own|clients?|customers?|partner\w*|co-?founder\w*|team\w*|colleague\w*|classmates?|supervisor|cofounder|we|our|us|employees?|staff|contractors?)\b/iu;
/**
 * THE ONE OTHER PERSON THEY SAID THEY WORK WITH AND DID NOT NAME (2 Nov, a walk: "We're a two-person startup" settled
 * People, so Leo was never asked who he builds with and his co-founder was never drafted). The role as it is said back
 * ("co-founder", "business partner", "partner"), or `null` where nobody is meant or the one meant is named already.
 */
const PAIR_SAID = /\b(two-person|two person|two of us|co-?founders?|cofounders?|business partner|my partner|our partner)\b/iu;
const PAIR_NAMED = /\b(?:co-?founders?|cofounders?|partner)(?:\s+is|,)?\s+\p{Lu}\p{Ll}+/u;
export function pairOf(said: string): string | null {
  const m = PAIR_SAID.exec(said);
  if (m === null || PAIR_NAMED.test(said)) return null;
  const w = m[1]!.toLowerCase();
  return /partner/u.test(w) ? (w.startsWith('business') ? 'business partner' : 'partner') : 'co-founder';
}
/** A bare name typed as an answer: "Dan", "dan", "Dan Reyes". */
const BARE_NAME = /^\p{L}[\p{L}'’-]*(?:\s\p{L}[\p{L}'’-]*)?$/u;
const capital = (n: string): string => n.split(' ').map((x) => x.charAt(0).toUpperCase() + x.slice(1)).join(' ');
const TOOL_WORDS = /\b(claude|chatgpt|gpt|cursor|codex|copilot|gemini|windsurf|perplexity|ai tools?|no ai|none yet)\b/iu;
/* A thing they work on, said by name: "clients Fenwick and Acme", "an app called Tidepool", "for Fenwick". */
/* A NAME HAS A SMALL LETTER AFTER ITS CAPITAL, so a currency code ("clients pay me in USD") is never taken for one. */
/* A PLACE IS NO NAME OF THEIR WORK: "3 clients in the Gulf" names where the clients are, not who (1 Nov, the rules took
   it for named clients and never asked which). */
const NAMED_WORK = /\b(?:clients?|customers?|projects?|products?|apps?|called|named|for|with|on|building)\b[^.?!\n]{0,40}?\b(?<!\b(?:in|at|from|across|around|near|based in)\s+(?:the\s+)?)\p{Lu}\p{Ll}[\p{L}\p{N}'’-]*/u;

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

/**
 * THE CURRENCY AN ANSWER NAMES IN WORDS (2 Nov, a walk: "US Dollar" and "Euro" typed to "I'll keep money in British
 * Pound. Is that right?" were thanked and dropped, and the record was made in pounds): its English name ("US Dollar",
 * "euros"), else an everyday word ("dollars", "quid"), the one of its codes the question offered first. `null` for none.
 */
export function codeNamed(answer: string, offered: readonly string[] = []): string | null {
  const a = answer.trim().toLocaleLowerCase().replace(/[.!]+$/u, '');
  if (a === '') return null;
  const list = (Intl as { supportedValuesOf?: (key: 'currency') => string[] }).supportedValuesOf;
  const all = typeof list === 'function' ? list('currency') : [];
  const bare = (x: string): string => x.toLocaleLowerCase().replace(/s$/u, '');
  for (const code of all) {
    const n = displayName(code).toLocaleLowerCase();
    if (n !== code.toLocaleLowerCase() && (bare(n) === bare(a) || bare(a).endsWith(` ${bare(n)}`))) return code;
  }
  const words = wordsSaid(a);
  if (words.length !== 1) return null;
  const codes = words[0]!.codes;
  return codes.find((c) => offered.includes(c)) ?? codes[0] ?? null;
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

/** The currencies offered after the ones the words and the device point at. */
const COMMON = ['USD', 'EUR', 'GBP'] as const;

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

/**
 * The order the rules ask in, after "What do you do?". THE NAME BEFORE THE TOOLS (2 Nov, a walk: an agency owner's six
 * questions ran out on the tools and he was never asked his name, so his BrainDog took the email's). The tools are learned
 * later; a name is how every screen after this one speaks to them.
 */
export const ORDER: readonly Topic[] = ['closest', 'work', 'money', 'currency', 'people', 'name', 'tools', 'first'];

/** The questions the last turns are kept for, in this order: who they are, then what to keep first. */
const KEPT_FOR_LAST: readonly Topic[] = ['name', 'first'];

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
      /* "WE'RE TWO" NAMES NOBODY: the other one is asked by name, so they can be drafted (`pairOf`). */
      return PEOPLE_WORDS.test(s) && pairOf(s) === null;
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

/** What each kind of person is offered to keep first: words the first to-dos are drawn from (`todosOf`). */
const FIRST_TAPS: Readonly<Record<string, readonly string[]>> = {
  freelance: ['Invoices', 'Clients', 'Deadlines', 'Projects'],
  business: ['Clients', 'Invoices', 'Projects', 'Deadlines'],
  founder: ['The launch', 'Customers', 'Spending', 'Tasks'],
  personal: ['Bills', 'Savings', 'Subscriptions', 'Rent'],
  student: ['Deadlines', 'Courses', 'Money', 'Projects'],
  shop: ['Orders', 'Stock', 'Sales', 'Suppliers'],
};

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
      /* NOT "WHAT ARE YOU WORKING ON" TO SOMEBODY SORTING OUT HOME MONEY (2 Nov, a walk: a household was offered "Day-to-day
         running"). */
      if (kind === 'personal') return ask('What are you saving for or sorting out right now?', ['Saving for a holiday', 'Paying off a card', 'Moving home', 'Sorting out bills']);
      return ask('What are you working on right now?', ['A few projects', 'One big project', 'Day-to-day running']);
    case 'money':
      if (kind === 'freelance') return ask('How do you get paid, and what goes out each month?', ['Invoices to clients', 'A monthly retainer', 'Bills and subscriptions', 'Not now']);
      if (kind === 'founder') return ask('Is money coming in yet, and what goes out?', ['Customer subscriptions', 'Not yet', 'Investor money', 'Hosting and tools']);
      if (kind === 'student') return ask('Any money to keep an eye on?', ['Rent and bills', 'A part-time job', 'A loan or grant', 'Not really']);
      if (kind === 'shop') return ask('What money comes in and goes out?', ['Sales', 'Supplier bills', 'Shipping costs', 'Not now']);
      if (kind === 'personal') return ask('What comes in and goes out each month?', ['My salary', 'Rent or mortgage', 'Bills and subscriptions', 'Not now']);
      return ask('What money comes in and goes out?', ['Invoices I send', 'Bills I pay', 'Subscriptions', 'Not now']);
    case 'currency': {
      const c = w.env ? currencyChoices(w.said, w.env, 3) : null;
      const nameOf = (code: string): string => c?.choices.find((x) => x.code === code)?.name ?? displayName(code);
      /* WHAT THEIR WORDS NAMED FIRST, every one of them, then what this device points at. */
      const said = codesOffered(w.said, w.env);
      /* AND THE THREE MOST PEOPLE KEEP, so a person whose money is not the device's taps theirs instead of typing it. */
      const codes = [...new Set([...said, ...(c?.choices ?? []).map((x) => x.code), ...COMMON])];
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
    case 'people': {
      const pair = pairOf(w.said);
      if (pair !== null) return { topic, question: `What's your ${pair}'s name?`, choices: [], role: pair, by: 'rules' };
      if (kind === 'freelance') return ask('Who do you work with, besides clients?', ['Just me', 'Other freelancers', 'An accountant', 'An agency']);
      if (kind === 'founder') return ask('Who are you building it with?', ['My co-founder', 'A small team', 'Contractors', 'Just me']);
      if (kind === 'student') return ask('Who do you work with?', ['Just me', 'Classmates', 'A supervisor', 'A study group']);
      if (kind === 'personal') return ask('Who shares the money with you?', ['Just me', 'My partner', 'Family', 'Housemates']);
      return ask('Who do you work with?', ['Just me', 'A partner', 'A small team', 'Clients']);
    }
    case 'tools':
      return ask('Do you use AI tools? I can work with them.', ['Claude', 'ChatGPT', 'Cursor', 'None yet'], { many: true });
    case 'name':
      return { topic, question: 'And what should I call you?', choices: [], by: 'rules' };
    case 'first': {
      /* WHAT THIS KIND OF PERSON KEEPS FIRST, in their words (2 Nov, a walk: a freelancer who invoices every month was
         offered "Projects, People, Money, Agents", and a household "Savings goals" beside "Goals"). Where no kind is
         read, the places the build will make, never Agents or Today, and never one inside another. */
      const own = FIRST_TAPS[kind ?? ''];
      if (own) return ask('What should I keep track of first?', [...own], { many: true });
      const ps = w.places.filter((p) => fits(p, CHOICE_MOST) && !/^(?:agents|today)$/iu.test(p));
      const choices = ps.filter((p) => !ps.some((o) => o !== p && o.toLocaleLowerCase().endsWith(` ${p.toLocaleLowerCase()}`))).slice(0, 4);
      return choices.length < 2 ? null : ask('What should I keep track of first?', choices, { many: true });
    }
    default:
      return null;
  }
}

/**
 * THE TOPICS THE MODEL MAY ASK ABOUT IN THE CONVERSATION (1 Nov, a live run asked "What's your main expense category?" of
 * somebody who never raised one): what they work on, money in and out, the currency, who they work with, their tools, and
 * what to keep first. A question about anything else is dropped and the rules ask their next.
 */
export const MODEL_TOPICS: ReadonlySet<Topic> = new Set<Topic>(['work', 'money', 'currency', 'people', 'tools', 'first']);

/** Money words a question may only use where the person used them first: a category, a budget, a tax, a goal. */
const UNRAISED = /\b(categor\w*|budget\w*|tax\w*|expense\w*|spending|savings?|goals?|rates?|pricing|profit\w*|margins?)\b/giu;

/** Whether a question brings in a money word nobody said ("your main expense category" to somebody who said she is paid). */
function raisesNew(question: string, said: string): boolean {
  const s = said.toLowerCase();
  for (const m of question.toLowerCase().matchAll(UNRAISED)) {
    const stem = (m[1] ?? '').replace(/(?:ies|es|s)$/u, '').slice(0, 6);
    if (stem !== '' && !s.includes(stem)) return true;
  }
  return false;
}

/**
 * THE NAMES ALREADY SAID AS SOMETHING, read without case: every entry the reading holds (a client, a person, a project) and
 * every tool named. A suggested answer is never one of them (1 Nov, a live run offered "Fenwick" and "Acme", named as
 * clients, as the answers to which projects to track).
 */
export function namedIn(w: Pick<Where, 'proposal' | 'turns'>): Set<string> {
  const out = new Set<string>();
  for (const r of w.proposal?.rows ?? []) {
    const t = String(r.fields['name'] ?? r.fields['what'] ?? r.fields['title'] ?? '').trim().toLowerCase();
    if (t !== '') out.add(t);
  }
  for (const t of w.turns) if (t.ask.topic === 'tools' && t.answer) for (const n of splitNames(t.answer)) out.add(n.toLowerCase());
  return out;
}

/** Plain examples for a question about which work to track, where the model's taps were names said as something else. */
const WORK_EXAMPLES: Readonly<Record<string, readonly string[]>> = {
  freelance: ['A redesign', 'A new website', 'Ongoing support'],
  founder: ['Our first launch', 'Finding customers', 'Hiring'],
  student: ['My courses', 'A side project', 'A thesis'],
  shop: ['New products', 'A sale', 'Restocking'],
};

/** The model's question, held to what the screen can say and to a topic not yet asked, or `null`. */
function modelAsk(m: ModelAsk | null | undefined, w: Where, asked: Set<Topic>): ChatAsk | null {
  if (!m) return null;
  /* A QUESTION ABOUT WHICH CURRENCY IS THE CURRENCY'S, whatever topic it came under (2 Nov, the model run: "What's the
     currency for Tidepool's finances?" came as `money`, and the money question was then never asked). */
  const topic = (/\bcurrenc/iu.test(m.question) ? 'currency' : m.about) as Topic;
  /* ONLY THE CONVERSATION'S OWN TOPICS (`MODEL_TOPICS`), never one asked already. A name known, a currency named, money
     already said and the tools already named are never asked again, whatever the model read. */
  if (!MODEL_TOPICS.has(topic) || asked.has(topic)) return null;
  if ((topic === 'currency' || topic === 'money' || topic === 'tools') && settled(topic, w)) return null;
  const question = m.question.trim();
  if (!fits(question, QUESTION_MOST) || raisesNew(question, w.said)) return null;
  /* A CURRENCY IS A CODE THIS DEVICE KNOWS: the model's words, the rules' taps. */
  if (topic === 'currency') {
    const r = rulesAsk('currency', w);
    return r === null ? null : { ...r, question, by: 'model' };
  }
  /* NO TAP RE-OFFERS A NAME ALREADY SAID AS SOMETHING ELSE (`namedIn`): a client is not offered as a project. */
  const named = namedIn(w);
  const choices: Choice[] = [];
  for (const c of m.choices) {
    const v = c.trim();
    if (fits(v, CHOICE_MOST) && !named.has(v.toLowerCase()) && !choices.some((x) => x.value === v)) choices.push(tap(v));
  }
  /* WHERE THAT LEFT FEWER THAN TWO: plain examples for their work, the rules' own taps for what first, or none. */
  if (choices.length < 2 && m.choices.length > 0) {
    const kind = kindOf(w.said, w.usecase) ?? '';
    /* A QUESTION ABOUT WHICH PROJECTS IS ANSWERED WITH PLAIN EXAMPLES OF WORK, whatever topic it came under. */
    const work = topic === 'work' || /\bprojects?\b/iu.test(question);
    const instead = work ? (WORK_EXAMPLES[kind] ?? ['A few projects', 'One big project']) : topic === 'first' ? (rulesAsk('first', w)?.choices.map((c) => c.label) ?? []) : [];
    choices.splice(0, choices.length, ...instead.filter((x) => !named.has(x.toLowerCase())).map((x) => tap(x)));
  }
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
  /* TWO CURRENCIES NAMED MAKE THE NEXT QUESTION WHICH ONE (1 Nov, a live run: "paid in dollars and some in pounds" was
     followed by the model's question about clients, and the currency was never asked). The rules stand over the model's
     question here, and over whether Money is on yet, since an answer that names two currencies is about money. */
  if (!asked.has('currency') && w.money.guessed && currencyUnclear(w.said, w.env)) {
    const c = rulesAsk('currency', w);
    if (c !== null && c.choices.length > 1) return c;
  }
  /* THE LAST TURNS ARE KEPT FOR THE NAME AND WHAT FIRST (`KEPT_FOR_LAST`): when only as many are left as those still
     open, nothing else is asked, so the cap drops the tools question and never the name. */
  /* THE ONE THEY WORK WITH IS ASKED BY NAME AT ONCE (`pairOf`), by the rules and over the model's question: "We're a
     two-person startup" is followed by "What's your co-founder's name?", so they are drafted, and the cap never drops it. */
  if (open.includes('people') && pairOf(w.said) !== null && room > KEPT_FOR_LAST.filter((t) => open.includes(t)).length) {
    const r = rulesAsk('people', w);
    if (r !== null) return r;
  }
  const owed = KEPT_FOR_LAST.filter((t) => open.includes(t));
  const only = room <= owed.length ? owed : null;
  const m = modelAsk(w.model, w, asked);
  if (m !== null && (only === null || only.includes(m.topic))) return m;
  for (const t of open) {
    if (only !== null && !only.includes(t)) continue;
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

/**
 * AND WHAT AN ANSWER TO "WHAT FIRST" ASKS FOR BY ITS OWN WORDS: deadlines, to-dos or tasks keep Work, where the first
 * to-dos drawn from them wait (`todosOf`). `null` where it names none.
 */
export const firstTurnsOn = (answer: string): string | null => (/\b(?:deadlines?|due dates?|tasks?|to-?dos?|things to do)\b/iu.test(answer) ? 'work' : null);

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
      /* "Saving for a holiday" is a sentence already; "A redesign" is what they work on. */
      return /^\p{L}+ing\b/u.test(a) ? sentence(a) : `I'm working on ${low}.`;
    case 'money':
      return sentence(a);
    case 'people':
      /* THE ONE THEY WORK WITH, BY NAME: "Dan" is "My co-founder is Dan.", which first Today drafts in People. */
      if (ask.role !== undefined && BARE_NAME.test(a) && !/^just me$/iu.test(a)) return `My ${ask.role} is ${capital(a)}.`;
      return /^just me$/iu.test(a) ? 'I work on my own.' : `I work with ${BARE_NAME.test(a) && /^\p{Lu}/u.test(a) ? a : low}.`;
    case 'tools':
      return `I use ${a}.`;
    case 'first': {
      /* "Invoices and deadlines first" is said once: the "first" the sentence already says is not said again. */
      const what = low.replace(/^(?:first(?:ly)?|to start)[,:]?\s+/iu, '').replace(/[,\s]+(?:first|to start with|to start)$/iu, '');
      return what === '' ? '' : `First I want to keep track of ${what}.`;
    }
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
    const code = (c?.value ?? codesIn(a.toUpperCase())[0] ?? codeNamed(a, ask.choices.map((x) => x.value)) ?? a).toUpperCase();
    return knownCode(code) ? code : null;
  }
  if (ask.topic === 'closest') return c?.value ?? USE_CASES.find((u) => u.title.toLocaleLowerCase() === low)?.usecase ?? null;
  if (ask.topic === 'name') return nameIn(a);
  return null;
}

/* ── a name, from how people say it ─────────────────────────────────────── */

/* A greeting before it and a courtesy after it say nothing of the name: "Hi, I'm Layla", "Layla here, thanks". */
const GREETING = /^(?:hi|hello|hey|hiya|heya|yo|oh|well|sure|ok|okay)\b[\s,.!-]*/iu;
const COURTESY = /[\s,.!-]+(?:here|thanks|thank you|thx|please|cheers|is fine|works|is good|will do|is great)$/iu;
/* The ways a name is introduced, taken off before it. */
const NAME_LEAD =
  /^(?:(?:you\s+can|you\s+could|just|please|people|everyone|everybody|friends|they\s+all|most\s+people)\s+)?(?:call\s+me|calls\s+me|call\s+me\s+just|i\s+go\s+by|go\s+with|my\s+name\s+is|my\s+name['’]s|name['’]s|the\s+name['’]s|i['’]?m|i\s+am|it['’]?s|its|it\s+is|this\s+is|just)\s+(?:just\s+)?/iu;
/* Where the name stops: a clause after it ("I'm Layla, I run a studio", "Call me Sam and I design"). */
const NAME_END = /\s*(?:[,;:!?()]|\.(?:\s|$)|\s[-–—]\s|\s(?:and|but|from|by|in|at|i|i['’]m|who|because|as|or|though|although)\s)/iu;
const HONORIFIC = /^(?:dr|mr|mrs|ms|mx|miss|prof|sir|dame)\.?\s+/iu;
/* One word of a name: letters in any script, with the marks, apostrophes and hyphens names carry ("O'Brien", "Jean-Luc"). */
const NAME_WORD = /^\p{L}[\p{L}\p{M}'’-]*$/u;
/* Words that are never a name, so a sentence is never taken for one ("My partner Sam and I…" is no name). */
const NOT_NAME = new Set(
  (
    'i me my mine we us our you your he she they them their it its the a an and or but so if is am are was were be been ' +
    'being do does did have has had not no yes yeah yep nope sure ok okay fine good great thanks thank please hi hello hey ' +
    'call called name names named just only also too here there this that these those what who which when where why how ' +
    'with without for from to of in on at by as about into over under up out off work working works job jobs run running ' +
    'partner partners wife husband team client clients business company studio shop freelance freelancer student founder ' +
    'designer developer anything nothing none whatever someone somebody anyone nobody skip pass later dunno idk rather ' +
    'prefer say tell know want like would could should will can may might must every each all some any many more most'
  ).split(' '),
);
/** No name wanted, said plainly: asked once is enough. */
export const NO_NAME = /^(?:no|nope|skip|pass|rather not|i['’]?d rather not|prefer not(?: to say)?|i['’]?d prefer not to(?: say)?|no thanks|none|not telling|n\/a|-)$/iu;

/**
 * THE NAME AN ANSWER TO "WHAT SHOULD I CALL YOU?" GIVES, or `null` where BrainDog cannot be sure of one (2 Nov: "My
 * partner Sam and I run a studio" was taken whole, and the record was called "My's BrainDog"). Read from the ways people
 * say it: "Layla", "Layla Hassan", "I'm Layla", "Call me Layla", "my name is Layla", "Hi, it's Layla, thanks", at most
 * three words, each a word a name can be, none a word of a sentence. A name typed all in small letters is given its
 * capitals ("layla hassan" is Layla Hassan); one typed with capitals is kept as typed ("McKenzie", "de Silva").
 */
export function nameIn(answer: string): string | null {
  let a = plain(answer).replace(/[“”"]/gu, '');
  if (a === '' || NO_NAME.test(a)) return null;
  for (let i = 0; i < 3; i += 1) {
    const was = a;
    a = a.replace(GREETING, '').replace(COURTESY, '').replace(NAME_LEAD, '').replace(HONORIFIC, '').trim();
    if (a === was) break;
  }
  const end = NAME_END.exec(a);
  if (end !== null) a = a.slice(0, end.index);
  a = a.replace(/[.!,;:]+$/u, '').trim();
  const words = a.split(/\s+/u).filter((w) => w !== '');
  if (words.length === 0 || words.length > 3) return null;
  if (!words.every((w) => NAME_WORD.test(w) && !NOT_NAME.has(w.toLocaleLowerCase().replace(/['’]s$/u, '')))) return null;
  if ([...words.join(' ')].length > 40) return null;
  const small = a === a.toLocaleLowerCase() && a !== a.toLocaleUpperCase();
  return small ? words.map((w) => w.replace(/(^|[-'’])(\p{L})/gu, (_, p: string, c: string) => p + c.toLocaleUpperCase())).join(' ') : words.join(' ');
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
export function ackOf(
  ask: ChatAsk,
  answer: string | null,
  before: readonly string[],
  after: readonly string[],
  i: number,
  laid: { currency?: string | null; usecase?: string | null; name?: string | null; entries?: string | null } = {},
): string | null {
  if (answer === null) return null;
  if (laid.currency) return chatWords.currencyIs(laid.currency);
  if (laid.usecase) return chatWords.caseIs(laid.usecase);
  if (laid.name) return chatWords.callYou(laid.name);
  /* NO NAME HEARD IS NOT "GOT IT": the question asked again says so (`nameAgain`), or nothing does. */
  if (ask.topic === 'name') return null;
  const came = after.filter((p) => !before.includes(p));
  /* WHAT THE ANSWER ADDED BY NAME COMES FIRST (1 Nov, a live run answered "Clients Fenwick and Acme" with "Good to know"):
     "Added Fenwick and Acme as clients.", and the places it turned on after it. */
  if (laid.entries) return came.length > 0 ? `${laid.entries} ${chatWords.adds(came)}` : laid.entries;
  if (came.length > 0) return chatWords.adds(came);
  return chatWords.thanks[i % chatWords.thanks.length] ?? 'Got it.';
}

/** One entry the reading holds, as `entriesSaid` reads it. */
type Entry = { register: string; fields: Record<string, unknown> };

/** What kind of thing an entry is, in the words the line back says it in, or `null` for one it does not say. */
function kindOfEntry(r: Entry): { one: string; many: string } | null {
  const role = String(r.fields['role'] ?? r.fields['kind'] ?? '');
  if ((r.register === 'people' || r.register === 'organisations') && role === 'client') return { one: 'a client', many: 'clients' };
  if (r.register === 'people') return { one: 'someone you work with', many: 'people you work with' };
  if (r.register === 'organisations') return { one: 'an organisation', many: 'organisations' };
  if (r.register === 'things') return { one: 'a project', many: 'projects' };
  if (r.register === 'tools') return { one: 'a tool', many: 'tools' };
  return null;
}

const titleOfEntry = (r: Entry): string => String(r.fields['name'] ?? r.fields['what'] ?? r.fields['title'] ?? '').trim();

/**
 * THE ENTRIES AN ANSWER ADDED, SAID BY NAME ("Added Fenwick and Acme as clients."), or `null` where it added none that
 * the line says. By kind, in the order they came; at most two kinds.
 */
export function entriesSaid(before: readonly Entry[], after: readonly Entry[]): string | null {
  const had = new Set(before.map((r) => titleOfEntry(r).toLowerCase()));
  const groups = new Map<string, { kind: { one: string; many: string }; names: string[] }>();
  for (const r of after) {
    const t = titleOfEntry(r);
    const k = kindOfEntry(r);
    if (t === '' || k === null || had.has(t.toLowerCase())) continue;
    had.add(t.toLowerCase());
    const g = groups.get(k.many) ?? { kind: k, names: [] };
    g.names.push(t);
    groups.set(k.many, g);
  }
  const parts = [...groups.values()].slice(0, 2).map((g) => `${and(g.names)} as ${g.names.length === 1 ? g.kind.one : g.kind.many}`);
  return parts.length === 0 ? null : `Added ${parts.join(', and ')}.`;
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

const DIGIT = /\p{Nd}/u;
/* A figure is grouped or parted, by locale, with a comma or full stop ("2,400.50", "2.400,50"), which `stopAt` keeps
   inside it; an apostrophe or an Arabic separator ("2'400", "٢٬٤٠٠"), which is never a stop; or a space ("2 400", also
   no-break and narrow no-break), which `wordsOf` keeps inside it. (2 Nov: "£2,400" was said as "from: I invoice Fenwick £2".) */

/** Whether the character at `k` ends a clause: a stop or comma, never one between two digits ("£2,400", "1.5", "2.400,50"). */
function stopAt(s: string, k: number): boolean {
  const c = s.charAt(k);
  if (!/[.!?;,\n]/u.test(c)) return false;
  return !((c === ',' || c === '.') && DIGIT.test(s.charAt(k - 1)) && DIGIT.test(s.charAt(k + 1)));
}

/**
 * THE WORDS OF A STRETCH OF WHAT WAS SAID, a figure grouped with spaces kept as one ("2 400", "1 250 000,50"), so a cut
 * at a word never cuts inside a number.
 */
function wordsOf(s: string): string[] {
  const out: string[] = [];
  for (const w of s.trim().split(/\s+/u)) {
    if (w === '') continue;
    const last = out.at(-1);
    if (last !== undefined && /\p{Nd}$/u.test(last) && /^\p{Nd}{3}(?!\p{Nd})/u.test(w) && /(?:^|[^\p{Nd}])\p{Nd}{1,3}$|\s\p{Nd}{3}$/u.test(last)) out[out.length - 1] = `${last} ${w}`;
    else out.push(w);
  }
  return out;
}

/**
 * THE CLAUSE A PHRASE SITS IN, for "from" under a part ("from: a freelance designer in Cairo"): the words around the
 * phrase up to the nearest stop or comma, never one inside a figure, at most `most` characters, cut at a word.
 */
export function clauseOf(said: string, phrase: string, most = 48): string {
  const i = said.toLocaleLowerCase().indexOf(phrase.toLocaleLowerCase());
  if (i < 0) return phrase;
  let a = i;
  while (a > 0 && !stopAt(said, a - 1)) a -= 1;
  let b = i + phrase.length;
  while (b < said.length && !stopAt(said, b)) b += 1;
  const clause = said.slice(a, b).trim().replace(/^(?:and|but|so)\s+/iu, '');
  if (clause.length <= most) return clause;
  /* A LONG CLAUSE IS SAID AROUND THE PHRASE, a few whole words either side, with "…" where it was cut. */
  const before = wordsOf(said.slice(a, i));
  const after = wordsOf(said.slice(i + phrase.length, b));
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

/* ── the use case, as they would say it ────────────────────────────────── */

/**
 * THE USE CASE'S NAME AS THIS PERSON WOULD SAY IT (1 Nov, a live run: a freelance UX designer was told "That adds Small
 * business"). A freelancer, contractor or solo consultant keeps what a small business keeps (clients, invoices, the work),
 * so the use case is the business one, said as Freelance. Every other use case is its own title.
 */
export function caseTitle(u: { usecase: string; title: string }, said: string): string {
  if (u.usecase === 'business' && kindOf(said, null) === 'freelance') return chatWords.freelance;
  /* A FOUNDER WHO SAYS "WE" IS NO SOLO FOUNDER (2 Nov, a walk: "We're a two-person startup" was told "That adds Solo
     founder"). The same starter, said as Startup. */
  if (u.usecase === 'founder' && /\b(?:we|we're|we’re|our|us|co-?founders?|two-person|team)\b/iu.test(said)) return chatWords.startup;
  return u.title;
}

/* ── the tools they named ──────────────────────────────────────────────── */

/** The AI apps BrainDog connects on Made (`Made.svelte`), which are agents and not tools to keep. */
const AI_APPS = /^(?:claude(?: code| desktop)?|chatgpt|gpt(?:-?\d.*)?|openai|cursor|codex|copilot|github copilot|gemini|windsurf|perplexity|ai tools?|none(?: yet)?|no|nothing|not yet|n\/a)$/iu;

/**
 * THE TOOLS A PERSON NAMED THAT ARE NOT AI APPS, as rows of Agents' Tools list (1 Nov, a live run: "Claude and Figma"
 * picked Claude on Made and left Figma nowhere). Each is an integration by its name, as typed; Claude, ChatGPT, Cursor and
 * the like are the apps Made connects and are left out. At most four.
 */
/** Every name an answer lists ("Claude, and Figma" is Claude and Figma), as typed, none twice, the AI apps included. */
export function splitNames(answer: string): string[] {
  const out: string[] = [];
  for (const n of plain(answer)
    .replace(/^(?:i\s+(?:also\s+)?use|we\s+use|mostly|just|only)\s+/iu, '')
    .split(/\s*(?:,|\band\b|&|\+|\/|\bplus\b)\s*/iu)
    .map((x) => x.trim().replace(/^(?:the|a|an)\s+/iu, ''))) {
    if (n !== '' && [...n].length <= 40 && !out.some((x) => x.toLowerCase() === n.toLowerCase())) out.push(n);
  }
  return out;
}

/** The AI apps BrainDog knows as a kind of agent (`PROFILE_KINDS`), by the words a person names them with. */
const AGENT_KINDS: readonly (readonly [RegExp, string, string])[] = [
  [/^claude(?: code| desktop)?$/iu, 'claude', 'Claude'],
  [/^cursor$/iu, 'cursor', 'Cursor'],
  [/^codex$/iu, 'codex', 'Codex'],
  [/^gemini$/iu, 'gemini', 'Gemini'],
  [/^(?:github )?copilot$/iu, 'copilot', 'Copilot'],
  [/^windsurf$/iu, 'windsurf', 'Windsurf'],
];

/**
 * THE AI APPS A PERSON NAMED THAT ARE AGENTS BRAINDOG KNOWS, as `{ kind, name }` (1 Nov, a live run: "Claude, and Figma"
 * said "That adds Agents" and the Agents page then showed no agent). Make it mine keeps one agent row for each, not yet
 * connected, and the Agents page offers to connect it. ChatGPT and the like have no kind of their own and are left out.
 */
export function agentsNamed(answer: string): { kind: string; name: string }[] {
  const out: { kind: string; name: string }[] = [];
  for (const n of splitNames(answer)) {
    const hit = AGENT_KINDS.find(([re]) => re.test(n));
    if (hit && !out.some((x) => x.kind === hit[1])) out.push({ kind: hit[1], name: hit[2] });
  }
  return out;
}

export function toolRows(answer: string): { register: string; fields: Record<string, unknown> }[] {
  const names = splitNames(answer).filter((x) => !AI_APPS.test(x));
  const out: { register: string; fields: Record<string, unknown> }[] = [];
  for (const n of names) {
    const name = n.charAt(0).toUpperCase() + n.slice(1);
    if (!out.some((r) => String(r.fields['name']).toLowerCase() === name.toLowerCase())) out.push({ register: 'tools', fields: { name, kind: 'integration', state: 'active', origin: 'Said when this BrainDog was made' } });
  }
  return out.slice(0, 4);
}

/* ── the words read again for Today ────────────────────────────────────── */

/** The topics whose answers are how they work and what to set up, never a thing to do (`draftsSaid`). */
const NOT_TODO: ReadonlySet<Topic> = new Set(['closest', 'currency', 'tools', 'name', 'first', 'kind']);

/** What to keep first, as the words the to-dos are drawn from ("invoices and deadlines"), or `''`. */
function firstOf(turns: readonly ChatTurn[]): string {
  const t = turns.find((x) => x.ask.topic === 'first' && x.answer !== null);
  return t ? plain(t.answer ?? '').replace(/^(?:first(?:ly)?|to start)[,:]?\s+/iu, '').replace(/[,\s]+(?:first|to start with|to start)$/iu, '') : '';
}

/**
 * THE FIRST TO-DOS, DRAWN FROM WHAT THEY SAID (1 Nov, a live run: a freelancer who named two clients and "invoices and
 * deadlines first" opened a Today with nothing to keep). One thing to do for each thing they keep first that a to-do fits,
 * on the clients they named, one to three in all: "Send Fenwick's invoice", "Set up deadlines for Acme". Offered on
 * Today, never written unasked.
 */
export function todosOf(turns: readonly ChatTurn[], clients: readonly string[], have: readonly string[] = []): string[] {
  return todosFor(firstOf(turns), clients, have);
}

/**
 * THE SAME FIRST TO-DOS FROM THE SENTENCE A SIGN-UP KEPT (2 Nov, a walk: a stranger who named three clients and
 * "invoices, deadlines" first opened a Today with nothing of hers): the conversation is gone by the time the letter's
 * link builds, but its "First I want to keep track of …" (`saidOf`) is in the words. The words with the to-dos said after
 * them, for the drafts read again on Today, as `draftsSaid` gives `/start`'s.
 */
export function withTodos(said: string, clients: readonly string[]): string {
  const first = /\bFirst I want to keep track of ([^.]+)\./u.exec(said)?.[1] ?? '';
  const todos = first === '' ? [] : todosFor(first, clients);
  return [said.trim(), ...todos.map((t) => `${t}.`)].filter((x) => x !== '').join(' ');
}

function todosFor(firstSaid: string, clients: readonly string[], have: readonly string[] = []): string[] {
  const first = firstSaid.toLowerCase();
  const c = clients.filter((x) => x.trim() !== '');
  const one = c[0] ?? null;
  const two = c[1] ?? one;
  const out: string[] = [];
  const add = (s: string) => {
    if (!out.includes(s) && !have.some((h) => h.toLowerCase() === s.toLowerCase())) out.push(s);
  };
  if (/\binvoic|\bbill(?:ing|s)?\b|\bgetting paid|\bpayments?\b/u.test(first)) add(one ? `Send ${one}'s invoice` : "Send this month's invoices");
  if (/\bdeadlines?|\bdue dates?|\bschedule/u.test(first)) add(two ? `Set up deadlines for ${two}` : "Write down this month's deadlines");
  if (/\bprojects?\b/u.test(first)) add(one ? `List the work for ${one}` : 'List the projects on now');
  if (/\bclients?\b|\bcustomers?\b/u.test(first) && one) add(`Add a contact at ${one}`);
  return out.slice(0, 3);
}

/**
 * WHAT THE CONVERSATION SAID THAT MAY HOLD A THING TO DO, for the drafts read again on Today (1 Nov, a live run: Today
 * offered "A spreadsheet and invoices by email" and "First I want to keep track of invoices and deadlines first" as tasks).
 * The answers to the setup questions (the currency, the tools, a name) are left out; the rest are said as they were added
 * to the conversation. What to keep first is said as what it is ("I want to keep track of invoices and deadlines first."),
 * and the to-dos drawn from it (`todos`, `todosOf`) are said after, each as a thing to do, so both readers offer them.
 */
export function draftsSaid(turns: readonly ChatTurn[], todos: readonly string[] = []): string {
  const first = firstOf(turns);
  return [
    ...turns.filter((t) => t.answer !== null && !NOT_TODO.has(t.ask.topic)).map((t) => saidOf(t.ask, t.answer ?? '')),
    first === '' ? '' : `I want to keep track of ${first} first.`,
    ...todos.map((t) => `${t}.`),
  ]
    .filter((x) => x !== '')
    .join(' ');
}
