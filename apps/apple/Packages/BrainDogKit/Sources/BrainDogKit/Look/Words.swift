import AuthenticationServices
import Foundation

/// Every sentence a native screen says, in one place, in the design system's voice (plan 3.5): plain, calm, no ids,
/// codes or capitalised enums. Where the web already says the same thing, these are its words
/// (`apps/web/src/lib/copy/account.ts`), so a person meets one product.
public enum Words {
    // Sign in
    public static let signInTitle = "Sign in to BrainDog"
    public static let signInLede = "Email or a passkey."
    public static let withPasskey = "Use a passkey"
    public static let waitingForPasskey = "Waiting for your passkey"
    public static let passkeyCancelled = "Sign-in was cancelled. Nothing changed."
    public static let emailLabel = "Email"
    public static let emailLike = "you@example.com"
    public static let emailLink = "Email me a sign-in link"
    public static let sendingLink = "Sending the link"
    public static let or = "or"
    public static let emailMissing = "Type the email you sign in with first."
    public static let emailOdd = "That does not look like an email address. Check it and try again."
    public static let linkSentTitle = "Check your email"
    public static func linkSentBody(_ email: String) -> String {
        "If \(email) can sign in here, a link and a code are on their way. Open the link on this \(device), or type the code."
    }
    public static let codeLabel = "Code from the email"
    public static let codeLike = "123 456"
    public static let codeSignIn = "Sign in"
    public static let codeMissing = "Type the six digits from the email first."
    public static let codeExpired = "That code has run out. Send a new link and use the code in it."
    public static let sendAgain = "Send it again"
    public static let useAnotherEmail = "Use a different email"
    public static let signingIn = "Signing you in"
    public static let rejected = "That did not sign you in. Check the code, or send a new link."
    public static let linkNotForApp = "This link is for signing in in a browser. Ask for a new one here."
    public static let mailDown = "Mail is not going out right now. Use a passkey, or try in a few minutes."
    public static let offline = "You're offline. Check your connection, then try again."
    public static func locked(_ seconds: Int) -> String {
        let minutes = max(1, (seconds + 59) / 60)
        return "Sign-in is paused for \(minutes == 1 ? "a minute" : "\(minutes) minutes"). There were too many tries."
    }
    public static let unreachable = "BrainDog did not answer. Check your connection, then try again."
    public static let privacy = "Signing in keeps you signed in on this \(device) until you sign out."

    static func passkeyUnusable(_ error: Error) -> String {
        if let e = error as? ASAuthorizationError, e.code == .failed || e.code == .invalidResponse {
            return "This \(device) cannot use a passkey for BrainDog yet. Use the email link instead."
        }
        return "The passkey did not finish. Try again, or use the email link."
    }

    /// The sentence for a call that came back without an answer.
    public static func failure(_ failure: CallFailure) -> String {
        switch failure {
        case .offline: return offline
        case .signedOut: return rejected
        case .locked(let seconds): return locked(seconds)
        case .refused(let refusal): return refusal.code == "UNAUTHORIZED" ? rejected : refusal.fix
        case .failed: return unreachable
        }
    }

    // Account
    public static let signOut = "Sign out"
    public static let account = "Account"

    // Settings (iOS: billing is managed on the web, App Store 3.1.1)
    public static let planManaged = "Your plan is managed at brain.dog."

    static var device: String {
        #if os(iOS)
        return "iPhone"
        #else
        return "Mac"
        #endif
    }
}
