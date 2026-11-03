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

/// The small heading a glance starts with: its glyph and its name in the ops caps label (11, 500, +0.3), quiet.
struct GlanceHead: View {
    let glyph: Glyph
    let title: String
    var count: Int? = nil

    var body: some View {
        HStack(spacing: Space.s1 + 2) {
            glyph.image.resizable().scaledToFit().frame(width: 14, height: 14).foregroundStyle(Palette.ink3)
            Text(title).font(Typeface.caps).textCase(.uppercase).tracking(0.3).foregroundStyle(Palette.ink3).lineLimit(1)
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
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
        Text(count.formatted())
            .font(Typeface.hero)
            .tracking(Typeface.tight(30))
            .foregroundStyle(count > 0 ? Palette.red : Palette.ink)
            .monospacedDigit()
            .contentTransition(.numericText())
            .accessibilityLabel(count > 0 ? Words.waitCount(count) : Words.nothingWaits)
    }

    private var small: some View {
        VStack(alignment: .leading, spacing: Space.s1) {
            GlanceHead(glyph: .decide, title: Words.needsYou)
            Spacer(minLength: 0)
            if let glance {
                countText
                if let first = glance.questions.first {
                    Text(first.question).font(Typeface.meta).foregroundStyle(Palette.ink2).lineLimit(2)
                } else {
                    Text(Words.nothingWaits).font(Typeface.meta).foregroundStyle(Palette.ink3).lineLimit(2)
                }
            } else {
                signedOut
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    private var medium: some View {
        HStack(alignment: .top, spacing: Space.s4) {
            VStack(alignment: .leading, spacing: Space.s1) {
                GlanceHead(glyph: .decide, title: Words.needsYou)
                Spacer(minLength: 0)
                if glance != nil {
                    countText
                    Text(count == 0 ? Words.nothingWaits : (count == 1 ? "waits on you" : "wait on you"))
                        .font(Typeface.meta).foregroundStyle(Palette.ink3).lineLimit(2)
                }
            }
            .frame(width: 92, alignment: .leading)
            .frame(maxHeight: .infinity, alignment: .leading)

            if let glance {
                if glance.questions.isEmpty {
                    Text(Words.nothingNeedsYouLine).font(Typeface.meta).foregroundStyle(Palette.ink3)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                } else {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(glance.questions.prefix(3).enumerated()), id: \.element.id) { i, q in
                            Link(destination: GlanceLink.open(q.path)) {
                                Text(q.question).font(Typeface.meta).foregroundStyle(Palette.ink).lineLimit(2)
                                    .multilineTextAlignment(.leading)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(.vertical, 6)
                            }
                            if i < min(3, glance.questions.count) - 1 { Hairline() }
                        }
                        Spacer(minLength: 0)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                }
            } else {
                signedOut.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            }
        }
    }

    private var circular: some View {
        VStack(spacing: 0) {
            Glyph.decide.image.resizable().scaledToFit().frame(width: 16, height: 16)
            Text(glance.map { $0.waiting.formatted() } ?? "–").font(Typeface.figure).monospacedDigit()
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
                    Spacer(minLength: 0)
                    Text(Words.noKeyNumbers).font(Typeface.meta).foregroundStyle(Palette.ink3).lineLimit(3)
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
                Spacer(minLength: 0)
                Text(Words.signInToSee).font(Typeface.meta).foregroundStyle(Palette.ink3).lineLimit(3)
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
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .monospacedDigit()
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

    public var body: some View {
        if size == .rectangular {
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 4) {
                    Glyph.clock.image.resizable().scaledToFit().frame(width: 13, height: 13)
                    Text(Words.dueNext).font(Typeface.caption)
                }
                Text(glance?.due?.first?.text ?? (glance == nil ? Words.signInToSee : Words.nothingDue)).font(Typeface.meta).lineLimit(2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            VStack(alignment: .leading, spacing: Space.s2) {
                GlanceHead(glyph: .clock, title: Words.dueNext)
                Spacer(minLength: 0)
                if let glance {
                    let due = glance.due ?? []
                    if due.isEmpty {
                        Text(Words.nothingDue).font(Typeface.meta).foregroundStyle(Palette.ink3).lineLimit(3)
                    } else {
                        VStack(alignment: .leading, spacing: Space.s2) {
                            ForEach(Array(due.prefix(most).enumerated()), id: \.element.id) { index, line in
                                Text(line.text)
                                    .font(index == 0 ? Typeface.bodyMedium : Typeface.meta)
                                    .foregroundStyle(index == 0 ? Palette.ink : Palette.ink2)
                                    .lineLimit(2)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }
                    }
                } else {
                    Text(Words.signInToSee).font(Typeface.meta).foregroundStyle(Palette.ink3).lineLimit(3)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
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
            GlanceHead(glyph: .observe, title: figure?.label ?? Words.todayNumber)
            Spacer(minLength: 0)
            if let figure {
                Text(figure.said)
                    .font(Typeface.hero)
                    .foregroundStyle(figure.met == false ? Palette.red : Palette.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                    .monospacedDigit()
                if let record = glance?.record { Text(record).font(Typeface.caption).foregroundStyle(Palette.ink3).lineLimit(1) }
            } else {
                Text(glance == nil ? Words.signInToSee : Words.pickNumber).font(Typeface.meta).foregroundStyle(Palette.ink3).lineLimit(3)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .accessibilityElement(children: .combine)
    }
}
