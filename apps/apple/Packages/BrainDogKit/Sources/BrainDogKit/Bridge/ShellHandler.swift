import Foundation
import WebKit

/// What the web asked of the app through `window.__BRAINDOG_SHELL__` (plan 3.2), each already checked and shaped.
nonisolated public enum ShellAsk: Sendable, Equatable {
    case open(URL)
    case notify(title: String, body: String, goto: String?)
    case badge(Int)
    case ready
    case haptic(Haptic)
    case share(url: URL, title: String?)
    case tell(prefill: String)
    case ask(prefill: String)
    case pushAsk
    case signedOut
    case title(name: String, sub: String?)
    case places(JSONValue)
    case visit(path: String, mode: String)
    /// The Mac: a press on the empty part of the bar, which moves the window as a title bar does.
    case drag
    /// The Mac: a double press there, which does what the person set for a title bar (zoom, minimise or nothing).
    case titleBarDoubleClick
    /// The iPhone: a sheet of the page's own opened or closed, which native's tab bar steps aside for.
    case modal(Bool)
    /// The look the person chose in BrainDog (`data-scheme`): "light", "dark", or "" for the device's own.
    case scheme(String)
    /// The page's reads have landed after a `refresh` (the pull's spinner goes then, not on a timer).
    case settled
    /// The page's own buttons, handed to the native bar (`head-actions.ts`): `[{ id, label, icon, primary }]`.
    case actions(JSONValue)
}

/// The kind of shell a web view is in, which the web reads as `kind` and decides its frame by.
nonisolated public enum ShellKind: String, Sendable { case ios, mac }

/// The bridge: the user script that builds the shell object, and the handler that hears it.
///
/// ONLY THE APP'S OWN ORIGIN, AND ONLY ITS MAIN FRAME, as the Tauri shell's `capabilities/remote.json` held it. The script
/// returns at once anywhere else, and the handler checks again what WebKit says sent the message (`frameInfo`), because a
/// script's own check is only as good as the page it runs in: an iframe, or a page the web view was sent to, is refused
/// here whatever it posts.
public final class ShellBridge: NSObject, WKScriptMessageHandler {
    public static let name = "braindog"

    private let hear: (ShellAsk) -> Void

    public init(hear: @escaping (ShellAsk) -> Void) {
        self.hear = hear
    }

    /// The user script for this kind, with the app's origin, the title bar's room and the text scale filled in.
    public static func script(kind: ShellKind, inset: Int, textScale: Double) -> WKUserScript {
        let url = Bundle.module.url(forResource: "ShellScript", withExtension: "js")
        let source = (url.flatMap { try? String(contentsOf: $0, encoding: .utf8) } ?? "")
            .replacingOccurrences(of: "__ORIGIN__", with: Server.originText)
            .replacingOccurrences(of: "__KIND__", with: kind.rawValue)
            .replacingOccurrences(of: "__INSET__", with: String(inset))
            .replacingOccurrences(of: "__SCALE__", with: String(format: "%.3f", textScale))
        return WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true)
    }

    /// Whether WebKit says this came from the app's own origin, in the main frame.
    private static func trusted(_ message: WKScriptMessage) -> Bool {
        guard message.frameInfo.isMainFrame else { return false }
        let origin = message.frameInfo.securityOrigin
        let port = Server.origin.port ?? (Server.origin.scheme == "https" ? 443 : 80)
        let theirs = origin.port == 0 ? (origin.protocol == "https" ? 443 : 80) : origin.port
        return origin.protocol == Server.origin.scheme && origin.host == Server.host && theirs == port
    }

    public func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard Self.trusted(message), let body = message.body as? [String: Any], let m = body["m"] as? String else { return }
        let a = body["a"] as? [String: Any] ?? [:]
        let text = { (key: String) in (a[key] as? String) ?? "" }
        switch m {
        case "open":
            if let url = URL(string: text("url")), WebGate.mayLeave(url) { hear(.open(url)) }
        case "notify":
            hear(.notify(title: text("title"), body: text("body"), goto: a["goto"] as? String))
        case "badge":
            hear(.badge(max(0, (a["n"] as? Int) ?? 0)))
        case "ready":
            hear(.ready)
        case "scheme":
            let v = text("v")
            hear(.scheme(v == "light" || v == "dark" ? v : ""))
        case "haptic":
            if let kind = Haptic(rawValue: text("kind")) { hear(.haptic(kind)) }
        case "share":
            if let url = URL(string: text("url")), WebGate.mayShare(url) { hear(.share(url: url, title: a["title"] as? String)) }
        case "tell":
            hear(.tell(prefill: text("prefill")))
        case "ask":
            hear(.ask(prefill: text("prefill")))
        case "pushAsk":
            hear(.pushAsk)
        case "signedOut":
            hear(.signedOut)
        case "title":
            hear(.title(name: text("name"), sub: a["sub"] as? String))
        case "places":
            if let tabs = a["tabs"], let data = try? JSONSerialization.data(withJSONObject: tabs, options: [.fragmentsAllowed]),
               let value = try? JSONDecoder().decode(JSONValue.self, from: data) { hear(.places(value)) }
        case "visit":
            hear(.visit(path: text("path"), mode: text("mode")))
        case "modal":
            hear(.modal(a["open"] as? Bool ?? false))
        case "settled":
            hear(.settled)
        case "actions":
            if let list = a["list"], let data = try? JSONSerialization.data(withJSONObject: list, options: [.fragmentsAllowed]),
               let value = try? JSONDecoder().decode(JSONValue.self, from: data) { hear(.actions(value)) }
        case "drag":
            hear(.drag)
        case "zoom":
            hear(.titleBarDoubleClick)
        default:
            break
        }
    }
}
