import AppKit
import BrainDogKit
import SwiftUI

/// Offline on the Mac, as on the iPhone (plan 3.8): read-only, nothing waits to be sent.
///
/// THE KEPT COPY IS THE WEB'S. The page keeps its shell and a 7-day read copy itself (the service worker and the IndexedDB
/// copy in `lib/data/offline.ts`), and WKWebView on the Mac runs both on the app's own origin with no App-Bound Domains to
/// ask for, so a page that was kept opens offline and says so in its own words. Only a first load that reached nothing and
/// had nothing kept lands here: said plainly, with Try again, never WebKit's error page.
struct MacOffline: View {
    let retry: () -> Void

    var body: some View {
        VStack {
            Spacer().frame(height: MacBar.height + Space.s6)
            EmptyState(.alert, title: Words.offlineTitle, line: Words.offlinePage) {
                HStack(spacing: Space.s2) {
                    Button(Words.tryAgain, action: retry)
                        .buttonStyle(BDButtonStyle(.ink, full: false))
                        .keyboardShortcut("r")
                        .fixedSize()
                    if let glance = MacModel.shared.glance, glance.readAt > .distantPast {
                        Text(Words.offlineSince(Said.time(glance.readAt))).font(Typeface.meta).foregroundStyle(Palette.ink3)
                    }
                }
            }
            .padding(Space.s6)
            .frame(maxWidth: 520)
            .card()
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Ground())
    }
}

/// Today as it was last drawn, kept in the app's caches and put over the page at launch until the page says it has drawn
/// (`ready()`), so a cold start shows the desk at once and not an empty board. Gone on sign-out with everything else.
enum LaunchPicture {
    private static var file: URL {
        let folder = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("Kept", isDirectory: true)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return folder.appendingPathComponent("launch-mac.png")
    }

    static var kept: NSImage? {
        get { Session.shared.signedIn ? NSImage(contentsOf: file) : nil }
        set {
            guard let newValue, let tiff = newValue.tiffRepresentation, let png = NSBitmapImageRep(data: tiff)?.representation(using: .png, properties: [:]) else {
                try? FileManager.default.removeItem(at: file)
                return
            }
            try? png.write(to: file, options: .atomic)
        }
    }
}

/// The last picture over the page until it has drawn, top-aligned at the width it was taken, then faded out in 120 ms.
struct LaunchCover: View {
    let screen: WebScreen

    var body: some View {
        if !screen.ready, let cover = screen.cover {
            GeometryReader { box in
                Image(nsImage: cover)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: box.size.width, height: box.size.width * cover.size.height / max(cover.size.width, 1), alignment: .top)
                    .frame(width: box.size.width, height: box.size.height, alignment: .top)
                    .clipped()
            }
            .allowsHitTesting(false)
            .transition(.opacity)
        }
    }
}
