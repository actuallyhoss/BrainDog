#if os(iOS)
import Foundation
@preconcurrency import UserNotifications

/// Push on the iPhone (plan 3.7, M4): what the app, its notification service extension and Settings share.
///
/// ONE TABLE ON THE SERVER. The token Apple gives the app is registered through the web's own `subscribePush`, as
/// `apns://<production|sandbox>/dog.brain.app/<hex>`, on the BrainDog this session has open, so who is rung for what
/// (questions waiting, the record's alarms, mentions and hand-overs, agents, summaries), the person's own switches in
/// Settings › Notifications (`push.off`) and the record's quiet hours are exactly the browser's.
///
/// NO CONTENT THROUGH APPLE. What arrives says one fixed line for its kind; the service extension reads the question
/// itself with the app session over TLS and says its real words on the phone (`enrich`), unless "Say what it is about" is
/// off. Accept is offered only where the web's one press would give the answer (`Question.quickAnswer`), and only for
/// someone who may answer; Later is offered on every question.
public enum Push {
    /// The categories the server names (`apps/worker/src/apns.ts` `categoryOf`) and the one the extension may widen to.
    public enum Category {
        /// A question: Later. The server's default, safe without reading the question.
        public static let question = "question"
        /// A question the web answers with one press: Accept and Later. Only the extension sets it, after reading it.
        public static let questionAccept = "question.accept"
        /// Anything else: a tap opens it.
        public static let open = "open"
    }

    public enum Action {
        public static let accept = "accept"
        public static let later = "later"
    }

    /// Accept and Later run with the phone unlocked and without bringing the app forward.
    public static var categories: Set<UNNotificationCategory> {
        let accept = UNNotificationAction(identifier: Action.accept, title: Words.pushAccept, options: [.authenticationRequired])
        let later = UNNotificationAction(identifier: Action.later, title: Words.later, options: [.authenticationRequired])
        return [
            UNNotificationCategory(identifier: Category.questionAccept, actions: [accept, later], intentIdentifiers: [], options: []),
            UNNotificationCategory(identifier: Category.question, actions: [later], intentIdentifiers: [], options: []),
            UNNotificationCategory(identifier: Category.open, actions: [], intentIdentifiers: [], options: []),
        ]
    }

    // MARK: the settings this phone keeps

    private static var shared: UserDefaults { Server.appGroup.flatMap { UserDefaults(suiteName: $0) } ?? .standard }

    /// "Say what it is about" (plan 3.7): on by default; off, the fixed line stays and nothing is read on receipt.
    public static var saysWhat: Bool {
        get { shared.object(forKey: "push.says") as? Bool ?? true }
        set { shared.set(newValue, forKey: "push.says") }
    }

    /// The endpoint this phone registered last, on the BrainDog it was registered on, so a sign-out can take it away.
    public static var registered: [String: String] {
        get { shared.dictionary(forKey: "push.registered") as? [String: String] ?? [:] }
        set { shared.set(newValue, forKey: "push.registered") }
    }

    // MARK: registration

    /// What the record keeps for this phone: Apple's host by the build (a Debug build's token is the sandbox's), the
    /// bundle as the topic, and the token in hex.
    public static func endpoint(token: Data) -> String {
        #if DEBUG
        let host = "sandbox"
        #else
        let host = "production"
        #endif
        let hex = token.map { String(format: "%02x", $0) }.joined()
        let bundle = Bundle.main.bundleIdentifier ?? "dog.brain.app"
        return "apns://\(host)/\(bundle)/\(hex)"
    }

    /// Register this phone's token on the BrainDog this session has open (`subscribePush`), once per BrainDog per token.
    public static func register(token: Data, record: String?) async {
        let endpoint = endpoint(token: token)
        let at = record ?? ""
        guard registered[at] != endpoint else { return }
        do {
            _ = try await Client.shared.call("subscribePush", ["endpoint": .string(endpoint)], as: JSONValue.self)
            var kept = registered
            kept[at] = endpoint
            registered = kept
        } catch {
            /* Offline or refused: asked again at the next launch, which hands the token over again. */
        }
    }

    /// Before signing out: this phone stops being rung on the BrainDog open now (the session still works here). Other
    /// BrainDogs it was registered on drop it the first time Apple says the app is gone, or at the next sign-in there.
    public static func unregister(record: String?) async {
        let at = record ?? ""
        guard let endpoint = registered[at] else { return }
        _ = try? await Client.shared.call("unsubscribePush", ["endpoint": .string(endpoint)], as: JSONValue.self)
        var kept = registered
        kept[at] = nil
        registered = kept
    }

    /// Whether the person has answered the system's ask, and how.
    public static func status() async -> UNAuthorizationStatus {
        await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
    }

    /// The system's ask, once: alerts, sounds and the badge. True when given.
    public static func ask() async -> Bool {
        (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    }

    /// The app icon's badge is the Needs you count.
    public static func badge(_ n: Int) {
        UNUserNotificationCenter.current().setBadgeCount(max(0, n)) { _ in }
    }

    // MARK: what a push opens

    /// The question id a push opens, from its `open` path (`/decide/SG4`), or nil.
    public static func question(in info: [AnyHashable: Any]) -> String? {
        guard let open = info["open"] as? String, open.hasPrefix("/decide/") else { return nil }
        let id = String(open.dropFirst("/decide/".count))
        return id.isEmpty || id.contains("/") ? nil : id
    }

    /// The BrainDog a push is from (its name in the app's address), and whether it is the one this session has open.
    public static func isHere(_ info: [AnyHashable: Any]) -> Bool {
        guard let record = info["record"] as? String, !record.isEmpty else { return true }
        guard let open = Kept.load("boot", as: Boot.self)?.record?.slug else { return true }
        return open == record
    }

    // MARK: the service extension

    /// The real line, read on the phone (plan 3.7): the question in the record's words, the suggested answer under it,
    /// Accept where one press is safe, and the badge set to what waits. Anything that fails leaves the fixed line.
    public static func enrich(_ content: UNMutableNotificationContent) async {
        guard Session.shared.signedIn, isHere(content.userInfo) else { return }
        guard let needs = try? await Calls.needs() else { return }
        content.badge = NSNumber(value: needs.waiting)
        guard let id = question(in: content.userInfo), let q = needs.open.first(where: { $0.id == id }) else { return }
        if saysWhat {
            content.body = q.question
            if let suggested = q.options.first(where: { $0.recommended == true }) { content.subtitle = Words.pushSuggested(suggested.label) }
        }
        let boot = Kept.load("boot", as: Boot.self)
        let mayAnswer = (boot?.level.decides ?? false) || (q.decider != nil && q.decider == boot?.me?.person)
        if mayAnswer, q.quickAnswer != nil { content.categoryIdentifier = Category.questionAccept }
    }

    // MARK: Accept and Later, from the lock screen

    /// Accept or Later on a question, read again first so the answer is the one the web's press would give now. Said back
    /// as a quiet notification when it could not be given here, so nothing fails silently.
    public static func act(_ action: String, on info: [AnyHashable: Any]) async {
        guard Session.shared.signedIn, let id = question(in: info) else { return }
        guard isHere(info) else { return say(Words.pushOtherBrainDog) }
        do {
            let needs = try await Calls.needs()
            guard let q = needs.open.first(where: { $0.id == id }) else { return say(Words.pushAlreadyAnswered) }
            switch action {
            case Action.accept:
                guard let option = q.quickAnswer else { return say(Words.pushOpenToAnswer) }
                switch try await Calls.answer(q.id, option: option.key) {
                case .written: badge(max(0, needs.waiting - 1))
                case .wantsReason: say(Words.pushOpenToAnswer)
                }
            case Action.later:
                let tomorrow = Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date()
                try await Calls.later(q.id, until: Said.iso(tomorrow), why: Words.pushLaterWhy)
                badge(max(0, needs.waiting - 1))
            default:
                break
            }
        } catch {
            say(Words.failure(error as? CallFailure ?? .offline))
        }
    }

    /// One line from the app itself, shown at once.
    private static func say(_ line: String) {
        let content = UNMutableNotificationContent()
        content.title = "BrainDog"
        content.body = line
        content.categoryIdentifier = Category.open
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil))
    }
}
#endif
