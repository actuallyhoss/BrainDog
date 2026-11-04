import BrainDogKit
import CoreSpotlight
import SwiftUI

/// BrainDog for iPhone (plan 3.3). Native Sign in; then the tab bar of his places with a native stack per tab around
/// the web's screens, Needs you and Tell drawn natively, Search or go to, and the Account sheet with Settings.
@main
struct BrainDogApp: App {
    @Environment(\.scenePhase) private var phase
    /// Push, its Accept and Later, and the Home Screen's press-and-hold come through the delegate (`Doors.swift`).
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @State private var lock = Lock.shared
    @State private var awayAt: Date?

    init() {
        Typeface.register()
        Bars.dress()
        /* WHAT SIRI AND SHORTCUTS OPEN (`Shared/Intents.swift`): Tell with words in it, or a place. */
        AppDoor.tell = { words in AppModel.shared.openTell(prefill: words) }
        AppDoor.open = { path in AppModel.shared.open(path) }
    }

    var body: some Scene {
        WindowGroup {
            Root()
                .modifier(FollowLook())
                .onOpenURL { url in Task { await Links.open(url) } }
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                    if let url = activity.webpageURL { Task { await Links.open(url) } }
                }
                /* HANDOFF FROM THE MAC APP, and a Spotlight result (M5). */
                .onContinueUserActivity(Handoff.type) { activity in Task { await Handoff.continued(activity) } }
                .onContinueUserActivity(CSSearchableItemActionType) { activity in Spotlight.continued(activity) }
                .overlay {
                    if lock.covered { LockCover().transition(.opacity) }
                }
                .onReceive(NotificationCenter.default.publisher(for: UIContentSizeCategory.didChangeNotification)) { _ in
                    AppModel.shared.rescale()
                }
        }
        .onChange(of: phase) { was, now in
            /* LOCKED OR NOT, THE SWITCHER'S PICTURE IS THE COVER while Face ID lock is on (M5). */
            if now == .active { lock.cameBack() } else { lock.wentAway() }
            guard Session.shared.signedIn else { return }
            switch now {
            case .active:
                /* THE SESSION ROTATES HERE AND ONLY HERE, once a day (plan 3.6), and what waits is read again. */
                Task {
                    await Session.shared.refreshIfDue()
                    if was == .background { await AppModel.shared.needs.read() }
                }
                /* BACK AFTER HALF AN HOUR: the tabs take any change the web named meanwhile (M23's settle rule). */
                if let awayAt, Date().timeIntervalSince(awayAt) >= 30 * 60 { AppModel.shared.settlePlaces() }
                awayAt = nil
            case .inactive where was == .active:
                /* THE LAUNCH PICTURE: Today as it is now, laid over Today at the next cold start until it has drawn. */
                Task { await AppModel.shared.keepLaunchPicture() }
            case .background:
                awayAt = awayAt ?? Date()
                /* AND THE WIDGETS GET WHAT IS TRUE NOW, as the app goes (plan 3.10). */
                Task { await GlanceStore.refresh() }
            default:
                break
            }
        }
    }
}

/// Signed in, the app; signed out, Sign in. A 401 anywhere flips it back, and the web's sign-in page never shows.
struct Root: View {
    @State private var session = Session.shared

    var body: some View {
        ZStack {
            if session.signedIn {
                Shell()
                    .transition(.opacity)
            } else {
                SignInView()
                    .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.2), value: session.signedIn)
        .tint(Palette.ink)
        .onChange(of: session.signedIn) { _, now in
            if !now { AppModel.shared.forget() }
        }
        #if DEBUG
        .task {
            LaunchMark.say("root")
            await Links.pressOnLaunch()
        }
        #endif
    }
}

/// Where a universal link or a `braindog://` address goes.
@MainActor
enum Links {
    static func open(_ url: URL) async {
        if url.scheme == "https", url.path == "/signin" {
            await SignInFlow.shared.open(link: url)
            return
        }
        /* `braindog://tell` (the Tell widget, a Home Screen action): Tell, with `?text=` in it when given. */
        if url.scheme == "braindog", url.host == "tell" {
            guard Session.shared.signedIn else { return }
            let text = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "text" })?.value ?? ""
            AppModel.shared.openTell(prefill: text)
            return
        }
        /* `braindog://open?path=/money` and a universal link to a page (`/decide/SG4`, `/p/money`, `/r/tasks/3`,
           `/invite/…`): the page, in the tab it belongs to, once signed in. The AASA never names the API. */
        let path: String? = url.scheme == "braindog"
            ? URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "path" })?.value
            : url.path + (url.query.map { "?\($0)" } ?? "")
        guard let path, path.hasPrefix("/"), !path.hasPrefix("//"), !path.hasPrefix("/api/"), !path.hasPrefix("/auth/") else { return }
        AppModel.shared.open(path)
    }
}

#if DEBUG
extension Links {
    /// Sign in's buttons pressed from the launch line (`DebugPress`); `go:` takes a step, or several joined by `;;`, each
    /// three seconds after the last, for the screenshot walk on a simulator nobody sits at. Each step calls what the
    /// control calls: an address opens as a universal link would; `tab:<href>` selects a tab; `tell:<lines|…>` and
    /// `ask:<words>` open the sheet; `tellAdd` presses Add; `account`, `settings`; `search:<words>`; `click:<css>` presses a
    /// link in the page on top, `see:<css>` scrolls to a part of it, `end` to its foot (the web's own click, so a link becomes a native push); `answer` gives the first quick
    /// answer in Needs you; `later` opens the first question's Later; `pop` goes back one.
    static func pressOnLaunch() async {
        await DebugPress.onLaunch { path, y in
            Task { @MainActor in
                for (i, step) in path.components(separatedBy: ";;").enumerated() {
                    if i > 0 { try? await Task.sleep(for: .seconds(3)) }
                    await press(step, y: y)
                }
            }
        }
    }

    private static func press(_ step: String, y: Double?) async {
        let app = AppModel.shared
        switch step {
        case let p where p.hasPrefix("tab:"): app.select(String(p.dropFirst(4)), toRoot: true)
        case "tell:":
            app.tell.text = ""
            app.openTell()
        case let p where p.hasPrefix("tell:"): app.openTell(prefill: String(p.dropFirst(5)).replacingOccurrences(of: "|", with: "\n"))
        case let p where p.hasPrefix("ask:"): app.openTell(prefill: String(p.dropFirst(4)), mode: .ask)
        case let p where p.hasPrefix("search:"): app.selected = "search"; app.searchText = String(p.dropFirst(7))
        case let p where p.hasPrefix("click:"):
            let css = String(p.dropFirst(6)).replacingOccurrences(of: "'", with: "\\'")
            _ = try? await app.current?.top?.webView.evaluateJavaScript("document.querySelector('\(css)')?.click()")
        case let p where p.hasPrefix("see:"):
            let css = String(p.dropFirst(4)).replacingOccurrences(of: "'", with: "\\'")
            _ = try? await app.current?.top?.webView.evaluateJavaScript("document.querySelector('\(css)')?.scrollIntoView({block: 'center'})")
        case let p where p.hasPrefix("offset:"):
            /* How the page sits pulled past its top or foot, for a shot of what shows behind it. */
            let y = Double(p.dropFirst(7)) ?? 0
            app.current?.top?.webView.scrollView.setContentOffset(CGPoint(x: 0, y: y), animated: false)
        case "refreshing":
            /* The pull's spinner as a pull leaves it, for a shot on a simulator nobody can pull. */
            guard let scroll = app.current?.top?.webView.scrollView else { break }
            scroll.refreshControl?.beginRefreshing()
            scroll.setContentOffset(CGPoint(x: 0, y: -80), animated: false)
        case let p where p.hasPrefix("js:"):
            let result = try? await app.current?.top?.webView.evaluateJavaScript(String(p.dropFirst(3)))
            let scroll = app.current?.top?.webView.scrollView
            LaunchMark.say("js \(String(describing: result)) offset \(scroll?.contentOffset.y ?? -1) safe \(app.current?.top?.webView.safeAreaInsets.top ?? -1) foot \(app.current?.top?.webView.safeAreaInsets.bottom ?? -1)")
        case "end": _ = try? await app.current?.top?.webView.evaluateJavaScript("window.scrollTo(0, document.documentElement.scrollHeight)")
        case "account": app.accountOpen = true
        case "widgets": app.gallery = .widgets
        case "widgets2": app.gallery = .widgets2
        case "attach": app.gallery = .attach
        case "lock": Lock.shared.coverForShot()
        case let p where p.hasPrefix("quick:"): QuickActions.run("dog.brain." + String(p.dropFirst(6)))
        case "tellLink": await Links.open(GlanceLink.tell)
        case let p where p.hasPrefix("share:"):
            /* The share sheet's own view over the app, with what a share would bring (`share:<words>|<photo>`). */
            app.gallery = .share(String(p.dropFirst(6)))
        case "settings": app.current?.path.append(.settings)
        case "tellAdd": await app.tell.press()
        case "pop": _ = app.current?.path.popLast()
        case "answer":
            if let q = app.needs.needs.open.first(where: { $0.quickAnswer != nil }), let option = q.quickAnswer { await app.needs.answer(q, with: option) }
        case "later": app.needs.putting = app.needs.needs.open.first
        case "openFirst": if let q = app.needs.needs.open.first { app.needs.onOpen?("/decide/\(q.id)") }
        default:
            app.open(step)
            if let y {
                try? await Task.sleep(for: .seconds(3))
                app.current?.top?.webView.scrollView.setContentOffset(CGPoint(x: 0, y: y), animated: false)
            }
        }
    }
}
#endif

/// The navigation bar in the ops look: the system's own Liquid Glass, so the page runs under it and its buttons float as
/// glass, with no hairline; only the title's face and the inks are BrainDog's (Plus Jakarta Sans 600 at 22).
enum Bars {
    static func dress() {
        let bar = UINavigationBarAppearance()
        /* NO BACKGROUND OF ITS OWN AT ANY SCROLL: the system's soft edge over the page is the whole of it on iOS 26. */
        bar.configureWithTransparentBackground()
        bar.shadowColor = .clear
        bar.titleTextAttributes = [.font: Typeface.navTitleFont(), .foregroundColor: PlatformPalette.ink]
        bar.largeTitleTextAttributes = [.font: Typeface.navTitleFont(), .foregroundColor: PlatformPalette.ink]
        let back = UIBarButtonItemAppearance()
        back.normal.titleTextAttributes = [.foregroundColor: PlatformPalette.ink2]
        bar.backButtonAppearance = back
        let nav = UINavigationBar.appearance()
        nav.standardAppearance = bar
        let edge = bar.copy()
        edge.configureWithTransparentBackground()
        edge.shadowColor = .clear
        edge.titleTextAttributes = bar.titleTextAttributes
        edge.largeTitleTextAttributes = bar.largeTitleTextAttributes
        edge.backButtonAppearance = back
        nav.scrollEdgeAppearance = edge
        nav.compactAppearance = bar
        nav.compactScrollEdgeAppearance = bar
        nav.tintColor = PlatformPalette.ink2
    }
}
