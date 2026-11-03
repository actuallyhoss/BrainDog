import BrainDogKit
import SwiftUI

/// Which tab the Settings window opens on; a Debug walk sets it (`--press go:settings:shortcut`).
enum SettingsTabs {
    static var chosen = "general"
}

/// The app's own Settings window (⌘,), in three tabs: **General** (what belongs to this Mac: opening at login, the menu
/// bar, text size, updates), **Shortcut** (the quick panel's keys) and **Signing in** (who is signed in here, and Sign
/// out). Everything about the BrainDog itself is its Settings in the app, one press away.
struct SettingsView: View {
    @State private var tab = SettingsTabs.chosen

    var body: some View {
        TabView(selection: $tab) {
            GeneralSettings()
                .tabItem { Label { Text("General") } icon: { Glyph.settings.image } }
                .tag("general")
            ShortcutSettings()
                .tabItem { Label { Text("Shortcut") } icon: { Glyph.keyboard.image } }
                .tag("shortcut")
            SigningInSettings()
                .tabItem { Label { Text("Signing in") } icon: { Glyph.session.image } }
                .tag("signing-in")
        }
        .frame(width: 500)
        .fixedSize(horizontal: false, vertical: true)
    }
}

private struct GeneralSettings: View {
    @State private var model = MacModel.shared
    @State private var updates = Updates.shared
    @State private var atLogin = MacModel.shared.opensAtLogin

    var body: some View {
        Form {
            Section {
                Toggle("Open BrainDog when you log in", isOn: $atLogin)
                    .onChange(of: atLogin) { _, on in
                        model.setOpensAtLogin(on)
                        atLogin = model.opensAtLogin
                    }
                Toggle("Show what needs you in the menu bar", isOn: $model.inMenuBar)
                Picker("Text size", selection: $model.zoom) {
                    ForEach(MacModel.zooms, id: \.self) { z in Text(z == 1 ? "100% (usual)" : "\(Int((z * 100).rounded()))%").tag(z) }
                }
            }
            Section("Updates") {
                Toggle("Check for updates by itself", isOn: Binding(get: { updates.automatic }, set: { updates.setAutomatic($0) }))
                    .disabled(!updates.canCheck)
                HStack {
                    Text(updates.said).font(.callout).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                    Spacer()
                    Button("Check Now") { updates.check() }.disabled(!updates.canCheck)
                }
            }
            Section {
                LabeledContent(Words.about, value: Words.version(
                    Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1",
                    Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1"))
            }
        }
        .formStyle(.grouped)
        .onAppear { atLogin = model.opensAtLogin }
    }
}

/// The quick panel's keys: shown, changed by pressing new ones, or turned off. Option+Space until changed.
private struct ShortcutSettings: View {
    @State private var hotKey = HotKey.shared
    @State private var recording = false
    @State private var monitor: Any?
    @State private var refused: String?

    var body: some View {
        Form {
            Section {
                LabeledContent("Open the quick panel") {
                    HStack(spacing: Space.s2) {
                        Button(recording ? "Press the keys…" : (hotKey.shortcut?.said ?? "Off")) { recording ? stop() : record() }
                            .frame(minWidth: 140)
                        if hotKey.shortcut != nil, !recording {
                            Button("Turn Off") { hotKey.set(nil) }
                        }
                    }
                }
                Text(line).font(.callout).foregroundStyle(hotKey.state == .taken ? Palette.red : .secondary)
                    .fixedSize(horizontal: false, vertical: true)
                if hotKey.shortcut != .optionSpace {
                    Button("Use ⌥Space") { hotKey.set(.optionSpace) }
                }
            }
            Section("In the panel") {
                LabeledContent("Add what you told", value: "↩")
                LabeledContent("A new line", value: "⇧↩")
                LabeledContent("Ask about it in the window", value: "⌘↩")
                LabeledContent("Tell or Search", value: "Tab")
                LabeledContent("Close", value: "Esc")
            }
        }
        .formStyle(.grouped)
        .onDisappear { stop() }
    }

    private var line: String {
        if let refused { return refused }
        if recording { return "Press the new keys with ⌘, ⌥ or ⌃. Esc stops without changing them, Delete turns the shortcut off." }
        switch hotKey.state {
        case .on: return "Press \(hotKey.shortcut?.said ?? "") in any app to tell BrainDog something or find a place, without leaving what you are in."
        case .taken: return "Another app already uses \(hotKey.shortcut?.said ?? "these keys"), so BrainDog does not. Choose other keys."
        case .off: return "Off. The quick panel still opens from the File menu and the menu bar."
        }
    }

    private func record() {
        refused = nil
        recording = true
        hotKey.pause()
        monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { event in
            switch Int(event.keyCode) {
            case 53: /* Esc: no change */
                stop()
            case 51, 117: /* Delete: off */
                hotKey.set(nil)
                stop(resume: false)
            default:
                if let next = Shortcut(event: event) {
                    hotKey.set(next)
                    stop(resume: false)
                } else {
                    refused = "That needs ⌘, ⌥ or ⌃ with it, so it does not take a key you type with."
                }
            }
            return nil
        }
    }

    private func stop(resume: Bool = true) {
        if let monitor { NSEvent.removeMonitor(monitor) }
        monitor = nil
        if recording && resume { hotKey.resume() }
        recording = false
    }
}

private struct SigningInSettings: View {
    @State private var model = MacModel.shared
    @State private var session = Session.shared

    var body: some View {
        Form {
            if session.signedIn {
                Section {
                    LabeledContent("Name", value: model.boot?.me?.name ?? "")
                    LabeledContent("BrainDog", value: model.boot?.record?.name ?? "")
                    LabeledContent("Role", value: model.boot?.level.word ?? "")
                }
                Section {
                    Text("This Mac stays signed in until you sign out here. Passkeys and the other places you are signed in are in BrainDog's own Settings.")
                        .font(.callout).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                    HStack {
                        Button("Passkeys and Devices…") { model.go("/settings/signing-in") }
                        Spacer()
                        Button(Words.signOut) { Task { await session.signOut() } }
                    }
                }
            } else {
                Section {
                    Text("Not signed in. Sign in in the BrainDog window.").foregroundStyle(.secondary)
                    Button("Open BrainDog") { model.front() }
                }
            }
        }
        .formStyle(.grouped)
    }
}
