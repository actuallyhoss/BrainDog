import SwiftUI

/// A row of a list (`loop/DESIGN-SYSTEM.md`, Rows and lists): subject, then detail, then figure, then when, read left to
/// right, at most one line of detail, in at most two inks (ink for the subject, ink-3 for the rest). Its words sit 12
/// from its top and foot, and it is 44 tall at least (`Space.rowY`).
public struct Row: View {
    let glyph: Glyph?
    let tone: IconWell.Tone
    let subject: String
    let detail: String?
    let figure: String?
    let when: String?

    public init(_ subject: String, detail: String? = nil, figure: String? = nil, when: String? = nil, glyph: Glyph? = nil, tone: IconWell.Tone = .neutral) {
        self.subject = subject
        self.detail = detail
        self.figure = figure
        self.when = when
        self.glyph = glyph
        self.tone = tone
    }

    public var body: some View {
        HStack(alignment: .center, spacing: Space.s3) {
            if let glyph { IconWell(glyph, size: .l, tone: tone) }
            VStack(alignment: .leading, spacing: 2) {
                Text(subject).font(Typeface.bodyMedium).foregroundStyle(Palette.ink).lineLimit(2).leading(.row)
                if let detail { Text(detail).font(Typeface.meta).foregroundStyle(Palette.ink3).lineLimit(1) }
            }
            Spacer(minLength: Space.s2)
            if figure != nil || when != nil {
                VStack(alignment: .trailing, spacing: 2) {
                    if let figure { Text(figure).font(Typeface.bodyMedium).monospacedDigit().foregroundStyle(Palette.ink) }
                    if let when { Text(when).font(Typeface.meta).monospacedDigit().foregroundStyle(Palette.ink3) }
                }
            }
        }
        .padding(.vertical, Space.rowY)
        .frame(minHeight: Space.tap)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

/// Rows of one list on a card, with a hairline between them that starts at the text edge and none under the last.
public struct Rows<Item: Identifiable, Content: View>: View {
    let items: [Item]
    let content: (Item) -> Content

    public init(_ items: [Item], @ViewBuilder content: @escaping (Item) -> Content) {
        self.items = items
        self.content = content
    }

    public var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                content(item)
                if index < items.count - 1 { Hairline() }
            }
        }
    }
}

/// One `--rule` hairline, a pixel at any scale, with round ends. `leading` sets it in from the row's edge to where the
/// words start (a row with a 32 well: 44), so the line never runs under a glyph.
public struct Hairline: View {
    @Environment(\.displayScale) private var scale
    let leading: CGFloat
    public init(leading: CGFloat = 0) { self.leading = leading }
    public var body: some View {
        Capsule().fill(Palette.rule).frame(height: 1 / max(scale, 1)).padding(.leading, leading).accessibilityHidden(true)
    }
}
