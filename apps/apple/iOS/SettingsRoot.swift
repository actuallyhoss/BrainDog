import BrainDogKit
import SwiftUI
import UserNotifications

/// Settings' root, natively (plan 3.4): the web's own areas in the web's own groups, each a press that pushes the web's
/// area here, and what only the app says (its version, where the plan is managed). Keyboard is left off a phone, as the
/// web leaves it (design system, Phones). Billing is one plain line in the iPhone app, never a price or a link (App
/// Store 3.1.1).
struct SettingsRoot: View {
    let stack: Stack
    @State private var app = AppModel.shared

    private struct Area: Identifiable {
        let label: String
        let line: String
        let glyph: Glyph
        let path: String
        var id: String { path }
    }

    private struct Group: Identifiable {
        let title: String
        let areas: [Area]
        var id: String { title }
    }

    /* THE WEB'S GROUPS AND WORDS (`routes/settings/[area]/place.ts`), so a person meets one Settings in both. */
    private let groups: [Group] = [
        Group(title: "You", areas: [
            Area(label: "Signing in", line: "Passkeys, devices", glyph: .key, path: "/settings/signing-in"),
            Area(label: "Notifications", line: "Quiet hours, summaries", glyph: .bell, path: "/settings/notifications"),
        ]),
        Group(title: "How it looks", areas: [
            Area(label: "Appearance", line: "Theme, density", glyph: .sun, path: "/settings/appearance"),
            Area(label: "Pages", line: "Sidebar and bar", glyph: .rows, path: "/settings/navigation"),
            Area(label: "Time and money", line: "Time zone, currency, list names", glyph: .tag, path: "/settings/words"),
        ]),
        Group(title: "Agents and add-ons", areas: [
            Area(label: "Agents", line: "Connections, permissions, Slash", glyph: .session, path: "/settings/agents"),
            Area(label: "What comes in", line: "Mail and feeds", glyph: .inbox, path: "/settings/ingest"),
            Area(label: "Add-ons", line: "Installed, updates", glyph: .packs, path: "/settings/addons"),
            Area(label: "Keychain", line: "Keys for agents", glyph: .vault, path: "/keychain"),
        ]),
        Group(title: "People", areas: [
            Area(label: "People and sharing", line: "Colleagues, invites, shares", glyph: .userPlus, path: "/settings/people"),
            Area(label: "Who can do what", line: "Roles and shares, side by side", glyph: .userCheck, path: "/settings/roles"),
            Area(label: "Usage", line: "This month", glyph: .observe, path: "/usage"),
        ]),
        Group(title: "Your data", areas: [
            Area(label: "Health", line: "Vital signs", glyph: .heartPulse, path: "/p/health"),
            Area(label: "Tidy up", line: "Stale and doubled", glyph: .filter, path: "/settings/tidy"),
            Area(label: "Backups", line: "Nightly copies", glyph: .history, path: "/settings/backups"),
            Area(label: "Export", line: "A signed copy", glyph: .download, path: "/settings/export"),
            Area(label: "Delete my BrainDog", line: "For good", glyph: .trash, path: "/settings/delete"),
        ]),
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.cardGap) {
                ForEach(groups) { group in
                    /* WHAT ONLY THIS PHONE HOLDS sits under You, beside Notifications, whose kinds it rings for. */
                    if group.title != groups.first?.title, groups.dropFirst().first?.title == group.title { PhoneTile() }
                    Tile(group.title, rows: true) {
                        VStack(spacing: 0) {
                            ForEach(Array(group.areas.enumerated()), id: \.element.id) { index, area in
                                Button {
                                    Haptic.press.play()
                                    app.push(area.path, on: stack)
                                } label: {
                                    HStack(spacing: Space.s3) {
                                        Row(area.label, detail: area.line, glyph: area.glyph, tone: area.path == "/settings/delete" ? .late : .neutral)
                                        Glyph.chevron.image.resizable().frame(width: 14, height: 14).foregroundStyle(Palette.ink3).accessibilityHidden(true)
                                    }
                                }
                                .buttonStyle(.plain)
                                if index < group.areas.count - 1 { Hairline(leading: 32 + Space.s3) }
                            }
                        }
                    }
                }

                Tile(Words.about) {
                    VStack(alignment: .leading, spacing: Space.s2) {
                        Text(Words.version(version, build)).font(Typeface.body).foregroundStyle(Palette.ink).leading(.body)
                        Text("\(Words.billing): \(Words.planManaged)").font(Typeface.meta).foregroundStyle(Palette.ink3)
                    }
                }
            }
            .padding(.horizontal, Space.gutter)
            .padding(.top, Space.s3)
            .padding(.bottom, Space.foot)
        }
        .background(Ground())
        .navigationTitle(Words.settings)
        .modifier(ScreenBar(root: false, title: Words.settings))
    }

    private var version: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0" }
    private var build: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1" }
}

/// What only this phone holds (plan 3.4's native rows): whether BrainDog may ring it, whether a notification says what
/// it is about, and Lock with Face ID. What rings it is chosen in the web's Notifications above, for every device at once.
struct PhoneTile: View {
    @State private var app = AppModel.shared
    @State private var lock = Lock.shared
    @State private var status: UNAuthorizationStatus = .notDetermined
    @State private var says = Push.saysWhat
    @State private var lockSaid: String?

    var body: some View {
        Tile(Words.onThisPhone, rows: true) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .center, spacing: Space.s3) {
                    Row(Words.notifications, detail: line, glyph: .bell)
                    if status == .notDetermined {
                        Button(Words.turnOn) {
                            Haptic.press.play()
                            Task {
                                _ = await app.askPush()
                                status = await Push.status()
                            }
                        }
                        .buttonStyle(BDButtonStyle(.quiet, onTile: true, full: false))
                    }
                }
                Hairline(leading: 32 + Space.s3)
                toggle(Words.saysWhat, line: Words.saysWhatLine, glyph: .eye, isOn: Binding(get: { says }, set: { says = $0; Push.saysWhat = $0 }))
                Hairline(leading: 32 + Space.s3)
                toggle(Words.faceLock, line: lockSaid ?? Words.faceLockLine, glyph: .lock, isOn: Binding(get: { lock.on }, set: { wanted in
                    Task {
                        let done = await lock.turn(wanted)
                        lockSaid = done ? nil : (Lock.possible ? nil : Words.faceLockUnavailable)
                        if !done { Haptic.warning.play() } else { Haptic.select.play() }
                    }
                }))
            }
        }
        .task { status = await Push.status() }
    }

    private var line: String {
        switch status {
        case .authorized, .provisional, .ephemeral: Words.notificationsOn
        case .denied: Words.notificationsDenied
        default: Words.notificationsOff
        }
    }

    private func toggle(_ title: String, line: String, glyph: Glyph, isOn: Binding<Bool>) -> some View {
        Toggle(isOn: isOn) {
            Row(title, detail: line, glyph: glyph)
        }
        .toggleStyle(.switch)
        .tint(Palette.on)
    }
}
