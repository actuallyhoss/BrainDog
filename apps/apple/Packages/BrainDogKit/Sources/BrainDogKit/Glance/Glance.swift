import Foundation
#if canImport(WidgetKit)
import WidgetKit
#endif

/// What the widgets, the menu bar and "What needs me" show at a glance (plan 3.10): how many questions wait and the first
/// three, and Today's key numbers, the figures the record pins to Home (`figures.home`), each with the reading Today
/// draws for it.
///
/// ONE READ, THE RECORD'S OWN, WRITING NOTHING: `previewPage` over a body of two blocks, Needs you's own queue and the
/// Home figures, so a glance is exactly what those screens would say and the server needs no new door (the plan's S5
/// `glance` call can replace this read later without changing what is drawn).
///
/// KEPT IN THE APP GROUP (`Kept`), so a widget draws at once and the last answer stands in offline; it goes with
/// everything else kept on sign-out, a 401 or access ending.
nonisolated public struct Glance: Codable, Sendable, Equatable {
    public struct Question: Codable, Sendable, Equatable, Identifiable, Hashable {
        public let id: String
        public let question: String
        public var path: String { "/decide/\(id)" }
    }

    /// One key number, said as Today says it.
    public struct Figure: Codable, Sendable, Equatable, Identifiable, Hashable {
        public let metric: String
        public let label: String
        /// "GBP 4,800", "119 days", "12".
        public let said: String
        /// False when it misses the figure's own target (red, as Today marks it); nil when it has none.
        public let met: Bool?
        public var id: String { metric }
    }

    public var waiting: Int
    public var questions: [Question]
    public var figures: [Figure]
    public var record: String?
    public var readAt: Date

    public static let empty = Glance(waiting: 0, questions: [], figures: [], record: nil, readAt: .distantPast)

    /// A record that shows something, for a widget's gallery preview: never a person's real words.
    public static let sample = Glance(
        waiting: 3,
        questions: [
            Question(id: "SG1", question: "Which account pays the studio rent?"),
            Question(id: "SG2", question: "Send Acme a reminder about the invoice?"),
            Question(id: "SG3", question: "Keep the photo shoot in the spring launch?"),
        ],
        figures: [
            Figure(metric: "cash-now", label: "Cash now", said: "GBP 12,480", met: true),
            Figure(metric: "runway-days", label: "Days the money lasts", said: "119 days", met: false),
            Figure(metric: "owed-to-me", label: "Owed to you", said: "GBP 4,800", met: nil),
        ],
        record: "The Studio",
        readAt: Date()
    )
}

public extension Calls {
    /// The glance, read now: Needs you's queue (the first three) and the Home figures, in one `previewPage`.
    static func glance() async throws(CallFailure) -> Glance {
        let body: JSONValue = [
            "page": "glance",
            "title": "Glance",
            "blocks": .array([
                ["kind": "queue", "source": "governance.open", "limit": .number(3)],
                ["kind": "stat", "source": "figures.home"],
            ]),
        ]
        let raw: JSONValue = try await Client.shared.call("previewPage", ["body": body])
        let blocks = raw["blocks"]?.array ?? []
        let queue = blocks.first { $0["source"]?.string == "governance.open" }
        let stat = blocks.first { $0["source"]?.string == "figures.home" }
        let questions = (queue?["queue"]?.array ?? []).compactMap { q -> Glance.Question? in
            guard let id = q["id"]?.string, let text = q["question"]?.string else { return nil }
            return Glance.Question(id: id, question: text)
        }
        let waiting = max(Int(queue?["matched"]?.number ?? 0), questions.count)
        let currency = Kept.load("boot", as: Boot.self)?.currency
        let figures = (stat?["readings"]?.array ?? []).compactMap { Reading.figure($0, currency: currency) }
        return Glance(waiting: waiting, questions: questions, figures: figures, record: Kept.load("boot", as: Boot.self)?.record?.name, readAt: Date())
    }
}

/// The glance kept for the widgets, and read again on the app's say-so.
public enum GlanceStore {
    /// The last glance kept on this device, or nil before the first.
    public static var kept: Glance? { Kept.load("glance", as: Glance.self) }

    /// Read the glance, keep it, and tell the widgets to draw it. The kept one when the read fails; nil signed out.
    @discardableResult
    public static func refresh() async -> Glance? {
        guard Session.shared.signedIn else { return nil }
        do {
            let glance = try await Calls.glance()
            let changed = glance.waiting != kept?.waiting || glance.questions != kept?.questions || glance.figures != kept?.figures
            Kept.save(glance, as: "glance")
            #if canImport(WidgetKit)
            if changed && !Server.isExtension { WidgetCenter.shared.reloadAllTimelines() }
            #endif
            return glance
        } catch {
            return kept
        }
    }

    /// The widgets draw again from what is kept: after sign-out, so nothing of the last person stays on the Home Screen.
    public static func redraw() {
        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadAllTimelines()
        #endif
    }
}

/// A Home figure's reading, said as the web says it (`metrics.ts` `format`, `braindog-render` `money`).
enum Reading {
    static func figure(_ r: JSONValue, currency: String?) -> Glance.Figure? {
        guard let metric = r["metric"]?.string, let label = r["label"]?.string else { return nil }
        let reading = r["reading"]
        let unit = reading?["unit"]?.string
        let value = reading?["value"]
        let format = r["format"]?.string
        let said: String
        switch value {
        case .number(let n)?: said = Self.said(n, format: format, unit: unit, currency: currency)
        case .string(let s)?: said = Double(s).map { Self.said($0, format: format, unit: unit, currency: currency) } ?? s
        default: said = "—"
        }
        let met: Bool? = r["target"] == nil ? nil : { if case .bool(let b)? = reading?["met"] { b } else { nil } }()
        return Glance.Figure(metric: metric, label: label, said: said, met: met)
    }

    static func said(_ n: Double, format: String?, unit: String?, currency: String?) -> String {
        switch format {
        case let f? where f.hasPrefix("money."):
            return Money.said(minor: n, currency: String(f.dropFirst(6)))
        case "money"?:
            let code = unit.flatMap { $0.count == 3 && $0 == $0.uppercased() ? $0 : nil } ?? currency
            return code.map { Money.said(minor: n, currency: $0) } ?? whole(n)
        case "int"?: return whole(n)
        case "pct"?:
            let f = NumberFormatter()
            f.numberStyle = .decimal
            f.maximumFractionDigits = 1
            f.locale = Locale(identifier: "en")
            return (f.string(from: NSNumber(value: n * 100)) ?? "\(n * 100)").replacingOccurrences(of: "-", with: "−") + "%"
        case "days"?:
            let d = Int(n.rounded())
            return d == 1 ? "1 day" : "\(d) days"
        case "day"?:
            return Said.day(Date(timeIntervalSince1970: n.rounded() * 86_400))
        default:
            let f = NumberFormatter()
            f.numberStyle = .decimal
            f.maximumFractionDigits = 2
            f.locale = Locale(identifier: "en")
            return f.string(from: NSNumber(value: n)) ?? "\(n)"
        }
    }

    private static func whole(_ n: Double) -> String {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.maximumFractionDigits = 0
        f.locale = Locale(identifier: "en")
        return f.string(from: NSNumber(value: n.rounded())) ?? "\(Int(n))"
    }
}

/// Money as the record writes it: the code first, then the amount from its minor units, by the digits
/// (`braindog-render` `money`). At a glance a whole amount drops its `.00`, as Today's heroes do.
nonisolated public enum Money {
    static let exponent: [String: Int] = [
        "CLF": 4, "UYW": 4, "BHD": 3, "IQD": 3, "JOD": 3, "KWD": 3, "LYD": 3, "OMR": 3, "TND": 3,
        "BIF": 0, "CLP": 0, "DJF": 0, "GNF": 0, "ISK": 0, "JPY": 0, "KMF": 0, "KRW": 0,
        "PYG": 0, "RWF": 0, "UGX": 0, "UYI": 0, "VND": 0, "VUV": 0, "XAF": 0, "XOF": 0, "XPF": 0,
    ]

    public static func said(minor: Double, currency: String) -> String {
        let code = currency.uppercased()
        let exp = exponent[code] ?? 2
        let negative = minor < 0
        let digits = String(Int64(abs(minor.rounded())))
        let padded = String(repeating: "0", count: max(0, exp + 1 - digits.count)) + digits
        let whole = String(padded.dropLast(exp))
        let part = String(padded.suffix(exp))
        var groups: [String] = []
        var rest = Substring(whole)
        while rest.count > 3 {
            groups.insert(String(rest.suffix(3)), at: 0)
            rest = rest.dropLast(3)
        }
        groups.insert(String(rest), at: 0)
        let grouped = groups.joined(separator: ",")
        let body = exp == 0 || part.allSatisfy({ $0 == "0" }) ? grouped : "\(grouped).\(part)"
        let zero = body.allSatisfy { $0 == "0" || $0 == "," || $0 == "." }
        return "\(code) \(negative && !zero ? "−" : "")\(body)"
    }
}
