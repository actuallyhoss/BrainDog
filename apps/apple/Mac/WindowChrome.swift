import AppKit
import BrainDogKit
import SwiftUI

/// The main window's frame (plan M6, Window): no title bar of its own, the traffic lights standing in the web's bar at the
/// start of its row, where the web leaves them `MacBar.room` (`--shell-lead`), on the line of the row's words. Its size and
/// place are remembered between launches. Full screen has no lights, so the web gives their room back.
///
/// THE LIGHTS ARE MOVED, NOT DRAWN. AppKit keeps them in a title bar 32 tall at the top of the window; their container is
/// made as tall as the web's bar and each light is centred in it. AppKit lays them out again when the window resizes,
/// goes full screen or comes back, so they are placed again each time it does.
@MainActor
final class WindowChrome: NSObject {
    static let bar = MacBar.height
    /// From the window's edge to the first light; the web leaves `MacBar.room` for the three.
    static let lead = MacBar.lead

    private weak var window: NSWindow?
    private var watching: [NSObjectProtocol] = []

    func take(_ window: NSWindow) {
        guard self.window !== window else { return }
        self.window = window
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.titlebarSeparatorStyle = .none
        window.styleMask.insert(.fullSizeContentView)
        window.isMovableByWindowBackground = false
        window.tabbingMode = .disallowed
        window.collectionBehavior.insert(.fullScreenPrimary)
        window.setFrameAutosaveName("BrainDog main window")
        let center = NotificationCenter.default
        for name in [NSWindow.didResizeNotification, NSWindow.didEndLiveResizeNotification, NSWindow.didExitFullScreenNotification,
                     NSWindow.didBecomeKeyNotification, NSWindow.didResignKeyNotification, NSWindow.didDeminiaturizeNotification] {
            watching.append(center.addObserver(forName: name, object: window, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { self?.place() }
            })
        }
        for (name, room) in [(NSWindow.willEnterFullScreenNotification, 0), (NSWindow.didExitFullScreenNotification, MacBar.room)] {
            watching.append(center.addObserver(forName: name, object: window, queue: .main) { _ in
                MainActor.assumeIsolated {
                    MacModel.shared.desk.webView.evaluateJavaScript("document.documentElement.style.setProperty('--shell-lead','\(room)px')")
                }
            })
        }
        place()
        /* AND ONCE MORE AFTER THE FIRST LAYOUT, which AppKit does after the window is shown. */
        DispatchQueue.main.async { [weak self] in self?.place() }
    }

    /// The lights centred in the bar's row, the first `lead` from the edge.
    func place() {
        guard let window, !window.styleMask.contains(.fullScreen),
              let close = window.standardWindowButton(.closeButton),
              let mini = window.standardWindowButton(.miniaturizeButton),
              let zoom = window.standardWindowButton(.zoomButton),
              let titlebar = close.superview, let container = titlebar.superview else { return }
        let height = Self.bar
        let frame = NSRect(x: 0, y: window.frame.height - height, width: window.frame.width, height: height)
        if container.frame != frame { container.frame = frame }
        if titlebar.frame != container.bounds { titlebar.frame = container.bounds }
        let gap = max(6, mini.frame.minX - close.frame.maxX)
        var x = Self.lead
        for light in [close, mini, zoom] {
            let origin = NSPoint(x: x, y: (height - MacBar.centre - light.frame.height / 2).rounded())
            if light.frame.origin != origin { light.setFrameOrigin(origin) }
            x += light.frame.width + gap
        }
    }
}

/// Hands the window a view sits in to whoever asks, once it is in one.
struct WindowReader: NSViewRepresentable {
    let found: (NSWindow) -> Void

    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        DispatchQueue.main.async { if let window = view.window { found(window) } }
        return view
    }

    func updateNSView(_ view: NSView, context: Context) {
        DispatchQueue.main.async { if let window = view.window { found(window) } }
    }
}
