import BrainDogKit
import QuickLook
import SwiftUI

/// BrainDog for Mac (plan 3.4, M6), in the Tauri shell's place: one native window with native Sign in, then the web desk
/// in native mode (its own rail and bar, the traffic lights in the bar's row, the bar's empty part moving the window);
/// the menus and their keys; a Settings window; Tell in a small window of its own; the count in the menu bar and on the
/// Dock. Widgets, the share extension and Siri come from the shared targets (M5).
@main
struct BrainDogMac: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @State private var session = Session.shared
    @State private var model = MacModel.shared

    init() {
        Typeface.register()
    }

    var body: some Scene {
        Window("BrainDog", id: "main") {
            MainWindow().modifier(MacHandoff()).modifier(FollowLook())
        }
        .windowStyle(.hiddenTitleBar)
        .defaultSize(width: 1440, height: 900)
        .commands { Menus(model: model, session: session) }

        Window(Words.tellTitle, id: "tell") {
            TellWindow()
                .modifier(FollowLook())
        }
        .windowResizability(.contentSize)
        .defaultPosition(.top)

        Settings {
            SettingsView()
        }

        #if DEBUG
        /* The menu bar's panel in a window of its own, for the screenshot walk (`--press go:menubar`). */
        Window("Menu bar", id: "menubar-shot") {
            MenuBarPanel()
        }
        .windowResizability(.contentSize)
        #endif

        /* SIGNED OUT THE EXTRA IS ONLY HIDDEN: SwiftUI writes back what it was told, and a signed-out launch turned the person's
           own setting off for good. */
        MenuBarExtra(isInserted: Binding(get: { model.inMenuBar && session.signedIn }, set: { if session.signedIn { model.inMenuBar = $0 } })) {
            MenuBarPanel()
        } label: {
            MenuBarLabel(count: model.count)
        }
        .menuBarExtraStyle(.window)
    }
}

/// The app stays open with its window closed while the menu bar holds the count; the Dock's icon opens the window again.
final class AppDelegate: NSObject, NSApplicationDelegate {

    func applicationDidFinishLaunching(_ notification: Notification) {
        #if DEBUG
        /* `-braindogAppearance light|dark`: the screenshot walk draws both without changing this Mac's own setting. */
        switch UserDefaults.standard.string(forKey: "braindogAppearance") {
        case "dark": NSApp.appearance = NSAppearance(named: .darkAqua)
        case "light": NSApp.appearance = NSAppearance(named: .aqua)
        default: break
        }
        /* A QUIET WALK'S WINDOWS ARE CLEAR FROM THE MOMENT THEY SHOW (`Links.hide`). */
        if MacModel.quiet {
            NotificationCenter.default.addObserver(forName: NSWindow.didUpdateNotification, object: nil, queue: .main) { _ in
                MainActor.assumeIsolated {
                    for window in NSApp.windows where window.isVisible && window.alphaValue > 0.02 {
                        window.alphaValue = 0.02
                        window.ignoresMouseEvents = true
                    }
                }
            }
        }
        #endif
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        !MacModel.shared.inMenuBar
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows: Bool) -> Bool {
        if !hasVisibleWindows { MacModel.shared.openWindow?("main") }
        return true
    }
}

/// The window: Sign in, or the desk, with the chrome put on the window it is in.
struct MainWindow: View {
    @State private var session = Session.shared
    @State private var model = MacModel.shared
    @Environment(\.openWindow) private var openWindow
    @Environment(\.openSettings) private var openSettings
    @State private var chrome = WindowChrome()

    var body: some View {
        ZStack {
            if session.signedIn {
                WebView(model.desk).ignoresSafeArea()
                LaunchCover(screen: model.desk).ignoresSafeArea()
                if model.desk.offline { MacOffline { model.desk.reload() }.ignoresSafeArea() }
            } else {
                SignInView().frame(minWidth: 480, minHeight: 560)
            }
        }
        .frame(minWidth: 900, minHeight: 600)
        .background(Palette.board)
        .background(WindowReader { chrome.take($0) })
        .animation(.easeOut(duration: 0.2), value: session.signedIn)
        .quickLookPreview($model.previewing)
        .onAppear {
            model.openWindow = { id in openWindow(id: id) }
            model.openSettings = { openSettings() }
            model.start()
        }
        .onChange(of: session.signedIn) { _, now in
            if now { Task { await model.read() } } else { model.forget() }
        }
        .onOpenURL { url in Links.open(url) }
        /* A UNIVERSAL LINK (app.brain.dog/decide/…, /p/…, /r/…, an invitation, the sign-in link) arrives as a web visit. */
        .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
            if let url = activity.webpageURL { Links.open(url) }
        }
        .task { await session.refreshIfDue() }
        #if DEBUG
        .task { await DebugPress.onLaunch { path, _ in Links.debug(path) } }
        #endif
    }
}

/// Where a `braindog://` address or a link to the app goes on the Mac.
@MainActor
enum Links {
    static func open(_ url: URL) {
        let model = MacModel.shared
        if url.path == "/signin" {
            Task { await SignInFlow.shared.open(link: url) }
            return
        }
        /* ONLY THE APP'S OWN NAMES: brain.dog and app.brain.dog in a universal link, the seed's in a Debug build. */
        if url.scheme == "https" || url.scheme == "http" {
            guard let host = url.host, host == Server.host || host == "app.brain.dog" || host == "brain.dog" else {
                NSWorkspace.shared.open(url)
                return
            }
        }
        if url.scheme == "braindog", url.host == "quick" {
            QuickPanel.shared.show()
            return
        }
        if url.scheme == "braindog", url.host == "tell" {
            let text = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "text" })?.value ?? ""
            model.openTell(prefill: text)
            return
        }
        let path: String? = url.scheme == "braindog"
            ? URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "path" })?.value
            : url.path + (url.query.map { "?\($0)" } ?? "")
        guard let path, path.hasPrefix("/"), !path.hasPrefix("//"), !path.hasPrefix("/api/"), !path.hasPrefix("/auth/") else { return }
        model.go(path)
    }

    #if DEBUG
    /// A Debug launch press's `go:` (`tools/build.mjs mac --press go:…`): an address, or `tell:<words>`, `settings`,
    /// `menubar` (the panel's own view in a window), each step three seconds after the last when joined by `;;`.
    static func debug(_ steps: String) {
        Task { @MainActor in
            for (i, step) in steps.components(separatedBy: ";;").enumerated() {
                if i > 0 { try? await Task.sleep(for: .seconds(3)) }
                let model = MacModel.shared
                hide()
                switch step {
                case let s where s.hasPrefix("tell:"): model.openTell(prefill: String(s.dropFirst(5)).replacingOccurrences(of: "|", with: "\n"))
                case "settings": model.openSettings?()
                case let s where s.hasPrefix("settings:"):
                    SettingsTabs.chosen = String(s.dropFirst(9))
                    model.openSettings?()
                case let s where s.hasPrefix("quick:"):
                    /* `quick:tell:<lines>`, `quick:search:<words>`, `quick:add` (Enter in Tell). */
                    let rest = String(s.dropFirst(6))
                    if rest == "add" { await QuickPanel.shared.model.enter(); break }
                    let parts = rest.split(separator: ":", maxSplits: 1).map(String.init)
                    let words = (parts.count > 1 ? parts[1] : "").replacingOccurrences(of: "|", with: "\n")
                    QuickPanel.shared.show(mode: parts.first == "search" ? .search : .tell, text: words)
                case let s where s.hasPrefix("offlineshot:"):
                    /* The offline page as the window draws it at 1512 wide (AppKit's own cache draws a SwiftUI window empty). */
                    Shots.view(MacOffline {}.frame(width: 1512, height: 945).environment(\.font, Typeface.body), name: String(s.dropFirst(12)))
                case let s where s.hasPrefix("quickshot:"):
                    Shots.other(titled: "Quick panel", name: String(s.dropFirst(10)))

                case let s where s.hasPrefix("dropshot:"):
                    Shots.view(TellWindow().overlay { DropRing() }.frame(width: 520, height: 420).environment(\.font, Typeface.body), name: String(s.dropFirst(9)))
                case "menubar": model.openWindow?("menubar-shot")
                case "search": model.desk.emit("search")
                case let s where s.hasPrefix("shot:"): await Shots.window(String(s.dropFirst(5)))
                case let s where s.hasPrefix("panel:"):
                    Shots.view(MenuBarPanel().environment(\.font, Typeface.body), name: String(s.dropFirst(6)))
                case let s where s.hasPrefix("window:"):
                    let parts = s.dropFirst(7).split(separator: "=", maxSplits: 1).map(String.init)
                    if parts.count == 2 { Shots.other(titled: parts[0], name: parts[1]) }
                case let s where s.hasPrefix("size:"):
                    let wh = s.dropFirst(5).split(separator: "x").compactMap { Double($0) }
                    if wh.count == 2, let w = model.desk.webView.window { w.setFrame(NSRect(x: w.frame.minX, y: w.frame.minY, width: wh[0], height: wh[1]), display: true); w.center() }
                default: model.go(step)
                }
            }
        }
    }

    /// A QUIET WALK DRAWS ITS WINDOWS WHERE NOBODY SEES THEM: in front, so WebKit and AppKit draw them as they would on
    /// screen, but clear and deaf to the mouse, so the person at this Mac sees and clicks only what they were using.
    static func hide() {
        guard MacModel.quiet else { return }
        for window in NSApp.windows where window.isVisible || window === MacModel.shared.desk.webView.window {
            window.alphaValue = 0.02
            window.ignoresMouseEvents = true
            window.orderFrontRegardless()
        }
    }
    #endif
}

/// The menus (plan M6, Menus): the app's, File, Edit and Window as the system makes them, View, Go and Help.
struct Menus: Commands {
    let model: MacModel
    let session: Session
    let hotKey = HotKey.shared

    /// The quick panel, with its global keys shown when they are held (they work from any app; here they are a reminder).
    @ViewBuilder private var quickItem: some View {
        if let shortcut = hotKey.shortcut, hotKey.state == .on, let key = shortcut.keyEquivalent {
            Button("Quick Panel") { QuickPanel.shared.toggle() }
                .keyboardShortcut(key, modifiers: shortcut.menuModifiers)
        } else {
            Button("Quick Panel") { QuickPanel.shared.toggle() }
        }
    }

    var body: some Commands {
        CommandGroup(after: .appInfo) {
            Button("Check for Updates…") { Updates.shared.check() }
                .disabled(!Updates.shared.canCheck)
        }
        CommandGroup(after: .appSettings) {
            Toggle("Open at Login", isOn: Binding(get: { model.opensAtLogin }, set: { model.setOpensAtLogin($0) }))
            if session.signedIn {
                Divider()
                Button(Words.signOut) { Task { await session.signOut() } }
            }
        }
        CommandGroup(replacing: .newItem) {
            Button("New Tell…") { model.openTell() }
                .keyboardShortcut("n")
                .disabled(!session.signedIn)
            quickItem
                .disabled(!session.signedIn)
        }
        CommandGroup(replacing: .toolbar) {
            Button("Reload") { model.desk.reload() }.keyboardShortcut("r")
            Divider()
            /* THE RAIL'S OWN CONTROL, pressed: the web keeps whether it is folded. */
            Button("Toggle Sidebar") { model.toggleRail() }
                .keyboardShortcut("s", modifiers: [.control, .command])
                .disabled(!session.signedIn)
            Divider()
            Button("Actual Size") { model.zoom = 1 }.keyboardShortcut("0")
            Button("Zoom In") { model.zoomIn() }.keyboardShortcut("=")
            Button("Zoom Out") { model.zoomOut() }.keyboardShortcut("-")
            Divider()
        }
        CommandMenu("Go") {
            Button(Words.back) { model.back() }.keyboardShortcut("[")
            Button("Forward") { model.forward() }.keyboardShortcut("]")
            Divider()
            /* TODAY ⌘1, NEEDS YOU ⌘2, then the web's own places and the record's pages, ⌘3 to ⌘9 while they last. */
            ForEach(Array(model.places.enumerated()), id: \.element.id) { i, place in
                if i < 9 {
                    Button(place.label) { model.go(place.href) }.keyboardShortcut(KeyEquivalent(Character(String(i + 1))))
                } else {
                    Button(place.label) { model.go(place.href) }
                }
            }
            .disabled(!session.signedIn)
            Divider()
            Button("Settings in BrainDog") { model.go("/settings") }
                .keyboardShortcut(",", modifiers: [.command, .option])
                .disabled(!session.signedIn)
            Divider()
            Button("Search or Go To…") { model.front(); model.desk.emit("search") }.keyboardShortcut("k")
            Button("Ask…") { model.front(); model.desk.emit("slash") }.keyboardShortcut("j")
        }
        CommandGroup(replacing: .help) {
            Button("BrainDog Help") { NSWorkspace.shared.open(URL(string: "https://brain.dog/docs")!) }
            Button("Contact Support") { NSWorkspace.shared.open(URL(string: "https://brain.dog/support")!) }
        }
    }
}
