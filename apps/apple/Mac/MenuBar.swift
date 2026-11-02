import BrainDogKit
import SwiftUI

/// The menu bar's mark: the Needs you glyph, and the count beside it when something waits (plan M6, Native extras).
struct MenuBarLabel: View {
    let count: Int

    var body: some View {
        HStack(spacing: 3) {
            if let image = Glyph.decide.templateImage(side: 16) { Image(nsImage: image) }
            if count > 0 { Text(count.formatted()).monospacedDigit() }
        }
        .accessibilityLabel(count > 0 ? Words.waitCount(count) : Words.nothingWaits)
    }
}

/// What the menu bar opens: the first questions waiting (each a press to its card), Tell, and the window.
struct MenuBarPanel: View {
    @State private var model = MacModel.shared
    @State private var session = Session.shared

    var body: some View {
        VStack(alignment: .leading, spacing: Space.s3) {
            HStack(spacing: Space.s2) {
                Text(Words.needsYou).font(Typeface.tileHeading).foregroundStyle(Palette.ink)
                if model.count > 0 {
                    Text(model.count.formatted()).font(Typeface.tileHeading).foregroundStyle(Palette.red).monospacedDigit()
                }
                Spacer(minLength: 0)
                if let glance = model.glance, glance.readAt > .distantPast {
                    Text(Words.readAt(Said.time(glance.readAt))).font(Typeface.caption).foregroundStyle(Palette.ink3)
                }
            }

            if !session.signedIn {
                Text(Words.signInToSee).font(Typeface.meta).foregroundStyle(Palette.ink3)
            } else if let questions = model.glance?.questions, !questions.isEmpty {
                VStack(spacing: 0) {
                    ForEach(Array(questions.prefix(3).enumerated()), id: \.element.id) { i, q in
                        Button { model.go(q.path) } label: {
                            Text(q.question).font(Typeface.body).foregroundStyle(Palette.ink).lineLimit(2)
                                .multilineTextAlignment(.leading)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.vertical, Space.s2)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        if i < min(3, questions.count) - 1 { Hairline() }
                    }
                }
            } else {
                Text(Words.nothingWaits).font(Typeface.meta).foregroundStyle(Palette.ink3)
            }

            Hairline()

            HStack(spacing: Space.s2) {
                if session.signedIn, model.boot?.level.adds ?? true {
                    Button { model.openTell() } label: { Text(Words.tellLine) }
                        .buttonStyle(BDButtonStyle(.quiet, onTile: true, full: false))
                        .fixedSize()
                }
                Spacer(minLength: 0)
                Button(Words.openBrainDog) { model.go(model.count > 0 ? "/decide" : "/") }
                    .buttonStyle(BDButtonStyle(.ink, full: false))
                    .fixedSize()
            }
        }
        .padding(Space.s4)
        .frame(width: 340)
        .background(Palette.tile)
        .task { await model.read() }
    }
}

/// Tell in its own small window (⌘T, the menu bar, Siri): the same composer as on the iPhone, Ask handing the words to
/// the desk's own Ask.
struct TellWindow: View {
    @State private var model = MacModel.shared
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        TellSheet(model: model.tell, done: { dismiss() })
            .frame(width: 520)
            .frame(minHeight: 320)
            .background(Palette.tile)
            .onAppear {
                model.tell.onAsk = { q in
                    dismiss()
                    model.go("/")
                    model.desk.emit("slash", q)
                }
                model.tell.onChanged = { model.desk.emit("refresh"); Task { await model.read() } }
            }
    }
}
