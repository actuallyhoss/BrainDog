import Foundation

/// Where the web app and its calls are: `https://app.brain.dog`, from the app's Info.plist (`BrainDogServer`).
///
/// A DEBUG BUILD MAY BE POINTED ELSEWHERE, and only a Debug build: `-braindogServer http://localhost:5183` on the launch
/// line (the scheme carries it, off), which is the seed and the web dev server on this Mac (`tools/dev.mjs`). A Release
/// build reads the plist and nothing else, so no setting on a phone can send its session to another host.
public enum Server {
    /// The origin every call is made to and every page is loaded from, without a trailing slash.
    public static let origin: URL = {
        #if DEBUG
        if let asked = UserDefaults.standard.string(forKey: "braindogServer"), let url = URL(string: asked), url.scheme != nil, url.host != nil {
            /* AND SAID TO THE EXTENSIONS, which get no launch line: a widget or the share sheet of a Debug build talks to
               the host the app was pointed at (the seed), through the App Group's defaults. */
            if let group = appGroup { UserDefaults(suiteName: group)?.set(asked, forKey: "debug.server") }
            return url
        }
        if let group = appGroup, let shared = UserDefaults(suiteName: group) {
            if !isExtension {
                shared.removeObject(forKey: "debug.server")
            } else if let asked = shared.string(forKey: "debug.server"), let url = URL(string: asked), url.scheme != nil, url.host != nil {
                return url
            }
        }
        #endif
        let named = Bundle.main.object(forInfoDictionaryKey: "BrainDogServer") as? String
        return URL(string: named ?? "https://app.brain.dog") ?? URL(string: "https://app.brain.dog")!
    }()

    /// `https://app.brain.dog`, as a page on it sends `Origin`.
    public static var originText: String {
        var text = "\(origin.scheme ?? "https")://\(origin.host ?? "app.brain.dog")"
        if let port = origin.port { text += ":\(port)" }
        return text
    }

    /// The host name alone, which the bridge and the cookie are bound to.
    public static var host: String { origin.host ?? "app.brain.dog" }

    /// True for a Debug build on this Mac's seed, where the session cookie travels over plain http.
    public static var isLocal: Bool { origin.scheme == "http" }

    /// An address on the server, from an app path such as `/` or `/settings/signing-in`.
    public static func url(_ path: String) -> URL {
        URL(string: originText + (path.hasPrefix("/") ? path : "/" + path)) ?? origin
    }

    /// True in a widget, share or notification extension, false in an app.
    public static var isExtension: Bool { Bundle.main.bundleURL.pathExtension == "appex" }

    /// The App Group every target shares the session's facts and the glance snapshot through.
    public static var appGroup: String? {
        let group = Bundle.main.object(forInfoDictionaryKey: "BrainDogAppGroup") as? String
        return group?.isEmpty == false ? group : nil
    }

    /// The Keychain group the session is kept in, so the widgets, share and notification extensions read the same one.
    public static var keychainGroup: String? {
        let group = Bundle.main.object(forInfoDictionaryKey: "BrainDogKeychainGroup") as? String
        return group?.isEmpty == false ? group : nil
    }
}
