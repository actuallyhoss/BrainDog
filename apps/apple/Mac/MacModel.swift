import AppKit
import BrainDogKit
import Observation
import ServiceManagement
import SwiftUI
import UserNotifications

/// The Mac app's one model (plan M6): the web desk in its window, the glance the menu bar and the Dock show, Tell, and
/// the few things the app itself keeps (text size, the menu bar, opening at login).
@Observable
final class MacModel: NSObject, UNUserNotificationCenterDelegate {
    static let shared = MacModel()

    /// The web desk: the whole app, in native mode (`kind: 'mac'`), its own rail and bar under the traffic lights.
    let desk = WebScreen(kind: .mac, path: "/")
    /// Tell, natively, in its own small window and from Siri and Shortcuts.
    let tell = TellModel()
    /// The count and the first questions, and Today's key numbers: what the menu bar and the Dock show.
    private(set) var glance: Glance? = GlanceStore.kept
    /// The record and who is reading it, for Settings.
    private(set) var boot: Boot? = Kept.load("boot", as: Boot.self)

    var count: Int { glance?.waiting ?? 0 }

    /// The page's zoom, ⌘+ and ⌘−, kept: 0.5 to 2.0 in the browser's own steps.
    var zoom: Double = UserDefaults.standard.object(forKey: "mac.zoom") as? Double ?? 1 {
        didSet {
            UserDefaults.standard.set(zoom, forKey: "mac.zoom")
            desk.webView.pageZoom = zoom
        }
    }
    static let zooms: [Double] = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2]

    /// The count in the menu bar, on by default.
    var inMenuBar: Bool = UserDefaults.standard.object(forKey: "mac.menuBar") as? Bool ?? true {
        didSet { UserDefaults.standard.set(inMenuBar, forKey: "mac.menuBar") }
    }

    /// Opens a window by its id; set by the main window's view, which has the action.
    @ObservationIgnored var openWindow: ((String) -> Void)?
    /// Opens the Settings window; set by the main window's view too.
    @ObservationIgnored var openSettings: (() -> Void)?
    @ObservationIgnored private var started = false
    @ObservationIgnored private var askedToNotify = false

    private override init() {
        super.init()
    }

    /// Once, when the window first shows: hear the page, read the glance now and every two minutes, and again each time
    /// the app comes forward.
    func start() {
        guard !started else { return }
        started = true
        desk.webView.pageZoom = zoom
        desk.onAsk = { [weak self] ask in self?.heard(ask) }
        desk.onFile = { [weak self] file in self?.keep(file) }
        UNUserNotificationCenter.current().delegate = self
        AppDoor.tell = { [weak self] words in self?.openTell(prefill: words) }
        AppDoor.open = { [weak self] path in self?.go(path) }
        NotificationCenter.default.addObserver(forName: NSApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { Task { await self?.read() } }
        }
        Task {
            while !Task.isCancelled {
                await read()
                try? await Task.sleep(for: .seconds(120))
            }
        }
    }

    /// The glance, `boot` and what Tell reads against, read again; the Dock badge follows the count.
    func read() async {
        guard Session.shared.signedIn else {
            glance = nil
            NSApp.dockTile.badgeLabel = nil
            return
        }
        if let (boot, raw) = try? await Calls.boot() {
            self.boot = boot
            Kept.save(boot, as: "boot")
            if !tell.ready || tell.text.isEmpty, boot.level.adds, let schemas = try? await Calls.schemas() {
                tell.learn(boot: raw, schemas: schemas)
                TellModel.keep(boot: raw, schemas: schemas)
            }
        }
        glance = await GlanceStore.refresh() ?? glance
        badge(count)
    }

    private func badge(_ n: Int) {
        NSApp.dockTile.badgeLabel = n > 0 ? n.formatted() : nil
    }

    /// Signed out: nothing of the last person stays in the Dock, the menu bar or Tell.
    func forget() {
        glance = nil
        boot = nil
        badge(0)
        tell.text = ""
        GlanceStore.redraw()
    }

    // MARK: what the page asks

    private func heard(_ ask: ShellAsk) {
        switch ask {
        case .open(let url):
            NSWorkspace.shared.open(url)
        case .badge(let n):
            badge(n)
            if n != count { Task { await read() } }
        case .notify(let title, let body, let goto):
            notify(title: title, body: body, goto: goto)
        case .share(let url, _):
            share([url])
        case .tell(let prefill):
            openTell(prefill: prefill)
        case .ask(let prefill):
            desk.emit("slash", prefill.isEmpty ? nil : prefill)
        case .visit(let path, _):
            desk.go(path)
        case .ready, .haptic, .signedOut, .title, .places, .pushAsk, .drag, .titleBarDoubleClick:
            break
        }
    }

    /// An export or a backup the page made: into Downloads, said back to the page, and shown in Finder.
    private func keep(_ file: URL) {
        guard let downloads = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first else { return }
        var target = downloads.appendingPathComponent(file.lastPathComponent)
        let stem = target.deletingPathExtension().lastPathComponent, ext = target.pathExtension
        var n = 2
        while FileManager.default.fileExists(atPath: target.path) {
            target = downloads.appendingPathComponent(ext.isEmpty ? "\(stem) \(n)" : "\(stem) \(n).\(ext)")
            n += 1
        }
        do {
            try FileManager.default.moveItem(at: file, to: target)
            NSWorkspace.shared.activateFileViewerSelecting([target])
        } catch {
            desk.emit("unsaved", file.lastPathComponent)
        }
    }

    private func share(_ items: [Any]) {
        guard let view = desk.webView.window?.contentView else { return }
        let picker = NSSharingServicePicker(items: items)
        picker.show(relativeTo: NSRect(x: view.bounds.midX, y: view.bounds.maxY - 56, width: 1, height: 1), of: view, preferredEdge: .minY)
    }

    // MARK: notifications from the page

    /// The page's notification (a question arrived, a run finished), while the app runs: asked for once, the first time.
    private func notify(title: String, body: String, goto: String?) {
        let center = UNUserNotificationCenter.current()
        Task {
            if !askedToNotify {
                askedToNotify = true
                _ = try? await center.requestAuthorization(options: [.alert, .sound, .badge])
            }
            let content = UNMutableNotificationContent()
            content.title = title
            content.body = body
            if let goto { content.userInfo = ["goto": goto] }
            try? await center.add(UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil))
        }
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let goto = response.notification.request.content.userInfo["goto"] as? String
        await MainActor.run {
            NSApp.activate()
            self.openWindow?("main")
            if let goto { self.desk.go(goto) }
        }
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }

    // MARK: going places

    /// The window in front at an address in the app.
    func go(_ path: String) {
        front()
        desk.go(path)
    }

    /// The window in front, where it was.
    func front() {
        NSApp.activate()
        openWindow?("main")
    }

    func openTell(prefill: String = "", mode: TellModel.Mode = .tell) {
        tell.opened(prefill: prefill, mode: mode)
        NSApp.activate()
        openWindow?("tell")
    }

    func back() { desk.webView.goBack() }
    func forward() { desk.webView.goForward() }

    func zoomIn() { zoom = Self.zooms.first { $0 > zoom + 0.001 } ?? zoom }
    func zoomOut() { zoom = Self.zooms.last { $0 < zoom - 0.001 } ?? zoom }

    // MARK: open at login

    var opensAtLogin: Bool { SMAppService.mainApp.status == .enabled }

    /// Open BrainDog when the Mac starts (`SMAppService`); says nothing if the system will not, and the switch reads it back.
    func setOpensAtLogin(_ on: Bool) {
        do {
            if on { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
        } catch {
            /* Refused (an app outside Applications, say): the switch reads the status again and shows what is true. */
        }
    }
}
