# BrainDog for iPhone and Mac

Two native SwiftUI shells, built from one XcodeGen project, with the live web app inside them as the long tail. The
plan is `loop/plans/apps-2026-11-02/PLAN.md`; what each milestone did is beside it (`M01.md`, ...). The decisions are
`docs/55-DESKTOP-APP.md`.

| Target | Bundle id | What |
|---|---|---|
| `BrainDog` | `dog.brain.app` | the iPhone (and iPad) app |
| `BrainDogMac` | `dog.brain.desktop` | the Mac app (the id the Tauri shell held, kept) |
| `WidgetsiOS`, `WidgetsMac` | `….widgets` | WidgetKit: Needs you, Key numbers, Due next, Today number (picked), Tell, and Tell in Control Center (M5) |
| `ShareiOS`, `ShareMac` | `….share` | the share extension: words, a link, a photo or a PDF into Tell (M5) |
| `Shared/` | | App Intents and App Shortcuts, compiled into both apps: Tell BrainDog, What needs me, Open Needs you |
| `NotifyService` | `dog.brain.app.notify` | the notification service extension: a push's real words, read on the phone (M4) |
| `Packages/BrainDogKit` | | everything they share: client, session, sign-in, the bridge, the web screen, Look B, Tell |

The team is Quartz Apps LLC, `MG86668Z52`. iOS 26 and macOS 14 at least.

## Build

```sh
brew install xcodegen                          # once
node apps/apple/tools/build.mjs check          # both apps, unsigned (the CI-style check)
node apps/apple/tools/build.mjs sim --server http://localhost:5183   # the iPhone app on the one booted simulator
node apps/apple/tools/build.mjs mac --server http://localhost:5183   # the Mac app, signed to run locally
```

The `.xcodeproj` and the Info.plists are generated (`xcodegen generate` in this folder) and never committed. Open the
generated project in Xcode to work in it; change targets and settings in `project.yml`.

`--server` is Debug only: the app reads `-braindogServer` from its launch arguments; a Release build always talks to
`https://app.brain.dog`. For the seed, run `node apps/apple/tools/dev.mjs` (the Worker over a real Directory with a
person on the seed, on 8787, printing each sign-in letter's link and code) and `pnpm --filter @braindog/web dev`.

**One iOS simulator booted at a time, ever.** `build.mjs sim` refuses when more than one is.

The screenshot walk: `node apps/apple/tools/shots.mjs all --out <folder>` (or `m2`, `m3`, `m5`) relaunches the signed-in app on the booted
simulator once per screen, light and dark, and saves each to `~/Developer/braindog/.notes/shots/apps/<milestone>/`.
`node apps/apple/tools/launch.mjs --server <url>` measures a cold launch from the Debug marks. Each screen is reached by a Debug launch press (`-braindogPress go:…`, `BrainDogApp.swift`), which calls what the
screen's own control calls; a Release build has none of it.

## The iPhone app

- **Tabs**: the web's first four places (`places`, from `tabsOf`), kept for the next launch, and Search or go to as the
  search tab. Needs you is native with its count; every other tab is a native stack of web screens.
- **The page runs under the bars**, top and foot. The web view's scroll view has no inset: the page pays for the bars with `env(safe-area-inset-*)` (`.body` in `AppFrame.svelte`), because with an inset the page's own `scrollTo(0, 0)` landed under the nav bar. Dynamic Type is the page's zoom, with the root box set to the window's width (`ShellScript.js`). A web sheet takes the tab bar and Tell away while it is open (`modal` in the bridge).
- **Stacks**: a link pressed in a page becomes a native push (`shell.visit`, from `AppFrame.svelte`), taken from a warm
  web view (`WebPool`). At most four live per stack; deeper screens sleep with their picture and reload on the way back.
  A pushed screen's back and name are drawn by the app (no glass); the system's edge swipe back is kept (`SwipeBack`).
- **Native moments**: Needs you (swipe right gives the suggested answer, left puts it off, a tap opens the card),
  Tell (the tab bar's accessory; read on the device by `tell-core.js`, one `capture`, Undo), Search, Account (every
  BrainDog with its role, switch, Settings, Sign out), the Settings root.
- **Offline**: web screens use the service worker's kept copy (App-Bound Domains); a screen never kept says so with
  Try again; Needs you shows its last read and when. Tell offline keeps the words as a draft and sends nothing.

## Outside the app (M5)

- **The glance**: one `previewPage` over Needs you's queue and the Home figures (`figures.home`, Today's key numbers),
  writing nothing (`Glance/Glance.swift`). The app reads it at launch, after Tell or an answer, and going to the
  background, keeps it in the App Group and asks the widgets to draw again; each widget also reads it itself every 15
  minutes with the session from the shared Keychain group.
- **Widgets**: Needs you (small, medium, Lock Screen circular and rectangular), Key numbers (small, medium), Tell
  (small, Lock Screen circular). Plain: the tile, a Plus Jakarta Sans figure, red only for the count and a figure under its target. Due next is what Today's Coming up reads (dates on the money in two weeks), after any reminder.
  `braindog://open?path=` and `braindog://tell` are what they open.
- **Siri and Shortcuts** (`Shared/Intents.swift`): "Tell BrainDog" reads the words with the same `tell-core.js` and adds
  what is placed whole in one `capture`; anything it cannot place opens the app in Tell with the words in it. "What
  needs me" says the count and the first question.
- **Share**: the share sheet's Tell, with the shared words and the first photo or file; the file goes into the first
  file field of the list the first entry goes to (`PUT /api/files`), and the receipt says when no list keeps one.
- A Debug build draws the widgets and the share sheet over the app for the walk (`go:widgets`, `go:share:…`,
  `iOS/Gallery.swift`): nobody can add a widget or press Share on a simulator without a finger.

## Push (M4)

- **Server**: the app registers Apple's token through the web's own `subscribePush`, as
  `apns://<production|sandbox>/dog.brain.app/<hex>`, so it is a row in `push_sub` beside the browsers and rings for
  exactly what a browser does (questions waiting, the record's alarms, mentions and hand-overs, agents, summaries), held
  by the person's own switches (`push.off`) and the record's quiet hours. The deliverer sends it to Apple with the team's
  key (`apps/worker/src/apns.ts`): one fixed line for its kind, `category`, the BrainDog as `thread-id`, and `open`.
  The key is three Worker secrets, never set by an agent:
  `wrangler secret put APNS_KEY_ID|APNS_TEAM_ID --env <env>` and `wrangler secret put APNS_KEY --env <env> < AuthKey_<id>.p8`.
- **App**: asked the first time Needs you holds something, from Settings › On this iPhone, and from the web's
  Notifications (`pushAsk`, which now answers). The service extension reads the question with the app session and shows
  its words and the suggested answer ("Say what it is about", on by default); Accept appears only where the web's one
  press would answer it, Later on every question. The badge is the Needs you count; a tap opens `/decide/<id>` in the
  BrainDog it came from. Try one on the simulator with `xcrun simctl push booted dog.brain.app <file.apns>`
  (`tools/shots.mjs ios4` writes two).

## Outside the app, second pass (M5)

- **Home Screen press-and-hold**: Tell BrainDog, Needs you, Search. **Control Center**: Tell BrainDog (also for the
  Action button), running the app's own Open Tell intent (`Shared/Open.swift`, compiled into the widgets too).
- **Handoff**: the page in front is the current `dog.brain.page` activity on both apps, with its address as
  `webpageURL`, so it continues on the other app or in Safari. **Spotlight**: pages and lists by name, gone on sign-out.
- **Lock with Face ID**: off by default, in Settings › On this iPhone; asks at open and after five minutes away, and
  covers the app switcher's picture while on.

## The Mac app (M6)

- **One window**, no title bar of its own: the traffic lights stand in the web's 56px bar, centred on it, 16 from the
  edge, and the web leaves them 88 at the start of that row (`MacBar`, `--shell-lead`), never as height above it
  (`Mac/WindowChrome.swift`). A press on the bar's empty part moves the window and a double press zooms it (or does what
  the person set for a title bar) (`ShellScript.js`). Size and place are remembered.
- **The quick panel** (`Mac/QuickPanel.swift`, `Mac/HotKey.swift`): Option+Space in any app opens a floating Tell / Search
  panel, 640 wide in the top third of the screen, without taking the front from the app the person is in. Tell reads
  each line with the same `tell-core.js` and shows what it becomes; Enter adds them in one `capture` (Undo on the
  receipt), ⇧Enter is a new line, ⌘Enter asks about it in the window. Search finds a place or an entry and Enter opens it
  in the window. Tab switches, Escape or a press elsewhere closes. The keys are a Carbon hot key held exclusively: when
  another app owns them Settings says so. Changed or turned off in Settings › Shortcut.
- **Menus**: BrainDog (Settings…, Open at Login, Sign out), File (New Tell… ⌘N, Quick Panel with its
  keys), Edit, View (Reload ⌘R, Actual Size ⌘0, Zoom In ⌘=, Zoom Out ⌘−, full screen), Go (Back ⌘[, Forward ⌘], then
  Today ⌘1, Needs you ⌘2 and the web's own places and the record's pages, ⌘3 onward; Settings in BrainDog ⌥⌘,; Search or
  Go To ⌘K, Ask ⌘J), Window, Help (brain.dog/docs, /support).
- **Settings window** (⌘,), three tabs: General (open at login, the menu bar, text size, updates), Shortcut (the quick
  panel's keys), Signing in (who, which BrainDog, the role, Sign out, Passkeys and Devices in BrainDog's own Settings).
- **Menu bar**: the Needs you glyph and the count; its panel lists the first three questions, Tell and Open BrainDog.
  **Dock badge**: the count. The app stays open with its window closed while the menu bar holds the count.
- **Offline** (`Mac/Offline.swift`): the page's own kept copy (its service worker and IndexedDB, which WKWebView runs on
  the Mac with no App-Bound Domains); a first load that reaches nothing and has nothing kept says so with Try again.
  Today's last picture covers the page at launch until it has drawn, as on the iPhone.
- **Links**: `braindog://open?path=`, `braindog://tell`, `braindog://quick`, and universal links on app.brain.dog (the
  same addresses as the iPhone app's, `apps/worker/src/apple.ts`) open in the window; the sign-in link signs in, only as a universal link on the app's own origin (`braindog://` is any page's to open and never signs in), never over a session already here, and after a press when this app did not ask for that link (`Web/WebGate.swift`, `SignInFlow.open`).
- **Updates**: the Mac App Store's. The app has no updater of its own, because the store allows none.
- **Tell window**: the same composer as the iPhone's Tell sheet. Page notifications show while the app runs; exports go
  to Downloads.
- Screenshots: `node apps/apple/tools/mac-shots.mjs --out mac6 --server http://localhost:5183` once signed in
  (`build.mjs mac --quiet --press email:…`, then `--launch --press code:…`). `--quiet` (and every walk) launches in the
  background and never brings the app forward, and its windows are clear and deaf to the mouse, so the native pictures
  (panel, Settings, Tell, offline) can be taken while someone uses the Mac; the window's page draws only with `--front`
  (WebKit answers nothing for an app opened in the background), so take `window*` when nobody is at it. The app draws its own pictures (`Mac/Shots.swift`), since a shell may not record the screen.
- A Mac build signed to run locally keeps its session in a file in its own sandbox container, because the login keychain
  asks the person at the screen again after every rebuild (`Session.swift`, Debug only).

## Generated, never by hand

| File | From | Script |
|---|---|---|
| `Packages/BrainDogKit/Sources/BrainDogKit/Resources/Colours.xcassets`, `Look/Tokens.generated.swift`, `Assets.xcassets` colours | `packages/theme` (`HOUSE.frame`) | `tools/tokens.mjs` |
| `Resources/Icons.xcassets`, `Look/Glyph.generated.swift` | `apps/web/src/lib/ui/icons.ts`, `packages/skin/mark.ts` | `tools/icons.mjs` |
| `BrainDog.icon` (Icon Composer), the white mark on the red | `packages/skin/mark.ts`, the palette | `tools/app-icon.mjs` |
| `Resources/tell-core.js` | `apps/web/src/lib/tell/native.ts` (the web's reader) | `tools/tell-core.mjs` |

Each takes `--check` and fails when its output is not what its source makes now. A view never writes a colour.

## Fonts

`Resources/Fonts` holds the OFL TTFs (the web's woff2 files cannot be registered on iOS), each with its licence beside
it, as the SIL Open Font License 1.1 asks:

- `PlusJakartaSans[wght].ttf`: Plus Jakarta Sans, variable weight, OFL 1.1 (`OFL-PlusJakartaSans.txt`), built by `tools/fonts/jakarta.py`: upstream's, with its capitals centred in the line and a wider word space, the same as the web's.
- `GeistMono.ttf`: Geist Mono, variable weight, © 2024 The Geist Project Authors, OFL 1.1 (`OFL-GeistMono.txt`).

## Signing

Nothing signs with the team until Xcode is signed in to it (Settings › Accounts, the account that holds the app). Until then `check`
builds unsigned and `sim`/`mac` sign to run locally. The restricted entitlements (associated domains, the App Group,
the Keychain group, push) are in the Release files only on the Mac (`Mac/BrainDogMac.entitlements`); macOS kills a
locally signed app that claims them. A native passkey needs a team-signed build and the AASA live on brain.dog.
