# 55 · The Mac and iPhone apps

**PLAN**, rewritten 2 November 2026 from `loop/plans/apps-2026-11-02/PLAN.md` (the owner: "super perfect UI", a macOS
app and an iPhone app). It replaces the 17 October plan for a Tauri Mac app, which is kept in git history; `apps/desktop`
stays as the future Windows and Linux shell and is never published.

## The shape: one web app, native shells, native moments

Both apps are **native SwiftUI shells built from one Xcode project, `apps/apple`**, and the live web app at
`app.brain.dog` runs inside them as the long tail. Every declared page (Today, Projects, Money, lists, add-on pages,
card details, settings areas) stays the Svelte app, so each web deploy reaches both apps and the browser at once.

What makes an app feel native is real Apple UI: the Liquid Glass tab bar (the only glass), navigation stacks with the
interactive swipe back, sheets, haptics, passkeys with Face ID, push with answer buttons, widgets, Control Center,
Shortcuts and Siri, the share sheet, and on the Mac the menu bar, the ⌥Space panel and the Dock. The moments people use
most on a phone are native screens: **Tell**, **Needs you**, **Search or go to**, **Sign in**, and the **Account and
Settings root**.

## Why SwiftUI and not Tauri, Capacitor or Expo

- **Tauri v2 mobile and Capacitor** are one web view each: no native tab bar or stack without fighting the framework,
  and both read as a wrapped site to App Review (4.2).
- **Expo / React Native** gives native tabs but reuses none of the Svelte UI: Today, Money and every declared page would
  be rewritten, or shown in a web view inside a JavaScript shell. One app of this team chose it for a WebGPU renderer; BrainDog's
  product is the declared-page web app.
- **SwiftUI with WKWebView** keeps every declared page as it is, makes widgets, share, notification and intents
  first-class targets sharing one Swift package, gives `ASAuthorization` passkeys and a Keychain shared with the
  extensions, and builds the Mac app from the same project (about 70% shared). The one TypeScript piece the native
  screens need, the Tell reader (`apps/web/src/lib/tell/read.ts`), is pure, so it runs in JavaScriptCore with no web view.
- **On the Mac, SwiftUI replaces Tauri before Tauri ships.** Same engine and same page; what Tauri cannot do (push when
  closed, desktop widgets, a share extension, App Intents, notification actions, a native Tell panel) is exactly what
  the Mac app now has to do. Nothing to migrate: nobody has the Tauri app. Carried over from it: the bridge contract,
  the desktop sign-in flows, the AASA, the menu design, the offline page and the R2 publish path.

## The project (`apps/apple`)

- `project.yml` (XcodeGen; the `.xcodeproj` is generated and never committed), `Packages/BrainDogKit` (the client, the
  session, sign-in, the bridge, the web screen, Look B, Tell, and later Needs you, glance and intents), `iOS/`, `Mac/`,
  `Widgets/`, `Share/`, `NotifyService/`, and `tools/`.
- Ids: iPhone `dog.brain.app` (+ `.widgets`, `.share`, `.notify`); Mac `dog.brain.desktop` (+ `.widgets`, `.share`).
  App Group `group.dog.brain` (team-prefixed on the Mac); Keychain group `$(AppIdentifierPrefix)dog.brain.shared`.
- iOS 26 at least (Liquid Glass, the tab bar accessory, the search tab), macOS 14 at least.
- The team is Quartz Apps LLC, `MG86668Z52`, shared with other apps of the same team. Its App Store Connect key and APNs key are team-wide.
- **Generated, never by hand**: colours from `packages/theme` (`tools/tokens.mjs`, colour sets and
  `Tokens.generated.swift`), glyphs from `lib/ui/icons.ts` (`tools/icons.mjs`), the app icon from the mark
  (`tools/app-icon.mjs`, an Icon Composer document, flat, glass and specular off), and `tell-core.js` from the web's
  reader (`tools/tell-core.mjs`). Fonts are the OFL TTFs of Lexend SemiBold, Geist and Geist Mono, bundled with their
  licences.

## The bridge: one door, three shells

`window.__BRAINDOG_SHELL__` (`apps/web/src/lib/shell.ts`) stays the single door. It gains `kind: 'mac' | 'ios'` and
`visit`, `title`, `ready`, `haptic`, `share`, `tell`, `ask`, `pushAsk`, `signedOut`, `places` and `textScale`, beside the
existing `open`, `notify`, `badge`, `inset` and `on` (with `refresh` added to the events). The script is injected only on
the app's origin and the main frame, and the handler checks both again. In kind `ios` the web draws no top bar, tab
bar, rail, back edge, phone hints or install card, haptics play at the toast, an answer, a capture and a refusal, billing
is a plain line ("Your plan is managed at brain.dog", App Store 3.1.1), and notifications are asked for natively. Every
change is behind the kind: a browser is unchanged.

## The iPhone

- **Tabs**: a `TabView` of his first four places (`tabsOf`), and a fifth search tab, Search or go to. Needs you carries
  its count. Tell lives in the tab bar's accessory.
- **Stacks**: each tab a navigation stack of one web view per screen from a warm pool, so a link press becomes a native
  push (`visit`) and swipe back is exact; at most four live per stack.
- **Bars and sheets**: opaque `--nav` bars with the title in Lexend 600 at 22 and a `--rule` hairline, no glass on bar
  buttons; sheets on `--tile`, radius 16. The launch shows the last Today snapshot until the page says it has drawn.
- **Native vs web**: Sign in, Needs you's list, Tell, Search, Account and the Settings root are native; everything else
  is the web.

## The Mac

Hidden title bar with the traffic lights in the web's top bar (inset 78), real menus (Reload, zoom, Go ⌘1/⌘2, ⌘K, ⌘J,
⌘,), a menu bar extra with Tell and the top of Needs you, the ⌥Space panel, the Dock badge, notifications with actions,
open at login, and Sparkle updates published to `download.brain.dog`.

## Sign in once, natively

1. **Passkey with Face ID**, the primary way: `ASAuthorization` against the relying party `brain.dog`, the same Directory
   ceremony the web uses. The native client data's origin is `https://brain.dog`, which the Directory accepts beside the
   web's (`rp.origins`). Needs `webcredentials` for both names in both apps and the AASA naming both apps
   (`apps/worker/src/apple.ts`, `APPLE_TEAM_ID`).
2. **Email link and code.** The app sends its PKCE challenge with the link request; the letter carries the link with
   `?app=` and a six-digit code bound to that challenge (ten minutes, five tries). The link is a universal link that
   opens the app (`/auth/app/handoff`, then `/auth/app`); the code, typed in the app, goes to `/auth/app/code`. Both
   need the verifier only the app holds.
3. **Google**: the Mac only in v1 (`ASWebAuthenticationSession`, the existing desktop flavour). Left off the iPhone so
   guideline 4.8 does not apply; Google and Sign in with Apple come to it together later.
4. **App Review**: a review code behind a flag, opening the `maya-demo` BrainDog, on only during review.

**One app session** for the web view, the native screens and the extensions: a Directory session of kind `app` with a
device label ("iPhone, BrainDog app"), listed in Settings › Signing in and endable there. Its id lives in the shared
Keychain, goes out as the `__Host-bd_s` cookie with `Origin: https://app.brain.dog` exactly as the web sends it, and is
put in the web view's cookie store before the first load. App sessions are not rotated on read; the app rotates its own
once a day (`/auth/app/refresh`, the old id good for five minutes). A 401 anywhere means native sign-in; the web's
sign-in page never shows in an app. The `/auth/desktop` routes are kept for the old flow.

## Push, offline, Tell everywhere, widgets

- **Push**: APNs straight from the Worker (a port of a sender this team already runs) beside Web Push, content-free through Apple; the
  notification service extension reads the question over TLS with the app session and writes its real line and up to
  two answers. Asked for natively the first time Needs you holds something.
- **Offline**: read-only, nothing queued, as `lib/data/offline.ts` says. Tell offline keeps the typed text as a draft.
- **Tell**: one composer (Tell and Ask) reading each line on the device with the web's own reader, drawing "That
  becomes", and adding in one batch with Undo. It opens from the tab bar accessory, Control Center, a widget, Siri, the
  share sheet, and on the Mac ⌥Space and the menu bar.
- **Widgets and intents**: Needs you, Due next, any Today widget with a native drawing, and Tell; Tell BrainDog, What
  needs me and Open a place as App Shortcuts; Handoff by the page's address.

## The order

M0 the scaffold; M1 foundations (app sessions, the native passkey origin, the AASA, native mode in the web, the kit, the
Tell core, native Sign in); M2 the iPhone shell; M3 its native moments; M4 push; M5 outside the app; M6 the Mac app (in
parallel from M2); M7 the "perfect" pass on both platforms and his own record; M8 ship. Every milestone ends with
simulator screenshots in both themes, judged against `loop/DESIGN-SYSTEM.md`, and only one iOS simulator is ever booted.

## Not in v1

Google and Sign in with Apple on the iPhone; Live Activities; a watch app; the Mac App Store; Windows and Linux (the
kept Tauri project); native Today or Money pages; writes queued offline.

## Done when

- A person installs either app, signs in once with a passkey or their email, and lands on their record, with the web
  never asking them to sign in again inside the app.
- A web deploy shows up in both apps without an app update.
- Needs you answers from a notification, Tell adds from anywhere, and the widgets read without opening the app.
- The layout and accessibility gates still pass in WebKit and Chromium, and the browser is unchanged.
