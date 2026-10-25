/**
 * The agents area's words and the consent screen's: the three ways to connect an agent, what is connected, and the page
 * an app's sign-in lands on.
 *
 * AN AREA FILE OF THE COPY AGGREGATE. `lib/copy.ts` spreads this object into `copy`, and every screen reads a
 * key here as `copy.<key>`. The words the Agents area drew before the rebuild (the six-digit field, a grant's reach, a
 * key's scope) stay in `account.ts`, where they were typed; what the rebuild added is here, so the two can be told
 * apart by file.
 *
 * NO "TOKEN" ON SCREEN. It is a developer's word, so what a script is handed is a key, as it is on
 * every other screen that hands one over.
 *
 * Plain Node loads this file through the aggregate (`passkey.mjs`), so it imports only relative `.ts` files.
 */

export const agents = {
  /* THE WAYS IN, as the connect sheet (`agents/ConnectSheet.svelte`) draws them: an address any MCP client takes, the
     command that sets Claude Code up with its hooks and skills, and a key for a program that has no browser to sign in from. */
  doorAnyHint: 'Give an app this address where it asks for a server. The app then sends you here to allow it.',
  doorSetupHint: 'Install the braindog command on the computer, then set it up for this record. It shows six digits for you to approve here.',
  doorInstall: 'Install the command',
  doorOs: 'The computer it goes on',
  osNames: { windows: 'Windows', unix: 'macOS or Linux' },
  doorSetupRun: 'Set it up for this record',
  doorKeyHint: 'For a program with no browser to sign in from. The key can read and change your record for ninety days.',
  doorKeyLabel: 'Name the script or server',
  doorKeyGo: 'Make a key',
  doorKeyHeader: 'Send it in this header',
  copyAddress: 'Copy the address',
  copyCommand: 'Copy the command',
  copyKey: 'Copy the key',
  copyHeader: 'Copy the header',
  keyCopied: 'Key copied',

  /* WHAT IS CONNECTED: every machine, key and app on one list (`record/device.ts` `connected`). */
  connectedNone: 'No agent is connected yet',
  /* IT NAMES WHAT FILLS THE LIST, not where on the screen the ways to fill it are. */
  connectedNoneWhy: 'Connect one and it shows here with what it did.',
  agentOn: (agent: string, machine: string) => `${agent} on ${machine}`,
  canAndInbox: (can: string) => `${can}, and may read the inbox`,
  unnamedKey: 'A key with no name',
  unnamedApp: 'An app with no name',
  /* A MACHINE SIGNED IN BY THE COMMAND, before any agent there has opened a run to say which it is. */
  theCommand: 'The BrainDog command',
  lastRun: 'last run',
  /* WHERE IT RUNS AND HOW IT CAME IN, the quieter line under a connection's name (`record/apps.ts` `lineOf`). */
  connectedOn: (machine: string) => `On ${machine}, signed in`,
  connectedFrom: (site: string) => `From ${site}, signed in`,
  connectedSignedIn: 'Signed in',
  connectedHere: 'Signed in on this computer',
  connectedKeyYours: 'A key you made',
  connectedKey: 'A key',
  notUsedFor: (days: number) => `Not used for ${days} days`,

  /* THE CONSENT SCREEN (`routes/connect`). What it may do is always a sentence and never the bare word. */
  consentTitle: 'Connect an agent',
  consentNamed: (app: string) => `Connect ${app}`,
  consentNone: 'No app is asking to connect',
  consentNoneWhy: 'When you add BrainDog to an app, the app sends you to this page to allow it.',
  /* NOT A DEAD END (first F11): the way to connect one from this side, and the way into BrainDog. */
  consentConnectAgent: 'Connect an agent',
  consentOpenAgents: 'Open agent settings',
  consentGone: 'This sign-in has ended',
  /* THE BRAINDOG IT WOULD REACH IS NAMED, because it is the fact being decided (first F11). */
  consentAsks: (app: string, record: string | null, host: string) =>
    `${app} wants to reach ${record ?? 'your BrainDog'}. After you answer, you go back to ${host}.`,
  consentRecord: 'Which BrainDog',
  consentReach: 'What it may do',
  consentScope: {
    read: 'Read only',
    propose: 'Read and suggest changes. You decide each one.',
    write: 'Read and change things directly',
  },
  consentLasts: 'This lasts 90 days. Remove it any time in Settings, Agents.',
  consentAllow: (app: string) => `Allow ${app}`,
  consentDeny: (app: string) => `Deny ${app}`,
  consentNotOwner: "Only a record's owner can connect an app to it, and you own no record here. You can still turn the app away.",
  consentNotOwnerHere: "Only this record's owner can connect an app to it. You can still turn the app away.",
  consentFailed: 'BrainDog could not connect this app. Go back to the app and connect again.',
} as const;
