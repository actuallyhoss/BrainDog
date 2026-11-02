import SwiftUI
import WidgetKit

/// BrainDog's widgets (plan 3.10, M5). Empty in M0: one Tell button so the extension has something to show, drawn
/// plainly on the tile colour. Needs you, Due next and the Today widgets come with the `glance` read.
@main
struct BrainDogWidgets: WidgetBundle {
    var body: some Widget {
        TellButton()
    }
}

struct TellButton: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "tell", provider: Still()) { _ in
            Text("Tell BrainDog")
                .font(.headline)
                .containerBackground(.fill.tertiary, for: .widget)
                .widgetURL(URL(string: "braindog://tell"))
        }
        .configurationDisplayName("Tell BrainDog")
        .description("Say one thing, and BrainDog keeps it in the right place.")
        .supportedFamilies([.systemSmall])
    }
}

struct Still: TimelineProvider {
    struct Entry: TimelineEntry { let date: Date }
    func placeholder(in context: Context) -> Entry { Entry(date: .now) }
    func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) { completion(Entry(date: .now)) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        completion(Timeline(entries: [Entry(date: .now)], policy: .never))
    }
}
