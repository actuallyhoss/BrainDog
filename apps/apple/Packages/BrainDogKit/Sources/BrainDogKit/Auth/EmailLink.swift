import CryptoKit
import Foundation

/// A PKCE pair: the verifier this app keeps, and the challenge (its SHA-256, base64url) it sends with a link request.
nonisolated struct PKCE: Codable, Sendable, Equatable {
    let verifier: String
    let challenge: String
    let made: Date

    static func fresh() -> PKCE {
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        let verifier = Data(bytes).base64URL
        return PKCE(verifier: verifier, challenge: Data(SHA256.hash(data: Data(verifier.utf8))).base64URL, made: Date())
    }
}

nonisolated extension Data {
    var base64URL: String {
        base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }

    init?(base64URL text: String) {
        var b64 = text.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while b64.count % 4 != 0 { b64 += "=" }
        self.init(base64Encoded: b64)
    }
}

/// Signing in by email, natively: the link request, the six-digit code, and the mailed link opened as a universal link.
///
/// THE APP KEEPS A VERIFIER AND SENDS ITS CHALLENGE (`app` beside `email`), as the Mac flow always has. The letter then
/// carries the link with `?app=<challenge>` and a six-digit code bound to the same challenge (ten minutes, five tries).
/// Either one finishes here:
/// - the link, opened on this phone, comes back to the app as a universal link: the app hands the unspent link to
///   `/auth/app/handoff` with its challenge and swaps the code it gets for the session at `/auth/app` with its verifier;
/// - the code, typed here (the letter read on another device), goes to `/auth/app/code` with the verifier.
/// Nobody holding only the letter can finish either: both need the verifier, which never left this app.
///
/// THE PAIR SURVIVES THE APP BEING CLOSED, because opening Mail to read the letter may be what closes it. It is kept in
/// the Keychain for the fifteen minutes a link lives, and a new request makes a new pair.
enum EmailLink {
    private static let keychain = Keychain(service: "dog.brain.signin")
    private static let life: TimeInterval = 15 * 60

    /// The pair the last request was made with, while its link can still be spent.
    static var pending: PKCE? {
        guard let text = keychain.read("pkce"), let pair = try? JSONDecoder().decode(PKCE.self, from: Data(text.utf8)) else { return nil }
        return Date().timeIntervalSince(pair.made) < life ? pair : nil
    }

    /// Ask for a link and a code. The host answers alike for an address it does not know, so this cannot say it was sent.
    static func start(email: String) async throws(CallFailure) {
        let pair = PKCE.fresh()
        if let data = try? JSONEncoder().encode(pair) { keychain.write("pkce", String(decoding: data, as: UTF8.self)) }
        _ = try await Client.shared.auth("/auth/magic/start", ["email": .string(email), "app": .string(pair.challenge)], as: Nothing.self)
    }

    /// The six digits from the letter.
    static func finish(code: String) async throws(CallFailure) {
        guard let pair = pending else { throw CallFailure.refused(Refusal(code: "EXPIRED", fix: Words.codeExpired, at: "code")) }
        let digits = code.filter(\.isNumber)
        _ = try await Client.shared.auth("/auth/app/code", ["code": .string(digits), "verifier": .string(pair.verifier), "label": .string(Session.deviceLabel)], as: Nothing.self)
        keychain.delete("pkce")
    }

    /// Whether a URL is the mailed sign-in link, on the app's own origin: `/signin?app=<challenge>#magic=<token>`.
    static func isSignInLink(_ url: URL) -> Bool {
        WebGate.isSignInLink(url, origin: Server.origin)
    }

    /// Whether this app asked for this link: its `?app=` is the challenge of the pair kept here. Nobody else knows that.
    static func askedHere(_ url: URL) -> Bool {
        guard let pair = pending else { return false }
        return URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "app" })?.value == pair.challenge
    }

    /// The mailed link, opened on this device: handed back with a challenge, then swapped with its verifier.
    ///
    /// A LINK ASKED FOR SOMEWHERE ELSE STILL SIGNS IN HERE, as an app session, once the person has said so
    /// (`SignInFlow.open`): it may be someone else's, sent to sign this app in as them. Its `?app=` is another app's
    /// challenge (the Mac's, or a request this app has since replaced), so this app seals it to a pair of its own instead:
    /// handing off asks for nothing the holder of the link does not already have, since the link alone signs in wherever
    /// it is spent.
    static func finish(link url: URL) async throws(CallFailure) {
        guard let token = url.fragment?.split(separator: "=", maxSplits: 1).last.map(String.init), !token.isEmpty
        else { throw CallFailure.refused(Refusal(code: "LINK", fix: Words.linkNotForApp, at: "link")) }
        let asked = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "app" })?.value
        let pair = pending.flatMap { $0.challenge == asked ? $0 : nil } ?? PKCE.fresh()
        nonisolated struct Handed: Decodable, Sendable { let code: String }
        let handed = try await Client.shared.auth("/auth/app/handoff", ["linkToken": .string(token), "challenge": .string(pair.challenge)], as: Handed.self)
        _ = try await Client.shared.auth("/auth/app", ["code": .string(handed.code), "verifier": .string(pair.verifier), "label": .string(Session.deviceLabel)], as: Nothing.self)
        keychain.delete("pkce")
    }
}
