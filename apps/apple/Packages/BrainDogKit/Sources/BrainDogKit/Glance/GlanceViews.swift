import SwiftUI

/// The sizes a glance is drawn at: the Home Screen's small and medium, and the Lock Screen's two.
public enum GlanceSize: Sendable {
    case small, medium, circular, rectangular
}

/// The address a glance's press opens, as the app reads it (`braindog://open?path=`, `braindog://tell`).
public enum GlanceLink {
    public static func open(_ path: String) -> URL {
        var c = URLComponents()
        c.scheme = "braindog"
        c.host = "open"
        c.queryItems = [URLQueryItem(name: "path", value: path)]
        return c.url ?? URL(string: "braindog://open")!
    }

    public static let tell = URL(string: "braindog://tell")!
    public static let needs = open("/decide")
    public static let today = open("/")
}

/// The small heading a glance starts with: its glyph and its name, quiet, with what it counts at the far end.
struct GlanceHead: View {
    let glyph: Glyph
    let title: String
    var count: Int? = nil

    var body: some View {
        HStack(spacing: Space.s1 + 2) {
            glyph.image.resizable().scaledToFit().frame(width: 15, height: 15).foregroundStyle(Palette.ink3)
            Text(title).font(Typeface.caption).foregroundStyle(Palette.ink2).lineLimit(1).minimumScaleFactor(0.8)
            Spacer(minLength: 0)
            if let count, count > 0 {
                Text(count.formatted()).font(Typeface.tileHeading).foregroundStyle(Palette.red)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// What a glance says when it has nothing to show: its glyph in a well and one line, centred in what room there is, so an
/// empty widget reads as finished and not as one that failed to load.
struct GlanceEmpty: View {
    let glyph: Glyph
    let line: String

    var body: some View {
        VStack(spacing: Space.s2) {
            IconWell(glyph, size: .l)
            Text(line).font(Typeface.meta).foregroundStyle(Palette.ink3).multilineTextAlignment(.center).lineLimit(3)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// Needs you at a glance (plan 3.10): the count, red when above nought as the design system allows for that count, and
/// the first questions in the record's own words.
public struct NeedsGlance: View {
    let glance: Glance?
    let size: GlanceSize

    public init(_ glance: Glance?, size: GlanceSize) {
        self.glance = glance
        self.size = size
    }

    public var body: some View {
        switch size {
        case .small: small
        case .medium: medium
        case .circular: circular
        case .rectangular: rectangular
        }
    }

    private var count: Int { glance?.waiting ?? 0 }

    private var countText: some View {
        /* NOT TABULAR: it stands alone, and Jakarta's tabular 1 carries a foot that reads as an l. */
        Text(count.formatted())
            .font(Typeface.hero)
            .tracking(Typeface.tight(30))
            .foregroundStyle(count > 0 ? Palette.red : Palette.ink)
            .contentTransition(.numericText())
            .accessibilityLabel(count > 0 ? Words.waitCount(count) : Words.nothingWaits)
    }

    private var small: some View {
        VStack(alignment: .leading, spacing: Space.s1) {
            GlanceHead(glyph: .decide, title: Words.needsYou)
            if let glance {
                if let first = glance.questions.first {
                    Spacer(minLength: 0)
                    countText
                    Text(first.question).font(Typeface.meta).foregroundStyle(Palette.ink2).lineLimit(2)
                } else {
                    GlanceEmpty(glyph: .check, line: Words.nothingWaits)
                }
            } else {
                GlanceEmpty(glyph: .lock, line: Words.signInToSee)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    private var medium: some View {
        VStack(alignment: .leading, spacing: Space.s2) {
            GlanceHead(glyph: .decide, title: Words.needsYou, count: glance?.waiting)
            if let glance {
                if glance.questions.isEmpty {
                    GlanceEmpty(glyph: .check, line: Words.nothingWaits)
                } else {
                    /* ONE QUESTION TAKES THE ROOM OF THREE, at a size to read; several are a list that fills the card. */
                    let lines = Array(glance.questions.prefix(3))
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(lines.enumerated()), id: \.element.id) { i, q in
                            Link(destination: GlanceLink.open(q.path)) {
                                Text(q.question)
                                    .font(lines.count == 1 ? Typeface.bodyMedium : Typeface.meta)
                                    .foregroundStyle(Palette.ink)
                                    .lineLimit(lines.count == 1 ? 3 : 2)
                                    .leading(lines.count == 1 ? .row : .meta)
                                    .multilineTextAlignment(.leading)
                                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                            }
                            if i < lines.count - 1 { Hairline() }
                        }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                }
            } else {
                GlanceEmpty(glyph: .lock, line: Words.signInToSee)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private var circular: some View {
        VStack(spacing: 0) {
            Glyph.decide.image.resizable().scaledToFit().frame(width: 16, height: 16)
            Text(glance.map { $0.waiting.formatted() } ?? "–").font(Typeface.figure)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(glance.map { $0.waiting > 0 ? Words.waitCount($0.waiting) : Words.nothingWaits } ?? Words.signInToSee)
    }

    private var rectangular: some View {
        VStack(alignment: .leading, spacing: 1) {
            HStack(spacing: 4) {
                Glyph.decide.image.resizable().scaledToFit().frame(width: 13, height: 13)
                Text(glance.map { $0.waiting > 0 ? "\(Words.needsYou) \($0.waiting)" : Words.needsYou } ?? Words.needsYou)
                    .font(Typeface.caption)
            }
            Text(glance?.questions.first?.question ?? (glance == nil ? Words.signInToSee : Words.nothingWaits))
                .font(Typeface.meta).lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var signedOut: some View {
        Text(Words.signInToSee).font(Typeface.meta).foregroundStyle(Palette.ink3).lineLimit(3)
    }
}

/// Today's key numbers at a glance: the Home figures, each its name and its reading, red only where it misses its own
/// target, as Today marks it.
public struct NumbersGlance: View {
    let glance: Glance?
    let size: GlanceSize

    public init(_ glance: Glance?, size: GlanceSize) {
        self.glance = glance
        self.size = size
    }

    private var most: Int { size == .medium ? 4 : 2 }

    public var body: some View {
        VStack(alignment: .leading, spacing: Space.s2) {
            GlanceHead(glyph: .observe, title: Words.keyNumbers)
            if let glance {
                if glance.figures.isEmpty {
                    GlanceEmpty(glyph: .observe, line: Words.noKeyNumbers)
                } else if size == .medium {
                    Spacer(minLength: 0)
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: Space.s4, alignment: .topLeading), GridItem(.flexible(), alignment: .topLeading)],
                              alignment: .leading, spacing: Space.s3) {
                        ForEach(glance.figures.prefix(most)) { figure($0) }
                    }
                } else {
                    Spacer(minLength: 0)
                    VStack(alignment: .leading, spacing: Space.s2) {
                        ForEach(glance.figures.prefix(most)) { figure($0) }
                    }
                }
            } else {
                GlanceEmpty(glyph: .lock, line: Words.signInToSee)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func figure(_ f: Glance.Figure) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(f.label).font(Typeface.caption).foregroundStyle(Palette.ink3).lineLimit(1)
            Text(f.said)
                .font(Typeface.figure)
                .foregroundStyle(f.met == false ? Palette.red : Palette.ink)
                .tracking(Typeface.tight(22))
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .accessibilityElement(children: .combine)
    }
}

/// The Tell button: one press opens Tell with the keyboard up.
public struct TellGlance: View {
    let size: GlanceSize

    public init(size: GlanceSize) { self.size = size }

    public var body: some View {
        if size == .circular {
            Glyph.plus.image.resizable().scaledToFit().frame(width: 22, height: 22)
                .accessibilityLabel(Words.tellTitle)
        } else {
            VStack(alignment: .leading, spacing: Space.s2) {
                IconWell(.plus, size: .card)
                Spacer(minLength: 0)
                Text(Words.tellTitle).font(Typeface.tileHeading).foregroundStyle(Palette.ink)
                Text("Say one thing. It goes in the right place.").font(Typeface.meta).foregroundStyle(Palette.ink3).lineLimit(2)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        }
    }
}

/// What is due next (M5): the reminders automations put on Today, newest first, in the record's words.
public struct DueGlance: View {
    let glance: Glance?
    let size: GlanceSize

    public init(_ glance: Glance?, size: GlanceSize) {
        self.glance = glance
        self.size = size
    }

    private var most: Int { size == .medium ? 3 : 2 }

    /// The Lock Screen's line: what falls due next and how much, or why there is none.
    private var dueLine: String {
        guard let glance else { return Words.signInToSee }
        guard let first = glance.due?.first else { return Words.nothingDue }
        return [first.day, first.text, first.figure].compactMap { $0 }.joined(separator: " · ")
    }

    public var body: some View {
        if size == .rectangular {
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 4) {
                    Glyph.clock.image.resizable().scaledToFit().frame(width: 13, height: 13)
                    Text(Words.dueNext).font(Typeface.caption)
                }
                Text(dueLine).font(Typeface.meta).lineLimit(2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            VStack(alignment: .leading, spacing: Space.s2) {
                GlanceHead(glyph: .clock, title: Words.dueNext)
                if let glance {
                    let due = glance.due ?? []
                    if due.isEmpty {
                        GlanceEmpty(glyph: .check, line: Words.nothingDue)
                    } else if size == .medium {
                        VStack(spacing: 0) {
                            ForEach(Array(due.prefix(most).enumerated()), id: \.element.id) { index, line in
                                DueLine(line: line)
                                    .frame(maxHeight: .infinity)
                                if index < min(due.count, most) - 1 { Hairline() }
                            }
                        }
                        .frame(maxHeight: .infinity, alignment: .top)
                    } else if let line = due.first {
                        Spacer(minLength: 0)
                        if let figure = line.figure {
                            Text(figure).font(Typeface.figure).tracking(Typeface.tight(22)).foregroundStyle(Palette.ink).lineLimit(1).minimumScaleFactor(0.6)
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            Text(line.text).font(Typeface.meta).foregroundStyle(Palette.ink).lineLimit(2).leading(.meta)
                            if let day = line.day { Text(day).font(Typeface.caption).foregroundStyle(Palette.ink3).lineLimit(1) }
                        }
                    }
                } else {
                    GlanceEmpty(glyph: .lock, line: Words.signInToSee)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }
}

/// One line of Due next on a wide card: the day, what falls due, and its amount at the far end.
private struct DueLine: View {
    let line: Glance.Due

    var body: some View {
        HStack(spacing: Space.s3) {
            if let day = line.day {
                Text(day).font(Typeface.caption).foregroundStyle(Palette.ink3).lineLimit(1).frame(width: 68, alignment: .leading)
            }
            Text(line.text).font(Typeface.meta).foregroundStyle(Palette.ink).lineLimit(1)
            Spacer(minLength: Space.s2)
            if let figure = line.figure {
                Text(figure).font(Typeface.meta).monospacedDigit().foregroundStyle(figure.hasPrefix("+") ? Palette.good : Palette.ink).lineLimit(1)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// One of Today's numbers, the one he picked in the widget's settings, large: its name, its reading, red only where it
/// misses its own target.
public struct FigureGlance: View {
    let glance: Glance?
    let metric: String?

    public init(_ glance: Glance?, metric: String?) {
        self.glance = glance
        self.metric = metric
    }

    private var figure: Glance.Figure? {
        guard let figures = glance?.figures else { return nil }
        return figures.first { $0.metric == metric } ?? (metric == nil ? figures.first : nil)
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: Space.s1) {
            GlanceHead(glyph: .observe, title: Words.todayNumber)
            if let figure {
                Spacer(minLength: 0)
                Text(figure.said)
                    .font(Typeface.hero)
                    .tracking(Typeface.tight(30))
                    .foregroundStyle(figure.met == false ? Palette.red : Palette.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                Text(figure.label).font(Typeface.meta).foregroundStyle(Palette.ink2).lineLimit(2).leading(.meta)
            } else {
                GlanceEmpty(glyph: glance == nil ? .lock : .observe, line: glance == nil ? Words.signInToSee : Words.pickNumber)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .accessibilityElement(children: .combine)
    }
}
