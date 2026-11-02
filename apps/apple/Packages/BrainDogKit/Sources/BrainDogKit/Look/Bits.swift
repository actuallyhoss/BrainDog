import SwiftUI

/// An empty state (`loop/DESIGN-SYSTEM.md`, Empty): what will be here and how it gets there, with one action. A 40
/// neutral well, a 17/600 title, one line in ink-2. Never "Nothing here yet" alone.
public struct EmptyState<Action: View>: View {
    let glyph: Glyph
    let title: String
    let line: String
    let action: Action

    public init(_ glyph: Glyph, title: String, line: String, @ViewBuilder action: () -> Action = { EmptyView() }) {
        self.glyph = glyph
        self.title = title
        self.line = line
        self.action = action()
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            IconWell(glyph, size: .card)
            VStack(alignment: .leading, spacing: Space.s1) {
                Text(title).font(Typeface.heading).foregroundStyle(Palette.ink).accessibilityAddTraits(.isHeader)
                Text(line).font(Typeface.body).foregroundStyle(Palette.ink2).fixedSize(horizontal: false, vertical: true)
            }
            action
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// A row of choices in a tile-2 track, the chosen one on `--segment-on` (Segmented). Radius 8; a change is felt as `select`.
public struct Segmented<Value: Hashable>: View {
    let choices: [(Value, String)]
    @Binding var chosen: Value

    public init(_ choices: [(Value, String)], chosen: Binding<Value>) {
        self.choices = choices
        _chosen = chosen
    }

    public var body: some View {
        HStack(spacing: 2) {
            ForEach(choices, id: \.0) { value, label in
                Button {
                    guard chosen != value else { return }
                    Haptic.select.play()
                    withAnimation(.easeOut(duration: 0.12)) { chosen = value }
                } label: {
                    Text(label)
                        .font(Typeface.control)
                        .foregroundStyle(chosen == value ? Palette.ink : Palette.ink2)
                        .frame(maxWidth: .infinity, minHeight: 36)
                        .background(chosen == value ? Palette.segmentOn : .clear, in: RoundedRectangle(cornerRadius: Radius.control - 2, style: .continuous))
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(chosen == value ? .isSelected : [])
            }
        }
        .padding(2)
        .background(Palette.tile2, in: RoundedRectangle(cornerRadius: Radius.control, style: .continuous))
    }
}

/// What one press did, said at the foot of the screen for a few seconds, with Undo where it can be taken back
/// (`--toast`, radius 8, the web's toast). One at a time: a new one replaces the last.
@Observable
public final class Toasts {
    public struct Toast: Identifiable, Equatable {
        public let id = UUID()
        public let text: String
        public let undo: Bool
        public static func == (a: Toast, b: Toast) -> Bool { a.id == b.id }
    }

    public private(set) var now: Toast?
    @ObservationIgnored private var undoing: (() async -> Void)?

    public init() {}

    public func say(_ text: String, undo: (() async -> Void)? = nil) {
        let toast = Toast(text: text, undo: undo != nil)
        undoing = undo
        withAnimation(.easeOut(duration: 0.18)) { now = toast }
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(undo == nil ? 3 : 6))
            if self?.now == toast { withAnimation(.easeOut(duration: 0.18)) { self?.now = nil } }
        }
    }

    public func pressUndo() {
        let undo = undoing
        undoing = nil
        withAnimation(.easeOut(duration: 0.18)) { now = nil }
        if let undo { Task { await undo() } }
    }
}

/// The toast, drawn.
public struct ToastView: View {
    let toasts: Toasts
    public init(_ toasts: Toasts) { self.toasts = toasts }

    public var body: some View {
        if let toast = toasts.now {
            HStack(spacing: Space.s3) {
                Text(toast.text)
                    .font(Typeface.body)
                    .foregroundStyle(Palette.onToast)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                if toast.undo {
                    Button(Words.undo) { toasts.pressUndo() }
                        .font(Typeface.control)
                        .foregroundStyle(Palette.onToast)
                        .frame(minWidth: Space.tap, minHeight: Space.tap)
                }
            }
            .padding(.horizontal, Space.s4)
            .padding(.vertical, Space.s1)
            .frame(minHeight: 48)
            .background(Palette.toast, in: RoundedRectangle(cornerRadius: Radius.control, style: .continuous))
            .padding(.horizontal, Space.gutter)
            .transition(.move(edge: .bottom).combined(with: .opacity))
            .accessibilityElement(children: .contain)
            .accessibilityAddTraits(.updatesFrequently)
        }
    }
}

public extension Glyph {
    /// The web's glyph for a name a declaration or `boot` gives (`thing`, `wallet`, `heart-pulse`), or the nearest one
    /// the native set draws. The native set is the app's own glyphs; a name only the web's larger set holds is drawn by
    /// its nearest cousin here rather than by an SF Symbol.
    static func named(_ name: String?) -> Glyph {
        guard let name, !name.isEmpty else { return .rows }
        if let own = Glyph(rawValue: "glyph.\(name)") { return own }
        switch name {
        case "thing", "folder", "briefcase", "layers": return .projects
        case "milestone", "flag", "list-checks", "check-square": return .task
        case "gauge", "chart-line", "chart-pie", "chart-bar", "trending-up", "bar-chart": return .observe
        case "wallet", "piggy-bank", "banknote", "coins", "credit-card", "landmark": return .money
        case "receipt", "book", "book-open", "file", "file-text", "notebook": return .doc
        case "calendar-clock", "calendar-days": return .calendar
        case "store", "shop", "building": return .service
        case "send", "message", "message-square": return .mail
        case "user", "users", "contact": return .people
        case "sliders-horizontal", "sliders": return .settings
        case "sparkles", "wand": return .star
        default: return .rows
        }
    }
}
