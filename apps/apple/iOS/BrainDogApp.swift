import BrainDogKit
import SwiftUI

/// BrainDog for iPhone (plan 3.3). In M1: native Sign in, then the web app's Today in native mode under an opaque
/// Lexend bar. The tabs, the stacks and the native moments arrive in M2 and M3.
@main
struct BrainDogApp: App {
    @Environment(\.scenePhase) private var phase

    init() {
        Typeface.register()
        Bars.dress()
    }

    var body: some Scene {
        WindowGroup {
            Root()
                .onOpenURL { url in Task { await Links.open(url) } }
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                    if let url = activity.webpageURL { Task { await Links.open(url) } }
                }
        }
        .onChange(of: phase) { _, now in
            if now == .active { Task { await Session.shared.refreshIfDue() } }
        }
    }
}

/// Signed in, the app; signed out, Sign in. A 401 anywhere flips it back, and the web's sign-in page never shows.
struct Root: View {
    @State private var session = Session.shared

    var body: some View {
        ZStack {
            if session.signedIn {
                Signed()
                    .transition(.opacity)
            } else {
                SignInView()
                    .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.2), value: session.signedIn)
        .tint(Palette.red)
    }
}

/// The signed-in app, for M1: Today, from the web, in native mode.
struct Signed: View {
    @State private var today = WebScreen(kind: .ios, path: "/")
    @State private var account = false

    var body: some View {
        NavigationStack {
            WebView(today)
                .ignoresSafeArea(.container, edges: .bottom)
                .navigationTitle(today.title ?? "Today")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { account = true } label: {
                            Glyph.people.image.resizable().frame(width: 22, height: 22).foregroundStyle(Palette.ink2)
                        }
                        .accessibilityLabel(Words.account)
                    }
                }
        }
        .sheet(isPresented: $account) { AccountSheet() }
        .onAppear { Links.today = today }
    }
}

/// The face's sheet, for M1: who is signed in here, and Sign out. The BrainDogs and their roles come in M2.
struct AccountSheet: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s4) {
            Text(Words.account).font(Typeface.heading).foregroundStyle(Palette.ink)
            Text(Session.deviceLabel).font(Typeface.meta).foregroundStyle(Palette.ink3)
            Button(Words.signOut) {
                Task {
                    dismiss()
                    await Session.shared.signOut()
                }
            }
            .buttonStyle(.quietOnTile)
            Spacer(minLength: 0)
        }
        .padding(Space.s5)
        .presentationDetents([.height(220)])
        .presentationBackground(Palette.tile)
        .presentationCornerRadius(Radius.tile)
        .presentationDragIndicator(.visible)
    }
}

/// Where a universal link or a `braindog://` address goes.
@MainActor
enum Links {
    static weak var today: WebScreen?

    static func open(_ url: URL) async {
        if url.scheme == "https", url.path == "/signin" {
            await SignInFlow.shared.open(link: url)
            return
        }
        /* `braindog://open?path=/money` and a universal link to a page: the page, in the app, once signed in. */
        let path: String? = url.scheme == "braindog"
            ? URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "path" })?.value
            : url.path
        if let path, path.hasPrefix("/"), !path.hasPrefix("//") { today?.go(path) }
    }
}

/// The navigation bar as Look B draws it (plan 3.3): opaque `--nav`, a `--rule` hairline, no scroll-edge blur, the title
/// in Lexend 600 at 22, and no glass on its buttons.
enum Bars {
    static func dress() {
        let bar = UINavigationBarAppearance()
        bar.configureWithOpaqueBackground()
        bar.backgroundColor = PlatformPalette.nav
        bar.shadowColor = PlatformPalette.rule
        bar.titleTextAttributes = [.font: Typeface.navTitleFont(), .foregroundColor: PlatformPalette.ink]
        bar.largeTitleTextAttributes = [.foregroundColor: PlatformPalette.ink]
        let nav = UINavigationBar.appearance()
        nav.standardAppearance = bar
        nav.scrollEdgeAppearance = bar
        nav.compactAppearance = bar
        nav.compactScrollEdgeAppearance = bar
    }
}
