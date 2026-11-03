import Foundation

/// What the record or the Directory says when it will not do something: the code, the sentence a person reads, and the
/// field it is about. The sentence is shown as it comes; the code is never shown.
nonisolated public struct Refusal: Decodable, Sendable, Equatable {
    public let code: String
    public let fix: String
    public let at: String?
}

/// Why a call came back without an answer, each said in the app's words by `Words.failure(_:)`.
nonisolated public enum CallFailure: Error, Sendable, Equatable {
    /// No network, or the server did not answer.
    case offline
    /// The session is gone (a 401). Native signs in again; a web page never does it inside the app.
    case signedOut
    /// The Directory paused sign-in from here for this many seconds.
    case locked(seconds: Int)
    /// A refusal, in its own words.
    case refused(Refusal)
    /// Anything else, by its status.
    case failed(status: Int)
}

/// The one way native code talks to BrainDog: `POST /api/<method>` and the `/auth/*` routes, on the web app's origin.
///
/// EXACTLY AS THE WEB DOES, SO THE WORKER NEEDS NO NEW DOOR (plan 3.6). The session goes as the `__Host-bd_s` cookie and
/// every write carries `Origin: https://app.brain.dog`; the answer is the same `{ ok, value | refusal }` envelope.
///
/// NO COOKIE JAR. URLSession's own store would keep a second copy of the session that nobody rotates, so cookies are
/// off here and the one `Session` sets the header itself and reads every `Set-Cookie` that comes back: a refresh's new
/// id, or a cleared one, lands in the Keychain in the same call that brought it.
public final class Client: Sendable {
    public static let shared = Client()

    private let http: URLSession

    public init() {
        let config = URLSessionConfiguration.ephemeral
        config.httpCookieAcceptPolicy = .never
        config.httpShouldSetCookies = false
        config.httpCookieStorage = nil
        config.timeoutIntervalForRequest = 20
        config.waitsForConnectivity = false
        config.httpAdditionalHeaders = ["accept": "application/json"]
        http = URLSession(configuration: config)
    }

    /// A record call: `POST /api/<method>` with `args`, answered as `T`.
    public func call<T: Decodable & Sendable>(_ method: String, _ args: [String: JSONValue] = [:], as: T.Type = T.self) async throws(CallFailure) -> T {
        let data = try await post("/api/\(method)", body: .object(args))
        return try decodeValue(data)
    }

    /// A sign-in route, `POST /auth/...`, answered as `T` (most answer `{}`).
    public func auth<T: Decodable & Sendable>(_ path: String, _ body: [String: JSONValue] = [:], as: T.Type = T.self) async throws(CallFailure) -> T {
        let data = try await post(path, body: .object(body))
        return try decodeValue(data)
    }

    /// A read of the person's own (`GET /account/records`), answered as `T`: the account's doors are GETs, a record's are POSTs.
    public func get<T: Decodable & Sendable>(_ path: String, as: T.Type = T.self) async throws(CallFailure) -> T {
        var request = URLRequest(url: Server.url(path))
        request.httpMethod = "GET"
        request.cachePolicy = .reloadIgnoringLocalCacheData
        if let cookie = Session.shared.cookieHeader { request.setValue(cookie, forHTTPHeaderField: "cookie") }
        let data = try await send(request, path: path)
        return try decodeValue(data)
    }

    /// The envelope's `value`, or the refusal it carried.
    private func decodeValue<T: Decodable>(_ data: Data) throws(CallFailure) -> T {
        do {
            let envelope = try JSONDecoder().decode(Envelope<T>.self, from: data)
            if envelope.ok, let value = envelope.value { return value }
            if let refusal = envelope.refusal { throw CallFailure.refused(refusal) }
            if let seconds = envelope.retryAfter { throw CallFailure.locked(seconds: seconds) }
            throw CallFailure.failed(status: 200)
        } catch let failure as CallFailure {
            throw failure
        } catch {
            throw CallFailure.failed(status: 200)
        }
    }

    /// One POST on the web app's origin, with the session cookie and the origin header, and its `Set-Cookie` kept.
    public func post(_ path: String, body: JSONValue) async throws(CallFailure) -> Data {
        var request = URLRequest(url: Server.url(path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.setValue(Server.originText, forHTTPHeaderField: "origin")
        if let cookie = Session.shared.cookieHeader { request.setValue(cookie, forHTTPHeaderField: "cookie") }
        request.httpBody = (try? JSONEncoder().encode(body)) ?? Data("{}".utf8)
        return try await send(request, path: path)
    }

    /// A file sent to the record's files (`PUT /api/files`, as a file field sends one): its bytes as they are, answered
    /// with the file as a row holds it. The answer is the file itself, not the `{ ok, value }` envelope.
    public func put(file data: Data, type: String) async throws(CallFailure) -> SentFile {
        var request = URLRequest(url: Server.url("/api/files"))
        request.httpMethod = "PUT"
        request.setValue(type, forHTTPHeaderField: "content-type")
        request.setValue(Server.originText, forHTTPHeaderField: "origin")
        if let cookie = Session.shared.cookieHeader { request.setValue(cookie, forHTTPHeaderField: "cookie") }
        request.httpBody = data
        let answer = try await send(request, path: "/api/files")
        if let sent = try? JSONDecoder().decode(SentFile.self, from: answer) { return sent }
        if let wrapped = try? JSONDecoder().decode(Envelope<SentFile>.self, from: answer), let sent = wrapped.value { return sent }
        throw CallFailure.failed(status: 200)
    }

    /// A file sent to be attached (`PUT /api/files?name=`, as the web's Attachments section sends one): the door takes any
    /// type at up to 25 MB when the put names its file, and types it from its bytes, never from what is said here. The
    /// answer is its hash, which `attachFile` then puts on a task or project.
    public func put(attaching data: Data, name: String) async throws(CallFailure) -> SentFile {
        var allowed = CharacterSet.urlQueryAllowed
        allowed.remove(charactersIn: "&=+#?")
        let named = name.addingPercentEncoding(withAllowedCharacters: allowed) ?? "file"
        var request = URLRequest(url: Server.url("/api/files?name=\(named)"))
        request.httpMethod = "PUT"
        request.timeoutInterval = 120
        request.setValue("application/octet-stream", forHTTPHeaderField: "content-type")
        request.setValue(Server.originText, forHTTPHeaderField: "origin")
        if let cookie = Session.shared.cookieHeader { request.setValue(cookie, forHTTPHeaderField: "cookie") }
        request.httpBody = data
        let answer = try await send(request, path: "/api/files")
        if let sent = try? JSONDecoder().decode(SentFile.self, from: answer) { return sent }
        if let wrapped = try? JSONDecoder().decode(Envelope<SentFile>.self, from: answer), let sent = wrapped.value { return sent }
        throw CallFailure.failed(status: 200)
    }

    /// One request on the origin, its `Set-Cookie` kept, and its status read the one way every call reads it.
    private func send(_ request: URLRequest, path: String) async throws(CallFailure) -> Data {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await http.data(for: request)
        } catch {
            throw CallFailure.offline
        }
        guard let http = response as? HTTPURLResponse else { throw CallFailure.offline }
        Session.shared.take(response: http)
        /* ACCESS THAT ENDED ENDS HERE TOO (plan 3.8): the host says so on any answer, and the app forgets what it kept. */
        if http.value(forHTTPHeaderField: "x-braindog-access") == "ended" {
            Session.shared.lost()
            throw CallFailure.signedOut
        }

        switch http.statusCode {
        case 200..<300:
            return data
        case 401:
            /* A SIGN-IN THAT DID NOT SIGN IN IS ALSO A 401, and it is not a lost session: only a call made with one is. */
            if path.hasPrefix("/auth/") && !path.hasPrefix("/auth/app/refresh") {
                throw (try? JSONDecoder().decode(Envelope<JSONValue>.self, from: data).refusal).map { CallFailure.refused($0) } ?? .signedOut
            }
            Session.shared.lost()
            throw CallFailure.signedOut
        case 429:
            let seconds = Int(http.value(forHTTPHeaderField: "retry-after") ?? "") ?? 60
            throw CallFailure.locked(seconds: seconds)
        default:
            if let refusal = try? JSONDecoder().decode(Envelope<JSONValue>.self, from: data).refusal { throw CallFailure.refused(refusal) }
            throw CallFailure.failed(status: http.statusCode)
        }
    }
}

/// `{ ok: true, value }` or `{ ok: false, refusal }`, and `retryAfter` on a 429.
nonisolated private struct Envelope<T: Decodable>: Decodable {
    let ok: Bool
    let value: T?
    let refusal: Refusal?
    let retryAfter: Int?
}

/// Any JSON value, for the bodies native sends and the answers it hands through to JavaScriptCore without reading.
nonisolated public enum JSONValue: Codable, Sendable, Equatable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let b = try? c.decode(Bool.self) { self = .bool(b) }
        else if let n = try? c.decode(Double.self) { self = .number(n) }
        else if let s = try? c.decode(String.self) { self = .string(s) }
        else if let a = try? c.decode([JSONValue].self) { self = .array(a) }
        else { self = .object(try c.decode([String: JSONValue].self)) }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let b): try c.encode(b)
        case .number(let n): try c.encode(n)
        case .string(let s): try c.encode(s)
        case .array(let a): try c.encode(a)
        case .object(let o): try c.encode(o)
        }
    }

    /// The value as JSON text, for JavaScriptCore.
    public var text: String {
        guard let data = try? JSONEncoder().encode(self) else { return "null" }
        return String(decoding: data, as: UTF8.self)
    }

    public subscript(key: String) -> JSONValue? {
        if case .object(let o) = self { return o[key] }
        return nil
    }

    public var string: String? {
        if case .string(let s) = self { return s }
        return nil
    }
}

nonisolated extension JSONValue: ExpressibleByStringLiteral, ExpressibleByDictionaryLiteral, ExpressibleByBooleanLiteral {
    public init(stringLiteral value: String) { self = .string(value) }
    public init(dictionaryLiteral elements: (String, JSONValue)...) { self = .object(Dictionary(uniqueKeysWithValues: elements)) }
    public init(booleanLiteral value: Bool) { self = .bool(value) }
}

/// An empty answer, `{}`, which most sign-in routes give.
nonisolated public struct Nothing: Decodable, Sendable {}

/// A file as the record keeps it (`PUT /api/files`): its hash, type and size. A row's file field holds it with a name.
nonisolated public struct SentFile: Codable, Sendable, Equatable {
    public let sha256: String
    public let mime: String
    public let bytes: Int
}
