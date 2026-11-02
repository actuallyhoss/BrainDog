#if DEBUG
import Foundation

/// A Debug build's way to press Sign in's buttons from the launch line, for the screenshot walk on a simulator or a Mac
/// nobody is sitting at (`-braindogPress email:mina@…`, `tools/build.mjs --press`):
/// - `email:<address>` types it and presses "Email me a sign-in link";
/// - `code:<digits>` types the code, which sends itself at six;
/// - `passkey` presses "Use a passkey";
/// - `link:<url>` opens a mailed link as a universal link would;
/// - `signout` signs out;
/// - `go:<path>[@<y>]` hands the path (and how far to scroll) to the app, which moves its web screen there.
/// The same calls the buttons make. A Release build has none of it.
public enum DebugPress {
    public static func onLaunch(go: (String, Double?) -> Void) async {
        guard let press = UserDefaults.standard.string(forKey: "braindogPress") else { return }
        let (verb, rest) = press.firstIndex(of: ":").map { (String(press[..<$0]), String(press[press.index(after: $0)...])) } ?? (press, "")
        let flow = SignInFlow.shared
        try? await Task.sleep(for: .milliseconds(600))
        switch verb {
        case "email":
            flow.email = rest
            await flow.sendLink()
        case "code":
            flow.code = rest
        case "passkey":
            await flow.usePasskey()
        case "link":
            if let link = URL(string: rest) { await flow.open(link: link) }
        case "signout":
            await Session.shared.signOut()
        case "go":
            let parts = rest.split(separator: "@", maxSplits: 1).map(String.init)
            try? await Task.sleep(for: .seconds(3))
            go(parts[0], parts.count > 1 ? Double(parts[1]) : nil)
        default:
            break
        }
    }
}
#endif
