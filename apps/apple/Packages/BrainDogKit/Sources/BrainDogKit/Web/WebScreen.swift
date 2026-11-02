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
/// NO WHITE FLASH, NO SPINNER (plan 3.3, Launch). The view's ground is the board from the first frame, and a cover in the
/// board's colour sits over the page until the page says it has drawn (`ready()`, which the web calls once at first
/// drawn), then fades in 120 ms. A page that never says so (an older web build) is uncovered after a few seconds.
///
/// THE SESSION GOES IN BEFORE THE FIRST LOAD, so the first request already carries it and the web never draws its own
/// sign-in page in the app; if it ever tries (`/signin`), the app takes that as signed out and signs in natively.
@Observable
public final class WebScreen: NSObject, WKNavigationDelegate, WKUIDelegate {
    public let kind: ShellKind
    public let webView: WKWebView
    /// True once the page has drawn, or after the wait for it ran out.
    public private(set) var ready = false
    /// The page's name, as the web says it (`title(name)`), for a native bar.
    public private(set) var title: String?
    /// The page's places (the web's `tabsOf`), for the native tab bar in M2.
    public private(set) var places: JSONValue?
    /// Asks the screen does not answer itself: share, tell, ask, notify, badge, visit.
    @ObservationIgnored public var onAsk: ((ShellAsk) -> Void)?

    private var path: String
    private var loaded = false

    public init(kind: ShellKind, path: String = "/") {
        self.kind = kind
        self.path = path
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.applicationNameForUserAgent = "BrainDog/\(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1") (\(kind == .ios ? "iPhone" : "Mac"))"
        #if os(iOS)
        config.allowsInlineMediaPlayback = true
        config.dataDetectorTypes = []
        #endif
        let controller = WKUserContentController()
        controller.addUserScript(ShellBridge.script(kind: kind, inset: kind == .mac ? 78 : 0, textScale: Self.textScale))
        config.userContentController = controller
        webView = WKWebView(frame: .zero, configuration: config)
        super.init()
        /* THE BRIDGE HOLDS THE SCREEN WEAKLY, so the content controller (which keeps its handler) keeps nothing alive. */
        controller.add(ShellBridge { [weak self] ask in self?.hear(ask) }, name: ShellBridge.name)
        webView.navigationDelegate = self
        webView.uiDelegate = self
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
        await WebKitStore.shared.ready()
        webView.load(URLRequest(url: Server.url(path)))
        /* A PAGE THAT NEVER SAYS IT DREW is uncovered anyway: four seconds is past a cold Today on a phone. */
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(4))
            self?.uncover()
        }
    }

    /// Go somewhere else in the app on this screen (a deep link, a menu's Go).
    public func go(_ path: String) {
        self.path = path
        if loaded { emit("goto", path) } else { Task { await load() } }
    }

    /// Reload from the server, as the Mac's ⌘R and the offline page's Try again do.
    public func reload() {
        if webView.url == nil { webView.load(URLRequest(url: Server.url(path))) } else { webView.reload() }
    }

    /// Tell the page something (`slash`, `search`, `goto`, `refresh`, `saved`, `unsaved`).
    public func emit(_ event: String, _ arg: String? = nil) {
        let argument = arg.map { "'\($0.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "'", with: "\\'"))'" } ?? "undefined"
        webView.evaluateJavaScript("window.__BRAINDOG_SHELL__ && window.__BRAINDOG_SHELL__.emit('\(event)', \(argument))")
    }

    private func uncover() {
        guard !ready else { return }
        withAnimation(.easeOut(duration: 0.12)) { ready = true }
    }

    private func hear(_ ask: ShellAsk) {
        switch ask {
        case .ready:
            uncover()
        case .title(let name, _):
            title = name
        case .places(let tabs):
            places = tabs
        case .haptic(let kind):
            kind.play()
        case .signedOut:
            Session.shared.lost()
        case .open(let url):
            openOutside(url)
        default:
            onAsk?(ask)
        }
    }

    #if os(iOS)
    @objc private func pulled(_ control: UIRefreshControl) {
        emit("refresh")
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(700))
            control.endRefreshing()
        }
    }
    #endif

    /// An address that is not the app's goes to the browser (Safari, or the Mac's default).
    private func openOutside(_ url: URL) {
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

    public func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url { ours(url) ? go(url.path) : openOutside(url) }
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
}

#if os(iOS)
/// The web screen as a SwiftUI view, covered by the board until the page has drawn.
public struct WebView: View {
    let screen: WebScreen
    public init(_ screen: WebScreen) { self.screen = screen }
    public var body: some View {
        Host(screen: screen)
            .overlay { if !screen.ready { Palette.board.allowsHitTesting(false) } }
            .background(Palette.board)
            .task { await screen.load() }
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
