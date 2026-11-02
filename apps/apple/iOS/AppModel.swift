import BrainDogKit
import Observation
import SwiftUI

/// One of the tab bar's places: the web's own (`places`, from `tabsOf`), kept so the next launch draws the same tabs at once.
struct Place: Codable, Hashable, Identifiable {
    let key: String
    let href: String
    let label: String
    let icon: String
    var id: String { href }

    /// Needs you is drawn natively (M3); every other place is the web.
    var native: Bool { key == "decide" || href == "/decide" }

    static let today = Place(key: "today", href: "/", label: Words.today, icon: "today")
    static let needs = Place(key: "decide", href: "/decide", label: Words.needsYou, icon: "decide")
}

/// What a stack holds above its root: a web screen, or the native Settings root.
enum Screen: Hashable {
    case web(Pushed)
    case settings
}

/// A web screen pushed on a stack, told apart by its own id.
struct Pushed: Hashable {
    let id = UUID()
    let screen: WebScreen
    static func == (a: Pushed, b: Pushed) -> Bool { a.id == b.id }
    func hash(into h: inout Hasher) { h.combine(id) }
}

/// One tab's navigation stack (plan 3.3, Stacks): its root, and a web view per screen above it, from the warm pool.
///
/// THE PREVIOUS SCREEN STAYS LIVE, so the system's swipe back is exact with no history to sync. AT MOST FOUR LIVE: a
/// screen deeper than that is put to sleep with its picture kept, and loads again at its address when it is next on top.
@Observable
final class Stack {
    let place: Place
    /// The root's web screen; nil for a native root (Needs you).
    let root: WebScreen?
    var path: [Screen] = [] {
        didSet { rest() }
    }

    init(place: Place, root: WebScreen?) {
        self.place = place
        self.root = root
    }

    static let live = 4

    func push(_ screen: WebScreen) {
        path.append(.web(Pushed(screen: screen)))
    }

    func popToRoot() {
        path.removeAll()
    }

    /// Every web screen on the stack, the root first.
    var screens: [WebScreen] {
        (root.map { [$0] } ?? []) + path.compactMap { if case .web(let p) = $0 { p.screen } else { nil } }
    }

    /// The screen on top, where a pull, a share or a title belongs.
    var top: WebScreen? { screens.last }

    private func rest() {
        let all = screens
        guard all.count > Self.live else { return }
        for screen in all.dropLast(Self.live) { Task { await screen.sleep() } }
    }
}

/// The signed-in app: the tabs and their stacks, Needs you and Tell, the Account sheet, and where an address goes.
@Observable
final class AppModel {
    static let shared = AppModel()

    private(set) var places: [Place]
    private(set) var stacks: [String: Stack] = [:]
    var selected: String = Place.today.href
    let search = Stack(place: Place(key: "search", href: "search", label: Words.searchTab, icon: "search"), root: nil)

    private(set) var boot: Boot?
    @ObservationIgnored private var bootRaw: JSONValue?
    let needs = NeedsModel()
    let tell = TellModel()
    var tellOpen = false
    /// What is typed in Search or go to.
    var searchText = ""
    var accountOpen = false
    /// A link or a file the page handed to the share sheet.
    var sharing: Sharing?
    /// An address outside BrainDog, opened in the in-app browser.
    var outside: Outside?
    /// An address that arrived before sign-in finished, opened once it has.
    @ObservationIgnored var waiting: String?
    #if DEBUG
    /// The widgets and the share sheet drawn in the app, for the screenshot walk (`Gallery.swift`).
    var gallery: Gallery?
    #endif

    struct Sharing: Identifiable { let id = UUID(); let items: [Any] }
    struct Outside: Identifiable { let id = UUID(); let url: URL }

    private init() {
        /* THE TABS SETTLE BETWEEN USES (M23): a new set of places the web named while he was here waits for the next cold
           start, or a return after half an hour away, so a tab never moves under his thumb. */
        let next = (UserDefaults.standard.data(forKey: Self.nextPlacesKey)).flatMap { try? JSONDecoder().decode([Place].self, from: $0) }
        let kept = (UserDefaults.standard.data(forKey: Self.placesKey)).flatMap { try? JSONDecoder().decode([Place].self, from: $0) }
        places = next ?? kept ?? [Place.today, Place.needs]
        if let next {
            if let data = try? JSONEncoder().encode(next) { UserDefaults.standard.set(data, forKey: Self.placesKey) }
            UserDefaults.standard.removeObject(forKey: Self.nextPlacesKey)
        }
        needs.onOpen = { [weak self] path in self?.push(path, on: self?.stack(Place.needs.href)) }
        needs.onCount = { [weak self] n in
            self?.badge = n
            if n > 0 { Task { await self?.considerAskingPush() } }
        }
        tell.onAsk = { [weak self] q in
            self?.tellOpen = false
            self?.open("/slash?q=\(q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")")
        }
        tell.onChanged = { [weak self] in self?.refreshAll() }
        /* WHAT WAS LAST READ, SO A COLD START OFFLINE STILL KNOWS WHO IS HERE (plan 3.8): the face, the role, the count. */
        if let kept = Kept.load("boot", as: Boot.self) { took(kept) }
        badge = needs.needs.waiting > 0 ? needs.needs.waiting : (boot?.counts?.decide ?? 0)
        build()
    }

    /// The Needs you count on the tab: from the queue once it has been read, else from `boot`, else the page's own. The
    /// app icon's badge is the same count (M4).
    var badge = 0 {
        didSet { if badge != oldValue, Session.shared.signedIn { Push.badge(badge) } }
    }

    static let placesKey = "shell.places"
    static let nextPlacesKey = "shell.places.next"
    /// This phone's token from Apple, once given, registered on each BrainDog this session opens.
    @ObservationIgnored private var token: Data?

    // MARK: stacks

    private func build() {
        var next: [String: Stack] = [:]
        for place in places {
            if let kept = stacks[place.href] { next[place.href] = kept; continue }
            if place.native {
                next[place.href] = Stack(place: place, root: nil)
            } else {
                let screen = WebScreen(kind: .ios, path: place.href)
                if place.href == Place.today.href { screen.cover = Kept.launch }
                let stack = Stack(place: place, root: screen)
                bind(screen, in: stack)
                next[place.href] = stack
            }
        }
        stacks = next
        if !places.contains(where: { $0.href == selected }), selected != "search" { selected = places.first?.href ?? Place.today.href }
    }

    func stack(_ href: String) -> Stack? { href == "search" ? search : stacks[href] }
    var current: Stack? { stack(selected) }

    /// Hear what a screen asks of the app.
    func bind(_ screen: WebScreen, in stack: Stack) {
        screen.onAsk = { [weak self, weak stack, weak screen] ask in self?.heard(ask, in: stack, from: screen) }
        screen.onFile = { [weak self] file in self?.sharing = Sharing(items: [file]) }
    }

    private func heard(_ ask: ShellAsk, in stack: Stack?, from screen: WebScreen?) {
        switch ask {
        case .visit(let path, _):
            visit(path, from: stack)
        case .places(let tabs):
            takePlaces(tabs)
        case .share(let url, let title):
            sharing = Sharing(items: title.map { [url, $0] as [Any] } ?? [url])
        case .tell(let prefill):
            openTell(prefill: prefill)
        case .ask(let prefill):
            openTell(prefill: prefill, mode: .ask)
        case .badge(let n):
            badge = n
        case .open(let url):
            outside = Outside(url: url)
        case .pushAsk:
            /* THE WEB'S NOTIFICATIONS SETTING ASKS THE PHONE (`askPush`): the system's own ask, and the answer said back. */
            Task {
                let given = await askPush()
                screen?.emit("pushAnswer", given ? "yes" : "no")
            }
        case .notify, .ready, .haptic, .signedOut, .title, .drag, .titleBarDoubleClick:
            /* A notification from the page would ring twice beside the record's push; the rest the screen answered. */
            break
        }
    }

    /// The web's tabs, as its own bar would draw them: the first four that are not Menu, Needs you among them.
    private func takePlaces(_ tabs: JSONValue) {
        guard let all = tabs.decoded(as: [Place].self) else { return }
        var four = Array(all.filter { $0.key != "menu" && !$0.href.isEmpty }.prefix(4))
        if four.isEmpty { return }
        if !four.contains(where: \.native) {
            four = Array(four.prefix(3))
            four.insert(Place.needs, at: min(1, four.count))
        }
        guard four != places else {
            UserDefaults.standard.removeObject(forKey: Self.nextPlacesKey)
            return
        }
        /* THE FIRST SET IS TAKEN AT ONCE (nothing to move from); ANY LATER CHANGE WAITS for `settlePlaces`. */
        if UserDefaults.standard.data(forKey: Self.placesKey) == nil {
            apply(four)
        } else if let data = try? JSONEncoder().encode(four) {
            UserDefaults.standard.set(data, forKey: Self.nextPlacesKey)
        }
    }

    private func apply(_ four: [Place]) {
        places = four
        if let data = try? JSONEncoder().encode(four) { UserDefaults.standard.set(data, forKey: Self.placesKey) }
        UserDefaults.standard.removeObject(forKey: Self.nextPlacesKey)
        build()
    }

    /// Back after half an hour away: the places the web named meanwhile are taken now, before he has touched anything.
    func settlePlaces() {
        guard let next = (UserDefaults.standard.data(forKey: Self.nextPlacesKey)).flatMap({ try? JSONDecoder().decode([Place].self, from: $0) }) else { return }
        apply(next)
    }

    // MARK: addresses

    /// The address inside the record, with the record's own slug taken off (`/the-studio/money` is `/money`).
    private func inside(_ path: String) -> String {
        guard let slug = boot?.record?.slug, !slug.isEmpty else { return path }
        if path == "/\(slug)" { return "/" }
        return path.hasPrefix("/\(slug)/") ? String(path.dropFirst(slug.count + 1)) : path
    }

    private func bare(_ path: String) -> String {
        String(path.prefix { $0 != "?" && $0 != "#" })
    }

    /// A link pressed in a page: a tab's own place selects that tab; anything else is pushed on the stack it came from.
    func visit(_ path: String, from stack: Stack?) {
        let at = inside(path)
        if let place = places.first(where: { $0.href == bare(at) }), !at.contains("?") {
            select(place.href, toRoot: true)
            return
        }
        if bare(at) == "/settings" {
            (stack ?? current)?.path.append(.settings)
            return
        }
        push(path, on: stack ?? current)
    }

    /// An address from outside the app (a universal link, `braindog://open?path=`, a notification): in the tab it
    /// belongs to, pushed over that tab's root, or over Today's when no tab holds it.
    func open(_ path: String) {
        guard Session.shared.signedIn else {
            waiting = path
            return
        }
        let at = inside(path)
        if let place = places.first(where: { $0.href == bare(at) }) {
            select(place.href, toRoot: true)
            return
        }
        let owner = places.dropFirst().first { bare(at).hasPrefix($0.href + "/") } ?? places.first
        if let owner {
            select(owner.href, toRoot: true)
            push(path, on: stack(owner.href))
        }
    }

    func push(_ path: String, on stack: Stack?) {
        guard let stack else { return }
        let screen = WebPool.shared.take(path)
        bind(screen, in: stack)
        stack.push(screen)
    }

    func select(_ href: String, toRoot: Bool = false) {
        if toRoot, selected == href { stack(href)?.popToRoot() }
        selected = href
        if toRoot { stack(href)?.popToRoot() }
    }

    // MARK: reading

    /// `boot`, the lists' declarations for Tell, and Needs you, read at launch and again whenever the app comes forward.
    func load() async {
        WebPool.shared.prepare(after: .seconds(2))
        await withTaskGroup(of: Void.self) { group in
            group.addTask { await self.needs.read() }
            group.addTask {
                guard let (boot, raw) = try? await Calls.boot() else { return }
                await self.took(boot: boot, raw: raw)
            }
        }
        /* THE WIDGETS DRAW WHAT THE APP JUST READ (plan 3.10), once `boot` has named the record and its currency. */
        await GlanceStore.refresh()
        if let path = waiting {
            waiting = nil
            open(path)
        }
    }

    private func took(_ boot: Boot) {
        self.boot = boot
        needs.level = boot.level
        needs.me = boot.me?.person
    }

    private func took(boot: Boot, raw: JSONValue) async {
        took(boot)
        bootRaw = raw
        Kept.save(boot, as: "boot")
        if !needs.known { badge = boot.counts?.decide ?? 0 }
        /* SPOTLIGHT KNOWS HIS PAGES AND LISTS BY NAME (M5), and Apple's token is handed to this BrainDog too (M4). */
        Spotlight.index(boot)
        await registerPush()
        if boot.level.adds, let schemas = try? await Calls.schemas() {
            tell.learn(boot: raw, schemas: schemas)
            /* KEPT FOR THE SHARE SHEET AND SIRI, which read lines with no wait for the record. */
            TellModel.keep(boot: raw, schemas: schemas)
            /* THEN WHAT TODAY'S TELL KNOWS BY READING THE LISTS (M23): people, accounts, organisations, titled entries. */
            await tell.learnKnown(boot: raw, schemas: schemas)
        }
    }

    /// Every screen reads again (after Tell added, after an answer), as a pull would.
    func refreshAll() {
        for stack in stacks.values { for screen in stack.screens { screen.emit("refresh") } }
        Task {
            await needs.read()
            await GlanceStore.refresh()
        }
    }

    /// Another BrainDog opened on this session: every screen and every read starts again on it.
    func reopened() async {
        WebPool.shared.drain()
        stacks = [:]
        search.popToRoot()
        boot = nil
        build()
        selected = places.first?.href ?? Place.today.href
        await load()
    }

    /// Signed out: nothing of the last person stays.
    func forget() {
        WebPool.shared.drain()
        stacks = [:]
        search.popToRoot()
        boot = nil
        bootRaw = nil
        badge = 0
        UserDefaults.standard.removeObject(forKey: Self.placesKey)
        UserDefaults.standard.removeObject(forKey: Self.nextPlacesKey)
        UserDefaults.standard.removeObject(forKey: "tell.draft")
        Spotlight.forget()
        tell.forgetKnown()
        Handoff.advertise(path: nil, title: nil)
        Push.badge(0)
        Push.registered = [:]
        places = [Place.today, Place.needs]
        build()
        /* AND THE HOME SCREEN: the widgets draw "Sign in" now, not the last person's questions. */
        GlanceStore.redraw()
    }

    // MARK: Tell

    var canTell: Bool { boot?.level.adds ?? true }

    func openTell(prefill: String = "", mode: TellModel.Mode = .tell) {
        tell.opened(prefill: prefill, mode: mode)
        tellOpen = true
    }

    // MARK: launch picture

    /// Today as it is drawn now, kept for the next launch.
    func keepLaunchPicture() async {
        guard let today = stacks[Place.today.href]?.root, let picture = await today.picture() else { return }
        Kept.launch = picture
    }

    func rescale() {
        for stack in stacks.values { for screen in stack.screens { screen.rescale() } }
        for screen in search.screens { screen.rescale() }
    }

    // MARK: push (M4)

    /// The system's ask, then Apple's token: true when given. Asked by the web's Notifications setting, the native
    /// Settings row, and once by itself the first time Needs you holds something.
    func askPush() async -> Bool {
        let given: Bool
        switch await Push.status() {
        case .authorized, .provisional, .ephemeral: given = true
        case .denied: given = false
        default: given = await Push.ask()
        }
        if given { UIApplication.shared.registerForRemoteNotifications() }
        return given
    }

    /// The first time something waits on him: the ask, once, never again whatever he answered.
    func considerAskingPush() async {
        guard !UserDefaults.standard.bool(forKey: "push.asked"), await Push.status() == .notDetermined else { return }
        UserDefaults.standard.set(true, forKey: "push.asked")
        _ = await askPush()
    }

    /// Already allowed: Apple is asked for the token at each launch (it can change), and it is handed to this BrainDog.
    private func registerPush() async {
        switch await Push.status() {
        case .authorized, .provisional, .ephemeral:
            if let token { await Push.register(token: token, record: boot?.record?.slug) } else { UIApplication.shared.registerForRemoteNotifications() }
        default:
            break
        }
    }

    func took(token: Data) async {
        self.token = token
        await Push.register(token: token, record: boot?.record?.slug)
    }

    /// A notification (or a page handed over) opens what it is about: in the BrainDog it came from, switched to first
    /// when that is another one he can open, then in the tab that owns the path.
    func opened(push info: [AnyHashable: Any]) async {
        guard Session.shared.signedIn else { return }
        if let record = info["record"] as? String, !record.isEmpty, let here = boot?.record?.slug, record != here {
            guard (try? await Calls.open(record)) != nil else { return }
            await reopened()
        }
        if let path = info["open"] as? String, path.hasPrefix("/") { open(path) } else { select(Place.needs.href, toRoot: true) }
    }

    // MARK: Handoff (M5)

    /// The page in front, for Handoff: the top of the selected tab, by its address and its name.
    var inFront: (path: String, title: String?)? {
        guard let stack = current else { return nil }
        if let top = stack.top { return (top.here, top.title) }
        return (stack.place.href, stack.place.label)
    }
}
