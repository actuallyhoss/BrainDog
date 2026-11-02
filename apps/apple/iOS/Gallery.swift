#if DEBUG
import BrainDogKit
import SwiftUI

/// A Debug build's gallery, for the screenshot walk on a simulator nobody sits at (`-braindogPress go:widgets`,
/// `go:share:…`): the widgets drawn by the very views the widget extension draws, at the Home Screen's sizes, from the
/// glance the app just read; and the share sheet's own view with what a share would bring. A Release build has none.
enum Gallery: Identifiable, Hashable {
    case widgets
    /// The second page: Due next, a picked Today number, and the Due next Lock Screen line (M5, second pass).
    case widgets2
    case share(String)
    var id: String {
        switch self {
        case .share(let s): "share:\(s)"
        case .widgets: "widgets"
        case .widgets2: "widgets2"
        }
    }
}

struct GalleryView: View {
    let gallery: Gallery
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        switch gallery {
        case .widgets: WidgetsGallery(close: { dismiss() })
        case .widgets2: WidgetsGallery(close: { dismiss() }, second: true)
        case .share(let what): ShareGallery(what: what, close: { dismiss() })
        }
    }
}

/// The widgets as the Home Screen and Lock Screen hold them: small 170, medium 364 by 170, the Lock Screen's two.
private struct WidgetsGallery: View {
    let close: () -> Void
    var second = false
    @State private var glance: Glance? = GlanceStore.kept

    var body: some View {
        ScrollView {
            if second { more } else { first }
        }
        .background(Palette.board)
        .onTapGesture(count: 2, perform: close)
        .task { glance = await GlanceStore.refresh() ?? glance }
    }

    private var more: some View {
        VStack(alignment: .leading, spacing: 22) {
            HStack(spacing: 22) {
                widget(170) { DueGlance(glance, size: .small) }
                widget(170) { FigureGlance(glance, metric: glance?.figures.dropFirst().first?.metric) }
            }
            widget(364) { DueGlance(glance, size: .medium) }
            HStack(spacing: 22) {
                widget(170) { FigureGlance(glance, metric: glance?.figures.first?.metric) }
                lock(170, 72) { DueGlance(glance, size: .rectangular) }
            }
        }
        .padding(.horizontal, 19)
        .padding(.top, 58)
    }

    private var first: some View {
            VStack(alignment: .leading, spacing: 22) {
                HStack(spacing: 22) {
                    widget(170) { NeedsGlance(glance, size: .small) }
                    widget(170) { NumbersGlance(glance, size: .small) }
                }
                widget(364) { NeedsGlance(glance, size: .medium) }
                widget(364) { NumbersGlance(glance, size: .medium) }
                HStack(spacing: 22) {
                    widget(170) { TellGlance(size: .small) }
                    VStack(spacing: 18) {
                        HStack(spacing: 18) {
                            lock(76, 76) { NeedsGlance(glance, size: .circular) }
                            lock(76, 76) { TellGlance(size: .circular) }
                        }
                        lock(170, 72) { NeedsGlance(glance, size: .rectangular) }
                    }
                }
            }
            .padding(.horizontal, 19)
            .padding(.top, 58)
    }

    private func widget<Content: View>(_ width: CGFloat, @ViewBuilder _ content: () -> Content) -> some View {
        content()
            .padding(16)
            .frame(width: width, height: 170)
            .background(Palette.tile, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(Palette.rule, lineWidth: 1))
    }

    /// A Lock Screen accessory: one ink on the system's own translucent ground, drawn here as ink on tile-2.
    private func lock<Content: View>(_ width: CGFloat, _ height: CGFloat, @ViewBuilder _ content: () -> Content) -> some View {
        content()
            .foregroundStyle(Palette.ink)
            .padding(width == height ? 0 : 8)
            .frame(width: width, height: height)
            .background(Palette.tile2, in: width == height ? AnyShape(Circle()) : AnyShape(RoundedRectangle(cornerRadius: 14, style: .continuous)))
    }
}

/// The share sheet's view over the app: words (and `|photo` for a sample receipt picture) as a share brings them.
private struct ShareGallery: View {
    let what: String
    let close: () -> Void
    @State private var model = TellModel(keepsDraft: false)

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 120)
            ShareView(model: model, signedIn: Session.shared.signedIn, close: close)
                .clipShape(UnevenRoundedRectangle(topLeadingRadius: Radius.tile, topTrailingRadius: Radius.tile, style: .continuous))
        }
        .background(Palette.ink.opacity(0.3))
        .background(Palette.board)
        .ignoresSafeArea(edges: .bottom)
        .task {
            let parts = what.components(separatedBy: "|")
            model.opened(prefill: parts.filter { $0 != "photo" }.joined(separator: "\n"))
            if parts.contains("photo") { model.attachment = Self.samplePhoto() }
            await model.learnKeptThenFresh()
        }
    }

    /// A picture standing in for a photographed receipt.
    static func samplePhoto() -> Attachment? {
        let size = CGSize(width: 600, height: 800)
        let image = UIGraphicsImageRenderer(size: size).image { ctx in
            UIColor(white: 0.93, alpha: 1).setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
            UIColor.white.setFill()
            ctx.fill(CGRect(x: 120, y: 80, width: 360, height: 640))
            let lines = ["CORNER CAFE", "", "Lunch x2      34.00", "", "TOTAL   GBP 34.00"]
            for (i, line) in lines.enumerated() {
                (line as NSString).draw(at: CGPoint(x: 150, y: 130 + i * 44), withAttributes: [.font: UIFont.monospacedSystemFont(ofSize: 22, weight: .regular), .foregroundColor: UIColor.darkGray])
            }
        }
        return image.jpegData(compressionQuality: 0.85).map { Attachment(data: $0, name: "Receipt.jpg", type: "image/jpeg") }
    }
}
#endif
