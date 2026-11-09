import Foundation

/// The record's calls the native screens make, each the same call the web makes for the same thing (plan 3.1, `Calls`):
/// `boot`, the lists' declarations, `search`, the person's BrainDogs and the switch between them, the questions waiting
/// (`previewPage` over Needs you's two queues), an answer and a Later, `capture` and its Undo.
///
/// EACH ANSWER IS READ ONLY AS FAR AS A NATIVE SCREEN DRAWS IT. What JavaScriptCore reads (`boot` and the declarations,
/// for the Tell reader) is handed through whole as `JSONValue`, never re-typed here, so the reader sees what the web's sees.
public enum Calls {
    // MARK: boot

    /// `boot`, read for the native screens and kept whole for the Tell reader.
    public static func boot() async throws(CallFailure) -> (Boot, JSONValue) {
        let raw: JSONValue = try await Client.shared.call("boot")
        guard let boot = raw.decoded(as: Boot.self) else { throw CallFailure.failed(status: 200) }
        return (boot, raw)
    }

    /// Every list's declaration, by list id (`schemas` with `every`), as the web's first screen asks for them.
    public static func schemas() async throws(CallFailure) -> JSONValue {
        let raw: JSONValue = try await Client.shared.call("schemas", ["every": true])
        return raw["lists"] ?? .object([:])
    }

    // MARK: search

    /// Entries whose words match, as the web's search asks (`search`, at most 30).
    public static func search(_ q: String) async throws(CallFailure) -> [Hit] {
        let raw: JSONValue = try await Client.shared.call("search", ["q": .string(q), "limit": .number(30)])
        /* AN OLDER HOST ANSWERS THE HITS ALONE, a newer one `{ hits, matched }`: both are read (`search-live.ts` `answered`). */
        let hits = raw["hits"] ?? raw
        return hits.decoded(as: [Hit].self) ?? []
    }

    // MARK: the person's BrainDogs

    /// Every BrainDog this person can reach, named and levelled by each (`GET /account/records`).
    public static func reach() async throws(CallFailure) -> [Reach] {
        try await Client.shared.get("/account/records", as: [Reach].self)
    }

    /// Open another of them on this session (`/auth/switch`): the session moves, and every screen reads it afresh.
    public static func open(_ slug: String) async throws(CallFailure) {
        _ = try await Client.shared.auth("/auth/switch", ["slug": .string(slug)], as: JSONValue.self)
    }

    /// Whether this person runs the host (`GET /account/ops/me`, the question the web's sidebar asks before it draws
    /// Admin): true or false as the host said, nil when it could not be asked, so a kept answer stands.
    public static func isOperator() async -> Bool? {
        do {
            let said = try await Client.shared.get("/account/ops/me", as: JSONValue.self)
            return said["operator"] == .bool(true)
        } catch .failed(let status) where status == 404 {
            return false
        } catch {
            return nil
        }
    }

    // MARK: Needs you

    /// What waits on the reader and what was put off, as Needs you's own body reads them (`previewPage`, writing nothing).
    public static func needs() async throws(CallFailure) -> Needs {
        let body: JSONValue = [
            "page": "decide",
            "title": "Needs you",
            "blocks": .array([
                ["kind": "queue", "source": "governance.open", "limit": .number(60)],
                ["kind": "queue", "source": "governance.later", "limit": .number(30)],
            ]),
        ]
        let raw: JSONValue = try await Client.shared.call("previewPage", ["body": body])
        let blocks = raw["blocks"]?.decoded(as: [QueueBlock].self) ?? []
        let open = blocks.first { $0.source == "governance.open" }
        let later = blocks.first { $0.source == "governance.later" }
        return Needs(open: open?.queue ?? [], later: later?.queue ?? [], waiting: max(open?.matched ?? 0, open?.queue?.count ?? 0), readAt: Date())
    }

    /// Answer a question with one of its options. Sent without a reason, so the record says whether it wants one
    /// (`decide-write.ts`): a question that does answers `.wantsReason`, and its card is opened to give it.
    public static func answer(_ id: String, option: String) async throws(CallFailure) -> Answered {
        do {
            let raw: JSONValue = try await Client.shared.call("decide", ["id": .string(id), "decide": ["option": .string(option)]])
            return .written(decision: raw["decision"]?.string)
        } catch .refused(let refusal) where refusal.code == "REQUIRED_MISSING" && refusal.at == "reason" {
            return .wantsReason
        }
    }

    /// Take an answer back: the question opens again as it was (`undo` by decision, the card's Undo).
    public static func undo(decision: String) async throws(CallFailure) {
        _ = try await Client.shared.call("undo", ["decision": .string(decision)], as: JSONValue.self)
    }

    /// Put a question off until a day (`YYYY-MM-DD`), with why it can wait, as the card's Later does.
    public static func later(_ id: String, until day: String, why: String) async throws(CallFailure) {
        _ = try await Client.shared.call("decide", ["id": .string(id), "defer": ["until": .string(day), "why": .string(why)]], as: JSONValue.self)
    }

    // MARK: Tell

    /// Add every ready entry in one batch (`capture`), as Today's Tell card does.
    public static func capture(_ rows: JSONValue) async throws(CallFailure) -> Captured {
        try await Client.shared.call("capture", ["rows": rows], as: Captured.self)
    }

    /// Take a batch back: the receipt's Undo (`undo` by batch, `undoChange` in the web).
    public static func undo(batch: String) async throws(CallFailure) {
        _ = try await Client.shared.call("undo", ["batch": .string(batch)], as: JSONValue.self)
    }
}

// MARK: - answers

/// What native reads of `boot`: the lists and their glyphs, who is asking and at what level, the record's name and
/// currency, how many questions wait, and the declared pages with where each sits in the navigation.
nonisolated public struct Boot: Codable, Sendable, Equatable {
    public struct List: Codable, Sendable, Equatable, Identifiable {
        public let id: String
        public let name: String
        public let count: Int?
        public let icon: String?
        /// A list the kernel declares itself (the runs, what he told them): never offered as a place.
        public let kernel: Bool?
    }

    public struct Me: Codable, Sendable, Equatable {
        public let person: String?
        public let name: String?
        public let level: String?
        public let levels: [String: String]?
    }

    public struct Named: Codable, Sendable, Equatable {
        public let slug: String
        public let name: String
    }

    public struct Counts: Codable, Sendable, Equatable {
        public let decide: Int?
    }

    public struct Page: Codable, Sendable, Equatable, Identifiable {
        public struct Nav: Codable, Sendable, Equatable {
            public let section: String
            public let order: Double?
        }
        public let slug: String
        public let title: String
        public let icon: String?
        public let nav: Nav?
        public var id: String { slug }
    }

    public let registers: [List]
    public let me: Me?
    public let record: Named?
    public let currency: String?
    public let counts: Counts?
    public let pages: [Page]?

    /// The reader's level on the record as a whole.
    public var level: Level { Level(me?.level) }
}

/// What somebody holds on a BrainDog, said as the product says it (plan 3.6, Roles).
nonisolated public enum Level: String, Sendable, Equatable {
    case owner, decide, write, append, read, none

    public init(_ word: String?) { self = word.flatMap(Level.init(rawValue:)) ?? .none }

    /// "Owner", "Can decide", "Can write", "Can add", "Can read".
    public var word: String {
        switch self {
        case .owner: "Owner"
        case .decide: "Can decide"
        case .write: "Can write"
        case .append: "Can add"
        case .read: "Can read"
        case .none: "Some lists"
        }
    }

    /// May answer any question on the record.
    public var decides: Bool { self == .owner || self == .decide }
    /// May add entries, so Tell is offered.
    public var adds: Bool { decides || self == .write || self == .append }
}

/// One entry the search found: its list, its number in that list, and its title.
nonisolated public struct Hit: Decodable, Sendable, Equatable, Identifiable, Hashable {
    public let register: String
    public let seq: Int
    public let title: String
    public var id: String { "\(register)/\(seq)" }
    /// Its own page in the web app.
    public var path: String { "/r/\(register)/\(seq)" }
}

/// A BrainDog this person can reach, and the level they hold there (`SwitcherRow`); `level` is absent for somebody who
/// holds some of its lists only, who is said by the host's own `words` ("Some lists: Tickets").
nonisolated public struct Reach: Decodable, Sendable, Equatable, Identifiable {
    public let slug: String
    public let name: String
    public let level: String?
    public let words: String?
    public let held: String?
    public var id: String { slug }

    public init(slug: String, name: String, level: String?, words: String?, held: String?) {
        self.slug = slug
        self.name = name
        self.level = level
        self.words = words
        self.held = held
    }

    /// The plain word beside its name.
    public var role: String { level.map { Level($0).word } ?? words ?? held ?? Level.none.word }
}

/// One question waiting, as the `governance.open` and `governance.later` queues read it (`QueueQuestion`).
nonisolated public struct Question: Decodable, Sendable, Equatable, Identifiable, Hashable {
    public struct Option: Decodable, Sendable, Equatable, Hashable {
        public let key: String
        public let label: String
        public let because: String?
        public let recommended: Bool?
        public let hard: Bool?
    }

    public struct Amount: Decodable, Sendable, Equatable, Hashable {
        public let amount: Double
        public let currency: String
    }

    public let id: String
    public let who: String?
    public let at: String?
    public let kind: String?
    public let question: String
    public let why: String?
    /// What getting it wrong costs (`undo`, `shape`, `rows`, `call`), cheapest last.
    public let cost: String?
    public let options: [Option]
    public let decider: String?
    public let until: String?
    public let money: [Amount]?

    /// The answer one press may give, the web's Enter (`press.ts` `acceptKey`): none on a question that is hard to undo
    /// or moves money, none when the suggested answer is itself the hard one; else the suggested answer, or Accept on a
    /// question the record answers with Accept and Decline.
    public var quickAnswer: Option? {
        guard cost != "undo", money?.isEmpty ?? true else { return nil }
        if let suggested = options.first(where: { $0.recommended == true }) { return suggested.hard == true ? nil : suggested }
        let keys = Set(options.map(\.key))
        return keys == ["accept", "reject"] ? options.first { $0.key == "accept" } : nil
    }

    /// Its card in the web app, where it is examined and answered whole.
    public var path: String { "/decide/\(id)" }
}

nonisolated struct QueueBlock: Decodable, Sendable {
    let source: String?
    let queue: [Question]?
    let matched: Int?
}

/// Needs you, read: what waits now, what was put off, how many wait in all, and when it was read.
nonisolated public struct Needs: Codable, Sendable, Equatable {
    public var open: [Question]
    public var later: [Question]
    public var waiting: Int
    public var readAt: Date

    public static let empty = Needs(open: [], later: [], waiting: 0, readAt: .distantPast)
}

extension Question: Encodable {}
extension Question.Option: Encodable {}
extension Question.Amount: Encodable {}

/// How an answer went.
nonisolated public enum Answered: Sendable, Equatable {
    case written(decision: String?)
    /// The record wants a sentence of why before it takes this answer: the card is where it is given.
    case wantsReason
}

/// What `capture` made: the batch one Undo takes back, and each entry in the order sent.
nonisolated public struct Captured: Decodable, Sendable, Equatable {
    public struct Made: Decodable, Sendable, Equatable {
        public let register: String
        public let seq: Int?
        public let title: String?
    }
    public let batch: String
    public let made: [Made]
}

// MARK: - JSONValue, read further

nonisolated public extension JSONValue {
    /// The value decoded as `T`, through its JSON text, or nil when it is not that shape.
    func decoded<T: Decodable>(as: T.Type) -> T? {
        guard let data = try? JSONEncoder().encode(self) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    var array: [JSONValue]? {
        if case .array(let a) = self { return a }
        return nil
    }

    var number: Double? {
        if case .number(let n) = self { return n }
        return nil
    }
}
