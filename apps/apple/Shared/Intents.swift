import AppIntents
import BrainDogKit
import Foundation

/// What an intent asks the app it runs in to show: Tell with words in it, or a place. Each app sets these at launch
/// (iPhone: `AppModel`; Mac: `MacModel`); until then nothing happens.
@MainActor
enum AppDoor {
    static var tell: (String) -> Void = { _ in }
    static var open: (String) -> Void = { _ in }
}

/// "Tell BrainDog" (plan 3.10): Siri asks what, and the words are read on the device by the web's own reader and added
/// as Tell adds them, in one `capture`. What the reader cannot place by itself, or an entry that needs more, is not
/// guessed at: BrainDog opens in Tell with the words in it, to finish there.
struct TellBrainDogIntent: AppIntent {
    static let title: LocalizedStringResource = "Tell BrainDog"
    static let description = IntentDescription("Say one thing, and BrainDog keeps it in the right place.")

    @Parameter(title: "What to tell it", requestValueDialog: "What do you want to tell BrainDog?")
    var words: String

    static var parameterSummary: some ParameterSummary { Summary("Tell BrainDog \(\.$words)") }

    #if os(iOS)
    /// Done without opening the app, unless the words need Tell to finish (`finish`).
    static var supportedModes: IntentModes { [.background, .foreground(.dynamic)] }
    #endif

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let said = words.trimmingCharacters(in: .whitespacesAndNewlines)
        guard Session.shared.signedIn else { return .result(dialog: IntentDialog(stringLiteral: Words.signInToSee)) }
        guard !said.isEmpty else { return .result(dialog: IntentDialog(stringLiteral: Words.tellMissing)) }
        let model = TellModel(keepsDraft: false)
        await model.learnKeptThenFresh()
        model.opened(prefill: said)
        /* ONLY WHAT IS PLACED WHOLE GOES BY ITSELF: a line that went nowhere, or an entry that still needs something, opens Tell. */
        let whole = !model.lines.isEmpty && model.lines.allSatisfy { !$0.told.rows.isEmpty && $0.told.rows.allSatisfy { $0.missing.isEmpty } }
        guard model.ready, whole else {
            try await finish(said)
            return .result(dialog: IntentDialog(stringLiteral: Words.openToFinish))
        }
        await model.press()
        if let receipt = model.receipt {
            await GlanceStore.refresh()
            return .result(dialog: IntentDialog(stringLiteral: receipt.said))
        }
        try await finish(said)
        return .result(dialog: IntentDialog(stringLiteral: model.said ?? Words.openToFinish))
    }

    /// BrainDog in front, in Tell with the words in it: what Siri could not add by itself is finished there.
    @MainActor
    private func finish(_ words: String) async throws {
        #if os(iOS)
        try await continueInForeground(IntentDialog(stringLiteral: Words.openToFinish), alwaysConfirm: false)
        #endif
        AppDoor.tell(words)
    }
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

/// "What needs me" (plan 3.10): how many questions wait, and the first in the record's own words.
struct WhatNeedsMeIntent: AppIntent {
    static let title: LocalizedStringResource = "What needs me"
    static let description = IntentDescription("How many questions wait on you in BrainDog, and the first of them.")

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<Int> & ProvidesDialog {
        guard Session.shared.signedIn else { return .result(value: 0, dialog: IntentDialog(stringLiteral: Words.signInToSee)) }
        do {
            let glance = try await Calls.glance()
            Kept.save(glance, as: "glance")
            return .result(value: glance.waiting, dialog: IntentDialog(stringLiteral: Words.whatNeedsMe(glance.waiting, first: glance.questions.first?.question)))
        } catch {
            if let kept = GlanceStore.kept {
                let line = Words.whatNeedsMe(kept.waiting, first: kept.questions.first?.question)
                return .result(value: kept.waiting, dialog: IntentDialog(stringLiteral: "\(Words.offlineSince(Said.time(kept.readAt))) \(line)"))
            }
            return .result(value: 0, dialog: IntentDialog(stringLiteral: Words.failure(error as? CallFailure ?? .offline)))
        }
    }
}

/// Opens Needs you.
struct OpenNeedsIntent: AppIntent {
    static let title: LocalizedStringResource = "Open Needs you"
    static let description = IntentDescription("Open BrainDog on the questions waiting on you.")
    static let openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        AppDoor.open("/decide")
        return .result()
    }
}

/// The phrases Siri and Spotlight know without setting anything up.
struct BrainDogShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: TellBrainDogIntent(),
            phrases: ["Tell \(.applicationName)", "Tell \(.applicationName) something", "Add to \(.applicationName)"],
            shortTitle: "Tell BrainDog",
            systemImageName: "plus.bubble"
        )
        AppShortcut(
            intent: WhatNeedsMeIntent(),
            phrases: ["What needs me in \(.applicationName)", "What does \(.applicationName) need from me", "Ask \(.applicationName) what needs me"],
            shortTitle: "What needs me",
            systemImageName: "tray"
        )
        AppShortcut(
            intent: OpenNeedsIntent(),
            phrases: ["Open Needs you in \(.applicationName)"],
            shortTitle: "Needs you",
            systemImageName: "tray.full"
        )
    }
}
