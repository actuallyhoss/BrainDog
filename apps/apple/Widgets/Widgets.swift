import AppIntents
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
        DueWidget()
        TodayNumberWidget()
        TellButton()
        #if os(iOS)
        TellControl()
        #endif
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

// MARK: - Due next (M5)

struct DueWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "due", provider: GlanceProvider()) { entry in
            DueWidgetView(entry: entry)
        }
        .configurationDisplayName(Words.dueNext)
        .description("What is due next on Today, in your words.")
        .supportedFamilies(Self.families)
    }

    static var families: [WidgetFamily] {
        #if os(iOS)
        [.systemSmall, .systemMedium, .accessoryRectangular]
        #else
        [.systemSmall, .systemMedium]
        #endif
    }
}

struct DueWidgetView: View {
    let entry: GlanceEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        DueGlance(entry.glance, size: family.glance)
            .onTile()
            .widgetURL(GlanceLink.today)
    }
}

// MARK: - A number from Today, picked (M5)

/// One of Today's numbers, as the widget's settings offer them: the Home figures the record leads Today with.
struct FigureEntity: AppEntity {
    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Number"
    static let defaultQuery = FigureQuery()

    let id: String
    let label: String

    var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(label)") }
}

/// The numbers to pick from: what the app last read of Today (the kept glance), so the list is there offline too.
struct FigureQuery: EntityQuery {
    @MainActor
    func entities(for identifiers: [FigureEntity.ID]) async throws -> [FigureEntity] {
        try await suggestedEntities().filter { identifiers.contains($0.id) }
    }

    @MainActor
    func suggestedEntities() async throws -> [FigureEntity] {
        var glance = GlanceStore.kept
        if glance == nil { glance = await GlanceStore.refresh() }
        return (glance?.figures ?? []).map { FigureEntity(id: $0.metric, label: $0.label) }
    }

    @MainActor
    func defaultResult() async -> FigureEntity? {
        try? await suggestedEntities().first
    }
}

/// The widget's settings: which number.
struct PickNumber: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "Today number"
    static let description = IntentDescription("Pick one of the numbers Today leads with.")

    @Parameter(title: "Number")
    var figure: FigureEntity?
}

nonisolated struct FigureEntry: TimelineEntry {
    let date: Date
    let glance: Glance?
    let metric: String?
}

nonisolated struct FigureProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> FigureEntry { FigureEntry(date: .now, glance: .sample, metric: nil) }

    func snapshot(for configuration: PickNumber, in context: Context) async -> FigureEntry {
        if context.isPreview { return FigureEntry(date: .now, glance: .sample, metric: configuration.figure?.id) }
        return await MainActor.run { FigureEntry(date: .now, glance: Session.shared.signedIn ? (GlanceStore.kept ?? .empty) : nil, metric: configuration.figure?.id) }
    }

    func timeline(for configuration: PickNumber, in context: Context) async -> Timeline<FigureEntry> {
        let metric = configuration.figure?.id
        let signedIn = await MainActor.run { Session.shared.signedIn }
        var glance: Glance?
        if signedIn { glance = (await GlanceStore.refresh()) ?? .empty }
        return Timeline(entries: [FigureEntry(date: .now, glance: glance, metric: metric)], policy: .after(Date().addingTimeInterval(15 * 60)))
    }
}

struct TodayNumberWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "today-number", intent: PickNumber.self, provider: FigureProvider()) { entry in
            FigureGlance(entry.glance, metric: entry.metric)
                .onTile()
                .widgetURL(GlanceLink.today)
        }
        .configurationDisplayName(Words.todayNumber)
        .description("One number from Today, the one you pick.")
        .supportedFamilies([.systemSmall])
    }
}

// MARK: - Tell in Control Center (M5)

#if os(iOS)
/// "Tell BrainDog" in Control Center, on the Lock Screen and on the Action button: opens BrainDog in Tell. It runs the
/// app's own Open Tell intent (`Shared/Open.swift`), which is compiled into both so the press lands in the app.
struct TellControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "dog.brain.tell") {
            ControlWidgetButton(action: OpenTellIntent()) {
                Label(Words.tellTitle, systemImage: "plus.bubble")
            }
        }
        .displayName("Tell BrainDog")
        .description("Open BrainDog ready to tell it something.")
    }
}
#endif
