import CoreText
import SwiftUI

/// Look B's type in SwiftUI (plan 3.5, `loop/DESIGN-SYSTEM.md` "Type"): Lexend 600 for names and big figures only, Geist
/// 400/500/600 for every other word, Geist Mono for times and code.
///
/// EVERY SIZE SCALES WITH DYNAMIC TYPE. Each is `Font.custom(_:size:relativeTo:)` against the text style a person's
/// setting moves, so 15 at Large is 15 and grows with it, as the system's own text does.
///
/// THE FONTS ARE THE OFL TTFs, BUNDLED, because the web's woff2 files cannot be registered on iOS: Lexend SemiBold, Geist
/// as one variable font (its weight axis gives 400, 500 and 600), and Geist Mono. `register()` runs once at launch.
public enum Typeface {
    static let lexend = "Lexend-SemiBold"
    static let geist = "Geist"
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

    private static func lexend(_ size: CGFloat, _ style: Font.TextStyle) -> Font { .custom(lexend, size: size, relativeTo: style) }
    private static func geist(_ size: CGFloat, _ weight: Font.Weight, _ style: Font.TextStyle) -> Font {
        .custom(geist, size: size, relativeTo: style).weight(weight)
    }

    /// A page's one big number, Lexend 34.
    public static let hero = lexend(34, .largeTitle)
    /// A page's name at full width, Lexend 28.
    public static let page = lexend(28, .title)
    /// A page's name on a phone and in a nav bar, and a tile's figure, Lexend 22.
    public static let figure = lexend(22, .title2)
    /// A sheet's title, Geist 17 semibold.
    public static let heading = geist(17, .semibold, .headline)
    /// A tile's heading, Geist 15 semibold.
    public static let tileHeading = geist(15, .semibold, .subheadline)
    /// Body text and a row's subject, Geist 15.
    public static let body = geist(15, .regular, .body)
    /// A row's subject when it leads, Geist 15 medium.
    public static let bodyMedium = geist(15, .medium, .body)
    /// A control's label, Geist 14 medium; 15 on a phone, where a control is 44 tall.
    public static let control = geist(15, .medium, .callout)
    /// Dates, ages, counts and helper text, Geist 13.
    public static let meta = geist(13, .regular, .footnote)
    /// A caption, an axis, a tag, Geist 12 medium.
    public static let caption = geist(12, .medium, .caption)
    /// Times in a log, codes, key caps: Geist Mono 13.
    public static let code = Font.custom(mono, size: 13, relativeTo: .footnote)
    /// A one-time code being typed: Geist Mono at 22, so six digits read as one thing.
    public static let codeEntry = Font.custom(mono, size: 22, relativeTo: .title2)

    #if canImport(UIKit)
    /// Lexend 22 as a UIKit font, for the navigation bar's title, scaled as the title style is.
    public static func navTitleFont() -> UIFont {
        let base = UIFont(name: lexend, size: 22) ?? .systemFont(ofSize: 22, weight: .semibold)
        return UIFontMetrics(forTextStyle: .title2).scaledFont(for: base)
    }
    #endif
}
