import SwiftUI

/// The one surface for a group (`loop/DESIGN-SYSTEM.md`, Tile): `--tile` on the board, radius 16, no border, no shadow,
/// told from the board by its fill alone. A heading row is a neutral 28 well with an 18 glyph, the title at 15/600, an
/// optional count in ink-3, and one thing at the far end.
public struct Tile<Content: View, Trailing: View>: View {
    let title: String?
    let glyph: Glyph?
    let count: Int?
    let padding: CGFloat
    let content: Content
    let trailing: Trailing

    public init(_ title: String? = nil, glyph: Glyph? = nil, count: Int? = nil, padding: CGFloat = Space.s4,
                @ViewBuilder content: () -> Content, @ViewBuilder trailing: () -> Trailing = { EmptyView() }) {
        self.title = title
        self.glyph = glyph
        self.count = count
        self.padding = padding
        self.content = content()
        self.trailing = trailing()
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
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
        .padding(padding)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.tile, in: RoundedRectangle(cornerRadius: Radius.tile, style: .continuous))
    }
}

/// A what, as a square well (a who is round): 28, 32 for a row, 40 for a card, 56 large. Neutral by default; a tone only
/// on a row that means it.
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
            .background(ground, in: RoundedRectangle(cornerRadius: Radius.control, style: .continuous))
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
            .font(.custom("Geist", size: side * 0.42).weight(.semibold))
            .foregroundStyle(Palette.ink2)
            .frame(width: side, height: side)
            .background(Palette.tile2, in: Circle())
            .accessibilityLabel(name)
    }
}
