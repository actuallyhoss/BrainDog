import Observation
import SwiftUI
import WebKit

/// Light or dark as the person chose it in BrainDog (Settings, Appearance), for the app's own chrome.
///
/// THE PAGE AND THE BARS ROUND IT WEAR ONE SCHEME. The web reads its scheme from the person's look (`data-scheme`), and
/// the native bars, sheets and tab bar would otherwise follow the device: a phone in dark mode drew a black bar over a
/// light Today, with the tab bar's glass gone grey over it. The page says its scheme whenever it changes, and the app
/// keeps the last one so a cold start opens in it before any page has loaded. Empty is the device's own.
@Observable
public final class Look {
    public static let shared = Look()
    public private(set) var scheme: ColorScheme?
    private static let key = "look.scheme"

    private init() {
        scheme = Self.parse(UserDefaults.standard.string(forKey: Self.key) ?? "")
    }

    public func heard(_ raw: String) {
        UserDefaults.standard.set(raw, forKey: Self.key)
        let next = Self.parse(raw)
        if next != scheme { scheme = next }
    }

    private static func parse(_ raw: String) -> ColorScheme? {
        switch raw {
        case "light": .light
        case "dark": .dark
        default: nil
        }
    }

    /// Says the page's `data-scheme` once it has loaded and again whenever it changes.
    static let script = WKUserScript(source: """
    (function(){try{var d=document.documentElement,h=window.webkit&&webkit.messageHandlers&&webkit.messageHandlers.\(ShellBridge.name);if(!h)return;var last=null,say=function(){var v=d.getAttribute('data-scheme')||'';if(v===last)return;last=v;h.postMessage({m:'scheme',a:{v:v}})};say();new MutationObserver(say).observe(d,{attributes:true,attributeFilter:['data-scheme']})}catch(e){}})();
    """, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
}

/// The app's chrome in the person's chosen scheme (`Look`), or the device's when they left it to the device.
public struct FollowLook: ViewModifier {
    @State private var look = Look.shared
    public init() {}
    public func body(content: Content) -> some View {
        content.preferredColorScheme(look.scheme)
    }
}
