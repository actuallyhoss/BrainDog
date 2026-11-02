import BrainDogKit
import SwiftUI

/// BrainDog for Mac (plan 3.4, M6). In M1: one window with native Sign in, then the web desk in native mode, with the
/// title bar hidden and the traffic lights over the web's top bar (inset 78). Menus, the menu bar and the ⌥Space panel
/// arrive in M6.
@main
struct BrainDogMac: App {
    @State private var session = Session.shared
    @State private var desk = WebScreen(kind: .mac, path: "/")

    init() {
        Typeface.register()
    }

    var body: some Scene {
        WindowGroup("BrainDog") {
            ZStack {
                if session.signedIn {
                    WebView(desk).ignoresSafeArea()
                } else {
                    SignInView().frame(minWidth: 480, minHeight: 560)
                }
            }
            .frame(minWidth: 900, minHeight: 600)
            .background(Palette.board)
            .animation(.easeOut(duration: 0.2), value: session.signedIn)
            .onOpenURL { url in
                if url.path == "/signin" { Task { await SignInFlow.shared.open(link: url) } }
            }
            .task { await session.refreshIfDue() }
        }
        .windowStyle(.hiddenTitleBar)
        .defaultSize(width: 1440, height: 900)
        .commands {
            CommandGroup(after: .toolbar) {
                Button("Reload") { desk.reload() }.keyboardShortcut("r")
            }
            CommandMenu("Go") {
                Button("Today") { desk.go("/") }.keyboardShortcut("1")
                Button("Needs you") { desk.go("/decide") }.keyboardShortcut("2")
                Button("Search or go to…") { desk.emit("search") }.keyboardShortcut("k")
                Button("Ask") { desk.emit("slash") }.keyboardShortcut("j")
            }
            CommandGroup(after: .appInfo) {
                if session.signedIn {
                    Button(Words.signOut) { Task { await session.signOut() } }
                }
            }
        }
    }
}
