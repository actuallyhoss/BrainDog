import BrainDogKit
import SwiftUI

/// The app's own Settings window (⌘,): what belongs to this Mac (opening at login, the menu bar, text size) and who is
/// signed in. Everything about the BrainDog itself is its Settings in the app, one press away.
struct SettingsView: View {
    @State private var model = MacModel.shared
    @State private var session = Session.shared
    @State private var atLogin = MacModel.shared.opensAtLogin

    var body: some View {
        Form {
            Section("This Mac") {
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
            Section("Signed in") {
                if session.signedIn {
                    LabeledContent("Name", value: model.boot?.me?.name ?? "—")
                    LabeledContent("BrainDog", value: model.boot?.record?.name ?? "—")
                    LabeledContent("Role", value: model.boot?.level.word ?? "—")
                    HStack {
                        Button("Settings in BrainDog") { model.go("/settings") }
                        Spacer()
                        Button(Words.signOut) { Task { await session.signOut() } }
                    }
                } else {
                    Text("Not signed in. Sign in in the BrainDog window.").foregroundStyle(.secondary)
                }
            }
            Section {
                LabeledContent(Words.about, value: Words.version(
                    Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1",
                    Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1"))
            }
        }
        .formStyle(.grouped)
        .frame(width: 460)
        .fixedSize(horizontal: false, vertical: true)
        .onAppear { atLogin = model.opensAtLogin }
    }
}
