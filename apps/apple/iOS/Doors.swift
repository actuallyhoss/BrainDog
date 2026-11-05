import BrainDogKit
import CoreSpotlight
import SwiftUI
import UIKit
import UniformTypeIdentifiers
@preconcurrency import UserNotifications

/// The ways into the app from outside it (M4, M5): a push and its Accept or Later, the Home Screen's press-and-hold, the
/// page Handoff brings over from the Mac, and Spotlight's pages and lists.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    /// A press-and-hold item the app was launched by, taken once the shell is up.
    @MainActor static var launchedBy: UIApplicationShortcutItem?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        center.setNotificationCategories(Push.categories)
        return true
    }

    func application(_ application: UIApplication, configurationForConnecting session: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        if let item = options.shortcutItem { Self.launchedBy = item }
        let config = UISceneConfiguration(name: nil, sessionRole: session.role)
        config.delegateClass = SceneDoor.self
        return config
    }

    // MARK: push

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken token: Data) {
        Task { @MainActor in await AppModel.shared.took(token: token) }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        /* An unsigned build, or no network: the next launch asks Apple again. */
    }

    /// In front, a push is still shown, and Needs you and the badge are read again at once.
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        await MainActor.run { AppModel.shared.refreshAll() }
        return [.banner, .list, .sound]
    }

    /// A tap opens what it is about, in the right tab and BrainDog; Accept and Later are given where they were pressed.
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let action = response.actionIdentifier
        nonisolated(unsafe) let info = response.notification.request.content.userInfo
        await MainActor.run {
            Task { @MainActor in
                if action == Push.Action.accept || action == Push.Action.later {
                    await Push.act(action, on: info)
                    AppModel.shared.refreshAll()
                } else if action == UNNotificationDefaultActionIdentifier {
                    await AppModel.shared.opened(push: info)
                }
            }
        }
    }
}

/// The scene's own door: a press-and-hold item while the app is running.
final class SceneDoor: NSObject, UIWindowSceneDelegate {
    func windowScene(_ scene: UIWindowScene, performActionFor item: UIApplicationShortcutItem, completionHandler: @escaping (Bool) -> Void) {
        completionHandler(QuickActions.run(item.type))
    }
}

/// The Home Screen's press-and-hold (`UIApplicationShortcutItems` in `project.yml`): Tell, Needs you, Search.
@MainActor
enum QuickActions {
    @discardableResult
    static func run(_ type: String) -> Bool {
        guard Session.shared.signedIn else { return false }
        let app = AppModel.shared
        switch type {
        case "dog.brain.tell":
            guard app.canTell else { return false }
            app.openTell()
        case "dog.brain.needs":
            app.open(Place.needs.href)
        case "dog.brain.search":
            app.selected = "search"
        default:
            return false
        }
        return true
    }

    /// The item the app was launched by, once the shell is up.
    static func runLaunched() {
        guard let item = AppDelegate.launchedBy else { return }
        AppDelegate.launchedBy = nil
        run(item.type)
    }
}

/// Handoff (plan 3.10): the page on top of the tab in front, so it continues on the Mac app, or in Safari on a Mac
/// without it (`webpageURL`). One activity, made current whenever the page in front changes.
@MainActor
enum Handoff {
    static let type = "dog.brain.page"
    private static var activity: NSUserActivity?

    static func advertise(path: String?, title: String?) {
        guard let path, Session.shared.signedIn else {
            activity?.invalidate()
            activity = nil
            return
        }
        let slug = Kept.load("boot", as: Boot.self)?.record?.slug
        let a = activity ?? NSUserActivity(activityType: type)
        a.title = title ?? "BrainDog"
        a.isEligibleForHandoff = true
        a.isEligibleForSearch = false
        a.userInfo = ["path": path, "record": slug ?? ""]
        a.webpageURL = Server.url(path)
        a.needsSave = true
        activity = a
        a.becomeCurrent()
    }

    /// A page handed over from the Mac app: opened here, in the BrainDog it was open on.
    static func continued(_ activity: NSUserActivity) async {
        let info = activity.userInfo ?? [:]
        guard let path = info["path"] as? String else {
            if let url = activity.webpageURL { await Links.open(url) }
            return
        }
        await AppModel.shared.opened(push: ["open": path, "record": info["record"] as? String ?? ""])
    }
}

/// Spotlight (plan 3.10, M7's "if time allows"): his pages and lists, findable from the Home Screen's search and opening
/// in the app. Names only, never what is in them; gone on sign-out.
@MainActor
enum Spotlight {
    static let domain = "dog.brain.places"

    static func index(_ boot: Boot) {
        var items: [CSSearchableItem] = []
        func item(_ path: String, _ title: String, _ line: String) {
            let attributes = CSSearchableItemAttributeSet(contentType: .content)
            attributes.title = title
            attributes.contentDescription = line
            let name: String = boot.record?.name ?? ""
            attributes.keywords = name.isEmpty ? ["BrainDog"] : ["BrainDog", name]
            items.append(CSSearchableItem(uniqueIdentifier: path, domainIdentifier: domain, attributeSet: attributes))
        }
        let in_ = boot.record.map { " in \($0.name)" } ?? ""
        for page in boot.pages ?? [] where page.nav != nil { item("/p/\(page.slug)", page.title, "A page\(in_)") }
        for list in boot.registers where list.kernel != true { item("/r/\(list.id)", list.name, "\(Words.entries(list.count ?? 0))\(in_)") }
        let index = CSSearchableIndex.default()
        index.deleteSearchableItems(withDomainIdentifiers: [domain]) { _ in
            index.indexSearchableItems(items) { _ in }
        }
    }

    static func forget() {
        CSSearchableIndex.default().deleteAllSearchableItems { _ in }
    }

    /// A Spotlight result pressed: its page.
    static func continued(_ activity: NSUserActivity) {
        guard let path = (activity.userInfo?[CSSearchableItemActivityIdentifier] as? String).flatMap(WebGate.appPath) else { return }
        AppModel.shared.open(path)
    }
}
