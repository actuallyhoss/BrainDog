import SwiftUI

/// The four button weights in the ops look: every one a capsule, 44 tall under a thumb and 36 on a Mac.
///
/// - `primary`: the accent's fill, white words, raised a little off the page. One per screen, the one main action, and
///   never disabled for a missing field: pressing it says what is missing.
/// - `ink`: ink fill, tile words. The suggested answer, or a strong choice on a screen whose one accent is spent elsewhere.
/// - `quiet`: the default. A tile capsule with a 1px rule edge on the board; tile-2 with no edge on a card or a sheet.
/// - `bare`: words in ink-2 and nothing round them until pressed.
///
/// A PRESS IS A FILL CHANGE AND A LITTLE GIVE: scale .98 over 70 ms, and only the fill under Reduce Motion. Nothing lifts.
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
                .padding(.horizontal, weight == .bare ? Space.s3 : Space.s4)
                .frame(maxWidth: full ? .infinity : nil, minHeight: Space.control)
                .background {
                    ZStack {
                        Capsule(style: .continuous).fill(fill(down))
                        if weight == .quiet && !onTile { Capsule(style: .continuous).inset(by: 0.5).stroke(Palette.rule, lineWidth: 1) }
                    }
                    .accessibilityHidden(true)
                }
                .elevation(weight == .primary && enabled ? .raised : .flat)
                .contentShape(Capsule(style: .continuous))
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

/// The radii the ops look allows. A control is never a rounded square: it is a circle (one glyph) or a capsule (a word,
/// or a group of controls), drawn with `Circle` and `Capsule`. Inner radius = outer radius minus the gap between them.
public enum Radius {
    /// A small chip or a menu row's fill, and a thumbnail.
    public static let control: CGFloat = 8
    /// A row's fill (a selected or pressed row, a result under the keys).
    public static let row: CGFloat = 10
    /// Fields, menus, popovers and a list box.
    public static let field: CGFloat = 12
    /// Menus and popovers.
    public static let pop: CGFloat = 12
    /// A card on the board.
    public static let tile: CGFloat = 16
    /// A toast.
    public static let toast: CGFloat = 20
    /// A floating panel (the Mac's quick panel).
    public static let panel: CGFloat = 22
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
    /// The one text edge: rows pad their words 12 in, and headings and captions sit on the same line.
    public static let textInset: CGFloat = 12
    /// Between controls side by side in a bar.
    public static let toolbarGap: CGFloat = 6
    /// Between cards.
    public static let cardGap: CGFloat = 16
    /// A target under a thumb.
    public static let tap: CGFloat = 44
    /// A control's drawn height: 44 under a thumb, 36 under a pointer.
    #if os(macOS)
    public static let control: CGFloat = 36
    #else
    public static let control: CGFloat = 44
    #endif
}
