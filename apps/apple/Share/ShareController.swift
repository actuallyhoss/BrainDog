#if os(iOS)
import UIKit

/// The share extension (plan 3.9, M5). Empty in M0: it closes at once. M5 draws the Tell sheet here.
final class ShareController: UIViewController {
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        extensionContext?.completeRequest(returningItems: nil)
    }
}
#else
import AppKit

/// The share extension (plan 3.9, M5). Empty in M0: it closes at once. M5 draws the Tell panel here.
final class ShareController: NSViewController {
    override func loadView() { view = NSView(frame: NSRect(x: 0, y: 0, width: 1, height: 1)) }
    override func viewDidAppear() {
        super.viewDidAppear()
        extensionContext?.completeRequest(returningItems: nil)
    }
}
#endif
