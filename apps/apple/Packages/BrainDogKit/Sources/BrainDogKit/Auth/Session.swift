import Foundation
import Observation
import Security
import WebKit

/// The app session: one Directory session of kind `app`, shared by the web view, the native screens and every extension
/// (plan 3.6).
///
/// ITS ID LIVES IN THE KEYCHAIN AND NOWHERE ELSE. Native calls send it as the `__Host-bd_s` cookie the web sends, the
/// web view gets the same cookie in its store before its first load, and the widgets, share and notification extensions
/// read it through the Keychain group. Nothing that opens anything is put in the App Group, UserDefaults or a URL.
///
/// IT ROTATES ONCE A DAY, HERE AND ONLY HERE. An app session is not rotated on read (the web view, a widget and an
/// intent reading at once would race), so the app asks `/auth/app/refresh` itself when it comes to the front a day after
/// the last time; the old id is good for five more minutes, and the Keychain and the web view's store are set together.
///
/// A 401 ANYWHERE MEANS NATIVE SIGN-IN. `lost()` clears the Keychain, the web view's cookies and the App Group's copy,
/// and the app's root draws Sign in again; the web's sign-in page never shows inside the app.
@Observable
public final class Session {
    public static let shared = Session()

    /// The cookie as the server set it: its name (`__Host-bd_s`, or `bd_s` on a self-host over http) and its value.
    public private(set) var cookie: (name: String, value: String)?

    /// What this session is called in Settings, Signing in: "iPhone, BrainDog app".
    public static var deviceLabel: String {
        #if os(iOS)
        return "iPhone, BrainDog app"
        #else
        return "Mac, BrainDog app"
        #endif
    }

    public var signedIn: Bool { cookie != nil }

    /// `cookie: __Host-bd_s=<id>`, for a native call.
    public var cookieHeader: String? { cookie.map { "\($0.name)=\($0.value)" } }

    private static let names = ["__Host-bd_s", "bd_s"]
    private let keychain = Keychain(service: "dog.brain.session")
    private let shared: UserDefaults

    private init() {
        shared = Server.appGroup.flatMap { UserDefaults(suiteName: $0) } ?? .standard
        if let stored = keychain.read("cookie"), let at = stored.firstIndex(of: "=") {
            cookie = (String(stored[..<at]), String(stored[stored.index(after: at)...]))
        }
    }

    /// Keep what a sign-in, a refresh or any other answer set, or forget it when the answer cleared it.
    func take(response: HTTPURLResponse) {
        let fields = response.allHeaderFields.reduce(into: [String: String]()) { out, pair in
            if let k = pair.key as? String, let v = pair.value as? String { out[k] = v }
        }
        let url = response.url ?? Server.origin
        for c in HTTPCookie.cookies(withResponseHeaderFields: fields, for: url) where Self.names.contains(c.name) {
            if c.value.isEmpty || (c.expiresDate.map { $0 <= Date() } ?? false) {
                lost()
            } else {
                store(name: c.name, value: c.value)
            }
            return
        }
        /* HTTPCookie refuses a `Secure` cookie for an http URL, which is the seed on this Mac: read the header by hand. */
        if let raw = fields.first(where: { $0.key.lowercased() == "set-cookie" })?.value {
            for name in Self.names {
                guard let range = raw.range(of: "\(name)=") else { continue }
                let value = raw[range.upperBound...].prefix { $0 != ";" && $0 != "," }
                if value.isEmpty || raw.lowercased().contains("max-age=0") { lost() } else { store(name: name, value: String(value)) }
                return
            }
        }
    }

    private func store(name: String, value: String) {
        let first = cookie == nil
        cookie = (name, value)
        keychain.write("cookie", "\(name)=\(value)")
        if first { shared.set(Date().timeIntervalSince1970, forKey: "session.refreshedAt") }
        Task { await self.install(into: WebKitStore.shared) }
    }

    /// The session is gone: forget it everywhere, and say so to whoever draws the root.
    public func lost() {
        guard cookie != nil else { return }
        cookie = nil
        keychain.delete("cookie")
        shared.removeObject(forKey: "session.refreshedAt")
        /* WHAT THE NATIVE SCREENS KEPT GOES WITH IT (plan 3.8), and so does the web views' own copy of the record. */
        Kept.forget()
        Task { await WebKitStore.shared.clear() }
    }

    /// Sign out here: the server ends this session, and the app forgets it whatever the server said.
    public func signOut() async {
        _ = try? await Client.shared.auth("/auth/logout", as: Nothing.self)
        lost()
    }

    /// Rotate the session if a day has passed since it was made or last rotated (`/auth/app/refresh`).
    public func refreshIfDue() async {
        guard signedIn else { return }
        let last = shared.double(forKey: "session.refreshedAt")
        guard Date().timeIntervalSince1970 - last > 24 * 3600 else { return }
        do {
            _ = try await Client.shared.auth("/auth/app/refresh", as: Nothing.self)
            shared.set(Date().timeIntervalSince1970, forKey: "session.refreshedAt")
        } catch .signedOut {
            lost()
        } catch {
            /* Offline, or a server that cannot rotate it yet: the session is good for months, so the next foreground tries again. */
        }
    }

    /// Put the session in a web view's cookie store, before its first load and after each rotation.
    func install(into store: WebKitStore) async {
        guard let cookie else { return }
        await store.set(name: cookie.name, value: cookie.value)
    }
}

/// The web views' shared cookie store: the default data store, which every web screen uses.
@MainActor
public final class WebKitStore {
    public static let shared = WebKitStore()
    private var store: WKHTTPCookieStore { WKWebsiteDataStore.default().httpCookieStore }

    func set(name: String, value: String) async {
        var props: [HTTPCookiePropertyKey: Any] = [
            .name: name, .value: value, .path: "/", .domain: Server.host,
            .expires: Date().addingTimeInterval(90 * 24 * 3600),
            HTTPCookiePropertyKey("HttpOnly"): "TRUE",
            .sameSitePolicy: HTTPCookieStringPolicy.sameSiteLax,
        ]
        /* THE SEED ON THIS MAC IS PLAIN HTTP, and a `Secure` cookie is never sent over it: only a Debug build sees this. */
        if !Server.isLocal { props[.secure] = "TRUE" }
        guard let cookie = HTTPCookie(properties: props) else { return }
        await store.setCookie(cookie)
    }

    func clear() async {
        for c in await store.allCookies() where c.domain.hasSuffix(Server.host) {
            await store.deleteCookie(c)
        }
        /* AND THE PAGE'S OWN KEPT COPY (IndexedDB, the service worker's), so the next person on this phone reads nothing of it. */
        let kinds: Set<String> = [WKWebsiteDataTypeIndexedDBDatabases, WKWebsiteDataTypeServiceWorkerRegistrations, WKWebsiteDataTypeFetchCache, WKWebsiteDataTypeLocalStorage]
        await WKWebsiteDataStore.default().removeData(ofTypes: kinds, modifiedSince: .distantPast)
    }

    /// Wait until the session is in the store, so a first load never goes out without it.
    public func ready() async {
        await Session.shared.install(into: self)
    }
}

/// A small Keychain wrapper: generic passwords under one service, in the shared group when the app is entitled to it.
///
/// THE GROUP IS ASKED FOR AND NOT ASSUMED. A build signed to run locally has no group (no team prefix, no profile), and
/// the Keychain answers `errSecMissingEntitlement`; that is the one case that falls back to the app's own items, so a
/// simulator or a local Mac build signs in and stays signed in all the same.
struct Keychain: Sendable {
    let service: String

    private func query(_ account: String, group: String?) -> [String: Any] {
        var q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        if let group { q[kSecAttrAccessGroup as String] = group }
        #if os(macOS)
        if group != nil { q[kSecUseDataProtectionKeychain as String] = true }
        #endif
        return q
    }

    private var groups: [String?] {
        guard let group = Server.keychainGroup, !group.hasPrefix("$(") else { return [nil] }
        return [group, nil]
    }

    func read(_ account: String) -> String? {
        for group in groups {
            var q = query(account, group: group)
            q[kSecReturnData as String] = true
            q[kSecMatchLimit as String] = kSecMatchLimitOne
            var out: CFTypeRef?
            let status = SecItemCopyMatching(q as CFDictionary, &out)
            if status == errSecSuccess, let data = out as? Data { return String(data: data, encoding: .utf8) }
            if status != errSecMissingEntitlement { if status != errSecItemNotFound { return nil } }
        }
        return nil
    }

    func write(_ account: String, _ value: String) {
        let data = Data(value.utf8)
        for group in groups {
            let q = query(account, group: group)
            let update: [String: Any] = [kSecValueData as String: data]
            var status = SecItemUpdate(q as CFDictionary, update as CFDictionary)
            if status == errSecItemNotFound {
                var add = q
                add[kSecValueData as String] = data
                /* AFTER FIRST UNLOCK, so the notification extension can read it to rewrite a push on a locked phone. */
                add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
                status = SecItemAdd(add as CFDictionary, nil)
            }
            if status != errSecMissingEntitlement { return }
        }
    }

    func delete(_ account: String) {
        for group in groups { SecItemDelete(query(account, group: group) as CFDictionary) }
    }
}
