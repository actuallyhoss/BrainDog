#if os(macOS)
import AppKit

public extension Glyph {
    /// The glyph as an AppKit template image at a size, for the menu bar, where a SwiftUI image is not resized.
    func templateImage(side: CGFloat = 16) -> NSImage? {
        guard let image = Bundle.module.image(forResource: rawValue)?.copy() as? NSImage else { return nil }
        image.size = NSSize(width: side, height: side)
        image.isTemplate = true
        return image
    }
}
#endif
