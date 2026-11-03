import SwiftUI

/// Surfaces in the ops look: content sits on solid cards over the board, and glass is only for floating chrome (the
/// system's own bars, tab bar and sheets, a toast). Depth comes from what is behind a thing: in light a card carries a
/// tight contact shadow and a wide soft one; in dark it carries none and a 1px `--rule` edge does the work, because the
/// lighter tile already reads as raised.
///
/// The shadow colours here are elevation, not palette: a navy-black at a few per cent, the same in every accent.
public enum Elevation {
    /// Nothing: a control on a card, a row. Hover and press are the affordance.
    case flat
    /// A card on the board (`.surface-card`): contact 0 1 2 at 4%, ambient 0 12 30 -12 at 14%.
    case card
    /// A filled control lifted off its track: a segmented thumb, the one primary button (`--shadow-raised`).
    case raised
    /// Menus, popovers, a toast (`--elev-popover`).
    case popover

    fileprivate struct Layer {
        let opacity: Double
        let radius: CGFloat
        let y: CGFloat
    }

    /// Two layers each, tight then wide; a single layer reads as a sticker. Dark keeps the geometry at a higher alpha.
    fileprivate func layers(dark: Bool) -> [Layer] {
        switch (self, dark) {
        case (.flat, _): []
        case (.card, false): [Layer(opacity: 0.04, radius: 1, y: 1), Layer(opacity: 0.10, radius: 12, y: 8)]
        case (.card, true): []
        case (.raised, false): [Layer(opacity: 0.05, radius: 1, y: 1), Layer(opacity: 0.06, radius: 4, y: 2)]
        case (.raised, true): [Layer(opacity: 0.30, radius: 1, y: 1), Layer(opacity: 0.26, radius: 4, y: 2)]
        case (.popover, false): [Layer(opacity: 0.08, radius: 1, y: 1), Layer(opacity: 0.16, radius: 18, y: 10)]
        case (.popover, true): [Layer(opacity: 0.45, radius: 1, y: 1), Layer(opacity: 0.50, radius: 20, y: 12)]
        }
    }
}

private struct Elevated: ViewModifier {
    let tier: Elevation
    @Environment(\.colorScheme) private var scheme

    func body(content: Content) -> some View {
        let layers = tier.layers(dark: scheme == .dark)
        let shade = Color(red: 15 / 255, green: 23 / 255, blue: 42 / 255)
        content
            .shadow(color: layers.first.map { shade.opacity($0.opacity) } ?? .clear, radius: layers.first?.radius ?? 0, y: layers.first?.y ?? 0)
            .shadow(color: layers.dropFirst().first.map { shade.opacity($0.opacity) } ?? .clear, radius: layers.dropFirst().first?.radius ?? 0,
                    y: layers.dropFirst().first?.y ?? 0)
    }
}

/// The card: `--tile` at radius 16 with a 1px edge, the card shadow in light and the edge alone in dark. For a list, a
/// board of tiles, a stat; never for a paragraph, a heading or one fact, and never a card inside a card.
private struct CardSurface: ViewModifier {
    let radius: CGFloat
    let fill: Color
    @Environment(\.colorScheme) private var scheme

    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        content
            .background(fill, in: shape)
            .overlay(shape.strokeBorder(scheme == .dark ? Palette.rule : .clear, lineWidth: 1).accessibilityHidden(true))
            .modifier(Elevated(tier: .card))
    }
}

public extension View {
    /// Lift a view by an elevation tier.
    func elevation(_ tier: Elevation) -> some View { modifier(Elevated(tier: tier)) }

    /// Sit a view on a card (`--tile`, radius 16, 1px edge, the card shadow in light).
    func card(radius: CGFloat = Radius.tile, fill: Color = Palette.tile) -> some View {
        modifier(CardSurface(radius: radius, fill: fill))
    }

    /// A field's well: `--tile` at radius 12 with a 1px `--rule` edge, the same on the board, on a card and on a sheet's
    /// glass, so the words are always read on a solid ground.
    func fieldWell(radius: CGFloat = Radius.field) -> some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        return background(Palette.tile, in: shape)
            .overlay(shape.strokeBorder(Palette.rule, lineWidth: 1).accessibilityHidden(true))
    }
}

/// The board a screen sits on: the one ground colour, edge to edge. Cards are solid on it and the bars float over it.
public struct Ground: View {
    public init() {}
    public var body: some View { Palette.board.ignoresSafeArea() }
}

/// The washes the ops look draws for hover, press and a row chosen by the keys: the ink at a few per cent, so they
/// follow light, dark and high contrast by themselves and are never an opaque swap.
public enum Wash {
    /// A row under the pointer.
    public static let row = Palette.ink.opacity(0.05)
    /// A row being pressed.
    public static let press = Palette.ink.opacity(0.085)
    /// A menu or result row under the pointer or the keys.
    public static let menuRow = Palette.ink.opacity(0.07)
}
