# BrainDog for iPhone and Mac

Two native SwiftUI shells, built from one XcodeGen project, with the live web app inside them as the long tail. The
plan is `loop/plans/apps-2026-11-02/PLAN.md`; what each milestone did is beside it (`M01.md`, ...). The decisions are
`docs/55-DESKTOP-APP.md`.

| Target | Bundle id | What |
|---|---|---|
| `BrainDog` | `dog.brain.app` | the iPhone (and iPad) app |
| `BrainDogMac` | `dog.brain.desktop` | the Mac app (the id the Tauri shell held, kept) |
| `WidgetsiOS`, `WidgetsMac` | `….widgets` | WidgetKit (M5) |
| `ShareiOS`, `ShareMac` | `….share` | the share extension (M5) |
| `NotifyService` | `dog.brain.app.notify` | the notification service extension (M4) |
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

The screenshot walk: `node apps/apple/tools/shots.mjs m2` (or `m3`) relaunches the signed-in app on the booted
simulator once per screen, light and dark, and saves each to `~/Developer/braindog/.notes/shots/apps/<milestone>/`.
Each screen is reached by a Debug launch press (`-braindogPress go:…`, `BrainDogApp.swift`), which calls what the
screen's own control calls; a Release build has none of it.

## The iPhone app

- **Tabs**: the web's first four places (`places`, from `tabsOf`), kept for the next launch, and Search or go to as the
  search tab. Needs you is native with its count; every other tab is a native stack of web screens.
- **Stacks**: a link pressed in a page becomes a native push (`shell.visit`, from `AppFrame.svelte`), taken from a warm
  web view (`WebPool`). At most four live per stack; deeper screens sleep with their picture and reload on the way back.
  A pushed screen's back and name are drawn by the app (no glass); the system's edge swipe back is kept (`SwipeBack`).
- **Native moments**: Needs you (swipe right gives the suggested answer, left puts it off, a tap opens the card),
  Tell (the tab bar's accessory; read on the device by `tell-core.js`, one `capture`, Undo), Search, Account (every
  BrainDog with its role, switch, Settings, Sign out), the Settings root.
- **Offline**: web screens use the service worker's kept copy (App-Bound Domains); a screen never kept says so with
  Try again; Needs you shows its last read and when. Tell offline keeps the words as a draft and sends nothing.

## Generated, never by hand

| File | From | Script |
|---|---|---|
| `Packages/BrainDogKit/Sources/BrainDogKit/Resources/Colours.xcassets`, `Look/Tokens.generated.swift`, `Assets.xcassets` colours | `packages/theme` (`HOUSE.frame`) | `tools/tokens.mjs` |
| `Resources/Icons.xcassets`, `Look/Glyph.generated.swift` | `apps/web/src/lib/ui/icons.ts`, `packages/skin/mark.ts` | `tools/icons.mjs` |
| `BrainDog.icon` (Icon Composer) | `packages/skin/mark.ts`, the palette | `tools/app-icon.mjs` |
| `Resources/tell-core.js` | `apps/web/src/lib/tell/native.ts` (the web's reader) | `tools/tell-core.mjs` |

Each takes `--check` and fails when its output is not what its source makes now. A view never writes a colour.

## Fonts

`Resources/Fonts` holds the OFL TTFs (the web's woff2 files cannot be registered on iOS), each with its licence beside
it, as the SIL Open Font License 1.1 asks:

- `Lexend-SemiBold.ttf`: Lexend, © 2018 The Lexend Project Authors (googlefonts/lexend), OFL 1.1 (`OFL-Lexend.txt`).
- `Geist[wght].ttf`: Geist, variable weight, © 2024 The Geist Project Authors (vercel/geist-font), OFL 1.1 (`OFL-Geist.txt`).
- `GeistMono.ttf`: Geist Mono, variable weight, © 2024 The Geist Project Authors, OFL 1.1 (`OFL-GeistMono.txt`).

Fetched once on 2 November 2026 from `github.com/google/fonts` (Geist, Geist Mono) and `github.com/googlefonts/lexend`.

## Signing

Nothing signs with the team until Xcode is signed in to it (Settings › Accounts, sam@avery.example). Until then `check`
builds unsigned and `sim`/`mac` sign to run locally. The restricted entitlements (associated domains, the App Group,
the Keychain group, push) are in the Release files only on the Mac (`Mac/BrainDogMac.entitlements`); macOS kills a
locally signed app that claims them. A native passkey needs a team-signed build and the AASA live on brain.dog.
