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
    public static let settings = "Settings"
    public static let about = "About"
    public static func version(_ v: String, _ build: String) -> String { "BrainDog for \(device) \(v) (\(build))" }
    public static let billing = "Billing"

    // The shell
    public static let today = "Today"
    public static let needsYou = "Needs you"
    public static let activity = "Activity"
    public static let searchTab = "Search"
    public static let searchPrompt = "Search or go to"
    public static let places = "Places"
    public static let lists = "Lists"
    public static let more = "More"
    public static func entries(_ n: Int) -> String { n == 1 ? "1 entry" : "\(n.formatted()) entries" }
    public static func nothingFound(_ q: String) -> String { "Nothing in your BrainDog matches \u{201C}\(q)\u{201D}." }
    public static let nothingFoundNext = "Try fewer words, or a name as it is written."
    public static let offlineTitle = "You're offline"
    public static let offlinePage = "This page has not been kept on this \(device). It opens once you are back online."
    public static let tryAgain = "Try again"
    public static func offlineSince(_ time: String) -> String { "Offline, showing what you last saw at \(time)." }
    public static let share = "Share"
    public static let back = "Back"

    // Account
    public static let yourBrainDogs = "Your BrainDogs"
    public static let opening = "Opening"
    public static let signedInHere = "Signed in here"

    // Needs you
    public static let waitingOnYou = "Waiting on you"
    public static let later = "Later"
    public static func suggested(_ label: String) -> String { "Suggested: \(label)" }
    public static func comesBack(_ day: String) -> String { "Comes back \(day)" }
    public static let nothingNeedsYou = "Nothing needs you"
    public static let nothingNeedsYouLine = "Questions from your agents, your rules and the people you share with wait here until you answer them."
    public static let tellSomething = "Tell BrainDog something"
    public static let readOnlyNeeds = "You can read these. Somebody who can decide answers them."
    public static func answered(_ label: String) -> String { "Answered: \(label)" }
    public static func putOff(_ day: String) -> String { "Put off until \(day)" }
    public static let undo = "Undo"
    public static let undone = "Put back. It waits again."
    public static let laterTitle = "Put it off until"
    public static let tomorrow = "Tomorrow"
    public static let nextWeek = "Next week"
    public static let twoWeeks = "In two weeks"
    public static let whyItWaits = "Why it can wait"
    public static let whyItWaitsLike = "The quote comes on Friday"
    public static let whyMissing = "Say in a few words why it can wait first."
    public static let putItOff = "Put it off"
    public static let wantsReason = "This one asks why. It opens so you can say."
    public static let changedSince = "Something changed while it was read. It is read again."

    // Tell
    public static let tell = "Tell"
    public static let ask = "Ask"
    public static let tellLine = "Tell BrainDog…"
    public static let tellLike = "Paid £120 for the domain renewal yesterday"
    public static let askLike = "What is due this week?"
    public static let becomes = "That becomes"
    public static let addNothingYet = "Nothing is added until you press Add."
    public static let add = "Add"
    public static let adding = "Adding"
    public static let askIt = "Ask"
    public static let tellMissing = "Type what happened first. One thing a line."
    public static let askMissing = "Type what you want to know first."
    public static func needs(_ what: [String]) -> String { "Needs \(and(what))" }
    public static let notSentOffline = "Not sent: you're offline. It is kept here until you press Add again."
    public static let nothingReady = "None of these can be added yet. Each says what it needs."
    public static let tellUnavailable = "Tell cannot read here yet. Try again in a moment."
    public static let done = "Done"
    public static func addTo(_ list: String) -> String { "Add it to \(list)" }
    public static func keptInField(_ n: Int) -> String { n == 1 ? "The line it could not place is still in the field." : "The \(n) lines it could not place are still in the field." }
    public static let tellUndone = "Taken back. None of it was kept."
    public static let tellTitle = "Tell BrainDog"
    public static func attachmentGoes(_ kind: String) -> String { "The \(kind) goes with the first entry whose list keeps a file." }
    public static func takeOff(_ kind: String) -> String { "Take the \(kind) off" }
    public static func fileNotKept(_ kind: String) -> String { "The \(kind) was not kept: none of these lists keeps a file." }
    public static func fileTooBig(_ kind: String) -> String { "The \(kind) was not kept: it is over 2 MB." }
    public static func fileNotSent(_ kind: String) -> String { "The \(kind) was not kept: it could not be sent." }
    public static let shareSignIn = "Open BrainDog and sign in first. Then share to it again."

    // Outside the app: widgets, Siri and Shortcuts, the menu bar
    public static func waitCount(_ n: Int) -> String { n == 1 ? "1 waits on you" : "\(n) wait on you" }
    public static let nothingWaits = "Nothing waits on you."
    public static let keyNumbers = "Key numbers"
    public static let noKeyNumbers = "No key numbers on Today yet."
    public static let signInToSee = "Sign in to BrainDog to see this."
    public static func readAt(_ time: String) -> String { "At \(time)" }
    public static func whatNeedsMe(_ n: Int, first: String?) -> String {
        guard n > 0 else { return "Nothing needs you. You're up to date." }
        let count = n == 1 ? "One thing needs you" : "\(n) things need you"
        return first.map { "\(count). First: \($0)" } ?? "\(count)."
    }
    public static let tellAsk = "What do you want to tell BrainDog?"
    public static let openToFinish = "BrainDog could not add that by itself. It is open in Tell to finish."
    public static let openBrainDog = "Open BrainDog"

    /// "a, b and c".
    public static func and(_ items: [String]) -> String {
        guard items.count > 1 else { return items.first ?? "" }
        return items.dropLast().joined(separator: ", ") + " and " + items[items.count - 1]
    }

    // Push (M4)
    public static let pushAccept = "Accept"
    public static func pushSuggested(_ answer: String) -> String { "Suggested: \(answer)" }
    public static let pushOtherBrainDog = "That question is in another BrainDog. Open BrainDog to answer it there."
    public static let pushAlreadyAnswered = "That question was already answered or put off."
    public static let pushOpenToAnswer = "This one needs a few words. Open BrainDog to answer it."
    public static let pushLaterWhy = "Put off from a notification"

    // On this iPhone (Settings root, M4 and M5)
    public static let onThisPhone = "On this \(device)"
    public static let notifications = "Notifications"
    public static let notificationsOn = "On. BrainDog rings this \(device) for what you chose in Notifications."
    public static let notificationsOff = "Off. Turn them on to hear when something needs you."
    public static let notificationsDenied = "Off in the \(device)'s Settings, under Notifications."
    public static let turnOn = "Turn on"
    public static let saysWhat = "Say what it is about"
    public static let saysWhatLine = "Read the question on this \(device) and show its words. Off, a notification says only what kind of thing it is."
    public static let faceLock = "Lock with Face ID"
    public static let faceLockLine = "Ask for Face ID when BrainDog opens, and after five minutes away."
    public static let faceLockUnavailable = "This \(device) has no Face ID or passcode set up."
    public static let unlock = "Unlock"
    public static let locked = "BrainDog is locked"
    public static let unlockReason = "Unlock BrainDog"

    // Widgets (M5)
    public static let dueNext = "Due next"
    public static let nothingDue = "Nothing due on Today."
    public static let todayNumber = "Today number"
    public static let pickNumber = "Pick a number in the widget's settings."

    static var device: String {
        #if os(iOS)
        return "iPhone"
        #else
        return "Mac"
        #endif
    }
}
