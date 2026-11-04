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

    /// One line due next: a reminder an automation put on Today ("remind me on Today"), in the record's words.
    public struct Due: Codable, Sendable, Equatable, Identifiable, Hashable {
        public let text: String
        public let at: String
        /// When it falls due as a day ("Thu 5 Nov"), and its amount with its sign ("−$2,600"): a date on the money, not a reminder.
        public var day: String? = nil
        public var figure: String? = nil
        public var id: String { "\(at) \(text)" }
    }

    public var waiting: Int
    public var questions: [Question]
    public var figures: [Figure]
    public var record: String?
    public var readAt: Date
    /// What is due next on Today (`todayReminders`, newest first, at most eight); nil from a glance kept before M5's
    /// second pass.
    public var due: [Due]? = nil

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
            Figure(metric: "cash-now", label: "Cash now", said: "£12,480", met: true),
            Figure(metric: "runway-days", label: "Days the money lasts", said: "119 days", met: false),
            Figure(metric: "owed-to-me", label: "Owed to you", said: "£4,800", met: nil),
        ],
        record: "The Studio",
        readAt: Date(),
        due: [
            Due(text: "Studio rent", at: "2026-11-06", day: "Fri 6 Nov", figure: "−£1,850"),
            Due(text: "Invoice to Acme", at: "2026-11-09", day: "Mon 9 Nov", figure: "+£4,800"),
        ]
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
                /* WHAT TODAY'S COMING UP READS: dates on the money in the next two weeks, for Due next. */
                ["kind": "timeline", "source": "deadlines", "horizon": .number(14), "where": "amount is set, day after -1d", "limit": .number(4),
                 "columns": .array([["field": "day"], ["field": "title"], ["field": "amount"]])],
            ]),
        ]
        async let reminders = try? Client.shared.call("todayReminders", [:], as: JSONValue.self)
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
        let told = (await reminders)?["lines"]?.array?.compactMap { r -> Glance.Due? in
            guard let text = r["text"]?.string, let at = r["at"]?.string else { return nil }
            return Glance.Due(text: text, at: at)
        } ?? []
        let dated = (blocks.first { $0["source"]?.string == "deadlines" }?["rows"]?.array ?? []).compactMap { row -> Glance.Due? in
            guard let fields = row["fields"], let title = fields["title"]?.string, let day = fields["day"]?.string else { return nil }
            var figure: String?
            if let amount = fields["amount"]?["amount"]?.number, let code = fields["amount"]?["currency"]?.string {
                figure = (fields["direction"]?.string == "in" ? "+" : "−") + Money.said(minor: abs(amount), currency: code)
            }
            return Glance.Due(text: title, at: day, day: Said.date(day).map { Said.day($0, weekday: true) }, figure: figure)
        }
        return Glance(waiting: waiting, questions: questions, figures: figures, record: Kept.load("boot", as: Boot.self)?.record?.name, readAt: Date(), due: told + dated)
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
            let changed = glance.waiting != kept?.waiting || glance.questions != kept?.questions || glance.figures != kept?.figures || glance.due != kept?.due
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

    static let symbols: [String: String] = ["USD": "$", "GBP": "£", "EUR": "€", "JPY": "¥", "INR": "₹", "CAD": "CA$", "AUD": "A$"]

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
        /* THE SIGN THE PAGE DRAWS WHERE THERE IS ONE ("$48,210", as Today says it); a code that has none stays a code. */
        if let symbol = symbols[code] { return "\(negative && !zero ? "−" : "")\(symbol)\(body)" }
        return "\(code) \(negative && !zero ? "−" : "")\(body)"
    }
}
