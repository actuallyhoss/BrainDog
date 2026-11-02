import BrainDogKit
import SwiftUI
import WidgetKit

/// BrainDog's widgets (plan 3.10, M5), one extension for the iPhone and the Mac: Needs you (the count and the first
/// questions), Today's key numbers (the Home figures), and Tell. All plain: the tile's colour, a Lexend figure, Geist
/// words, red only for the count and a figure that misses its target. Each reads the glance the app kept in the App
/// Group, and reads it again from the record itself when its timeline is asked for.
@main
struct BrainDogWidgets: WidgetBundle {
    init() {
        Typeface.register()
    }

    var body: some Widget {
        NeedsWidget()
        NumbersWidget()
        TellButton()
    }
}

// MARK: - the timeline

nonisolated struct GlanceEntry: TimelineEntry {
    let date: Date
    /// Nil signed out.
    let glance: Glance?
}

/// Every widget's timeline: the glance read now (or the one kept, offline), drawn until the next read in 15 minutes.
/// The app asks every widget to draw again whenever what it read has changed (`GlanceStore.refresh`).
nonisolated struct GlanceProvider: TimelineProvider {
    func placeholder(in context: Context) -> GlanceEntry { GlanceEntry(date: .now, glance: .sample) }

    func getSnapshot(in context: Context, completion: @escaping @Sendable (GlanceEntry) -> Void) {
        if context.isPreview {
            completion(GlanceEntry(date: .now, glance: .sample))
            return
        }
        Task { @MainActor in
            completion(GlanceEntry(date: .now, glance: Session.shared.signedIn ? (GlanceStore.kept ?? .empty) : nil))
        }
    }

    func getTimeline(in context: Context, completion: @escaping @Sendable (Timeline<GlanceEntry>) -> Void) {
        Task { @MainActor in
            let glance = Session.shared.signedIn ? ((await GlanceStore.refresh()) ?? .empty) : nil
            let next = Date().addingTimeInterval(15 * 60)
            completion(Timeline(entries: [GlanceEntry(date: .now, glance: glance)], policy: .after(next)))
        }
    }
}

/// The widget's ground: the tile, light or dark by itself.
private extension View {
    func onTile() -> some View {
        containerBackground(for: .widget) { Palette.tile }
    }
}

// MARK: - Needs you

struct NeedsWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "needs", provider: GlanceProvider()) { entry in
            NeedsWidgetView(entry: entry)
        }
        .configurationDisplayName(Words.needsYou)
        .description("How many questions wait on you, and the first of them.")
        .supportedFamilies(Self.families)
    }

    static var families: [WidgetFamily] {
        #if os(iOS)
        [.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular]
        #else
        [.systemSmall, .systemMedium]
        #endif
    }
}

struct NeedsWidgetView: View {
    let entry: GlanceEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        NeedsGlance(entry.glance, size: family.glance)
            .onTile()
            .widgetURL(GlanceLink.needs)
    }
}

// MARK: - Today's key numbers

struct NumbersWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "numbers", provider: GlanceProvider()) { entry in
            NumbersWidgetView(entry: entry)
        }
        .configurationDisplayName(Words.keyNumbers)
        .description("The numbers Today leads with.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct NumbersWidgetView: View {
    let entry: GlanceEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        NumbersGlance(entry.glance, size: family.glance)
            .onTile()
            .widgetURL(GlanceLink.today)
    }
}

// MARK: - Tell

struct TellButton: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "tell", provider: GlanceProvider()) { _ in
            TellWidgetView()
        }
        .configurationDisplayName(Words.tellTitle)
        .description("Say one thing, and BrainDog keeps it in the right place.")
        .supportedFamilies(Self.families)
    }

    static var families: [WidgetFamily] {
        #if os(iOS)
        [.systemSmall, .accessoryCircular]
        #else
        [.systemSmall]
        #endif
    }
}

struct TellWidgetView: View {
    @Environment(\.widgetFamily) private var family

    var body: some View {
        TellGlance(size: family.glance)
            .onTile()
            .widgetURL(GlanceLink.tell)
    }
}

private extension WidgetFamily {
    var glance: GlanceSize {
        switch self {
        case .systemMedium, .systemLarge, .systemExtraLarge: .medium
        #if os(iOS)
        case .accessoryCircular: .circular
        case .accessoryRectangular, .accessoryInline: .rectangular
        #endif
        default: .small
        }
    }
}
