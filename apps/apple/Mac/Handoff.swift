import AppKit
import BrainDogKit
import SwiftUI

/// Handoff with the iPhone app (plan 3.10, M5): the desk's page is offered to the iPhone as it changes, and a page the
/// iPhone offers opens here. The same activity type both apps declare (`dog.brain.page`), with the address as its
/// `webpageURL`, so a Mac without the app continues in the browser.
struct MacHandoff: ViewModifier {
    @State private var model = MacModel.shared

    func body(content: Content) -> some View {
        content
            .onChange(of: model.desk.title, initial: true) { _, title in Handoff.advertise(path: model.desk.here, title: title) }
            .onContinueUserActivity(Handoff.type) { activity in
                guard let path = activity.userInfo?["path"] as? String, path.hasPrefix("/") else {
                    if let url = activity.webpageURL { Links.open(url) }
                    return
                }
                NSApp.activate()
                model.go(path)
            }
    }
}

@MainActor
enum Handoff {
    static let type = "dog.brain.page"
    private static var activity: NSUserActivity?

    static func advertise(path: String, title: String?) {
        guard Session.shared.signedIn, path.hasPrefix("/") else {
            activity?.invalidate()
            activity = nil
            return
        }
        let slug = Kept.load("boot", as: Boot.self)?.record?.slug
        let a = activity ?? NSUserActivity(activityType: type)
        a.title = title ?? "BrainDog"
        a.isEligibleForHandoff = true
        a.userInfo = ["path": path, "record": slug ?? ""]
        a.webpageURL = Server.url(path)
        a.needsSave = true
        activity = a
        a.becomeCurrent()
    }
}
