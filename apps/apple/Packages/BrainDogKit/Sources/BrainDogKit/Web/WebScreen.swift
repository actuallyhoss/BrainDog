import Observation
import SwiftUI
import WebKit
#if os(iOS)
import UIKit
#else
import AppKit
#endif

/// One screen of the web app: a WKWebView on the app's origin, with the session in its cookies and the bridge in its
/// page, and what the page asked of the app handed to whoever drew it.
///
/// NO WHITE FLASH, NO SPINNER (plan 3.3, Launch). The view's ground is the board from the first frame, and a cover sits
/// over the page until the page says it has drawn (`ready()`, which the web calls once at first drawn), then fades in
/// 120 ms. The cover is the board's colour, or a picture of the screen as it was last drawn (`cover`): Today at launch,
/// a screen put to sleep deep in a stack. A page that never says so (an older web build) is uncovered after a few seconds.
///
/// THE SESSION GOES IN BEFORE THE FIRST LOAD, so the first request already carries it and the web never draws its own
/// sign-in page in the app; if it ever tries (`/signin`), the app takes that as signed out and signs in natively.
///
/// OFFLINE IS SAID, NOT DRAWN AS AN ERROR PAGE. A first load that cannot reach the server and has no kept copy (the
/// service worker's, plan 3.8) sets `offline`, and whoever draws the screen says so with Try again.
@Observable
public final class WebScreen: NSObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    public let kind: ShellKind
    public let webView: WKWebView
    /// True once the page has drawn, or after the wait for it ran out.
    public private(set) var ready = false
    /// The page's name, as the web says it (`title(name)`), for a native bar.
    public private(set) var title: String?
    /// The page's places (the web's `tabsOf`), for the native tab bar.
    public private(set) var places: JSONValue?
    /// The first load could not reach the server, and nothing kept could stand in.
    public private(set) var offline = false
    /// The picture over the page until it has drawn: the last Today at launch, a sleeping screen's last look.
    public var cover: PlatformImage?
    /// Asleep: its page unloaded to save memory, its picture kept, its address kept to load again (`wake`).
    public private(set) var asleep = false
    /// Asks the screen does not answer itself: share, tell, ask, notify, badge, visit, pushAsk.
    @ObservationIgnored public var onAsk: ((ShellAsk) -> Void)?
    /// A file the page handed over (an export, a backup), saved where the app can share it.
    @ObservationIgnored public var onFile: ((URL) -> Void)?

    /// The address this screen shows, kept current as the page moves in place.
    public private(set) var path: String
    private var loaded = false
    @ObservationIgnored private var saving: [ObjectIdentifier: URL] = [:]

    public init(kind: ShellKind, path: String = "/") {
        self.kind = kind
        self.path = path
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.applicationNameForUserAgent = "BrainDog/\(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1") (\(kind == .ios ? "iPhone" : "Mac"))"
        #if os(iOS)
        config.allowsInlineMediaPlayback = true
        config.dataDetectorTypes = []
        /* APP-BOUND DOMAINS (plan 3.2): the service worker runs in the app only on its own domains, which is what keeps
           the shell and the 7-day read copy offline, as in the PWA. The seed on this Mac (a Debug build) is not one. */
        config.limitsNavigationsToAppBoundDomains = !Server.isLocal
        #endif
        let controller = WKUserContentController()
        controller.addUserScript(ShellBridge.script(kind: kind, inset: kind == .mac ? MacBar.room : 0, textScale: Self.textScale))
        config.userContentController = controller
        webView = WKWebView(frame: .zero, configuration: config)
        super.init()
        /* THE BRIDGE HOLDS THE SCREEN WEAKLY, so the content controller (which keeps its handler) keeps nothing alive. */
        controller.add(ShellBridge { [weak self] ask in self?.hear(ask) }, name: ShellBridge.name)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        /* NO WEB SWIPE BACK ON THE IPHONE: each screen is its own web view in a native stack, whose swipe back is exact. */
        webView.allowsBackForwardNavigationGestures = false
        #if DEBUG
        webView.isInspectable = true
        #endif
        #if os(iOS)
        webView.isOpaque = false
        webView.backgroundColor = PlatformPalette.board
        webView.scrollView.backgroundColor = PlatformPalette.board
        webView.underPageBackgroundColor = PlatformPalette.board
        webView.scrollView.contentInsetAdjustmentBehavior = .automatic
        webView.pageZoom = Self.textScale
        let refresh = UIRefreshControl()
        refresh.addTarget(self, action: #selector(pulled(_:)), for: .valueChanged)
        webView.scrollView.refreshControl = refresh
        #else
        webView.setValue(false, forKey: "drawsBackground")
        webView.underPageBackgroundColor = PlatformPalette.board
        #endif
    }

    /// Load the screen's path once the session is in the cookie store. Again only when asked to.
    public func load() async {
        guard !loaded else { return }
        loaded = true
        asleep = false
        await WebKitStore.shared.ready()
        webView.load(URLRequest(url: Server.url(path)))
        uncoverLater()
    }

    /// Go somewhere else in the app on this screen (a deep link, a menu's Go, a warm screen handed out by the pool).
    public func go(_ path: String) {
        self.path = path
        if loaded && !asleep { emit("goto", path) } else { Task { await load() } }
    }

    /// Covered again until its next page has drawn: a warm screen handed out for a new address (`WebPool`).
    func moving(to path: String) {
        title = nil
        ready = false
        go(path)
        uncoverLater(after: .seconds(1.2))
    }

    /// Reload from the server, as the Mac's ⌘R and the offline screen's Try again do.
    public func reload() {
        offline = false
        if webView.url == nil || asleep {
            asleep = false
            loaded = true
            webView.load(URLRequest(url: Server.url(path)))
        } else {
            webView.reload()
        }
    }

    /// Tell the page something (`slash`, `search`, `goto`, `refresh`, `saved`, `unsaved`).
    public func emit(_ event: String, _ arg: String? = nil) {
        let argument = arg.map { "'\($0.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "'", with: "\\'"))'" } ?? "undefined"
        webView.evaluateJavaScript("window.__BRAINDOG_SHELL__ && window.__BRAINDOG_SHELL__.emit('\(event)', \(argument))")
    }

    /// The address the page is at now, as a path with its query (`/money?view=month`).
    public var here: String {
        guard let url = webView.url, url.host == Server.host else { return path }
        return url.path + (url.query.map { "?\($0)" } ?? "")
    }

    #if os(iOS)
    /// A picture of the page as it is drawn now.
    public func picture() async -> UIImage? {
        guard ready, webView.window != nil, webView.bounds.width > 0 else { return nil }
        return try? await webView.takeSnapshot(configuration: nil)
    }

    /// Put to sleep deep in a stack (plan 3.3, at most four live per stack): its picture kept as the cover, its page
    /// unloaded, its address kept. `wake` loads it there again when it is next on screen.
    public func sleep() async {
        guard loaded, !asleep else { return }
        if let picture = await picture() { cover = picture }
        path = here
        asleep = true
        loaded = false
        ready = false
        webView.loadHTMLString("", baseURL: nil)
    }

    /// Back on screen after sleeping: its page loaded again at the address it was at.
    public func wake() {
        guard asleep else { return }
        Task { await load() }
    }
    #endif

    private func uncover() {
        guard !ready else { return }
        withAnimation(.easeOut(duration: 0.12)) { ready = true }
    }

    /* A PAGE THAT NEVER SAYS IT DREW is uncovered anyway: four seconds is past a cold Today on a phone. */
    private func uncoverLater(after wait: Duration = .seconds(4)) {
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: wait)
            self?.uncover()
        }
    }

    private func hear(_ ask: ShellAsk) {
        switch ask {
        case .ready:
            uncover()
        case .title(let name, _):
            title = name
            /* A WARM SCREEN'S NEW PAGE HAS DRAWN WHEN IT NAMES ITSELF: its `ready()` was said for the page it booted on. */
            uncover()
        case .places(let tabs):
            places = tabs
            onAsk?(ask)
        case .haptic(let kind):
            kind.play()
        case .signedOut:
            Session.shared.lost()
        case .open(let url):
            openOutside(url)
        #if os(macOS)
        case .drag:
            /* AS A TITLE BAR DOES: the press that started it is the event AppKit is handling now, or the move just after. */
            guard let window = webView.window, let event = NSApp.currentEvent, [.leftMouseDown, .leftMouseDragged].contains(event.type) else { return }
            window.performDrag(with: event)
        case .titleBarDoubleClick:
            guard let window = webView.window else { return }
            switch UserDefaults.standard.string(forKey: "AppleActionOnDoubleClick") {
            case "Minimize": window.miniaturize(nil)
            case "None": break
            default: window.zoom(nil)
            }
        #endif
        default:
            onAsk?(ask)
        }
    }

    #if os(iOS)
    @objc private func pulled(_ control: UIRefreshControl) {
        Haptic.select.play()
        if offline { reload() } else { emit("refresh") }
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(700))
            control.endRefreshing()
        }
    }
    #endif

    /// An address that is not the app's goes outside: the in-app browser sheet where the app has one, else the browser.
    private func openOutside(_ url: URL) {
        if let onAsk, url.scheme == "https" || url.scheme == "http" {
            onAsk(.open(url))
            return
        }
        #if os(iOS)
        UIApplication.shared.open(url)
        #else
        NSWorkspace.shared.open(url)
        #endif
    }

    private func ours(_ url: URL) -> Bool {
        url.scheme == Server.origin.scheme && url.host == Server.host && url.port == Server.origin.port
    }

    // MARK: navigation

    public func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let url = action.request.url else { return .cancel }
        if action.shouldPerformDownload { return .download }
        if ["about", "blob", "data"].contains(url.scheme ?? "") { return .allow }
        guard action.targetFrame?.isMainFrame != false else { return .allow }
        if ours(url) {
            /* THE WEB'S SIGN-IN PAGE NEVER SHOWS IN THE APP: arriving there means the session is gone. */
            if url.path == "/signin" || url.path.hasPrefix("/signin/") {
                Session.shared.lost()
                return .cancel
            }
            return .allow
        }
        if action.navigationType == .linkActivated || action.targetFrame == nil {
            openOutside(url)
            return .cancel
        }
        /* Turnstile's frame and the like load inside the page; a top-level move off the app does not. */
        return action.targetFrame?.isMainFrame == true ? .cancel : .allow
    }

    public func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse) async -> WKNavigationResponsePolicy {
        /* A FILE THE PAGE CANNOT SHOW (an export, a backup) IS SAVED, never drawn as text over the screen. */
        if let http = response.response as? HTTPURLResponse,
           http.value(forHTTPHeaderField: "content-disposition")?.lowercased().hasPrefix("attachment") == true {
            return .download
        }
        return response.canShowMIMEType ? .allow : .download
    }

    public func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    public func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }

    public func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String) async -> URL? {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let name = suggestedFilename.isEmpty ? "BrainDog" : suggestedFilename
        let file = folder.appendingPathComponent(name)
        saving[ObjectIdentifier(download)] = file
        return file
    }

    public func downloadDidFinish(_ download: WKDownload) {
        guard let file = saving.removeValue(forKey: ObjectIdentifier(download)) else { return }
        onFile?(file)
        emit("saved", file.lastPathComponent)
    }

    public func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        let file = saving.removeValue(forKey: ObjectIdentifier(download))
        emit("unsaved", file?.lastPathComponent ?? "")
    }

    public func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        offline = false
    }

    public func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        let e = error as NSError
        guard e.domain == NSURLErrorDomain, e.code != NSURLErrorCancelled else { return }
        /* NOTHING REACHED THE SERVER AND NOTHING KEPT ANSWERED FOR IT: said by whoever draws the screen, with Try again. */
        offline = true
        uncover()
    }

    public func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url {
            if ours(url) {
                let path = url.path + (url.query.map { "?\($0)" } ?? "")
                if let onAsk { onAsk(.visit(path: path, mode: "push")) } else { go(path) }
            } else {
                openOutside(url)
            }
        }
        return nil
    }

    public func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }

    /// Dynamic Type as the web view's page zoom: 1.0 at Large, up to 1.35 (plan 3.2, `textScale`).
    static var textScale: Double {
        #if os(iOS)
        switch UIApplication.shared.preferredContentSizeCategory {
        case .extraSmall: return 0.9
        case .small: return 0.94
        case .medium: return 0.97
        case .large: return 1.0
        case .extraLarge: return 1.08
        case .extraExtraLarge: return 1.16
        case .extraExtraExtraLarge: return 1.24
        case .accessibilityMedium: return 1.3
        default: return UIApplication.shared.preferredContentSizeCategory.isAccessibilityCategory ? 1.35 : 1.0
        }
        #else
        return 1.0
        #endif
    }

    #if os(iOS)
    /// The text size changed while the app was open: every live screen takes the new zoom.
    public func rescale() {
        webView.pageZoom = Self.textScale
    }
    #endif
}

/// The Mac window's bar, which the web draws and the traffic lights stand in (plan M6): 56 tall, the lights `lead` from
/// the window's edge and centred on it, and `room` left for them at the start of the row (`--shell-lead` in the web).
///
/// THE ROOM IS MEASURED, NOT GUESSED. macOS 26 draws the lights 14 wide on a 23 pitch, 60 for the three, so 16 + 60 and
/// 12 to the web's first mark is 88. The web's own default for a shell that says nothing is 78, the Tauri app's lights.
public enum MacBar {
    public static let height: CGFloat = 56
    public static let lead: CGFloat = 16
    public static let room = 88
}

#if os(iOS)
public typealias PlatformImage = UIImage
#else
public typealias PlatformImage = NSImage
#endif

#if os(iOS)
/// The web screen as a SwiftUI view, covered until the page has drawn: by the board, or by its last picture.
public struct WebView: View {
    let screen: WebScreen
    public init(_ screen: WebScreen) { self.screen = screen }
    public var body: some View {
        Host(screen: screen)
            .overlay {
                if !screen.ready {
                    ZStack(alignment: .top) {
                        Palette.board
                        if let cover = screen.cover {
                            Image(uiImage: cover).resizable().scaledToFit().frame(maxWidth: .infinity, alignment: .top)
                        }
                    }
                    .allowsHitTesting(false)
                    .transition(.opacity)
                }
            }
            .background(Palette.board)
            .task { await screen.load() }
            .onAppear { screen.wake() }
    }

    private struct Host: UIViewRepresentable {
        let screen: WebScreen
        func makeUIView(context: Context) -> WKWebView { screen.webView }
        func updateUIView(_ view: WKWebView, context: Context) {}
    }
}
#else
public struct WebView: View {
    let screen: WebScreen
    public init(_ screen: WebScreen) { self.screen = screen }
    public var body: some View {
        Host(screen: screen)
            .overlay { if !screen.ready { Palette.board.allowsHitTesting(false) } }
            .background(Palette.board)
            .task { await screen.load() }
    }

    private struct Host: NSViewRepresentable {
        let screen: WebScreen
        func makeNSView(context: Context) -> WKWebView { screen.webView }
        func updateNSView(_ view: WKWebView, context: Context) {}
    }
}
#endif
