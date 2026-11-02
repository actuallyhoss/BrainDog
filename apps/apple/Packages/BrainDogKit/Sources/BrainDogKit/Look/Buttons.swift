import SwiftUI

/// The four button weights (`loop/DESIGN-SYSTEM.md`, Button), all rectangles at radius 8, 44 tall under a thumb.
///
/// - `primary`: red fill, white words. One per screen, the one main action, and never disabled for a missing field:
///   pressing it says what is missing.
/// - `ink`: ink fill, tile words. The suggested answer, or a strong choice on a screen whose one red is spent elsewhere.
/// - `quiet`: the default. Tile on the board, tile-2 on a tile.
/// - `bare`: words in ink-2 and nothing round them.
///
/// A PRESS IS A FILL CHANGE AND A LITTLE GIVE: scale .98 over 70 ms, and only the fill under Reduce Motion.
public struct BDButtonStyle: ButtonStyle {
    public enum Weight: Sendable { case primary, ink, quiet, bare }

    let weight: Weight
    let onTile: Bool
    let full: Bool

    public init(_ weight: Weight, onTile: Bool = false, full: Bool = true) {
        self.weight = weight
        self.onTile = onTile
        self.full = full
    }

    public func makeBody(configuration: Configuration) -> some View {
        Pressed(configuration: configuration, weight: weight, onTile: onTile, full: full)
    }

    private struct Pressed: View {
        let configuration: ButtonStyleConfiguration
        let weight: Weight
        let onTile: Bool
        let full: Bool
        @Environment(\.accessibilityReduceMotion) private var still
        @Environment(\.isEnabled) private var enabled

        var body: some View {
            let down = configuration.isPressed
            configuration.label
                .font(Typeface.control)
                .foregroundStyle(ink)
                .lineLimit(1)
                .padding(.horizontal, weight == .bare ? 0 : 16)
                .frame(maxWidth: full ? .infinity : nil, minHeight: 44)
                .background(fill(down), in: RoundedRectangle(cornerRadius: Radius.control, style: .continuous))
                .contentShape(RoundedRectangle(cornerRadius: Radius.control, style: .continuous))
                .scaleEffect(down && !still ? 0.98 : 1)
                .opacity(enabled ? 1 : 0.5)
                .animation(.easeOut(duration: 0.07), value: down)
        }

        private var ink: Color {
            switch weight {
            case .primary: Palette.onRed
            case .ink: Palette.tile
            case .quiet: Palette.ink
            case .bare: Palette.ink2
            }
        }

        private func fill(_ down: Bool) -> Color {
            switch weight {
            case .primary: down ? Palette.redFillPress : Palette.redFill
            case .ink: down ? Palette.ink2 : Palette.ink
            case .quiet: down ? Palette.hover : (onTile ? Palette.tile2 : Palette.tile)
            case .bare: down ? Palette.hover : .clear
            }
        }
    }
}

public extension ButtonStyle where Self == BDButtonStyle {
    static var primary: BDButtonStyle { BDButtonStyle(.primary) }
    static var ink: BDButtonStyle { BDButtonStyle(.ink) }
    static var quiet: BDButtonStyle { BDButtonStyle(.quiet) }
    static var quietOnTile: BDButtonStyle { BDButtonStyle(.quiet, onTile: true) }
    static var bare: BDButtonStyle { BDButtonStyle(.bare, full: false) }
}

/// The shapes Look B allows (`--r-ctl`, `--r-pop`, `--r-tile`), and the spacing steps.
public enum Radius {
    /// Buttons, chips, fields, segments, wells.
    public static let control: CGFloat = 8
    /// Menus and popovers.
    public static let pop: CGFloat = 12
    /// Tiles and sheets.
    public static let tile: CGFloat = 16
}

/// `--sp-1` to `--sp-8`.
public enum Space {
    public static let s1: CGFloat = 4
    public static let s2: CGFloat = 8
    public static let s3: CGFloat = 12
    public static let s4: CGFloat = 16
    public static let s5: CGFloat = 24
    public static let s6: CGFloat = 32
    public static let s7: CGFloat = 48
    public static let s8: CGFloat = 64
    /// The page's gutter on a phone.
    public static let gutter: CGFloat = 16
    /// A target under a thumb.
    public static let tap: CGFloat = 44
}
