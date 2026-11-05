import Foundation

/// What may load in a web screen, what may leave the app, and what may come in from outside it, in one place and with no
/// state, so a check outside the app can run every case (`apps/apple/test/security.test.mjs` compiles this file alone).
///
/// THE BRIDGE AND THE SESSION ARE WORTH HAVING, SO THE WINDOW STAYS ON THE APP'S OWN ORIGIN. A page in the main frame is
/// that origin, `about:blank` (a sleeping screen), or a `blob:` of the origin's own in the hidden window that saves it,
/// never a `data:` page drawn with no address bar over the app. A frame inside the page has no bridge whatever it is, and
/// the web's own policy says which frames may come (`frame-src`).
nonisolated public enum WebGate {
    /// Which frame a move is for: the window, a frame inside the page, or a new window (`targetFrame` nil).
    public enum Frame: Sendable { case main, sub, newWindow }

    /// What to do with a move: load it, drop it, hand it outside the app, or take it that the session is gone.
    public enum Move: Sendable, Equatable { case allow, cancel, outside, signedOut }

    /// The same scheme, host and port as the origin, with no name in the address. An exact host: `evilapp.brain.dog` and
    /// `app.brain.dog.evil.example` are other places.
    public static func isOurs(_ url: URL, origin: URL) -> Bool {
        url.scheme == origin.scheme && url.host == origin.host && url.port == origin.port && url.user == nil && url.password == nil
    }

    /// A `blob:` the origin itself made. The slash is what stops `blob:https://app.brain.dog.evil.example/`.
    public static func isOwnBlob(_ url: URL, origin: URL) -> Bool {
        guard let scheme = origin.scheme, let host = origin.host else { return false }
        let port = origin.port.map { ":\($0)" } ?? ""
        return url.absoluteString.hasPrefix("blob:\(scheme)://\(host)\(port)/")
    }

    /// One navigation. `link` is a press on a link; `popup` is the hidden window an attached PDF opens in.
    public static func move(_ url: URL, origin: URL, frame: Frame, link: Bool, popup: Bool) -> Move {
        let scheme = url.scheme?.lowercased() ?? ""
        if frame == .sub {
            return isOurs(url, origin: origin) || ["https", "blob", "data", "about"].contains(scheme) ? .allow : .cancel
        }
        if frame == .main, url.absoluteString == "about:blank" { return .allow }
        if scheme == "blob", frame == .newWindow || popup, isOwnBlob(url, origin: origin) { return .allow }
        if ["about", "blob", "data"].contains(scheme) { return .cancel }
        if isOurs(url, origin: origin) {
            /* THE WEB'S SIGN-IN PAGE NEVER SHOWS IN THE APP: arriving there means the session is gone. */
            return url.path == "/signin" || url.path.hasPrefix("/signin/") ? .signedOut : .allow
        }
        return link || frame == .newWindow ? .outside : .cancel
    }

    /// What may be handed to the system to open: the web and a mail or a call. Never `file:`, `smb:`, `shortcuts:` or
    /// another app's scheme, which a link in a page could otherwise use to launch something.
    public static func mayLeave(_ url: URL) -> Bool {
        ["https", "http", "mailto", "tel"].contains(url.scheme?.lowercased() ?? "")
    }

    /// What the page may put in the share sheet: an address on the web, never a file of the app's own.
    public static func mayShare(_ url: URL) -> Bool {
        ["https", "http"].contains(url.scheme?.lowercased() ?? "")
    }

    /// Whether a file an answer brought may be saved: the window's own, or the origin's, not a frame of someone else's.
    public static func mayKeep(_ url: URL?, origin: URL, mainFrame: Bool) -> Bool {
        if mainFrame { return true }
        guard let url else { return false }
        return isOurs(url, origin: origin) || isOwnBlob(url, origin: origin)
    }

    /// The hosts' own doors (`DOORS` in `apps/worker/src/apple.ts`), which no address from outside the app may open.
    static let doors: Set<String> = ["api", "auth", "account", "mcp", "in", "oauth", "a", "ws", "healthz", "app", "_app", ".well-known", "drawn-frame"]

    /// An address from outside the app (a `braindog://` link, a universal link, Handoff, a push) as a path in it, or nil.
    /// Only a plain path from the root: not another host (`//x`, `/\x`), no `..`, and none of the host's doors, under a
    /// record's name or not.
    public static func appPath(_ raw: String) -> String? {
        guard raw.hasPrefix("/"), !raw.hasPrefix("//"), !raw.contains("\\") else { return nil }
        guard !raw.unicodeScalars.contains(where: { $0.value < 0x20 || $0.value == 0x7f }) else { return nil }
        let path = raw.prefix { $0 != "?" && $0 != "#" }
        let parts = path.split(separator: "/", omittingEmptySubsequences: false).dropFirst().map { part in
            (String(part).removingPercentEncoding ?? String(part)).lowercased()
        }
        guard !parts.contains(where: { $0 == "." || $0 == ".." || $0.contains("/") || $0.contains("\\") }) else { return nil }
        if let first = parts.first, doors.contains(first) { return nil }
        if parts.count > 2, ["api", "auth"].contains(parts[1]) { return nil }
        return raw
    }

    /// Whether a URL is the mailed sign-in link on the app's own origin (`/signin?app=<challenge>#magic=<token>`). Never
    /// `braindog://`, which any page or app can open, and which would sign this app in as whoever made the link.
    public static func isSignInLink(_ url: URL, origin: URL) -> Bool {
        isOurs(url, origin: origin) && url.path == "/signin" && url.fragment?.hasPrefix("magic=") == true
    }

    /// Whether a redirect stays where the session may go: a call carries the session by hand, and URLSession would carry
    /// that header on to wherever an answer pointed.
    public static func staysHome(_ next: URL?, from first: URL?) -> Bool {
        guard let next, let first else { return false }
        return next.scheme == first.scheme && next.host == first.host && next.port == first.port
    }

    /// A file name as a name: its last part, never a path out of the folder it is saved in.
    public static func fileName(_ suggested: String) -> String {
        let name = suggested.replacingOccurrences(of: "\\", with: "/").split(separator: "/").last.map(String.init) ?? ""
        return name.isEmpty || name == "." || name == ".." ? "BrainDog" : name
    }
}
