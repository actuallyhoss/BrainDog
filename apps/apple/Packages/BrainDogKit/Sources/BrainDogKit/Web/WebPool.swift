import Foundation

/// One warm web screen, waiting (plan 3.3, Stacks): it has booted the web app already, so a link pressed on the iPhone is
/// a native push whose new screen moves on the client side (`goto`), with no second boot, no white page and no wait for
/// the shell's own code. The next one warms behind it as soon as it is taken.
///
/// IT WARMS ON SEARCH, a screen that reads little of its own, and only once the first screen has drawn, so it never
/// competes with Today for the network at launch. A screen asked for before it is ready is made fresh at its address.
public final class WebPool {
    public static let shared = WebPool()

    private let kind: ShellKind = .ios
    private var warm: WebScreen?
    private static let rest = "/search"

    /// A screen for this address: the warm one moved there when it is ready, else a new one loading it.
    public func take(_ path: String) -> WebScreen {
        defer { Task { @MainActor in self.prepare(after: .seconds(1)) } }
        if let screen = warm, screen.ready, !screen.offline {
            warm = nil
            screen.moving(to: path)
            return screen
        }
        return WebScreen(kind: kind, path: path)
    }

    /// Warm the next one, if none is waiting.
    public func prepare(after wait: Duration = .zero) {
        guard warm == nil, Session.shared.signedIn else { return }
        let screen = WebScreen(kind: kind, path: Self.rest)
        warm = screen
        Task { @MainActor in
            try? await Task.sleep(for: wait)
            await screen.load()
        }
    }

    /// Signed out, or another BrainDog opened: the warm screen read the old one, so it goes.
    public func drain() {
        warm = nil
    }
}
