import AppIntents
import Foundation

/// What an intent asks the app it runs in to show: Tell with words in it, or a place. Each app sets these at launch
/// (iPhone: `AppModel`; Mac: `MacModel`); until then nothing happens.
@MainActor
enum AppDoor {
    static var tell: (String) -> Void = { _ in }
    static var open: (String) -> Void = { _ in }
}

/// Opens BrainDog in Tell, with words in it when there are some.
struct OpenTellIntent: AppIntent {
    static let title: LocalizedStringResource = "Open Tell"
    static let description = IntentDescription("Open BrainDog ready to tell it something.")
    static let openAppWhenRun = true

    @Parameter(title: "Words", default: "")
    var words: String

    init() {}
    init(words: String) { self.words = words }

    @MainActor
    func perform() async throws -> some IntentResult {
        AppDoor.tell(words)
        return .result()
    }
}
