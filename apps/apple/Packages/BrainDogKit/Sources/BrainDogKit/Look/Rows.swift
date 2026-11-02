import SwiftUI

/// A row of a list (`loop/DESIGN-SYSTEM.md`, Rows and lists): subject, then detail, then figure, then when, read left to
/// right, at most one line of detail, in at most two inks (ink for the subject, ink-3 for the rest). 44 tall at least.
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
                Text(subject).font(Typeface.bodyMedium).foregroundStyle(Palette.ink).lineLimit(2)
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
        .frame(minHeight: Space.tap)
        .padding(.vertical, Space.s2)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

/// Rows of one list on a tile, with a `--rule` hairline between them and none under the last.
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

/// One `--rule` hairline, a pixel at any scale.
public struct Hairline: View {
    @Environment(\.displayScale) private var scale
    public init() {}
    public var body: some View {
        Rectangle().fill(Palette.rule).frame(height: 1 / max(scale, 1)).accessibilityHidden(true)
    }
}
