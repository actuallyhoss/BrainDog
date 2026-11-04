#if DEBUG
import AppKit
import BrainDogKit
import SwiftUI
import WebKit

/// A Debug build's pictures of itself, for the screenshot walk on a Mac whose screen this shell may not record
/// (`--press go:shot:<name>`, `tools/mac-shots.mjs`). Each is drawn by the app from what it draws: the window as the page
/// draws it (`takeSnapshot`) with the traffic lights at the places AppKit holds them; the menu bar's panel and the Tell
/// window by their own SwiftUI views. Saved in the app's own container (`tmp/shots/`), where the walk copies them from.
@MainActor
enum Shots {
    static var folder: URL {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("shots", isDirectory: true)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return folder
    }

    /// The main window at 1512 wide, as it is drawn now.
    static func window(_ name: String) async {
        let model = MacModel.shared
        guard let window = model.desk.webView.window else { return }
        let size = NSSize(width: 1512, height: 945)
        if window.frame.size != size {
            window.setFrame(NSRect(origin: window.frame.origin, size: size), display: true)
            try? await Task.sleep(for: .seconds(1.5))
        }
        let config = WKSnapshotConfiguration()
        config.afterScreenUpdates = true
        guard let page = try? await model.desk.webView.takeSnapshot(configuration: config) else { return }
        let bounds = window.contentView?.bounds ?? NSRect(origin: .zero, size: size)
        let image = NSImage(size: bounds.size, flipped: false) { _ in
            page.draw(in: model.desk.webView.convert(model.desk.webView.bounds, to: nil))
            for kind in [NSWindow.ButtonType.closeButton, .miniaturizeButton, .zoomButton] {
                guard let light = window.standardWindowButton(kind), let rep = light.bitmapImageRepForCachingDisplay(in: light.bounds) else { continue }
                light.cacheDisplay(in: light.bounds, to: rep)
                rep.draw(in: light.convert(light.bounds, to: nil))
            }
            return true
        }
        save(image, scale: window.backingScaleFactor, name: name)
    }

    /// Another window of the app (Tell, Settings), as AppKit draws its views.
    static func other(titled title: String, name: String) {
        guard let window = NSApp.windows.first(where: { $0.title.contains(title) && $0.isVisible }), let view = window.contentView?.superview,
              let rep = view.bitmapImageRepForCachingDisplay(in: view.bounds) else { return }
        view.cacheDisplay(in: view.bounds, to: rep)
        write(rep, name: name)
    }

    /// A SwiftUI view drawn alone, at its own size, in the app's appearance.
    static func view<V: View>(_ content: V, name: String) {
        let dark = NSApp.effectiveAppearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
        let renderer = ImageRenderer(content: content.environment(\.colorScheme, dark ? .dark : .light))
        renderer.scale = 2
        guard let cg = renderer.cgImage else { return }
        write(NSBitmapImageRep(cgImage: cg), name: name)
    }

    private static func save(_ image: NSImage, scale: CGFloat, name: String) {
        let w = Int(image.size.width * scale), h = Int(image.size.height * scale)
        guard let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: w, pixelsHigh: h, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true,
                                         isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0) else { return }
        rep.size = image.size
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
        image.draw(in: NSRect(origin: .zero, size: image.size))
        NSGraphicsContext.restoreGraphicsState()
        write(rep, name: name)
    }

    private static func write(_ rep: NSBitmapImageRep, name: String) {
        guard let png = rep.representation(using: .png, properties: [:]) else { return }
        try? png.write(to: folder.appendingPathComponent("\(name).png"))
    }
}
#endif
