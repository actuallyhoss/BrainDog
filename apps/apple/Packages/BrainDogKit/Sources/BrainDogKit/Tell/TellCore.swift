import Foundation
import JavaScriptCore

/// The web's Tell reader, run on the device in JavaScriptCore with no web view (plan 3.9).
///
/// THE SAME CODE AS TODAY'S CARD. `tell-core.js` is `apps/web/src/lib/tell/native.ts` bundled (`tools/tell-core.mjs`):
/// the web's own `tellRead`, and `tellOptions`, which builds what it reads against from `boot` and the lists'
/// declarations. Swift passes those two answers through as JSON without reading them and gets `Told` back, so "That
/// becomes" in the Tell sheet is what Today would have said for the same line.
///
/// ONE CONTEXT, MADE ONCE, on the main actor: reading a line takes a few milliseconds, and a sheet reads as a person types.
public final class TellCore {
    public static let shared = TellCore()

    private let context: JSContext
    private let api: JSValue?
    /// The last exception the reader threw, said for a developer and never to a person.
    public private(set) var fault: String?

    public convenience init() {
        let url = Bundle.module.url(forResource: "tell-core", withExtension: "js")
        self.init(source: url.flatMap { try? String(contentsOf: $0, encoding: .utf8) } ?? "")
    }

    /// A reader over a bundle given as text, for a check outside the app.
    public init(source: String) {
        context = JSContext()
        context.name = "BrainDog Tell"
        var thrown: String?
        context.exceptionHandler = { _, exception in thrown = exception?.toString() }
        context.evaluateScript(source, withSourceURL: URL(string: "braindog://tell-core.js"))
        api = context.objectForKeyedSubscript("BrainDogTell")
        fault = thrown
        context.exceptionHandler = { [weak self] _, exception in self?.fault = exception?.toString() }
    }

    /// Whether the bundle loaded and exposes the reader.
    public var loaded: Bool { api?.isObject == true && fault == nil }

    /// What a line is read against: `boot`, the lists' declarations by id, the reader's day (`YYYY-MM-DD`), and what the
    /// app has learnt of the record (`titled`, `people`, `accounts`, `held`, `me`), each as JSON text.
    public func options(boot: String, schemas: String, today: String, known: String = "{}") -> String? {
        api?.invokeMethod("optionsJSON", withArguments: [boot, schemas, today, known])?.toString()
    }

    /// One line read: `Told` as JSON text (`rows`, `left`, `why`, `offers`, ...), or nil when the reader threw.
    public func read(_ sentence: String, options: String) -> String? {
        fault = nil
        let out = api?.invokeMethod("readJSON", withArguments: [sentence, options])
        return fault == nil ? out?.toString() : nil
    }

    /// One line read and decoded: what the sheet draws as "That becomes".
    public func told(_ sentence: String, options: String) -> Told? {
        guard let text = read(sentence, options: options) else { return nil }
        return try? JSONDecoder().decode(Told.self, from: Data(text.utf8))
    }
}

/// What a line became (`Told` in `read.ts`): the entries, the words left over, and why, when nothing could be placed.
nonisolated public struct Told: Decodable, Sendable, Equatable {
    public struct Row: Decodable, Sendable, Equatable {
        public let register: String
        public let fields: JSONValue
        /// "An order from Nadia".
        public let said: String
        /// "3 vanilla jars, due Friday".
        public let detail: String
        public let icon: String
        /// What the line did not give, as a person reads it. The entry waits until it is given.
        public let missing: [String]
    }

    public let rows: [Row]
    public let left: [String]
    public let why: String?
    public let offers: [Row]?

    /// "That becomes": each entry's two lines, as the card reads them.
    public var becomes: [String] { rows.map { $0.detail.isEmpty ? $0.said : "\($0.said): \($0.detail)" } }
}
