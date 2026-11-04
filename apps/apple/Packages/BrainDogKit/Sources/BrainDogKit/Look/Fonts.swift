import CoreText
import SwiftUI

/// BrainDog's type in SwiftUI, in the ops look (`loop/plans/ops-look-2026-11-03/SPEC.md`, 2 and 7): one family, Plus
/// Jakarta Sans, at 400, 500 and 600 only, for every word from the page's name to a caption; Geist Mono for times and
/// code. Dense sizes: a row 15, body 14, meta 12.5, a caption 12, the page's name 28 at 600 drawn tight (`tight`).
///
/// EVERY SIZE SCALES WITH DYNAMIC TYPE. Each is `Font.custom(_:size:relativeTo:)` against the text style a person's
/// setting moves, so 15 at Large is 15 and grows with it, as the system's own text does.
///
/// THE FONTS ARE THE OFL TTFs, BUNDLED, because the web's woff2 files cannot be registered on iOS: Plus Jakarta Sans as
/// one variable font (its weight axis gives 400, 500 and 600) and Geist Mono. `register()` runs once at launch. The
/// Jakarta file is built by `tools/fonts/jakarta.py`: upstream's, with its capitals centred in the line and a wider word
/// space, the same as the web's, so a button and a row sit alike on every platform.
public enum Typeface {
    static let family = "Plus Jakarta Sans"
    static let mono = "Geist Mono"

    /// Make the bundled faces available to this process. Idempotent; a face already registered is left as it is.
    public static func register() {
        guard !registered else { return }
        registered = true
        guard let folder = Bundle.module.url(forResource: "Fonts", withExtension: nil),
              let files = try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil) else { return }
        for file in files where file.pathExtension == "ttf" {
            CTFontManagerRegisterFontsForURL(file as CFURL, .process, nil)
        }
    }
    nonisolated(unsafe) private static var registered = false

    private static func face(_ size: CGFloat, _ weight: Font.Weight, _ style: Font.TextStyle) -> Font {
        .custom(family, size: size, relativeTo: style).weight(weight)
    }

    /// How much tighter a title is drawn, in points at its size: -0.021em, as the ops titles are.
    public static func tight(_ size: CGFloat) -> CGFloat { -0.021 * size }

    /// A page's one big number, 30 semibold.
    public static let hero = face(30, .semibold, .largeTitle)
    /// A page's name at full width, 28 semibold (draw it with `.tracking(Typeface.tight(28))`).
    public static let page = face(28, .semibold, .title)
    /// A page's name on a phone and in a nav bar, and a tile's figure, 22 semibold.
    public static let figure = face(22, .semibold, .title2)
    /// A sheet's title and a section's heading, 17 semibold.
    public static let heading = face(17, .semibold, .headline)
    /// A card's heading, 14 semibold (RHYTHM, section 5).
    public static let tileHeading = face(14, .semibold, .subheadline)
    /// Reading text, 14.
    public static let body = face(14, .regular, .body)
    /// A row's subject, 15.
    public static let row = face(15, .regular, .body)
    /// A row's subject when it leads, 15 medium.
    public static let bodyMedium = face(15, .medium, .body)
    /// A control's label, 500: 14 on a phone, 13 on a Mac.
    #if os(macOS)
    public static let control = face(13, .medium, .callout)
    #else
    public static let control = face(14, .medium, .callout)
    #endif
    /// A segmented control's label, 13 (its weight set by whether it is chosen).
    public static let segment = Font.custom(family, size: 13, relativeTo: .callout)
    /// An initial in a face, at the face's own size.
    public static func initial(_ size: CGFloat) -> Font { .custom(family, size: size).weight(.semibold) }
    /// Dates, ages, counts and helper text, 12.5.
    public static let meta = face(12.5, .regular, .footnote)
    /// A caption, an axis, a tag, 12 medium.
    public static let caption = face(12, .medium, .caption)
    /// A tiny group header in capitals, 11 medium (draw it with `.textCase(.uppercase).tracking(0.3)`).
    public static let caps = face(11, .medium, .caption2)
    /// Times in a log, codes, key caps: Geist Mono 13.
    public static let code = Font.custom(mono, size: 13, relativeTo: .footnote)
    /// A one-time code being typed: Geist Mono at 22, so six digits read as one thing.
    public static let codeEntry = Font.custom(mono, size: 22, relativeTo: .title2)

    #if canImport(UIKit)
    /// The family at 22 semibold as a UIKit font, for the navigation bar's title, scaled as the title style is.
    public static func navTitleFont(size: CGFloat = 22) -> UIFont {
        let descriptor = UIFontDescriptor(fontAttributes: [
            .family: family,
            .traits: [UIFontDescriptor.TraitKey.weight: UIFont.Weight.semibold],
        ])
        let base = UIFont(descriptor: descriptor, size: size)
        return UIFontMetrics(forTextStyle: .title2).scaledFont(for: base.familyName == family ? base : .systemFont(ofSize: size, weight: .semibold))
    }
    #endif
}

/// HOW FAR APART WRAPPED LINES SIT, as the web's line-heights set them. Plus Jakarta Sans draws its lines 1.26 em apart
/// by itself (ascent 1.0 + descent 0.26, no line gap), which is tight for reading: the web reads body at 1.5, a row's
/// words and meta at about 1.4. SwiftUI's `lineSpacing` adds the difference between lines (never above the first or under
/// the last, so a one-line label keeps its height), scaled with Dynamic Type as the face is.
///
/// - `body`: reading text at 14, 1.5 (21 apart): a paragraph, an empty state's line, a toast, a field's words.
/// - `row`: a row's subject at 15 when it wraps, 1.36 (20.4 apart), the ops row title's 15/20.
/// - `meta`: meta and helper text at 12.5 when it wraps, 1.42 (17.75 apart): a why, a refusal, a privacy line.
public enum Leading: Sendable {
    case body, row, meta
}

private struct LeadingSpace: ViewModifier {
    @ScaledMetric(relativeTo: .body) private var body14: CGFloat = 3.5
    @ScaledMetric(relativeTo: .body) private var row15: CGFloat = 1.5
    @ScaledMetric(relativeTo: .footnote) private var meta12: CGFloat = 2
    let leading: Leading

    func body(content: Content) -> some View {
        switch leading {
        case .body: content.lineSpacing(body14)
        case .row: content.lineSpacing(row15)
        case .meta: content.lineSpacing(meta12)
        }
    }
}

public extension View {
    /// Set wrapped lines the web's distance apart (`Leading`).
    func leading(_ leading: Leading) -> some View { modifier(LeadingSpace(leading: leading)) }
}
