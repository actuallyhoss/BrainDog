import BrainDogKit
import SafariServices
import SwiftUI

/// The tab bar (plan 3.3, Tabs): his first four places as the web orders them (`places`, "his five win"), Needs you with
/// its count, and Search or go to as the search tab. The Liquid Glass bar is the only glass in the app. Tell lives in the
/// bar's own accessory, for anybody who may add.
struct Shell: View {
    @State private var app = AppModel.shared

    var body: some View {
        TabView(selection: $app.selected) {
            ForEach(app.places) { place in
                Tab(value: place.href) {
                    if let stack = app.stack(place.href) { StackView(stack: stack) }
                } label: {
                    Label { Text(place.label) } icon: { Glyph.named(place.icon).tabImage }
                }
                .badge(place.native ? app.badge : 0)
            }
            Tab(value: "search", role: .search) {
                SearchTab()
            } label: {
                Label { Text(Words.searchTab) } icon: { Glyph.search.tabImage }
            }
        }
        .tabBarMinimizeBehavior(.onScrollDown)
        .modifier(TellAccessory(on: app.canTell) { app.openTell() })
        .sensoryFeedback(.selection, trigger: app.selected)
        .sheet(isPresented: $app.tellOpen) {
            TellSheet(model: app.tell)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $app.accountOpen) {
            AccountSheet()
        }
        .sheet(item: $app.sharing) { sharing in
            ShareSheet(items: sharing.items).presentationDetents([.medium, .large]).ignoresSafeArea()
        }
        .fullScreenCover(item: $app.outside) { outside in
            Browser(url: outside.url).ignoresSafeArea()
        }
        #if DEBUG
        .fullScreenCover(item: $app.gallery) { GalleryView(gallery: $0) }
        #endif
        .task {
            await app.load()
            QuickActions.runLaunched()
        }
        /* HANDOFF: the page in front, made current whenever the tab, the stack or the page's name changes (M5). */
        .onChange(of: handoffKey, initial: true) { _, _ in
            let front = app.inFront
            Handoff.advertise(path: front.flatMap { $0.path.hasPrefix("/") ? $0.path : nil }, title: front?.title)
        }
    }

    private var handoffKey: String {
        "\(app.selected)|\(app.current?.path.count ?? 0)|\(app.current?.top?.title ?? "")"
    }
}

/// Tell in the tab bar's accessory, only for somebody who may add: for anybody else the control is absent, not disabled.
struct TellAccessory: ViewModifier {
    let on: Bool
    let open: () -> Void

    func body(content: Content) -> some View {
        if on {
            content.tabViewBottomAccessory { TellLine(open: open) }
        } else {
            content
        }
    }
}

/// The accessory's one line: "Tell BrainDog…", a press that opens the Tell sheet.
struct TellLine: View {
    let open: () -> Void

    var body: some View {
        Button {
            Haptic.press.play()
            open()
        } label: {
            HStack(spacing: Space.s2) {
                Glyph.plus.image.resizable().frame(width: 18, height: 18).accessibilityHidden(true)
                Text(Words.tellLine).font(Typeface.control)
                Spacer(minLength: 0)
            }
            .foregroundStyle(Palette.ink2)
            .padding(.horizontal, Space.s4)
            .frame(maxHeight: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Words.tellLine)
    }
}

/// One tab's stack: its root (the web, or Needs you natively), then a web view per pushed screen.
struct StackView: View {
    @Bindable var stack: Stack
    @State private var app = AppModel.shared

    var body: some View {
        NavigationStack(path: $stack.path) {
            rootView
                .navigationDestination(for: Screen.self) { screen in
                    switch screen {
                    case .web(let pushed): WebPage(screen: pushed.screen, root: false, stack: stack)
                    case .settings: SettingsRoot(stack: stack)
                    }
                }
        }
    }

    @ViewBuilder private var rootView: some View {
        if let root = stack.root {
            WebPage(screen: root, root: true, stack: stack)
        } else {
            NeedsView(model: app.needs, tell: app.canTell ? { app.openTell() } : nil)
                .navigationTitle(stack.place.label)
                .modifier(ScreenBar(root: true, title: stack.place.label))
                .toolbar { RootTools(stack: stack) }
        }
    }
}

/// A web screen in a stack, under the native bar with the page's own name, offline said in place of the page.
struct WebPage: View {
    let screen: WebScreen
    let root: Bool
    let stack: Stack

    var body: some View {
        WebView(screen)
            .ignoresSafeArea(.container, edges: .bottom)
            .overlay {
                if screen.offline { Offline { screen.reload() } }
            }
            .navigationTitle(screen.title ?? (root ? stack.place.label : ""))
            .modifier(ScreenBar(root: root, title: screen.title ?? (root ? stack.place.label : "")))
            .toolbar {
                if root { RootTools(stack: stack) }
            }
    }
}

/// A screen's bar, as the web's phone bar draws it (plan 3.3): the page's name on the leading side at 22/600, and on a
/// pushed screen the way back before it, with no glass round the back. The system's own back wears a glass circle on
/// iOS 26 and drops the name to a second row, and an inline-large name collapses to the centre as the page scrolls, so
/// both are drawn here and the system's title is left empty. The edge swipe back is kept (`SwipeBack`).
struct ScreenBar: ViewModifier {
    let root: Bool
    let title: String
    @Environment(\.dismiss) private var dismiss

    func body(content: Content) -> some View {
        let bar = content
            .toolbarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    HStack(spacing: Space.s1) {
                        if !root {
                            Button {
                                dismiss()
                            } label: {
                                Glyph.back.image.resizable().frame(width: 22, height: 22).foregroundStyle(Palette.ink2)
                                    .frame(width: Space.tap, height: Space.tap)
                                    .contentShape(Rectangle())
                            }
                            .accessibilityLabel(Words.back)
                        }
                        Text(title)
                            .font(Typeface.figure)
                            .tracking(Typeface.tight(22))
                            .foregroundStyle(Palette.ink)
                            .lineLimit(1)
                            .truncationMode(.tail)
                            .frame(maxWidth: root ? 230 : 250, alignment: .leading)
                            .fixedSize(horizontal: true, vertical: false)
                            .padding(.leading, root ? Space.s1 : 0)
                            .accessibilityAddTraits(.isHeader)
                    }
                    .id(title)
                }
                .sharedBackgroundVisibility(.hidden)
                ToolbarItem(placement: .principal) { Color.clear.frame(width: 1, height: 1).accessibilityHidden(true) }
            }
        if root {
            bar
        } else {
            bar.navigationBarBackButtonHidden(true).background(SwipeBack())
        }
    }
}

/// The system's edge swipe back, kept on a screen whose back button is the app's own: UIKit turns it off when the back
/// button is hidden, and this hands it a delegate that allows it whenever there is a screen to go back to.
struct SwipeBack: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> Finder { Finder() }
    func updateUIViewController(_ controller: Finder, context: Context) {}

    final class Finder: UIViewController, UIGestureRecognizerDelegate {
        override func didMove(toParent parent: UIViewController?) {
            super.didMove(toParent: parent)
            navigationController?.interactivePopGestureRecognizer?.delegate = self
            navigationController?.interactivePopGestureRecognizer?.isEnabled = true
        }

        override func viewDidAppear(_ animated: Bool) {
            super.viewDidAppear(animated)
            navigationController?.interactivePopGestureRecognizer?.delegate = self
            navigationController?.interactivePopGestureRecognizer?.isEnabled = true
        }

        func gestureRecognizerShouldBegin(_ gesture: UIGestureRecognizer) -> Bool {
            (navigationController?.viewControllers.count ?? 0) > 1
        }

        func gestureRecognizer(_ gesture: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
            false
        }
    }
}

/// A root's bar: the bell (Activity) and the face (the Account sheet), together in the system's glass capsule, as the
/// ops page keeps its controls in one glass cluster at the top right.
struct RootTools: ToolbarContent {
    let stack: Stack
    @State private var app = AppModel.shared

    var body: some ToolbarContent {
        ToolbarItemGroup(placement: .topBarTrailing) {
            Button {
                app.push("/audit", on: stack)
            } label: {
                Glyph.bell.image.resizable().frame(width: 22, height: 22).foregroundStyle(Palette.ink2)
            }
            .accessibilityLabel(Words.activity)
            Button {
                app.accountOpen = true
            } label: {
                Face(app.boot?.me?.name ?? app.boot?.record?.name ?? "B", side: 30)
            }
            .accessibilityLabel(Words.account)
        }
    }
}

/// A page that could not be reached and was not kept: said, with Try again, never an error page.
struct Offline: View {
    let retry: () -> Void

    var body: some View {
        VStack {
            EmptyState(.alert, title: Words.offlineTitle, line: Words.offlinePage) {
                Button(Words.tryAgain) {
                    Haptic.press.play()
                    retry()
                }
                .buttonStyle(BDButtonStyle(.quiet, onTile: true, full: false))
            }
            .padding(Space.s4)
            .card()
            .padding(Space.gutter)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Ground())
    }
}

/// The system share sheet, for a link the page shares or a file it handed over.
struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

/// An address outside BrainDog, in the in-app browser (plan 3.2), with the app's ink for its controls.
struct Browser: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> SFSafariViewController {
        let safari = SFSafariViewController(url: url)
        safari.preferredControlTintColor = PlatformPalette.ink
        safari.preferredBarTintColor = PlatformPalette.nav
        safari.dismissButtonStyle = .close
        return safari
    }
    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}
