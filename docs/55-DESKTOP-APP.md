# 55 · The Mac app

**PLAN**, 17 October 2026. The owner: "plan the braindog app in a way that can make us have a proper macos app easily?
similarly to how discord desktop app and discord.com/app works".

## The shape: one app, two doors

Discord runs one web client in two places: in a browser tab at `discord.com/app`, and inside the desktop app, which is
a thin native window around that same client with a few native powers added. BrainDog does the same.

- **In a browser:** `app.brain.dog/app/<address>`, as it is today.
- **On a Mac:** BrainDog.app, a native window that opens `https://app.brain.dog/app` itself. Every deploy of the web app
  reaches the Mac app at once, so there is one product to build, one set of tests and one release.
- **The shell stays thin.** It holds only what a browser tab cannot do (below). Everything a person sees is the web
  app. If the shell ever has to change, the web app does not.

## The shell: Tauri 2

| | Tauri 2 (the pick) | Electron (what Discord uses) |
|---|---|---|
| Download | about 10 MB | about 150 MB |
| Draws with | the Mac's own Safari engine (WebKit) | its own copy of Chrome |
| Memory | low | high |
| Native code | Rust | Node |
| Windows and Linux later | yes, same project | yes, same project |

Tauri is small and fast, and the Mac already has its engine. The one cost is that the app must look right in Safari's
engine, which the checks below make sure of. Because the shell is thin, moving to Electron later would mean changing
the shell only, never the app.

It lives in `apps/desktop` (`src-tauri/` with `tauri.conf.json`, its permissions and a little Rust). The window loads
the live site, and only `https://brain.dog` may talk to the shell, through the few commands listed here.

## What the Mac app adds

1. **Its own window**, with the Mac's traffic lights sitting in the app's top bar, the bar draggable, and the size and
   place remembered.
2. **⌥Space from anywhere opens Slash.** The window comes forward with the bar already open (the bar that opens in
   place, §47). Later, a small floating Slash bar that answers without opening the whole window.
3. **The Dock badge is the Needs you count**, and Mac notifications for what needs you, with the answer buttons in
   the notification where the Mac allows it.
4. **Real menus:** Edit (copy, paste, undo), View (zoom), Go (⌘1 Today, ⌘2 Projects, ⌘3 Needs you, ⌘4 Agents),
   ⌘, for Settings, ⌘K and / for Slash, Window and Help.
5. **Links:** `braindog://` links and BrainDog links open in the app; every other link opens in the default browser.
6. **Sign in once.** Email codes and passkeys work in the window. Google refuses sign-in inside an app window, so
   Google sign-in opens the browser and comes back to the app by a `braindog://` link carrying a one-time code, which
   the worker swaps for the usual session.
7. **Updates:** the app updates itself when the shell changes (signed updates). The product updates with every deploy.

## What the web app does now, so the Mac app is easy (small, during launch)

These cost little, help the browser too, and are what turns the Mac app into a short job later.

1. **One door to the outside, `apps/web/src/lib/shell.ts`.** The app asks it to notify, set the badge, open a link
   outside and remember the window. It hears "open Slash" and "go to". In a browser it uses web notifications and
   `navigator.setAppBadge`; in the Mac app it calls the shell. Nothing else in the app knows which one it is in.
2. **The top bar makes room for a title bar.** A `--shell-inset` variable (0 in a browser, about 78 px in the Mac app)
   and the bar marked as the window's drag area.
3. **Every outside link goes through one helper**, so the Mac app can send it to the browser.
4. **Safari's engine joins the checks.** The layout and accessibility gates run in Playwright's WebKit as well as
   Chromium, at 1440 and 390, both themes. This is the biggest single thing that makes the Mac app safe.
5. **Nothing assumes a browser tab:** no popups opened with `window.open`, no `alert` or `confirm`, no shortcut that the
   Mac's menus own (⌘Q, ⌘W, ⌘H, ⌘M).
6. **Google sign-in can come back by a one-time code**, the path step 6 above needs.
7. **The installed web app is good on its own.** The app already has its manifest and icons. On macOS 14 and later,
   Safari's "Add to Dock" gives a Dock app today, before BrainDog.app exists.

## Building and shipping it (after launch, about 2 batches)

- **Batch A:** `apps/desktop` with the window, menus, ⌥Space, the badge, notifications, links, the Google return, and
  the updater. Checked by opening the app against a test record and walking Today, a project, Needs you and Slash.
- **Batch B:** signing, notarizing and the download: a universal build (Apple silicon and Intel) as a DMG at
  `brain.dog/download`, a "Get the Mac app" line on the site and in Settings, and the update feed.
- **His sitting:** the Apple Developer Program for Quartz Apps LLC (99 dollars a year) and its Developer ID
  certificate, kept in the Mac's keychain for signing and never written in a note. About 30 minutes.
- **Later, if wanted:** Windows and Linux from the same project; the Mac App Store (it limits what an app may do, so
  it is not the first door); and the local copy of the record living inside the Mac app, with the self-hosted engine
  running beside the window, so it works offline and agents on the Mac reach it directly.

## Done when

- A person downloads BrainDog.app, signs in once (Google included) and lands on their record.
- ⌥Space opens Slash from anywhere; the Dock shows what needs them; links go where they should.
- A web deploy shows up in the app without an app update.
- The layout and accessibility gates pass in WebKit as well as Chromium.
