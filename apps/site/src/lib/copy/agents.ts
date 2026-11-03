/**
 * The page that connects an agent, `/agents`: the head, the briefing a session starts with, what it starts with and
 * how it earns your trust, the agents working now, the row for developers, and the early access strip. Rewritten
 * so a reader who is not a developer reads it too, with the developer's detail
 * one row away.
 *
 * The connect steps themselves are data in `lib/connect/apps.ts`, beside the box that draws them, so the home page and
 * this page say the same lines. The made-up names are the demo record's (`lib/demo/maya.ts`).
 */
import { DOCS } from '../links.ts';

export const agents = {
  agents: {
    title: 'Connect your agents in one line.',
    lead: 'Every agent connects to one address. You approve each once, and no key is copied anywhere. From then on, every session starts caught up.',
    /* THE BRIEFING FIRST (3 November story, S5): the terminal explains it faster than the list, so it leads. */
    brief: {
      title: 'Every session starts with a briefing.',
      say: "Before you type a word, your agent sees where the project stands, the next step and what's waiting on you. When it stops, it leaves a handoff for the next one. The command line prints the same briefing for you.",
    },
    gets: {
      title: 'What every session starts with',
      lines: [
        'Where each project stands, and the next step the last session left.',
        "Who else is working right now, so two agents don't collide.",
        'The lessons earlier sessions wrote down.',
        "What's waiting on you, and the keys it may use, by name only.",
      ],
    },
    /* HOW IT EARNS YOUR TRUST, in place of "What it can't do" (3 November): since the switch went fully inclusive on
       2 November an owner's own agents may manage the team, so "invite or remove people, switch or no switch" was no
       longer true. The ladder is `packages/record/src/ladder.ts` (offer after 10 kept in 14 days; an undo, three noes,
       a burst or outside text drops it); the floor is `packages/kernel/src/change-kind.ts`; what the switch never
       covers is `docs/03-agents/04-scopes.md`. */
    cannot: {
      title: 'How it earns your trust',
      lines: [
        "It asks first. A new agent's changes arrive as questions, each with what would happen and why.",
        'It earns one kind at a time. Keep ten changes of a kind and it may make that kind alone. One undo, or an email it just read, puts it back to asking.',
        'Some things always ask: deletes, money, keys and sharing. Reading a key, giving BrainDog away and deleting it stay yours even if you let your own agents do everything.',
        "It can't hide what it did. Every change carries its name, and you can undo it.",
      ],
    },
    /* WATCH THEM, AND STOP THEM (S3): the app's Agents page, `apps/web/src/lib/record/instruct.ts` (tell, pause,
       redirect, stop) and `PresencePanel.svelte`. Claude Code hears it through its hooks at its next tool call; any
       other agent at its next call to BrainDog. The drawn rows are Maya's `TODAY.working`. */
    watch: {
      title: 'Watch them, and stop them',
      say: 'The Agents page shows every agent working now, on which project, since when. Tell one something, pause it, redirect it or stop it. It hears you at its next step.',
      head: 'Working now',
      pause: 'Pause',
      resume: 'Resume',
      stop: 'Stop',
      paused: 'Paused',
      stopped: 'Stopped at its next step',
      label: 'The Agents page in BrainDog: each agent working now, with Pause and Stop beside it',
    },
    dev: {
      title: 'For developers',
      links: [
        { label: 'The command line', href: `${DOCS}/agents/cli` },
        { label: 'What each token may do', href: `${DOCS}/agents/scopes` },
        { label: 'All agent docs', href: `${DOCS}/agents/connect` },
      ],
    },
  },
} as const;
