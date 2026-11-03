import SwiftUI

/// The one surface for a group, a card: `--tile` on the board at radius 16, lifted by the card shadow in light and
/// edged by a 1px rule in dark (`card()`). A heading row is a neutral 28 circle with an 18 glyph, the title at 15/600,
/// an optional count in ink-3, and one thing at the far end.
///
/// A TILE OF ROWS (`rows: true`) keeps the one text edge and no orphan gap: its sides are 12 (the rows' words and the
/// heading's circle start where a list's do), its top 16, and its foot 4, because the last row already pads its words 12
/// from its own foot, so the last words sit 16 from the card's edge as the heading does from the top. The heading stands
/// 4 above the first row, whose own 12 makes the 16.
public struct Tile<Content: View, Trailing: View>: View {
    let title: String?
    let glyph: Glyph?
    let count: Int?
    let insets: EdgeInsets
    let gap: CGFloat
    let content: Content
    let trailing: Trailing

    public init(_ title: String? = nil, glyph: Glyph? = nil, count: Int? = nil, padding: CGFloat = Space.s4, rows: Bool = false,
                @ViewBuilder content: () -> Content, @ViewBuilder trailing: () -> Trailing = { EmptyView() }) {
        self.title = title
        self.glyph = glyph
        self.count = count
        self.insets = rows
            ? EdgeInsets(top: Space.s4, leading: Space.textInset, bottom: Space.s4 - Space.rowY, trailing: Space.textInset)
            : EdgeInsets(top: padding, leading: padding, bottom: padding, trailing: padding)
        self.gap = rows ? Space.s4 - Space.rowY : Space.s3
        self.content = content()
        self.trailing = trailing()
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: gap) {
            if let title {
                HStack(spacing: Space.s2) {
                    if let glyph { IconWell(glyph, size: .m) }
                    Text(title).font(Typeface.tileHeading).foregroundStyle(Palette.ink)
                    if let count { Text(count, format: .number).font(Typeface.meta).monospacedDigit().foregroundStyle(Palette.ink3) }
                    Spacer(minLength: Space.s2)
                    trailing
                }
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isHeader)
            }
            content
        }
        .padding(insets)
        .frame(maxWidth: .infinity, alignment: .leading)
        .card()
    }
}

/// A what, in a circle: 28, 32 for a row, 40 for a card, 56 large. Neutral by default; a tone only on a row that means
/// it. A who is a circle too, told apart by the initial it carries (`Face`).
public struct IconWell: View {
    public enum Size: Sendable {
        case m, l, card, xl
        var side: CGFloat { switch self { case .m: 28; case .l: 32; case .card: 40; case .xl: 56 } }
        var glyph: CGFloat { switch self { case .m: 18; case .l: 18; case .card: 20; case .xl: 28 } }
    }

    public enum Tone: Sendable { case neutral, late, good, warn, info }

    let glyph: Glyph
    let size: Size
    let tone: Tone

    public init(_ glyph: Glyph, size: Size = .l, tone: Tone = .neutral) {
        self.glyph = glyph
        self.size = size
        self.tone = tone
    }

    public var body: some View {
        glyph.image
            .resizable()
            .scaledToFit()
            .frame(width: size.glyph, height: size.glyph)
            .foregroundStyle(ink)
            .frame(width: size.side, height: size.side)
            .background(ground, in: Circle())
            .accessibilityHidden(true)
    }

    private var ink: Color {
        switch tone {
        case .neutral: Palette.ink2
        case .late: Palette.red
        case .good: Palette.good
        case .warn: Palette.warn
        case .info: Palette.info
        }
    }

    private var ground: Color {
        switch tone {
        case .neutral: Palette.tile2
        case .late: Palette.redTint
        case .good: Palette.goodTint
        case .warn: Palette.warnTint
        case .info: Palette.infoTint
        }
    }
}

/// A face: a who, round, with their initial on the tile-2 ground.
public struct Face: View {
    let name: String
    let side: CGFloat

    public init(_ name: String, side: CGFloat = 32) {
        self.name = name
        self.side = side
    }

    public var body: some View {
        Text(String(name.trimmingCharacters(in: .whitespaces).prefix(1)).uppercased())
            .font(Typeface.initial(side * 0.42))
            .foregroundStyle(Palette.ink2)
            .frame(width: side, height: side)
            .background(Palette.tile2, in: Circle())
            .accessibilityLabel(name)
    }
}
